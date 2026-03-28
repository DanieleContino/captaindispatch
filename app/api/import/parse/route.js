/**
 * /api/import/parse
 *
 * POST (multipart/form-data)
 *
 * Input fields:
 *   file         — il file da importare (.xlsx, .xls, .csv, .pdf, .docx)
 *   mode         — 'fleet' | 'crew' | 'custom'
 *   instructions — (solo per mode=custom) prompt libero per Claude
 *   productionId — UUID produzione attiva
 *
 * Flusso:
 *   1. Estrae testo dal file (xlsx/csv → XLSX, pdf → pdf-parse, docx → mammoth)
 *   2. Chiama Claude API con system prompt specifico per mode
 *   3. Duplicate detection su Supabase (license_plate+driver_name fleet / full_name crew)
 *   4. Hotel matching crew: confronta hotel estratti con locations Supabase
 *   5. Return: { rows, newData: { hotels: [] } }
 *
 * Ogni row ha:
 *   action: 'insert' | 'update' | 'skip'
 *   existingId: string | null (se update)
 *   (fleet) driver_name, vehicle_type, license_plate, capacity, pax_suggested, sign_code
 *   (crew)  full_name, department, hotel, hotel_id, hotelNotFound, arrival_date, departure_date
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

// ── System prompts Claude ────────────────────────────────────

const SYSTEM_PROMPT_FLEET = `You extract vehicle fleet data from documents.
Return ONLY a raw JSON array, no backticks, no markdown, no explanation.
Fields per vehicle:
  driver_name    (string|null)
  vehicle_type   ("VAN"|"CAR"|"BUS", default "VAN")
  license_plate  (string uppercase|null)
  capacity       (number|null)
  pax_suggested  (number|null)
  pax_max        (number|null)
  sign_code      (string|null)
  available_from ("YYYY-MM-DD"|null)
  available_to   ("YYYY-MM-DD"|null)
If a field cannot be determined, use null. Never invent values.
IMPORTANT: Each row in the document represents a DISTINCT vehicle entry. Return ALL rows found,
even if they appear identical (same type, no driver, no plate). Do NOT merge, deduplicate or summarize rows.

PRIORITY RULE: If the user provides "Additional instructions" about column mappings or field meanings,
follow them STRICTLY and they override any default interpretation below.

Default column interpretation for budget/cost sheet format (apply only when no user instructions override):
- First column (BRAND/TYPE): map to vehicle_type — MERCEDES/NCC/MINIVAN/MINIVAN CREW → "VAN", AUTO/DOBLO/PASINO → "CAR", BUS/TRUCK/DUCATO/PUP/75Q/CAMION → "BUS"; when in doubt default to "VAN"
- Second column (MODEL): use as license_plate ONLY if it looks like a vehicle plate (e.g. "AB 123 CD", "GR 448 JY"); otherwise null
- Third column (DRIVER): driver_name ONLY if it is a real person's full name or surname; IGNORE department siglas/abbreviations like "SD", "TBC", "A CHIAMATA", "TRANSP. DEPT.", "CO LINE PRODUCER", "DRIVERS CINETECNICA" etc.
- Fourth column (DEPT./ROLE): use as sign_code (the department or role label the vehicle is assigned to)
- Columns whose meaning is not specified by the user and not listed above (e.g. cost, quantity, totals): ignore
- Subtotal rows, header rows, summary rows: skip — do NOT include them as vehicle entries
- Rows with no vehicle type info in the first column (e.g. completely empty or just spaces): skip`

const SYSTEM_PROMPT_CREW = `You extract crew member data from film/TV production documents.
Return ONLY a raw JSON array, no backticks, no markdown, no explanation.
Fields per person: full_name (string), department (one of: CAMERA, GRIP, ELECTRIC, SOUND, ART,
COSTUME, MAKEUP, PRODUCTION, TRANSPORT, CATERING, SECURITY, MEDICAL, VFX, DIRECTING, CAST, OTHER —
map role titles: Gaffer→ELECTRIC, Focus Puller→CAMERA, Key Grip→GRIP, etc.),
hotel (hotel name as in document|null), arrival_date ("YYYY-MM-DD"|null), departure_date ("YYYY-MM-DD"|null).
Never invent values. If absent, use null.`

// ── Helpers ──────────────────────────────────────────────────

/**
 * Estrae testo dal file in base all'estensione.
 * Usa require() (non import) perché i pacchetti sono in serverExternalPackages.
 *
 * Per XLSX: usa solo il foglio specificato nelle istruzioni (o il primo per default),
 * evitando di convertire tutti i fogli nascosti/extra che possono generare decine di MB.
 */
