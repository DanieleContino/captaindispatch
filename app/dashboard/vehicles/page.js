'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useT } from '../../../lib/i18n'
import { ImportModal } from '../../../lib/ImportModal'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'
import { RentalColumnsEditorSidebar } from '../../../lib/RentalColumnsEditorSidebar'
import { NccDriverSidebar } from './components/NccDriverSidebar'
import { NccVehicleSidebar } from './components/NccVehicleSidebar'
import { RENTAL_DEFAULT_PRESET } from '../../../lib/rentalColumnsCatalog'

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
const CLASS_OPTIONS = ['CLASSIC', 'LUX', 'ECONOMY', 'PREMIUM', 'MINIBUS']
const CLASS_COLOR = {
  LUX:     { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  PREMIUM: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  CLASSIC: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  ECONOMY: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  MINIBUS: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
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
    .map(v => v.display_id)
    .filter(id => id && id.toUpperCase().startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return prefix + String(max + 1).padStart(2, '0')
}

// ─── Sidebar ──────────────────────────────────────────────────
// ─── NccAgencySelectInline helper ────────────────────────────
function NccAgencySelectInline({ productionId, value, onChange }) {
  const [agencies, setAgencies] = useState([])
  useEffect(() => {
    if (!productionId) return
    supabase.from('ncc_agencies').select('id, name').eq('production_id', productionId).order('name')
      .then(({ data }) => setAgencies(data || []))
  }, [productionId])
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '6px 8px', border: '1px solid #bae6fd', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', cursor: 'pointer', boxSizing: 'border-box' }}>
      <option value="">— Select agency —</option>
      {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      {agencies.length === 0 && <option disabled>No agencies yet — add from NCC tab</option>}
    </select>
  )
}

// ─── NccAgencyNameInline helper ───────────────────────────────
function NccAgencyNameInline({ productionId, agencyId }) {
  const [name, setName] = useState(null)
  useEffect(() => {
    if (!productionId || !agencyId) return
    supabase.from('ncc_agencies').select('name').eq('id', agencyId).single()
      .then(({ data }) => setName(data?.name || null))
  }, [productionId, agencyId])
  if (!name) return <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '2px' }}>Agency ID: {agencyId}</div>
  return <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600', marginTop: '2px' }}>🏢 {name}</div>
}

