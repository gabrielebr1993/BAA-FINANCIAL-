// ============================================================================
// BULK · Autenticación con FIREBASE AUTH (sesión propia, independiente de Package).
// Los usuarios se crean por el backend (Cloud Functions: bootstrapMasterBulk /
// crearUsuarioBulk) que además pone los CUSTOM CLAIMS (bulkTenant, bulkRole,
// bulkClienteId, bulkCarrierId). Aquí solo iniciamos sesión y leemos esos claims;
// las reglas de Firestore aíslan por tenant/rol.
// ============================================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { authBulk, funcsBulk } from './firebaseBulk'
import { ref } from './data/repo'

const Ctx = createContext(null)
export const useBulkAuth = () => useContext(Ctx)

export function BulkAuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  // La sesión la maneja Firebase Auth (persistente). Al cambiar, cargamos claims + perfil.
  useEffect(() => {
    const off = onAuthStateChanged(authBulk, async (fb) => {
      if (!fb) { setUsuario(null); setCargando(false); return }
      try {
        const tok = await fb.getIdTokenResult(true)
        const c = tok.claims || {}
        let perfil = {}
        try { const s = await getDoc(ref('users', fb.uid)); if (s.exists()) perfil = s.data() } catch { /* reglas */ }
        setUsuario({
          id: fb.uid,
          email: fb.email,
          nombre: perfil.nombre || fb.displayName || fb.email,
          empresa: perfil.empresa || '',
          rol: c.bulkRole || perfil.rol || null,
          tenantId: c.bulkTenant || perfil.tenantId || null,
          clienteId: c.bulkClienteId || perfil.clienteId || null,
          carrierId: c.bulkCarrierId || perfil.carrierId || null,
        })
      } catch { setUsuario(null) }
      setCargando(false)
    })
    return off
  }, [])

  const iniciarSesion = useCallback(async (email, password) => {
    try {
      await signInWithEmailAndPassword(authBulk, String(email).trim().toLowerCase(), password)
    } catch (e) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') throw new Error('Correo o contraseña incorrectos.')
      if (e.code === 'auth/operation-not-allowed') throw new Error('Habilita el proveedor Email/Contraseña en Firebase Auth.')
      throw new Error(e.message)
    }
  }, [])

  const cerrarSesion = useCallback(() => signOut(authBulk), [])

  // Primer arranque: crea el super administrador vía backend y deja la sesión iniciada.
  const crearSuperAdmin = useCallback(async ({ nombre, email, password, empresa }) => {
    try {
      const fn = httpsCallable(funcsBulk, 'bootstrapMasterBulk')
      await fn({ nombre, email, password, empresa })
    } catch (e) {
      const msg = e?.message || ''
      if (e?.code === 'functions/failed-precondition' || /ya existe/i.test(msg)) throw new Error('Ya hay un administrador. Inicia sesión.')
      if (e?.code === 'functions/not-found' || /not.?found/i.test(msg)) throw new Error('El backend (Cloud Functions) aún no está desplegado.')
      throw new Error(msg || 'No se pudo crear el administrador.')
    }
    await signInWithEmailAndPassword(authBulk, String(email).trim().toLowerCase(), password)
  }, [])

  // Alta de usuarios (staff crea cualquiera; transportista crea sus choferes) vía backend.
  const crearUsuario = useCallback(async (datos) => {
    // Refresca el token para que lleve los claims más recientes (bulkTenant/bulkRole).
    // Evita el "No autorizado" cuando los permisos se asignaron después del último login.
    try { if (authBulk.currentUser) await authBulk.currentUser.getIdToken(true) } catch { /* noop */ }
    const fn = httpsCallable(funcsBulk, 'crearUsuarioBulk')
    const r = await fn(datos)
    return r.data
  }, [])

  const value = {
    usuario, cargando,
    existeSuperAdmin: true, // el backend valida el primer arranque (idempotente)
    tenantId: usuario?.tenantId || null,
    rol: usuario?.rol || null,
    iniciarSesion, cerrarSesion, crearSuperAdmin, crearUsuario,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
