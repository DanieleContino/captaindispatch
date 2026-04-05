'use client'

/**
 * /dashboard/rocket — Generazione automatica trip v2
 *
 * v2.1 (26 marzo 2026):
 *   - Multi-pickup / multi-dropoff: detection, visual badge, auto-split on confirm
 *   - Smart NO_VEHICLE warnings: crew names + hotel + nearby hotels + vehicles with room
 *   - enrichSuggestions: post-processing after runRocket
 *
 * v2.2 (28 marzo 2026) — TASK 3: Template Salvati (localStorage):
 *   - Auto-save automatico dell'ultima configurazione usata
 *   - Salvataggio con nome (es. "Monday Standard", "Airport Run")
 *   - Banner "Reload last run" in cima allo Step 1
 *   - UI per visualizzare, caricare ed eliminare i template
 *
 * v2.3 (28 marzo 2026) — TASK 4: Template Salvati (Supabase):
 *   - Nuova tabella `rocket_templates` (migrate-rocket-templates.sql)
 *   - API CRUD: /api/rocket/templates (GET, POST, PATCH, DELETE)
 *   - TemplatesPanel arricchito: sezione "Local" (localStorage) +
 *     sezione "Shared with team" (Supabase), visivamente separate
 *   - Rename inline dei template condivisi
 *
 * v2.4 (28 marzo 2026) — TASK 5: Memoria Storica & Suggerimenti:
 *   - Nuova API /api/rocket/suggestions (GET): query statistiche su trips storici,
 *     nessuna AI — solo frequenze e medie su trips + trip_passengers
 *   - Tipi di suggerimento: DEPT_CALL_TIME, DEPT_DEST, VEHICLE_HOTEL
 *   - Attivo solo dopo MIN_TOTAL_RUNS (10) run storici nella produzione
 *   - Componente SuggestionsHint nello Step 1: panel collassabile, non invasivo
 *   - Apply: applica la configurazione suggerita al volo (dept call time / dest / veicolo incluso)
 *   - Dismiss: nasconde il suggerimento (persistente in localStorage)
 *   - Re-fetch automatico al cambio della data selezionata
 *
 * v2.5 (28 marzo 2026) — TASK 6: Quick-Reason Esclusione Veicolo:
 *   - Selezione motivazione inline sulla card veicolo escluso (Fleet panel Step 1)
 *   - Ragioni predefinite: Out of service, Mechanical issue, Driver unavailable,
 *     Already assigned, Reserved + campo libero "Other"
 *   - Reason salvato nel run config (auto-save + templates)
 *   - Riepilogo veicoli esclusi con reason visibile in Step 3
 *
 * v2.6 (28 marzo 2026) — TASK 7: Tipo Servizio per Singola Destinazione:
 *   - Override del service type nel pannello "destinazioni per dipartimento" (Step 1)
 *   - Select service type per ogni riga dipartimento (sotto dest + call time)
 *   - Gerarchia effettiva: dept serviceType override > global serviceType
 *     (memorizzato in deptDestOverrides[dept].serviceType)
 *   - runRocket() include effectiveServiceType nel group key →
 *     trip separati per service type diverso anche se stessa dest/orario
 *   - handleConfirm() usa t.serviceType per ogni trip al posto del globale
 *   - TripCard: badge viola quando il service type del trip ≠ globale
 *   - Stats bar Step 2 e riepilogo Step 3: mostra "N service types" se misti
 *
 * v2.7 (28 marzo 2026) — TASK 2: Durata Stimata Trip nello Step 2:
 *   - TripCard header: badge ⏱ Xmin e chip "arr. HH:MM" sempre visibili,
 *     anche a card collassata
 *   - Subtitle semplificata: mostra solo driver · vehicle_type
 *     (timing rimosso dal testo per evitare duplicazione)
 *   - Multi-pickup: mostra la durata totale stimata (dal primo pickup
 *     all'arrivo) nel sotto-header, calcolata dal pickupMin al callMin
 */


import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase }  from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { useT } from '../../../lib/i18n'

import { getProductionId } from '../../../lib/production'

const LS_DEPT_KEY        = 'rocket_dept_config'
const LS_LAST_CONFIG_KEY = 'rocket_last_config'
const LS_TEMPLATES_KEY   = 'rocket_templates'

const SERVICE_TYPES = ['Hotel Run', 'Airport', 'Unit Move', 'Shuttle', 'Standard', 'Other']

// ─── TASK 6: Vehicle exclusion reasons ───────────────────────
// Preset reasons shown in the inline dropdown; "Other" triggers free-text entry.
const PRESET_REASONS = [
  'Out of service',
  'Mechanical issue',
  'Driver unavailable',
  'Already assigned',
  'Reserved',
]
// Sentinel value used in the <select> to activate the free-text input
const OTHER_REASON_SENTINEL = '__other__'

const DEPT_COLORS = [
  ['#dbeafe','#1d4ed8'], ['#dcfce7','#15803d'], ['#fef3c7','#92400e'],
  ['#fce7f3','#9d174d'], ['#ede9fe','#6d28d9'], ['#ffedd5','#c2410c'],
  ['#e0f2fe','#0369a1'], ['#d1fae5','#065f46'], ['#fef9c3','#a16207'],
]
const deptColor = (dept) => {
  if (!dept) return ['#f1f5f9', '#64748b']
  let h = 0; for (let i = 0; i < dept.length; i++) h = (h * 31 + dept.charCodeAt(i)) % DEPT_COLORS.length
  return DEPT_COLORS[h]
}

const pad2 = n => String(n).padStart(2, '0')
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }
function minToHHMM(min) {
  if (min == null) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}
function hhmmToMin(str) {
  if (!str) return null
  const [h, m] = str.split(':').map(Number)
  return isNaN(h) ? null : h * 60 + (m || 0)
}
function localDtFromMin(dateStr, minOfDay) {
  if (!dateStr || minOfDay == null) return null
  const [y, mo, dd] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, dd, Math.floor(minOfDay / 60), minOfDay % 60, 0, 0).toISOString()
}

