/* Service Worker de Firebase Cloud Messaging (push en segundo plano).
   La configuración del proyecto llega por query-string al registrarlo desde la
   app (son valores PÚBLICOS del cliente). Muestra la notificación aunque la
   app esté cerrada y, al tocarla, abre /walmart. */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

try {
  const p = new URLSearchParams(self.location.search)
  firebase.initializeApp({
    apiKey: p.get('apiKey') || '',
    authDomain: p.get('authDomain') || '',
    projectId: p.get('projectId') || '',
    messagingSenderId: p.get('senderId') || '',
    appId: p.get('appId') || '',
  })
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage((payload) => {
    const n = (payload && payload.notification) || {}
    self.registration.showNotification(n.title || 'MilePay', {
      body: n.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: (payload && payload.data) || {},
      tag: 'wal-fastpay',
    })
  })
} catch (e) { /* sin config: el SW no hace nada */ }

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if (c.url.includes('/walmart') && 'focus' in c) return c.focus() }
    if (clients.openWindow) return clients.openWindow('/walmart')
  })())
})
