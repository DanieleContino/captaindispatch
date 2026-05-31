import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { token, trip_id } = await request.json()

  if (!token || !trip_id) return Response.json({ error: 'token and trip_id required' }, { status: 400 })

  // 1. Risolvi token → driver
  let driver = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('uuid, production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) driver = crewDriver
  }

  if (!driver) return Response.json({ error: 'Invalid token' }, { status: 404 })

  // 2. Verifica che il trip esista e sia BUSY
  const { data: tripRow } = await supabase
    .from('trips')
    .select('id, trip_id, status, picked_up_at')
    .eq('id', trip_id)
    .eq('production_id', driver.production_id)
    .single()

  if (!tripRow) return Response.json({ error: 'Trip not found' }, { status: 404 })
  if (tripRow.status !== 'BUSY') return Response.json({ error: 'Trip is not BUSY' }, { status: 400 })
  if (tripRow.picked_up_at) return Response.json({ error: 'Already picked up' }, { status: 400 })

  // 3. Salva picked_up_at
  const { error } = await supabase
    .from('trips')
    .update({ picked_up_at: new Date().toISOString() })
    .eq('id', trip_id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
