import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'
import { useLanguage, SUPPORTED_LOCALES, LOCALE_LABELS, useT } from './i18n'
import { useNotifications } from './useNotifications'
import { getProductionId } from './production'

function useBridgeBadge(productionId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!productionId) return
    function check() {
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('production_id', productionId)
        .eq('read', false)
        .then(({ count: c }) => setCount(c || 0))
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
  { l: 'Lists', p: '/dashboard/lists' },
  { l: 'Crew', p: '/dashboard/crew' },
  { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
  { l: 'Reports', p: '/dashboard/reports' },
  { l: 'QR', p: '/dashboard/qr-codes' },
  { l: 'Locations', p: '/dashboard/locations' },
  { l: 'Vehicles', p: '/dashboard/vehicles' },
  { l: '🚀 Rocket', p: '/dashboard/rocket' },
  { l: '🎬 Prods', p: '/dashboard/productions' },
  { l: '⚓ Bridge', p: '/dashboard/bridge' },
]

export function Navbar({ currentPath, className }) {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = useT()
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()
  const [productionId, setProductionId] = useState(null)
  useEffect(() => { setProductionId(getProductionId()) }, [])
  const bridgeCount = useBridgeBadge(productionId)

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
    <div className={className} style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push('/dashboard')}>
          CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
        </div>
        <nav style={{ display: 'flex', gap: '2px' }}>
          <style>{`@keyframes navbadgepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}`}</style>
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
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Notification toggle — mostrato solo se il browser supporta Web Push */}
        {supported && (
          <button
            onClick={handleBell}
            disabled={bellDisabled}
            title={bellTitle}
            style={{
              background:    bellActive ? 'rgba(56,189,248,0.12)' : 'transparent',
              border:        `1px solid ${bellActive ? '#38bdf8' : '#334155'}`,
              color:         loading ? '#475569' : bellColor,
              padding:       '4px 8px',
              borderRadius:  '7px',
              cursor:        bellDisabled ? 'not-allowed' : 'pointer',
              fontSize:      '15px',
              lineHeight:    1,
              opacity:       loading ? 0.5 : 1,
              transition:    'all 0.15s ease',
            }}
          >
            {loading ? '⏳' : bellIcon}
          </button>
        )}
        {/* Language toggle */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {SUPPORTED_LOCALES.map(l => (
            <button key={l} onClick={() => setLang(l)}
              style={{
                background:  lang === l ? '#1e3a5f' : 'transparent',
                border:      `1px solid ${lang === l ? '#2563eb' : '#334155'}`,
                color:       lang === l ? 'white' : '#64748b',
                padding:     '3px 8px',
                borderRadius:'5px',
                cursor:      'pointer',
                fontSize:    '11px',
                fontWeight:  '700',
                whiteSpace:  'nowrap',
                lineHeight:  1,
              }}>
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
