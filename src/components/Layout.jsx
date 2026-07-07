// Layout principal: sidebar navy con secciones gated por permiso, buscador
// global, badge de alertas y toggle de tema.
import { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { useData } from '../DataContext'
import { SECCIONES } from '../constants'
import InstallBanner from './InstallBanner'

function ThemeToggle() {
  const { oscuro, alternar } = useTheme()
  return (
    <button
      onClick={alternar}
      title={oscuro ? 'Cambiar a claro' : 'Cambiar a oscuro'}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
    >
      <span>{oscuro ? '☀️' : '🌙'}</span>
      <span>{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  )
}

// Buscador global de choferes y rutas.
function BuscadorGlobal({ onNavigate }) {
  const { drivers, facturaRango } = useData()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    const chof = (drivers || [])
      .filter((d) => (d.nombre || '').toLowerCase().includes(term))
      .slice(0, 5)
      .map((d) => ({ tipo: 'Chofer', nombre: d.nombre, link: '/choferes' }))
    const rutas = [...new Set((facturaRango?.resumenRutas || []).map((r) => r.ruta))]
      .filter((r) => r.toLowerCase().includes(term))
      .slice(0, 5)
      .map((r) => ({ tipo: 'Ruta', nombre: r, link: '/performance' }))
    return [...chof, ...rutas]
  }, [q, drivers, facturaRango])

  const ir = (r) => {
    setQ('')
    setAbierto(false)
    onNavigate?.()
    navigate(r.link)
  }

  return (
    <div className="relative mb-3">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        placeholder="🔎 Buscar chofer o ruta…"
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-brand-gold"
      />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {resultados.map((r, i) => (
            <button key={i} onClick={() => ir(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              <span>{r.nombre}</span>
              <span className="text-xs text-slate-400">{r.tipo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({ onNavigate }) {
  const { perfil, puede, cerrarSesion } = useAuth()
  const { numAlertas } = useData()
  const location = useLocation()
  const secciones = SECCIONES.filter((s) => puede(s.permiso))

  return (
    <aside className="flex min-h-screen w-60 flex-col gap-1 bg-brand-navy p-4 text-white">
      <div className="flex items-center gap-3 px-2 pb-3 pt-1">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold text-lg font-extrabold text-brand-navy">G</div>
        <div>
          <div className="text-lg font-extrabold leading-none">Gofo</div>
          <div className="text-[11px] text-slate-400">Gestión de facturas</div>
        </div>
      </div>

      <BuscadorGlobal onNavigate={onNavigate} />

      {secciones.map((s) => {
        const activo = location.pathname === s.path
        const esAlertas = s.path === '/alertas'
        return (
          <Link
            key={s.path}
            to={s.path}
            onClick={onNavigate}
            className={`group relative flex items-center gap-3 rounded-lg border-l-2 py-2.5 pl-3 pr-3 text-sm no-underline transition-all duration-150 ${
              activo
                ? 'border-brand-gold bg-brand-gold font-bold text-brand-navy'
                : 'border-transparent font-medium text-slate-300 hover:translate-x-0.5 hover:border-brand-gold/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="w-5 text-center">{s.icon}</span>
            <span className="flex-1">{s.label}</span>
            {esAlertas && numAlertas > 0 && (
              <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-bold ${activo ? 'bg-brand-navy text-white' : 'bg-rose-500 text-white'}`}>
                {numAlertas}
              </span>
            )}
          </Link>
        )
      })}

      <div className="mt-auto space-y-3 border-t border-white/10 pt-4 text-sm">
        <ThemeToggle />
        <div>
          <div className="font-semibold text-slate-200">{perfil?.nombre || 'Usuario'}</div>
          <div className="truncate text-xs text-slate-400">{perfil?.role || 'usuario'} · {perfil?.email}</div>
        </div>
        <button onClick={cerrarSesion} className="w-full rounded-lg border border-white/15 py-2 font-semibold text-white transition hover:bg-white/10">
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function Layout({ children }) {
  const { numAlertas } = useData()
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-brand-navy px-4 py-3 text-white md:hidden">
        <button onClick={() => setAbierto(true)} className="relative text-2xl leading-none" aria-label="Abrir menú">
          ☰
          {numAlertas > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />}
        </button>
        <span className="font-extrabold">Gofo</span>
        <button onClick={() => setAbierto(true)} className="ml-auto text-xl leading-none" aria-label="Buscar">🔎</button>
      </div>

      <div className="flex">
        <div className="sticky top-0 hidden h-screen md:block">
          <SidebarContent />
        </div>

        {abierto && (
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setAbierto(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <SidebarContent onNavigate={() => setAbierto(false)} />
            </div>
          </div>
        )}

        <main className="max-w-full flex-1 overflow-x-hidden p-4 sm:p-6">{children}</main>
      </div>

      <InstallBanner />
    </div>
  )
}
