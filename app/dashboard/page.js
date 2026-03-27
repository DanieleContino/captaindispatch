'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

import { Navbar } from '../../lib/navbar'
import { useT } from '../../lib/i18n'

// CARDS defined inside component to use t (i18n)

function isoTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Dashboard() {
  const t = useT()
  const [user,       setUser]       = useState(null)
  const [departures, setDepartures] = useState([])   // crew in partenza domani
  const [arrivals,   setArrivals]   = useState([])   // crew in arrivo domani
  const router = useRouter()
  const tomorrow = isoTomorrow()

  const CARDS = [
    { emoji: '🚦', title: 'Fleet Monitor',          desc: t.fleetMonitorDesc,    href: '/dashboard/fleet',        accent: '#f59e0b', bg: '#fffbeb' },
    { emoji: '🗓', title: 'Trips',                   desc: t.tripsDesc || 'Manage daily transfers: create, edit, assign passengers and vehicles', href: '/dashboard/trips', accent: '#2563eb', bg: '#eff6ff' },
    { emoji: '🎬', title: 'Crew',                    desc: t.crewDesc,            href: '/dashboard/crew',         accent: '#16a34a', bg: '#f0fdf4' },
    { emoji: '📋', title: 'Transport Lists',         desc: t.listsDesc,           href: '/dashboard/lists',        accent: '#0891b2', bg: '#ecfeff' },
    { emoji: '🛫', title: 'Hub Coverage',            desc: t.hubCoverageCardDesc, href: '/dashboard/hub-coverage', accent: '#7c3aed', bg: '#f5f3ff' },
    { emoji: '📍', title: 'Locations',               desc: t.locationsDesc,       href: '/dashboard/locations',    accent: '#6366f1', bg: '#eef2ff' },
    { emoji: '📱', title: 'QR Codes',                desc: t.qrCodesDesc,         href: '/dashboard/qr-codes',     accent: '#0891b2', bg: '#ecfeff' },
    { emoji: '📊', title: 'Fleet Reports',           desc: t.reportsDesc,         href: '/dashboard/reports',      accent: '#db2777', bg: '#fdf2f8' },
    { emoji: '🚐', title: 'Vehicles',                desc: t.vehiclesDesc,        href: '/dashboard/vehicles',     accent: '#64748b', bg: '#f8fafc' },
    { emoji: '🚀', title: 'Rocket — Trip Generator', desc: t.rocketCardDesc,      href: '/dashboard/rocket',       accent: '#7c3aed', bg: '#f5f3ff' },
  ]

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
      <Navbar currentPath="/dashboard" />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f2340 0%, #1e3a5f 100%)', padding: '40px 32px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎬</div>
        <h1 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
          CAPTAIN Dispatch
        </h1>
        <p style={{ color: '#94a3b8', margin: '0', fontSize: '13px' }}>
          {t.systemTitle}
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
                    {departures.length} {t.departuresTomorrow} — {fmtDate(tomorrow)}
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
                    {arrivals.length} {t.arrivalsTomorrow} — {fmtDate(tomorrow)}
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
            <strong style={{ color: '#374151' }}>{t.workflowTitle}</strong> {t.workflowText}
          </div>
        </div>
      </div>
    </div>
  )
}
