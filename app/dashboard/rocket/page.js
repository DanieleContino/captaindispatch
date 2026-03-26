'use client'

/**
 * /dashboard/rocket — Generazione automatica trip v2
 *
 * v2.1 (26 marzo 2026):
 *   - Multi-pickup / multi-dropoff: detection, visual badge, auto-split on confirm
 *   - Smart NO_VEHICLE warnings: crew names + hotel + nearby hotels + vehicles with room
 *   - enrichSuggestions: post-processing after runRocket
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase }  from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID
const LS_DEPT_KEY   = 'rocket_dept_config'

const NAV = [
  { l: 'Dashboard',  p: '/dashboard' },
  { l: 'Fleet',      p: '/dashboard/fleet' },
  { l: 'Trips',      p: '/dashboard/trips' },
  { l: 'Lists',      p: '/dashboard/lists' },
  { l: 'Crew',       p: '/dashboard/crew' },
  { l: 'Hub Cov.',   p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.',   p: '/dashboard/pax-coverage' },
  { l: 'Reports',    p: '/dashboard/reports' },
  { l: 'QR',         p: '/dashboard/qr-codes' },
  { l: 'Locations',  p: '/dashboard/locations' },
  { l: 'Vehicles',   p: '/dashboard/vehicles' },
  { l: '🚀 Rocket',  p: '/dashboard/rocket' },
  { l: '🎬 Prods',   p: '/dashboard/productions' },
]

const SERVICE_TYPES = ['Hotel Run', 'Airport', 'Unit Move', 'Shuttle', 'Standard', 'Other']
const DEPT_COLORS = [
  ['#dbeafe','#1d4ed8'], ['#dcfce7','#15803d'], ['#fef3c7','#92400e'],
  ['#fce7f3','#9d174d'], ['#ede9fe','#6d28d9'], ['#ffedd5','#c2410c'],
  ['#e0f2fe','#0369a1'], ['#d1fae5','#065f46'], ['#fef9c3','#a16207'],
]
const deptColor = (dept) => {
  if (!dept) return ['#f1f5f9', '#64748b']
  let h = 0; for (let i = 0; i < dept.length; i++) h = (h * 31 + dept.charCodeAt(i)) % DEPT_COLORS.length
  return DEPT_COLORS[h]
}

const pad2 = n => String(n).padStart(2, '0')
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }
function minToHHMM(min) {
  if (min == null) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}
function hhmmToMin(str) {
  if (!str) return null
  const [h, m] = str.split(':').map(Number)
  return isNaN(h) ? null : h * 60 + (m || 0)
}
function localDtFromMin(dateStr, minOfDay) {
  if (!dateStr || minOfDay == null) return null
  const [y, mo, dd] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, dd, Math.floor(minOfDay / 60), minOfDay % 60, 0, 0).toISOString()
}

// ─── localStorage ─────────────────────────────────────────────
function saveDeptConfig(cfg) { try { localStorage.setItem(LS_DEPT_KEY, JSON.stringify(cfg)) } catch {} }
function loadDeptConfig(locationIdSet) {
  try {
    const raw = localStorage.getItem(LS_DEPT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const valid = {}
    for (const [dept, cfg] of Object.entries(parsed)) {
      if (!cfg || typeof cfg !== 'object') continue
      const entry = {}
      if (cfg.destId && locationIdSet.has(cfg.destId)) entry.destId = cfg.destId
      if (typeof cfg.callMin === 'number' && cfg.callMin >= 0 && cfg.callMin < 1440) entry.callMin = cfg.callMin
      if (Object.keys(entry).length) valid[dept] = entry
    }
    return valid
  } catch { return {} }
}

// ─── 🚀 Rocket Algorithm v2 ───────────────────────────────────
function runRocket({ crew, vehicles, routeMap, globalDestId, globalCallMin, deptDestOverrides, crewCallOverrides, excludedCrewIds, excludedVehicleIds }) {
  function getEffective(c) {
    const deptCfg = (c.department && deptDestOverrides[c.department]) || {}
    return {
      effectiveDest:    deptCfg.destId  ?? globalDestId,
      effectiveCallMin: crewCallOverrides[c.id] ?? deptCfg.callMin ?? globalCallMin,
    }
  }
  const eligible = crew.filter(c =>
    !excludedCrewIds.has(c.id) && c.hotel_id &&
    c.travel_status === 'PRESENT' && c.hotel_status === 'CONFIRMED'
  )
  const groupMap = {}
  for (const c of eligible) {
    const { effectiveDest, effectiveCallMin } = getEffective(c)
    if (!effectiveDest) continue
    const key = `${c.hotel_id}::${effectiveDest}::${effectiveCallMin}`
    if (!groupMap[key]) groupMap[key] = { hotelId: c.hotel_id, destId: effectiveDest, callMin: effectiveCallMin, list: [] }
    groupMap[key].list.push(c)
  }
  const groups = Object.values(groupMap).sort((a, b) =>
    b.list.length !== a.list.length ? b.list.length - a.list.length : a.callMin - b.callMin
  )
  const pool = [...vehicles]
    .filter(v => v.active && !excludedVehicleIds.has(v.id))
    .sort((a, b) => (b.pax_suggested || b.capacity || 0) - (a.pax_suggested || a.capacity || 0))
  const draftTrips = [], suggestions = []
  let seq = 0
  for (const g of groups) {
    const dur       = routeMap[`${g.hotelId}||${g.destId}`] ?? 30
    const pickupMin = g.callMin - dur
    const sorted    = [...g.list].sort((a, b) =>
      (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
    )
    let remaining = [...sorted]
    while (remaining.length > 0) {
      if (!pool.length) {
        suggestions.push({ type: 'NO_VEHICLE', hotelId: g.hotelId, destId: g.destId, callMin: g.callMin,
          crew: remaining.map(c => c.full_name) })
        // Phantom trip so unassigned crew appear in Step 2 and can be moved to real vehicles
        draftTrips.push({ key: `u${seq++}`, vehicleId: null, vehicle: null, isUnassigned: true,
          hotelId: g.hotelId, destId: g.destId, callMin: g.callMin, pickupMin, durationMin: dur,
          crewList: remaining.map(c => ({ ...c, _effectiveDest: g.destId })) })
        remaining = []; break
      }
      const v = pool.shift()
      const capSug = v.pax_suggested || v.capacity || 6
      const capMax = Math.max(capSug, v.pax_max || capSug)
      const toAssign = remaining.splice(0, capSug)
      if (remaining.length > 0 && toAssign.length === capSug && capSug < capMax) {
        const addable = Math.min(capMax - capSug, remaining.length)
        if (addable > 0) suggestions.push({ type: 'CAN_ADD', tripKey: `t${seq}`, vehicleId: v.id, addable,
          names: remaining.slice(0, addable).map(c => c.full_name),
          msg: `${v.id} can carry ${addable} more (pax_max=${capMax}): ${remaining.slice(0, addable).map(c => c.full_name).join(', ')}` })
      }
      // Tag each crew member with their effectiveDest for multi-pickup/dropoff detection
      draftTrips.push({ key: `t${seq++}`, vehicleId: v.id, vehicle: v,
        hotelId: g.hotelId, destId: g.destId, callMin: g.callMin, pickupMin, durationMin: dur,
        crewList: toAssign.map(c => ({ ...c, _effectiveDest: g.destId })) })
    }
  }
  return { draftTrips, suggestions }
}

// ─── Smart suggestion enrichment ─────────────────────────────
function enrichSuggestions(suggestions, draftTrips, routeMap, locMap) {
  return suggestions.map(s => {
    if (s.type !== 'NO_VEHICLE') return s
    // Vehicles going to same dest with spare pax_max capacity
    const vehiclesWithRoom = draftTrips
      .filter(t => t.destId === s.destId && !t.isUnassigned && t.vehicle)
      .map(t => {
        const capMax = Math.max(t.vehicle.pax_max || 0, t.vehicle.pax_suggested || t.vehicle.capacity || 0)
        const room = capMax - t.crewList.length
        return room > 0 ? { vehicleId: t.vehicleId, driver: t.vehicle.driver_name, room } : null
      })
      .filter(Boolean)
    // Nearby hotels (route ≤ 15 min in routeMap)
    const nearbyTrips = []
    const seen = new Set()
    for (const trip of draftTrips) {
      if (trip.isUnassigned || !trip.vehicle) continue
      if (trip.hotelId === s.hotelId || seen.has(trip.hotelId)) continue
      seen.add(trip.hotelId)
      const dur = routeMap[`${s.hotelId}||${trip.hotelId}`] ?? routeMap[`${trip.hotelId}||${s.hotelId}`] ?? null
      if (dur !== null && dur <= 15) {
        nearbyTrips.push({ hotelId: trip.hotelId, hotelName: locMap[trip.hotelId] || trip.hotelId,
          duration: dur, vehicleId: trip.vehicleId, driver: trip.vehicle.driver_name })
      }
    }
    return { ...s, vehiclesWithRoom, nearbyTrips }
  })
}

// ─── Crew Quick-Edit Modal ────────────────────────────────────
function CrewQuickEditModal({ crew, deptDestOverrides, crewCallOverrides, excludedCrewIds, globalCallMin, globalDestId, locMap, onUpdate, onClose }) {
  const isExcluded = excludedCrewIds.has(crew.id)
  const deptCfg  = (crew.department && deptDestOverrides[crew.department]) || {}
  const deptBase = deptCfg.callMin ?? globalCallMin
  const initCall = crewCallOverrides[crew.id] ?? deptBase
  const effectDest = deptCfg.destId ?? globalDestId
  const [callMin, setCallMin] = useState(initCall)
  const [included, setIncluded] = useState(!isExcluded)
  const inputRef = useRef(null)
  const hasOverride = callMin !== deptBase
  const [bgC, txC] = deptColor(crew.department)
  function adjust(delta) { setCallMin(prev => Math.max(0, Math.min(1439, prev + delta))) }
  function handleDone() { onUpdate({ crewId: crew.id, callMin, included }); onClose() }
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '22px', width: '360px', maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>{crew.full_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {crew.department && <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', background: bgC, color: txC }}>{crew.department}</span>}
              <span style={{ fontSize: '11px', color: '#64748b' }}>{locMap[crew.hotel_id] || crew.hotel_id || '—'}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
        </div>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Include in run</div>
          <button onClick={() => setIncluded(v => !v)}
            style={{ width: '100%', padding: '10px', borderRadius: '9px', border: `2px solid ${included ? '#16a34a' : '#e2e8f0'}`, background: included ? '#f0fdf4' : '#f8fafc', color: included ? '#15803d' : '#94a3b8', cursor: 'pointer', fontSize: '14px', fontWeight: '800', textAlign: 'center', transition: 'all 0.12s' }}>
            {included ? '✅ Included' : '☐ Excluded'}
          </button>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Call Time</div>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
            {[-15, -5].map(d => (
              <button key={d} onClick={() => adjust(d)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>{d}</button>
            ))}
            <input ref={inputRef} type="time" value={minToHHMM(callMin)}
              onChange={e => { const m = hhmmToMin(e.target.value); if (m !== null) setCallMin(m) }}
              style={{ flex: 2, padding: '8px', border: `2px solid ${hasOverride ? '#fbbf24' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '18px', fontWeight: '900', textAlign: 'center', background: hasOverride ? '#fffbeb' : 'white', color: '#0f172a' }} />
            {[5, 15].map(d => (
              <button key={d} onClick={() => adjust(d)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>+{d}</button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
            <span>Base: <strong style={{ color: '#374151' }}>{minToHHMM(deptBase)}</strong> ({crew.department ? `${crew.department} dept` : 'global'})</span>
            {hasOverride && <button onClick={() => setCallMin(deptBase)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '11px', fontWeight: '700', padding: 0 }}>↩ Reset</button>}
          </div>
        </div>
        <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', fontSize: '11px', color: '#64748b', marginBottom: '18px' }}>
          → <strong style={{ color: '#374151' }}>{locMap[effectDest] || effectDest || '—'}</strong>
          {deptCfg.destId && <span style={{ color: '#7c3aed', marginLeft: '4px' }}>(dept override)</span>}
        </div>
        <button onClick={handleDone} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#0f2340', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '800' }}>✓ Done</button>
      </div>
    </div>
  )
}

// ─── Move Crew Modal (Step 2) ─────────────────────────────────
function MoveCrewModal({ crewMember, currentTripKey, trips, locMap, onMove, onClose }) {
  const [target, setTarget] = useState('')
  const otherTrips = trips.filter(t => t.key !== currentTripKey && !t.isUnassigned)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '22px', width: '420px', maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>Move passenger</div>
        <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: '700', marginBottom: '4px' }}>{crewMember.full_name}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>{crewMember.department || '—'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
          {otherTrips.map(t => {
            const cap = t.vehicle.pax_suggested || t.vehicle.capacity || 6
            const pax = t.crewList.length
            const over = pax >= cap
            return (
              <div key={t.key} onClick={() => setTarget(t.key)}
                style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === t.key ? '#2563eb' : '#e2e8f0'}`, background: target === t.key ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', fontFamily: 'monospace' }}>{t.vehicleId}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: over ? '#b91c1c' : '#15803d' }}>{pax}/{cap} pax {over ? '⚠' : ''}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {minToHHMM(t.pickupMin)} · {t.vehicle.driver_name || 'No driver'} · {locMap[t.destId] || t.destId}
                </div>
              </div>
            )
          })}
          <div onClick={() => setTarget('__remove__')}
            style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === '__remove__' ? '#dc2626' : '#e2e8f0'}`, background: target === '__remove__' ? '#fef2f2' : 'white', cursor: 'pointer' }}>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#dc2626' }}>↩ Remove from all trips</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
          <button onClick={() => { if (target) { onMove(crewMember, currentTripKey, target); onClose() } }} disabled={!target}
            style={{ flex: 2, padding: '10px', borderRadius: '9px', border: 'none', background: target ? '#2563eb' : '#e2e8f0', color: target ? 'white' : '#94a3b8', cursor: target ? 'pointer' : 'default', fontSize: '13px', fontWeight: '800' }}>
            Move →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Trip Card (Step 2) ───────────────────────────────────────
function TripCard({ trip, locMap, routeMap, allTrips, onMoveCrew }) {
  const [open, setOpen] = useState(true)
  const isUnassigned = !!trip.isUnassigned
  const pax    = trip.crewList.length
  const capSug = (!isUnassigned && (trip.vehicle?.pax_suggested || trip.vehicle?.capacity)) || 6
  const capMax = Math.max(capSug, (!isUnassigned && trip.vehicle?.pax_max) || capSug)
  const over   = pax > capSug
  const atMax  = pax >= capMax
  const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
  const icon   = isUnassigned ? '⚠️' : (TYPE_ICON[trip.vehicle?.vehicle_type] || '🚐')
  const paxColor = isUnassigned ? '#b91c1c' : atMax ? '#b91c1c' : over ? '#d97706' : pax === capSug ? '#15803d' : '#64748b'
  const paxBg    = isUnassigned ? '#fee2e2' : atMax ? '#fee2e2' : over ? '#fffbeb' : pax === capSug ? '#dcfce7' : '#f1f5f9'

  // Multi-pickup / multi-dropoff detection
  const pickupHotels  = [...new Set(trip.crewList.map(c => c.hotel_id).filter(Boolean))]
  const dropoffDests  = [...new Set(trip.crewList.map(c => c._effectiveDest || trip.destId).filter(Boolean))]
  const isMultiPickup  = pickupHotels.length > 1
  const isMultiDropoff = dropoffDests.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff

  return (
    <div style={{ background: 'white', border: `1.5px solid ${isUnassigned ? '#fecaca' : isMixed ? '#fde68a' : '#e2e8f0'}`, borderRadius: '13px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: isUnassigned ? '#fef2f2' : isMixed ? '#fffbeb' : '#fafafa', borderBottom: open ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {isUnassigned
                ? <span style={{ fontWeight: '900', fontSize: '13px', color: '#b91c1c' }}>NO VEHICLE — use Move ›</span>
                : <span style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '15px', color: '#0f172a' }}>{trip.vehicleId}</span>
              }
              {isMultiPickup && <span style={{ fontSize: '9px', fontWeight: '800', color: '#d97706', background: '#fffbeb', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>🔀 MULTI-PKP</span>}
              {isMultiDropoff && <span style={{ fontSize: '9px', fontWeight: '800', color: '#7c3aed', background: '#fdf4ff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #c4b5fd' }}>🔀 MULTI-DRP</span>}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isUnassigned
                ? `${locMap[trip.hotelId] || trip.hotelId} → ${locMap[trip.destId] || trip.destId} · ${minToHHMM(trip.callMin)} call`
                : `${trip.vehicle?.driver_name || 'No driver'} · ${trip.vehicle?.vehicle_type || ''}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', background: paxBg, color: paxColor, border: `1px solid ${paxColor}20` }}>
            {pax}/{capSug}{capMax > capSug && <span style={{ color: '#94a3b8', fontWeight: '600' }}> (max {capMax})</span>}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>
      {open && (
        <>
          {/* Route + timing */}
          <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
            {!isMixed ? (
              <>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '2px' }}>
                  <span style={{ color: '#64748b' }}>{locMap[trip.hotelId] || trip.hotelId}</span>
                  <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span>
                  <span style={{ color: '#0f172a' }}>{locMap[trip.destId] || trip.destId}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>🕐 Pickup {minToHHMM(trip.pickupMin)}</span>
                  <span>⏱ {trip.durationMin}min</span>
                  <span>🏁 Arrive {minToHHMM(trip.callMin)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '5px', fontStyle: 'italic' }}>
                  auto-split on confirm · 🏁 all arrive {minToHHMM(trip.callMin)}
                </div>
                {/* Multi-pickup breakdown */}
                {isMultiPickup && pickupHotels.map(hId => {
                  const hCrew   = trip.crewList.filter(c => c.hotel_id === hId)
                  const hDest   = hCrew[0]?._effectiveDest || trip.destId
                  const hDur    = (routeMap && routeMap[`${hId}||${hDest}`]) ?? 30
                  const hPk     = trip.callMin - hDur
                  return (
                    <div key={hId} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locMap[hId] || hId}</span>
                      <span style={{ color: '#94a3b8' }}>→ {locMap[hDest] || hDest}</span>
                      <span style={{ color: '#374151', fontWeight: '700', whiteSpace: 'nowrap' }}>🕐 {minToHHMM(hPk)} · {hCrew.length} pax</span>
                    </div>
                  )
                })}
                {/* Multi-dropoff breakdown (single pickup) */}
                {isMultiDropoff && !isMultiPickup && dropoffDests.map(dId => {
                  const dCrew = trip.crewList.filter(c => (c._effectiveDest || trip.destId) === dId)
                  const dDur  = (routeMap && routeMap[`${trip.hotelId}||${dId}`]) ?? 30
                  return (
                    <div key={dId} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#64748b' }}>{locMap[trip.hotelId] || trip.hotelId}</span>
                      <span style={{ color: '#94a3b8' }}>→</span>
                      <span style={{ color: '#0f172a', fontWeight: '700', flex: 1 }}>{locMap[dId] || dId}</span>
                      <span style={{ color: '#374151', fontWeight: '700', whiteSpace: 'nowrap' }}>⏱ {dDur}min · {dCrew.length} pax</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          {/* Crew list */}
          {pax === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>No passengers</div>
          ) : (
            <div>
              {trip.crewList.map(c => {
                const [bgC, textC] = deptColor(c.department)
                const cDest = c._effectiveDest || trip.destId
                const destMismatch = cDest !== trip.destId
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #f8fafc', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: bgC, color: textC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '10px', flexShrink: 0 }}>
                        {(c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {c.department || '—'}
                          {destMismatch && <span style={{ color: '#7c3aed', marginLeft: '4px' }}>→ {locMap[cDest] || cDest}</span>}
                          {c.hotel_id !== trip.hotelId && <span style={{ color: '#d97706', marginLeft: '4px' }}>from {locMap[c.hotel_id] || c.hotel_id}</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => onMoveCrew(c, trip.key)} style={{ flexShrink: 0, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                      Move ›
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Location Select ──────────────────────────────────────────
function LocSelect({ value, onChange, locations, placeholder = '— Select —', style }) {
  return (
    <select value={value} onChange={onChange}
      style={{ padding: '7px 10px', border: `1px solid ${!value ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '7px', fontSize: '12px', fontWeight: '600', background: 'white', color: value ? '#0f172a' : '#94a3b8', boxSizing: 'border-box', ...style }}>
      <option value="">{placeholder}</option>
      <optgroup label="Locations / Sets">
        {locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </optgroup>
      <optgroup label="Hubs / Airports">
        {locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>✈ {l.name}</option>)}
      </optgroup>
    </select>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function RocketPage() {
  const router = useRouter()
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const [allCrew,   setAllCrew]   = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [locations, setLocations] = useState([])
  const [routeMap,  setRouteMap]  = useState({})

  const [step,               setStep]               = useState(1)
  const [date,               setDate]               = useState(isoToday())
  const [destId,             setDestId]             = useState('')
  const [globalCallTime,     setGlobalCallTime]     = useState('07:00')
  const [serviceType,        setServiceType]        = useState('Hotel Run')
  const [crewCallOverrides,  setCrewCallOverrides]  = useState({})
  const [excludedCrewIds,    setExcludedCrewIds]    = useState(new Set())
  const [excludedVehicleIds, setExcludedVehicleIds] = useState(new Set())
  const [deptDestOverrides,  setDeptDestOverrides]  = useState({})

  const [crewSearch,    setCrewSearch]    = useState('')
  const [expandedDepts, setExpandedDepts] = useState(new Set())
  const [editingCrew,   setEditingCrew]   = useState(null)

  const [draftTrips,  setDraftTrips]  = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [moveTarget,  setMoveTarget]  = useState(null)
  const [createdCount, setCreatedCount] = useState(0)
  const [createError,  setCreateError]  = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login'); else setUser(user)
    })
  }, [router])

  useEffect(() => { saveDeptConfig(deptDestOverrides) }, [deptDestOverrides])

  const loadData = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const [cR, vR, lR, rR] = await Promise.all([
      supabase.from('crew').select('id,full_name,department,hotel_id,travel_status,hotel_status')
        .eq('production_id', PRODUCTION_ID).eq('travel_status', 'PRESENT').eq('hotel_status', 'CONFIRMED')
        .order('department').order('full_name'),
      supabase.from('vehicles').select('id,vehicle_type,capacity,pax_suggested,pax_max,driver_name,sign_code,active')
        .eq('production_id', PRODUCTION_ID).eq('active', true).order('vehicle_type').order('id'),
      supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('name'),
      supabase.from('routes').select('from_id,to_id,duration_min').eq('production_id', PRODUCTION_ID),
    ])
    setAllCrew(cR.data || [])
    setVehicles(vR.data || [])
    setLocations(lR.data || [])
    const rm = {}
    for (const r of (rR.data || [])) rm[`${r.from_id}||${r.to_id}`] = r.duration_min
    setRouteMap(rm)
    const sets = (lR.data || []).filter(l => !l.is_hub)
    if (sets.length && !destId) setDestId(sets[0].id)
    const locationIdSet = new Set((lR.data || []).map(l => l.id))
    setDeptDestOverrides(loadDeptConfig(locationIdSet))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (user) loadData() }, [user, loadData])

  const locMap           = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const globalCallMin    = hhmmToMin(globalCallTime) ?? 420
  const eligibleCrew     = allCrew.filter(c => c.hotel_id)
  const selectedCrew     = eligibleCrew.filter(c => !excludedCrewIds.has(c.id))
  const activeVehicles   = vehicles.filter(v => v.active)
  const includedVehicles = activeVehicles.filter(v => !excludedVehicleIds.has(v.id))
  const departments      = [...new Set(eligibleCrew.map(c => c.department).filter(Boolean))].sort()

  const searchLower = crewSearch.toLowerCase().trim()
  const filteredEligible = searchLower
    ? eligibleCrew.filter(c => c.full_name.toLowerCase().includes(searchLower) || (c.department || '').toLowerCase().includes(searchLower))
    : eligibleCrew
  const crewByDept = {}
  for (const c of filteredEligible) {
    const key = c.department || '__nodept__'
    if (!crewByDept[key]) crewByDept[key] = []
    crewByDept[key].push(c)
  }
  const accordionKeys = [...departments.filter(d => crewByDept[d]), ...(crewByDept['__nodept__'] ? ['__nodept__'] : [])]
  const isDeptExpanded = key => searchLower ? true : expandedDepts.has(key)
  const toggleDept = key => setExpandedDepts(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  function getCrewEffectiveDest(c) { return ((c.department && deptDestOverrides[c.department]?.destId) ?? destId) }

  function setDeptOverride(dept, field, value) {
    setDeptDestOverrides(prev => {
      const existing = prev[dept] || {}
      const newCfg = { destId: field === 'destId' ? value : (existing.destId ?? destId), callMin: field === 'callMin' ? value : (existing.callMin ?? globalCallMin) }
      if (newCfg.destId === destId && newCfg.callMin === globalCallMin) { const next = { ...prev }; delete next[dept]; return next }
      return { ...prev, [dept]: newCfg }
    })
  }

  function handleCrewModalUpdate({ crewId, callMin, included }) {
    setExcludedCrewIds(prev => { const next = new Set(prev); included ? next.delete(crewId) : next.add(crewId); return next })
    const c = allCrew.find(x => x.id === crewId)
    const deptBase = (c?.department && deptDestOverrides[c.department]?.callMin) ?? globalCallMin
    if (callMin === deptBase) { setCrewCallOverrides(prev => { const n = { ...prev }; delete n[crewId]; return n }) }
    else { setCrewCallOverrides(prev => ({ ...prev, [crewId]: callMin })) }
  }

  function handleLaunch() {
    if (!destId || selectedCrew.length === 0 || includedVehicles.length === 0) return
    const result = runRocket({ crew: allCrew, vehicles, routeMap, globalDestId: destId, globalCallMin, deptDestOverrides, crewCallOverrides, excludedCrewIds, excludedVehicleIds })
    const enriched = enrichSuggestions(result.suggestions, result.draftTrips, routeMap, locMap)
    setDraftTrips(result.draftTrips)
    setSuggestions(enriched)
    setCreateError(null)
    setStep(2)
  }

  function handleMoveCrew(crewMember, fromKey, toKey) {
    setDraftTrips(prev => {
      const next = prev.map(t => ({ ...t, crewList: [...t.crewList] }))
      const from = next.find(t => t.key === fromKey)
      if (from) from.crewList = from.crewList.filter(c => c.id !== crewMember.id)
      if (toKey !== '__remove__') {
        const to = next.find(t => t.key === toKey)
        if (to && !to.crewList.find(c => c.id === crewMember.id)) to.crewList = [...to.crewList, crewMember]
      }
      return next
    })
  }

  async function handleConfirm() {
    setSaving(true); setCreateError(null)
    const mm = pad2(new Date().getMonth() + 1), dd2 = pad2(new Date().getDate())
    const prefix = `R_${mm}${dd2}`
    let created = 0, seqNum = 1

    for (const t of draftTrips) {
    if (!t.crewList.length || t.isUnassigned) continue
      // Group crew by (hotel_id, _effectiveDest) for auto-split
      const groups = {}
      for (const c of t.crewList) {
        const hId = c.hotel_id || t.hotelId
        const dId = c._effectiveDest || t.destId
        const key = `${hId}::${dId}`
        if (!groups[key]) groups[key] = { hotelId: hId, destId: dId, crew: [] }
        groups[key].crew.push(c)
      }
      const groupArr  = Object.values(groups)
      const useSuffix = groupArr.length > 1
      for (let gi = 0; gi < groupArr.length; gi++) {
        const g      = groupArr[gi]
        const tripId = `${prefix}_${pad2(seqNum)}${useSuffix ? String.fromCharCode(65 + gi) : ''}`
        const dur    = routeMap[`${g.hotelId}||${g.destId}`] ?? t.durationMin ?? 30
        const pkMin  = t.callMin - dur
        const row = {
          production_id: PRODUCTION_ID, trip_id: tripId, date,
          vehicle_id: t.vehicleId, driver_name: t.vehicle.driver_name || null,
          sign_code: t.vehicle.sign_code || null, capacity: t.vehicle.capacity || null,
          pickup_id: g.hotelId, dropoff_id: g.destId,
          call_min: t.callMin, pickup_min: pkMin, duration_min: dur,
          start_dt: localDtFromMin(date, pkMin), end_dt: localDtFromMin(date, t.callMin),
          service_type: serviceType, pax_count: g.crew.length, status: 'PLANNED',
        }
        const { data: ins, error: insErr } = await supabase.from('trips').insert(row).select('id').single()
        if (insErr) { setCreateError(`Trip ${tripId}: ${insErr.message}`); setSaving(false); return }
        if (ins?.id && g.crew.length > 0) {
          const { error: pErr } = await supabase.from('trip_passengers').insert(
            g.crew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
          )
          if (pErr) { setCreateError(pErr.message); setSaving(false); return }
        }
        created++
      }
      seqNum++
    }
    setCreatedCount(created); setSaving(false); setStep(3)
  }

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  const totalPax      = draftTrips.reduce((s, t) => s + t.crewList.length, 0)
  const activeTrips   = draftTrips.filter(t => t.crewList.length > 0).length
  const uniqueDestIds = [...new Set(draftTrips.map(t => t.destId))]
  const destLabel     = uniqueDestIds.length === 1 ? (locMap[uniqueDestIds[0]] || uniqueDestIds[0])
    : uniqueDestIds.length > 1 ? `${uniqueDestIds.length} destinations` : (locMap[destId] || destId || '—')
  const canLaunch     = !!destId && selectedCrew.length > 0 && includedVehicles.length > 0
  const stepLabel     = ['', 'Setup', 'Preview', 'Done']
  const activeDeptOverrides = Object.keys(deptDestOverrides).filter(d =>
    deptDestOverrides[d]?.destId !== destId || deptDestOverrides[d]?.callMin !== globalCallMin
  ).length

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Top nav ── */}
      <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                color: p === '/dashboard/rocket' ? 'white' : '#94a3b8', background: p === '/dashboard/rocket' ? '#1e3a5f' : 'transparent',
                textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>
            ))}
          </nav>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
          Sign out
        </button>
      </div>

      {/* ── Sub-toolbar ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '22px' }}>🚀</span>
          <span style={{ fontWeight: '900', fontSize: '17px', color: '#0f172a' }}>Rocket</span>
          <span style={{ fontWeight: '400', fontSize: '13px', color: '#94a3b8' }}>Trip Generator v2</span>
          <div style={{ display: 'flex', gap: '3px', marginLeft: '8px' }}>
            {[1, 2, 3].map(n => {
              const active = step === n, done = step > n
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                  background: active ? '#0f2340' : done ? '#dcfce7' : '#f1f5f9', color: active ? 'white' : done ? '#15803d' : '#94a3b8',
                  border: `1px solid ${active ? '#0f2340' : done ? '#86efac' : '#e2e8f0'}` }}>
                  <span>{done ? '✓' : n}</span><span>{stepLabel[n]}</span>
                </div>
              )
            })}
          </div>
        </div>
        {step === 1 && !loading && (
          <button onClick={handleLaunch} disabled={!canLaunch}
            style={{ background: canLaunch ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#e2e8f0', color: canLaunch ? 'white' : '#94a3b8',
              border: 'none', borderRadius: '9px', padding: '8px 20px', fontSize: '14px', fontWeight: '900',
              cursor: canLaunch ? 'pointer' : 'default', letterSpacing: '-0.3px',
              boxShadow: canLaunch ? '0 3px 12px rgba(37,99,235,0.35)' : 'none' }}>
            🚀 Launch Rocket ({selectedCrew.length} crew · {includedVehicles.length} vehicle{includedVehicles.length !== 1 ? 's' : ''})
          </button>
        )}
        {step === 2 && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{activeTrips} trip{activeTrips !== 1 ? 's' : ''} · {totalPax} pax</span>
            <button onClick={() => setStep(1)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151' }}>← Edit Setup</button>
            <button onClick={handleConfirm} disabled={saving || activeTrips === 0}
              style={{ background: (saving || activeTrips === 0) ? '#94a3b8' : '#16a34a', color: 'white', border: 'none', borderRadius: '9px', padding: '8px 20px',
                cursor: (saving || activeTrips === 0) ? 'wait' : 'pointer', fontSize: '13px', fontWeight: '800',
                boxShadow: (saving || activeTrips === 0) ? 'none' : '0 3px 12px rgba(22,163,74,0.35)' }}>
              {saving ? '⏳ Creating…' : `✅ Confirm ${activeTrips} trip${activeTrips !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 24px' }}>
        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚀</div>
            <div style={{ fontWeight: '600' }}>Loading fleet and crew data…</div>
          </div>
        ) : (
          <>
            {/* ════ STEP 1 — 2-column layout ════ */}
            {step === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: '5fr 8fr', gap: '20px', alignItems: 'start' }}>

                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* ⚙️ Config */}
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '16px 20px' }}>
                    <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '14px' }}>⚙️ Trip Configuration</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', boxSizing: 'border-box', color: '#0f172a' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Default Destination</label>
                        <LocSelect value={destId} onChange={e => setDestId(e.target.value)} locations={locations}
                          placeholder="— Select destination —" style={{ width: '100%', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Default Call Time</label>
                        <input type="time" value={globalCallTime} onChange={e => setGlobalCallTime(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '16px', fontWeight: '900', boxSizing: 'border-box', textAlign: 'center', color: '#0f172a', background: '#fffbeb' }} />
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Pickup = call − route duration</div>
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Service Type</label>
                        <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', boxSizing: 'border-box', background: 'white', color: '#0f172a' }}>
                          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 🎯 Dept Destinations */}
                  {departments.length > 0 && (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>🎯 Dept Destinations</span>
                          {activeDeptOverrides > 0 && (
                            <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#ede9fe', color: '#6d28d9' }}>
                              {activeDeptOverrides} override{activeDeptOverrides > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <button onClick={() => setDeptDestOverrides({})}
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>↩ Reset all</button>
                      </div>
                      {departments.map(dept => {
                        const deptCfg     = deptDestOverrides[dept] || {}
                        const deptDestId  = deptCfg.destId  ?? destId
                        const deptCallMin = deptCfg.callMin ?? globalCallMin
                        const hasOverride = deptCfg.destId != null || (deptCfg.callMin != null && deptCfg.callMin !== globalCallMin)
                        const crewCount   = selectedCrew.filter(c => c.department === dept).length
                        const [bgC, txC]  = deptColor(dept)
                        return (
                          <div key={dept} style={{ padding: '8px 16px', borderBottom: '1px solid #f8fafc', background: hasOverride ? '#fdfbff' : 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', background: bgC, color: txC, flexShrink: 0 }}>{dept}</span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{crewCount} crew</span>
                              {hasOverride && (
                                <button onClick={() => setDeptDestOverrides(prev => { const n = { ...prev }; delete n[dept]; return n })}
                                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: 0 }}>↩</button>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '6px' }}>
                              <LocSelect value={deptDestId} onChange={e => setDeptOverride(dept, 'destId', e.target.value)}
                                locations={locations} placeholder="same as global"
                                style={{ fontSize: '11px', border: `1px solid ${deptCfg.destId && deptCfg.destId !== destId ? '#c4b5fd' : '#e2e8f0'}`, background: deptCfg.destId && deptCfg.destId !== destId ? '#fdf4ff' : 'white' }} />
                              <input type="time" value={minToHHMM(deptCallMin)}
                                onChange={e => { const m = hhmmToMin(e.target.value); if (m !== null) setDeptOverride(dept, 'callMin', m) }}
                                style={{ padding: '6px 6px', border: `1px solid ${deptCfg.callMin != null && deptCfg.callMin !== globalCallMin ? '#fde68a' : '#e2e8f0'}`,
                                  borderRadius: '7px', fontSize: '12px', fontWeight: '800',
                                  background: deptCfg.callMin != null && deptCfg.callMin !== globalCallMin ? '#fffbeb' : 'white',
                                  textAlign: 'center', color: '#0f172a', boxSizing: 'border-box' }} />
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ padding: '6px 16px', background: '#f8fafc', fontSize: '10px', color: '#94a3b8' }}>Crew without dept always use the default.</div>
                    </div>
                  )}

                  {/* 🚐 Fleet */}
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>🚐 Fleet — {includedVehicles.length}/{activeVehicles.length} included</span>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => setExcludedVehicleIds(new Set())}
                          style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8' }}>✓ All</button>
                        <button onClick={() => setExcludedVehicleIds(new Set(activeVehicles.map(v => v.id)))}
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>✗ None</button>
                      </div>
                    </div>
                    {activeVehicles.length === 0 ? (
                      <div style={{ padding: '14px 16px', fontSize: '12px', color: '#dc2626' }}>No active vehicles — <a href="/dashboard/vehicles" style={{ color: '#2563eb' }}>add vehicles</a></div>
                    ) : activeVehicles.map(v => {
                      const excluded = excludedVehicleIds.has(v.id)
                      const sug = v.pax_suggested || v.capacity || '?'
                      const max = v.pax_max || v.capacity || '?'
                      const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
                      return (
                        <div key={v.id}
                          onClick={() => setExcludedVehicleIds(prev => { const next = new Set(prev); excluded ? next.delete(v.id) : next.add(v.id); return next })}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: excluded ? '#f8fafc' : 'white', opacity: excluded ? 0.5 : 1, transition: 'opacity 0.12s' }}>
                          <input type="checkbox" checked={!excluded} readOnly style={{ width: '14px', height: '14px', accentColor: '#2563eb', flexShrink: 0, cursor: 'pointer' }} />
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '12px', color: '#0f172a', minWidth: '60px' }}>{v.id}</span>
                          <span style={{ fontSize: '11px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.driver_name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No driver</span>}</span>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{sug}/{max}</span>
                          {excluded && <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', flexShrink: 0 }}>OUT</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>{/* END LEFT COLUMN */}

                {/* RIGHT COLUMN — CREW */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div>
                        <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>👥 Crew</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>{selectedCrew.length} selected / {eligibleCrew.length} eligible</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setExcludedCrewIds(new Set())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8' }}>✓ All</button>
                        <button onClick={() => setExcludedCrewIds(new Set(eligibleCrew.map(c => c.id)))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>✗ None</button>
                        <button onClick={() => setCrewCallOverrides({})} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>Reset times</button>
                        <button onClick={() => setExpandedDepts(new Set(accordionKeys))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>Expand all</button>
                        <button onClick={() => setExpandedDepts(new Set())} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>Collapse</button>
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                      <input type="text" value={crewSearch} onChange={e => setCrewSearch(e.target.value)}
                        placeholder="Search crew by name or department…"
                        style={{ width: '100%', padding: '8px 32px 8px 32px', border: `1px solid ${crewSearch ? '#2563eb' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', background: crewSearch ? '#eff6ff' : 'white', color: '#0f172a' }} />
                      {crewSearch && <button onClick={() => setCrewSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#94a3b8', lineHeight: 1, padding: 0 }}>×</button>}
                    </div>
                    {crewSearch && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: filteredEligible.length === 0 ? '#dc2626' : '#2563eb', fontWeight: '600' }}>
                        {filteredEligible.length === 0 ? 'No crew found' : `${filteredEligible.length} match${filteredEligible.length !== 1 ? 'es' : ''}`}
                      </div>
                    )}
                  </div>

                  <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px' }}>
                    {eligibleCrew.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>No eligible crew</div>
        <div style={{ fontSize: '12px' }}>travel_status = PRESENT + hotel_status = CONFIRMED</div>
                      </div>
                    ) : accordionKeys.length === 0 && crewSearch ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                        <div style={{ fontWeight: '600' }}>No results for &quot;{crewSearch}&quot;</div>
                      </div>
                    ) : accordionKeys.map(deptKey => {
                      const deptCrew  = crewByDept[deptKey] || []
                      const deptLabel = deptKey === '__nodept__' ? '— No Department —' : deptKey
                      const expanded  = isDeptExpanded(deptKey)
                      const [bgC, txC] = deptColor(deptKey === '__nodept__' ? null : deptKey)
                      const deptCfg   = deptKey !== '__nodept__' ? (deptDestOverrides[deptKey] || {}) : {}
                      const deptEffDest = deptCfg.destId ?? destId
                      const deptEffCall = deptCfg.callMin ?? globalCallMin
                      const selectedInDept = deptCrew.filter(c => !excludedCrewIds.has(c.id)).length
                      const hasOvr = deptCfg.destId != null || (deptCfg.callMin != null && deptCfg.callMin !== globalCallMin)
                      return (
                        <div key={deptKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <div onClick={() => toggleDept(deptKey)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', cursor: 'pointer', background: hasOvr ? '#fdfbff' : '#f8fafc', userSelect: 'none' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: bgC, color: txC, flexShrink: 0 }}>{deptLabel}</span>
                            <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600', flexShrink: 0 }}>{selectedInDept}/{deptCrew.length}</span>
                            <span style={{ fontSize: '11px', color: hasOvr ? '#7c3aed' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              → {locMap[deptEffDest] || deptEffDest || '?'} · {minToHHMM(deptEffCall)}
                            </span>
                            <button onClick={e => { e.stopPropagation(); setExcludedCrewIds(prev => { const next = new Set(prev); deptCrew.forEach(c => next.delete(c.id)); return next }) }}
                              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8', flexShrink: 0 }}>✓</button>
                            <button onClick={e => { e.stopPropagation(); setExcludedCrewIds(prev => { const next = new Set(prev); deptCrew.forEach(c => next.add(c.id)); return next }) }}
                              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b', flexShrink: 0 }}>✗</button>
                          </div>
                          {expanded && deptCrew.map(c => {
                            const excluded    = excludedCrewIds.has(c.id)
                            const crewOvr     = crewCallOverrides[c.id]
                            const displayCall = crewOvr ?? deptEffCall
                            const hasCallOvr  = crewOvr != null
                            const destOvr     = deptCfg.destId && deptCfg.destId !== destId
                            return (
                              <div key={c.id} onClick={() => setEditingCrew(c)}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px 8px 36px', cursor: 'pointer', borderTop: '1px solid #f8fafc',
                                  background: excluded ? '#fafafa' : 'white', opacity: excluded ? 0.45 : 1, transition: 'background 0.1s' }}>
                                <input type="checkbox" checked={!excluded}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setExcludedCrewIds(prev => { const next = new Set(prev); e.target.checked ? next.delete(c.id) : next.add(c.id); return next })}
                                  style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.full_name}</span>
                                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locMap[c.hotel_id] || c.hotel_id || '—'}</span>
                                {destOvr && <span style={{ fontSize: '9px', color: '#7c3aed', fontWeight: '700', flexShrink: 0 }}>●</span>}
                                <span style={{ fontSize: '12px', fontWeight: '800', color: hasCallOvr ? '#d97706' : '#374151', flexShrink: 0, minWidth: '42px', textAlign: 'right' }}>
                                  {minToHHMM(displayCall)}{hasCallOvr && <span style={{ fontSize: '9px' }}>●</span>}
                                </span>
                                <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>›</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {eligibleCrew.length > 0 && (
                    <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                      <span><strong style={{ color: '#0f172a' }}>{selectedCrew.length}</strong> selected</span>
                      {excludedCrewIds.size > 0 && <span><strong style={{ color: '#94a3b8' }}>{excludedCrewIds.size}</strong> excluded</span>}
                      {Object.keys(crewCallOverrides).length > 0 && <span style={{ color: '#d97706', fontWeight: '600' }}>{Object.keys(crewCallOverrides).length} call override{Object.keys(crewCallOverrides).length !== 1 ? 's' : ''}</span>}
                      <span style={{ marginLeft: 'auto' }}>{[...new Set(selectedCrew.map(c => c.hotel_id).filter(Boolean))].length} hotels · {departments.length} depts</span>
                    </div>
                  )}
                </div>{/* END RIGHT COLUMN */}
              </div>
            )}

            {/* ════ STEP 2 — PREVIEW ════ */}
            {step === 2 && (
              <div>
                {/* Suggestions / Warnings */}
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {suggestions.map((s, i) => (
                      <div key={i} style={{ padding: '12px 16px', background: s.type === 'NO_VEHICLE' ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${s.type === 'NO_VEHICLE' ? '#fecaca' : '#fde68a'}`,
                        borderRadius: '9px', fontSize: '12px', color: s.type === 'NO_VEHICLE' ? '#b91c1c' : '#92400e', lineHeight: 1.6 }}>
                        {s.type === 'NO_VEHICLE' ? (
                          <>
                            <div style={{ fontWeight: '800', marginBottom: '4px' }}>
                              🚨 No vehicle for: <span style={{ color: '#7f1d1d' }}>{(s.crew || []).join(', ')}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#991b1b', marginBottom: '6px' }}>
                              📍 {locMap[s.hotelId] || s.hotelId} → {locMap[s.destId] || s.destId} · {minToHHMM(s.callMin)} call
                            </div>
                            {s.vehiclesWithRoom?.length > 0 && s.vehiclesWithRoom.map((v, vi) => (
                              <div key={vi} style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '2px' }}>
                                💡 <strong>{v.vehicleId}</strong> ({v.driver || 'no driver'}) has +{v.room} pax capacity — move manually in Step 2
                              </div>
                            ))}
                            {s.nearbyTrips?.length > 0 && s.nearbyTrips.map((n, ni) => (
                              <div key={ni} style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '2px' }}>
                                🔀 {locMap[s.hotelId] || s.hotelId} and <strong>{n.hotelName}</strong> are {n.duration} min apart — consider multi-pickup with <strong>{n.vehicleId}</strong> ({n.driver || 'no driver'})
                              </div>
                            ))}
                            {!s.vehiclesWithRoom?.length && !s.nearbyTrips?.length && (
                              <div style={{ fontSize: '11px', color: '#991b1b' }}>No spare capacity or nearby hotels found — add a vehicle or adjust pax_max.</div>
                            )}
                          </>
                        ) : (
                          <><strong>💡 Suggestion:</strong> {s.msg}</>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {createError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>❌ {createError}</div>
                )}

                {/* Stats bar */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>📋 Draft Plan</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{activeTrips}</strong> trip{activeTrips !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{totalPax}</strong> passengers</span>
                  {uniqueDestIds.length > 1 && <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#7c3aed' }}>{uniqueDestIds.length}</strong> destinations</span>}
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{date} · {globalCallTime} · {serviceType}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                    {uniqueDestIds.length === 1 ? <>Destination: <strong style={{ color: '#0f172a' }}>{destLabel}</strong></> : <strong style={{ color: '#7c3aed' }}>{destLabel}</strong>}
                  </span>
                </div>

                {draftTrips.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤔</div>
                    <div style={{ fontWeight: '700', marginBottom: '6px' }}>No trips generated</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                    {draftTrips.map(trip => (
                      <TripCard key={trip.key} trip={trip} locMap={locMap} routeMap={routeMap} allTrips={draftTrips}
                        onMoveCrew={(c, k) => setMoveTarget({ crew: c, tripKey: k })} />
                    ))}
                  </div>
                )}

                {moveTarget && (
                  <MoveCrewModal crewMember={moveTarget.crew} currentTripKey={moveTarget.tripKey}
                    trips={draftTrips} locMap={locMap} onMove={handleMoveCrew} onClose={() => setMoveTarget(null)} />
                )}
              </div>
            )}

            {/* ════ STEP 3 — DONE ════ */}
            {step === 3 && (
              <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center' }}>
                <div style={{ width: '90px', height: '90px', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', boxShadow: '0 8px 24px rgba(22,163,74,0.2)' }}>🚀</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>Trips Created!</div>
                <div style={{ fontSize: '15px', color: '#64748b', marginBottom: '4px' }}>
                  <strong style={{ color: '#0f172a', fontSize: '20px' }}>{createdCount}</strong> trips for <strong style={{ color: '#0f172a' }}>{date}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>{totalPax} passengers · {globalCallTime} · {serviceType}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '32px' }}>
                  {uniqueDestIds.length > 1
                    ? <><strong style={{ color: '#7c3aed' }}>{uniqueDestIds.length} destinations</strong>: {uniqueDestIds.map(id => locMap[id] || id).join(', ')}</>
                    : <>Destination: <strong>{destLabel}</strong></>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a href="/dashboard/trips" style={{ display: 'block', background: '#0f2340', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>📋 View Trips</a>
                  <a href="/dashboard/fleet" style={{ display: 'block', background: '#1e3a5f', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>🚦 Fleet Monitor</a>
                  <button onClick={() => { setStep(1); setDraftTrips([]); setSuggestions([]); setCreatedCount(0); setCreateError(null) }}
                    style={{ padding: '14px', borderRadius: '11px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                    🔄 New Rocket Run
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editingCrew && (
        <CrewQuickEditModal crew={editingCrew} deptDestOverrides={deptDestOverrides} crewCallOverrides={crewCallOverrides}
          excludedCrewIds={excludedCrewIds} globalCallMin={globalCallMin} globalDestId={destId} locMap={locMap}
          onUpdate={handleCrewModalUpdate} onClose={() => setEditingCrew(null)} />
      )}
    </div>
  )
}
