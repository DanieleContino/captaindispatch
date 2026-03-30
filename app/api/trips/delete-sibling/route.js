/**
 * POST /api/trips/delete-sibling
 * Elimina un sibling trip (multi-stop leg) e i suoi passeggeri.
 *
 * Usa il service client per bypassare il problema RLS
 * dove la policy "own_production" FOR ALL non propagava
 * correttamente il DELETE lato client (silent 0 rows).
 *
 * Body: { tripId: string (uuid), productionId: string (uuid) }
 *
 * Sicurezza:
 * - Utente deve essere autenticato
 * - Il trip deve appartenere alla production dell'utente (verificato via user_roles)
 */

import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../lib/supabaseServer'

export async function POST(request) {
  try {
    const { tripId, productionId } = await request.json()
    if (!tripId || !productionId) {
      return Response.json({ error: 'tripId and productionId required' }, { status: 400 })
    }

    // 1. Verifica autenticazione utente
    const authClient = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verifica che l'utente abbia accesso alla produzione
    const { data: role } = await authClient
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('production_id', productionId)
      .maybeSingle()
    if (!role) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 3. Verifica che il trip appartenga alla produzione
    const { data: trip } = await authClient
      .from('trips')
      .select('id, production_id')
      .eq('id', tripId)
      .eq('production_id', productionId)
      .maybeSingle()
    if (!trip) {
      return Response.json({ error: 'Trip not found or access denied' }, { status: 404 })
    }

    // 4. Elimina via service client (bypassa RLS)
    const serviceClient = await createSupabaseServiceClient()

    // trip_passengers ha ON DELETE CASCADE su trips, ma lo eliminiamo esplicitamente
    await serviceClient
      .from('trip_passengers')
      .delete()
      .eq('trip_row_id', tripId)

    const { error: deleteError } = await serviceClient
      .from('trips')
      .delete()
      .eq('id', tripId)

    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (e) {
    console.error('[delete-sibling] Unexpected error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
