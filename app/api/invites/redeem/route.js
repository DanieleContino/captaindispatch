/**
 * POST /api/invites/redeem
 * Body: { code: string }
 *
 * Validates an invite code and adds the current user to the linked production.
 * Codes are matched case-insensitively (stored/compared as UPPER).
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const code = body?.code?.trim()?.toUpperCase()
    if (!code) return NextResponse.json({ error: 'Code is required' }, { status: 400 })

    // Service client: bypasses RLS for invite lookup
    const service = await createSupabaseServiceClient()

    const { data: invite, error: inviteErr } = await service
      .from('production_invites')
      .select('*')
      .eq('active', true)
      .filter('code', 'eq', code)   // already stored UPPER
      .maybeSingle()

    if (inviteErr || !invite) {
      return NextResponse.json({ error: 'Invalid or inactive code' }, { status: 400 })
    }

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This code has expired' }, { status: 400 })
    }

    // Check max uses
    if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
      return NextResponse.json({ error: 'This code has reached its maximum uses' }, { status: 400 })
    }

    // Check if user already has a role in this production
    const { data: existingRole } = await service
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('production_id', invite.production_id)
      .maybeSingle()

    if (!existingRole) {
      const { error: roleErr } = await service.from('user_roles').insert({
        user_id:        user.id,
        production_id:  invite.production_id,
        role:           invite.role,
        invite_code_id: invite.id,   // ← tracks which invite granted this access
      })
      if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 })
    }

    // Increment uses_count (fire-and-forget — don't fail the request)
    service
      .from('production_invites')
      .update({ uses_count: invite.uses_count + 1 })
      .eq('id', invite.id)
      .then(() => {})

    // Return production info so the client can switch to it
    const { data: prod } = await service
      .from('productions')
      .select('id, name, slug')
      .eq('id', invite.production_id)
      .single()

    return NextResponse.json({
      success:       true,
      production:    prod,
      alreadyMember: !!existingRole,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
