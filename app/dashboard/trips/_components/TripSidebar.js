'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useT } from '../../../../lib/i18n'
import { getProductionId } from '../../../../lib/production'
import {
  SIDEBAR_W, LOCATION_TYPES, CLS,
  timeStrToMin, isoToday, baseTripId,
  getClass, calcTimes, isVehicleAvailableForDate, checkVehicleAvail,
} from '../../../../lib/tripUtils'
import CrewInfoModal, { AssignCtxTravelNotes } from './CrewInfoModal'

function TripSidebar({ open, onClose, defaultDate, locations, vehicles, serviceTypes, onSaved, assignCtx, trips, onLocationCreated, currentUser }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const isMobile = useIsMobile()
  const EMPTY = { trip_id: '', date: defaultDate, pickup_id: '', dropoff_id: '', vehicle_id: '', service_type_id: '', arr_time: '', call_time: '', pickup_time: '', flight_no: '', terminal: '', notes: '', duration_min: '' }
  const [form,           setForm]           = useState(EMPTY)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)
  const [durLoading,     setDurLoading]     = useState(false)
  const [crewList,       setCrewList]       = useState([])
  const [crewSearch,     setCrewSearch]     = useState('')
  const [selCrew,        setSelCrew]        = useState([])
  const [vCheck,         setVCheck]         = useState(null)
  const [selExistingTrip, setSelExistingTrip] = useState(null)
  const [addingToTrip,    setAddingToTrip]    = useState(false)
  const [addedToTrip,     setAddedToTrip]     = useState(null)
  const [sibDropoff,      setSibDropoff]      = useState('')
  const [crewLookupQ,       setCrewLookupQ]       = useState('')
  const [crewLookupResults, setCrewLookupResults] = useState([])
  const [crewInfoCrew,      setCrewInfoCrew]      = useState(null)

  const [localLocs,          setLocalLocs]          = useState(locations)
  const [newLocTarget,       setNewLocTarget]       = useState(null)
  const [newLocForm,         setNewLocForm]         = useState({ id: '', name: '', is_hub: false })
  const [newLocSaving,       setNewLocSaving]       = useState(false)
  const [newLocError,        setNewLocError]        = useState(null)
  const [newLocDoneMsg,      setNewLocDoneMsg]      = useState(null)
  const [newLocPlaceQuery,   setNewLocPlaceQuery]   = useState('')
  const [newLocPredictions,  setNewLocPredictions]  = useState([])
  const [newLocPlaceOpen,    setNewLocPlaceOpen]    = useState(false)
  const [newLocPlaceLoading, setNewLocPlaceLoading] = useState(false)
  const [newLocPlaceError,   setNewLocPlaceError]   = useState(null)
  const [newLocLat,          setNewLocLat]          = useState('')
  const [newLocLng,          setNewLocLng]          = useState('')
  const [newLocType,         setNewLocType]         = useState('')
  const newLocDebounceRef = useRef(null)
  const newLocDropdownRef = useRef(null)

  const [multiMode,         setMultiMode]         = useState(false)
  const [multiType,         setMultiType]         = useState('ARRIVAL')
  const [savedLegs,         setSavedLegs]         = useState([])
  const [editingLegLocalId, setEditingLegLocalId] = useState(null)
  const [multiSaving,       setMultiSaving]       = useState(false)

  // UUID→TEXT id lookup so getClass (which uses hub prefix patterns) still works after migration
  const locUuidToTextId = Object.fromEntries(localLocs.map(l => [l.uuid, l.id]).filter(([k]) => k))
  const transferClass = getClass(locUuidToTextId[form.pickup_id] || form.pickup_id, locUuidToTextId[form.dropoff_id] || form.dropoff_id)
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function suggestLocId(name) {
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC'
  }

  useEffect(() => {
    if (!open) return
    const preForm = { ...EMPTY, date: defaultDate }
    if (assignCtx?.hotel) {
      if (assignCtx.ts === 'IN')       preForm.dropoff_id = assignCtx.hotel
      else if (assignCtx.ts === 'OUT') preForm.pickup_id  = assignCtx.hotel
      else                             preForm.pickup_id  = assignCtx.hotel
    }
    setForm(preForm)
    setError(null); setSelCrew([]); setCrewSearch(''); setVCheck(null)
    setSelExistingTrip(null); setAddedToTrip(null)
    setCrewLookupQ(''); setCrewLookupResults([]); setCrewInfoCrew(null)
    setMultiMode(false); setSavedLegs([]); setEditingLegLocalId(null)
    setLocalLocs(locations)
    setNewLocTarget(null); setNewLocForm({ id: '', name: '', is_hub: false }); setNewLocError(null); setNewLocDoneMsg(null)
    setNewLocPlaceQuery(''); setNewLocPredictions([]); setNewLocPlaceOpen(false); setNewLocLat(''); setNewLocLng(''); setNewLocType('')
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setForm(f => ({ ...f, trip_id: 'T' + String(num + 1).padStart(3, '0') }))
        })
    }
  }, [open, defaultDate])

  useEffect(() => {
    if (!form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  useEffect(() => {
    if (!form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, null).then(setVCheck)
  }, [form.vehicle_id, form.date, computed?.startDt, computed?.endDt])

  useEffect(() => {
    let cancelled = false
    setSelCrew([]); setCrewList([])
    if (!PRODUCTION_ID || !form.pickup_id || !form.dropoff_id) return () => { cancelled = true }
    const hotelId = transferClass === 'ARRIVAL' ? form.dropoff_id : form.pickup_id
    let q = supabase.from('crew_stays')
      .select('crew_id, departure_date, crew!inner(uuid, id, full_name, department, hotel_status)')
      .eq('production_id', PRODUCTION_ID)
      .eq('hotel_id', hotelId)
    if (transferClass === 'ARRIVAL')        q = q.eq('arrival_date', form.date)
    else if (transferClass === 'DEPARTURE') q = q.eq('departure_date', form.date)
    else                                    q = q.lte('arrival_date', form.date).gte('departure_date', form.date)
    q.then(({ data }) => {
      if (cancelled) return
      const crew = (data || [])
        .filter(s => s.crew?.hotel_status === 'CONFIRMED')
        .map(s => ({ id: s.crew.id, uuid: s.crew.uuid, full_name: s.crew.full_name, department: s.crew.department }))
        .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name))
      setCrewList(crew)
      if (assignCtx?.id) {
        const match = crew.find(c => c.id === assignCtx.id)
        if (match) setSelCrew(prev => prev.some(x => x.id === match.id) ? prev : [...prev, match])
      }
    })
    return () => { cancelled = true }
  }, [form.pickup_id, form.dropoff_id, form.date, transferClass])

  useEffect(() => {
    if (crewLookupQ.length < 2 || !PRODUCTION_ID) { setCrewLookupResults([]); return }
    supabase.from('crew').select('uuid,id,full_name,department,role')
      .eq('production_id', PRODUCTION_ID)
      .or(`full_name.ilike.%${crewLookupQ}%,department.ilike.%${crewLookupQ}%`)
      .limit(8)
      .then(({ data }) => setCrewLookupResults(data || []))
  }, [crewLookupQ, PRODUCTION_ID])

  useEffect(() => {
    if (newLocDebounceRef.current) clearTimeout(newLocDebounceRef.current)
    if (!newLocPlaceQuery.trim() || newLocPlaceQuery.length < 2) { setNewLocPredictions([]); setNewLocPlaceOpen(false); return }
    newLocDebounceRef.current = setTimeout(async () => {
      setNewLocPlaceLoading(true); setNewLocPlaceError(null)
      try {
        const res  = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(newLocPlaceQuery)}`)
        const data = await res.json()
        if (data.predictions) { setNewLocPredictions(data.predictions); setNewLocPlaceOpen(data.predictions.length > 0) }
        else { setNewLocPlaceError(data.error || 'Errore ricerca'); setNewLocPlaceOpen(false) }
      } catch { setNewLocPlaceError('Network error'); setNewLocPlaceOpen(false) }
      setNewLocPlaceLoading(false)
    }, 400)
    return () => clearTimeout(newLocDebounceRef.current)
  }, [newLocPlaceQuery])

  useEffect(() => {
    function handler(e) { if (newLocDropdownRef.current && !newLocDropdownRef.current.contains(e.target)) setNewLocPlaceOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selVehicle    = vehicles.find(v => v.uuid === form.vehicle_id)
  const suggestedCrew = (selVehicle && (selVehicle.preferred_dept || selVehicle.preferred_crew_ids?.length > 0))
    ? crewList.filter(c =>
        (selVehicle.preferred_crew_ids?.includes(c.id)) ||
        (selVehicle.preferred_dept && c.department === selVehicle.preferred_dept)
      )
    : []

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (!form.trip_id || !form.date || !form.pickup_id || !form.dropoff_id) {
      setError('Required: Trip ID, Date, Pickup, Dropoff'); return
    }
    setSaving(true)
    const row = {
      production_id: PRODUCTION_ID, trip_id: form.trip_id.trim(), date: form.date,
      pickup_id: form.pickup_id, dropoff_id: form.dropoff_id,
      vehicle_id: form.vehicle_id || null,
      driver_name: selVehicle?.driver_name || null,
      sign_code:   selVehicle?.sign_code   || null,
      capacity:    selVehicle?.capacity    || null,
      service_type_id: form.service_type_id || null,
      duration_min: durMin,
      arr_time:   form.arr_time ? form.arr_time + ':00' : null,
      call_min:   computed?.callMin   ?? null,
      pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : (computed?.pickupMin ?? null),
      start_dt:   (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin
        if (pm === null || pm === undefined) return computed?.startDt ?? null
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
      })(),
      end_dt:     (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin
        if (pm === null || pm === undefined || !durMin) return computed?.endDt ?? null
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).getTime() + durMin * 60000).toISOString()
      })(),
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: 'PLANNED', pax_count: 0,
    }
    const { data: ins, error: err } = await supabase.from('trips').insert(row).select('id').single()
    if (err) { setSaving(false); setError(err.message); return }
    if (selCrew.length > 0 && ins?.id) {
      await supabase.from('trip_passengers').insert(
        selCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid }))
      )
    }
    setSaving(false); onSaved()
    setForm(f => ({ ...EMPTY, date: f.date }))
    setError(null); setSelCrew([]); setCrewSearch('')
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setForm(f => ({ ...f, trip_id: 'T' + String(num + 1).padStart(3, '0') }))
        })
    }
  }

  const locsById = Object.fromEntries(locations.map(l => [l.uuid, l.name]))
  const locShort = id => (locsById[id] || id || '–').split(' ').slice(0, 3).join(' ')

  function getLegTripId(idx) {
    const base = form.trip_id || 'T001'
    return idx === 0 ? base : base + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[idx - 1]
  }

  function handleAddLeg() {
    if (!form.pickup_id || !form.dropoff_id) { setError('Seleziona Pickup e Dropoff per questo leg'); return }
    const snap = {
      localId:       Date.now().toString(),
      form:          { ...form },
      selCrew:       [...selCrew],
      computed:      computed ? { ...computed } : null,
      transferClass: getClass(locUuidToTextId[form.pickup_id] || form.pickup_id, locUuidToTextId[form.dropoff_id] || form.dropoff_id),
    }
    if (editingLegLocalId) {
      setSavedLegs(prev => prev.map(l => l.localId === editingLegLocalId ? { ...snap, localId: editingLegLocalId } : l))
      setEditingLegLocalId(null)
    } else {
      setSavedLegs(prev => [...prev, snap])
    }
    const sharedVehicle = savedLegs.length > 0
      ? savedLegs[0].form.vehicle_id
      : snap.form.vehicle_id
    setForm(f => ({
      ...f,
      pickup_id:    '',
      dropoff_id:   '',
      duration_min: '',
      vehicle_id:   sharedVehicle || f.vehicle_id,
    }))
    setSelCrew([]); setCrewSearch(''); setError(null)
  }

  function handleEditLeg(leg) {
    setForm({ ...leg.form })
    setSelCrew([...leg.selCrew])
    setEditingLegLocalId(leg.localId)
    setError(null)
  }

  function handleDeleteLeg(localId) {
    setSavedLegs(prev => prev.filter(l => l.localId !== localId))
    if (editingLegLocalId === localId) {
      setEditingLegLocalId(null)
      setForm(f => ({ ...f, pickup_id: '', dropoff_id: '', duration_min: '' }))
      setSelCrew([])
    }
  }

  async function handleMultiSubmit() {
    setError(null)
    const multiGroupId = crypto.randomUUID()
    const allLegs = [...savedLegs]
    if (form.pickup_id && form.dropoff_id) {
      allLegs.push({
        localId:       '_current',
        form:          { ...form },
        selCrew:       [...selCrew],
        computed:      computed ? { ...computed } : null,
        transferClass: getClass(locUuidToTextId[form.pickup_id] || form.pickup_id, locUuidToTextId[form.dropoff_id] || form.dropoff_id),
      })
    }
    if (allLegs.length < 2) { setError('Aggiungi almeno 2 leg: usa "+ Add Leg" o compila il form per l\'ultima leg'); return }
    if (!form.trip_id)      { setError('Trip ID base richiesto'); return }
    setMultiSaving(true)
    const insertedIds = []
    try {
      for (let i = 0; i < allLegs.length; i++) {
        const leg     = allLegs[i]
        const legForm = leg.form
        const legComp = leg.computed
        const legDurMin = parseInt(legForm.duration_min) || null
        const legVeh  = vehicles.find(v => v.uuid === legForm.vehicle_id)
        const row = {
          production_id:   PRODUCTION_ID,
          trip_id:         getLegTripId(i),
          trip_group_id:   multiGroupId,
          leg_order:       i + 1,
          date:            legForm.date,
          pickup_id:       legForm.pickup_id,
          dropoff_id:      legForm.dropoff_id,
          vehicle_id:      legForm.vehicle_id      || null,
          driver_name:     legVeh?.driver_name     || null,
          sign_code:       legVeh?.sign_code       || null,
          capacity:        legVeh?.capacity        || null,
          service_type_id: legForm.service_type_id || null,
          duration_min:    legDurMin,
          arr_time:        legForm.arr_time ? legForm.arr_time + ':00' : null,
          call_min:        legComp?.callMin   ?? null,
          pickup_min:      legComp?.pickupMin ?? null,
          start_dt:        legComp?.startDt   ?? null,
          end_dt:          legComp?.endDt     ?? null,
          flight_no:       legForm.flight_no || null,
          terminal:        legForm.terminal  || null,
          notes:           legForm.notes     || null,
          status:          'PLANNED',
          pax_count:       0,
        }
        const { data: ins, error: tripErr } = await supabase.from('trips').insert(row).select('id').single()
        if (tripErr || !ins?.id) throw new Error(tripErr?.message || `Errore inserimento leg ${i + 1}`)
        insertedIds.push(ins.id)
        if (leg.selCrew.length > 0) {
          await supabase.from('trip_passengers').insert(
            leg.selCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid }))
          )
          await supabase.from('trips').update({
            pax_count:      leg.selCrew.length,
            passenger_list: leg.selCrew.map(c => c.full_name).join(', '),
          }).eq('id', ins.id)
        }
      }
      if (insertedIds.length >= 2) {
        await fetch('/api/routes/compute-chain', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ leg_ids: insertedIds, production_id: PRODUCTION_ID, trip_group_id: multiGroupId }),
        })
      }
      setMultiSaving(false); setSavedLegs([]); setEditingLegLocalId(null); setMultiMode(false)
      onSaved()
    } catch (e) {
      setMultiSaving(false); setError(e.message)
    }
  }

  async function handleSaveNewLoc() {
    if (!newLocForm.id.trim() || !newLocForm.name.trim()) { setNewLocError('ID e Nome obbligatori'); return }
    if (!PRODUCTION_ID) { setNewLocError('Production ID mancante'); return }
    setNewLocSaving(true); setNewLocError(null); setNewLocDoneMsg(null)
    const row = {
      production_id: PRODUCTION_ID,
      display_id:     newLocForm.id.trim().toUpperCase(),
      name:   newLocForm.name.trim(),
      is_hub: newLocForm.is_hub,
      lat:    newLocLat !== '' ? parseFloat(String(newLocLat).replace(',', '.')) : null,
      lng:    newLocLng !== '' ? parseFloat(String(newLocLng).replace(',', '.')) : null,
    }
    const { data: newLocData, error: insErr } = await supabase.from('locations').insert(row).select('uuid').single()
    if (insErr || !newLocData) { setNewLocSaving(false); setNewLocError(insErr?.message || 'Insert failed'); return }
    if (row.lat != null && row.lng != null) {
      try {
        const r    = await fetch(`/api/routes/refresh-location?id=${encodeURIComponent(newLocData.uuid)}`)
        const data = await r.json()
        setNewLocDoneMsg(data.updated ? `✅ ${data.updated} rotte calcolate` : '✅ Location salvata')
      } catch { setNewLocDoneMsg('✅ Location salvata') }
    } else {
      setNewLocDoneMsg('✅ Location salvata')
    }
    const newLoc = { ...row, uuid: newLocData.uuid, default_pickup_point: null }
    setLocalLocs(prev => [...prev, newLoc].sort((a, b) => {
      if (a.is_hub !== b.is_hub) return a.is_hub ? -1 : 1
      return a.name.localeCompare(b.name)
    }))
    if (newLocTarget === 'pickup') set('pickup_id', newLocData.uuid)
    else set('dropoff_id', newLocData.uuid)
    setNewLocSaving(false)
    setTimeout(() => {
      setNewLocTarget(null)
      setNewLocForm({ id: '', name: '', is_hub: false })
      setNewLocDoneMsg(null)
      setNewLocPlaceQuery('')
      setNewLocPredictions([])
      setNewLocLat('')
      setNewLocLng('')
      onLocationCreated?.()
    }, 900)
  }

  const correctClass = assignCtx?.ts === 'IN' ? 'ARRIVAL' : assignCtx?.ts === 'OUT' ? 'DEPARTURE' : 'STANDARD'
  const allArrDepTrips = (trips || [])
    .filter(t => t.transfer_class === correctClass)
    .sort((a, b) => (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999))
  const arrDepTrips = (() => {
    const groups = {}
    const sorted = [...allArrDepTrips].sort((a, b) => {
      const aIsSib = /[A-Z]$/.test(a.trip_id || '')
      const bIsSib = /[A-Z]$/.test(b.trip_id || '')
      if (aIsSib !== bIsSib) return aIsSib ? 1 : -1
      return (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
    })
    for (const t of sorted) {
      const base = baseTripId(t.trip_id)
      if (!groups[base]) groups[base] = t
    }
    return Object.values(groups).sort((a, b) =>
      (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
    )
  })()

  function isCompatibleTrip(t) {
    if (!assignCtx?.hotel) return false
    if (assignCtx.ts === 'IN')      return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
    if (assignCtx.ts === 'OUT')     return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
    if (assignCtx.ts === 'PRESENT') return t.transfer_class === 'STANDARD'  && t.pickup_id  === assignCtx.hotel
    return false
  }
  function isCompatibleGroup(mainTrip) {
    const base = baseTripId(mainTrip.trip_id)
    return allArrDepTrips.filter(t => baseTripId(t.trip_id) === base).some(leg => isCompatibleTrip(leg))
  }
  const compatibleTrips = arrDepTrips.filter(isCompatibleGroup)
  const otherTrips      = arrDepTrips.filter(t => !isCompatibleGroup(t))

  async function handleAddToExisting() {
    if (!selExistingTrip || !assignCtx?.id || !PRODUCTION_ID) return
    setAddingToTrip(true)

    const groupBase = baseTripId(selExistingTrip.trip_id)
    const allGroupLegs = (trips || []).filter(t =>
      baseTripId(t.trip_id) === groupBase &&
      (t.vehicle_id || null) === (selExistingTrip.vehicle_id || null)
    )
    const compatibleLeg = allGroupLegs.find(leg => isCompatibleTrip(leg)) || null

    if (compatibleLeg) {
      const { error } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: compatibleLeg.id, crew_id: assignCtx.uuid,
      })
      if (!error) {
        const prevList = compatibleLeg.passenger_list ? compatibleLeg.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
        const newList  = [...prevList, assignCtx.name]
        await supabase.from('trips').update({
          pax_count:      newList.length,
          passenger_list: newList.join(', '),
        }).eq('id', compatibleLeg.id)
      }
      setAddingToTrip(false)
      if (!error) {
        if (allGroupLegs.length > 1) {
          try {
            await fetch('/api/routes/compute-chain', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ leg_ids: allGroupLegs.map(g => g.id), production_id: PRODUCTION_ID }),
            })
          } catch (e) { console.warn('[handleAddToExisting] chain recalc (compat):', e) }
        }
        setAddedToTrip(compatibleLeg.trip_id); onSaved()
      }
    } else {
      if (!assignCtx.hotel) {
        setAddingToTrip(false)
        setError('Hotel mancante nel contesto assegnazione — impossibile creare leg sibling. Ricarica la pagina e riprova.')
        return
      }

      const base = baseTripId(selExistingTrip.trip_id)
      const { data: siblings } = await supabase.from('trips')
        .select('trip_id')
        .eq('production_id', PRODUCTION_ID)
        .eq('date', selExistingTrip.date)
        .ilike('trip_id', `${base}%`)

      const usedLetters = new Set((siblings || []).map(t => {
        const suf = t.trip_id.slice(base.length)
        return suf.length === 1 && /^[A-Z]$/.test(suf) ? suf : null
      }).filter(Boolean))

      let nextLetter = 'B'
      for (const l of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (!usedLetters.has(l)) { nextLetter = l; break }
      }
      const newTripId = base + nextLetter
      const mainGroupId = selExistingTrip.trip_group_id || crypto.randomUUID()
      if (!selExistingTrip.trip_group_id) {
        await supabase.from('trips')
          .update({ trip_group_id: mainGroupId })
          .eq('id', selExistingTrip.id)
      }

      const sibPickupId  = selExistingTrip.transfer_class === 'ARRIVAL'  ? selExistingTrip.pickup_id : assignCtx.hotel
      const sibDropoffId = selExistingTrip.transfer_class === 'ARRIVAL'  ? assignCtx.hotel           : (sibDropoff || selExistingTrip.dropoff_id)
      const { data: sibRoute } = await supabase.from('routes')
        .select('duration_min')
        .eq('production_id', PRODUCTION_ID)
        .eq('from_id', sibPickupId)
        .eq('to_id', sibDropoffId)
        .maybeSingle()
      let sibDurationMin = sibRoute?.duration_min || null
      if (!sibDurationMin && sibPickupId && sibDropoffId && PRODUCTION_ID) {
        try {
          const computeRes = await fetch('/api/routes/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_id: sibPickupId, to_id: sibDropoffId, production_id: PRODUCTION_ID }),
          })
          if (computeRes.ok) {
            const computeData = await computeRes.json()
            if (computeData.duration_min) sibDurationMin = computeData.duration_min
          }
        } catch (e) { console.warn('[handleAddToExisting] route compute fallback failed:', e) }
      }
      if (!sibDurationMin && sibPickupId && sibDropoffId && PRODUCTION_ID) {
        const { data: revRoute } = await supabase.from('routes')
          .select('duration_min')
          .eq('production_id', PRODUCTION_ID)
          .eq('from_id', sibDropoffId)
          .eq('to_id', sibPickupId)
          .maybeSingle()
        if (revRoute?.duration_min) sibDurationMin = revRoute.duration_min
      }
      let sibCalc = null
      if (sibDurationMin) {
        sibCalc = calcTimes({
          date:          selExistingTrip.date,
          arrTimeMin:    selExistingTrip.arr_time ? timeStrToMin(selExistingTrip.arr_time.slice(0,5)) : null,
          durationMin:   sibDurationMin,
          transferClass: selExistingTrip.transfer_class,
          callMin:       selExistingTrip.call_min ?? null,
        })
      }

      const sibPickupMin = sibCalc?.pickupMin ?? (() => {
        const c = selExistingTrip.call_min ?? null
        if (selExistingTrip.transfer_class === 'ARRIVAL') return c
        if (c === null) return null
        return sibDurationMin
          ? ((c - sibDurationMin) % 1440 + 1440) % 1440
          : null
      })()

      const sibStartDt = sibCalc?.startDt ?? (() => {
        if (sibPickupMin === null) return null
        const [sy, smo, sdd] = selExistingTrip.date.split('-').map(Number)
        return new Date(sy, smo - 1, sdd, Math.floor(sibPickupMin / 60), sibPickupMin % 60, 0, 0).toISOString()
      })()

      const siblingRow = {
        production_id: PRODUCTION_ID,
        trip_id:        newTripId,
        trip_group_id:  mainGroupId,
        leg_order:      (allGroupLegs.length + 1),
        date:           selExistingTrip.date,
        pickup_id:  selExistingTrip.transfer_class === 'ARRIVAL'
          ? selExistingTrip.pickup_id
          : assignCtx.hotel,
        dropoff_id: selExistingTrip.transfer_class === 'ARRIVAL'
          ? assignCtx.hotel
          : (sibDropoff || selExistingTrip.dropoff_id),
        vehicle_id:      selExistingTrip.vehicle_id      || null,
        driver_name:     selExistingTrip.driver_name     || null,
        sign_code:       selExistingTrip.sign_code       || null,
        capacity:        selExistingTrip.capacity        || null,
        service_type_id: selExistingTrip.service_type_id || null,
        call_min:        sibCalc?.callMin   ?? selExistingTrip.call_min   ?? null,
        pickup_min:      sibPickupMin,
        arr_time:        selExistingTrip.arr_time        || null,
        flight_no:       selExistingTrip.flight_no       || null,
        terminal:        selExistingTrip.terminal        || null,
        notes:           selExistingTrip.notes           || null,
        duration_min:    sibDurationMin                  || null,
        start_dt:        sibStartDt,
        end_dt:          sibCalc?.endDt     ?? null,
        status:          selExistingTrip.status          || 'PLANNED',
        pax_count: 0,
      }

      const { data: newRow, error: tripErr } = await supabase.from('trips').insert(siblingRow).select('id').single()
      if (tripErr || !newRow?.id) { setAddingToTrip(false); setError(tripErr?.message || t.errorSiblingTrip); return }

      const { error: paxErr } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: newRow.id, crew_id: assignCtx.uuid,
      })
      if (!paxErr) {
        await supabase.from('trips').update({
          pax_count: 1,
          passenger_list: assignCtx.name,
        }).eq('id', newRow.id)
      }
      setAddingToTrip(false)
      if (paxErr) { setError(paxErr.message) }
      else {
        try {
          await fetch('/api/routes/compute-chain', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              leg_ids:       [...allGroupLegs.map(g => g.id), newRow.id],
              production_id: PRODUCTION_ID,
              trip_group_id: mainGroupId,
            }),
          })
        } catch (e) { console.warn('[handleAddToExisting] chain recalc (sibling):', e) }
        setAddedToTrip(newTripId); onSaved()
      }
    }
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  // Helper per il form inline new location (pickup e dropoff condividono la stessa UI)
  function NewLocForm({ target }) {
    return (
      <div style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', borderRadius: '10px', padding: '12px 14px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>➕ New {target === 'pickup' ? 'Pickup' : 'Dropoff'} Location</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select value={newLocType} onChange={e => {
            const type = e.target.value; setNewLocType(type)
            const def = LOCATION_TYPES.find(lt => lt.value === type)
            if (def) setNewLocForm(f => {
              const suffix = f.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC'
              return { ...f, is_hub: def.is_hub, id: def.prefix + suffix }
            })
          }} style={{ ...inp, fontSize: '12px' }}>
            <option value="">📍 Select location type…</option>
            {LOCATION_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
          </select>
          <div style={{ position: 'relative' }} ref={newLocDropdownRef}>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Search on Google Maps…" value={newLocPlaceQuery}
                onChange={e => { setNewLocPlaceQuery(e.target.value); const _def = LOCATION_TYPES.find(lt => lt.value === newLocType); setNewLocForm(f => ({ ...f, name: e.target.value, id: _def ? (_def.prefix + (e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC')) : suggestLocId(e.target.value) })) }}
                onFocus={() => newLocPredictions.length > 0 && setNewLocPlaceOpen(true)}
                style={{ ...inp, fontSize: '12px', paddingRight: newLocPlaceLoading ? '32px' : '10px', borderColor: newLocPlaceOpen ? '#0369a1' : '#e2e8f0' }}
                autoComplete="off" />
              {newLocPlaceLoading && <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #0369a1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
            </div>
            {newLocPlaceError && <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px' }}>⚠ {newLocPlaceError}</div>}
            {newLocPlaceOpen && newLocPredictions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden', marginTop: '2px' }}>
                {newLocPredictions.map((p, i) => (
                  <button key={p.place_id} type="button"
                    onMouseDown={async () => {
                      setNewLocPlaceOpen(false); setNewLocPlaceQuery(p.description)
                      const _pn = p.main_text || p.description
                      const _def = LOCATION_TYPES.find(lt => lt.value === newLocType)
                      setNewLocForm(f => ({ ...f, name: _pn, id: _def ? (_def.prefix + (_pn.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC')) : suggestLocId(_pn) }))
                      setNewLocPlaceLoading(true); setNewLocPlaceError(null)
                      try {
                        const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}`)
                        const data = await res.json()
                        if (data.lat != null) { setNewLocLat(String(data.lat)); setNewLocLng(String(data.lng)) }
                        else setNewLocPlaceError(data.error || 'Dettagli non disponibili')
                      } catch { setNewLocPlaceError('Network error') }
                      setNewLocPlaceLoading(false)
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: i < newLocPredictions.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>📍 {p.main_text}</div>
                    {p.secondary_text && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.secondary_text}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="text" placeholder="Location name…" value={newLocForm.name}
            onChange={e => { const _def = LOCATION_TYPES.find(lt => lt.value === newLocType); setNewLocForm(f => ({ ...f, name: e.target.value, id: _def ? (_def.prefix + (e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC')) : suggestLocId(e.target.value) })) }}
            style={{ ...inp, fontSize: '12px' }} />
          <input type="text" placeholder="ID (es. H042, APT_PMO)" value={newLocForm.id}
            onChange={e => setNewLocForm(f => ({ ...f, id: e.target.value.toUpperCase() }))}
            style={{ ...inp, fontFamily: 'monospace', fontWeight: '800', letterSpacing: '0.05em', fontSize: '12px' }} />
          {(newLocLat || newLocLng) && <div style={{ fontSize: '10px', color: '#0369a1', background: '#e0f2fe', borderRadius: '5px', padding: '4px 8px' }}>📍 {newLocLat}, {newLocLng}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '8px', border: `1px solid ${newLocForm.is_hub ? '#86efac' : '#e2e8f0'}`, background: newLocForm.is_hub ? '#f0fdf4' : '#f8fafc', cursor: 'pointer' }}
            onClick={() => setNewLocForm(f => ({ ...f, is_hub: !f.is_hub }))}>
            <div style={{ width: '32px', height: '18px', borderRadius: '999px', background: newLocForm.is_hub ? '#16a34a' : '#cbd5e1', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: '1px', left: newLocForm.is_hub ? '15px' : '1px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: newLocForm.is_hub ? '#15803d' : '#374151' }}>{newLocForm.is_hub ? '✈ Hub (aeroporto/stazione)' : '🏨 Hotel / Location'}</span>
          </div>
          {newLocError && <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '4px 8px' }}>❌ {newLocError}</div>}
          {newLocDoneMsg && <div style={{ fontSize: '11px', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '4px 8px' }}>{newLocDoneMsg}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => { setNewLocTarget(null); setNewLocError(null); setNewLocDoneMsg(null); setNewLocPlaceQuery(''); setNewLocPredictions([]) }}
              style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
            <button type="button" disabled={newLocSaving || !newLocForm.name.trim() || !newLocForm.id.trim()} onClick={handleSaveNewLoc}
              style={{ flex: 2, padding: '7px', borderRadius: '7px', border: 'none', background: (newLocSaving || !newLocForm.name.trim() || !newLocForm.id.trim()) ? '#94a3b8' : '#0369a1', color: 'white', fontSize: '12px', fontWeight: '800', cursor: (newLocSaving || !newLocForm.name.trim() || !newLocForm.id.trim()) ? 'default' : 'pointer' }}>
              {newLocSaving ? '⏳ Saving…' : '✓ Create & Select'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {open && <div onClick={() => onClose()} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${isMobile ? '100vw' : SIDEBAR_W + 'px'})`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
              {multiMode ? `🔀 Multi-trip` : t.newTrip}
            </div>
            {assignCtx && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#fbbf24', fontWeight: '700', marginTop: '2px' }}>
                <span>👤 {assignCtx.name}</span>
                <button type="button" onClick={() => setCrewInfoCrew({ id: assignCtx.id, full_name: assignCtx.name })} style={{ background: 'none', border: '1px solid rgba(251,191,36,0.5)', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', fontSize: '9px', color: '#fbbf24', fontWeight: '800', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
              </div>
            )}
            {multiMode && savedLegs.length > 0 && (
              <div style={{ fontSize: '11px', color: '#86efac', fontWeight: '700', marginTop: '2px' }}>
                {savedLegs.length} leg{savedLegs.length > 1 ? 's' : ''} salvati · {form.trip_id}–{getLegTripId(savedLegs.length - 1)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setMultiMode(m => !m); setSavedLegs([]); setEditingLegLocalId(null) }}
              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '800', background: multiMode ? '#f59e0b' : 'rgba(255,255,255,0.15)', color: multiMode ? '#0f2340' : 'white', letterSpacing: '0.04em' }}>
              🔀 MULTI
            </button>
            {(!multiMode && form.pickup_id && form.dropoff_id) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass}</span>
            )}
            <button onClick={() => onClose()} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Crew Lookup */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>🔍 Crew Lookup</div>
              <input type="text" placeholder="Search by name or department…" value={crewLookupQ} onChange={e => setCrewLookupQ(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              {crewLookupResults.length > 0 && (
                <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: 'white' }}>
                  {crewLookupResults.map(c => (
                    <div key={c.id} onClick={() => setCrewInfoCrew(c)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: 'white' }} onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
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

            {/* Travel Notes del crew assegnato */}
            {assignCtx && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderLeft: '3px solid #0369a1', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>
                  💬 Notes — {assignCtx.name.split(' ')[0]}
                </div>
                <AssignCtxTravelNotes crewId={assignCtx.id} productionId={PRODUCTION_ID} />
              </div>
            )}

            {/* Multi-trip */}
            {multiMode && (
              <>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {(['ARRIVAL', 'DEPARTURE', 'STANDARD']).map(tp => {
                    const c = CLS[tp]
                    return (
                      <button key={tp} type="button" onClick={() => setMultiType(tp)}
                        style={{ flex: 1, padding: '7px 4px', borderRadius: '8px', border: `2px solid ${multiType === tp ? c.border : '#e2e8f0'}`, background: multiType === tp ? c.bg : 'white', color: multiType === tp ? c.color : '#94a3b8', fontSize: '10px', fontWeight: '800', cursor: 'pointer', letterSpacing: '0.04em' }}>
                        {tp === 'ARRIVAL' ? '🛬 ARR' : tp === 'DEPARTURE' ? '🛫 DEP' : '🔀 STD'}
                      </button>
                    )
                  })}
                </div>

                {savedLegs.length > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>
                      ✅ Legs configurati ({savedLegs.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {savedLegs.map((leg, idx) => {
                        const legTripId = getLegTripId(idx)
                        const isEditing = editingLegLocalId === leg.localId
                        const legCls    = CLS[leg.transferClass] || CLS.STANDARD
                        return (
                          <div key={leg.localId} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '8px', border: `1px solid ${isEditing ? '#2563eb' : legCls.border}`, background: isEditing ? '#eff6ff' : 'white' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: '800', color: '#0f2340', fontFamily: 'monospace' }}>{legTripId}</div>
                              <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {locShort(leg.form.pickup_id)} → {locShort(leg.form.dropoff_id)}
                                {leg.selCrew.length > 0 && <span style={{ color: '#2563eb', fontWeight: '700' }}> · {leg.selCrew.length} pax</span>}
                              </div>
                            </div>
                            <button type="button" onClick={() => handleEditLeg(leg)}
                              style={{ background: isEditing ? '#2563eb' : '#f1f5f9', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '10px', color: isEditing ? 'white' : '#374151', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>✏️</button>
                            <button type="button" onClick={() => handleDeleteLeg(leg.localId)}
                              style={{ background: '#fef2f2', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '10px', color: '#dc2626', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>🗑</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {multiType === 'ARRIVAL' && (
                  <div style={{ fontSize: '10px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>ARRIVAL</strong>: Pickup hub mantenuto tra i leg · scegli Dropoff diverso ogni volta
                  </div>
                )}
                {multiType === 'DEPARTURE' && (
                  <div style={{ fontSize: '10px', color: '#c2410c', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>DEPARTURE</strong>: Dropoff hub mantenuto tra i leg · scegli Pickup diverso ogni volta
                  </div>
                )}
                {multiType === 'STANDARD' && (
                  <div style={{ fontSize: '10px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>STANDARD</strong>: Pickup e Dropoff liberi per ogni leg (MIXED)
                  </div>
                )}
              </>
            )}

            {/* Add to existing trip */}
            {assignCtx && arrDepTrips.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {t.addToExistingTrip}
                </div>
                <select
                  value={selExistingTrip?.id || ''}
                  onChange={e => {
                    const trip = arrDepTrips.find(x => x.id === e.target.value) || null
                    setSelExistingTrip(trip); setAddedToTrip(null); setSibDropoff(trip?.dropoff_id || '')
                    if (trip && !isCompatibleTrip(trip)) {
                      if (trip.transfer_class === 'ARRIVAL')   set('pickup_id',  trip.pickup_id)
                      else                                      set('dropoff_id', trip.dropoff_id)
                    }
                  }}
                  style={{ ...inp, fontSize: '12px', marginBottom: selExistingTrip ? '8px' : 0 }}
                >
                  <option value="">Select existing trip…</option>
                  {compatibleTrips.length > 0 && (
                    <optgroup label={t.compatible}>
                      {compatibleTrips.map(tr => (
                        <option key={tr.id} value={tr.id}>
                          {baseTripId(tr.trip_id)} · {tr.pickup_min ?? tr.call_min ? `${Math.floor((tr.pickup_min ?? tr.call_min) / 60).toString().padStart(2,'0')}:${((tr.pickup_min ?? tr.call_min) % 60).toString().padStart(2,'0')}` : '–'} · {locShort(tr.pickup_id)} → {locShort(tr.dropoff_id)}{tr.vehicle_id ? ` · 🚐${tr.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherTrips.length > 0 && (
                    <optgroup label={t.otherMultiStop}>
                      {otherTrips.map(tr => (
                        <option key={tr.id} value={tr.id}>
                          {baseTripId(tr.trip_id)} · {tr.pickup_min ?? tr.call_min ? `${Math.floor((tr.pickup_min ?? tr.call_min) / 60).toString().padStart(2,'0')}:${((tr.pickup_min ?? tr.call_min) % 60).toString().padStart(2,'0')}` : '–'} · {locShort(tr.pickup_id)} → {locShort(tr.dropoff_id)}{tr.vehicle_id ? ` · 🚐${tr.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {selExistingTrip && (
                  <>
                    <div style={{ fontSize: '11px', color: '#374151', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', padding: '7px 10px', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '800' }}>{selExistingTrip.trip_id} · {selExistingTrip.pickup_min ?? selExistingTrip.call_min ? `${Math.floor((selExistingTrip.pickup_min ?? selExistingTrip.call_min) / 60).toString().padStart(2,'0')}:${((selExistingTrip.pickup_min ?? selExistingTrip.call_min) % 60).toString().padStart(2,'0')}` : '–'}</div>
                      <div>{locShort(selExistingTrip.pickup_id)} → {locShort(selExistingTrip.dropoff_id)}</div>
                      {selExistingTrip.vehicle_id && <div>🚐 {selExistingTrip.vehicle_id}</div>}
                      {!isCompatibleGroup(selExistingTrip) && (
                        <div style={{ color: '#a16207', fontWeight: '700', marginTop: '3px' }}>{t.differentRoute}</div>
                      )}
                    </div>
                    {selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && (
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                          🎯 Destination for {assignCtx.name.split(' ')[0]}
                        </label>
                        <select value={sibDropoff} onChange={e => setSibDropoff(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', border: `1px solid ${sibDropoff ? '#fde68a' : '#fca5a5'}`, borderRadius: '8px', fontSize: '12px', background: 'white', boxSizing: 'border-box' }}>
                          <option value="">Select destination…</option>
                          <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                           <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                        </select>
                      </div>
                    )}
                    {addedToTrip ? (
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
                        ✅ {assignCtx.name.split(' ')[0]} aggiunto a {addedToTrip}
                      </div>
                    ) : (
                      <button type="button"
                        disabled={addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)}
                        onClick={handleAddToExisting}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: 'none', background: (addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)) ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '13px', fontWeight: '800', cursor: (addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)) ? 'default' : 'pointer' }}>
                        {addingToTrip ? 'Adding…' : `✓ Add ${assignCtx.name.split(' ')[0]} to ${selExistingTrip.trip_id}`}
                      </button>
                    )}
                  </>
                )}
                <div style={{ fontSize: '10px', color: '#92400e', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #fde68a', fontWeight: '700' }}>
                  {t.orCreateBelow}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Trip ID</label>
                <input value={form.trip_id} onChange={e => set('trip_id', e.target.value)} style={{ ...inp, fontWeight: '800', fontSize: '15px' }} placeholder="T001" required />
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} required />
              </div>
            </div>

            <div>
              <label style={lbl}>Pickup</label>
              <select value={form.pickup_id} onChange={e => {
                if (e.target.value === '__NEW__') {
                  setNewLocTarget('pickup')
                  setNewLocForm({ id: '', name: '', is_hub: false })
                  setNewLocPlaceQuery(''); setNewLocPredictions([])
                  setNewLocError(null); setNewLocDoneMsg(null)
                  setNewLocLat(''); setNewLocLng('')
                } else {
                  set('pickup_id', e.target.value)
                  if (newLocTarget === 'pickup') setNewLocTarget(null)
                }
              }} style={inp} required>
                <option value="">Select pickup…</option>
                <option value="__NEW__" style={{ color: '#0369a1', fontWeight: '800' }}>➕ New location…</option>
                <optgroup label="Hubs">{localLocs.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{localLocs.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            {newLocTarget === 'pickup' && <NewLocForm target="pickup" />}

            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => {
                if (e.target.value === '__NEW__') {
                  setNewLocTarget('dropoff')
                  setNewLocForm({ id: '', name: '', is_hub: false })
                  setNewLocPlaceQuery(''); setNewLocPredictions([])
                  setNewLocError(null); setNewLocDoneMsg(null)
                  setNewLocLat(''); setNewLocLng('')
                } else {
                  set('dropoff_id', e.target.value)
                  if (newLocTarget === 'dropoff') setNewLocTarget(null)
                }
              }} style={inp} required>
                <option value="">Select dropoff…</option>
                <option value="__NEW__" style={{ color: '#0369a1', fontWeight: '800' }}>➕ New location…</option>
                <optgroup label="Hubs">{localLocs.filter(l => l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{localLocs.filter(l => !l.is_hub).map(l => <option key={l.uuid} value={l.uuid}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            {newLocTarget === 'dropoff' && <NewLocForm target="dropoff" />}

            <div>
              <label style={lbl}>Vehicle</label>
              {multiMode && savedLegs.length > 0 ? (
                <div style={{ padding: '8px 12px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803d', flex: 1 }}>
                    🚐 {selVehicle ? `${selVehicle.id} — ${selVehicle.driver_name} (${selVehicle.sign_code}) ×${selVehicle.capacity}` : 'No vehicle'}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', background: '#bbf7d0', padding: '2px 7px', borderRadius: '999px', flexShrink: 0 }}>🔒 shared</span>
                </div>
              ) : (
                <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                  <option value="">No vehicle</option>
                  {vehicles.map(v => {
                    const avail   = isVehicleAvailableForDate(v, form.date)
                    const hasPref = v.preferred_dept || v.preferred_crew_ids?.length > 0
                    return (
                      <option key={v.uuid} value={v.uuid}>
                        {avail ? '' : '⚠ '}{v.id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{hasPref ? ` · ⭐ ${[v.preferred_dept, v.preferred_crew_ids?.length > 0 ? `${v.preferred_crew_ids.length}p` : null].filter(Boolean).join(' ')}` : ''}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
                      </option>
                    )
                  })}
                </select>
              )}
              {form.vehicle_id && vCheck && (
                <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700', color: vCheck.available ? '#15803d' : '#dc2626' }}>
                  {vCheck.available ? '✅ Vehicle available' : `⚠ Busy on ${vCheck.conflictTripId}`}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>{transferClass === 'ARRIVAL' ? 'Arrival Time' : transferClass === 'DEPARTURE' ? 'Departure Time' : 'Call Time'}</label>
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

            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {[
                  { l: 'CALL',   v: `${Math.floor(computed.callMin/60).toString().padStart(2,'0')}:${(computed.callMin%60).toString().padStart(2,'0')}` },
                  { l: 'PICKUP', v: `${Math.floor(computed.pickupMin/60).toString().padStart(2,'0')}:${(computed.pickupMin%60).toString().padStart(2,'0')}` },
                  { l: 'START',  v: new Date(computed.startDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) },
                  { l: 'END',    v: new Date(computed.endDt).toLocaleTimeString('it-IT',  { hour: '2-digit', minute: '2-digit' }) },
                ].map(({ l, v }) => (
                  <div key={l} style={{ textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.07em' }}>{l}</div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

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
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>PASSENGERS {selCrew.length > 0 && `· ${selCrew.length} selected`}</span>
                {crewList.length > 0 && (
                  <button type="button" onClick={() => setSelCrew(crewList)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '10px', fontWeight: '700' }}>
                    Add all ({crewList.length})
                  </button>
                )}
              </div>
              {selCrew.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                  {selCrew.map(c => (
                    <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>
                      {c.full_name.split(' ')[0]} {c.full_name.split(' ').slice(-1)[0]}
                      <button type="button" onClick={() => setSelCrew(p => p.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '11px', padding: 0, lineHeight: 1, marginLeft: '1px' }}>×</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setSelCrew([])} style={{ background: 'none', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: '700' }}>Clear</button>
                </div>
              )}
              {form.pickup_id && form.dropoff_id ? (
                <>
                  {suggestedCrew.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '6px' }}>📌 Suggeriti per {selVehicle.id}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {suggestedCrew.map(c => {
                          const alreadySel = selCrew.some(x => x.id === c.id)
                          return (
                            <div key={c.id} onClick={() => !alreadySel && setSelCrew(p => [...p, c])}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: alreadySel ? '#eff6ff' : 'white', border: `1px solid ${alreadySel ? '#bfdbfe' : '#fde68a'}`, borderRadius: '6px', cursor: alreadySel ? 'default' : 'pointer' }}
                              onMouseEnter={e => { if (!alreadySel) e.currentTarget.style.background = '#fef9c3' }}
                              onMouseLeave={e => { if (!alreadySel) e.currentTarget.style.background = alreadySel ? '#eff6ff' : 'white' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: alreadySel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                              </div>
                              {alreadySel ? <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: '800', flexShrink: 0 }}>✓</span> : <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '700', flexShrink: 0 }}>+</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <input type="text" placeholder="Search…" value={crewSearch} onChange={e => setCrewSearch(e.target.value)} style={{ ...inp, marginBottom: '6px', padding: '6px 10px', fontSize: '12px' }} />
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    {crewList.length === 0 ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        {t.noCrewStatus} ({transferClass === 'ARRIVAL' ? 'IN' : transferClass === 'DEPARTURE' ? 'OUT' : 'PRESENT'})
                      </div>
                    ) : crewList.filter(c => !crewSearch || c.full_name.toLowerCase().includes(crewSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(crewSearch.toLowerCase())).map(c => {
                      const sel = selCrew.some(x => x.id === c.id)
                      return (
                        <div key={c.id} onClick={() => setSelCrew(p => sel ? p.filter(x => x.id !== c.id) : [...p, c])}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`, background: sel ? '#2563eb' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <span style={{ color: 'white', fontSize: '9px', fontWeight: '900' }}>✓</span>}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: sel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: '10px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                  {t.selectPickupFirst}
                </div>
              )}
            </div>
          </div>

          {/* Trip Notes */}
          <div style={{ padding: '0 18px 12px' }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '9px 12px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>📋 Trip Notes</span>
              </div>
              <div style={{ padding: '10px 12px', background: 'white', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '3px' }}>Save the trip first to unlock notes</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>Once saved, you can add notes visible to the whole team.</div>
                </div>
              </div>
            </div>
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, position: 'sticky', bottom: 0, background: 'white' }}>
            {multiMode ? (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
                  <button type="button" onClick={handleAddLeg}
                    style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: (form.pickup_id && form.dropoff_id) ? (editingLegLocalId ? '#2563eb' : '#6366f1') : '#94a3b8', color: 'white', fontSize: '12px', cursor: (form.pickup_id && form.dropoff_id) ? 'pointer' : 'default', fontWeight: '800' }}>
                    {editingLegLocalId ? '✏️ Aggiorna Leg' : `+ Add Leg (${getLegTripId(savedLegs.length)})`}
                  </button>
                </div>
                {(() => {
                  const totalLegs = savedLegs.length + (form.pickup_id && form.dropoff_id ? 1 : 0)
                  const canSave   = totalLegs >= 2 && !multiSaving
                  return (
                    <button type="button" onClick={handleMultiSubmit} disabled={!canSave}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: canSave ? '#15803d' : '#94a3b8', color: 'white', fontSize: '13px', cursor: canSave ? 'pointer' : 'default', fontWeight: '800' }}>
                      {multiSaving ? '⏳ Creazione in corso…' : `💾 Salva Multi-trip (${totalLegs} leg${totalLegs !== 1 ? 's' : ''})`}
                    </button>
                  )
                })()}
              </>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
                  {saving ? t.saving : t.saveTrip}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
      {crewInfoCrew && (
        <CrewInfoModal crew={crewInfoCrew} productionId={PRODUCTION_ID} locations={locations} onClose={() => setCrewInfoCrew(null)} overlayRight={SIDEBAR_W} />
      )}
    </>
  )
}

export default TripSidebar
