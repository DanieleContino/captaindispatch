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

import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'

function isoToday() {
  const d = new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}
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
  const iso = t.getFullYear() + '-' +
    String(t.getMonth() + 1).padStart(2, '0') + '-' +
    String(t.getDate()).padStart(2, '0')
  return s === iso
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

// ─── CrewInfoMiniModal ─────────────────────────────────────
function CrewInfoMiniModal({ member, locsMap, onClose }) {
  const PRODUCTION_ID = getProductionId()
  const [details,   setDetails]   = useState(null)
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)

  function fmtDateShort(d) {
    if (!d) return '–'
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  useEffect(() => {
    if (!member?.id || !PRODUCTION_ID) return
    setLoading(true)
    Promise.all([
      supabase.from('crew')
        .select('id,full_name,role,department,phone,email,hotel_id,arrival_date,departure_date,no_transport_needed,hotel:hotel_id(id,name)')
        .eq('id', member.id).single(),
      supabase.from('travel_movements')
        .select('travel_date,direction,travel_type,from_location,from_time,to_location,to_time,travel_number,needs_transport,pickup_dep,pickup_arr')
        .eq('crew_id', member.id).eq('production_id', PRODUCTION_ID)
        .order('travel_date', { ascending: true }),
    ]).then(([crewRes, movRes]) => {
      setDetails(crewRes.data)
      setMovements(movRes.data || [])
      setLoading(false)
    })
  }, [member?.id])

  const hotelName = details?.hotel?.name || (locsMap[details?.hotel_id] || details?.hotel_id || '–')

  return (
    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, width: 'calc(100% - 40px)', maxWidth: '480px', background: 'white', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
      <div style={{ background: '#0f2340', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: 'white' }}>{member.full_name}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
            {[details?.role, details?.department].filter(Boolean).join(' · ') || member.department || ''}
          </div>
          {details?.no_transport_needed && (
            <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}>
              🚐 NTN — No Transport Needed
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
      </div>
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {details?.phone && <div style={{ fontSize: '13px', color: '#0f172a' }}>📞 <a href={`tel:${details.phone}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{details.phone}</a></div>}
            {details?.email && <div style={{ fontSize: '13px', color: '#0f172a' }}>✉️ <a href={`mailto:${details.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{details.email}</a></div>}
            {!details?.phone && !details?.email && <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No contact info</div>}
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '13px', color: '#0f172a' }}>🏨 <strong>{hotelName}</strong></div>
            {details?.arrival_date   && <div style={{ fontSize: '12px', color: '#64748b' }}>🏨 Check-in: <strong>{fmtDateShort(details.arrival_date)}</strong></div>}
            {details?.departure_date && <div style={{ fontSize: '12px', color: '#64748b' }}>🏁 Check-out: <strong>{fmtDateShort(details.departure_date)}</strong></div>}
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>✈️ Travel Movements</div>
            {movements.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No travel movements found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {movements.map((m, i) => {
                  const emoji = m.travel_type === 'FLIGHT' ? '✈️' : m.travel_type === 'TRAIN' ? '🚂' : '🚐'
                  return (
                    <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '8px 10px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '800', color: '#0f2340' }}>{m.travel_date || '–'}</span>
                        <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: m.direction === 'IN' ? '#dcfce7' : '#fff7ed', color: m.direction === 'IN' ? '#15803d' : '#c2410c', border: '1px solid ' + (m.direction === 'IN' ? '#86efac' : '#fdba74') }}>
                          {m.direction === 'IN' ? '↓ IN' : '↑ OUT'}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{emoji} {m.travel_type || 'OA'}</span>
                        {m.travel_number && <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '11px' }}>{m.travel_number}</span>}
                      </div>
                      <div style={{ marginTop: '4px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#64748b' }}>{m.from_location || '–'}</span>
                        {m.from_time && <span style={{ color: '#94a3b8', fontSize: '11px' }}>({m.from_time.slice(0,5)})</span>}
                        <span style={{ color: '#cbd5e1' }}>→</span>
                        <span style={{ fontWeight: '700', color: '#0f172a' }}>{m.to_location || '–'}</span>
                        {m.to_time && <span style={{ color: '#94a3b8', fontSize: '11px' }}>({m.to_time.slice(0,5)})</span>}
                      </div>
                      {m.needs_transport && (
                        <div style={{ marginTop: '5px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>🚐 transport</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
    {showInfo && (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,35,64,0.5)' }} />
        <CrewInfoMiniModal member={member} locsMap={locsMap} onClose={() => setShowInfo(false)} />
      </>
    )}
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
          <button onClick={() => setShowInfo(true)} style={{ background: 'none', border: '1px solid #bfdbfe', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', color: '#2563eb', fontWeight: '800', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
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
    </>
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

// ─── DayStrip ──────────────────────────────────────────────────
function DayStrip({ selectedDate, centerDate, onSelectDay, onShiftCenter, productionId }) {
  const [counts, setCounts] = useState({})

  function getDays(center) {
    const days = []
    for (let i = -3; i <= 3; i++) {
      const dt = new Date(center + 'T12:00:00Z')
      dt.setUTCDate(dt.getUTCDate() + i)
      days.push(dt.toISOString().split('T')[0])
    }
    return days
  }

  const days = getDays(centerDate)
  const today = isoToday()

  useEffect(() => {
    if (!productionId) return
    const from = days[0]
    const to   = days[days.length - 1]
    supabase
      .from('travel_movements')
      .select('travel_date, direction')
      .eq('production_id', productionId)
      .gte('travel_date', from)
      .lte('travel_date', to)
      .then(({ data }) => {
        const c = {}
        for (const row of data || []) {
          const d = row.travel_date
          if (!c[d]) c[d] = { IN: 0, OUT: 0 }
          if (row.direction === 'IN')  c[d].IN++
          if (row.direction === 'OUT') c[d].OUT++
        }
        setCounts(c)
      })
  }, [centerDate, productionId])

  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #e2e8f0',
      padding: '8px 24px',
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      justifyContent: 'center',
      overflowX: 'auto',
    }}>
      <button
        onClick={() => onShiftCenter(isoAdd(centerDate, -7))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8', padding: '4px 8px', flexShrink: 0 }}>
        ◀
      </button>

      {days.map(d => {
        const isSelected = d === selectedDate
        const isToday    = d === today
        const c          = counts[d] || {}
        const hasData    = c.IN > 0 || c.OUT > 0
        const dtObj      = new Date(d + 'T12:00:00Z')
        const dayName    = dtObj.toLocaleDateString('en-GB', { weekday: 'short' })
        const dayNum     = dtObj.getUTCDate()
        const monthAbbr  = dtObj.toLocaleDateString('en-GB', { month: 'short' })

        return (
          <button
            key={d}
            onClick={() => onSelectDay(d)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '6px 10px',
              borderRadius: '10px',
              border: isSelected ? '2px solid #0f2340' : '2px solid transparent',
              background: isSelected ? '#0f2340'
                        : isToday   ? '#eff6ff'
                        : 'transparent',
              cursor: 'pointer',
              minWidth: '52px',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: isSelected ? '#fff' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isToday && !isSelected ? '★' : dayName}
            </span>
            <span style={{ fontSize: '16px', fontWeight: '900', color: isSelected ? 'white' : isToday ? '#1d4ed8' : '#0f172a', lineHeight: 1 }}>
              {dayNum}
            </span>
            <span style={{ fontSize: '9px', color: isSelected ? 'rgba(255,255,255,0.8)' : '#94a3b8' }}>
              {monthAbbr}
            </span>
            {hasData ? (
              <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                {c.IN  > 0 && <span style={{ fontSize: '9px', fontWeight: '800', background: isSelected ? '#16a34a' : '#dcfce7', color: isSelected ? 'white' : '#15803d', padding: '1px 4px', borderRadius: '4px' }}>↓{c.IN}</span>}
                {c.OUT > 0 && <span style={{ fontSize: '9px', fontWeight: '800', background: isSelected ? '#ea580c' : '#fff7ed', color: isSelected ? 'white' : '#c2410c', padding: '1px 4px', borderRadius: '4px' }}>↑{c.OUT}</span>}
              </div>
            ) : (
              <div style={{ height: '16px' }} />
            )}
          </button>
        )
      })}

      <button
        onClick={() => onShiftCenter(isoAdd(centerDate, 7))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8', padding: '4px 8px', flexShrink: 0 }}>
        ▶
      </button>
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
// Remote Row component
function RemoteRow({ member, locsMap }) {
  const tc = TC[member.travel_status] || TC.PRESENT
  const hotel = locsMap[member.hotel_id] || member.hotel_id || '–'

  return (
    <div style={{
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderLeft: '4px solid #d97706',
      borderRadius: '9px',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', fontSize: '13px', color: '#92400e' }}>{member.full_name}</span>
          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{member.department || 'N/A'}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
            {member.travel_status}
          </span>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>🏠 Remote</span>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>🏨 {hotel}</div>
      </div>
    </div>
  )
}

export default function PaxCoveragePage() {
  const t = useT()
  const isMobile = useIsMobile()
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()
  const [user,        setUser]        = useState(null)
  const [date,        setDate]        = useState(isoToday())
  const [stripCenter, setStripCenter] = useState(isoToday())
  const [loading,     setLoading]     = useState(true)

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
      supabase.from('crew').select('id,full_name,department,hotel_id,hotel_status,travel_status,departure_date,no_transport_needed,on_location')
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

  // Split: remote (on_location=false) | NTN | regular — remote esclusi dalle statistiche di copertura
  const remoteCrew  = crew.filter(c => c.on_location === false)
  const ntnCrew     = crew.filter(c =>  c.no_transport_needed && c.on_location !== false)
  const regularCrew = crew.filter(c => !c.no_transport_needed && c.on_location !== false)
  const ntnCount    = ntnCrew.length
  const remoteCount = remoteCrew.length

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

  // remoteFiltered rispetta filtri dept/hotel/search ma NON showOnly (sempre visibile in fondo)
  const remoteFiltered = remoteCrew.filter(c => {
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

      {/* Toolbar Row 1 — titolo + navigazione data */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', minHeight: '52px', height: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', position: 'sticky', top: '52px', zIndex: 21 }}>
        <span style={{ fontSize: '18px' }}>👥</span>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>Pax Coverage</span>
        <span style={{ color: '#cbd5e1' }}>·</span>
        <button onClick={() => { const d = isoAdd(date, -1); setDate(d); setStripCenter(d) }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>◀</button>
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setStripCenter(e.target.value) }}
          style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
        <button onClick={() => { const d = isoAdd(date, 1); setDate(d); setStripCenter(d) }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>▶</button>
        <button onClick={() => { setDate(isoToday()); setStripCenter(isoToday()) }} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>{t.today}</button>
      </div>

      {/* Toolbar Row 2 — filtri */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', minHeight: '52px', height: 'auto', display: 'flex', alignItems: 'center', gap: '6px', position: 'sticky', top: '104px', zIndex: 20, flexWrap: 'wrap' }}>
        {/* Show only toggle */}
        {['ALL', 'UNASSIGNED', 'ASSIGNED'].map(s => (
          <button key={s} onClick={() => setSO(s)}
            style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap', flexShrink: 0, ...(showOnly === s ? (s === 'UNASSIGNED' ? { background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' } : s === 'ASSIGNED' ? { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } : { background: '#0f2340', color: 'white', borderColor: '#0f2340' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
            {s === 'ALL' ? `All (${regularCrew.length})` : s === 'UNASSIGNED' ? `❌ ${t.withoutTransfer} (${totalUnassigned})` : `✅ ${t.withTransfer} (${totalAssigned})`}
          </button>
        ))}
        <span style={{ color: '#e2e8f0', flexShrink: 0 }}>|</span>
        {/* Travel status filter */}
        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
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
            style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', flexShrink: 0 }}>
            <option value="ALL">{t.allDepts}</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {/* Hotel filter */}
        {hotels.length > 1 && (
          <select value={filterHotel} onChange={e => setFH(e.target.value)}
            style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', flexShrink: 0 }}>
            <option value="ALL">{t.allHotels}</option>
            {hotels.map(h => <option key={h} value={h}>{locsMap[h] || h}</option>)}
          </select>
        )}
        <input type="text" placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '120px', flexShrink: 0 }} />
        <button onClick={() => loadData(date)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151', flexShrink: 0 }}>↻</button>
      </div>

      {/* ── Day Strip ── */}
      <div style={{ position: 'sticky', top: '156px', zIndex: 19 }}>
        <DayStrip
          selectedDate={date}
          centerDate={stripCenter}
          onSelectDay={d => { setDate(d); setStripCenter(d) }}
          onShiftCenter={setStripCenter}
          productionId={PRODUCTION_ID}
        />
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
              {remoteCount > 0 && (
                <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#d97706', lineHeight: 1 }}>{remoteCount}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: '600' }}>🏠 Remote</div>
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
        ) : filtered.length === 0 && ntnFiltered.length === 0 && remoteFiltered.length === 0 ? (
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

            {/* ══ REMOTE TODAY ══ */}
            {remoteFiltered.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #d97706' }}>
                  <span style={{ fontSize: '16px' }}>🏠</span>
                  <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a' }}>Remote Today</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#d97706', color: 'white', padding: '1px 8px', borderRadius: '999px' }}>
                    {remoteFiltered.length} crew
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>— non inclusi nelle statistiche di copertura</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {remoteFiltered.map(c => (
                    <RemoteRow key={c.id} member={c} locsMap={locsMap} />
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
