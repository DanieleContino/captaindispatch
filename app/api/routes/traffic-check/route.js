/**
 * POST /api/routes/traffic-check
 *
 * Controllo traffico in tempo reale per i trip del giorno.
 * Usa Google Routes API con departureTime contestuale:
 *   - Trip BUSY (in corso): departureTime = NOW → traffico reale
 *   - Trip PLANNED (futuri): departureTime = orario pickup del trip → traffico previsto
 *
 * Per Wrap / Charter / Other: calcola anche il ritorno (dropoff → pickup).
 *
 * NON scrive su DB — tutto in memoria.
 * Auth: sessione Supabase.
 *
 * Body: { date?: "YYYY-MM-DD" }
 * Response: { alerts, date, checkedRoutes, checkedAt }
 */

import { createClient }               from '@supabase/supabase-js'
import { createSupabaseServerClient } from '../../../../lib/supabaseServer'
import { NextResponse }               from 'next/server'

const GOOGLE_KEY    = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL    = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO      = 5
const MIN_DELAY_WARN = 5    // minuti minimi perché sia un warning
const WRAP_TYPES    = ['Wrap', 'Charter', 'Other']
const SLEEP_MS      = 180   // pausa tra chiamate Google

// Vercel Pro: funzione lunga fino a 60s
export const maxDuration = 60

// ─── Utility ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')

