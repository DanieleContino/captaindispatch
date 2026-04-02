/**
 * /api/drive/download
 *
 * POST { production_id, file_id }
 *
 * Scarica il file da Google Drive e lo restituisce come blob binario.
 * Usato da DriveSyncWidget per scaricare il file lato client e aprire
 * l'ImportModal direttamente nella fase sheet-select.
 *
 * Richiede provider_token nella sessione utente attiva (Google OAuth).
 *
 * Response: blob con headers
 *   Content-Type:        <mime type del file>
 *   Content-Disposition: attachment; filename*=UTF-8''<nome>
 *   X-File-Name:         <nome file>
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

const MIME_TO_EXT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
}

function resolveExt(mimeType, fileName) {
  if (fileName) {
    const parts = fileName.split('.')
    if (parts.length > 1) return parts.pop().toLowerCase()
  }
  return MIME_TO_EXT[mimeType] || 'bin'
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

    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    if (!file_id)       return NextResponse.json({ error: 'file_id is required' },       { status: 400 })

    // Recupera il record da drive_synced_files per avere il file_name
    const { data: fileRecord, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('file_name, import_mode')
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

    const { file_name } = fileRecord

    // ── Step 1: Metadata Drive ──────────────────────────────
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}` +
      `?fields=name%2CmimeType`,
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
    const driveName = meta.name     || file_name || file_id
    const mimeType  = meta.mimeType || ''

    // ── Step 2: Download ────────────────────────────────────
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
    console.log(`[drive/download] Downloaded "${downloadFileName}" (${fileBuffer.byteLength} bytes)`)

    // ── Risposta blob ───────────────────────────────────────
    const encodedName = encodeURIComponent(downloadFileName)
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type':        downloadMimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'X-File-Name':         downloadFileName,
        'Cache-Control':       'no-store',
      },
    })
  } catch (e) {
    console.error('[drive/download]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
