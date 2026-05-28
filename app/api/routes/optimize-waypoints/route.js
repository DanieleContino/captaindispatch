/**
 * POST /api/routes/optimize-waypoints
 *
 * Chiama Google Routes API con optimizeWaypointOrder: true per un gruppo
 * di leg MULTI-stop. Restituisce l'ordine ottimale dei leg senza salvare nulla.
 *
 * Body:   { leg_ids: [uuid, ...], production_id: uuid }
 * Returns: { optimized_order: [0,2,1,...], legs: [{id, pickup_id, dropoff_id, location_name}] }
 */

import { NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

export async function POST(request) {
  try {
    const { leg_ids, production_id } = await request.json()
    if (!production_id || !Array.isArray(leg_ids) || leg_ids.length < 2) {
      return NextResponse.json({ error: 'leg_ids[] (min 2) and production_id required' }, { status: 400 })
    }
    if (!GOOGLE_KEY) {
      return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // 1. Fetch legs with pickup/dropoff info
    const { data: legs, error: legsErr } = await supabase
      .from('trips')
      .select('id, pickup_id, dropoff_id, transfer_class, leg_order')
      .in('id', leg_ids)
      .order('leg_order', { ascending: true })

    if (legsErr || !legs?.length) {
      return NextResponse.json({ error: 'legs not found', detail: legsErr?.message }, { status: 404 })
    }

    // 2. Detect type: MULTI-PKP or MULTI-DRP
    const uniquePickups  = new Set(legs.map(l => l.pickup_id))
    const uniqueDropoffs = new Set(legs.map(l => l.dropoff_id))
    const isMultiPkp = uniquePickups.size > 1
    const isMultiDrp = uniqueDropoffs.size > 1

    // 3. Collect all unique location IDs needed
    const allLocIds = [...new Set(legs.flatMap(l => [l.pickup_id, l.dropoff_id]))]
    const { data: locs } = await supabase
      .from('locations')
      .select('id, name, lat, lng')
      .in('id', allLocIds)

    const coordMap = {}
    const nameMap  = {}
    for (const l of locs ?? []) {
      nameMap[l.id] = l.name
      if (l.lat != null && l.lng != null) {
        coordMap[l.id] = { lat: parseFloat(l.lat), lng: parseFloat(l.lng) }
      }
    }

    // 4. Build waypoints for Google Routes API
    // MULTI-PKP: optimize order of pickup hotels (dropoff hub is fixed destination)
    // MULTI-DRP: optimize order of dropoff hotels (pickup hub is fixed origin)
    // For optimization we use: origin = first point, destination = last point (hub),
    // intermediates = the hotels to optimize.

    let origin, destination, intermediates, hubId

    if (isMultiPkp) {
      // All pickups are hotels, all dropoffs are the same hub
      hubId = legs[0].dropoff_id
      const hotelIds = legs.map(l => l.pickup_id)
      // Use first hotel as origin, hub as destination, others as intermediates
      origin      = coordMap[hotelIds[0]]
      destination = coordMap[hubId]
      intermediates = hotelIds.slice(1).map(id => coordMap[id]).filter(Boolean)
    } else if (isMultiDrp) {
      // All dropoffs are hotels, all pickups are the same hub
      hubId = legs[0].pickup_id
      const hotelIds = legs.map(l => l.dropoff_id)
      // Use hub as origin, last hotel as destination, others as intermediates
      origin      = coordMap[hubId]
      destination = coordMap[hotelIds[hotelIds.length - 1]]
      intermediates = hotelIds.slice(0, -1).map(id => coordMap[id]).filter(Boolean)
    } else {
      // MIXED or single — not supported for optimization
      return NextResponse.json({ error: 'Optimization only supported for MULTI-PKP or MULTI-DRP' }, { status: 400 })
    }

    if (!origin || !destination) {
      return NextResponse.json({ error: 'Missing coordinates for hub or hotels' }, { status: 400 })
    }

    // 5. Call Google Routes API with optimizeWaypointOrder
    const body = {
      origin:      { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode:               'DRIVE',
      routingPreference:        'TRAFFIC_AWARE',
      optimizeWaypointOrder:    true,
      computeAlternativeRoutes: false,
      languageCode:             'it-IT',
      units:                    'METRIC',
    }

    if (intermediates.length > 0) {
      body.intermediates = intermediates.map(c => ({
        location: { latLng: { latitude: c.lat, longitude: c.lng } },
      }))
    }

    const res = await fetch(GOOGLE_URL, {
      method:  'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: 'Google API error', detail: errText }, { status: 502 })
    }

    const json  = await res.json()
    const route = json?.routes?.[0]

    // DEBUG temporaneo — rimuovere dopo diagnosi
    console.log('[optimize-waypoints] route raw:', JSON.stringify(route))
    console.log('[optimize-waypoints] optimizedIntermediateWaypointIndex:', route?.optimizedIntermediateWaypointIndex)
    console.log('[optimize-waypoints] intermediates sent:', JSON.stringify(intermediates))

    // 6. Build optimized order
    // optimizedIntermediateWaypointIndex tells us the new order of intermediates
    // We reconstruct the full leg order from it
    let optimizedOrder // array of original leg indices in new order

    if (isMultiPkp) {
      const hotelIds = legs.map(l => l.pickup_id)
      // origin = hotelIds[0], intermediates = hotelIds[1..]
      // optimizedIntermediateWaypointIndex = reordering of intermediates
      const optIdx = route?.optimizedIntermediateWaypointIndex ?? intermediates.map((_, i) => i)
      // Full hotel order: [hotelIds[0], ...optIdx.map(i => hotelIds[i+1])]
      const optimizedHotelIds = [hotelIds[0], ...optIdx.map(i => hotelIds[i + 1])]
      optimizedOrder = optimizedHotelIds.map(hId => legs.findIndex(l => l.pickup_id === hId))
    } else {
      const hotelIds = legs.map(l => l.dropoff_id)
      // origin = hub, intermediates = hotelIds[0..-2], destination = hotelIds[-1]
      const optIdx = route?.optimizedIntermediateWaypointIndex ?? intermediates.map((_, i) => i)
      // Full hotel order: [...optIdx.map(i => hotelIds[i]), hotelIds[-1]]
      const optimizedHotelIds = [...optIdx.map(i => hotelIds[i]), hotelIds[hotelIds.length - 1]]
      optimizedOrder = optimizedHotelIds.map(hId => legs.findIndex(l => l.dropoff_id === hId))
    }

    // 7. Return optimized order + leg details for Review UI
    const legDetails = legs.map(l => ({
      id:            l.id,
      pickup_id:     l.pickup_id,
      dropoff_id:    l.dropoff_id,
      pickup_name:   nameMap[l.pickup_id]  || l.pickup_id,
      dropoff_name:  nameMap[l.dropoff_id] || l.dropoff_id,
      leg_order:     l.leg_order,
    }))

    return NextResponse.json({
      optimized_order: optimizedOrder,
      legs:            legDetails,
      type:            isMultiPkp ? 'MULTI-PKP' : 'MULTI-DRP',
      total_duration:  route?.duration ? parseInt(route.duration.replace('s', ''), 10) : null,
      total_distance:  route?.distanceMeters ? Math.round(route.distanceMeters / 100) / 10 : null,
    })

  } catch (e) {
    console.error('[optimize-waypoints]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
