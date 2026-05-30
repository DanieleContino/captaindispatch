'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { useT } from '../../../lib/i18n'
import { PageHeader } from '../../../components/ui/PageHeader'
import { TableHeader } from '../../../components/ui/TableHeader'
import { getProductionId } from '../../../lib/production'
import {
  SIDEBAR_W, TRIP_COLS, CLS, STS,
  isoToday, isoAdd, baseTripId,
} from '../../../lib/tripUtils'

import CrewInfoModal from './_components/CrewInfoModal'
import { TripRow, TripCardMobile } from './_components/TripRow'
import TripSidebar from './_components/TripSidebar'
import EditTripSidebar from './_components/EditTripSidebar'
import WaypointReviewModal from './_components/WaypointReviewModal'
import ReplicaDayModal from './_components/ReplicaDayModal'

function TripsPageInner() {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const [user,          setUser]          = useState(null)
  const [date,          setDate]          = useState(isoToday())
  const [trips,         setTrips]         = useState([])
  const [locsMap,       setLocsMap]       = useState({})
  const [locsList,      setLocsList]      = useState([])
  const [vhcList,       setVhcList]       = useState([])
  const [stList,        setStList]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [newTripOpen,   setNewTripOpen]   = useState(false)
  const [editTripRow,   setEditTripRow]   = useState(null)
  const [editTripGroup, setEditTripGroup] = useState(null)
  const [filterClass,   setFilterClass]   = useState('ALL')
  const [filterStatus,  setFilterStatus]  = useState('ALL')
  const [filterVehicle, setFilterVehicle] = useState('ALL')
  const [assignCtx,     setAssignCtx]     = useState(null)
  const [showAssignInfo, setShowAssignInfo] = useState(false)
  const [replicaOpen,   setReplicaOpen]   = useState(false)
  const [optimizeGroup, setOptimizeGroup] = useState(null)

  const anySidebarOpen = newTripOpen || !!editTripRow

  // Read assign crew context from URL params
  useEffect(() => {
    const id    = searchParams.get('assignCrewId')
    const name  = searchParams.get('assignCrewName')
    const hotel = searchParams.get('assignHotelId')
    const ts    = searchParams.get('assignTS')
    const d     = searchParams.get('assignDate')
    if (id && name) {
      setAssignCtx({ id, name, hotel: hotel || '', ts: ts || 'PRESENT' })
      if (d) setDate(d)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) {
        await supabase.from('user_roles').upsert(
          { user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' },
          { onConflict: 'user_id,production_id', ignoreDuplicates: true }
        )
        const [locsR, vhcR, stR] = await Promise.all([
          supabase.from('locations').select('uuid,display_id,id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name'),
          supabase.from('vehicles').select('uuid,display_id,id,driver_name,sign_code,capacity,vehicle_type,available_from,available_to,preferred_dept,preferred_crew_ids').eq('production_id', PRODUCTION_ID).eq('active', true).eq('in_transport', true).order('display_id'),
          supabase.from('service_types').select('id,name').eq('production_id', PRODUCTION_ID).order('sort_order'),
        ])
        if (locsR.data) { const m = {}; locsR.data.forEach(l => { m[l.id] = l.name }); setLocsMap(m); setLocsList(locsR.data) }
        if (vhcR.data) setVhcList(vhcR.data)
        if (stR.data)  setStList(stR.data)
      }
      setUser(user)
    })
  }, [])

  const loadTrips = useCallback(async d => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase.from('trips').select('*')
      .eq('production_id', PRODUCTION_ID).eq('date', d)
      .order('pickup_min', { ascending: true, nullsLast: true })
    setTrips(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadTrips(date) }, [user, date, loadTrips])

  // Mantieni editTripGroup sincronizzato con trips dopo ogni reload
  useEffect(() => {
    if (!editTripRow) return
    const newGroup = editTripRow.trip_group_id
      ? trips.filter(t => t.trip_group_id === editTripRow.trip_group_id)
      : trips.filter(t =>
          baseTripId(t.trip_id) === baseTripId(editTripRow.trip_id) &&
          (t.vehicle_id || '__none__') === (editTripRow.vehicle_id || '__none__')
        )
    if (newGroup.length === 0) {
      setEditTripRow(null)
      setEditTripGroup(null)
    } else {
      setEditTripGroup(newGroup)
    }
  }, [trips])

  // Open new trip sidebar automatically when assignCtx is active
  useEffect(() => {
    if (!assignCtx || loading) return
    setNewTripOpen(true)
    setEditTripRow(null)
  }, [assignCtx, loading])

  // Filtered + grouped
  const filtered = trips.filter(t =>
    (filterClass   === 'ALL' || t.transfer_class === filterClass) &&
    (filterStatus  === 'ALL' || t.status         === filterStatus) &&
    (filterVehicle === 'ALL' || t.vehicle_id     === filterVehicle)
  )
  const grouped = Object.values(
    filtered.reduce((acc, t) => {
      const key = t.trip_group_id || (baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__'))
      if (!acc[key]) acc[key] = []
      acc[key].push(t)
      return acc
    }, {})
  ).sort((a, b) => {
    const aMin = Math.min(...a.map(r => r.pickup_min ?? r.call_min ?? 9999))
    const bMin = Math.min(...b.map(r => r.pickup_min ?? r.call_min ?? 9999))
    return aMin - bMin
  })

  const vehicles = [...new Set(trips.map(t => t.vehicle_id).filter(Boolean))].sort()
  const cnts = {
    A: trips.filter(t => t.transfer_class === 'ARRIVAL').length,
    D: trips.filter(t => t.transfer_class === 'DEPARTURE').length,
    S: trips.filter(t => t.transfer_class === 'STANDARD').length,
  }

  const suggestedBaseIds = useMemo(() => {
    if (!assignCtx) return new Set()
    return new Set(
      trips.filter(t => {
        if (assignCtx.ts === 'IN')  return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
        if (assignCtx.ts === 'OUT') return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
        return t.transfer_class === 'STANDARD' && t.pickup_id === assignCtx.hotel
      }).map(t => baseTripId(t.trip_id))
    )
  }, [trips, assignCtx])

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Mobile toolbar */}
      {isMobile && (
        <>
          <div style={{ position: 'sticky', top: '0px', zIndex: 22, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1, touchAction: 'manipulation' }}>◀</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 8px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
            <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1, touchAction: 'manipulation' }}>▶</button>
            <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8', touchAction: 'manipulation', whiteSpace: 'nowrap' }}>{t.today}</button>
          </div>
          <div style={{ position: 'sticky', top: '52px', zIndex: 21, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '6px 12px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['ALL', 'ARR', 'DEP', 'STD'].map(s => {
              const fullMap = { ARR: 'ARRIVAL', DEP: 'DEPARTURE', STD: 'STANDARD' }
              const full = fullMap[s] || s
              const active = filterClass === full || (s === 'ALL' && filterClass === 'ALL')
              const c = CLS[full]
              return <button key={s} onClick={() => setFilterClass(s === 'ALL' ? 'ALL' : full)} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', touchAction: 'manipulation', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>{s}</button>
            })}
            <div style={{ width: '1px', height: '20px', background: '#e2e8f0', flexShrink: 0 }} />
            {['ALL', 'PLANNED', 'DONE'].map(s => {
              const active = filterStatus === s
              const c = STS[s]
              return <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', touchAction: 'manipulation', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { ...c, borderColor: '#e2e8f0' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>{s}</button>
            })}
            {(filterClass !== 'ALL' || filterStatus !== 'ALL') && (
              <button onClick={() => { setFilterClass('ALL'); setFilterStatus('ALL') }} style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', touchAction: 'manipulation' }}>✕</button>
            )}
          </div>
        </>
      )}

      {/* Desktop header */}
      {!isMobile && <PageHeader
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '18px' }}>🚐﹏</span>
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>Trips</span>
            <button onClick={() => { setNewTripOpen(true); setEditTripRow(null) }}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', whiteSpace: 'nowrap' }}>
              + New Trip
            </button>
            <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>◀</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
            <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>▶</button>
            <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>{t.today}</button>
            <div style={{ display: 'flex', gap: '5px', marginLeft: '8px' }}>
              {[
                { n: trips.length, l: 'total', c: '#374151', bg: '#f8fafc', b: '#e2e8f0' },
                { n: cnts.A, l: 'ARR', c: '#15803d', bg: '#dcfce7', b: '#86efac' },
                { n: cnts.D, l: 'DEP', c: '#c2410c', bg: '#fff7ed', b: '#fdba74' },
                { n: cnts.S, l: 'STD', c: '#1d4ed8', bg: '#eff6ff', b: '#93c5fd' },
              ].map(s => (
                <span key={s.l} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>{s.n} {s.l}</span>
              ))}
            </div>
          </div>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              {['ALL', 'ARR', 'DEP', 'STD'].map(s => {
                const fullMap = { ARR: 'ARRIVAL', DEP: 'DEPARTURE', STD: 'STANDARD' }
                const full   = fullMap[s] || s
                const active = filterClass === full || (s === 'ALL' && filterClass === 'ALL')
                const c      = CLS[full]
                return (
                  <button key={s} onClick={() => setFilterClass(s === 'ALL' ? 'ALL' : full)}
                    style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                    {s}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '3px' }}>
              {['ALL', 'PLANNED', 'BUSY', 'DONE'].map(s => {
                const active = filterStatus === s
                const c = STS[s]
                return (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { ...c, borderColor: '#e2e8f0' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                    {s}
                  </button>
                )
              })}
            </div>
            {vehicles.length > 0 && (
              <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
                style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', cursor: 'pointer' }}>
                <option value="ALL">{t.allVehicles}</option>
                {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {(filterClass !== 'ALL' || filterStatus !== 'ALL' || filterVehicle !== 'ALL') && (
              <button onClick={() => { setFilterClass('ALL'); setFilterStatus('ALL'); setFilterVehicle('ALL') }}
                style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>✕</button>
            )}
            <button onClick={() => setReplicaOpen(true)}
              style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📋 Replica
            </button>
          </div>
        }
      />}

      {/* Assign context banner */}
      {assignCtx && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 18px', background: '#fffbeb', borderBottom: '2px solid #f59e0b', fontSize: '12px', transition: 'margin-right 0.25s', marginRight: isMobile ? 0 : (anySidebarOpen ? `${SIDEBAR_W}px` : 0) }}>
          <span style={{ fontSize: '14px' }}>👤</span>
          <span style={{ fontWeight: '800', color: '#92400e' }}>{t.assigningLabel}</span>
          <span style={{ fontWeight: '700', color: '#0f172a' }}>{assignCtx.name}</span>
          <button onClick={() => setShowAssignInfo(true)} style={{ background: 'none', border: '1px solid #fde68a', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', color: '#92400e', fontWeight: '800', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
          <span style={{ color: '#d97706' }}>·</span>
          <span style={{ color: '#92400e' }}>Status: <strong>{assignCtx.ts}</strong></span>
          {suggestedBaseIds.size > 0
            ? <span style={{ color: '#15803d', fontWeight: '700' }}>⭐ {suggestedBaseIds.size} trip{suggestedBaseIds.size > 1 ? 's' : ''} suggested</span>
            : <span style={{ color: '#dc2626', fontWeight: '700' }}>{t.noCompatibleTrips}</span>
          }
          <button onClick={() => setAssignCtx(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #fde68a', color: '#92400e', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>{t.dismiss}</button>
        </div>
      )}

      {/* Column header */}
      {!isMobile && trips.length > 0 && (
        <TableHeader
          columns={TRIP_COLS}
          style={{
            top: assignCtx ? '92px' : '52px',
            transition: 'margin-right 0.25s, top 0.15s',
            marginRight: anySidebarOpen ? `${SIDEBAR_W}px` : 0,
          }}
        />
      )}

      {/* Content */}
      <div style={{ transition: 'margin-right 0.25s', marginRight: isMobile ? 0 : (anySidebarOpen ? `${SIDEBAR_W}px` : 0), paddingBottom: isMobile ? '80px' : 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              {trips.length === 0 ? t.noTripsDate : t.noResultsFiltered}
            </div>
            {trips.length === 0 && (
              <button onClick={() => setNewTripOpen(true)} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '8px' }}>
                + New Trip
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'white' }}>
            {grouped.map((group, i) => {
              const key = group[0].trip_group_id || (group[0].trip_id + i)
              const props = {
                group,
                locations: locsMap,
                selected: !!editTripRow && (
                  editTripRow.trip_group_id
                    ? group[0].trip_group_id === editTripRow.trip_group_id
                    : baseTripId(editTripRow.trip_id) === baseTripId(group[0].trip_id)
                ),
                isSuggested: !!assignCtx && suggestedBaseIds.has(baseTripId(group[0].trip_id)),
                onClick: () => { setEditTripRow(group[0]); setEditTripGroup(group); setNewTripOpen(false) },
                onOptimize: group.length > 1 ? g => setOptimizeGroup(g) : null,
              }
              return isMobile ? <TripCardMobile key={key} {...props} /> : <TripRow key={key} {...props} />
            })}
          </div>
        )}
      </div>

      {/* FAB mobile */}
      {isMobile && !newTripOpen && !editTripRow && (
        <button onClick={() => { setNewTripOpen(true); setEditTripRow(null) }} style={{ position: 'fixed', bottom: '24px', right: '20px', width: '56px', height: '56px', borderRadius: '50%', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontSize: '24px', boxShadow: '0 4px 16px rgba(37,99,235,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', lineHeight: 1 }}>+</button>
      )}

      {/* Assign crew info modal */}
      {showAssignInfo && assignCtx && (
        <CrewInfoModal
          crew={{ id: assignCtx.id, full_name: assignCtx.name }}
          productionId={PRODUCTION_ID}
          locations={locsList}
          onClose={() => setShowAssignInfo(false)}
        />
      )}

      {/* CREATE sidebar */}
      <TripSidebar
        open={newTripOpen}
        onClose={() => setNewTripOpen(false)}
        defaultDate={date}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onSaved={() => loadTrips(date)}
        assignCtx={assignCtx}
        trips={trips}
        onLocationCreated={async () => {
          if (!PRODUCTION_ID) return
          const { data } = await supabase.from('locations').select('*').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name')
          if (data) { const m = {}; data.forEach(l => { m[l.id] = l.name }); setLocsMap(m); setLocsList(data) }
        }}
        currentUser={user ? { id: user.id, name: user.user_metadata?.full_name || user.email, role: 'CAPTAIN' } : null}
      />

      {/* EDIT sidebar */}
      <EditTripSidebar
        open={!!editTripRow}
        initial={editTripRow}
        group={editTripGroup}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onClose={() => setEditTripRow(null)}
        onSaved={() => { setEditTripRow(null); loadTrips(date) }}
        onPaxChanged={() => loadTrips(date)}
        currentUser={user ? { id: user.id, name: user.user_metadata?.full_name || user.email, role: 'CAPTAIN' } : null}
      />

      {/* Replica Day Modal */}
      <ReplicaDayModal
        open={replicaOpen}
        onClose={() => setReplicaOpen(false)}
        sourceDate={isoAdd(date, -1)}
        targetDate={date}
        locations={locsList}
        onDone={() => loadTrips(date)}
      />

      {/* Waypoint Review Modal */}
      <WaypointReviewModal
        open={!!optimizeGroup}
        group={optimizeGroup}
        locations={locsMap}
        productionId={PRODUCTION_ID}
        onClose={() => setOptimizeGroup(null)}
        onSaved={() => { setOptimizeGroup(null); loadTrips(date) }}
      />
    </div>
  )
}

export default function TripsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>}>
      <TripsPageInner />
    </Suspense>
  )
}
