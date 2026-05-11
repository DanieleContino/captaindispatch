'use client'

// ─── Helpers ─────────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const pad2 = n => String(n).padStart(2, '0')

function formatDate(date, format) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const dayName = DAY_NAMES[d.getDay()]
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const monShort = MONTH_NAMES_SHORT[d.getMonth()]
  const yy = String(d.getFullYear()).slice(-2)
  const yyyy = String(d.getFullYear())
  switch (format) {
    case 'EEEE dd.MM.yy':  return `${dayName} ${dd}.${mm}.${yy}`
    case 'dd MMM yyyy':    return `${dd} ${monShort} ${yyyy}`
    case 'dd/MM/yyyy':     return `${dd}/${mm}/${yyyy}`
    case 'EEEE dd MMM':    return `${dayName} ${dd} ${monShort}`
    default:               return `${dayName} ${dd}.${mm}.${yy}`
  }
}

function shootingDayNumber(currentDate, shootStart) {
  if (!currentDate || !shootStart) return null
  const c = currentDate instanceof Date ? currentDate : new Date(currentDate)
  const s = shootStart instanceof Date ? shootStart : new Date(shootStart)
  const diff = Math.floor((c - s) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : null
}

// ─── Render context ──────────────────────────────────────────
// Each renderer receives:
//   config — block's own config (the JSONB stored in tl_template_blocks.config,
//            possibly overridden by tl_production_template.overrides[block_id])
//   ctx    — {
//              productionId, currentDate (Date),
//              shootStart (Date|null), shootEnd (Date|null),
//              teamContacts: [{ name, role, phone, email, hidden }],
//              logoUrl (string|null),
//              pageNumber (number|null), totalPages (number|null)
//            }
//
// Returns a JSX element (or null/string).

// ─── CATALOG ─────────────────────────────────────────────────
export const BLOCKS_CATALOG = {

  // ══════════════════════ HEADER ══════════════════════════════

  date_today: {
    label: 'Today\'s date',
    zone: 'header',
    category: 'Date',
    defaultWidth: '1fr',
    defaultConfig: { format: 'EEEE dd.MM.yy' },
    formatOptions: ['EEEE dd.MM.yy', 'dd MMM yyyy', 'dd/MM/yyyy', 'EEEE dd MMM'],
    render: (config, ctx) => (
      <div style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>
        {formatDate(ctx?.currentDate || new Date(), config?.format || 'EEEE dd.MM.yy')}
      </div>
    ),
  },

  production_title: {
    label: 'Free title',
    zone: 'header',
    category: 'Text',
    defaultWidth: '1fr',
    defaultConfig: { text: 'TRANSPORT LIST PREP.', size: 'lg', uppercase: true },
    render: (config) => {
      const sizeMap = { sm: '11px', md: '13px', lg: '15px', xl: '18px' }
      const fontSize = sizeMap[config?.size || 'lg']
      const text = config?.uppercase ? (config?.text || '').toUpperCase() : (config?.text || '')
      return (
        <div style={{
          fontSize, fontWeight: 700, color: '#0f172a',
          letterSpacing: config?.uppercase ? '0.5px' : 'normal',
        }}>
          {text || <span style={{ color: '#cbd5e1' }}>— title —</span>}
        </div>
      )
    },
  },

  logo_image: {
    label: 'Production logo',
    zone: 'header',
    category: 'Brand',
    defaultWidth: '1fr',
    defaultConfig: { maxHeight: 60, align: 'center' },
    render: (config, ctx) => {
      const align = config?.align || 'center'
      const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'
      if (!ctx?.logoUrl) {
        return (
          <div style={{
            display: 'flex', justifyContent: justify, alignItems: 'center',
            height: (config?.maxHeight || 60), color: '#cbd5e1', fontSize: 10,
            border: '1px dashed #e2e8f0', borderRadius: 4,
          }}>
            no logo
          </div>
        )
      }
      return (
        <div style={{ display: 'flex', justifyContent: justify, alignItems: 'center' }}>
          <img src={ctx.logoUrl} alt="logo"
            style={{ maxHeight: (config?.maxHeight || 60), maxWidth: '100%', objectFit: 'contain' }} />
        </div>
      )
    },
  },

  addresses_block: {
    label: 'Addresses / offices',
    zone: 'header',
    category: 'Info',
    defaultWidth: '1.4fr',
    defaultConfig: {
      lines: [
        { label: 'Production Office', address: '' },
      ],
    },
    render: (config) => {
      const lines = config?.lines || []
      if (lines.length === 0) {
        return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— no addresses —</span>
      }
      return (
        <div style={{ fontSize: '10px', lineHeight: 1.5, color: '#334155' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ marginBottom: i < lines.length - 1 ? 4 : 0 }}>
              {l.label && <span style={{ fontWeight: 600, color: '#0f172a' }}>{l.label}: </span>}
              <span>{l.address}</span>
            </div>
          ))}
        </div>
      )
    },
  },

  free_text_header: {
    label: 'Free text',
    zone: 'header',
    category: 'Text',
    defaultWidth: '1fr',
    defaultConfig: { text: '', size: 'sm' },
    render: (config) => {
      const sizeMap = { xs: '9px', sm: '11px', md: '13px', lg: '15px' }
      const fontSize = sizeMap[config?.size || 'sm']
      const text = config?.text || ''
      if (!text) return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— empty —</span>
      return (
        <div style={{ fontSize, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {text}
        </div>
      )
    },
  },

  shooting_day_counter: {
    label: 'Shooting day counter (e.g. Day 12/45)',
    zone: 'header',
    category: 'Date',
    defaultWidth: '1fr',
    defaultConfig: { template: 'Day {current}/{total}' },
    render: (config, ctx) => {
      const current = shootingDayNumber(ctx?.currentDate, ctx?.shootStart)
      const total = ctx?.shootEnd && ctx?.shootStart
        ? Math.floor((new Date(ctx.shootEnd) - new Date(ctx.shootStart)) / (1000*60*60*24)) + 1
        : null
      if (!current) {
        return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— set shoot dates —</span>
      }
      const tpl = config?.template || 'Day {current}/{total}'
      const out = tpl
        .replace('{current}', current)
        .replace('{total}', total ?? '?')
      return (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
          {out}
        </div>
      )
    },
  },

  // ══════════════════════ FOOTER ══════════════════════════════

  team_contacts: {
    label: 'Transport team contacts',
    zone: 'footer',
    category: 'Contacts',
    defaultWidth: '2fr',
    defaultConfig: {
      autoFromDB: true,
      layout: 'inline', // 'inline' | 'rows'
      showEmail: true,
    },
    render: (config, ctx) => {
      const contacts = (ctx?.teamContacts || []).filter(c => !c.hidden)
      if (contacts.length === 0) {
        return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— no contacts —</span>
      }
      const layout = config?.layout || 'inline'
      const showEmail = config?.showEmail !== false
      if (layout === 'rows') {
        return (
          <div style={{ fontSize: '10px', lineHeight: 1.5, color: '#334155' }}>
            {contacts.map((c, i) => (
              <div key={i}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.role && <span style={{ color: '#64748b' }}> ({c.role})</span>}
                {c.phone && <span> · {c.phone}</span>}
                {showEmail && c.email && <span style={{ color: '#64748b' }}> · {c.email}</span>}
              </div>
            ))}
          </div>
        )
      }
      // inline
      return (
        <div style={{ fontSize: '10px', lineHeight: 1.6, color: '#334155' }}>
          {contacts.map((c, i) => (
            <span key={i}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.role && <span style={{ color: '#64748b' }}> ({c.role})</span>}
              {c.phone && <span> {c.phone}</span>}
              {showEmail && c.email && <span style={{ color: '#64748b' }}> {c.email}</span>}
              {i < contacts.length - 1 && <span style={{ color: '#cbd5e1' }}>  ·  </span>}
            </span>
          ))}
        </div>
      )
    },
  },

  free_text_footer: {
    label: 'Free text',
    zone: 'footer',
    category: 'Text',
    defaultWidth: '1fr',
    defaultConfig: { text: '', size: 'xs' },
    render: (config) => {
      const sizeMap = { xs: '9px', sm: '11px', md: '13px' }
      const fontSize = sizeMap[config?.size || 'xs']
      const text = config?.text || ''
      if (!text) return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— empty —</span>
      return (
        <div style={{ fontSize, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {text}
        </div>
      )
    },
  },

  page_number: {
    label: 'Page number',
    zone: 'footer',
    category: 'Meta',
    defaultWidth: '0.5fr',
    defaultConfig: { template: 'Page {n} of {total}' },
    render: (config, ctx) => {
      const tpl = config?.template || 'Page {n} of {total}'
      const out = tpl
        .replace('{n}', ctx?.pageNumber ?? '1')
        .replace('{total}', ctx?.totalPages ?? '1')
      return (
        <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'right' }}>
          {out}
        </div>
      )
    },
  },

  emergency_contacts: {
    label: 'Emergency contacts',
    zone: 'footer',
    category: 'Contacts',
    defaultWidth: '1fr',
    defaultConfig: {
      contacts: [
        { label: 'Emergency', phone: '112' },
      ],
    },
    render: (config) => {
      const contacts = config?.contacts || []
      if (contacts.length === 0) {
        return <span style={{ color: '#cbd5e1', fontSize: 10 }}>— no emergency contacts —</span>
      }
      return (
        <div style={{ fontSize: '10px', lineHeight: 1.5, color: '#991b1b', fontWeight: 500 }}>
          {contacts.map((c, i) => (
            <div key={i}>
              <span style={{ fontWeight: 700 }}>{c.label}</span>
              {c.phone && <span>: {c.phone}</span>}
            </div>
          ))}
        </div>
      )
    },
  },
}

