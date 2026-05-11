'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SectionsManagerSidebar } from '../../../lib/SectionsManagerSidebar'
import { COLUMNS_CATALOG, CAPTAIN_PRESET } from '../../../lib/listColumnsCatalog'
import { ColumnsEditorSidebar } from '../../../lib/ColumnsEditorSidebar'
import { HeaderFooterEditorSidebar } from '../../../lib/HeaderFooterEditorSidebar'
import { TLHeaderFooterRenderer } from '../../../lib/TLHeaderFooterRenderer'

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
function TripTableRow({ group, locsMap, sectionColor, sections, moveMenuOpenFor, setMoveMenuOpenFor, onAssign, paxByTripRow, columnsConfig, gridTemplate, driverPhonesByName }) {
  const dragId = 'trip::' + group.trip_id + '::' + (group.vehicle_id || 'none')
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { group },
  })

  const ctx = { locsMap, paxByTripRow, driverPhonesByName }

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
        gridTemplateColumns: gridTemplate,
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
      {columnsConfig.map((col, i) => {
        const def = COLUMNS_CATALOG[col.source_field]
        const content = def ? def.render(group, ctx) : (
          <span style={{ color: '#dc2626', fontSize: 10 }}>?{col.source_field}</span>
        )
        const isLast = i === columnsConfig.length - 1
        return (
          <div key={col.id} style={{ minWidth: 0, position: isLast ? 'relative' : 'static' }}>
            {content}
            {isLast && (
              <>
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
              </>
            )}
          </div>
        )
      })}
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
      const [paxByTripRow, setPaxByTripRow] = useState({})
      const [driverPhonesByName, setDriverPhonesByName] = useState({})
      const [columnsConfig, setColumnsConfig] = useState([])
      const [applyingPreset, setApplyingPreset] = useState(false)
      const [columnsEditorOpen, setColumnsEditorOpen] = useState(false)
      const [headerFooterOpen, setHeaderFooterOpen] = useState(false)
      const [headerFooterReloadKey, setHeaderFooterReloadKey] = useState(0)

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
    const [tR, lR, vR, sR, aR, cR] = await Promise.all([
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
      supabase.from('transport_list_columns').select('*')
        .eq('production_id', id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    const inTransportIds = new Set((vR.data || []).map(v => v.id))
    const tripsFiltered = (tR.data || []).filter(t => !t.vehicle_id || inTransportIds.has(t.vehicle_id))
    setTrips(tripsFiltered)
    if (lR.data) {
      const m = {}; lR.data.forEach(l => { m[l.id] = { name: l.name, pickup_point: l.default_pickup_point } }); setLocsMap(m)
    }
    setSections(sR.data || [])
    setAssignments(aR.data || [])
    setColumnsConfig(cR.data || [])

    // Fetch trip_passengers + crew (role) for the day's trips
    const tripIds = tripsFiltered.map(t => t.id)
    if (tripIds.length > 0) {
      const { data: paxData } = await supabase
        .from('trip_passengers')
        .select('trip_row_id, crew:crew_id(id, full_name, role, department)')
        .in('trip_row_id', tripIds)
      const map = {}
      for (const p of (paxData || [])) {
        if (!map[p.trip_row_id]) map[p.trip_row_id] = []
        if (p.crew) map[p.trip_row_id].push(p.crew)
      }
      setPaxByTripRow(map)
    } else {
      setPaxByTripRow({})
    }

    // Load driver phone lookup from crew table (matched by full_name)
    const { data: crewData } = await supabase
      .from('crew')
      .select('full_name, phone')
      .eq('production_id', id)
    const phoneMap = {}
    for (const c of (crewData || [])) {
      if (c.full_name && c.phone) phoneMap[c.full_name] = c.phone
    }
    setDriverPhonesByName(phoneMap)

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

  const gridTemplate = columnsConfig.length > 0
    ? columnsConfig.map(c => c.width || '110px').join(' ')
    : '1fr'

  async function applyCaptainPreset() {
    const id = getProductionId()
    if (!id || applyingPreset) return
    setApplyingPreset(true)
    try {
      if (columnsConfig.length > 0) {
        const ok = confirm('This production already has ' + columnsConfig.length + ' columns. Apply Captain Preset will REPLACE them. Continue?')
        if (!ok) { setApplyingPreset(false); return }
        const { error: delErr } = await supabase
          .from('transport_list_columns')
          .delete()
          .eq('production_id', id)
        if (delErr) throw delErr
      }
      const rows = CAPTAIN_PRESET.map(p => ({ ...p, production_id: id }))
      const { error: insErr } = await supabase
        .from('transport_list_columns')
        .insert(rows)
      if (insErr) throw insErr
      await loadData(date)
    } catch (e) {
      alert('Failed to apply Captain Preset: ' + (e.message || 'unknown error'))
    } finally {
      setApplyingPreset(false)
    }
  }

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
        .show-only-on-print { display: none; }

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

          /* EG-5 print refinements */
          .no-print, [class*="no-print"] { display: none !important; }
          .col-header { position: sticky; top: 0; }
          .trip-row { break-inside: avoid; page-break-inside: avoid; }
          .section-header { break-after: avoid; page-break-after: avoid; }
          [data-eg-no-print="true"] { display: none !important; }
          .show-only-on-print { display: block !important; }
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
              {columnsConfig.length === 0 && (
                <button
                  onClick={applyCaptainPreset}
                  disabled={applyingPreset}
                  className="no-print"
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #2563eb', background: applyingPreset ? '#cbd5e1' : '#2563eb', color: 'white', fontSize: '12px', fontWeight: '700', cursor: applyingPreset ? 'default' : 'pointer' }}>
                  {applyingPreset ? 'Applying…' : 'Apply Captain Preset'}
                </button>
              )}
              <button
                onClick={() => setColumnsEditorOpen(true)}
                className="no-print"
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Columns editor
              </button>
              <button onClick={() => setSectionsOpen(true)}
                className="no-print"
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage sections
              </button>
              <button onClick={() => setHeaderFooterOpen(true)}
                className="no-print"
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Header & Footer
              </button>
            </>
          )}
          <button onClick={() => window.print()}
            className="no-print"
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* ── Contenuto stampabile ── */}
      <div className="print-wrap" style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

        {/* ── Transport List Header (data-driven) ── */}
        <TLHeaderFooterRenderer
          productionId={prodId}
          zone="header"
          currentDate={new Date(date + 'T12:00:00Z')}
          reloadKey={headerFooterReloadKey}
          onOpenEditor={() => setHeaderFooterOpen(true)}
        />

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
            {columnsConfig.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
                <div style={{ fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>No columns configured</div>
                <div>Click <strong>Apply Captain Preset</strong> in the toolbar to populate the default 6 columns.</div>
              </div>
            ) : (
            <div className="col-header" style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
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
              {columnsConfig.map(c => (
                <div key={c.id}>{c.header_label}</div>
              ))}
            </div>
            )}

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
                        {columnsConfig.length > 0 && groups.map(group => (
                          <TripTableRow
                            key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                            group={group}
                            locsMap={locsMap}
                            sectionColor={color}
                            sections={sections}
                            moveMenuOpenFor={moveMenuOpenFor}
                            setMoveMenuOpenFor={setMoveMenuOpenFor}
                            onAssign={assignGroupToSection}
                            paxByTripRow={paxByTripRow}
                            driverPhonesByName={driverPhonesByName}
                            columnsConfig={columnsConfig}
                            gridTemplate={gridTemplate}
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
                      {columnsConfig.length > 0 && groups.map(group => (
                        <TripTableRow
                          key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                          group={group}
                          locsMap={locsMap}
                          sectionColor={color}
                          sections={sections}
                          moveMenuOpenFor={moveMenuOpenFor}
                          setMoveMenuOpenFor={setMoveMenuOpenFor}
                          onAssign={assignGroupToSection}
                          paxByTripRow={paxByTripRow}
                          driverPhonesByName={driverPhonesByName}
                          columnsConfig={columnsConfig}
                          gridTemplate={gridTemplate}
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
                          {columnsConfig.length > 0 && unassignedGroups.map(group => (
                            <TripTableRow
                              key={group.trip_id + '::' + (group.vehicle_id || 'none')}
                              group={group}
                              locsMap={locsMap}
                              sectionColor="#cbd5e1"
                              sections={sections}
                              moveMenuOpenFor={moveMenuOpenFor}
                              setMoveMenuOpenFor={setMoveMenuOpenFor}
                              onAssign={assignGroupToSection}
                              paxByTripRow={paxByTripRow}
                              driverPhonesByName={driverPhonesByName}
                              columnsConfig={columnsConfig}
                              gridTemplate={gridTemplate}
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

        {/* ── Transport List Footer (data-driven) ── */}
        <TLHeaderFooterRenderer
          productionId={prodId}
          zone="footer"
          currentDate={new Date(date + 'T12:00:00Z')}
          reloadKey={headerFooterReloadKey}
        />

      <SectionsManagerSidebar
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        date={date}
      />
      <ColumnsEditorSidebar
        open={columnsEditorOpen}
        onClose={() => setColumnsEditorOpen(false)}
        onChanged={() => loadData(date)}
      />
      <HeaderFooterEditorSidebar
        open={headerFooterOpen}
        onClose={() => {
          setHeaderFooterOpen(false)
          setHeaderFooterReloadKey(k => k + 1)
        }}
        productionId={prodId}
        productionLabel={production?.name || null}
      />
      </div>
    </div>
  )
}
