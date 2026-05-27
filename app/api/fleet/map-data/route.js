import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const productionId = searchParams.get('pid')

  if (!productionId) {
    return NextResponse.json({ error: 'Missing pid parameter' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

  // Load active GPS sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('vehicle_tracking_sessions')
    .select('id,vehicle_id,driver_name,status,last_lat,last_lng,last_seen_at,ncc_driver_id')
    .eq('production_id', productionId)
    .neq('status', 'ENDED')
    .order('started_at', { ascending: false })

  // Load vehicles
  const { data: vehicles, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('id,sign_code,driver_name,ncc_driver_name,vehicle_type')
    .eq('production_id', productionId)
    .eq('active', true)
    .eq('in_transport', true)

  // Load today's trips (only vehicle_id and status needed)
  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('vehicle_id,status')
    .eq('production_id', productionId)
    .eq('date', today)

  if (sessionsError) console.error('[fleet/map-data] sessions error:', sessionsError)
  if (vehiclesError) console.error('[fleet/map-data] vehicles error:', vehiclesError)
  if (tripsError)   console.error('[fleet/map-data] trips error:', tripsError)

  return NextResponse.json({
    sessions: sessions || [],
    vehicles: vehicles || [],
    trips:    trips    || [],
  })
}
