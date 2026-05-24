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
    loadDrivers()
  }, [open, productionId])

  async function loadDrivers() {
    setLoading(true)
    const { data: vehicles, error } = await supabase
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

    if (error) {
      console.error('SendLinksModal: error loading vehicles', error)
      setLoading(false)
      return
    }

    const list = []
    for (const v of vehicles || []) {
      if (v.ncc_driver) {
        list.push({
          name: v.ncc_driver.name,
          phone: v.ncc_driver.phone,
          token: v.ncc_driver.tracking_token,
          vehicle: v.sign_code || v.id,
          type: 'NCC',
        })
      } else if (v.crew_driver) {
        list.push({
          name: v.crew_driver.full_name,
          phone: v.crew_driver.phone,
          token: v.crew_driver.tracking_token,
          vehicle: v.sign_code || v.id,
          type: 'CREW',
        })
      } else if (v.driver_name) {
        list.push({
          name: v.driver_name,
          phone: null,
          token: null,
          vehicle: v.sign_code || v.id,
          type: 'MANUAL',
        })
      }
    }

    setDrivers(list)
    setLoading(false)
  }

  function handleCopyLink(driver, idx) {
    navigator.clipboard.writeText('https://captaindispatch.com/go/' + driver.token)
    setCopiedId(idx)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleCopyAll() {
    const withToken = drivers.filter(d => d.token)
    const text =
      '🎬 Captain Go Links\n\n' +
      withToken
        .map(d => `👤 ${d.name} (${d.vehicle}):\nhttps://captaindispatch.com/go/${d.token}`)
        .join('\n\n') +
      '\n\n'
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const driversWithToken = drivers.filter(d => d.token)

  const badgeStyle = {
    NCC: { background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' },
    CREW: { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' },
    MANUAL: { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' },
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 520,
          background: '#f8fafc',
          margin: '0 auto',
          height: '100%',
          overflowY: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#0f2340',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 17 }}>
              📱 Driver Links
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>{today}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: 22,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 6px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
              Caricamento…
            </div>
          )}

          {!loading && drivers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
              Nessun veicolo attivo trovato.
            </div>
          )}

          {!loading &&
            drivers.map((driver, idx) => (
              <div
                key={idx}
                style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                }}
              >
                {/* Row 1: name + badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                    👤 {driver.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      padding: '2px 8px',
                      ...badgeStyle[driver.type],
                    }}
                  >
                    {driver.type === 'NCC' ? '🏢 NCC' : driver.type === 'CREW' ? '🎬 CREW' : '✏ MANUAL'}
                  </span>
                </div>

                {/* Row 2: vehicle + phone */}
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                  🚐 {driver.vehicle}
                  {driver.phone && <span> · {driver.phone}</span>}
                </div>

                {/* Actions */}
                {driver.token ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* WhatsApp */}
                    {driver.phone ? (
                      <a
                        href={`https://wa.me/${driver.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          'Ciao ' +
                            driver.name +
                            ', ecco il tuo link Captain Go per oggi:\n' +
                            'https://captaindispatch.com/go/' +
                            driver.token
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#25D366',
                          color: 'white',
                          borderRadius: 8,
                          padding: '7px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        📱 WhatsApp
                      </a>
                    ) : (
                      <span
                        title="Nessun telefono registrato"
                        style={{
                          background: '#d1fae5',
                          color: '#6b7280',
                          borderRadius: 8,
                          padding: '7px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-block',
                          opacity: 0.5,
                          cursor: 'not-allowed',
                        }}
                      >
                        📱 WhatsApp
                      </span>
                    )}

                    {/* Copy link */}
                    <button
                      onClick={() => handleCopyLink(driver, idx)}
                      style={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: '#0f172a',
                      }}
                    >
                      {copiedId === idx ? '✅ Copiato!' : '🔗 Copia Link'}
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#b45309',
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: 8,
                      padding: '6px 10px',
                    }}
                  >
                    ⚠ Nessun token — aggiungi questo driver al sistema
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            background: 'white',
            padding: '12px 14px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {driversWithToken.length} driver con link attivo
          </span>
          <button
            onClick={handleCopyAll}
            disabled={driversWithToken.length === 0}
            style={{
              background: driversWithToken.length === 0 ? '#e2e8f0' : '#0f2340',
              color: driversWithToken.length === 0 ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: driversWithToken.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {copiedAll
              ? `✅ Copiati ${driversWithToken.length} links!`
              : '📋 Copia Tutti i Links'}
          </button>
        </div>
      </div>
    </div>
  )
}
