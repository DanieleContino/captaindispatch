/**
 * app/api/push/subscribe/route.js — Salva subscription push (S11 TASK 1)
 *
 * POST { subscription: PushSubscription, productionId: string }
 *  → upsert in push_subscriptions per l'utente autenticato
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscription, productionId } = body

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return NextResponse.json({ error: 'Subscription non valida' }, { status: 400 })
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:       user.id,
          production_id: productionId || null,
          endpoint:      subscription.endpoint,
          p256dh:        subscription.keys.p256dh,
          auth:          subscription.keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      console.error('[push/subscribe] Errore upsert:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push/subscribe] Eccezione:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
