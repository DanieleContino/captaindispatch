'use client'
/**
 * lib/NotesPanel.js — S59-A
 * Componente unificato per le note crew.
 * Usato da CrewSidebar (crew/page.js) e MovementSidebar (travel/page.js).
 *
 * Props:
 *   crewId        {string}   — id del crew member
 *   productionId  {string}   — production id
 *   currentUser   {object}   — { id, name, role }
 *   onNotesSent   {function} — callback opzionale dopo ogni invio (es. per aggiornare unreadMap nel parent)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// ── Constants ───────────────────────────────────────────────────────────────

const ROLE_COLOR = {
  CAPTAIN:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  TRAVEL:        { bg: '#faf5ff', color: '#7c3aed', border: '#c4b5fd' },
  ACCOMMODATION: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
}

const CTX_ICON  = { general: '🌐', travel: '✈️', accommodation: '🏨' }
const CTX_LABEL = { general: 'General', travel: 'Travel', accommodation: 'Accommodation' }
const CONTEXTS  = ['general', 'travel', 'accommodation']

// ── Helper ──────────────────────────────────────────────────────────────────

function fmtRelative(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NotesPanel({ crewId, productionId, currentUser, onNotesSent }) {
  const [notes,      setNotes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [text,       setText]       = useState('')
  const [context,    setContext]    = useState('general')
  const [isPrivate,  setIsPrivate]  = useState(false)
  const [filter,     setFilter]     = useState('all')
  const [delConfirm, setDelConfirm] = useState(null)
  const [editing,    setEditing]    = useState(null)  // id della nota in edit
  const [editText,   setEditText]   = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!crewId || !productionId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/crew-notes?crew_id=${crewId}&production_id=${productionId}`)
      const json = await res.json()
      setNotes(json.notes || [])
    } catch (err) {
      console.error('NotesPanel load:', err)
    } finally {
      setLoading(false)
    }
  }, [crewId, productionId])

  useEffect(() => { load() }, [load])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  // Si sottoscrive a INSERT / UPDATE / DELETE su crew_notes filtrato per crew_id.
  // Quando arriva un evento, ricarica le note via API (rispetta RLS private).

  useEffect(() => {
    if (!crewId || !productionId) return
    const channel = supabase
      .channel(`crew_notes:${crewId}:${productionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crew_notes', filter: `crew_id=eq.${crewId}` },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [crewId, productionId, load])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isUnread(note) {
    if (!currentUser) return false
    if (note.author_id === currentUser.id) return false
    return !(note.read_by || []).includes(currentUser.id)
  }

  function canEdit(note) {
    if (!currentUser) return false
    if (note.author_id !== currentUser.id) return false
    // Edit consentito solo entro 5 minuti dalla creazione
    return (Date.now() - new Date(note.created_at).getTime()) < 5 * 60 * 1000
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function markRead(note) {
    if (!currentUser) return
    await fetch('/api/crew-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_read' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
  }

  async function markUnread(note) {
    if (!currentUser) return
    await fetch('/api/crew-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_unread' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: (n.read_by || []).filter(id => id !== currentUser.id) } : n
    ))
  }

  async function markAllRead() {
    if (!currentUser) return
    const unread = notes.filter(n => isUnread(n))
    await Promise.all(unread.map(n =>
      fetch('/api/crew-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id, action: 'mark_read' }),
      })
    ))
    // Aggiorna lo stato locale ottimisticamente
    setNotes(prev => prev.map(n =>
      isUnread(n) ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
  }

  async function handleDelete(id) {
    if (delConfirm !== id) { setDelConfirm(id); return }
    await fetch(`/api/crew-notes?id=${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    setDelConfirm(null)
    onNotesSent?.()
  }

  function startEdit(note) {
    setEditing(note.id)
    setEditText(note.content)
    setDelConfirm(null)
  }

  async function saveEdit(note) {
    if (!editText.trim()) return
    setEditSaving(true)
    try {
      // S59-D aggiunge action:'edit' all'API; fino ad allora la richiesta
      // verrà rifiutata con "Unknown action" ma non causa crash.
      const res  = await fetch('/api/crew-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, action: 'edit', content: editText.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setNotes(prev => prev.map(n =>
          n.id === note.id ? { ...n, content: editText.trim() } : n
        ))
        setEditing(null)
      }
    } finally {
      setEditSaving(false)
    }
  }

  async function handleSend() {
    if (!text.trim() || !currentUser) return
    setSending(true)
    try {
      const res  = await fetch('/api/crew-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crew_id:      crewId,
          production_id: productionId,
          content:      text.trim(),
          is_private:   isPrivate,
          context,
          author_name:  currentUser.name,
          author_role:  currentUser.role || 'CAPTAIN',
        }),
      })
      const json = await res.json()
      if (json.note) {
        setNotes(prev => [json.note, ...prev])
        setText('')
        onNotesSent?.()
      }
    } finally {
      setSending(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const unreadCount    = notes.filter(n => isUnread(n)).length
  const filteredNotes  = filter === 'all' ? notes : notes.filter(n => n.context === filter)
  const showFilters    = notes.length >= 3

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#b45309' }}>💬 Notes</span>

        {notes.length > 0 && (
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: '999px', border: '1px solid #fcd34d' }}>
            ✓ {notes.length}
          </span>
        )}

        {unreadCount > 0 && (
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'white', background: '#f97316', padding: '1px 6px', borderRadius: '999px', border: '1px solid #fb923c' }}>
            ❗ {unreadCount} new
          </span>
        )}

        {unreadCount > 0 && (
          <button type="button" onClick={markAllRead}
            style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontWeight: '700' }}>
            ✓ Mark all read
          </button>
        )}
      </div>

      {/* ── Filter pills (≥3 note) ── */}
      {showFilters && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {['all', ...CONTEXTS].map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              style={{
                fontSize: '10px', padding: '2px 8px', borderRadius: '999px', border: '1px solid', cursor: 'pointer',
                fontWeight:   filter === f ? '700' : '400',
                background:   filter === f ? '#0f2340' : '#f8fafc',
                color:        filter === f ? 'white'   : '#64748b',
                borderColor:  filter === f ? '#0f2340' : '#e2e8f0',
              }}>
              {f === 'all' ? 'ALL' : CTX_ICON[f]}
            </button>
          ))}
        </div>
      )}

      {/* ── Notes list ── */}
      <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
        {loading ? (
          <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px' }}>Loading…</div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>No notes yet</div>
        ) : (
          filteredNotes.map(n => {
            const unread    = isUnread(n)
            const isAuthor  = currentUser && n.author_id === currentUser.id
            const roleCls   = ROLE_COLOR[n.author_role] || ROLE_COLOR.CAPTAIN
            const ctxIcon   = CTX_ICON[n.context]  || '💬'
            const isEditing = editing === n.id

            return (
              <div key={n.id} style={{
                background:  unread ? '#fff7ed' : 'white',
                border:      `1px solid ${unread ? '#fb923c' : '#e2e8f0'}`,
                borderLeft:  `3px solid ${unread ? '#f97316' : '#e2e8f0'}`,
                borderRadius: '7px', padding: '8px 10px',
              }}>
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: roleCls.color, background: roleCls.bg, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${roleCls.border}` }}>
                    {n.author_role}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{n.author_name}</span>
                  <span style={{ fontSize: '10px' }}>{ctxIcon}</span>
                  {n.is_private && (
                    <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 5px', borderRadius: '999px' }}>🔒</span>
                  )}
                  {unread && <span style={{ fontSize: '10px', fontWeight: '700', color: '#f97316' }}>⬤ NEW</span>}
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{fmtRelative(n.created_at)}</span>
                </div>

                {/* Content / inline edit */}
                {isEditing ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      style={{ width: '100%', padding: '5px 7px', border: '1px solid #fcd34d', borderRadius: '5px', fontSize: '12px', resize: 'vertical', minHeight: '44px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      <button type="button" onClick={() => setEditing(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button type="button" onClick={() => saveEdit(n)} disabled={editSaving}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: 'none', background: '#b45309', color: 'white', cursor: 'pointer', fontWeight: '700' }}>
                        {editSaving ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {n.content}
                  </div>
                )}

                {/* Action buttons (nascosti durante edit) */}
                {!isEditing && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {!isAuthor && unread && (
                      <button type="button" onClick={() => markRead(n)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontWeight: '700' }}>
                        ✓ Mark as read
                      </button>
                    )}
                    {!isAuthor && !unread && (
                      <button type="button" onClick={() => markUnread(n)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: '700' }}>
                        📌 Remind me
                      </button>
                    )}
                    {isAuthor && canEdit(n) && (
                      <button type="button" onClick={() => startEdit(n)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer' }}>
                        ✎ Edit
                      </button>
                    )}
                    {isAuthor && (
                      delConfirm === n.id ? (
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <button type="button" onClick={() => setDelConfirm(null)}
                            style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '5px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>✕</button>
                          <button type="button" onClick={() => handleDelete(n.id)}
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: '700' }}>⚠ Del</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => handleDelete(n.id)}
                          style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', cursor: 'pointer' }}>🗑</button>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Send form ── */}
      <div style={{ borderTop: '1px solid #fde68a', paddingTop: '8px' }}>

        {/* Context selector pills */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
          {CONTEXTS.map(c => (
            <button key={c} type="button" onClick={() => setContext(c)}
              style={{
                fontSize: '10px', padding: '2px 8px', borderRadius: '999px', border: '1px solid', cursor: 'pointer',
                fontWeight:  context === c ? '700' : '400',
                background:  context === c ? '#0f2340' : '#f8fafc',
                color:       context === c ? 'white'   : '#64748b',
                borderColor: context === c ? '#0f2340' : '#e2e8f0',
              }}>
              {CTX_ICON[c]} {CTX_LABEL[c]}
            </button>
          ))}
        </div>

        {/* Textarea (Enter senza Shift = send) */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Add a note for the team…"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '12px', resize: 'vertical', minHeight: '52px', boxSizing: 'border-box', fontFamily: 'inherit', color: '#0f172a', background: 'white' }}
        />

        {/* Private toggle + Send button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
          <button type="button" onClick={() => setIsPrivate(p => !p)}
            style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontWeight: '700',
              ...(isPrivate
                ? { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }
                : { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }),
            }}>
            {isPrivate ? '🔒 Private' : '🌐 Shared'}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={handleSend} disabled={sending || !text.trim()}
            style={{
              fontSize: '11px', padding: '4px 12px', borderRadius: '6px', border: 'none', fontWeight: '700',
              background: (sending || !text.trim()) ? '#94a3b8' : '#b45309',
              color: 'white',
              cursor: (sending || !text.trim()) ? 'default' : 'pointer',
            }}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
