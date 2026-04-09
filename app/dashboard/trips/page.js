'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { PageHeader } from '../../../components/ui/PageHeader'
import { TableHeader } from '../../../components/ui/TableHeader'
import { getProductionId } from '../../../lib/production'

const SIDEBAR_W = 440

// ─── Utility ────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}
function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}
function isoToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) }
function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtPax(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  const last  = parts[parts.length - 1]
  const first = parts[0]
  return `${last} ${first[0]}.`
}
function isHub(id) { return /^(APT_|STN_|PRT_)/.test(id || '') }
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }
function getClass(p, d) {
  if (isHub(p) && !isHub(d)) return 'ARRIVAL'
  if (!isHub(p) && isHub(d))  return 'DEPARTURE'
  return 'STANDARD'
}
function calcTimes({ date, arrTimeMin, durationMin, transferClass, callMin }) {
  if (!date || !durationMin) return null
  let call = null
  if (transferClass === 'ARRIVAL'   && arrTimeMin !== null) call = arrTimeMin
  else if (transferClass === 'DEPARTURE' && arrTimeMin !== null) call = ((arrTimeMin - 120) % 1440 + 1440) % 1440
  else call = callMin
  if (call === null) return null
  const pickup = transferClass === 'ARRIVAL' ? call : ((call - durationMin) % 1440 + 1440) % 1440
  const [y, mo, dd] = date.split('-').map(Number)
  const startMs = new Date(y, mo - 1, dd, Math.floor(pickup / 60), pickup % 60, 0, 0).getTime()
  return { callMin: call, pickupMin: pickup, startDt: new Date(startMs).toISOString(), endDt: new Date(startMs + durationMin * 60000).toISOString() }
}

// ─── Colori ──────────────────────────────────────────────────
const CLS = {
  ARRIVAL:   { bg: '#dcfce7', color: '#15803d', border: '#86efac', dot: '#16a34a' },
  DEPARTURE: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74', dot: '#ea580c' },
  STANDARD:  { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', dot: '#2563eb' },
}
const STS = {
  PLANNED:   { bg: '#f1f5f9', color: '#475569' },
  BUSY:      { bg: '#fefce8', color: '#a16207' },
  DONE:      { bg: '#f0fdf4', color: '#15803d' },
  CANCELLED: { bg: '#fef2f2', color: '#dc2626' },
}

// ─── Colonne tabella trips ────────────────────────────────────
const TRIP_COLS = [
  { key: 'time',      label: 'TIME',       width: '80px'  },
  { key: 'trip',      label: 'TRIP',       width: '130px' },
  { key: 'vehicle',   label: 'VEHICLE',    width: '180px' },
  { key: 'route',     label: 'ROUTE',      width: '210px' },
  { key: 'pax',       label: 'PASSENGERS', width: '220px' },
  { key: 'pax_count', label: 'PAX',        width: '70px'  },
]

// ─── Vehicle date-range check (available_from / available_to) ─
// A vehicle can be assigned from the day BEFORE its available_from date.
function isVehicleAvailableForDate(v, date) {
  if (!date || !v) return true
  if (v.available_from) {
    const dayBefore = isoAdd(v.available_from, -1)
    if (date < dayBefore) return false
  }
  if (v.available_to && date > v.available_to) return false
  return true
}

// ─── Vehicle availability check ───────────────────────────────
async function checkVehicleAvail(vehicleId, date, startDt, endDt, excludeRowIds) {
  const PRODUCTION_ID = getProductionId()
  if (!vehicleId || !startDt || !endDt || !PRODUCTION_ID) return null
  const excl = Array.isArray(excludeRowIds) ? excludeRowIds.filter(Boolean) : (excludeRowIds ? [excludeRowIds] : [])
  let q = supabase.from('trips')
    .select('id,trip_id,start_dt,end_dt')
    .eq('production_id', PRODUCTION_ID)
    .eq('vehicle_id', vehicleId)
    .eq('date', date)
    .not('start_dt', 'is', null)
  if (excl.length) q = q.not('id', 'in', `(${excl.join(',')})`)
  const { data } = await q
  if (!data) return null
  const s = new Date(startDt), e = new Date(endDt)
  const conflict = data.find(t => t.start_dt && t.end_dt && new Date(t.start_dt) < e && new Date(t.end_dt) > s)
  return conflict ? { available: false, conflictTripId: conflict.trip_id } : { available: true }
}

// ─── Trip row (info completa) ─────────────────────────────────
function TripRow({ group, locations, selected, onClick, isSuggested }) {
  const i18n = useT()
  const t   = group[0]
  const cls = CLS[t.transfer_class] || CLS.STANDARD
  const sts = STS[t.status] || STS.PLANNED

  // Multi-stop detection
  const pickupIds   = [...new Set(group.map(r => r.pickup_id).filter(Boolean))]
  const dropoffIds  = [...new Set(group.map(r => r.dropoff_id).filter(Boolean))]
  const isMultiPickup  = pickupIds.length > 1
  const isMultiDropoff = dropoffIds.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff

  const pickupLoc  = locations[t.pickup_id]  || t.pickup_id  || '–'
  const dropoffLoc = isMultiDropoff
    ? dropoffIds.map(id => (locations[id] || id || '').split(' ').slice(0, 2).join(' ')).join(' / ')
    : (locations[t.dropoff_id] || t.dropoff_id || '–')

  const callTime   = t.call_min   !== null ? minToHHMM(t.call_min)   : null
  const pickupTime = t.pickup_min !== null ? minToHHMM(t.pickup_min) : callTime
  const arrTime    = t.arr_time   ? t.arr_time.slice(0, 5)            : null
  // For multi-stop: show earliest pickup time
  const earliestPickupMin = isMixed
    ? Math.min(...group.map(r => r.pickup_min ?? r.call_min ?? 9999).filter(n => n < 9999))
    : null

  const mainTime   = isMixed
    ? (earliestPickupMin < 9999 ? minToHHMM(earliestPickupMin) : callTime || '–')
    : (callTime || pickupTime || '–')

  // Passeggeri dal campo denormalizzato — per multi-stop: unione da tutti i leg
  const paxNames = isMixed
    ? group.flatMap(r => r.passenger_list ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
    : (t.passenger_list ? t.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : [])
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
      {/* ── Orari ── */}
      <div>
        <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, letterSpacing: '-0.5px' }}>
          {mainTime}
        </div>
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
          // Orario arrivo al dropoff comune (hub per DEP, set/location per STD)
          // 1. call_min (priorità) — già calcolato e salvato nel DB
          // 2. Fallback chain: max(leg.pickup_min + leg.duration_min) — ultimo leg della catena
          const chainArr = group.reduce((max, leg) => {
            if (leg.pickup_min != null && leg.duration_min) {
              const v = (leg.pickup_min + leg.duration_min) % 1440
              return max === null || v > max ? v : max
            }
            return max
          }, null)
          const arrMin = (t.call_min != null ? t.call_min : chainArr)
          if (arrMin == null || arrMin === earliestPickupMin) return null
          return (
            <div style={{ fontSize: '10px', fontWeight: '700', color: cls.color, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              → {minToHHMM(arrMin)}
            </div>
          )
        })()}
      </div>

      {/* ── Trip ID + Classe + Status ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e3a5f', fontFamily: 'monospace', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {baseTripId(t.trip_id) || '–'}
        </div>
        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`, letterSpacing: '0.04em', alignSelf: 'flex-start' }}>
          {t.transfer_class?.slice(0, 3) || 'STD'}
        </span>
        {isMultiPickup  && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', alignSelf: 'flex-start' }}>🔀 MULTI-PKP</span>}
        {isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe', alignSelf: 'flex-start' }}>🔀 MULTI-DRP</span>}
        {isSuggested    && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef9c3', color: '#92400e', border: '1px solid #fbbf24', alignSelf: 'flex-start' }}>⭐ MATCH</span>}
        <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', background: sts.bg, color: sts.color, alignSelf: 'flex-start' }}>
          {t.status || 'PLANNED'}
        </span>
      </div>

      {/* ── Veicolo ── */}
      <div style={{ minWidth: 0 }}>
        {t.vehicle_id ? (
          <>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🚐 {t.vehicle_id}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
              {t.driver_name && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {t.driver_name}</div>}
              {(t.sign_code || t.capacity) && (
                <div>{[t.sign_code, t.capacity ? `×${t.capacity} seats` : null].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noVehicle}</span>
        )}
      </div>

      {/* ── Rotta ── */}
      <div style={{ minWidth: 0 }}>
        {isMixed ? (
          <>
            {group.map((r, ri) => (
              <div key={r.id || ri} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginBottom: ri < group.length - 1 ? '4px' : 0, minWidth: 0 }}>
              {(() => {
                // TIME FIRST — ARRIVAL multi-DRP: mostra orario DROPOFF stimato (pickup + duration)
                // IMPORTANTE: il pickup_min è lo STESSO per tutti i leg ARRIVAL (= arr_time)
                // → mostrare pickup sarebbe fuorviante (stessa ora per 3 hotel diversi)
                // → se duration_min è null, mostrare ⚠ no route (NON il pickup uguale per tutti)
                if (r.transfer_class === 'ARRIVAL') {
                  if (r.pickup_min != null && r.duration_min) {
                    const dropoffMin = (r.pickup_min + r.duration_min) % 1440
                    return <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: '800' }}>🏨{minToHHMM(dropoffMin)}</span>
                  }
                  // ARRIVAL senza duration_min → pickup uguale per tutti i leg → ⚠ no route
                  return <span style={{ color: '#ea580c', flexShrink: 0, fontSize: '9px', fontWeight: '800', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '3px', padding: '1px 4px' }}>⚠ no route</span>
                }
                // DEPARTURE multi-PKP e STANDARD: mostra orario PICKUP al hotel (diverso per ogni hotel)
                if (r.pickup_min != null) {
                  return <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: '800' }}>🕐{minToHHMM(r.pickup_min)}</span>
                }
                return <span style={{ color: '#ea580c', flexShrink: 0, fontSize: '9px', fontWeight: '800', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '3px', padding: '1px 4px' }}>⚠ no route</span>
              })()}
                <span style={{ color: '#94a3b8', fontWeight: '500', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75px' }}>
                  {(locations[r.pickup_id] || r.pickup_id || '–').split(' ').slice(0, 2).join(' ')}
                </span>
                <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
                <span style={{ fontWeight: '700', color: '#0f172a', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(locations[r.dropoff_id] || r.dropoff_id || '–').split(' ').slice(0, 2).join(' ')}
                </span>
                {r.pax_count  > 0   && <span style={{ color: '#64748b', flexShrink: 0 }}>· {r.pax_count}pax</span>}
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 }}>
              <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>
                {pickupLoc.split(' ').slice(0, 2).join(' ')}
              </span>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoffLoc}</span>
            </div>
            {t.flight_no && (
              <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: '700', marginTop: '2px' }}>
                ✈ {t.flight_no}{t.terminal ? ` · ${t.terminal}` : ''}
              </div>
            )}
            {t.notes && (
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📝 {t.notes}
              </div>
            )}
            {t.duration_min && (
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>⏱ {t.duration_min} min</div>
            )}
          </>
        )}
      </div>

      {/* ── Passenger names ── */}
      <div style={{ minWidth: 0 }}>
        {isMixed ? (
          // MULTI: una riga per leg, allineata alla rispettiva riga hotel nella colonna ROUTE
          group.map((r, ri) => {
            const legPax = r.passenger_list
              ? r.passenger_list.split(',').map(s => s.trim()).filter(Boolean)
              : []
            return (
              <div key={r.id || ri} style={{ fontSize: '10px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '16.5px', marginBottom: ri < group.length - 1 ? '4px' : 0 }}>
                {legPax.length > 0
                  ? legPax.map(fmtPax).join(' · ')
                  : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>
                }
              </div>
            )
          })
        ) : paxNames.length > 0 ? (
          <>
            <div style={{ fontSize: '10px', color: '#374151', lineHeight: 1.5 }}>
              {paxNames.map(fmtPax).join(' · ')}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic' }}>{i18n.noPaxAssigned}</div>
        )}
      </div>

      {/* ── Pax count ── */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: paxColor, lineHeight: 1.3 }}>
          👥 {isMixed ? group.reduce((s, r) => s + (r.pax_count || 0), 0) : (t.pax_count || 0)}{t.capacity ? `/${t.capacity}` : ''}
        </div>
        <div style={{ fontSize: '9px', color: paxColor, fontWeight: '700' }}>pax</div>
        {t.pax_conflict_flag && <div style={{ fontSize: '9px', color: '#dc2626', fontWeight: '800', marginTop: '2px' }}>⚠ conflict</div>}
      </div>

    </div>
  )
}

