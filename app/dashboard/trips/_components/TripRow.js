'use client'

import { useT } from '../../../../lib/i18n'
import { CLS, STS, TRIP_COLS, minToHHMM, baseTripId, fmtPax } from '../../../../lib/tripUtils'

// ─── TripRow (desktop) ────────────────────────────────────────
export function TripRow({ group, locations, vehicles, selected, onClick, isSuggested, onOptimize }) {
  const i18n = useT()
  const t   = group[0]
  const cls = CLS[t.transfer_class] || CLS.STANDARD
  const sts = STS[t.status] || STS.PLANNED

  const pickupIds   = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
  const dropoffIds  = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff

  const pickupLoc  = locations[t.pickup_id]  || t.pickup_id  || '–'
  const dropoffLoc = isMultiDropoff
    ? dropoffIds.map(id => (locations[id] || id || '')).join(' / ')
    : (locations[t.dropoff_id] || t.dropoff_id || '–')

  const callTime   = t.call_min   !== null ? minToHHMM(t.call_min)   : null
  const pickupTime = t.pickup_min !== null ? minToHHMM(t.pickup_min) : callTime
  const arrTime    = t.arr_time   ? t.arr_time.slice(0, 5) : null
  const earliestPickupMin = isMixed
    ? Math.min(...group.map(r => r.pickup_min ?? r.call_min ?? 9999).filter(n => n < 9999))
    : null
  const mainTime = isMixed
    ? (earliestPickupMin < 9999 ? minToHHMM(earliestPickupMin) : callTime || '–')
    : (callTime || pickupTime || '–')

  const paxNames = isMixed
    ? [...new Set(group.flatMap(r => r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []))]
    : (t.passenger_list ? t.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
  const uniquePaxCount = isMixed ? paxNames.length : (t.pax_count || 0)
  const paxColor = (!t.pax_count || !t.capacity) ? '#64748b'
    : t.pax_count >= t.capacity ? '#dc2626'
    : t.pax_count >= t.capacity * 0.75 ? '#d97706'
    : '#16a34a'

  return (
    <div onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: TRIP_COLS.map(c => c.width).join(' '),
        justifyContent: 'start',
        alignItems: 'start',
        padding: '10px 14px 10px 14px',
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        background: selected ? '#eff6ff' : isSuggested ? '#fffbeb' : isMixed ? (isMultiPickup && isMultiDropoff ? '#fdf4ff' : isMultiPickup ? '#fffbeb' : '#fdf4ff') : 'white',
        borderLeft: `4px solid ${selected ? '#2563eb' : isSuggested ? '#f59e0b' : isMixed ? (isMultiPickup ? '#d97706' : '#7c3aed') : cls.dot}`,
        transition: 'background 0.1s',
        gap: '10px',
        fontSize: '12px',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = isSuggested ? '#fffbeb' : 'white' }}
    >
      {/* TIME */}
      <div>
        <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, letterSpacing: '-0.5px' }}>{mainTime}</div>
        {pickupTime && callTime && pickupTime !== callTime && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: '#94a3b8' }}>pickup</span> {pickupTime}
          </div>
        )}
        {arrTime && (
          <div style={{ fontSize: '10px', fontWeight: '700', color: cls.color, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {t.transfer_class === 'ARRIVAL' ? '✈ arr' : '✈ dep'} {arrTime}
          </div>
        )}
        {!isMixed && t.pickup_min != null && t.duration_min && (
          <div style={{ fontSize: '10px', fontWeight: '700', color: cls.color, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {t.transfer_class === 'ARRIVAL' ? '🏨' : '→'} {minToHHMM((t.pickup_min + t.duration_min) % 1440)}
          </div>
        )}
        {isMixed && earliestPickupMin < 9999 && (() => {
          const chainArr = group.reduce((max, leg) => {
            if (leg.pickup_min != null && leg.duration_min) {
              const v = (leg.pickup_min + leg.duration_min) % 1440
              return max === null || v > max ? v : max
            }
            return max
          }, null)
          const lastEnd = group.reduce((max, leg) => { if (!leg.end_dt) return max; const v = new Date(leg.end_dt).getUTCHours()*60+new Date(leg.end_dt).getUTCMinutes(); return max===null||v>max?v:max }, null); const arrMin = (lastEnd !== null ? lastEnd : t.call_min != null ? t.call_min : chainArr)
          if (arrMin == null || arrMin === earliestPickupMin) return null
          return (
            <div style={{ fontSize: '10px', fontWeight: '700', color: cls.color, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              → {minToHHMM(arrMin)}
            </div>
          )
        })()}
      </div>

      {/* TRIP ID + CLASS + STATUS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e3a5f', fontFamily: 'monospace', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {baseTripId(t.trip_id) || '–'}
        </div>
        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`, letterSpacing: '0.04em', alignSelf: 'flex-start' }}>
          {t.transfer_class === 'STANDARD' ? 'TRF' : (t.transfer_class?.slice(0, 3) || 'TRF')}
        </span>
        {isMultiPickup && !isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', alignSelf: 'flex-start' }}>🔀 MULTI-PKP</span>}
        {isMultiDropoff && !isMultiPickup && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe', alignSelf: 'flex-start' }}>🔀 MULTI-DRP</span>}
        {isMultiPickup && isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', alignSelf: 'flex-start' }}>🔀 MIXED</span>}
        {isSuggested    && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef9c3', color: '#92400e', border: '1px solid #fbbf24', alignSelf: 'flex-start' }}>⭐ MATCH</span>}
        <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', background: sts.bg, color: sts.color, alignSelf: 'flex-start' }}>
          {t.status || 'PLANNED'}
        </span>
      </div>

      {/* VEHICLE */}
      <div style={{ minWidth: 0 }}>
        {t.vehicle_id ? (
          <>
            <div style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🚐 {t.sign_code ? <><span style={{ fontWeight: '800', color: '#374151' }}>{t.sign_code}</span><span style={{ fontWeight: '400', color: '#94a3b8' }}> · {(vehicles && vehicles[t.vehicle_id]) || t.vehicle_id}</span></> : <span style={{ fontWeight: '800', color: '#374151' }}>{(vehicles && vehicles[t.vehicle_id]) || t.vehicle_id}</span>}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
              {t.driver_name && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {t.driver_name}</div>}
              {t.capacity && <div>×{t.capacity} seats</div>}
            </div>
          </>
        ) : (
          <span style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noVehicle}</span>
        )}
      </div>

      {/* ROUTE */}
      <div style={{ minWidth: 0 }}>
        {isMixed ? (
          <>
            {group.map((r, ri) => (
              <div key={r.id || ri} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginBottom: ri < group.length - 1 ? '4px' : 0, minWidth: 0 }}>
                {(() => {
                  if (r.transfer_class === 'ARRIVAL') {
                    if (r.pickup_min != null && r.duration_min) {
                      const dropoffMin = (r.pickup_min + r.duration_min) % 1440
                      return <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: '800' }}>🏨{minToHHMM(dropoffMin)}</span>
                    }
                    return <span style={{ color: '#ea580c', flexShrink: 0, fontSize: '9px', fontWeight: '800', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '3px', padding: '1px 4px' }}>⚠ no route</span>
                  }
                  if (r.pickup_min != null) {
                    return <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: '800' }}>🕐{minToHHMM(r.pickup_min)}</span>
                  }
                  return <span style={{ color: '#ea580c', flexShrink: 0, fontSize: '9px', fontWeight: '800', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '3px', padding: '1px 4px' }}>⚠ no route</span>
                })()}
                <span style={{ color: '#94a3b8', fontWeight: '500', flexShrink: 0 }}>
                  {locations[r.pickup_id] || r.pickup_id || '–'}
                </span>
                <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
                <span style={{ fontWeight: '700', color: '#0f172a', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {locations[r.dropoff_id] || r.dropoff_id || '–'}
                </span>
                {r.pax_count > 0 && <span style={{ color: '#64748b', flexShrink: 0 }}>· {r.pax_count}pax</span>}
              </div>
            ))}
            {isMixed && onOptimize && (
              <div style={{ marginTop: '6px' }}>
                <button type="button" onClick={e => { e.stopPropagation(); onOptimize(group) }}
                  style={{ padding: '3px 9px', borderRadius: '6px', border: 'none', background: '#1e3a5f', color: 'white', fontSize: '10px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>
                  ⚡ Optimize
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 }}>
              <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>{pickupLoc}</span>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoffLoc}</span>
            </div>
            {t.flight_no && <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: '700', marginTop: '2px' }}>✈ {t.flight_no}{t.terminal ? ` · ${t.terminal}` : ''}</div>}
            {t.notes && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {t.notes}</div>}
            {t.duration_min && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>⏱ {t.duration_min} min</div>}
          </>
        )}
      </div>

      {/* PASSENGERS */}
      <div style={{ minWidth: 0 }}>
        {isMixed ? (() => {
          const isTrueMixed = isMultiPickup && isMultiDropoff
          if (!isTrueMixed) {
            // MULTI-PKP only or MULTI-DRP only — comportamento originale
            return group.map((r, ri) => {
              const legPax = r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
              return (
                <div key={r.id || ri} style={{ fontSize: '10px', color: '#374151', lineHeight: '16.5px', marginBottom: ri < group.length - 1 ? '4px' : 0 }}>
                  {legPax.length > 0 ? legPax.map(fmtPax).join(' · ') : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>}
                </div>
              )
            })
          }
          // MIXED (MULTI-PKP + MULTI-DRP): boarding per leg + riepilogo destinazioni
          const paxDropoff = {}
          group.forEach(r => {
            const names = r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
            names.forEach(name => { paxDropoff[name] = r.dropoff_id })
          })
          const dropoffGroups = {}
          Object.entries(paxDropoff).forEach(([name, dropoffId]) => {
            if (!dropoffGroups[dropoffId]) dropoffGroups[dropoffId] = []
            dropoffGroups[dropoffId].push(name)
          })
          const lastLegIndex = group.length - 1
          return (
            <>
              {group.map((r, ri) => {
                if (ri === lastLegIndex) return null
                const legPax = r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
                const prevPax = ri > 0 && group[ri - 1].passenger_list ? group[ri - 1].passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
                const boarding = ri === 0 ? legPax : legPax.filter(n => !prevPax.includes(n))
                return (
                  <div key={r.id || ri} style={{ fontSize: '10px', color: '#374151', lineHeight: '16.5px', marginBottom: '3px' }}>
                    {boarding.length > 0 ? boarding.map(fmtPax).join(' · ') : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>}
                  </div>
                )
              })}
              {Object.entries(dropoffGroups).map(([dropoffId, names]) => (
                <div key={dropoffId} style={{ fontSize: '10px', color: '#374151', lineHeight: '16.5px', marginTop: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>→ {locations[dropoffId] || dropoffId}: </span>
                  {names.map(fmtPax).join(' · ')}
                </div>
              ))}
            </>
          )
        })() : paxNames.length > 0 ? (
          <div style={{ fontSize: '10px', color: '#374151', lineHeight: 1.5 }}>{paxNames.map(fmtPax).join(' · ')}</div>
        ) : (
          <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noPaxAssigned}</div>
        )}
      </div>

      {/* PAX COUNT */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: paxColor, lineHeight: 1.3 }}>
          👥 {uniquePaxCount}{t.capacity ? `/${t.capacity}` : ''}
        </div>
        <div style={{ fontSize: '9px', color: paxColor, fontWeight: '700' }}>pax</div>
        {t.pax_conflict_flag && <div style={{ fontSize: '9px', color: '#dc2626', fontWeight: '800', marginTop: '2px' }}>⚠ conflict</div>}
      </div>
    </div>
  )
}

