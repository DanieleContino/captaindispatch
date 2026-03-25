/**
 * lib/supabaseServer.js
 *
 * Crea un client Supabase lato server (Route Handlers, Server Actions).
 * Usa @supabase/ssr createServerClient per gestire i cookie di sessione.
 *
 * USO nei Route Handlers (app/api/.../route.js):
 *
 *   import { createSupabaseServerClient } from '@/lib/supabaseServer'
 *   export async function GET(request) {
 *     const supabase = await createSupabaseServerClient()
 *     const { data: { user } } = await supabase.auth.getUser()
 *     ...
 *   }
 *
 * Nota: questo file usa 'cookies' da 'next/headers' — funziona SOLO
 * in contesti server (Route Handlers, Server Components, Server Actions).
 * Per il lato client usa lib/supabase.js (createBrowserClient).
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // In Route Handlers il set dei cookie può fallire silenziosamente
            // se la response è già stata inviata — è normale
          }
        },
      },
    }
  )
}

/**
 * Versione con SERVICE_ROLE_KEY (bypassa RLS) — solo per script admin/cron.
 * Richiede SUPABASE_SERVICE_ROLE_KEY in .env.local
 * MAI usare lato client o in Route Handlers accessibili all'utente.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createSupabaseServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
