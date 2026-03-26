'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID
const SIDEBAR_W = 400

// ─── Colori ─────────────────────────────────────────────────
const TC = {
  IN:      { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  OUT:     { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  PRESENT: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
}
const HC = {
  CONFIRMED:   { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  PENDING:     { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  CHECKED_OUT: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
}

function isoToday() { return new Date().toISOString().split('T')[0] }
function fmtDate(s) {
  if (!s) return '–'
  return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function isTomorrow(s) {
  if (!s) return false
  const t = new Date(); t.setDate(t.getDate() + 1)
  return s === t.toISOString().split('T')[0]
}
function isToday(s) { return s === isoToday() }

function Badge({ label, style }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', border: `1px solid ${style.border || 'transparent'}`, background: style.bg, color: style.color }}>
      {label}
    </span>
  )
}

// ─── Travel Status inline selector ──────────────────────────
function TravelSelector({ crewId, current, onChange }) {
  const [saving, setSaving] = useState(false)
  async function pick(s) {
    if (s === current || saving) return
    setSaving(true)
    const { error } = await supabase.from('crew').update({ travel_status: s }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, s)
  }
  return (
    <div style={{ display: 'flex', gap: '3px' }} onClick={e => e.stopPropagation()}>
      {['IN', 'PRESENT', 'OUT'].map(s => {
        const c = TC[s]; const active = s === current
        return (
          <button key={s} onClick={() => pick(s)} disabled={saving}
            style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', opacity: saving ? 0.6 : 1 }}>
            {s}
          </button>
        )
      })}
    </div>
  )
}

// ─── Crew card compatta ──────────────────────────────────────
function CrewCard({ member, locations, onStatusChange, onEdit }) {
  const tc = TC[member.travel_status] || TC.PRESENT
  const hc = HC[member.hotel_status]  || HC.PENDING
  const hotel = locations[member.hotel_id] || member.hotel_id || '–'
  const depTomorrow = isTomorrow(member.departure_date)
  const depToday    = isToday(member.departure_date)
  const dim = member.hotel_status !== 'CONFIRMED'

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${tc.border}`, borderRadius: '10px', padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center' }}>

      {/* Info */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', color: dim ? '#94a3b8' : '#0f172a', fontSize: '14px' }}>{member.full_name}</span>
          <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 7px', borderRadius: '5px' }}>{member.department || 'NO DEPT'}</span>
          <Badge label={member.hotel_status} style={hc} />
          {(depToday || depTomorrow) && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px', border: '1px solid #fecaca' }}>
              {depToday ? '✈ TODAY' : '✈ TOMORROW'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
          <span>🏨 <strong>{hotel}</strong></span>
          {member.arrival_date && <span style={{ color: '#64748b' }}>arr {fmtDate(member.arrival_date)}</span>}
          {member.departure_date && (
            <span style={{ color: depTomorrow || depToday ? '#dc2626' : '#64748b', fontWeight: depTomorrow || depToday ? '700' : '400' }}>
              dep {fmtDate(member.departure_date)}
            </span>
          )}
          <span style={{ color: '#cbd5e1', fontSize: '11px' }}>{member.id}</span>
        </div>
        {member.notes && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', fontStyle: 'italic' }}>{member.notes}</div>}
      </div>

      {/* Travel selector */}
      <TravelSelector crewId={member.id} current={member.travel_status} onChange={onStatusChange} />

      {/* Edit button */}
      <button onClick={() => onEdit(member)}
        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
        ✎ Edit
      </button>
    </div>
  )
}

// ─── Sidebar form (Nuova + Modifica) ────────────────────────
function CrewSidebar({ open, mode, initial, locations, onClose, onSaved }) {
  const EMPTY = { id: '', full_name: '', department: '', hotel_id: '', hotel_status: 'PENDING', travel_status: 'PRESENT', arrival_date: '', departure_date: '', notes: '' }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null); setConfirmDel(false)
    if (mode === 'edit' && initial) {
      setForm({
        id:             initial.id || '',
        full_name:      initial.full_name || '',
        department:     initial.department || '',
        hotel_id:       initial.hotel_id || '',
        hotel_status:   initial.hotel_status || 'PENDING',
        travel_status:  initial.travel_status || 'PRESENT',
        arrival_date:   initial.arrival_date || '',
        departure_date: initial.departure_date || '',
        notes:          initial.notes || '',
      })
    } else {
      // Auto-genera Crew ID: prende il più alto CR#### esistente e incrementa
      setForm({ ...EMPTY })
      if (PRODUCTION_ID) {
        supabase.from('crew').select('id').eq('production_id', PRODUCTION_ID)
          .then(({ data }) => {
            let max = 0
            if (data) {
              data.forEach(row => {
                const m = row.id.match(/^CR(\d+)$/i)
                if (m) max = Math.max(max, parseInt(m[1]))
              })
            }
            setForm(f => ({ ...f, id: 'CR' + String(max + 1).padStart(4, '0') }))
          })
      }
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.full_name.trim()) { setError('Name required'); return }
    if (mode === 'new' && !form.id.trim()) { setError('Crew ID required'); return }
    setSaving(true)

    const row = {
      production_id:  PRODUCTION_ID,
      full_name:      form.full_name.trim(),
      department:     form.department.trim() || null,
      hotel_id:       form.hotel_id || null,
      hotel_status:   form.hotel_status,
      travel_status:  form.travel_status,
      arrival_date:   form.arrival_date || null,
      departure_date: form.departure_date || null,
      notes:          form.notes.trim() || null,
    }

    let error
    if (mode === 'new') {
      const r = await supabase.from('crew').insert({ ...row, id: form.id.trim().toUpperCase() })
      error = r.error
    } else {
      const r = await supabase.from('crew').update(row).eq('id', initial.id).eq('production_id', PRODUCTION_ID)
      error = r.error
    }

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    // Prima rimuovi assegnazioni ai trip
    await supabase.from('trip_passengers').delete().eq('crew_id', initial.id)
    const { error } = await supabase.from('crew').delete().eq('id', initial.id).eq('production_id', PRODUCTION_ID)
    setDeleting(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const row = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: `${SIDEBAR_W}px`,
        background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`,
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? 'New Crew Member' : 'Edit Crew Member'}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Crew ID (solo in new) */}
            {mode === 'new' ? (
              <div style={row}>
                <label style={lbl}>Crew ID</label>
                <input value={form.id} onChange={e => set('id', e.target.value.toUpperCase())} style={{ ...inp, fontWeight: '800', fontSize: '15px', letterSpacing: '0.05em' }} placeholder="CR0001" required />
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Auto-generato · modificabile se necessario · usato per QR code</div>
              </div>
            ) : (
              <div style={{ ...row, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>ID:</span>
                <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{initial?.id}</span>
              </div>
            )}

            {/* Nome */}
            <div style={row}>
              <label style={lbl}>Full Name *</label>
              <input value={form.full_name} onChange={e => set('full_name', e.target.value)} style={inp} placeholder="Mario Rossi" required />
            </div>

            {/* Dipartimento */}
            <div style={row}>
              <label style={lbl}>Department</label>
              <input value={form.department} onChange={e => set('department', e.target.value)} style={inp} placeholder="GRIP, CAMERA, PRODUCTION…" />
            </div>

            {/* Hotel */}
            <div style={row}>
              <label style={lbl}>Hotel / Location</label>
              <select value={form.hotel_id} onChange={e => set('hotel_id', e.target.value)} style={inp}>
                <option value="">– No hotel –</option>
                {locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                {locations.filter(l => l.is_hub).length > 0 && (
                  <optgroup label="Hubs">
                    {locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Hotel Status + Travel Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Hotel Status</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {['CONFIRMED', 'PENDING', 'CHECKED_OUT'].map(s => {
                    const c = HC[s]; const active = form.hotel_status === s
                    return (
                      <button key={s} type="button" onClick={() => set('hotel_status', s)}
                        style={{ padding: '5px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', textAlign: 'left' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={lbl}>Travel Status</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {['IN', 'PRESENT', 'OUT'].map(s => {
                    const c = TC[s]; const active = form.travel_status === s
                    return (
                      <button key={s} type="button" onClick={() => set('travel_status', s)}
                        style={{ padding: '5px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', textAlign: 'left' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Arrival Date</label>
                <input type="date" value={form.arrival_date} onChange={e => set('arrival_date', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Departure Date</label>
                <input type="date" value={form.departure_date} onChange={e => set('departure_date', e.target.value)} style={inp} />
              </div>
            </div>

            {/* Note */}
            <div style={row}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, resize: 'vertical', minHeight: '60px' }} placeholder="Notes, special requests…" />
            </div>

            {/* Elimina (solo edit) */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>
                  Zona pericolosa
                </div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    🗑 Delete Crew Member
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>
                      ⚠ Sure? All trip assignments will also be removed.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setConfirmDel(false)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        Annulla
                      </button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? 'Deleting…' : '⚠ Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
              Annulla
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Saving…' : mode === 'new' ? '+ Add Crew Member' : '✓ Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function CrewPage() {
  const router = useRouter()
  const [user, setUser]         = useState(null)
  const [crew, setCrew]         = useState([])
  const [locations, setLocs]    = useState([])   // array completo per form
  const [locsMap, setLocsMap]   = useState({})   // id→name per card display
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterTravel, setFT]   = useState('ALL')
  const [filterHotel, setFH]    = useState('ALL')
  const [filterDept, setFD]     = useState('ALL')
  const [groupByDept, setGD]    = useState(true)

  // Sidebar
  const [sidebarOpen, setSO]    = useState(false)
  const [sidebarMode, setSM]    = useState('new')  // 'new' | 'edit'
  const [editTarget, setET]     = useState(null)

  function openNew()          { setSM('new');  setET(null); setSO(true) }
  function openEdit(member)   { setSM('edit'); setET(member); setSO(true) }

  // Auth + dati
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) {
        await supabase.from('user_roles').upsert({ user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' }, { onConflict: 'user_id,production_id', ignoreDuplicates: true })
        const { data: locs } = await supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name')
        if (locs) {
          const m = {}; locs.forEach(l => { m[l.id] = l.name })
          setLocs(locs); setLocsMap(m)
        }
      }
      setUser(user)
    })
  }, [])

  const loadCrew = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase.from('crew').select('*').eq('production_id', PRODUCTION_ID).order('department', { nullsLast: true }).order('full_name')
    setCrew(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadCrew() }, [user, loadCrew])

  function handleStatusChange(id, s) { setCrew(p => p.map(c => c.id === id ? { ...c, travel_status: s } : c)) }

  function handleSaved() { setSO(false); loadCrew() }

  // Filtri
  const filtered = crew.filter(c => {
    if (filterTravel !== 'ALL' && c.travel_status !== filterTravel) return false
    if (filterHotel  !== 'ALL' && c.hotel_status  !== filterHotel)  return false
    if (filterDept   !== 'ALL' && (c.department || 'NO DEPT') !== filterDept) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.full_name.toLowerCase().includes(q) && !(c.department || '').toLowerCase().includes(q) && !(c.id || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const departments = [...new Set(crew.map(c => c.department || 'NO DEPT'))].sort()
  const counts = {
    total:    crew.length,
    conf:     crew.filter(c => c.hotel_status  === 'CONFIRMED').length,
    in:       crew.filter(c => c.travel_status === 'IN').length,
    present:  crew.filter(c => c.travel_status === 'PRESENT').length,
    out:      crew.filter(c => c.travel_status === 'OUT').length,
    depTomorrow: crew.filter(c => isTomorrow(c.departure_date)).length,
  }

  const groups = groupByDept
    ? Object.entries(filtered.reduce((a, c) => { const d = c.department || 'NO DEPT'; if (!a[d]) a[d] = []; a[d].push(c); return a }, {})).sort(([a], [b]) => a.localeCompare(b))
    : [['', filtered]]

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/crew" />

      {/* Sub-toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20, gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="text" placeholder="Search name, dept, ID…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '180px' }} />
          {/* Travel filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'IN', 'PRESENT', 'OUT'].map(s => {
              const active = filterTravel === s; const c = TC[s]
              return (
                <button key={s} onClick={() => setFT(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {/* Hotel filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'CONFIRMED', 'PENDING', 'CHECKED_OUT'].map(s => {
              const active = filterHotel === s; const c = HC[s]
              return (
                <button key={s} onClick={() => setFH(s)}
                  style={{ padding: '3px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s === 'ALL' ? 'All' : s === 'CHECKED_OUT' ? 'CHK OUT' : s}
                </button>
              )
            })}
          </div>
          {departments.length > 1 && (
            <select value={filterDept} onChange={e => setFD(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', cursor: 'pointer' }}>
              <option value="ALL">All depts</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <button onClick={() => setGD(p => !p)}
            style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: groupByDept ? '#eff6ff' : 'white', color: groupByDept ? '#1d4ed8' : '#64748b' }}>
            {groupByDept ? '▾ Dept' : '≡ Lista'}
          </button>
          {(filterTravel !== 'ALL' || filterHotel !== 'ALL' || filterDept !== 'ALL' || search) && (
            <button onClick={() => { setFT('ALL'); setFH('ALL'); setFD('ALL'); setSearch('') }}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>✕ Reset</button>
          )}
        </div>

        {/* Summary + New Crew */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[
            { n: counts.conf, l: 'CONF',    c: '#15803d', bg: '#f0fdf4', b: '#86efac' },
            { n: counts.in,   l: 'IN',      c: '#15803d', bg: '#dcfce7', b: '#86efac' },
            { n: counts.present, l: 'PRES', c: '#1d4ed8', bg: '#eff6ff', b: '#93c5fd' },
            { n: counts.out,  l: 'OUT',     c: '#c2410c', bg: '#fff7ed', b: '#fdba74' },
          ].map(s => (
            <span key={s.l} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>
              {s.n} {s.l}
            </span>
          ))}
          <button onClick={loadCrew}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
            ↻
          </button>
          <button onClick={openNew}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
            + New Crew Member
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', transition: 'margin-right 0.25s', marginRight: sidebarOpen ? `${SIDEBAR_W}px` : 'auto' }}>

        {/* Alert partenze domani */}
        {counts.depTomorrow > 0 && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>✈</span>
            <div>
              <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '13px' }}>{counts.depTomorrow} crew departing tomorrow</div>
              <div style={{ fontSize: '11px', color: '#ef4444' }}>Check Travel_Status = OUT</div>
            </div>
          </div>
        )}

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> non impostato in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Caricamento crew…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👤</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              {crew.length === 0 ? 'No crew in database' : 'No crew matching filters'}
            </div>
            {crew.length === 0 && (
              <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '8px' }}>
                + Aggiungi Crew
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {groups.map(([dept, members]) => (
              <div key={dept || 'all'}>
                {groupByDept && dept && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{dept}</div>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{members.length} · {members.filter(m => m.hotel_status === 'CONFIRMED').length} conf.</div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {['IN', 'PRESENT', 'OUT'].map(s => {
                        const n = members.filter(m => m.travel_status === s).length
                        if (!n) return null
                        return <span key={s} style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: TC[s].bg, color: TC[s].color, border: `1px solid ${TC[s].border}` }}>{n} {s}</span>
                      })}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {members.map(m => (
                    <CrewCard key={m.id} member={m} locations={locsMap} onStatusChange={handleStatusChange} onEdit={openEdit} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <CrewSidebar
        open={sidebarOpen}
        mode={sidebarMode}
        initial={editTarget}
        locations={locations}
        onClose={() => setSO(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
