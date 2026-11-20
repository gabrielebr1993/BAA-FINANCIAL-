// Layout principal: sidebar claro minimalista (estilo Mercury) con iconos Lucide,
// buscador global, badge de alertas, selector de empresa y toggle de tema.
import { useState, useMemo, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Building2, Sun, Moon, LogOut, Menu, Sparkles, Activity, ChevronDown, LayoutGrid, LayoutDashboard, Route, Wallet, AlertTriangle, MoreHorizontal, ArrowLeftRight } from 'lucide-react'
import { useCarrier, useCarriersPermitidos } from '../carriers/CarrierContext'
import { CARRIERS } from '../carriers'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { useData } from '../DataContext'
import { useLang, LangToggle } from '../i18n'
import { SECCIONES, GRUPOS_SECCIONES } from '../constants'
import CampanaAlertas from './CampanaAlertas'
import GlobalFilterBar from './GlobalFilterBar'
import MilePayMark from './MilePayMark'

function ThemeToggle() {
  const { oscuro, alternar } = useTheme()
  const { t } = useLang()
  return (
    <button
      onClick={alternar}
      title={oscuro ? t('Cambiar a claro') : t('Cambiar a oscuro')}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40"
    >
      {oscuro ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      <span>{oscuro ? t('Modo claro') : t('Modo oscuro')}</span>
    </button>
  )
}

function BuscadorGlobal({ onNavigate }) {
  const { t } = useLang()
  const { drivers, facturaRangoFull, claims } = useData()
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
    const rutas = [...new Set((facturaRangoFull?.resumenRutas || []).map((r) => r.ruta))].filter((r) => r.toLowerCase().includes(term)).slice(0, 5).map((r) => ({ tipo: 'Ruta', nombre: r, link: '/performance' }))
    // Trackings con claim que coinciden (de los claims cargados en el rango).
    const track = [...new Set((claims || []).map((c) => (c.waybill || '').trim()).filter(Boolean))]
      .filter((w) => w.toLowerCase().includes(term)).slice(0, 5)
      .map((w) => ({ tipo: 'Tracking', nombre: w, link: `/tracking/${encodeURIComponent(w)}` }))
    // Búsqueda directa por tracking exacto aunque no esté en el rango cargado.
    const directo = pareceTracking(raw) && !track.some((t) => t.nombre.toLowerCase() === term)
      ? [{ tipo: 'Tracking', nombre: raw, link: `/tracking/${encodeURIComponent(raw)}` }] : []
    return [...track, ...directo, ...chof, ...rutas]
  }, [q, drivers, facturaRangoFull, claims])

  const ir = (r) => { setQ(''); setAbierto(false); onNavigate?.(); navigate(r.link) }

  return (
    <div className="relative mb-4">
      <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        placeholder={t('Buscar…')}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-brand-gold focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-cardhover dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {resultados.map((r, i) => (
            <button key={i} onClick={() => ir(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
              <span>{r.nombre}</span>
              <span className="text-xs text-slate-400">{t(r.tipo)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CompanySwitcher() {
  const { esSuperAdmin } = useAuth()
  const { t } = useLang()
  const { companies, activeCompanyId, setActiveCompanyId, empresaActiva } = useData()
  if (esSuperAdmin && companies.length > 0) {
    return (
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400"><Building2 size={13} strokeWidth={1.8} /> {t('Empresa activa')}</div>
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
  const { t } = useLang()
  return (
    <Link
      to={s.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl border-l-2 py-2.5 pl-3 pr-3 text-sm no-underline transition-all duration-150 ${
        activo
          ? 'border-transparent bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white'
          : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'
      }`}
    >
      {Icon && <Icon size={19} strokeWidth={1.8} className="flex-shrink-0" />}
      <span className="flex-1">{t(s.label)}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{badge}</span>
      )}
    </Link>
  )
}

// Sección desplegable "IA": JARVIS (owner/súper-admin) + Panel de Control (súper-admin).
function MenuIA({ onNavigate, esSuperAdmin }) {
  const location = useLocation()
  const { t } = useLang()
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
          enIA ? 'border-transparent bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'
        }`}
      >
        <Sparkles size={19} strokeWidth={1.8} className="flex-shrink-0 text-slate-400" />
        <span className="flex-1 text-left">{t('IA')}</span>
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
  const { carrier, cambiarCarrier } = useCarrier() // compañía activa (Multi-Company)
  const carriersPermitidos = useCarriersPermitidos() // acceso por usuario
  const { numAlertas } = useData()
  const { t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()
  // Filtro por permiso + por compañía activa (secciones con `soloCarrier` solo
  // aparecen en su compañía: p. ej. «Cobros y fondo» en SpeedX, «Reclamos a
  // Gofo» en Gofo).
  const secciones = SECCIONES.filter((s) => puede(s.permiso) && (!s.soloCarrier || s.soloCarrier === (carrier || 'gofo')) && (!s.soloDueno || esSuperAdmin || perfil?.role === 'owner') && (!s.soloSuperAdmin || esSuperAdmin))
  const puedeIA = esSuperAdmin || perfil?.role === 'owner' || perfil?.role === 'admin'
  // Menú en ACORDEÓN: agrupa por `grupo` y abre solo el grupo activo.
  const porGrupo = useMemo(() => { const m = {}; for (const s of secciones) (m[s.grupo || 'Operación'] ||= []).push(s); return m }, [secciones])
  const grupoActivo = secciones.find((s) => s.path === location.pathname)?.grupo
  // Plegable MÚLTIPLE: varios grupos pueden quedar abiertos a la vez; abrir uno
  // no cierra los demás. Arranca con el grupo de la ruta activa abierto.
  const [grpAbierto, setGrpAbierto] = useState(() => new Set([grupoActivo || 'Operación']))
  useEffect(() => { if (grupoActivo) setGrpAbierto((s) => s.has(grupoActivo) ? s : new Set(s).add(grupoActivo)) }, [grupoActivo])

  return (
    <aside className="lg-glass-panel pt-safe relative z-10 flex h-screen w-64 flex-col gap-1 overflow-hidden p-4">
      <div className="flex items-center gap-3 px-1 pb-4 pt-1">
        <MilePayMark size={40} className="shrink-0 rounded-[10px] shadow-card ring-1 ring-black/5 dark:ring-white/10" />
        <div>
          <div className="font-display text-lg font-extrabold leading-none tracking-tight text-brand-navy dark:text-white">Mile<span className="text-brand-gold">Pay</span></div>
          <div className="text-[11px] text-slate-400">{t('Gestión de facturas')}</div>
        </div>
      </div>

      <BuscadorGlobal onNavigate={onNavigate} />
      <CompanySwitcher />

      <nav className="scroll-thin -mr-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2">
        {/* Inicio: siempre visible */}
        {(porGrupo['Inicio'] || []).map((s) => (
          <ItemMenu key={s.path} s={s} activo={location.pathname === s.path} onNavigate={onNavigate} badge={0} />
        ))}
        {/* IA (JARVIS) justo debajo de Inicio: es parte de la vista principal. */}
        {puedeIA && <MenuIA onNavigate={onNavigate} esSuperAdmin={esSuperAdmin} />}
        {/* Grupos plegables: solo el activo abierto */}
        {GRUPOS_SECCIONES.filter((g) => g !== 'Inicio' && (porGrupo[g] || []).length).map((g) => {
          const items = porGrupo[g]
          const abierto = grpAbierto.has(g)
          const badgeGrupo = !abierto && items.some((s) => s.path === '/alertas' && numAlertas > 0)
          return (
            <div key={g}>
              <button
                onClick={() => setGrpAbierto((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n })}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700/40 dark:hover:text-white"
              >
                <span className="flex-1 text-left">{t(g)}</span>
                {badgeGrupo && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
              </button>
              {abierto && (
                <div className="flex flex-col gap-0.5">
                  {items.map((s) => (
                    <ItemMenu key={s.path} s={s} activo={location.pathname === s.path} onNavigate={onNavigate} badge={s.path === '/alertas' ? numAlertas : 0} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700/60">
        {/* El botón de tema es w-full: va en un hijo flex-1 para que NO empuje
            al de idioma fuera del menú (el aside recorta lo que sobresale). */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><ThemeToggle /></div>
          <LangToggle className="shrink-0" />
        </div>
        <div>
          <div className="font-semibold text-slate-700 dark:text-slate-200">{perfil?.nombre || t('Usuario')}</div>
          <div className="truncate text-xs text-slate-400">{perfil?.role || 'usuario'} · {perfil?.email}</div>
        </div>
        {/* Multi-Company: volver al selector — solo si el usuario tiene acceso
            a más de una compañía (si solo tiene una, no hay nada que cambiar). */}
        {carriersPermitidos.length > 1 && (
          <button onClick={cambiarCarrier} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
            <ArrowLeftRight size={16} strokeWidth={1.8} /> {t('Compañía')}: {CARRIERS[carrier]?.nombre || 'Gofo'}
          </button>
        )}
        <button onClick={() => navigate('/elegir')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
          <LayoutGrid size={16} strokeWidth={1.8} /> {t('Cambiar módulo')}
        </button>
        <button onClick={cerrarSesion} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
          <LogOut size={16} strokeWidth={1.8} /> {t('Cerrar sesión')}
        </button>
      </div>
    </aside>
  )
}

// Barra de pestañas inferior (solo móvil, < sm) en LIQUID GLASS: vidrio flotante
// que deja ver el contenido por detrás. Al bajar se ENCOGE (solo íconos) y al
// subir vuelve a mostrar los nombres, como en las apps de Apple. Respeta la
// barra de inicio del iPhone (safe area) y en el iPhone Duo abierto se centra.
function TabBarMovil({ onMas }) {
  const { puede } = useAuth()
  const { numAlertas } = useData()
  const { t } = useLang()
  const location = useLocation()
  const [compacta, setCompacta] = useState(false)
  useEffect(() => {
    let ultimo = window.scrollY
    const alMover = () => {
      const y = window.scrollY
      if (Math.abs(y - ultimo) < 8) return
      setCompacta(y > ultimo && y > 120)
      ultimo = y
    }
    window.addEventListener('scroll', alMover, { passive: true })
    return () => window.removeEventListener('scroll', alMover)
  }, [])
  useEffect(() => { setCompacta(false) }, [location.pathname])
  const tabs = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permiso: 'verDashboard' },
    { path: '/rutas', label: 'Rutas', icon: Route, permiso: 'verDashboard' },
    { path: '/pagos', label: 'Pagos', icon: Wallet, permiso: 'verPagos' },
    { path: '/claims', label: 'Claims', icon: AlertTriangle, permiso: 'verClaims' },
  ].filter((x) => puede(x.permiso))
  return (
    <nav aria-label={t('Navegación principal')} className={`lg-glass lg-tabbar fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),10px)] z-20 mx-auto max-w-md rounded-pill sm:hidden ${compacta ? 'is-compact' : ''}`}>
      <div className="flex items-stretch justify-around px-1.5 py-1.5">
        {tabs.map((x) => {
          const on = location.pathname === x.path || location.pathname.startsWith(x.path + '/')
          const Icon = x.icon
          return (
            <Link key={x.path} to={x.path} aria-label={t(x.label)} className="lg-tab flex min-h-[48px] min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-pill no-underline">
              <span className={`grid h-8 w-12 place-items-center rounded-pill transition ${on ? 'lg-pill-on text-brand-gold dark:text-brand-navy' : 'text-slate-600 dark:text-slate-300'}`}>
                <Icon size={20} strokeWidth={on ? 2.1 : 1.8} />
              </span>
              <span className={`lg-tab-label overflow-hidden text-[10.5px] leading-none ${on ? 'font-bold text-brand-navy dark:text-white' : 'font-medium text-slate-600 dark:text-slate-300'}`}>{t(x.label)}</span>
            </Link>
          )
        })}
        <button type="button" onClick={onMas} aria-label={t('Más')} className="lg-tab relative flex min-h-[48px] min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-pill">
          <span className="grid h-8 w-12 place-items-center rounded-pill text-slate-600 dark:text-slate-300"><MoreHorizontal size={20} strokeWidth={1.8} /></span>
          <span className="lg-tab-label overflow-hidden text-[10.5px] font-medium leading-none text-slate-600 dark:text-slate-300">{t('Más')}</span>
          {numAlertas > 0 && <span className="absolute right-2.5 top-1 h-2 w-2 rounded-full bg-rose-500" />}
        </button>
      </div>
    </nav>
  )
}

export default function Layout({ children }) {
  const { t } = useLang()
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      <div className="flex">
        <div className="sticky top-0 hidden h-screen sm:block">
          <SidebarContent />
        </div>

        {abierto && (
          <div className="fixed inset-0 z-30 bg-slate-900/25 sm:hidden" onClick={() => setAbierto(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <SidebarContent onNavigate={() => setAbierto(false)} />
            </div>
          </div>
        )}

        <div className="cm-scope flex min-w-0 flex-1 flex-col">
          {/* Cloud Motion en TODAS las páginas del módulo (nunca en el menú
              lateral): nubes pastel muy suaves detrás del contenido. */}
          <div className="cm-nubes" aria-hidden="true"><span className="cm-n1" /><span className="cm-n2" /><span className="cm-n3" /></div>
          {/* Header global: fila superior (menú/campana) + barra de filtros fija
              (rango + ciudad) visible y editable desde cualquier página de datos. */}
          <header className="lg-glass-bar pt-safe sticky top-0 z-20">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => setAbierto(true)} className="text-brand-navy dark:text-white sm:hidden" aria-label={t('Abrir menú')}>
                <Menu size={24} strokeWidth={1.8} />
              </button>
              <span className="inline-flex items-center gap-2 sm:hidden">
                <MilePayMark size={30} className="rounded-[8px] ring-1 ring-black/5 dark:ring-white/10" />
                <span className="font-display text-[17px] font-extrabold tracking-tight text-brand-navy dark:text-white">Mile<span className="text-brand-gold">Pay</span></span>
              </span>
              <div className="ml-auto">
                <CampanaAlertas />
              </div>
            </div>
            <GlobalFilterBar />
          </header>

          <main className="max-w-full flex-1 overflow-x-hidden p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
      {/* Fuera de .cm-scope: ahí los hijos directos llevan position:relative. */}
      <TabBarMovil onMas={() => setAbierto(true)} />
    </div>
  )
}
