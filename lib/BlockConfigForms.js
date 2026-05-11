'use client'

import { useEffect, useState, useRef } from 'react'
import { BLOCKS_CATALOG } from './tlBlocksCatalog'

// ─── Generic styled inputs ───────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  border: '1px solid #cbd5e1',
  borderRadius: 4,
  background: '#ffffff',
  color: '#0f172a',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: 4,
}

const fieldGroupStyle = {
  marginBottom: 10,
}

const helpStyle = {
  fontSize: '10px',
  color: '#94a3b8',
  marginTop: 3,
  fontStyle: 'italic',
  lineHeight: 1.4,
}

// ─── Debounce hook ───────────────────────────────────────────
// Persists changes 400ms after the user stops typing — avoids
// hammering the DB on every keystroke.
function useDebouncedSave(value, onSave, delay = 400) {
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const t = setTimeout(() => { onSave(value) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
}

// ─── Width selector (shared by all blocks) ───────────────────
const WIDTH_PRESETS = [
  { value: 'auto', label: 'Auto' },
  { value: '0.5fr', label: 'XS (½ unit)' },
  { value: '0.7fr', label: 'S (¾ unit)' },
  { value: '1fr', label: 'M (1 unit)' },
  { value: '1.4fr', label: 'L (1.4 units)' },
  { value: '2fr', label: 'XL (2 units)' },
  { value: '120px', label: '120px fixed' },
  { value: '180px', label: '180px fixed' },
]

function WidthSelector({ value, onChange }) {
  const isPreset = WIDTH_PRESETS.some(p => p.value === value)
  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>Column width</label>
      <select
        value={isPreset ? value : 'custom'}
        onChange={e => {
          const v = e.target.value
          if (v === 'custom') return
          onChange(v)
        }}
        style={inputStyle}
      >
        {WIDTH_PRESETS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
        {!isPreset && <option value="custom">Custom: {value}</option>}
      </select>
      <div style={helpStyle}>
        Wider blocks take more horizontal space in the header/footer row.
      </div>
    </div>
  )
}

// ─── Form: production_title (free title text) ────────────────
function TitleForm({ config, onChange }) {
  const [text, setText] = useState(config?.text || '')
  const [size, setSize] = useState(config?.size || 'lg')
  const [uppercase, setUppercase] = useState(config?.uppercase ?? true)

  useDebouncedSave({ text, size, uppercase }, (v) => onChange(v))

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Title text</label>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. TRANSPORT LIST PREP."
          style={inputStyle}
        />
      </div>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Size</label>
        <select value={size} onChange={e => setSize(e.target.value)} style={inputStyle}>
          <option value="sm">Small (11px)</option>
          <option value="md">Medium (13px)</option>
          <option value="lg">Large (15px)</option>
          <option value="xl">Extra large (18px)</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={uppercase}
            onChange={e => setUppercase(e.target.checked)}
            style={{ margin: 0 }}
          />
          UPPERCASE
        </label>
      </div>
    </>
  )
}

// ─── Form: date_today ────────────────────────────────────────
function DateTodayForm({ config, onChange }) {
  const def = BLOCKS_CATALOG.date_today
  const formats = def?.formatOptions || ['EEEE dd.MM.yy']
  const [format, setFormat] = useState(config?.format || formats[0])

  useDebouncedSave({ format }, (v) => onChange(v))

  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>Date format</label>
      <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
        {formats.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <div style={helpStyle}>
        The list will always show today's date in this format.
      </div>
    </div>
  )
}

// ─── Form: free text (header or footer) ──────────────────────
function FreeTextForm({ config, onChange, sizeOptions }) {
  const [text, setText] = useState(config?.text || '')
  const [size, setSize] = useState(config?.size || (sizeOptions?.[0]?.value || 'sm'))

  useDebouncedSave({ text, size }, (v) => onChange(v))

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Text content</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Any text — supports multiple lines"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={helpStyle}>
          Line breaks are preserved in the printed list.
        </div>
      </div>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Size</label>
        <select value={size} onChange={e => setSize(e.target.value)} style={inputStyle}>
          {sizeOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </>
  )
}

// ─── Form: page_number ───────────────────────────────────────
function PageNumberForm({ config, onChange }) {
  const [template, setTemplate] = useState(config?.template || 'Page {n} of {total}')

  useDebouncedSave({ template }, (v) => onChange(v))

  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>Template</label>
      <input
        type="text"
        value={template}
        onChange={e => setTemplate(e.target.value)}
        placeholder="Page {n} of {total}"
        style={inputStyle}
      />
      <div style={helpStyle}>
        Use <code>{'{n}'}</code> for current page, <code>{'{total}'}</code> for total pages.
        Example: <code>{'Page {n} / {total}'}</code> → "Page 2 / 5"
      </div>
    </div>
  )
}

