'use client'
/**
 * /dashboard/bridge — ⚓ Captain Bridge
 * Admin panel: pending users approval + invite codes management.
 * Only accessible to users with CAPTAIN or ADMIN role.
 */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { ImportModal } from '../../../lib/ImportModal'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from 'recharts'

// ── helpers ──────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}
function copyText(t) {
  navigator.clipboard?.writeText(t).catch(() => {})
}

const ROLES = ['MANAGER', 'PRODUCTION', 'CAPTAIN']

// ── styles ───────────────────────────────────────────────
const card  = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px' }
const hdr   = { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const inp   = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const sel   = { ...inp, cursor: 'pointer' }
const lbl   = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
const btnPrimary  = { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }
const btnSecondary= { padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
const btnGreen    = { ...btnPrimary, background: '#16a34a' }
const btnRed      = { ...btnPrimary, background: '#dc2626' }

// ── Easy Access Shortcuts ─────────────────────────────────
function EasyAccessShortcuts({ currentPath }) {
  const shortcuts = [
    { icon: '🚀', label: 'Rocket',         href: '/dashboard/rocket' },
    { icon: '🚐', label: 'Fleet',          href: '/dashboard/fleet' },
    { icon: '👥', label: 'Pax',            href: '/dashboard/pax-coverage' },
    { icon: '🛣️',  label: 'Hub',           href: '/dashboard/hub-coverage' },
    { icon: '✈️',  label: 'Trips',         href: '/dashboard/trips' },
    { icon: '👤', label: 'Crew',           href: '/dashboard/crew' },
    { icon: '🚗', label: 'Vehicles',       href: '/dashboard/vehicles' },
    { icon: '📋', label: 'Transport List', href: '/dashboard/lists' },
  ]
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {shortcuts.map(s => (
        <a key={s.href} href={s.href}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', borderRadius: '8px', textDecoration: 'none',
            fontSize: '12px', fontWeight: '700',
            border: '1px solid',
            background: currentPath === s.href ? '#0f2340' : 'white',
            color:      currentPath === s.href ? 'white'   : '#374151',
            borderColor: currentPath === s.href ? '#0f2340' : '#e2e8f0',
            transition: 'all 0.15s',
          }}>
          <span>{s.icon}</span>
          <span>{s.label}</span>
        </a>
      ))}
    </div>
  )
}

