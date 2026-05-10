'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getProductionId } from './production'
import { COLUMNS_CATALOG, CAPTAIN_PRESET, getCatalogByCategory } from './listColumnsCatalog'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SIDEBAR_W = 360

function SortableColumnRow({ column, isEditing, def, onStartEdit, onCancelEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 10px',
    background: isEditing ? '#fffbeb' : '#f8fafc',
    border: '1px solid ' + (isEditing ? '#fbbf24' : '#e2e8f0'),
    borderRadius: '7px',
    touchAction: 'none',
  }
  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: '#94a3b8', fontSize: '14px', flexShrink: 0, userSelect: 'none', padding: '0 4px' }}
        title="Drag to reorder">
        ⋮⋮
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {column.header_label}
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {def ? def.label : <span style={{ color: '#dc2626' }}>?{column.source_field}</span>} · {column.width}
        </div>
      </div>
      <button
        type="button"
        onClick={() => isEditing ? onCancelEdit() : onStartEdit(column)}
        style={{ background: isEditing ? '#fbbf24' : 'white', border: '1px solid #e2e8f0', color: isEditing ? 'white' : '#64748b', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
        {isEditing ? 'cancel' : 'edit'}
      </button>
      <button
        type="button"
        onClick={() => onDelete(column)}
        style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
        delete
      </button>
    </div>
  )
}

const WIDTH_OPTIONS = [
  { value: '60px',  label: '60px (very narrow)' },
  { value: '80px',  label: '80px (narrow)' },
  { value: '100px', label: '100px (small)' },
  { value: '120px', label: '120px (medium)' },
  { value: '140px', label: '140px (wide)' },
  { value: '160px', label: '160px (extra wide)' },
  { value: '200px', label: '200px (very wide)' },
  { value: '1fr',   label: 'Flex (fill remaining space)' },
]

