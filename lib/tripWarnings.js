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

function fmtEU(d) {
  if (!d) return '–'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

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
          `Volo IN il ${fmtEU(m.travel_date)} — hotel check-in ${fmtEU(relevantStay.arrival_date)}. Gap di ${gapDays} nott${gapDays === 1 ? 'e' : 'i'}: verifica date volo o hotel.`
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

  // ── MISSING_RETURN_FLIGHT / MISSING_ARRIVAL_FLIGHT ──────────────────────────
  // Per ogni crew che ha almeno uno stay, verifica se mancano movimenti IN o OUT
  for (const [crewUuid, crewStays] of Object.entries(staysByCrew)) {
    const crewMovements = (movements || []).filter(m => m.crew_id === crewUuid)
    const hasOUT = crewMovements.some(m => m.direction === 'OUT')
    const hasIN  = crewMovements.some(m => m.direction === 'IN')

    // MISSING_RETURN_FLIGHT: ha stay con departure_date ma nessun OUT
    if (!hasOUT) {
      const stayWithDep = crewStays.find(s => s.departure_date)
      if (stayWithDep) {
        addWarning(crewUuid, 'MISSING_RETURN_FLIGHT',
          `Nessun rientro registrato — check-out hotel il ${stayWithDep.departure_date}. Aggiungi volo/treno/OA di rientro o verifica la data di check-out.`
        )
      }
    }

    // MISSING_ARRIVAL_FLIGHT: ha stay con arrival_date ma nessun IN
    if (!hasIN) {
      const stayWithArr = crewStays.find(s => s.arrival_date)
      if (stayWithArr) {
        addWarning(crewUuid, 'MISSING_ARRIVAL_FLIGHT',
          `Nessun arrivo registrato — check-in hotel il ${stayWithArr.arrival_date}. Aggiungi volo/treno/OA di arrivo o verifica la data di check-in.`
        )
      }
    }
  }

  return warningsMap
}
