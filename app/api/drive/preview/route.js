/**
 * /api/drive/preview
 *
 * POST { production_id, file_id }
 *
 * Come /api/drive/sync ma si ferma dopo il parse — NON chiama /api/import/confirm.
 * Utile per mostrare un'anteprima delle modifiche prima di applicarle.
 *
 * Richiede provider_token nella sessione utente attiva (Google OAuth).
 *
 * Delta check: se modifiedTime Drive === last_modified nel DB → { hasChanges: false, file_name }
 *
 * Response (nessuna modifica rilevata):
 *   { hasChanges: false, file_name }
 *
 * Response (modifiche rilevate):
 *   { hasChanges: true, file_id, file_name, modifiedTime, rows, newData, detectedMode }
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer'
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
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

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
    if (!file_id) {
      return NextResponse.json({ error: 'file_id is required' }, { status: 400 })
    }

    // Recupera il record da drive_synced_files
    const { data: fileRecord, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('*')
      .eq('production_id', production_id)
      .eq('file_id', file_id)
      .single()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!fileRecord) {
      return NextResponse.json(
        { error: 'File Drive non registrato per questa produzione.' },
        { status: 404 }
      )
    }

    const { file_name, import_mode, last_modified } = fileRecord

    // ── Step 1: Metadata Drive ──────────────────────────────
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}` +
      `?fields=name%2CmodifiedTime%2CmimeType`,
      { headers: { Authorization: `Bearer ${providerToken}` } }
    )
    if (!metaRes.ok) {
      const errText = await metaRes.text()
      return NextResponse.json(
        { error: `Drive metadata error ${metaRes.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      )
    }
    const meta = await metaRes.json()
    const driveName    = meta.name         || file_name  || file_id
    const modifiedTime = meta.modifiedTime || null
    const mimeType     = meta.mimeType     || ''

    // ── Step 2: Delta check ─────────────────────────────────
    if (modifiedTime && modifiedTime === last_modified) {
      return NextResponse.json({ hasChanges: false, file_name: driveName })
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
      return NextResponse.json(
        { error: `Drive download error ${downloadRes.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      )
    }
    const fileBuffer = await downloadRes.arrayBuffer()
    console.log(`[drive/preview] Downloaded "${downloadFileName}" (${fileBuffer.byteLength} bytes)`)

    // ── Step 4: Parse ───────────────────────────────────────
    const cookieHeader = req.headers.get('cookie') || ''

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
      return NextResponse.json(
        { error: `parse error ${parseRes.status}: ${errText.slice(0, 400)}` },
        { status: 502 }
      )
    }
    const parseData = await parseRes.json()
    if (parseData.error) {
      return NextResponse.json({ error: `parse returned error: ${parseData.error}` }, { status: 422 })
    }

    const { rows = [], newData = {}, detectedMode } = parseData
    console.log(`[drive/preview] parse OK: ${rows.length} rows, detectedMode=${detectedMode}`)

    // ── Risposta finale (nessuna confirm) ───────────────────
    return NextResponse.json({
      hasChanges:   true,
      file_id,
      file_name:    driveName,
      modifiedTime,
      rows,
      newData,
      detectedMode: detectedMode || import_mode,
    })
  } catch (e) {
    console.error('[drive/preview]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
