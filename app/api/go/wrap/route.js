import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

const pad2 = n => String(n).padStart(2, '0')

function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}

export async function POST(request) {
  const { token, date, callTime, serviceType, pickupId, dropoffId, passengerIds } = await request.json()

  if (!token) return Response.json({ error: 'Token required' }, { status: 400 })
  if (!date || !callTime || !serviceType || !pickupId) {
    return Response.json({ error: 'date, callTime, serviceType, pickupId required' }, { status: 400 })
  }

  // 1. Risolvi token → driver + production_id
  let driver = null
  let vehicle = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('id, name, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
    const { data: v } = await supabase
      .from('vehicles')
      .select('uuid, id, sign_code, capacity, vehicle_type, driver_name')
      .eq('production_id', nccDriver.production_id)
      .eq('ncc_driver_id', nccDriver.id)
      .eq('active', true)
      .single()
    vehicle = v || null
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('uuid, id, full_name, production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) {
      driver = { ...crewDriver, name: crewDriver.full_name }
      const { data: v } = await supabase
        .from('vehicles')
        .select('uuid, id, sign_code, capacity, vehicle_type, driver_name')
        .eq('production_id', crewDriver.production_id)
        .eq('driver_crew_id', crewDriver.uuid)
        .eq('active', true)
        .single()
      vehicle = v || null
    }
  }

  if (!driver) return Response.json({ error: 'Invalid token' }, { status: 404 })

  const productionId = driver.production_id

  // 2. Calcola tempi
  const callMin = timeStrToMin(callTime)
  const now = new Date()
  const tripId = 'W_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())

  // Cerca durata rotta
  const { data: route } = await supabase
    .from('routes')
    .select('duration_min')
    .eq('production_id', productionId)
    .eq('from_id', pickupId)
    .eq('to_id', dropoffId || pickupId)
    .maybeSingle()
  const durMin = route?.duration_min || 30

  const callIsPickup = ['Wrap', 'Charter', 'Other'].includes(serviceType)
  const pickupMin = callMin !== null
    ? (callIsPickup ? callMin : ((callMin - durMin) % 1440 + 1440) % 1440)
    : null

  const [y, mo, dd] = date.split('-').map(Number)
  const startMs = pickupMin !== null
    ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
    : null
  const startDt = startMs ? new Date(startMs).toISOString() : null
  const endDt   = startMs ? new Date(startMs + (callIsPickup ? 2 * durMin : durMin) * 60000).toISOString() : null

  // 3. Crea trip
  const { data: ins, error: insErr } = await supabase
    .from('trips')
    .insert({
      production_id: productionId,
      trip_id:       tripId,
      date,
      service_type:  serviceType,
      pickup_id:     pickupId,
      dropoff_id:    dropoffId || null,
      vehicle_id:    vehicle?.uuid || null,
      driver_name:   driver.name,
      sign_code:     vehicle?.sign_code || null,
      capacity:      vehicle?.capacity || null,
      duration_min:  durMin,
      call_min:      callMin,
      pickup_min:    pickupMin,
      start_dt:      startDt,
      end_dt:        endDt,
      status:        'PLANNED',
      pax_count:     passengerIds?.length || 0,
      source:        'DRIVER',
    })
    .select('id')
    .single()

  if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

  // 4. Inserisci passeggeri
  if (ins?.id && passengerIds?.length > 0) {
    await supabase
      .from('trip_passengers')
      .insert(passengerIds.map(crewId => ({
        production_id: productionId,
        trip_row_id:   ins.id,
        crew_id:       crewId,
      })))
  }

  return Response.json({ ok: true, trip_id: tripId, id: ins.id })
}
