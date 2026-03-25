'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

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
  if (min < 1)  return 'ora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
function fmtLastRefresh(d) {
  if (!d) return ''
  return 'Aggiornato ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
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
function groupByTripId(tripRows) {
  const map = {}
  for (const t of tripRows) {
    const sd = t.start_dt ? new Date(t.start_dt) : null
    const ed = t.end_dt   ? new Date(t.end_dt)   : null
    if (!sd || !ed) continue  // salta righe senza timestamp

    if (!map[t.trip_id]) {
      map[t.trip_id] = {
        trip_id:        t.trip_id,
        vehicle_id:     t.vehicle_id,
        pickup_id:      t.pickup_id,
        dropoff_ids:    [t.dropoff_id],
        transfer_class: t.transfer_class,
        pickup_min:     t.pickup_min,
        call_min:       t.call_min,
        pax_count:      t.pax_count || 0,
        minStart:       sd,
        maxEnd:         ed,
        rows:           [t],
      }
    } else {
      const g = map[t.trip_id]
      if (!g.dropoff_ids.includes(t.dropoff_id)) g.dropoff_ids.push(t.dropoff_id)
      g.rows.push(t)
      g.pax_count = Math.max(g.pax_count, t.pax_count || 0)
      if (sd < g.minStart) { g.minStart = sd; g.pickup_min = t.pickup_min; g.call_min = t.call_min }
      if (ed > g.maxEnd)   { g.maxEnd = ed }
    }
  }
  return Object.values(map).sort((a, b) => a.minStart - b.minStart)
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
function VehicleCard({ vehicle, groups, locsMap, now }) {
  const { status, current, next, last } = vehicleStatus(groups, now)
  const s    = SS[status] || SS.IDLE
  const icon = TYPE_ICON[vehicle.vehicle_type] || '🚐'

  // Progress bar per BUSY
  const progress = (status === 'BUSY' && current)
    ? Math.min(100, Math.max(0, (now - current.minStart) / (current.maxEnd - current.minStart) * 100))
    : 0

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
        <span style={{
          padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800',
          background: s.badgeBg, color: s.badge, border: `1px solid ${s.border}`,
          flexShrink: 0, letterSpacing: '0.06em', whiteSpace: 'nowrap',
        }}>
          {s.label}
        </span>
      </div>

      {/* ── BUSY ── */}
      {status === 'BUSY' && current && (
        <>
          {/* Rotta corrente */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', letterSpacing: '0.05em', marginBottom: '3px' }}>
              IN CORSO
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', lineHeight: 1.4 }}>
              {routeLabel(current)}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              {tripTimeLabel(current)}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: '600' }}>
              <span>Start {dtToHHMM(current.minStart)}</span>
              <span style={{ fontWeight: '800', fontSize: '12px' }}>{Math.round(progress)}%</span>
              <span>ETA {dtToHHMM(current.maxEnd)}</span>
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
              <span style={{ fontWeight: '700', color: '#374151' }}>Next</span>{' '}
              {routeLabel(next)} · {minToHHMM(next.pickup_min ?? next.call_min)} · in {fmtRelative(minutesUntil(next.minStart, now))}
            </div>
          )}
        </>
      )}

      {/* ── FREE ── */}
      {status === 'FREE' && next && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#14532d', letterSpacing: '0.05em', marginBottom: '3px' }}>
            PROSSIMO TRIP
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
        </div>
      )}

      {/* ── IDLE ── */}
      {status === 'IDLE' && (
        <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>
          Nessun trip programmato per oggi
        </div>
      )}

      {/* ── DONE ── */}
      {status === 'DONE' && last && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af', letterSpacing: '0.05em', marginBottom: '3px' }}>
            ULTIMO TRIP
          </div>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            {routeLabel(last)} · terminato alle {dtToHHMM(last.maxEnd)}
          </div>
        </div>
      )}

      {/* ── Footer: riepilogo giornata ── */}
      {groups.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: '8px',
          display: 'flex', gap: '16px', fontSize: '10px', color: '#94a3b8',
        }}>
          <span>{groups.length} trip{groups.length > 1 ? 's' : ''} oggi</span>
          <span>Inizio {dtToHHMM(groups[0]?.minStart)}</span>
          <span>Fine {dtToHHMM(groups[groups.length - 1]?.maxEnd)}</span>
          {groups.some(g => g.pax_count > 0) && (
            <span>
              {groups.reduce((sum, g) => sum + (g.pax_count || 0), 0)} pax totali
            </span>
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

    const [vR, tR, lR] = await Promise.all([
      supabase.from('vehicles')
        .select('id,vehicle_type,driver_name,sign_code,capacity,unit_default')
        .eq('production_id', PRODUCTION_ID)
        .eq('active', true)
        .order('vehicle_type').order('id'),
      supabase.from('trips')
        .select('id,trip_id,vehicle_id,pickup_id,dropoff_id,transfer_class,pickup_min,call_min,start_dt,end_dt,status,pax_count')
        .eq('production_id', PRODUCTION_ID)
        .eq('date', d),
      supabase.from('locations')
        .select('id,name')
        .eq('production_id', PRODUCTION_ID),
    ])

    if (vR.data) setVehicles(vR.data)
    if (tR.data) setTrips(tR.data)
    if (lR.data) {
      const m = {}
      lR.data.forEach(l => { m[l.id] = l.name })
      setLocsMap(m)
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

  // ── Auto-refresh ogni 30s ─────────────────────────────────
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

  const NAV = [
    { l: 'Dashboard', p: '/dashboard' }, { l: 'Fleet', p: '/dashboard/fleet' },
    { l: 'Trips', p: '/dashboard/trips' }, { l: 'Lists', p: '/dashboard/lists' },
    { l: 'Crew', p: '/dashboard/crew' }, { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
    { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
    { l: 'Reports', p: '/dashboard/reports' }, { l: 'QR', p: '/dashboard/qr-codes' },
    { l: 'Locations', p: '/dashboard/locations' }, { l: 'Vehicles', p: '/dashboard/vehicles' },
    { l: '🎬 Prods', p: '/dashboard/productions' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{
                padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                color:      p === '/dashboard/fleet' ? 'white' : '#94a3b8',
                background: p === '/dashboard/fleet' ? '#1e3a5f' : 'transparent',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: liveConnected ? '#4ade80' : '#64748b' }}>
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: liveConnected ? '#4ade80' : '#64748b', boxShadow: liveConnected ? '0 0 6px #4ade80' : 'none' }} />
            {liveConnected ? 'LIVE' : 'offline'}
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Sub-toolbar ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: '52px', zIndex: 20 }}>

        {/* Sinistra: titolo + date nav */}
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
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Oggi</button>
          </div>

          {/* Badge stats */}
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

        {/* Destra: refresh info + pulsante */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#94a3b8' }}>
          {lastRefresh && <span>{fmtLastRefresh(lastRefresh)}</span>}
          <span style={{ color: '#cbd5e1' }}>·</span>
          <span>Refresh in {countdown}s</span>
          <button onClick={() => loadData(date)}
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {loading ? '…' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>

        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '20px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> non impostato in .env.local
          </div>
        )}

        {loading && vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚦</div>
            <div>Caricamento Fleet Monitor…</div>
          </div>
        ) : vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚐</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              Nessun veicolo attivo
            </div>
            <a href="/dashboard/vehicles" style={{ color: '#2563eb', fontSize: '13px' }}>
              → Aggiungi veicoli nella pagina Vehicles
            </a>
          </div>
        ) : (
          <>
            {/* Data label quando non è oggi */}
            {date !== isoToday() && (
              <div style={{ marginBottom: '16px', padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12px', color: '#92400e', fontWeight: '600' }}>
                📅 Visualizzando: {fmtDate(date)} — gli status BUSY/FREE si basano sull'ora attuale ({pad2(now.getHours())}:{pad2(now.getMinutes())})
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
                  now={now}
                />
              ))}
            </div>

            {/* Trip senza veicolo */}
            {unassigned.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ⚠ Trip senza veicolo ({unassigned.length})
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
                          Assegna →
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Legenda */}
            <div style={{ marginTop: '32px', padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em' }}>LEGENDA</span>
              {Object.entries(SS).map(([s, st]) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: st.badge }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: st.badgeBg, border: `1px solid ${st.border}` }} />
                  <strong>{s}</strong>
                  {s === 'BUSY' && ' — trip in corso adesso'}
                  {s === 'FREE' && ' — trip futuri, nessuno in corso'}
                  {s === 'IDLE' && ' — nessun trip oggi'}
                  {s === 'DONE' && ' — tutti i trip completati'}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>
                Auto-refresh ogni {REFRESH_INTERVAL / 1000}s · Realtime abilitato
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
