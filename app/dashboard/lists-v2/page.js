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

// ─── formatCrewName: "John Smith" → "Smith J." | "Mary Jane Watson" → "Watson M." ──
function formatCrewName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const initial = parts[0][0].toUpperCase()
  return `${last} ${initial}.`
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
        terminal:       t.terminal,
        transfer_class: t.transfer_class,
        notes:          t.notes,
        rows:           [t],
      }
    } else {
      map[key].rows.push(t)
      // Accumula notes e terminal se presenti in più rows
      if (t.notes && !map[key].notes) map[key].notes = t.notes
      if (t.terminal && !map[key].terminal) map[key].terminal = t.terminal
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
  const hubTerminal = group.terminal
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
        {isMultiStop ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginBottom: '2px' }}>
              {/* Badge volo inline */}
              {showFlightInfo && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  background: transferClass === 'ARRIVAL' ? '#dbeafe' : '#fed7aa',
                  color: transferClass === 'ARRIVAL' ? '#1e40af' : '#c2410c',
                  padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', flexShrink: 0,
                }}>
                  <span>✈️</span>
                  {group.flight_no && <span>{group.flight_no}</span>}
                  {flightArrTime && <span>@{flightArrTime}</span>}
                </span>
              )}
              {/* Terminal inline */}
              {showHubInfo && hubTerminal && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#475569', fontWeight: '600', flexShrink: 0 }}>
                  <span style={{ fontSize: '8px' }}>📍</span>{hubTerminal}
                </span>
              )}
              {/* Notes inline */}
              {showHubInfo && tripNotes && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#64748b', flexShrink: 0 }}>
                  <span style={{ fontSize: '8px' }}>📝</span>{tripNotes}
                </span>
              )}
              {(showFlightInfo || (showHubInfo && (hubTerminal || tripNotes))) && (
                <span style={{ color: '#cbd5e1', fontSize: '9px' }}>|</span>
              )}
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
                    {legTime !== '–' && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontWeight: '700' }}>{legTime}</span>}
                    <span style={{ color: '#64748b' }}>{fromName}</span>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <span style={{ fontWeight: '800', color: '#0f172a' }}>{toName}</span>
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
                      {pg.names.map(n => formatCrewName(n)).join(' · ')}
                    </span>
                  </div>
                )
              })
            })()}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {/* Badge volo inline */}
            {showFlightInfo && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                background: transferClass === 'ARRIVAL' ? '#dbeafe' : '#fed7aa',
                color: transferClass === 'ARRIVAL' ? '#1e40af' : '#c2410c',
                padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', flexShrink: 0,
              }}>
                <span>✈️</span>
                {group.flight_no && <span>{group.flight_no}</span>}
                {flightArrTime && <span>@{flightArrTime}</span>}
              </span>
            )}
            {/* Terminal inline */}
            {showHubInfo && hubTerminal && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#475569', fontWeight: '600', flexShrink: 0 }}>
                <span style={{ fontSize: '8px' }}>📍</span>{hubTerminal}
              </span>
            )}
            {/* Notes inline */}
            {showHubInfo && tripNotes && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#64748b', flexShrink: 0 }}>
                <span style={{ fontSize: '8px' }}>📝</span>{tripNotes}
              </span>
            )}
            {(showFlightInfo || (showHubInfo && (hubTerminal || tripNotes))) && (
              <span style={{ color: '#cbd5e1', fontSize: '10px' }}>|</span>
            )}
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              <strong style={{ color: '#0f172a' }}>{pickupName}</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>→</span>
            <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '11px' }}>
              {(() => {
                const dropoffLoc = locsMap[group.rows[0]?.dropoff_id]
                return typeof dropoffLoc === 'object' ? dropoffLoc.name : dropoffLoc || group.rows[0]?.dropoff_id || '–'
              })()}
            </span>
            {group.rows[0]?.passenger_list && (
              <>
                <span style={{ color: '#cbd5e1', fontSize: '10px' }}>·</span>
                <span style={{ fontSize: '10px', color: '#475569', fontWeight: '500' }}>
                  {group.rows[0].passenger_list.split(',').map(s => formatCrewName(s.trim())).filter(Boolean).join(', ')}
                </span>
              </>
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

  // Check if any contacts exist
  const hasContacts = prod.director || prod.producer || prod.production_manager || 
                      prod.production_coordinator || prod.transportation_coordinator || 
                      prod.transportation_captain || prod.production_office_phone

  return (
    <>
      {/* Header 2 colonne: 70% SX / 30% DX */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: hasContacts ? '7fr 3fr' : '1fr',
        gap: '10px',
        padding: '8px 10px', 
        background: '#f9fafb', 
        borderBottom: '1px solid #e5e7eb', 
        fontSize: '10px', 
        lineHeight: 1.5, 
        marginBottom: '10px' 
      }}>
        {/* COLONNA SINISTRA (70%) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          {prod.logo_url && (
            <img
              src={prod.logo_url}
              alt="logo"
              style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', padding: '3px', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', color: textPrimary, marginBottom: '3px' }}>
              {prod.name || 'Production'}
              <span style={{
                display: 'inline-block',
                fontSize: '7px',
                background: '#fef2f2',
                color: '#dc2626',
                padding: '1px 5px',
                borderRadius: '3px',
                marginLeft: '6px',
                fontWeight: '800',
                letterSpacing: '0.05em',
              }}>
                CONFIDENTIAL
              </span>
            </div>
            <div style={{ color: textSecondary, fontSize: '9px' }}>
              Transport List · {dateDisplay} · Call: <strong style={{ color: textPrimary }}>{callTime}</strong>
            </div>
            {(setLabel !== '–' || basecampLabel !== '–') && (
              <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: `1px solid ${borderColor}`, fontSize: '9px', color: textSecondary }}>
                {setLabel !== '–' && <span>🎬 Set: <strong style={{ color: textPrimary }}>{setLabel}</strong></span>}
                {setLabel !== '–' && basecampLabel !== '–' && <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>}
                {basecampLabel !== '–' && <span>🏕 Basecamp: <strong style={{ color: textPrimary }}>{basecampLabel}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {/* COLONNA DESTRA (30%) - Solo se ci sono contatti */}
        {hasContacts && (
          <div style={{
            background: bgSecondary,
            padding: '6px 8px',
            borderRadius: '5px',
            fontSize: '8px',
            lineHeight: 1.4,
            color: textSecondary,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {prod.director && (
              <div><strong style={{ color: textPrimary, fontWeight: '600' }}>Director:</strong> {prod.director}</div>
            )}
            {prod.producer && (
              <div><strong style={{ color: textPrimary, fontWeight: '600' }}>Producer:</strong> {prod.producer}</div>
            )}
            {prod.production_manager && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Production Manager:</strong> {prod.production_manager}
                {prod.production_manager_phone && <span style={{ color: textTertiary }}> · 📱 {prod.production_manager_phone}</span>}
              </div>
            )}
            {prod.production_coordinator && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Production Coordinator:</strong> {prod.production_coordinator}
                {prod.production_coordinator_phone && <span style={{ color: textTertiary }}> · 📱 {prod.production_coordinator_phone}</span>}
              </div>
            )}
            {prod.transportation_coordinator && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Transport Coordinator:</strong> {prod.transportation_coordinator}
                {prod.transportation_coordinator_phone && <span style={{ color: textTertiary }}> · 📱 {prod.transportation_coordinator_phone}</span>}
              </div>
            )}
            {prod.transportation_captain && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Captain:</strong> {prod.transportation_captain}
                {prod.transportation_captain_phone && <span style={{ color: textTertiary }}> · 📱 {prod.transportation_captain_phone}</span>}
              </div>
            )}
            {prod.production_office_phone && (
              <div>
                <strong style={{ color: textPrimary, fontWeight: '600' }}>Office:</strong> 📱 {prod.production_office_phone}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Transport List Footer ─────────────────────────────────────
function TransportListFooter() {
  const borderColor = '#e2e8f0'
  const bgSecondary = '#f8fafc'
  const textTertiary = '#94a3b8'
  const radius = '10px'

  return (
    <div className="sticky-footer" style={{
      border: `0.5px solid ${borderColor}`,
      borderRadius: radius,
      overflow: 'hidden',
      marginTop: 'auto',
      position: 'sticky',
      bottom: 0,
      zIndex: 10,
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
    const [tR, lR, vR] = await Promise.all([
      supabase.from('trips').select('*')
        .eq('production_id', id).eq('date', d)
        .neq('status', 'CANCELLED')
        .order('pickup_min', { ascending: true, nullsLast: true }),
      supabase.from('locations').select('id,name,default_pickup_point').eq('production_id', id),
      supabase.from('vehicles').select('id').eq('production_id', id).eq('in_transport', true),
    ])
    // Filtra trip: escludi quelli assegnati a veicoli con in_transport=false (SD)
    const inTransportIds = new Set((vR.data || []).map(v => v.id))
    const trips = (tR.data || []).filter(t => !t.vehicle_id || inTransportIds.has(t.vehicle_id))
    setTrips(trips)
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
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>

      {/* ══ STILI GLOBALI ══ */}
      <style>{`
        .trip-row { font-size: 13px; }

        @media print {
          .no-print { display: none !important; }
          
          * { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          
          html, body { 
            background: white !important; 
            margin: 0 !important; 
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
          }

          .print-wrap { 
            padding: 0 !important; 
            margin: 0 !important;
            background: white !important; 
            max-width: none !important;
            width: 100% !important;
            min-height: auto !important;
          }
          
          .print-card { 
            border-radius: 0 !important; 
            padding: 8px 10px !important; 
            border: none !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .trip-row {
            padding: 3px 4px !important;
            font-size: 9px !important;
          }
          .trip-row > div { font-size: 9px !important; }
          .trip-row .time-cell { font-size: 11px !important; }
          .section-header { padding: 4px 0 2px !important; font-size: 8px !important; }
          .col-header { padding: 3px 4px !important; font-size: 8px !important; }
          .doc-footer { padding-top: 4px !important; margin-top: 6px !important; font-size: 8px !important; }
          .toolbar { display: none !important; }
          
          .sticky-footer {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }

        @page {
          size: A4 landscape;
          margin: 8mm;
        }
      `}</style>

      {/* ── Navbar ── */}
      <div className="no-print">
        <Navbar currentPath="/dashboard/lists-v2" />
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
          <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                         fontSize: '10px', fontWeight: '800', letterSpacing: '0.04em',
                         background: '#fef9c3', color: '#92400e',
                         border: '1px solid #fde68a' }}>
            EXCEL MODE - PREVIEW
          </span>
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
      <div className="print-wrap" style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', background: '#f1f5f9', minHeight: '80vh' }}>

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