// ─── Sidebar ──────────────────────────────────────────────────
function VehicleSidebar({ open, mode, initial, onClose, onSaved, crewList = [], deptOptions = [], vehicles = [], nccAgencyId = null }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const EMPTY = { id: '', vehicle_type: 'VAN', vehicle_class: [], license_plate: '', capacity: '', pax_suggested: '', pax_max: '', driver_name: '', driver_crew_id: '', sign_code: '', unit_default: '', active: true, in_transport: true, available_from: '', available_to: '', preferred_dept: '', preferred_crew_ids: [], is_ncc: false, is_comodato: false, ncc_agency_id: '', ncc_driver_name: '', ncc_driver_phone: '', comodato_owner_crew_id: '', comodato_rate_per_km: '', comodato_fuel_reimbursement: false, comodato_notes: '' }
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
      setForm({ id: initial.id || '', vehicle_type: initial.vehicle_type || 'VAN', vehicle_class: Array.isArray(initial.vehicle_class) ? initial.vehicle_class : (initial.vehicle_class ? [initial.vehicle_class] : []), license_plate: initial.license_plate || '', capacity: initial.capacity ?? '', pax_suggested: initial.pax_suggested ?? '', pax_max: initial.pax_max ?? '', driver_name: initial.driver_name || '', driver_crew_id: initial.driver_crew_id || '', sign_code: initial.sign_code || '', unit_default: initial.unit_default || '', active: initial.active !== false, in_transport: initial.in_transport !== false, available_from: initial.available_from || '', available_to: initial.available_to || '', preferred_dept: initial.preferred_dept || '', preferred_crew_ids: Array.isArray(initial.preferred_crew_ids) ? initial.preferred_crew_ids : [], is_ncc: initial.is_ncc || false, is_comodato: initial.is_comodato || false, ncc_agency_id: initial.ncc_agency_id || '', ncc_driver_name: initial.ncc_driver_name || '', ncc_driver_phone: initial.ncc_driver_phone || '', comodato_owner_crew_id: initial.comodato_owner_crew_id || '', comodato_rate_per_km: initial.comodato_rate_per_km ?? '', comodato_fuel_reimbursement: initial.comodato_fuel_reimbursement || false, comodato_notes: initial.comodato_notes || '' })
      setIdManuallyEdited(false)
    } else {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles), ...(nccAgencyId ? { is_ncc: true, ncc_agency_id: nccAgencyId } : {}) })
      setIdManuallyEdited(false)
    }
  }, [open, mode, initial, nccAgencyId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (!form.id.trim()) { setError('Vehicle ID obbligatorio'); return }
    setSaving(true)
    const row = {
      production_id:      PRODUCTION_ID,
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
      preferred_dept:              form.preferred_dept || null,
      preferred_crew_ids:          form.preferred_crew_ids.length > 0 ? form.preferred_crew_ids : null,
      is_ncc:                      form.is_ncc || false,
      is_comodato:                 form.is_comodato || false,
      ncc_agency_id:               form.is_ncc ? (form.ncc_agency_id || null) : null,
      ncc_driver_name:             form.is_ncc ? (form.ncc_driver_name.trim() || null) : null,
      ncc_driver_phone:            form.is_ncc ? (form.ncc_driver_phone.trim() || null) : null,
      comodato_owner_crew_id:      form.is_comodato ? (form.comodato_owner_crew_id || null) : null,
      comodato_rate_per_km:        form.is_comodato && form.comodato_rate_per_km !== '' ? parseFloat(form.comodato_rate_per_km) : null,
      comodato_fuel_reimbursement: form.is_comodato ? (form.comodato_fuel_reimbursement || false) : false,
      comodato_notes:              form.is_comodato ? (form.comodato_notes.trim() || null) : null,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('vehicles').insert({ ...row, display_id: form.id.trim().toUpperCase() }); err = r.error
    } else {
      const { id, ...upd } = row
      const r = await supabase.from('vehicles').update(upd).eq('uuid', initial.uuid).eq('production_id', PRODUCTION_ID); err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    // Se un crew è stato assegnato come driver, lo marchiamo automaticamente come NTN
    if (form.driver_crew_id) {
      await supabase.from('crew').update({ no_transport_needed: true }).eq('uuid', form.driver_crew_id).eq('production_id', PRODUCTION_ID)
    }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { count } = await supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', initial.uuid)
      .eq('production_id', PRODUCTION_ID)
    if (count > 0) {
      setDel(false)
      setCd(false)
      setError(`Cannot delete — this vehicle has ${count} trip${count > 1 ? 's' : ''} assigned. Remove the trips first.`)
      return
    }
    const { error } = await supabase.from('vehicles').delete().eq('uuid', initial.uuid).eq('production_id', PRODUCTION_ID)
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

            {/* Rental info banner — read only */}
            {initial?.is_rental && (
              <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #fde68a', background: '#fefce8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px' }}>🔑</span>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rental Vehicle</span>
                  <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: initial.rental_status === 'OPEN' ? '#f0fdf4' : '#f1f5f9', color: initial.rental_status === 'OPEN' ? '#15803d' : '#64748b', border: `1px solid ${initial.rental_status === 'OPEN' ? '#86efac' : '#cbd5e1'}` }}>
                    {initial.rental_status === 'OPEN' ? '🟢 Open' : '⚫ Closed'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#92400e', marginBottom: '10px' }}>
                  {initial.rental_brand && <span>🚘 {[initial.rental_brand, initial.rental_model].filter(Boolean).join(' ')}</span>}
                  {initial.rental_start && <span>📅 {initial.rental_start} → {initial.rental_end || '—'}</span>}
                  {initial.rental_daily_rate && <span>💰 {initial.rental_currency || 'EUR'} {initial.rental_daily_rate}/{initial.rental_billing_unit === 'MONTH' ? 'mo' : 'day'}</span>}
                </div>
                <div style={{ fontSize: '10px', color: '#a16207', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', padding: '6px 10px' }}>
                  ℹ Rental contract details (supplier, rates, insurance, voucher) are managed in the <strong>Rental tab</strong>. Edit them there.
                </div>
              </div>
            )}

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

            {/* Driver — autocomplete crew o testo libero — nascosto per NCC */}
            {!form.is_ncc && <div style={fld}>
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
            </div>}

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
                  {form.in_transport ? '✅ In Transport' : '🚐 SD — excluded from trips/lists/fleet'}
                </div>
              </div>
            </div>

            {/* Vehicle Category */}
            {mode === 'edit' ? (
              (form.is_ncc || form.is_comodato) && (
                <div style={{ ...fld, padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.is_ncc ? '#bae6fd' : '#86efac'}`, background: form.is_ncc ? '#f0f9ff' : '#f0fdf4' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: form.is_ncc ? '#0369a1' : '#15803d', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏷 Vehicle Category</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: form.is_ncc ? '#0369a1' : '#15803d' }}>
                    {form.is_ncc ? '🏢 NCC Vehicle — managed from NCC tab' : '🤝 Loan Vehicle — managed from Loan tab'}
                  </div>
                  {form.is_ncc && form.ncc_agency_id && <NccAgencyNameInline productionId={PRODUCTION_ID} agencyId={form.ncc_agency_id} />}
                </div>
              )
            ) : (
              <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏷 Vehicle Category</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', marginBottom: '8px' }}
                  onClick={() => setForm(f => ({ ...f, is_ncc: true, is_comodato: false }))}>
                  <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>🏢 NCC Vehicle — provided by external agency</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${form.is_comodato ? '#86efac' : '#e2e8f0'}`, background: form.is_comodato ? '#f0fdf4' : 'white', cursor: 'pointer', marginBottom: form.is_comodato ? '8px' : '0' }}
                  onClick={() => setForm(f => ({ ...f, is_comodato: !f.is_comodato, is_ncc: false }))}>
                  <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.is_comodato ? '#15803d' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '2px', left: form.is_comodato ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: form.is_comodato ? '#15803d' : '#64748b' }}>🤝 Loan Vehicle — personal vehicle with expense reimbursement</div>
                </div>
                {form.is_comodato && (
                  <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Owner (Crew)</label>
                        <select value={form.comodato_owner_crew_id} onChange={e => set('comodato_owner_crew_id', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', cursor: 'pointer', boxSizing: 'border-box' }}>
                          <option value="">— Select owner —</option>
                          {crewList.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.department ? ` (${c.department})` : ''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Rate per KM (EUR)</label>
                        <input type="number" step="0.01" value={form.comodato_rate_per_km} onChange={e => set('comodato_rate_per_km', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: '7px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }} placeholder="0.25" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '7px', border: `1px solid ${form.comodato_fuel_reimbursement ? '#86efac' : '#e2e8f0'}`, background: form.comodato_fuel_reimbursement ? '#f0fdf4' : 'white', cursor: 'pointer', marginBottom: '8px' }}
                      onClick={() => set('comodato_fuel_reimbursement', !form.comodato_fuel_reimbursement)}>
                      <div style={{ width: '28px', height: '16px', borderRadius: '999px', background: form.comodato_fuel_reimbursement ? '#15803d' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '2px', left: form.comodato_fuel_reimbursement ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: form.comodato_fuel_reimbursement ? '#15803d' : '#64748b' }}>⛽ Fuel reimbursement</span>
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Notes</label>
                      <input value={form.comodato_notes} onChange={e => set('comodato_notes', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box' }} placeholder="Additional notes..." />
                    </div>
                  </div>
                )}
              </div>
            )}

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
                      const cm = crewList.find(c => c.uuid === cid)
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
    await onDelete(v.uuid)
    setDeleting(false)
    setConfirmDel(false)
  }

  return (
    <div style={{ background: selected ? '#eff6ff' : 'white', border: `1px solid ${selected ? '#bfdbfe' : '#e2e8f0'}`, borderLeft: `4px solid ${selected ? '#3b82f6' : v.active ? tc.border : '#e2e8f0'}`, borderRadius: '9px', padding: '12px 16px', display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '20px 40px 1fr auto', alignItems: isMobile ? 'stretch' : 'center', gap: '8px', opacity: v.active ? 1 : 0.55 }}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(v.uuid)}
        onClick={e => e.stopPropagation()}
        style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
      />
      <div style={{ fontSize: '28px', textAlign: 'center' }}>{icon}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a', fontFamily: 'monospace' }}>{v.display_id || v.id}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{v.vehicle_type}</span>
          {Array.isArray(v.vehicle_class) && v.vehicle_class.length > 0
            ? v.vehicle_class.map(c => { const cc = CLASS_COLOR[c] || CLASS_COLOR.CLASSIC; return <span key={c} style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: cc.bg, color: cc.color, border: `1px solid ${cc.border}` }}>{c === 'LUX' ? '💎 LUX' : c === 'PREMIUM' ? '⭐ PREMIUM' : c === 'MINIBUS' ? '🚌 MINIBUS' : c}</span> })
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
          {v.is_rental && <span style={{ fontSize: '10px', fontWeight: '700', color: '#a16207', background: '#fefce8', padding: '1px 8px', borderRadius: '999px', border: '1px solid #fde68a' }}>🔑 RENTAL</span>}
          {v.is_ncc && <span style={{ fontSize: '10px', fontWeight: '700', color: '#0369a1', background: '#f0f9ff', padding: '1px 8px', borderRadius: '999px', border: '1px solid #bae6fd' }}>🏢 NCC</span>}
          {v.is_comodato && <span style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', padding: '1px 8px', borderRadius: '999px', border: '1px solid #86efac' }}>🤝 LOAN</span>}
          {!v.active && <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', padding: '1px 8px', borderRadius: '999px', border: '1px solid #e2e8f0' }}>INACTIVE</span>}
          {v.in_transport === false && <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '1px 8px', borderRadius: '999px', border: '1px solid #cbd5e1' }}>🚐 SD</span>}
          {v.preferred_dept && (
            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: (DEPT_COLOR[v.preferred_dept] || {}).bg || '#f8fafc', color: (DEPT_COLOR[v.preferred_dept] || {}).color || '#475569', border: `1px solid ${(DEPT_COLOR[v.preferred_dept] || {}).border || '#e2e8f0'}` }}>
              ⭐ {v.preferred_dept}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
          {(v.driver_name || v.ncc_driver_name) && (
            <span style={v.driver_crew_id ? { color: '#15803d', fontWeight: '600' } : {}}>
              {v.driver_crew_id ? '🔗' : '👤'} {v.driver_name || v.ncc_driver_name}
              {v.driver_crew_id && <span style={{ fontSize: '10px', color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '999px', padding: '0 5px', marginLeft: '4px', fontWeight: '700' }}>NTN</span>}
            </span>
          )}
          {v.sign_code   && <span>🏷 {v.sign_code}</span>}
          {v.unit_default && <span>📋 {v.unit_default}</span>}
          {Array.isArray(v.preferred_crew_ids) && v.preferred_crew_ids.length > 0 && crewList.length > 0 && (
            <span style={{ color: '#1d4ed8' }}>
                        👥 {v.preferred_crew_ids.slice(0, 3).map(id => crewList.find(c => c.uuid === id)?.full_name).filter(Boolean).join(', ')}
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

// ─── RentalReportTab ─────────────────────────────────────────
function RentalReportTab({ productionId }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
  const [vehicles, setVehicles]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const [{ data: vData }, { data: sData }] = await Promise.all([
      supabase.from('vehicles').select(`
        id, vehicle_type, vehicle_class, license_plate, driver_name,
        rental_brand, rental_model, rental_supplier_id, rental_start, rental_end,
        rental_status, rental_billing_unit, rental_daily_rate, rental_vat_pct,
        rental_currency, rental_voucher_id, rental_po_number, rental_contract_no,
        rental_second_driver, rental_extras, rental_notes
      `).eq('production_id', productionId).eq('is_rental', true).order('rental_supplier_id').order('rental_start'),
      supabase.from('rental_suppliers').select('id, name').eq('production_id', productionId).order('name'),
    ])
    setVehicles(vData || [])
    setSuppliers(sData || [])
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  function daysBetween(start, end) {
    if (!start || !end) return 0
    const a = new Date(start + 'T12:00:00Z')
    const b = new Date(end   + 'T12:00:00Z')
    return Math.max(0, Math.round((b - a) / 86400000))
  }

  function fmtDate(s) {
    if (!s) return '—'
    return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function computeCosts(v) {
    const days    = daysBetween(v.rental_start, v.rental_end)
    const rate    = parseFloat(v.rental_daily_rate) || 0
    const vatPct  = parseFloat(v.rental_vat_pct)    || 0
    const nv      = rate > 0 && days > 0 ? rate * days : 0
    const tv      = nv > 0 && vatPct > 0 ? nv * (1 + vatPct / 100) : nv
    const extras  = (v.rental_extras || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
    return { days, nv, tv, extras, currency: v.rental_currency || 'EUR' }
  }

  function fmt(n, currency) {
    if (!n || n === 0) return '—'
    return `${currency} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const groupedBySupplier = vehicles.reduce((acc, v) => {
    const sid = v.rental_supplier_id || '__none__'
    if (!acc[sid]) acc[sid] = []
    acc[sid].push(v)
    return acc
  }, {})

  const sortedSupplierIds = Object.keys(groupedBySupplier).sort((a, b) => {
    const na = suppliers.find(s => s.id === a)?.name || 'ZZZ'
    const nb = suppliers.find(s => s.id === b)?.name || 'ZZZ'
    return na.localeCompare(nb)
  })

  // Grand totals
  const grandTotals = vehicles.reduce((acc, v) => {
    const { nv, tv, extras } = computeCosts(v)
    return { nv: acc.nv + nv, tv: acc.tv + tv, extras: acc.extras + extras }
  }, { nv: 0, tv: 0, extras: 0 })

  const thStyle = { padding: '5px 10px', fontSize: '10px', fontWeight: '800', color: '#64748b', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }
  const tdStyle = { padding: '6px 10px', fontSize: '11px', color: '#374151', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdNum   = { ...tdStyle, fontFamily: 'monospace', textAlign: 'right' }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading...</div>

  if (vehicles.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
      <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>No rental vehicles to report</div>
    </div>
  )

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .rental-report-wrap { padding: 0 !important; background: white !important; }
        }
        @page { size: A4 landscape; margin: 8mm; }
      `}</style>

      {/* Summary bar */}
      <div className="no-print" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', color: '#374151' }}>Total vehicles: <span style={{ fontWeight: '800', color: '#0f172a' }}>{vehicles.length}</span></div>
        <div style={{ fontSize: '12px', color: '#374151' }}>Open: <span style={{ fontWeight: '800', color: '#15803d' }}>{vehicles.filter(v => v.rental_status === 'OPEN').length}</span></div>
        <div style={{ fontSize: '12px', color: '#374151' }}>Closed: <span style={{ fontWeight: '800', color: '#64748b' }}>{vehicles.filter(v => v.rental_status === 'CLOSED').length}</span></div>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()}
          style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
          🖨 Print / PDF
        </button>
      </div>

      <div className="rental-report-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {sortedSupplierIds.map(sid => {
          const supplierName     = suppliers.find(s => s.id === sid)?.name || 'No Supplier'
          const supplierVehicles = groupedBySupplier[sid]
          const supplierTotals   = supplierVehicles.reduce((acc, v) => {
            const { nv, tv, extras } = computeCosts(v)
            return { nv: acc.nv + nv, tv: acc.tv + tv, extras: acc.extras + extras }
          }, { nv: 0, tv: 0, extras: 0 })

          return (
            <div key={sid} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              {/* Supplier header */}
              <div style={{ background: '#0f2340', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏢 {supplierName}</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{supplierVehicles.length} vehicle{supplierVehicles.length !== 1 ? 's' : ''}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', fontFamily: 'monospace' }}>
                  No VAT: {fmt(supplierTotals.nv, 'EUR')} · + VAT: {fmt(supplierTotals.tv, 'EUR')}
                  {supplierTotals.extras > 0 && ` · Extras: ${fmt(supplierTotals.extras, 'EUR')}`}
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Vehicle</th>
                      <th style={thStyle}>Brand / Model</th>
                      <th style={thStyle}>Plate</th>
                      <th style={thStyle}>Driver</th>
                      <th style={thStyle}>2nd Driver</th>
                      <th style={thStyle}>Start</th>
                      <th style={thStyle}>End</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Days</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Rate/unit</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>No VAT</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>+ VAT</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Extras</th>
                      <th style={thStyle}>Voucher / P.O.</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierVehicles.map((v, idx) => {
                      const { days, nv, tv, extras, currency } = computeCosts(v)
                      const isExpiring = v.rental_end && v.rental_end <= new Date(new Date().setDate(new Date().getDate() + 3)).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) && v.rental_end >= today
                      const rowBg = idx % 2 === 0 ? 'white' : '#fafafa'
                      return (
                        <tr key={v.id} style={{ background: rowBg }}>
                          <td style={{ ...tdStyle, background: rowBg, fontFamily: 'monospace', fontWeight: '700', color: '#0f172a' }}>{v.id}</td>
                          <td style={{ ...tdStyle, background: rowBg }}>{[v.rental_brand, v.rental_model].filter(Boolean).join(' ') || '—'}</td>
                          <td style={{ ...tdStyle, background: rowBg, fontFamily: 'monospace' }}>{v.license_plate || '—'}</td>
                          <td style={{ ...tdStyle, background: rowBg }}>{v.driver_name || '—'}</td>
                          <td style={{ ...tdStyle, background: rowBg, color: '#64748b' }}>{v.rental_second_driver || '—'}</td>
                          <td style={{ ...tdStyle, background: rowBg }}>{fmtDate(v.rental_start)}</td>
                          <td style={{ ...tdStyle, background: rowBg, fontWeight: isExpiring ? '700' : '400', color: isExpiring ? '#dc2626' : '#374151' }}>{fmtDate(v.rental_end)}{isExpiring && ' ⚠'}</td>
                          <td style={{ ...tdNum, background: rowBg, textAlign: 'center' }}>{days || '—'}</td>
                          <td style={{ ...tdNum, background: rowBg }}>{fmt(parseFloat(v.rental_daily_rate) || 0, currency)}</td>
                          <td style={{ ...tdNum, background: rowBg }}>{fmt(nv, currency)}</td>
                          <td style={{ ...tdNum, background: rowBg }}>{fmt(tv, currency)}</td>
                          <td style={{ ...tdNum, background: rowBg, color: extras > 0 ? '#2563eb' : '#cbd5e1' }}>{fmt(extras, currency)}</td>
                          <td style={{ ...tdStyle, background: rowBg, fontSize: '10px' }}>
                            {v.rental_voucher_id && <span style={{ marginRight: '4px', color: '#15803d' }}>🎟</span>}
                            {v.rental_po_number || '—'}
                          </td>
                          <td style={{ ...tdStyle, background: rowBg }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: v.rental_status === 'OPEN' ? '#f0fdf4' : '#f1f5f9', color: v.rental_status === 'OPEN' ? '#15803d' : '#64748b', border: `1px solid ${v.rental_status === 'OPEN' ? '#86efac' : '#cbd5e1'}` }}>
                              {v.rental_status === 'OPEN' ? '🟢 Open' : '⚫ Closed'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Supplier total row */}
                  <tfoot>
                    <tr style={{ background: '#374151' }}>
                      <td colSpan={9} style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {supplierName} Total
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', fontWeight: '800', color: 'white' }}>{fmt(supplierTotals.nv, 'EUR')}</td>
                      <td style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', fontWeight: '800', color: 'white' }}>{fmt(supplierTotals.tv, 'EUR')}</td>
                      <td style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', fontWeight: '800', color: '#93c5fd' }}>{fmt(supplierTotals.extras, 'EUR')}</td>
                      <td colSpan={2} style={{ padding: '6px 10px', background: '#374151' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}

        {/* Grand Total */}
        <div style={{ background: '#0f2340', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grand Total</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>No VAT</div>
              <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', color: 'white' }}>{fmt(grandTotals.nv, 'EUR')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>+ VAT</div>
              <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', color: 'white' }}>{fmt(grandTotals.tv, 'EUR')}</div>
            </div>
            {grandTotals.extras > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Extras</div>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', color: '#93c5fd' }}>{fmt(grandTotals.extras, 'EUR')}</div>
              </div>
            )}
            <div style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '24px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Total + Extras</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: '800', color: 'white' }}>{fmt(grandTotals.tv + grandTotals.extras, 'EUR')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── RentalTab ───────────────────────────────────────────────
function RentalTab({ productionId, isMobile, openTriggerRef, crewList = [], externalSearch = '', externalFilterStatus = 'ALL', onRentalInfo, columnsEditorOpen = false, onColumnsEditorClose, onEditVehicle }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
  const [vehicles, setVehicles]         = useState([])
  const [suppliers, setSuppliers]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [columnsConfig, setColumnsConfig] = useState([])
  const [applyingPreset, setApplyingPreset] = useState(false)
  const filterStatus = externalFilterStatus
  const search = externalSearch
  const [rentalSidebarOpen, setRentalSidebarOpen] = useState(false)
  const [rentalSidebarMode, setRentalSidebarMode] = useState('new')
  const [rentalTarget, setRentalTarget] = useState(null)
  const [allVehicles, setAllVehicles]   = useState([])

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const [{ data: vData }, { data: sData }, { data: cData }, { data: allV }] = await Promise.all([
      supabase.from('vehicles').select(`
        id, vehicle_type, vehicle_class, license_plate, driver_name, driver_crew_id,
        rental_brand, rental_model, rental_supplier_id, rental_start, rental_end,
        rental_status, rental_billing_unit, rental_daily_rate, rental_vat_pct,
        rental_currency, rental_voucher_id, rental_po_number, rental_contract_no,
        rental_second_driver, rental_km_included, rental_insurance_casco,
        rental_insurance_limit, rental_insurance_excess, rental_notes,
        rental_extras, rental_pickup_location_id, rental_dropoff_location_id,
        rental_insurance_exp, active, in_transport, available_from, available_to,
        sign_code, unit_default, preferred_dept, preferred_crew_ids
      `).eq('production_id', productionId).eq('is_rental', true).order('rental_supplier_id').order('rental_start'),
      supabase.from('rental_suppliers').select('id, name').eq('production_id', productionId).order('name'),
      supabase.from('rental_list_columns').select('*').eq('production_id', productionId).order('display_order').order('created_at'),
      supabase.from('vehicles').select('id').eq('production_id', productionId),
    ])
    setVehicles(vData || [])
    setSuppliers(sData || [])
    setColumnsConfig(cData || [])
    setAllVehicles(allV || [])
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (openTriggerRef) openTriggerRef.current = () => {
      setRentalSidebarMode('new')
      setRentalTarget(null)
      setRentalSidebarOpen(true)
    }
  }, [openTriggerRef])

  async function applyDefaultPreset() {
    if (!productionId || applyingPreset) return
    setApplyingPreset(true)
    try {
      const rows = RENTAL_DEFAULT_PRESET.map(p => ({ ...p, production_id: productionId }))
      await supabase.from('rental_list_columns').insert(rows)
      await load()
    } catch (e) { console.error(e) }
    finally { setApplyingPreset(false) }
  }

  function daysBetween(start, end) {
    if (!start || !end) return null
    const a = new Date(start + 'T12:00:00Z')
    const b = new Date(end   + 'T12:00:00Z')
    const n = Math.round((b - a) / 86400000)
    return n > 0 ? n : null
  }

  function fmtDate(s) {
    if (!s) return '—'
    return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function renderCell(col, v, supplierName) {
    const days = daysBetween(v.rental_start, v.rental_end)
    const qty  = days || 0
    const rate = parseFloat(v.rental_daily_rate) || 0
    const vat  = parseFloat(v.rental_vat_pct)    || 0
    const nv   = rate > 0 && qty > 0 ? rate * qty : 0
    const tv   = nv > 0 && vat > 0 ? nv * (1 + vat / 100) : nv
    const isExpiring = v.rental_end && v.rental_end <= new Date(new Date().setDate(new Date().getDate() + 3)).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) && v.rental_end >= today

    switch (col.source_field) {
      case 'vehicle_id':
        return <td key={col.source_field} onClick={() => onEditVehicle ? onEditVehicle(v) : (() => { setRentalSidebarMode('edit'); setRentalTarget(v); setRentalSidebarOpen(true) })()} style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: '700', fontSize: '12px', color: '#0f172a', cursor: 'pointer', whiteSpace: 'nowrap' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.06)'} onMouseLeave={e => e.currentTarget.style.background = ''}>{v.id}</td>
      case 'brand_model':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>{[v.rental_brand, v.rental_model].filter(Boolean).join(' ') || '—'}</td>
      case 'plate':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>{v.license_plate || '—'}</td>
      case 'type': {
        const tc = TYPE_COLOR[v.vehicle_type] || TYPE_COLOR.VAN
        return <td key={col.source_field} style={{ padding: '6px 8px' }}><span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`, whiteSpace: 'nowrap' }}>{TYPE_ICON[v.vehicle_type] || ''} {v.vehicle_type}</span></td>
      }
      case 'class': {
        const cls = Array.isArray(v.vehicle_class) ? v.vehicle_class : []
        return <td key={col.source_field} style={{ padding: '6px 8px' }}>{cls.length > 0 ? cls.map(c => { const cc = CLASS_COLOR[c] || CLASS_COLOR.CLASSIC; return <span key={c} style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: cc.bg, color: cc.color, border: `1px solid ${cc.border}`, marginRight: '3px', whiteSpace: 'nowrap' }}>{c}</span> }) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      }
      case 'driver':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>{v.driver_name ? <span>{v.driver_crew_id ? '🔗 ' : '👤 '}{v.driver_name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'second_driver':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{v.rental_second_driver || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'dept':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{v.driver_dept || '—'}</td>
      case 'start':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(v.rental_start)}</td>
      case 'end':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: isExpiring ? '700' : '400', color: isExpiring ? '#dc2626' : '#374151', whiteSpace: 'nowrap' }}>{fmtDate(v.rental_end)}{isExpiring && <span style={{ marginLeft: '4px', fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>⚠ Expiring</span>}</td>
      case 'days':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', textAlign: 'center', fontWeight: '700', color: '#0f172a' }}>{days ?? '—'}</td>
      case 'billing_unit':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#64748b' }}>{v.rental_billing_unit || '—'}</td>
      case 'rate':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>{rate > 0 ? `${v.rental_currency || 'EUR'} ${rate.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}</td>
      case 'total_no_vat':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>{nv > 0 ? `${v.rental_currency || 'EUR'} ${nv.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}</td>
      case 'total_vat':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>{tv > 0 ? `${v.rental_currency || 'EUR'} ${tv.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}</td>
      case 'currency':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#64748b' }}>{v.rental_currency || 'EUR'}</td>
      case 'status': {
        const isOpen = v.rental_status === 'OPEN'
        return <td key={col.source_field} style={{ padding: '6px 8px' }}><span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '999px', background: isOpen ? '#f0fdf4' : '#f1f5f9', color: isOpen ? '#15803d' : '#64748b', border: `1px solid ${isOpen ? '#86efac' : '#cbd5e1'}`, whiteSpace: 'nowrap' }}>{isOpen ? '🟢 Open' : '⚫ Closed'}</span></td>
      }
      case 'voucher':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#2563eb', whiteSpace: 'nowrap' }}>{v.rental_voucher_id ? '🎟' : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'po':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>{v.rental_po_number || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'contract_no':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>{v.rental_contract_no || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'insurance':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}>{v.rental_insurance_casco ? <span style={{ padding: '1px 6px', borderRadius: '999px', background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd', fontWeight: '700' }}>🛡 Full Casco</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'km':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{v.rental_km_included || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      case 'notes':
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#64748b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.rental_notes || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
      default:
        return <td key={col.source_field} style={{ padding: '6px 8px', fontSize: '11px', color: '#cbd5e1' }}>—</td>
    }
  }

  const filtered = vehicles.filter(v => {
    if (filterStatus !== 'ALL' && v.rental_status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(v.id || '').toLowerCase().includes(q) &&
          !(v.driver_name || '').toLowerCase().includes(q) &&
          !(v.license_plate || '').toLowerCase().includes(q) &&
          !(v.rental_brand || '').toLowerCase().includes(q) &&
          !(v.rental_model || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const groupedBySupplier = filtered.reduce((acc, v) => {
    const sid = v.rental_supplier_id || '__none__'
    if (!acc[sid]) acc[sid] = []
    acc[sid].push(v)
    return acc
  }, {})

  const sortedSupplierIds = Object.keys(groupedBySupplier).sort((a, b) => {
    const na = suppliers.find(s => s.id === a)?.name || 'ZZZ'
    const nb = suppliers.find(s => s.id === b)?.name || 'ZZZ'
    return na.localeCompare(nb)
  })

  const colMinW = columnsConfig.reduce((s, c) => s + parseInt(c.width || '120'), 0)

  useEffect(() => {
    if (onRentalInfo) onRentalInfo({ columnsCount: columnsConfig.length, vehicleCount: filtered.length })
  }, [columnsConfig.length, filtered.length])

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading...</div>

  return (
    <div>
      {vehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No rental vehicles yet</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Use + Add Rental to add your first rental vehicle</div>
        </div>
      ) : columnsConfig.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗂</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>No columns configured</div>
          <button onClick={applyDefaultPreset} disabled={applyingPreset}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
            {applyingPreset ? 'Applying...' : 'Apply Default Columns'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {sortedSupplierIds.map(sid => {
            const supplierName = suppliers.find(s => s.id === sid)?.name || 'No Supplier'
            const supplierVehicles = groupedBySupplier[sid]
            return (
              <div key={sid}>
                {/* Supplier header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px 8px 0 0', borderBottom: 'none' }}>
                  <span style={{ fontSize: '14px' }}>🏢</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#14532d', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{supplierName}</span>
                  <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                    {supplierVehicles.length} vehicle{supplierVehicles.length !== 1 ? 's' : ''}
                    {' · '}
                    {supplierVehicles.filter(v => v.rental_status === 'OPEN').length} open
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #e2e8f0', borderTop: '1px solid #86efac', borderRadius: '0 0 8px 8px', overflow: 'hidden', minWidth: colMinW + 'px' }}>
                    <colgroup>{columnsConfig.map(col => <col key={col.source_field} style={{ width: col.width }} />)}</colgroup>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        {columnsConfig.map(col => (
                          <th key={col.source_field} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '800', color: '#64748b', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                            {col.header_label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {supplierVehicles.map((v, idx) => (
                        <tr key={v.id} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => { if (!c.style.background || c.style.background === 'white' || c.style.background === 'rgb(250, 250, 250)') c.style.background = '#f8fafc' })}
                          onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => { c.style.background = idx % 2 === 0 ? 'white' : '#fafafa' })}>
                          {columnsConfig.map(col => renderCell(col, v, supplierName))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <RentalColumnsEditorSidebar open={columnsEditorOpen} onClose={() => { if (onColumnsEditorClose) onColumnsEditorClose() }} onChanged={load} />
      <RentalVehicleSidebar
        open={rentalSidebarOpen}
        mode={rentalSidebarMode}
        initial={rentalTarget}
        onClose={() => setRentalSidebarOpen(false)}
        onSaved={() => { setRentalSidebarOpen(false); load() }}
        productionId={productionId}
        crewList={crewList}
        vehicles={allVehicles}
        initialSupplierId={null}
      />
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

// ─── RentalVehicleSidebar ────────────────────────────────────
function RentalVehicleSidebar({ open, mode, initial, onClose, onSaved, productionId, crewList = [], vehicles = [], initialSupplierId = null, compactMode = false }) {
  const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'NOK', 'SEK', 'DKK']
  const EMPTY = {
    id: '', vehicle_type: 'VAN', vehicle_class: [],
    rental_brand: '', rental_model: '', license_plate: '',
    rental_supplier_id: initialSupplierId || '',
    rental_pickup_location_id: '', rental_dropoff_location_id: '',
    rental_start: '', rental_end: '',
    rental_status: 'OPEN',
    rental_billing_unit: 'DAY', rental_quantity: '',
    rental_daily_rate: '', rental_vat_pct: '',
    rental_extras: [],
    rental_currency: 'EUR',
    rental_contract_no: '', rental_voucher_id: '',
    rental_po_number: '', rental_invoice_no: '',
    driver_name: '', driver_crew_id: '', driver_dept: '',
    rental_second_driver: '', rental_second_driver_crew_id: '',
    rental_pickup_location_id: '', rental_dropoff_location_id: '',
    rental_insurance_casco: false,
    rental_insurance_limit: '', rental_insurance_excess: '',
    rental_insurance_exp: '',
    rental_km_included: '',
    rental_notes: '',
    sign_code: '',
    unit_default: '',
    active: true, in_transport: true,
    preferred_dept: '',
    preferred_crew_ids: [],
  }

  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [confirmDel, setCd]   = useState(false)
  const [deleting, setDel]    = useState(false)
  const [idManuallyEdited, setIdManuallyEdited] = useState(false)

  // Supplier data
  const [suppliers, setSuppliers]   = useState([])
  const [locations, setLocations]   = useState([])
  const [vouchers,  setVouchers]    = useState([])

  // Driver autocomplete
  const [driverSearch,      setDriverSearch]      = useState('')
  const [showDriverSugg,    setShowDriverSugg]    = useState(false)
  const [driver2Search,     setDriver2Search]     = useState('')
  const [showDriver2Sugg,   setShowDriver2Sugg]   = useState(false)
  const [driverNotFound,    setDriverNotFound]    = useState(false)
  const [driver2NotFound,   setDriver2NotFound]   = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Load suppliers on open
  useEffect(() => {
    if (!open || !productionId) return
    supabase.from('rental_suppliers').select('id, name').eq('production_id', productionId).order('name')
      .then(({ data }) => setSuppliers(data || []))
  }, [open, productionId])

  // Load locations + vouchers when supplier changes
  useEffect(() => {
    if (!form.rental_supplier_id || !productionId) { setLocations([]); setVouchers([]); return }
    supabase.from('rental_supplier_locations').select('id, name').eq('supplier_id', form.rental_supplier_id).eq('production_id', productionId).order('name')
      .then(({ data }) => setLocations(data || []))
    supabase.from('rental_vouchers').select('id, voucher_no, batch_code, amount, currency').eq('supplier_id', form.rental_supplier_id).eq('production_id', productionId).eq('used', false).order('created_at')
      .then(({ data }) => setVouchers(data || []))
  }, [form.rental_supplier_id, productionId])

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false)
    setDriverSearch(''); setDriver2Search('')
    setShowDriverSugg(false); setShowDriver2Sugg(false)
    setDriverNotFound(false); setDriver2NotFound(false)
    if (mode === 'edit' && initial) {
      setForm({
        id:                         initial.id                        || '',
        vehicle_type:               initial.vehicle_type              || 'VAN',
        vehicle_class:              Array.isArray(initial.vehicle_class) ? initial.vehicle_class : (initial.vehicle_class ? [initial.vehicle_class] : []),
        rental_brand:               initial.rental_brand              || '',
        rental_model:               initial.rental_model              || '',
        license_plate:              initial.license_plate             || '',
        rental_supplier_id:         initial.rental_supplier_id        || '',
        rental_pickup_location_id:  initial.rental_pickup_location_id || '',
        rental_dropoff_location_id: initial.rental_dropoff_location_id|| '',
        rental_start:               initial.rental_start              || '',
        rental_end:                 initial.rental_end                || '',
        rental_status:              initial.rental_status             || 'OPEN',
        rental_billing_unit:        initial.rental_billing_unit       || 'DAY',
        rental_quantity:            initial.rental_quantity           ?? '',
        rental_daily_rate:          initial.rental_daily_rate         ?? '',
        rental_vat_pct:             initial.rental_vat_pct            ?? '',
        rental_extras:              Array.isArray(initial.rental_extras) ? initial.rental_extras : [],
        rental_currency:            initial.rental_currency           || 'EUR',
        rental_contract_no:         initial.rental_contract_no        || '',
        rental_voucher_id:          initial.rental_voucher_id         || '',
        rental_po_number:           initial.rental_po_number          || '',
        rental_invoice_no:          initial.rental_invoice_no         || '',
        driver_name:                initial.driver_name               || '',
        driver_crew_id:             initial.driver_crew_id            || '',
        driver_dept:                initial.driver_dept               || '',
        rental_second_driver:       initial.rental_second_driver      || '',
        rental_second_driver_crew_id: initial.rental_second_driver_crew_id || '',
        rental_insurance_casco:     initial.rental_insurance_casco    || false,
        rental_insurance_limit:     initial.rental_insurance_limit    ?? '',
        rental_insurance_excess:    initial.rental_insurance_excess   ?? '',
        rental_insurance_exp:       initial.rental_insurance_exp      || '',
        rental_km_included:         initial.rental_km_included        || '',
        rental_notes:               initial.rental_notes              || '',
        active:                     initial.active !== false,
        in_transport:               initial.in_transport !== false,
        preferred_dept:             initial.preferred_dept    || '',
        preferred_crew_ids:         Array.isArray(initial.preferred_crew_ids) ? initial.preferred_crew_ids : [],
        sign_code:                  initial.sign_code                 || '',
        unit_default:               initial.unit_default              || '',
      })
      setDriverSearch(initial.driver_name || '')
      setDriver2Search(initial.rental_second_driver || '')
      setIdManuallyEdited(false)
    } else {
      setForm({ ...EMPTY, rental_supplier_id: initialSupplierId || '', id: suggestId('CAR', vehicles) })
      setIdManuallyEdited(false)
    }
  }, [open, mode, initial])

  // Computed cost preview
  const days = (() => {
    if (!form.rental_start || !form.rental_end) return 0
    const a = new Date(form.rental_start + 'T12:00:00Z')
    const b = new Date(form.rental_end   + 'T12:00:00Z')
    return Math.max(0, Math.round((b - a) / 86400000))
  })()
  const qty         = parseFloat(form.rental_quantity) || days
  const rate        = parseFloat(form.rental_daily_rate) || 0
  const vatPct      = parseFloat(form.rental_vat_pct) || 0
  const totalNoVat  = rate > 0 && qty > 0 ? rate * qty : 0
  const totalVat    = totalNoVat > 0 && vatPct > 0 ? totalNoVat * (1 + vatPct / 100) : totalNoVat
  const extrasTotal = (form.rental_extras || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id.trim()) { setError('Vehicle ID is required'); return }
    if (!form.rental_supplier_id) { setError('Supplier is required'); return }
    if (!form.rental_start || !form.rental_end) { setError('Rental start and end dates are required'); return }
    setSaving(true)
    const row = {
      production_id:              productionId,
      vehicle_type:               form.vehicle_type || null,
      vehicle_class:              form.vehicle_class.length > 0 ? form.vehicle_class : null,
      license_plate:              form.license_plate.trim().toUpperCase() || null,
      is_rental:                  true,
      rental_brand:               form.rental_brand.trim() || null,
      rental_model:               form.rental_model.trim() || null,
      rental_supplier_id:         form.rental_supplier_id || null,
      rental_pickup_location_id:  form.rental_pickup_location_id  || null,
      rental_dropoff_location_id: form.rental_dropoff_location_id || null,
      rental_start:               form.rental_start || null,
      rental_end:                 form.rental_end   || null,
      rental_status:              form.rental_status || 'OPEN',
      rental_billing_unit:        form.rental_billing_unit || 'DAY',
      rental_quantity:            form.rental_quantity !== '' ? parseFloat(form.rental_quantity) : (qty || null),
      rental_daily_rate:          form.rental_daily_rate !== '' ? parseFloat(form.rental_daily_rate) : null,
      rental_vat_pct:             form.rental_vat_pct    !== '' ? parseFloat(form.rental_vat_pct)    : null,
      rental_extras:              form.rental_extras.length > 0 ? form.rental_extras : [],
      rental_currency:            form.rental_currency || 'EUR',
      rental_contract_no:         form.rental_contract_no.trim() || null,
      rental_voucher_id:          form.rental_voucher_id || null,
      rental_po_number:           form.rental_po_number.trim()  || null,
      rental_invoice_no:          form.rental_invoice_no.trim() || null,
      driver_name:                form.driver_name.trim() || null,
      driver_crew_id:             form.driver_crew_id || null,
      rental_second_driver:       form.rental_second_driver.trim() || null,
      rental_insurance_casco:     form.rental_insurance_casco || false,
      rental_insurance_limit:     form.rental_insurance_limit  !== '' ? parseFloat(form.rental_insurance_limit)  : null,
      rental_insurance_excess:    form.rental_insurance_excess !== '' ? parseFloat(form.rental_insurance_excess) : null,
      rental_insurance_exp:       form.rental_insurance_exp || null,
      rental_km_included:         form.rental_km_included.trim() || null,
      rental_notes:               form.rental_notes.trim() || null,
      active:                     true,
      in_transport:               true,
      preferred_dept:             form.preferred_dept || null,
      preferred_crew_ids:         form.preferred_crew_ids.length > 0 ? form.preferred_crew_ids : null,
      sign_code:                  form.sign_code?.trim() || null,
      unit_default:               form.unit_default?.trim() || null,
      available_from:             form.rental_start || null,
      available_to:               form.rental_end   || null,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('vehicles').insert({ ...row, display_id: form.id.trim().toUpperCase() })
      err = r.error
      // Mark voucher as used
      if (!err && form.rental_voucher_id) {
        await supabase.from('rental_vouchers').update({ used: true, vehicle_id: form.id.trim().toUpperCase() }).eq('id', form.rental_voucher_id)
      }
    } else {
      const r = await supabase.from('vehicles').update(row).eq('uuid', initial.uuid).eq('production_id', productionId)
      err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    if (form.driver_crew_id) {
      await supabase.from('crew').update({ no_transport_needed: true }).eq('uuid', form.driver_crew_id).eq('production_id', productionId)
    }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error } = await supabase.from('vehicles').delete().eq('uuid', initial.uuid).eq('production_id', productionId)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }
  const tc  = TYPE_COLOR[form.vehicle_type] || TYPE_COLOR.VAN

  function DriverField({ label, nameVal, crewIdVal, searchVal, setSearch, showSugg, setShowSugg, notFound, setNotFound, onSelect, onClear }) {
    return (
      <div style={fld}>
        <label style={lbl}>{label}</label>
        {crewIdVal ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', border: '1px solid #86efac', borderRadius: '8px', background: '#f0fdf4' }}>
            <span style={{ fontSize: '14px' }}>🔗</span>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: '700', color: '#15803d' }}>{nameVal}</span>
            <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>✕</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={searchVal}
              onChange={e => {
                setSearch(e.target.value)
                setShowSugg(e.target.value.length > 0)
                setNotFound(false)
              }}
              onBlur={() => setTimeout(() => {
                setShowSugg(false)
                if (searchVal && !crewIdVal) setNotFound(true)
                else setNotFound(false)
              }, 160)}
              style={inp}
              placeholder="Search crew..."
              autoComplete="off"
            />
            {showSugg && (() => {
              const q = searchVal.toLowerCase()
              const matches = crewList.filter(c => q && (c.full_name || '').toLowerCase().includes(q)).slice(0, 6)
              if (matches.length === 0) return null
              return (
                <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, overflow: 'hidden' }}>
                  {matches.map(cm => (
                    <div key={cm.id}
                      onMouseDown={() => onSelect(cm)}
                      style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}
                      onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ flex: 1, fontWeight: '600', color: '#0f172a' }}>{cm.full_name}</span>
                      {cm.department && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{cm.department}</span>}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
        {notFound && !crewIdVal && searchVal && (
          <div style={{ marginTop: '4px', padding: '6px 10px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '11px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠ Driver not found in crew list.</span>
            <a href="/dashboard/crew" target="_blank" style={{ color: '#1d4ed8', fontWeight: '700', textDecoration: 'none' }}>+ Add to crew →</a>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '440px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🔑 New Rental Vehicle' : '✏️ Edit Rental Vehicle'}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Vehicle ID */}
            <div style={fld}>
              <label style={lbl}>Vehicle ID *</label>
              <input value={form.id} onChange={e => { setIdManuallyEdited(true); set('id', e.target.value.toUpperCase()) }}
                style={{ ...inp, fontWeight: '800', fontSize: '15px', letterSpacing: '0.05em', background: mode === 'edit' ? '#f8fafc' : 'white' }}
                placeholder="CAR-01 / VAN-05" required readOnly={mode === 'edit'} />
            </div>

            {/* Vehicle Type */}
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

            {/* Vehicle Class */}
            <div style={fld}>
              <label style={lbl}>Vehicle Class</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => set('vehicle_class', [])}
                  style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${form.vehicle_class.length === 0 ? '#0f2340' : '#e2e8f0'}`, background: form.vehicle_class.length === 0 ? '#0f2340' : 'white', color: form.vehicle_class.length === 0 ? 'white' : '#94a3b8' }}>
                  None
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

            {/* Brand + Model + Plate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Brand</label>
                <input value={form.rental_brand} onChange={e => set('rental_brand', e.target.value)} style={inp} placeholder="Toyota, Peugeot..." />
              </div>
              <div>
                <label style={lbl}>Model</label>
                <input value={form.rental_model} onChange={e => set('rental_model', e.target.value)} style={inp} placeholder="C-HR, 2008..." />
              </div>
            </div>
            <div style={fld}>
              <label style={lbl}>License Plate</label>
              <input value={form.license_plate} onChange={e => set('license_plate', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.1em' }} placeholder="AB123CD" />
            </div>

            {/* ── RENTAL SECTION ── */}
            {!compactMode && <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '9px', border: '1px solid #fde68a', background: '#fefce8' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#a16207', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔑 Rental Details</div>

              {/* Supplier */}
              <div style={fld}>
                <label style={{ ...lbl, color: '#a16207' }}>Supplier *</label>
                <select value={form.rental_supplier_id} onChange={e => { set('rental_supplier_id', e.target.value); set('rental_pickup_location_id', ''); set('rental_dropoff_location_id', ''); set('rental_voucher_id', '') }} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Status */}
              <div style={fld}>
                <label style={{ ...lbl, color: '#a16207' }}>Status</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['OPEN', 'CLOSED'].map(s => (
                    <button key={s} type="button" onClick={() => set('rental_status', s)}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid',
                        ...(form.rental_status === s
                          ? s === 'OPEN'
                            ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }
                            : { background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }
                          : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                      {s === 'OPEN' ? '🟢 Open' : '⚫ Closed'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Rental Start *</label>
                  <input type="date" value={form.rental_start} onChange={e => set('rental_start', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Rental End *</label>
                  <input type="date" value={form.rental_end} onChange={e => set('rental_end', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} />
                </div>
              </div>
              {days > 0 && <div style={{ marginBottom: '12px', padding: '6px 10px', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', fontSize: '11px', color: '#a16207', fontWeight: '700' }}>📅 {days} day{days !== 1 ? 's' : ''}</div>}

              {/* Billing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Billing Unit</label>
                  <select value={form.rental_billing_unit} onChange={e => set('rental_billing_unit', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                    <option value="DAY">Day</option>
                    <option value="MONTH">Month</option>
                    <option value="WEEK">Week</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Rate (no VAT)</label>
                  <input type="number" step="0.01" value={form.rental_daily_rate} onChange={e => set('rental_daily_rate', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>VAT %</label>
                  <input type="number" step="0.01" value={form.rental_vat_pct} onChange={e => set('rental_vat_pct', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="22" />
                </div>
              </div>

              {/* Currency */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Currency</label>
                  <select value={form.rental_currency} onChange={e => set('rental_currency', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Contract No.</label>
                  <input value={form.rental_contract_no} onChange={e => set('rental_contract_no', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} placeholder="Contract reference..." />
                </div>
              </div>

              {/* Cost preview */}
              {totalNoVat > 0 && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', fontSize: '11px', color: '#92400e' }}>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>No VAT: <strong>{form.rental_currency} {totalNoVat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></span>
                    {vatPct > 0 && <span>+ VAT: <strong>{form.rental_currency} {totalVat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></span>}
                    {extrasTotal > 0 && <span>Extras: <strong>{form.rental_currency} {extrasTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></span>}
                  </div>
                </div>
              )}

              {/* Extras */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ ...lbl, color: '#a16207' }}>Extras</label>
                {(form.rental_extras || []).map((ex, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: '6px', marginBottom: '4px' }}>
                    <input value={ex.label} onChange={e => { const next = [...form.rental_extras]; next[idx] = { ...next[idx], label: e.target.value }; set('rental_extras', next) }} style={{ ...inp, fontSize: '12px', borderColor: '#fde68a' }} placeholder="Insurance, GPS..." />
                    <input type="number" step="0.01" value={ex.amount} onChange={e => { const next = [...form.rental_extras]; next[idx] = { ...next[idx], amount: e.target.value }; set('rental_extras', next) }} style={{ ...inp, fontSize: '12px', fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.00" />
                    <button type="button" onClick={() => set('rental_extras', form.rental_extras.filter((_, i) => i !== idx))}
                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => set('rental_extras', [...(form.rental_extras || []), { label: '', amount: '' }])}
                  style={{ width: '100%', padding: '5px', borderRadius: '7px', border: '1px dashed #fde68a', background: 'transparent', color: '#a16207', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  + Add Extra
                </button>
              </div>

              {/* Voucher */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Voucher</label>
                  <select value={form.rental_voucher_id} onChange={e => set('rental_voucher_id', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                    <option value="">— No voucher —</option>
                    {vouchers.map(v => <option key={v.id} value={v.id}>{v.voucher_no}{v.batch_code ? ` (${v.batch_code})` : ''}{v.amount ? ` — ${v.currency} ${v.amount}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>P.O. Number</label>
                  <input value={form.rental_po_number} onChange={e => set('rental_po_number', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} placeholder="P.O. ref..." />
                </div>
              </div>
              <div style={fld}>
                <label style={{ ...lbl, color: '#a16207' }}>Invoice No.</label>
                <input value={form.rental_invoice_no} onChange={e => set('rental_invoice_no', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} placeholder="Invoice number..." />
              </div>
            </div>}

            {/* ── DRIVER SECTION ── */}
            <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '9px', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 Driver</div>
              <DriverField
                label="Driver *"
                nameVal={form.driver_name}
                crewIdVal={form.driver_crew_id}
                searchVal={driverSearch}
                setSearch={v => { setDriverSearch(v); if (!form.driver_crew_id) set('driver_name', v) }}
                showSugg={showDriverSugg}
                setShowSugg={setShowDriverSugg}
                notFound={driverNotFound}
                setNotFound={setDriverNotFound}
                onSelect={cm => { setForm(f => ({ ...f, driver_name: cm.full_name, driver_crew_id: cm.id, driver_dept: cm.department || '' })); setDriverSearch(cm.full_name); setShowDriverSugg(false); setDriverNotFound(false) }}
                onClear={() => { setForm(f => ({ ...f, driver_name: '', driver_crew_id: '', driver_dept: '' })); setDriverSearch(''); setDriverNotFound(false) }}
              />
              <DriverField
                label="Second Driver"
                nameVal={form.rental_second_driver}
                crewIdVal={form.rental_second_driver_crew_id}
                searchVal={driver2Search}
                setSearch={v => { setDriver2Search(v); if (!form.rental_second_driver_crew_id) set('rental_second_driver', v) }}
                showSugg={showDriver2Sugg}
                setShowSugg={setShowDriver2Sugg}
                notFound={driver2NotFound}
                setNotFound={setDriver2NotFound}
                onSelect={cm => { setForm(f => ({ ...f, rental_second_driver: cm.full_name, rental_second_driver_crew_id: cm.id })); setDriver2Search(cm.full_name); setShowDriver2Sugg(false); setDriver2NotFound(false) }}
                onClear={() => { setForm(f => ({ ...f, rental_second_driver: '', rental_second_driver_crew_id: '' })); setDriver2Search(''); setDriver2NotFound(false) }}
              />
            </div>

            {/* ── LOCATIONS SECTION ── */}
            {locations.length > 0 && (
              <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Pick-up / Drop-off</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={lbl}>Pick-up Location</label>
                    <select value={form.rental_pickup_location_id} onChange={e => set('rental_pickup_location_id', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">— Select —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Drop-off Location</label>
                    <select value={form.rental_dropoff_location_id} onChange={e => set('rental_dropoff_location_id', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">— Select —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── INSURANCE SECTION ── */}
            {!compactMode && <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🛡 Insurance</div>
              <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${form.rental_insurance_casco ? '#c4b5fd' : '#e2e8f0'}`, background: form.rental_insurance_casco ? '#ede9fe' : 'white', cursor: 'pointer' }}
                onClick={() => set('rental_insurance_casco', !form.rental_insurance_casco)}>
                <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.rental_insurance_casco ? '#7c3aed' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', left: form.rental_insurance_casco ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: form.rental_insurance_casco ? '#5b21b6' : '#64748b' }}>
                  Comprehensive Coverage (Full Casco)
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#7e22ce' }}>Coverage Limit</label>
                  <input type="number" step="0.01" value={form.rental_insurance_limit} onChange={e => set('rental_insurance_limit', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#e9d5ff' }} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#7e22ce' }}>Excess</label>
                  <input type="number" step="0.01" value={form.rental_insurance_excess} onChange={e => set('rental_insurance_excess', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#e9d5ff' }} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#7e22ce' }}>Exp. Date</label>
                  <input type="date" value={form.rental_insurance_exp} onChange={e => set('rental_insurance_exp', e.target.value)} style={{ ...inp, borderColor: '#e9d5ff' }} />
                </div>
              </div>
            </div>}

            {/* Sign Code + Unit Default */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Sign Code</label>
                <input value={form.sign_code || ''} onChange={e => set('sign_code', e.target.value)} style={inp} placeholder="GRIP1, PROD2…" />
              </div>
              <div>
                <label style={lbl}>Unit Default</label>
                <input value={form.unit_default || ''} onChange={e => set('unit_default', e.target.value)} style={inp} placeholder="MAIN, SECOND…" />
              </div>
            </div>

            {/* ── PREFERENZE ASSEGNAZIONE (solo compactMode = Fleet tab) ── */}
            {compactMode && (
              <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '10px' }}>⭐ Preferenze Assegnazione</div>

                {/* Preferred Dept */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={lbl}>Dept Preferito</label>
                  <select value={form.preferred_dept || ''} onChange={e => set('preferred_dept', e.target.value || '')}
                    style={{ ...inp, background: form.preferred_dept ? ((DEPT_COLOR[form.preferred_dept] || {}).bg || 'white') : 'white', color: form.preferred_dept ? ((DEPT_COLOR[form.preferred_dept] || {}).color || '#0f172a') : '#94a3b8', fontWeight: form.preferred_dept ? '700' : '400' }}>
                    <option value="">— Nessun dept preferito —</option>
                    {[...new Set(crewList.map(c => c.department).filter(Boolean))].sort().map(d => <option key={d} value={d}>{d}</option>)}
                    {form.preferred_dept && ![...new Set(crewList.map(c => c.department).filter(Boolean))].includes(form.preferred_dept) && (
                      <option value={form.preferred_dept}>{form.preferred_dept}</option>
                    )}
                  </select>
                </div>

                {/* Preferred Crew Multi-Select */}
                <div>
                  <label style={lbl}>Crew Preferiti</label>
                  {form.preferred_crew_ids.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                      {form.preferred_crew_ids.map(cid => {
                        const cm = crewList.find(c => c.id === cid)
                        if (!cm) return null
                        return (
                          <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            {cm.full_name}
                            <button type="button" onClick={() => setForm(f => ({ ...f, preferred_crew_ids: f.preferred_crew_ids.filter(x => x !== cid) }))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: '0', lineHeight: 1, marginLeft: '2px' }}>✕</button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px', background: 'white' }}>
                    {crewList.map(cm => {
                      const sel = form.preferred_crew_ids.includes(cm.id)
                      return (
                        <div key={cm.id}
                          onClick={() => setForm(f => ({ ...f, preferred_crew_ids: sel ? f.preferred_crew_ids.filter(x => x !== cm.id) : [...f.preferred_crew_ids, cm.id] }))}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', cursor: 'pointer', background: sel ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '13px', flexShrink: 0 }}>{sel ? '✅' : '⬜'}</span>
                          <span style={{ fontSize: '11px', fontWeight: sel ? '700' : '500', color: sel ? '#1d4ed8' : '#0f172a', flex: 1 }}>{cm.full_name}</span>
                          {cm.department && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{cm.department}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* KM + Notes */}
            {!compactMode && <div style={fld}>
              <label style={lbl}>KM Included</label>
              <input value={form.rental_km_included} onChange={e => set('rental_km_included', e.target.value)} style={inp} placeholder="Unlimited, 500/day..." />
            </div>}
            <div style={fld}>
              <label style={lbl}>Notes</label>
              <textarea value={form.rental_notes} onChange={e => set('rental_notes', e.target.value)} style={{ ...inp, minHeight: '60px', resize: 'vertical' }} placeholder="Additional notes..." />
            </div>

            {/* Delete */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    Delete Rental Vehicle
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this vehicle? This cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)}
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
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Rental Vehicle' : 'Save Changes'}
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
  const [rentalSidebarOpen, setRentalSidebarOpen]     = useState(false)
  const [rentalSidebarMode, setRentalSidebarMode]     = useState('new')
  const [rentalTarget, setRentalTarget]               = useState(null)
  const [rentalInitialSupplier, setRentalInitialSupplier] = useState(null)
  const [allVehicles, setAllVehicles]                 = useState([])

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

  function openNewRental(supplierId) {
    setRentalSidebarMode('new')
    setRentalTarget(null)
    setRentalInitialSupplier(supplierId || null)
    setRentalSidebarOpen(true)
  }
  function openEditRental(v) {
    setRentalSidebarMode('edit')
    setRentalTarget(v)
    setRentalInitialSupplier(null)
    setRentalSidebarOpen(true)
  }
  function onRentalSaved() { setRentalSidebarOpen(false); load() }

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles').select('id').eq('production_id', productionId)
      .then(({ data }) => setAllVehicles(data || []))
  }, [productionId])

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
          <button onClick={() => openNewRental(s.id)} style={{ marginTop: '10px', width: '100%', padding: '6px', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px', background: 'none', color: '#64748b', cursor: 'pointer' }}>
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
      <RentalVehicleSidebar
        open={rentalSidebarOpen}
        mode={rentalSidebarMode}
        initial={rentalTarget}
        onClose={() => setRentalSidebarOpen(false)}
        onSaved={onRentalSaved}
        productionId={productionId}
        crewList={[]}
        vehicles={allVehicles}
        initialSupplierId={rentalInitialSupplier}
      />
    </div>
  )
}

// ─── NccAgencySidebar ─────────────────────────────────────────
function NccAgencySidebar({ open, mode, initial, onClose, onSaved, productionId, openTriggerRef }) {
  const EMPTY = { name: '', contact_name: '', phone: '', email: '', address: '', vat_no: '', notes: '' }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setCd] = useState(false)
  const [deleting, setDel]  = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (openTriggerRef) openTriggerRef.current = () => {
      setForm(EMPTY); setError(null); setCd(false)
    }
  }, [openTriggerRef])

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false)
    if (mode === 'edit' && initial) {
      setForm({
        name:         initial.name         || '',
        contact_name: initial.contact_name || '',
        phone:        initial.phone        || '',
        email:        initial.email        || '',
        address:      initial.address      || '',
        vat_no:       initial.vat_no       || '',
        notes:        initial.notes        || '',
      })
    } else { setForm(EMPTY) }
  }, [open, mode, initial])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const row = {
      production_id: productionId,
      name:          form.name.trim(),
      contact_name:  form.contact_name.trim() || null,
      phone:         form.phone.trim()        || null,
      email:         form.email.trim()        || null,
      address:       form.address.trim()      || null,
      vat_no:        form.vat_no.trim()       || null,
      notes:         form.notes.trim()        || null,
    }
    let err
    if (mode === 'new') { const r = await supabase.from('ncc_agencies').insert(row); err = r.error }
    else { const r = await supabase.from('ncc_agencies').update(row).eq('id', initial.id); err = r.error }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error } = await supabase.from('ncc_agencies').delete().eq('id', initial.id)
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
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>{mode === 'new' ? '🏢 New NCC Agency' : '✏️ Edit NCC Agency'}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>
            <div style={fld}>
              <label style={lbl}>Agency Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Rossi NCC, Bari Transfer..." required />
            </div>
            <div style={fld}>
              <label style={lbl}>P.IVA / VAT No.</label>
              <input value={form.vat_no} onChange={e => set('vat_no', e.target.value)} style={inp} placeholder="IT12345678901" />
            </div>
            <div style={{ marginBottom: '12px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📞 Contact</div>
              <div style={fld}>
                <label style={lbl}>Contact Name</label>
                <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} style={inp} placeholder="Mario Rossi" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp} placeholder="+39 080..." type="tel" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} style={inp} placeholder="info@rossinct.it" type="email" />
                </div>
              </div>
              <div style={fld}>
                <label style={lbl}>Address</label>
                <input value={form.address} onChange={e => set('address', e.target.value)} style={inp} placeholder="Via Roma 1, Bari" />
              </div>
            </div>
            <div style={fld}>
              <label style={lbl}>Note</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: '70px', resize: 'vertical' }} placeholder="Additional notes..." />
            </div>
            {mode === 'new' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                <div style={{ fontSize: '11px', color: '#0369a1', lineHeight: 1.5 }}>
                  Save the agency first — then you can add NCC vehicles and service orders.
                </div>
              </div>
            )}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>Delete Agency</button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this agency? Cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>{deleting ? '...' : 'Confirm Delete'}</button>
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
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Agency' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── NccOrderSidebar ──────────────────────────────────────────
function NccOrderSidebar({ open, mode, initial, onClose, onSaved, productionId, agencyId }) {
  const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF']
  const EMPTY = {
    agency_id: agencyId || '',
    vehicle_id: '',
    order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
    service_type: 'TRANSFER',
    description: '',
    status: 'CONFIRMED',
    driver_name: '',
    driver_phone: '',
    vehicle_type_requested: 'VAN',
    vehicle_plate_actual: '',
    km_start: '', km_end: '',
    rate_type: 'FIXED',
    rate_amount: '',
    rate_currency: 'EUR',
    hours_worked: '',
    extras: [],
    amount_net: '',
    vat_pct: '',
    amount_total: '',
    invoice_no: '',
    po_number: '',
    notes: '',
  }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setCd] = useState(false)
  const [deleting, setDel]  = useState(false)
  const [vehicles, setVehicles] = useState([])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open || !productionId) return
    setError(null); setCd(false)
    supabase.from('vehicles').select('id, vehicle_type, ncc_agency_id').eq('production_id', productionId).eq('is_ncc', true).order('id')
      .then(({ data }) => setVehicles(data || []))
    if (mode === 'edit' && initial) {
      setForm({
        agency_id:             initial.agency_id             || agencyId || '',
        vehicle_id:            initial.vehicle_id            || '',
        order_date:            initial.order_date            || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
        service_type:          initial.service_type          || 'TRANSFER',
        description:           initial.description           || '',
        status:                initial.status                || 'CONFIRMED',
        driver_name:           initial.driver_name           || '',
        driver_phone:          initial.driver_phone          || '',
        vehicle_type_requested: initial.vehicle_type_requested || 'VAN',
        vehicle_plate_actual:  initial.vehicle_plate_actual  || '',
        km_start:              initial.km_start              ?? '',
        km_end:                initial.km_end                ?? '',
        rate_type:             initial.rate_type             || 'FIXED',
        rate_amount:           initial.rate_amount           ?? '',
        rate_currency:         initial.rate_currency         || 'EUR',
        hours_worked:          initial.hours_worked          ?? '',
        extras:                Array.isArray(initial.extras) ? initial.extras : [],
        amount_net:            initial.amount_net            ?? '',
        vat_pct:               initial.vat_pct               ?? '',
        amount_total:          initial.amount_total          ?? '',
        invoice_no:            initial.invoice_no            || '',
        po_number:             initial.po_number             || '',
        notes:                 initial.notes                 || '',
      })
    } else {
      setForm({ ...EMPTY, agency_id: agencyId || '', order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) })
    }
  }, [open, mode, initial, agencyId])

  const kmTotal = form.km_end !== '' && form.km_start !== '' ? Math.max(0, parseFloat(form.km_end) - parseFloat(form.km_start)) : null
  const extrasTotal = (form.extras || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const computedNet = (() => {
    if (form.amount_net !== '') return parseFloat(form.amount_net) || 0
    const rate = parseFloat(form.rate_amount) || 0
    const hours = parseFloat(form.hours_worked) || 0
    if (form.rate_type === 'HOURLY' && rate > 0 && hours > 0) return rate * hours
    if (form.rate_type === 'KM' && rate > 0 && kmTotal > 0) return rate * kmTotal
    return rate
  })()
  const computedTotal = computedNet > 0 && form.vat_pct !== ''
    ? computedNet * (1 + parseFloat(form.vat_pct) / 100)
    : computedNet

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.agency_id) { setError('Agency is required'); return }
    if (!form.order_date) { setError('Date is required'); return }
    setSaving(true)
    const row = {
      production_id:          productionId,
      agency_id:              form.agency_id,
      vehicle_id:             form.vehicle_id || null,
      order_date:             form.order_date,
      service_type:           form.service_type || 'TRANSFER',
      description:            form.description.trim() || null,
      status:                 form.status || 'CONFIRMED',
      driver_name:            form.driver_name.trim() || null,
      driver_phone:           form.driver_phone.trim() || null,
      vehicle_type_requested: form.vehicle_type_requested || null,
      vehicle_plate_actual:   form.vehicle_plate_actual.trim().toUpperCase() || null,
      km_start:               form.km_start !== '' ? parseFloat(form.km_start) : null,
      km_end:                 form.km_end   !== '' ? parseFloat(form.km_end)   : null,
      rate_type:              form.rate_type || 'FIXED',
      rate_amount:            form.rate_amount !== '' ? parseFloat(form.rate_amount) : null,
      rate_currency:          form.rate_currency || 'EUR',
      hours_worked:           form.hours_worked !== '' ? parseFloat(form.hours_worked) : null,
      extras:                 form.extras.length > 0 ? form.extras : [],
      amount_net:             form.amount_net !== '' ? parseFloat(form.amount_net) : (computedNet || null),
      vat_pct:                form.vat_pct !== '' ? parseFloat(form.vat_pct) : null,
      amount_total:           form.amount_total !== '' ? parseFloat(form.amount_total) : (computedTotal || null),
      invoice_no:             form.invoice_no.trim() || null,
      po_number:              form.po_number.trim()  || null,
      notes:                  form.notes.trim()      || null,
    }
    let err
    if (mode === 'new') { const r = await supabase.from('ncc_orders').insert(row); err = r.error }
    else { const r = await supabase.from('ncc_orders').update(row).eq('id', initial.id); err = r.error }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error } = await supabase.from('ncc_orders').delete().eq('id', initial.id)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }
  const SERVICE_TYPES = ['TRANSFER', 'DAY', 'HOURLY', 'OTHER']
  const RATE_TYPES = ['FIXED', 'HOURLY', 'KM', 'DAILY']
  const STATUS_TYPES = ['PENDING', 'CONFIRMED', 'DONE', 'CANCELLED']

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '440px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>{mode === 'new' ? '📋 New NCC Order' : '✏️ Edit NCC Order'}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Data + Service Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Date *</label>
                <input type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>Service Type</label>
                <select value={form.service_type} onChange={e => set('service_type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            <div style={fld}>
              <label style={lbl}>Status</label>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {STATUS_TYPES.map(s => {
                  const active = form.status === s
                  const colors = s === 'CONFIRMED' ? { bg: '#f0fdf4', color: '#15803d', border: '#86efac' }
                    : s === 'DONE'      ? { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
                    : s === 'PENDING'   ? { bg: '#fefce8', color: '#a16207', border: '#fde68a' }
                    : { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
                  return (
                    <button key={s} type="button" onClick={() => set('status', s)}
                      style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? colors.border : '#e2e8f0'}`, background: active ? colors.bg : 'white', color: active ? colors.color : '#94a3b8' }}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Description */}
            <div style={fld}>
              <label style={lbl}>Description</label>
              <input value={form.description} onChange={e => set('description', e.target.value)} style={inp} placeholder="BRI Airport → Hotel Excelsior..." />
            </div>

            {/* Veicolo collegato */}
            <div style={fld}>
              <label style={lbl}>NCC Vehicle (Fleet)</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">— No vehicle linked —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} ({v.vehicle_type})</option>)}
              </select>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Link to an NCC vehicle already in fleet (optional)</div>
            </div>

            {/* Driver + Targa */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #bae6fd', background: '#f0f9ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369a1', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 Driver / Vehicle Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>Driver Name</label>
                  <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)} style={{ ...inp, borderColor: '#bae6fd' }} placeholder="Mario Rossi" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>Driver Phone</label>
                  <input value={form.driver_phone} onChange={e => set('driver_phone', e.target.value)} style={{ ...inp, borderColor: '#bae6fd' }} placeholder="+39 333..." type="tel" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>Vehicle Type Requested</label>
                  <select value={form.vehicle_type_requested} onChange={e => set('vehicle_type_requested', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#bae6fd', background: 'white' }}>
                    {['VAN', 'CAR', 'BUS', 'TRUCK', 'PICKUP', 'CARGO'].map(t => <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#0369a1' }}>Actual Plate</label>
                  <input value={form.vehicle_plate_actual} onChange={e => set('vehicle_plate_actual', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace', fontWeight: '700', borderColor: '#bae6fd' }} placeholder="AB123CD" />
                </div>
              </div>
            </div>

            {/* KM */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Mileage</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={lbl}>KM Start</label>
                  <input type="number" step="0.1" value={form.km_start} onChange={e => set('km_start', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>KM End</label>
                  <input type="number" step="0.1" value={form.km_end} onChange={e => set('km_end', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>KM Total</label>
                  <div style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', fontWeight: '700', color: kmTotal > 0 ? '#0f172a' : '#cbd5e1', background: '#f8fafc' }}>
                    {kmTotal !== null ? kmTotal.toFixed(1) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Costi */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #fde68a', background: '#fefce8' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#a16207', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💰 Costs</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Rate Type</label>
                  <select value={form.rate_type} onChange={e => set('rate_type', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                    {RATE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Rate</label>
                  <input type="number" step="0.01" value={form.rate_amount} onChange={e => set('rate_amount', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.00" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Currency</label>
                  <select value={form.rate_currency} onChange={e => set('rate_currency', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: '#fde68a', background: 'white' }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Hours Worked</label>
                  <input type="number" step="0.25" value={form.hours_worked} onChange={e => set('hours_worked', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.0" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>VAT %</label>
                  <input type="number" step="0.01" value={form.vat_pct} onChange={e => set('vat_pct', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="22" />
                </div>
              </div>

              {/* Extras */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ ...lbl, color: '#a16207' }}>Extras</label>
                {(form.extras || []).map((ex, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: '6px', marginBottom: '4px' }}>
                    <input value={ex.label} onChange={e => { const next = [...form.extras]; next[idx] = { ...next[idx], label: e.target.value }; set('extras', next) }} style={{ ...inp, fontSize: '12px', borderColor: '#fde68a' }} placeholder="Pedaggio, parcheggio..." />
                    <input type="number" step="0.01" value={ex.amount} onChange={e => { const next = [...form.extras]; next[idx] = { ...next[idx], amount: e.target.value }; set('extras', next) }} style={{ ...inp, fontSize: '12px', fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.00" />
                    <button type="button" onClick={() => set('extras', form.extras.filter((_, i) => i !== idx))} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => set('extras', [...(form.extras || []), { label: '', amount: '' }])}
                  style={{ width: '100%', padding: '5px', borderRadius: '7px', border: '1px dashed #fde68a', background: 'transparent', color: '#a16207', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  + Add Extra
                </button>
              </div>

              {/* Importi manuali override */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Net Amount (override)</label>
                  <input type="number" step="0.01" value={form.amount_net} onChange={e => set('amount_net', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder={computedNet > 0 ? computedNet.toFixed(2) : '0.00'} />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Total (override)</label>
                  <input type="number" step="0.01" value={form.amount_total} onChange={e => set('amount_total', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder={computedTotal > 0 ? computedTotal.toFixed(2) : '0.00'} />
                </div>
              </div>

              {/* Preview */}
              {computedNet > 0 && (
                <div style={{ padding: '8px 10px', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', fontSize: '11px', color: '#92400e' }}>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>Net: <strong>{form.rate_currency} {computedNet.toFixed(2)}</strong></span>
                    {form.vat_pct && <span>+ VAT: <strong>{form.rate_currency} {computedTotal.toFixed(2)}</strong></span>}
                    {extrasTotal > 0 && <span>Extras: <strong>{form.rate_currency} {extrasTotal.toFixed(2)}</strong></span>}
                  </div>
                </div>
              )}
            </div>

            {/* Fatturazione */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
              <label style={lbl}>Invoice No.</label>
                <input value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} style={inp} placeholder="FT-2026-001" />
              </div>
              <div>
                <label style={lbl}>P.O. Number</label>
                <input value={form.po_number} onChange={e => set('po_number', e.target.value)} style={inp} placeholder="P.O. ref..." />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: '60px', resize: 'vertical' }} placeholder="Additional notes..." />
            </div>

            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>Delete Order</button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this order? Cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>{deleting ? '...' : 'Confirm Delete'}</button>
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
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Order' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── NccTab ───────────────────────────────────────────────────
function NccTab({ productionId, isMobile, openTriggerRef, onEditVehicle, reloadTrigger = 0 }) {
  const [agencies, setAgencies]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [agencySidebarOpen, setAgencySidebarOpen] = useState(false)
  const [agencySidebarMode, setAgencySidebarMode] = useState('new')
  const [agencyTarget, setAgencyTarget] = useState(null)
  const [orderSidebarOpen, setOrderSidebarOpen] = useState(false)
  const [orderSidebarMode, setOrderSidebarMode] = useState('new')
  const [orderTarget, setOrderTarget]   = useState(null)
  const [orderAgencyId, setOrderAgencyId] = useState(null)
  const [expandedAgency, setExpandedAgency] = useState(new Set())
  const [orders, setOrders]             = useState({}) // agencyId → orders[]
  const [nccVehicleSidebarOpen, setNccVehicleSidebarOpen] = useState(false)
  const [nccVehicleSidebarAgencyId, setNccVehicleSidebarAgencyId] = useState(null)
  const [allVehicles, setAllVehicles]   = useState([])

  const [drivers, setDrivers] = useState({})  // agencyId → drivers[]
  const [driverSidebarOpen, setDriverSidebarOpen] = useState(false)
  const [driverSidebarMode, setDriverSidebarMode] = useState('new')
  const [driverTarget, setDriverTarget] = useState(null)
  const [driverAgencyId, setDriverAgencyId] = useState(null)

  async function loadDrivers(agencyId) {
    const { data } = await supabase
      .from('ncc_drivers')
      .select('id, name, phone, tracking_token, token_type, is_active, notes')
      .eq('agency_id', agencyId)
      .eq('production_id', productionId)
      .order('name')
    setDrivers(prev => ({ ...prev, [agencyId]: data || [] }))
  }

  function openNewDriver(agencyId) { setDriverSidebarMode('new'); setDriverTarget(null); setDriverAgencyId(agencyId); setDriverSidebarOpen(true) }
  function openEditDriver(d) { setDriverSidebarMode('edit'); setDriverTarget(d); setDriverAgencyId(d.agency_id); setDriverSidebarOpen(true) }
  function onDriverSaved() { setDriverSidebarOpen(false); if (driverAgencyId) loadDrivers(driverAgencyId) }

  async function loadOrders(agencyId) {
    const { data } = await supabase
      .from('ncc_orders')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('production_id', productionId)
      .order('order_date', { ascending: false })
    setOrders(prev => ({ ...prev, [agencyId]: data || [] }))
  }

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const [{ data }, { data: allV }] = await Promise.all([
      supabase
        .from('ncc_agencies')
        .select(`id, name, contact_name, phone, email, address, vat_no, notes,
          vehicles:vehicles(uuid, id, display_id, vehicle_type, ncc_driver_name, ncc_driver_phone, ncc_driver_id, license_plate, capacity, active, is_ncc, ncc_agency_id, available_from, available_to, pax_suggested, pax_max, sign_code, unit_default, preferred_dept, preferred_crew_ids)`)
        .eq('production_id', productionId)
        .order('name'),
      supabase.from('vehicles').select('id').eq('production_id', productionId),
    ])
    const agencyList = data || []
    setAgencies(agencyList)
    setAllVehicles(allV || [])
    setExpandedAgency(new Set(agencyList.map(a => a.id)))
    await Promise.all(agencyList.map(a => loadOrders(a.id)))
    await Promise.all(agencyList.map(a => loadDrivers(a.id)))
    setLoading(false)
  }, [productionId])

  function toggleAgency(id) {
    setExpandedAgency(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
    if (!orders[id]) loadOrders(id)
  }

  function openNewAgency()   { setAgencySidebarMode('new');  setAgencyTarget(null);    setAgencySidebarOpen(true) }
  function openEditAgency(a) { setAgencySidebarMode('edit'); setAgencyTarget(a);       setAgencySidebarOpen(true) }
  function onAgencySaved()   { setAgencySidebarOpen(false);  load() }

  function openNewOrder(agencyId) { setOrderSidebarMode('new'); setOrderTarget(null); setOrderAgencyId(agencyId); setOrderSidebarOpen(true) }
  function openEditOrder(o)       { setOrderSidebarMode('edit'); setOrderTarget(o);   setOrderAgencyId(o.agency_id); setOrderSidebarOpen(true) }
  function onOrderSaved()         { setOrderSidebarOpen(false); if (orderAgencyId) loadOrders(orderAgencyId) }

  useEffect(() => { load() }, [load, reloadTrigger])
  useEffect(() => { if (openTriggerRef) openTriggerRef.current = openNewAgency }, [openTriggerRef])

  function fmtDate(s) {
    if (!s) return '—'
    return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  function statusColor(s) {
    if (s === 'CONFIRMED') return { bg: '#f0fdf4', color: '#15803d', border: '#86efac' }
    if (s === 'DONE')      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
    if (s === 'PENDING')   return { bg: '#fefce8', color: '#a16207', border: '#fde68a' }
    return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading...</div>

  if (agencies.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏢</div>
      <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No NCC agencies yet</div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Click + Add Agency to get started</div>
      <button onClick={openNewAgency} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Add Agency</button>
      <NccAgencySidebar open={agencySidebarOpen} mode={agencySidebarMode} initial={agencyTarget} onClose={() => setAgencySidebarOpen(false)} onSaved={onAgencySaved} productionId={productionId} />
    </div>
  )

  const grandTotal = Object.values(orders).flat().reduce((s, o) => s + (parseFloat(o.amount_total) || 0), 0)

  return (
    <div>
      {/* Summary bar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', color: '#374151' }}>Agencies: <span style={{ fontWeight: '800', color: '#0f172a' }}>{agencies.length}</span></div>
        <div style={{ fontSize: '12px', color: '#374151' }}>Orders loaded: <span style={{ fontWeight: '800', color: '#0f2340' }}>{Object.values(orders).flat().length}</span></div>
        {grandTotal > 0 && <div style={{ fontSize: '12px', color: '#374151' }}>Total spend: <span style={{ fontWeight: '800', color: '#dc2626', fontFamily: 'monospace' }}>EUR {grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span></div>}
      </div>

      {/* Agency cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {agencies.map(a => {
          const isExpanded = expandedAgency.has(a.id)
          const agencyOrders = orders[a.id] || []
          const agencyTotal = agencyOrders.reduce((s, o) => s + (parseFloat(o.amount_total) || 0), 0)
          const nccVehicles = (a.vehicles || []).filter(v => v.active)

          return (
            <div key={a.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: '3px solid #0369a1', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => toggleAgency(a.id)}>
                <span style={{ fontSize: '20px' }}>🏢</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '3px' }}>{a.name}</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: '#64748b' }}>
                    {a.contact_name  && <span>👤 {a.contact_name}</span>}
                    {a.phone         && <span>📞 {a.phone}</span>}
                    {a.email         && <span>📧 {a.email}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: '700' }}>
                    {nccVehicles.length} vehicle{nccVehicles.length !== 1 ? 's' : ''}
                  </span>
                  {agencyOrders.length > 0 && (
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>
                      {agencyOrders.length} order{agencyOrders.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {agencyTotal > 0 && (
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: '700', color: '#dc2626' }}>
                      EUR {agencyTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  <button type="button" onClick={e => { e.stopPropagation(); openEditAgency(a) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '0 4px' }}>✎</button>
                  <span style={{ color: '#94a3b8', fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                </div>
              </div>

              {/* Expanded: veicoli + ordini */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px', background: '#f8fafc' }}>

                  {/* Drivers NCC */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>👤 Drivers</div>
                    {(drivers[a.id] || []).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                        {(drivers[a.id] || []).map(d => (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'white', border: '1px solid #e9d5ff', borderRadius: '8px' }}>
                            <span style={{ fontSize: '16px' }}>👤</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{d.name}</div>
                              {d.phone && <div style={{ fontSize: '11px', color: '#64748b' }}>📱 {d.phone}</div>}
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '999px', background: d.is_active ? '#f0fdf4' : '#f1f5f9', color: d.is_active ? '#15803d' : '#94a3b8', border: `1px solid ${d.is_active ? '#86efac' : '#e2e8f0'}` }}>
                              {d.is_active ? '🟢 Active' : '⚫ Inactive'}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); openEditDriver(d) }}
                              style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#7e22ce', flexShrink: 0 }}>
                              ✎
                            </button>
                            <a
                              href={`https://wa.me/${(d.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Ciao ${d.name}, ecco il tuo link CaptainDispatch:\nhttps://captaindispatch.com/go/${d.tracking_token}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#15803d', flexShrink: 0, textDecoration: 'none' }}>
                              📱
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openNewDriver(a.id) }}
                      style={{ padding: '5px 14px', borderRadius: '7px', border: '1px dashed #e9d5ff', background: 'transparent', color: '#7e22ce', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                      + Add Driver
                    </button>
                  </div>

                  {/* Veicoli NCC in flotta */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>🚐 Vehicles in Fleet</div>
                    {nccVehicles.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                        {nccVehicles.map(v => (
                          <div key={v.id}
                            onClick={() => onEditVehicle && onEditVehicle(v)}
                            style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', background: 'white', border: '1px solid #bae6fd', borderRadius: '8px', cursor: onEditVehicle ? 'pointer' : 'default' }}
                            onMouseEnter={e => { if (onEditVehicle) e.currentTarget.style.background = '#f0f9ff' }}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '20px' }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '13px', color: '#0f2340' }}>{v.id}</span>
                              {v.capacity && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>× {v.capacity} pax</span>}
                            </div>
                            {v.license_plate && <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#374151', background: '#fafaf9', padding: '1px 7px', borderRadius: '5px', border: '1px solid #d4d4d4', letterSpacing: '0.08em', alignSelf: 'flex-start' }}>{v.license_plate}</span>}
                            {v.ncc_driver_name && <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '600' }}>👤 {v.ncc_driver_name}</span>}
                            {v.ncc_driver_phone && <span style={{ fontSize: '11px', color: '#64748b' }}>📞 {v.ncc_driver_phone}</span>}
                            {(v.available_from || v.available_to) && (
                              <span style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '2px 6px', alignSelf: 'flex-start' }}>
                                📅 {v.available_from ? fmtDate(v.available_from) : '∞'} → {v.available_to ? fmtDate(v.available_to) : '∞'}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setNccVehicleSidebarAgencyId(a.id); setNccVehicleSidebarOpen(true) }}
                      style={{ padding: '5px 14px', borderRadius: '7px', border: '1px dashed #bae6fd', background: 'transparent', color: '#0369a1', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                      + Add NCC Vehicle
                    </button>
                  </div>

                  {/* Ordini */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 Service Orders</div>
                    <button onClick={() => openNewOrder(a.id)}
                      style={{ padding: '4px 12px', borderRadius: '7px', border: '1px solid #0369a1', background: '#f0f9ff', color: '#0369a1', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                      + New Order
                    </button>
                  </div>

                  {agencyOrders.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>No orders yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {agencyOrders.map(o => {
                        const sc = statusColor(o.status)
                        return (
                          <div key={o.id} onClick={() => openEditOrder(o)}
                            style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `3px solid ${sc.border}`, borderRadius: '0 8px 8px 0', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f2340', minWidth: '80px' }}>{fmtDate(o.order_date)}</div>
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '999px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{o.status}</span>
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '5px', background: '#f1f5f9', color: '#475569', fontWeight: '600' }}>{o.service_type}</span>
                            {o.description && <span style={{ fontSize: '12px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</span>}
                            {o.driver_name && <span style={{ fontSize: '11px', color: '#64748b' }}>👤 {o.driver_name}</span>}
                            {o.vehicle_plate_actual && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#374151' }}>{o.vehicle_plate_actual}</span>}
                            {o.amount_total > 0 && <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', color: '#dc2626', marginLeft: 'auto' }}>EUR {parseFloat(o.amount_total).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <NccDriverSidebar open={driverSidebarOpen} mode={driverSidebarMode} initial={driverTarget} onClose={() => setDriverSidebarOpen(false)} onSaved={onDriverSaved} productionId={productionId} agencyId={driverAgencyId} />
      <NccAgencySidebar open={agencySidebarOpen} mode={agencySidebarMode} initial={agencyTarget} onClose={() => setAgencySidebarOpen(false)} onSaved={onAgencySaved} productionId={productionId} />
      <NccOrderSidebar open={orderSidebarOpen} mode={orderSidebarMode} initial={orderTarget} onClose={() => setOrderSidebarOpen(false)} onSaved={onOrderSaved} productionId={productionId} agencyId={orderAgencyId} />
      <NccVehicleSidebar
        open={nccVehicleSidebarOpen}
        mode="new"
        initial={null}
        onClose={() => setNccVehicleSidebarOpen(false)}
        onSaved={() => { setNccVehicleSidebarOpen(false); load() }}
        productionId={productionId}
        crewList={[]}
        vehicles={allVehicles}
        initialAgencyId={nccVehicleSidebarAgencyId}
      />
    </div>
  )
}

// ─── ComodatoExpenseSidebar ───────────────────────────────────
function ComodatoExpenseSidebar({ open, mode, initial, onClose, onSaved, productionId, vehicleId }) {
  const EMPTY = {
    vehicle_id: vehicleId || '',
    expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
    km_start: '', km_end: '',
    fuel_amount: '', fuel_receipt_no: '',
    other_amount: '', other_description: '',
    notes: '',
  }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setCd] = useState(false)
  const [deleting, setDel]  = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  useEffect(() => {
    if (!open) return
    setError(null); setCd(false)
    if (mode === 'edit' && initial) {
      setForm({
        vehicle_id:        initial.vehicle_id        || vehicleId || '',
        expense_date:      initial.expense_date      || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
        km_start:          initial.km_start          ?? '',
        km_end:            initial.km_end            ?? '',
        fuel_amount:       initial.fuel_amount       ?? '',
        fuel_receipt_no:   initial.fuel_receipt_no   || '',
        other_amount:      initial.other_amount      ?? '',
        other_description: initial.other_description || '',
        notes:             initial.notes             || '',
      })
    } else {
      setForm({ ...EMPTY, vehicle_id: vehicleId || '', expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) })
    }
  }, [open, mode, initial, vehicleId])
  const kmTotal = form.km_end !== '' && form.km_start !== '' ? Math.max(0, parseFloat(form.km_end) - parseFloat(form.km_start)) : null
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.vehicle_id) { setError('Vehicle is required'); return }
    if (!form.expense_date) { setError('Date is required'); return }
    setSaving(true)
    const row = {
      production_id:     productionId,
      vehicle_id:        form.vehicle_id,
      expense_date:      form.expense_date,
      km_start:          form.km_start          !== '' ? parseFloat(form.km_start)    : null,
      km_end:            form.km_end            !== '' ? parseFloat(form.km_end)      : null,
      fuel_amount:       form.fuel_amount       !== '' ? parseFloat(form.fuel_amount) : null,
      fuel_receipt_no:   form.fuel_receipt_no.trim()   || null,
      other_amount:      form.other_amount      !== '' ? parseFloat(form.other_amount): null,
      other_description: form.other_description.trim() || null,
      notes:             form.notes.trim()             || null,
    }
    let err
    if (mode === 'new') { const r = await supabase.from('comodato_expenses').insert(row); err = r.error }
    else { const r = await supabase.from('comodato_expenses').update(row).eq('id', initial.id); err = r.error }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error } = await supabase.from('comodato_expenses').delete().eq('id', initial.id)
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
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>{mode === 'new' ? '🤝 New Expense' : '✏️ Edit Expense'}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Date *</label>
                <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} style={inp} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '1px' }}>
                <div style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: '#f8fafc', width: '100%', boxSizing: 'border-box' }}>
                  🤝 {form.vehicle_id || '—'}
                </div>
              </div>
            </div>
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Mileage</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={lbl}>KM Start</label>
                  <input type="number" step="0.1" value={form.km_start} onChange={e => set('km_start', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>KM End</label>
                  <input type="number" step="0.1" value={form.km_end} onChange={e => set('km_end', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>KM Total</label>
                  <div style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', fontWeight: '700', color: kmTotal > 0 ? '#0f172a' : '#cbd5e1', background: '#f8fafc' }}>
                    {kmTotal !== null ? kmTotal.toFixed(1) : '—'}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #fde68a', background: '#fefce8' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#a16207', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⛽ Fuel</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Amount (EUR)</label>
                  <input type="number" step="0.01" value={form.fuel_amount} onChange={e => set('fuel_amount', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#fde68a' }} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#a16207' }}>Receipt No.</label>
                  <input value={form.fuel_receipt_no} onChange={e => set('fuel_receipt_no', e.target.value)} style={{ ...inp, borderColor: '#fde68a' }} placeholder="RIC-001" />
                </div>
              </div>
            </div>
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💳 Other Expense</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...lbl, color: '#7e22ce' }}>Amount (EUR)</label>
                  <input type="number" step="0.01" value={form.other_amount} onChange={e => set('other_amount', e.target.value)} style={{ ...inp, fontFamily: 'monospace', borderColor: '#e9d5ff' }} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#7e22ce' }}>Description</label>
                  <input value={form.other_description} onChange={e => set('other_description', e.target.value)} style={{ ...inp, borderColor: '#e9d5ff' }} placeholder="Toll, parking..." />
                </div>
              </div>
            </div>
            <div style={fld}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: '60px', resize: 'vertical' }} placeholder="Additional notes..." />
            </div>
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>Delete Expense</button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>Delete this expense? Cannot be undone.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Cancel</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>{deleting ? '...' : 'Confirm Delete'}</button>
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
              {saving ? 'Saving...' : mode === 'new' ? '+ Add Expense' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── ComodatoTab ──────────────────────────────────────────────
function ComodatoTab({ productionId, isMobile, openTriggerRef, crewList = [], addTrigger = 0 }) {
  const [vehicles, setVehicles]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [expenseSidebarOpen, setExpenseSidebarOpen] = useState(false)
  const [expenseSidebarMode, setExpenseSidebarMode] = useState('new')
  const [expenseTarget, setExpenseTarget] = useState(null)
  const [expenseVehicleId, setExpenseVehicleId] = useState(null)
  const [expandedVehicle, setExpandedVehicle]   = useState(null)
  const [expenses, setExpenses]           = useState({})
  const [loanVehicleSidebarOpen, setLoanVehicleSidebarOpen] = useState(false)
  const [loanVehicleSidebarMode, setLoanVehicleSidebarMode] = useState('new')
  const [loanVehicleTarget, setLoanVehicleTarget]           = useState(null)
  const [allVehicles, setAllVehicles]     = useState([])

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const [{ data: vData }, { data: allV }] = await Promise.all([
      supabase.from('vehicles').select('uuid, id, display_id, vehicle_type, license_plate, driver_name, active, is_comodato, comodato_owner_crew_id, comodato_rate_per_km, comodato_fuel_reimbursement, comodato_notes').eq('production_id', productionId).eq('is_comodato', true).order('display_id'),
      supabase.from('vehicles').select('id').eq('production_id', productionId),
    ])
    setVehicles(vData || [])
    setAllVehicles(allV || [])
    setLoading(false)
  }, [productionId])

  async function loadExpenses(vehicleId) {
    const { data } = await supabase.from('comodato_expenses').select('*').eq('vehicle_id', vehicleId).eq('production_id', productionId).order('expense_date', { ascending: false })
    setExpenses(prev => ({ ...prev, [vehicleId]: data || [] }))
  }

  function toggleVehicle(id) {
    const next = expandedVehicle === id ? null : id
    setExpandedVehicle(next)
    if (next && !expenses[next]) loadExpenses(next)
  }

  function openNewExpense(vehicleId) { setExpenseSidebarMode('new'); setExpenseTarget(null); setExpenseVehicleId(vehicleId); setExpenseSidebarOpen(true) }
  function openEditExpense(e) { setExpenseSidebarMode('edit'); setExpenseTarget(e); setExpenseVehicleId(e.vehicle_id); setExpenseSidebarOpen(true) }
  function onExpenseSaved() { setExpenseSidebarOpen(false); if (expenseVehicleId) loadExpenses(expenseVehicleId) }

  function openNewLoan() { setLoanVehicleSidebarMode('new'); setLoanVehicleTarget(null); setLoanVehicleSidebarOpen(true) }
  function openEditLoan(v) { setLoanVehicleSidebarMode('edit'); setLoanVehicleTarget(v); setLoanVehicleSidebarOpen(true) }

  useEffect(() => { load() }, [load])
  useEffect(() => { if (openTriggerRef) openTriggerRef.current = openNewLoan }, [openTriggerRef])
  useEffect(() => { if (addTrigger > 0) { setLoanVehicleSidebarMode('new'); setLoanVehicleTarget(null); setLoanVehicleSidebarOpen(true) } }, [addTrigger])

  function fmtDate(s) {
    if (!s) return '—'
    return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading...</div>

  if (vehicles.length === 0) return (
    <div>
      <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🤝</div>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No loan vehicles yet</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Use + Add Loan to add a loan vehicle</div>
      </div>
      <LoanVehicleSidebar open={loanVehicleSidebarOpen} mode={loanVehicleSidebarMode} initial={loanVehicleTarget} onClose={() => setLoanVehicleSidebarOpen(false)} onSaved={() => { setLoanVehicleSidebarOpen(false); load() }} productionId={productionId} crewList={crewList} vehicles={allVehicles} />
    </div>
  )

  const grandTotal = Object.values(expenses).flat().reduce((s, e) => s + (parseFloat(e.fuel_amount) || 0) + (parseFloat(e.other_amount) || 0), 0)

  return (
    <div>
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', color: '#374151' }}>Loan vehicles: <span style={{ fontWeight: '800', color: '#0f172a' }}>{vehicles.length}</span></div>
        <div style={{ fontSize: '12px', color: '#374151' }}>Expenses loaded: <span style={{ fontWeight: '800', color: '#0f2340' }}>{Object.values(expenses).flat().length}</span></div>
        {grandTotal > 0 && <div style={{ fontSize: '12px', color: '#374151' }}>Total: <span style={{ fontWeight: '800', color: '#dc2626', fontFamily: 'monospace' }}>EUR {grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span></div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {vehicles.map(v => {
          const isExpanded = expandedVehicle === v.id
          const vehicleExpenses = expenses[v.id] || []
          const vehicleTotal = vehicleExpenses.reduce((s, e) => s + (parseFloat(e.fuel_amount) || 0) + (parseFloat(e.other_amount) || 0), 0)
          const vehicleKm = vehicleExpenses.reduce((s, e) => s + (e.km_start !== null && e.km_end !== null ? Math.max(0, e.km_end - e.km_start) : 0), 0)
          return (
            <div key={v.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: '3px solid #15803d', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => toggleVehicle(v.id)}>
                <span style={{ fontSize: '20px' }}>{TYPE_ICON[v.vehicle_type] || '🚗'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{v.display_id || v.id}</span>
                    {v.license_plate && <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: '700', color: '#374151', background: '#fafaf9', padding: '1px 8px', borderRadius: '5px', border: '1px solid #d4d4d4' }}>{v.license_plate}</span>}
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', padding: '1px 8px', borderRadius: '999px', border: '1px solid #86efac' }}>🤝 LOAN</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {v.driver_name && <span>👤 {v.driver_name}</span>}
                    {v.comodato_owner_crew_id && (() => {
                      const owner = crewList.find(c => c.id === v.comodato_owner_crew_id)
                      return owner ? <span>🤝 {owner.full_name}{owner.department ? ` — ${owner.department}` : ''}</span> : null
                    })()}
                    {v.comodato_rate_per_km && <span>📍 EUR {v.comodato_rate_per_km}/km</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {vehicleExpenses.length > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>{vehicleExpenses.length} expenses</span>}
                  {vehicleKm > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', fontWeight: '700' }}>{vehicleKm.toFixed(0)} km</span>}
                  {vehicleTotal > 0 && <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: '700', color: '#dc2626' }}>EUR {vehicleTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>}
                  <button type="button" onClick={e => { e.stopPropagation(); openEditLoan(v) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '0 4px' }}>✎</button>
                  <span style={{ color: '#94a3b8', fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💳 Expenses</div>
                    <button onClick={() => openNewExpense(v.id)} style={{ padding: '4px 12px', borderRadius: '7px', border: '1px solid #15803d', background: '#f0fdf4', color: '#15803d', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>+ Add Expense</button>
                  </div>
                  {vehicleExpenses.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>No expenses recorded</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {vehicleExpenses.map(e => {
                        const km = e.km_start !== null && e.km_end !== null ? Math.max(0, e.km_end - e.km_start) : null
                        const total = (parseFloat(e.fuel_amount) || 0) + (parseFloat(e.other_amount) || 0)
                        return (
                          <div key={e.id} onClick={() => openEditExpense(e)}
                            style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: '3px solid #86efac', borderRadius: '0 8px 8px 0', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
                            onMouseEnter={el => el.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={el => el.currentTarget.style.background = 'white'}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f2340', minWidth: '80px' }}>{fmtDate(e.expense_date)}</div>
                            {km !== null && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '5px', background: '#f0fdf4', color: '#15803d', fontWeight: '700', border: '1px solid #86efac' }}>📍 {km.toFixed(1)} km</span>}
                            {e.fuel_amount > 0 && <span style={{ fontSize: '11px', color: '#a16207' }}>⛽ EUR {parseFloat(e.fuel_amount).toFixed(2)}</span>}
                            {e.other_amount > 0 && <span style={{ fontSize: '11px', color: '#7e22ce' }}>💳 {e.other_description || 'Other'}: EUR {parseFloat(e.other_amount).toFixed(2)}</span>}
                            {e.notes && <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes}</span>}
                            {total > 0 && <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', color: '#dc2626', marginLeft: 'auto' }}>EUR {total.toFixed(2)}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ComodatoExpenseSidebar open={expenseSidebarOpen} mode={expenseSidebarMode} initial={expenseTarget} onClose={() => setExpenseSidebarOpen(false)} onSaved={onExpenseSaved} productionId={productionId} vehicleId={expenseVehicleId} />
      <LoanVehicleSidebar open={loanVehicleSidebarOpen} mode={loanVehicleSidebarMode} initial={loanVehicleTarget} onClose={() => setLoanVehicleSidebarOpen(false)} onSaved={() => { setLoanVehicleSidebarOpen(false); load() }} productionId={productionId} crewList={crewList} vehicles={allVehicles} />
    </div>
  )
}

// ─── LoanVehicleSidebar ───────────────────────────────────────
function LoanVehicleSidebar({ open, mode, initial, onClose, onSaved, productionId, crewList = [], vehicles = [], openTriggerRef }) {
  const EMPTY = {
    id: '', vehicle_type: 'VAN',
    license_plate: '',
    capacity: '', pax_suggested: '', pax_max: '',
    sign_code: '', unit_default: '',
    available_from: '', available_to: '',
    active: true, in_transport: true,
    comodato_owner_crew_id: '',
    comodato_rate_per_km: '',
    comodato_fuel_reimbursement: false,
    comodato_notes: '',
  }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setCd] = useState(false)
  const [deleting, setDel]  = useState(false)
  const [idManuallyEdited, setIdManuallyEdited] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (openTriggerRef) openTriggerRef.current = () => {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles) })
      setIdManuallyEdited(false)
      setError(null); setCd(false)
    }
  }, [openTriggerRef, vehicles])

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false)
    if (mode === 'edit' && initial) {
      setForm({
        id:                          initial.id                          || '',
        vehicle_type:                initial.vehicle_type                || 'VAN',
        license_plate:               initial.license_plate               || '',
        capacity:                    initial.capacity                    ?? '',
        pax_suggested:               initial.pax_suggested               ?? '',
        pax_max:                     initial.pax_max                     ?? '',
        sign_code:                   initial.sign_code                   || '',
        unit_default:                initial.unit_default                || '',
        available_from:              initial.available_from              || '',
        available_to:                initial.available_to                || '',
        active:                      initial.active !== false,
        in_transport:                initial.in_transport !== false,
        comodato_owner_crew_id:      initial.comodato_owner_crew_id      || '',
        comodato_rate_per_km:        initial.comodato_rate_per_km        ?? '',
        comodato_fuel_reimbursement: initial.comodato_fuel_reimbursement || false,
        comodato_notes:              initial.comodato_notes              || '',
      })
      setIdManuallyEdited(false)
    } else {
      setForm({ ...EMPTY, id: suggestId('VAN', vehicles) })
      setIdManuallyEdited(false)
    }
  }, [open, mode, initial])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id.trim()) { setError('Vehicle ID obbligatorio'); return }
    setSaving(true)
    const row = {
      production_id:               productionId,
      vehicle_type:                form.vehicle_type || null,
      license_plate:               form.license_plate.trim().toUpperCase() || null,
      capacity:                    form.capacity      !== '' ? parseInt(form.capacity)      : null,
      pax_suggested:               form.pax_suggested !== '' ? parseInt(form.pax_suggested) : null,
      pax_max:                     form.pax_max       !== '' ? parseInt(form.pax_max)       : null,
      is_ncc:                      false,
      is_comodato:                 true,
      ncc_agency_id:               null,
      ncc_driver_name:             null,
      ncc_driver_phone:            null,
      sign_code:                   form.sign_code.trim()    || null,
      unit_default:                form.unit_default.trim() || null,
      available_from:              form.available_from || null,
      available_to:                form.available_to   || null,
      active:                      form.active,
      in_transport:                form.in_transport !== false,
      comodato_owner_crew_id:      form.comodato_owner_crew_id || null,
      comodato_rate_per_km:        form.comodato_rate_per_km !== '' ? parseFloat(form.comodato_rate_per_km) : null,
      comodato_fuel_reimbursement: form.comodato_fuel_reimbursement || false,
      comodato_notes:              form.comodato_notes.trim() || null,
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
    const { count } = await supabase.from('trips').select('id', { count: 'exact', head: true }).eq('vehicle_id', initial.uuid).eq('production_id', productionId)
    if (count > 0) { setDel(false); setCd(false); setError(`Cannot delete — ${count} trip${count > 1 ? 's' : ''} assigned.`); return }
    const { error } = await supabase.from('vehicles').delete().eq('uuid', initial.uuid).eq('production_id', productionId)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  const ownerCrew = crewList.find(c => c.id === form.comodato_owner_crew_id)

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🤝 New Loan Vehicle' : '✏️ Edit Loan Vehicle'}
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

            {/* Rocket Capacity */}
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

            {/* Loan Details */}
            <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #86efac', background: '#f0fdf4' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🤝 Loan Details</div>

              {/* Owner */}
              <div style={fld}>
                <label style={{ ...lbl, color: '#15803d' }}>Owner (Crew)</label>
                <select value={form.comodato_owner_crew_id} onChange={e => set('comodato_owner_crew_id', e.target.value)}
                  style={{ ...inp, cursor: 'pointer', borderColor: '#86efac', background: 'white' }}>
                  <option value="">— Select owner —</option>
                  {crewList.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.department ? ` (${c.department})` : ''}</option>)}
                </select>
              </div>

              {/* Rate per KM */}
              <div style={fld}>
                <label style={{ ...lbl, color: '#15803d' }}>Rate per KM (EUR)</label>
                <input type="number" step="0.01" value={form.comodato_rate_per_km} onChange={e => set('comodato_rate_per_km', e.target.value)}
                  style={{ ...inp, fontFamily: 'monospace', borderColor: '#86efac' }} placeholder="0.25" />
              </div>

              {/* Fuel reimbursement */}
              <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${form.comodato_fuel_reimbursement ? '#86efac' : '#d1d5db'}`, background: form.comodato_fuel_reimbursement ? '#f0fdf4' : 'white', cursor: 'pointer' }}
                onClick={() => set('comodato_fuel_reimbursement', !form.comodato_fuel_reimbursement)}>
                <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.comodato_fuel_reimbursement ? '#15803d' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', left: form.comodato_fuel_reimbursement ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: '700', color: form.comodato_fuel_reimbursement ? '#15803d' : '#64748b' }}>⛽ Fuel reimbursement</span>
              </div>

              {/* Notes */}
              <div>
                <label style={{ ...lbl, color: '#15803d' }}>Notes</label>
                <textarea value={form.comodato_notes} onChange={e => set('comodato_notes', e.target.value)}
                  style={{ ...inp, minHeight: '60px', resize: 'vertical', borderColor: '#86efac' }} placeholder="Additional notes..." />
              </div>
            </div>

            {/* Assignments — read-only, visible only in edit if preferred_dept or preferred_crew_ids */}
            {mode === 'edit' && (initial?.preferred_dept || (Array.isArray(initial?.preferred_crew_ids) && initial.preferred_crew_ids.length > 0)) && (
              <div style={{ ...fld, padding: '12px 14px', borderRadius: '9px', border: '1px solid #e9d5ff', background: '#fdf4ff' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#7e22ce', marginBottom: '8px' }}>⭐ Assignments</div>
                {ownerCrew && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '6px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '7px' }}>
                    <span style={{ fontSize: '12px' }}>🔗</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>{ownerCrew.full_name}</span>
                    {ownerCrew.department && <span style={{ fontSize: '10px', color: '#64748b' }}>{ownerCrew.department}</span>}
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', marginLeft: 'auto' }}>owner/driver</span>
                  </div>
                )}
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
                    Delete Loan Vehicle
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
              {saving ? 'Saving...' : mode === 'new' ? '🤝 Add Loan Vehicle' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── AddVehicleModal ──────────────────────────────────────────
function AddVehicleModal({ open, onClose, onSelect }) {
  if (!open) return null
  const options = [
    { key: 'production', icon: '🎥', label: 'Production',
      desc: 'Veicolo di proprietà della produzione',
      color: '#0f2340', bg: '#eff6ff', border: '#bfdbfe' },
    { key: 'rental', icon: '🔑', label: 'Rental',
      desc: 'Veicolo a noleggio (contratto supplier)',
      color: '#a16207', bg: '#fefce8', border: '#fde68a' },
    { key: 'ncc', icon: '🏢', label: 'NCC',
      desc: 'Veicolo fornito da agenzia NCC esterna',
      color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    { key: 'loan', icon: '🤝', label: 'Loan',
      desc: 'Veicolo personale con rimborso spese',
      color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  ]
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,35,64,0.4)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61,
        background: 'white', borderRadius: '14px', padding: '24px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', marginBottom: '6px' }}>
          🚐 Aggiungi Veicolo
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
          Seleziona il tipo di veicolo da aggiungere
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => onSelect(opt.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                borderRadius: '10px', border: `1px solid ${opt.border}`, background: opt.bg,
                cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>{opt.icon}</span>
              <div>
                <div style={{ fontWeight: '800', fontSize: '13px', color: opt.color }}>{opt.label}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{opt.desc}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: opt.color, fontSize: '16px' }}>›</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop: '14px', width: '100%', padding: '8px',
          borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white',
          color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
          Cancel
        </button>
      </div>
    </>
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
  const [filterActive, setFA]   = useState('ALL')  // ALL | ACTIVE | INACTIVE
  const [filterType,   setFT]   = useState('ALL')  // ALL | VAN | CAR | BUS
  const [filterRental, setFR]   = useState('ALL')  // ALL | OWNED | RENTAL
  const [sidebarOpen, setSO] = useState(false)
  const [mode,    setMode]   = useState('new')
  const [editItem, setEdit]  = useState(null)
  const [selectedIds, setSelectedIds] = useState([])   // bulk selection
  const [bulkDeleting, setBulkDel] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [crewList, setCrewList] = useState([])
  const [activeTab, setActiveTab] = useState('fleet') // 'fleet' | 'rental' | 'ncc' | 'comodato' | 'report'
  const [rentalSearch, setRentalSearch] = useState('')
  const [rentalFilterStatus, setRentalFilterStatus] = useState('ALL')
  const [rentalColumnsCount, setRentalColumnsCount] = useState(0)
  const [rentalVehicleCount, setRentalVehicleCount] = useState(0)
  const [rentalColumnsEditorOpen, setRentalColumnsEditorOpen] = useState(false)
  const [rentalSubTab, setRentalSubTab] = useState('vehicles')
  const supplierSidebarTriggerRef        = React.useRef(null)
  const rentalSidebarTriggerRef          = React.useRef(null)
  const nccAgencySidebarTriggerRef       = React.useRef(null)
  const comodatoVehicleSidebarTriggerRef = React.useRef(null)
  const nccVehicleSidebarTriggerRef      = React.useRef(null)
  const [nccVehicleSidebarOpen, setNccVehicleSidebarOpen] = useState(false)
  const [nccVehicleSidebarMode, setNccVehicleSidebarMode] = useState('new')
  const [nccVehicleTarget, setNccVehicleTarget] = useState(null)
  const [nccReloadTrigger, setNccReloadTrigger] = useState(0)
  const [loanVehicleSidebarOpen, setLoanVehicleSidebarOpen] = useState(false)
  const [loanVehicleSidebarMode, setLoanVehicleSidebarMode] = useState('new')
  const [loanVehicleTarget, setLoanVehicleTarget] = useState(null)
  const [comodatoAddTrigger, setComodatoAddTrigger] = useState(0)
  const [rentalVehicleSidebarOpen, setRentalVehicleSidebarOpen] = useState(false)
  const [rentalVehicleSidebarMode, setRentalVehicleSidebarMode] = useState('new')
  const [rentalVehicleSidebarTarget, setRentalVehicleSidebarTarget] = useState(null)
  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false)
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
      supabase.from('vehicles').select('*').eq('production_id', PRODUCTION_ID).order('vehicle_type').order('display_id'),
      supabase.from('crew').select('uuid, display_id, full_name, department, no_transport_needed').eq('production_id', PRODUCTION_ID).order('full_name'),
    ])
    setVhcs(vData || [])
    setCrewList(cData || [])
    setLoad(false)
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  function openNew()   { setMode('new');  setEdit(null); setSO(true) }
  function openEdit(v) {
    if (v.is_rental === true) {
      setRentalVehicleSidebarMode('edit')
      setRentalVehicleSidebarTarget(v)
      setRentalVehicleSidebarOpen(true)
    } else {
      setMode('edit'); setEdit(v); setSO(true)
    }
  }
  function onSaved()   { setSO(false); load() }

  function handleAddVehicleSelect(type) {
    setAddVehicleModalOpen(false)
    if (type === 'production') { setActiveTab('production'); setMode('new'); setEdit(null); setSO(true) }
    if (type === 'rental')     { setActiveTab('rental'); setRentalSubTab('vehicles'); setRentalVehicleSidebarMode('new'); setRentalVehicleSidebarTarget(null); setRentalVehicleSidebarOpen(true) }
    if (type === 'ncc')        { setActiveTab('ncc'); setNccVehicleSidebarMode('new'); setNccVehicleTarget(null); setNccVehicleSidebarOpen(true) }
    if (type === 'loan')       { setActiveTab('comodato'); setLoanVehicleSidebarMode('new'); setLoanVehicleTarget(null); setLoanVehicleSidebarOpen(true) }
  }

  // ─── Selezione ────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function selectAll() {
    const allIds = filtered.map(v => v.uuid)
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

    const { error } = await supabase.from('vehicles').delete().eq('uuid', id).eq('production_id', PRODUCTION_ID)
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
    const { error } = await supabase.from('vehicles').delete().in('uuid', selectedIds).eq('production_id', PRODUCTION_ID)
    setBulkDel(false)
    if (!error) { setSelectedIds([]); setBulkConfirm(false); load() }
  }

  // Filtro production-only (per tab Production)
  const productionFiltered = vhcs.filter(v => {
    if (v.is_rental || v.is_ncc || v.is_comodato) return false
    if (filterActive === 'ACTIVE'   && !v.active) return false
    if (filterActive === 'INACTIVE' &&  v.active) return false
    if (filterType !== 'ALL' && v.vehicle_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(v.id || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Reset selezione quando cambiano i filtri
  const filtered = vhcs.filter(v => {
    if (filterActive === 'ACTIVE'   && !v.active) return false
    if (filterActive === 'INACTIVE' &&  v.active) return false
    if (filterType !== 'ALL' && v.vehicle_type !== filterType) return false
    if (filterRental === 'PRODUCTION' && (v.is_rental || v.is_ncc || v.is_comodato)) return false
    if (filterRental === 'RENTAL'     && !v.is_rental) return false
    if (filterRental === 'NCC'        && !v.is_ncc) return false
    if (filterRental === 'COMODATO'   && !v.is_comodato) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(v.id || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
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
          <button onClick={() => {
            if (activeTab === 'fleet')     { setAddVehicleModalOpen(true) }
            else if (activeTab === 'production') { setMode('new'); setEdit(null); setSO(true) }
            else if (activeTab === 'rental' && rentalSubTab === 'vehicles')   { setRentalVehicleSidebarMode('new'); setRentalVehicleSidebarTarget(null); setRentalVehicleSidebarOpen(true) }
            else if (activeTab === 'rental' && rentalSubTab === 'suppliers')  { supplierSidebarTriggerRef.current && supplierSidebarTriggerRef.current() }
            else if (activeTab === 'ncc')      { setNccVehicleSidebarMode('new'); setNccVehicleTarget(null); setNccVehicleSidebarOpen(true) }
            else if (activeTab === 'comodato') { setLoanVehicleSidebarMode('new'); setLoanVehicleTarget(null); setLoanVehicleSidebarOpen(true) }
          }} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', flexShrink: 0 }}>
            {activeTab === 'fleet'      ? '+ Add Vehicle'
            : activeTab === 'production' ? '+ Add Production'
            : (activeTab === 'rental' && rentalSubTab === 'vehicles')  ? '+ Add Rental'
            : (activeTab === 'rental' && rentalSubTab === 'suppliers') ? '+ Add Supplier'
            : activeTab === 'ncc'      ? '+ Add NCC Vehicle'
            : activeTab === 'comodato' ? '+ Add Loan Vehicle'
            : '+ Add Vehicle'}
          </button>
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
              { key: 'fleet',      label: '🚐 Fleet' },
              { key: 'production', label: '🎥 Production' },
              { key: 'rental',     label: '🔑 Rental' },
              { key: 'ncc',        label: '🧑‍💼 NCC' },
              { key: 'comodato',   label: '🤝 Loan' },
              { key: 'report',     label: '📊 Report' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ padding: '5px 12px', border: 'none', borderLeft: tab.key !== 'fleet' ? '1px solid #e2e8f0' : 'none', background: activeTab === tab.key ? '#0f2340' : 'white', color: activeTab === tab.key ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={load} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151', flexShrink: 0 }}>↻</button>
        </div>
        {/* Riga 2 — filtri Rental */}
        {activeTab === 'rental' && <div style={{ padding: isMobile ? '8px 12px' : '8px 24px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {/* Filtri visibili solo su sub-tab Vehicles */}
          {rentalSubTab === 'vehicles' && <>
            <input type="text" placeholder="Search ID, driver, plate..." value={rentalSearch} onChange={e => setRentalSearch(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '180px', background: 'white' }} />
            <div style={{ display: 'flex', gap: '4px' }}>
              {['ALL', 'OPEN', 'CLOSED'].map(s => (
                <button key={s} onClick={() => setRentalFilterStatus(s)}
                  style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid',
                    ...(rentalFilterStatus === s
                      ? s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' }
                      : s === 'OPEN' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }
                      : { background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }
                      : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              ))}
            </div>
          </>}
          <div style={{ flex: 1 }} />
          {rentalSubTab === 'vehicles' && <>
            {rentalColumnsCount === 0 && (
              <button onClick={() => setRentalColumnsEditorOpen(true)}
                style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #0f2340', background: '#0f2340', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                Apply Default Columns
              </button>
            )}
            <button onClick={() => setRentalColumnsEditorOpen(true)}
              style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              ✎ Edit Columns {rentalColumnsCount > 0 && `(${rentalColumnsCount})`}
            </button>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{rentalVehicleCount} vehicle{rentalVehicleCount !== 1 ? 's' : ''}</span>
          </>}
          {/* Sub-tab switcher — destra */}
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', flexShrink: 0 }}>
            {[{ key: 'vehicles', label: '🚐 Vehicles' }, { key: 'suppliers', label: '🏢 Suppliers' }].map(st => (
              <button key={st.key} onClick={() => setRentalSubTab(st.key)}
                style={{ padding: '4px 12px', border: 'none', borderLeft: st.key !== 'vehicles' ? '1px solid #e2e8f0' : 'none', background: rentalSubTab === st.key ? '#0f2340' : 'white', color: rentalSubTab === st.key ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {st.label}
              </button>
            ))}
          </div>
        </div>}
        {/* Riga 2 — filtri Production */}
        {activeTab === 'production' && <div style={{ padding: isMobile ? '8px 12px' : '8px 24px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
        {/* Riga 2 — filtri Fleet */}
        {activeTab === 'fleet' && <div style={{ padding: isMobile ? '8px 12px' : '8px 24px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '3px', flexShrink: 0, flexWrap: 'wrap' }}>
            {[['ALL', 'All'], ['PRODUCTION', '🚐 Production'], ['RENTAL', '🔑 Rental'], ['NCC', '🏢 NCC'], ['COMODATO', '🤝 Comodato']].map(([val, label]) => (
              <button key={val} onClick={() => setFR(val)}
                style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterRental === val ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                {label}
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
      {activeTab === 'rental' && rentalSubTab === 'vehicles' && (
        <div style={{ padding: isMobile ? '12px 16px' : '16px 24px' }}>
          <RentalTab productionId={PRODUCTION_ID} isMobile={isMobile} openTriggerRef={rentalSidebarTriggerRef} crewList={crewList} externalSearch={rentalSearch} externalFilterStatus={rentalFilterStatus} onRentalInfo={({ columnsCount, vehicleCount }) => { setRentalColumnsCount(columnsCount); setRentalVehicleCount(vehicleCount) }} columnsEditorOpen={rentalColumnsEditorOpen} onColumnsEditorClose={() => setRentalColumnsEditorOpen(false)} onEditVehicle={v => { setRentalVehicleSidebarMode('edit'); setRentalVehicleSidebarTarget(v); setRentalVehicleSidebarOpen(true) }} />
        </div>
      )}
      {activeTab === 'rental' && rentalSubTab === 'suppliers' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <RentalSuppliersTab productionId={PRODUCTION_ID} isMobile={isMobile} openTriggerRef={supplierSidebarTriggerRef} />
        </div>
      )}
      {activeTab === 'ncc' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <NccTab productionId={PRODUCTION_ID} isMobile={isMobile} openTriggerRef={nccAgencySidebarTriggerRef} onEditVehicle={openEdit} reloadTrigger={nccReloadTrigger} />
        </div>
      )}
      {activeTab === 'comodato' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
        <ComodatoTab productionId={PRODUCTION_ID} isMobile={isMobile} openTriggerRef={comodatoVehicleSidebarTriggerRef} crewList={crewList} addTrigger={comodatoAddTrigger} />
        </div>
      )}
      {activeTab === 'report' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
          <RentalReportTab productionId={PRODUCTION_ID} />
        </div>
      )}
      {activeTab === 'production' && <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px' }}>
        {!PRODUCTION_ID && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>⚠ NEXT_PUBLIC_PRODUCTION_ID non impostato</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : productionFiltered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏭</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>
              {vhcs.filter(v => !v.is_rental && !v.is_ncc && !v.is_comodato).length === 0
                ? 'Nessun veicolo di produzione ancora' : t.noResults}
            </div>
            {vhcs.filter(v => !v.is_rental && !v.is_ncc && !v.is_comodato).length === 0 && (
              <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '12px' }}>
                + Add Production Vehicle
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {productionFiltered.map(v => (
              <VehicleRow
                key={v.id}
                v={v}
                onEdit={openEdit}
                onDelete={handleDeleteSingle}
      selected={selectedIds.includes(v.uuid)}
      onToggleSelect={toggleSelect}
                crewList={crewList}
              />
            ))}
          </div>
        )}
      </div>}
      {activeTab === 'fleet' && <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '12px 16px' : '24px', transition: 'margin-right 0.25s', marginRight: !isMobile && sidebarOpen ? `${SIDEBAR_W}px` : 'auto' }}>
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
                selected={selectedIds.includes(v.uuid)}
                onToggleSelect={toggleSelect}
                crewList={crewList}
              />
            ))}
          </div>
        )}
</div>}
      <NccVehicleSidebar
        open={nccVehicleSidebarOpen}
        mode={nccVehicleSidebarMode}
        initial={nccVehicleTarget}
        onClose={() => setNccVehicleSidebarOpen(false)}
        onSaved={() => { setNccVehicleSidebarOpen(false); load(); setNccReloadTrigger(t => t + 1) }}
        productionId={PRODUCTION_ID}
        crewList={crewList}
        vehicles={vhcs}
        openTriggerRef={nccVehicleSidebarTriggerRef}
      />
      <LoanVehicleSidebar
        open={loanVehicleSidebarOpen}
        mode={loanVehicleSidebarMode}
        initial={loanVehicleTarget}
        onClose={() => setLoanVehicleSidebarOpen(false)}
        onSaved={() => { setLoanVehicleSidebarOpen(false); load() }}
        productionId={PRODUCTION_ID}
        crewList={crewList}
        vehicles={vhcs}
      />
      <VehicleSidebar open={sidebarOpen} mode={mode} initial={editItem} onClose={() => setSO(false)} onSaved={onSaved} crewList={crewList} deptOptions={deptOptions} vehicles={vhcs} />
      <RentalVehicleSidebar
        open={rentalVehicleSidebarOpen}
        mode={rentalVehicleSidebarMode}
        initial={rentalVehicleSidebarTarget}
        onClose={() => setRentalVehicleSidebarOpen(false)}
        onSaved={() => { setRentalVehicleSidebarOpen(false); load() }}
        productionId={PRODUCTION_ID}
        crewList={crewList}
        vehicles={vhcs}
        initialSupplierId={null}
        compactMode={activeTab === 'fleet'}
      />
      <AddVehicleModal
        open={addVehicleModalOpen}
        onClose={() => setAddVehicleModalOpen(false)}
        onSelect={handleAddVehicleSelect}
      />
    </div>
  )
}
