// Layout principal: sidebar claro minimalista (estilo Mercury) con iconos Lucide,
// buscador global, badge de alertas, selector de empresa y toggle de tema.
import { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Building2, Sun, Moon, LogOut, Menu, Sparkles, Activity, ChevronDown } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { useData } from '../DataContext'
import { SECCIONES } from '../constants'
import CampanaAlertas from './CampanaAlertas'
import GlobalFilterBar from './GlobalFilterBar'

function ThemeToggle() {
  const { oscuro, alternar } = useTheme()
  return (
    <button
      onClick={alternar}
      title={oscuro ? 'Cambiar a claro' : 'Cambiar a oscuro'}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40"
    >
      {oscuro ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      <span>{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  )
}

function BuscadorGlobal({ onNavigate }) {
  const { drivers, facturaRango, claims } = useData()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)

  // Un texto parece un tracking si empieza por GFUS/CR o es un código largo alfanumérico.
  const pareceTracking = (t) => /^(gfus|cr)/i.test(t) || /^[a-z0-9]{10,}$/i.test(t)

  const resultados = useMemo(() => {
    const raw = q.trim()
    const term = raw.toLowerCase()
    if (!term) return []
    const chof = (drivers || []).filter((d) => (d.nombre || '').toLowerCase().includes(term)).slice(0, 5).map((d) => ({ tipo: 'Chofer', nombre: d.nombre, link: `/choferes/${encodeURIComponent(d.nombre)}` }))
    const rutas = [...new Set((facturaRango?.resumenRutas || []).map((r) => r.ruta))].filter((r) => r.toLowerCase().includes(term)).slice(0, 5).map((r) => ({ tipo: 'Ruta', nombre: r, link: '/performance' }))
    // Trackings con claim que coinciden (de los claims cargados en el rango).
    const track = [...new Set((claims || []).map((c) => (c.waybill || '').trim()).filter(Boolean))]
      .filter((w) => w.toLowerCase().includes(term)).slice(0, 5)
      .map((w) => ({ tipo: 'Tracking', nombre: w, link: `/tracking/${encodeURIComponent(w)}` }))
    // Búsqueda directa por tracking exacto aunque no esté en el rango cargado.
    const directo = pareceTracking(raw) && !track.some((t) => t.nombre.toLowerCase() === term)
      ? [{ tipo: 'Tracking', nombre: raw, link: `/tracking/${encodeURIComponent(raw)}` }] : []
    return [...track, ...directo, ...chof, ...rutas]
  }, [q, drivers, facturaRango, claims])

  const ir = (r) => { setQ(''); setAbierto(false); onNavigate?.(); navigate(r.link) }

  return (
    <div className="relative mb-4">
      <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar…"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-brand-gold focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-cardhover dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {resultados.map((r, i) => (
            <button key={i} onClick={() => ir(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
              <span>{r.nombre}</span>
              <span className="text-xs text-slate-400">{r.tipo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CompanySwitcher() {
  const { esSuperAdmin } = useAuth()
  const { companies, activeCompanyId, setActiveCompanyId, empresaActiva } = useData()
  if (esSuperAdmin && companies.length > 0) {
    return (
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400"><Building2 size={13} strokeWidth={1.8} /> Empresa activa</div>
        <select value={activeCompanyId || ''} onChange={(e) => setActiveCompanyId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {companies.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
        </select>
      </div>
    )
  }
  if (empresaActiva) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Building2 size={14} strokeWidth={1.8} /> {empresaActiva.nombre}
      </div>
    )
  }
  return null
}

function ItemMenu({ s, activo, onNavigate, badge }) {
  const Icon = s.icon
  return (
    <Link
      to={s.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl border-l-2 py-2.5 pl-3 pr-3 text-sm no-underline transition-all duration-150 ${
        activo
          ? 'border-brand-gold bg-brand-gold/10 font-semibold text-brand-navy dark:bg-brand-gold/15 dark:text-white'
          : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'
      }`}
    >
      {Icon && <Icon size={19} strokeWidth={1.8} className="flex-shrink-0" />}
      <span className="flex-1">{s.label}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{badge}</span>
      )}
    </Link>
  )
}

// Sección desplegable "IA": JARVIS (owner/súper-admin) + Panel de Control (súper-admin).
function MenuIA({ onNavigate, esSuperAdmin }) {
  const location = useLocation()
  const enIA = location.pathname.startsWith('/ia')
  const [abierto, setAbierto] = useState(enIA)
  const subs = [
    { path: '/ia/jarvis', label: 'JARVIS', icon: Sparkles, show: true },
    { path: '/ia/panel', label: 'Panel de Control', icon: Activity, show: esSuperAdmin },
  ].filter((s) => s.show)
  return (
    <div>
      <button
        onClick={() => setAbierto((o) => !o)}
        className={`group flex w-full items-center gap-3 rounded-xl border-l-2 py-2.5 pl-3 pr-3 text-sm transition-all duration-150 ${
          enIA ? 'border-brand-gold bg-brand-gold/10 font-semibold text-brand-navy dark:bg-brand-gold/15 dark:text-white' : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'
        }`}
      >
        <Sparkles size={19} strokeWidth={1.8} className="flex-shrink-0 text-brand-gold" />
        <span className="flex-1 text-left">IA</span>
        <ChevronDown size={16} strokeWidth={2} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-slate-200 pl-2 dark:border-slate-700/60">
          {subs.map((s) => (
            <ItemMenu key={s.path} s={s} activo={location.pathname === s.path} onNavigate={onNavigate} badge={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({ onNavigate }) {
  const { perfil, puede, cerrarSesion, esSuperAdmin } = useAuth()
  const { numAlertas } = useData()
  const location = useLocation()
  const secciones = SECCIONES.filter((s) => puede(s.permiso))
  const puedeIA = esSuperAdmin || perfil?.role === 'owner'

  return (
    <aside className="flex h-screen w-64 flex-col gap-1 overflow-hidden border-r border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-surface-dark-card">
      <div className="flex items-center gap-3 px-1 pb-4 pt-1">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
        <div>
          <div className="text-lg font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
          <div className="text-[11px] text-slate-400">Gestión de facturas</div>
        </div>
      </div>

      <BuscadorGlobal onNavigate={onNavigate} />
      <CompanySwitcher />

      <nav className="scroll-thin -mr-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2">
        {secciones.map((s) => (
          <ItemMenu key={s.path} s={s} activo={location.pathname === s.path} onNavigate={onNavigate} badge={s.path === '/alertas' ? numAlertas : 0} />
        ))}
        {puedeIA && <MenuIA onNavigate={onNavigate} esSuperAdmin={esSuperAdmin} />}
        {esSuperAdmin && (
          <ItemMenu s={{ path: '/empresas', label: 'Empresas', icon: Building2 }} activo={location.pathname === '/empresas'} onNavigate={onNavigate} badge={0} />
        )}
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700/60">
        <ThemeToggle />
        <div>
          <div className="font-semibold text-slate-700 dark:text-slate-200">{perfil?.nombre || 'Usuario'}</div>
          <div className="truncate text-xs text-slate-400">{perfil?.role || 'usuario'} · {perfil?.email}</div>
        </div>
        <button onClick={cerrarSesion} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
          <LogOut size={16} strokeWidth={1.8} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function Layout({ children }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      <div className="flex">
        <div className="sticky top-0 hidden h-screen sm:block">
          <SidebarContent />
        </div>

        {abierto && (
          <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={() => setAbierto(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <SidebarContent onNavigate={() => setAbierto(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header global: fila superior (menú/campana) + barra de filtros fija
              (rango + ciudad) visible y editable desde cualquier página de datos. */}
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/90">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => setAbierto(true)} className="text-brand-navy dark:text-white sm:hidden" aria-label="Abrir menú">
                <Menu size={24} strokeWidth={1.8} />
              </button>
              <span className="font-extrabold text-brand-navy dark:text-white sm:hidden">MilePay</span>
              <div className="ml-auto">
                <CampanaAlertas />
              </div>
            </div>
            <GlobalFilterBar />
          </header>

          <main className="max-w-full flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
