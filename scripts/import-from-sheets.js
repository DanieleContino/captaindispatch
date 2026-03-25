#!/usr/bin/env node
/**
 * scripts/import-from-sheets.js
 *
 * One-time import: Excel (Google Sheets export) → Supabase
 * Importa: Hotels + Hubs → locations, Fleet → vehicles, Crew_Master → crew,
 *          Routes → routes, Lists(Service_Type) → service_types, Trips → trips + trip_passengers
 *
 * Usage:
 *   node scripts/import-from-sheets.js "C:\Users\WKS\Downloads\Captain by Daniele Contino 21_03 (6).xlsx"
 *
 * IMPORTANTE — RLS bypass:
 *   Con la ANON KEY le INSERT falliscono se RLS è abilitato.
 *   Aggiungi a .env.local:  SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   Trovala in: Supabase Dashboard → Settings → API → service_role (secret)
 *
 *   In alternativa, per il tempo dell'import:
 *   Supabase Dashboard → Table Editor → ogni tabella → Auth → Disable RLS
 */

'use strict'

const XLSX   = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const fs     = require('fs')
const path   = require('path')

// ─────────────────────────────────────────────
// 1. CARICA ENV
// ─────────────────────────────────────────────
function loadEnv () {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) throw new Error('.env.local non trovato in ' + path.dirname(envPath))
  const env = {}
  // Rimuove BOM UTF-8 (\uFEFF) e normalizza CRLF → LF
  const content = fs.readFileSync(envPath, 'utf8')
    .replace(/^\uFEFF/, '')   // strip BOM
    .replace(/\r\n/g, '\n')   // CRLF → LF
    .replace(/\r/g, '\n')     // CR → LF
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key) env[key] = val
  }
  return env
}

// ─────────────────────────────────────────────
// 2. UTILITY DATE / TIME
// ─────────────────────────────────────────────

/** Converte un valore cella Excel in stringa ISO date "YYYY-MM-DD", null se non valido */
function toISODate (val) {
  if (val instanceof Date) {
    const y = val.getUTCFullYear()
    if (y < 1900 || y > 2100) return null
    const m = String(val.getUTCMonth() + 1).padStart(2, '0')
    const d = String(val.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) {
      const y = parseInt(m[1])
      if (y >= 1900 && y <= 2100) return m[1]
    }
  }
  return null
}

/** Converte un valore cella Excel in minuti dalla mezzanotte (0-1439), null se non valido */
function toMinutes (val) {
  if (val instanceof Date) {
    const h = val.getUTCHours()
    const m = val.getUTCMinutes()
    // 1899-12-30 = serial 0 in Excel = midnight (00:00) — potrebbe essere una cella vuota
    if (val.getUTCFullYear() === 1899) return h * 60 + m  // 0 = mezzanotte
    // Per datetime completo (data reale), estrai solo la parte oraria
    return h * 60 + m
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{1,2}):(\d{2})/)
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
  }
  return null
}

/** Converte un valore cella Excel in timestamp ISO (con data), null se non valido */
function toTimestamp (val, fallbackDate) {
  if (val instanceof Date) {
    const y = val.getUTCFullYear()
    if (y < 1900 || y > 2100) return null
    // Se è 1899 è solo un'orario senza data — combina con fallbackDate
    if (y === 1899 && fallbackDate) {
      const h = String(val.getUTCHours()).padStart(2, '0')
      const mi = String(val.getUTCMinutes()).padStart(2, '0')
      return `${fallbackDate}T${h}:${mi}:00+00:00`
    }
    return val.toISOString()
  }
  return null
}

/** Converte "10:00" → "10:00:00" per colonna TIME di Postgres */
function toTimeString (val) {
  if (val instanceof Date) {
    const h = String(val.getUTCHours()).padStart(2, '0')
    const m = String(val.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}:00`
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{1,2}):(\d{2})/)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}:00`
  }
  return null
}

/** Null-safe string trim */
function str (val) {
  return (val === null || val === undefined) ? null : String(val).trim() || null
}

/** Null-safe integer */
function int (val) {
  if (val === null || val === undefined || val === '') return null
  const n = parseInt(val)
  return isNaN(n) ? null : n
}

