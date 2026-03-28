'use client'

/**
 * /dashboard/reports — Fleet Daily & Weekly Report
 * Equivalente di 07_FleetReports.gs
 *
 * Daily: per veicolo → lista trip + ore lavorate + pax
 * Weekly: griglia 7 giorni × veicoli (ore + trip count)
 * Stampa PDF via window.print() con @media print
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { PageHeader } from '../../../components/ui/PageHeader'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

// ─── Utility ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtDateLong(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtNow() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function minToHHMM(min) {
  if (min == null) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function durToH(min) {
  if (!min) return '–'
  const h = Math.floor(min / 60), m = min % 60
  return m === 0 ? `${h}h` : `${h}h${pad2(m)}`
}
function getWeekStart(d) {
  // Lunedì della settimana
  const dt = new Date(d + 'T12:00:00Z')
  const day = dt.getUTCDay() || 7  // 1=Mon…7=Sun
  return new Date(dt.getTime() - (day - 1) * 86400000).toISOString().split('T')[0]
}

// ─── Classe colore status ──────────────────────────────────────
const CLS = {
  ARRIVAL:   { color: '#15803d', bg: '#dcfce7' },
  DEPARTURE: { color: '#c2410c', bg: '#fff7ed' },
  STANDARD:  { color: '#1d4ed8', bg: '#eff6ff' },
}

// ─── Pagina principale ─────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter()
  const [user,       setUser]       = useState(null)
  const [mode,       setMode]       = useState('daily')   // 'daily' | 'weekly'
  const [date,       setDate]       = useState(isoToday())
  const [trips,      setTrips]      = useState([])
  const [locsMap,    setLocsMap]    = useState({})
  const [loading,    setLoading]    = useState(true)

  // Weekly state
  const weekStart = getWeekStart(date)
  const weekDays  = Array.from({ length: 7 }, (_, i) => isoAdd(weekStart, i))

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (PRODUCTION_ID) {
        supabase.from('locations').select('id,name').eq('production_id', PRODUCTION_ID)
          .then(({ data }) => { if (data) { const m = {}; data.forEach(l => { m[l.id] = l.name }); setLocsMap(m) } })
      }
    })
  }, [])

  const loadTrips = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    let q = supabase.from('trips').select('*').eq('production_id', PRODUCTION_ID).neq('status', 'CANCELLED')
    if (mode === 'daily') {
      q = q.eq('date', date)
    } else {
      q = q.gte('date', weekStart).lte('date', weekDays[6])
    }
    const { data } = await q.order('date').order('pickup_min', { nullsLast: true })
    setTrips(data || [])
    setLoading(false)
  }, [mode, date, weekStart])

  useEffect(() => { if (user) loadTrips() }, [user, mode, date, loadTrips])

  // ── Daily: raggruppa per vehicle_id ───────────────────────
  const vehicles = [...new Set(trips.map(t => t.vehicle_id || '__no_vehicle__'))].sort()
  function tripsForVehicle(vId) {
    return trips.filter(t => (t.vehicle_id || '__no_vehicle__') === vId)
  }
  function vehicleName(vId) {
    return vId === '__no_vehicle__' ? 'No vehicle' : vId
  }
  function totalDurMin(tList) { return tList.reduce((s, t) => s + (t.duration_min || 0), 0) }
  function totalPax(tList) { return tList.reduce((s, t) => s + (t.pax_count || 0), 0) }

  // ── Weekly: griglia veicoli × giorni ──────────────────────
  const weekVehicles = [...new Set(trips.map(t => t.vehicle_id).filter(Boolean))].sort()
  function cellData(vId, d) {
    const dayTrips = trips.filter(t => t.vehicle_id === vId && t.date === d)
    const durMin   = totalDurMin(dayTrips)
    const pax      = totalPax(dayTrips)
    return { count: dayTrips.length, durMin, pax }
  }
  function vehicleWeekTotal(vId) {
    const vTrips = trips.filter(t => t.vehicle_id === vId)
    return { count: vTrips.length, durMin: totalDurMin(vTrips), pax: totalPax(vTrips) }
  }
  function dayTotal(d) {
    const dTrips = trips.filter(t => t.date === d)
    return { count: dTrips.length, durMin: totalDurMin(dTrips), pax: totalPax(dTrips) }
  }

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-content { padding: 16px !important; }
        }
        @page { margin: 12mm; }
      `}</style>

      {/* Header */}
      <div className="no-print">
        <Navbar currentPath="/dashboard/reports" />
      </div>

      {/* Toolbar */}
      <PageHeader
        className="no-print"
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>📊 Fleet Reports</span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            {['daily', 'weekly'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(mode === m ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }) }}>
                {m === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
            <span style={{ color: '#cbd5e1' }}>·</span>
            <button onClick={() => setDate(isoAdd(date, mode === 'weekly' ? -7 : -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>◀</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
            <button onClick={() => setDate(isoAdd(date, mode === 'weekly' ? 7 : 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>▶</button>
            <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Today</button>
          </div>
        }
        right={
          <button onClick={() => window.print()}
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
            🖨 Print / PDF
          </button>
        }
      />

      {/* Content */}
      <div className="print-content" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>

        {/* Doc header */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px 20px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#0f2340' }}>CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span></div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Fleet Report {mode === 'daily' ? 'Daily' : 'Weekly'} —{' '}
              <strong style={{ color: '#0f172a' }}>
                {mode === 'daily' ? fmtDateLong(date) : `${fmtDate(weekStart)} → ${fmtDate(weekDays[6])}`}
              </strong>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
            <div>{trips.length} trips · {totalPax(trips)} pax · {durToH(totalDurMin(trips))} total</div>
            <div>Printed: {fmtNow()}</div>
          </div>
        </div>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ NEXT_PUBLIC_PRODUCTION_ID not set
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading…</div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
            <div style={{ color: '#64748b', fontWeight: '600' }}>No trips for this period</div>
          </div>
        ) : mode === 'daily' ? (

          /* ══ DAILY REPORT ══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {vehicles.map(vId => {
              const vTrips = tripsForVehicle(vId)
              const durMin = totalDurMin(vTrips)
              const pax    = totalPax(vTrips)
              return (
                <div key={vId} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', pageBreakInside: 'avoid' }}>
                  {/* Vehicle header */}
                  <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>🚐</span>
                    <span style={{ fontWeight: '900', fontSize: '15px', color: '#0f172a', fontFamily: 'monospace' }}>{vehicleName(vId)}</span>
                    {vId !== '__no_vehicle__' && (() => {
                      const sample = vTrips[0]
                      return (
                        <>
                          {sample?.driver_name && <span style={{ fontSize: '12px', color: '#64748b' }}>👤 {sample.driver_name}</span>}
                          {sample?.sign_code   && <span style={{ fontSize: '11px', fontWeight: '700', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>{sample.sign_code}</span>}
                          {sample?.capacity    && <span style={{ fontSize: '11px', color: '#64748b' }}>×{sample.capacity}</span>}
                        </>
                      )
                    })()}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {[
                        { l: `${vTrips.length} trip${vTrips.length !== 1 ? 's' : ''}`, c: '#374151', bg: '#f1f5f9' },
                        { l: durToH(durMin), c: '#1d4ed8', bg: '#eff6ff' },
                        { l: `${pax} pax`, c: '#15803d', bg: '#f0fdf4' },
                      ].map(x => <span key={x.l} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: x.c, background: x.bg }}>{x.l}</span>)}
                    </div>
                  </div>
                  {/* Trip list */}
                  <div>
                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '42px 68px 80px 1fr 1fr 55px 55px 60px', gap: '8px', padding: '5px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em' }}>
                      <div>CALL</div><div>TRIP</div><div>CLASSE</div><div>FROM</div><div>TO</div><div style={{ textAlign: 'center' }}>DUR</div><div style={{ textAlign: 'center' }}>PAX</div><div>STATUS</div>
                    </div>
                    {vTrips.map((t, i) => {
                      const cls = CLS[t.transfer_class] || CLS.STANDARD
                      return (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '42px 68px 80px 1fr 1fr 55px 55px 60px', gap: '8px', padding: '7px 16px', borderBottom: i < vTrips.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', fontSize: '11px' }}>
                          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#0f172a' }}>{minToHHMM(t.call_min ?? t.pickup_min)}</div>
                          <div style={{ fontWeight: '800', fontFamily: 'monospace', color: '#374151' }}>{t.trip_id}</div>
                          <div><span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', background: cls.bg, color: cls.color }}>{t.transfer_class?.slice(0, 3)}</span></div>
                          <div style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locsMap[t.pickup_id] || t.pickup_id}</div>
                          <div style={{ color: '#0f172a', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locsMap[t.dropoff_id] || t.dropoff_id}</div>
                          <div style={{ textAlign: 'center', color: '#64748b' }}>{durToH(t.duration_min)}</div>
                          <div style={{ textAlign: 'center', fontWeight: '700', color: '#374151' }}>{t.pax_count || 0}</div>
                          <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>{t.status}</div>
                        </div>
                      )
                    })}
                    {/* Vehicle total row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '42px 68px 80px 1fr 1fr 55px 55px 60px', gap: '8px', padding: '7px 16px', background: '#f0fdf4', fontSize: '11px', borderTop: '2px solid #bbf7d0', fontWeight: '800', color: '#15803d' }}>
                      <div colSpan={5} style={{ gridColumn: '1 / 6' }}>DAILY TOTAL</div>
                      <div style={{ textAlign: 'center' }}>{durToH(durMin)}</div>
                      <div style={{ textAlign: 'center' }}>{pax}</div>
                      <div style={{ color: '#94a3b8', fontWeight: '500', fontSize: '9px' }}>{vTrips.length} trip</div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Grand total */}
            {vehicles.length > 1 && (
              <div style={{ background: '#0f2340', color: 'white', borderRadius: '10px', padding: '14px 20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontWeight: '900', fontSize: '13px' }}>DAILY TOTAL</span>
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: '700' }}>{trips.length} trips</span>
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: '700' }}>{durToH(totalDurMin(trips))}</span>
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: '700' }}>{totalPax(trips)} pax</span>
              </div>
            )}
          </div>

        ) : (

          /* ══ WEEKLY REPORT ══ */
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Grid header */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(7, 1fr) 90px`, borderBottom: '2px solid #e2e8f0' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', fontSize: '10px', fontWeight: '800', color: '#94a3b8' }}>VEHICLE</div>
              {weekDays.map(d => (
                <div key={d} style={{ padding: '8px 6px', background: d === isoToday() ? '#eff6ff' : '#f8fafc', textAlign: 'center', borderLeft: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em' }}>
                    {new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: d === isoToday() ? '#2563eb' : '#374151' }}>
                    {new Date(d + 'T12:00:00Z').getUTCDate()}
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 8px', background: '#f8fafc', textAlign: 'center', borderLeft: '1px solid #e2e8f0', fontSize: '10px', fontWeight: '800', color: '#94a3b8' }}>TOTALE</div>
            </div>

            {/* Vehicle rows */}
            {weekVehicles.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No vehicles with trips this week</div>
            ) : weekVehicles.map((vId, vi) => {
              const total = vehicleWeekTotal(vId)
              return (
                <div key={vId} style={{ display: 'grid', gridTemplateColumns: `180px repeat(7, 1fr) 90px`, borderBottom: vi < weekVehicles.length - 1 ? '1px solid #f1f5f9' : '2px solid #e2e8f0' }}>
                  <div style={{ padding: '10px 14px', fontWeight: '800', fontSize: '12px', color: '#0f172a', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'monospace' }}>{vId}</div>
                    {trips.find(t => t.vehicle_id === vId)?.driver_name && (
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{trips.find(t => t.vehicle_id === vId).driver_name}</div>
                    )}
                  </div>
                  {weekDays.map(d => {
                    const cell = cellData(vId, d)
                    const isEmpty = cell.count === 0
                    return (
                      <div key={d} style={{ padding: '8px 6px', textAlign: 'center', background: d === isoToday() ? '#fafbff' : 'white', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        {isEmpty ? (
                          <span style={{ fontSize: '10px', color: '#e2e8f0' }}>–</span>
                        ) : (
                          <>
                            <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{durToH(cell.durMin)}</div>
                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{cell.count}t · {cell.pax}p</div>
                          </>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ padding: '10px 8px', textAlign: 'center', background: '#f0fdf4', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: '#15803d' }}>{durToH(total.durMin)}</div>
                    <div style={{ fontSize: '9px', color: '#64748b' }}>{total.count}t · {total.pax}p</div>
                  </div>
                </div>
              )
            })}

            {/* Day totals row */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(7, 1fr) 90px`, background: '#f8fafc' }}>
              <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: '800', color: '#64748b' }}>TOTAL / DAY</div>
              {weekDays.map(d => {
                const cell = dayTotal(d)
                return (
                  <div key={d} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    {cell.count > 0 && (
                      <>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#374151' }}>{durToH(cell.durMin)}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>{cell.count}t · {cell.pax}p</div>
                      </>
                    )}
                  </div>
                )
              })}
              <div style={{ padding: '10px 8px', textAlign: 'center', background: '#eff6ff', borderLeft: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '900', color: '#1d4ed8' }}>{durToH(totalDurMin(trips))}</div>
                <div style={{ fontSize: '9px', color: '#64748b' }}>{trips.length}t</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