// ─── TripCardMobile (Timeline Card — mobile) ─────────────────
function TripCardMobile({ group, locations, selected, onClick, isSuggested }) {
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
    ? dropoffIds.map(id => (locations[id] || id || '').split(' ').slice(0, 2).join(' ')).join(' / ')
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
      {/* Row 1: orario + veicolo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px', lineHeight: 1 }}>{mainTime}</div>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', flexShrink: 0 }}>
          {t.vehicle_id ? `🚐 ${t.vehicle_id}` : <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontWeight: '400', fontSize: '11px' }}>no vehicle</span>}
        </div>
      </div>
      {/* Row 2: trip_id + class badge + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '900', color: '#1e3a5f' }}>{baseTripId(t.trip_id)}</span>
        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '9px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{t.transfer_class?.slice(0, 3) || 'STD'}</span>
        {isMultiPickup  && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>🔀 PKP</span>}
        {isMultiDropoff && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #d8b4fe' }}>🔀 DRP</span>}
        {isSuggested    && <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#fef9c3', color: '#92400e', border: '1px solid #fbbf24' }}>⭐ MATCH</span>}
        <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', background: sts.bg, color: sts.color, marginLeft: 'auto' }}>{t.status || 'PLANNED'}</span>
      </div>
      {/* Row 3: rotta pickup → dropoff */}
      <div style={{ fontSize: '12px', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>{pickupLoc.split(' ').slice(0, 2).join(' ')}</span>
        <span style={{ color: '#cbd5e1', flexShrink: 0 }}>→</span>
        <span style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dropoffLoc}</span>
      </div>
      {/* Row 4: passeggeri + contatore */}
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

// ─── CrewInfoModal ────────────────────────────────────────────
function CrewInfoModal({ crew, productionId, locations, onClose, overlayRight = 0 }) {
  const [details,   setDetails]   = useState(null)
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!crew?.id || !productionId) return
    setLoading(true)
    Promise.all([
      supabase.from('crew')
        .select(`
          id, full_name, role, department, phone, email,
          hotel_id, arrival_date, departure_date,
          hotel:hotel_id(id, name)
        `)
        .eq('id', crew.id)
        .single(),
      supabase.from('travel_movements')
        .select('travel_date, direction, travel_type, from_location, from_time, to_location, to_time, travel_number, needs_transport, pickup_dep, pickup_arr')
        .eq('crew_id', crew.id)
        .eq('production_id', productionId)
        .order('travel_date', { ascending: true }),
    ]).then(([crewRes, movRes]) => {
      setDetails(crewRes.data)
      setMovements(movRes.data || [])
      setLoading(false)
    })
  }, [crew?.id, productionId])

  const locsById  = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const hotelName = details?.hotel?.name || (details?.hotel_id ? (locsById[details.hotel_id] || details.hotel_id) : '–')
  if (!crew) return null

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, right: overlayRight, zIndex: 200, background: 'rgba(15,35,64,0.5)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, width: 'calc(100% - 40px)', maxWidth: '480px', background: 'white', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ background: '#0f2340', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'white' }}>{crew.full_name}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {[details?.role, details?.department].filter(Boolean).join(' · ') || crew.department || ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {details?.phone && (
                <div style={{ fontSize: '13px', color: '#0f172a' }}>📞 <a href={`tel:${details.phone}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{details.phone}</a></div>
              )}
              {details?.email && (
                <div style={{ fontSize: '13px', color: '#0f172a' }}>✉️ <a href={`mailto:${details.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{details.email}</a></div>
              )}
              {!details?.phone && !details?.email && (
                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No contact info</div>
              )}
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>🏨 <strong>{hotelName}</strong></div>
              {details?.arrival_date   && <div style={{ fontSize: '12px', color: '#64748b' }}>🏨 Check-in: <strong>{fmtDate(details.arrival_date)}</strong></div>}
              {details?.departure_date && <div style={{ fontSize: '12px', color: '#64748b' }}>🏁 Check-out: <strong>{fmtDate(details.departure_date)}</strong></div>}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>✈️ Travel Movements</div>
              {movements.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No travel movements found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {movements.map((m, i) => {
                    const travelTypeEmoji = m.travel_type === 'FLIGHT' ? '✈️' : m.travel_type === 'TRAIN' ? '🚂' : m.travel_type === 'GROUND' ? '🚐' : ''
                    const pickupBadges = [m.pickup_dep, m.pickup_arr].filter(v => v && ['OA','SELF','EMPIRE','BLACKLANE'].includes(v?.toUpperCase?.()))
                    return (
                      <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '8px 10px', fontSize: '12px' }}>
                        {/* Riga 1: data + direzione + tipo + numero */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '800', color: '#0f2340', fontVariantNumeric: 'tabular-nums' }}>
                            {m.travel_date ? fmtDate(m.travel_date) : '–'}
                          </span>
                          <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: m.direction === 'IN' ? '#dcfce7' : '#fff7ed', color: m.direction === 'IN' ? '#15803d' : '#c2410c', border: '1px solid ' + (m.direction === 'IN' ? '#86efac' : '#fdba74') }}>
                            {m.direction === 'IN' ? '↓ IN' : '↑ OUT'}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>
                            {travelTypeEmoji} {m.travel_type || 'OA'}
                          </span>
                          {m.travel_number && (
                            <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '11px' }}>{m.travel_number}</span>
                          )}
                        </div>
                        {/* Riga 2: from → to con orari */}
                        <div style={{ marginTop: '4px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748b' }}>{m.from_location || '–'}</span>
                          {m.from_time && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>({m.from_time.slice(0, 5)})</span>}
                          <span style={{ color: '#cbd5e1' }}>→</span>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{m.to_location || '–'}</span>
                          {m.to_time && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>({m.to_time.slice(0, 5)})</span>}
                        </div>
                        {/* Riga 3: badge needs_transport + pickup service */}
                        {(m.needs_transport || pickupBadges.length > 0) && (
                          <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {m.needs_transport && (
                              <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>🚐 transport</span>
                            )}
                            {pickupBadges.map((b, bi) => (
                              <span key={bi} style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>{b.toUpperCase()}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── TripSidebar (CREATE new trip) ────────────────────────────
function TripSidebar({ open, onClose, defaultDate, locations, vehicles, serviceTypes, onSaved, assignCtx, trips }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const isMobile = useIsMobile()
  const EMPTY = { trip_id: '', date: defaultDate, pickup_id: '', dropoff_id: '', vehicle_id: '', service_type_id: '', arr_time: '', call_time: '', pickup_time: '', flight_no: '', terminal: '', notes: '', duration_min: '' }
  const [form,           setForm]           = useState(EMPTY)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)
  const [durLoading,     setDurLoading]     = useState(false)
  const [crewList,       setCrewList]       = useState([])
  const [crewSearch,     setCrewSearch]     = useState('')
  const [selCrew,        setSelCrew]        = useState([])
  const [vCheck,         setVCheck]         = useState(null)
  const [selExistingTrip, setSelExistingTrip] = useState(null)
  const [addingToTrip,    setAddingToTrip]    = useState(false)
  const [addedToTrip,     setAddedToTrip]     = useState(null)
  const [sibDropoff,      setSibDropoff]      = useState('')
  const [crewLookupQ,       setCrewLookupQ]       = useState('')
  const [crewLookupResults, setCrewLookupResults] = useState([])
  const [crewInfoCrew,      setCrewInfoCrew]      = useState(null)

  // ── Multi-trip state ──────────────────────────────────────
  const [multiMode,         setMultiMode]         = useState(false)
  const [multiType,         setMultiType]         = useState('ARRIVAL')
  const [savedLegs,         setSavedLegs]         = useState([])
  const [editingLegLocalId, setEditingLegLocalId] = useState(null)
  const [multiSaving,       setMultiSaving]       = useState(false)

  const transferClass = getClass(form.pickup_id, form.dropoff_id)
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Reset on open
  useEffect(() => {
    if (!open) return
    const preForm = { ...EMPTY, date: defaultDate }
    if (assignCtx?.hotel) {
      if (assignCtx.ts === 'IN')       preForm.dropoff_id = assignCtx.hotel
      else if (assignCtx.ts === 'OUT') preForm.pickup_id  = assignCtx.hotel
      else                             preForm.pickup_id  = assignCtx.hotel
    }
    setForm(preForm)
    setError(null); setSelCrew([]); setCrewSearch(''); setVCheck(null)
    setSelExistingTrip(null); setAddedToTrip(null)
    setCrewLookupQ(''); setCrewLookupResults([]); setCrewInfoCrew(null)
    setMultiMode(false); setSavedLegs([]); setEditingLegLocalId(null)
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setForm(f => ({ ...f, trip_id: 'T' + String(num + 1).padStart(3, '0') }))
        })
    }
  }, [open, defaultDate])

  // Auto route duration
  useEffect(() => {
    if (!form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  // Vehicle availability check
  useEffect(() => {
    if (!form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, null).then(setVCheck)
  }, [form.vehicle_id, form.date, computed?.startDt, computed?.endDt])

  // Available crew (Captain rules)
  useEffect(() => {
    let cancelled = false
    setSelCrew([]); setCrewList([])
    if (!PRODUCTION_ID || !form.pickup_id || !form.dropoff_id) return () => { cancelled = true }
    let q = supabase.from('crew').select('id,full_name,department')
      .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED')
    if (transferClass === 'ARRIVAL')        q = q.eq('hotel_id', form.dropoff_id).eq('arrival_date', form.date)
    else if (transferClass === 'DEPARTURE') q = q.eq('hotel_id', form.pickup_id).eq('departure_date', form.date)
    else                                    q = q.or(`and(hotel_id.eq.${form.pickup_id},arrival_date.lte.${form.date},departure_date.gte.${form.date}),on_location.eq.true`)
    q.order('department').order('full_name').then(({ data }) => {
      if (cancelled) return
      if (data) {
        setCrewList(data)
        if (assignCtx?.id) {
          const match = data.find(c => c.id === assignCtx.id)
          if (match) setSelCrew(prev => prev.some(x => x.id === match.id) ? prev : [...prev, match])
        }
      }
    })
    return () => { cancelled = true }
  }, [form.pickup_id, form.dropoff_id, form.date, transferClass])

  // Crew Lookup (ricerca su tutto il crew della produzione, min 2 chars)
  useEffect(() => {
    if (crewLookupQ.length < 2 || !PRODUCTION_ID) { setCrewLookupResults([]); return }
    supabase.from('crew').select('id,full_name,department,role')
      .eq('production_id', PRODUCTION_ID)
      .or(`full_name.ilike.%${crewLookupQ}%,department.ilike.%${crewLookupQ}%`)
      .limit(8)
      .then(({ data }) => setCrewLookupResults(data || []))
  }, [crewLookupQ, PRODUCTION_ID])

  const selVehicle    = vehicles.find(v => v.id === form.vehicle_id)
  const suggestedCrew = (selVehicle && (selVehicle.preferred_dept || selVehicle.preferred_crew_ids?.length > 0))
    ? crewList.filter(c =>
        (selVehicle.preferred_crew_ids?.includes(c.id)) ||
        (selVehicle.preferred_dept && c.department === selVehicle.preferred_dept)
      )
    : []

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (!form.trip_id || !form.date || !form.pickup_id || !form.dropoff_id) {
      setError('Required: Trip ID, Date, Pickup, Dropoff'); return
    }
    setSaving(true)
    const row = {
      production_id: PRODUCTION_ID, trip_id: form.trip_id.trim(), date: form.date,
      pickup_id: form.pickup_id, dropoff_id: form.dropoff_id,
      vehicle_id: form.vehicle_id || null,
      driver_name: selVehicle?.driver_name || null,
      sign_code:   selVehicle?.sign_code   || null,
      capacity:    selVehicle?.capacity    || null,
      service_type_id: form.service_type_id || null,
      duration_min: durMin,
      arr_time:   form.arr_time ? form.arr_time + ':00' : null,
      call_min:   computed?.callMin   ?? null,
      pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : (computed?.pickupMin ?? null),
      start_dt:   (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin
        if (pm === null || pm === undefined) return computed?.startDt ?? null
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
      })(),
      end_dt:     (() => {
        const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : computed?.pickupMin
        if (pm === null || pm === undefined || !durMin) return computed?.endDt ?? null
        const [y, mo, dd] = form.date.split('-').map(Number)
        return new Date(new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).getTime() + durMin * 60000).toISOString()
      })(),
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: 'PLANNED', pax_count: 0,
    }
    const { data: ins, error: err } = await supabase.from('trips').insert(row).select('id').single()
    if (err) { setSaving(false); setError(err.message); return }
    if (selCrew.length > 0 && ins?.id) {
      await supabase.from('trip_passengers').insert(
        selCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
      )
    }
    setSaving(false); onSaved()
    setForm(f => ({ ...EMPTY, date: f.date }))
    setError(null); setSelCrew([]); setCrewSearch('')
    if (PRODUCTION_ID) {
      supabase.from('trips').select('trip_id').eq('production_id', PRODUCTION_ID).like('trip_id', 'T%')
        .order('trip_id', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const num = data?.trip_id ? parseInt(data.trip_id.replace(/\D/g, '')) || 0 : 0
          setForm(f => ({ ...f, trip_id: 'T' + String(num + 1).padStart(3, '0') }))
        })
    }
  }

  // ── Multi-trip helpers ─────────────────────────────────────
  const locsById = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const locShort = id => (locsById[id] || id || '–').split(' ').slice(0, 3).join(' ')

  function getLegTripId(idx) {
    const base = form.trip_id || 'T001'
    return idx === 0 ? base : base + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[idx - 1]
  }

  function handleAddLeg() {
    if (!form.pickup_id || !form.dropoff_id) { setError('Seleziona Pickup e Dropoff per questo leg'); return }
    const snap = {
      localId:       Date.now().toString(),
      form:          { ...form },
      selCrew:       [...selCrew],
      computed:      computed ? { ...computed } : null,
      transferClass: getClass(form.pickup_id, form.dropoff_id),
    }
    if (editingLegLocalId) {
      setSavedLegs(prev => prev.map(l => l.localId === editingLegLocalId ? { ...snap, localId: editingLegLocalId } : l))
      setEditingLegLocalId(null)
    } else {
      setSavedLegs(prev => [...prev, snap])
    }
    // Reset per-leg fields — sempre entrambi pickup e dropoff, così il form è
    // sempre vuoto dopo "+ Add Leg" e l'auto-include in handleMultiSubmit
    // si attiva solo se l'utente riempie esplicitamente entrambi i campi.
    // vehicle_id: forzato al primo leg per tutti i leg successivi (mezzo condiviso)
    const sharedVehicle = savedLegs.length > 0
      ? savedLegs[0].form.vehicle_id   // già salvato: prende dal leg 0
      : snap.form.vehicle_id           // questo era il primo leg: usa il suo veicolo
    setForm(f => ({
      ...f,
      pickup_id:    '',
      dropoff_id:   '',
      duration_min: '',
      vehicle_id:   sharedVehicle || f.vehicle_id,
    }))
    setSelCrew([]); setCrewSearch(''); setError(null)
  }

  function handleEditLeg(leg) {
    setForm({ ...leg.form })
    setSelCrew([...leg.selCrew])
    setEditingLegLocalId(leg.localId)
    setError(null)
  }

  function handleDeleteLeg(localId) {
    setSavedLegs(prev => prev.filter(l => l.localId !== localId))
    if (editingLegLocalId === localId) {
      setEditingLegLocalId(null)
      setForm(f => ({ ...f, pickup_id: '', dropoff_id: '', duration_min: '' }))
      setSelCrew([])
    }
  }

  async function handleMultiSubmit() {
    setError(null)
    const allLegs = [...savedLegs]
    // Auto-include del form corrente come ultima leg se pickup e dropoff sono entrambi compilati
    // (il form è sempre vuoto dopo "+ Add Leg", quindi questo scatta solo se l'utente ha
    // esplicitamente compilato i campi per un leg aggiuntivo senza cliccare "+ Add Leg")
    if (form.pickup_id && form.dropoff_id) {
      allLegs.push({
        localId:       '_current',
        form:          { ...form },
        selCrew:       [...selCrew],
        computed:      computed ? { ...computed } : null,
        transferClass: getClass(form.pickup_id, form.dropoff_id),
      })
    }
    if (allLegs.length < 2) { setError('Aggiungi almeno 2 leg: usa "+ Add Leg" o compila il form per l\'ultima leg'); return }
    if (!form.trip_id)      { setError('Trip ID base richiesto'); return }
    setMultiSaving(true)
    const insertedIds = []
    try {
      for (let i = 0; i < allLegs.length; i++) {
        const leg     = allLegs[i]
        const legForm = leg.form
        const legComp = leg.computed
        const legDurMin = parseInt(legForm.duration_min) || null
        const legVeh  = vehicles.find(v => v.id === legForm.vehicle_id)
        const row = {
          production_id:   PRODUCTION_ID,
          trip_id:         getLegTripId(i),
          date:            legForm.date,
          pickup_id:       legForm.pickup_id,
          dropoff_id:      legForm.dropoff_id,
          vehicle_id:      legForm.vehicle_id      || null,
          driver_name:     legVeh?.driver_name     || null,
          sign_code:       legVeh?.sign_code       || null,
          capacity:        legVeh?.capacity        || null,
          service_type_id: legForm.service_type_id || null,
          duration_min:    legDurMin,
          arr_time:        legForm.arr_time ? legForm.arr_time + ':00' : null,
          call_min:        legComp?.callMin   ?? null,
          pickup_min:      legComp?.pickupMin ?? null,
          start_dt:        legComp?.startDt   ?? null,
          end_dt:          legComp?.endDt     ?? null,
          flight_no:       legForm.flight_no || null,
          terminal:        legForm.terminal  || null,
          notes:           legForm.notes     || null,
          status:          'PLANNED',
          pax_count:       0,
        }
        const { data: ins, error: tripErr } = await supabase.from('trips').insert(row).select('id').single()
        if (tripErr || !ins?.id) throw new Error(tripErr?.message || `Errore inserimento leg ${i + 1}`)
        insertedIds.push(ins.id)
        if (leg.selCrew.length > 0) {
          await supabase.from('trip_passengers').insert(
            leg.selCrew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
          )
          await supabase.from('trips').update({
            pax_count:      leg.selCrew.length,
            passenger_list: leg.selCrew.map(c => c.full_name).join(', '),
          }).eq('id', ins.id)
        }
      }
      if (insertedIds.length >= 2) {
        await fetch('/api/routes/compute-chain', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ leg_ids: insertedIds, production_id: PRODUCTION_ID }),
        })
      }
      setMultiSaving(false); setSavedLegs([]); setEditingLegLocalId(null); setMultiMode(false)
      onSaved()
    } catch (e) {
      setMultiSaving(false); setError(e.message)
    }
  }

  // ── Existing trip assignment helpers (assignCtx only) ─────
  const correctClass = assignCtx?.ts === 'IN' ? 'ARRIVAL' : assignCtx?.ts === 'OUT' ? 'DEPARTURE' : 'STANDARD'
  // Tutti i trip con la transfer class corretta, ordinati per orario (include sibling per lookup interno)
  const allArrDepTrips = (trips || [])
    .filter(t => t.transfer_class === correctClass)
    .sort((a, b) => (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999))
  // Dedup: mostra solo UN'entry per gruppo multi-stop (leg principale, no sibling T001B/T001C)
  // L'utente vede solo "T001" nel dropdown — i sibling sono gestiti internamente
  // IMPORTANTE: dare priorità al trip il cui ID === base (senza suffisso lettera).
  // I sibling (T001B) potrebbero avere lo stesso pickup_min di T001 e arrivare prima
  // nell'array ordinato per tempo → senza questa regola T001B diventerebbe il rappresentante.
  // Dedup per dropdown: ordina prima i trip base (non-sibling, trip_id NON termina con lettera maiuscola)
  // così il trip base (T001) viene impostato per primo nel gruppo e i sibling (T001B, T001C) non
  // sovrascrivono mai il rappresentante. Solo se non esiste un trip base, usa il sibling come fallback.
  const arrDepTrips = (() => {
    const groups = {}
    // Prima i trip base (trip_id non termina con lettera), poi i sibling
    const sorted = [...allArrDepTrips].sort((a, b) => {
      const aIsSib = /[A-Z]$/.test(a.trip_id || '')
      const bIsSib = /[A-Z]$/.test(b.trip_id || '')
      if (aIsSib !== bIsSib) return aIsSib ? 1 : -1  // base trip prima del sibling
      return (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
    })
    for (const t of sorted) {
      const base = baseTripId(t.trip_id)
      if (!groups[base]) groups[base] = t  // il primo (base trip) vince sempre
    }
    return Object.values(groups).sort((a, b) =>
      (a.pickup_min ?? a.call_min ?? 9999) - (b.pickup_min ?? b.call_min ?? 9999)
    )
  })()
  // Controlla se un singolo leg è compatibile con l'hotel della nuova persona
  function isCompatibleTrip(t) {
    if (!assignCtx?.hotel) return false
    if (assignCtx.ts === 'IN')      return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
    if (assignCtx.ts === 'OUT')     return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
    if (assignCtx.ts === 'PRESENT') return t.transfer_class === 'STANDARD'  && t.pickup_id  === assignCtx.hotel
    return false
  }
  // Controlla se QUALSIASI leg del gruppo (principale + sibling) è già compatibile
  function isCompatibleGroup(mainTrip) {
    const base = baseTripId(mainTrip.trip_id)
    return allArrDepTrips.filter(t => baseTripId(t.trip_id) === base).some(leg => isCompatibleTrip(leg))
  }
  const compatibleTrips = arrDepTrips.filter(isCompatibleGroup)
  const otherTrips      = arrDepTrips.filter(t => !isCompatibleGroup(t))

  async function handleAddToExisting() {
    if (!selExistingTrip || !assignCtx?.id || !PRODUCTION_ID) return
    setAddingToTrip(true)

    // Trova tutti i leg del gruppo selezionato (T001 + eventuali T001B, T001C…)
    const groupBase = baseTripId(selExistingTrip.trip_id)
    const allGroupLegs = (trips || []).filter(t =>
      baseTripId(t.trip_id) === groupBase &&
      (t.vehicle_id || null) === (selExistingTrip.vehicle_id || null)
    )
    // Cerca se esiste già un leg compatibile con l'hotel della nuova persona
    const compatibleLeg = allGroupLegs.find(leg => isCompatibleTrip(leg)) || null

    // ── Debug BUG-4 ──────────────────────────────────────────────────────────
    console.log('[handleAddToExisting]', {
      assignCtx: { id: assignCtx?.id, hotel: assignCtx?.hotel, ts: assignCtx?.ts },
      allGroupLegs: allGroupLegs.map(l => ({ id: l.id, trip_id: l.trip_id, pickup_id: l.pickup_id, dropoff_id: l.dropoff_id })),
      compatibleLeg: compatibleLeg ? { id: compatibleLeg.id, trip_id: compatibleLeg.trip_id, pickup_id: compatibleLeg.pickup_id, dropoff_id: compatibleLeg.dropoff_id } : null,
      sibDropoff,
    })

    if (compatibleLeg) {
      // ── Leg compatibile trovato → aggiunge al leg corretto (T001 o sibling esistente T001B…) ──
      const { error } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: compatibleLeg.id, crew_id: assignCtx.id,
      })
      if (!error) {
        const prevList = compatibleLeg.passenger_list ? compatibleLeg.passenger_list.split(',').map(s => s.trim()).filter(Boolean) : []
        const newList  = [...prevList, assignCtx.name]
        await supabase.from('trips').update({
          pax_count:      newList.length,
          passenger_list: newList.join(', '),
        }).eq('id', compatibleLeg.id)
      }
      setAddingToTrip(false)
      if (!error) {
        // Ricalcola catena sequenziale se il gruppo è già MULTI (es. T001+T001B+nuova persona)
        if (allGroupLegs.length > 1) {
          try {
            await fetch('/api/routes/compute-chain', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ leg_ids: allGroupLegs.map(g => g.id), production_id: PRODUCTION_ID }),
            })
          } catch (e) { console.warn('[handleAddToExisting] chain recalc (compat):', e) }
        }
        setAddedToTrip(compatibleLeg.trip_id); onSaved()
      }
    } else {
      // ── Hotel diverso → crea sibling trip (MULTI-DRP, MULTI-PKP o MIXED) ──

      // Guard: hotel necessario per determinare pickup/dropoff del sibling
      if (!assignCtx.hotel) {
        setAddingToTrip(false)
        setError('Hotel mancante nel contesto assegnazione — impossibile creare leg sibling. Ricarica la pagina e riprova.')
        return
      }

      const base = baseTripId(selExistingTrip.trip_id)

      // Trova la prossima lettera disponibile (B, C, D…)
      const { data: siblings } = await supabase.from('trips')
        .select('trip_id')
        .eq('production_id', PRODUCTION_ID)
        .eq('date', selExistingTrip.date)
        .ilike('trip_id', `${base}%`)

      const usedLetters = new Set((siblings || []).map(t => {
        const suf = t.trip_id.slice(base.length)
        return suf.length === 1 && /^[A-Z]$/.test(suf) ? suf : null
      }).filter(Boolean))

      let nextLetter = 'B'
      for (const l of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (!usedLetters.has(l)) { nextLetter = l; break }
      }
      const newTripId = base + nextLetter

      // Calcola timing del sibling usando calcTimes (come per un trip normale)
      // Per DEPARTURE multi-PKP: cerca la rotta hotelSibling→hub per ottenere duration_min
      // Per ARRIVAL multi-DRP: cerca la rotta hub→hotelSibling
      // NOTA: sibRoute e sibDurationMin devono restare nello stesso scope di siblingRow
      //       per poter usare la duration corretta del sibling (non quella del trip principale)
      const sibPickupId  = selExistingTrip.transfer_class === 'ARRIVAL'  ? selExistingTrip.pickup_id : assignCtx.hotel
      const sibDropoffId = selExistingTrip.transfer_class === 'ARRIVAL'  ? assignCtx.hotel           : (sibDropoff || selExistingTrip.dropoff_id)
      const { data: sibRoute } = await supabase.from('routes')
        .select('duration_min')
        .eq('production_id', PRODUCTION_ID)
        .eq('from_id', sibPickupId)
        .eq('to_id', sibDropoffId)
        .maybeSingle()
      // duration_min specifica del sibling (Hotel B → Hub), diversa da quella del leg principale
      // Se non trovata in DB, chiama /api/routes/compute per ottenere la durata da Google Maps
      // Questo garantisce che ogni sibling abbia una durata accurata (evita orari duplicati
      // causati da route mancanti nella tabella che fanno cadere nel fallback call_min)
      let sibDurationMin = sibRoute?.duration_min || null
      if (!sibDurationMin && sibPickupId && sibDropoffId && PRODUCTION_ID) {
        try {
          const computeRes = await fetch('/api/routes/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_id: sibPickupId, to_id: sibDropoffId, production_id: PRODUCTION_ID }),
          })
          if (computeRes.ok) {
            const computeData = await computeRes.json()
            if (computeData.duration_min) sibDurationMin = computeData.duration_min
          }
        } catch (e) {
          console.warn('[handleAddToExisting] route compute fallback failed:', e)
        }
      }
      // Ultimo fallback: direzione inversa Hub→Hotel ≈ Hotel→Hub (stessa distanza)
      // Comune per ARRIVAL: in DB ci sono Hotel→Hub (da DEPARTURE trips) ma non Hub→Hotel
      if (!sibDurationMin && sibPickupId && sibDropoffId && PRODUCTION_ID) {
        const { data: revRoute } = await supabase.from('routes')
          .select('duration_min')
          .eq('production_id', PRODUCTION_ID)
          .eq('from_id', sibDropoffId)
          .eq('to_id', sibPickupId)
          .maybeSingle()
        if (revRoute?.duration_min) {
          sibDurationMin = revRoute.duration_min
          console.log('[handleAddToExisting] reverse direction fallback used:', sibDropoffId, '→', sibPickupId, '=', sibDurationMin, 'min')
        }
      }
      let sibCalc = null
      if (sibDurationMin) {
        sibCalc = calcTimes({
          date:          selExistingTrip.date,
          arrTimeMin:    selExistingTrip.arr_time ? timeStrToMin(selExistingTrip.arr_time.slice(0,5)) : null,
          durationMin:   sibDurationMin,
          transferClass: selExistingTrip.transfer_class,
          callMin:       selExistingTrip.call_min ?? null,
        })
      }

      // ── Fallback pickup_min quando sibCalc = null (rotta mancante o arr_time assente)
      // ARRIVAL:              driver già all'hub → pickup = call_min (indipendente dalla duration)
      // DEPARTURE / STANDARD: pickup = call - duration (il più lontano parte prima!)
      //                       se no duration → usa call_min come fallback conservativo
      const sibPickupMin = sibCalc?.pickupMin ?? (() => {
        const c = selExistingTrip.call_min ?? null
        if (selExistingTrip.transfer_class === 'ARRIVAL') return c
        // DEPARTURE / STANDARD: pickup = call - sibDuration
        if (c === null) return null
        return sibDurationMin
          ? ((c - sibDurationMin) % 1440 + 1440) % 1440
          : null  // no duration → null: mostra ⚠ no route invece di orario sbagliato
      })()

      // start_dt calcolabile da sibPickupMin per tutti i transfer class
      const sibStartDt = sibCalc?.startDt ?? (() => {
        if (sibPickupMin === null) return null
        const [sy, smo, sdd] = selExistingTrip.date.split('-').map(Number)
        return new Date(sy, smo - 1, sdd, Math.floor(sibPickupMin / 60), sibPickupMin % 60, 0, 0).toISOString()
      })()

      // Sibling row: pickup/dropoff dipende da ARRIVAL vs DEPARTURE
      const siblingRow = {
        production_id: PRODUCTION_ID,
        trip_id:        newTripId,
        date:           selExistingTrip.date,
        // transfer_class is a GENERATED column — computed automatically from pickup_id/dropoff_id
        // ARRIVAL  → MULTI-DRP: stesso pickup (hub), dropoff = hotel del crew
        // DEPARTURE → MULTI-PKP: pickup = hotel del crew, stesso dropoff (hub)
        pickup_id:  selExistingTrip.transfer_class === 'ARRIVAL'
          ? selExistingTrip.pickup_id
          : assignCtx.hotel,
        dropoff_id: selExistingTrip.transfer_class === 'ARRIVAL'
          ? assignCtx.hotel
          : (sibDropoff || selExistingTrip.dropoff_id),
        vehicle_id:      selExistingTrip.vehicle_id      || null,
        driver_name:     selExistingTrip.driver_name     || null,
        sign_code:       selExistingTrip.sign_code       || null,
        capacity:        selExistingTrip.capacity        || null,
        service_type_id: selExistingTrip.service_type_id || null,
        call_min:        sibCalc?.callMin   ?? selExistingTrip.call_min   ?? null,
        pickup_min:      sibPickupMin,       // ← fix: ARRIVAL usa call_min anche senza duration
        arr_time:        selExistingTrip.arr_time        || null,
        flight_no:       selExistingTrip.flight_no       || null,
        terminal:        selExistingTrip.terminal        || null,
        notes:           selExistingTrip.notes           || null,
        duration_min:    sibDurationMin                  || null,  // ✓ usa la duration del sibling, non del leg principale
        start_dt:        sibStartDt,         // ← fix: calcolato da sibPickupMin anche senza duration
        end_dt:          sibCalc?.endDt     ?? null,
        status:          selExistingTrip.status          || 'PLANNED',
        pax_count: 0,
      }

      const { data: newRow, error: tripErr } = await supabase.from('trips').insert(siblingRow).select('id').single()
      if (tripErr || !newRow?.id) { setAddingToTrip(false); setError(tripErr?.message || t.errorSiblingTrip); return }

      const { error: paxErr } = await supabase.from('trip_passengers').insert({
        production_id: PRODUCTION_ID, trip_row_id: newRow.id, crew_id: assignCtx.id,
      })
      if (!paxErr) {
        // Update denormalized fields on the sibling trip row
        await supabase.from('trips').update({
          pax_count: 1,
          passenger_list: assignCtx.name,
        }).eq('id', newRow.id)
      }
      setAddingToTrip(false)
      if (paxErr) { setError(paxErr.message) }
      else {
        // Ricalcola catena sequenziale per il gruppo appena diventato MULTI
        // (include il nuovo sibling appena creato)
        try {
          await fetch('/api/routes/compute-chain', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              leg_ids:       [...allGroupLegs.map(g => g.id), newRow.id],
              production_id: PRODUCTION_ID,
            }),
          })
        } catch (e) { console.warn('[handleAddToExisting] chain recalc (sibling):', e) }
        setAddedToTrip(newTripId); onSaved()
      }
    }
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${isMobile ? '100vw' : SIDEBAR_W + 'px'})`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f2340', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
              {multiMode ? `🔀 Multi-trip` : t.newTrip}
            </div>
            {assignCtx && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#fbbf24', fontWeight: '700', marginTop: '2px' }}>
                <span>👤 {assignCtx.name}</span>
                <button type="button" onClick={() => setCrewInfoCrew({ id: assignCtx.id, full_name: assignCtx.name })} style={{ background: 'none', border: '1px solid rgba(251,191,36,0.5)', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', fontSize: '9px', color: '#fbbf24', fontWeight: '800', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
              </div>
            )}
            {multiMode && savedLegs.length > 0 && (
              <div style={{ fontSize: '11px', color: '#86efac', fontWeight: '700', marginTop: '2px' }}>
                {savedLegs.length} leg{savedLegs.length > 1 ? 's' : ''} salvati · {form.trip_id}–{getLegTripId(savedLegs.length - 1)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setMultiMode(m => !m); setSavedLegs([]); setEditingLegLocalId(null) }}
              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '800', background: multiMode ? '#f59e0b' : 'rgba(255,255,255,0.15)', color: multiMode ? '#0f2340' : 'white', letterSpacing: '0.04em' }}>
              🔀 MULTI
            </button>
            {(!multiMode && form.pickup_id && form.dropoff_id) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass}</span>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* ── Crew Lookup ── */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>🔍 Crew Lookup</div>
              <input type="text" placeholder="Search by name or department…" value={crewLookupQ} onChange={e => setCrewLookupQ(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              {crewLookupResults.length > 0 && (
                <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: 'white' }}>
                  {crewLookupResults.map(c => (
                    <div key={c.id} onClick={() => setCrewInfoCrew(c)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: 'white' }} onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>ℹ️</span>
                    </div>
                  ))}
                </div>
              )}
              {crewLookupQ.length >= 2 && crewLookupResults.length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '6px 0 2px', fontStyle: 'italic' }}>No results</div>}
            </div>

            {/* ── Multi-trip: type selector + saved legs ── */}
            {multiMode && (
              <>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {(['ARRIVAL', 'DEPARTURE', 'STANDARD']).map(tp => {
                    const c = CLS[tp]
                    return (
                      <button key={tp} type="button" onClick={() => setMultiType(tp)}
                        style={{ flex: 1, padding: '7px 4px', borderRadius: '8px', border: `2px solid ${multiType === tp ? c.border : '#e2e8f0'}`, background: multiType === tp ? c.bg : 'white', color: multiType === tp ? c.color : '#94a3b8', fontSize: '10px', fontWeight: '800', cursor: 'pointer', letterSpacing: '0.04em' }}>
                        {tp === 'ARRIVAL' ? '🛬 ARR' : tp === 'DEPARTURE' ? '🛫 DEP' : '🔀 STD'}
                      </button>
                    )
                  })}
                </div>

                {savedLegs.length > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>
                      ✅ Legs configurati ({savedLegs.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {savedLegs.map((leg, idx) => {
                        const legTripId = getLegTripId(idx)
                        const isEditing = editingLegLocalId === leg.localId
                        const legCls    = CLS[leg.transferClass] || CLS.STANDARD
                        return (
                          <div key={leg.localId} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '8px', border: `1px solid ${isEditing ? '#2563eb' : legCls.border}`, background: isEditing ? '#eff6ff' : 'white' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: '800', color: '#0f2340', fontFamily: 'monospace' }}>{legTripId}</div>
                              <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {locShort(leg.form.pickup_id)} → {locShort(leg.form.dropoff_id)}
                                {leg.selCrew.length > 0 && <span style={{ color: '#2563eb', fontWeight: '700' }}> · {leg.selCrew.length} pax</span>}
                              </div>
                            </div>
                            <button type="button" onClick={() => handleEditLeg(leg)}
                              style={{ background: isEditing ? '#2563eb' : '#f1f5f9', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '10px', color: isEditing ? 'white' : '#374151', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>
                              ✏️
                            </button>
                            <button type="button" onClick={() => handleDeleteLeg(leg.localId)}
                              style={{ background: '#fef2f2', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '10px', color: '#dc2626', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>
                              🗑
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {multiType === 'ARRIVAL' && (
                  <div style={{ fontSize: '10px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>ARRIVAL</strong>: Pickup hub mantenuto tra i leg · scegli Dropoff diverso ogni volta
                  </div>
                )}
                {multiType === 'DEPARTURE' && (
                  <div style={{ fontSize: '10px', color: '#c2410c', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>DEPARTURE</strong>: Dropoff hub mantenuto tra i leg · scegli Pickup diverso ogni volta
                  </div>
                )}
                {multiType === 'STANDARD' && (
                  <div style={{ fontSize: '10px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '7px', padding: '6px 10px' }}>
                    💡 <strong>STANDARD</strong>: Pickup e Dropoff liberi per ogni leg (MIXED)
                  </div>
                )}
              </>
            )}

            {/* ── Add to existing trip (solo se assignCtx attivo) ── */}
            {assignCtx && arrDepTrips.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {t.addToExistingTrip}
                </div>
                <select
                  value={selExistingTrip?.id || ''}
                  onChange={e => {
                    const t = arrDepTrips.find(x => x.id === e.target.value) || null
                    setSelExistingTrip(t); setAddedToTrip(null); setSibDropoff(t?.dropoff_id || '')
                    // Pre-popola l'hub nel form per il trip sibling (campo che rimane vuoto)
                    if (t && !isCompatibleTrip(t)) {
                      if (t.transfer_class === 'ARRIVAL')   set('pickup_id',  t.pickup_id)
                      else                                   set('dropoff_id', t.dropoff_id)
                    }
                  }}
                  style={{ ...inp, fontSize: '12px', marginBottom: selExistingTrip ? '8px' : 0 }}
                >
                  <option value="">Select existing trip…</option>
                  {compatibleTrips.length > 0 && (
                    <optgroup label={t.compatible}>
                      {compatibleTrips.map(t => (
                        <option key={t.id} value={t.id}>
                          {baseTripId(t.trip_id)} · {minToHHMM(t.pickup_min ?? t.call_min)} · {locShort(t.pickup_id)} → {locShort(t.dropoff_id)}{t.vehicle_id ? ` · 🚐${t.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherTrips.length > 0 && (
                    <optgroup label={t.otherMultiStop}>
                      {otherTrips.map(t => (
                        <option key={t.id} value={t.id}>
                          {baseTripId(t.trip_id)} · {minToHHMM(t.pickup_min ?? t.call_min)} · {locShort(t.pickup_id)} → {locShort(t.dropoff_id)}{t.vehicle_id ? ` · 🚐${t.vehicle_id}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {selExistingTrip && (
                  <>
                    <div style={{ fontSize: '11px', color: '#374151', background: 'white', border: '1px solid #fde68a', borderRadius: '7px', padding: '7px 10px', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '800' }}>{selExistingTrip.trip_id} · {minToHHMM(selExistingTrip.pickup_min ?? selExistingTrip.call_min)}</div>
                      <div>{locShort(selExistingTrip.pickup_id)} → {locShort(selExistingTrip.dropoff_id)}</div>
                      {selExistingTrip.vehicle_id && <div>🚐 {selExistingTrip.vehicle_id}</div>}
                      {!isCompatibleGroup(selExistingTrip) && (
                        <div style={{ color: '#a16207', fontWeight: '700', marginTop: '3px' }}>{t.differentRoute}</div>
                      )}
                      {isCompatibleGroup(selExistingTrip) && (() => {
                        const base = baseTripId(selExistingTrip.trip_id)
                        const targetLeg = allArrDepTrips.filter(t => baseTripId(t.trip_id) === base).find(leg => isCompatibleTrip(leg))
                        if (targetLeg && targetLeg.id !== selExistingTrip.id) {
                          return <div style={{ color: '#15803d', fontWeight: '700', marginTop: '3px' }}>→ leg {targetLeg.trip_id} · {locShort(assignCtx.ts === 'IN' ? targetLeg.dropoff_id : targetLeg.pickup_id)}</div>
                        }
                        return null
                      })()}
                    </div>
                        {/* ── MIXED: selettore destinazione sibling per STANDARD con hotel diverso ── */}
                        {selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && (
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                              🎯 Destination for {assignCtx.name.split(' ')[0]}
                            </label>
                            <select
                              value={sibDropoff}
                              onChange={e => setSibDropoff(e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', border: `1px solid ${sibDropoff ? '#fde68a' : '#fca5a5'}`, borderRadius: '8px', fontSize: '12px', background: 'white', boxSizing: 'border-box' }}
                            >
                              <option value="">Select destination…</option>
                              <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                              <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                            </select>
                            {sibDropoff && sibDropoff !== selExistingTrip.dropoff_id && (
                              <div style={{ fontSize: '10px', color: '#6d28d9', fontWeight: '700', marginTop: '3px', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '5px', padding: '3px 7px' }}>
                                🔀 MIXED: {locShort(assignCtx.hotel)} → {locShort(sibDropoff)}
                              </div>
                            )}
                          </div>
                        )}
                        {addedToTrip ? (
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
                            ✅ {assignCtx.name.split(' ')[0]} aggiunto a {addedToTrip}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)}
                            onClick={handleAddToExisting}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: 'none', background: (addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)) ? '#94a3b8' : '#f59e0b', color: 'white', fontSize: '13px', fontWeight: '800', cursor: (addingToTrip || (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)) ? 'default' : 'pointer' }}>
                            {addingToTrip
                              ? 'Adding…'
                              : (selExistingTrip.transfer_class === 'STANDARD' && !isCompatibleGroup(selExistingTrip) && !sibDropoff)
                                ? 'Select destination first ↑'
                                : `✓ Add ${assignCtx.name.split(' ')[0]} to ${selExistingTrip.trip_id}`}
                          </button>
                        )}
                  </>
                )}

                <div style={{ fontSize: '10px', color: '#92400e', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #fde68a', fontWeight: '700' }}>
                  {t.orCreateBelow}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Trip ID</label>
                <input value={form.trip_id} onChange={e => set('trip_id', e.target.value)} style={{ ...inp, fontWeight: '800', fontSize: '15px' }} placeholder="T001" required />
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} required />
              </div>
            </div>

            <div>
              <label style={lbl}>Pickup</label>
              <select value={form.pickup_id} onChange={e => {
                set('pickup_id', e.target.value)
                if (activeLeg?.isNew) setExtraLegs(prev => prev.map(l => l.id === activeLeg.id ? { ...l, pickup_id: e.target.value } : l))
              }} style={inp} required>
                <option value="">Select pickup…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => set('dropoff_id', e.target.value)} style={inp} required>
                <option value="">Select dropoff…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>

            {/* Vehicle + check */}
            <div>
              <label style={lbl}>Vehicle</label>
              {/* In multi-mode con almeno 1 leg salvato: mezzo bloccato (condiviso tra tutti i leg) */}
              {multiMode && savedLegs.length > 0 ? (
                <div style={{ padding: '8px 12px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803d', flex: 1 }}>
                    🚐 {selVehicle ? `${selVehicle.id} — ${selVehicle.driver_name} (${selVehicle.sign_code}) ×${selVehicle.capacity}` : 'No vehicle'}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', background: '#bbf7d0', padding: '2px 7px', borderRadius: '999px', flexShrink: 0 }}>🔒 shared</span>
                </div>
              ) : (
                <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                  <option value="">No vehicle</option>
                  {vehicles.map(v => {
                    const avail   = isVehicleAvailableForDate(v, form.date)
                    const hasPref = v.preferred_dept || v.preferred_crew_ids?.length > 0
                    return (
                      <option key={v.id} value={v.id}>
                        {avail ? '' : '⚠ '}{v.id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{hasPref ? ` · ⭐ ${[v.preferred_dept, v.preferred_crew_ids?.length > 0 ? `${v.preferred_crew_ids.length}p` : null].filter(Boolean).join(' ')}` : ''}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
                      </option>
                    )
                  })}
                </select>
              )}
              {form.vehicle_id && vCheck && (
                <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700', color: vCheck.available ? '#15803d' : '#dc2626' }}>
                  {vCheck.available ? '✅ Vehicle available' : `⚠ Busy on ${vCheck.conflictTripId}`}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>{transferClass === 'ARRIVAL' ? 'Arrival Time' : transferClass === 'DEPARTURE' ? 'Departure Time' : 'Call Time'}</label>
                <input type="time"
                  value={transferClass !== 'STANDARD' ? form.arr_time : form.call_time}
                  onChange={e => transferClass !== 'STANDARD' ? set('arr_time', e.target.value) : set('call_time', e.target.value)}
                  style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
              </div>
              <div>
                <label style={lbl}>Duration (min) {durLoading && '…'}</label>
                <input type="number" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} style={{ ...inp, fontVariantNumeric: 'tabular-nums' }} placeholder="auto" min="1" max="240" />
              </div>
            </div>
            <div>
              <label style={lbl}>Pickup Time <span style={{ fontWeight: '400', color: '#cbd5e1' }}>(override — optional)</span></label>
              <input type="time"
                value={form.pickup_time}
                onChange={e => set('pickup_time', e.target.value)}
                style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderColor: form.pickup_time ? '#f59e0b' : '#e2e8f0', background: form.pickup_time ? '#fffbeb' : 'white' }} />
              {form.pickup_time && (
                <div style={{ fontSize: '10px', color: '#92400e', fontWeight: '700', marginTop: '3px' }}>
                  ⚡ Pickup time overridden — automatic calculation ignored
                  <button type="button" onClick={() => set('pickup_time', '')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: '800' }}>✕ clear</button>
                </div>
              )}
            </div>

            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {[
                  { l: 'CALL',   v: minToHHMM(computed.callMin) },
                  { l: 'PICKUP', v: minToHHMM(computed.pickupMin) },
                  { l: 'START',  v: new Date(computed.startDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) },
                  { l: 'END',    v: new Date(computed.endDt).toLocaleTimeString('it-IT',  { hour: '2-digit', minute: '2-digit' }) },
                ].map(({ l, v }) => (
                  <div key={l} style={{ textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.07em' }}>{l}</div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Flight / Train</label>
                <input value={form.flight_no} onChange={e => set('flight_no', e.target.value)} style={inp} placeholder="AZ 4568" />
              </div>
              <div>
                <label style={lbl}>Terminal</label>
                <input value={form.terminal} onChange={e => set('terminal', e.target.value)} style={inp} placeholder="T1, T2, Arrivi Nord…" />
              </div>
            </div>
            <div>
              <label style={lbl}>Service Type</label>
              <select value={form.service_type_id} onChange={e => set('service_type_id', e.target.value)} style={inp}>
                <option value="">None</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inp} />
            </div>

            {/* Passengers */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>PASSENGERS {selCrew.length > 0 && `· ${selCrew.length} selected`}</span>
                {crewList.length > 0 && (
                  <button type="button" onClick={() => setSelCrew(crewList)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '10px', fontWeight: '700' }}>
                    Add all ({crewList.length})
                  </button>
                )}
              </div>
              {selCrew.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                  {selCrew.map(c => (
                    <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>
                      {c.full_name.split(' ')[0]} {c.full_name.split(' ').slice(-1)[0]}
                      <button type="button" onClick={() => setSelCrew(p => p.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '11px', padding: 0, lineHeight: 1, marginLeft: '1px' }}>×</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setSelCrew([])} style={{ background: 'none', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: '700' }}>Clear</button>
                </div>
              )}
              {form.pickup_id && form.dropoff_id ? (
                <>
                  {suggestedCrew.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '6px' }}>
                        📌 Suggeriti per {selVehicle.id}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {suggestedCrew.map(c => {
                          const alreadySel = selCrew.some(x => x.id === c.id)
                          return (
                            <div key={c.id}
                              onClick={() => !alreadySel && setSelCrew(p => [...p, c])}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: alreadySel ? '#eff6ff' : 'white', border: `1px solid ${alreadySel ? '#bfdbfe' : '#fde68a'}`, borderRadius: '6px', cursor: alreadySel ? 'default' : 'pointer' }}
                              onMouseEnter={e => { if (!alreadySel) e.currentTarget.style.background = '#fef9c3' }}
                              onMouseLeave={e => { if (!alreadySel) e.currentTarget.style.background = alreadySel ? '#eff6ff' : 'white' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: alreadySel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                              </div>
                              {alreadySel
                                ? <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: '800', flexShrink: 0 }}>✓</span>
                                : <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '700', flexShrink: 0 }}>+</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <input type="text" placeholder="Search…" value={crewSearch} onChange={e => setCrewSearch(e.target.value)} style={{ ...inp, marginBottom: '6px', padding: '6px 10px', fontSize: '12px' }} />
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    {crewList.length === 0 ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        {t.noCrewStatus} ({transferClass === 'ARRIVAL' ? 'IN' : transferClass === 'DEPARTURE' ? 'OUT' : 'PRESENT'})
                      </div>
                    ) : crewList.filter(c => !crewSearch || c.full_name.toLowerCase().includes(crewSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(crewSearch.toLowerCase())).map(c => {
                      const sel = selCrew.some(x => x.id === c.id)
                      return (
                        <div key={c.id} onClick={() => setSelCrew(p => sel ? p.filter(x => x.id !== c.id) : [...p, c])}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`, background: sel ? '#2563eb' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <span style={{ color: 'white', fontSize: '9px', fontWeight: '900' }}>✓</span>}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: sel ? '700' : '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', padding: '4px 6px', background: cls.bg, borderRadius: '5px', border: `1px solid ${cls.border}` }}>
                    {transferClass === 'ARRIVAL'   && `ARRIVAL: hotel=${form.dropoff_id} · arrival_date=date`}
                    {transferClass === 'DEPARTURE' && `DEPARTURE: hotel=${form.pickup_id} · departure_date=date`}
                    {transferClass === 'STANDARD'  && `STANDARD: hotel=${form.pickup_id} · arrival<=date<=departure`}
                  </div>
                </>
              ) : (
                <div style={{ padding: '10px', textAlign: 'center', color: '#cbd5e1', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                  {t.selectPickupFirst}
                </div>
              )}
            </div>
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, position: 'sticky', bottom: 0, background: 'white' }}>
            {multiMode ? (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
                  <button type="button" onClick={handleAddLeg}
                    style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: (form.pickup_id && form.dropoff_id) ? (editingLegLocalId ? '#2563eb' : '#6366f1') : '#94a3b8', color: 'white', fontSize: '12px', cursor: (form.pickup_id && form.dropoff_id) ? 'pointer' : 'default', fontWeight: '800' }}>
                    {editingLegLocalId ? '✏️ Aggiorna Leg' : `+ Add Leg (${getLegTripId(savedLegs.length)})`}
                  </button>
                </div>
                {(() => {
                  const totalLegs = savedLegs.length + (form.pickup_id && form.dropoff_id ? 1 : 0)
                  const canSave   = totalLegs >= 2 && !multiSaving
                  return (
                    <button type="button" onClick={handleMultiSubmit} disabled={!canSave}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: canSave ? '#15803d' : '#94a3b8', color: 'white', fontSize: '13px', cursor: canSave ? 'pointer' : 'default', fontWeight: '800' }}>
                      {multiSaving ? '⏳ Creazione in corso…' : `💾 Salva Multi-trip (${totalLegs} leg${totalLegs !== 1 ? 's' : ''})`}
                    </button>
                  )
                })()}
              </>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#0f2340', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
                  {saving ? t.saving : t.saveTrip}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
      {crewInfoCrew && (
        <CrewInfoModal crew={crewInfoCrew} productionId={PRODUCTION_ID} locations={locations} onClose={() => setCrewInfoCrew(null)} overlayRight={SIDEBAR_W} />
      )}
    </>
  )
}

