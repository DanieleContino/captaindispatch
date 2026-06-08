'use client'

import { useState } from 'react'
import { useIsMobile } from '../../../../lib/useIsMobile'

// ─── Helpers ──────────────────────────────────────────────────

function fmtTime(isoStr) {
  if (!isoStr) return null
  try {
    const d = new Date(isoStr)
    const h = String(d.getUTCHours()).padStart(2, '0')
    const m = String(d.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  } catch {
    return null
  }
}

function durationMinutes(startedAt, arrivedAt) {
  if (!startedAt || !arrivedAt) return null
  try {
    const diff = new Date(arrivedAt) - new Date(startedAt)
    if (diff < 0) return null
    return Math.round(diff / 60000)
  } catch {
    return null
  }
}

function fmtDuration(mins) {
  if (mins === null || mins === undefined) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtTotalHours(totalMins) {
  if (!totalMins) return '0h'
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function isoDatePart(isoStr) {
  if (!isoStr) return null
  return isoStr.slice(0, 10)
}

function fmtDayLabel(dateStr) {
  // Returns e.g. "MON 9 JUN"
  if (!dateStr) return dateStr
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()
    return `${weekday} ${day} ${month}`
  } catch {
    return dateStr
  }
}

// ─── Grand Totals ─────────────────────────────────────────────

function GrandTotals({ trips }) {
  const totalTrips = trips.length
  const totalKm = trips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0)
  const totalMins = trips.reduce((s, t) => {
    const d = durationMinutes(t.started_at, t.arrived_at)
    return s + (d != null ? d : 0)
  }, 0)
  const activeDrivers = new Set(
    trips
      .map(t => t.driver_crew_id || t.driver_name)
      .filter(id => id != null && id !== '__unassigned__')
  ).size

  const cards = [
    { label: 'Total Trips', value: totalTrips, icon: '🗓' },
    { label: 'Total km', value: totalKm > 0 ? `${totalKm.toFixed(1)} km` : '—', icon: '📍' },
    { label: 'Total Hours', value: fmtTotalHours(totalMins), icon: '⏱' },
    { label: 'Active Drivers', value: activeDrivers, icon: '👤' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.06em' }}>
            {c.icon} {c.label}
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Status Icon ──────────────────────────────────────────────

function StatusIcon({ trip }) {
  const done = trip.started_at && trip.arrived_at
  if (done) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '22px', height: '22px', borderRadius: '50%',
        background: '#EAF3DE', color: '#3B6D11', fontSize: '12px', fontWeight: '900',
      }}>✓</span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '22px', height: '22px', borderRadius: '4px',
      background: '#FAEEDA', color: '#854F0B', fontSize: '12px', fontWeight: '900',
    }}>⚠</span>
  )
}

// ─── Multi-leg pill ───────────────────────────────────────────

function MultiLegPill({ isMultiPickup, isMultiDropoff }) {
  if (isMultiPickup && isMultiDropoff) {
    return (
      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800',
        background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' }}>
        MIXED
      </span>
    )
  }
  if (isMultiPickup) {
    return (
      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800',
        background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
        MULTI-PKP
      </span>
    )
  }
  if (isMultiDropoff) {
    return (
      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800',
        background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>
        MULTI-DRP
      </span>
    )
  }
  return null
}

// ─── Column header row ────────────────────────────────────────

// Columns: Trip ID | Driver | Route | Start → Arrived | Km | Pax | status
const COL_WIDTHS = '120px 130px 1fr 160px 80px 50px 32px'

function ColHeaders() {
  const cols = ['Trip ID', 'Driver', 'Route', 'Start → Arrived', 'Km', 'Pax', '']
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: COL_WIDTHS,
      gap: '8px',
      padding: '6px 14px',
      borderBottom: '1px solid #e2e8f0',
    }}>
      {cols.map((c, i) => (
        <div key={i} style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.06em' }}>
          {c}
        </div>
      ))}
    </div>
  )
}

// ─── Single trip row ──────────────────────────────────────────

