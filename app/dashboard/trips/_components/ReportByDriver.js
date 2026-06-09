'use client'

import { useState, useMemo } from 'react'
import { useIsMobile } from '../../../../lib/useIsMobile'

// ─── Helpers ──────────────────────────────────────────────────

function minsToHHMM(mins) {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtTime(isoStr) {
  if (!isoStr) return null
  try {
    const d = new Date(isoStr)
    const h = String(d.getUTCHours()).padStart(2, '0')
    const m = String(d.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  } catch { return null }
}

function durationMinutes(startedAt, arrivedAt) {
  if (!startedAt || !arrivedAt) return null
  try {
    const diff = new Date(arrivedAt) - new Date(startedAt)
    if (diff < 0) return null
    return Math.round(diff / 60000)
  } catch { return null }
}

function fmtDuration(mins) {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtTotalHours(totalMins) {
  if (!totalMins) return '—'
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function isoDatePart(isoStr) {
  if (!isoStr) return null
  return isoStr.slice(0, 10)
}

function fmtDateLabel(dateStr) {
  if (!dateStr) return dateStr
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()
    return `${weekday} ${day} ${month}`
  } catch { return dateStr }
}

function locName(reportLocsMap, id) {
  if (!id) return '—'
  return reportLocsMap[id]?.name || id
}

function locType(reportLocsMap, id) {
  if (!id) return 'OTHER'
  return reportLocsMap[id]?.location_type || 'OTHER'
}

function isLate(pickup_min, started_at) {
  if (pickup_min == null || !started_at) return false
  try {
    const d = new Date(started_at)
    const actualMins = d.getUTCHours() * 60 + d.getUTCMinutes()
    return actualMins > pickup_min + 5
  } catch { return false }
}

const HUB_TYPES = [
  { value: 'ALL',           label: 'All hubs' },
  { value: 'AIRPORT',       label: '✈ Airport' },
  { value: 'TRAIN_STATION', label: '🚂 Train' },
  { value: 'BUS_STATION',   label: '🚌 Bus' },
  { value: 'PORT',          label: '⚓ Port' },
]

const CLASS_TYPES = [
  { value: 'ALL',       label: 'All' },
  { value: 'ARRIVAL',   label: 'Arrival' },
  { value: 'DEPARTURE', label: 'Departure' },
  { value: 'STANDARD',  label: 'Standard' },
]

// Grid: Trip ID | Type | Route | Planned | Start→Arrived | Est.km | Real km | Pax
const COL = '100px 90px 1fr 70px 150px 65px 65px 40px'

const BTN = { padding: '6px 13px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }
const BTN_ACTIVE = { ...BTN, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }
const BTN_PILL = { padding: '4px 10px', borderRadius: '999px', border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
const BTN_PILL_ACT = { ...BTN_PILL, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }

// ─── Type Pill ────────────────────────────────────────────────

function TypePill({ trip, isMultiPickup, isMultiDropoff, isMultiLeg }) {
  if (isMultiLeg) {
    if (isMultiPickup && isMultiDropoff) return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' }}>MIXED</span>
    if (isMultiPickup) return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>MULTI-PKP</span>
    if (isMultiDropoff) return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>MULTI-DRP</span>
  }
  const tc = trip?.transfer_class
  if (tc === 'ARRIVAL')   return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#E6F1FB', color: '#185FA5', border: '1px solid #85B7EB' }}>ARRIVAL</span>
  if (tc === 'DEPARTURE') return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#FAEEDA', color: '#854F0B', border: '1px solid #FAC775' }}>DEPARTURE</span>
  return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>STANDARD</span>
}

// ─── HubIcon ──────────────────────────────────────────────────

function HubIcon({ reportLocsMap, pickupId, dropoffId }) {
  const types = [
    reportLocsMap[pickupId]?.location_type,
    reportLocsMap[dropoffId]?.location_type,
  ]
  const hubType = types.find(t => t && t !== 'OTHER')
  if (!hubType) return null
  const icons = { AIRPORT: '✈', TRAIN_STATION: '🚂', BUS_STATION: '🚌', PORT: '⚓' }
  const icon = icons[hubType]
  if (!icon) return null
  return (
    <span style={{ fontSize: '11px', marginLeft: '3px' }} title={hubType}>{icon}</span>
  )
}

// ─── ColHeaders ───────────────────────────────────────────────

function ColHeaders() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '8px', padding: '6px 14px', borderBottom: '1px solid #e2e8f0' }}>
      {['Trip ID', 'Type', 'Route', 'Planned', 'Start → Arrived', 'Est. km', 'Real km', 'Pax'].map((c, i) => (
        <div key={i} style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.05em' }}>{c}</div>
      ))}
    </div>
  )
}

// ─── TripDataRow ──────────────────────────────────────────────

function TripDataRow({ trip, reportLocsMap, indent, label }) {
  const pickup  = locName(reportLocsMap, trip.pickup_id)
  const dropoff = locName(reportLocsMap, trip.dropoff_id)
  const startTime = fmtTime(trip.started_at)
  const arrTime   = fmtTime(trip.arrived_at)
  const durMins   = durationMinutes(trip.started_at, trip.arrived_at)
  const late      = isLate(trip.pickup_min, trip.started_at)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '8px', padding: '8px 14px', paddingLeft: indent ? '28px' : '14px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '12px', background: indent ? '#fafafa' : 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
        {label && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: '#e2e8f0', color: '#475569', fontSize: '9px', fontWeight: '800', flexShrink: 0 }}>{label}</span>}
        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.trip_id || '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <TypePill trip={trip} />
        <HubIcon reportLocsMap={reportLocsMap} pickupId={trip.pickup_id} dropoffId={trip.dropoff_id} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{pickup}</span>
        <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
        <span style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dropoff}</span>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{minsToHHMM(trip.pickup_min)}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
        <span style={{ color: late ? '#D85A30' : '#374151', fontWeight: late ? '700' : '400' }}>{startTime || '—'}</span>
        <span style={{ color: '#cbd5e1', margin: '0 3px' }}>→</span>
        <span style={{ color: '#374151' }}>{arrTime || '—'}</span>
        {durMins != null && <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '4px' }}>({fmtDuration(durMins)})</span>}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{trip.estimated_km != null ? Number(trip.estimated_km).toFixed(1) : '—'}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: trip.actual_km != null ? '#16a34a' : '#94a3b8', fontWeight: trip.actual_km != null ? '700' : '400' }}>{trip.actual_km != null ? Number(trip.actual_km).toFixed(1) : '—'}</div>
      <div style={{ fontSize: '11px', color: '#374151' }}>{trip.pax_count != null ? trip.pax_count : '—'}</div>
    </div>
  )
}

