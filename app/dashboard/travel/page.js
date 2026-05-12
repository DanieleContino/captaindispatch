'use client'

/**
 * /dashboard/travel
 *
 * Travel Coordinator view — all travel_movements grouped by date and section
 * (FLIGHT / TRAIN / OA / GROUND), replicating the DIG Travel Calendar structure.
 * READ-ONLY for now.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'

// ─── Date helpers ─────────────────────────────────────────────
function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function isoAdd(dateStr, n) {
  const dt = new Date(dateStr + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}
function fmtDateHeader(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function fmtTime(t) {
  if (!t) return '–'
  return typeof t === 'string' ? t.slice(0, 5) : '–'
}

// ─── Section definitions ───────────────────────────────────────
const SECTIONS = [
  { key: 'FLIGHT', icon: '✈️', label: 'FLIGHT',           types: ['FLIGHT'] },
  { key: 'TRAIN',  icon: '🚂', label: 'TRAIN',            types: ['TRAIN'] },
  { key: 'OA',     icon: '🚗', label: 'OA / SELF',        types: ['OA', 'SELF'] },
  { key: 'GROUND', icon: '🚐', label: 'GROUND TRANSPORT', types: ['GROUND'] },
]

// ─── SectionTable component ────────────────────────────────────
function SectionTable({ section, rows, today }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', background: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0',
        borderBottom: 'none',
      }}>
        <span style={{ fontSize: '13px' }}>{section.icon}</span>
        <span style={{
          fontSize: '12px', fontWeight: '800', color: '#374151',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {section.label}
        </span>
        <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>
          {rows.length}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          border: '1px solid #e2e8f0', borderTop: 'none',
          borderRadius: '0 0 8px 8px', overflow: 'hidden',
        }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['Dir', 'Name', 'Role', 'p/up dep', 'From', 'Dep', 'To', 'Arr',
                'Travel #', 'p/up arr', '🚐', 'Match'].map(h => (
                <th key={h} style={{
                  padding: '6px 10px', fontSize: '10px', fontWeight: '800',
                  color: '#64748b', textAlign: 'left', whiteSpace: 'nowrap',
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  borderBottom: '1px solid #e2e8f0',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const isUnmatched = m.match_status === 'unmatched'
              const isIN = m.direction === 'IN'
              const isToday = m.travel_date === today
              const displayName = m.crew?.full_name || m.full_name_raw || '–'
              const bgColor = isUnmatched ? '#fef2f2'
                            : isIN ? '#f0fdf4' : '#fff7ed'
              const borderColor = isUnmatched ? '#ef4444'
                                : isIN ? '#22c55e' : '#f97316'
              return (
                <tr key={m.id} style={{
                  background: bgColor,
                  borderLeft: `3px solid ${borderColor}`,
                  outline: isToday ? '2px solid #fbbf24' : 'none',
                  outlineOffset: '-2px',
                }}>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px', fontWeight: '800',
                    color: isIN ? '#15803d' : '#c2410c', whiteSpace: 'nowrap',
                  }}>
                    {isIN ? '↓ IN' : '↑ OUT'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '12px',
                    fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap',
                  }}>
                    {displayName}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    color: '#64748b', whiteSpace: 'nowrap',
                  }}>
                    {m.crew?.role || '–'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    color: '#374151', whiteSpace: 'nowrap',
                  }}>
                    {m.pickup_dep || '–'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap',
                  }}>
                    {m.from_location || '–'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap',
                  }}>
                    {fmtTime(m.from_time)}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap',
                  }}>
                    {m.to_location || '–'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap',
                  }}>
                    {fmtTime(m.to_time)}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    fontFamily: 'monospace', fontWeight: '700',
                    color: '#2563eb', whiteSpace: 'nowrap',
                  }}>
                    {m.travel_number || '–'}
                  </td>
                  <td style={{
                    padding: '7px 10px', fontSize: '11px',
                    color: '#374151', whiteSpace: 'nowrap',
                  }}>
                    {m.pickup_arr || '–'}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    {m.needs_transport && (
                      <span style={{
                        fontSize: '10px', fontWeight: '800',
                        color: '#1d4ed8', background: '#eff6ff',
                        border: '1px solid #bfdbfe', borderRadius: '4px',
                        padding: '1px 5px',
                      }}>🚐</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    {isUnmatched
                      ? <span style={{ fontSize: '10px', fontWeight: '800', color: '#dc2626' }}>❌</span>
                      : <span style={{ fontSize: '10px' }}>✅</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────
export default function TravelPage() {
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()
  const isMobile = useIsMobile()

  const today = isoToday()

  // Auth
  const [user, setUser] = useState(null)

  // Data
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)

  // Date window
  const [windowStart, setWindowStart] = useState(() => isoAdd(isoToday(), -3))
  const [windowEnd,   setWindowEnd]   = useState(() => isoAdd(isoToday(), 10))

  // Filters
  const [search,      setSearch]      = useState('')
  const [filterDir,   setFilterDir]   = useState('ALL')   // ALL | IN | OUT
  const [filterType,  setFilterType]  = useState('ALL')   // ALL | FLIGHT | TRAIN | OA | GROUND
  const [filterMatch, setFilterMatch] = useState('ALL')   // ALL | matched | unmatched

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
  }, [])

  // Data loader
  const loadData = useCallback(async (start, end) => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase
      .from('travel_movements')
      .select(`
        id, crew_id, full_name_raw, travel_date, direction,
        travel_type, travel_number, from_location, from_time,
        to_location, to_time, needs_transport, match_status,
        pickup_dep, pickup_arr,
        crew:crew_id(full_name, role, department)
      `)
      .eq('production_id', PRODUCTION_ID)
      .gte('travel_date', start)
      .lte('travel_date', end)
      .order('travel_date', { ascending: true })
      .order('from_time',   { ascending: true, nullsLast: true })
    setMovements(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  // Initial load and reload on window change
  useEffect(() => {
    if (user) loadData(windowStart, windowEnd)
  }, [user, windowStart, windowEnd, loadData])

  // ── Window navigation ──────────────────────────────────────
  function shiftWindow(n) {
    setWindowStart(s => isoAdd(s, n))
    setWindowEnd(e => isoAdd(e, n))
  }
  function resetWindow() {
    setWindowStart(isoAdd(isoToday(), -3))
    setWindowEnd(isoAdd(isoToday(), 10))
  }
  function pickDate(dateStr) {
    setWindowStart(isoAdd(dateStr, -3))
    setWindowEnd(isoAdd(dateStr, 10))
  }

  // ── Filters ────────────────────────────────────────────────
  const isFilterActive = search || filterDir !== 'ALL' || filterType !== 'ALL' || filterMatch !== 'ALL'

  function resetFilters() {
    setSearch('')
    setFilterDir('ALL')
    setFilterType('ALL')
    setFilterMatch('ALL')
  }

  const filtered = useMemo(() => {
    return movements.filter(m => {
      const name = (m.crew?.full_name || m.full_name_raw || '').toLowerCase()
      if (search && !name.includes(search.toLowerCase())) return false
      if (filterDir !== 'ALL' && m.direction !== filterDir) return false
      if (filterType !== 'ALL') {
        const matchTypes = filterType === 'OA' ? ['OA', 'SELF'] : [filterType]
        if (!matchTypes.includes(m.travel_type)) return false
      }
      if (filterMatch !== 'ALL' && m.match_status !== filterMatch) return false
      return true
    })
  }, [movements, search, filterDir, filterType, filterMatch])

  // ── Grouping ───────────────────────────────────────────────
  const { byDate, sortedDates } = useMemo(() => {
    const byDate = {}
    for (const m of filtered) {
      if (!byDate[m.travel_date]) byDate[m.travel_date] = []
      byDate[m.travel_date].push(m)
    }
    const sortedDates = Object.keys(byDate).sort()
    return { byDate, sortedDates }
  }, [filtered])

  // ── Summary counters (always on full dataset) ──────────────
  const totalIn         = movements.filter(m => m.direction === 'IN').length
  const totalOut        = movements.filter(m => m.direction === 'OUT').length
  const totalUnmatched  = movements.filter(m => m.match_status === 'unmatched').length
  const totalTransport  = movements.filter(m => m.needs_transport).length

  // ── Pill button helper ─────────────────────────────────────
  function Pill({ active, onClick, children, activeStyle }) {
    return (
      <button
        onClick={onClick}
        style={{
          padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
          fontWeight: '700', cursor: 'pointer', border: '1px solid',
          touchAction: 'manipulation',
          ...(active
            ? (activeStyle || { background: '#0f2340', color: 'white', borderColor: '#0f2340' })
            : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }),
        }}
      >
        {children}
      </button>
    )
  }

  // ── Auth guard ─────────────────────────────────────────────
  if (!user) return (
    <div style={{
      minHeight: '100vh', background: '#0f2340',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white',
    }}>Loading…</div>
  )

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      <Navbar currentPath="/dashboard/travel" />

      {/* ── Toolbar Row 1: title + date nav ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '8px 16px', minHeight: '52px',
        display: 'flex', alignItems: 'center', gap: '8px',
        position: 'sticky', top: '52px', zIndex: 21,
      }}>
        {/* Left: title */}
        <span style={{ fontSize: '18px' }}>✈️</span>
        <span style={{
          fontWeight: '800', fontSize: isMobile ? '14px' : '16px',
          color: '#0f172a', whiteSpace: 'nowrap',
        }}>Travel</span>

        {/* Center: navigation */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => shiftWindow(-7)}
            style={{
              background: 'white', border: '1px solid #e2e8f0',
              borderRadius: '6px', padding: '4px 10px',
              cursor: 'pointer', fontSize: '14px', color: '#374151',
              touchAction: 'manipulation',
            }}>◀</button>

          <input
            type="date"
            value={windowStart ? isoAdd(windowStart, 3) : today}
            onChange={e => pickDate(e.target.value)}
            style={{
              border: '1px solid #e2e8f0', borderRadius: '7px',
              padding: '5px 10px', fontSize: '13px', fontWeight: '700',
              color: '#0f172a', background: 'white', cursor: 'pointer', minWidth: 0,
            }}
          />

          <button
            onClick={() => shiftWindow(7)}
            style={{
              background: 'white', border: '1px solid #e2e8f0',
              borderRadius: '6px', padding: '4px 10px',
              cursor: 'pointer', fontSize: '14px', color: '#374151',
              touchAction: 'manipulation',
            }}>▶</button>

          <button
            onClick={resetWindow}
            style={{
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
              fontSize: '11px', fontWeight: '700', color: '#1d4ed8',
              whiteSpace: 'nowrap', touchAction: 'manipulation',
            }}>Today</button>

          <button
            onClick={() => loadData(windowStart, windowEnd)}
            style={{
              background: 'white', border: '1px solid #e2e8f0',
              borderRadius: '7px', padding: '5px 10px',
              cursor: 'pointer', fontSize: '13px', color: '#374151',
              touchAction: 'manipulation',
            }}>↻</button>
        </div>
      </div>

      {/* ── Filter Row ── */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '6px 16px',
        display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        position: 'sticky', top: '104px', zIndex: 20,
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '5px 8px', border: '1px solid #e2e8f0',
            borderRadius: '7px', fontSize: '12px', width: '160px', minWidth: 0,
          }}
        />

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Direction pills */}
        <div style={{ display: 'flex', gap: '3px' }}>
          <Pill active={filterDir === 'ALL'} onClick={() => setFilterDir('ALL')}>ALL</Pill>
          <Pill
            active={filterDir === 'IN'}
            onClick={() => setFilterDir('IN')}
            activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
          >↓ IN</Pill>
          <Pill
            active={filterDir === 'OUT'}
            onClick={() => setFilterDir('OUT')}
            activeStyle={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }}
          >↑ OUT</Pill>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Type pills */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <Pill active={filterType === 'ALL'} onClick={() => setFilterType('ALL')}>ALL</Pill>
          <Pill active={filterType === 'FLIGHT'} onClick={() => setFilterType('FLIGHT')}>✈️ FLIGHT</Pill>
          <Pill active={filterType === 'TRAIN'}  onClick={() => setFilterType('TRAIN')}>🚂 TRAIN</Pill>
          <Pill active={filterType === 'OA'}     onClick={() => setFilterType('OA')}>🚗 OA</Pill>
          <Pill active={filterType === 'GROUND'} onClick={() => setFilterType('GROUND')}>🚐 GROUND</Pill>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Match pills */}
        <div style={{ display: 'flex', gap: '3px' }}>
          <Pill active={filterMatch === 'ALL'} onClick={() => setFilterMatch('ALL')}>ALL</Pill>
          <Pill
            active={filterMatch === 'matched'}
            onClick={() => setFilterMatch('matched')}
            activeStyle={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
          >✅ Matched</Pill>
          <Pill
            active={filterMatch === 'unmatched'}
            onClick={() => setFilterMatch('unmatched')}
            activeStyle={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}
          >❌ Unmatched</Pill>
        </div>

        {/* Reset button */}
        {isFilterActive && (
          <button
            onClick={resetFilters}
            style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
              fontWeight: '700', cursor: 'pointer',
              background: '#f1f5f9', border: '1px solid #cbd5e1',
              color: '#64748b', touchAction: 'manipulation',
            }}>✕ Reset</button>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        padding: isMobile ? '12px' : '24px',
      }}>

        {/* Production ID warning */}
        {!PRODUCTION_ID && (
          <div style={{
            padding: '10px 14px', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: '8px',
            color: '#dc2626', fontSize: '12px', marginBottom: '16px',
          }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {/* ── Summary bar (on full dataset) ── */}
        {!loading && movements.length > 0 && (
          <div style={{
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '10px', padding: '12px 20px',
            marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '12px', color: '#374151', fontWeight: '700' }}>
              Total: <span style={{ fontWeight: '900', color: '#0f172a' }}>{movements.length}</span> movements
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>
              IN ↓: <span style={{ fontWeight: '900' }}>{totalIn}</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#c2410c' }}>
              OUT ↑: <span style={{ fontWeight: '900' }}>{totalOut}</span>
            </div>
            {totalUnmatched > 0 && (
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>
                Unmatched ❌: <span style={{ fontWeight: '900' }}>{totalUnmatched}</span>
              </div>
            )}
            {totalTransport > 0 && (
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>
                Need transport 🚐: <span style={{ fontWeight: '900' }}>{totalTransport}</span>
              </div>
            )}
            {/* Window info */}
            <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>
              {windowStart} → {windowEnd}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            Loading travel movements…
          </div>

        /* ── No data in window ── */
        ) : movements.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px', background: 'white',
            borderRadius: '12px', border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>✈️</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>
              No travel movements found for this period
            </div>
          </div>

        /* ── All filtered out ── */
        ) : sortedDates.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: 'white',
            borderRadius: '12px', border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              No results — reset filters
            </div>
          </div>

        /* ── Date blocks ── */
        ) : (
          sortedDates.map(date => (
            <div key={date} style={{ marginBottom: '32px' }}>

              {/* Date header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                marginBottom: '12px', paddingBottom: '8px',
                borderBottom: '2px solid #0f2340',
              }}>
                <span style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>
                  📅 {fmtDateHeader(date)}
                </span>
                {date === today && (
                  <span style={{
                    fontSize: '10px', fontWeight: '800', background: '#fbbf24',
                    color: '#78350f', padding: '2px 8px', borderRadius: '999px',
                  }}>
                    TODAY
                  </span>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                  {byDate[date].length} movements
                </span>
              </div>

              {/* Sections */}
              {SECTIONS.map(section => {
                const rows = byDate[date].filter(m => section.types.includes(m.travel_type))
                if (rows.length === 0) return null
                return (
                  <SectionTable
                    key={section.key}
                    section={section}
                    rows={rows}
                    today={today}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
