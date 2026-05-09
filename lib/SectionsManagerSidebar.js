'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getProductionId } from './production'

const SIDEBAR_W = 440

function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}

export function SectionsManagerSidebar({ open, onClose, date }) {
  const PRODUCTION_ID = getProductionId()
  const [sections, setSections] = useState([])
  const [newName, setNewName]   = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [copying, setCopying]   = useState(false)

  async function loadSections() {
    if (!PRODUCTION_ID || !date) return
    setLoading(true)
    const { data, error } = await supabase
      .from('transport_list_sections')
      .select('*')
      .eq('production_id', PRODUCTION_ID)
      .eq('date', date)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setSections(data || [])
    setLoading(false)
  }

  useEffect(() => { if (open) loadSections() }, [open, date])

  // Build hierarchy: macros at top, subs grouped under their parent
  const macros = sections.filter(s => !s.parent_id)
  const subsByParent = sections.reduce((acc, s) => {
    if (s.parent_id) {
      if (!acc[s.parent_id]) acc[s.parent_id] = []
      acc[s.parent_id].push(s)
    }
    return acc
  }, {})

  async function handleAdd() {
    const name = newName.trim()
    if (!name || !PRODUCTION_ID || !date) return
    setError(null)
    const siblings = newParentId
      ? (subsByParent[newParentId] || [])
      : macros
    const nextOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.display_order || 0)) + 10
      : 0
    const { error } = await supabase
      .from('transport_list_sections')
      .insert({
        production_id: PRODUCTION_ID,
        date,
        name,
        parent_id: newParentId || null,
        display_order: nextOrder,
      })
    if (error) { setError(error.message); return }
    setNewName('')
    loadSections()
  }

  async function handleDelete(id, hasChildren) {
    const msg = hasChildren
      ? 'Delete this MACRO and all its SUB sections? Trips assigned to them will become unassigned.'
      : 'Delete this section? Trips assigned to it will become unassigned.'
    if (!confirm(msg)) return
    setError(null)
    const { error } = await supabase
      .from('transport_list_sections')
      .delete()
      .eq('id', id)
    if (error) { setError(error.message); return }
    loadSections()
  }

  async function handleMove(section, direction) {
    // direction = -1 (up) or +1 (down)
    setError(null)
    const siblings = section.parent_id
      ? (subsByParent[section.parent_id] || [])
      : macros
    const idx = siblings.findIndex(s => s.id === section.id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const other = siblings[swapIdx]
    // Swap display_order values
    const orderA = section.display_order
    const orderB = other.display_order
    // If they're equal, generate new distinct values
    const newA = orderA !== orderB ? orderB : orderA + direction * 5
    const newB = orderA !== orderB ? orderA : orderA - direction * 5
    const [r1, r2] = await Promise.all([
      supabase.from('transport_list_sections').update({ display_order: newA }).eq('id', section.id),
      supabase.from('transport_list_sections').update({ display_order: newB }).eq('id', other.id),
    ])
    if (r1.error || r2.error) {
      setError((r1.error || r2.error).message)
      return
    }
    loadSections()
  }

  async function handleCopyFromYesterday() {
    if (!PRODUCTION_ID || !date) return
    if (sections.length > 0) {
      if (!confirm('This day already has sections. Copy from yesterday will ADD yesterday\'s sections on top. Continue?')) return
    }
    setCopying(true)
    setError(null)
    const yesterday = isoAdd(date, -1)
    const { data: prev, error: fetchErr } = await supabase
      .from('transport_list_sections')
      .select('*')
      .eq('production_id', PRODUCTION_ID)
      .eq('date', yesterday)
      .order('display_order', { ascending: true })
    if (fetchErr) { setCopying(false); setError(fetchErr.message); return }
    if (!prev || prev.length === 0) {
      setCopying(false)
      setError('No sections found for yesterday (' + yesterday + ').')
      return
    }
    // Insert macros first, capture old_id -> new_id mapping, then subs with remapped parent_id
    const oldToNew = {}
    const macrosToCopy = prev.filter(s => !s.parent_id)
    const subsToCopy   = prev.filter(s => s.parent_id)
    for (const m of macrosToCopy) {
      const { data: inserted, error: insErr } = await supabase
        .from('transport_list_sections')
        .insert({
          production_id: PRODUCTION_ID,
          date,
          name: m.name,
          parent_id: null,
          display_order: m.display_order,
        })
        .select('id')
        .single()
      if (insErr || !inserted) { setCopying(false); setError(insErr?.message || 'macro insert failed'); return }
      oldToNew[m.id] = inserted.id
    }
    for (const s of subsToCopy) {
      const newParent = oldToNew[s.parent_id]
      if (!newParent) continue   // orphan sub, skip silently
      const { error: insErr } = await supabase
        .from('transport_list_sections')
        .insert({
          production_id: PRODUCTION_ID,
          date,
          name: s.name,
          parent_id: newParent,
          display_order: s.display_order,
        })
      if (insErr) { setCopying(false); setError(insErr.message); return }
    }
    setCopying(false)
    loadSections()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }

  function SectionRow({ section, isSub, siblingIdx, siblingCount, hasChildren }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 10px',
        marginLeft: isSub ? '20px' : '0',
        background: isSub ? 'white' : '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '7px',
      }}>
        {/* Up/down arrows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
          <button type="button" onClick={() => handleMove(section, -1)} disabled={siblingIdx === 0}
            style={{ background: 'transparent', border: 'none', cursor: siblingIdx === 0 ? 'default' : 'pointer', color: siblingIdx === 0 ? '#cbd5e1' : '#64748b', fontSize: '10px', padding: '0 4px', lineHeight: 1 }}>
            UP
          </button>
          <button type="button" onClick={() => handleMove(section, +1)} disabled={siblingIdx === siblingCount - 1}
            style={{ background: 'transparent', border: 'none', cursor: siblingIdx === siblingCount - 1 ? 'default' : 'pointer', color: siblingIdx === siblingCount - 1 ? '#cbd5e1' : '#64748b', fontSize: '10px', padding: '0 4px', lineHeight: 1 }}>
            DN
          </button>
        </div>
        {/* Name */}
        <span style={{
          flex: 1, fontSize: isSub ? '12px' : '13px',
          fontWeight: isSub ? '500' : '700',
          color: '#0f172a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {isSub ? section.name : section.name.toUpperCase()}
        </span>
        {!isSub && (
          <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0, fontWeight: '700', letterSpacing: '0.04em' }}>MACRO</span>
        )}
        <button
          type="button"
          onClick={() => handleDelete(section.id, hasChildren)}
          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
          Delete
        </button>
      </div>
    )
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: `${SIDEBAR_W}px`, background: 'white',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50,
        transform: open ? 'translateX(0)' : `translateX(${SIDEBAR_W}px)`,
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Manage sections</div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>Sections - {date}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>x</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Copy from yesterday */}
          <button
            type="button"
            onClick={handleCopyFromYesterday}
            disabled={copying}
            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #bfdbfe', background: copying ? '#f1f5f9' : '#eff6ff', color: copying ? '#94a3b8' : '#1d4ed8', fontSize: '12px', fontWeight: '700', cursor: copying ? 'default' : 'pointer' }}>
            {copying ? 'Copying...' : 'Copy sections from yesterday'}
          </button>

          {/* Add new */}
          <div>
            <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>
              New section
            </label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="e.g. NAPLES, Director's scout..."
                style={{ ...inp, flex: 1 }}
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim()}
                style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: newName.trim() ? '#2563eb' : '#cbd5e1', color: 'white', fontSize: '13px', fontWeight: '800', cursor: newName.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                + Add
              </button>
            </div>
            <select
              value={newParentId}
              onChange={e => setNewParentId(e.target.value)}
              style={{ ...inp, fontSize: '12px' }}>
              <option value="">No parent (top-level MACRO)</option>
              {macros.map(m => (
                <option key={m.id} value={m.id}>Inside MACRO: {m.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Existing sections */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Sections ({sections.length})
            </div>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading...</div>
            ) : macros.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', fontStyle: 'italic', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                No sections for this day. Create the first one above, or copy from yesterday.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {macros.map((m, mi) => {
                  const subs = subsByParent[m.id] || []
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <SectionRow
                        section={m}
                        isSub={false}
                        siblingIdx={mi}
                        siblingCount={macros.length}
                        hasChildren={subs.length > 0}
                      />
                      {subs.map((s, si) => (
                        <SectionRow
                          key={s.id}
                          section={s}
                          isSub={true}
                          siblingIdx={si}
                          siblingCount={subs.length}
                          hasChildren={false}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>Error: {error}</div>}

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0, background: 'white' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}
