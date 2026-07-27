// ============================================================================
// BULK · Autenticación INDEPENDIENTE
// Login, usuarios, roles y sesión propios — sin relación con el login de Package.
// Los usuarios viven en `bulk_users` (namespace separado) y la sesión se guarda
// aparte (`bulk_session`).
//
// ⚠️ NOTA DE SEGURIDAD: esta verificación de credenciales es del lado del cliente
// (hash SHA-256 + reglas de Firestore) para levantar el módulo sin backend. Para
// PRODUCCIÓN debe moverse a un backend real (Cloud Function / proyecto Auth
// separado) que verifique la contraseña en el servidor y emita el token. La
// arquitectura ya está preparada: solo se reemplaza `verificar()` y `hashPass()`.
// ============================================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getDocs, query, where } from 'firebase/firestore'
import { col, ref, crearConId, guardar } from './data/repo'
import { getDoc } from 'firebase/firestore'
import { BULK_ROLES } from './domain/constants'

const Ctx = createContext(null)
export const useBulkAuth = () => useContext(Ctx)

const SESION_KEY = 'bulk_session'

// Usuario MASTER (super administrador) que se auto-crea si no existe. Se guarda solo el
// HASH SHA-256 de la contraseña, nunca el texto plano. (Cámbiala en producción.)
const MASTER = {
  id: 'u_master',
  tenantId: 't_master',
  nombre: 'Gabriele Brandonisio',
  email: 'gabriele.brandonisio.o@gmail.com',
  passHash: 'c7463b8739e3a8a066ad5ff1a810caca9fca02b1cf0eae0e54f89cd7aeea6845',
}

async function hashPass(texto) {
  const data = new TextEncoder().encode(String(texto))
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function buscarPorEmail(email) {
  const snap = await getDocs(query(col('users'), where('email', '==', String(email).trim().toLowerCase())))
  const d = snap.docs[0]
  return d ? { id: d.id, ...d.data() } : null
}

export function BulkAuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [existeSuperAdmin, setExisteSuperAdmin] = useState(true)

  // Restaura la sesión guardada y revisa si hay que hacer el "primer arranque".
  useEffect(() => {
    (async () => {
      // Semilla del usuario master (idempotente: solo si no existe ya).
      try {
        if (!(await buscarPorEmail(MASTER.email))) {
          await crearConId('users', MASTER.id, MASTER.tenantId, {
            nombre: MASTER.nombre, email: MASTER.email, rol: BULK_ROLES.SUPER_ADMIN,
            passHash: MASTER.passHash, empresa: 'MyPay', activo: true,
          })
        }
      } catch { /* noop */ }
      try {
        const raw = localStorage.getItem(SESION_KEY)
        if (raw) {
          const { id } = JSON.parse(raw)
          const s = await getDoc(ref('users', id))
          if (s.exists() && s.data().activo !== false) setUsuario({ id: s.id, ...s.data() })
          else localStorage.removeItem(SESION_KEY)
        }
      } catch { /* noop */ }
      try {
        const sa = await getDocs(query(col('users'), where('rol', '==', BULK_ROLES.SUPER_ADMIN)))
        setExisteSuperAdmin(!sa.empty)
      } catch { setExisteSuperAdmin(true) }
      setCargando(false)
    })()
  }, [])

  const iniciarSesion = useCallback(async (email, password) => {
    const u = await buscarPorEmail(email)
    if (!u) throw new Error('Usuario no encontrado.')
    if (u.activo === false) throw new Error('Usuario inactivo.')
    const h = await hashPass(password)
    if (h !== u.passHash) throw new Error('Contraseña incorrecta.')
    localStorage.setItem(SESION_KEY, JSON.stringify({ id: u.id }))
    setUsuario(u)
    return u
  }, [])

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem(SESION_KEY)
    setUsuario(null)
  }, [])

  // Primer arranque: crea el Super Administrador y su tenant (empresa dueña).
  const crearSuperAdmin = useCallback(async ({ nombre, email, password, empresa }) => {
    const existente = await buscarPorEmail(email)
    if (existente) throw new Error('Ese correo ya está registrado.')
    const tenantId = `t_${Date.now().toString(36)}`
    const id = `u_${Date.now().toString(36)}`
    await crearConId('users', id, tenantId, {
      nombre, email: String(email).trim().toLowerCase(),
      rol: BULK_ROLES.SUPER_ADMIN, passHash: await hashPass(password),
      empresa: empresa || 'Mi empresa', activo: true,
    })
    setExisteSuperAdmin(true)
    localStorage.setItem(SESION_KEY, JSON.stringify({ id }))
    const u = await getDoc(ref('users', id))
    setUsuario({ id, ...u.data() })
  }, [])

  const value = {
    usuario, cargando, existeSuperAdmin,
    tenantId: usuario?.tenantId || null,
    rol: usuario?.rol || null,
    iniciarSesion, cerrarSesion, crearSuperAdmin, hashPass,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
