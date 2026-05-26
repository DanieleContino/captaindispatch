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

  // 2. Trova trip_id testuale dalla row UUID
  const { data: tripRow } = await supabase
    .from('trips')
    .select('trip_id')
    .eq('id', trip_id)
    .single()

  // 3. Recupera sessione attiva (prima di aggiornare il trip)
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

  // 4. Calcola actual_km da vehicle_positions della sessione attiva
  let actualKm = null
  if (session?.id) {
    const { data: positions } = await supabase
      .from('vehicle_positions')
      .select('lat, lng, recorded_at')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: true })
    if (positions && positions.length > 1) {
      let totalMeters = 0
      for (let i = 1; i < positions.length; i++) {
        const a = positions[i - 1]
        const b = positions[i]
        const R = 6371000
        const dLat = (b.lat - a.lat) * Math.PI / 180
        const dLng = (b.lng - a.lng) * Math.PI / 180
        const sinLat = Math.sin(dLat / 2)
        const sinLng = Math.sin(dLng / 2)
        const c = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng
        const dist = R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))
        if (dist < 2000) totalMeters += dist
      }
      actualKm = Math.round(totalMeters / 100) / 10
    }
  }

  // 5. Aggiorna tutte le rows con lo stesso trip_id
  const { error: tripErr } = await supabase
    .from('trips')
    .update({ status: 'DONE', arrived_at: new Date().toISOString(), ...(actualKm !== null && { actual_km: actualKm }) })
    .eq('trip_id', tripRow?.trip_id || trip_id)
    .eq('production_id', driver.production_id)

  if (tripErr) return Response.json({ error: tripErr.message }, { status: 500 })

  // 6. Aggiorna sessione → STANDBY
  if (session) {
    await supabase
      .from('vehicle_tracking_sessions')
      .update({ status: 'STANDBY', current_trip_id: null })
      .eq('id', session.id)
  }

  return Response.json({ ok: true })
}