export function ColumnsEditorSidebar({ open, onClose, onChanged }) {
  const PRODUCTION_ID = getProductionId()
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    header_label: '',
    source_field: '',
    width: '110px',
  })
  const [saving, setSaving] = useState(false)

  const catalogByCategory = getCatalogByCategory()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = columns.findIndex(c => c.id === active.id)
    const newIdx = columns.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(columns, oldIdx, newIdx)
    // Optimistic UI update
    setColumns(reordered)
    // Persist new display_order values: 10, 20, 30...
    try {
      await Promise.all(reordered.map((c, i) =>
        supabase
          .from('transport_list_columns')
          .update({ display_order: (i + 1) * 10, updated_at: new Date().toISOString() })
          .eq('id', c.id)
      ))
      onChanged?.()
    } catch (e) {
      setError('Reorder failed: ' + (e.message || 'unknown'))
      // Reload from DB to revert UI
      loadColumns()
    }
  }

  async function loadColumns() {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data, error } = await supabase
      .from('transport_list_columns')
      .select('*')
      .eq('production_id', PRODUCTION_ID)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setColumns(data || [])
    setLoading(false)
  }

  useEffect(() => { if (open) loadColumns() }, [open])

  function startEdit(c) {
    setEditingId(c.id)
    setForm({
      header_label: c.header_label,
      source_field: c.source_field,
      width:        c.width || '110px',
    })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm({ header_label: '', source_field: '', width: '110px' })
    setError(null)
  }

  function pickField(key) {
    const def = COLUMNS_CATALOG[key]
    if (!def) return
    setForm(f => ({
      ...f,
      source_field: key,
      header_label: f.header_label || def.label,
      width:        f.width || def.defaultWidth || '110px',
    }))
  }

  async function handleSave() {
    if (!form.header_label.trim() || !form.source_field) {
      setError('Header label and source field are required')
      return
    }
    if (!COLUMNS_CATALOG[form.source_field]) {
      setError('Unknown source field: ' + form.source_field)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const { error: e } = await supabase
          .from('transport_list_columns')
          .update({
            header_label: form.header_label.trim(),
            source_field: form.source_field,
            width:        form.width,
            updated_at:   new Date().toISOString(),
          })
          .eq('id', editingId)
        if (e) throw e
      } else {
        const nextOrder = columns.length > 0
          ? Math.max(...columns.map(c => c.display_order || 0)) + 10
          : 10
        const { error: e } = await supabase
          .from('transport_list_columns')
          .insert({
            production_id: PRODUCTION_ID,
            header_label: form.header_label.trim(),
            source_field: form.source_field,
            width:        form.width,
            display_order: nextOrder,
          })
        if (e) throw e
      }
      cancelEdit()
      await loadColumns()
      onChanged?.()
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c) {
    if (!confirm('Delete column "' + c.header_label + '"?')) return
    setError(null)
    const { error } = await supabase
      .from('transport_list_columns')
      .delete()
      .eq('id', c.id)
    if (error) { setError(error.message); return }
    await loadColumns()
    onChanged?.()
  }

  async function handleResetToCaptainPreset() {
    if (!PRODUCTION_ID) return
    if (columns.length > 0) {
      const ok = confirm('This will REPLACE all current columns with the Captain Preset (6 default columns). Continue?')
      if (!ok) return
    }
    setSaving(true)
    setError(null)
    try {
      if (columns.length > 0) {
        const { error: delErr } = await supabase
          .from('transport_list_columns')
          .delete()
          .eq('production_id', PRODUCTION_ID)
        if (delErr) throw delErr
      }
      const rows = CAPTAIN_PRESET.map(p => ({ ...p, production_id: PRODUCTION_ID }))
      const { error: insErr } = await supabase
        .from('transport_list_columns')
        .insert(rows)
      if (insErr) throw insErr
      cancelEdit()
      await loadColumns()
      onChanged?.()
    } catch (e) {
      setError(e.message || 'Reset failed')
    } finally {
      setSaving(false)
    }
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '7px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: SIDEBAR_W + 'px', background: 'white',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50,
        transform: open ? 'translateX(0)' : 'translateX(' + SIDEBAR_W + 'px)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Customize</div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>Columns editor</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>x</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Active columns list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Active columns ({columns.length}) — drag ⋮⋮ to reorder
              </div>
              <button
                type="button"
                onClick={handleResetToCaptainPreset}
                disabled={saving}
                style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', border: '1px solid #2563eb', background: 'white', color: '#2563eb', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
                Reset to Captain Preset
              </button>
            </div>
            {loading ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading...</div>
            ) : columns.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', fontStyle: 'italic', border: '1px dashed #e2e8f0', borderRadius: '7px' }}>
                No columns yet. Add one below or click &quot;Reset to Captain Preset&quot;.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {columns.map(c => (
                      <SortableColumnRow
                        key={c.id}
                        column={c}
                        def={COLUMNS_CATALOG[c.source_field]}
                        isEditing={editingId === c.id}
                        onStartEdit={startEdit}
                        onCancelEdit={cancelEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add / Edit form */}
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '10px 12px', background: '#f8fafc' }}>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
              {editingId ? 'Edit column' : '+ Add new column'}
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={lbl}>Source field (from DB)</label>
              <select
                value={form.source_field}
                onChange={e => pickField(e.target.value)}
                style={{ ...inp, fontSize: '12px' }}>
                <option value="">— Choose field —</option>
                {Object.entries(catalogByCategory).map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items.map(it => (
                      <option key={it.key} value={it.key}>{it.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={lbl}>Header label</label>
              <input
                type="text"
                value={form.header_label}
                onChange={e => setForm(f => ({ ...f, header_label: e.target.value }))}
                placeholder="e.g. Vehicle, Driver, Time..."
                style={inp} />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>Width</label>
              <select
                value={form.width}
                onChange={e => setForm(f => ({ ...f, width: e.target.value }))}
                style={{ ...inp, fontSize: '12px' }}>
                {WIDTH_OPTIONS.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: saving ? 'default' : 'pointer' }}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.header_label.trim() || !form.source_field}
                style={{
                  flex: 2,
                  padding: '8px', borderRadius: '7px', border: 'none',
                  background: (saving || !form.header_label.trim() || !form.source_field) ? '#cbd5e1' : '#2563eb',
                  color: 'white', fontSize: '13px', fontWeight: '800',
                  cursor: (saving || !form.header_label.trim() || !form.source_field) ? 'default' : 'pointer',
                }}>
                {saving ? 'Saving...' : (editingId ? 'Update column' : '+ Add column')}
              </button>
            </div>
          </div>

        </div>

        {error && <div style={{ margin: '0 16px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#dc2626', fontSize: '12px' }}>Error: {error}</div>}

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', flexShrink: 0, background: 'white' }}>
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
