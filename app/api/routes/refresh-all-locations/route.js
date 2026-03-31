/**
 * app/api/routes/refresh-all-locations/route.js
 *
 * GET /api/routes/refresh-all-locations?production_id=XXX
 *
 * Ricalcola con Google Routes API tutte le coppie A→B e B→A
 * tra le location di una produzione che hanno coordinate.
 * Salta le rotte con source='MANUAL'.
 * Usato dal bottone "🔄 Ricalcola Rotte" nella pagina Locations.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const productionId = searchParams.get('production_id')?.trim()

  if (!productionId) {
    return NextResponse.json({ error: 'Parametro production_id mancante' }, { status: 400 })
  }
  if (!GOOGLE_KEY) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY non configurata' }, { status: 500 })
  }

  // Service-role client (bypassa RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // 1. Carica tutte le location della produzione con coordinate
  const { data: locs, error: locsErr } = await supabase
    .from('locations')
    .select('id, lat, lng')
    .eq('production_id', productionId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (locsErr) {
    return NextResponse.json({ error: locsErr.message }, { status: 500 })
  }
  if (!locs || locs.length < 2) {
    return NextResponse.json({ updated: 0, skipped: 0, failed: 0, total: 0, message: 'Meno di 2 location con coordinate nella produzione' })
  }

  // 2. Carica rotte MANUAL da saltare
  const { data: manualRoutes } = await supabase
    .from('routes')
    .select('from_id, to_id')
    .eq('production_id', productionId)
    .eq('source', 'MANUAL')

  const manualSet = new Set((manualRoutes || []).map(r => `${r.from_id}|${r.to_id}`))

  // 3. Genera tutte le coppie A→B e B→A, chiama Google per ognuna
  let updated = 0, skipped = 0, failed = 0

  for (let i = 0; i < locs.length; i++) {
    for (let j = 0; j < locs.length; j++) {
      if (i === j) continue

      const from = locs[i]
      const to   = locs[j]

      // Salta rotte MANUAL
      if (manualSet.has(`${from.id}|${to.id}`)) { skipped++; continue }

      const result = await googleDuration(
        parseFloat(from.lat), parseFloat(from.lng),
        parseFloat(to.lat),   parseFloat(to.lng)
      )

      if (result) {
        const { error: upsertErr } = await supabase.from('routes').upsert(
          {
            production_id: productionId,
            from_id:       from.id,
            to_id:         to.id,
            duration_min:  result.duration_min,
            distance_km:   result.distance_km,
            source:        'google',
            updated_at:    new Date().toISOString(),
          },
          { onConflict: 'production_id,from_id,to_id' }
        )
        if (upsertErr) { failed++; console.error('[refresh-all-locations]', upsertErr.message) }
        else { updated++ }
      } else {
        failed++
      }

      await sleep(BATCH_PAUSE)
    }
  }

  const total = locs.length * (locs.length - 1)
  return NextResponse.json({ updated, skipped, failed, total })
}
