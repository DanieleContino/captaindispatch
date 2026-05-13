'use client'

/**
 * /dashboard/travel
 * Session S55 — 12 May 2026
 * Updated S56 — 12 May 2026: multi-leg journey support (journey_id)
 *
 * Travel Coordinator view — all travel_movements grouped by date and section
 * (FLIGHT / TRAIN / OA / GROUND).
 * Columns are now configurable per-production via TravelColumnsEditorSidebar.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'
import { TravelColumnsEditorSidebar } from '../../../lib/TravelColumnsEditorSidebar'
import { TRAVEL_DEFAULT_PRESET } from '../../../lib/travelColumnsCatalog'

// ─── Date helpers ─────────────────────────────────────────────
function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function isoAdd(dateStr, n) {
  const dt = new Date(dateStr + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function fmtDateHeader(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

// ─── Section definitions ───────────────────────────────────────
const SECTIONS = [
  { key: 'FLIGHT', icon: '✈️', label: 'FLIGHT',           types: ['FLIGHT'] },
  { key: 'TRAIN',  icon: '🚂', label: 'TRAIN',            types: ['TRAIN'] },
  { key: 'OA',     icon: '🚗', label: 'OA / SELF',        types: ['OA', 'SELF'] },
  { key: 'GROUND', icon: '🚐', label: 'GROUND TRANSPORT', types: ['GROUND'] },
  { key: 'FERRY',  icon: '⛴️', label: 'FERRY',            types: ['FERRY'] },
]

// ─── Toast ────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
      padding: '10px 18px', borderRadius: '10px', fontSize: '13px',
      fontWeight: '700', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      background: type === 'error' ? '#fef2f2' : '#f0fdf4',
      color: type === 'error' ? '#dc2626' : '#15803d',
      border: `1px solid ${type === 'error' ? '#fecaca' : '#86efac'}`,
      pointerEvents: 'none',
    }}>
      {type === 'error' ? '❌' : '✅'} {message}
    </div>
  )
}

// ─── EditableCell ─────────────────────────────────────────────
function EditableCell({ value, field, rowId, type = 'text', onSaved, style, onContextMenu }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value || '')
  const [saving, setSaving]   = useState(false)

  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])

  async function save() {
    const trimmed = typeof draft === 'string' ? draft.trim() : draft
    const payload = trimmed === '' ? null : trimmed
    if (payload === (value || null)) { setEditing(false); return }
    setSaving(true)
    const { error } = await supabase
      .from('travel_movements')
      .update({ [field]: payload })
      .eq('id', rowId)
    setSaving(false)
    if (!error) {
      onSaved(rowId, field, payload)
      setEditing(false)
    } else {
      setDraft(value || '')
      setEditing(false)
      onSaved(rowId, '__error__', 'Save failed')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); save() }
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
  }

  if (editing) {
    const inputStyle = {
      width: '100%', padding: '4px 6px', fontSize: '11px',
      border: '2px solid #2563eb', borderRadius: '5px',
      background: 'white', color: '#0f172a',
      fontFamily: type === 'time' ? 'monospace' : 'inherit',
      outline: 'none', boxSizing: 'border-box',
      opacity: saving ? 0.6 : 1,
    }
    if (type === 'textarea') {
      return (
        <td style={{ padding: '4px 6px', ...style }}>
          <textarea
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
            disabled={saving} rows={2}
            style={{ ...inputStyle, resize: 'vertical', width: '100%' }}
          />
        </td>
      )
    }
    return (
      <td style={{ padding: '4px 6px', ...style }}>
        <input
          autoFocus type={type} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save} onKeyDown={handleKeyDown}
          disabled={saving}
          style={{ ...inputStyle, width: '100%' }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => { setDraft(value || ''); setEditing(true) }}
      onContextMenu={onContextMenu}
      title="Click to edit · Right-click to change color"
      style={{ padding: '7px 10px', cursor: 'text', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = style?.background || '' }}
    >
      {value || <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '10px' }}>-</span>}
    </td>
  )
}

// ─── NeedsTransportCell ───────────────────────────────────────
function NeedsTransportCell({ value, rowId, onSaved }) {
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (saving) return
    setSaving(true)
    const next = !value
    const { error } = await supabase
      .from('travel_movements')
      .update({ needs_transport: next })
      .eq('id', rowId)
    setSaving(false)
    if (!error) onSaved(rowId, 'needs_transport', next)
    else onSaved(rowId, '__error__', 'Save failed')
  }

  return (
    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
      <button onClick={toggle} disabled={saving}
        title={value ? 'Remove transport' : 'Mark as needs transport'}
        style={{ background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', padding: 0, opacity: saving ? 0.5 : 1 }}>
        {value
          ? <span style={{ fontSize: '10px', fontWeight: '800', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px' }}>🚐</span>
          : <span style={{ fontSize: '10px', fontWeight: '800', color: 'white', background: '#dc2626', border: '1px solid #b91c1c', borderRadius: '4px', padding: '1px 5px' }}>🚐</span>
        }
      </button>
    </td>
  )
}

// ─── Color Picker ─────────────────────────────────────────────
const COLOR_PALETTE = [
  null, '#fef9c3', '#fef2f2', '#f0fdf4', '#eff6ff',
  '#fdf4ff', '#fff7ed', '#f1f5f9', '#fbbf24', '#86efac',
  '#93c5fd', '#f9a8d4', '#0f2340',
]

function ColorPickerPopover({ field, rowId, currentColor, onColorSaved, onClose }) {
  const ref = React.useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function pickColor(color) {
    const { data: current } = await supabase
      .from('travel_movements').select('cell_colors').eq('id', rowId).single()
    const existing = current?.cell_colors || {}
    const next = color === null
      ? Object.fromEntries(Object.entries(existing).filter(([k]) => k !== field))
      : { ...existing, [field]: color }
    const { error } = await supabase.from('travel_movements').update({ cell_colors: next }).eq('id', rowId)
    if (!error) onColorSaved(rowId, next)
    onClose()
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 300,
      background: 'white', border: '1px solid #e2e8f0',
      borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', width: '148px',
    }}>
      {COLOR_PALETTE.map((c, i) => (
        <button key={i} onClick={() => pickColor(c)} title={c || 'No color'}
          style={{
            width: '24px', height: '24px', borderRadius: '5px',
            border: c === currentColor ? '2px solid #2563eb' : '1px solid #e2e8f0',
            background: c || 'white', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
          }}>
          {c === null && 'x'}
        </button>
      ))}
    </div>
  )
}

// ─── renderCell — data-driven cell renderer ────────────────────
function renderCell(col, m, { onCellSaved, handleCellRightClick, bgColor, colors }) {
  const field = col.source_field
  const base = {
    fontSize: '11px', color: '#374151',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    background: colors[field] || bgColor,
  }

  switch (field) {
    case 'direction':
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: '800',
          color: m.direction === 'IN' ? '#15803d' : '#c2410c',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: bgColor }}>
          {m.direction === 'IN' ? 'v IN' : '^ OUT'}
        </td>
      )

    case 'full_name': {
      // Leg 2+ of a multi-leg journey: show indented connector instead of name
      if (m.legIndex > 0) {
        return (
          <td key={field} style={{ padding: '7px 10px 7px 20px', fontSize: '11px', fontWeight: '600',
            color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            background: bgColor }}>
            {'\u21aa'} leg {m.legIndex + 1}
          </td>
        )
      }
      const displayName = m.crew?.full_name || m.full_name_raw || '-'
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '12px', fontWeight: '700',
          color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: bgColor }}>
          {displayName}
          {m.journeySize > 1 && (
            <span style={{ marginLeft: '5px', fontSize: '9px', fontWeight: '700',
              color: '#7c3aed', background: '#f5f3ff', padding: '1px 4px',
              borderRadius: '3px', verticalAlign: 'middle' }}>
              {m.journeySize}{'\u2708'}
            </span>
          )}
        </td>
      )
    }

    case 'crew_role':
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#64748b',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: bgColor }}>
          {m.crew?.role || '-'}
        </td>
      )

    case 'pickup_dep':
      return (
        <EditableCell key={field}
          value={m.pickup_dep} field="pickup_dep" rowId={m.id}
          onSaved={onCellSaved} style={base}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'pickup_dep', colors['pickup_dep'])}
        />
      )

    case 'from_location':
      return (
        <EditableCell key={field}
          value={m.from_location} field="from_location" rowId={m.id}
          onSaved={onCellSaved}
          style={{ ...base, fontWeight: '600', color: '#0f172a' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'from_location', colors['from_location'])}
        />
      )

    case 'from_time':
      return (
        <EditableCell key={field}
          value={m.from_time ? m.from_time.slice(0, 5) : ''} field="from_time"
          rowId={m.id} type="time" onSaved={onCellSaved}
          style={{ ...base, fontFamily: 'monospace' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'from_time', colors['from_time'])}
        />
      )

    case 'to_location':
      return (
        <EditableCell key={field}
          value={m.to_location} field="to_location" rowId={m.id}
          onSaved={onCellSaved}
          style={{ ...base, fontWeight: '600', color: '#0f172a' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'to_location', colors['to_location'])}
        />
      )

    case 'to_time':
      return (
        <EditableCell key={field}
          value={m.to_time ? m.to_time.slice(0, 5) : ''} field="to_time"
          rowId={m.id} type="time" onSaved={onCellSaved}
          style={{ ...base, fontFamily: 'monospace' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'to_time', colors['to_time'])}
        />
      )

    case 'travel_number':
      return (
        <EditableCell key={field}
          value={m.travel_number} field="travel_number" rowId={m.id}
          onSaved={onCellSaved}
          style={{ ...base, fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'travel_number', colors['travel_number'])}
        />
      )

    case 'pickup_arr':
      return (
        <EditableCell key={field}
          value={m.pickup_arr} field="pickup_arr" rowId={m.id}
          onSaved={onCellSaved} style={base}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'pickup_arr', colors['pickup_arr'])}
        />
      )

    case 'needs_transport':
      return <NeedsTransportCell key={field} value={m.needs_transport} rowId={m.id} onSaved={onCellSaved} />

    case 'notes':
      return (
        <EditableCell key={field}
          value={m.notes} field="notes" rowId={m.id}
          type="textarea" onSaved={onCellSaved}
          style={{ ...base, color: '#374151' }}
          onContextMenu={(e) => handleCellRightClick(e, m.id, 'notes', colors['notes'])}
        />
      )

    case 'match_status':
      return (
        <td key={field} style={{ padding: '7px 10px', textAlign: 'center', background: bgColor }}>
          {m.match_status === 'unmatched'
            ? <span style={{ fontSize: '10px', fontWeight: '800', color: '#dc2626' }}>X</span>
            : <span style={{ fontSize: '10px' }}>OK</span>
          }
        </td>
      )

    default:
      return (
        <td key={field} style={{ background: bgColor, padding: '7px 10px', fontSize: '11px', color: '#cbd5e1' }}>-</td>
      )
  }
}

// ─── buildDisplayRows — group journey legs visually ────────────
// Rows with the same journey_id are sorted together and annotated
// with legIndex (0-based) and journeySize so renderCell can adapt.
// Standalone rows (journey_id = null) get legIndex = -1, journeySize = 1.
function buildDisplayRows(rows) {
  const journeyMap = new Map()
  const standalone = []

  for (const m of rows) {
    if (m.journey_id) {
      if (!journeyMap.has(m.journey_id)) journeyMap.set(m.journey_id, [])
      journeyMap.get(m.journey_id).push(m)
    } else {
      standalone.push(m)
    }
  }

  // Sort each journey group internally by from_time
  for (const legs of journeyMap.values()) {
    legs.sort((a, b) => (a.from_time || '').localeCompare(b.from_time || ''))
  }

  // Build sortable items keyed by first from_time of each group
  const items = [
    ...standalone.map(m => ({
      sortTime: m.from_time || '',
      flatRows: [{ ...m, legIndex: -1, journeySize: 1 }],
    })),
    ...Array.from(journeyMap.values()).map(legs => ({
      sortTime: legs[0].from_time || '',
      flatRows: legs.map((leg, i) => ({ ...leg, legIndex: i, journeySize: legs.length })),
    })),
  ]

  items.sort((a, b) => a.sortTime.localeCompare(b.sortTime))
  return items.flatMap(item => item.flatRows)
}

// ─── SectionTable ─────────────────────────────────────────────
function SectionTable({ section, rows, today, onCellSaved, onEditRow, onColorSaved, columnsConfig }) {
  const [colorPicker, setColorPicker] = useState(null)

  function handleCellRightClick(e, rowId, field, currentColor) {
    e.preventDefault()
    setColorPicker({ rowId, field, currentColor })
  }

  if (!columnsConfig || columnsConfig.length === 0) return null

  const displayRows = buildDisplayRows(rows)

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', background: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0',
        borderBottom: 'none',
      }}>
        <span style={{ fontSize: '13px' }}>{section.icon}</span>
        <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151',
          letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {section.label}
        </span>
        <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>
          {rows.length}
        </span>
      </div>

      {/* Table wrapper */}
      <div style={{ position: 'relative' }}>
        {colorPicker && (
          <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 200 }}>
            <ColorPickerPopover
              field={colorPicker.field} rowId={colorPicker.rowId}
              currentColor={colorPicker.currentColor}
              onColorSaved={(rowId, colors) => { onColorSaved(rowId, colors); setColorPicker(null) }}
              onClose={() => setColorPicker(null)}
            />
          </div>
        )}

        <table style={{
          width: '100%', borderCollapse: 'collapse',
          tableLayout: 'fixed',
          border: '1px solid #e2e8f0', borderTop: 'none',
          borderRadius: '0 0 8px 8px', overflow: 'hidden',
        }}>
          {/* Column widths */}
          <colgroup>
            {columnsConfig.map(col => (
              <col key={col.source_field} style={{ width: col.width }} />
            ))}
            <col style={{ width: '38px' }} /> {/* Edit button */}
          </colgroup>

          {/* Header */}
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {columnsConfig.map(col => (
                <th key={col.source_field} style={{
                  padding: '6px 8px', fontSize: '10px', fontWeight: '800',
                  color: col.source_field === 'notes' ? '#2563eb' : '#64748b',
                  textAlign: (col.source_field === 'needs_transport' || col.source_field === 'match_status') ? 'center' : 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  {col.header_label}
                </th>
              ))}
              <th style={{ borderBottom: '1px solid #e2e8f0', width: '38px' }} />
            </tr>
          </thead>

          {/* Body — uses buildDisplayRows for journey grouping */}
          <tbody>
            {displayRows.map((m) => {
              const isUnmatched = m.match_status === 'unmatched'
              const isIN        = m.direction === 'IN'
              const isToday     = m.travel_date === today
              const colors      = m.cell_colors || {}
              const bgColor     = isUnmatched ? '#fef2f2' : isIN ? '#f0fdf4' : '#fff7ed'
              const borderColor = isUnmatched ? '#ef4444' : isIN ? '#22c55e' : '#f97316'
              // Leg rows (2nd, 3rd…) get a slightly dimmer left border to visually connect
              const isLeg       = m.legIndex > 0

              return (
                <tr key={m.id} style={{
                  background: bgColor,
                  borderLeft: isLeg
                    ? `3px solid ${borderColor}88`
                    : `3px solid ${borderColor}`,
                  outline: isToday ? '2px solid #fbbf24' : 'none',
                  outlineOffset: '-2px',
                  opacity: isLeg ? 0.9 : 1,
                }}>
                  {columnsConfig.map(col =>
                    renderCell(col, m, { onCellSaved, handleCellRightClick, bgColor, colors })
                  )}

                  {/* Edit button — always last column */}
                  <td style={{ padding: '4px 6px', background: bgColor, textAlign: 'right', verticalAlign: 'middle' }}>
                    <button
                      onClick={() => onEditRow(m)}
                      title="Edit movement"
                      style={{
                        background: 'none', border: '1px solid #e2e8f0',
                        borderRadius: '5px', padding: '2px 6px',
                        cursor: 'pointer', fontSize: '11px', color: '#64748b',
                      }}>&#9998;</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── MovementSidebar ──────────────────────────────────────────
const EMPTY_MOV = {
  travel_date: '', direction: 'IN', travel_type: 'FLIGHT',
  full_name_raw: '', crew_id: null,
  travel_number: '', from_location: '', from_time: '',
  to_location: '', to_time: '', pickup_dep: '', pickup_arr: '',
  needs_transport: false, notes: '', journey_id: null,
}

const SELECT_FIELDS = `
  id, crew_id, full_name_raw, travel_date, direction,
  travel_type, travel_number, from_location, from_time,
  to_location, to_time, needs_transport, match_status,
  pickup_dep, pickup_arr, notes, cell_colors, journey_id,
  crew:crew_id(full_name, role, department)
`

function MovementSidebar({ open, mode, initial, onClose, onSaved, onDeleted, onAddLeg }) {
  const PRODUCTION_ID = getProductionId()
  const [form, setForm]         = useState(EMPTY_MOV)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError]       = useState(null)
  const [crewSearch, setCrewSearch] = useState('')
  const [crewResults, setCrewResults] = useState([])
  const [crewSearching, setCrewSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null); setConfirmDel(false)

    if (mode === 'edit' && initial) {
      setForm({
        travel_date:     initial.travel_date    || '',
        direction:       initial.direction      || 'IN',
        travel_type:     initial.travel_type    || 'FLIGHT',
        full_name_raw:   initial.full_name_raw  || initial.crew?.full_name || '',
        crew_id:         initial.crew_id        || null,
        travel_number:   initial.travel_number  || '',
        from_location:   initial.from_location  || '',
        from_time:       initial.from_time      ? initial.from_time.slice(0, 5) : '',
        to_location:     initial.to_location    || '',
        to_time:         initial.to_time        ? initial.to_time.slice(0, 5) : '',
        pickup_dep:      initial.pickup_dep     || '',
        pickup_arr:      initial.pickup_arr     || '',
        needs_transport: !!initial.needs_transport,
        notes:           initial.notes          || '',
        journey_id:      initial.journey_id     || null,
      })
      setCrewSearch(initial.full_name_raw || initial.crew?.full_name || '')
      setCrewResults([])

    } else if (mode === 'new' && initial?.__isLeg) {
      // Pre-filled new leg: same person, same date/direction, from = prev to
      setForm({
        travel_date:     initial.travel_date    || '',
        direction:       initial.direction      || 'IN',
        travel_type:     initial.travel_type    || 'FLIGHT',
        full_name_raw:   initial.full_name_raw  || '',
        crew_id:         initial.crew_id        || null,
        travel_number:   '',
        from_location:   initial.from_location  || '',
        from_time:       initial.from_time      || '',
        to_location:     '',
        to_time:         '',
        pickup_dep:      '',
        pickup_arr:      '',
        needs_transport: false,
        notes:           '',
        journey_id:      initial.journey_id     || null,
      })
      setCrewSearch(initial.full_name_raw || '')
      setCrewResults([])

    } else {
      setForm(EMPTY_MOV)
      setCrewSearch('')
      setCrewResults([])
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function searchCrew(q) {
    if (!q || q.length < 2 || !PRODUCTION_ID) { setCrewResults([]); return }
    setCrewSearching(true)
    const { data } = await supabase.from('crew')
      .select('id, full_name, role, department')
      .eq('production_id', PRODUCTION_ID)
      .ilike('full_name', `%${q}%`)
      .limit(8)
    setCrewResults(data || [])
    setCrewSearching(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => searchCrew(crewSearch), 300)
    return () => clearTimeout(timer)
  }, [crewSearch])

  // ── Auto-sync crew.arrival_date / departure_date / travel_status ──────────
  // Called after every successful save of a matched movement (crew_id set).
  // Mirrors the expectedStatus() logic from crew/page.js:
  //   today > dep_date  → OUT
  //   today > arr_date  → PRESENT
  //   today === arr_date → IN if saving an IN movement today, else PRESENT
  //   today < arr_date  → IN
  async function syncCrewDates(crewId, direction, travelDate) {
    if (!crewId || !travelDate || !PRODUCTION_ID) return
    const { data: crewRec } = await supabase
      .from('crew')
      .select('arrival_date, departure_date, travel_status')
      .eq('id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .single()
    if (!crewRec) return

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const updates = {}

    // Update dates based on direction
    if (direction === 'IN') {
      const dep = crewRec.departure_date
      const arr = crewRec.arrival_date
      if (dep && travelDate > dep) {
        // "Return" arrival AFTER a past departure → new stint: reset dep, set new arr
        updates.arrival_date   = travelDate
        updates.departure_date = null
      } else if (!arr || travelDate < arr) {
        // First arrival or earlier leg of same journey
        updates.arrival_date = travelDate
      }
    }
    if (direction === 'OUT' && (!crewRec.departure_date || travelDate > crewRec.departure_date)) {
      updates.departure_date = travelDate
    }

    // Always compute expected status (using current + potentially updated dates).
    // Use 'in' check instead of ?? because updates.departure_date may be explicitly null
    // (null ?? fallback = fallback, which is wrong when we intentionally reset to null)
    const arr = 'arrival_date'   in updates ? updates.arrival_date   : crewRec.arrival_date
    const dep = 'departure_date' in updates ? updates.departure_date : crewRec.departure_date

    // Replicate expectedStatus logic from crew/page.js
    let newStatus = null
    if (dep && today > dep)        newStatus = 'OUT'
    else if (arr && today > arr)   newStatus = 'PRESENT'
    else if (arr && today === arr) {
      // Has IN movement today? We know the one being saved counts
      newStatus = (direction === 'IN' && travelDate === today) ? 'IN' : 'PRESENT'
    }
    else if (arr && today < arr)   newStatus = 'IN'

    if (newStatus && newStatus !== crewRec.travel_status) updates.travel_status = newStatus

    // Nothing changed — skip DB write
    if (Object.keys(updates).length === 0) return

    await supabase.from('crew').update(updates).eq('id', crewId).eq('production_id', PRODUCTION_ID)
  }

  function buildRow() {
    return {
      production_id:   PRODUCTION_ID,
      travel_date:     form.travel_date,
      direction:       form.direction,
      travel_type:     form.travel_type,
      full_name_raw:   form.full_name_raw.trim() || null,
      crew_id:         form.crew_id || null,
      travel_number:   form.travel_number.trim() || null,
      from_location:   form.from_location.trim() || null,
      from_time:       form.from_time || null,
      to_location:     form.to_location.trim() || null,
      to_time:         form.to_time || null,
      pickup_dep:      form.pickup_dep.trim() || null,
      pickup_arr:      form.pickup_arr.trim() || null,
      needs_transport: form.needs_transport,
      notes:           form.notes.trim() || null,
      match_status:    form.crew_id ? 'matched' : 'unmatched',
      journey_id:      form.journey_id || null,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.travel_date) { setError('Date required'); return }
    if (!form.full_name_raw.trim() && !form.crew_id) { setError('Name required'); return }
    setSaving(true)
    const row = buildRow()
    let result
    if (mode === 'new') {
      result = await supabase.from('travel_movements').insert(row).select(SELECT_FIELDS).single()
    } else {
      result = await supabase.from('travel_movements').update(row)
        .eq('id', initial.id).select(SELECT_FIELDS).single()
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data, mode)
    // Fire-and-forget: sync crew dates from the saved movement
    syncCrewDates(form.crew_id, form.direction, form.travel_date)
    onClose()
  }

  // Save current movement and open sidebar for the next connecting leg
  async function handleSaveAndAddLeg() {
    if (!form.travel_date) { setError('Date required'); return }
    if (!form.full_name_raw.trim() && !form.crew_id) { setError('Name required'); return }
    setSaving(true)
    // Assign or reuse journey_id
    const journeyId = form.journey_id || crypto.randomUUID()
    const row = { ...buildRow(), journey_id: journeyId }
    let result
    if (mode === 'new') {
      result = await supabase.from('travel_movements').insert(row).select(SELECT_FIELDS).single()
    } else {
      result = await supabase.from('travel_movements').update(row)
        .eq('id', initial.id).select(SELECT_FIELDS).single()
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data, mode)
    // Fire-and-forget: sync crew dates from the saved movement
    syncCrewDates(form.crew_id, form.direction, form.travel_date)
    // Signal parent to open next leg sidebar
    if (onAddLeg) onAddLeg(result.data)
  }

  async function revertCrewDates(crewId) {
    if (!crewId || !PRODUCTION_ID) return
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const { data: remaining } = await supabase
      .from('travel_movements')
      .select('direction, travel_date')
      .eq('crew_id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .order('travel_date', { ascending: true })
    const ins  = (remaining || []).filter(m => m.direction === 'IN').map(m => m.travel_date)
    const outs = (remaining || []).filter(m => m.direction === 'OUT').map(m => m.travel_date)
    const newArr = ins.length  > 0 ? ins[0]               : null
    const newDep = outs.length > 0 ? outs[outs.length - 1] : null
    let newStatus = null
    if (newArr || newDep) {
      if (newDep && today > newDep)       newStatus = 'OUT'
      else if (newArr && today > newArr)  newStatus = 'PRESENT'
      else if (newArr && today === newArr) newStatus = 'IN'
      else if (newArr && today < newArr)  newStatus = 'IN'
    }
    const updates = { arrival_date: newArr, departure_date: newDep }
    if (newStatus) updates.travel_status = newStatus
    await supabase.from('crew').update(updates).eq('id', crewId).eq('production_id', PRODUCTION_ID)
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await supabase.from('travel_movements').delete().eq('id', initial.id)
    setDeleting(false)
    // Revert crew dates based on remaining movements
    if (initial.crew_id && PRODUCTION_ID) {
      await revertCrewDates(initial.crew_id)
    }
    onDeleted(initial.id)
    onClose()
  }

  const inp = {
    width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: '8px', fontSize: '13px', color: '#0f172a',
    background: 'white', boxSizing: 'border-box',
  }
  const lbl = {
    fontSize: '10px', fontWeight: '800', color: '#94a3b8',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    display: 'block', marginBottom: '3px',
  }
  const rowSt = { marginBottom: '12px' }
  const DIR_COLORS = {
    IN:  { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
    OUT: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  }
  const TYPE_ICONS = { FLIGHT: '✈', TRAIN: '🚂', OA: '🚗', SELF: '🚗', GROUND: '🚐', FERRY: '⛴' }

  const isLegMode = mode === 'new' && initial?.__isLeg

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
        background: 'white', borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: isLegMode ? '#4c1d95' : '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new'
              ? (isLegMode ? '\u21aa Connecting Leg' : '\u2708 New Movement')
              : '\u270e Edit Movement'}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', color: 'white', fontSize: '16px',
            lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>x</button>
        </div>

        {/* Journey indicator */}
        {(form.journey_id || isLegMode) && (
          <div style={{ padding: '6px 18px', background: '#f5f3ff', borderBottom: '1px solid #e9d5ff',
            fontSize: '11px', color: '#7c3aed', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>\u2708 Multi-leg journey</span>
            {form.journey_id && (
              <span style={{ fontSize: '9px', color: '#a78bfa', fontWeight: '400', fontFamily: 'monospace' }}>
                {form.journey_id.slice(0, 8)}...
              </span>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            <div style={rowSt}>
              <label style={lbl}>Date *</label>
              <input type="date" value={form.travel_date}
                onChange={e => set('travel_date', e.target.value)} style={inp} required />
            </div>

            <div style={rowSt}>
              <label style={lbl}>Direction *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['IN', 'OUT'].map(d => {
                  const c = DIR_COLORS[d]; const active = form.direction === d
                  return (
                    <button key={d} type="button" onClick={() => set('direction', d)}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px',
                        fontWeight: '700', cursor: 'pointer',
                        border: `1px solid ${active ? c.border : '#e2e8f0'}`,
                        background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8' }}>
                      {d === 'IN' ? 'v IN' : '^ OUT'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={rowSt}>
              <label style={lbl}>Type *</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {['FLIGHT', 'TRAIN', 'OA', 'GROUND', 'FERRY'].map(tp => {
                  const active = form.travel_type === tp
                  return (
                    <button key={tp} type="button" onClick={() => set('travel_type', tp)}
                      style={{ padding: '6px 10px', borderRadius: '7px', fontSize: '12px',
                        fontWeight: '700', cursor: 'pointer',
                        border: `1px solid ${active ? '#0f2340' : '#e2e8f0'}`,
                        background: active ? '#0f2340' : 'white', color: active ? 'white' : '#64748b' }}>
                      {TYPE_ICONS[tp]} {tp}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={rowSt}>
              <label style={lbl}>Crew member (search to link)</label>
              <input value={crewSearch}
                onChange={e => { setCrewSearch(e.target.value); if (!e.target.value) set('crew_id', null) }}
                style={inp} placeholder="Type name to search crew..." autoComplete="off" />
              {crewSearching && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching...</div>}
              {crewResults.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden' }}>
                  {crewResults.map(c => (
                    <div key={c.id} onClick={() => { set('crew_id', c.id); set('full_name_raw', c.full_name); setCrewSearch(c.full_name); setCrewResults([]) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>{c.full_name}</span>
                      {c.role && <span style={{ fontSize: '11px', color: '#64748b' }}>{c.role}</span>}
                      {c.department && <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{c.department}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={rowSt}>
              <label style={lbl}>Name (raw) *</label>
              <input value={form.full_name_raw} onChange={e => set('full_name_raw', e.target.value)} style={inp} placeholder="Rossi Mario" />
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Auto-filled when you select a crew member above</div>
            </div>

            <div style={rowSt}>
              <label style={lbl}>Travel Number</label>
              <input value={form.travel_number} onChange={e => set('travel_number', e.target.value)}
                style={{ ...inp, fontFamily: 'monospace', fontWeight: '700' }} placeholder="FR1234, AZ0001..." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>From</label>
                <input value={form.from_location} onChange={e => set('from_location', e.target.value)} style={inp} placeholder="Rome FCO" />
              </div>
              <div>
                <label style={lbl}>Dep time</label>
                <input type="time" value={form.from_time} onChange={e => set('from_time', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>To</label>
                <input value={form.to_location} onChange={e => set('to_location', e.target.value)} style={inp} placeholder="Bari BRI" />
              </div>
              <div>
                <label style={lbl}>Arr time</label>
                <input type="time" value={form.to_time} onChange={e => set('to_time', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>p/up dep</label>
                <input value={form.pickup_dep} onChange={e => set('pickup_dep', e.target.value)} style={inp} placeholder="OA, TRANSPORT DEPT..." />
              </div>
              <div>
                <label style={lbl}>p/up arr</label>
                <input value={form.pickup_arr} onChange={e => set('pickup_arr', e.target.value)} style={inp} placeholder="Rental car, TRANSPORT..." />
              </div>
            </div>

            <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>🚐 Needs transport to/from hub</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Transport Dept. will handle pickup/dropoff</div>
              </div>
              <button type="button" onClick={() => set('needs_transport', !form.needs_transport)}
                style={{ width: '40px', height: '22px', borderRadius: '999px', border: 'none',
                  cursor: 'pointer', background: form.needs_transport ? '#2563eb' : '#e2e8f0',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
                <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px',
                  borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s', left: form.needs_transport ? '20px' : '2px', display: 'block' }} />
              </button>
            </div>

            <div style={rowSt}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                style={{ ...inp, resize: 'vertical', minHeight: '60px' }} placeholder="Any operational notes..." />
            </div>

            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    Delete Movement
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this movement? This cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setConfirmDel(false)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? '...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
              {error}
            </div>
          )}

          {/* Footer — primary action + secondary row */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0,
            position: 'sticky', bottom: 0, background: 'white', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button type="submit" disabled={saving}
              style={{ padding: '9px', borderRadius: '8px', border: 'none',
                background: saving ? '#94a3b8' : (isLegMode ? '#4c1d95' : '#0f2340'),
                color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Movement' : 'Save Changes'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveAndAddLeg} disabled={saving}
                style={{ flex: 2, padding: '8px', borderRadius: '8px', border: '1px solid #7c3aed',
                  background: '#f5f3ff', color: '#7c3aed', fontSize: '12px',
                  cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
                {'\u21aa'} Save & Add Connecting Leg
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main page ─────────────────────────────────────────────────
export default function TravelPage() {
  const PRODUCTION_ID = getProductionId()
  const router        = useRouter()
  const isMobile      = useIsMobile()
  const today         = isoToday()

  // Auth
  const [user, setUser] = useState(null)

  // Data
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)

  // Column config
  const [columnsConfig,     setColumnsConfig]     = useState([])
  const [columnsEditorOpen, setColumnsEditorOpen] = useState(false)
  const [applyingPreset,    setApplyingPreset]    = useState(false)

  // Date window
  const [windowStart, setWindowStart] = useState(() => isoAdd(isoToday(), -3))
  const [windowEnd,   setWindowEnd]   = useState(() => isoAdd(isoToday(), 10))

  // Movement sidebar
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [sidebarMode,   setSidebarMode]   = useState('new')
  const [sidebarTarget, setSidebarTarget] = useState(null)

  function openNew()   { setSidebarMode('new');  setSidebarTarget(null); setSidebarOpen(true) }
  function openEdit(m) { setSidebarMode('edit'); setSidebarTarget(m);    setSidebarOpen(true) }

  // Open sidebar pre-filled for the next connecting leg of a journey
  function openAddLeg(prevMovement) {
    const nextLeg = {
      __isLeg:       true,
      journey_id:    prevMovement.journey_id,
      travel_date:   prevMovement.travel_date,
      direction:     prevMovement.direction,
      travel_type:   prevMovement.travel_type,
      crew_id:       prevMovement.crew_id,
      full_name_raw: prevMovement.full_name_raw || prevMovement.crew?.full_name || '',
      from_location: prevMovement.to_location   || '',
      from_time:     prevMovement.to_time        ? prevMovement.to_time.slice(0, 5) : '',
    }
    setSidebarMode('new')
    setSidebarTarget(nextLeg)
    setSidebarOpen(true)
  }

  // Toast
  const [toast, setToast] = useState(null)
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  // ── Columns config loader ──────────────────────────────────
  const loadColumnsConfig = useCallback(async () => {
    if (!PRODUCTION_ID) return
    const { data } = await supabase
      .from('travel_columns')
      .select('*')
      .eq('production_id', PRODUCTION_ID)
      .order('display_order', { ascending: true })
      .order('created_at',    { ascending: true })
    setColumnsConfig(data || [])
  }, [PRODUCTION_ID])

  // ── Apply default preset ───────────────────────────────────
  async function applyDefaultPreset() {
    if (!PRODUCTION_ID || applyingPreset) return
    setApplyingPreset(true)
    try {
      const rows = TRAVEL_DEFAULT_PRESET.map(p => ({ ...p, production_id: PRODUCTION_ID }))
      const { error } = await supabase.from('travel_columns').insert(rows)
      if (error) throw error
      await loadColumnsConfig()
      showToast('Default preset applied')
    } catch (e) {
      showToast('Failed to apply preset: ' + (e.message || 'unknown'), 'error')
    } finally {
      setApplyingPreset(false)
    }
  }

  // ── Movements loader ───────────────────────────────────────
  const loadData = useCallback(async (start, end) => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase
      .from('travel_movements')
      .select(SELECT_FIELDS)
      .eq('production_id', PRODUCTION_ID)
      .gte('travel_date', start)
      .lte('travel_date', end)
      .order('travel_date', { ascending: true })
      .order('from_time',   { ascending: true, nullsLast: true })
    setMovements(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  // ── Auth check ─────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
  }, [])

  // ── Initial data load ──────────────────────────────────────
  useEffect(() => {
    if (user) {
      loadColumnsConfig()
      loadData(windowStart, windowEnd)
    }
  }, [user, loadColumnsConfig, loadData])

  // ── Reload when window changes ─────────────────────────────
  useEffect(() => {
    if (user) loadData(windowStart, windowEnd)
  }, [windowStart, windowEnd])

  // ── Window navigation ──────────────────────────────────────
  function shiftWindow(n) {
    setWindowStart(s => isoAdd(s, n))
    setWindowEnd(e   => isoAdd(e, n))
  }
  function resetWindow() {
    setWindowStart(isoAdd(isoToday(), -3))
    setWindowEnd(isoAdd(isoToday(), 10))
  }
  function pickDate(dateStr) {
    setWindowStart(isoAdd(dateStr, -3))
    setWindowEnd(isoAdd(dateStr, 10))
  }

  // ── Movement callbacks ─────────────────────────────────────
  function handleMovementSaved(saved, mode) {
    if (mode === 'new') {
      setMovements(prev => [...prev, saved].sort((a, b) =>
        a.travel_date.localeCompare(b.travel_date) || (a.from_time || '').localeCompare(b.from_time || '')
      ))
    } else {
      setMovements(prev => prev.map(m => m.id === saved.id ? saved : m))
    }
    showToast(mode === 'new' ? 'Movement added' : 'Movement updated')
  }

  function handleMovementDeleted(id) {
    setMovements(prev => prev.filter(m => m.id !== id))
    showToast('Movement deleted')
  }

  function handleColorSaved(rowId, colors) {
    setMovements(prev => prev.map(m => m.id === rowId ? { ...m, cell_colors: colors } : m))
  }

  function handleCellSaved(rowId, field, value) {
    if (field === '__error__') { showToast(value, 'error'); return }
    setMovements(prev => prev.map(m => m.id === rowId ? { ...m, [field]: value } : m))
    showToast('Saved')
  }

  // ── Filters ────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [filterDir,   setFilterDir]   = useState('ALL')
  const [filterType,  setFilterType]  = useState('ALL')
  const [filterMatch, setFilterMatch] = useState('ALL')
  const isFilterActive = search || filterDir !== 'ALL' || filterType !== 'ALL' || filterMatch !== 'ALL'

  function resetFilters() {
    setSearch(''); setFilterDir('ALL'); setFilterType('ALL'); setFilterMatch('ALL')
  }

  const filtered = useMemo(() => {
    return movements.filter(m => {
      const name = (m.crew?.full_name || m.full_name_raw || '').toLowerCase()
      if (search && !name.includes(search.toLowerCase())) return false
      if (filterDir  !== 'ALL' && m.direction !== filterDir) return false
      if (filterType !== 'ALL') {
        const matchTypes = filterType === 'OA' ? ['OA', 'SELF'] : [filterType]
        if (!matchTypes.includes(m.travel_type)) return false
      }
      if (filterMatch !== 'ALL' && m.match_status !== filterMatch) return false
      return true
    })
  }, [movements, search, filterDir, filterType, filterMatch])

  const { byDate, sortedDates } = useMemo(() => {
    const byDate = {}
    for (const m of filtered) {
      if (!byDate[m.travel_date]) byDate[m.travel_date] = []
      byDate[m.travel_date].push(m)
    }
    const sortedDates = Object.keys(byDate).sort()
    return { byDate, sortedDates }
  }, [filtered])

  const totalIn        = movements.filter(m => m.direction === 'IN').length
  const totalOut       = movements.filter(m => m.direction === 'OUT').length
  const totalUnmatched = movements.filter(m => m.match_status === 'unmatched').length
  const totalTransport = movements.filter(m => m.needs_transport).length

  // ── Pill helper ─────────────────────────────────────────────
  function Pill({ active, onClick, children, activeStyle }) {
    return (
      <button onClick={onClick} style={{
        padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
        fontWeight: '700', cursor: 'pointer', border: '1px solid',
        touchAction: 'manipulation',
        ...(active
          ? (activeStyle || { background: '#0f2340', color: 'white', borderColor: '#0f2340' })
          : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }),
      }}>
        {children}
      </button>
    )
  }

  // ── Auth guard ─────────────────────────────────────────────
  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading...
    </div>
  )

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      <Navbar currentPath="/dashboard/travel" />

      {/* ── Toolbar ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '8px 16px', minHeight: '52px',
        display: 'flex', alignItems: 'center', gap: '8px',
        position: 'sticky', top: '52px', zIndex: 21,
      }}>
        {/* Left: title + add */}
        <span style={{ fontSize: '18px' }}>✈️</span>
        <span style={{ fontWeight: '800', fontSize: isMobile ? '14px' : '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>
          Travel
        </span>
        <button onClick={openNew} style={{
          background: '#2563eb', color: 'white', border: 'none',
          borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
          fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        }}>
          + Add Movement
        </button>

        {/* Center: date navigation */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => shiftWindow(-7)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>◀</button>
          <input type="date"
            value={windowStart ? isoAdd(windowStart, 3) : today}
            onChange={e => pickDate(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer', minWidth: 0 }}
          />
          <button onClick={() => shiftWindow(7)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>▶</button>
          <button onClick={resetWindow}
            style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
            Today
          </button>
          <button onClick={() => loadData(windowStart, windowEnd)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
            &#8635;
          </button>
        </div>

        {/* Right: columns button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {columnsConfig.length === 0 && (
            <button onClick={applyDefaultPreset} disabled={applyingPreset}
              style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #2563eb',
                background: applyingPreset ? '#cbd5e1' : '#2563eb', color: 'white',
                fontSize: '11px', fontWeight: '700', cursor: applyingPreset ? 'default' : 'pointer',
                whiteSpace: 'nowrap' }}>
              {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
            </button>
          )}
          <button onClick={() => setColumnsEditorOpen(true)}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0',
              background: 'white', color: '#64748b', fontSize: '11px', fontWeight: '600',
              cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Columns {columnsConfig.length > 0 && `(${columnsConfig.length})`}
          </button>
        </div>
      </div>

      {/* ── Filter Row ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '6px 16px',
        display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        position: 'sticky', top: '104px', zIndex: 20,
      }}>
        <input type="text" placeholder="Search name..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '160px', minWidth: 0 }}
        />

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: '3px' }}>
          <Pill active={filterDir === 'ALL'} onClick={() => setFilterDir('ALL')}>ALL</Pill>
          <Pill active={filterDir === 'IN'}  onClick={() => setFilterDir('IN')}
            activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}>IN</Pill>
          <Pill active={filterDir === 'OUT'} onClick={() => setFilterDir('OUT')}
            activeStyle={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }}>OUT</Pill>
        </div>

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterType === 'ALL'}    onClick={() => setFilterType('ALL')}>ALL</Pill>
          <Pill active={filterType === 'FLIGHT'} onClick={() => setFilterType('FLIGHT')}>✈️ FLIGHT</Pill>
          <Pill active={filterType === 'TRAIN'}  onClick={() => setFilterType('TRAIN')}>🚂 TRAIN</Pill>
          <Pill active={filterType === 'OA'}     onClick={() => setFilterType('OA')}>🚗 OA</Pill>
          <Pill active={filterType === 'GROUND'} onClick={() => setFilterType('GROUND')}>🚐 GROUND</Pill>
          <Pill active={filterType === 'FERRY'}  onClick={() => setFilterType('FERRY')}>⛴️ FERRY</Pill>
        </div>

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: '3px' }}>
          <Pill active={filterMatch === 'ALL'}       onClick={() => setFilterMatch('ALL')}>ALL</Pill>
          <Pill active={filterMatch === 'matched'}   onClick={() => setFilterMatch('matched')}
            activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}>Matched</Pill>
          <Pill active={filterMatch === 'unmatched'} onClick={() => setFilterMatch('unmatched')}
            activeStyle={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>Unmatched</Pill>
        </div>

        {isFilterActive && (
          <button onClick={resetFilters}
            style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
              background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b' }}>
            x Reset
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: isMobile ? '12px' : '16px 24px' }}>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            NEXT_PUBLIC_PRODUCTION_ID not set in .env.local
          </div>
        )}

        {/* No columns configured */}
        {columnsConfig.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗂</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>No columns configured</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
              Click <strong>Apply Default Columns</strong> in the toolbar to use the standard 13-column layout,
              or click <strong>Columns</strong> to configure manually.
            </div>
            <button onClick={applyDefaultPreset} disabled={applyingPreset}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontSize: '13px', fontWeight: '800', cursor: applyingPreset ? 'default' : 'pointer' }}>
              {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
            </button>
          </div>
        )}

        {/* Summary bar */}
        {!loading && movements.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 20px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: '#374151', fontWeight: '700' }}>
              Total: <span style={{ fontWeight: '900', color: '#0f172a' }}>{movements.length}</span> movements
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>IN: <span style={{ fontWeight: '900' }}>{totalIn}</span></div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#c2410c' }}>OUT: <span style={{ fontWeight: '900' }}>{totalOut}</span></div>
            {totalUnmatched > 0 && (
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>Unmatched: <span style={{ fontWeight: '900' }}>{totalUnmatched}</span></div>
            )}
            {totalTransport > 0 && (
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>Need transport: <span style={{ fontWeight: '900' }}>{totalTransport}</span></div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{windowStart} to {windowEnd}</div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading travel movements...</div>

        ) : movements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>✈️</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>No travel movements found for this period</div>
          </div>

        ) : sortedDates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '14px', color: '#64748b' }}>No results - reset filters</div>
          </div>

        ) : (
          sortedDates.map(date => (
            <div key={date} style={{ marginBottom: '32px' }}>
              {/* Date header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #0f2340' }}>
                <span style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>📅 {fmtDateHeader(date)}</span>
                {date === today && (
                  <span style={{ fontSize: '10px', fontWeight: '800', background: '#fbbf24', color: '#78350f', padding: '2px 8px', borderRadius: '999px' }}>TODAY</span>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>{byDate[date].length} movements</span>
              </div>

              {/* Sections */}
              {SECTIONS.map(section => {
                const rows = byDate[date].filter(m => section.types.includes(m.travel_type))
                if (rows.length === 0) return null
                return (
                  <SectionTable
                    key={section.key}
                    section={section}
                    rows={rows}
                    today={today}
                    onCellSaved={handleCellSaved}
                    onEditRow={openEdit}
                    onColorSaved={handleColorSaved}
                    columnsConfig={columnsConfig}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Sidebars & overlays */}
      <MovementSidebar
        open={sidebarOpen} mode={sidebarMode} initial={sidebarTarget}
        onClose={() => setSidebarOpen(false)}
        onSaved={handleMovementSaved}
        onDeleted={handleMovementDeleted}
        onAddLeg={openAddLeg}
      />
      <TravelColumnsEditorSidebar
        open={columnsEditorOpen}
        onClose={() => setColumnsEditorOpen(false)}
        onChanged={loadColumnsConfig}
      />
      <Toast message={toast?.message} type={toast?.type} />
    </div>
  )
}
