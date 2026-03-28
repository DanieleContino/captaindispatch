/**
 * /api/import/confirm
 *
 * POST (application/json)
 *
 * Input:
 *   rows         — array di righe con action: 'insert' | 'update' | 'skip'
 *   mode         — 'fleet' | 'crew' | 'custom'
 *   productionId — UUID produzione attiva
 *   newLocations — array { name } di hotel nuovi da inserire in locations prima del crew
 *
 * Flusso:
 *   1. (crew) Inserisce prima i newLocations in tabella locations
 *   2. Fleet: batch insert veicoli nuovi + update esistenti
 *   3. Crew: genera IDs CR#### sequenziali per insert, poi batch insert + update
 *   4. Return: { inserted, updated, skipped, errors }
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

// ── POST handler ─────────────────────────────────────────────

export async function POST(req) {
  try {
    // Auth check
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { rows, mode, productionId, newLocations = [] } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows è obbligatorio e deve essere un array' }, { status: 400 })
    }
    if (!mode) return NextResponse.json({ error: 'mode è obbligatorio' }, { status: 400 })
    if (!productionId) return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors = []

    // ── STEP 1: Inserisci nuove locations (hotel) ───────────
    // Mappa nome hotel (lowercase) → id location appena creata
    const newLocationMap = {}

    if (newLocations.length > 0) {
      for (const loc of newLocations) {
        if (!loc.name?.trim()) continue

        const { data: newLoc, error: locErr } = await supabase
          .from('locations')
          .insert({
            name: loc.name.trim(),
            production_id: productionId,
            is_hub: false,
          })
          .select('id, name')
          .single()

        if (locErr) {
          errors.push(`Errore creazione location "${loc.name}": ${locErr.message}`)
        } else if (newLoc) {
          newLocationMap[loc.name.trim().toLowerCase()] = newLoc.id
        }
      }
    }

    // Suddividi le righe per action
    const insertRows = rows.filter(r => r.action === 'insert')
    const updateRows = rows.filter(r => r.action === 'update')
    const skipRows  = rows.filter(r => r.action === 'skip')
    skipped = skipRows.length

    // ── STEP 2: FLEET ───────────────────────────────────────
    if (mode === 'fleet') {
      // INSERT batch
      if (insertRows.length > 0) {
        const toInsert = insertRows.map(r => ({
          production_id: productionId,
          driver_name:   r.driver_name   ?? null,
          vehicle_type:  r.vehicle_type  || 'VAN',
          license_plate: r.license_plate ?? null,
          capacity:      r.capacity      ?? null,
          pax_suggested: r.pax_suggested ?? null,
          sign_code:     r.sign_code     ?? null,
          active: true,
        }))

        const { data: insertedData, error: insertErr } = await supabase
          .from('vehicles')
          .insert(toInsert)
          .select('id')

        if (insertErr) {
          errors.push(`Errore insert veicoli: ${insertErr.message}`)
        } else {
          inserted += insertedData?.length || 0
        }
      }

      // UPDATE uno per uno (ogni veicolo ha il proprio existingId)
      for (const r of updateRows) {
        if (!r.existingId) {
          skipped++
          continue
        }

        const { error: updateErr } = await supabase
          .from('vehicles')
          .update({
            driver_name:   r.driver_name   ?? null,
            vehicle_type:  r.vehicle_type  || 'VAN',
            license_plate: r.license_plate ?? null,
            capacity:      r.capacity      ?? null,
            pax_suggested: r.pax_suggested ?? null,
            sign_code:     r.sign_code     ?? null,
          })
          .eq('id', r.existingId)
          .eq('production_id', productionId)

        if (updateErr) {
          errors.push(`Errore update veicolo ${r.existingId}: ${updateErr.message}`)
        } else {
          updated++
        }
      }
    }

    // ── STEP 3: CREW ────────────────────────────────────────
    if (mode === 'crew') {
      // Determina il numero più alto di CR#### già presenti per questa produzione
      const { data: existingCrew } = await supabase
        .from('crew')
        .select('id')
        .eq('production_id', productionId)
        .like('id', 'CR%')
        .order('id', { ascending: false })

      let maxNum = 0
      for (const c of (existingCrew || [])) {
        const num = parseInt(c.id.replace(/^CR/i, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }

      // INSERT batch — genera IDs progressivi CR####
      if (insertRows.length > 0) {
        const toInsert = insertRows.map(r => {
          maxNum++

          // Risolvi hotel_id: da match esistente oppure da nuova location appena inserita
          let hotel_id = r.hotel_id || null
          if (!hotel_id && r.hotel) {
            hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
          }

          return {
            id:             `CR${String(maxNum).padStart(4, '0')}`,
            production_id:  productionId,
            full_name:      r.full_name,
            department:     r.department     || 'OTHER',
            hotel_id:       hotel_id,
            arrival_date:   r.arrival_date   || null,
            departure_date: r.departure_date || null,
            travel_status:  'PRESENT',
          }
        })

        const { data: insertedData, error: insertErr } = await supabase
          .from('crew')
          .insert(toInsert)
          .select('id')

        if (insertErr) {
          errors.push(`Errore insert crew: ${insertErr.message}`)
        } else {
          inserted += insertedData?.length || 0
        }
      }

      // UPDATE uno per uno
      for (const r of updateRows) {
        if (!r.existingId) {
          skipped++
          continue
        }

        // Risolvi hotel_id
        let hotel_id = r.hotel_id || null
        if (!hotel_id && r.hotel) {
          hotel_id = newLocationMap[r.hotel.trim().toLowerCase()] || null
        }

        // Aggiorna solo i campi che hanno valore — non sovrascrivere hotel se non rilevato
        const updateFields = {}
        if (r.department)     updateFields.department     = r.department
        if (r.arrival_date)   updateFields.arrival_date   = r.arrival_date
        if (r.departure_date) updateFields.departure_date = r.departure_date
        if (hotel_id)         updateFields.hotel_id       = hotel_id

        if (Object.keys(updateFields).length === 0) {
          // Nulla da aggiornare — conta come skip
          skipped++
          continue
        }

        const { error: updateErr } = await supabase
          .from('crew')
          .update(updateFields)
          .eq('id', r.existingId)
          .eq('production_id', productionId)

        if (updateErr) {
          errors.push(`Errore update crew ${r.existingId}: ${updateErr.message}`)
        } else {
          updated++
        }
      }
    }

    return NextResponse.json({ inserted, updated, skipped, errors })

  } catch (e) {
    console.error('[import/confirm]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
