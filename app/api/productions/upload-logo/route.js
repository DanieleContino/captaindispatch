/**
 * /api/productions/upload-logo
 * POST → riceve il logo via FormData, lo carica su Supabase Storage
 *        usando il service client (bypassa RLS Storage).
 *
 * Body: multipart/form-data
 *   file        — il file immagine
 *   productionId — UUID della produzione
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../lib/supabaseServer'
import { NextResponse } from 'next/server'

const BUCKET = 'production-logos'

export async function POST(req) {
  try {
    // 1. Verifica autenticazione
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 2. Legge FormData
    const formData = await req.formData()
    const file         = formData.get('file')
    const productionId = formData.get('productionId')

    if (!file || !productionId) {
      return NextResponse.json({ error: 'file and productionId are required' }, { status: 400 })
    }

    // 3. Verifica che l'utente abbia accesso a questa produzione
    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('production_id', productionId)
      .single()

    if (roleErr || !roleRow) {
      return NextResponse.json({ error: 'Access denied to this production' }, { status: 403 })
    }

    // 4. Legge il file come ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    // Estrae estensione dal nome file
    const originalName = file.name || 'logo.jpg'
    const ext          = originalName.split('.').pop().toLowerCase() || 'jpg'
    const path         = `${productionId}/logo.${ext}`

    // 5. Upload via service client (bypassa completamente RLS Storage)
    const serviceClient = await createSupabaseServiceClient()
    const { error: upErr } = await serviceClient.storage
      .from(BUCKET)
      .upload(path, buffer, {
        upsert:      true,
        contentType: file.type || 'image/jpeg',
      })

    if (upErr) {
      console.error('Storage upload error:', upErr)
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    // 6. Ottiene URL pubblico
    const { data } = serviceClient.storage.from(BUCKET).getPublicUrl(path)
    const logo_url = data.publicUrl + '?t=' + Date.now()

    return NextResponse.json({ logo_url })
  } catch (e) {
    console.error('upload-logo error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