// ─── MultiLegGroupRow ─────────────────────────────────────────

function MultiLegGroupRow({ legs, reportLocsMap }) {
  const [expanded, setExpanded] = useState(false)

  const pickupIds  = [...new Set(legs.map(l => l.pickup_id).filter(Boolean))]
  const dropoffIds = [...new Set(legs.map(l => l.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1

  const isTrueMixed = isMultiPickup && isMultiDropoff
  let routeStops = []
  if (isTrueMixed) {
    legs.forEach(l => {
      routeStops.push(locName(reportLocsMap, l.pickup_id))
      routeStops.push(locName(reportLocsMap, l.dropoff_id))
    })
  } else if (isMultiPickup) {
    legs.forEach(l => routeStops.push(locName(reportLocsMap, l.pickup_id)))
    routeStops.push(locName(reportLocsMap, legs[legs.length - 1].dropoff_id))
  } else {
    routeStops.push(locName(reportLocsMap, legs[0].pickup_id))
    legs.forEach(l => routeStops.push(locName(reportLocsMap, l.dropoff_id)))
  }
  const routeSummary = routeStops.filter((s, i) => i === 0 || s !== routeStops[i - 1]).join(' → ')

  const startTimes = legs.map(l => l.started_at).filter(Boolean).sort()
  const arrTimes   = legs.map(l => l.arrived_at).filter(Boolean).sort()
  const earliestStart = startTimes[0] || null
  const latestArr     = arrTimes[arrTimes.length - 1] || null
  const durMins       = durationMinutes(earliestStart, latestArr)

  const estKm  = legs.reduce((s, l) => s + (l.estimated_km != null ? Number(l.estimated_km) : 0), 0)
  const realKm = legs.reduce((s, l) => s + (l.actual_km != null ? Number(l.actual_km) : 0), 0)
  const hasEst  = legs.some(l => l.estimated_km != null)
  const hasReal = legs.some(l => l.actual_km != null)
  const totalPax = legs.reduce((s, l) => s + (l.pax_count ?? 0), 0)
  const maxPax   = isMultiPickup && !isMultiDropoff
    ? totalPax
    : Math.max(...legs.map(l => l.pax_count ?? 0))
  const firstLeg = legs[0]
  const late = isLate(firstLeg.pickup_min, firstLeg.started_at)

  return (
    <>
      <div onClick={() => setExpanded(e => !e)} style={{ display: 'grid', gridTemplateColumns: COL, gap: '8px', padding: '8px 14px', borderBottom: expanded ? 'none' : '1px solid #f1f5f9', alignItems: 'center', fontSize: '12px', background: '#fffbeb', cursor: 'pointer' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fef9c3' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fffbeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e3a5f' }}>{firstLeg.trip_id || '—'}</span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>({legs.length}) {expanded ? '▲' : '▼'}</span>
        </div>
        <div><TypePill isMultiLeg isMultiPickup={isMultiPickup} isMultiDropoff={isMultiDropoff} /></div>
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', color: '#0f172a', fontWeight: '500' }}>{routeSummary}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{minsToHHMM(firstLeg.pickup_min)}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
          <span style={{ color: late ? '#D85A30' : '#374151', fontWeight: late ? '700' : '400' }}>{fmtTime(earliestStart) || '—'}</span>
          <span style={{ color: '#cbd5e1', margin: '0 3px' }}>→</span>
          <span style={{ color: '#374151' }}>{fmtTime(latestArr) || '—'}</span>
          {durMins != null && <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '4px' }}>({fmtDuration(durMins)})</span>}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{hasEst ? estKm.toFixed(1) : '—'}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: hasReal ? '#16a34a' : '#94a3b8', fontWeight: hasReal ? '700' : '400' }}>{hasReal ? realKm.toFixed(1) : '—'}</div>
        <div style={{ fontSize: '11px', color: '#374151' }}>{maxPax > 0 ? maxPax : '—'}</div>
      </div>
      {expanded && legs.map((leg, idx) => (
        <TripDataRow key={leg.id || idx} trip={leg} reportLocsMap={reportLocsMap} indent label={String.fromCharCode(65 + idx)} />
      ))}
      {expanded && <div style={{ borderBottom: '1px solid #f1f5f9' }} />}
    </>
  )
}

