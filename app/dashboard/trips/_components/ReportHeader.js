'use client'

import { useState } from 'react'

const BTN = { padding: '6px 13px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }
const BTN_PRINT = { padding: '6px 13px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }
const PILL = { padding: '4px 10px', borderRadius: '999px', border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
const PILL_A = { ...PILL, background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }

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

function DriverMultiSelect({ drivers, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const allSelected = selected.length === 0
  const toggle = (name) => {
    if (selected.includes(name)) onChange(selected.filter(d => d !== name))
    else onChange([...selected, name])
  }
  const label = allSelected ? 'All drivers' : selected.length === 1 ? (selected[0] === '__unassigned__' ? 'No driver' : selected[0]) : `${selected.length} drivers`
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: allSelected ? 'white' : '#1e3a5f', color: allSelected ? '#374151' : 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>👤</span><span>{label}</span><span style={{ fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '36px', left: 0, zIndex: 50, background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', minWidth: '220px', maxHeight: '280px', overflowY: 'auto', padding: '6px 0' }}>
          <div onClick={() => { onChange([]); setOpen(false) }}
            style={{ padding: '7px 14px', fontSize: '12px', fontWeight: '700', color: allSelected ? '#1e3a5f' : '#374151', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: allSelected ? '#eff6ff' : 'white' }}>
            ✓ All drivers
          </div>
          {drivers.map(d => {
            const key = d || '__unassigned__'
            const lbl = d || 'No driver assigned'
            const isSel = selected.includes(key)
            return (
              <div key={key} onClick={() => toggle(key)}
                style={{ padding: '7px 14px', fontSize: '12px', color: '#374151', cursor: 'pointer', background: isSel ? '#eff6ff' : 'white', fontWeight: isSel ? '700' : '400', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid #e2e8f0', background: isSel ? '#1e3a5f' : 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: 'white', fontSize: '9px', fontWeight: '900' }}>✓</span>}
                </span>
                {lbl}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ReportHeader({
  activeSubTab,
  onTabChange,
  onBack,
  weekLabel,
  onPrevWeek,
  onNextWeek,
  reportDate,
  onDateChange,
  availableDates = [],
  summaryMode,
  setSummaryMode,
  filterClass,
  setFilterClass,
  filterHub,
  setFilterHub,
  allDriverNames = [],
  selectedDrivers = [],
  onDriversChange,
}) {
  const showDriverSelect = activeSubTab === 'byDriver' || activeSubTab === 'byDay'
  const showSummaryMode  = activeSubTab === 'summary'

  const dateNav = activeSubTab === 'byDay' ? (
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
  ) : summaryMode === 'daily' ? (
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
  )

  return (
    <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '0px', zIndex: 29 }}>
      {/* Riga 1 — titolo + tab + navigazione + print */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginRight: '4px' }}>Trips Report</span>
        <button onClick={onBack} style={BTN}>← Back to trips</button>
        <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {[['summary', 'Summary'], ['byDriver', 'By driver'], ['byDay', 'By day']].map(([val, lbl]) => (
            <button key={val} onClick={() => onTabChange(val)}
              style={{ padding: '6px 16px', border: 'none', background: activeSubTab === val ? '#1e3a5f' : 'transparent', color: activeSubTab === val ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
        {showSummaryMode && (
          <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {[['weekly', 'Weekly'], ['daily', 'Daily']].map(([val, lbl]) => (
              <button key={val} onClick={() => setSummaryMode(val)}
                style={{ padding: '6px 16px', border: 'none', background: summaryMode === val ? '#0f2340' : 'transparent', color: summaryMode === val ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                {lbl}
              </button>
            ))}
          </div>
        )}
        {dateNav}
        <button style={BTN_PRINT} onClick={() => window.print()}>🖨 Print / PDF</button>
      </div>
      {/* Riga 2 — driver select + filtri */}
      <div style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {showDriverSelect && (
          <DriverMultiSelect
            drivers={allDriverNames}
            selected={selectedDrivers}
            onChange={onDriversChange}
          />
        )}
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>TYPE</span>
        {CLASS_TYPES.map(c => (
          <button key={c.value} onClick={() => setFilterClass(c.value)} style={filterClass === c.value ? PILL_A : PILL}>{c.label}</button>
        ))}
        <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>HUB</span>
        {HUB_TYPES.map(h => (
          <button key={h.value} onClick={() => setFilterHub(h.value)} style={filterHub === h.value ? PILL_A : PILL}>{h.label}</button>
        ))}
      </div>
    </div>
  )
}
