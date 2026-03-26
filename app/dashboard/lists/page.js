'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'

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

// ─── Riga tabella trip (layout landscape unificato) ──────────────
function TripTableRow({ group, locsMap, showFlight, showPickup, sectionColor }) {
  const mainTime = minToHHMM(group.pickup_min ?? group.call_min)
  const callTime = minToHHMM(group.call_min)
  const totalPax = group.rows.reduce((s, r) => s + (r.pax_count || 0), 0)
  const isMultiStop = group.rows.length > 1

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '50px 50px 70px 60px 90px 1fr 50px 50px',
      gap: '8px',
      alignItems: 'flex-start',
      padding: '8px',
      borderBottom: '1px solid #f1f5f9',
      borderLeft: `3px solid ${sectionColor}`,
      fontSize: '9px',
      pageBreakInside: 'avoid',
      background: 'white',
    }}>
      {/* TIME */}
      <div style={{ fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
        {mainTime}
      </div>

      {/* CALL */}
      <div style={{ fontWeight: '700', color: '#64748b', fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: '8px' }}>
        {callTime}
      </div>

      {/* TRIP ID */}
      <div style={{ fontWeight: '800', color: '#374151', fontFamily: 'monospace', textAlign: 'center' }}>
        {group.trip_id}
      </div>

      {/* VEHICLE */}
      <div style={{ fontWeight: '700', color: '#0f172a', textAlign: 'center' }}>
        {group.vehicle_id || '–'}
      </div>

      {/* DRIVER */}
      <div style={{ fontSize: '8px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {group.driver_name || '–'}
      </div>

      {/* ROUTE (multi-stop) */}
      <div style={{ fontSize: '8px', color: '#374151', lineHeight: '1.4' }}>
        {isMultiStop ? (
          <div>
            <div style={{ fontWeight: '700', color: '#ea580c', marginBottom: '2px' }}>
              🔀 MULTI ({group.rows.length} stops)
            </div>
            {group.rows.map((row, i) => {
              const pax = row.passenger_list
                ? row.passenger_list.split(',').map(s => s.trim()).filter(Boolean)
                : []
              const dropoffName = locsMap[row.dropoff_id] || row.dropoff_id || '–'
              return (
                <div key={row.id || i} style={{ marginBottom: '3px', paddingLeft: '12px', borderLeft: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: '600', color: '#0f172a' }}>
                    → {dropoffName}
                  </div>
                  {pax.length > 0 && (
                    <div style={{ fontSize: '7px', color: '#64748b', marginTop: '1px' }}>
                      {pax.join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: '600', color: '#0f172a' }}>
              → {locsMap[group.rows[0]?.dropoff_id] || group.rows[0]?.dropoff_id || '–'}
            </div>
            {group.rows[0]?.passenger_list && (
              <div style={{ fontSize: '7px', color: '#64748b', marginTop: '1px' }}>
                {group.rows[0].passenger_list.split(',').map(s => s.trim()).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAX */}
      <div style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>
        {totalPax}
      </div>

      {/* CAPACITY */}
      <div style={{ fontSize: '8px', color: '#64748b', textAlign: 'center' }}>
        {group.capacity || '–'}
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
  const totalTrips = standard.length + arrivals.length + departures.length
  const useCompactLayout = totalTrips > 20

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* ── Stili print ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .print-content { max-width: 100% !important; padding: 8mm !important; }
          body { background: white !important; margin: 0; }
          .trip-block { page-break-inside: avoid; }
          .print-container { width: 100%; }
        }
        @page { 
          size: A4 landscape;
          margin: 8mm;
        }
      `}</style>

      {/* ── Navbar unificata ── */}
      <Navbar currentPath="/dashboard/lists" />

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

            {/* ══ LAYOUT UNIFICATO LANDSCAPE ══ */}
            {/* Intestazione tabella */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '50px 50px 70px 60px 90px 1fr 50px 50px',
              gap: '8px',
              padding: '8px',
              borderBottom: '2px solid #e2e8f0',
              fontWeight: '700',
              fontSize: '9px',
              color: '#64748b',
              background: '#f8fafc',
              pageBreakAfter: 'avoid',
            }}>
              <div style={{ textAlign: 'center' }}>TIME</div>
              <div style={{ textAlign: 'center' }}>CALL</div>
              <div style={{ textAlign: 'center' }}>TRIP ID</div>
              <div style={{ textAlign: 'center' }}>VEHICLE</div>
              <div>DRIVER</div>
              <div>ROUTE</div>
              <div style={{ textAlign: 'right' }}>PAX</div>
              <div style={{ textAlign: 'center' }}>CAP</div>
            </div>

            {/* STANDARD */}
            {standard.length > 0 && (
              <>
                <div style={{ fontSize: '9px', fontWeight: '700', color: '#2563eb', padding: '8px 0 4px', marginTop: '8px', pageBreakAfter: 'avoid' }}>
                  🚌 TRANSPORT LIST ({standard.length})
                </div>
                {standard.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} showFlight={false} showPickup={true} sectionColor="#2563eb" />
                ))}
              </>
            )}

            {/* ARRIVALS */}
            {arrivals.length > 0 && (
              <>
                <div style={{ fontSize: '9px', fontWeight: '700', color: '#16a34a', padding: '12px 0 4px', marginTop: '8px', pageBreakAfter: 'avoid' }}>
                  ✈ 🛬 TRAVEL LIST — ARRIVALS ({arrivals.length})
                </div>
                {arrivals.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} showFlight={true} showPickup={true} sectionColor="#16a34a" />
                ))}
              </>
            )}

            {/* DEPARTURES */}
            {departures.length > 0 && (
              <>
                <div style={{ fontSize: '9px', fontWeight: '700', color: '#ea580c', padding: '12px 0 4px', marginTop: '8px', pageBreakAfter: 'avoid' }}>
                  ✈ 🛫 TRAVEL LIST — DEPARTURES ({departures.length})
                </div>
                {departures.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} showFlight={true} showPickup={false} sectionColor="#ea580c" />
                ))}
              </>
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
