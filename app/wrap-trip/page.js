'use client'

/**
 * /wrap-trip — Wrap Trip mobile wizard
 * 4 steps: Trip Details → Vehicle → Passengers → Confirm
 * QR scanner: html5-qrcode (iOS Safari, Chrome Android, Samsung Browser)
 * No native <select> elements — all pickers are touch-friendly tappable lists
 */

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { getProductionId } from '../../lib/production'

const SESSION_KEY   = 'captain_wrap_trip_v4'

const SERVICE_TYPES = ['Wrap', 'Hotel Run', 'Airport', 'Unit Move', 'Charter', 'Shuttle', 'Other']

// ─── Utility ───────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function isoToday() { return new Date().toISOString().split('T')[0] }
function nowHHMM()  { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}
function fmtTime(isoStr) {
  if (!isoStr) return '–'
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ─── LocalStorage ──────────────────────────────────────────────
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
function saveTo(obj) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)) } catch {}
}
function clearSaved() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

// ─── Picker Modal (replaces <select>) ──────────────────────────
function PickerModal({ title, items, selected, onSelect, onClose, showSearch = true }) {
  const [q, setQ] = useState('')
  const filtered = q
    ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()))
    : items

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
          <div style={{ width: '36px', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px' }}>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>{title}</span>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>✕</button>
        </div>
        {/* Search */}
        {showSearch && (
          <div style={{ padding: '0 16px 10px' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        )}
        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No results</div>
          )}
          {filtered.map(item => (
            <div key={item.value} onClick={() => { onSelect(item.value); onClose() }}
              style={{
                padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid #f8fafc', background: selected === item.value ? '#eff6ff' : 'white',
                cursor: 'pointer',
              }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: selected === item.value ? '700' : '500', color: '#0f172a' }}>{item.label}</div>
                {item.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{item.sub}</div>}
              </div>
              {selected === item.value && <span style={{ color: '#2563eb', fontSize: '20px' }}>✓</span>}
            </div>
          ))}
        </div>
        {/* Bottom safe area */}
        <div style={{ height: '20px', flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ─── Field Button (tappable, replaces <select>) ─────────────────
function FieldButton({ label, value, placeholder, onClick, icon }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{label}</label>
      <button onClick={onClick} style={{
        width: '100%', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '10px',
        fontSize: '15px', color: value ? '#0f172a' : '#94a3b8', background: 'white',
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: value ? '600' : '400',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{value || placeholder}</span>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
      </button>
    </div>
  )
}

// ─── QR Scanner Modal ──────────────────────────────────────────
function QrScannerModal({ title, onScan, onClose }) {
  const READER_ID = 'captain-qr-reader'
  const qrRef     = useRef(null)
  const [scanErr, setScanErr] = useState('')

  useEffect(() => {
    let scanner = null
    const timer = setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        scanner = new Html5Qrcode(READER_ID)
        qrRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            scanner.stop().catch(() => {})
            qrRef.current = null
            onScan(text)
          }
        )
      } catch (e) {
        setScanErr(e?.message || 'Camera unavailable. Check permissions.')
      }
    }, 150)

    return () => {
      clearTimeout(timer)
      if (qrRef.current) { qrRef.current.stop().catch(() => {}); qrRef.current = null }
    }
  }, [onScan])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0f2340', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ color: 'white', fontWeight: '800', fontSize: '15px' }}>📷 {title}</span>
        <button onClick={onClose} style={{ color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div id={READER_ID} style={{ width: '100%', maxWidth: '320px', borderRadius: '16px', overflow: 'hidden', background: '#111' }} />
        {scanErr && <div style={{ marginTop: '16px', color: '#f87171', fontSize: '13px', textAlign: 'center', maxWidth: '280px', lineHeight: '1.5' }}>❌ {scanErr}</div>}
        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '16px', textAlign: 'center' }}>Point the camera at a QR code</p>
      </div>
    </div>
  )
}

// ─── Step Bar ──────────────────────────────────────────────────
function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', gap: '5px', padding: '10px 16px 0' }}>
      {[1,2,3,4].map(n => (
        <div key={n} style={{ height: '4px', flex: 1, borderRadius: '2px', background: n < current ? '#2563eb' : n === current ? '#93c5fd' : '#e2e8f0', transition: 'background 0.25s' }} />
      ))}
    </div>
  )
}

// ─── Crew Avatar ───────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: size * 0.33, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

