/**
 * /api/rocket/templates
 *
 * GET    → list all shared templates for this production
 * POST   → create a new shared template
 * PATCH  → rename a template (update name)
 * DELETE → delete a template
 *
 * Auth: authenticated user with a role in the production.
 * RLS on rocket_templates ensures the production_id is enforced at DB level.
 */
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

// ── GET ────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!PRODUCTION_ID) {
      return NextResponse.json({ error: 'PRODUCTION_ID not configured' }, { status: 500 })
    }

    const { data: templates, error } = await supabase
      .from('rocket_templates')
      .select('id, name, config_json, created_by, created_at')
      .eq('production_id', PRODUCTION_ID)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ templates: templates || [] })
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

    if (!PRODUCTION_ID) {
      return NextResponse.json({ error: 'PRODUCTION_ID not configured' }, { status: 500 })
    }

    const body = await req.json()
    const { name, config_json } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!config_json || typeof config_json !== 'object') {
      return NextResponse.json({ error: 'config_json is required and must be an object' }, { status: 400 })
    }

    const { data: template, error } = await supabase
      .from('rocket_templates')
      .insert({
        production_id: PRODUCTION_ID,
        name: name.trim(),
        config_json,
        created_by: user.id,
      })
      .select('id, name, config_json, created_by, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ template }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────
export async function PATCH(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!PRODUCTION_ID) {
      return NextResponse.json({ error: 'PRODUCTION_ID not configured' }, { status: 500 })
    }

    const body = await req.json()
    const { id, name } = body

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('rocket_templates')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('production_id', PRODUCTION_ID)
      .select('id, name, config_json, created_by, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

    return NextResponse.json({ template: data })
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

    if (!PRODUCTION_ID) {
      return NextResponse.json({ error: 'PRODUCTION_ID not configured' }, { status: 500 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('rocket_templates')
      .delete()
      .eq('id', id)
      .eq('production_id', PRODUCTION_ID)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
