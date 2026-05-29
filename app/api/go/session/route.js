import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 })
  }

  // 1. Cerca in ncc_drivers
  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, name, phone, production_id, agency_id, is_active, token_type')
    .eq('tracking_token', token)
    .single()

  // 2. Cerca in crew se non trovato in ncc_drivers
  let driver = null
  let driverType = null

  if (nccDriver) {
    driver = nccDriver
    driverType = 'NCC'
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('id, full_name, production_id, department')
      .eq('tracking_token', token)
      .single()

    if (crewDriver) {
      driver = { ...crewDriver, name: crewDriver.full_name }
      driverType = 'CREW'
    }
  }

  if (!driver) {
    return Response.json({ error: 'Invalid token' }, { status: 404 })
  }

  if (!driver.is_active && driverType === 'NCC') {
    return Response.json({ error: 'Driver not active' }, { status: 403 })
  }

  const productionId = driver.production_id

  // 3. Trova veicolo assegnato al driver
  let vehicle = null
  if (driverType === 'NCC') {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id, vehicle_type, sign_code, capacity, license_plate')
      .eq('production_id', productionId)
      .eq('ncc_driver_id', driver.id)
      .eq('active', true)
      .single()
    vehicle = v || null
  } else {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id, vehicle_type, sign_code, capacity, license_plate')
      .eq('production_id', productionId)
      .eq('driver_crew_id', driver.id)
      .eq('active', true)
      .single()
    vehicle = v || null
  }

  // 4. Trip del giorno
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
  let trips = []
  if (vehicle) {
    const { data: tripData } = await supabase
      .from('trips')
      .select('id, trip_id, trip_group_id, leg_order, pickup_id, dropoff_id, pickup_min, call_min, start_dt, end_dt, started_at, arrived_at, status, pax_count, passenger_list, service_type, transfer_class')
      .eq('production_id', productionId)
      .eq('vehicle_id', vehicle.id)
      .eq('date', today)
    const rawTrips = tripData || []
    // DONE → ordina per started_at reale, altri → per pickup_min pianificato
    trips = rawTrips.sort((a, b) => {
      const aTime = (a.status === 'DONE' && a.started_at) ? new Date(a.started_at) : (a.pickup_min ?? a.call_min ?? 9999)
      const bTime = (b.status === 'DONE' && b.started_at) ? new Date(b.started_at) : (b.pickup_min ?? b.call_min ?? 9999)
      if (aTime instanceof Date && bTime instanceof Date) return aTime - bTime
      if (aTime instanceof Date) return -1
      if (bTime instanceof Date) return 1
      return aTime - bTime
    })
  }

  // 5. Locations per trip
  const locationIds = [...new Set([
    ...trips.map(t => t.pickup_id),
    ...trips.map(t => t.dropoff_id),
  ].filter(Boolean))]

  let locsMap = {}
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('id, name, lat, lng, address')
      .in('id', locationIds)
    ;(locs || []).forEach(l => { locsMap[l.id] = l })
  }

  // 6. Sessione attiva oggi
  let sessionQuery = supabase
    .from('vehicle_tracking_sessions')
    .select('id, status, current_trip_id, started_at')
    .eq('production_id', productionId)
    .neq('status', 'ENDED')
    .order('started_at', { ascending: false })
    .limit(1)

  if (driverType === 'NCC') {
    sessionQuery = sessionQuery.eq('ncc_driver_id', driver.id)
  } else if (vehicle) {
    sessionQuery = sessionQuery.eq('vehicle_id', vehicle.id)
  }

  const { data: activeSession } = await sessionQuery.single()

  return Response.json({
    driver: {
      id:   driver.id,
      name: driver.name,
      type: driverType,
    },
    vehicle,
    trips,
    locsMap,
    session: activeSession || null,
    today,
  })
}