// ─── TripCardMobile ───────────────────────────────────────────
export function TripCardMobile({ group, locations, vehicles, selected, onClick, isSuggested }) {
  const t   = group[0]
  const cls = CLS[t.transfer_class] || CLS.STANDARD
  const sts = STS[t.status] || STS.PLANNED
  const pickupIds   = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
  const dropoffIds  = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff
  const pickupLoc  = locations[t.pickup_id]  || t.pickup_id  || '–'
  const dropoffLoc = isMultiDropoff
    ? dropoffIds.map(id => (locations[id] || id || '')).join(' / ')
    : (locations[t.dropoff_id] || t.dropoff_id || '–')
  const callTime   = t.call_min   !== null ? minToHHMM(t.call_min)   : null
  const pickupTime = t.pickup_min !== null ? minToHHMM(t.pickup_min) : callTime
  const earliestPickupMin = isMixed
    ? Math.min(...group.map(r => r.pickup_min ?? r.call_min ?? 9999).filter(n => n < 9999))
    : null
  const mainTime = isMixed
    ? (earliestPickupMin < 9999 ? minToHHMM(earliestPickupMin) : callTime || '–')
    : (callTime || pickupTime || '–')
  const paxNames = isMixed
    ? group.flatMap(r => r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
    : (t.passenger_list ? t.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
  const totalPax = isMixed ? group.reduce((s, r) => s + (r.pax_count || 0), 0) : (t.pax_count || 0)
  const paxColor = (!t.pax_count || !t.capacity) ? '#64748b'
    : t.pax_count >= t.capacity ? '#dc2626'
    : t.pax_count >= t.capacity * 0.75 ? '#d97706' : '#16a34a'

  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px', marginBottom: '6px', marginLeft: '12px', marginRight: '12px', borderRadius: '10px', background: selected ? '#eff6ff' : isSuggested ? '#fffbeb' : 'white', borderLeft: `4px solid ${selected ? '#2563eb' : isSuggested ? '#f59e0b' : cls.dot}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', cursor: 'pointer', touchAction: 'manipulation' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px', lineHeight: 1 }}>{mainTime}</div>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', flexShrink: 0 }}>
          {t.vehicle_id ? `🚐 ${(vehicles && vehicles[t.vehicle_id]) || t.vehicle_id}` : <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontWeight: '400', fontSize: '11px' }}>no vehicle</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '900', color: '#1e3a5f' }}>{baseTripId(t.trip_id)}</span>
        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{t.transfer_class === 'STANDARD' ? 'TRF' : (t.transfer_class?.slice(0, 3) || 'TRF')}</span>
        {isMultiPickup && !isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>🔀 MULTI-PKP</span>}
        {isMultiDropoff && !isMultiPickup && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>🔀 MULTI-DRP</span>}
        {isMultiPickup && isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' }}>🔀 MIXED</span>}
        {isSuggested    && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef9c3', color: '#92400e', border: '1px solid #fbbf24' }}>⭐ MATCH</span>}
        <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', background: sts.bg, color: sts.color, marginLeft: 'auto' }}>{t.status || 'PLANNED'}</span>
      </div>
      <div style={{ fontSize: '12px', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>{pickupLoc}</span>
        <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
        <span style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dropoffLoc}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <span style={{ fontSize: '11px', color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {paxNames.length > 0
            ? paxNames.slice(0, 4).map(fmtPax).join(' · ') + (paxNames.length > 4 ? ` +${paxNames.length - 4}` : '')
            : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>no pax assigned</span>}
        </span>
        <span style={{ fontSize: '11px', fontWeight: '800', color: paxColor, flexShrink: 0 }}>👥 {totalPax}{t.capacity ? `/${t.capacity}` : ''}</span>
      </div>
    </div>
  )
}