// ─── Form: shooting_day_counter ──────────────────────────────
function ShootingDayForm({ config, onChange }) {
  const [template, setTemplate] = useState(config?.template || 'Day {current}/{total}')

  useDebouncedSave({ template }, (v) => onChange(v))

  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>Template</label>
      <input
        type="text"
        value={template}
        onChange={e => setTemplate(e.target.value)}
        placeholder="Day {current}/{total}"
        style={inputStyle}
      />
      <div style={helpStyle}>
        Use <code>{'{current}'}</code> for the current shoot day (computed from the production's
        shoot start date), and <code>{'{total}'}</code> for the total. Examples:<br/>
        <code>{'Day {current}/{total}'}</code> → "Day 12/45"<br/>
        <code>{'Shoot day {current}'}</code> → "Shoot day 12"
      </div>
    </div>
  )
}

// ─── Main exported component ─────────────────────────────────
/**
 * Renders the config form for a given block.
 * 
 * Props:
 *   block    — { id, block_type, config, width, ... }
 *   onPatch  — (patch: { config?, width? }) => Promise<void>
 *              called by individual forms when their state changes.
 *              The parent component is responsible for persisting to DB
 *              and reloading.
 */
export function BlockConfigForm({ block, onPatch }) {
  const handleConfigChange = (newConfig) => {
    onPatch({ config: newConfig })
  }
  const handleWidthChange = (newWidth) => {
    onPatch({ width: newWidth })
  }

  const renderForm = () => {
    switch (block.block_type) {
      case 'production_title':
        return <TitleForm config={block.config} onChange={handleConfigChange} />
      case 'date_today':
        return <DateTodayForm config={block.config} onChange={handleConfigChange} />
      case 'free_text_header':
        return (
          <FreeTextForm
            config={block.config}
            onChange={handleConfigChange}
            sizeOptions={[
              { value: 'xs', label: 'Extra small (9px)' },
              { value: 'sm', label: 'Small (11px)' },
              { value: 'md', label: 'Medium (13px)' },
              { value: 'lg', label: 'Large (15px)' },
            ]}
          />
        )
      case 'free_text_footer':
        return (
          <FreeTextForm
            config={block.config}
            onChange={handleConfigChange}
            sizeOptions={[
              { value: 'xs', label: 'Extra small (9px)' },
              { value: 'sm', label: 'Small (11px)' },
              { value: 'md', label: 'Medium (13px)' },
            ]}
          />
        )
      case 'page_number':
        return <PageNumberForm config={block.config} onChange={handleConfigChange} />
      case 'shooting_day_counter':
        return <ShootingDayForm config={block.config} onChange={handleConfigChange} />
      default:
        // Coming in Task 6B: addresses_block, logo_image, team_contacts, emergency_contacts
        return (
          <div style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', padding: 12, fontSize: 11 }}>
            Config form for <code>{block.block_type}</code> coming in Task 6B
          </div>
        )
    }
  }

  return (
    <div>
      {renderForm()}
      <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: 10, paddingTop: 10 }}>
        <WidthSelector value={block.width} onChange={handleWidthChange} />
      </div>
    </div>
  )
}
