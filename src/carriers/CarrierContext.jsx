// ============================================================================
// MILE PAY · CONTEXTO DE COMPAÑÍA (carrier) + selector post-login.
//
// Tras iniciar sesión, el usuario elige con qué compañía trabaja (Gofo /
// SpeedX). La elección se recuerda por navegador (localStorage) y se puede
// cambiar desde el menú. Con GOFO, el sistema corre EXACTAMENTE igual que
// siempre (mismas rutas, mismas pantallas, cero cambios). Con SPEEDX se entra
// a su módulo propio (hoy: pantalla de preparación — su parser se construye
// tras analizar una factura real).
//
// Los CHOFERES (role=driver) no eligen: van directo a su portal (Gofo).
// ============================================================================
import { createContext, useContext, useState, useCallback } from 'react'
import { FileText, Zap, ArrowLeftRight, LogOut, ArrowRight, Package } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { CARRIERS, listaCarriers } from './index'
import { useLang, LangToggle } from '../i18n'

const LS_KEY = 'mp_carrier'
const CarrierContext = createContext({ carrier: null, setCarrier: () => {}, cambiarCarrier: () => {} })
export const useCarrier = () => useContext(CarrierContext)

export function CarrierProvider({ children }) {
  const [carrier, setCarrierEstado] = useState(() => {
    try { const v = localStorage.getItem(LS_KEY); return CARRIERS[v] ? v : null } catch { return null }
  })
  const setCarrier = useCallback((id) => {
    if (!CARRIERS[id]) return
    try { localStorage.setItem(LS_KEY, id) } catch { /* noop */ }
    setCarrierEstado(id)
  }, [])
  // Volver al selector (cambiar de compañía desde el menú).
  const cambiarCarrier = useCallback(() => {
    try { localStorage.removeItem(LS_KEY) } catch { /* noop */ }
    setCarrierEstado(null)
  }, [])
  return <CarrierContext.Provider value={{ carrier, setCarrier, cambiarCarrier }}>{children}</CarrierContext.Provider>
}

