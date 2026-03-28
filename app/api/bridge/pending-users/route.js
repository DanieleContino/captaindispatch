/**
 * GET /api/bridge/pending-users
 * Returns users who logged in but have no user_roles (awaiting approval).
 * Requires CAPTAIN or ADMIN role.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify caller is CAPTAIN or ADMIN
    const { data: myRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isBridgeAdmin = myRoles?.some(r => ['CAPTAIN', 'ADMIN'].includes(r.role))
    if (!isBridgeAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = await createSupabaseServiceClient()

    // All registered users
    const { data: { users: allUsers }, error: usersErr } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

    // Users that already have at least one role
    const { data: existingRoles } = await service
      .from('user_roles')
      .select('user_id')

    const approvedIds = new Set((existingRoles || []).map(r => r.user_id))

    const pending = allUsers
      .filter(u => !approvedIds.has(u.id) && u.id !== user.id)
      .map(u => ({
        id:              u.id,
        email:           u.email,
        name:            u.user_metadata?.full_name || u.user_metadata?.name || null,
        avatar_url:      u.user_metadata?.avatar_url || null,
        created_at:      u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return NextResponse.json({ pending })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