// ─── localStorage — dept config ───────────────────────────────
function saveDeptConfig(cfg) { try { localStorage.setItem(LS_DEPT_KEY, JSON.stringify(cfg)) } catch {} }
function loadDeptConfig(locationIdSet) {
  try {
    const raw = localStorage.getItem(LS_DEPT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const valid = {}
    for (const [dept, cfg] of Object.entries(parsed)) {
      if (!cfg || typeof cfg !== 'object') continue
      const entry = {}
      if (cfg.destId && locationIdSet.has(cfg.destId)) entry.destId = cfg.destId
      if (typeof cfg.callMin === 'number' && cfg.callMin >= 0 && cfg.callMin < 1440) entry.callMin = cfg.callMin
      // TASK 7: persist per-dept service type override
      if (cfg.serviceType && SERVICE_TYPES.includes(cfg.serviceType)) entry.serviceType = cfg.serviceType
      if (Object.keys(entry).length) valid[dept] = entry
    }
    return valid
  } catch { return {} }
}

// ─── localStorage — template helpers ─────────────────────────
/**
 * Configurazione salvabile:
 *   destId, globalCallTime, serviceType, deptDestOverrides,
 *   excludedVehicleIds[], excludedVehicleReasons{}
 *
 * deptDestOverrides[dept] now also carries .serviceType (TASK 7).
 */
function buildRocketConfig(destId, globalCallTime, serviceType, deptDestOverrides, excludedVehicleIds, excludedVehicleReasons) {
  return {
    destId,
    globalCallTime,
    serviceType,
    deptDestOverrides,
    excludedVehicleIds: [...excludedVehicleIds],
    excludedVehicleReasons: { ...(excludedVehicleReasons || {}) },
    savedAt: new Date().toISOString(),
  }
}

function saveLastConfig(cfg) { try { localStorage.setItem(LS_LAST_CONFIG_KEY, JSON.stringify(cfg)) } catch {} }
function loadLastConfig()    { try { const r = localStorage.getItem(LS_LAST_CONFIG_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function loadSavedTemplates(){ try { const r = localStorage.getItem(LS_TEMPLATES_KEY);   return r ? JSON.parse(r) : [] }  catch { return [] } }
function writeSavedTemplates(tpls){ try { localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(tpls)) } catch {} }

// ─── localStorage — suggestions dismissal (TASK 5) ───────────
const DISMISSED_HINTS_KEY = 'rocket_dismissed_hints'
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function loadDismissedHints() {
  try { const r = localStorage.getItem(DISMISSED_HINTS_KEY); return r ? new Set(JSON.parse(r)) : new Set() } catch { return new Set() }
}
function saveDismissedHints(set) {
  try { localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify([...set])) } catch {}
}
/** Chiave univoca per ogni suggerimento — usata per il dismissal persistente */
function hintKey(s, weekday) {
  if (s.type === 'DEPT_CALL_TIME') return `DCT_${s.department}_${s.callMin}_${weekday}`
  if (s.type === 'DEPT_DEST')      return `DD_${s.department}_${s.destId}_${weekday}`
  if (s.type === 'VEHICLE_HOTEL')  return `VH_${s.vehicleId}_${s.hotelId}_${weekday}`
  return `${s.type}_${weekday}`
}

// ─── 🚀 Rocket Algorithm v2 ───────────────────────────────────
// TASK 7: added globalServiceType param; effectiveServiceType per crew/group;
// group key now includes service type so trips with different service types
// are correctly separated even if they share the same hotel/dest/callMin.
function runRocket({ crew, vehicles, routeMap, globalDestId, globalCallMin, globalServiceType, deptDestOverrides, crewCallOverrides, excludedCrewIds, excludedVehicleIds, runDate }) {
  function getEffective(c) {
    const deptCfg = (c.department && deptDestOverrides[c.department]) || {}
    return {
      effectiveDest:        deptCfg.destId  ?? globalDestId,
      effectiveCallMin:     crewCallOverrides[c.id] ?? deptCfg.callMin ?? globalCallMin,
      effectiveServiceType: deptCfg.serviceType ?? globalServiceType,
    }
  }
  const eligible = crew.filter(c =>
    !excludedCrewIds.has(c.id) && c.hotel_id &&
    (c.on_location === true || (c.arrival_date && c.arrival_date <= runDate && c.departure_date && c.departure_date >= runDate)) &&
    c.hotel_status === 'CONFIRMED' && !c.no_transport_needed
  )
  const groupMap = {}
  for (const c of eligible) {
    const { effectiveDest, effectiveCallMin, effectiveServiceType } = getEffective(c)
    if (!effectiveDest) continue
    const key = `${c.hotel_id}::${effectiveDest}::${effectiveCallMin}::${effectiveServiceType}`
    if (!groupMap[key]) groupMap[key] = { hotelId: c.hotel_id, destId: effectiveDest, callMin: effectiveCallMin, serviceType: effectiveServiceType, list: [] }
    groupMap[key].list.push(c)
  }
  const groups = Object.values(groupMap).sort((a, b) =>
    b.list.length !== a.list.length ? b.list.length - a.list.length : a.callMin - b.callMin
  )
  const pool = [...vehicles]
    .filter(v => v.active && !excludedVehicleIds.has(v.id))
    .sort((a, b) => (b.pax_suggested || b.capacity || 0) - (a.pax_suggested || a.capacity || 0))
  const draftTrips = [], suggestions = []
  let seq = 0
  for (const g of groups) {
    const dur       = routeMap[`${g.hotelId}||${g.destId}`] ?? 30
    const pickupMin = g.callMin - dur
    const sorted    = [...g.list].sort((a, b) =>
      (a.department || '').localeCompare(b.department || '') || a.full_name.localeCompare(b.full_name)
    )
    let remaining = [...sorted]
    while (remaining.length > 0) {
      if (!pool.length) {
        suggestions.push({ type: 'NO_VEHICLE', hotelId: g.hotelId, destId: g.destId, callMin: g.callMin,
          crew: remaining.map(c => c.full_name) })
        // Phantom trip so unassigned crew appear in Step 2 and can be moved to real vehicles
        draftTrips.push({ key: `u${seq++}`, vehicleId: null, vehicle: null, isUnassigned: true,
          hotelId: g.hotelId, destId: g.destId, callMin: g.callMin, pickupMin, durationMin: dur,
          serviceType: g.serviceType,
          crewList: remaining.map(c => ({ ...c, _effectiveDest: g.destId })) })
        remaining = []; break
      }
      const v = pool.shift()
      const capSug = v.pax_suggested || v.capacity || 6
      const capMax = Math.max(capSug, v.pax_max || capSug)
      const toAssign = remaining.splice(0, capSug)
      if (remaining.length > 0 && toAssign.length === capSug && capSug < capMax) {
        const addable = Math.min(capMax - capSug, remaining.length)
        if (addable > 0) suggestions.push({ type: 'CAN_ADD', tripKey: `t${seq}`, vehicleId: v.id, addable,
          names: remaining.slice(0, addable).map(c => c.full_name),
          msg: `${v.id} can carry ${addable} more (pax_max=${capMax}): ${remaining.slice(0, addable).map(c => c.full_name).join(', ')}` })
      }
      // Tag each crew member with their effectiveDest for multi-pickup/dropoff detection
      draftTrips.push({ key: `t${seq++}`, vehicleId: v.id, vehicle: v,
        hotelId: g.hotelId, destId: g.destId, callMin: g.callMin, pickupMin, durationMin: dur,
        serviceType: g.serviceType,
        crewList: toAssign.map(c => ({ ...c, _effectiveDest: g.destId })) })
    }
  }
  return { draftTrips, suggestions }
}

// ─── Cascade pickup calculator (DEPARTURE multi-pickup) ──────
/**
 * Per trip DEPARTURE con pickup multipli: un van raccoglie da N hotel
 * in sequenza prima di arrivare alla destinazione (hub/set).
 *
 * Gli hotel vengono ordinati per durata verso la dest (decrescente):
 * l'hotel più lontano viene raccolto per primo.
 *
 * Cascade:
 *   pickup(hotelUltimo)  = callMin − dur(hotelUltimo → dest)
 *   pickup(hotelPrev)    = pickup(hotelSucc) − dur(hotelPrev → hotelSucc)
 *
 * Fallback se la rotta hotel→hotel non è in routeMap:
 *   dur(A→B) ≈ max(5, dur(A→dest) − dur(B→dest))
 *
 * @param {string[]} hotelIds
 * @param {string}   destId
 * @param {number}   callMin    minuti da mezzanotte
 * @param {Object}   routeMap   { "fromId||toId": durationMin }
 * @returns {Object}            { [hotelId]: pickupMin }
 */
function calcCascadePickups(hotelIds, destId, callMin, routeMap) {
  if (!hotelIds || hotelIds.length === 0) return {}
  if (hotelIds.length === 1) {
    const dur = routeMap[`${hotelIds[0]}||${destId}`] ?? 30
    return { [hotelIds[0]]: callMin - dur }
  }

  // Ordina per durata verso dest, decrescente (più lontano = primo pickup)
  const sorted = [...hotelIds]
    .map(hId => ({ hId, durToDest: routeMap[`${hId}||${destId}`] ?? 30 }))
    .sort((a, b) => b.durToDest - a.durToDest)

  const n       = sorted.length
  const pickups = {}

  // Ultimo hotel (più vicino alla dest): pickup = callMin − dur(ultimo → dest)
  pickups[sorted[n - 1].hId] = callMin - sorted[n - 1].durToDest

  // Ogni hotel precedente: pickup = pickup(hotel successivo) − dur(questo → successivo)
  for (let i = n - 2; i >= 0; i--) {
    const curr   = sorted[i]
    const next   = sorted[i + 1]
    // Cerca hotel→hotel in routeMap; fallback: differenza nelle durate verso dest
    const h2hDur = routeMap[`${curr.hId}||${next.hId}`]
      ?? Math.max(5, curr.durToDest - next.durToDest)
    pickups[curr.hId] = pickups[next.hId] - h2hDur
  }

  return pickups
}

// ─── Smart suggestion enrichment ─────────────────────────────
function enrichSuggestions(suggestions, draftTrips, routeMap, locMap) {
  return suggestions.map(s => {
    if (s.type !== 'NO_VEHICLE') return s
    // Vehicles going to same dest with spare pax_max capacity
    const vehiclesWithRoom = draftTrips
      .filter(t => t.destId === s.destId && !t.isUnassigned && t.vehicle)
      .map(t => {
        const capMax = Math.max(t.vehicle.pax_max || 0, t.vehicle.pax_suggested || t.vehicle.capacity || 0)
        const room = capMax - t.crewList.length
        return room > 0 ? { vehicleId: t.vehicleId, driver: t.vehicle.driver_name, room } : null
      })
      .filter(Boolean)
    // Nearby hotels (route ≤ 15 min in routeMap)
    const nearbyTrips = []
    const seen = new Set()
    for (const trip of draftTrips) {
      if (trip.isUnassigned || !trip.vehicle) continue
      if (trip.hotelId === s.hotelId || seen.has(trip.hotelId)) continue
      seen.add(trip.hotelId)
      const dur = routeMap[`${s.hotelId}||${trip.hotelId}`] ?? routeMap[`${trip.hotelId}||${s.hotelId}`] ?? null
      if (dur !== null && dur <= 15) {
        nearbyTrips.push({ hotelId: trip.hotelId, hotelName: locMap[trip.hotelId] || trip.hotelId,
          duration: dur, vehicleId: trip.vehicleId, driver: trip.vehicle.driver_name })
      }
    }
    return { ...s, vehiclesWithRoom, nearbyTrips }
  })
}

// ─── Crew Quick-Edit Modal ────────────────────────────────────
function CrewQuickEditModal({ crew, deptDestOverrides, crewCallOverrides, excludedCrewIds, globalCallMin, globalDestId, locMap, onUpdate, onClose }) {
  const t = useT()
  const isExcluded = excludedCrewIds.has(crew.id)
  const deptCfg  = (crew.department && deptDestOverrides[crew.department]) || {}
  const deptBase = deptCfg.callMin ?? globalCallMin
  const initCall = crewCallOverrides[crew.id] ?? deptBase
  const effectDest = deptCfg.destId ?? globalDestId
  const [callMin, setCallMin] = useState(initCall)
  const [included, setIncluded] = useState(!isExcluded)
  const inputRef = useRef(null)
  const hasOverride = callMin !== deptBase
  const [bgC, txC] = deptColor(crew.department)
  function adjust(delta) { setCallMin(prev => Math.max(0, Math.min(1439, prev + delta))) }
  function handleDone() { onUpdate({ crewId: crew.id, callMin, included }); onClose() }
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '22px', width: '360px', maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>{crew.full_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {crew.department && <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', background: bgC, color: txC }}>{crew.department}</span>}
              <span style={{ fontSize: '11px', color: '#64748b' }}>{locMap[crew.hotel_id] || crew.hotel_id || '—'}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
        </div>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>{t.rocketIncludeInRun}</div>
          <button onClick={() => setIncluded(v => !v)}
            style={{ width: '100%', padding: '10px', borderRadius: '9px', border: `2px solid ${included ? '#16a34a' : '#e2e8f0'}`, background: included ? '#f0fdf4' : '#f8fafc', color: included ? '#15803d' : '#94a3b8', cursor: 'pointer', fontSize: '14px', fontWeight: '800', textAlign: 'center', transition: 'all 0.12s' }}>
            {included ? t.rocketIncluded : t.rocketExcluded}
          </button>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>{t.rocketCallTimeLabel}</div>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
            {[-15, -5].map(d => (
              <button key={d} onClick={() => adjust(d)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>{d}</button>
            ))}
            <input ref={inputRef} type="time" value={minToHHMM(callMin)}
              onChange={e => { const m = hhmmToMin(e.target.value); if (m !== null) setCallMin(m) }}
              style={{ flex: 2, padding: '8px', border: `2px solid ${hasOverride ? '#fbbf24' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '18px', fontWeight: '900', textAlign: 'center', background: hasOverride ? '#fffbeb' : 'white', color: '#0f172a' }} />
            {[5, 15].map(d => (
              <button key={d} onClick={() => adjust(d)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>+{d}</button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
            <span>Base: <strong style={{ color: '#374151' }}>{minToHHMM(deptBase)}</strong> ({crew.department ? `${crew.department} dept` : 'global'})</span>
            {hasOverride && <button onClick={() => setCallMin(deptBase)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '11px', fontWeight: '700', padding: 0 }}>↩ Reset</button>}
          </div>
        </div>
        <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', fontSize: '11px', color: '#64748b', marginBottom: '18px' }}>
          → <strong style={{ color: '#374151' }}>{locMap[effectDest] || effectDest || '—'}</strong>
          {deptCfg.destId && <span style={{ color: '#7c3aed', marginLeft: '4px' }}>(dept override)</span>}
        </div>
        <button onClick={handleDone} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#0f2340', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '800' }}>{t.rocketDoneBtn}</button>
      </div>
    </div>
  )
}

// ─── Move Crew Modal (Step 2) ─────────────────────────────────
function MoveCrewModal({ crewMember, currentTripKey, trips, locMap, onMove, onClose }) {
  const t = useT()
  const [target, setTarget] = useState('')
  const otherTrips = trips.filter(trip => trip.key !== currentTripKey && !trip.isUnassigned)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '22px', width: '420px', maxWidth: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>{t.rocketMovePassenger}</div>
        <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: '700', marginBottom: '4px' }}>{crewMember.full_name}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>{crewMember.department || '—'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
          {otherTrips.map(trip => {
            const cap = trip.vehicle.pax_suggested || trip.vehicle.capacity || 6
            const pax = trip.crewList.length
            const over = pax >= cap
            return (
              <div key={trip.key} onClick={() => setTarget(trip.key)}
                style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === trip.key ? '#2563eb' : '#e2e8f0'}`, background: target === trip.key ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', fontFamily: 'monospace' }}>{trip.vehicleId}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: over ? '#b91c1c' : '#15803d' }}>{pax}/{cap} pax {over ? '⚠' : ''}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {minToHHMM(trip.pickupMin)} · {trip.vehicle.driver_name || t.rocketNoDriver} · {locMap[trip.destId] || trip.destId}
                </div>
              </div>
            )
          })}
          <div onClick={() => setTarget('__remove__')}
            style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${target === '__remove__' ? '#dc2626' : '#e2e8f0'}`, background: target === '__remove__' ? '#fef2f2' : 'white', cursor: 'pointer' }}>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#dc2626' }}>{t.rocketRemoveFromAll}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>{t.rocketCancelBtn}</button>
          <button onClick={() => { if (target) { onMove(crewMember, currentTripKey, target); onClose() } }} disabled={!target}
            style={{ flex: 2, padding: '10px', borderRadius: '9px', border: 'none', background: target ? '#2563eb' : '#e2e8f0', color: target ? 'white' : '#94a3b8', cursor: target ? 'pointer' : 'default', fontSize: '13px', fontWeight: '800' }}>
            {t.rocketMoveBtn}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Trip Card (Step 2) ───────────────────────────────────────
// TASK 7: added globalServiceType prop — shows a badge when trip's service
// type differs from the global default.
function TripCard({ trip, locMap, routeMap, allTrips, onMoveCrew, globalServiceType }) {
  const t = useT()
  const [open, setOpen] = useState(true)
  const isUnassigned = !!trip.isUnassigned
  const pax    = trip.crewList.length
  const capSug = (!isUnassigned && (trip.vehicle?.pax_suggested || trip.vehicle?.capacity)) || 6
  const capMax = Math.max(capSug, (!isUnassigned && trip.vehicle?.pax_max) || capSug)
  const over   = pax > capSug
  const atMax  = pax >= capMax
  const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
  const icon   = isUnassigned ? '⚠️' : (TYPE_ICON[trip.vehicle?.vehicle_type] || '🚐')
  const paxColor = isUnassigned ? '#b91c1c' : atMax ? '#b91c1c' : over ? '#d97706' : pax === capSug ? '#15803d' : '#64748b'
  const paxBg    = isUnassigned ? '#fee2e2' : atMax ? '#fee2e2' : over ? '#fffbeb' : pax === capSug ? '#dcfce7' : '#f1f5f9'

  // Multi-pickup / multi-dropoff detection
  const pickupHotels  = [...new Set(trip.crewList.map(c => c.hotel_id).filter(Boolean))]
  const dropoffDests  = [...new Set(trip.crewList.map(c => c._effectiveDest || trip.destId).filter(Boolean))]
  const isMultiPickup  = pickupHotels.length > 1
  const isMultiDropoff = dropoffDests.length > 1
  const isMixed        = isMultiPickup || isMultiDropoff

  // Cascade pickup times per multi-pickup DEPARTURE (tutti gli hotel → stessa dest)
  const allHotelsSameDest = isMultiPickup && pickupHotels.every(hId => {
    const hCrew = trip.crewList.filter(c => c.hotel_id === hId)
    return (hCrew[0]?._effectiveDest || trip.destId) === trip.destId
  })
  const cascadePickups = (isMultiPickup && allHotelsSameDest && routeMap)
    ? calcCascadePickups(pickupHotels, trip.destId, trip.callMin, routeMap)
    : {}

  // TASK 7: does this trip have a non-global service type?
  const hasServiceTypeOverride = trip.serviceType && trip.serviceType !== globalServiceType

  // TASK 2: total estimated duration badge value
  // For multi-pickup cascade: time from the earliest pickup to callMin
  // For single route: use durationMin directly
  const totalDurationMin = (() => {
    if (isMultiPickup && allHotelsSameDest && Object.keys(cascadePickups).length > 0) {
      const earliestPickup = Math.min(...Object.values(cascadePickups))
      return trip.callMin - earliestPickup
    }
    return trip.durationMin
  })()

  return (
    <div style={{ background: 'white', border: `1.5px solid ${isUnassigned ? '#fecaca' : isMixed ? '#fde68a' : '#e2e8f0'}`, borderRadius: '13px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: isUnassigned ? '#fef2f2' : isMixed ? '#fffbeb' : '#fafafa', borderBottom: open ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {isUnassigned
                ? <span style={{ fontWeight: '900', fontSize: '13px', color: '#b91c1c' }}>{t.rocketNoVehicleRow}</span>
                : <span style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '15px', color: '#0f172a' }}>{trip.vehicleId}</span>
              }
              {isMultiPickup && <span style={{ fontSize: '9px', fontWeight: '800', color: '#d97706', background: '#fffbeb', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>🔀 MULTI-PKP</span>}
              {isMultiDropoff && <span style={{ fontSize: '9px', fontWeight: '800', color: '#7c3aed', background: '#fdf4ff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #c4b5fd' }}>🔀 MULTI-DRP</span>}
              {/* TASK 7: service type override badge in card header */}
              {hasServiceTypeOverride && <span style={{ fontSize: '9px', fontWeight: '800', color: '#7c3aed', background: '#fdf4ff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #c4b5fd' }}>📋 {trip.serviceType}</span>}
            </div>
            {/* TASK 2: subtitle — driver + vehicle type only; timing moved to dedicated chips */}
            <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isUnassigned
                ? `${locMap[trip.hotelId] || trip.hotelId} → ${locMap[trip.destId] || trip.destId} · ${minToHHMM(trip.callMin)} call`
                : `${trip.vehicle?.driver_name || t.rocketNoDriver} · ${trip.vehicle?.vehicle_type || ''}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* TASK 2: duration + arrival chips — always visible, even when card is collapsed */}
          {!isUnassigned && totalDurationMin != null && (
            <span style={{ fontSize: '11px', color: '#374151', fontWeight: '700', background: '#f1f5f9', padding: '2px 7px', borderRadius: '5px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
              ⏱ {totalDurationMin} min
            </span>
          )}
          {!isUnassigned && (
            <span style={{ fontSize: '11px', color: '#065f46', fontWeight: '800', background: '#dcfce7', padding: '2px 7px', borderRadius: '5px', border: '1px solid #86efac', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
              arr. {minToHHMM(trip.callMin)}
            </span>
          )}
          <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', background: paxBg, color: paxColor, border: `1px solid ${paxColor}20` }}>
            {pax}/{capSug}{capMax > capSug && <span style={{ color: '#94a3b8', fontWeight: '600' }}> (max {capMax})</span>}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>
      {open && (
        <>
          {/* Route + timing */}
          <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
            {!isMixed ? (
              <>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '2px' }}>
                  <span style={{ color: '#64748b' }}>{locMap[trip.hotelId] || trip.hotelId}</span>
                  <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span>
                  <span style={{ color: '#0f172a' }}>{locMap[trip.destId] || trip.destId}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>🕐 Pickup {minToHHMM(trip.pickupMin)}</span>
                  <span>⏱ {trip.durationMin}min</span>
                  <span>🏁 Arrive {minToHHMM(trip.callMin)}</span>
                  {/* TASK 7: inline service type label in route section */}
                  {hasServiceTypeOverride && (
                    <span style={{ fontWeight: '800', color: '#7c3aed', background: '#fdf4ff', border: '1px solid #c4b5fd', padding: '1px 6px', borderRadius: '5px', fontSize: '10px' }}>
                      {trip.serviceType}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '5px', fontStyle: 'italic' }}>
                  {t.rocketAutoSplit} · {t.rocketAllArrive} {minToHHMM(trip.callMin)}
                </div>
                {/* Multi-pickup breakdown — pickup calcolati in cascata */}
                {isMultiPickup && pickupHotels.map(hId => {
                  const hCrew   = trip.crewList.filter(c => c.hotel_id === hId)
                  const hDest   = hCrew[0]?._effectiveDest || trip.destId
                  const hDur    = (routeMap && routeMap[`${hId}||${hDest}`]) ?? 30
                  // Usa pickup cascade se disponibile, altrimenti fallback parallelo
                  const hPk     = cascadePickups[hId] ?? (trip.callMin - hDur)
                  return (
                    <div key={hId} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locMap[hId] || hId}</span>
                      <span style={{ color: '#94a3b8' }}>→ {locMap[hDest] || hDest}</span>
                      <span style={{ color: '#374151', fontWeight: '700', whiteSpace: 'nowrap' }}>🕐 {minToHHMM(hPk)} · {hCrew.length} pax</span>
                    </div>
                  )
                })}
                {/* Multi-dropoff breakdown (single pickup) */}
                {isMultiDropoff && !isMultiPickup && dropoffDests.map(dId => {
                  const dCrew = trip.crewList.filter(c => (c._effectiveDest || trip.destId) === dId)
                  const dDur  = (routeMap && routeMap[`${trip.hotelId}||${dId}`]) ?? 30
                  return (
                    <div key={dId} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#64748b' }}>{locMap[trip.hotelId] || trip.hotelId}</span>
                      <span style={{ color: '#94a3b8' }}>→</span>
                      <span style={{ color: '#0f172a', fontWeight: '700', flex: 1 }}>{locMap[dId] || dId}</span>
                      <span style={{ color: '#374151', fontWeight: '700', whiteSpace: 'nowrap' }}>⏱ {dDur}min · {dCrew.length} pax</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          {/* Crew list */}
          {pax === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>{t.rocketNoPassengers}</div>
          ) : (
            <div>
              {trip.crewList.map(c => {
                const [bgC, textC] = deptColor(c.department)
                const cDest = c._effectiveDest || trip.destId
                const destMismatch = cDest !== trip.destId
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #f8fafc', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: bgC, color: textC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '10px', flexShrink: 0 }}>
                        {(c.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {c.department || '—'}
                          {destMismatch && <span style={{ color: '#7c3aed', marginLeft: '4px' }}>→ {locMap[cDest] || cDest}</span>}
                          {c.hotel_id !== trip.hotelId && <span style={{ color: '#d97706', marginLeft: '4px' }}>from {locMap[c.hotel_id] || c.hotel_id}</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => onMoveCrew(c, trip.key)} style={{ flexShrink: 0, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                      {t.rocketMoveBtn}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Location Select ──────────────────────────────────────────
function LocSelect({ value, onChange, locations, placeholder = '— Select —', style }) {
  return (
    <select value={value} onChange={onChange}
      style={{ padding: '7px 10px', border: `1px solid ${!value ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '7px', fontSize: '12px', fontWeight: '600', background: 'white', color: value ? '#0f172a' : '#94a3b8', boxSizing: 'border-box', ...style }}>
      <option value="">{placeholder}</option>
      <optgroup label="Locations / Sets">
        {locations.filter(l => !l.is_hub).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </optgroup>
      <optgroup label="Hubs / Airports">
        {locations.filter(l => l.is_hub).map(l => <option key={l.id} value={l.id}>✈ {l.name}</option>)}
      </optgroup>
    </select>
  )
}

// ─── Last Run Banner (TASK 3) ─────────────────────────────────
function LastRunBanner({ lastConfig, locMap, onLoad, onDismiss }) {
  const t = useT()
  function cfgSummary(cfg) {
    const dest    = locMap[cfg.destId] || cfg.destId || '—'
    const time    = cfg.globalCallTime || '—'
    const type    = cfg.serviceType || ''
    const depts   = Object.keys(cfg.deptDestOverrides || {}).length
    const exclVeh = (cfg.excludedVehicleIds || []).length
    let s = `${dest} · ${time}`
    if (type) s += ` · ${type}`
    if (depts)   s += ` · ${depts} dept override${depts > 1 ? 's' : ''}`
    if (exclVeh) s += ` · ${exclVeh} vehicle${exclVeh > 1 ? 's' : ''} excluded`
    return s
  }
  function fmtDate(isoStr) {
    if (!isoStr) return ''
    try { const d = new Date(isoStr); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` } catch { return '' }
  }
  return (
    <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1.5px solid #93c5fd', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '22px', flexShrink: 0 }}>🕐</span>
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontWeight: '800', fontSize: '13px', color: '#1e40af', marginBottom: '2px' }}>{t.rocketReloadLast}</div>
        <div style={{ fontSize: '11px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cfgSummary(lastConfig)}
          {lastConfig.savedAt && <span style={{ color: '#93c5fd', marginLeft: '8px' }}>{fmtDate(lastConfig.savedAt)}</span>}
        </div>
      </div>
      <button onClick={onLoad}
        style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
        ↩ Load
      </button>
      <button onClick={onDismiss}
        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #93c5fd', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
        Dismiss
      </button>
    </div>
  )
}

// ─── Templates Panel Modal (TASK 3 + TASK 4) ─────────────────
function TemplatesPanel({ currentConfig, locMap, onLoad, onClose }) {
  const t = useT()
  // ── Local (localStorage) state ────────────────────────────
  const [localTemplates, setLocalTemplates] = useState(() => loadSavedTemplates())
  const [newName,        setNewName]        = useState('')
  const [localSaveMsg,   setLocalSaveMsg]   = useState('')

  // ── Shared (Supabase) state ───────────────────────────────
  const [sharedTemplates, setSharedTemplates] = useState([])
  const [sharedLoading,   setSharedLoading]   = useState(true)
  const [sharedError,     setSharedError]     = useState(null)
  const [sharedSaveMsg,   setSharedSaveMsg]   = useState('')
  const [sharedSaving,    setSharedSaving]    = useState(false)
  // Inline rename state: { id, name }
  const [renamingId,  setRenamingId]  = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  // ── Helpers ───────────────────────────────────────────────
  function cfgSummary(cfg) {
    if (!cfg) return '—'
    const dest    = locMap[cfg.destId] || cfg.destId || '—'
    const time    = cfg.globalCallTime || '—'
    const type    = cfg.serviceType || ''
    const depts   = Object.keys(cfg.deptDestOverrides || {}).length
    const exclVeh = (cfg.excludedVehicleIds || []).length
    let s = `${dest} · ${time}`
    if (type) s += ` · ${type}`
    if (depts)   s += ` · ${depts} dept override${depts > 1 ? 's' : ''}`
    if (exclVeh) s += ` · ${exclVeh} vehicle${exclVeh > 1 ? 's' : ''} excluded`
    return s
  }
  function fmtDate(isoStr) {
    if (!isoStr) return ''
    try { const d = new Date(isoStr); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` } catch { return '' }
  }

  // ── Local helpers ─────────────────────────────────────────
  function handleSaveLocal() {
    const name = newName.trim()
    if (!name) return
    const updated = [...localTemplates, { id: `tpl_${Date.now()}`, name, config: currentConfig }]
    setLocalTemplates(updated)
    writeSavedTemplates(updated)
    setNewName('')
    setLocalSaveMsg(name)
    setTimeout(() => setLocalSaveMsg(''), 2500)
  }
  function handleDeleteLocal(id) {
    const updated = localTemplates.filter(t => t.id !== id)
    setLocalTemplates(updated)
    writeSavedTemplates(updated)
  }

  // ── Supabase helpers ──────────────────────────────────────
  async function fetchSharedTemplates() {
    setSharedLoading(true); setSharedError(null)
    try {
      const res = await fetch('/api/rocket/templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load shared templates')
      setSharedTemplates(data.templates || [])
    } catch (e) {
      setSharedError(e.message)
    } finally {
      setSharedLoading(false)
    }
  }
  async function handleSaveShared() {
    const name = newName.trim()
    if (!name || sharedSaving) return
    setSharedSaving(true); setSharedError(null)
    try {
      const res = await fetch('/api/rocket/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config_json: currentConfig }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSharedTemplates(prev => [data.template, ...prev])
      setNewName('')
      setSharedSaveMsg(name)
      setTimeout(() => setSharedSaveMsg(''), 2500)
    } catch (e) {
      setSharedError(e.message)
    } finally {
      setSharedSaving(false)
    }
  }
  async function handleDeleteShared(id) {
    setSharedError(null)
    try {
      const res = await fetch('/api/rocket/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete') }
      setSharedTemplates(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      setSharedError(e.message)
    }
  }
  async function handleRenameShared(id) {
    const name = renameValue.trim()
    if (!name || renameSaving) return
    setRenameSaving(true); setSharedError(null)
    try {
      const res = await fetch('/api/rocket/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rename')
      setSharedTemplates(prev => prev.map(t => t.id === id ? { ...t, name: data.template.name } : t))
      setRenamingId(null)
    } catch (e) {
      setSharedError(e.message)
    } finally {
      setRenameSaving(false)
    }
  }

  useEffect(() => { fetchSharedTemplates() }, [])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') { if (renamingId) { setRenamingId(null) } else { onClose() } } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, renamingId])

  const canSave = !!newName.trim()

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '560px', maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ fontWeight: '900', fontSize: '16px', color: '#0f172a' }}>{t.rocketTemplatesBtn}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
        </div>

        {/* ── Save current config ── */}
        <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '11px', border: '1px solid #e2e8f0', marginBottom: '18px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>{t.rocketSaveCurrentConfig}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfgSummary(currentConfig)}</div>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSaveLocal() }}
            placeholder='Template name (e.g. "Monday Standard")'
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#0f172a', background: 'white', boxSizing: 'border-box', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Save locally */}
            <button onClick={handleSaveLocal} disabled={!canSave}
              style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${canSave ? '#bfdbfe' : '#e2e8f0'}`, background: canSave ? '#eff6ff' : '#f8fafc', color: canSave ? '#1d4ed8' : '#94a3b8', cursor: canSave ? 'pointer' : 'default', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
              {t.rocketSaveLocally}
            </button>
            {/* Share with team (Supabase) */}
            <button onClick={handleSaveShared} disabled={!canSave || sharedSaving}
              style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${canSave ? '#a5f3c9' : '#e2e8f0'}`, background: canSave ? '#f0fdf4' : '#f8fafc', color: canSave ? '#15803d' : '#94a3b8', cursor: canSave && !sharedSaving ? 'pointer' : 'default', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
              {sharedSaving ? t.saving : t.rocketShareTeam}
            </button>
          </div>
          {(localSaveMsg || sharedSaveMsg) && (
            <div style={{ marginTop: '7px', fontSize: '11px', color: '#15803d', fontWeight: '700' }}>
              {localSaveMsg ? `✓ "${localSaveMsg}" saved locally!` : `✓ "${sharedSaveMsg}" shared with team!`}
            </div>
          )}
        </div>

        {/* ── Scrollable list area ── */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* ☁️ Shared with team (Supabase) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: '900', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.rocketSharedTemplates}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t.rocketVisibleAllCaptains}</span>
              {!sharedLoading && (
                <button onClick={fetchSharedTemplates} title="Reload"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#94a3b8', padding: 0 }}>↻</button>
              )}
            </div>
            {sharedError && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '11px', color: '#dc2626', marginBottom: '8px' }}>
                ⚠ {sharedError}
                <button onClick={() => setSharedError(null)} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '11px' }}>×</button>
              </div>
            )}
            {sharedLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>⏳ Loading shared templates…</div>
            ) : sharedTemplates.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>☁️</div>
                <div style={{ fontSize: '12px', fontWeight: '600' }}>{t.rocketNoSharedTpl}</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>{t.rocketSaveCurrentConfig} → {t.rocketShareTeam}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {sharedTemplates.map(t => (
                  <div key={t.id}
                    style={{ padding: '11px 13px', border: '1.5px solid #d1fae5', borderRadius: '10px', background: '#f0fdf4' }}>
                    {renamingId === t.id ? (
                      /* ── Inline rename ── */
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input autoFocus type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameShared(t.id); if (e.key === 'Escape') setRenamingId(null) }}
                          style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #34d399', borderRadius: '6px', fontSize: '13px', fontWeight: '700', color: '#0f172a', outline: 'none' }} />
                        <button onClick={() => handleRenameShared(t.id)} disabled={renameSaving || !renameValue.trim()}
                          style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: '#059669', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                          {renameSaving ? '…' : '✓'}
                        </button>
                        <button onClick={() => setRenamingId(null)}
                          style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ fontWeight: '800', fontSize: '13px', color: '#064e3b', flex: 1 }}>{t.name}</div>
                          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                            <button onClick={() => { onLoad(t.config_json); onClose() }}
                              style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: '#059669', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>
                              ↩ Load
                            </button>
                            <button onClick={() => { setRenamingId(t.id); setRenameValue(t.name) }} title="Rename"
                              style={{ padding: '4px 7px', borderRadius: '6px', border: '1px solid #a7f3d0', background: 'white', color: '#059669', cursor: 'pointer', fontSize: '11px' }}>✏</button>
                            <button onClick={() => handleDeleteShared(t.id)}
                              style={{ padding: '4px 7px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✕</button>
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', color: '#065f46' }}>{cfgSummary(t.config_json)}</div>
                        {t.created_at && <div style={{ fontSize: '10px', color: '#6ee7b7', marginTop: '2px' }}>Shared {fmtDate(t.created_at)}</div>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 💾 Local (this device) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.rocketLocalTemplates}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t.rocketStoredOnDevice}</span>
            </div>
            {localTemplates.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>💾</div>
                <div style={{ fontSize: '12px', fontWeight: '600' }}>{t.rocketNoLocalTpl}</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>{t.rocketSaveLocally}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {localTemplates.map(t => (
                  <div key={t.id}
                    style={{ padding: '11px 13px', border: '1.5px solid #bfdbfe', borderRadius: '10px', background: '#eff6ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ fontWeight: '800', fontSize: '13px', color: '#1e3a8a', flex: 1 }}>{t.name}</div>
                      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                        <button onClick={() => { onLoad(t.config); onClose() }}
                          style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>
                          ↩ Load
                        </button>
                        <button onClick={() => handleDeleteLocal(t.id)}
                          style={{ padding: '4px 7px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: '#1e40af' }}>{cfgSummary(t.config)}</div>
                    {t.config?.savedAt && <div style={{ fontSize: '10px', color: '#93c5fd', marginTop: '2px' }}>Saved {fmtDate(t.config.savedAt)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Suggestions Hint Panel (TASK 5) ─────────────────────────
/**
 * Panel non-invasivo nello Step 1 che mostra suggerimenti storici.
 * Ogni hint ha un pulsante "Apply" (applica la config suggerita)
 * e "✕" (dismiss, persiste in localStorage).
 *
 * Props:
 *   suggestions  — array di oggetti da /api/rocket/suggestions
 *   weekday      — 0–6 (per la chiave di dismissal e il testo)
 *   locMap       — { id: name } per hotel e destinazioni
 *   onApply(s)   — callback con il suggerimento da applicare
 *   onDismiss(k) — callback con la chiave da marcare come dismissed
 */
function SuggestionsHint({ suggestions, weekday, locMap, onApply, onDismiss }) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  if (!suggestions || suggestions.length === 0) return null
  const dayName = WEEKDAY_NAMES[weekday] || 'Today'

  return (
    <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1.5px solid #fcd34d', borderRadius: '12px', marginBottom: '18px', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div onClick={() => setCollapsed(c => !c)}
        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: '18px', flexShrink: 0 }}>💡</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: '800', fontSize: '13px', color: '#92400e' }}>
            {t.rocketHistoricalSugg}
          </span>
          <span style={{ fontSize: '11px', color: '#b45309', marginLeft: '8px' }}>
            {suggestions.length} hint{suggestions.length !== 1 ? 's' : ''} {t.rocketBasedOnPast} {dayName} {t.rocketRuns}
          </span>
        </div>
        <span style={{ color: '#b45309', fontSize: '11px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {/* ── Hint rows ── */}
      {!collapsed && (
        <div style={{ borderTop: '1px solid #fde68a', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {suggestions.map(s => {
            const key = hintKey(s, weekday)

            if (s.type === 'DEPT_CALL_TIME') {
              const [bg, tx] = deptColor(s.department)
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'white', borderRadius: '9px', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#d97706', textTransform: 'uppercase', flexShrink: 0 }}>⏰ Timing</span>
                  <div style={{ flex: 1, fontSize: '12px', color: '#374151', lineHeight: 1.5, minWidth: '200px' }}>
                    On <strong>{dayName}s</strong>,{' '}
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: bg, color: tx }}>{s.department}</span>
                    {' '}usually calls at{' '}
                    <strong style={{ color: '#0f172a' }}>{minToHHMM(s.callMin)}</strong>
                    <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>({s.count}/{s.total} · {s.consistency}%)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button onClick={() => onApply(s)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                      Apply
                    </button>
                    <button onClick={() => onDismiss(key)}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fde68a', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: '11px' }}
                      title="Dismiss this hint">✕</button>
                  </div>
                </div>
              )
            }

            if (s.type === 'DEPT_DEST') {
              const [bg, tx] = deptColor(s.department)
              const destName = locMap[s.destId] || s.destId || '?'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'white', borderRadius: '9px', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#d97706', textTransform: 'uppercase', flexShrink: 0 }}>📍 Route</span>
                  <div style={{ flex: 1, fontSize: '12px', color: '#374151', lineHeight: 1.5, minWidth: '200px' }}>
                    On <strong>{dayName}s</strong>,{' '}
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: bg, color: tx }}>{s.department}</span>
                    {' '}usually goes to{' '}
                    <strong style={{ color: '#0f172a' }}>{destName}</strong>
                    <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>({s.count}/{s.total} · {s.consistency}%)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button onClick={() => onApply(s)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                      Apply
                    </button>
                    <button onClick={() => onDismiss(key)}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fde68a', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: '11px' }}
                      title="Dismiss this hint">✕</button>
                  </div>
                </div>
              )
            }

            if (s.type === 'VEHICLE_HOTEL') {
              const hotelName = locMap[s.hotelId] || s.hotelId || '?'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'white', borderRadius: '9px', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#d97706', textTransform: 'uppercase', flexShrink: 0 }}>🚐 Vehicle</span>
                  <div style={{ flex: 1, fontSize: '12px', color: '#374151', lineHeight: 1.5, minWidth: '200px' }}>
                    <strong style={{ fontFamily: 'monospace' }}>{s.vehicleId}</strong>
                    {' '}usually picks up from{' '}
                    <strong style={{ color: '#0f172a' }}>{hotelName}</strong>
                    {' '}on {dayName}s
                    <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>({s.count}/{s.total} · {s.consistency}%)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button onClick={() => onApply(s)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '800', whiteSpace: 'nowrap' }}
                      title="Ensure this vehicle is included">
                      {t.rocketIncludeBtn}
                    </button>
                    <button onClick={() => onDismiss(key)}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fde68a', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: '11px' }}
                      title="Dismiss this hint">✕</button>
                  </div>
                </div>
              )
            }

            return null
          })}

          {/* Footnote */}
          <div style={{ fontSize: '10px', color: '#b45309', opacity: 0.8, textAlign: 'right', paddingTop: '2px' }}>
            Based on historical data · suggestions are advisory only
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Crew ineligibility helper (S37) ─────────────────────────
/**
 * Returns the reason a crew member cannot be assigned to a trip, or null if eligible.
 * 'NTN'    — no_transport_needed = true
 * 'ABSENT' — not on_location AND outside arrival/departure date range for runDate
 */
function getCrewIneligibleReason(c, runDate) {
  if (c.no_transport_needed) return 'NTN'
  // Se le date sono impostate, usarle sempre (on_location è un badge visivo, non un gate).
  // on_location viene usato solo come fallback quando non ci sono date.
  let present
  if (c.arrival_date && c.departure_date) {
    present = c.arrival_date <= runDate && c.departure_date >= runDate
  } else {
    present = c.on_location === true
  }
  if (!present) return 'ABSENT'
  return null
}

// ─── Main Page ─────────────────────────────────────────────────
export default function RocketPage() {
  const router = useRouter()
  const t = useT()
  const PRODUCTION_ID = getProductionId()
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const [allCrew,   setAllCrew]   = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [locations, setLocations] = useState([])
  const [routeMap,  setRouteMap]  = useState({})

  const [step,               setStep]               = useState(1)
  const [date,               setDate]               = useState(isoToday())
  const [destId,             setDestId]             = useState('')
  const [globalCallTime,     setGlobalCallTime]     = useState('07:00')
  const [serviceType,        setServiceType]        = useState('Hotel Run')
  const [crewCallOverrides,  setCrewCallOverrides]  = useState({})
  const [excludedCrewIds,    setExcludedCrewIds]    = useState(new Set())
  const [excludedVehicleIds, setExcludedVehicleIds] = useState(new Set())
  const [deptDestOverrides,  setDeptDestOverrides]  = useState({})

  const [crewSearch,    setCrewSearch]    = useState('')
  const [expandedDepts, setExpandedDepts] = useState(new Set())
  const [editingCrew,   setEditingCrew]   = useState(null)

  const [draftTrips,  setDraftTrips]  = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [moveTarget,  setMoveTarget]  = useState(null)
  const [createdCount, setCreatedCount] = useState(0)
  const [createError,  setCreateError]  = useState(null)

  // ── TASK 3: Template state ────────────────────────────────
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [lastConfig,     setLastConfig]     = useState(null)
  const [showLastBanner, setShowLastBanner] = useState(false)

  // ── TASK 5: Historical suggestions state ─────────────────
  const [historicalSuggestions, setHistoricalSuggestions] = useState([])

  // ── TASK 6: Vehicle exclusion reasons ────────────────────
  // { vehicleId: 'reason string' } — set when vehicle is excluded
  const [excludedVehicleReasons, setExcludedVehicleReasons] = useState({})


  // Ref to prevent auto-saving initial state before user makes changes
  const configSavableRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login'); else setUser(user)
    })
  }, [router])

  useEffect(() => { saveDeptConfig(deptDestOverrides) }, [deptDestOverrides])

  // Mark config as savable after loading finishes (avoid overwriting last run on mount)
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => { configSavableRef.current = true }, 300)
      return () => clearTimeout(t)
    }
  }, [loading])

  // Auto-save config whenever the user changes any Step 1 setting
  useEffect(() => {
    if (!configSavableRef.current) return
    saveLastConfig(buildRocketConfig(destId, globalCallTime, serviceType, deptDestOverrides, excludedVehicleIds, excludedVehicleReasons))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destId, globalCallTime, serviceType, deptDestOverrides, excludedVehicleIds])

  const loadData = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const [cR, vR, lR, rR] = await Promise.all([
      supabase.from('crew').select('id,full_name,department,hotel_id,hotel_status,no_transport_needed,on_location,arrival_date,departure_date')
        .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED')
        .order('department').order('full_name'),
      supabase.from('vehicles').select('id,vehicle_type,capacity,pax_suggested,pax_max,driver_name,sign_code,active')
        .eq('production_id', PRODUCTION_ID).eq('active', true).order('vehicle_type').order('id'),
      supabase.from('locations').select('id,name,is_hub').eq('production_id', PRODUCTION_ID).order('name'),
      supabase.from('routes').select('from_id,to_id,duration_min').eq('production_id', PRODUCTION_ID),
    ])
    const crewData = cR.data || []
    setAllCrew(crewData)
    setVehicles(vR.data || [])
    setLocations(lR.data || [])
    const rm = {}
    for (const r of (rR.data || [])) rm[`${r.from_id}||${r.to_id}`] = r.duration_min
    setRouteMap(rm)
    const sets = (lR.data || []).filter(l => !l.is_hub)
    if (sets.length && !destId) setDestId(sets[0].id)
    const locationIdSet = new Set((lR.data || []).map(l => l.id))
    setDeptDestOverrides(loadDeptConfig(locationIdSet))

    // ── TASK 3: load "last config" for the banner ─────────
    const lc = loadLastConfig()
    if (lc && lc.destId && locationIdSet.has(lc.destId)) {
      setLastConfig(lc)
      setShowLastBanner(true)
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (user) loadData() }, [user, loadData])

  // ── TASK 5: fetch historical suggestions when date changes ──
  useEffect(() => {
    if (!user || loading) return
    async function fetchSuggestions() {
      try {
        const [y, mo, dd] = date.split('-').map(Number)
        const weekday = new Date(y, mo - 1, dd).getDay()
        const res = await fetch(`/api/rocket/suggestions?weekday=${weekday}`)
        if (!res.ok) return
        const data = await res.json()
        // Filter out suggestions the user has previously dismissed
        const dismissed = loadDismissedHints()
        const active = (data.suggestions || []).filter(s => !dismissed.has(hintKey(s, weekday)))
        setHistoricalSuggestions(active)
      } catch { /* silently ignore — suggestions are advisory */ }
    }
    fetchSuggestions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, date, loading])

  const locMap             = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const globalCallMin      = hhmmToMin(globalCallTime) ?? 420
  const allCrewWithHotel   = allCrew.filter(c => c.hotel_id)
  const eligibleCrew       = allCrewWithHotel.filter(c => !getCrewIneligibleReason(c, date))
  const selectedCrew       = eligibleCrew.filter(c => !excludedCrewIds.has(c.id))
  const activeVehicles     = vehicles.filter(v => v.active)
  const includedVehicles   = activeVehicles.filter(v => !excludedVehicleIds.has(v.id))
  const departments        = [...new Set(allCrewWithHotel.map(c => c.department).filter(Boolean))].sort()
  const ineligibleCount    = allCrewWithHotel.filter(c => !!getCrewIneligibleReason(c, date)).length

  const searchLower = crewSearch.toLowerCase().trim()
  const filteredAllCrew = searchLower
    ? allCrewWithHotel.filter(c => c.full_name.toLowerCase().includes(searchLower) || (c.department || '').toLowerCase().includes(searchLower))
    : allCrewWithHotel
  const crewByDept = {}
  for (const c of filteredAllCrew) {
    const key = c.department || '__nodept__'
    if (!crewByDept[key]) crewByDept[key] = []
    crewByDept[key].push(c)
  }
  const accordionKeys = [...departments.filter(d => crewByDept[d]), ...(crewByDept['__nodept__'] ? ['__nodept__'] : [])]
  const isDeptExpanded = key => searchLower ? true : expandedDepts.has(key)
  const toggleDept = key => setExpandedDepts(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })

  // ── TASK 3: apply a saved config to all Step 1 state ────
  function applyConfig(cfg) {
    if (!cfg) return
    if (cfg.destId)          setDestId(cfg.destId)
    if (cfg.globalCallTime)  setGlobalCallTime(cfg.globalCallTime)
    if (cfg.serviceType)     setServiceType(cfg.serviceType)
    if (cfg.deptDestOverrides) {
      setDeptDestOverrides(cfg.deptDestOverrides)
      saveDeptConfig(cfg.deptDestOverrides)
    }
    setExcludedVehicleIds(new Set(cfg.excludedVehicleIds || []))
    // ── TASK 6: restore exclusion reasons from saved config ──
    setExcludedVehicleReasons(cfg.excludedVehicleReasons || {})
    setShowLastBanner(false)
  }

  // ── TASK 7: setDeptOverride now handles 'serviceType' field ──
  // Hierarchy stored in deptDestOverrides[dept].serviceType
  function setDeptOverride(dept, field, value) {
    setDeptDestOverrides(prev => {
      const existing = prev[dept] || {}
      const newServiceType = field === 'serviceType' ? (value || undefined) : existing.serviceType
      const newCfg = {
        destId:  field === 'destId'  ? value : (existing.destId  ?? destId),
        callMin: field === 'callMin' ? value : (existing.callMin ?? globalCallMin),
        ...(newServiceType && { serviceType: newServiceType }),
      }
      const isDefault = newCfg.destId === destId && newCfg.callMin === globalCallMin && !newCfg.serviceType
      if (isDefault) { const next = { ...prev }; delete next[dept]; return next }
      return { ...prev, [dept]: newCfg }
    })
  }

  function handleCrewModalUpdate({ crewId, callMin, included }) {
    setExcludedCrewIds(prev => { const next = new Set(prev); included ? next.delete(crewId) : next.add(crewId); return next })
    const c = allCrew.find(x => x.id === crewId)
    const deptBase = (c?.department && deptDestOverrides[c.department]?.callMin) ?? globalCallMin
    if (callMin === deptBase) { setCrewCallOverrides(prev => { const n = { ...prev }; delete n[crewId]; return n }) }
    else { setCrewCallOverrides(prev => ({ ...prev, [crewId]: callMin })) }
  }

  function getCrewEffectiveDest(c) { return ((c.department && deptDestOverrides[c.department]?.destId) ?? destId) }

  // ── TASK 5: Apply / Dismiss suggestion handlers ──────────
  function handleApplySuggestion(s) {
    if (s.type === 'DEPT_CALL_TIME') {
      setDeptOverride(s.department, 'callMin', s.callMin)
    } else if (s.type === 'DEPT_DEST') {
      setDeptOverride(s.department, 'destId', s.destId)
    } else if (s.type === 'VEHICLE_HOTEL') {
      setExcludedVehicleIds(prev => {
        const next = new Set(prev)
        next.delete(s.vehicleId)
        return next
      })
    }
    const [y, mo, dd] = date.split('-').map(Number)
    const weekday = new Date(y, mo - 1, dd).getDay()
    handleDismissSuggestion(hintKey(s, weekday))
  }

  function handleDismissSuggestion(key) {
    const dismissed = loadDismissedHints()
    dismissed.add(key)
    saveDismissedHints(dismissed)
    setHistoricalSuggestions(prev => {
      const [y, mo, dd] = date.split('-').map(Number)
      const weekday = new Date(y, mo - 1, dd).getDay()
      return prev.filter(s => hintKey(s, weekday) !== key)
    })
  }

  // TASK 7: pass globalServiceType so runRocket can compute effectiveServiceType per group
  function handleLaunch() {
    if (!destId || selectedCrew.length === 0 || includedVehicles.length === 0) return
    const result = runRocket({ crew: allCrew, vehicles, routeMap, globalDestId: destId, globalCallMin, globalServiceType: serviceType, deptDestOverrides, crewCallOverrides, excludedCrewIds, excludedVehicleIds, runDate: date })
    const enriched = enrichSuggestions(result.suggestions, result.draftTrips, routeMap, locMap)
    setDraftTrips(result.draftTrips)
    setSuggestions(enriched)
    setCreateError(null)
    setStep(2)
  }

  function handleMoveCrew(crewMember, fromKey, toKey) {
    setDraftTrips(prev => {
      const next = prev.map(t => ({ ...t, crewList: [...t.crewList] }))
      const from = next.find(t => t.key === fromKey)
      if (from) from.crewList = from.crewList.filter(c => c.id !== crewMember.id)
      if (toKey !== '__remove__') {
        const to = next.find(t => t.key === toKey)
        if (to && !to.crewList.find(c => c.id === crewMember.id)) to.crewList = [...to.crewList, crewMember]
      }
      return next
    })
  }

  async function handleConfirm() {
    setSaving(true); setCreateError(null)
    const mm = pad2(new Date().getMonth() + 1), dd2 = pad2(new Date().getDate())
    const prefix = `R_${mm}${dd2}`
    let created = 0, seqNum = 1

    for (const t of draftTrips) {
      if (!t.crewList.length || t.isUnassigned) continue
      // Group crew by (hotel_id, _effectiveDest) for auto-split
      const groups = {}
      for (const c of t.crewList) {
        const hId = c.hotel_id || t.hotelId
        const dId = c._effectiveDest || t.destId
        const key = `${hId}::${dId}`
        if (!groups[key]) groups[key] = { hotelId: hId, destId: dId, crew: [] }
        groups[key].crew.push(c)
      }
      const groupArr  = Object.values(groups)
      const useSuffix = groupArr.length > 1

      // ── Cascade pickup per multi-pickup DEPARTURE (N hotel → stessa dest) ──
      const groupsByDest = {}
      for (const g of groupArr) {
        if (!groupsByDest[g.destId]) groupsByDest[g.destId] = []
        groupsByDest[g.destId].push(g)
      }
      const cascadeHotelPickups = {}
      for (const [dId, dGroups] of Object.entries(groupsByDest)) {
        if (dGroups.length > 1) {
          const picks = calcCascadePickups(dGroups.map(g => g.hotelId), dId, t.callMin, routeMap)
          Object.assign(cascadeHotelPickups, picks)
        }
      }

      for (let gi = 0; gi < groupArr.length; gi++) {
        const g      = groupArr[gi]
        const tripId = `${prefix}_${pad2(seqNum)}${useSuffix ? String.fromCharCode(65 + gi) : ''}`
        const dur    = routeMap[`${g.hotelId}||${g.destId}`] ?? t.durationMin ?? 30
        const pkMin  = cascadeHotelPickups[g.hotelId] ?? (t.callMin - dur)
        const durActual = t.callMin - pkMin
        const row = {
          production_id: PRODUCTION_ID, trip_id: tripId, date,
          vehicle_id: t.vehicleId, driver_name: t.vehicle.driver_name || null,
          sign_code: t.vehicle.sign_code || null, capacity: t.vehicle.capacity || null,
          pickup_id: g.hotelId, dropoff_id: g.destId,
          call_min: t.callMin, pickup_min: pkMin, duration_min: durActual,
          start_dt: localDtFromMin(date, pkMin), end_dt: localDtFromMin(date, t.callMin),
          // TASK 7: use per-trip serviceType (dept override wins over global)
          service_type: t.serviceType || serviceType, pax_count: g.crew.length, status: 'PLANNED',
        }
        const { data: ins, error: insErr } = await supabase.from('trips').insert(row).select('id').single()
        if (insErr) { setCreateError(`Trip ${tripId}: ${insErr.message}`); setSaving(false); return }
        if (ins?.id && g.crew.length > 0) {
          const { error: pErr } = await supabase.from('trip_passengers').insert(
            g.crew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
          )
          if (pErr) { setCreateError(pErr.message); setSaving(false); return }
        }
        created++
      }
      seqNum++
    }
    setCreatedCount(created); setSaving(false); setStep(3)
  }

  if (!user) return <div style={{ minHeight: '100vh', background: '#0f2340', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>

  const totalPax      = draftTrips.reduce((s, t) => s + t.crewList.length, 0)
  const activeTrips   = draftTrips.filter(t => t.crewList.length > 0).length
  const uniqueDestIds = [...new Set(draftTrips.map(t => t.destId))]
  // TASK 7: compute service type label — "N service types" when mixed
  const uniqueServiceTypes = [...new Set(draftTrips.map(t => t.serviceType).filter(Boolean))]
  const serviceTypeLabel   = uniqueServiceTypes.length <= 1 ? serviceType : `${uniqueServiceTypes.length} service types`
  const destLabel          = uniqueDestIds.length === 1 ? (locMap[uniqueDestIds[0]] || uniqueDestIds[0])
    : uniqueDestIds.length > 1 ? `${uniqueDestIds.length} destinations` : (locMap[destId] || destId || '—')
  const canLaunch     = !!destId && selectedCrew.length > 0 && includedVehicles.length > 0
  const stepLabel     = ['', t.rocketStepSetup, t.rocketStepPreview, t.rocketStepDone]
  // TASK 7: activeDeptOverrides also counts service type overrides
  const activeDeptOverrides = Object.keys(deptDestOverrides).filter(d =>
    deptDestOverrides[d]?.destId !== destId ||
    deptDestOverrides[d]?.callMin !== globalCallMin ||
    deptDestOverrides[d]?.serviceType != null
  ).length

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Top nav ── */}
      <Navbar currentPath="/dashboard/rocket" />

      {/* ── Sub-toolbar ── */}
      <PageHeader
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>🚀</span>
            <span style={{ fontWeight: '900', fontSize: '17px', color: '#0f172a' }}>Rocket</span>
            <span style={{ fontWeight: '400', fontSize: '13px', color: '#94a3b8' }}>{t.rocketSubtitle}</span>
            <div style={{ display: 'flex', gap: '3px', marginLeft: '8px' }}>
              {[1, 2, 3].map(n => {
                const active = step === n, done = step > n
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                    background: active ? '#0f2340' : done ? '#dcfce7' : '#f1f5f9', color: active ? 'white' : done ? '#15803d' : '#94a3b8',
                    border: `1px solid ${active ? '#0f2340' : done ? '#86efac' : '#e2e8f0'}` }}>
                    <span>{done ? '✓' : n}</span><span>{stepLabel[n]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        }
        right={
          <>
            {step === 1 && !loading && (
              <button onClick={handleLaunch} disabled={!canLaunch}
                style={{ background: canLaunch ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#e2e8f0', color: canLaunch ? 'white' : '#94a3b8',
                  border: 'none', borderRadius: '9px', padding: '8px 20px', fontSize: '14px', fontWeight: '900',
                  cursor: canLaunch ? 'pointer' : 'default', letterSpacing: '-0.3px',
                  boxShadow: canLaunch ? '0 3px 12px rgba(37,99,235,0.35)' : 'none' }}>
                🚀 Launch Rocket ({selectedCrew.length} crew · {includedVehicles.length} vehicle{includedVehicles.length !== 1 ? 's' : ''})
              </button>
            )}
            {step === 2 && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{activeTrips} trip{activeTrips !== 1 ? 's' : ''} · {totalPax} pax</span>
                <button onClick={() => setStep(1)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151' }}>{t.rocketEditSetup}</button>
                <button onClick={handleConfirm} disabled={saving || activeTrips === 0}
                  style={{ background: (saving || activeTrips === 0) ? '#94a3b8' : '#16a34a', color: 'white', border: 'none', borderRadius: '9px', padding: '8px 20px',
                    cursor: (saving || activeTrips === 0) ? 'wait' : 'pointer', fontSize: '13px', fontWeight: '800',
                    boxShadow: (saving || activeTrips === 0) ? 'none' : '0 3px 12px rgba(22,163,74,0.35)' }}>
                  {saving ? t.rocketCreating : `✅ Confirm ${activeTrips} trip${activeTrips !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </>
        }
      />

      {/* ── Body ── */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 24px' }}>
        {!PRODUCTION_ID && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> not set in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚀</div>
            <div style={{ fontWeight: '600' }}>{t.rocketLoadingData}</div>
          </div>
        ) : (
          <>
            {/* ════ STEP 1 — 2-column layout ════ */}
            {step === 1 && (
              <>
                {/* ── TASK 3: Last run banner ── */}
                {showLastBanner && lastConfig && (
                  <LastRunBanner
                    lastConfig={lastConfig}
                    locMap={locMap}
                    onLoad={() => applyConfig(lastConfig)}
                    onDismiss={() => setShowLastBanner(false)}
                  />
                )}

                {/* ── TASK 5: Historical suggestions panel ── */}
                {historicalSuggestions.length > 0 && (() => {
                  const [y, mo, dd] = date.split('-').map(Number)
                  const weekday = new Date(y, mo - 1, dd).getDay()
                  return (
                    <SuggestionsHint
                      suggestions={historicalSuggestions}
                      weekday={weekday}
                      locMap={locMap}
                      onApply={handleApplySuggestion}
                      onDismiss={handleDismissSuggestion}
                    />
                  )
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: '5fr 8fr', gap: '20px', alignItems: 'start' }}>

                  {/* LEFT COLUMN */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* ⚙️ Config */}
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '16px 20px' }}>
                      {/* Header row with Templates button */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>{t.rocketTripConfig}</span>
                        <button onClick={() => setShowTemplates(true)}
                          style={{ padding: '4px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', cursor: 'pointer', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {t.rocketTemplatesBtn}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t.rocketDateLabel}</label>
                          <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '700', boxSizing: 'border-box', color: '#0f172a' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t.rocketDefaultDest}</label>
                          <LocSelect value={destId} onChange={e => setDestId(e.target.value)} locations={locations}
                            placeholder="— Select destination —" style={{ width: '100%', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t.rocketDefaultCall}</label>
                          <input type="time" value={globalCallTime} onChange={e => setGlobalCallTime(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '16px', fontWeight: '900', boxSizing: 'border-box', textAlign: 'center', color: '#0f172a', background: '#fffbeb' }} />
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{t.rocketPickupHint}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t.rocketServiceTypeLabel}</label>
                          <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', boxSizing: 'border-box', background: 'white', color: '#0f172a' }}>
                            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 🎯 Dept Destinations */}
                    {departments.length > 0 && (
                      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>{t.rocketDeptDest}</span>
                            {activeDeptOverrides > 0 && (
                              <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#ede9fe', color: '#6d28d9' }}>
                                {activeDeptOverrides} override{activeDeptOverrides > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <button onClick={() => setDeptDestOverrides({})}
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{t.rocketResetAll}</button>
                        </div>
                        {departments.map(dept => {
                          const deptCfg     = deptDestOverrides[dept] || {}
                          const deptDestId  = deptCfg.destId  ?? destId
                          const deptCallMin = deptCfg.callMin ?? globalCallMin
                          // TASK 7: hasOverride includes service type override
                          const hasOverride = deptCfg.destId != null || (deptCfg.callMin != null && deptCfg.callMin !== globalCallMin) || deptCfg.serviceType != null
                          const crewCount   = selectedCrew.filter(c => c.department === dept).length
                          const [bgC, txC]  = deptColor(dept)
                          return (
                            <div key={dept} style={{ padding: '8px 16px', borderBottom: '1px solid #f8fafc', background: hasOverride ? '#fdfbff' : 'white' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', background: bgC, color: txC, flexShrink: 0 }}>{dept}</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{crewCount} crew</span>
                                {hasOverride && (
                                  <button onClick={() => setDeptDestOverrides(prev => { const n = { ...prev }; delete n[dept]; return n })}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: 0 }}>↩</button>
                                )}
                              </div>
                              {/* Dest + Call Time row */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '6px' }}>
                                <LocSelect value={deptDestId} onChange={e => setDeptOverride(dept, 'destId', e.target.value)}
                                  locations={locations} placeholder="same as global"
                                  style={{ fontSize: '11px', border: `1px solid ${deptCfg.destId && deptCfg.destId !== destId ? '#c4b5fd' : '#e2e8f0'}`, background: deptCfg.destId && deptCfg.destId !== destId ? '#fdf4ff' : 'white' }} />
                                <input type="time" value={minToHHMM(deptCallMin)}
                                  onChange={e => { const m = hhmmToMin(e.target.value); if (m !== null) setDeptOverride(dept, 'callMin', m) }}
                                  style={{ padding: '6px 6px', border: `1px solid ${deptCfg.callMin != null && deptCfg.callMin !== globalCallMin ? '#fde68a' : '#e2e8f0'}`,
                                    borderRadius: '7px', fontSize: '12px', fontWeight: '800',
                                    background: deptCfg.callMin != null && deptCfg.callMin !== globalCallMin ? '#fffbeb' : 'white',
                                    textAlign: 'center', color: '#0f172a', boxSizing: 'border-box' }} />
                              </div>
                              {/* TASK 7: Service type override row */}
                              <div style={{ marginTop: '5px' }}>
                                <select value={deptCfg.serviceType || ''}
                                  onChange={e => setDeptOverride(dept, 'serviceType', e.target.value)}
                                  style={{ width: '100%', padding: '4px 6px', border: `1px solid ${deptCfg.serviceType ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: '7px', fontSize: '11px', fontWeight: deptCfg.serviceType ? '700' : '400', background: deptCfg.serviceType ? '#fdf4ff' : 'white', color: deptCfg.serviceType ? '#7c3aed' : '#94a3b8', boxSizing: 'border-box', cursor: 'pointer' }}>
                                  <option value="">{t.rocketSameServiceType}</option>
                                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ padding: '6px 16px', background: '#f8fafc', fontSize: '10px', color: '#94a3b8' }}>{t.rocketDeptHint}</div>
                      </div>
                    )}

                    {/* 🚐 Fleet */}
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>🚐 Fleet — {includedVehicles.length}/{activeVehicles.length} included</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => setExcludedVehicleIds(new Set())}
                            style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8' }}>✓ All</button>
                          <button onClick={() => setExcludedVehicleIds(new Set(activeVehicles.map(v => v.id)))}
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>✗ None</button>
                        </div>
                      </div>
                      {activeVehicles.length === 0 ? (
                        <div style={{ padding: '14px 16px', fontSize: '12px', color: '#dc2626' }}>{t.rocketNoVehicles} <a href="/dashboard/vehicles" style={{ color: '#2563eb' }}>{t.rocketAddVehicles}</a></div>
                      ) : activeVehicles.map(v => {
                        const excluded = excludedVehicleIds.has(v.id)
                        const reason   = excludedVehicleReasons[v.id] || ''
                        const isPreset  = PRESET_REASONS.includes(reason)
                        const selectVal = !reason ? '' : isPreset ? reason : OTHER_REASON_SENTINEL
                        const sug = v.pax_suggested || v.capacity || '?'
                        const max = v.pax_max || v.capacity || '?'
                        const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
                        return (
                          <div key={v.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            {/* ── Main vehicle row ── */}
                            <div
                              onClick={() => {
                                setExcludedVehicleIds(prev => {
                                  const next = new Set(prev)
                                  if (excluded) {
                                    next.delete(v.id)
                                    setExcludedVehicleReasons(prev2 => { const n = { ...prev2 }; delete n[v.id]; return n })
                                  } else {
                                    next.add(v.id)
                                  }
                                  return next
                                })
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', cursor: 'pointer', background: excluded ? '#fef9f0' : 'white', opacity: excluded ? 0.85 : 1, transition: 'all 0.12s' }}>
                              <input type="checkbox" checked={!excluded} readOnly style={{ width: '14px', height: '14px', accentColor: '#2563eb', flexShrink: 0, cursor: 'pointer' }} />
                              <span style={{ fontSize: '14px', flexShrink: 0 }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '900', fontSize: '12px', color: '#0f172a', minWidth: '60px' }}>{v.id}</span>
                              <span style={{ fontSize: '11px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.driver_name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{t.rocketNoDriver}</span>}</span>
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{sug}/{max}</span>
                              {excluded && (
                                <span style={{ fontSize: '9px', fontWeight: '800', color: reason ? '#dc2626' : '#94a3b8', textTransform: 'uppercase', flexShrink: 0 }}>
                                  OUT{reason && ' ✓'}
                                </span>
                              )}
                            </div>
                            {/* ── TASK 6: Inline reason selector (shown only when excluded) ── */}
                            {excluded && (
                              <div onClick={e => e.stopPropagation()}
                                style={{ padding: '6px 16px 10px 44px', background: '#fff7ed', borderTop: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', color: '#ea580c', fontWeight: '800', flexShrink: 0 }}>{t.rocketWhyExcluded}</span>
                                <select
                                  value={selectVal}
                                  onChange={e => {
                                    const val = e.target.value
                                    if (val === OTHER_REASON_SENTINEL) {
                                      setExcludedVehicleReasons(prev => ({ ...prev, [v.id]: '' }))
                                    } else {
                                      setExcludedVehicleReasons(prev => ({ ...prev, [v.id]: val }))
                                    }
                                  }}
                                  style={{ padding: '3px 6px', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '11px', background: 'white', color: '#374151', cursor: 'pointer', outline: 'none' }}>
                                  <option value="">— Select —</option>
                                  {PRESET_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                  <option value={OTHER_REASON_SENTINEL}>Other…</option>
                                </select>
                                {selectVal === OTHER_REASON_SENTINEL && (
                                  <input
                                    autoFocus
                                    type="text"
                                    value={reason}
                                    onChange={e => setExcludedVehicleReasons(prev => ({ ...prev, [v.id]: e.target.value }))}
                                    placeholder="Describe reason…"
                                    style={{ flex: 1, minWidth: '120px', padding: '3px 8px', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '11px', outline: 'none', background: 'white', color: '#0f172a' }}
                                  />
                                )}
                                {reason && selectVal !== OTHER_REASON_SENTINEL && (
                                  <span style={{ fontSize: '10px', background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '1px 7px', borderRadius: '999px', fontWeight: '700' }}>
                                    {reason}
                                  </span>
                                )}
                                {reason && (
                                  <button
                                    onClick={() => setExcludedVehicleReasons(prev => { const n = { ...prev }; delete n[v.id]; return n })}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#94a3b8', padding: '0 2px', lineHeight: 1 }}
                                    title="Clear reason">✕</button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}

                    </div>
                  </div>{/* END LEFT COLUMN */}

                  {/* RIGHT COLUMN — CREW */}
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div>
                          <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{t.rocketCrewLabel}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>{selectedCrew.length} {t.rocketCrewSelected} / {eligibleCrew.length} {t.rocketCrewEligible}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => setExcludedCrewIds(new Set())} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8' }}>✓ All</button>
                          <button onClick={() => setExcludedCrewIds(new Set(eligibleCrew.map(c => c.id)))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>✗ None</button>
                          <button onClick={() => setCrewCallOverrides({})} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{t.rocketResetTimes}</button>
                          <button onClick={() => setExpandedDepts(new Set(accordionKeys))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{t.rocketExpandAll}</button>
                          <button onClick={() => setExpandedDepts(new Set())} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{t.rocketCollapse}</button>
                        </div>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                        <input type="text" value={crewSearch} onChange={e => setCrewSearch(e.target.value)}
                          placeholder="Search crew by name or department…"
                          style={{ width: '100%', padding: '8px 32px 8px 32px', border: `1px solid ${crewSearch ? '#2563eb' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', background: crewSearch ? '#eff6ff' : 'white', color: '#0f172a' }} />
                        {crewSearch && <button onClick={() => setCrewSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#94a3b8', lineHeight: 1, padding: 0 }}>×</button>}
                      </div>
                      {crewSearch && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: filteredAllCrew.length === 0 ? '#dc2626' : '#2563eb', fontWeight: '600' }}>
                          {filteredAllCrew.length === 0 ? t.rocketNoCrewFound : `${filteredAllCrew.length} match${filteredAllCrew.length !== 1 ? 'es' : ''}`}
                        </div>
                      )}
                      {ineligibleCount > 0 && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '3px solid #94a3b8', borderRadius: '7px', fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
                          👤 <strong style={{ color: '#374151' }}>{ineligibleCount} crew</strong> non assegnabili (<span style={{ color: '#dc2626', fontWeight: '700' }}>🚫 NTN</span> o <span style={{ color: '#64748b', fontWeight: '700' }}>🏠 Assenti</span>) — visibili in lista.
                        </div>
                      )}
                    </div>

                    <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px' }}>
                      {allCrewWithHotel.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>{t.rocketNoEligibleCrew}</div>
                          <div style={{ fontSize: '12px' }}>{t.rocketNoEligibleHint}</div>
                        </div>
                      ) : accordionKeys.length === 0 && crewSearch ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                          <div style={{ fontWeight: '600' }}>No results for &quot;{crewSearch}&quot;</div>
                        </div>
                      ) : accordionKeys.map(deptKey => {
                        const deptCrew  = crewByDept[deptKey] || []
                        const deptLabel = deptKey === '__nodept__' ? t.rocketNoDept : deptKey
                        const expanded  = isDeptExpanded(deptKey)
                        const [bgC, txC] = deptColor(deptKey === '__nodept__' ? null : deptKey)
                        const deptCfg   = deptKey !== '__nodept__' ? (deptDestOverrides[deptKey] || {}) : {}
                        const deptEffDest = deptCfg.destId ?? destId
                        const deptEffCall = deptCfg.callMin ?? globalCallMin
                        const eligibleInDept  = deptCrew.filter(c => !getCrewIneligibleReason(c, date)).length
                        const selectedInDept  = deptCrew.filter(c => !excludedCrewIds.has(c.id) && !getCrewIneligibleReason(c, date)).length
                        // TASK 7: hasOvr now includes service type
                        const hasOvr = deptCfg.destId != null || (deptCfg.callMin != null && deptCfg.callMin !== globalCallMin) || deptCfg.serviceType != null
                        return (
                          <div key={deptKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <div onClick={() => toggleDept(deptKey)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', cursor: 'pointer', background: hasOvr ? '#fdfbff' : '#f8fafc', userSelect: 'none' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: bgC, color: txC, flexShrink: 0 }}>{deptLabel}</span>
                              <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600', flexShrink: 0 }}>{selectedInDept}/{eligibleInDept}</span>
                              {/* TASK 7: show service type override in accordion summary */}
                              <span style={{ fontSize: '11px', color: hasOvr ? '#7c3aed' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                → {locMap[deptEffDest] || deptEffDest || '?'} · {minToHHMM(deptEffCall)}{deptCfg.serviceType ? ` · ${deptCfg.serviceType}` : ''}
                              </span>
                              <button onClick={e => { e.stopPropagation(); setExcludedCrewIds(prev => { const next = new Set(prev); deptCrew.forEach(c => next.delete(c.id)); return next }) }}
                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', fontSize: '10px', fontWeight: '700', color: '#1d4ed8', flexShrink: 0 }}>✓</button>
                              <button onClick={e => { e.stopPropagation(); setExcludedCrewIds(prev => { const next = new Set(prev); deptCrew.forEach(c => next.add(c.id)); return next }) }}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', fontSize: '10px', fontWeight: '600', color: '#64748b', flexShrink: 0 }}>✗</button>
                            </div>
                            {expanded && deptCrew.map(c => {
                              const ineligibleReason = getCrewIneligibleReason(c, date)
                              // ── Ineligible crew: greyed-out, no checkbox, no click ──
                              if (ineligibleReason) {
                                return (
                                  <div key={c.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px 8px 50px', borderTop: '1px solid #f8fafc', background: '#f8fafc', opacity: 0.38, cursor: 'default', userSelect: 'none' }}>
                                    <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.full_name}</span>
                                    {ineligibleReason === 'NTN' && (
                                      <span style={{ fontSize: '9px', fontWeight: '800', color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fecaca', flexShrink: 0, whiteSpace: 'nowrap' }}>🚫 NTN</span>
                                    )}
                                    {ineligibleReason === 'ABSENT' && (
                                      <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0', flexShrink: 0, whiteSpace: 'nowrap' }}>🏠 Absent</span>
                                    )}
                                    <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locMap[c.hotel_id] || c.hotel_id || '—'}</span>
                                  </div>
                                )
                              }
                              // ── Eligible crew: interactive as before ──
                              const excluded    = excludedCrewIds.has(c.id)
                              const crewOvr     = crewCallOverrides[c.id]
                              const displayCall = crewOvr ?? deptEffCall
                              const hasCallOvr  = crewOvr != null
                              const destOvr     = deptCfg.destId && deptCfg.destId !== destId
                              return (
                                <div key={c.id} onClick={() => setEditingCrew(c)}
                                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px 8px 36px', cursor: 'pointer', borderTop: '1px solid #f8fafc',
                                    background: excluded ? '#fafafa' : 'white', opacity: excluded ? 0.45 : 1, transition: 'background 0.1s' }}>
                                  <input type="checkbox" checked={!excluded}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setExcludedCrewIds(prev => { const next = new Set(prev); e.target.checked ? next.delete(c.id) : next.add(c.id); return next })}
                                    style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.full_name}</span>
                                  {c.on_location === false && <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0', flexShrink: 0 }}>🏠</span>}
                                  <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locMap[c.hotel_id] || c.hotel_id || '—'}</span>
                                  {destOvr && <span style={{ fontSize: '9px', color: '#7c3aed', fontWeight: '700', flexShrink: 0 }}>●</span>}
                                  <span style={{ fontSize: '12px', fontWeight: '800', color: hasCallOvr ? '#d97706' : '#374151', flexShrink: 0, minWidth: '42px', textAlign: 'right', cursor: 'pointer' }}
                                    title={hasCallOvr ? `Override: ${minToHHMM(displayCall)} (base: ${minToHHMM(deptEffCall)})` : `Call: ${minToHHMM(displayCall)}`}>
                                    {minToHHMM(displayCall)}{hasCallOvr && <span style={{ fontSize: '9px' }}>●</span>}
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>›</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>

                    {eligibleCrew.length > 0 && (
                      <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                        <span><strong style={{ color: '#0f172a' }}>{selectedCrew.length}</strong> {t.rocketSelectedCount}</span>
                        {excludedCrewIds.size > 0 && <span><strong style={{ color: '#94a3b8' }}>{excludedCrewIds.size}</strong> {t.rocketExcludedCount}</span>}
                        {Object.keys(crewCallOverrides).length > 0 && <span style={{ color: '#d97706', fontWeight: '600' }}>{Object.keys(crewCallOverrides).length} {t.rocketCallOverrides}</span>}
                        <span style={{ marginLeft: 'auto' }}>{[...new Set(selectedCrew.map(c => c.hotel_id).filter(Boolean))].length} {t.rocketHotels} · {departments.length} {t.rocketDepts}</span>
                      </div>
                    )}
                  </div>{/* END RIGHT COLUMN */}
                </div>
              </>
            )}

            {/* ════ STEP 2 — PREVIEW ════ */}
            {step === 2 && (
              <div>
                {/* Suggestions / Warnings */}
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {suggestions.map((s, i) => (
                      <div key={i} style={{ padding: '12px 16px', background: s.type === 'NO_VEHICLE' ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${s.type === 'NO_VEHICLE' ? '#fecaca' : '#fde68a'}`,
                        borderRadius: '9px', fontSize: '12px', color: s.type === 'NO_VEHICLE' ? '#b91c1c' : '#92400e', lineHeight: 1.6 }}>
                        {s.type === 'NO_VEHICLE' ? (
                          <>
                            <div style={{ fontWeight: '800', marginBottom: '4px' }}>
                              🚨 No vehicle for: <span style={{ color: '#7f1d1d' }}>{(s.crew || []).join(', ')}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#991b1b', marginBottom: '6px' }}>
                              📍 {locMap[s.hotelId] || s.hotelId} → {locMap[s.destId] || s.destId} · {minToHHMM(s.callMin)} call
                            </div>
                            {s.vehiclesWithRoom?.length > 0 && s.vehiclesWithRoom.map((v, vi) => (
                              <div key={vi} style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '2px' }}>
                                💡 <strong>{v.vehicleId}</strong> ({v.driver || 'no driver'}) has +{v.room} pax capacity — move manually in Step 2
                              </div>
                            ))}
                            {s.nearbyTrips?.length > 0 && s.nearbyTrips.map((n, ni) => (
                              <div key={ni} style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '2px' }}>
                                🔀 {locMap[s.hotelId] || s.hotelId} and <strong>{n.hotelName}</strong> are {n.duration} min apart — consider multi-pickup with <strong>{n.vehicleId}</strong> ({n.driver || 'no driver'})
                              </div>
                            ))}
                            {!s.vehiclesWithRoom?.length && !s.nearbyTrips?.length && (
                              <div style={{ fontSize: '11px', color: '#991b1b' }}>No spare capacity or nearby hotels found — add a vehicle or adjust pax_max.</div>
                            )}
                          </>
                        ) : (
                          <><strong>💡 Suggestion:</strong> {s.msg}</>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {createError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>❌ {createError}</div>
                )}

                {/* Stats bar */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>{t.rocketDraftPlan}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{activeTrips}</strong> trip{activeTrips !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#0f172a' }}>{totalPax}</strong> passengers</span>
                  {uniqueDestIds.length > 1 && <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#7c3aed' }}>{uniqueDestIds.length}</strong> destinations</span>}
                  {/* TASK 7: show "N service types" when mixed */}
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{date} · {globalCallTime} · {serviceTypeLabel}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                    {uniqueDestIds.length === 1 ? <>Destination: <strong style={{ color: '#0f172a' }}>{destLabel}</strong></> : <strong style={{ color: '#7c3aed' }}>{destLabel}</strong>}
                  </span>
                </div>

                {draftTrips.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤔</div>
                    <div style={{ fontWeight: '700', marginBottom: '6px' }}>{t.rocketNoTrips}</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                    {draftTrips.map(trip => (
                      <TripCard key={trip.key} trip={trip} locMap={locMap} routeMap={routeMap} allTrips={draftTrips}
                        onMoveCrew={(c, k) => setMoveTarget({ crew: c, tripKey: k })}
                        globalServiceType={serviceType} />
                    ))}
                  </div>
                )}

                {moveTarget && (
                  <MoveCrewModal crewMember={moveTarget.crew} currentTripKey={moveTarget.tripKey}
                    trips={draftTrips} locMap={locMap} onMove={handleMoveCrew} onClose={() => setMoveTarget(null)} />
                )}
              </div>
            )}

            {/* ════ STEP 3 — DONE ════ */}
            {step === 3 && (
              <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center' }}>
                <div style={{ width: '90px', height: '90px', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', boxShadow: '0 8px 24px rgba(22,163,74,0.2)' }}>🚀</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>{t.rocketTripsCreated}</div>
                <div style={{ fontSize: '15px', color: '#64748b', marginBottom: '4px' }}>
                  <strong style={{ color: '#0f172a', fontSize: '20px' }}>{createdCount}</strong> trips for <strong style={{ color: '#0f172a' }}>{date}</strong>
                </div>
                {/* TASK 7: use serviceTypeLabel in Step 3 summary */}
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>{totalPax} passengers · {globalCallTime} · {serviceTypeLabel}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                  {uniqueDestIds.length > 1
                    ? <><strong style={{ color: '#7c3aed' }}>{uniqueDestIds.length} destinations</strong>: {uniqueDestIds.map(id => locMap[id] || id).join(', ')}</>
                    : <>Destination: <strong>{destLabel}</strong></>}
                </div>

                {/* ── TASK 6: Excluded vehicles summary ── */}
                {excludedVehicleIds.size > 0 && (() => {
                  const excludedList = activeVehicles.filter(v => excludedVehicleIds.has(v.id))
                  return (
                    <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', textAlign: 'left' }}>
                      <div style={{ fontWeight: '800', fontSize: '12px', color: '#ea580c', marginBottom: '8px' }}>
                        🚫 {excludedList.length} vehicle{excludedList.length !== 1 ? 's' : ''} {t.rocketExcludedLabel}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {excludedList.map(v => {
                          const reason = excludedVehicleReasons[v.id] || ''
                          const TYPE_ICON = { VAN: '🚐', CAR: '🚗', BUS: '🚌' }
                          return (
                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                              <span style={{ fontSize: '13px', flexShrink: 0 }}>{TYPE_ICON[v.vehicle_type] || '🚐'}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a', flexShrink: 0, minWidth: '55px' }}>{v.id}</span>
                              <span style={{ color: '#64748b', flex: 1, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.driver_name || t.rocketNoDriver}</span>
                              {reason ? (
                                <span style={{ fontSize: '11px', background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 8px', borderRadius: '999px', fontWeight: '700', flexShrink: 0 }}>
                                  {reason}
                                </span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', flexShrink: 0 }}>{t.rocketNoReasonNoted}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a href="/dashboard/trips" style={{ display: 'block', background: '#0f2340', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>{t.rocketViewTrips}</a>
                  <a href="/dashboard/fleet" style={{ display: 'block', background: '#1e3a5f', color: 'white', padding: '15px', borderRadius: '11px', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>{t.rocketFleetMonitor}</a>
                  <button onClick={() => { setStep(1); setDraftTrips([]); setSuggestions([]); setCreatedCount(0); setCreateError(null) }}
                    style={{ padding: '14px', borderRadius: '11px', border: '1.5px solid #e2e8f0', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                    {t.rocketNewRun}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── TASK 3: Templates panel modal ── */}
      {showTemplates && (
        <TemplatesPanel
          currentConfig={buildRocketConfig(destId, globalCallTime, serviceType, deptDestOverrides, excludedVehicleIds, excludedVehicleReasons)}
          locMap={locMap}
          onLoad={applyConfig}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {editingCrew && (
        <CrewQuickEditModal crew={editingCrew} deptDestOverrides={deptDestOverrides} crewCallOverrides={crewCallOverrides}
          excludedCrewIds={excludedCrewIds} globalCallMin={globalCallMin} globalDestId={destId} locMap={locMap}
          onUpdate={handleCrewModalUpdate} onClose={() => setEditingCrew(null)} />
      )}
    </div>
  )
}
