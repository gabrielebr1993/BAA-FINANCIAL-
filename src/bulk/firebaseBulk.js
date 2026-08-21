// App de Firebase SECUNDARIA para Bulk: misma configuración/proyecto, pero una
// instancia con nombre propio ('bulk') para que la SESIÓN de autenticación de Bulk
// sea independiente de la de Package (login separado real).
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const appBulk = getApps().find((a) => a.name === 'bulk') || initializeApp(cfg, 'bulk')
export const authBulk = getAuth(appBulk)
// Firestore ligado a ESTA app: así las peticiones llevan el token del usuario Bulk
// (con bulkTenant/bulkRole). Antes se usaba la BD de la app por defecto, cuyo login
// no tiene esos claims → todo daba permission-denied.
//
// NOTA: la persistencia offline (persistentLocalCache) se retiró porque en
// iOS/Safari colgaba la primera lectura de Firestore y dejaba la app en
// "Cargando…". Se puede reintroducir más adelante con un enfoque probado por
// dispositivo. La resiliencia de conexión se mantiene con el banner y con la
// cola de escrituras en memoria del propio SDK mientras la app está abierta.
// IMPORTANTE (tiempo real): en algunas redes/navegadores el transporte por defecto
// de Firestore (WebChannel/streaming) queda BLOQUEADO y las suscripciones onSnapshot
// dejan de recibir actualizaciones (error "Listen/channel ... access control checks").
// Eso rompía el tiempo real: mensajes que no llegan al instante y, sobre todo, las
// LLAMADAS que nunca entran al otro lado. `experimentalAutoDetectLongPolling` detecta
// ese bloqueo y cambia a long-polling automáticamente → tiempo real fiable en todas
// las redes. try/catch por si la instancia ya fue inicializada (hot-reload).
let _db
try {
  _db = initializeFirestore(appBulk, { experimentalAutoDetectLongPolling: true })
} catch (e) {
  _db = getFirestore(appBulk)
}
export const dbBulk = _db
// Región por defecto us-central1; si despliegas las functions en otra región,
// cámbiala aquí: getFunctions(appBulk, 'us-east1').
export const funcsBulk = getFunctions(appBulk)
