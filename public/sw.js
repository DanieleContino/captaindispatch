/**
 * public/sw.js — Service Worker per Web Push (S11 TASK 1)
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
