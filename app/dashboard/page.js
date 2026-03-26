'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

import { Navbar } from '../../lib/navbar'

const NAV = [
  { l: 'Fleet',      p: '/dashboard/fleet' },
  { l: 'Trips',      p: '/dashboard/trips' },
  { l: 'Lists',      p: '/dashboard/lists' },
  { l: 'Crew',       p: '/dashboard/crew' },
  { l: 'Hub Cov.',   p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.',   p: '/dashboard/pax-coverage' },
  { l: 'Reports',    p: '/dashboard/reports' },
  { l: 'QR',         p: '/dashboard/qr-codes' },
  { l: 'Locations',  p: '/dashboard/locations' },
  { l: 'Vehicles',   p: '/dashboard/vehicles' },
  { l: '🚀 Rocket', p: '/dashboard/rocket' },
  { l: '🎬 Prods',  p: '/dashboard/productions' },
]

const CARDS = [
  {
    emoji: '🚦',
    title: 'Fleet Monitor',
    desc: 'Stato live di tutti i veicoli: BUSY, FREE, IDLE, DONE con progress bar e ETA',
    href: '/dashboard/fleet',
    accent: '#f59e0b',
    bg: '#fffbeb',
  },
  {
    emoji: '🗓',
    title: 'Trips',
    desc: 'Gestione transfer giornalieri: crea, modifica, assegna passeggeri e veicoli',
    href: '/dashboard/trips',
    accent: '#2563eb',
    bg: '#eff6ff',
  },
  {
    emoji: '🎬',
    title: 'Crew',
    desc: 'Anagrafica crew: hotel, Travel_Status (IN / PRESENT / OUT) e partenze',
    href: '/dashboard/crew',
    accent: '#16a34a',
    bg: '#f0fdf4',
  },
  {
    emoji: '📋',
    title: 'Transport Lists',
    desc: 'Liste stampabili per driver: TRANSPORT LIST, TRAVEL ARRIVAL, TRAVEL DEPARTURE',
    href: '/dashboard/lists',
    accent: '#0891b2',
    bg: '#ecfeff',
  },
  {
    emoji: '🛫',
    title: 'Hub Coverage',
    desc: 'Copertura aeroporto/stazione: expected vs assigned per hotel, status ✅⚠❌',
    href: '/dashboard/hub-coverage',
    accent: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    emoji: '📍',
    title: 'Locations',
    desc: 'Hotels e hub: coordinate, meeting point e tipo',
    href: '/dashboard/locations',
    accent: '#6366f1',
    bg: '#eef2ff',
  },
  {
    emoji: '📱',
    title: 'QR Codes',
    desc: 'Genera e stampa QR per veicoli e crew. Driver scansiona → scheda live + Wrap Trip.',
    href: '/dashboard/qr-codes',
    accent: '#0891b2',
    bg: '#ecfeff',
  },
  {
    emoji: '📊',
    title: 'Fleet Reports',
    desc: 'Report giornaliero e settimanale: ore lavorate, pax, trip per veicolo. Stampabile PDF.',
    href: '/dashboard/reports',
    accent: '#db2777',
    bg: '#fdf2f8',
  },
  {
    emoji: '🚐',
    title: 'Vehicles',
    desc: 'Flotta veicoli: tipo, capacità, driver e sign code',
    href: '/dashboard/vehicles',
    accent: '#64748b',
    bg: '#f8fafc',
  },
  {
    emoji: '🚀',
    title: 'Rocket — Trip Generator',
    desc: 'Genera automaticamente tutti i trip del giorno: assegna crew ai veicoli per hotel e dipartimento, anteprima e conferma con un click.',
    href: '/dashboard/rocket',
    accent: '#7c3aed',
    bg: '#f5f3ff',
  },
]

function isoTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Dashboard() {
  const [user,       setUser]       = useState(null)
  const [departures, setDepartures] = useState([])   // crew in partenza domani
  const [arrivals,   setArrivals]   = useState([])   // crew in arrivo domani
  const router = useRouter()
  const tomorrow = isoTomorrow()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (!PRODUCTION_ID) return
      // Alert partenze e arrivi domani
      Promise.all([
        supabase.from('crew').select('id,full_name,department')
          .eq('production_id', PRODUCTION_ID)
          .eq('hotel_status', 'CONFIRMED')
          .eq('departure_date', tomorrow)
          .order('full_name').limit(20),
        supabase.from('crew').select('id,full_name,department')
          .eq('production_id', PRODUCTION_ID)
          .eq('hotel_status', 'CONFIRMED')
          .eq('arrival_date', tomorrow)
          .order('full_name').limit(20),
      ]).then(([dR, aR]) => {
        setDepartures(dR.data || [])
        setArrivals(aR.data || [])
      })
    })
  }, [])

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', whiteSpace: 'nowrap' }}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: '#94a3b8', background: 'transparent', textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#64748b', fontSize: '12px' }}>{user.email}</span>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f2340 0%, #1e3a5f 100%)', padding: '40px 32px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎬</div>
        <h1 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
          CAPTAIN Dispatch
        </h1>
        <p style={{ color: '#94a3b8', margin: '0', fontSize: '13px' }}>
          Sistema di gestione transfer per produzioni cinematografiche
          {PRODUCTION_ID && <span style={{ color: '#2563eb', marginLeft: '8px', fontWeight: '600' }}>· {PRODUCTION_ID.slice(0, 8)}…</span>}
        </p>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 24px 40px' }}>

        {/* ── Banner partenze/arrivi domani ── */}
        {(departures.length > 0 || arrivals.length > 0) && (
          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {departures.length > 0 && (
              <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderLeft: '4px solid #ea580c', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🛫</span>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#c2410c' }}>
                    {departures.length} partenze domani — {fmtDate(tomorrow)}
                  </span>
                  <a href="/dashboard/hub-coverage" style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#c2410c', textDecoration: 'none', background: '#fed7aa', padding: '2px 8px', borderRadius: '6px' }}>
                    Hub Coverage →
                  </a>
                </div>
                <div style={{ fontSize: '11px', color: '#92400e', lineHeight: 1.6 }}>
                  {departures.map((c, i) => (
                    <span key={c.id}>
                      {c.full_name}
                      <span style={{ color: '#fdba74', fontSize: '10px' }}> {c.department}</span>
                      {i < departures.length - 1 && <span style={{ color: '#fdba74', margin: '0 6px' }}>·</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {arrivals.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderLeft: '4px solid #16a34a', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🛬</span>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#15803d' }}>
                    {arrivals.length} arrivi domani — {fmtDate(tomorrow)}
                  </span>
                  <a href="/dashboard/hub-coverage" style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#15803d', textDecoration: 'none', background: '#bbf7d0', padding: '2px 8px', borderRadius: '6px' }}>
                    Hub Coverage →
                  </a>
                </div>
                <div style={{ fontSize: '11px', color: '#166534', lineHeight: 1.6 }}>
                  {arrivals.map((c, i) => (
                    <span key={c.id}>
                      {c.full_name}
                      <span style={{ color: '#86efac', fontSize: '10px' }}> {c.department}</span>
                      {i < arrivals.length - 1 && <span style={{ color: '#86efac', margin: '0 6px' }}>·</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cards grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {CARDS.map((card) => (
            <div key={card.title}
              onClick={() => card.href && router.push(card.href)}
              style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderTop: `3px solid ${card.accent}`,
                borderRadius: '14px',
                padding: '20px 18px',
                cursor: card.href ? 'pointer' : 'default',
                opacity: card.href ? 1 : 0.6,
                transition: 'box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { if (card.href) { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '28px', background: card.bg, width: '48px', height: '48px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {card.emoji}
                </div>
                {card.href && <span style={{ fontSize: '14px', color: card.accent, opacity: 0.7 }}>→</span>}
              </div>

              <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '5px' }}>{card.title}</div>
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.5' }}>{card.desc}</div>
            </div>
          ))}
        </div>

        {/* ── Footer note ── */}
        <div style={{ marginTop: '24px', padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>💡</span>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
            <strong style={{ color: '#374151' }}>Workflow:</strong> Aggiungi Locations → Vehicles → Crew,
            poi crea i Trips del giorno e assegna passeggeri. Transfer Class (ARRIVAL/DEPARTURE/STANDARD)
            calcolato automaticamente. Usa <strong>Transport Lists</strong> per stampare le liste driver
            e <strong>Hub Coverage</strong> per verificare la copertura aeroporto/stazione.
            Il cron ARRIVAL→PRESENT gira ogni 5 minuti su Vercel.
            I driver usano <strong>Wrap Trip</strong> (<a href="/wrap-trip" style={{ color: '#2563eb' }}>/wrap-trip</a>) via QR veicolo per creare trip di rientro dal set.
          </div>
        </div>
      </div>
    </div>
  )
}
