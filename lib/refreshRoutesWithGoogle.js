/**
 * lib/refreshRoutesWithGoogle.js
 *
 * Logica condivisa per aggiornare le durate di rotta con Google Routes API.
 * Usata da:
 *   - /api/cron/refresh-routes-traffic  (cron mattutino automatico)
 *   - /api/routes/refresh-traffic        (trigger manuale dal Fleet Monitor)
 *
 * Per ogni produzione con trip nella data richiesta:
 *  1. Raccoglie rotte dirette (pickup→dropoff) di ogni trip
 *  2. Raccoglie rotte di repositioning (ultimo_dropoff→prossimo_pickup) per veicolo
 *  3. Salta rotte source='MANUAL'
 *  4. Chiama Google Routes API (TRAFFIC_AWARE_OPTIMAL)
 *  5. Upsert in routes table con source='google'
 */

const GOOGLE_KEY     = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL     = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO       = 5
const MIN_MIN        = 5
const BATCH_PAUSE_MS = 150

// ─── Google Routes API — singola chiamata ─────────────────────
async function googleDuration(lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method:  'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: lat1, longitude: lng1 } } },
        destination: { location: { latLng: { latitude: lat2, longitude: lng2 } } },
        travelMode:               'DRIVE',
        routingPreference:        'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        languageCode:             'it-IT',
        units:                    'METRIC',
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn(`[refreshRoutes] Google HTTP ${res.status}:`, err.slice(0, 120))
      return null
    }

    const json  = await res.json()
    const route = json?.routes?.[0]
    if (!route?.duration) return null

    const durationSec = parseInt(route.duration.replace('s', ''), 10)
    if (!isFinite(durationSec) || durationSec <= 0) return null

    return {
      duration_min: Math.max(MIN_MIN, Math.round(durationSec / 60 / ROUND_TO) * ROUND_TO),
      distance_km:  Math.round((route.distanceMeters || 0) / 100) / 10,
    }
  } catch (err) {
    console.warn('[refreshRoutes] Google error:', err.message)
    return null
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Raggruppa trip per trip_id (server-side) ─────────────────
function groupTripsByTripId(trips) {
  const map = {}
  for (const t of trips) {
    const sd = t.start_dt ? new Date(t.start_dt).getTime() : null
    const ed = t.end_dt   ? new Date(t.end_dt).getTime()   : null
    if (!map[t.trip_id]) {
      map[t.trip_id] = {
        trip_id:       t.trip_id,
        pickup_id:     t.pickup_id,
        lastDropoffId: t.dropoff_id,
        minStart:      sd,
        maxEndMs:      ed,
      }
    } else {
      const g = map[t.trip_id]
      if (sd !== null && (g.minStart === null || sd < g.minStart)) {
        g.minStart  = sd
        g.pickup_id = t.pickup_id
      }
      if (ed !== null && (g.maxEndMs === null || ed > g.maxEndMs)) {
        g.maxEndMs      = ed
        g.lastDropoffId = t.dropoff_id
      }
    }
  }
  return Object.values(map).sort((a, b) => {
    if (a.minStart !== null && b.minStart !== null) return a.minStart - b.minStart
    if (a.minStart !== null) return -1
    if (b.minStart !== null) return 1
    return 0
  })
}

/**
 * Aggiorna le durate di rotta per i trip della data specificata.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase  Service-role client
 * @param {string} dateISO  Data nel formato "YYYY-MM-DD"
 * @returns {Promise<{ date, total, updated, skippedManual, skippedNoCoords, failed, elapsedSec }>}
 */
export async function refreshRoutesForDate(supabase, dateISO) {
  if (!GOOGLE_KEY) throw new Error('GOOGLE_MAPS_API_KEY non configurata')

  const startedAt = Date.now()
  console.log(`[refreshRoutes] Avvio — data: ${dateISO}`)

  // 1. Carica trip del giorno
  const { data: allTrips, error: tripsErr } = await supabase
    .from('trips')
    .select('trip_id, vehicle_id, pickup_id, dropoff_id, start_dt, end_dt, production_id')
    .eq('date', dateISO)
    .neq('status', 'CANCELLED')

  if (tripsErr) throw new Error(`trips query: ${tripsErr.message}`)

  if (!allTrips || allTrips.length === 0) {
    return { date: dateISO, total: 0, updated: 0, skippedManual: 0, skippedNoCoords: 0, failed: 0, elapsedSec: 0, message: 'Nessun trip' }
  }

  // 2. Raccoglie coppie di rotte uniche per produzione
  const routeSet = new Set()
  const byVehicle = {}

  for (const t of allTrips) {
    if (t.pickup_id && t.dropoff_id) {
      routeSet.add(`${t.production_id}|${t.pickup_id}|${t.dropoff_id}`)
    }
    if (t.vehicle_id) {
      const key = `${t.production_id}|${t.vehicle_id}`
      if (!byVehicle[key]) byVehicle[key] = { productionId: t.production_id, trips: [] }
      byVehicle[key].trips.push(t)
    }
  }

  // Rotte repositioning tra trip consecutivi dello stesso veicolo
  for (const { productionId, trips } of Object.values(byVehicle)) {
    const groups = groupTripsByTripId(trips)
    for (let i = 0; i < groups.length - 1; i++) {
      const from = groups[i].lastDropoffId
      const to   = groups[i + 1].pickup_id
      if (from && to && from !== to) {
        routeSet.add(`${productionId}|${from}|${to}`)
      }
    }
  }

  const allPairs = [...routeSet].map(k => {
    const [productionId, fromId, toId] = k.split('|')
    return { productionId, fromId, toId }
  })

  console.log(`[refreshRoutes] Coppie da aggiornare: ${allPairs.length}`)

  // 3. Carica rotte esistenti — individua MANUAL
  const productionIds = [...new Set(allPairs.map(p => p.productionId))]
  const { data: existingRoutes } = await supabase
    .from('routes')
    .select('production_id, from_id, to_id, source')
    .in('production_id', productionIds)

  const manualSet = new Set()
  if (existingRoutes) {
    for (const r of existingRoutes) {
      if (r.source === 'MANUAL') manualSet.add(`${r.production_id}|${r.from_id}|${r.to_id}`)
    }
  }

  // 4. Carica coordinate
  const locationIds = [...new Set(allPairs.flatMap(p => [p.fromId, p.toId]))]
  const { data: locs } = await supabase
    .from('locations')
    .select('id, lat, lng')
    .in('id', locationIds)

  const coordMap = {}
  if (locs) {
    for (const l of locs) {
      if (l.lat != null && l.lng != null)
        coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
    }
  }

  // 5. Google Routes API per ogni coppia
  let updated = 0, skippedManual = 0, skippedNoCoords = 0, failed = 0

  for (const { productionId, fromId, toId } of allPairs) {
    const key = `${productionId}|${fromId}|${toId}`

    if (manualSet.has(key)) { skippedManual++; continue }

    const from = coordMap[fromId]
    const to   = coordMap[toId]
    if (!from || !to) { skippedNoCoords++; continue }

    const result = await googleDuration(from.lat, from.lng, to.lat, to.lng)

    if (result) {
      const { error: upsertErr } = await supabase.from('routes').upsert(
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
      if (upsertErr) {
        console.error(`[refreshRoutes] Upsert (${fromId}→${toId}):`, upsertErr.message)
        failed++
      } else {
        updated++
      }
    } else {
      failed++
    }

    await sleep(BATCH_PAUSE_MS)
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  return { date: dateISO, total: allPairs.length, updated, skippedManual, skippedNoCoords, failed, elapsedSec: elapsed }
}
