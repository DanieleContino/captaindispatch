/**
 * GET /api/cron/drive-sync
 *
 * Vercel Cron — ogni 30 minuti (MVP: log-only).
 *
 * Il cron NON può eseguire la sincronizzazione reale perché il provider_token
 * (Google OAuth access token) è disponibile SOLO nelle sessioni utente attive,
 * non in contesti server-side senza sessione.
 *
 * Comportamento MVP:
 *   - Carica tutti i file registrati in drive_synced_files (tutte le produzioni)
 *   - Logga un riepilogo per produzione (N file, last_synced_at più recente)
 *   - Ritorna il riepilogo JSON (utile per monitoring/Vercel Logs)
 *
 * Sync reale → click manuale "Sync now" dalla UI (POST /api/drive/sync).
 *
 * Autenticazione: Bearer CRON_SECRET (Vercel lo invia automaticamente).
 */

import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  // ── Autenticazione Vercel Cron ────────────────────────────
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('Authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  const now = new Date().toISOString()
  console.log(`[cron/drive-sync] Avvio — ${now}`)

  try {
    // ── Carica tutti i file registrati ───────────────────────
    const { data: files, error: fetchErr } = await supabase
      .from('drive_synced_files')
      .select('id, production_id, file_id, file_name, import_mode, last_modified, last_synced_at')
      .order('production_id')

    if (fetchErr) {
      console.error('[cron/drive-sync] Errore query drive_synced_files:', fetchErr.message)
      return Response.json({ error: fetchErr.message }, { status: 500 })
    }

    const allFiles = files || []

    if (allFiles.length === 0) {
      console.log('[cron/drive-sync] Nessun file Drive registrato — niente da sincronizzare')
      return Response.json({
        timestamp:  now,
        message:    'Nessun file Drive registrato',
        total:      0,
        byProduction: [],
      })
    }

    // ── Raggruppa per produzione ─────────────────────────────
    const byProd = {}
    for (const f of allFiles) {
      if (!byProd[f.production_id]) {
        byProd[f.production_id] = { files: [], latestSync: null }
      }
      byProd[f.production_id].files.push(f)

      // Traccia la sincronizzazione più recente per questa produzione
      if (f.last_synced_at) {
        if (
          !byProd[f.production_id].latestSync ||
          f.last_synced_at > byProd[f.production_id].latestSync
        ) {
          byProd[f.production_id].latestSync = f.last_synced_at
        }
      }
    }

    // ── Log + build risposta ─────────────────────────────────
    const byProduction = []

    for (const [prodId, data] of Object.entries(byProd)) {
      const fileCount  = data.files.length
      const latestSync = data.latestSync

      // Calcola quanti file non sono mai stati sincronizzati
      const neverSynced = data.files.filter(f => !f.last_synced_at).length

      // Log compatto per Vercel Logs
      console.log(
        `[cron/drive-sync] prod=${prodId.slice(0, 8)} ` +
        `files=${fileCount} ` +
        `neverSynced=${neverSynced} ` +
        `latestSync=${latestSync ?? 'never'}`
      )

      // Dettaglio per la risposta JSON
      byProduction.push({
        productionId: prodId,
        fileCount,
        neverSynced,
        latestSync,
        files: data.files.map(f => ({
          file_id:       f.file_id,
          file_name:     f.file_name,
          import_mode:   f.import_mode,
          last_modified: f.last_modified,
          last_synced_at: f.last_synced_at,
        })),
      })
    }

    console.log(
      `[cron/drive-sync] Done — ${allFiles.length} file(s) in ` +
      `${byProduction.length} produzione(i). ` +
      `Sync reale richiede sessione utente attiva.`
    )

    return Response.json({
      timestamp:    now,
      message:      'MVP log-only — sync reale disponibile via POST /api/drive/sync con sessione utente',
      total:        allFiles.length,
      byProduction,
    })
  } catch (err) {
    console.error('[cron/drive-sync] Eccezione:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
