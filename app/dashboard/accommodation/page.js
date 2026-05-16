'use client'

/**
 * /dashboard/accommodation
 * S66 — 16 May 2026
 * Accommodation Coordinator view — crew_stays grouped by hotel.
 * Two views: List (configurable columns) + Calendar (Excel-style grid).
 * S66-J: sticky thead + sticky NAME/ROLE columns with dynamic offset
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
import SubgroupManagerSidebar from '../../../lib/SubgroupManagerSidebar'

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
function fmtDayCol(s) {
  // "16 May" format for calendar columns
  const d = new Date(s + 'T12:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
function startOfMonth(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function endOfMonth(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset + 1)
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
// Generate array of ISO date strings between start and end inclusive
function daysInRange(start, end) {
  const days = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = isoAdd(cur, 1)
  }
  return days
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
    <td onClick={onClick} title="Click to open notes"
      style={{ padding: '7px 10px', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}>
      {count === 0 ? (
        <span style={{ color: '#cbd5e1', fontSize: '11px' }}>💬</span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '9px', fontWeight: '800', color: unreadCount > 0 ? '#ea580c' : '#92400e', background: unreadCount > 0 ? '#fff7ed' : '#fef3c7', border: `1px solid ${unreadCount > 0 ? '#fed7aa' : '#fcd34d'}`, padding: '1px 5px', borderRadius: '3px', flexShrink: 0 }}>
            💬 {count}
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
        </span>
      )}
    </td>
  )
}

// ─── SELECT_FIELDS ─────────────────────────────────────────────
const SELECT_FIELDS = `
  id, production_id, crew_id, hotel_id, arrival_date, departure_date,
  room_type_notes, cost_per_night, city_tax_total, total_cost_no_vat,
  total_cost_vat, po_number, invoice_number, created_at, subgroup_id,
  crew:crew_id(id, full_name, role, department),
  hotel:hotel_id(id, name),
  subgroup:subgroup_id(id, name)
`

// ─── EMPTY_STAY ────────────────────────────────────────────────
const EMPTY_STAY = {
  id: null, crew_id: null, hotel_id: '', arrival_date: '', departure_date: '',
  subgroup_id: null,
  room_type_notes: '', cost_per_night: '', city_tax_total: '',
  total_cost_no_vat: '', total_cost_vat: '', po_number: '', invoice_number: '',
}

// ─── ClickableCell ─────────────────────────────────────────────
function ClickableCell({ value, onClick, style, emptyLabel = '—' }) {
  return (
    <td onClick={onClick}
      style={{ padding: '7px 10px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = style?.background || '' }}>
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
      return <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stay.crew?.role || '—'}</td>
    case 'department':
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stay.crew?.department ? <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{stay.crew.department}</span> : '—'}
        </td>
      )
    case 'room_type_notes':
      return <ClickableCell key={field} value={stay.room_type_notes} onClick={() => onEditRow(stay, 'room_type_notes')} style={{ fontSize: '11px', color: '#374151' }} />
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
      return <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>{n != null ? <span style={{ fontWeight: '700', color: '#0f172a' }}>{n}🌙</span> : '—'}</td>
    }
    case 'status': {
      const st = getStayStatus(stay.arrival_date, stay.departure_date)
      return (
        <td key={field} style={{ padding: '7px 10px', fontSize: '10px' }}>
          {st ? <span style={{ fontWeight: '700', padding: '2px 7px', borderRadius: '999px', background: st.style.bg, color: st.style.color, border: `1px solid ${st.style.border}`, whiteSpace: 'nowrap' }}>{st.label}</span> : '—'}
        </td>
      )
    }
    case 'notes':
      return <NotesCell key={field} notesEntry={stayNotesMap ? (stayNotesMap[stay.id] || null) : null} unreadCount={stayUnreadMap ? (stayUnreadMap[stay.id] || 0) : 0} onClick={() => onEditRow(stay, 'notes')} />
    case 'cost_per_night':
      return <ClickableCell key={field} value={stay.cost_per_night != null ? `€${stay.cost_per_night}` : null} onClick={() => onEditRow(stay, 'cost_per_night')} style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }} />
    case 'city_tax_total':
      return <ClickableCell key={field} value={stay.city_tax_total != null ? `€${stay.city_tax_total}` : null} onClick={() => onEditRow(stay, 'city_tax_total')} style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }} />
    case 'total_cost_no_vat':
      return <ClickableCell key={field} value={stay.total_cost_no_vat != null ? `€${stay.total_cost_no_vat}` : null} onClick={() => onEditRow(stay, 'total_cost_no_vat')} style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }} />
    case 'total_cost_vat':
      return <ClickableCell key={field} value={stay.total_cost_vat != null ? `€${stay.total_cost_vat}` : null} onClick={() => onEditRow(stay, 'total_cost_vat')} style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }} />
    case 'po_number':
      return <ClickableCell key={field} value={stay.po_number} onClick={() => onEditRow(stay, 'po_number')} style={{ fontSize: '11px', color: '#374151' }} />
    case 'invoice_number':
      return <ClickableCell key={field} value={stay.invoice_number} onClick={() => onEditRow(stay, 'invoice_number')} style={{ fontSize: '11px', color: '#374151' }} />
    default:
      return <td key={field} style={{ padding: '7px 10px', fontSize: '11px', color: '#cbd5e1' }}>—</td>
  }
}

// ─── CalendarView ──────────────────────────────────────────────
function CalendarView({ groupedByHotel, sortedHotels, days, today, onEditRow, subgroupsByHotel, hotels, showCosts, stickyTop }) {
  const NAME_W        = 180
  const ROLE_W        = 120
  const DAY_W         = 28
  const NIGHT_W       = 44
  const ROOM_W        = 120
  const CITYTAX_W     = 68
  const RATE_NOVAT_W  = 76
  const TOTNOVAT_W    = 88
  const TOTNOVAT_TX_W = 100
  const RATE_VAT_W    = 76
  const TOTVAT_W      = 88
  const TOTVAT_TX_W   = 100
  const VAT_AMT_W     = 80
  const PO_W          = 80
  const INV_W         = 80
  const costCols = showCosts ? [
    { key: 'city_tax',      label: 'City Tax',        width: CITYTAX_W },
    { key: 'rate_novat',    label: 'night w/o VAT',   width: RATE_NOVAT_W },
    { key: 'tot_no_vat',    label: 'TOT W/O VAT',     width: TOTNOVAT_W },
    { key: 'tot_novat_tax', label: 'Tot W/O VAT+tax', width: TOTNOVAT_TX_W },
    { key: 'rate_vat',      label: 'night w VAT',     width: RATE_VAT_W },
    { key: 'tot_vat',       label: 'TOT W.VAT',       width: TOTVAT_W },
    { key: 'tot_vat_tax',   label: 'Tot. + City Tax', width: TOTVAT_TX_W },
    { key: 'vat_amt',       label: 'TOT VAT',         width: VAT_AMT_W },
    { key: 'po',            label: 'P.O.',            width: PO_W },
    { key: 'inv',           label: 'N°Fatt.',         width: INV_W },
  ] : []
  const totalWidth = NAME_W + ROLE_W + days.length * DAY_W + NIGHT_W + ROOM_W + costCols.reduce((s, c) => s + c.width, 0)

  // Day-of-week abbreviation
  function dayLetter(iso) {
    const d = new Date(iso + 'T12:00:00Z')
    return ['S','M','T','W','T','F','S'][d.getUTCDay()]
  }

  function cellStyle(iso, stay) {
    const inRange = iso >= stay.arrival_date && iso < stay.departure_date
    const isCI    = iso === stay.arrival_date
    const isCO    = iso === stay.departure_date
    if (isCI)    return { background: '#15803d', title: '🛬 Check-in' }
    if (isCO)    return { background: '#fca5a5', title: '🛫 Check-out' }
    if (inRange) return { background: '#86efac', title: '🏨 In Hotel' }
    return null
  }

  const isWeekend = (iso) => {
    const d = new Date(iso + 'T12:00:00Z').getUTCDay()
    return d === 0 || d === 6
  }

  function countPresent(stayList, dayIso) {
    return stayList.filter(s => s.arrival_date && s.departure_date && s.arrival_date <= dayIso && dayIso < s.departure_date).length
  }

  const hotelNameToId = Object.fromEntries((hotels || []).map(h => [h.name, h.id]))

  return (
    <table style={{
      borderCollapse: 'collapse', tableLayout: 'fixed',
      minWidth: totalWidth + 'px', width: '100%', fontSize: '11px',
    }}>
        <colgroup>
          <col style={{ width: NAME_W + 'px' }} />
          <col style={{ width: ROLE_W + 'px' }} />
          {days.map(d => <col key={d} style={{ width: DAY_W + 'px' }} />)}
          <col style={{ width: NIGHT_W + 'px' }} />
          <col style={{ width: ROOM_W + 'px' }} />
          {costCols.map(c => <col key={c.key} style={{ width: c.width + 'px' }} />)}
        </colgroup>

        {/* Header — day of week — MODIFICA 4: sticky on individual th, not thead */}
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: '#64748b', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: stickyTop, left: 0, background: '#f8fafc', zIndex: 13, boxShadow: '2px 2px 4px rgba(0,0,0,0.08)' }}>NAME</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: '#64748b', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: stickyTop, left: NAME_W, background: '#f8fafc', zIndex: 13, boxShadow: '2px 2px 4px rgba(0,0,0,0.08)' }}>ROLE</th>
            {days.map(d => (
              <th key={d} style={{
                padding: '2px 1px', textAlign: 'center', fontSize: '9px', fontWeight: d === today ? '900' : '600',
                color: d === today ? '#15803d' : isWeekend(d) ? '#94a3b8' : '#64748b',
                borderBottom: '1px solid #e2e8f0',
                background: d === today ? '#f0fdf4' : isWeekend(d) ? '#fafafa' : '#f8fafc',
                borderLeft: d === today ? '1px solid #86efac' : '1px solid #f1f5f9',
                position: 'sticky', top: stickyTop, zIndex: 11, boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
              }}>
                <div>{dayLetter(d)}</div>
                <div style={{ fontSize: '8px', fontWeight: '400' }}>{new Date(d + 'T12:00:00Z').getUTCDate()}</div>
              </th>
            ))}
            <th style={{ padding: '4px 4px', textAlign: 'center', fontSize: '10px', fontWeight: '800', color: '#64748b', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', position: 'sticky', top: stickyTop, zIndex: 11, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>🌙</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: '#64748b', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', position: 'sticky', top: stickyTop, zIndex: 11, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>ROOM</th>
            {costCols.map(c => (
              <th key={c.key} style={{ padding: '4px 6px', textAlign: 'right', fontSize: '9px', fontWeight: '800', color: '#2563eb', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #dbeafe', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: stickyTop, zIndex: 11, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedHotels.map(hotelName => {
            const hotelStays = groupedByHotel[hotelName]
            const hotelId = hotelNameToId[hotelName]
            const sgs = (hotelId && subgroupsByHotel && subgroupsByHotel[hotelId]) || []

            // Build sections: each named subgroup then ungrouped at the end
            let sections
            if (sgs.length === 0) {
              sections = [{ sg: null, stays: hotelStays }]
            } else {
              const sgMap = Object.fromEntries(sgs.map(sg => [sg.id, { sg, stays: [] }]))
              const ungrouped = []
              for (const stay of hotelStays) {
                if (stay.subgroup_id && sgMap[stay.subgroup_id]) sgMap[stay.subgroup_id].stays.push(stay)
                else ungrouped.push(stay)
              }
              sections = [
                ...Object.values(sgMap).filter(x => x.stays.length > 0),
                ...(ungrouped.length > 0 ? [{ sg: null, stays: ungrouped }] : []),
              ]
            }
            const hasSections = sections.some(x => x.sg !== null)

            // Shared row renderer — keeps alternating stripe index across subgroups
            let rowIndex = 0
            const renderStayRow = (stay) => {
              const ri = rowIndex++
              const nights = nightsBetween(stay.arrival_date, stay.departure_date)
              const isCI   = stay.arrival_date === today
              const isCO   = stay.departure_date === today
              const rowBg  = isCI ? '#f0fdf4' : isCO ? '#fef2f2' : ri % 2 === 0 ? 'white' : '#fafafa'
              return (
                <tr key={stay.id} style={{ background: rowBg }}
                  onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => c.style.background === '' && (c.style.background = '#f8fafc')) }}
                  onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => { if (c.style.background === '#f8fafc') c.style.background = '' }) }}>

                  {/* Name — sticky left 0 */}
                  <td onClick={() => onEditRow(stay, 'full_name')}
                    style={{ padding: '5px 8px', fontWeight: '700', fontSize: '11px', color: '#0f172a', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: rowBg, zIndex: 2, borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg }}>
                    {stay.crew?.full_name || '—'}
                  </td>

                  {/* Role — sticky left NAME_W */}
                  <td style={{ padding: '5px 8px', fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', position: 'sticky', left: NAME_W, background: rowBg, zIndex: 2, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}>
                    {stay.crew?.role || '—'}
                  </td>

                  {/* Day cells */}
                  {days.map(d => {
                    const cs = cellStyle(d, stay)
                    return (
                      <td key={d}
                        title={cs ? `${stay.crew?.full_name} — ${cs.title}` : ''}
                        onClick={cs ? () => onEditRow(stay, 'arrival_date') : undefined}
                        style={{
                          padding: 0, textAlign: 'center', height: '28px',
                          background: cs ? cs.background : (d === today ? '#f0fdf420' : isWeekend(d) ? '#fafafa' : 'transparent'),
                          borderLeft: d === today ? '1px solid #86efac40' : '1px solid #f1f5f9',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: cs ? 'pointer' : 'default',
                        }}>
                        {cs && <span style={{ fontSize: '8px', color: cs.background === '#15803d' ? 'white' : '#374151', fontWeight: '700' }}>
                          {cs.background === '#15803d' ? '▶' : cs.background === '#fca5a5' ? '◀' : ''}
                        </span>}
                      </td>
                    )
                  })}

                  {/* Nights */}
                  <td style={{ padding: '5px 4px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#0f172a', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                    {nights != null ? nights : '—'}
                  </td>

                  {/* Room/Notes */}
                  <td onClick={() => onEditRow(stay, 'room_type_notes')}
                    style={{ padding: '5px 8px', fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                    {stay.room_type_notes || <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  {/* Cost columns — 10 cols matching Excel */}
                  {showCosts && (() => {
                    const n    = parseFloat(stay.cost_per_night)    || 0
                    const ct   = parseFloat(stay.city_tax_total)    || 0
                    const nv   = parseFloat(stay.total_cost_no_vat) || 0
                    const tv   = parseFloat(stay.total_cost_vat)    || 0
                    const nv_t = nv + ct           // Tot W/O VAT + city tax
                    const nw   = n  ? n * 1.1 : 0  // night w VAT ≈ night w/o VAT × 1.10
                    const tv_t = tv + ct            // Tot. + City Tax
                    const vata = tv - nv            // TOT VAT amount
                    const dash = <span style={{ color: '#e2e8f0' }}>—</span>
                    const fmt  = (v, raw) => v > 0 || raw > 0 ? `€${Number(raw || v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash
                    const fmtv = (raw) => raw != null && raw !== '' && Number(raw) !== 0 ? `€${Number(raw).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash
                    const cellSt = { padding: '5px 6px', fontSize: '10px', textAlign: 'right', fontFamily: 'monospace', color: '#374151', borderLeft: '1px solid #dbeafe', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden' }
                    return (
                      <>
                        <td style={cellSt}>{fmtv(stay.city_tax_total)}</td>
                        <td style={cellSt}>{fmtv(stay.cost_per_night)}</td>
                        <td style={cellSt}>{fmtv(stay.total_cost_no_vat)}</td>
                        <td style={cellSt}>{nv_t > 0 ? `€${nv_t.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash}</td>
                        <td style={{ ...cellSt, color: '#475569' }}>{nw > 0 ? `€${nw.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash}</td>
                        <td style={cellSt}>{fmtv(stay.total_cost_vat)}</td>
                        <td style={cellSt}>{tv_t > 0 ? `€${tv_t.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash}</td>
                        <td style={{ ...cellSt, color: '#7c3aed' }}>{vata > 0 ? `€${vata.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : dash}</td>
                        <td style={{ ...cellSt, color: '#0f2340', fontFamily: 'inherit' }}>{stay.po_number      || dash}</td>
                        <td style={{ ...cellSt, color: '#0f2340', fontFamily: 'inherit' }}>{stay.invoice_number || dash}</td>
                      </>
                    )
                  })()}
                </tr>
              )
            }

            return (
              <React.Fragment key={hotelName}>
                {/* Hotel section header */}
                <tr>
                  <td colSpan={2 + days.length + 2} style={{
                    padding: 0, background: '#f0fdf4',
                    borderTop: '2px solid #86efac', borderBottom: '1px solid #86efac',
                  }}>
                    <div style={{
                      position: 'sticky', left: 0,
                      display: 'inline-block',
                      padding: '5px 8px',
                      fontSize: '11px', fontWeight: '800', color: '#14532d',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: '#f0fdf4',
                      maxWidth: (NAME_W + ROLE_W) + 'px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      🏨 {hotelName} <span style={{ fontWeight: '600', color: '#16a34a', marginLeft: '6px' }}>{hotelStays.length} guest{hotelStays.length !== 1 ? 's' : ''}</span>
                    </div>
                  </td>
                </tr>

                {/* Subgroup sections — separator row + guest rows per group */}
                {sections.map(({ sg, stays: sectionStays }) => (
                  <React.Fragment key={sg ? sg.id : '__ungrouped__'}>
                    {hasSections && sg && (
                      <tr>
                        <td colSpan={2 + days.length + 2} style={{
                          padding: 0, background: '#f8f4ff',
                          borderLeft: '3px solid #7c3aed', borderBottom: '1px solid #e9d5ff',
                        }}>
                          <div style={{
                            position: 'sticky', left: 0,
                            display: 'inline-block',
                            padding: '4px 8px',
                            fontSize: '10px', fontWeight: '800', color: '#5b21b6',
                            background: '#f8f4ff',
                            maxWidth: (NAME_W + ROLE_W) + 'px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            ▾ {sg.name}
                            <span style={{ marginLeft: '8px', fontWeight: '600', color: '#7c3aed' }}>
                              {sectionStays.length} guest{sectionStays.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {sectionStays.map(stay => renderStayRow(stay))}
                    {/* Subgroup total row — only when hotel has subgroups */}
                    {hasSections && (
                      <tr style={{ background: sg ? '#f3e8ff' : '#f8fafc', borderTop: '1px solid #d8b4fe' }}>
                        <td style={{ padding: '4px 8px', fontWeight: '800', fontSize: '10px', color: sg ? '#5b21b6' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', position: 'sticky', left: 0, background: sg ? '#f3e8ff' : '#f8fafc', zIndex: 1, borderBottom: '2px solid #d8b4fe' }}>
                          {sg ? `TOTAL ${sg.name.toUpperCase()}` : 'TOTAL (UNGROUPED)'}
                        </td>
                        {/* MODIFICA 8: ROLE cell sticky in subgroup total */}
                        <td style={{ padding: '4px 8px', fontSize: '9px', color: sg ? '#7c3aed' : '#64748b', borderBottom: '2px solid #d8b4fe', position: 'sticky', left: NAME_W, background: sg ? '#f3e8ff' : '#f8fafc', zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }} />
                        {days.map(d => {
                          const n = countPresent(sectionStays, d)
                          return (
                            <td key={d} style={{
                              padding: '2px 0', textAlign: 'center', fontSize: '9px', fontWeight: '800',
                              color: n > 0 ? (sg ? '#5b21b6' : '#374151') : 'transparent',
                              background: n > 0 ? (sg ? '#ede9fe' : '#f1f5f9') : (d === today ? '#f0fdf420' : isWeekend(d) ? '#fafafa' : 'transparent'),
                              borderLeft: d === today ? '1px solid #86efac40' : '1px solid #f1f5f9',
                              borderBottom: '2px solid #d8b4fe',
                            }}>
                              {n > 0 ? n : ''}
                            </td>
                          )
                        })}
                        <td style={{ padding: '4px 4px', textAlign: 'center', fontSize: '10px', fontWeight: '800', color: sg ? '#5b21b6' : '#64748b', borderLeft: '1px solid #e2e8f0', borderBottom: '2px solid #d8b4fe' }}>
                          {sectionStays.reduce((sum, s) => sum + (nightsBetween(s.arrival_date, s.departure_date) || 0), 0)}
                        </td>
                        <td style={{ padding: '4px 8px', borderLeft: '1px solid #e2e8f0', borderBottom: '2px solid #d8b4fe' }} />
                        {showCosts && (() => {
                          const sumK = (k) => sectionStays.reduce((acc, st) => acc + (parseFloat(st[k]) || 0), 0)
                          const ct  = sumK('city_tax_total')
                          const nv  = sumK('total_cost_no_vat')
                          const tv  = sumK('total_cost_vat')
                          const f   = (v) => v > 0 ? `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''
                          const cs  = { padding: '4px 6px', fontSize: '9px', fontWeight: '800', textAlign: 'right', fontFamily: 'monospace', color: sg ? '#5b21b6' : '#374151', background: sg ? '#ede9fe' : '#f1f5f9', borderLeft: '1px solid #d8b4fe', borderBottom: '2px solid #d8b4fe', whiteSpace: 'nowrap' }
                          return (
                            <>
                              <td style={cs}>{f(ct)}</td>
                              <td style={cs} />
                              <td style={cs}>{f(nv)}</td>
                              <td style={cs}>{f(nv + ct)}</td>
                              <td style={cs} />
                              <td style={cs}>{f(tv)}</td>
                              <td style={cs}>{f(tv + ct)}</td>
                              <td style={cs}>{f(tv - nv)}</td>
                              <td style={cs} />
                              <td style={cs} />
                            </>
                          )
                        })()}
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {/* Hotel grand total row */}
                <tr style={{ background: '#14532d', borderTop: '2px solid #166534' }}>
                  <td style={{ padding: '5px 8px', fontWeight: '900', fontSize: '10px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', position: 'sticky', left: 0, background: '#14532d', zIndex: 1, letterSpacing: '0.05em' }}>
                    GRAN TOTAL
                  </td>
                  {/* MODIFICA 8: ROLE cell sticky in GRAN TOTAL */}
                  <td style={{ padding: '5px 8px', background: '#14532d', position: 'sticky', left: NAME_W, zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }} />
                  {days.map(d => {
                    const n = countPresent(hotelStays, d)
                    return (
                      <td key={d} style={{
                        padding: '2px 0', textAlign: 'center', fontSize: '10px', fontWeight: '900',
                        color: n > 0 ? 'white' : 'transparent',
                        background: n > 0 ? '#15803d' : '#14532d',
                        borderLeft: '1px solid #166534',
                      }}>
                        {n > 0 ? n : ''}
                      </td>
                    )
                  })}
                  <td style={{ padding: '5px 4px', textAlign: 'center', fontSize: '11px', fontWeight: '900', color: 'white', borderLeft: '1px solid #166534', background: '#14532d' }}>
                    {hotelStays.reduce((sum, s) => sum + (nightsBetween(s.arrival_date, s.departure_date) || 0), 0)}
                  </td>
                  <td style={{ padding: '5px 8px', borderLeft: '1px solid #166534', background: '#14532d' }} />
                  {showCosts && (() => {
                    const sumK = (k) => hotelStays.reduce((acc, st) => acc + (parseFloat(st[k]) || 0), 0)
                    const ct  = sumK('city_tax_total')
                    const nv  = sumK('total_cost_no_vat')
                    const tv  = sumK('total_cost_vat')
                    const f   = (v) => v > 0 ? `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''
                    const cs  = { padding: '5px 6px', fontSize: '10px', fontWeight: '900', textAlign: 'right', fontFamily: 'monospace', color: 'white', background: '#14532d', borderLeft: '1px solid #166534', whiteSpace: 'nowrap' }
                    return (
                      <>
                        <td style={cs}>{f(ct)}</td>
                        <td style={cs} />
                        <td style={cs}>{f(nv)}</td>
                        <td style={cs}>{f(nv + ct)}</td>
                        <td style={cs} />
                        <td style={cs}>{f(tv)}</td>
                        <td style={cs}>{f(tv + ct)}</td>
                        <td style={cs}>{f(tv - nv)}</td>
                        <td style={cs} />
                        <td style={cs} />
                      </>
                    )
                  })()}
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
    </table>
  )
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
  const [hotelSubgroups, setHotelSubgroups] = useState([])
  const notesRef = React.useRef(null)

  useEffect(() => {
    if (!open) return
    setError(null); setConfirmDel(false)
    if (mode === 'edit' && initial) {
      setForm({
        id:                initial.id                || null,
        crew_id:           initial.crew_id           || null,
        hotel_id:          initial.hotel_id          || '',
        subgroup_id:       initial.subgroup_id       || null,
        arrival_date:      initial.arrival_date      || '',
        departure_date:    initial.departure_date    || '',
        room_type_notes:   initial.room_type_notes   || '',
        cost_per_night:    initial.cost_per_night    ?? '',
        city_tax_total:    initial.city_tax_total    ?? '',
        total_cost_no_vat: initial.total_cost_no_vat ?? '',
        total_cost_vat:    initial.total_cost_vat    ?? '',
        po_number:         initial.po_number         || '',
        invoice_number:    initial.invoice_number    || '',
      })
      setCrewSearch(initial.crew?.full_name || '')
      setCrewResults([])
      if (initial?.__focusField === 'notes' && notesRef.current) {
        setTimeout(() => notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
      }
    } else {
      setForm(EMPTY_STAY); setCrewSearch(''); setCrewResults([])
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function searchCrew(q) {
    if (!q || q.length < 2 || !PRODUCTION_ID) { setCrewResults([]); return }
    setCrewSearching(true)
    const { data } = await supabase.from('crew').select('id, full_name, role, department').eq('production_id', PRODUCTION_ID).ilike('full_name', `%${q}%`).limit(8)
    setCrewResults(data || []); setCrewSearching(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => searchCrew(crewSearch), 300)
    return () => clearTimeout(timer)
  }, [crewSearch])

  async function syncCrewDates(crewId) {
    if (!crewId || !PRODUCTION_ID) return
    const { data: allStays } = await supabase.from('crew_stays').select('arrival_date, departure_date, hotel_id').eq('crew_id', crewId).eq('production_id', PRODUCTION_ID).order('arrival_date', { ascending: true })
    if (!allStays || allStays.length === 0) return
    const arrivals   = allStays.map(s => s.arrival_date).filter(Boolean).sort()
    const departures = allStays.map(s => s.departure_date).filter(Boolean).sort()
    await supabase.from('crew').update({ hotel_id: allStays[allStays.length - 1]?.hotel_id || null, arrival_date: arrivals[0] || null, departure_date: departures[departures.length - 1] || null }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
  }

  // Load subgroups when hotel changes
  useEffect(() => {
    if (!form.hotel_id || !PRODUCTION_ID) { setHotelSubgroups([]); return }
    supabase.from('hotel_subgroups').select('id, name').eq('production_id', PRODUCTION_ID).eq('hotel_id', form.hotel_id).order('display_order').order('name').then(({ data }) => setHotelSubgroups(data || []))
  }, [form.hotel_id, PRODUCTION_ID])

  function buildRow() {
    return {
      production_id:     PRODUCTION_ID,
      crew_id:           form.crew_id || null,
      hotel_id:          form.hotel_id || null,
      subgroup_id:       form.subgroup_id || null,
      arrival_date:      form.arrival_date || null,
      departure_date:    form.departure_date || null,
      room_type_notes:   (form.room_type_notes || '').trim() || null,
      cost_per_night:    form.cost_per_night    !== '' ? parseFloat(form.cost_per_night)    : null,
      city_tax_total:    form.city_tax_total    !== '' ? parseFloat(form.city_tax_total)    : null,
      total_cost_no_vat: form.total_cost_no_vat !== '' ? parseFloat(form.total_cost_no_vat) : null,
      total_cost_vat:    form.total_cost_vat    !== '' ? parseFloat(form.total_cost_vat)    : null,
      po_number:         (form.po_number || '').trim() || null,
      invoice_number:    (form.invoice_number || '').trim() || null,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.crew_id)        { setError('Crew member required');   return }
    if (!form.arrival_date)   { setError('Arrival date required');  return }
    if (!form.departure_date) { setError('Departure date required'); return }
    setSaving(true)
    try {
      const row = buildRow()
      let result
      if (mode === 'new') result = await supabase.from('crew_stays').insert(row).select(SELECT_FIELDS).single()
      else                result = await supabase.from('crew_stays').update(row).eq('id', initial.id).select(SELECT_FIELDS).single()
      if (result.error) { setError(result.error.message); return }
      await syncCrewDates(form.crew_id)
      onSaved(result.data, mode); onClose()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await supabase.from('crew_stays').delete().eq('id', initial.id)
    setDeleting(false)
    if (initial.crew_id) await syncCrewDates(initial.crew_id)
    onDeleted(initial.id); onClose()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const rowSt = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#15803d', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>{mode === 'new' ? '🏨 New Stay' : '✏️ Edit Stay'}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Crew search */}
            <div style={rowSt}>
              <label style={lbl}>Crew member *</label>
              <input value={crewSearch} onChange={e => { setCrewSearch(e.target.value); if (!e.target.value) set('crew_id', null) }} style={inp} placeholder="Type name to search crew..." autoComplete="off" />
              {crewSearching && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching...</div>}
              {crewResults.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden' }}>
                  {crewResults.map(c => (
                    <div key={c.id} onClick={() => { set('crew_id', c.id); setCrewSearch(c.full_name); setCrewResults([]) }}
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
              {form.crew_id && <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', fontWeight: '600' }}>✓ Crew linked</div>}
            </div>

            {/* Hotel */}
            <div style={rowSt}>
              <label style={lbl}>Hotel</label>
              <select value={form.hotel_id} onChange={e => { set('hotel_id', e.target.value); set('subgroup_id', null) }} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">— Select hotel —</option>
                {(hotels || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>

            {/* Subgroup (only if hotel has subgroups) */}
            {hotelSubgroups.length > 0 && (
              <div style={rowSt}>
                <label style={lbl}>Subgroup</label>
                <select value={form.subgroup_id || ''} onChange={e => set('subgroup_id', e.target.value || null)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— No subgroup —</option>
                  {hotelSubgroups.map(sg => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                </select>
              </div>
            )}

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div><label style={lbl}>Check-in *</label><input type="date" value={form.arrival_date} onChange={e => set('arrival_date', e.target.value)} style={inp} required /></div>
              <div><label style={lbl}>Check-out *</label><input type="date" value={form.departure_date} onChange={e => set('departure_date', e.target.value)} style={inp} required /></div>
            </div>

            {form.arrival_date && form.departure_date && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '12px', color: '#15803d', fontWeight: '700' }}>
                🌙 {nightsBetween(form.arrival_date, form.departure_date) ?? 0} night(s)
              </div>
            )}

            {/* Room / Notes */}
            <div style={rowSt}>
              <label style={lbl}>Room / Notes</label>
              <input value={form.room_type_notes} onChange={e => set('room_type_notes', e.target.value)} style={inp} placeholder="Room type, number, preferences..." />
            </div>

            {/* Cost fields */}
            <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Cost (optional)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                <div><label style={lbl}>€/night</label><input type="number" step="0.01" value={form.cost_per_night} onChange={e => set('cost_per_night', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0.00" /></div>
                <div><label style={lbl}>City tax total</label><input type="number" step="0.01" value={form.city_tax_total} onChange={e => set('city_tax_total', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0.00" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                <div><label style={lbl}>Tot. no VAT</label><input type="number" step="0.01" value={form.total_cost_no_vat} onChange={e => set('total_cost_no_vat', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0.00" /></div>
                <div><label style={lbl}>Tot. + VAT</label><input type="number" step="0.01" value={form.total_cost_vat} onChange={e => set('total_cost_vat', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0.00" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div><label style={lbl}>P.O.</label><input value={form.po_number} onChange={e => set('po_number', e.target.value)} style={inp} placeholder="P.O. number" /></div>
                <div><label style={lbl}>N°Fatt.</label><input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} style={inp} placeholder="Invoice #" /></div>
              </div>
            </div>

            {/* Notes Panel */}
            {form.crew_id && (
              <div ref={notesRef} style={{ marginTop: '8px' }}>
                {form.id ? (
                  <NotesPanel crewId={form.crew_id} productionId={PRODUCTION_ID} currentUser={currentUser} linkedStayId={form.id} accordion={true} />
                ) : (
                  <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
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
                  <button type="button" onClick={handleDelete} disabled={deleting} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>Delete Stay</button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this stay? This cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer', fontSize: '12px', fontWeight: '800' }}>{deleting ? '...' : 'Confirm Delete'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>{error}</div>}

          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0, position: 'sticky', bottom: 0, background: 'white', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button type="submit" disabled={saving} style={{ padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Stay' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
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
  const toolbarRef   = React.useRef(null)
  const filterRowRef = React.useRef(null)

  const [user, setUser]         = useState(null)
  const [userRole, setUserRole] = useState('ACCOMMODATION')
  const [stays,   setStays]   = useState([])
  const [hotels,  setHotels]  = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar'
  const [columnsConfig,     setColumnsConfig]     = useState([])
  const [columnsEditorOpen, setColumnsEditorOpen] = useState(false)
  const [applyingPreset,    setApplyingPreset]    = useState(false)
  const [windowStart,  setWindowStart]  = useState(() => isoAdd(isoToday(), -3))
  const [windowEnd,    setWindowEnd]    = useState(() => isoAdd(isoToday(), 10))
  const [showCosts,    setShowCosts]    = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [sidebarMode,   setSidebarMode]   = useState('new')
  const [sidebarTarget, setSidebarTarget] = useState(null)
  const [stayNotesMap,  setStayNotesMap]  = useState({})
  const [stayUnreadMap, setStayUnreadMap] = useState({})
  const [search,       setSearch]       = useState('')
  const [filterHotel,  setFilterHotel]  = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [toast, setToast] = useState(null)
  const [subgroupSidebarOpen,   setSubgroupSidebarOpen]   = useState(false)
  const [subgroupSidebarHotel,  setSubgroupSidebarHotel]  = useState(null)  // { id, name }
  const [subgroupsByHotel,      setSubgroupsByHotel]      = useState({})    // { hotelId: [{ id, name }] }

  const loadSubgroupsForHotel = useCallback(async (hotelId) => {
    if (!PRODUCTION_ID || !hotelId) return []
    const { data } = await supabase.from('hotel_subgroups').select('id, name, display_order').eq('production_id', PRODUCTION_ID).eq('hotel_id', hotelId).order('display_order').order('name')
    setSubgroupsByHotel(prev => ({ ...prev, [hotelId]: data || [] }))
    return data || []
  }, [PRODUCTION_ID])

  function openSubgroupManager(hotel) {
    setSubgroupSidebarHotel(hotel)
    setSubgroupSidebarOpen(true)
    loadSubgroupsForHotel(hotel.id)
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  function openNew() { setSidebarMode('new'); setSidebarTarget(null); setSidebarOpen(true) }
  function openEdit(stay, focusField) { setSidebarMode('edit'); setSidebarTarget({ ...stay, __focusField: focusField || null }); setSidebarOpen(true) }

  const loadColumnsConfig = useCallback(async () => {
    if (!PRODUCTION_ID) return
    const { data } = await supabase.from('accommodation_columns').select('*').eq('production_id', PRODUCTION_ID).order('display_order', { ascending: true }).order('created_at', { ascending: true })
    setColumnsConfig(data || [])
  }, [PRODUCTION_ID])

  async function applyDefaultPreset() {
    if (!PRODUCTION_ID || applyingPreset) return
    setApplyingPreset(true)
    try {
      const rows = ACCOMMODATION_DEFAULT_PRESET.map(p => ({ ...p, production_id: PRODUCTION_ID }))
      const { error } = await supabase.from('accommodation_columns').insert(rows)
      if (error) throw error
      await loadColumnsConfig()
      showToast('Default preset applied')
    } catch (e) { showToast('Failed: ' + (e.message || 'unknown'), 'error') }
    finally { setApplyingPreset(false) }
  }

  function setRange(start, end) { setWindowStart(start); setWindowEnd(end) }
  function resetWindow() { setRange(isoAdd(isoToday(), -3), isoAdd(isoToday(), 10)) }
  function setThisMonth() { setRange(startOfMonth(0), endOfMonth(0)) }
  function setNextMonth() { setRange(startOfMonth(1), endOfMonth(1)) }
  function setFullPeriod() {
    if (stays.length === 0) { setRange('2026-01-01', '2026-12-31'); return }
    const arrivals   = stays.map(s => s.arrival_date).filter(Boolean).sort()
    const departures = stays.map(s => s.departure_date).filter(Boolean).sort()
    setRange(arrivals[0], departures[departures.length - 1])
  }

  const loadData = useCallback(async (start, end) => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const s = start || windowStart
    const e = end   || windowEnd
    const { data } = await supabase.from('crew_stays').select(SELECT_FIELDS).eq('production_id', PRODUCTION_ID).lte('arrival_date', e).gte('departure_date', s).order('hotel_id', { ascending: true }).order('arrival_date', { ascending: true })
    setStays(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  const loadHotels = useCallback(async () => {
    if (!PRODUCTION_ID) return
    const { data } = await supabase.from('locations').select('id, name').eq('production_id', PRODUCTION_ID).eq('is_hotel', true)
    setHotels(data || [])
  }, [PRODUCTION_ID])

  const loadNotesMap = useCallback(async (userId) => {
    if (!PRODUCTION_ID || !userId) return
    const { data } = await supabase.from('crew_notes').select('crew_id, linked_stay_id, author_id, read_by, content, created_at').eq('production_id', PRODUCTION_ID).eq('is_private', false).order('created_at', { ascending: false })
    if (!data) return
    const stayTotal = {}, stayLastMap = {}, stayUnread = {}
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
    for (const sid of Object.keys(stayTotal)) notesMap[sid] = { count: stayTotal[sid], lastNote: stayLastMap[sid] || '' }
    setStayNotesMap(notesMap); setStayUnreadMap(stayUnread)
  }, [PRODUCTION_ID])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (PRODUCTION_ID) {
        const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('production_id', PRODUCTION_ID).maybeSingle()
        if (roleRow?.role) setUserRole(roleRow.role)
      }
    })
  }, [])

  useEffect(() => {
    if (user) { loadData(windowStart, windowEnd); loadHotels(); loadColumnsConfig(); loadNotesMap(user.id) }
  }, [user])

  useEffect(() => { if (user) loadData(windowStart, windowEnd) }, [windowStart, windowEnd])

  // Pre-load subgroups for every hotel so list grouping works immediately on load
  useEffect(() => {
    if (hotels.length === 0) return
    hotels.forEach(h => loadSubgroupsForHotel(h.id))
  }, [hotels, loadSubgroupsForHotel])

  useEffect(() => {
    if (!user || !PRODUCTION_ID) return
    const channel = supabase.channel(`crew_notes:accommodation:${PRODUCTION_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_notes', filter: `production_id=eq.${PRODUCTION_ID}` }, () => { loadNotesMap(user.id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, PRODUCTION_ID, loadNotesMap])

  useEffect(() => {
    function update() {
      const navH     = 52
      const toolbarH = toolbarRef.current?.offsetHeight || 52
      const filterH  = filterRowRef.current?.offsetHeight || 52
      const total    = navH + toolbarH + filterH
      document.documentElement.style.setProperty('--accom-headers-h', total + 'px')
    }
    update()
    const ro = new ResizeObserver(update)
    if (toolbarRef.current)   ro.observe(toolbarRef.current)
    if (filterRowRef.current) ro.observe(filterRowRef.current)
    return () => ro.disconnect()
  }, [user])

  function handleStaySaved(saved, mode) {
    if (mode === 'new') {
      setStays(prev => [...prev, saved].sort((a, b) => {
        const ha = a.hotel?.name || '', hb = b.hotel?.name || ''
        if (ha !== hb) return ha.localeCompare(hb)
        return (a.arrival_date || '').localeCompare(b.arrival_date || '')
      }))
    } else { setStays(prev => prev.map(s => s.id === saved.id ? saved : s)) }
    showToast(mode === 'new' ? 'Stay added' : 'Stay updated')
  }

  function handleStayDeleted(id) { setStays(prev => prev.filter(s => s.id !== id)); showToast('Stay deleted') }

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

  const { groupedByHotel, sortedHotels } = useMemo(() => {
    const grouped = {}
    for (const stay of filtered) {
      const hotelName = stay.hotel?.name || 'No Hotel'
      if (!grouped[hotelName]) grouped[hotelName] = []
      grouped[hotelName].push(stay)
    }
    return { groupedByHotel: grouped, sortedHotels: Object.keys(grouped).sort() }
  }, [filtered])

  const hotelNames = useMemo(() => {
    const names = new Set()
    for (const s of stays) names.add(s.hotel?.name || 'No Hotel')
    return Array.from(names).sort()
  }, [stays])

  // Calendar days array
  const calendarDays = useMemo(() => daysInRange(windowStart, windowEnd), [windowStart, windowEnd])

  const statCheckIn  = stays.filter(s => s.arrival_date === today).length
  const statCheckOut = stays.filter(s => s.departure_date === today).length
  const statInHotel  = stays.filter(s => today > s.arrival_date && today < s.departure_date).length

  function Pill({ active, onClick, children, activeStyle }) {
    return (
      <button onClick={onClick} style={{
        padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', touchAction: 'manipulation',
        ...(active ? (activeStyle || { background: '#15803d', color: 'white', borderColor: '#15803d' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }),
      }}>{children}</button>
    )
  }

  const isFilterActive = search || filterHotel !== 'ALL' || filterStatus !== 'ALL'
  function resetFilters() { setSearch(''); setFilterHotel('ALL'); setFilterStatus('ALL') }

  if (!user) return <div style={{ minHeight: '100vh', background: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading...</div>

  const NAVBAR_H   = 52
  const TOOLBAR_H  = 52
  const FILTER_TOP = NAVBAR_H + TOOLBAR_H

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/accommodation" />

      {/* ── Toolbar ── MODIFICA 2: data-toolbar attribute */}
      <div ref={toolbarRef} data-toolbar="accommodation" style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', minHeight: `${TOOLBAR_H}px`, display: 'flex', alignItems: 'center', gap: '8px', position: 'sticky', top: `${NAVBAR_H}px`, zIndex: 21 }}>
        <span style={{ fontSize: '18px' }}>🏨</span>
        <span style={{ fontWeight: '800', fontSize: isMobile ? '14px' : '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>Accommodation</span>
        <button onClick={openNew} style={{ background: '#15803d', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(21,128,61,0.3)' }}>+ Add Stay</button>

        {/* Date range Dal / Al */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Dal</span>
          <input type="date" value={windowStart} onChange={e => e.target.value && setWindowStart(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer', minWidth: 0 }} />
          <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Al</span>
          <input type="date" value={windowEnd} onChange={e => e.target.value && setWindowEnd(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer', minWidth: 0 }} />
          <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />
          <button onClick={resetWindow} style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>↺ Today</button>
          <button onClick={setThisMonth} style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>This month</button>
          <button onClick={setNextMonth} style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Next month</button>
          <button onClick={setFullPeriod} style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Full period</button>
        </div>

        {/* View toggle + Columns + Cost Report */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden' }}>
            <button onClick={() => setViewMode('list')}
              style={{ padding: '5px 10px', border: 'none', background: viewMode === 'list' ? '#0f2340' : 'white', color: viewMode === 'list' ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              ☰ List
            </button>
            <button onClick={() => setViewMode('calendar')}
              style={{ padding: '5px 10px', border: 'none', borderLeft: '1px solid #e2e8f0', background: viewMode === 'calendar' ? '#0f2340' : 'white', color: viewMode === 'calendar' ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              📅 Calendar
            </button>
          </div>
          {viewMode === 'calendar' && (
            <button onClick={() => setShowCosts(v => !v)}
              style={{ padding: '5px 12px', borderRadius: '7px', border: `1px solid ${showCosts ? '#2563eb' : '#e2e8f0'}`, background: showCosts ? '#eff6ff' : 'white', color: showCosts ? '#1d4ed8' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              💰 {showCosts ? 'Hide Costs' : 'Show Costs'}
            </button>
          )}

          {viewMode === 'list' && columnsConfig.length === 0 && (
            <button onClick={applyDefaultPreset} disabled={applyingPreset}
              style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #15803d', background: applyingPreset ? '#cbd5e1' : '#15803d', color: 'white', fontSize: '11px', fontWeight: '700', cursor: applyingPreset ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
            </button>
          )}
          {viewMode === 'list' && (
            <button onClick={() => setColumnsEditorOpen(true)}
              style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Columns {columnsConfig.length > 0 && `(${columnsConfig.length})`}
            </button>
          )}
          <a href="/dashboard/accommodation/cost-report"
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            💰 Cost Report
          </a>
        </div>
      </div>

      {/* ── Filter Row ── MODIFICA 2: data-filter-row attribute */}
      <div ref={filterRowRef} data-filter-row="accommodation" style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', position: 'sticky', top: `${FILTER_TOP}px`, zIndex: 20 }}>
        <input type="text" placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '160px', minWidth: 0 }} />
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterHotel === 'ALL'} onClick={() => setFilterHotel('ALL')}>ALL</Pill>
          {hotelNames.map(name => (
            <Pill key={name} active={filterHotel === name} onClick={() => setFilterHotel(name)} activeStyle={{ background: '#0f2340', color: 'white', borderColor: '#0f2340' }}>🏨 {name}</Pill>
          ))}
        </div>
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')}>ALL</Pill>
          <Pill active={filterStatus === 'In Hotel'} onClick={() => setFilterStatus('In Hotel')} activeStyle={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>🏨 In Hotel</Pill>
          <Pill active={filterStatus === 'CHECK-IN TODAY'} onClick={() => setFilterStatus('CHECK-IN TODAY')} activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}>🛬 Check-in Today</Pill>
          <Pill active={filterStatus === 'CHECK-OUT TODAY'} onClick={() => setFilterStatus('CHECK-OUT TODAY')} activeStyle={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>🛫 Check-out Today</Pill>
          <Pill active={filterStatus === 'Upcoming'} onClick={() => setFilterStatus('Upcoming')} activeStyle={{ background: '#fefce8', color: '#a16207', borderColor: '#fde68a' }}>🔜 Upcoming</Pill>
          <Pill active={filterStatus === 'Checked Out'} onClick={() => setFilterStatus('Checked Out')} activeStyle={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>✅ Checked Out</Pill>
        </div>
        {isFilterActive && (
          <button onClick={resetFilters} style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b' }}>✕ Reset</button>
        )}
        {viewMode === 'calendar' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', color: '#64748b' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#15803d', borderRadius: '2px', marginRight: '3px' }} />Check-in</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#86efac', borderRadius: '2px', marginRight: '3px' }} />In Hotel</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#fca5a5', borderRadius: '2px', marginRight: '3px' }} />Check-out</span>
          </div>
        )}
      </div>

      {/* ── Content ── S66-J v2: in calendar mode il div outer ha height fisso, no padding, no outer scroll */}
      <div style={{
        padding: viewMode === 'calendar' ? 0 : (isMobile ? '12px' : '16px 24px'),
        height: viewMode === 'calendar' ? 'calc(100vh - var(--accom-headers-h, 184px))' : 'auto',
        overflow: viewMode === 'calendar' ? 'hidden' : 'visible',
      }}>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            NEXT_PUBLIC_PRODUCTION_ID not set in .env.local
          </div>
        )}

        {/* Stats banner — solo in list mode */}
        {!loading && stays.length > 0 && viewMode !== 'calendar' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: '#374151', fontWeight: '700' }}>Total: <span style={{ fontWeight: '900', color: '#0f172a' }}>{stays.length}</span> stays</div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>Check-in today: <span style={{ fontWeight: '900' }}>{statCheckIn}</span></div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>Check-out today: <span style={{ fontWeight: '900' }}>{statCheckOut}</span></div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>In hotel: <span style={{ fontWeight: '900' }}>{statInHotel}</span></div>
            <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{fmtDate(windowStart)} → {fmtDate(windowEnd)}</div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading stays...</div>
        ) : stays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏨</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>No stays found</div>
            <button onClick={openNew} style={{ marginTop: '14px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Add First Stay</button>
          </div>
        ) : sortedHotels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '14px', color: '#64748b' }}>No results — reset filters</div>
          </div>
        ) : viewMode === 'calendar' ? (
          // S66-J: wrapper = scroll container entrambi gli assi, height:100% riempie outer div fisso
<div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
            <CalendarView
              groupedByHotel={groupedByHotel}
              sortedHotels={sortedHotels}
              days={calendarDays}
              today={today}
              onEditRow={openEdit}
              subgroupsByHotel={subgroupsByHotel}
              hotels={hotels}
              showCosts={showCosts}
              stickyTop={0}
            />
          </div>
        ) : (
          /* ── LIST VIEW ── */
          <>
            {columnsConfig.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗂</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>No columns configured</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>Click <strong>Apply Default Columns</strong> to use the standard layout.</div>
                <button onClick={applyDefaultPreset} disabled={applyingPreset}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', cursor: applyingPreset ? 'default' : 'pointer' }}>
                  {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
                </button>
              </div>
            )}
            {sortedHotels.map(hotelName => {
              const hotelStays = groupedByHotel[hotelName]
              return (
                <div key={hotelName} style={{ marginBottom: '32px' }}>
                  {/* Hotel header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px 8px 0 0', borderBottom: 'none' }}>
                    <span style={{ fontSize: '15px' }}>🏨</span>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#14532d', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{hotelName}</span>
                    <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '4px', fontWeight: '600' }}>
                      {hotelStays.length} guest{hotelStays.length !== 1 ? 's' : ''}
                      {' · '}
                      {hotelStays.reduce((sum, s) => sum + (nightsBetween(s.arrival_date, s.departure_date) || 0), 0)}🌙
                    </span>
                    <button
                      onClick={() => { const h = hotels.find(h => h.name === hotelName); if (h) openSubgroupManager(h) }}
                      style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: '6px', border: '1px solid #86efac', background: 'white', color: '#15803d', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                      ⚙ Subgroups
                    </button>
                  </div>
                  {columnsConfig.length > 0 && (() => {
                    // Group stays by subgroup
                    const sgs = subgroupsByHotel[hotels.find(h=>h.name===hotelName)?.id] || []
                    const sgMap = {}
                    sgs.forEach(sg => { sgMap[sg.id] = { sg, stays: [] } })
                    const ungrouped = []
                    hotelStays.forEach(stay => {
                      if (stay.subgroup_id && sgMap[stay.subgroup_id]) sgMap[stay.subgroup_id].stays.push(stay)
                      else ungrouped.push(stay)
                    })
                    const sections = [...Object.values(sgMap).filter(x => x.stays.length > 0), ...(ungrouped.length > 0 ? [{ sg: null, stays: ungrouped }] : [])]
                    const colMinW = columnsConfig.reduce((s, c) => s + parseInt(c.width || '100'), 0)
                    const renderTable = (stayList, subgroupLabel) => (
                      <div style={{ overflowX: 'auto', overflowY: 'visible' }} key={subgroupLabel || '__ungrouped__'}>
                        {subgroupLabel && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 14px', background: '#f8f4ff', borderLeft: '3px solid #7c3aed', fontSize: '11px', fontWeight: '800', color: '#5b21b6' }}>
                            <span>▾ {subgroupLabel}</span>
                            <span style={{ fontWeight: '600', color: '#7c3aed', fontSize: '11px' }}>
                              {stayList.length} guest{stayList.length !== 1 ? 's' : ''}
                              {' · '}
                              {stayList.reduce((sum, s) => sum + (nightsBetween(s.arrival_date, s.departure_date) || 0), 0)}🌙
                            </span>
                          </div>
                        )}
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #e2e8f0', borderTop: subgroupLabel ? 'none' : '1px solid #86efac', borderRadius: subgroupLabel ? '0' : '0 0 8px 8px', overflow: 'hidden', minWidth: colMinW + 'px' }}>
                          <colgroup>{columnsConfig.map(col => <col key={col.source_field} style={{ width: col.width }} />)}</colgroup>
                          {!subgroupLabel && <thead><tr style={{ background: '#f1f5f9' }}>{columnsConfig.map(col => <th key={col.source_field} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '800', color: col.source_field === 'notes' ? '#2563eb' : '#64748b', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>{col.header_label}</th>)}</tr></thead>}
                          {subgroupLabel && <thead><tr style={{ background: '#faf5ff' }}>{columnsConfig.map(col => <th key={col.source_field} style={{ padding: '5px 8px', fontSize: '9px', fontWeight: '700', color: '#7c3aed', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #e9d5ff', background: '#faf5ff' }}>{col.header_label}</th>)}</tr></thead>}
                          <tbody>
                            {stayList.map(stay => {
                              const isCI = stay.arrival_date === today, isCO = stay.departure_date === today
                              return <tr key={stay.id} style={{ background: isCI ? '#f0fdf4' : isCO ? '#fef2f2' : 'white', borderLeft: isCI ? '3px solid #22c55e' : isCO ? '3px solid #ef4444' : '3px solid transparent' }}>{columnsConfig.map(col => renderCell(col, stay, { onEditRow: openEdit, stayNotesMap, stayUnreadMap, today }))}</tr>
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                    const hasSections = sections.some(x => x.sg !== null)
                    if (!hasSections) return renderTable(hotelStays, null)
                    return (
                      <div style={{ border: '1px solid #e2e8f0', borderTop: '1px solid #86efac', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                        {sections.map(({ sg, stays: sl }) => renderTable(sl, sg ? sg.name : null))}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </>
        )}
      </div>

      <AccommodationColumnsEditorSidebar open={columnsEditorOpen} onClose={() => setColumnsEditorOpen(false)} onChanged={loadColumnsConfig} />
      <StaySidebar open={sidebarOpen} mode={sidebarMode} initial={sidebarTarget} onClose={() => setSidebarOpen(false)} onSaved={handleStaySaved} onDeleted={handleStayDeleted} hotels={hotels} currentUser={user ? { id: user.id, name: user.user_metadata?.full_name || user.email, role: userRole } : null} />
      <SubgroupManagerSidebar
        open={subgroupSidebarOpen}
        hotelId={subgroupSidebarHotel?.id}
        hotelName={subgroupSidebarHotel?.name}
        productionId={PRODUCTION_ID}
        onClose={() => setSubgroupSidebarOpen(false)}
        onChanged={() => { loadSubgroupsForHotel(subgroupSidebarHotel?.id); loadData(windowStart, windowEnd) }}
      />
      <Toast message={toast?.message} type={toast?.type} />
    </div>
  )
}
