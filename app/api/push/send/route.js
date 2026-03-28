/**
 * app/api/push/send/route.js — Invio push manuale (S11 TASK 1)
 *
 * POST { productionId: string, title: string, body: string, url?: string }
 *  → invia push a tutti i device della produzione
 *  → richiede ruolo CAPTAIN o ADMIN
 *
 * Usato per test e invii manuali.
 * I cron e gli eventi automatici chiamano direttamente sendPushToProduction().
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { sendPushToProduction } from '@/lib/webpush'

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Solo CAPTAIN o ADMIN possono inviare push manualmente
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['CAPTAIN', 'ADMIN'])
      .maybeSingle()

    if (!roleRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { productionId, title, body, url } = await request.json()

    if (!productionId) {
      return NextResponse.json({ error: 'productionId obbligatorio' }, { status: 400 })
    }
    if (!title && !body) {
      return NextResponse.json({ error: 'title o body obbligatorio' }, { status: 400 })
    }

    const result = await sendPushToProduction(productionId, { title, body, url })

    return NextResponse.json(result)
  } catch (e) {
    console.error('[push/send] Eccezione:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
