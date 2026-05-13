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
import { getDriveClient } from '@/lib/googleClient'
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

    // (provider_token removed — now uses per-user OAuth refresh_token via googleClient)
    const body = await req.json()
    const { production_id, file_id } = body

    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    if (!file_id)       return NextResponse.json({ error: 'file_id is required' },       { status: 400 })

    // Recupera il record da drive_synced_files per avere il file_name e owner_user_id
    const { data: fileRecord, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('file_name, import_mode, owner_user_id')
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

    const { file_name, owner_user_id } = fileRecord
    if (!owner_user_id) {
      return NextResponse.json({ error: 'File has no owner_user_id — reconnect Google Drive in Settings.' }, { status: 401 })
    }

    // ── Step 1: Metadata Drive ──────────────────────────────
    const drive = await getDriveClient(owner_user_id)
    const metaRes = await drive.files.get({ fileId: file_id, fields: 'name,mimeType' })
    const meta = metaRes.data || {}
    const driveName = meta.name     || file_name || file_id
    const mimeType  = meta.mimeType || ''

    // ── Step 2: Download ────────────────────────────────────
    let downloadUrl
    let downloadFileName
    let downloadMimeType

    const exportInfo = WORKSPACE_EXPORT[mimeType]
    let fileBuffer
    if (exportInfo) {
      downloadFileName = driveName.replace(/\.[^.]+$/, '') + '.' + exportInfo.ext
      downloadMimeType = exportInfo.mimeType
      const exportRes = await drive.files.export(
        { fileId: file_id, mimeType: exportInfo.mimeType },
        { responseType: 'arraybuffer' }
      )
      fileBuffer = exportRes.data
    } else {
      downloadFileName = driveName.includes('.') ? driveName : `${driveName}.${resolveExt(mimeType, file_name)}`
      downloadMimeType = mimeType || 'application/octet-stream'
      const downloadRes = await drive.files.get(
        { fileId: file_id, alt: 'media' },
        { responseType: 'arraybuffer' }
      )
      fileBuffer = downloadRes.data
    }
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
