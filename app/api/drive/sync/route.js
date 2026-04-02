/**
 * /api/drive/sync
 *
 * POST { production_id, file_id? }
 *
 * Scarica il/i file registrati in drive_synced_files da Google Drive,
 * chiama /api/import/parse + /api/import/confirm internamente.
 *
 * Richiede provider_token nella sessione utente attiva (Google OAuth).
 * NON funziona dal cron (nessun provider_token disponibile senza sessione utente).
 *
 * Delta check: se modifiedTime Drive === last_modified nel DB → skip (nessuna modifica).
 *
 * Google Workspace types (Sheets/Docs) vengono esportati automaticamente in xlsx/docx.
 *
 * Response:
 *   { synced: [...], skipped: [...], failed: [...] }
 *
 * Ogni elemento synced:
 *   { file_id, file_name, modifiedTime, parsed, inserted, updated, skipped_rows, errors }
 *
 * Ogni elemento skipped:
 *   { file_id, file_name, reason: 'no_changes' }
 *
 * Ogni elemento failed:
 *   { file_id, file_name, error: string }
 */

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

// ── Google Workspace export mappings ─────────────────────────

const WORKSPACE_EXPORT = {
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
}

// MIME type → extension per file non-Workspace
const MIME_TO_EXT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
}

/**
 * Determina l'estensione del file dal nome o dal MIME type.
 * Priorità: estensione nel file_name → MIME map → 'bin'
 */
function resolveExt(mimeType, fileName) {
  if (fileName) {
    const parts = fileName.split('.')
    if (parts.length > 1) return parts.pop().toLowerCase()
  }
  return MIME_TO_EXT[mimeType] || 'bin'
}

// ── Internal API base URL ─────────────────────────────────────
// Richiede NEXT_PUBLIC_APP_URL in .env.local (e in Vercel env per produzione).
// Fallback: http://localhost:3000 solo per sviluppo locale.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

// ── Core sync logic per singolo file ─────────────────────────

/**
 * Sincronizza un singolo file Drive:
 * 1. Recupera metadata Drive (modifiedTime, mimeType, name)
 * 2. Delta check
 * 3. Scarica contenuto
 * 4. Chiama /api/import/parse (multipart)
 * 5. Chiama /api/import/confirm (JSON)
 *
 * @param {object} fileRecord — riga da drive_synced_files
 * @param {string} providerToken — Google OAuth access token dalla sessione
 * @param {string} cookieHeader — stringa cookie per le chiamate interne (mantiene la sessione)
 * @returns {object} { status: 'synced'|'skipped', ...details }
 */
