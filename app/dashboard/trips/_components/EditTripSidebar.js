'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useT } from '../../../../lib/i18n'
import { getProductionId } from '../../../../lib/production'
import TripNotesPanel from '../../../../lib/TripNotesPanel'
import {
  SIDEBAR_W, CLS,
  minToHHMM, timeStrToMin, isoToday, baseTripId,
  getClass, calcTimes, isVehicleAvailableForDate, checkVehicleAvail,
} from '../../../../lib/tripUtils'
import CrewInfoModal from './CrewInfoModal'
import EditTripSidebarMisto from './EditTripSidebarMisto'

function EditTripSidebar({ open, initial, group, locations, vehicles, serviceTypes, onClose, onSaved, onPaxChanged, currentUser }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const isMobile = useIsMobile()
  const EDIT_EMPTY = {
    date: '', pickup_id: '', dropoff_id: '', vehicle_id: '',
    service_type_id: '', arr_time: '', call_time: '', pickup_time: '',
    duration_min: '', flight_no: '', terminal: '', notes: '', status: 'PLANNED',
  }
  const [form,       setForm]       = useState(EDIT_EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error,      setError]      = useState(null)
  const [durLoading, setDurLoading] = useState(false)

  const [assignedPax,   setAssignedPax]   = useState([])
  const [availableCrew, setAvailableCrew] = useState([])
  const [busyMap,       setBusyMap]       = useState({})
  const [paxLoading,    setPaxLoading]    = useState(false)
  const [paxSearch,     setPaxSearch]     = useState('')

  const [vCheck, setVCheck] = useState(null)

  const [extraLegs, setExtraLegs] = useState([])
  const [toDelete,  setToDelete]  = useState([])
  const [activeLeg, setActiveLeg] = useState(null)

  const [crewLookupQ,       setCrewLookupQ]       = useState('')
  const [crewLookupResults, setCrewLookupResults] = useState([])
  const [crewInfoCrew,      setCrewInfoCrew]      = useState(null)

  const loadPaxReqRef = useRef(0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open || !initial) {
      setAssignedPax([]); setAvailableCrew([]); setBusyMap({})
      return
    }
    setError(null); setConfirmDel(false); setPaxSearch(''); setVCheck(null)
    setCrewLookupQ(''); setCrewLookupResults([]); setCrewInfoCrew(null)
    setExtraLegs([]); setToDelete([])

    const leg = group?.[0] ?? initial
    setActiveLeg(leg)

    const arrStr  = leg.arr_time ? leg.arr_time.slice(0, 5) : ''
    const isMultiGroup = group && group.length > 1
    const groupCallMin = isMultiGroup
      ? (group.find(g => g.call_min !== null)?.call_min ?? null)
      : null
    const callStr = isMultiGroup
      ? (groupCallMin !== null ? minToHHMM(groupCallMin) : '')
      : (leg.transfer_class === 'STANDARD' && leg.call_min !== null)
        ? minToHHMM(leg.call_min) : ''

    setForm({
      date:            leg.date || isoToday(),
      pickup_id:       leg.pickup_id  || '',
      dropoff_id:      leg.dropoff_id || '',
      vehicle_id:      leg.vehicle_id || '',
      service_type_id: leg.service_type_id || '',
      arr_time:        arrStr,
      call_time:       callStr,
      duration_min:    leg.duration_min ? String(leg.duration_min) : '',
      flight_no:       leg.flight_no || '',
      terminal:        leg.terminal  || '',
      notes:           leg.notes     || '',
      status:          leg.status    || 'PLANNED',
      pickup_time:     '',
    })

    loadPaxData(leg)
  }, [open, initial?.id])

  useEffect(() => {
    if (!open || !initial) return
    loadPaxData(activeLeg ?? initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.length, activeLeg?.id,
    activeLeg?.isNew ? (extraLegs.find(l => l.id === activeLeg?.id)?.pickup_id ?? '') : null,
    activeLeg?.isNew ? (extraLegs.find(l => l.id === activeLeg?.id)?.dropoff_id ?? '') : null,
  ])

  useEffect(() => {
    if (!open || !activeLeg) return
    if (activeLeg.isNew) {
      setForm(f => ({ ...f, pickup_id: '', dropoff_id: '' }))
      return
    }
    const arrStr  = activeLeg.arr_time ? activeLeg.arr_time.slice(0, 5) : ''
    const isMultiGroupActive = group && group.length > 1
    const groupCallMinActive = isMultiGroupActive
      ? (group.find(g => g.call_min !== null)?.call_min ?? null)
      : null
    const callStr = isMultiGroupActive
      ? (groupCallMinActive !== null ? minToHHMM(groupCallMinActive) : '')
      : (activeLeg.transfer_class === 'STANDARD' && activeLeg.call_min !== null)
        ? minToHHMM(activeLeg.call_min) : ''
    setForm({
      date:            activeLeg.date || isoToday(),
      pickup_id:       activeLeg.pickup_id  || '',
      dropoff_id:      activeLeg.dropoff_id || '',
      vehicle_id:      activeLeg.vehicle_id || '',
      service_type_id: activeLeg.service_type_id || '',
      arr_time:        arrStr,
      call_time:       callStr,
      duration_min:    activeLeg.duration_min ? String(activeLeg.duration_min) : '',
      flight_no:       activeLeg.flight_no || '',
      terminal:        activeLeg.terminal  || '',
      notes:           activeLeg.notes     || '',
      status:          activeLeg.status    || 'PLANNED',
      pickup_time:     '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeg?.id])

  useEffect(() => {
    if (!open || !form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    if (form.pickup_id === initial?.pickup_id && form.dropoff_id === initial?.dropoff_id) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  const locsById = Object.fromEntries((locations || []).map(l => [l.uuid, l.name]))
  const locsDisplayMap = Object.fromEntries((locations || []).map(l => [l.uuid, l.display_id]))

  const transferClass = getClass(locsDisplayMap?.[form.pickup_id], locsDisplayMap?.[form.dropoff_id])
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })

  useEffect(() => {
    if (!open || !form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    const excludeIds = group ? group.map(g => g.id).filter(Boolean) : (initial?.id ? [initial.id] : [])
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, excludeIds).then(setVCheck)
  }, [open, form.vehicle_id, form.date, computed?.startDt, computed?.endDt, initial?.id])

  useEffect(() => {
    if (crewLookupQ.length < 2 || !PRODUCTION_ID) { setCrewLookupResults([]); return }
    supabase.from('crew').select('uuid,display_id,full_name,department,role')
      .eq('production_id', PRODUCTION_ID)
      .or(`full_name.ilike.%${crewLookupQ}%,department.ilike.%${crewLookupQ}%`)
      .limit(8)
      .then(({ data }) => setCrewLookupResults(data || []))
  }, [crewLookupQ, PRODUCTION_ID])

  async function loadPaxData(trip) {
    if (!PRODUCTION_ID) return
    const isNewLeg = trip?.isNew === true
    const activeLegData = isNewLeg ? extraLegs.find(l => l.id === trip?.id) : null
    const effectivePickup  = isNewLeg ? (activeLegData?.pickup_id  || '') : (trip?.pickup_id  || '')
    const effectiveDropoff = isNewLeg ? (activeLegData?.dropoff_id || '') : (trip?.dropoff_id || '')
    if (!effectivePickup || !effectiveDropoff) {
      if (isNewLeg) {
        setAssignedPax([])
        setAvailableCrew([])
        setBusyMap({})
        setPaxLoading(false)
      }
      return
    }
    const tripId = isNewLeg ? null : trip?.id
    if (!isNewLeg && !tripId) return
    const reqId = ++loadPaxReqRef.current
    setPaxLoading(true)
    const tc = getClass(locsDisplayMap?.[effectivePickup] || effectivePickup, locsDisplayMap?.[effectiveDropoff] || effectiveDropoff)
    const groupIds = isNewLeg ? [] : ((group && group.length > 1) ? group.map(g => g.id) : [tripId])
    const existingGroupIds = group ? group.map(g => g.id).filter(Boolean) : (tripId ? [tripId] : [])
    const legHotelDropoff = effectiveDropoff
    const legHotelPickup  = effectivePickup

    const [paxRes, crewRes, dayTripsRes] = await Promise.all([
      existingGroupIds.length > 0
        ? supabase.from('trip_passengers')
            .select('crew_id, trip_row_id, crew!inner(uuid,full_name,department,no_transport_needed,hotel_id)')
            .in('trip_row_id', existingGroupIds)
        : Promise.resolve({ data: [] }),

      (() => {
        const localToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
        const tripDate = isNewLeg ? (form.date || localToday()) : (trip?.date || localToday())
        let q = supabase.from('crew_stays')
          .select('crew_id, departure_date, crew!inner(uuid, full_name, department, no_transport_needed, hotel_id, hotel_status)')
          .eq('production_id', PRODUCTION_ID)
        if (tc === 'ARRIVAL')        q = q.eq('hotel_id', legHotelDropoff).eq('arrival_date', tripDate)
        else if (tc === 'DEPARTURE') q = q.eq('hotel_id', legHotelPickup).eq('departure_date', tripDate)
        else                         q = q.eq('hotel_id', legHotelPickup).lte('arrival_date', tripDate).gte('departure_date', tripDate)
        return q
      })(),

      isNewLeg
        ? Promise.resolve({ data: [] })
        : supabase.from('trips')
            .select('id,trip_id,start_dt,end_dt')
            .eq('production_id', PRODUCTION_ID).eq('date', trip.date)
            .not('id', 'in', `(${groupIds.join(',')})`)
            .not('start_dt', 'is', null),
    ])

    if (reqId !== loadPaxReqRef.current) return

    const assigned    = (paxRes.data || []).map(p => ({ ...p.crew, trip_row_id: p.trip_row_id }))
    // assignedIds per availableCrew: solo il leg corrente (non tutto il gruppo)
    const currentLegPax = (paxRes.data || []).filter(p => p.trip_row_id === tripId)
    const assignedIds = new Set(currentLegPax.map(p => p.crew?.uuid).filter(Boolean))
    setAssignedPax(isNewLeg ? [] : assigned)

    const dayTrips   = dayTripsRes.data || []
    const dayTripIds = dayTrips.map(t => t.id)
    const bMap       = {}

    if (dayTripIds.length > 0 && trip.start_dt && trip.end_dt) {
      const { data: dayPax } = await supabase.from('trip_passengers')
        .select('crew_id,trip_row_id').in('trip_row_id', dayTripIds)
      const ts = new Date(trip.start_dt), te = new Date(trip.end_dt)
      for (const p of dayPax || []) {
        const dt = dayTrips.find(t => t.id === p.trip_row_id)
        if (dt && new Date(dt.start_dt) < te && new Date(dt.end_dt) > ts) {
          bMap[p.crew_id] = dt.trip_id
        }
      }
    }
    setBusyMap(bMap)
    const today = isoToday()
    const crewFromStays = (crewRes.data || [])
      .filter(s => s.crew?.hotel_status === 'CONFIRMED')
      .map(s => ({ ...s.crew, _checkoutToday: s.departure_date === today }))
      .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name))
    setAvailableCrew(crewFromStays.filter(c => !assignedIds.has(c.uuid)))
    setPaxLoading(false)
  }

  async function addPax(crew) {
    if (!PRODUCTION_ID) return
    const targetId = activeLeg?.id ?? initial?.id
    if (!targetId) return

    if (activeLeg?.isNew) {
      const newPax = [...assignedPax, { ...crew, trip_row_id: targetId }]
      setAssignedPax(newPax)
      setAvailableCrew(p => p.filter(c => c.uuid !== crew.uuid))
      setExtraLegs(prev => prev.map(l =>
        l.id === activeLeg.id ? { ...l, pendingPax: [...(l.pendingPax || []), crew] } : l
      ))
      return
    }

    const { error } = await supabase.from('trip_passengers').insert({
      production_id: PRODUCTION_ID, trip_row_id: targetId, crew_id: crew.uuid,
    })
    if (!error) {
      const newPax = [...assignedPax, { ...crew, trip_row_id: targetId }]
      setAssignedPax(newPax)
      setAvailableCrew(p => p.filter(c => c.uuid !== crew.uuid))
      const legPax = newPax.filter(p => p.trip_row_id === targetId)
      await supabase.from('trips').update({
        pax_count: legPax.length,
        passenger_list: legPax.map(c => c.full_name).join(', '),
      }).eq('id', targetId)
      onPaxChanged?.()
    }
  }

  async function removePax(crew) {
    if (!initial?.id) return

    const isNewLegPax = extraLegs.some(l => l.isNew === true && l.id === crew.trip_row_id)
    if (isNewLegPax) {
      setAssignedPax(assignedPax.filter(c => c.uuid !== crew.uuid))
      setAvailableCrew(p =>
        [...p, { uuid: crew.uuid, full_name: crew.full_name, department: crew.department }].sort((a, b) =>
          (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
        )
      )
      setExtraLegs(prev => prev.map(l =>
        l.id === crew.trip_row_id ? { ...l, pendingPax: (l.pendingPax || []).filter(c => c.uuid !== crew.uuid) } : l
      ))
      return
    }

    const targetTripId = crew.trip_row_id ?? initial.id
    const { error } = await supabase.from('trip_passengers')
      .delete().eq('trip_row_id', targetTripId).eq('crew_id', crew.uuid)
    if (error) { setError(error.message); return }

    const newPax = assignedPax.filter(c => c.uuid !== crew.uuid)
    setAssignedPax(newPax)
    setAvailableCrew(p =>
      [...p, { uuid: crew.uuid, full_name: crew.full_name, department: crew.department }].sort((a, b) =>
        (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
      )
    )

    const tripPaxForTarget = newPax.filter(c => c.trip_row_id === targetTripId)
    await supabase.from('trips').update({
      pax_count:      tripPaxForTarget.length,
      passenger_list: tripPaxForTarget.length > 0 ? tripPaxForTarget.map(c => c.full_name).join(', ') : null,
    }).eq('id', targetTripId)

    const targetTripObj      = (group || []).find(g => g.id === targetTripId)
    const isTargetSiblingLeg = targetTripObj ? /[A-Z]$/.test(targetTripObj.trip_id || '') : false
    if (isTargetSiblingLeg) {
      const siblingStillHasPax = newPax.some(c => c.trip_row_id === targetTripId)
      if (!siblingStillHasPax) {
        const res = await fetch('/api/trips/delete-sibling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: targetTripId, productionId: PRODUCTION_ID }),
        })
        const result = await res.json()
        if (!res.ok || result.error) {
          setError(`Failed to delete sibling trip: ${result.error}`)
          onPaxChanged?.()
          return
        }
      }
    }

    onPaxChanged?.()
  }

  async function deleteLeg(leg) {
    if (!PRODUCTION_ID) return
    const res = await fetch('/api/trips/delete-sibling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: leg.id, productionId: PRODUCTION_ID }),
    })
    const result = await res.json()
    if (!res.ok || result.error) { setError(`Failed to delete leg: ${result.error}`); return }
    onSaved()
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const isMulti    = group && group.length > 1
    const selVehicle = vehicles.find(v => v.uuid === form.vehicle_id)

    const mainPickupId  = activeLeg?.isNew ? initial.pickup_id  : form.pickup_id
    const mainDropoffId = activeLeg?.isNew ? initial.dropoff_id : form.dropoff_id
    const mainArrTime   = activeLeg?.isNew ? initial.arr_time   : (form.arr_time ? form.arr_time + ':00' : null)
    const mainDurMin    = activeLeg?.isNew ? (initial.duration_min || null) : durMin
    const mainCallMin   = activeLeg?.isNew ? initial.call_min   : (computed?.callMin ?? null)
    const mainPickupMin = activeLeg?.isNew ? initial.pickup_min : (form.pickup_time ? timeStrToMin(form.pickup_time) : (computed?.pickupMin ?? null))
    const mainStartDt   = activeLeg?.isNew ? initial.start_dt   : (() => { const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin; if (pm === null || pm === undefined) return computed?.startDt ?? null; const [y,mo,dd] = form.date.split('-').map(Number); return new Date(y,mo-1,dd,Math.floor(pm/60),pm%60,0,0).toISOString() })()
    const mainEndDt     = activeLeg?.isNew ? initial.end_dt     : (() => { const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin; const dur = durMin; if (pm === null || pm === undefined || !dur) return computed?.endDt ?? null; const [y,mo,dd] = form.date.split('-').map(Number); return new Date(new Date(y,mo-1,dd,Math.floor(pm/60),pm%60,0,0).getTime()+dur*60000).toISOString() })()

    const row = {
      date: form.date, pickup_id: mainPickupId, dropoff_id: mainDropoffId,
      vehicle_id:  form.vehicle_id || null,
      driver_name: selVehicle?.driver_name ?? null,
      sign_code:   selVehicle?.sign_code   ?? null,
      capacity:    selVehicle?.capacity    ?? null,
      service_type_id: form.service_type_id || null,
      duration_min: mainDurMin,
      arr_time:   mainArrTime,
      call_min:   (form.pickup_time && transferClass === 'STANDARD') ? timeStrToMin(form.pickup_time) : mainCallMin,
      pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin,
      start_dt:   (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin
        if (pm === null || pm === undefined) return mainStartDt
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
      })(),
      end_dt:     (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin
        const dur = mainDurMin
        if (pm === null || pm === undefined || !dur) return mainEndDt
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).getTime() + dur * 60000).toISOString()
      })(),
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: form.status,
    }
    const { error } = await supabase.from('trips').update(row).eq('id', initial.id)
    if (error) { setSaving(false); setError(error.message); return }

    if (group && group.length > 1) {
      const siblings = group.filter(g => g.id !== initial.id)
      const sharedFields = {
        vehicle_id:  form.vehicle_id || null,
        driver_name: selVehicle?.driver_name ?? null,
        sign_code:   selVehicle?.sign_code   ?? null,
        capacity:    selVehicle?.capacity    ?? null,
        date:        form.date,
        arr_time:    form.arr_time ? form.arr_time + ':00' : null,
        flight_no:   form.flight_no || null,
        terminal:    form.terminal  || null,
        notes:       form.notes     || null,
        status:      form.status,
      }
      for (const sib of siblings) {
        const sibTC = getClass(locsDisplayMap?.[sib.pickup_id] || sib.pickup_id, locsDisplayMap?.[sib.dropoff_id] || sib.dropoff_id)
        let sibDurMin = sib.duration_min || null
        if (!sibDurMin && PRODUCTION_ID) {
          const { data: sibRoute } = await supabase.from('routes')
            .select('duration_min').eq('production_id', PRODUCTION_ID)
            .eq('from_id', sib.pickup_id).eq('to_id', sib.dropoff_id).maybeSingle()
          sibDurMin = sibRoute?.duration_min || null
        }
        if (!sibDurMin && sib.pickup_id && sib.dropoff_id) {
          try {
            const computeRes = await fetch('/api/routes/compute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from_id: sib.pickup_id, to_id: sib.dropoff_id, production_id: PRODUCTION_ID }),
            })
            if (computeRes.ok) {
              const computeData = await computeRes.json()
              if (computeData.duration_min) sibDurMin = computeData.duration_min
            }
          } catch (e) { console.warn('[handleSubmit] sibling route compute fallback:', e) }
        }
        if (!sibDurMin && sib.pickup_id && sib.dropoff_id && PRODUCTION_ID) {
          const { data: revSibRoute } = await supabase.from('routes')
            .select('duration_min').eq('production_id', PRODUCTION_ID)
            .eq('from_id', sib.dropoff_id).eq('to_id', sib.pickup_id).maybeSingle()
          if (revSibRoute?.duration_min) sibDurMin = revSibRoute.duration_min
        }
        const sibCalc = sibDurMin ? calcTimes({
          date: form.date, arrTimeMin: arrMin, durationMin: sibDurMin,
          transferClass: sibTC, callMin: computed?.callMin ?? null,
        }) : null
        const sibCallMin   = sibCalc?.callMin ?? computed?.callMin ?? null
        const sibPickupMin = sibCalc?.pickupMin ?? (sibTC === 'ARRIVAL' ? sibCallMin : sib.pickup_min)
        const sibStartDt = sibCalc?.startDt ?? (() => {
          const pm = sibPickupMin ?? sib.pickup_min
          if (pm === null) return sib.start_dt ?? null
          const [sy, smo, sdd] = form.date.split('-').map(Number)
          return new Date(sy, smo - 1, sdd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
        })()
        await supabase.from('trips').update({
          ...sharedFields,
          duration_min: sibDurMin ?? sib.duration_min ?? null,
          call_min:     sibCallMin,
        }).eq('id', sib.id)
      }
    }

    if (group && group.length > 1) {
      try {
        await fetch('/api/routes/compute-chain', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leg_ids: group.map(g => g.id),
            production_id: PRODUCTION_ID,
            ...(form.pickup_time ? { anchor_pickup_min: timeStrToMin(form.pickup_time), respect_leg_order: true } : {}),
          }),
        })
      } catch (e) { console.warn('[handleSubmit] compute-chain:', e) }
    }

    if (extraLegs.length > 0 || toDelete.length > 0) {
      const editGroupId = initial.trip_group_id || crypto.randomUUID()
      if (!initial.trip_group_id) {
        await supabase.from('trips').update({ trip_group_id: editGroupId }).eq('id', initial.id)
      }

      for (const delId of toDelete) {
        await fetch('/api/trips/delete-sibling', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: delId, productionId: PRODUCTION_ID }),
        })
      }

      const newLegIds = []
      for (let i = 0; i < extraLegs.length; i++) {
        const leg = extraLegs[i]
        if (!leg.pickup_id || !leg.dropoff_id) continue
        if (leg.existing && leg.pickup_id === leg._origPickup && leg.dropoff_id === leg._origDropoff) continue

        const newTripId = leg.trip_id
        let legDurMin = null
        if (PRODUCTION_ID) {
          const { data: legRoute } = await supabase.from('routes')
            .select('duration_min').eq('production_id', PRODUCTION_ID)
            .eq('from_id', leg.pickup_id).eq('to_id', leg.dropoff_id).maybeSingle()
          legDurMin = legRoute?.duration_min || null
        }
        if (!legDurMin) {
          try {
            const computeRes = await fetch('/api/routes/compute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from_id: leg.pickup_id, to_id: leg.dropoff_id, production_id: PRODUCTION_ID }),
            })
            if (computeRes.ok) {
              const computeData = await computeRes.json()
              if (computeData.duration_min) legDurMin = computeData.duration_min
            }
          } catch (e) { console.warn('[handleSubmit] extra leg route compute:', e) }
        }
        if (!legDurMin && PRODUCTION_ID) {
          const { data: revRoute } = await supabase.from('routes')
            .select('duration_min').eq('production_id', PRODUCTION_ID)
            .eq('from_id', leg.dropoff_id).eq('to_id', leg.pickup_id).maybeSingle()
          if (revRoute?.duration_min) legDurMin = revRoute.duration_min
        }

        const legTC = getClass(locsDisplayMap?.[leg.pickup_id] || leg.pickup_id, locsDisplayMap?.[leg.dropoff_id] || leg.dropoff_id)
        const legCalc = legDurMin ? calcTimes({
          date: form.date, arrTimeMin: arrMin, durationMin: legDurMin,
          transferClass: legTC, callMin: computed?.callMin ?? null,
        }) : null
        const legPickupMin = legCalc?.pickupMin ?? (legTC === 'ARRIVAL' ? (computed?.callMin ?? null) : null)
        const legStartDt = legCalc?.startDt ?? (() => {
          if (legPickupMin === null) return null
          const [sy, smo, sdd] = form.date.split('-').map(Number)
          return new Date(sy, smo - 1, sdd, Math.floor(legPickupMin / 60), legPickupMin % 60, 0, 0).toISOString()
        })()
        const selVehicleForLeg = vehicles.find(v => v.uuid === form.vehicle_id)
        const siblingRow = {
          production_id: PRODUCTION_ID, trip_id: newTripId, trip_group_id: editGroupId,
          leg_order: (group ? group.length : 1) + i + 1,
          date: form.date, pickup_id: leg.pickup_id, dropoff_id: leg.dropoff_id,
          vehicle_id:  form.vehicle_id || null,
          driver_name: selVehicleForLeg?.driver_name ?? null,
          sign_code:   selVehicleForLeg?.sign_code   ?? null,
          capacity:    selVehicleForLeg?.capacity    ?? null,
          service_type_id: form.service_type_id || null,
          duration_min: legDurMin,
          arr_time:    form.arr_time ? form.arr_time + ':00' : null,
          call_min:    computed?.callMin ?? null,
          pickup_min:  legPickupMin,
          start_dt:    legStartDt,
          end_dt:      legCalc?.endDt ?? null,
          flight_no:   form.flight_no || null,
          terminal:    form.terminal  || null,
          notes:       form.notes     || null,
          status:      form.status,
          pax_count:   0,
        }

        if (leg.existing) {
          const { error: legErr } = await supabase.from('trips').update({
            pickup_id: leg.pickup_id, dropoff_id: leg.dropoff_id,
            duration_min: legDurMin, call_min: computed?.callMin ?? null,
            pickup_min: legPickupMin, start_dt: legStartDt, end_dt: legCalc?.endDt ?? null,
          }).eq('id', leg.id)
          if (legErr) { setError(`❌ Leg ${leg.trip_id}: ${legErr.message}`); break }
          newLegIds.push(leg.id)
        } else {
          const { data: newRow, error: legErr } = await supabase.from('trips').insert(siblingRow).select('id').single()
          if (legErr || !newRow?.id) { setError(`❌ Leg ${newTripId}: ${legErr?.message || 'insert failed'}`); break }
          newLegIds.push(newRow.id)
            if (leg.pendingPax?.length > 0) {
            await supabase.from('trip_passengers').insert(
              leg.pendingPax.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: newRow.id, crew_id: c.uuid }))
            )
            await supabase.from('trips').update({
              pax_count: leg.pendingPax.length,
              passenger_list: leg.pendingPax.map(c => c.full_name).join(', '),
            }).eq('id', newRow.id)
          }
        }
      }

      if (newLegIds.length > 0) {
        const allLegIds = [...(group ? group.map(g => g.id) : [initial.id]), ...newLegIds]
        try {
          await fetch('/api/routes/compute-chain', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leg_ids: allLegIds, production_id: PRODUCTION_ID, ...(form.pickup_time ? { anchor_pickup_min: timeStrToMin(form.pickup_time), respect_leg_order: true } : {}) }),
          })
        } catch (e) { console.warn('[handleSubmit] extra legs compute-chain:', e) }
      }
    }

    setExtraLegs([]); setToDelete([])
    setSaving(false); onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    const legsToDelete = (group && group.length > 1) ? group : [initial]
    for (const leg of legsToDelete) {
      const res = await fetch('/api/trips/delete-sibling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: leg.id, productionId: PRODUCTION_ID }),
      })
      const result = await res.json()
      if (!res.ok || result.error) { setDeleting(false); setError(`Failed to delete trip: ${result.error}`); return }
    }
    setDeleting(false); onSaved()
  }

  if (group?.[0]?.service_type === 'MISTO') {
    return (
      <EditTripSidebarMisto
        open={open}
        initial={initial}
        group={group}
        locations={locations}
        vehicles={vehicles}
        serviceTypes={serviceTypes}
        onClose={onClose}
        onSaved={onSaved}
        onPaxChanged={onPaxChanged}
        currentUser={currentUser}
      />
    )
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  const locShortEdit = id => (locsById[id] || id || '–').split(' ').slice(0, 3).join(' ')

  const selVehicleEdit    = vehicles.find(v => v.uuid === form.vehicle_id)
  const suggestedCrewEdit = (selVehicleEdit && (selVehicleEdit.preferred_dept || selVehicleEdit.preferred_crew_ids?.length > 0))
    ? availableCrew.filter(c =>
        (selVehicleEdit.preferred_crew_ids?.includes(c.uuid)) ||
        (selVehicleEdit.preferred_dept && c.department === selVehicleEdit.preferred_dept)
      )
    : []

  const regularCrew  = availableCrew.filter(c => !c.no_transport_needed)
  const ntnCrew      = availableCrew.filter(c =>  c.no_transport_needed)
  const freeCount    = regularCrew.filter(c => !busyMap[c.uuid]).length
  const busyCount    = regularCrew.filter(c =>  busyMap[c.uuid]).length
  const filtered     = regularCrew.filter(c => !paxSearch || c.full_name.toLowerCase().includes(paxSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(paxSearch.toLowerCase()))
  const filteredNtn  = ntnCrew.filter(c => !paxSearch || c.full_name.toLowerCase().includes(paxSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(paxSearch.toLowerCase()))

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${isMobile ? '100vw' : SIDEBAR_W + 'px'})`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.editTrip}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{baseTripId(initial?.trip_id)}</div>
              {group && group.length > 1 && (
                <span style={{ fontSize: '10px', fontWeight: '800', background: '#f59e0b', color: '#451a03', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em' }}>
                  {(() => { const st = group[0]?.service_type; return st === 'MULTI-PICK' ? 'MULTI-PICK' : st === 'MULTI-DROP' ? 'MULTI-DROP' : st === 'MISTO' ? 'MIXED' : 'MULTI' })() } · {group.length} stops
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(form.pickup_id && form.dropoff_id) && !(group && group.length > 1) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass === 'STANDARD' ? 'TRF' : transferClass}</span>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

            {/* Leg Selector */}
            {open && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 18px', background: '#0f2340', borderBottom: '1px solid rgba(255,255,255,0.08)', marginLeft: '-18px', marginRight: '-18px', marginTop: '-16px', marginBottom: '12px' }}>
                {[...(group || [initial].filter(Boolean)), ...extraLegs].map((leg, i) => {
                  const isNew = extraLegs.some(e => e.id === leg.id)
                  const label = i === 0 ? 'Stop A' : `Stop ${String.fromCharCode(65 + i)}${isNew ? ' ✦' : ''}`
                  const isActive = activeLeg?.id === leg.id
                  return (
                    <button key={leg.id} type="button" onClick={() => setActiveLeg(leg)}
                      style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: isActive ? 700 : 400, background: isActive ? 'white' : 'transparent', color: isActive ? '#0f2340' : 'rgba(255,255,255,0.7)', border: isActive ? 'none' : '0.5px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                      {label}
                      {isActive && isNew && (
                        <span onClick={e => { e.stopPropagation(); setExtraLegs(prev => prev.filter(l => l.id !== leg.id)); setActiveLeg(group[0]) }}
                          style={{ marginLeft: '6px', opacity: 0.6 }}>✕</span>
                      )}
                    </button>
                  )
                })}
                {((group?.length ?? 1) + extraLegs.length) < 4 && (
                  <button type="button"
                    onClick={() => {
                      const baseId = baseTripId(initial.trip_id)
                      const usedLetters = (group || []).map(g => {
                        const suf = g.trip_id.slice(baseId.length)
                        return suf.length === 1 && /^[A-Z]$/.test(suf) ? suf : null
                      }).filter(Boolean)
                      let nextLetter = 'B'
                      for (const l of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') {
                        if (!usedLetters.includes(l)) { nextLetter = l; break }
                      }
                      const newLeg = { id: `new_${Date.now()}`, trip_id: baseId + nextLetter, trip_group_id: initial.trip_group_id || null, pickup_id: '', dropoff_id: '', existing: false, isNew: true }
                      setExtraLegs(prev => [...prev, newLeg])
                      setActiveLeg(newLeg)
                    }}
                    style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '0.5px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
                    + Add Stop
                  </button>
                )}
              </div>
            )}

            {/* Date + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
                  {['PLANNED','BUSY','DONE','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Pickup / Dropoff */}
            <div>
              <label style={lbl}>Pickup</label>
              <select value={form.pickup_id} onChange={e => {
                set('pickup_id', e.target.value)
                if (activeLeg?.isNew) setExtraLegs(prev => prev.map(l => l.id === activeLeg.id ? { ...l, pickup_id: e.target.value } : l))
              }} style={inp} required>
                <option value="">Select pickup…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => {
                set('dropoff_id', e.target.value)
                if (activeLeg?.isNew) setExtraLegs(prev => prev.map(l => l.id === activeLeg.id ? { ...l, dropoff_id: e.target.value } : l))
              }} style={inp} required>
                <option value="">Select dropoff…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
              </select>
            </div>

            {/* Vehicle */}
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail   = isVehicleAvailableForDate(v, form.date)
                  const hasPref = v.preferred_dept || v.preferred_crew_ids?.length > 0
                  return (
                    <option key={v.uuid} value={v.uuid}>
                      {avail ? '' : '⚠ '}{v.display_id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{hasPref ? ` · ⭐ ${[v.preferred_dept, v.preferred_crew_ids?.length > 0 ? `${v.preferred_crew_ids.length}p` : null].filter(Boolean).join(' ')}` : ''}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
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

            {/* Time inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>{transferClass === 'ARRIVAL' ? 'Arrival Time' : transferClass === 'DEPARTURE' ? 'Departure Time' : (group && group.length > 1) ? 'Call Time' : 'Pickup Time'}</label>
                <input type="time"
                  value={transferClass !== 'STANDARD' ? form.arr_time : form.call_time}
                  onChange={e => transferClass !== 'STANDARD' ? set('arr_time', e.target.value) : set('call_time', e.target.value)}
                  style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
              </div>
              <div>
                <label style={lbl}>Duration (min) {durLoading && '…'}</label>
                <input type="number" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} style={{ ...inp, fontVariantNumeric: 'tabular-nums' }} placeholder="auto" min="1" max="240" />
              </div>
            </div>
            <div>
              <label style={lbl}>Pickup Time <span style={{ fontWeight: '400', color: '#cbd5e1' }}>(override — optional)</span></label>
              <input type="time" value={form.pickup_time} onChange={e => set('pickup_time', e.target.value)}
                style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderColor: form.pickup_time ? '#f59e0b' : '#e2e8f0', background: form.pickup_time ? '#fffbeb' : 'white' }} />
              {form.pickup_time && (
                <div style={{ fontSize: '10px', color: '#92400e', fontWeight: '700', marginTop: '3px' }}>
                  ⚡ Pickup time overridden — automatic calculation ignored
                  <button type="button" onClick={() => set('pickup_time', '')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: '800' }}>✕ clear</button>
                </div>
              )}
            </div>

            {/* Times preview */}
            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {(() => {
                  const isChain = group && group.length > 1
                  const pickupV = isChain && initial?.pickup_min != null
                    ? minToHHMM(initial.pickup_min)
                    : minToHHMM(computed.pickupMin)
                  const startV  = isChain && initial?.start_dt
                    ? new Date(initial.start_dt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    : new Date(computed.startDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                  return [
                    { l: 'CALL',   v: minToHHMM(computed.callMin),   chain: false },
                    { l: 'PICKUP', v: pickupV,                        chain: isChain },
                    { l: 'START',  v: startV,                         chain: isChain },
                    { l: 'END',    v: new Date(computed.endDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), chain: false },
                  ].map(({ l, v, chain }) => (
                    <div key={l} style={{ textAlign: 'center', background: chain ? '#fef9c3' : '#f0fdf4', border: `1px solid ${chain ? '#fde68a' : '#bbf7d0'}`, borderRadius: '8px', padding: '6px 4px' }}>
                      <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.07em' }}>{l}{chain ? ' ⚡' : ''}</div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* Flight + Terminal + Service */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Flight / Train</label>
                <input value={form.flight_no} onChange={e => set('flight_no', e.target.value)} style={inp} placeholder="AZ 4568" />
              </div>
              <div>
                <label style={lbl}>Terminal</label>
                <input value={form.terminal} onChange={e => set('terminal', e.target.value)} style={inp} placeholder="T1, T2, Arrivi Nord…" />
              </div>
            </div>
            <div>
              <label style={lbl}>Service Type</label>
              <select value={form.service_type_id} onChange={e => set('service_type_id', e.target.value)} style={inp}>
                <option value="">None</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Passengers */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              {/* Crew Lookup */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>🔍 Crew Lookup</div>
                <input type="text" placeholder="Search by name or department…" value={crewLookupQ} onChange={e => setCrewLookupQ(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
                {crewLookupResults.length > 0 && (
                  <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: 'white' }}>
                    {crewLookupResults.map(c => (
                      <div key={c.uuid} onClick={() => setCrewInfoCrew(c)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: 'white' }} onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>ℹ️</span>
                      </div>
                    ))}
                  </div>
                )}
                {crewLookupQ.length >= 2 && crewLookupResults.length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '6px 0 2px', fontStyle: 'italic' }}>No results</div>}
              </div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Passengers ({(activeLeg ? assignedPax.filter(p => p.trip_row_id === activeLeg.id) : assignedPax).length}{initial?.capacity ? `/${initial.capacity}` : ``})
              </div>

              {paxLoading ? (
                <div style={{ padding: '10px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>{t.loadingPax}</div>
              ) : (
                <>
                  {assignedPax.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', letterSpacing: '0.05em', marginBottom: '5px' }}>
                        {t.assignedSection} ({(activeLeg ? assignedPax.filter(p => p.trip_row_id === activeLeg.id) : assignedPax).length})
                      </div>
                      {group && group.length > 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {[activeLeg ?? group[0]].map(leg => {
                            const legPax = assignedPax.filter(p => p.trip_row_id === leg.id)
                            const legHotelId = leg.transfer_class === 'ARRIVAL' ? leg.dropoff_id : leg.pickup_id
                            const legHotelName = locShortEdit(legHotelId)
                            const legPickupTime = leg.pickup_min != null ? minToHHMM(leg.pickup_min) : null
                            return (
                              <div key={leg.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 8px', marginBottom: '3px' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: '800', color: '#374151' }}>{leg.trip_id}</span>
                                  <span style={{ color: '#cbd5e1', fontSize: '10px' }}>·</span>
                                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>🏨 {legHotelName}</span>
                                  {legPickupTime && <span style={{ fontSize: '10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>🕐 {legPickupTime}</span>}
                                  <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0 }}>{legPax.length}p</span>
                                  <button type="button" onClick={() => deleteLeg(leg)} title="Delete this leg"
                                    style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '3px', padding: '1px 4px', cursor: 'pointer', fontSize: '9px', fontWeight: '800', flexShrink: 0, lineHeight: 1 }}>🗑</button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '4px' }}>
                                  {legPax.length > 0 ? legPax.map(c => (
                                    <div key={c.uuid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.full_name}</span>
                                        {c.no_transport_needed && <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>}
                                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>{c.department}</span>
                                      </div>
                                      <button type="button" onClick={() => removePax(c)}
                                        style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0, marginLeft: '4px' }}>×</button>
                                    </div>
                                  )) : (
                                    <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic', padding: '2px 8px' }}>—</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {assignedPax.map(c => (
                            <div key={c.uuid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.full_name}</span>
                                {c.no_transport_needed && <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1' }}>🚐 SD</span>}
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{c.department}</span>
                                {c.hotel_id && locsById[c.hotel_id] && <span style={{ color: '#64748b', fontSize: '10px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>🏨 {locShortEdit(c.hotel_id)}</span>}
                              </div>
                              <button type="button" onClick={() => removePax(c)}
                                style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {suggestedCrewEdit.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '6px' }}>📌 Suggeriti per {selVehicleEdit.id}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {suggestedCrewEdit.map(c => (
                          <div key={c.uuid} onClick={() => addPax(c)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'white', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fef9c3'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                            </div>
                            <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '700', flexShrink: 0 }}>+</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {regularCrew.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '0.05em' }}>
                          {t.availableSection} ({freeCount})
                          {busyCount > 0 && <span style={{ color: '#a16207', marginLeft: '6px' }}>· {busyCount} BUSY</span>}
                        </div>
                        {freeCount > 0 && (
                          <button type="button" onClick={() => regularCrew.filter(c => !busyMap[c.uuid]).forEach(c => addPax(c))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '10px', fontWeight: '700' }}>
                            Add all ({freeCount})
                          </button>
                        )}
                      </div>
                      <input type="text" placeholder="Search crew…" value={paxSearch} onChange={e => setPaxSearch(e.target.value)}
                        style={{ ...inp, padding: '5px 9px', fontSize: '12px', marginBottom: '4px' }} />
                      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        {filtered.length === 0 ? (
                          <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>{t.noResults}</div>
                        ) : filtered.map(c => {
                          const isBusy = !!busyMap[c.uuid]
                          return (
                            <div key={c.uuid} onClick={() => !isBusy && addPax(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f8fafc', background: isBusy ? '#fffbeb' : 'white' }}
                              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#eff6ff' }}
                              onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = 'white' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px' }}>
                                  <span>{c.department}</span>
                                  {c.hotel_id && locsById[c.hotel_id] && <span style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', border: '1px solid #e2e8f0', color: '#475569' }}>🏨 {locShortEdit(c.hotel_id)}</span>}
                                  {c._checkoutToday && c.no_transport_needed && <span style={{ color: '#d97706', fontWeight: '700', background: '#fef9c3', padding: '1px 4px', borderRadius: '3px', border: '1px solid #fde68a' }}>⚠ CHK-OUT oggi · OA</span>}
                                  {c._checkoutToday && !c.no_transport_needed && <span style={{ color: '#d97706', fontWeight: '700', background: '#fef9c3', padding: '1px 4px', borderRadius: '3px', border: '1px solid #fde68a' }}>⚠ CHK-OUT oggi</span>}
                                  {isBusy && <span style={{ color: '#a16207' }}>⚠ BUSY on {busyMap[c.uuid]}</span>}
                                </div>
                              </div>
                              {!isBusy && <span style={{ fontSize: '14px', color: '#2563eb', fontWeight: '700', flexShrink: 0 }}>+</span>}
                              {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                            </div>
                          )
                        })}
                      </div>

                      {filteredNtn.length > 0 && (
                        <div style={{ marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', letterSpacing: '0.05em', marginBottom: '5px' }}>
                            🚐 {t.selfDrive} / {t.ntnShort} ({ntnCrew.filter(c => !busyMap[c.uuid]).length})
                          </div>
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                            {filteredNtn.map(c => {
                              const isBusy = !!busyMap[c.uuid]
                              return (
                                <div key={c.uuid} onClick={() => !isBusy && addPax(c)}
                                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f1f5f9', background: isBusy ? '#fffbeb' : '#f8fafc' }}
                                  onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#f1f5f9' }}
                                  onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = '#f8fafc' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                                      <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                      {c.department}
                                      {isBusy && <span style={{ color: '#a16207', marginLeft: '4px' }}>· ⚠ BUSY on {busyMap[c.uuid]}</span>}
                                    </div>
                                  </div>
                                  {!isBusy && <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '700', flexShrink: 0 }}>+</span>}
                                  {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : ntnCrew.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', letterSpacing: '0.05em', marginBottom: '5px' }}>
                        🚐 {t.selfDrive} / {t.ntnShort} ({ntnCrew.filter(c => !busyMap[c.uuid]).length})
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                        {filteredNtn.map(c => {
                          const isBusy = !!busyMap[c.uuid]
                          return (
                            <div key={c.uuid} onClick={() => !isBusy && addPax(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f1f5f9', background: isBusy ? '#fffbeb' : '#f8fafc' }}
                              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#f1f5f9' }}
                              onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = '#f8fafc' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                                  <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>
                                </div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  {c.department}
                                  {isBusy && <span style={{ color: '#a16207', marginLeft: '4px' }}>· ⚠ BUSY on {busyMap[c.uuid]}</span>}
                                </div>
                              </div>
                              {!isBusy && <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '700', flexShrink: 0 }}>+</span>}
                              {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    assignedPax.length === 0 && (
                      <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                        {t.noEligibleCrew}
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* Trip Notes */}
            {initial?.id ? (
              <TripNotesPanel tripRowId={initial.id} productionId={PRODUCTION_ID} currentUser={currentUser} />
            ) : (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                📋 Save the trip first to add notes
              </div>
            )}

            {/* Danger zone */}
            <div style={{ borderTop: '1px solid #fecaca', paddingTop: '12px', marginTop: '4px' }}>
              {!confirmDel ? (
                <button type="button" onClick={handleDelete}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11px', fontWeight: '600', padding: '4px 0', opacity: 0.7 }}>
                  🗑 Delete Trip {baseTripId(initial?.trip_id)}{group && group.length > 1 ? ` (${group.length} stops)` : ''}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: '600', flexShrink: 0 }}>{t.deleteTripConfirm}</span>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ flex: 1, padding: '6px', border: 'none', background: '#dc2626', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>
                    {deleting ? '…' : t.yesDelete}
                  </button>
                  <button type="button" onClick={() => setConfirmDel(false)}
                    style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white', position: 'sticky', bottom: 0 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#1e3a5f', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : t.saveChanges}
            </button>
          </div>
        </form>
      </div>
      {crewInfoCrew && (
        <CrewInfoModal crew={crewInfoCrew} productionId={PRODUCTION_ID} locations={locations} onClose={() => setCrewInfoCrew(null)} overlayRight={SIDEBAR_W} />
      )}
    </>
  )
}

export default EditTripSidebar


