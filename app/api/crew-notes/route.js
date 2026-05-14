/**
 * /api/crew-notes
 * S58-A — Sistema note tra Captain, Travel e Accommodation Coordinator
 *
 * GET    ?crew_id=&production_id=   → lista note per un crew member
 * POST                              → crea nuova nota
 * PATCH  ?id=&action=mark_read      → marca nota come letta dall'utente corrente
 * DELETE ?id=                       → elimina nota (solo autore)
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name)         { return cookieStore.get(name)?.value },
        set(name, value, options) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name, options)     { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}

// ─── GET — lista note per un crew member ─────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const crew_id       = searchParams.get('crew_id')
  const production_id = searchParams.get('production_id')

  if (!crew_id || !production_id) {
    return NextResponse.json({ error: 'crew_id and production_id required' }, { status: 400 })
  }

  const supabase = makeSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS gestisce visibilità (pubbliche + proprie private)
  const { data, error } = await supabase
    .from('crew_notes')
    .select('id,crew_id,author_id,author_name,author_role,content,is_private,context,read_by,created_at')
    .eq('crew_id', crew_id)
    .eq('production_id', production_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ notes: data || [], user_id: user.id })
}

// ─── POST — crea nuova nota ───────────────────────────────────
export async function POST(request) {
  const supabase = makeSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { crew_id, production_id, content, is_private, context, author_name, author_role } = body

  if (!crew_id || !production_id || !content?.trim()) {
    return NextResponse.json({ error: 'crew_id, production_id, content required' }, { status: 400 })
  }

  // Verifica che l'utente abbia un ruolo nella produzione
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('production_id', production_id)
    .maybeSingle()

  if (!role) return NextResponse.json({ error: 'Not a member of this production' }, { status: 403 })

  const { data, error } = await supabase
    .from('crew_notes')
    .insert({
      production_id,
      crew_id,
      author_id:   user.id,
      author_name: author_name || user.email || 'Unknown',
      author_role: author_role || role.role || 'CAPTAIN',
      content:     content.trim(),
      is_private:  is_private === true,
      context:     context || 'general',
      read_by:     [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: data }, { status: 201 })
}

// ─── PATCH — mark as read ─────────────────────────────────────
export async function PATCH(request) {
  const supabase = makeSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { id, action } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (action === 'mark_read') {
    // Aggiunge user.id a read_by se non già presente
    const { data: note } = await supabase
      .from('crew_notes')
      .select('read_by, author_id')
      .eq('id', id)
      .single()

    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    // L'autore non marca come letta la propria nota
    if (note.author_id === user.id) {
      return NextResponse.json({ ok: true, already_author: true })
    }

    const existing = note.read_by || []
    if (existing.includes(user.id)) {
      return NextResponse.json({ ok: true, already_read: true })
    }

    const { error } = await supabase
      .from('crew_notes')
      .update({ read_by: [...existing, user.id] })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_unread') {
    // Rimuove user.id da read_by (lascia come promemoria)
    const { data: note } = await supabase
      .from('crew_notes')
      .select('read_by')
      .eq('id', id)
      .single()

    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    const updated = (note.read_by || []).filter(uid => uid !== user.id)
    const { error } = await supabase
      .from('crew_notes')
      .update({ read_by: updated })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ─── DELETE — elimina nota (solo autore) ─────────────────────
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = makeSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS garantisce che solo l'autore può cancellare
  const { error } = await supabase
    .from('crew_notes')
    .delete()
    .eq('id', id)
    .eq('author_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
