'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'

// ─── Utilities ───────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
}
function fmtDateLabel(iso) {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const SERVICE_TYPES = ['Wrap', 'Arrival', 'Departure', 'Multi-Drop', 'Multi-Pick', 'Mix']

const lbl = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }
const inp = { width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }

// ─── Location icon by ID prefix ──────────────────────────────
function locIcon(id) {
  if (!id) return '📍'
  if (id.startsWith('APT_')) return '✈️'
  if (id.startsWith('STN_')) return '🚉'
  if (id.startsWith('PRT_')) return '🚢'
  return '📍'
}

// ─── Deduce transfer class from pickup/dropoff IDs ───────────
function deduceClass(pickupId, dropoffId) {
  const isHub = id => id && (id.startsWith('APT_') || id.startsWith('STN_') || id.startsWith('PRT_'))
  if (isHub(pickupId) && !isHub(dropoffId)) return 'ARRIVAL'
  if (!isHub(pickupId) && isHub(dropoffId)) return 'DEPARTURE'
  return 'STANDARD'
}

// ─── Fuzzy search crew by name tokens ───────────────────────
function fuzzySearchCrew(crew, query) {
  if (!query || query.trim().length < 2) return []
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
  return crew.filter(c => {
    const name = c.full_name.toLowerCase()
    return tokens.some(t => name.includes(t))
  }).slice(0, 20)
}

// ─── Fuzzy search locations by name ─────────────────────────
function fuzzySearchLocs(locations, query) {
  if (!query || query.trim().length < 2) return []
  const q = query.toLowerCase()
  return locations.filter(l => l.name.toLowerCase().includes(q)).slice(0, 10)
}

