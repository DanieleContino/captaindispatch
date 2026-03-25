'use client'

/**
 * /dashboard/rocket — Generazione automatica trip
 *
 * Step 1 — Setup: data, destinazione (SET), call time globale,
 *           tabella crew con override call time individuale.
 * Step 2 — Preview: bozza trip per veicolo, drag/move crew,
 *           suggerimenti per pax_max, warning veicoli mancanti.
 * Step 3 — Conferma: crea trip + trip_passengers in Supabase.
 *
 * Regole algoritmo:
 *   - pax_suggested = limite default per veicolo (non superato automaticamente)
 *   - pax_max       = limite massimo (suggerito, mai automatico)
 *   - Raggruppamento: per hotel, poi per dipartimento
 *   - Se crew avanza: suggerimento visibile, non azione automatica
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase }   from '../../../lib/supabase'
import { useRouter }  from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

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

// ─── Utility ──────────────────────────────────────────────────
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

// ─── 🚀 Rocket Algorithm ──────────────────────────────────────
/**
 * Assegna crew ai veicoli rispettando:
 *   1. Raggruppamento per hotel (stesso hotel → stesso veicolo quando possibile)
 *   2. Priorità per dipartimento all'interno del gruppo hotel
 *   3. pax_suggested come limite default per veicolo
 *   4. Suggerimento (NON automatico) per pax_max quando il gruppo supera suggested
 *
 * Restituisce { draftTrips, suggestions }
 */
function runRocket({ crew, vehicles, routeMap, destId, globalCallMin, crewCallOverrides, excludedIds }) {
  // Filtra crew eligible
  const eligible = crew.filter(c =>
    !excludedIds.has(c.id) &&
    c.hotel_id &&
    ['IN', 'PRESENT'].includes(c.travel_status) &&
    c.hotel_status === 'CONFIRMED'
  )

  // Raggruppa per (hotel_id, callMin effettivo)
  const groupMap = {}
  for (const c of eligible) {
    const callMin = crewCallOverrides[c.id] ?? globalCallMin
    const key = `${c.hotel_id}::${callMin}`
    if (!groupMap[key]) groupMap[key] = { hotelId: c.hotel_id, callMin, list: [] }
    groupMap[key].list.push(c)
  }

  // Ordina gruppi: size DESC, poi callMin ASC
  const groups = Object.values(groupMap).sort((a, b) =>
    b.list.length !== a.list.length ? b.list.length - a.list.length : a.callMin - b.callMin
  )

  // Pool veicoli: solo attivi, ordinati per pax_suggested DESC
  const pool = [...vehicles]
    .filter(v => v.active)
    .sort((a, b) => (b.pax_suggested || b.capacity || 0) - (a.pax_suggested || a.capacity || 0))

  const draftTrips = []
  const suggestions = []
  let seq = 0

  for (const g of groups) {
    const routeKey  = `${g.hotelId}||${destId}`
    const dur       = routeMap[routeKey] ?? 30
    const pickupMin = g.callMin - dur

    // Ordina crew per dipartimento, poi nome
    const sorted = [...g.list].sort((a, b) =>
      (a.department || '').localeCompare(b.department || '') ||
      a.full_name.localeCompare(b.full_name)
    )

    let remaining = [...sorted]

    while (remaining.length > 0) {
      if (!pool.length) {
        suggestions.push({
          type: 'NO_VEHICLE',
          hotelId: g.hotelId,
          callMin: g.callMin,
          crew: remaining.map(c => c.full_name),
          msg: `${remaining.length} crew member(s) from this hotel couldn't be assigned — no vehicles available. Add a vehicle or use multi-pickup.`,
        })
        remaining = []
        break
      }

      const v         = pool.shift()
      const capSug    = v.pax_suggested || v.capacity || 6
      const capMax    = Math.max(capSug, v.pax_max || capSug)
      const toAssign  = remaining.splice(0, capSug)

      // Suggerisci aggiunta fino a pax_max (mai automatico)
      if (remaining.length > 0 && toAssign.length === capSug && capSug < capMax) {
        const addable = Math.min(capMax - capSug, remaining.length)
        if (addable > 0) {
          suggestions.push({
            type:      'CAN_ADD',
            tripKey:   `t${seq}`,
            vehicleId: v.id,
            addable,
            names:     remaining.slice(0, addable).map(c => c.full_name),
            msg:       `${v.id} can carry ${addable} more person(s) (pax_max=${capMax}): ${remaining.slice(0, addable).map(c => c.full_name).join(', ')}`,
          })
        }
      }

      draftTrips.push({
        key:         `t${seq++}`,
        vehicleId:   v.id,
        vehicle:     v,
        hotelId:     g.hotelId,
        destId,
        callMin:     g.callMin,
        pickupMin,
        durationMin: dur,
        crewList:    toAssign,
      })
    }
  }

  return { draftTrips, suggestions }
}

