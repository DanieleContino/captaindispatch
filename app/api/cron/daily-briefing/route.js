/**
 * GET /api/cron/daily-briefing
 *
 * Vercel Cron — ogni giorno alle 07:00 UTC (08:00 CET)
 * Per ogni produzione con movimenti crew domani, invia push notification
 * a tutti i CAPTAIN e ADMIN della produzione.
 *
 * Messaggio: "🛬 X arrivi + 🛫 Y partenze domani"
 *
 * Autenticazione: Bearer CRON_SECRET (Vercel lo invia automaticamente).
 */

import { createClient }     from '@supabase/supabase-js'
import { sendPushToUser }   from '../../../../lib/webpush'

const CAPTAIN_ROLES = ['CAPTAIN', 'ADMIN']

function getTomorrowISO() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

export async function GET(request) {
  // ── Autenticazione Vercel Cron ────────────────────────────
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

  const tomorrow = getTomorrowISO()
  console.log(`[cron/daily-briefing] Avvio — domani: ${tomorrow}`)

  try {
    // ── 1. Carica crew in arrivo e in partenza domani (tutte le produzioni) ──
    const [{ data: arrivalsRaw, error: arrErr }, { data: departuresRaw, error: depErr }] =
      await Promise.all([
        supabase
          .from('crew')
          .select('id, full_name, department, production_id')
          .eq('arrival_date', tomorrow)
          .eq('hotel_status', 'CONFIRMED'),
        supabase
          .from('crew')
          .select('id, full_name, department, production_id')
          .eq('departure_date', tomorrow)
          .eq('hotel_status', 'CONFIRMED'),
      ])

    if (arrErr)  console.error('[cron/daily-briefing] arrivals query:', arrErr.message)
    if (depErr)  console.error('[cron/daily-briefing] departures query:', depErr.message)

    const arrivals   = arrivalsRaw   || []
    const departures = departuresRaw || []

    // ── 2. Raggruppa per produzione ───────────────────────────
    const byProd = {}
    for (const c of arrivals) {
      if (!byProd[c.production_id]) byProd[c.production_id] = { arrivals: [], departures: [] }
      byProd[c.production_id].arrivals.push(c)
    }
    for (const c of departures) {
      if (!byProd[c.production_id]) byProd[c.production_id] = { arrivals: [], departures: [] }
      byProd[c.production_id].departures.push(c)
    }

    const productionIds = Object.keys(byProd)
    if (!productionIds.length) {
      console.log('[cron/daily-briefing] Nessun movimento crew domani — nessun push inviato')
      return Response.json({ message: 'Nessun movimento crew domani', sent: 0, date: tomorrow })
    }

    // ── 3. Carica CAPTAIN + ADMIN per le produzioni interessate ──
    const { data: roles, error: rolesErr } = await supabase
      .from('user_roles')
      .select('user_id, production_id')
      .in('production_id', productionIds)
      .in('role', CAPTAIN_ROLES)

    if (rolesErr) {
      console.error('[cron/daily-briefing] roles query:', rolesErr.message)
      return Response.json({ error: rolesErr.message }, { status: 500 })
    }

    if (!roles?.length) {
      console.log('[cron/daily-briefing] Nessun CAPTAIN/ADMIN trovato — nessun push inviato')
      return Response.json({ message: 'Nessun CAPTAIN/ADMIN', sent: 0, date: tomorrow })
    }

    // ── 4. Raggruppa user_ids per produzione (dedup) ──────────
    const usersByProd = {}
    for (const r of roles) {
      if (!usersByProd[r.production_id]) usersByProd[r.production_id] = []
      if (!usersByProd[r.production_id].includes(r.user_id)) {
        usersByProd[r.production_id].push(r.user_id)
      }
    }

    // ── 5. Invia push per ogni produzione con movimenti ───────
    let totalSent = 0
    const results = []

    for (const prodId of productionIds) {
      const { arrivals: arr, departures: dep } = byProd[prodId]
      const userIds = usersByProd[prodId] || []
      if (!userIds.length) continue

      // Costruisci testo notifica
      const parts = []
      if (arr.length > 0) parts.push(`🛬 ${arr.length} ${arr.length === 1 ? 'arrivo' : 'arrivi'}`)
      if (dep.length > 0) parts.push(`🛫 ${dep.length} ${dep.length === 1 ? 'partenza' : 'partenze'}`)
      const body = parts.join(' + ') + ' domani'

      // Invia a ogni CAPTAIN/ADMIN singolarmente
      let prodSent = 0
      for (const userId of userIds) {
        const res = await sendPushToUser(userId, {
          title: '🎬 Captain Dispatch — Briefing',
          body,
          url:   '/dashboard',
        })
        prodSent  += res.sent
        totalSent += res.sent
      }

      results.push({
        productionId: prodId,
        arrivals:     arr.length,
        departures:   dep.length,
        notified:     userIds.length,
        pushSent:     prodSent,
      })

      console.log(`[cron/daily-briefing] ${prodId.slice(0, 8)}: ${body} → ${userIds.length} utenti (${prodSent} push)`)
    }

    return Response.json({
      date:        tomorrow,
      productions: results,
      totalSent,
    })
  } catch (err) {
    console.error('[cron/daily-briefing] Eccezione:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
