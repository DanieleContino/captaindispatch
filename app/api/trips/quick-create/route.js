import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../lib/supabaseServer'

export const dynamic = 'force-dynamic'

const pad2 = n => String(n).padStart(2, '0')

function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}

export async function POST(request) {
  try {
    const { productionId, vehicleId, date, callTime, serviceType, pickupId, dropoffIds, passengerIds, notifyDriver } = await request.json()

    if (!productionId || !vehicleId || !date || !callTime || !serviceType || !pickupId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!dropoffIds || dropoffIds.length === 0) {
      return Response.json({ error: 'At least one dropoff required' }, { status: 400 })
    }

    // 1. Verifica autenticazione
    const authClient = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // 2. Verifica accesso alla produzione
    const { data: role } = await authClient
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('production_id', productionId)
      .maybeSingle()
    if (!role) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const serviceClient = await createSupabaseServiceClient()

    // 3. Carica veicolo
    const { data: vehicle } = await serviceClient
      .from('vehicles')
      .select('id, sign_code, capacity, vehicle_type, driver_name, ncc_driver_id, driver_crew_id')
      .eq('id', vehicleId)
      .eq('production_id', productionId)
      .single()
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 })

    // 4. Calcola tempi
    const callMin = timeStrToMin(callTime)
    const now = new Date()
    const tripId = 'Q_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())

    // Cerca durata rotta pickup → primo dropoff
    const { data: route } = await serviceClient
      .from('routes')
      .select('duration_min')
      .eq('production_id', productionId)
      .eq('from_id', pickupId)
      .eq('to_id', dropoffIds[0])
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

    // 5. Inserisci una riga per ogni dropoff (stesso trip_id)
    const rows = dropoffIds.map(dropoffId => ({
      production_id: productionId,
      trip_id:       tripId,
      date,
      service_type:  serviceType,
      pickup_id:     pickupId,
      dropoff_id:    dropoffId,
      vehicle_id:    vehicle.id,
      driver_name:   vehicle.driver_name || null,
      sign_code:     vehicle.sign_code || null,
      capacity:      vehicle.capacity || null,
      duration_min:  durMin,
      call_min:      callMin,
      pickup_min:    pickupMin,
      start_dt:      startDt,
      end_dt:        endDt,
      status:        'PLANNED',
      pax_count:     passengerIds?.length || 0,
      source:        'DISPATCHER',
    }))

    const { data: inserted, error: insErr } = await serviceClient
      .from('trips')
      .insert(rows)
      .select('id')
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

    // 6. Inserisci passeggeri sulla prima riga
    if (inserted?.length > 0 && passengerIds?.length > 0) {
      await serviceClient
        .from('trip_passengers')
        .insert(passengerIds.map(crewId => ({
          production_id: productionId,
          trip_row_id:   inserted[0].id,
          crew_id:       crewId,
        })))
    }

    // 7. Notifica driver via dispatch_messages (opzionale)
    if (notifyDriver) {
      // Trova driver_token
      let driver_token = null
      let ncc_driver_id = null

      if (vehicle.ncc_driver_id) {
        ncc_driver_id = vehicle.ncc_driver_id
        const { data: nccDriver } = await serviceClient
          .from('ncc_drivers')
          .select('tracking_token')
          .eq('id', vehicle.ncc_driver_id)
          .single()
        driver_token = nccDriver?.tracking_token || null
      } else if (vehicle.driver_crew_id) {
        const { data: crew } = await serviceClient
          .from('crew')
          .select('tracking_token')
          .eq('id', vehicle.driver_crew_id)
          .single()
        driver_token = crew?.tracking_token || null
      }

      if (driver_token) {
        // Carica nomi locations per il messaggio
        const { data: locs } = await serviceClient
          .from('locations')
          .select('id, name')
          .in('id', [pickupId, ...dropoffIds])
        const locsMap = Object.fromEntries((locs || []).map(l => [l.id, l.name]))
        const pickupName  = locsMap[pickupId] || pickupId
        const dropoffNames = dropoffIds.map(id => locsMap[id] || id).join(', ')
        const body = `New trip assigned: ${pickupName} → ${dropoffNames} · ${callTime} · ${passengerIds?.length || 0} pax`

        await serviceClient
          .from('dispatch_messages')
          .insert({
            production_id: productionId,
            ncc_driver_id,
            driver_token,
            direction:     'TO_DRIVER',
            message_type:  'TRIP_ASSIGNED',
            body,
            sent_at:       new Date().toISOString(),
          })
      }
    }

    return Response.json({ ok: true, trip_id: tripId, ids: inserted.map(r => r.id) })

  } catch (e) {
    console.error('[quick-create] error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