// ─── DaySection ───────────────────────────────────────────────

function DaySection({ dateStr, trips, reportLocsMap }) {
  const groups = []
  const seen = new Set()
  for (const trip of trips) {
    if (trip.trip_group_id) {
      if (seen.has(trip.trip_group_id)) continue
      seen.add(trip.trip_group_id)
      groups.push({ type: 'multi', legs: trips.filter(t => t.trip_group_id === trip.trip_group_id) })
    } else {
      groups.push({ type: 'single', trip })
    }
  }

  const dayEst  = trips.reduce((s, t) => s + (t.estimated_km != null ? Number(t.estimated_km) : 0), 0)
  const dayReal = trips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0)
  const hasEst  = trips.some(t => t.estimated_km != null)
  const hasReal = trips.some(t => t.actual_km != null)
  const dayMins = trips.reduce((s, t) => s + (durationMinutes(t.started_at, t.arrived_at) || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569' }}>{fmtDateLabel(dateStr)}</div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>
          <span>{trips.length} trip{trips.length !== 1 ? 's' : ''}</span>
          <span>est. {hasEst ? `${dayEst.toFixed(1)} km` : '—'}</span>
          <span>real {hasReal ? `${dayReal.toFixed(1)} km` : '—'}</span>
          <span>{fmtTotalHours(dayMins)}</span>
        </div>
      </div>
      {groups.map((g, gi) =>
        g.type === 'multi'
          ? <MultiLegGroupRow key={g.legs[0].trip_group_id || gi} legs={g.legs} reportLocsMap={reportLocsMap} />
          : <TripDataRow key={g.trip.id || gi} trip={g.trip} reportLocsMap={reportLocsMap} />
      )}
    </div>
  )
}

// ─── DriverBlock ──────────────────────────────────────────────

function DriverBlock({ driverName, trips, reportLocsMap }) {
  const sorted = [...trips].sort((a, b) => {
    const da = a.date || isoDatePart(a.started_at) || ''
    const db = b.date || isoDatePart(b.started_at) || ''
    if (da < db) return -1
    if (da > db) return 1
    return (a.pickup_min ?? 9999) - (b.pickup_min ?? 9999)
  })

  const dateMap = {}
  for (const trip of sorted) {
    const d = trip.date || isoDatePart(trip.started_at) || 'unknown'
    if (!dateMap[d]) dateMap[d] = []
    dateMap[d].push(trip)
  }
  const dates = Object.keys(dateMap).sort()

  const noCaptainGoData = trips.every(t => !t.started_at)
  const totalEst  = trips.reduce((s, t) => s + (t.estimated_km != null ? Number(t.estimated_km) : 0), 0)
  const totalReal = trips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0)
  const hasEst    = trips.some(t => t.estimated_km != null)
  const hasReal   = trips.some(t => t.actual_km != null)
  const totalMins = trips.reduce((s, t) => s + (durationMinutes(t.started_at, t.arrived_at) || 0), 0)

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>👤</span>
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{driverName || 'No driver assigned'}</span>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>{trips.length} trip{trips.length !== 1 ? 's' : ''} · {dates.length} day{dates.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '20px', fontSize: '11px', fontFamily: 'monospace' }}>
          <span style={{ color: '#64748b' }}>est. {hasEst ? `${totalEst.toFixed(1)} km` : '—'}</span>
          <span style={{ color: hasReal ? '#16a34a' : '#64748b', fontWeight: hasReal ? '700' : '400' }}>real {hasReal ? `${totalReal.toFixed(1)} km` : '—'}</span>
          <span style={{ color: '#64748b' }}>{fmtTotalHours(totalMins)}</span>
        </div>
      </div>
      {noCaptainGoData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', background: '#FAEEDA', borderBottom: '1px solid #fde68a', fontSize: '11px', color: '#854F0B', fontWeight: '600' }}>
          <span>⚠</span>
          <span>Captain Go non utilizzato — km e orari reali non disponibili</span>
        </div>
      )}
      <ColHeaders />
      {dates.map(d => (
        <DaySection key={d} dateStr={d} trips={dateMap[d]} reportLocsMap={reportLocsMap} />
      ))}
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────

