/**
 * lib/routeDuration.js
 *
 * Lookup durata rotta (minuti) tra due location.
 * Equivalente di TS_getRouteDurationMin_() in 03_Routes.gs
 *
 * Strategia:
 *  1. Cerca nella tabella `routes` (production_id + from_id + to_id)
 *  2. Google Routes API (se GOOGLE_MAPS_API_KEY impostato + coordinate disponibili)
 *     → durata REALE con traffico (routingPreference: TRAFFIC_AWARE_OPTIMAL)
 *     → salva il risultato in `routes` per caching (source='google')
 *  3. Haversine fallback con fattori di correzione
 *     (non salva in routes — evita di sporcare con stime approssimative)
 *
 * Fattori correzione Haversine:
 *  - Uno dei due è hub (APT_/STN_/PRT_): 1.8  (strade lunghe, autostrade)
 *  - Entrambi hotel:                       1.4  (percorsi urbani)
 *  - Default:                              1.6
 *  Velocità media: 30 km/h · arrotonda ai 5 min · minimo 5 min.
 *
 * Google Routes API (https://developers.google.com/maps/documentation/routes):
 *  GOOGLE_MAPS_API_KEY → chiave Google Cloud Console (Routes API abilitata)
 *                        Server-side only — NON usare NEXT_PUBLIC_
 *                        Se assente, usa solo Haversine.
 *
 * @requires lib/haversine.js
 */

import { haversineKm } from './haversine.js'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUND_TO   = 5   // arrotonda ai 5 minuti (coerente con Apps Script)
const MIN_MIN    = 5   // durata minima in minuti

/**
 * Restituisce la durata in minuti tra due location.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} fromId        - location ID di partenza (es. "APT_PMO")
 * @param {string} toId          - location ID di arrivo  (es. "H002")
 * @param {string} [productionId]  - UUID della produzione (per il lookup routes)
 * @returns {Promise<number|null>} durata in minuti, null se non calcolabile
 */
export async function getRouteDuration(supabase, fromId, toId, productionId) {
  // ── 1. Lookup tabella routes (cache) ──────────────────────
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

  // ── 2. Carica coordinate (serve per Google Routes e Haversine) ─
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

  // ── 2b. Google Routes API (se chiave disponibile) ─────────
  if (GOOGLE_KEY) {
    try {
      const googleRes = await fetch(GOOGLE_URL, {
        method: 'POST',
        headers: {
          'X-Goog-Api-Key':   GOOGLE_KEY,
          // FieldMask obbligatorio con Routes API v2
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
          'Content-Type':     'application/json',
        },
        body: JSON.stringify({
          origin: {
            location: { latLng: { latitude: lat1, longitude: lng1 } },
          },
          destination: {
            location: { latLng: { latitude: lat2, longitude: lng2 } },
          },
          travelMode:               'DRIVE',
          routingPreference:        'TRAFFIC_AWARE_OPTIMAL', // traffico reale incluso
          computeAlternativeRoutes: false,
          languageCode:             'it-IT',
          units:                    'METRIC',
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (googleRes.ok) {
        const googleData = await googleRes.json()
        const route = googleData?.routes?.[0]

        if (route?.duration) {
          // duration è una stringa tipo "1234s" (secondi)
          const durationSec  = parseInt(route.duration.replace('s', ''), 10)
          const distanceM    = route.distanceMeters || 0

          if (isFinite(durationSec) && durationSec > 0) {
            const rawMin       = durationSec / 60
            const duration_min = Math.max(MIN_MIN, Math.round(rawMin / ROUND_TO) * ROUND_TO)
            const distance_km  = Math.round(distanceM / 100) / 10

            // Salva in cache routes (upsert, source='google')
            if (productionId) {
              await supabase.from('routes').upsert(
                {
                  production_id: productionId,
                  from_id:       fromId,
                  to_id:         toId,
                  duration_min,
                  distance_km,
                  source:        'google',
                },
                { onConflict: 'production_id,from_id,to_id' }
              )
            }

            return duration_min
          }
        }
      } else {
        const errText = await googleRes.text().catch(() => '')
        console.warn(
          `[routeDuration] Google Routes API HTTP ${googleRes.status} (${fromId}→${toId}):`,
          errText.slice(0, 200)
        )
      }
    } catch (googleErr) {
      console.warn(`[routeDuration] Google Routes API fallito (${fromId}→${toId}):`, googleErr.message)
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
  return Math.max(MIN_MIN, Math.round(rawMin / ROUND_TO) * ROUND_TO)
}
