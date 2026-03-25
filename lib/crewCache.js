/**
 * lib/crewCache.js
 *
 * Cache dei crew CONFIRMED con TTL 10 minuti + invalidazione via Supabase Realtime.
 * Equivalente di TS_getCrewCache_() in 01_Crew.gs
 *
 * Struttura cache:
 *   all:       crew[] (tutti i CONFIRMED)
 *   byHotel:   { hotelId → crew[] }
 *   byCrewId:  { crewId → crew }
 *
 * USO:
 *   import { getCrewCache, subscribeCrewCacheInvalidation } from '@/lib/crewCache'
 *
 *   // Nel componente:
 *   useEffect(() => subscribeCrewCacheInvalidation(supabase, PRODUCTION_ID), [])
 *   const cache = await getCrewCache(supabase, productionId)
 *   const hotelCrew = cache.byHotel['H002'] ?? []
 *
 * NOTA: la cache è module-level (singleton), quindi condivisa tra tutti i componenti
 * che importano questo modulo nella stessa sessione browser.
 */

const TTL_MS = 10 * 60_000   // 10 minuti, come in Apps Script CacheService

let _cache    = null
let _ts       = 0
let _channel  = null

// ─── Build struttura cache ────────────────────────────────────
function buildCache(data) {
  const byHotel  = {}
  const byCrewId = {}
  for (const c of data) {
    byCrewId[c.id] = c
    if (c.hotel_id) {
      if (!byHotel[c.hotel_id]) byHotel[c.hotel_id] = []
      byHotel[c.hotel_id].push(c)
    }
  }
  return { all: data, byHotel, byCrewId }
}

// ─── Invalida cache ───────────────────────────────────────────
export function invalidateCrewCache() {
  _cache = null
  _ts    = 0
}

// ─── Recupera (o costruisce) la cache ─────────────────────────
/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} productionId
 * @returns {Promise<{ all: object[], byHotel: object, byCrewId: object }>}
 */
export async function getCrewCache(supabase, productionId) {
  // Usa cache se ancora valida
  if (_cache && Date.now() - _ts < TTL_MS) return _cache

  const { data, error } = await supabase
    .from('crew')
    .select('id,full_name,department,hotel_id,hotel_status,travel_status,arrival_date,departure_date,notes')
    .eq('production_id', productionId)
    .eq('hotel_status', 'CONFIRMED')
    .order('department', { nullsLast: true })
    .order('full_name')

  if (error || !data) {
    // Ritorna cache precedente (stale) se disponibile, altrimenti vuota
    return _cache || { all: [], byHotel: {}, byCrewId: {} }
  }

  _cache = buildCache(data)
  _ts    = Date.now()
  return _cache
}

// ─── Subscription Realtime per invalidazione ──────────────────
/**
 * Installa il canale Realtime che invalida la cache a ogni modifica della tabella crew.
 * Chiama questa funzione UNA VOLTA al mount del componente principale.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} productionId
 * @returns {function} cleanup — usare come return di useEffect
 *
 * @example
 *   useEffect(() => subscribeCrewCacheInvalidation(supabase, PRODUCTION_ID), [])
 */
export function subscribeCrewCacheInvalidation(supabase, productionId) {
  if (_channel) {
    // Canale già attivo — nessuna duplicazione
    return () => {}
  }

  _channel = supabase
    .channel('crew-cache-inv')
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'crew',
        filter: `production_id=eq.${productionId}`,
      },
      () => { invalidateCrewCache() }
    )
    .subscribe()

  return () => {
    if (_channel) {
      supabase.removeChannel(_channel)
      _channel = null
    }
  }
}
