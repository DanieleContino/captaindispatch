'use client'

/**
 * /scan?qr=CR:CR0001   → scheda crew (mobile)
 * /scan?qr=VH:VAN-01   → scheda veicolo (mobile)
 *
 * Pagina pubblica (no auth) — usata da QR code su badge.
 * Risolve via /api/qr/resolve → mostra dati live.
 * Equivalente di resolveQR() + WrapTripApp link in Apps Script.
 */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const TS_LABEL = { IN: 'IN ARRIVO', OUT: 'IN PARTENZA', PRESENT: 'PRESENTE' }
const TS_COLOR = { IN: { bg: '#eff6ff', color: '#1d4ed8', dot: '#2563eb' }, OUT: { bg: '#fff7ed', color: '#c2410c', dot: '#ea580c' }, PRESENT: { bg: '#f0fdf4', color: '#15803d', dot: '#16a34a' } }
const HS_COLOR = { CONFIRMED: { bg: '#f0fdf4', color: '#15803d' }, PENDING: { bg: '#fefce8', color: '#a16207' }, CHECKED_OUT: { bg: '#f1f5f9', color: '#64748b' } }

function fmtDate(d) {
  if (!d) return '–'
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Crew Card ─────────────────────────────────────────────────
function CrewCard({ data, onWrapTrip }) {
  const ts = TS_COLOR[data.travel_status] || TS_COLOR.PRESENT
  const hs = HS_COLOR[data.hotel_status] || HS_COLOR.PENDING
  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ background: '#0f2340', borderRadius: '16px 16px 0 0', padding: '24px 20px 20px', textAlign: 'center' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 12px' }}>
          🎬
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', letterSpacing: '-0.3px' }}>{data.full_name}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{data.department}</div>
        <div style={{ marginTop: '10px' }}>
          <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: ts.bg, color: ts.color, display: 'inline-block' }}>
            <span style={{ display: 'inline-block', width: '6px', height: '6px', background: ts.dot, borderRadius: '50%', marginRight: '5px', verticalAlign: 'middle' }} />
            {TS_LABEL[data.travel_status] || data.travel_status}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: 'white', borderRadius: '0 0 16px 16px', padding: '20px', border: '1px solid #e2e8f0', borderTop: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Hotel */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Hotel</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{data.hotel?.name || '–'}</span>
          </div>
          {/* Hotel Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Hotel Status</span>
            <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: hs.bg, color: hs.color }}>
              {data.hotel_status}
            </span>
          </div>
          {/* Arrival */}
          {data.arrival_date && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>🛬 Arrivo</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>{fmtDate(data.arrival_date)}</span>
            </div>
          )}
          {/* Departure */}
          {data.departure_date && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff7ed', borderRadius: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>🛫 Partenza</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#c2410c' }}>{fmtDate(data.departure_date)}</span>
            </div>
          )}
          {/* Notes */}
          {data.notes && (
            <div style={{ padding: '10px 12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
              📝 {data.notes}
            </div>
          )}
          {/* ID */}
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#cbd5e1', marginTop: '4px', fontFamily: 'monospace' }}>
            {data.id} · CAPTAIN Dispatch
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Card ──────────────────────────────────────────────
function VehicleCard({ data }) {
  const hasCurrent = !!data.current_trip
  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ background: hasCurrent ? '#1e3a5f' : '#0f2340', borderRadius: '16px 16px 0 0', padding: '24px 20px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🚐</div>
        <div style={{ fontSize: '26px', fontWeight: '900', color: 'white', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>{data.id}</div>
        {data.sign_code && <div style={{ fontSize: '13px', color: '#93c5fd', marginTop: '4px', fontWeight: '700' }}>{data.sign_code}</div>}
        <div style={{ marginTop: '10px' }}>
          <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: hasCurrent ? '#fef9c3' : '#f0fdf4', color: hasCurrent ? '#a16207' : '#15803d' }}>
            {hasCurrent ? '🟡 IN SERVIZIO' : '🟢 LIBERO'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: 'white', borderRadius: '0 0 16px 16px', padding: '20px', border: '1px solid #e2e8f0', borderTop: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {data.driver_name && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>👤 Driver</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{data.driver_name}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Capacità</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{data.capacity ? `×${data.capacity}` : '–'} · {data.vehicle_type || 'VAN'}</span>
          </div>
          {hasCurrent && (
            <div style={{ padding: '12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.05em', marginBottom: '6px' }}>TRIP CORRENTE</div>
              <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}>{data.current_trip.trip_id}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                {data.current_trip.pax_count || 0} pax
                {data.current_trip.passenger_list && (
                  <span style={{ marginLeft: '6px' }}> · {data.current_trip.passenger_list.split(',').slice(0, 2).join(', ')}{data.current_trip.passenger_list.split(',').length > 2 ? '…' : ''}</span>
                )}
              </div>
            </div>
          )}
          {/* Wrap Trip CTA */}
          <a href={`/wrap-trip?vehicle=${data.id}`}
            style={{ display: 'block', textAlign: 'center', background: '#0f2340', color: 'white', padding: '13px', borderRadius: '10px', fontSize: '14px', fontWeight: '800', textDecoration: 'none', marginTop: '6px' }}>
            📦 Wrap Trip
          </a>
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#cbd5e1', fontFamily: 'monospace' }}>
            {data.id} · CAPTAIN Dispatch
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente inner (usa useSearchParams) ───────────────────
function ScanContent() {
  const searchParams = useSearchParams()
  const qr = searchParams.get('qr') || ''
  const [state, setState] = useState('loading')  // loading | ok | error
  const [data,  setData]  = useState(null)
  const [err,   setErr]   = useState('')

  useEffect(() => {
    if (!qr) { setState('error'); setErr('Nessun codice QR fornito. Usa ?qr=CR:xxx o ?qr=VH:xxx'); return }
    setState('loading')
    fetch(`/api/qr/resolve?qr=${encodeURIComponent(qr)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setState('error'); setErr(d.error) }
        else { setData(d); setState('ok') }
      })
      .catch(e => { setState('error'); setErr(e.message) })
  }, [qr])

  if (state === 'loading') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>🔍</div>
      <div style={{ color: '#64748b', fontSize: '14px', fontWeight: '600' }}>Risoluzione QR…</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{qr}</div>
    </div>
  )

  if (state === 'error') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '16px', padding: '24px' }}>
      <div style={{ fontSize: '48px' }}>❌</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626', textAlign: 'center' }}>QR non valido</div>
      <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>{err}</div>
      {qr && <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace', background: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }}>{qr}</div>}
    </div>
  )

  return data.type === 'crew'
    ? <CrewCard data={data} />
    : <VehicleCard data={data} />
}

// ─── Pagina principale ─────────────────────────────────────────
export default function ScanPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Mini header mobile */}
      <div style={{ background: '#0f2340', padding: '0 16px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: '900', color: 'white', letterSpacing: '-0.5px' }}>
          CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
        </span>
      </div>

      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ color: '#94a3b8' }}>Loading…</div>
        </div>
      }>
        <ScanContent />
      </Suspense>
    </div>
  )
}