// ─── Location Picker Modal ───────────────────────────────────
function LocationPicker({ locations, onSelect, onClose, title }) {
  const [search, setSearch] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [placesQuery, setPlacesQuery] = useState('')
  const [placesResults, setPlacesResults] = useState([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const autocompleteTimer = useRef(null)

  const filtered = search
    ? locations.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    : locations

  async function searchPlaces(q) {
    if (!q || q.length < 3) { setPlacesResults([]); return }
    setPlacesLoading(true)
    try {
      if (!window.google?.maps?.places) {
        await loadGoogleMaps()
      }
      const service = new window.google.maps.places.AutocompleteService()
      service.getPlacePredictions({ input: q, language: 'it' }, (predictions, status) => {
        if (status === 'OK' && predictions) {
          setPlacesResults(predictions.slice(0, 5))
        } else {
          setPlacesResults([])
        }
        setPlacesLoading(false)
      })
    } catch {
      setPlacesLoading(false)
    }
  }

  async function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) { resolve(); return }
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
      script.onload = resolve
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  async function resolvePlace(placeId, description) {
    setPlacesLoading(true)
    try {
      if (!window.google?.maps?.places) await loadGoogleMaps()
      const geocoder = new window.google.maps.Geocoder()
      geocoder.geocode({ placeId }, (results, status) => {
        setPlacesLoading(false)
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location
          onSelect({
            id: null,
            name: description,
            lat: loc.lat(),
            lng: loc.lng(),
            is_temp: true,
          })
        }
      })
    } catch {
      setPlacesLoading(false)
    }
  }

  async function useGPS() {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLoading(false)
        onSelect({
          id: null,
          name: `GPS Position (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          is_temp: true,
        })
      },
      () => {
        setGpsLoading(false)
        alert('GPS not available')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '440px', maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{title || '📍 Select Location'}</span>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>✕</button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 Search locations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inp, padding: '9px 12px', fontSize: '13px' }}
            autoFocus
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Custom Address option */}
          <div
            onClick={() => setShowCustom(p => !p)}
            style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: showCustom ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <span style={{ fontSize: '18px' }}>🗺</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1d4ed8' }}>Custom Address</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Search via Google Places or use GPS</div>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>{showCustom ? '▲' : '▼'}</span>
          </div>

          {showCustom && (
            <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <input
                type="text"
                placeholder="Type an address..."
                value={placesQuery}
                onChange={e => {
                  setPlacesQuery(e.target.value)
                  clearTimeout(autocompleteTimer.current)
                  autocompleteTimer.current = setTimeout(() => searchPlaces(e.target.value), 400)
                }}
                style={{ ...inp, padding: '9px 12px', fontSize: '13px', marginBottom: '8px' }}
              />
              <button
                onClick={useGPS}
                disabled={gpsLoading}
                style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid #bfdbfe', background: 'white', color: '#1d4ed8', fontSize: '12px', fontWeight: '700', cursor: 'pointer', marginBottom: placesResults.length > 0 ? '8px' : '0' }}
              >
                {gpsLoading ? '⏳ Getting position...' : '📍 Use my GPS position'}
              </button>
              {placesLoading && <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '6px' }}>Searching...</div>}
              {placesResults.map(p => (
                <div
                  key={p.place_id}
                  onClick={() => resolvePlace(p.place_id, p.description)}
                  style={{ padding: '9px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', marginBottom: '5px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', fontWeight: '500' }}
                >
                  📍 {p.description}
                </div>
              ))}
            </div>
          )}

          {/* Saved locations */}
          {filtered.map(l => (
            <div
              key={l.id}
              onClick={() => onSelect({ id: l.id, name: l.name, lat: l.lat, lng: l.lng, is_temp: false })}
              style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{locIcon(l.id)}</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{l.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AI Builder Tab ───────────────────────────────────────────
function AIBuilderTab({ vehicle, productionId, date, onDateChange, onCreated, onClose }) {
  const [crew,       setCrew]       = useState([])
  const [locations,  setLocations]  = useState([])
  const [text,       setText]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [preview,    setPreview]    = useState(null)  // { legs: [], ambiguities: [] }
  const [notify,     setNotify]     = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')

  useEffect(() => {
    if (!productionId) return
    Promise.all([
      supabase.from('crew').select('id, full_name, department, hotel_id, travel_status').eq('production_id', productionId).eq('active', true).order('full_name'),
      supabase.from('locations').select('id, name, lat, lng').eq('production_id', productionId).order('name'),
    ]).then(([cR, lR]) => {
      setCrew(cR.data || [])
      setLocations(lR.data || [])
    })
  }, [productionId])

  async function buildTrip() {
    if (!text.trim()) return
    setLoading(true); setErr(''); setPreview(null)

    // Estrai candidate crew e locations con fuzzy search
    const crewCandidates = fuzzySearchCrew(crew, text)
    const locCandidates  = fuzzySearchLocs(locations, text)

    // Se non troviamo niente, mandiamo tutto (fino a 50 crew)
    const crewContext = crewCandidates.length > 0 ? crewCandidates : crew.slice(0, 50)
    const locContext  = locCandidates.length > 0  ? locCandidates  : locations.slice(0, 30)

    const systemPrompt = `You are a transportation coordinator assistant for film productions.
Given a trip request in Italian or English, extract a structured itinerary.

Available crew:
${crewContext.map(c => `- id:${c.id} name:"${c.full_name}" dept:${c.department || '–'}`).join('\n')}

Available locations:
${locContext.map(l => `- id:${l.id} name:"${l.name}"`).join('\n')}

Today's date: ${date}
Vehicle: ${vehicle.sign_code || vehicle.id}

Respond ONLY with a JSON object (no markdown, no backticks) with this exact structure:
{
  "legs": [
    {
      "pickup_id": "location_id or null if custom",
      "pickup_name": "display name",
      "pickup_custom": true/false,
      "dropoff_id": "location_id or null if custom",
      "dropoff_name": "display name",
      "dropoff_custom": true/false,
      "time": "HH:MM or null",
      "passenger_ids": ["crew_id1", ...],
      "passenger_names": ["Name1", ...]
    }
  ],
  "ambiguities": [
    "Description of any unclear reference that needs user confirmation"
  ],
  "notes": "Optional brief explanation"
}`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.find(b => b.type === 'text')?.text || ''
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setPreview(parsed)
    } catch (e) {
      setErr('Could not parse trip. Try rephrasing or use Manual tab.')
    }
    setLoading(false)
  }

  async function createTrip() {
    if (!preview?.legs?.length) return
    setSaving(true); setErr('')

    try {
      // Per ogni leg con location custom, crea una location is_temp in Supabase
      const resolvedLegs = []
      for (const leg of preview.legs) {
        let pickupId  = leg.pickup_id
        let dropoffId = leg.dropoff_id

        if (leg.pickup_custom && !pickupId) {
          // Location custom senza ID — non possiamo salvare senza coordinate
          // Segnaliamo errore
          setErr(`"${leg.pickup_name}" needs to be confirmed via Google Places. Edit the leg before confirming.`)
          setSaving(false)
          return
        }
        if (leg.dropoff_custom && !dropoffId) {
          setErr(`"${leg.dropoff_name}" needs to be confirmed via Google Places. Edit the leg before confirming.`)
          setSaving(false)
          return
        }

        resolvedLegs.push({ ...leg, pickup_id: pickupId, dropoff_id: dropoffId })
      }

      // Costruisci payload per quick-create
      // Per semplicità usiamo il primo leg come pickup + dropoffs
      // Per Mix/multi-leg, usiamo il primo pickup e tutti i dropoff unici
      const firstPickup = resolvedLegs[0].pickup_id
      const allDropoffs = [...new Set(resolvedLegs.map(l => l.dropoff_id).filter(Boolean))]
      const allPassengerIds = [...new Set(resolvedLegs.flatMap(l => l.passenger_ids || []))]
      const callTime = resolvedLegs[0].time || '08:00'

      const res = await fetch('/api/trips/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionId,
          vehicleId:    vehicle.id,
          date,
          callTime,
          serviceType:  resolvedLegs.length > 1 ? 'Mix' : 'Other',
          pickupId:     firstPickup,
          dropoffIds:   allDropoffs,
          passengerIds: allPassengerIds,
          notifyDriver: notify,
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) {
      setErr(e.message); setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Date row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '13px', color: '#64748b' }}>📅</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', flex: 1 }}>{fmtDateLabel(date)}</span>
        <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
          style={{ border: 'none', background: 'transparent', fontSize: '12px', color: '#2563eb', cursor: 'pointer', fontWeight: '600', outline: 'none' }} />
      </div>

      {/* Textarea */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <textarea
          placeholder={'Describe the trip in Italian or English...\ne.g. "Prendi Caio all\'Hotel Roma e portalo al Set A alle 7:00"'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) buildTrip() }}
          style={{ width: '100%', minHeight: '90px', padding: '12px 14px', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', resize: 'none', background: 'white', color: '#0f172a', lineHeight: 1.5, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Italian or English · ⌘↩ to send</span>
          <button
            onClick={buildTrip}
            disabled={loading || !text.trim()}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: loading || !text.trim() ? '#e2e8f0' : '#2563eb', color: loading || !text.trim() ? '#94a3b8' : 'white', fontSize: '12px', fontWeight: '700', cursor: loading || !text.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {loading ? '⏳ Building...' : '✨ Build trip'}
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>Trip preview</span>
              <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                ✓ {[...new Set(preview.legs.flatMap(l => l.passenger_ids || []))].length} passengers
              </span>
            </div>

            {preview.legs.map((leg, i) => (
              <div key={i} style={{ padding: '12px 14px', borderBottom: i < preview.legs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '3px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                    <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '3px 0' }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #2563eb', flexShrink: 0 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {locIcon(leg.pickup_id)} {leg.pickup_name}
                      {leg.pickup_custom && <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700', marginLeft: '6px', background: '#fffbeb', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>CUSTOM</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 6px' }}>
                      → {locIcon(leg.dropoff_id)} {leg.dropoff_name}
                      {leg.dropoff_custom && <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700', marginLeft: '6px', background: '#fffbeb', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>CUSTOM</span>}
                      {leg.time && <span style={{ marginLeft: '6px', fontWeight: '700', color: '#374151' }}>· {leg.time}</span>}
                    </div>
                    {leg.passenger_names?.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {leg.passenger_names.map((n, j) => (
                          <span key={j} style={{ fontSize: '11px', padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '999px', border: '1px solid #bfdbfe' }}>{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Ambiguities */}
          {preview.ambiguities?.length > 0 && (
            <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px' }}>
              {preview.ambiguities.map((a, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#92400e', display: 'flex', gap: '6px', marginBottom: i < preview.ambiguities.length - 1 ? '4px' : 0 }}>
                  <span>⚠️</span><span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {preview.notes && (
            <div style={{ fontSize: '12px', color: '#64748b', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              💬 {preview.notes}
            </div>
          )}

          {/* Notify toggle */}
          <div onClick={() => setNotify(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: notify ? '#eff6ff' : 'white', border: `1px solid ${notify ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ width: '34px', height: '18px', borderRadius: '999px', background: notify ? '#2563eb' : '#e2e8f0', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: '2px', left: notify ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>📱 Notify driver</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Send via Captain Go</div>
            </div>
          </div>
        </>
      )}

      {err && <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>}

      {preview && (
        <button
          onClick={createTrip}
          disabled={saving}
          style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? '⏳ Creating...' : '✅ Create Trip'}
        </button>
      )}
    </div>
  )
}

