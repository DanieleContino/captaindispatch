'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useT } from '../../../lib/i18n'
import { ImportModal } from '../../../lib/ImportModal'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'

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

// ─── Helper: suggerisce il prossimo ID per un tipo veicolo ────
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

// ─── Sidebar ──────────────────────────────────────────────────
function VehicleSidebar({ open, mode, initial, onClose, onSaved, crewList = [], deptOptions = [], vehicles = [] }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const EMPTY = { id: '', vehicle_type: 'VAN', vehicle_class: [], license_plate: '', capacity: '', pax_suggested: '', pax_max: '', driver_name: '', driver_crew_id: '', sign_code: '', unit_default: '', active: true, in_transport: true, available_from: '', available_to: '', preferred_dept: '', preferred_crew_ids: [] }
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDel]        = useState(false)
  const [confirmDel, setCd]       = useState(false)
  const [error, setError]         = useState(null)
  const [crewSearch, setCrewSearch]     = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [showDriverSugg, setShowDriverSugg] = useState(false)
  const [idManuallyEdited, setIdManuallyEdited] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false); setCrewSearch(''); setDriverSearch(''); setShowDriverSugg(false)
    if (mode === 'edit' && initial) {
      setForm({ id: initial.id || '', vehicle_type: initial.vehicle_type || 'VAN', vehicle_class: Array.isArray(initial.vehicle_class) ? initial.vehicle_class : (initial.vehicle_class ? [initial.vehicle_class] : []), license_plate: initial.license_plate || '', capacity: initial.capacity ?? '', pax_suggested: initial.pax_suggested ?? '', pax_max: initial.pax_max ?? '', driver_name: initial.driver_name || '', driver_crew_id: initial.driver_crew_id || '', sign_code: initial.sign_code || '', unit_default: initial.unit_default || '', active: initial.active !== false, in_transport: initial.in_transport !== false, available_from: initial.available_from || '', available_to: initial.available_to || '', preferred_dept: initial.preferred_dept || '', preferred_crew_ids: Array.isArray(initial.preferred_crew_ids) ? initial.preferred_crew_ids : [] })
      setIdManuallyEdited(false)
    } else {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles) })
      setIdManuallyEdited(false)
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
      driver_crew_id:     form.driver_crew_id || null,
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
    // Se un crew è stato assegnato come driver, lo marchiamo automaticamente come NTN
    if (form.driver_crew_id) {
      await supabase.from('crew').update({ no_transport_needed: true }).eq('id', form.driver_crew_id).eq('production_id', PRODUCTION_ID)
    }
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
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

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
              <input value={form.id} onChange={e => { setIdManuallyEdited(true); set('id', e.target.value.toUpperCase()) }}
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
                    <button key={type} type="button" onClick={() => { set('vehicle_type', type); if (mode === 'new' && !idManuallyEdited) set('id', suggestId(type, vehicles)) }}
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

            {/* Driver — autocomplete crew o testo libero */}
            <div style={fld}>
              <label style={lbl}>{t.driverLabel}</label>
              {form.driver_crew_id ? (
                /* Crew collegato — chip verde */
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', border: '1px solid #86efac', borderRadius: '8px', background: '#f0fdf4' }}>
                  <span style={{ fontSize: '14px' }}>🔗</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '700', color: '#15803d' }}>{form.driver_name}</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '999px', padding: '1px 7px' }}>🚐 NTN</span>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, driver_crew_id: '', driver_name: '' }))}
                    title="Scollega crew"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                /* Testo libero + suggerimenti crew */
                <div style={{ position: 'relative' }}>
                  <input
                    value={form.driver_name}
                    onChange={e => {
                      set('driver_name', e.target.value)
                      setDriverSearch(e.target.value)
                      setShowDriverSugg(e.target.value.length > 0)
                    }}
                    onFocus={() => { if (form.driver_name && !form.driver_crew_id) setShowDriverSugg(true) }}
                    onBlur={() => setTimeout(() => setShowDriverSugg(false), 160)}
                    style={inp}
                    placeholder="Mario Rossi — o cerca crew…"
                    autoComplete="off"
                  />
                  {showDriverSugg && (() => {
                    const q = (driverSearch || form.driver_name || '').toLowerCase()
                    const matches = crewList.filter(c => q && (c.full_name || '').toLowerCase().includes(q)).slice(0, 6)
                    if (matches.length === 0) return null
                    return (
                      <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, overflow: 'hidden' }}>
                        <div style={{ padding: '4px 8px', fontSize: '9px', fontWeight: '800', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          🔗 Collega crew come driver
                        </div>
                        {matches.map(cm => (
                          <div key={cm.id}
                            onMouseDown={() => {
                              setForm(f => ({ ...f, driver_name: cm.full_name, driver_crew_id: cm.id }))
                              setShowDriverSugg(false)
                            }}
                            style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontSize: '14px', flexShrink: 0 }}>🔗</span>
                            <span style={{ flex: 1, fontWeight: '600', color: '#0f172a' }}>{cm.full_name}</span>
                            {cm.department && <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{cm.department}</span>}
                            {cm.no_transport_needed && <span style={{ fontSize: '10px', color: '#6b7280', background: '#f1f5f9', padding: '1px 5px', borderRadius: '999px', border: '1px solid #e2e8f0', flexShrink: 0 }}>NTN</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                {form.driver_crew_id ? '✅ Crew collegato — verrà marcato come NTN al salvataggio' : 'Digita per cercare un membro crew da collegare come driver'}
              </div>
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
                  {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  {form.preferred_dept && !deptOptions.includes(form.preferred_dept) && (
                    <option value={form.preferred_dept}>{form.preferred_dept}</option>
                  )}
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
  const isMobile = useIsMobile()
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
    <div style={{ background: selected ? '#eff6ff' : 'white', border: `1px solid ${selected ? '#bfdbfe' : '#e2e8f0'}`, borderLeft: `4px solid ${selected ? '#3b82f6' : v.active ? tc.border : '#e2e8f0'}`, borderRadius: '9px', padding: '12px 16px', display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '20px 40px 1fr auto', alignItems: isMobile ? 'stretch' : 'center', gap: '8px', opacity: v.active ? 1 : 0.55 }}>
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
          {v.driver_name && (
            <span style={v.driver_crew_id ? { color: '#15803d', fontWeight: '600' } : {}}>
              {v.driver_crew_id ? '🔗' : '👤'} {v.driver_name}
              {v.driver_crew_id && <span style={{ fontSize: '10px', color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '999px', padding: '0 5px', marginLeft: '4px', fontWeight: '700' }}>NTN</span>}
            </span>
          )}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', ...(isMobile ? { marginTop: '4px' } : {}) }}>
        <button onClick={() => onEdit(v)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: isMobile ? '8px 16px' : '5px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap', flex: isMobile ? 1 : undefined }}>✎ Edit</button>
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

// ─── SupplierLocationsAccordion ──────────────────────────────
function SupplierLocationsAccordion({ supplierId, productionId }) {
  const [open, setOpen]       = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [locations, setLocs]  = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', phone: '', email: '', opening_hours: '' })
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelId, setConfirmDelId] = useState(null)

  const EMPTY = { name: '', address: '', phone: '', email: '', opening_hours: '' }
  const inp = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '700', color: '#2563eb', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('rental_supplier_locations')
      .select('id, name, address, phone, email, opening_hours')
      .eq('supplier_id', supplierId)
      .eq('production_id', productionId)
      .order('created_at', { ascending: true })
    setLocs(data || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function handleAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('rental_supplier_locations')
      .insert({
        production_id: productionId,
        supplier_id:   supplierId,
        name:          addForm.name.trim(),
        address:       addForm.address.trim() || null,
        phone:         addForm.phone.trim()   || null,
        email:         addForm.email.trim()   || null,
        opening_hours: addForm.opening_hours.trim() || null,
      })
      .select('id, name, address, phone, email, opening_hours')
      .single()
    setSaving(false)
    if (error) return
    setLocs(prev => [...prev, data])
    setAddOpen(false)
    setAddForm(EMPTY)
  }

  async function handleEditSave(id) {
    setSaving(true)
    const { error } = await supabase
      .from('rental_supplier_locations')
      .update({
        name:          editForm.name.trim(),
        address:       editForm.address.trim() || null,
        phone:         editForm.phone.trim()   || null,
        email:         editForm.email.trim()   || null,
        opening_hours: editForm.opening_hours.trim() || null,
      })
      .eq('id', id)
    setSaving(false)
    if (error) return
    setLocs(prev => prev.map(l => l.id === id ? { ...l, ...editForm } : l))
    setEditId(null)
  }

  async function handleDelete(id) {
    if (confirmDelId !== id) { setConfirmDelId(id); return }
    setSaving(true)
    await supabase.from('rental_supplier_locations').delete().eq('id', id)
    setSaving(false)
    setLocs(prev => prev.filter(l => l.id !== id))
    setConfirmDelId(null)
  }

  function LocationForm({ form, setF, onSave, onCancel, saveLabel }) {
    return (
      <div style={{ background: 'white', border: '1px dashed #bfdbfe', borderRadius: '7px', padding: '8px 10px', marginBottom: '6px' }}>
        <div style={{ marginBottom: '6px' }}>
          <label style={lbl}>Location Name *</label>
          <input value={form.name} onChange={e => setF(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="Bari Airport, City Centre..." autoFocus />
        </div>
        <div style={{ marginBottom: '6px' }}>
          <label style={lbl}>Address</label>
          <input value={form.address} onChange={e => setF(f => ({ ...f, address: e.target.value }))} style={inp} placeholder="Via Roma 1..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
          <div>
            <label style={lbl}>Phone</label>
            <input value={form.phone} onChange={e => setF(f => ({ ...f, phone: e.target.value }))} style={inp} placeholder="+39 080..." type="tel" />
          </div>
          <div>
            <label style={lbl}>Opening Hours</label>
            <input value={form.opening_hours} onChange={e => setF(f => ({ ...f, opening_hours: e.target.value }))} style={inp} placeholder="08:00–20:00" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: '4px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving || !form.name.trim()}
            style={{ flex: 2, padding: '4px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: open ? '8px 8px 0 0' : '8px', border: '1px solid #e2e8f0', background: open ? '#eff6ff' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: open ? '#1d4ed8' : '#374151' }}>
          📍 Locations
          {locations.length > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', padding: '1px 6px', borderRadius: '999px', border: '1px solid #bfdbfe' }}>
              {locations.length}
            </span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#eff6ff', padding: '10px 12px 8px' }}>
          {loading ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>Loading…</div>
          ) : (
            <>
              {locations.length === 0 && !addOpen && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontStyle: 'italic' }}>No locations recorded</div>
              )}

              {locations.map(l => {
                if (editId === l.id) {
                  return (
                    <div key={l.id}>
                      <LocationForm
                        form={editForm}
                        setF={setEditForm}
                        onSave={() => handleEditSave(l.id)}
                        onCancel={() => setEditId(null)}
                        saveLabel="✓ Save Location"
                      />
                    </div>
                  )
                }
                return (
                  <div key={l.id} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '7px', padding: '7px 10px', marginBottom: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>📍 {l.name}</div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#64748b', fontSize: '11px' }}>
                        {l.address       && <span>🏠 {l.address}</span>}
                        {l.phone         && <span>📞 {l.phone}</span>}
                        {l.opening_hours && <span>🕐 {l.opening_hours}</span>}
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => { setEditId(l.id); setEditForm({ name: l.name, address: l.address || '', phone: l.phone || '', email: l.email || '', opening_hours: l.opening_hours || '' }) }}
                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#1d4ed8', flexShrink: 0 }}>
                      ✎
                    </button>
                    {confirmDelId === l.id ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button type="button" onClick={() => setConfirmDelId(null)}
                          style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 6px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                        <button type="button" onClick={() => handleDelete(l.id)} disabled={saving}
                          style={{ background: '#dc2626', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'white', fontWeight: '700' }}>⚠ Del</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelId(l.id)}
                        style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0 }}>🗑</button>
                    )}
                  </div>
                )
              })}

              {addOpen ? (
                <LocationForm
                  form={addForm}
                  setF={setAddForm}
                  onSave={handleAdd}
                  onCancel={() => { setAddOpen(false); setAddForm(EMPTY) }}
                  saveLabel="+ Add Location"
                />
              ) : (
                <button type="button" onClick={() => setAddOpen(true)}
                  style={{ width: '100%', padding: '6px', borderRadius: '7px', border: '1px dashed #bfdbfe', background: 'transparent', color: '#1d4ed8', fontSize: '11px', fontWeight: '700', cursor: 'pointer', marginTop: locations.length > 0 ? '4px' : '0' }}>
                  + Add Location
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SupplierVouchersAccordion ────────────────────────────────
function SupplierVouchersAccordion({ supplierId, productionId }) {
  const [open, setOpen]       = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ voucher_no: '', batch_code: '', amount: '', currency: 'EUR', notes: '' })
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelId, setConfirmDelId] = useState(null)

  const EMPTY = { voucher_no: '', batch_code: '', amount: '', currency: 'EUR', notes: '' }
  const inp = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '700', color: '#15803d', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('rental_vouchers')
      .select('id, voucher_no, batch_code, amount, amount_used, currency, used, vehicle_id, notes')
      .eq('supplier_id', supplierId)
      .eq('production_id', productionId)
      .order('created_at', { ascending: true })
    setVouchers(data || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function handleAdd() {
    if (!addForm.voucher_no.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('rental_vouchers')
      .insert({
        production_id: productionId,
        supplier_id:   supplierId,
        voucher_no:    addForm.voucher_no.trim(),
        batch_code:    addForm.batch_code.trim() || null,
        amount:        addForm.amount !== '' ? parseFloat(addForm.amount) : null,
        currency:      addForm.currency || 'EUR',
        notes:         addForm.notes.trim() || null,
        used:          false,
      })
      .select('id, voucher_no, batch_code, amount, amount_used, currency, used, vehicle_id, notes')
      .single()
    setSaving(false)
    if (error) return
    setVouchers(prev => [...prev, data])
    setAddOpen(false)
    setAddForm(EMPTY)
  }

  async function handleEditSave(id) {
    setSaving(true)
    const { error } = await supabase
      .from('rental_vouchers')
      .update({
        voucher_no:  editForm.voucher_no.trim(),
        batch_code:  editForm.batch_code.trim() || null,
        amount:      editForm.amount !== '' ? parseFloat(editForm.amount) : null,
        currency:    editForm.currency || 'EUR',
        notes:       editForm.notes.trim() || null,
      })
      .eq('id', id)
    setSaving(false)
    if (error) return
    setVouchers(prev => prev.map(v => v.id === id ? { ...v, ...editForm, amount: editForm.amount !== '' ? parseFloat(editForm.amount) : null } : v))
    setEditId(null)
  }

  async function handleDelete(id) {
    if (confirmDelId !== id) { setConfirmDelId(id); return }
    setSaving(true)
    await supabase.from('rental_vouchers').delete().eq('id', id)
    setSaving(false)
    setVouchers(prev => prev.filter(v => v.id !== id))
    setConfirmDelId(null)
  }

  const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'NOK', 'SEK', 'DKK']

  function VoucherForm({ form, setF, onSave, onCancel, saveLabel }) {
    return (
      <div style={{ background: 'white', border: '1px dashed #86efac', borderRadius: '7px', padding: '8px 10px', marginBottom: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
          <div>
            <label style={lbl}>Voucher No. *</label>
            <input value={form.voucher_no} onChange={e => setF(f => ({ ...f, voucher_no: e.target.value }))} style={inp} placeholder="HRZ-2026-001" autoFocus />
          </div>
          <div>
            <label style={lbl}>Batch Code</label>
            <input value={form.batch_code} onChange={e => setF(f => ({ ...f, batch_code: e.target.value }))} style={inp} placeholder="MS4, SW, DIG..." />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px', marginBottom: '6px' }}>
          <div>
            <label style={lbl}>Amount</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setF(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0.00" />
          </div>
          <div>
            <label style={lbl}>Currency</label>
            <select value={form.currency} onChange={e => setF(f => ({ ...f, currency: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <label style={lbl}>Notes</label>
          <input value={form.notes} onChange={e => setF(f => ({ ...f, notes: e.target.value }))} style={inp} placeholder="Additional notes..." />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: '4px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving || !form.voucher_no.trim()}
            style={{ flex: 2, padding: '4px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: open ? '8px 8px 0 0' : '8px', border: '1px solid #e2e8f0', background: open ? '#f0fdf4' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: open ? '#15803d' : '#374151' }}>
          🎟 Vouchers
          {vouchers.length > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', padding: '1px 6px', borderRadius: '999px', border: '1px solid #86efac' }}>
              {vouchers.length}
            </span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#f0fdf4', padding: '10px 12px 8px' }}>
          {loading ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>Loading…</div>
          ) : (
            <>
              {vouchers.length === 0 && !addOpen && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontStyle: 'italic' }}>No vouchers recorded</div>
              )}

              {vouchers.map(v => {
                if (editId === v.id) {
                  return (
                    <div key={v.id}>
                      <VoucherForm
                        form={editForm}
                        setF={setEditForm}
                        onSave={() => handleEditSave(v.id)}
                        onCancel={() => setEditId(null)}
                        saveLabel="✓ Save Voucher"
                      />
                    </div>
                  )
                }
                return (
                  <div key={v.id} style={{ background: 'white', border: '1px solid #86efac', borderRadius: '7px', padding: '7px 10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#0f172a' }}>{v.voucher_no}</span>
                        {v.batch_code && <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>{v.batch_code}</span>}
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: v.used ? '#faeeda' : '#f0fdf4', color: v.used ? '#633806' : '#15803d', border: `1px solid ${v.used ? '#fac775' : '#86efac'}` }}>
                          {v.used ? (v.vehicle_id ? `Used — ${v.vehicle_id}` : 'Used') : 'Free'}
                        </span>
                      </div>
                      {v.amount && (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {v.currency} {v.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                          {v.amount_used > 0 && <span style={{ marginLeft: '6px', color: '#dc2626' }}>Used: {v.currency} {v.amount_used.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>}
                        </div>
                      )}
                    </div>
                    <button type="button"
                      onClick={() => { setEditId(v.id); setEditForm({ voucher_no: v.voucher_no, batch_code: v.batch_code || '', amount: v.amount ?? '', currency: v.currency || 'EUR', notes: v.notes || '' }) }}
                      style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#15803d', flexShrink: 0 }}>
                      ✎
                    </button>
                    {confirmDelId === v.id ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button type="button" onClick={() => setConfirmDelId(null)}
                          style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 6px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                        <button type="button" onClick={() => handleDelete(v.id)} disabled={saving}
                          style={{ background: '#dc2626', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'white', fontWeight: '700' }}>⚠ Del</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelId(v.id)}
                        style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0 }}>🗑</button>
                    )}
                  </div>
                )
              })}

              {addOpen ? (
                <VoucherForm
                  form={addForm}
                  setF={setAddForm}
                  onSave={handleAdd}
                  onCancel={() => { setAddOpen(false); setAddForm(EMPTY) }}
                  saveLabel="+ Add Voucher"
                />
              ) : (
                <button type="button" onClick={() => setAddOpen(true)}
                  style={{ width: '100%', padding: '6px', borderRadius: '7px', border: '1px dashed #86efac', background: 'transparent', color: '#15803d', fontSize: '11px', fontWeight: '700', cursor: 'pointer', marginTop: vouchers.length > 0 ? '4px' : '0' }}>
                  + Add Voucher
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RentalSupplierSidebar ───────────────────────────────────
function RentalSupplierSidebar({ open, mode, initial, onClose, onSaved, productionId }) {
  const EMPTY = { name: '', contact_name: '', phone: '', email: '', address: '', website: '', account_no: '', opening_hours: '', notes: '' }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null); setConfirmDel(false)
    if (mode === 'edit' && initial) {
      setForm({
        name:          initial.name          || '',
        contact_name:  initial.contact_name  || '',
        phone:         initial.phone         || '',
        email:         initial.email         || '',
        address:       initial.address       || '',
        website:       initial.website       || '',
        account_no:    initial.account_no    || '',
        opening_hours: initial.opening_hours || '',
        notes:         initial.notes         || '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const row = {
      production_id: productionId,
      name:          form.name.trim(),
      contact_name:  form.contact_name.trim()  || null,
      phone:         form.phone.trim()         || null,
      email:         form.email.trim()         || null,
      address:       form.address.trim()       || null,
      website:       form.website.trim()       || null,
      account_no:    form.account_no.trim()    || null,
      opening_hours: form.opening_hours.trim() || null,
      notes:         form.notes.trim()         || null,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('rental_suppliers').insert(row)
      err = r.error
    } else {
      const r = await supabase.from('rental_suppliers').update(row).eq('id', initial.id)
      err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    const { error } = await supabase.from('rental_suppliers').delete().eq('id', initial.id)
    setDeleting(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🏢 New Supplier' : '✏️ Edit Supplier'}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            <div style={fld}>
              <label style={lbl}>Supplier Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Hertz, Avis, Europcar..." required />
            </div>

            <div style={fld}>
              <label style={lbl}>Account No.</label>
              <input value={form.account_no} onChange={e => set('account_no', e.target.value)} style={inp} placeholder="Corporate account number" />
            </div>

            <div style={{ marginBottom: '12px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📞 Contact</div>
              <div style={fld}>
                <label style={lbl}>Contact Name</label>
                <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} style={inp} placeholder="John Smith" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp} placeholder="+39 02..." type="tel" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} style={inp} placeholder="info@hertz.it" type="email" />
                </div>
              </div>
              <div style={fld}>
                <label style={lbl}>Address</label>
                <input value={form.address} onChange={e => set('address', e.target.value)} style={inp} placeholder="Via Roma 1, Milano" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={lbl}>Website</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)} style={inp} placeholder="www.hertz.it" />
                </div>
                <div>
                  <label style={lbl}>Opening Hours</label>
                  <input value={form.opening_hours} onChange={e => set('opening_hours', e.target.value)} style={inp} placeholder="08:00 – 20:00" />
                </div>
              </div>
            </div>

            <div style={fld}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: '80px', resize: 'vertical' }} placeholder="Additional notes..." />
            </div>

            {mode === 'new' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', marginBottom: '3px' }}>
                    Save the supplier first to add locations and vouchers
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                    Once saved, you can add pickup/dropoff locations and manage vouchers directly from the supplier card.
                  </div>
                </div>
              </div>
            )}

            {mode === 'edit' && initial?.id && (
              <SupplierLocationsAccordion supplierId={initial.id} productionId={productionId} />
            )}

            {mode === 'edit' && initial?.id && (
              <SupplierVouchersAccordion supplierId={initial.id} productionId={productionId} />
            )}

            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    Delete Supplier
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this supplier? This cannot be undone.</div>
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

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}

          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Supplier' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── RentalSuppliersTab ───────────────────────────────────────
function RentalSuppliersTab({ productionId, isMobile, openTriggerRef }) {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [supplierSidebarOpen, setSupplierSidebarOpen] = useState(false)
  const [supplierSidebarMode, setSupplierSidebarMode] = useState('new')
  const [supplierTarget, setSupplierTarget]           = useState(null)

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const { data } = await supabase
      .from('rental_suppliers')
      .select(`
        id, name, contact_name, phone, email, address, website, account_no, opening_hours, notes,
        locations:rental_supplier_locations(id, name, address, phone, email, opening_hours),
        vouchers:rental_vouchers(id, voucher_no, batch_code, amount, currency, used, vehicle_id),
        vehicles:vehicles(id, vehicle_type, vehicle_class, license_plate, driver_name, rental_brand, rental_model, rental_start, rental_end, rental_status, rental_second_driver, rental_billing_unit, rental_daily_rate, rental_currency)
      `)
      .eq('production_id', productionId)
      .order('name')
    setSuppliers(data || [])
    setLoading(false)
  }, [productionId])

  function openNewSupplier()    { setSupplierSidebarMode('new');  setSupplierTarget(null);    setSupplierSidebarOpen(true) }
  function openEditSupplier(s)  { setSupplierSidebarMode('edit'); setSupplierTarget(s);       setSupplierSidebarOpen(true) }
  function onSupplierSaved()    { setSupplierSidebarOpen(false); load() }

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (openTriggerRef) openTriggerRef.current = openNewSupplier
  }, [openTriggerRef])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading...</div>
  )

  if (suppliers.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏢</div>
      <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No rental suppliers yet</div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Click + Add Supplier to get started</div>
      <button onClick={openNewSupplier} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Add Supplier</button>
      <RentalSupplierSidebar
        open={supplierSidebarOpen}
        mode={supplierSidebarMode}
        initial={supplierTarget}
        onClose={() => setSupplierSidebarOpen(false)}
        onSaved={onSupplierSaved}
        productionId={productionId}
      />
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
      {suppliers.map(s => (
        <div key={s.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: '3px solid #2563eb', borderRadius: '0 0 10px 10px', padding: '14px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '4px' }}>{s.name}</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  {(s.vehicles || []).filter(v => v.rental_status === 'OPEN').length} vehicles
                </span>
                <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                  {(s.vouchers || []).length} vouchers
                </span>
                {s.account_no && (
                  <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '999px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                    Acct: {s.account_no}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => openEditSupplier(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0 }}>✎</button>
          </div>

          {/* Contacts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
            {s.contact_name  && <span>👤 {s.contact_name}</span>}
            {s.phone         && <span>📞 {s.phone}</span>}
            {s.email         && <span>📧 {s.email}</span>}
            {s.opening_hours && <span>🕐 {s.opening_hours}</span>}
          </div>

          {/* Locations */}
          {(s.locations || []).length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>� Locations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {(s.locations || []).map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#f8fafc', borderRadius: '6px', fontSize: '11px' }}>
                    <span style={{ color: '#0f172a', flex: 1 }}>{l.name}</span>
                    {l.opening_hours && <span style={{ color: '#94a3b8' }}>{l.opening_hours}</span>}
                    {l.phone && <span style={{ color: '#64748b' }}>{l.phone}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicles */}
          {(s.vehicles || []).length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>🚐 Vehicles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(s.vehicles || []).map(v => {
                  const statusColor = v.rental_status === 'OPEN' ? '#16a34a' : '#94a3b8'
                  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
                  const isExpiringSoon = v.rental_end && v.rental_end <= new Date(new Date().setDate(new Date().getDate() + 3)).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) && v.rental_end >= today
                  return (
                    <div key={v.id} style={{ padding: '6px 8px', background: '#f8fafc', borderLeft: `2px solid ${statusColor}`, borderRadius: '0 6px 6px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '12px', color: '#0f172a' }}>{v.id}</span>
                        {v.rental_brand && <span style={{ fontSize: '11px', color: '#374151' }}>{v.rental_brand} {v.rental_model}</span>}
                        {v.license_plate && <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{v.license_plate}</span>}
                        {isExpiringSoon && <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>⚠ Expiring soon</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', fontSize: '11px', color: '#64748b', paddingLeft: '4px' }}>
                        {v.driver_name && <span>👤 {v.driver_name}</span>}
                        {v.rental_second_driver && <span>👤 {v.rental_second_driver}</span>}
                        {v.rental_start && <span>📅 {v.rental_start} → {v.rental_end}</span>}
                        {v.rental_daily_rate && <span>💰 {v.rental_currency} {v.rental_daily_rate}/{v.rental_billing_unit === 'MONTH' ? 'mo' : 'day'}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vouchers */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎟 Vouchers</span>
              <button style={{ padding: '1px 7px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'none', color: '#64748b', cursor: 'pointer' }}>+ Add</button>
            </div>
            {(s.vouchers || []).length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No vouchers yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {(s.vouchers || []).map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#f8fafc', borderRadius: '6px', fontSize: '11px' }}>
                    <span style={{ fontFamily: 'monospace', color: '#0f172a', flex: 1 }}>{v.voucher_no}</span>
                    {v.batch_code && <span style={{ color: '#94a3b8' }}>{v.batch_code}</span>}
                    {v.amount && <span style={{ color: '#374151' }}>{v.currency} {v.amount}</span>}
                    <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: v.used ? '#faeeda' : '#f0fdf4', color: v.used ? '#633806' : '#15803d', border: `1px solid ${v.used ? '#fac775' : '#86efac'}` }}>
                      {v.used ? (v.vehicle_id || 'Used') : 'Free'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Vehicle button */}
          <button style={{ marginTop: '10px', width: '100%', padding: '6px', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px', background: 'none', color: '#64748b', cursor: 'pointer' }}>
            + Add Rental Vehicle
          </button>
        </div>
      ))}
      <RentalSupplierSidebar
        open={supplierSidebarOpen}
        mode={supplierSidebarMode}
        initial={supplierTarget}
        onClose={() => setSupplierSidebarOpen(false)}
        onSaved={onSupplierSaved}
        productionId={productionId}
      />
    </div>
  )
}

// ─── Pagina ───────────────────────────────────────────────────
export default function VehiclesPage() {
  const t = useT()
  const isMobile = useIsMobile()
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
  const [activeTab, setActiveTab] = useState('owned') // 'owned' | 'rental' | 'suppliers' | 'report'
  const supplierSidebarTriggerRef = React.useRef(null)
  const deptOptions = [...new Set(crewList.map(c => c.department).filter(Boolean))].sort()

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

      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '0px', zIndex: 29 }}>
        {/* Riga 1 — titolo + contatori + azioni */}
        <div style={{ padding: isMobile ? '8px 12px' : '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '18px' }}>🚐</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Vehicles</span>
          {activeTab === 'owned' && (
            <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', flexShrink: 0 }}>
              {t.addVehicleBtn}
            </button>
          )}
          {activeTab === 'rental' && (
            <button onClick={() => alert('Add Rental — coming soon')} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', flexShrink: 0 }}>
              + Add Rental
            </button>
          )}
          {activeTab === 'suppliers' && (
            <button onClick={() => supplierSidebarTriggerRef.current && supplierSidebarTriggerRef.current()} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', flexShrink: 0 }}>
              + Add Supplier
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{vhcs.length} totale · {counts.active} attivi</span>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['VAN', '🚐'], ['CAR', '🚗'], ['BUS', '🚌'], ['TRUCK', '🚛'], ['PICKUP', '🛻'], ['CARGO', '🚚']].map(([tp, ic]) => counts[tp.toLowerCase()] > 0 && (
              <span key={tp} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', ...(TYPE_COLOR[tp]), border: `1px solid ${TYPE_COLOR[tp].border}` }}>
                {ic} {counts[tp.toLowerCase()]} {tp}
              </span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden' }}>
            {[
              { key: 'owned',     label: '🚐 Owned' },
              { key: 'rental',    label: '🔑 Rental' },
              { key: 'suppliers', label: '🏢 Suppliers' },
              { key: 'report',    label: '📊 Report' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ padding: '5px 12px', border: 'none', borderLeft: tab.key !== 'owned' ? '1px solid #e2e8f0' : 'none', background: activeTab === tab.key ? '#0f2340' : 'white', color: activeTab === tab.key ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={load} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151', flexShrink: 0 }}>↻</button>
          <button onClick={() => setImportOpen(true)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: '#374151', flexShrink: 0 }}>
            {t.importFromFile}
          </button>
        </div>
        {/* Riga 2 — filtri */}
        {activeTab === 'owned' && <div style={{ padding: isMobile ? '8px 12px' : '8px 24px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Cerca ID, driver…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '150px', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
            {['ALL', 'ACTIVE', 'INACTIVE'].map(s => (
              <button key={s} onClick={() => setFA(s)}
                style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterActive === s ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
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
        </div>}
      </div>

      {/* Body */}
      {activeTab === 'rental' && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>Rental Vehicles — coming soon</div>
          </div>
        </div>
      )}
      {activeTab === 'suppliers' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <RentalSuppliersTab productionId={PRODUCTION_ID} isMobile={isMobile} openTriggerRef={supplierSidebarTriggerRef} />
        </div>
      )}
      {activeTab === 'report' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>Rental Report — coming soon</div>
          </div>
        </div>
      )}
      {activeTab === 'owned' && <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px', transition: 'margin-right 0.25s', marginRight: !isMobile && sidebarOpen ? `${SIDEBAR_W}px` : 'auto' }}>
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
</div>}
      <VehicleSidebar open={sidebarOpen} mode={mode} initial={editItem} onClose={() => setSO(false)} onSaved={onSaved} crewList={crewList} deptOptions={deptOptions} vehicles={vhcs} />

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
