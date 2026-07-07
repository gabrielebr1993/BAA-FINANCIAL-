import { useAuth } from './AuthContext'
import { COLORS } from './constants'
import { Spinner } from './components/ui'
import Login from './Login'

export default function ProtectedRoute({ filtro, children }) {
  const { user, cargando, puede } = useAuth()
  if (cargando)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: COLORS.muted, fontFamily: 'system-ui' }}>
        <Spinner size={26} color={COLORS.navy} grosor={3} /> Cargando…
      </div>
    )
  if (!user) return <Login />
  if (filtro && !puede(filtro))
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', color: COLORS.navy, textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h3>No tienes acceso a esta sección</h3>
          <p style={{ color: COLORS.muted }}>Pide a un administrador que te asigne el permiso correspondiente.</p>
        </div>
      </div>
    )
  return children
}
