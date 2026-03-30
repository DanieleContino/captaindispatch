/**
 * GET /api/productions/export?id=...
 * S26 — Export completo produzione in JSON
 *
 * Scarica un archivio JSON con:
 *   production + crew + vehicles + locations + routes + trips
 *   + trip_passengers + service_types + rocket_templates
 *
 * Solo CAPTAIN/ADMIN della produzione.
 * Nome file: captaindispatch-{slug}-{YYYY-MM-DD}.json
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const productionId = searchParams.get('id')
    if (!productionId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Verifica autenticazione
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verifica ruolo CAPTAIN/ADMIN
    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('production_id', productionId)
      .single()

    if (roleErr || !roleRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!['CAPTAIN', 'ADMIN'].includes(roleRow.role)) {
      return NextResponse.json({ error: 'Forbidden — CAPTAIN or ADMIN required' }, { status: 403 })
    }

    // Usa service client per lettura completa (bypassa RLS)
    const svc = await createSupabaseServiceClient()

    // ── 1. Production ──────────────────────────────────────────────────────────
    const { data: production, error: prodErr } = await svc
      .from('productions')
      .select('*')
      .eq('id', productionId)
      .single()

    if (prodErr || !production) {
      return NextResponse.json({ error: 'Production not found' }, { status: 404 })
    }

    // ── 2. Crew ────────────────────────────────────────────────────────────────
    const { data: crew } = await svc
      .from('crew')
      .select('*')
      .eq('production_id', productionId)
      .order('full_name')

    // ── 3. Vehicles ────────────────────────────────────────────────────────────
    const { data: vehicles } = await svc
      .from('vehicles')
      .select('*')
      .eq('production_id', productionId)
      .order('sign_code')

    // ── 4. Locations ───────────────────────────────────────────────────────────
    const { data: locations } = await svc
      .from('locations')
      .select('*')
      .eq('production_id', productionId)
      .order('name')

    // ── 5. Routes ──────────────────────────────────────────────────────────────
    const { data: routes } = await svc
      .from('routes')
      .select('*')
      .eq('production_id', productionId)

    // ── 6. Trips ───────────────────────────────────────────────────────────────
    const { data: trips } = await svc
      .from('trips')
      .select('*')
      .eq('production_id', productionId)
      .order('start_dt')

    // ── 7. Trip passengers ─────────────────────────────────────────────────────
    let trip_passengers = []
    if (trips && trips.length > 0) {
      const tripIds = trips.map(t => t.id)
      const { data: tp } = await svc
        .from('trip_passengers')
        .select('*')
        .in('trip_id', tripIds)
      trip_passengers = tp || []
    }

    // ── 8. Service types ───────────────────────────────────────────────────────
    const { data: service_types } = await svc
      .from('service_types')
      .select('*')
      .eq('production_id', productionId)
      .order('name')

    // ── 9. Rocket templates ────────────────────────────────────────────────────
    const { data: rocket_templates } = await svc
      .from('rocket_templates')
      .select('*')
      .eq('production_id', productionId)
      .order('created_at')

    // ── Assembla archivio ──────────────────────────────────────────────────────
    const exportDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const archive = {
      _meta: {
        version:     1,
        exported_at: new Date().toISOString(),
        exported_by: user.email || user.id,
        app:         'captaindispatch',
      },
      production,
      crew:             crew             || [],
      vehicles:         vehicles         || [],
      locations:        locations        || [],
      routes:           routes           || [],
      trips:            trips            || [],
      trip_passengers:  trip_passengers,
      service_types:    service_types    || [],
      rocket_templates: rocket_templates || [],
    }

    const slug     = production.slug || productionId
    const filename = `captaindispatch-${slug}-${exportDate}.json`
    const body     = JSON.stringify(archive, null, 2)

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      Buffer.byteLength(body).toString(),
      },
    })
  } catch (e) {
    console.error('[export] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
