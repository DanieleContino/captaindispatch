'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { ImportModal } from '../../../lib/ImportModal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { getProductionId } from '../../../lib/production'

const SIDEBAR_W = 400

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }
const TYPE_COLOR = {
  VAN:    { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  CAR:    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  BUS:    { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  TRUCK:  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  PICKUP: { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  CARGO:  { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
}
const CLASS_OPTIONS = ['CLASSIC', 'LUX', 'ECONOMY', 'PREMIUM', 'MINIBUS', 'NCC']
const CLASS_COLOR = {
  LUX:     { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  PREMIUM: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  CLASSIC: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  ECONOMY: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  MINIBUS: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  NCC:     { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
}

const DEPT_OPTIONS = ['GRIP','CAMERA','ELECTRIC','ART','COSTUME','MAKEUP','SOUND','DIRECTING','PRODUCTION','TRANSPORT','CATERING','SECURITY']
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

// ─── Sidebar ──────────────────────────────────────────────────
function VehicleSidebar({ open, mode, initial, onClose, onSaved, crewList = [] }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const EMPTY = { id: '', vehicle_type: 'VAN', vehicle_class: [], license_plate: '', capacity: '', pax_suggested: '', pax_max: '', driver_name: '', sign_code: '', unit_default: '', active: true, in_transport: true, available_from: '', available_to: '', preferred_dept: '', preferred_crew_ids: [] }
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDel]        = useState(false)
  const [confirmDel, setCd]       = useState(false)
  const [error, setError]         = useState(null)
  const [crewSearch, setCrewSearch]     = useState('')

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false); setCrewSearch('')
    if (mode === 'edit' && initial) {
      setForm({ id: initial.id || '', vehicle_type: initial.vehicle_type || 'VAN', vehicle_class: Array.isArray(initial.vehicle_class) ? initial.vehicle_class : (initial.vehicle_class ? [initial.vehicle_class] : []), license_plate: initial.license_plate || '', capacity: initial.capacity ?? '', pax_suggested: initial.pax_suggested ?? '', pax_max: initial.pax_max ?? '', driver_name: initial.driver_name || '', sign_code: initial.sign_code || '', unit_default: initial.unit_default || '', active: initial.active !== false, in_transport: initial.in_transport !== false, available_from: initial.available_from || '', available_to: initial.available_to || '', preferred_dept: initial.preferred_dept || '', preferred_crew_ids: Array.isArray(initial.preferred_crew_ids) ? initial.preferred_crew_ids : [] })
    } else {
      setForm({ ...EMPTY })
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (!form.id.trim()) { setError('Vehicle ID obbligatorio'); return }
    setSaving(true)
    const row = {
      production_id:      PRODUCTION_ID,
      id:                 form.id.trim().toUpperCase(),
      vehicle_type:       form.vehicle_type || null,
      vehicle_class:      form.vehicle_class.length > 0 ? form.vehicle_class : null,
      license_plate:      form.license_plate.trim().toUpperCase() || null,
      capacity:           form.capacity      !== '' ? parseInt(form.capacity)      : null,
      pax_suggested:      form.pax_suggested !== '' ? parseInt(form.pax_suggested) : null,
      pax_max:            form.pax_max       !== '' ? parseInt(form.pax_max)       : null,
      driver_name:        form.driver_name.trim() || null,
      sign_code:          form.sign_code.trim() || null,
      unit_default:       form.unit_default.trim() || null,
      active:             form.active,
      in_transport:       form.in_transport !== false,
      available_from:     form.available_from || null,
      available_to:       form.available_to   || null,
      preferred_dept:     form.preferred_dept || null,
      preferred_crew_ids: form.preferred_crew_ids.length > 0 ? form.preferred_crew_ids : null,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('vehicles').insert(row); err = r.error
    } else {
      const { id, ...upd } = row
      const r = await supabase.from('vehicles').update(upd).eq('id', initial.id); err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { count } = await supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', initial.id)
      .eq('production_id', PRODUCTION_ID)
    if (count > 0) {
      setDel(false)
      setCd(false)
      setError(`Cannot delete — this vehicle has ${count} trip${count > 1 ? 's' : ''} assigned. Remove the trips first.`)
      return
    }
    const { error } = await supabase.from('vehicles').delete().eq('id', initial.id).eq('production_id', PRODUCTION_ID)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  const tc = TYPE_COLOR[form.vehicle_type] || TYPE_COLOR.VAN

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? `${TYPE_ICON[form.vehicle_type] || '🚐'} ${t.newVehicle}` : `${TYPE_ICON[form.vehicle_type] || '🚐'} ${t.editVehicle}`}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Vehicle ID */}
            <div style={fld}>
              <label style={lbl}>Vehicle ID</label>
              <input value={form.id} onChange={e => set('id', e.target.value.toUpperCase())}
                style={{ ...inp, fontWeight: '800', fontSize: '15px', letterSpacing: '0.05em', background: mode === 'edit' ? '#f8fafc' : 'white' }}
                placeholder="VAN-01 / BUS-20 / CAR-05" required readOnly={mode === 'edit'} />
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{t.vehicleIdHint}</div>
            </div>

            {/* Tipo veicolo */}
            <div style={fld}>
              <label style={lbl}>{t.vehicleTypeLabel}</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['VAN', 'CAR', 'BUS', 'TRUCK', 'PICKUP', 'CARGO'].map(type => {
                  const c = TYPE_COLOR[type]; const active = form.vehicle_type === type
                  return (
                    <button key={type} type="button" onClick={() => set('vehicle_type', type)}
                      style={{ flex: 1, minWidth: '60px', padding: '6px 2px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '18px' }}>{TYPE_ICON[type]}</span>
                      <span>{type}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Vehicle Class — multi-chip, selezione multipla */}
            <div style={fld}>
              <label style={lbl}>{t.vehicleClassLabel}</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => set('vehicle_class', [])}
                  style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${form.vehicle_class.length === 0 ? '#0f2340' : '#e2e8f0'}`, background: form.vehicle_class.length === 0 ? '#0f2340' : 'white', color: form.vehicle_class.length === 0 ? 'white' : '#94a3b8' }}>
                  {t.noClassLabel}
                </button>
                {CLASS_OPTIONS.map(c => {
                  const cc = CLASS_COLOR[c] || CLASS_COLOR.CLASSIC
                  const active = form.vehicle_class.includes(c)
                  const label = c === 'LUX' ? '💎 LUX' : c === 'PREMIUM' ? '⭐ PREMIUM' : c === 'ECONOMY' ? '💶 ECONOMY' : c === 'MINIBUS' ? '🚌 MINIBUS' : c === 'NCC' ? '🔑 NCC' : c
                  return (
                    <button key={c} type="button"
                      onClick={() => setForm(f => ({ ...f, vehicle_class: f.vehicle_class.includes(c) ? f.vehicle_class.filter(x => x !== c) : [...f.vehicle_class, c] }))}
                      style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? cc.border : '#e2e8f0'}`, background: active ? cc.bg : 'white', color: active ? cc.color : '#94a3b8' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Targa + Capacità */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>{t.licensePlateLabel}</label>
                <input value={form.license_plate} onChange={e => set('license_plate', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.1em' }} placeholder="AB123CD" />
              </div>
              <div>
                <label style={lbl}>{t.physicalCapacity}</label>
                <input type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)} style={inp} placeholder="8" min="1" max="60" />
              </div>
            </div>

            {/* Rocket: pax_suggested + pax_max */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', marginBottom: '10px' }}>
                {t.rocketCapacity}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ ...lbl, color: '#1d4ed8' }}>pax_suggested</label>
                  <input type="number" value={form.pax_suggested} onChange={e => set('pax_suggested', e.target.value)} style={{ ...inp, borderColor: '#bfdbfe', background: 'white' }} placeholder={form.capacity || '6'} min="1" max="60" />
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Limite default Rocket (es. 6 su un van da 8)</div>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#1d4ed8' }}>pax_max</label>
                  <input type="number" value={form.pax_max} onChange={e => set('pax_max', e.target.value)} style={{ ...inp, borderColor: '#bfdbfe', background: 'white' }} placeholder={form.capacity || '8'} min="1" max="60" />
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Massimo assoluto (suggerito, non automatico)</div>
                </div>
              </div>
            </div>

            {/* Driver */}
            <div style={fld}>
              <label style={lbl}>{t.driverLabel}</label>
              <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)} style={inp} placeholder="Mario Rossi" />
            </div>

            {/* Sign code */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>{t.signCodeLabel}</label>
                <input value={form.sign_code} onChange={e => set('sign_code', e.target.value)} style={inp} placeholder="GRIP1, PROD2…" />
              </div>
              <div>
                <label style={lbl}>{t.unitDefaultLabel}</label>
                <input value={form.unit_default} onChange={e => set('unit_default', e.target.value)} style={inp} placeholder="MAIN, SECOND…" />
              </div>
            </div>

            {/* Availability Dates */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #d1d5db', background: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px' }}>{t.availabilityDates}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>{t.availableFrom}</label>
                  <input type="date" value={form.available_from} onChange={e => set('available_from', e.target.value)}
                    style={{ ...inp, borderColor: '#d1d5db' }} />
                </div>
                <div>
                  <label style={lbl}>{t.availableTo}</label>
                  <input type="date" value={form.available_to} onChange={e => set('available_to', e.target.value)}
                    style={{ ...inp, borderColor: '#d1d5db' }} />
                </div>
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '6px' }}>{t.availabilityHint}</div>
            </div>

            {/* Active toggle */}
            <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.active ? '#86efac' : '#e2e8f0'}`, background: form.active ? '#f0fdf4' : '#f8fafc', cursor: 'pointer' }}
              onClick={() => set('active', !form.active)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.active ? '#16a34a' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: form.active ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: form.active ? '#15803d' : '#64748b' }}>
                  {form.active ? t.vehicleActive : t.vehicleInactive}
                </div>
              </div>
            </div>

            {/* In Transport toggle */}
            <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.in_transport ? '#bfdbfe' : '#e2e8f0'}`, background: form.in_transport ? '#eff6ff' : '#f8fafc', cursor: 'pointer' }}
              onClick={() => set('in_transport', !form.in_transport)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.in_transport ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: form.in_transport ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: form.in_transport ? '#1d4ed8' : '#64748b' }}>
                  {form.in_transport ? '✅ In Transport' : '🚐 SD — escluso da trips/liste/fleet'}
                </div>
              </div>
            </div>

            {/* Preferenze Assegnazione */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '10px' }}>⭐ Preferenze Assegnazione</div>

              {/* Preferred Dept */}
              <div style={{ marginBottom: '10px' }}>
                <label style={lbl}>Dept Preferito</label>
                <select value={form.preferred_dept || ''} onChange={e => set('preferred_dept', e.target.value || '')}
                  style={{ ...inp, background: form.preferred_dept ? ((DEPT_COLOR[form.preferred_dept] || {}).bg || 'white') : 'white', color: form.preferred_dept ? ((DEPT_COLOR[form.preferred_dept] || {}).color || '#0f172a') : '#94a3b8', fontWeight: form.preferred_dept ? '700' : '400' }}>
                  <option value="">— Nessun dept preferito —</option>
                  {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Preferred Crew Multi-Select */}
              <div>
                <label style={lbl}>Crew Preferiti</label>
                {/* Chips selezionati */}
                {form.preferred_crew_ids.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {form.preferred_crew_ids.map(cid => {
                      const cm = crewList.find(c => c.id === cid)
                      if (!cm) return null
                      return (
                        <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                          {cm.no_transport_needed && <span style={{ fontSize: '10px' }}>🚐</span>}
                          {cm.full_name}
                          <button type="button" onClick={() => setForm(f => ({ ...f, preferred_crew_ids: f.preferred_crew_ids.filter(x => x !== cid) }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: '0', lineHeight: 1, marginLeft: '2px' }}>✕</button>
                        </span>
                      )
                    })}
                  </div>
                )}
                {/* Ricerca */}
                <input placeholder="🔍 Cerca crew…" value={crewSearch} onChange={e => setCrewSearch(e.target.value)}
                  style={{ ...inp, marginBottom: '4px' }} />
                {/* Lista crew */}
                {(() => {
                  const filteredCrew = crewList.filter(c => !crewSearch || (c.full_name || '').toLowerCase().includes(crewSearch.toLowerCase()))
                  const sorted = [...filteredCrew].sort((a, b) => {
                    const aDept = form.preferred_dept && a.department === form.preferred_dept ? 1 : 0
                    const bDept = form.preferred_dept && b.department === form.preferred_dept ? 1 : 0
                    const aSD = a.no_transport_needed ? 1 : 0
                    const bSD = b.no_transport_needed ? 1 : 0
                    if (bDept !== aDept) return bDept - aDept
                    if (bSD !== aSD) return bSD - aSD
                    return (a.full_name || '').localeCompare(b.full_name || '')
                  })
                  const deptSectionEnd = form.preferred_dept ? sorted.findLastIndex(c => c.department === form.preferred_dept) : -1
                  return (
                    <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px', background: 'white' }}>
                      {sorted.length === 0 && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', padding: '8px' }}>Nessun risultato</div>
                      )}
                      {form.preferred_dept && sorted.some(c => c.department === form.preferred_dept) && (
                        <div style={{ padding: '3px 8px', fontSize: '9px', fontWeight: '800', color: (DEPT_COLOR[form.preferred_dept] || {}).color || '#7e22ce', background: (DEPT_COLOR[form.preferred_dept] || {}).bg || '#fdf4ff', borderBottom: `1px solid ${(DEPT_COLOR[form.preferred_dept] || {}).border || '#e9d5ff'}`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          ⭐ {form.preferred_dept}
                        </div>
                      )}
                      {sorted.map((cm, idx) => {
                        const sel = form.preferred_crew_ids.includes(cm.id)
                        const isLastDept = idx === deptSectionEnd
                        const isOtherSection = form.preferred_dept && cm.department !== form.preferred_dept && idx === deptSectionEnd + 1
                        return (
                          <div key={cm.id}>
                            {isOtherSection && sorted.some(c => c.department === form.preferred_dept) && (
                              <div style={{ padding: '3px 8px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Altri
                              </div>
                            )}
                            <div onClick={() => setForm(f => ({ ...f, preferred_crew_ids: sel ? f.preferred_crew_ids.filter(x => x !== cm.id) : [...f.preferred_crew_ids, cm.id] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', cursor: 'pointer', background: sel ? '#eff6ff' : 'transparent', borderBottom: isLastDept && deptSectionEnd >= 0 ? 'none' : '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '13px', flexShrink: 0 }}>{sel ? '✅' : '⬜'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '11px', fontWeight: sel ? '700' : '500', color: sel ? '#1d4ed8' : '#0f172a' }}>
                                  {cm.no_transport_needed && <span style={{ fontSize: '10px', color: '#64748b', marginRight: '3px' }}>🚐</span>}
                                  {cm.full_name}
                                </span>
                                {cm.department && <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '5px' }}>{cm.department}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Delete */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>{t.dangerZone}</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    {t.deleteVehicle}
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>{t.deleteVehicleConfirm}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>{t.cancel}</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? t.deleting : t.confirm}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : mode === 'new' ? t.add : t.saveChanges}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Helper: format ISO date → "01 Apr" ───────────────────────
function fmtAvailDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ─── Row veicolo ──────────────────────────────────────────────
function VehicleRow({ v, onEdit, onDelete, selected, onToggleSelect, crewList = [] }) {
  const t = useT()
  const tc = TYPE_COLOR[v.vehicle_type] || TYPE_COLOR.VAN
  const icon = TYPE_ICON[v.vehicle_type] || '🚐'
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Availability badge
  const hasAvail = v.available_from || v.available_to
  const availLabel = hasAvail
    ? `${v.available_from ? fmtAvailDate(v.available_from) : '∞'} → ${v.available_to ? fmtAvailDate(v.available_to) : '∞'}`
    : null

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await onDelete(v.id)
    setDeleting(false)
    setConfirmDel(false)
  }

  return (
    <div style={{ background: selected ? '#eff6ff' : 'white', border: `1px solid ${selected ? '#bfdbfe' : '#e2e8f0'}`, borderLeft: `4px solid ${selected ? '#3b82f6' : v.active ? tc.border : '#e2e8f0'}`, borderRadius: '9px', padding: '12px 16px', display: 'grid', gridTemplateColumns: '20px 40px 1fr auto', alignItems: 'center', gap: '12px', opacity: v.active ? 1 : 0.55 }}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(v.id)}
        onClick={e => e.stopPropagation()}
        style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
      />
      <div style={{ fontSize: '28px', textAlign: 'center' }}>{icon}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{v.vehicle_type}</span>
          {Array.isArray(v.vehicle_class) && v.vehicle_class.length > 0
            ? v.vehicle_class.map(c => { const cc = CLASS_COLOR[c] || CLASS_COLOR.CLASSIC; return <span key={c} style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: cc.bg, color: cc.color, border: `1px solid ${cc.border}` }}>{c === 'LUX' ? '💎 LUX' : c === 'PREMIUM' ? '⭐ PREMIUM' : c === 'NCC' ? '🔑 NCC' : c === 'MINIBUS' ? '🚌 MINIBUS' : c}</span> })
            : null}
          {v.license_plate && <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: '700', color: '#374151', background: '#fafaf9', padding: '1px 8px', borderRadius: '5px', border: '1px solid #d4d4d4', letterSpacing: '0.08em' }}>🚘 {v.license_plate}</span>}
          {v.capacity && <span style={{ fontSize: '12px', color: '#64748b' }}>× {v.capacity} pax</span>}
          {(v.pax_suggested || v.pax_max) && (
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 7px', borderRadius: '5px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              🚀 {v.pax_suggested ?? '?'}/{v.pax_max ?? '?'}
            </span>
          )}
          {availLabel && (
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '5px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontVariantNumeric: 'tabular-nums' }}>
              📅 {availLabel}
            </span>
          )}
          {!v.active && <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', padding: '1px 8px', borderRadius: '999px', border: '1px solid #e2e8f0' }}>INATTIVO</span>}
          {v.in_transport === false && <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '1px 8px', borderRadius: '999px', border: '1px solid #cbd5e1' }}>🚐 SD</span>}
          {v.preferred_dept && (
            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: (DEPT_COLOR[v.preferred_dept] || {}).bg || '#f8fafc', color: (DEPT_COLOR[v.preferred_dept] || {}).color || '#475569', border: `1px solid ${(DEPT_COLOR[v.preferred_dept] || {}).border || '#e2e8f0'}` }}>
              ⭐ {v.preferred_dept}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
          {v.driver_name && <span>👤 {v.driver_name}</span>}
          {v.sign_code   && <span>🏷 {v.sign_code}</span>}
          {v.unit_default && <span>📋 {v.unit_default}</span>}
          {Array.isArray(v.preferred_crew_ids) && v.preferred_crew_ids.length > 0 && crewList.length > 0 && (
            <span style={{ color: '#1d4ed8' }}>
              👥 {v.preferred_crew_ids.slice(0, 3).map(id => crewList.find(c => c.id === id)?.full_name).filter(Boolean).join(', ')}
              {v.preferred_crew_ids.length > 3 ? ` +${v.preferred_crew_ids.length - 3}` : ''}
            </span>
          )}
        </div>
      </div>
      {/* Azioni */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button onClick={() => onEdit(v)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>✎ Edit</button>
        {!confirmDel ? (
          <button
            onClick={handleDelete}
            style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#dc2626', whiteSpace: 'nowrap', lineHeight: 1 }}
            title={t.deleteVehicle}
          >🗑</button>
        ) : (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button onClick={() => setConfirmDel(false)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>✕</button>
            <button onClick={handleDelete} disabled={deleting} style={{ background: '#dc2626', border: 'none', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '800', color: 'white', whiteSpace: 'nowrap' }}>
              {deleting ? '…' : '⚠ ' + t.confirm}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pagina ───────────────────────────────────────────────────
export default function VehiclesPage() {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()
  const [user,    setUser]   = useState(null)
  const [vhcs,    setVhcs]   = useState([])
  const [loading, setLoad]   = useState(true)
  const [search,  setSearch] = useState('')
  const [filterActive, setFA] = useState('ALL')  // ALL | ACTIVE | INACTIVE
  const [filterType,   setFT] = useState('ALL')  // ALL | VAN | CAR | BUS
  const [sidebarOpen, setSO] = useState(false)
  const [mode,    setMode]   = useState('new')
  const [editItem, setEdit]  = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])   // bulk selection
  const [bulkDeleting, setBulkDel] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [crewList, setCrewList] = useState([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) await supabase.from('user_roles').upsert({ user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' }, { onConflict: 'user_id,production_id', ignoreDuplicates: true })
      setUser(user)
    })
  }, [])

  const load = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoad(true)
    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase.from('vehicles').select('*').eq('production_id', PRODUCTION_ID).order('vehicle_type').order('id'),
      supabase.from('crew').select('id, full_name, department, no_transport_needed').eq('production_id', PRODUCTION_ID).order('full_name'),
    ])
    setVhcs(vData || [])
    setCrewList(cData || [])
    setLoad(false)
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  function openNew()   { setMode('new');  setEdit(null); setSO(true) }
  function openEdit(v) { setMode('edit'); setEdit(v);    setSO(true) }
  function onSaved()   { setSO(false); load() }

  // ─── Selezione ────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function selectAll() {
    const allIds = filtered.map(v => v.id)
    const allSelected = allIds.every(id => selectedIds.includes(id))
    setSelectedIds(allSelected ? [] : allIds)
  }
  function clearSelection() { setSelectedIds([]); setBulkConfirm(false) }

  // ─── Delete singolo (da riga) ─────────────────────────────
  async function handleDeleteSingle(id) {
    const { count } = await supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', id)
      .eq('production_id', PRODUCTION_ID)

    if (count > 0) {
      alert(`Cannot delete — this vehicle has ${count} trip${count > 1 ? 's' : ''} assigned. Remove the trips first.`)
      return
    }

    const { error } = await supabase.from('vehicles').delete().eq('id', id).eq('production_id', PRODUCTION_ID)
    if (!error) {
      setSelectedIds(prev => prev.filter(x => x !== id))
      load()
    }
  }

  // ─── Bulk delete ─────────────────────────────────────────
  async function handleBulkDelete() {
    if (!bulkConfirm) { setBulkConfirm(true); return }
    setBulkDel(true)
    // Controlla se uno dei veicoli selezionati ha trip associati
    const tripChecks = await Promise.all(
      selectedIds.map(async id => {
        const { count } = await supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('vehicle_id', id)
          .eq('production_id', PRODUCTION_ID)
        return { id, count: count || 0 }
      })
    )
    const withTrips = tripChecks.filter(x => x.count > 0)
    if (withTrips.length > 0) {
      setBulkDel(false)
      setBulkConfirm(false)
      alert(`Cannot delete — ${withTrips.length} vehicle${withTrips.length > 1 ? 's have' : ' has'} trips assigned:\n${withTrips.map(x => `• ${x.id}: ${x.count} trip${x.count > 1 ? 's' : ''}`).join('\n')}\nRemove the trips first.`)
      return
    }
    const { error } = await supabase.from('vehicles').delete().in('id', selectedIds).eq('production_id', PRODUCTION_ID)
    setBulkDel(false)
    if (!error) { setSelectedIds([]); setBulkConfirm(false); load() }
  }

  // Reset selezione quando cambiano i filtri
  const filtered = vhcs.filter(v => {
    if (filterActive === 'ACTIVE'   && !v.active) return false
    if (filterActive === 'INACTIVE' &&  v.active) return false
    if (filterType !== 'ALL' && v.vehicle_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(v.id || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
    active: vhcs.filter(v => v.active).length,
    van:    vhcs.filter(v => v.vehicle_type === 'VAN').length,
    car:    vhcs.filter(v => v.vehicle_type === 'CAR').length,
    bus:    vhcs.filter(v => v.vehicle_type === 'BUS').length,
    truck:  vhcs.filter(v => v.vehicle_type === 'TRUCK').length,
    pickup: vhcs.filter(v => v.vehicle_type === 'PICKUP').length,
    cargo:  vhcs.filter(v => v.vehicle_type === 'CARGO').length,
  }

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/vehicles" />

      {/* Toolbar */}
      <PageHeader
        left={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🚐</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Vehicles</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{vhcs.length} totale · {counts.active} attivi</span>
          <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
            {[['VAN', '🚐'], ['CAR', '🚗'], ['BUS', '🚌'], ['TRUCK', '🚛'], ['PICKUP', '🛻'], ['CARGO', '🚚']].map(([tp, ic]) => counts[tp.toLowerCase()] > 0 && (
              <span key={tp} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', ...(TYPE_COLOR[tp]), border: `1px solid ${TYPE_COLOR[tp].border}` }}>
                {ic} {counts[tp.toLowerCase()]} {tp}
              </span>
            ))}
          </div>
        </div>}
        right={
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="text" placeholder="Cerca ID, driver…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '160px' }} />
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'ACTIVE', 'INACTIVE'].map(s => (
              <button key={s} onClick={() => setFA(s)}
                style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterActive === s ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'VAN', 'CAR', 'BUS', 'TRUCK', 'PICKUP', 'CARGO'].map(s => {
              const active = filterType === s; const c = s !== 'ALL' ? TYPE_COLOR[s] : null
              return (
                <button key={s} onClick={() => setFT(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s !== 'ALL' && (TYPE_ICON[s] + ' ')}{s}
                </button>
              )
            })}
          </div>
          <button onClick={load} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>↻</button>
          <button onClick={() => setImportOpen(true)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: '#374151' }}>
            {t.importFromFile}
          </button>
          <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
            {t.addVehicleBtn}
          </button>
        </div>}
      />

      {/* Body */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', transition: 'margin-right 0.25s', marginRight: sidebarOpen ? `${SIDEBAR_W}px` : 'auto' }}>
        {!PRODUCTION_ID && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>⚠ NEXT_PUBLIC_PRODUCTION_ID non impostato</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚐</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>{vhcs.length === 0 ? t.noVehicles : t.noResults}</div>
            {vhcs.length === 0 && <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '12px' }}>{t.addVehicleBtnAlt}</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Barra bulk actions */}
            {selectedIds.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '9px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>
                  ☑ {selectedIds.length} {t.selectedCount}
                </span>
                <div style={{ flex: 1 }} />
                {!bulkConfirm ? (
                  <button onClick={handleBulkDelete}
                    style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
                    {t.deleteSelected}
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>
                      {t.deleteSelectedConfirm.replace('{n}', selectedIds.length)}
                    </span>
                    <button onClick={() => setBulkConfirm(false)}
                      style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: '#64748b' }}>
                      {t.cancel}
                    </button>
                    <button onClick={handleBulkDelete} disabled={bulkDeleting}
                      style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
                      {bulkDeleting ? t.deleting : t.confirm}
                    </button>
                  </>
                )}
                <button onClick={clearSelection}
                  style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: '#64748b' }}>
                  {t.cancelSelection}
                </button>
              </div>
            )}

            {/* Header riga con Select All */}
            <div style={{ display: 'grid', gridTemplateColumns: '20px 40px 1fr auto', alignItems: 'center', gap: '12px', padding: '4px 16px' }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(v => selectedIds.includes(v.id))}
                ref={el => { if (el) el.indeterminate = selectedIds.length > 0 && !filtered.every(v => selectedIds.includes(v.id)) }}
                onChange={selectAll}
                style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
                title={t.selectAll}
              />
              <div />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.selectAll}</span>
              <div />
            </div>

            {filtered.map(v => (
              <VehicleRow
                key={v.id}
                v={v}
                onEdit={openEdit}
                onDelete={handleDeleteSingle}
                selected={selectedIds.includes(v.id)}
                onToggleSelect={toggleSelect}
                crewList={crewList}
              />
            ))}
          </div>
        )}
      </div>

      <VehicleSidebar open={sidebarOpen} mode={mode} initial={editItem} onClose={() => setSO(false)} onSaved={onSaved} crewList={crewList} />

      <ImportModal
        open={importOpen}
        mode="fleet"
        productionId={PRODUCTION_ID}
        locations={[]}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); load() }}
      />
    </div>
  )
}
