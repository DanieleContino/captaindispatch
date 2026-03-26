'use client'
/**
 * /dashboard/productions
 * Fase 5 — Multi-produzione + Production Switcher
 *
 * - Lista le produzioni a cui l'utente ha accesso
 * - Permette di creare nuove produzioni
 * - Switcher: imposta la production attiva in localStorage → tutte le sub-page
 *   useranno quel valore alla prossima navigazione
 * - Mostra la production attiva corrente
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { switchProduction, getProductionId } from '../../../lib/production'
import { Navbar } from '../../../lib/navbar'

function isoNow() {
  return new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function ProductionsPage() {
  const router = useRouter()
  const [user,         setUser]         = useState(null)
  const [productions,  setProductions]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeId,     setActiveId]     = useState('')
  const [creating,     setCreating]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [form,         setForm]         = useState({ name: '', slug: '' })
  const [editId,       setEditId]       = useState(null)
  const [editForm,     setEditForm]     = useState({ name: '', slug: '' })
  const [editSaving,   setEditSaving]   = useState(false)

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

  async function handleCreate(e) {
    e.preventDefault(); setError(null)
    if (!form.name.trim()) { setError('Nome obbligatorio'); return }
    setSaving(true)
    const res  = await fetch('/api/productions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), slug: form.slug || slugify(form.name) }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error); return }
    setForm({ name: '', slug: '' }); setCreating(false)
    loadProductions()
    // Attiva automaticamente la prima produzione creata
    if (productions.length === 0) switchProduction(json.production.id)
  }

  async function handleEdit(e) {
    e.preventDefault(); setEditSaving(true)
    const res = await fetch('/api/productions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editForm }),
    })
    setEditSaving(false)
    if (res.ok) { setEditId(null); loadProductions() }
  }

  function handleSwitch(id) {
    switchProduction(id)  // imposta localStorage + redirect /dashboard
  }

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <Navbar currentPath="/dashboard/productions" />

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Titolo */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>🎬 Produzioni</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Gestisci le produzioni e imposta quella attiva per il tuo account.</p>
        </div>

        {/* Production attiva corrente */}
        {activeId && (() => {
          const active = productions.find(p => p.id === activeId)
          return active ? (
            <div style={{ background: '#eff6ff', border: '2px solid #2563eb', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', letterSpacing: '0.07em' }}>PRODUZIONE ATTIVA</div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{active.name}</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>ID: {active.id}</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#1d4ed8', color: 'white' }}>{active.role}</span>
              </div>
            </div>
          ) : null
        })()}

        {/* Lista produzioni */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>Le tue produzioni ({productions.length})</div>
            <button onClick={() => { setCreating(true); setError(null) }}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              + Nuova Produzione
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Caricamento…</div>
          ) : productions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
              <div style={{ color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>Nessuna produzione ancora</div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Crea la prima produzione per iniziare</div>
            </div>
          ) : (
            <div>
              {productions.map((prod, i) => {
                const isActive = prod.id === activeId
                const isEditing = editId === prod.id
                return (
                  <div key={prod.id} style={{ borderBottom: i < productions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    {!isEditing ? (
                      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', background: isActive ? '#f8fbff' : 'white' }}>
                        {/* Status dot */}
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? '#22c55e' : '#e2e8f0', flexShrink: 0, boxShadow: isActive ? '0 0 6px #22c55e' : 'none' }} />

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{prod.name}</span>
                            {isActive && <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#22c55e', color: 'white', fontSize: '10px', fontWeight: '800' }}>ATTIVA</span>}
                            <span style={{ padding: '2px 8px', borderRadius: '5px', background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '700' }}>{prod.role}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            ID: {prod.id} · slug: {prod.slug}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          {!isActive && (
                            <button onClick={() => handleSwitch(prod.id)}
                              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                              ↔ Attiva
                            </button>
                          )}
                          <button onClick={() => { setEditId(prod.id); setEditForm({ name: prod.name, slug: prod.slug }) }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                            ✎
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Edit inline */
                      <form onSubmit={handleEdit} style={{ padding: '16px 20px', background: '#f8fafc', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <label style={lbl}>Nome</label>
                          <input value={editForm.name} onChange={e => setE('name', e.target.value)} style={inp} required />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={lbl}>Slug</label>
                          <input value={editForm.slug} onChange={e => setE('slug', e.target.value)} style={inp} placeholder="auto" />
                        </div>
                        <button type="submit" disabled={editSaving}
                          style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {editSaving ? '…' : '✓ Salva'}
                        </button>
                        <button type="button" onClick={() => setEditId(null)}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Crea nuova produzione */}
        {creating && (
          <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #2563eb', padding: '20px 24px' }}>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a', marginBottom: '16px' }}>🎬 Nuova Produzione</div>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Nome produzione *</label>
                  <input value={form.name} onChange={e => { set('name', e.target.value); set('slug', slugify(e.target.value)) }}
                    style={inp} placeholder="Palermo 2026" required autoFocus />
                </div>
                <div>
                  <label style={lbl}>Slug (URL) — auto</label>
                  <input value={form.slug} onChange={e => set('slug', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="palermo-2026" />
                </div>
              </div>
              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#dc2626', fontSize: '12px', marginBottom: '12px' }}>❌ {error}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setCreating(false); setError(null) }}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  Annulla
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>
                  {saving ? 'Creazione…' : '🎬 Crea Produzione'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Info box */}
        <div style={{ marginTop: '24px', padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #f59e0b', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>ℹ Come funziona il multi-produzione</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>Ogni produzione ha i suoi trip, crew, veicoli e locations <strong>separati</strong></li>
            <li>Clicca <strong>"↔ Attiva"</strong> per passare a una produzione diversa — tutte le pagine useranno quell'ID</li>
            <li>Puoi invitare altri utenti (Managers, Production) tramite il Supabase dashboard (RBAC completo in roadmap)</li>
            <li>La variabile <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>NEXT_PUBLIC_PRODUCTION_ID</code> nel <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>.env.local</code> è il <em>default</em> — localStorage ha la precedenza</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
