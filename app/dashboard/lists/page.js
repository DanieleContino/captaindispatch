'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

// ─── Utility ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDateLong(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function fmtNow() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ─── Raggruppa trip per trip_id ────────────────────────────────
function groupByTripId(tripRows) {
  const map = {}
  for (const t of tripRows) {
    if (!map[t.trip_id]) {
      map[t.trip_id] = {
        trip_id:     t.trip_id,
        vehicle_id:  t.vehicle_id,
        driver_name: t.driver_name,
        sign_code:   t.sign_code,
        capacity:    t.capacity,
        pickup_id:   t.pickup_id,
        pickup_min:  t.pickup_min,
        call_min:    t.call_min,
        arr_time:    t.arr_time,
        flight_no:   t.flight_no,
        notes:       t.notes,
        rows:        [t],
      }
    } else {
      map[t.trip_id].rows.push(t)
    }
  }
  return Object.values(map).sort((a, b) =>
    (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
  )
}

// ─── Stili condivisi ───────────────────────────────────────────
const CLS_COLOR = {
  ARRIVAL:   { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  DEPARTURE: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  STANDARD:  { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
}

// ─── Blocco singolo trip (usato per tutte le sezioni) ──────────
function TripBlock({ group, locsMap, showFlight, showPickup }) {
  const mainTime = minToHHMM(group.pickup_min ?? group.call_min)
  const cls = CLS_COLOR[group.rows[0]?.transfer_class] || CLS_COLOR.STANDARD

  return (
    <div style={{
      marginBottom: '10px',
      border: '1px solid #e2e8f0',
      borderLeft: `4px solid ${cls.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
      pageBreakInside: 'avoid',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '8px 12px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: '900', fontSize: '15px', color: '#0f172a', fontVariantNumeric: 'tabular-nums', minWidth: '42px' }}>{mainTime}</span>
        <span style={{ fontWeight: '800', color: '#374151', fontSize: '13px', fontFamily: 'monospace' }}>{group.trip_id}</span>
        {group.vehicle_id && (
          <span style={{ fontWeight: '700', fontSize: '12px', color: '#0f172a' }}>
            🚐 {group.vehicle_id}
          </span>
        )}
        {group.driver_name && (
          <span style={{ fontSize: '12px', color: '#64748b' }}>👤 {group.driver_name}</span>
        )}
        {group.sign_code && (
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>{group.sign_code}</span>
        )}
        {group.capacity && (
          <span style={{ fontSize: '11px', color: '#64748b' }}>×{group.capacity}</span>
        )}
        {showFlight && group.flight_no && (
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#2563eb', marginLeft: 'auto' }}>
            ✈ {group.flight_no}
            {group.arr_time && <span style={{ color: '#64748b', fontWeight: '500', marginLeft: '4px' }}>arr {group.arr_time?.slice(0, 5)}</span>}
          </span>
        )}
        {showPickup && (
          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: group.flight_no ? '0' : 'auto' }}>
            da: {locsMap[group.pickup_id] || group.pickup_id}
          </span>
        )}
        {group.notes && (
          <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginLeft: 'auto' }}>📝 {group.notes}</span>
        )}
      </div>

      {/* Dropoff rows */}
      <div>
        {group.rows.map((row, i) => {
          const pax = row.passenger_list
            ? row.passenger_list.split(',').map(s => s.trim()).filter(Boolean)
            : []
          const dropoffName = locsMap[row.dropoff_id] || row.dropoff_id || '–'
          return (
            <div key={row.id || i} style={{
              padding: '7px 12px 7px 20px',
              borderBottom: i < group.rows.length - 1 ? '1px solid #f1f5f9' : 'none',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}>
              {/* Dropoff arrow */}
              <span style={{ color: '#94a3b8', fontSize: '12px', marginTop: '1px', flexShrink: 0 }}>→</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '12px', color: '#0f172a', marginBottom: pax.length > 0 ? '4px' : 0 }}>
                  {dropoffName}
                </div>
                {pax.length > 0 ? (
                  <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.5 }}>
                    {pax.map((name, j) => (
                      <span key={j}>
                        {name}
                        {j < pax.length - 1 && <span style={{ color: '#cbd5e1', margin: '0 5px' }}>·</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic' }}>no passengers assigned</div>
                )}
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right', fontSize: '11px', color: pax.length === 0 ? '#cbd5e1' : '#64748b' }}>
                {row.pax_count || 0}{row.capacity ? `/${row.capacity}` : ''} pax
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Separatore sezione ────────────────────────────────────────
function SectionHeader({ icon, title, count, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 0 8px',
      marginBottom: '12px',
      borderBottom: `2px solid ${color}`,
      pageBreakAfter: 'avoid',
    }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a', letterSpacing: '-0.3px' }}>{title}</span>
      {count > 0 && (
        <span style={{ fontSize: '11px', fontWeight: '700', background: color, color: 'white', padding: '1px 7px', borderRadius: '999px' }}>
          {count} trip{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function ListsPage() {
  const router = useRouter()
  const [user,    setUser]    = useState(null)
  const [date,    setDate]    = useState(isoToday())
  const [trips,   setTrips]   = useState([])
  const [locsMap, setLocsMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUser(user)
    })
  }, [])

  const loadData = useCallback(async d => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const [tR, lR] = await Promise.all([
      supabase.from('trips').select('*')
        .eq('production_id', PRODUCTION_ID).eq('date', d)
        .neq('status', 'CANCELLED')
        .order('pickup_min', { ascending: true, nullsLast: true }),
      supabase.from('locations').select('id,name').eq('production_id', PRODUCTION_ID),
    ])
    setTrips(tR.data || [])
    if (lR.data) {
      const m = {}; lR.data.forEach(l => { m[l.id] = l.name }); setLocsMap(m)
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadData(date) }, [user, date, loadData])

  // Raggruppa per classe
  const standard   = groupByTripId(trips.filter(t => t.transfer_class === 'STANDARD'))
  const arrivals   = groupByTripId(trips.filter(t => t.transfer_class === 'ARRIVAL'))
  const departures = groupByTripId(trips.filter(t => t.transfer_class === 'DEPARTURE'))

  const totalPax = trips.reduce((s, t) => s + (t.pax_count || 0), 0)

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  const NAV = [
    { l: 'Dashboard', p: '/dashboard' }, { l: 'Fleet', p: '/dashboard/fleet' },
    { l: 'Trips', p: '/dashboard/trips' }, { l: 'Lists', p: '/dashboard/lists' },
    { l: 'Crew', p: '/dashboard/crew' }, { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
    { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
    { l: 'Reports', p: '/dashboard/reports' }, { l: 'QR', p: '/dashboard/qr-codes' },
    { l: 'Locations', p: '/dashboard/locations' }, { l: 'Vehicles', p: '/dashboard/vehicles' },
    { l: '🎬 Prods', p: '/dashboard/productions' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* ── Stili print ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .print-content { max-width: 100% !important; padding: 16px !important; }
          body { background: white !important; }
          .trip-block { page-break-inside: avoid; }
        }
        @page { margin: 12mm; }
      `}</style>

      {/* ── Header (no-print) ── */}
      <div className="no-print" style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: p === '/dashboard/lists' ? 'white' : '#94a3b8', background: p === '/dashboard/lists' ? '#1e3a5f' : 'transparent', textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>
            ))}
          </nav>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
          Sign out
        </button>
      </div>

      {/* ── Toolbar (no-print) ── */}
      <div className="no-print" style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📋</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Transport Lists</span>
          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>·</span>
          <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
          <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>▶</button>
          <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {trips.length} trips · {totalPax} pax
          </span>
          <button onClick={() => window.print()}
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* ── Contenuto stampabile ── */}
      <div className="print-content" style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

        {/* Intestazione documento (visibile in stampa) */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f2340', letterSpacing: '-0.5px' }}>
              CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
              Transport Lists — <strong style={{ color: '#0f172a' }}>{fmtDateLong(date)}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
            <div>{trips.length} trips · {totalPax} pax</div>
            <div>Printed: {fmtNow()}</div>
          </div>
        </div>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> non impostato in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Caricamento…</div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📋</div>
            <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600' }}>No trips for {fmtDateLong(date)}</div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '10px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>

            {/* ══ SECTION 1: TRANSPORT LIST (STANDARD) ══ */}
            {standard.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <SectionHeader icon="🚌" title="TRANSPORT LIST" count={standard.length} color="#2563eb" />
                {standard.map(group => (
                  <TripBlock key={group.trip_id} group={group} locsMap={locsMap} showFlight={false} showPickup={true} />
                ))}
              </div>
            )}

            {/* ══ SECTION 2: TRAVEL LIST — ARRIVAL ══ */}
            {arrivals.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <SectionHeader icon="✈ 🛬" title="TRAVEL LIST — ARRIVALS" count={arrivals.length} color="#16a34a" />
                {arrivals.map(group => (
                  <TripBlock key={group.trip_id} group={group} locsMap={locsMap} showFlight={true} showPickup={true} />
                ))}
              </div>
            )}

            {/* ══ SECTION 3: TRAVEL LIST — DEPARTURE ══ */}
            {departures.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <SectionHeader icon="✈ 🛫" title="TRAVEL LIST — DEPARTURES" count={departures.length} color="#ea580c" />
                {departures.map(group => (
                  <TripBlock key={group.trip_id} group={group} locsMap={locsMap} showFlight={true} showPickup={false} />
                ))}
              </div>
            )}

            {/* Footer documento */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
              <span>CAPTAIN Dispatch · {PRODUCTION_ID?.slice(0, 8) ?? 'N/A'}</span>
              <span>{fmtDateLong(date)}</span>
              <span>Total: {trips.length} trips · {totalPax} pax</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
