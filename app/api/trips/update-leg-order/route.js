/**
 * POST /api/trips/update-leg-order
 *
 * Aggiorna leg_order di un singolo trip row.
 * Chiamato da WaypointReviewModal dopo conferma ordine ottimizzato.
 *
 * Body:   { trip_id: uuid, leg_order: integer, production_id: uuid }
 * Returns: { ok: true }
 */

import { NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { trip_id, leg_order, production_id } = await request.json()
    if (!trip_id || leg_order === undefined || !production_id) {
      return NextResponse.json({ error: 'trip_id, leg_order, production_id required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const { error } = await supabase
      .from('trips')
      .update({ leg_order })
      .eq('id', trip_id)
      .eq('production_id', production_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[update-leg-order]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
