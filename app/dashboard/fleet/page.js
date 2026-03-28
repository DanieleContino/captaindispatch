'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { PageHeader } from '../../../components/ui/PageHeader'

const PRODUCTION_ID    = process.env.NEXT_PUBLIC_PRODUCTION_ID
const REFRESH_INTERVAL = 30_000  // auto-reload dati ogni 30s
const NOW_TICK_MS      = 15_000  // aggiorna "adesso" ogni 15s per le progress bar

// ─── Utility ─────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function dtToHHMM(dt) {
  if (!dt) return '–'
  const d = new Date(dt)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}
function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}
function minutesUntil(dtObj, now) {
  return Math.max(0, Math.round((dtObj - now) / 60_000))
}
function fmtRelative(min) {
  if (min < 1)  return 'now'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
function fmtLastRefresh(d) {
  if (!d) return ''
  return 'Updated ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

// ─── Stili status ─────────────────────────────────────────────
const SS = {
  BUSY: { bg: '#fffbeb', border: '#fde68a', left: '#f59e0b', badge: '#92400e', badgeBg: '#fef3c7', label: '⏳ BUSY' },
  FREE: { bg: '#f0fdf4', border: '#bbf7d0', left: '#22c55e', badge: '#14532d', badgeBg: '#dcfce7', label: '✅ FREE' },
  IDLE: { bg: '#f8fafc', border: '#e2e8f0', left: '#94a3b8', badge: '#475569', badgeBg: '#f1f5f9', label: '💤 IDLE' },
  DONE: { bg: '#eff6ff', border: '#bfdbfe', left: '#60a5fa', badge: '#1e40af', badgeBg: '#dbeafe', label: '✓ DONE' },
}

const CLS = {
  ARRIVAL:   { dot: '#16a34a', label: 'ARR' },
  DEPARTURE: { dot: '#ea580c', label: 'DEP' },
  STANDARD:  { dot: '#2563eb', label: 'STD' },
}

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }

// ─── Raggruppa trip per trip_id (multi-dropoff) ───────────────
/**
 * Dato un array di trip rows dello stesso veicolo,
 * raggruppa per trip_id: calcola minStart e maxEnd aggregati.
 * Equivalente della logica in FleetMonitor.html (Apps Script).
 */
// compute start/end from pickup_min+duration_min when timestamps missing
function dtFromPickup(t) {
  const pmin = t.pickup_min ?? t.call_min
  if (pmin == null || !t.duration_min || !t.date) return { sd: null, ed: null }
  const [y, mo, dd] = t.date.split('-').map(Number)
  const sdMs = new Date(y, mo - 1, dd, Math.floor(pmin / 60), pmin % 60, 0, 0).getTime()
  const rtMult = ['Wrap', 'Charter', 'Other'].includes(t.service_type) ? 2 : 1
  return { sd: new Date(sdMs), ed: new Date(sdMs + t.duration_min * rtMult * 60_000) }
}

function groupByTripId(tripRows) {
  const map = {}
  for (const t of tripRows) {
    const sd = t.start_dt ? new Date(t.start_dt) : null
    const ed = t.end_dt   ? new Date(t.end_dt)   : null

    if (!map[t.trip_id]) {
      map[t.trip_id] = {
        trip_id:        t.trip_id,
        vehicle_id:     t.vehicle_id,
        pickup_id:      t.pickup_id,
        dropoff_ids:    [t.dropoff_id].filter(Boolean),
        lastDropoffId:  t.dropoff_id,   // dropoff dell'ultima riga per repositioning ETA
        transfer_class: t.transfer_class,
        pickup_min:     t.pickup_min,
        call_min:       t.call_min,
        pax_count:      t.pax_count || 0,
        passenger_list: t.passenger_list || '',
        service_type:   t.service_type || '',
        status:         t.status,
        minStart:       sd,
        maxEnd:         ed,
        rows:           [t],
      }
    } else {
      const g = map[t.trip_id]
      if (t.dropoff_id && !g.dropoff_ids.includes(t.dropoff_id)) g.dropoff_ids.push(t.dropoff_id)
      g.rows.push(t)
      g.pax_count = Math.max(g.pax_count, t.pax_count || 0)
      if (t.passenger_list && !g.passenger_list.includes(t.passenger_list)) {
        g.passenger_list = [g.passenger_list, t.passenger_list].filter(Boolean).join(', ')
      }
      if (!g.service_type && t.service_type) g.service_type = t.service_type
      if (sd && (!g.minStart || sd < g.minStart)) { g.minStart = sd; g.pickup_min = t.pickup_min; g.call_min = t.call_min }
      if (ed && (!g.maxEnd  || ed > g.maxEnd))   { g.maxEnd = ed; g.lastDropoffId = t.dropoff_id }
    }
  }
  // Sort: groups with timestamps first, then by trip_id
  return Object.values(map).sort((a, b) => {
    if (a.minStart && b.minStart) return a.minStart - b.minStart
    if (a.minStart) return -1
    if (b.minStart) return 1
    return a.trip_id.localeCompare(b.trip_id)
  })
}

/**
 * Calcola lo status del veicolo in base ai suoi trip groups e al "now".
 * Ordine di priorità: BUSY > FREE > DONE > IDLE
 */
function vehicleStatus(groups, now) {
  if (!groups || groups.length === 0) {
    return { status: 'IDLE', current: null, next: null, last: null }
  }

  // BUSY: un trip è in corso adesso
  const current = groups.find(g => g.minStart <= now && now < g.maxEnd) || null
  if (current) {
    const next = groups
      .filter(g => g.minStart > now)
      .sort((a, b) => a.minStart - b.minStart)[0] || null
    return { status: 'BUSY', current, next, last: null }
  }

  // FREE: ha trip futuri
  const future = groups.filter(g => g.minStart > now).sort((a, b) => a.minStart - b.minStart)
  if (future.length > 0) {
    return { status: 'FREE', current: null, next: future[0], last: null }
  }

  // DONE: tutti i trip sono finiti
  const last = [...groups].sort((a, b) => b.maxEnd - a.maxEnd)[0] || null
  return { status: 'DONE', current: null, next: null, last }
}

// ─── Card singolo veicolo ─────────────────────────────────────
function VehicleCard({ vehicle, groups, locsMap, routeDurMap, vehicleTrafficAlerts, now }) {
  const [expanded, setExpanded] = useState(false)
  const { status, current, next, last } = vehicleStatus(groups, now)
  const s    = SS[status] || SS.IDLE
  const icon = TYPE_ICON[vehicle.vehicle_type] || '🚐'

  // Progress bar per BUSY
  const progress = (status === 'BUSY' && current)
    ? Math.min(100, Math.max(0, (now - current.minStart) / (current.maxEnd - current.minStart) * 100))
    : 0

  // Repositioning ETA: ultimo dropoff → prossimo pickup (da cache Google Routes)
  const repoMin = (routeDurMap && current?.lastDropoffId && next?.pickup_id &&
                   current.lastDropoffId !== next.pickup_id)
    ? (routeDurMap[`${current.lastDropoffId}||${next.pickup_id}`] ?? null)
    : null
  const repoEta = (repoMin != null && current?.maxEnd)
    ? new Date(current.maxEnd.getTime() + repoMin * 60_000)
    : null

  // Traffic alerts per questo veicolo
  const currentAlert = vehicleTrafficAlerts?.find(a => a.tripId === current?.trip_id) ?? null
  const nextAlert    = vehicleTrafficAlerts?.find(a => a.tripId === next?.trip_id)    ?? null
  const headerAlert  = vehicleTrafficAlerts?.[0] ?? null
  const SEV_COLOR = {
    CRITICAL: { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c', label: '🚨 TRAFFIC ALERT' },
    WARNING:  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', label: '⚠️ TRAFFIC WARNING' },
    INFO:     { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'ℹ️ TRAFFIC INFO' },
  }

  const locName  = id => (locsMap[id] || id || '–')
  const shortLoc = id => locName(id).split(' ').slice(0, 2).join(' ')

  const routeLabel = g => {
    if (!g) return '–'
    const from = shortLoc(g.pickup_id)
    const to   = g.dropoff_ids.map(shortLoc).join(' / ')
    return `${from} → ${to}`
  }

  const tripTimeLabel = g => {
    if (!g) return ''
    const t = minToHHMM(g.pickup_min ?? g.call_min)
    const cls = CLS[g.transfer_class] || CLS.STANDARD
    return (
      <span>
        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: cls.dot, marginRight: '5px', verticalAlign: 'middle' }} />
        {t} · {cls.label} · {g.trip_id}
      </span>
    )
  }

  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderLeft: `5px solid ${s.left}`,
      borderRadius: '14px',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      transition: 'box-shadow 0.15s',
    }}>

      {/* ── Riga 1: veicolo + badge status ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '24px', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '17px', color: '#0f172a', letterSpacing: '-0.3px' }}>
              {vehicle.id}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[vehicle.driver_name, vehicle.sign_code, vehicle.capacity ? `×${vehicle.capacity}` : null]
                .filter(Boolean).join('  ·  ')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0, alignItems: 'center' }}>
          <span style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800',
            background: s.badgeBg, color: s.badge, border: `1px solid ${s.border}`,
            letterSpacing: '0.06em', whiteSpace: 'nowrap',
          }}>
            {s.label}
          </span>
          {headerAlert && (
            <span style={{
              padding: '3px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '800',
              background: headerAlert.severity === 'CRITICAL' ? '#fee2e2' : '#fffbeb',
              color:      headerAlert.severity === 'CRITICAL' ? '#b91c1c' : '#92400e',
              border:     `1px solid ${headerAlert.severity === 'CRITICAL' ? '#fca5a5' : '#fde68a'}`,
              whiteSpace: 'nowrap',
            }}>
              {headerAlert.severity === 'CRITICAL' ? '🚨' : '⚠️'}
            </span>
          )}
        </div>
      </div>

      {/* ── BUSY ── */}
      {status === 'BUSY' && current && (
        <>
          {/* Rotta corrente */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', letterSpacing: '0.05em', marginBottom: '3px' }}>
              IN PROGRESS{current.service_type ? ` · ${current.service_type}` : ''}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', lineHeight: 1.4 }}>
              {routeLabel(current)}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              {tripTimeLabel(current)}
            </div>
            {/* Passengers */}
            {current.passenger_list && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.5, padding: '5px 8px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                👥 {current.passenger_list}
              </div>
            )}
          </div>

          {/* Traffic Alert Banner */}
          {currentAlert && SEV_COLOR[currentAlert.severity] && (
            <div style={{
              padding: '8px 10px',
              background: SEV_COLOR[currentAlert.severity].bg,
              border: `1px solid ${SEV_COLOR[currentAlert.severity].border}`,
              borderRadius: '8px', fontSize: '11px', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: '800', color: SEV_COLOR[currentAlert.severity].text, marginBottom: '2px' }}>
                {SEV_COLOR[currentAlert.severity].label}
              </div>
              <div style={{ color: '#374151' }}>{currentAlert.message}</div>
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: '600' }}>
              <span>Start {dtToHHMM(current.minStart)}</span>
              <span style={{ fontWeight: '800', fontSize: '12px' }}>{Math.round(progress)}%</span>
              {['Wrap', 'Charter', 'Other'].includes(current.service_type) && Math.round(progress) >= 50 && (
                <span style={{ color: '#15803d', fontWeight: '800', fontSize: '11px' }}>
                  ✅ Dropoff done — returning
                </span>
              )}
              <span style={{ color: currentAlert ? SEV_COLOR[currentAlert.severity]?.text || '#b91c1c' : '#b91c1c', fontWeight: '900' }}>
                {currentAlert?.dropoffEtaStr
                  ? `⏱ ETA ${currentAlert.dropoffEtaStr}${currentAlert.delayMin > 0 ? ` (+${currentAlert.delayMin}min)` : ''}` +
                    (currentAlert.backEtaStr ? ` · ↩ ${currentAlert.backEtaStr}` : '')
                  : repoEta
                    ? `⏱ Drop ${dtToHHMM(current.maxEnd)} · Repo ${repoMin}min → ${pad2(repoEta.getHours())}:${pad2(repoEta.getMinutes())}`
                    : `⏱ Back at ${dtToHHMM(current.maxEnd)}`
                }
              </span>
            </div>
            <div style={{ height: '8px', background: '#fde68a', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                borderRadius: '999px',
                transition: 'width 1s linear',
              }} />
            </div>
          </div>

          {/* Prossimo trip (se esiste) */}
          {next && (
            <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '8px', fontSize: '11px', color: '#64748b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <span style={{ fontWeight: '700', color: '#374151' }}>Next</span>{' '}
                  {routeLabel(next)} · {minToHHMM(next.pickup_min ?? next.call_min)} · in {fmtRelative(minutesUntil(next.minStart, now))}
                </span>
                {repoEta && (
                  <span style={{ fontSize: '10px', color: '#15803d', fontWeight: '700', background: '#dcfce7', padding: '2px 6px', borderRadius: '5px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    🚗 {repoMin}min repo
                  </span>
                )}
              </div>
              {!repoMin && current.lastDropoffId && next.pickup_id && current.lastDropoffId !== next.pickup_id && (
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  ℹ Repo {locName(current.lastDropoffId)} → {locName(next.pickup_id)} (aggiorna traffico per ETA)
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── FREE ── */}
      {status === 'FREE' && next && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#14532d', letterSpacing: '0.05em', marginBottom: '3px' }}>
            NEXT TRIP
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', lineHeight: 1.4 }}>
            {routeLabel(next)}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '5px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{tripTimeLabel(next)}</span>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803d' }}>
              in {fmtRelative(minutesUntil(next.minStart, now))}
            </span>
          </div>
          {nextAlert && SEV_COLOR[nextAlert.severity] && (
            <div style={{
              marginTop: '7px', padding: '6px 8px',
              background: SEV_COLOR[nextAlert.severity].bg,
              border: `1px solid ${SEV_COLOR[nextAlert.severity].border}`,
              borderRadius: '6px', fontSize: '10px',
              color: SEV_COLOR[nextAlert.severity].text, fontWeight: '600', lineHeight: 1.4,
            }}>
              {nextAlert.severity === 'CRITICAL' ? '🚨' : '⚠️'} {nextAlert.message}
            </div>
          )}
        </div>
      )}

      {/* ── IDLE ── */}
      {status === 'IDLE' && (
        <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>
          No trips scheduled today
        </div>
      )}

      {/* ── DONE ── */}
      {status === 'DONE' && last && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af', letterSpacing: '0.05em', marginBottom: '3px' }}>
            LAST TRIP{last.service_type ? ` · ${last.service_type}` : ''}
          </div>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            {routeLabel(last)} · ended at {dtToHHMM(last.maxEnd)}
          </div>
          {(last.passenger_list || last.pax_count > 0) && (
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px', lineHeight: 1.5, padding: '5px 8px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
              👥 {last.passenger_list || `${last.pax_count} pax`}
            </div>
          )}
        </div>
      )}

      {/* ── Footer: riepilogo giornata + expand ── */}
      {groups.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: '8px' }}>
          {/* Summary row — click to expand/collapse */}
          <div
            onClick={() => setExpanded(e => !e)}
            style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#64748b', cursor: 'pointer', userSelect: 'none', alignItems: 'center' }}
          >
            <span style={{ fontWeight: expanded ? '800' : '600', color: expanded ? '#1d4ed8' : '#64748b' }}>
              {groups.length} trip{groups.length > 1 ? 's' : ''} today {expanded ? '▲' : '▼'}
            </span>
            <span>Start {dtToHHMM(groups[0]?.minStart)}</span>
            <span>End {dtToHHMM(groups[groups.length - 1]?.maxEnd)}</span>
            {groups.some(g => g.pax_count > 0) && (
              <span>{groups.reduce((sum, g) => sum + (g.pax_count || 0), 0)} total pax</span>
            )}
          </div>
          {/* Expanded list of all trips */}
          {expanded && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {groups.map((g, i) => {
                const gStart = g.minStart ? new Date(g.minStart) : null
                const gEnd   = g.maxEnd   ? new Date(g.maxEnd)   : null
                const st = !gStart ? 'PLANNED' : now < gStart ? 'PLANNED' : gEnd && now > gEnd ? 'DONE' : 'BUSY'
                const stColor = { BUSY: '#b91c1c', DONE: '#92400e', PLANNED: '#1d4ed8' }[st]
                const stBg    = { BUSY: '#fee2e2', DONE: '#fef9c3', PLANNED: '#eff6ff' }[st]
                return (
                  <div key={g.trip_id || i} style={{
                    padding: '7px 10px', background: stBg, borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.06)', fontSize: '11px', lineHeight: 1.4,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                      <span>{minToHHMM(g.pickup_min ?? g.call_min)} · {g.service_type || '–'}</span>
                      <span style={{ color: stColor, fontWeight: '800' }}>{st}</span>
                    </div>
                    <div style={{ color: '#374151', marginTop: '2px' }}>{routeLabel(g)}</div>
                    {g.trip_id && <div style={{ color: '#94a3b8', marginTop: '1px' }}>#{g.trip_id}{g.pax_count > 0 ? ` · ${g.pax_count} pax` : ''}</div>}
                    {g.passenger_list && (
                      <div style={{ color: '#64748b', marginTop: '2px' }}>👥 {g.passenger_list}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function FleetPage() {
  const router  = useRouter()
  const [user,        setUser]        = useState(null)
  const [date,        setDate]        = useState(isoToday())
  const [vehicles,    setVehicles]    = useState([])
  const [trips,       setTrips]       = useState([])
  const [locsMap,     setLocsMap]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown,   setCountdown]   = useState(30)
  const [now,         setNow]         = useState(new Date())
  const [liveConnected, setLive]      = useState(false)
  const [routeDurMap,   setRouteDurMap]   = useState({})   // { "fromId||toId": duration_min }
  const [trafficAlerts, setTrafficAlerts] = useState([])   // alert da traffic-check
  const [refreshingTraffic, setRefreshingTraffic] = useState(false)
  const [trafficMsg,    setTrafficMsg]    = useState(null)

  // Ref per evitare stale closure nel channel Realtime
  const dateRef = useRef(date)
  useEffect(() => { dateRef.current = date }, [date])

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUser(user)
    })
  }, [])

  // ── Carica dati ───────────────────────────────────────────
  const loadData = useCallback(async (targetDate) => {
    if (!PRODUCTION_ID) return
    setLoading(true)

    const d = targetDate ?? dateRef.current

    const [vR, tR, lR, rR] = await Promise.all([
      supabase.from('vehicles')
        .select('id,vehicle_type,driver_name,sign_code,capacity,unit_default')
        .eq('production_id', PRODUCTION_ID)
        .eq('active', true)
        .order('vehicle_type').order('id'),
      supabase.from('trips')
        .select('id,trip_id,vehicle_id,pickup_id,dropoff_id,transfer_class,pickup_min,call_min,start_dt,end_dt,status,pax_count,passenger_list,service_type,duration_min,date')
        .eq('production_id', PRODUCTION_ID)
        .eq('date', d),
      supabase.from('locations')
        .select('id,name')
        .eq('production_id', PRODUCTION_ID),
      supabase.from('routes')
        .select('from_id,to_id,duration_min')
        .eq('production_id', PRODUCTION_ID),
    ])

    if (vR.data) setVehicles(vR.data)
    if (tR.data) setTrips(tR.data)
    if (lR.data) {
      const m = {}
      lR.data.forEach(l => { m[l.id] = l.name })
      setLocsMap(m)
    }
    if (rR.data) {
      const rm = {}
      rR.data.forEach(r => { rm[`${r.from_id}||${r.to_id}`] = r.duration_min })
      setRouteDurMap(rm)
    }

    setLoading(false)
    setLastRefresh(new Date())
    setCountdown(30)
  }, [])

  // Carica quando user è pronto o la data cambia
  useEffect(() => {
    if (user) loadData(date)
  }, [user, date, loadData])

  // ── Supabase Realtime ─────────────────────────────────────
  useEffect(() => {
    if (!PRODUCTION_ID) return
    const channel = supabase
      .channel('fleet-monitor-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `production_id=eq.${PRODUCTION_ID}` },
        () => { loadData(dateRef.current) }
      )
      .subscribe(status => {
        setLive(status === 'SUBSCRIBED')
      })
    return () => { supabase.removeChannel(channel); setLive(false) }
  }, [loadData])

  // ── Auto-refresh every 30s ─────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => loadData(dateRef.current), REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [loadData])

  // ── Countdown display ─────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCountdown(c => (c <= 1 ? 30 : c - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  // ── "Now" tick per progress bar ───────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // ── Elabora dati ──────────────────────────────────────────
  // Per ogni veicolo: raggruppa i suoi trip per trip_id
  const vehicleData = vehicles.map(v => {
    const vTrips = trips.filter(t => t.vehicle_id === v.id)
    const groups  = groupByTripId(vTrips)
    const { status, current, next, last } = vehicleStatus(groups, now)
    return { vehicle: v, groups, status, current, next, last }
  })

  // Ordina: BUSY → FREE → IDLE → DONE
  const ORDER = { BUSY: 0, FREE: 1, IDLE: 2, DONE: 3 }
  vehicleData.sort((a, b) => (ORDER[a.status] ?? 4) - (ORDER[b.status] ?? 4))

  // Trip senza veicolo assegnato
  const unassigned = groupByTripId(trips.filter(t => !t.vehicle_id))

  // Stats header
  const counts = {
    BUSY: vehicleData.filter(v => v.status === 'BUSY').length,
    FREE: vehicleData.filter(v => v.status === 'FREE').length,
    IDLE: vehicleData.filter(v => v.status === 'IDLE').length,
    DONE: vehicleData.filter(v => v.status === 'DONE').length,
  }

  // ── Render ────────────────────────────────────────────────
  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Header ── */}
      <Navbar currentPath="/dashboard/fleet" />

      {/* ── Sub-toolbar ── */}
      <PageHeader
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>🚦</span>
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Fleet Monitor</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '8px' }}>
              <button onClick={() => setDate(isoAdd(date, -1))}
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>◀</button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
              <button onClick={() => setDate(isoAdd(date, 1))}
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>▶</button>
              <button onClick={() => setDate(isoToday())}
                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Today</button>
            </div>
            <div style={{ display: 'flex', gap: '5px', marginLeft: '4px' }}>
              {Object.entries(counts).map(([s, n]) => n > 0 && (
                <span key={s} style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                  background: SS[s].badgeBg, color: SS[s].badge, border: `1px solid ${SS[s].border}`,
                }}>
                  {n} {s}
                </span>
              ))}
            </div>
          </div>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#94a3b8' }}>
            {lastRefresh && <span>{fmtLastRefresh(lastRefresh)}</span>}
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>Refresh in {countdown}s</span>
            <button onClick={() => loadData(date)}
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {loading ? '…' : '↻'} Refresh
            </button>
            <button
              onClick={async () => {
                setRefreshingTraffic(true)
                setTrafficMsg(null)
                setTrafficAlerts([])
                try {
                  const res  = await fetch('/api/routes/traffic-check', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ date }),
                  })
                  const data = await res.json()
                  if (data.error) throw new Error(data.error)
                  setTrafficAlerts(data.alerts || [])
                  const w = data.warningsCount || 0
                  setTrafficMsg(
                    w > 0
                      ? `${data.alerts.some(a => a.severity === 'CRITICAL') ? '🚨' : '⚠️'} ${w} warning${w > 1 ? 's' : ''} on ${data.checkedRoutes} routes`
                      : `✅ No issues — ${data.checkedRoutes} routes checked`
                  )
                } catch (e) {
                  setTrafficMsg(`⚠ ${e.message}`)
                } finally {
                  setRefreshingTraffic(false)
                  setTimeout(() => setTrafficMsg(null), 10000)
                }
              }}
              disabled={refreshingTraffic}
              title="Aggiorna durate rotte con traffico reale Google"
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: '7px',
                padding: '5px 12px', cursor: refreshingTraffic ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: '700', color: '#15803d',
                display: 'flex', alignItems: 'center', gap: '4px',
                opacity: refreshingTraffic ? 0.7 : 1,
              }}>
              {refreshingTraffic ? '⏳' : '🚦'} Traffico
            </button>
            {trafficMsg && (
              <span style={{ fontSize: '11px', color: trafficMsg.startsWith('✅') ? '#15803d' : '#b91c1c', fontWeight: '600' }}>
                {trafficMsg}
              </span>
            )}
          </div>
        }
      />

      {/* ── Body ── */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '20px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {loading && vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚦</div>
            <div>Loading Fleet Monitor…</div>
          </div>
        ) : vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚐</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              No active vehicles
            </div>
            <a href="/dashboard/vehicles" style={{ color: '#2563eb', fontSize: '13px' }}>
              → Add vehicles on the Vehicles page
            </a>
          </div>
        ) : (
          <>
            {/* Data label quando non è oggi */}
            {date !== isoToday() && (
              <div style={{ marginBottom: '16px', padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12px', color: '#92400e', fontWeight: '600' }}>
                📅 Viewing: {fmtDate(date)} — BUSY/FREE status based on current time ({pad2(now.getHours())}:{pad2(now.getMinutes())})
              </div>
            )}

            {/* Griglia veicoli */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {vehicleData.map(({ vehicle, groups }) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  groups={groups}
                  locsMap={locsMap}
                  routeDurMap={routeDurMap}
                  vehicleTrafficAlerts={trafficAlerts.filter(a => a.vehicleId === vehicle.id)}
                  now={now}
                />
              ))}
            </div>

            {/* Trip senza veicolo */}
            {unassigned.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ⚠ Trips without vehicle ({unassigned.length})
                  </div>
                  <div style={{ flex: 1, height: '1px', background: '#fecaca' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {unassigned.map(g => {
                    const clsInfo = CLS[g.transfer_class] || CLS.STANDARD
                    const from = (locsMap[g.pickup_id] || g.pickup_id || '–')
                    const to   = g.dropoff_ids.map(id => locsMap[id] || id || '–').join(' / ')
                    return (
                      <div key={g.trip_id} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '9px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: clsInfo.dot, flexShrink: 0 }} />
                        <span style={{ fontWeight: '700', color: '#374151', fontFamily: 'monospace' }}>{g.trip_id}</span>
                        <span style={{ color: '#0f172a', fontWeight: '600' }}>{from} → {to}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
                          {minToHHMM(g.pickup_min ?? g.call_min)} · {clsInfo.label}
                        </span>
                        <a href="/dashboard/trips" style={{ color: '#2563eb', fontWeight: '700', textDecoration: 'none', marginLeft: '4px', fontSize: '11px' }}>
                          Assign →
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Legenda */}
            <div style={{ marginTop: '32px', padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em' }}>LEGEND</span>
              {Object.entries(SS).map(([s, st]) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: st.badge }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: st.badgeBg, border: `1px solid ${st.border}` }} />
                  <strong>{s}</strong>
                  {s === 'BUSY' && ' — trip in progress now'}
                  {s === 'FREE' && ' — future trips, none in progress'}
                  {s === 'IDLE' && ' — no trips today'}
                  {s === 'DONE' && ' — all trips completed'}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>
                Auto-refresh every {REFRESH_INTERVAL / 1000}s · Realtime enabled
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
