'use client'
/**
 * /dashboard/productions
 * Phase 5 — Multi-production + Production Switcher
 *
 * - Lists productions the user has access to
 * - Allows creating new productions with all transport list header fields
 * - Logo upload via Supabase Storage (bucket: production-logos)
 * - Switcher: sets active production in localStorage → all sub-pages use that value
 * - Shows current active production
 */
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { switchProduction, getProductionId } from '../../../lib/production'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const BUCKET = 'production-logos'

const EMPTY_FORM = {
  name: '', slug: '',
  // Key creatives
  director: '', producer: '',
  // Production team
  production_manager: '', production_manager_phone: '',
  production_coordinator: '', production_coordinator_phone: '',
  // Transportation team
  transportation_coordinator: '', transportation_coordinator_phone: '',
  transportation_captain: '', transportation_captain_phone: '',
  production_office_phone: '',
  // Set & Basecamp
  set_location: '', set_address: '', basecamp: '',
  // Schedule
  general_call_time: '', shoot_day: '', revision: '1',
}

const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
function sectionTitle(icon, title) {
  return (
    <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '5px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
      <span>{icon}</span> {title}
    </div>
  )
}

// ── Shared form fields (used in both create and edit) ──
function FormFields({ values, onChange, isEdit = false }) {
  const t = useT()
  const s = (k, v) => onChange(k, v)
  return (
    <>
      {/* Identity */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '4px' }}>
        <div>
          <label style={lbl}>{t.productionsNameLabel}</label>
          <input value={values.name}
            onChange={e => { s('name', e.target.value); if (!isEdit) s('slug', slugify(e.target.value)) }}
            style={inp} required placeholder="e.g. Palermo 2026" autoFocus={!isEdit} />
        </div>
        <div>
          <label style={lbl}>{t.productionsSlugLabel}</label>
          <input value={values.slug} onChange={e => s('slug', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="auto" />
        </div>
      </div>

      {/* Schedule */}
      {sectionTitle('🗓', t.productionsScheduleSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsCallTimeLabel}</label>
          <input type="time" value={values.general_call_time} onChange={e => s('general_call_time', e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{t.productionsShootDayLabel}</label>
          <input type="number" value={values.shoot_day} onChange={e => s('shoot_day', e.target.value)} style={inp} placeholder="42" min="1" />
        </div>
        <div>
          <label style={lbl}>{t.productionsRevisionLabel}</label>
          <input type="number" value={values.revision} onChange={e => s('revision', e.target.value)} style={inp} placeholder="1" min="1" />
        </div>
      </div>

      {/* Key Creatives */}
      {sectionTitle('🎭', t.productionsKeyCreativesSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsDirectorLabel}</label>
          <input value={values.director} onChange={e => s('director', e.target.value)} style={inp} placeholder="e.g. John Smith" />
        </div>
        <div>
          <label style={lbl}>{t.productionsProducerLabel}</label>
          <input value={values.producer} onChange={e => s('producer', e.target.value)} style={inp} placeholder="e.g. Jane Doe" />
        </div>
      </div>

      {/* Production Team */}
      {sectionTitle('👥', t.productionsProdTeamSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsPmNameLabel}</label>
          <input value={values.production_manager} onChange={e => s('production_manager', e.target.value)} style={inp} placeholder="e.g. Robert Brown" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPmPhoneLabel}</label>
          <input value={values.production_manager_phone} onChange={e => s('production_manager_phone', e.target.value)} style={inp} placeholder="+39 320 111 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPcNameLabel}</label>
          <input value={values.production_coordinator} onChange={e => s('production_coordinator', e.target.value)} style={inp} placeholder="e.g. Maria Rossi" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPcPhoneLabel}</label>
          <input value={values.production_coordinator_phone} onChange={e => s('production_coordinator_phone', e.target.value)} style={inp} placeholder="+39 320 000 0000" />
        </div>
      </div>

      {/* Transportation Team */}
      {sectionTitle('🚌', t.productionsTranspTeamSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsTcNameLabel}</label>
          <input value={values.transportation_coordinator} onChange={e => s('transportation_coordinator', e.target.value)} style={inp} placeholder="e.g. Daniele Contino" />
        </div>
        <div>
          <label style={lbl}>{t.productionsTcPhoneLabel}</label>
          <input value={values.transportation_coordinator_phone} onChange={e => s('transportation_coordinator_phone', e.target.value)} style={inp} placeholder="+39 333 000 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsCaptNameLabel}</label>
          <input value={values.transportation_captain} onChange={e => s('transportation_captain', e.target.value)} style={inp} placeholder="e.g. Marco Bianchi" />
        </div>
        <div>
          <label style={lbl}>{t.productionsCaptPhoneLabel}</label>
          <input value={values.transportation_captain_phone} onChange={e => s('transportation_captain_phone', e.target.value)} style={inp} placeholder="+39 347 000 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsOfficePhoneLabel}</label>
          <input value={values.production_office_phone} onChange={e => s('production_office_phone', e.target.value)} style={inp} placeholder="+39 091 000 0000" />
        </div>
      </div>

      {/* Set & Basecamp */}
      {sectionTitle('📍', t.productionsSetBasecampSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsSetNameLabel}</label>
          <input value={values.set_location} onChange={e => s('set_location', e.target.value)} style={inp} placeholder="e.g. Cinecitta Studio 5" />
        </div>
        <div>
          <label style={lbl}>{t.productionsSetAddressLabel}</label>
          <input value={values.set_address} onChange={e => s('set_address', e.target.value)} style={inp} placeholder="e.g. Via Tuscolana 1055" />
        </div>
        <div>
          <label style={lbl}>{t.productionsBasecampLabel}</label>
          <input value={values.basecamp} onChange={e => s('basecamp', e.target.value)} style={inp} placeholder="e.g. Parking Area B" />
        </div>
      </div>
    </>
  )
}

export default function ProductionsPage() {
  const t = useT()
  const router = useRouter()
  const [user,         setUser]         = useState(null)
  const [productions,  setProductions]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeId,     setActiveId]     = useState('')
  const [creating,     setCreating]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(null)
  const [editId,       setEditId]       = useState(null)
  const [editForm,     setEditForm]     = useState({ ...EMPTY_FORM })
  const [editLogoFile, setEditLogoFile] = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState(null)
  const [editSaving,   setEditSaving]   = useState(false)
  const fileInputRef   = useRef(null)
  const editFileRef    = useRef(null)

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    setActiveId(getProductionId())
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      loadProductions()
    })
  }, [])

  async function loadProductions() {
    setLoading(true)
    const res = await fetch('/api/productions')
    const json = await res.json()
    setProductions(json.productions || [])
    setLoading(false)
  }

  function handleLogoChange(e, isEdit = false) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (isEdit) {
      setEditLogoFile(file)
      setEditLogoPreview(url)
    } else {
      setLogoFile(file)
      setLogoPreview(url)
    }
  }

  async function uploadLogo(file, productionId) {
    const ext  = file.name.split('.').pop()
    const path = `${productionId}/logo.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw new Error(upErr.message)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl + '?t=' + Date.now()
  }

  async function handleCreate(e) {
    e.preventDefault(); setError(null)
    if (!form.name.trim()) { setError('Production name is required'); return }
    setSaving(true)
    try {
      const res  = await fetch('/api/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug || slugify(form.name),
          director: form.director.trim(),
          producer: form.producer.trim(),
          production_manager: form.production_manager.trim(),
          production_manager_phone: form.production_manager_phone.trim(),
          production_coordinator: form.production_coordinator.trim(),
          production_coordinator_phone: form.production_coordinator_phone.trim(),
          transportation_coordinator: form.transportation_coordinator.trim(),
          transportation_coordinator_phone: form.transportation_coordinator_phone.trim(),
          transportation_captain: form.transportation_captain.trim(),
          transportation_captain_phone: form.transportation_captain_phone.trim(),
          production_office_phone: form.production_office_phone.trim(),
          set_location: form.set_location.trim(),
          set_address: form.set_address.trim(),
          basecamp: form.basecamp.trim(),
          general_call_time: form.general_call_time || null,
          shoot_day: form.shoot_day ? parseInt(form.shoot_day) : null,
          revision: form.revision ? parseInt(form.revision) : 1,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setSaving(false); return }

      if (logoFile) {
        try {
          const logoUrl = await uploadLogo(logoFile, json.production.id)
          await fetch('/api/productions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.production.id, logo_url: logoUrl }),
          })
        } catch (logoErr) {
          console.warn('Logo upload failed:', logoErr.message)
        }
      }

      setForm({ ...EMPTY_FORM })
      setLogoFile(null); setLogoPreview(null)
      setCreating(false)
      loadProductions()
      if (productions.length === 0) switchProduction(json.production.id)
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(e) {
    e.preventDefault(); setEditSaving(true)
    try {
      let logo_url = undefined
      if (editLogoFile) {
        try {
          logo_url = await uploadLogo(editLogoFile, editId)
        } catch (logoErr) {
          console.warn('Logo upload failed:', logoErr.message)
        }
      }
      const body = {
        id: editId,
        name: editForm.name,
        slug: editForm.slug,
        director: editForm.director,
        producer: editForm.producer,
        production_manager: editForm.production_manager,
        production_manager_phone: editForm.production_manager_phone,
        production_coordinator: editForm.production_coordinator,
        production_coordinator_phone: editForm.production_coordinator_phone,
        transportation_coordinator: editForm.transportation_coordinator,
        transportation_coordinator_phone: editForm.transportation_coordinator_phone,
        transportation_captain: editForm.transportation_captain,
        transportation_captain_phone: editForm.transportation_captain_phone,
        production_office_phone: editForm.production_office_phone,
        set_location: editForm.set_location,
        set_address: editForm.set_address,
        basecamp: editForm.basecamp,
        general_call_time: editForm.general_call_time || null,
        shoot_day: editForm.shoot_day ? parseInt(editForm.shoot_day) : null,
        revision: editForm.revision ? parseInt(editForm.revision) : 1,
      }
      if (logo_url !== undefined) body.logo_url = logo_url

      const res = await fetch('/api/productions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setEditId(null)
        setEditLogoFile(null)
        setEditLogoPreview(null)
        loadProductions()
      }
    } finally {
      setEditSaving(false)
    }
  }

  function handleSwitch(id) {
    switchProduction(id)
  }

  function openEdit(prod) {
    setEditId(prod.id)
    setEditForm({
      name:                             prod.name                             || '',
      slug:                             prod.slug                             || '',
      director:                         prod.director                         || '',
      producer:                         prod.producer                         || '',
      production_manager:               prod.production_manager               || '',
      production_manager_phone:         prod.production_manager_phone         || '',
      production_coordinator:           prod.production_coordinator           || '',
      production_coordinator_phone:     prod.production_coordinator_phone     || '',
      transportation_coordinator:       prod.transportation_coordinator       || '',
      transportation_coordinator_phone: prod.transportation_coordinator_phone || '',
      transportation_captain:           prod.transportation_captain           || '',
      transportation_captain_phone:     prod.transportation_captain_phone     || '',
      production_office_phone:          prod.production_office_phone          || '',
      set_location:                     prod.set_location                     || '',
      set_address:                      prod.set_address                      || '',
      basecamp:                         prod.basecamp                         || '',
      general_call_time:                prod.general_call_time                || '',
      shoot_day:                        prod.shoot_day != null ? String(prod.shoot_day) : '',
      revision:                         prod.revision  != null ? String(prod.revision)  : '1',
    })
    setEditLogoFile(null)
    setEditLogoPreview(prod.logo_url || null)
  }

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/productions" />

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{t.productionsTitle}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>{t.productionsDesc}</p>
        </div>

        {/* Active production banner */}
        {activeId && (() => {
          const active = productions.find(p => p.id === activeId)
          return active ? (
            <div style={{ background: '#eff6ff', border: '2px solid #2563eb', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              {active.logo_url ? (
                <img src={active.logo_url} alt="logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', padding: '4px' }} />
              ) : (
                <span style={{ fontSize: '28px' }}>✅</span>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', letterSpacing: '0.07em' }}>{t.productionsActiveLabel}</div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{active.name}</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {active.director && <span>🎬 <strong>Director:</strong> {active.director}</span>}
                  {active.producer && <span>👤 <strong>Producer:</strong> {active.producer}</span>}
                  {active.general_call_time && <span>⏰ <strong>Call:</strong> {active.general_call_time.slice(0,5)}</span>}
                  {active.shoot_day && <span>📅 <strong>Day:</strong> {active.shoot_day}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>ID: {active.id}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#1d4ed8', color: 'white' }}>{active.role}</span>
                <a href="/dashboard/lists" style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700', textDecoration: 'none' }}>{t.productionsViewTransportList}</a>
              </div>
            </div>
          ) : null
        })()}

        {/* Productions list */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{t.productionsYours} ({productions.length})</div>
            <button onClick={() => { setCreating(true); setError(null) }}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              {t.productionsNewBtn}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>{t.loading}</div>
          ) : productions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
              <div style={{ color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>{t.productionsNone}</div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>{t.productionsNoneDesc}</div>
            </div>
          ) : (
            <div>
              {productions.map((prod, i) => {
                const isActive  = prod.id === activeId
                const isEditing = editId === prod.id
                return (
                  <div key={prod.id} style={{ borderBottom: i < productions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    {!isEditing ? (
                      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', background: isActive ? '#f8fbff' : 'white' }}>
                        {/* Logo or icon */}
                        {prod.logo_url ? (
                          <img src={prod.logo_url} alt="logo" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎬</div>
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{prod.name}</span>
                            {isActive && <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#22c55e', color: 'white', fontSize: '10px', fontWeight: '800' }}>ACTIVE</span>}
                            <span style={{ padding: '2px 8px', borderRadius: '5px', background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '700' }}>{prod.role}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
                            {prod.director && <span>🎬 {prod.director}</span>}
                            {prod.producer && <span>👤 {prod.producer}</span>}
                            {prod.general_call_time && <span>⏰ {prod.general_call_time.slice(0,5)}</span>}
                            {prod.shoot_day && <span>📅 Day {prod.shoot_day}</span>}
                            {prod.set_location && <span>📍 {prod.set_location}</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                            slug: {prod.slug}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          {!isActive && (
                            <button onClick={() => handleSwitch(prod.id)}
                              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                              {t.productionsActivateBtn}
                            </button>
                          )}
                          <button onClick={() => openEdit(prod)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                            {t.productionsEditBtn}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Inline edit form (full fields) ── */
                      <form onSubmit={handleEdit} style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '2px solid #2563eb' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>✎ Edit Production — {prod.name}</div>

                        {/* Logo upload */}
                        <div style={{ marginBottom: '14px' }}>
                          <label style={lbl}>Production Logo</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            {editLogoPreview ? (
                              <img src={editLogoPreview} alt="logo preview" style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', padding: '6px' }} />
                            ) : (
                              <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🎬</div>
                            )}
                            <div>
                              <button type="button" onClick={() => editFileRef.current?.click()}
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                                {t.productionsChooseLogo}
                              </button>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t.productionsLogoHint}</div>
                              <input ref={editFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, true)} />
                            </div>
                          </div>
                        </div>

                        <FormFields values={editForm} onChange={setE} isEdit={true} />

                        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                          <button type="button" onClick={() => { setEditId(null); setEditLogoFile(null); setEditLogoPreview(null) }}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                            ✕ {t.cancel}
                          </button>
                          <button type="submit" disabled={editSaving}
                            style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', background: editSaving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}>
                            {editSaving ? t.saving : t.productionsSaveChanges}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Create new production */}
        {creating && (
          <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #2563eb', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', marginBottom: '18px' }}>{t.productionsNewTitle}</div>
            <form onSubmit={handleCreate}>

              {/* Logo upload */}
              <div style={{ marginBottom: '18px' }}>
                <label style={lbl}>Production Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {logoPreview ? (
                    <img src={logoPreview} alt="logo preview" style={{ width: '72px', height: '72px', objectFit: 'contain', borderRadius: '12px', background: 'white', border: '1px solid #e2e8f0', padding: '6px' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', borderRadius: '12px', background: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', cursor: 'pointer' }}
                      onClick={() => fileInputRef.current?.click()}>
                      🎬
                    </div>
                  )}
                  <div>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      {t.productionsUploadLogo}
                    </button>
                    {logoFile && <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px', fontWeight: '600' }}>✓ {logoFile.name}</div>}
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t.productionsLogoHint}</div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, false)} />
                  </div>
                </div>
              </div>

              <FormFields values={form} onChange={set} isEdit={false} />

              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#dc2626', fontSize: '12px', marginTop: '14px', marginBottom: '4px' }}>❌ {error}</div>}

              <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                <button type="button" onClick={() => { setCreating(false); setError(null); setLogoFile(null); setLogoPreview(null); setForm({ ...EMPTY_FORM }) }}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  {t.cancel}
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>
                  {saving ? t.productionsCreatingBtn : t.productionsCreate}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Info box */}
        <div style={{ marginTop: '8px', padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #f59e0b', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>{t.productionsInfoTitle}</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>{t.productionsInfoLine1}</li>
            <li>{t.productionsInfoLine2}</li>
            <li>{t.productionsInfoLine3}</li>
            <li>{t.productionsInfoLine4}</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
