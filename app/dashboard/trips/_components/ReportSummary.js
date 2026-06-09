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

function durationMinutes(startedAt, arrivedAt) {
  if (!startedAt || !arrivedAt) return null
  try {
    const diff = new Date(arrivedAt) - new Date(startedAt)
    if (diff < 0) return null
    return Math.round(diff / 60000)
  } catch { return null }
}

function fmtTotalHours(totalMins) {
  if (!totalMins) return '—'
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtDayLabel(dateStr) {
  if (!dateStr) return dateStr
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()
    return `${weekday} ${day} ${month}`
  } catch { return dateStr }
}

const HUB_TYPES = [
  { value: 'ALL',           label: 'All hubs' },
  { value: 'AIRPORT',       label: '✈ Airport' },
  { value: 'TRAIN_STATION', label: '🚂 Train' },
  { value: 'BUS_STATION',   label: '🚌 Bus' },
  { value: 'PORT',          label: '⚓ Port' },
]

const CLASS_TYPES = [
  { value: 'ALL',        label: 'All' },
  { value: 'ARRIVAL',    label: 'Arrival' },
  { value: 'DEPARTURE',  label: 'Departure' },
  { value: 'STANDARD',   label: 'Standard' },
]

const TOP_BAR = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }
const BTN = { padding: '6px 13px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }
const BTN_ACTIVE = { ...BTN, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }
const BTN_PILL = { padding: '4px 12px', borderRadius: '999px', border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
const BTN_PILL_ACTIVE = { ...BTN_PILL, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }

// ─── TopBar ───────────────────────────────────────────────────

function TopBar({ activeSubTab, onTabChange, onBack, weekLabel, onPrevWeek, onNextWeek, summaryMode, setSummaryMode, reportDate, onDateChange, availableDates }) {
  return (
    <div style={TOP_BAR}>
      <span style={{ fontSize: '20px' }}>📊</span>
      <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginRight: '4px' }}>Trips Report</span>
      <button style={BTN} onClick={onBack}>← Back to trips</button>

      <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {[['summary', 'Summary'], ['byDriver', 'By driver'], ['byDay', 'By day']].map(([val, lbl]) => (
          <button key={val} onClick={() => onTabChange(val)}
            style={{ padding: '6px 16px', border: 'none', background: activeSubTab === val ? '#1e3a5f' : 'transparent', color: activeSubTab === val ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {[['weekly', 'Weekly'], ['daily', 'Daily']].map(([val, lbl]) => (
          <button key={val} onClick={() => setSummaryMode(val)}
            style={{ padding: '6px 16px', border: 'none', background: summaryMode === val ? '#0f2340' : 'transparent', color: summaryMode === val ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            {lbl}
          </button>
        ))}
      </div>

      {summaryMode === 'daily' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <button style={BTN} onClick={() => {
            const idx = availableDates.indexOf(reportDate)
            if (idx > 0) onDateChange(availableDates[idx - 1])
          }}>‹</button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', minWidth: '140px', textAlign: 'center' }}>
            {fmtDayLabel(reportDate)}
          </span>
          <button style={BTN} onClick={() => {
            const idx = availableDates.indexOf(reportDate)
            if (idx < availableDates.length - 1) onDateChange(availableDates[idx + 1])
          }}>›</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <button style={BTN} onClick={onPrevWeek}>‹</button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', minWidth: '140px', textAlign: 'center' }}>{weekLabel}</span>
          <button style={BTN} onClick={onNextWeek}>›</button>
        </div>
      )}

      <button style={{ padding: '6px 13px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }} onClick={() => window.print()}>🖨 Print / PDF</button>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────

function FilterBar({ filterClass, setFilterClass, filterHub, setFilterHub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>TYPE</span>
      {CLASS_TYPES.map(c => (
        <button key={c.value} onClick={() => setFilterClass(c.value)}
          style={filterClass === c.value ? BTN_PILL_ACTIVE : BTN_PILL}>
          {c.label}
        </button>
      ))}
      <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>HUB</span>
      {HUB_TYPES.map(h => (
        <button key={h.value} onClick={() => setFilterHub(h.value)}
          style={filterHub === h.value ? BTN_PILL_ACTIVE : BTN_PILL}>
          {h.label}
        </button>
      ))}
    </div>
  )
}

// ─── GrandTotals ──────────────────────────────────────────────

function GrandTotals({ trips }) {
  const totalTrips = trips.length
  const estKm = trips.reduce((s, t) => s + (t.estimated_km != null ? Number(t.estimated_km) : 0), 0)
  const realKm = trips.reduce((s, t) => s + (t.actual_km != null ? Number(t.actual_km) : 0), 0)
  const hasEst = trips.some(t => t.estimated_km != null)
  const hasReal = trips.some(t => t.actual_km != null)
  const totalMins = trips.reduce((s, t) => s + (durationMinutes(t.started_at, t.arrived_at) || 0), 0)
  const drivers = new Set(trips.map(t => t.driver_name).filter(Boolean)).size

  const cards = [
    { label: 'Total trips', value: totalTrips },
    { label: 'Est. km', value: hasEst ? `${estKm.toFixed(1)}` : '—' },
    { label: 'Real km', value: hasReal ? `${realKm.toFixed(1)}` : '—', green: hasReal },
    { label: 'Total hours', value: fmtTotalHours(totalMins) },
    { label: 'Active drivers', value: drivers },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px' }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: c.green ? '#16a34a' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Summary Table ────────────────────────────────────────────

function SummaryTable({ rows, mode }) {
  const totalTrips = rows.reduce((s, r) => s + r.trips, 0)
  const totalEst = rows.reduce((s, r) => s + r.estKm, 0)
  const totalReal = rows.reduce((s, r) => s + r.realKm, 0)
  const totalMins = rows.reduce((s, r) => s + r.totalMins, 0)
  const hasEst = rows.some(r => r.estKm > 0)
  const hasReal = rows.some(r => r.realKm > 0)

  const TH = { fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }
  const TD = { fontSize: '12px', color: '#374151', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontVariantNumeric: 'tabular-nums' }
  const TDR = { ...TD, textAlign: 'right' }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>Driver</th>
            <th style={{ ...TH, textAlign: 'right' }}>Trips</th>
            {mode === 'weekly' && <th style={{ ...TH, textAlign: 'right' }}>Days</th>}
            <th style={{ ...TH, textAlign: 'right' }}>Est. km</th>
            <th style={{ ...TH, textAlign: 'right' }}>Real km</th>
            <th style={{ ...TH, textAlign: 'right' }}>Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.driver || i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <td style={{ ...TD, fontWeight: '700', color: '#1e293b' }}>{r.driver || 'No driver assigned'}</td>
              <td style={TDR}>{r.trips}</td>
              {mode === 'weekly' && <td style={TDR}>{r.days}</td>}
              <td style={{ ...TDR, color: '#64748b' }}>{r.estKm > 0 ? r.estKm.toFixed(1) : '—'}</td>
              <td style={{ ...TDR, color: r.realKm > 0 ? '#16a34a' : '#374151', fontWeight: r.realKm > 0 ? '700' : '400' }}>{r.realKm > 0 ? r.realKm.toFixed(1) : '—'}</td>
              <td style={TDR}>{fmtTotalHours(r.totalMins)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
            <td style={{ ...TD, fontWeight: '900', color: '#0f172a' }}>TOTAL</td>
            <td style={{ ...TDR, fontWeight: '900', color: '#0f172a' }}>{totalTrips}</td>
            {mode === 'weekly' && <td style={TDR}>—</td>}
            <td style={{ ...TDR, fontWeight: '700', color: '#64748b' }}>{hasEst ? totalEst.toFixed(1) : '—'}</td>
            <td style={{ ...TDR, fontWeight: '900', color: hasReal ? '#16a34a' : '#374151' }}>{hasReal ? totalReal.toFixed(1) : '—'}</td>
            <td style={{ ...TDR, fontWeight: '700', color: '#0f172a' }}>{fmtTotalHours(totalMins)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function ReportSummary({
  trips = [],
  reportLocsMap = {},
  weekLabel = '',
  onBack,
  onTabChange,
  activeSubTab,
  onPrevWeek,
  onNextWeek,
  reportDate,
  onDateChange,
}) {
  const isMobile = useIsMobile()
  const [summaryMode, setSummaryMode] = useState('weekly')
  const [filterClass, setFilterClass] = useState('ALL')
  const [filterHub, setFilterHub] = useState('ALL')

  const availableDates = useMemo(() => {
    const dates = [...new Set(trips.map(t => t.date).filter(Boolean))].sort()
    return dates
  }, [trips])

  // Se reportDate non è tra le date disponibili, usa la prima
  const activeDate = availableDates.includes(reportDate) ? reportDate : (availableDates[0] || reportDate)

  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (filterClass !== 'ALL' && t.transfer_class !== filterClass) return false
      if (filterHub !== 'ALL') {
        const pickupType = reportLocsMap[t.pickup_id]?.location_type || 'OTHER'
        const dropoffType = reportLocsMap[t.dropoff_id]?.location_type || 'OTHER'
        if (pickupType !== filterHub && dropoffType !== filterHub) return false
      }
      return true
    })
  }, [trips, filterClass, filterHub, reportLocsMap])

  const sourceTrips = useMemo(() => {
    if (summaryMode === 'daily') {
      return filteredTrips.filter(t => t.date === activeDate)
    }
    return filteredTrips
  }, [filteredTrips, summaryMode, activeDate])

  const rows = useMemo(() => {
    const map = {}
    for (const t of sourceTrips) {
      const key = t.driver_name || '__unassigned__'
      if (!map[key]) map[key] = { driver: t.driver_name || null, trips: 0, days: new Set(), estKm: 0, realKm: 0, totalMins: 0 }
      map[key].trips += 1
      if (t.date) map[key].days.add(t.date)
      if (t.estimated_km != null) map[key].estKm += Number(t.estimated_km)
      if (t.actual_km != null) map[key].realKm += Number(t.actual_km)
      const mins = durationMinutes(t.started_at, t.arrived_at)
      if (mins) map[key].totalMins += mins
    }
    return Object.values(map)
      .map(r => ({ ...r, days: r.days.size }))
      .sort((a, b) => {
        if (!a.driver) return 1
        if (!b.driver) return -1
        return a.driver.localeCompare(b.driver)
      })
  }, [sourceTrips])

  if (isMobile) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
        Report disponibile solo su desktop
      </div>
    )
  }

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '20px 24px' }}>
      <TopBar
        activeSubTab={activeSubTab}
        onTabChange={onTabChange}
        onBack={onBack}
        weekLabel={weekLabel}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        summaryMode={summaryMode}
        setSummaryMode={setSummaryMode}
        reportDate={activeDate}
        onDateChange={onDateChange}
        availableDates={availableDates}
      />
      <FilterBar
        filterClass={filterClass}
        setFilterClass={setFilterClass}
        filterHub={filterHub}
        setFilterHub={setFilterHub}
      />
      <GrandTotals trips={sourceTrips} />
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '40px 0' }}>
          No trips for this period.
        </div>
      ) : (
        <SummaryTable rows={rows} mode={summaryMode} />
      )}
    </div>
  )
}
