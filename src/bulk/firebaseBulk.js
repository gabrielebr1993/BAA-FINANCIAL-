// App de Firebase SECUNDARIA para Bulk: misma configuración/proyecto, pero una
// instancia con nombre propio ('bulk') para que la SESIÓN de autenticación de Bulk
// sea independiente de la de Package (login separado real).
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
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
// Persistencia OFFLINE (IndexedDB, multi-pestaña): la app funciona sin conexión
// (lecturas desde caché) y las escrituras se ENCOLAN y se SINCRONIZAN solas al
// reconectar — clave para choferes en zonas con mala señal. Si el navegador no
// soporta IndexedDB, cae a la instancia en memoria sin romper.
export const dbBulk = (() => {
  try {
    return initializeFirestore(appBulk, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return getFirestore(appBulk)
  }
})()
// Región por defecto us-central1; si despliegas las functions en otra región,
// cámbiala aquí: getFunctions(appBulk, 'us-east1').
export const funcsBulk = getFunctions(appBulk)
