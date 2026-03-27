import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ predictions: [] })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', q)
  url.searchParams.set('key', key)
  url.searchParams.set('language', 'it')

  try {
    const res  = await fetch(url.toString())
    const data = await res.json()
    const predictions = (data.predictions || []).map(p => ({
      place_id:    p.place_id,
      description: p.description,
      main_text:   p.structured_formatting?.main_text || p.description,
      secondary_text: p.structured_formatting?.secondary_text || '',
    }))
    return NextResponse.json({ predictions })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
