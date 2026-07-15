import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

// Correos con acceso de súper-admin (bootstrap), configurables por variable de
// entorno VITE_SUPERADMIN_EMAILS (separados por coma). Evita hardcodear correos.
const SUPERADMIN_EMAILS = (import.meta.env.VITE_SUPERADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid))
          setPerfil(snap.exists() ? snap.data() : null)
        } catch {
          setPerfil(null)
        }
      } else {
        setPerfil(null)
      }
      setCargando(false)
    })
    return unsub
  }, [])

  // Súper-admin: por flag en el perfil o por correo en la lista de entorno.
  const esSuperAdmin =
    perfil?.superAdmin === true || (user?.email ? SUPERADMIN_EMAILS.includes(user.email.toLowerCase()) : false)

  // Empresa a la que pertenece el usuario (null para súper-admin sin empresa).
  const companyId = perfil?.companyId || null

  // Rol chofer: acceso muy limitado (solo su portal). Vinculado a un driver.
  const esDriver = perfil?.role === 'driver'
  const driverId = perfil?.driverId || null
  const driverNombre = perfil?.driverNombre || ''
  const driverKey = perfil?.driverKey || (driverNombre ? driverNombre.trim().toLowerCase() : '')

  // Ciudades asignadas al usuario (una o varias). Si tiene al menos una y NO es
  // dueño/súper-admin, su vista queda BLOQUEADA a ESAS ciudades. Se lee `ciudades`
  // (arreglo, modelo nuevo) con respaldo a `ciudad` (una sola, modelo antiguo).
  const ciudadesUsuario = (Array.isArray(perfil?.ciudades) && perfil.ciudades.length)
    ? perfil.ciudades.filter(Boolean)
    : (perfil?.ciudad ? [perfil.ciudad] : [])
  const ciudadUsuario = ciudadesUsuario[0] || '' // compatibilidad (primera ciudad)
  const ciudadBloqueada = !esSuperAdmin && perfil?.role !== 'owner' && ciudadesUsuario.length > 0

  const puede = (filtro) => {
    // El chofer NUNCA tiene permiso sobre las secciones normales del sistema.
    if (esDriver) return false
    if (esSuperAdmin) return true
    if (!perfil) return false
    if (perfil.role === 'owner') return true
    return perfil.permissions?.[filtro] === true
  }

  const cerrarSesion = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, perfil, cargando, companyId, esSuperAdmin, esDriver, driverId, driverNombre, driverKey, ciudadUsuario, ciudadesUsuario, ciudadBloqueada, puede, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}