// ── Notifications Panel ───────────────────────────────────
function NotificationsPanel({ productionId }) {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('notifications')
      .select('*')
      .eq('production_id', productionId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(data || []))
  }, [productionId])

  function dismiss(id) {
    supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (notifications.length === 0) return null

  const typeStyle = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#15803d', icon: '✅' },
    warning: { bg: '#fefce8', border: '#fde68a', color: '#a16207', icon: '⚠️' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '❌' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: 'ℹ️' },
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
        🚨 Alerts & Notifications
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {notifications.map(n => {
          const s = typeStyle[n.type] || typeStyle.info
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '8px' }}>
              <span>{s.icon}</span>
              <span style={{ flex: 1, fontSize: '13px', color: s.color, fontWeight: '600' }}>{n.message}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button onClick={() => dismiss(n.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', lineHeight: 1, padding: '2px 4px' }}>
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Drive Sync Widget ─────────────────────────────────────
function DriveSyncWidget({ productionId, onPreview }) {
  const [files,          setFiles]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [previewLoading, setPreviewLoading] = useState({})
  const [inlineMsg,      setInlineMsg]      = useState({})

  useEffect(() => {
    if (!productionId) return
    supabase
      .from('drive_synced_files')
      .select('id, file_id, file_name, last_modified, last_synced_at, import_mode')
      .eq('production_id', productionId)
      .then(({ data }) => {
        const updated = (data || []).filter(f =>
          !f.last_synced_at ||
          (f.last_modified && f.last_synced_at && f.last_modified > f.last_synced_at)
        )
        setFiles(updated)
        setLoading(false)
      })
  }, [productionId])

  if (loading || files.length === 0) return null

  async function handlePreview(file) {
    setPreviewLoading(prev => ({ ...prev, [file.file_id]: true }))
    setInlineMsg(prev => ({ ...prev, [file.file_id]: null }))
    try {
      const [locRes, previewRes] = await Promise.all([
        supabase.from('locations').select('id, name').eq('production_id', productionId),
        fetch('/api/drive/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ production_id: productionId, file_id: file.file_id }),
        }),
      ])
      const locations = locRes.data || []
      const d = await previewRes.json()
      if (!previewRes.ok) throw new Error(d.error || 'Preview error')
      if (!d.hasChanges) {
        setInlineMsg(prev => ({ ...prev, [file.file_id]: '✅ No changes since last sync' }))
      } else {
        onPreview({ rows: d.rows, newHotels: d.newHotels, detectedMode: d.detectedMode, selMode: d.selMode, locations })
      }
    } catch (e) {
      setInlineMsg(prev => ({ ...prev, [file.file_id]: '❌ ' + e.message }))
    } finally {
      setPreviewLoading(prev => ({ ...prev, [file.file_id]: false }))
    }
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
        📁 Drive Files with Updates
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {files.map(f => {
          const lastSync = f.last_synced_at
            ? new Date(f.last_synced_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : null
          const isLoading = !!previewLoading[f.file_id]
          const msg = inlineMsg[f.file_id]
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#fff7ed', border: '1px solid #fde68a', borderRadius: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px' }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.file_name || f.file_id}
                </div>
                <div style={{ fontSize: '11px', color: '#a16207', marginTop: '1px' }}>
                  {lastSync ? `Last sync: ${lastSync}` : 'Never synced'}
                </div>
                {msg && (
                  <div style={{ fontSize: '11px', marginTop: '3px', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontWeight: '600' }}>
                    {msg}
                  </div>
                )}
              </div>
              <button
                onClick={() => handlePreview(f)}
                disabled={isLoading}
                style={{
                  padding: '5px 12px', borderRadius: '7px', border: '1px solid #a16207',
                  background: isLoading ? '#f1f5f9' : '#fefce8', color: isLoading ? '#94a3b8' : '#92400e',
                  fontSize: '11px', fontWeight: '700', cursor: isLoading ? 'default' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                {isLoading ? '⏳ Loading…' : '🔍 Preview changes'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Travel Discrepancies Widget ──────────────────────────
function TravelDiscrepanciesWidget({ productionId }) {
  const [items, setItems] = useState([])
  const [resolving, setResolving] = useState({})
  const [notes, setNotes] = useState({})

  useEffect(() => {
    if (!productionId) return
    supabase
      .from('travel_movements')
      .select('id, full_name_raw, travel_date, direction, travel_date_conflict, hotel_conflict, match_status, needs_transport, rooming_date, hub_location_id, crew:crew_id(full_name, hotel_id)')
      .eq('production_id', productionId)
      .eq('discrepancy_resolved', false)
      .or('travel_date_conflict.eq.true,hotel_conflict.eq.true,match_status.eq.unmatched')
      .order('travel_date', { ascending: true })
      .limit(50)
      .then(({ data }) => setItems(data || []))
  }, [productionId])

  async function resolve(id) {
    setResolving(p => ({ ...p, [id]: true }))
    await supabase.from('travel_movements')
      .update({ discrepancy_resolved: true, discrepancy_note: notes[id] || null })
      .eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setResolving(p => ({ ...p, [id]: false }))
  }

  if (items.length === 0) return null

  return (
    <div style={{ background: 'white', border: '1px solid #fde68a', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#a16207' }}>⚠️ Travel Discrepancies</div>
        <div style={{ fontSize: '11px', color: '#a16207' }}>{items.length} to resolve</div>
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {items.map(item => {
          const name = item.crew?.full_name || item.full_name_raw
          return (
            <div key={item.id} style={{ padding: '12px 20px', borderBottom: '1px solid #fef9c3' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                    {name}
                    <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '600', color: item.direction === 'IN' ? '#15803d' : '#c2410c' }}>
                      {item.direction === 'IN' ? '↓ IN' : '↑ OUT'} {item.travel_date}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {item.match_status === 'unmatched' && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: '700' }}>
                        ❌ Not matched in crew
                      </span>
                    )}
                    {item.travel_date_conflict && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>
                        📅 Date: rooming {item.rooming_date} vs travel {item.travel_date}
                      </span>
                    )}
                    {item.hotel_conflict && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>
                        🏨 Hotel conflict
                      </span>
                    )}
                  </div>
                  <input
                    placeholder="Note (optional)…"
                    value={notes[item.id] || ''}
                    onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))}
                    style={{ marginTop: '8px', width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <a href={`/dashboard/crew`}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '11px', fontWeight: '600', textDecoration: 'none', textAlign: 'center' }}>
                    👤 Crew
                  </a>
                  <button
                    onClick={() => resolve(item.id)}
                    disabled={resolving[item.id]}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: '#16a34a', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer', opacity: resolving[item.id] ? 0.6 : 1 }}>
                    {resolving[item.id] ? '…' : '✓ Resolve'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tomorrow Panel ────────────────────────────────────────
function TomorrowPanel({ productionId }) {
  const [arrivals,   setArrivals]   = useState([])
  const [departures, setDepartures] = useState([])

  useEffect(() => {
    if (!productionId) return
    const tomorrowStr = new Date(Date.now() + 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

    supabase.from('crew')
      .select('id, full_name, department, hotel_id')
      .eq('production_id', productionId)
      .eq('arrival_date', tomorrowStr)
      .then(({ data }) => setArrivals(data || []))

    supabase.from('crew')
      .select('id, full_name, department, hotel_id')
      .eq('production_id', productionId)
      .eq('departure_date', tomorrowStr)
      .then(({ data }) => setDepartures(data || []))
  }, [productionId])

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const total = arrivals.length + departures.length
  const isHighTraffic = total > 5

  const rocketUrl = `/dashboard/rocket?date=${new Date(Date.now() + 86400000).toISOString().split('T')[0]}`

  return (
    <div style={{
      marginBottom: '20px', padding: '16px 20px',
      background: isHighTraffic ? '#fff7ed' : 'white',
      border: `2px solid ${isHighTraffic ? '#f97316' : '#e2e8f0'}`,
      borderRadius: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f2340' }}>
            📅 Tomorrow — {tomorrowStr}
          </div>
          {isHighTraffic && (
            <div style={{ fontSize: '11px', color: '#c2410c', fontWeight: '700', marginTop: '2px' }}>
              ⚠️ High traffic day — plan vehicles in advance
            </div>
          )}
        </div>
        <a href={rocketUrl}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: '#0f2340', color: 'white', textDecoration: 'none', fontSize: '12px', fontWeight: '800' }}>
          🚀 Launch Rocket for tomorrow →
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Arrivals */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            🏨 Check-in ({arrivals.length})
          </div>
          {arrivals.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No check-ins tomorrow</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {arrivals.slice(0, 5).map(c => (
                <div key={c.id} style={{ fontSize: '12px', color: '#374151' }}>
                  <strong>{c.full_name}</strong>
                  {c.department && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>{c.department}</span>}
                </div>
              ))}
              {arrivals.length > 5 && (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>+{arrivals.length - 5} more</div>
              )}
            </div>
          )}
        </div>

        {/* Departures */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            🏁 Check-out ({departures.length})
          </div>
          {departures.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No check-outs tomorrow</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {departures.slice(0, 5).map(c => (
                <div key={c.id} style={{ fontSize: '12px', color: '#374151' }}>
                  <strong>{c.full_name}</strong>
                  {c.department && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>{c.department}</span>}
                </div>
              ))}
              {departures.length > 5 && (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>+{departures.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Arrivals & Departures Chart ───────────────────────────
function ArrivalsDeparturesChart({ productionId }) {
  const [chartData, setChartData] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!productionId) return

    function toRomeDate(d) {
      return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    }
    const now         = new Date()
    const todayStr    = toRomeDate(now)
    const tomorrowStr = toRomeDate(new Date(now.getTime() + 86400000))
    const fromStr     = todayStr
    const toStr       = toRomeDate(new Date(now.getTime() + 29 * 86400000))

    Promise.all([
      supabase.from('crew')
        .select('arrival_date')
        .eq('production_id', productionId)
        .gte('arrival_date', fromStr)
        .lte('arrival_date', toStr)
        .not('arrival_date', 'is', null),
      supabase.from('crew')
        .select('departure_date')
        .eq('production_id', productionId)
        .gte('departure_date', fromStr)
        .lte('departure_date', toStr)
        .not('departure_date', 'is', null),
    ]).then(([arrRes, depRes]) => {
      const arrMap = {}
      const depMap = {}
      console.log('[Bridge Chart] arrRes.data:', JSON.stringify(arrRes.data))
      console.log('[Bridge Chart] fromStr:', fromStr, 'toStr:', toStr)
      ;(arrRes.data || []).forEach(r => {
        if (r.arrival_date) {
          const d = String(r.arrival_date).slice(0, 10)
          arrMap[d] = (arrMap[d] || 0) + 1
        }
      })
      ;(depRes.data || []).forEach(r => {
        if (r.departure_date) {
          const d = String(r.departure_date).slice(0, 10)
          depMap[d] = (depMap[d] || 0) + 1
        }
      })

      const days = []
      const cur = new Date(todayStr + 'T00:00:00')
      while (toRomeDate(cur) <= toStr) {
        const d = toRomeDate(cur)
        days.push({
          date:       d,
          label:      cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          arrivals:   arrMap[d]  || 0,
          departures: depMap[d]  || 0,
          isToday:    d === todayStr,
          isTomorrow: d === tomorrowStr,
        })
        cur.setDate(cur.getDate() + 1)
      }

      setChartData(days)
      setLoading(false)
    })
  }, [productionId])

  if (loading) return null

  const hasData = chartData.some(d => d.arrivals > 0 || d.departures > 0)

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px' }}>
      {/* Header + Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f2340' }}>
          📊 Hotel Check-in & Check-out — 30 days
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#86efac', borderRadius: '2px', display: 'inline-block' }} />
            Check-in
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#fca5a5', borderRadius: '2px', display: 'inline-block' }} />
            Check-out
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#0f2340', borderRadius: '2px', display: 'inline-block' }} />
            Today
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#f97316', borderRadius: '2px', display: 'inline-block' }} />
            Tomorrow
          </span>
        </div>
      </div>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: '13px' }}>
          No arrivals or departures in the next 30 days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={chartData}
            barCategoryGap="20%"
            barGap={2}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              labelStyle={{ fontWeight: '700', color: '#0f2340', marginBottom: '4px' }}
              formatter={(value, name) => [value, name === 'arrivals' ? '🏨 Check-in' : '🏁 Check-out']}
              labelFormatter={(label, payload) => {
                const d = payload?.[0]?.payload
                if (d?.isToday)    return `${label} — TODAY`
                if (d?.isTomorrow) return `${label} — TOMORROW`
                return label
              }}
            />
            <Bar dataKey="arrivals" name="arrivals" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`arr-${i}`}
                  fill={entry.isToday ? '#0f2340' : entry.isTomorrow ? '#f97316' : '#86efac'}
                />
              ))}
            </Bar>
            <Bar dataKey="departures" name="departures" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`dep-${i}`}
                  fill={entry.isToday ? '#1e40af' : entry.isTomorrow ? '#ea580c' : '#fca5a5'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Mini Widgets (Fleet / Pax / Hub) ─────────────────────
function MiniWidgets({ productionId }) {
  const [vehicles, setVehicles] = useState([])
  const [crew,     setCrew]     = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles')
      .select('id, sign_code, vehicle_type, in_transport')
      .eq('production_id', productionId)
      .eq('active', true)
      .then(({ data }) => setVehicles(data || []))
    supabase.from('crew')
      .select('id, travel_status, hotel_status, no_transport_needed')
      .eq('production_id', productionId)
      .then(({ data }) => setCrew(data || []))
  }, [productionId])

  const crewStats = {
    present: crew.filter(c => c.travel_status === 'PRESENT').length,
    in:      crew.filter(c => c.travel_status === 'IN').length,
    out:     crew.filter(c => c.travel_status === 'OUT').length,
    conf:    crew.filter(c => c.hotel_status  === 'CONFIRMED').length,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>

      {/* Fleet Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          🚐 Fleet
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {vehicles.length}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>vehicles active</div>
        {vehicles.filter(v => v.in_transport === false).length > 0 && (
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', display: 'inline-block', marginBottom: '8px' }}>
            🚐 {vehicles.filter(v => v.in_transport === false).length} SD
          </div>
        )}
        <a href="/dashboard/fleet" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600', display: 'block' }}>
          View Fleet Monitor →
        </a>
      </div>

      {/* Pax Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          👥 Crew
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {crew.length}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {[
            { n: crewStats.present, l: 'PRESENT', bg: '#eff6ff', c: '#1d4ed8' },
            { n: crewStats.in,      l: 'IN',      bg: '#dcfce7', c: '#15803d' },
            { n: crewStats.out,     l: 'OUT',      bg: '#fff7ed', c: '#c2410c' },
          ].map(s => s.n > 0 && (
            <span key={s.l} style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: s.bg, color: s.c }}>
              {s.n} {s.l}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
          {crew.filter(c => c.no_transport_needed).length > 0 && (
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 8px' }}>
              🚐 {crew.filter(c => c.no_transport_needed).length} NTN
            </div>
          )}
          <a href="/dashboard/pax-coverage" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
            View Pax Coverage →
          </a>
        </div>
      </div>

      {/* Hub Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          🛣️ Hub Coverage
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {crewStats.conf}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>crew confirmed</div>
        <a href="/dashboard/hub-coverage" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
          View Hub Coverage →
        </a>
      </div>
    </div>
  )
}

// ── Vehicle Rental Monitor ────────────────────────────────
function VehicleRentalWidget({ productionId }) {
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles')
      .select('id, vehicle_type, driver_name, sign_code, available_from, available_to')
      .eq('production_id', productionId)
      .eq('active', true)
      .then(({ data }) => setVehicles(data || []))
  }, [productionId])

  const today = new Date(); today.setHours(0, 0, 0, 0)

  function diffDays(isoDate) {
    const d = new Date(isoDate); d.setHours(0, 0, 0, 0)
    return Math.round((d - today) / 86400000)
  }

  function fmtD(iso) {
    if (!iso) return '—'
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }

  const expiring = vehicles
    .filter(v => v.available_to)
    .map(v => ({ ...v, diff: diffDays(v.available_to) }))
    .filter(v => v.diff >= 0 && v.diff <= 3)
    .sort((a, b) => a.diff - b.diff)

  const arriving = vehicles
    .filter(v => v.available_from)
    .map(v => ({ ...v, diff: diffDays(v.available_from) }))
    .filter(v => v.diff >= 0 && v.diff <= 1)
    .sort((a, b) => a.diff - b.diff)

  if (expiring.length === 0 && arriving.length === 0) return null

  function expiringBadge(diff) {
    if (diff === 0) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'TODAY' }
    if (diff === 1) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'TOMORROW' }
    return { bg: '#fefce8', color: '#a16207', border: '#fde68a', label: `${diff} days` }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f2340' }}>🚗 Vehicle Rental Monitor</div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expiring.length} expiring · {arriving.length} arriving</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {expiring.length > 0 && (
          <div style={{ padding: '8px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: '10px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ⚠️ Expiring — return trip needed
          </div>
        )}
        {expiring.map(v => {
          const badge = expiringBadge(v.diff)
          return (
            <div key={v.id + '-exp'} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: '22px' }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
                  {v.driver_name && <span style={{ fontSize: '12px', color: '#374151' }}>👤 {v.driver_name}</span>}
                  {v.sign_code   && <span style={{ fontSize: '11px', color: '#94a3b8' }}>🏷 {v.sign_code}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  📅 {v.available_from ? fmtD(v.available_from) : '—'} → <strong>{fmtD(v.available_to)}</strong>
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}>
                {badge.label}
              </span>
              <a href="/dashboard/trips"
                style={{ padding: '5px 12px', borderRadius: '7px', background: '#0f2340', color: 'white', textDecoration: 'none', fontSize: '11px', fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap' }}>
                + Return trip
              </a>
            </div>
          )
        })}
        {arriving.length > 0 && (
          <div style={{ padding: '8px 20px', background: '#f0fdf4', borderBottom: '1px solid #86efac', borderTop: expiring.length > 0 ? '1px solid #e2e8f0' : 'none', fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ✅ Arriving — new vehicle incoming
          </div>
        )}
        {arriving.map(v => (
          <div key={v.id + '-arr'} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '22px' }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
                {v.driver_name && <span style={{ fontSize: '12px', color: '#374151' }}>👤 {v.driver_name}</span>}
                {v.sign_code   && <span style={{ fontSize: '11px', color: '#94a3b8' }}>🏷 {v.sign_code}</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                📅 <strong>{fmtD(v.available_from)}</strong> → {v.available_to ? fmtD(v.available_to) : '—'}
              </div>
            </div>
            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', flexShrink: 0 }}>
              {v.diff === 0 ? 'TODAY' : 'TOMORROW'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Log ─────────────────────────────────────────
function ActivityLog({ productionId }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productionId) return
    supabase.from('activity_log')
      .select('*')
      .eq('production_id', productionId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [productionId])

  const actionIcon = {
    import:   '📥',
    rocket:   '🚀',
    crew:     '👤',
    trip:     '🚐',
    vehicle:  '🚗',
    location: '📍',
    default:  '📋',
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f2340' }}>📋 Activity Log</div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Last 50 actions</div>
      </div>
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No activity yet</div>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {logs.map(log => {
            const icon = actionIcon[log.action_type] || actionIcon.default
            const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            const date = new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            return (
              <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 20px', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>{log.description}</div>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0, textAlign: 'right' }}>
                  <div>{time}</div>
                  <div>{date}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Pending Users tab ─────────────────────────────────────
function PendingUsersTab({ productions }) {
  const [pending,   setPending]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [working,   setWorking]   = useState({})  // userId → true
  const [dismissed, setDismissed] = useState(new Set())
  const [modal,     setModal]     = useState(null) // { userId, name, email }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const res  = await fetch('/api/bridge/pending-users')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setPending(json.pending || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function approveSandbox(userId) {
    setWorking(w => ({ ...w, [userId]: true }))
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mode: 'sandbox' }),
    })
    if (res.ok) setDismissed(d => new Set([...d, userId]))
    setWorking(w => ({ ...w, [userId]: false }))
  }

  function dismiss(userId) {
    setDismissed(d => new Set([...d, userId]))
  }

  const visible = pending.filter(u => !dismissed.has(u.id))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>
  if (visible.length === 0) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
      <div style={{ color: '#64748b', fontWeight: '600' }}>No pending users</div>
      <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Everyone who signed up has been handled.</div>
      <button onClick={load} style={{ ...btnSecondary, marginTop: '14px' }}>↺ Refresh</button>
    </div>
  )

  return (
    <div>
      <div style={{ padding: '12px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
        ⚠️ {visible.length} user{visible.length !== 1 ? 's' : ''} waiting — approve them or let them use an invite code.
        <button onClick={load} style={{ ...btnSecondary, marginLeft: '12px', padding: '3px 10px', fontSize: '11px' }}>↺ Refresh</button>
      </div>

      {visible.map(u => (
        <div key={u.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Avatar */}
          {u.avatar_url
            ? <img src={u.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
            : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>👤</div>
          }

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.name || u.email}
            </div>
            {u.name && <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Signed up {fmt(u.created_at)}</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => approveSandbox(u.id)} disabled={working[u.id]}
              style={{ ...btnGreen, opacity: working[u.id] ? 0.6 : 1 }}>
              {working[u.id] ? '…' : '✓ Sandbox'}
            </button>
            <button onClick={() => setModal(u)} style={btnPrimary}>
              ⊕ Add to prod
            </button>
            <button onClick={() => dismiss(u.id)} style={btnSecondary}>
              ✕ Ignore
            </button>
          </div>
        </div>
      ))}

      {/* Add-to-production modal */}
      {modal && (
        <AddToProductionModal
          user={modal}
          productions={productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))}
          onClose={() => setModal(null)}
          onDone={(userId) => { setDismissed(d => new Set([...d, userId])); setModal(null) }}
        />
      )}
    </div>
  )
}

function AddToProductionModal({ user, productions, onClose, onDone }) {
  const [prodId,  setProdId]  = useState(productions[0]?.id || '')
  const [role,    setRole]    = useState('MANAGER')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, mode: 'production', productionId: prodId, role }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setSaving(false) }
    else onDone(user.id)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '380px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: '900', fontSize: '17px', color: '#0f2340', marginBottom: '6px' }}>⊕ Add to Production</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
          {user.name || user.email} will be added with the selected role.
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={lbl}>Production</label>
            <select value={prodId} onChange={e => setProdId(e.target.value)} style={sel} required>
              {productions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <label style={lbl}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={sel}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>❌ {error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={saving || !prodId} style={{ ...btnGreen, flex: 2, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding…' : '✓ Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Invite Codes tab ──────────────────────────────────────
function InviteCodesTab({ productions }) {
  const [invites,    setInvites]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [showForm,   setShowForm]   = useState(false)
  const [copied,     setCopied]     = useState(null)
  const [deleting,   setDeleting]   = useState(null)

  // New invite form state
  const EMPTY = { production_id: productions[0]?.id || '', code: '', label: '', role: 'MANAGER', max_uses: '', expires_at: '' }
  const [form,    setForm]    = useState({ ...EMPTY })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/bridge/invites')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setInvites(json.invites || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) c += '-'
      c += chars[Math.floor(Math.random() * chars.length)]
    }
    setF('code', c)
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormErr(null); setSaving(true)
    const res = await fetch('/api/bridge/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: form.production_id,
        code:          form.code.trim().toUpperCase() || undefined,
        label:         form.label.trim() || undefined,
        role:          form.role,
        max_uses:      form.max_uses ? parseInt(form.max_uses) : null,
        expires_at:    form.expires_at || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error); setSaving(false); return }
    setInvites(inv => [json.invite, ...inv])
    setForm({ ...EMPTY })
    setShowForm(false)
    setSaving(false)
  }

  async function toggleActive(inv) {
    const res = await fetch('/api/bridge/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, active: !inv.active }),
    })
    if (res.ok) {
      const { invite } = await res.json()
      setInvites(list => list.map(i => i.id === invite.id ? invite : i))
    }
  }

  async function deleteInvite(id) {
    if (!confirm('Delete this invite code?')) return
    setDeleting(id)
    const res = await fetch('/api/bridge/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setInvites(list => list.filter(i => i.id !== id))
    setDeleting(null)
  }

  function handleCopy(code) {
    copyText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const managedProdIds = new Set(productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role)).map(p => p.id))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>

  return (
    <div>
      {/* ── New Code Form ── */}
      {showForm && (
        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '2px solid #2563eb' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>🔑 New Invite Code</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Production *</label>
                <select value={form.production_id} onChange={e => setF('production_id', e.target.value)} style={sel} required>
                  {productions.filter(p => managedProdIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role assigned</label>
                <select value={form.role} onChange={e => setF('role', e.target.value)} style={sel}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Code (leave blank = auto-generate)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                    placeholder="e.g. CREW-X7K2" style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em', flex: 1 }} />
                  <button type="button" onClick={generateRandom}
                    style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', whiteSpace: 'nowrap' }} title="Generate random">
                    🔀 Gen
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Label (optional)</label>
                <input value={form.label} onChange={e => setF('label', e.target.value)}
                  placeholder="e.g. Crew access June" style={inp} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Max uses (blank = unlimited)</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setF('max_uses', e.target.value)}
                  placeholder="e.g. 10" style={inp} />
              </div>
              <div>
                <label style={lbl}>Expires (blank = never)</label>
                <input type="date" value={form.expires_at} onChange={e => setF('expires_at', e.target.value)} style={inp} />
              </div>
            </div>

            {formErr && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {formErr}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(null) }} style={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving || !form.production_id}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating…' : '🔑 Create Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Invite list ── */}
      {invites.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <div style={{ color: '#64748b', fontWeight: '600' }}>No invite codes yet</div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Create a code to let people join a specific production instantly.</div>
        </div>
      ) : (
        <div>
          {invites.map(inv => {
            const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
            const isFull    = inv.max_uses !== null && inv.uses_count >= inv.max_uses
            const statusBg  = !inv.active ? '#f1f5f9' : isExpired || isFull ? '#fef2f2' : '#f0fdf4'
            const statusColor = !inv.active ? '#64748b' : isExpired || isFull ? '#dc2626' : '#16a34a'
            const statusLabel = !inv.active ? 'INACTIVE' : isExpired ? 'EXPIRED' : isFull ? 'FULL' : 'ACTIVE'

            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', opacity: !inv.active ? 0.65 : 1 }}>
                {/* Code block */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '16px', fontWeight: '900', color: '#0f2340', letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => handleCopy(inv.code)} title="Click to copy">
                  {inv.code}
                  <span style={{ fontSize: '11px', marginLeft: '8px', color: '#94a3b8', fontFamily: 'inherit', fontWeight: '400' }}>
                    {copied === inv.code ? '✓ copied' : '📋'}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                      {inv.productions?.name || '—'}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '700' }}>
                      {inv.role}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: statusBg, color: statusColor, fontSize: '10px', fontWeight: '700' }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    {inv.label && <span>{inv.label} · </span>}
                    Uses: <strong>{inv.uses_count}</strong>{inv.max_uses ? `/${inv.max_uses}` : ''} · 
                    {inv.expires_at ? ` Expires ${fmtDate(inv.expires_at)}` : ' No expiry'} · 
                    Created {fmt(inv.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => toggleActive(inv)}
                    style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}
                    title={inv.active ? 'Deactivate' : 'Activate'}>
                    {inv.active ? '⏸ Pause' : '▶ Enable'}
                  </button>
                  <button onClick={() => deleteInvite(inv.id)} disabled={deleting === inv.id}
                    style={{ ...btnRed, fontSize: '11px', padding: '5px 10px', opacity: deleting === inv.id ? 0.6 : 1 }}>
                    {deleting === inv.id ? '…' : '🗑'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function BridgePage() {
  const router = useRouter()
  const [user,        setUser]        = useState(null)
  const [productions, setProductions] = useState([])
  const [isBridge,    setIsBridge]    = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('pending')
  const [inviteCount, setInviteCount] = useState(null)

  // Pending badge state
  const [pendingCount, setPendingCount] = useState(null)

  const [PRODUCTION_ID, setProductionId] = useState(null)
  const [previewModal,  setPreviewModal]  = useState(null)

  useEffect(() => {
    setProductionId(getProductionId())
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)

      const [prodsRes, rolesRes] = await Promise.all([
        fetch('/api/productions'),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ])
      const { productions: prods } = await prodsRes.json()
      setProductions(prods || [])

      const roles = rolesRes.data || []
      const admin = roles.some(r => ['CAPTAIN', 'ADMIN'].includes(r.role))
      setIsBridge(admin)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading…
    </div>
  )

  if (!isBridge) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/bridge" />
      <div style={{ maxWidth: '500px', margin: '80px auto', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px' }}>Access Denied</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>Captain Bridge is only available to CAPTAIN and ADMIN users.</p>
        <a href="/dashboard" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>← Back to Dashboard</a>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/bridge" />

      <div style={{ maxWidth: '920px', margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Easy Access Shortcuts ── */}
        <EasyAccessShortcuts currentPath="/dashboard/bridge" />

        {/* ── Header ── */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f2340', margin: 0, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            ⚓ Captain Bridge
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
            Manage who accesses CaptainDispatch — approve pending users and control invite codes.
          </p>
        </div>

        {/* ── Dashboard Panels ── */}
        <NotificationsPanel productionId={PRODUCTION_ID} />
        <DriveSyncWidget productionId={PRODUCTION_ID} onPreview={setPreviewModal} />
        <TravelDiscrepanciesWidget productionId={PRODUCTION_ID} />
        <TomorrowPanel productionId={PRODUCTION_ID} />
        <ArrivalsDeparturesChart key={PRODUCTION_ID} productionId={PRODUCTION_ID} />
        <MiniWidgets productionId={PRODUCTION_ID} />
        <VehicleRentalWidget productionId={PRODUCTION_ID} />
        <ActivityLog productionId={PRODUCTION_ID} />

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
          {[
            { id: 'pending', label: '👥 Pending Users' },
            { id: 'invites', label: '🔑 Invite Codes' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '7px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                background: tab === t.id ? '#0f2340' : 'transparent',
                color:      tab === t.id ? 'white'   : '#64748b',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {tab === 'pending' && (
          <div style={card}>
            <div style={hdr}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>👥 Pending Users</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Users who signed up and are waiting for access</div>
            </div>
            <PendingUsersTab productions={productions} />
          </div>
        )}

        {tab === 'invites' && (
          <div style={card}>
            <div style={hdr}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>🔑 Invite Codes</div>
              <button
                style={btnPrimary}
                onClick={() => document.dispatchEvent(new CustomEvent('bridge:newCode'))}>
                + New Code
              </button>
            </div>
            <InviteCodesTabWrapper productions={productions} />
          </div>
        )}

        {/* ── Info box ── */}
        <div style={{ padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #0f2340', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f2340', marginBottom: '6px' }}>⚓ How Captain Bridge works</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li><strong>Pending Users</strong> — users who logged in but have no production assigned yet. Approve them with a private sandbox or add them to one of your productions.</li>
            <li><strong>Invite Codes</strong> — share a code with someone. When they enter it on the pending page, they are instantly added to the linked production with the assigned role.</li>
            <li>Codes can have a max use limit and an expiry date. You can pause or delete them at any time.</li>
          </ul>
        </div>

      </div>

      {previewModal && (
        <ImportModal
          open={true}
          mode={previewModal.selMode}
          productionId={PRODUCTION_ID}
          locations={previewModal.locations}
          initialPhase="categorizing"
          initialRows={previewModal.rows}
          initialNewHotels={previewModal.newHotels}
          initialDetectedMode={previewModal.detectedMode}
          initialSelMode={previewModal.selMode}
          onClose={() => setPreviewModal(null)}
          onImported={() => setPreviewModal(null)}
        />
      )}
    </div>
  )
}

// Wrapper to bridge the "New Code" button in the header with InviteCodesTab's internal state
function InviteCodesTabWrapper({ productions }) {
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const handler = () => setShowForm(true)
    document.addEventListener('bridge:newCode', handler)
    return () => document.removeEventListener('bridge:newCode', handler)
  }, [])

  return <InviteCodesTabControlled productions={productions} showFormProp={showForm} onFormClose={() => setShowForm(false)} />
}

function InviteCodesTabControlled({ productions, showFormProp, onFormClose }) {
  const [invites,  setInvites]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [copied,   setCopied]   = useState(null)
  const [deleting, setDeleting] = useState(null)

  const EMPTY = { production_id: productions[0]?.id || '', code: '', label: '', role: 'MANAGER', max_uses: '', expires_at: '' }
  const [form,    setForm]    = useState({ ...EMPTY })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Sync external trigger
  useEffect(() => {
    if (showFormProp) setShowForm(true)
  }, [showFormProp])

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/bridge/invites')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setInvites(json.invites || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) c += '-'
      c += chars[Math.floor(Math.random() * chars.length)]
    }
    setF('code', c)
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormErr(null); setSaving(true)
    const res = await fetch('/api/bridge/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: form.production_id,
        code:          form.code.trim().toUpperCase() || undefined,
        label:         form.label.trim() || undefined,
        role:          form.role,
        max_uses:      form.max_uses ? parseInt(form.max_uses) : null,
        expires_at:    form.expires_at || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error); setSaving(false); return }
    setInvites(inv => [json.invite, ...inv])
    setForm({ ...EMPTY })
    setShowForm(false)
    onFormClose()
    setSaving(false)
  }

  async function toggleActive(inv) {
    const res = await fetch('/api/bridge/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, active: !inv.active }),
    })
    if (res.ok) {
      const { invite } = await res.json()
      setInvites(list => list.map(i => i.id === invite.id ? invite : i))
    }
  }

  async function deleteInvite(id) {
    if (!confirm('Delete this invite code?')) return
    setDeleting(id)
    const res = await fetch('/api/bridge/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setInvites(list => list.filter(i => i.id !== id))
    setDeleting(null)
  }

  function handleCopy(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {})
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const managedProds = productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>

  return (
    <div>
      {showForm && (
        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '2px solid #0f2340' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>🔑 New Invite Code</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Production *</label>
                <select value={form.production_id} onChange={e => setF('production_id', e.target.value)} style={sel} required>
                  {managedProds.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role assigned</label>
                <select value={form.role} onChange={e => setF('role', e.target.value)} style={sel}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Code (blank = auto-generate)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                    placeholder="e.g. CREW-X7K2"
                    style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em', flex: 1 }} />
                  <button type="button" onClick={generateRandom}
                    style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    🔀 Gen
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Label (optional)</label>
                <input value={form.label} onChange={e => setF('label', e.target.value)}
                  placeholder="e.g. Crew access June" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Max uses (blank = unlimited)</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setF('max_uses', e.target.value)}
                  placeholder="e.g. 10" style={inp} />
              </div>
              <div>
                <label style={lbl}>Expires (blank = never)</label>
                <input type="date" value={form.expires_at} onChange={e => setF('expires_at', e.target.value)} style={inp} />
              </div>
            </div>
            {formErr && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {formErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setShowForm(false); onFormClose(); setFormErr(null) }} style={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.production_id}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating…' : '🔑 Create Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {invites.length === 0 && !showForm ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <div style={{ color: '#64748b', fontWeight: '600' }}>No invite codes yet</div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Create a code to let people join a specific production instantly.
          </div>
          <button onClick={() => setShowForm(true)} style={{ ...btnPrimary, marginTop: '14px' }}>
            + Create First Code
          </button>
        </div>
      ) : (
        invites.map(inv => {
          const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
          const isFull    = inv.max_uses !== null && inv.uses_count >= inv.max_uses
          const statusBg    = !inv.active ? '#f1f5f9' : isExpired || isFull ? '#fef2f2' : '#f0fdf4'
          const statusColor = !inv.active ? '#64748b' : isExpired || isFull ? '#dc2626' : '#16a34a'
          const statusLabel = !inv.active ? 'INACTIVE' : isExpired ? 'EXPIRED' : isFull ? 'FULL' : 'ACTIVE'

          return (
            <div key={inv.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', opacity: !inv.active ? 0.65 : 1 }}>
              {/* Code */}
              <div onClick={() => handleCopy(inv.code)} title="Click to copy"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '16px', fontWeight: '900', color: '#0f2340', letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
                {inv.code}
                <span style={{ fontSize: '11px', marginLeft: '8px', color: '#94a3b8', fontFamily: 'sans-serif', fontWeight: '400' }}>
                  {copied === inv.code ? '✓ copied' : '📋'}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                    {inv.productions?.name || '—'}
                  </span>
                  <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '700' }}>
                    {inv.role}
                  </span>
                  <span style={{ padding: '1px 7px', borderRadius: '5px', background: statusBg, color: statusColor, fontSize: '10px', fontWeight: '700' }}>
                    {statusLabel}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {inv.label && <span style={{ marginRight: '8px' }}>📝 {inv.label}</span>}
                  <span>Uses: <strong>{inv.uses_count}</strong>{inv.max_uses ? `/${inv.max_uses}` : ''}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>{inv.expires_at ? `Expires ${fmtDate(inv.expires_at)}` : 'No expiry'}</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  <span>Created {fmt(inv.created_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => toggleActive(inv)}
                  style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>
                  {inv.active ? '⏸ Pause' : '▶ Enable'}
                </button>
                <button onClick={() => deleteInvite(inv.id)} disabled={deleting === inv.id}
                  style={{ ...btnRed, fontSize: '11px', padding: '5px 10px', opacity: deleting === inv.id ? 0.6 : 1 }}>
                  {deleting === inv.id ? '…' : '🗑'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
