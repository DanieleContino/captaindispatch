/**
 * lib/routeDuration.js
 *
 * Lookup durata rotta (minuti) tra due location.
 * Equivalente di TS_getRouteDurationMin_() in 03_Routes.gs
 *
 * Strategia:
 *  1. Cerca nella tabella `routes` (production_id + from_id + to_id)
 *  2. ORS real-road (se ORS_API_KEY impostato + coordinate disponibili)
 *     → salva il risultato in `routes` per caching
 *  3. Haversine fallback con fattori di correzione
 *     (non salva in routes per evitare di sporcare con stime approssimative)
 *
 * Fattori correzione Haversine:
 *  - Uno dei due è hub (APT_/STN_/PRT_): 1.8  (strade lunghe, autostrade)
 *  - Entrambi hotel:                       1.4  (percorsi urbani)
 *  - Default:                              1.6
 *  Velocità media: 30 km/h · arrotonda ai 5 min · minimo 5 min.
 *
 * ORS variabile d'ambiente:
 *  ORS_API_KEY → chiave OpenRouteService (https://openrouteservice.org/dev/#/signup)
 *               Se assente, usa solo Haversine.
 *
 * @requires lib/haversine.js
 */

import { haversineKm } from './haversine.js'

const ORS_KEY = process.env.ORS_API_KEY
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'
const PAD     = 1.25   // +25% traffico applicato ai tempi ORS

/**
 * Restituisce la durata in minuti tra due location.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} fromId        - location ID di partenza (es. "APT_PMO")
 * @param {string} toId          - location ID di arrivo  (es. "H002")
 * @param {string} productionId  - UUID della produzione (per il lookup routes)
 * @returns {Promise<number|null>} durata in minuti, null se non calcolabile
 */
export async function getRouteDuration(supabase, fromId, toId, productionId) {
  // ── 1. Lookup tabella routes ──────────────────────────────
  if (productionId) {
    const { data: route } = await supabase
      .from('routes')
      .select('duration_min')
      .eq('production_id', productionId)
      .eq('from_id', fromId)
      .eq('to_id', toId)
      .maybeSingle()

    if (route?.duration_min) return route.duration_min
  }

  // ── 2. Carica coordinate (servono per ORS e Haversine) ───
  const [fromR, toR] = await Promise.all([
    supabase.from('locations').select('lat,lng,is_hub').eq('id', fromId).maybeSingle(),
    supabase.from('locations').select('lat,lng,is_hub').eq('id', toId).maybeSingle(),
  ])

  const from = fromR.data
  const to   = toR.data

  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null

  const lat1 = parseFloat(from.lat)
  const lng1 = parseFloat(from.lng)
  const lat2 = parseFloat(to.lat)
  const lng2 = parseFloat(to.lng)

  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return null

  // ── 2b. ORS real-road (se chiave disponibile) ────────────
  if (ORS_KEY) {
    try {
      const orsRes = await fetch(ORS_URL, {
        method: 'POST',
        headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: [[lng1, lat1], [lng2, lat2]],
          units: 'km',
        }),
        signal: AbortSignal.timeout(5000),
      })

      if (orsRes.ok) {
        const orsData = await orsRes.json()
        const seg = orsData?.routes?.[0]?.summary
        if (seg?.duration) {
          const duration_min  = Math.ceil(seg.duration / 60 * PAD)
          const distance_km   = Math.round(seg.distance * 10) / 10

          // Salva in cache routes (upsert)
          if (productionId) {
            await supabase.from('routes').upsert(
              { production_id: productionId, from_id: fromId, to_id: toId, duration_min, distance_km, source: 'ors' },
              { onConflict: 'production_id,from_id,to_id' }
            )
          }

          return duration_min
        }
      }
    } catch (orsErr) {
      console.warn(`[routeDuration] ORS fallito (${fromId}→${toId}):`, orsErr.message)
    }
  }

  // ── 3. Haversine fallback ─────────────────────────────────
  const km = haversineKm(lat1, lng1, lat2, lng2)

  // Fattore correzione: hub → 1.8, hotel→hotel → 1.4, default → 1.6
  let factor
  if (from.is_hub || to.is_hub) {
    factor = 1.8
  } else if (!from.is_hub && !to.is_hub) {
    factor = 1.4
  } else {
    factor = 1.6
  }

  // Velocità 30 km/h, arrotonda ai 5 min, minimo 5 min
  const rawMin = (km * factor / 30) * 60
  return Math.max(5, Math.round(rawMin / 5) * 5)
}
