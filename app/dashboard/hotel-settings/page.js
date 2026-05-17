'use client'

/**
 * /dashboard/hotel-settings
 * Hotel Settings page — manage hotel locations + room types + extras
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'

// ─── HotelSettingsSidebar ─────────────────────────────────────
function HotelSettingsSidebar({ open, mode, initial, onClose, onSaved, productionId }) {
  const [activeTab, setActiveTab] = useState('info')

  // INFO form state
  const EMPTY_FORM = {
    name: '', address: '', city: '', country: '', phone: '', email: '',
    website: '', contact_name: '', contact_phone: '', notes_ops: '',
    lat: '', lng: '', place_id: '', maps_url: '',
  }
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Google Places state
  const [placeQuery,   setPlaceQuery]   = useState('')
  const [predictions,  setPredictions]  = useState([])
  const [placeOpen,    setPlaceOpen]    = useState(false)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeError,   setPlaceError]   = useState(null)
  const debounceRef = useRef(null)
  const dropdownRef = useRef(null)

  // ROOM TYPES state
  const [roomTypes,  setRoomTypes]  = useState([])
  const [roomForm,   setRoomForm]   = useState(null)
  const [roomSaving, setRoomSaving] = useState(false)
  const [roomError,  setRoomError]  = useState(null)

  // EXTRAS state
  const [extras,      setExtras]      = useState([])
  const [extrasForm,  setExtrasForm]  = useState(null)
  const [extraSaving, setExtraSaving] = useState(false)
  const [extraError,  setExtraError]  = useState(null)

  // Reset tabs and form on open
  useEffect(() => {
    if (!open) return
    setActiveTab('info')
    setError(null)
    setPlaceQuery(''); setPredictions([]); setPlaceOpen(false); setPlaceError(null)
    setRoomForm(null); setExtrasForm(null)
    if (mode === 'edit' && initial) {
      setForm({
        name:          initial.name          || '',
        address:       initial.address       || '',
        city:          initial.city          || '',
        country:       initial.country       || '',
        phone:         initial.phone         || '',
        email:         initial.email         || '',
        website:       initial.website       || '',
        contact_name:  initial.contact_name  || '',
        contact_phone: initial.contact_phone || '',
        notes_ops:     initial.notes_ops     || '',
        lat:           initial.lat           != null ? String(initial.lat) : '',
        lng:           initial.lng           != null ? String(initial.lng) : '',
        place_id:      initial.place_id      || '',
        maps_url:      initial.maps_url      || '',
      })
      loadRoomTypes(initial.hotel_id)
      loadExtras(initial.hotel_id)
    } else {
      setForm({
        ...EMPTY_FORM,
        name: initial?.name || '',
        lat:  initial?.lat  != null ? String(initial.lat)  : '',
        lng:  initial?.lng  != null ? String(initial.lng)  : '',
      })
      setRoomTypes([])
      setExtras([])
    }
  }, [open, mode, initial])

  // Debounce Google Places autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!placeQuery.trim() || placeQuery.length < 2) { setPredictions([]); setPlaceOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setPlaceLoading(true); setPlaceError(null)
      try {
        const res  = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(placeQuery)}`)
        const data = await res.json()
        if (data.predictions) { setPredictions(data.predictions); setPlaceOpen(data.predictions.length > 0) }
        else { setPlaceError(data.error || 'Search error'); setPlaceOpen(false) }
      } catch { setPlaceError('Network error'); setPlaceOpen(false) }
      setPlaceLoading(false)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [placeQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setPlaceOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSelectPlace(prediction) {
    setPlaceOpen(false)
    setPlaceQuery(prediction.description)
    setPlaceLoading(true); setPlaceError(null)
    try {
      const res  = await fetch(`/api/places/details?place_id=${encodeURIComponent(prediction.place_id)}`)
      const data = await res.json()
      if (data.lat != null) {
        // Parse city from formatted_address
        let city = ''
        if (data.formatted_address) {
          const parts = data.formatted_address.split(',')
          if (parts.length >= 2) city = parts[parts.length - 2]?.trim() || ''
        }
        setForm(f => ({
          ...f,
          lat:      String(data.lat),
          lng:      String(data.lng),
          address:  data.address || f.address,
          city:     city || f.city,
          place_id: prediction.place_id,
          maps_url: `https://maps.google.com/?q=${data.lat},${data.lng}`,
          name:     f.name || prediction.main_text || f.name,
        }))
      } else { setPlaceError(data.error || 'Details not available') }
    } catch { setPlaceError('Network error') }
    setPlaceLoading(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Room types loaders ──
  async function loadRoomTypes(hotelId) {
    if (!hotelId || !productionId) return
    const { data } = await supabase.from('hotel_room_types')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('production_id', productionId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    setRoomTypes(data || [])
  }

  async function loadExtras(hotelId) {
    if (!hotelId || !productionId) return
    const { data } = await supabase.from('hotel_extra_costs')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('production_id', productionId)
      .order('created_at', { ascending: true })
    setExtras(data || [])
  }

  // ── INFO submit ──
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Hotel name is required'); return }
    setSaving(true); setError(null)
    try {
      const hotelRow = {
        production_id: productionId,
        address:       form.address.trim()       || null,
        city:          form.city.trim()          || null,
        country:       form.country.trim()       || null,
        phone:         form.phone.trim()         || null,
        email:         form.email.trim()         || null,
        website:       form.website.trim()       || null,
        contact_name:  form.contact_name.trim()  || null,
        contact_phone: form.contact_phone.trim() || null,
        place_id:      form.place_id             || null,
        maps_url:      form.maps_url             || null,
        notes_ops:     form.notes_ops.trim()     || null,
      }
      const lat = form.lat !== '' ? parseFloat(form.lat) : null
      const lng = form.lng !== '' ? parseFloat(form.lng) : null

      if (mode === 'new') {
        let location_id
        if (initial?.location_id) {
          // Location already exists — just create the hotels row
          location_id = initial.location_id
        } else {
          const { data: existing } = await supabase.from('locations')
            .select('id, name')
            .eq('production_id', productionId)
            .ilike('name', form.name.trim())
            .maybeSingle()
          if (existing) {
            location_id = existing.id
          } else {
          const genId = form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20)
          const { error: locErr } = await supabase.from('locations').insert({
            id:           genId,
            production_id: productionId,
            name:         form.name.trim(),
            is_hotel:     true,
            lat,
            lng,
          })
          if (locErr) { setError(locErr.message); return }
          location_id = genId
          }
        }

        const { error: hotelErr } = await supabase.from('hotels').insert({
          ...hotelRow,
          location_id,
        })
        if (hotelErr) { setError(hotelErr.message); return }
      } else {
        // Edit mode — update hotels row
        const { error: hotelErr } = await supabase.from('hotels')
          .update(hotelRow)
          .eq('id', initial.hotel_id)
        if (hotelErr) { setError(hotelErr.message); return }
        // If lat/lng updated via Places, also update location
        if (lat != null && lng != null) {
          await supabase.from('locations')
            .update({ lat, lng })
            .eq('id', initial.location_id)
        }
      }
      onSaved()
    } finally { setSaving(false) }
  }

  // ── Room type handlers ──
  async function handleRoomSave() {
    if (!roomForm?.name?.trim()) { setRoomError('Name is required'); return }
    setRoomSaving(true); setRoomError(null)
    const row = {
      production_id: productionId,
      hotel_id:      initial?.hotel_id,
      name:          roomForm.name.trim(),
      rate_no_vat:   roomForm.rate_no_vat !== '' ? parseFloat(roomForm.rate_no_vat) : null,
      vat_pct:       roomForm.vat_pct     !== '' ? parseFloat(roomForm.vat_pct)     : null,
      city_tax_night: roomForm.city_tax_night !== '' ? parseFloat(roomForm.city_tax_night) : null,
      notes:         roomForm.notes?.trim() || null,
    }
    let err
    if (roomForm.id) {
      const r = await supabase.from('hotel_room_types').update(row).eq('id', roomForm.id)
      err = r.error
    } else {
      const r = await supabase.from('hotel_room_types').insert(row)
      err = r.error
    }
    setRoomSaving(false)
    if (err) { setRoomError(err.message); return }
    setRoomForm(null)
    loadRoomTypes(initial?.hotel_id)
    onSaved(true)
  }

  async function handleRoomDelete(id) {
    await supabase.from('hotel_room_types').delete().eq('id', id)
    loadRoomTypes(initial?.hotel_id)
    onSaved(true)
  }

  // ── Extra cost handlers ──
  async function handleExtraSave() {
    if (!extrasForm?.label?.trim()) { setExtraError('Label is required'); return }
    setExtraSaving(true); setExtraError(null)
    const row = {
      production_id: productionId,
      hotel_id:      initial?.hotel_id,
      label:         extrasForm.label.trim(),
      amount_no_vat: extrasForm.amount_no_vat !== '' ? parseFloat(extrasForm.amount_no_vat) : null,
      vat_pct:       extrasForm.vat_pct       !== '' ? parseFloat(extrasForm.vat_pct)       : 10,
      item_type:     extrasForm.item_type     || 'extra',
      notes:         extrasForm.notes?.trim() || null,
    }
    let err
    if (extrasForm.id) {
      const r = await supabase.from('hotel_extra_costs').update(row).eq('id', extrasForm.id)
      err = r.error
    } else {
      const r = await supabase.from('hotel_extra_costs').insert(row)
      err = r.error
    }
    setExtraSaving(false)
    if (err) { setExtraError(err.message); return }
    setExtrasForm(null)
    loadExtras(initial?.hotel_id)
    onSaved(true)
  }

  async function handleExtraDelete(id) {
    await supabase.from('hotel_extra_costs').delete().eq('id', id)
    loadExtras(initial?.hotel_id)
    onSaved(true)
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px',
        background: 'white', borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50,
        transform: open ? 'translateX(0)' : 'translateX(520px)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#15803d', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🏨 New Hotel' : `✏️ Edit Hotel — ${initial?.name || ''}`}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          {['info', 'room_types', 'extras'].map(tab => {
            const labels = { info: 'INFO', room_types: 'ROOM TYPES', extras: 'EXTRAS' }
            const active = activeTab === tab
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '10px 8px', border: 'none', borderBottom: active ? '2px solid #15803d' : '2px solid transparent',
                background: 'white', color: active ? '#15803d' : '#94a3b8',
                fontSize: '11px', fontWeight: '800', cursor: 'pointer',
                letterSpacing: '0.06em', transition: 'all 0.15s',
              }}>
                {labels[tab]}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── INFO TAB ── */}
          {activeTab === 'info' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '16px 18px', flex: 1 }}>

                {/* Google Places search */}
                <div style={{ ...fld, position: 'relative' }} ref={dropdownRef}>
                  <label style={lbl}>Google Places Search</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={placeQuery}
                      onChange={e => setPlaceQuery(e.target.value)}
                      onFocus={() => predictions.length > 0 && setPlaceOpen(true)}
                      style={{ ...inp, paddingRight: placeLoading ? '32px' : '10px', borderColor: placeOpen ? '#2563eb' : '#e2e8f0' }}
                      placeholder="Search for a hotel on Google Maps…"
                      autoComplete="off"
                    />
                    {placeLoading && (
                      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    )}
                  </div>
                  {placeError && <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '3px' }}>⚠ {placeError}</div>}
                  {placeOpen && predictions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden', marginTop: '2px' }}>
                      {predictions.map((p, i) => (
                        <button key={p.place_id} type="button" onMouseDown={() => handleSelectPlace(p)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: i < predictions.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', marginBottom: '1px' }}>📍 {p.main_text}</div>
                          {p.secondary_text && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.secondary_text}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', marginBottom: '14px' }} />

                {/* Name */}
                <div style={fld}>
                  <label style={lbl}>Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Grand Hotel Roma" required />
                </div>

                {/* Address */}
                <div style={fld}>
                  <label style={lbl}>Address</label>
                  <input value={form.address} onChange={e => set('address', e.target.value)} style={inp} placeholder="Via della Repubblica, 42" />
                </div>

                {/* City + Country */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={lbl}>City</label>
                    <input value={form.city} onChange={e => set('city', e.target.value)} style={inp} placeholder="Roma" />
                  </div>
                  <div>
                    <label style={lbl}>Country</label>
                    <input value={form.country} onChange={e => set('country', e.target.value)} style={inp} placeholder="Italy" />
                  </div>
                </div>

                {/* Phone + Email */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={lbl}>Phone</label>
                    <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp} placeholder="+39 06..." />
                  </div>
                  <div>
                    <label style={lbl}>Email</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inp} placeholder="info@hotel.com" />
                  </div>
                </div>

                {/* Website */}
                <div style={fld}>
                  <label style={lbl}>Website</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)} style={inp} placeholder="https://..." />
                </div>

                {/* Contact name + phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={lbl}>Contact name</label>
                    <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} style={inp} placeholder="Marco Rossi" />
                  </div>
                  <div>
                    <label style={lbl}>Contact phone</label>
                    <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} style={inp} placeholder="+39 333..." />
                  </div>
                </div>

                {/* Notes operative */}
                <div style={fld}>
                  <label style={lbl}>Notes operative</label>
                  <textarea value={form.notes_ops} onChange={e => set('notes_ops', e.target.value)} rows={3}
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Operative notes, check-in instructions…" />
                </div>

                {error && (
                  <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '12px' }}>
                    {error}
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0, background: 'white', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button type="submit" disabled={saving} style={{ padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
                  {saving ? 'Saving...' : mode === 'new' ? '+ Add Hotel' : 'Save Changes'}
                </button>
                <button type="button" onClick={onClose} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              </div>
            </form>
          )}

          {/* ── ROOM TYPES TAB ── */}
          {activeTab === 'room_types' && (
            <div style={{ padding: '16px 18px' }}>
              {mode === 'new' ? (
                <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                  💡 Save the hotel first to add room types
                </div>
              ) : (
                <>
                  {/* Room types list */}
                  {roomTypes.length === 0 && !roomForm && (
                    <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', marginBottom: '12px' }}>
                      No room types yet
                    </div>
                  )}
                  {roomTypes.map(rt => (
                    <div key={rt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{rt.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {rt.rate_no_vat != null ? `€${rt.rate_no_vat}/n` : ''}
                          {rt.vat_pct    != null ? ` · IVA ${rt.vat_pct}%` : ''}
                          {rt.city_tax_night != null ? ` · city tax €${rt.city_tax_night}/n` : ''}
                        </div>
                      </div>
                      <button onClick={() => setRoomForm({ ...rt })} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>✎</button>
                      <button onClick={() => handleRoomDelete(rt.id)} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '13px', cursor: 'pointer' }}>🗑</button>
                    </div>
                  ))}

                  {/* Inline form */}
                  {roomForm !== null ? (
                    <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase' }}>
                        {roomForm.id ? 'Edit Room Type' : 'New Room Type'}
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Name *</label>
                        <input value={roomForm.name || ''} onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="Deluxe Junior Suite" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div>
                          <label style={lbl}>Rate no VAT</label>
                          <input type="number" step="0.01" value={roomForm.rate_no_vat ?? ''} onChange={e => setRoomForm(f => ({ ...f, rate_no_vat: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="820.00" />
                        </div>
                        <div>
                          <label style={lbl}>VAT %</label>
                          <input type="number" step="0.1" value={roomForm.vat_pct ?? ''} onChange={e => setRoomForm(f => ({ ...f, vat_pct: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="10" />
                        </div>
                        <div>
                          <label style={lbl}>City tax/night</label>
                          <input type="number" step="0.01" value={roomForm.city_tax_night ?? ''} onChange={e => setRoomForm(f => ({ ...f, city_tax_night: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="9.00" />
                        </div>
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Notes</label>
                        <input value={roomForm.notes || ''} onChange={e => setRoomForm(f => ({ ...f, notes: e.target.value }))} style={inp} placeholder="Notes…" />
                      </div>
                      {roomError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{roomError}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={handleRoomSave} disabled={roomSaving}
                          style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: roomSaving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '12px', fontWeight: '800', cursor: roomSaving ? 'default' : 'pointer' }}>
                          {roomSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setRoomForm(null); setRoomError(null) }}
                          style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setRoomForm({ name: '', rate_no_vat: '', vat_pct: '', city_tax_night: '', notes: '' })}
                      style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px dashed #86efac', background: '#f0fdf4', color: '#15803d', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                      + Add Room Type
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── EXTRAS TAB ── */}
          {activeTab === 'extras' && (
            <div style={{ padding: '16px 18px' }}>
              {mode === 'new' ? (
                <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                  💡 Save the hotel first to add extras
                </div>
              ) : (
                <>
                  {extras.length === 0 && !extrasForm && (
                    <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', marginBottom: '12px' }}>
                      No extras yet
                    </div>
                  )}
                  {extras.map(ex => (
                    <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>{ex.label}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {ex.amount_no_vat != null ? `€${ex.amount_no_vat}/n` : ''}
                          {ex.vat_pct    != null ? ` · IVA ${ex.vat_pct}%` : ''}
                          {ex.item_type ? ` · ${ex.item_type}` : ''}
                        </div>
                      </div>
                      <button onClick={() => setExtrasForm({ ...ex })} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>✎</button>
                      <button onClick={() => handleExtraDelete(ex.id)} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '13px', cursor: 'pointer' }}>🗑</button>
                    </div>
                  ))}

                  {/* Inline extras form */}
                  {extrasForm !== null ? (
                    <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase' }}>
                        {extrasForm.id ? 'Edit Extra' : 'New Extra'}
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Label *</label>
                        <input value={extrasForm.label || ''} onChange={e => setExtrasForm(f => ({ ...f, label: e.target.value }))} style={inp} placeholder="Laundry" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div>
                          <label style={lbl}>Amount no VAT</label>
                          <input type="number" step="0.01" value={extrasForm.amount_no_vat ?? ''} onChange={e => setExtrasForm(f => ({ ...f, amount_no_vat: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="45.00" />
                        </div>
                        <div>
                          <label style={lbl}>VAT %</label>
                          <input type="number" step="0.1" value={extrasForm.vat_pct ?? 10} onChange={e => setExtrasForm(f => ({ ...f, vat_pct: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} placeholder="10" />
                        </div>
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Item type</label>
                        <select value={extrasForm.item_type || 'extra'} onChange={e => setExtrasForm(f => ({ ...f, item_type: e.target.value }))}
                          style={{ ...inp, cursor: 'pointer' }}>
                          <option value="extra">extra</option>
                          <option value="laundry">laundry</option>
                          <option value="parking">parking</option>
                          <option value="early_ci">early_ci</option>
                          <option value="late_co">late_co</option>
                        </select>
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Notes</label>
                        <input value={extrasForm.notes || ''} onChange={e => setExtrasForm(f => ({ ...f, notes: e.target.value }))} style={inp} placeholder="Notes…" />
                      </div>
                      {extraError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{extraError}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={handleExtraSave} disabled={extraSaving}
                          style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: extraSaving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '12px', fontWeight: '800', cursor: extraSaving ? 'default' : 'pointer' }}>
                          {extraSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setExtrasForm(null); setExtraError(null) }}
                          style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setExtrasForm({ label: '', amount_no_vat: '', vat_pct: 10, item_type: 'extra', notes: '' })}
                      style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px dashed #86efac', background: '#f0fdf4', color: '#15803d', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                      + Add Extra
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function HotelSettingsPage() {
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()

  const [user,       setUser]       = useState(null)
  const [userRole,   setUserRole]   = useState(null)
  const [locations,  setLocations]  = useState([])   // hotel locations
  const [hotelsMap,  setHotelsMap]  = useState({})   // { location_id: hotels row }
  const [roomCounts, setRoomCounts] = useState({})   // { hotel_id: count }
  const [extraCounts,setExtraCounts]= useState({})   // { hotel_id: count }
  const [loading,    setLoading]    = useState(true)

  // Sidebar
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [sidebarMode,   setSidebarMode]   = useState('new')
  const [sidebarTarget, setSidebarTarget] = useState(null)

  function openNew(preselectedLocation) {
    setSidebarMode('new')
    setSidebarTarget(preselectedLocation ? { location_id: preselectedLocation.location_id, name: preselectedLocation.name, lat: preselectedLocation.lat, lng: preselectedLocation.lng } : null)
    setSidebarOpen(true)
  }
  function openEdit(hotelData) {
    setSidebarMode('edit'); setSidebarTarget(hotelData); setSidebarOpen(true)
  }

  const loadData = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)

    // Load hotel locations
    const { data: locs } = await supabase.from('locations')
      .select('id, name, lat, lng')
      .eq('production_id', PRODUCTION_ID)
      .eq('is_hotel', true)
      .order('name', { ascending: true })

    // Load hotels rows
    const { data: hotels } = await supabase.from('hotels')
      .select('*')
      .eq('production_id', PRODUCTION_ID)

    // Build location→hotel map
    const hMap = {}
    if (hotels) {
      for (const h of hotels) {
        hMap[h.location_id] = h
      }
    }

    // Load room type counts
    const { data: rts } = await supabase.from('hotel_room_types')
      .select('id, hotel_id')
      .eq('production_id', PRODUCTION_ID)

    const rcMap = {}
    if (rts) {
      for (const rt of rts) {
        rcMap[rt.hotel_id] = (rcMap[rt.hotel_id] || 0) + 1
      }
    }

    // Load extra costs counts
    const { data: exs } = await supabase.from('hotel_extra_costs')
      .select('id, hotel_id')
      .eq('production_id', PRODUCTION_ID)

    const ecMap = {}
    if (exs) {
      for (const ex of exs) {
        ecMap[ex.hotel_id] = (ecMap[ex.hotel_id] || 0) + 1
      }
    }

    setLocations(locs || [])
    setHotelsMap(hMap)
    setRoomCounts(rcMap)
    setExtraCounts(ecMap)
    setLoading(false)
  }, [PRODUCTION_ID])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (PRODUCTION_ID) {
        const { data: roleRow } = await supabase.from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('production_id', PRODUCTION_ID)
          .maybeSingle()
        if (roleRow?.role) setUserRole(roleRow.role)
      }
    })
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: '700' }}>
      Loading…
    </div>
  )

  // Build merged list: one entry per location, with hotel data if exists
  const hotelCards = locations.map(loc => {
    const hotelRow = hotelsMap[loc.id] || null
    return {
      location_id:   loc.id,
      name:          loc.name,
      lat:           loc.lat,
      lng:           loc.lng,
      hotel_id:      hotelRow?.id      || null,
      address:       hotelRow?.address || null,
      city:          hotelRow?.city    || null,
      country:       hotelRow?.country || null,
      phone:         hotelRow?.phone   || null,
      email:         hotelRow?.email   || null,
      website:       hotelRow?.website || null,
      contact_name:  hotelRow?.contact_name  || null,
      contact_phone: hotelRow?.contact_phone || null,
      place_id:      hotelRow?.place_id || null,
      maps_url:      hotelRow?.maps_url || null,
      notes_ops:     hotelRow?.notes_ops || null,
      roomCount:     hotelRow ? (roomCounts[hotelRow.id]  || 0) : 0,
      extraCount:    hotelRow ? (extraCounts[hotelRow.id] || 0) : 0,
    }
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <style>{`@keyframes spin{from{transform:translateY(-50%) rotate(0deg)}to{transform:translateY(-50%) rotate(360deg)}}`}</style>
      <Navbar currentPath="/dashboard/hotel-settings" />

      {/* ── Sticky Toolbar ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '8px 16px', minHeight: '52px',
        display: 'flex', alignItems: 'center', gap: '12px',
        position: 'sticky', top: '52px', zIndex: 21,
      }}>
        {/* Left */}
        <a href="/dashboard/accommodation" style={{ fontSize: '12px', color: '#64748b', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          ← Back
        </a>
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />
        <span style={{ fontSize: '18px' }}>🏨</span>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>Hotel Settings</span>

        <div style={{ flex: 1 }} />

        {/* Right */}
        <button onClick={openNew} style={{
          background: '#15803d', color: 'white', border: 'none',
          borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
          fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(21,128,61,0.3)',
        }}>
          + Add Hotel
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '20px 24px' }}>
        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            NEXT_PUBLIC_PRODUCTION_ID not set in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading hotels…</div>
        ) : hotelCards.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>🏨</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>No hotels configured yet</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>Add a hotel to get started</div>
            <button onClick={openNew} style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
              + Add Hotel
            </button>
          </div>
        ) : (
          /* Hotel cards list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {hotelCards.map(hotel => (
              <div key={hotel.location_id} style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                borderLeft: '4px solid #15803d',
                padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                {/* Left info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1: icon + name + id badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px' }}>🏨</span>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{hotel.name}</span>
                    <span style={{
                      fontFamily: 'monospace', fontSize: '10px', fontWeight: '700',
                      background: '#f1f5f9', color: '#475569',
                      padding: '2px 7px', borderRadius: '4px', border: '1px solid #e2e8f0',
                      flexShrink: 0,
                    }}>
                      {hotel.location_id}
                    </span>
                  </div>
                  {/* Row 2: address */}
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', paddingLeft: '24px' }}>
                    {hotel.address || hotel.city
                      ? [hotel.address, hotel.city].filter(Boolean).join(', ')
                      : <span style={{ fontStyle: 'italic', color: '#cbd5e1' }}>—</span>
                    }
                  </div>
                  {/* Row 3: pills */}
                  <div style={{ display: 'flex', gap: '6px', paddingLeft: '24px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: '700',
                      background: hotel.roomCount > 0 ? '#f0fdf4' : '#f8fafc',
                      color: hotel.roomCount > 0 ? '#15803d' : '#94a3b8',
                      border: `1px solid ${hotel.roomCount > 0 ? '#86efac' : '#e2e8f0'}`,
                      padding: '2px 8px', borderRadius: '999px',
                    }}>
                      🛏 {hotel.roomCount} room type{hotel.roomCount !== 1 ? 's' : ''}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: '700',
                      background: hotel.extraCount > 0 ? '#eff6ff' : '#f8fafc',
                      color: hotel.extraCount > 0 ? '#1d4ed8' : '#94a3b8',
                      border: `1px solid ${hotel.extraCount > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                      padding: '2px 8px', borderRadius: '999px',
                    }}>
                      ➕ {hotel.extraCount} extra{hotel.extraCount !== 1 ? 's' : ''}
                    </span>
                    {!hotel.hotel_id && (
                      <span style={{
                        fontSize: '11px', fontWeight: '700',
                        background: '#fef2f2', color: '#dc2626',
                        border: '1px solid #fecaca',
                        padding: '2px 8px', borderRadius: '999px',
                      }}>
                        ⚠ No hotel record
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit button */}
                <button onClick={() => hotel.hotel_id ? openEdit(hotel) : openNew(hotel)} style={{
                  padding: '7px 14px', borderRadius: '8px',
                  border: '1px solid #e2e8f0', background: 'white',
                  color: '#374151', fontSize: '13px', fontWeight: '700',
                  cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  ✎ Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <HotelSettingsSidebar
        open={sidebarOpen}
        mode={sidebarMode}
        initial={sidebarTarget}
        onClose={() => setSidebarOpen(false)}
        onSaved={(keepOpen) => { if (!keepOpen) setSidebarOpen(false); loadData() }}
        productionId={PRODUCTION_ID}
      />
    </div>
  )
}
