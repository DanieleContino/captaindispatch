/**
 * lib/production.js
 * Gestione dinamica della production attiva.
 * Le sub-page leggono ancora process.env ma il switcher aggiorna localStorage + reload.
 */

const ENV_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

/** Legge production_id: prima localStorage, poi env var */
export function getProductionId() {
  if (typeof window === 'undefined') return ENV_ID || ''
  return localStorage.getItem('captainProductionId') || ENV_ID || ''
}

/** Imposta la production attiva (client-side) + ricarica la pagina */
export function switchProduction(id) {
  if (typeof window === 'undefined') return
  if (id) {
    localStorage.setItem('captainProductionId', id)
  } else {
    localStorage.removeItem('captainProductionId')
  }
  window.location.href = '/dashboard'
}

/** Rimuove l'override → torna all'env var */
export function clearProductionOverride() {
  if (typeof window !== 'undefined') localStorage.removeItem('captainProductionId')
}
