'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

function getHubIcon(hub) {
  const s = ((hub.display_id || '') + ' ' + (hub.name || '')).toUpperCase()
  if (/APT|AIRPORT|AEROPORTO/.test(s))                   return '✈️'
  if (/STN|TRAIN|STAZIONE|CENTRALE|FERROVIARIA/.test(s)) return '🚂'
  if (/BUS|AUTOSTAZIONE|AUTOBUS/.test(s))                return '🚌'
  if (/PORT|PORTO|FERRY/.test(s))                        return '⛴️'
  return '📍'
}

const HUB_EMPTY = { id: '', name: '', lat: '', lng: '', default_pickup_point: '' }

function sectionTitle(icon, title) {
  return (
    <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '5px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
      <span>{icon}</span> {title}
    </div>
  )
}

function HubLocationsSection({ productionId }) {
  const [hubs,        setHubs]        = useState([])
  const [saving,      setSaving]      = useState(false)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState({ ...HUB_EMPTY })
  const [formError,   setFormError]   = useState(null)
  const [formSaving,  setFormSaving]  = useState(false)
  const [placeQuery,   setPlaceQuery]   = useState('')
  const [predictions,  setPredictions]  = useState([])
  const [placeOpen,    setPlaceOpen]    = useState(false)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [search,    setSearch]    = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)

  const inp2 = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl2 = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  const loadHubs = useCallback(async () => {
    if (!productionId) return
    const { data } = await supabase.from('locations')
      .select('uuid, display_id, name, lat, lng, default_pickup_point')
      .eq('production_id', productionId)
      .eq('is_hub', true)
      .order('name')
    setHubs(data || [])
  }, [productionId])

  useEffect(() => { loadHubs() }, [loadHubs])

  useEffect(() => {
    if (!productionId) return
    const channel = supabase.channel(`hub-locations-prod-${productionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'locations',
        filter: `production_id=eq.${productionId}`,
      }, () => loadHubs())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [productionId, loadHubs])

  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return }
    setSearching(true)
    supabase.from('locations')
      .select('uuid, display_id, name')
      .eq('production_id', productionId)
      .eq('is_hub', false)
      .ilike('name', `%${search}%`)
      .limit(6)
      .then(({ data }) => { setResults(data || []); setSearching(false) })
  }, [search, productionId])

  useEffect(() => {
    if (!placeQuery || placeQuery.length < 2) { setPredictions([]); setPlaceOpen(false); return }
    const t = setTimeout(async () => {
      setPlaceLoading(true)
      try {
        const res  = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(placeQuery)}`)
        const data = await res.json()
        setPredictions(data.predictions || [])
        setPlaceOpen((data.predictions || []).length > 0)
      } catch {}
      setPlaceLoading(false)
    }, 400)
    return () => clearTimeout(t)
  }, [placeQuery])

  async function handleSelectPlace(p) {
    setPlaceOpen(false); setPlaceLoading(true)
    try {
      const res  = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}`)
      const data = await res.json()
      const iataMatch = (p.description || '').match(/\(([A-Z]{3})\)/)
      const iataCode  = iataMatch ? iataMatch[1] : null
      setForm(f => {
        const isAirport = /APT|AIRPORT|AEROPORTO/i.test(data.name || p.main_text)
        const isTrain   = /STN|TRAIN|STAZIONE|CENTRALE|FERROVIARIA/i.test(data.name || p.main_text)
        const isBus     = /BUS|AUTOSTAZIONE/i.test(data.name || p.main_text)
        const isPort    = /PORT|PORTO|FERRY/i.test(data.name || p.main_text)
        const prefix    = isAirport ? 'APT' : isTrain ? 'STN' : isBus ? 'BUS' : isPort ? 'PORT' : 'HUB'
        const suffix    = iataCode || (data.name || p.main_text || '').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3)
        const suggestedId = `${prefix}_${suffix}`
        return {
          ...f,
          name: data.name || f.name || p.main_text,
          lat:  data.lat != null ? String(data.lat) : f.lat,
          lng:  data.lng != null ? String(data.lng) : f.lng,
          default_pickup_point: data.address || f.default_pickup_point,
          id: f.id ? f.id : suggestedId,
        }
      })
      setPlaceQuery(p.description)
    } catch {}
    setPlaceLoading(false)
  }

  async function addExistingHub(loc) {
    setSaving(true)
    await supabase.from('locations').update({ is_hub: true }).eq('uuid', loc.uuid)
    setSearch(''); setResults([])
    setSaving(false)
  }

  async function removeHub(loc) {
    if (!confirm(`Remove "${loc.name}" as hub?`)) return
    setSaving(true)
    await supabase.from('locations').update({ is_hub: false }).eq('uuid', loc.uuid)
    setSaving(false)
  }

  async function handleSaveHub(e) {
    e.preventDefault()
    setFormError(null)
    if (!form.id.trim()) { setFormError('ID required'); return }
    if (!form.name.trim()) { setFormError('Name required'); return }
    setFormSaving(true)
    if (showForm === 'new') {
      const { error } = await supabase.from('locations').insert({
          production_id: productionId,
          display_id:   form.id.trim().toUpperCase(),
        name: form.name.trim(),
        is_hub: true,
        lat:  form.lat !== '' ? parseFloat(String(form.lat).replace(',', '.')) : null,
        lng:  form.lng !== '' ? parseFloat(String(form.lng).replace(',', '.')) : null,
        default_pickup_point: form.default_pickup_point.trim() || null,
      })
      if (error) { setFormError(error.message); setFormSaving(false); return }
    } else {
      const { error } = await supabase.from('locations').update({
        name: form.name.trim(),
        lat:  form.lat !== '' ? parseFloat(String(form.lat).replace(',', '.')) : null,
        lng:  form.lng !== '' ? parseFloat(String(form.lng).replace(',', '.')) : null,
        default_pickup_point: form.default_pickup_point.trim() || null,
      }).eq('uuid', showForm.uuid)
      if (error) { setFormError(error.message); setFormSaving(false); return }
    }
    setFormSaving(false)
    setShowForm(false)
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
    loadHubs()
  }

  function openNew() {
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
    setFormError(null)
    setShowForm('new')
  }

  function openEdit(hub) {
    setForm({ id: hub.display_id || '', name: hub.name, lat: hub.lat ?? '', lng: hub.lng ?? '', default_pickup_point: hub.default_pickup_point || '' })
    setPlaceQuery('')
    setFormError(null)
    setShowForm(hub)
  }

  return (
    <>
      {sectionTitle('🛫', 'Hub Locations')}
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
        Hub locations filter Travel Calendar imports — only movements touching a hub are imported.
      </div>

      {hubs.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', fontStyle: 'italic' }}>No hub locations set</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {hubs.map(h => (
            <div key={h.uuid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <span style={{ fontSize: '16px' }}>{getHubIcon(h)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#1d4ed8' }}>{h.name}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{h.display_id}{h.lat && h.lng ? ` · ${parseFloat(h.lat).toFixed(4)}, ${parseFloat(h.lng).toFixed(4)}` : ' · no coordinates'}</div>
              </div>
              <button type="button" onClick={() => openEdit(h)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white', color: '#1d4ed8', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                ✎ Edit
              </button>
              <button type="button" onClick={() => removeHub(h)} disabled={saving}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '11px', cursor: 'pointer' }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginBottom: '12px' }}>
            {showForm === 'new' ? '+ New Hub Location' : `✎ Edit — ${showForm.name}`}
          </div>

          <div style={{ marginBottom: '10px', position: 'relative' }}>
            <label style={lbl2}>Search on Google Maps</label>
            <input value={placeQuery} onChange={e => setPlaceQuery(e.target.value)}
              placeholder="Search airport, station, hub…" style={inp2} autoComplete="off" />
            {placeLoading && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>Searching…</div>}
            {placeOpen && predictions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {predictions.map(p => (
                  <div key={p.place_id} onClick={() => handleSelectPlace(p)}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    📍 {p.main_text} {p.secondary_text && <span style={{ color: '#94a3b8', fontSize: '11px' }}>— {p.secondary_text}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', marginBottom: '6px' }}>
            <div>
              <label style={lbl2}>IATA / ID *</label>
              <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value.toUpperCase() }))}
                style={{ ...inp2, fontFamily: 'monospace', fontWeight: '700', background: showForm !== 'new' ? '#f8fafc' : 'white' }}
                placeholder="APT_BRI" readOnly={showForm !== 'new'} />
            </div>
            <div>
              <label style={lbl2}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inp2} placeholder="Bari Airport" />
            </div>
          </div>

          {/* ID convention helper */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '7px', padding: '8px 12px', marginBottom: '10px', fontSize: '11px', color: '#0369a1' }}>
            <div style={{ fontWeight: '800', marginBottom: '4px', letterSpacing: '0.03em' }}>ℹ️ ID convention</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '2px 10px', fontFamily: 'monospace' }}>
              <span>✈️</span><span style={{ fontWeight: '700' }}>Airport</span><span style={{ color: '#0284c7' }}>APT_xxx &nbsp;→ APT_BRI, APT_FCO</span>
              <span>🚂</span><span style={{ fontWeight: '700' }}>Train Stn</span><span style={{ color: '#0284c7' }}>STN_xxx &nbsp;→ STN_ROM, STN_MIL</span>
              <span>⛴️</span><span style={{ fontWeight: '700' }}>Port/Ferry</span><span style={{ color: '#0284c7' }}>PORT_xxx → PORT_GEN, PORT_NAP</span>
              <span>🚌</span><span style={{ fontWeight: '700' }}>Bus station</span><span style={{ color: '#0284c7' }}>BUS_xxx &nbsp;→ BUS_PAL, BUS_ROM</span>
              <span>📍</span><span style={{ fontWeight: '700' }}>Other hub</span><span style={{ color: '#0284c7' }}>HUB_xxx &nbsp;→ HUB_SET, HUB_BASE</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={lbl2}>Lat</label>
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                style={inp2} placeholder="41.138900" />
            </div>
            <div>
              <label style={lbl2}>Lng</label>
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                style={inp2} placeholder="16.760300" />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={lbl2}>Default Pickup Point</label>
            <input value={form.default_pickup_point} onChange={e => setForm(f => ({ ...f, default_pickup_point: e.target.value }))}
              style={inp2} placeholder="Arrivals exit, Terminal 1…" />
          </div>

          {formError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>❌ {formError}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...HUB_EMPTY }); setPlaceQuery('') }}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSaveHub} disabled={formSaving}
              style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: formSaving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '12px', cursor: formSaving ? 'default' : 'pointer', fontWeight: '800' }}>
              {formSaving ? 'Saving…' : showForm === 'new' ? '+ Save Hub' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button type="button" onClick={openNew}
            style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            + New Hub Location
          </button>
        </div>
      )}

      {!showForm && (
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Or search existing location to mark as hub…"
            style={{ ...inp2, fontSize: '12px' }} autoComplete="off" />
          {searching && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {results.map(r => (
                <div key={r.uuid} onClick={() => addExistingHub(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  {getHubIcon(r)} {r.name} <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.display_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export { HubLocationsSection, getHubIcon }
