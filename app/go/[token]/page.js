'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }
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
  const [gpsTracking, setGpsTracking] = useState(true)   // toggle GPS tracking ON/OFF

  useEffect(() => {
    if (!token) return

    function fetchData() {
      fetch(`/api/go/session?token=${token}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) setError(d.error)
          else setData(d)
        })
        .catch(() => setError('Connection error'))
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
      setPingBanner('sent')
    } catch {
      setPingBanner('error')
    }
    setTimeout(() => setPingBanner(false), 3000)
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
        await new Promise(resolve => setTimeout(resolve, 500))
        const updated = await fetch(`/api/go/session?token=${token}`).then(r => r.json())
        if (!updated.error) setData(updated)
      }
    } catch {
      alert('Connection error')
    } finally {
      setStarting(false)
    }
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

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0f2340', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Captain Go</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: 'white' }}>👤 {driver.name}</div>
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
      <div style={{ padding: '12px 20px', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
          📅 {fmtDate(today)}
        </div>
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

      {/* Trips del giorno */}
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
          {trips.map((trip, idx) => {
            const pickup  = locsMap[trip.pickup_id]
            const dropoff = locsMap[trip.dropoff_id]
            const cls     = CLS_COLOR[trip.transfer_class] || CLS_COLOR.STANDARD
            const isDone  = trip.status === 'DONE' || trip.status === 'COMPLETED'
            const isBusy  = trip.status === 'IN_PROGRESS' || trip.status === 'ACTIVE'

            return (
              <div key={trip.id || idx} style={{
                background: 'white',
                borderRadius: '14px',
                border: `1px solid ${isBusy ? '#fde68a' : isDone ? '#bbf7d0' : '#e2e8f0'}`,
                borderLeft: `5px solid ${isBusy ? '#f59e0b' : isDone ? '#22c55e' : cls.dot}`,
                padding: '14px 16px',
                opacity: isDone ? 0.6 : 1,
              }}>

                {/* Riga 1: orario + badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}>
                      {minToHHMM(trip.pickup_min ?? trip.call_min)}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '999px', background: '#f1f5f9', color: '#475569' }}>
                      {cls.label}
                    </span>
                    {trip.service_type && (
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{trip.service_type}</span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>
                    #{trip.trip_id}
                  </span>
                </div>

                {/* Rotta */}
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '6px', lineHeight: 1.4 }}>
                  {pickup?.name || trip.pickup_id || '–'} → {dropoff?.name || trip.dropoff_id || '–'}
                </div>

                {/* Passeggeri */}
                {(trip.passenger_list || trip.pax_count > 0) && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                    👥 {trip.passenger_list || `${trip.pax_count} pax`}
                  </div>
                )}

                {/* Bottone Naviga */}
                {!isDone && dropoff && (
                  <button
                    onClick={() => openMaps(trip)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '10px',
                      border: 'none', background: isBusy ? '#f59e0b' : '#0f2340',
                      color: 'white', fontSize: '14px', fontWeight: '800',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                    }}>
                    🗺 Navigate to {dropoff.name}
                  </button>
                )}
                {isDone && (
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', textAlign: 'center' }}>
                    ✅ Completed
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 20px 100px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>CaptainDispatch · Captain Go</div>
      </div>

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
        </div>
      )}
    </div>
  )
}
