import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const place_id = searchParams.get('place_id')?.trim()
  if (!place_id) return NextResponse.json({ error: 'place_id required' }, { status: 400 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', place_id)
  url.searchParams.set('fields', 'geometry,formatted_address,name')
  url.searchParams.set('key', key)
  url.searchParams.set('language', 'it')

  try {
    const res  = await fetch(url.toString())
    const data = await res.json()
    const result = data.result
    if (!result) return NextResponse.json({ error: 'Place not found' }, { status: 404 })

    return NextResponse.json({
      lat:     result.geometry?.location?.lat ?? null,
      lng:     result.geometry?.location?.lng ?? null,
      address: result.formatted_address || '',
      name:    result.name || '',
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
