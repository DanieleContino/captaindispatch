'use client'

import { useEffect, useState, useRef, useContext, createContext } from 'react'
import { BLOCKS_CATALOG } from './tlBlocksCatalog'
import { resizeImage, fileExtension } from './imageResize'
import {
  uploadProductionLogo, deleteProductionLogo, getProductionLogoUrl,
  loadResolvedTeamContacts, upsertCrewContactOverride,
  addManualContact, updateContactOverride, deleteContactOverride,
} from './tlTemplatesDb'

// Context passed down by the sidebar so forms know which production they belong to.
// Not all forms need it — only logo and (future) team_contacts.
export const BlockConfigContext = createContext({ productionId: null, onAfterPersist: null })

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
function LogoImageForm({ config, onChange }) {
  const { productionId, onAfterPersist } = useContext(BlockConfigContext)

  const [maxHeight, setMaxHeight] = useState(
    typeof config?.maxHeight === 'number' ? config.maxHeight : 60
  )
  const [align, setAlign] = useState(config?.align || 'center')
  useDebouncedSave({ maxHeight, align }, (v) => onChange(v))

  // Logo state
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  // Load current logo signed URL
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!productionId) { setLoadingPreview(false); return }
      setLoadingPreview(true)
      try {
        const url = await getProductionLogoUrl(productionId)
        if (!cancelled) setPreviewUrl(url)
      } catch (e) {
        console.error('[LogoImageForm] load preview error', e)
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [productionId])

  async function handleFile(file) {
    if (!file || !productionId) return
    setUploadError(null)

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setUploadError('Unsupported format. Use PNG, JPEG, WebP or SVG.')
      return
    }
    // Validate size (5MB pre-resize)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File too large (max 5MB).')
      return
    }

    setUploading(true)
    try {
      const resized = await resizeImage(file, { maxWidth: 600, maxHeight: 600 })
      const ext = fileExtension(file)
      await uploadProductionLogo(productionId, resized, ext)
      // Refresh preview
      const url = await getProductionLogoUrl(productionId)
      setPreviewUrl(url)
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[LogoImageForm] upload error', e)
      setUploadError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!productionId) return
    if (!confirm('Remove the current logo?')) return
    setUploading(true)
    setUploadError(null)
    try {
      await deleteProductionLogo(productionId)
      setPreviewUrl(null)
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[LogoImageForm] delete error', e)
      setUploadError(e.message || 'Delete failed')
    } finally {
      setUploading(false)
    }
  }

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <>
      {/* Upload section */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Logo file</label>

        {loadingPreview ? (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
            Loading…
          </div>
        ) : previewUrl ? (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: 10,
            background: '#fafafa',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <img
              src={previewUrl}
              alt="logo preview"
              style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: 4, cursor: 'pointer', color: '#475569',
                }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: '#ffffff', border: '1px solid #fecaca',
                  borderRadius: 4, cursor: 'pointer', color: '#dc2626',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{
              border: '2px dashed ' + (isDragging ? '#2563eb' : '#cbd5e1'),
              borderRadius: 6,
              padding: '20px 12px',
              textAlign: 'center',
              background: isDragging ? '#eff6ff' : '#fafafa',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>📁</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 2 }}>
              {uploading ? 'Uploading…' : 'Click or drop a logo file'}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              PNG, JPEG, WebP or SVG. Max 5MB.
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = '' // reset so same-file re-upload works
          }}
          style={{ display: 'none' }}
        />

        {uploadError && (
          <div style={{
            marginTop: 6, padding: '6px 8px',
            background: '#fef2f2', color: '#991b1b',
            border: '1px solid #fecaca', borderRadius: 4,
            fontSize: 10,
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
  const { productionId, onAfterPersist } = useContext(BlockConfigContext)

  const [layout, setLayout] = useState(config?.layout || 'inline')
  const [showEmail, setShowEmail] = useState(config?.showEmail !== false)
  const [autoFromDB, setAutoFromDB] = useState(config?.autoFromDB !== false)
  useDebouncedSave({ layout, showEmail, autoFromDB }, (v) => onChange({ ...config, ...v }))

  // Contacts list state
  const [contacts, setContacts] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [busyAction, setBusyAction] = useState(false)
  const [listError, setListError] = useState(null)

  const reloadList = async () => {
    if (!productionId) { setLoadingList(false); return }
    setLoadingList(true)
    setListError(null)
    try {
      const list = await loadResolvedTeamContacts(productionId)
      setContacts(list)
    } catch (e) {
      console.error('[TeamContactsForm] reload error', e)
      setListError(e.message || String(e))
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { reloadList() }, [productionId])

  const handleFieldEdit = async (contact, field, value) => {
    setBusyAction(true)
    setListError(null)
    try {
      const overrideField = field + '_override'
      if (contact.crew_id) {
        // crew-linked: upsert with crew_id
        await upsertCrewContactOverride(productionId, contact.crew_id, {
          name_override:  field === 'name'  ? value : (contacts.find(c => c.key === contact.key)?.name  || null),
          role_override:  field === 'role'  ? value : (contacts.find(c => c.key === contact.key)?.role  || null),
          phone_override: field === 'phone' ? value : (contacts.find(c => c.key === contact.key)?.phone || null),
          email_override: field === 'email' ? value : (contacts.find(c => c.key === contact.key)?.email || null),
          hidden: contact.hidden,
          display_order: contact.display_order,
        })
      } else if (contact.override_id) {
        // manual: direct update
        await updateContactOverride(contact.override_id, { [overrideField]: value })
      }
      await reloadList()
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[TeamContactsForm] edit error', e)
      setListError(e.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  const handleToggleHide = async (contact) => {
    setBusyAction(true)
    setListError(null)
    try {
      const newHidden = !contact.hidden
      if (contact.override_id) {
        await updateContactOverride(contact.override_id, { hidden: newHidden })
      } else if (contact.crew_id) {
        await upsertCrewContactOverride(productionId, contact.crew_id, {
          name_override: null, role_override: null,
          phone_override: null, email_override: null,
          hidden: newHidden,
          display_order: contact.display_order,
        })
      }
      await reloadList()
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[TeamContactsForm] toggle hide error', e)
      setListError(e.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  const handleAdd = async () => {
    setBusyAction(true)
    setListError(null)
    try {
      await addManualContact(productionId, {
        name: '',
        role: '',
        phone: '',
        email: '',
        display_order: 500 + contacts.length,
      })
      await reloadList()
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[TeamContactsForm] add error', e)
      setListError(e.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  const handleDelete = async (contact) => {
    if (!contact.override_id) return
    if (contact.crew_id) {
      if (!confirm('Reset this contact to crew defaults?')) return
    } else {
      if (!confirm('Remove this manual contact?')) return
    }
    setBusyAction(true)
    setListError(null)
    try {
      await deleteContactOverride(contact.override_id)
      await reloadList()
      if (onAfterPersist) onAfterPersist()
    } catch (e) {
      console.error('[TeamContactsForm] delete error', e)
      setListError(e.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  return (
    <>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Layout</label>
        <select value={layout} onChange={e => setLayout(e.target.value)} style={inputStyle}>
          <option value="inline">Inline (one line, separator dots)</option>
          <option value="rows">Rows (one contact per line)</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showEmail} onChange={e => setShowEmail(e.target.checked)} style={{ margin: 0 }} />
          Show email addresses
        </label>
      </div>
      <div style={fieldGroupStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoFromDB} onChange={e => setAutoFromDB(e.target.checked)} style={{ margin: 0 }} />
          Auto-pull from crew database
        </label>
        <div style={helpStyle}>
          Crew members with "Transport" in their department or role are listed automatically.
          Click a contact below to override any field, hide it, or add manual contacts.
        </div>
      </div>

      {/* Contacts list */}
      <div style={{ ...fieldGroupStyle, marginTop: 14, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
        <label style={labelStyle}>Contacts ({contacts.filter(c => !c.hidden).length} visible)</label>

        {listError && (
          <div style={{ padding: '6px 8px', marginBottom: 6, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 4, fontSize: 10 }}>
            ⚠ {listError}
          </div>
        )}

        {loadingList ? (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>Loading…</div>
        ) : contacts.length === 0 ? (
          <div style={{ ...helpStyle, padding: 10, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 4 }}>
            No transport crew found.<br/>Add a manual contact below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: busyAction ? 0.5 : 1, pointerEvents: busyAction ? 'none' : 'auto' }}>
            {contacts.map(c => (
              <div key={c.key} style={{
                border: '1px solid ' + (c.hidden ? '#fde68a' : '#e2e8f0'),
                background: c.hidden ? '#fffbeb' : '#ffffff',
                borderRadius: 6,
                padding: 8,
                opacity: c.hidden ? 0.65 : 1,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                  <input
                    type="text"
                    defaultValue={c.name}
                    onBlur={e => { if (e.target.value !== c.name) handleFieldEdit(c, 'name', e.target.value) }}
                    placeholder="Name"
                    style={{ ...inputStyle, fontSize: 11, fontWeight: 600 }}
                  />
                  <input
                    type="text"
                    defaultValue={c.role}
                    onBlur={e => { if (e.target.value !== c.role) handleFieldEdit(c, 'role', e.target.value) }}
                    placeholder="Role"
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <input
                    type="text"
                    defaultValue={c.phone}
                    onBlur={e => { if (e.target.value !== c.phone) handleFieldEdit(c, 'phone', e.target.value) }}
                    placeholder="Phone"
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                  <input
                    type="text"
                    defaultValue={c.email}
                    onBlur={e => { if (e.target.value !== c.email) handleFieldEdit(c, 'email', e.target.value) }}
                    placeholder="Email"
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
                    {c.crew_id ? `From crew (${c.crew_id})` : 'Manual contact'}
                    {c.override_id && c.crew_id ? ' · overridden' : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => handleToggleHide(c)}
                      title={c.hidden ? 'Show in TL' : 'Hide from TL'}
                      style={{
                        padding: '3px 8px', fontSize: 10,
                        background: 'transparent', border: '1px solid #cbd5e1',
                        borderRadius: 3, cursor: 'pointer',
                        color: c.hidden ? '#92400e' : '#64748b',
                      }}
                    >
                      {c.hidden ? '👁 Show' : '◌ Hide'}
                    </button>
                    {c.override_id && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        title={c.crew_id ? 'Reset to crew defaults' : 'Remove manual contact'}
                        style={{
                          padding: '3px 8px', fontSize: 10,
                          background: 'transparent', border: '1px solid #fecaca',
                          borderRadius: 3, cursor: 'pointer', color: '#dc2626',
                        }}
                      >
                        {c.crew_id ? '↺ Reset' : '✕ Remove'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={busyAction}
          style={{
            width: '100%', padding: '6px 8px', marginTop: 8,
            background: '#ffffff', border: '1px dashed #cbd5e1',
            borderRadius: 4, cursor: 'pointer', color: '#475569', fontSize: 11,
          }}
        >
          + Add manual contact
        </button>
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
