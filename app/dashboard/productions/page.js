'use client'
/**
 * /dashboard/productions
 * Phase 5 — Multi-production + Production Switcher
 *
 * - Lists productions the user has access to
 * - Allows creating new productions with all transport list header fields
 * - Logo upload via Supabase Storage (bucket: production-logos)
 * - Switcher: sets active production in localStorage → all sub-pages use that value
 * - Shows current active production
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { switchProduction, getProductionId, clearProductionOverride } from '../../../lib/production'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const EMPTY_FORM = {
  name: '', slug: '',
  // Key creatives
  director: '', producer: '',
  // Production team
  production_manager: '', production_manager_phone: '',
  production_coordinator: '', production_coordinator_phone: '',
  // Transportation team
  transportation_coordinator: '', transportation_coordinator_phone: '',
  transportation_captain: '', transportation_captain_phone: '',
  production_office_phone: '',
  // Set & Basecamp
  set_location: '', set_address: '', basecamp: '',
  // Schedule
  general_call_time: '', shoot_day: '', revision: '1',
}

const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
function sectionTitle(icon, title) {
  return (
    <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '5px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
      <span>{icon}</span> {title}
    </div>
  )
}

function getHubIcon(hub) {
  const s = ((hub.id || '') + ' ' + (hub.name || '')).toUpperCase()
  if (/APT|AIRPORT|AEROPORTO/.test(s))                   return '✈️'
  if (/STN|TRAIN|STAZIONE|CENTRALE|FERROVIARIA/.test(s)) return '🚂'
  if (/PORT|PORTO|FERRY/.test(s))                        return '⛴️'
  return '📍'
}

const HUB_EMPTY = { id: '', name: '', lat: '', lng: '', default_pickup_point: '' }

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
      .select('id, name, lat, lng, default_pickup_point')
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
      .select('id, name')
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
      setForm(f => ({
        ...f,
        name: data.name || f.name || p.main_text,
        lat:  data.lat != null ? String(data.lat) : f.lat,
        lng:  data.lng != null ? String(data.lng) : f.lng,
        default_pickup_point: data.address || f.default_pickup_point,
      }))
      setPlaceQuery(p.description)
    } catch {}
    setPlaceLoading(false)
  }

  async function addExistingHub(loc) {
    setSaving(true)
    await supabase.from('locations').update({ is_hub: true }).eq('id', loc.id)
    setSearch(''); setResults([])
    setSaving(false)
  }

  async function removeHub(loc) {
    if (!confirm(`Remove "${loc.name}" as hub?`)) return
    setSaving(true)
    await supabase.from('locations').update({ is_hub: false }).eq('id', loc.id)
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
        id:   form.id.trim().toUpperCase(),
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
      }).eq('id', showForm.id)
      if (error) { setFormError(error.message); setFormSaving(false); return }
    }
    setFormSaving(false)
    setShowForm(false)
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
  }

  function openNew() {
    setForm({ ...HUB_EMPTY })
    setPlaceQuery('')
    setFormError(null)
    setShowForm('new')
  }

  function openEdit(hub) {
    setForm({ id: hub.id, name: hub.name, lat: hub.lat ?? '', lng: hub.lng ?? '', default_pickup_point: hub.default_pickup_point || '' })
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
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <span style={{ fontSize: '16px' }}>{getHubIcon(h)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#1d4ed8' }}>{h.name}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{h.id}{h.lat && h.lng ? ` · ${parseFloat(h.lat).toFixed(4)}, ${parseFloat(h.lng).toFixed(4)}` : ' · no coordinates'}</div>
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
              <label style={lbl2}>ID *</label>
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
                <div key={r.id} onClick={() => addExistingHub(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  {getHubIcon(r)} {r.name} <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Shared form fields (used in both create and edit) ──
function FormFields({ values, onChange, isEdit = false, productionId = null }) {
  const t = useT()
  const s = (k, v) => onChange(k, v)
  return (
    <>
      {/* Identity */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '4px' }}>
        <div>
          <label style={lbl}>{t.productionsNameLabel}</label>
          <input value={values.name}
            onChange={e => { s('name', e.target.value); if (!isEdit) s('slug', slugify(e.target.value)) }}
            style={inp} required placeholder="e.g. Palermo 2026" autoFocus={!isEdit} />
        </div>
        <div>
          <label style={lbl}>{t.productionsSlugLabel}</label>
          <input value={values.slug} onChange={e => s('slug', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} placeholder="auto" />
        </div>
      </div>

      {/* Schedule */}
      {sectionTitle('🗓', t.productionsScheduleSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsCallTimeLabel}</label>
          <input type="time" value={values.general_call_time} onChange={e => s('general_call_time', e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{t.productionsShootDayLabel}</label>
          <input type="number" value={values.shoot_day} onChange={e => s('shoot_day', e.target.value)} style={inp} placeholder="42" min="1" />
        </div>
        <div>
          <label style={lbl}>{t.productionsRevisionLabel}</label>
          <input type="number" value={values.revision} onChange={e => s('revision', e.target.value)} style={inp} placeholder="1" min="1" />
        </div>
      </div>

      {/* Key Creatives */}
      {sectionTitle('🎭', t.productionsKeyCreativesSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsDirectorLabel}</label>
          <input value={values.director} onChange={e => s('director', e.target.value)} style={inp} placeholder="e.g. John Smith" />
        </div>
        <div>
          <label style={lbl}>{t.productionsProducerLabel}</label>
          <input value={values.producer} onChange={e => s('producer', e.target.value)} style={inp} placeholder="e.g. Jane Doe" />
        </div>
      </div>

      {/* Production Team */}
      {sectionTitle('👥', t.productionsProdTeamSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsPmNameLabel}</label>
          <input value={values.production_manager} onChange={e => s('production_manager', e.target.value)} style={inp} placeholder="e.g. Robert Brown" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPmPhoneLabel}</label>
          <input value={values.production_manager_phone} onChange={e => s('production_manager_phone', e.target.value)} style={inp} placeholder="+39 320 111 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPcNameLabel}</label>
          <input value={values.production_coordinator} onChange={e => s('production_coordinator', e.target.value)} style={inp} placeholder="e.g. Maria Rossi" />
        </div>
        <div>
          <label style={lbl}>{t.productionsPcPhoneLabel}</label>
          <input value={values.production_coordinator_phone} onChange={e => s('production_coordinator_phone', e.target.value)} style={inp} placeholder="+39 320 000 0000" />
        </div>
      </div>

      {/* Transportation Team */}
      {sectionTitle('🚌', t.productionsTranspTeamSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsTcNameLabel}</label>
          <input value={values.transportation_coordinator} onChange={e => s('transportation_coordinator', e.target.value)} style={inp} placeholder="e.g. Daniele Contino" />
        </div>
        <div>
          <label style={lbl}>{t.productionsTcPhoneLabel}</label>
          <input value={values.transportation_coordinator_phone} onChange={e => s('transportation_coordinator_phone', e.target.value)} style={inp} placeholder="+39 333 000 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsCaptNameLabel}</label>
          <input value={values.transportation_captain} onChange={e => s('transportation_captain', e.target.value)} style={inp} placeholder="e.g. Marco Bianchi" />
        </div>
        <div>
          <label style={lbl}>{t.productionsCaptPhoneLabel}</label>
          <input value={values.transportation_captain_phone} onChange={e => s('transportation_captain_phone', e.target.value)} style={inp} placeholder="+39 347 000 0000" />
        </div>
        <div>
          <label style={lbl}>{t.productionsOfficePhoneLabel}</label>
          <input value={values.production_office_phone} onChange={e => s('production_office_phone', e.target.value)} style={inp} placeholder="+39 091 000 0000" />
        </div>
      </div>

      {/* Set & Basecamp */}
      {sectionTitle('📍', t.productionsSetBasecampSection)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>{t.productionsSetNameLabel}</label>
          <input value={values.set_location} onChange={e => s('set_location', e.target.value)} style={inp} placeholder="e.g. Cinecitta Studio 5" />
        </div>
        <div>
          <label style={lbl}>{t.productionsSetAddressLabel}</label>
          <input value={values.set_address} onChange={e => s('set_address', e.target.value)} style={inp} placeholder="e.g. Via Tuscolana 1055" />
        </div>
        <div>
          <label style={lbl}>{t.productionsBasecampLabel}</label>
          <input value={values.basecamp} onChange={e => s('basecamp', e.target.value)} style={inp} placeholder="e.g. Parking Area B" />
        </div>
      </div>

      {isEdit && productionId && <HubLocationsSection productionId={productionId} />}
    </>
  )
}

export default function ProductionsPage() {
  const t = useT()
  const router = useRouter()
  const [user,         setUser]         = useState(null)
  const [productions,  setProductions]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeId,     setActiveId]     = useState('')
  const [creating,     setCreating]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(null)
  const [editId,       setEditId]       = useState(null)
  const [editForm,     setEditForm]     = useState({ ...EMPTY_FORM })
  const [editLogoFile, setEditLogoFile] = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState(null)
  const [editSaving,   setEditSaving]   = useState(false)
  const [exportingId,  setExportingId]  = useState(null)
  const [deleteTarget,         setDeleteTarget]         = useState(null)
  const [deleteConfirmName,    setDeleteConfirmName]    = useState('')
  const [deleteArchiveChecked, setDeleteArchiveChecked] = useState(false)
  const [deleting,             setDeleting]             = useState(false)
  const fileInputRef   = useRef(null)
  const editFileRef    = useRef(null)

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    setActiveId(getProductionId())
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      loadProductions()
    })
  }, [])

  async function loadProductions() {
    setLoading(true)
    const res = await fetch('/api/productions')
    const json = await res.json()
    setProductions(json.productions || [])
    setLoading(false)
  }

  function handleLogoChange(e, isEdit = false) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (isEdit) {
      setEditLogoFile(file)
      setEditLogoPreview(url)
    } else {
      setLogoFile(file)
      setLogoPreview(url)
    }
  }

  async function uploadLogo(file, productionId) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('productionId', productionId)
    const res  = await fetch('/api/productions/upload-logo', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json.logo_url
  }

  async function handleCreate(e) {
    e.preventDefault(); setError(null)
    if (!form.name.trim()) { setError('Production name is required'); return }
    setSaving(true)
    try {
      const res  = await fetch('/api/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug || slugify(form.name),
          director: form.director.trim(),
          producer: form.producer.trim(),
          production_manager: form.production_manager.trim(),
          production_manager_phone: form.production_manager_phone.trim(),
          production_coordinator: form.production_coordinator.trim(),
          production_coordinator_phone: form.production_coordinator_phone.trim(),
          transportation_coordinator: form.transportation_coordinator.trim(),
          transportation_coordinator_phone: form.transportation_coordinator_phone.trim(),
          transportation_captain: form.transportation_captain.trim(),
          transportation_captain_phone: form.transportation_captain_phone.trim(),
          production_office_phone: form.production_office_phone.trim(),
          set_location: form.set_location.trim(),
          set_address: form.set_address.trim(),
          basecamp: form.basecamp.trim(),
          general_call_time: form.general_call_time || null,
          shoot_day: form.shoot_day ? parseInt(form.shoot_day) : null,
          revision: form.revision ? parseInt(form.revision) : 1,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setSaving(false); return }

      if (logoFile) {
        try {
          const logoUrl = await uploadLogo(logoFile, json.production.id)
          await fetch('/api/productions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.production.id, logo_url: logoUrl }),
          })
        } catch (logoErr) {
          setError('⚠️ Logo upload failed: ' + logoErr.message)
        }
      }

      setForm({ ...EMPTY_FORM })
      setLogoFile(null); setLogoPreview(null)
      setCreating(false)
      loadProductions()
      if (productions.length === 0) switchProduction(json.production.id)
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(e) {
    e.preventDefault(); setEditSaving(true)
    try {
      let logo_url = undefined
      if (editLogoFile) {
        try {
          logo_url = await uploadLogo(editLogoFile, editId)
        } catch (logoErr) {
          alert('⚠️ Logo upload failed: ' + logoErr.message)
        }
      }
      const body = {
        id: editId,
        name: editForm.name,
        slug: editForm.slug,
        director: editForm.director,
        producer: editForm.producer,
        production_manager: editForm.production_manager,
        production_manager_phone: editForm.production_manager_phone,
        production_coordinator: editForm.production_coordinator,
        production_coordinator_phone: editForm.production_coordinator_phone,
        transportation_coordinator: editForm.transportation_coordinator,
        transportation_coordinator_phone: editForm.transportation_coordinator_phone,
        transportation_captain: editForm.transportation_captain,
        transportation_captain_phone: editForm.transportation_captain_phone,
        production_office_phone: editForm.production_office_phone,
        set_location: editForm.set_location,
        set_address: editForm.set_address,
        basecamp: editForm.basecamp,
        general_call_time: editForm.general_call_time || null,
        shoot_day: editForm.shoot_day ? parseInt(editForm.shoot_day) : null,
        revision: editForm.revision ? parseInt(editForm.revision) : 1,
      }
      if (logo_url !== undefined) body.logo_url = logo_url

      const res = await fetch('/api/productions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setEditId(null)
        setEditLogoFile(null)
        setEditLogoPreview(null)
        loadProductions()
      }
    } finally {
      setEditSaving(false)
    }
  }

  function handleSwitch(id) {
    switchProduction(id)
  }

  async function handleExport(prod) {
    setExportingId(prod.id)
    try {
      const res = await fetch(`/api/productions/export?id=${prod.id}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(`Export failed: ${json.error || res.statusText}`)
        return
      }
      const blob = await res.blob()
      const slug     = prod.slug || prod.id
      const date     = new Date().toISOString().slice(0, 10)
      const filename = `captaindispatch-${slug}-${date}.json`
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export error: ${e.message}`)
    } finally {
      setExportingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res  = await fetch(`/api/productions?id=${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(`Delete failed: ${json.error}`); return }
      if (deleteTarget.id === activeId) {
        clearProductionOverride()
        setActiveId('')
      }
      setDeleteTarget(null)
      setDeleteConfirmName('')
      setDeleteArchiveChecked(false)
      loadProductions()
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(prod) {
    setEditId(prod.id)
    setEditForm({
      name:                             prod.name                             || '',
      slug:                             prod.slug                             || '',
      director:                         prod.director                         || '',
      producer:                         prod.producer                         || '',
      production_manager:               prod.production_manager               || '',
      production_manager_phone:         prod.production_manager_phone         || '',
      production_coordinator:           prod.production_coordinator           || '',
      production_coordinator_phone:     prod.production_coordinator_phone     || '',
      transportation_coordinator:       prod.transportation_coordinator       || '',
      transportation_coordinator_phone: prod.transportation_coordinator_phone || '',
      transportation_captain:           prod.transportation_captain           || '',
      transportation_captain_phone:     prod.transportation_captain_phone     || '',
      production_office_phone:          prod.production_office_phone          || '',
      set_location:                     prod.set_location                     || '',
      set_address:                      prod.set_address                      || '',
      basecamp:                         prod.basecamp                         || '',
      general_call_time:                prod.general_call_time                || '',
      shoot_day:                        prod.shoot_day != null ? String(prod.shoot_day) : '',
      revision:                         prod.revision  != null ? String(prod.revision)  : '1',
    })
    setEditLogoFile(null)
    setEditLogoPreview(prod.logo_url || null)
  }

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/productions" />

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{t.productionsTitle}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>{t.productionsDesc}</p>
        </div>

        {/* Active production banner */}
        {activeId && (() => {
          const active = productions.find(p => p.id === activeId)
          return active ? (
            <div style={{ background: '#eff6ff', border: '2px solid #2563eb', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              {active.logo_url ? (
                <img src={active.logo_url} alt="logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', padding: '4px' }} />
              ) : (
                <span style={{ fontSize: '28px' }}>✅</span>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', letterSpacing: '0.07em' }}>{t.productionsActiveLabel}</div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{active.name}</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {active.director && <span>🎬 <strong>Director:</strong> {active.director}</span>}
                  {active.producer && <span>👤 <strong>Producer:</strong> {active.producer}</span>}
                  {active.general_call_time && <span>⏰ <strong>Call:</strong> {active.general_call_time.slice(0,5)}</span>}
                  {active.shoot_day && <span>📅 <strong>Day:</strong> {active.shoot_day}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>ID: {active.id}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#1d4ed8', color: 'white' }}>{active.role}</span>
                <a href="/dashboard/lists" style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700', textDecoration: 'none' }}>{t.productionsViewTransportList}</a>
              </div>
            </div>
          ) : null
        })()}

        {/* Productions list */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{t.productionsYours} ({productions.length})</div>
            <button onClick={() => { setCreating(true); setError(null) }}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
              {t.productionsNewBtn}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>{t.loading}</div>
          ) : productions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
              <div style={{ color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>{t.productionsNone}</div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>{t.productionsNoneDesc}</div>
            </div>
          ) : (
            <div>
              {productions.map((prod, i) => {
                const isActive  = prod.id === activeId
                const isEditing = editId === prod.id
                return (
                  <div key={prod.id} style={{ borderBottom: i < productions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    {!isEditing ? (
                      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', background: isActive ? '#f8fbff' : 'white' }}>
                        {/* Logo or icon */}
                        {prod.logo_url ? (
                          <img src={prod.logo_url} alt="logo" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎬</div>
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{prod.name}</span>
                            {isActive && <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#22c55e', color: 'white', fontSize: '10px', fontWeight: '800' }}>ACTIVE</span>}
                            <span style={{ padding: '2px 8px', borderRadius: '5px', background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '700' }}>{prod.role}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
                            {prod.director && <span>🎬 {prod.director}</span>}
                            {prod.producer && <span>👤 {prod.producer}</span>}
                            {prod.general_call_time && <span>⏰ {prod.general_call_time.slice(0,5)}</span>}
                            {prod.shoot_day && <span>📅 Day {prod.shoot_day}</span>}
                            {prod.set_location && <span>📍 {prod.set_location}</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                            slug: {prod.slug}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          {!isActive && (
                            <button onClick={() => handleSwitch(prod.id)}
                              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                              {t.productionsActivateBtn}
                            </button>
                          )}
                          {['CAPTAIN', 'ADMIN'].includes(prod.role) && (
                            <button
                              onClick={() => handleExport(prod)}
                              disabled={exportingId === prod.id}
                              title="Download archive JSON"
                              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: exportingId === prod.id ? '#94a3b8' : '#059669', fontSize: '12px', cursor: exportingId === prod.id ? 'default' : 'pointer', fontWeight: '700' }}>
                              {exportingId === prod.id ? '⏳' : '📥'}
                            </button>
                          )}
                          <button onClick={() => openEdit(prod)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                            {t.productionsEditBtn}
                          </button>
                          {['CAPTAIN', 'ADMIN'].includes(prod.role) && (
                            <button
                              onClick={() => { setDeleteTarget(prod); setDeleteConfirmName(''); setDeleteArchiveChecked(false) }}
                              title={t.productionsDeleteBtn}
                              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontWeight: '700' }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ── Inline edit form (full fields) ── */
                      <form onSubmit={handleEdit} style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '2px solid #2563eb' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>✎ Edit Production — {prod.name}</div>

                        {/* Logo upload */}
                        <div style={{ marginBottom: '14px' }}>
                          <label style={lbl}>{t.productionsLogoLabel}</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            {editLogoPreview ? (
                              <img src={editLogoPreview} alt="logo preview" style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', padding: '6px' }} />
                            ) : (
                              <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🎬</div>
                            )}
                            <div>
                              <button type="button" onClick={() => editFileRef.current?.click()}
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                                {t.productionsChooseLogo}
                              </button>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t.productionsLogoHint}</div>
                              <input ref={editFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, true)} />
                            </div>
                          </div>
                        </div>

                        <FormFields values={editForm} onChange={setE} isEdit={true} productionId={prod.id} />

                        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                          <button type="button" onClick={() => { setEditId(null); setEditLogoFile(null); setEditLogoPreview(null) }}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                            ✕ {t.cancel}
                          </button>
                          <button type="submit" disabled={editSaving}
                            style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', background: editSaving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}>
                            {editSaving ? t.saving : t.productionsSaveChanges}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Create new production */}
        {creating && (
          <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #2563eb', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', marginBottom: '18px' }}>{t.productionsNewTitle}</div>
            <form onSubmit={handleCreate}>

              {/* Logo upload */}
              <div style={{ marginBottom: '18px' }}>
                <label style={lbl}>{t.productionsLogoLabel}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {logoPreview ? (
                    <img src={logoPreview} alt="logo preview" style={{ width: '72px', height: '72px', objectFit: 'contain', borderRadius: '12px', background: 'white', border: '1px solid #e2e8f0', padding: '6px' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', borderRadius: '12px', background: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', cursor: 'pointer' }}
                      onClick={() => fileInputRef.current?.click()}>
                      🎬
                    </div>
                  )}
                  <div>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      {t.productionsUploadLogo}
                    </button>
                    {logoFile && <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px', fontWeight: '600' }}>✓ {logoFile.name}</div>}
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t.productionsLogoHint}</div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e, false)} />
                  </div>
                </div>
              </div>

              <FormFields values={form} onChange={set} isEdit={false} />

              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#dc2626', fontSize: '12px', marginTop: '14px', marginBottom: '4px' }}>❌ {error}</div>}

              <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                <button type="button" onClick={() => { setCreating(false); setError(null); setLogoFile(null); setLogoPreview(null); setForm({ ...EMPTY_FORM }) }}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  {t.cancel}
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>
                  {saving ? t.productionsCreatingBtn : t.productionsCreate}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Info box */}
        <div style={{ marginTop: '8px', padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #f59e0b', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
          <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>{t.productionsInfoTitle}</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>{t.productionsInfoLine1}</li>
            <li>{t.productionsInfoLine2}</li>
            <li>{t.productionsInfoLine3}</li>
            <li>{t.productionsInfoLine4}</li>
          </ul>
        </div>

      </div>

      {/* ── S27: Delete Production Modal ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,64,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '28px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '900', fontSize: '17px', color: '#991b1b' }}>{t.productionsDeleteModalTitle}</div>
                <div style={{ fontSize: '14px', color: '#dc2626', fontWeight: '700', marginTop: '3px' }}>{deleteTarget.name}</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 12px', lineHeight: 1.6 }}>
                {t.productionsDeleteWarning}
              </p>

              {/* Data list */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#991b1b', lineHeight: 1.9 }}>
                {t.productionsDeleteDataItems.split(' · ').map((item, i) => (
                  <div key={i}>🗑 {item}</div>
                ))}
              </div>

              {/* Download archive CTA */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '22px' }}>📥</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#166534', fontWeight: '700', marginBottom: '3px' }}>{t.productionsDeleteDownloadFirst}</div>
                  <div style={{ fontSize: '11px', color: '#15803d' }}>JSON backup — trips, crew, vehicles, locations</div>
                </div>
                <button
                  onClick={() => handleExport(deleteTarget)}
                  disabled={exportingId === deleteTarget.id}
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #22c55e', background: 'white', color: '#16a34a', fontSize: '12px', fontWeight: '700', cursor: exportingId === deleteTarget.id ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {exportingId === deleteTarget.id ? '⏳' : '📥'}
                </button>
              </div>

              {/* Checkbox archivio scaricato */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px', padding: '10px 14px', background: deleteArchiveChecked ? '#f0fdf4' : '#f8fafc', border: `1px solid ${deleteArchiveChecked ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '8px' }}>
                <input
                  type="checkbox"
                  checked={deleteArchiveChecked}
                  onChange={e => setDeleteArchiveChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: '600' }}>{t.productionsDeleteArchiveCheck}</span>
              </label>

              {/* Conferma nome */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '6px' }}>{t.productionsDeleteNameLabel}</label>
                <input
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={deleteTarget.name}
                  autoComplete="off"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${deleteConfirmName === deleteTarget.name && deleteConfirmName ? '#dc2626' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); setDeleteArchiveChecked(false) }}
                style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                {t.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmName !== deleteTarget.name || !deleteArchiveChecked}
                style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: (deleting || deleteConfirmName !== deleteTarget.name || !deleteArchiveChecked) ? '#cbd5e1' : '#dc2626', color: 'white', fontSize: '13px', cursor: (deleting || deleteConfirmName !== deleteTarget.name || !deleteArchiveChecked) ? 'default' : 'pointer', fontWeight: '800' }}>
                {deleting ? t.productionsDeleteDeletingBtn : t.productionsDeleteConfirmBtn}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
