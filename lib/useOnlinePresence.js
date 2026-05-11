'use client'
/**
 * lib/useOnlinePresence.js — S55
 * Real-time online presence using Supabase Realtime Presence.
 * No DB table needed — state is in-memory on the Supabase Realtime server.
 *
 * @exports useOnlinePresence({ productionId, userId, email, page, role })
 * @exports getPageLabel(path)
 * @exports getInitials(email)
 * @exports getAvatarColor(userId)
 * @exports fmtOnlineSince(isoString)
 * @exports getRoleStyle(role)
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// ── Page label map ────────────────────────────────────────
const PAGE_LABELS = {
  '/dashboard':                     'Dashboard',
  '/dashboard/fleet':               '🚦 Fleet',
  '/dashboard/trips':               '🗓 Trips',
  '/dashboard/crew':                '🎬 Crew',
  '/dashboard/hub-coverage':        '🛫 Hub Cov.',
  '/dashboard/pax-coverage':        '👥 Pax Cov.',
  '/dashboard/rocket':              '🚀 Rocket',
  '/dashboard/bridge':              '⚓ Bridge',
  '/dashboard/lists-v2':            '📋 Lists',
  '/dashboard/reports':             '📊 Reports',
  '/dashboard/locations':           '📍 Locations',
  '/dashboard/vehicles':            '🚐 Vehicles',
  '/dashboard/qr-codes':            '🔳 QR',
  '/dashboard/productions':         '🎬 Prods',
  '/dashboard/settings':            '⚙ Settings',
  '/dashboard/settings/production': '⚙ Prod.',
  '/dashboard/scan':                '📷 Scan',
  '/wrap-trip':                     '🔄 Wrap',
}

export function getPageLabel(path) {
  if (!path) return ''
  const clean = path.split('?')[0]
  return PAGE_LABELS[clean] || clean.split('/').filter(Boolean).pop() || path
}

// ── Display helpers ───────────────────────────────────────

export function getInitials(email) {
  if (!email) return '?'
  const local = email.split('@')[0]
  const parts = local.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#7c3aed',
  '#0891b2', '#f59e0b', '#db2777', '#ea580c',
]

export function getAvatarColor(userId) {
  if (!userId) return '#64748b'
  let h = 0
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h) + userId.charCodeAt(i)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function fmtOnlineSince(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

const ROLE_STYLES = {
  CAPTAIN:    { bg: '#dbeafe', color: '#1e40af' },
  ADMIN:      { bg: '#fce7f3', color: '#9d174d' },
  MANAGER:    { bg: '#d1fae5', color: '#065f46' },
  PRODUCTION: { bg: '#fef3c7', color: '#92400e' },
}

export function getRoleStyle(role) {
  return ROLE_STYLES[role] || { bg: '#f1f5f9', color: '#475569' }
}

// ── Main hook ─────────────────────────────────────────────

/**
 * useOnlinePresence
 *
 * Joins a Supabase Realtime Presence channel scoped to the active production.
 * Tracks the current user's info (email, page, role) and returns the live list
 * of ALL connected users for that production.
 *
 * @param {object} opts
 * @param {string}  opts.productionId  — active production UUID
 * @param {string}  opts.userId        — current user UUID (auth.user.id)
 * @param {string}  opts.email         — current user email
 * @param {string}  opts.page          — current page path (e.g. '/dashboard/trips')
 * @param {string}  opts.role          — user role for this production
 * @returns {Array} onlineUsers — sorted list of presence objects
 *                  Each entry: { user_id, email, page, role, online_at }
 */
export function useOnlinePresence({ productionId, userId, email, page, role }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const channelRef  = useRef(null)
  const onlineAtRef = useRef(null)
  // Keep latest values accessible inside the subscribe callback without re-running the effect
  const infoRef     = useRef({ userId, email, page, role })
  infoRef.current   = { userId, email, page, role }

  // ── Create / destroy channel when productionId or userId change ───────────
  useEffect(() => {
    if (!productionId || !userId) return
    if (!onlineAtRef.current) onlineAtRef.current = new Date().toISOString()

    const ch = supabase.channel(`presence-prod-${productionId}`, {
      config: { presence: { key: userId } },
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const raw  = ch.presenceState()
        // presenceState() → { key: [presenceObj, ...], ... }
        // Deduplicate by user_id: keep the most recent entry per user
        // (multiple entries can appear if track() is called more than once,
        //  e.g. when role loads after the initial subscribe)
        const seen = new Map()
        for (const entries of Object.values(raw)) {
          for (const entry of entries) {
            const key = entry.user_id
            if (!seen.has(key) || (entry.online_at || '') >= (seen.get(key).online_at || '')) {
              seen.set(key, entry)
            }
          }
        }
        const list = [...seen.values()]
        // Sort: current user first, then alphabetically by email
        list.sort((a, b) => {
          if (a.user_id === userId) return -1
          if (b.user_id === userId) return 1
          return (a.email || '').localeCompare(b.email || '')
        })
        setOnlineUsers(list)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await ch.track({
          user_id:   userId,
          email:     infoRef.current.email || '',
          page:      infoRef.current.page  || '',
          role:      infoRef.current.role  || '',
          online_at: onlineAtRef.current,
        })
      })

    channelRef.current = ch

    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
      setOnlineUsers([])
    }
  }, [productionId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-track when page/role/email change (no re-subscribe) ───────────────
  useEffect(() => {
    if (!channelRef.current || !userId) return
    // Small debounce to avoid firing during fast navigation
    const t = setTimeout(() => {
      channelRef.current?.track({
        user_id:   userId,
        email:     email  || '',
        page:      page   || '',
        role:      role   || '',
        online_at: onlineAtRef.current || new Date().toISOString(),
      }).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [page, role, userId, email])

  return onlineUsers
}
