/**
 * /api/productions
 * GET  → list productions the user has access to (via user_roles)
 * POST → create new production + assign CAPTAIN role to current user
 * PATCH → update production details (name, slug, producer, production_director, logo_url)
 */
import { createSupabaseServerClient } from '../../../lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('role, productions(id, name, slug, logo_url, producer, production_director, created_at)')
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

    const { name, slug, producer, production_director } = await req.json()
    if (!name?.trim() || !slug?.trim())
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })

    // Create production
    const { data: prod, error: prodErr } = await supabase
      .from('productions')
      .insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
        producer: producer?.trim() || null,
        production_director: production_director?.trim() || null,
      })
      .select()
      .single()

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    // Assign CAPTAIN role to creator
    await supabase.from('user_roles').upsert(
      { user_id: user.id, production_id: prod.id, role: 'CAPTAIN' },
      { onConflict: 'user_id,production_id', ignoreDuplicates: true }
    )

    return NextResponse.json({ production: prod }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, name, slug, producer, production_director, logo_url } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updates = {}
    if (name !== undefined)                updates.name                = name.trim()
    if (slug !== undefined)                updates.slug                = slug.trim().toLowerCase().replace(/\s+/g, '-')
    if (producer !== undefined)            updates.producer            = producer?.trim() || null
    if (production_director !== undefined) updates.production_director = production_director?.trim() || null
    if (logo_url !== undefined)            updates.logo_url            = logo_url || null

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
