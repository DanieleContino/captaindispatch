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

// ─── Form: addresses_block ───────────────────────────────────
function AddressesForm({ config, onChange }) {
  const [lines, setLines] = useState(
    Array.isArray(config?.lines) ? config.lines : []
  )

  useDebouncedSave({ lines }, (v) => onChange(v))

  const addLine = () => setLines(L => [...L, { label: '', address: '' }])
  const removeLine = (idx) => setLines(L => L.filter((_, i) => i !== idx))
  const updateLine = (idx, field, value) => {
    setLines(L => L.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  const moveLine = (idx, dir) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= lines.length) return
    setLines(L => {
      const out = [...L]
      const [item] = out.splice(idx, 1)
      out.splice(newIdx, 0, item)
      return out
    })
  }

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Address lines</label>
        {lines.length === 0 && (
          <div style={{ ...helpStyle, padding: 8, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 4 }}>
            No address lines yet.
          </div>
        )}
        {lines.map((line, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr auto',
            gap: 4,
            marginBottom: 4,
            alignItems: 'center',
          }}>
            <input
              type="text"
              value={line.label || ''}
              onChange={e => updateLine(idx, 'label', e.target.value)}
              placeholder="Label"
              style={{ ...inputStyle, fontSize: 11 }}
            />
            <input
              type="text"
              value={line.address || ''}
              onChange={e => updateLine(idx, 'address', e.target.value)}
              placeholder="Address"
              style={{ ...inputStyle, fontSize: 11 }}
            />
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                type="button"
                onClick={() => moveLine(idx, -1)}
                disabled={idx === 0}
                title="Move up"
                style={{
                  padding: '2px 5px', fontSize: 11,
                  background: 'transparent', border: '1px solid #e2e8f0',
                  borderRadius: 3, cursor: idx === 0 ? 'default' : 'pointer',
                  color: idx === 0 ? '#cbd5e1' : '#64748b',
                }}
              >↑</button>
              <button
                type="button"
                onClick={() => moveLine(idx, 1)}
                disabled={idx === lines.length - 1}
                title="Move down"
                style={{
                  padding: '2px 5px', fontSize: 11,
                  background: 'transparent', border: '1px solid #e2e8f0',
                  borderRadius: 3, cursor: idx === lines.length - 1 ? 'default' : 'pointer',
                  color: idx === lines.length - 1 ? '#cbd5e1' : '#64748b',
                }}
              >↓</button>
              <button
                type="button"
                onClick={() => removeLine(idx)}
                title="Remove line"
                style={{
                  padding: '2px 5px', fontSize: 11,
                  background: 'transparent', border: '1px solid #fecaca',
                  borderRadius: 3, cursor: 'pointer',
                  color: '#dc2626',
                }}
              >✕</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          style={{
            width: '100%', padding: '5px 8px', fontSize: 11,
            background: '#ffffff', border: '1px dashed #cbd5e1',
            borderRadius: 4, cursor: 'pointer', color: '#475569',
            marginTop: 4,
          }}
        >+ Add address line</button>
      </div>
    </>
  )
}

// ─── Form: logo_image ────────────────────────────────────────
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const LOGO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

