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

import { useState, useRef } from 'react'

// ── Helpers colori righe ────────────────────────────────────

function isUnrecognized(row, mode) {
  if (mode === 'fleet') return !row.driver_name && !row.plate && !row.vehicle_type
  if (mode === 'crew')  return !row.first_name && !row.last_name
  return false
}

function hasNullFields(row, mode) {
  if (mode === 'fleet') return !row.driver_name || !row.plate || row.capacity == null
  if (mode === 'crew')  return !row.department || !row.role
  return false
}

function rowBg(row, mode) {
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

// ── Componente principale ───────────────────────────────────
export function ImportModal({ open, mode: initialMode, productionId, locations = [], onClose, onImported }) {
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

  function reset() {
    setPhase('idle'); setRows([]); setNewHotels([])
    setError(null); setResult(null); setCustomInstructions('')
    setDetectedMode(null)
  }

  function handleClose() { reset(); onClose() }

  // Modo effettivo per la preview (per HAL usa detectedMode, altrimenti selMode)
  const effectiveDisplayMode = (selMode === 'hal' && detectedMode) ? detectedMode : selMode

  // ── Parse file ─────────────────────────────────────────
  async function parseFile(file) {
    if (!productionId) { setError('productionId non disponibile'); return }
    setError(null)
    setPhase('parsing')
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

      setPhase('preview')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  // ── Confirm import ─────────────────────────────────────
  async function handleConfirm() {
    setPhase('confirming')
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
      setPhase('done')
      onImported?.(data)
    } catch (e) {
      setError(e.message)
      setPhase('preview')
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
  const insertCount   = rows.filter(r => r.action === 'insert').length
  const updateCount   = rows.filter(r => r.action === 'update').length
  const skipCount     = rows.filter(r => r.action === 'skip').length
  const inactiveCount = rows.filter(r => r.active === false).length
  const needReview    = rows.filter(r => !isUnrecognized(r, effectiveDisplayMode) && hasNullFields(r, effectiveDisplayMode)).length
  const dupCount      = rows.filter(r => r.existingId).length
  const goodRows      = rows.filter(r => !isUnrecognized(r, effectiveDisplayMode))
  const badRows       = rows.filter(r => isUnrecognized(r, effectiveDisplayMode))
  const activeCount   = rows.filter(r => r.action !== 'skip').length

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
    if (effectiveDisplayMode === 'custom') {
      return <CustomTable rows={goodRows} />
    }
    return null
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(15,35,64,0.45)', padding: '16px 12px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
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
                    { id: 'hal',    label: '🔴 HAL',                desc: 'Let me figure it out' },
                    { id: 'crew',   label: '👥 Crew list',          desc: null },
                    { id: 'fleet',  label: '🚗 Fleet list',         desc: null },
                    { id: 'custom', label: '✏️ Custom instructions…', desc: null },
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
            </div>
          )}

          {/* ─── FASE: parsing ─── */}
          {phase === 'parsing' && (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
                {selMode === 'hal' ? 'Analyzing file with AI…' : 'Extracting data…'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Claude is analyzing your file</div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1', animation: `pulse ${0.6 + i * 0.2}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            </div>
          )}

          {/* ─── FASE: preview ─── */}
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
              </div>

              {/* Sezione: nuovi hotel (solo crew / mixed) */}
              {(effectiveDisplayMode === 'crew' || effectiveDisplayMode === 'mixed') && newHotels.length > 0 && (
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
            <button onClick={handleClose}
              style={{ padding: '9px 28px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
              Close
            </button>
          )}

          {phase === 'preview' && (
            <>
              <button onClick={() => { setPhase('idle'); setRows([]); setNewHotels([]); setError(null); setDetectedMode(null) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                ← Back
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

          {(phase === 'idle' || phase === 'parsing') && (
            <button onClick={handleClose} disabled={phase === 'parsing'}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: phase === 'parsing' ? 'default' : 'pointer', fontWeight: '600', opacity: phase === 'parsing' ? 0.5 : 1 }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
