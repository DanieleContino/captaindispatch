'use client'

import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { BLOCKS_CATALOG, getBlocksByZone, getBlockDef } from './tlBlocksCatalog'

// ─── Styles ──────────────────────────────────────────────────
const ZONE_BAR_COLORS = {
  header: '#1e293b',
  footer: '#475569',
}

// ─── Sortable block row ──────────────────────────────────────
function SortableBlockRow({ block, isExpanded, onToggle, onDelete }) {
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
          background: isExpanded ? '#f1f5f9' : '#fafafa',
          border: '1px solid ' + (isExpanded ? '#cbd5e1' : '#e2e8f0'),
          borderRadius: 6,
          cursor: 'pointer',
          marginBottom: 4,
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
          <div style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', padding: 8 }}>
            Config form coming in Task 5
          </div>
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
function ZoneSection({ zone, blocks, expandedId, setExpandedId, onReorder, onAdd, onDelete }) {
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
        marginBottom: 10,
      }}>
        {zone}
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
            blocks.map(block => (
              <SortableBlockRow
                key={block.id}
                block={block}
                isExpanded={expandedId === block.id}
                onToggle={() => setExpandedId(expandedId === block.id ? null : block.id)}
                onDelete={() => onDelete(block.id)}
              />
            ))
          )}
        </SortableContext>
      </DndContext>

      <AddBlockDropdown zone={zone} onAdd={onAdd} />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────
export default function HeaderFooterEditorSidebar({ open, onClose }) {
  // MOCK STATE — replaced by DB wiring in Task 5
  const [headerBlocks, setHeaderBlocks] = useState([
    { id: 'mock-h-1', zone: 'header', block_type: 'production_title',
      width: '1fr', display_order: 10, config: { text: 'TRANSPORT LIST PREP.' } },
    { id: 'mock-h-2', zone: 'header', block_type: 'date_today',
      width: '0.7fr', display_order: 20, config: { format: 'EEEE dd.MM.yy' } },
    { id: 'mock-h-3', zone: 'header', block_type: 'logo_image',
      width: '0.8fr', display_order: 30, config: { maxHeight: 60 } },
  ])
  const [footerBlocks, setFooterBlocks] = useState([
    { id: 'mock-f-1', zone: 'footer', block_type: 'team_contacts',
      width: '1fr', display_order: 10, config: { autoFromDB: true } },
  ])
  const [expandedId, setExpandedId] = useState(null)

  const addBlock = (zone, blockType) => {
    const def = BLOCKS_CATALOG[blockType]
    if (!def) return
    const newBlock = {
      id: 'mock-' + zone[0] + '-' + Date.now(),
      zone,
      block_type: blockType,
      width: def.defaultWidth || '1fr',
      display_order: 999,
      config: def.defaultConfig || {},
    }
    if (zone === 'header') setHeaderBlocks(b => [...b, newBlock])
    else setFooterBlocks(b => [...b, newBlock])
  }

  const deleteBlock = (zone, id) => {
    if (zone === 'header') setHeaderBlocks(b => b.filter(x => x.id !== id))
    else setFooterBlocks(b => b.filter(x => x.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const reorderBlocksLocal = (zone, newOrder) => {
    if (zone === 'header') setHeaderBlocks(newOrder)
    else setFooterBlocks(newOrder)
  }

  return (
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
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Mock state — wiring DB in Task 5
          </div>
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

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
      }}>
        <ZoneSection
          zone="header"
          blocks={headerBlocks}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onReorder={(newOrder) => reorderBlocksLocal('header', newOrder)}
          onAdd={(blockType) => addBlock('header', blockType)}
          onDelete={(id) => deleteBlock('header', id)}
        />

        <ZoneSection
          zone="footer"
          blocks={footerBlocks}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onReorder={(newOrder) => reorderBlocksLocal('footer', newOrder)}
          onAdd={(blockType) => addBlock('footer', blockType)}
          onDelete={(id) => deleteBlock('footer', id)}
        />
      </div>
    </div>
  )
}
