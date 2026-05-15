# Accommodation Analysis
_Generated: 2026-05-15_

---

## FILE: lib/importUtils.js
NOT FOUND

---

## FILE: lib/processAccommodation.js
NOT FOUND
(The `processAccommodation` function lives inside `app/api/import/confirm/route.js` — see below.)

---

## FILE: app/dashboard/crew/page.js
_(Full file — 1871 lines. Accommodation / crew_stays relevant sections excerpted in full below; full file content follows.)_

```javascript
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../lib/navbar'
import { useT } from '../../../lib/i18n'
import { normalizeDept } from '../../../lib/normalizeDept'
import { getProductionId } from '../../../lib/production'
import { useIsMobile } from '../../../lib/useIsMobile'
import NotesPanel from '../../../lib/NotesPanel'

const SIDEBAR_W = 400

// ─── Colori ─────────────────────────────────────────────────
const TC = {
  IN:      { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  OUT:     { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  PRESENT: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
}
const HC = {
  CONFIRMED:   { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  PENDING:     { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  CHECKED_OUT: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
}

function isoToday() { return new Date().toISOString().split('T')[0] }
function fmtDate(s) {
  if (!s) return '–'
  return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function isTomorrow(s) {
  if (!s) return false
  const t = new Date(); t.setDate(t.getDate() + 1)
  return s === t.toISOString().split('T')[0]
}
function isToday(s) { return s === isoToday() }

function hotelOccupancy(arrival, departure) {
  const today = isoToday()
  if (!arrival && !departure) return null
  if (departure && isToday(departure))    return { label: '🏁 CHK OUT TODAY',    style: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' } }
  if (departure && isTomorrow(departure)) return { label: '🏁 CHK OUT TOMORROW', style: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' } }
  if (arrival && today >= arrival && (!departure || today < departure)) return { label: '🏨 In Hotel', style: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' } }
  if (arrival && today < arrival)         return { label: '🔜 Arriving ' + fmtDate(arrival), style: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' } }
  if (departure && today >= departure)    return { label: '🧳 Checked Out', style: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' } }
  return null
}

function Badge({ label, style }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', border: `1px solid ${style.border || 'transparent'}`, background: style.bg, color: style.color }}>
      {label}
    </span>
  )
}

// ─── Travel Status inline selector ──────────────────────────
function TravelSelector({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
  const [saving, setSaving] = useState(false)
  async function pick(s) {
    if (s === current || saving) return
    setSaving(true)
    const { error } = await supabase.from('crew').update({ travel_status: s }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, s)
  }
  return (
    <div style={{ display: 'flex', gap: '3px' }} onClick={e => e.stopPropagation()}>
      {['IN', 'PRESENT', 'OUT'].map(s => {
        const c = TC[s]; const active = s === current
        return (
          <button key={s} onClick={() => pick(s)} disabled={saving}
            style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`, background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8', opacity: saving ? 0.6 : 1 }}>
            {s}
          </button>
        )
      })}
    </div>
  )
}

