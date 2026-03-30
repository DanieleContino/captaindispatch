/**
 * POST /api/routes/compute-chain
 *
 * Ricalcola i pickup_min di un gruppo MULTI-PKP in modo sequenziale ("farthest first"):
 * - Ordina i leg per duration_min DESC (hotel più lontano dall'hub = primo pickup)
 * - Calcola il tempo di guida hotel→hotel con Google Maps (o DB se già disponibile)
 * - Aggiorna tutti i leg in DB con i nuovi pickup_min, start_dt, end_dt
 *
 * Usato da trips/page.js dopo handleAddToExisting e dopo EditTripSidebar.handleSubmit
 *
 * Body:   { leg_ids: [uuid, ...], production_id: uuid }
 * Returns: { results: [{id, pickup_min, start_dt, end_dt}] }
 */

import { NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO   = 1   // 1-minuto precision per catene sequenziali
const MIN_MIN    = 2

// ─── Google Routes API ────────────────────────────────────────────────────────
async function googleDuration (lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method:  'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify({
        origin:                   { location: { latLng: { latitude: lat1, longitude: lng1 } } },
        destination:              { location: { latLng: { latitude: lat2, longitude: lng2 } } },
        travelMode:               'DRIVE',
        routingPreference:        'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        languageCode:             'it-IT',
        units:                    'METRIC',
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json  = await res.json()
    const route = json?.routes?.[0]
    if (!route?.duration) return null
    const secs = parseInt(route.duration.replace('s', ''), 10)
    if (!isFinite(secs) || secs <= 0) return null
    return {
      duration_min: Math.max(MIN_MIN, Math.round(secs / 60 / ROUND_TO) * ROUND_TO),
      distance_km:  Math.round((route.distanceMeters || 0) / 100) / 10,
    }
  } catch {
    return null
  }
}

