import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { token, trip_id } = await request.json()

  if (!token || !trip_id) return Response.json({ error: 'token and trip_id required' }, { status: 400 })

  // 1. Risolvi token → driver
  let driver = null
  let driverType = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver; driverType = 'NCC'
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('id, production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) { driver = crewDriver; driverType = 'CREW' }
  }

  if (!driver) return Response.json({ error: 'Invalid token' }, { status: 404 })

  // 2. Trova trip_id testuale + pickup/dropoff dalla row UUID
  const { data: tripRow } = await supabase
    .from('trips')
    .select('trip_id, pickup_id, dropoff_id')
    .eq('id', trip_id)
    .single()

  // 2b. Leggi posizione attuale del driver dalla sessione attiva
  let driverLat = null
  let driverLng = null
  try {
    let sessionQ = supabase
      .from('vehicle_tracking_sessions')
      .select('last_lat, last_lng')
      .eq('production_id', driver.production_id)
      .neq('status', 'ENDED')
      .order('started_at', { ascending: false })
      .limit(1)
    if (driverType === 'NCC') {
      sessionQ = sessionQ.eq('ncc_driver_id', driver.id)
    } else {
      const { data: driverVehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('production_id', driver.production_id)
        .eq('driver_crew_id', driver.id)
        .eq('active', true)
        .single()
      if (driverVehicle) sessionQ = sessionQ.eq('vehicle_id', driverVehicle.id)
    }
    const { data: driverSession } = await sessionQ.single()
    if (driverSession?.last_lat && driverSession?.last_lng) {
      driverLat = driverSession.last_lat
      driverLng = driverSession.last_lng
    }
  } catch {}

  // 3. Calcola estimated_km (pickup→dropoff) e ETA driver→pickup via Distance Matrix API
  let estimatedKm = null
  let etaToPickupMin = null
  let etaToPickupKm = null

  if (tripRow?.pickup_id && tripRow?.dropoff_id) {
    const locIds = [tripRow.pickup_id, tripRow.dropoff_id]
    const { data: locs } = await supabase
      .from('locations')
      .select('uuid, lat, lng')
      .in('uuid', locIds)
    const pickup  = locs?.find(l => l.uuid === tripRow.pickup_id)
    const dropoff = locs?.find(l => l.uuid === tripRow.dropoff_id)
    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    // estimated_km: pickup → dropoff
    if (pickup?.lat && pickup?.lng && dropoff?.lat && dropoff?.lng) {
      try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${pickup.lat},${pickup.lng}&destinations=${dropoff.lat},${dropoff.lng}&mode=driving&key=${mapsKey}`
        const res  = await fetch(url)
        const data = await res.json()
        const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value
        if (meters) estimatedKm = Math.round(meters / 100) / 10
      } catch {}
    }

    // eta_to_pickup: driver position → pickup
    if (driverLat && driverLng && pickup?.lat && pickup?.lng) {
      try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${driverLat},${driverLng}&destinations=${pickup.lat},${pickup.lng}&mode=driving&key=${mapsKey}`
        const res  = await fetch(url)
        const data = await res.json()
        const el = data?.rows?.[0]?.elements?.[0]
        if (el?.duration?.value) etaToPickupMin = Math.ceil(el.duration.value / 60)
        if (el?.distance?.value) etaToPickupKm  = Math.round(el.distance.value / 100) / 10
      } catch {}
    }
  }

  // Aggiorna tutte le rows con lo stesso trip_id
  const { error: tripErr } = await supabase
    .from('trips')
    .update({
      status: 'BUSY',
      started_at: new Date().toISOString(),
      ...(estimatedKm    !== null && { estimated_km: estimatedKm }),
      ...(etaToPickupMin !== null && { eta_to_pickup_min: etaToPickupMin }),
      ...(etaToPickupKm  !== null && { eta_to_pickup_km: etaToPickupKm }),
    })
    .eq('trip_id', tripRow?.trip_id || trip_id)
    .eq('production_id', driver.production_id)

  if (tripErr) return Response.json({ error: tripErr.message }, { status: 500 })

  // 3. Aggiorna sessione attiva
  let sessionQuery = supabase
    .from('vehicle_tracking_sessions')
    .select('id')
    .eq('production_id', driver.production_id)
    .neq('status', 'ENDED')
    .order('started_at', { ascending: false })
    .limit(1)

  if (driverType === 'NCC') {
    sessionQuery = sessionQuery.eq('ncc_driver_id', driver.id)
  } else {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('production_id', driver.production_id)
      .eq('driver_crew_id', driver.id)
      .eq('active', true)
      .single()
    if (vehicle) sessionQuery = sessionQuery.eq('vehicle_id', vehicle.id)
  }

  const { data: session } = await sessionQuery.single()

  if (session) {
    await supabase
      .from('vehicle_tracking_sessions')
      .update({ status: 'ACTIVE', current_trip_id: trip_id })
      .eq('id', session.id)
  }

  return Response.json({ ok: true })
}