async function syncOneFile(fileRecord, providerToken, cookieHeader) {
  const {
    id: recordId,
    file_id,
    file_name,
    import_mode,
    last_modified,
    production_id,
  } = fileRecord

  // ── Step 1: Metadata Drive ──────────────────────────────
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}` +
    `?fields=name%2CmodifiedTime%2CmimeType`,
    { headers: { Authorization: `Bearer ${providerToken}` } }
  )
  if (!metaRes.ok) {
    const errText = await metaRes.text()
    throw new Error(`Drive metadata error ${metaRes.status}: ${errText.slice(0, 200)}`)
  }
  const meta = await metaRes.json()
  const driveName    = meta.name         || file_name  || file_id
  const modifiedTime = meta.modifiedTime || null
  const mimeType     = meta.mimeType     || ''

  // ── Step 2: Delta check ─────────────────────────────────
  // Salta se il file non è stato modificato dall'ultima sincronizzazione
  if (modifiedTime && modifiedTime === last_modified) {
    return {
      status:    'skipped',
      reason:    'no_changes',
      file_id,
      file_name: driveName,
    }
  }

  // ── Step 3: Download ────────────────────────────────────
  let downloadUrl
  let downloadFileName
  let downloadMimeType

  const exportInfo = WORKSPACE_EXPORT[mimeType]
  if (exportInfo) {
    // Google Workspace (Sheets, Docs): esporta nel formato equivalente Office
    downloadUrl      = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}/export` +
                       `?mimeType=${encodeURIComponent(exportInfo.mimeType)}`
    downloadFileName = driveName.replace(/\.[^.]+$/, '') + '.' + exportInfo.ext
    downloadMimeType = exportInfo.mimeType
  } else {
    // File normale: download diretto (?alt=media)
    downloadUrl      = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}?alt=media`
    downloadFileName = driveName.includes('.') ? driveName : `${driveName}.${resolveExt(mimeType, file_name)}`
    downloadMimeType = mimeType || 'application/octet-stream'
  }

  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${providerToken}` },
  })
  if (!downloadRes.ok) {
    const errText = await downloadRes.text()
    throw new Error(`Drive download error ${downloadRes.status}: ${errText.slice(0, 200)}`)
  }
  const fileBuffer = await downloadRes.arrayBuffer()
  console.log(`[drive/sync] Downloaded "${downloadFileName}" (${fileBuffer.byteLength} bytes)`)

  // ── Accommodation multi-sheet path ──────────────────────
  // Per file Excel in modalità accommodation: itera su tutti i fogli validi,
  // aggrega rows e hotel, poi chiama confirm una sola volta.
  const ext = downloadFileName.split('.').pop().toLowerCase()
  const isExcel = ext === 'xlsx' || ext === 'xls'

  console.log(`[drive/sync] import_mode="${import_mode}", isExcel=${isExcel}, ext="${ext}"`)

  if (import_mode === 'accommodation' && isExcel) {
    console.log('[drive/sync] ACCOMMODATION BRANCH ENTERED, validSheets will be listed')
    // Ottieni lista fogli
    const sheetsFd = new FormData()
    sheetsFd.append('file', new Blob([fileBuffer], { type: downloadMimeType }), downloadFileName)
    const sheetsRes = await fetch(`${APP_URL}/api/import/sheets`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      body: sheetsFd,
    })
    const sheetsData = await sheetsRes.json()
    const allSheets = sheetsData.sheetNames || []
    const validSheets = allSheets.filter(n => n !== 'COST REPORT' && !n.toUpperCase().includes('OLD'))
    console.log(`[drive/sync] accommodation sheets: all=${allSheets.length} valid=${validSheets.length}`, validSheets)

    // Parse ogni foglio e aggrega
    let allRows = []
    let allHotels = []
    let lastDetectedMode = 'accommodation'

    for (const sheetName of validSheets) {
      const fd = new FormData()
      fd.append('file', new Blob([fileBuffer], { type: downloadMimeType }), downloadFileName)
      fd.append('mode', 'accommodation')
      fd.append('productionId', production_id)
      fd.append('selectedSheet', sheetName)
      const pRes = await fetch(`${APP_URL}/api/import/parse`, {
        method: 'POST',
        headers: { Cookie: cookieHeader },
        body: fd,
      })
      if (!pRes.ok) {
        console.warn(`[drive/sync] parse failed for sheet "${sheetName}": ${pRes.status}`)
        continue
      }
      const pData = await pRes.json()
      if (pData.rows) allRows.push(...pData.rows)
      if (pData.newData?.hotels) {
        for (const h of pData.newData.hotels) {
          if (!allHotels.find(x => x.name === h.name)) allHotels.push(h)
        }
      }
      if (pData.detectedMode) lastDetectedMode = pData.detectedMode
      console.log(`[drive/sync] sheet "${sheetName}": ${pData.rows?.length || 0} rows, error=${pData.error || 'none'}`)
    }

    console.log(`[drive/sync] accommodation aggregated: ${allRows.length} rows, ${allHotels.length} hotels`)

    // Confirm con tutti i rows aggregati
    const confirmRes = await fetch(`${APP_URL}/api/import/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        rows: allRows,
        mode: import_mode,
        productionId: production_id,
        newLocations: allHotels,
        detectedMode: lastDetectedMode,
      }),
    })
    const confirmData = await confirmRes.json()
    console.log(
      `[drive/sync] accommodation confirm OK: inserted=${confirmData.inserted} updated=${confirmData.updated}` +
      ` skipped=${confirmData.skipped} errors=${(confirmData.errors || []).length}`
    )

    return {
      status: 'synced',
      file_id,
      file_name: driveName,
      modifiedTime,
      parsed: allRows.length,
      inserted: confirmData.inserted || 0,
      updated: confirmData.updated || 0,
      skipped_rows: confirmData.skipped || 0,
      errors: confirmData.errors || [],
    }
  }

  // ── Step 4: Parse ───────────────────────────────────────
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([fileBuffer], { type: downloadMimeType }),
    downloadFileName
  )
  formData.append('mode',         import_mode)
  formData.append('productionId', production_id)

  const parseRes = await fetch(`${APP_URL}/api/import/parse`, {
    method:  'POST',
    headers: { Cookie: cookieHeader },
    body:    formData,
  })
  if (!parseRes.ok) {
    const errText = await parseRes.text()
    throw new Error(`parse error ${parseRes.status}: ${errText.slice(0, 400)}`)
  }
  const parseData = await parseRes.json()
  if (parseData.error) {
    throw new Error(`parse returned error: ${parseData.error}`)
  }

  const { rows = [], newData = {}, detectedMode } = parseData
  const parsedCount = rows.length
  console.log(`[drive/sync] parse OK: ${parsedCount} rows, detectedMode=${detectedMode}, hotels=${(newData.hotels || []).length}`)

  // ── Step 5: Confirm ─────────────────────────────────────
  // Passa tutti i rows (inclusi quelli con action='skip' per il conteggio),
  // e i nuovi hotel come newLocations per auto-inserimento.
  const confirmRes = await fetch(`${APP_URL}/api/import/confirm`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      rows,
      mode:         import_mode,
      productionId: production_id,
      newLocations: newData.hotels || [],
      detectedMode: detectedMode || import_mode,
    }),
  })
  if (!confirmRes.ok) {
    const errText = await confirmRes.text()
    throw new Error(`confirm error ${confirmRes.status}: ${errText.slice(0, 400)}`)
  }
  const confirmData = await confirmRes.json()
  if (confirmData.error) {
    throw new Error(`confirm returned error: ${confirmData.error}`)
  }

  console.log(
    `[drive/sync] confirm OK: inserted=${confirmData.inserted} updated=${confirmData.updated}` +
    ` skipped=${confirmData.skipped} errors=${(confirmData.errors || []).length}`
  )

  return {
    status:       'synced',
    file_id,
    file_name:    driveName,
    modifiedTime,
    parsed:       parsedCount,
    inserted:     confirmData.inserted     || 0,
    updated:      confirmData.updated      || 0,
    skipped_rows: confirmData.skipped      || 0,
    errors:       confirmData.errors       || [],
  }
}

// ── POST handler ─────────────────────────────────────────────

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // provider_token richiesto (Google OAuth access token nella sessione corrente)
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token
    if (!providerToken) {
      return NextResponse.json(
        {
          error: 'Google access token non disponibile. ' +
                 'Effettua il logout e rientra con Google per autorizzare Drive.',
        },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { production_id, file_id } = body

    if (!production_id) {
      return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    }

    // Query file(s) da sincronizzare
    let query = supabase
      .from('drive_synced_files')
      .select('*')
      .eq('production_id', production_id)
    if (file_id) {
      // Sync singolo file
      query = query.eq('file_id', file_id)
    }

    const { data: files, error: fetchErr } = await query
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'Nessun file Drive registrato per questa produzione.' },
        { status: 404 }
      )
    }

    // Forwarding cookie per le chiamate interne (mantiene la sessione utente attiva)
    const cookieHeader = req.headers.get('cookie') || ''

    const synced  = []
    const skipped = []
    const failed  = []

    const service = await createSupabaseServiceClient()

    // Processo sequenziale — evita rate-limit Drive API e sovraccarico Claude
    for (const fileRecord of files) {
      try {
        const result = await syncOneFile(fileRecord, providerToken, cookieHeader)

        if (result.status === 'skipped') {
          skipped.push({
            file_id:   result.file_id,
            file_name: result.file_name,
            reason:    result.reason,
          })
        } else {
          // Aggiorna last_synced_at + last_modified + file_name (potrebbe essere cambiato su Drive)
          const { error: updateErr } = await service
            .from('drive_synced_files')
            .update({
              last_synced_at: new Date().toISOString(),
              last_modified:  result.modifiedTime || null,
              file_name:      result.file_name    || fileRecord.file_name,
            })
            .eq('id', fileRecord.id)

          if (updateErr) {
            console.error(`[drive/sync] DB update error for record ${fileRecord.id}:`, updateErr.message)
          }

          synced.push({
            file_id:      result.file_id,
            file_name:    result.file_name,
            modifiedTime: result.modifiedTime,
            parsed:       result.parsed,
            inserted:     result.inserted,
            updated:      result.updated,
            skipped_rows: result.skipped_rows,
            errors:       result.errors,
          })
        }
      } catch (e) {
        console.error(`[drive/sync] Error syncing file ${fileRecord.file_id}:`, e.message)
        failed.push({
          file_id:   fileRecord.file_id,
          file_name: fileRecord.file_name || fileRecord.file_id,
          error:     e.message,
        })
      }
    }

    const summary = {
      total:   files.length,
      synced:  synced.length,
      skipped: skipped.length,
      failed:  failed.length,
    }

    console.log(`[drive/sync] Done: production=${production_id}`, summary)

    return NextResponse.json({ synced, skipped, failed, summary })
  } catch (e) {
    console.error('[drive/sync]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
