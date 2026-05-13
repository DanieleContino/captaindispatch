'use client'
/**
 * /dashboard/settings/production
 * Edit all production details used in the Transport List header.
 * Data is saved to Supabase table: productions
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getProductionId } from '../../../../lib/production'
import { Navbar } from '../../../../lib/navbar'

// ── shared section-title helper ───────────────────────────────
function sectionTitle(icon, title) {
  return (
    <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '12px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>{icon}</span> {title}
    </div>
  )
}

function getHubIcon(hub) {
  const s = ((hub.id || '') + ' ' + (hub.name || '')).toUpperCase()
  if (/APT|AIRPORT|AEROPORTO/.test(s))                   return '✈️'
  if (/STN|TRAIN|STAZIONE|CENTRALE|FERROVIARIA/.test(s)) return '🚂'
  if (/PORT|PORTO|FERRY/.test(s))                        return '⛴️'
  return '📍'
}

// ── Hub Locations Section ──────────────────────────────
const HUB_EMPTY = { id: '', name: '', lat: '', lng: '', default_pickup_point: '' }

function HubLocationsSection({ productionId }) {
  const [hubs,        setHubs]        = useState([])
  const [saving,      setSaving]      = useState(false)
  const [showForm,    setShowForm]    = useState(false)  // 'new' | { hub } | false
  const [form,        setForm]        = useState({ ...HUB_EMPTY })
  const [formError,   setFormError]   = useState(null)
  const [formSaving,  setFormSaving]  = useState(false)
  // Google Places
  const [placeQuery,   setPlaceQuery]   = useState('')
  const [predictions,  setPredictions]  = useState([])
  const [placeOpen,    setPlaceOpen]    = useState(false)
  const [placeLoading, setPlaceLoading] = useState(false)
  // Search existing
  const [search,    setSearch]    = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)

  const inp2 = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl2 = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  const loadHubs = useCallback(async () => {
    if (!productionId) return
    const { data } = await supabase.from('locations')
      .select('id, name, lat, lng, default_pickup_point')
      .eq('production_id', productionId)
      .eq('is_hub', true)
      .order('name')
    setHubs(data || [])
  }, [productionId])

  useEffect(() => { loadHubs() }, [loadHubs])

  // Realtime sync
  useEffect(() => {
    if (!productionId) return
    const channel = supabase.channel(`hub-locations-prod-${productionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'locations',
        filter: `production_id=eq.${productionId}`,
      }, () => loadHubs())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [productionId, loadHubs])

  // Search existing non-hub locations
  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return }
    setSearching(true)
    supabase.from('locations')
      .select('id, name')
      .eq('production_id', productionId)
      .eq('is_hub', false)
      .ilike('name', `%${search}%`)
      .limit(6)
      .then(({ data }) => { setResults(data || []); setSearching(false) })
  }, [search, productionId])

  // Google Places debounce
  useEffect(() => {
    if (!placeQuery || placeQuery.length < 2) { setPredictions([]); setPlaceOpen(false); return }
    const t = setTimeout(async () => {
      setPlaceLoading(true)
      try {
        const res  = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(placeQuery)}`)
        const data = await res.json()
        setPredictions(data.predictions || [])
        setPlaceOpen((data.predictions || []).length > 0)
      } catch {}
      setPlaceLoading(false)
    }, 400)
    return () => clearTimeout(t)
  }, [placeQuery])

  async function handleSelectPlace(p) {
    setPlaceOpen(false); setPlaceLoading(true)
    try {
      const res  = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}`)
      const data = await res.json()
      setForm(f => ({
        ...f,
        name: data.name || f.name || p.main_text,
        lat:  data.lat != null ? String(data.lat) : f.lat,
        lng:  data.lng != null ? String(data.lng) : f.lng,
        default_pickup_point: data.address || f.default_pickup_point,
      }))
      setPlaceQuery(p.description)
    } catch {}
    setPlaceLoading(false)
  }

  async function addExistingHub(loc) {
    setSaving(true)
    await supabase.from('locations').update({ is_hub: true }).eq('id', loc.id)
    setSearch(''); setResults([])
    setSaving(false)
  }

  async function removeHub(loc) {
    if (!confirm(`Remove "${loc.name}" as hub?`)) return
    setSaving(true)
    await supabase.from('locations').update({ is_hub: false }).eq('id', loc.id)
    setSaving(false)
  }

  async function handleSaveHub(e) {
    e.preventDefault()
    setFormError(null)
    if (!form.id.trim()) { setFormError('ID required'); return }
    if (!form.name.trim()) { setFormError('Name required'); return }
    setFormSaving(true)
    if (showForm === 'new') {
      const { error } = await supabase.from('locations').insert({
        production_id: productionId,
        id:   form.id.trim().toUpperCase(),
        name: form.name.trim(),
        is_hub: true,
        lat:  form.lat !== '' ? parseFloat(String(form.lat).replace(',', '.')) : null,
        lng:  form.lng !== '' ? parseFloat(String(form.lng).replace(',', '.')) : null,
        default_pickup_point: form.default_pickup_point.trim() || null,
      })
      if (error) { setFormError(error.message); setFormSaving(false); return }
    } else {
      const { error } = await supabase.from('locations').update({
        name: form.name.trim(),
        lat:  form.lat !== '' ? parseFloat(String(form.lat).replace(',', '.')) : null,
        lng:  form.lng !== '' ? parseFloat(String(form.lng).replace(',', '.')) : null,
        default_pickup_point: form.default_pickup_point.trim() || null,
      }).eq('id', showForm.id)
      if (error) { setFormError(error.message); setFormSaving(false); return }
    }
    setFormSaving(false)
    setShowForm(false)
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
  }

  function openNew() {
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
    setFormError(null)
    setShowForm('new')
  }

  function openEdit(hub) {
    setForm({ id: hub.id, name: hub.name, lat: hub.lat ?? '', lng: hub.lng ?? '', default_pickup_point: hub.default_pickup_point || '' })
    setPlaceQuery('')
    setFormError(null)
    setShowForm(hub)
  }

  return (
    <>
      {sectionTitle('🛫', 'Hub Locations')}
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
        Hub locations filter Travel Calendar imports — only movements touching a hub are imported.
      </div>

      {/* Current hubs list */}
      {hubs.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', fontStyle: 'italic' }}>No hub locations set</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {hubs.map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <span style={{ fontSize: '16px' }}>🛫</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#1d4ed8' }}>{h.name}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{h.id}{h.lat && h.lng ? ` · ${parseFloat(h.lat).toFixed(4)}, ${parseFloat(h.lng).toFixed(4)}` : ' · no coordinates'}</div>
              </div>
              <button type="button" onClick={() => openEdit(h)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white', color: '#1d4ed8', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                ✎ Edit
              </button>
              <button type="button" onClick={() => removeHub(h)} disabled={saving}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '11px', cursor: 'pointer' }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new hub form */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '12px' }}>
            {showForm === 'new' ? '+ New Hub Location' : `✎ Edit — ${showForm.name}`}
          </div>

          {/* Google Places search */}
          <div style={{ marginBottom: '10px', position: 'relative' }}>
            <label style={lbl2}>Search on Google Maps</label>
            <input
              value={placeQuery}
              onChange={e => setPlaceQuery(e.target.value)}
              placeholder="Search airport, station, hub…"
              style={inp2}
              autoComplete="off"
            />
            {placeLoading && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>Searching…</div>}
            {placeOpen && predictions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {predictions.map(p => (
                  <div key={p.place_id} onClick={() => handleSelectPlace(p)}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    📍 {p.main_text} {p.secondary_text && <span style={{ color: '#94a3b8', fontSize: '11px' }}>— {p.secondary_text}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={lbl2}>ID *</label>
              <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value.toUpperCase() }))}
                style={{ ...inp2, fontFamily: 'monospace', fontWeight: '700', background: showForm !== 'new' ? '#f8fafc' : 'white' }}
                placeholder="APT_BRI" readOnly={showForm !== 'new'} />
            </div>
            <div>
              <label style={lbl2}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inp2} placeholder="Bari Airport" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={lbl2}>Lat</label>
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                style={inp2} placeholder="41.138900" />
            </div>
            <div>
              <label style={lbl2}>Lng</label>
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                style={inp2} placeholder="16.760300" />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={lbl2}>Default Pickup Point</label>
            <input value={form.default_pickup_point} onChange={e => setForm(f => ({ ...f, default_pickup_point: e.target.value }))}
              style={inp2} placeholder="Arrivals exit, Terminal 1…" />
          </div>

          {formError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>❌ {formError}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...HUB_EMPTY }); setPlaceQuery('') }}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSaveHub} disabled={formSaving}
              style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: formSaving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '12px', cursor: formSaving ? 'default' : 'pointer', fontWeight: '800' }}>
              {formSaving ? 'Saving…' : showForm === 'new' ? '+ Save Hub' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Add buttons */}
      {!showForm && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button type="button" onClick={openNew}
            style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            + New Hub Location
          </button>
        </div>
      )}

      {/* Search existing non-hub locations */}
      {!showForm && (
        <div style={{ position: 'relative' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Or search existing location to mark as hub…"
            style={{ ...inp2, fontSize: '12px' }}
            autoComplete="off"
          />
          {searching && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {results.map(r => (
                <div key={r.id} onClick={() => addExistingHub(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  📍 {r.name} <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function ProductionSettingsPage() {
  const router = useRouter()
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState(null)
  const [prodId,  setProdId]  = useState('')
  const [logoFile,    setLogoFile]    = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const fileRef = useRef(null)

  const [form, setForm] = useState({
    name: '',
    slug: '',
    logo_url: '',
    director: '',
    producer: '',
    production_manager: '',
    production_manager_phone: '',
    production_coordinator: '',
    production_coordinator_phone: '',
    transportation_coordinator: '',
    transportation_coordinator_phone: '',
    transportation_captain: '',
    transportation_captain_phone: '',
    production_office_phone: '',
    set_location: '',
    set_address: '',
    basecamp: '',
    general_call_time: '',
    shoot_day: '',
    revision: '1',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      const id = getProductionId()
      setProdId(id)
      if (id) loadProduction(id)
      else setLoading(false)
    })
  }, [])

  async function loadProduction(id) {
    setLoading(true)
    const { data, error } = await supabase
      .from('productions')
      .select('*')
      .eq('id', id)
      .single()
    if (data) {
      setForm({
        name:                             data.name                             || '',
        slug:                             data.slug                             || '',
        logo_url:                         data.logo_url                         || '',
        director:                         data.director                         || '',
        producer:                         data.producer                         || '',
        production_manager:               data.production_manager               || '',
        production_manager_phone:         data.production_manager_phone         || '',
        production_coordinator:           data.production_coordinator           || '',
        production_coordinator_phone:     data.production_coordinator_phone     || '',
        transportation_coordinator:       data.transportation_coordinator       || '',
        transportation_coordinator_phone: data.transportation_coordinator_phone || '',
        transportation_captain:           data.transportation_captain           || '',
        transportation_captain_phone:     data.transportation_captain_phone     || '',
        production_office_phone:          data.production_office_phone          || '',
        set_location:                     data.set_location                     || '',
        set_address:                      data.set_address                      || '',
        basecamp:                         data.basecamp                         || '',
        general_call_time:                data.general_call_time                || '',
        shoot_day:                        data.shoot_day != null ? String(data.shoot_day) : '',
        revision:                         data.revision  != null ? String(data.revision)  : '1',
      })
      if (data.logo_url) setLogoPreview(data.logo_url)
    }
    if (error) setError(error.message)
    setLoading(false)
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo(file, id) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('productionId', id)
    const res  = await fetch('/api/productions/upload-logo', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json.logo_url
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(null); setSaved(false); setSaving(true)
    try {
      let logo_url = form.logo_url || undefined
      if (logoFile) {
        logo_url = await uploadLogo(logoFile, prodId)
        set('logo_url', logo_url)
      }

      const body = {
        id: prodId,
        ...form,
        logo_url: logo_url !== undefined ? logo_url : (form.logo_url || null),
        shoot_day: form.shoot_day ? parseInt(form.shoot_day) : null,
        revision:  form.revision  ? parseInt(form.revision)  : 1,
      }

      const res  = await fetch('/api/productions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      setSaved(true)
      setLogoFile(null)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!user || loading) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  const inp = {
    width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
    borderRadius: '8px', fontSize: '14px', color: '#0f172a',
    background: 'white', boxSizing: 'border-box',
  }
  const lbl = {
    fontSize: '10px', fontWeight: '800', color: '#94a3b8',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    display: 'block', marginBottom: '3px',
  }
  const section = (title, icon) => (
    <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>{icon}</span> {title}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/settings/production" />

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>⚙️ Production Settings</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
            These details appear in the Transport List header. All fields are optional except Production Name.
          </p>
          {prodId && (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '4px' }}>
              Production ID: {prodId}
            </div>
          )}
        </div>

        {!prodId && (
          <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', marginBottom: '20px' }}>
            ⚠️ No active production selected. Go to <a href="/dashboard/productions" style={{ color: '#2563eb' }}>Productions</a> and activate one first.
          </div>
        )}

        <form onSubmit={handleSave}>

          {/* ── PRODUCTION IDENTITY ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '16px' }}>
            {section('Production Identity', '🎬')}

            {/* Logo */}
            <div style={{ marginBottom: '18px' }}>
              <label style={lbl}>Production Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="logo" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '12px', background: 'white', border: '1px solid #e2e8f0', padding: '6px' }} />
                ) : (
                  <div onClick={() => fileRef.current?.click()} style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', cursor: 'pointer' }}>🎬</div>
                )}
                <div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                    📁 Upload Logo
                  </button>
                  {logoFile && <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px', fontWeight: '600' }}>✓ {logoFile.name}</div>}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>PNG, JPG, SVG — max 2 MB</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Production Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} style={inp} required placeholder="e.g. Palermo 2026" />
              </div>
              <div>
                <label style={lbl}>Shoot Day</label>
                <input type="number" value={form.shoot_day} onChange={e => set('shoot_day', e.target.value)} style={inp} placeholder="42" min="1" />
              </div>
              <div>
                <label style={lbl}>Revision</label>
                <input type="number" value={form.revision} onChange={e => set('revision', e.target.value)} style={inp} placeholder="1" min="1" />
              </div>
              <div>
                <label style={lbl}>General Call Time</label>
                <input type="time" value={form.general_call_time} onChange={e => set('general_call_time', e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          {/* ── KEY CREATIVES ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '16px' }}>
            {section('Key Creatives', '🎭')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Director</label>
                <input value={form.director} onChange={e => set('director', e.target.value)} style={inp} placeholder="e.g. John Smith" />
              </div>
              <div>
                <label style={lbl}>Producer</label>
                <input value={form.producer} onChange={e => set('producer', e.target.value)} style={inp} placeholder="e.g. Jane Doe" />
              </div>
            </div>
          </div>

          {/* ── PRODUCTION TEAM ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '16px' }}>
            {section('Production Team', '👥')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Production Manager — Name</label>
                <input value={form.production_manager} onChange={e => set('production_manager', e.target.value)} style={inp} placeholder="e.g. Robert Brown" />
              </div>
              <div>
                <label style={lbl}>Production Manager — Phone</label>
                <input value={form.production_manager_phone} onChange={e => set('production_manager_phone', e.target.value)} style={inp} placeholder="+39 320 111 0000" />
              </div>
              <div>
                <label style={lbl}>Production Coordinator — Name</label>
                <input value={form.production_coordinator} onChange={e => set('production_coordinator', e.target.value)} style={inp} placeholder="e.g. Maria Rossi" />
              </div>
              <div>
                <label style={lbl}>Production Coordinator — Phone</label>
                <input value={form.production_coordinator_phone} onChange={e => set('production_coordinator_phone', e.target.value)} style={inp} placeholder="+39 320 000 0000" />
              </div>
            </div>
          </div>

          {/* ── TRANSPORTATION TEAM ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '16px' }}>
            {section('Transportation Team', '🚌')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Transportation Coordinator — Name</label>
                <input value={form.transportation_coordinator} onChange={e => set('transportation_coordinator', e.target.value)} style={inp} placeholder="e.g. Daniele Contino" />
              </div>
              <div>
                <label style={lbl}>Transportation Coordinator — Phone</label>
                <input value={form.transportation_coordinator_phone} onChange={e => set('transportation_coordinator_phone', e.target.value)} style={inp} placeholder="+39 333 000 0000" />
              </div>
              <div>
                <label style={lbl}>Transportation Captain — Name</label>
                <input value={form.transportation_captain} onChange={e => set('transportation_captain', e.target.value)} style={inp} placeholder="e.g. Marco Bianchi" />
              </div>
              <div>
                <label style={lbl}>Transportation Captain — Phone</label>
                <input value={form.transportation_captain_phone} onChange={e => set('transportation_captain_phone', e.target.value)} style={inp} placeholder="+39 347 000 0000" />
              </div>
              <div>
                <label style={lbl}>Production Office — Phone</label>
                <input value={form.production_office_phone} onChange={e => set('production_office_phone', e.target.value)} style={inp} placeholder="+39 091 000 0000" />
              </div>
            </div>
          </div>

          {/* ── LOCATIONS ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '20px' }}>
            {section('Set & Basecamp', '📍')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Set Location — Name</label>
                <input value={form.set_location} onChange={e => set('set_location', e.target.value)} style={inp} placeholder="e.g. Cinecitta Studio 5" />
              </div>
              <div>
                <label style={lbl}>Set Location — Address</label>
                <input value={form.set_address} onChange={e => set('set_address', e.target.value)} style={inp} placeholder="e.g. Via Tuscolana 1055" />
              </div>
              <div>
                <label style={lbl}>Basecamp</label>
                <input value={form.basecamp} onChange={e => set('basecamp', e.target.value)} style={inp} placeholder="e.g. Parking Area B" />
              </div>
            </div>

            {prodId && <HubLocationsSection productionId={prodId} />}
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '14px' }}>
              ❌ {error}
            </div>
          )}
          {saved && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#16a34a', fontSize: '13px', marginBottom: '14px' }}>
              ✅ Production settings saved successfully!
            </div>
          )}

          {/* Save button */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => router.push('/dashboard/productions')}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
              ← Back to Productions
            </button>
            <button type="submit" disabled={saving || !prodId}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '15px', cursor: 'pointer', fontWeight: '800', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              {saving ? 'Saving…' : '💾 Save Production Settings'}
            </button>
          </div>

        </form>

        {/* Preview hint */}
        <div style={{ marginTop: '20px', padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #2563eb', borderRadius: '10px', fontSize: '12px', color: '#374151' }}>
          <strong>💡 Tip:</strong> After saving, go to <a href="/dashboard/lists" style={{ color: '#2563eb', fontWeight: '700' }}>Transport Lists</a> to see the header with all your production details.
        </div>

      </div>
    </div>
  )
}
