/**
 * lib/webpush.js — Utility server per Web Push (S11 TASK 1)
 *
 * Espone:
 *  - sendPushToProduction(productionId, payload)  → invia a tutti i device di una produzione
 *  - sendPushToUser(userId, payload)               → invia a tutti i device di un singolo utente
 *
 * Richiede env vars:
 *  NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *  VAPID_PRIVATE_KEY
 *  VAPID_EMAIL
 *
 * USO SOLO lato server (Route Handlers, cron).
 * MAI importare in componenti client.
 */

import webpush from 'web-push'
import { createSupabaseServiceClient } from './supabaseServer'

// Inizializzazione VAPID (eseguita una volta al primo import)
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

/**
 * Invia una push notification a tutti i device iscritti di una produzione.
 *
 * @param {string} productionId — UUID della produzione
 * @param {{ title: string, body: string, url?: string, icon?: string }} payload
 * @returns {Promise<{ sent: number, errors: number }>}
 */
export async function sendPushToProduction(productionId, payload) {
  const supabase = await createSupabaseServiceClient()

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('production_id', productionId)

  if (error) {
    console.error('[webpush] Errore lettura subscriptions:', error.message)
    return { sent: 0, errors: 0 }
  }
  if (!subscriptions?.length) return { sent: 0, errors: 0 }

  return _sendToSubscriptions(supabase, subscriptions, payload)
}

/**
 * Invia una push notification a tutti i device iscritti di un singolo utente.
 *
 * @param {string} userId — UUID dell'utente
 * @param {{ title: string, body: string, url?: string, icon?: string }} payload
 * @returns {Promise<{ sent: number, errors: number }>}
 */
export async function sendPushToUser(userId, payload) {
  const supabase = await createSupabaseServiceClient()

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    console.error('[webpush] Errore lettura subscriptions utente:', error.message)
    return { sent: 0, errors: 0 }
  }
  if (!subscriptions?.length) return { sent: 0, errors: 0 }

  return _sendToSubscriptions(supabase, subscriptions, payload)
}

/**
 * Invia il payload a una lista di subscription e pulisce quelle scadute (410).
 * @private
 */
async function _sendToSubscriptions(supabase, subscriptions, payload) {
  const notification = JSON.stringify({
    title: payload.title || 'Captain Dispatch',
    body:  payload.body  || '',
    icon:  payload.icon  || '/icon.svg',
    url:   payload.url   || '/dashboard',
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        notification
      )
    )
  )

  // Rimuove subscription scadute o non valide (410 Gone / 404 Not Found)
  const expiredEndpoints = subscriptions
    .filter((_, i) => {
      const r = results[i]
      return (
        r.status === 'rejected' &&
        (r.reason?.statusCode === 410 || r.reason?.statusCode === 404)
      )
    })
    .map((s) => s.endpoint)

  if (expiredEndpoints.length) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints)
    console.log(`[webpush] Rimosse ${expiredEndpoints.length} subscription scadute`)
  }

  const sent   = results.filter((r) => r.status === 'fulfilled').length
  const errors = results.filter((r) => r.status === 'rejected' && !expiredEndpoints.includes(subscriptions[results.indexOf(r)]?.endpoint)).length

  return { sent, errors }
}
