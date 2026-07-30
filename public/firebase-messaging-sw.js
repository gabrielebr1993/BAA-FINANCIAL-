/* BULK · Service Worker de Firebase Cloud Messaging (push en segundo plano).
   La config del proyecto llega por query-string al registrarlo (son claves públicas). */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

const p = new URLSearchParams(self.location.search)
firebase.initializeApp({
  apiKey: p.get('apiKey'),
  authDomain: p.get('authDomain'),
  projectId: p.get('projectId'),
  storageBucket: p.get('storageBucket'),
  messagingSenderId: p.get('messagingSenderId'),
  appId: p.get('appId'),
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {}
  self.registration.showNotification(n.title || 'MilePay', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'bulk-push',
    data: payload.data || {},
  })
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/bulk/ordenes'
  e.waitUntil(clients.matchAll({ type: 'window' }).then((wins) => {
    for (const w of wins) { if ('focus' in w) return w.focus() }
    return clients.openWindow(url)
  }))
})
