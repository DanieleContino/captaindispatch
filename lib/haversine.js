/**
 * lib/haversine.js
 *
 * Calcola la distanza in km tra due coordinate geografiche
 * usando la formula di Haversine.
 *
 * Zero dipendenze — usabile sia lato client che server.
 */

const R_KM = 6371 // raggio medio terrestre in km

/**
 * @param {number} lat1 - latitudine punto A (decimale)
 * @param {number} lng1 - longitudine punto A (decimale)
 * @param {number} lat2 - latitudine punto B (decimale)
 * @param {number} lng2 - longitudine punto B (decimale)
 * @returns {number} distanza in km (linea d'aria)
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R_KM * 2 * Math.asin(Math.sqrt(a))
}