// ─── Captain Template (default preset) ───────────────────────
// Default template inserted when the user clicks "Create from Captain Template"
// in the Header/Footer editor sidebar.
// 4 header blocks + 1 footer block.
export const CAPTAIN_TEMPLATE_PRESET = {
  name: 'Captain Template',
  description: 'Standard header with title + date + logo + addresses, and transport team footer.',
  blocks: [
    // HEADER
    { zone: 'header', display_order: 10, block_type: 'production_title',
      width: '1fr',
      config: { text: 'TRANSPORT LIST PREP.', size: 'lg', uppercase: true } },
    { zone: 'header', display_order: 20, block_type: 'date_today',
      width: '0.7fr',
      config: { format: 'EEEE dd.MM.yy' } },
    { zone: 'header', display_order: 30, block_type: 'logo_image',
      width: '0.8fr',
      config: { maxHeight: 60, align: 'center' } },
    { zone: 'header', display_order: 40, block_type: 'addresses_block',
      width: '1.4fr',
      config: {
        lines: [
          { label: 'Production Office', address: '' },
        ],
      } },
    // FOOTER
    { zone: 'footer', display_order: 10, block_type: 'team_contacts',
      width: '1fr',
      config: { autoFromDB: true, layout: 'inline', showEmail: true } },
  ],
}

// ─── Editor field picker helpers ─────────────────────────────
// Used by the Header/Footer editor sidebar to group blocks by zone and category.

export function getBlocksByZone(zone) {
  const out = {}
  for (const [key, def] of Object.entries(BLOCKS_CATALOG)) {
    if (def.zone !== zone) continue
    if (!out[def.category]) out[def.category] = []
    out[def.category].push({
      key,
      label: def.label,
      defaultWidth: def.defaultWidth,
      defaultConfig: def.defaultConfig,
    })
  }
  return out
}

export function getBlockDef(blockType) {
  return BLOCKS_CATALOG[blockType] || null
}

export function renderBlock(blockType, config, ctx) {
  const def = BLOCKS_CATALOG[blockType]
  if (!def) return null
  return def.render(config || def.defaultConfig || {}, ctx || {})
}
