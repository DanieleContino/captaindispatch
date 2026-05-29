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
    if (!q || q.length < 2) { setPlacesResults([]); return }
    setPlacesLoading(true)
    try {
      const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setPlacesResults(data.predictions ? data.predictions.slice(0, 5) : [])
    } catch {
      setPlacesResults([])
    }
    setPlacesLoading(false)
  }

  async function resolvePlace(placeId, description) {
    setPlacesLoading(true)
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(placeId)}`)
      const data = await res.json()
      if (data.lat != null) {
        onSelect({ id: null, name: description, lat: data.lat, lng: data.lng, is_temp: true })
      }
    } catch {
      // silent
    }
    setPlacesLoading(false)
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
  const [pickerLeg,  setPickerLeg]  = useState(null) // { legIndex, field: 'pickup'|'dropoff' }

  function handleAIPickerSelect(loc) {
    const { legIndex, field } = pickerLeg
    setPreview(prev => {
      const legs = prev.legs.map((leg, i) => {
        if (i !== legIndex) return leg
        if (field === 'pickup') {
          return { ...leg, pickup_id: loc.id || ('TEMP_' + Date.now()), pickup_name: loc.name, pickup_custom: false, _pickup_temp: loc.is_temp ? loc : null }
        } else {
          return { ...leg, dropoff_id: loc.id || ('TEMP_' + Date.now()), dropoff_name: loc.name, dropoff_custom: false, _dropoff_temp: loc.is_temp ? loc : null }
        }
      })
      return { ...prev, legs }
    })
    setPickerLeg(null)
  }

  useEffect(() => {
    if (!productionId) return
    Promise.all([
supabase.from('crew').select('id, full_name, department, hotel_id, travel_status').eq('production_id', productionId).order('full_name'),
      supabase.from('locations').select('id, name, lat, lng').eq('production_id', productionId).order('name'),
    ]).then(([cR, lR]) => {
      setCrew(cR.data || [])
      setLocations(lR.data || [])
    })
  }, [productionId])

  async function buildTrip() {
    if (!text.trim()) return
    setLoading(true); setErr(''); setPreview(null)

    const now = new Date()
    const currentTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

    // Carica ultimi 15 esempi confermati per questa produzione
    let examplesBlock = ''
    try {
      const { data: examples } = await supabase
        .from('ai_trip_examples')
        .select('input_text, output_json')
        .eq('production_id', productionId)
        .order('created_at', { ascending: false })
        .limit(15)
      if (examples?.length > 0) {
        examplesBlock = `\nEXAMPLES FROM THIS PRODUCTION (learn from these patterns):\n` +
          examples.map(e => `User: "${e.input_text}"\nResult: ${JSON.stringify(e.output_json)}`).join('\n\n')
      }
    } catch (e) {
      console.warn('[ai_trip_examples] load failed:', e)
    }

    const crewList = crew.map(c => {
      const hotelName = locations.find(l => l.id === c.hotel_id)?.name || null
      return `- id:${c.id} name:"${c.full_name}" dept:${c.department || '–'} status:${c.travel_status || '–'}${hotelName ? ` hotel:"${hotelName}" hotel_id:${c.hotel_id}` : ' hotel:unknown'}`
    }).join('\n')

    const locationsList = locations.map(l => `- id:${l.id} name:"${l.name}"`).join('\n')

    const systemPrompt = `You are an expert transportation coordinator assistant for film/TV productions.
The user will describe a trip request in Italian or English, using natural conversational language.
Your job is to extract a precise structured itinerary from the request.

CONTEXT:
Current time: ${currentTime}
Today's date: ${date}
Vehicle: ${vehicle.sign_code || vehicle.id}

AVAILABLE CREW:
${crewList}

AVAILABLE LOCATIONS:
${locationsList}

MATCHING RULES — CREW:
- Match names flexibly: partial names, surnames only, first names only, nicknames, typos, mixed case, accents
- "il gaffer" / "il fonico" / "il regista" etc → match by role/department
- "i ragazzi della camera" / "il reparto elettrico" etc → match all crew of that department
- "lui" / "lei" / "loro" → refer to previously mentioned people in the same request
- "insieme a" / "con" / "anche" → multiple passengers same leg
- If a name is ambiguous (multiple matches) → list in ambiguities

