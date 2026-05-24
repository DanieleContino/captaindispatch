'use client'
import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export function SendLinksModal({ open, onClose, productionId }) {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  useEffect(() => {
    if (!open || !productionId) return
    setLoading(true)
    supabase
      .from('vehicles')
      .select(`
        id, driver_name, driver_crew_id, ncc_driver_id, vehicle_type, sign_code,
        ncc_driver:ncc_drivers(id, name, phone, tracking_token),
        crew_driver:crew!driver_crew_id(id, full_name, phone, tracking_token)
      `)
      .eq('production_id', productionId)
      .eq('active', true)
      .eq('in_transport', true)
      .order('id')
      .then(({ data }) => {
        const list = []
        for (const v of (data || [])) {
          if (v.ncc_driver) {
            list.push({ id: v.ncc_driver.id, name: v.ncc_driver.name, phone: v.ncc_driver.phone, token: v.ncc_driver.tracking_token, vehicle: v.id, type: 'NCC' })
          } else if (v.crew_driver) {
            list.push({ id: v.crew_driver.id, name: v.crew_driver.full_name, phone: v.crew_driver.phone, token: v.crew_driver.tracking_token, vehicle: v.id, type: 'CREW' })
          } else if (v.driver_name) {
            list.push({ id: v.id, name: v.driver_name, phone: null, token: null, vehicle: v.id, type: 'MANUAL' })
          }
        }
        setDrivers(list)
        setLoading(false)
      })
  }, [open, productionId])

  function handleCopy(d) {
    navigator.clipboard.writeText('https://captaindispatch.com/go/' + d.token)
    setCopiedId(d.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleCopyAll() {
    const withToken = drivers.filter(d => d.token)
    const text = '🎬 Captain Go Links\n\n' + withToken.map(d => `👤 ${d.name} (${d.vehicle}):\nhttps://captaindispatch.com/go/${d.token}`).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  if (!open) return null

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const withToken = drivers.filter(d => d.token)
  const typeColor = {
    NCC:    { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd', label: 'NCC' },
    CREW:   { bg: '#f0fdf4', color: '#15803d', border: '#86efac', label: 'CREW' },
    MANUAL: { bg: '#fef3c7', color: '#b45309', border: '#fde68a', label: 'MANUAL' },
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,35,64,0.4)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 201, display: 'flex', flexDirection: 'column', background: 'white', maxWidth: '480px', margin: '0 auto' }}>

        <div style={{ background: '#0f2340', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>📱 Driver Links</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{today}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading…</div>}
          {!loading && drivers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚐</div>
              <div style={{ fontSize: '13px' }}>No active drivers found</div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>Assign drivers to active vehicles first</div>
            </div>
          )}
          {drivers.map(d => {
            const tc = typeColor[d.type]
            return (
              <div key={d.id + d.vehicle} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>👤</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{d.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>🚐 {d.vehicle}{d.phone ? ` · ${d.phone}` : ''}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{tc.label}</span>
                </div>

                {d.token ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {d.phone ? (
                      <a
                        href={`https://wa.me/${d.phone.replace(/\D/g,'')}?text=${encodeURIComponent('Ciao ' + d.name + ', ecco il tuo link Captain Go:\nhttps://captaindispatch.com/go/' + d.token)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: '#25D366', color: 'white', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>
                        📱 WhatsApp
                      </a>
                    ) : (
                      <button disabled style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#f1f5f9', color: '#94a3b8', fontSize: '12px', border: 'none', cursor: 'not-allowed' }}>
                        📱 No phone
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(d)}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: copiedId === d.id ? '#f0fdf4' : 'white', color: copiedId === d.id ? '#15803d' : '#374151', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                      {copiedId === d.id ? '✅ Copiato!' : '🔗 Copia Link'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '8px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '11px', color: '#92400e' }}>
                    ⚠ Nessun token — aggiungi questo driver al sistema
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', textAlign: 'center' }}>
            {withToken.length} driver con link attivo
          </div>
          <button
            onClick={handleCopyAll}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: copiedAll ? '#f0fdf4' : 'white', color: copiedAll ? '#15803d' : '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            {copiedAll ? `✅ Copiati ${withToken.length} links!` : '📋 Copia Tutti i Links'}
          </button>
        </div>
      </div>
    </>
  )
}
