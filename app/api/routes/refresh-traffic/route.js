/**
 * POST /api/routes/refresh-traffic
 *
 * Trigger manuale per aggiornare le rotte con traffico reale (Google Routes API).
 * Chiamato dal pulsante "🚦 Traffico" nel Fleet Monitor.
 *
 * Body: { date?: "YYYY-MM-DD" }  — default: oggi
 * Auth: sessione Supabase (cookie)
 */

import { createClient }            from '@supabase/supabase-js'
import { createSupabaseServerClient } from '../../../../lib/supabaseServer'
import { refreshRoutesForDate }    from '../../../../lib/refreshRoutesWithGoogle'
import { NextResponse }            from 'next/server'

export async function POST(req) {
  // Autenticazione via sessione Supabase
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body     = await req.json().catch(() => ({}))
  const dateISO  = body.date || new Date().toISOString().split('T')[0]

  // Service role per bypass RLS nelle scritture
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  try {
    const result = await refreshRoutesForDate(supabase, dateISO)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[routes/refresh-traffic]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
