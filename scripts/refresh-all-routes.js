#!/usr/bin/env node
/**
 * Refresh ALL routes in the `routes` table using Google Maps Routes API.
 * Replaces ORS / AUTO / legacy durations with real Google values.
 *
 * Usage:
 *   node scripts/refresh-all-routes.js
 *
 * Requirements:
 *   - .env.local deve contenere NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *     GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_PRODUCTION_ID
 */

const fs   = require('fs')
const path = require('path')

// ─── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv () {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) { console.error('❌ .env.local not found'); process.exit(1) }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const raw of lines) {
    const line = raw.trim()   // rimuove \r (CRLF Windows) e spazi
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
}
loadEnv()

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const GOOGLE_KEY     = process.env.GOOGLE_MAPS_API_KEY
const PRODUCTION_ID  = process.env.NEXT_PUBLIC_PRODUCTION_ID

const GOOGLE_URL     = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO       = 5     // arrotonda a multipli di 5 min
const MIN_MIN        = 5     // minimo 5 min
const DELAY_MS       = 200   // ms tra ogni chiamata Google (evita quota errors)

// ─── Supabase REST helper (service role) ─────────────────────────────────────
async function sb (endpoint, opts = {}) {
  const url = SUPABASE_URL + '/rest/v1' + endpoint
  const res  = await fetch(url, {
    ...opts,
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Supabase ${opts.method || 'GET'} ${endpoint}: ${res.status} — ${txt}`)
  }
  const txt = await res.text()
  return txt ? JSON.parse(txt) : null
}

// ─── Google Maps Routes API ───────────────────────────────────────────────────
async function googleDuration (lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key':   GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify({
        origin:                   { location: { latLng: { latitude: lat1, longitude: lng1 } } },
        destination:              { location: { latLng: { latitude: lat2, longitude: lng2 } } },
        travelMode:               'DRIVE',
        routingPreference:        'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        languageCode:             'it-IT',
        units:                    'METRIC',
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) { const t = await res.text(); console.error('Google HTTP error:', res.status, t.slice(0, 200)); return null }
    const json  = await res.json()
    const route = json?.routes?.[0]
    if (!route?.duration) return null
    const secs = parseInt(route.duration.replace('s', ''), 10)
    if (!isFinite(secs) || secs <= 0) return null
    return {
      duration_min: Math.max(MIN_MIN, Math.round(secs / 60 / ROUND_TO) * ROUND_TO),
      distance_km:  Math.round((route.distanceMeters || 0) / 100) / 10,
    }
  } catch (e) {
    console.error('Google exception:', e.message)
    return null
  }
}

function delay (ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main () {
  // Sanity check
  if (!SUPABASE_URL || !SERVICE_KEY || !GOOGLE_KEY || !PRODUCTION_ID) {
    console.error('❌ Missing env vars — controlla .env.local:')
    if (!SUPABASE_URL)  console.error('   NEXT_PUBLIC_SUPABASE_URL')
    if (!SERVICE_KEY)   console.error('   SUPABASE_SERVICE_ROLE_KEY')
    if (!GOOGLE_KEY)    console.error('   GOOGLE_MAPS_API_KEY')
    if (!PRODUCTION_ID) console.error('   NEXT_PUBLIC_PRODUCTION_ID')
    process.exit(1)
  }

  console.log('═══════════════════════════════════════════════════════')
  console.log('  🗺️  Captain Dispatch — Refresh All Routes with Google  ')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Production:   ${PRODUCTION_ID}`)
  console.log(`  Supabase:     ${SUPABASE_URL}`)
  console.log(`  Delay:        ${DELAY_MS}ms tra ogni chiamata`)
  console.log('═══════════════════════════════════════════════════════\n')

  // 1. Carica tutte le rotte della produzione
  const routes = await sb(
    `/routes?production_id=eq.${encodeURIComponent(PRODUCTION_ID)}&select=from_id,to_id,duration_min,source`
  )
  if (!routes || routes.length === 0) {
    console.log('⚠️  Nessuna rotta trovata nella tabella routes per questa produzione.')
    return
  }
  console.log(`📌 Trovate ${routes.length} rotte da aggiornare\n`)

  // 2. Carica tutte le location con coordinate
  const locations = await sb(
    `/locations?production_id=eq.${encodeURIComponent(PRODUCTION_ID)}&select=id,name,lat,lng`
  )
  const coordMap = {}
  for (const l of locations || []) {
    if (l.lat != null && l.lng != null) {
      coordMap[l.id] = {
        lat:  parseFloat(l.lat),
        lng:  parseFloat(l.lng),
        name: l.name || l.id,
      }
    }
  }
  const withCoords  = Object.keys(coordMap).length
  const totalLocs   = (locations || []).length
  console.log(`📍 Location con coordinate: ${withCoords}/${totalLocs}`)
  if (withCoords < totalLocs) {
    const missing = (locations || []).filter(l => !coordMap[l.id]).map(l => `     - ${l.name || l.id}`)
    console.log(`   ⚠️  Senza coordinate (verranno saltate):`)
    missing.forEach(m => console.log(m))
  }
  console.log('')

  // 3. Loop su tutte le rotte
  let updated = 0, skipped = 0, errors = 0
  const skippedList = []
  const errorList   = []

  for (let i = 0; i < routes.length; i++) {
    const r    = routes[i]
    const from = coordMap[r.from_id]
    const to   = coordMap[r.to_id]
    const idx  = `[${String(i + 1).padStart(3, ' ')}/${routes.length}]`

    if (!from || !to) {
      const label = `${r.from_id} → ${r.to_id}`
      process.stdout.write(`  ⚠  ${idx} ${label}: coordinate mancanti — saltata\n`)
      skipped++
      skippedList.push(label)
      continue
    }

    const fromName = from.name.split(' ').slice(0, 4).join(' ')
    const toName   = to.name.split(' ').slice(0, 4).join(' ')
    process.stdout.write(`  🔄 ${idx} ${fromName} → ${toName}... `)

    const result = await googleDuration(from.lat, from.lng, to.lat, to.lng)

    if (!result) {
      process.stdout.write('❌ Google API failed\n')
      errors++
      errorList.push(`${fromName} → ${toName}`)
      await delay(DELAY_MS * 2)  // attendi di più dopo un errore
      continue
    }

    // PATCH della singola riga nel DB
    try {
      await sb(
        `/routes?production_id=eq.${encodeURIComponent(PRODUCTION_ID)}&from_id=eq.${encodeURIComponent(r.from_id)}&to_id=eq.${encodeURIComponent(r.to_id)}`,
        {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            duration_min: result.duration_min,
            distance_km:  result.distance_km,
            source:       'google',
            updated_at:   new Date().toISOString(),
          }),
        }
      )
      const diff = r.duration_min ? ` [era: ${r.duration_min}min ${r.source || '?'}]` : ' [nuovo]'
      process.stdout.write(`✅ ${result.duration_min} min · ${result.distance_km} km${diff}\n`)
      updated++
    } catch (e) {
      process.stdout.write(`❌ DB error: ${e.message}\n`)
      errors++
      errorList.push(`${fromName} → ${toName} (DB error)`)
    }

    await delay(DELAY_MS)
  }

  // 4. Riepilogo
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  RIEPILOGO')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  ✅ Aggiornate:  ${updated}/${routes.length}`)
  console.log(`  ⚠️  Saltate:    ${skipped} (coordinate mancanti)`)
  console.log(`  ❌ Errori:     ${errors}`)
  console.log('═══════════════════════════════════════════════════════')

  if (skippedList.length > 0) {
    console.log('\n💡 Aggiungi lat/lng per queste location in /dashboard/locations, poi riesegui lo script:')
    skippedList.forEach(s => console.log(`   - ${s}`))
  }
  if (errorList.length > 0) {
    console.log('\n⚠️  Rotte con errore Google — riprova singolarmente:')
    errorList.forEach(e => console.log(`   - ${e}`))
  }

  if (updated > 0) {
    console.log('\n🎉 Routes aggiornate! Ora riesegui un trip multi-stop per vedere i tempi corretti.')
    console.log('   (Apri un trip multi-stop in EditTripSidebar e risalva → ricalcolerà i pickup_min)')
  }
}

main().catch(e => { console.error('\n💥 Errore fatale:', e.message); process.exit(1) })
