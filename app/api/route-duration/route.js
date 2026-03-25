/**
 * /api/route-duration
 *
 * Calcola la durata di guida tra due locations usando Google Routes API.
 * Fallback: Haversine (velocità media 30 km/h con fattori correzione hub/hotel).
 *
 * POST body: { from_id, to_id, [production_id] }
 *        oppure coordinate dirette: { from_lat, from_lng, to_lat, to_lng }
 *
 * Variabili d'ambiente:
 *   GOOGLE_MAPS_API_KEY          → chiave Google Cloud (Routes API abilitata)
 *                                  Server-side only — NON NEXT_PUBLIC_
 *   NEXT_PUBLIC_PRODUCTION_ID    → produzione default
 *
 * Risposta: { duration_min, distance_km, source }
 *   source: 'google' | 'haversine' | 'cache'
 */

import { createSupabaseServerClient } from '../../../lib/supabaseServer'
import { haversineKm }               from '../../../lib/haversine'
import { NextResponse }              from 'next/server'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO   = 5    // arrotonda ai 5 minuti
const MIN_MIN    = 5    // durata minima

export async function POST(req) {
  try {
    const body = await req.json()
    let { from_id, to_id, from_lat, from_lng, to_lat, to_lng, production_id } = body

    const pid = production_id || process.env.NEXT_PUBLIC_PRODUCTION_ID

    // ── 1. Cache tabella routes ─────────────────────────────
    if (from_id && to_id && pid) {
      const supabase = await createSupabaseServerClient()
      const { data: cached } = await supabase
        .from('routes')
        .select('duration_min, distance_km')
        .eq('production_id', pid)
        .eq('from_id', from_id)
        .eq('to_id', to_id)
        .maybeSingle()

      if (cached?.duration_min) {
        return NextResponse.json({
          duration_min: cached.duration_min,
          distance_km:  cached.distance_km ?? null,
          source:       'cache',
        })
      }
    }

    // ── 2. Carica coordinate da Supabase se non fornite ─────
    if (from_id && to_id && (!from_lat || !to_lat)) {
      const supabase = await createSupabaseServerClient()
      const { data: locs } = await supabase
        .from('locations')
        .select('id,lat,lng,is_hub')
        .in('id', [from_id, to_id])

      const fromLoc = locs?.find(l => l.id === from_id)
      const toLoc   = locs?.find(l => l.id === to_id)

      if (fromLoc?.lat) { from_lat = fromLoc.lat; from_lng = fromLoc.lng }
      if (toLoc?.lat)   { to_lat   = toLoc.lat;   to_lng   = toLoc.lng }

      // Salviamo is_hub per Haversine fallback
      body._from_is_hub = fromLoc?.is_hub
      body._to_is_hub   = toLoc?.is_hub
    }

    if (!from_lat || !to_lat) {
      return NextResponse.json(
        { error: 'Coordinate mancanti — fornire from_id/to_id o coordinate dirette' },
        { status: 422 }
      )
    }

    const lat1 = parseFloat(from_lat)
    const lng1 = parseFloat(from_lng)
    const lat2 = parseFloat(to_lat)
    const lng2 = parseFloat(to_lng)

    let duration_min = null
    let distance_km  = null
    let source       = 'haversine'

    // ── 3. Google Routes API ────────────────────────────────
    if (GOOGLE_KEY) {
      try {
        const googleRes = await fetch(GOOGLE_URL, {
          method: 'POST',
          headers: {
            'X-Goog-Api-Key':   GOOGLE_KEY,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
            'Content-Type':     'application/json',
          },
          body: JSON.stringify({
            origin: {
              location: { latLng: { latitude: lat1, longitude: lng1 } },
            },
            destination: {
              location: { latLng: { latitude: lat2, longitude: lng2 } },
            },
            travelMode:               'DRIVE',
            routingPreference:        'TRAFFIC_AWARE_OPTIMAL',
            computeAlternativeRoutes: false,
            languageCode:             'it-IT',
            units:                    'METRIC',
          }),
          signal: AbortSignal.timeout(8000),
        })

        if (googleRes.ok) {
          const googleData = await googleRes.json()
          const route = googleData?.routes?.[0]

          if (route?.duration) {
            const durationSec = parseInt(route.duration.replace('s', ''), 10)
            const distanceM   = route.distanceMeters || 0

            if (isFinite(durationSec) && durationSec > 0) {
              const rawMin = durationSec / 60
              duration_min = Math.max(MIN_MIN, Math.round(rawMin / ROUND_TO) * ROUND_TO)
              distance_km  = Math.round(distanceM / 100) / 10
              source       = 'google'
            }
          }
        } else {
          const errText = await googleRes.text().catch(() => '')
          console.warn(`[route-duration] Google Routes API HTTP ${googleRes.status}:`, errText.slice(0, 200))
        }
      } catch (googleErr) {
        console.warn('[route-duration] Google Routes API fallito, uso Haversine:', googleErr.message)
      }
    }

    // ── 4. Haversine fallback ───────────────────────────────
    if (!duration_min) {
      const km = haversineKm(lat1, lng1, lat2, lng2)

      const fromIsHub = body._from_is_hub ?? false
      const toIsHub   = body._to_is_hub   ?? false
      let factor
      if (fromIsHub || toIsHub) {
        factor = 1.8
      } else if (!fromIsHub && !toIsHub) {
        factor = 1.4
      } else {
        factor = 1.6
      }

      const rawMin = (km * factor / 30) * 60
      duration_min = Math.max(MIN_MIN, Math.round(rawMin / ROUND_TO) * ROUND_TO)
      distance_km  = Math.round(km * 10) / 10
      source       = 'haversine'
    }

    // ── 5. Salva/aggiorna routes (solo se da Google) ────────
    // Le stime Haversine non vengono salvate per non sporcare la tabella
    if (source === 'google' && from_id && to_id && pid) {
      const supabase = await createSupabaseServerClient()
      await supabase.from('routes').upsert(
        {
          production_id: pid,
          from_id,
          to_id,
          duration_min,
          distance_km,
          source: 'google',
        },
        { onConflict: 'production_id,from_id,to_id' }
      )
    }

    return NextResponse.json({ duration_min, distance_km, source })
  } catch (e) {
    console.error('[route-duration] Errore:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
