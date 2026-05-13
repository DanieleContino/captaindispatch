'use client'

/**
 * ImportModal — componente condiviso per import fleet/crew da file
 *
 * Props:
 *   open         — bool
 *   mode         — 'hal' | 'fleet' | 'crew' | 'custom' (modalità iniziale)
 *   productionId — UUID produzione attiva
 *   locations    — array { id, name } (per hotel matching crew)
 *   onClose      — function
 *   onImported   — function(result) chiamata dopo import completato
 *
 * State machine:
 *   idle → parsing → preview → confirming → done
 *
 * Modes:
 *   hal    — 🔴 HAL: Claude auto-rileva il tipo di documento
 *   crew   — 👥 Crew list: estrae first_name, last_name, role, dept, phone, email
 *   fleet  — 🚗 Fleet list: estrae driver, tipo, targa, sign_code, capacità
 *   custom — ✏️ Custom instructions: prompt libero
 */

import { useState, useRef, useEffect } from 'react'

// ── Helpers colori righe ────────────────────────────────────

function isUnrecognized(row, mode) {
  if (mode === 'fleet')         return !row.driver_name && !row.plate && !row.vehicle_type
  if (mode === 'crew')          return !row.first_name && !row.last_name
  if (mode === 'accommodation') return !row.existingId && !row.first_name && !row.last_name
  return false
}

function hasNullFields(row, mode) {
  if (mode === 'fleet')         return !row.driver_name || !row.plate || row.capacity == null
  if (mode === 'crew')          return !row.department || !row.role
  if (mode === 'accommodation') return !row.arrival_date || !row.departure_date
  return false
}

function rowBg(row, mode) {
  if (mode === 'accommodation') {
    if (row.action === 'skip')                    return '#f1f5f9'   // ⚫ grigio — saltato
    if (!row.arrival_date || !row.departure_date) return '#fefce8'   // 🟡 giallo — date mancanti
    return 'white'
  }
  if (isUnrecognized(row, mode))   return '#fef2f2'   // 🔴 rosso — non riconosciuto
  if (row.existingId)              return '#fff7ed'   // 🟠 arancione — duplicato
  if (row.active === false)        return '#f1f5f9'   // ⚫ grigio — not yet active
  if (hasNullFields(row, mode))    return '#fefce8'   // 🟡 giallo — campi mancanti
  return 'white'                                      // 🟢 bianco — ok
}

// ── Stili condivisi ─────────────────────────────────────────
const CELL_INPUT = {
  padding: '3px 6px',
  border: '1px solid #e2e8f0',
  borderRadius: '5px',
  fontSize: '12px',
  width: '100%',
  boxSizing: 'border-box',
  background: 'white',
  color: '#0f172a',
}

const TH = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: '800',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

// Defaults capacity/pax_suggested per tipo veicolo
const FLEET_DEFAULTS = { VAN: { capacity: 8, pax_suggested: 8 }, CAR: { capacity: 4, pax_suggested: 4 }, BUS: {} }

// Dipartimenti disponibili
const DEPTS = ['CAMERA','GRIP','ELECTRIC','SOUND','ART','COSTUME','MAKEUP','HMU','AD','PRODUCTION','TRANSPORT','PROPS','SET DEC','ACCOUNTING','PRODUCERS','CATERING','SECURITY','MEDICAL','VFX','DIRECTING','CAST','LOCATIONS','OTHER']