MATCHING RULES — LOCATIONS:
- Match location names flexibly: partial names, abbreviations, typos
- "al set" / "sul set" / "in location" / "sul posto" → find SET location
- "all'aeroporto" / "in aeroporto" → find location with id starting APT_
- "alla stazione" / "in stazione" → find location with id starting STN_
- "al porto" → find location with id starting PRT_
- "al suo albergo" / "a casa sua" / "al suo hotel" / "dove sta" → use that person's hotel_id
- "all'Astoria" / "al Marriott" etc → partial hotel name match
- "qui" / "qua" / "dove siamo" → unknown location, set custom=true
- If location not in list and is a real address → set custom=true, id=null

MATCHING RULES — TIME:
- No time specified → use current_time (${currentTime})
- "subito" / "adesso" / "ora" / "subito" → current_time
- "presto" / "il prima possibile" / "appena puoi" → current_time
- "stamattina" → morning, use current_time if in morning else 08:00
- "stasera" → use 19:00 as default if no time given
- "dopo" / "più tardi" / "tra poco" → current_time + 30 minutes
- "alle X" / "per le X" / "entro le X" → parse time, format HH:MM

MULTI-LEG RULES:
- "e poi" / "dopo" / "successivamente" / "e dopo" → new leg after the first
- "torna indietro" / "riportalo" / "portalo di nuovo" → return leg (swap pickup/dropoff)
- "prima... poi..." → sequential legs in order
- Each passenger belongs to the leg where they board

AMBIGUITY RULES — only report if truly unresolvable:
- Person genuinely not found after flexible matching
- Location genuinely not found and not a known address
- Multiple people with same name
- DO NOT report missing time (use current_time)
- DO NOT report missing hotel if person has hotel_id
- DO NOT report obvious deductions

${examplesBlock}

