import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid))
        setPerfil(snap.exists() ? snap.data() : null)
      } else {
        setPerfil(null)
      }
      setCargando(false)
    })
    return unsub
  }, [])

  const puede = (filtro) => {
    if (!perfil) return false
    if (perfil.role === 'owner') return true
    return perfil.permissions?.[filtro] === true
  }

  const cerrarSesion = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, perfil, cargando, puede, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}
