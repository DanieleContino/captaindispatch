# TASK — S33 Captain Bridge Upgrade

## Contesto
Leggi `CAPTAINDISPATCH_Context.md` per il contesto completo.
File principale da modificare: `app/dashboard/bridge/page.js`
Regola: usa `replace_in_file` — NON riscrivere il file intero.
Scegli l'approccio più token-efficient e spiegalo in una riga prima di procedere.

---

## Panoramica

La pagina `/dashboard/bridge` esiste già con due tab: Pending Users e Invite Codes.
Questa task aggiunge una serie di pannelli SOPRA i tab esistenti, senza toccarli.

Layout finale:
```
┌─────────────────────────────────────┐
│ EASY ACCESS SHORTCUTS               │
├─────────────────────────────────────┤
│ 🚨 ALERT & NOTIFICHE                │
├─────────────────────────────────────┤
│ 📅 DOMANI — Arrivals & Departures   │
├──────────────┬──────────────────────┤
│ 📊 GRAFICO   │ 🚐 FLEET MINI        │
│ arrivi/part. │ 👥 PAX MINI          │
│              │ 🛣️ HUB MINI          │
├─────────────────────────────────────┤
│ 📋 LOG ATTIVITÀ                     │
├─────────────────────────────────────┤
│ TAB BAR (già esistente)             │
│ 🔑 GESTIONE ACCESSI (già esistente) │
└─────────────────────────────────────┘
```

---

## Step 1 — DB Migration

Esegui questo SQL in Supabase SQL Editor:

```sql
-- S33: notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('success', 'warning', 'error', 'info')),
  message       text NOT NULL,
  read          boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
  USING (production_id IN (SELECT user_production_ids()));
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- S33: activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id),
  action_type   text NOT NULL,
  description   text NOT NULL,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT TO authenticated
  USING (production_id IN (SELECT user_production_ids()));
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));
```

---

## Step 2 — Easy Access Shortcuts

Aggiungi una barra di navigazione rapida in cima alla pagina, sopra l'header "⚓ Captain Bridge".

```javascript
// Componente EasyAccessShortcuts
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
```

---

## Step 3 — Alert & Notifiche

```javascript
// Componente NotificationsPanel
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
```

---

## Step 4 — Domani in evidenza

```javascript
function TomorrowPanel({ productionId }) {
  const [arrivals,   setArrivals]   = useState([])
  const [departures, setDepartures] = useState([])

  useEffect(() => {
    if (!productionId) return
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

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
            ✈️ Arrivals ({arrivals.length})
          </div>
          {arrivals.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No arrivals tomorrow</div>
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
            🏁 Departures ({departures.length})
          </div>
          {departures.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No departures tomorrow</div>
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
```

---

## Step 5 — Grafico Arrivi/Partenze (30 giorni)

Usa Recharts (già disponibile nel progetto).