// ─────────────────────────────────────────────
// 3. LEGGI FOGLIO EXCEL
// ─────────────────────────────────────────────
function readSheet (wb, sheetName) {
  const ws = wb.Sheets[sheetName]
  if (!ws) {
    console.warn(`  ⚠️  Foglio "${sheetName}" non trovato — saltato`)
    return []
  }
  return XLSX.utils.sheet_to_json(ws, { defval: null })
  // defval: null → celle vuote = null
  // cellDates: true è a livello di wb, quindi Date objects arrivano già qui
}

// ─────────────────────────────────────────────
// 4. ADAPTIVE UPSERT HELPER
// Rimuove automaticamente le colonne non presenti nello schema e riprova
// ─────────────────────────────────────────────
async function upsert (supabase, table, rows, conflictCol, label) {
  if (rows.length === 0) { console.log(`  ⏭  ${label}: nessun dato`); return }

  let currentRows = rows.map(r => ({ ...r }))  // copia per non modificare originali
  const skippedCols = []

  for (let attempt = 0; attempt < 15; attempt++) {
    // Prova upsert
    let res = await supabase
      .from(table)
      .upsert(currentRows, { onConflict: conflictCol, ignoreDuplicates: false })

    if (!res.error) {
      if (skippedCols.length > 0) {
        console.log(`  ✅ ${label}: ${currentRows.length} righe (colonne saltate: ${skippedCols.join(', ')})`)
      } else {
        console.log(`  ✅ ${label}: ${currentRows.length} righe`)
      }
      return
    }

    // Controlla se è un errore di colonna non scrivibile (mancante, GENERATED, ecc.)
    const colMatch =
      res.error.message.match(/Could not find the '([^']+)' column/) ||
      res.error.message.match(/cannot insert a non-DEFAULT value into column "([^"]+)"/) ||
      res.error.message.match(/column "([^"]+)" of relation "[^"]+" does not exist/) ||
      res.error.message.match(/cannot set an? \w+ column "([^"]+)"/)
    if (colMatch) {
      const missingCol = colMatch[1]
      skippedCols.push(missingCol)
      currentRows = currentRows.map(r => {
        const copy = { ...r }
        delete copy[missingCol]
        return copy
      })
      continue
    }

    // Errore di constraint mancante per upsert → fallback a insert ignorando duplicati
    if (res.error.message.includes('there is no unique or exclusion constraint') ||
        res.error.message.includes('onConflict')) {
      const { error: insertErr } = await supabase
        .from(table).insert(currentRows, { ignoreDuplicates: true })
      if (!insertErr) {
        if (skippedCols.length > 0) {
          console.log(`  ✅ ${label}: ${currentRows.length} righe (insert, colonne saltate: ${skippedCols.join(', ')})`)
        } else {
          console.log(`  ✅ ${label}: ${currentRows.length} righe (insert)`)
        }
        return
      }
      // Se anche insert fallisce per colonne, continua il loop
      const ic = insertErr.message.match(/Could not find the '([^']+)' column/)
      if (ic) {
        const mc = ic[1]
        skippedCols.push(mc)
        currentRows = currentRows.map(r => { const c = { ...r }; delete c[mc]; return c })
        continue
      }
      res.error = insertErr
    }

    // Errore genuino (non di schema)
    console.error(`  ❌ ${label}: ${res.error.message}`)
    if (res.error.message.includes('row-level security') || res.error.message.includes('RLS')) {
      console.error('     → La SERVICE_ROLE_KEY è necessaria per bypassare RLS')
    }
    throw res.error
  }

  throw new Error(`${label}: impossibile inserire dopo 15 tentativi di adattamento schema`)
}

