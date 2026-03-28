/**
 * app/api/push/unsubscribe/route.js — Rimuove subscription push (S11 TASK 1)
 *
 * DELETE { endpoint: string }
 *  → elimina la subscription per l'utente autenticato
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint mancante' }, { status: 400 })
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) {
      console.error('[push/unsubscribe] Errore delete:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push/unsubscribe] Eccezione:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
