'use client'
/**
 * /dashboard/settings/production
 * Edit all production details used in the Transport List header.
 * Data is saved to Supabase table: productions
 */
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getProductionId } from '../../../../lib/production'
import { Navbar } from '../../../../lib/navbar'

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
