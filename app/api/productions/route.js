/**
 * /api/productions
 * GET  → list productions the user has access to (via user_roles)
 * POST → create new production + assign CAPTAIN role to current user
 * PATCH → update production details (all fields)
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../lib/supabaseServer'
import { NextResponse } from 'next/server'

const PROD_FIELDS = `
  id, name, slug, logo_url,
  producer, production_director,
  director,
  production_manager, production_manager_phone,
  production_coordinator, production_coordinator_phone,
  transportation_coordinator, transportation_coordinator_phone,
  transportation_captain, transportation_captain_phone,
  production_office_phone,
  set_location, set_address, basecamp,
  general_call_time, shoot_day, revision,
  created_at
`.trim()

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: roles, error } = await supabase
      .from('user_roles')
      .select(`role, productions(${PROD_FIELDS})`)
      .eq('user_id', user.id)
      .order('created_at', { referencedTable: 'productions', ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const productions = (roles || [])
      .filter(r => r.productions)
      .map(r => ({ ...r.productions, role: r.role }))

    return NextResponse.json({ productions })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, slug } = body
    if (!name?.trim() || !slug?.trim())
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })

    const insert = {
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
    }
    const textFields = [
      'producer','production_director','director',
      'production_manager','production_manager_phone',
      'production_coordinator','production_coordinator_phone',
      'transportation_coordinator','transportation_coordinator_phone',
      'transportation_captain','transportation_captain_phone',
      'production_office_phone',
      'set_location','set_address','basecamp',
      'general_call_time',
    ]
    textFields.forEach(f => { if (body[f] !== undefined) insert[f] = body[f]?.trim() || null })
    if (body.shoot_day !== undefined) insert.shoot_day = body.shoot_day || null
    if (body.revision  !== undefined) insert.revision  = body.revision  || 1

    // Usa service client per bypassare RLS sull'INSERT:
    // la policy "productions_own" blocca INSERT perché il ruolo
    // non esiste ancora al momento della creazione (chicken-and-egg).
    // L'autenticazione è già verificata sopra con supabase.auth.getUser().
    const serviceClient = await createSupabaseServiceClient()

    const { data: prod, error: prodErr } = await serviceClient
      .from('productions')
      .insert(insert)
      .select()
      .single()

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    // Assign CAPTAIN role to creator
    await serviceClient.from('user_roles').upsert(
      { user_id: user.id, production_id: prod.id, role: 'CAPTAIN' },
      { onConflict: 'user_id,production_id', ignoreDuplicates: true }
    )

    return NextResponse.json({ production: prod }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Verifica che l'utente abbia ruolo CAPTAIN o ADMIN su questa produzione
    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('production_id', id)
      .single()

    if (roleErr || !roleRow)
      return NextResponse.json({ error: 'Production not found or access denied' }, { status: 403 })
    if (!['CAPTAIN', 'ADMIN'].includes(roleRow.role))
      return NextResponse.json({ error: 'Only CAPTAIN or ADMIN can delete a production' }, { status: 403 })

    // Usa service client per CASCADE delete (bypassa RLS)
    const serviceClient = await createSupabaseServiceClient()
    const { error: delErr } = await serviceClient
      .from('productions')
      .delete()
      .eq('id', id)

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updates = {}
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.slug !== undefined) updates.slug = body.slug.trim().toLowerCase().replace(/\s+/g, '-')
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url || null

    const textFields = [
      'producer','production_director','director',
      'production_manager','production_manager_phone',
      'production_coordinator','production_coordinator_phone',
      'transportation_coordinator','transportation_coordinator_phone',
      'transportation_captain','transportation_captain_phone',
      'production_office_phone',
      'set_location','set_address','basecamp',
      'general_call_time',
    ]
    textFields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]?.trim() || null })
    if (body.shoot_day !== undefined) updates.shoot_day = body.shoot_day || null
    if (body.revision  !== undefined) updates.revision  = body.revision  || 1

    const { data, error } = await supabase
      .from('productions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ production: data })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
