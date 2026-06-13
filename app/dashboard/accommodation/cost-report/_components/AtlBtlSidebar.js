'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../../../lib/supabase'
import { getProductionId } from '../../../../../lib/production'

export default function AtlBtlSidebar({ open, atlDepts, onClose, onSaved }) {
  const PRODUCTION_ID = getProductionId()
  const [allDepts, setAllDepts] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !PRODUCTION_ID) return
    setSelected(atlDepts || [])
    setLoading(true)
    supabase
      .from('crew')
      .select('department')
      .eq('production_id', PRODUCTION_ID)
      .not('department', 'is', null)
      .then(({ data }) => {
        const depts = [...new Set((data || []).map(c => (c.department || '').trim().toUpperCase()).filter(Boolean))].sort()
        setAllDepts(depts)
        setLoading(false)
      })
  }, [open])

  function toggle(dept) {
    setSelected(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    )
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/productions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PRODUCTION_ID, atl_departments: selected }),
    })
    setSaving(false)
    if (res.ok) onSaved(selected)
  }

  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '360px',
        background: 'white', borderLeft: '1px solid #e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 50, transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>⚙ ATL / BTL Configuration</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: 1.6, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            Select which departments are <strong>ATL</strong> (Above The Line).<br />
            All other departments are automatically <strong>BTL</strong> (Below The Line).
          </div>

          <label style={lbl}>Departments</label>

          {loading ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', padding: '20px', textAlign: 'center' }}>Loading…</div>
          ) : allDepts.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '12px' }}>No departments found in crew.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {allDepts.map(dept => {
                const isAtl = selected.includes(dept)
                return (
                  <button key={dept} type="button" onClick={() => toggle(dept)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: '8px', border: '1px solid',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                      ...(isAtl
                        ? { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }
                        : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }),
                    }}>
                    <span style={{ fontSize: '13px', fontWeight: '700' }}>{dept}</span>
                    <span style={{
                      fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', border: '1px solid',
                      ...(isAtl
                        ? { background: '#dbeafe', color: '#1d4ed8', borderColor: '#93c5fd' }
                        : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }),
                    }}>
                      {isAtl ? 'ATL' : 'BTL'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {selected.length > 0 && (
            <div style={{ marginTop: '16px', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '11px', color: '#15803d' }}>
              <strong>ATL:</strong> {selected.join(', ')}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
            {saving ? 'Saving…' : 'Save ATL/BTL'}
          </button>
        </div>
      </div>
    </>
  )
}
