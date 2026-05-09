'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Navbar } from '../../../lib/navbar'
import { PageHeader } from '../../../components/ui/PageHeader'

// Wrap the actual page in Suspense because useSearchParams() requires it
// (per Next.js App Router rules, prevents Vercel build failure).
export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Loading…
      </div>
    }>
      <SettingsPage />
    </Suspense>
  )
}

function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(null) // { connected, google_email, ... }
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [flash, setFlash] = useState(null) // { type: 'success'|'error', text: string }

  // ── Auth check (same pattern as other pages) ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
  }, [])

  // ── Read flash message from query params (set by /api/auth/google/callback) ──
  useEffect(() => {
    const google = searchParams.get('google')
    if (google === 'connected') {
      setFlash({ type: 'success', text: 'Google Drive connesso correttamente.' })
    } else if (google === 'error') {
      const reason = searchParams.get('reason') || 'unknown'
      setFlash({
        type: 'error',
        text: `Connessione Google Drive non riuscita (${reason}). Riprova oppure contatta il supporto se il problema persiste.`,
      })
    }
    // Clear the URL query string so a refresh does not re-show the flash
    if (google) {
      const url = new URL(window.location.href)
      url.searchParams.delete('google')
      url.searchParams.delete('reason')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  // ── Load Google connection status ──
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch('/api/google/status', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      } else {
        setStatus({ connected: false })
      }
    } catch {
      setStatus({ connected: false })
    }
    setLoadingStatus(false)
  }, [])

  useEffect(() => { if (user) loadStatus() }, [user, loadStatus])

  // ── Disconnect handler ──
  async function handleDisconnect() {
    if (!confirm('Sei sicuro di voler disconnettere Google Drive? Il sync automatico smetterà di funzionare finché non ti riconnetti.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setFlash({ type: 'success', text: 'Google Drive disconnesso.' })
        await loadStatus()
      } else {
        setFlash({ type: 'error', text: `Disconnessione non riuscita: ${data.error || 'errore sconosciuto'}` })
      }
    } catch (e) {
      setFlash({ type: 'error', text: `Errore di rete: ${e.message}` })
    }
    setDisconnecting(false)
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Loading…
      </div>
    )
  }

  // ── Style helpers ──
  const cardStyle = {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '16px',
  }
  const labelStyle = {
    fontSize: '11px',
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    marginBottom: '6px',
  }
  const btnPrimary = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
    textDecoration: 'none',
    display: 'inline-block',
  }
  const btnDanger = {
    background: 'white',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  }
  const btnDisabled = {
    background: '#94a3b8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'default',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar currentPath="/dashboard/settings" />

      <PageHeader
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚙</span>
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Settings</span>
          </div>
        }
        right={null}
      />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px' }}>

        {/* ── Flash message ── */}
        {flash && (
          <div style={{
            padding: '11px 14px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: flash.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${flash.type === 'success' ? '#86efac' : '#fecaca'}`,
            color: flash.type === 'success' ? '#15803d' : '#dc2626',
          }}>
            <span>{flash.type === 'success' ? '✅' : '⚠'} {flash.text}</span>
            <button onClick={() => setFlash(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'inherit', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* ── Google Drive section ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '32px', background: '#eff6ff', width: '52px', height: '52px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              📁
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '2px' }}>
                Google Drive
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                Connetti il tuo Google Drive per sincronizzare automaticamente i file della produzione (Master Rooming, Travel Calendar, Accommodation).
              </div>
            </div>
          </div>

          {loadingStatus ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Verifica stato connessione…
            </div>
          ) : status?.connected ? (
            <>
              {/* Connected state */}
              <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '9px', marginBottom: '14px' }}>
                <div style={{ ...labelStyle, color: '#15803d' }}>Stato</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ✅ Connesso
                </div>
                {status.google_email && (
                  <>
                    <div style={{ ...labelStyle, marginTop: '10px' }}>Account Google</div>
                    <div style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>
                      {status.google_email}
                    </div>
                  </>
                )}
                {status.connected_at && (
                  <>
                    <div style={{ ...labelStyle, marginTop: '10px' }}>Connesso il</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(status.connected_at).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}
                    </div>
                  </>
                )}
                {status.last_refresh_error && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', fontSize: '11px', color: '#dc2626' }}>
                    ⚠ Ultimo errore di refresh: {status.last_refresh_error}. Riconnetti se il problema persiste.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a
                  href="/api/auth/google/connect"
                  style={{
                    background: 'white',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  🔄 Riconnetti
                </a>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  style={disconnecting ? btnDisabled : btnDanger}
                >
                  {disconnecting ? 'Disconnessione…' : '✕ Disconnetti'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not connected state */}
              <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px', marginBottom: '14px' }}>
                <div style={labelStyle}>Stato</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚪ Non connesso
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '9px', marginBottom: '14px', fontSize: '12px', color: '#92400e', lineHeight: 1.6 }}>
                <strong>ℹ Importante:</strong> quando autorizzi su Google, potresti vedere una schermata "Google hasn't verified this app". È normale durante il rilascio. Clicca <strong>Advanced</strong> → <strong>Go to captaindispatch.com (unsafe)</strong> per procedere.
              </div>

              <a href="/api/auth/google/connect" style={btnPrimary}>
                🔗 Connetti Google Drive
              </a>
            </>
          )}
        </div>

        {/* ── Account section (placeholder for future) ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '28px', background: '#f5f3ff', width: '52px', height: '52px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              👤
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>Account</div>
              <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{user.email}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
