'use client'

/**
 * /dashboard/pax-coverage
 *
 * Per una data selezionata, mostra TUTTI i crew (CONFIRMED) divisi in:
 *  ✅ ASSEGNATI  — hanno almeno un trip in trip_passengers per quella data
 *  ❌ NON ASSEGNATI — non hanno nessun transfer quella data
 *
 * Filtri: Travel Status (IN/PRESENT/OUT), Department, Hotel
 * Obiettivo: non lasciare nessuno a piedi.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min == null) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function isTomorrow(s) {
  if (!s) return false
  const t = new Date(); t.setDate(t.getDate() + 1)
  return s === t.toISOString().split('T')[0]
}

const TC = {
  IN:      { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  OUT:     { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  PRESENT: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
}
const CLS_DOT = {
  ARRIVAL:   '#16a34a',
  DEPARTURE: '#ea580c',
  STANDARD:  '#2563eb',
}

// ─── Riga crew assegnato ──────────────────────────────────────
function AssignedRow({ member, trips, locsMap }) {
  const tc = TC[member.travel_status] || TC.PRESENT
  const hotel = locsMap[member.hotel_id] || member.hotel_id || '–'
  const dep = isTomorrow(member.departure_date)

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderLeft: '4px solid #22c55e',
      borderRadius: '9px',
      padding: '10px 14px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '12px',
      alignItems: 'start',
    }}>
      <div>
        {/* Nome + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{member.full_name}</span>
          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{member.department || 'N/A'}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
            {member.travel_status}
          </span>
          {dep && <span style={{ fontSize: '10px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: '5px', border: '1px solid #fecaca' }}>✈ TOMORROW</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>🏨 {hotel}</div>
        {/* Trip assegnati */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {trips.map(t => {
            const dot = CLS_DOT[t.transfer_class] || CLS_DOT.STANDARD
            const from = (locsMap[t.pickup_id] || t.pickup_id || '–').split(' ').slice(0, 3).join(' ')
            const to   = (locsMap[t.dropoff_id] || t.dropoff_id || '–').split(' ').slice(0, 3).join(' ')
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px' }}>
                <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span style={{ fontWeight: '800', fontFamily: 'monospace', color: '#374151' }}>{t.trip_id}</span>
                <span style={{ color: '#94a3b8' }}>·</span>
                <span style={{ fontWeight: '700', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(t.pickup_min ?? t.call_min)}</span>
                <span style={{ color: '#64748b' }}>{from} → {to}</span>
                {t.vehicle_id && <span style={{ color: '#2563eb', marginLeft: '2px' }}>🚐 {t.vehicle_id}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: '700', whiteSpace: 'nowrap', paddingTop: '2px' }}>
        ✅ {trips.length} trip{trips.length > 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Riga crew NON assegnato ──────────────────────────────────
function UnassignedRow({ member, locsMap, onAssign }) {
  const t = useT()
  const tc = TC[member.travel_status] || TC.PRESENT
  const hotel = locsMap[member.hotel_id] || member.hotel_id || '–'
  const dep = isTomorrow(member.departure_date)

  return (
    <div style={{
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderLeft: '4px solid #ef4444',
      borderRadius: '9px',
      padding: '10px 14px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '12px',
      alignItems: 'center',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{member.full_name}</span>
          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{member.department || 'N/A'}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
            {member.travel_status}
          </span>
          {dep && <span style={{ fontSize: '10px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: '5px', border: '1px solid #fecaca' }}>✈ TOMORROW</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>🏨 {hotel}</div>
      </div>
      <button onClick={onAssign} style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: '7px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {t.assignBtn}
      </button>
    </div>
  )
}

// ─── Riga crew NTN / Self Drive ───────────────────────────────
function NTNRow({ member, locsMap }) {
  const tc = TC[member.travel_status] || TC.PRESENT
  const hotel = locsMap[member.hotel_id] || member.hotel_id || '–'

  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderLeft: '4px solid #94a3b8',
      borderRadius: '9px',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{member.full_name}</span>
          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{member.department || 'N/A'}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
            {member.travel_status}
          </span>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>🚐 SD</span>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>🏨 {hotel}</div>
      </div>
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function PaxCoveragePage() {
  const t = useT()
  const router = useRouter()
  const [user,    setUser]    = useState(null)
  const [date,    setDate]    = useState(isoToday())
  const [loading, setLoading] = useState(true)

  // Raw data
  const [crew,     setCrew]     = useState([])
  const [locsMap,  setLocsMap]  = useState({})
  // crewId → [trips] per la data selezionata
  const [assignMap, setAssignMap] = useState({})

  // Filtri
  const [filterTS,   setFTS]   = useState('ALL')   // travel status
  const [filterDept, setFD]    = useState('ALL')
  const [filterHotel,setFH]    = useState('ALL')
  const [showOnly,   setSO]    = useState('ALL')   // ALL | ASSIGNED | UNASSIGNED
  const [search,     setSearch] = useState('')

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

  const loadData = useCallback(async d => {
    if (!PRODUCTION_ID) return
    setLoading(true)

    const [crewRes, tripsRes] = await Promise.all([
      supabase.from('crew').select('id,full_name,department,hotel_id,hotel_status,travel_status,departure_date,no_transport_needed')
        .eq('production_id', PRODUCTION_ID)
        .eq('hotel_status', 'CONFIRMED')
        .order('department', { nullsLast: true })
        .order('full_name'),
      supabase.from('trips').select('id,trip_id,pickup_min,call_min,transfer_class,vehicle_id,pickup_id,dropoff_id,status')
        .eq('production_id', PRODUCTION_ID)
        .eq('date', d)
        .neq('status', 'CANCELLED'),
    ])

    const crewData  = crewRes.data  || []
    const tripsData = tripsRes.data || []
    const tripIds   = tripsData.map(t => t.id)

    setCrew(crewData)

    if (tripIds.length === 0) {
      setAssignMap({})
      setLoading(false)
      return
    }

    // trip_passengers per i trip di questa data
    const { data: paxData } = await supabase
      .from('trip_passengers')
      .select('crew_id,trip_row_id')
      .in('trip_row_id', tripIds)

    // Costruisci mappa crewId → trips
    const map = {}
    for (const p of paxData || []) {
      const trip = tripsData.find(t => t.id === p.trip_row_id)
      if (!trip) continue
      if (!map[p.crew_id]) map[p.crew_id] = []
      // Evita duplicati (trip_id già presente)
      if (!map[p.crew_id].find(x => x.id === trip.id)) {
        map[p.crew_id].push(trip)
      }
    }
    // Ordina i trip per pickup_min
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999))
    }

    setAssignMap(map)
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadData(date) }, [user, date, loadData])

  // ── Filtri applicati ──────────────────────────────────────
  const departments = [...new Set(crew.map(c => c.department || 'N/A'))].sort()
  const hotels      = [...new Set(crew.map(c => c.hotel_id).filter(Boolean))].sort()

  // NTN split — regular crew excluded from coverage stats
  const regularCrew = crew.filter(c => !c.no_transport_needed)
  const ntnCrew     = crew.filter(c =>  c.no_transport_needed)
  const ntnCount    = ntnCrew.length

  // NTN filtered (dept/hotel/search — NOT showOnly, shown always in own section)
  const ntnFiltered = ntnCrew.filter(c => {
    if (filterDept  !== 'ALL' && (c.department || 'N/A') !== filterDept) return false
    if (filterHotel !== 'ALL' && c.hotel_id !== filterHotel) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.full_name.toLowerCase().includes(q) && !(c.department || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const filtered = regularCrew.filter(c => {
    if (filterTS   !== 'ALL' && c.travel_status !== filterTS) return false
    if (filterDept !== 'ALL' && (c.department || 'N/A') !== filterDept) return false
    if (filterHotel !== 'ALL' && c.hotel_id !== filterHotel) return false
    const assigned = !!assignMap[c.id]
    if (showOnly === 'ASSIGNED'   && !assigned) return false
    if (showOnly === 'UNASSIGNED' &&  assigned) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.full_name.toLowerCase().includes(q) && !(c.department || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const assigned   = filtered.filter(c =>  assignMap[c.id])
  const unassigned = filtered.filter(c => !assignMap[c.id])

  const totalAssigned   = regularCrew.filter(c =>  assignMap[c.id]).length
  const totalUnassigned = regularCrew.filter(c => !assignMap[c.id]).length
  const pct = regularCrew.length > 0 ? Math.round(totalAssigned / regularCrew.length * 100) : 0

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/pax-coverage" />

      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20, gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>👥</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>Pax Coverage</span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
          <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>▶</button>
          <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>{t.today}</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Show only toggle */}
          {['ALL', 'UNASSIGNED', 'ASSIGNED'].map(s => (
            <button key={s} onClick={() => setSO(s)}
              style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(showOnly === s ? (s === 'UNASSIGNED' ? { background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' } : s === 'ASSIGNED' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#0f2340', color: 'white', borderColor: '#0f2340' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
              {s === 'ALL' ? `All (${regularCrew.length})` : s === 'UNASSIGNED' ? `❌ ${t.withoutTransfer} (${totalUnassigned})` : `✅ ${t.withTransfer} (${totalAssigned})`}
            </button>
          ))}
          {/* Travel status filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'IN', 'PRESENT', 'OUT'].map(s => {
              const active = filterTS === s; const c = TC[s]
              return (
                <button key={s} onClick={() => setFTS(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {/* Dept filter */}
          {departments.length > 1 && (
            <select value={filterDept} onChange={e => setFD(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white' }}>
              <option value="ALL">{t.allDepts}</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {/* Hotel filter */}
          {hotels.length > 1 && (
            <select value={filterHotel} onChange={e => setFH(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white' }}>
              <option value="ALL">{t.allHotels}</option>
              {hotels.map(h => <option key={h} value={h}>{locsMap[h] || h}</option>)}
            </select>
          )}
          <input type="text" placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '120px' }} />
          <button onClick={() => loadData(date)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>↻</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {/* ── Summary bar ── */}
        {!loading && crew.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            {/* Progress bar */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
                <span>{t.transferCoverage}</span>
                <span style={{ color: pct === 100 ? '#15803d' : pct >= 75 ? '#d97706' : '#dc2626' }}>{pct}%</span>
              </div>
              <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444', borderRadius: '999px', transition: 'width 0.5s ease' }} />
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
              {[
                { n: regularCrew.length, l: t.totalCrewLabel, c: '#374151', bg: '#f8fafc', b: '#e2e8f0' },
                { n: totalAssigned, l: t.withTransfer, c: '#15803d', bg: '#f0fdf4', b: '#86efac' },
                { n: totalUnassigned, l: t.withoutTransfer, c: totalUnassigned > 0 ? '#dc2626' : '#94a3b8', bg: totalUnassigned > 0 ? '#fef2f2' : '#f8fafc', b: totalUnassigned > 0 ? '#fecaca' : '#e2e8f0' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'center', padding: '8px 14px', borderRadius: '10px', background: s.bg, border: `1px solid ${s.b}` }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: s.c, lineHeight: 1 }}>{s.n}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: '600' }}>{s.l}</div>
                </div>
              ))}
              {ntnCount > 0 && (
                <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#6b7280', lineHeight: 1 }}>{ntnCount}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: '600' }}>🚐 {t.ntnShort}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : crew.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>👤</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>{t.noCrewConfirmedDb}</div>
            <a href="/dashboard/crew" style={{ marginTop: '12px', display: 'inline-block', color: '#2563eb', fontSize: '13px' }}>{t.goToCrewLink}</a>
          </div>
        ) : filtered.length === 0 && ntnFiltered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '14px', color: '#64748b' }}>{t.noResultsFiltered}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* ══ WITHOUT TRANSFER (prima, più urgente) ══ */}
            {(showOnly === 'ALL' || showOnly === 'UNASSIGNED') && unassigned.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #ef4444' }}>
                  <span style={{ fontSize: '16px' }}>❌</span>
                  <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a' }}>{t.withoutTransferSection}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#ef4444', color: 'white', padding: '1px 8px', borderRadius: '999px' }}>
                    {unassigned.length} crew
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>— {t.noTripAssignedFor} {fmtDate(date)}</span>
                  <a href="/dashboard/trips" style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 10px', borderRadius: '7px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {t.goToTrips}
                  </a>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {unassigned.map(c => (
                    <UnassignedRow key={c.id} member={c} locsMap={locsMap} onAssign={() => {
                      const params = new URLSearchParams({
                        assignCrewId:   c.id,
                        assignCrewName: c.full_name,
                        assignHotelId:  c.hotel_id || '',
                        assignTS:       c.travel_status || 'PRESENT',
                        assignDate:     date,
                      })
                      router.push('/dashboard/trips?' + params.toString())
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* ══ CON TRANSFER ══ */}
            {(showOnly === 'ALL' || showOnly === 'ASSIGNED') && assigned.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #22c55e' }}>
                  <span style={{ fontSize: '16px' }}>✅</span>
                  <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a' }}>{t.withAssignedTransfer}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#22c55e', color: 'white', padding: '1px 8px', borderRadius: '999px' }}>
                    {assigned.length} crew
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {assigned.map(c => (
                    <AssignedRow key={c.id} member={c} trips={assignMap[c.id] || []} locsMap={locsMap} />
                  ))}
                </div>
              </div>
            )}

            {/* ══ NTN / SELF DRIVE ══ */}
            {ntnFiltered.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #94a3b8' }}>
                  <span style={{ fontSize: '16px' }}>🚐</span>
                  <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a' }}>{t.ntnSection}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#94a3b8', color: 'white', padding: '1px 8px', borderRadius: '999px' }}>
                    {ntnFiltered.length} crew
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>— {t.ntnCoverageNote}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {ntnFiltered.map(c => (
                    <NTNRow key={c.id} member={c} locsMap={locsMap} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
