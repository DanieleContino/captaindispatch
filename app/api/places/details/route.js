import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const place_id = searchParams.get('place_id')?.trim()
  if (!place_id) return NextResponse.json({ error: 'place_id required' }, { status: 400 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', place_id)
  url.searchParams.set('fields', 'geometry,formatted_address,name,address_components,website,international_phone_number,formatted_phone_number')
  url.searchParams.set('key', key)
  url.searchParams.set('language', 'it')

  try {
    const res  = await fetch(url.toString())
    const data = await res.json()
    const result = data.result
    if (!result) return NextResponse.json({ error: 'Place not found' }, { status: 404 })

    // ── Parse address_components ──────────────────────────────
    const components = result.address_components || []
    function getComp(type) {
      return components.find(c => c.types.includes(type))
    }
    const streetNumber = getComp('street_number')?.long_name || ''
    const route        = getComp('route')?.long_name || ''
    const locality     = getComp('locality')?.long_name
                      || getComp('administrative_area_level_3')?.long_name
                      || getComp('administrative_area_level_2')?.long_name
                      || ''
    const postalCode   = getComp('postal_code')?.long_name || ''
    const country      = getComp('country')?.long_name || ''

    // Build clean street address (prefer components over formatted_address)
    const streetAddress = [route, streetNumber].filter(Boolean).join(', ') || result.formatted_address || ''

    return NextResponse.json({
      lat:     result.geometry?.location?.lat ?? null,
      lng:     result.geometry?.location?.lng ?? null,
      address: streetAddress,
      formatted_address: result.formatted_address || '',
      name:    result.name || '',
      zip:     postalCode,
      city:    locality,
      country: country,
      website: result.website || '',
      phone:   result.international_phone_number || result.formatted_phone_number || '',
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
