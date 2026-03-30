/**
 * /api/import/parse
 *
 * POST (multipart/form-data)
 *
 * Input fields:
 *   file         — il file da importare (.xlsx, .xls, .csv, .pdf, .docx)
 *   mode         — 'hal' | 'fleet' | 'crew' | 'custom'
 *   instructions — (opzionale) istruzioni aggiuntive / prompt libero per 'custom'
 *   productionId — UUID produzione attiva
 *
 * Flusso:
 *   1. Estrae testo dal file (xlsx/csv → XLSX, pdf → pdf-parse, docx → mammoth)
 *   2. Chiama Claude API con system prompt specifico per mode
 *   3. Duplicate detection su Supabase
 *   4. Hotel matching crew: confronta hotel estratti con locations Supabase
 *   5. Return: { rows, newData: { hotels: [] }, detectedMode }
 *
 * Row shape (fleet):
 *   action, existingId, driver_name, vehicle_type, plate, sign_code,
 *   capacity, pax_suggested, pax_max, available_from, available_to
 *
 * Row shape (crew):
 *   action, existingId, first_name, last_name, role, department,
 *   phone, email, active, hotel, hotel_id, hotelNotFound,
 *   arrival_date, departure_date
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { normalizeDept } from '@/lib/normalizeDept'

// ── System prompts Claude ────────────────────────────────────

const SYSTEM_PROMPT_HAL = `You are analyzing a film/TV production document.
First, identify what type of document this is.
Then extract all available information accordingly.
If the document contains multiple types of data, extract all of them.

Rules:
- Detect document type automatically
- For crew: extract first_name, last_name, role, department, phone, email, active
- For fleet: extract driver_name, vehicle_type, plate, sign_code, pax_suggested, pax_max
- For accommodation: extract first_name, last_name, hotel, arrival_date, departure_date
- If "not started" appears next to a role, set active: false, otherwise active: true
- Department canonical mapping (section headings):
  CAMERAS/CAMERA DEPARTMENT → CAMERA | GRIPS/GRIP DEPARTMENT → GRIP
  ELECTRICS/ELECTRICAL/LIGHTING/GAFFERS/ELETTRICISTI → ELECTRIC | AUDIO/SOUNDS/SUONO → SOUND
  ART DEPARTMENT/PRODUCTION DESIGN/SCENOGRAFIA → ART | COSTUMES/WARDROBE/COSTUMI → COSTUME
  MAKE UP/MAKE-UP/TRUCCO → MAKEUP | HAIR & MAKE UP/HAIR AND MAKEUP/H&MU/PARRUCCHIERI/TRUCCO E PARRUCCHIERI → HMU
  PRODUCTION DEPARTMENT/PROD/PRODUZIONE → PRODUCTION | TRANSPORTATION/DRIVERS/TRASPORTI → TRANSPORT
  ASSISTANT DIRECTORS/ASSISTANT DIRECTOR/ADS/1ST AD/AIUTO REGIA → AD | PROPERTY/PROPERTIES → PROPS
  SET DEC & SET DRESSING/SET DECORATION/SET DRESSING/ARREDAMENTO → SET DEC
  ACCOUNTS/FINANCE/PAYROLL/AMMINISTRAZIONE → ACCOUNTING | WRITERS/WRITER/EXECUTIVE PRODUCERS → PRODUCERS
  CRAFT SERVICE/CRAFTY/MENSA → CATERING | SECURITY DEPARTMENT/GUARDS/SICUREZZA → SECURITY
  MEDIC/HEALTH AND SAFETY/H&S/FIRST AID → MEDICAL | VISUAL EFFECTS/VFX DEPARTMENT/SPECIAL EFFECTS/SFX → VFX
  DIRECTORS/DIRECTOR/REGIA → DIRECTING | ACTORS/TALENT/EXTRAS/ATTORI/COMPARSE → CAST
  LOCATION/LOCATION DEPARTMENT/SCOUTS/SOPRALLUOGHI → LOCATIONS
- Director of Photography always → CAMERA (never DIRECTING)
- EXCEPTION — role overrides section: person with role "Director" (standalone), "2nd Unit Director", "Insert Director" → always DIRECTING, even if listed under a PRODUCERS/WRITERS/DIRECTORS section heading
- Vehicle type inference: Transit/Sprinter/Vito→VAN, Panda/Giulia/Model3→CAR, Tourismo/Irizar→BUS
- If a field is not found, return null
- Return ONLY a valid JSON object, no markdown, no explanation, no backticks

Return format:
{
  "type": "crew" | "fleet" | "accommodation" | "mixed",
  "crew": [...],
  "vehicles": [...],
  "accommodation": [...]
}`

const SYSTEM_PROMPT_FLEET = `You extract vehicle fleet data from documents.
Return ONLY a raw JSON array, no backticks, no markdown, no explanation.
Fields per vehicle:
  driver_name    (string|null)
  vehicle_type   ("VAN"|"CAR"|"BUS", default "VAN")
  plate          (license plate string uppercase|null)
  sign_code      (vehicle ID or call sign|null)
  capacity       (number|null)
  pax_suggested  (number|null)
  pax_max        (number|null)
  available_from ("YYYY-MM-DD"|null)
  available_to   ("YYYY-MM-DD"|null)
If a field cannot be determined, use null. Never invent values.
IMPORTANT: Each row in the document represents a DISTINCT vehicle entry. Return ALL rows found,
even if they appear identical (same type, no driver, no plate). Do NOT merge, deduplicate or summarize rows.

PRIORITY RULE: If the user provides "Additional instructions" about column mappings or field meanings,
follow them STRICTLY and they override any default interpretation below.

Default column interpretation for budget/cost sheet format (apply only when no user instructions override):
- First column (BRAND/TYPE): map to vehicle_type — MERCEDES/NCC/MINIVAN/MINIVAN CREW → "VAN", AUTO/DOBLO/PASINO → "CAR", BUS/TRUCK/DUCATO/PUP/75Q/CAMION → "BUS"; when in doubt default to "VAN"
- Second column (MODEL): use as plate ONLY if it looks like a vehicle plate (e.g. "AB 123 CD", "GR 448 JY"); otherwise null
- Third column (DRIVER): driver_name ONLY if it is a real person's full name or surname; IGNORE department siglas/abbreviations like "SD", "TBC", "A CHIAMATA", "TRANSP. DEPT.", "CO LINE PRODUCER", "DRIVERS CINETECNICA" etc.
- Fourth column (DEPT./ROLE): use as sign_code (the department or role label the vehicle is assigned to)
- Columns whose meaning is not specified by the user and not listed above (e.g. cost, quantity, totals): ignore
- Subtotal rows, header rows, summary rows: skip — do NOT include them as vehicle entries
- Rows with no vehicle type info in the first column (e.g. completely empty or just spaces): skip`

const SYSTEM_PROMPT_CREW = `You extract crew member data from film/TV production crew list documents.
Return ONLY a raw JSON array, no backticks, no markdown, no explanation.
Fields per person:
  first_name   (string|null)
  last_name    (string|null)
  role         (string|null — exact job title as written in the document, e.g. "Director of Photography", "Gaffer", "1st AC", "Key Grip", "Production Coordinator")
  department   (one of: CAMERA, GRIP, ELECTRIC, SOUND, ART, COSTUME, MAKEUP, PRODUCTION, TRANSPORT,
               HMU, AD, PROPS, SET DEC, ACCOUNTING, PRODUCERS, CATERING, SECURITY, MEDICAL, VFX,
               DIRECTING, CAST, LOCATIONS, OTHER —
               Use the section heading to determine department; apply these mappings:
               CAMERAS/CAMERA DEPARTMENT → CAMERA | GRIPS/GRIP DEPARTMENT → GRIP
               ELECTRICS/ELECTRICAL/LIGHTING/GAFFERS/ELETTRICISTI → ELECTRIC
               AUDIO/SOUNDS/SUONO → SOUND
               ART DEPARTMENT/ART DEPT/PRODUCTION DESIGN/SCENOGRAFIA → ART
               COSTUMES/WARDROBE/COSTUME DEPARTMENT/COSTUMI → COSTUME
               MAKE UP/MAKE-UP/MAKEUP DEPARTMENT/TRUCCO → MAKEUP
               HAIR & MAKE UP/HAIR AND MAKEUP/HAIR & MAKEUP/H&MU/PARRUCCHIERI/TRUCCO E PARRUCCHIERI → HMU
               PRODUCTION DEPARTMENT/PROD/PRODUCTION OFFICE/PRODUZIONE → PRODUCTION
               TRANSPORTATION/TRANSPORTS/DRIVERS/TRASPORTI → TRANSPORT
               ASSISTANT DIRECTORS/ASSISTANT DIRECTOR/ADS/1ST AD/2ND AD/AIUTO REGIA → AD
               PROPERTY/PROPERTIES/PROP → PROPS
               SET DEC & SET DRESSING/SET DECORATION/SET DRESSING/ARREDAMENTO → SET DEC
               ACCOUNTS/FINANCE/PAYROLL/AMMINISTRAZIONE → ACCOUNTING
               WRITERS/WRITER/EXECUTIVE PRODUCERS/PRODUTTORI → PRODUCERS
               CRAFT SERVICE/CRAFT SERVICES/CRAFTY/MENSA → CATERING
               SECURITY DEPARTMENT/GUARDS/SICUREZZA → SECURITY
               HEALTH AND SAFETY/H&S/FIRST AID/MEDIC/SET MEDIC → MEDICAL
               VISUAL EFFECTS/VFX DEPARTMENT/SPECIAL EFFECTS/SFX/EFFETTI VISIVI → VFX
               DIRECTORS/DIRECTOR/DIRECTION/REGIA → DIRECTING
               ACTORS/ACTOR/TALENT/EXTRAS/SUPPORTING ARTISTS/ATTORI/COMPARSE → CAST
               LOCATION/LOCATION DEPARTMENT/SCOUTS/SOPRALLUOGHI → LOCATIONS
               If no section heading, infer from role:
               DOP/DP/Director of Photography/Focus Puller/1st AC/2nd AC/Camera Operator/Clapper/DIT → CAMERA
               Gaffer/Best Boy Electric/Spark/Electrician/Lighting Technician → ELECTRIC
               Key Grip/Dolly Grip/Best Boy Grip → GRIP
               Sound Recordist/Boom Operator/Sound Mixer → SOUND
               Production Designer/Art Director/Set Designer/Draughtsman → ART
               Props Master/Standby Props → PROPS
               Set Decorator/Set Dresser/Buyer (set) → SET DEC
               Costume Designer/Wardrobe Supervisor/Dresser/Costume Standby → COSTUME
               Makeup Artist/Makeup Supervisor → MAKEUP
               Hair Stylist/Hair Supervisor → HMU
               1st AD/2nd AD/3rd AD → AD
               Location Manager/Location Scout → LOCATIONS
               Transport Coordinator/Transport Captain/Driver/Chauffeur → TRANSPORT
               Producer/Line Producer/Executive Producer/Co-Producer → PRODUCERS
               Director/2nd Unit Director → DIRECTING
               Actor/Actress/Performer → CAST
               VFX Supervisor/VFX Artist/Compositor → VFX
               SFX Supervisor/SFX Technician → VFX
               Set Medic/Nurse/Paramedic → MEDICAL
               Security Guard → SECURITY
               Caterer/Craft Service → CATERING
               Production Accountant/Payroll → ACCOUNTING
               Runner/PA/Production Assistant → PRODUCTION
               IMPORTANT: Director of Photography → CAMERA, never DIRECTING.
               EXCEPTION — role overrides section: person with role "Director" (standalone), "2nd Unit Director", "Insert Director" → DIRECTING even if section heading is PRODUCERS/WRITERS/DIRECTORS.
               This exception does NOT apply to: "Art Director"→ART, "1st AD/2nd AD/Assistant Director"→AD, "Casting Director"→CAST, "Creative Director"→PRODUCERS)
  phone        (string|null — prefer mobile number if multiple; take the one marked C or mobile)
  email        (string|null)
  active       (boolean — true by default; set false if "not started" appears next to the person)
Never invent values. If absent, use null.`

// ── Helpers ──────────────────────────────────────────────────

/**
 * Estrae testo dal file in base all'estensione.
 */
