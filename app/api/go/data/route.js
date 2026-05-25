import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const type  = searchParams.get('type')

  if (!token) return Response.json({ error: 'Token required' }, { status: 400 })

  // Risolvi token → production_id
  let productionId = null

  const { data: nccDriver } = await supabase
    .from('ncc_drivers')
    .select('production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    productionId = nccDriver.production_id
  } else {
    const { data: crewDriver } = await supabase
      .from('crew')
      .select('production_id')
      .eq('tracking_token', token)
      .single()
    if (crewDriver) productionId = crewDriver.production_id
  }

  if (!productionId) return Response.json({ error: 'Invalid token' }, { status: 404 })

  // Locations
  if (type === 'locations') {
    const { data } = await supabase
      .from('locations')
      .select('id, name, is_hub')
      .eq('production_id', productionId)
      .order('name')
    return Response.json({ data: data || [] })
  }

  // Crew
  if (type === 'crew') {
    const { data } = await supabase
      .from('crew')
      .select('id, full_name, department, hotel_id')
      .eq('production_id', productionId)
      .eq('hotel_status', 'CONFIRMED')
      .order('full_name')
    return Response.json({ data: data || [] })
  }

  return Response.json({ error: 'type must be locations or crew' }, { status: 400 })
}
