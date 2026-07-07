import { useAuth } from './AuthContext'
import Login from './Login'

export default function ProtectedRoute({ filtro, children }) {
  const { user, cargando, puede } = useAuth()
  if (cargando) return <p style={{ padding: 40 }}>Cargando…</p>
  if (!user) return <Login />
  if (filtro && !puede(filtro)) return <p style={{ padding: 40 }}>No tienes acceso a esta sección.</p>
  return children
}
