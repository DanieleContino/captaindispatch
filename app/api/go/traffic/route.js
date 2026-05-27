/**
 * POST /api/go/traffic
 * Calcola traffico real-time per un singolo trip (on-demand dal driver)
 * Auth: token driver (no login)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

async function googleRoutes(olat, olng, dlat, dlng) {
  if (!GOOGLE_KEY) return null
  try {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.travelAdvisory.incidents',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify({
        origin:             { location: { latLng: { latitude: olat, longitude: olng } } },
        destination:        { location: { latLng: { latitude: dlat, longitude: dlng } } },
        travelMode:         'DRIVE',
        routingPreference:  'TRAFFIC_AWARE',
        languageCode:       'en-US',
        units:              'METRIC',
      }),
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return null
    const json  = await res.json()
    const route = json?.routes?.[0]
    if (!route?.duration) return null
    const durationSec = parseInt(route.duration.replace('s', ''), 10)
    const durationMin = Math.max(1, Math.round(durationSec / 60))
    const incidents   = (route.travelAdvisory?.incidents || []).map(i => i.type)
    return { durationMin, incidents }
  } catch { return null }
}

export async function POST(request) {
  const { token, trip_id } = await request.json()
  if (!token || !trip_id) return Response.json({ error: 'token and trip_id required' }, { status: 400 })

  // Verifica token
  const { data: nccDriver } = await supabase
    .from('ncc_drivers').select('id, production_id').eq('tracking_token', token).single()
  const { data: crewDriver } = !nccDriver ? await supabase
    .from('crew').select('id, production_id').eq('tracking_token', token).single()
    : { data: null }
  const driver = nccDriver || crewDriver
  if (!driver) return Response.json({ error: 'Invalid token' }, { status: 404 })

  // Leggi trip + locations
  const { data: trip } = await supabase
    .from('trips').select('pickup_id, dropoff_id, duration_min')
    .eq('id', trip_id).single()
  if (!trip?.pickup_id || !trip?.dropoff_id) return Response.json({ error: 'Trip not found' }, { status: 404 })

  const { data: locs } = await supabase
    .from('locations').select('id, lat, lng')
    .in('id', [trip.pickup_id, trip.dropoff_id])
  const pickup  = locs?.find(l => l.id === trip.pickup_id)
  const dropoff = locs?.find(l => l.id === trip.dropoff_id)

  if (!pickup?.lat || !dropoff?.lat) return Response.json({ error: 'Missing coordinates' }, { status: 422 })

  const result = await googleRoutes(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng)
  if (!result) return Response.json({ error: 'Google Routes unavailable' }, { status: 503 })

  const delayMin = result.durationMin - (trip.duration_min || result.durationMin)
  const severity = delayMin > 20 || result.incidents.some(i => ['ACCIDENT','CLOSED','ROAD_CLOSING'].includes(i))
    ? 'CRITICAL'
    : delayMin > 10 ? 'WARNING'
    : delayMin >= 5 ? 'INFO'
    : 'OK'

  return Response.json({
    durationMin:  result.durationMin,
    plannedMin:   trip.duration_min,
    delayMin:     Math.max(0, delayMin),
    severity,
    incidents:    result.incidents,
  })
}
