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

  const puede = (filtro) => {
    if (esSuperAdmin) return true
    if (!perfil) return false
    if (perfil.role === 'owner') return true
    return perfil.permissions?.[filtro] === true
  }

  const cerrarSesion = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, perfil, cargando, companyId, esSuperAdmin, puede, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}
