'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { normalizeDept } from '../../../lib/normalizeDept'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'
import NotesPanel from '../../../lib/NotesPanel'

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

function hotelOccupancy(arrival, departure, stillInTransit = false) {
  const today = isoToday()
  if (!arrival && !departure) return null
  if (departure && isToday(departure))    return { label: '🏁 CHK OUT TODAY',    style: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' } }
  if (departure && isTomorrow(departure)) return { label: '🏁 CHK OUT TOMORROW', style: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' } }
  // Se il volo/treno arriva oggi ma non è ancora atterrato → non è ancora in hotel
  if (arrival && today === arrival && stillInTransit) return { label: '🛬 Arriving Today', style: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' } }
  if (arrival && today >= arrival && (!departure || today < departure)) return { label: '🏨 In Hotel', style: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' } }
  if (arrival && today < arrival)         return { label: '🔜 Arriving ' + fmtDate(arrival), style: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' } }
  if (departure && today >= departure)    return { label: '🧳 Checked Out', style: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' } }
  return null
}

function Badge({ label, style }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', border: `1px solid ${style.border || 'transparent'}`, background: style.bg, color: style.color }}>
      {label}
    </span>
  )
}

// ─── Travel Status inline selector ──────────────────────────
function TravelSelector({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
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

// ─── NTN Toggle inline ──────────────────────────────────────
function NTNToggle({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
  const [saving, setSaving] = useState(false)
  async function toggle() {
    if (saving) return
    setSaving(true)
    const next = !current
    const { error } = await supabase.from('crew').update({ no_transport_needed: next }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, next)
  }
  return (
    <button onClick={e => { e.stopPropagation(); toggle() }} disabled={saving} title={current ? 'Rimuovi NTN' : 'Segna come Self Drive / NTN'}
      style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${current ? '#fca5a5' : '#e2e8f0'}`, background: current ? '#dc2626' : 'white', color: current ? 'white' : '#cbd5e1', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
      🚐
    </button>
  )
}

// ─── Remote Toggle inline ────────────────────────────────────
function RemoteToggle({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
  const [saving, setSaving] = useState(false)
  const isRemote = current === false  // on_location=false → remoto
  async function toggle() {
    if (saving) return
    setSaving(true)
    const next = current === false ? true : false
    const { error } = await supabase.from('crew').update({ on_location: next }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, next)
  }
  return (
    <button onClick={e => { e.stopPropagation(); toggle() }} disabled={saving}
      title={isRemote ? 'Segna come In Set' : 'Segna come Remoto / Non in Set'}
      style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${isRemote ? '#94a3b8' : '#e2e8f0'}`, background: isRemote ? '#f1f5f9' : 'white', color: isRemote ? '#475569' : '#cbd5e1', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
      🏠
    </button>
  )
}

// ─── Contact Popover ────────────────────────────────────────
function ContactPopover({ crewId, email, phone, onSaved }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [eVal, setEVal]       = useState(email || '')
  const [pVal, setPVal]       = useState(phone || '')
  const [saving, setSaving]   = useState(false)
  const ref = useRef(null)

  // Click outside → chiudi
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setEditing(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Sync props quando cambiano dal genitore
  useEffect(() => {
    if (!editing) { setEVal(email || ''); setPVal(phone || '') }
  }, [email, phone, editing])

  const hasContact = !!(email || phone)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('crew')
      .update({ email: eVal.trim() || null, phone: pVal.trim() || null })
      .eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) {
      onSaved(crewId, { email: eVal.trim() || null, phone: pVal.trim() || null })
      setEditing(false)
    }
  }

  function handleCancel() {
    setEVal(email || ''); setPVal(phone || ''); setEditing(false)
  }

  const inpStyle = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      {/* Pulsante trigger */}
      <button
        onClick={() => { setOpen(p => !p); setEditing(false) }}
        title={t.crewContactInfo}
        style={{
          padding: '3px 9px', borderRadius: '7px', fontSize: '12px', fontWeight: '600',
          cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
          ...(hasContact
            ? { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
            : { background: 'white', color: '#cbd5e1', borderColor: '#e2e8f0' }),
        }}
      >
        {hasContact ? '📞' : '📞+'}
      </button>

      {/* Popover */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          background: 'white', border: '1px solid #e2e8f0',
          borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          width: '240px', zIndex: 100, padding: '12px',
        }}>
          {/* Header popover */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>📞 {t.crewContactInfo}</span>
            <button onClick={() => { setOpen(false); setEditing(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '2px' }}>
              ✕
            </button>
          </div>

          {!editing ? (
            <>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', marginBottom: '2px', textTransform: 'uppercase' }}>📧 {t.crewEmailLabel}</div>
                <div style={{ fontSize: '12px', color: email ? '#0f172a' : '#cbd5e1', wordBreak: 'break-all' }}>
                  {email ? <a href={`mailto:${email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{email}</a> : '—'}
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', marginBottom: '2px', textTransform: 'uppercase' }}>📱 {t.crewPhoneLabel}</div>
                <div style={{ fontSize: '12px', color: phone ? '#0f172a' : '#cbd5e1' }}>
                  {phone ? <a href={`tel:${phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{phone}</a> : '—'}
                </div>
              </div>
              <button onClick={() => setEditing(true)}
                style={{ width: '100%', padding: '5px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                ✎ {t.edit}
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '3px', textTransform: 'uppercase' }}>📧 {t.crewEmailLabel}</label>
                <input value={eVal} onChange={e => setEVal(e.target.value)} style={inpStyle} type="email" placeholder="email@example.com" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '3px', textTransform: 'uppercase' }}>📱 {t.crewPhoneLabel}</label>
                <input value={pVal} onChange={e => setPVal(e.target.value)} style={inpStyle} type="tel" placeholder="+39 333 1234567" />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleCancel} disabled={saving}
                  style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                  {t.cancel}
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ flex: 1, padding: '5px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
                  {saving ? t.saving : t.save}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── StayForm (standalone — must NOT be nested inside AccommodationAccordion) ─
const STAY_INP = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const STAY_LBL = { fontSize: '10px', fontWeight: '700', color: '#15803d', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }

function StayForm({ form, setF, onSave, onCancel, saveLabel, saving, hotelLocations }) {
  return (
    <div style={{ background: 'white', border: '1px dashed #86efac', borderRadius: '7px', padding: '8px 10px', marginBottom: '6px' }}>
      <div style={{ marginBottom: '6px' }}>
        <label style={STAY_LBL}>Hotel</label>
        <select value={form.hotel_id || ''} onChange={e => setF(f => ({ ...f, hotel_id: e.target.value }))} style={STAY_INP}>
          <option value="">– No hotel –</option>
          {hotelLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
        <div>
          <label style={STAY_LBL}>Check-in</label>
          <input type="date" value={form.arrival_date || ''} onChange={e => setF(f => ({ ...f, arrival_date: e.target.value }))} style={STAY_INP} />
        </div>
        <div>
          <label style={STAY_LBL}>Check-out</label>
          <input type="date" value={form.departure_date || ''} onChange={e => setF(f => ({ ...f, departure_date: e.target.value }))} style={STAY_INP} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: '4px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving || !form.arrival_date || !form.departure_date}
          style={{ flex: 2, padding: '4px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Accommodation Accordion ────────────────────────────────
function AccommodationAccordion({ crewId, locations, onCrewDatesUpdated }) {
  const PRODUCTION_ID = getProductionId()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stays, setStays] = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ hotel_id: '', arrival_date: '', departure_date: '' })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelId, setConfirmDelId] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('crew_stays')
      .select('id, hotel_id, arrival_date, departure_date')
      .eq('crew_id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .order('arrival_date', { ascending: true })
    setStays(data || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function syncCrewDates(newStays) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const active = newStays.find(s => s.arrival_date <= today && s.departure_date >= today)
      || newStays.find(s => s.arrival_date > today)
      || newStays[newStays.length - 1]
    if (active) {
      await supabase.from('crew').update({
        hotel_id:       active.hotel_id || null,
        arrival_date:   active.arrival_date || null,
        departure_date: active.departure_date || null,
      }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
      onCrewDatesUpdated && onCrewDatesUpdated(active)
    }
  }

  async function handleAdd() {
    if (!addForm.arrival_date || !addForm.departure_date) return
    setSaving(true)
    const { data, error } = await supabase
      .from('crew_stays')
      .insert({
        production_id:  PRODUCTION_ID,
        crew_id:        crewId,
        hotel_id:       addForm.hotel_id || null,
        arrival_date:   addForm.arrival_date,
        departure_date: addForm.departure_date,
      })
      .select('id, hotel_id, arrival_date, departure_date')
      .single()
    setSaving(false)
    if (error) return
    const newStays = [...stays, data].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))
    setStays(newStays)
    setAddOpen(false)
    setAddForm({ hotel_id: '', arrival_date: '', departure_date: '' })
    await syncCrewDates(newStays)
  }

  async function handleEditSave(id) {
    setSaving(true)
    const { error } = await supabase
      .from('crew_stays')
      .update({
        hotel_id:       editForm.hotel_id || null,
        arrival_date:   editForm.arrival_date,
        departure_date: editForm.departure_date,
      })
      .eq('id', id)
    setSaving(false)
    if (error) return
    const newStays = stays
      .map(s => s.id === id ? { ...s, ...editForm } : s)
      .sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))
    setStays(newStays)
    setEditId(null)
    await syncCrewDates(newStays)
  }

  async function handleDelete(id) {
    if (confirmDelId !== id) { setConfirmDelId(id); return }
    setSaving(true)
    await supabase.from('crew_stays').delete().eq('id', id)
    setSaving(false)
    const newStays = stays.filter(s => s.id !== id)
    setStays(newStays)
    setConfirmDelId(null)
    if (newStays.length > 0) await syncCrewDates(newStays)
  }

  const hotelLocations = locations.filter(l => !l.is_hub)

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: open ? '8px 8px 0 0' : '8px', border: '1px solid #e2e8f0', background: open ? '#f0fdf4' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: open ? '#15803d' : '#374151' }}>
          🏨 Accommodation — Stays
          {stays.length > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: '999px', border: '1px solid #86efac' }}>✓ {stays.length} stay{stays.length > 1 ? 's' : ''}</span>
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
              {stays.length === 0 && !addOpen && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontStyle: 'italic' }}>No stays recorded</div>
              )}

              {stays.map(s => {
                const hotel = locations.find(l => l.id === s.hotel_id)
                if (editId === s.id) {
                  return (
                    <div key={s.id}>
                     <StayForm
                        form={editForm}
                        setF={setEditForm}
                        onSave={() => handleEditSave(s.id)}
                        onCancel={() => setEditId(null)}
                        saveLabel="✓ Save Stay"
                        saving={saving}
                        hotelLocations={hotelLocations}
                      />
                    </div>
                  )
                }
                const depToday    = isToday(s.departure_date)
                const depTomorrow = isTomorrow(s.departure_date)
                return (
                  <div key={s.id} style={{ background: 'white', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '7px 10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>🏨 {hotel?.name || s.hotel_id || '–'}</span>
                      <span style={{ color: '#64748b', marginLeft: '8px' }}>arr {fmtDate(s.arrival_date)}</span>
                      <span style={{ marginLeft: '6px', color: depToday || depTomorrow ? '#dc2626' : '#64748b', fontWeight: depToday || depTomorrow ? '700' : '400' }}>dep {fmtDate(s.departure_date)}</span>
                    </div>
                    <button type="button"
                      onClick={() => { setEditId(s.id); setEditForm({ hotel_id: s.hotel_id || '', arrival_date: s.arrival_date, departure_date: s.departure_date }) }}
                      style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#15803d', flexShrink: 0 }}>
                      ✎
                    </button>
                    {confirmDelId === s.id ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button type="button" onClick={() => setConfirmDelId(null)}
                          style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 6px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                        <button type="button" onClick={() => handleDelete(s.id)} disabled={saving}
                          style={{ background: '#dc2626', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'white', fontWeight: '700' }}>⚠ Del</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelId(s.id)}
                        style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0 }}>🗑</button>
                    )}
                  </div>
                )
              })}

              {addOpen ? (
                <StayForm
                  form={addForm}
                  setF={setAddForm}
                  onSave={handleAdd}
                  onCancel={() => { setAddOpen(false); setAddForm({ hotel_id: '', arrival_date: '', departure_date: '' }) }}
                  saveLabel="+ Add Stay"
                  saving={saving}
                  hotelLocations={hotelLocations}
                />
              ) : (
                <button type="button" onClick={() => setAddOpen(true)}
                  style={{ width: '100%', padding: '6px', borderRadius: '7px', border: '1px dashed #86efac', background: 'transparent', color: '#16a34a', fontSize: '11px', fontWeight: '700', cursor: 'pointer', marginTop: stays.length > 0 ? '4px' : '0' }}>
                  + Add Stay
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MovForm (standalone — must NOT be nested inside TravelAccordion) ─────────
const MOV_INP = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const MOV_LBL = { fontSize: '10px', fontWeight: '700', color: '#6d28d9', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }

function MovForm({ form, setF, onSave, onCancel, saveLabel, saving }) {
  const dirBg = form.direction === 'IN' ? '#f0fdf4' : '#fff7ed'
  return (
    <div style={{ background: 'white', border: '1px dashed #c4b5fd', borderRadius: '7px', padding: '8px 10px', marginBottom: '6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        <div>
          <label style={MOV_LBL}>Date</label>
          <input type="date" value={form.travel_date || ''} onChange={e => setF(f => ({ ...f, travel_date: e.target.value }))} style={MOV_INP} />
        </div>
        <div>
          <label style={MOV_LBL}>Direction</label>
          <select value={form.direction || 'IN'} onChange={e => setF(f => ({ ...f, direction: e.target.value }))} style={{ ...MOV_INP, background: dirBg }}>
            <option value="IN">↓ IN — Arrival</option>
            <option value="OUT">↑ OUT — Departure</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        <div>
          <label style={MOV_LBL}>Type</label>
          <select value={form.travel_type || 'FLIGHT'} onChange={e => setF(f => ({ ...f, travel_type: e.target.value }))} style={MOV_INP}>
            <option value="FLIGHT">✈️ Flight</option>
            <option value="TRAIN">🚂 Train</option>
            <option value="GROUND">🚐 Ground</option>
            <option value="OA">📋 OA</option>
          </select>
        </div>
        <div>
          <label style={MOV_LBL}>Number</label>
          <input value={form.travel_number || ''} onChange={e => setF(f => ({ ...f, travel_number: e.target.value }))} style={MOV_INP} placeholder="FR1234" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px', marginBottom: '6px' }}>
        <div>
          <label style={MOV_LBL}>From</label>
          <input value={form.from_location || ''} onChange={e => setF(f => ({ ...f, from_location: e.target.value }))} style={MOV_INP} placeholder="LHR" />
        </div>
        <div>
          <label style={MOV_LBL}>Dep time</label>
          <input type="time" value={form.from_time || ''} onChange={e => setF(f => ({ ...f, from_time: e.target.value }))} style={MOV_INP} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px', marginBottom: '6px' }}>
        <div>
          <label style={MOV_LBL}>To</label>
          <input value={form.to_location || ''} onChange={e => setF(f => ({ ...f, to_location: e.target.value }))} style={MOV_INP} placeholder="BRI" />
        </div>
        <div>
          <label style={MOV_LBL}>Arr time</label>
          <input type="time" value={form.to_time || ''} onChange={e => setF(f => ({ ...f, to_time: e.target.value }))} style={MOV_INP} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <input type="checkbox" checked={!!form.needs_transport} onChange={e => setF(f => ({ ...f, needs_transport: e.target.checked }))} style={{ width: '14px', height: '14px', accentColor: '#2563eb', cursor: 'pointer' }} />
        <span style={{ fontSize: '11px', color: '#374151', cursor: 'pointer' }}>🚐 Needs transport to/from hub</span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: '4px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving || !form.travel_date}
          style={{ flex: 2, padding: '4px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#6d28d9', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Travel Accordion ────────────────────────────────────────
function TravelAccordion({ crewId }) {
  const PRODUCTION_ID = getProductionId()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
  const EMPTY_MOV = { travel_date: '', direction: 'IN', travel_type: 'FLIGHT', travel_number: '', from_location: '', from_time: '', to_location: '', to_time: '', needs_transport: false }
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_MOV)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelId, setConfirmDelId] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('travel_movements')
      .select('id, travel_date, direction, travel_type, travel_number, from_location, from_time, to_location, to_time, needs_transport')
      .eq('crew_id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .order('travel_date', { ascending: true })
    setMovements(data || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function handleAdd() {
    if (!addForm.travel_date) return
    setSaving(true)
    const { data, error } = await supabase
      .from('travel_movements')
      .insert({
        production_id:  PRODUCTION_ID,
        crew_id:        crewId,
        travel_date:    addForm.travel_date,
        direction:      addForm.direction,
        travel_type:    addForm.travel_type,
        travel_number:  addForm.travel_number.trim() || null,
        from_location:  addForm.from_location.trim() || null,
        from_time:      addForm.from_time || null,
        to_location:    addForm.to_location.trim() || null,
        to_time:        addForm.to_time || null,
        needs_transport: addForm.needs_transport,
        match_status:   'matched',
      })
      .select('id, travel_date, direction, travel_type, travel_number, from_location, from_time, to_location, to_time, needs_transport')
      .single()
    setSaving(false)
    if (error) return
    setMovements(prev => [...prev, data].sort((a, b) => a.travel_date.localeCompare(b.travel_date)))
    setAddOpen(false)
    setAddForm(EMPTY_MOV)
  }

  async function handleEditSave(id) {
    setSaving(true)
    const { error } = await supabase
      .from('travel_movements')
      .update({
        travel_date:    editForm.travel_date,
        direction:      editForm.direction,
        travel_type:    editForm.travel_type,
        travel_number:  (editForm.travel_number || '').trim() || null,
        from_location:  (editForm.from_location || '').trim() || null,
        from_time:      editForm.from_time || null,
        to_location:    (editForm.to_location || '').trim() || null,
        to_time:        editForm.to_time || null,
        needs_transport: editForm.needs_transport,
      })
      .eq('id', id)
    setSaving(false)
    if (error) return
    setMovements(prev =>
      prev.map(m => m.id === id ? { ...m, ...editForm } : m)
        .sort((a, b) => a.travel_date.localeCompare(b.travel_date))
    )
    setEditId(null)
  }

  async function handleDelete(id) {
    if (confirmDelId !== id) { setConfirmDelId(id); return }
    setSaving(true)
    await supabase.from('travel_movements').delete().eq('id', id)
    setSaving(false)
    setMovements(prev => prev.filter(m => m.id !== id))
    setConfirmDelId(null)
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: open ? '8px 8px 0 0' : '8px', border: '1px solid #e2e8f0', background: open ? '#faf5ff' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: open ? '#6d28d9' : '#374151' }}>
          ✈️ Travel Movements
          {movements.length > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#6d28d9', background: '#f3e8ff', padding: '1px 6px', borderRadius: '999px', border: '1px solid #c4b5fd' }}>✓ {movements.length}</span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#faf5ff', padding: '10px 12px 8px' }}>
          {loading ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>Loading…</div>
          ) : (
            <>
              {movements.length === 0 && !addOpen && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontStyle: 'italic' }}>No travel movements recorded</div>
              )}

              {movements.map(m => {
                const icon = m.travel_type === 'FLIGHT' ? '✈️' : m.travel_type === 'TRAIN' ? '🚂' : '🚐'
                const isIN = m.direction === 'IN'
                const isPast = m.travel_date < today
                if (editId === m.id) {
                  return (
                    <div key={m.id}>
                      <MovForm
                        form={editForm}
                        setF={setEditForm}
                        onSave={() => handleEditSave(m.id)}
                        onCancel={() => setEditId(null)}
                        saveLabel="✓ Save"
                        saving={saving}
                      />
                    </div>
                  )
                }
                return (
                  <div key={m.id} style={{ background: isIN ? '#f0fdf4' : '#fff7ed', border: `1px solid ${isIN ? '#86efac' : '#fdba74'}`, borderRadius: '7px', padding: '6px 10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', opacity: isPast ? 0.65 : 1 }}>
                    <div style={{ flex: 1, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{icon}</span>
                      <span style={{ fontWeight: '700', color: isIN ? '#15803d' : '#c2410c', fontSize: '11px' }}>{m.direction}</span>
                      {m.travel_number && <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '11px', color: '#0f172a' }}>{m.travel_number}</span>}
                      <span style={{ color: '#374151' }}>{m.from_location || '–'} → {m.to_location || '–'}</span>
                      {isIN  && m.to_time   && <span style={{ color: '#64748b', fontSize: '11px' }}>arr {m.to_time}</span>}
                      {!isIN && m.from_time && <span style={{ color: '#64748b', fontSize: '11px' }}>dep {m.from_time}</span>}
                      <span style={{ color: '#94a3b8', fontSize: '11px' }}>{fmtDate(m.travel_date)}</span>
                      {m.needs_transport && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 4px' }}>🚐</span>
                      )}
                    </div>
                    <button type="button"
                      onClick={() => { setEditId(m.id); setEditForm({ travel_date: m.travel_date, direction: m.direction, travel_type: m.travel_type, travel_number: m.travel_number || '', from_location: m.from_location || '', from_time: m.from_time || '', to_location: m.to_location || '', to_time: m.to_time || '', needs_transport: !!m.needs_transport }) }}
                      style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#15803d', flexShrink: 0 }}>
                      ✎
                    </button>
                    {confirmDelId === m.id ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button type="button" onClick={() => setConfirmDelId(null)}
                          style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 6px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                        <button type="button" onClick={() => handleDelete(m.id)} disabled={saving}
                          style={{ background: '#dc2626', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'white', fontWeight: '700' }}>⚠ Del</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelId(m.id)}
                        style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0 }}>🗑</button>
                    )}
                  </div>
                )
              })}

              {addOpen ? (
                <MovForm
                  form={addForm}
                  setF={setAddForm}
                  onSave={handleAdd}
                  onCancel={() => { setAddOpen(false); setAddForm(EMPTY_MOV) }}
                  saveLabel="+ Add Movement"
                  saving={saving}
                />
              ) : (
                <button type="button" onClick={() => setAddOpen(true)}
                  style={{ width: '100%', padding: '6px', borderRadius: '7px', border: '1px dashed #c4b5fd', background: 'transparent', color: '#6d28d9', fontSize: '11px', fontWeight: '700', cursor: 'pointer', marginTop: movements.length > 0 ? '4px' : '0' }}>
                  + Add Movement
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FamilyModal ─────────────────────────────────────────────
function FamilyModal({ crew, onClose, onEdit }) {
  if (!crew) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,35,64,0.2)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', width: '340px', padding: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>👨‍👩‍👧 Family — {crew.crewName}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px' }}>✕</button>
        </div>
        {crew.members.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>No family members found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {crew.members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FAEEDA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#633806', flexShrink: 0 }}>
                  {m.full_name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</div>
                  <div style={{ fontSize: '11px', color: '#92400e' }}>{m.role || 'Family'}{m.no_transport_needed ? ' · NTN' : ' · Transport needed'}</div>
                </div>
                <button onClick={() => onEdit(m)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>
                  ✎
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: '11px', color: '#94a3b8', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', lineHeight: 1.5 }}>
          ℹ To add a family member, use <strong>+ Add Crew</strong> and set person type to <strong>Family</strong>, linked to this crew member.
        </div>
      </div>
    </>
  )
}

// ─── Crew card compatta ──────────────────────────────────────
function CrewCard({ member, locations, onStatusChange, onNTNChange, onRemoteChange, onEdit, onContactSaved, selected, onToggleSelect, onDelete, travelInfo = [], stays = [], unreadCount = 0, notesCount = 0, isLocal = false, familyCount = 0, onFamilyClick }) {
  const t = useT()
  const isMobile = useIsMobile()
  const tc = TC[member.travel_status] || TC.PRESENT
  const hc = HC[member.hotel_status]  || HC.PENDING
  const hotel = locations[member.hotel_id] || member.hotel_id || '–'
  const isRemote = member.on_location === false
  const depTomorrow = isTomorrow(member.departure_date)
  const depToday    = isToday(member.departure_date)
  const dim = member.hotel_status !== 'CONFIRMED'
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  // Calcola se il membro è ancora in transito oggi (volo non ancora atterrato)
  // → usato da hotelOccupancy per non mostrare "In Hotel" prima dell'arrivo
  const todayStr = isoToday()
  const _nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const _nowTime = `${String(_nowRome.getHours()).padStart(2, '0')}:${String(_nowRome.getMinutes()).padStart(2, '0')}`
  const stillInTransit = travelInfo.some(tm =>
    tm.travel_date === todayStr &&
    tm.direction === 'IN' &&
    (!tm.to_time || tm.to_time.slice(0, 5) > _nowTime)
  )

  async function handleDeleteClick() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await onDelete(member.id)
    setDeleting(false)
    setConfirmDel(false)
  }

  return (
    <div style={{ background: selected ? '#eff6ff' : (isRemote ? '#f8fafc' : 'white'), border: `1px solid ${selected ? '#bfdbfe' : (isRemote ? '#cbd5e1' : '#e2e8f0')}`, borderLeft: `4px solid ${selected ? '#3b82f6' : (isRemote ? '#94a3b8' : tc.border)}`, borderRadius: '10px', padding: '12px 14px', display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '20px 1fr auto auto auto auto auto auto', gap: '8px', alignItems: isMobile ? 'stretch' : 'start' }}>

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(member.id)}
        onClick={e => e.stopPropagation()}
        style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Info */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', color: (dim || isRemote) ? '#94a3b8' : '#0f172a', fontSize: '14px' }}>{member.full_name}</span>
          {unreadCount > 0 && (
            <span title={`${unreadCount} unread note${unreadCount > 1 ? 's' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', color: 'white', background: '#f97316', borderRadius: '999px', minWidth: '18px', height: '18px', padding: '0 4px', border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', lineHeight: 1 }}>
              ❗
            </span>
          )}
          {notesCount > 0 && unreadCount === 0 && (
            <span title={`${notesCount} note${notesCount > 1 ? 's' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#92400e', background: '#fef3c7', borderRadius: '999px', minWidth: '18px', height: '18px', padding: '0 3px', border: '1px solid #fcd34d', lineHeight: 1 }}>
              💬
            </span>
          )}
          {familyCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onFamilyClick && onFamilyClick() }}
              title={`${familyCount} family member${familyCount > 1 ? 's' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '999px', background: '#FAEEDA', color: '#633806', border: '1px solid #FAC775', cursor: 'pointer', lineHeight: 1 }}>
              F {familyCount > 1 ? familyCount : ''}
            </button>
          )}
          {member.role && (
            <span style={{ fontSize: '11px', color: '#374151', background: '#f1f5f9', padding: '1px 7px', borderRadius: '5px', fontWeight: '600' }}>{member.role}</span>
          )}
          <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '1px 7px', borderRadius: '5px' }}>{member.department || 'NO DEPT'}</span>
          {!isLocal && <Badge label={member.hotel_status} style={hc} />}
          {isRemote && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #94a3b8' }}>
              🏠 Remote
            </span>
          )}
          {isLocal && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', background: '#fef9c3', padding: '2px 8px', borderRadius: '6px', border: '1px solid #fde68a' }}>
              📍 Local
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
          {stays.filter(s => s.hotel_id && s.arrival_date && s.departure_date).length <= 1 && <span>🏨 <strong>{hotel}</strong></span>}
          {stays.filter(s => s.hotel_id && s.arrival_date && s.departure_date).length > 1 ? (
            stays.filter(s => s.hotel_id && s.arrival_date && s.departure_date).map((s, i) => {
              const sHotel = locations[s.hotel_id] || s.hotel_id || '–'
              const occ = hotelOccupancy(s.arrival_date, s.departure_date, s.arrival_date === todayStr && stillInTransit)
              const sDepToday    = isToday(s.departure_date)
              const sDepTomorrow = isTomorrow(s.departure_date)
              return (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 7px' }}>
                  🏨 <strong>{sHotel}</strong>
                  <span style={{ color: '#64748b' }}>arr {fmtDate(s.arrival_date)}</span>
                  <span style={{ color: sDepTomorrow || sDepToday ? '#dc2626' : '#64748b', fontWeight: sDepTomorrow || sDepToday ? '700' : '400' }}>dep {fmtDate(s.departure_date)}</span>
                  {occ && <span style={{ fontWeight: '700', color: occ.style.color }}>· {occ.label}</span>}
                </span>
              )
            })
          ) : (
            <>
              {member.arrival_date && <span style={{ color: '#64748b' }}>arr {fmtDate(member.arrival_date)}</span>}
              {member.departure_date && (
                <span style={{ color: depTomorrow || depToday ? '#dc2626' : '#64748b', fontWeight: depTomorrow || depToday ? '700' : '400' }}>
                  dep {fmtDate(member.departure_date)}
                </span>
              )}
              {(() => {
                const occ = hotelOccupancy(member.arrival_date, member.departure_date, stillInTransit)
                return occ ? (
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: occ.style.bg, color: occ.style.color, border: `1px solid ${occ.style.border}` }}>
                    {occ.label}
                  </span>
                ) : null
              })()}
            </>
          )}
          <span style={{ color: '#cbd5e1', fontSize: '11px' }}>{member.id}</span>
        </div>
        {member.notes && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', fontStyle: 'italic' }}>{member.notes}</div>}
        {travelInfo.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
            {travelInfo.slice(0, 3).map((tm, idx) => {
              const icon = tm.travel_type === 'FLIGHT' ? '✈️'
                         : tm.travel_type === 'TRAIN'  ? '🚂'
                         : '🚐'
              const dateStr = new Date(tm.travel_date + 'T12:00:00Z')
                .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#374151', background: tm.direction === 'IN' ? '#f0fdf4' : '#fff7ed', border: `1px solid ${tm.direction === 'IN' ? '#86efac' : '#fdba74'}`, borderRadius: '5px', padding: '2px 8px' }}>
                  <span>{icon}</span>
                  <span style={{ fontWeight: '700', color: tm.direction === 'IN' ? '#15803d' : '#c2410c' }}>
                    {tm.direction === 'IN' ? '↓' : '↑'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '10px' }}>{tm.travel_number || '–'}</span>
                  <span style={{ color: '#64748b' }}>{tm.from_location || '–'} → {tm.to_location || '–'}</span>
                  {tm.direction === 'IN' && tm.to_time && <span style={{ color: '#64748b' }}>arr {tm.to_time.slice(0, 5)}</span>}
                  {tm.direction === 'OUT' && tm.from_time && <span style={{ color: '#64748b' }}>dep {tm.from_time.slice(0, 5)}</span>}
                  <span style={{ color: '#94a3b8', marginLeft: '2px' }}>{dateStr}</span>
                  {tm.needs_transport && (
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 4px' }}>🚐</span>
                  )}
                </div>
              )
            })}
            {travelInfo.length > 3 && (
              <div style={{ fontSize: '10px', color: '#94a3b8', paddingLeft: '8px' }}>
                +{travelInfo.length - 3} more movements
              </div>
            )}
          </div>
        )}
      </div>

      {/* Travel selector */}
      <TravelSelector crewId={member.id} current={member.travel_status} onChange={onStatusChange} />

      {/* NTN toggle */}
      <NTNToggle crewId={member.id} current={member.no_transport_needed} onChange={onNTNChange} />

      {/* Remote toggle */}
      <RemoteToggle crewId={member.id} current={member.on_location} onChange={onRemoteChange} />

      {/* Contact button */}
      <ContactPopover crewId={member.id} email={member.email} phone={member.phone} onSaved={onContactSaved} />

      {/* Edit button */}
      <button onClick={() => onEdit(member)}
        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
        ✎ Edit
      </button>

      {/* Delete inline */}
      {!confirmDel ? (
        <button onClick={e => { e.stopPropagation(); handleDeleteClick() }}
          style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#dc2626', lineHeight: 1 }}
          title={t.deleteCrew}>🗑</button>
      ) : (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setConfirmDel(false)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>✕</button>
          <button onClick={handleDeleteClick} disabled={deleting}
            style={{ background: '#dc2626', border: 'none', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '800', color: 'white', whiteSpace: 'nowrap' }}>
            {deleting ? '…' : '⚠ ' + t.confirm}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar form (Nuova + Modifica) ────────────────────────
function CrewSidebar({ open, mode, initial, locations, deptOptions = [], onClose, onSaved, currentUser, onNotesChanged }) {
  const t = useT()
  const EMPTY = { id: '', full_name: '', role: '', department: '', hotel_id: '', hotel_status: 'PENDING', travel_status: 'PRESENT', arrival_date: '', departure_date: '', notes: '', no_transport_needed: false, on_location: true, email: '', phone: '', is_local: false, person_type: 'CREW', linked_crew_id: null }
  const PRODUCTION_ID = getProductionId()
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [linkedCrewSearch,   setLinkedCrewSearch]   = useState('')
  const [linkedCrewResults,  setLinkedCrewResults]  = useState([])
  const [linkedCrewSearching, setLinkedCrewSearching] = useState(false)
  const [editKey, setEditKey] = useState(0)

  // Incrementa editKey ogni volta che la sidebar si apre in modalità edit
  // così AccommodationAccordion e TravelAccordion vengono rimontati freschi
  useEffect(() => {
    if (open && mode === 'edit' && initial?.id) {
      setEditKey(k => k + 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setError(null); setConfirmDel(false)
    if (mode === 'edit' && initial) {
      setForm({
        id:             initial.id || '',
        full_name:      initial.full_name || '',
        role:           initial.role || '',
        department:     initial.department || '',
        hotel_id:             initial.hotel_id || '',
        hotel_status:         initial.hotel_status || 'PENDING',
        travel_status:        initial.travel_status || 'PRESENT',
        arrival_date:         initial.arrival_date || '',
        departure_date:       initial.departure_date || '',
        notes:                initial.notes || '',
        no_transport_needed:  initial.no_transport_needed || false,
        on_location:          initial.on_location !== false,
        email:                initial.email || '',
        phone:                initial.phone || '',
        is_local:             initial.is_local || false,
        person_type:          initial.person_type    || 'CREW',
        linked_crew_id:       initial.linked_crew_id || null,
      })
    } else {
      // Auto-genera Crew ID: prende il più alto CR#### esistente e incrementa
      // Spread initial (se presente) per pre-popolare name/hotel/date dal banner "Yes, add"
      setForm({ ...EMPTY, ...(initial || {}), person_type: initial?.person_type || 'CREW', linked_crew_id: initial?.linked_crew_id || null })
      if (initial?.linked_crew_name) setLinkedCrewSearch(initial.linked_crew_name)
      else setLinkedCrewSearch('')
      setLinkedCrewResults([])
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

  async function searchLinkedCrew(q) {
    if (!q || q.length < 2 || !PRODUCTION_ID) { setLinkedCrewResults([]); return }
    setLinkedCrewSearching(true)
    const { data } = await supabase.from('crew').select('id, full_name, role, department').eq('production_id', PRODUCTION_ID).eq('person_type', 'CREW').ilike('full_name', `%${q}%`).limit(8)
    setLinkedCrewResults(data || [])
    setLinkedCrewSearching(false)
  }

  useEffect(() => {
    if (form.linked_crew_id) return
    const timer = setTimeout(() => searchLinkedCrew(linkedCrewSearch), 300)
    return () => clearTimeout(timer)
  }, [linkedCrewSearch, form.linked_crew_id])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.full_name.trim()) { setError('Name required'); return }
    if (mode === 'new' && !form.id.trim()) { setError('Crew ID required'); return }
    setSaving(true)

    const row = {
      production_id:  PRODUCTION_ID,
      full_name:      form.full_name.trim(),
      role:           form.role.trim() || null,
      department:     form.department.trim() || null,
      hotel_id:       form.hotel_id || null,
      hotel_status:   form.hotel_status,
      travel_status:  form.travel_status,
      arrival_date:          form.arrival_date || null,
      departure_date:        form.departure_date || null,
      notes:                 form.notes.trim() || null,
      no_transport_needed:   form.no_transport_needed,
      on_location:           form.on_location,
      email:                 form.email.trim() || null,
      phone:                 form.phone.trim() || null,
      is_local:              form.is_local || false,
      person_type:           form.person_type    || 'CREW',
      linked_crew_id:        form.linked_crew_id || null,
    }

    let error
    if (mode === 'new') {
      const r = await supabase.from('crew').insert({ ...row, id: form.id.trim().toUpperCase() }).select('id').single()
      error = r.error
      setSaving(false)
      if (error) { setError(error.message); return }
      onSaved(r.data?.id, row.full_name)
    } else {
      const r = await supabase.from('crew').update(row).eq('id', initial.id).eq('production_id', PRODUCTION_ID)
      error = r.error
      setSaving(false)
      if (error) { setError(error.message); return }
      onSaved(initial.id, row.full_name)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    // Prima rimuovi assegnazioni ai trip
    await supabase.from('trip_passengers').delete().eq('crew_id', initial.id)
    const { error } = await supabase.from('crew').delete().eq('id', initial.id).eq('production_id', PRODUCTION_ID)
    setDeleting(false)
    if (error) { setError(error.message); return }
    onSaved(null, null)
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const row = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : `${SIDEBAR_W}px`,
        background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? t.newCrew : t.editCrew}
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
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{t.crewIdHint}</div>
              </div>
            ) : (
              <div style={{ ...row, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>ID:</span>
                <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{initial?.id}</span>
              </div>
            )}

            {/* Nome */}
            <div style={row}>
              <label style={lbl}>{t.fullNameLabel} *</label>
              <input value={form.full_name} onChange={e => set('full_name', e.target.value)} style={inp} placeholder="Mario Rossi" required />
            </div>

            {/* Ruolo */}
            {form.person_type !== 'FAMILY' && (
              <div style={row}>
                <label style={lbl}>{t.roleLabel}</label>
                <input value={form.role} onChange={e => set('role', e.target.value)} style={inp} placeholder="Director of Photography, Gaffer, 1st AC…" />
              </div>
            )}
            {form.person_type === 'FAMILY' && (
              <div style={row}>
                <label style={lbl}>Relation</label>
                <input value={form.role} onChange={e => set('role', e.target.value)} style={inp} placeholder="Wife, Husband, Son, Daughter, Infant…" autoComplete="off" />
              </div>
            )}

            {/* Dipartimento */}
            {form.person_type !== 'FAMILY' && (
              <div style={row}>
                <label style={lbl}>{t.departmentLabel}</label>
                <input
                  list="crew-dept-suggestions"
                  value={form.department}
                  onChange={e => set('department', e.target.value)}
                  style={inp}
                  placeholder="GRIP, CAMERA, PRODUCTION…"
                  autoComplete="off"
                />
                <datalist id="crew-dept-suggestions">
                  {deptOptions.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
            )}

            {/* Person Type selector */}
            <div style={{ marginBottom: '12px' }}>
              <label style={lbl}>Person Type</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['CREW', 'FAMILY'].map(pt => (
                  <button key={pt} type="button" onClick={() => { set('person_type', pt); if (pt === 'CREW') { set('linked_crew_id', null); setLinkedCrewSearch(''); setLinkedCrewResults([]) } }}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
                      ...(form.person_type === pt
                        ? pt === 'CREW'
                          ? { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
                          : { background: '#fefce8', color: '#92400e', borderColor: '#fde68a' }
                        : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                    {pt === 'CREW' ? '👤 Crew' : '👨‍👩‍👧 Family'}
                  </button>
                ))}
              </div>
            </div>

            {/* Linked crew search — only when FAMILY */}
            {form.person_type === 'FAMILY' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px' }}>
                <label style={{ ...lbl, color: '#92400e' }}>Linked to crew member *</label>
                <input
                  value={linkedCrewSearch}
                  onChange={e => { setLinkedCrewSearch(e.target.value); if (!e.target.value) set('linked_crew_id', null) }}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }}
                  placeholder="Type name to search crew..."
                  autoComplete="off"
                />
                {linkedCrewSearching && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching...</div>}
                {linkedCrewResults.length > 0 && (
                  <div style={{ border: '1px solid #fde68a', borderRadius: '8px', marginTop: '4px', overflow: 'hidden' }}>
                    {linkedCrewResults.map(c => (
                      <div key={c.id}
                        onClick={() => { set('linked_crew_id', c.id); setLinkedCrewSearch(c.full_name); setLinkedCrewResults([]) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #fef9c3', display: 'flex', gap: '8px', alignItems: 'center', background: 'white' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fefce8'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <span style={{ fontWeight: '700', color: '#0f172a' }}>{c.full_name}</span>
                        {c.role && <span style={{ fontSize: '11px', color: '#64748b' }}>{c.role}</span>}
                        {c.department && <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{c.department}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {form.linked_crew_id && (
                  <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', fontWeight: '600' }}>✓ Linked to {linkedCrewSearch}</div>
                )}
                <div style={{ fontSize: '10px', color: '#92400e', marginTop: '6px', lineHeight: 1.5 }}>
                  ℹ Family members are linked to a crew member for accommodation and transport tracking. They will appear in the crew list only when "Show Family" is enabled.
                </div>
              </div>
            )}

            {/* NTN / Self Drive toggle */}
            <div style={{ marginBottom: '8px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>🚐 {t.selfDrive} / {t.ntnShort}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{t.ntnExcludedHint}</div>
              </div>
              <button type="button" onClick={() => set('no_transport_needed', !form.no_transport_needed)}
                style={{ width: '40px', height: '22px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: form.no_transport_needed ? '#6b7280' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
                <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: form.no_transport_needed ? '20px' : '2px', display: 'block' }} />
              </button>
            </div>

            {/* Remote / Non in Set toggle */}
            {form.person_type !== 'FAMILY' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: form.on_location === false ? '#f1f5f9' : '#f8fafc', border: `1px solid ${form.on_location === false ? '#94a3b8' : '#e2e8f0'}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: form.on_location === false ? '#475569' : '#374151' }}>🏠 Non in Set — Remoto</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Lavora da casa o albergo. Pre-escluso da Rocket.</div>
                </div>
                <button type="button" onClick={() => set('on_location', !form.on_location)}
                  style={{ width: '40px', height: '22px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: form.on_location === false ? '#94a3b8' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
                  <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: form.on_location === false ? '20px' : '2px', display: 'block' }} />
                </button>
              </div>
            )}

            {/* Hotel — solo in edit mode (gestito da AccommodationAccordion) */}
            {mode === 'edit' && (
              <div style={row}>
                <label style={lbl}>{t.hotelLocationLabel}</label>
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
            )}

            {/* Hotel Status + Travel Status + Date — solo in edit mode */}
            {mode === 'edit' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                    <label style={lbl}>{t.hotelStatusLabel}</label>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', fontWeight: '700' }}>
                      {form.hotel_status === 'CONFIRMED'
                        ? <span style={{ color: '#15803d' }}>✅ Confirmed</span>
                        : <span style={{ color: '#a16207' }}>⏳ Pending</span>}
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400', marginLeft: '8px' }}>Managed from Accommodation</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>{t.travelStatusLabel}</label>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={lbl}>🏨 Check-in</label>
                    <input type="date" value={form.arrival_date} onChange={e => set('arrival_date', e.target.value)} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>🏁 Check-out</label>
                    <input type="date" value={form.departure_date} onChange={e => set('departure_date', e.target.value)} style={inp} />
                  </div>
                </div>
              </>
            )}

            {/* Local / No Accommodation toggle */}
            {form.person_type !== 'FAMILY' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: form.is_local ? '#fef9c3' : '#f8fafc', border: `1px solid ${form.is_local ? '#fde68a' : '#e2e8f0'}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: form.is_local ? '#92400e' : '#374151' }}>📍 Local — No Accommodation</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Lives locally. Excluded from accommodation tracking.</div>
                </div>
                <button type="button" onClick={() => set('is_local', !form.is_local)}
                  style={{ width: '40px', height: '22px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: form.is_local ? '#f59e0b' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
                  <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: form.is_local ? '20px' : '2px', display: 'block' }} />
                </button>
              </div>
            )}

            {/* Info box — new mode: accommodation e travel gestiti separatamente */}
            {mode === 'new' && form.person_type !== 'FAMILY' && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '11px', color: '#15803d' }}>
                🏨 <strong>Accommodation</strong> e <strong>Travel</strong> si configurano dopo il salvataggio — direttamente dalle pagine dedicate.
              </div>
            )}

            

            {/* Contact Info accordion */}
            <div style={{ marginBottom: '12px' }}>
              <button type="button" onClick={() => setContactOpen(p => !p)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: contactOpen ? '#f0f9ff' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: contactOpen ? '#0369a1' : '#374151' }}>
                  📞 {t.crewContactInfo}
                  {(form.email || form.phone) && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '999px', border: '1px solid #bfdbfe' }}>✓</span>
                  )}
                </span>
                <span style={{ fontSize: '12px', color: '#94a3b8', transition: 'transform 0.15s', display: 'inline-block', transform: contactOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </button>
              {contactOpen && (
                <div style={{ padding: '10px 12px 4px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#f0f9ff' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ ...lbl, color: '#0369a1' }}>📧 {t.crewEmailLabel}</label>
                    <input value={form.email} onChange={e => set('email', e.target.value)} style={inp} type="email" placeholder="email@example.com" />
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ ...lbl, color: '#0369a1' }}>📱 {t.crewPhoneLabel}</label>
                    <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp} type="tel" placeholder="+39 333 1234567" />
                  </div>
                </div>
              )}
            </div>

            {/* Notes — informativa in new mode, pannello completo in edit */}
            {mode !== 'edit' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ padding: '9px 12px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>💬 Notes</span>
                </div>
                <div style={{ padding: '10px 12px', background: 'white', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '3px' }}>
                      Save the crew member first to unlock notes
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                      Once saved, the team can add notes on this crew member — travel details, special requests, accommodation preferences, etc.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Accommodation + Travel accordions (solo edit) */}
            {mode === 'edit' && initial?.id && (
              <>
                <AccommodationAccordion
                  key={`acc-${initial.id}-${editKey}`}
                  crewId={initial.id}
                  locations={locations}
                  onCrewDatesUpdated={(active) => {
                    setForm(f => ({
                      ...f,
                      hotel_id:       active.hotel_id || '',
                      arrival_date:   active.arrival_date || '',
                      departure_date: active.departure_date || '',
                    }))
                  }}
                />
                <TravelAccordion key={`travel-${initial.id}-${editKey}`} crewId={initial.id} />
                <NotesPanel accordion key={`notes-${initial.id}-${editKey}`} crewId={initial.id} productionId={PRODUCTION_ID} currentUser={currentUser} onNotesChanged={onNotesChanged} />
              </>
            )}

            {/* Elimina (solo edit) */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>
                  {t.dangerZone}
                </div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    {t.deleteCrew}
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>
                      {t.deleteCrewConfirm}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setConfirmDel(false)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        {t.cancel}
                      </button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? t.deleting : t.confirm}
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
              {t.cancel}
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : mode === 'new' ? t.addCrew : t.saveChanges}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function CrewPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const PRODUCTION_ID = getProductionId()
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
  const [addNewRawName, setAddNewRawName] = useState(null)
  const [addNewBanner, setAddNewBanner] = useState(null)
  // { rawName: string, fullName: string }

  const [travelMap, setTravelMap]       = useState({})
  const [staysMap,  setStaysMap]        = useState({})
  const [unreadMap, setUnreadMap]       = useState({})
  const [notesMap,  setNotesMap]        = useState({})  // total notes per crew_id (incl. authored by self)
  const [userRole,  setUserRole]        = useState('CAPTAIN')
  const [familyCountMap,  setFamilyCountMap]  = useState({})
  const [showFamily, setShowFamily] = useState(false)
  const [familyModalCrew, setFamilyModalCrew] = useState(null)

  async function loadUnreadMap(userId) {
    if (!PRODUCTION_ID || !userId) return
    const { data } = await supabase
      .from('crew_notes')
      .select('crew_id, read_by, author_id')
      .eq('production_id', PRODUCTION_ID)
      .eq('is_private', false)
    if (!data) return
    const unread = {}
    const total  = {}
    for (const n of data) {
      // total: count every note regardless of authorship
      total[n.crew_id] = (total[n.crew_id] || 0) + 1
      // unread: skip own notes and already-read notes
      if (n.author_id === userId) continue
      if (!(n.read_by || []).includes(userId)) {
        unread[n.crew_id] = (unread[n.crew_id] || 0) + 1
      }
    }
    setUnreadMap(unread)
    setNotesMap(total)
  }

  // Selezione bulk
  const [selectedIds, setSelectedIds]   = useState([])
  const [bulkDeleting, setBulkDel]      = useState(false)
  const [bulkConfirm, setBulkConfirm]   = useState(false)

  function openNew()          { setSM('new');  setET(null); setSO(true) }
  function openEdit(member)   { setSM('edit'); setET(member); setSO(true) }

  // sessionStorage addNew (from Bridge TravelDiscrepanciesWidget)
  useEffect(() => {
    const addNew = sessionStorage.getItem('crewAddNew')
    if (addNew) {
      sessionStorage.removeItem('crewAddNew')
      const raw = addNew.trim()
      const parts = raw.split(' ')
      let fullName = raw
      for (let i = 1; i < parts.length; i++) {
        fullName = parts.slice(i).join(' ') + ' ' + parts.slice(0, i).join(' ')
        break
      }
      const extraData = sessionStorage.getItem('crewAddNewData')
      sessionStorage.removeItem('crewAddNewData')
      const extra = extraData ? JSON.parse(extraData) : {}
      console.log('[crewAddNew] extra data:', extra)
      setAddNewRawName(raw)
      setAddNewBanner({ rawName: raw, fullName, ...extra })
    }
  }, [])

  // Auth + dati
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) {
        await supabase.from('user_roles').upsert({ user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' }, { onConflict: 'user_id,production_id', ignoreDuplicates: true })
        // Leggi il ruolo reale da DB (potrebbe essere CAPTAIN, TRAVEL, ACCOMMODATION, ecc.)
        const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('production_id', PRODUCTION_ID).single()
        if (roleRow?.role) setUserRole(roleRow.role)
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
    const [{ data: vData }, { data: travelData }, { data: staysData }] = await Promise.all([
      supabase.from('crew').select('*').eq('production_id', PRODUCTION_ID).order('department', { nullsLast: true }).order('full_name'),
      supabase
        .from('travel_movements')
        .select('crew_id, travel_date, direction, from_location, from_time, to_location, to_time, travel_number, travel_type, needs_transport')
        .eq('production_id', PRODUCTION_ID)
        .order('travel_date', { ascending: true }),
      supabase
        .from('crew_stays')
        .select('crew_id, hotel_id, arrival_date, departure_date')
        .eq('production_id', PRODUCTION_ID)
        .order('arrival_date', { ascending: true }),
    ])
    // Auto-aggiorna travel_status basato su arrival_date / departure_date
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

    // crew_ids che hanno un travel_movement IN oggi (es. volo nel pomeriggio).
    // Per loro NON switchare a PRESENT: il cron arrival-status lo farà dopo il trip ARRIVAL.
    // Chi NON ha movimenti di viaggio oggi ma arrival_date=oggi → check-in hotel → PRESENT.
    const hasInMovementToday = new Set(
      (travelData || [])
        .filter(tm => tm.travel_date === today && tm.direction === 'IN')
        .map(tm => tm.crew_id)
    )

    function expectedStatus(c) {
      if (c.departure_date && today > c.departure_date)                    return 'OUT'
      if (c.arrival_date   && today > c.arrival_date)                      return 'PRESENT'
      if (c.arrival_date   && today === c.arrival_date) {
        // Arriva oggi con volo/treno IN → deve essere IN (anche se già switchato a PRESENT per errore)
        // Arriva oggi senza volo (check-in hotel diretto) → PRESENT
        return hasInMovementToday.has(c.id) ? 'IN' : 'PRESENT'
      }
      if (c.arrival_date   && today < c.arrival_date)                      return 'IN'
      return null
    }

    const toUpdate = (vData || [])
      .map(c => ({ c, exp: expectedStatus(c) }))
      .filter(({ c, exp }) => exp !== null && c.travel_status !== exp)
      .map(({ c, exp }) => ({ id: c.id, travel_status: exp }))

    for (const u of toUpdate) {
      await supabase.from('crew').update({ travel_status: u.travel_status }).eq('id', u.id).eq('production_id', PRODUCTION_ID)
    }

    // Ricarica dopo aggiornamenti se necessario
    const finalCrew = toUpdate.length > 0
      ? (vData || []).map(c => { const u = toUpdate.find(x => x.id === c.id); return u ? { ...c, travel_status: u.travel_status } : c })
      : (vData || [])
    setCrew(finalCrew)
    const fMap = {}
    for (const c of finalCrew) {
      if (c.person_type === 'FAMILY' && c.linked_crew_id) {
        fMap[c.linked_crew_id] = (fMap[c.linked_crew_id] || 0) + 1
      }
    }
    setFamilyCountMap(fMap)
    const tMap = {}
    for (const tm of travelData || []) {
      if (!tMap[tm.crew_id]) tMap[tm.crew_id] = []
      tMap[tm.crew_id].push(tm)
    }
    setTravelMap(tMap)
    const sMap = {}
    for (const s of staysData || []) {
      if (!sMap[s.crew_id]) sMap[s.crew_id] = []
      sMap[s.crew_id].push(s)
    }
    setStaysMap(sMap)
    setLoading(false)
  }, [])

  useEffect(() => { if (user) { loadCrew(); loadUnreadMap(user.id) } }, [user, loadCrew])

  // Realtime subscription → aggiorna unreadMap + notesMap su ogni cambio crew_notes nella produzione
  useEffect(() => {
    if (!user || !PRODUCTION_ID) return
    const channel = supabase
      .channel(`crew_notes_prod_${PRODUCTION_ID}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crew_notes',
        filter: `production_id=eq.${PRODUCTION_ID}`,
      }, () => {
        loadUnreadMap(user.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function openFamilyModal(crewId, crewName) {
    const members = crew.filter(c => c.person_type === 'FAMILY' && c.linked_crew_id === crewId)
    setFamilyModalCrew({ crewId, crewName, members })
  }

  function handleStatusChange(id, s)            { setCrew(p => p.map(c => c.id === id ? { ...c, travel_status: s } : c)) }
  function handleNTNChange(id, val)             { setCrew(p => p.map(c => c.id === id ? { ...c, no_transport_needed: val } : c)) }
  function handleRemoteChange(id, val)          { setCrew(p => p.map(c => c.id === id ? { ...c, on_location: val } : c)) }
  function handleContactSaved(id, { email, phone }) { setCrew(p => p.map(c => c.id === id ? { ...c, email, phone } : c)) }

  async function handleSaved(newCrewId, newFullName) {
    setSO(false)

    // If we came from Travel Discrepancies, update travel_movements
    if (addNewRawName && newCrewId) {
      // Build name variants to match against full_name_raw
      const raw = addNewRawName.trim()
      const parts = raw.split(' ')
      const variants = [raw]
      // Add all possible inversions
      for (let i = 1; i < parts.length; i++) {
        const firstName = parts.slice(i).join(' ')
        const lastName = parts.slice(0, i).join(' ')
        variants.push(firstName + ' ' + lastName)
      }

      // Update all matching unmatched rows
      for (const variant of variants) {
        await supabase
          .from('travel_movements')
          .update({
            crew_id:              newCrewId,
            match_status:         'matched',
            discrepancy_resolved: true,
          })
          .eq('production_id', PRODUCTION_ID)
          .eq('match_status', 'unmatched')
          .ilike('full_name_raw', variant)
      }

      setAddNewRawName(null) // reset
    }

    loadCrew()
  }

  // ─── Selezione ─────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function selectAll() {
    const allIds = filtered.map(m => m.id)
    const allSelected = allIds.every(id => selectedIds.includes(id))
    setSelectedIds(allSelected ? [] : allIds)
  }
  function clearSelection() { setSelectedIds([]); setBulkConfirm(false) }

  // ─── Delete singolo dalla card ──────────────────────────
  async function handleDeleteSingle(id) {
    await supabase.from('trip_passengers').delete().eq('crew_id', id)
    const { error } = await supabase.from('crew').delete().eq('id', id).eq('production_id', PRODUCTION_ID)
    if (!error) {
      setSelectedIds(prev => prev.filter(x => x !== id))
      setCrew(prev => prev.filter(c => c.id !== id))
    }
  }

  // ─── Bulk delete ────────────────────────────────────────
  async function handleBulkDelete() {
    if (!bulkConfirm) { setBulkConfirm(true); return }
    setBulkDel(true)
    // Prima rimuovi trip_passengers per tutti gli id selezionati
    await supabase.from('trip_passengers').delete().in('crew_id', selectedIds)
    const { error } = await supabase.from('crew').delete().in('id', selectedIds).eq('production_id', PRODUCTION_ID)
    setBulkDel(false)
    if (!error) { setSelectedIds([]); setBulkConfirm(false); loadCrew() }
  }

  // Filtri
  const filtered = crew.filter(c => {
    if (c.person_type === 'FAMILY') return false
    if (filterTravel === 'NTN') { if (!c.no_transport_needed) return false }
    else if (filterTravel === 'REMOTE') { if (c.on_location !== false) return false }
    else if (filterTravel === 'LOCAL') { if (!c.is_local) return false }
    else if (filterTravel !== 'ALL' && c.travel_status !== filterTravel) return false
    if (filterHotel  !== 'ALL' && c.hotel_status  !== filterHotel)  return false
    if (filterDept   !== 'ALL' && ((c.department || '').trim().toUpperCase() || 'NO DEPT') !== filterDept) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.full_name.toLowerCase().includes(q) && !(c.department || '').toLowerCase().includes(q) && !(c.id || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const familyFiltered = crew.filter(c => c.person_type === 'FAMILY')

  const departments = [...new Set(crew.map(c => (c.department || '').trim().toUpperCase() || 'NO DEPT'))].sort()
  const counts = {
    total:    crew.length,
    conf:     crew.filter(c => c.hotel_status  === 'CONFIRMED').length,
    in:       crew.filter(c => c.travel_status === 'IN').length,
    present:  crew.filter(c => c.travel_status === 'PRESENT').length,
    out:      crew.filter(c => c.travel_status === 'OUT').length,
    ntn:      crew.filter(c => c.no_transport_needed).length,
    remote:   crew.filter(c => c.on_location === false).length,
    depTomorrow: crew.filter(c => isTomorrow(c.departure_date)).length,
  }

  const groups = groupByDept
    ? Object.entries(filtered.reduce((a, c) => { const d = normalizeDept(c.department) || 'NO DEPT'; if (!a[d]) a[d] = []; a[d].push(c); return a }, {}))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dept, members]) => [dept, [...members].sort((a, b) => (a.on_location === false ? 1 : 0) - (b.on_location === false ? 1 : 0))])
    : [['', [...filtered].sort((a, b) => (a.on_location === false ? 1 : 0) - (b.on_location === false ? 1 : 0))]]

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/crew" />

      {addNewBanner && (
        <div style={{
          position: 'sticky', top: '52px', zIndex: 30,
          background: '#eff6ff', borderBottom: '2px solid #2563eb',
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          gap: '12px', flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '20px' }}>👤</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>
              "{addNewBanner.rawName}" is not in your crew
            </div>
            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>
              Coming from Travel Discrepancies — do you want to add this person?
            </div>
          </div>
          <button
            onClick={() => {
              const newInitial = {
                full_name:      addNewBanner.fullName,
                hotel_id:       addNewBanner.hotel_id       || '',
                arrival_date:   addNewBanner.arrival_date   || '',
                departure_date: addNewBanner.departure_date || '',
              }
              setAddNewBanner(null)
              setSM('new')
              setET(newInitial)
              // Apri sidebar nel tick successivo così editTarget è già aggiornato
              setTimeout(() => setSO(true), 0)
            }}
            style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontSize: '12px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ✓ Yes, add
          </button>
          <button
            onClick={() => {
              const movementId = sessionStorage.getItem('crewAddNewMovementId')
              sessionStorage.removeItem('crewAddNewMovementId')
              setAddNewBanner(null)
              setAddNewRawName(null)
              if (movementId) {
                sessionStorage.setItem('bridgeHighlight', movementId)
              }
              window.location.href = '/dashboard/bridge'
            }}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid #bfdbfe', background: 'white', color: '#1d4ed8', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ✕ No, go back
          </button>
        </div>
      )}

      {/* Sub-toolbar — two-row sticky; top shifts down when addNewBanner is visible */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: `${52 + (addNewBanner ? 64 : 0)}px`, zIndex: 29 }}>

        {/* Riga 1 — titolo + contatori + azioni */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '18px' }}>👤</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Crew</span>
          {!isMobile && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{counts.total} total · {counts.conf} confirmed</span>}
          {/* Badge contatori — solo desktop */}
          {!isMobile && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {counts.in > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>{counts.in} IN</span>}
            {counts.present > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}>{counts.present} PRES</span>}
            {counts.out > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}>{counts.out} OUT</span>}
            {counts.ntn > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#6b7280', background: '#f1f5f9', border: '1px solid #cbd5e1' }}>🚐 {counts.ntn} NTN</span>}
            {counts.remote > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#475569', background: '#f1f5f9', border: '1px solid #94a3b8' }}>🏠 {counts.remote} Remote</span>}
            {counts.depTomorrow > 0 && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca' }}>✈ {counts.depTomorrow} dep tomorrow</span>}
          </div>
          )}
          <div style={{ flex: 1 }} />
          {/* Azioni */}
          <button onClick={loadCrew} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>↻</button>
          <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>{t.addCrew}</button>
        </div>

        {/* Riga 2 — filtri */}
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '6px', flexWrap: isMobile ? undefined : 'wrap' }}>
          <input type="text" placeholder="Search name, dept, ID…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: isMobile ? '100%' : '180px', boxSizing: 'border-box' }} />
          {/* Travel filter — riga propria su mobile */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {['ALL', 'IN', 'PRESENT', 'OUT'].map(s => {
              const active = filterTravel === s; const c = TC[s]
              return (
                <button key={s} onClick={() => setFT(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
            <button onClick={() => setFT('NTN')}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterTravel === 'NTN' ? { background: '#f1f5f9', color: '#6b7280', borderColor: '#cbd5e1' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
              🚐 {t.ntnShort}
            </button>
            <button onClick={() => setFT(filterTravel === 'REMOTE' ? 'ALL' : 'REMOTE')}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterTravel === 'REMOTE' ? { background: '#f1f5f9', color: '#475569', borderColor: '#94a3b8' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
              🏠 Remote
            </button>
            <button onClick={() => setFT(filterTravel === 'LOCAL' ? 'ALL' : 'LOCAL')}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterTravel === 'LOCAL' ? { background: '#fef9c3', color: '#92400e', borderColor: '#fde68a' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
              📍 Local
            </button>
          </div>
          {/* Hotel filter — riga propria su mobile */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
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
          <button onClick={() => setShowFamily(p => !p)}
            style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: '1px solid', ...(showFamily ? { background: '#fefce8', color: '#92400e', borderColor: '#fde68a' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
            👨‍👩‍👧 Family {familyFiltered.length > 0 ? `(${familyFiltered.length})` : ''}
          </button>
          <button onClick={() => setGD(p => !p)}
            style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: groupByDept ? '#eff6ff' : 'white', color: groupByDept ? '#1d4ed8' : '#64748b' }}>
            {groupByDept ? '▾ Dept' : '≡ Lista'}
          </button>
          {(filterTravel !== 'ALL' || filterHotel !== 'ALL' || filterDept !== 'ALL' || search) && (
            <button onClick={() => { setFT('ALL'); setFH('ALL'); setFD('ALL'); setSearch('') }}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>✕ Reset</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: isMobile ? '12px' : '24px', transition: 'margin-right 0.25s', marginRight: isMobile ? 0 : (sidebarOpen ? `${SIDEBAR_W}px` : 'auto') }}>

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
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👤</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              {crew.length === 0 ? t.noCrew : t.noResultsFiltered}
            </div>
            {crew.length === 0 && (
              <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '8px' }}>
                {t.addCrew}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

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

            {/* Select All header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 16px' }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(m => selectedIds.includes(m.id))}
                ref={el => { if (el) el.indeterminate = selectedIds.length > 0 && !filtered.every(m => selectedIds.includes(m.id)) }}
                onChange={selectAll}
                style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
                title={t.selectAll}
              />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.selectAll}</span>
            </div>

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
                    <CrewCard key={m.id} member={m} locations={locsMap} onStatusChange={handleStatusChange} onNTNChange={handleNTNChange} onRemoteChange={handleRemoteChange} onEdit={openEdit} onContactSaved={handleContactSaved} selected={selectedIds.includes(m.id)} onToggleSelect={toggleSelect} onDelete={handleDeleteSingle} travelInfo={travelMap[m.id] || []} stays={staysMap[m.id] || []} unreadCount={unreadMap[m.id] || 0} notesCount={notesMap[m.id] || 0} isLocal={m.is_local || false} familyCount={familyCountMap[m.id] || 0} onFamilyClick={() => openFamilyModal(m.id, m.full_name)} />
                  ))}
                </div>
              </div>
            ))}
          {showFamily && familyFiltered.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#92400e', letterSpacing: '0.08em', textTransform: 'uppercase' }}>👨‍👩‍👧 Family Members</div>
                <div style={{ flex: 1, height: '1px', background: '#fde68a' }} />
                <div style={{ fontSize: '11px', color: '#92400e' }}>{familyFiltered.length} member{familyFiltered.length !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {familyFiltered.map(m => {
                  const linkedCrew = crew.find(c => c.id === m.linked_crew_id)
                  return (
                    <div key={m.id} style={{ background: '#fefce8', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>{m.full_name}</span>
                          <span style={{ fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '999px', background: '#FAEEDA', color: '#633806', border: '1px solid #FAC775' }}>FAMILY</span>
                          {m.role && <span style={{ fontSize: '11px', color: '#92400e' }}>{m.role}</span>}
                        </div>
                        {linkedCrew && (
                          <div style={{ fontSize: '11px', color: '#92400e' }}>
                            of <strong>{linkedCrew.full_name}</strong>
                            {linkedCrew.role ? ` (${linkedCrew.role})` : ''}
                          </div>
                        )}
                        <div style={{ fontSize: '11px', color: '#a16207', marginTop: '3px' }}>
                          {m.no_transport_needed ? '🚐 NTN' : '🚐 Transport needed'}
                          {m.phone && <span style={{ marginLeft: '10px' }}>📱 {m.phone}</span>}
                        </div>
                      </div>
                      <button onClick={() => openEdit(m)}
                        style={{ background: 'white', border: '1px solid #fde68a', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#92400e', whiteSpace: 'nowrap' }}>
                        ✎ Edit
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {showFamily && familyFiltered.length === 0 && (
            <div style={{ marginTop: '24px', padding: '20px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>No family members added yet</div>
              <div style={{ fontSize: '11px', color: '#a16207', marginTop: '4px' }}>Use + Add Crew and set person type to Family</div>
            </div>
          )}

          </div>
        )}
      </div>

      <FamilyModal
        crew={familyModalCrew}
        onClose={() => setFamilyModalCrew(null)}
        onEdit={(member) => { setFamilyModalCrew(null); openEdit(member) }}
      />

      {/* Sidebar */}
      <CrewSidebar
        open={sidebarOpen}
        mode={sidebarMode}
        initial={editTarget}
        locations={locations}
        deptOptions={departments.filter(d => d !== 'NO DEPT')}
        onClose={() => setSO(false)}
        onSaved={handleSaved}
        currentUser={user ? { id: user.id, name: user.user_metadata?.full_name || user.email, role: userRole } : null}
        onNotesChanged={() => user && loadUnreadMap(user.id)}
      />

    </div>
  )
}
