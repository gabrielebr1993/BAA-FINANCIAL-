// App de Firebase SECUNDARIA para Bulk: misma configuración/proyecto, pero una
// instancia con nombre propio ('bulk') para que la SESIÓN de autenticación de Bulk
// sea independiente de la de Package (login separado real).
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
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
export const dbBulk = getFirestore(appBulk)
// Región por defecto us-central1; si despliegas las functions en otra región,
// cámbiala aquí: getFunctions(appBulk, 'us-east1').
export const funcsBulk = getFunctions(appBulk)