async function extractTextFromFile(buffer, filename, instructions = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase()

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')
    const data = await pdfParse(buffer)
    return data.text || ''
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const XLSX = require('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    let targetSheet = workbook.SheetNames[0]
    if (instructions && workbook.SheetNames.length > 1) {
      const lower = instructions.toLowerCase()
      const exactMatch = workbook.SheetNames.find(n => lower.includes(n.toLowerCase()))
      if (exactMatch) {
        targetSheet = exactMatch
      } else {
        const byIndex = lower.match(/(?:foglio|sheet)\s*(\d+)/i)
        if (byIndex) {
          const idx = parseInt(byIndex[1]) - 1
          if (idx >= 0 && idx < workbook.SheetNames.length) {
            targetSheet = workbook.SheetNames[idx]
          }
        }
      }
    }

    console.log(`[import/parse] XLSX: using sheet "${targetSheet}" (available: ${workbook.SheetNames.join(', ')})`)
    const sheet = workbook.Sheets[targetSheet]
    const rawCsv = XLSX.utils.sheet_to_csv(sheet)

    const csvLines = rawCsv.split('\n')
    const cleanedLines = csvLines
      .map(line => {
        const fields = line.split(',')
        while (fields.length > 0 && fields[fields.length - 1].trim() === '') {
          fields.pop()
        }
        return fields.join(',')
      })
      .filter(line => line.trim() !== '')
    const csvText = cleanedLines.join('\n')
    console.log(`[import/parse] CSV: ${rawCsv.length} chars → ${csvText.length} chars after trailing-cell strip`)
    return csvText
  }

  throw new Error(`Formato non supportato: .${ext}. Usa .xlsx, .xls, .csv, .pdf o .docx`)
}