async function extractTextFromFile(buffer, filename, instructions = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase()

  if (ext === 'pdf') {
    // pdf-parse v2 accetta Buffer
    const pdfParse = require('pdf-parse')
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

    // Determina il foglio da usare: cerca nelle istruzioni, default = primo foglio
    let targetSheet = workbook.SheetNames[0]
    if (instructions && workbook.SheetNames.length > 1) {
      const lower = instructions.toLowerCase()
      // 1. Match esatto per nome foglio (case-insensitive)
      const exactMatch = workbook.SheetNames.find(n => lower.includes(n.toLowerCase()))
      if (exactMatch) {
        targetSheet = exactMatch
      } else {
        // 2. "foglio N" o "sheet N" → indice 1-based
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

    // Fix: strip trailing empty fields from each CSV row.
    // Excel files with formatted/extended cells produce rows with hundreds of empty
    // comma-separated fields, making the CSV enormous (100K+ chars) and triggering
    // truncation before Claude sees the actual data rows.
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
 * Chiama Claude API e restituisce l'array JSON estratto.
 * Rimuove eventuali backtick di markdown che Claude aggiunge nonostante le istruzioni.
 */
async function callClaude(systemPrompt, userContent) {
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

  // Estrazione JSON robusta — 3 strategie in cascata:
  // Claude a volte aggiunge testo descrittivo prima/dopo il JSON nonostante le istruzioni

  // Strategia 1: estrai contenuto da blocco ```json ... ``` o ``` ... ```
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* prova strategia 2 */ }
  }

  // Strategia 2: trova il primo '[' e l'ultimo ']' nel testo
  const arrStart = rawText.indexOf('[')
  const arrEnd   = rawText.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const parsed = JSON.parse(rawText.slice(arrStart, arrEnd + 1))
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* prova strategia 3 */ }
  }

  // Strategia 3: parse diretto del testo intero
  try {
    const parsed = JSON.parse(rawText)
    if (Array.isArray(parsed)) return parsed
    throw new Error('Claude non ha restituito un array JSON')
  } catch (e) {
    throw new Error(`Claude ha restituito JSON non valido: ${rawText.slice(0, 300)}`)
  }
}

// ── POST handler ─────────────────────────────────────────────

export async function POST(req) {
  try {
    // Auth check
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse multipart/form-data
    const formData = await req.formData()
    const file = formData.get('file')
    const mode = formData.get('mode')           // 'fleet' | 'crew' | 'custom'
    const instructions = formData.get('instructions') || ''
    const productionId = formData.get('productionId')

    if (!file) return NextResponse.json({ error: 'file è obbligatorio' }, { status: 400 })
    if (!mode) return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    // Converti file in Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = file.name || 'file'

    // ── STEP 1: Estrazione testo ────────────────────────────
    // Passa le istruzioni all'extractor per XLSX (sheet selection)
    let text = await extractTextFromFile(buffer, filename, instructions)

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Impossibile estrarre testo dal file. Verifica che non sia vuoto o protetto.' }, { status: 400 })
    }

    // ── STEP 1b: Truncate — limite Claude (byte + token rate limit) ──
    const MAX_CHARS = 100_000   // ~25k token, ampiamente sufficiente per liste crew/fleet
    if (text.length > MAX_CHARS) {
      console.warn(`[import/parse] Testo troncato: ${text.length} → ${MAX_CHARS} chars`)
      text = text.slice(0, MAX_CHARS)
    }

    // ── STEP 2: System prompt ───────────────────────────────
    let systemPrompt
    if (mode === 'fleet') {
      systemPrompt = SYSTEM_PROMPT_FLEET
    } else if (mode === 'crew') {
      systemPrompt = SYSTEM_PROMPT_CREW
    } else {
      // custom
      if (!instructions.trim()) {
        return NextResponse.json({ error: 'instructions sono obbligatorie per mode=custom' }, { status: 400 })
      }
      systemPrompt = instructions.trim()
    }

    // ── STEP 3: Claude API ──────────────────────────────────
    // Per fleet/crew: se l'utente ha fornito istruzioni aggiuntive, le appendiamo
    // al contenuto utente come contesto extra (senza alterare il system prompt strutturato)
    const userContent = (mode !== 'custom' && instructions.trim())
      ? `${text}\n\n---\nAdditional instructions from user: ${instructions.trim()}`
      : text
    const extracted = await callClaude(systemPrompt, userContent)

    // ── STEP 4a: Fleet — duplicate detection ────────────────
    if (mode === 'fleet') {
      const { data: existingVehicles } = await supabase
        .from('vehicles')
        .select('id, license_plate, driver_name')
        .eq('production_id', productionId)

      const rows = extracted.map(row => {
        let action = 'insert'
        let existingId = null

        // Match per targa (priorità) poi per nome autista
        if (row.license_plate) {
          const match = (existingVehicles || []).find(v =>
            v.license_plate &&
            v.license_plate.toUpperCase() === row.license_plate.toUpperCase()
          )
          if (match) { action = 'update'; existingId = match.id }
        }

        if (action === 'insert' && row.driver_name) {
          const match = (existingVehicles || []).find(v =>
            v.driver_name &&
            v.driver_name.toLowerCase() === row.driver_name.toLowerCase()
          )
          if (match) { action = 'update'; existingId = match.id }
        }

        return { ...row, action, existingId }
      })

      return NextResponse.json({ rows, newData: { hotels: [] } })
    }

    // ── STEP 4b: Crew — duplicate detection + hotel matching
    if (mode === 'crew') {
      const [{ data: existingCrew }, { data: locations }] = await Promise.all([
        supabase
          .from('crew')
          .select('id, full_name')
          .eq('production_id', productionId),
        supabase
          .from('locations')
          .select('id, name')
          .eq('production_id', productionId),
      ])

      const newHotels = []   // hotel non trovati in locations

      const rows = extracted.map(row => {
        // Duplicate detection
        let action = 'insert'
        let existingId = null
        if (row.full_name) {
          const match = (existingCrew || []).find(c =>
            c.full_name?.toLowerCase() === row.full_name.toLowerCase()
          )
          if (match) { action = 'update'; existingId = match.id }
        }

        // Hotel matching — fuzzy: cerca se il nome location è contenuto nel nome hotel
        // o viceversa (entrambe le direzioni, case-insensitive)
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

        return { ...row, action, existingId, hotel_id, hotelNotFound }
      })

      return NextResponse.json({ rows, newData: { hotels: newHotels } })
    }

    // mode === 'custom': nessun post-processing, ritorna le righe raw
    return NextResponse.json({
      rows: extracted.map(row => ({ ...row, action: 'insert', existingId: null })),
      newData: { hotels: [] },
    })

  } catch (e) {
    console.error('[import/parse]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
