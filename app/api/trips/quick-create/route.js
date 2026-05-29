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
    const { productionId, vehicleId, date, callTime, pickupTime, serviceType, pickupId, dropoffIds, passengerIds, notifyDriver, legs } = await request.json()

    const isLegsMode = Array.isArray(legs) && legs.length > 0

    if (!productionId || !vehicleId || !date || !callTime || !serviceType) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isLegsMode) {
      if (!pickupId) return Response.json({ error: 'Missing required fields' }, { status: 400 })
      if (!dropoffIds || dropoffIds.length === 0) return Response.json({ error: 'At least one dropoff required' }, { status: 400 })
    } else {
      for (const leg of legs) {
        if (!leg.pickupId || !leg.dropoffId) return Response.json({ error: 'Each leg requires pickupId and dropoffId' }, { status: 400 })
      }
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

    // ── LEGS MODE ─────────────────────────────────────────────
    if (isLegsMode) {
      // Raccoglie tutti i passeggeri unici per caricare i nomi
      const allPassengerIds = [...new Set(legs.flatMap(l => l.passengerIds || []))]
      let crewMap = {}
      if (allPassengerIds.length > 0) {
        const { data: crewData } = await serviceClient.from('crew').select('id, full_name').in('id', allPassengerIds)
        crewMap = Object.fromEntries((crewData || []).map(c => [c.id, c.full_name]))
      }

      // Calcola duration_min per ogni leg
      async function getLegDurMin(fromId, toId) {
        const { data: route } = await serviceClient
          .from('routes')
          .select('duration_min')
          .eq('production_id', productionId)
          .eq('from_id', fromId)
          .eq('to_id', toId)
          .maybeSingle()
        return route?.duration_min || 30
      }

      const durMins = await Promise.all(legs.map(l => getLegDurMin(l.pickupId, l.dropoffId)))

      const [y, mo, dd] = date.split('-').map(Number)
      const hasPickupTime = !!pickupTime
      const callIsPickup = ['Wrap', 'Charter', 'Other'].includes(serviceType) || hasPickupTime
      const callMin = hasPickupTime ? null : timeStrToMin(callTime)
      const forcedPickupMin = hasPickupTime ? timeStrToMin(pickupTime) : null
      const tripGroupId = crypto.randomUUID()
      const now = new Date()
      const tripId = 'Q_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())

      const rows = legs.map((leg, i) => {
        const durMin = durMins[i]
        const pickupMin = forcedPickupMin !== null
          ? forcedPickupMin
          : callMin !== null
            ? (callIsPickup ? callMin : ((callMin - durMin) % 1440 + 1440) % 1440)
            : null
        const startMs = pickupMin !== null
          ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
          : null
        const startDt = startMs ? new Date(startMs).toISOString() : null
        const endDt   = startMs ? new Date(startMs + (callIsPickup ? 2 * durMin : durMin) * 60000).toISOString() : null
        const legPassengerIds = leg.passengerIds || []
        const legPassengerNames = legPassengerIds.map(id => crewMap[id]).filter(Boolean)

        return {
          production_id:  productionId,
          trip_id:        tripId,
          trip_group_id:  tripGroupId,
          leg_order:      i + 1,
          date,
          service_type:   serviceType,
          pickup_id:      leg.pickupId,
          dropoff_id:     leg.dropoffId,
          vehicle_id:     vehicle.id,
          driver_name:    vehicle.driver_name || null,
          sign_code:      vehicle.sign_code || null,
          capacity:       vehicle.capacity || null,
          duration_min:   durMin,
          call_min:       callMin,
          pickup_min:     pickupMin,
          start_dt:       startDt,
          end_dt:         endDt,
          status:         'PLANNED',
          pax_count:      legPassengerIds.length,
          passenger_list: legPassengerNames.join(', ') || null,
          source:         'DISPATCHER',
        }
      })

      const { data: inserted, error: insErr } = await serviceClient.from('trips').insert(rows).select('id, leg_order')
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

      // Inserisci passeggeri per ogni leg solo sul proprio trip row
      if (inserted?.length > 0) {
        const paxRows = inserted.flatMap((row, i) => {
          const legPassengerIds = legs[i]?.passengerIds || []
          return legPassengerIds.map(crewId => ({
            production_id: productionId,
            trip_row_id:   row.id,
            crew_id:       crewId,
          }))
        })
        if (paxRows.length > 0) await serviceClient.from('trip_passengers').insert(paxRows)
      }

      // compute-chain per ottimizzare timing
      if (inserted?.length > 1) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://captaindispatch.com'}/api/routes/compute-chain`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ trip_group_id: tripGroupId, production_id: productionId }),
          })
        } catch (e) {
          console.warn('[quick-create] compute-chain legs failed:', e)
        }
      }

      // Notifica driver
      if (notifyDriver) {
        let driver_token = null
        let ncc_driver_id = null
        if (vehicle.ncc_driver_id) {
          ncc_driver_id = vehicle.ncc_driver_id
          const { data: nccDriver } = await serviceClient.from('ncc_drivers').select('tracking_token').eq('id', vehicle.ncc_driver_id).single()
          driver_token = nccDriver?.tracking_token || null
        } else if (vehicle.driver_crew_id) {
          const { data: crew } = await serviceClient.from('crew').select('tracking_token').eq('id', vehicle.driver_crew_id).single()
          driver_token = crew?.tracking_token || null
        }
        if (driver_token) {
          const allPickups  = [...new Set(legs.map(l => l.pickupId))]
          const allDropoffs = [...new Set(legs.map(l => l.dropoffId))]
          const { data: locs } = await serviceClient.from('locations').select('id, name').in('id', [...allPickups, ...allDropoffs])
          const locsMap = Object.fromEntries((locs || []).map(l => [l.id, l.name]))
          const body = `New trip assigned: ${legs.length} stops · ${callTime} · ${allPassengerIds.length} pax`
          await serviceClient.from('dispatch_messages').insert({
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

      return Response.json({ ok: true, trip_id: tripId, trip_group_id: tripGroupId, ids: inserted.map(r => r.id) })
    }
    // ── FINE LEGS MODE ────────────────────────────────────────

    // 4. Carica nomi passeggeri se presenti
    let passengerNames = []
    if (passengerIds?.length > 0) {
      const { data: crewData } = await serviceClient
        .from('crew')
        .select('id, full_name')
        .in('id', passengerIds)
      passengerNames = (crewData || []).map(c => c.full_name)
    }
    const passengerList = passengerNames.join(', ') || null

    // 5. Calcola tempi base
    const hasPickupTime = !!pickupTime
    const callIsPickup = ['Wrap', 'Charter', 'Other'].includes(serviceType) || hasPickupTime
    const callMin = hasPickupTime ? null : timeStrToMin(callTime)
    const forcedPickupMin = hasPickupTime ? timeStrToMin(pickupTime) : null
    const now = new Date()
    const tripId = 'Q_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())
    const tripGroupId = crypto.randomUUID()

    // 6. Calcola duration_min per ogni dropoff separatamente
    async function getDurMin(toId) {
      const { data: route } = await serviceClient
        .from('routes')
        .select('duration_min')
        .eq('production_id', productionId)
        .eq('from_id', pickupId)
        .eq('to_id', toId)
        .maybeSingle()
      return route?.duration_min || 30
    }

    const durMins = await Promise.all(dropoffIds.map(getDurMin))

    // 7. Costruisci righe per ogni dropoff
    const [y, mo, dd] = date.split('-').map(Number)
    const rows = dropoffIds.map((dropoffId, i) => {
      const durMin = durMins[i]
      const pickupMin = forcedPickupMin !== null
        ? forcedPickupMin
        : callMin !== null
          ? (callIsPickup ? callMin : ((callMin - durMin) % 1440 + 1440) % 1440)
          : null
      const startMs = pickupMin !== null
        ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
        : null
      const startDt = startMs ? new Date(startMs).toISOString() : null
      const endDt   = startMs ? new Date(startMs + (callIsPickup ? 2 * durMin : durMin) * 60000).toISOString() : null

      return {
        production_id:  productionId,
        trip_id:        tripId,
        trip_group_id:  tripGroupId,
        leg_order:      i + 1,
        date,
        service_type:   serviceType,
        pickup_id:      pickupId,
        dropoff_id:     dropoffId,
        vehicle_id:     vehicle.id,
        driver_name:    vehicle.driver_name || null,
        sign_code:      vehicle.sign_code || null,
        capacity:       vehicle.capacity || null,
        duration_min:   durMin,
        call_min:       callMin,
        pickup_min:     pickupMin,
        start_dt:       startDt,
        end_dt:         endDt,
        status:         'PLANNED',
        pax_count:      passengerIds?.length || 0,
        passenger_list: passengerList,
        source:         'DISPATCHER',
      }
    })

    const { data: inserted, error: insErr } = await serviceClient
      .from('trips')
      .insert(rows)
      .select('id, leg_order')
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

    // 8. Inserisci passeggeri su TUTTE le righe (non solo la prima)
    if (inserted?.length > 0 && passengerIds?.length > 0) {
      const paxRows = inserted.flatMap(row =>
        passengerIds.map(crewId => ({
          production_id: productionId,
          trip_row_id:   row.id,
          crew_id:       crewId,
        }))
      )
      await serviceClient.from('trip_passengers').insert(paxRows)
    }

    // 9. Se multi-dropoff, chiama compute-chain per ottimizzare timing
    if (inserted?.length > 1) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://captaindispatch.com'}/api/routes/compute-chain`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ trip_group_id: tripGroupId, production_id: productionId }),
        })
      } catch (e) {
        console.warn('[quick-create] compute-chain failed:', e)
      }
    }

    // 10. Notifica driver via dispatch_messages (opzionale)
    if (notifyDriver) {
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
        const { data: locs } = await serviceClient
          .from('locations')
          .select('id, name')
          .in('id', [pickupId, ...dropoffIds])
        const locsMap = Object.fromEntries((locs || []).map(l => [l.id, l.name]))
        const pickupName   = locsMap[pickupId] || pickupId
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

    return Response.json({ ok: true, trip_id: tripId, trip_group_id: tripGroupId, ids: inserted.map(r => r.id) })

  } catch (e) {
    console.error('[quick-create] error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
