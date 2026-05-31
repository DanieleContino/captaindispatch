'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'

const SIDEBAR_W = 400

export function NccDriverSidebar({ open, mode, initial, onClose, onSaved, productionId, agencyId }) {
  const EMPTY = { name: '', phone: '', notes: '', is_active: true }

  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDel]    = useState(false)
  const [confirmDel, setCd]   = useState(false)
  const [error, setError]     = useState(null)
  const [copied, setCopied]   = useState(false)
  const [agencyName, setAgencyName] = useState(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setCd(false)
    setCopied(false)
    // Fetch agency name for the banner
    if (agencyId) {
      supabase.from('ncc_agencies').select('name').eq('id', agencyId).single()
        .then(({ data }) => setAgencyName(data?.name || null))
    } else {
      setAgencyName(null)
    }
    if (mode === 'edit' && initial) {
      setForm({
        name:      initial.name      || '',
        phone:     initial.phone     || '',
        notes:     initial.notes     || '',
        is_active: initial.is_active !== false,
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, mode, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Driver Name is required'); return }
    setSaving(true)
    let err
    if (mode === 'new') {
      const { error: e } = await supabase.from('ncc_drivers').insert({
        production_id: productionId,
        agency_id:     agencyId,
        name:          form.name.trim(),
        phone:         form.phone.trim() || null,
        notes:         form.notes.trim() || null,
        is_active:     form.is_active,
      })
      err = e
    } else {
      const { error: e } = await supabase
        .from('ncc_drivers')
        .update({
          name:      form.name.trim(),
          phone:     form.phone.trim() || null,
          notes:     form.notes.trim() || null,
          is_active: form.is_active,
        })
        .eq('id', initial.id)
      err = e
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    // Sync legacy fields on all vehicles assigned to this driver
    if (mode === 'edit' && initial?.id) {
      await supabase
        .from('vehicles')
        .update({
          ncc_driver_name:  form.name.trim() || null,
          ncc_driver_phone: form.phone.trim() || null,
        })
        .eq('ncc_driver_id', initial.id)
        .eq('production_id', productionId)
    }
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDel) { setCd(true); return }
    setDel(true)
    const { error: e } = await supabase
      .from('ncc_drivers')
      .delete()
      .eq('id', initial.id)
    setDel(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  async function handleRegenerateToken() {
    if (!window.confirm('Regenerate token? The old link will stop working.')) return
    const { error: e } = await supabase
      .from('ncc_drivers')
      .update({ tracking_token: crypto.randomUUID() })
      .eq('id', initial.id)
    if (e) { setError(e.message); return }
    onSaved()
  }

  function handleCopy() {
    const url = `https://captaindispatch.com/go/${initial?.tracking_token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const inp = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#0f172a',
    background: 'white',
    boxSizing: 'border-box',
  }
  const lbl = {
    fontSize: '10px',
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: '3px',
  }
  const fld = { marginBottom: '12px' }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }}
        />
      )}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : `${SIDEBAR_W}px`,
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0f2340',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
            {mode === 'new' ? '🧑‍✈️ New Driver' : '🧑‍✈️ Edit Driver'}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              fontSize: '16px',
              lineHeight: 1,
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px' }}>

            {/* Agency — readonly banner */}
            <div style={{ ...fld, padding: '10px 14px', borderRadius: '9px', border: '1px solid #bae6fd', background: '#f0f9ff' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '2px' }}>Agency</div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1' }}>
                🏢 {agencyName || agencyId}
              </div>
            </div>

            {/* Driver Name */}
            <div style={fld}>
              <label style={lbl}>Driver Name</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                style={inp}
                placeholder="Mario Rossi"
                required
              />
            </div>

            {/* Phone */}
            <div style={fld}>
              <label style={lbl}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                style={inp}
                placeholder="+39 333 000 0000"
              />
            </div>

            {/* Notes */}
            <div style={fld}>
              <label style={lbl}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                style={{ ...inp, resize: 'vertical', minHeight: '72px' }}
                placeholder="Optional notes…"
              />
            </div>

            {/* is_active toggle */}
            <div
              style={{
                ...fld,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '9px',
                border: `1px solid ${form.is_active ? '#86efac' : '#e2e8f0'}`,
                background: form.is_active ? '#f0fdf4' : '#f8fafc',
                cursor: 'pointer',
              }}
              onClick={() => set('is_active', !form.is_active)}
            >
              {/* Toggle knob */}
              <div style={{
                width: '36px',
                height: '20px',
                borderRadius: '999px',
                background: form.is_active ? '#16a34a' : '#cbd5e1',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: form.is_active ? '18px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: form.is_active ? '#15803d' : '#64748b' }}>
                {form.is_active ? '✅ Active' : '⛔ Inactive'}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>Active</div>
            </div>

            {/* Tracking Token — edit mode only */}
            {mode === 'edit' && initial?.tracking_token && (
              <div style={{
                ...fld,
                padding: '12px 14px',
                borderRadius: '9px',
                border: '1px solid #bae6fd',
                background: '#f0f9ff',
              }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Tracking Link
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <input
                    readOnly
                    value={`https://captaindispatch.com/go/${initial.tracking_token}`}
                    style={{
                      ...inp,
                      flex: 1,
                      background: '#e0f2fe',
                      color: '#0369a1',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      border: '1px solid #bae6fd',
                      cursor: 'text',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    style={{
                      flexShrink: 0,
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid #bae6fd',
                      background: copied ? '#dcfce7' : 'white',
                      color: copied ? '#15803d' : '#0369a1',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.2s',
                    }}
                  >
                    {copied ? '✅ Copied' : '📋 Copy'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #bae6fd',
                    background: 'white',
                    color: '#0369a1',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  ↻ Rigenera Token
                </button>
              </div>
            )}

            {/* Delete — edit mode only */}
            {mode === 'edit' && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Danger Zone</div>
                {!confirmDel ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: '700', width: '100%' }}
                  >
                    🗑 Delete Driver
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700', marginBottom: '8px' }}>
                      Are you sure? This cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setCd(false)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                      >Cancel</button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}
                      >
                        {deleting ? 'Deleting…' : '⚠ Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
              ❌ {error}
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '8px',
            position: 'sticky',
            bottom: 0,
            background: 'white',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
            >Cancel</button>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: '800' }}
            >
              {saving ? 'Saving…' : mode === 'new' ? '+ Add Driver' : '✓ Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