Respond ONLY with a valid JSON object, no markdown, no backticks, no explanation:
{
  "legs": [
    {
      "pickup_id": "location_id or null if custom",
      "pickup_name": "display name",
      "pickup_custom": true/false,
      "dropoff_id": "location_id or null if custom",
      "dropoff_name": "display name",
      "dropoff_custom": true/false,
      "time": "HH:MM",
      "passenger_ids": ["crew_id1", ...],
      "passenger_names": ["Full Name 1", ...]
    }
  ],
  "ambiguities": [],
  "notes": "optional brief explanation in same language as user"
}`

    try {
      const res = await fetch('/api/ai/trip-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, systemPrompt }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPreview(data.result)
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

        // Salva location temp dal picker AI
        if (leg._pickup_temp) {
          const tmpId = 'TMP_' + Date.now() + '_P'
          const { data, error } = await supabase.from('locations').insert({ id: tmpId, production_id: productionId, name: leg._pickup_temp.name, lat: leg._pickup_temp.lat, lng: leg._pickup_temp.lng, is_temp: true }).select('id').single()
          if (error) { setErr('Failed to save pickup location'); setSaving(false); return }
          pickupId = data.id
        }
        if (leg._dropoff_temp) {
          const tmpId = 'TMP_' + Date.now() + '_D'
          const { data, error } = await supabase.from('locations').insert({ id: tmpId, production_id: productionId, name: leg._dropoff_temp.name, lat: leg._dropoff_temp.lat, lng: leg._dropoff_temp.lng, is_temp: true }).select('id').single()
          if (error) { setErr('Failed to save dropoff location'); setSaving(false); return }
          dropoffId = data.id
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

      // Salva esempio per apprendimento AI
      try {
        await supabase.from('ai_trip_examples').insert({
          production_id: productionId,
          input_text: text,
          output_json: preview,
        })
      } catch (e) {
        console.warn('[ai_trip_examples] save failed:', e)
      }

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

  // Controlla se ci sono ancora custom non risolti
  const hasUnresolvedCustom = preview?.legs?.some(l => l.pickup_custom || l.dropoff_custom)

  return (
    <>
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
                      {leg.pickup_custom && <button onClick={() => setPickerLeg({ legIndex: i, field: 'pickup' })} style={{ fontSize: '10px', color: '#d97706', fontWeight: '700', marginLeft: '6px', background: '#fffbeb', padding: '2px 7px', borderRadius: '4px', border: '1px solid #fde68a', cursor: 'pointer', fontFamily: 'inherit' }}>📍 Confirm address</button>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 6px' }}>
                      → {locIcon(leg.dropoff_id)} {leg.dropoff_name}
                      {leg.dropoff_custom && <button onClick={() => setPickerLeg({ legIndex: i, field: 'dropoff' })} style={{ fontSize: '10px', color: '#d97706', fontWeight: '700', marginLeft: '6px', background: '#fffbeb', padding: '2px 7px', borderRadius: '4px', border: '1px solid #fde68a', cursor: 'pointer', fontFamily: 'inherit' }}>📍 Confirm address</button>}
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
          disabled={saving || hasUnresolvedCustom}
          style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: saving || hasUnresolvedCustom ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: saving || hasUnresolvedCustom ? 'default' : 'pointer' }}
        >
          {saving ? '⏳ Creating...' : hasUnresolvedCustom ? '📍 Confirm custom addresses first' : '✅ Create Trip'}
        </button>
      )}
    </div>

    {pickerLeg && (
      <LocationPicker
        locations={locations}
        title="📍 Confirm Address"
        onSelect={handleAIPickerSelect}
        onClose={() => setPickerLeg(null)}
      />
    )}
    </>
  )
}

// ─── Manual Tab ───────────────────────────────────────────────
function ManualTab({ vehicle, productionId, date, onDateChange, onCreated, onClose }) {
  const [step,         setStep]        = useState(1)
  const [serviceType,  setServiceType] = useState('Wrap')
  const [pickupLoc,    setPickupLoc]   = useState(null)
  const [dropoffLoc,   setDropoffLoc]  = useState(null)
  const [locations,    setLocations]   = useState([])
  const [crew,         setCrew]        = useState([])
  const [selCrew,      setSelCrew]     = useState([])
  const [suggested,    setSuggested]   = useState([])
  const [search,       setSearch]      = useState('')
  const [callTime,     setCallTime]    = useState('08:00')
  const [pickupTime,   setPickupTime]  = useState('08:00')
  const [timeMode,     setTimeMode]    = useState('call')  // 'call' | 'pickup' | 'now'
  const [picker,       setPicker]      = useState(null)
  const [notify,       setNotify]      = useState(true)
  const [saving,       setSaving]      = useState(false)
  const [err,          setErr]         = useState('')
  // Multi-leg rows: [{ personId, locId, locName, locTemp }]
  const [pickupRows,   setPickupRows]  = useState([{ personId: '', locId: null, locName: '', locTemp: null }])
  const [dropoffRows,  setDropoffRows] = useState([{ personId: '', locId: null, locName: '', locTemp: null }])
  const [rowPicker,    setRowPicker]   = useState(null) // { list: 'pickup'|'dropoff', index: number }
  const [rowSearch,    setRowSearch]   = useState('')

  const isMulti = ['Multi-Pick', 'Multi-Drop', 'Mix'].includes(serviceType)

  useEffect(() => {
    if (!productionId) return
    Promise.all([
      supabase.from('locations').select('id, name, lat, lng').eq('production_id', productionId).order('name'),
      supabase.from('crew').select('id, full_name, department, hotel_id, travel_status').eq('production_id', productionId).order('full_name'),
    ]).then(([lR, cR]) => {
      setLocations(lR.data || [])
      setCrew(cR.data || [])
    })
  }, [productionId])

  useEffect(() => {
    setSelCrew([])
    setSuggested([])
    setPickupRows([{ personId: '', locId: null, locName: '', locTemp: null }])
    setDropoffRows([{ personId: '', locId: null, locName: '', locTemp: null }])
    setPickupLoc(null)
    setDropoffLoc(null)
    setStep(1)
  }, [serviceType])

  useEffect(() => {
    if (step !== 2 || isMulti) return
    computeSuggested()
  }, [step, pickupLoc, dropoffLoc])

  function computeSuggested() {
    const pickupId  = pickupLoc?.id  || null
    const dropoffId = dropoffLoc?.id || null
    const tc = deduceClass(pickupId, dropoffId)
    let candidates = []
    if (tc === 'ARRIVAL' && dropoffId) candidates = crew.filter(c => c.travel_status === 'IN' && c.hotel_id === dropoffId)
    else if (tc === 'DEPARTURE' && pickupId) candidates = crew.filter(c => c.travel_status === 'OUT' && c.hotel_id === pickupId)
    else if (tc === 'STANDARD' && pickupId) candidates = crew.filter(c => c.travel_status === 'PRESENT' && c.hotel_id === pickupId)
    setSuggested(candidates.filter(c => !selCrew.find(s => s.id === c.id)))
  }

  function handlePickerSelect(loc) {
    if (picker === 'pickup') setPickupLoc(loc)
    else setDropoffLoc(loc)
    setPicker(null)
  }

  // Quando si seleziona una persona in una riga multi, autocompila la location con il suo hotel
  function handleRowPersonSelect(list, index, personId) {
    const person = crew.find(c => c.id === personId)
    const hotel  = person?.hotel_id ? locations.find(l => l.id === person.hotel_id) : null
    const updater = list === 'pickup' ? setPickupRows : setDropoffRows
    updater(prev => prev.map((row, i) => i !== index ? row : {
      ...row,
      personId,
      locId:   hotel?.id   || null,
      locName: hotel?.name || '',
      locTemp: null,
    }))
  }

  function handleRowLocSelect(loc) {
    const { list, index } = rowPicker
    const updater = list === 'pickup' ? setPickupRows : setDropoffRows
    updater(prev => prev.map((row, i) => i !== index ? row : {
      ...row,
      locId:   loc.is_temp ? null : loc.id,
      locName: loc.name,
      locTemp: loc.is_temp ? loc : null,
    }))
    setRowPicker(null)
  }

  function addRow(list) {
    const updater = list === 'pickup' ? setPickupRows : setDropoffRows
    updater(prev => [...prev, { personId: '', locId: null, locName: '', locTemp: null }])
  }

  function removeRow(list, index) {
    const updater = list === 'pickup' ? setPickupRows : setDropoffRows
    updater(prev => prev.filter((_, i) => i !== index))
  }

  async function ensureTempLocation(loc) {
    if (!loc || !loc.is_temp) return loc?.id || null
    const tmpId = 'TMP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const { data, error } = await supabase
      .from('locations')
      .insert({ id: tmpId, production_id: productionId, name: loc.name, lat: loc.lat, lng: loc.lng, is_temp: true })
      .select('id').single()
    if (error) throw new Error('Failed to save custom location')
    return data.id
  }

  // Canproceed per step 1 standard
  const canProceedStandard = date && callTime && pickupLoc && dropoffLoc

  // Canproceed per multi: almeno una riga valida con persona e location
  function rowIsValid(row) { return row.personId && (row.locId || row.locName) }
  function canProceedMulti() {
    if (serviceType === 'Multi-Pick') return dropoffLoc && pickupRows.some(rowIsValid)
    if (serviceType === 'Multi-Drop') return pickupLoc && dropoffRows.some(rowIsValid)
    if (serviceType === 'Mix') return pickupRows.some(rowIsValid) && dropoffRows.some(rowIsValid)
    return false
  }

  async function handleConfirmStandard() {
    setSaving(true); setErr('')
    try {
      const pickupId   = await ensureTempLocation(pickupLoc)
      const dropoffIds = [await ensureTempLocation(dropoffLoc)]
      const res = await fetch('/api/trips/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionId, vehicleId: vehicle.id, date, callTime, serviceType,
          pickupId, dropoffIds,
          passengerIds: selCrew.map(c => c.id),
          notifyDriver: notify,
          ...(timeMode === 'pickup' ? { pickupTime } : {}),
          ...(timeMode === 'now'    ? { pickupTime: `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`, pickupTimeIsNow: true } : {}),
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  async function handleConfirmMulti() {
    setSaving(true); setErr('')
    try {
      let legs = []

      if (serviceType === 'Multi-Pick') {
        const commonDropoffId = await ensureTempLocation(dropoffLoc)
        legs = await Promise.all(
          pickupRows.filter(rowIsValid).map(async row => ({
            pickupId:    row.locTemp ? await ensureTempLocation(row.locTemp) : row.locId,
            dropoffId:   commonDropoffId,
            passengerIds: row.personId ? [row.personId] : [],
          }))
        )
      } else if (serviceType === 'Multi-Drop') {
        const commonPickupId = await ensureTempLocation(pickupLoc)
        legs = await Promise.all(
          dropoffRows.filter(rowIsValid).map(async row => ({
            pickupId:    commonPickupId,
            dropoffId:   row.locTemp ? await ensureTempLocation(row.locTemp) : row.locId,
            passengerIds: row.personId ? [row.personId] : [],
          }))
        )
      } else if (serviceType === 'Mix') {
        const pickupLegs = await Promise.all(
          pickupRows.filter(rowIsValid).map(async row => ({
            pickupId:    row.locTemp ? await ensureTempLocation(row.locTemp) : row.locId,
            dropoffId:   null,
            passengerIds: row.personId ? [row.personId] : [],
            _isMixPickup: true,
          }))
        )
        const dropoffLegs = await Promise.all(
          dropoffRows.filter(rowIsValid).map(async row => ({
            pickupId:    null,
            dropoffId:   row.locTemp ? await ensureTempLocation(row.locTemp) : row.locId,
            passengerIds: row.personId ? [row.personId] : [],
            _isMixPickup: false,
          }))
        )
        // Mix: abbina pickup e dropoff in ordine, il dropoffId dei pickup leg = primo dropoff disponibile
        // Struttura semplificata: tutti i pickup leg prima, poi tutti i dropoff leg
        // Ogni pickup leg ha dropoffId = il dropoff della stessa persona se trovato, altrimenti primo dropoff
        const dropoffMap = {}
        dropoffLegs.forEach(dl => { if (dl.passengerIds[0]) dropoffMap[dl.passengerIds[0]] = dl.dropoffId })
        legs = [
          ...pickupLegs.map(pl => ({
            pickupId:    pl.pickupId,
            dropoffId:   dropoffMap[pl.passengerIds[0]] || dropoffLegs[0]?.dropoffId || pl.pickupId,
            passengerIds: pl.passengerIds,
          })),
          ...dropoffLegs.map(dl => ({
            pickupId:    pickupLegs[pickupLegs.length - 1]?.pickupId || dl.dropoffId,
            dropoffId:   dl.dropoffId,
            passengerIds: dl.passengerIds,
          })),
        ]
      }

      const res = await fetch('/api/trips/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionId, vehicleId: vehicle.id, date, callTime, serviceType,
          legs, notifyDriver: notify,
          ...(timeMode === 'pickup' ? { pickupTime } : {}),
          ...(timeMode === 'now'    ? { pickupTime: `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`, pickupTimeIsNow: true } : {}),
        }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); setSaving(false); return }
      onCreated(d.trip_id)
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  // Persone già usate nelle righe (per evitare duplicati)
  function usedPersonIds(list) {
    const rows = list === 'pickup' ? pickupRows : dropoffRows
    return new Set(rows.map(r => r.personId).filter(Boolean))
  }

  function renderMultiRows(list) {
    const rows    = list === 'pickup' ? pickupRows : dropoffRows
    const setRows = list === 'pickup' ? setPickupRows : setDropoffRows
    const used    = usedPersonIds(list)
    const label   = list === 'pickup' ? '📥 Pickups' : '📤 Dropoffs'
    const addLabel = list === 'pickup' ? '+ Add pickup' : '+ Add dropoff'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={lbl}>{label}</label>
        {rows.map((row, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Persona */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: row.personId ? '#eff6ff' : '#f1f5f9', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', flexShrink: 0 }}>
                {row.personId ? crew.find(c => c.id === row.personId)?.full_name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'}
              </div>
              <select
                value={row.personId}
                onChange={e => handleRowPersonSelect(list, i, e.target.value)}
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: row.personId ? '#0f172a' : '#94a3b8', background: 'white', fontFamily: 'inherit' }}
              >
                <option value="">Select person...</option>
                {crew.filter(c => !used.has(c.id) || c.id === row.personId).map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
              {rows.length > 1 && (
                <button onClick={() => removeRow(list, i)} style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
              )}
            </div>
            {/* Location */}
            <button
              onClick={() => setRowPicker({ list, index: i })}
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${row.locId || row.locName ? '#2563eb' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '12px', color: row.locId || row.locName ? '#0f172a' : '#94a3b8', background: row.locId || row.locName ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: row.locId || row.locName ? '700' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{row.locName ? `${locIcon(row.locId)} ${row.locName}` : (list === 'pickup' ? 'Pickup location...' : 'Dropoff location...')}</span>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>▾</span>
            </button>
          </div>
        ))}
        <button onClick={() => addRow(list)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px dashed #bfdbfe', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
          {addLabel}
        </button>
      </div>
    )
  }

  const totalMultiPax = () => {
    const pickupPax  = pickupRows.filter(rowIsValid).length
    const dropoffPax = dropoffRows.filter(rowIsValid).length
    if (serviceType === 'Multi-Pick') return pickupPax
    if (serviceType === 'Multi-Drop') return dropoffPax
    return Math.max(pickupPax, dropoffPax)
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Date + Time Toggle */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Date</label>
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Time Mode</label>
          <div style={{ display: 'flex', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f1f5f9' }}>
            {[
              { key: 'call',   label: '🕐 Call' },
              { key: 'pickup', label: '🚗 Pickup' },
              { key: 'now',    label: '⚡ Now' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setTimeMode(opt.key)} style={{
                flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                background: timeMode === opt.key ? '#2563eb' : 'transparent',
                color: timeMode === opt.key ? 'white' : '#64748b',
                transition: 'background 0.15s',
              }}>{opt.label}</button>
            ))}
          </div>
          {timeMode !== 'now' && (
            <input
              type="time"
              value={timeMode === 'call' ? callTime : pickupTime}
              onChange={e => timeMode === 'call' ? setCallTime(e.target.value) : setPickupTime(e.target.value)}
              style={{ ...inp, fontWeight: '700', textAlign: 'center', marginTop: '6px' }}
            />
          )}
          {timeMode === 'now' && (
            <div style={{ marginTop: '6px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '12px', color: '#15803d', fontWeight: '700', textAlign: 'center' }}>
              ⚡ Departs immediately
            </div>
          )}
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

      {/* ── STANDARD FLOW (Wrap / Arrival / Departure) ── */}
      {!isMulti && step === 1 && (
        <>
          <div>
            <label style={lbl}>Pickup</label>
            <button onClick={() => setPicker('pickup')} style={{ width: '100%', padding: '11px 14px', border: `1px solid ${pickupLoc ? '#2563eb' : '#e2e8f0'}`, borderRadius: '10px', fontSize: '14px', color: pickupLoc ? '#0f172a' : '#94a3b8', background: pickupLoc ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: pickupLoc ? '700' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{pickupLoc ? `${locIcon(pickupLoc.id)} ${pickupLoc.name}` : 'Select pickup...'}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
            </button>
          </div>
          <div>
            <label style={lbl}>Dropoff</label>
            <button onClick={() => setPicker('dropoff')} style={{ width: '100%', padding: '11px 14px', border: `1px solid ${dropoffLoc ? '#2563eb' : '#e2e8f0'}`, borderRadius: '10px', fontSize: '14px', color: dropoffLoc ? '#0f172a' : '#94a3b8', background: dropoffLoc ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: dropoffLoc ? '700' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{dropoffLoc ? `${locIcon(dropoffLoc.id)} ${dropoffLoc.name}` : 'Select dropoff...'}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
            </button>
          </div>
          <button onClick={() => setStep(2)} disabled={!canProceedStandard} style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: canProceedStandard ? '#2563eb' : '#e2e8f0', color: canProceedStandard ? 'white' : '#94a3b8', fontSize: '14px', fontWeight: '800', cursor: canProceedStandard ? 'pointer' : 'default' }}>
            Next — Passengers →
          </button>
        </>
      )}

      {/* ── STANDARD FLOW Step 2: Passengers ── */}
      {!isMulti && step === 2 && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>👥</div>
            <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>Passengers</div>
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
            <button onClick={handleConfirmStandard} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '14px', fontWeight: '800', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '⏳ Creating...' : `✅ Create Trip (${selCrew.length} pax)`}
            </button>
          </div>
        </>
      )}

      {/* ── MULTI FLOW (Multi-Pick / Multi-Drop / Mix) ── */}
      {isMulti && (
        <>
          {/* Multi-Pick: dropoff comune + lista pickup */}
          {serviceType === 'Multi-Pick' && (
            <>
              <div>
                <label style={lbl}>Dropoff comune</label>
                <button onClick={() => setPicker('dropoff')} style={{ width: '100%', padding: '11px 14px', border: `1px solid ${dropoffLoc ? '#2563eb' : '#e2e8f0'}`, borderRadius: '10px', fontSize: '14px', color: dropoffLoc ? '#0f172a' : '#94a3b8', background: dropoffLoc ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: dropoffLoc ? '700' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{dropoffLoc ? `${locIcon(dropoffLoc.id)} ${dropoffLoc.name}` : 'Select dropoff...'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
                </button>
              </div>
              {renderMultiRows('pickup')}
            </>
          )}

          {/* Multi-Drop: pickup comune + lista dropoff */}
          {serviceType === 'Multi-Drop' && (
            <>
              <div>
                <label style={lbl}>Pickup comune</label>
                <button onClick={() => setPicker('pickup')} style={{ width: '100%', padding: '11px 14px', border: `1px solid ${pickupLoc ? '#2563eb' : '#e2e8f0'}`, borderRadius: '10px', fontSize: '14px', color: pickupLoc ? '#0f172a' : '#94a3b8', background: pickupLoc ? '#eff6ff' : 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: pickupLoc ? '700' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{pickupLoc ? `${locIcon(pickupLoc.id)} ${pickupLoc.name}` : 'Select pickup...'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>▾</span>
                </button>
              </div>
              {renderMultiRows('dropoff')}
            </>
          )}

          {/* Mix: entrambe le liste */}
          {serviceType === 'Mix' && (
            <>
              {renderMultiRows('pickup')}
              {renderMultiRows('dropoff')}
            </>
          )}

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

          <button
            onClick={handleConfirmMulti}
            disabled={saving || !canProceedMulti()}
            style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: saving || !canProceedMulti() ? '#e2e8f0' : '#16a34a', color: saving || !canProceedMulti() ? '#94a3b8' : 'white', fontSize: '14px', fontWeight: '800', cursor: saving || !canProceedMulti() ? 'default' : 'pointer' }}
          >
            {saving ? '⏳ Creating...' : `✅ Create Trip (${totalMultiPax()} pax)`}
          </button>
        </>
      )}

    </div>

    {/* Location Picker — standard */}
    {picker && (
      <LocationPicker
        locations={locations}
        title={picker === 'pickup' ? '📍 Pickup Location' : '📍 Dropoff Location'}
        onSelect={handlePickerSelect}
        onClose={() => setPicker(null)}
      />
    )}

    {/* Location Picker — row multi */}
    {rowPicker && (
      <LocationPicker
        locations={locations}
        title={rowPicker.list === 'pickup' ? '📍 Pickup Location' : '📍 Dropoff Location'}
        onSelect={handleRowLocSelect}
        onClose={() => setRowPicker(null)}
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