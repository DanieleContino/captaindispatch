/**
 * lib/transferClass.js
 *
 * Logica Transfer_Class — equivalente di getTransferClass_() in 00_Config.gs
 *
 * Regola: pickup HUB + dropoff NON-hub = ARRIVAL
 *         pickup NON-hub + dropoff HUB  = DEPARTURE
 *         tutti gli altri               = STANDARD
 *
 * La stessa regola è anche espressa come colonna GENERATED ALWAYS AS in Supabase,
 * ma questa utility permette di calcolarla lato client prima dell'INSERT.
 *
 * Zero dipendenze — usabile sia lato client che server.
 */

const HUB_PREFIX = /^(APT_|STN_|PRT_)/

/**
 * Restituisce true se l'ID è un hub (aeroporto, stazione, porto)
 * @param {string|null|undefined} id
 * @returns {boolean}
 */
export function isHubId(id) {
  return HUB_PREFIX.test(id || '')
}

/**
 * Calcola il Transfer_Class da pickup e dropoff ID
 * @param {string|null} pickupId
 * @param {string|null} dropoffId
 * @returns {'ARRIVAL'|'DEPARTURE'|'STANDARD'}
 */
export function getTransferClass(pickupId, dropoffId) {
  const pHub = isHubId(pickupId)
  const dHub = isHubId(dropoffId)
  if (pHub && !dHub) return 'ARRIVAL'
  if (!pHub && dHub) return 'DEPARTURE'
  return 'STANDARD'
}
