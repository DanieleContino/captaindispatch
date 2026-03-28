'use client'
/**
 * /dashboard/bridge — ⚓ Captain Bridge
 * Admin panel: pending users approval + invite codes management.
 * Only accessible to users with CAPTAIN or ADMIN role.
 */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'

// ── helpers ──────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}
function copyText(t) {
  navigator.clipboard?.writeText(t).catch(() => {})
}

const ROLES = ['MANAGER', 'PRODUCTION', 'CAPTAIN']

// ── styles ───────────────────────────────────────────────
const card  = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px' }
const hdr   = { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const inp   = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const sel   = { ...inp, cursor: 'pointer' }
const lbl   = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
const btnPrimary  = { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }
const btnSecondary= { padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
const btnGreen    = { ...btnPrimary, background: '#16a34a' }
const btnRed      = { ...btnPrimary, background: '#dc2626' }

// ── Pending Users tab ─────────────────────────────────────
function PendingUsersTab({ productions }) {
  const [pending,   setPending]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [working,   setWorking]   = useState({})  // userId → true
  const [dismissed, setDismissed] = useState(new Set())
  const [modal,     setModal]     = useState(null) // { userId, name, email }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const res  = await fetch('/api/bridge/pending-users')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setPending(json.pending || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function approveSandbox(userId) {
    setWorking(w => ({ ...w, [userId]: true }))
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mode: 'sandbox' }),
    })
    if (res.ok) setDismissed(d => new Set([...d, userId]))
    setWorking(w => ({ ...w, [userId]: false }))
  }

  function dismiss(userId) {
    setDismissed(d => new Set([...d, userId]))
  }

  const visible = pending.filter(u => !dismissed.has(u.id))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>
  if (visible.length === 0) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
      <div style={{ color: '#64748b', fontWeight: '600' }}>No pending users</div>
      <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Everyone who signed up has been handled.</div>
      <button onClick={load} style={{ ...btnSecondary, marginTop: '14px' }}>↺ Refresh</button>
    </div>
  )

  return (
    <div>
      <div style={{ padding: '12px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
        ⚠️ {visible.length} user{visible.length !== 1 ? 's' : ''} waiting — approve them or let them use an invite code.
        <button onClick={load} style={{ ...btnSecondary, marginLeft: '12px', padding: '3px 10px', fontSize: '11px' }}>↺ Refresh</button>
      </div>

      {visible.map(u => (
        <div key={u.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Avatar */}
          {u.avatar_url
            ? <img src={u.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
            : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>👤</div>
          }

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.name || u.email}
            </div>
            {u.name && <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Signed up {fmt(u.created_at)}</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => approveSandbox(u.id)} disabled={working[u.id]}
              style={{ ...btnGreen, opacity: working[u.id] ? 0.6 : 1 }}>
              {working[u.id] ? '…' : '✓ Sandbox'}
            </button>
            <button onClick={() => setModal(u)} style={btnPrimary}>
              ⊕ Add to prod
            </button>
            <button onClick={() => dismiss(u.id)} style={btnSecondary}>
              ✕ Ignore
            </button>
          </div>
        </div>
      ))}

      {/* Add-to-production modal */}
      {modal && (
        <AddToProductionModal
          user={modal}
          productions={productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))}
          onClose={() => setModal(null)}
          onDone={(userId) => { setDismissed(d => new Set([...d, userId])); setModal(null) }}
        />
      )}
    </div>
  )
}

