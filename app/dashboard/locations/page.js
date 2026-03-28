'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { PageHeader } from '../../../components/ui/PageHeader'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID
const SIDEBAR_W = 400

// ─── Sidebar ─────────────────────────────────────────────────
function LocationSidebar({ open, mode, initial, onClose, onSaved }) {
  const t = useT()
  const EMPTY = { id: '', name: '', is_hub: false, lat: '', lng: '', default_pickup_point: '' }
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDel]        = useState(false)
  const [confirmDel, setCd]       = useState(false)
  const [error, setError]         = useState(null)
  const [refreshing, setRefresh]  = useState(false)
  const [refreshMsg, setRefMsg]   = useState(null)

  // ── Places Autocomplete state ──
  const [placeQuery,   setPlaceQuery]   = useState('')
  const [predictions,  setPredictions]  = useState([])
  const [placeOpen,    setPlaceOpen]    = useState(false)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeError,   setPlaceError]   = useState(null)
  const debounceRef = useRef(null)
  const dropdownRef = useRef(null)

  // ── Map picker state ──
  const [mapOpen, setMapOpen] = useState(false)

  // postMessage listener per map picker
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === 'MAP_PICK') {
        setForm(f => ({
          ...f,
          lat: String(e.data.lat),
          lng: String(e.data.lng),
          default_pickup_point: e.data.address || f.default_pickup_point,
        }))
        setMapOpen(false)
      } else if (e.data.type === 'MAP_CANCEL') {
        setMapOpen(false)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Reset sidebar state on open/close
  useEffect(() => {
    if (!open) {
      setPlaceQuery(''); setPredictions([]); setPlaceOpen(false); setPlaceError(null)
      setMapOpen(false); setRefMsg(null)
      return
    }
    setError(null); setCd(false); setRefMsg(null)
    if (mode === 'edit' && initial) {
      setForm({ id: initial.id || '', name: initial.name || '', is_hub: !!initial.is_hub, lat: initial.lat ?? '', lng: initial.lng ?? '', default_pickup_point: initial.default_pickup_point || '' })
    } else {
      setForm({ ...EMPTY })
    }
  }, [open, mode, initial])

  // Debounce Google Places search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!placeQuery.trim() || placeQuery.length < 2) { setPredictions([]); setPlaceOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setPlaceLoading(true); setPlaceError(null)
      try {
        const res  = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(placeQuery)}`)
        const data = await res.json()
        if (data.predictions) { setPredictions(data.predictions); setPlaceOpen(data.predictions.length > 0) }
        else { setPlaceError(data.error || 'Errore ricerca'); setPlaceOpen(false) }
      } catch { setPlaceError('Network error'); setPlaceOpen(false) }
      setPlaceLoading(false)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [placeQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setPlaceOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSelectPlace(prediction) {
    setPlaceOpen(false)
    setPlaceQuery(prediction.description)
    setPlaceLoading(true); setPlaceError(null)
    try {
      const res  = await fetch(`/api/places/details?place_id=${encodeURIComponent(prediction.place_id)}`)
      const data = await res.json()
      if (data.lat != null) {
        setForm(f => ({
          ...f,
          lat: String(data.lat),
          lng: String(data.lng),
          default_pickup_point: data.address || f.default_pickup_point,
        }))
      } else { setPlaceError(data.error || 'Dettagli non disponibili') }
    } catch { setPlaceError('Network error') }
    setPlaceLoading(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (!form.id.trim() || !form.name.trim()) { setError('ID e Nome obbligatori'); return }
    setSaving(true)
    const row = {
      production_id: PRODUCTION_ID,
      id:   form.id.trim().toUpperCase(),
      name: form.name.trim(),
      is_hub: form.is_hub,
      lat:  form.lat !== '' ? parseFloat(String(form.lat).replace(',', '.')) : null,
      lng:  form.lng !== '' ? parseFloat(String(form.lng).replace(',', '.')) : null,
      default_pickup_point: form.default_pickup_point.trim() || null,
    }
    let err
    if (mode === 'new') {
      const r = await supabase.from('locations').insert(row); err = r.error
    } else {
      const { id, ...upd } = row
      const r = await supabase.from('locations').update(upd).eq('id', initial.id); err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }

    // ── Ricalcola rotte se lat/lng presenti ──────────────────
    const savedId = mode === 'new' ? form.id.trim().toUpperCase() : initial.id
    if (form.lat !== '' && form.lng !== '') {
      setRefresh(true)
      setRefMsg('🔄 Ricalcolo rotte con Google…')
      try {
        const r    = await fetch(`/api/routes/refresh-location?id=${encodeURIComponent(savedId)}`)
        const data = await r.json()
        if (data.error) {
          setRefMsg(`⚠ Ricalcolo non riuscito: ${data.error}`)
        } else if (data.message) {
          setRefMsg(`ℹ ${data.message}`)
        } else {
          setRefMsg(`✅ Rotte aggiornate: ${data.updated} ricalcolate${data.skipped ? `, ${data.skipped} saltate (no coord)` : ''}${data.failed ? `, ${data.failed} fallite` : ''}`)
        }
      } catch {
        setRefMsg('⚠ Errore di rete nel ricalcolo rotte')
      }
      setRefresh(false)
      // chiude la sidebar dopo breve pausa per mostrare il messaggio
      setTimeout(() => onSaved(), 1800)
    } else {
      onSaved()
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error } = await supabase.from('locations').delete().eq('id', initial.id)
    setDel(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
  const fld = { marginBottom: '12px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? t.newLocation : t.editLocation}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* ID */}
            <div style={fld}>
              <label style={lbl}>Location ID</label>
              <input value={form.id} onChange={e => set('id', e.target.value.toUpperCase())}
                style={{ ...inp, fontWeight: '800', fontSize: '15px', letterSpacing: '0.05em', background: mode === 'edit' ? '#f8fafc' : 'white' }}
                placeholder="H001 / APT_PMO" required readOnly={mode === 'edit'} />
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>
                Hotels: H001, H002… · Aeroporti: APT_XXX · Stazioni: STN_XXX · Porti: PRT_XXX
              </div>
            </div>

            {/* Nome */}
            <div style={fld}>
              <label style={lbl}>Nome</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Grand Hotel Palermo" required />
            </div>

            {/* Hub toggle */}
            <div style={{ ...fld, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '9px', border: `1px solid ${form.is_hub ? '#86efac' : '#e2e8f0'}`, background: form.is_hub ? '#f0fdf4' : '#f8fafc', cursor: 'pointer' }}
              onClick={() => set('is_hub', !form.is_hub)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: form.is_hub ? '#16a34a' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: form.is_hub ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: form.is_hub ? '#15803d' : '#374151' }}>
                  {form.is_hub ? '✈ Hub (Aeroporto / Stazione / Porto)' : '🏨 Hotel / Location normale'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {form.is_hub ? 'ID inizia con APT_ STN_ PRT_ — Transfer class calcolato automaticamente' : 'Luogo di pickup/dropoff per crew'}
                </div>
              </div>
            </div>

            {/* ── Google Places Autocomplete ── */}
            <div style={{ ...fld, position: 'relative' }} ref={dropdownRef}>
              <label style={lbl}>{t.searchGoogleMaps}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={placeQuery}
                  onChange={e => setPlaceQuery(e.target.value)}
                  onFocus={() => predictions.length > 0 && setPlaceOpen(true)}
                  style={{ ...inp, paddingRight: placeLoading ? '32px' : '10px', borderColor: placeOpen ? '#2563eb' : '#e2e8f0' }}
                  placeholder="Es: Grand Hotel Palermo, Aeroporto di Palermo…"
                  autoComplete="off"
                />
                {placeLoading && (
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                )}
              </div>
              {placeError && <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '3px' }}>⚠ {placeError}</div>}
              {/* Pulsante mappa */}
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                style={{ marginTop: '6px', width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {t.chooseOnMap}
              </button>
              {placeOpen && predictions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden', marginTop: '2px' }}>
                  {predictions.map((p, i) => (
                    <button
                      key={p.place_id}
                      type="button"
                      onMouseDown={() => handleSelectPlace(p)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: i < predictions.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', marginBottom: '1px' }}>📍 {p.main_text}</div>
                      {p.secondary_text && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.secondary_text}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lat / Lng */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={lbl}>Latitudine</label>
                <input type="text" value={form.lat} onChange={e => set('lat', e.target.value)} style={inp} placeholder="38.175600" />
              </div>
              <div>
                <label style={lbl}>Longitudine</label>
                <input type="text" value={form.lng} onChange={e => set('lng', e.target.value)} style={inp} placeholder="13.091000" />
              </div>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '12px', padding: '6px 10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              ⚠ Usa il <strong>punto</strong> come separatore decimale (non la virgola). Coordinate usate per Haversine fallback.
            </div>

            {/* Default Pickup Point */}
            <div style={fld}>
              <label style={lbl}>Default Pickup Point</label>
              <input value={form.default_pickup_point} onChange={e => set('default_pickup_point', e.target.value)} style={inp} placeholder="Uscita Arrivi, Terminal 2…" />
            </div>

            {/* Delete */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Zona pericolosa</div>
                {!confirmDel ? (
                  <button type="button" onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}>
                    {t.deleteLocation}
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>{t.deleteLocationConfirm}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setCd(false)} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>{t.cancel}</button>
                      <button type="button" onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>
                        {deleting ? t.deleting : t.confirm}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          {refreshMsg && (
            <div style={{
              margin: '0 18px 12px', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
              background: refreshing ? '#eff6ff' : refreshMsg.startsWith('✅') ? '#f0fdf4' : refreshMsg.startsWith('ℹ') ? '#f0f9ff' : '#fefce8',
              border: `1px solid ${refreshing ? '#bfdbfe' : refreshMsg.startsWith('✅') ? '#86efac' : refreshMsg.startsWith('ℹ') ? '#bae6fd' : '#fde68a'}`,
              color: refreshing ? '#1d4ed8' : refreshMsg.startsWith('✅') ? '#15803d' : refreshMsg.startsWith('ℹ') ? '#0369a1' : '#92400e',
            }}>
              {refreshMsg}
            </div>
          )}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', position: 'sticky', bottom: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving || refreshing} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: (saving || refreshing) ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: (saving || refreshing) ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : refreshing ? t.recalculating : mode === 'new' ? t.add : t.saveChanges}
            </button>
          </div>
        </form>
      </div>

      {/* ── Map Picker Modal ── */}
      {mapOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ background: '#0f2340', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '14px' }}>{t.chooseOnMap}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Clicca sul punto desiderato, poi "✓ Usa questo punto"</span>
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '6px', padding: '5px 11px', cursor: 'pointer', fontSize: '15px', lineHeight: 1 }}
              >✕</button>
            </div>
          </div>
          {/* Iframe mappa */}
          <iframe
            src={`/api/places/map${form.lat && form.lng ? `?lat=${form.lat}&lng=${form.lng}` : ''}`}
            style={{ flex: 1, border: 'none', width: '100%' }}
            title="Scegli posizione su Google Maps"
          />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </>
  )
}

// ─── Row location ─────────────────────────────────────────────
function LocationRow({ loc, onEdit }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${loc.is_hub ? '#f59e0b' : '#6366f1'}`, borderRadius: '9px', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '12px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>{loc.is_hub ? '✈' : '🏨'}</span>
          <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{loc.name}</span>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '1px 7px', borderRadius: '5px', letterSpacing: '0.05em' }}>{loc.id}</span>
          {loc.is_hub && <span style={{ fontSize: '10px', fontWeight: '800', color: '#d97706', background: '#fefce8', padding: '1px 8px', borderRadius: '999px', border: '1px solid #fde68a' }}>HUB</span>}
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
          {(loc.lat && loc.lng) ? (
            <span>📍 {parseFloat(loc.lat).toFixed(4)}, {parseFloat(loc.lng).toFixed(4)}</span>
          ) : (
            <span style={{ color: '#cbd5e1' }}>📍 no coordinate</span>
          )}
          {loc.default_pickup_point && <span>🚩 {loc.default_pickup_point}</span>}
        </div>
      </div>
      <button onClick={() => onEdit(loc)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>✎ Edit</button>
    </div>
  )
}

