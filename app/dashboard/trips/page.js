'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { PageHeader } from '../../../components/ui/PageHeader'
import { TableHeader } from '../../../components/ui/TableHeader'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID
const SIDEBAR_W = 440

// ─── Utility ────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}
function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}
function isHub(id) { return /^(APT_|STN_|PRT_)/.test(id || '') }
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }
function getClass(p, d) {
  if (isHub(p) && !isHub(d)) return 'ARRIVAL'
  if (!isHub(p) && isHub(d))  return 'DEPARTURE'
  return 'STANDARD'
}
function calcTimes({ date, arrTimeMin, durationMin, transferClass, callMin }) {
  if (!date || !durationMin) return null
  let call = null
  if (transferClass === 'ARRIVAL'   && arrTimeMin !== null) call = arrTimeMin
  else if (transferClass === 'DEPARTURE' && arrTimeMin !== null) call = ((arrTimeMin - 120) % 1440 + 1440) % 1440
  else call = callMin
  if (call === null) return null
  const pickup = transferClass === 'ARRIVAL' ? call : ((call - durationMin) % 1440 + 1440) % 1440
  const [y, mo, dd] = date.split('-').map(Number)
  const startMs = new Date(y, mo - 1, dd, Math.floor(pickup / 60), pickup % 60, 0, 0).getTime()
  return { callMin: call, pickupMin: pickup, startDt: new Date(startMs).toISOString(), endDt: new Date(startMs + durationMin * 60000).toISOString() }
}

