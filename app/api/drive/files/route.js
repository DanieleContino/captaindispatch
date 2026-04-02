/**
 * /api/drive/files
 *
 * GET    ?production_id=XXX  → lista file Drive collegati alla produzione
 * POST   { production_id, file_id, file_name, import_mode }  → collega nuovo file
 *          Se provider_token disponibile in sessione, recupera nome/modifiedTime da Drive API
 * DELETE { id }  → scollega file
 *
 * Autenticazione: richiede sessione utente attiva (provider_token per Drive).
 * Inserimenti/delete usano service client per bypassare RLS.
 * RLS garantisce che GET restituisca solo file delle produzioni dell'utente.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

const VALID_MODES = ['crew', 'accommodation', 'fleet', 'hal', 'travel']

// ── GET ────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const production_id = searchParams.get('production_id')
    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })

    const { data: files, error } = await supabase
      .from('drive_synced_files')
      .select('*')
      .eq('production_id', production_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ files: files || [] })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST ───────────────────────────────────────────────────
export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // provider_token = Google OAuth access token dalla sessione corrente
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token

    const body = await req.json()
    const { production_id, file_id, file_name, import_mode } = body

    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    if (!file_id)        return NextResponse.json({ error: 'file_id is required' }, { status: 400 })
    if (!import_mode || !VALID_MODES.includes(import_mode)) {
      return NextResponse.json(
        { error: `import_mode must be one of: ${VALID_MODES.join(', ')}` },
        { status: 400 }
      )
    }

    // Verifica appartenenza alla produzione tramite RLS (client utente)
    const { data: prodCheck } = await supabase
      .from('productions')
      .select('id')
      .eq('id', production_id)
      .single()
    if (!prodCheck) {
      return NextResponse.json({ error: 'Production not found or access denied' }, { status: 403 })
    }

    // Recupera metadati Drive (nome reale + modifiedTime) se provider_token disponibile
    let resolvedName  = file_name || file_id
    let lastModified  = null

    if (providerToken) {
      try {
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}?fields=name%2CmodifiedTime`,
          { headers: { Authorization: `Bearer ${providerToken}` } }
        )
        if (driveRes.ok) {
          const meta = await driveRes.json()
          if (meta.name)         resolvedName = meta.name
          if (meta.modifiedTime) lastModified  = meta.modifiedTime
        } else {
          console.warn('[drive/files POST] Drive API error:', driveRes.status, await driveRes.text())
        }
      } catch (driveErr) {
        // Non bloccante: procede senza metadati Drive
        console.warn('[drive/files POST] Drive fetch failed:', driveErr.message)
      }
    }

    // Upsert: se il file è già collegato alla stessa produzione aggiorna i metadati
    const service = await createSupabaseServiceClient()
    const { data: record, error: insErr } = await service
      .from('drive_synced_files')
      .upsert(
        {
          production_id,
          file_id,
          file_name:     resolvedName,
          import_mode,
          last_modified: lastModified,
        },
        { onConflict: 'production_id,file_id' }
      )
      .select('*')
      .single()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    return NextResponse.json({ file: record }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE ─────────────────────────────────────────────────
export async function DELETE(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Verifica ownership tramite RLS (client utente: vede solo le sue produzioni)
    const { data: record } = await supabase
      .from('drive_synced_files')
      .select('id, production_id')
      .eq('id', id)
      .single()
    if (!record) {
      return NextResponse.json({ error: 'Record not found or access denied' }, { status: 404 })
    }

    const service = await createSupabaseServiceClient()
    const { error } = await service
      .from('drive_synced_files')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