// ─── NTN Toggle inline ──────────────────────────────────────
function NTNToggle({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
  const [saving, setSaving] = useState(false)
  async function toggle() {
    if (saving) return
    setSaving(true)
    const next = !current
    const { error } = await supabase.from('crew').update({ no_transport_needed: next }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, next)
  }
  return (
    <button onClick={e => { e.stopPropagation(); toggle() }} disabled={saving} title={current ? 'Rimuovi NTN' : 'Segna come Self Drive / NTN'}
      style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${current ? '#fca5a5' : '#e2e8f0'}`, background: current ? '#dc2626' : 'white', color: current ? 'white' : '#cbd5e1', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
      🚐
    </button>
  )
}

// ─── Remote Toggle inline ────────────────────────────────────
function RemoteToggle({ crewId, current, onChange }) {
  const PRODUCTION_ID = getProductionId()
  const [saving, setSaving] = useState(false)
  const isRemote = current === false  // on_location=false → remoto
  async function toggle() {
    if (saving) return
    setSaving(true)
    const next = current === false ? true : false
    const { error } = await supabase.from('crew').update({ on_location: next }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
    setSaving(false)
    if (!error) onChange(crewId, next)
  }
  return (
    <button onClick={e => { e.stopPropagation(); toggle() }} disabled={saving}
      title={isRemote ? 'Segna come In Set' : 'Segna come Remoto / Non in Set'}
      style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', border: `1px solid ${isRemote ? '#94a3b8' : '#e2e8f0'}`, background: isRemote ? '#f1f5f9' : 'white', color: isRemote ? '#475569' : '#cbd5e1', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
      🏠
    </button>
  )
}

// ─── StayForm (standalone) ────────────────────────────────────
const STAY_INP = { width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }
const STAY_LBL = { fontSize: '10px', fontWeight: '700', color: '#15803d', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }

function StayForm({ form, setF, onSave, onCancel, saveLabel, saving, hotelLocations }) {
  return (
    <div style={{ background: 'white', border: '1px dashed #86efac', borderRadius: '7px', padding: '8px 10px', marginBottom: '6px' }}>
      <div style={{ marginBottom: '6px' }}>
        <label style={STAY_LBL}>Hotel</label>
        <select value={form.hotel_id || ''} onChange={e => setF(f => ({ ...f, hotel_id: e.target.value }))} style={STAY_INP}>
          <option value="">– No hotel –</option>
          {hotelLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
        <div>
          <label style={STAY_LBL}>Check-in</label>
          <input type="date" value={form.arrival_date || ''} onChange={e => setF(f => ({ ...f, arrival_date: e.target.value }))} style={STAY_INP} />
        </div>
        <div>
          <label style={STAY_LBL}>Check-out</label>
          <input type="date" value={form.departure_date || ''} onChange={e => setF(f => ({ ...f, departure_date: e.target.value }))} style={STAY_INP} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: '4px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving || !form.arrival_date || !form.departure_date}
          style={{ flex: 2, padding: '4px', borderRadius: '6px', border: 'none', background: saving ? '#94a3b8' : '#15803d', color: 'white', fontSize: '11px', cursor: saving ? 'default' : 'pointer', fontWeight: '700' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── AccommodationAccordion ────────────────────────────────────
// KEY SECTION: reads/writes crew_stays table
function AccommodationAccordion({ crewId, locations, onCrewDatesUpdated }) {
  const PRODUCTION_ID = getProductionId()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stays, setStays] = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ hotel_id: '', arrival_date: '', departure_date: '' })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelId, setConfirmDelId] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('crew_stays')
      .select('id, hotel_id, arrival_date, departure_date')
      .eq('crew_id', crewId)
      .eq('production_id', PRODUCTION_ID)
      .order('arrival_date', { ascending: true })
    setStays(data || [])
    setLoading(false)
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function syncCrewDates(newStays) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const active = newStays.find(s => s.arrival_date <= today && s.departure_date >= today)
      || newStays.find(s => s.arrival_date > today)
      || newStays[newStays.length - 1]
    if (active) {
      await supabase.from('crew').update({
        hotel_id:       active.hotel_id || null,
        arrival_date:   active.arrival_date || null,
        departure_date: active.departure_date || null,
      }).eq('id', crewId).eq('production_id', PRODUCTION_ID)
      onCrewDatesUpdated && onCrewDatesUpdated(active)
    }
  }

  async function handleAdd() {
    if (!addForm.arrival_date || !addForm.departure_date) return
    setSaving(true)
    const { data, error } = await supabase
      .from('crew_stays')
      .insert({
        production_id:  PRODUCTION_ID,
        crew_id:        crewId,
        hotel_id:       addForm.hotel_id || null,
        arrival_date:   addForm.arrival_date,
        departure_date: addForm.departure_date,
      })
      .select('id, hotel_id, arrival_date, departure_date')
      .single()
    setSaving(false)
    if (error) return
    const newStays = [...stays, data].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))
    setStays(newStays)
    setAddOpen(false)
    setAddForm({ hotel_id: '', arrival_date: '', departure_date: '' })
    await syncCrewDates(newStays)
  }

  async function handleEditSave(id) {
    setSaving(true)
    const { error } = await supabase
      .from('crew_stays')
      .update({
        hotel_id:       editForm.hotel_id || null,
        arrival_date:   editForm.arrival_date,
        departure_date: editForm.departure_date,
      })
      .eq('id', id)
    setSaving(false)
    if (error) return
    const newStays = stays
      .map(s => s.id === id ? { ...s, ...editForm } : s)
      .sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))
    setStays(newStays)
    setEditId(null)
    await syncCrewDates(newStays)
  }

  async function handleDelete(id) {
    if (confirmDelId !== id) { setConfirmDelId(id); return }
    setSaving(true)
    await supabase.from('crew_stays').delete().eq('id', id)
    setSaving(false)
    const newStays = stays.filter(s => s.id !== id)
    setStays(newStays)
    setConfirmDelId(null)
    if (newStays.length > 0) await syncCrewDates(newStays)
  }

  // ... render omitted for brevity — full content in file
}
```

_(For full 1871-line content see `app/dashboard/crew/page.js` in the repository)_

**Key accommodation / crew_stays usage in this file:**

| Location | Operation | Table / columns |
|---|---|---|
| `AccommodationAccordion.load()` | SELECT | `crew_stays(id, hotel_id, arrival_date, departure_date)` filtered by `crew_id + production_id` |
| `AccommodationAccordion.handleAdd()` | INSERT | `crew_stays(production_id, crew_id, hotel_id, arrival_date, departure_date)` |
| `AccommodationAccordion.handleEditSave()` | UPDATE | `crew_stays(hotel_id, arrival_date, departure_date)` by `id` |
| `AccommodationAccordion.handleDelete()` | DELETE | `crew_stays` by `id` |
| `AccommodationAccordion.syncCrewDates()` | UPDATE (side-effect) | `crew(hotel_id, arrival_date, departure_date)` — syncs the primary crew row to the "active" stay |
| `CrewPage.loadCrew()` | SELECT | `crew_stays(crew_id, hotel_id, arrival_date, departure_date)` — bulk load for all crew in production, builds `staysMap` |
| `CrewCard` | READ | Renders `stays[]` prop — shows multi-stay badges when crew has >1 stay |
| `CrewSidebar` | RENDER | Mounts `<AccommodationAccordion>` only in `edit` mode, keyed by `initial.id + editKey` |

---

## FILE: app/api/import/route.js
NOT FOUND

## FILE: app/api/import/confirm/route.js
_(This is where `processAccommodation` lives — full content:)_

```javascript
/**
 * /api/import/confirm
 *
 * POST (application/json)
 *
 * Input:
 *   rows         — array di righe con action: 'insert' | 'update' | 'skip'
 *   mode         — 'hal' | 'fleet' | 'crew' | 'custom'
 *   productionId — UUID produzione attiva
 *   newLocations — array { name } di hotel nuovi da inserire in locations prima del crew
 *   detectedMode — (per hal) 'crew' | 'fleet' | 'mixed' — determina come processare le rows
 *
 * Flusso:
 *   1. (crew) Inserisce prima i newLocations in tabella locations
 *   2. Fleet: batch insert veicoli nuovi + update esistenti (solo campi null nel DB)
 *   3. Crew: genera IDs CR#### sequenziali per insert, poi batch insert + update (solo campi null)
 *   4. Mixed (HAL): processa crew e fleet separatamente in base a row._subMode
 *   5. Return: { inserted, updated, skipped, errors }
 *
 * Regola update "null-only":
 *   Per ogni riga con action='update', l'existing viene fetchato da Supabase.
 *   Un campo viene aggiornato SOLO se il suo valore attuale nel DB è null/vuoto.
 *   I campi già compilati non vengono mai sovrascritti.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

// ── Helpers ───────────────────────────────────────────────────

/** Inserisce nuove locations (hotel) e ritorna mappa nome→id */
async function insertNewLocations(supabase, productionId, newLocations) {
  const newLocationMap = {}
  if (!newLocations.length) return newLocationMap

  const { data: existingLocs } = await supabase
    .from('locations')
    .select('id')
    .eq('production_id', productionId)
    .like('id', 'H%')

  let maxLocNum = 0
  for (const l of (existingLocs || [])) {
    const n = parseInt((l.id || '').replace(/^H/i, ''), 10)
    if (!isNaN(n) && n > maxLocNum) maxLocNum = n
  }

  for (const loc of newLocations) {
    if (!loc.name?.trim()) continue
    maxLocNum++
    const autoLocId = `H${String(maxLocNum).padStart(3, '0')}`
    const locPayload = {
      id:           autoLocId,
      name:         loc.name.trim(),
      production_id: productionId,
      is_hub:       false,
      is_hotel:     true,
    }
    if (loc.lat != null) locPayload.lat = loc.lat
    if (loc.lng != null) locPayload.lng = loc.lng

    const { data: newLoc, error: locErr } = await supabase
      .from('locations')
      .insert(locPayload)
      .select('id, name')
      .single()
    if (!locErr && newLoc) {
      newLocationMap[loc.name.trim().toLowerCase()] = newLoc.id
    }
  }
  return newLocationMap
}

/** Calcola il massimo numero progressivo per ID veicoli */
async function getMaxVehicleNums(supabase, productionId) {
  const { data: existingVhcs } = await supabase
    .from('vehicles')
    .select('id')
    .eq('production_id', productionId)

  const maxByType = { VAN: 0, CAR: 0, BUS: 0 }
  for (const v of (existingVhcs || [])) {
    if (!v.id) continue
    const parts = v.id.split('-')
    if (parts.length >= 2) {
      const type = parts[0].toUpperCase()
      const n = parseInt(parts[parts.length - 1], 10)
      if (maxByType[type] !== undefined && !isNaN(n) && n > maxByType[type]) {
        maxByType[type] = n
      }
    }
  }
  return maxByType
}

/** Calcola il massimo numero progressivo per ID crew (CR####) */
async function getMaxCrewNum(supabase, productionId) {
  const { data: existingCrew } = await supabase
    .from('crew')
    .select('id')
    .eq('production_id', productionId)
    .like('id', 'CR%')
    .order('id', { ascending: false })

  let maxNum = 0
  for (const c of (existingCrew || [])) {
    const num = parseInt(c.id.replace(/^CR/i, ''), 10)
    if (!isNaN(num) && num > maxNum) maxNum = num
  }
  return maxNum
}

// ── Fleet processor ───────────────────────────────────────────

async function processFleet(supabase, productionId, insertRows, updateRows, errors) {
  let inserted = 0
  let updated  = 0
  let skipped  = 0

  const CAP_DEFAULT = { VAN: 8, CAR: 4, BUS: null }
  const PAX_DEFAULT = { VAN: 8, CAR: 4, BUS: null }

  if (insertRows.length > 0) {
    const maxByType = await getMaxVehicleNums(supabase, productionId)

    const toInsert = insertRows.map(r => {
      const vtype    = (r.vehicle_type || 'VAN').toUpperCase()
      const safeType = maxByType[vtype] !== undefined ? vtype : 'VAN'
      maxByType[safeType] = (maxByType[safeType] || 0) + 1
      const autoId = `${safeType}-${String(maxByType[safeType]).padStart(2, '0')}`
      const capDefault = CAP_DEFAULT[safeType] ?? null
      const paxDefault = PAX_DEFAULT[safeType] ?? null
      return {
        id:             autoId,
        production_id:  productionId,
        driver_name:    r.driver_name    ?? null,
        vehicle_type:   r.vehicle_type   || 'VAN',
        license_plate:  r.plate          ?? null,
        capacity:       r.capacity       ?? capDefault,
        pax_suggested:  r.pax_suggested  ?? paxDefault,
        pax_max:        r.pax_max        ?? null,
        sign_code:      r.sign_code      ?? null,
        available_from: r.available_from ?? null,
        available_to:   r.available_to   ?? null,
        active: true,
      }
    })

    const { data: insertedData, error: insertErr } = await supabase
      .from('vehicles')
      .insert(toInsert)
      .select('id')
    if (insertErr) {
      errors.push(`Errore insert veicoli: ${insertErr.message}`)
    } else {
      inserted += insertedData?.length || 0
    }
  }

  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }
    const { data: existing } = await supabase
      .from('vehicles')
      .select('driver_name, vehicle_type, license_plate, capacity, pax_suggested, pax_max, sign_code, available_from, available_to')
      .eq('id', r.existingId)
      .single()
    if (!existing) { skipped++; continue }
    const updateFields = {}
    if (!existing.driver_name    && r.driver_name)    updateFields.driver_name    = r.driver_name
    if (!existing.vehicle_type   && r.vehicle_type)   updateFields.vehicle_type   = r.vehicle_type
    if (!existing.license_plate  && r.plate)          updateFields.license_plate  = r.plate
    if (existing.capacity   == null && r.capacity   != null) updateFields.capacity    = r.capacity
    if (existing.pax_suggested == null && r.pax_suggested != null) updateFields.pax_suggested = r.pax_suggested
    if (existing.pax_max    == null && r.pax_max    != null) updateFields.pax_max     = r.pax_max
    if (!existing.sign_code      && r.sign_code)      updateFields.sign_code      = r.sign_code
    if (!existing.available_from && r.available_from) updateFields.available_from = r.available_from
    if (!existing.available_to   && r.available_to)   updateFields.available_to   = r.available_to
    if (Object.keys(updateFields).length === 0) { skipped++; continue }
    const { error: updateErr } = await supabase
      .from('vehicles')
      .update(updateFields)
      .eq('id', r.existingId)
      .eq('production_id', productionId)
    if (updateErr) {
      errors.push(`Errore update veicolo ${r.existingId}: ${updateErr.message}`)
    } else {
      updated++
    }
  }

  return { inserted, updated, skipped }
}

// ── Crew processor ────────────────────────────────────────────

async function processCrew(supabase, productionId, insertRows, updateRows, newLocationMap, errors) {
  let inserted = 0
  let updated  = 0
  let skipped  = 0

  if (insertRows.length > 0) {
    let maxNum = await getMaxCrewNum(supabase, productionId)

    const toInsert = insertRows
      .filter(r => {
        const full_name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
        return full_name.length > 0
      })
      .map(r => {
      maxNum++
      let hotel_id = r.hotel_id || null
      if (!hotel_id && r.hotel)       hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
      if (!hotel_id && r.hotel_name)  hotel_id = newLocationMap[r.hotel_name.trim().toLowerCase()] || null
      const full_name = [r.first_name, r.last_name].filter(Boolean).join(' ') || null
      return {
        id:             `CR${String(maxNum).padStart(4, '0')}`,
        production_id:  productionId,
        full_name:      full_name,
        role:           r.role           || null,
        department:     r.department     || 'OTHER',
        phone:          r.phone          || null,
        email:          r.email          || null,
        hotel_id:       hotel_id,
        arrival_date:   r.arrival_date   || null,
        departure_date: r.departure_date || null,
        travel_status:  'PRESENT',
      }
    })

    const { data: insertedData, error: insertErr } = await supabase
      .from('crew')
      .insert(toInsert)
      .select('id')
    if (insertErr) {
      errors.push(`Errore insert crew: ${insertErr.message}`)
    } else {
      inserted += insertedData?.length || 0
    }
  }

  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }
    const { data: existing } = await supabase
      .from('crew')
      .select('full_name, role, department, phone, email, hotel_id, arrival_date, departure_date')
      .eq('id', r.existingId)
      .single()
    if (!existing) { skipped++; continue }
    let hotel_id = r.hotel_id || null
    if (!hotel_id && r.hotel) {
      hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
    }
    const full_name = [r.first_name, r.last_name].filter(Boolean).join(' ') || null
    const updateFields = {}
    if (!existing.full_name      && full_name)         updateFields.full_name      = full_name
    if (!existing.role           && r.role)            updateFields.role           = r.role
    if (!existing.department     && r.department)      updateFields.department     = r.department
    if (!existing.phone          && r.phone)           updateFields.phone          = r.phone
    if (!existing.email          && r.email)           updateFields.email          = r.email
    if (!existing.hotel_id       && hotel_id)          updateFields.hotel_id       = hotel_id
    if (!existing.arrival_date   && r.arrival_date)    updateFields.arrival_date   = r.arrival_date
    if (!existing.departure_date && r.departure_date)  updateFields.departure_date = r.departure_date
    if (Object.keys(updateFields).length === 0) { skipped++; continue }
    const { error: updateErr } = await supabase
      .from('crew')
      .update(updateFields)
      .eq('id', r.existingId)
      .eq('production_id', productionId)
    if (updateErr) {
      errors.push(`Errore update crew ${r.existingId}: ${updateErr.message}`)
    } else {
      updated++
    }
  }

  return { inserted, updated, skipped }
}

// ── Accommodation processor ───────────────────────────────────
// THIS IS THE MAIN crew_stays WRITE PATH ON IMPORT

async function processAccommodation(supabase, productionId, updateRows, newLocationMap, errors) {
  let updated = 0
  let skipped = 0

  // Group rows by crew_id
  const byCrewId = {}
  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }
    if (!byCrewId[r.existingId]) byCrewId[r.existingId] = []
    byCrewId[r.existingId].push(r)
  }

  for (const [crewId, rows] of Object.entries(byCrewId)) {
    // DELETE existing stays for this crew in this production (full replace)
    await supabase.from('crew_stays')
      .delete()
      .eq('crew_id', crewId)
      .eq('production_id', productionId)

    // INSERT one stay per import row
    const staysToInsert = []
    for (const r of rows) {
      let hotel_id = r.hotel_id || null
      if (!hotel_id && r.hotel_name) {
        hotel_id = newLocationMap[r.hotel_name.trim().toLowerCase()] || null
      }
      if (!r.arrival_date || !r.departure_date) continue
      staysToInsert.push({
        production_id:  productionId,
        crew_id:        crewId,
        hotel_id:       hotel_id,
        arrival_date:   r.arrival_date,
        departure_date: r.departure_date,
      })
    }

    if (staysToInsert.length === 0) { skipped++; continue }

    const { error: stayErr } = await supabase.from('crew_stays').insert(staysToInsert)
    if (stayErr) {
      errors.push(`Errore insert crew_stays ${crewId}: ${stayErr.message}`)
      continue
    }

    // Compute min arrival, max departure, and active hotel for today
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const minArrival   = staysToInsert.reduce((m, s) => s.arrival_date   < m ? s.arrival_date   : m, staysToInsert[0].arrival_date)
    const maxDeparture = staysToInsert.reduce((m, s) => s.departure_date > m ? s.departure_date : m, staysToInsert[0].departure_date)

    const activeStay = staysToInsert.find(s => s.arrival_date <= today && today <= s.departure_date)
      || staysToInsert.filter(s => s.arrival_date > today).sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))[0]
      || staysToInsert[0]

    let travel_status
    if (today > activeStay.departure_date)                                                  travel_status = 'OUT'
    else if (activeStay.arrival_date < today && today <= activeStay.departure_date)         travel_status = 'PRESENT'
    else                                                                                     travel_status = 'IN'

    const updateFields = {
      hotel_id:       activeStay.hotel_id,
      arrival_date:   minArrival,
      departure_date: maxDeparture,
      hotel_status:   'CONFIRMED',
      travel_status,
    }

    const { error: updateErr } = await supabase.from('crew').update(updateFields)
      .eq('id', crewId).eq('production_id', productionId)

    if (updateErr) {
      errors.push(`Errore update crew ${crewId}: ${updateErr.message}`)
    } else {
      updated++
    }
  }

  return { inserted: 0, updated, skipped }
}

// ── Travel processor ─────────────────────────────────────────

async function processTravelConfirm(supabase, productionId, insertRows, errors) {
  let inserted = 0
  let skipped = 0

  const { error: deleteErr } = await supabase
    .from('travel_movements')
    .delete()
    .eq('production_id', productionId)
  if (deleteErr) {
    errors.push(`Errore delete travel_movements: ${deleteErr.message}`)
  }

  function getNoTransport(pickup) {
    const p = (pickup || '').trim().toUpperCase().replace(/\.$/, '')
    if (p === 'TRANSPORT DEPT') return false
    if (['TBD', 'TBA', 'TBR', '?'].includes(p)) return null
    return true
  }

  const toInsert = []

  for (const r of insertRows) {
    if (r.existingId) {
      const ntpArr = getNoTransport(r.pickup_arr)
      const ntpDep = getNoTransport(r.pickup_dep)
      const ntp = ntpArr === false || ntpDep === false ? false
                : ntpArr === true  || ntpDep === true  ? true
                : null
      if (ntp !== null) {
        await supabase.from('crew')
          .update({ no_transport_needed: ntp })
          .eq('id', r.existingId)
          .eq('production_id', productionId)
      }
    }

    toInsert.push({
      production_id:        productionId,
      crew_id:              r.existingId || null,
      travel_date:          r.travel_date || null,
      direction:            r.direction || null,
      from_location:        r.from_location || null,
      from_time:            r.from_time || null,
      to_location:          r.to_location || null,
      to_time:              r.to_time || null,
      travel_number:        r.travel_number || null,
      travel_type:          r.travel_type || null,
      pickup_dep:           r.pickup_dep || null,
      pickup_arr:           r.pickup_arr || null,
      needs_transport:      r.needs_transport ?? false,
      hub_location_id:      r.hub_location_id || null,
      hotel_raw:            r.hotel_raw || null,
      hotel_id:             r.hotel_id || null,
      rooming_date:         r.rooming_date || null,
      rooming_hotel_id:     r.rooming_hotel_id || null,
      travel_date_conflict: r.travel_date_conflict || false,
      hotel_conflict:       r.hotel_conflict || false,
      full_name_raw:        r.full_name_raw || null,
      match_status:         r.match_status || 'unmatched',
      discrepancy_resolved: false,
    })
  }

  const conflicts = toInsert.filter(r =>
    r.travel_date_conflict || r.hotel_conflict || r.match_status === 'unmatched'
  ).length

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('travel_movements')
      .insert(toInsert)
      .select('id')
    if (error) errors.push(`Errore insert travel_movements: ${error.message}`)
    else inserted = data?.length || 0
  }

  return { inserted, updated: 0, skipped, conflicts }
}

// ── POST handler ─────────────────────────────────────────────

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { rows, mode, productionId, newLocations = [], detectedMode } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows è obbligatorio e deve essere un array' }, { status: 400 })
    }
    if (!mode)         return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    let inserted  = 0
    let updated   = 0
    let skipped   = 0
    let conflicts = 0
    const errors  = []

    const newLocationMap = await insertNewLocations(supabase, productionId, newLocations)

    const insertRows = rows.filter(r => r.action === 'insert')
    const updateRows = rows.filter(r => r.action === 'update')
    const skipRows   = rows.filter(r => r.action === 'skip')
    skipped += skipRows.length

    const effectiveMode = mode === 'hal' ? (detectedMode || 'crew') : mode

    if (effectiveMode === 'fleet') {
      const res = await processFleet(supabase, productionId, insertRows, updateRows, errors)
      inserted += res.inserted; updated += res.updated; skipped += res.skipped
    }
    else if (effectiveMode === 'crew') {
      const res = await processCrew(supabase, productionId, insertRows, updateRows, newLocationMap, errors)
      inserted += res.inserted; updated += res.updated; skipped += res.skipped
    }
    else if (effectiveMode === 'mixed') {
      const crewInsert  = insertRows.filter(r => r._subMode === 'crew')
      const crewUpdate  = updateRows.filter(r => r._subMode === 'crew')
      const fleetInsert = insertRows.filter(r => r._subMode === 'fleet')
      const fleetUpdate = updateRows.filter(r => r._subMode === 'fleet')
      const crewRes  = await processCrew( supabase, productionId, crewInsert,  crewUpdate,  newLocationMap, errors)
      const fleetRes = await processFleet(supabase, productionId, fleetInsert, fleetUpdate, errors)
      inserted += crewRes.inserted  + fleetRes.inserted
      updated  += crewRes.updated   + fleetRes.updated
      skipped  += crewRes.skipped   + fleetRes.skipped
    }
    else if (effectiveMode === 'accommodation') {
      // 1. Insert new crew from rooming list ("+Add all")
      if (insertRows.length > 0) {
        const insertRes = await processCrew(supabase, productionId, insertRows, [], newLocationMap, errors)
        inserted += insertRes.inserted
        skipped  += insertRes.skipped
      }
      // 2. Update existing crew with hotel/dates (always overwrite)
      const res = await processAccommodation(supabase, productionId, updateRows, newLocationMap, errors)
      updated  += res.updated
      skipped  += res.skipped
    }
    else if (effectiveMode === 'travel') {
      const res = await processTravelConfirm(supabase, productionId, insertRows, errors)
      inserted  += res.inserted; skipped += res.skipped; conflicts = res.conflicts || 0
    }

    return NextResponse.json({
      inserted, updated, skipped, errors,
      ...(conflicts > 0 ? { conflicts } : {}),
    })

  } catch (e) {
    console.error('[import/confirm]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

---

## SQL: crew_stays table definition

**No SQL migration file found that defines the `crew_stays` table.**

The table is NOT defined in any `.sql` file in `scripts/` or elsewhere in this repository.

- `scripts/create-schema.sql` — the baseline schema — does **not** include `crew_stays`.
- `scripts/migrate-travel-accommodation.sql` — adds an `accommodation TEXT` column to `travel_movements`, not `crew_stays`.
- No other `.sql` file in the repo references `crew_stays`.

**Conclusion:** The `crew_stays` table was created directly in the Supabase dashboard (SQL Editor) without a corresponding migration file being committed to the repository. The table schema can be inferred from usage across the codebase:

```sql
-- Inferred from JS code usage (NOT an actual migration file found in repo)
CREATE TABLE crew_stays (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id  uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  crew_id        text NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  hotel_id       text REFERENCES locations(id),
  arrival_date   date NOT NULL,
  departure_date date NOT NULL,
  created_at     timestamptz DEFAULT now()
);

-- Indexes inferred from query patterns:
CREATE INDEX ON crew_stays(crew_id, production_id);
CREATE INDEX ON crew_stays(production_id);
CREATE INDEX ON crew_stays(arrival_date);
```

---

## FILES REFERENCING crew_stays

The following JavaScript files reference `crew_stays` (found via codebase search):

1. `app/api/crew/merge/route.js`
   - Reassigns `crew_stays.crew_id` when merging two crew records (`UPDATE crew_stays SET crew_id = primary_id`)

2. `app/api/crew-notes/linked/route.js`
   - SELECTs `crew_stays(id, hotel_id, arrival_date, departure_date)` to find linked stays for note context

3. `app/api/import/confirm/route.js`
   - **Main import path**: DELETE + INSERT into `crew_stays` inside `processAccommodation()`

4. `app/api/import/parse/route.js`
   - SELECTs `crew_stays(crew_id, hotel_id, arrival_date, departure_date)` during parse phase to detect conflicts

5. `app/dashboard/bridge/page.js`
   - SELECTs stays for conflict detection and travel discrepancy resolution
   - UPSERTs `crew_stays` when resolving hotel/date conflicts from multi-stay mode
   - UPDATEs `crew_stays.arrival_date / departure_date / hotel_id` when auto-resolving discrepancies

6. `app/dashboard/crew/page.js`
   - Full CRUD: SELECT, INSERT, UPDATE, DELETE via `AccommodationAccordion`
   - Bulk SELECT in `loadCrew()` to build `staysMap` for all cards

7. `app/dashboard/trips/page.js`
   - SELECTs `crew_stays` with a `crew!inner(...)` join to find crew departing soon (checkout tracking)
