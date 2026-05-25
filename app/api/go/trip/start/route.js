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

  // 2. Aggiorna trip status
  const { error: tripErr } = await supabase
    .from('trips')
    .update({ status: 'BUSY' })
    .eq('id', trip_id)
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
