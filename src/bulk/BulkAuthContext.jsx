// ============================================================================
// BULK · Autenticación con FIREBASE AUTH (sesión propia, independiente de Package).
// Los usuarios se crean por el backend (Cloud Functions: bootstrapMasterBulk /
// crearUsuarioBulk) que además pone los CUSTOM CLAIMS (bulkTenant, bulkRole,
// bulkClienteId, bulkCarrierId). Aquí solo iniciamos sesión y leemos esos claims;
// las reglas de Firestore aíslan por tenant/rol.
// ============================================================================
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { getDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { authBulk, funcsBulk } from './firebaseBulk'
import { ref, suscribirDoc } from './data/repo'
import { permisosDeRol, tienePermiso } from './domain/permisos'

const Ctx = createContext(null)
export const useBulkAuth = () => useContext(Ctx)

export function BulkAuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  // Configuración de roles del tenant (RBAC): { [rol]: { permisos: [...] } }.
  // Si no hay doc, permisosDeRol cae a los PRESETS (comportamiento actual).
  const [rolesConfig, setRolesConfig] = useState(null)

  // La sesión la maneja Firebase Auth (persistente). Al cambiar, cargamos claims + perfil.
  useEffect(() => {
    const off = onAuthStateChanged(authBulk, async (fb) => {
      if (!fb) { setUsuario(null); setCargando(false); return }
      try {
        const tok = await fb.getIdTokenResult(true)
        const c = tok.claims || {}
        // La SESIÓN sale de los claims (rápido). No bloqueamos la carga esperando
        // el perfil en Firestore: se lee aparte y enriquece cuando llega. Así la
        // app nunca se queda en "Cargando…" si una lectura se demora o falla.
        setUsuario({
          id: fb.uid,
          email: fb.email,
          nombre: fb.displayName || fb.email,
          empresa: '',
          rol: c.bulkRole || null,
          tenantId: c.bulkTenant || null,
          clienteId: c.bulkClienteId || null,
          carrierId: c.bulkCarrierId || null,
          plantaId: c.bulkPlantaId || null,
        })
        setCargando(false)
        // Enriquecer con el perfil (no bloqueante).
        getDoc(ref('users', fb.uid)).then((s) => {
          if (!s.exists()) return
          const p = s.data()
          setUsuario((u) => (u && u.id === fb.uid ? {
            ...u,
            nombre: p.nombre || u.nombre,
            empresa: p.empresa || u.empresa,
            codigo: p.codigo || u.codigo || null, // ID único de 8 dígitos (identidad del usuario)
            rol: u.rol || p.rol || null,
            tenantId: u.tenantId || p.tenantId || null,
            clienteId: u.clienteId || p.clienteId || null,
            carrierId: u.carrierId || p.carrierId || null,
            // El supervisor de planta se acota a su planta (la asigna el admin en su
            // doc de usuario). El claim manda; si no está, cae al perfil.
            plantaId: u.plantaId || p.plantaId || null,
          } : u))
        }).catch(() => { /* reglas / offline: seguimos con los claims */ })
      } catch { setUsuario(null); setCargando(false) }
    })
    return off
  }, [])

  // Suscripción a la configuración de roles del tenant (un doc: bulk_roles/{tenantId}).
  // Tiempo real: si un admin cambia los permisos de un rol, se refleja al instante.
  const tenantId = usuario?.tenantId || null
  useEffect(() => {
    if (!tenantId) { setRolesConfig(null); return }
    const off = suscribirDoc('roles', tenantId, (doc) => setRolesConfig(doc?.roles || {}))
    return off
  }, [tenantId])

  // Conjunto EFECTIVO de permisos del usuario (config del tenant o preset del rol).
  const permisos = useMemo(() => permisosDeRol(usuario?.rol, rolesConfig), [usuario?.rol, rolesConfig])
  // Chequeo granular: ¿el usuario puede esta capacidad? (clave del catálogo de permisos)
  const puede = useCallback((clave) => tienePermiso(permisos, clave), [permisos])

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

  // Auto-repara los permisos del propio usuario (re-aplica claims desde su perfil)
  // y refresca el token. Si la función aún no está desplegada, solo refresca.
  const repararPermisos = useCallback(async () => {
    try {
      const fn = httpsCallable(funcsBulk, 'repararMisClaims')
      await fn({})
    } catch { /* función no desplegada: seguimos igual */ }
    try { if (authBulk.currentUser) await authBulk.currentUser.getIdToken(true) } catch { /* noop */ }
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
    permisos, puede, rolesConfig, // RBAC granular
    iniciarSesion, cerrarSesion, crearSuperAdmin, crearUsuario, repararPermisos,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
