/**
 * /api/bridge/invites
 *
 * GET    → list all invite codes for productions the caller manages
 * POST   → create new invite code
 * PATCH  → update an invite (label, active, expires_at, max_uses)
 * DELETE → delete an invite
 *
 * Requires CAPTAIN or ADMIN role.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

/** Random uppercase alphanumeric code, e.g. "X7K2-R9QP" */
function generateCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // no O/0/I/1 confusion
  let code = ''
  for (let i = 0; i < length; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function getAdminProductionIds(supabase, userId) {
  const { data } = await supabase
    .from('user_roles')
    .select('production_id, role')
    .eq('user_id', userId)
    .in('role', ['CAPTAIN', 'ADMIN'])
  return (data || []).map(r => r.production_id)
}

// ── GET ────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const prodIds = await getAdminProductionIds(supabase, user.id)
    if (prodIds.length === 0) return NextResponse.json({ invites: [] })

    const { data: invites, error } = await supabase
      .from('production_invites')
      .select('*, productions(id, name)')
      .in('production_id', prodIds)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invites: invites || [] })
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

    const prodIds = await getAdminProductionIds(supabase, user.id)
    if (prodIds.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const {
      production_id,
      code: customCode,
      label,
      role      = 'MANAGER',
      max_uses  = null,
      expires_at = null,
    } = body

    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })
    if (!prodIds.includes(production_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const code = customCode ? customCode.trim().toUpperCase() : generateCode()

    const service = await createSupabaseServiceClient()
    const { data: invite, error: invErr } = await service
      .from('production_invites')
      .insert({
        production_id,
        code,
        label:      label?.trim() || null,
        role,
        max_uses:   max_uses   ? parseInt(max_uses)   : null,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        created_by: user.id,
        active:     true,
      })
      .select('*, productions(id, name)')
      .single()

    if (invErr) {
      if (invErr.message.includes('unique') || invErr.code === '23505') {
        return NextResponse.json({ error: `Code "${code}" already exists — choose a different one` }, { status: 409 })
      }
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }
    return NextResponse.json({ invite }, { status: 201 })
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

    const prodIds = await getAdminProductionIds(supabase, user.id)
    if (prodIds.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const allowed = ['label', 'active', 'expires_at', 'max_uses', 'role']
    const patch = {}
    for (const k of allowed) {
      if (k in updates) patch[k] = updates[k]
    }

    const service = await createSupabaseServiceClient()

    // Verify ownership
    const { data: inv } = await service
      .from('production_invites')
      .select('production_id')
      .eq('id', id)
      .single()
    if (!inv || !prodIds.includes(inv.production_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await service
      .from('production_invites')
      .update(patch)
      .eq('id', id)
      .select('*, productions(id, name)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invite: data })
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

    const prodIds = await getAdminProductionIds(supabase, user.id)
    if (prodIds.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const service = await createSupabaseServiceClient()

    // Verify ownership
    const { data: inv } = await service
      .from('production_invites')
      .select('production_id')
      .eq('id', id)
      .single()
    if (!inv || !prodIds.includes(inv.production_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await service.from('production_invites').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