// ─── Pagina ───────────────────────────────────────────────────
export default function LocationsPage() {
  const router = useRouter()
  const [user,      setUser]  = useState(null)
  const [locs,      setLocs]  = useState([])
  const [loading,   setLoad]  = useState(true)
  const [search,    setSearch]= useState('')
  const [filterHub, setFH]    = useState('ALL')  // ALL | HUB | HOTEL
  const [sidebarOpen, setSO]  = useState(false)
  const [mode,      setMode]  = useState('new')
  const [editItem,  setEdit]  = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) await supabase.from('user_roles').upsert({ user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' }, { onConflict: 'user_id,production_id', ignoreDuplicates: true })
      setUser(user)
    })
  }, [])

  const load = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoad(true)
    const { data } = await supabase.from('locations').select('*').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name')
    setLocs(data || [])
    setLoad(false)
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  function openNew()    { setMode('new');  setEdit(null); setSO(true) }
  function openEdit(l)  { setMode('edit'); setEdit(l);    setSO(true) }
  function onSaved()    { setSO(false); load() }

  const filtered = locs.filter(l => {
    if (filterHub === 'HUB'   && !l.is_hub) return false
    if (filterHub === 'HOTEL' &&  l.is_hub) return false
    if (search) {
      const q = search.toLowerCase()
      if (!l.name.toLowerCase().includes(q) && !(l.id || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const hubs   = locs.filter(l => l.is_hub).length
  const hotels = locs.filter(l => !l.is_hub).length

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <Navbar currentPath="/dashboard/locations" />

      {/* Toolbar */}
      <PageHeader
        left={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📍</span>
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>Locations</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{locs.length} totale</span>
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#d97706', background: '#fefce8', border: '1px solid #fde68a' }}>{hubs} hub</span>
            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe' }}>{hotels} hotel</span>
          </div>
        </div>}
        right={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="text" placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', width: '160px' }} />
          {['ALL', 'HUB', 'HOTEL'].map(s => (
            <button key={s} onClick={() => setFH(s)}
              style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(filterHub === s ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
              {s}
            </button>
          ))}
          <button onClick={load} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>↻</button>
          <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
            + Nuova Location
          </button>
        </div>}
      />

      {/* Body */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', transition: 'margin-right 0.25s', marginRight: sidebarOpen ? `${SIDEBAR_W}px` : 'auto' }}>
        {!PRODUCTION_ID && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>⚠ NEXT_PUBLIC_PRODUCTION_ID non impostato</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📍</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>{locs.length === 0 ? 'Nessuna location' : 'Nessun risultato'}</div>
            {locs.length === 0 && <button onClick={openNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '12px' }}>+ Aggiungi</button>}
          </div>
        ) : (
          <>
            {/* Hubs section */}
            {filtered.some(l => l.is_hub) && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#d97706', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ✈ HUBS <div style={{ flex: 1, height: '1px', background: '#fde68a' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filtered.filter(l => l.is_hub).map(l => <LocationRow key={l.id} loc={l} onEdit={openEdit} />)}
                </div>
              </div>
            )}
            {/* Hotels section */}
            {filtered.some(l => !l.is_hub) && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#6366f1', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🏨 HOTELS &amp; LOCATIONS <div style={{ flex: 1, height: '1px', background: '#c7d2fe' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filtered.filter(l => !l.is_hub).map(l => <LocationRow key={l.id} loc={l} onEdit={openEdit} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <LocationSidebar open={sidebarOpen} mode={mode} initial={editItem} onClose={() => setSO(false)} onSaved={onSaved} />
    </div>
  )
}
