'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { getProductionId } from './production'
import { RENTAL_COLUMNS_CATALOG, RENTAL_DEFAULT_PRESET } from './rentalColumnsCatalog'

export function RentalColumnsEditorSidebar({ open, onClose, onChanged }) {
  const PRODUCTION_ID = getProductionId()
  const [cols, setCols]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [applyingPreset, setAP]   = useState(false)
  const [error, setError]         = useState(null)
  const [editId, setEditId]       = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editWidth, setEditWidth] = useState('')

  const load = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase
      .from('rental_list_columns')
      .select('*')
      .eq('production_id', PRODUCTION_ID)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    setCols(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  useEffect(() => { if (open) load() }, [open, load])

  async function applyPreset() {
    if (!PRODUCTION_ID || applyingPreset) return
    setAP(true)
    try {
      if (cols.length > 0) {
        const ok = confirm(`This production already has ${cols.length} columns. Apply Default Preset will REPLACE them. Continue?`)
        if (!ok) { setAP(false); return }
        await supabase.from('rental_list_columns').delete().eq('production_id', PRODUCTION_ID)
      }
      const rows = RENTAL_DEFAULT_PRESET.map(p => ({ ...p, production_id: PRODUCTION_ID }))
      const { error } = await supabase.from('rental_list_columns').insert(rows)
      if (error) throw error
      await load()
      onChanged()
    } catch (e) { setError(e.message) }
    finally { setAP(false) }
  }

  async function handleDelete(id) {
    await supabase.from('rental_list_columns').delete().eq('id', id)
    await load(); onChanged()
  }

  async function handleEditSave(id) {
    setSaving(true)
    await supabase.from('rental_list_columns').update({ header_label: editLabel.trim(), width: editWidth.trim() || '120px' }).eq('id', id)
    setSaving(false)
    setEditId(null)
    await load(); onChanged()
  }

  async function moveUp(idx) {
    if (idx === 0) return
    const a = cols[idx - 1]; const b = cols[idx]
    await supabase.from('rental_list_columns').update({ display_order: b.display_order }).eq('id', a.id)
    await supabase.from('rental_list_columns').update({ display_order: a.display_order }).eq('id', b.id)
    await load(); onChanged()
  }

  async function moveDown(idx) {
    if (idx === cols.length - 1) return
    const a = cols[idx]; const b = cols[idx + 1]
    await supabase.from('rental_list_columns').update({ display_order: b.display_order }).eq('id', a.id)
    await supabase.from('rental_list_columns').update({ display_order: a.display_order }).eq('id', b.id)
    await load(); onChanged()
  }

  const inp = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>🔑 Rental List Columns</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {error && <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}

          <button onClick={applyPreset} disabled={applyingPreset}
            style={{ width: '100%', marginBottom: '16px', padding: '8px', borderRadius: '8px', border: '1px solid #0f2340', background: applyingPreset ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '12px', fontWeight: '800', cursor: applyingPreset ? 'default' : 'pointer' }}>
            {applyingPreset ? 'Applying...' : '⚡ Apply Default Preset'}
          </button>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</div>
          ) : cols.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>No columns configured. Apply the default preset to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {cols.map((col, idx) => (
                <div key={col.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
                  {editId === col.id ? (
                    <div>
                      <div style={{ marginBottom: '6px' }}>
                        <label style={lbl}>Header Label</label>
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={inp} autoFocus />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={lbl}>Width</label>
                        <input value={editWidth} onChange={e => setEditWidth(e.target.value)} style={inp} placeholder="120px" />
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => handleEditSave(col.id)} disabled={saving} style={{ flex: 2, padding: '5px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                          {saving ? 'Saving...' : '✓ Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{col.header_label}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{col.source_field} · {col.width}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                        <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #e2e8f0', background: 'white', cursor: idx === 0 ? 'default' : 'pointer', fontSize: '11px', color: idx === 0 ? '#cbd5e1' : '#374151' }}>↑</button>
                        <button onClick={() => moveDown(idx)} disabled={idx === cols.length - 1} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #e2e8f0', background: 'white', cursor: idx === cols.length - 1 ? 'default' : 'pointer', fontSize: '11px', color: idx === cols.length - 1 ? '#cbd5e1' : '#374151' }}>↓</button>
                        <button onClick={() => { setEditId(col.id); setEditLabel(col.header_label); setEditWidth(col.width) }} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '11px', color: '#374151' }}>✎</button>
                        <button onClick={() => handleDelete(col.id)} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #fecaca', background: '#fff1f2', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Close</button>
        </div>
      </div>
    </>
  )
}
