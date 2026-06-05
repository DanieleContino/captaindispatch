'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { timeStrToMin, isVehicleAvailableForDate } from '../../../../lib/tripUtils'

export default function TripSidebarMulti({ open, onClose, onSaved, locations, vehicles, serviceTypes, defaultDate, PRODUCTION_ID, initialTripType, onSwitchToSingle }) {

  const [tripType,    setTripType]    = useState('MULTI-PICK') // 'MULTI-PICK' | 'MULTI-DROP' | 'MISTO'
  const [date,        setDate]        = useState(defaultDate || '')
  const [tripId,      setTripId]      = useState('')
  const [vehicleId,   setVehicleId]   = useState('')
  const [callTime,    setCallTime]    = useState('')
  const [pickupTime,  setPickupTime]  = useState('')
  const [commonLocId, setCommonLocId] = useState('')
  const [flightNo,    setFlightNo]    = useState('')
  const [terminal,    setTerminal]    = useState('')
  const [legs,        setLegs]        = useState([]) // [{ localId, locationId, pickupId, dropoffId }]
  const [activeLegId, setActiveLegId] = useState(null)
  const [crewForLeg,  setCrewForLeg]  = useState({}) // { [localId]: [{ uuid, full_name, department }] }
  const [crewLists,   setCrewLists]   = useState({}) // { [locationUuid]: [{ uuid, full_name, department }] }
  const [legDurations, setLegDurations] = useState({}) // { [locationUuid]: duration_min }
  const [mistoLegs, setMistoLegs] = useState([]) // [{ localId, pickupId, dropoffId, crew: [] }]
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setTripType(initialTripType && initialTripType !== 'SINGLE' ? initialTripType : 'MULTI-PICK')
    setDate(defaultDate || '')
    setTripId('')
    setVehicleId('')
    setCallTime('')
    setPickupTime('')
    setCommonLocId('')
    setFlightNo('')
    setTerminal('')
    setLegs([])
    setActiveLegId(null)
    setCrewForLeg({})
    setCrewLists({})
    setLegDurations({})
    setError(null)
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id')
        .eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setTripId('T' + String(num + 1).padStart(3, '0'))
        })
    }
  }, [open, defaultDate])

  // Load crew for a location
  async function loadCrewForLocation(locationUuid) {
    if (!locationUuid || !PRODUCTION_ID || !date) return
    if (crewLists[locationUuid]) return // already loaded
    const q = supabase.from('crew_stays')
      .select('crew_id, arrival_date, departure_date, crew!inner(uuid, full_name, department, hotel_status)')
      .eq('production_id', PRODUCTION_ID)
      .eq('hotel_id', locationUuid)
      .lte('arrival_date', date)
      .gte('departure_date', date)
    const { data } = await q
    const crew = (data || [])
      .filter(s => s.crew?.hotel_status === 'CONFIRMED')
      .map(s => ({ uuid: s.crew.uuid, full_name: s.crew.full_name, department: s.crew.department }))
      .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name))
    setCrewLists(prev => ({ ...prev, [locationUuid]: crew }))
  }

  // Load route duration between two locations
  async function loadDuration(fromUuid, toUuid, legLocalId) {
    if (!fromUuid || !toUuid || !PRODUCTION_ID) return
    const { data } = await supabase.from('routes')
      .select('duration_min')
      .eq('production_id', PRODUCTION_ID)
      .eq('from_id', fromUuid)
      .eq('to_id', toUuid)
      .maybeSingle()
    if (data?.duration_min) {
      setLegDurations(prev => ({ ...prev, [legLocalId]: data.duration_min }))
    }
  }

  // When leg location changes
  function setLegLocation(localId, locationUuid) {
    setLegs(prev => prev.map(l => l.localId === localId ? { ...l, locationId: locationUuid } : l))
    if (locationUuid) {
      loadCrewForLocation(locationUuid)
      // Load duration: MULTI-PICK = location→commonLoc, MULTI-DROP = commonLoc→location
      if (commonLocId) {
        const from = tripType === 'MULTI-PICK' ? locationUuid : commonLocId
        const to   = tripType === 'MULTI-PICK' ? commonLocId  : locationUuid
        loadDuration(from, to, localId)
      }
    }
  }

  function addLeg() {
    const localId = Date.now().toString()
    setLegs(prev => [...prev, { localId, locationId: '', pickupId: '', dropoffId: '' }])
  }

  function removeLeg(localId) {
    setLegs(prev => prev.filter(l => l.localId !== localId))
    setCrewForLeg(prev => { const n = { ...prev }; delete n[localId]; return n })
    if (activeLegId === localId) setActiveLegId(null)
  }

  function moveLeg(localId, direction) {
    setLegs(prev => {
      const idx = prev.findIndex(l => l.localId === localId)
      if (direction === 'up' && idx === 0) return prev
      if (direction === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swap = direction === 'up' ? idx - 1 : idx + 1
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function toggleCrewForLeg(localId, crewMember) {
    setCrewForLeg(prev => {
      const current = prev[localId] || []
      const exists = current.find(c => c.uuid === crewMember.uuid)
      return {
        ...prev,
        [localId]: exists
          ? current.filter(c => c.uuid !== crewMember.uuid)
          : [...current, crewMember]
      }
    })
  }

  // Calculate pickup_min for each leg
  function getLegPickupMin(legIndex) {
    const baseMin = timeStrToMin(pickupTime) || timeStrToMin(callTime)
    if (baseMin === null) return null
    if (legIndex === 0) return baseMin
    let total = baseMin
    for (let i = 0; i < legIndex; i++) {
      const dur = legDurations[legs[i]?.localId] || 10
      total += dur
    }
    return total
  }

  function getLegTripId(idx) {
    return idx === 0 ? tripId : tripId + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[idx - 1]
  }

  function pad2(n) { return String(n).padStart(2, '0') }
  function minToHHMM(min) {
    if (min === null || min === undefined) return '–'
    const m = ((min % 1440) + 1440) % 1440
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
  }

  const commonLoc = locations.find(l => l.uuid === commonLocId)
  const isCommonHub = commonLoc?.is_hub || false
  const selVehicle = vehicles.find(v => v.uuid === vehicleId)

  async function handleMultiSubmit() {
    setError(null)
    if (!tripId) { setError('Trip ID required'); return }
    if (!date) { setError('Date required'); return }
    if (tripType !== 'MISTO' && !commonLocId) { setError(tripType === 'MULTI-PICK' ? 'Dropoff required' : 'Pickup required'); return }
    const validLegs = legs.filter(l => l.locationId)
    if (validLegs.length < 2) { setError('Add at least 2 stops'); return }

    if (tripType === 'MISTO') {
      const validMisto = mistoLegs.filter(l => l.pickupId && l.dropoffId)
      if (validMisto.length < 2) { setError('Add at least 2 pairs'); return }

      setSaving(true)
      const mistoGroupId = crypto.randomUUID()

      const points = []
      validMisto.forEach(l => {
        if (!points.find(p => p.locId === l.pickupId))  points.push({ locId: l.pickupId })
        if (!points.find(p => p.locId === l.dropoffId)) points.push({ locId: l.dropoffId })
      })

      const insertedMistoIds = []
      try {
        for (let i = 0; i < points.length - 1; i++) {
          const fromId = points[i].locId
          const toId   = points[i + 1].locId

          const legPax = validMisto.filter(ml => {
            const pickupIdx  = points.findIndex(p => p.locId === ml.pickupId)
            const dropoffIdx = points.findIndex(p => p.locId === ml.dropoffId)
            return pickupIdx <= i && dropoffIdx > i
          }).flatMap(ml => ml.crew)

          const uniquePax = legPax.filter((c, idx, arr) => arr.findIndex(x => x.uuid === c.uuid) === idx)

          let durMin = null
          if (PRODUCTION_ID) {
            const { data: routeData } = await supabase.from('routes')
              .select('duration_min').eq('production_id', PRODUCTION_ID)
              .eq('from_id', fromId).eq('to_id', toId).maybeSingle()
            durMin = routeData?.duration_min || null
          }

          const pickupMin = (() => {
            const base = timeStrToMin(pickupTime) || timeStrToMin(callTime)
            if (base === null) return null
            if (i === 0) return base
            let total = base
            for (let j = 0; j < i; j++) {
              total += legDurations[points[j].locId + '_' + points[j + 1].locId] || 10
            }
            return total
          })()

          const [y, mo, dd] = date.split('-').map(Number)
          const startDt = pickupMin !== null
            ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).toISOString()
            : null
          const endDt = startDt && durMin
            ? new Date(new Date(startDt).getTime() + durMin * 60000).toISOString()
            : null

          const legTripId = i === 0 ? tripId : tripId + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i - 1]

          const row = {
            production_id: PRODUCTION_ID,
            trip_id:       legTripId,
            trip_group_id: mistoGroupId,
            leg_order:     i + 1,
            date,
            pickup_id:     fromId,
            dropoff_id:    toId,
            vehicle_id:    vehicleId || null,
            driver_name:   selVehicle?.driver_name || null,
            sign_code:     selVehicle?.sign_code   || null,
            capacity:      selVehicle?.capacity    || null,
            service_type:  'MISTO',
            call_min:      timeStrToMin(callTime),
            pickup_min:    pickupMin,
            start_dt:      startDt,
            end_dt:        endDt,
            duration_min:  durMin,
            status:        'PLANNED',
            pax_count:     uniquePax.length,
            passenger_list: uniquePax.length > 0 ? uniquePax.map(c => c.full_name).join(', ') : null,
          }

          const { data: ins, error: tripErr } = await supabase.from('trips').insert(row).select('id').single()
          if (tripErr || !ins?.id) throw new Error(tripErr?.message || `Error inserting leg ${i + 1}`)
          insertedMistoIds.push(ins.id)

          if (uniquePax.length > 0) {
            await supabase.from('trip_passengers').insert(
              uniquePax.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid }))
            )
          }
        }

        if (insertedMistoIds.length >= 2) {
          await fetch('/api/routes/compute-chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leg_ids: insertedMistoIds,
              production_id: PRODUCTION_ID,
              anchor_pickup_min: timeStrToMin(pickupTime) || timeStrToMin(callTime) || null,
              respect_leg_order: true,
            }),
          })
        }

        setSaving(false)
        onSaved()
        return
      } catch (e) {
        setSaving(false)
        setError(e.message)
        return
      }
    }

    setSaving(true)
    const multiGroupId = crypto.randomUUID()
    const insertedIds = []

    try {
      for (let i = 0; i < validLegs.length; i++) {
        const leg = validLegs[i]
        const pickupUuid  = tripType === 'MULTI-PICK' ? leg.locationId : commonLocId
        const dropoffUuid = tripType === 'MULTI-PICK' ? commonLocId    : leg.locationId
        const pickupMin   = getLegPickupMin(i)
        const [y, mo, dd] = date.split('-').map(Number)
        const startDt = pickupMin !== null
          ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).toISOString()
          : null
        const durMin = legDurations[leg.localId] || null
        const endDt = startDt && durMin
          ? new Date(new Date(startDt).getTime() + durMin * 60000).toISOString()
          : null

        const row = {
          production_id: PRODUCTION_ID,
          trip_id:       getLegTripId(i),
          trip_group_id: multiGroupId,
          leg_order:     i + 1,
          date,
          pickup_id:     pickupUuid,
          dropoff_id:    dropoffUuid,
          vehicle_id:    vehicleId || null,
          driver_name:   selVehicle?.driver_name || null,
          sign_code:     selVehicle?.sign_code   || null,
          capacity:      selVehicle?.capacity    || null,
          service_type:  tripType,
          call_min:      timeStrToMin(callTime),
          pickup_min:    pickupMin,
          start_dt:      startDt,
          end_dt:        endDt,
          duration_min:  durMin,
          flight_no:     isCommonHub ? (flightNo || null) : null,
          terminal:      isCommonHub ? (terminal || null) : null,
          status:        'PLANNED',
          pax_count:     0,
        }

        const { data: ins, error: tripErr } = await supabase.from('trips').insert(row).select('id').single()
        if (tripErr || !ins?.id) throw new Error(tripErr?.message || `Error inserting leg ${i + 1}`)
        insertedIds.push(ins.id)

        const legCrew = crewForLeg[leg.localId] || []
        if (legCrew.length > 0) {
          await supabase.from('trip_passengers').insert(
            legCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid }))
          )
          await supabase.from('trips').update({
            pax_count:      legCrew.length,
            passenger_list: legCrew.map(c => c.full_name).join(', '),
          }).eq('id', ins.id)
        }
      }

      if (insertedIds.length >= 2) {
        await fetch('/api/routes/compute-chain', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ leg_ids: insertedIds, production_id: PRODUCTION_ID, trip_group_id: multiGroupId, anchor_pickup_min: timeStrToMin(pickupTime) || timeStrToMin(callTime) || null, respect_leg_order: true }),
        })
      }

      setSaving(false)
      onSaved()
    } catch (e) {
      setSaving(false)
      setError(e.message)
    }
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const validLegs = legs.filter(l => l.locationId)

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '440px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>New multi-leg trip</div>
            {validLegs.length > 0 && <div style={{ fontSize: '11px', color: '#86efac', fontWeight: '700', marginTop: '2px' }}>{validLegs.length} stop{validLegs.length !== 1 ? 's' : ''} · {tripId}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        {/* Type selector */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '6px', flexShrink: 0, background: '#0f2340' }}>
          {onSwitchToSingle && (
            <button type="button" onClick={onSwitchToSingle}
              style={{ flex: 1, padding: '7px 4px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '800', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
              → Single
            </button>
          )}
          {[
            { key: 'MULTI-PICK', label: '📍 Multi-Pick' },
            { key: 'MULTI-DROP', label: '📍 Multi-Drop' },
            { key: 'MISTO',      label: '🔀 Mixed'      },
          ].map(({ key, label }) => (
            <button key={key} type="button" onClick={() => { setTripType(key); setCommonLocId(''); setLegs([]) }}
              style={{ flex: 1, padding: '7px 4px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '800', background: tripType === key ? 'white' : 'rgba(255,255,255,0.15)', color: tripType === key ? '#0f2340' : 'rgba(255,255,255,0.8)' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Trip ID</label>
                <input value={tripId} onChange={e => setTripId(e.target.value)} style={{ ...inp, fontWeight: '800', fontSize: '15px' }} placeholder="T001" />
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail = isVehicleAvailableForDate(v, date)
                  return (
                    <option key={v.uuid} value={v.uuid}>
                      {avail ? '' : '⚠ '}{v.display_id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {/* Times */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Call time</label>
                <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center' }} />
              </div>
              <div>
                <label style={lbl}>1st pickup time</label>
                <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', borderColor: pickupTime ? '#f59e0b' : '#e2e8f0', background: pickupTime ? '#fffbeb' : 'white' }} />
              </div>
            </div>
            {(callTime || pickupTime) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { l: 'CALL',      v: callTime    || '–' },
                  { l: '1ST PICKUP', v: pickupTime || callTime || '–' },
                ].map(({ l, v }) => (
                  <div key={l} style={{ textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.07em' }}>{l}</div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Common location */}
          {tripType !== 'MISTO' && (
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <label style={lbl}>{tripType === 'MULTI-PICK' ? 'Common dropoff (destination)' : 'Common pickup (origin)'}</label>
                <select value={commonLocId} onChange={e => { setCommonLocId(e.target.value); setLegs([]) }} style={inp}>
                  <option value="">Select location…</option>
                  <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                  <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                </select>
              </div>

              {isCommonHub && (
                <div style={{ background: tripType === 'MULTI-PICK' ? '#fff7ed' : '#dcfce7', border: `1px solid ${tripType === 'MULTI-PICK' ? '#fdba74' : '#86efac'}`, borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: tripType === 'MULTI-PICK' ? '#c2410c' : '#15803d', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    {tripType === 'MULTI-PICK' ? '✈ Departure details' : '✈ Arrival details'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ ...lbl, color: tripType === 'MULTI-PICK' ? '#c2410c' : '#15803d' }}>Flight / Train</label>
                      <input value={flightNo} onChange={e => setFlightNo(e.target.value)} style={{ ...inp, background: 'white' }} placeholder="AZ 4568" />
                    </div>
                    <div>
                      <label style={{ ...lbl, color: tripType === 'MULTI-PICK' ? '#c2410c' : '#15803d' }}>Terminal</label>
                      <input value={terminal} onChange={e => setTerminal(e.target.value)} style={{ ...inp, background: 'white' }} placeholder="T1 Departures" />
                    </div>
                  </div>
                  {tripType === 'MULTI-PICK' && (
                    <div style={{ fontSize: '11px', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      ℹ️ Call time includes 2h check-in buffer
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stops */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {tripType === 'MULTI-PICK' ? 'Pickup stops' : tripType === 'MULTI-DROP' ? 'Dropoff stops' : 'Stops'} ({legs.length})
              </div>
              <button type="button" onClick={tripType === 'MISTO' ? () => setMistoLegs(prev => [...prev, { localId: Date.now().toString(), pickupId: '', dropoffId: '', crew: [] }]) : addLeg}
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '4px 10px', fontSize: '11px', color: '#374151', cursor: 'pointer', fontWeight: '700' }}>
                + Add stop
              </button>
            </div>

            {tripType === 'MISTO' ? (
              <>
                {mistoLegs.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '12px' }}>
                    Add pairs with the button above
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {mistoLegs.map((leg, idx) => {
                    const pickupLoc = locations.find(l => l.uuid === leg.pickupId)
                    const availCrew = leg.pickupId ? (crewLists[leg.pickupId] || []) : []
                    return (
                      <div key={leg.localId} style={{ border: '0.5px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', background: '#f8fafc' }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#0f2340', color: 'white', fontSize: '9px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>Pair {idx + 1}</div>
                          <button type="button" onClick={() => setMistoLegs(prev => prev.filter(l => l.localId !== leg.localId))}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: '14px', cursor: 'pointer', padding: '0' }}>✕</button>
                        </div>
                        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>
                            <label style={{ fontSize: '9px', fontWeight: '800', color: '#15803d', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Pickup</label>
                            <select value={leg.pickupId} onChange={e => {
                              const pid = e.target.value
                              setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, pickupId: pid, crew: [] } : l))
                              if (pid) loadCrewForLocation(pid)
                            }} style={{ width: '100%', padding: '5px 8px', border: '1px solid #86efac', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: '#f0fdf4', boxSizing: 'border-box' }}>
                              <option value="">Select pickup…</option>
                              <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                              <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '9px', fontWeight: '800', color: '#dc2626', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Dropoff</label>
                            <select value={leg.dropoffId} onChange={e => setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, dropoffId: e.target.value } : l))}
                              style={{ width: '100%', padding: '5px 8px', border: '1px solid #fca5a5', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: '#fef2f2', boxSizing: 'border-box' }}>
                              <option value="">Select dropoff…</option>
                              <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                              <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                            </select>
                          </div>
                          {leg.pickupId && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                              <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Crew at {pickupLoc?.name || ''}
                                {availCrew.length > 0 && (
                                  <button type="button" onClick={() => setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, crew: availCrew } : l))}
                                    style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '9px', fontWeight: '700' }}>
                                    Add all ({availCrew.length})
                                  </button>
                                )}
                              </div>
                              {availCrew.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No confirmed crew at this location</div>
                              ) : availCrew.map(c => {
                                const sel = leg.crew.some(x => x.uuid === c.uuid)
                                return (
                                  <div key={c.uuid} onClick={() => setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, crew: sel ? l.crew.filter(x => x.uuid !== c.uuid) : [...l.crew, c] } : l))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderRadius: '5px', border: `0.5px solid ${sel ? '#bfdbfe' : '#f1f5f9'}`, marginBottom: '2px' }}>
                                    <div style={{ width: '13px', height: '13px', borderRadius: '3px', border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`, background: sel ? '#2563eb' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {sel && <span style={{ color: 'white', fontSize: '9px', fontWeight: '900' }}>✓</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '11px', fontWeight: sel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {mistoLegs.length >= 2 && mistoLegs.every(l => l.pickupId && l.dropoffId) && (() => {
                  const points = []
                  mistoLegs.forEach(l => { points.push({ type: 'pickup', locId: l.pickupId }); points.push({ type: 'dropoff', locId: l.dropoffId }) })
                  const uniqueOrdered = []
                  points.forEach(p => { if (!uniqueOrdered.find(u => u.locId === p.locId)) uniqueOrdered.push(p) })
                  const generatedLegs = []
                  for (let i = 0; i < uniqueOrdered.length - 1; i++) {
                    const from = locations.find(l => l.uuid === uniqueOrdered[i].locId)?.name || uniqueOrdered[i].locId
                    const to   = locations.find(l => l.uuid === uniqueOrdered[i + 1].locId)?.name || uniqueOrdered[i + 1].locId
                    const pax  = mistoLegs.filter(ml => {
                      const pickupIdx  = uniqueOrdered.findIndex(u => u.locId === ml.pickupId)
                      const dropoffIdx = uniqueOrdered.findIndex(u => u.locId === ml.dropoffId)
                      return pickupIdx <= i && dropoffIdx > i
                    }).flatMap(ml => ml.crew.map(c => c.full_name.split(' ').slice(-1)[0]))
                    generatedLegs.push({ from, to, pax })
                  }
                  return (
                    <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>Leg generati</div>
                      {generatedLegs.map((gl, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '9px', fontWeight: '800', background: '#e2e8f0', color: '#374151', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', flexShrink: 0 }}>{tripId}{i === 0 ? '' : 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i - 1]}</span>
                          <span style={{ fontSize: '10px', color: '#0f172a', flex: 1 }}>{gl.from} → {gl.to}</span>
                          {gl.pax.length > 0 && <span style={{ fontSize: '9px', color: '#15803d', flexShrink: 0 }}>{gl.pax.join('+')}</span>}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : (
              <>
            {legs.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '12px' }}>
                {tripType !== 'MISTO' && !commonLocId ? 'Select the common location first' : 'Add stops with the button above'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {legs.map((leg, idx) => {
                const legPickupMin = getLegPickupMin(idx)
                const legCrew = crewForLeg[leg.localId] || []
                const availCrew = crewLists[leg.locationId] || []
                const isActive = activeLegId === leg.localId

                return (
                  <div key={leg.localId}>
                    <div style={{ background: isActive ? '#eff6ff' : '#f8fafc', border: `1px solid ${isActive ? '#2563eb' : '#e2e8f0'}`, borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: leg.locationId ? '8px' : '0' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#0f2340', color: 'white', fontSize: '10px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
                        <select value={leg.locationId} onChange={e => setLegLocation(leg.localId, e.target.value)}
                          style={{ ...inp, flex: 1, fontSize: '12px' }}>
                          <option value="">Select location…</option>
                          <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                          <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                        </select>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', flexShrink: 0, minWidth: '36px', textAlign: 'right' }}>{minToHHMM(legPickupMin)}</div>
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          <button type="button" onClick={() => moveLeg(leg.localId, 'up')} disabled={idx === 0}
                            style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#e2e8f0' : '#94a3b8', fontSize: '12px', padding: '2px' }}>↑</button>
                          <button type="button" onClick={() => moveLeg(leg.localId, 'down')} disabled={idx === legs.length - 1}
                            style={{ background: 'none', border: 'none', cursor: idx === legs.length - 1 ? 'default' : 'pointer', color: idx === legs.length - 1 ? '#e2e8f0' : '#94a3b8', fontSize: '12px', padding: '2px' }}>↓</button>
                          <button type="button" onClick={() => setActiveLegId(isActive ? null : leg.localId)}
                            style={{ background: isActive ? '#2563eb' : 'none', border: 'none', cursor: 'pointer', color: isActive ? 'white' : '#94a3b8', fontSize: '12px', padding: '2px 4px', borderRadius: '4px' }}>👥</button>
                          <button type="button" onClick={() => removeLeg(leg.localId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '14px', padding: '2px' }}>✕</button>
                        </div>
                      </div>

                      {leg.locationId && legCrew.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: '600' }}>
                          👥 {legCrew.map(c => c.full_name.split(' ').slice(-1)[0]).join(', ')}
                        </div>
                      )}
                    </div>

                    {isActive && leg.locationId && (
                      <div style={{ border: '1px solid #bfdbfe', borderTop: 'none', borderRadius: '0 0 8px 8px', background: 'white', overflow: 'hidden' }}>
                        <div style={{ padding: '6px 12px', background: '#eff6ff', fontSize: '10px', fontWeight: '800', color: '#1d4ed8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Passengers — {locations.find(l => l.uuid === leg.locationId)?.name}</span>
                          {availCrew.length > 0 && (
                            <button type="button" onClick={() => setCrewForLeg(prev => ({ ...prev, [leg.localId]: availCrew }))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '10px', fontWeight: '700' }}>
                              Add all ({availCrew.length})
                            </button>
                          )}
                        </div>
                        {availCrew.length === 0 ? (
                          <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No confirmed crew at this location</div>
                        ) : (
                          availCrew.map(c => {
                            const sel = legCrew.some(x => x.uuid === c.uuid)
                            return (
                              <div key={c.uuid} onClick={() => toggleCrewForLeg(leg.localId, c)}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`, background: sel ? '#2563eb' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {sel && <span style={{ color: 'white', fontSize: '9px', fontWeight: '900' }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: sel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </>
            )}
          </div>

          {error && <div style={{ margin: '12px 18px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
            Cancel
          </button>
          <button type="button" onClick={handleMultiSubmit} disabled={saving}
            style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
            {saving ? '⏳ Saving...' : `💾 Save ${tripType === 'MULTI-PICK' ? 'multi-pick' : tripType === 'MULTI-DROP' ? 'multi-drop' : 'mixed'} (${validLegs.length} stop${validLegs.length !== 1 ? 's' : ''})`}
          </button>
        </div>

      </div>
    </>
  )
}
