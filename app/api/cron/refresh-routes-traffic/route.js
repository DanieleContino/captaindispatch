/**
 * GET /api/cron/refresh-routes-traffic
 *
 * Vercel Cron — ogni giorno alle 05:00 UTC (06:00 CET)
 * Aggiorna tutte le rotte dei trip di oggi con traffico reale (Google Routes API).
 * Dopo l'aggiornamento, rileva rotte con incremento significativo di durata
 * e invia push ⚠️ Traffico a CAPTAIN+ADMIN della produzione interessata.
 *
 * Autenticazione: Bearer CRON_SECRET (Vercel lo invia automaticamente).
 */

import { createClient }         from '@supabase/supabase-js'
import { refreshRoutesForDate } from '../../../../lib/refreshRoutesWithGoogle'
import { sendPushToProduction } from '../../../../lib/webpush'

// Minuti di incremento minimo per considerare una rotta "con traffico anomalo"
const TRAFFIC_DELTA_MIN   = 10
// Numero minimo di rotte anomale per produzione per attivare push alert
const ALERT_ROUTE_THRESH  = 2

export async function GET(request) {
  // ── Autenticazione Vercel Cron ───────────────────────────
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
    // ── 1. Trova production_id + coppie di rotte usate oggi ─
    const { data: tripsToday } = await supabase
      .from('trips')
      .select('production_id, pickup_id, dropoff_id')
      .eq('date', todayISO)
      .neq('status', 'CANCELLED')

    const trips = (tripsToday || []).filter(t => t.pickup_id && t.dropoff_id)
    const prodIds     = [...new Set(trips.map(t => t.production_id))]
    const routeKeySet = new Set(
      trips.map(t => `${t.production_id}|${t.pickup_id}|${t.dropoff_id}`)
    )

    // ── 2. Snapshot durate Google PRIMA del refresh ──────────
    //    Solo rotte già aggiornate da Google (baseline valida)
    const beforeMap = {}
    if (prodIds.length) {
      const { data: routesBefore } = await supabase
        .from('routes')
        .select('production_id, from_id, to_id, duration_min')
        .in('production_id', prodIds)
        .eq('source', 'google')

      for (const r of (routesBefore || [])) {
        beforeMap[`${r.production_id}|${r.from_id}|${r.to_id}`] = r.duration_min
      }
    }

    console.log(
      `[cron/refresh-routes-traffic] baseline: ${Object.keys(beforeMap).length} rotte google precedenti`
    )

    // ── 3. Esegui refresh Google Routes ──────────────────────
    const result = await refreshRoutesForDate(supabase, todayISO)

    // ── 4. Snapshot durate DOPO il refresh ───────────────────
    let afterRoutes = []
    if (prodIds.length) {
      const { data: routesAfter } = await supabase
        .from('routes')
        .select('production_id, from_id, to_id, duration_min')
        .in('production_id', prodIds)
        .eq('source', 'google')

      afterRoutes = routesAfter || []
    }

    // ── 5. Rileva incrementi significativi per produzione ────
    //    Solo rotte usate oggi e con baseline precedente valida
    const heavyByProd = {}
    for (const r of afterRoutes) {
      const key    = `${r.production_id}|${r.from_id}|${r.to_id}`
      const before = beforeMap[key]
      if (!routeKeySet.has(key) || before == null) continue
      if (r.duration_min >= before + TRAFFIC_DELTA_MIN) {
        heavyByProd[r.production_id] = (heavyByProd[r.production_id] || 0) + 1
      }
    }

    // ── 6. Invia push alle produzioni con traffico anomalo ───
    const pushResults = []
    for (const [prodId, count] of Object.entries(heavyByProd)) {
      if (count < ALERT_ROUTE_THRESH) continue

      const pushRes = await sendPushToProduction(prodId, {
        title: '⚠️ Captain Dispatch — Traffico',
        body:  `Traffico su ${count} rotte — verifica Fleet Monitor`,
        url:   '/dashboard/fleet',
      })

      pushResults.push({ productionId: prodId, heavyRoutes: count, sent: pushRes.sent })
      console.log(
        `[cron/refresh-routes-traffic] 🚦 Traffico su ${count} rotte — produzione ${prodId.slice(0, 8)} — push: ${pushRes.sent}`
      )
    }

    return Response.json({ ...result, trafficAlerts: pushResults })
  } catch (err) {
    console.error('[cron/refresh-routes-traffic]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