function TripDataRow({ trip, locsMap, vhcMap, indent, label }) {
  const pickup = locsMap[trip.pickup_id] || trip.pickup_id || '—'
  const dropoff = locsMap[trip.dropoff_id] || trip.dropoff_id || '—'
  const startTime = fmtTime(trip.started_at)
  const arrTime = fmtTime(trip.arrived_at)
  const durMins = durationMinutes(trip.started_at, trip.arrived_at)
  const driverName = trip.driver_name || '—'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: COL_WIDTHS,
      gap: '8px',
      padding: '8px 14px',
      paddingLeft: indent ? '32px' : '14px',
      borderBottom: '1px solid #f1f5f9',
      alignItems: 'center',
      fontSize: '12px',
      background: indent ? '#fafafa' : 'white',
    }}>
      {/* Trip ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        {label && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '18px', height: '18px', borderRadius: '3px',
            background: '#e2e8f0', color: '#475569', fontSize: '10px', fontWeight: '800',
            flexShrink: 0,
          }}>{label}</span>
        )}
        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {trip.trip_id || '—'}
        </span>
      </div>

      {/* Driver */}
      <div style={{ fontSize: '11px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {driverName}
      </div>

      {/* Route */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{pickup}</span>
        <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
        <span style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dropoff}</span>
      </div>

      {/* Start → Arrived */}
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>
        {startTime ? startTime : '—'}
        <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>
        {arrTime ? arrTime : '—'}
        {durMins != null && (
          <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '6px' }}>({fmtDuration(durMins)})</span>
        )}
      </div>

      {/* Km */}
      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#374151' }}>
        {trip.actual_km != null ? `${Number(trip.actual_km).toFixed(1)}` : '—'}
      </div>

      {/* Pax */}
      <div style={{ fontSize: '11px', color: '#374151' }}>
        {trip.pax_count != null ? trip.pax_count : '—'}
      </div>

      {/* Status */}
      <div>
        <StatusIcon trip={trip} />
      </div>
    </div>
  )
}

// ─── Multi-leg group row ──────────────────────────────────────

function MultiLegGroupRow({ legs, locsMap, vhcMap }) {
  const [expanded, setExpanded] = useState(false)

  const pickupIds = [...new Set(legs.map(l => l.pickup_id).filter(Boolean))]
  const dropoffIds = [...new Set(legs.map(l => l.dropoff_id).filter(Boolean))]
  const isMultiPickup = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1

  const totalKm = legs.reduce((s, l) => s + (l.actual_km != null ? Number(l.actual_km) : 0), 0)
  const hasAnyKm = legs.some(l => l.actual_km != null)

  const startTimes = legs.map(l => l.started_at).filter(Boolean).sort()
  const arrTimes = legs.map(l => l.arrived_at).filter(Boolean).sort()
  const earliestStart = startTimes[0] || null
  const latestArr = arrTimes[arrTimes.length - 1] || null

  const durMins = durationMinutes(earliestStart, latestArr)

  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const allStops = legs.map(l => locsMap[l.pickup_id] || l.pickup_id || '—')
  allStops.push(locsMap[lastLeg.dropoff_id] || lastLeg.dropoff_id || '—')
  const uniqueStops = allStops.filter((s, i) => i === 0 || s !== allStops[i - 1])
  const routeSummary = uniqueStops.join(' → ')
  const driverName = firstLeg.driver_name || '—'

  return (
    <>
      {/* Multi-leg summary row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'grid',
          gridTemplateColumns: COL_WIDTHS,
          gap: '8px',
          padding: '8px 14px',
          borderBottom: expanded ? 'none' : '1px solid #f1f5f9',
          alignItems: 'center',
          fontSize: '12px',
          background: '#fffbeb',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fef9c3' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fffbeb' }}
      >
        {/* Trip ID + pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {firstLeg.trip_id || '—'}
          </span>
          <MultiLegPill isMultiPickup={isMultiPickup} isMultiDropoff={isMultiDropoff} />
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>({legs.length} legs)</span>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '2px' }}>{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Driver */}
        <div style={{ fontSize: '11px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {driverName}
        </div>

        {/* Route summary */}
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', color: '#0f172a', fontWeight: '500' }}>
          {routeSummary}
        </div>

        {/* Time range */}
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>
          {fmtTime(earliestStart) || '—'}
          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>
          {fmtTime(latestArr) || '—'}
          {durMins != null && (
            <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '6px' }}>({fmtDuration(durMins)})</span>
          )}
        </div>

        {/* Km */}
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#374151' }}>
          {hasAnyKm ? totalKm.toFixed(1) : '—'}
        </div>

        {/* Pax */}
        <div style={{ fontSize: '11px', color: '#374151' }}>
          {(() => {
            const maxPax = Math.max(...legs.map(l => l.pax_count ?? 0))
            return maxPax > 0 ? maxPax : '—'
          })()}
        </div>

        {/* Status */}
        <div>
          <StatusIcon trip={firstLeg} />
        </div>
      </div>

      {/* Expanded legs */}
      {expanded && legs.map((leg, idx) => (
        <TripDataRow
          key={leg.id || idx}
          trip={leg}
          locsMap={locsMap}
          vhcMap={vhcMap}
          indent
          label={String.fromCharCode(65 + idx)}
        />
      ))}
      {expanded && (
        <div style={{ borderBottom: '1px solid #f1f5f9' }} />
      )}
    </>
  )
}