function fmtHHMM(ms) {
  const d = new Date(ms)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Google Routes API ────────────────────────────────────────
async function googleRoutes(olat, olng, dlat, dlng, departureTimeISO) {
  if (!GOOGLE_KEY) return null
  try {
    const body = {
      origin:      { location: { latLng: { latitude: olat, longitude: olng } } },
      destination: { location: { latLng: { latitude: dlat, longitude: dlng } } },
      travelMode:               'DRIVE',
      routingPreference:        'TRAFFIC_AWARE_OPTIMAL',
      computeAlternativeRoutes: false,
      languageCode:             'en-US',
      units:                    'METRIC',
    }
    if (departureTimeISO) body.departureTime = departureTimeISO

    const res = await fetch(GOOGLE_URL, {
      method:  'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.travelAdvisory.incidents',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    })

    if (!res.ok) {
      console.warn(`[traffic-check] Google HTTP ${res.status}:`, (await res.text().catch(() => '')).slice(0, 80))
      return null
    }

    const json  = await res.json()
    const route = json?.routes?.[0]
    if (!route?.duration) return null

    const durationSec = parseInt(route.duration.replace('s', ''), 10)
    if (!isFinite(durationSec) || durationSec <= 0) return null

    const durationMin = Math.max(1, Math.round(durationSec / 60 / ROUND_TO) * ROUND_TO)
    const incidents   = (route.travelAdvisory?.incidents || []).map(i => ({
      type:        i.type        || 'UNKNOWN',
      description: i.description || '',
    }))

    return { durationMin, incidents }
  } catch (e) {
    console.warn('[traffic-check] error:', e.message)
    return null
  }
}

// ─── Severity ─────────────────────────────────────────────────
const CRITICAL_TYPES = ['ACCIDENT', 'CLOSED', 'ROAD_CLOSING']

function getSeverity(delayMin, incidents) {
  const hasCritical = incidents.some(i => CRITICAL_TYPES.includes(i.type))
  if (hasCritical || delayMin > 20) return 'CRITICAL'
  if (delayMin > 10 || incidents.some(i => i.type === 'CONSTRUCTION')) return 'WARNING'
  if (delayMin >= MIN_DELAY_WARN || incidents.length > 0) return 'INFO'
  return 'OK'
}

// ─── Handler ──────────────────────────────────────────────────
export async function POST(req) {
  // Auth: sessione Supabase
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 })

  const prodId = process.env.NEXT_PUBLIC_PRODUCTION_ID
  if (!prodId) return NextResponse.json({ error: 'NEXT_PUBLIC_PRODUCTION_ID not set' }, { status: 500 })

  const body    = await req.json().catch(() => ({}))
  const dateISO = body.date || new Date().toISOString().split('T')[0]
  const now     = new Date()
  const nowMs   = now.getTime()

  // Service role per leggere tutti i dati
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  const [{ data: trips }, { data: locs }] = await Promise.all([
    sb.from('trips')
      .select('trip_id,vehicle_id,pickup_id,dropoff_id,start_dt,end_dt,pickup_min,call_min,duration_min,service_type,date')
      .eq('production_id', prodId)
      .eq('date', dateISO)
      .neq('status', 'CANCELLED'),
    sb.from('locations')
      .select('id,name,lat,lng')
      .eq('production_id', prodId),
  ])

  if (!trips?.length) {
    return NextResponse.json({ alerts: [], date: dateISO, checkedRoutes: 0, checkedAt: now.toISOString() })
  }

  // Mappe coordinate e nomi
  const coordMap = {}
  const nameMap  = {}
  for (const l of (locs || [])) {
    nameMap[l.id] = l.name
    if (l.lat != null && l.lng != null)
      coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
  }

  // Raggruppa trip per trip_id (prende la prima row come rappresentativa)
  const tripMap = {}
  for (const t of trips) {
    if (!t.pickup_id || !t.dropoff_id) continue
    if (!tripMap[t.trip_id]) {
      tripMap[t.trip_id] = {
        trip_id:      t.trip_id,
        vehicle_id:   t.vehicle_id,
        pickup_id:    t.pickup_id,
        dropoff_id:   t.dropoff_id,
        service_type: t.service_type,
        pickup_min:   t.pickup_min ?? t.call_min,
        start_dt:     t.start_dt,
        end_dt:       t.end_dt,
        duration_min: t.duration_min || 30,
        date:         t.date,
      }
    }
  }

  const alerts = []

  for (const g of Object.values(tripMap)) {
    const fromCoord = coordMap[g.pickup_id]
    const toCoord   = coordMap[g.dropoff_id]
    if (!fromCoord || !toCoord) continue

    const isWrap  = WRAP_TYPES.includes(g.service_type)
    const startMs = g.start_dt ? new Date(g.start_dt).getTime() : null
    const endMs   = g.end_dt   ? new Date(g.end_dt).getTime()   : null

    const isBusy    = !!(startMs && endMs && nowMs >= startMs && nowMs <= endMs)
    const isPlanned = !isBusy && (!startMs || nowMs < startMs)
    if (!isBusy && !isPlanned) continue   // DONE — salta

    // departureTime per Google
    let departureIso
    if (isBusy) {
      departureIso = now.toISOString()  // traffico real-time
    } else {
      // Usa la pickup_min del trip sulla sua data
      if (g.pickup_min == null) continue
      const [y, mo, dd] = g.date.split('-').map(Number)
      const d = new Date(y, mo - 1, dd, Math.floor(g.pickup_min / 60), g.pickup_min % 60, 0, 0)
      if (d < now && !isBusy) {
        // Trip in passato ma non BUSY → saltalo
        continue
      }
      departureIso = d.toISOString()
    }

    // ── Chiamata Google: leg di andata ──────────────────────
    const outbound = await googleRoutes(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng, departureIso)
    await sleep(SLEEP_MS)
    if (!outbound) continue

    const outboundMin   = outbound.durationMin
    const plannedMin    = g.duration_min
    const incidents     = outbound.incidents || []

    // Calcola ETA dropoff
    let dropoffEtaMs
    let delayVsPlanned

    if (isBusy) {
      // Van ha già percorso: elapsed dalla partenza
      const elapsedMin    = Math.max(0, (nowMs - (startMs || nowMs)) / 60000)
      const remainingMin  = Math.max(0, outboundMin - elapsedMin)
      dropoffEtaMs        = nowMs + remainingMin * 60000
      // Ritardo vs planned dropoff (metà del trip per Wrap, fine per Standard)
      const plannedDropMs = isWrap
        ? (startMs || nowMs) + plannedMin * 60000           // fine outbound pianificata
        : (endMs || nowMs)                                  // fine trip pianificata
      delayVsPlanned = Math.round((dropoffEtaMs - plannedDropMs) / 60000)
    } else {
      dropoffEtaMs   = (startMs || nowMs) + outboundMin * 60000
      delayVsPlanned = outboundMin - plannedMin
    }

    // ── Chiamata Google: ritorno (Wrap/Charter/Other) ───────
    let returnMin   = null
    let backEtaMs   = null
    let backEtaStr  = null

    if (isWrap) {
      const dropoffIso = new Date(dropoffEtaMs).toISOString()
      const ret = await googleRoutes(toCoord.lat, toCoord.lng, fromCoord.lat, fromCoord.lng, dropoffIso)
      await sleep(SLEEP_MS)
      if (ret) {
        returnMin  = ret.durationMin
        backEtaMs  = dropoffEtaMs + returnMin * 60000
        backEtaStr = fmtHHMM(backEtaMs)
      }
    }

    const severity = getSeverity(Math.max(0, delayVsPlanned), incidents)
    // Includi anche se nessun ritardo ma trip BUSY Wrap (sempre utile mostrare ETA reale)
    if (severity === 'OK' && !isBusy) continue

    // ── Messaggio ────────────────────────────────────────────
    const fromName     = nameMap[g.pickup_id]  || g.pickup_id
    const toName       = nameMap[g.dropoff_id] || g.dropoff_id
    const dropoffStr   = fmtHHMM(dropoffEtaMs)
    const pickupTimeStr = g.pickup_min != null
      ? `${pad2(Math.floor(g.pickup_min / 60))}:${pad2(g.pickup_min % 60)}`
      : '?'
    const incidentLabel = [...new Set(incidents.map(i => i.type))].join(', ')

    let message
    if (isBusy) {
      if (isWrap && backEtaStr) {
        message = `${incidentLabel ? incidentLabel + ' reported. ' : ''}ETA at ${toName}: ${dropoffStr}` +
          (delayVsPlanned > 0 ? ` (+${delayVsPlanned}min vs planned)` : '') +
          `. Back at ${fromName}: ${backEtaStr}.`
      } else {
        message = `${incidentLabel ? incidentLabel + ' reported. ' : ''}ETA at ${toName}: ${dropoffStr}` +
          (delayVsPlanned > 0 ? ` (+${delayVsPlanned}min late)` : '') + '.'
      }
    } else {
      const plannedArrStr = fmtHHMM((startMs || nowMs) + plannedMin * 60000)
      message = `${incidentLabel ? incidentLabel + '. ' : ''}At ${pickupTimeStr}: +${delayVsPlanned}min delay expected.` +
        ` ETA ${dropoffStr} (planned: ${plannedArrStr}).` +
        (delayVsPlanned > 5 ? ' Consider adjusting call time.' : '')
    }

    alerts.push({
      tripId:           g.trip_id,
      vehicleId:        g.vehicle_id,
      serviceType:      g.service_type,
      fromId:           g.pickup_id,
      toId:             g.dropoff_id,
      fromName,
      toName,
      pickupTime:       pickupTimeStr,
      status:           isBusy ? 'BUSY' : 'PLANNED',
      plannedDurationMin: plannedMin,
      trafficDurationMin: outboundMin,
      delayMin:         delayVsPlanned,
      dropoffEtaMs,
      dropoffEtaStr:    dropoffStr,
      backEtaMs,
      backEtaStr,
      returnDurationMin: returnMin,
      severity,
      message,
      incidents:        incidents.map(i => i.type),
      hasIncidents:     incidents.length > 0,
    })
  }

  // Ordina per severity (CRITICAL prima)
  const SEV = { CRITICAL: 0, WARNING: 1, INFO: 2, OK: 3 }
  alerts.sort((a, b) => (SEV[a.severity] ?? 4) - (SEV[b.severity] ?? 4))

  return NextResponse.json({
    alerts,
    date:           dateISO,
    checkedRoutes:  Object.keys(tripMap).length,
    warningsCount:  alerts.filter(a => a.severity !== 'OK').length,
    checkedAt:      now.toISOString(),
  })
}
