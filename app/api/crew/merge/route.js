/**
 * POST /api/crew/merge
 *
 * Merges duplicate crew records into a single primary record.
 * Reassigns all references in: trip_passengers, travel_movements, crew_stays.
 * Updates the primary crew record with the chosen field values.
 * Deletes the duplicate crew records.
 *
 * Body: {
 *   production_id: string,
 *   primary_id:    string,       -- crew.id to keep
 *   duplicate_ids: string[],     -- crew.id(s) to merge and delete
 *   merged_data:   object        -- field values to write to primary
 * }
 *
 * Response: { ok: true, merged_count: number }
 */

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()

    // ── Auth check ──────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { production_id, primary_id, duplicate_ids, merged_data } = body

    if (!production_id || !primary_id || !Array.isArray(duplicate_ids) || duplicate_ids.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Role check: CAPTAIN or ADMIN only ───────────────
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('production_id', production_id)
      .single()

    if (!roleData || !['CAPTAIN', 'ADMIN'].includes(roleData.role)) {
      return NextResponse.json({ error: 'Forbidden: CAPTAIN or ADMIN role required' }, { status: 403 })
    }

    // ── Validate all crew IDs belong to this production ─
    const allIds = [primary_id, ...duplicate_ids]
    const { data: crewCheck } = await supabase
      .from('crew')
      .select('id')
      .in('id', allIds)
      .eq('production_id', production_id)

    if (!crewCheck || crewCheck.length !== allIds.length) {
      return NextResponse.json({ error: 'One or more crew IDs not found in this production' }, { status: 400 })
    }

    // Use service client for cross-table operations (bypasses RLS)
    const service = await createSupabaseServiceClient()

    // ── 1. trip_passengers ──────────────────────────────
    // Handle UNIQUE constraint (trip_row_id, crew_id):
    // if primary is already in a trip → delete duplicate's row (avoid conflict)
    // if primary is NOT in a trip    → update duplicate's row to primary_id
    for (const dupId of duplicate_ids) {
      const { data: dupTrips } = await service
        .from('trip_passengers')
        .select('id, trip_row_id')
        .eq('crew_id', dupId)

      if (!dupTrips || dupTrips.length === 0) continue

      const tripRowIds = dupTrips.map(t => t.trip_row_id)

      const { data: primaryTrips } = await service
        .from('trip_passengers')
        .select('trip_row_id')
        .eq('crew_id', primary_id)
        .in('trip_row_id', tripRowIds)

      const primarySet = new Set((primaryTrips || []).map(t => t.trip_row_id))

      const toDelete = dupTrips.filter(t =>  primarySet.has(t.trip_row_id)).map(t => t.id)
      const toUpdate = dupTrips.filter(t => !primarySet.has(t.trip_row_id)).map(t => t.id)

      if (toDelete.length > 0) {
        await service.from('trip_passengers').delete().in('id', toDelete)
      }
      if (toUpdate.length > 0) {
        await service.from('trip_passengers').update({ crew_id: primary_id }).in('id', toUpdate)
      }
    }

    // ── 2. travel_movements ────────────────────────────
    await service
      .from('travel_movements')
      .update({ crew_id: primary_id })
      .in('crew_id', duplicate_ids)

    // ── 3. crew_stays ──────────────────────────────────
    await service
      .from('crew_stays')
      .update({ crew_id: primary_id })
      .in('crew_id', duplicate_ids)

    // ── 4. Update primary crew with merged field values ─
    const ALLOWED_FIELDS = [
      'full_name', 'department', 'hotel_id', 'hotel_status',
      'travel_status', 'arrival_date', 'departure_date',
      'email', 'phone', 'notes',
    ]
    const updatePayload = {}
    for (const field of ALLOWED_FIELDS) {
      if (merged_data && field in merged_data) {
        updatePayload[field] = merged_data[field] || null
      }
    }
    if (Object.keys(updatePayload).length > 0) {
      await service.from('crew').update(updatePayload).eq('id', primary_id)
    }

    // ── 5. Delete duplicate crew records ───────────────
    const { error: deleteErr } = await service
      .from('crew')
      .delete()
      .in('id', duplicate_ids)
      .eq('production_id', production_id)

    if (deleteErr) {
      console.error('[crew/merge] delete error:', deleteErr)
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    console.log(`[crew/merge] Merged [${duplicate_ids.join(', ')}] → ${primary_id}`)
    return NextResponse.json({ ok: true, merged_count: duplicate_ids.length })

  } catch (e) {
    console.error('[crew/merge]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
