import { Lock } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Spinner } from './components/ui'
import Login from './Login'

export default function ProtectedRoute({ filtro, soloSuperAdmin, children }) {
  const { user, cargando, puede, esSuperAdmin } = useAuth()
  if (cargando)
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-surface-light text-slate-500 dark:bg-surface-dark dark:text-slate-400">
        <Spinner tamano="h-6 w-6" className="text-brand-gold" /> Cargando…
      </div>
    )
  if (!user) return <Login />
  if (soloSuperAdmin && !esSuperAdmin)
    return (
      <div className="grid min-h-screen place-items-center bg-surface-light p-6 text-center text-brand-navy dark:bg-surface-dark dark:text-slate-100">
        <div>
          <Lock size={40} strokeWidth={1.5} className="mx-auto text-brand-gold" />
          <h3 className="mt-2 text-lg font-bold">Sección solo para súper-administradores</h3>
        </div>
      </div>
    )
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
