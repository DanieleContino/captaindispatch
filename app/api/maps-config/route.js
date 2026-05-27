export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  return Response.json({ key })
}
