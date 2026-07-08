import { Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Spinner } from './components/ui'
import Login from './Login'

// `soloDriver` marca la ruta del Portal del chofer. El resto de rutas están
// vedadas para el rol driver: si un chofer intenta entrar por URL a cualquier
// sección normal, se le redirige a su portal (no ve ni carga nada más).
export default function ProtectedRoute({ filtro, soloSuperAdmin, soloDriver, children }) {
  const { user, cargando, puede, esSuperAdmin, esDriver } = useAuth()
  if (cargando)
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-surface-light text-slate-500 dark:bg-surface-dark dark:text-slate-400">
        <Spinner tamano="h-6 w-6" className="text-brand-gold" /> Cargando…
      </div>
    )
  if (!user) return <Login />

  // Blindaje del rol driver: solo su portal; cualquier otra ruta -> /portal.
  if (esDriver && !soloDriver) return <Navigate to="/portal" replace />
  // Un no-chofer no necesita el portal del chofer -> al inicio.
  if (soloDriver && !esDriver) return <Navigate to="/" replace />
  // Sección solo para súper-admin (ej. /empresas): un owner/manager NO puede
  // entrar ni por URL; se le redirige a su dashboard sin ver ni cargar nada.
  if (soloSuperAdmin && !esSuperAdmin) return <Navigate to="/" replace />
  if (filtro && !puede(filtro))
    return (
      <div className="grid min-h-screen place-items-center bg-surface-light p-6 text-center text-brand-navy dark:bg-surface-dark dark:text-slate-100">
        <div>
          <Lock size={40} strokeWidth={1.5} className="mx-auto text-brand-gold" />
          <h3 className="mt-2 text-lg font-bold">No tienes acceso a esta sección</h3>
          <p className="text-slate-500 dark:text-slate-400">Pide a un administrador que te asigne el permiso correspondiente.</p>
        </div>
      </div>
    )
  return children
}
