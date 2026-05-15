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
    // Costruisci payload con lat/lng opzionali (vengono da Google Places via HotelPlacesModal)
    const locPayload = {
      id:           autoLocId,
      name:         loc.name.trim(),
      production_id: productionId,
      is_hub:       false,
      is_hotel:     true,   // location da import accommodation → sempre hotel
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

/** Calcola il massimo numero progressivo per ID veicoli (VAN-01, CAR-01…) */
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

  // INSERT batch
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
        license_plate:  r.plate          ?? null,   // row usa 'plate', DB usa 'license_plate'
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

  // UPDATE — solo campi null nel DB
  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }

    // Fetch existing per null-check
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

  // INSERT batch
  if (insertRows.length > 0) {
    let maxNum = await getMaxCrewNum(supabase, productionId)

    const toInsert = insertRows
      .filter(r => {
        const full_name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
        return full_name.length > 0
      })
      .map(r => {
      maxNum++

      // Risolvi hotel_id: da match esistente oppure da nuova location appena inserita
      // Fallback su r.hotel_name (accommodation rows) o r.hotel (crew rows)
      let hotel_id = r.hotel_id || null
      if (!hotel_id && r.hotel)       hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
      if (!hotel_id && r.hotel_name)  hotel_id = newLocationMap[r.hotel_name.trim().toLowerCase()] || null

      // Combina first_name + last_name → full_name per il DB
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

    console.log(`[confirm/crew] INSERT ${toInsert.length} rows:`, toInsert.map(r => ({ id: r.id, full_name: r.full_name, dept: r.department })))

    const { data: insertedData, error: insertErr } = await supabase
      .from('crew')
      .insert(toInsert)
      .select('id')

    if (insertErr) {
      console.error(`[confirm/crew] INSERT ERROR:`, insertErr.message, insertErr.details)
      errors.push(`Errore insert crew: ${insertErr.message}`)
    } else {
      console.log(`[confirm/crew] INSERT OK: ${insertedData?.length || 0} rows`, insertedData?.map(r => r.id))
      inserted += insertedData?.length || 0
    }
  }

  // UPDATE — solo campi null nel DB
  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }

    // Fetch existing per null-check
    const { data: existing } = await supabase
      .from('crew')
      .select('full_name, role, department, phone, email, hotel_id, arrival_date, departure_date')
      .eq('id', r.existingId)
      .single()

    if (!existing) { skipped++; continue }

    // Risolvi hotel_id
    let hotel_id = r.hotel_id || null
    if (!hotel_id && r.hotel) {
      hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
    }

    // Combina first_name + last_name → full_name per il DB
    const full_name = [r.first_name, r.last_name].filter(Boolean).join(' ') || null

    const updateFields = {}
    // full_name: aggiorna solo se il DB è vuoto
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

async function processAccommodation(supabase, productionId, updateRows, newLocationMap, errors) {
  let updated = 0
  let skipped = 0

  // Raggruppa le righe per crew_id
  const byCrewId = {}
  for (const r of updateRows) {
    if (!r.existingId) { skipped++; continue }
    if (!byCrewId[r.existingId]) byCrewId[r.existingId] = []
    byCrewId[r.existingId].push(r)
  }

  for (const [crewId, rows] of Object.entries(byCrewId)) {
    // Elimina stays esistenti per questo crew in questa produzione
    await supabase.from('crew_stays')
      .delete()
      .eq('crew_id', crewId)
      .eq('production_id', productionId)

    // Inserisci una stay per ogni riga
    const staysToInsert = []
    for (const r of rows) {
      let hotel_id = r.hotel_id || null
      if (!hotel_id && r.hotel_name) {
        hotel_id = newLocationMap[r.hotel_name.trim().toLowerCase()] || null
      }
      if (!r.arrival_date || !r.departure_date) continue
      staysToInsert.push({
        production_id:      productionId,
        crew_id:            crewId,
        hotel_id:           hotel_id,
        arrival_date:       r.arrival_date,
        departure_date:     r.departure_date,
        room_type_notes:    r.room_type_notes    || null,
        cost_per_night:     r.cost_per_night     ?? null,
        city_tax_total:     r.city_tax_total     ?? null,
        total_cost_no_vat:  r.total_cost_no_vat  ?? null,
        total_cost_vat:     r.total_cost_vat     ?? null,
        po_number:          r.po_number          || null,
        invoice_number:     r.invoice_number     || null,
      })
    }

    if (staysToInsert.length === 0) { skipped++; continue }

    const { error: stayErr } = await supabase.from('crew_stays').insert(staysToInsert)
    if (stayErr) {
      errors.push(`Errore insert crew_stays ${crewId}: ${stayErr.message}`)
      continue
    }

    // Calcola min arrival, max departure e hotel attivo oggi
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    const minArrival   = staysToInsert.reduce((m, s) => s.arrival_date   < m ? s.arrival_date   : m, staysToInsert[0].arrival_date)
    const maxDeparture = staysToInsert.reduce((m, s) => s.departure_date > m ? s.departure_date : m, staysToInsert[0].departure_date)

    // Hotel attivo = stay che include oggi, altrimenti prossima stay futura
    const activeStay = staysToInsert.find(s => s.arrival_date <= today && today <= s.departure_date)
      || staysToInsert.filter(s => s.arrival_date > today).sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))[0]
      || staysToInsert[0]

    // Calcola travel_status
    let travel_status
    // arrival_date < oggi → già arrivato, PRESENT
    // arrival_date = oggi → arriva oggi (potrebbe avere un volo nel pomeriggio), IN
    //                       il cron arrival-status o il crew-page load la aggiornerà dopo
    // arrival_date > oggi → IN
    // departure_date < oggi → OUT
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

  // Delete existing travel_movements before re-importing
  const { error: deleteErr } = await supabase
    .from('travel_movements')
    .delete()
    .eq('production_id', productionId)
  if (deleteErr) {
    console.error('[confirm/travel] delete existing error:', deleteErr.message)
    errors.push(`Errore delete travel_movements: ${deleteErr.message}`)
  } else {
    console.log('[confirm/travel] existing movements deleted, proceeding with insert')
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
      discrepancy_resolved: false,   // sempre false all'import — l'utente risolve dal Bridge
    })
  }

  // Conta i conflitti reali da segnalare all'utente (da risolvere nel Bridge)
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

  console.log(`[confirm/travel] inserted=${inserted} conflicts=${conflicts}`)
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

    console.log(`[confirm] mode=${mode} detectedMode=${detectedMode} rows=${rows?.length} insert=${rows?.filter(r=>r.action==='insert').length} update=${rows?.filter(r=>r.action==='update').length} skip=${rows?.filter(r=>r.action==='skip').length}`)

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows è obbligatorio e deve essere un array' }, { status: 400 })
    }
    if (!mode)         return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    let inserted  = 0
    let updated   = 0
    let skipped   = 0
    let conflicts = 0   // solo per travel — conflitti da risolvere nel Bridge
    const errors  = []

    // ── STEP 1: Inserisci nuove locations (hotel) ───────────
    const newLocationMap = await insertNewLocations(supabase, productionId, newLocations)

    // Suddividi le righe per action
    const insertRows = rows.filter(r => r.action === 'insert')
    const updateRows = rows.filter(r => r.action === 'update')
    const skipRows   = rows.filter(r => r.action === 'skip')
    skipped += skipRows.length

    // Determina il modo effettivo
    // 'hal' → usa detectedMode per capire come processare
    const effectiveMode = mode === 'hal' ? (detectedMode || 'crew') : mode

    // ── FLEET ───────────────────────────────────────────────
    if (effectiveMode === 'fleet') {
      const res = await processFleet(supabase, productionId, insertRows, updateRows, errors)
      inserted += res.inserted
      updated  += res.updated
      skipped  += res.skipped
    }

    // ── CREW ────────────────────────────────────────────────
    else if (effectiveMode === 'crew') {
      const res = await processCrew(supabase, productionId, insertRows, updateRows, newLocationMap, errors)
      inserted += res.inserted
      updated  += res.updated
      skipped  += res.skipped
    }

    // ── MIXED (HAL con crew + fleet) ────────────────────────
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

    // ── ACCOMMODATION ────────────────────────────────────────
    else if (effectiveMode === 'accommodation') {
      // 1. Se l'utente ha approvato nuovi crew dalla rooming list ("+Add all"), inseriscili
      //    tramite processCrew (che gestisce hotel_name + arrival/departure)
      if (insertRows.length > 0) {
        const insertRes = await processCrew(supabase, productionId, insertRows, [], newLocationMap, errors)
        inserted += insertRes.inserted
        skipped  += insertRes.skipped
      }
      // 2. Aggiorna crew esistenti con hotel/date (no null-only: overwrite sempre)
      const res = await processAccommodation(supabase, productionId, updateRows, newLocationMap, errors)
      updated  += res.updated
      skipped  += res.skipped
    }

    // ── TRAVEL ──────────────────────────────────────────────
    else if (effectiveMode === 'travel') {
      const res = await processTravelConfirm(supabase, productionId, insertRows, errors)
      inserted  += res.inserted
      skipped   += res.skipped
      conflicts  = res.conflicts || 0
    }

    // ── CUSTOM ──────────────────────────────────────────────
    // custom: le righe non vengono scritte automaticamente nel DB
    // (il flusso custom non ha una tabella target definita)
    // skipped già contato sopra; non facciamo insert/update

    // Includi conflicts nella response solo se > 0 (travel mode)
    return NextResponse.json({
      inserted,
      updated,
      skipped,
      errors,
      ...(conflicts > 0 ? { conflicts } : {}),
    })

  } catch (e) {
    console.error('[import/confirm]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