/**
 * Chiama Claude API.
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {'array'|'object'} returnType — 'array' (default) o 'object' per HAL
 */
async function callClaude(systemPrompt, userContent, returnType = 'array') {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const rawText = (data.content?.[0]?.text || '').trim()

  if (returnType === 'object') {
    // Strategia 1: blocco ```json
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim())
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch (_) { /* try next */ }
    }
    // Strategia 2: trova { ... }
    const objStart = rawText.indexOf('{')
    const objEnd   = rawText.lastIndexOf('}')
    if (objStart !== -1 && objEnd > objStart) {
      try {
        const parsed = JSON.parse(rawText.slice(objStart, objEnd + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch (_) { /* try next */ }
    }
    // Strategia 3: parse diretto
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('Claude non ha restituito un oggetto JSON')
  }

  // returnType === 'array'
  // Strategia 1: blocco ```json
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* try next */ }
  }
  // Strategia 2: trova [ ... ]
  const arrStart = rawText.indexOf('[')
  const arrEnd   = rawText.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const parsed = JSON.parse(rawText.slice(arrStart, arrEnd + 1))
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* try next */ }
  }
  // Strategia 3: parse diretto
  const parsed = JSON.parse(rawText)
  if (Array.isArray(parsed)) return parsed
  throw new Error(`Claude ha restituito JSON non valido: ${rawText.slice(0, 300)}`)
}

