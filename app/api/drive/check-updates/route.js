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
 * Richiede provider_token nella sessione utente (Google OAuth).
 *
 * Response:
 *   { files: Array<{ id, file_id, file_name, import_mode, last_synced_at,
 *                    driveModifiedTime, hasUpdate: true }> }
 */

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(req) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // provider_token richiesto per interrogare Drive API
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

    const { searchParams } = new URL(req.url)
    const production_id = searchParams.get('production_id')
    if (!production_id) {
      return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    }

    // Leggi tutti i file registrati per questa produzione
    const { data: dbFiles, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('id, file_id, file_name, import_mode, last_modified, last_synced_at')
      .eq('production_id', production_id)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!dbFiles || dbFiles.length === 0) {
      return NextResponse.json({ files: [] })
    }

    const service = await createSupabaseServiceClient()
    const filesWithUpdates = []

    // Per ogni file, interroga Drive per il modifiedTime corrente
    for (const f of dbFiles) {
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.file_id)}` +
          `?fields=name%2CmodifiedTime`,
          { headers: { Authorization: `Bearer ${providerToken}` } }
        )

        if (!metaRes.ok) {
          console.warn(
            `[drive/check-updates] Drive metadata error for ${f.file_id}: ${metaRes.status}`
          )
          // Se non riusciamo a controllare Drive, segnala il file come "da verificare"
          // solo se non è mai stato sincronizzato
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
          continue
        }

        const meta = await metaRes.json()
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
        console.warn(`[drive/check-updates] Error checking ${f.file_id}:`, e.message)
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
      `checked=${dbFiles.length} updates=${filesWithUpdates.length}`
    )

    return NextResponse.json({ files: filesWithUpdates })
  } catch (e) {
    console.error('[drive/check-updates]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
