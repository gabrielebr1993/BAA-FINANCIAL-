// Layout principal: sidebar navy con secciones gated por permiso + toggle de tema.
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { SECCIONES } from '../constants'

function ThemeToggle({ compact }) {
  const { oscuro, alternar } = useTheme()
  return (
    <button
      onClick={alternar}
      title={oscuro ? 'Cambiar a claro' : 'Cambiar a oscuro'}
      className={`inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 ${compact ? '' : 'w-full justify-center'}`}
    >
      <span>{oscuro ? '☀️' : '🌙'}</span>
      {!compact && <span>{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  )
}

function SidebarContent({ onNavigate }) {
  const { perfil, puede, cerrarSesion } = useAuth()
  const location = useLocation()
  const secciones = SECCIONES.filter((s) => puede(s.permiso))

  return (
    <aside className="flex min-h-screen w-60 flex-col gap-1 bg-brand-navy p-4 text-white">
      <div className="flex items-center gap-3 px-2 pb-4 pt-1">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold text-lg font-extrabold text-brand-navy">G</div>
        <div>
          <div className="text-lg font-extrabold leading-none">Gofo</div>
          <div className="text-[11px] text-slate-400">Gestión de facturas</div>
        </div>
      </div>

      {secciones.map((s) => {
        const activo = location.pathname === s.path
        return (
          <Link
            key={s.path}
            to={s.path}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm no-underline transition ${
              activo ? 'bg-brand-gold font-bold text-brand-navy' : 'font-medium text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="w-5 text-center">{s.icon}</span>
            {s.label}
          </Link>
        )
      })}

      <div className="mt-auto space-y-3 border-t border-white/10 pt-4 text-sm">
        <ThemeToggle />
        <div>
          <div className="font-semibold text-slate-200">{perfil?.nombre || 'Usuario'}</div>
          <div className="truncate text-xs text-slate-400">
            {perfil?.role || 'usuario'} · {perfil?.email}
          </div>
        </div>
        <button
          onClick={cerrarSesion}
          className="w-full rounded-lg border border-white/15 py-2 font-semibold text-white transition hover:bg-white/10"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function Layout({ children }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      {/* barra superior móvil */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-brand-navy px-4 py-2.5 text-white md:hidden">
        <button onClick={() => setAbierto(true)} className="text-2xl leading-none">☰</button>
        <span className="font-extrabold">Gofo</span>
      </div>

      <div className="flex">
        {/* sidebar escritorio */}
        <div className="sticky top-0 hidden h-screen md:block">
          <SidebarContent />
        </div>

        {/* drawer móvil */}
        {abierto && (
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setAbierto(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <SidebarContent onNavigate={() => setAbierto(false)} />
            </div>
          </div>
        )}

        <main className="max-w-full flex-1 overflow-x-hidden p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