// ── Helpers: normalizzazione righe ───────────────────────────

// normalizeDept importata da lib/normalizeDept.js

/** Normalizza una riga crew proveniente da Claude */
function normalizeCrew(r) {
  return {
    first_name:     r.first_name    || null,
    last_name:      r.last_name     || null,
    role:           r.role          || null,
    department:     normalizeDept(r.department),
    phone:          r.phone         || null,
    email:          r.email         || null,
    active:         r.active !== false,   // default true
    hotel:          r.hotel         || null,
    arrival_date:   r.arrival_date  || null,
    departure_date: r.departure_date|| null,
  }
}

/** Normalizza una riga fleet proveniente da Claude */
function normalizeFleet(r) {
  return {
    driver_name:    r.driver_name    || null,
    vehicle_type:   r.vehicle_type   || 'VAN',
    plate:          r.plate          ? r.plate.toUpperCase() : null,
    sign_code:      r.sign_code      || null,
    capacity:       r.capacity       ?? null,
    pax_suggested:  r.pax_suggested  ?? null,
    pax_max:        r.pax_max        ?? null,
    available_from: r.available_from || null,
    available_to:   r.available_to   || null,
  }
}

// ── Duplicate detection + hotel matching ─────────────────────

async function processFleetRows(rawRows, supabase, productionId) {
  const { data: existingVehicles } = await supabase
    .from('vehicles')
    .select('id, license_plate, driver_name, vehicle_type, capacity, pax_suggested, pax_max, sign_code, available_from, available_to')
    .eq('production_id', productionId)

  return rawRows.map(raw => {
    const row = normalizeFleet(raw)
    let action = 'insert'
    let existingId = null
    let existingData = null
    let newFields = []

    // Match per targa (priorità) poi per nome autista
    let matchedVehicle = null
    if (row.plate) {
      matchedVehicle = (existingVehicles || []).find(v =>
        v.license_plate && v.license_plate.toUpperCase() === row.plate.toUpperCase()
      )
    }
    if (!matchedVehicle && row.driver_name) {
      matchedVehicle = (existingVehicles || []).find(v =>
        v.driver_name && v.driver_name.toLowerCase() === row.driver_name.toLowerCase()
      )
    }

    if (matchedVehicle) {
      action = 'update'
      existingId = matchedVehicle.id
      existingData = {
        driver_name:    matchedVehicle.driver_name    ?? null,
        vehicle_type:   matchedVehicle.vehicle_type   ?? null,
        license_plate:  matchedVehicle.license_plate  ?? null,
        capacity:       matchedVehicle.capacity       ?? null,
        pax_suggested:  matchedVehicle.pax_suggested  ?? null,
        pax_max:        matchedVehicle.pax_max        ?? null,
        sign_code:      matchedVehicle.sign_code      ?? null,
        available_from: matchedVehicle.available_from ?? null,
        available_to:   matchedVehicle.available_to   ?? null,
      }
      // Campi nuovi: presenti nel file ma null/vuoti nel DB
      if (!matchedVehicle.driver_name    && row.driver_name)    newFields.push('driver_name')
      if (!matchedVehicle.vehicle_type   && row.vehicle_type)   newFields.push('vehicle_type')
      if (!matchedVehicle.license_plate  && row.plate)          newFields.push('license_plate')
      if (matchedVehicle.capacity     == null && row.capacity     != null) newFields.push('capacity')
      if (matchedVehicle.pax_suggested == null && row.pax_suggested != null) newFields.push('pax_suggested')
      if (matchedVehicle.pax_max       == null && row.pax_max       != null) newFields.push('pax_max')
      if (!matchedVehicle.sign_code      && row.sign_code)      newFields.push('sign_code')
      if (!matchedVehicle.available_from && row.available_from) newFields.push('available_from')
      if (!matchedVehicle.available_to   && row.available_to)   newFields.push('available_to')
    }

    return { ...row, action, existingId, existingData, newFields }
  })
}

