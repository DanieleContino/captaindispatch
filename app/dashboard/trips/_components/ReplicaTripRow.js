'use client'
import { CLS, minToHHMM, baseTripId, fmtPax } from '../../../../lib/tripUtils'

export default function ReplicaTripRow({ group, locations, selected, onToggle }) {
  const firstLeg = group.reduce((min, r) => (r.leg_order ?? 99) < (min.leg_order ?? 99) ? r : min, group[0])
  const t = firstLeg

  const pickupIds  = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
  const dropoffIds = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1
  const isMixed = isMultiPickup || isMultiDropoff

  const cls = CLS[t.transfer_class] || CLS.STANDARD

  const earliestMin = group.reduce((m, r) => {
    const v = r.call_min ?? r.pickup_min ?? 9999
    return v < m ? v : m
  }, 9999)
  const mainTime = earliestMin < 9999 ? minToHHMM(earliestMin) : '–'

  const signLine = [t.sign_code, t.driver_name].filter(Boolean).join(' · ') || null

  const allPax = isMixed
    ? group.flatMap(r => r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
    : (t.passenger_list ? t.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
  const uniquePax = [...new Set(allPax)]

  const totalPax = group.reduce((s, r) => s + (r.pax_count || 0), 0)

  const locShort = id => (locations[id] || id || '–').split(' ').slice(0, 2).join(' ')

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '10px 12px', marginBottom: '5px', borderRadius: '10px',
        border: `2px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
        background: selected ? '#eff6ff' : 'white',
        cursor: 'pointer', transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, marginTop: '2px',
        border: `2px solid ${selected ? '#2563eb' : '#cbd5e1'}`,
        background: selected ? '#2563eb' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <span style={{ color: 'white', fontSize: '13px', lineHeight: 1 }}>✓</span>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Row 1: time + trip_id + badges + sign/driver */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', lineHeight: 1 }}>
            {mainTime}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '900', color: '#1e3a5f' }}>
            {baseTripId(t.trip_id)}
          </span>
          <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>
            {t.transfer_class === 'STANDARD' ? 'TRF' : (t.transfer_class?.slice(0, 3) || 'TRF')}
          </span>
          {isMultiPickup  && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>🔀 MULTI-PKP</span>}
          {isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>🔀 MULTI-DRP</span>}
          {signLine && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151', marginLeft: '2px' }}>
              {signLine}
            </span>
          )}
        </div>

        {/* Row 2: route — tutti i leg */}
        <div style={{ marginBottom: '4px' }}>
          {isMixed ? (
            group
              .slice()
              .sort((a, b) => (a.leg_order ?? 99) - (b.leg_order ?? 99))
              .map((r, ri) => (
                <div key={r.id || ri} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginBottom: ri < group.length - 1 ? '3px' : 0 }}>
                  <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontWeight: '800', flexShrink: 0 }}>
                    🕐{r.pickup_min != null ? minToHHMM(r.pickup_min) : (r.call_min != null ? minToHHMM(r.call_min) : '–')}
                  </span>
                  <span style={{ color: '#94a3b8', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>
                    {locShort(r.pickup_id)}
                  </span>
                  <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
                  <span style={{ fontWeight: '700', color: '#0f172a', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {locShort(r.dropoff_id)}
                  </span>
                  {r.pax_count > 0 && <span style={{ color: '#64748b', flexShrink: 0 }}>· {r.pax_count}pax</span>}
                </div>
              ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <span style={{ color: '#94a3b8' }}>{locShort(t.pickup_id)}</span>
              <span style={{ color: '#cbd5e1' }}>→</span>
              <span style={{ fontWeight: '700', color: '#0f172a' }}>{locShort(t.dropoff_id)}</span>
              {t.flight_no && <span style={{ color: '#2563eb', fontWeight: '700', marginLeft: '4px' }}>✈ {t.flight_no}</span>}
              {totalPax > 0 && <span style={{ color: '#64748b', marginLeft: '4px' }}>· 👥 {totalPax} pax</span>}
            </div>
          )}
        </div>

        {/* Row 3: passeggeri */}
        {uniquePax.length > 0 && (
          <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {uniquePax.map(s => fmtPax(s)).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