// ── Fleet preview table ─────────────────────────────────────
function FleetTable({ rows, onToggleAction, onEdit }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={TH}>Type</th>
            <th style={TH}>Driver</th>
            <th style={TH}>Plate</th>
            <th style={{ ...TH, textAlign: 'center' }}>Cap</th>
            <th style={{ ...TH, textAlign: 'center' }}>Pax sugg.</th>
            <th style={{ ...TH, textAlign: 'center' }}>Pax max</th>
            <th style={TH}>Sign</th>
            <th style={{ ...TH, textAlign: 'center' }}>Avail. From</th>
            <th style={{ ...TH, textAlign: 'center' }}>Avail. To</th>
            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._idx} style={{ background: rowBg(row, 'fleet'), borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 10px' }}>
                <select
                  value={row.vehicle_type || 'VAN'}
                  onChange={e => onEdit(row._idx, 'vehicle_type', e.target.value)}
                  style={{ ...CELL_INPUT, width: '70px' }}
                >
                  <option>VAN</option>
                  <option>CAR</option>
                  <option>BUS</option>
                </select>
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.driver_name || ''}
                  onChange={e => onEdit(row._idx, 'driver_name', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '130px' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.plate || ''}
                  onChange={e => onEdit(row._idx, 'plate', e.target.value.toUpperCase() || null)}
                  style={{ ...CELL_INPUT, fontFamily: 'monospace', fontWeight: '700', width: '100px' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="number"
                  value={row.capacity ?? ''}
                  onChange={e => onEdit(row._idx, 'capacity', e.target.value !== '' ? parseInt(e.target.value) : null)}
                  style={{ ...CELL_INPUT, width: '50px', textAlign: 'center' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="number"
                  value={row.pax_suggested ?? ''}
                  onChange={e => onEdit(row._idx, 'pax_suggested', e.target.value !== '' ? parseInt(e.target.value) : null)}
                  style={{ ...CELL_INPUT, width: '55px', textAlign: 'center' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="number"
                  value={row.pax_max ?? ''}
                  onChange={e => onEdit(row._idx, 'pax_max', e.target.value !== '' ? parseInt(e.target.value) : null)}
                  style={{ ...CELL_INPUT, width: '55px', textAlign: 'center' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.sign_code || ''}
                  onChange={e => onEdit(row._idx, 'sign_code', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '80px' }}
                  placeholder="–"
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="date"
                  value={row.available_from || ''}
                  onChange={e => onEdit(row._idx, 'available_from', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="date"
                  value={row.available_to || ''}
                  onChange={e => onEdit(row._idx, 'available_to', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                {row.existingId ? (
                  <button
                    onClick={() => onToggleAction(row._idx)}
                    style={{
                      padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700',
                      cursor: 'pointer', border: '1px solid',
                      ...(row.action === 'update'
                        ? { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }
                        : { background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }),
                    }}
                  >
                    {row.action === 'update' ? '🔄 Update' : '⏭ Skip'}
                  </button>
                ) : (
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                    ✅ New
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Crew preview table ──────────────────────────────────────

function CrewTable({ rows, locations, onToggleAction, onEdit }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={TH}>First Name</th>
            <th style={TH}>Last Name</th>
            <th style={TH}>Role</th>
            <th style={TH}>Dept</th>
            <th style={TH}>Phone</th>
            <th style={TH}>Email</th>
            <th style={TH}>Hotel</th>
            <th style={{ ...TH, textAlign: 'center' }}>Arrival</th>
            <th style={{ ...TH, textAlign: 'center' }}>Departure</th>
            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._idx} style={{ background: rowBg(row, 'crew'), borderBottom: '1px solid #f1f5f9' }}>
              {/* First name */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.first_name || ''}
                  onChange={e => onEdit(row._idx, 'first_name', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '90px' }}
                  placeholder="–"
                />
              </td>
              {/* Last name */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.last_name || ''}
                  onChange={e => onEdit(row._idx, 'last_name', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '100px' }}
                  placeholder="–"
                />
              </td>
              {/* Role */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.role || ''}
                  onChange={e => onEdit(row._idx, 'role', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '130px' }}
                  placeholder="–"
                />
              </td>
              {/* Department */}
              <td style={{ padding: '6px 10px' }}>
                <select
                  value={row.department || ''}
                  onChange={e => onEdit(row._idx, 'department', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '100px' }}
                >
                  <option value="">–</option>
                  {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </td>
              {/* Phone */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.phone || ''}
                  onChange={e => onEdit(row._idx, 'phone', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '110px' }}
                  placeholder="–"
                />
              </td>
              {/* Email */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  value={row.email || ''}
                  onChange={e => onEdit(row._idx, 'email', e.target.value || null)}
                  style={{ ...CELL_INPUT, minWidth: '140px' }}
                  placeholder="–"
                />
              </td>
              {/* Hotel */}
              <td style={{ padding: '6px 10px' }}>
                {row.hotelNotFound ? (
                  <span style={{ fontSize: '11px', color: '#a16207', fontWeight: '600' }}>⚠ {row.hotel || '–'}</span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#374151' }}>
                    {row.hotel_id
                      ? (locations.find(l => l.id === row.hotel_id)?.name || row.hotel || row.hotel_id)
                      : (row.hotel || '–')}
                  </span>
                )}
              </td>
              {/* Arrival */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="date"
                  value={row.arrival_date || ''}
                  onChange={e => onEdit(row._idx, 'arrival_date', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              {/* Departure */}
              <td style={{ padding: '6px 10px' }}>
                <input
                  type="date"
                  value={row.departure_date || ''}
                  onChange={e => onEdit(row._idx, 'departure_date', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              {/* Status */}
              <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {row.active === false && (
                  <span style={{ display: 'block', marginBottom: '4px', padding: '2px 6px', borderRadius: '999px', fontSize: '9px', fontWeight: '700', background: '#e2e8f0', color: '#64748b', border: '1px solid #cbd5e1' }}>
                    🕐 Not yet active
                  </span>
                )}
                {row.existingId ? (
                  <button
                    onClick={() => onToggleAction(row._idx)}
                    style={{
                      padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700',
                      cursor: 'pointer', border: '1px solid',
                      ...(row.action === 'update'
                        ? { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }
                        : { background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }),
                    }}
                  >
                    {row.action === 'update' ? '🔄 Update' : '⏭ Skip'}
                  </button>
                ) : (
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                    ✅ New
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Custom preview table (raw JSON) ────────────────────────
function CustomTable({ rows }) {
  const fields = rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== '_idx' && k !== 'action' && k !== 'existingId') : []
  if (fields.length === 0) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {fields.map(f => <th key={f} style={TH}>{f}</th>)}
            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._idx} style={{ background: 'white', borderBottom: '1px solid #f1f5f9' }}>
              {fields.map(f => (
                <td key={f} style={{ padding: '6px 10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row[f] == null ? '#cbd5e1' : '#0f172a' }}>
                  {row[f] == null ? '–' : String(row[f])}
                </td>
              ))}
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                  ✅ New
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Accommodation preview table ────────────────────────────
function AccommodationTable({ rows, locations, onToggleAction, onEdit }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={TH}>First Name</th>
            <th style={TH}>Last Name</th>
            <th style={TH}>Role</th>
            <th style={TH}>Dept</th>
            <th style={TH}>Hotel</th>
            <th style={{ ...TH, textAlign: 'center' }}>Arrival</th>
            <th style={{ ...TH, textAlign: 'center' }}>Departure</th>
            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._idx} style={{ background: rowBg(row, 'accommodation'), borderBottom: '1px solid #f1f5f9' }}>
              {/* First name — read-only, from file */}
              <td style={{ padding: '6px 10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{row.first_name || '–'}</span>
              </td>
              {/* Last name */}
              <td style={{ padding: '6px 10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{row.last_name || '–'}</span>
              </td>
              {/* Role */}
              <td style={{ padding: '6px 10px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{row.role || '–'}</span>
              </td>
              {/* Dept */}
              <td style={{ padding: '6px 10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{row.department || '–'}</span>
              </td>
              {/* Hotel */}
              <td style={{ padding: '6px 10px' }}>
                {row.hotelNotFound ? (
                  <span style={{ fontSize: '11px', color: '#a16207', fontWeight: '600' }}>⚠ {row.hotel_name || '–'}</span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#374151' }}>
                    {row.hotel_id
                      ? (locations.find(l => l.id === row.hotel_id)?.name || row.hotel_name || row.hotel_id)
                      : (row.hotel_name || '–')}
                  </span>
                )}
              </td>
              {/* Arrival */}
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <input
                  type="date"
                  value={row.arrival_date || ''}
                  onChange={e => onEdit(row._idx, 'arrival_date', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              {/* Departure */}
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <input
                  type="date"
                  value={row.departure_date || ''}
                  onChange={e => onEdit(row._idx, 'departure_date', e.target.value || null)}
                  style={{ ...CELL_INPUT, width: '130px' }}
                />
              </td>
              {/* Status */}
              <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {!row.existingId ? (
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                    ✅ New
                  </span>
                ) : (
                  <button
                    onClick={() => onToggleAction(row._idx)}
                    style={{
                      padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700',
                      cursor: 'pointer', border: '1px solid',
                      ...(row.action === 'update'
                        ? { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }
                        : { background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }),
                    }}
                  >
                    {row.action === 'update' ? '🔄 Update' : '⏭ Skip'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Travel preview table ───────────────────────────────────
function TravelTable({ rows, locations }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={TH}>Data</th>
            <th style={TH}>Dir</th>
            <th style={TH}>Nome</th>
            <th style={TH}>Ruolo</th>
            <th style={TH}>From</th>
            <th style={TH}>Dep</th>
            <th style={TH}>To</th>
            <th style={TH}>Arr</th>
            <th style={TH}>Volo/Treno</th>
            <th style={TH}>P/up dep</th>
            <th style={TH}>P/up arr</th>
            <th style={TH}>Hotel</th>
            <th style={{ ...TH, textAlign: 'center' }}>Match</th>
            <th style={{ ...TH, textAlign: 'center' }}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const bg = row.match_status === 'unmatched' ? '#fef2f2'
                     : (row.travel_date_conflict || row.hotel_conflict) ? '#fefce8'
                     : row.needs_transport ? '#eff6ff'
                     : 'white'
            return (
              <tr key={row._idx} style={{ background: bg, borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11px' }}>{row.travel_date}</td>
                <td style={{ padding: '6px 10px' }}>
                  <span style={{ fontWeight: '700', fontSize: '11px', color: row.direction === 'IN' ? '#15803d' : '#c2410c' }}>
                    {row.direction === 'IN' ? '↓ IN' : '↑ OUT'}
                  </span>
                </td>
                <td style={{ padding: '6px 10px', fontWeight: '600', whiteSpace: 'nowrap' }}>{row.full_name_raw}</td>
                <td style={{ padding: '6px 10px', color: '#64748b', fontSize: '11px' }}>{row.role || '–'}</td>
                <td style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>{row.from_location || '–'}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11px' }}>{row.from_time || '–'}</td>
                <td style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>{row.to_location || '–'}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11px' }}>{row.to_time || '–'}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: '700', fontSize: '11px' }}>{row.travel_number || '–'}</td>
                <td style={{ padding: '6px 10px', fontSize: '11px' }}>{row.pickup_dep || '–'}</td>
                <td style={{ padding: '6px 10px', fontSize: '11px', fontWeight: row.needs_transport ? '700' : '400', color: row.needs_transport ? '#1d4ed8' : 'inherit' }}>
                  {row.pickup_arr || '–'}
                </td>
                <td style={{ padding: '6px 10px', fontSize: '11px' }}>
                  {row.hotelNotFound
                    ? <span style={{ color: '#a16207' }}>⚠ {row.hotel_raw}</span>
                    : row.hotel_id
                      ? (locations.find(l => l.id === row.hotel_id)?.name || row.hotel_raw || '–')
                      : (row.hotel_raw || '–')}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  {row.match_status === 'matched'
                    ? <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', fontWeight: '700' }}>✅</span>
                    : <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: '700' }}>❌</span>
                  }
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  {row.travel_date_conflict && <span style={{ display: 'block', fontSize: '10px', color: '#a16207', fontWeight: '700' }}>📅 date</span>}
                  {row.hotel_conflict && <span style={{ display: 'block', fontSize: '10px', color: '#a16207', fontWeight: '700' }}>🏨 hotel</span>}
                  {row.needs_transport && <span style={{ display: 'block', fontSize: '10px', color: '#1d4ed8', fontWeight: '700' }}>🚐 transport</span>}
                  {!row.travel_date_conflict && !row.hotel_conflict && !row.needs_transport && <span style={{ fontSize: '10px', color: '#94a3b8' }}>–</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Componente principale ───────────────────────────────────
// ── HotelPlacesModal ───────────────────────────────────────
function HotelPlacesModal({ hotelName, productionId, onSave, onSkip }) {
  const [suggestions, setSuggestions]         = useState([])
  const [loadingSugg, setLoadingSugg]         = useState(true)
  const [selectedPlaceId, setSelectedPlaceId] = useState(null)
  const [name, setName]                       = useState(hotelName || '')
  const [address, setAddress]                 = useState('')
  const [lat, setLat]                         = useState(null)
  const [lng, setLng]                         = useState(null)
  const [locationType, setLocationType]       = useState('HOTEL')
  const [saving, setSaving]                   = useState(false)
  const [saveError, setSaveError]             = useState(null)

  useEffect(() => {
    if (!hotelName || hotelName.length < 2) { setLoadingSugg(false); return }
    setLoadingSugg(true)
    fetch(`/api/places/autocomplete?q=${encodeURIComponent(hotelName)}`)
      .then(r => r.json())
      .then(d => { setSuggestions(d.predictions || []); setLoadingSugg(false) })
      .catch(() => setLoadingSugg(false))
  }, [hotelName])

  async function selectPlace(place_id) {
    setSelectedPlaceId(place_id)
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(place_id)}`)
      const d   = await res.json()
      setAddress(d.address || '')
      setLat(d.lat ?? null)
      setLng(d.lng ?? null)
      if (d.name) setName(d.name)
    } catch (e) {
      console.error('Places details error:', e)
    }
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/import/save-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), lat, lng, locationType, productionId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error saving location')
      onSave(d.id, d.name)
    } catch (e) {
      setSaveError(e.message)
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,35,64,0.65)', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onSkip() }}
    >
      <div style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>🏨 Add to Locations</div>
          <button onClick={onSkip} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '15px', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px' }}>

          {/* Hotel name from file */}
          <div style={{ marginBottom: '14px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From file</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginTop: '2px' }}>"{hotelName}"</div>
          </div>

          {/* Google Places suggestions */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Google Places suggestions
            </div>
            {loadingSugg ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>🔍 Searching…</div>
            ) : suggestions.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>No suggestions found — enter name manually below</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                {suggestions.map(s => (
                  <button
                    key={s.place_id}
                    onClick={() => selectPlace(s.place_id)}
                    style={{
                      padding: '8px 12px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                      border: `1px solid ${selectedPlaceId === s.place_id ? '#0369a1' : '#e2e8f0'}`,
                      background: selectedPlaceId === s.place_id ? '#e0f2fe' : 'white',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{s.main_text}</div>
                    {s.secondary_text && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{s.secondary_text}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name editable */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
              Location name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ ...CELL_INPUT, fontSize: '13px', padding: '8px 10px' }}
              placeholder="Hotel / Location name"
            />
          </div>

          {/* Address read-only from Google */}
          {address && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
                Address (from Google)
              </label>
              <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#374151' }}>
                {address}
              </div>
            </div>
          )}

          {/* Lat / Lng auto */}
          {(lat != null || lng != null) && (
            <div style={{ marginBottom: '10px', display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Lat</label>
                <div style={{ padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}>{lat}</div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Lng</label>
                <div style={{ padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}>{lng}</div>
              </div>
            </div>
          )}

          {/* Type selector */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Type</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[{ id: 'HOTEL', label: '🏨 HOTEL' }, { id: 'HUB', label: '🏭 HUB' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setLocationType(t.id)}
                  style={{
                    padding: '6px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    border: `1px solid ${locationType === t.id ? '#0f2340' : '#e2e8f0'}`,
                    background: locationType === t.id ? '#0f2340' : 'white',
                    color:      locationType === t.id ? 'white'   : '#374151',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
              ❌ {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onSkip} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              padding: '8px 22px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '800',
              background: saving || !name.trim() ? '#94a3b8' : '#0369a1',
              color: 'white',
              cursor: saving || !name.trim() ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : '💾 Save to Locations'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helper: estrae il Google Drive file ID da URL o ID grezzo ──
function extractDriveFileId(input) {
  // Gestisce URL come:
  //   https://drive.google.com/file/d/FILE_ID/view
  //   https://docs.google.com/spreadsheets/d/FILE_ID/edit
  const m = input.match(/\/d\/([a-zA-Z0-9_-]{15,})/)
  if (m) return m[1]
  // ID grezzo (alfanumerico + dash + underscore, min 15 char)
  if (/^[a-zA-Z0-9_-]{15,}$/.test(input)) return input
  return null
}

export function ImportModal({ open, mode: initialMode, productionId, locations = [], onClose, onImported, initialPhase, initialRows, initialNewHotels, initialDetectedMode, initialSelMode, initialFile }) {
  // state machine: 'idle' | 'parsing' | 'preview' | 'confirming' | 'done'
  const [phase, setPhase]         = useState('idle')
  const [selMode, setSelMode]     = useState(initialMode || 'hal')
  const [detectedMode, setDetectedMode] = useState(null)  // popolato dopo parse HAL
  const [customInstructions, setCustomInstructions] = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [rows, setRows]           = useState([])
  const [newHotels, setNewHotels] = useState([])
  const [error, setError]         = useState(null)
  const [result, setResult]       = useState(null)
  const fileInputRef = useRef(null)
  const currentFileRef = useRef(null)
  const [reviewMode, setReviewMode] = useState({ active: false, idx: 0 })
  const [sheetNames, setSheetNames] = useState([])
  const [selectedSheets, setSelectedSheets] = useState([])
  const [parseProgress, setParseProgress] = useState('')
  const [hotelModalIdx, setHotelModalIdx] = useState(null)

  // ── Google Drive Sync state ───────────────────────────────
  const [driveFiles, setDriveFiles]           = useState([])
  const [driveLoading, setDriveLoading]       = useState(false)
  const [driveSyncing, setDriveSyncing]       = useState({})    // { [file_id]: bool }
  const [driveError, setDriveError]           = useState(null)
  const [driveMsg, setDriveMsg]               = useState(null)
  const [driveAddInput, setDriveAddInput]     = useState('')
  const [driveAddMode, setDriveAddMode]       = useState('hal')
  const [driveAddLoading, setDriveAddLoading] = useState(false)

  function reset() {
    setPhase('idle'); setRows([]); setNewHotels([])
    setError(null); setResult(null); setCustomInstructions('')
    setDetectedMode(null); setReviewMode({ active: false, idx: 0 })
    setSheetNames([]); setSelectedSheets([]); setParseProgress('')
    setHotelModalIdx(null)
    setDriveMsg(null); setDriveError(null); setDriveAddInput('')
    currentFileRef.current = null
  }

  // Reset automatico quando il modal si chiude (qualunque sia la causa: backdrop, parent, onImported)
  useEffect(() => {
    if (open && initialFile) {
      // File già pronto (da Drive download) — reset e avvia parse subito
      reset()
      parseFile(initialFile)
      return
    }
    if (open && initialPhase === 'categorizing' && initialRows) {
      setRows(initialRows.map((r, i) => ({ ...r, _idx: i })))
      setNewHotels((initialNewHotels || []).map(h => ({ name: h.name, action: 'add' })))
      setDetectedMode(initialDetectedMode || null)
      if (initialSelMode) setSelMode(initialSelMode)
      const skipToPreview = initialSelMode === 'accommodation' || initialDetectedMode === 'accommodation'
      setPhase(skipToPreview ? 'preview' : 'categorizing')
      return
    }
    if (!open) reset()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carica i file Drive collegati quando il modal si apre
  useEffect(() => {
    if (open && productionId) loadDriveFiles()
  }, [open, productionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() { reset(); onClose() }

  // Modo effettivo per la preview (per HAL usa detectedMode, altrimenti selMode)
  const effectiveDisplayMode = (selMode === 'hal' && detectedMode) ? detectedMode : selMode

  // ── Parse file ─────────────────────────────────────────
  async function parseFile(file) {
    if (!productionId) { setError('productionId non disponibile'); return }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large — max 10 MB. Please reduce the file size before uploading.')
      return
    }
    setError(null)

    // Multi-sheet flow: accommodation/hal + xlsx/xls → mostra sheet selector prima di analizzare
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name)
    if ((selMode === 'accommodation' || selMode === 'hal') && isXlsx) {
      currentFileRef.current = file
      setPhase('parsing')
      setParseProgress('Reading sheet list…')
      try {
        const sheetFd = new FormData()
        sheetFd.append('file', file)
        const sheetRes = await fetch('/api/import/sheets', { method: 'POST', body: sheetFd })
        const sheetData = await sheetRes.json()
        if (!sheetRes.ok) throw new Error(sheetData.error || 'Error reading sheets')
        const names = sheetData.sheetNames || []
        setSheetNames(names)
        const preSelected = names.filter(n => n !== 'COST REPORT' && !n.toUpperCase().includes('OLD'))
        setSelectedSheets(preSelected)
        setParseProgress('')
        setPhase('sheet-select')
      } catch (e) {
        setError(e.message)
        setPhase('idle')
      }
      return
    }

    setPhase('parsing')
    setParseProgress('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', selMode)
      fd.append('productionId', productionId)
      if (customInstructions.trim()) fd.append('instructions', customInstructions)

      const res = await fetch('/api/import/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore parsing')

      // Salva detectedMode (per HAL)
      if (data.detectedMode) setDetectedMode(data.detectedMode)

      // Aggiungi _idx e pre-fill defaults capacity/pax_suggested per tipo (fleet only)
      const displayMode = data.detectedMode || selMode
      const enriched = (data.rows || []).map((r, i) => {
        if (displayMode === 'fleet' || r._subMode === 'fleet') {
          const vtype = (r.vehicle_type || 'VAN').toUpperCase()
          const def = FLEET_DEFAULTS[vtype] || {}
          return {
            ...r,
            _idx: i,
            capacity:      r.capacity      ?? (def.capacity      ?? null),
            pax_suggested: r.pax_suggested ?? (def.pax_suggested ?? null),
          }
        }
        return { ...r, _idx: i }
      })
      setRows(enriched)

      const hotels = (data.newData?.hotels || []).map(h => ({ name: h.name, action: 'add' }))
      setNewHotels(hotels)

      setPhase('categorizing')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  // ── Analyze selected sheets (multi-sheet loop) ─────────
  async function analyzeSheets() {
    const file = currentFileRef.current
    if (!file || selectedSheets.length === 0) return
    setPhase('parsing')
    setError(null)
    const allRows = []
    const allHotels = []
    let aggregatedDetectedMode = null
    for (let i = 0; i < selectedSheets.length; i++) {
      const sheetName = selectedSheets[i]
      setParseProgress(`Analyzing sheet ${i + 1} of ${selectedSheets.length}: ${sheetName}…`)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('mode', selMode)
        fd.append('productionId', productionId)
        fd.append('selectedSheet', sheetName)
        if (customInstructions.trim()) fd.append('instructions', customInstructions)
        const res = await fetch('/api/import/parse', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Error parsing: ${sheetName}`)
        if (data.detectedMode && !aggregatedDetectedMode) aggregatedDetectedMode = data.detectedMode
        const displayMode = aggregatedDetectedMode || selMode
        const sheetRows = (data.rows || []).map(r => {
          if (displayMode === 'fleet' || r._subMode === 'fleet') {
            const vtype = (r.vehicle_type || 'VAN').toUpperCase()
            const def = FLEET_DEFAULTS[vtype] || {}
            return { ...r, capacity: r.capacity ?? (def.capacity ?? null), pax_suggested: r.pax_suggested ?? (def.pax_suggested ?? null) }
          }
          return r
        })
        allRows.push(...sheetRows)
        const sheetHotels = (data.newData?.hotels || []).map(h => ({ name: h.name, action: 'add' }))
        for (const h of sheetHotels) {
          if (!allHotels.find(x => x.name === h.name)) allHotels.push(h)
        }
      } catch (e) {
        console.error(`Sheet "${sheetName}" error:`, e.message)
      }
    }
    // Assegna _idx sequenziali dopo l'aggregazione
    const enriched = allRows.map((r, i) => ({ ...r, _idx: i }))
    if (aggregatedDetectedMode) setDetectedMode(aggregatedDetectedMode)
    setRows(enriched)
    setNewHotels(allHotels)
    setParseProgress('')
    setPhase('categorizing')
  }

  // ── Confirm import ─────────────────────────────────────
  async function handleConfirm() {
    setPhase('confirming')
    const t0 = Date.now()
    try {
      const newLocations = newHotels.filter(h => h.action === 'add').map(h => ({ name: h.name }))
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          mode: selMode,
          productionId,
          newLocations,
          detectedMode: detectedMode || selMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore confirm')
      setResult(data)
      // Minimo 800ms nella fase 'confirming' così l'utente vede il feedback "Saving…"
      const elapsed = Date.now() - t0
      if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed))
      setPhase('done')
      // onImported viene chiamato dal pulsante Close nella fase done, non qui,
      // per evitare che il parent chiuda il modal prima che la fase done sia visibile
    } catch (e) {
      setError(e.message)
      setPhase('preview')
    }
  }

  // ── Hotel save from HotelPlacesModal ──────────────────
  function handleHotelSave(idx, locationId, locationName) {
    const hotelName = newHotels[idx]?.name
    setNewHotels(prev => prev.map((h, i) => i === idx ? { ...h, locationId, locationName, action: 'saved' } : h))
    if (hotelName) {
      setRows(prev => prev.map(r =>
        r.hotel_name === hotelName ? { ...r, hotel_id: locationId, hotelNotFound: false } : r
      ))
    }
    setHotelModalIdx(null)
  }

  // ── Google Drive Sync functions ───────────────────────
  async function loadDriveFiles() {
    if (!productionId) return
    setDriveLoading(true)
    setDriveError(null)
    try {
      const res = await fetch(`/api/drive/files?production_id=${encodeURIComponent(productionId)}`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error loading Drive files')
      setDriveFiles(d.files || [])
    } catch (e) {
      setDriveError(e.message)
    } finally {
      setDriveLoading(false)
    }
  }

  async function handleDriveLink() {
    if (!driveAddInput.trim() || !productionId) return
    const fileId = extractDriveFileId(driveAddInput.trim())
    if (!fileId) { setDriveError('Invalid Drive URL or File ID — paste the full URL or the raw file ID'); return }
    setDriveAddLoading(true)
    setDriveError(null)
    setDriveMsg(null)
    try {
      const res = await fetch('/api/drive/files', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ production_id: productionId, file_id: fileId, file_name: fileId, import_mode: driveAddMode }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error linking file')
      setDriveAddInput('')
      setDriveMsg(`✅ ${d.file?.file_name || fileId} linked successfully`)
      await loadDriveFiles()
    } catch (e) {
      setDriveError(e.message)
    } finally {
      setDriveAddLoading(false)
    }
  }

  async function handleDriveUnlink(id) {
    if (!confirm('Unlink this file from Drive Sync?')) return
    setDriveError(null)
    setDriveMsg(null)
    try {
      const res = await fetch('/api/drive/files', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error unlinking file')
      setDriveMsg('✅ File unlinked')
      setDriveFiles(prev => prev.filter(f => f.id !== id))
    } catch (e) {
      setDriveError(e.message)
    }
  }

  async function handleDriveSync(fileId) {
    if (!productionId) return
    setDriveSyncing(prev => ({ ...prev, [fileId]: true }))
    setDriveError(null)
    setDriveMsg(null)
    try {
      const res = await fetch('/api/drive/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ production_id: productionId, file_id: fileId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error syncing file')
      const s = d.summary || {}
      const failedList = d.failed || []
      const allFailed = failedList.length > 0 && !(s.synced) && !(s.skipped)
      setDriveMsg(
        `${allFailed ? '❌' : '✅'} Sync done — ${s.synced || 0} synced, ${s.skipped || 0} unchanged, ${s.failed || 0} failed`
      )
      if (failedList.length > 0) {
        setDriveError(failedList.map(f => `${f.file_name || f.file_id}: ${f.error}`).join('\n'))
      }
      await loadDriveFiles()
      if ((s.synced || 0) > 0) onImported?.(d)
    } catch (e) {
      setDriveError(e.message)
    } finally {
      setDriveSyncing(prev => ({ ...prev, [fileId]: false }))
    }
  }

  // ── File handlers ──────────────────────────────────────
  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }
  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  // ── Row mutations ──────────────────────────────────────
  function toggleRowAction(idx) {
    setRows(prev => prev.map(r => {
      if (r._idx !== idx) return r
      if (r.action === 'update') return { ...r, action: 'skip' }
      if (r.action === 'skip' && r.existingId) return { ...r, action: 'update' }
      return r
    }))
  }
  function editRowField(idx, field, value) {
    setRows(prev => prev.map(r => r._idx === idx ? { ...r, [field]: value } : r))
  }

  if (!open) return null

  // ── Statistiche preview ────────────────────────────────
  // --- Smart Categorization (computed) ---
  const updateWithNewInfo  = rows.filter(r => r.existingId && Array.isArray(r.newFields) && r.newFields.length > 0)
  const newInsertRows      = rows.filter(r => !r.existingId)
  const STANDARD_VTYPES    = ['VAN', 'CAR', 'BUS', 'TRUCK', 'PICKUP', 'CARGO']
  const isFleetCtx         = effectiveDisplayMode === 'fleet' || effectiveDisplayMode === 'mixed'
  const nonStdTypeRows     = isFleetCtx ? rows.filter(r => {
    const isFleet = r._subMode === 'fleet' || (!r._subMode && effectiveDisplayMode === 'fleet')
    return isFleet && r.vehicle_type && !STANDARD_VTYPES.includes((r.vehicle_type || '').toUpperCase()) && r.action !== 'skip'
  }) : []
  const nonStdVehicleTypes = [...new Set(nonStdTypeRows.map(r => r.vehicle_type))]
  const currentReviewRow   = reviewMode.active ? updateWithNewInfo[reviewMode.idx] : null

  const CAT_FIELD_LABELS = {
    driver_name: 'Driver', vehicle_type: 'Type', license_plate: 'Plate',
    capacity: 'Capacity', pax_suggested: 'Pax Sugg.', pax_max: 'Pax Max',
    sign_code: 'Sign Code', available_from: 'Avail. From', available_to: 'Avail. To',
    role: 'Role', department: 'Dept', phone: 'Phone', email: 'Email',
    hotel_id: 'Hotel', arrival_date: 'Arrival', departure_date: 'Departure',
  }

  function getCatRowName(row) {
    if (row._subMode === 'fleet' || effectiveDisplayMode === 'fleet') {
      return row.sign_code || row.driver_name || row.plate || row.existingId || '—'
    }
    return (`${row.first_name || ''} ${row.last_name || ''}`).trim() || '—'
  }

  function getCatRowSub(row) {
    if (row._subMode === 'fleet' || effectiveDisplayMode === 'fleet') {
      return [row.vehicle_type, row.plate].filter(Boolean).join(' · ')
    }
    if (effectiveDisplayMode === 'accommodation') {
      return [row.department, row.hotel_name].filter(Boolean).join(' · ')
    }
    return [row.department, row.role].filter(Boolean).join(' · ')
  }

  function getCatFieldValue(row, field) {
    if (field === 'license_plate') return row.plate
    if (field === 'hotel_id')      return row.hotel || row.hotel_id
    return row[field] != null ? String(row[field]) : null
  }

  function advanceReview(skipCurrent) {
    if (currentReviewRow) {
      setRows(prev => prev.map(r =>
        r._idx === currentReviewRow._idx
          ? { ...r, action: skipCurrent ? 'skip' : 'update' }
          : r
      ))
    }
    const nextIdx = reviewMode.idx + 1
    if (nextIdx >= updateWithNewInfo.length) {
      setReviewMode({ active: false, idx: 0 })
    } else {
      setReviewMode({ active: true, idx: nextIdx })
    }
  }

  const insertCount   = rows.filter(r => r.action === 'insert').length
  const updateCount   = rows.filter(r => r.action === 'update').length
  const skipCount     = rows.filter(r => r.action === 'skip').length
  const inactiveCount = rows.filter(r => r.active === false).length
  const needReview    = rows.filter(r => !isUnrecognized(r, effectiveDisplayMode) && hasNullFields(r, effectiveDisplayMode)).length
  const dupCount      = rows.filter(r => r.existingId).length
  const goodRows      = rows.filter(r => !isUnrecognized(r, effectiveDisplayMode))
  const badRows       = rows.filter(r => isUnrecognized(r, effectiveDisplayMode))
  const activeCount   = rows.filter(r => r.action === 'insert' || r.action === 'update').length

  // Per mixed: separa crew e fleet
  const crewRows  = goodRows.filter(r => r._subMode === 'crew'  || (!r._subMode && effectiveDisplayMode === 'crew'))
  const fleetRows = goodRows.filter(r => r._subMode === 'fleet' || (!r._subMode && effectiveDisplayMode === 'fleet'))

  // ── Helpers tabelle preview ────────────────────────────
  function renderPreviewTable() {
    if (effectiveDisplayMode === 'mixed') {
      return (
        <>
          {crewRows.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                👥 Crew ({crewRows.length})
              </div>
              <CrewTable rows={crewRows} locations={locations} onToggleAction={toggleRowAction} onEdit={editRowField} />
            </div>
          )}
          {fleetRows.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                🚗 Fleet ({fleetRows.length})
              </div>
              <FleetTable rows={fleetRows} onToggleAction={toggleRowAction} onEdit={editRowField} />
            </div>
          )}
        </>
      )
    }
    if (effectiveDisplayMode === 'fleet') {
      return <FleetTable rows={goodRows} onToggleAction={toggleRowAction} onEdit={editRowField} />
    }
    if (effectiveDisplayMode === 'crew') {
      return <CrewTable rows={goodRows} locations={locations} onToggleAction={toggleRowAction} onEdit={editRowField} />
    }
    if (effectiveDisplayMode === 'accommodation') {
      return <AccommodationTable rows={goodRows} locations={locations} onToggleAction={toggleRowAction} onEdit={editRowField} />
    }
    if (effectiveDisplayMode === 'travel') {
      return <TravelTable rows={goodRows} locations={locations} />
    }
    if (effectiveDisplayMode === 'custom') {
      return <CustomTable rows={goodRows} />
    }
    return null
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(15,35,64,0.45)', padding: '16px 12px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget && phase !== 'confirming') handleClose() }}
    >
      <div style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '1400px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>

        {/* ── Header ────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', borderRadius: '14px 14px 0 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'white' }}>📂 Import from file</div>
            {phase === 'preview' && detectedMode && selMode === 'hal' && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: 'rgba(255,255,255,0.15)', color: 'white' }}>
                🔴 HAL detected: {detectedMode}
              </span>
            )}
          </div>
          <button onClick={handleClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        {/* ── Body ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ─── FASE: idle ─── */}
          {phase === 'idle' && (
            <div style={{ padding: '24px' }}>

              {/* Mode selector */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>Import mode</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'hal',           label: '🔴 HAL',                   desc: 'Let me figure it out' },
                    { id: 'crew',          label: '👥 Crew list',             desc: null },
                    { id: 'fleet',         label: '🚗 Fleet list',            desc: null },
                    { id: 'accommodation', label: '🏨 Accommodation list',    desc: 'Estrae nome, hotel, date arrivo/partenza' },
                    { id: 'travel',        label: '✈️ Travel Calendar',        desc: 'Voli, treni, pickup — formato DIG' },
                    { id: 'custom',        label: '✏️ Custom instructions…',   desc: null },
                  ].map(m => (
                    <button key={m.id} onClick={() => setSelMode(m.id)}
                      style={{
                        padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        cursor: 'pointer',
                        border: `1px solid ${selMode === m.id ? '#0f2340' : '#e2e8f0'}`,
                        background: selMode === m.id ? '#0f2340' : 'white',
                        color: selMode === m.id ? 'white' : '#374151',
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                      }}>
                      <span>{m.label}</span>
                      {m.desc && <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.7 }}>{m.desc}</span>}
                    </button>
                  ))}
                </div>

                {/* Instructions textarea — sempre visibile, obbligatoria solo per custom */}
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder={
                    selMode === 'hal'    ? 'Optional: any hint about the document structure or content…' :
                    selMode === 'fleet'  ? 'Optional: specify sheet name, columns to use, etc. e.g. "Read data from sheet named Vehicles"' :
                    selMode === 'crew'   ? 'Optional: specify sheet name, columns to use, etc. e.g. "Read data from sheet named Cast List"' :
                    'Describe what to extract from the file and what fields to return as JSON…'
                  }
                  style={{
                    marginTop: '10px', width: '100%',
                    minHeight: selMode === 'custom' ? '80px' : '44px',
                    padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px',
                    fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
                    color: '#0f172a',
                    background: selMode === 'custom' ? 'white' : '#f8fafc',
                  }}
                />
              </div>

              {/* Drag & drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`, borderRadius: '12px', padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#eff6ff' : '#f8fafc', transition: 'all 0.15s' }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
                  Drag & drop or click to browse
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Accepted: .xlsx, .xls, .csv, .pdf, .docx
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx" style={{ display: 'none' }} onChange={onFileChange} />
              </div>

              {error && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                  ❌ {error}
                </div>
              )}

              {/* ─── Google Drive Sync section ─── */}
              <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>

                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#374151' }}>📁 Google Drive Sync</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>Link Drive files for re-import on demand</span>
                  </div>
                  {driveFiles.length > 0 && (
                    <button
                      onClick={() => driveFiles.forEach(f => !driveSyncing[f.file_id] && handleDriveSync(f.file_id))}
                      style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #0369a1', background: '#e0f2fe', color: '#0369a1', whiteSpace: 'nowrap' }}>
                      🔄 Sync All
                    </button>
                  )}
                </div>

                {/* Add file form */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <input
                    value={driveAddInput}
                    onChange={e => { setDriveAddInput(e.target.value); setDriveError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') handleDriveLink() }}
                    placeholder="Paste Google Drive URL or File ID…"
                    style={{ flex: 1, minWidth: '220px', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#0f172a' }}
                  />
                  <select
                    value={driveAddMode}
                    onChange={e => setDriveAddMode(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#374151', background: 'white', cursor: 'pointer' }}>
                    <option value="hal">🔴 HAL</option>
                    <option value="crew">👥 Crew</option>
                    <option value="accommodation">🏨 Accommodation</option>
                    <option value="fleet">🚗 Fleet</option>
                    <option value="travel">✈️ Travel Calendar</option>
                  </select>
                  <button
                    onClick={handleDriveLink}
                    disabled={driveAddLoading || !driveAddInput.trim()}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none',
                      background: driveAddLoading || !driveAddInput.trim() ? '#94a3b8' : '#0f2340',
                      color: 'white', fontSize: '12px', fontWeight: '700',
                      cursor: driveAddLoading || !driveAddInput.trim() ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    {driveAddLoading ? 'Linking…' : '＋ Link'}
                  </button>
                </div>

                {/* Drive messages */}
                {driveError && (
                  <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ whiteSpace: 'pre-line' }}>❌ {driveError}</span>
                    <button onClick={() => setDriveError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '14px', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                  </div>
                )}
                {driveMsg && (
                  <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span>{driveMsg}</span>
                    <button onClick={() => setDriveMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: '14px', padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                )}

                {/* File list */}
                {driveLoading ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px 0' }}>Loading linked files…</div>
                ) : driveFiles.length === 0 ? (
                  <div style={{ padding: '14px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '9px', textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>No Drive files linked yet</div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '3px' }}>Paste a Google Drive URL or File ID above to get started</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {driveFiles.map(f => {
                      const MODE_LABELS = { hal: '🔴 HAL', crew: '👥 Crew', accommodation: '🏨 Accomm.', fleet: '🚗 Fleet', travel: '✈️ Travel' }
                      const syncing  = !!driveSyncing[f.file_id]
                      const lastSync = f.last_synced_at
                        ? new Date(f.last_synced_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : 'Never'
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              📄 {f.file_name || f.file_id}
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                              {MODE_LABELS[f.import_mode] || f.import_mode} · Last sync: {lastSync}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDriveSync(f.file_id)}
                            disabled={syncing}
                            style={{
                              padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                              cursor: syncing ? 'default' : 'pointer',
                              border: '1px solid #0369a1',
                              background: syncing ? '#f1f5f9' : '#e0f2fe',
                              color: syncing ? '#94a3b8' : '#0369a1',
                              whiteSpace: 'nowrap',
                            }}>
                            {syncing ? '⏳ Syncing…' : '🔄 Sync now'}
                          </button>
                          <button
                            onClick={() => handleDriveUnlink(f.id)}
                            disabled={syncing}
                            title="Unlink file"
                            style={{
                              padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
                              cursor: syncing ? 'default' : 'pointer',
                              border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                              opacity: syncing ? 0.5 : 1,
                            }}>
                            🗑
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Info note */}
                <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', fontSize: '10px', color: '#94a3b8', lineHeight: 1.5 }}>
                  💡 <b>Sync now</b> usa la tua sessione Google attiva. Il cron automatico (ogni 30 min) logga solo i file registrati — premi &ldquo;Sync now&rdquo; per importare i dati aggiornati.
                </div>
              </div>
            </div>
          )}

          {/* ─── FASE: parsing ─── */}
          {phase === 'parsing' && (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
              {parseProgress ? 'Analyzing sheets…' : (selMode === 'hal' ? 'Analyzing file with AI…' : 'Extracting data…')}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{parseProgress || 'Claude is analyzing your file'}</div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1', animation: `pulse ${0.6 + i * 0.2}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            </div>
          )}

          {/* ─── FASE: sheet-select ─── */}
          {phase === 'sheet-select' && (
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f2340', marginBottom: '4px' }}>
                  📋 Select sheets to analyze
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {sheetNames.length} sheet{sheetNames.length !== 1 ? 's' : ''} found — "COST REPORT" and sheets with "OLD" in the name are pre-deselected
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
                {/* Select all / Deselect all */}
                <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={sheetNames.length > 0 && selectedSheets.length === sheetNames.length}
                      onChange={e => setSelectedSheets(e.target.checked ? [...sheetNames] : [])}
                    />
                    {sheetNames.length > 0 && selectedSheets.length === sheetNames.length ? 'Deselect all' : 'Select all'}
                  </label>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                    {selectedSheets.length} / {sheetNames.length} selected
                  </span>
                </div>
                {/* Sheet list */}
                {sheetNames.map((name, i) => {
                  const isSelected = selectedSheets.includes(name)
                  const isAutoExcluded = name === 'COST REPORT' || name.toUpperCase().includes('OLD')
                  return (
                    <div key={name} style={{ padding: '10px 16px', borderBottom: i < sheetNames.length - 1 ? '1px solid #f1f5f9' : 'none', background: isSelected ? 'white' : '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) setSelectedSheets(prev => [...prev, name])
                            else setSelectedSheets(prev => prev.filter(s => s !== name))
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: isSelected ? '600' : '400', color: isSelected ? '#0f172a' : '#94a3b8' }}>
                          {name}
                        </span>
                      </label>
                      {isAutoExcluded && (
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          auto-excluded
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                  ❌ {error}
                </div>
              )}
            </div>
          )}

          {/* --- FASE: categorizing --- */}
          {phase === 'categorizing' && (
            <div style={{ padding: '20px' }}>
              {reviewMode.active && currentReviewRow ? (
                /* Review one by one */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f2340' }}>
                      Reviewing: <span style={{ color: '#1d4ed8' }}>{getCatRowName(currentReviewRow)}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', background: '#f1f5f9', padding: '3px 10px', borderRadius: '999px' }}>
                      {reviewMode.idx + 1} / {updateWithNewInfo.length}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Current in database</div>
                      {currentReviewRow.newFields.map(field => (
                        <div key={field} style={{ marginBottom: '7px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', minWidth: '80px', paddingTop: '1px' }}>{CAT_FIELD_LABELS[field] || field}</span>
                          <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                            {currentReviewRow.existingData?.[field] != null ? String(currentReviewRow.existingData[field]) : 'empty'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>From file (new values)</div>
                      {currentReviewRow.newFields.map(field => {
                        const val = getCatFieldValue(currentReviewRow, field)
                        return (
                          <div key={field} style={{ marginBottom: '7px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#15803d', textTransform: 'uppercase', minWidth: '80px', paddingTop: '1px' }}>{CAT_FIELD_LABELS[field] || field}</span>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>{val != null ? val : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setReviewMode({ active: false, idx: 0 })}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                      Back to summary
                    </button>
                    <button onClick={() => advanceReview(true)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>
                      Skip
                    </button>
                    <button onClick={() => advanceReview(false)}
                      style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#16a34a', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}>
                      Accept {reviewMode.idx < updateWithNewInfo.length - 1 ? '→ next' : '→ done'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Section 1: Existing records with new info */}
                  {updateWithNewInfo.length > 0 && (
                    <div style={{ marginBottom: '16px', border: '1px solid #fde68a', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#a16207' }}>New info for existing {isFleetCtx ? 'vehicles' : 'crew'}</div>
                          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Found new data for {updateWithNewInfo.length} record{updateWithNewInfo.length !== 1 ? 's' : ''} already in your database</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => setRows(prev => prev.map(r => (r.existingId && Array.isArray(r.newFields) && r.newFields.length > 0) ? { ...r, action: 'skip' } : r))}
                            style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #a16207', background: 'white', color: '#a16207' }}>
                            Skip all
                          </button>
                          <button
                            onClick={() => setRows(prev => prev.map(r => (r.existingId && Array.isArray(r.newFields) && r.newFields.length > 0) ? { ...r, action: 'update' } : r))}
                            style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#a16207', color: 'white' }}>
                            Accept all
                          </button>
                          <button
                            onClick={() => setReviewMode({ active: true, idx: 0 })}
                            style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #a16207', background: 'white', color: '#a16207' }}>
                            Review one by one
                          </button>
                        </div>
                      </div>
                      <div>
                        {updateWithNewInfo.map((row, i) => (
                          <div key={row._idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: i < updateWithNewInfo.length - 1 ? '1px solid #fef3c7' : 'none', background: row.action === 'skip' ? '#f8fafc' : 'white' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: row.action === 'skip' ? '#94a3b8' : '#374151' }}>{getCatRowName(row)}</span>
                              {getCatRowSub(row) && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>{getCatRowSub(row)}</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: '#a16207', whiteSpace: 'nowrap' }}>{row.newFields.map(f => CAT_FIELD_LABELS[f] || f).join(', ')}</div>
                            <button
                              onClick={() => setRows(prev => prev.map(r => r._idx === row._idx ? { ...r, action: r.action === 'skip' ? 'update' : 'skip' } : r))}
                              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap', flexShrink: 0, ...(row.action === 'skip' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#fef3c7', color: '#a16207', borderColor: '#fde68a' }) }}>
                              {row.action === 'skip' ? '+ Re-add' : 'Skip'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 2: Unknown records */}
                  {newInsertRows.length > 0 && (
                    <div style={{ marginBottom: '16px', border: '1px solid #fecaca', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626' }}>Unknown records</div>
                          <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>These entries appear in the file but are not in your database</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => { const ids = new Set(newInsertRows.map(r => r._idx)); setRows(prev => prev.map(r => ids.has(r._idx) ? { ...r, action: 'skip' } : r)) }}
                            style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #dc2626', background: 'white', color: '#dc2626' }}>
                            Skip all
                          </button>
                          <button
                            onClick={() => { const ids = new Set(newInsertRows.map(r => r._idx)); setRows(prev => prev.map(r => ids.has(r._idx) ? { ...r, action: 'insert' } : r)) }}
                            style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#dc2626', color: 'white' }}>
                            + Add all
                          </button>
                        </div>
                      </div>
                      <div>
                        {newInsertRows.map((row, i) => (
                          <div key={row._idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: i < newInsertRows.length - 1 ? '1px solid #fee2e2' : 'none', background: row.action === 'skip' ? '#f8fafc' : 'white' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: row.action === 'skip' ? '#94a3b8' : '#374151' }}>{getCatRowName(row)}</span>
                              {getCatRowSub(row) && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>{getCatRowSub(row)}</span>}
                            </div>
                            <button
                              onClick={() => setRows(prev => prev.map(r => r._idx === row._idx ? { ...r, action: r.action === 'skip' ? 'insert' : 'skip' } : r))}
                              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap', flexShrink: 0, ...(row.action === 'skip' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }) }}>
                              {row.action === 'skip' ? '+ Add' : 'Skip'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 3: New locations */}
                  {newHotels.length > 0 && (
                    <div style={{ marginBottom: '16px', border: '1px solid #bae6fd', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: '#e0f2fe' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0369a1' }}>New locations detected</div>
                        <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '2px' }}>Hotels not found in your locations — use Google Places to find and save them</div>
                      </div>
                      <div>
                        {newHotels.map((h, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: i < newHotels.length - 1 ? '1px solid #e0f2fe' : 'none', background: h.action === 'skip' ? '#f8fafc' : 'white' }}>
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: h.locationId || h.action === 'skip' ? '#94a3b8' : '#374151' }}>🏨 {h.name}</span>
                            {h.locationId ? (
                              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                ✅ {h.locationName}
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => setHotelModalIdx(i)}
                                  style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid #bae6fd', background: '#e0f2fe', color: '#0369a1', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  + Add
                                </button>
                                <button
                                  onClick={() => setNewHotels(prev => prev.map((x, xi) => xi === i ? { ...x, action: x.action === 'skip' ? 'add' : 'skip' } : x))}
                                  style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap', flexShrink: 0, ...(h.action === 'skip' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }) }}>
                                  {h.action === 'skip' ? '↩ Restore' : 'Skip'}
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 4: Non-standard vehicle types */}
                  {nonStdVehicleTypes.length > 0 && (
                    <div style={{ marginBottom: '16px', border: '1px solid #d1fae5', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: '#ecfdf5' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#15803d' }}>Non-standard vehicle types</div>
                        <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>These vehicle types were not recognized — expected VAN, CAR or BUS</div>
                      </div>
                      <div>
                        {nonStdVehicleTypes.map((vtype, i) => {
                          const typeRows = nonStdTypeRows.filter(r => r.vehicle_type === vtype)
                          const allSkipped = typeRows.every(r => r.action === 'skip')
                          return (
                            <div key={vtype} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: i < nonStdVehicleTypes.length - 1 ? '1px solid #d1fae5' : 'none', background: allSkipped ? '#f8fafc' : 'white' }}>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: allSkipped ? '#94a3b8' : '#374151' }}>{vtype}</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>{typeRows.length} vehicle{typeRows.length !== 1 ? 's' : ''}</span>
                              </div>
                              <button
                                onClick={() => setRows(prev => prev.map(r => r.vehicle_type === vtype ? { ...r, action: r.action === 'skip' ? 'insert' : 'skip' } : r))}
                                style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap', flexShrink: 0, ...(allSkipped ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#ecfdf5', color: '#15803d', borderColor: '#d1fae5' }) }}>
                                {allSkipped ? '+ Include all' : 'Skip all'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* All clear */}
                  {updateWithNewInfo.length === 0 && newInsertRows.length === 0 && newHotels.length === 0 && nonStdVehicleTypes.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                      <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#15803d' }}>All records ready</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>No conflicts to review — proceed to preview</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {phase === 'preview' && (
            <div style={{ padding: '20px' }}>

              {/* Banner stats */}
              <div style={{ marginBottom: '16px', padding: '10px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>
                  {rows.length} rows found
                </span>
                {insertCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#15803d', fontWeight: '600' }}>✅ {insertCount} new</span>
                )}
                {updateCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#c2410c', fontWeight: '600' }}>🔄 {updateCount} update</span>
                )}
                {skipCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>⏭ {skipCount} skip</span>
                )}
                {inactiveCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>🕐 {inactiveCount} not yet active</span>
                )}
                {needReview > 0 && (
                  <span style={{ fontSize: '12px', color: '#a16207', fontWeight: '600' }}>⚠️ {needReview} need review</span>
                )}
                {dupCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#c2410c', fontWeight: '600' }}>🔁 {dupCount} duplicate{dupCount > 1 ? 's' : ''}</span>
                )}
                {badRows.length > 0 && (
                  <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>❌ {badRows.length} not recognized</span>
                )}
                {effectiveDisplayMode === 'travel' && (
                  <>
                    {rows.filter(r => r.match_status === 'matched').length > 0 && (
                      <span style={{ fontSize: '12px', color: '#15803d', fontWeight: '600' }}>
                        ✅ {rows.filter(r => r.match_status === 'matched').length} matched
                      </span>
                    )}
                    {rows.filter(r => r.match_status === 'unmatched').length > 0 && (
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                        ❌ {rows.filter(r => r.match_status === 'unmatched').length} unmatched
                      </span>
                    )}
                    {rows.filter(r => r.needs_transport).length > 0 && (
                      <span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: '600' }}>
                        🚐 {rows.filter(r => r.needs_transport).length} transport
                      </span>
                    )}
                    {rows.filter(r => r.travel_date_conflict || r.hotel_conflict).length > 0 && (
                      <span style={{ fontSize: '12px', color: '#a16207', fontWeight: '600' }}>
                        ⚠️ {rows.filter(r => r.travel_date_conflict || r.hotel_conflict).length} conflitti
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Sezione: nuovi hotel (crew / mixed / accommodation) */}
              {(effectiveDisplayMode === 'crew' || effectiveDisplayMode === 'mixed' || effectiveDisplayMode === 'accommodation') && newHotels.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '14px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '9px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#a16207', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🏨 New hotels detected — not found in Locations
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {newHotels.map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', flex: 1 }}>🏨 {h.name}</span>
                        <button
                          onClick={() => setNewHotels(prev => prev.map((x, xi) => xi === i ? { ...x, action: 'add' } : x))}
                          style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(h.action === 'add' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}
                        >
                          + Add to Locations
                        </button>
                        <button
                          onClick={() => setNewHotels(prev => prev.map((x, xi) => xi === i ? { ...x, action: 'skip' } : x))}
                          style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(h.action === 'skip' ? { background: '#dc2626', color: 'white', borderColor: '#dc2626' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}
                        >
                          Skip
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legenda colori */}
              <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Legend:</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'white', border: '1px solid #e2e8f0', color: '#64748b' }}>✅ New</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c' }}>🔁 Duplicate</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#fefce8', border: '1px solid #fde68a', color: '#a16207' }}>⚠️ Missing fields</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b' }}>🕐 Not yet active</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>❌ Not recognized</span>
              </div>

              {/* Tabelle principali */}
              {goodRows.length > 0 && renderPreviewTable()}

              {/* Righe non riconosciute — in fondo */}
              {badRows.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
                    ❌ {badRows.length} row{badRows.length > 1 ? 's' : ''} not recognized
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {badRows.map((r) => (
                      <div key={r._idx} style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', fontSize: '12px', color: '#dc2626', fontFamily: 'monospace' }}>
                        {JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_'))))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                  ❌ {error}
                </div>
              )}
            </div>
          )}

          {/* ─── FASE: confirming ─── */}
          {phase === 'confirming' && (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>💾</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>Saving…</div>
            </div>
          )}

          {/* ─── FASE: done ─── */}
          {phase === 'done' && result && (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d', marginBottom: '20px' }}>Import complete!</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {result.inserted > 0 && (
                  <div style={{ padding: '12px 24px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', minWidth: '100px' }}>
                    <div style={{ fontSize: '26px', fontWeight: '800', color: '#15803d' }}>{result.inserted}</div>
                    <div style={{ fontSize: '12px', color: '#15803d', fontWeight: '600' }}>inserted</div>
                  </div>
                )}
                {result.updated > 0 && (
                  <div style={{ padding: '12px 24px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px', minWidth: '100px' }}>
                    <div style={{ fontSize: '26px', fontWeight: '800', color: '#c2410c' }}>{result.updated}</div>
                    <div style={{ fontSize: '12px', color: '#c2410c', fontWeight: '600' }}>updated</div>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div style={{ padding: '12px 24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', minWidth: '100px' }}>
                    <div style={{ fontSize: '26px', fontWeight: '800', color: '#64748b' }}>{result.skipped}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>skipped</div>
                  </div>
                )}
              </div>

              {/* Banner conflitti travel — visibile solo se mode=travel e ci sono conflitti */}
              {result.conflicts > 0 && (
                <div style={{ marginTop: '20px', padding: '14px 18px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', maxWidth: '480px', margin: '20px auto 0', textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#a16207', marginBottom: '6px' }}>
                    ⚠️ {result.conflicts} variazion{result.conflicts === 1 ? 'e rilevata' : 'i rilevate'} nel Travel Calendar
                  </div>
                  <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '10px' }}>
                    Date o hotel nel calendario di viaggio non corrispondono alla rooming list.
                    Vai al Bridge per risolverle.
                  </div>
                  <a
                    href="/dashboard/bridge"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '7px 16px', borderRadius: '8px',
                      background: '#0f2340', color: 'white', textDecoration: 'none',
                      fontSize: '12px', fontWeight: '800',
                    }}
                  >
                    ⚓ Vai al Bridge →
                  </a>
                </div>
              )}

              {result.errors?.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#dc2626', textAlign: 'left', maxWidth: '500px', margin: '16px auto 0' }}>
                  ⚠️ {result.errors.length} error{result.errors.length > 1 ? 's' : ''}:
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end', borderRadius: '0 0 14px 14px', flexShrink: 0, background: 'white' }}>
          {phase === 'done' && (
            <button onClick={() => { onImported?.(result); handleClose() }}
              style={{ padding: '9px 28px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
              Close
            </button>
          )}

          {phase === 'categorizing' && !reviewMode.active && (
            <>
              <button onClick={() => { setPhase('idle'); setRows([]); setNewHotels([]); setError(null); setDetectedMode(null); setReviewMode({ active: false, idx: 0 }) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                Back
              </button>
              <button onClick={() => setPhase('preview')}
                style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
                Preview &amp; Confirm
              </button>
            </>
          )}

          {phase === 'preview' && (
            <>
              <button onClick={() => setPhase('categorizing')}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={activeCount === 0}
                style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: activeCount === 0 ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '13px', fontWeight: '800', cursor: activeCount === 0 ? 'default' : 'pointer' }}
              >
                ✓ Confirm import ({activeCount} row{activeCount !== 1 ? 's' : ''})
              </button>
            </>
          )}

          {phase === 'sheet-select' && (
            <>
              <button onClick={() => { setPhase('idle'); setSheetNames([]); setSelectedSheets([]); currentFileRef.current = null }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                Back
              </button>
              <button
                onClick={analyzeSheets}
                disabled={selectedSheets.length === 0}
                style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: selectedSheets.length === 0 ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: selectedSheets.length === 0 ? 'default' : 'pointer' }}>
                🔍 Analyze {selectedSheets.length} sheet{selectedSheets.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {(phase === 'idle' || phase === 'parsing') && (
            <button onClick={handleClose} disabled={phase === 'parsing'}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: phase === 'parsing' ? 'default' : 'pointer', fontWeight: '600', opacity: phase === 'parsing' ? 0.5 : 1 }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* HotelPlacesModal overlay */}
      {hotelModalIdx !== null && newHotels[hotelModalIdx] && (
        <HotelPlacesModal
          hotelName={newHotels[hotelModalIdx].name}
          productionId={productionId}
          onSave={(locationId, locationName) => handleHotelSave(hotelModalIdx, locationId, locationName)}
          onSkip={() => setHotelModalIdx(null)}
        />
      )}
    </div>
  )
}
