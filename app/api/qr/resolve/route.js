/**
 * GET /api/qr/resolve?qr=CR:CR0001
 * GET /api/qr/resolve?qr=VH:VAN-01
 *
 * Risolve un codice QR CAPTAIN in dati live da Supabase.
 * Il QR contiene solo l'ID statico (CR:xxx o VH:xxx).
 * I dati (nome, hotel, status) sono sempre freschi — cambi non richiedono nuovo QR.
 *
 * Equivalente di resolveQR() in 01_Crew.gs / 07_FleetReports.gs
 */

import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const qr = searchParams.get('qr') || ''

  if (!qr) {
    return Response.json({ error: 'Missing qr parameter' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  // ── Crew: CR:CR0001 ──────────────────────────────────────
  if (qr.startsWith('CR:')) {
    const crewId = qr.slice(3)
    const { data, error } = await supabase
      .from('crew')
      .select('id, full_name, department, hotel_id, hotel_status, travel_status, arrival_date, departure_date, notes, production_id')
      .eq('id', crewId)
      .maybeSingle()

    if (error || !data) {
      return Response.json({ error: 'Crew not found', qr }, { status: 404 })
    }

    // Resolve hotel name
    let hotelName = null
    if (data.hotel_id) {
      const { data: loc } = await supabase.from('locations').select('name').eq('id', data.hotel_id).maybeSingle()
      hotelName = loc?.name || data.hotel_id
    }

    return Response.json({
      type:       'crew',
      id:         data.id,
      full_name:  data.full_name,
      department: data.department,
      hotel: {
        id:     data.hotel_id,
        name:   hotelName,
      },
      hotel_status:   data.hotel_status,
      travel_status:  data.travel_status,
      arrival_date:   data.arrival_date,
      departure_date: data.departure_date,
      notes:          data.notes,
      production_id:  data.production_id,
    })
  }

  // ── Vehicle: VH:VAN-01 ────────────────────────────────────
  if (qr.startsWith('VH:')) {
    const vehicleId = qr.slice(3)
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .maybeSingle()

    if (error || !data) {
      return Response.json({ error: 'Vehicle not found', qr }, { status: 404 })
    }

    // Trip corrente (se esiste)
    const now = new Date().toISOString()
    const { data: currentTrip } = await supabase
      .from('trips')
      .select('trip_id, status, pickup_id, dropoff_id, start_dt, end_dt, passenger_list, pax_count')
      .eq('vehicle_id', vehicleId)
      .eq('production_id', data.production_id)
      .lte('start_dt', now)
      .gte('end_dt', now)
      .maybeSingle()

    return Response.json({
      type:         'vehicle',
      id:           data.id,
      vehicle_type: data.vehicle_type,
      capacity:     data.capacity,
      driver_name:  data.driver_name,
      sign_code:    data.sign_code,
      unit_default: data.unit_default,
      active:       data.active,
      current_trip: currentTrip || null,
    })
  }

  return Response.json({ error: 'Unknown QR format. Expected CR:xxx or VH:xxx', qr }, { status: 400 })
}
