'use client'
import { useState, useEffect } from 'react'

function WaypointReviewModal({ open, group, locations, productionId, onClose, onSaved }) {
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [legs,       setLegs]       = useState([])
  const [optimized,  setOptimized]  = useState(null)
  const [type,       setType]       = useState(null)
  const [totalDur,   setTotalDur]   = useState(null)
  const [dragIdx,    setDragIdx]    = useState(null)

  useEffect(() => {
    if (!open || !group || group.length < 2) return
    setError(null); setOptimized(null); setLegs([]); setType(null); setTotalDur(null)
    setLoading(true)
    fetch('/api/routes/optimize-waypoints', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ leg_ids: group.map(g => g.id), production_id: productionId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error + (data.detail ? ': ' + data.detail : '')); setLoading(false); return }
        const ordered = data.optimized_order.map(i => data.legs[i])
        setLegs(ordered)
        setOptimized(data.optimized_order)
        setType(data.type)
        setTotalDur(data.total_duration ? Math.round(data.total_duration / 60) : null)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [open, group])

  function handleDragStart(idx) { setDragIdx(idx) }
  function handleDragOver(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newLegs = [...legs]
    const [moved] = newLegs.splice(dragIdx, 1)
    newLegs.splice(idx, 0, moved)
    setLegs(newLegs)
    setDragIdx(idx)
  }
  function handleDragEnd() { setDragIdx(null) }

  async function handleConfirm() {
    if (!legs.length || !productionId) return
    setSaving(true); setError(null)
    try {
      await Promise.all(legs.map((leg, i) =>
        fetch('/api/trips/update-leg-order', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ trip_id: leg.id, leg_order: i + 1, production_id: productionId }),
        })
      ))
      await fetch('/api/routes/compute-chain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leg_ids: legs.map(l => l.id), production_id: productionId, respect_leg_order: true }),
      })
      setSaving(false)
      onSaved()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,35,64,0.55)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, width: 'calc(100% - 32px)', maxWidth: '480px', maxHeight: '90vh', background: 'white', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: '#1e3a5f', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>⚡ Waypoint Optimization</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {type && <span style={{ color: '#fbbf24', fontWeight: '700' }}>{type}</span>}
              {totalDur && <span style={{ color: '#86efac', marginLeft: '8px' }}>🕐 {totalDur} min total</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>Calculating optimal route…</div>
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>
          )}
          {!loading && !error && legs.length > 0 && (
            <>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '7px', padding: '8px 12px' }}>
                💡 Google suggests this order. Drag to reorder manually before confirming.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {legs.map((leg, i) => {
                  const isMultiPkp = type === 'MULTI-PKP'
                  const hotelName  = isMultiPkp ? leg.pickup_name : leg.dropoff_name
                  const hubName    = isMultiPkp ? leg.dropoff_name : leg.pickup_name
                  return (
                    <div
                      key={leg.id}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={e => handleDragOver(e, i)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '10px',
                        background: dragIdx === i ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${dragIdx === i ? '#93c5fd' : '#e2e8f0'}`,
                        cursor: 'grab', userSelect: 'none',
                      }}
                    >
                      <div style={{ fontSize: '16px', color: '#94a3b8', flexShrink: 0 }}>⠿</div>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#1e3a5f', color: 'white', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🏨 {hotelName}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                          {isMultiPkp ? `→ ${hubName}` : `← ${hubName}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {!loading && !error && legs.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? 'Applying…' : '✓ Apply this order'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default WaypointReviewModal
