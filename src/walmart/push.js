// ── Notificaciones push (FCM) para Walmart ───────────────────────────────────
// Registra el token del dispositivo (wal_push/{uid}) para que la Cloud Function
// walSolicitudPush avise al dueño/staff cuando un chofer pide Fast Pay.
// La clave VAPID (pública) va en VITE_FCM_VAPID_KEY.
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { app, db, firebaseConfigPublic } from '../firebase'

const VAPID = import.meta.env.VITE_FCM_VAPID_KEY

export function pushSoportado() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

// Pide permiso, registra el SW y guarda el token. Devuelve { ok, motivo }.
export async function activarPush(uid, email) {
  try {
    if (!pushSoportado() || !(await isSupported())) return { ok: false, motivo: 'Este navegador/dispositivo no soporta notificaciones push.' }
    if (!VAPID) return { ok: false, motivo: 'Falta configurar la clave VAPID (VITE_FCM_VAPID_KEY).' }
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return { ok: false, motivo: 'No diste permiso de notificaciones en este dispositivo.' }
    const c = firebaseConfigPublic
    const qs = new URLSearchParams({
      apiKey: c.apiKey || '', authDomain: c.authDomain || '', projectId: c.projectId || '',
      senderId: c.messagingSenderId || '', appId: c.appId || '',
    }).toString()
    // Ámbito PROPIO para NO chocar con el service worker de la PWA (que controla
    // "/"). Si usaran el mismo ámbito, uno reemplazaría al otro y la app podría
    // quedarse en blanco al actualizar.
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: '/firebase-cloud-messaging-push-scope/' })
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: reg })
    if (!token) return { ok: false, motivo: 'No se pudo obtener el token del dispositivo.' }
    await setDoc(doc(db, 'wal_push', uid), { token, email: String(email || '').toLowerCase(), plataforma: 'web', actualizadoEn: serverTimestamp() }, { merge: true })
    return { ok: true }
  } catch (e) { return { ok: false, motivo: e?.message || String(e) } }
}

// Escucha mensajes con la app ABIERTA (primer plano). Llama cb(payload).
export async function escucharPush(cb) {
  try { if (!(await isSupported())) return () => {}; return onMessage(getMessaging(app), cb) } catch { return () => {} }
}
