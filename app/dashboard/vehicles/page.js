'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { ImportModal } from '../../../lib/ImportModal'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID
const SIDEBAR_W = 400

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
const TYPE_COLOR = {
  VAN: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  CAR: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  BUS: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
}
const CLASS_OPTIONS = ['CLASSIC', 'LUX', 'ECONOMY', 'PREMIUM', 'MINIBUS']
const CLASS_COLOR = {
  LUX:     { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  PREMIUM: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  CLASSIC: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  ECONOMY: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  MINIBUS: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
}

// ─── Sidebar ──────────────────────────────────────────────────
function VehicleSidebar({ open, mode, initial, onClose, onSaved }) {
  const t = useT()
  const EMPTY = { id: '', vehicle_type: 'VAN', vehicle_class: '', license_plate: '', capacity: '', pax_suggested: '', pax_max: '', driver_name: '', sign_code: '', unit_default: '', active: true, available_from: '', available_to: '' }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDel]  = useState(false)
  const [confirmDel, setCd] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!open) return
    setError(null); setCd(false)
    if (mode === 'edit' && initial) {
      setForm({ id: initial.id || '', vehicle_type: initial.vehicle_type || 'VAN', vehicle_class: initial.vehicle_class || '', license_plate: initial.license_plate || '', capacity: initial.capacity ?? '', pax_suggested: initial.pax_suggested ?? '', pax_max: initial.pax_max ?? '', driver_name: initial.driver_name || '', sign_code: initial.sign_code || '', unit_default: initial.unit_default || '', active: initial.active !== false, available_from: initial.available_from || '', available_to: initial.available_to || '' })
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
      production_id:  PRODUCTION_ID,
      id:             form.id.trim().toUpperCase(),
      vehicle_type:   form.vehicle_type || null,
      vehicle_class:  form.vehicle_class || null,
      license_plate:  form.license_plate.trim().toUpperCase() || null,
      capacity:       form.capacity      !== '' ? parseInt(form.capacity)      : null,
      pax_suggested:  form.pax_suggested !== '' ? parseInt(form.pax_suggested) : null,
      pax_max:        form.pax_max       !== '' ? parseInt(form.pax_max)       : null,
      driver_name:    form.driver_name.trim() || null,
      sign_code:      form.sign_code.trim() || null,
      unit_default:   form.unit_default.trim() || null,
      active:         form.active,
      available_from: form.available_from || null,
      available_to:   form.available_to   || null,
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
    const { error } = await supabase.from('vehicles').delete().eq('id', initial.id)
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
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Formato: VAN-01, BUS-20, CAR-05 — usato in Trips e Fleet Monitor</div>
            </div>

            {/* Tipo veicolo */}
            <div style={fld}>
              <label style={lbl}>Tipo</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['VAN', 'CAR', 'BUS'].map(type => {
                  const c = TYPE_COLOR[type]; const active = form.vehicle_type === type
                  return (
                    <button key={type} type="button" onClick={() => set('vehicle_type', type)}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '20px' }}>{TYPE_ICON[type]}</span>
                      <span>{type}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Vehicle Class */}
            <div style={fld}>
              <label style={lbl}>Classe Veicolo</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => set('vehicle_class', '')}
                  style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${!form.vehicle_class ? '#0f2340' : '#e2e8f0'}`, background: !form.vehicle_class ? '#0f2340' : 'white', color: !form.vehicle_class ? 'white' : '#94a3b8' }}>
                  {t.noClassLabel}
                </button>
                {CLASS_OPTIONS.map(c => {
                  const cc = CLASS_COLOR[c] || CLASS_COLOR.CLASSIC; const active = form.vehicle_class === c
                  return (
                    <button key={c} type="button" onClick={() => set('vehicle_class', c)}
                      style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? cc.border : '#e2e8f0'}`, background: active ? cc.bg : 'white', color: active ? cc.color : '#94a3b8' }}>
                      {c === 'LUX' ? '💎 LUX' : c === 'PREMIUM' ? '⭐ PREMIUM' : c === 'ECONOMY' ? '💶 ECONOMY' : c === 'MINIBUS' ? '🚌 MINIBUS' : c}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Targa + Capacità */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Targa</label>
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
              <label style={lbl}>Driver</label>
              <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)} style={inp} placeholder="Mario Rossi" />
            </div>

            {/* Sign code */}
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
                  {form.active ? '✅ Veicolo attivo — visibile in Fleet Monitor' : '⏸ Veicolo inattivo — nascosto da Fleet Monitor'}
                </div>
              </div>
            </div>

            {/* Delete */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Zona pericolosa</div>
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
function VehicleRow({ v, onEdit, onDelete, selected, onToggleSelect }) {
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
          {v.vehicle_class && (() => { const cc = CLASS_COLOR[v.vehicle_class] || CLASS_COLOR.CLASSIC; return <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: cc.bg, color: cc.color, border: `1px solid ${cc.border}` }}>{v.vehicle_class === 'LUX' ? '💎' : v.vehicle_class === 'PREMIUM' ? '⭐' : ''} {v.vehicle_class}</span> })()}
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
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
          {v.driver_name && <span>👤 {v.driver_name}</span>}
          {v.sign_code   && <span>🏷 {v.sign_code}</span>}
          {v.unit_default && <span>📋 {v.unit_default}</span>}
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
    const { data } = await supabase.from('vehicles').select('*').eq('production_id', PRODUCTION_ID).order('vehicle_type').order('id')
    setVhcs(data || [])
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
    const { error } = await supabase.from('vehicles').delete().eq('id', id)
    if (!error) {
      setSelectedIds(prev => prev.filter(x => x !== id))
      load()
    }
  }

  // ─── Bulk delete ─────────────────────────────────────────
  async function handleBulkDelete() {
    if (!bulkConfirm) { setBulkConfirm(true); return }
    setBulkDel(true)
    const { error } = await supabase.from('vehicles').delete().in('id', selectedIds)
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
    van: vhcs.filter(v => v.vehicle_type === 'VAN').length,
    car: vhcs.filter(v => v.vehicle_type === 'CAR').length,
    bus: vhcs.filter(v => v.vehicle_type === 'BUS').length,
  }

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/vehicles" />

      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🚐</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Vehicles</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{vhcs.length} totale · {counts.active} attivi</span>
          <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
            {[['VAN', '🚐'], ['CAR', '🚗'], ['BUS', '🚌']].map(([tp, ic]) => counts[tp.toLowerCase()] > 0 && (
              <span key={tp} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', ...(TYPE_COLOR[tp]), border: `1px solid ${TYPE_COLOR[tp].border}` }}>
                {ic} {counts[tp.toLowerCase()]} {tp}
              </span>
            ))}
          </div>
        </div>
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
            {['ALL', 'VAN', 'CAR', 'BUS'].map(s => {
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
        </div>
      </div>

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
              />
            ))}
          </div>
        )}
      </div>

      <VehicleSidebar open={sidebarOpen} mode={mode} initial={editItem} onClose={() => setSO(false)} onSaved={onSaved} />

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
