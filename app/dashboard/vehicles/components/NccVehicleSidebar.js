'use client'
import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }
const TYPE_COLOR = {
  VAN:    { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  CAR:    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  BUS:    { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  TRUCK:  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  PICKUP: { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  CARGO:  { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
}
const DEPT_COLOR = {
  GRIP:       { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  CAMERA:     { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  ELECTRIC:   { bg: '#fefce8', color: '#a16207', border: '#fef08a' },
  ART:        { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  COSTUME:    { bg: '#fce7f3', color: '#be185d', border: '#fbcfe8' },
  MAKEUP:     { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
  SOUND:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  DIRECTING:  { bg: '#0f2340', color: 'white',   border: '#0f2340' },
  PRODUCTION: { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  TRANSPORT:  { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  CATERING:   { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  SECURITY:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}
function suggestId(type, vehicles) {
  const prefix = type + '-'
  const nums = (vehicles || [])
    .map(v => v.id)
    .filter(id => id && id.toUpperCase().startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return prefix + String(max + 1).padStart(2, '0')
}

export function NccVehicleSidebar({ open, mode, initial, onClose, onSaved, productionId, crewList = [], vehicles = [], openTriggerRef, initialAgencyId = null }) {
  const EMPTY = {
    id: '', vehicle_type: 'VAN',
    license_plate: '',
    capacity: '', pax_suggested: '', pax_max: '',
    ncc_agency_id: '',
    ncc_driver_name: '', ncc_driver_phone: '',
    ncc_driver_id: '',
    sign_code: '', unit_default: '',
    available_from: '', available_to: '',
    active: true, in_transport: true,
  }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setCd] = useState(false)
  const [deleting, setDel]  = useState(false)
  const [agencies, setAgencies] = useState([])
  const [idManuallyEdited, setIdManuallyEdited] = useState(false)
  const [agencyDrivers, setAgencyDrivers] = useState([])
  const nccDriverIdRef = useRef('')

  const set = (k, v) => {
    if (k === 'ncc_driver_id') nccDriverIdRef.current = v || ''
    setForm(f => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    if (openTriggerRef) openTriggerRef.current = () => {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles) })
      setIdManuallyEdited(false)
      setError(null); setCd(false)
    }
  }, [openTriggerRef, vehicles])

  useEffect(() => {
    if (!open || !productionId) return
    setError(null); setCd(false)
    supabase.from('ncc_agencies').select('id, name').eq('production_id', productionId).order('name')
      .then(({ data }) => setAgencies(data || []))
    if (mode === 'edit' && initial) {
      setForm({
        id:               initial.id               || '',
        vehicle_type:     initial.vehicle_type      || 'VAN',
        license_plate:    initial.license_plate     || '',
        capacity:         initial.capacity          ?? '',
        pax_suggested:    initial.pax_suggested     ?? '',
        pax_max:          initial.pax_max           ?? '',
        ncc_agency_id:    initial.ncc_agency_id     || '',
        ncc_driver_name:  initial.ncc_driver_name   || '',
        ncc_driver_phone: initial.ncc_driver_phone  || '',
        ncc_driver_id:    initial.ncc_driver_id     || '',
        sign_code:        initial.sign_code         || '',
        unit_default:     initial.unit_default      || '',
        available_from:   initial.available_from    || '',
        available_to:     initial.available_to      || '',
        active:           initial.active !== false,
        in_transport:     initial.in_transport !== false,
      })
      // sync ref
      nccDriverIdRef.current = initial.ncc_driver_id || ''
      setIdManuallyEdited(false)
      if (initial.ncc_agency_id) {
        supabase.from('ncc_drivers')
          .select('id, name, phone')
          .eq('agency_id', initial.ncc_agency_id)
          .eq('production_id', productionId)
          .eq('is_active', true)
          .order('name')
          .then(({ data }) => setAgencyDrivers(data || []))
      }
    } else {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles), ncc_agency_id: initialAgencyId || '' })
      setIdManuallyEdited(false)
    }
  }, [open, mode, initial, initialAgencyId])

  useEffect(() => {
    if (!open || !form.ncc_agency_id) { setAgencyDrivers([]); return }
    supabase.from('ncc_drivers')
      .select('id, name, phone')
      .eq('agency_id', form.ncc_agency_id)
      .eq('production_id', productionId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setAgencyDrivers(data || []))
  }, [open, form.ncc_agency_id, productionId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id.trim()) { setError('Vehicle ID obbligatorio'); return }
    setSaving(true)
    const row = {
      production_id:    productionId,
      vehicle_type:     form.vehicle_type || null,
      license_plate:    form.license_plate.trim().toUpperCase() || null,
      capacity:         form.capacity      !== '' ? parseInt(form.capacity)      : null,
      pax_suggested:    form.pax_suggested !== '' ? parseInt(form.pax_suggested) : null,
      pax_max:          form.pax_max       !== '' ? parseInt(form.pax_max)       : null,
      is_ncc:           true,
      is_comodato:      false,
      ncc_agency_id:    form.ncc_agency_id || null,
      ncc_driver_name:  form.ncc_driver_name.trim()  || null,
      ncc_driver_phone: form.ncc_driver_phone.trim() || null,
      ncc_driver_id:    nccDriverIdRef.current || null,
      sign_code:        form.sign_code.trim()    || null,
      unit_default:     form.unit_default.trim() || null,
      available_from:   form.available_from || null,
      available_to:     form.available_to   || null,
      active:           form.active,
      in_transport:     form.in_transport !== false,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('vehicles').insert({ ...row, id: form.id.trim().toUpperCase() })
      err = r.error
    } else {
      const r = await supabase.from('vehicles').update(row).eq('id', initial.id).eq('production_id', productionId)
      err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { count } = await supabase.from('trips').select('id', { count: 'exact', head: true }).eq('vehicle_id', initial.id).eq('production_id', productionId)
    if (count > 0) { setDel(false); setCd(false); setError(`Cannot delete — ${count} trip${count > 1 ? 's' : ''} assigned.`); return }
    const { error } = await supabase.from('vehicles').delete().eq('id', initial.id).eq('production_id', productionId)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🏢 New NCC Vehicle' : '✏️ Edit NCC Vehicle'}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Vehicle ID */}
            <div style={fld}>
              <label style={lbl}>Vehicle ID *</label>
              {mode === 'edit' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: '#0f2340', border: '1px solid #0f2340', borderRadius: '8px' }}>
                  <span style={{ fontWeight: '800', fontSize: '15px', letterSpacing: '0.06em', color: 'white', fontFamily: 'monospace' }}>{form.id}</span>
                </div>
              ) : (
                <>
                  <input value={form.id} onChange={e => { setIdManuallyEdited(true); set('id', e.target.value.toUpperCase()) }}
                    style={{ ...inp, fontWeight: '800', fontSize: '15px', letterSpacing: '0.05em' }}
                    placeholder="VAN-01 / CAR-05" required />
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Format: VAN-01, CAR-05 — used in Trips and Fleet Monitor</div>
                </>
              )}
            </div>

            {/* Tipo veicolo */}
            <div style={fld}>
              <label style={lbl}>Vehicle Type</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['VAN', 'CAR', 'BUS', 'TRUCK', 'PICKUP', 'CARGO'].map(type => {
                  const c = TYPE_COLOR[type]; const active = form.vehicle_type === type
                  return (
                    <button key={type} type="button" onClick={() => { set('vehicle_type', type); if (mode === 'new' && !idManuallyEdited) set('id', suggestId(type, vehicles)) }}
                      style={{ flex: 1, minWidth: '60px', padding: '6px 2px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '18px' }}>{TYPE_ICON[type]}</span>
                      <span>{type}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Targa + Capacità */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>License Plate</label>
                <input value={form.license_plate} onChange={e => set('license_plate', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.1em' }} placeholder="AB123CD" />
              </div>
              <div>
                <label style={lbl}>Capacity</label>
                <input type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)} style={inp} placeholder="8" min="1" max="60" />
              </div>
            </div>

            {/* Rocket pax */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', marginBottom: '10px' }}>🚀 Rocket Capacity</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ ...lbl, color: '#1d4ed8' }}>pax_suggested</label>
                  <input type="number" value={form.pax_suggested} onChange={e => set('pax_suggested', e.target.value)} style={{ ...inp, borderColor: '#bfdbfe' }} placeholder={form.capacity || '6'} min="1" max="60" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#1d4ed8' }}>pax_max</label>
                  <input type="number" value={form.pax_max} onChange={e => set('pax_max', e.target.value)} style={{ ...inp, borderColor: '#bfdbfe' }} placeholder={form.capacity || '8'} min="1" max="60" />
                </div>
              </div>
            </div>

            {/* NCC Details */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #bae6fd', background: '#f0f9ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369a1', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏢 NCC Details</div>

              <div style={fld}>
                <label style={{ ...lbl, color: '#0369a1' }}>NCC Agency</label>
                <select value={form.ncc_agency_id} onChange={e => set('ncc_agency_id', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#bae6fd', background: 'white' }}>
                  <option value="">— Select agency —</option>
                  {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {agencies.length === 0 && (
                  <div style={{ fontSize: '10px', color: '#0369a1', marginTop: '3px' }}>
                    ℹ No agencies yet — add from NCC tab
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>NCC Driver Name</label>
                  <input value={form.ncc_driver_name} onChange={e => set('ncc_driver_name', e.target.value)} style={{ ...inp, borderColor: '#bae6fd' }} placeholder="Mario Rossi" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>NCC Driver Phone</label>
                  <input value={form.ncc_driver_phone} onChange={e => set('ncc_driver_phone', e.target.value)} style={{ ...inp, borderColor: '#bae6fd' }} placeholder="+39 333..." type="tel" />
                </div>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  🎬 Driver di oggi (Captain Go)
                </div>
                <select
                  value={form.ncc_driver_id || ''}
                  onChange={e => set('ncc_driver_id', e.target.value || null)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #bae6fd', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', cursor: 'pointer', boxSizing: 'border-box' }}
                >
                  <option value="">— Nessun driver assegnato —</option>
                  {agencyDrivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ''}</option>
                  ))}
                </select>
                {agencyDrivers.length === 0 && (
                  <div style={{ fontSize: '10px', color: '#0369a1', marginTop: '4px' }}>
                    ℹ Aggiungi prima i driver dalla sezione Drivers dell'agenzia
                  </div>
                )}
              </div>
            </div>

            {/* Sign code + Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Sign Code</label>
                <input value={form.sign_code} onChange={e => set('sign_code', e.target.value)} style={inp} placeholder="GRIP1, PROD2…" />
              </div>
              <div>
                <label style={lbl}>Unit Default</label>
                <input value={form.unit_default} onChange={e => set('unit_default', e.target.value)} style={inp} placeholder="MAIN, SECOND…" />
              </div>
            </div>

            {/* Availability */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #d1d5db', background: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px' }}>📅 Availability</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>From</label>
                  <input type="date" value={form.available_from} onChange={e => set('available_from', e.target.value)} style={{ ...inp, borderColor: '#d1d5db' }} />
                </div>
                <div>
                  <label style={lbl}>To</label>
                  <input type="date" value={form.available_to} onChange={e => set('available_to', e.target.value)} style={{ ...inp, borderColor: '#d1d5db' }} />
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.active ? '#86efac' : '#e2e8f0'}`, background: form.active ? '#f0fdf4' : '#f8fafc', cursor: 'pointer' }}
              onClick={() => set('active', !form.active)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.active ? '#16a34a' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: form.active ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: form.active ? '#15803d' : '#64748b' }}>
                {form.active ? '✅ Active — visible in Fleet Monitor' : '⏸ Inactive — hidden from Fleet Monitor'}
              </div>
            </div>

            {/* In Transport toggle */}
            <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.in_transport ? '#bfdbfe' : '#e2e8f0'}`, background: form.in_transport ? '#eff6ff' : '#f8fafc', cursor: 'pointer' }}
              onClick={() => set('in_transport', !form.in_transport)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.in_transport ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: form.in_transport ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: form.in_transport ? '#1d4ed8' : '#64748b' }}>
                {form.in_transport ? '✅ In Transport' : '🚐 SD — excluded from trips/lists/fleet'}
              </div>
            </div>

            {/* Assignments — read-only */}
            {mode === 'edit' && (initial?.preferred_dept || (Array.isArray(initial?.preferred_crew_ids) && initial.preferred_crew_ids.length > 0)) && (
              <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '8px' }}>⭐ Assignments</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {initial.preferred_dept && (() => {
                    const dc = DEPT_COLOR[initial.preferred_dept] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }
                    return (
                      <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: dc.bg, color: dc.color, border: `1px solid ${dc.border}` }}>
                        {initial.preferred_dept}
                      </span>
                    )
                  })()}
                  {Array.isArray(initial.preferred_crew_ids) && initial.preferred_crew_ids.map(cid => {
                    const cm = crewList.find(c => c.id === cid)
                    if (!cm) return null
                    return (
                      <span key={cid} style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        {cm.full_name}
                      </span>
                    )
                  })}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>Edit assignments from Fleet tab</div>
              </div>
            )}

            {/* Danger Zone */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    Delete NCC Vehicle
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this vehicle? Cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? '...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}

          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Saving...' : mode === 'new' ? '🏢 Add NCC Vehicle' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