// ─── Get or compute duration between two locations ────────────────────────────
// Checks DB first, calls Google if missing, saves back to DB.
async function getOrComputeDuration (fromId, toId, productionId, supabase) {
  if (!fromId || !toId || fromId === toId) return null

  // 1. DB lookup
  const { data: cached } = await supabase
    .from('routes')
    .select('duration_min')
    .eq('production_id', productionId)
    .eq('from_id', fromId)
    .eq('to_id', toId)
    .maybeSingle()
  if (cached?.duration_min) return cached.duration_min

  // 2. Google Maps
  if (!GOOGLE_KEY) return null
  const { data: locs } = await supabase
    .from('locations').select('id,lat,lng').in('id', [fromId, toId])
  const coordMap = {}
  for (const l of locs ?? []) {
    if (l.lat != null && l.lng != null)
      coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
  }
  const from = coordMap[fromId]
  const to   = coordMap[toId]
  if (!from || !to) return null

  const result = await googleDuration(from.lat, from.lng, to.lat, to.lng)
  if (!result) return null

  // 3. Save to routes table
  await supabase.from('routes').upsert(
    {
      production_id: productionId,
      from_id:       fromId,
      to_id:         toId,
      duration_min:  result.duration_min,
      distance_km:   result.distance_km,
      source:        'google',
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'production_id,from_id,to_id' }
  )

  return result.duration_min
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST (request) {
  try {
    const { leg_ids, production_id } = await request.json()

    if (!Array.isArray(leg_ids) || leg_ids.length === 0 || !production_id) {
      return NextResponse.json({ error: 'leg_ids[] and production_id required' }, { status: 400 })
    }
    if (leg_ids.length < 2) {
      // Single-leg trip: nothing to chain
      return NextResponse.json({ results: [], skipped: 'single leg' })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // ── Fetch all legs ──────────────────────────────────────────────────────
    const { data: legs, error } = await supabase
      .from('trips')
      .select('id,pickup_id,dropoff_id,duration_min,call_min,arr_time,date,transfer_class,pickup_min,start_dt,end_dt')
      .in('id', leg_ids)

    if (error || !legs?.length) {
      return NextResponse.json({ error: 'legs not found', detail: error?.message }, { status: 404 })
    }

    // ── Detect MULTI-PKP vs MULTI-DRP ───────────────────────────────────────
    const uniquePickups  = new Set(legs.map(l => l.pickup_id))
    const uniqueDropoffs = new Set(legs.map(l => l.dropoff_id))
    const isMultiPkp     = uniquePickups.size  > 1  // diverse hotels come pickup
    const isMultiDrp     = uniqueDropoffs.size > 1  // diverse hotels come dropoff

    // ── MULTI-PKP: calcola catena sequenziale ───────────────────────────────
    if (isMultiPkp) {
      // Step 1: ensure all legs have duration_min (hotel → hub)
      const enriched = []
      for (const leg of legs) {
        let dur = leg.duration_min
        if (!dur) {
          dur = await getOrComputeDuration(leg.pickup_id, leg.dropoff_id, production_id, supabase)
          if (dur) {
            await supabase.from('trips').update({ duration_min: dur }).eq('id', leg.id)
          }
        }
        enriched.push({ ...leg, duration_min: dur })
      }

      // Step 2: sort by duration DESC (farthest hotel from hub first = first pickup)
      // Legs without duration go last (treat as 0)
      const sorted = [...enriched].sort((a, b) => (b.duration_min ?? 0) - (a.duration_min ?? 0))

      const callMin = sorted[0].call_min
      const date    = sorted[0].date

      // Step 3: compute pickup_min chain backwards
      const results = new Array(sorted.length)
      const n       = sorted.length

      // Last leg (closest to hub): pickup = call - duration
      const lastDur     = sorted[n - 1].duration_min ?? 0
      const lastPickup  = callMin !== null
        ? ((callMin - lastDur) % 1440 + 1440) % 1440
        : sorted[n - 1].pickup_min  // preserve if no call_min

      results[n - 1] = { id: sorted[n - 1].id, pickup_min: lastPickup, leg: sorted[n - 1] }

      // Walk backwards: for each leg, get drive time to the NEXT hotel in chain
      for (let i = n - 2; i >= 0; i--) {
        const nextPickup = results[i + 1].pickup_min
        if (nextPickup === null) {
          results[i] = { id: sorted[i].id, pickup_min: null, leg: sorted[i] }
          continue
        }
        // Hotel[i] (farther) → Hotel[i+1] (closer to hub = next in route)
        const driveBetween = await getOrComputeDuration(
          sorted[i].pickup_id,
          sorted[i + 1].pickup_id,
          production_id,
          supabase
        )
        // Fallback: 10 min if no route computable (rare, prevents same-time display)
        const driveMin = driveBetween ?? 10
        results[i] = {
          id:         sorted[i].id,
          pickup_min: ((nextPickup - driveMin) % 1440 + 1440) % 1440,
          leg:        sorted[i],
        }
      }

      // Step 4: compute start_dt / end_dt
      for (const r of results) {
        const pm = r.pickup_min
        if (pm !== null) {
          const [y, mo, dd] = date.split('-').map(Number)
          const startMs     = new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).getTime()
          r.start_dt = new Date(startMs).toISOString()
          r.end_dt   = r.leg.duration_min
            ? new Date(startMs + r.leg.duration_min * 60000).toISOString()
            : null
        } else {
          r.start_dt = null
          r.end_dt   = null
        }
      }

      // Step 5: update all legs in DB
      await Promise.all(
        results.map(r =>
          supabase.from('trips').update({
            pickup_min: r.pickup_min,
            start_dt:   r.start_dt,
            end_dt:     r.end_dt,
          }).eq('id', r.id)
        )
      )

      return NextResponse.json({
        results: results.map(r => ({
          id:         r.id,
          pickup_min: r.pickup_min,
          start_dt:   r.start_dt,
          end_dt:     r.end_dt,
        })),
        type: 'MULTI-PKP',
      })
    }

    // ── MULTI-DRP (ARRIVAL): aggiorna duration_min effettiva ─────────────────
    // Il pickup è lo stesso per tutti (arr_time), ma mostriamo dropoff_min = pickup + duration.
    // Per la catena: Hub→Hotel[0]→Hotel[1]→Hotel[2], il driver porta prima i più vicini.
    // Aggiorniamo duration_min per ogni leg con il tempo CUMULATIVO effettivo dal hub.
    if (isMultiDrp) {
      // Ensure all legs have duration_min (hub → hotel)
      const enriched = []
      for (const leg of legs) {
        let dur = leg.duration_min
        if (!dur) {
          dur = await getOrComputeDuration(leg.pickup_id, leg.dropoff_id, production_id, supabase)
          if (dur) await supabase.from('trips').update({ duration_min: dur }).eq('id', leg.id)
        }
        enriched.push({ ...leg, duration_min: dur })
      }

      // Sort by duration ASC (closest hotel first → driver drops there first)
      const sorted = [...enriched].sort((a, b) => (a.duration_min ?? 9999) - (b.duration_min ?? 9999))

      // Compute cumulative duration: each hotel's effective arrival = prev_arrival + drive(prev→this)
      const results = new Array(sorted.length)
      const callMin = sorted[0].call_min
      const date    = sorted[0].date

      // First hotel: driver goes directly from hub (pickup_min + duration[0])
      // pickup_min is the same for all ARRIVAL legs (= arr_time)
      // We update duration_min to represent "time from hub until this dropoff in the chain"
      results[0] = {
        id:          sorted[0].id,
        duration_min: sorted[0].duration_min,  // direct from hub, unchanged
      }

      for (let i = 1; i < sorted.length; i++) {
        // Drive time from previous hotel to this hotel
        const driveBetween = await getOrComputeDuration(
          sorted[i - 1].dropoff_id,
          sorted[i].dropoff_id,
          production_id,
          supabase
        )
        const prevCumulative = results[i - 1].duration_min ?? 0
        const driveMin       = driveBetween ?? 10
        results[i] = {
          id:           sorted[i].id,
          duration_min: prevCumulative + driveMin,
        }
      }

      // Update duration_min in DB for each leg (pickup_min stays the same for ARRIVAL)
      await Promise.all(
        results.map(r =>
          supabase.from('trips').update({
            duration_min: r.duration_min,
          }).eq('id', r.id)
        )
      )

      // Also recompute end_dt (pickup_min + new_duration_min)
      const pickupMin = sorted[0].pickup_min  // same for all ARRIVAL legs
      if (pickupMin !== null) {
        const [y, mo, dd] = date.split('-').map(Number)
        await Promise.all(
          results.map(r => {
            const startMs = new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
            const endDt   = new Date(startMs + (r.duration_min ?? 0) * 60000).toISOString()
            return supabase.from('trips').update({ end_dt: endDt }).eq('id', r.id)
          })
        )
      }

      return NextResponse.json({
        results: results.map(r => ({ id: r.id, duration_min: r.duration_min })),
        type: 'MULTI-DRP',
      })
    }

    return NextResponse.json({ results: [], skipped: 'no multi detected' })

  } catch (e) {
    console.error('[compute-chain]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
