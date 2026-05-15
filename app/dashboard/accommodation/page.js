'use client'

/**
 * /dashboard/accommodation
 * Accommodation Coordinator view — crew_stays grouped by hotel.
 * Architecture mirrors /dashboard/travel/page.js (S55-S59 series).
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'
import NotesPanel from '../../../lib/NotesPanel'
import { AccommodationColumnsEditorSidebar } from '../../../lib/AccommodationColumnsEditorSidebar'
import { ACCOMMODATION_DEFAULT_PRESET } from '../../../lib/accommodationColumnsCatalog'

// ─── Date helpers ─────────────────────────────────────────────
function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function isoAdd(dateStr, n) {
  const dt = new Date(dateStr + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function fmtDate(s) {
  if (!s) return '–'
  return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function nightsBetween(arrival, departure) {
  if (!arrival || !departure) return null
  const a = new Date(arrival + 'T12:00:00Z')
  const b = new Date(departure + 'T12:00:00Z')
  const n = Math.round((b - a) / 86400000)
  return n > 0 ? n : null
}
function getStayStatus(arrival, departure) {
  const today = isoToday()
  if (!arrival || !departure) return null
  if (today === arrival)    return { label: '🛬 CHECK-IN TODAY',  style: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' } }
  if (today === departure)  return { label: '🛫 CHECK-OUT TODAY', style: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' } }
  if (today > arrival && today < departure) return { label: '🏨 In Hotel', style: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' } }
  if (today < arrival)  return { label: '🔜 Upcoming', style: { bg: '#fefce8', color: '#a16207', border: '#fde68a' } }
  if (today >= departure) return { label: '✅ Checked Out', style: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' } }
  return null
}

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

// ─── NotesCell ────────────────────────────────────────────────
function NotesCell({ notesEntry, unreadCount = 0, onClick }) {
  const count    = notesEntry?.count || 0
  const lastNote = notesEntry?.lastNote || ''
  const preview  = lastNote.length > 45 ? lastNote.slice(0, 45) + '…' : lastNote
  return (
    <td
      onClick={onClick}
      title="Click to open notes"
      style={{ padding: '7px 10px', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      {count === 0 ? (
        <span style={{ color: '#cbd5e1', fontSize: '11px' }}>💬</span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            fontSize: '9px', fontWeight: '800',
            color: unreadCount > 0 ? '#ea580c' : '#92400e',
            background: unreadCount > 0 ? '#fff7ed' : '#fef3c7',
            border: `1px solid ${unreadCount > 0 ? '#fed7aa' : '#fcd34d'}`,
            padding: '1px 5px', borderRadius: '3px', flexShrink: 0,
          }}>
            💬 {count}
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {preview}
          </span>
        </span>
      )}
    </td>
  )
}

// ─── SELECT_FIELDS ─────────────────────────────────────────────
const SELECT_FIELDS = `
  id, production_id, crew_id, hotel_id, arrival_date, departure_date, room_type_notes, created_at,
  crew:crew_id(id, full_name, role, department),
  hotel:hotel_id(id, name)
`

// ─── EMPTY_STAY ────────────────────────────────────────────────
const EMPTY_STAY = {
  id: null,
  crew_id: null,
  hotel_id: '',
  arrival_date: '',
  departure_date: '',
  room_type_notes: '',
  cost_per_night: '',
  city_tax_total: '',
  total_cost_no_vat: '',
  total_cost_vat: '',
  po_number: '',
  invoice_number: '',
}

// ─── ClickableCell ─────────────────────────────────────────────
function ClickableCell({ value, onClick, style, emptyLabel = '—' }) {
  return (
    <td
      onClick={onClick}
      style={{ padding: '7px 10px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = style?.background || '' }}
    >
      {value || <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '10px' }}>{emptyLabel}</span>}
    </td>
  )
}

// ─── renderCell — data-driven ──────────────────────────────────
function renderCell(col, stay, { onEditRow, stayNotesMap, stayUnreadMap, today }) {
  const field = col.source_field
  switch (field) {
    case 'full_name':
      return (
        <td key={field} onClick={() => onEditRow(stay, 'full_name')}
          style={{ padding: '7px 10px', fontSize: '12px', fontWeight: '700', color: '#0f172a', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
          {stay.crew?.full_name || '—'}
        </td>
      )
    case 'role':
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stay.crew?.role || '—'}
        </td>
      )
    case 'department':
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stay.crew?.department
            ? <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{stay.crew.department}</span>
            : '—'}
        </td>
      )
    case 'room_type_notes':
      return (
        <ClickableCell key={field}
          value={stay.room_type_notes}
          onClick={() => onEditRow(stay, 'room_type_notes')}
          style={{ fontSize: '11px', color: '#374151' }}
        />
      )
    case 'arrival_date': {
      const isCI = stay.arrival_date === today
      return (
        <td key={field} onClick={() => onEditRow(stay, 'arrival_date')}
          style={{ padding: '7px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: isCI ? '800' : '500', color: isCI ? '#15803d' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
          {fmtDate(stay.arrival_date)}
        </td>
      )
    }
    case 'departure_date': {
      const isCO = stay.departure_date === today
      return (
        <td key={field} onClick={() => onEditRow(stay, 'departure_date')}
          style={{ padding: '7px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: isCO ? '800' : '500', color: isCO ? '#dc2626' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
          {fmtDate(stay.departure_date)}
        </td>
      )
    }
    case 'nights': {
      const n = nightsBetween(stay.arrival_date, stay.departure_date)
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
          {n != null ? <span style={{ fontWeight: '700', color: '#0f172a' }}>{n}🌙</span> : '—'}
        </td>
      )
    }
    case 'status': {
      const st = getStayStatus(stay.arrival_date, stay.departure_date)
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '10px' }}>
          {st ? (
            <span style={{ fontWeight: '700', padding: '2px 7px', borderRadius: '999px', background: st.style.bg, color: st.style.color, border: `1px solid ${st.style.border}`, whiteSpace: 'nowrap' }}>
              {st.label}
            </span>
          ) : '—'}
        </td>
      )
    }
    case 'notes':
      return (
        <NotesCell key={field}
          notesEntry={stayNotesMap ? (stayNotesMap[stay.id] || null) : null}
          unreadCount={stayUnreadMap ? (stayUnreadMap[stay.id] || 0) : 0}
          onClick={() => onEditRow(stay, 'notes')}
        />
      )
    case 'cost_per_night':
      return (
        <ClickableCell key={field}
          value={stay.cost_per_night != null ? `€${stay.cost_per_night}` : null}
          onClick={() => onEditRow(stay, 'cost_per_night')}
          style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}
        />
      )
    case 'city_tax_total':
      return (
        <ClickableCell key={field}
          value={stay.city_tax_total != null ? `€${stay.city_tax_total}` : null}
          onClick={() => onEditRow(stay, 'city_tax_total')}
          style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}
        />
      )
    case 'total_cost_no_vat':
      return (
        <ClickableCell key={field}
          value={stay.total_cost_no_vat != null ? `€${stay.total_cost_no_vat}` : null}
          onClick={() => onEditRow(stay, 'total_cost_no_vat')}
          style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}
        />
      )
    case 'total_cost_vat':
      return (
        <ClickableCell key={field}
          value={stay.total_cost_vat != null ? `€${stay.total_cost_vat}` : null}
          onClick={() => onEditRow(stay, 'total_cost_vat')}
          style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}
        />
      )
    case 'po_number':
      return (
        <ClickableCell key={field}
          value={stay.po_number}
          onClick={() => onEditRow(stay, 'po_number')}
          style={{ fontSize: '11px', color: '#374151' }}
        />
      )
    case 'invoice_number':
      return (
        <ClickableCell key={field}
          value={stay.invoice_number}
          onClick={() => onEditRow(stay, 'invoice_number')}
          style={{ fontSize: '11px', color: '#374151' }}
        />
      )
    default:
      return <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#cbd5e1' }}>—</td>
  }
}

// ─── StaySidebar ──────────────────────────────────────────────
function StaySidebar({ open, mode, initial, onClose, onSaved, onDeleted, currentUser, hotels }) {
  const PRODUCTION_ID = getProductionId()
  const [form, setForm]             = useState(EMPTY_STAY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError]           = useState(null)
  const [crewSearch, setCrewSearch]     = useState('')
  const [crewResults, setCrewResults]   = useState([])
  const [crewSearching, setCrewSearching] = useState(false)

  const notesRef = React.useRef(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDel(false)

    if (mode === 'edit' && initial) {
      setForm({
        id:              initial.id              || null,
        crew_id:         initial.crew_id         || null,
        hotel_id:        initial.hotel_id        || '',
        arrival_date:    initial.arrival_date    || '',
        departure_date:  initial.departure_date  || '',
        room_type_notes: initial.room_type_notes || '',
      })
      setCrewSearch(initial.crew?.full_name || '')
      setCrewResults([])

      // Focus requested field
      if (initial?.__focusField) {
        const focusKey = initial.__focusField
        setTimeout(() => {
          if (focusKey === 'notes' && notesRef.current) {
            notesRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 300)
      }
    } else {
      setForm(EMPTY_STAY)
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

  // ── Sync crew hotel_id, arrival_date, departure_date from all stays ──
  async function syncCrewDates(crewId) {
    if (!crewId || !PRODUCTION_ID) return
    const { data: allStays } = await supabase
      .from('crew_stays')
      .select('arrival_date, departure_date, hotel_id')
      .eq('crew_id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .order('arrival_date', { ascending: true })
    if (!allStays || allStays.length === 0) return
    const arrivals   = allStays.map(s => s.arrival_date).filter(Boolean).sort()
    const departures = allStays.map(s => s.departure_date).filter(Boolean).sort()
    const minArr     = arrivals[0]   || null
    const maxDep     = departures[departures.length - 1] || null
    // Use hotel from most recent stay
    const latestHotel = allStays[allStays.length - 1]?.hotel_id || null
    await supabase.from('crew').update({
      hotel_id:       latestHotel,
      arrival_date:   minArr,
      departure_date: maxDep,
    }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
  }

  function buildRow() {
    return {
      production_id:   PRODUCTION_ID,
      crew_id:         form.crew_id || null,
      hotel_id:        form.hotel_id || null,
      arrival_date:    form.arrival_date   || null,
      departure_date:  form.departure_date || null,
      room_type_notes: (form.room_type_notes || '').trim() || null,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.crew_id) { setError('Crew member required'); return }
    if (!form.arrival_date)   { setError('Arrival date required');   return }
    if (!form.departure_date) { setError('Departure date required'); return }
    setSaving(true)
    try {
      const row = buildRow()
      let result
      if (mode === 'new') {
        result = await supabase.from('crew_stays').insert(row).select(SELECT_FIELDS).single()
      } else {
        result = await supabase.from('crew_stays').update(row).eq('id', initial.id).select(SELECT_FIELDS).single()
      }
      if (result.error) { setError(result.error.message); return }
      await syncCrewDates(form.crew_id)
      onSaved(result.data, mode)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await supabase.from('crew_stays').delete().eq('id', initial.id)
    setDeleting(false)
    if (initial.crew_id) await syncCrewDates(initial.crew_id)
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

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
        background: 'white', borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#15803d', flexShrink: 0,
        }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🏨 New Stay' : '✏️ Edit Stay'}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', color: 'white', fontSize: '16px',
            lineHeight: 1, borderRadius: '6px', padding: '4px 8px',
          }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Crew search */}
            <div style={rowSt}>
              <label style={lbl}>Crew member *</label>
              <input
                value={crewSearch}
                onChange={e => {
                  setCrewSearch(e.target.value)
                  if (!e.target.value) set('crew_id', null)
                }}
                style={inp}
                placeholder="Type name to search crew..."
                autoComplete="off"
              />
              {crewSearching && (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching...</div>
              )}
              {crewResults.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden' }}>
                  {crewResults.map(c => (
                    <div key={c.id}
                      onClick={() => {
                        set('crew_id', c.id)
                        setCrewSearch(c.full_name)
                        setCrewResults([])
                      }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>{c.full_name}</span>
                      {c.role && <span style={{ fontSize: '11px', color: '#64748b' }}>{c.role}</span>}
                      {c.department && (
                        <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                          {c.department}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {form.crew_id && (
                <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', fontWeight: '600' }}>
                  ✓ Crew linked
                </div>
              )}
            </div>

            {/* Hotel dropdown */}
            <div style={rowSt}>
              <label style={lbl}>Hotel *</label>
              <select
                value={form.hotel_id}
                onChange={e => set('hotel_id', e.target.value)}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="">— Select hotel —</option>
                {(hotels || []).map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Check-in *</label>
                <input
                  type="date"
                  value={form.arrival_date}
                  onChange={e => set('arrival_date', e.target.value)}
                  style={inp}
                  required
                />
              </div>
              <div>
                <label style={lbl}>Check-out *</label>
                <input
                  type="date"
                  value={form.departure_date}
                  onChange={e => set('departure_date', e.target.value)}
                  style={inp}
                  required
                />
              </div>
            </div>

            {/* Nights preview */}
            {form.arrival_date && form.departure_date && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '12px', color: '#15803d', fontWeight: '700' }}>
                🌙 {nightsBetween(form.arrival_date, form.departure_date) ?? 0} night(s)
              </div>
            )}

            {/* Room / Notes */}
            <div style={rowSt}>
              <label style={lbl}>Room / Notes</label>
              <input
                value={form.room_type_notes}
                onChange={e => set('room_type_notes', e.target.value)}
                style={inp}
                placeholder="Room type, number, preferences..."
              />
            </div>

            {/* Notes Panel */}
            {form.crew_id && (
              <div ref={notesRef}>
                {form.id ? (
                  <NotesPanel
                    crewId={form.crew_id}
                    productionId={PRODUCTION_ID}
                    currentUser={currentUser}
                    linkedStayId={form.id}
                    accordion={true}
                  />
                ) : (
                  <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    💬 Save the stay first to add notes
                  </div>
                )}
              </div>
            )}

            {/* Danger Zone */}
            {mode === 'edit' && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    Delete Stay
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this stay? This cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setConfirmDel(false)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        Cancel
                      </button>
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

          {/* Footer buttons */}
          <div style={{
            padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0,
            position: 'sticky', bottom: 0, background: 'white', display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <button type="submit" disabled={saving}
              style={{
                padding: '9px', borderRadius: '8px', border: 'none',
                background: saving ? '#94a3b8' : '#15803d',
                color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800',
              }}>
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Stay' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose}
              style={{
                padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0',
                background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600',
              }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function AccommodationPage() {
  const PRODUCTION_ID = getProductionId()
  const router        = useRouter()
  const isMobile      = useIsMobile()
  const today         = isoToday()

  // Auth
  const [user, setUser]         = useState(null)
  const [userRole, setUserRole] = useState('ACCOMMODATION')

  // Data
  const [stays,   setStays]   = useState([])
  const [hotels,  setHotels]  = useState([])
  const [loading, setLoading] = useState(true)

  // Columns config
  const [columnsConfig,      setColumnsConfig]      = useState([])
  const [columnsEditorOpen,  setColumnsEditorOpen]  = useState(false)
  const [applyingPreset,     setApplyingPreset]     = useState(false)

  // Date window — mirrors Travel page pattern
  const [windowStart, setWindowStart] = useState(() => isoAdd(isoToday(), -3))
  const [windowEnd,   setWindowEnd]   = useState(() => isoAdd(isoToday(), 10))

  // Sidebar
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [sidebarMode,   setSidebarMode]   = useState('new')
  const [sidebarTarget, setSidebarTarget] = useState(null)

  // Notes maps — keyed by linked_stay_id
  const [stayNotesMap,  setStayNotesMap]  = useState({})
  const [stayUnreadMap, setStayUnreadMap] = useState({})

  // Filters
  const [search,       setSearch]       = useState('')
  const [filterHotel,  setFilterHotel]  = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')

  // Toast
  const [toast, setToast] = useState(null)
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  function openNew() {
    setSidebarMode('new')
    setSidebarTarget(null)
    setSidebarOpen(true)
  }
  function openEdit(stay, focusField) {
    setSidebarMode('edit')
    setSidebarTarget({ ...stay, __focusField: focusField || null })
    setSidebarOpen(true)
  }

  // ── Load columns config ────────────────────────────────────
  const loadColumnsConfig = useCallback(async () => {
    if (!PRODUCTION_ID) return
    const { data } = await supabase
      .from('accommodation_columns')
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
      const rows = ACCOMMODATION_DEFAULT_PRESET.map(p => ({ ...p, production_id: PRODUCTION_ID }))
      const { error } = await supabase.from('accommodation_columns').insert(rows)
      if (error) throw error
      await loadColumnsConfig()
      showToast('Default preset applied')
    } catch (e) {
      showToast('Failed to apply preset: ' + (e.message || 'unknown'), 'error')
    } finally {
      setApplyingPreset(false)
    }
  }

  // ── Date window navigation ─────────────────────────────────
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

  // ── Load stays (filtered by date window overlap) ───────────
  const loadData = useCallback(async (start, end) => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const s = start || windowStart
    const e = end   || windowEnd
    const { data } = await supabase
      .from('crew_stays')
      .select(SELECT_FIELDS)
      .eq('production_id', PRODUCTION_ID)
      .lte('arrival_date',   e)
      .gte('departure_date', s)
      .order('hotel_id',     { ascending: true })
      .order('arrival_date', { ascending: true })
    setStays(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  // ── Load hotels (is_hotel = true) ──────────────────────────
  const loadHotels = useCallback(async () => {
    if (!PRODUCTION_ID) return
    const { data } = await supabase
      .from('locations')
      .select('id, name')
      .eq('production_id', PRODUCTION_ID)
      .eq('is_hotel', true)
    setHotels(data || [])
  }, [PRODUCTION_ID])

  // ── Load notes maps ────────────────────────────────────────
  const loadNotesMap = useCallback(async (userId) => {
    if (!PRODUCTION_ID || !userId) return
    const { data } = await supabase
      .from('crew_notes')
      .select('crew_id, linked_stay_id, author_id, read_by, content, created_at')
      .eq('production_id', PRODUCTION_ID)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
    if (!data) return

    const stayTotal   = {}
    const stayLastMap = {}
    const stayUnread  = {}

    for (const note of data) {
      if (!note.linked_stay_id) continue
      const sid = note.linked_stay_id
      stayTotal[sid] = (stayTotal[sid] || 0) + 1
      if (!stayLastMap[sid]) stayLastMap[sid] = note.content || ''
      if (note.author_id === userId) continue
      if ((note.read_by || []).includes(userId)) continue
      stayUnread[sid] = (stayUnread[sid] || 0) + 1
    }

    const notesMap = {}
    for (const sid of Object.keys(stayTotal)) {
      notesMap[sid] = { count: stayTotal[sid], lastNote: stayLastMap[sid] || '' }
    }
    setStayNotesMap(notesMap)
    setStayUnreadMap(stayUnread)
  }, [PRODUCTION_ID])

  // ── Auth check + load real role ────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (PRODUCTION_ID) {
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('production_id', PRODUCTION_ID)
          .maybeSingle()
        if (roleRow?.role) setUserRole(roleRow.role)
      }
    })
  }, [])

  // ── Initial data load ──────────────────────────────────────
  useEffect(() => {
    if (user) {
      loadData(windowStart, windowEnd)
      loadHotels()
      loadColumnsConfig()
      loadNotesMap(user.id)
    }
  }, [user])

  // ── Reload when window changes ─────────────────────────────
  useEffect(() => {
    if (user) loadData(windowStart, windowEnd)
  }, [windowStart, windowEnd])

  // ── Realtime subscription on crew_notes ───────────────────
  useEffect(() => {
    if (!user || !PRODUCTION_ID) return
    const channel = supabase
      .channel(`crew_notes:accommodation:${PRODUCTION_ID}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crew_notes',
        filter: `production_id=eq.${PRODUCTION_ID}`,
      }, () => { loadNotesMap(user.id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, PRODUCTION_ID, loadNotesMap])

  // ── Stay callbacks ─────────────────────────────────────────
  function handleStaySaved(saved, mode) {
    if (mode === 'new') {
      setStays(prev => [...prev, saved].sort((a, b) => {
        const ha = a.hotel?.name || ''
        const hb = b.hotel?.name || ''
        if (ha !== hb) return ha.localeCompare(hb)
        return (a.arrival_date || '').localeCompare(b.arrival_date || '')
      }))
    } else {
      setStays(prev => prev.map(s => s.id === saved.id ? saved : s))
    }
    showToast(mode === 'new' ? 'Stay added' : 'Stay updated')
  }

  function handleStayDeleted(id) {
    setStays(prev => prev.filter(s => s.id !== id))
    showToast('Stay deleted')
  }

  // ── Filtered stays ─────────────────────────────────────────
  const filtered = useMemo(() => {
    return stays.filter(s => {
      const name = (s.crew?.full_name || '').toLowerCase()
      if (search && !name.includes(search.toLowerCase())) return false
      if (filterHotel !== 'ALL' && (s.hotel?.name || 'No Hotel') !== filterHotel) return false
      if (filterStatus !== 'ALL') {
        const st = getStayStatus(s.arrival_date, s.departure_date)
        if (!st || !st.label.includes(filterStatus)) return false
      }
      return true
    })
  }, [stays, search, filterHotel, filterStatus])

  // ── Group by hotel ─────────────────────────────────────────
  const { groupedByHotel, sortedHotels } = useMemo(() => {
    const grouped = {}
    for (const stay of filtered) {
      const hotelName = stay.hotel?.name || 'No Hotel'
      if (!grouped[hotelName]) grouped[hotelName] = []
      grouped[hotelName].push(stay)
    }
    const sorted = Object.keys(grouped).sort()
    return { groupedByHotel: grouped, sortedHotels: sorted }
  }, [filtered])

  // ── Hotel list for filter pills ────────────────────────────
  const hotelNames = useMemo(() => {
    const names = new Set()
    for (const s of stays) names.add(s.hotel?.name || 'No Hotel')
    return Array.from(names).sort()
  }, [stays])

  // ── Stats ──────────────────────────────────────────────────
  const statCheckIn  = stays.filter(s => s.arrival_date === today).length
  const statCheckOut = stays.filter(s => s.departure_date === today).length
  const statInHotel  = stays.filter(s => today > s.arrival_date && today < s.departure_date).length

  // ── Pill helper ────────────────────────────────────────────
  function Pill({ active, onClick, children, activeStyle }) {
    return (
      <button onClick={onClick} style={{
        padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
        fontWeight: '700', cursor: 'pointer', border: '1px solid',
        touchAction: 'manipulation',
        ...(active
          ? (activeStyle || { background: '#15803d', color: 'white', borderColor: '#15803d' })
          : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }),
      }}>
        {children}
      </button>
    )
  }

  const isFilterActive = search || filterHotel !== 'ALL' || filterStatus !== 'ALL'
  function resetFilters() {
    setSearch('')
    setFilterHotel('ALL')
    setFilterStatus('ALL')
  }

  // ── Auth guard ─────────────────────────────────────────────
  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading...
    </div>
  )

  // ── Render ─────────────────────────────────────────────────
  const NAVBAR_H    = 52
  const TOOLBAR_H   = 52
  const FILTER_TOP  = NAVBAR_H + TOOLBAR_H

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      <Navbar currentPath="/dashboard/accommodation" />

      {/* ── Toolbar ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '8px 16px', minHeight: `${TOOLBAR_H}px`,
        display: 'flex', alignItems: 'center', gap: '8px',
        position: 'sticky', top: `${NAVBAR_H}px`, zIndex: 21,
      }}>
        <span style={{ fontSize: '18px' }}>🏨</span>
        <span style={{ fontWeight: '800', fontSize: isMobile ? '14px' : '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>
          Accommodation
        </span>
        <button onClick={openNew} style={{
          background: '#15803d', color: 'white', border: 'none',
          borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
          fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(21,128,61,0.3)',
        }}>
          + Add Stay
        </button>

        {/* Date window navigator — mirrors Travel page */}
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
            style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#15803d', whiteSpace: 'nowrap' }}>
            Today
          </button>
          <button onClick={() => loadData(windowStart, windowEnd)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
            ↺
          </button>
        </div>

        {/* Columns button — mirrors Travel page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {columnsConfig.length === 0 && (
            <button onClick={applyDefaultPreset} disabled={applyingPreset}
              style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #15803d', background: applyingPreset ? '#cbd5e1' : '#15803d', color: 'white', fontSize: '11px', fontWeight: '700', cursor: applyingPreset ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
            </button>
          )}
          <button onClick={() => setColumnsEditorOpen(true)}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Columns {columnsConfig.length > 0 && `(${columnsConfig.length})`}
          </button>
        </div>
      </div>

      {/* ── Filter Row ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '6px 16px',
        display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        position: 'sticky', top: `${FILTER_TOP}px`, zIndex: 20,
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '160px', minWidth: 0 }}
        />

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Hotel pills */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterHotel === 'ALL'} onClick={() => setFilterHotel('ALL')}>ALL</Pill>
          {hotelNames.map(name => (
            <Pill
              key={name}
              active={filterHotel === name}
              onClick={() => setFilterHotel(name)}
              activeStyle={{ background: '#0f2340', color: 'white', borderColor: '#0f2340' }}
            >
              🏨 {name}
            </Pill>
          ))}
        </div>

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Status pills */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')}>ALL</Pill>
          <Pill
            active={filterStatus === 'In Hotel'}
            onClick={() => setFilterStatus('In Hotel')}
            activeStyle={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
          >🏨 In Hotel</Pill>
          <Pill
            active={filterStatus === 'CHECK-IN TODAY'}
            onClick={() => setFilterStatus('CHECK-IN TODAY')}
            activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
          >🛬 Check-in Today</Pill>
          <Pill
            active={filterStatus === 'CHECK-OUT TODAY'}
            onClick={() => setFilterStatus('CHECK-OUT TODAY')}
            activeStyle={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}
          >🛫 Check-out Today</Pill>
          <Pill
            active={filterStatus === 'Upcoming'}
            onClick={() => setFilterStatus('Upcoming')}
            activeStyle={{ background: '#fefce8', color: '#a16207', borderColor: '#fde68a' }}
          >🔜 Upcoming</Pill>
          <Pill
            active={filterStatus === 'Checked Out'}
            onClick={() => setFilterStatus('Checked Out')}
            activeStyle={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}
          >✅ Checked Out</Pill>
        </div>

        {isFilterActive && (
          <button onClick={resetFilters} style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b',
          }}>
            ✕ Reset
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

        {/* ── Stats banner ── */}
        {!loading && stays.length > 0 && (
          <div style={{
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
            padding: '12px 20px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '12px', color: '#374151', fontWeight: '700' }}>
              Total: <span style={{ fontWeight: '900', color: '#0f172a' }}>{stays.length}</span> stays
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>
              Check-in today: <span style={{ fontWeight: '900' }}>{statCheckIn}</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>
              Check-out today: <span style={{ fontWeight: '900' }}>{statCheckOut}</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>
              In hotel: <span style={{ fontWeight: '900' }}>{statInHotel}</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>
              {windowStart} → {windowEnd}
            </div>
          </div>
        )}

        {/* ── No columns configured banner ── */}
        {columnsConfig.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗂</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>No columns configured</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
              Click <strong>Apply Default Columns</strong> to use the standard layout, or click <strong>Columns</strong> to configure manually.
            </div>
            <button onClick={applyDefaultPreset} disabled={applyingPreset}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', cursor: applyingPreset ? 'default' : 'pointer' }}>
              {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
            </button>
          </div>
        )}

        {/* ── Loading / Empty states ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            Loading stays...
          </div>

        ) : stays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏨</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>No stays found</div>
            <button onClick={openNew} style={{
              marginTop: '14px', padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
            }}>
              + Add First Stay
            </button>
          </div>

        ) : sortedHotels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '14px', color: '#64748b' }}>No results — reset filters</div>
          </div>

        ) : (
          sortedHotels.map(hotelName => {
            const hotelStays = groupedByHotel[hotelName]
            return (
              <div key={hotelName} style={{ marginBottom: '32px' }}>

                {/* Hotel section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 14px', marginBottom: '0',
                  background: '#f0fdf4', border: '1px solid #86efac',
                  borderRadius: '8px 8px 0 0', borderBottom: 'none',
                }}>
                  <span style={{ fontSize: '15px' }}>🏨</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#14532d', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {hotelName}
                  </span>
                  <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '4px', fontWeight: '600' }}>
                    {hotelStays.length} guest{hotelStays.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Table — data-driven via columnsConfig */}
                {columnsConfig.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{
                      width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
                      border: '1px solid #e2e8f0', borderTop: '1px solid #86efac',
                      borderRadius: '0 0 8px 8px', overflow: 'hidden',
                      minWidth: columnsConfig.reduce((sum, c) => sum + parseInt(c.width || '100'), 0) + 'px',
                    }}>
                      <colgroup>
                        {columnsConfig.map(col => (
                          <col key={col.source_field} style={{ width: col.width }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          {columnsConfig.map(col => (
                            <th key={col.source_field} style={{
                              padding: '6px 8px', fontSize: '10px', fontWeight: '800',
                              color: col.source_field === 'notes' ? '#2563eb' : '#64748b',
                              textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              letterSpacing: '0.05em', textTransform: 'uppercase',
                              borderBottom: '1px solid #e2e8f0',
                            }}>
                              {col.header_label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hotelStays.map(stay => {
                          const isCI    = stay.arrival_date === today
                          const isCO    = stay.departure_date === today
                          const isToday = isCI || isCO
                          const bgColor = isCI ? '#f0fdf4' : isCO ? '#fef2f2' : 'white'
                          return (
                            <tr key={stay.id} style={{
                              background: bgColor,
                              borderLeft: isCI ? '3px solid #22c55e' : isCO ? '3px solid #ef4444' : '3px solid transparent',
                              outline: isToday ? '2px solid #fbbf24' : 'none',
                              outlineOffset: '-2px',
                            }}>
                              {columnsConfig.map(col =>
                                renderCell(col, stay, { onEditRow: openEdit, stayNotesMap, stayUnreadMap, today })
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Sidebars & Toast ── */}
      <AccommodationColumnsEditorSidebar
        open={columnsEditorOpen}
        onClose={() => setColumnsEditorOpen(false)}
        onChanged={loadColumnsConfig}
      />
      <StaySidebar
        open={sidebarOpen}
        mode={sidebarMode}
        initial={sidebarTarget}
        onClose={() => setSidebarOpen(false)}
        onSaved={handleStaySaved}
        onDeleted={handleStayDeleted}
        hotels={hotels}
        currentUser={user ? { id: user.id, name: user.user_metadata?.full_name || user.email, role: userRole } : null}
      />
      <Toast message={toast?.message} type={toast?.type} />
    </div>
  )
}
