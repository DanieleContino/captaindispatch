'use client'
/**
 * /dashboard/bridge — ⚓ Captain Bridge
 * Admin panel: pending users approval + invite codes management.
 * Only accessible to users with CAPTAIN or ADMIN role.
 */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { getProductionId } from '../../../lib/production'
import { ImportModal } from '../../../lib/ImportModal'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { useOnlinePresence, getPageLabel, getInitials, getAvatarColor, fmtOnlineSince, getRoleStyle } from '../../../lib/useOnlinePresence'

// ── helpers ──────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}
function copyText(t) {
  navigator.clipboard?.writeText(t).catch(() => {})
}

const ROLES = ['MANAGER', 'PRODUCTION', 'CAPTAIN']

// ── styles ───────────────────────────────────────────────
const card  = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px' }
const hdr   = { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const inp   = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const sel   = { ...inp, cursor: 'pointer' }
const lbl   = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }
const btnPrimary  = { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#0f2340', color: 'white', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }
const btnSecondary= { padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
const btnGreen    = { ...btnPrimary, background: '#16a34a' }
const btnRed      = { ...btnPrimary, background: '#dc2626' }

// ── Crew Duplicate Detection helpers ─────────────────────

const CREW_MERGE_FIELDS = [
  { key: 'full_name',      label: 'Full Name' },
  { key: 'department',     label: 'Department' },
  { key: 'email',          label: 'Email' },
  { key: 'phone',          label: 'Phone' },
  { key: 'hotel_id',       label: 'Hotel' },
  { key: 'hotel_status',   label: 'Hotel Status' },
  { key: 'travel_status',  label: 'Travel Status' },
  { key: 'arrival_date',   label: 'Arrival Date' },
  { key: 'departure_date', label: 'Departure Date' },
  { key: 'notes',          label: 'Notes' },
]

function crewWords(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ')
    .split(' ').filter(w => w.length > 1)
}

function crewSimilarity(a, b) {
  const wa = crewWords(a), wb = crewWords(b)
  if (!wa.length || !wb.length) return 0
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  return shorter.filter(w => longer.includes(w)).length / shorter.length
}

function findDupGroups(crew) {
  const merged = new Set()
  const groups = []
  for (let i = 0; i < crew.length; i++) {
    if (merged.has(crew[i].id)) continue
    const group = [crew[i]]
    merged.add(crew[i].id)
    for (let j = i + 1; j < crew.length; j++) {
      if (merged.has(crew[j].id)) continue
      if (crewSimilarity(crew[i].full_name, crew[j].full_name) >= 0.85) {
        group.push(crew[j])
        merged.add(crew[j].id)
      }
    }
    if (group.length > 1) groups.push(group)
  }
  return groups
}

function defaultFieldChoices(selCrew) {
  const choices = {}
  CREW_MERGE_FIELDS.forEach(({ key }) => {
    const withVal = selCrew.filter(c => c[key] != null && c[key] !== '')
    choices[key] = withVal.length > 0 ? withVal[0].id : selCrew[0].id
  })
  return choices
}

// ── ResultPreview (merge modal) ───────────────────────────
function ResultPreview({ selCrew, fieldChoices, hotelLabel }) {
  const [open, setOpen] = useState(true)
  const getVal = (key) => {
    const src = selCrew.find(c => c.id === fieldChoices[key])
    return src?.[key] ?? null
  }
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
        <span>👁 Preview of merged record</span>
        <span style={{ color: '#94a3b8', fontSize: '10px' }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {CREW_MERGE_FIELDS.map(({ key, label: fLabel }) => {
            const val = getVal(key)
            if (!val) return null
            return (
              <div key={key} style={{ fontSize: '12px', display: 'flex', gap: '4px', minWidth: 0 }}>
                <span style={{ color: '#94a3b8', flexShrink: 0 }}>{fLabel}:</span>
                <strong style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {key === 'hotel_id' ? hotelLabel(val) : String(val)}
                </strong>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CrewDuplicatesWidget ──────────────────────────────────
function CrewDuplicatesWidget({ productionId, locations, onMerged }) {
  const [dupeGroups, setDupeGroups] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [checked,    setChecked]    = useState({})   // { groupIdx: Set<crewId> }
  const [mergeCtx,   setMergeCtx]   = useState(null) // { group, selectedIds, selCrew }

  // Merge panel state
  const [primaryId,       setPrimaryId]       = useState(null)
  const [fieldChoices,    setFieldChoices]     = useState({})
  const [multiStay,       setMultiStay]        = useState({}) // { arrival_date: bool, departure_date: bool }
  const [saving,          setSaving]           = useState(false)
  const [mergeError,      setMergeError]       = useState(null)
  const [dismissedGroups, setDismissedGroups]  = useState(new Set())

  // Load dismissed groups from localStorage
  useEffect(() => {
    if (!productionId) return
    try {
      const stored = JSON.parse(localStorage.getItem(`dismissed_dupes_${productionId}`) || '[]')
      setDismissedGroups(new Set(stored))
    } catch {}
  }, [productionId])

  const hotelLabel = id => locations?.find(l => l.id === id)?.name || id || '—'

  const load = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    const { data } = await supabase
      .from('crew')
      .select('id, full_name, department, hotel_id, hotel_status, travel_status, arrival_date, departure_date, email, phone, notes, created_at')
      .eq('production_id', productionId)
      .order('created_at', { ascending: true })
    setLoading(false)
    const crew = data || []
    setDupeGroups(findDupGroups(crew))
    setChecked({})
  }, [productionId])

  useEffect(() => { load() }, [load])

  function toggleCheck(gi, crewId) {
    setChecked(prev => {
      const s = new Set(prev[gi] || [])
      s.has(crewId) ? s.delete(crewId) : s.add(crewId)
      return { ...prev, [gi]: s }
    })
  }

  function dismissGroup(group) {
    const key = group.map(c => c.id).sort().join(',')
    const newSet = new Set([...dismissedGroups, key])
    setDismissedGroups(newSet)
    try { localStorage.setItem(`dismissed_dupes_${productionId}`, JSON.stringify([...newSet])) } catch {}
  }

  function openMerge(gi, group) {
    const sel = checked[gi] || new Set()
    const selCrew = group.filter(c => sel.has(c.id))
    if (selCrew.length < 2) return
    setPrimaryId(selCrew[0].id)
    setFieldChoices(defaultFieldChoices(selCrew))
    setMultiStay({})
    setMergeCtx({ group, selectedIds: [...sel], selCrew })
    setMergeError(null)
  }

  async function handleMerge() {
    if (!mergeCtx) return
    const duplicate_ids = mergeCtx.selectedIds.filter(id => id !== primaryId)
    if (!duplicate_ids.length) { setMergeError('Need at least 2 crew selected'); return }

    const merged_data = {}
    CREW_MERGE_FIELDS.forEach(({ key }) => {
      if (multiStay[key]) {
        // For multi-stay fields keep the primary record's existing value
        const primary = mergeCtx.selCrew.find(c => c.id === primaryId)
        merged_data[key] = primary?.[key] ?? null
      } else {
        const src = mergeCtx.selCrew.find(c => c.id === fieldChoices[key])
        merged_data[key] = src?.[key] ?? null
      }
    })

    setSaving(true); setMergeError(null)
    try {
      const res = await fetch('/api/crew/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ production_id: productionId, primary_id: primaryId, duplicate_ids, merged_data }),
      })
      const json = await res.json()
      if (!res.ok) { setMergeError(json.error || 'Merge failed'); setSaving(false); return }

      // Multi-stay mode: create crew_stays for both date ranges
      if (Object.values(multiStay).some(Boolean)) {
        const staysToCreate = mergeCtx.selCrew
          .filter(c => c.arrival_date || c.departure_date)
          .map(c => ({ crew_id: primaryId, production_id: productionId, hotel_id: c.hotel_id || null, arrival_date: c.arrival_date || null, departure_date: c.departure_date || null }))
        if (staysToCreate.length > 0) {
          await supabase.from('crew_stays').upsert(staysToCreate, { ignoreDuplicates: true })
        }
      }

      setSaving(false)
      setMergeCtx(null)
      load()
      onMerged?.()
    } catch (e) { setMergeError(e.message); setSaving(false) }
  }

  if (loading || dupeGroups.length === 0) return null

  return (
    <div style={{ ...card, borderLeft: '4px solid #f59e0b', marginBottom: '20px' }}>
      {/* Header */}
      <div style={hdr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>⚠️ Possible Duplicate Crew</span>
          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: '700' }}>
            {dupeGroups.length} {dupeGroups.length === 1 ? 'group' : 'groups'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {dismissedGroups.size > 0 && (
            <button onClick={() => {
              setDismissedGroups(new Set())
              try { localStorage.removeItem(`dismissed_dupes_${productionId}`) } catch {}
              load()
            }} style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px', color: '#7c3aed', borderColor: '#c4b5fd' }}
              title="Mostra i gruppi nascosti con 'Not a duplicate'">
              ↺ Show dismissed ({dismissedGroups.size})
            </button>
          )}
          <button onClick={load} style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>↻ Refresh</button>
        </div>
      </div>

      {/* Groups list */}
      <div style={{ paddingBottom: '8px' }}>
        {dupeGroups.filter(group => !dismissedGroups.has(group.map(c => c.id).sort().join(','))).map((group, gi) => {
          const sel = checked[gi] || new Set()
          const sim = Math.round(crewSimilarity(group[0].full_name, group[1].full_name) * 100)
          return (
            <div key={gi} style={{ borderBottom: gi < dupeGroups.length - 1 ? '1px solid #f1f5f9' : 'none', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span>Group {gi + 1}</span>
                <span style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>{sim}% match</span>
              </div>

              {group.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '7px 8px', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', background: sel.has(c.id) ? '#fffbeb' : 'transparent', border: `1px solid ${sel.has(c.id) ? '#fde68a' : 'transparent'}` }}>
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleCheck(gi, c.id)} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>{c.id}</span>
                      {c.full_name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {c.department    && <span>🏷️ {c.department}</span>}
                      {c.hotel_id      && <span>🏨 {hotelLabel(c.hotel_id)}</span>}
                      {c.travel_status && <span>✈️ {c.travel_status}</span>}
                      {c.email         && <span>✉️ {c.email}</span>}
                      {c.phone         && <span>📞 {c.phone}</span>}
                    </div>
                  </div>
                </label>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => dismissGroup(group)}
                  style={{ fontSize: '11px', color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', padding: '4px 10px' }}
                  title="This is the same person with different stay dates — not a real duplicate">
                  ✕ Not a duplicate (multi-stay)
                </button>
                <button
                  onClick={() => openMerge(gi, group)}
                  disabled={sel.size < 2}
                  style={{ ...btnPrimary, background: sel.size < 2 ? '#94a3b8' : '#f59e0b', fontSize: '12px', padding: '6px 14px', cursor: sel.size < 2 ? 'not-allowed' : 'pointer' }}>
                  🔀 Merge selected{sel.size >= 2 ? ` (${sel.size})` : ''}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Merge Modal ────────────────────────────────── */}
      {mergeCtx && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,35,64,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

            {/* Modal header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>🔀 Merge Crew Records</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Choose primary record and field values to keep</div>
              </div>
              <button onClick={() => setMergeCtx(null)} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* ── Step 1: Primary record selector ── */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ ...lbl, marginBottom: '8px' }}>1 — Choose the primary record (this one will be KEPT)</div>
                {mergeCtx.selCrew.map((c, idx) => (
                  <div key={c.id} style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${primaryId === c.id ? '#16a34a' : '#e2e8f0'}`, background: primaryId === c.id ? '#f0fdf4' : 'white' }}>
                      <input type="radio" name="mergeP" value={c.id} checked={primaryId === c.id} onChange={() => setPrimaryId(c.id)} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', marginRight: '6px' }}>{c.id}</span>
                        <strong>{c.full_name}</strong>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>{idx === 0 ? '(older · recommended)' : '(newer)'}</span>
                        {primaryId === c.id && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#16a34a', fontWeight: '700' }}>✓ KEPT</span>}
                      </div>
                    </label>
                    {/* "Use all values" shortcut */}
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryId(c.id)
                        const choices = {}
                        CREW_MERGE_FIELDS.forEach(({ key }) => { choices[key] = c.id })
                        setFieldChoices(choices)
                      }}
                      style={{ marginTop: '3px', marginLeft: '14px', fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}>
                      ← Use all values from this record
                    </button>
                  </div>
                ))}
              </div>

              {/* ── Step 2: Field comparison table ── */}
              <div style={{ ...lbl, marginBottom: '8px' }}>2 — Click a value to keep it (green = selected)</div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '18px' }}>

                {/* Table column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: `100px ${mergeCtx.selCrew.map(() => '1fr').join(' ')}`, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Field</div>
                  {mergeCtx.selCrew.map((c, idx) => (
                    <div key={c.id} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '800', color: primaryId === c.id ? '#16a34a' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderLeft: '1px solid #e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'monospace' }}>{c.id}</span>
                      {primaryId === c.id && <span style={{ marginLeft: '4px' }}>✓</span>}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {CREW_MERGE_FIELDS.map(({ key, label: fLabel }) => {
                  const vals = mergeCtx.selCrew.map(c => ({ id: c.id, val: c[key] }))
                  const uq = new Set(vals.map(v => String(v.val ?? '')))
                  const isIdentical = uq.size === 1
                  const isDateField = key === 'arrival_date' || key === 'departure_date'
                  return (
                    <div key={key} style={{ display: 'contents' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `100px ${mergeCtx.selCrew.map(() => '1fr').join(' ')}`, borderBottom: (isDateField && !isIdentical) ? 'none' : '1px solid #f1f5f9', alignItems: 'stretch', minHeight: '36px' }}>
                        <div style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'flex', alignItems: 'center', background: isIdentical ? '#fafafa' : 'white' }}>
                          {fLabel}
                        </div>
                        {isIdentical ? (
                          <div style={{ gridColumn: `2 / span ${mergeCtx.selCrew.length}`, padding: '8px 10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', background: '#fafafa', borderLeft: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ color: '#22c55e', fontSize: '12px' }}>✓</span>
                            Same in both records:
                            <strong style={{ color: '#475569', fontStyle: 'normal', marginLeft: '2px' }}>
                              {key === 'hotel_id' ? hotelLabel(vals[0].val) : (vals[0].val || '—')}
                            </strong>
                          </div>
                        ) : (
                          vals.map(({ id, val }) => {
                            const isSelected = !multiStay[key] && fieldChoices[key] === id
                            return (
                              <div key={id}
                                onClick={() => { setMultiStay(p => ({ ...p, [key]: false })); setFieldChoices(p => ({ ...p, [key]: id })) }}
                                style={{ padding: '8px 10px', fontSize: '12px', cursor: 'pointer', borderLeft: '1px solid #f1f5f9', background: multiStay[key] ? '#faf5ff' : isSelected ? '#f0fdf4' : 'white', boxShadow: isSelected ? 'inset 3px 0 0 #16a34a' : 'none', opacity: multiStay[key] ? 0.5 : 1, color: val ? '#0f172a' : '#94a3b8', fontStyle: val ? 'normal' : 'italic', wordBreak: 'break-word', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.1s', userSelect: 'none' }}>
                                {isSelected && <span style={{ color: '#16a34a', fontSize: '13px', flexShrink: 0 }}>✓</span>}
                                {key === 'hotel_id' ? hotelLabel(val) : (val || '—')}
                              </div>
                            )
                          })
                        )}
                      </div>
                      {isDateField && !isIdentical && (
                        <div onClick={() => setMultiStay(p => ({ ...p, [key]: !p[key] }))}
                          style={{ padding: '5px 10px 5px 110px', fontSize: '11px', cursor: 'pointer', background: multiStay[key] ? '#f5f3ff' : '#fafafa', borderBottom: '1px solid #f1f5f9', color: multiStay[key] ? '#7c3aed' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none', boxShadow: multiStay[key] ? 'inset 3px 0 0 #7c3aed' : 'none' }}>
                          {multiStay[key] ? '✓' : '○'} 📅 Keep both dates → creates 2 separate stays for this person
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Result preview ── */}
              <ResultPreview selCrew={mergeCtx.selCrew} fieldChoices={fieldChoices} hotelLabel={hotelLabel} />

              {/* Info box */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#1d4ed8' }}>
                ℹ️ <strong>Travel movements</strong> and <strong>accommodation stays</strong> from all selected records will be reassigned to the primary record.
              </div>

              {/* Warning — with real names, not IDs */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', fontSize: '12px', color: '#dc2626' }}>
                ⚠️ <strong>Irreversible.</strong>{' '}
                {mergeCtx.selCrew.filter(c => c.id !== primaryId).length === 1 ? 'This record' : 'These records'} will be <strong>permanently deleted</strong>:{' '}
                {mergeCtx.selCrew.filter(c => c.id !== primaryId).map((c, i) => (
                  <span key={c.id}>{i > 0 && ', '}<strong>{c.full_name}</strong>{' '}
                    <code style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '10px' }}>({c.id})</code>
                  </span>
                ))}
              </div>

              {mergeError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#dc2626' }}>
                  ❌ {mergeError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setMergeCtx(null)} style={btnSecondary} disabled={saving}>Cancel</button>
                <button onClick={handleMerge} disabled={saving} style={{ ...btnRed, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Merging…' : '⚠️ Confirm Merge'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Notifications Panel ───────────────────────────────────
function NotificationsPanel({ productionId }) {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('notifications')
      .select('*')
      .eq('production_id', productionId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(data || []))
  }, [productionId])

  function dismiss(id) {
    supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (notifications.length === 0) return null

  const typeStyle = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#15803d', icon: '✅' },
    warning: { bg: '#fefce8', border: '#fde68a', color: '#a16207', icon: '⚠️' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '❌' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: 'ℹ️' },
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
        🚨 Alerts & Notifications
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {notifications.map(n => {
          const s = typeStyle[n.type] || typeStyle.info
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '8px' }}>
              <span>{s.icon}</span>
              <span style={{ flex: 1, fontSize: '13px', color: s.color, fontWeight: '600' }}>{n.message}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button onClick={() => dismiss(n.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', lineHeight: 1, padding: '2px 4px' }}>
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Drive Sync Widget ─────────────────────────────────────
function DriveSyncWidget({ productionId, onPreview, refreshKey }) {
  const [files,          setFiles]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [previewLoading, setPreviewLoading] = useState({})
  const [inlineMsg,      setInlineMsg]      = useState({})

  useEffect(() => {
    if (!productionId) return
    setLoading(true)

    // Usa il nuovo endpoint che interroga Drive in tempo reale per confrontare
    // il modifiedTime attuale con last_synced_at nel DB.
    // L'approccio precedente (leggere solo il DB) non rilevava modifiche avvenute
    // su Drive dopo l'ultima sync, perché last_modified nel DB era aggiornato
    // solo alla sync successiva.
    fetch(`/api/drive/check-updates?production_id=${encodeURIComponent(productionId)}`)
      .then(res => {
        if (!res.ok) {
          // Se l'endpoint fallisce (es. provider_token scaduto), fallback silenzioso
          console.warn('[DriveSyncWidget] check-updates error:', res.status)
          return { files: [] }
        }
        return res.json()
      })
      .then(data => {
        setFiles(data.files || [])
        setLoading(false)
      })
      .catch(err => {
        console.warn('[DriveSyncWidget] check-updates fetch failed:', err.message)
        setFiles([])
        setLoading(false)
      })
  }, [productionId, refreshKey])

  if (loading || files.length === 0) return null

  async function handlePreview(file) {
    setPreviewLoading(prev => ({ ...prev, [file.file_id]: true }))
    setInlineMsg(prev => ({ ...prev, [file.file_id]: null }))
    try {
      // 1. Scarica il file dal server
      const dlRes = await fetch('/api/drive/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ production_id: productionId, file_id: file.file_id }),
      })
      if (!dlRes.ok) {
        const errData = await dlRes.json().catch(() => ({}))
        throw new Error(errData.error || 'Download error')
      }
      // 2. Converti in File object
      const blob = await dlRes.blob()
      const filename = dlRes.headers.get('X-File-Name') || file.file_name || 'file.xlsx'
      const fileObj = new File([blob], filename, { type: blob.type })
      // 3. Carica locations
      const locRes = await supabase.from('locations').select('id, name').eq('production_id', productionId)
      const locations = locRes.data || []
      // 4. Apri ImportModal con il file già pronto — il modal gestirà sheet-select
      onPreview({ fileObj, selMode: file.import_mode, locations, fileId: file.file_id })
    } catch (e) {
      setInlineMsg(prev => ({ ...prev, [file.file_id]: '❌ ' + e.message }))
    } finally {
      setPreviewLoading(prev => ({ ...prev, [file.file_id]: false }))
    }
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
        📁 Drive Files with Updates
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {files.map(f => {
          const lastSync = f.last_synced_at
            ? new Date(f.last_synced_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : null
          const isLoading = !!previewLoading[f.file_id]
          const msg = inlineMsg[f.file_id]
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#fff7ed', border: '1px solid #fde68a', borderRadius: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px' }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.file_name || f.file_id}
                </div>
                <div style={{ fontSize: '11px', color: '#a16207', marginTop: '1px' }}>
                  {lastSync ? `Last sync: ${lastSync}` : 'Never synced'}
                </div>
                {msg && (
                  <div style={{ fontSize: '11px', marginTop: '3px', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontWeight: '600' }}>
                    {msg}
                  </div>
                )}
              </div>
              <button
                onClick={() => handlePreview(f)}
                disabled={isLoading}
                style={{
                  padding: '5px 12px', borderRadius: '7px', border: '1px solid #a16207',
                  background: isLoading ? '#f1f5f9' : '#fefce8', color: isLoading ? '#94a3b8' : '#92400e',
                  fontSize: '11px', fontWeight: '700', cursor: isLoading ? 'default' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                {isLoading ? '⏳ Loading…' : '🔍 Preview changes'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Travel Discrepancies Widget ──────────────────────────
function TravelDiscrepanciesWidget({ productionId, refreshKey }) {
  const [items, setItems] = useState([])
  const [resolving, setResolving] = useState({})
  const [notes, setNotes] = useState({})
  const [locations, setLocations] = useState([])
  const [highlightId, setHighlightId] = useState(null)

  useEffect(() => {
    const id = sessionStorage.getItem('bridgeHighlight')
    if (id) {
      sessionStorage.removeItem('bridgeHighlight')
      setHighlightId(id)
      setTimeout(() => {
        const el = document.getElementById(`discrepancy-${id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [])

  useEffect(() => {
    if (!productionId) return

    Promise.all([
      supabase
        .from('travel_movements')
        .select('id, crew_id, full_name_raw, travel_date, direction, travel_date_conflict, hotel_conflict, match_status, needs_transport, rooming_date, rooming_hotel_id, hotel_raw, hub_location_id, travel_type, from_location, from_time, to_location, to_time, travel_number, crew:crew_id(full_name, hotel_id, department, role)')
        .eq('production_id', productionId)
        .or('discrepancy_resolved.eq.false,discrepancy_resolved.is.null')
        .or('travel_date_conflict.eq.true,hotel_conflict.eq.true,match_status.eq.unmatched')
        .order('travel_date', { ascending: true })
        .limit(50),
      supabase
        .from('locations')
        .select('id, name')
        .eq('production_id', productionId),
    ]).then(async ([{ data: rawItems }, { data: locs }]) => {
      setLocations(locs || [])

      const items = rawItems || []

      // Collect crew_ids for items with pre-computed conflicts
      const conflictCrewIds = [...new Set(
        items
          .filter(i => i.crew_id && (i.travel_date_conflict || i.hotel_conflict))
          .map(i => i.crew_id)
      )]

      // Load crew_stays live for these crew members
      let staysMap = {}
      if (conflictCrewIds.length > 0) {
        const { data: stays } = await supabase
          .from('crew_stays')
          .select('crew_id, hotel_id, arrival_date, departure_date')
          .in('crew_id', conflictCrewIds)
          .eq('production_id', productionId)
        for (const s of (stays || [])) {
          if (!staysMap[s.crew_id]) staysMap[s.crew_id] = []
          staysMap[s.crew_id].push(s)
        }
      }

      // Re-evaluate conflicts against real crew_stays — filter out false positives
      const toAutoResolve = []
      const validItems = items.filter(item => {
        if (!item.crew_id) return true  // unmatched — keep
        const personStays = staysMap[item.crew_id] || []
        if (personStays.length === 0) return true  // no stays → keep as-is

        if (item.travel_date_conflict) {
          const coveringStay = personStays.find(s =>
            s.arrival_date && s.departure_date &&
            item.travel_date >= s.arrival_date && item.travel_date <= s.departure_date
          )
          if (coveringStay) {
            // False positive: travel_date covered by a real stay → auto-resolve silently
            toAutoResolve.push(item.id)
            return false
          }
          item._personStays = personStays  // enrich for UI
        }

        if (item.hotel_conflict) {
          const matchingHotelStay = personStays.find(s => s.hotel_id === item.hotel_id)
          if (matchingHotelStay) {
            // Travel hotel matches at least one stay → not a real conflict
            toAutoResolve.push(item.id)
            return false
          }
          item._personStays = personStays
        }

        return true
      })

      // Silently mark false positives as resolved in DB
      if (toAutoResolve.length > 0) {
        supabase.from('travel_movements')
          .update({ discrepancy_resolved: true, discrepancy_note: 'auto-resolved: covered by crew_stay' })
          .in('id', toAutoResolve)
          .then(() => {})
      }

      setItems(validItems)
    })
  }, [productionId, refreshKey])

  async function resolve(id) {
    setResolving(p => ({ ...p, [id]: true }))
    await supabase.from('travel_movements')
      .update({ discrepancy_resolved: true, discrepancy_note: notes[id] || null })
      .eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setResolving(p => ({ ...p, [id]: false }))
  }

  if (items.length === 0) return null

  return (
    <div style={{ background: 'white', border: '1px solid #fde68a', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#a16207' }}>⚠️ Travel Discrepancies</div>
        <div style={{ fontSize: '11px', color: '#a16207' }}>{items.length} to resolve</div>
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {items.map(item => {
          const name = item.crew?.full_name || item.full_name_raw

          // Compute live rooming_date from real stays (overrides stale pre-computed value)
          const liveRoomingDate = (() => {
            const stays = item._personStays
            if (!stays || stays.length === 0) return item.rooming_date
            const closestStay = stays.reduce((best, s) => {
              if (!best) return s
              const d1 = Math.abs(new Date(s.arrival_date) - new Date(item.travel_date))
              const d2 = Math.abs(new Date(best.arrival_date) - new Date(item.travel_date))
              return d1 < d2 ? s : best
            }, null)
            return item.direction === 'IN'
              ? (closestStay?.arrival_date || item.rooming_date)
              : (closestStay?.departure_date || item.rooming_date)
          })()

          return (
            <div key={item.id} id={`discrepancy-${item.id}`} style={{ padding: '12px 20px', borderBottom: '1px solid #fef9c3', background: item.id === highlightId ? '#fef9c3' : 'transparent', transition: 'background 1s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                    {name}
                    <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '600', color: item.direction === 'IN' ? '#15803d' : '#c2410c' }}>
                      {item.direction === 'IN' ? '↓ IN' : '↑ OUT'} {item.travel_date}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {item.match_status === 'unmatched' && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: '700' }}>
                        ❌ Not matched in crew
                      </span>
                    )}
                    {item.travel_date_conflict && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>
                          📅 Rooming List → <strong>{liveRoomingDate}</strong> · Travel Calendar → <strong>{item.travel_date}</strong>
                          {item._personStays?.length > 1 && (
                            <span style={{ marginLeft: '6px', fontWeight: '600', color: '#92400e', fontSize: '10px' }}>
                              ({item._personStays.length} stays)
                            </span>
                          )}
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={async () => {
                              if (!item.crew_id || !liveRoomingDate) return
                              await supabase.from('travel_movements')
                                .update({ travel_date: liveRoomingDate, travel_date_conflict: false })
                                .eq('id', item.id)
                              await resolve(item.id)
                            }}
                            title={`Usa la data della Rooming List: ${liveRoomingDate}`}
                            style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: '#0f2340', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                            ✓ Use Rooming ({liveRoomingDate})
                          </button>
                          <button
                            onClick={async () => {
                              if (!item.crew_id || !item.travel_date) return
                              const field = item.direction === 'IN' ? 'arrival_date' : 'departure_date'
                              const personStays = item._personStays || []
                              if (personStays.length > 0) {
                                // Aggiorna la crew_stay più vicina alla travel_date
                                const closestStay = personStays.reduce((best, s) => {
                                  if (!best) return s
                                  const d1 = Math.abs(new Date(s.arrival_date) - new Date(item.travel_date))
                                  const d2 = Math.abs(new Date(best.arrival_date) - new Date(item.travel_date))
                                  return d1 < d2 ? s : best
                                }, null)
                                if (closestStay) {
                                  await supabase.from('crew_stays')
                                    .update({ [field]: item.travel_date })
                                    .eq('crew_id', item.crew_id)
                                    .eq('arrival_date', closestStay.arrival_date)
                                    .eq('production_id', productionId)
                                }
                              } else {
                                // Nessuna stay → aggiorna crew direttamente
                                await supabase.from('crew')
                                  .update({ [field]: item.travel_date })
                                  .eq('id', item.crew_id)
                                  .eq('production_id', productionId)
                              }
                              await resolve(item.id)
                            }}
                            title={`Usa la data del Travel Calendar: ${item.travel_date}`}
                            style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: '#15803d', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                            ✓ Use Calendar ({item.travel_date})
                          </button>
                        </div>
                      </div>
                    )}
                    {item.hotel_conflict && (() => {
                      const roomingHotel = locations.find(l => l.id === item.rooming_hotel_id)?.name || item.rooming_hotel_id || '?'
                      // Resolve travel hotel ID: use item.hotel_id if set, otherwise try fuzzy-match hotel_raw against locations
                      const resolvedTravelHotelId = item.hotel_id || (
                        item.hotel_raw
                          ? locations.find(l =>
                              l.name.toLowerCase().includes(item.hotel_raw.toLowerCase()) ||
                              item.hotel_raw.toLowerCase().includes(l.name.toLowerCase())
                            )?.id
                          : null
                      )
                      const travelHotel = locations.find(l => l.id === resolvedTravelHotelId)?.name || item.hotel_raw || '?'
                      const canUseCalendar = !!(item.crew_id && resolvedTravelHotelId)
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', fontWeight: '700' }}>
                            🏨 Rooming List → <strong>{roomingHotel}</strong> · Travel Calendar → <strong>{travelHotel}</strong>
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={async () => {
                                if (!item.crew_id || !item.rooming_hotel_id) return
                                await supabase.from('crew').update({ hotel_id: item.rooming_hotel_id }).eq('id', item.crew_id).eq('production_id', productionId)
                                await supabase.from('crew_stays').update({ hotel_id: item.rooming_hotel_id }).eq('crew_id', item.crew_id).eq('production_id', productionId)
                                await resolve(item.id)
                              }}
                              title={`Usa l'hotel della Rooming List: ${roomingHotel}`}
                              style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: '#0f2340', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                              ✓ Use Rooming ({roomingHotel.split(' ')[0]})
                            </button>
                            <button
                              onClick={async () => {
                                if (!item.crew_id || !resolvedTravelHotelId) return
                                await supabase.from('crew').update({ hotel_id: resolvedTravelHotelId }).eq('id', item.crew_id).eq('production_id', productionId)
                                await supabase.from('crew_stays').update({ hotel_id: resolvedTravelHotelId }).eq('crew_id', item.crew_id).eq('production_id', productionId)
                                await resolve(item.id)
                              }}
                              disabled={!canUseCalendar}
                              title={canUseCalendar ? `Usa l'hotel del Travel Calendar: ${travelHotel}` : `Hotel "${travelHotel}" non trovato nel sistema — impossibile aggiornare`}
                              style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: canUseCalendar ? '#15803d' : '#94a3b8', color: 'white', fontSize: '11px', fontWeight: '700', cursor: canUseCalendar ? 'pointer' : 'not-allowed', opacity: canUseCalendar ? 1 : 0.6 }}>
                              ✓ Use Calendar ({travelHotel.split(' ')[0]})
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  <input
                    placeholder="Note (optional)…"
                    value={notes[item.id] || ''}
                    onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))}
                    style={{ marginTop: '8px', width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={async () => {
                      if (item.match_status === 'unmatched') {
                        sessionStorage.setItem('crewAddNew', item.full_name_raw)
                        sessionStorage.setItem('crewAddNewMovementId', item.id)

                        // Cerca hotel_id da locations usando hotel_raw
                        let hotel_id = item.rooming_hotel_id || null
                        if (!hotel_id && item.hotel_raw) {
                          const matchedLoc = locations.find(l =>
                            l.name.toLowerCase().includes(item.hotel_raw.toLowerCase()) ||
                            item.hotel_raw.toLowerCase().includes(l.name.toLowerCase())
                          )
                          if (matchedLoc) hotel_id = matchedLoc.id
                        }

                        sessionStorage.setItem('crewAddNewData', JSON.stringify({
                          hotel_id:       hotel_id,
                          arrival_date:   item.rooming_date || item.travel_date || null,
                          departure_date: null,
                        }))
                      }
                      window.location.href = '/dashboard/crew'
                    }}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontSize: '11px', fontWeight: '600', cursor: 'pointer', textAlign: 'center' }}>
                    👤 Crew
                  </button>
                  {/* Skip future checks — for coordinators / multi-production crew */}
                  {item.crew_id && (item.hotel_conflict || item.travel_date_conflict) && (
                    <button
                      onClick={async () => {
                        if (!item.crew_id) return
                        // Mark crew as no_rooming_check so future imports skip conflict detection
                        await supabase.from('crew')
                          .update({ no_rooming_check: true })
                          .eq('id', item.crew_id)
                          .eq('production_id', productionId)
                        // Resolve the current discrepancy
                        await resolve(item.id)
                      }}
                      disabled={resolving[item.id]}
                      title="Questo membro gestisce viaggi e hotel fuori dalla Rooming List (es. Travel Coordinator). I futuri import non genereranno conflitti per questa persona."
                      style={{
                        padding: '5px 10px', borderRadius: '6px', border: '1px solid #7c3aed',
                        background: '#f5f3ff', color: '#7c3aed',
                        fontSize: '11px', fontWeight: '700',
                        cursor: resolving[item.id] ? 'default' : 'pointer',
                        opacity: resolving[item.id] ? 0.6 : 1,
                        textAlign: 'center',
                      }}>
                      ✈ Skip future
                    </button>
                  )}
                  <button
                    onClick={() => resolve(item.id)}
                    disabled={resolving[item.id]}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: '#16a34a', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer', opacity: resolving[item.id] ? 0.6 : 1 }}>
                    {resolving[item.id] ? '…' : '✓ Resolve'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tomorrow Panel ────────────────────────────────────────
function TomorrowPanel({ productionId }) {
  const isMobile = useIsMobile()
  const [arrivals,   setArrivals]   = useState([])
  const [departures, setDepartures] = useState([])

  useEffect(() => {
    if (!productionId) return
    const tomorrowStr = new Date(Date.now() + 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

    supabase.from('travel_movements')
      .select('crew_id, full_name_raw, travel_date, direction, from_location, from_time, to_location, to_time, travel_number, travel_type, needs_transport, crew:crew_id(full_name, department)')
      .eq('production_id', productionId)
      .eq('travel_date', tomorrowStr)
      .eq('direction', 'IN')
      .then(({ data }) => setArrivals(data || []))

    supabase.from('travel_movements')
      .select('crew_id, full_name_raw, travel_date, direction, from_location, from_time, to_location, to_time, travel_number, travel_type, needs_transport, crew:crew_id(full_name, department)')
      .eq('production_id', productionId)
      .eq('travel_date', tomorrowStr)
      .eq('direction', 'OUT')
      .then(({ data }) => setDepartures(data || []))
  }, [productionId])

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const total = arrivals.length + departures.length
  const isHighTraffic = total > 5

  const rocketUrl = `/dashboard/rocket?date=${new Date(Date.now() + 86400000).toISOString().split('T')[0]}`

  return (
    <div style={{
      marginBottom: '20px', padding: '16px 20px',
      background: isHighTraffic ? '#fff7ed' : 'white',
      border: `2px solid ${isHighTraffic ? '#f97316' : '#e2e8f0'}`,
      borderRadius: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f2340' }}>
            📅 Tomorrow — {tomorrowStr}
          </div>
          {isHighTraffic && (
            <div style={{ fontSize: '11px', color: '#c2410c', fontWeight: '700', marginTop: '2px' }}>
              ⚠️ High traffic day — plan vehicles in advance
            </div>
          )}
        </div>
        <a href={rocketUrl}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: '#0f2340', color: 'white', textDecoration: 'none', fontSize: '12px', fontWeight: '800' }}>
          🚀 Launch Rocket for tomorrow →
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
        {/* Arrivals */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            🛬 Arrivals ({arrivals.length})
          </div>
          {arrivals.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No arrivals tomorrow</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {arrivals.slice(0, 5).map((c, idx) => {
                const icon = c.travel_type === 'FLIGHT' ? '✈️'
                           : c.travel_type === 'TRAIN'  ? '🚂'
                           : '🚐'
                const name = c.crew?.full_name || c.full_name_raw
                return (
                  <div key={idx} style={{ fontSize: '12px', color: '#374151' }}>
                    <span>{icon}</span>
                    <strong style={{ marginLeft: '4px' }}>{name}</strong>
                    {c.crew?.department && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>{c.crew.department}</span>}
                    {c.travel_number && <span style={{ color: '#64748b', marginLeft: '6px', fontFamily: 'monospace' }}>{c.travel_number}</span>}
                    {c.to_time && <span style={{ color: '#64748b', marginLeft: '4px' }}>arr {c.to_time}</span>}
                    {c.needs_transport && (
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px', marginLeft: '6px' }}>🚐</span>
                    )}
                  </div>
                )
              })}
              {arrivals.length > 5 && (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>+{arrivals.length - 5} more</div>
              )}
            </div>
          )}
        </div>

        {/* Departures */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            🛫 Departures ({departures.length})
          </div>
          {departures.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No departures tomorrow</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {departures.slice(0, 5).map((c, idx) => {
                const icon = c.travel_type === 'FLIGHT' ? '✈️'
                           : c.travel_type === 'TRAIN'  ? '🚂'
                           : '🚐'
                const name = c.crew?.full_name || c.full_name_raw
                return (
                  <div key={idx} style={{ fontSize: '12px', color: '#374151' }}>
                    <span>{icon}</span>
                    <strong style={{ marginLeft: '4px' }}>{name}</strong>
                    {c.crew?.department && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>{c.crew.department}</span>}
                    {c.travel_number && <span style={{ color: '#64748b', marginLeft: '6px', fontFamily: 'monospace' }}>{c.travel_number}</span>}
                    {c.from_time && <span style={{ color: '#64748b', marginLeft: '4px' }}>dep {c.from_time}</span>}
                    {c.needs_transport && (
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px', marginLeft: '6px' }}>🚐</span>
                    )}
                  </div>
                )
              })}
              {departures.length > 5 && (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>+{departures.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Arrivals & Departures Chart ───────────────────────────
function ArrivalsDeparturesChart({ productionId }) {
  const isMobile = useIsMobile()
  const [chartData, setChartData] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!productionId) return

    function toRomeDate(d) {
      return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    }
    const now         = new Date()
    const todayStr    = toRomeDate(now)
    const tomorrowStr = toRomeDate(new Date(now.getTime() + 86400000))
    const fromStr     = todayStr
    const toStr       = toRomeDate(new Date(now.getTime() + 29 * 86400000))

    Promise.all([
      supabase.from('travel_movements')
        .select('travel_date, travel_type')
        .eq('production_id', productionId)
        .eq('direction', 'IN')
        .gte('travel_date', fromStr)
        .lte('travel_date', toStr),
      supabase.from('travel_movements')
        .select('travel_date, travel_type')
        .eq('production_id', productionId)
        .eq('direction', 'OUT')
        .gte('travel_date', fromStr)
        .lte('travel_date', toStr),
    ]).then(([arrRes, depRes]) => {
      const arrMap = {}   // date → total
      const arrFlight = {} // date → flights
      const arrTrain = {}  // date → trains
      const depMap = {}
      const depFlight = {}
      const depTrain = {}

      ;(arrRes.data || []).forEach(r => {
        const d = String(r.travel_date).slice(0, 10)
        arrMap[d] = (arrMap[d] || 0) + 1
        if (r.travel_type === 'FLIGHT') arrFlight[d] = (arrFlight[d] || 0) + 1
        if (r.travel_type === 'TRAIN')  arrTrain[d]  = (arrTrain[d]  || 0) + 1
      })
      ;(depRes.data || []).forEach(r => {
        const d = String(r.travel_date).slice(0, 10)
        depMap[d] = (depMap[d] || 0) + 1
        if (r.travel_type === 'FLIGHT') depFlight[d] = (depFlight[d] || 0) + 1
        if (r.travel_type === 'TRAIN')  depTrain[d]  = (depTrain[d]  || 0) + 1
      })

      const days = []
      const cur = new Date(todayStr + 'T00:00:00')
      const to = new Date(toStr + 'T00:00:00')
      while (cur <= to) {
        const d = toRomeDate(cur)
        days.push({
          date:        d,
          label:       cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          arrivals:    arrMap[d]    || 0,
          departures:  depMap[d]   || 0,
          arrFlights:  arrFlight[d] || 0,
          arrTrains:   arrTrain[d]  || 0,
          depFlights:  depFlight[d] || 0,
          depTrains:   depTrain[d]  || 0,
          isToday:     d === todayStr,
          isTomorrow:  d === tomorrowStr,
        })
        cur.setDate(cur.getDate() + 1)
      }

      setChartData(days)
      setLoading(false)
    })
  }, [productionId])

  if (loading) return null

  const hasData = chartData.some(d => d.arrivals > 0 || d.departures > 0)

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: isMobile ? '12px' : '16px 20px', marginBottom: '20px' }}>
      {/* Header + Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f2340' }}>
          📊 Arrivals & Departures — 30 days (flights + trains)
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#86efac', borderRadius: '2px', display: 'inline-block' }} />
            🛬 Arrivals
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#fca5a5', borderRadius: '2px', display: 'inline-block' }} />
            🛫 Departures
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#0f2340', borderRadius: '2px', display: 'inline-block' }} />
            Today
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: '#f97316', borderRadius: '2px', display: 'inline-block' }} />
            Tomorrow
          </span>
        </div>
      </div>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: '13px' }}>
          No arrivals or departures in the next 30 days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={chartData}
            barCategoryGap="20%"
            barGap={2}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              labelStyle={{ fontWeight: '700', color: '#0f2340', marginBottom: '4px' }}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null
                const d = payload[0]?.payload
                if (!d) return null
                const dateLabel = d.isToday ? `${label} — TODAY`
                                : d.isTomorrow ? `${label} — TOMORROW`
                                : label
                return (
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontWeight: '800', color: '#0f2340', marginBottom: '6px' }}>{dateLabel}</div>
                    {d.arrivals > 0 && (
                      <div style={{ color: '#15803d', marginBottom: '2px' }}>
                        🛬 Arrivals: <strong>{d.arrivals}</strong>
                        {(d.arrFlights > 0 || d.arrTrains > 0) && (
                          <span style={{ color: '#64748b', marginLeft: '6px' }}>
                            ({d.arrFlights > 0 ? `${d.arrFlights} ✈️` : ''}{d.arrFlights > 0 && d.arrTrains > 0 ? ' + ' : ''}{d.arrTrains > 0 ? `${d.arrTrains} 🚂` : ''})
                          </span>
                        )}
                      </div>
                    )}
                    {d.departures > 0 && (
                      <div style={{ color: '#dc2626' }}>
                        🛫 Departures: <strong>{d.departures}</strong>
                        {(d.depFlights > 0 || d.depTrains > 0) && (
                          <span style={{ color: '#64748b', marginLeft: '6px' }}>
                            ({d.depFlights > 0 ? `${d.depFlights} ✈️` : ''}{d.depFlights > 0 && d.depTrains > 0 ? ' + ' : ''}{d.depTrains > 0 ? `${d.depTrains} 🚂` : ''})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="arrivals" name="arrivals" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`arr-${i}`}
                  fill={entry.isToday ? '#0f2340' : entry.isTomorrow ? '#f97316' : '#86efac'}
                />
              ))}
            </Bar>
            <Bar dataKey="departures" name="departures" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`dep-${i}`}
                  fill={entry.isToday ? '#1e40af' : entry.isTomorrow ? '#ea580c' : '#fca5a5'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Mini Widgets (Fleet / Pax / Hub) ─────────────────────
function MiniWidgets({ productionId }) {
  const isMobile = useIsMobile()
  const [vehicles, setVehicles] = useState([])
  const [crew,     setCrew]     = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles')
      .select('id, sign_code, vehicle_type, in_transport')
      .eq('production_id', productionId)
      .eq('active', true)
      .then(({ data }) => setVehicles(data || []))
    supabase.from('crew')
      .select('id, travel_status, hotel_status, no_transport_needed')
      .eq('production_id', productionId)
      .then(({ data }) => setCrew(data || []))
  }, [productionId])

  const crewStats = {
    present: crew.filter(c => c.travel_status === 'PRESENT').length,
    in:      crew.filter(c => c.travel_status === 'IN').length,
    out:     crew.filter(c => c.travel_status === 'OUT').length,
    conf:    crew.filter(c => c.hotel_status  === 'CONFIRMED').length,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>

      {/* Fleet Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          🚐 Fleet
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {vehicles.length}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>vehicles active</div>
        {vehicles.filter(v => v.in_transport === false).length > 0 && (
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', display: 'inline-block', marginBottom: '8px' }}>
            🚐 {vehicles.filter(v => v.in_transport === false).length} SD
          </div>
        )}
        <a href="/dashboard/fleet" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600', display: 'block' }}>
          View Fleet Monitor →
        </a>
      </div>

      {/* Pax Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          👥 Crew
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {crew.length}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {[
            { n: crewStats.present, l: 'PRESENT', bg: '#eff6ff', c: '#1d4ed8' },
            { n: crewStats.in,      l: 'IN',      bg: '#dcfce7', c: '#15803d' },
            { n: crewStats.out,     l: 'OUT',      bg: '#fff7ed', c: '#c2410c' },
          ].map(s => s.n > 0 && (
            <span key={s.l} style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '999px', background: s.bg, color: s.c }}>
              {s.n} {s.l}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
          {crew.filter(c => c.no_transport_needed).length > 0 && (
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 8px' }}>
              🚐 {crew.filter(c => c.no_transport_needed).length} NTN
            </div>
          )}
          <a href="/dashboard/pax-coverage" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
            View Pax Coverage →
          </a>
        </div>
      </div>

      {/* Hub Mini */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          🛣️ Hub Coverage
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f2340', marginBottom: '4px' }}>
          {crewStats.conf}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>crew confirmed</div>
        <a href="/dashboard/hub-coverage" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}>
          View Hub Coverage →
        </a>
      </div>
    </div>
  )
}

// ── Vehicle Rental Monitor ────────────────────────────────
function VehicleRentalWidget({ productionId }) {
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    if (!productionId) return
    supabase.from('vehicles')
      .select('id, vehicle_type, driver_name, sign_code, available_from, available_to')
      .eq('production_id', productionId)
      .eq('active', true)
      .then(({ data }) => setVehicles(data || []))
  }, [productionId])

  const today = new Date(); today.setHours(0, 0, 0, 0)

  function diffDays(isoDate) {
    const d = new Date(isoDate); d.setHours(0, 0, 0, 0)
    return Math.round((d - today) / 86400000)
  }

  function fmtD(iso) {
    if (!iso) return '—'
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }

  const expiring = vehicles
    .filter(v => v.available_to)
    .map(v => ({ ...v, diff: diffDays(v.available_to) }))
    .filter(v => v.diff >= 0 && v.diff <= 3)
    .sort((a, b) => a.diff - b.diff)

  const arriving = vehicles
    .filter(v => v.available_from)
    .map(v => ({ ...v, diff: diffDays(v.available_from) }))
    .filter(v => v.diff >= 0 && v.diff <= 1)
    .sort((a, b) => a.diff - b.diff)

  if (expiring.length === 0 && arriving.length === 0) return null

  function expiringBadge(diff) {
    if (diff === 0) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'TODAY' }
    if (diff === 1) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'TOMORROW' }
    return { bg: '#fefce8', color: '#a16207', border: '#fde68a', label: `${diff} days` }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f2340' }}>🚗 Vehicle Rental Monitor</div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expiring.length} expiring · {arriving.length} arriving</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {expiring.length > 0 && (
          <div style={{ padding: '8px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: '10px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ⚠️ Expiring — return trip needed
          </div>
        )}
        {expiring.map(v => {
          const badge = expiringBadge(v.diff)
          return (
            <div key={v.id + '-exp'} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: '22px' }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
                  {v.driver_name && <span style={{ fontSize: '12px', color: '#374151' }}>👤 {v.driver_name}</span>}
                  {v.sign_code   && <span style={{ fontSize: '11px', color: '#94a3b8' }}>🏷 {v.sign_code}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  📅 {v.available_from ? fmtD(v.available_from) : '—'} → <strong>{fmtD(v.available_to)}</strong>
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}>
                {badge.label}
              </span>
              <a href="/dashboard/trips"
                style={{ padding: '5px 12px', borderRadius: '7px', background: '#0f2340', color: 'white', textDecoration: 'none', fontSize: '11px', fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap' }}>
                + Return trip
              </a>
            </div>
          )
        })}
        {arriving.length > 0 && (
          <div style={{ padding: '8px 20px', background: '#f0fdf4', borderBottom: '1px solid #86efac', borderTop: expiring.length > 0 ? '1px solid #e2e8f0' : 'none', fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ✅ Arriving — new vehicle incoming
          </div>
        )}
        {arriving.map(v => (
          <div key={v.id + '-arr'} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '22px' }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
                {v.driver_name && <span style={{ fontSize: '12px', color: '#374151' }}>👤 {v.driver_name}</span>}
                {v.sign_code   && <span style={{ fontSize: '11px', color: '#94a3b8' }}>🏷 {v.sign_code}</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                📅 <strong>{fmtD(v.available_from)}</strong> → {v.available_to ? fmtD(v.available_to) : '—'}
              </div>
            </div>
            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', flexShrink: 0 }}>
              {v.diff === 0 ? 'TODAY' : 'TOMORROW'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Log ─────────────────────────────────────────
function ActivityLog({ productionId }) {
  const isMobile = useIsMobile()
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productionId) return
    supabase.from('activity_log')
      .select('*')
      .eq('production_id', productionId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [productionId])

  const actionIcon = {
    import:   '📥',
    rocket:   '🚀',
    crew:     '👤',
    trip:     '🚐',
    vehicle:  '🚗',
    location: '📍',
    default:  '📋',
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f2340' }}>📋 Activity Log</div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Last 50 actions</div>
      </div>
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No activity yet</div>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {logs.map(log => {
            const icon = actionIcon[log.action_type] || actionIcon.default
            const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            const date = new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            return (
              <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: isMobile ? '6px 12px' : '8px 20px', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#374151', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'nowrap' : 'normal' }}>{log.description}</div>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0, textAlign: 'right', lineHeight: isMobile ? 1.3 : 1.5 }}>
                  <div>{time}</div>
                  {!isMobile && <div>{date}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Pending Users tab ─────────────────────────────────────
function PendingUsersTab({ productions }) {
  const [pending,   setPending]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [working,   setWorking]   = useState({})  // userId → true
  const [dismissed, setDismissed] = useState(new Set())
  const [modal,     setModal]     = useState(null) // { userId, name, email }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const res  = await fetch('/api/bridge/pending-users')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setPending(json.pending || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function approveSandbox(userId) {
    setWorking(w => ({ ...w, [userId]: true }))
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mode: 'sandbox' }),
    })
    if (res.ok) setDismissed(d => new Set([...d, userId]))
    setWorking(w => ({ ...w, [userId]: false }))
  }

  function dismiss(userId) {
    setDismissed(d => new Set([...d, userId]))
  }

  const visible = pending.filter(u => !dismissed.has(u.id))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>
  if (visible.length === 0) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
      <div style={{ color: '#64748b', fontWeight: '600' }}>No pending users</div>
      <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Everyone who signed up has been handled.</div>
      <button onClick={load} style={{ ...btnSecondary, marginTop: '14px' }}>↺ Refresh</button>
    </div>
  )

  return (
    <div>
      <div style={{ padding: '12px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
        ⚠️ {visible.length} user{visible.length !== 1 ? 's' : ''} waiting — approve them or let them use an invite code.
        <button onClick={load} style={{ ...btnSecondary, marginLeft: '12px', padding: '3px 10px', fontSize: '11px' }}>↺ Refresh</button>
      </div>

      {visible.map(u => (
        <div key={u.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Avatar */}
          {u.avatar_url
            ? <img src={u.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
            : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>👤</div>
          }

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.name || u.email}
            </div>
            {u.name && <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Signed up {fmt(u.created_at)}</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => approveSandbox(u.id)} disabled={working[u.id]}
              style={{ ...btnGreen, opacity: working[u.id] ? 0.6 : 1 }}>
              {working[u.id] ? '…' : '✓ Sandbox'}
            </button>
            <button onClick={() => setModal(u)} style={btnPrimary}>
              ⊕ Add to prod
            </button>
            <button onClick={() => dismiss(u.id)} style={btnSecondary}>
              ✕ Ignore
            </button>
          </div>
        </div>
      ))}

      {/* Add-to-production modal */}
      {modal && (
        <AddToProductionModal
          user={modal}
          productions={productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))}
          onClose={() => setModal(null)}
          onDone={(userId) => { setDismissed(d => new Set([...d, userId])); setModal(null) }}
        />
      )}
    </div>
  )
}

function AddToProductionModal({ user, productions, onClose, onDone }) {
  const [prodId,  setProdId]  = useState(productions[0]?.id || '')
  const [role,    setRole]    = useState('MANAGER')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const res = await fetch('/api/bridge/approve-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, mode: 'production', productionId: prodId, role }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setSaving(false) }
    else onDone(user.id)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '380px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: '900', fontSize: '17px', color: '#0f2340', marginBottom: '6px' }}>⊕ Add to Production</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
          {user.name || user.email} will be added with the selected role.
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={lbl}>Production</label>
            <select value={prodId} onChange={e => setProdId(e.target.value)} style={sel} required>
              {productions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <label style={lbl}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={sel}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>❌ {error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={saving || !prodId} style={{ ...btnGreen, flex: 2, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding…' : '✓ Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Wrapper to bridge the "New Code" button in the header with InviteCodesTab's internal state
function InviteCodesTabWrapper({ productions }) {
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const handler = () => setShowForm(true)
    document.addEventListener('bridge:newCode', handler)
    return () => document.removeEventListener('bridge:newCode', handler)
  }, [])

  return <InviteCodesTabControlled productions={productions} showFormProp={showForm} onFormClose={() => setShowForm(false)} />
}

function InviteCodesTabControlled({ productions, showFormProp, onFormClose }) {
  const [invites,  setInvites]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [copied,   setCopied]   = useState(null)
  const [deleting, setDeleting] = useState(null)

  const EMPTY = { production_id: productions[0]?.id || '', code: '', label: '', role: 'MANAGER', max_uses: '', expires_at: '' }
  const [form,    setForm]    = useState({ ...EMPTY })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  // Edit state
  const [editingId,  setEditingId]  = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editErr,    setEditErr]    = useState(null)

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  function openEdit(inv) {
    setEditingId(inv.id)
    setEditForm({
      label:      inv.label      || '',
      role:       inv.role       || 'MANAGER',
      max_uses:   inv.max_uses   != null ? String(inv.max_uses) : '',
      expires_at: inv.expires_at ? inv.expires_at.slice(0, 10) : '',
    })
    setEditErr(null)
  }

  function closeEdit() {
    setEditingId(null)
    setEditErr(null)
  }

  async function handleSaveEdit(invId) {
    setEditSaving(true); setEditErr(null)
    const res = await fetch('/api/bridge/invites', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:         invId,
        label:      editForm.label.trim()   || null,
        role:       editForm.role,
        max_uses:   editForm.max_uses       ? parseInt(editForm.max_uses) : null,
        expires_at: editForm.expires_at     || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setEditErr(json.error || 'Save failed'); setEditSaving(false); return }
    setInvites(list => list.map(i => i.id === json.invite.id ? json.invite : i))
    setEditSaving(false)
    closeEdit()
  }

  // Sync external trigger
  useEffect(() => {
    if (showFormProp) setShowForm(true)
  }, [showFormProp])

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/bridge/invites')
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setInvites(json.invites || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) c += '-'
      c += chars[Math.floor(Math.random() * chars.length)]
    }
    setF('code', c)
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormErr(null); setSaving(true)
    const res = await fetch('/api/bridge/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: form.production_id,
        code:          form.code.trim().toUpperCase() || undefined,
        label:         form.label.trim() || undefined,
        role:          form.role,
        max_uses:      form.max_uses ? parseInt(form.max_uses) : null,
        expires_at:    form.expires_at || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error); setSaving(false); return }
    setInvites(inv => [json.invite, ...inv])
    setForm({ ...EMPTY })
    setShowForm(false)
    onFormClose()
    setSaving(false)
  }

  async function toggleActive(inv) {
    const res = await fetch('/api/bridge/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, active: !inv.active }),
    })
    if (res.ok) {
      const { invite } = await res.json()
      setInvites(list => list.map(i => i.id === invite.id ? invite : i))
    }
  }

  async function deleteInvite(id) {
    if (!confirm('Delete this invite code?')) return
    setDeleting(id)
    const res = await fetch('/api/bridge/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setInvites(list => list.filter(i => i.id !== id))
    setDeleting(null)
  }

  function handleCopy(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {})
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const managedProds = productions.filter(p => ['CAPTAIN','ADMIN'].includes(p.role))

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
  if (error)   return <div style={{ padding: '20px', color: '#dc2626', fontSize: '13px' }}>❌ {error}</div>

  return (
    <div>
      {showForm && (
        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '2px solid #0f2340' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '16px' }}>🔑 New Invite Code</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Production *</label>
                <select value={form.production_id} onChange={e => setF('production_id', e.target.value)} style={sel} required>
                  {managedProds.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role assigned</label>
                <select value={form.role} onChange={e => setF('role', e.target.value)} style={sel}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Code (blank = auto-generate)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                    placeholder="e.g. CREW-X7K2"
                    style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em', flex: 1 }} />
                  <button type="button" onClick={generateRandom}
                    style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    🔀 Gen
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Label (optional)</label>
                <input value={form.label} onChange={e => setF('label', e.target.value)}
                  placeholder="e.g. Crew access June" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Max uses (blank = unlimited)</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setF('max_uses', e.target.value)}
                  placeholder="e.g. 10" style={inp} />
              </div>
              <div>
                <label style={lbl}>Expires (blank = never)</label>
                <input type="date" value={form.expires_at} onChange={e => setF('expires_at', e.target.value)} style={inp} />
              </div>
            </div>
            {formErr && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {formErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setShowForm(false); onFormClose(); setFormErr(null) }} style={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.production_id}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating…' : '🔑 Create Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {invites.length === 0 && !showForm ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <div style={{ color: '#64748b', fontWeight: '600' }}>No invite codes yet</div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Create a code to let people join a specific production instantly.
          </div>
          <button onClick={() => setShowForm(true)} style={{ ...btnPrimary, marginTop: '14px' }}>
            + Create First Code
          </button>
        </div>
      ) : (
        invites.map(inv => {
          const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date()
          const isFull    = inv.max_uses !== null && inv.uses_count >= inv.max_uses
          const statusBg    = !inv.active ? '#f1f5f9' : isExpired || isFull ? '#fef2f2' : '#f0fdf4'
          const statusColor = !inv.active ? '#64748b' : isExpired || isFull ? '#dc2626' : '#16a34a'
          const statusLabel = !inv.active ? 'INACTIVE' : isExpired ? 'EXPIRED' : isFull ? 'FULL' : 'ACTIVE'

          const isEditing = editingId === inv.id

          return (
            <div key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              {/* ── Main row ── */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', opacity: !inv.active && !isEditing ? 0.65 : 1 }}>
                {/* Code */}
                <div onClick={() => handleCopy(inv.code)} title="Click to copy"
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '16px', fontWeight: '900', color: '#0f2340', letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
                  {inv.code}
                  <span style={{ fontSize: '11px', marginLeft: '8px', color: '#94a3b8', fontFamily: 'sans-serif', fontWeight: '400' }}>
                    {copied === inv.code ? '✓ copied' : '📋'}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                      {inv.productions?.name || '—'}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', fontWeight: '700' }}>
                      {inv.role}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: statusBg, color: statusColor, fontSize: '10px', fontWeight: '700' }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {inv.label && <span style={{ marginRight: '8px' }}>📝 {inv.label}</span>}
                    <span>Uses: <strong>{inv.uses_count}</strong>{inv.max_uses ? `/${inv.max_uses}` : ''}</span>
                    <span style={{ margin: '0 8px' }}>·</span>
                    <span>{inv.expires_at ? `Expires ${fmtDate(inv.expires_at)}` : 'No expiry'}</span>
                    <span style={{ margin: '0 8px' }}>·</span>
                    <span>Created {fmt(inv.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => isEditing ? closeEdit() : openEdit(inv)}
                    style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px', background: isEditing ? '#eff6ff' : 'white', borderColor: isEditing ? '#bfdbfe' : '#e2e8f0', color: isEditing ? '#1d4ed8' : '#475569' }}>
                    {isEditing ? '✕ Cancel' : '✏️ Edit'}
                  </button>
                  <button onClick={() => toggleActive(inv)}
                    style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>
                    {inv.active ? '⏸ Pause' : '▶ Enable'}
                  </button>
                  <button onClick={() => deleteInvite(inv.id)} disabled={deleting === inv.id}
                    style={{ ...btnRed, fontSize: '11px', padding: '5px 10px', opacity: deleting === inv.id ? 0.6 : 1 }}>
                    {deleting === inv.id ? '…' : '🗑'}
                  </button>
                </div>
              </div>

              {/* ── Inline edit form ── */}
              {isEditing && (
                <div style={{ padding: '14px 20px 16px', background: '#f8fafc', borderTop: '1px solid #e0f2fe' }}>
                  <div style={{ fontWeight: '700', fontSize: '12px', color: '#1d4ed8', marginBottom: '12px' }}>
                    ✏️ Edit Invite — <span style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{inv.code}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={lbl}>Label (optional)</label>
                      <input
                        value={editForm.label}
                        onChange={e => setEF('label', e.target.value)}
                        placeholder="e.g. Crew access June"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Role assigned</label>
                      <select value={editForm.role} onChange={e => setEF('role', e.target.value)} style={sel}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={lbl}>Max uses (blank = unlimited)</label>
                      <input
                        type="number" min="1"
                        value={editForm.max_uses}
                        onChange={e => setEF('max_uses', e.target.value)}
                        placeholder="e.g. 10"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Expires (blank = never)</label>
                      <input
                        type="date"
                        value={editForm.expires_at}
                        onChange={e => setEF('expires_at', e.target.value)}
                        style={inp}
                      />
                    </div>
                  </div>
                  {editErr && (
                    <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>❌ {editErr}</div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={closeEdit} style={{ ...btnSecondary, fontSize: '12px' }}>Cancel</button>
                    <button
                      onClick={() => handleSaveEdit(inv.id)}
                      disabled={editSaving}
                      style={{ ...btnPrimary, fontSize: '12px', opacity: editSaving ? 0.6 : 1 }}>
                      {editSaving ? 'Saving…' : '✓ Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Online Users Widget ───────────────────────────────────
function OnlineUsersWidget({ productionId, userId, userEmail, userRole }) {
  const onlineUsers = useOnlinePresence({
    productionId,
    userId,
    email: userEmail,
    page:  '/dashboard/bridge',
    role:  userRole || '',
  })

  if (!onlineUsers.length) return null

  return (
    <div style={{ ...card, borderLeft: '4px solid #22c55e', marginBottom: '20px' }}>
      {/* Header */}
      <div style={hdr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
            Online Now
          </span>
          <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: '700' }}>
            {onlineUsers.length} {onlineUsers.length === 1 ? 'user' : 'users'}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>live · Supabase Realtime</span>
      </div>

      {/* User rows */}
      <div style={{ padding: '4px 0' }}>
        {onlineUsers.map((u, i) => {
          const rs = getRoleStyle(u.role)
          const isMe = u.user_id === userId
          return (
            <div key={u.user_id || i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 20px',
              borderBottom: i < onlineUsers.length - 1 ? '1px solid #f1f5f9' : 'none',
              background: isMe ? '#f0fdf4' : 'transparent',
            }}>
              {/* Avatar */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: getAvatarColor(u.user_id),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: '12px', fontWeight: '900', flexShrink: 0,
              }}>
                {getInitials(u.email)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.email || u.user_id}
                  {isMe && (
                    <span style={{ marginLeft: '7px', fontSize: '10px', color: '#22c55e', fontWeight: '700', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px' }}>
                      you
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {u.role && (
                    <span style={{ background: rs.bg, color: rs.color, padding: '1px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '10px' }}>
                      {u.role}
                    </span>
                  )}
                  {u.page && (
                    <span style={{ color: '#475569' }}>{getPageLabel(u.page)}</span>
                  )}
                </div>
              </div>

              {/* Time online */}
              <div style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                {fmtOnlineSince(u.online_at)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function BridgePage() {
  const router = useRouter()
  // productionId is always available from localStorage/env — no DB query needed
  const productionId = getProductionId()
  const [user,        setUser]        = useState(null)
  const [productions, setProductions] = useState([])
  const [role,        setRole]        = useState(null)
  const [tab,         setTab]         = useState('overview')  // 'overview' | 'pending' | 'invites'
  const [loading,     setLoading]     = useState(true)
  const [importCtx,   setImportCtx]   = useState(null)   // for DriveSyncWidget preview
  const [refreshKey,  setRefreshKey]  = useState(0)
  const isMobile = useIsMobile()

  // ── locations (needed for DriveSyncWidget import modal) ──
  const [locations, setLocations] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setUser(session.user)

      // Load role + productions — wait for this before showing the page
      // so that admin tabs (Pending Users, Invite Codes) are visible on first render.
      // productionId is already available via getProductionId(), so Overview always works.
      supabase
        .from('production_members')
        .select('production_id, role, productions(id, name)')
        .eq('user_id', session.user.id)
        .then(({ data }) => {
          const prods = (data || []).map(m => ({
            id:   m.productions?.id   || m.production_id,
            name: m.productions?.name || m.production_id,
            role: m.role,
          }))
          setProductions(prods)

          // Determine role for the active production (for admin tabs)
          const match = prods.find(p => p.id === productionId) || prods[0]
          if (match) setRole(match.role)
          setLoading(false)
        })
        .catch(() => setLoading(false))  // failsafe: never hang if DB unreachable
    })
  }, [router])

  useEffect(() => {
    if (!productionId) return
    supabase.from('locations').select('id, name').eq('production_id', productionId)
      .then(({ data }) => setLocations(data || []))
  }, [productionId])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8', fontSize: '14px' }}>Loading…</div>
      </div>
    )
  }

  const TABS = [
    { id: 'overview', label: '⚓ Overview' },
    { id: 'pending',  label: '👥 Pending Users' },
    { id: 'invites',  label: '🔑 Invite Codes' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar user={user} productions={productions} activeProductionId={productionId} />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '12px' : '24px 20px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '900', color: '#0f2340', margin: 0 }}>
              ⚓ Captain Bridge
            </h1>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
              Production command centre
            </div>
          </div>
          {tab === 'invites' && (
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('bridge:newCode'))}
              style={{ ...btnPrimary, fontSize: '13px', padding: '8px 16px' }}>
              + New Code
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '4px' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '7px',
                border: 'none',
                background: tab === t.id ? '#0f2340' : 'transparent',
                color:      tab === t.id ? 'white' : '#64748b',
                fontSize:   '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === 'overview' && productionId && (
          <>
            <OnlineUsersWidget
              productionId={productionId}
              userId={user?.id}
              userEmail={user?.email}
              userRole={role}
            />
            <NotificationsPanel productionId={productionId} />
            <DriveSyncWidget
              productionId={productionId}
              refreshKey={refreshKey}
              onPreview={ctx => setImportCtx({ ...ctx, locations })}
            />
            <TravelDiscrepanciesWidget productionId={productionId} refreshKey={refreshKey} />
            <CrewDuplicatesWidget
              productionId={productionId}
              locations={locations}
              onMerged={() => setRefreshKey(k => k + 1)}
            />
            <TomorrowPanel productionId={productionId} />
            <ArrivalsDeparturesChart productionId={productionId} />
            <MiniWidgets productionId={productionId} />
            <VehicleRentalWidget productionId={productionId} />
            <ActivityLog productionId={productionId} />
          </>
        )}

        {/* ── Pending Users tab ── */}
        {tab === 'pending' && (
          <div style={card}>
            <div style={hdr}>
              <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f2340' }}>👥 Pending Users</span>
            </div>
            <PendingUsersTab productions={productions} />
          </div>
        )}

        {/* ── Invite Codes tab ── */}
        {tab === 'invites' && (
          <div style={card}>
            <div style={hdr}>
              <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f2340' }}>🔑 Invite Codes</span>
            </div>
            <InviteCodesTabWrapper productions={productions} />
          </div>
        )}

      </div>

      {/* Import modal (triggered by DriveSyncWidget preview) */}
      {importCtx && (
        <ImportModal
          open={true}
          initialFile={importCtx.fileObj}
          selMode={importCtx.selMode}
          locations={importCtx.locations}
          productionId={productionId}
          onClose={() => { setImportCtx(null); setRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
