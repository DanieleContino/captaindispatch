'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getProductionId } from './production'

const SIDEBAR_W = 440

export function SectionsManagerSidebar({ open, onClose, date }) {
  const PRODUCTION_ID = getProductionId()
  const [sections, setSections] = useState([])
  const [newName, setNewName]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

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

  async function handleAdd() {
    const name = newName.trim()
    if (!name || !PRODUCTION_ID || !date) return
    setError(null)
    const nextOrder = sections.length > 0
      ? Math.max(...sections.map(s => s.display_order || 0)) + 10
      : 0
    const { error } = await supabase
      .from('transport_list_sections')
      .insert({
        production_id: PRODUCTION_ID,
        date,
        name,
        display_order: nextOrder,
      })
    if (error) { setError(error.message); return }
    setNewName('')
    loadSections()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this section? Trips assigned to it will become unassigned.')) return
    setError(null)
    const { error } = await supabase
      .from('transport_list_sections')
      .delete()
      .eq('id', id)
    if (error) { setError(error.message); return }
    loadSections()
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }

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
          {/* Add new */}
          <div>
            <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>
              New section
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
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
          </div>

          {/* Existing sections */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Sections ({sections.length})
            </div>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading...</div>
            ) : sections.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', fontStyle: 'italic', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                No sections for this day. Create the first one above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sections.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                      Delete
                    </button>
                  </div>
                ))}
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
