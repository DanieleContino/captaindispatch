/**
 * GET /api/cron/refresh-routes-traffic
 *
 * Vercel Cron — ogni giorno alle 05:00 UTC (06:00 CET)
 * Aggiorna tutte le rotte dei trip di oggi con traffico reale (Google Routes API).
 * Autenticazione: Bearer CRON_SECRET (Vercel lo invia automaticamente).
 */

import { createClient }            from '@supabase/supabase-js'
import { refreshRoutesForDate }    from '../../../../lib/refreshRoutesWithGoogle'

export async function GET(request) {
  // Autenticazione Vercel Cron
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('Authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  const todayISO = new Date().toISOString().split('T')[0]

  try {
    const result = await refreshRoutesForDate(supabase, todayISO)
    return Response.json(result)
  } catch (err) {
    console.error('[cron/refresh-routes-traffic]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
