'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { getBlocksByZone, getBlockDef } from './tlBlocksCatalog'
import {
  loadActiveTemplate, applyTemplateToProduction,
  createTemplateFromPreset, listUserTemplates,
  addBlock as dbAddBlock, removeBlock as dbRemoveBlock,
  reorderBlocks as dbReorderBlocks,
  updateBlock as dbUpdateBlock,
  updateTemplateAlignment as dbUpdateAlignment,
  setBlockParent as dbSetParent,
  unsetBlockParent as dbUnsetParent,
} from './tlTemplatesDb'
import { BlockConfigForm, BlockConfigContext } from './BlockConfigForms'

// ─── Styles ──────────────────────────────────────────────────
const ZONE_BAR_COLORS = {
  header: '#1e293b',
  footer: '#475569',
}

// ─── Sortable block row ──────────────────────────────────────
function SortableBlockRow({ block, isExpanded, onToggle, onDelete, onPatch, onMakeChild, onUnparent, canMakeChild, isChild, productionId }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const def = getBlockDef(block.block_type)
  const label = def?.label || block.block_type

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          background: isChild ? '#faf5ff' : (isExpanded ? '#f1f5f9' : '#fafafa'),
          border: '1px solid ' + (isChild ? '#c4b5fd' : (isExpanded ? '#cbd5e1' : '#e2e8f0')),
          borderRadius: 6,
          cursor: 'pointer',
          marginBottom: 4,
          marginLeft: isChild ? 20 : 0,
        }}
      >
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: 'grab', color: '#94a3b8', fontSize: 14,
            userSelect: 'none', padding: '0 4px',
          }}
          title="Drag to reorder"
        >
          ⋮⋮
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
          {block.width}
        </span>
        {isChild && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnparent() }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#0f172a', fontSize: 11, padding: '0 6px',
              fontWeight: 700,
            }}
            title="Unparent (move out of column)"
          >
            ↑
          </button>
        )}
        {!isChild && canMakeChild && (
          <button
            onClick={(e) => { e.stopPropagation(); onMakeChild() }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#64748b', fontSize: 11, padding: '0 6px',
              fontWeight: 700,
            }}
            title="Make child of previous block (stack vertically)"
          >
            ↳
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#94a3b8', fontSize: 14, padding: '0 4px',
          }}
          title="Remove block"
        >
          ✕
        </button>
      </div>

      {isExpanded && (
        <div style={{
          padding: '12px',
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          marginTop: -4,
          marginBottom: 8,
          fontSize: 12,
          color: '#475569',
        }}>
          <BlockConfigForm block={block} onPatch={onPatch} productionId={productionId} />
        </div>
      )}
    </div>
  )
}

