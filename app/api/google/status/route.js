import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/google/status
 *
 * Reports whether the currently logged-in user has connected Google Drive.
 *
 * Response:
 *   { connected: false }                                       — not connected
 *   { connected: true, google_email: "user@example.com",
 *     connected_at: "2026-...", scope: "..." }                 — connected
 *
 *   { error: "not_logged_in" }, status 401
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return Response.json({ error: 'not_logged_in' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'service_role_missing' }, { status: 500 })
  }
  const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await adminSupabase
    .from('user_google_tokens')
    .select('google_email, connected_at, scope, last_refresh_error')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: 'db_error' }, { status: 500 })
  }

  if (!data) {
    return Response.json({ connected: false })
  }

  return Response.json({
    connected: true,
    google_email: data.google_email,
    connected_at: data.connected_at,
    scope: data.scope,
    last_refresh_error: data.last_refresh_error || null,
  })
}
