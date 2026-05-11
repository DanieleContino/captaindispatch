'use client'

import { useEffect, useState } from 'react'
import { loadActiveTemplate, getProductionLogoUrl, loadResolvedTeamContacts } from './tlTemplatesDb'
import { renderBlock } from './tlBlocksCatalog'

/**
 * Renders the header or footer of the Transport List based on the
 * template applied to the production.
 *
 * Props:
 *   productionId — UUID of the active production
 *   zone         — 'header' | 'footer'
 *   currentDate  — Date object (used by date_today, shooting_day_counter)
 *   onOpenEditor — callback when user clicks the "Set up..." button (empty state only)
 *
 * Reload trigger:
 *   reloadKey    — change this value to force a re-fetch from DB
 *                  (used when the sidebar persists changes)
 */
export function TLHeaderFooterRenderer({ productionId, zone, currentDate, shootStart, shootEnd, reloadKey, onOpenEditor }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const [logoUrl, setLogoUrl] = useState(null)
  const [teamContacts, setTeamContacts] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!productionId) { setLoading(false); return }
      setLoading(true)
      try {
        const [active, logo] = await Promise.all([
          loadActiveTemplate(productionId),
          getProductionLogoUrl(productionId),
        ])
        // Find the team_contacts block (if any) to read its sync setting
        const teamBlock = active?.template?.blocks?.find(b => b.block_type === 'team_contacts')
        const syncWithCrew = teamBlock?.config?.autoFromDB !== false
        const contacts = await loadResolvedTeamContacts(productionId, syncWithCrew)
        if (!cancelled) {
          setData(active)
          setLogoUrl(logo)
          setTeamContacts(contacts)
        }
      } catch (e) {
        console.error('[TLHeaderFooterRenderer] load error', e)
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [productionId, reloadKey])

  if (loading) {
    return zone === 'header' ? (
      <div style={{ padding: 12, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Loading header…
      </div>
    ) : null
  }

  // Empty state: only show for header, not footer
  if (!data || !data.template) {
    if (zone !== 'header') return null
    return (
      <div className="no-print" style={{
        padding: '20px',
        background: '#fffbeb',
        border: '1px dashed #fcd34d',
        borderRadius: 8,
        marginBottom: 12,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
          No header/footer template
        </div>
        <div style={{ fontSize: 11, color: '#a16207', marginBottom: 12, lineHeight: 1.5 }}>
          Define a custom header and footer to print on this Transport List.
        </div>
        {onOpenEditor && (
          <button
            onClick={onOpenEditor}
            style={{
              padding: '6px 14px',
              background: '#0f172a', color: 'white',
              border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Set up Header &amp; Footer
          </button>
        )}
      </div>
    )
  }

  const { template, production_template: pt } = data
  const overrides = pt?.overrides || {}

  // Filter, override, sort
  const blocks = (template.blocks || [])
    .filter(b => b.zone === zone)
    .map(b => {
      const ov = overrides[b.id] || {}
      return {
        ...b,
        config: { ...b.config, ...(ov.config || {}) },
        width: ov.width || b.width,
      }
    })
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

  if (blocks.length === 0) return null

  // Build the render context
  const ctx = {
    productionId,
    currentDate: currentDate || new Date(),
    shootStart: shootStart || null,
    shootEnd: shootEnd || null,
    teamContacts: teamContacts,
    logoUrl,
    pageNumber: null,
    totalPages: null,
  }

  // Alignment from template (default: space-between = today's behavior)
  const alignment = (zone === 'header' ? template.header_alignment : template.footer_alignment) || 'space-between'

  // Build layout: if alignment is space-between use grid (current behavior),
  // otherwise use flexbox aligned left/center/right
  const justifyMap = {
    'left': 'flex-start',
    'center': 'center',
    'right': 'flex-end',
  }

  const useFlex = alignment !== 'space-between'
  const gridTemplate = blocks.map(b => b.width || '1fr').join(' ')

  const layoutStyle = useFlex
    ? { display: 'flex', justifyContent: justifyMap[alignment], gap: '20px', alignItems: 'center', flexWrap: 'wrap' }
    : { display: 'grid', gridTemplateColumns: gridTemplate, gap: '10px', alignItems: 'center' }

  const containerStyle = zone === 'header'
    ? {
        ...layoutStyle,
        padding: '8px 12px',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '10px',
        borderRadius: 6,
      }
    : {
        ...layoutStyle,
        padding: '6px 14px',
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        fontSize: 10,
        color: '#64748b',
        borderRadius: 6,
      }

  return (
    <div className={zone === 'footer' ? 'sticky-footer' : undefined}
         style={zone === 'footer' ? { ...containerStyle, position: 'sticky', bottom: 0, zIndex: 10, marginTop: 'auto' } : containerStyle}>
      {blocks.map(b => (
        <div key={b.id} style={useFlex ? {} : { minWidth: 0 }}>
          {renderBlock(b.block_type, b.config, ctx)}
        </div>
      ))}
    </div>
  )
}
