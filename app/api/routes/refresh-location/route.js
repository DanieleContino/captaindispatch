/**
 * app/api/routes/refresh-location/route.js
 *
 * GET /api/routes/refresh-location?id=<location_id>
 *
 * Ricalcola con Google Routes API tutte le rotte (source != 'MANUAL')
 * che coinvolgono una specifica location (come from_id oppure to_id).
 * Usato dalla pagina Locations dopo aver salvato nuove coordinate.
 */

import { NextResponse }     from 'next/server'
import { createClient }     from '@supabase/supabase-js'

const GOOGLE_KEY  = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL  = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO    = 5
const MIN_MIN     = 5
const BATCH_PAUSE = 150

async function googleDuration(lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get('id')?.trim()

  if (!locationId) {
    return NextResponse.json({ error: 'Parametro id mancante' }, { status: 400 })
  }
  if (!GOOGLE_KEY) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY non configurata' }, { status: 500 })
  }

  // Service-role client (necessario per bypassare RLS in lettura/scrittura routes)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // 1. Carica tutte le rotte non-MANUAL che coinvolgono questa location
  const { data: routes, error: routesErr } = await supabase
    .from('routes')
    .select('production_id, from_id, to_id, source')
    .or(`from_id.eq.${locationId},to_id.eq.${locationId}`)
    .neq('source', 'MANUAL')

  if (routesErr) {
    return NextResponse.json({ error: routesErr.message }, { status: 500 })
  }

  if (!routes || routes.length === 0) {
    return NextResponse.json({ updated: 0, skipped: 0, failed: 0, message: 'Nessuna rotta trovata per questa location' })
  }

  // 2. Raccoglie tutti i location IDs coinvolti
  const allLocIds = [...new Set(routes.flatMap(r => [r.from_id, r.to_id]))]

  const { data: locs } = await supabase
    .from('locations')
    .select('id, lat, lng')
    .in('id', allLocIds)

  const coordMap = {}
  if (locs) {
    for (const l of locs) {
      if (l.lat != null && l.lng != null)
        coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
    }
  }

  // 3. Google Routes API per ogni rotta
  let updated = 0, skipped = 0, failed = 0

  for (const route of routes) {
    const from = coordMap[route.from_id]
    const to   = coordMap[route.to_id]

    if (!from || !to) { skipped++; continue }

    const result = await googleDuration(from.lat, from.lng, to.lat, to.lng)

    if (result) {
      const { error: upsertErr } = await supabase.from('routes').upsert(
        {
          production_id: route.production_id,
          from_id:       route.from_id,
          to_id:         route.to_id,
          duration_min:  result.duration_min,
          distance_km:   result.distance_km,
          source:        'google',
          updated_at:    new Date().toISOString(),
        },
        { onConflict: 'production_id,from_id,to_id' }
      )
      if (upsertErr) { failed++; console.error('[refresh-location]', upsertErr.message) }
      else { updated++ }
    } else {
      failed++
    }

    await sleep(BATCH_PAUSE)
  }

  return NextResponse.json({ updated, skipped, failed, total: routes.length })
}
