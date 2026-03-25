'use client'

/**
 * Hub Coverage Assistant
 * Equivalente di HubCoverageAssistant.html in Apps Script (08_Sidebars.gs)
 *
 * Per un hub selezionato e una data:
 * - ARRIVALS: chi deve arrivare (crew IN) vs chi ha un trip ARRIVAL dal hub
 * - DEPARTURES: chi deve partire (crew OUT) vs chi ha un trip DEPARTURE al hub
 * - Tabella per hotel: Expected | Assigned | Status (✅/⚠/❌)
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

function isoToday() { return new Date().toISOString().split('T')[0] }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min == null) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}

// ─── Status coverage ──────────────────────────────────────────
function coverageStatus(expected, assigned) {
  if (expected === 0 && assigned === 0) return { icon: '—',  label: 'None',      color: '#94a3b8', bg: '#f8fafc' }
  if (expected === 0 && assigned > 0)  return { icon: '➕', label: 'Extra',     color: '#7c3aed', bg: '#f5f3ff' }
  if (assigned === 0)                   return { icon: '❌', label: 'Missing',   color: '#dc2626', bg: '#fef2f2' }
  if (assigned >= expected)             return { icon: '✅', label: 'Covered',   color: '#15803d', bg: '#f0fdf4' }
  return                                       { icon: '⚠',  label: 'Partial',   color: '#d97706', bg: '#fefce8' }
}

// ─── Riga hotel nella tabella ──────────────────────────────────
function HotelRow({ hotel, expected, assignedCrew, trips }) {
  const [open, setOpen] = useState(false)
  const sts = coverageStatus(expected.length, assignedCrew.length)
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 90px', gap: '8px', alignItems: 'center', padding: '9px 12px', cursor: 'pointer', background: open ? '#f8fafc' : 'white' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'white' }}>
        <div style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{hotel}</div>
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{expected.length}</div>
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{assignedCrew.length}</div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: sts.color, background: sts.bg, padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
            {sts.icon} {sts.label}
          </span>
        </div>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
          {trips.length > 0 ? `${trips.length} trip${trips.length > 1 ? 's' : ''}` : '–'}
          <span style={{ marginLeft: '6px', color: '#cbd5e1' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ background: '#f8fafc', padding: '8px 16px 12px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Expected */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '6px' }}>EXPECTED ({expected.length})</div>
              {expected.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>None</div>
              ) : expected.map(c => (
                <div key={c.id} style={{ fontSize: '11px', color: '#374151', padding: '2px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.full_name}</span>
                  <span style={{ color: '#94a3b8' }}>{c.department}</span>
                </div>
              ))}
            </div>
            {/* Assigned + Trips */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '6px' }}>ASSEGNATI ({assignedCrew.length})</div>
              {trips.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>No trips</div>
              ) : trips.map((t, i) => (
                <div key={i} style={{ fontSize: '11px', color: '#374151', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>{t.trip_id}</span>
                  <span style={{ color: '#94a3b8', margin: '0 5px' }}>·</span>
                  <span>{minToHHMM(t.pickup_min ?? t.call_min)}</span>
                  {t.vehicle_id && <span style={{ color: '#2563eb', marginLeft: '5px' }}>🚐 {t.vehicle_id}</span>}
                  <span style={{ color: '#94a3b8', marginLeft: '5px' }}>{t.pax_count || 0} pax</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sezione (ARRIVAL o DEPARTURE) ────────────────────────────
function CoverageSection({ title, icon, color, hotels, allExpected, allTrips, locsMap, transferClass }) {
  // Raggruppa expected per hotel
  const expectedByHotel = {}
  for (const c of allExpected) {
    const hname = locsMap[c.hotel_id] || c.hotel_id || 'Unknown'
    if (!expectedByHotel[hname]) expectedByHotel[hname] = []
    expectedByHotel[hname].push(c)
  }

  // Raggruppa assigned per hotel (dropoff per ARRIVAL, pickup per DEPARTURE)
  const tripsByHotel = {}
  for (const t of allTrips) {
    const hotelId = transferClass === 'ARRIVAL' ? t.dropoff_id : t.pickup_id
    const hname   = locsMap[hotelId] || hotelId || 'Unknown'
    if (!tripsByHotel[hname]) tripsByHotel[hname] = []
    if (!tripsByHotel[hname].find(x => x.trip_id === t.trip_id)) {
      tripsByHotel[hname].push(t)
    }
  }

  // Assigned crew per hotel (from passenger_list in trips)
  const assignedByHotel = {}
  for (const [hotel, tlist] of Object.entries(tripsByHotel)) {
    const names = new Set()
    for (const t of tlist) {
      if (t.passenger_list) t.passenger_list.split(',').forEach(n => names.add(n.trim()))
    }
    assignedByHotel[hotel] = [...names]
  }

  // Unione di tutti gli hotel che compaiono in expected o in trips
  const allHotels = [...new Set([...Object.keys(expectedByHotel), ...Object.keys(tripsByHotel)])].sort()

  // Summary
  const totalExpected = allExpected.length
  const totalAssigned = Object.values(assignedByHotel).flat().length
  const covered = allHotels.filter(h => coverageStatus((expectedByHotel[h] || []).length, (tripsByHotel[h] || []).length).icon === '✅').length
  const missing  = allHotels.filter(h => coverageStatus((expectedByHotel[h] || []).length, (tripsByHotel[h] || []).length).icon === '❌').length
  const partial  = allHotels.filter(h => coverageStatus((expectedByHotel[h] || []).length, (tripsByHotel[h] || []).length).icon === '⚠').length

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingBottom: '8px', borderBottom: `2px solid ${color}` }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <span style={{ fontWeight: '900', fontSize: '14px', color: '#0f172a' }}>{title}</span>
        <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
          {[
            { n: totalExpected, l: 'expected', c: '#64748b', bg: '#f1f5f9' },
            { n: totalAssigned, l: 'assigned', c: '#1d4ed8', bg: '#eff6ff' },
            { n: covered,       l: 'ok',       c: '#15803d', bg: '#dcfce7' },
            { n: missing,       l: 'missing',  c: '#dc2626', bg: '#fef2f2' },
            { n: partial,       l: 'partial',  c: '#d97706', bg: '#fefce8' },
          ].filter(x => x.n > 0).map(x => (
            <span key={x.l} style={{ fontSize: '10px', fontWeight: '700', color: x.c, background: x.bg, padding: '2px 7px', borderRadius: '6px' }}>
              {x.n} {x.l}
            </span>
          ))}
        </div>
      </div>

      {allHotels.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
          Nessun dato per questa sezione
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 90px', gap: '8px', padding: '6px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <div>Hotel</div>
            <div style={{ textAlign: 'center' }}>Exp.</div>
            <div style={{ textAlign: 'center' }}>Assigned</div>
            <div style={{ textAlign: 'center' }}>Status</div>
            <div style={{ textAlign: 'center' }}>Trips</div>
          </div>
          {allHotels.map(hotel => (
            <HotelRow
              key={hotel}
              hotel={hotel}
              expected={expectedByHotel[hotel] || []}
              assignedCrew={assignedByHotel[hotel] || []}
              trips={tripsByHotel[hotel] || []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function HubCoveragePage() {
  const router = useRouter()
  const [user,     setUser]     = useState(null)
  const [date,     setDate]     = useState(isoToday())
  const [hubs,     setHubs]     = useState([])
  const [hubId,    setHubId]    = useState('')
  const [locsMap,  setLocsMap]  = useState({})
  const [loading,  setLoading]  = useState(false)
  // Data
  const [arrTrips,  setArrTrips]  = useState([])
  const [depTrips,  setDepTrips]  = useState([])
  const [crewIN,    setCrewIN]    = useState([])
  const [crewOUT,   setCrewOUT]   = useState([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (!PRODUCTION_ID) return
      Promise.all([
        supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name'),
      ]).then(([lR]) => {
        const locs = lR.data || []
        const m = {}; locs.forEach(l => { m[l.id] = l.name })
        setLocsMap(m)
        const h = locs.filter(l => l.is_hub)
        setHubs(h)
        if (h.length > 0) setHubId(h[0].id)
      })
    })
  }, [])

  const loadCoverage = useCallback(async () => {
    if (!PRODUCTION_ID || !hubId || !date) return
    setLoading(true)
    const [arrR, depR, inR, outR] = await Promise.all([
      // ARRIVAL trips FROM this hub
      supabase.from('trips').select('*').eq('production_id', PRODUCTION_ID).eq('date', date)
        .eq('pickup_id', hubId).eq('transfer_class', 'ARRIVAL').neq('status', 'CANCELLED')
        .order('pickup_min', { nullsLast: true }),
      // DEPARTURE trips TO this hub
      supabase.from('trips').select('*').eq('production_id', PRODUCTION_ID).eq('date', date)
        .eq('dropoff_id', hubId).eq('transfer_class', 'DEPARTURE').neq('status', 'CANCELLED')
        .order('pickup_min', { nullsLast: true }),
      // Crew attesi in arrivo (travel_status = IN)
      supabase.from('crew').select('id,full_name,department,hotel_id')
        .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED').eq('travel_status', 'IN'),
      // Crew attesi in partenza (travel_status = OUT)
      supabase.from('crew').select('id,full_name,department,hotel_id')
        .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED').eq('travel_status', 'OUT'),
    ])
    setArrTrips(arrR.data || [])
    setDepTrips(depR.data || [])
    setCrewIN(inR.data || [])
    setCrewOUT(outR.data || [])
    setLoading(false)
  }, [hubId, date])

  useEffect(() => { if (user && hubId) loadCoverage() }, [user, hubId, date, loadCoverage])

  const hubName = locsMap[hubId] || hubId || '–'
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
      {/* Header */}
      <div style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display: 'flex', gap: '2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: '#94a3b8', background: 'transparent', textDecoration: 'none', whiteSpace: 'nowrap' }}>{l}</a>
            ))}
          </nav>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
          Sign out
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: '52px', zIndex: 20 }}>
        <span style={{ fontSize: '18px' }}>🛫</span>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Hub Coverage</span>
        <span style={{ color: '#cbd5e1' }}>·</span>
        {/* Hub selector */}
        <select value={hubId} onChange={e => setHubId(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer', minWidth: '180px' }}>
          {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {/* Date */}
        <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>◀</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
        <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>▶</button>
        <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Today</button>
        <button onClick={loadCoverage} style={{ marginLeft: 'auto', background: '#0f2340', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>
        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {/* Title bar */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px 20px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>🛫</span>
          <div>
            <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>{hubName}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{fmtDate(date)}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <span style={{ padding: '4px 10px', borderRadius: '6px', background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: '700' }}>
              🛬 {arrTrips.length} ARR trips · {crewIN.length} crew IN
            </span>
            <span style={{ padding: '4px 10px', borderRadius: '6px', background: '#fff7ed', color: '#c2410c', fontSize: '11px', fontWeight: '700' }}>
              🛫 {depTrips.length} DEP trips · {crewOUT.length} crew OUT
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Caricamento…</div>
        ) : (
          <div style={{ background: 'white', borderRadius: '10px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>

            <CoverageSection
              title={`ARRIVALS from ${hubName}`}
              icon="🛬"
              color="#16a34a"
              transferClass="ARRIVAL"
              allExpected={crewIN}
              allTrips={arrTrips}
              locsMap={locsMap}
            />

            <CoverageSection
              title={`DEPARTURES to ${hubName}`}
              icon="🛫"
              color="#ea580c"
              transferClass="DEPARTURE"
              allExpected={crewOUT}
              allTrips={depTrips}
              locsMap={locsMap}
            />

            {arrTrips.length === 0 && depTrips.length === 0 && crewIN.length === 0 && crewOUT.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛫</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>Nessun dato per {hubName} — {fmtDate(date)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