async function processCrewRows(rawRows, supabase, productionId) {
  const [{ data: existingCrew }, { data: locations }] = await Promise.all([
    supabase
      .from('crew')
      .select('id, full_name, role, department, phone, email, hotel_id, arrival_date, departure_date')
      .eq('production_id', productionId),
    supabase
      .from('locations')
      .select('id, name')
      .eq('production_id', productionId),
  ])

  const newHotels = []

  const rows = rawRows.map(raw => {
    const row = normalizeCrew(raw)

    // Duplicate detection: first_name + last_name → full_name
    let action = 'insert'
    let existingId = null
    let existingData = null
    let newFields = []
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ')
    if (fullName) {
      const match = (existingCrew || []).find(c =>
        c.full_name?.toLowerCase() === fullName.toLowerCase()
      )
      if (match) {
        action = 'update'
        existingId = match.id
        existingData = {
          full_name:      match.full_name      ?? null,
          role:           match.role           ?? null,
          department:     match.department     ?? null,
          phone:          match.phone          ?? null,
          email:          match.email          ?? null,
          hotel_id:       match.hotel_id       ?? null,
          arrival_date:   match.arrival_date   ?? null,
          departure_date: match.departure_date ?? null,
        }
      }
    }

    // Hotel matching
    let hotel_id = null
    let hotelNotFound = false
    if (row.hotel) {
      const hotelLower = row.hotel.toLowerCase()
      const locMatch = (locations || []).find(loc => {
        const locLower = (loc.name || '').toLowerCase()
        return locLower.includes(hotelLower) || hotelLower.includes(locLower)
      })
      if (locMatch) {
        hotel_id = locMatch.id
      } else {
        hotelNotFound = true
        if (!newHotels.find(h => h.name.toLowerCase() === hotelLower)) {
          newHotels.push({ name: row.hotel })
        }
      }
    }

    // Calcola newFields per update rows (dopo hotel matching, così hotel_id è disponibile)
    if (existingData) {
      if (!existingData.role           && row.role)           newFields.push('role')
      if (!existingData.department     && row.department)     newFields.push('department')
      if (!existingData.phone          && row.phone)          newFields.push('phone')
      if (!existingData.email          && row.email)          newFields.push('email')
      if (!existingData.hotel_id       && hotel_id)           newFields.push('hotel_id')
      if (!existingData.arrival_date   && row.arrival_date)   newFields.push('arrival_date')
      if (!existingData.departure_date && row.departure_date) newFields.push('departure_date')
    }

    return { ...row, action, existingId, existingData, newFields, hotel_id, hotelNotFound }
  })

  return { rows, newHotels }
}

