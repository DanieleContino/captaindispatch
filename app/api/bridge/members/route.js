/**
 * /api/bridge/members
 *
 * GET    ?production_id= → list all members with user info
 * PATCH  { user_id, production_id, role } → change role
 * DELETE { user_id, production_id }       → remove member
 *
 * Requires CAPTAIN or ADMIN role on the target production.
 * Protections (client + server):
 *   - Cannot change/remove your own account
 *   - Cannot demote/remove the last Captain
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

const VALID_ROLES = ['CAPTAIN', 'ADMIN', 'MANAGER', 'PRODUCTION', 'TRAVEL', 'ACCOMMODATION']

async function getAdminProductionIds(supabase, userId) {
  const { data } = await supabase
    .from('user_roles')
    .select('production_id')
    .eq('user_id', userId)
    .in('role', ['CAPTAIN', 'ADMIN'])
  return (data || []).map(r => r.production_id)
}

// ── GET ────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const production_id = searchParams.get('production_id')
    if (!production_id) return NextResponse.json({ error: 'production_id is required' }, { status: 400 })

    // Verify caller is CAPTAIN/ADMIN for this production
    const adminIds = await getAdminProductionIds(supabase, user.id)
    if (!adminIds.includes(production_id)) {
      return NextResponse.json({ error: 'Forbidden — Captain or Admin role required' }, { status: 403 })
    }

    const service = await createSupabaseServiceClient()

    // All roles for this production
    const { data: roles, error: rolesErr } = await service
      .from('user_roles')
      .select('user_id, role, created_at')
      .eq('production_id', production_id)
      .order('created_at', { ascending: true })

    if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 })
    if (!roles || roles.length === 0) return NextResponse.json({ members: [] })

    // Fetch all auth users (service-role required)
    const { data: { users: allUsers }, error: usersErr } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]))

    const members = roles.map(r => {
      const u = userMap[r.user_id] || {}
      return {
        user_id:         r.user_id,
        role:            r.role,
        joined_at:       r.created_at,
        email:           u.email           || null,
        name:            u.user_metadata?.full_name || u.user_metadata?.name || null,
        avatar_url:      u.user_metadata?.avatar_url || null,
        last_sign_in_at: u.last_sign_in_at || null,
      }
    })

    return NextResponse.json({ members })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH (change role) ────────────────────────────────────
export async function PATCH(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { user_id, production_id, role: newRole } = body

    if (!user_id || !production_id || !newRole) {
      return NextResponse.json({ error: 'user_id, production_id and role are required' }, { status: 400 })
    }
    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Invalid role "${newRole}"` }, { status: 400 })
    }

    // Verify caller is CAPTAIN/ADMIN for this production
    const adminIds = await getAdminProductionIds(supabase, user.id)
    if (!adminIds.includes(production_id)) {
      return NextResponse.json({ error: 'Forbidden — Captain or Admin role required' }, { status: 403 })
    }

    // Block self-role change
    if (user_id === user.id) {
      return NextResponse.json({ error: 'You cannot change your own role. Ask another Captain.' }, { status: 403 })
    }

    const service = await createSupabaseServiceClient()

    // Verify target is a member
    const { data: existing } = await service
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .eq('production_id', production_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'This user is not a member of this production' }, { status: 404 })
    }

    // Protect last Captain: cannot demote if they are the only CAPTAIN
    if (existing.role === 'CAPTAIN' && !['CAPTAIN', 'ADMIN'].includes(newRole)) {
      const { count } = await service
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('production_id', production_id)
        .eq('role', 'CAPTAIN')

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last Captain. Promote another member to Captain first.' },
          { status: 409 }
        )
      }
    }

    const { error: updateErr } = await service
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', user_id)
      .eq('production_id', production_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE (remove member) ─────────────────────────────────
export async function DELETE(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { user_id, production_id } = body

    if (!user_id || !production_id) {
      return NextResponse.json({ error: 'user_id and production_id are required' }, { status: 400 })
    }

    // Verify caller is CAPTAIN/ADMIN for this production
    const adminIds = await getAdminProductionIds(supabase, user.id)
    if (!adminIds.includes(production_id)) {
      return NextResponse.json({ error: 'Forbidden — Captain or Admin role required' }, { status: 403 })
    }

    // Block self-removal
    if (user_id === user.id) {
      return NextResponse.json({ error: 'You cannot remove yourself from the production.' }, { status: 403 })
    }

    const service = await createSupabaseServiceClient()

    // Verify target is a member
    const { data: existing } = await service
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .eq('production_id', production_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'This user is not a member of this production' }, { status: 404 })
    }

    // Protect last Captain: cannot remove if they are the only CAPTAIN
    if (existing.role === 'CAPTAIN') {
      const { count } = await service
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('production_id', production_id)
        .eq('role', 'CAPTAIN')

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last Captain. Assign another Captain first.' },
          { status: 409 }
        )
      }
    }

    const { error: deleteErr } = await service
      .from('user_roles')
      .delete()
      .eq('user_id', user_id)
      .eq('production_id', production_id)

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
