/**
 * GET /api/cron/arrival-status
 *
 * Vercel Cron Job — ogni 5 minuti
 * Equivalente di tsAutoUpdateTravelStatusOnArrival() in 01_Crew.gs
 *
 * Logica:
 * 1. Trova tutti i trip ARRIVAL con end_dt nel range [now-6min, now]
 * 2. Per ogni passeggero di quei trip che ha travel_status = 'IN'
 *    → aggiorna a 'PRESENT'
 * 3. NON toccare chi è già PRESENT o OUT (il manuale vince sempre)
 *
 * Autenticazione: Bearer token via CRON_SECRET env var.
 * Vercel invia automaticamente Authorization header sulle cron route.
 */

import { createClient } from '@supabase/supabase-js'

const WINDOW_MIN = 6  // finestra in minuti (leggermente > 5 per coprire jitter)

export async function GET(request) {
  // ── Autenticazione ───────────────────────────────────────
  const auth = request.headers.get('Authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Supabase (service role — bypass RLS) ─────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )

  const now      = new Date()
  const windowMs = WINDOW_MIN * 60 * 1000
  const since    = new Date(now.getTime() - windowMs)

  // ── 1. Trova trip ARRIVAL completati nella finestra ──────
  const { data: arrivals, error: tripsErr } = await supabase
    .from('trips')
    .select('id, trip_id, date, trip_passengers(crew_id)')
    .eq('transfer_class', 'ARRIVAL')
    .not('status', 'eq', 'CANCELLED')
    .gte('end_dt', since.toISOString())
    .lte('end_dt', now.toISOString())

  if (tripsErr) {
    console.error('[cron/arrival-status] trips query error:', tripsErr)
    return Response.json({ error: tripsErr.message }, { status: 500 })
  }

  if (!arrivals || arrivals.length === 0) {
    return Response.json({ updated: 0, message: 'No arrivals in window' })
  }

  // ── 2. Raccogli crew_ids univoci ─────────────────────────
  const crewIds = [
    ...new Set(
      arrivals.flatMap(t => (t.trip_passengers || []).map(p => p.crew_id))
    ),
  ]

  if (crewIds.length === 0) {
    return Response.json({ updated: 0, message: 'No passengers in arrived trips' })
  }

  // ── 3. Aggiorna solo chi è ancora IN (manuale vince) ─────
  const { data: updated, error: updateErr } = await supabase
    .from('crew')
    .update({ travel_status: 'PRESENT' })
    .in('id', crewIds)
    .eq('travel_status', 'IN')   // NON toccare chi è già PRESENT o OUT
    .select('id, full_name, travel_status')

  if (updateErr) {
    console.error('[cron/arrival-status] update error:', updateErr)
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  const count = updated?.length ?? 0
  console.log(`[cron/arrival-status] ${count} crew IN→PRESENT at ${now.toISOString()}`)

  return Response.json({
    updated: count,
    crew:    updated?.map(c => c.full_name) ?? [],
    window:  { since: since.toISOString(), now: now.toISOString() },
    trips:   arrivals.map(t => t.trip_id),
  })
}
