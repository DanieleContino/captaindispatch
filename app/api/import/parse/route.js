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

When the input is structured JSON (from an Excel sheet), interpret it as follows:
The metadata field contains the hotel name and address. Field mapping: NAME=first_name, SURNAME=last_name, POSITION/ROLE=role, DEPARTMENT=department, IN=arrival_date, OUT=departure_date. If DEPARTMENT is empty, infer it from POSITION/ROLE using standard film production knowledge.
- NAME = first_name, SURNAME = last_name, POSITION/ROLE = role, DEPARTMENT = department, IN = arrival_date, OUT = departure_date
- sheet_name and metadata contain the hotel name and address — use them to populate hotel_name/hotel_address for accommodation data
- Apply department mapping rules to the DEPARTMENT field values as-is (they may already be in English or Italian)
- If DEPARTMENT is empty, infer it from POSITION/ROLE using standard film production roles

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

const SYSTEM_PROMPT_ACCOMMODATION = `You are extracting accommodation data from one sheet of a film/TV production rooming list Excel file.

Extract ALL rows that represent crew member accommodation assignments.
Each row represents one person's hotel booking.

When the input is structured JSON (from an Excel sheet with keys: sheet_name, metadata, headers, rows):
- Use the metadata field to extract the hotel name and address and apply it to ALL rows in this sheet
- Column name mapping: NAME→first_name, SURNAME/LAST NAME/COGNOME→last_name, POSITION/ROLE/RUOLO→role, DEPT/DEPARTMENT/DIPARTIMENTO→department, IN/ARR/ARRIVAL/CHECK-IN/DATA ARRIVO→arrival_date, OUT/DEP/DEPARTURE/CHECK-OUT/DATA PARTENZA→departure_date
- If department is empty, infer it from role using standard film production knowledge

Rules:
- Extract every person with accommodation data, even if multiple people share the same hotel
- first_name and last_name: split the full name if it appears in a single column
- role: exact job title if available, null otherwise
- department: use standard values (CAMERA, GRIP, ELECTRIC, SOUND, ART, COSTUME, MAKEUP, PRODUCTION,
  TRANSPORT, HMU, AD, PROPS, SET DEC, ACCOUNTING, PRODUCERS, CATERING, SECURITY, MEDICAL, VFX,
  DIRECTING, CAST, LOCATIONS, OTHER) — null if not available
- hotel_name: the name of the hotel (e.g. "Hotel Excelsior", "Marriott Rome") — extract if present
- hotel_address: full address or city of the hotel if available, null otherwise
- arrival_date and departure_date: convert to ISO format YYYY-MM-DD;
  accept DD/MM/YYYY, MM/DD/YYYY, D MMM YYYY, "Arr.", "Dep.", "Check-in", "Check-out" column labels
- If a field is missing or unclear, return null
- Skip header rows, totals, subtotal rows, and completely blank rows
- Return ONLY a valid JSON array, no markdown, no explanation, no backticks

Return format: JSON array
[{
  "first_name": "string|null",
  "last_name": "string|null",
  "role": "string|null",
  "department": "string|null",
  "hotel_name": "string|null",
  "hotel_address": "string|null",
  "arrival_date": "YYYY-MM-DD|null",
  "departure_date": "YYYY-MM-DD|null"
}]`

// ── Helpers ──────────────────────────────────────────────────

/**
 * Estrae testo dal file in base all'estensione.
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} instructions — usato come fallback per selezionare foglio in .xlsx
 * @param {string|null} selectedSheet — nome esplicito del foglio da usare (priorità su instructions)
 */
