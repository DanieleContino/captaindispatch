/**
 * /api/import/save-location
 *
 * POST (application/json)
 *
 * Input:
 *   name         — nome della location (obbligatorio)
 *   lat          — latitudine (opzionale, da Google Places)
 *   lng          — longitudine (opzionale, da Google Places)
 *   locationType — 'HOTEL' | 'HUB' (default 'HOTEL')
 *   productionId — UUID produzione attiva (obbligatorio)
 *
 * Flusso:
 *   1. Auth check (user)
 *   2. Service client per bypassare RLS
 *   3. Calcola il prossimo ID H### in sequenza (max existing + 1)
 *   4. Insert in locations con is_hotel: true, is_hub: (locationType === 'HUB')
 *   5. Return: { id, name }
 *
 * Usato da HotelPlacesModal (S31-T4) per salvare hotel da Google Places.
 * is_hotel: true sempre (questa route è dedicata agli hotel da accommodation import).
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'

export async function POST(req) {
  try {
    // ── Auth check ───────────────────────────────────────────
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, lat, lng, locationType, productionId } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name è obbligatorio' }, { status: 400 })
    }
    if (!productionId) {
      return NextResponse.json({ error: 'productionId è obbligatorio' }, { status: 400 })
    }

    // ── Service client (bypassa RLS) ─────────────────────────
    const supabase = await createSupabaseServiceClient()

    // ── Calcola prossimo ID H### ─────────────────────────────
    const { data: existingLocs } = await supabase
      .from('locations')
      .select('id')
      .eq('production_id', productionId)
      .like('id', 'H%')

    let maxLocNum = 0
    for (const l of (existingLocs || [])) {
      const n = parseInt((l.id || '').replace(/^H/i, ''), 10)
      if (!isNaN(n) && n > maxLocNum) maxLocNum = n
    }
    maxLocNum++
    const autoLocId = `H${String(maxLocNum).padStart(3, '0')}`

    // ── Insert location ──────────────────────────────────────
    const insertPayload = {
      id:           autoLocId,
      name:         name.trim(),
      production_id: productionId,
      is_hub:       locationType === 'HUB',
      is_hotel:     true,
    }
    if (lat != null)  insertPayload.lat = lat
    if (lng != null)  insertPayload.lng = lng

    const { data: newLoc, error: insertErr } = await supabase
      .from('locations')
      .insert(insertPayload)
      .select('id, name')
      .single()

    if (insertErr) {
      console.error('[import/save-location] Insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    console.log(`[import/save-location] Salvata: ${newLoc.id} — "${newLoc.name}" (${locationType || 'HOTEL'})`)

    return NextResponse.json({ id: newLoc.id, name: newLoc.name })

  } catch (e) {
    console.error('[import/save-location]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
