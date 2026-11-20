// ============================================================================
// Entrada con Face ID / Touch ID (solo en la app de iPhone, vía Capacitor).
//
// - Un mismo flujo para los dos: iOS dice qué tiene el teléfono (Face ID en los
//   iPhone normales, Touch ID en el iPhone Duo y modelos con botón).
// - El correo y la contraseña se guardan en el LLAVERO de iOS (Keychain),
//   cifrados por el sistema; nunca en localStorage ni en Firestore.
// - Cada módulo (package, bulk, warehouse…) guarda sus propias credenciales.
// - En el navegador / PWA no hace nada: `estado()` devuelve { disponible:false }.
// ============================================================================
import { Capacitor } from '@capacitor/core'

const SERVIDOR = (moduloId) => `io.milepay.app.${moduloId || 'package'}`
const LS = (moduloId) => `mp_bio_${moduloId || 'package'}`

// Carga perezosa: el plugin solo se baja en la app nativa.
let _plugin = null
async function plugin() {
  if (!_plugin) _plugin = (await import('@capgo/capacitor-native-biometric')).NativeBiometric
  return _plugin
}

// 1 = TOUCH_ID, 2 = FACE_ID (enum BiometryType del plugin).
const nombreDe = (tipo) => (tipo === 1 ? 'Touch ID' : 'Face ID')

// ¿Hay biometría en este teléfono y ya está activada para este módulo?
export async function estado(moduloId) {
  if (!Capacitor.isNativePlatform()) return { disponible: false, activa: false, nombre: '' }
  try {
    const p = await plugin()
    const r = await p.isAvailable()
    const disponible = !!r?.isAvailable && (r.biometryType === 1 || r.biometryType === 2)
    let activa = false
    try { activa = disponible && !!localStorage.getItem(LS(moduloId)) } catch { /* noop */ }
    return { disponible, activa, nombre: nombreDe(r?.biometryType), email: activa ? localStorage.getItem(LS(moduloId)) : '' }
  } catch {
    return { disponible: false, activa: false, nombre: '' }
  }
}

// Guarda las credenciales en el Llavero tras un login correcto con contraseña.
export async function activar(moduloId, email, pass) {
  const p = await plugin()
  await p.setCredentials({ username: email, password: pass, server: SERVIDOR(moduloId) })
  try { localStorage.setItem(LS(moduloId), email) } catch { /* noop */ }
}

// Borra las credenciales (el usuario lo desactivó o la contraseña cambió).
export async function desactivar(moduloId) {
  try { localStorage.removeItem(LS(moduloId)) } catch { /* noop */ }
  try { const p = await plugin(); await p.deleteCredentials({ server: SERVIDOR(moduloId) }) } catch { /* noop */ }
}

// Pide la cara o la huella y devuelve { email, pass }. Lanza si el usuario cancela.
export async function pedir(moduloId, { razon, titulo } = {}) {
  const p = await plugin()
  await p.verifyIdentity({
    reason: razon || 'Entrar a MilePay',
    title: titulo || 'MilePay',
    useFallback: true, // si falla la cara/huella, iOS ofrece el código del iPhone
  })
  const c = await p.getCredentials({ server: SERVIDOR(moduloId) })
  return { email: c.username, pass: c.password }
}
