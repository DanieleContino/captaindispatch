'use client'
/**
 * /dashboard/productions
 * Phase 5 — Multi-production + Production Switcher
 *
 * - Lists productions the user has access to
 * - Allows creating new productions with name, slug, producer, production director
 * - Logo upload via Supabase Storage (bucket: production-logos)
 * - Switcher: sets active production in localStorage → all sub-pages use that value
 * - Shows current active production
 */
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { switchProduction, getProductionId } from '../../../lib/production'
import { Navbar } from '../../../lib/navbar'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const BUCKET = 'production-logos'

export default function ProductionsPage() {
  const router = useRouter()
  const [user,         setUser]         = useState(null)
  const [productions,  setProductions]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeId,     setActiveId]     = useState('')
  const [creating,     setCreating]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [form,         setForm]         = useState({ name: '', slug: '', producer: '', production_director: '' })
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(null)
  const [editId,       setEditId]       = useState(null)
  const [editForm,     setEditForm]     = useState({ name: '', slug: '', producer: '', production_director: '' })
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
    // Append cache-buster so the browser always shows the latest logo
    return data.publicUrl + '?t=' + Date.now()
  }

  async function handleCreate(e) {
    e.preventDefault(); setError(null)
    if (!form.name.trim()) { setError('Production name is required'); return }
    setSaving(true)
    try {
      // 1. Create production (without logo first)
      const res  = await fetch('/api/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug || slugify(form.name),
          producer: form.producer.trim(),
          production_director: form.production_director.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setSaving(false); return }

      // 2. Upload logo if provided
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

      setForm({ name: '', slug: '', producer: '', production_director: '' })
      setLogoFile(null); setLogoPreview(null)
      setCreating(false)
      loadProductions()
      // Auto-activate first production created
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
      const body = { id: editId, ...editForm }
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
      name: prod.name || '',
      slug: prod.slug || '',
      producer: prod.producer || '',
      production_director: prod.production_director || '',
    })
    setEditLogoFile(null)
    setEditLogoPreview(prod.logo_url || null)
  }

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/productions" />

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>🎬 Productions</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Manage your productions and set the active one for your account.</p>
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
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', letterSpacing: '0.07em' }}>ACTIVE PRODUCTION</div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{active.name}</div>
                {(active.producer || active.production_director) && (
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', display: 'flex', gap: '16px' }}>
                    {active.producer && <span>👤 <strong>Producer:</strong> {active.producer}</span>}
                    {active.production_director && <span>🎯 <strong>Production Director:</strong> {active.production_director}</span>}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>ID: {active.id}</div>
              </div>
              <div>
                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#1d4ed8', color: 'white' }}>{active.role}</span>
              </div>
            </div>
          ) : null
        })()}

        {/* Productions list */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>Your Productions ({productions.length})</div>
            <button onClick={() => { setCreating(true); setError(null) }}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              + New Production
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : productions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
              <div style={{ color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>No productions yet</div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Create your first production to get started</div>
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
                        {/* Logo or dot */}
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
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {prod.producer && (
                              <span style={{ fontSize: '12px', color: '#475569' }}>👤 <strong>Producer:</strong> {prod.producer}</span>
                            )}
                            {prod.production_director && (
                              <span style={{ fontSize: '12px', color: '#475569' }}>🎯 <strong>Prod. Director:</strong> {prod.production_director}</span>
                            )}
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
                              ↔ Activate
                            </button>
                          )}
                          <button onClick={() => openEdit(prod)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                            ✎ Edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Inline edit form */
                      <form onSubmit={handleEdit} style={{ padding: '20px', background: '#f8fafc', borderTop: '2px solid #2563eb' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '14px' }}>✎ Edit Production</div>

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
                                📁 Choose Logo
                              </button>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>PNG, JPG, SVG — max 2 MB</div>
                              <input ref={editFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, true)} />
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={lbl}>Production Name *</label>
                            <input value={editForm.name} onChange={e => setE('name', e.target.value)} style={inp} required />
                          </div>
                          <div>
                            <label style={lbl}>Slug (URL)</label>
                            <input value={editForm.slug} onChange={e => setE('slug', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="auto" />
                          </div>
                          <div>
                            <label style={lbl}>Producer</label>
                            <input value={editForm.producer} onChange={e => setE('producer', e.target.value)} style={inp} placeholder="e.g. John Smith" />
                          </div>
                          <div>
                            <label style={lbl}>Production Director</label>
                            <input value={editForm.production_director} onChange={e => setE('production_director', e.target.value)} style={inp} placeholder="e.g. Jane Doe" />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => { setEditId(null); setEditLogoFile(null); setEditLogoPreview(null) }}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                            ✕ Cancel
                          </button>
                          <button type="submit" disabled={editSaving}
                            style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', background: editSaving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}>
                            {editSaving ? 'Saving…' : '✓ Save Changes'}
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
          <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #2563eb', padding: '24px' }}>
            <div style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', marginBottom: '18px' }}>🎬 New Production</div>
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
                      📁 Upload Logo
                    </button>
                    {logoFile && <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px', fontWeight: '600' }}>✓ {logoFile.name}</div>}
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>PNG, JPG, SVG — max 2 MB</div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, false)} />
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Production Name *</label>
                  <input value={form.name} onChange={e => { set('name', e.target.value); set('slug', slugify(e.target.value)) }}
                    style={inp} placeholder="e.g. Palermo 2026" required autoFocus />
                </div>
                <div>
                  <label style={lbl}>Slug (URL) — auto</label>
                  <input value={form.slug} onChange={e => set('slug', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="palermo-2026" />
                </div>
                <div>
                  <label style={lbl}>Producer</label>
                  <input value={form.producer} onChange={e => set('producer', e.target.value)} style={inp} placeholder="e.g. John Smith" />
                </div>
                <div>
                  <label style={lbl}>Production Director</label>
                  <input value={form.production_director} onChange={e => set('production_director', e.target.value)} style={inp} placeholder="e.g. Jane Doe" />
                </div>
              </div>

              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#dc2626', fontSize: '12px', marginBottom: '12px' }}>❌ {error}</div>}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setCreating(false); setError(null); setLogoFile(null); setLogoPreview(null) }}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>
                  {saving ? 'Creating…' : '🎬 Create Production'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Info box */}
        <div style={{ marginTop: '24px', padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #f59e0b', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>ℹ How multi-production works</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>Each production has its own trips, crew, vehicles and locations — completely <strong>separate</strong></li>
            <li>Click <strong>"↔ Activate"</strong> to switch to a different production — all pages will use that ID</li>
            <li>You can invite other users (Managers, Production) via the Supabase dashboard (full RBAC on roadmap)</li>
            <li>The <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>NEXT_PUBLIC_PRODUCTION_ID</code> in <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>.env.local</code> is the <em>default</em> — localStorage takes precedence</li>
            <li>Logos are stored in Supabase Storage bucket <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>production-logos</code> — make sure the bucket exists and is public</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