// ─── Day block ────────────────────────────────────────────────

function DayBlock({ dateStr, trips, locsMap, vhcMap }) {
  // Sort trips by pickup_min ASC nulls last
  const sorted = [...trips].sort((a, b) => (a.pickup_min ?? 9999) - (b.pickup_min ?? 9999))

  // Sub-group by trip_group_id
  const groups = []
  const seen = new Set()

  for (const trip of sorted) {
    if (trip.trip_group_id) {
      if (seen.has(trip.trip_group_id)) continue
      seen.add(trip.trip_group_id)
      const legGroup = sorted.filter(t => t.trip_group_id === trip.trip_group_id)
      groups.push({ type: 'multi', legs: legGroup })
    } else {
      groups.push({ type: 'single', trip })
    }
  }

  // Day totals
  const dayKm = trips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0)
  const hasAnyKm = trips.some(t => t.actual_km != null)
  const dayMins = trips.reduce((s, t) => {
    const d = durationMinutes(t.started_at, t.arrived_at)
    return s + (d != null ? d : 0)
  }, 0)
  const tripCount = trips.length
  const distinctDrivers = new Set(
    trips.map(t => t.driver_crew_id).filter(id => id != null)
  ).size

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      marginBottom: '16px',
      overflow: 'hidden',
    }}>
      {/* Day header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', letterSpacing: '0.04em' }}>
          {fmtDayLabel(dateStr)}
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>
          <span>{tripCount} trip{tripCount !== 1 ? 's' : ''}</span>
          <span style={{ fontFamily: 'monospace' }}>{hasAnyKm ? `${dayKm.toFixed(1)} km` : '—'}</span>
          <span>{fmtTotalHours(dayMins)}</span>
          <span>{distinctDrivers} driver{distinctDrivers !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Column headers */}
      <ColHeaders />

      {/* Trip rows */}
      {groups.map((g, gi) => {
        if (g.type === 'multi') {
          return <MultiLegGroupRow key={g.legs[0].trip_group_id || gi} legs={g.legs} locsMap={locsMap} vhcMap={vhcMap} />
        }
        return <TripDataRow key={g.trip.id || gi} trip={g.trip} locsMap={locsMap} vhcMap={vhcMap} />
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function ReportByDay({
  trips = [],
  locsMap = {},
  vhcMap = {},
  weekLabel = '',
  onBack,
  onTabChange,
  activeSubTab,
  onPrevWeek,
  onNextWeek,
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
        Report disponibile solo su desktop
      </div>
    )
  }

  // 1. Group trips by date ASC
  const dateMap = {}
  for (const trip of trips) {
    const d = trip.date || isoDatePart(trip.started_at) || 'unknown'
    if (!dateMap[d]) dateMap[d] = []
    dateMap[d].push(trip)
  }
  const dates = Object.keys(dateMap).sort()

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '20px 24px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        {/* Left: back + sub-tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px', borderRadius: '7px', border: '1px solid #e2e8f0',
              background: 'white', color: '#374151', fontSize: '12px', fontWeight: '700',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            ← Back to Trips
          </button>

          <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {['weekly', 'daily'].map(tab => (
              <button
                key={tab}
                onClick={() => onTabChange && onTabChange(tab)}
                style={{
                  padding: '6px 16px',
                  border: 'none',
                  background: activeSubTab === tab ? '#1e3a5f' : 'transparent',
                  color: activeSubTab === tab ? 'white' : '#64748b',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  letterSpacing: '0.02em',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Center: week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onPrevWeek}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            ‹
          </button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', minWidth: '140px', textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button
            onClick={onNextWeek}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            ›
          </button>
        </div>

        {/* Right: print */}
        <button
          onClick={() => window.print()}
          style={{
            padding: '6px 16px', borderRadius: '7px', border: '1px solid #e2e8f0',
            background: 'white', color: '#374151', fontSize: '12px', fontWeight: '700',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
          }}
        >
          🖨 Print
        </button>
      </div>

      {/* Grand totals */}
      <GrandTotals trips={trips} />

      {/* Day blocks */}
      {dates.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '40px 0' }}>
          No trips for this week.
        </div>
      ) : (
        dates.map(d => (
          <DayBlock
            key={d}
            dateStr={d}
            trips={dateMap[d]}
            locsMap={locsMap}
            vhcMap={vhcMap}
          />
        ))
      )}
    </div>
  )
}
