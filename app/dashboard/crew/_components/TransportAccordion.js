'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌', TRUCK: '🚛', PICKUP: '🛻', CARGO: '🚚' }

export default function TransportAccordion({ crewId, productionId }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [driverVehicles, setDriverVehicles] = useState([])
  const [paxVehicles, setPaxVehicles] = useState([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: dData }, { data: pData }] = await Promise.all([
      supabase.from('vehicles')
        .select('uuid, display_id, vehicle_type, sign_code, license_plate, is_rental, is_ncc, is_comodato, rental_brand, rental_model')
        .eq('production_id', productionId)
        .eq('active', true)
        .eq('driver_crew_id', crewId),
      supabase.from('vehicles')
        .select('uuid, display_id, vehicle_type, sign_code, license_plate, is_rental, is_ncc, is_comodato')
        .eq('production_id', productionId)
        .eq('active', true)
        .contains('preferred_crew_ids', [crewId]),
    ])
    setDriverVehicles(dData || [])
    setPaxVehicles(pData || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  function openVehicle(v) {
    const tab = v.is_rental ? 'rental' : v.is_ncc ? 'ncc' : v.is_comodato ? 'comodato' : 'production'
    sessionStorage.setItem('vehiclesOpenEdit', JSON.stringify({ uuid: v.uuid, tab }))
    router.push('/dashboard/vehicles')
  }

  const total = driverVehicles.length + paxVehicles.length

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: open ? '8px 8px 0 0' : '8px', border: '1px solid #e2e8f0', background: open ? '#eff6ff' : '#f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: open ? '#1d4ed8' : '#374151' }}>
          🚗 Transport
          {total > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#1d4ed8', background: '#eff6ff', padding: '1px 6px', borderRadius: '999px', border: '1px solid #bfdbfe' }}>✓ {total}</span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#eff6ff', padding: '10px 12px 8px' }}>
          {loading ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>Loading…</div>
          ) : total === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No transport assigned</div>
          ) : (
            <>
              {driverVehicles.map(v => {
                const icon = TYPE_ICON[v.vehicle_type] || '🚐'
                const label = v.is_rental
                  ? [v.rental_brand, v.rental_model].filter(Boolean).join(' ') || v.sign_code || v.display_id
                  : v.sign_code || v.display_id
                return (
                  <div key={v.uuid} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '7px', padding: '7px 10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <span style={{ fontWeight: '700', color: '#1d4ed8' }}>{icon} DRIVER · {label}{v.license_plate ? ` · ${v.license_plate}` : ''}</span>
                    </div>
                    <button type="button" onClick={() => openVehicle(v)}
                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#1d4ed8', flexShrink: 0 }}>
                      ✎
                    </button>
                  </div>
                )
              })}
              {paxVehicles.map(v => {
                const icon = TYPE_ICON[v.vehicle_type] || '🚐'
                const label = v.sign_code || v.display_id
                return (
                  <div key={v.uuid} style={{ background: 'white', border: '1px solid #86efac', borderRadius: '7px', padding: '7px 10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <span style={{ fontWeight: '700', color: '#15803d' }}>🚌 PAX · {label}{v.license_plate ? ` · ${v.license_plate}` : ''}</span>
                    </div>
                    <button type="button" onClick={() => openVehicle(v)}
                      style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#15803d', flexShrink: 0 }}>
                      ✎
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
