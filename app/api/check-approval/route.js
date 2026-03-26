/**
 * app/api/check-approval/route.js
 * 
 * Endpoint per verificare se un utente è stato approvato (ha un ruolo in user_roles).
 * Usato dalla pagina /pending per il polling.
 */

import { createSupabaseServiceClient } from '@/lib/supabaseServer'

export async function POST(request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return Response.json(
        { error: 'userId mancante' },
        { status: 400 }
      )
    }

    // Usa service client per bypassare RLS
    const serviceClient = await createSupabaseServiceClient()
    const { data: userRoles, error } = await serviceClient
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      console.error('Errore query user_roles:', error)
      return Response.json(
        { isApproved: false, error: error.message },
        { status: 500 }
      )
    }

    const isApproved = userRoles && userRoles.length > 0

    return Response.json({ isApproved })
  } catch (err) {
    console.error('Errore endpoint check-approval:', err.message)
    return Response.json(
      { error: err.message },
      { status: 500 }
    )
  }
}
