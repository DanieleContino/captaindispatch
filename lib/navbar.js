import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export const NAV_ITEMS = [
  { l: 'Dashboard', p: '/dashboard' },
  { l: 'Fleet', p: '/dashboard/fleet' },
  { l: 'Trips', p: '/dashboard/trips' },
  { l: '🚀 Rocket', p: '/dashboard/rocket' },
  { l: 'Lists', p: '/dashboard/lists' },
  { l: 'Crew', p: '/dashboard/crew' },
  { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
  { l: 'Reports', p: '/dashboard/reports' },
  { l: 'QR', p: '/dashboard/qr-codes' },
  { l: 'Locations', p: '/dashboard/locations' },
  { l: 'Vehicles', p: '/dashboard/vehicles' },
  { l: '🎬 Prods', p: '/dashboard/productions' },
]

export function Navbar({ currentPath }) {
  const router = useRouter()

  return (
    <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push('/dashboard')}>
          CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
        </div>
        <nav style={{ display: 'flex', gap: '2px' }}>
          {NAV_ITEMS.map(({ l, p }) => (
            <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: p === currentPath ? 'white' : '#94a3b8', background: p === currentPath ? '#1e3a5f' : 'transparent', textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>
          ))}
        </nav>
      </div>
      <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
        style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
        Sign out
      </button>
    </div>
  )
}