// ── POST handler ─────────────────────────────────────────────

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file         = formData.get('file')
    const mode         = formData.get('mode')           // 'hal' | 'fleet' | 'crew' | 'custom'
    const instructions = formData.get('instructions') || ''
    const productionId = formData.get('productionId')

    if (!file)         return NextResponse.json({ error: 'file è obbligatorio' }, { status: 400 })
    if (!mode)         return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    // Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = file.name || 'file'

    // ── STEP 1: Estrazione testo ────────────────────────────
    let text = await extractTextFromFile(buffer, filename, instructions)
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Impossibile estrarre testo dal file. Verifica che non sia vuoto o protetto.' }, { status: 400 })
    }

    // ── STEP 1b: Truncate ───────────────────────────────────
    const MAX_CHARS = 100_000
    if (text.length > MAX_CHARS) {
      console.warn(`[import/parse] Testo troncato: ${text.length} → ${MAX_CHARS} chars`)
      text = text.slice(0, MAX_CHARS)
    }

    // ── STEP 2: System prompt + Claude ─────────────────────

    // ── MODE: hal ──────────────────────────────────────────
    if (mode === 'hal') {
      const halResult = await callClaude(SYSTEM_PROMPT_HAL, text, 'object')
      const detectedType = halResult.type || 'crew'

      // Determina il modo effettivo da mostrare nel frontend
      // 'accommodation' → trattata come crew (con hotel/date)
      // 'mixed'         → processa sia crew che vehicles; detectedMode = 'mixed'
      let detectedMode = 'crew'

      if (detectedType === 'fleet') {
        detectedMode = 'fleet'
        const rawRows = Array.isArray(halResult.vehicles) ? halResult.vehicles : []
        const rows = await processFleetRows(rawRows, supabase, productionId)
        return NextResponse.json({ rows, newData: { hotels: [] }, detectedMode })
      }

      if (detectedType === 'crew' || detectedType === 'accommodation') {
        detectedMode = 'crew'
        // accommodation → usa il sub-array crew se presente, altrimenti accommodation
        const rawCrew = Array.isArray(halResult.crew) && halResult.crew.length > 0
          ? halResult.crew
          : (Array.isArray(halResult.accommodation) ? halResult.accommodation : [])
        const { rows, newHotels } = await processCrewRows(rawCrew, supabase, productionId)
        return NextResponse.json({ rows, newData: { hotels: newHotels }, detectedMode })
      }

      if (detectedType === 'mixed') {
        detectedMode = 'mixed'
        const rawCrew     = Array.isArray(halResult.crew)        ? halResult.crew        : []
        const rawVehicles = Array.isArray(halResult.vehicles)    ? halResult.vehicles    : []

        const fleetRows = await processFleetRows(rawVehicles, supabase, productionId)
        const { rows: crewRows, newHotels } = await processCrewRows(rawCrew, supabase, productionId)

        // Tag each row so the frontend knows which sub-table to render
        const taggedFleet = fleetRows.map(r => ({ ...r, _subMode: 'fleet' }))
        const taggedCrew  = crewRows.map(r  => ({ ...r, _subMode: 'crew'  }))

        return NextResponse.json({
          rows: [...taggedCrew, ...taggedFleet],
          newData: { hotels: newHotels },
          detectedMode,
        })
      }

      // Fallback
      const { rows, newHotels } = await processCrewRows([], supabase, productionId)
      return NextResponse.json({ rows, newData: { hotels: newHotels }, detectedMode: 'crew' })
    }

    // ── MODE: fleet ─────────────────────────────────────────
    if (mode === 'fleet') {
      const userContent = instructions.trim()
        ? `${text}\n\n---\nAdditional instructions from user: ${instructions.trim()}`
        : text
      const extracted = await callClaude(SYSTEM_PROMPT_FLEET, userContent, 'array')
      const rows = await processFleetRows(extracted, supabase, productionId)
      return NextResponse.json({ rows, newData: { hotels: [] }, detectedMode: 'fleet' })
    }

    // ── MODE: crew ──────────────────────────────────────────
    if (mode === 'crew') {
      const userContent = instructions.trim()
        ? `${text}\n\n---\nAdditional instructions from user: ${instructions.trim()}`
        : text
      const extracted = await callClaude(SYSTEM_PROMPT_CREW, userContent, 'array')
      const { rows, newHotels } = await processCrewRows(extracted, supabase, productionId)
      return NextResponse.json({ rows, newData: { hotels: newHotels }, detectedMode: 'crew' })
    }

    // ── MODE: custom ────────────────────────────────────────
    if (mode === 'custom') {
      if (!instructions.trim()) {
        return NextResponse.json({ error: 'instructions sono obbligatorie per mode=custom' }, { status: 400 })
      }
      const extracted = await callClaude(instructions.trim(), text, 'array')
      return NextResponse.json({
        rows: extracted.map(row => ({ ...row, action: 'insert', existingId: null })),
        newData: { hotels: [] },
        detectedMode: 'custom',
      })
    }

    return NextResponse.json({ error: `mode non valido: ${mode}` }, { status: 400 })

  } catch (e) {
    console.error('[import/parse]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
