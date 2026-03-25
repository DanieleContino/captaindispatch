/**
 * /api/route-duration
 * Calcola la durata di guida tra due locations usando OpenRouteService.
 * Fallback: Haversine (velocità media 40 km/h in città).
 *
 * POST body: { from_id, to_id }   oppure   { from_lat, from_lng, to_lat, to_lng }
 *
 * Variabili d'ambiente necessarie:
 *   ORS_API_KEY   → chiave OpenRouteService (https://openrouteservice.org/dev/#/signup)
 *                   Se assente, usa solo Haversine.
 *   NEXT_PUBLIC_PRODUCTION_ID
 */
import { createSupabaseServerClient } from '../../../lib/supabaseServer'
import { NextResponse } from 'next/server'

const ORS_KEY    = process.env.ORS_API_KEY
const ORS_URL    = 'https://api.openrouteservice.org/v2/directions/driving-car'
const AVG_SPEED  = 40          // km/h fallback Haversine
const PAD_FACTOR = 1.25        // +25% per traffico

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export async function POST(req) {
  try {
    const body = await req.json()
    let { from_id, to_id, from_lat, from_lng, to_lat, to_lng, production_id } = body

    const pid = production_id || process.env.NEXT_PUBLIC_PRODUCTION_ID

    // Se forniti gli ID, carica le coordinate da Supabase
    if (from_id && to_id && (!from_lat || !to_lat)) {
      const supabase = await createSupabaseServerClient()
      const { data: locs } = await supabase
        .from('locations')
        .select('id,lat,lng')
        .eq('production_id', pid)
        .in('id', [from_id, to_id])

      const fromLoc = locs?.find(l => l.id === from_id)
      const toLoc   = locs?.find(l => l.id === to_id)
      if (fromLoc?.lat) { from_lat = fromLoc.lat; from_lng = fromLoc.lng }
      if (toLoc?.lat)   { to_lat   = toLoc.lat;   to_lng   = toLoc.lng }
    }

    let duration_min = null
    let distance_km  = null
    let source       = 'haversine'

    // ── ORS call ──────────────────────────────────────────────
    if (ORS_KEY && from_lat && to_lat) {
      try {
        const orsRes = await fetch(ORS_URL, {
          method: 'POST',
          headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coordinates: [[parseFloat(from_lng), parseFloat(from_lat)], [parseFloat(to_lng), parseFloat(to_lat)]],
            units: 'km',
          }),
          signal: AbortSignal.timeout(5000),
        })
        if (orsRes.ok) {
          const orsData = await orsRes.json()
          const seg = orsData?.routes?.[0]?.summary
          if (seg) {
            duration_min = Math.ceil(seg.duration / 60 * PAD_FACTOR)
            distance_km  = Math.round(seg.distance * 10) / 10
            source       = 'ors'
          }
        }
      } catch (orsErr) {
        console.warn('[route-duration] ORS fallito, uso Haversine:', orsErr.message)
      }
    }

    // ── Haversine fallback ──────────────────────────────────
    if (!duration_min && from_lat && to_lat) {
      const dist   = haversineDist(parseFloat(from_lat), parseFloat(from_lng), parseFloat(to_lat), parseFloat(to_lng))
      distance_km  = Math.round(dist * 10) / 10
      duration_min = Math.ceil((dist / AVG_SPEED) * 60 * PAD_FACTOR)
      source       = 'haversine'
    }

    if (!duration_min)
      return NextResponse.json({ error: 'Coordinate mancanti e/o ORS non configurato' }, { status: 422 })

    // ── Salva/aggiorna routes ──────────────────────────────
    if (from_id && to_id && pid) {
      const supabase = await createSupabaseServerClient()
      await supabase.from('routes').upsert(
        { production_id: pid, from_id, to_id, duration_min, distance_km, source },
        { onConflict: 'production_id,from_id,to_id' }
      )
    }

    return NextResponse.json({ duration_min, distance_km, source })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
