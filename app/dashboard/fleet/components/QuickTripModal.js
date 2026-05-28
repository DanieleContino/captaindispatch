'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'

const SERVICE_TYPES = ['Wrap', 'Charter', 'Arrival', 'Departure', 'Other']

const pad2 = n => String(n).padStart(2, '0')
function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
}
function nowHHMM() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function QuickTripModal({ vehicle, productionId, onClose, onCreated }) {
  const [step,        setStep]        = useState(1)
  const [date,        setDate]        = useState(isoToday())
  const [callTime,    setCallTime]    = useState(nowHHMM())
  const [serviceType, setServiceType] = useState('Wrap')
  const [pickupId,    setPickupId]    = useState('')
  const [dropoffIds,  setDropoffIds]  = useState([''])
  const [locations,   setLocations]   = useState([])
  const [crew,        setCrew]        = useState([])
  const [selCrew,     setSelCrew]     = useState([])
  const [search,      setSearch]      = useState('')
  const [showPicker,  setShowPicker]  = useState(null) // 'pickup' | 'dropoff_0' | 'dropoff_1' ...
  const [notifyDriver, setNotifyDriver] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')

  const locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))

  // Carica locations e crew
  useEffect(() => {
    if (!productionId) return
    Promise.all([
      supabase.from('locations').select('id, name').eq('production_id', productionId).order('name'),
      supabase.from('crew').select('id, full_name, department').eq('production_id', productionId).eq('active', true).order('full_name'),
    ]).then(([lRes, cRes]) => {
      setLocations(lRes.data || [])
      setCrew(cRes.data || [])
    })
  }, [productionId])

  function addDropoff() {
    if (dropoffIds.length >= 5) return
    setDropoffIds(p => [...p, ''])
  }

  function removeDropoff(i) {
    if (dropoffIds.length === 1) return
    setDropoffIds(p => p.filter((_, idx) => idx !== i))
  }

  function setDropoff(i, val) {
    setDropoffIds(p => p.map((v, idx) => idx === i ? val : v))
  }

  const validDropoffs = dropoffIds.filter(Boolean)
  const canProceed1 = date && callTime && pickupId && validDropoffs.length > 0

  async function handleConfirm() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/trips/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionId,
          vehicleId:    vehicle.id,
          date,
          callTime,
          serviceType,
          pickupId,
          dropoffIds:   validDropoffs,
          passengerIds: selCrew.map(c => c.id),
          notifyDriver,
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const inp = { width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: '11px', fontWeight: '800', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#f1f5f9', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#0f2340', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ color: 'white', fontWeight: '900', fontSize: '16px' }}>➕ Quick Trip</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '2px' }}>
              {vehicle.sign_code || vehicle.id} · {vehicle.driver_name || vehicle.ncc_driver_name || '–'}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Step bar */}
        <div style={{ display: 'flex', gap: '4px', padding: '10px 16px', background: '#0f2340', flexShrink: 0 }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ flex: 1, height: '3px', borderRadius: '2px', background: n < step ? '#22c55e' : n === step ? '#60a5fa' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>

        {/* Body scrollabile */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 24px' }}>

          {/* ── STEP 1: Dettagli ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>📦</div>
                <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Trip Details</div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Time</label>
                  <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} style={{ ...inp, fontWeight: '900', textAlign: 'center' }} />
                </div>
              </div>

              <div>
                <label style={lbl}>Service Type</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {SERVICE_TYPES.map(s => (
                    <button key={s} onClick={() => setServiceType(s)} style={{
                      padding: '7px 12px', borderRadius: '999px', border: `2px solid ${serviceType === s ? '#2563eb' : '#e2e8f0'}`,
                      background: serviceType === s ? '#eff6ff' : 'white', color: serviceType === s ? '#1d4ed8' : '#374151',
                      fontWeight: serviceType === s ? '800' : '500', fontSize: '12px', cursor: 'pointer',
                    }}>{s}</button>
                  ))}
                </div>
              </div>

              {/* Pickup */}
              <div>
                <label style={lbl}>Pickup</label>
                <button onClick={() => setShowPicker('pickup')} style={{
                  width: '100%', padding: '11px 14px', border: `1px solid ${pickupId ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: '10px', fontSize: '14px', color: pickupId ? '#0f172a' : '#94a3b8',
                  background: pickupId ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: pickupId ? '700' : '400',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>{locsMap[pickupId] || 'Select pickup...'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
                </button>
              </div>

              {/* Dropoffs */}
              <div>
                <label style={lbl}>Dropoff{dropoffIds.length > 1 ? 's' : ''}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {dropoffIds.map((did, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button onClick={() => setShowPicker(`dropoff_${i}`)} style={{
                        flex: 1, padding: '11px 14px', border: `1px solid ${did ? '#2563eb' : '#e2e8f0'}`,
                        borderRadius: '10px', fontSize: '14px', color: did ? '#0f172a' : '#94a3b8',
                        background: did ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: did ? '700' : '400',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>{locsMap[did] || `Dropoff ${dropoffIds.length > 1 ? i+1 : ''}...`}</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
                      </button>
                      {dropoffIds.length > 1 && (
                        <button onClick={() => removeDropoff(i)} style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                      )}
                    </div>
                  ))}
                  {dropoffIds.length < 5 && (
                    <button onClick={addDropoff} style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px dashed #bfdbfe', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                      ➕ Add Dropoff
                    </button>
                  )}
                </div>
              </div>

              <button onClick={() => setStep(2)} disabled={!canProceed1} style={{
                width: '100%', padding: '13px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '800',
                cursor: canProceed1 ? 'pointer' : 'default',
                background: canProceed1 ? '#2563eb' : '#e2e8f0',
                color: canProceed1 ? 'white' : '#94a3b8',
              }}>
                Next — Passengers →
              </button>
            </div>
          )}

          {/* ── STEP 2: Passeggeri ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>👥</div>
                <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Passengers</div>
              </div>

              {selCrew.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#1d4ed8' }}>👥 {selCrew.length} selected</span>
                    <button onClick={() => setSelCrew([])} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Remove all</button>
                  </div>
                  {selCrew.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '11px', flexShrink: 0 }}>
                        {c.full_name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                      </div>
                      <button onClick={() => setSelCrew(p => p.filter(x => x.id !== c.id))} style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <input type="text" placeholder="🔍 Search crew..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...inp, fontSize: '14px' }} />

              {search && (
                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
                  {(() => {
                    const q = search.toLowerCase()
                    const filtered = crew.filter(c => !selCrew.find(x => x.id === c.id) && (c.full_name.toLowerCase().includes(q) || (c.department || '').toLowerCase().includes(q)))
                    if (!filtered.length) return <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No results</div>
                    return filtered.map(c => (
                      <div key={c.id} onClick={() => { setSelCrew(p => [...p, c]); setSearch('') }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{c.full_name}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                        </div>
                        <span style={{ color: '#16a34a', fontSize: '20px' }}>+</span>
                      </div>
                    ))
                  })()}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>← Back</button>
                <button onClick={() => { setSearch(''); setStep(3) }} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: '#2563eb', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>
                  Review ({selCrew.length}) →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Conferma ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>📋</div>
                <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Confirm Trip</div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '12px', border: '1px solid #e2e8f0' }}>
                {[
                  ['Vehicle', vehicle.sign_code || vehicle.id],
                  ['Date', date],
                  ['Time', callTime],
                  ['Service', serviceType],
                  ['Pickup', locsMap[pickupId] || pickupId],
                  ...validDropoffs.map((did, i) => [`Dropoff${validDropoffs.length > 1 ? ` ${i+1}` : ''}`, locsMap[did] || did]),
                  ['Passengers', `${selCrew.length} pax`],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                  </div>
                ))}
              </div>

              {selCrew.length > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#374151', lineHeight: 1.6 }}>
                  👥 {selCrew.map(c => c.full_name).join(', ')}
                </div>
              )}

              {/* Notify driver toggle */}
              <div
                onClick={() => setNotifyDriver(p => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: notifyDriver ? '#eff6ff' : 'white', border: `1px solid ${notifyDriver ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: notifyDriver ? '#2563eb' : '#e2e8f0', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: '2px', left: notifyDriver ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>📱 Notify driver</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Send trip details via Captain Go</div>
                </div>
              </div>

              {err && (
                <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>
              )}

              <button onClick={handleConfirm} disabled={saving} style={{
                width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                background: saving ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '15px', fontWeight: '900',
                cursor: saving ? 'default' : 'pointer',
              }}>
                {saving ? '⏳ Creating...' : '✅ Create Trip'}
              </button>
              <button onClick={() => setStep(2)} disabled={saving} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                ← Edit Passengers
              </button>
            </div>
          )}
        </div>

      </div>
    </div>

    {/* Location picker — centered modal on desktop */}
    {showPicker && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '440px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>
              {showPicker === 'pickup' ? '📍 Pickup Location' : '📍 Dropoff Location'}
            </span>
            <button onClick={() => setShowPicker(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {locations.map(l => {
              const isSel = showPicker === 'pickup' ? pickupId === l.id : dropoffIds[parseInt(showPicker.split('_')[1])] === l.id
              return (
                <div key={l.id} onClick={() => {
                  if (showPicker === 'pickup') setPickupId(l.id)
                  else setDropoff(parseInt(showPicker.split('_')[1]), l.id)
                  setShowPicker(null)
                }} style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', background: isSel ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? '#eff6ff' : 'white' }}>
                  <span style={{ fontSize: '14px', fontWeight: isSel ? '700' : '500', color: '#0f172a' }}>{l.name}</span>
                  {isSel && <span style={{ color: '#2563eb', fontSize: '16px' }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