function FilterBar({ filterClass, setFilterClass, filterHub, setFilterHub }) {
  const PILL = { padding: '4px 10px', borderRadius: '999px', border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
  const PILL_A = { ...PILL, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>TYPE</span>
      {CLASS_TYPES.map(c => <button key={c.value} onClick={() => setFilterClass(c.value)} style={filterClass === c.value ? PILL_A : PILL}>{c.label}</button>)}
      <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>HUB</span>
      {HUB_TYPES.map(h => <button key={h.value} onClick={() => setFilterHub(h.value)} style={filterHub === h.value ? PILL_A : PILL}>{h.label}</button>)}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function ReportByDriver({
  trips = [],
  reportLocsMap = {},
  vhcMap = {},
  weekLabel = '',
  onBack,
  onTabChange,
  activeSubTab,
  onPrevWeek,
  onNextWeek,
}) {
  const isMobile = useIsMobile()
  const [filterClass, setFilterClass] = useState('ALL')
  const [filterHub,   setFilterHub]   = useState('ALL')

  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (filterClass !== 'ALL' && t.transfer_class !== filterClass) return false
      if (filterHub !== 'ALL') {
        const pt = locType(reportLocsMap, t.pickup_id)
        const dt = locType(reportLocsMap, t.dropoff_id)
        if (pt !== filterHub && dt !== filterHub) return false
      }
      return true
    })
  }, [trips, filterClass, filterHub, reportLocsMap])

  const driverMap = useMemo(() => {
    const map = {}
    for (const trip of filteredTrips) {
      const key = trip.driver_name || '__unassigned__'
      if (!map[key]) map[key] = []
      map[key].push(trip)
    }
    return map
  }, [filteredTrips])

  const driverKeys = Object.keys(driverMap).sort((a, b) => {
    if (a === '__unassigned__') return 1
    if (b === '__unassigned__') return -1
    return a.toLowerCase().localeCompare(b.toLowerCase())
  })

  if (isMobile) return <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Report disponibile solo su desktop</div>

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} style={BTN}>← Back to trips</button>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {[['summary', 'Summary'], ['byDriver', 'By driver'], ['byDay', 'By day']].map(([val, lbl]) => (
              <button key={val} onClick={() => onTabChange(val)}
                style={{ padding: '6px 16px', border: 'none', background: activeSubTab === val ? '#1e3a5f' : 'transparent', color: activeSubTab === val ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={onPrevWeek} style={BTN}>‹</button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', minWidth: '140px', textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={onNextWeek} style={BTN}>›</button>
        </div>
        <button onClick={() => window.print()} style={BTN}>🖨 Print</button>
      </div>

      <FilterBar filterClass={filterClass} setFilterClass={setFilterClass} filterHub={filterHub} setFilterHub={setFilterHub} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total trips', value: filteredTrips.length },
          { label: 'Est. km', value: filteredTrips.some(t => t.estimated_km != null) ? filteredTrips.reduce((s, t) => s + (t.estimated_km != null ? Number(t.estimated_km) : 0), 0).toFixed(1) : '—' },
          { label: 'Real km', value: filteredTrips.some(t => t.actual_km != null) ? filteredTrips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0).toFixed(1) : '—', green: filteredTrips.some(t => t.actual_km != null) },
          { label: 'Total hours', value: fmtTotalHours(filteredTrips.reduce((s, t) => s + (durationMinutes(t.started_at, t.arrived_at) || 0), 0)) },
          { label: 'Active drivers', value: new Set(filteredTrips.map(t => t.driver_name).filter(Boolean)).size },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: c.green ? '#16a34a' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {driverKeys.length === 0
        ? <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '40px 0' }}>No trips for this week.</div>
        : driverKeys.map(key => (
            <DriverBlock key={key} driverName={key === '__unassigned__' ? null : key} trips={driverMap[key]} reportLocsMap={reportLocsMap} />
          ))
      }
    </div>
  )
}