// ─── Colori ──────────────────────────────────────────────────
const CLS = {
  ARRIVAL:   { bg: '#dcfce7', color: '#15803d', border: '#86efac', dot: '#16a34a' },
  DEPARTURE: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74', dot: '#ea580c' },
  STANDARD:  { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', dot: '#2563eb' },
}
const STS = {
  PLANNED:   { bg: '#f1f5f9', color: '#475569' },
  BUSY:      { bg: '#fefce8', color: '#a16207' },
  DONE:      { bg: '#f0fdf4', color: '#15803d' },
  CANCELLED: { bg: '#fef2f2', color: '#dc2626' },
}

// ─── Colonne tabella trips ────────────────────────────────────
const TRIP_COLS = [
  { key: 'time',    label: 'TIME',       width: '80px'  },
  { key: 'trip',    label: 'TRIP',       width: '130px' },
  { key: 'vehicle', label: 'VEHICLE',    width: '180px' },
  { key: 'route',   label: 'ROUTE',      width: '210px' },
  { key: 'pax',     label: 'PASSENGERS', width: '200px' },
]

// ─── Vehicle date-range check (available_from / available_to) ─
// A vehicle can be assigned from the day BEFORE its available_from date.
function isVehicleAvailableForDate(v, date) {
  if (!date || !v) return true
  if (v.available_from) {
    const dayBefore = isoAdd(v.available_from, -1)
    if (date < dayBefore) return false
  }
  if (v.available_to && date > v.available_to) return false
  return true
}

// ─── Vehicle availability check ───────────────────────────────
async function checkVehicleAvail(vehicleId, date, startDt, endDt, excludeRowIds) {
  if (!vehicleId || !startDt || !endDt || !PRODUCTION_ID) return null
  const excl = Array.isArray(excludeRowIds) ? excludeRowIds.filter(Boolean) : (excludeRowIds ? [excludeRowIds] : [])
  let q = supabase.from('trips')
    .select('id,trip_id,start_dt,end_dt')
    .eq('production_id', PRODUCTION_ID)
    .eq('vehicle_id', vehicleId)
    .eq('date', date)
    .not('start_dt', 'is', null)
  if (excl.length) q = q.not('id', 'in', `(${excl.join(',')})`)
  const { data } = await q
  if (!data) return null
  const s = new Date(startDt), e = new Date(endDt)
  const conflict = data.find(t => t.start_dt && t.end_dt && new Date(t.start_dt) < e && new Date(t.end_dt) > s)
  return conflict ? { available: false, conflictTripId: conflict.trip_id } : { available: true }
}

// ─── Trip row (info completa) ─────────────────────────────────
function TripRow({ group, locations, selected, onClick, isSuggested }) {
  const i18n = useT()
  const t   = group[0]
  const cls = CLS[t.transfer_class] || CLS.STANDARD
  const sts = STS[t.status] || STS.PLANNED

  // Multi-stop detection
  const pickupIds   = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
  const dropoffIds  = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff

  const pickupLoc  = locations[t.pickup_id]  || t.pickup_id  || '–'
  const dropoffLoc = isMultiDropoff
    ? dropoffIds.map(id => (locations[id] || id || '').split(' ').slice(0, 2).join(' ')).join(' / ')
    : (locations[t.dropoff_id] || t.dropoff_id || '–')

  const callTime   = t.call_min   !== null ? minToHHMM(t.call_min)   : null
  const pickupTime = t.pickup_min !== null ? minToHHMM(t.pickup_min) : callTime
  const arrTime    = t.arr_time   ? t.arr_time.slice(0, 5)            : null
  // For multi-stop: show earliest pickup time
  const earliestPickupMin = isMixed
    ? Math.min(...group.map(r => r.pickup_min ?? r.call_min ?? 9999).filter(n => n < 9999))
    : null

  const mainTime   = isMixed
    ? (earliestPickupMin < 9999 ? minToHHMM(earliestPickupMin) : callTime || '–')
    : (callTime || pickupTime || '–')

  // Passeggeri dal campo denormalizzato — per multi-stop: unione da tutti i leg
  const paxNames = isMixed
    ? group.flatMap(r => r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
    : (t.passenger_list ? t.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
  const paxColor = (!t.pax_count || !t.capacity) ? '#64748b'
    : t.pax_count >= t.capacity ? '#dc2626'
    : t.pax_count >= t.capacity * 0.75 ? '#d97706'
    : '#16a34a'

  return (
    <div onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: TRIP_COLS.map(c => c.width).join(' '),
        justifyContent: 'start',
        alignItems: 'start',
        padding: '10px 14px 10px 14px',
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        background: selected ? '#eff6ff' : isSuggested ? '#fffbeb' : isMixed ? (isMultiPickup && isMultiDropoff ? '#fdf4ff' : isMultiPickup ? '#fffbeb' : '#fdf4ff') : 'white',
        borderLeft: `4px solid ${selected ? '#2563eb' : isSuggested ? '#f59e0b' : isMixed ? (isMultiPickup ? '#d97706' : '#7c3aed') : cls.dot}`,
        transition: 'background 0.1s',
        gap: '10px',
        fontSize: '12px',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = isSuggested ? '#fffbeb' : 'white' }}
    >
      {/* ── Orari ── */}
      <div>
        <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, letterSpacing: '-0.5px' }}>
          {mainTime}
        </div>
        {pickupTime && callTime && pickupTime !== callTime && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: '#94a3b8' }}>pickup</span> {pickupTime}
          </div>
        )}
        {arrTime && (
          <div style={{ fontSize: '10px', fontWeight: '700', color: cls.color, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {t.transfer_class === 'ARRIVAL' ? '✈ arr' : '✈ dep'} {arrTime}
          </div>
        )}
      </div>

      {/* ── Trip ID + Classe + Status ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e3a5f', fontFamily: 'monospace', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {baseTripId(t.trip_id) || '–'}
        </div>
        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`, letterSpacing: '0.04em', alignSelf: 'flex-start' }}>
          {t.transfer_class?.slice(0, 3) || 'STD'}
        </span>
        {isMultiPickup  && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', alignSelf: 'flex-start' }}>🔀 MULTI-PKP</span>}
        {isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe', alignSelf: 'flex-start' }}>🔀 MULTI-DRP</span>}
        {isSuggested    && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef9c3', color: '#92400e', border: '1px solid #fbbf24', alignSelf: 'flex-start' }}>⭐ MATCH</span>}
        <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', background: sts.bg, color: sts.color, alignSelf: 'flex-start' }}>
          {t.status || 'PLANNED'}
        </span>
      </div>

      {/* ── Veicolo ── */}
      <div style={{ minWidth: 0 }}>
        {t.vehicle_id ? (
          <>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🚐 {t.vehicle_id}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
              {t.driver_name && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {t.driver_name}</div>}
              {(t.sign_code || t.capacity) && (
                <div>{[t.sign_code, t.capacity ? `×${t.capacity} seats` : null].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noVehicle}</span>
        )}
      </div>

      {/* ── Rotta ── */}
      <div style={{ minWidth: 0 }}>
        {isMixed ? (
          <>
            {group.map((r, ri) => (
              <div key={r.id || ri} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginBottom: ri < group.length - 1 ? '4px' : 0, minWidth: 0 }}>
                <span style={{ color: '#94a3b8', fontWeight: '500', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75px' }}>
                  {(locations[r.pickup_id] || r.pickup_id || '–').split(' ').slice(0, 2).join(' ')}
                </span>
                <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
                <span style={{ fontWeight: '700', color: '#0f172a', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(locations[r.dropoff_id] || r.dropoff_id || '–').split(' ').slice(0, 2).join(' ')}
                </span>
              {r.pickup_min != null
                ? <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>· 🕐{minToHHMM(r.pickup_min)}</span>
                : <span style={{ color: '#ea580c', flexShrink: 0, fontSize: '9px', fontWeight: '800', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '3px', padding: '1px 4px' }}>⚠ no route</span>
              }
                {r.pax_count  > 0   && <span style={{ color: '#64748b', flexShrink: 0 }}>· {r.pax_count}pax</span>}
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 }}>
              <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>
                {pickupLoc.split(' ').slice(0, 2).join(' ')}
              </span>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoffLoc}</span>
            </div>
            {t.flight_no && (
              <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: '700', marginTop: '2px' }}>
                ✈ {t.flight_no}{t.terminal ? ` · ${t.terminal}` : ''}
              </div>
            )}
            {t.notes && (
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📝 {t.notes}
              </div>
            )}
            {t.duration_min && (
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>⏱ {t.duration_min} min</div>
            )}
          </>
        )}
      </div>

      {/* ── Passeggeri ── */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: paxColor, marginBottom: '3px' }}>
          👥 {isMixed ? group.reduce((s, r) => s + (r.pax_count || 0), 0) : (t.pax_count || 0)}{t.capacity ? `/${t.capacity}` : ''} pax
          {t.pax_conflict_flag && <span style={{ color: '#dc2626', marginLeft: '4px' }}>⚠ conflict</span>}
        </div>
        {paxNames.length > 0 ? (
          <>
            {paxNames.slice(0, 4).map((name, i) => (
              <div key={i} style={{ fontSize: '10px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>
                {name}
              </div>
            ))}
            {paxNames.length > 4 && (
              <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px' }}>+{paxNames.length - 4} more</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noPaxAssigned}</div>
        )}
      </div>

    </div>
  )
}

// ─── TripSidebar (CREATE new trip) ────────────────────────────
function TripSidebar({ open, onClose, defaultDate, locations, vehicles, serviceTypes, onSaved, assignCtx, trips }) {
  const t = useT()
  const EMPTY = { trip_id: '', date: defaultDate, pickup_id: '', dropoff_id: '', vehicle_id: '', service_type_id: '', arr_time: '', call_time: '', flight_no: '', terminal: '', notes: '', duration_min: '' }
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

  const transferClass = getClass(form.pickup_id, form.dropoff_id)
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Reset on open
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
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setForm(f => ({ ...f, trip_id: 'T' + String(num + 1).padStart(3, '0') }))
        })
    }
  }, [open, defaultDate])

  // Auto route duration
  useEffect(() => {
    if (!form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  // Vehicle availability check
  useEffect(() => {
    if (!form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, null).then(setVCheck)
  }, [form.vehicle_id, form.date, computed?.startDt, computed?.endDt])

  // Available crew (Captain rules)
  useEffect(() => {
    setSelCrew([]); setCrewList([])
    if (!PRODUCTION_ID || !form.pickup_id || !form.dropoff_id) return
    let q = supabase.from('crew').select('id,full_name,department')
      .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED')
    if (transferClass === 'ARRIVAL')        q = q.eq('hotel_id', form.dropoff_id).eq('travel_status', 'IN')
    else if (transferClass === 'DEPARTURE') q = q.eq('hotel_id', form.pickup_id).eq('travel_status', 'OUT')
    else                                    q = q.eq('hotel_id', form.pickup_id).eq('travel_status', 'PRESENT')
    q.order('department').order('full_name').then(({ data }) => {
      if (data) {
        setCrewList(data)
        if (assignCtx?.id) {
          const match = data.find(c => c.id === assignCtx.id)
          if (match) setSelCrew(prev => prev.some(x => x.id === match.id) ? prev : [...prev, match])
        }
      }
    })
  }, [form.pickup_id, form.dropoff_id, transferClass])

  const selVehicle = vehicles.find(v => v.id === form.vehicle_id)

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
      pickup_min: computed?.pickupMin ?? null,
      start_dt:   computed?.startDt   ?? null,
      end_dt:     computed?.endDt     ?? null,
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: 'PLANNED', pax_count: 0,
    }
    const { data: ins, error: err } = await supabase.from('trips').insert(row).select('id').single()
    if (err) { setSaving(false); setError(err.message); return }
    if (selCrew.length > 0 && ins?.id) {
      await supabase.from('trip_passengers').insert(
        selCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
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

  // ── Existing trip assignment helpers (assignCtx only) ─────
  const locsById = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const locShort = id => (locsById[id] || id || '–').split(' ').slice(0, 3).join(' ')
  const correctClass = assignCtx?.ts === 'IN' ? 'ARRIVAL' : assignCtx?.ts === 'OUT' ? 'DEPARTURE' : 'STANDARD'
  const arrDepTrips = (trips || [])
    .filter(t => t.transfer_class === correctClass)
    .sort((a, b) => (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999))
  function isCompatibleTrip(t) {
    if (!assignCtx?.hotel) return false
    if (assignCtx.ts === 'IN')  return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
    if (assignCtx.ts === 'OUT') return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
    return false
  }
  const compatibleTrips = arrDepTrips.filter(isCompatibleTrip)
  const otherTrips      = arrDepTrips.filter(t => !isCompatibleTrip(t))

  async function handleAddToExisting() {
    if (!selExistingTrip || !assignCtx?.id || !PRODUCTION_ID) return
    setAddingToTrip(true)

    if (isCompatibleTrip(selExistingTrip)) {
      // ── Stesso hotel → INSERT trip_passengers + aggiorna passenger_list ──
      const { error } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: selExistingTrip.id, crew_id: assignCtx.id,
      })
      if (!error) {
        const prevList = selExistingTrip.passenger_list ? selExistingTrip.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
        const newList  = [...prevList, assignCtx.name]
        await supabase.from('trips').update({
          pax_count:      newList.length,
          passenger_list: newList.join(', '),
        }).eq('id', selExistingTrip.id)
      }
      setAddingToTrip(false)
      if (!error) { setAddedToTrip(selExistingTrip.trip_id); onSaved() }
    } else {
      // ── Hotel diverso → crea sibling trip (MULTI-DRP o MULTI-PKP) ──
      const base = baseTripId(selExistingTrip.trip_id)

      // Trova la prossima lettera disponibile (B, C, D…)
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

      // Calcola timing del sibling usando calcTimes (come per un trip normale)
      // Per DEPARTURE multi-PKP: cerca la rotta hotelSibling→hub per ottenere duration_min
      // Per ARRIVAL multi-DRP: cerca la rotta hub→hotelSibling
      // NOTA: sibRoute e sibDurationMin devono restare nello stesso scope di siblingRow
      //       per poter usare la duration corretta del sibling (non quella del trip principale)
      const sibPickupId  = selExistingTrip.transfer_class === 'ARRIVAL'  ? selExistingTrip.pickup_id : assignCtx.hotel
      const sibDropoffId = selExistingTrip.transfer_class === 'ARRIVAL'  ? assignCtx.hotel           : selExistingTrip.dropoff_id
      const { data: sibRoute } = await supabase.from('routes')
        .select('duration_min')
        .eq('production_id', PRODUCTION_ID)
        .eq('from_id', sibPickupId)
        .eq('to_id', sibDropoffId)
        .maybeSingle()
      // duration_min specifica del sibling (Hotel B → Hub), diversa da quella del leg principale
      const sibDurationMin = sibRoute?.duration_min || null
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

      // ── ARRIVAL fix: pickup_min = call_min (driver già all'hub al momento dell'arrivo volo)
      // Per ARRIVAL, pickup NON dipende dalla duration Hub→Hotel — serve solo per end_dt.
      // Se sibCalc è null (rotta non trovata), pickup_min può comunque essere = call_min.
      const sibPickupMin = sibCalc?.pickupMin
        ?? (selExistingTrip.transfer_class === 'ARRIVAL'
          ? (selExistingTrip.call_min ?? null)
          : null)

      // start_dt calcolabile da sibPickupMin anche senza duration (per ARRIVAL)
      const sibStartDt = sibCalc?.startDt ?? (() => {
        if (sibPickupMin === null) return null
        const [sy, smo, sdd] = selExistingTrip.date.split('-').map(Number)
        return new Date(sy, smo - 1, sdd, Math.floor(sibPickupMin / 60), sibPickupMin % 60, 0, 0).toISOString()
      })()

      // Sibling row: pickup/dropoff dipende da ARRIVAL vs DEPARTURE
      const siblingRow = {
        production_id: PRODUCTION_ID,
        trip_id:        newTripId,
        date:           selExistingTrip.date,
        // transfer_class is a GENERATED column — computed automatically from pickup_id/dropoff_id
        // ARRIVAL  → MULTI-DRP: stesso pickup (hub), dropoff = hotel del crew
        // DEPARTURE → MULTI-PKP: pickup = hotel del crew, stesso dropoff (hub)
        pickup_id:  selExistingTrip.transfer_class === 'ARRIVAL'
          ? selExistingTrip.pickup_id
          : assignCtx.hotel,
        dropoff_id: selExistingTrip.transfer_class === 'ARRIVAL'
          ? assignCtx.hotel
          : selExistingTrip.dropoff_id,
        vehicle_id:      selExistingTrip.vehicle_id      || null,
        driver_name:     selExistingTrip.driver_name     || null,
        sign_code:       selExistingTrip.sign_code       || null,
        capacity:        selExistingTrip.capacity        || null,
        service_type_id: selExistingTrip.service_type_id || null,
        call_min:        sibCalc?.callMin   ?? selExistingTrip.call_min   ?? null,
        pickup_min:      sibPickupMin,       // ← fix: ARRIVAL usa call_min anche senza duration
        arr_time:        selExistingTrip.arr_time        || null,
        flight_no:       selExistingTrip.flight_no       || null,
        terminal:        selExistingTrip.terminal        || null,
        notes:           selExistingTrip.notes           || null,
        duration_min:    sibDurationMin                  || null,  // ✓ usa la duration del sibling, non del leg principale
        start_dt:        sibStartDt,         // ← fix: calcolato da sibPickupMin anche senza duration
        end_dt:          sibCalc?.endDt     ?? null,
        status:          selExistingTrip.status          || 'PLANNED',
        pax_count: 0,
      }

      const { data: newRow, error: tripErr } = await supabase.from('trips').insert(siblingRow).select('id').single()
      if (tripErr || !newRow?.id) { setAddingToTrip(false); setError(tripErr?.message || t.errorSiblingTrip); return }

      const { error: paxErr } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: newRow.id, crew_id: assignCtx.id,
      })
      if (!paxErr) {
        // Update denormalized fields on the sibling trip row
        await supabase.from('trips').update({
          pax_count: 1,
          passenger_list: assignCtx.name,
        }).eq('id', newRow.id)
      }
      setAddingToTrip(false)
      if (paxErr) { setError(paxErr.message) }
      else { setAddedToTrip(newTripId); onSaved() }
    }
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>{t.newTrip}</div>
            {assignCtx && <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '700', marginTop: '2px' }}>👤 {assignCtx.name}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {(form.pickup_id && form.dropoff_id) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass}</span>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* ── Add to existing trip (solo se assignCtx attivo) ── */}
            {assignCtx && arrDepTrips.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {t.addToExistingTrip}
                </div>
                <select
                  value={selExistingTrip?.id || ''}
                  onChange={e => {
                    const t = arrDepTrips.find(x => x.id === e.target.value) || null
                    setSelExistingTrip(t); setAddedToTrip(null)
                    // Pre-popola l'hub nel form per il trip sibling (campo che rimane vuoto)
                    if (t && !isCompatibleTrip(t)) {
                      if (t.transfer_class === 'ARRIVAL')   set('pickup_id',  t.pickup_id)
                      else                                   set('dropoff_id', t.dropoff_id)
                    }
                  }}
                  style={{ ...inp, fontSize: '12px', marginBottom: selExistingTrip ? '8px' : 0 }}
                >
                  <option value="">Select existing trip…</option>
                  {compatibleTrips.length > 0 && (
                    <optgroup label={t.compatible}>
                      {compatibleTrips.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.trip_id} · {minToHHMM(t.pickup_min ?? t.call_min)} · {locShort(t.pickup_id)} → {locShort(t.dropoff_id)}{t.vehicle_id ? ` · 🚐${t.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherTrips.length > 0 && (
                    <optgroup label={t.otherMultiStop}>
                      {otherTrips.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.trip_id} · {minToHHMM(t.pickup_min ?? t.call_min)} · {locShort(t.pickup_id)} → {locShort(t.dropoff_id)}{t.vehicle_id ? ` · 🚐${t.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {selExistingTrip && (
                  <>
                    <div style={{ fontSize: '11px', color: '#374151', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', padding: '7px 10px', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '800' }}>{selExistingTrip.trip_id} · {minToHHMM(selExistingTrip.pickup_min ?? selExistingTrip.call_min)}</div>
                      <div>{locShort(selExistingTrip.pickup_id)} → {locShort(selExistingTrip.dropoff_id)}</div>
                      {selExistingTrip.vehicle_id && <div>🚐 {selExistingTrip.vehicle_id}</div>}
                      {!isCompatibleTrip(selExistingTrip) && (
                        <div style={{ color: '#a16207', fontWeight: '700', marginTop: '3px' }}>{t.differentRoute}</div>
                      )}
                    </div>
                    {addedToTrip ? (
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
                        ✅ {assignCtx.name.split(' ')[0]} aggiunto a {addedToTrip}
                      </div>
                    ) : (
                      <button type="button" disabled={addingToTrip} onClick={handleAddToExisting}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: 'none', background: addingToTrip ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '13px', fontWeight: '800', cursor: addingToTrip ? 'default' : 'pointer' }}>
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
              <select value={form.pickup_id} onChange={e => set('pickup_id', e.target.value)} style={inp} required>
                <option value="">Select pickup…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => set('dropoff_id', e.target.value)} style={inp} required>
                <option value="">Select dropoff…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>

            {/* Vehicle + check */}
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail = isVehicleAvailableForDate(v, form.date)
                  return (
                    <option key={v.id} value={v.id}>
                      {avail ? '' : '⚠ '}{v.id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
                    </option>
                  )
                })}
              </select>
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

            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {[
                  { l: 'CALL',   v: minToHHMM(computed.callMin) },
                  { l: 'PICKUP', v: minToHHMM(computed.pickupMin) },
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
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inp} />
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
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', padding: '4px 6px', background: cls.bg, borderRadius: '5px', border: `1px solid ${cls.border}` }}>
                    {transferClass === 'ARRIVAL'   && `ARRIVAL: hotel=${form.dropoff_id} · status=IN`}
                    {transferClass === 'DEPARTURE' && `DEPARTURE: hotel=${form.pickup_id} · status=OUT`}
                    {transferClass === 'STANDARD'  && `STANDARD: hotel=${form.pickup_id} · status=PRESENT`}
                  </div>
                </>
              ) : (
                <div style={{ padding: '10px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                  {t.selectPickupFirst}
                </div>
              )}
            </div>
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : t.saveTrip}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── EditTripSidebar (EDIT + PAX management) ──────────────────
function EditTripSidebar({ open, initial, group, locations, vehicles, serviceTypes, onClose, onSaved, onPaxChanged }) {
  const t = useT()
  const EDIT_EMPTY = {
    date: '', pickup_id: '', dropoff_id: '', vehicle_id: '',
    service_type_id: '', arr_time: '', call_time: '',
    duration_min: '', flight_no: '', terminal: '', notes: '', status: 'PLANNED',
  }
  const [form,       setForm]       = useState(EDIT_EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error,      setError]      = useState(null)
  const [durLoading, setDurLoading] = useState(false)

  // Pax state
  const [assignedPax,   setAssignedPax]   = useState([])
  const [availableCrew, setAvailableCrew] = useState([])
  const [busyMap,       setBusyMap]       = useState({})   // crewId → conflicting trip_id
  const [paxLoading,    setPaxLoading]    = useState(false)
  const [paxSearch,     setPaxSearch]     = useState('')

  // Vehicle check
  const [vCheck, setVCheck] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Initialize form when opening a new trip row
  useEffect(() => {
    if (!open || !initial) {
      setAssignedPax([]); setAvailableCrew([]); setBusyMap({})
      return
    }
    setError(null); setConfirmDel(false); setPaxSearch(''); setVCheck(null)

    const arrStr  = initial.arr_time ? initial.arr_time.slice(0, 5) : ''
    const callStr = (initial.transfer_class === 'STANDARD' && initial.call_min !== null)
      ? minToHHMM(initial.call_min) : ''

    setForm({
      date:            initial.date || isoToday(),
      pickup_id:       initial.pickup_id  || '',
      dropoff_id:      initial.dropoff_id || '',
      vehicle_id:      initial.vehicle_id || '',
      service_type_id: initial.service_type_id || '',
      arr_time:        arrStr,
      call_time:       callStr,
      duration_min:    initial.duration_min ? String(initial.duration_min) : '',
      flight_no:       initial.flight_no || '',
      terminal:        initial.terminal  || '',
      notes:           initial.notes     || '',
      status:          initial.status    || 'PLANNED',
    })

    loadPaxData(initial)
  }, [open, initial?.id])

  // Auto route duration when pickup/dropoff change FROM initial values
  useEffect(() => {
    if (!open || !form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    if (form.pickup_id === initial?.pickup_id && form.dropoff_id === initial?.dropoff_id) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  const transferClass = getClass(form.pickup_id, form.dropoff_id)
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })

  // Vehicle availability check — esclude tutti i leg del gruppo per evitare falsi positivi MULTI
  useEffect(() => {
    if (!open || !form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    const excludeIds = group ? group.map(g => g.id).filter(Boolean) : (initial?.id ? [initial.id] : [])
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, excludeIds).then(setVCheck)
  }, [open, form.vehicle_id, form.date, computed?.startDt, computed?.endDt, initial?.id])

  // ── Load pax data ─────────────────────────────────────────
  async function loadPaxData(trip) {
    if (!PRODUCTION_ID || !trip?.id) return
    setPaxLoading(true)
    const tc = getClass(trip.pickup_id, trip.dropoff_id)
    // Per multi-stop: carica pax da tutti i leg del gruppo
    const groupIds = (group && group.length > 1) ? group.map(g => g.id) : [trip.id]

    // Run all three queries in parallel
    const [paxRes, crewRes, dayTripsRes] = await Promise.all([
      supabase.from('trip_passengers')
        .select('crew_id, trip_row_id, crew!inner(id,full_name,department)')
        .in('trip_row_id', groupIds),

      (() => {
        let q = supabase.from('crew').select('id,full_name,department')
          .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED')
        if (tc === 'ARRIVAL')        q = q.eq('hotel_id', trip.dropoff_id).eq('travel_status', 'IN')
        else if (tc === 'DEPARTURE') q = q.eq('hotel_id', trip.pickup_id).eq('travel_status', 'OUT')
        else                         q = q.eq('hotel_id', trip.pickup_id).eq('travel_status', 'PRESENT')
        return q.order('department').order('full_name')
      })(),

      supabase.from('trips')
        .select('id,trip_id,start_dt,end_dt')
        .eq('production_id', PRODUCTION_ID).eq('date', trip.date)
        .neq('id', trip.id).not('start_dt', 'is', null),
    ])

    const assigned    = (paxRes.data || []).map(p => ({ ...p.crew, trip_row_id: p.trip_row_id }))
    const assignedIds = new Set(assigned.map(c => c.id))
    setAssignedPax(assigned)

    // Build busy map: crewId → conflicting trip_id
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
    setAvailableCrew((crewRes.data || []).filter(c => !assignedIds.has(c.id)))
    setPaxLoading(false)
  }

  // ── Pax add/remove ────────────────────────────────────────
  async function addPax(crew) {
    if (!initial?.id || !PRODUCTION_ID) return
    const { error } = await supabase.from('trip_passengers').insert({
      production_id: PRODUCTION_ID, trip_row_id: initial.id, crew_id: crew.id,
    })
    if (!error) {
      const newPax = [...assignedPax, crew]
      setAssignedPax(newPax)
      setAvailableCrew(p => p.filter(c => c.id !== crew.id))
      await supabase.from('trips').update({
        pax_count: newPax.length,
        passenger_list: newPax.map(c => c.full_name).join(', '),
      }).eq('id', initial.id)
      onPaxChanged?.()
    }
  }

  async function removePax(crew) {
    if (!initial?.id) return
    // Use the crew's own trip_row_id (set in loadPaxData) so multi-stop siblings are handled correctly
    const targetTripId = crew.trip_row_id ?? initial.id
    console.log('[removePax] crew:', crew.full_name, '| crew.trip_row_id:', crew.trip_row_id, '| initial.id:', initial.id, '→ targetTripId:', targetTripId)
    const { error } = await supabase.from('trip_passengers')
      .delete().eq('trip_row_id', targetTripId).eq('crew_id', crew.id)
    if (error) { console.error('[removePax] ERROR deleting trip_passengers:', error); setError(error.message); return }

    const newPax = assignedPax.filter(c => c.id !== crew.id)
    setAssignedPax(newPax)
    setAvailableCrew(p =>
      [...p, { id: crew.id, full_name: crew.full_name, department: crew.department }].sort((a, b) =>
        (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
      )
    )

    // Update passenger_list only on the trip row that was actually modified
    const tripPaxForTarget = newPax.filter(c => c.trip_row_id === targetTripId)
    await supabase.from('trips').update({
      pax_count:      tripPaxForTarget.length,
      passenger_list: tripPaxForTarget.length > 0 ? tripPaxForTarget.map(c => c.full_name).join(', ') : null,
    }).eq('id', targetTripId)

    // Cleanup: if targetTripId is a sibling (not the main leg) and now has 0 pax → delete the sibling row
    if (targetTripId !== initial.id) {
      const siblingStillHasPax = newPax.some(c => c.trip_row_id === targetTripId)
      console.log('[removePax] sibling check | siblingStillHasPax:', siblingStillHasPax, '| targetTripId:', targetTripId)
      if (!siblingStillHasPax) {
        const { error: delPaxErr } = await supabase.from('trip_passengers').delete().eq('trip_row_id', targetTripId)
        if (delPaxErr) console.error('[removePax] ERROR deleting sibling pax:', delPaxErr)
        const { error: delTripErr } = await supabase.from('trips').delete().eq('id', targetTripId)
        if (delTripErr) {
          console.error('[removePax] ERROR deleting sibling trip:', delTripErr)
          setError(`Failed to delete sibling trip: ${delTripErr.message}`)
          onPaxChanged?.()
          return
        }
        console.log('[removePax] sibling trip deleted successfully:', targetTripId)
      }
    }

    onPaxChanged?.()
  }

  // ── Save trip ─────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const selVehicle = vehicles.find(v => v.id === form.vehicle_id)
    const row = {
      date: form.date, pickup_id: form.pickup_id, dropoff_id: form.dropoff_id,
      vehicle_id:  form.vehicle_id || null,
      driver_name: selVehicle?.driver_name ?? null,
      sign_code:   selVehicle?.sign_code   ?? null,
      capacity:    selVehicle?.capacity    ?? null,
      service_type_id: form.service_type_id || null,
      duration_min: durMin,
      arr_time:   form.arr_time ? form.arr_time + ':00' : null,
      call_min:   computed?.callMin   ?? null,
      pickup_min: computed?.pickupMin ?? null,
      start_dt:   computed?.startDt   ?? null,
      end_dt:     computed?.endDt     ?? null,
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: form.status,
    }
    const { error } = await supabase.from('trips').update(row).eq('id', initial.id)
    if (error) { setSaving(false); setError(error.message); return }

    // ── Aggiorna i leg sibling del gruppo multi-stop ──────────────────────────
    // Ogni sibling condivide vehicle/status/arr_time/notes ma ha il proprio pickup_min
    // calcolato con la sua duration_min (distanza dal suo hotel all'hub può essere diversa)
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
        const sibTC = getClass(sib.pickup_id, sib.dropoff_id)
        // Priority: use the sibling's stored duration_min first (set at creation time).
        // Only query routes as fallback if duration_min is null in the DB.
        let sibDurMin = sib.duration_min || null
        if (!sibDurMin && PRODUCTION_ID) {
          const { data: sibRoute } = await supabase.from('routes')
            .select('duration_min')
            .eq('production_id', PRODUCTION_ID)
            .eq('from_id', sib.pickup_id)
            .eq('to_id', sib.dropoff_id)
            .maybeSingle()
          sibDurMin = sibRoute?.duration_min || null
        }
        // Ricalcola timing con la duration specifica del sibling
        const sibCalc = sibDurMin ? calcTimes({
          date:          form.date,
          arrTimeMin:    arrMin,
          durationMin:   sibDurMin,
          transferClass: sibTC,
          callMin:       computed?.callMin ?? null,
        }) : null

        // ARRIVAL fix: pickup_min = call_min (driver già all'hub all'arrivo del volo)
        const sibCallMin = sibCalc?.callMin ?? computed?.callMin ?? null
        // If can't calculate, preserve the existing DB value instead of overwriting with null
        const sibPickupMin = sibCalc?.pickupMin
          ?? (sibTC === 'ARRIVAL' ? sibCallMin : sib.pickup_min)

        // start_dt: compute from sibPickupMin if possible, otherwise preserve existing
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
          pickup_min:   sibPickupMin,   // preserved if no duration available
          start_dt:     sibStartDt,     // preserved if can't compute
          end_dt:       sibCalc?.endDt ?? sib.end_dt ?? null,
        }).eq('id', sib.id)
      }
    }

    setSaving(false)
    onSaved()
  }

  // ── Delete trip ───────────────────────────────────────────
  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await supabase.from('trip_passengers').delete().eq('trip_row_id', initial.id)
    const { error } = await supabase.from('trips').delete().eq('id', initial.id)
    setDeleting(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  const freeCount  = availableCrew.filter(c => !busyMap[c.id]).length
  const busyCount  = availableCrew.filter(c =>  busyMap[c.id]).length
  const filtered   = availableCrew.filter(c => !paxSearch || c.full_name.toLowerCase().includes(paxSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(paxSearch.toLowerCase()))

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e3a5f', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.editTrip}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{initial?.trip_id}</div>
              {group && group.length > 1 && (
                <span style={{ fontSize: '10px', fontWeight: '800', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em' }}>
                  🔀 MULTI · {group.length} legs
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(form.pickup_id && form.dropoff_id) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass}</span>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

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
              <select value={form.pickup_id} onChange={e => set('pickup_id', e.target.value)} style={inp} required>
                <option value="">Select pickup…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => set('dropoff_id', e.target.value)} style={inp} required>
                <option value="">Select dropoff…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>

            {/* Vehicle + availability badge */}
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail = isVehicleAvailableForDate(v, form.date)
                  return (
                    <option key={v.id} value={v.id}>
                      {avail ? '' : '⚠ '}{v.id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
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

            {/* Times preview */}
            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {[
                  { l: 'CALL',   v: minToHHMM(computed.callMin) },
                  { l: 'PICKUP', v: minToHHMM(computed.pickupMin) },
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

            {/* Flight + Terminal + Notes */}
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
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inp} />
            </div>

            {/* ── Passengers ── */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Passengers ({assignedPax.length}{initial?.capacity ? `/${initial.capacity}` : ''})
              </div>

              {paxLoading ? (
                <div style={{ padding: '10px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>{t.loadingPax}</div>
              ) : (
                <>
                  {/* ASSIGNED */}
                  {assignedPax.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', letterSpacing: '0.05em', marginBottom: '5px' }}>
                        {t.assignedSection} ({assignedPax.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {assignedPax.map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px' }}>
                            <div>
                              <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.full_name}</span>
                              <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '11px' }}>{c.department}</span>
                            </div>
                            <button type="button" onClick={() => removePax(c)}
                              style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AVAILABLE + BUSY */}
                  {availableCrew.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '0.05em' }}>
                          {t.availableSection} ({freeCount})
                          {busyCount > 0 && <span style={{ color: '#a16207', marginLeft: '6px' }}>· {busyCount} BUSY</span>}
                        </div>
                        {freeCount > 0 && (
                          <button type="button" onClick={() => availableCrew.filter(c => !busyMap[c.id]).forEach(c => addPax(c))}
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
                          const isBusy = !!busyMap[c.id]
                          return (
                            <div key={c.id} onClick={() => !isBusy && addPax(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f8fafc', background: isBusy ? '#fffbeb' : 'white' }}
                              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#eff6ff' }}
                              onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = 'white' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  {c.department}
                                  {isBusy && <span style={{ color: '#a16207', marginLeft: '4px' }}>· ⚠ BUSY on {busyMap[c.id]}</span>}
                                </div>
                              </div>
                              {!isBusy && <span style={{ fontSize: '14px', color: '#2563eb', fontWeight: '700', flexShrink: 0 }}>+</span>}
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

            {/* Danger zone */}
            <div style={{ borderTop: '1px solid #fecaca', paddingTop: '12px', marginTop: '4px' }}>
              {!confirmDel ? (
                <button type="button" onClick={handleDelete}
                  style={{ width: '100%', padding: '7px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                  🗑 Delete Trip {initial?.trip_id}
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
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#1e3a5f', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : t.saveChanges}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
function TripsPageInner() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user,          setUser]          = useState(null)
  const [date,          setDate]          = useState(isoToday())
  const [trips,         setTrips]         = useState([])
  const [locsMap,       setLocsMap]       = useState({})
  const [locsList,      setLocsList]      = useState([])
  const [vhcList,       setVhcList]       = useState([])
  const [stList,        setStList]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [newTripOpen,   setNewTripOpen]   = useState(false)   // CREATE sidebar
  const [editTripRow,   setEditTripRow]   = useState(null)    // EDIT sidebar (trip row object)
  const [editTripGroup, setEditTripGroup] = useState(null)    // EDIT sidebar (full group for multi-stop)
  const [filterClass,   setFilterClass]   = useState('ALL')
  const [filterStatus,  setFilterStatus]  = useState('ALL')
  const [filterVehicle, setFilterVehicle] = useState('ALL')
  const [assignCtx,     setAssignCtx]     = useState(null)

  const anySidebarOpen = newTripOpen || !!editTripRow

  // ── Read assign crew context from URL params (from pax-coverage → + Assign) ──
  useEffect(() => {
    const id    = searchParams.get('assignCrewId')
    const name  = searchParams.get('assignCrewName')
    const hotel = searchParams.get('assignHotelId')
    const ts    = searchParams.get('assignTS')
    const d     = searchParams.get('assignDate')
    if (id && name) {
      setAssignCtx({ id, name, hotel: hotel || '', ts: ts || 'PRESENT' })
      if (d) setDate(d)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) {
        await supabase.from('user_roles').upsert(
          { user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' },
          { onConflict: 'user_id,production_id', ignoreDuplicates: true }
        )
        const [locsR, vhcR, stR] = await Promise.all([
          supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name'),
          supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type,available_from,available_to').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
          supabase.from('service_types').select('id,name').eq('production_id', PRODUCTION_ID).order('sort_order'),
        ])
        if (locsR.data) { const m = {}; locsR.data.forEach(l => { m[l.id] = l.name }); setLocsMap(m); setLocsList(locsR.data) }
        if (vhcR.data) setVhcList(vhcR.data)
        if (stR.data)  setStList(stR.data)
      }
      setUser(user)
    })
  }, [])

  const loadTrips = useCallback(async d => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase.from('trips').select('*')
      .eq('production_id', PRODUCTION_ID).eq('date', d)
      .order('pickup_min', { ascending: true, nullsLast: true })
    setTrips(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadTrips(date) }, [user, date, loadTrips])

  // ── Mantieni editTripGroup sincronizzato con trips dopo ogni reload ──────────
  // Quando un sibling viene eliminato (removePax), loadTrips aggiorna `trips`
  // ma editTripGroup era stale → ora si ricalcola automaticamente
  useEffect(() => {
    if (!editTripRow) return
    const baseId = baseTripId(editTripRow.trip_id)
    const vId    = editTripRow.vehicle_id || '__none__'
    const newGroup = trips.filter(t =>
      baseTripId(t.trip_id) === baseId && (t.vehicle_id || '__none__') === vId
    )
    if (newGroup.length === 0) {
      // Trip eliminato → chiudi sidebar
      setEditTripRow(null)
      setEditTripGroup(null)
    } else {
      setEditTripGroup(newGroup)
    }
  }, [trips])

  // Filtered + grouped
  const filtered = trips.filter(t =>
    (filterClass   === 'ALL' || t.transfer_class === filterClass) &&
    (filterStatus  === 'ALL' || t.status         === filterStatus) &&
    (filterVehicle === 'ALL' || t.vehicle_id     === filterVehicle)
  )
  const grouped = Object.values(
    filtered.reduce((acc, t) => {
      const key = baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__')
      if (!acc[key]) acc[key] = []
      acc[key].push(t)
      return acc
    }, {})
  ).sort((a, b) => {
    const aMin = Math.min(...a.map(r => r.pickup_min ?? r.call_min ?? 9999))
    const bMin = Math.min(...b.map(r => r.pickup_min ?? r.call_min ?? 9999))
    return aMin - bMin
  })

  const vehicles = [...new Set(trips.map(t => t.vehicle_id).filter(Boolean))].sort()
  const cnts = {
    A: trips.filter(t => t.transfer_class === 'ARRIVAL').length,
    D: trips.filter(t => t.transfer_class === 'DEPARTURE').length,
    S: trips.filter(t => t.transfer_class === 'STANDARD').length,
  }

  // ── Suggested trips for assign context ──
  const suggestedBaseIds = useMemo(() => {
    if (!assignCtx) return new Set()
    return new Set(
      trips.filter(t => {
        if (assignCtx.ts === 'IN')  return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
        if (assignCtx.ts === 'OUT') return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
        return t.transfer_class === 'STANDARD' && t.pickup_id === assignCtx.hotel
      }).map(t => baseTripId(t.trip_id))
    )
  }, [trips, assignCtx])

  // ── Open new trip sidebar automatically when assignCtx is active ──
  useEffect(() => {
    if (!assignCtx || loading) return
    setNewTripOpen(true)
    setEditTripRow(null)
  }, [assignCtx, loading])

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', }}>

      {/* ── Header ── */}
      <Navbar currentPath="/dashboard/trips" />

      {/* ── Sub-toolbar ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
          <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>▶</button>
          <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>{t.today}</button>
          <div style={{ display: 'flex', gap: '5px', marginLeft: '8px' }}>
            {[
              { n: trips.length, l: 'total', c: '#374151', bg: '#f8fafc', b: '#e2e8f0' },
              { n: cnts.A, l: 'ARR', c: '#15803d', bg: '#dcfce7', b: '#86efac' },
              { n: cnts.D, l: 'DEP', c: '#c2410c', bg: '#fff7ed', b: '#fdba74' },
              { n: cnts.S, l: 'STD', c: '#1d4ed8', bg: '#eff6ff', b: '#93c5fd' },
            ].map(s => (
              <span key={s.l} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>{s.n} {s.l}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Class filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'ARR', 'DEP', 'STD'].map(s => {
              const fullMap = { ARR: 'ARRIVAL', DEP: 'DEPARTURE', STD: 'STANDARD' }
              const full   = fullMap[s] || s
              const active = filterClass === full || (s === 'ALL' && filterClass === 'ALL')
              const c      = CLS[full]
              return (
                <button key={s} onClick={() => setFilterClass(s === 'ALL' ? 'ALL' : full)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'PLANNED', 'BUSY', 'DONE'].map(s => {
              const active = filterStatus === s
              const c = STS[s]
              return (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { ...c, borderColor: '#e2e8f0' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {vehicles.length > 0 && (
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', cursor: 'pointer' }}>
              <option value="ALL">{t.allVehicles}</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {(filterClass !== 'ALL' || filterStatus !== 'ALL' || filterVehicle !== 'ALL') && (
            <button onClick={() => { setFilterClass('ALL'); setFilterStatus('ALL'); setFilterVehicle('ALL') }}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>✕</button>
          )}
          <button onClick={() => { setNewTripOpen(true); setEditTripRow(null) }}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', whiteSpace: 'nowrap' }}>
            + New Trip
          </button>
        </div>
      </div>

      {/* ── Assign crew context banner (fuori dal marginRight div) ── */}
      {assignCtx && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 18px', background: '#fffbeb', borderBottom: '2px solid #f59e0b', fontSize: '12px', transition: 'margin-right 0.25s', marginRight: anySidebarOpen ? `${SIDEBAR_W}px` : 0 }}>
          <span style={{ fontSize: '14px' }}>👤</span>
          <span style={{ fontWeight: '800', color: '#92400e' }}>{t.assigningLabel}</span>
          <span style={{ fontWeight: '700', color: '#0f172a' }}>{assignCtx.name}</span>
          <span style={{ color: '#d97706' }}>·</span>
          <span style={{ color: '#92400e' }}>Status: <strong>{assignCtx.ts}</strong></span>
          {suggestedBaseIds.size > 0
            ? <span style={{ color: '#15803d', fontWeight: '700' }}>⭐ {suggestedBaseIds.size} trip{suggestedBaseIds.size > 1 ? 's' : ''} suggested — click to open</span>
            : <span style={{ color: '#dc2626', fontWeight: '700' }}>{t.noCompatibleTrips}</span>
          }
          <button onClick={() => setAssignCtx(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #fde68a', color: '#92400e', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>{t.dismiss}</button>
        </div>
      )}

      {/* ── Column header sticky — fuori dal marginRight div, con proprio marginRight ── */}
      {trips.length > 0 && (
        <TableHeader
          columns={TRIP_COLS}
          style={{
            top: assignCtx ? '144px' : '104px',
            transition: 'margin-right 0.25s, top 0.15s',
            marginRight: anySidebarOpen ? `${SIDEBAR_W}px` : 0,
          }}
        />
      )}

      {/* ── Contenuto ── */}
      <div style={{ transition: 'margin-right 0.25s', marginRight: anySidebarOpen ? `${SIDEBAR_W}px` : 0 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              {trips.length === 0 ? t.noTripsDate : t.noResultsFiltered}
            </div>
            {trips.length === 0 && (
              <button onClick={() => setNewTripOpen(true)} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '8px' }}>
                + New Trip
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'white' }}>
            {!PRODUCTION_ID && (
              <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', fontSize: '12px', borderBottom: '1px solid #fecaca' }}>
                ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
              </div>
            )}
            {grouped.map((group, i) => (
              <TripRow
                key={group[0].trip_id + i}
                group={group}
                locations={locsMap}
                selected={editTripRow?.trip_id === group[0].trip_id}
                isSuggested={!!assignCtx && suggestedBaseIds.has(baseTripId(group[0].trip_id))}
                onClick={() => {
                  setEditTripRow(group[0])
                  setEditTripGroup(group)
                  setNewTripOpen(false)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── CREATE sidebar ── */}
      <TripSidebar
        open={newTripOpen}
        onClose={() => setNewTripOpen(false)}
        defaultDate={date}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onSaved={() => { loadTrips(date) }}
        assignCtx={assignCtx}
        trips={trips}
      />

      {/* ── EDIT sidebar ── */}
      <EditTripSidebar
        open={!!editTripRow}
        initial={editTripRow}
        group={editTripGroup}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onClose={() => setEditTripRow(null)}
        onSaved={() => { setEditTripRow(null); loadTrips(date) }}
        onPaxChanged={() => loadTrips(date)}
      />
    </div>
  )
}

// ─── Export default con Suspense (richiesto da Next.js 16 per useSearchParams) ──
export default function TripsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>}>
      <TripsPageInner />
    </Suspense>
  )
}
