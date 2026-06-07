// ─── tripUtils.js — shared utilities for trips pages ────────
import { supabase } from './supabase'
import { getProductionId } from './production'

// ─── Constants ───────────────────────────────────────────────
export const SIDEBAR_W = 440

export const LOCATION_TYPES = [
  { value: 'hotel',         label: '🏨 Hotel',         prefix: 'H',    is_hub: false },
  { value: 'house',         label: '🏠 House',         prefix: 'HSE_', is_hub: false },
  { value: 'airport',       label: '✈️ Airport',       prefix: 'APT_', is_hub: true  },
  { value: 'train_station', label: '🚂 Train Station', prefix: 'STN_', is_hub: true  },
  { value: 'bus_station',   label: '🚌 Bus Station',   prefix: 'BST_', is_hub: false },
  { value: 'port',          label: '⚓ Port',           prefix: 'PRT_', is_hub: true  },
]

export const CLS = {
  ARRIVAL:   { bg: '#dcfce7', color: '#15803d', border: '#86efac', dot: '#16a34a' },
  DEPARTURE: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74', dot: '#ea580c' },
  STANDARD:  { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', dot: '#2563eb' },
}

export const STS = {
  PLANNED:   { bg: '#f1f5f9', color: '#475569' },
  BUSY:      { bg: '#fefce8', color: '#a16207' },
  DONE:      { bg: '#f0fdf4', color: '#15803d' },
  CANCELLED: { bg: '#fef2f2', color: '#dc2626' },
}

export const TRIP_COLS = [
  { key: 'time',      label: 'TIME',       width: '80px'  },
  { key: 'trip',      label: 'TRIP',       width: '130px' },
  { key: 'vehicle',   label: 'VEHICLE',    width: '180px' },
  { key: 'route',     label: 'ROUTE',      width: '320px' },
  { key: 'optimize',  label: '',           width: '80px'  },
  { key: 'pax',       label: 'PASSENGERS', width: '220px' },
  { key: 'pax_count', label: 'PAX',        width: '70px'  },
]

// ─── Utility functions ────────────────────────────────────────
export const pad2 = n => String(n).padStart(2, '0')

export function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}

export function timeStrToMin(str) {
  if (!str) return null
  const m = str.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}

export function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

export function isoAdd(d, n) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}

export function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtPax(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  const last  = parts[parts.length - 1]
  const first = parts[0]
  return `${last} ${first[0]}.`
}

export function isHub(id) { return /^(APT_|STN_|PRT_)/.test(id || '') }

export function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }

export function getClass(p, d) {
  if (isHub(p) && !isHub(d)) return 'ARRIVAL'
  if (!isHub(p) && isHub(d)) return 'DEPARTURE'
  return 'STANDARD'
}

export function calcTimes({ date, arrTimeMin, durationMin, transferClass, callMin }) {
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

export function isVehicleAvailableForDate(v, date) {
  if (!date || !v) return true
  if (v.available_from) {
    const dayBefore = isoAdd(v.available_from, -1)
    if (date < dayBefore) return false
  }
  if (v.available_to && date > v.available_to) return false
  return true
}

export async function checkVehicleAvail(vehicleId, date, startDt, endDt, excludeRowIds) {
  const PRODUCTION_ID = getProductionId()
  if (!vehicleId || !startDt || !endDt || !PRODUCTION_ID) return null
  const excl = Array.isArray(excludeRowIds) ? excludeRowIds.filter(Boolean) : (excludeRowIds ? [excludeRowIds] : [])
  let q = supabase.from('trips')
    .select('id,trip_id,start_dt,end_dt,arrived_at,status')
    .eq('production_id', PRODUCTION_ID)
    .eq('vehicle_id', vehicleId)
    .eq('date', date)
    .not('start_dt', 'is', null)
  if (excl.length) q = q.not('id', 'in', `(${excl.join(',')})`)
  const { data } = await q
  if (!data) return null
  const s = new Date(startDt), e = new Date(endDt)
  const conflict = data.find(t => {
    if (!t.start_dt || !t.end_dt) return false
    const effectiveEnd = (t.status === 'DONE' && t.arrived_at)
      ? new Date(t.arrived_at)
      : new Date(t.end_dt)
    return new Date(t.start_dt) < e && effectiveEnd > s
  })
  return conflict ? { available: false, conflictTripId: conflict.trip_id } : { available: true }
}
