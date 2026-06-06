'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { getProductionId } from '../../../../lib/production'
import TripNotesPanel from '../../../../lib/TripNotesPanel'
import { SIDEBAR_W, baseTripId, timeStrToMin, minToHHMM, isoToday, isVehicleAvailableForDate } from '../../../../lib/tripUtils'

const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

export default function EditTripSidebarMisto({ open, initial, group, locations, vehicles, serviceTypes, onClose, onSaved, onPaxChanged, currentUser }) {
  const PRODUCTION_ID = getProductionId()
  const isMobile = useIsMobile()

  // mistoLegs: [{ localId, pickupId, dropoffId, crew: [], isNew: false }]
  const [mistoLegs, setMistoLegs] = useState([])
  const [originalMistoLegs, setOriginalMistoLegs] = useState([])

  // crewLists: { [locationUuid]: [{ uuid, full_name, department }] }
  const [crewLists, setCrewLists] = useState({})

  const [form, setForm] = useState({
    date: '', vehicle_id: '', call_time: '', pickup_time: '',
    flight_no: '', terminal: '', notes: '', status: 'PLANNED',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState(null)
  const [vCheck, setVCheck] = useState(null)

  // ─── MOUNT EFFECT ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !initial || !group) return
    setError(null)
    setConfirmDel(false)
    setVCheck(null)
    setCrewLists({})

    const leg0 = group[0]

    setForm({
      date:        leg0.date || isoToday(),
      vehicle_id:  leg0.vehicle_id || '',
      call_time:   leg0.call_min != null ? minToHHMM(leg0.call_min) : '',
      pickup_time: leg0.pickup_min != null ? minToHHMM(leg0.pickup_min) : '',
      flight_no:   leg0.flight_no || '',
      terminal:    leg0.terminal || '',
      notes:       leg0.notes || '',
      status:      leg0.status || 'PLANNED',
    })

    reconstructMistoPairs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  // ─── RECONSTRUCT MISTO PAIRS ─────────────────────────────────────────────────
  async function reconstructMistoPairs() {
    if (!group || !PRODUCTION_ID) return

    // 1. Load all passengers for all legs in the group
    const legIds = group.map(g => g.id)
    const { data: paxData } = await supabase
      .from('trip_passengers')
      .select('crew_id, trip_row_id, crew!inner(uuid, full_name, department)')
      .in('trip_row_id', legIds)

    // 2. Build points sequence from legs in order (leg_order ASC)
    const sortedLegs = [...group].sort((a, b) => (a.leg_order || 0) - (b.leg_order || 0))
    const points = []
    for (const leg of sortedLegs) {
      if (!points.find(p => p === leg.pickup_id))  points.push(leg.pickup_id)
      if (!points.find(p => p === leg.dropoff_id)) points.push(leg.dropoff_id)
    }

    // 3. Reconstruct pairs from pax boarding/exit pattern
    // For each crew member: boarding leg = first leg they appear in (sorted by leg_order)
    // exit leg = last leg they appear in
    // pair key = boardingPickupId + exitDropoffId
    const crewTrips = {}
    for (const p of (paxData || [])) {
      const uuid = p.crew?.uuid
      if (!uuid) continue
      if (!crewTrips[uuid]) crewTrips[uuid] = {
        crew: { uuid: p.crew.uuid, full_name: p.crew.full_name, department: p.crew.department },
        legIds: []
      }
      crewTrips[uuid].legIds.push(p.trip_row_id)
    }
    const pairMap = {}
    for (const { crew, legIds } of Object.values(crewTrips)) {
      const crewLegs = sortedLegs.filter(l => legIds.includes(l.id))
      if (crewLegs.length === 0) continue
      const boardingLeg = crewLegs[0]
      const exitLeg     = crewLegs[crewLegs.length - 1]
      const key = `${boardingLeg.pickup_id}__${exitLeg.dropoff_id}`
      if (!pairMap[key]) pairMap[key] = { pickupId: boardingLeg.pickup_id, dropoffId: exitLeg.dropoff_id, crew: [] }
      pairMap[key].crew.push(crew)
    }
    const reconstructed = Object.values(pairMap)
      .sort((a, b) => points.indexOf(a.pickupId) - points.indexOf(b.pickupId))
      .map((pair, pi) => ({
        ...pair,
        localId: `pair_${pi}_${Date.now()}`,
        isNew:   false,
      }))
    reconstructed.forEach(pair => loadCrewForLocation(pair.pickupId))

    setMistoLegs(reconstructed)
    setOriginalMistoLegs(JSON.parse(JSON.stringify(reconstructed)))
  }

  // ─── LOAD CREW FOR LOCATION ──────────────────────────────────────────────────
  async function loadCrewForLocation(locationUuid) {
    if (!locationUuid || !PRODUCTION_ID) return
    if (crewLists[locationUuid]) return
    const tripDate = form.date || isoToday()
    const { data } = await supabase
      .from('crew_stays')
      .select('crew_id, crew!inner(uuid, full_name, department, hotel_status)')
      .eq('production_id', PRODUCTION_ID)
      .eq('hotel_id', locationUuid)
      .lte('arrival_date', tripDate)
      .gte('departure_date', tripDate)
    const crew = (data || [])
      .filter(s => s.crew?.hotel_status === 'CONFIRMED')
      .map(s => ({ uuid: s.crew.uuid, full_name: s.crew.full_name, department: s.crew.department }))
      .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name))
    setCrewLists(prev => ({ ...prev, [locationUuid]: crew }))
  }

  // ─── STRUCTURE CHANGED DETECTION ─────────────────────────────────────────────
  function structureChanged() {
    if (mistoLegs.length !== originalMistoLegs.length) return true
    for (let i = 0; i < mistoLegs.length; i++) {
      if (mistoLegs[i].pickupId  !== originalMistoLegs[i].pickupId)  return true
      if (mistoLegs[i].dropoffId !== originalMistoLegs[i].dropoffId) return true
    }
    return false
  }

  // ─── SAVE LOGIC ──────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const selVehicle = vehicles.find(v => v.uuid === form.vehicle_id)
    const validMisto = mistoLegs.filter(l => l.pickupId && l.dropoffId)
    if (validMisto.length < 2) { setError('At least 2 pairs required'); setSaving(false); return }

    const sharedFields = {
      date:        form.date,
      vehicle_id:  form.vehicle_id || null,
      driver_name: selVehicle?.driver_name ?? null,
      sign_code:   selVehicle?.sign_code   ?? null,
      capacity:    selVehicle?.capacity    ?? null,
      flight_no:   form.flight_no || null,
      terminal:    form.terminal  || null,
      notes:       form.notes     || null,
      status:      form.status,
      call_min:    timeStrToMin(form.call_time),
    }

    const anchorPickupMin = timeStrToMin(form.pickup_time) || timeStrToMin(form.call_time) || null

    if (structureChanged()) {
      // DELETE all existing legs and INSERT from scratch
      const legIds = group.map(g => g.id)

      for (const legId of legIds) {
        const res = await fetch('/api/trips/delete-sibling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: legId, productionId: PRODUCTION_ID }),
        })
        const result = await res.json()
        if (!res.ok || result.error) {
          setError(`Failed to delete leg: ${result.error}`)
          setSaving(false)
          return
        }
      }

      // INSERT from scratch
      const mistoGroupId = initial.trip_group_id || crypto.randomUUID()
      const baseTId = baseTripId(initial.trip_id)

      const points = []
      validMisto.forEach(l => { if (!points.find(p => p === l.pickupId))  points.push(l.pickupId)  })
      validMisto.forEach(l => { if (!points.find(p => p === l.dropoffId)) points.push(l.dropoffId) })

      const insertedIds = []
      try {
        for (let i = 0; i < points.length - 1; i++) {
          const fromId = points[i]
          const toId   = points[i + 1]

          const legPax = validMisto.filter(ml => {
            const pickupIdx  = points.indexOf(ml.pickupId)
            const dropoffIdx = points.indexOf(ml.dropoffId)
            return pickupIdx <= i && dropoffIdx > i
          }).flatMap(ml => ml.crew)
          const uniquePax = legPax.filter((c, idx, arr) => arr.findIndex(x => x.uuid === c.uuid) === idx)

          let durMin = null
          const { data: routeData } = await supabase.from('routes')
            .select('duration_min').eq('production_id', PRODUCTION_ID)
            .eq('from_id', fromId).eq('to_id', toId).maybeSingle()
          durMin = routeData?.duration_min || null

          const pickupMin = i === 0 ? anchorPickupMin : null
          const [y, mo, dd] = form.date.split('-').map(Number)
          const startDt = pickupMin !== null
            ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).toISOString()
            : null
          const endDt = startDt && durMin
            ? new Date(new Date(startDt).getTime() + durMin * 60000).toISOString()
            : null

          const legTripId = i === 0 ? baseTId : baseTId + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i - 1]

          const row = {
            production_id:  PRODUCTION_ID,
            trip_id:        legTripId,
            trip_group_id:  mistoGroupId,
            leg_order:      i + 1,
            date:           form.date,
            pickup_id:      fromId,
            dropoff_id:     toId,
            vehicle_id:     form.vehicle_id || null,
            driver_name:    selVehicle?.driver_name || null,
            sign_code:      selVehicle?.sign_code   || null,
            capacity:       selVehicle?.capacity    || null,
            service_type:   'MISTO',
            call_min:       timeStrToMin(form.call_time),
            pickup_min:     pickupMin,
            start_dt:       startDt,
            end_dt:         endDt,
            duration_min:   durMin,
            flight_no:      form.flight_no || null,
            terminal:       form.terminal  || null,
            notes:          form.notes     || null,
            status:         form.status,
            pax_count:      uniquePax.length,
            passenger_list: uniquePax.length > 0 ? uniquePax.map(c => c.full_name).join(', ') : null,
          }

          const { data: ins, error: tripErr } = await supabase.from('trips').insert(row).select('id').single()
          if (tripErr || !ins?.id) throw new Error(tripErr?.message || `Insert failed leg ${i + 1}`)
          insertedIds.push(ins.id)

          if (uniquePax.length > 0) {
            await supabase.from('trip_passengers').insert(
              uniquePax.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid }))
            )
          }
        }

        if (insertedIds.length >= 2) {
          await fetch('/api/routes/compute-chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leg_ids: insertedIds,
              production_id: PRODUCTION_ID,
              anchor_pickup_min: anchorPickupMin,
              respect_leg_order: true,
            }),
          })
        }

        setSaving(false)
        onSaved()
      } catch (err) {
        setError(err.message)
        setSaving(false)
      }

    } else {
      // Structure unchanged — only update pax and shared fields

      // 1. Update shared fields on all legs
      for (const leg of group) {
        await supabase.from('trips').update(sharedFields).eq('id', leg.id)
      }

      // 2. Rebuild points sequence
      const points = []
      validMisto.forEach(l => { if (!points.find(p => p === l.pickupId))  points.push(l.pickupId)  })
      validMisto.forEach(l => { if (!points.find(p => p === l.dropoffId)) points.push(l.dropoffId) })

      const sortedLegs = [...group].sort((a, b) => (a.leg_order || 0) - (b.leg_order || 0))

      // 3. For each leg, recalculate pax and update trip_passengers
      for (let i = 0; i < sortedLegs.length; i++) {
        const leg = sortedLegs[i]

        const legPax = validMisto.filter(ml => {
          const pickupIdx  = points.indexOf(ml.pickupId)
          const dropoffIdx = points.indexOf(ml.dropoffId)
          return pickupIdx <= i && dropoffIdx > i
        }).flatMap(ml => ml.crew)
        const uniquePax = legPax.filter((c, idx, arr) => arr.findIndex(x => x.uuid === c.uuid) === idx)

        await supabase.from('trip_passengers').delete().eq('trip_row_id', leg.id)

        if (uniquePax.length > 0) {
          await supabase.from('trip_passengers').insert(
            uniquePax.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: leg.id, crew_id: c.uuid }))
          )
        }

        await supabase.from('trips').update({
          pax_count:      uniquePax.length,
          passenger_list: uniquePax.length > 0 ? uniquePax.map(c => c.full_name).join(', ') : null,
        }).eq('id', leg.id)
      }

      // 4. Call compute-chain
      try {
        await fetch('/api/routes/compute-chain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leg_ids: sortedLegs.map(l => l.id),
            production_id: PRODUCTION_ID,
            anchor_pickup_min: anchorPickupMin,
            respect_leg_order: true,
          }),
        })
      } catch (err) { console.warn('[EditMisto] compute-chain:', err) }

      setSaving(false)
      onSaved()
    }
  }

  // ─── DELETE LOGIC ─────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    for (const leg of group) {
      const res = await fetch('/api/trips/delete-sibling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: leg.id, productionId: PRODUCTION_ID }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setDeleting(false)
        setError(`Failed to delete: ${result.error}`)
        return
      }
    }
    setDeleting(false)
    onSaved()
  }

  // ─── GENERATED LEGS PREVIEW ───────────────────────────────────────────────────
  function buildGeneratedLegs() {
    const validMisto = mistoLegs.filter(l => l.pickupId && l.dropoffId)
    if (validMisto.length < 2) return null

    const points = []
    validMisto.forEach(l => { if (!points.find(p => p === l.pickupId))  points.push(l.pickupId)  })
    validMisto.forEach(l => { if (!points.find(p => p === l.dropoffId)) points.push(l.dropoffId) })

    const result = []
    const baseTId = baseTripId(initial?.trip_id)
    for (let i = 0; i < points.length - 1; i++) {
      const fromName = locations.find(l => l.uuid === points[i])?.name || points[i]
      const toName   = locations.find(l => l.uuid === points[i + 1])?.name || points[i + 1]
      const legPax = validMisto.filter(ml => {
        const pickupIdx  = points.indexOf(ml.pickupId)
        const dropoffIdx = points.indexOf(ml.dropoffId)
        return pickupIdx <= i && dropoffIdx > i
      }).flatMap(ml => ml.crew)
      const uniquePax = legPax.filter((c, idx, arr) => arr.findIndex(x => x.uuid === c.uuid) === idx)
      const legTripId = i === 0 ? baseTId : baseTId + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i - 1]
      result.push({ tripId: legTripId, from: fromName, to: toName, paxCount: uniquePax.length })
    }
    return result
  }

  const locsById = Object.fromEntries((locations || []).map(l => [l.uuid, l.name]))
  const validMistoCount = mistoLegs.filter(l => l.pickupId && l.dropoffId).length
  const generatedLegs = (mistoLegs.length >= 2 && mistoLegs.every(l => l.pickupId && l.dropoffId))
    ? buildGeneratedLegs()
    : null

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: isMobile ? '100vw' : `${SIDEBAR_W}px`,
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50,
        transform: open ? 'translateX(0)' : `translateX(${isMobile ? '100vw' : SIDEBAR_W + 'px'})`,
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* ── HEADER ── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#0f2340', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit Trip</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                {baseTripId(initial?.trip_id)}
              </div>
              <span style={{
                fontSize: '10px', fontWeight: '800',
                background: '#f59e0b', color: '#451a03',
                padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em',
              }}>
                MIXED · {group?.length || 0} stops
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}
          >✕</button>
        </div>

        {/* ── FORM ── */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* SECTION 1 — Shared fields */}
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Date + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
                  {['PLANNED', 'BUSY', 'DONE', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Vehicle */}
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail = isVehicleAvailableForDate(v, form.date)
                  return (
                    <option key={v.uuid} value={v.uuid}>
                      {avail ? '' : '⚠ '}{v.display_id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{avail ? '' : ' · Not available'}
                    </option>
                  )
                })}
              </select>
              {form.vehicle_id && vCheck && (
                <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700', color: vCheck.available ? '#15803d' : '#dc2626' }}>
                  {vCheck.available ? '✅ Vehicle available' : `⚠ Already busy on ${vCheck.conflictTripId}`}
                </div>
              )}
            </div>

            {/* Call Time + 1st Pickup Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Call Time</label>
                <input
                  type="time"
                  value={form.call_time}
                  onChange={e => set('call_time', e.target.value)}
                  style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
              <div>
                <label style={lbl}>1st Pickup Time</label>
                <input
                  type="time"
                  value={form.pickup_time}
                  onChange={e => set('pickup_time', e.target.value)}
                  style={{
                    ...inp,
                    fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                    borderColor: form.pickup_time ? '#f59e0b' : '#e2e8f0',
                    background: form.pickup_time ? '#fffbeb' : 'white',
                  }}
                />
              </div>
            </div>
            {form.pickup_time && (
              <div style={{ fontSize: '10px', color: '#92400e', fontWeight: '700', marginTop: '-6px' }}>
                ⚡ Pickup time set — compute-chain will use this as anchor
                <button
                  type="button"
                  onClick={() => set('pickup_time', '')}
                  style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: '800' }}
                >✕ clear</button>
              </div>
            )}

            {/* Flight + Terminal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Flight / Train</label>
                <input value={form.flight_no} onChange={e => set('flight_no', e.target.value)} style={inp} placeholder="AZ 4568" />
              </div>
              <div>
                <label style={lbl}>Terminal</label>
                <input value={form.terminal} onChange={e => set('terminal', e.target.value)} style={inp} placeholder="T1, T2…" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={lbl}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Internal notes…"
              />
            </div>
          </div>

          {/* SECTION 2 — PAIRS */}
          <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Pairs ({mistoLegs.length})
              </div>
              <button
                type="button"
                onClick={() => setMistoLegs(prev => [...prev, {
                  localId: `new_${Date.now()}`,
                  pickupId: '', dropoffId: '', crew: [], isNew: true,
                }])}
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '4px 10px', fontSize: '11px', color: '#374151', cursor: 'pointer', fontWeight: '700' }}
              >
                + Add pair
              </button>
            </div>

            {/* Empty state */}
            {mistoLegs.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '12px' }}>
                Add pairs with the button above
              </div>
            )}

            {/* Pair cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mistoLegs.map((leg, idx) => {
                const pickupLoc  = locations.find(l => l.uuid === leg.pickupId)
                const dropoffLoc = locations.find(l => l.uuid === leg.dropoffId)
                const availCrew  = leg.pickupId ? (crewLists[leg.pickupId] || null) : []

                return (
                  <div key={leg.localId} style={{ border: '0.5px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>

                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', background: '#f8fafc' }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: '#0f2340', color: 'white',
                        fontSize: '9px', fontWeight: '800',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{idx + 1}</div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>Pair {idx + 1}</div>
                      {!leg.isNew && leg.pickupId && (
                        <>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                            {pickupLoc?.name || leg.pickupId}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>→</span>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#dc2626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                            {dropoffLoc?.name || leg.dropoffId}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setMistoLegs(prev => prev.filter(l => l.localId !== leg.localId))}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: '14px', cursor: 'pointer', padding: '0', flexShrink: 0 }}
                      >×</button>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>

                      {/* For new pairs: show selects; for existing: show crew only */}
                      {leg.isNew ? (
                        <>
                          <div>
                            <label style={{ fontSize: '9px', fontWeight: '800', color: '#15803d', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Pickup</label>
                            <select
                              value={leg.pickupId}
                              onChange={e => {
                                const pid = e.target.value
                                setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, pickupId: pid, crew: [] } : l))
                                if (pid) loadCrewForLocation(pid)
                              }}
                              style={{ width: '100%', padding: '5px 8px', border: '1px solid #86efac', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: '#f0fdf4', boxSizing: 'border-box' }}
                            >
                              <option value="">Select pickup…</option>
                              <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                              <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '9px', fontWeight: '800', color: '#dc2626', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Dropoff</label>
                            <select
                              value={leg.dropoffId}
                              onChange={e => setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, dropoffId: e.target.value } : l))}
                              style={{ width: '100%', padding: '5px 8px', border: '1px solid #fca5a5', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: '#fef2f2', boxSizing: 'border-box' }}
                            >
                              <option value="">Select dropoff…</option>
                              <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                              <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                            </select>
                          </div>
                        </>
                      ) : null}

                      {/* Crew section — shown for all pairs that have a pickupId */}
                      {leg.pickupId && (
                        <div style={{ borderTop: leg.isNew ? '1px solid #f1f5f9' : 'none', paddingTop: leg.isNew ? '6px' : '0' }}>
                          <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>Crew at {pickupLoc?.name || ''}</span>
                            {availCrew && availCrew.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setMistoLegs(prev => prev.map(l => l.localId === leg.localId ? { ...l, crew: availCrew } : l))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '9px', fontWeight: '700' }}
                              >
                                Add all ({availCrew.length})
                              </button>
                            )}
                          </div>

                          {availCrew === null ? (
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Loading…</div>
                          ) : availCrew.length === 0 ? (
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No confirmed crew at this location</div>
                          ) : availCrew.map(c => {
                            const sel = leg.crew.some(x => x.uuid === c.uuid)
                            return (
                              <div
                                key={c.uuid}
                                onClick={() => setMistoLegs(prev => prev.map(l =>
                                  l.localId === leg.localId
                                    ? { ...l, crew: sel ? l.crew.filter(x => x.uuid !== c.uuid) : [...l.crew, c] }
                                    : l
                                ))}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                  padding: '5px 6px', cursor: 'pointer',
                                  background: sel ? '#eff6ff' : 'white',
                                  borderRadius: '5px',
                                  border: `0.5px solid ${sel ? '#bfdbfe' : '#f1f5f9'}`,
                                  marginBottom: '2px',
                                }}
                              >
                                <div style={{
                                  width: '13px', height: '13px', borderRadius: '3px',
                                  border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`,
                                  background: sel ? '#2563eb' : 'white',
                                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
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

            {/* Generated legs preview */}
            {generatedLegs && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '8px 10px', marginTop: '4px' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>Generated Legs</div>
                {generatedLegs.map((gl, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '800', background: '#e2e8f0', color: '#374151', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', flexShrink: 0 }}>
                      {gl.tripId}
                    </span>
                    <span style={{ fontSize: '10px', color: '#0f172a', flex: 1 }}>{gl.from} → {gl.to}</span>
                    <span style={{ fontSize: '9px', color: '#15803d', flexShrink: 0 }}>{gl.paxCount} pax</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3 — Trip Notes */}
          {initial?.id && (
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 18px' }}>
              <TripNotesPanel tripRowId={initial.id} productionId={PRODUCTION_ID} currentUser={currentUser} />
            </div>
          )}

          {/* SECTION 4 — Danger zone */}
          <div style={{ borderTop: '1px solid #fecaca', paddingTop: '12px', marginTop: '4px', padding: '12px 18px' }}>
            {error && (
              <div style={{ marginBottom: '8px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
                ❌ {error}
              </div>
            )}
            {confirmDel ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', flex: 1 }}>
                  Delete all {group?.length} legs? This cannot be undone.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', fontSize: '12px', cursor: deleting ? 'default' : 'pointer', fontWeight: '800' }}
                >
                  {deleting ? '⏳ Deleting…' : '🗑 Confirm Delete'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11px', fontWeight: '600', padding: '4px 0', opacity: 0.7 }}
              >
                🗑 Delete all legs ({group?.length})
              </button>
            )}
          </div>

          {/* FOOTER */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white', position: 'sticky', bottom: 0 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}
            >
              {saving ? '⏳ Saving…' : `💾 Save mixed (${validMistoCount} pairs)`}
            </button>
          </div>

        </form>
      </div>
    </>
  )
}