function LogoImageForm({ config, onChange, productionId }) {
  const [maxHeight, setMaxHeight] = useState(
    typeof config?.maxHeight === 'number' ? config.maxHeight : 60
  )
  const [align, setAlign] = useState(config?.align || 'center')
  const [logoUrl, setLogoUrl] = useState(config?.logo_url || null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Persist all config fields (including logo_url) whenever any of them changes
  useDebouncedSave({ maxHeight, align, logo_url: logoUrl }, (v) => onChange(v))

  const handleFile = async (file) => {
    setUploadError(null)
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Unsupported format. Use PNG, JPEG, WebP or SVG.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setUploadError('File too large. Max 5 MB.')
      return
    }
    if (!productionId) {
      setUploadError('No production selected.')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('productionId', productionId)
      const res = await fetch('/api/productions/upload-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setLogoUrl(json.logo_url)
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset so the same file can be re-selected after a remove
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = () => {
    if (!window.confirm('Remove this logo?')) return
    setLogoUrl(null)
  }

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Logo</label>

        {/* Preview: shown when a logo is already uploaded */}
        {logoUrl && !uploading && (
          <div style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              padding: 8, background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 4,
              marginBottom: 6,
            }}>
              <img
                src={logoUrl}
                alt="logo preview"
                style={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, padding: '5px 8px', fontSize: 11,
                  background: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: 4, cursor: 'pointer', color: '#475569',
                }}
              >
                ↺ Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                style={{
                  padding: '5px 8px', fontSize: 11,
                  background: '#ffffff', border: '1px solid #fecaca',
                  borderRadius: 4, cursor: 'pointer', color: '#dc2626',
                }}
              >
                ✕ Remove
              </button>
            </div>
          </div>
        )}

        {/* Dropzone: shown when no logo or while uploading */}
        {(!logoUrl || uploading) && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragOver ? '#6366f1' : '#cbd5e1'}`,
              borderRadius: 6,
              padding: '18px 10px',
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              background: isDragOver ? '#eef2ff' : '#fafafa',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {uploading ? (
              <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 500 }}>
                ⏳ Uploading…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 22, marginBottom: 4 }}>🖼</div>
                <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
                  Click or drop a logo file
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                  PNG · JPEG · WebP · SVG · max 5 MB
                </div>
              </>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {/* Upload error */}
        {uploadError && (
          <div style={{
            marginTop: 6, padding: '5px 8px',
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 4, fontSize: 10, color: '#dc2626',
          }}>
            ⚠ {uploadError}
          </div>
        )}
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Max height (px)</label>
        <input
          type="number"
          min={20}
          max={200}
          value={maxHeight}
          onChange={e => setMaxHeight(Number(e.target.value) || 60)}
          style={inputStyle}
        />
        <div style={helpStyle}>
          The logo will scale to fit this height while keeping its proportions.
        </div>
      </div>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Alignment</label>
        <select value={align} onChange={e => setAlign(e.target.value)} style={inputStyle}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    </>
  )
}

// ─── Form: team_contacts ─────────────────────────────────────
function TeamContactsForm({ config, onChange }) {
  const [layout, setLayout] = useState(config?.layout || 'inline')
  const [showEmail, setShowEmail] = useState(config?.showEmail !== false)
  const [autoFromDB, setAutoFromDB] = useState(config?.autoFromDB !== false)

  useDebouncedSave({ layout, showEmail, autoFromDB }, (v) => onChange({
    ...config,
    ...v,
  }))

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Layout</label>
        <select value={layout} onChange={e => setLayout(e.target.value)} style={inputStyle}>
          <option value="inline">Inline (one line, separator dots)</option>
          <option value="rows">Rows (one contact per line)</option>
        </select>
        <div style={helpStyle}>
          Inline is more compact; rows is easier to read.
        </div>
      </div>
      <div style={fieldGroupStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showEmail}
            onChange={e => setShowEmail(e.target.checked)}
            style={{ margin: 0 }}
          />
          Show email addresses
        </label>
      </div>
      <div style={fieldGroupStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoFromDB}
            onChange={e => setAutoFromDB(e.target.checked)}
            style={{ margin: 0 }}
          />
          Auto-pull contacts from crew database
        </label>
        <div style={helpStyle}>
          When ON: crew members with Transport-related roles are listed automatically.
          When OFF: only manually-added contacts are shown.
        </div>
      </div>
      <div style={{
        padding: 10,
        background: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: 4,
        fontSize: 10,
        color: '#92400e',
        lineHeight: 1.5,
      }}>
        <strong>Per-contact overrides</strong> (hide, rename, add manual contacts)
        coming in Task 7.
      </div>
    </>
  )
}

// ─── Form: emergency_contacts ────────────────────────────────
function EmergencyContactsForm({ config, onChange }) {
  const [contacts, setContacts] = useState(
    Array.isArray(config?.contacts) ? config.contacts : []
  )

  useDebouncedSave({ contacts }, (v) => onChange(v))

  const addContact = () => setContacts(C => [...C, { label: '', phone: '' }])
  const removeContact = (idx) => setContacts(C => C.filter((_, i) => i !== idx))
  const updateContact = (idx, field, value) => {
    setContacts(C => C.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }
  const moveContact = (idx, dir) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= contacts.length) return
    setContacts(C => {
      const out = [...C]
      const [item] = out.splice(idx, 1)
      out.splice(newIdx, 0, item)
      return out
    })
  }

  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>Emergency contacts</label>
      {contacts.length === 0 && (
        <div style={{ ...helpStyle, padding: 8, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 4 }}>
          No emergency contacts yet.
        </div>
      )}
      {contacts.map((c, idx) => (
        <div key={idx} style={{
          display: 'grid',
          gridTemplateColumns: '110px 1fr auto',
          gap: 4,
          marginBottom: 4,
          alignItems: 'center',
        }}>
          <input
            type="text"
            value={c.label || ''}
            onChange={e => updateContact(idx, 'label', e.target.value)}
            placeholder="Label (e.g. Police)"
            style={{ ...inputStyle, fontSize: 11 }}
          />
          <input
            type="text"
            value={c.phone || ''}
            onChange={e => updateContact(idx, 'phone', e.target.value)}
            placeholder="Phone"
            style={{ ...inputStyle, fontSize: 11 }}
          />
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              type="button"
              onClick={() => moveContact(idx, -1)}
              disabled={idx === 0}
              title="Move up"
              style={{
                padding: '2px 5px', fontSize: 11,
                background: 'transparent', border: '1px solid #e2e8f0',
                borderRadius: 3, cursor: idx === 0 ? 'default' : 'pointer',
                color: idx === 0 ? '#cbd5e1' : '#64748b',
              }}
            >↑</button>
            <button
              type="button"
              onClick={() => moveContact(idx, 1)}
              disabled={idx === contacts.length - 1}
              title="Move down"
              style={{
                padding: '2px 5px', fontSize: 11,
                background: 'transparent', border: '1px solid #e2e8f0',
                borderRadius: 3, cursor: idx === contacts.length - 1 ? 'default' : 'pointer',
                color: idx === contacts.length - 1 ? '#cbd5e1' : '#64748b',
              }}
            >↓</button>
            <button
              type="button"
              onClick={() => removeContact(idx)}
              title="Remove"
              style={{
                padding: '2px 5px', fontSize: 11,
                background: 'transparent', border: '1px solid #fecaca',
                borderRadius: 3, cursor: 'pointer',
                color: '#dc2626',
              }}
            >✕</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addContact}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 11,
          background: '#ffffff', border: '1px dashed #cbd5e1',
          borderRadius: 4, cursor: 'pointer', color: '#475569',
          marginTop: 4,
        }}
      >+ Add emergency contact</button>
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
export function BlockConfigForm({ block, onPatch, productionId }) {
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
      case 'addresses_block':
        return <AddressesForm config={block.config} onChange={(lines) => handleConfigChange({ ...block.config, lines: lines.lines })} />
      case 'logo_image':
        return <LogoImageForm config={block.config} onChange={handleConfigChange} productionId={productionId} />
      case 'team_contacts':
        return <TeamContactsForm config={block.config} onChange={handleConfigChange} />
      case 'emergency_contacts':
        return <EmergencyContactsForm config={block.config} onChange={(contacts) => handleConfigChange({ ...block.config, contacts: contacts.contacts })} />
      default:
        return (
          <div style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', padding: 12, fontSize: 11 }}>
            Unknown block type: <code>{block.block_type}</code>
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
