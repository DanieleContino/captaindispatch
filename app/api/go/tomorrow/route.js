import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) return Response.json({ error: 'Token required' }, { status: 400 })

  // 1. Risolvi token → driver + productionId + vehicle (identico a session)
  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, name, production_id, is_active')
    .eq('tracking_token', token)
    .single()

  let driver = null, driverType = null
  if (nccDriver) {
    driver = nccDriver; driverType = 'NCC'
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('uuid, full_name, production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) { driver = { ...crewDriver, name: crewDriver.full_name }; driverType = 'CREW' }
  }

  if (!driver) return Response.json({ error: 'Invalid token' }, { status: 404 })

  const productionId = driver.production_id

  // 2. Trova veicolo
  let vehicle = null
  if (driverType === 'NCC') {
    const { data: v } = await supabase
      .from('vehicles')
      .select('uuid, display_id, sign_code')
      .eq('production_id', productionId)
      .eq('ncc_driver_id', driver.id)
      .eq('active', true)
      .single()
    vehicle = v || null
  } else {
    const { data: v } = await supabase
      .from('vehicles')
      .select('uuid, display_id, sign_code')
      .eq('production_id', productionId)
      .eq('driver_crew_id', driver.uuid)
      .eq('active', true)
      .single()
    vehicle = v || null
  }

  // 3. Tomorrow date
  const tomorrow = (() => {
    const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().split('T')[0]
  })()

  // 4. Trips domani
  let trips = []
  if (vehicle) {
    const { data: tripData } = await supabase
      .from('trips')
      .select('id, trip_id, trip_group_id, leg_order, pickup_id, dropoff_id, pickup_min, call_min, status, pax_count, passenger_list, service_type, transfer_class')
      .eq('production_id', productionId)
      .eq('vehicle_id', vehicle.uuid)
      .eq('date', tomorrow)
      .neq('status', 'CANCELLED')
      .order('pickup_min', { ascending: true })
    trips = tripData || []
  }

  // 5. Locations
  const locationIds = [...new Set([
    ...trips.map(t => t.pickup_id),
    ...trips.map(t => t.dropoff_id),
  ].filter(Boolean))]

  let locsMap = {}
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('uuid, name, lat, lng')
      .in('uuid', locationIds)
    ;(locs || []).forEach(l => { locsMap[l.uuid] = l })
  }

  // 6. TL published domani?
  const { data: tlPub } = await supabase
    .from('tl_publications')
    .select('id, published_at')
    .eq('production_id', productionId)
    .eq('date', tomorrow)
    .single()

  return Response.json({
    trips,
    locsMap,
    tl_published: !!tlPub,
    tl_published_at: tlPub?.published_at || null,
    tomorrow,
  })
}
