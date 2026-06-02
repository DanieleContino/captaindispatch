/**
 * lib/tripWarnings.js
 * Computes date discrepancy warnings between travel_movements and crew_stays.
 * Returns a map: { [crew_id (UUID)]: [ { type, message } ] }
 *
 * crew_id in both travel_movements and crew_stays is a UUID pointing to crew.uuid
 * (post UUID migration — crew has no `id` column, only `uuid` and `display_id`)
 *
 * Rules:
 * - IN_BEFORE_CHECKIN: flight IN date < stay arrival_date (gap > 0 days)
 * - OUT_AFTER_CHECKOUT: flight OUT date > stay departure_date (gap > 0 days)
 * No blame assigned — warnings are neutral discrepancy signals.
 */

export function computeCrewWarnings(movements, stays) {
  const warningsMap = {}

  function addWarning(crewUuid, type, message) {
    if (!crewUuid) return
    if (!warningsMap[crewUuid]) warningsMap[crewUuid] = []
    warningsMap[crewUuid].push({ type, message })
  }

  const staysByCrew = {}
  for (const s of stays || []) {
    if (!s.crew_id) continue
    if (!staysByCrew[s.crew_id]) staysByCrew[s.crew_id] = []
    staysByCrew[s.crew_id].push(s)
  }

  for (const m of movements || []) {
    if (!m.crew_id) continue
    const crewStays = staysByCrew[m.crew_id] || []
    if (crewStays.length === 0) continue

    if (m.direction === 'IN') {
      const relevantStay = crewStays
        .filter(s => s.arrival_date)
        .sort((a, b) => {
          const da = Math.abs(new Date(a.arrival_date) - new Date(m.travel_date))
          const db = Math.abs(new Date(b.arrival_date) - new Date(m.travel_date))
          return da - db
        })[0]
      if (!relevantStay) continue
      const gapDays = Math.round(
        (new Date(relevantStay.arrival_date) - new Date(m.travel_date)) / 86400000
      )
      if (gapDays > 0) {
        addWarning(m.crew_id, 'IN_BEFORE_CHECKIN',
          `Volo IN il ${m.travel_date} — hotel check-in ${relevantStay.arrival_date}. Gap di ${gapDays} nott${gapDays === 1 ? 'e' : 'i'}: verifica date volo o hotel.`
        )
      }
    }

    if (m.direction === 'OUT') {
      const relevantStay = crewStays
        .filter(s => s.departure_date)
        .sort((a, b) => {
          const da = Math.abs(new Date(a.departure_date) - new Date(m.travel_date))
          const db = Math.abs(new Date(b.departure_date) - new Date(m.travel_date))
          return da - db
        })[0]
      if (!relevantStay) continue
      const gapDays = Math.round(
        (new Date(m.travel_date) - new Date(relevantStay.departure_date)) / 86400000
      )
      if (gapDays > 0) {
        addWarning(m.crew_id, 'OUT_AFTER_CHECKOUT',
          `Volo OUT il ${m.travel_date} — hotel check-out ${relevantStay.departure_date}. Gap di ${gapDays} nott${gapDays === 1 ? 'e' : 'i'}: verifica date volo o hotel.`
        )
      }
    }
  }

  return warningsMap
}
