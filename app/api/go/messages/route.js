import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 })
  }

  // Trova messaggi TO_DRIVER non ancora ricevuti per questo token
  const { data: messages, error } = await supabase
    .from('dispatch_messages')
    .select('id, message_type, body, sent_at')
    .eq('driver_token', token)
    .eq('direction', 'TO_DRIVER')
    .is('received_at', null)
    .order('sent_at', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Marca i messaggi come ricevuti
  if (messages && messages.length > 0) {
    const ids = messages.map(m => m.id)
    await supabase
      .from('dispatch_messages')
      .update({ received_at: new Date().toISOString() })
      .in('id', ids)
  }

  return Response.json({ messages: messages || [] })
}