function AddToProductionModal({ user, productions, onClose, onDone }) {
  const [prodId,  setProdId]  = useState(productions[0]?.id || '')
  const [role,    setRole]    = useState('MANAGER')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, mode: 'production', productionId: prodId, role }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setSaving(false) }
    else onDone(user.id)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '380px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: '900', fontSize: '17px', color: '#0f2340', marginBottom: '6px' }}>⊕ Add to Production</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
          {user.name || user.email} will be added with the selected role.
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={lbl}>Production</label>
            <select value={prodId} onChange={e => setProdId(e.target.value)} style={sel} required>
              {productions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <label style={lbl}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={sel}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>❌ {error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={saving || !prodId} style={{ ...btnGreen, flex: 2, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding…' : '✓ Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Invite Codes tab ──────────────────────────────────────
function InviteCodesTab({ productions }) {
  const [invites,    setInvites]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [showForm,   setShowForm]   = useState(false)
  const [copied,     setCopied]     = useState(null)
  const [deleting,   setDeleting]   = useState(null)

  // New invite form state
  const EMPTY = { production_id: productions[0]?.id || '', code: '', label: '', role: 'MANAGER', max_uses: '', expires_at: '' }
  const [form,    setForm]    = useState({ ...EMPTY })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/bridge/invites')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setInvites(json.invites || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) c += '-'
      c += chars[Math.floor(Math.random() * chars.length)]
    }
    setF('code', c)
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormErr(null); setSaving(true)
    const res = await fetch('/api/bridge/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: form.production_id,
        code:          form.code.trim().toUpperCase() || undefined,
        label:         form.label.trim() || undefined,
        role:          form.role,
        max_uses:      form.max_uses ? parseInt(form.max_uses) : null,
        expires_at:    form.expires_at || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error); setSaving(false); return }
    setInvites(inv => [json.invite, ...inv])
    setForm({ ...EMPTY })
    setShowForm(false)
    setSaving(false)
  }

  async function toggleActive(inv) {
    const res = await fetch('/api/bridge/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, active: !inv.active }),
    })
    if (res.ok) {
      const { invite } = await res.json()
      setInvites(list => list.map(i => i.id === invite.id ? invite : i))
    }
  }

  async function deleteInvite(id) {
    if (!confirm('Delete this invite code?')) return
    setDeleting(id)
    const res = await fetch('/api/bridge/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setInvites(list => list.filter(i => i.id !== id))
    setDeleting(null)
  }

  function handleCopy(code) {
    copyText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const managedProdIds = new Set(productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role)).map(p => p.id))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>

  return (
    <div>
      {/* ── New Code Form ── */}
      {showForm && (
        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '2px solid #2563eb' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>🔑 New Invite Code</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Production *</label>
                <select value={form.production_id} onChange={e => setF('production_id', e.target.value)} style={sel} required>
                  {productions.filter(p => managedProdIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role assigned</label>
                <select value={form.role} onChange={e => setF('role', e.target.value)} style={sel}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Code (leave blank = auto-generate)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                    placeholder="e.g. CREW-X7K2" style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em', flex: 1 }} />
                  <button type="button" onClick={generateRandom}
                    style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', whiteSpace: 'nowrap' }} title="Generate random">
                    🔀 Gen
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Label (optional)</label>
                <input value={form.label} onChange={e => setF('label', e.target.value)}
                  placeholder="e.g. Crew access June" style={inp} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Max uses (blank = unlimited)</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setF('max_uses', e.target.value)}
                  placeholder="e.g. 10" style={inp} />
              </div>
              <div>
                <label style={lbl}>Expires (blank = never)</label>
                <input type="date" value={form.expires_at} onChange={e => setF('expires_at', e.target.value)} style={inp} />
              </div>
            </div>

            {formErr && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {formErr}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(null) }} style={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving || !form.production_id}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating…' : '🔑 Create Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Invite list ── */}
      {invites.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <div style={{ color: '#64748b', fontWeight: '600' }}>No invite codes yet</div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Create a code to let people join a specific production instantly.</div>
        </div>
      ) : (
        <div>
          {invites.map(inv => {
            const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
            const isFull    = inv.max_uses !== null && inv.uses_count >= inv.max_uses
            const statusBg  = !inv.active ? '#f1f5f9' : isExpired || isFull ? '#fef2f2' : '#f0fdf4'
            const statusColor = !inv.active ? '#64748b' : isExpired || isFull ? '#dc2626' : '#16a34a'
            const statusLabel = !inv.active ? 'INACTIVE' : isExpired ? 'EXPIRED' : isFull ? 'FULL' : 'ACTIVE'

            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', opacity: !inv.active ? 0.65 : 1 }}>
                {/* Code block */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '16px', fontWeight: '900', color: '#0f2340', letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => handleCopy(inv.code)} title="Click to copy">
                  {inv.code}
                  <span style={{ fontSize: '11px', marginLeft: '8px', color: '#94a3b8', fontFamily: 'inherit', fontWeight: '400' }}>
                    {copied === inv.code ? '✓ copied' : '📋'}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                      {inv.productions?.name || '—'}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '700' }}>
                      {inv.role}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: statusBg, color: statusColor, fontSize: '10px', fontWeight: '700' }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    {inv.label && <span>{inv.label} · </span>}
                    Uses: <strong>{inv.uses_count}</strong>{inv.max_uses ? `/${inv.max_uses}` : ''} · 
                    {inv.expires_at ? ` Expires ${fmtDate(inv.expires_at)}` : ' No expiry'} · 
                    Created {fmt(inv.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => toggleActive(inv)}
                    style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}
                    title={inv.active ? 'Deactivate' : 'Activate'}>
                    {inv.active ? '⏸ Pause' : '▶ Enable'}
                  </button>
                  <button onClick={() => deleteInvite(inv.id)} disabled={deleting === inv.id}
                    style={{ ...btnRed, fontSize: '11px', padding: '5px 10px', opacity: deleting === inv.id ? 0.6 : 1 }}>
                    {deleting === inv.id ? '…' : '🗑'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function BridgePage() {
  const router = useRouter()
  const [user,        setUser]        = useState(null)
  const [productions, setProductions] = useState([])
  const [isBridge,    setIsBridge]    = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('pending')
  const [inviteCount, setInviteCount] = useState(null)

  // Pending badge state
  const [pendingCount, setPendingCount] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)

      const [prodsRes, rolesRes] = await Promise.all([
        fetch('/api/productions'),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ])
      const { productions: prods } = await prodsRes.json()
      setProductions(prods || [])

      const roles = rolesRes.data || []
      const admin = roles.some(r => ['CAPTAIN', 'ADMIN'].includes(r.role))
      setIsBridge(admin)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading…
    </div>
  )

  if (!isBridge) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/bridge" />
      <div style={{ maxWidth: '500px', margin: '80px auto', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px' }}>Access Denied</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>Captain Bridge is only available to CAPTAIN and ADMIN users.</p>
        <a href="/dashboard" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>← Back to Dashboard</a>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/bridge" />

      <div style={{ maxWidth: '920px', margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f2340', margin: 0, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            ⚓ Captain Bridge
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
            Manage who accesses CaptainDispatch — approve pending users and control invite codes.
          </p>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
          {[
            { id: 'pending', label: '👥 Pending Users' },
            { id: 'invites', label: '🔑 Invite Codes' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '7px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                background: tab === t.id ? '#0f2340' : 'transparent',
                color:      tab === t.id ? 'white'   : '#64748b',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {tab === 'pending' && (
          <div style={card}>
            <div style={hdr}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>👥 Pending Users</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Users who signed up and are waiting for access</div>
            </div>
            <PendingUsersTab productions={productions} />
          </div>
        )}

        {tab === 'invites' && (
          <div style={card}>
            <div style={hdr}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>🔑 Invite Codes</div>
              <button
                style={btnPrimary}
                onClick={() => document.dispatchEvent(new CustomEvent('bridge:newCode'))}>
                + New Code
              </button>
            </div>
            <InviteCodesTabWrapper productions={productions} />
          </div>
        )}

        {/* ── Info box ── */}
        <div style={{ padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #0f2340', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f2340', marginBottom: '6px' }}>⚓ How Captain Bridge works</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li><strong>Pending Users</strong> — users who logged in but have no production assigned yet. Approve them with a private sandbox or add them to one of your productions.</li>
            <li><strong>Invite Codes</strong> — share a code with someone. When they enter it on the pending page, they are instantly added to the linked production with the assigned role.</li>
            <li>Codes can have a max use limit and an expiry date. You can pause or delete them at any time.</li>
          </ul>
        </div>

      </div>
    </div>
  )
}

// Wrapper to bridge the "New Code" button in the header with InviteCodesTab's internal state
function InviteCodesTabWrapper({ productions }) {
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const handler = () => setShowForm(true)
    document.addEventListener('bridge:newCode', handler)
    return () => document.removeEventListener('bridge:newCode', handler)
  }, [])

  return <InviteCodesTabControlled productions={productions} showFormProp={showForm} onFormClose={() => setShowForm(false)} />
}

function InviteCodesTabControlled({ productions, showFormProp, onFormClose }) {
  const [invites,  setInvites]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [copied,   setCopied]   = useState(null)
  const [deleting, setDeleting] = useState(null)

  const EMPTY = { production_id: productions[0]?.id || '', code: '', label: '', role: 'MANAGER', max_uses: '', expires_at: '' }
  const [form,    setForm]    = useState({ ...EMPTY })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Sync external trigger
  useEffect(() => {
    if (showFormProp) setShowForm(true)
  }, [showFormProp])

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/bridge/invites')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setInvites(json.invites || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) c += '-'
      c += chars[Math.floor(Math.random() * chars.length)]
    }
    setF('code', c)
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormErr(null); setSaving(true)
    const res = await fetch('/api/bridge/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: form.production_id,
        code:          form.code.trim().toUpperCase() || undefined,
        label:         form.label.trim() || undefined,
        role:          form.role,
        max_uses:      form.max_uses ? parseInt(form.max_uses) : null,
        expires_at:    form.expires_at || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error); setSaving(false); return }
    setInvites(inv => [json.invite, ...inv])
    setForm({ ...EMPTY })
    setShowForm(false)
    onFormClose()
    setSaving(false)
  }

  async function toggleActive(inv) {
    const res = await fetch('/api/bridge/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, active: !inv.active }),
    })
    if (res.ok) {
      const { invite } = await res.json()
      setInvites(list => list.map(i => i.id === invite.id ? invite : i))
    }
  }

  async function deleteInvite(id) {
    if (!confirm('Delete this invite code?')) return
    setDeleting(id)
    const res = await fetch('/api/bridge/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setInvites(list => list.filter(i => i.id !== id))
    setDeleting(null)
  }

  function handleCopy(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {})
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const managedProds = productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>

  return (
    <div>
      {showForm && (
        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '2px solid #0f2340' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>🔑 New Invite Code</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Production *</label>
                <select value={form.production_id} onChange={e => setF('production_id', e.target.value)} style={sel} required>
                  {managedProds.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role assigned</label>
                <select value={form.role} onChange={e => setF('role', e.target.value)} style={sel}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Code (blank = auto-generate)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                    placeholder="e.g. CREW-X7K2"
                    style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em', flex: 1 }} />
                  <button type="button" onClick={generateRandom}
                    style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    🔀 Gen
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Label (optional)</label>
                <input value={form.label} onChange={e => setF('label', e.target.value)}
                  placeholder="e.g. Crew access June" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Max uses (blank = unlimited)</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setF('max_uses', e.target.value)}
                  placeholder="e.g. 10" style={inp} />
              </div>
              <div>
                <label style={lbl}>Expires (blank = never)</label>
                <input type="date" value={form.expires_at} onChange={e => setF('expires_at', e.target.value)} style={inp} />
              </div>
            </div>
            {formErr && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {formErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setShowForm(false); onFormClose(); setFormErr(null) }} style={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.production_id}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating…' : '🔑 Create Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {invites.length === 0 && !showForm ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <div style={{ color: '#64748b', fontWeight: '600' }}>No invite codes yet</div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Create a code to let people join a specific production instantly.
          </div>
          <button onClick={() => setShowForm(true)} style={{ ...btnPrimary, marginTop: '14px' }}>
            + Create First Code
          </button>
        </div>
      ) : (
        invites.map(inv => {
          const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
          const isFull    = inv.max_uses !== null && inv.uses_count >= inv.max_uses
          const statusBg    = !inv.active ? '#f1f5f9' : isExpired || isFull ? '#fef2f2' : '#f0fdf4'
          const statusColor = !inv.active ? '#64748b' : isExpired || isFull ? '#dc2626' : '#16a34a'
          const statusLabel = !inv.active ? 'INACTIVE' : isExpired ? 'EXPIRED' : isFull ? 'FULL' : 'ACTIVE'

          return (
            <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', opacity: !inv.active ? 0.65 : 1 }}>
              {/* Code */}
              <div onClick={() => handleCopy(inv.code)} title="Click to copy"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '16px', fontWeight: '900', color: '#0f2340', letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
                {inv.code}
                <span style={{ fontSize: '11px', marginLeft: '8px', color: '#94a3b8', fontFamily: 'sans-serif', fontWeight: '400' }}>
                  {copied === inv.code ? '✓ copied' : '📋'}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                    {inv.productions?.name || '—'}
                  </span>
                  <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '700' }}>
                    {inv.role}
                  </span>
                  <span style={{ padding: '1px 7px', borderRadius: '5px', background: statusBg, color: statusColor, fontSize: '10px', fontWeight: '700' }}>
                    {statusLabel}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {inv.label && <span style={{ marginRight: '8px' }}>📝 {inv.label}</span>}
                  <span>Uses: <strong>{inv.uses_count}</strong>{inv.max_uses ? `/${inv.max_uses}` : ''}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>{inv.expires_at ? `Expires ${fmtDate(inv.expires_at)}` : 'No expiry'}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>Created {fmt(inv.created_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => toggleActive(inv)}
                  style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>
                  {inv.active ? '⏸ Pause' : '▶ Enable'}
                </button>
                <button onClick={() => deleteInvite(inv.id)} disabled={deleting === inv.id}
                  style={{ ...btnRed, fontSize: '11px', padding: '5px 10px', opacity: deleting === inv.id ? 0.6 : 1 }}>
                  {deleting === inv.id ? '…' : '🗑'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
