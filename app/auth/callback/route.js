import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseServer'
import { sendLoginNotification } from '@/lib/sendLoginNotification'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  console.log('Callback - code:', code)
  console.log('All params:', Object.fromEntries(searchParams))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    console.log('Exchange error:', error)
    
    if (!error) {
      // ✅ Login riuscito — verifica se l'utente è approvato
      const user = data?.user
      if (user) {
        try {
          // Usa service client per bypassare RLS e controllare user_roles
          const serviceClient = await createSupabaseServiceClient()
          const { data: userRoles, error: rolesError } = await serviceClient
            .from('user_roles')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
          
          const isApproved = !rolesError && userRoles && userRoles.length > 0
          
          // Invia notifica email
          await sendLoginNotification(user.email, isApproved)
          
          // Se approvato → dashboard, altrimenti → pending
          const redirectUrl = isApproved 
            ? `${origin}/dashboard`
            : `${origin}/pending`
          
          return NextResponse.redirect(redirectUrl)
        } catch (err) {
          console.error('❌ Errore durante verifica user_roles:', err.message)
          // In caso di errore, reindirizza comunque a dashboard (fallback)
          return NextResponse.redirect(`${origin}/dashboard`)
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