// ─── EditTripSidebar (EDIT + PAX management) ──────────────────
function EditTripSidebar({ open, initial, group, locations, vehicles, serviceTypes, onClose, onSaved, onPaxChanged }) {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const isMobile = useIsMobile()
  const EDIT_EMPTY = {
    date: '', pickup_id: '', dropoff_id: '', vehicle_id: '',
    service_type_id: '', arr_time: '', call_time: '', pickup_time: '',
    duration_min: '', flight_no: '', terminal: '', notes: '', status: 'PLANNED',
  }
  const [form,       setForm]       = useState(EDIT_EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error,      setError]      = useState(null)
  const [durLoading, setDurLoading] = useState(false)

  // Pax state
  const [assignedPax,   setAssignedPax]   = useState([])
  const [availableCrew, setAvailableCrew] = useState([])
  const [busyMap,       setBusyMap]       = useState({})   // crewId → conflicting trip_id
  const [paxLoading,    setPaxLoading]    = useState(false)
  const [paxSearch,     setPaxSearch]     = useState('')

  // Vehicle check
  const [vCheck, setVCheck] = useState(null)

  // Extra legs (UI-only, no save logic)
  const [extraLegs, setExtraLegs] = useState([])
  const [toDelete,  setToDelete]  = useState([])   // DB row IDs of existing legs removed with ✕
  const [activeLeg, setActiveLeg] = useState(null)

  // Crew Lookup
  const [crewLookupQ,       setCrewLookupQ]       = useState('')
  const [crewLookupResults, setCrewLookupResults] = useState([])
  const [crewInfoCrew,      setCrewInfoCrew]      = useState(null)

  // Race-condition guard per loadPaxData
  const loadPaxReqRef = useRef(0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Initialize form when opening a new trip row
  useEffect(() => {
    if (!open || !initial) {
      setAssignedPax([]); setAvailableCrew([]); setBusyMap({})
      return
    }
    setError(null); setConfirmDel(false); setPaxSearch(''); setVCheck(null)
    setCrewLookupQ(''); setCrewLookupResults([]); setCrewInfoCrew(null)
    setExtraLegs([]); setToDelete([])

    const leg = group?.[0] ?? initial
    setActiveLeg(leg)

    const arrStr  = leg.arr_time ? leg.arr_time.slice(0, 5) : ''
    const callStr = (leg.transfer_class === 'STANDARD' && leg.call_min !== null)
      ? minToHHMM(leg.call_min) : ''

    setForm({
      date:            leg.date || isoToday(),
      pickup_id:       leg.pickup_id  || '',
      dropoff_id:      leg.dropoff_id || '',
      vehicle_id:      leg.vehicle_id || '',
      service_type_id: leg.service_type_id || '',
      arr_time:        arrStr,
      call_time:       callStr,
      duration_min:    leg.duration_min ? String(leg.duration_min) : '',
      flight_no:       leg.flight_no || '',
      terminal:        leg.terminal  || '',
      notes:           leg.notes     || '',
      status:          leg.status    || 'PLANNED',
    })

    loadPaxData(leg)

    // NOTE: NON caricare i sibling esistenti in extraLegs — sono già in `group` (prop dal parent).
    // Caricarli causerebbe: (1) tab duplicate nel leg selector, (2) doppia attivazione al click,
    // (3) trip creato con lettera sbagliata in handleSubmit (suffixes[i] parte da 'B' ignorando group).
    // extraLegs contiene SOLO i nuovi leg aggiunti via "+ Add Leg" (non ancora salvati in DB).
  }, [open, initial?.id])

  // Reload pax when group grows OR when active leg switches
  useEffect(() => {
    if (!open || !initial) return
    loadPaxData(activeLeg ?? initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.length, activeLeg?.id,
    activeLeg?.isNew ? (extraLegs.find(l => l.id === activeLeg?.id)?.pickup_id ?? '') : null,
    activeLeg?.isNew ? (extraLegs.find(l => l.id === activeLeg?.id)?.dropoff_id ?? '') : null,
  ])

  // Repopulate form when user switches leg tab (activeLeg changes after initial open)
  useEffect(() => {
    if (!open || !activeLeg) return
    // Per leg nuovi: resetta solo pickup/dropoff, mantieni tutto il resto dal form corrente
    if (activeLeg.isNew) {
      setForm(f => ({ ...f, pickup_id: '', dropoff_id: '' }))
      return
    }
    const arrStr  = activeLeg.arr_time ? activeLeg.arr_time.slice(0, 5) : ''
    const callStr = (activeLeg.transfer_class === 'STANDARD' && activeLeg.call_min !== null)
      ? minToHHMM(activeLeg.call_min) : ''
    setForm({
      date:            activeLeg.date || isoToday(),
      pickup_id:       activeLeg.pickup_id  || '',
      dropoff_id:      activeLeg.dropoff_id || '',
      vehicle_id:      activeLeg.vehicle_id || '',
      service_type_id: activeLeg.service_type_id || '',
      arr_time:        arrStr,
      call_time:       callStr,
      duration_min:    activeLeg.duration_min ? String(activeLeg.duration_min) : '',
      flight_no:       activeLeg.flight_no || '',
      terminal:        activeLeg.terminal  || '',
      notes:           activeLeg.notes     || '',
      status:          activeLeg.status    || 'PLANNED',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeg?.id])

  // Auto route duration when pickup/dropoff change FROM initial values
  useEffect(() => {
    if (!open || !form.pickup_id || !form.dropoff_id || !PRODUCTION_ID) return
    if (form.pickup_id === initial?.pickup_id && form.dropoff_id === initial?.dropoff_id) return
    setDurLoading(true)
    supabase.from('routes').select('duration_min')
      .eq('production_id', PRODUCTION_ID).eq('from_id', form.pickup_id).eq('to_id', form.dropoff_id).maybeSingle()
      .then(({ data }) => { if (data?.duration_min) set('duration_min', String(data.duration_min)); setDurLoading(false) })
  }, [form.pickup_id, form.dropoff_id])

  const transferClass = getClass(form.pickup_id, form.dropoff_id)
  const arrMin  = timeStrToMin(form.arr_time)
  const callMin = timeStrToMin(form.call_time)
  const durMin  = parseInt(form.duration_min) || null
  const computed = calcTimes({ date: form.date, arrTimeMin: arrMin, durationMin: durMin, transferClass, callMin })

  // Vehicle availability check — esclude tutti i leg del gruppo per evitare falsi positivi MULTI
  useEffect(() => {
    if (!open || !form.vehicle_id || !computed?.startDt) { setVCheck(null); return }
    const excludeIds = group ? group.map(g => g.id).filter(Boolean) : (initial?.id ? [initial.id] : [])
    checkVehicleAvail(form.vehicle_id, form.date, computed.startDt, computed.endDt, excludeIds).then(setVCheck)
  }, [open, form.vehicle_id, form.date, computed?.startDt, computed?.endDt, initial?.id])

  // Crew Lookup (ricerca su tutto il crew della produzione, min 2 chars)
  useEffect(() => {
    if (crewLookupQ.length < 2 || !PRODUCTION_ID) { setCrewLookupResults([]); return }
    supabase.from('crew').select('id,full_name,department,role')
      .eq('production_id', PRODUCTION_ID)
      .or(`full_name.ilike.%${crewLookupQ}%,department.ilike.%${crewLookupQ}%`)
      .limit(8)
      .then(({ data }) => setCrewLookupResults(data || []))
  }, [crewLookupQ, PRODUCTION_ID])

  // ── Load pax data ─────────────────────────────────────────
  async function loadPaxData(trip) {
    if (!PRODUCTION_ID) return
    const isNewLeg = trip?.isNew === true
    const activeLegData = isNewLeg ? extraLegs.find(l => l.id === trip?.id) : null
    const effectivePickup  = isNewLeg ? (activeLegData?.pickup_id  || '') : (trip?.pickup_id  || '')
    const effectiveDropoff = isNewLeg ? (activeLegData?.dropoff_id || '') : (trip?.dropoff_id || '')
    if (!effectivePickup || !effectiveDropoff) {
      if (isNewLeg) {
        setAssignedPax([])
        setAvailableCrew([])
        setBusyMap({})
        setPaxLoading(false)
      }
      return
    }
    const tripId = isNewLeg ? null : trip?.id
    if (!isNewLeg && !tripId) return
    const reqId = ++loadPaxReqRef.current
    setPaxLoading(true)
    const tc = getClass(effectivePickup, effectiveDropoff)
    // Per leg nuovi: groupIds vuoti per trip_passengers (nessun pax ancora assegnato)
    // ma existingGroupIds serve per escludere da availableCrew i pax già nel gruppo
    const groupIds = isNewLeg ? [] : ((group && group.length > 1) ? group.map(g => g.id) : [tripId])
    const existingGroupIds = group ? group.map(g => g.id).filter(Boolean) : (tripId ? [tripId] : [])
    const legHotelDropoff = effectiveDropoff
    const legHotelPickup  = effectivePickup

    // Run all three queries in parallel
    const [paxRes, crewRes, dayTripsRes] = await Promise.all([
      existingGroupIds.length > 0
        ? supabase.from('trip_passengers')
            .select('crew_id, trip_row_id, crew!inner(id,full_name,department,no_transport_needed,hotel_id)')
            .in('trip_row_id', existingGroupIds)
        : Promise.resolve({ data: [] }),

      (() => {
        // S34-B: date-based filter (arrival_date / departure_date) instead of travel_status
        // S35 fix: for new legs trip.date is undefined — use form.date (the trip's actual date)
        // S35-B fix: use local timezone date (not UTC) to avoid day-shift at midnight
        const localToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
        const tripDate = isNewLeg ? (form.date || localToday()) : (trip?.date || localToday())
        let q = supabase.from('crew_stays')
          .select('crew_id, departure_date, crew!inner(id, full_name, department, no_transport_needed, hotel_id, hotel_status)')
          .eq('production_id', PRODUCTION_ID)
        // NOTE: DO NOT use .eq('crew.hotel_status', 'CONFIRMED') — PostgREST embedded resource
        // filters cause 400 Bad Request on this Supabase instance. Filter client-side instead.
        // NOTE: DO NOT use .order('crew.department').order('crew.full_name') for same reason.
        if (tc === 'ARRIVAL')        q = q.eq('hotel_id', legHotelDropoff).eq('arrival_date', tripDate)
        else if (tc === 'DEPARTURE') q = q.eq('hotel_id', legHotelPickup).eq('departure_date', tripDate)
        else                         q = q.eq('hotel_id', legHotelPickup).lte('arrival_date', tripDate).gte('departure_date', tripDate)
        return q
      })(),

      isNewLeg
        ? Promise.resolve({ data: [] })
        : supabase.from('trips')
            .select('id,trip_id,start_dt,end_dt')
            .eq('production_id', PRODUCTION_ID).eq('date', trip.date)
            .not('id', 'in', `(${groupIds.join(',')})`)
            .not('start_dt', 'is', null),
    ])

    // Ignora risultati stale (se loadPaxData è stata richiamata di nuovo nel frattempo)
    if (reqId !== loadPaxReqRef.current) return

    const assigned    = (paxRes.data || []).map(p => ({ ...p.crew, trip_row_id: p.trip_row_id }))
    const assignedIds = new Set(assigned.map(c => c.id))
    // Per leg nuovi: non mostrare i pax del gruppo come "assegnati" (non appartengono a questa leg)
    // ma usarli solo per escluderli da availableCrew
    setAssignedPax(isNewLeg ? [] : assigned)

    // Build busy map: crewId → conflicting trip_id
    const dayTrips   = dayTripsRes.data || []
    const dayTripIds = dayTrips.map(t => t.id)
    const bMap       = {}

    if (dayTripIds.length > 0 && trip.start_dt && trip.end_dt) {
      const { data: dayPax } = await supabase.from('trip_passengers')
        .select('crew_id,trip_row_id').in('trip_row_id', dayTripIds)
      const ts = new Date(trip.start_dt), te = new Date(trip.end_dt)
      for (const p of dayPax || []) {
        const dt = dayTrips.find(t => t.id === p.trip_row_id)
        if (dt && new Date(dt.start_dt) < te && new Date(dt.end_dt) > ts) {
          bMap[p.crew_id] = dt.trip_id
        }
      }
    }
    setBusyMap(bMap)
    const today = isoToday()
    // S35-B: filter hotel_status and sort client-side (PostgREST embedded resource filters → 400)
    const crewFromStays = (crewRes.data || [])
      .filter(s => s.crew?.hotel_status === 'CONFIRMED')
      .map(s => ({ ...s.crew, _checkoutToday: s.departure_date === today }))
      .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name))
    setAvailableCrew(crewFromStays.filter(c => !assignedIds.has(c.id)))
    setPaxLoading(false)
  }

  // ── Pax add/remove ────────────────────────────────────────
  async function addPax(crew) {
    if (!PRODUCTION_ID) return
    const targetId = activeLeg?.id ?? initial?.id
    if (!targetId) return

    // New leg (not yet in DB): store pax locally in extraLegs.pendingPax, flush at save
    if (activeLeg?.isNew) {
      const newPax = [...assignedPax, { ...crew, trip_row_id: targetId }]
      setAssignedPax(newPax)
      setAvailableCrew(p => p.filter(c => c.id !== crew.id))
      setExtraLegs(prev => prev.map(l =>
        l.id === activeLeg.id ? { ...l, pendingPax: [...(l.pendingPax || []), crew] } : l
      ))
      return
    }

    const { error } = await supabase.from('trip_passengers').insert({
      production_id: PRODUCTION_ID, trip_row_id: targetId, crew_id: crew.id,
    })
    if (!error) {
      const newPax = [...assignedPax, { ...crew, trip_row_id: targetId }]
      setAssignedPax(newPax)
      setAvailableCrew(p => p.filter(c => c.id !== crew.id))
      const legPax = newPax.filter(p => p.trip_row_id === targetId)
      await supabase.from('trips').update({
        pax_count: legPax.length,
        passenger_list: legPax.map(c => c.full_name).join(', '),
      }).eq('id', targetId)
      onPaxChanged?.()
    }
  }

  async function removePax(crew) {
    if (!initial?.id) return

    // New leg: remove only from local state (no DB row yet)
    const isNewLegPax = extraLegs.some(l => l.isNew === true && l.id === crew.trip_row_id)
    if (isNewLegPax) {
      setAssignedPax(assignedPax.filter(c => c.id !== crew.id))
      setAvailableCrew(p =>
        [...p, { id: crew.id, full_name: crew.full_name, department: crew.department }].sort((a, b) =>
          (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
        )
      )
      setExtraLegs(prev => prev.map(l =>
        l.id === crew.trip_row_id ? { ...l, pendingPax: (l.pendingPax || []).filter(c => c.id !== crew.id) } : l
      ))
      return
    }

    // Use the crew's own trip_row_id (set in loadPaxData) so multi-stop siblings are handled correctly
    const targetTripId = crew.trip_row_id ?? initial.id
    console.log('[removePax] crew:', crew.full_name, '| crew.trip_row_id:', crew.trip_row_id, '| initial.id:', initial.id, '→ targetTripId:', targetTripId)
    const { error } = await supabase.from('trip_passengers')
      .delete().eq('trip_row_id', targetTripId).eq('crew_id', crew.id)
    if (error) { console.error('[removePax] ERROR deleting trip_passengers:', error); setError(error.message); return }

    const newPax = assignedPax.filter(c => c.id !== crew.id)
    setAssignedPax(newPax)
    setAvailableCrew(p =>
      [...p, { id: crew.id, full_name: crew.full_name, department: crew.department }].sort((a, b) =>
        (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
      )
    )

    // Update passenger_list only on the trip row that was actually modified
    const tripPaxForTarget = newPax.filter(c => c.trip_row_id === targetTripId)
    await supabase.from('trips').update({
      pax_count:      tripPaxForTarget.length,
      passenger_list: tripPaxForTarget.length > 0 ? tripPaxForTarget.map(c => c.full_name).join(', ') : null,
    }).eq('id', targetTripId)

    // Cleanup: if targetTripId is a sibling leg (trip_id ends with letter) and now has 0 pax → delete the sibling row
    // NOTE: non usare `targetTripId !== initial.id` perché fallisce quando il sibling ha pickup_min
    // inferiore al leg principale e diventa group[0] (initial.id === sibling.id in quel caso).
    const targetTripObj     = (group || []).find(g => g.id === targetTripId)
    const isTargetSiblingLeg = targetTripObj ? /[A-Z]$/.test(targetTripObj.trip_id || '') : false
    if (isTargetSiblingLeg) {
      const siblingStillHasPax = newPax.some(c => c.trip_row_id === targetTripId)
      console.log('[removePax] sibling check | siblingStillHasPax:', siblingStillHasPax, '| targetTripId:', targetTripId)
      if (!siblingStillHasPax) {
        // Usa API route con service client per bypassare il problema RLS
        // dove trips DELETE lato client ritorna silent 0 rows senza errore
        const res = await fetch('/api/trips/delete-sibling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: targetTripId, productionId: PRODUCTION_ID }),
        })
        const result = await res.json()
        if (!res.ok || result.error) {
          console.error('[removePax] ERROR deleting sibling trip:', result.error)
          setError(`Failed to delete sibling trip: ${result.error}`)
          onPaxChanged?.()
          return
        }
        console.log('[removePax] sibling trip deleted successfully:', targetTripId)
      }
    }

    onPaxChanged?.()
  }

  // ── Delete single leg (MULTI) ─────────────────────────────
  async function deleteLeg(leg) {
    if (!PRODUCTION_ID) return
    const res = await fetch('/api/trips/delete-sibling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: leg.id, productionId: PRODUCTION_ID }),
    })
    const result = await res.json()
    if (!res.ok || result.error) {
      setError(`Failed to delete leg: ${result.error}`)
      return
    }
    onPaxChanged?.()
  }

  // ── Save trip ─────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setSaving(true)
    const isMulti    = group && group.length > 1
    const selVehicle = vehicles.find(v => v.id === form.vehicle_id)

    // When user is configuring a NEW leg (activeLeg.isNew), form.pickup_id/dropoff_id
    // belong to the new leg — NOT to Leg A (initial). Use initial values to preserve Leg A's route.
    const mainPickupId  = activeLeg?.isNew ? initial.pickup_id  : form.pickup_id
    const mainDropoffId = activeLeg?.isNew ? initial.dropoff_id : form.dropoff_id
    const mainArrTime   = activeLeg?.isNew ? initial.arr_time   : (form.arr_time ? form.arr_time + ':00' : null)
    const mainDurMin    = activeLeg?.isNew ? (initial.duration_min || null) : durMin
    const mainCallMin   = activeLeg?.isNew ? initial.call_min   : (computed?.callMin ?? null)
    const mainPickupMin = activeLeg?.isNew ? initial.pickup_min : (computed?.pickupMin ?? null)
    const mainStartDt   = activeLeg?.isNew ? initial.start_dt   : (computed?.startDt ?? null)
    const mainEndDt     = activeLeg?.isNew ? initial.end_dt     : (computed?.endDt ?? null)

    const row = {
      date: form.date, pickup_id: mainPickupId, dropoff_id: mainDropoffId,
      vehicle_id:  form.vehicle_id || null,
      driver_name: selVehicle?.driver_name ?? null,
      sign_code:   selVehicle?.sign_code   ?? null,
      capacity:    selVehicle?.capacity    ?? null,
      service_type_id: form.service_type_id || null,
      duration_min: mainDurMin,
      arr_time:   mainArrTime,
      call_min:   mainCallMin,
      // MULTI: pickup_min/start_dt/end_dt sono gestiti da compute-chain — non sovrascrivere con valori naïve
      ...(!isMulti && {
        pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin,
        start_dt:   (() => {
          const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin
          if (pm === null || pm === undefined) return mainStartDt
          const [y, mo, dd] = form.date.split('-').map(Number)
          return new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
        })(),
        end_dt:     (() => {
          const pm = form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin
          const dur = mainDurMin
          if (pm === null || pm === undefined || !dur) return mainEndDt
          const [y, mo, dd] = form.date.split('-').map(Number)
          return new Date(new Date(y, mo - 1, dd, Math.floor(pm / 60), pm % 60, 0, 0).getTime() + dur * 60000).toISOString()
        })(),
      }),
      flight_no: form.flight_no || null, terminal: form.terminal || null, notes: form.notes || null,
      status: form.status,
    }
    const { error } = await supabase.from('trips').update(row).eq('id', initial.id)
    if (error) { setSaving(false); setError(error.message); return }

    // ── Aggiorna i leg sibling del gruppo multi-stop ──────────────────────────
    // Ogni sibling condivide vehicle/status/arr_time/notes ma ha il proprio pickup_min
    // calcolato con la sua duration_min (distanza dal suo hotel all'hub può essere diversa)
    if (group && group.length > 1) {
      const siblings = group.filter(g => g.id !== initial.id)
      const sharedFields = {
        vehicle_id:  form.vehicle_id || null,
        driver_name: selVehicle?.driver_name ?? null,
        sign_code:   selVehicle?.sign_code   ?? null,
        capacity:    selVehicle?.capacity    ?? null,
        date:        form.date,
        arr_time:    form.arr_time ? form.arr_time + ':00' : null,
        flight_no:   form.flight_no || null,
        terminal:    form.terminal  || null,
        notes:       form.notes     || null,
        status:      form.status,
      }
      for (const sib of siblings) {
        const sibTC = getClass(sib.pickup_id, sib.dropoff_id)
          // Priority: use the sibling's stored duration_min first (set at creation time).
        // Only query routes as fallback if duration_min is null in the DB.
        let sibDurMin = sib.duration_min || null
        if (!sibDurMin && PRODUCTION_ID) {
          const { data: sibRoute } = await supabase.from('routes')
            .select('duration_min')
            .eq('production_id', PRODUCTION_ID)
            .eq('from_id', sib.pickup_id)
            .eq('to_id', sib.dropoff_id)
            .maybeSingle()
          sibDurMin = sibRoute?.duration_min || null
        }
        // Se ancora null, chiama /api/routes/compute (Google Maps) come ultimo fallback
        if (!sibDurMin && sib.pickup_id && sib.dropoff_id) {
          try {
            const computeRes = await fetch('/api/routes/compute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from_id: sib.pickup_id, to_id: sib.dropoff_id, production_id: PRODUCTION_ID }),
            })
            if (computeRes.ok) {
              const computeData = await computeRes.json()
              if (computeData.duration_min) sibDurMin = computeData.duration_min
            }
          } catch (e) {
            console.warn('[handleSubmit] sibling route compute fallback:', e)
          }
        }
        // Ultimo fallback: direzione inversa (Hotel→Hub ≈ Hub→Hotel stessa distanza)
        // Utile per ARRIVAL trips dove in DB esiste Hotel→Hub ma non Hub→Hotel
        if (!sibDurMin && sib.pickup_id && sib.dropoff_id && PRODUCTION_ID) {
          const { data: revSibRoute } = await supabase.from('routes')
            .select('duration_min')
            .eq('production_id', PRODUCTION_ID)
            .eq('from_id', sib.dropoff_id)
            .eq('to_id', sib.pickup_id)
            .maybeSingle()
          if (revSibRoute?.duration_min) sibDurMin = revSibRoute.duration_min
        }
        // Ricalcola timing con la duration specifica del sibling
        const sibCalc = sibDurMin ? calcTimes({
          date:          form.date,
          arrTimeMin:    arrMin,
          durationMin:   sibDurMin,
          transferClass: sibTC,
          callMin:       computed?.callMin ?? null,
        }) : null

        // ARRIVAL fix: pickup_min = call_min (driver già all'hub all'arrivo del volo)
        const sibCallMin = sibCalc?.callMin ?? computed?.callMin ?? null
        // If can't calculate, preserve the existing DB value instead of overwriting with null
        const sibPickupMin = sibCalc?.pickupMin
          ?? (sibTC === 'ARRIVAL' ? sibCallMin : sib.pickup_min)

        // start_dt: compute from sibPickupMin if possible, otherwise preserve existing
        const sibStartDt = sibCalc?.startDt ?? (() => {
          const pm = sibPickupMin ?? sib.pickup_min
          if (pm === null) return sib.start_dt ?? null
          const [sy, smo, sdd] = form.date.split('-').map(Number)
          return new Date(sy, smo - 1, sdd, Math.floor(pm / 60), pm % 60, 0, 0).toISOString()
        })()

        // pickup_min/start_dt/end_dt sono ricalcolati da compute-chain — non sovrascrivere con valori naïve
        await supabase.from('trips').update({
          ...sharedFields,
          duration_min: sibDurMin ?? sib.duration_min ?? null,
          call_min:     sibCallMin,
        }).eq('id', sib.id)
      }
    }

    // Ricalcola catena sequenziale MULTI-PKP / MULTI-DRP dopo aver salvato i sibling
    if (group && group.length > 1) {
      try {
        await fetch('/api/routes/compute-chain', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ leg_ids: group.map(g => g.id), production_id: PRODUCTION_ID }),
        })
      } catch (e) { console.warn('[handleSubmit] compute-chain:', e) }
    }

    // ── Save extra legs (Leg B, C, D) ─────────────────────────────────────
    // Logica INSERT identica a handleAddToExisting (in TripSidebar), che non è
    // richiamabile direttamente da qui perché è in un componente separato e
    // tightly coupled a assignCtx/selExistingTrip/sibDropoff.
    if (extraLegs.length > 0 || toDelete.length > 0) {
      const baseId   = baseTripId(initial.trip_id)
      const suffixes = ['B', 'C', 'D']
      const newLegIds = []

      for (const delId of toDelete) {
        await fetch('/api/trips/delete-sibling', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: delId, productionId: PRODUCTION_ID }),
        })
      }

      for (let i = 0; i < extraLegs.length; i++) {
        const leg = extraLegs[i]
        if (!leg.pickup_id || !leg.dropoff_id) continue   // skip silenzioso
        if (leg.existing && leg.pickup_id === leg._origPickup && leg.dropoff_id === leg._origDropoff) continue

        // Usa sempre leg.trip_id (impostato correttamente dal "+ Add Leg" onClick che calcola
        // la prossima lettera disponibile tenendo conto di group). NON usare suffixes[i] perché
        // l'indice i parte da 0 anche quando group ha già sibling (es. i=0 → 'B' anche se T001B esiste già).
        const newTripId = leg.trip_id

        // 1. Cerca duration_min nella tabella routes
        let legDurMin = null
        if (PRODUCTION_ID) {
          const { data: legRoute } = await supabase.from('routes')
            .select('duration_min')
            .eq('production_id', PRODUCTION_ID)
            .eq('from_id', leg.pickup_id)
            .eq('to_id', leg.dropoff_id)
            .maybeSingle()
          legDurMin = legRoute?.duration_min || null
        }
        // 2. Fallback: chiama /api/routes/compute (Google Maps)
        if (!legDurMin) {
          try {
            const computeRes = await fetch('/api/routes/compute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from_id: leg.pickup_id, to_id: leg.dropoff_id, production_id: PRODUCTION_ID }),
            })
            if (computeRes.ok) {
              const computeData = await computeRes.json()
              if (computeData.duration_min) legDurMin = computeData.duration_min
            }
          } catch (e) { console.warn('[handleSubmit] extra leg route compute:', e) }
        }
        // 3. Ultimo fallback: direzione inversa (Hotel→Hub ≈ Hub→Hotel stessa distanza)
        if (!legDurMin && PRODUCTION_ID) {
          const { data: revRoute } = await supabase.from('routes')
            .select('duration_min')
            .eq('production_id', PRODUCTION_ID)
            .eq('from_id', leg.dropoff_id)
            .eq('to_id', leg.pickup_id)
            .maybeSingle()
          if (revRoute?.duration_min) legDurMin = revRoute.duration_min
        }

        // Calcola timing del leg extra (stesso meccanismo di handleAddToExisting)
        const legTC = getClass(leg.pickup_id, leg.dropoff_id)
        const legCalc = legDurMin ? calcTimes({
          date:          form.date,
          arrTimeMin:    arrMin,
          durationMin:   legDurMin,
          transferClass: legTC,
          callMin:       computed?.callMin ?? null,
        }) : null

        // ARRIVAL: pickup = call_min (driver già all'hub); DEPARTURE/STANDARD: pickup = call - duration
        const legPickupMin = legCalc?.pickupMin ?? (legTC === 'ARRIVAL' ? (computed?.callMin ?? null) : null)
        const legStartDt = legCalc?.startDt ?? (() => {
          if (legPickupMin === null) return null
          const [sy, smo, sdd] = form.date.split('-').map(Number)
          return new Date(sy, smo - 1, sdd, Math.floor(legPickupMin / 60), legPickupMin % 60, 0, 0).toISOString()
        })()

        // Costruisce il sibling row con i campi del trip originale + pickup/dropoff del leg extra
        // (copia: date, vehicle_id, unit, service_type, duration_min; sovrascrive: trip_id, pickup_id, dropoff_id)
        const siblingRow = {
          production_id:   PRODUCTION_ID,
          trip_id:         newTripId,
          date:            form.date,
          pickup_id:       leg.pickup_id,
          dropoff_id:      leg.dropoff_id,
          vehicle_id:      form.vehicle_id || null,
          driver_name:     selVehicle?.driver_name ?? null,
          sign_code:       selVehicle?.sign_code   ?? null,
          capacity:        selVehicle?.capacity    ?? null,
          service_type_id: form.service_type_id || null,
          duration_min:    legDurMin,
          arr_time:        form.arr_time ? form.arr_time + ':00' : null,
          call_min:        computed?.callMin   ?? null,
          pickup_min:      legPickupMin,
          start_dt:        legStartDt,
          end_dt:          legCalc?.endDt ?? null,
          flight_no:       form.flight_no || null,
          terminal:        form.terminal  || null,
          notes:           form.notes     || null,
          status:          form.status,
          pax_count:       0,
        }

        if (leg.existing) {
          const { error: legErr } = await supabase.from('trips').update({
            pickup_id: leg.pickup_id, dropoff_id: leg.dropoff_id,
            duration_min: legDurMin,
            call_min: computed?.callMin ?? null,
            pickup_min: legPickupMin,
            start_dt: legStartDt,
            end_dt: legCalc?.endDt ?? null,
          }).eq('id', leg.id)
          if (legErr) {
            setError(`❌ Leg ${leg.trip_id}: ${legErr.message}`)
            break
          }
          newLegIds.push(leg.id)
        } else {
          const { data: newRow, error: legErr } = await supabase.from('trips').insert(siblingRow).select('id').single()
          if (legErr || !newRow?.id) {
            setError(`❌ Leg ${newTripId}: ${legErr?.message || 'insert failed'}`)
            break
          }
          newLegIds.push(newRow.id)
          // Inserisce i pax selezionati per questo nuovo leg
          if (leg.pendingPax?.length > 0) {
            await supabase.from('trip_passengers').insert(
              leg.pendingPax.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: newRow.id, crew_id: c.id }))
            )
            await supabase.from('trips').update({
              pax_count:      leg.pendingPax.length,
              passenger_list: leg.pendingPax.map(c => c.full_name).join(', '),
            }).eq('id', newRow.id)
          }
        }
      }

      // Ricalcola catena sequenziale includendo i nuovi leg
      if (newLegIds.length > 0) {
        const allLegIds = [
          ...(group ? group.map(g => g.id) : [initial.id]),
          ...newLegIds,
        ]
        try {
          await fetch('/api/routes/compute-chain', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ leg_ids: allLegIds, production_id: PRODUCTION_ID }),
          })
        } catch (e) { console.warn('[handleSubmit] extra legs compute-chain:', e) }
      }
    }

    setExtraLegs([])
    setToDelete([])
    setSaving(false)
    onSaved()
  }

  // ── Delete trip ───────────────────────────────────────────
  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    const legsToDelete = (group && group.length > 1) ? group : [initial]
    for (const leg of legsToDelete) {
      const res = await fetch('/api/trips/delete-sibling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: leg.id, productionId: PRODUCTION_ID }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setDeleting(false)
        setError(`Failed to delete trip: ${result.error}`)
        return
      }
    }
    setDeleting(false)
    onSaved()
  }

  const cls = CLS[transferClass] || CLS.STANDARD
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
  const lbl = { fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }

  // Location lookup per hotel badge e leg sub-header
  const locsById = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const locShortEdit = id => (locsById[id] || id || '–').split(' ').slice(0, 3).join(' ')

  const selVehicleEdit    = vehicles.find(v => v.id === form.vehicle_id)
  const suggestedCrewEdit = (selVehicleEdit && (selVehicleEdit.preferred_dept || selVehicleEdit.preferred_crew_ids?.length > 0))
    ? availableCrew.filter(c =>
        (selVehicleEdit.preferred_crew_ids?.includes(c.id)) ||
        (selVehicleEdit.preferred_dept && c.department === selVehicleEdit.preferred_dept)
      )
    : []

  const regularCrew  = availableCrew.filter(c => !c.no_transport_needed)
  const ntnCrew      = availableCrew.filter(c =>  c.no_transport_needed)
  const freeCount    = regularCrew.filter(c => !busyMap[c.id]).length
  const busyCount    = regularCrew.filter(c =>  busyMap[c.id]).length
  const filtered     = regularCrew.filter(c => !paxSearch || c.full_name.toLowerCase().includes(paxSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(paxSearch.toLowerCase()))
  const filteredNtn  = ntnCrew.filter(c => !paxSearch || c.full_name.toLowerCase().includes(paxSearch.toLowerCase()) || (c.department || '').toLowerCase().includes(paxSearch.toLowerCase()))

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,35,64,0.15)' }} />}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : `${SIDEBAR_W}px`, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 50, transform: open ? 'translateX(0)' : `translateX(${isMobile ? '100vw' : SIDEBAR_W + 'px'})`, transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e3a5f', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.editTrip}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{baseTripId(initial?.trip_id)}</div>
              {group && group.length > 1 && (
                <span style={{ fontSize: '10px', fontWeight: '800', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em' }}>
                  🔀 MULTI · {group.length} legs
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(form.pickup_id && form.dropoff_id) && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>{transferClass}</span>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

            {/* ── Leg Selector (solo per gruppi multi-stop) ── */}
            {open && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '4px 0 2px' }}>
                {[...(group || [initial].filter(Boolean)), ...extraLegs].map((leg, i) => {
                  const isNew = extraLegs.some(e => e.id === leg.id)
                  const label = i === 0 ? 'Leg A' : `Leg ${String.fromCharCode(65 + i)}${isNew ? ' ✦' : ''}`
                  const isActive = activeLeg?.id === leg.id
                  return (
                    <button
                      key={leg.id}
                      type="button"
                      onClick={() => setActiveLeg(leg)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '99px',
                        fontSize: '11px',
                        fontWeight: isActive ? 600 : 400,
                        background: isActive ? '#534AB7' : 'transparent',
                        color: isActive ? '#fff' : '#888',
                        border: isActive ? '0.5px solid #534AB7' : '0.5px solid #d0d0d0',
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                      {isActive && isNew && (
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            setExtraLegs(prev => prev.filter(l => l.id !== leg.id))
                            setActiveLeg(group[0])
                          }}
                          style={{ marginLeft: '6px', opacity: 0.6 }}
                        >✕</span>
                      )}
                    </button>
                  )
                })}
                {((group?.length ?? 1) + extraLegs.length) < 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      const baseId = baseTripId(initial.trip_id)
                      const usedLetters = group.map(g => {
                        const suf = g.trip_id.slice(baseId.length)
                        return suf.length === 1 && /^[A-Z]$/.test(suf) ? suf : null
                      }).filter(Boolean)
                      let nextLetter = 'B'
                      for (const l of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') {
                        if (!usedLetters.includes(l)) { nextLetter = l; break }
                      }
                      const newLeg = {
                        id: `new_${Date.now()}`,
                        trip_id: baseId + nextLetter,
                        pickup_id: '', dropoff_id: '',
                        existing: false, isNew: true,
                      }
                      setExtraLegs(prev => [...prev, newLeg])
                      setActiveLeg(newLeg)
                    }}
                    style={{
                      padding: '4px 12px', borderRadius: '99px',
                      fontSize: '11px', background: 'transparent',
                      color: '#534AB7', border: '0.5px solid #534AB7',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Leg
                  </button>
                )}
              </div>
            )}

            {/* ── Crew Lookup ── */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>🔍 Crew Lookup</div>
              <input type="text" placeholder="Search by name or department…" value={crewLookupQ} onChange={e => setCrewLookupQ(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              {crewLookupResults.length > 0 && (
                <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: 'white' }}>
                  {crewLookupResults.map(c => (
                    <div key={c.id} onClick={() => setCrewInfoCrew(c)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: 'white' }} onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>ℹ️</span>
                    </div>
                  ))}
                </div>
              )}
              {crewLookupQ.length >= 2 && crewLookupResults.length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '6px 0 2px', fontStyle: 'italic' }}>No results</div>}
            </div>

            {/* Date + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
                  {['PLANNED','BUSY','DONE','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Pickup / Dropoff */}
            <div>
              <label style={lbl}>Pickup</label>
              <select value={form.pickup_id} onChange={e => {
                set('pickup_id', e.target.value)
                if (activeLeg?.isNew) setExtraLegs(prev => prev.map(l => l.id === activeLeg.id ? { ...l, pickup_id: e.target.value } : l))
              }} style={inp} required>
                <option value="">Select pickup…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label style={lbl}>Dropoff</label>
              <select value={form.dropoff_id} onChange={e => {
                set('dropoff_id', e.target.value)
                if (activeLeg?.isNew) setExtraLegs(prev => prev.map(l => l.id === activeLeg.id ? { ...l, dropoff_id: e.target.value } : l))
              }} style={inp} required>
                <option value="">Select dropoff…</option>
                <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              </select>
            </div>

            {/* ── Extra Legs (multi-stop UI) — solo per trip singoli; per multi il switcher sopra sostituisce questa UI ── */}
            {false && <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '2px' }}>Route Legs</div>

              {/* Leg A — read-only */}
              <div style={{ fontSize: '12px', color: '#64748b', padding: '5px 8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
                <span style={{ fontWeight: '800', color: '#0f172a', marginRight: '6px', fontFamily: 'monospace' }}>Leg A</span>
                {locShortEdit(form.pickup_id) || '–'} → {locShortEdit(form.dropoff_id) || '–'}
              </div>

              {/* Extra legs */}
              {extraLegs.map((leg, i) => (
                <div key={leg.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>Leg {String.fromCharCode(66 + i)}</span>
                    <button type="button" onClick={() => {
                      if (leg.existing) setToDelete(prev => [...prev, leg.id])
                      setExtraLegs(extraLegs.filter(l => l.id !== leg.id))
                    }}
                      style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', lineHeight: 1 }}>✕</button>
                  </div>
                  <select value={leg.pickup_id}
                    onChange={e => setExtraLegs(extraLegs.map(l => l.id === leg.id ? { ...l, pickup_id: e.target.value } : l))}
                    style={{ ...inp, fontSize: '12px' }}>
                    <option value="">Select pickup…</option>
                    <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                    <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                  </select>
                  <select value={leg.dropoff_id}
                    onChange={e => setExtraLegs(extraLegs.map(l => l.id === leg.id ? { ...l, dropoff_id: e.target.value } : l))}
                    style={{ ...inp, fontSize: '12px' }}>
                    <option value="">Select dropoff…</option>
                    <optgroup label="Hubs">{locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                    <optgroup label="Hotels / Locations">{locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                  </select>
                </div>
              ))}

              {/* + Add stop */}
              {extraLegs.length < 3 && (
                <button type="button"
                  onClick={() => setExtraLegs([...extraLegs, { id: Date.now(), pickup_id: '', dropoff_id: '', pendingPax: [] }])}
                  style={{ width: '100%', padding: '6px', borderRadius: '7px', border: '1px dashed #94a3b8', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  + Add stop
                </button>
              )}
            </div>}

            {/* Vehicle + availability badge */}
            <div>
              <label style={lbl}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={inp}>
                <option value="">No vehicle</option>
                {vehicles.map(v => {
                  const avail   = isVehicleAvailableForDate(v, form.date)
                  const hasPref = v.preferred_dept || v.preferred_crew_ids?.length > 0
                  return (
                    <option key={v.id} value={v.id}>
                      {avail ? '' : '⚠ '}{v.id} — {v.driver_name} ({v.sign_code}) ×{v.capacity}{hasPref ? ` · ⭐ ${[v.preferred_dept, v.preferred_crew_ids?.length > 0 ? `${v.preferred_crew_ids.length}p` : null].filter(Boolean).join(' ')}` : ''}{avail ? '' : ` · ${t.vehicleNotAvailable}`}
                    </option>
                  )
                })}
              </select>
              {form.vehicle_id && vCheck && (
                <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700', color: vCheck.available ? '#15803d' : '#dc2626' }}>
                  {vCheck.available ? '✅ Vehicle available' : `⚠ Already busy on ${vCheck.conflictTripId}`}
                </div>
              )}
            </div>

            {/* Time inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>{transferClass === 'ARRIVAL' ? 'Arrival Time' : transferClass === 'DEPARTURE' ? 'Departure Time' : 'Call Time'}</label>
                <input type="time"
                  value={transferClass !== 'STANDARD' ? form.arr_time : form.call_time}
                  onChange={e => transferClass !== 'STANDARD' ? set('arr_time', e.target.value) : set('call_time', e.target.value)}
                  style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
              </div>
              <div>
                <label style={lbl}>Duration (min) {durLoading && '…'}</label>
                <input type="number" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} style={{ ...inp, fontVariantNumeric: 'tabular-nums' }} placeholder="auto" min="1" max="240" />
              </div>
            </div>
            <div>
              <label style={lbl}>Pickup Time <span style={{ fontWeight: '400', color: '#cbd5e1' }}>(override — optional)</span></label>
              <input type="time"
                value={form.pickup_time}
                onChange={e => set('pickup_time', e.target.value)}
                style={{ ...inp, fontSize: '17px', fontWeight: '800', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderColor: form.pickup_time ? '#f59e0b' : '#e2e8f0', background: form.pickup_time ? '#fffbeb' : 'white' }} />
              {form.pickup_time && (
                <div style={{ fontSize: '10px', color: '#92400e', fontWeight: '700', marginTop: '3px' }}>
                  ⚡ Pickup time overridden — automatic calculation ignored
                  <button type="button" onClick={() => set('pickup_time', '')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: '800' }}>✕ clear</button>
                </div>
              )}
            </div>

            {/* Times preview — per MULTI trips, PICKUP e START vengono dal DB (compute-chain) */}
            {computed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                {(() => {
                  // MULTI: PICKUP e START riflettono il valore calcolato dalla catena sequenziale
                  // (hotel più lontano parte prima → pickup anticipato rispetto a call-duration naïve)
                  const isChain = group && group.length > 1
                  const pickupV = isChain && initial?.pickup_min != null
                    ? minToHHMM(initial.pickup_min)
                    : minToHHMM(computed.pickupMin)
                  const startV  = isChain && initial?.start_dt
                    ? new Date(initial.start_dt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    : new Date(computed.startDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                  return [
                    { l: 'CALL',   v: minToHHMM(computed.callMin), chain: false },
                    { l: 'PICKUP', v: pickupV,                      chain: isChain },
                    { l: 'START',  v: startV,                       chain: isChain },
                    { l: 'END',    v: new Date(computed.endDt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), chain: false },
                  ].map(({ l, v, chain }) => (
                    <div key={l} style={{ textAlign: 'center', background: chain ? '#fef9c3' : '#f0fdf4', border: `1px solid ${chain ? '#fde68a' : '#bbf7d0'}`, borderRadius: '8px', padding: '6px 4px' }}>
                      <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.07em' }}>{l}{chain ? ' ⚡' : ''}</div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* Flight + Terminal + Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Flight / Train</label>
                <input value={form.flight_no} onChange={e => set('flight_no', e.target.value)} style={inp} placeholder="AZ 4568" />
              </div>
              <div>
                <label style={lbl}>Terminal</label>
                <input value={form.terminal} onChange={e => set('terminal', e.target.value)} style={inp} placeholder="T1, T2, Arrivi Nord…" />
              </div>
            </div>
            <div>
              <label style={lbl}>Service Type</label>
              <select value={form.service_type_id} onChange={e => set('service_type_id', e.target.value)} style={inp}>
                <option value="">None</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inp} />
            </div>

            {/* ── Passengers ── */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Passengers ({assignedPax.length}{initial?.capacity ? `/${initial.capacity}` : ''})
              </div>

              {paxLoading ? (
                <div style={{ padding: '10px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>{t.loadingPax}</div>
              ) : (
                <>
                  {/* ASSIGNED */}
                  {assignedPax.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', letterSpacing: '0.05em', marginBottom: '5px' }}>
                        {t.assignedSection} ({assignedPax.length})
                      </div>

                      {/* ── MULTI: raggruppa pax per leg con sub-header ── */}
                      {group && group.length > 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {group.map(leg => {
                            const legPax = assignedPax.filter(p => p.trip_row_id === leg.id)
                            // Leggi la location "chiave" del leg: per DEPARTURE/STANDARD = pickup (hotel), per ARRIVAL = dropoff (hotel)
                            const legHotelId = leg.transfer_class === 'ARRIVAL' ? leg.dropoff_id : leg.pickup_id
                            const legHotelName = locShortEdit(legHotelId)
                            const legPickupTime = leg.pickup_min != null ? minToHHMM(leg.pickup_min) : null
                            return (
                              <div key={leg.id}>
                                {/* Sub-header leg */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '3px 8px', marginBottom: '3px' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: '800', color: '#374151' }}>{leg.trip_id}</span>
                                  <span style={{ color: '#cbd5e1', fontSize: '10px' }}>·</span>
                                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>🏨 {legHotelName}</span>
                                  {legPickupTime && (
                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>🕐 {legPickupTime}</span>
                                  )}
                                  <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0 }}>{legPax.length}p</span>
                                  <button type="button" onClick={() => deleteLeg(leg)} title="Delete this leg"
                                    style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '3px', padding: '1px 4px', cursor: 'pointer', fontSize: '9px', fontWeight: '800', flexShrink: 0, lineHeight: 1 }}>🗑</button>
                                </div>
                                {/* Pax di questo leg */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '4px' }}>
                                  {legPax.length > 0 ? legPax.map(c => (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.full_name}</span>
                                        {c.no_transport_needed && (
                                          <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>
                                        )}
                                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>{c.department}</span>
                                      </div>
                                      <button type="button" onClick={() => removePax(c)}
                                        style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0, marginLeft: '4px' }}>
                                        ×
                                      </button>
                                    </div>
                                  )) : (
                                    <div style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic', padding: '2px 8px' }}>—</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        /* ── SINGLE trip: lista flat con hotel badge ── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {assignedPax.map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.full_name}</span>
                                {c.no_transport_needed && (
                                  <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1' }}>🚐 SD</span>
                                )}
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{c.department}</span>
                                {c.hotel_id && locsById[c.hotel_id] && (
                                  <span style={{ color: '#64748b', fontSize: '10px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>🏨 {locShortEdit(c.hotel_id)}</span>
                                )}
                              </div>
                              <button type="button" onClick={() => removePax(c)}
                                style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '4px', padding: '1px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 📌 SUGGERITI */}
                  {suggestedCrewEdit.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400e', letterSpacing: '0.06em', marginBottom: '6px' }}>
                        📌 Suggeriti per {selVehicleEdit.id}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {suggestedCrewEdit.map(c => (
                          <div key={c.id}
                            onClick={() => addPax(c)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'white', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fef9c3'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.department}</div>
                            </div>
                            <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '700', flexShrink: 0 }}>+</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AVAILABLE + BUSY */}
                  {regularCrew.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '0.05em' }}>
                          {t.availableSection} ({freeCount})
                          {busyCount > 0 && <span style={{ color: '#a16207', marginLeft: '6px' }}>· {busyCount} BUSY</span>}
                        </div>
                        {freeCount > 0 && (
                          <button type="button" onClick={() => regularCrew.filter(c => !busyMap[c.id]).forEach(c => addPax(c))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '10px', fontWeight: '700' }}>
                            Add all ({freeCount})
                          </button>
                        )}
                      </div>
                      <input type="text" placeholder="Search crew…" value={paxSearch} onChange={e => setPaxSearch(e.target.value)}
                        style={{ ...inp, padding: '5px 9px', fontSize: '12px', marginBottom: '4px' }} />
                      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        {filtered.length === 0 ? (
                          <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>{t.noResults}</div>
                        ) : filtered.map(c => {
                          const isBusy = !!busyMap[c.id]
                          return (
                            <div key={c.id} onClick={() => !isBusy && addPax(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f8fafc', background: isBusy ? '#fffbeb' : 'white' }}
                              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#eff6ff' }}
                              onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = 'white' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px' }}>
                                  <span>{c.department}</span>
                                  {c.hotel_id && locsById[c.hotel_id] && <span style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', border: '1px solid #e2e8f0', color: '#475569' }}>🏨 {locShortEdit(c.hotel_id)}</span>}
                                  {c._checkoutToday && c.no_transport_needed && <span style={{ color: '#d97706', fontWeight: '700', background: '#fef9c3', padding: '1px 4px', borderRadius: '3px', border: '1px solid #fde68a' }}>⚠ CHK-OUT oggi · OA</span>}
                                  {c._checkoutToday && !c.no_transport_needed && <span style={{ color: '#d97706', fontWeight: '700', background: '#fef9c3', padding: '1px 4px', borderRadius: '3px', border: '1px solid #fde68a' }}>⚠ CHK-OUT oggi</span>}
                                  {isBusy && <span style={{ color: '#a16207' }}>⚠ BUSY on {busyMap[c.id]}</span>}
                                </div>
                              </div>
                              {!isBusy && <span style={{ fontSize: '14px', color: '#2563eb', fontWeight: '700', flexShrink: 0 }}>+</span>}
                              {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                            </div>
                          )
                        })}
                      </div>

                      {/* ── NTN / Self Drive subsection ── */}
                      {filteredNtn.length > 0 && (
                        <div style={{ marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', letterSpacing: '0.05em', marginBottom: '5px' }}>
                            🚐 {t.selfDrive} / {t.ntnShort} ({ntnCrew.filter(c => !busyMap[c.id]).length})
                          </div>
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                            {filteredNtn.map(c => {
                              const isBusy = !!busyMap[c.id]
                              return (
                                <div key={c.id} onClick={() => !isBusy && addPax(c)}
                                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f1f5f9', background: isBusy ? '#fffbeb' : '#f8fafc' }}
                                  onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#f1f5f9' }}
                                  onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = '#f8fafc' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                                      <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                      {c.department}
                                      {isBusy && <span style={{ color: '#a16207', marginLeft: '4px' }}>· ⚠ BUSY on {busyMap[c.id]}</span>}
                                    </div>
                                  </div>
                                  {!isBusy && <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '700', flexShrink: 0 }}>+</span>}
                                  {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : ntnCrew.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', letterSpacing: '0.05em', marginBottom: '5px' }}>
                        🚐 {t.selfDrive} / {t.ntnShort} ({ntnCrew.filter(c => !busyMap[c.id]).length})
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                        {filteredNtn.map(c => {
                          const isBusy = !!busyMap[c.id]
                          return (
                            <div key={c.id} onClick={() => !isBusy && addPax(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: isBusy ? 'default' : 'pointer', borderBottom: '1px solid #f1f5f9', background: isBusy ? '#fffbeb' : '#f8fafc' }}
                              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = '#f1f5f9' }}
                              onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = '#f8fafc' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: '500', color: isBusy ? '#92400e' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                                  <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', background: '#f1f5f9', color: '#6b7280', border: '1px solid #cbd5e1', flexShrink: 0 }}>🚐 SD</span>
                                </div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  {c.department}
                                  {isBusy && <span style={{ color: '#a16207', marginLeft: '4px' }}>· ⚠ BUSY on {busyMap[c.id]}</span>}
                                </div>
                              </div>
                              {!isBusy && <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '700', flexShrink: 0 }}>+</span>}
                              {isBusy  && <span style={{ fontSize: '10px', color: '#a16207', fontWeight: '700', flexShrink: 0, background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>BUSY</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    assignedPax.length === 0 && (
                      <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                        {t.noEligibleCrew}
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* Danger zone */}
            <div style={{ borderTop: '1px solid #fecaca', paddingTop: '12px', marginTop: '4px' }}>
              {!confirmDel ? (
                <button type="button" onClick={handleDelete}
                  style={{ width: '100%', padding: '7px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                  🗑 Delete Trip {baseTripId(initial?.trip_id)}{group && group.length > 1 ? ` (${group.length} legs)` : ''}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: '600', flexShrink: 0 }}>{t.deleteTripConfirm}</span>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    style={{ flex: 1, padding: '6px', border: 'none', background: '#dc2626', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '800' }}>
                    {deleting ? '…' : t.yesDelete}
                  </button>
                  <button type="button" onClick={() => setConfirmDel(false)}
                    style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>❌ {error}</div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t.cancel}</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px', borderRadius: '8px', border: 'none', background: saving ? '#94a3b8' : '#1e3a5f', color: 'white', fontSize: '13px', cursor: saving ? 'default' : 'pointer', fontWeight: '800' }}>
              {saving ? t.saving : t.saveChanges}
            </button>
          </div>
        </form>
      </div>
      {crewInfoCrew && (
        <CrewInfoModal crew={crewInfoCrew} productionId={PRODUCTION_ID} locations={locations} onClose={() => setCrewInfoCrew(null)} overlayRight={SIDEBAR_W} />
      )}
    </>
  )
}

// ─── Pagina principale ─────────────────────────────────────────
function TripsPageInner() {
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user,          setUser]          = useState(null)
  const [date,          setDate]          = useState(isoToday())
  const [trips,         setTrips]         = useState([])
  const [locsMap,       setLocsMap]       = useState({})
  const [locsList,      setLocsList]      = useState([])
  const [vhcList,       setVhcList]       = useState([])
  const [stList,        setStList]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [newTripOpen,   setNewTripOpen]   = useState(false)   // CREATE sidebar
  const [editTripRow,   setEditTripRow]   = useState(null)    // EDIT sidebar (trip row object)
  const [editTripGroup, setEditTripGroup] = useState(null)    // EDIT sidebar (full group for multi-stop)
  const [filterClass,   setFilterClass]   = useState('ALL')
  const [filterStatus,  setFilterStatus]  = useState('ALL')
  const [filterVehicle, setFilterVehicle] = useState('ALL')
  const [assignCtx,     setAssignCtx]     = useState(null)
  const [showAssignInfo, setShowAssignInfo] = useState(false)

  const anySidebarOpen = newTripOpen || !!editTripRow
  const isMobile = useIsMobile()

  // ── Read assign crew context from URL params (from pax-coverage → + Assign) ──
  useEffect(() => {
    const id    = searchParams.get('assignCrewId')
    const name  = searchParams.get('assignCrewName')
    const hotel = searchParams.get('assignHotelId')
    const ts    = searchParams.get('assignTS')
    const d     = searchParams.get('assignDate')
    if (id && name) {
      setAssignCtx({ id, name, hotel: hotel || '', ts: ts || 'PRESENT' })
      if (d) setDate(d)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      if (PRODUCTION_ID) {
        await supabase.from('user_roles').upsert(
          { user_id: user.id, production_id: PRODUCTION_ID, role: 'CAPTAIN' },
          { onConflict: 'user_id,production_id', ignoreDuplicates: true }
        )
        const [locsR, vhcR, stR] = await Promise.all([
          supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('is_hub', { ascending: false }).order('name'),
          supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type,available_from,available_to,preferred_dept,preferred_crew_ids').eq('production_id', PRODUCTION_ID).eq('active', true).eq('in_transport', true).order('id'),
          supabase.from('service_types').select('id,name').eq('production_id', PRODUCTION_ID).order('sort_order'),
        ])
        if (locsR.data) { const m = {}; locsR.data.forEach(l => { m[l.id] = l.name }); setLocsMap(m); setLocsList(locsR.data) }
        if (vhcR.data) setVhcList(vhcR.data)
        if (stR.data)  setStList(stR.data)
      }
      setUser(user)
    })
  }, [])

  const loadTrips = useCallback(async d => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase.from('trips').select('*')
      .eq('production_id', PRODUCTION_ID).eq('date', d)
      .order('pickup_min', { ascending: true, nullsLast: true })
    setTrips(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadTrips(date) }, [user, date, loadTrips])

  // ── Mantieni editTripGroup sincronizzato con trips dopo ogni reload ──────────
  // Quando un sibling viene eliminato (removePax), loadTrips aggiorna `trips`
  // ma editTripGroup era stale → ora si ricalcola automaticamente
  useEffect(() => {
    if (!editTripRow) return
    const baseId = baseTripId(editTripRow.trip_id)
    const vId    = editTripRow.vehicle_id || '__none__'
    const newGroup = trips.filter(t =>
      baseTripId(t.trip_id) === baseId && (t.vehicle_id || '__none__') === vId
    )
    if (newGroup.length === 0) {
      // Trip eliminato → chiudi sidebar
      setEditTripRow(null)
      setEditTripGroup(null)
    } else {
      setEditTripGroup(newGroup)
    }
  }, [trips])

  // Filtered + grouped
  const filtered = trips.filter(t =>
    (filterClass   === 'ALL' || t.transfer_class === filterClass) &&
    (filterStatus  === 'ALL' || t.status         === filterStatus) &&
    (filterVehicle === 'ALL' || t.vehicle_id     === filterVehicle)
  )
  const grouped = Object.values(
    filtered.reduce((acc, t) => {
      const key = baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__')
      if (!acc[key]) acc[key] = []
      acc[key].push(t)
      return acc
    }, {})
  ).sort((a, b) => {
    const aMin = Math.min(...a.map(r => r.pickup_min ?? r.call_min ?? 9999))
    const bMin = Math.min(...b.map(r => r.pickup_min ?? r.call_min ?? 9999))
    return aMin - bMin
  })

  const vehicles = [...new Set(trips.map(t => t.vehicle_id).filter(Boolean))].sort()
  const cnts = {
    A: trips.filter(t => t.transfer_class === 'ARRIVAL').length,
    D: trips.filter(t => t.transfer_class === 'DEPARTURE').length,
    S: trips.filter(t => t.transfer_class === 'STANDARD').length,
  }

  // ── Suggested trips for assign context ──
  const suggestedBaseIds = useMemo(() => {
    if (!assignCtx) return new Set()
    return new Set(
      trips.filter(t => {
        if (assignCtx.ts === 'IN')  return t.transfer_class === 'ARRIVAL'   && t.dropoff_id === assignCtx.hotel
        if (assignCtx.ts === 'OUT') return t.transfer_class === 'DEPARTURE' && t.pickup_id  === assignCtx.hotel
        return t.transfer_class === 'STANDARD' && t.pickup_id === assignCtx.hotel
      }).map(t => baseTripId(t.trip_id))
    )
  }, [trips, assignCtx])

  // ── Open new trip sidebar automatically when assignCtx is active ──
  useEffect(() => {
    if (!assignCtx || loading) return
    setNewTripOpen(true)
    setEditTripRow(null)
  }, [assignCtx, loading])

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', }}>

      {/* ── Header ── */}
      <Navbar currentPath="/dashboard/trips" />

      {/* ── Mobile toolbar (2 righe sticky) ── */}
      {isMobile && (
        <>
          <div style={{ position: 'sticky', top: '52px', zIndex: 22, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1, touchAction: 'manipulation' }}>◀</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '7px', padding: '6px 8px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
            <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1, touchAction: 'manipulation' }}>▶</button>
            <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8', touchAction: 'manipulation', whiteSpace: 'nowrap' }}>{t.today}</button>
          </div>
          <div style={{ position: 'sticky', top: '104px', zIndex: 21, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '6px 12px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['ALL', 'ARR', 'DEP', 'STD'].map(s => {
              const fullMap = { ARR: 'ARRIVAL', DEP: 'DEPARTURE', STD: 'STANDARD' }
              const full = fullMap[s] || s
              const active = filterClass === full || (s === 'ALL' && filterClass === 'ALL')
              const c = CLS[full]
              return <button key={s} onClick={() => setFilterClass(s === 'ALL' ? 'ALL' : full)} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', touchAction: 'manipulation', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>{s}</button>
            })}
            <div style={{ width: '1px', height: '20px', background: '#e2e8f0', flexShrink: 0 }} />
            {['ALL', 'PLANNED', 'DONE'].map(s => {
              const active = filterStatus === s
              const c = STS[s]
              return <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', touchAction: 'manipulation', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { ...c, borderColor: '#e2e8f0' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>{s}</button>
            })}
            {(filterClass !== 'ALL' || filterStatus !== 'ALL') && (
              <button onClick={() => { setFilterClass('ALL'); setFilterStatus('ALL') }} style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', touchAction: 'manipulation' }}>✕</button>
            )}
          </div>
        </>
      )}

      {/* ── Sub-toolbar (desktop) ── */}
      {!isMobile && <PageHeader
        left={
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setDate(isoAdd(date, -1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', fontSize: '13px', fontWeight: '700', color: '#0f172a', background: 'white', cursor: 'pointer' }} />
          <button onClick={() => setDate(isoAdd(date, 1))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '14px', color: '#374151', lineHeight: 1 }}>▶</button>
          <button onClick={() => setDate(isoToday())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>{t.today}</button>
          <div style={{ display: 'flex', gap: '5px', marginLeft: '8px' }}>
            {[
              { n: trips.length, l: 'total', c: '#374151', bg: '#f8fafc', b: '#e2e8f0' },
              { n: cnts.A, l: 'ARR', c: '#15803d', bg: '#dcfce7', b: '#86efac' },
              { n: cnts.D, l: 'DEP', c: '#c2410c', bg: '#fff7ed', b: '#fdba74' },
              { n: cnts.S, l: 'STD', c: '#1d4ed8', bg: '#eff6ff', b: '#93c5fd' },
            ].map(s => (
              <span key={s.l} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>{s.n} {s.l}</span>
            ))}
          </div>
        </div>}
        right={
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Class filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'ARR', 'DEP', 'STD'].map(s => {
              const fullMap = { ARR: 'ARRIVAL', DEP: 'DEPARTURE', STD: 'STANDARD' }
              const full   = fullMap[s] || s
              const active = filterClass === full || (s === 'ALL' && filterClass === 'ALL')
              const c      = CLS[full]
              return (
                <button key={s} onClick={() => setFilterClass(s === 'ALL' ? 'ALL' : full)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { background: c.bg, color: c.color, borderColor: c.border }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: '3px' }}>
            {['ALL', 'PLANNED', 'BUSY', 'DONE'].map(s => {
              const active = filterStatus === s
              const c = STS[s]
              return (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid', ...(active ? (s === 'ALL' ? { background: '#0f2340', color: 'white', borderColor: '#0f2340' } : { ...c, borderColor: '#e2e8f0' }) : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }) }}>
                  {s}
                </button>
              )
            })}
          </div>
          {vehicles.length > 0 && (
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#374151', background: 'white', cursor: 'pointer' }}>
              <option value="ALL">{t.allVehicles}</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {(filterClass !== 'ALL' || filterStatus !== 'ALL' || filterVehicle !== 'ALL') && (
            <button onClick={() => { setFilterClass('ALL'); setFilterStatus('ALL'); setFilterVehicle('ALL') }}
              style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>✕</button>
          )}
          <button onClick={() => { setNewTripOpen(true); setEditTripRow(null) }}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', whiteSpace: 'nowrap' }}>
            + New Trip
          </button>
        </div>}
      />}

      {/* ── Assign crew context banner (fuori dal marginRight div) ── */}
      {assignCtx && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 18px', background: '#fffbeb', borderBottom: '2px solid #f59e0b', fontSize: '12px', transition: 'margin-right 0.25s', marginRight: isMobile ? 0 : (anySidebarOpen ? `${SIDEBAR_W}px` : 0) }}>
          <span style={{ fontSize: '14px' }}>👤</span>
          <span style={{ fontWeight: '800', color: '#92400e' }}>{t.assigningLabel}</span>
          <span style={{ fontWeight: '700', color: '#0f172a' }}>{assignCtx.name}</span>
          <button onClick={() => setShowAssignInfo(true)} style={{ background: 'none', border: '1px solid #fde68a', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', color: '#92400e', fontWeight: '800', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
          <span style={{ color: '#d97706' }}>·</span>
          <span style={{ color: '#92400e' }}>Status: <strong>{assignCtx.ts}</strong></span>
          {suggestedBaseIds.size > 0
            ? <span style={{ color: '#15803d', fontWeight: '700' }}>⭐ {suggestedBaseIds.size} trip{suggestedBaseIds.size > 1 ? 's' : ''} suggested — click to open</span>
            : <span style={{ color: '#dc2626', fontWeight: '700' }}>{t.noCompatibleTrips}</span>
          }
          <button onClick={() => setAssignCtx(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #fde68a', color: '#92400e', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>{t.dismiss}</button>
        </div>
      )}

      {/* ── Column header sticky — fuori dal marginRight div, con proprio marginRight ── */}
      {!isMobile && trips.length > 0 && (
        <TableHeader
          columns={TRIP_COLS}
          style={{
            top: assignCtx ? '144px' : '104px',
            transition: 'margin-right 0.25s, top 0.15s',
            marginRight: anySidebarOpen ? `${SIDEBAR_W}px` : 0,
          }}
        />
      )}

      {/* ── Contenuto ── */}
      <div style={{ transition: 'margin-right 0.25s', marginRight: isMobile ? 0 : (anySidebarOpen ? `${SIDEBAR_W}px` : 0), paddingBottom: isMobile ? '80px' : 0 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>{t.loading}</div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
              {trips.length === 0 ? t.noTripsDate : t.noResultsFiltered}
            </div>
            {trips.length === 0 && (
              <button onClick={() => setNewTripOpen(true)} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '9px', padding: '9px 20px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', marginTop: '8px' }}>
                + New Trip
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'white' }}>
            {!PRODUCTION_ID && (
              <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', fontSize: '12px', borderBottom: '1px solid #fecaca' }}>
                ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
              </div>
            )}
            {grouped.map((group, i) => {
              const key = group[0].trip_id + i
              const props = {
                group,
                locations: locsMap,
                selected: !!editTripRow && baseTripId(editTripRow.trip_id) === baseTripId(group[0].trip_id),
                isSuggested: !!assignCtx && suggestedBaseIds.has(baseTripId(group[0].trip_id)),
                onClick: () => { setEditTripRow(group[0]); setEditTripGroup(group); setNewTripOpen(false) },
              }
              return isMobile ? <TripCardMobile key={key} {...props} /> : <TripRow key={key} {...props} />
            })}
          </div>
        )}
      </div>

      {/* ── FAB mobile ── */}
      {isMobile && !newTripOpen && !editTripRow && (
        <button onClick={() => { setNewTripOpen(true); setEditTripRow(null) }} style={{ position: 'fixed', bottom: '24px', right: '20px', width: '56px', height: '56px', borderRadius: '50%', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontSize: '24px', boxShadow: '0 4px 16px rgba(37,99,235,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', lineHeight: 1 }}>+</button>
      )}

      {/* ── Assign crew info modal ── */}
      {showAssignInfo && assignCtx && (
        <CrewInfoModal
          crew={{ id: assignCtx.id, full_name: assignCtx.name }}
          productionId={PRODUCTION_ID}
          locations={locsList}
          onClose={() => setShowAssignInfo(false)}
        />
      )}

      {/* ── CREATE sidebar ── */}
      <TripSidebar
        open={newTripOpen}
        onClose={() => setNewTripOpen(false)}
        defaultDate={date}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onSaved={() => { loadTrips(date) }}
        assignCtx={assignCtx}
        trips={trips}
      />

      {/* ── EDIT sidebar ── */}
      <EditTripSidebar
        open={!!editTripRow}
        initial={editTripRow}
        group={editTripGroup}
        locations={locsList}
        vehicles={vhcList}
        serviceTypes={stList}
        onClose={() => setEditTripRow(null)}
        onSaved={() => { setEditTripRow(null); loadTrips(date) }}
        onPaxChanged={() => loadTrips(date)}
      />
    </div>
  )
}

// ─── Export default con Suspense (richiesto da Next.js 16 per useSearchParams) ──
export default function TripsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>}>
      <TripsPageInner />
    </Suspense>
  )
}
