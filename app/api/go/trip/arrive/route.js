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

  // 2. Carica il leg corrente
  const { data: currentLeg } = await supabase
    .from('trips')
    .select('id, trip_id, trip_group_id, leg_order, service_type, status, production_id')
    .eq('id', trip_id)
    .single()

  if (!currentLeg) return Response.json({ error: 'Trip not found' }, { status: 404 })

  // 3. Recupera sessione attiva
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

  const now = new Date().toISOString()

  // 5. Logica multi-leg vs single
  const isMultiLeg = currentLeg.trip_group_id && true

  if (isMultiLeg) {
    // Carica tutti i leg del gruppo ordinati
    const { data: allLegs } = await supabase
      .from('trips')
      .select('id, leg_order, status, service_type')
      .eq('trip_group_id', currentLeg.trip_group_id)
      .eq('production_id', driver.production_id)
      .order('leg_order', { ascending: true })

    const legs = allLegs || []
    const currentIndex = legs.findIndex(l => l.id === trip_id)
    const nextLeg = legs[currentIndex + 1] || null
    const isLastLeg = !nextLeg

    // Segna questo leg come DONE
    await supabase
      .from('trips')
      .update({
        status: 'DONE',
        arrived_at: now,
        ...(isLastLeg && actualKm !== null ? { actual_km: actualKm } : {}),
      })
      .eq('id', trip_id)

    // Avanza il prossimo leg a BUSY
    if (nextLeg) {
      await supabase
        .from('trips')
        .update({ status: 'BUSY', started_at: now })
        .eq('id', nextLeg.id)
    }

    // Aggiorna sessione → STANDBY solo se era l'ultimo leg
    if (isLastLeg && session) {
      await supabase
        .from('vehicle_tracking_sessions')
        .update({ status: 'STANDBY', current_trip_id: null })
        .eq('id', session.id)
    }

  } else {
    // ── SINGLE TRIP: comportamento invariato ──────────────────
    const { data: tripRow } = await supabase
      .from('trips')
      .select('trip_id')
      .eq('id', trip_id)
      .single()

    await supabase
      .from('trips')
      .update({
        status: 'DONE',
        arrived_at: now,
        ...(actualKm !== null ? { actual_km: actualKm } : {}),
      })
      .eq('trip_id', tripRow?.trip_id || trip_id)
      .eq('production_id', driver.production_id)

    if (session) {
      await supabase
        .from('vehicle_tracking_sessions')
        .update({ status: 'STANDBY', current_trip_id: null })
        .eq('id', session.id)
    }
  }

  return Response.json({ ok: true })
}
