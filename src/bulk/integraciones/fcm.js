// BULK · Push REAL con Firebase Cloud Messaging (a la app cerrada / en segundo plano).
// Requiere:
//   1) Env VITE_FCM_VAPID_KEY = "Web Push certificate" (Firebase Console → Cloud
//      Messaging → Web configuration → Key pair).
//   2) El service worker public/firebase-messaging-sw.js (ya incluido).
//   3) La Cloud Function bulkPushOrdenes desplegada (functions/index.js) que envía.
// Sin la VAPID key o sin permiso del navegador, esto NO hace nada (la app sigue igual
// y quedan los avisos locales en pantalla).
import { isSupported, getMessaging, getToken } from 'firebase/messaging'
import { setDoc, doc, serverTimestamp } from 'firebase/firestore'
import { appBulk, dbBulk } from '../firebaseBulk'

const VAPID = import.meta.env.VITE_FCM_VAPID_KEY || ''
const CFG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const pushConfigurado = () => !!VAPID

let _reg, _msg
// Pide permiso, registra el SW, obtiene el token FCM y lo guarda (con su audiencia:
// tenant, rol, carrier) para que el backend sepa a quién enviar. Idempotente.
export async function activarPush({ tenantId, uid, rol, carrierId, clienteId, nombre } = {}) {
  try {
    if (!VAPID) return null
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return null
    if (!(await isSupported())) return null
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return null
    }
    if (Notification.permission !== 'granted') return null
    // Dentro de la APP NATIVA no hay service worker: los tokens nativos se
    // registran por registrarTokensNativos(); aquí no hay nada que hacer.
    if (/MilePayApp/.test(navigator.userAgent)) return null
    const qs = new URLSearchParams(CFG).toString()
    _reg = _reg || await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: '/firebase-cloud-messaging-push-scope' })
    _msg = _msg || getMessaging(appBulk)
    const token = await getToken(_msg, { vapidKey: VAPID, serviceWorkerRegistration: _reg })
    if (!token) return null
    await setDoc(doc(dbBulk, 'bulk_pushTokens', token.replace(/\//g, '_')), {
      token,
      tenantId: tenantId || null,
      uid: uid || null,
      rol: rol || null,
      carrierId: carrierId || null,
      clienteId: clienteId || null,
      nombre: nombre || null,
      actualizadoEn: serverTimestamp(),
    }, { merge: true })
    return token
  } catch { return null }
}

// ── Tokens de la APP NATIVA (iOS/Android) ───────────────────────────────────
// La app nativa deja sus tokens en localStorage (mp_tok_ios = FCM,
// mp_tok_voip = PushKit). La web, YA AUTENTICADA, los registra directo en
// bulk_pushTokens (mismo camino que el push del navegador): así el registro no
// depende de pases ni de red del lado nativo. Se revisa por un rato tras el
// login porque los tokens pueden llegar unos segundos después.
const _regNativos = new Set()
export function registrarTokensNativos({ tenantId, uid, rol, carrierId, clienteId, nombre } = {}) {
  const intento = async () => {
    for (const [clave, plataforma] of [['mp_tok_ios', 'ios'], ['mp_tok_voip', 'ios_voip']]) {
      try {
        const token = localStorage.getItem(clave) || ''
        if (token.length < 20) continue
        const marca = `${plataforma}|${token}|${uid}`
        if (_regNativos.has(marca)) continue
        await setDoc(doc(dbBulk, 'bulk_pushTokens', token.replace(/\//g, '_')), {
          token,
          plataforma,
          tenantId: tenantId || null,
          uid: uid || null,
          rol: rol || null,
          carrierId: carrierId || null,
          clienteId: clienteId || null,
          nombre: nombre || null,
          actualizadoEn: serverTimestamp(),
        }, { merge: true })
        _regNativos.add(marca)
        try { localStorage.setItem('mp_reg_diag', `${plataforma} registrado ✓ ${new Date().toLocaleTimeString()}`) } catch { /* noop */ }
      } catch (e) {
        // Guarda el ERROR para el diagnóstico visible (p. ej. permission-denied).
        try { localStorage.setItem('mp_reg_diag', `${plataforma} ERROR: ${e?.code || e?.message || e}`) } catch { /* noop */ }
      }
    }
  }
  intento()
  const id = setInterval(intento, 3000)
  setTimeout(() => clearInterval(id), 90000) // vigila 90 s tras el login
  return () => clearInterval(id)
}
