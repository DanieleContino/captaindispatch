/**
 * POST /api/bridge/approve-user
 * Body: {
 *   userId:        string  — auth.users id to approve
 *   mode:          'sandbox' | 'production'
 *   productionId?: string  — required when mode='production'
 *   role?:         string  — role to assign (default: 'MANAGER')
 *   sandboxName?:  string  — custom sandbox name (optional)
 * }
 *
 * mode='sandbox':    creates a new isolated production for the user
 * mode='production': adds the user to an existing production with given role
 * Requires CAPTAIN or ADMIN role.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function POST(req) {
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

    const body = await req.json()
    const { userId, mode = 'sandbox', productionId, role = 'MANAGER', sandboxName } = body

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    if (mode === 'production' && !productionId) {
      return NextResponse.json({ error: 'productionId is required for mode=production' }, { status: 400 })
    }

    const service = await createSupabaseServiceClient()

    // Get target user info
    const { data: { user: targetUser }, error: userErr } = await service.auth.admin.getUserById(userId)
    if (userErr || !targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let resolvedProductionId = productionId

    if (mode === 'sandbox') {
      const name = sandboxName?.trim() ||
        `Sandbox — ${targetUser.user_metadata?.full_name || targetUser.email}`
      const slug = slugify(name) + '-' + Date.now().toString(36)

      const { data: newProd, error: prodErr } = await service
        .from('productions')
        .insert({ name, slug })
        .select('id')
        .single()

      if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })
      resolvedProductionId = newProd.id
    }

    // Upsert user_roles (idempotent)
    const { error: roleErr } = await service.from('user_roles').upsert(
      { user_id: userId, production_id: resolvedProductionId, role },
      { onConflict: 'user_id,production_id', ignoreDuplicates: true }
    )
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 })

    return NextResponse.json({ success: true, productionId: resolvedProductionId, mode })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
