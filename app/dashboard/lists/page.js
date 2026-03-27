'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'

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
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function fmtNow() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function fmtNowDate() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`
}

// ─── baseTripId: strip lettera finale (es. R_0326_01A → R_0326_01) ──
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }

// ─── Raggruppa trip per baseTripId + vehicle_id ──
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
        arr_time:       t.arr_time,
        flight_no:      t.flight_no,
        transfer_class: t.transfer_class,
        notes:          t.notes,
        meeting_point:  t.meeting_point,
        rows:           [t],
      }
    } else {
      map[key].rows.push(t)
      // Accumula notes e meeting_point se presenti in più rows
      if (t.notes && !map[key].notes) map[key].notes = t.notes
      if (t.meeting_point && !map[key].meeting_point) map[key].meeting_point = t.meeting_point
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
  const pickupLoc = locsMap[group.pickup_id]
  const pickupName = typeof pickupLoc === 'object' ? pickupLoc.name : pickupLoc || group.pickup_id || '–'

  // Determina se mostrare info volo (solo per ARRIVAL/DEPARTURE con dati disponibili)
  const transferClass = group.transfer_class
  const showFlightInfo = (transferClass === 'ARRIVAL' || transferClass === 'DEPARTURE') && 
                         (group.flight_no || group.arr_time)
  
  // Formatta orario arrivo volo (arr_time è in formato time HH:MM:SS)
  const flightArrTime = group.arr_time ? group.arr_time.slice(0, 5) : null

  // Info Hub/Terminal e Notes (solo per ARRIVAL/DEPARTURE)
  const showHubInfo = transferClass === 'ARRIVAL' || transferClass === 'DEPARTURE'
  const pickupLocForHub = locsMap[group.pickup_id]
  const hubTerminal = group.meeting_point || (typeof pickupLocForHub === 'object' ? pickupLocForHub.pickup_point : null)
  const tripNotes = group.notes
  const hasInfoBar = showHubInfo && (hubTerminal || tripNotes)

  return (
    <div className="trip-row" style={{
      display: 'grid',
      gridTemplateColumns: '56px 50px 58px 110px 1fr 36px 36px',
      gap: '0 6px',
      alignItems: 'flex-start',
      padding: '5px 6px',
      borderBottom: '1px solid #e2e8f0',
      borderLeft: `4px solid ${sectionColor}`,
      background: 'white',
      pageBreakInside: 'avoid',
    }}>
      <div style={{ fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: '13px', lineHeight: 1.2 }}>
        {mainTime}
      </div>
      <div style={{ fontWeight: '700', color: '#64748b', fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: '11px', lineHeight: 1.2, paddingTop: '1px' }}>
        {callTime}
      </div>
      <div style={{ fontWeight: '800', color: '#0f172a', textAlign: 'center', fontSize: '12px', lineHeight: 1.2 }}>
        {group.vehicle_id || '–'}
      </div>
      <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
        {group.driver_name || '–'}
      </div>
      <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.4 }}>
        {/* Info bar orizzontale: volo, terminal, notes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
          {/* Badge info volo per ARRIVAL/DEPARTURE */}
          {showFlightInfo && (
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px',
              background: transferClass === 'ARRIVAL' ? '#dbeafe' : '#fed7aa',
              color: transferClass === 'ARRIVAL' ? '#1e40af' : '#c2410c',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '800',
            }}>
              <span>✈️</span>
              {group.flight_no && <span>{group.flight_no}</span>}
              {flightArrTime && <span>@{flightArrTime}</span>}
            </span>
          )}
          {/* Terminal (solo ARRIVAL/DEPARTURE) */}
          {showHubInfo && hubTerminal && (
            <>
              {showFlightInfo && <span style={{ color: '#cbd5e1', fontSize: '10px' }}>|</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#64748b' }}>
                <span style={{ fontSize: '8px' }}>📍</span>
                <span style={{ fontWeight: '600', color: '#475569' }}>{hubTerminal}</span>
              </span>
            </>
          )}
          {/* Notes (solo ARRIVAL/DEPARTURE) */}
          {showHubInfo && tripNotes && (
            <>
              {(showFlightInfo || hubTerminal) && <span style={{ color: '#cbd5e1', fontSize: '10px' }}>|</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#64748b' }}>
                <span style={{ fontSize: '8px' }}>📝</span>
                <span style={{ fontWeight: '500', color: '#64748b' }}>{tripNotes}</span>
              </span>
            </>
          )}
        </div>
        {isMultiStop ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginBottom: '2px' }}>
              <span style={{ background: '#ea580c', color: 'white', fontWeight: '900', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.3px', flexShrink: 0 }}>
                🔀 {group.rows.length}
              </span>
              {group.rows.map((row, i) => {
                const fromLoc = locsMap[row.pickup_id]
                const fromName = (typeof fromLoc === 'object' ? fromLoc.name : fromLoc || row.pickup_id || '–').split(' ').slice(0, 2).join(' ')
                const toLoc = locsMap[row.dropoff_id]
                const toName = (typeof toLoc === 'object' ? toLoc.name : toLoc || row.dropoff_id || '–').split(' ').slice(0, 2).join(' ')
                const legTime  = minToHHMM(row.pickup_min)
                return (
                  <span key={row.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                    {i > 0 && <span style={{ color: '#cbd5e1', margin: '0 2px' }}>|</span>}
                    <span style={{ color: '#64748b' }}>{fromName}</span>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <span style={{ fontWeight: '800', color: '#0f172a' }}>{toName}</span>
                    {legTime !== '–' && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>@{legTime}</span>}
                    <span style={{ color: '#64748b' }}>({row.pax_count || 0})</span>
                  </span>
                )
              })}
            </div>
            {(() => {
              const byPickup = {}
              for (const row of group.rows) {
                const key = row.pickup_id || '__unknown__'
                if (!byPickup[key]) byPickup[key] = { pickup_id: row.pickup_id, names: [] }
                if (row.passenger_list) {
                  byPickup[key].names.push(...row.passenger_list.split(',').map(s => s.trim()).filter(Boolean))
                }
              }
              const pickupGroups = Object.values(byPickup).filter(g => g.names.length > 0)
              if (!pickupGroups.length) return null
              return pickupGroups.map(pg => {
                const pgLoc = locsMap[pg.pickup_id]
                const pgLocName = typeof pgLoc === 'object' ? pgLoc.name : pgLoc || pg.pickup_id || '?'
                return (
                  <div key={pg.pickup_id} style={{ display: 'flex', alignItems: 'baseline', gap: '4px', fontSize: '10px', marginTop: '1px', lineHeight: 1.3 }}>
                    <span style={{ color: '#ea580c', fontWeight: '800', flexShrink: 0 }}>
                      📍 {pgLocName.split(' ').slice(0, 3).join(' ')}:
                    </span>
                    <span style={{ color: '#475569', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pg.names.join(' · ')}
                    </span>
                  </div>
                )
              })
            })()}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                FROM: <strong style={{ color: '#0f172a' }}>{pickupName}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>→</span>
              <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '11px' }}>
                {(() => {
                  const dropoffLoc = locsMap[group.rows[0]?.dropoff_id]
                  return typeof dropoffLoc === 'object' ? dropoffLoc.name : dropoffLoc || group.rows[0]?.dropoff_id || '–'
                })()}
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
      <div style={{ fontWeight: '800', color: '#0f172a', textAlign: 'center', fontSize: '12px', lineHeight: 1.2 }}>
        {totalPax}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', lineHeight: 1.2 }}>
        {group.capacity || '–'}
      </div>
    </div>
  )
}

// ─── Transport List Header ─────────────────────────────────────
function TransportListHeader({ production, date }) {
  const prod = production || {}

  // Format date for display
  const dateDisplay = fmtDateLong(date)

  // General call time
  const callTime = prod.general_call_time
    ? prod.general_call_time.slice(0, 5)
    : '–'

  // Set bar text
  const setLabel = [prod.set_location, prod.set_address].filter(Boolean).join(', ') || '–'
  const basecampLabel = prod.basecamp || '–'

  const borderColor = '#e2e8f0'
  const bgSecondary = '#f8fafc'
  const textPrimary = '#0f172a'
  const textSecondary = '#64748b'
  const textTertiary = '#94a3b8'
  const radius = '10px'
  const radiusSm = '5px'

  return (
    <div style={{
      border: `0.5px solid ${borderColor}`,
      borderRadius: radius,
      overflow: 'hidden',
      background: 'white',
      marginBottom: '10px',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr auto',
        alignItems: 'center',
        gap: '14px',
        padding: '8px 14px',
        borderBottom: `0.5px solid ${borderColor}`,
      }}>
        {/* Logo */}
        {prod.logo_url ? (
          <img
            src={prod.logo_url}
            alt="logo"
            style={{ width: '56px', height: '36px', objectFit: 'contain', borderRadius: radiusSm, background: 'white', border: `0.5px solid ${borderColor}`, padding: '2px' }}
          />
        ) : (
          <div style={{
            width: '56px', height: '36px',
            border: `0.5px dashed ${borderColor}`,
            borderRadius: radiusSm,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', color: textTertiary,
          }}>
            LOGO
          </div>
        )}

        {/* Center: production name + sub */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: '500', color: textPrimary }}>
            {prod.name || 'Production Name'}
            <span style={{
              display: 'inline-block',
              fontSize: '9px',
              background: '#fef2f2',
              color: '#dc2626',
              padding: '1px 7px',
              borderRadius: radiusSm,
              marginLeft: '8px',
              verticalAlign: 'middle',
              fontWeight: '700',
              letterSpacing: '0.05em',
            }}>
              CONFIDENTIAL
            </span>
          </div>
          <div style={{ fontSize: '11px', color: textSecondary, marginTop: '2px' }}>
            Transport List &nbsp;·&nbsp; {dateDisplay}
            {prod.shoot_day ? ` · Shoot Day ${prod.shoot_day}` : ''}
            {prod.revision  ? ` · Rev. ${prod.revision}`       : ''}
          </div>
        </div>

        {/* Right: General Call */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: textTertiary }}>General Call</div>
          <div style={{ fontSize: '22px', fontWeight: '500', lineHeight: 1.1, color: textPrimary }}>
            {callTime}
          </div>
        </div>
      </div>

      {/* Contacts row 1 — 4 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: `0.5px solid ${borderColor}`,
      }}>
        {[
          { label: 'Director',               name: prod.director,                 phone: null },
          { label: 'Producer',               name: prod.producer,                 phone: null },
          { label: 'Production Manager',     name: prod.production_manager,       phone: prod.production_manager_phone },
          { label: 'Production Coordinator', name: prod.production_coordinator,   phone: prod.production_coordinator_phone },
        ].map((c, i, arr) => (
          <div key={c.label} style={{
            padding: '6px 12px',
            borderRight: i < arr.length - 1 ? `0.5px solid ${borderColor}` : 'none',
            minWidth: 0,
          }}>
            <div style={{ fontSize: '11px', fontWeight: '500', color: textSecondary, marginBottom: '2px' }}>{c.label}</div>
            <div style={{ fontSize: '13px', color: textPrimary }}>{c.name || '–'}</div>
            <div style={{ fontSize: '10px', color: textTertiary, marginTop: '1px' }}>{c.phone || '\u00a0'}</div>
          </div>
        ))}
      </div>

      {/* Contacts row 2 — 3 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
      }}>
        {[
          { label: 'Transportation Coordinator', name: prod.transportation_coordinator, phone: prod.transportation_coordinator_phone },
          { label: 'Transportation Captain',     name: prod.transportation_captain,     phone: prod.transportation_captain_phone },
          { label: 'Production Office',          name: prod.production_office_phone,    phone: null, isPhone: true },
        ].map((c, i, arr) => (
          <div key={c.label} style={{
            padding: '6px 12px',
            borderRight: i < arr.length - 1 ? `0.5px solid ${borderColor}` : 'none',
            minWidth: 0,
          }}>
            <div style={{ fontSize: '11px', fontWeight: '500', color: textSecondary, marginBottom: '2px' }}>{c.label}</div>
            {c.isPhone ? (
              <>
                <div style={{ fontSize: '13px', color: textPrimary }}>{c.name || '–'}</div>
                <div style={{ fontSize: '10px', color: textTertiary, marginTop: '1px' }}>&nbsp;</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: textPrimary }}>{c.name || '–'}</div>
                <div style={{ fontSize: '10px', color: textTertiary, marginTop: '1px' }}>{c.phone || '\u00a0'}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Set bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '5px 14px',
        background: bgSecondary,
        borderTop: `0.5px solid ${borderColor}`,
        fontSize: '11px',
        color: textSecondary,
      }}>
        <span><strong style={{ color: textPrimary, fontWeight: '500' }}>Set:</strong> {setLabel}</span>
        <span><strong style={{ color: textPrimary, fontWeight: '500' }}>Basecamp:</strong> {basecampLabel}</span>
      </div>
    </div>
  )
}

// ─── Transport List Footer ─────────────────────────────────────
function TransportListFooter() {
  const borderColor = '#e2e8f0'
  const bgSecondary = '#f8fafc'
  const textTertiary = '#94a3b8'
  const radius = '10px'

  return (
    <div style={{
      border: `0.5px solid ${borderColor}`,
      borderRadius: radius,
      overflow: 'hidden',
      marginTop: '10px',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '5px 14px',
        background: bgSecondary,
        fontSize: '10px',
        color: textTertiary,
      }}>
        <span>Confidential — Not for Distribution</span>
        <span style={{ textAlign: 'center' }}>Generated by CaptainDispatch</span>
        <span style={{ textAlign: 'right' }}>{fmtNow()}</span>
      </div>
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function ListsPage() {
  const router = useRouter()
  const [user,       setUser]       = useState(null)
  const [date,       setDate]       = useState(isoToday())
  const [trips,      setTrips]      = useState([])
  const [locsMap,    setLocsMap]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [production, setProduction] = useState(null)
  const [prodId,     setProdId]     = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else {
        setUser(user)
        const id = getProductionId()
        setProdId(id)
        if (id) loadProduction(id)
      }
    })
  }, [])

  async function loadProduction(id) {
    const { data } = await supabase
      .from('productions')
      .select('*')
      .eq('id', id)
      .single()
    if (data) setProduction(data)
  }

  const loadData = useCallback(async d => {
    const id = getProductionId()
    if (!id) { setLoading(false); return }
    setLoading(true)
    const [tR, lR] = await Promise.all([
      supabase.from('trips').select('*')
        .eq('production_id', id).eq('date', d)
        .neq('status', 'CANCELLED')
        .order('pickup_min', { ascending: true, nullsLast: true }),
      supabase.from('locations').select('id,name,default_pickup_point').eq('production_id', id),
    ])
    setTrips(tR.data || [])
    if (lR.data) {
      const m = {}; lR.data.forEach(l => { m[l.id] = { name: l.name, pickup_point: l.default_pickup_point } }); setLocsMap(m)
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadData(date) }, [user, date, loadData])

  const standard   = groupByTripId(trips.filter(t => t.transfer_class === 'STANDARD'))
  const arrivals   = groupByTripId(trips.filter(t => t.transfer_class === 'ARRIVAL'))
  const departures = groupByTripId(trips.filter(t => t.transfer_class === 'DEPARTURE'))

  const totalPax   = trips.reduce((s, t) => s + (t.pax_count || 0), 0)
  const totalTrips = standard.length + arrivals.length + departures.length

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ══ STILI GLOBALI ══ */}
      <style>{`
        .trip-row { font-size: 13px; }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .trip-row {
            padding: 3px 4px !important;
            font-size: 9px !important;
          }
          .trip-row > div { font-size: 9px !important; }
          .trip-row .time-cell { font-size: 11px !important; }
          .section-header { padding: 4px 0 2px !important; font-size: 8px !important; }
          .col-header { padding: 3px 4px !important; font-size: 8px !important; }
          .doc-footer { padding-top: 4px !important; margin-top: 6px !important; font-size: 8px !important; }
          .print-wrap { padding: 0 !important; background: white !important; }
          .print-card { border-radius: 0 !important; padding: 0 !important; border: none !important; }
          .toolbar { display: none !important; }
        }

        @page {
          size: A4 landscape;
          margin: 7mm 8mm;
        }
      `}</style>

      {/* ── Navbar ── */}
      <div className="no-print">
        <Navbar currentPath="/dashboard/lists" />
      </div>

      {/* ── Toolbar ── */}
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
          {production && (
            <a href="/dashboard/settings/production"
              style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', textDecoration: 'none', cursor: 'pointer' }}>
              ⚙️ Edit Header
            </a>
          )}
          <button onClick={() => window.print()}
            style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* ── Contenuto stampabile ── */}
      <div className="print-wrap" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

        {/* ── Transport List Header (nuovo layout) ── */}
        <TransportListHeader production={production} date={date} />

        {!prodId && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ No active production. Go to <a href="/dashboard/productions" style={{ color: '#2563eb' }}>Productions</a> and activate one.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading…</div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📋</div>
            <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600' }}>No trips for {fmtDateLong(date)}</div>
          </div>
        ) : (
          <div className="print-card" style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e2e8f0' }}>

            {/* Intestazione colonne */}
            <div className="col-header" style={{
              display: 'grid',
              gridTemplateColumns: '56px 50px 58px 110px 1fr 36px 36px',
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

          </div>
        )}

        {/* ── Transport List Footer (nuovo layout) ── */}
        <TransportListFooter />

      </div>
    </div>
  )
}
