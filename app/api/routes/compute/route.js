/**
 * POST /api/routes/compute
 *
 * Calcola (o recupera dalla cache) la duration_min tra due location.
 * Usato da handleAddToExisting in trips/page.js quando si crea un sibling
 * e la route non è ancora presente in tabella.
 *
 * Body: { from_id, to_id, production_id }
 * Response: { duration_min, source }   source = 'google' | 'db' | null
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO   = 5
const MIN_MIN    = 5

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

export async function POST(request) {
  try {
    const { from_id, to_id, production_id } = await request.json()
    if (!from_id || !to_id || !production_id) {
      return NextResponse.json({ error: 'from_id, to_id, production_id required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // 1. Controlla se la route esiste già in DB
    const { data: existing } = await supabase
      .from('routes')
      .select('duration_min')
      .eq('production_id', production_id)
      .eq('from_id', from_id)
      .eq('to_id', to_id)
      .maybeSingle()

    if (existing?.duration_min) {
      return NextResponse.json({ duration_min: existing.duration_min, source: 'db' })
    }

    // 2. Route non trovata → prova con Google Maps
    if (!GOOGLE_KEY) {
      return NextResponse.json({ duration_min: null, source: null })
    }

    // Recupera coordinate delle due location
    const { data: locs } = await supabase
      .from('locations')
      .select('id, lat, lng')
      .in('id', [from_id, to_id])

    const coordMap = {}
    if (locs) {
      for (const l of locs) {
        if (l.lat != null && l.lng != null)
          coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
      }
    }

    const from = coordMap[from_id]
    const to   = coordMap[to_id]

    if (!from || !to) {
      return NextResponse.json({ duration_min: null, source: null })
    }

    // 3. Chiama Google Maps
    const result = await googleDuration(from.lat, from.lng, to.lat, to.lng)
    if (!result) {
      return NextResponse.json({ duration_min: null, source: null })
    }

    // 4. Salva in routes table per uso futuro
    await supabase.from('routes').upsert(
      {
        production_id,
        from_id,
        to_id,
        duration_min:  result.duration_min,
        distance_km:   result.distance_km,
        source:        'google',
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'production_id,from_id,to_id' }
    )

    return NextResponse.json({ duration_min: result.duration_min, source: 'google' })
  } catch (e) {
    console.error('[routes/compute]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