// ── Pantalla: Login → SELECCIONA COMPAÑÍA → módulo ──────────────────────────
// Pantalla COMPLETA (de punta a punta): un panel gigante por compañía, con
// paquetes/camiones decorativos de fondo y su color de marca. En escritorio
// los paneles van lado a lado; en el teléfono, apilados a toda altura.
// Caja de cartón REALISTA (isométrica, con cinta y etiqueta) para el fondo.
function Caja({ size = 100, opacity = 1, flip = false, style }) {
  return (
    <svg viewBox="0 0 100 104" width={size} height={size * 1.04} style={{ opacity, transform: flip ? 'scaleX(-1)' : undefined, ...style }} aria-hidden="true">
      {/* tapa */}
      <polygon points="50,6 93,29 50,52 7,29" fill="#c9a273" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      {/* solapa marcada en la tapa */}
      <polygon points="50,6 93,29 50,52" fill="#000" opacity="0.05" />
      {/* cara izquierda */}
      <polygon points="7,29 50,52 50,100 7,77" fill="#a87f4f" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      {/* cara derecha (más oscura) */}
      <polygon points="93,29 50,52 50,100 93,77" fill="#8a663c" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      {/* cinta de embalar: cruza la tapa y baja por la arista frontal */}
      <polygon points="45.5,8.5 54.5,8.5 54.5,49.5 45.5,49.5" fill="#e8dcc0" opacity="0.9" />
      <polygon points="45.5,50 54.5,50 54.5,74 45.5,74" fill="#e8dcc0" opacity="0.55" />
      {/* etiqueta de envío en la cara izquierda */}
      <polygon points="15,44 34,54 34,70 15,60" fill="#f4efe3" stroke="#6e5432" strokeWidth="0.5" />
      <line x1="18" y1="50.5" x2="31" y2="57.5" stroke="#8a8172" strokeWidth="1.4" />
      <line x1="18" y1="54" x2="28" y2="59.4" stroke="#b3aa99" strokeWidth="1.1" />
      {/* código de barras en la cara derecha */}
      <g opacity="0.6">
        {[60, 63, 65.5, 69, 71.5, 75].map((x, i) => (
          <line key={i} x1={x} y1={62 - (x - 60) * 0.53} x2={x} y2={74 - (x - 60) * 0.53} stroke="#4c3a20" strokeWidth={i % 2 ? 1 : 1.8} />
        ))}
      </g>
    </svg>
  )
}
// Cajas flotando al fondo del panel (posición, tamaño, opacidad, retardo).
const CAJAS = [
  { l: '6%', t: '12%', s: 84, o: 0.16, d: 0.4, flip: false },
  { l: '82%', t: '10%', s: 64, o: 0.13, d: 1.6, flip: true },
  { l: '13%', t: '48%', s: 56, o: 0.12, d: 2.3, flip: false },
  { l: '86%', t: '44%', s: 48, o: 0.11, d: 0.9, flip: false },
]
// Pila de cajas "en el piso" del panel (recortada por el borde inferior).
const PILA = [
  { l: '-3%', b: -34, s: 150, o: 0.32, flip: false },
  { l: '13%', b: -50, s: 180, o: 0.38, flip: true },
  { l: '34%', b: -30, s: 130, o: 0.3, flip: false },
  { l: '55%', b: -54, s: 195, o: 0.4, flip: false },
  { l: '76%', b: -36, s: 155, o: 0.33, flip: true },
]
// El nombre tratado como LOGOTIPO (hasta tener los archivos oficiales).
function NombreLogo({ c }) {
  if (c.id === 'gofo') {
    return <span className="bg-gradient-to-b from-[#f2d896] via-[#dcb964] to-[#b8903f] bg-clip-text text-5xl font-black tracking-tight text-transparent md:text-7xl">GOFO</span>
  }
  if (c.id === 'speedx') {
    return <span className="text-5xl font-black italic tracking-tight md:text-7xl">Speed<span className="text-[#8fb1f5]">X</span></span>
  }
  return <span className="text-4xl font-black tracking-tight md:text-6xl">{c.nombre}</span>
}
function SelectorCompania() {
  const { t } = useLang()
  const { user, perfil, cerrarSesion } = useAuth()
  const { setCarrier } = useCarrier()
  const nombre = perfil?.nombre || user?.email || ''
  const ICONO = { gofo: FileText, speedx: Zap }
  const carriers = listaCarriers()
  return (
    <div
      className="flex min-h-screen w-full flex-col bg-[#0d1526] text-white"
      style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
    >
      {/* Animación de flotado de los paquetes decorativos */}
      <style>{'@keyframes mpflot{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}'}</style>
      {/* Barra superior */}
      <header className="flex items-center justify-between px-5 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy shadow-lg ring-1 ring-white/10">
            <Package size={20} strokeWidth={1.9} className="text-brand-gold" />
          </div>
          <div>
            <div className="text-lg font-extrabold leading-none">MilePay</div>
            <div className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-white/40">{t('GESTIÓN DE FACTURAS DE REPARTO')}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle />
          <button onClick={cerrarSesion} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
            <LogOut size={15} strokeWidth={1.9} /> {t('Salir')}
          </button>
        </div>
      </header>

      {/* Saludo + título */}
      <div className="px-6 pb-6 pt-2 text-center md:pb-8">
        <div className="text-sm font-semibold text-brand-gold">{t('Hola')}{nombre ? `, ${String(nombre).split(' ')[0]}` : ''} 👋</div>
        <h1 className="mt-1 text-3xl font-black leading-tight md:text-5xl">{t('¿Con qué compañía quieres trabajar hoy?')}</h1>
        <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-brand-gold/80" />
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/50 md:text-base">{t('Cada compañía tiene sus propias facturas, choferes, tarifas y ciudades — nada se mezcla.')}</p>
      </div>

      {/* Paneles gigantes, de punta a punta */}
      <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-2">
        {carriers.map((c, idx) => {
          const Icon = ICONO[c.id] || Package
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCarrier(c.id)}
              className={`group relative flex min-h-[38vh] flex-col items-center justify-center overflow-hidden px-8 py-12 text-center transition-all duration-300 hover:brightness-125 md:min-h-0 ${idx > 0 ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}
            >
              {/* Fondo con el color de la compañía (el halo crece al pasar el mouse) */}
              <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{ background: `radial-gradient(120% 90% at 50% 115%, ${c.color}66, transparent 62%), linear-gradient(165deg, #131f38 0%, #0d1526 70%)` }}
              />
              <div
                className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: `radial-gradient(130% 100% at 50% 115%, ${c.color}99, transparent 65%)`, boxShadow: `inset 0 0 0 3px ${c.color}55` }}
              />
              {/* Cajas de cartón flotando suave */}
              {CAJAS.map((d, i) => (
                <div key={i} className="pointer-events-none absolute" style={{ left: d.l, top: d.t, animation: `mpflot ${8 + i}s ease-in-out ${d.d}s infinite` }}>
                  <Caja size={d.s} opacity={d.o} flip={d.flip} />
                </div>
              ))}
              {/* Pila de paquetes en el piso del panel */}
              {PILA.map((d, i) => (
                <div key={`p${i}`} className="pointer-events-none absolute transition-transform duration-700 group-hover:-translate-y-1.5" style={{ left: d.l, bottom: d.b }}>
                  <Caja size={d.s} opacity={d.o} flip={d.flip} />
                </div>
              ))}
              {/* Sombra del piso para asentar las cajas */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
              {/* Contenido */}
              <div className="relative z-10 flex flex-col items-center gap-4 md:gap-5">
                <span
                  className="grid h-20 w-20 place-items-center rounded-3xl text-white ring-1 ring-white/25 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110 md:h-24 md:w-24"
                  style={{ background: `linear-gradient(160deg, ${c.color}, ${c.color}cc)`, boxShadow: `0 18px 50px -12px ${c.color}aa` }}
                >
                  <Icon size={40} strokeWidth={1.8} />
                </span>
                <div className="flex items-center gap-3">
                  <NombreLogo c={c} />
                  {!c.listo && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">{t('En preparación')}</span>}
                </div>
                <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-base font-bold text-[#0d1526] shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:gap-3.5 group-hover:shadow-2xl">
                  {t('Entrar')} <ArrowRight size={17} strokeWidth={2.2} />
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <p className="px-6 py-4 text-center text-[11px] text-white/35">{t('Podrás cambiar de compañía en cualquier momento desde el menú.')}</p>
    </div>
  )
}

// ── Módulo EN PREPARACIÓN (carrier declarado pero sin parser listo) ─────────
function CarrierEnPreparacion({ id }) {
  const { t } = useLang()
  const { cambiarCarrier } = useCarrier()
  const { cerrarSesion } = useAuth()
  const c = CARRIERS[id] || {}
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-surface-dark">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-white shadow-sm" style={{ background: c.color || '#334155' }}>
          <Zap size={30} strokeWidth={1.9} />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-brand-navy dark:text-slate-100">MilePay · {c.nombre || id}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {t('Este módulo está en preparación: su estructura de facturas se define analizando un archivo real (no se inventa nada).')}
        </p>
        <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
          <button onClick={cambiarCarrier} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90">
            <ArrowLeftRight size={16} /> {t('Cambiar de compañía')}
          </button>
          <button onClick={cerrarSesion} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-slate-600">
            <LogOut size={15} /> {t('Salir')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Puerta: decide qué se pinta según sesión + compañía elegida ─────────────
// Sin sesión → children (el Login aparece como siempre vía ProtectedRoute).
// Chofer → children (su portal es de Gofo; no elige compañía).
// Sin compañía elegida → selector. Carrier no listo → pantalla de preparación.
// Compañía LISTA (Gofo o SpeedX) → las MISMAS rutas/pantallas de siempre: el
// aislamiento y el algoritmo cambian por debajo (DataContext + parsers).
export function CarrierGate({ children }) {
  const { user, cargando, esDriver } = useAuth()
  const { carrier } = useCarrier()
  if (cargando || !user || esDriver) return children
  if (!carrier) return <SelectorCompania />
  if (!CARRIERS[carrier]?.listo) return <CarrierEnPreparacion id={carrier} />
  return children
}