// ─── Add-block dropdown ──────────────────────────────────────
function AddBlockDropdown({ zone, onAdd }) {
  const [open, setOpen] = useState(false)
  const byCategory = getBlocksByZone(zone)

  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 12px',
          background: '#ffffff',
          border: '1px dashed #cbd5e1', borderRadius: 6,
          color: '#475569', fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + Add {zone} block
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 10,
          background: '#ffffff',
          border: '1px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 300, overflowY: 'auto',
          padding: 6,
        }}>
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: 0.5,
                padding: '4px 8px',
              }}>
                {category}
              </div>
              {items.map(item => (
                <button
                  key={item.key}
                  onClick={() => { onAdd(item.key); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px',
                    background: 'transparent', border: 'none',
                    color: '#0f172a', fontSize: 12,
                    cursor: 'pointer', borderRadius: 4,
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Zone section (Header or Footer) ─────────────────────────
function ZoneSection({ zone, blocks, expandedId, setExpandedId, onReorder, onAdd, onDelete, onPatch, productionId, alignment, onAlignmentChange, onMakeChild, onUnparent }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex(b => b.id === active.id)
    const newIndex = blocks.findIndex(b => b.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(blocks, oldIndex, newIndex))
  }

  const barColor = ZONE_BAR_COLORS[zone]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        background: barColor, color: 'white',
        padding: '6px 12px', borderRadius: 4,
        fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.8,
        marginBottom: 8,
      }}>
        {zone}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 10, padding: '4px 0',
      }}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Layout:</span>
        {[
          { v: 'space-between', label: '↔', title: 'Stretch across' },
          { v: 'left', label: '⬅', title: 'Align left' },
          { v: 'center', label: '↔↔', title: 'Center' },
          { v: 'right', label: '➡', title: 'Align right' },
        ].map(opt => (
          <button
            key={opt.v}
            type="button"
            title={opt.title}
            onClick={() => onAlignmentChange(opt.v)}
            style={{
              padding: '3px 8px', fontSize: 11,
              background: (alignment || 'space-between') === opt.v ? '#0f172a' : 'transparent',
              color:      (alignment || 'space-between') === opt.v ? '#ffffff' : '#475569',
              border: '1px solid ' + ((alignment || 'space-between') === opt.v ? '#0f172a' : '#cbd5e1'),
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragStart={() => setExpandedId(null)}
      >
        <SortableContext
          items={blocks.map(b => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.length === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              color: '#94a3b8', fontSize: 11, fontStyle: 'italic',
              border: '1px dashed #e2e8f0', borderRadius: 6,
            }}>
              No blocks in {zone}
            </div>
          ) : (
            blocks.map((block, idx) => {
              // canMakeChild: there must be a previous block in the SAME zone that is NOT a child
              const previousTopLevel = blocks.slice(0, idx).filter(b => !b.parent_block_id).pop()
              const canMakeChild = !!previousTopLevel
              const isChild = !!block.parent_block_id
              return (
                <SortableBlockRow
                  key={block.id}
                  block={block}
                  isExpanded={expandedId === block.id}
                  onToggle={() => setExpandedId(expandedId === block.id ? null : block.id)}
                  onDelete={() => onDelete(block.id)}
                  onPatch={(patch) => onPatch(block.id, patch)}
                  onMakeChild={() => onMakeChild(block.id, previousTopLevel.id)}
                  onUnparent={() => onUnparent(block.id)}
                  canMakeChild={canMakeChild}
                  isChild={isChild}
                  productionId={productionId}
                />
              )
            })
          )}
        </SortableContext>
      </DndContext>

      <AddBlockDropdown zone={zone} onAdd={onAdd} />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────
export function HeaderFooterEditorSidebar({ open, onClose, productionId, productionLabel = null }) {
  // ─── State ────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [activeTemplate, setActiveTemplate] = useState(null)        // { id, name, blocks[] }
  const [productionTemplate, setProductionTemplate] = useState(null) // tl_production_template row
  const [userTemplates, setUserTemplates] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Derived: blocks split by zone (always sorted)
  const allBlocks = activeTemplate?.blocks || []
  const headerBlocks = allBlocks
    .filter(b => b.zone === 'header')
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  const footerBlocks = allBlocks
    .filter(b => b.zone === 'footer')
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

  // ─── Load ─────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!productionId) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const [active, tpls] = await Promise.all([
        loadActiveTemplate(productionId),
        listUserTemplates(),
      ])
      setActiveTemplate(active?.template || null)
      setProductionTemplate(active?.production_template || null)
      setUserTemplates(tpls)
    } catch (e) {
      console.error('[HeaderFooterEditor] reload error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [productionId])

  useEffect(() => {
    if (open && productionId) reload()
  }, [open, productionId, reload])

  // ─── Onboarding: create from preset ──────────────────────
  const handleCreateFromPreset = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const newTpl = await createTemplateFromPreset()
      await applyTemplateToProduction(productionId, newTpl.id, productionLabel)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] createFromPreset error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  // ─── Apply existing template ──────────────────────────────
  const handleApplyTemplate = async (sourceTplId) => {
    if (!sourceTplId) return
    setBusy(true)
    setErrorMsg(null)
    try {
      await applyTemplateToProduction(productionId, sourceTplId, productionLabel)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] applyTemplate error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  // ─── Block operations (now persistent) ────────────────────
  const addBlock = async (zone, blockType) => {
    if (!activeTemplate) return
    setBusy(true)
    setErrorMsg(null)
    try {
      await dbAddBlock(activeTemplate.id, zone, blockType)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] addBlock error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteBlock = async (zone, id) => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await dbRemoveBlock(id)
      if (expandedId === id) setExpandedId(null)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] deleteBlock error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  // Optimistic patch: update local state immediately, then persist.
  // No `busy` spinner here — would feel laggy with debounced typing.
  const patchBlock = async (blockId, patch) => {
    setActiveTemplate(tpl => tpl ? ({
      ...tpl,
      blocks: tpl.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b),
    }) : tpl)
    try {
      await dbUpdateBlock(blockId, patch)
    } catch (e) {
      console.error('[HeaderFooterEditor] patchBlock error', e)
      setErrorMsg(e.message || String(e))
      await reload()
    }
  }

  const handleAlignmentChange = async (zone, value) => {
    if (!activeTemplate) return
    const field = zone === 'header' ? 'header_alignment' : 'footer_alignment'
    // Optimistic
    setActiveTemplate(tpl => tpl ? ({ ...tpl, [field]: value }) : tpl)
    try {
      await dbUpdateAlignment(activeTemplate.id, zone, value)
    } catch (e) {
      console.error('[HeaderFooterEditor] alignment error', e)
      setErrorMsg(e.message || String(e))
      await reload()
    }
  }

  const makeChild = async (blockId, parentBlockId) => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await dbSetParent(blockId, parentBlockId)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] makeChild error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const unparent = async (blockId) => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await dbUnsetParent(blockId)
      await reload()
    } catch (e) {
      console.error('[HeaderFooterEditor] unparent error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const reorderBlocksLocal = async (zone, newOrder) => {
    if (!activeTemplate) return
    // Optimistic update first
    const otherZone = zone === 'header' ? 'footer' : 'header'
    const reorderedWithOrder = newOrder.map((b, i) => ({ ...b, display_order: (i + 1) * 10 }))
    const otherBlocks = allBlocks.filter(b => b.zone === otherZone)
    setActiveTemplate(tpl => ({
      ...tpl,
      blocks: [...reorderedWithOrder, ...otherBlocks],
    }))
    // Then persist
    try {
      await dbReorderBlocks(activeTemplate.id, zone, newOrder.map(b => b.id))
    } catch (e) {
      console.error('[HeaderFooterEditor] reorder error', e)
      setErrorMsg(e.message || String(e))
      await reload()
    }
  }

  return (
    <BlockConfigContext.Provider value={{
      productionId,
      onAfterPersist: () => reload(),
    }}>
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380,
        background: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.04)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            Header &amp; Footer
          </div>
          {activeTemplate && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Template: <span style={{ fontWeight: 600, color: '#334155' }}>{activeTemplate.name}</span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#64748b', padding: '4px 8px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Template switcher row */}
      {activeTemplate && userTemplates.length > 0 && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fafafa',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <label style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
            Switch to:
          </label>
          <select
            value=""
            onChange={(e) => { if (e.target.value) handleApplyTemplate(e.target.value) }}
            disabled={busy}
            style={{
              flex: 1, fontSize: 11, padding: '4px 6px',
              border: '1px solid #cbd5e1', borderRadius: 4, background: '#ffffff',
            }}
          >
            <option value="">— pick a template —</option>
            {userTemplates
              .filter(t => t.id !== activeTemplate.id)
              .map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))
            }
          </select>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div style={{
          padding: '8px 16px',
          background: '#fef2f2', color: '#991b1b',
          borderBottom: '1px solid #fecaca',
          fontSize: 11,
        }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto',
      }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 24 }}>
            Loading…
          </div>
        )}

        {!loading && !activeTemplate && (
          <div style={{
            padding: 20, textAlign: 'center',
            border: '1px dashed #cbd5e1', borderRadius: 8,
            background: '#fafafa',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              No template active
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
              Create a template to define how the Transport List header
              and footer will look for this production.
            </div>
            <button
              onClick={handleCreateFromPreset}
              disabled={busy}
              style={{
                padding: '8px 16px',
                background: '#0f172a', color: '#ffffff',
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                marginBottom: 8,
              }}
            >
              Create from Captain Template
            </button>
            {userTemplates.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#94a3b8', margin: '8px 0' }}>
                  or use an existing template:
                </div>
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) handleApplyTemplate(e.target.value) }}
                  disabled={busy}
                  style={{
                    width: '100%', fontSize: 11, padding: '6px 8px',
                    border: '1px solid #cbd5e1', borderRadius: 4,
                  }}
                >
                  <option value="">— pick a template —</option>
                  {userTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {!loading && activeTemplate && (
          <>
            <ZoneSection
              zone="header"
              blocks={headerBlocks}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onReorder={(newOrder) => reorderBlocksLocal('header', newOrder)}
              onAdd={(blockType) => addBlock('header', blockType)}
              onDelete={(id) => deleteBlock('header', id)}
              onPatch={patchBlock}
              productionId={productionId}
              alignment={activeTemplate.header_alignment}
              onAlignmentChange={(v) => handleAlignmentChange('header', v)}
              onMakeChild={makeChild}
              onUnparent={unparent}
            />

            <ZoneSection
              zone="footer"
              blocks={footerBlocks}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onReorder={(newOrder) => reorderBlocksLocal('footer', newOrder)}
              onAdd={(blockType) => addBlock('footer', blockType)}
              onDelete={(id) => deleteBlock('footer', id)}
              onPatch={patchBlock}
              productionId={productionId}
              alignment={activeTemplate.footer_alignment}
              onAlignmentChange={(v) => handleAlignmentChange('footer', v)}
              onMakeChild={makeChild}
              onUnparent={unparent}
            />
          </>
        )}
      </div>
    </div>
    </BlockConfigContext.Provider>
  )
}