```javascript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function ArrivalsDeparturesChart({ productionId }) {
  const [chartData, setChartData] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    if (!productionId) return
    const today = new Date()
    const days = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      days.push(d.toISOString().split('T')[0])
    }

    Promise.all([
      supabase.from('crew').select('arrival_date').eq('production_id', productionId).not('arrival_date', 'is', null),
      supabase.from('crew').select('departure_date, full_name, department').eq('production_id', productionId).not('departure_date', 'is', null),
    ]).then(([arrRes, depRes]) => {
      const arrMap = {}
      const depMap = {}
      ;(arrRes.data || []).forEach(c => { arrMap[c.arrival_date] = (arrMap[c.arrival_date] || 0) + 1 })
      ;(depRes.data || []).forEach(c => { depMap[c.departure_date] = (depMap[c.departure_date] || 0) + 1 })

      const tomorrow = new Date(today)
      tomorrow.setDate(today.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]
      const todayStr = today.toISOString().split('T')[0]

      setChartData(days.map(d => ({
        date: d,
        label: new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        arrivals:   arrMap[d] || 0,
        departures: depMap[d] || 0,
        isToday:    d === todayStr,
        isTomorrow: d === tomorrowStr,
        isHighTraffic: (arrMap[d] || 0) + (depMap[d] || 0) > 8,
      })))
    })
  }, [productionId])

  if (chartData.length === 0) return null

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f2340', marginBottom: '14px' }}>
        📊 Arrivals & Departures — next 30 days
      </div>
      <div style={{ display: 'flex', gap: '14px', marginBottom: '10px', fontSize: '11px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} /> Arrivals</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', display: 'inline-block' }} /> Departures</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} onClick={d => d && setSelectedDay(d.activePayload?.[0]?.payload)}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
          <YAxis tick={{ fontSize: 10 }} width={24} />
          <Tooltip
            formatter={(value, name) => [value, name === 'arrivals' ? 'Arrivals' : 'Departures']}
            labelFormatter={label => label}
          />
          <Bar dataKey="arrivals" fill="#3b82f6" radius={[2,2,0,0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.isTomorrow ? '#f97316' : entry.isToday ? '#1d4ed8' : '#3b82f6'} />
            ))}
          </Bar>
          <Bar dataKey="departures" fill="#ef4444" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Panel laterale giorno selezionato */}
      {selectedDay && (selectedDay.arrivals > 0 || selectedDay.departures > 0) && (
        <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f2340' }}>{selectedDay.label}</div>
            <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}>×</button>
          </div>
          <div style={{ fontSize: '12px', color: '#374151' }}>
            ✈️ {selectedDay.arrivals} arriving · 🏁 {selectedDay.departures} departing
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Step 6 — Widget Mini (Fleet, Pax, Hub)

```javascript
function MiniWidgets({ productionId }) {
  const [vehicles, setVehicles] = useState([])
  const [crew,     setCrew]     = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles').select('id, sign_code, vehicle_type').eq('production_id', productionId).eq('active', true)
      .then(({ data }) => setVehicles(data || []))
    supabase.from('crew').select('id, travel_status, hotel_status').eq('production_id', productionId)
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
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>vehicles active</div>
        <a href="/dashboard/fleet" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
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
        <a href="/dashboard/pax-coverage" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
          View Pax Coverage →
        </a>
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
```

---

## Step 7 — Log Attività

```javascript
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
```

---

## Step 8 — Badge rosso navbar

In `lib/navbar.js`, aggiungi un badge rosso con animazione pulse accanto al link "Captain Bridge".

Logica: query `notifications` non lette ogni 5 minuti. Se count > 0 → mostra badge rosso con numero.

```javascript
// Aggiungi questo hook in navbar.js
function useBridgeBadge(productionId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!productionId) return
    function check() {
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('production_id', productionId)
        .eq('read', false)
        .then(({ count: c }) => setCount(c || 0))
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [productionId])

  return count
}
```

Nel link "Captain Bridge" della navbar, aggiungi:
```javascript
{bridgeCount > 0 && (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#dc2626', color: 'white',
    fontSize: '10px', fontWeight: '900',
    marginLeft: '4px',
    animation: 'pulse 2s infinite',
  }}>
    {bridgeCount > 9 ? '9+' : bridgeCount}
  </span>
)}
```

Aggiungi il CSS per pulse in `app/globals.css` (o inline con `<style>`):
```css
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.7; transform: scale(1.15); }
}
```

---

## Step 9 — Integra tutto in BridgePage

In `BridgePage`, recupera `productionId` dalla produzione attiva e aggiungi tutti i componenti sopra il tab bar esistente:

```javascript
// Aggiungi import Recharts in cima al file
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// In BridgePage, recupera productionId
import { getProductionId } from '../../../lib/production'
const PRODUCTION_ID = getProductionId()

// Nel JSX, sopra il tab bar esistente, aggiungi:
<EasyAccessShortcuts currentPath="/dashboard/bridge" />
<NotificationsPanel productionId={PRODUCTION_ID} />
<TomorrowPanel productionId={PRODUCTION_ID} />
<ArrivalsDeparturesChart productionId={PRODUCTION_ID} />
<MiniWidgets productionId={PRODUCTION_ID} />
<ActivityLog productionId={PRODUCTION_ID} />
```

---

## Note importanti

- `getProductionId()` viene chiamato dentro il componente (non fuori) — segui il pattern del resto del progetto
- Non toccare niente sotto il tab bar — PendingUsersTab, InviteCodesTab, AddToProductionModal restano invariati
- Il grafico Recharts usa `import` in cima al file — verifica che Recharts sia già nel progetto (è nella lista librerie disponibili)
- Se `activity_log` è vuota inizialmente va bene — si popola man mano che usi il sistema
- Il badge navbar richiede che `getProductionId()` sia disponibile in `lib/navbar.js`

---

## Dopo la modifica

Fai `git push`.
Aggiorna `CAPTAINDISPATCH_Context.md` con S33 completata.
