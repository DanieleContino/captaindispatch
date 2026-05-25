import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { vehicle_id, production_id, requested_by } = await request.json()

  if (!vehicle_id || !production_id) {
    return Response.json({ error: 'vehicle_id and production_id required' }, { status: 400 })
  }

  // 1. Trova sessione attiva per questo veicolo
  const { data: session } = await supabase
    .from('vehicle_tracking_sessions')
    .select('id, vehicle_id, ncc_driver_id, driver_name, type')
    .eq('production_id', production_id)
    .eq('vehicle_id', vehicle_id)
    .neq('status', 'ENDED')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) {
    return Response.json({ error: 'No active session for this vehicle' }, { status: 404 })
  }

  // 2. Trova il driver_token dalla sessione
  let driver_token = null

  if (session.ncc_driver_id) {
    const { data: nccDriver } = await supabase
      .from('ncc_drivers')
      .select('tracking_token')
      .eq('id', session.ncc_driver_id)
      .single()
    driver_token = nccDriver?.tracking_token || null
  } else {
    // CREW: trova il driver dal veicolo
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('driver_crew_id')
      .eq('id', vehicle_id)
      .eq('production_id', production_id)
      .single()
    if (vehicle?.driver_crew_id) {
      const { data: crew } = await supabase
        .from('crew')
        .select('tracking_token')
        .eq('id', vehicle.driver_crew_id)
        .single()
      driver_token = crew?.tracking_token || null
    }
  }

  // 3. Crea dispatch_message PING_REQUEST
  const { data: message, error } = await supabase
    .from('dispatch_messages')
    .insert({
      production_id,
      ncc_driver_id:  session.ncc_driver_id || null,
      driver_token,
      direction:      'TO_DRIVER',
      message_type:   'PING_REQUEST',
      body:           'Position requested by coordinator',
      sent_at:        new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, message_id: message.id })
}