// ─── Manual Tab ───────────────────────────────────────────────
function ManualTab({ vehicle, productionId, date, onDateChange, onCreated, onClose }) {
  const [step,         setStep]        = useState(1)
  const [serviceType,  setServiceType] = useState('Wrap')
  const [pickupLoc,    setPickupLoc]   = useState(null)   // { id, name, lat, lng, is_temp }
  const [dropoffLocs,  setDropoffLocs] = useState([null]) // array of loc objects
  const [locations,    setLocations]   = useState([])
  const [crew,         setCrew]        = useState([])
  const [hotels,       setHotels]      = useState([])     // { id, name } hotels from locations
  const [selCrew,      setSelCrew]     = useState([])
  const [suggested,    setSuggested]   = useState([])
  const [search,       setSearch]      = useState('')
  const [callTime,     setCallTime]    = useState('08:00')
  const [picker,       setPicker]      = useState(null)   // 'pickup' | 'dropoff_0' | ...
  const [notify,       setNotify]      = useState(true)
  const [saving,       setSaving]      = useState(false)
  const [err,          setErr]         = useState('')

  useEffect(() => {
    if (!productionId) return
    Promise.all([
      supabase.from('locations').select('id, name, lat, lng').eq('production_id', productionId).order('name'),
      supabase.from('crew').select('id, full_name, department, hotel_id, travel_status').eq('production_id', productionId).eq('active', true).order('full_name'),
    ]).then(([lR, cR]) => {
      setLocations(lR.data || [])
      setCrew(cR.data || [])
    })
  }, [productionId])

  // Adatta dropoffs al service type
  useEffect(() => {
    if (serviceType === 'Wrap' || serviceType === 'Arrival' || serviceType === 'Multi-Pick') {
      setDropoffLocs([null])
    } else if (serviceType === 'Departure') {
      setPickupLoc(null)
    }
    setSelCrew([])
    setSuggested([])
  }, [serviceType])

  // Calcola suggeriti quando cambiano pickup/dropoff
  useEffect(() => {
    if (step !== 2) return
    computeSuggested()
  }, [step, pickupLoc, dropoffLocs])

  function computeSuggested() {
    const pickupId  = pickupLoc?.id  || null
    const dropoffId = dropoffLocs[0]?.id || null
    const tc = deduceClass(pickupId, dropoffId)

    let candidates = []
    if (tc === 'ARRIVAL' && dropoffId) {
      // crew con travel_status IN nell'hotel del dropoff
      candidates = crew.filter(c => c.travel_status === 'IN' && c.hotel_id === dropoffId)
    } else if (tc === 'DEPARTURE' && pickupId) {
      // crew con travel_status OUT nell'hotel del pickup
      candidates = crew.filter(c => c.travel_status === 'OUT' && c.hotel_id === pickupId)
    } else if (tc === 'STANDARD' && pickupId) {
      // crew con travel_status PRESENT nell'hotel del pickup
      candidates = crew.filter(c => c.travel_status === 'PRESENT' && c.hotel_id === pickupId)
    }

    // Escludi già selezionati
    setSuggested(candidates.filter(c => !selCrew.find(s => s.id === c.id)))
  }

  function handlePickerSelect(loc) {
    if (picker === 'pickup') {
      setPickupLoc(loc)
    } else {
      const idx = parseInt(picker.split('_')[1])
      setDropoffLocs(p => p.map((v, i) => i === idx ? loc : v))
    }
    setPicker(null)
  }

  function addDropoff() {
    if (dropoffLocs.length >= 5) return
    setDropoffLocs(p => [...p, null])
  }

  function removeDropoff(i) {
    if (dropoffLocs.length === 1) return
    setDropoffLocs(p => p.filter((_, idx) => idx !== i))
  }

  function addPickup() {
    // For Multi-Pick: multiple pickups — we handle as array
    // Simplified: just allow UI for now
  }

  const validDropoffs = dropoffLocs.filter(Boolean)
  const canProceed = date && callTime && pickupLoc && validDropoffs.length > 0

  async function ensureTempLocation(loc) {
    if (!loc || !loc.is_temp) return loc?.id || null
    // Save as is_temp location in Supabase
    const { data, error } = await supabase
      .from('locations')
      .insert({ production_id: productionId, name: loc.name, lat: loc.lat, lng: loc.lng, is_temp: true })
      .select('id')
      .single()
    if (error) throw new Error('Failed to save custom location')
    return data.id
  }

  async function handleConfirm() {
    setSaving(true); setErr('')
    try {
      const pickupId  = await ensureTempLocation(pickupLoc)
      const dropoffIds = await Promise.all(validDropoffs.map(ensureTempLocation))

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
          dropoffIds,
          passengerIds: selCrew.map(c => c.id),
          notifyDriver: notify,
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* STEP 1 */}
      {step === 1 && (
        <>
          {/* Date + Time */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Date</label>
              <input type="date" value={date} onChange={e => onDateChange(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Time</label>
              <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} style={{ ...inp, fontWeight: '700', textAlign: 'center' }} />
            </div>
          </div>

          {/* Service Type */}
          <div>
            <label style={lbl}>Service Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {SERVICE_TYPES.map(s => (
                <button key={s} onClick={() => setServiceType(s)} style={{
                  padding: '7px 12px', borderRadius: '999px',
                  border: `2px solid ${serviceType === s ? '#2563eb' : '#e2e8f0'}`,
                  background: serviceType === s ? '#eff6ff' : 'white',
                  color: serviceType === s ? '#1d4ed8' : '#374151',
                  fontWeight: serviceType === s ? '800' : '500',
                  fontSize: '12px', cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Pickup */}
          <div>
            <label style={lbl}>Pickup</label>
            <button onClick={() => setPicker('pickup')} style={{
              width: '100%', padding: '11px 14px',
              border: `1px solid ${pickupLoc ? '#2563eb' : '#e2e8f0'}`,
              borderRadius: '10px', fontSize: '14px',
              color: pickupLoc ? '#0f172a' : '#94a3b8',
              background: pickupLoc ? '#eff6ff' : 'white',
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: pickupLoc ? '700' : '400',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{pickupLoc ? `${locIcon(pickupLoc.id)} ${pickupLoc.name}` : 'Select pickup...'}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
            </button>
          </div>

          {/* Dropoffs */}
          <div>
            <label style={lbl}>Dropoff{dropoffLocs.length > 1 ? 's' : ''}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dropoffLocs.map((loc, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => setPicker(`dropoff_${i}`)} style={{
                    flex: 1, padding: '11px 14px',
                    border: `1px solid ${loc ? '#2563eb' : '#e2e8f0'}`,
                    borderRadius: '10px', fontSize: '14px',
                    color: loc ? '#0f172a' : '#94a3b8',
                    background: loc ? '#eff6ff' : 'white',
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: loc ? '700' : '400',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{loc ? `${locIcon(loc.id)} ${loc.name}` : `Dropoff${dropoffLocs.length > 1 ? ` ${i+1}` : ''}...`}</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
                  </button>
                  {dropoffLocs.length > 1 && (
                    <button onClick={() => removeDropoff(i)} style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                  )}
                </div>
              ))}
              {['Multi-Drop', 'Mix'].includes(serviceType) && dropoffLocs.length < 5 && (
                <button onClick={addDropoff} style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px dashed #bfdbfe', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  ➕ Add Dropoff
                </button>
              )}
            </div>
          </div>

          <button onClick={() => setStep(2)} disabled={!canProceed} style={{
            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
            background: canProceed ? '#2563eb' : '#e2e8f0',
            color: canProceed ? 'white' : '#94a3b8',
            fontSize: '14px', fontWeight: '800',
            cursor: canProceed ? 'pointer' : 'default',
          }}>
            Next — Passengers →
          </button>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>👥</div>
            <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>Passengers</div>
          </div>

          {/* Selected */}
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

          {/* Suggested */}
          {suggested.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⭐ Suggested</span>
                <button onClick={() => { setSelCrew(p => { const ids = new Set(p.map(x=>x.id)); return [...p, ...suggested.filter(c => !ids.has(c.id))] }); setSuggested([]) }} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: '700', color: '#15803d', cursor: 'pointer' }}>Add all</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {suggested.slice(0, 10).map(c => (
                  <div key={c.id} onClick={() => { setSelCrew(p => [...p, c]); setSuggested(p => p.filter(x => x.id !== c.id)) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '10px', flexShrink: 0 }}>
                      {c.full_name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                    </div>
                    <span style={{ color: '#16a34a', fontSize: '18px', flexShrink: 0 }}>+</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <input type="text" placeholder="🔍 Search crew..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, fontSize: '14px' }} />

          {search && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
              {(() => {
                const q = search.toLowerCase()
                const filtered = crew.filter(c => !selCrew.find(x => x.id === c.id) && !suggested.find(x => x.id === c.id) && (c.full_name.toLowerCase().includes(q) || (c.department || '').toLowerCase().includes(q)))
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

          {/* Notify toggle */}
          <div onClick={() => setNotify(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: notify ? '#eff6ff' : 'white', border: `1px solid ${notify ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ width: '34px', height: '18px', borderRadius: '999px', background: notify ? '#2563eb' : '#e2e8f0', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: '2px', left: notify ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>📱 Notify driver</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Send via Captain Go</div>
            </div>
          </div>

          {err && <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {err}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>← Back</button>
            <button onClick={handleConfirm} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '⏳ Creating...' : `✅ Create Trip (${selCrew.length} pax)`}
            </button>
          </div>
        </>
      )}
    </div>

    {/* Location Picker */}
    {picker && (
      <LocationPicker
        locations={locations}
        title={picker === 'pickup' ? '📍 Pickup Location' : '📍 Dropoff Location'}
        onSelect={handlePickerSelect}
        onClose={() => setPicker(null)}
      />
    )}
    </>
  )
}

// ─── Main Modal ───────────────────────────────────────────────
export function QuickTripModal({ vehicle, productionId, onClose, onCreated }) {
  const [tab,  setTab]  = useState('ai')    // 'ai' | 'manual'
  const [date, setDate] = useState(isoToday())

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#f1f5f9', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#0f2340', padding: '0 20px', flexShrink: 0 }}>
          {[
            { key: 'ai',     label: '✨ AI Builder' },
            { key: 'manual', label: '📝 Manual' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '700',
              color: tab === t.key ? 'white' : 'rgba(255,255,255,0.5)',
              borderBottom: `3px solid ${tab === t.key ? '#60a5fa' : 'transparent'}`,
              transition: 'color 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 24px' }}>
          {tab === 'ai' ? (
            <AIBuilderTab
              vehicle={vehicle}
              productionId={productionId}
              date={date}
              onDateChange={setDate}
              onCreated={onCreated}
              onClose={onClose}
            />
          ) : (
            <ManualTab
              vehicle={vehicle}
              productionId={productionId}
              date={date}
              onDateChange={setDate}
              onCreated={onCreated}
              onClose={onClose}
            />
          )}
        </div>

      </div>
    </div>
  )
}