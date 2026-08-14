// Package · Cierre de sesión forzado por el dueño/superadmin, vía una "señal" en
// Firestore (doc authSignals/{companyId}). Cada sesión abierta la escucha y, si el
// timestamp es posterior a su inicio, cierra sesión. Espejo del mecanismo de Bulk.
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const ahoraMs = () => Date.now()

// Fuerza el cierre de sesión de TODAS las cuentas de la empresa.
export async function cerrarTodasLasSesiones(companyId) {
  if (!companyId) return
  await setDoc(doc(db, 'authSignals', companyId), { all: ahoraMs() }, { merge: true })
}

// Fuerza el cierre a UN usuario (por su uid).
export async function cerrarSesionUsuario(companyId, uid) {
  if (!companyId || !uid) return
  await setDoc(doc(db, 'authSignals', companyId), { uids: { [uid]: ahoraMs() } }, { merge: true })
}

// Timestamp de logout que aplica a este usuario (el mayor entre "todos" y "su uid").
export function logoutAplicable(sig, uid) {
  if (!sig) return 0
  return Math.max(Number(sig.all) || 0, Number(sig.uids?.[uid]) || 0)
}