// ─────────────────────────────────────────────
// 5. MAIN
// ─────────────────────────────────────────────
async function main () {
  const xlsxPath = process.argv[2]
  if (!xlsxPath) {
    console.error('Uso: node scripts/import-from-sheets.js <path-to-xlsx>')
    process.exit(1)
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error('File non trovato:', xlsxPath)
    process.exit(1)
  }

  // Credenziali
  const env = loadEnv()
  const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
  const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Credenziali Supabase mancanti in .env.local')
  if (!env['SUPABASE_SERVICE_ROLE_KEY']) {
    console.warn('\n⚠️  Usando ANON KEY — se le insert falliscono, aggiungi SUPABASE_SERVICE_ROLE_KEY a .env.local\n')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Leggi Excel
  console.log('📂 Lettura:', xlsxPath)
  const wb = XLSX.readFile(xlsxPath, { cellDates: true })

  // ── 5.1 PRODUCTION ────────────────────────────────────────────────────────
  console.log('\n[1/7] Productions...')
  const PROD_NAME = 'Captain Project — Palermo 2026'
  const PROD_SLUG = 'palermo-2026'
  let productionId

  // Helper: errore da colonna mancante (schema cache) — non è un errore reale
  const isSchemaErr = (e) => e && (
    e.message.includes('schema cache') ||
    e.message.includes('Could not find') ||
    e.message.includes('column') ||
    e.message.includes('violates not-null')
  )

  // 1) Cerca prima per nome (funziona sempre indipendentemente dallo schema)
  const { data: byName } = await supabase
    .from('productions').select('id').eq('name', PROD_NAME).maybeSingle()

  if (byName) {
    productionId = byName.id
    console.log(`  ♻️  Production trovata: ${productionId}`)
  } else {
    // 2) Tenta insert con payload progressivamente più semplice
    //    Ordine: schema nuovo (slug) → schema con code → solo name
    const payloads = [
      { name: PROD_NAME, slug: PROD_SLUG },
      { name: PROD_NAME, code: PROD_SLUG },
      { name: PROD_NAME },
    ]
    let inserted = false
    for (const payload of payloads) {
      const { data, error } = await supabase
        .from('productions').insert(payload).select('id').single()
      if (!error) {
        productionId = data.id
        console.log(`  ✅ Production creata: ${productionId} (payload: ${Object.keys(payload).join(', ')})`)
        if (!('slug' in payload)) {
          console.warn('  ⚠️  Esegui scripts/create-schema.sql in Supabase SQL Editor per lo schema completo')
        }
        inserted = true
        break
      }
      if (!isSchemaErr(error)) {
        // Errore genuino (non di schema) — non provare oltre
        console.error('  ❌ Production:', error.message)
        throw error
      }
      console.log(`  ℹ️  Payload ${JSON.stringify(payload)} non valido (${error.message.split('.')[0]}) — provo prossimo`)
    }
    if (!inserted) {
      throw new Error(
        'Impossibile creare production con nessun payload.\n' +
        '→ Esegui scripts/create-schema.sql in Supabase SQL Editor, poi rilancia lo script.'
      )
    }
  }

  // ── 5.2 LOCATIONS (Hotels + Hubs) ─────────────────────────────────────────
  console.log('\n[2/7] Locations (Hotels + Hubs)...')
  const hotelsRows   = readSheet(wb, 'Hotels')
  const hubsRows     = readSheet(wb, 'Hubs')

  const locations = []

  for (const r of hotelsRows) {
    const id = str(r['Pickup_ID'])
    if (!id) continue
    locations.push({
      id,
      production_id:        productionId,
      name:                 str(r['Hotel_Name']),
      is_hub:               false,
      lat:                  r['Lat']  != null ? parseFloat(String(r['Lat']).replace(',', '.'))  : null,
      lng:                  r['Lng']  != null ? parseFloat(String(r['Lng']).replace(',', '.'))  : null,
      default_pickup_point: str(r['Default_Pickup_Point']),
    })
  }

  for (const r of hubsRows) {
    const id = str(r['Pickup_ID'])
    if (!id) continue
    locations.push({
      id,
      production_id:        productionId,
      name:                 str(r['Hubs_Name']),
      is_hub:               true,
      lat:                  r['Lat']  != null ? parseFloat(String(r['Lat']).replace(',', '.'))  : null,
      lng:                  r['Lng']  != null ? parseFloat(String(r['Lng']).replace(',', '.'))  : null,
      default_pickup_point: str(r['Default_Pickup_Point']),
    })
  }

  await upsert(supabase, 'locations', locations, 'id', 'Locations')

  // ── 5.3 VEHICLES (Fleet) ──────────────────────────────────────────────────
  console.log('\n[3/7] Vehicles (Fleet)...')
  const fleetRows = readSheet(wb, 'Fleet')
  const vehicles  = []

  for (const r of fleetRows) {
    const id = str(r['Vehicle_ID'])
    if (!id) continue
    vehicles.push({
      id,
      production_id: productionId,
      vehicle_type:  str(r['Type']),
      capacity:      int(r['Capacity']),
      driver_name:   str(r['Driver_Name']),
      sign_code:     str(r['Sign_Code']),
      unit_default:  str(r['Unit_Default']),
      active:        true,
    })
  }

  await upsert(supabase, 'vehicles', vehicles, 'id', 'Vehicles')

  // ── 5.4 CREW (Crew_Master) ────────────────────────────────────────────────
  console.log('\n[4/7] Crew (Crew_Master)...')
  const crewRows = readSheet(wb, 'Crew_Master')
  const crew     = []
  // Mappa nome → crew_id (per trip_passengers)
  const nameToCrewId = {}

  for (const r of crewRows) {
    const id = str(r['Crew_ID'])
    // Salta righe formula (senza Crew_ID o con Full_Name che inizia con "[Formula")
    if (!id || id.startsWith('[')) continue
    const fullName = str(r['Full_Name'])
    if (!fullName || fullName.startsWith('[')) continue

    // Normalizza hotel_status
    const rawStatus = str(r['Hotel_Status'])
    const hotelStatus = ['CONFIRMED', 'PENDING', 'CHECKED_OUT'].includes(rawStatus)
      ? rawStatus : 'PENDING'

    // Normalizza travel_status
    const rawTravel = str(r['Travel_Status'])
    const travelStatus = ['IN', 'OUT', 'PRESENT'].includes(rawTravel) ? rawTravel : 'PRESENT'

    crew.push({
      id,
      production_id:  productionId,
      full_name:      fullName,
      department:     str(r['Dept']),
      hotel_id:       str(r['Hotel_ID']),
      hotel_status:   hotelStatus,
      travel_status:  travelStatus,
      arrival_date:   toISODate(r['Arrival_Date']),
      departure_date: toISODate(r['Departure_Date']),
      notes:          str(r['Notes']),
    })

    // Mappa nome (lowercase) → id per lookup trip_passengers
    nameToCrewId[fullName.toLowerCase()] = id
  }

  await upsert(supabase, 'crew', crew, 'id', 'Crew')

  // ── 5.5 SERVICE TYPES (Lists) ─────────────────────────────────────────────
  console.log('\n[5/7] Service Types (Lists)...')
  const listsRows    = readSheet(wb, 'Lists')
  const serviceTypes = []
  const serviceTypeMap = {}  // name → id (generato lato client per ora)
  let stOrder = 0

  // Genera UUID deterministico-like (uuid v4 fake per upsert) — usiamo insert+select
  // Raccogliamo solo i nomi unici non nulli dalla colonna Service_Type
  const stNames = new Set()
  for (const r of listsRows) {
    const name = str(r['Service_Type'])
    if (name && !name.startsWith('[')) stNames.add(name)
  }

  // Inserisci service_types e recupera gli id
  for (const name of stNames) {
    const { data: existing } = await supabase
      .from('service_types')
      .select('id')
      .eq('production_id', productionId)
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      serviceTypeMap[name] = existing.id
    } else {
      const { data: inserted, error: stErr } = await supabase
        .from('service_types')
        .insert({ production_id: productionId, name, sort_order: stOrder++ })
        .select('id')
        .single()
      if (stErr) {
        console.error(`  ❌ ServiceType "${name}": ${stErr.message}`)
      } else {
        serviceTypeMap[name] = inserted.id
      }
    }
  }
  console.log(`  ✅ Service Types: ${stNames.size} tipi (${Object.keys(serviceTypeMap).join(', ')})`)

  // ── 5.6 ROUTES ────────────────────────────────────────────────────────────
  console.log('\n[6/7] Routes...')
  const routesRows  = readSheet(wb, 'Routes')
  const routes      = []
  // ID placeholder senza dati reali (H007-H010)
  const PLACEHOLDER = /^H0(0[7-9]|10)$/

  // Location IDs validi (per validare FK)
  const validLocationIds = new Set(locations.map(l => l.id))

  for (const r of routesRows) {
    const fromId = str(r['From_ID'])
    const toId   = str(r['To_ID'])
    // Salta righe senza ID, placeholder, o senza durata
    if (!fromId || !toId) continue
    if (PLACEHOLDER.test(fromId) || PLACEHOLDER.test(toId)) continue
    const duration = int(r['Duration'])
    if (duration === null || duration <= 0) continue
    // Salta se le location non esistono (potrebbero non essere nel foglio Hotels)
    if (!validLocationIds.has(fromId) || !validLocationIds.has(toId)) {
      console.warn(`  ⚠️  Rotta saltata — location sconosciuta: ${fromId} → ${toId}`)
      continue
    }

    const rawSource = str(r['Source'])
    const source = ['ORS', 'AUTO', 'MANUAL'].includes(rawSource) ? rawSource : 'AUTO'

    routes.push({
      production_id: productionId,
      from_id:       fromId,
      to_id:         toId,
      duration_min:  duration,
      source,
    })
  }

  await upsert(supabase, 'routes', routes, 'production_id,from_id,to_id', 'Routes')

  // ── 5.7 TRIPS + TRIP_PASSENGERS ───────────────────────────────────────────
  console.log('\n[7/7] Trips + Trip_Passengers...')
  const tripsRows = readSheet(wb, 'Trips')
  const trips     = []
  // trip_passengers: array di { trip_row_id (placeholder), trip_id, crew_names[] }
  // Risolveremo trip_row_id dopo l'insert dei trip
  const tripPaxPending = []

  for (const r of tripsRows) {
    const tripId = str(r['Trip_ID'])
    if (!tripId || tripId.startsWith('[')) continue

    const dateISO   = toISODate(r['Date'])
    if (!dateISO) continue  // riga senza data valida → salta

    // Pickup_ID e Dropoff_ID (colonne con gli ID veri, non i nomi display)
    const pickupId  = str(r['Pickup_ID'])
    const dropoffId = str(r['Dropoff_ID'])
    if (!pickupId || !dropoffId) continue

    // Tempi
    const callMin   = toMinutes(r['Call'])
    const pickupMin = toMinutes(r['Pickup_Time'])
    const startDt   = toTimestamp(r['Start_DT'], dateISO)
    const endDt     = toTimestamp(r['End_DT'],   dateISO)

    // Arr_Time → colonna TIME (es. "10:00:00")
    const arrTimeStr = toTimeString(r['Arr_Time'])

    // Service type lookup
    const stName    = str(r['Service_Type'])
    const stId      = stName ? (serviceTypeMap[stName] || null) : null

    // Status
    const rawStatus  = str(r['Status'])
    const validStatuses = ['PLANNED', 'BUSY', 'DONE', 'CANCELLED']
    const status = validStatuses.includes(rawStatus) ? rawStatus : 'PLANNED'

    // Pax count
    const paxCount  = int(r['Pax_Count(auto)']) ?? int(r['Pax_Count']) ?? 0

    // Vehicle (validazione FK opzionale)
    const vehicleId = str(r['Vehicle_ID'])

    trips.push({
      production_id:      productionId,
      trip_id:            tripId,
      date:               dateISO,
      vehicle_id:         vehicleId,
      driver_name:        str(r['Driver_Name(auto)']) || str(r['Driver_Name']),
      sign_code:          str(r['Sign_Code(auto)'])   || str(r['Sign_Code']),
      capacity:           int(r['Capacity(auto)'])    ?? int(r['Capacity']),
      pickup_id:          pickupId,
      dropoff_id:         dropoffId,
      // transfer_class è GENERATED — NON includere
      arr_time:           arrTimeStr,
      call_min:           callMin,
      pickup_min:         pickupMin,
      duration_min:       int(r['Duration_Min']),
      start_dt:           startDt,
      end_dt:             endDt,
      meeting_point:      str(r['Meeting_Point(auto)']) || str(r['Meeting_Point']),
      service_type_id:    stId,
      pax_count:          paxCount,
      passenger_list:     str(r['Passenger_List(auto)']) || str(r['Passenger_List']),
      pax_conflict_flag:  str(r['PaxConflict_Flag']),
      flight_no:          str(r['Flight/Train_No']),
      notes:              str(r['Notes']),
      status,
    })

    // Raccoglie passeggeri per questo trip row
    const paxListRaw = str(r['Passenger_List(auto)']) || str(r['Passenger_List'])
    if (paxListRaw && paxCount > 0) {
      const names = paxListRaw.split(',').map(n => n.trim()).filter(Boolean)
      if (names.length > 0) {
        tripPaxPending.push({ tripId, dateISO, pickupId, dropoffId, names })
      }
    }
  }

  // Insert trips in batch
  const BATCH = 50
  const insertedTripRows = []
  for (let i = 0; i < trips.length; i += BATCH) {
    const batch = trips.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('trips')
      .upsert(batch, {
        onConflict: 'production_id,trip_id,pickup_id,dropoff_id,date',
        ignoreDuplicates: false,
      })
      .select('id,trip_id,pickup_id,dropoff_id,date')
    if (error) {
      // Alcune tabelle potrebbero non avere ancora il constraint unico su quei campi
      // Prova insert semplice ignorando duplicati
      const { data: d2, error: e2 } = await supabase
        .from('trips')
        .insert(batch, { onConflict: 'production_id,trip_id,pickup_id,dropoff_id,date' })
        .select('id,trip_id,pickup_id,dropoff_id,date')
      if (e2) {
        console.error(`  ❌ Trips batch ${i}-${i+BATCH}: ${e2.message}`)
        throw e2
      }
      if (d2) insertedTripRows.push(...d2)
    } else {
      if (data) insertedTripRows.push(...data)
    }
  }
  console.log(`  ✅ Trips: ${trips.length} righe`)

  // ── 5.8 TRIP_PASSENGERS ───────────────────────────────────────────────────
  // Costruisce una mappa (trip_id + pickup_id + dropoff_id + date) → row uuid
  const tripRowMap = {}
  for (const t of insertedTripRows) {
    const key = `${t.trip_id}|${t.pickup_id}|${t.dropoff_id}|${t.date}`
    tripRowMap[key] = t.id
  }

  // Se insertedTripRows è vuoto (upsert non ha restituito dati), recupera le righe
  if (insertedTripRows.length === 0 && trips.length > 0) {
    console.log('  ℹ️  Recupero trip_row IDs dal DB...')
    const { data: dbTrips } = await supabase
      .from('trips')
      .select('id,trip_id,pickup_id,dropoff_id,date')
      .eq('production_id', productionId)
    if (dbTrips) {
      for (const t of dbTrips) {
        const key = `${t.trip_id}|${t.pickup_id}|${t.dropoff_id}|${t.date}`
        tripRowMap[key] = t.id
      }
    }
  }

  // Costruisce trip_passengers
  const tripPax = []
  let unmatchedCrew = 0

  for (const { tripId, dateISO, pickupId, dropoffId, names } of tripPaxPending) {
    const key       = `${tripId}|${pickupId}|${dropoffId}|${dateISO}`
    const tripRowId = tripRowMap[key]
    if (!tripRowId) {
      console.warn(`  ⚠️  trip_row non trovato per key: ${key}`)
      continue
    }
    for (const name of names) {
      const crewId = nameToCrewId[name.toLowerCase()]
      if (!crewId) {
        console.warn(`  ⚠️  Crew non trovata: "${name}" (trip ${tripId})`)
        unmatchedCrew++
        continue
      }
      tripPax.push({
        production_id: productionId,
        trip_row_id:   tripRowId,
        crew_id:       crewId,
      })
    }
  }

  if (tripPax.length > 0) {
    const { error: tpErr } = await supabase
      .from('trip_passengers')
      .upsert(tripPax, { onConflict: 'trip_row_id,crew_id', ignoreDuplicates: true })
    if (tpErr) {
      console.error(`  ❌ Trip_Passengers: ${tpErr.message}`)
    } else {
      console.log(`  ✅ Trip_Passengers: ${tripPax.length} assegnazioni`)
    }
  } else {
    console.log(`  ⏭  Trip_Passengers: nessuna assegnazione da importare`)
  }
  if (unmatchedCrew > 0) {
    console.warn(`  ⚠️  ${unmatchedCrew} nomi crew non risolti (verifica maiuscole/spazi)`)
  }

  // ── RIEPILOGO ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  console.log('✅ IMPORT COMPLETATO')
  console.log(`   Production ID : ${productionId}`)
  console.log(`   Locations     : ${locations.length}`)
  console.log(`   Vehicles      : ${vehicles.length}`)
  console.log(`   Crew          : ${crew.length}`)
  console.log(`   Service Types : ${stNames.size}`)
  console.log(`   Routes        : ${routes.length}`)
  console.log(`   Trips         : ${trips.length}`)
  console.log(`   Trip Pax      : ${tripPax.length}`)
  console.log('─'.repeat(60))
  console.log('\nℹ️  Prossimo step:')
  console.log('   Salva il production_id nelle variabili d\'ambiente:')
  console.log(`   NEXT_PUBLIC_PRODUCTION_ID=${productionId}`)
}

main().catch(err => {
  console.error('\n💥 ERRORE FATALE:', err.message || err)
  process.exit(1)
})
