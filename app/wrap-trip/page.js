'use client'

/**
 * /wrap-trip — Wrap Trip mobile wizard
 * Equivalente di WrapTripApp.html in Apps Script (09_WrapTrip.gs)
 *
 * Flow 4 step:
 *  1. Data + Pickup location (dove si trova il driver adesso)
 *  2. Vehicle selection
 *  3. Selezione passeggeri (tutti i crew CONFIRMED)
 *  4. Review (raggruppati per hotel) + Confirm → crea trip
 *
 * Trip ID = W_HHMMSS (ora locale confirm — NON ora server UTC!)
 * Un trip per hotel di destinazione, stesso Trip_ID, stesso Call_Min.
 * Equivalente multi-dropoff: trips.trip_id identico, dropoff diversi.
 */

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

// ─── Utility ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function isoToday() { return new Date().toISOString().split('T')[0] }
function nowHHMM()  { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}

// Step indicator
function StepDot({ n, current, done }) {
  const bg = done ? '#16a34a' : n === current ? '#2563eb' : '#e2e8f0'
  const tc = done || n === current ? 'white' : '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: bg, color: tc, fontWeight: '800', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {done ? '✓' : n}
      </div>
    </div>
  )
}

// ─── Componente inner ─────────────────────────────────────────
function WrapTripContent() {
  const searchParams = useSearchParams()
  const preVehicle   = searchParams.get('vehicle') || ''

  const [step,      setStep]      = useState(1)
  const [date,      setDate]      = useState(isoToday())
  const [callTime,  setCallTime]  = useState(nowHHMM())
  const [pickupId,  setPickupId]  = useState('')
  const [vehicleId, setVehicleId] = useState(preVehicle)
  const [selCrew,   setSelCrew]   = useState([])
  const [search,    setSearch]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(null)  // { tripId, count }
  const [err,       setErr]       = useState('')

  // Data
  const [locations, setLocations] = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [crew,      setCrew]      = useState([])

  // Load static data
  useEffect(() => {
    if (!PRODUCTION_ID) return
    Promise.all([
      supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: true }).order('name'),
      supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
      supabase.from('crew').select('id,full_name,department,hotel_id').eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED').order('department').order('full_name'),
    ]).then(([lR, vR, cR]) => {
      setLocations(lR.data || [])
      setVehicles(vR.data || [])
      setCrew(cR.data || [])
    })
  }, [])

  // Raggruppa passeggeri selezionati per hotel
  const locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const grouped = selCrew.reduce((acc, c) => {
    const hotel = c.hotel_id || '__unknown__'
    if (!acc[hotel]) acc[hotel] = []
    acc[hotel].push(c)
    return acc
  }, {})
  const hotels = Object.keys(grouped)

  // ── Confirm → crea trip ───────────────────────────────────
  async function handleConfirm() {
    if (!PRODUCTION_ID || hotels.length === 0) return
    setSaving(true); setErr('')
    try {
      const callMin  = timeStrToMin(callTime)
      const now      = new Date()
      const tripId   = 'W_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds())
      const selVehicle = vehicles.find(v => v.id === vehicleId)

      for (const hotelId of hotels) {
        // Durata rotta (se esiste)
        const { data: route } = await supabase.from('routes').select('duration_min')
          .eq('production_id', PRODUCTION_ID).eq('from_id', pickupId).eq('to_id', hotelId).maybeSingle()
        const durMin = route?.duration_min || 30  // default 30 min se rotta non trovata

        // Calcola tempi (STANDARD: pickup = call - duration)
        const pickupMin = callMin !== null ? ((callMin - durMin) % 1440 + 1440) % 1440 : callMin
        const [y, mo, dd] = date.split('-').map(Number)
        const startMs = pickupMin !== null
          ? new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
          : null
        const startDt = startMs ? new Date(startMs).toISOString() : null
        const endDt   = startMs ? new Date(startMs + durMin * 60000).toISOString() : null

        // Inserisci trip
        const row = {
          production_id: PRODUCTION_ID,
          trip_id:     tripId,
          date,
          pickup_id:   pickupId,
          dropoff_id:  hotelId,
          vehicle_id:  vehicleId || null,
          driver_name: selVehicle?.driver_name || null,
          sign_code:   selVehicle?.sign_code   || null,
          capacity:    selVehicle?.capacity    || null,
          duration_min: durMin,
          call_min:    callMin,
          pickup_min:  pickupMin,
          start_dt:    startDt,
          end_dt:      endDt,
          status:      'PLANNED',
          pax_count:   0,
        }

        const { data: ins, error: insErr } = await supabase.from('trips').insert(row).select('id').single()
        if (insErr) throw new Error(insErr.message)

        // Inserisci passeggeri
        if (ins?.id && grouped[hotelId].length > 0) {
          await supabase.from('trip_passengers').insert(
            grouped[hotelId].map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
          )
        }
      }

      setDone({ tripId, count: hotels.length })
    } catch (e) {
      setErr(e.message)
    }
    setSaving(false)
  }

  // ── Done screen ───────────────────────────────────────────
  if (done) return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
      <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>Wrap Trip creato!</div>
      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
        Trip <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{done.tripId}</strong>
        <br />{done.count} destinazion{done.count > 1 ? 'i' : 'e'} · {selCrew.length} passeggeri
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <a href="/dashboard/trips" style={{ display: 'block', background: '#0f2340', color: 'white', padding: '13px', borderRadius: '10px', fontSize: '14px', fontWeight: '800', textDecoration: 'none' }}>
          📋 Vedi Trips
        </a>
        <button onClick={() => { setStep(1); setSelCrew([]); setDone(null); setCallTime(nowHHMM()) }}
          style={{ background: 'white', border: '1px solid #e2e8f0', color: '#374151', padding: '13px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
          🔄 Nuovo Wrap Trip
        </button>
      </div>
    </div>
  )

  const inp = { width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '11px', fontWeight: '800', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }
  const btn = { width: '100%', padding: '14px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '800', cursor: 'pointer' }

  return (
    <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>

      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '24px' }}>
        {[1,2,3,4].map((n, i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <StepDot n={n} current={step} done={step > n} />
            {i < 3 && <div style={{ width: '24px', height: '2px', background: step > n+1 ? '#16a34a' : '#e2e8f0', margin: '0 2px' }} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Data + Pickup ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>📦</div>
            <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Wrap Trip</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Dove siete adesso? Quando si parte?</div>
          </div>
          <div>
            <label style={lbl}>Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Call Time (ora partenza)</label>
            <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)}
              style={{ ...inp, fontSize: '22px', fontWeight: '900', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <div>
            <label style={lbl}>Pickup (dove siete adesso)</label>
            <select value={pickupId} onChange={e => setPickupId(e.target.value)} style={inp}>
              <option value="">Seleziona location…</option>
              <optgroup label="Locations / Set">
                {locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
              <optgroup label="Hubs (aeroporti / stazioni)">
                {locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            </select>
          </div>
          <button onClick={() => setStep(2)} disabled={!date || !callTime || !pickupId}
            style={{ ...btn, background: !date || !callTime || !pickupId ? '#e2e8f0' : '#2563eb', color: !date || !callTime || !pickupId ? '#94a3b8' : 'white' }}>
            Avanti →
          </button>
        </div>
      )}

      {/* ── STEP 2: Vehicle ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>🚐</div>
            <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Veicolo</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {vehicles.map(v => {
              const sel = vehicleId === v.id
              return (
                <div key={v.id} onClick={() => setVehicleId(sel ? '' : v.id)}
                  style={{ padding: '14px 16px', borderRadius: '10px', border: `2px solid ${sel ? '#2563eb' : '#e2e8f0'}`, background: sel ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{v.id}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {[v.driver_name, v.sign_code, v.capacity ? `×${v.capacity}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {sel && <span style={{ color: '#2563eb', fontSize: '18px' }}>✓</span>}
                </div>
              )
            })}
            <div onClick={() => setVehicleId('')}
              style={{ padding: '14px 16px', borderRadius: '10px', border: `2px solid ${!vehicleId ? '#2563eb' : '#e2e8f0'}`, background: !vehicleId ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
              Nessun veicolo
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep(1)} style={{ ...btn, flex: 1, background: 'white', border: '1px solid #e2e8f0', color: '#374151' }}>← Indietro</button>
            <button onClick={() => setStep(3)} style={{ ...btn, flex: 2, background: '#2563eb', color: 'white' }}>Avanti →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Passengers ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>👥</div>
            <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Passeggeri</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Chi è in macchina?</div>
          </div>

          {selCrew.length > 0 && (
            <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>{selCrew.length} selezionati</span>
              <button onClick={() => setSelCrew([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '11px', fontWeight: '700' }}>Clear</button>
            </div>
          )}

          <input type="text" placeholder="Cerca crew…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, padding: '10px 14px', fontSize: '13px' }} />

          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            {(() => {
              const filtered = crew.filter(c => !search || c.full_name.toLowerCase().includes(search.toLowerCase()) || (c.department || '').toLowerCase().includes(search.toLowerCase()))
              if (filtered.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Nessun risultato</div>

              let lastDept = null
              return filtered.map(c => {
                const isSel = selCrew.some(x => x.id === c.id)
                const hotelName = locsMap[c.hotel_id] || c.hotel_id || '?'
                const deptHeader = (!search && c.department !== lastDept) ? (lastDept = c.department, c.department) : null
                return (
                  <div key={c.id}>
                    {deptHeader && (
                      <div style={{ padding: '6px 14px', background: '#f8fafc', fontSize: '9px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>
                        {deptHeader}
                      </div>
                    )}
                    <div onClick={() => setSelCrew(p => isSel ? p.filter(x => x.id !== c.id) : [...p, c])}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', background: isSel ? '#eff6ff' : 'white', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'white' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSel ? '#2563eb' : '#cbd5e1'}`, background: isSel ? '#2563eb' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSel && <span style={{ color: 'white', fontSize: '11px', fontWeight: '900' }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: isSel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{hotelName}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep(2)} style={{ ...btn, flex: 1, background: 'white', border: '1px solid #e2e8f0', color: '#374151' }}>← Indietro</button>
            <button onClick={() => setStep(4)} disabled={selCrew.length === 0}
              style={{ ...btn, flex: 2, background: selCrew.length === 0 ? '#e2e8f0' : '#2563eb', color: selCrew.length === 0 ? '#94a3b8' : 'white' }}>
              Review ({selCrew.length}) →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review + Confirm ── */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>📋</div>
            <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a' }}>Conferma Wrap Trip</div>
          </div>

          {/* Summary */}
          <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#374151', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div><span style={{ color: '#64748b' }}>Data:</span> <strong>{date}</strong></div>
            <div><span style={{ color: '#64748b' }}>Call:</span> <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{callTime}</strong></div>
            <div><span style={{ color: '#64748b' }}>Da:</span> <strong>{locsMap[pickupId] || pickupId}</strong></div>
            {vehicleId && <div><span style={{ color: '#64748b' }}>Veicolo:</span> <strong>{vehicleId}</strong></div>}
            <div><span style={{ color: '#64748b' }}>Pax:</span> <strong>{selCrew.length}</strong> · <span style={{ color: '#64748b' }}>Trip ID:</span> <strong style={{ fontFamily: 'monospace' }}>W_{callTime.replace(':', '')}</strong></div>
          </div>

          {/* Hotels grouping */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '8px' }}>DESTINAZIONI ({hotels.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {hotels.map(hotelId => (
                <div key={hotelId} style={{ padding: '10px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontWeight: '700', fontSize: '12px', color: '#0f172a', marginBottom: '4px' }}>
                    → {hotelId === '__unknown__' ? '(hotel sconosciuto)' : (locsMap[hotelId] || hotelId)}
                    <span style={{ color: '#94a3b8', fontWeight: '500', marginLeft: '6px' }}>{grouped[hotelId].length} pax</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {grouped[hotelId].map(c => c.full_name).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {err && <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>}

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button onClick={() => setStep(3)} disabled={saving} style={{ ...btn, flex: 1, background: 'white', border: '1px solid #e2e8f0', color: '#374151' }}>← Modifica</button>
            <button onClick={handleConfirm} disabled={saving || hotels.length === 0}
              style={{ ...btn, flex: 2, background: saving ? '#94a3b8' : '#16a34a', color: 'white' }}>
              {saving ? '⏳ Creazione…' : '✅ Conferma Wrap Trip'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
export default function WrapTripPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Mini header */}
      <div style={{ background: '#0f2340', padding: '0 16px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '14px', fontWeight: '900', color: 'white', letterSpacing: '-0.5px' }}>
          CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
        </span>
        <a href="/dashboard/trips" style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'none' }}>← Dashboard</a>
      </div>
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}>
        <WrapTripContent />
      </Suspense>
    </div>
  )
}
