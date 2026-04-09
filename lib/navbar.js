import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'
import { useLanguage, SUPPORTED_LOCALES, LOCALE_LABELS, useT } from './i18n'
import { useNotifications } from './useNotifications'
import { getProductionId } from './production'
import { useIsMobile } from './useIsMobile'

function useBridgeBadge(productionId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!productionId) return
    async function check() {
      const { count: c } = await supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('production_id', productionId)
        .eq('read', false)

      const { data: driveFiles } = await supabase
        .from('drive_synced_files')
        .select('last_modified, last_synced_at')
        .eq('production_id', productionId)

      const driveUpdates = (driveFiles || []).filter(f =>
        !f.last_synced_at ||
        (f.last_modified && f.last_synced_at && f.last_modified > f.last_synced_at)
      ).length

      setCount((c || 0) + driveUpdates)
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [productionId])

  return count
}

export const NAV_ITEMS = [
  { l: 'Dashboard', p: '/dashboard' },
  { l: 'Fleet', p: '/dashboard/fleet' },
  { l: 'Trips', p: '/dashboard/trips' },
  { l: 'Crew', p: '/dashboard/crew' },
  { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
  { l: '🚀 Rocket', p: '/dashboard/rocket' },
  { l: '⚓ Bridge', p: '/dashboard/bridge' },
]

export const NAV_SECONDARY = [
  { l: '📋 Lists', p: '/dashboard/lists' },
  { l: '📊 Reports', p: '/dashboard/reports' },
  { l: '📍 Locations', p: '/dashboard/locations' },
  { l: '🚐 Vehicles', p: '/dashboard/vehicles' },
  { l: '🔳 QR', p: '/dashboard/qr-codes' },
  { l: '🎬 Prods', p: '/dashboard/productions' },
]

export function Navbar({ currentPath, className }) {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = useT()
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()
  const isMobile = useIsMobile()
  const [productionId, setProductionId] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => { setProductionId(getProductionId()) }, [])
  const bridgeCount = useBridgeBadge(productionId)
  const secondaryActive = NAV_SECONDARY.some(item => item.p === currentPath)

  // Determina icona, tooltip e azione del pulsante notifiche
  let bellIcon    = '🔔'
  let bellTitle   = t.notificationsEnable
  let bellColor   = '#64748b'
  let bellActive  = false
  let bellDisabled = loading

  if (permission === 'denied') {
    bellIcon    = '🔕'
    bellTitle   = t.notificationsBlocked
    bellColor   = '#475569'
    bellDisabled = true
  } else if (subscribed) {
    bellIcon   = '🔔'
    bellTitle  = t.notificationsDisable
    bellColor  = '#38bdf8'   // azzurro = attivo
    bellActive = true
  } else if (permission === 'granted') {
    bellTitle  = t.notificationsReenable
  }

  function handleBell() {
    if (subscribed) {
      unsubscribe()
    } else {
      const productionId = getProductionId()
      subscribe(productionId)
    }
  }

  return (
    <>
      <style>{`@keyframes navbadgepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}`}</style>

      {/* ── DESKTOP navbar (≥ 768px) ── */}
      <div className={className} style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: isMobile ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {NAV_ITEMS.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: p === currentPath ? 'white' : '#94a3b8', background: p === currentPath ? '#1e3a5f' : 'transparent', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {l}
                {p === '/dashboard/bridge' && bridgeCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#dc2626', color: 'white',
                    fontSize: '10px', fontWeight: '900',
                    animation: 'navbadgepulse 2s infinite',
                  }}>
                    {bridgeCount > 9 ? '9+' : bridgeCount}
                  </span>
                )}
              </a>
            ))}

            {/* ⋯ More dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(o => !o)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', fontSize: '15px', fontWeight: '700',
                  color: secondaryActive ? 'white' : '#94a3b8',
                  background: moreOpen || secondaryActive ? '#1e3a5f' : 'transparent',
                  border: 'none', cursor: 'pointer', lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                }}
                title="More"
              >
                ⋯
              </button>
              {moreOpen && (
                <>
                  <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: '#1e3a5f', border: '1px solid #334155',
                    borderRadius: '10px', padding: '6px', zIndex: 99,
                    minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', gap: '2px',
                  }}>
                    {NAV_SECONDARY.map(({ l, p }) => (
                      <a key={p} href={p} onClick={() => setMoreOpen(false)}
                        style={{
                          padding: '7px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                          color: p === currentPath ? 'white' : '#94a3b8',
                          background: p === currentPath ? '#0f2340' : 'transparent',
                          textDecoration: 'none', whiteSpace: 'nowrap', display: 'block',
                        }}
                        onMouseEnter={e => { if (p !== currentPath) e.currentTarget.style.background = '#0f2340'; e.currentTarget.style.color = 'white' }}
                        onMouseLeave={e => { if (p !== currentPath) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = p === currentPath ? 'white' : '#94a3b8' }}
                      >
                        {l}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {supported && (
            <button onClick={handleBell} disabled={bellDisabled} title={bellTitle} style={{ background: bellActive ? 'rgba(56,189,248,0.12)' : 'transparent', border: `1px solid ${bellActive ? '#38bdf8' : '#334155'}`, color: loading ? '#475569' : bellColor, padding: '4px 8px', borderRadius: '7px', cursor: bellDisabled ? 'not-allowed' : 'pointer', fontSize: '15px', lineHeight: 1, opacity: loading ? 0.5 : 1, transition: 'all 0.15s ease' }}>
              {loading ? '⏳' : bellIcon}
            </button>
          )}
          <div style={{ display: 'flex', gap: '3px' }}>
            {SUPPORTED_LOCALES.map(l => (
              <button key={l} onClick={() => setLang(l)} style={{ background: lang === l ? '#1e3a5f' : 'transparent', border: `1px solid ${lang === l ? '#2563eb' : '#334155'}`, color: lang === l ? 'white' : '#64748b', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', lineHeight: 1 }}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* ── MOBILE top bar (< 768px) ── */}
      {isMobile && (
        <div style={{ background: '#0f2340', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {supported && (
              <button onClick={handleBell} disabled={bellDisabled} title={bellTitle} style={{ background: bellActive ? 'rgba(56,189,248,0.12)' : 'transparent', border: `1px solid ${bellActive ? '#38bdf8' : '#334155'}`, color: loading ? '#475569' : bellColor, padding: '6px 9px', borderRadius: '8px', cursor: bellDisabled ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1, opacity: loading ? 0.5 : 1 }}>
                {loading ? '⏳' : bellIcon}
              </button>
            )}
            <button
              onClick={() => setMoreOpen(o => !o)}
              style={{ background: 'transparent', border: '1px solid #334155', color: 'white', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '20px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Menu"
            >
              ☰
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE drawer fullscreen ── */}
      {isMobile && moreOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0f2340', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Drawer header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '52px', borderBottom: '1px solid #1e3a5f', flexShrink: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', letterSpacing: '-1px' }}>
              CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
            </div>
            <button onClick={() => setMoreOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>
              ✕
            </button>
          </div>

          {/* Nav links */}
          <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {[...NAV_ITEMS, ...NAV_SECONDARY].map(({ l, p }) => (
              <a key={p} href={p} onClick={() => setMoreOpen(false)}
                style={{
                  padding: '14px 16px', borderRadius: '10px', fontSize: '16px', fontWeight: '600',
                  color: p === currentPath ? 'white' : '#94a3b8',
                  background: p === currentPath ? '#1e3a5f' : 'transparent',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <span style={{ flex: 1 }}>{l}</span>
                {p === '/dashboard/bridge' && bridgeCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#dc2626', color: 'white', fontSize: '11px', fontWeight: '900', animation: 'navbadgepulse 2s infinite' }}>
                    {bridgeCount > 9 ? '9+' : bridgeCount}
                  </span>
                )}
              </a>
            ))}
          </div>

          {/* Drawer footer: lingua + sign out */}
          <div style={{ padding: '16px', borderTop: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {SUPPORTED_LOCALES.map(l => (
                <button key={l} onClick={() => setLang(l)} style={{ background: lang === l ? '#1e3a5f' : 'transparent', border: `1px solid ${lang === l ? '#2563eb' : '#334155'}`, color: lang === l ? 'white' : '#64748b', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', lineHeight: 1 }}>
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', textAlign: 'left' }}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
