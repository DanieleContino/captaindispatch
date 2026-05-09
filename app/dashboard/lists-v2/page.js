'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SectionsManagerSidebar } from '../../../lib/SectionsManagerSidebar'

// ─── Utility ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDateLong(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function fmtNow() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function fmtNowDate() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`
}

// ─── formatCrewName: "John Smith" → "Smith J." | "Mary Jane Watson" → "Watson M." ──
function formatCrewName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const initial = parts[0][0].toUpperCase()
  return `${last} ${initial}.`
}

// ─── baseTripId: strip lettera finale (es. R_0326_01A → R_0326_01) ──
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }

// ─── Raggruppa trip per baseTripId + vehicle_id ──
function groupByTripId(tripRows) {
  const map = {}
  for (const t of tripRows) {
    const key = baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__')
    if (!map[key]) {
      map[key] = {
        trip_id:     baseTripId(t.trip_id),
        vehicle_id:  t.vehicle_id,
        driver_name: t.driver_name,
        sign_code:   t.sign_code,
        capacity:    t.capacity,
        pickup_id:   t.pickup_id,
        pickup_min:  t.pickup_min,
        call_min:    t.call_min,
        arr_time:       t.arr_time,
        flight_no:      t.flight_no,
        terminal:       t.terminal,
        transfer_class: t.transfer_class,
        notes:          t.notes,
        rows:           [t],
      }
    } else {
      map[key].rows.push(t)
      // Accumula notes e terminal se presenti in più rows
      if (t.notes && !map[key].notes) map[key].notes = t.notes
      if (t.terminal && !map[key].terminal) map[key].terminal = t.terminal
      if (t.pickup_min != null && (map[key].pickup_min == null || t.pickup_min < map[key].pickup_min)) {
        map[key].pickup_min = t.pickup_min
      }
      if (t.call_min != null && (map[key].call_min == null || t.call_min < map[key].call_min)) {
        map[key].call_min = t.call_min
      }
    }
  }
  return Object.values(map).sort((a, b) =>
    (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
  )
}

// ─── Riga tabella trip ─────────────────────────────────────────
function TripTableRow({ group, locsMap, sectionColor, sections, moveMenuOpenFor, setMoveMenuOpenFor, onAssign }) {
  const dragId = 'trip::' + group.trip_id + '::' + (group.vehicle_id || 'none')
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { group },
  })

  const pickupTime = minToHHMM(group.pickup_min ?? group.call_min)
  const callTime   = minToHHMM(group.call_min)
  const showCall   = callTime && callTime !== pickupTime && callTime !== '–'
  const totalPax   = group.rows.reduce((s, r) => s + (r.pax_count || 0), 0)

  // Passengers across all rows (multi-stop merged)
  const allPax = group.rows.flatMap(r =>
    r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
  )

  // Pickup / Dropoff: if multi-stop, show first leg's pickup and last leg's dropoff
  const firstRow = group.rows[0]
  const lastRow  = group.rows[group.rows.length - 1]
  const pickupLoc  = locsMap[firstRow.pickup_id]
  const pickupName = typeof pickupLoc === 'object' ? pickupLoc.name : pickupLoc || firstRow.pickup_id || '–'
  const dropoffLoc  = locsMap[lastRow.dropoff_id]
  const dropoffName = typeof dropoffLoc === 'object' ? dropoffLoc.name : dropoffLoc || lastRow.dropoff_id || '–'

  // Flight info on dropoff side
  const transferClass = group.transfer_class
  const showFlight = (transferClass === 'ARRIVAL' || transferClass === 'DEPARTURE')
                     && (group.flight_no || group.arr_time)
  const flightArrTime = group.arr_time ? group.arr_time.slice(0, 5) : null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="trip-row"
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        display: 'grid',
        gridTemplateColumns: '140px 130px 70px 1fr 160px 160px',
        gap: '0 8px',
        alignItems: 'flex-start',
        padding: '8px 14px',
        borderBottom: '1px solid #e2e8f0',
        background: 'white',
        pageBreakInside: 'avoid',
        fontSize: '12px',
        lineHeight: 1.4,
        position: 'relative',
      }}
    >
      {/* Vehicle */}
      <div style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {group.vehicle_id || '—'}
      </div>

      {/* Driver + phone */}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.driver_name || '—'}
        </div>
        {group.rows[0]?.driver_phone && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
            {group.rows[0].driver_phone}
          </div>
        )}
      </div>

      {/* Time (pickup, with call below if different) */}
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px' }}>{pickupTime}</div>
        {showCall && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
            call {callTime}
          </div>
        )}
      </div>

      {/* Passengers (with role) + (PAX/CAP) inline */}
      <div style={{ minWidth: 0 }}>
        {allPax.length > 0 ? (
          <>
            {allPax.map((p, i) => {
              // p is "FullName (Role)" — extract role if present
              const m = p.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
              const name = m ? m[1].trim() : p
              const role = m ? m[2].trim() : null
              const formatted = formatCrewName(name)
              return (
                <div key={i} style={{ fontSize: '11.5px', lineHeight: 1.45 }}>
                  <span style={{ color: '#0f172a', fontWeight: '500' }}>{formatted}</span>
                  {role && <span style={{ color: '#64748b' }}> · {role}</span>}
                </div>
              )
            })}
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontWeight: '500' }}>
              ({totalPax}{group.capacity ? '/' + group.capacity : ''})
            </div>
          </>
        ) : (
          <span style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>no pax</span>
        )}
      </div>

      {/* From */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pickupName}
        </div>
        {pickupLoc && typeof pickupLoc === 'object' && pickupLoc.pickup_point && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pickupLoc.pickup_point}
          </div>
        )}
      </div>

      {/* To + Move-to fallback */}
      <div style={{ minWidth: 0, position: 'relative' }}>
        <div style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dropoffName}
        </div>
        {showFlight && (
          <div style={{ fontSize: '10px', color: '#1d4ed8', marginTop: '2px', fontWeight: '600' }}>
            {group.flight_no || ''}{group.flight_no && flightArrTime ? ' · ' : ''}{flightArrTime || ''}
            {group.terminal && <span style={{ color: '#64748b' }}> · {group.terminal}</span>}
          </div>
        )}

        {/* Move-to button (fallback for touch devices) */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            const k = group.trip_id + '::' + (group.vehicle_id || 'none')
            setMoveMenuOpenFor(moveMenuOpenFor === k ? null : k)
          }}
          className="no-print"
          style={{
            marginTop: '4px',
            padding: '2px 6px', borderRadius: '4px',
            border: '1px solid #e2e8f0', background: 'white',
            fontSize: '9px', fontWeight: '600', color: '#64748b',
            cursor: 'pointer',
          }}>
          Move to
        </button>
        {moveMenuOpenFor === (group.trip_id + '::' + (group.vehicle_id || 'none')) && (
          <>
            <div onClick={() => setMoveMenuOpenFor(null)}
              className="no-print"
              style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            <div className="no-print" style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '2px',
              background: 'white', border: '1px solid #cbd5e1',
              borderRadius: '7px', padding: '4px',
              minWidth: '180px', zIndex: 61,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              textAlign: 'left',
            }}>
              {sections.length === 0 ? (
                <div style={{ padding: '6px 10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                  No sections yet. Use "Manage sections" first.
                </div>
              ) : sections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onAssign(group, s.id)}
                  style={{
                    display: 'block', width: '100%',
                    padding: '5px 10px', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    fontSize: '12px',
                    fontWeight: s.parent_id ? '500' : '700',
                    color: '#0f172a',
                    paddingLeft: s.parent_id ? '20px' : '10px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {s.parent_id ? s.name : s.name.toUpperCase()}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => onAssign(group, null)}
                  style={{
                    display: 'block', width: '100%',
                    padding: '5px 10px', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    fontSize: '11px', color: '#dc2626', cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  Unassign
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Transport List Header ─────────────────────────────────────
function TransportListHeader({ production, date }) {
  const prod = production || {}

  // Format date for display
  const dateDisplay = fmtDateLong(date)

  // General call time
  const callTime = prod.general_call_time
    ? prod.general_call_time.slice(0, 5)
    : '–'

  // Set bar text
  const setLabel = [prod.set_location, prod.set_address].filter(Boolean).join(', ') || '–'
  const basecampLabel = prod.basecamp || '–'

  const borderColor = '#e2e8f0'
  const bgSecondary = '#f8fafc'
  const textPrimary = '#0f172a'
  const textSecondary = '#64748b'
  const textTertiary = '#94a3b8'

  // Check if any contacts exist
  const hasContacts = prod.director || prod.producer || prod.production_manager || 
                      prod.production_coordinator || prod.transportation_coordinator || 
                      prod.transportation_captain || prod.production_office_phone

  return (
    <>
      {/* Header 2 colonne: 70% SX / 30% DX */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: hasContacts ? '7fr 3fr' : '1fr',
        gap: '10px',
        padding: '8px 10px', 
        background: '#f9fafb', 
        borderBottom: '1px solid #e5e7eb', 
        fontSize: '10px', 
        lineHeight: 1.5, 
        marginBottom: '10px' 
      }}>
        {/* COLONNA SINISTRA (70%) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          {prod.logo_url && (
            <img
              src={prod.logo_url}
              alt="logo"
              style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', padding: '3px', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            {/* EDIT 2.6 — DIG-style large uppercase title */}
            <div style={{ fontSize: '20px', fontWeight: '700', color: textPrimary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              Transport list — {prod.name || 'Production'}
              <span style={{
                display: 'inline-block',
                fontSize: '8px',
                background: '#fef2f2',
                color: '#dc2626',
                padding: '2px 6px',
                borderRadius: '3px',
                marginLeft: '8px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                verticalAlign: 'middle',
              }}>
                CONFIDENTIAL
              </span>
            </div>
            {/* EDIT 2.7 — tighter secondary line */}
            <div style={{ color: textSecondary, fontSize: '11px', marginTop: '2px' }}>
              {dateDisplay} · Call: <strong style={{ color: textPrimary }}>{callTime}</strong>
            </div>
            {(setLabel !== '–' || basecampLabel !== '–') && (
              <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: `1px solid ${borderColor}`, fontSize: '9px', color: textSecondary }}>
                {setLabel !== '–' && <span>🎬 Set: <strong style={{ color: textPrimary }}>{setLabel}</strong></span>}
                {setLabel !== '–' && basecampLabel !== '–' && <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>}
                {basecampLabel !== '–' && <span>🏕 Basecamp: <strong style={{ color: textPrimary }}>{basecampLabel}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {/* COLONNA DESTRA (30%) - Solo se ci sono contatti */}
        {hasContacts && (
          <div style={{
            background: bgSecondary,
            padding: '6px 8px',
            borderRadius: '5px',
            fontSize: '8px',
            lineHeight: 1.4,
            color: textSecondary,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {prod.director && (
              <div><strong style={{ color: textPrimary, fontWeight: '600' }}>Director:</strong> {prod.director}</div>
            )}
            {prod.producer && (
              <div><strong style={{ color: textPrimary, fontWeight: '600' }}>Producer:</strong> {prod.producer}</div>
            )}
            {prod.production_manager && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Production Manager:</strong> {prod.production_manager}
                {prod.production_manager_phone && <span style={{ color: textTertiary }}> · 📱 {prod.production_manager_phone}</span>}
              </div>
            )}
            {prod.production_coordinator && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Production Coordinator:</strong> {prod.production_coordinator}
                {prod.production_coordinator_phone && <span style={{ color: textTertiary }}> · 📱 {prod.production_coordinator_phone}</span>}
              </div>
            )}
            {prod.transportation_coordinator && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Transport Coordinator:</strong> {prod.transportation_coordinator}
                {prod.transportation_coordinator_phone && <span style={{ color: textTertiary }}> · 📱 {prod.transportation_coordinator_phone}</span>}
              </div>
            )}
            {prod.transportation_captain && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Captain:</strong> {prod.transportation_captain}
                {prod.transportation_captain_phone && <span style={{ color: textTertiary }}> · 📱 {prod.transportation_captain_phone}</span>}
              </div>
            )}
            {prod.production_office_phone && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Office:</strong> 📱 {prod.production_office_phone}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Transport List Footer ─────────────────────────────────────
function TransportListFooter() {
  const borderColor = '#e2e8f0'
  const bgSecondary = '#f8fafc'
  const textTertiary = '#94a3b8'
  const radius = '10px'

  return (
    <div className="sticky-footer" style={{
      border: `0.5px solid ${borderColor}`,
      borderRadius: radius,
      overflow: 'hidden',
      marginTop: 'auto',
      position: 'sticky',
      bottom: 0,
      zIndex: 10,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '5px 14px',
        background: bgSecondary,
        fontSize: '10px',
        color: textTertiary,
      }}>
        <span>Confidential — Not for Distribution</span>
        <span style={{ textAlign: 'center' }}>Generated by CaptainDispatch</span>
        <span style={{ textAlign: 'right' }}>{fmtNow()}</span>
      </div>
    </div>
  )
}

// ─── Drop target wrapper for section headers ───────────────────
function DropTargetWrapper({ sectionId, children }) {
  const dropId = 'section::' + (sectionId || 'unassigned')
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { sectionId },
  })
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? '#dbeafe' : 'transparent',
      outline: isOver ? '2px dashed #2563eb' : 'none',
      outlineOffset: '-2px',
      borderRadius: '4px',
      transition: 'background 0.1s',
    }}>
      {children}
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function ListsPage() {
  const router = useRouter()
  const [user,       setUser]       = useState(null)
  const [date,       setDate]       = useState(isoToday())
  const [trips,      setTrips]      = useState([])
  const [locsMap,    setLocsMap]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [production, setProduction] = useState(null)
      const [prodId,     setProdId]     = useState('')
      const [sectionsOpen, setSectionsOpen] = useState(false)
      const [sections, setSections] = useState([])
      const [assignments, setAssignments] = useState([])
      const [moveMenuOpenFor, setMoveMenuOpenFor] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  const [activeDrag, setActiveDrag] = useState(null)
  function handleDragStart(event) {
    setActiveDrag(event.active.data.current?.group || null)
  }
  function handleDragEnd(event) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const group = active.data.current?.group
    const sectionId = over.data.current?.sectionId
    if (!group) return
    // sectionId can be null (Unassigned) or a uuid
    assignGroupToSection(group, sectionId === undefined ? null : sectionId)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else {
        setUser(user)
        const id = getProductionId()
        setProdId(id)
        if (id) loadProduction(id)
      }
    })
  }, [])

  async function loadProduction(id) {
    const { data } = await supabase
      .from('productions')
      .select('*')
      .eq('id', id)
      .single()
    if (data) setProduction(data)
  }

  const loadData = useCallback(async d => {
    const id = getProductionId()
    if (!id) { setLoading(false); return }
    setLoading(true)
    const [tR, lR, vR, sR, aR] = await Promise.all([
      supabase.from('trips').select('*')
        .eq('production_id', id).eq('date', d)
        .neq('status', 'CANCELLED')
        .order('pickup_min', { ascending: true, nullsLast: true }),
      supabase.from('locations').select('id,name,default_pickup_point').eq('production_id', id),
      supabase.from('vehicles').select('id').eq('production_id', id).eq('in_transport', true),
      supabase.from('transport_list_sections').select('*')
        .eq('production_id', id).eq('date', d)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('transport_list_section_assignments').select('*')
        .eq('production_id', id).eq('date', d),
    ])
    const inTransportIds = new Set((vR.data || []).map(v => v.id))
    const trips = (tR.data || []).filter(t => !t.vehicle_id || inTransportIds.has(t.vehicle_id))
    setTrips(trips)
    if (lR.data) {
      const m = {}; lR.data.forEach(l => { m[l.id] = { name: l.name, pickup_point: l.default_pickup_point } }); setLocsMap(m)
    }
    setSections(sR.data || [])
    setAssignments(aR.data || [])
    setLoading(false)
  }, [])

  // Build lookup: assignment by trip group key
  const assignmentByKey = {}
  for (const a of assignments) {
    const key = a.base_trip_id + '::' + (a.vehicle_id || '__none__')
    assignmentByKey[key] = a
  }

  // Group sections into MACRO/SUB hierarchy
  const macros = sections.filter(s => !s.parent_id)
  const subsByParent = sections.reduce((acc, s) => {
    if (s.parent_id) {
      if (!acc[s.parent_id]) acc[s.parent_id] = []
      acc[s.parent_id].push(s)
    }
    return acc
  }, {})

  async function assignGroupToSection(group, sectionId) {
    const id = getProductionId()
    if (!id) return
    const baseId = group.trip_id
    const vehId  = group.vehicle_id || null
    const key = baseId + '::' + (vehId || '__none__')
    const existing = assignmentByKey[key]
    if (sectionId === null) {
      // Unassign
      if (existing) {
        await supabase.from('transport_list_section_assignments')
          .delete().eq('id', existing.id)
      }
    } else if (existing) {
      await supabase.from('transport_list_section_assignments')
        .update({ section_id: sectionId })
        .eq('id', existing.id)
    } else {
      await supabase.from('transport_list_section_assignments')
        .insert({
          production_id: id,
          date,
          base_trip_id: baseId,
          vehicle_id: vehId,
          section_id: sectionId,
        })
    }
    setMoveMenuOpenFor(null)
    loadData(date)
  }

  useEffect(() => { if (user) loadData(date) }, [user, date, loadData])

  const totalPax   = trips.reduce((s, t) => s + (t.pax_count || 0), 0)
  const totalTrips = groupByTripId(trips).length

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>

      {/* ══ STILI GLOBALI ══ */}
      <style>{`
        .trip-row { font-size: 13px; font-family: 'Helvetica Neue', Arial, sans-serif; }
        .print-card, .section-header, .col-header { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .print-wrap, .print-card { font-family: 'Helvetica Neue', Arial, sans-serif; }

        @media print {
          .no-print { display: none !important; }
          [data-dnd-overlay] { display: none !important; }
          
          * { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          
          html, body { 
            background: white !important; 
            margin: 0 !important; 
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
          }

          .print-wrap { 
            padding: 0 !important; 
            margin: 0 !important;
            background: white !important; 
            max-width: none !important;
            width: 100% !important;
            min-height: auto !important;
          }
          
          .print-card { 
            border-radius: 0 !important; 
            padding: 8px 10px !important; 
            border: none !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .trip-row {
            padding: 3px 4px !important;
            font-size: 9px !important;
          }
          .trip-row > div { font-size: 9px !important; }
          .trip-row .time-cell { font-size: 11px !important; }
          .section-header { padding: 4px 0 2px !important; font-size: 8px !important; }
          .col-header { padding: 3px 4px !important; font-size: 8px !important; }
          .doc-footer { padding-top: 4px !important; margin-top: 6px !important; font-size: 8px !important; }
          .toolbar { display: none !important; }
          
          .sticky-footer {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }

        @page {
          size: A4 landscape;
          margin: 8mm;
        }
      `}</style>

      {/* ── Navbar ── */}
      <div className="no-print">
        <Navbar currentPath="/dashboard/lists-v2" />
      </div>

      {/* ── Toolbar ── */}
      <div className="no-print toolbar" style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '0 24px', height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: '52px', zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📋</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Transport Lists</span>
          <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                         fontSize: '10px', fontWeight: '800', letterSpacing: '0.04em',
                         background: '#fef9c3', color: '#92400e',
                         border: '1px solid #fde68a' }}>
            EXCEL MODE - PREVIEW
          </span>
          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>·</span>
          <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
          <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>▶</button>
          <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {totalTrips} trips · {totalPax} pax
          </span>
          {production && (
            <>
              <button onClick={() => setSectionsOpen(true)}
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage sections
              </button>
              <a href="/dashboard/settings/production"
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', textDecoration: 'none', cursor: 'pointer' }}>
                ⚙️ Edit Header
              </a>
            </>
          )}
          <button onClick={() => window.print()}
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* ── Contenuto stampabile ── */}
      <div className="print-wrap" style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

        {/* ── Transport List Header (nuovo layout) ── */}
        <TransportListHeader production={production} date={date} />

        {!prodId && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ No active production. Go to <a href="/dashboard/productions" style={{ color: '#2563eb' }}>Productions</a> and activate one.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading…</div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📋</div>
            <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600' }}>No trips for {fmtDateLong(date)}</div>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="print-card" style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e2e8f0' }}>

            {/* Intestazione colonne */}
            <div className="col-header" style={{
              display: 'grid',
              gridTemplateColumns: '140px 130px 70px 1fr 160px 160px',
              gap: '0 8px',
              padding: '6px 14px',
              borderBottom: '2px solid #0f172a',
              fontWeight: '700',
              fontSize: '10px',
              color: '#0f172a',
              background: '#f8fafc',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              pageBreakAfter: 'avoid',
            }}>
              <div>Vehicle</div>
              <div>Driver</div>
              <div>Time</div>
              <div>Passengers</div>
              <div>From</div>
              <div>To</div>
            </div>

            {(() => {
              // All grouped trips for this day
              const allGroups = groupByTripId(trips)

              // Build section -> groups map
              const groupsBySection = {}
              const unassignedGroups = []
              for (const g of allGroups) {
                const key = g.trip_id + '::' + (g.vehicle_id || '__none__')
                const a = assignmentByKey[key]
                if (a) {
                  if (!groupsBySection[a.section_id]) groupsBySection[a.section_id] = []
                  groupsBySection[a.section_id].push(g)
                } else {
                  unassignedGroups.push(g)
                }
              }

              // DIG-style: single neutral palette, no per-section color rotation
              const SECTION_COLOR_BORDER = '#475569'

              function renderSectionBlock(section, isSub, colorIdx) {
                const groups = groupsBySection[section.id] || []
                const color = SECTION_COLOR_BORDER
                if (isSub) {
                  return (
                    <DropTargetWrapper key={section.id} sectionId={section.id}>
                      <div>
                        {/* EDIT 2.3 — DIG-style SUB section header: dark-grey */}
                        <div className="section-header" style={{
                          fontSize: '12px', fontWeight: '700', color: 'white',
                          background: '#475569',
                          padding: '5px 14px', marginTop: 0,
                          pageBreakAfter: 'avoid',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                          <span>{section.name}</span>
                          <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400', fontSize: '11px' }}>
                            {groups.length}
                          </span>
                        </div>
                        {groups.map(group => (
                          <TripTableRow
                            key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                            group={group}
                            locsMap={locsMap}
                            sectionColor={color}
                            sections={sections}
                            moveMenuOpenFor={moveMenuOpenFor}
                            setMoveMenuOpenFor={setMoveMenuOpenFor}
                            onAssign={assignGroupToSection}
                          />
                        ))}
                      </div>
                    </DropTargetWrapper>
                  )
                }
                return (
                  <div key={section.id}>
                    <DropTargetWrapper sectionId={section.id}>
                      {/* EDIT 2.4 — DIG-style MACRO section header: near-black */}
                      <div className="section-header" style={{
                        fontSize: '14px', fontWeight: '700', color: 'white',
                        background: '#1e293b',
                        padding: '7px 14px', marginTop: '12px',
                        pageBreakAfter: 'avoid',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}>
                        <span>{section.name}</span>
                        <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '3px', padding: '1px 7px', fontSize: '11px', fontWeight: '600' }}>
                          {groups.length}
                        </span>
                      </div>
                      {groups.map(group => (
                        <TripTableRow
                          key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                          group={group}
                          locsMap={locsMap}
                          sectionColor={color}
                          sections={sections}
                          moveMenuOpenFor={moveMenuOpenFor}
                          setMoveMenuOpenFor={setMoveMenuOpenFor}
                          onAssign={assignGroupToSection}
                        />
                      ))}
                    </DropTargetWrapper>
                    {(subsByParent[section.id] || []).map((sub, si) => renderSectionBlock(sub, true, colorIdx))}
                  </div>
                )
              }

              return (
                <>
                  {macros.length === 0 && unassignedGroups.length === 0 ? null : (
                    <>
                      {macros.map((m, mi) => renderSectionBlock(m, false, mi))}
                      {unassignedGroups.length > 0 && (
                        <DropTargetWrapper sectionId={null}>
                          {/* EDIT 2.5 — DIG-style UNASSIGNED header */}
                          <div className="section-header" style={{
                            fontSize: '11px', fontWeight: '700', color: '#64748b',
                            background: 'white',
                            padding: '5px 14px', marginTop: '14px',
                            pageBreakAfter: 'avoid',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            border: '1px dashed #cbd5e1',
                          }}>
                            <span>UNASSIGNED</span>
                            <span style={{ background: '#e2e8f0', borderRadius: '4px', padding: '0 6px', fontSize: '10px' }}>
                              {unassignedGroups.length}
                            </span>
                            {macros.length === 0 && (
                              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8', fontWeight: '500', textTransform: 'none', letterSpacing: 0 }}>
                                Click &quot;Manage sections&quot; to organize
                              </span>
                            )}
                          </div>
                          {unassignedGroups.map(group => (
                            <TripTableRow
                              key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                              group={group}
                              locsMap={locsMap}
                              sectionColor="#cbd5e1"
                              sections={sections}
                              moveMenuOpenFor={moveMenuOpenFor}
                              setMoveMenuOpenFor={setMoveMenuOpenFor}
                              onAssign={assignGroupToSection}
                            />
                          ))}
                        </DropTargetWrapper>
                      )}
                    </>
                  )}
                </>
              )
            })()}

          </div>
          <DragOverlay>
            {activeDrag ? (
              <div style={{
                background: 'white',
                border: '2px solid #2563eb',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#0f172a',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                cursor: 'grabbing',
              }}>
                {activeDrag.trip_id}
                {activeDrag.vehicle_id && <span style={{ color: '#64748b', marginLeft: '6px' }}>· {activeDrag.vehicle_id}</span>}
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        )}

        {/* ── Transport List Footer (nuovo layout) ── */}
        <TransportListFooter />

      <SectionsManagerSidebar
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        date={date}
      />
      </div>
    </div>
  )
}
