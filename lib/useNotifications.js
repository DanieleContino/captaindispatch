'use client'

/**
 * lib/useNotifications.js — Hook React per Web Push (S11 TASK 2)
 *
 * Gestisce l'intero ciclo di vita della push subscription:
 *  - rilevamento supporto browser
 *  - lettura stato permesso corrente
 *  - verifica subscription esistente
 *  - subscribe() / unsubscribe()
 *
 * USO (solo componenti client):
 *   const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * Converte una chiave VAPID base64url in Uint8Array
 * (richiesto da pushManager.subscribe)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function useNotifications() {
  const [supported,   setSupported]   = useState(false)
  const [permission,  setPermission]  = useState('default')
  const [subscribed,  setSubscribed]  = useState(false)
  const [loading,     setLoading]     = useState(false)

  // ── Init: controlla supporto + permesso + subscription esistente ──────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    setSupported(true)
    setPermission(Notification.permission)

    // Controlla se esiste già una subscription attiva nel SW
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSubscribed(!!sub)
      })
      .catch(() => {
        // SW non pronto o errore — ignora silenziosamente
      })
  }, [])

  // ── subscribe(productionId) ───────────────────────────────────────────────
  const subscribe = useCallback(async (productionId) => {
    if (!supported || loading) return
    setLoading(true)
    try {
      // 1. Richiedi permesso
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return

      // 2. Ottieni registrazione SW
      const reg = await navigator.serviceWorker.ready

      // 3. Crea subscription nel browser
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.error('[useNotifications] NEXT_PUBLIC_VAPID_PUBLIC_KEY non impostato')
        return
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // 4. Salva subscription su Supabase via API
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription, productionId: productionId || null }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[useNotifications] Errore subscribe API:', err)
        return
      }

      setSubscribed(true)
      console.log('[useNotifications] Subscription attivata')
    } catch (e) {
      console.error('[useNotifications] Errore subscribe:', e.message)
    } finally {
      setLoading(false)
    }
  }, [supported, loading])

  // ── unsubscribe() ─────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!supported || loading) return
    setLoading(true)
    try {
      // 1. Recupera subscription dal SW
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()

      if (!sub) {
        setSubscribed(false)
        return
      }

      const endpoint = sub.endpoint

      // 2. Annulla subscription lato browser
      await sub.unsubscribe()

      // 3. Rimuovi da Supabase via API
      const res = await fetch('/api/push/unsubscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[useNotifications] Errore unsubscribe API:', err)
        // Continuiamo comunque — il browser ha già rimosso la subscription
      }

      setSubscribed(false)
      console.log('[useNotifications] Subscription rimossa')
    } catch (e) {
      console.error('[useNotifications] Errore unsubscribe:', e.message)
    } finally {
      setLoading(false)
    }
  }, [supported, loading])

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}
