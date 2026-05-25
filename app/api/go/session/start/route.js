import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { token } = await request.json()

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 })
  }

  // 1. Risolvi token → driver
  let driver = null
  let driverType = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, name, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
    driverType = 'NCC'
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('id, full_name, production_id')
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

  const productionId = driver.production_id

  // 2. Trova veicolo assegnato
  let vehicle = null
  if (driverType === 'NCC') {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id')
      .eq('production_id', productionId)
      .eq('ncc_driver_id', driver.id)
      .eq('active', true)
      .single()
    vehicle = v
  } else {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id')
      .eq('production_id', productionId)
      .eq('driver_crew_id', driver.id)
      .eq('active', true)
      .single()
    vehicle = v
  }

  // 3. Controlla se esiste già sessione attiva oggi
  const { data: existing } = await supabase
    .from('vehicle_tracking_sessions')
    .select('id, status')
    .eq('production_id', productionId)
    .eq('ncc_driver_id', driverType === 'NCC' ? driver.id : null)
    .neq('status', 'ENDED')
    .limit(1)
    .single()

  if (existing) {
    return Response.json({ session: existing, already_active: true })
  }

  // 4. Crea nuova sessione
  const { data: session, error } = await supabase
    .from('vehicle_tracking_sessions')
    .insert({
      production_id:  productionId,
      vehicle_id:     vehicle?.id || null,
      ncc_driver_id:  driverType === 'NCC' ? driver.id : null,
      driver_name:    driver.name,
      type:           'DAY',
      status:         'STANDBY',
    })
    .select('id, status')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ session, already_active: false })
}
