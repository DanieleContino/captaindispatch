'use client'

export default function ExtrasModal({ stay, onClose }) {
  if (!stay) return null
  const eciF = stay.early_checkin ? (parseFloat(stay.early_checkin_fee) || 0) : 0
  const lcoF = stay.late_checkout  ? (parseFloat(stay.late_checkout_fee)  || 0) : 0
  const tot  = eciF + lcoF
  const fmtE = (v) => `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,35,64,0.2)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61, background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', background: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: 'white' }}>🧾 Extras</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>{stay.crew?.full_name || '—'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stay.early_checkin && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🕐</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>Early Check-in</div>
                  {stay.actual_checkin_time && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{stay.actual_checkin_time.slice(0, 5)}</div>}
                </div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8', fontFamily: 'monospace' }}>{fmtE(eciF)}</span>
            </div>
          )}
          {stay.late_checkout && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🕐</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#c2410c' }}>Late Check-out</div>
                  {stay.actual_checkout_time && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{stay.actual_checkout_time.slice(0, 5)}</div>}
                </div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#c2410c', fontFamily: 'monospace' }}>{fmtE(lcoF)}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#15803d' }}>Total</span>
            <span style={{ fontSize: '14px', fontWeight: '900', color: '#15803d', fontFamily: 'monospace' }}>{fmtE(tot)}</span>
          </div>
        </div>
      </div>
    </>
  )
}