// ─── Move Crew Modal ──────────────────────────────────────────
function MoveCrewModal({ crewMember, currentTripKey, trips, onMove, onClose }) {
  const [target, setTarget] = useState('')
  const otherTrips = trips.filter(t => t.key !== currentTripKey)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '22px', width: '380px', maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>Move passenger</div>
        <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: '700', marginBottom: '4px' }}>{crewMember.full_name}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>{crewMember.department}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
          {otherTrips.map(t => {
            const cap = t.vehicle.pax_suggested || t.vehicle.capacity || 6
            const pax = t.crewList.length
            const over = pax >= cap
            return (
              <div key={t.key} onClick={() => setTarget(t.key)}
                style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === t.key ? '#2563eb' : '#e2e8f0'}`, background: target === t.key ? '#eff6ff' : 'white', cursor: 'pointer', transition: 'border-color 0.12s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', fontFamily: 'monospace' }}>{t.vehicleId}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: over ? '#b91c1c' : '#15803d' }}>
                    {pax}/{cap} pax {over ? '⚠' : ''}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {minToHHMM(t.pickupMin)} pickup · {t.vehicle.driver_name || 'No driver'}
                </div>
              </div>
            )
          })}

          {/* Rimuovi da tutti */}
          <div onClick={() => setTarget('__remove__')}
            style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === '__remove__' ? '#dc2626' : '#e2e8f0'}`, background: target === '__remove__' ? '#fef2f2' : 'white', cursor: 'pointer' }}>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#dc2626' }}>↩ Remove from all trips</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            Cancel
          </button>
          <button onClick={() => { if (target) { onMove(crewMember, currentTripKey, target); onClose() } }}
            disabled={!target}
            style={{ flex: 2, padding: '10px', borderRadius: '9px', border: 'none', background: target ? '#2563eb' : '#e2e8f0', color: target ? 'white' : '#94a3b8', cursor: target ? 'pointer' : 'default', fontSize: '13px', fontWeight: '800' }}>
            Move →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Trip Card (Step 2) ───────────────────────────────────────
function TripCard({ trip, locMap, allTrips, onMoveCrew }) {
  const [open, setOpen] = useState(true)

  const capSug  = trip.vehicle.pax_suggested || trip.vehicle.capacity || 6
  const capMax  = Math.max(capSug, trip.vehicle.pax_max || capSug)
  const pax     = trip.crewList.length
  const over    = pax > capSug
  const atMax   = pax >= capMax

  const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
  const icon = TYPE_ICON[trip.vehicle.vehicle_type] || '🚐'

  const paxColor = atMax ? '#b91c1c' : over ? '#d97706' : pax === capSug ? '#15803d' : '#64748b'
  const paxBg    = atMax ? '#fee2e2' : over ? '#fffbeb' : pax === capSug ? '#dcfce7' : '#f1f5f9'

  return (
    <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* Card header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#fafafa', borderBottom: open ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '15px', color: '#0f172a' }}>{trip.vehicleId}</div>
            <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.vehicle.driver_name || 'No driver assigned'} · {trip.vehicle.vehicle_type}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', background: paxBg, color: paxColor, border: `1px solid ${paxColor}20` }}>
            {pax}/{capSug}
            {capMax > capSug && <span style={{ color: '#94a3b8', fontWeight: '600' }}> (max {capMax})</span>}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {open && (
        <>
          {/* Route + timing */}
          <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
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
          </div>

          {/* Crew list */}
          {pax === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
              No passengers — vehicle is empty
            </div>
          ) : (
            <div>
              {trip.crewList.map(c => {
                const [bgC, textC] = deptColor(c.department)
                return (
                  <div key={c.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid #f8fafc', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: bgC, color: textC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '10px', flexShrink: 0 }}>
                        {(c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department || '—'}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onMoveCrew(c, trip.key)}
                      style={{ flexShrink: 0, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap' }}>
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

// ─── Main Page ─────────────────────────────────────────────────
export default function RocketPage() {
  const router = useRouter()
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  // Data
  const [allCrew,    setAllCrew]    = useState([])
  const [vehicles,   setVehicles]   = useState([])
  const [locations,  setLocations]  = useState([])
  const [routeMap,   setRouteMap]   = useState({})

  // Step 1 inputs
  const [step,             setStep]             = useState(1)
  const [date,             setDate]             = useState(isoToday())
  const [destId,           setDestId]           = useState('')
  const [globalCallTime,   setGlobalCallTime]   = useState('07:00')
  const [serviceType,      setServiceType]      = useState('Hotel Run')
  const [crewCallOverrides, setCrewCallOverrides] = useState({})   // { crewId: callMin }
  const [excludedIds,      setExcludedIds]      = useState(new Set())

  // Step 2
  const [draftTrips,  setDraftTrips]  = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [moveTarget,  setMoveTarget]  = useState(null)   // { crew, tripKey }

  // Step 3
  const [createdCount, setCreatedCount] = useState(0)
  const [createError,  setCreateError]  = useState(null)

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUser(user)
    })
  }, [router])

  // Load data
  const loadData = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)

    const [cR, vR, lR, rR] = await Promise.all([
      supabase.from('crew')
        .select('id,full_name,department,hotel_id,travel_status,hotel_status')
        .eq('production_id', PRODUCTION_ID)
        .in('travel_status', ['IN', 'PRESENT'])
        .eq('hotel_status', 'CONFIRMED')
        .order('department').order('full_name'),
      supabase.from('vehicles')
        .select('id,vehicle_type,capacity,pax_suggested,pax_max,driver_name,sign_code,active')
        .eq('production_id', PRODUCTION_ID)
        .eq('active', true)
        .order('vehicle_type').order('id'),
      supabase.from('locations')
        .select('id,name,is_hub')
        .eq('production_id', PRODUCTION_ID)
        .order('name'),
      supabase.from('routes')
        .select('from_id,to_id,duration_min')
        .eq('production_id', PRODUCTION_ID),
    ])

    setAllCrew(cR.data || [])
    setVehicles(vR.data || [])
    setLocations(lR.data || [])

    const rm = {}
    for (const r of (rR.data || [])) rm[`${r.from_id}||${r.to_id}`] = r.duration_min
    setRouteMap(rm)

    // Auto-seleziona prima location non-hub come destinazione
    const sets = (lR.data || []).filter(l => !l.is_hub)
    if (sets.length && !destId) setDestId(sets[0].id)

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (user) loadData() }, [user, loadData])

  const locMap       = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const globalCallMin = hhmmToMin(globalCallTime) ?? 420  // default 07:00
  const eligibleCrew = allCrew.filter(c => c.hotel_id)
  const selectedCrew = eligibleCrew.filter(c => !excludedIds.has(c.id))
  const activeVehicles = vehicles.filter(v => v.active)

  // ── Step 1 → Step 2: lancia algoritmo ──
  function handleLaunch() {
    if (!destId || selectedCrew.length === 0) return
    const result = runRocket({
      crew: allCrew,
      vehicles,
      routeMap,
      destId,
      globalCallMin,
      crewCallOverrides,
      excludedIds,
    })
    setDraftTrips(result.draftTrips)
    setSuggestions(result.suggestions)
    setCreateError(null)
    setStep(2)
  }

  // ── Step 2: sposta crew ──
  function handleMoveCrew(crewMember, fromKey, toKey) {
    setDraftTrips(prev => {
      const next = prev.map(t => ({ ...t, crewList: [...t.crewList] }))
      const from = next.find(t => t.key === fromKey)
      if (from) from.crewList = from.crewList.filter(c => c.id !== crewMember.id)
      if (toKey !== '__remove__') {
        const to = next.find(t => t.key === toKey)
        if (to && !to.crewList.find(c => c.id === crewMember.id)) {
          to.crewList = [...to.crewList, crewMember]
        }
      }
      return next
    })
  }

  // ── Step 2 → Step 3: conferma e crea trip ──
  async function handleConfirm() {
    setSaving(true)
    setCreateError(null)

    const mm    = pad2(new Date().getMonth() + 1)
    const dd2   = pad2(new Date().getDate())
    const prefix = `R_${mm}${dd2}`

    let created = 0
    for (let i = 0; i < draftTrips.length; i++) {
      const t = draftTrips[i]
      if (!t.crewList.length) continue

      const tripId  = `${prefix}_${pad2(i + 1)}`
      const startDt = localDtFromMin(date, t.pickupMin)
      const endDt   = localDtFromMin(date, t.callMin)

      const row = {
        production_id: PRODUCTION_ID,
        trip_id:       tripId,
        date,
        vehicle_id:    t.vehicleId,
        driver_name:   t.vehicle.driver_name  || null,
        sign_code:     t.vehicle.sign_code    || null,
        capacity:      t.vehicle.capacity     || null,
        pickup_id:     t.hotelId,
        dropoff_id:    t.destId,
        call_min:      t.callMin,
        pickup_min:    t.pickupMin,
        duration_min:  t.durationMin,
        start_dt:      startDt,
        end_dt:        endDt,
        service_type:  serviceType,
        pax_count:     t.crewList.length,
        status:        'PLANNED',
      }

      const { data: ins, error: insErr } = await supabase
        .from('trips').insert(row).select('id').single()

      if (insErr) {
        setCreateError(`Trip ${tripId}: ${insErr.message}`)
        setSaving(false)
        return
      }

      if (ins?.id && t.crewList.length > 0) {
        const { error: pErr } = await supabase.from('trip_passengers').insert(
          t.crewList.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
        )
        if (pErr) { setCreateError(pErr.message); setSaving(false); return }
      }

      created++
    }

    setCreatedCount(created)
    setSaving(false)
    setStep(3)
  }

  // ── Render ──────────────────────────────────────────────────
  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading…
    </div>
  )

  const totalPax        = draftTrips.reduce((s, t) => s + t.crewList.length, 0)
  const activeTrips     = draftTrips.filter(t => t.crewList.length > 0).length
  const hasNoProdId     = !PRODUCTION_ID

  const stepLabel = ['', 'Setup', 'Preview', 'Done']

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Top nav ── */}
      <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{
                padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                color:      p === '/dashboard/rocket' ? 'white'    : '#94a3b8',
                background: p === '/dashboard/rocket' ? '#1e3a5f'  : 'transparent',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}>{l}</a>
            ))}
          </nav>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
          Sign out
        </button>
      </div>

      {/* ── Sub-toolbar ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '22px' }}>🚀</span>
          <span style={{ fontWeight: '900', fontSize: '17px', color: '#0f172a' }}>Rocket</span>
          <span style={{ fontWeight: '400', fontSize: '13px', color: '#94a3b8' }}>Trip Generator</span>

          {/* Step pills */}
          <div style={{ display: 'flex', gap: '3px', marginLeft: '8px' }}>
            {[1, 2, 3].map(n => {
              const active = step === n
              const done   = step > n
              return (
                <div key={n} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                  background: active ? '#0f2340' : done ? '#dcfce7' : '#f1f5f9',
                  color:      active ? 'white'   : done ? '#15803d' : '#94a3b8',
                  border:    `1px solid ${active ? '#0f2340' : done ? '#86efac' : '#e2e8f0'}`,
                }}>
                  <span>{done ? '✓' : n}</span>
                  <span>{stepLabel[n]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right — actions */}
        {step === 1 && !loading && (
          <button
            onClick={handleLaunch}
            disabled={!destId || selectedCrew.length === 0 || activeVehicles.length === 0}
            style={{
              background: (!destId || selectedCrew.length === 0 || activeVehicles.length === 0)
                ? '#e2e8f0'
                : 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: (!destId || selectedCrew.length === 0) ? '#94a3b8' : 'white',
              border: 'none', borderRadius: '9px', padding: '8px 20px',
              fontSize: '14px', fontWeight: '900', cursor: (!destId || selectedCrew.length === 0) ? 'default' : 'pointer',
              letterSpacing: '-0.3px', boxShadow: (!destId || selectedCrew.length === 0) ? 'none' : '0 3px 12px rgba(37,99,235,0.35)',
            }}>
            🚀 Launch Rocket ({selectedCrew.length} crew · {activeVehicles.length} vehicles)
          </button>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {activeTrips} trip{activeTrips !== 1 ? 's' : ''} · {totalPax} pax
            </span>
            <button
              onClick={() => setStep(1)}
              style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
              ← Edit Setup
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || activeTrips === 0}
              style={{
                background: (saving || activeTrips === 0) ? '#94a3b8' : '#16a34a',
                color: 'white', border: 'none', borderRadius: '9px', padding: '8px 20px',
                cursor: (saving || activeTrips === 0) ? 'wait' : 'pointer',
                fontSize: '13px', fontWeight: '800',
                boxShadow: (saving || activeTrips === 0) ? 'none' : '0 3px 12px rgba(22,163,74,0.35)',
              }}>
              {saving ? '⏳ Creating…' : `✅ Confirm ${activeTrips} trip${activeTrips !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>

        {hasNoProdId && (
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
            {/* ════════════════════════════════════════════════
                STEP 1 — SETUP
            ════════════════════════════════════════════════ */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* ── Config ── */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '20px 24px' }}>
                  <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚙️ Trip Configuration
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '16px' }}>

                    {/* Date */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Date</label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '700', boxSizing: 'border-box', color: '#0f172a' }} />
                    </div>

                    {/* Destination */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Destination (SET / Work Location)</label>
                      <select value={destId} onChange={e => setDestId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: `1px solid ${!destId ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontWeight: '600', boxSizing: 'border-box', background: 'white', color: destId ? '#0f172a' : '#94a3b8' }}>
                        <option value="">— Select destination —</option>
                        <optgroup label="Locations / Sets">
                          {locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </optgroup>
                        <optgroup label="Hubs / Airports">
                          {locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>✈ {l.name}</option>)}
                        </optgroup>
                      </select>
                    </div>

                    {/* Global call time */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>
                        Call Time — arrive at destination
                      </label>
                      <input type="time" value={globalCallTime} onChange={e => setGlobalCallTime(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '18px', fontWeight: '900', boxSizing: 'border-box', textAlign: 'center', color: '#0f172a', background: '#fffbeb', borderColor: '#fde68a' }} />
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Each vehicle departs hotel = call − route duration</div>
                    </div>

                    {/* Service type */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Service Type</label>
                      <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', boxSizing: 'border-box', background: 'white', color: '#0f172a' }}>
                        {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                  </div>
                </div>

                {/* ── Fleet summary ── */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '14px 20px' }}>
                  <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '10px' }}>
                    🚐 Fleet available — {activeVehicles.length} active vehicle{activeVehicles.length !== 1 ? 's' : ''}
                  </div>
                  {activeVehicles.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#dc2626' }}>No active vehicles — <a href="/dashboard/vehicles" style={{ color: '#2563eb' }}>add vehicles</a></div>
                  ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {activeVehicles.map(v => {
                        const sug = v.pax_suggested || v.capacity || '?'
                        const max = v.pax_max || v.capacity || '?'
                        const noConfig = !v.pax_suggested
                        return (
                          <div key={v.id} style={{ display: 'flex', align: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', border: `1px solid ${noConfig ? '#fde68a' : '#e2e8f0'}`, background: noConfig ? '#fffbeb' : '#f8fafc', fontSize: '12px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a' }}>{v.id}</span>
                            <span style={{ color: '#94a3b8' }}>{v.vehicle_type}</span>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '5px', fontWeight: '700', fontSize: '11px' }}>
                              {sug}/{max}
                            </span>
                            {noConfig && <span style={{ color: '#d97706', fontSize: '10px', fontWeight: '700' }}>no pax_suggested</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {activeVehicles.some(v => !v.pax_suggested) && (
                    <div style={{ fontSize: '11px', color: '#d97706', fontWeight: '600', marginTop: '8px' }}>
                      ⚠ Some vehicles are missing <strong>pax_suggested</strong>/<strong>pax_max</strong>. Run <code style={{ background: '#fef9c3', padding: '1px 4px', borderRadius: '3px' }}>scripts/migrate-rocket-columns.sql</code> or set them in <a href="/dashboard/vehicles" style={{ color: '#2563eb' }}>Vehicles</a>.
                    </div>
                  )}
                </div>

                {/* ── Crew table ── */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>👥 Crew</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '10px' }}>
                        {selectedCrew.length} selected / {eligibleCrew.length} eligible (IN/PRESENT + CONFIRMED)
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setExcludedIds(new Set())}
                        style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>
                        ✓ All
                      </button>
                      <button
                        onClick={() => setExcludedIds(new Set(eligibleCrew.map(c => c.id)))}
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                        ✗ None
                      </button>
                      <button
                        onClick={() => setCrewCallOverrides({})}
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                        Reset times
                      </button>
                    </div>
                  </div>

                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 130px 1fr 120px', padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    <div />
                    <div>Name</div>
                    <div>Department</div>
                    <div>Hotel / Pickup</div>
                    <div>Call Time ↓</div>
                  </div>

                  {/* Rows */}
                  <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    {eligibleCrew.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>No eligible crew found</div>
                        <div style={{ fontSize: '12px' }}>Crew must have <strong>travel_status = IN/PRESENT</strong> and <strong>hotel_status = CONFIRMED</strong></div>
                      </div>
                    ) : eligibleCrew.map((c, idx) => {
                      const excluded    = excludedIds.has(c.id)
                      const override    = crewCallOverrides[c.id]
                      const displayMin  = override ?? globalCallMin
                      const [bgC, textC] = deptColor(c.department)

                      return (
                        <div key={c.id} style={{
                          display: 'grid', gridTemplateColumns: '32px 1fr 130px 1fr 120px',
                          padding: '9px 20px', borderBottom: idx < eligibleCrew.length - 1 ? '1px solid #f8fafc' : 'none',
                          alignItems: 'center', opacity: excluded ? 0.45 : 1,
                          background: excluded ? '#f8fafc' : 'white',
                          transition: 'opacity 0.15s',
                        }}>
                          {/* Checkbox */}
                          <div>
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={e => setExcludedIds(prev => {
                                const next = new Set(prev)
                                e.target.checked ? next.delete(c.id) : next.add(c.id)
                                return next
                              })}
                              style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                          </div>
                          {/* Name */}
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{c.full_name}</div>
                          {/* Department */}
                          <div>
                            {c.department && (
                              <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', background: bgC, color: textC }}>
                                {c.department}
                              </span>
                            )}
                            {!c.department && <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}
                          </div>
                          {/* Hotel */}
                          <div style={{ fontSize: '11px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                            {locMap[c.hotel_id] || c.hotel_id || '—'}
                          </div>
                          {/* Call time */}
                          <div>
                            <input
                              type="time"
                              value={minToHHMM(displayMin)}
                              onChange={e => {
                                const m = hhmmToMin(e.target.value)
                                if (m === null) return
                                if (m === globalCallMin) {
                                  setCrewCallOverrides(prev => { const n = { ...prev }; delete n[c.id]; return n })
                                } else {
                                  setCrewCallOverrides(prev => ({ ...prev, [c.id]: m }))
                                }
                              }}
                              style={{
                                width: '100px', padding: '5px 8px',
                                border: `1px solid ${override != null ? '#fde68a' : '#e2e8f0'}`,
                                borderRadius: '7px', fontSize: '13px', fontWeight: '800',
                                background: override != null ? '#fffbeb' : 'white',
                                textAlign: 'center', color: '#0f172a',
                              }}
                            />
                            {override != null && (
                              <button
                                onClick={() => setCrewCallOverrides(prev => { const n = { ...prev }; delete n[c.id]; return n })}
                                style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: '0' }}
                                title="Reset to global">↩</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer summary */}
                  {eligibleCrew.length > 0 && (
                    <div style={{ padding: '10px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '16px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                      <span><strong style={{ color: '#0f172a' }}>{selectedCrew.length}</strong> selected</span>
                      {excludedIds.size > 0 && <span><strong style={{ color: '#94a3b8' }}>{excludedIds.size}</strong> excluded</span>}
                      {Object.keys(crewCallOverrides).length > 0 && (
                        <span style={{ color: '#d97706', fontWeight: '600' }}>
                          {Object.keys(crewCallOverrides).length} individual call time override{Object.keys(crewCallOverrides).length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto' }}>
                        {[...new Set(selectedCrew.map(c => c.hotel_id).filter(Boolean))].length} hotel{[...new Set(selectedCrew.map(c => c.hotel_id).filter(Boolean))].length !== 1 ? 's' : ''} · {[...new Set(selectedCrew.map(c => c.department).filter(Boolean))].length} departments
                      </span>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ════════════════════════════════════════════════
                STEP 2 — PREVIEW & EDIT
            ════════════════════════════════════════════════ */}
            {step === 2 && (
              <div>

                {/* Suggestions / warnings */}
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {suggestions.map((s, i) => (
                      <div key={i} style={{
                        padding: '10px 16px',
                        background: s.type === 'NO_VEHICLE' ? '#fef2f2' : '#fffbeb',
                        border:    `1px solid ${s.type === 'NO_VEHICLE' ? '#fecaca' : '#fde68a'}`,
                        borderRadius: '9px', fontSize: '12px',
                        color: s.type === 'NO_VEHICLE' ? '#b91c1c' : '#92400e',
                        fontWeight: '600', lineHeight: 1.5,
                      }}>
                        {s.type === 'NO_VEHICLE'
                          ? <><strong>🚨 No vehicle available:</strong> {s.msg}</>
                          : <><strong>💡 Suggestion:</strong> {s.msg}</>
                        }
                      </div>
                    ))}
                  </div>
                )}

                {/* Create error */}
                {createError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
                    ❌ {createError}
                  </div>
                )}

                {/* Stats bar */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>📋 Draft Plan</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{activeTrips}</strong> trip{activeTrips !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{totalPax}</strong> passengers</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{date} · {globalCallTime} call time · {serviceType}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                    Destination: <strong style={{ color: '#0f172a' }}>{locMap[destId] || destId}</strong>
                  </span>
                </div>

                {/* Trip grid */}
                {draftTrips.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤔</div>
                    <div style={{ fontWeight: '700', marginBottom: '6px' }}>No trips generated</div>
                    <div style={{ fontSize: '12px' }}>No eligible crew or no vehicles available. Go back and check your setup.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                    {draftTrips.map(trip => (
                      <TripCard
                        key={trip.key}
                        trip={trip}
                        locMap={locMap}
                        allTrips={draftTrips}
                        onMoveCrew={(c, k) => setMoveTarget({ crew: c, tripKey: k })}
                      />
                    ))}
                  </div>
                )}

                {/* Move modal */}
                {moveTarget && (
                  <MoveCrewModal
                    crewMember={moveTarget.crew}
                    currentTripKey={moveTarget.tripKey}
                    trips={draftTrips}
                    onMove={handleMoveCrew}
                    onClose={() => setMoveTarget(null)}
                  />
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════
                STEP 3 — DONE
            ════════════════════════════════════════════════ */}
            {step === 3 && (
              <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center' }}>
                <div style={{ width: '90px', height: '90px', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', boxShadow: '0 8px 24px rgba(22,163,74,0.2)' }}>
                  🚀
                </div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>Trips Created!</div>
                <div style={{ fontSize: '15px', color: '#64748b', marginBottom: '4px' }}>
                  <strong style={{ color: '#0f172a', fontSize: '20px' }}>{createdCount}</strong> trips for <strong style={{ color: '#0f172a' }}>{date}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
                  {totalPax} passengers · call time {globalCallTime} · {serviceType}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '32px' }}>
                  Destination: <strong>{locMap[destId] || destId}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a href="/dashboard/trips"
                    style={{ display: 'block', background: '#0f2340', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>
                    📋 View Trips
                  </a>
                  <a href="/dashboard/fleet"
                    style={{ display: 'block', background: '#1e3a5f', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>
                    🚦 Fleet Monitor
                  </a>
                  <button
                    onClick={() => { setStep(1); setDraftTrips([]); setSuggestions([]); setCreatedCount(0); setCreateError(null) }}
                    style={{ padding: '14px', borderRadius: '11px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                    🔄 New Rocket Run
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
