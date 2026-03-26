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

// ─── baseTripId: strip lettera finale (es. R_0326_01A → R_0326_01) ──
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }

// ─── Raggruppa trip per baseTripId + vehicle_id (stesso pattern di trips/page.js) ──
function groupByTripId(tripRows) {
  const map = {}
  for (const t of tripRows) {
    const key = baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__')
    if (!map[key]) {
      map[key] = {
        trip_id:     baseTripId(t.trip_id),
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
      map[key].rows.push(t)
      // Usa il pickup_min più basso del gruppo
      if (t.pickup_min != null && (map[key].pickup_min == null || t.pickup_min < map[key].pickup_min)) {
        map[key].pickup_min = t.pickup_min
      }
      if (t.call_min != null && (map[key].call_min == null || t.call_min < map[key].call_min)) {
        map[key].call_min = t.call_min
      }
    }
  }
  return Object.values(map).sort((a, b) =>
    (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
  )
}

// ─── Riga tabella trip ─────────────────────────────────────────
function TripTableRow({ group, locsMap, sectionColor }) {
  const mainTime = minToHHMM(group.pickup_min ?? group.call_min)
  const callTime = minToHHMM(group.call_min)
  const totalPax = group.rows.reduce((s, r) => s + (r.pax_count || 0), 0)
  const isMultiStop = group.rows.length > 1

  const pickupName = locsMap[group.pickup_id] || group.pickup_id || '–'

  return (
    <div className="trip-row" style={{
      display: 'grid',
      gridTemplateColumns: '56px 50px 80px 58px 110px 1fr 36px 36px',
      gap: '0 6px',
      alignItems: 'flex-start',
      padding: '5px 6px',
      borderBottom: '1px solid #e2e8f0',
      borderLeft: `4px solid ${sectionColor}`,
      background: 'white',
      pageBreakInside: 'avoid',
    }}>
      {/* TIME */}
      <div style={{ fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: '13px', lineHeight: 1.2 }}>
        {mainTime}
      </div>

      {/* CALL */}
      <div style={{ fontWeight: '700', color: '#64748b', fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: '11px', lineHeight: 1.2, paddingTop: '1px' }}>
        {callTime}
      </div>

      {/* TRIP ID */}
      <div style={{ fontWeight: '800', color: '#374151', fontFamily: 'monospace', textAlign: 'center', fontSize: '12px', lineHeight: 1.2 }}>
        {group.trip_id}
      </div>

      {/* VEHICLE */}
      <div style={{ fontWeight: '800', color: '#0f172a', textAlign: 'center', fontSize: '12px', lineHeight: 1.2 }}>
        {group.vehicle_id || '–'}
      </div>

      {/* DRIVER */}
      <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
        {group.driver_name || '–'}
      </div>

      {/* ROUTE */}
      <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.4 }}>
        {isMultiStop ? (
          <div>
            {/* Badge multi-stop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{
                background: '#ea580c', color: 'white', fontWeight: '900',
                fontSize: '10px', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.3px'
              }}>
                🔀 MULTI · {group.rows.length} STOPS
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                📍 FROM: <strong style={{ color: '#0f172a' }}>{pickupName}</strong>
              </span>
            </div>
            {/* Ogni fermata */}
            {group.rows.map((row, i) => {
              const pax = row.passenger_list
                ? row.passenger_list.split(',').map(s => s.trim()).filter(Boolean)
                : []
              const dropoffName = locsMap[row.dropoff_id] || row.dropoff_id || '–'
              const legTime = minToHHMM(row.pickup_min)
              return (
                <div key={row.id || i} style={{
                  display: 'flex', gap: '6px', alignItems: 'flex-start',
                  padding: '2px 0 2px 8px',
                  borderLeft: '2px solid #e2e8f0',
                  marginBottom: '2px',
                }}>
                  <span style={{ fontWeight: '900', color: '#ea580c', fontSize: '11px', minWidth: '14px' }}>
                    {i + 1}.
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '11px' }}>
                        → {dropoffName}
                      </span>
                      {legTime !== '–' && (
                        <span style={{ fontSize: '10px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                          @{legTime}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        ({row.pax_count || 0} pax)
                      </span>
                    </div>
                    {pax.length > 0 && (
                      <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px', fontWeight: '500' }}>
                        {pax.join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                FROM: <strong style={{ color: '#0f172a' }}>{pickupName}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>→</span>
              <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '11px' }}>
                {locsMap[group.rows[0]?.dropoff_id] || group.rows[0]?.dropoff_id || '–'}
              </span>
            </div>
            {group.rows[0]?.passenger_list && (
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px', fontWeight: '500' }}>
                {group.rows[0].passenger_list.split(',').map(s => s.trim()).filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAX */}
      <div style={{ fontWeight: '800', color: '#0f172a', textAlign: 'center', fontSize: '12px', lineHeight: 1.2 }}>
        {totalPax}
      </div>

      {/* CAPACITY */}
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', lineHeight: 1.2 }}>
        {group.capacity || '–'}
      </div>
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

  const standard   = groupByTripId(trips.filter(t => t.transfer_class === 'STANDARD'))
  const arrivals   = groupByTripId(trips.filter(t => t.transfer_class === 'ARRIVAL'))
  const departures = groupByTripId(trips.filter(t => t.transfer_class === 'DEPARTURE'))

  const totalPax = trips.reduce((s, t) => s + (t.pax_count || 0), 0)
  const totalTrips = standard.length + arrivals.length + departures.length

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ══ STILI GLOBALI ══ */}
      <style>{`
        /* ── SCHERMO: leggibile ── */
        .trip-row { font-size: 13px; }

        /* ── STAMPA ── */
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* Comprimi ogni riga al minimo */
          .trip-row {
            padding: 3px 4px !important;
            font-size: 9px !important;
          }
          .trip-row > div { font-size: 9px !important; }

          /* TIME grande e leggibile anche in stampa */
          .trip-row .time-cell { font-size: 11px !important; }

          /* Sezioni header compatte */
          .section-header { padding: 4px 0 2px !important; font-size: 8px !important; }

          /* Intestazione documento compatta */
          .doc-header { padding: 6px 10px !important; margin-bottom: 8px !important; }
          .doc-header .title { font-size: 13px !important; }
          .doc-header .subtitle { font-size: 9px !important; }
          .doc-header .meta { font-size: 8px !important; }

          /* Intestazione colonne compatta */
          .col-header { padding: 3px 4px !important; font-size: 8px !important; }

          /* Footer compatto */
          .doc-footer { padding-top: 4px !important; margin-top: 6px !important; font-size: 8px !important; }

          /* Nomi crew in stampa */
          .crew-names { font-size: 8px !important; }

          /* Stop label in stampa */
          .stop-label { font-size: 8px !important; }
          .stop-dest { font-size: 9px !important; }

          /* Multi badge in stampa */
          .multi-badge { font-size: 8px !important; padding: 0 4px !important; }
          .multi-from { font-size: 8px !important; }

          /* Contenitore principale */
          .print-wrap { padding: 0 !important; background: white !important; }
          .print-card { border-radius: 0 !important; padding: 0 !important; border: none !important; }

          /* Toolbar nascosta */
          .toolbar { display: none !important; }
        }

        @page {
          size: A4 landscape;
          margin: 7mm 8mm;
        }
      `}</style>

      {/* ── Navbar (nascosta in stampa) ── */}
      <div className="no-print">
        <Navbar currentPath="/dashboard/lists" />
      </div>

      {/* ── Toolbar (nascosta in stampa) ── */}
      <div className="no-print toolbar" style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '0 24px', height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: '52px', zIndex: 20,
      }}>
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
            {totalTrips} trips · {totalPax} pax
          </span>
          <button onClick={() => window.print()}
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* ── Contenuto stampabile ── */}
      <div className="print-wrap" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

        {/* Intestazione documento */}
        <div className="doc-header" style={{
          background: 'white', borderRadius: '10px', padding: '14px 20px',
          marginBottom: '16px', border: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="title" style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', letterSpacing: '-0.5px' }}>
              CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginLeft: '12px' }}>Transport Lists</span>
            </div>
            <div className="subtitle" style={{ fontSize: '14px', color: '#0f172a', marginTop: '2px', fontWeight: '700' }}>
              {fmtDateLong(date)}
            </div>
          </div>
          <div className="meta" style={{ textAlign: 'right', fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
            <div style={{ fontWeight: '700', color: '#64748b' }}>{totalTrips} trips · {totalPax} pax</div>
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
          <div className="print-card" style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e2e8f0' }}>

            {/* Intestazione colonne */}
            <div className="col-header" style={{
              display: 'grid',
              gridTemplateColumns: '56px 50px 80px 58px 110px 1fr 36px 36px',
              gap: '0 6px',
              padding: '6px 6px',
              borderBottom: '2px solid #0f172a',
              fontWeight: '800',
              fontSize: '10px',
              color: '#0f172a',
              background: '#f8fafc',
              letterSpacing: '0.5px',
              pageBreakAfter: 'avoid',
            }}>
              <div style={{ textAlign: 'center' }}>TIME</div>
              <div style={{ textAlign: 'center' }}>CALL</div>
              <div style={{ textAlign: 'center' }}>TRIP ID</div>
              <div style={{ textAlign: 'center' }}>VEH.</div>
              <div>DRIVER</div>
              <div>ROUTE &amp; CREW</div>
              <div style={{ textAlign: 'center' }}>PAX</div>
              <div style={{ textAlign: 'center' }}>CAP</div>
            </div>

            {/* ── STANDARD ── */}
            {standard.length > 0 && (
              <>
                <div className="section-header" style={{
                  fontSize: '11px', fontWeight: '800', color: 'white',
                  background: '#2563eb',
                  padding: '5px 8px', marginTop: '8px',
                  pageBreakAfter: 'avoid',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span>🚌 TRANSPORT LIST</span>
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '4px', padding: '0 6px', fontSize: '10px' }}>
                    {standard.length} trip{standard.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {standard.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} sectionColor="#2563eb" />
                ))}
              </>
            )}

            {/* ── ARRIVALS ── */}
            {arrivals.length > 0 && (
              <>
                <div className="section-header" style={{
                  fontSize: '11px', fontWeight: '800', color: 'white',
                  background: '#16a34a',
                  padding: '5px 8px', marginTop: '10px',
                  pageBreakAfter: 'avoid',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span>✈ 🛬 TRAVEL LIST — ARRIVALS</span>
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '4px', padding: '0 6px', fontSize: '10px' }}>
                    {arrivals.length} trip{arrivals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {arrivals.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} sectionColor="#16a34a" />
                ))}
              </>
            )}

            {/* ── DEPARTURES ── */}
            {departures.length > 0 && (
              <>
                <div className="section-header" style={{
                  fontSize: '11px', fontWeight: '800', color: 'white',
                  background: '#ea580c',
                  padding: '5px 8px', marginTop: '10px',
                  pageBreakAfter: 'avoid',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span>✈ 🛫 TRAVEL LIST — DEPARTURES</span>
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '4px', padding: '0 6px', fontSize: '10px' }}>
                    {departures.length} trip{departures.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {departures.map(group => (
                  <TripTableRow key={group.trip_id} group={group} locsMap={locsMap} sectionColor="#ea580c" />
                ))}
              </>
            )}

            {/* Footer documento */}
            <div className="doc-footer" style={{
              borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '14px',
              display: 'flex', justifyContent: 'space-between',
              fontSize: '11px', color: '#94a3b8',
            }}>
              <span>CAPTAIN Dispatch · {PRODUCTION_ID?.slice(0, 8) ?? 'N/A'}</span>
              <span>{fmtDateLong(date)}</span>
              <span>Total: {totalTrips} trips · {totalPax} pax</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
