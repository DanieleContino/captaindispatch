'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }

const SERVICE_TYPES = ['Wrap', 'Hotel Run', 'Airport', 'Unit Move', 'Charter', 'Shuttle', 'Other']

function nowHHMM() {
  const d = new Date()
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
}
function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

// ─── QR Scanner per Captain Go ────────────────────────────────
function GoQrScanner({ onScan, onClose }) {
  const READER_ID = 'go-qr-reader'
  const qrRef = useRef(null)
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0f2340', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'white', fontWeight: '800', fontSize: '15px' }}>📷 Scan QR</span>
        <button onClick={onClose} style={{ color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div id={READER_ID} style={{ width: '100%', maxWidth: '320px', borderRadius: '16px', overflow: 'hidden', background: '#111' }} />
        {scanErr && <div style={{ marginTop: '16px', color: '#f87171', fontSize: '13px', textAlign: 'center' }}>❌ {scanErr}</div>}
        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '16px', textAlign: 'center' }}>Point camera at a QR code</p>
      </div>
    </div>
  )
}

// ─── Wizard New Trip ──────────────────────────────────────────
function NewTripWizard({ token, vehicle, productionId, onClose, onCreated }) {
  const [step,        setStep]        = useState(1)
  const [date,        setDate]        = useState(isoToday())
  const [callTime,    setCallTime]    = useState(nowHHMM())
  const [serviceType, setServiceType] = useState('Wrap')
  const [pickupId,    setPickupId]    = useState('')
  const [dropoffId,   setDropoffId]   = useState('')
  const [locations,   setLocations]   = useState([])
  const [crew,        setCrew]        = useState([])
  const [selCrew,     setSelCrew]     = useState([])
  const [search,      setSearch]      = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanMode,    setScanMode]    = useState('crew')
  const [showPicker,  setShowPicker]  = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')
  const [toast,       setToast]       = useState('')

  const locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Carica locations e crew
  useEffect(() => {
    if (!token) return
    Promise.all([
      fetch(`/api/go/data?token=${token}&type=locations`).then(r => r.json()),
      fetch(`/api/go/data?token=${token}&type=crew`).then(r => r.json()),
    ]).then(([lRes, cRes]) => {
      setLocations(lRes.data || [])
      setCrew(cRes.data || [])
    }).catch(() => {})
  }, [token])

  // QR scan handler
  async function handleScan(rawText) {
    setShowScanner(false)
    let text = rawText.trim()
    try {
      const url = new URL(text)
      const qrParam = url.searchParams.get('qr')
      if (qrParam) text = qrParam
    } catch {}

    try {
      const res  = await fetch(`/api/qr/resolve?qr=${encodeURIComponent(text)}`)
      const data = await res.json()
      if (data.error) { showToast('❌ QR not found'); return }
      if (data.type === 'crew') {
        if (selCrew.find(c => c.id === data.id)) { showToast('⚠️ Already added'); return }
        setSelCrew(p => [...p, { id: data.id, full_name: data.full_name, department: data.department, hotel_id: data.hotel?.id || null }])
        showToast('✅ ' + data.full_name + ' added')
      }
    } catch { showToast('❌ Scan error') }
  }

  async function handleConfirm() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/go/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, date, callTime, serviceType,
          pickupId, dropoffId: dropoffId || null,
          passengerIds: selCrew.map(c => c.id),
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const inp = { width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '15px', color: '#0f172a', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: '11px', fontWeight: '800', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 150, display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ background: '#0f2340', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ color: 'white', fontWeight: '900', fontSize: '16px' }}>➕ New Trip</span>
        <button onClick={onClose} style={{ color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '36px', height: '36px', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* Step bar */}
      <div style={{ display: 'flex', gap: '4px', padding: '10px 16px', background: '#0f2340', flexShrink: 0 }}>
        {[1,2,3].map(n => (
          <div key={n} style={{ flex: 1, height: '3px', borderRadius: '2px', background: n < step ? '#22c55e' : n === step ? '#60a5fa' : 'rgba(255,255,255,0.2)' }} />
        ))}
      </div>

      {/* QR Scanner */}
      {showScanner && <GoQrScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: '#0f2340', color: 'white', padding: '10px 20px', borderRadius: '24px', fontSize: '13px', zIndex: 300, fontWeight: '600', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      <div style={{ flex: 1, padding: '20px 16px 100px' }}>

        {/* ── STEP 1: Dettagli ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '32px', marginBottom: '6px' }}>📦</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Trip Details</div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {SERVICE_TYPES.map(s => (
                  <button key={s} onClick={() => setServiceType(s)} style={{
                    padding: '8px 14px', borderRadius: '999px', border: `2px solid ${serviceType === s ? '#2563eb' : '#e2e8f0'}`,
                    background: serviceType === s ? '#eff6ff' : 'white', color: serviceType === s ? '#1d4ed8' : '#374151',
                    fontWeight: serviceType === s ? '800' : '500', fontSize: '13px', cursor: 'pointer',
                  }}>{s}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={lbl}>Pickup Location</label>
              <button onClick={() => setShowPicker('pickup')} style={{
                width: '100%', padding: '12px 14px', border: `1px solid ${pickupId ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: '10px', fontSize: '15px', color: pickupId ? '#0f172a' : '#94a3b8',
                background: pickupId ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: pickupId ? '700' : '400',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{locsMap[pickupId] || 'Select pickup...'}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
              </button>
            </div>

            <div>
              <label style={lbl}>Dropoff (optional)</label>
              <button onClick={() => setShowPicker('dropoff')} style={{
                width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0',
                borderRadius: '10px', fontSize: '15px', color: dropoffId ? '#0f172a' : '#94a3b8',
                background: 'white', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: dropoffId ? '700' : '400',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{locsMap[dropoffId] || '— Auto —'}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
              </button>
            </div>

            {/* Picker modal locations */}
            {showPicker && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                    <div style={{ width: '36px', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 10px' }}>
                    <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>
                      {showPicker === 'pickup' ? 'Pickup Location' : 'Dropoff Location'}
                    </span>
                    <button onClick={() => setShowPicker(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>✕</button>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {showPicker === 'dropoff' && (
                      <div onClick={() => { setDropoffId(''); setShowPicker(null) }}
                        style={{ padding: '14px 16px', borderBottom: '1px solid #f8fafc', background: !dropoffId ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '15px', color: '#94a3b8' }}>— Auto —</span>
                        {!dropoffId && <span style={{ color: '#2563eb' }}>✓</span>}
                      </div>
                    )}
                    {locations.map(l => {
                      const isSel = showPicker === 'pickup' ? pickupId === l.id : dropoffId === l.id
                      return (
                        <div key={l.id} onClick={() => {
                          if (showPicker === 'pickup') setPickupId(l.id)
                          else setDropoffId(l.id)
                          setShowPicker(null)
                        }} style={{ padding: '14px 16px', borderBottom: '1px solid #f8fafc', background: isSel ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', fontWeight: isSel ? '700' : '500', color: '#0f172a' }}>{l.name}</span>
                          {isSel && <span style={{ color: '#2563eb', fontSize: '18px' }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ height: '20px' }} />
                </div>
              </div>
            )}

            <button onClick={() => setStep(2)} disabled={!date || !callTime || !pickupId}
              style={{ width: '100%', padding: '15px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: '800', cursor: !date || !callTime || !pickupId ? 'default' : 'pointer', background: !date || !callTime || !pickupId ? '#e2e8f0' : '#2563eb', color: !date || !callTime || !pickupId ? '#94a3b8' : 'white' }}>
              Next — Passengers →
            </button>
          </div>
        )}

        {/* ── STEP 2: Passeggeri ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '32px', marginBottom: '6px' }}>👥</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Passengers</div>
            </div>

            <button onClick={() => { setScanMode('crew'); setShowScanner(true) }}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: '#0f2340', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              📷 Scan Crew Badge
            </button>

            {selCrew.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>👥 {selCrew.length} selected</span>
                  <button onClick={() => setSelCrew([])} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Remove all</button>
                </div>
                {selCrew.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px', flexShrink: 0 }}>
                      {c.full_name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                    </div>
                    <button onClick={() => setSelCrew(p => p.filter(x => x.id !== c.id))} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <input type="text" placeholder="🔍 Search crew..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, fontSize: '14px' }} />

            {search && (
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
                {(() => {
                  const q = search.toLowerCase()
                  const filtered = crew.filter(c => !selCrew.find(x => x.id === c.id) && (c.full_name.toLowerCase().includes(q) || (c.department || '').toLowerCase().includes(q)))
                  if (!filtered.length) return <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No results</div>
                  return filtered.map(c => (
                    <div key={c.id} onClick={() => { setSelCrew(p => [...p, c]); setSearch('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                      </div>
                      <span style={{ color: '#16a34a', fontSize: '22px' }}>+</span>
                    </div>
                  ))
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => { setSearch(''); setStep(3) }} style={{ flex: 2, padding: '14px', borderRadius: '10px', border: 'none', background: '#2563eb', color: 'white', fontSize: '15px', fontWeight: '800', cursor: 'pointer' }}>
                Review ({selCrew.length}) →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Conferma ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '32px', marginBottom: '6px' }}>📋</div>
              <div style={{ fontWeight: '900', fontSize: '20px', color: '#0f172a' }}>Confirm Trip</div>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
              {[
                ['Date', date],
                ['Time', callTime],
                ['Service', serviceType],
                ['Pickup', locsMap[pickupId] || pickupId],
                dropoffId ? ['Dropoff', locsMap[dropoffId] || dropoffId] : null,
                vehicle ? ['Vehicle', vehicle.sign_code || vehicle.id] : null,
                ['Passengers', `${selCrew.length} pax`],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>{label}</span>
                  <span style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            {selCrew.length > 0 && (
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#374151', lineHeight: 1.6 }}>
                👥 {selCrew.map(c => c.full_name).join(', ')}
              </div>
            )}

            {err && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>
            )}

            <button onClick={handleConfirm} disabled={saving}
              style={{ width: '100%', padding: '15px', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '16px', fontWeight: '900', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '⏳ Creating...' : '✅ Create Trip'}
            </button>
            <button onClick={() => setStep(2)} disabled={saving}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              ← Edit Passengers
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
const CLS_COLOR = {
  ARRIVAL:   { dot: '#16a34a', label: 'ARR' },
  DEPARTURE: { dot: '#ea580c', label: 'DEP' },
  STANDARD:  { dot: '#2563eb', label: 'STD' },
}

export default function CaptainGoPage() {
  const { token } = useParams()
  const [data,     setData]    = useState(null)
  const [error,    setError]   = useState(null)
  const [loading,  setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [gpsStatus,   setGpsStatus]   = useState('idle') // idle | sending | sent | error
  const [watchId,     setWatchId]     = useState(null)
  const [pingBanner,  setPingBanner]  = useState(false)  // mostra banner ping request
  const [gpsTracking,   setGpsTracking]   = useState(true)
  const [reconnecting,  setReconnecting]  = useState(false)
  const [showWizard,    setShowWizard]    = useState(false)
  const [wizardDone,    setWizardDone]    = useState(null) // trip_id creato
  const [ending,         setEnding]         = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [tripAction,     setTripAction]     = useState(null) // trip.id in corso di update
  const [mapTrip,        setMapTrip]        = useState(null) // trip in visualizzazione mappa
  const [trafficData,    setTrafficData]    = useState({})   // { [trip.id]: { delayMin, severity, loading } }
  const wakeLockRef = useRef(null)
  const [unreadCount,    setUnreadCount]    = useState(() => {
    try { return parseInt(localStorage.getItem(`unread_${token}`) || '0', 10) } catch { return 0 }
  })

  useEffect(() => {
    if (!token) return

    function fetchData() {
      fetch(`/api/go/session?token=${token}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) {
            // Errori reali (token invalido, driver non attivo) → pagina errore
            setError(d.error)
          } else {
            setData(d)
            setReconnecting(false)
            setError(null)
          }
        })
        .catch(() => {
          // Errore di rete (standby, offline) → banner reconnecting, non pagina errore
          setReconnecting(true)
        })
        .finally(() => setLoading(false))
    }

    fetchData()
    const interval = setInterval(fetchData, 15_000)

    // Poll messaggi ogni 15s
    async function checkMessages() {
      try {
        const res = await fetch(`/api/go/messages?token=${token}`)
        const d = await res.json()
        if (d.messages && d.messages.length > 0) {
          setUnreadCount(prev => {
            const next = prev + d.messages.length
            try { localStorage.setItem(`unread_${token}`, String(next)) } catch {}
            return next
          })
          for (const msg of d.messages) {
            if (msg.message_type === 'PING_REQUEST') {
              const pingStart = Date.now()
              setPingBanner(true)
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  pos => {
                    sendPositionSilent(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
                    const elapsed = Date.now() - pingStart
                    const remaining = Math.max(0, 3000 - elapsed)
                    setTimeout(() => setPingBanner('sent'), remaining)
                    setTimeout(() => setPingBanner(false), remaining + 3000)
                  },
                  () => {
                    setPingBanner('error')
                    setTimeout(() => setPingBanner(false), 3000)
                  },
                  { enableHighAccuracy: true, timeout: 10000 }
                )
              }
              setTimeout(() => setPingBanner(false), 15000)
            }
          }
        }
      } catch {}
    }

    const msgInterval = setInterval(checkMessages, 15_000)
    return () => { clearInterval(interval); clearInterval(msgInterval) }
  }, [token])

  // ── Wake Lock: schermo acceso quando c'è un trip BUSY ────
  useEffect(() => {
    const hasBusyTrip = data?.trips?.some(t => t.status === 'BUSY' || t.status === 'IN_PROGRESS' || t.status === 'ACTIVE')

    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return
      try {
        if (wakeLockRef.current) return // già attivo
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null
        })
      } catch {}
    }

    async function releaseWakeLock() {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release() } catch {}
        wakeLockRef.current = null
      }
    }

    if (hasBusyTrip) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    // Riacquista wake lock quando la pagina torna in foreground
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && hasBusyTrip) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [data?.trips])

  // ── watchPosition: parte quando ON DUTY ──────────────────
  useEffect(() => {
    if (!data?.session) {
      // Sessione non attiva: ferma watch se era partito
      if (watchId !== null) {
        navigator.geolocation?.clearWatch(watchId)
        setWatchId(null)
      }
      return
    }
    // Sessione attiva, tracking ON e watch non ancora avviato
    if (watchId === null && navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        pos => sendPositionSilent(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => {},
        { enableHighAccuracy: true, distanceFilter: 50 }
      )
      setWatchId(id)
    }
    // Tracking disattivato: ferma watch
    if (!gpsTracking && watchId !== null) {
      navigator.geolocation?.clearWatch(watchId)
      setWatchId(null)
    }
    return () => {
      if (watchId !== null) navigator.geolocation?.clearWatch(watchId)
    }
  }, [data?.session, gpsTracking])

  // ── GPS: invia posizione silenziosa (ping response — non tocca gpsStatus) ──
  async function sendPositionSilent(lat, lng, accuracy) {
    if (!token) return
    try {
      const sessionId = data?.session?.id || null
      await fetch('/api/go/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, lat, lng, accuracy: accuracy ?? null, speed: null, session_id: sessionId }),
      })
    } catch {}
  }

  // ── GPS: invia posizione all'API ──────────────────────────
  async function sendPosition(lat, lng, accuracy, speed) {
    if (!token) return
    try {
      setGpsStatus('sending')
      const sessionId = data?.session?.id || null
      const res = await fetch('/api/go/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, lat, lng, accuracy: accuracy ?? null, speed: speed ?? null, session_id: sessionId }),
      })
      const d = await res.json()
      if (d.error) setGpsStatus('error')
      else setGpsStatus('sent')
    } catch {
      setGpsStatus('error')
    }
    setTimeout(() => setGpsStatus('idle'), 3000)
  }

  // ── GPS: pulsante manuale "Sono Qui" ──────────────────────
  function handleSonoQui() {
    if (!navigator.geolocation) {
      alert('GPS non disponibile su questo dispositivo')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, null),
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>🚐</div>
      <div style={{ color: 'white', fontSize: '16px', fontWeight: '700' }}>Captain Go</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Loading...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <div style={{ color: 'white', fontSize: '16px', fontWeight: '700', textAlign: 'center' }}>
        {error === 'Invalid token' ? 'Link non valido' : error === 'Driver not active' ? 'Driver non attivo' : 'Errore di connessione'}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textAlign: 'center' }}>
        {error === 'Invalid token' ? 'Contatta il tuo Transportation Coordinator' : 'Riprova tra qualche secondo'}
      </div>
    </div>
  )

  const { driver, vehicle, trips, locsMap, session, today } = data

  async function handleStartSession() {
    if (starting || session) return
    setStarting(true)
    try {
      const res = await fetch('/api/go/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (d.error) alert(d.error)
      else {
        // Aspetta 500ms poi aggiorna
        await new Promise(resolve => setTimeout(resolve, 1500))
        const updated = await fetch(`/api/go/session?token=${token}`).then(r => r.json())
        if (!updated.error) setData(updated)
      }
    } catch {
      alert('Connection error')
    } finally {
      setStarting(false)
    }
  }

  async function handleEndSession() {
    if (ending) return
    setEnding(true)
    setShowEndConfirm(false)
    try {
      const res = await fetch('/api/go/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (d.error) alert(d.error)
      else {
        await new Promise(resolve => setTimeout(resolve, 500))
        const updated = await fetch(`/api/go/session?token=${token}`).then(r => r.json())
        if (!updated.error) setData(updated)
      }
    } catch {
      alert('Connection error')
    } finally {
      setEnding(false)
    }
  }

  async function handleStartTrip(trip) {
    if (tripAction) return
    setTripAction(trip.id)
    try {
      const res = await fetch('/api/go/trip/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, trip_id: trip.id }),
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      // Re-fetch immediato
      const updated = await fetch(`/api/go/session?token=${token}`).then(r => r.json())
      if (!updated.error) setData(updated)
    } catch { alert('Connection error') }
    finally { setTripAction(null) }
  }

  async function handleArrived(trip) {
    if (tripAction) return
    setTripAction(trip.id)
    try {
      const res = await fetch('/api/go/trip/arrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, trip_id: trip.id }),
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      // Re-fetch immediato
      const updated = await fetch(`/api/go/session?token=${token}`).then(r => r.json())
      if (!updated.error) setData(updated)
    } catch { alert('Connection error') }
    finally { setTripAction(null) }
  }

  const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  function openMaps(trip) {
    const pickup  = locsMap[trip.pickup_id]
    const dropoff = locsMap[trip.dropoff_id]
    if (!dropoff) return
    const dest = dropoff.lat && dropoff.lng
      ? `${dropoff.lat},${dropoff.lng}`
      : encodeURIComponent(dropoff.address || dropoff.name)
    const origin = pickup?.lat && pickup?.lng
      ? `&origin=${pickup.lat},${pickup.lng}`
      : ''
    window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=driving`, '_blank')
  }

  function navigateAndTrack(trip) {
    openMaps(trip)
    setMapTrip(trip)
  }

  function groupTrips(trips) {
    const groups = []
    const seen = new Set()
    for (const trip of trips) {
      if (!trip.trip_group_id || trips.filter(t => t.trip_group_id === trip.trip_group_id).length === 1) {
        groups.push({ type: 'single', trip })
      } else if (!seen.has(trip.trip_group_id)) {
        seen.add(trip.trip_group_id)
        const legs = trips.filter(t => t.trip_group_id === trip.trip_group_id).sort((a, b) => (a.leg_order || 0) - (b.leg_order || 0))
        groups.push({ type: 'group', trip_group_id: trip.trip_group_id, legs })
      }
    }
    return groups
  }

  const tripGroups = groupTrips(trips)

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0f2340', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Captain Go</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
            👤 {driver.name}
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  setUnreadCount(0)
                  try { localStorage.removeItem(`unread_${token}`) } catch {}
                }}
                style={{
                  background: '#ef4444', border: 'none', borderRadius: '999px',
                  minWidth: '22px', height: '22px', padding: '0 6px',
                  color: 'white', fontSize: '11px', fontWeight: '900',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </button>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {vehicle ? (
            <div>
              <div style={{ fontSize: '24px' }}>{TYPE_ICON[vehicle.vehicle_type] || '🚐'}</div>
              <div style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '14px', color: 'white' }}>{vehicle.id}</div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No vehicle assigned</div>
          )}
        </div>
      </div>

      {/* Data */}
      <div style={{ padding: '12px 20px', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
          📅 {fmtDate(today)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {session && !showWizard && !wizardDone && (
            <button onClick={() => setShowWizard(true)}
              style={{ background: '#2563eb', border: 'none', borderRadius: '999px', padding: '6px 12px', color: 'white', fontSize: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ➕ New Trip
            </button>
          )}
          {session ? (
            <span style={{ fontSize: '11px', fontWeight: '800', padding: '3px 10px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
              🟢 ON DUTY
            </span>
          ) : (
            <span style={{ fontSize: '11px', fontWeight: '800', padding: '3px 10px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              ⚫ STANDBY
            </span>
          )}
        </div>
      </div>

      {/* Inizia Giornata */}
      {!session && vehicle && (
        <div style={{ margin: '16px 20px 0' }}>
          <button
            onClick={handleStartSession}
            disabled={starting}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px',
              border: 'none', background: starting ? '#94a3b8' : '#16a34a',
              color: 'white', fontSize: '16px', fontWeight: '900',
              cursor: starting ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: starting ? 'none' : '0 4px 16px rgba(22,163,74,0.4)',
            }}>
            {starting ? '⏳ Starting...' : '🟢 Inizia Giornata'}
          </button>
          <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '6px' }}>
            Tap to go on duty — your coordinator will see you online
          </div>
        </div>
      )}

      {/* Vehicle info */}
      {vehicle && (
        <div style={{ margin: '16px 20px 0', padding: '12px 16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>{TYPE_ICON[vehicle.vehicle_type] || '🚐'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>{vehicle.id}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {[vehicle.license_plate, vehicle.sign_code, vehicle.capacity ? `${vehicle.capacity} pax` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          {vehicle.license_plate && (
            <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '13px', color: '#374151', background: '#fafaf9', padding: '4px 10px', borderRadius: '6px', border: '1px solid #d4d4d4', letterSpacing: '0.08em' }}>
              {vehicle.license_plate}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          {trips.length > 0 ? `${trips.length} Trip${trips.length !== 1 ? 's' : ''} Today` : 'No Trips Today'}
        </div>

        {trips.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>☀️</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>No trips scheduled for today</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Check back later or contact your coordinator</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tripGroups.map((group, gIdx) => {

            // ── SINGLE TRIP CARD (invariata) ──────────────────────────
            if (group.type === 'single') {
              const trip    = group.trip
              const pickup  = locsMap[trip.pickup_id]
              const dropoff = locsMap[trip.dropoff_id]
              const cls     = CLS_COLOR[trip.transfer_class] || CLS_COLOR.STANDARD
              const isDone  = trip.status === 'DONE' || trip.status === 'COMPLETED'
              const isBusy  = trip.status === 'BUSY' || trip.status === 'IN_PROGRESS' || trip.status === 'ACTIVE'

              return (
                <div key={trip.id || gIdx} style={{ background: 'white', borderRadius: '14px', border: `1px solid ${isBusy ? '#fde68a' : isDone ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: `5px solid ${isBusy ? '#f59e0b' : isDone ? '#22c55e' : cls.dot}`, padding: '14px 16px', opacity: isDone ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}>{minToHHMM(trip.pickup_min ?? trip.call_min)}</span>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '999px', background: '#f1f5f9', color: '#475569' }}>{cls.label}</span>
                      {trip.service_type && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{trip.service_type}</span>}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>#{trip.trip_id}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '6px', lineHeight: 1.4 }}>
                    {pickup?.name || trip.pickup_id || '–'} → {dropoff?.name || trip.dropoff_id || '–'}
                  </div>
                  {(trip.passenger_list || trip.pax_count > 0) && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>👥 {trip.passenger_list || `${trip.pax_count} pax`}</div>
                  )}
                  {!isDone && !isBusy && session && (
                    <button onClick={() => handleStartTrip(trip)} disabled={tripAction === trip.id} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: tripAction === trip.id ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: tripAction === trip.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: dropoff ? '8px' : '0' }}>
                      {tripAction === trip.id ? '⏳...' : '▶ Start Trip'}
                    </button>
                  )}
                  {isBusy && (
                    <button onClick={() => handleArrived(trip)} disabled={tripAction === trip.id} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: tripAction === trip.id ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '14px', fontWeight: '800', cursor: tripAction === trip.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: dropoff ? '8px' : '0' }}>
                      {tripAction === trip.id ? '⏳...' : '✅ Arrived'}
                    </button>
                  )}
                  {!isDone && dropoff && (
                    <button onClick={() => isBusy ? navigateAndTrack(trip) : openMaps(trip)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: isBusy ? '#0f2340' : '#475569', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {isBusy ? '🗺 Naviga' : '🗺 Navigate to ' + dropoff?.name}
                    </button>
                  )}
                  {!isDone && dropoff && (() => {
                    const td = trafficData[trip.id]
                    const badgeColor = td?.severity === 'CRITICAL' ? '#dc2626' : td?.severity === 'WARNING' ? '#d97706' : td?.severity === 'INFO' ? '#2563eb' : td?.severity === 'OK' ? '#15803d' : '#64748b'
                    const badgeBg = td?.severity === 'CRITICAL' ? '#fef2f2' : td?.severity === 'WARNING' ? '#fffbeb' : td?.severity === 'INFO' ? '#eff6ff' : td?.severity === 'OK' ? '#f0fdf4' : '#f8fafc'
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <button onClick={async () => { setTrafficData(p => ({ ...p, [trip.id]: { ...p[trip.id], loading: true } })); try { const res = await fetch('/api/go/traffic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, trip_id: trip.id }) }); const d = await res.json(); setTrafficData(p => ({ ...p, [trip.id]: { ...d, loading: false } })) } catch { setTrafficData(p => ({ ...p, [trip.id]: { loading: false, error: true } })) } }} disabled={td?.loading} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: td?.loading ? '#f1f5f9' : badgeBg, color: td?.loading ? '#94a3b8' : badgeColor, fontSize: '12px', fontWeight: '800', cursor: td?.loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${td?.loading ? '#e2e8f0' : badgeColor}22` }}>
                          {td?.loading ? '⏳ Checking...' : td?.severity === 'OK' ? '🟢 No delays' : td?.severity === 'INFO' ? `🔵 +${td.delayMin}min` : td?.severity === 'WARNING' ? `🟡 +${td.delayMin}min` : td?.severity === 'CRITICAL' ? `🔴 +${td.delayMin}min` : '🚦 Check Traffic'}
                        </button>
                        {td?.incidents?.length > 0 && <span style={{ fontSize: '10px', color: badgeColor, fontWeight: '700' }}>{td.incidents[0]}</span>}
                      </div>
                    )
                  })()}
                  {isDone && <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', textAlign: 'center' }}>✅ Completed</div>}
                </div>
              )
            }

            // ── GROUP CARD (Multi-Pick / Multi-Drop / Mix) ────────────
            const { legs } = group
            const doneLegCount = legs.filter(l => l.status === 'DONE' || l.status === 'COMPLETED').length
            const activeLeg    = legs.find(l => l.status === 'BUSY' || l.status === 'IN_PROGRESS' || l.status === 'ACTIVE')
              || legs.find(l => l.status === 'PLANNED')
            const allDone      = doneLegCount === legs.length
            const firstLeg     = legs[0]
            const serviceLabel = firstLeg.service_type || 'Multi-leg'

            // Determina se Mix ha sezioni pickup/dropoff separate
            const isMix = serviceLabel === 'Mix'
            const pickupLegs  = isMix ? legs.filter((_, i) => i < Math.ceil(legs.length / 2)) : legs
            const dropoffLegs = isMix ? legs.filter((_, i) => i >= Math.ceil(legs.length / 2)) : []

            // Prossima destinazione
            const nextDest = activeLeg ? (locsMap[activeLeg.dropoff_id]?.name || activeLeg.dropoff_id) : null

            function renderLeg(leg, absoluteIndex) {
              const isDoneLeg   = leg.status === 'DONE' || leg.status === 'COMPLETED'
              const isBusyLeg   = leg.status === 'BUSY' || leg.status === 'IN_PROGRESS' || leg.status === 'ACTIVE'
              const isActiveLeg = isBusyLeg && activeLeg?.id === leg.id
              const pickup  = locsMap[leg.pickup_id]
              const dropoff = locsMap[leg.dropoff_id]

              // Label rotta: Multi-Pick → solo pickup, Multi-Drop → solo dropoff, altri → pickup → dropoff
              const routeLabel = serviceLabel === 'Multi-Pick'
                ? `📍 ${pickup?.name || leg.pickup_id || '–'}`
                : serviceLabel === 'Multi-Drop'
                ? `📍 ${dropoff?.name || leg.dropoff_id || '–'}`
                : `${pickup?.name || leg.pickup_id || '–'} → ${dropoff?.name || leg.dropoff_id || '–'}`

              // Badge progressivo: Done / In corso / First / Next / Dopo
              const pendingLegs   = legs.filter(l => l.status !== 'DONE' && l.status !== 'COMPLETED')
              const firstPending  = pendingLegs[0]
              const secondPending = pendingLegs[1]
              let badgeLabel, badgeBg, badgeColor
              if (isDoneLeg) {
                badgeLabel = 'Done';  badgeBg = '#f0fdf4'; badgeColor = '#15803d'
              } else if (isActiveLeg) {
                badgeLabel = 'In corso'; badgeBg = '#fffbeb'; badgeColor = '#b45309'
              } else if (firstPending?.id === leg.id) {
                badgeLabel = 'First'; badgeBg = '#fef9c3'; badgeColor = '#92400e'
              } else if (secondPending?.id === leg.id) {
                badgeLabel = 'Next';  badgeBg = '#eff6ff'; badgeColor = '#1d4ed8'
              } else {
                badgeLabel = 'Dopo';  badgeBg = '#f1f5f9'; badgeColor = '#64748b'
              }

              return (
                <div key={leg.id} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2px', width: '22px', flexShrink: 0 }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isDoneLeg ? '#dcfce7' : isActiveLeg ? '#f59e0b' : '#eff6ff', color: isDoneLeg ? '#15803d' : isActiveLeg ? 'white' : '#1d4ed8', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isDoneLeg ? '✓' : absoluteIndex + 1}
                    </div>
                    {absoluteIndex < legs.length - 1 && <div style={{ width: '1px', flex: 1, background: '#e2e8f0', margin: '3px 0', minHeight: '10px' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', lineHeight: 1.4, marginBottom: '2px' }}>
                      {routeLabel}
                    </div>
                    {leg.passenger_list && <div style={{ fontSize: '11px', color: '#64748b' }}>{leg.passenger_list}</div>}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', alignSelf: 'flex-start', marginTop: '2px', flexShrink: 0, background: badgeBg, color: badgeColor }}>
                    {badgeLabel}
                  </div>
                </div>
              )
            }

            return (
              <div key={group.trip_group_id} style={{ background: 'white', borderRadius: '14px', border: `1px solid ${activeLeg && (activeLeg.status === 'BUSY' || activeLeg.status === 'IN_PROGRESS') ? '#fde68a' : allDone ? '#bbf7d0' : '#e2e8f0'}`, overflow: 'hidden' }}>

                {/* Header gruppo */}
                <div style={{ background: '#0f2340', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ color: 'white', fontSize: '13px', fontWeight: '700' }}>
                    {serviceLabel} · {minToHHMM(firstLeg.pickup_min ?? firstLeg.call_min)}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>#{firstLeg.trip_id}</div>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '6px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{doneLegCount} / {legs.length} fermate</span>
                  <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#22c55e', borderRadius: '2px', width: `${legs.length > 0 ? (doneLegCount / legs.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
                  </div>
                  {nextDest && !allDone && (
                    <span style={{ fontSize: '10px', fontWeight: '600', color: activeLeg && (activeLeg.status === 'BUSY' || activeLeg.status === 'IN_PROGRESS') ? '#b45309' : '#64748b', flexShrink: 0 }}>→ {nextDest}</span>
                  )}
                </div>

                {/* Legs */}
                <div style={{ padding: '8px 14px' }}>
                  {isMix && pickupLegs.length > 0 && (
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0 2px' }}>📥 Pickup</div>
                  )}
                  {(isMix ? pickupLegs : legs).map((leg, i) => renderLeg(leg, i))}
                  {isMix && dropoffLegs.length > 0 && (
                    <>
                      <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0 2px' }}>📤 Dropoff</div>
                      {dropoffLegs.map((leg, i) => renderLeg(leg, pickupLegs.length + i))}
                    </>
                  )}
                </div>

                {/* Azioni */}
                {!allDone && activeLeg && session && (() => {
                  const isLegBusy    = activeLeg.status === 'BUSY' || activeLeg.status === 'IN_PROGRESS' || activeLeg.status === 'ACTIVE'
                  const isPickupLeg  = serviceLabel === 'Multi-Pick' || (serviceLabel === 'Mix' && (activeLeg.leg_order <= Math.ceil(legs.length / 2)))
                  const confirmLabel = isPickupLeg
                    ? `🙋 Picked Up — ${locsMap[activeLeg.pickup_id]?.name || ''}`
                    : `✅ Arrived — ${locsMap[activeLeg.dropoff_id]?.name || ''}`
                  const navigateLoc  = isPickupLeg ? locsMap[activeLeg.pickup_id] : locsMap[activeLeg.dropoff_id]
                  const navigateName = navigateLoc?.name || ''

                  return (
                    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {isLegBusy ? (
                        <button onClick={() => handleArrived(activeLeg)} disabled={tripAction === activeLeg.id} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: tripAction === activeLeg.id ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '14px', fontWeight: '800', cursor: tripAction === activeLeg.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          {tripAction === activeLeg.id ? '⏳...' : confirmLabel}
                        </button>
                      ) : (
                        <button onClick={() => handleStartTrip(activeLeg)} disabled={tripAction === activeLeg.id} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: tripAction === activeLeg.id ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: tripAction === activeLeg.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          {tripAction === activeLeg.id ? '⏳...' : '▶ Start Trip'}
                        </button>
                      )}
                      {navigateLoc && (
                        <button onClick={() => isLegBusy ? navigateAndTrack(activeLeg) : openMaps(activeLeg)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: '#0f2340', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          🗺 Navigate → {navigateName}
                        </button>
                      )}
                    </div>
                  )
                })()}
                {allDone && (
                  <div style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: '#15803d', textAlign: 'center' }}>✅ All stops completed</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Overlay IN CORSA — banner sticky con Arrived */}
      {mapTrip && (() => {
        const mpPickup  = locsMap[mapTrip.pickup_id]
        const mpDropoff = locsMap[mapTrip.dropoff_id]
        return (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
            background: '#0f2340',
            borderTop: '2px solid #f59e0b',
            borderRadius: '20px 20px 0 0',
            padding: '16px 20px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>🟡 IN CORSA</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'white' }}>
                  {mpPickup?.name || '–'} → {mpDropoff?.name || '–'}
                </div>
              </div>
              <button onClick={() => setMapTrip(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', fontSize: '18px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <button
              onClick={() => { setMapTrip(null); handleArrived(mapTrip) }}
              disabled={tripAction === mapTrip.id}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: tripAction === mapTrip.id ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '16px', fontWeight: '900', cursor: tripAction === mapTrip.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {tripAction === mapTrip.id ? '⏳...' : '✅ Sono Arrivato'}
            </button>
          </div>
        )
      })()}

      {/* Footer */}
      <div style={{ padding: '24px 20px 100px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>CaptainDispatch · Captain Go</div>
      </div>

      {/* Banner reconnecting */}
      {reconnecting && (
        <div style={{
          position: 'fixed', top: '16px', left: '16px', right: '16px',
          background: '#92400e', borderRadius: '12px',
          padding: '12px 16px', zIndex: 102,
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: '20px' }}>📶</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: 'white' }}>Reconnecting...</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>Waiting for connection</div>
          </div>
        </div>
      )}

      {/* Wizard New Trip */}
      {showWizard && (
        <NewTripWizard
          token={token}
          vehicle={vehicle}
          productionId={data?.driver ? undefined : undefined}
          onClose={() => setShowWizard(false)}
          onCreated={(tripId) => { setShowWizard(false); setWizardDone(tripId) }}
        />
      )}

      {/* Screen trip creato */}
      {wizardDone && (
        <div style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          <div style={{ width: '80px', height: '80px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', marginBottom: '20px' }}>✓</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>Trip Created!</div>
          <div style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '18px', color: '#2563eb', marginBottom: '24px' }}>{wizardDone}</div>
          <button onClick={() => setWizardDone(null)}
            style={{ width: '100%', maxWidth: '320px', padding: '15px', borderRadius: '10px', border: 'none', background: '#0f2340', color: 'white', fontSize: '15px', fontWeight: '800', cursor: 'pointer' }}>
            ← Back to Captain Go
          </button>
        </div>
      )}

      {/* Banner ping request */}
      {pingBanner && (
        <div style={{
          position: 'fixed', top: '16px', left: '16px', right: '16px',
          background: pingBanner === 'sent' ? '#16a34a' : pingBanner === 'error' ? '#dc2626' : '#1d4ed8',
          borderRadius: '12px',
          padding: '12px 16px', zIndex: 101,
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'background 0.3s',
        }}>
          <span style={{ fontSize: '20px' }}>📡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: 'white' }}>
              {pingBanner === 'sent' ? '✅ Position sent' : pingBanner === 'error' ? '❌ GPS error' : '📡 Position requested'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>
              {pingBanner === 'sent' ? 'Your coordinator can see you' : pingBanner === 'error' ? 'Could not get GPS position' : 'Getting your location...'}
            </div>
          </div>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%',
            background: pingBanner === 'sent' ? '#22c55e' : pingBanner === 'error' ? '#ef4444' : '#fbbf24',
            boxShadow: `0 0 8px ${pingBanner === 'sent' ? '#22c55e' : pingBanner === 'error' ? '#ef4444' : '#fbbf24'}`,
          }} />
        </div>
      )}

      {/* Bottom bar GPS — visibile solo ON DUTY */}
      {session && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#0f2340',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '12px',
          zIndex: 100,
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={handleSonoQui}
            disabled={gpsStatus === 'sending'}
            style={{
              flex: 1, padding: '13px', borderRadius: '12px',
              border: 'none',
              background: gpsStatus === 'sent'    ? '#16a34a'
                        : gpsStatus === 'error'   ? '#dc2626'
                        : gpsStatus === 'sending' ? '#475569'
                        : '#2563eb',
              color: 'white', fontSize: '15px', fontWeight: '800',
              cursor: gpsStatus === 'sending' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'background 0.2s',
            }}>
            {gpsStatus === 'sending' ? '⏳ Invio...'
           : gpsStatus === 'sent'    ? '✅ Inviato'
           : gpsStatus === 'error'   ? '❌ Errore GPS'
           : '📍 Sono Qui'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0, padding: '4px 6px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: watchId !== null ? '#22c55e' : '#475569',
              boxShadow: watchId !== null ? '0 0 6px #22c55e' : 'none',
            }} />
            <div style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: watchId !== null ? '#22c55e' : 'rgba(255,255,255,0.3)' }}>
              {watchId !== null ? 'LIVE' : 'GPS'}
            </div>
          </div>
          <button
            onClick={() => setShowEndConfirm(true)}
            disabled={ending}
            style={{
              flexShrink: 0, padding: '10px 12px', borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.15)',
              color: '#fca5a5', fontSize: '11px', fontWeight: '800',
              cursor: ending ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            }}>
            <span style={{ fontSize: '16px' }}>🔴</span>
            <span>End</span>
          </button>
        </div>
      )}

      {/* Modal conferma fine giornata */}
      {showEndConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔴</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>End Your Day?</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
              Your coordinator will see you offline. GPS tracking will stop.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowEndConfirm(false)}
                style={{ flex: 1, padding: '13px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleEndSession}
                style={{ flex: 1, padding: '13px', borderRadius: '10px', border: 'none', background: '#dc2626', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>
                {ending ? '⏳...' : 'End Day'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
