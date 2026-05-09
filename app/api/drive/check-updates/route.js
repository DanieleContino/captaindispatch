/**
 * GET /api/drive/check-updates?production_id=XXX
 *
 * Controlla Google Drive per ogni file registrato in drive_synced_files e
 * restituisce quelli che hanno un modifiedTime su Drive più recente di
 * last_synced_at nel DB (o che non sono mai stati sincronizzati).
 *
 * A differenza del widget che legge solo il DB, questo endpoint interroga
 * Drive in tempo reale per rilevare modifiche avvenute DOPO l'ultima sync.
 *
 * Aggiorna anche last_modified nel DB se Drive ha un timestamp più recente,
 * in modo che le successive letture dal DB siano coerenti.
 *
 * AUTH: Each row in drive_synced_files has owner_user_id pointing to the
 * Supabase user who connected their Google Drive. We load a per-user
 * OAuth2 client via lib/googleClient (which auto-refreshes access tokens
 * using the persisted refresh_token in user_google_tokens).
 *
 * Response:
 *   { files: Array<{ id, file_id, file_name, import_mode, last_synced_at,
 *                    driveModifiedTime, hasUpdate: true }>,
 *     skipped?: Array<{ id, reason }> }
 */

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { getGoogleOAuthClient } from '@/lib/googleClient'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

export async function GET(req) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const production_id = searchParams.get('production_id')
    if (!production_id) {
      return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    }

    // Leggi tutti i file registrati per questa produzione
    // (owner_user_id is needed to load the right Google OAuth client per file)
    const { data: dbFiles, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('id, file_id, file_name, import_mode, last_modified, last_synced_at, owner_user_id')
      .eq('production_id', production_id)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!dbFiles || dbFiles.length === 0) {
      return NextResponse.json({ files: [] })
    }

    const service = await createSupabaseServiceClient()
    const filesWithUpdates = []
    const skipped = []

    // Cache: one Drive client per owner_user_id, built lazily.
    // (In a typical production, all files share the same owner; this avoids
    // re-loading the refresh_token from DB on every iteration.)
    const driveClientCache = new Map()

    async function getDriveForOwner(ownerId) {
      if (driveClientCache.has(ownerId)) return driveClientCache.get(ownerId)
      const auth = await getGoogleOAuthClient(ownerId)
      const drive = google.drive({ version: 'v3', auth })
      driveClientCache.set(ownerId, drive)
      return drive
    }

    // Per ogni file, interroga Drive per il modifiedTime corrente
    for (const f of dbFiles) {
      // Skip files without owner_user_id (legacy data, not yet backfilled)
      if (!f.owner_user_id) {
        skipped.push({ id: f.id, reason: 'no_owner_user_id' })
        continue
      }

      try {
        const drive = await getDriveForOwner(f.owner_user_id)
        const metaRes = await drive.files.get({
          fileId: f.file_id,
          fields: 'name,modifiedTime',
        })

        const meta = metaRes.data || {}
        const driveModifiedTime = meta.modifiedTime || null
        const driveName         = meta.name         || f.file_name

        // Un file ha aggiornamenti se:
        // 1. Non è mai stato sincronizzato (!last_synced_at), oppure
        // 2. Il modifiedTime su Drive è più recente dell'ultima sync nel DB
        const hasUpdate =
          !f.last_synced_at ||
          (driveModifiedTime && driveModifiedTime > f.last_synced_at)

        // Aggiorna last_modified nel DB se Drive ha un valore più recente
        // (permette confronti futuri anche senza questo endpoint)
        if (driveModifiedTime && driveModifiedTime !== f.last_modified) {
          await service
            .from('drive_synced_files')
            .update({
              last_modified: driveModifiedTime,
              file_name:     driveName,
            })
            .eq('id', f.id)
        }

        if (hasUpdate) {
          filesWithUpdates.push({
            id:               f.id,
            file_id:          f.file_id,
            file_name:        driveName || f.file_name,
            import_mode:      f.import_mode,
            last_synced_at:   f.last_synced_at,
            driveModifiedTime,
            hasUpdate:        true,
          })
        }
      } catch (e) {
        const msg = e?.message || String(e)
        // Categorize errors from getGoogleOAuthClient and Drive API
        if (msg === 'NO_GOOGLE_TOKEN') {
          skipped.push({ id: f.id, reason: 'owner_not_connected_to_drive' })
          continue
        }
        if (msg === 'TOKEN_DECRYPT_FAILED') {
          skipped.push({ id: f.id, reason: 'token_decrypt_failed' })
          continue
        }
        if (msg === 'GOOGLE_OAUTH_ENV_MISSING') {
          skipped.push({ id: f.id, reason: 'google_env_missing' })
          continue
        }

        console.warn(`[drive/check-updates] Error checking ${f.file_id}:`, msg)
        // Fallback: mostra il file solo se non è mai stato sincronizzato
        if (!f.last_synced_at) {
          filesWithUpdates.push({
            id:               f.id,
            file_id:          f.file_id,
            file_name:        f.file_name,
            import_mode:      f.import_mode,
            last_synced_at:   f.last_synced_at,
            driveModifiedTime: f.last_modified,
            hasUpdate:        true,
          })
        }
      }
    }

    console.log(
      `[drive/check-updates] production=${production_id} ` +
      `checked=${dbFiles.length} updates=${filesWithUpdates.length} skipped=${skipped.length}`
    )

    return NextResponse.json({ files: filesWithUpdates, skipped })
  } catch (e) {
    console.error('[drive/check-updates]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
