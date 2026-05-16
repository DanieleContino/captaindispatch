'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

/**
 * SubgroupManagerSidebar
 * Shown when the coordinator clicks ⚙ Subgroups on a hotel header.
 * Allows creating/renaming/deleting subgroups for a given hotel.
 *
 * Props:
 *   open         – boolean
 *   hotelId      – uuid of the hotel (locations.id)
 *   hotelName    – display name
 *   productionId – uuid
 *   onClose      – () => void
 *   onChanged    – () => void  – called after any mutation so parent reloads
 */
export default function SubgroupManagerSidebar({ open, hotelId, hotelName, productionId, onClose, onChanged }) {
  const [subgroups, setSubgroups]   = useState([])
  const [loading,   setLoading]     = useState(false)
  const [newName,   setNewName]     = useState('')
  const [adding,    setAdding]      = useState(false)
  const [editId,    setEditId]      = useState(null)
  const [editName,  setEditName]    = useState('')
  const [savingId,  setSavingId]    = useState(null)
  const [deletingId,setDeletingId]  = useState(null)
  const [error,     setError]       = useState(null)

  useEffect(() => {
    if (!open || !hotelId || !productionId) return
    load()
  }, [open, hotelId, productionId])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('hotel_subgroups')
      .select('*')
      .eq('production_id', productionId)
      .eq('hotel_id', hotelId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setSubgroups(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setError(null)
    const maxOrder = subgroups.reduce((m, s) => Math.max(m, s.display_order), -1)
    const { error } = await supabase
      .from('hotel_subgroups')
      .insert({ production_id: productionId, hotel_id: hotelId, name, display_order: maxOrder + 1 })
    if (error) { setError(error.message); setAdding(false); return }
    setNewName('')
    setAdding(false)
    await load()
    onChanged && onChanged()
  }

  async function handleSaveEdit(id) {
    const name = editName.trim()
    if (!name) return
    setSavingId(id)
    setError(null)
    const { error } = await supabase.from('hotel_subgroups').update({ name }).eq('id', id)
    if (error) { setError(error.message); setSavingId(null); return }
    setSavingId(null)
    setEditId(null)
    await load()
    onChanged && onChanged()
  }

  async function handleDelete(id) {
    setDeletingId(id)
    setError(null)
    const { error } = await supabase.from('hotel_subgroups').delete().eq('id', id)
    if (error) { setError(error.message); setDeletingId(null); return }
    setDeletingId(null)
    await load()
    onChanged && onChanged()
  }

  if (!open) return null

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.25)',
    display: 'flex', justifyContent: 'flex-end',
  }
  const panelStyle = {
    width: '340px', height: '100%', background: 'white',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>⚙ Subgroups</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏨 {hotelName}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', padding: '0', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 14px' }}>
            Subgroups let you split this hotel's costs by section (e.g. <em>IT Crew</em>, <em>US Crew</em>). Each stay can then be assigned to a subgroup.
          </p>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#dc2626', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: '12px' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {subgroups.map(sg => (
                <div key={sg.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {editId === sg.id ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(sg.id); if (e.key === 'Escape') setEditId(null) }}
                        style={{ flex: 1, border: '1px solid #93c5fd', borderRadius: '5px', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
                      />
                      <button onClick={() => handleSaveEdit(sg.id)} disabled={savingId === sg.id}
                        style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>
                        {savingId === sg.id ? '…' : '✓'}
                      </button>
                      <button onClick={() => setEditId(null)}
                        style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{sg.name}</span>
                      <button onClick={() => { setEditId(sg.id); setEditName(sg.name) }}
                        style={{ background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#64748b', padding: '2px' }} title="Rename">✏️</button>
                      <button onClick={() => handleDelete(sg.id)} disabled={deletingId === sg.id}
                        style={{ background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#ef4444', padding: '2px' }} title="Delete">
                        {deletingId === sg.id ? '…' : '🗑️'}
                      </button>
                    </>
                  )}
                </div>
              ))}

              {subgroups.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '12px' }}>No subgroups yet. Add one below.</div>
              )}
            </div>
          )}
        </div>

        {/* Add new */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>Add Subgroup</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="e.g. IT Crew"
              style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 10px', fontSize: '12px', outline: 'none' }}
            />
            <button onClick={handleAdd} disabled={adding || !newName.trim()}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', opacity: adding || !newName.trim() ? 0.5 : 1 }}>
              {adding ? '…' : '+ Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
