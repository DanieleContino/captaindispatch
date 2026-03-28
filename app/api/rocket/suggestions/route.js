/**
 * GET /api/rocket/suggestions
 *
 * Restituisce suggerimenti statistici basati sui run storici (no AI, solo frequenze e medie).
 *
 * Query params:
 *   weekday  (0–6, js Date.getDay() — 0=Dom, 1=Lun, …, 6=Sab)
 *
 * Tipi di suggerimento restituiti:
 *   DEPT_CALL_TIME  — orario call tipico di un dipartimento in questo giorno della settimana
 *   DEPT_DEST       — destinazione tipica di un dipartimento in questo giorno della settimana
 *   VEHICLE_HOTEL   — veicolo assegnato frequentemente a un dato hotel
 *
 * Threshold: suggerimenti visibili solo dopo MIN_TOTAL_RUNS run storici totali.
 * Soglia consistenza: >= CONSISTENCY_THRESHOLD (60%) per essere suggerito.
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { NextResponse }               from 'next/server'

const PRODUCTION_ID          = process.env.NEXT_PUBLIC_PRODUCTION_ID
const MIN_TOTAL_RUNS         = 10   // run totali minimi prima di mostrare suggerimenti
const MIN_WEEKDAY_RUNS       = 3    // run minimi in quel giorno della settimana
const CONSISTENCY_THRESHOLD  = 0.60 // 60% di consistenza minima
const VEHICLE_HOTEL_MIN      = 3    // assegnazioni minime veicolo-hotel per suggerire
const LOOKBACK_DAYS          = 90   // finestra storica in giorni

export async function GET(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!PRODUCTION_ID)   return NextResponse.json({ error: 'PRODUCTION_ID not configured' }, { status: 500 })

    const { searchParams } = new URL(req.url)
    const weekday = parseInt(searchParams.get('weekday') ?? '-1', 10)

    // ── 1. Recupera trip degli ultimi LOOKBACK_DAYS ──────────────
    const since = new Date()
    since.setDate(since.getDate() - LOOKBACK_DAYS)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, date, vehicle_id, pickup_id, dropoff_id, call_min')
      .eq('production_id', PRODUCTION_ID)
      .gte('date', sinceStr)
      .not('vehicle_id', 'is', null)
      .order('date', { ascending: false })

    if (tripsErr) return NextResponse.json({ error: tripsErr.message }, { status: 500 })
    if (!trips || trips.length === 0) {
      return NextResponse.json({ suggestions: [], sampleSize: { totalRuns: 0, weekdayRuns: 0 } })
    }

    // ── 2. Run totali (date distinte) ─────────────────────────────
    const distinctDates = [...new Set(trips.map(t => t.date))]
    const totalRuns     = distinctDates.length

    // Soglia minima: non abbastanza dati storici
    if (totalRuns < MIN_TOTAL_RUNS) {
      return NextResponse.json({
        suggestions: [],
        sampleSize:  { totalRuns, weekdayRuns: 0 },
        reason: `Not enough historical data yet (${totalRuns}/${MIN_TOTAL_RUNS} runs needed)`,
      })
    }

    // ── 3. Filtra per giorno della settimana ──────────────────────
    const weekdayTrips = weekday >= 0
      ? trips.filter(t => {
          // Forza interpretazione locale della data stringa (evita shift fuso orario)
          const [y, mo, dd] = t.date.split('-').map(Number)
          return new Date(y, mo - 1, dd).getDay() === weekday
        })
      : trips

    const weekdayDates = [...new Set(weekdayTrips.map(t => t.date))]
    const weekdayRuns  = weekdayDates.length

    const suggestions = []

    // ── 4. Suggerimenti Veicolo-Hotel ─────────────────────────────
    // Usa i trip del giorno della settimana se abbastanza dati, altrimenti tutti
    const patternsTrips = weekdayRuns >= MIN_WEEKDAY_RUNS ? weekdayTrips : trips
    const patternsTotal = weekdayRuns >= MIN_WEEKDAY_RUNS ? weekdayRuns  : totalRuns

    const vehicleHotelMap = {}
    for (const t of patternsTrips) {
      if (!t.vehicle_id || !t.pickup_id) continue
      const key = `${t.vehicle_id}||${t.pickup_id}`
      if (!vehicleHotelMap[key]) vehicleHotelMap[key] = new Set()
      vehicleHotelMap[key].add(t.date)
    }
    for (const [key, dates] of Object.entries(vehicleHotelMap)) {
      if (dates.size < VEHICLE_HOTEL_MIN) continue
      const consistency = dates.size / patternsTotal
      if (consistency < CONSISTENCY_THRESHOLD) continue
      const [vehicleId, hotelId] = key.split('||')
      suggestions.push({
        type:        'VEHICLE_HOTEL',
        vehicleId,
        hotelId,
        count:       dates.size,
        total:       patternsTotal,
        consistency: Math.round(consistency * 100),
      })
    }

    // ── 5. Suggerimenti per Dipartimento (richiede trip_passengers + crew) ──
    if (weekdayRuns >= MIN_WEEKDAY_RUNS) {
      // Recupera tutti i crew con il loro dipartimento (leggero)
      const { data: allCrew, error: crewErr } = await supabase
        .from('crew')
        .select('id, department')
        .eq('production_id', PRODUCTION_ID)

      if (!crewErr && allCrew && allCrew.length > 0) {
        const crewDeptMap = {}
        for (const c of allCrew) crewDeptMap[c.id] = c.department || null

        // Recupera i trip_passengers dei trip del giorno
        // Limita a date più recenti per contenere i tripIds
        const recentWeekdayDates = weekdayDates.slice(0, 15)
        const recentTrips        = weekdayTrips.filter(t => recentWeekdayDates.includes(t.date))
        const tripIds            = [...new Set(recentTrips.map(t => t.id))]

        if (tripIds.length > 0) {
          const { data: passengers, error: paxErr } = await supabase
            .from('trip_passengers')
            .select('trip_row_id, crew_id')
            .in('trip_row_id', tripIds)
            .eq('production_id', PRODUCTION_ID)

          if (!paxErr && passengers && passengers.length > 0) {
            // Costruisci lookup: tripId → { call_min, dropoff_id, date }
            const tripLookup = {}
            for (const t of recentTrips) tripLookup[t.id] = t

            // dept → { date → { callMins[], destIds[] } }
            const deptDateMap = {}
            for (const p of passengers) {
              const dept = crewDeptMap[p.crew_id]
              if (!dept) continue
              const trip = tripLookup[p.trip_row_id]
              if (!trip) continue
              if (!deptDateMap[dept]) deptDateMap[dept] = {}
              if (!deptDateMap[dept][trip.date]) deptDateMap[dept][trip.date] = { callMins: [], destIds: [] }
              deptDateMap[dept][trip.date].callMins.push(trip.call_min)
              deptDateMap[dept][trip.date].destIds.push(trip.dropoff_id)
            }

            for (const [dept, dateData] of Object.entries(deptDateMap)) {
              const dates      = Object.keys(dateData)
              const deptTotal  = dates.length
              if (deptTotal < MIN_WEEKDAY_RUNS) continue

              // Moda del call_min per ogni data, poi moda globale
              const callMinPerDate = dates.map(d => {
                const calls = dateData[d].callMins
                const freq  = {}
                calls.forEach(c => { freq[c] = (freq[c] || 0) + 1 })
                return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])
              })
              const callFreq = {}
              callMinPerDate.forEach(c => { callFreq[c] = (callFreq[c] || 0) + 1 })
              const [modalCallMin, callCount] = Object.entries(callFreq)
                .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
              const callConsistency = callCount / deptTotal
              if (callConsistency >= CONSISTENCY_THRESHOLD) {
                suggestions.push({
                  type:        'DEPT_CALL_TIME',
                  department:  dept,
                  callMin:     Number(modalCallMin),
                  count:       callCount,
                  total:       deptTotal,
                  consistency: Math.round(callConsistency * 100),
                })
              }

              // Moda della destinazione per ogni data, poi moda globale
              const destPerDate = dates.map(d => {
                const dests = dateData[d].destIds.filter(Boolean)
                if (!dests.length) return null
                const freq  = {}
                dests.forEach(dd => { freq[dd] = (freq[dd] || 0) + 1 })
                return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
              }).filter(Boolean)
              if (destPerDate.length >= MIN_WEEKDAY_RUNS) {
                const destFreq = {}
                destPerDate.forEach(d => { destFreq[d] = (destFreq[d] || 0) + 1 })
                const [modalDestId, destCount] = Object.entries(destFreq)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
                const destConsistency = destCount / deptTotal
                if (destConsistency >= CONSISTENCY_THRESHOLD) {
                  suggestions.push({
                    type:        'DEPT_DEST',
                    department:  dept,
                    destId:      modalDestId,
                    count:       destCount,
                    total:       deptTotal,
                    consistency: Math.round(destConsistency * 100),
                  })
                }
              }
            }
          }
        }
      }
    }

    // Ordina: maggiore consistenza prima, poi per tipo
    const TYPE_ORDER = { DEPT_CALL_TIME: 0, DEPT_DEST: 1, VEHICLE_HOTEL: 2 }
    suggestions.sort((a, b) =>
      (b.consistency || 0) - (a.consistency || 0) ||
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
    )

    return NextResponse.json({
      suggestions,
      sampleSize: { totalRuns, weekdayRuns },
    })
  } catch (e) {
    console.error('[/api/rocket/suggestions]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
