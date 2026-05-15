/**
 * GET /api/crew-notes/linked?type=movement&id=UUID
 * GET /api/crew-notes/linked?type=stay&id=UUID
 *
 * Returns minimal display data for a linked travel_movement or crew_stay.
 * Used by LinkedChip in lib/NotesPanel.js.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function makeSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()             { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id   = searchParams.get('id')

  if (!type || !id) {
    return NextResponse.json({ error: 'type and id required' }, { status: 400 })
  }

  const supabase = await makeSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (type === 'movement') {
    const { data, error } = await supabase
      .from('travel_movements')
      .select('id,direction,travel_type,travel_number,from_location,from_time,to_location,to_time,travel_date')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ error: 'Not found' },  { status: 404 })
    return NextResponse.json({ data })
  }

  if (type === 'stay') {
    const { data, error } = await supabase
      .from('crew_stays')
      .select('id,hotel_id,arrival_date,departure_date')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ error: 'Not found' },  { status: 404 })

    // Risolve il nome hotel dalla tabella locations
    let hotel_name = data.hotel_id
    if (data.hotel_id) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', data.hotel_id)
        .maybeSingle()
      if (loc?.name) hotel_name = loc.name
    }

    return NextResponse.json({ data: { ...data, hotel_name } })
  }

  return NextResponse.json({ error: 'type must be movement or stay' }, { status: 400 })
}
