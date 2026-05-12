import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from './supabase'
import { useOnlinePresence, getPageLabel, getInitials, getAvatarColor, fmtOnlineSince, getRoleStyle } from './useOnlinePresence'
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

// ── Load current user info for presence tracking ──────────
function useNavUser(productionId) {
  const [userId, setUserId] = useState(null)
  const [email,  setEmail]  = useState('')
  const [role,   setRole]   = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      setEmail(session.user.email || '')
    })
  }, [])

  useEffect(() => {
    if (!productionId || !userId) return
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('production_id', productionId)
      .maybeSingle()
      .then(({ data }) => { if (data?.role) setRole(data.role) })
      .catch(() => {})
  }, [productionId, userId])

  return { userId, email, role }
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
  { l: '📋 Lists', p: '/dashboard/lists-v2' },
  { l: '� Reports', p: '/dashboard/reports' },
  { l: '�📍 Locations', p: '/dashboard/locations' },
  { l: '🚐 Vehicles', p: '/dashboard/vehicles' },
  { l: '🔳 QR', p: '/dashboard/qr-codes' },
  { l: '🎬 Prods', p: '/dashboard/productions' },
  { l: '⚙ Settings', p: '/dashboard/settings' },
]

export function Navbar({ currentPath, className }) {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = useT()
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()
  const isMobile = useIsMobile()
  const [productionId, setProductionId] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)

  const MODES = [
    { key: 'captain',       icon: '🎬', label: 'Captain',       path: '/dashboard' },
    { key: 'travel',        icon: '✈️', label: 'Travel',        path: '/dashboard/travel' },
    { key: 'accommodation', icon: '🏨', label: 'Accommodation', path: '/dashboard/accommodation' },
  ]

  const currentMode = currentPath?.startsWith('/dashboard/travel')        ? 'travel'
                    : currentPath?.startsWith('/dashboard/accommodation')  ? 'accommodation'
                    : 'captain'
  const currentModeObj = MODES.find(m => m.key === currentMode) || MODES[0]
  useEffect(() => { setProductionId(getProductionId()) }, [])
  const bridgeCount = useBridgeBadge(productionId)
  const secondaryActive = NAV_SECONDARY.some(item => item.p === currentPath)

  // ── Online presence ──────────────────────────────────────
  const pathname = usePathname()
  const [onlineOpen, setOnlineOpen] = useState(false)
  const { userId: navUserId, email: navEmail, role: navRole } = useNavUser(productionId)
  const onlineUsers = useOnlinePresence({
    productionId,
    userId: navUserId,
    email:  navEmail,
    page:   currentPath || pathname || '',
    role:   navRole,
  })

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

          {/* ── Mode switcher ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setModeOpen(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: modeOpen ? '#1e3a5f' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px', padding: '4px 10px',
                cursor: 'pointer', color: 'white',
                fontSize: '12px', fontWeight: '700',
                whiteSpace: 'nowrap', lineHeight: 1,
              }}
            >
              <span>{currentModeObj.icon}</span>
              <span>{currentModeObj.label}</span>
              <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '2px' }}>▾</span>
            </button>
            {modeOpen && (
              <>
                <div onClick={() => setModeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: '#1e3a5f', border: '1px solid #334155',
                  borderRadius: '10px', padding: '6px', zIndex: 99,
                  minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  display: 'flex', flexDirection: 'column', gap: '2px',
                }}>
                  {MODES.map(m => (
                    <a key={m.key} href={m.path}
                      onClick={() => setModeOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 12px', borderRadius: '7px',
                        fontSize: '13px', fontWeight: '600',
                        color: m.key === currentMode ? 'white' : '#94a3b8',
                        background: m.key === currentMode ? '#0f2340' : 'transparent',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => { if (m.key !== currentMode) { e.currentTarget.style.background = '#0f2340'; e.currentTarget.style.color = 'white' }}}
                      onMouseLeave={e => { if (m.key !== currentMode) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}}
                    >
                      <span style={{ fontSize: '16px' }}>{m.icon}</span>
                      <span style={{ flex: 1 }}>{m.label}</span>
                      {m.key === currentMode && <span style={{ fontSize: '10px', color: '#22c55e' }}>✓</span>}
                    </a>
                  ))}
                </div>
              </>
            )}
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

          {/* ── Online presence badge (desktop) ── */}
          {onlineUsers.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOnlineOpen(o => !o)}
                title="Who's online"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: onlineOpen ? 'rgba(34,197,94,0.15)' : 'transparent',
                  border: '1px solid rgba(34,197,94,0.45)',
                  color: '#22c55e', padding: '4px 9px', borderRadius: '7px',
                  cursor: 'pointer', fontSize: '12px', fontWeight: '700', lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0, boxShadow: '0 0 0 2px rgba(34,197,94,0.3)' }} />
                {onlineUsers.length}
              </button>

              {onlineOpen && (
                <>
                  <div onClick={() => setOnlineOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'white', border: '1px solid #e2e8f0',
                    borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                    zIndex: 99, minWidth: '270px', maxWidth: '340px', overflow: 'hidden',
                  }}>
                    {/* Popover header */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>🟢 Online Now</span>
                      <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
                        {onlineUsers.length}
                      </span>
                    </div>
                    {/* User rows */}
                    {onlineUsers.map((u, i) => {
                      const rs = getRoleStyle(u.role)
                      return (
                        <div key={u.user_id || i} style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px',
                          borderBottom: i < onlineUsers.length - 1 ? '1px solid #f8fafc' : 'none',
                          background: u.user_id === navUserId ? '#f0fdf4' : 'white',
                        }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: getAvatarColor(u.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '900', flexShrink: 0 }}>
                            {getInitials(u.email)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.email || u.user_id?.slice(0, 8)}
                              {u.user_id === navUserId && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#22c55e', fontWeight: '700' }}>you</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '5px', alignItems: 'center', marginTop: '2px' }}>
                              {u.role && <span style={{ background: rs.bg, color: rs.color, padding: '0 5px', borderRadius: '3px', fontWeight: '700' }}>{u.role}</span>}
                              {u.page && <span>{getPageLabel(u.page)}</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{fmtOnlineSince(u.online_at)}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

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
            {/* Mode switcher links — mobile */}
            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #1e3a5f' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>Mode</div>
              {MODES.map(m => (
                <a key={m.key} href={m.path} onClick={() => setMoreOpen(false)}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                    color: m.key === currentMode ? 'white' : '#94a3b8',
                    background: m.key === currentMode ? '#1e3a5f' : 'transparent',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px',
                    marginBottom: '2px',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{m.icon}</span>
                  <span>{m.label}</span>
                  {m.key === currentMode && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#22c55e', fontWeight: '700' }}>✓ Active</span>}
                </a>
              ))}
            </div>
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

          {/* ── Online section (mobile drawer) ── */}
          {onlineUsers.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a5f', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#22c55e', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                {onlineUsers.length} Online Now
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {onlineUsers.map((u, i) => (
                  <div key={u.user_id || i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: getAvatarColor(u.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '9px', fontWeight: '900', flexShrink: 0 }}>
                      {getInitials(u.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'white', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email?.split('@')[0] || 'User'}
                        {u.user_id === navUserId && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#22c55e' }}>(you)</span>}
                      </div>
                    </div>
                    {u.page && <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{getPageLabel(u.page)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

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
