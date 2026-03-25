/**
 * lib/tripTimeCalculator.js
 *
 * Calcola Call / Pickup_Time / Start_DT / End_DT da un trip.
 * Equivalente di calculateTripTimesSingleRow_() in 02_Trips.gs
 *
 * LOGICA (dalla S4 — NON modificare senza aggiornare anche il Google Sheet):
 *
 *   ARRIVAL  (hub → hotel):
 *     Call        = Arr_Time            (volo atterrato → driver già all'hub)
 *     Pickup_Time = Call                (FIX S4: non Call-Duration!)
 *     Start_DT    = Date + Pickup_Time
 *     End_DT      = Start_DT + Duration_Min
 *
 *   DEPARTURE (hotel → hub):
 *     Call        = Arr_Time - 120 min  (CHECKIN_BUFFER)
 *     Pickup_Time = Call - Duration_Min
 *     Start_DT    = Date + Pickup_Time
 *     End_DT      = Start_DT + Duration_Min
 *
 *   STANDARD  (hotel → set, ecc.):
 *     Call        = callMin (inserito manualmente — NON toccare)
 *     Pickup_Time = Call - Duration_Min
 *     Start_DT    = Date + Pickup_Time
 *     End_DT      = Start_DT + Duration_Min
 *
 * Zero dipendenze esterne — usabile sia lato client che server.
 */

const CHECKIN_BUFFER_MIN = 120

/**
 * Calcola i tempi di un trip.
 *
 * @param {object} params
 * @param {string}      params.date          - data ISO "YYYY-MM-DD"
 * @param {number|null} params.arrTimeMin    - orario volo/arrivo hub (minuti da mezzanotte), null se assente
 * @param {number|null} params.durationMin   - durata tratta in minuti
 * @param {'ARRIVAL'|'DEPARTURE'|'STANDARD'} params.transferClass
 * @param {number|null} params.callMin       - call manuale (solo STANDARD)
 *
 * @returns {{ callMin: number, pickupMin: number, startDt: string, endDt: string }|null}
 *   null se mancano dati sufficienti per il calcolo
 */
export function calculateTripTimes({ date, arrTimeMin, durationMin, transferClass, callMin }) {
  if (!date || !durationMin) return null

  // ── Calcola Call ──────────────────────────────────────────
  let computedCall = null

  if (transferClass === 'ARRIVAL') {
    if (arrTimeMin === null || arrTimeMin === undefined) return null
    computedCall = arrTimeMin
  } else if (transferClass === 'DEPARTURE') {
    if (arrTimeMin === null || arrTimeMin === undefined) return null
    // Sottrae il buffer, gestisce mezzanotte
    computedCall = ((arrTimeMin - CHECKIN_BUFFER_MIN) % 1440 + 1440) % 1440
  } else {
    // STANDARD: Call è manuale — se non c'è, non possiamo calcolare
    if (callMin === null || callMin === undefined) return null
    computedCall = callMin
  }

  // ── Calcola Pickup ────────────────────────────────────────
  // ARRIVAL: driver già all'hub → pickup = call (non si sposta da altrove)
  // DEPARTURE / STANDARD: parte dall'hotel prima → pickup = call - duration
  const pickupMin =
    transferClass === 'ARRIVAL'
      ? computedCall
      : ((computedCall - durationMin) % 1440 + 1440) % 1440

  // ── Costruisce timestamp ─────────────────────────────────
  const [y, mo, dd] = date.split('-').map(Number)
  // Usa Date locale (browser/Node timezone) — coerente con come vengono inseriti i tempi
  const startMs = new Date(y, mo - 1, dd, Math.floor(pickupMin / 60), pickupMin % 60, 0, 0).getTime()
  const endMs   = startMs + durationMin * 60_000

  return {
    callMin:   computedCall,
    pickupMin,
    startDt:   new Date(startMs).toISOString(),
    endDt:     new Date(endMs).toISOString(),
  }
}