// ─── Fleet Monitor ─────────────────────────────────────────────
function FleetMonitor({ onBack }) {
  const PRODUCTION_ID = getProductionId()
  const [date,           setDate]           = useState(isoToday())
  const [vehicles,       setVehicles]       = useState([])
  const [trips,          setTrips]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [expanded,       setExpanded]       = useState({})
  const [tick,           setTick]           = useState(0)
  const [locsMap,        setLocsMap]        = useState({})
  const [trafficAlerts,  setTrafficAlerts]  = useState([])   // alert da traffic-check
  const [loadingTraffic, setLoadingTraffic] = useState(false)
  const [trafficMsg,     setTrafficMsg]     = useState(null)
  const [autoRefresh,    setAutoRefresh]    = useState(true)

  const loadFleet = useCallback(async (d) => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const [vRes, tRes, lRes] = await Promise.all([
      supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
      supabase.from('trips').select('id,trip_id,vehicle_id,start_dt,end_dt,status,pax_count,service_type,passenger_list,pickup_id,dropoff_id,duration_min,date,pickup_min,call_min').eq('production_id', PRODUCTION_ID).eq('date', d).neq('status', 'CANCELLED').order('start_dt'),
      supabase.from('locations').select('id,name').eq('production_id', PRODUCTION_ID),
    ])
    setVehicles(vRes.data || [])
    setTrips(tRes.data || [])
    const lm = {}; (lRes.data || []).forEach(l => { lm[l.id] = l.name }); setLocsMap(lm)
    setLoading(false)
  }, [])

  useEffect(() => { loadFleet(date) }, [date, loadFleet])

  // Real-time ticker: update now every 30s
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => { setTick(t => t + 1); loadFleet(date) }, 30000)
    return () => clearInterval(id)
  }, [autoRefresh, date, loadFleet])

  const now = new Date()

  function computeTripWindow(t) {
    if (t.start_dt && t.end_dt) return { s: new Date(t.start_dt), e: new Date(t.end_dt) }
    const pmin = t.pickup_min ?? t.call_min
    if (pmin == null || !t.duration_min || !t.date) return null
    const [y, mo, dd] = t.date.split('-').map(Number)
    const startMs = new Date(y, mo - 1, dd, Math.floor(pmin / 60), pmin % 60, 0, 0).getTime()
    const rtMult = ['Wrap', 'Charter', 'Other'].includes(t.service_type) ? 2 : 1
    return { s: new Date(startMs), e: new Date(startMs + t.duration_min * rtMult * 60000) }
  }

  function tripStatus(t) {
    const w = computeTripWindow(t)
    if (!w) return t.status === 'BUSY' ? 'BUSY' : t.status === 'DONE' ? 'DONE' : 'PLANNED'
    if (now >= w.s && now <= w.e) return 'BUSY'
    if (now > w.e) return 'DONE'
    return 'PLANNED'
  }

  function vstatus(vId) {
    const vt = trips.filter(t => t.vehicle_id === vId)
    if (!vt.length) return 'IDLE'
    if (vt.find(t => tripStatus(t) === 'BUSY')) return 'BUSY'
    if (vt.find(t => tripStatus(t) === 'PLANNED')) return 'FREE'
    return 'DONE'
  }

  function tripProgress(t) {
    const w = computeTripWindow(t)
    if (!w) return null
    const s = w.s.getTime(), e = w.e.getTime(), n = now.getTime()
    if (n < s || n > e) return null
    return Math.min(100, Math.max(0, Math.round((n - s) / (e - s) * 100)))
  }

  const sc = {
    BUSY: { c: '#b91c1c', bg: '#fee2e2', lbl: '🔴 BUSY', bd: '#ef4444' },
    FREE: { c: '#15803d', bg: '#dcfce7', lbl: '🟢 FREE', bd: '#22c55e' },
    IDLE: { c: '#64748b', bg: '#f1f5f9', lbl: '⚪ IDLE', bd: '#94a3b8' },
    DONE: { c: '#92400e', bg: '#fef9c3', lbl: '🟡 DONE', bd: '#f59e0b' },
  }
  const counts = vehicles.reduce((a, v) => { const s = vstatus(v.id); a[s] = (a[s] || 0) + 1; return a }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#0f2340', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: '900', color: 'white' }}>🚗 Fleet Monitor</span>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>← Trip</button>
      </div>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>{date === isoToday() ? 'Today' : date}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); loadFleet(e.target.value) }}
              style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', background: 'white' }} />
            <button onClick={() => loadFleet(date)} style={{ background: '#0f2340', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>↻</button>
            <button
              onClick={() => setAutoRefresh(p => !p)}
              style={{
                background: autoRefresh ? '#dcfce7' : '#fef2f2',
                color: autoRefresh ? '#15803d' : '#dc2626',
                border: `1px solid ${autoRefresh ? '#86efac' : '#fecaca'}`,
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
              {autoRefresh ? '⏸' : '▶'}
            </button>
            <button
              onClick={async () => {
                setLoadingTraffic(true)
                setTrafficMsg(null)
                setTrafficAlerts([])
                try {
                  const res  = await fetch('/api/routes/traffic-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date }),
                  })
                  const data = await res.json()
                  if (data.error) throw new Error(data.error)
                  setTrafficAlerts(data.alerts || [])
                  const w = data.warningsCount || 0
                  setTrafficMsg(w > 0 ? `${w} warning${w > 1 ? 's' : ''}` : '✅ Clear')
                  setTimeout(() => setTrafficMsg(null), 8000)
                } catch (e) {
                  setTrafficMsg('⚠ ' + e.message.slice(0, 30))
                } finally {
                  setLoadingTraffic(false)
                }
              }}
              disabled={loadingTraffic}
              style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: '800', cursor: loadingTraffic ? 'wait' : 'pointer' }}>
              {loadingTraffic ? '⏳' : '🚦'}
            </button>
            {trafficMsg && (
              <span style={{ fontSize: '10px', fontWeight: '700', color: trafficMsg.startsWith('✅') ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                {trafficMsg}
              </span>
            )}
          </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', padding: '10px 16px', flexWrap: 'wrap', flexShrink: 0 }}>
        {Object.entries(counts).map(([s, n]) => (
          <span key={s} style={{ background: sc[s].bg, color: sc[s].c, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>{sc[s].lbl} {n}</span>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px' }}>
        {loading
          ? <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading…</div>
          : vehicles.map(v => {
            const s = vstatus(v.id); const cfg = sc[s]
            const vt = trips.filter(t => t.vehicle_id === v.id)
            const open = expanded[v.id]
            const cur  = vt.find(t => tripStatus(t) === 'BUSY')
            const next = vt.filter(t => tripStatus(t) === 'PLANNED').sort((a, b) => { const wa = computeTripWindow(a), wb = computeTripWindow(b); return (wa?.s || 0) - (wb?.s || 0) })[0]
            const progress = cur ? tripProgress(cur) : null
            // Back at = end of current trip; Next at = start of next planned trip
            const curW = cur ? computeTripWindow(cur) : null
            const nextW = next ? computeTripWindow(next) : null
            const backAt = curW ? fmtTime(curW.e.toISOString()) : null
            const nextAt = !cur && nextW ? fmtTime(nextW.s.toISOString()) : null
            const minsLeft = curW ? Math.round((curW.e - now) / 60000) : null
            // Traffic alert per questo veicolo
            const curAlert  = trafficAlerts.find(a => a.vehicleId === v.id && a.status === 'BUSY')  ?? null
            const nextAlert = trafficAlerts.find(a => a.vehicleId === v.id && a.status === 'PLANNED') ?? null

            return (
              <div key={v.id} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderLeft: `4px solid ${cfg.bd}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
                <div onClick={() => setExpanded(ex => ({ ...ex, [v.id]: !ex[v.id] }))} style={{ padding: '10px 14px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{v.id} — {v.sign_code}</div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{v.driver_name} · {v.vehicle_type} · {v.capacity} pax</div>
                    {/* Return time — prominent */}
                    {/* Dropoff completed — returning (Wrap round-trip, past 50%) */}
                    {progress !== null && progress >= 50 && cur && ['Wrap', 'Charter', 'Other'].includes(cur.service_type) && (
                      <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '800', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✅ Dropoff done — returning to {locsMap[cur.pickup_id] || 'base'}
                      </div>
                    )}
                    {/* Traffic Alert (BUSY) */}
                    {curAlert && (
                      <div style={{
                        fontSize: '11px', fontWeight: '700', marginTop: '3px', lineHeight: 1.4,
                        padding: '5px 8px', borderRadius: '6px',
                        background: curAlert.severity === 'CRITICAL' ? '#fee2e2' : '#fffbeb',
                        color:      curAlert.severity === 'CRITICAL' ? '#b91c1c' : '#92400e',
                        border:    `1px solid ${curAlert.severity === 'CRITICAL' ? '#fca5a5' : '#fde68a'}`,
                      }}>
                        {curAlert.severity === 'CRITICAL' ? '🚨' : '⚠️'} {curAlert.message}
                      </div>
                    )}
                    {backAt && !curAlert && (
                      <div style={{ fontSize: '12px', fontWeight: '800', color: '#b91c1c', marginTop: '2px' }}>
                        ⏱ Back at {cur && ['Wrap', 'Charter', 'Other'].includes(cur.service_type) && cur.pickup_id ? (locsMap[cur.pickup_id] || 'base') + ' ' : ''}{backAt}{minsLeft !== null && minsLeft > 0 ? ` (${minsLeft} min)` : ''}
                      </div>
                    )}
                    {backAt && curAlert && (
                      <div style={{ fontSize: '12px', fontWeight: '800', color: curAlert.severity === 'CRITICAL' ? '#b91c1c' : '#92400e', marginTop: '2px' }}>
                        ⏱ ETA {curAlert.dropoffEtaStr || backAt}{curAlert.delayMin > 0 ? ` (+${curAlert.delayMin}min)` : ''}
                        {curAlert.backEtaStr ? ` · ↩ ${curAlert.backEtaStr}` : ''}
                      </div>
                    )}
                    {nextAt && !nextAlert && <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '700', marginTop: '2px' }}>🟢 Next at {nextAt}</div>}
                    {nextAt && nextAlert && (
                      <div style={{ fontSize: '11px', color: nextAlert.severity === 'CRITICAL' ? '#b91c1c' : '#92400e', fontWeight: '700', marginTop: '2px' }}>
                        {nextAlert.severity === 'CRITICAL' ? '🚨' : '⚠️'} Next {nextAt} — {nextAlert.message.slice(0, 60)}…
                      </div>
                    )}
                    {cur?.passenger_list && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👥 {cur.passenger_list}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{ background: cfg.bg, color: cfg.c, padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>{cfg.lbl}</span>
                    <span style={{ color: '#94a3b8', fontSize: '11px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                </div>

                {/* ── Progress bar for current trip ── */}
                {progress !== null && (
                  <div style={{ padding: '0 14px 10px' }}>
                    <div style={{ height: '6px', background: '#fee2e2', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: progress > 80 ? '#16a34a' : '#ef4444', borderRadius: '3px', transition: 'width 1s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                      <span>{fmtTime(curW?.s?.toISOString())}</span>
                      <span style={{ fontWeight: '700', color: progress > 80 ? '#16a34a' : '#b91c1c' }}>{progress}%</span>
                      <span>{fmtTime(curW?.e?.toISOString())}</span>
                    </div>
                  </div>
                )}

                {open && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {!vt.length
                      ? <div style={{ padding: '10px 14px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No trips today</div>
                      : vt.map((t, ti) => {
                        const ts = tripStatus(t)
                        const isCur = ts === 'BUSY'; const isDone = ts === 'DONE'
                        const prog = isCur ? tripProgress(t) : null
                        return (
                          <div key={t.id} style={{ borderTop: ti > 0 ? '1px solid #f8fafc' : 'none', background: isCur ? '#fff7ed' : 'white', opacity: isDone ? 0.55 : 1 }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 14px' }}>
                              <div style={{ flex: '0 0 48px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', fontWeight: '700' }}>{fmtTime(t.start_dt)}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{fmtTime(t.end_dt)}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', fontFamily: 'monospace' }}>
                                  {t.trip_id} {isCur ? '▶' : isDone ? '✓' : '⏳'}
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>{t.service_type || 'Trip'} · {t.pax_count || 0} pax</div>
                                {t.passenger_list && (
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', lineHeight: '1.4' }}>👥 {t.passenger_list}</div>
                                )}
                                {isCur && computeTripWindow(t)?.e && (
                                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#b91c1c', marginTop: '3px' }}>
                                    ⏱ Back at {fmtTime(computeTripWindow(t)?.e?.toISOString())}{minsLeft !== null && minsLeft > 0 ? ` — ${minsLeft} min left` : ''}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Inner progress bar */}
                            {prog !== null && (
                              <div style={{ padding: '0 14px 8px' }}>
                                <div style={{ height: '4px', background: '#fde8d8', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${prog}%`, background: prog > 80 ? '#16a34a' : '#f97316', borderRadius: '2px' }} />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    }
                  </div>
                )}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ─── Main Content ──────────────────────────────────────────────
function WrapTripContent() {
  const PRODUCTION_ID = getProductionId()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const preVehicle   = searchParams.get('vehicle') || ''

  // ── Picker modals ──
  const [picker, setPicker] = useState(null)  // null | 'service' | 'pickup' | 'dropoff'

  // ── QR scanner ──
  const [showScanner, setShowScanner] = useState(false)
  const [scanMode,    setScanMode]    = useState('vehicle')

  // ── Toast ──
  const [toast, setToast] = useState({ msg: '', type: '' })

  // ── Form ──
  const [step,        setStep]        = useState(1)
  const [date,        setDate]        = useState(isoToday())
  const [callTime,    setCallTime]    = useState(nowHHMM())
  const [callTimeAuto, setCallTimeAuto] = useState(true) // auto-updates to 'now' until user overrides
  const [serviceType, setServiceType] = useState('Wrap')
  const [pickupId,    setPickupId]    = useState('')
  const [dropoffId,   setDropoffId]   = useState('')

  // ── Trip data ──
  const [vehicle, setVehicle] = useState(null)
  const [selCrew, setSelCrew] = useState([])
  const [search,  setSearch]  = useState('')

  // ── UI ──
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(null)
  const [err,    setErr]    = useState('')
  const [loadErr, setLoadErr] = useState('')

  // ── Remote data ──
  const [locations, setLocations] = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [crew,      setCrew]      = useState([])

  const locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))

  // ── Auth check ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
    })
  }, [router])

  // ── Load data ──
  useEffect(() => {
    if (!PRODUCTION_ID) { setLoadErr('PRODUCTION_ID not set'); return }
    Promise.all([
      supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: true }).order('name'),
      supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
      supabase.from('crew').select('id,full_name,department,hotel_id').eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED').order('department').order('full_name'),
    ]).then(([lR, vR, cR]) => {
      if (lR.error) setLoadErr('DB error: ' + lR.error.message)
      setLocations(lR.data || [])
      setVehicles(vR.data || [])
      setCrew(cR.data || [])
    })
  }, [])

  // ── Restore localStorage ──
  useEffect(() => {
    const saved = loadSaved()
    if (!saved) return
    if (saved.date)        setDate(saved.date)
    // Restore callTime only if user manually locked it; in auto mode keep current time
    if (saved.callTimeAuto === false && saved.callTime) {
      setCallTime(saved.callTime)
      setCallTimeAuto(false)
    }
    // else: callTimeAuto stays true, callTime stays nowHHMM() from useState init
    if (saved.serviceType) setServiceType(saved.serviceType)
    if (saved.pickupId)    setPickupId(saved.pickupId)
    if (saved.dropoffId)   setDropoffId(saved.dropoffId)
    if (saved.vehicle)     setVehicle(saved.vehicle)
    if (saved.selCrew)     setSelCrew(saved.selCrew)
    if (saved.step && !preVehicle) setStep(saved.step)
  }, [])

  // ── Handle ?vehicle= from /scan ──
  useEffect(() => {
    if (!preVehicle || !vehicles.length) return
    const v = vehicles.find(x => x.id === preVehicle)
    if (v) { setVehicle(v); setStep(3) }
  }, [vehicles, preVehicle])

  // ── Persist ──
  useEffect(() => {
    saveTo({ date, callTime, callTimeAuto, serviceType, pickupId, dropoffId, vehicle, selCrew, step })
  }, [date, callTime, callTimeAuto, serviceType, pickupId, dropoffId, vehicle, selCrew, step])

  // ── Auto-update call time every 15s when in auto mode ──────
  useEffect(() => {
    if (!callTimeAuto) return
    const id = setInterval(() => setCallTime(nowHHMM()), 15_000)
    return () => clearInterval(id)
  }, [callTimeAuto])

  // ── Toast ──
  const showToast = useCallback((msg, type = '') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: '' }), 3500)
  }, [])

  // ── QR scan ──
  const handleScan = useCallback(async (rawText) => {
    setShowScanner(false)
    // If the QR contains a full URL (e.g. https://captaindispatch.com/scan?qr=VH:xxx),
    // extract the ?qr= parameter; otherwise use the raw text directly.
    let text = rawText.trim()
    try {
      const url = new URL(text)
      const qrParam = url.searchParams.get('qr')
      if (qrParam) text = qrParam
    } catch { /* not a URL — use text as-is */ }

    showToast('Resolving QR…')
    try {
      const res  = await fetch(`/api/qr/resolve?qr=${encodeURIComponent(text)}`)
      const data = await res.json()
      if (data.error) {
        // Fallback: try to match in local vehicles list (case-insensitive, partial)
        if (text.startsWith('VH:')) {
          const qrId = text.slice(3).toLowerCase().trim()
          const found = vehicles.find(v =>
            v.id.toLowerCase() === qrId ||
            v.id.toLowerCase().replace(/[^a-z0-9]/g, '') === qrId.replace(/[^a-z0-9]/g, '') ||
            v.sign_code?.toLowerCase() === qrId
          )
          if (found) {
            setVehicle(found)
            showToast('✅ Vehicle ' + found.id + ' assigned', 'success')
            setStep(3)
            return
          }
        }
        if (text.startsWith('CR:')) {
          const qrId = text.slice(3).toLowerCase().trim()
          // 1) try exact / fuzzy match in local list
          const found = crew.find(c =>
            c.id.toLowerCase() === qrId ||
            c.id.toLowerCase().replace(/[^a-z0-9]/g, '') === qrId.replace(/[^a-z0-9]/g, '')
          )
          if (found) {
            if (selCrew.find(x => x.id === found.id)) { showToast('⚠️ ' + found.full_name + ' already added', 'error'); return }
            setSelCrew(p => [...p, { id: found.id, full_name: found.full_name, department: found.department, hotel_id: found.hotel_id || null }])
            showToast('✅ ' + found.full_name + ' added', 'success')
            return
          }
          // 2) QR ID format doesn't match Supabase UUIDs → guide user to search
          showToast('QR code not linked — use search below', 'error')
          setStep(3)   // make sure we're on Passengers step
          setSearch('') // clear so user can type
          return
        }
        showToast('❌ ' + data.error + ' [' + text + ']', 'error')
        return
      }
      if (data.type === 'vehicle') {
        setVehicle({ id: data.id, driver_name: data.driver_name, sign_code: data.sign_code, capacity: data.capacity, vehicle_type: data.vehicle_type })
        showToast('✅ Vehicle ' + data.id + ' assigned', 'success')
        setStep(3)
      } else if (data.type === 'crew') {
        if (selCrew.find(c => c.id === data.id)) { showToast('⚠️ ' + data.full_name + ' already added', 'error'); return }
        setSelCrew(p => [...p, { id: data.id, full_name: data.full_name, department: data.department, hotel_id: data.hotel?.id || null }])
        showToast('✅ ' + data.full_name + ' added', 'success')
        setStep(3)
      }
    } catch (e) { showToast('❌ ' + e.message, 'error') }
  }, [selCrew, showToast, vehicles, crew])

  // ── Cancel ──
  function cancelTrip() {
    if (!confirm('Cancel this trip? All data will be cleared.')) return
    clearSaved()
    setDate(isoToday()); setCallTime(nowHHMM()); setCallTimeAuto(true); setServiceType('Wrap')
    setPickupId(''); setDropoffId(''); setVehicle(null); setSelCrew([])
    setStep(1); setErr('')
  }

  // ── Computed ──
  const grouped = selCrew.reduce((acc, c) => {
    const key = dropoffId || c.hotel_id || '__unknown__'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})
  const hotels = Object.keys(grouped)

  // ── Confirm ──
  async function handleConfirm() {
    if (!PRODUCTION_ID || hotels.length === 0) return
    setSaving(true); setErr('')
    const confirmTs = new Date().toISOString()
    try {
      const callMin = timeStrToMin(callTime)
      const now2 = new Date(confirmTs)
      const tripId = 'W_' + pad2(now2.getHours()) + pad2(now2.getMinutes()) + pad2(now2.getSeconds())
      for (const hotelId of hotels) {
        const effectiveDropoff = hotelId === '__unknown__' ? null : hotelId
        const { data: route } = await supabase.from('routes').select('duration_min').eq('production_id', PRODUCTION_ID).eq('from_id', pickupId).eq('to_id', effectiveDropoff).maybeSingle()
        const durMin = route?.duration_min || 30
        // Wrap/Charter/Other: entered time IS pickup; others: subtract duration
        const callIsPickup = ['Wrap', 'Charter', 'Other'].includes(serviceType)
        const pickupMin = callMin !== null
          ? (callIsPickup ? callMin : ((callMin - durMin) % 1440 + 1440) % 1440)
          : null
        const [y, mo, dd] = date.split('-').map(Number)
        const startMs = pickupMin !== null ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime() : null
        const startDt = startMs ? new Date(startMs).toISOString() : null
        const endDt   = startMs ? new Date(startMs + (callIsPickup ? 2 * durMin : durMin) * 60000).toISOString() : null
        const row = {
          production_id: PRODUCTION_ID, trip_id: tripId, date, service_type: serviceType,
          pickup_id: pickupId, dropoff_id: effectiveDropoff,
          vehicle_id: vehicle?.id || null, driver_name: vehicle?.driver_name || null,
          sign_code: vehicle?.sign_code || null, capacity: vehicle?.capacity || null,
          duration_min: durMin, call_min: callMin, pickup_min: pickupMin,
          start_dt: startDt, end_dt: endDt, status: 'PLANNED', pax_count: grouped[hotelId]?.length || 0,
        }
        const { data: ins, error: insErr } = await supabase.from('trips').insert(row).select('id').single()
        if (insErr) throw new Error(insErr.message)
        if (ins?.id && grouped[hotelId]?.length > 0) {
          await supabase.from('trip_passengers').insert(grouped[hotelId].map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id })))
        }
      }
      clearSaved()
      setDone({ tripId, count: hotels.length })
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  // ── Picker item lists ──
  const locationItems = [
    { value: '', label: '— Auto (passenger hotel) —', sub: '' },
    ...locations.filter(l => !l.is_hub).map(l => ({ value: l.id, label: l.name, sub: 'Location / Set' })),
    ...locations.filter(l => l.is_hub).map(l => ({ value: l.id, label: l.name + ' ✈', sub: 'Hub' })),
  ]
  const pickupItems = locations.map(l => ({ value: l.id, label: l.name + (l.is_hub ? ' ✈' : ''), sub: l.is_hub ? 'Hub' : 'Location / Set' }))
  const serviceItems = SERVICE_TYPES.map(s => ({ value: s, label: s }))

  // ── Styles ──
  const inp     = { width: '100%', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '15px', color: '#0f172a', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl     = { fontSize: '11px', fontWeight: '800', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }
  const btnBlue = (d) => ({ width: '100%', padding: '15px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: '800', cursor: d ? 'default' : 'pointer', background: d ? '#e2e8f0' : '#2563eb', color: d ? '#94a3b8' : 'white' })
  const btnDark = { width: '100%', padding: '15px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '800', cursor: 'pointer', background: '#0f2340', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
  const btnGreen = (d) => ({ width: '100%', padding: '15px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: '800', cursor: d ? 'default' : 'pointer', background: d ? '#94a3b8' : '#16a34a', color: 'white' })
  const btnOut  = { width: '100%', padding: '14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white', color: '#374151' }
  const btnRed  = { width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #fca5a5', fontSize: '13px', fontWeight: '700', cursor: 'pointer', background: 'transparent', color: '#b91c1c' }

  // ─────────────────────────────────────────────────────────────

  if (done) return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', background: '#dcfce7', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>✓</div>
      <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>Trip Created!</div>
      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>{done.tripId}</span>
        <br /><br />{done.count} stop{done.count > 1 ? 's' : ''} · {selCrew.length} passengers
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <a href="/dashboard/trips" style={{ display: 'block', background: '#0f2340', color: 'white', padding: '15px', borderRadius: '10px', fontSize: '15px', fontWeight: '800', textDecoration: 'none', textAlign: 'center' }}>📋 View Trips</a>
        <button onClick={() => { setStep(1); setSelCrew([]); setVehicle(null); setDone(null); setCallTime(nowHHMM()); setCallTimeAuto(true); setPickupId(''); setDropoffId(''); setServiceType('Wrap'); clearSaved() }} style={btnOut}>🔄 New Trip</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '420px', margin: '0 auto', padding: '0 0 60px' }}>

      {/* Picker modals */}
      {picker === 'service' && <PickerModal title="Service Type" items={serviceItems} selected={serviceType} onSelect={setServiceType} onClose={() => setPicker(null)} showSearch={false} />}
      {picker === 'pickup'  && <PickerModal title="Pickup Location" items={pickupItems} selected={pickupId} onSelect={setPickupId} onClose={() => setPicker(null)} />}
      {picker === 'dropoff' && <PickerModal title="Dropoff Override" items={locationItems} selected={dropoffId} onSelect={setDropoffId} onClose={() => setPicker(null)} />}

      {/* QR scanner */}
      {showScanner && <QrScannerModal title={scanMode === 'vehicle' ? 'Scan Vehicle QR' : 'Scan Crew Badge'} onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* Toast */}
      {toast.msg && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#b91c1c' : '#0f172a', color: 'white', padding: '10px 20px', borderRadius: '24px', fontSize: '13px', zIndex: 999, whiteSpace: 'nowrap', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}

      {/* DB error banner */}
      {loadErr && (
        <div style={{ margin: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
          ⚠️ {loadErr}
        </div>
      )}

      <StepBar current={step} />

      <div style={{ padding: '20px 16px' }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📦</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Wrap Trip</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Where are you? When do you leave?</div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>
                  {['Wrap', 'Charter', 'Other'].includes(serviceType) ? 'Departure / Pickup' : 'Call Time'}{' '}
                  {callTimeAuto
                    ? <span style={{ fontSize: '9px', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '999px', fontWeight: '700', letterSpacing: '0.04em' }}>AUTO</span>
                    : <button type="button" onClick={() => { setCallTime(nowHHMM()); setCallTimeAuto(true) }} style={{ fontSize: '9px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '999px', cursor: 'pointer', fontWeight: '700', marginLeft: '3px' }}>↩ Now</button>
                  }
                </label>
                <input
                  type="time"
                  value={callTime}
                  onChange={e => { setCallTime(e.target.value); setCallTimeAuto(false) }}
                  style={{ ...inp, fontWeight: '900', textAlign: 'center', borderColor: callTimeAuto ? '#86efac' : '#fde68a', background: callTimeAuto ? '#f0fdf4' : '#fffbeb' }}
                />
              </div>
            </div>

            <FieldButton label="Service Type" value={serviceType} placeholder="Select type…" onClick={() => setPicker('service')} />

            <FieldButton
              label={`Pickup — current location ${locations.length ? `(${locations.length} available)` : '(loading…)'}`}
              value={locsMap[pickupId] || ''}
              placeholder={locations.length === 0 ? 'Loading locations…' : 'Select location…'}
              onClick={() => locations.length > 0 && setPicker('pickup')}
            />

            <FieldButton label="Dropoff override (optional)" value={dropoffId ? (locsMap[dropoffId] || dropoffId) : ''} placeholder="— Auto (passenger hotel) —" onClick={() => setPicker('dropoff')} />

            <button onClick={() => setStep(2)} disabled={!date || !callTime || !pickupId} style={btnBlue(!date || !callTime || !pickupId)}>
              Next — Vehicle →
            </button>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🚐</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Vehicle</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Scan QR or select from list</div>
            </div>

            <button onClick={() => { setScanMode('vehicle'); setShowScanner(true) }} style={btnDark}>📷 Scan Vehicle QR</button>

            {vehicle && (
              <div style={{ padding: '14px 16px', background: '#eff6ff', border: '2px solid #2563eb', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '900', fontSize: '16px', color: '#1d4ed8' }}>{vehicle.id} — {vehicle.sign_code}</div>
                  <div style={{ fontSize: '12px', color: '#334155', marginTop: '3px' }}>{[vehicle.driver_name, vehicle.vehicle_type, vehicle.capacity ? `×${vehicle.capacity}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => setVehicle(null)} style={{ background: '#fee2e2', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: '#b91c1c', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em' }}>OR SELECT</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {vehicles.map(v => {
                const isSel = vehicle?.id === v.id
                return (
                  <div key={v.id} onClick={() => setVehicle(isSel ? null : v)}
                    style={{ padding: '13px 14px', borderRadius: '10px', border: `2px solid ${isSel ? '#2563eb' : '#e2e8f0'}`, background: isSel ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{v.id}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{[v.driver_name, v.sign_code, v.capacity ? `×${v.capacity}` : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    {isSel && <span style={{ color: '#2563eb', fontSize: '20px' }}>✓</span>}
                  </div>
                )
              })}
              <div onClick={() => setVehicle(null)} style={{ padding: '13px 14px', borderRadius: '10px', border: `2px solid ${!vehicle ? '#2563eb' : '#e2e8f0'}`, background: !vehicle ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                {!vehicle ? '✓ ' : ''}No vehicle
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep(1)} style={{ ...btnOut, flex: 1 }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ ...btnBlue(false), flex: 2 }}>Next →</button>
            </div>
            <button onClick={cancelTrip} style={btnRed}>✕ Cancel Trip</button>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>👥</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Passengers</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Scan badges or search manually</div>
            </div>

            <button onClick={() => { setScanMode('passenger'); setShowScanner(true) }} style={btnDark}>📷 Scan Crew Badge</button>

            {selCrew.length > 0 && (
              <>
                <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>👥 {selCrew.length} selected</span>
                  <button onClick={() => setSelCrew([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px', fontWeight: '700' }}>Remove all</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selCrew.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <Avatar name={c.full_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department} · {locsMap[c.hotel_id] || '?'}</div>
                      </div>
                      <button onClick={() => setSelCrew(p => p.filter(x => x.id !== c.id))} style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em' }}>OR SEARCH</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            <input type="text" placeholder="🔍  Search crew by name or department…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, fontSize: '14px' }} />

            {search && (
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
                {(() => {
                  const q = search.toLowerCase()
                  const filtered = crew.filter(c => !selCrew.find(x => x.id === c.id) && (c.full_name.toLowerCase().includes(q) || (c.department || '').toLowerCase().includes(q)))
                  if (!filtered.length) return <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No results</div>
                  return filtered.map(c => (
                    <div key={c.id} onClick={() => { setSelCrew(p => [...p, c]); setSearch('') }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                      <Avatar name={c.full_name} size={32} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department} · {locsMap[c.hotel_id] || '?'}</div>
                      </div>
                      <span style={{ color: '#16a34a', fontSize: '22px' }}>+</span>
                    </div>
                  ))
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep(2)} style={{ ...btnOut, flex: 1 }}>← Back</button>
              <button onClick={() => { setSearch(''); setStep(4) }} disabled={selCrew.length === 0} style={{ ...btnBlue(selCrew.length === 0), flex: 2 }}>Review ({selCrew.length}) →</button>
            </div>
            <button onClick={cancelTrip} style={btnRed}>✕ Cancel Trip</button>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Confirm Trip</div>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
              {[
                ['Date', date], [(['Wrap','Charter','Other'].includes(serviceType) ? 'Departure/Pickup' : 'Call Time'), callTime], ['Service', serviceType],
                ['Pickup', locsMap[pickupId] || pickupId],
                dropoffId ? ['Dropoff', locsMap[dropoffId] || dropoffId] : null,
                vehicle ? ['Vehicle', `${vehicle.id} — ${vehicle.sign_code}`] : ['Vehicle', 'None'],
                vehicle?.driver_name ? ['Driver', vehicle.driver_name] : null,
                ['Passengers', `${selCrew.length} pax`],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <span style={{ color: '#64748b', flexShrink: 0, marginRight: '12px' }}>{label}</span>
                  <span style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '8px' }}>STOPS ({hotels.length})</div>
              {hotels.map(hotelId => (
                <div key={hotelId} style={{ padding: '10px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '6px' }}>
                  <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                    → {hotelId === '__unknown__' ? '(unknown hotel)' : (locsMap[hotelId] || hotelId)}
                    <span style={{ fontWeight: '500', color: '#94a3b8', marginLeft: '6px' }}>{grouped[hotelId].length} pax</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.6' }}>{grouped[hotelId].map(c => c.full_name).join(', ')}</div>
                </div>
              ))}
            </div>

            {err && <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>}

            <button onClick={handleConfirm} disabled={saving || hotels.length === 0} style={btnGreen(saving || hotels.length === 0)}>
              {saving ? '⏳ Creating…' : '✅ Create Trip Now'}
            </button>
            <button onClick={() => setStep(3)} disabled={saving} style={btnOut}>← Edit Passengers</button>
            <button onClick={cancelTrip} disabled={saving} style={btnRed}>✕ Cancel Trip</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
function WrapTripPageInner() {
  const [showFleet, setShowFleet] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {!showFleet && (
        <div style={{ background: '#0f2340', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <span style={{ fontSize: '16px', fontWeight: '900', color: 'white', letterSpacing: '-0.5px' }}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowFleet(true)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>🚗 Fleet</button>
            <a href="/dashboard" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>←</a>
          </div>
        </div>
      )}
      {showFleet
        ? <FleetMonitor onBack={() => setShowFleet(false)} />
        : (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}>
            <WrapTripContent />
          </Suspense>
        )
      }
    </div>
  )
}

export default WrapTripPageInner
