import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { token, lat, lng, accuracy, speed, session_id } = await request.json()

  if (!token || lat === undefined || lng === undefined) {
    return Response.json({ error: 'token, lat, lng required' }, { status: 400 })
  }

  // 1. Risolvi token → driver
  let driver = null
  let driverType = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
    driverType = 'NCC'
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('uuid, production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) {
      driver = crewDriver
      driverType = 'CREW'
    }
  }

  if (!driver) {
    return Response.json({ error: 'Invalid token' }, { status: 404 })
  }

  // 2. Trova sessione attiva
  let sessionQuery = supabase
    .from('vehicle_tracking_sessions')
    .select('id, vehicle_id')
    .eq('production_id', driver.production_id)
    .neq('status', 'ENDED')
    .order('started_at', { ascending: false })
    .limit(1)

  if (driverType === 'NCC') {
    sessionQuery = sessionQuery.eq('ncc_driver_id', driver.id)
  } else {
    // CREW: usa session_id se fornito, altrimenti cerca per production_id
    if (session_id) {
      sessionQuery = supabase
        .from('vehicle_tracking_sessions')
        .select('id, vehicle_id')
        .eq('id', session_id)
        .limit(1)
    }
  }

  const { data: session } = await sessionQuery.single()

  if (!session) {
    return Response.json({ error: 'No active session' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // 3. Aggiorna last_lat/lng su vehicle_tracking_sessions
  await supabase
    .from('vehicle_tracking_sessions')
    .update({
      last_lat:     lat,
      last_lng:     lng,
      last_seen_at: now,
      status:       'ACTIVE',
    })
    .eq('id', session.id)

  // 4. Inserisci record storico in vehicle_positions
  await supabase
    .from('vehicle_positions')
    .insert({
      session_id: session.id,
      lat,
      lng,
      accuracy:    accuracy ?? null,
      speed:       speed ?? null,
      signal:      'GPS',
      recorded_at: now,
    })

  return Response.json({ ok: true, session_id: session.id })
}
