// CaptainDispatch Service Worker — minimal PWA support
const CACHE_NAME = 'captaindispatch-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Network-first strategy — sempre dati freschi, nessun caching aggressivo
self.addEventListener('fetch', (event) => {
  // Solo richieste GET, skip API e Supabase
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

/**
 * Web Push — gestione notifiche (S11 TASK 1)
 *
 * Gestisce:
 *  - 'push'              → mostra la notifica al ricevimento del push
 *  - 'notificationclick' → apre/focalizza la finestra al click
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Captain Dispatch', body: event.data.text() };
  }

  const {
    title = 'Captain Dispatch',
    body  = '',
    icon  = '/icon.svg',
    badge = '/icon.svg',
    url   = '/dashboard',
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      // Raggruppa le notifiche Captain Dispatch per non spammare
      tag: 'captaindispatch',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se una finestra con l'URL è già aperta, la porta in primo piano
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        // Altrimenti apre una nuova finestra
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
