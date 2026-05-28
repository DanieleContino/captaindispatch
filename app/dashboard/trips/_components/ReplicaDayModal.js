'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { getProductionId } from '../../../../lib/production'
import { fmtDate, minToHHMM, baseTripId, fmtPax, CLS, isoAdd } from '../../../../lib/tripUtils'

function ReplicaDayModal({ open, onClose, sourceDate, targetDate, locations, onDone }) {
  const PRODUCTION_ID = getProductionId()
  const [prevTrips, setPrevTrips] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [copying,   setCopying]   = useState(false)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(new Set())
  const [done,      setDone]      = useState(false)
  const [doneCount, setDoneCount] = useState(0)

  useEffect(() => {
    if (!open || !PRODUCTION_ID || !sourceDate) return
    setLoading(true)
    setError(null)
    setDone(false)
    setDoneCount(0)
    supabase.from('trips').select('*')
      .eq('production_id', PRODUCTION_ID)
      .eq('date', sourceDate)
      .order('pickup_min', { ascending: true, nullsLast: true })
      .then(({ data }) => {
        const rows = data || []
        setPrevTrips(rows)
        const keys = new Set()
        for (const t of rows) {
          const key = t.trip_group_id || (baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__'))
          keys.add(key)
        }
        setSelected(keys)
        setLoading(false)
      })
  }, [open, sourceDate, PRODUCTION_ID])

  const grouped = Object.values(
    prevTrips.reduce((acc, t) => {
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

  const groupKey = g => g[0].trip_group_id || (baseTripId(g[0].trip_id) + '::' + (g[0].vehicle_id || '__none__'))
  const allKeys      = grouped.map(groupKey)
  const allSelected  = allKeys.length > 0 && allKeys.every(k => selected.has(k))
  const selectedCount = grouped.filter(g => selected.has(groupKey(g))).length

  function toggleGroup(key) {
    setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allKeys))
  }

  async function handleCopy() {
    if (!PRODUCTION_ID || selectedCount === 0) return
    setCopying(true); setError(null)
    try {
      const groupsToCopy = grouped.filter(g => selected.has(groupKey(g)))

      const { data: existingTrips } = await supabase.from('trips')
        .select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(100)
      let maxNum = 0
      for (const t of (existingTrips || [])) {
        const n = parseInt((t.trip_id || '').replace(/[^0-9]/g, '')) || 0
        if (n > maxNum) maxNum = n
      }

      let counter = maxNum
      for (const group of groupsToCopy) {
        counter++
        const newBase = 'T' + String(counter).padStart(3, '0')
        const sibSuffixes = ['', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        const newGroupId = crypto.randomUUID()

        for (let i = 0; i < group.length; i++) {
          const src       = group[i]
          const newTripId = newBase + (i === 0 ? '' : sibSuffixes[i])

          const [y, mo, dd] = targetDate.split('-').map(Number)
          let newStartDt = null, newEndDt = null
          if (src.pickup_min !== null && src.pickup_min !== undefined) {
            const pm = src.pickup_min
            const base = new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0)
            newStartDt = base.toISOString()
            if (src.duration_min) newEndDt = new Date(base.getTime() + src.duration_min * 60000).toISOString()
          }

          const newRow = {
            production_id:   PRODUCTION_ID,
            trip_id:         newTripId,
            trip_group_id:   newGroupId,
            leg_order:       i + 1,
            date:            targetDate,
            pickup_id:       src.pickup_id,
            dropoff_id:      src.dropoff_id,
            vehicle_id:      src.vehicle_id      || null,
            driver_name:     src.driver_name     || null,
            sign_code:       src.sign_code       || null,
            capacity:        src.capacity        || null,
            service_type_id: src.service_type_id || null,
            duration_min:    src.duration_min    || null,
            arr_time:        src.arr_time        || null,
            call_min:        src.call_min        ?? null,
            pickup_min:      src.pickup_min      ?? null,
            start_dt:        newStartDt,
            end_dt:          newEndDt,
            flight_no:       src.flight_no       || null,
            terminal:        src.terminal        || null,
            notes:           src.notes           || null,
            status:          'PLANNED',
            pax_count:       src.pax_count       || 0,
            passenger_list:  src.passenger_list  || null,
          }

          const { data: ins, error: insErr } = await supabase.from('trips').insert(newRow).select('id').single()
          if (insErr || !ins?.id) throw new Error(insErr?.message || `Errore inserimento ${newTripId}`)

          if (src.pax_count > 0 && ins.id) {
            const { data: srcPax } = await supabase.from('trip_passengers')
              .select('crew_id').eq('trip_row_id', src.id)
            if (srcPax && srcPax.length > 0) {
              await supabase.from('trip_passengers').insert(
                srcPax.map(p => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: p.crew_id }))
              )
            }
          }
        }
      }

      setDoneCount(groupsToCopy.length)
      setDone(true)
      setTimeout(() => { onDone(); onClose() }, 1800)
    } catch (e) {
      setError(e.message)
    } finally {
      setCopying(false)
    }
  }

  if (!open) return null

  const locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const locShort = id => (locsMap[id] || id || '–').split(' ').slice(0, 2).join(' ')

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,35,64,0.55)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, width: 'calc(100% - 32px)', maxWidth: '560px', maxHeight: '90vh', background: 'white', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ background: '#0f2340', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>📋 Replica trip</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Da <strong style={{ color: '#fbbf24' }}>{fmtDate(sourceDate)}</strong> → <strong style={{ color: '#86efac' }}>{fmtDate(targetDate)}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        {!loading && grouped.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#f8fafc' }}>
            <button onClick={toggleAll}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
              {allSelected ? '☑ Deseleziona tutti' : '☐ Seleziona tutti'}
            </button>
            <span style={{ fontSize: '12px', fontWeight: '700', color: selectedCount > 0 ? '#1d4ed8' : '#94a3b8' }}>
              {selectedCount} / {grouped.length} selezionati
            </span>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Caricamento…</div>
          ) : grouped.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>Nessun trip trovato per {fmtDate(sourceDate)}</div>
            </div>
          ) : grouped.map((group, i) => {
            const t   = group[0]
            const key = groupKey(group)
            const isSel = selected.has(key)
            const cls  = CLS[t.transfer_class] || CLS.STANDARD
            const callTime   = t.call_min !== null && t.call_min !== undefined ? minToHHMM(t.call_min) : '–'
            const dropoffIds = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
            const pickupIds  = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
            const isMixed    = pickupIds.length > 1 || dropoffIds.length > 1
            const dropoffLoc = dropoffIds.length > 1
              ? dropoffIds.map(id => locShort(id)).join(' / ')
              : locShort(t.dropoff_id)
            const totalPax = group.reduce((s, r) => s + (r.pax_count || 0), 0)
            return (
              <div key={key + i} onClick={() => toggleGroup(key)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', marginBottom: '5px', borderRadius: '10px', border: `2px solid ${isSel ? '#2563eb' : '#e2e8f0'}`, background: isSel ? '#eff6ff' : 'white', cursor: 'pointer', transition: 'border-color 0.1s, background 0.1s' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '5px', border: `2px solid ${isSel ? '#2563eb' : '#cbd5e1'}`, background: isSel ? '#2563eb' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                  {isSel && <span style={{ color: 'white', fontSize: '13px', lineHeight: 1 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', lineHeight: 1 }}>{callTime}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '900', color: '#1e3a5f' }}>{baseTripId(t.trip_id)}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{t.transfer_class?.slice(0, 3) || 'STD'}</span>
                    {isMixed && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>🔀 MULTI</span>}
                    {t.vehicle_id && <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>🚐 {t.vehicle_id}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#94a3b8' }}>{locShort(t.pickup_id)}</span>
                    <span style={{ color: '#cbd5e1' }}>→</span>
                    <span style={{ fontWeight: '700', color: '#0f172a' }}>{dropoffLoc}</span>
                    {totalPax > 0 && <span style={{ color: '#64748b', marginLeft: '4px' }}>· 👥 {totalPax} pax</span>}
                    {t.flight_no && <span style={{ color: '#2563eb', fontWeight: '700', marginLeft: '4px' }}>✈ {t.flight_no}</span>}
                  </div>
                  {t.passenger_list && (
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.passenger_list.split(',').map(s => fmtPax(s.trim())).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div style={{ margin: '0 12px 8px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', flexShrink: 0 }}>❌ {error}</div>
        )}
        {done && (
          <div style={{ margin: '0 12px 8px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#15803d', fontSize: '13px', fontWeight: '700', textAlign: 'center', flexShrink: 0 }}>
            ✅ {doneCount} trip replicati su {fmtDate(targetDate)}!
          </div>
        )}

        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
            Annulla
          </button>
          <button onClick={handleCopy} disabled={copying || selectedCount === 0 || done}
            style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: (copying || selectedCount === 0 || done) ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '13px', cursor: (copying || selectedCount === 0 || done) ? 'default' : 'pointer', fontWeight: '800' }}>
            {copying ? 'Copia in corso…' : `✅ Replica ${selectedCount} trip su ${fmtDate(targetDate)}`}
          </button>
        </div>
      </div>
    </>
  )
}

export default ReplicaDayModal