async function extractTextFromFile(buffer, filename, instructions = '', selectedSheet = null) {
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
    // Priorità: selectedSheet esplicito sovrascrive la logica basata su instructions
    if (selectedSheet && workbook.SheetNames.includes(selectedSheet)) {
      targetSheet = selectedSheet
    } else if (instructions && workbook.SheetNames.length > 1) {
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

// ── Excel structured extraction ───────────────────────────────

/** Parole chiave che identificano una riga header in un Excel */
const HEADER_KEYWORDS = new Set([
  'name', 'surname', 'first', 'last', 'first name', 'last name',
  'nome', 'cognome', 'full name', 'fullname',
  'in', 'out', 'arrival', 'departure',
  'check-in', 'check-out', 'checkin', 'checkout', 'arr', 'dep',
  'arrivo', 'partenza', 'data arrivo', 'data partenza',
  'department', 'dept', 'dipartimento',
  'driver', 'vehicle', 'plate', 'targa', 'autista', 'veicolo',
  'role', 'position', 'ruolo', 'posizione', 'funzione', 'job title',
  'hotel', 'room', 'camera', 'stanza', 'accommodation',
  'phone', 'email', 'telefono', 'mobile', 'cellulare',
  'type', 'capacity', 'sign code',
])

/** Trova l'indice della riga header tra le prime maxScan righe */
function detectHeaderRowIndex(rows, maxScan = 10) {
  let bestIdx = 0
  let bestScore = 0
  const limit = Math.min(maxScan, rows.length)
  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue
    let score = 0
    for (const cell of row) {
      if (cell == null) continue
      const s = String(cell).toLowerCase().trim()
      if (HEADER_KEYWORDS.has(s)) {
        score += 1
      } else if (
        s.includes('name') || s.includes('nome') || s.includes('surnam') ||
        s.includes('cognome') || s.includes('arriv') || s.includes('depart') ||
        s.includes('check') || s.includes('hotel') || s.includes('role') ||
        s.includes('dept') || s.includes('driver') || s.includes('plate') ||
        s.includes('targa') || s.includes('posit') || s.includes('ruolo')
      ) {
        score += 0.5
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return (bestScore >= 1.5) ? bestIdx : 0
}

/** Converte un valore cella (inclusi Date da cellDates:true) in stringa o null */
function cellValueToString(val) {
  if (val === null || val === undefined) return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const y = val.getUTCFullYear()
    if (y < 1900 || y > 2100) return null  // data non valida (es. seriale 0 = 1899)
    return val.toISOString().split('T')[0]
  }
  // Numero: seriale Excel date o valore generico — in entrambi i casi null
  if (typeof val === 'number') {
    if (val <= 0) return null  // seriale 0 = data non valida
    return null  // altri numeri (costo, totali) → null
  }
  const s = String(val).trim()
  return s === '' ? null : s
}

/** Verifica se una riga è una riga totale/subtotale/nota da saltare */
function isTotalRow(row) {
  if (!Array.isArray(row) || row.length === 0) return false
  // Controlla tutte le celle per match esatto
  for (const cell of row) {
    if (!cell) continue
    const s = String(cell).toLowerCase().trim()
    if (s === 'total' || s === 'totale' || s === 'subtotal' ||
        s === 'grand total' || s === 'totali' || s === 'sub total') return true
  }
  // Controlla la prima cella non vuota
  const firstCell = row.find(c => c !== null && c !== undefined && String(c).trim() !== '')
  if (!firstCell) return false
  const first = String(firstCell).toLowerCase().trim()
  if (first.startsWith('tot.') || first.startsWith('tot ')) return true
  if (first.startsWith('total') || first.startsWith('grand total')) return true
  if (first.startsWith('quantità notti') || first.startsWith('dal 21')) return true
  if (first.startsWith('da spostare') || first.startsWith('note:')) return true
  // Riga con testo molto lungo nella prima cella = probabilmente una nota contrattuale
  if (first.length > 80) return true
  return false
}

/** Verifica se una riga è completamente vuota */
function isEmptyRow(row) {
  return !Array.isArray(row) ||
    row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')
}

/** Verifica se il valore nome è un placeholder da ignorare */
function isNamePlaceholder(val) {
  if (!val) return true
  const s = String(val).toLowerCase().trim()
  // Valori esatti da ignorare
  if (['name tbd', 'name tba', 'tbd', 'tba', 'n/a', '-', 'nome', 'name'].includes(s)) return true
  // Pattern da ignorare
  if (s.includes('tbd') || s.includes('tba')) return true
  if (s.startsWith('driver #') || s.startsWith('driver#')) return true
  if (s.startsWith('tot.') || s.startsWith('total') || s.startsWith('grand total')) return true
  if (s.startsWith('dal ') || s.startsWith('da ') || s.startsWith('quantità')) return true
  if (s.startsWith('note:') || s.startsWith('note ')) return true
  return false
}

/**
 * Estrae dati strutturati da un singolo foglio Excel.
 * Rileva automaticamente la riga header (scansiona prime 10 righe),
 * raccoglie metadata pre-header (nome hotel, indirizzo, note),
 * converte date seriali in YYYY-MM-DD, rimuove righe vuote/totali/placeholder.
 *
 * @param {Buffer} buffer
 * @param {string|null} selectedSheet — foglio da usare; null = primo foglio
 * @returns {{ sheet_name: string, metadata: string, headers: string[], rows: object[] }}
 */
function extractStructuredExcel(buffer, selectedSheet = null) {
  const XLSX = require('xlsx')
  // cellDates: true → le celle data vengono lette come oggetti Date
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  const sheetName = (selectedSheet && workbook.SheetNames.includes(selectedSheet))
    ? selectedSheet
    : workbook.SheetNames[0]

  const sheet = workbook.Sheets[sheetName]
  // header: 1 → righe come array; defval: null → celle vuote = null
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Trova la riga header
  const headerIdx = detectHeaderRowIndex(allRows)

  // Metadata: righe prima della header (nome hotel, indirizzo, note introduttive)
  const metaLines = []
  for (let i = 0; i < headerIdx; i++) {
    const row = allRows[i]
    if (!isEmptyRow(row)) {
      const line = row
        .filter(c => c != null && String(c).trim() !== '')
        .map(c => cellValueToString(c))
        .join(' | ')
      if (line.trim()) metaLines.push(line)
    }
  }
  const metadata = metaLines.join('\n')

  // Headers: valori della riga header
  const headerRow = allRows[headerIdx] || []
  const headers = headerRow.map(h =>
    (h === null || h === undefined) ? '' : String(h).trim()
  )

  // Data rows: righe successive alla header
  const dataRows = []
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const rawRow = allRows[i]
    if (!Array.isArray(rawRow)) continue
    if (isEmptyRow(rawRow)) continue
    if (isTotalRow(rawRow)) continue

    // Mappa array → oggetto { header: valore }
    const rowObj = {}
    for (let j = 0; j < headerRow.length; j++) {
      const key = headerRow[j]
      if (!key || String(key).trim() === '') continue
      rowObj[String(key).trim()] = cellValueToString(rawRow[j])
    }

    // Salta riga se tutti i valori sono null
    if (Object.values(rowObj).every(v => v === null)) continue

    // Salta riga se il campo nome principale è un placeholder
    const nameKey = Object.keys(rowObj).find(k => {
      const kl = k.toLowerCase()
      return kl === 'name' || kl === 'nome' || kl === 'full name' ||
             kl === 'first name' || kl === 'first' || kl === 'surname' || kl === 'cognome'
    })
    if (nameKey && isNamePlaceholder(rowObj[nameKey])) continue

    dataRows.push(rowObj)
  }

  // Filtra colonne che sono null per TUTTE le righe
  const usedKeys = new Set()
  for (const row of dataRows) {
    for (const [k, v] of Object.entries(row)) {
      if (v !== null) usedKeys.add(k)
    }
  }

  // Bug 1 fix: rimuovi colonne "calendario" — colonne dove >80% dei valori non-null
  // sono "1", " ", o una singola lettera maiuscola (M/T/W/F/S/D = giorni settimana)
  const CALENDAR_PATTERN = /^(\s*1\s*|\s+|[MTWFSD])$/
  function isCalendarColumn(key, rows) {
    const nonNull = rows.map(r => r[key]).filter(v => v !== null && v !== undefined)
    if (nonNull.length === 0) return true
    const calCount = nonNull.filter(v => CALENDAR_PATTERN.test(String(v))).length
    return calCount / nonNull.length > 0.8
  }
  for (const key of [...usedKeys]) {
    if (isCalendarColumn(key, dataRows)) usedKeys.delete(key)
  }

  const filteredRows = dataRows.map(row => {
    const obj = {}
    for (const k of usedKeys) obj[k] = row[k] ?? null
    return obj
  })
  const filteredHeaders = headers.filter(Boolean).filter(h => usedKeys.has(h))

  console.log(`[import/parse] Excel structured: sheet="${sheetName}", headerIdx=${headerIdx}, headers=${headers.filter(Boolean).length}→${filteredHeaders.length}, rows=${filteredRows.length}`)

  return { sheet_name: sheetName, metadata, headers: filteredHeaders, rows: filteredRows }
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
  max_tokens: 16000,
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
      const fullNameNorm = fullName.trim().toLowerCase()
      // Primary: first_name + ' ' + last_name vs full_name (trim + lowercase)
      let match = (existingCrew || []).find(c =>
        (c.full_name || '').trim().toLowerCase() === fullNameNorm
      )
      // Fallback: last_name contains (es. "Mario Rossi" in DB → "Rossi" dal file)
      if (!match && row.last_name && row.last_name.trim().length > 1) {
        const lastNorm = row.last_name.trim().toLowerCase()
        match = (existingCrew || []).find(c =>
          (c.full_name || '').trim().toLowerCase().includes(lastNorm)
        )
      }
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

    // Hotel matching (multi-livello)
    let hotel_id = null
    let hotelNotFound = false
    if (row.hotel) {
      const hotelLower = row.hotel.toLowerCase().trim()
      const locMatch = (locations || []).find(loc => {
        const locLower = (loc.name || '').toLowerCase().trim()
        if (locLower === hotelLower) return true
        if (locLower.includes(hotelLower) || hotelLower.includes(locLower)) return true
        const parts = hotelLower.split(/[\|\-–,]/).map(p => p.trim()).filter(Boolean)
        if (parts.some(p => p.length > 3 && (locLower.includes(p) || p.includes(locLower)))) return true
        return false
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

/**
 * Duplicate detection per accommodation:
 * - Match crew esistente per first_name + last_name
 * - Hotel matching su hotel_name (confronto con locations)
 * - Raccoglie nuovi hotel non trovati in locations (con address per Google Places)
 * - action = 'update' se crew trovata, 'skip' altrimenti (NON inserisce nuovi crew)
 */
async function processAccommodationRows(rawRows, supabase, productionId) {
  const [{ data: existingCrew }, { data: locations }] = await Promise.all([
    supabase
      .from('crew')
      .select('id, full_name, hotel_id, arrival_date, departure_date')
      .eq('production_id', productionId),
    supabase
      .from('locations')
      .select('id, name')
      .eq('production_id', productionId),
  ])

  const newHotels = []

  const rows = rawRows.map(raw => {
    const first_name     = raw.first_name     || null
    const last_name      = raw.last_name      || null
    const role           = raw.role           || null
    const department     = normalizeDept(raw.department) || null
    const hotel_name     = raw.hotel_name     || null
    const hotel_address  = raw.hotel_address  || null
    const arrival_date   = raw.arrival_date   || null
    const departure_date = raw.departure_date || null

    // Duplicate detection: first_name + last_name → full_name su crew esistente
    // action = 'skip' di default — accommodation NON inserisce nuovi crew
    let action = 'skip'
    let existingId = null
    let existingData = null
    let newFields = []

    const fullName = [first_name, last_name].filter(Boolean).join(' ')
    if (fullName) {
      const fullNameNorm = fullName.trim().toLowerCase()
      const cleanFull = fullNameNorm.replace(/[*+]/g, '').trim()

      // Strategia 1: match esatto full_name
      let match = (existingCrew || []).find(c =>
        (c.full_name || '').trim().toLowerCase() === cleanFull
      )
      // Strategia 2: il DB contiene il fullname del file
      if (!match) {
        match = (existingCrew || []).find(c =>
          (c.full_name || '').trim().toLowerCase().includes(cleanFull)
        )
      }
      // Strategia 3: il fullname del file contiene il full_name del DB
      if (!match) {
        match = (existingCrew || []).find(c => {
          const dbName = (c.full_name || '').trim().toLowerCase()
          return dbName.length > 3 && cleanFull.includes(dbName)
        })
      }
      if (match) {
        action = 'update'
        existingId = match.id
        existingData = {
          full_name:      match.full_name      ?? null,
          hotel_id:       match.hotel_id       ?? null,
          arrival_date:   match.arrival_date   ?? null,
          departure_date: match.departure_date ?? null,
        }
      }
    }

    // Hotel matching su hotel_name → locations (multi-livello)
    let hotel_id = null
    let hotelNotFound = false
    if (hotel_name) {
      const hotelLower = hotel_name.toLowerCase().trim()
      const locMatch = (locations || []).find(loc => {
        const locLower = (loc.name || '').toLowerCase().trim()
        // 1. Match esatto
        if (locLower === hotelLower) return true
        // 2. includes bidirezionale
        if (locLower.includes(hotelLower) || hotelLower.includes(locLower)) return true
        // 3. hotel_name contiene il nome del DB dopo un separatore ("|", "-", "–")
        //    es. "MONOPOLI | TORRE CINTOLA" → cerca "torre cintola" nel DB
        const parts = hotelLower.split(/[\|\-–,]/).map(p => p.trim()).filter(Boolean)
        if (parts.some(p => p.length > 3 && (locLower.includes(p) || p.includes(locLower)))) return true
        return false
      })
      if (locMatch) {
        hotel_id = locMatch.id
      } else {
        hotelNotFound = true
        if (!newHotels.find(h => h.name.toLowerCase() === hotelLower)) {
          // Mantieni hotel_address per il pre-fill di HotelPlacesModal (S31-T4)
          newHotels.push({ name: hotel_name, address: hotel_address })
        }
      }
    }

    // newFields per update rows
    if (existingData) {
      if (!existingData.hotel_id       && hotel_id)          newFields.push('hotel_id')
      if (!existingData.arrival_date   && arrival_date)      newFields.push('arrival_date')
      if (!existingData.departure_date && departure_date)    newFields.push('departure_date')
    }

    return {
      first_name, last_name, role, department,
      hotel_name, hotel_address,
      arrival_date, departure_date,
      hotel_id, hotelNotFound,
      action, existingId, existingData, newFields,
    }
  })

  return { rows, newHotels }
}

// ── Accommodation JS extraction ──────────────────────────────

/**
 * Tenta estrazione diretta dal JSON strutturato senza Claude.
 * Ritorna array di righe se riesce, null se il formato non è riconoscibile.
 */
function extractAccommodationFromStructured(structured) {
  const { sheet_name, metadata, headers, rows } = structured

  // Mappa flessibile delle colonne — cerca corrispondenze case-insensitive
  const headerMap = {}
  for (const h of headers) {
    const hl = h.toLowerCase().trim()
    if (hl === 'name' || hl === 'nome' || hl === 'first name' || hl === 'first')
      headerMap.first_name = h
    else if (hl === 'surname' || hl === 'cognome' || hl === 'last name' || hl === 'last')
      headerMap.last_name = h
    else if (hl === 'position/role' || hl === 'role' || hl === 'position' || hl === 'ruolo' || hl === 'posizione')
      headerMap.role = h
    else if (hl === 'department' || hl === 'dept' || hl === 'dipartimento')
      headerMap.department = h
    else if (hl === 'in' || hl === 'arrival' || hl === 'arr' || hl === 'check-in' || hl === 'checkin' || hl === 'data arrivo')
      headerMap.arrival_date = h
    else if (hl === 'out' || hl === 'departure' || hl === 'dep' || hl === 'check-out' || hl === 'checkout' || hl === 'data partenza')
      headerMap.departure_date = h
  }

  // Richiede almeno first_name/last_name — senza nomi non c'è niente da fare
  const hasNames = headerMap.first_name || headerMap.last_name
  if (!hasNames) return null  // formato non riconoscibile → fallback a Claude

  // Il nome hotel è sempre il sheet_name — es. "TORRE CINTOLA", "TORRE MAIZZA"
  const hotel_name = sheet_name || null
  const hotel_address = null

  // Estrai righe
  const result = []
  for (const row of rows) {
    const first_name = headerMap.first_name ? (row[headerMap.first_name] || null) : null
    const last_name  = headerMap.last_name  ? (row[headerMap.last_name]  || null) : null

    // Salta se nessun nome
    if (!first_name && !last_name) continue

    // Salta placeholder
    const nameCheck = (first_name || last_name || '').toLowerCase()
    if (nameCheck.includes('tbd') || nameCheck.includes('tba') ||
        nameCheck.startsWith('driver #') || nameCheck.startsWith('tot')) continue

    result.push({
      first_name,
      last_name,
      role:           headerMap.role        ? (row[headerMap.role]        || null) : null,
      department:     headerMap.department  ? (row[headerMap.department]  || null) : null,
      hotel_name,
      hotel_address,
      arrival_date:   headerMap.arrival_date   ? (row[headerMap.arrival_date]   || null) : null,
      departure_date: headerMap.departure_date ? (row[headerMap.departure_date] || null) : null,
    })
  }

  console.log(`[import/parse] Accommodation JS extraction: ${result.length} righe estratte direttamente`)
  return result
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
    const file          = formData.get('file')
    const mode          = formData.get('mode')           // 'hal' | 'fleet' | 'crew' | 'accommodation' | 'custom'
    const instructions  = formData.get('instructions') || ''
    const productionId  = formData.get('productionId')
    const selectedSheet = formData.get('selectedSheet') || null  // S31: foglio specifico per accommodation

    if (!file)         return NextResponse.json({ error: 'file è obbligatorio' }, { status: 400 })
    if (!mode)         return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    // Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = file.name || 'file'

    // ── STEP 1: Estrazione contenuto ────────────────────────────
    const ext = (filename.split('.').pop() || '').toLowerCase()
    const isExcel = ext === 'xlsx' || ext === 'xls'

    let text = ''
    if (isExcel) {
      // Excel (.xlsx/.xls): estrazione strutturata con rilevamento automatico header
      const structured = extractStructuredExcel(buffer, selectedSheet)
      text = JSON.stringify(structured, null, 2)
      console.log(`[import/parse] Excel → JSON strutturato: ${text.length} chars, ${structured.rows.length} righe dati`)
    } else {
      // PDF / Word / CSV: estrazione testo normale (logica invariata)
      text = await extractTextFromFile(buffer, filename, instructions, selectedSheet)
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Impossibile estrarre testo dal file. Verifica che non sia vuoto o protetto.' }, { status: 400 })
    }

    // ── STEP 1b: Truncate ───────────────────────────────────
    const MAX_CHARS = 100_000
    if (text.length > MAX_CHARS) {
      if (isExcel) {
        // Excel: tronca le righe senza spezzare il JSON
        console.warn(`[import/parse] Excel JSON troncato: ${text.length} chars`)
        const obj = JSON.parse(text)
        const approxPerRow = text.length / Math.max(obj.rows.length, 1)
        const maxRows = Math.max(Math.floor(MAX_CHARS / approxPerRow) - 10, 50)
        obj.rows = obj.rows.slice(0, maxRows)
        text = JSON.stringify(obj, null, 2)
        console.warn(`[import/parse] Excel JSON post-truncation: ${text.length} chars, ${obj.rows.length} righe`)
      } else {
        console.warn(`[import/parse] Testo troncato: ${text.length} → ${MAX_CHARS} chars`)
        text = text.slice(0, MAX_CHARS)
      }
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

      if (detectedType === 'accommodation') {
        detectedMode = 'accommodation'
        const rawAccommodation = Array.isArray(halResult.accommodation) ? halResult.accommodation : []
        const { rows, newHotels } = await processAccommodationRows(rawAccommodation, supabase, productionId)
        return NextResponse.json({ rows, newData: { hotels: newHotels }, detectedMode })
      }

      if (detectedType === 'crew') {
        detectedMode = 'crew'
        const rawCrew = Array.isArray(halResult.crew) ? halResult.crew : []
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

    // ── MODE: accommodation ──────────────────────────────────
    if (mode === 'accommodation') {
      let extracted = null

      if (isExcel) {
        // Prova estrazione JavaScript diretta (veloce, zero API call)
        const structured = JSON.parse(text)
        extracted = extractAccommodationFromStructured(structured)
        if (extracted) {
          console.log(`[import/parse] Accommodation: JS extraction OK (${extracted.length} righe), skip Claude`)
        }
      }

      if (!extracted) {
        // Fallback a Claude (PDF, Word, CSV, o Excel con formato non riconoscibile)
        console.log(`[import/parse] Accommodation: fallback a Claude`)
        const userContent = (!isExcel && selectedSheet) ? `Sheet: ${selectedSheet}\n\n${text}` : text
        extracted = await callClaude(SYSTEM_PROMPT_ACCOMMODATION, userContent, 'array')
      }

      const { rows, newHotels } = await processAccommodationRows(extracted, supabase, productionId)
      return NextResponse.json({ rows, newData: { hotels: newHotels }, detectedMode: 'accommodation' })
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
