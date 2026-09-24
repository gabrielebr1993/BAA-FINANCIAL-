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
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { Zap, ArrowLeftRight, LogOut, ArrowRight } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { CARRIERS, listaCarriers } from './index'
import { useLang, LangToggle } from '../i18n'

// Compañías PERMITIDAS para el usuario actual (igual que las ciudades por
// usuario): en su ficha (users/{uid}) el campo `carriers` = ['gofo','speedx'].
// Vacío o ausente = TODAS (compatibilidad total con los usuarios existentes).
// El dueño y el súper-admin siempre ven todas.
export function useCarriersPermitidos() {
  const { perfil, esSuperAdmin } = useAuth()
  const libre = esSuperAdmin || perfil?.role === 'owner'
  const clave = (Array.isArray(perfil?.carriers) ? perfil.carriers : []).join('|')
  return useMemo(() => {
    const lista = clave.split('|').filter((c) => CARRIERS[c])
    return !libre && lista.length ? lista : Object.keys(CARRIERS)
  }, [clave, libre])
}

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
// Estilo "foto real": un almacén lleno de cajas de cartón (escena con luz
// cálida y desenfoque fotográfico) y, al centro, una tarjeta de VIDRIO
// esmerilado con las dos compañías como tarjetas blancas de logo + «Entrar».
function Caja({ size = 100, opacity = 1, flip = false, style }) {
  return (
    <svg viewBox="0 0 100 104" width={size} height={size * 1.04} style={{ opacity, transform: flip ? 'scaleX(-1)' : undefined, ...style }} aria-hidden="true">
      {/* tapa */}
      <polygon points="50,6 93,29 50,52 7,29" fill="#c9a273" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points="50,6 93,29 50,52" fill="#000" opacity="0.05" />
      {/* caras */}
      <polygon points="7,29 50,52 50,100 7,77" fill="#a87f4f" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points="93,29 50,52 50,100 93,77" fill="#8a663c" stroke="#6e5432" strokeWidth="0.8" strokeLinejoin="round" />
      {/* cinta de embalar */}
      <polygon points="45.5,8.5 54.5,8.5 54.5,49.5 45.5,49.5" fill="#e8dcc0" opacity="0.9" />
      <polygon points="45.5,50 54.5,50 54.5,74 45.5,74" fill="#e8dcc0" opacity="0.55" />
      {/* etiqueta de envío */}
      <polygon points="15,44 34,54 34,70 15,60" fill="#f4efe3" stroke="#6e5432" strokeWidth="0.5" />
      <line x1="18" y1="50.5" x2="31" y2="57.5" stroke="#8a8172" strokeWidth="1.4" />
      <line x1="18" y1="54" x2="28" y2="59.4" stroke="#b3aa99" strokeWidth="1.1" />
      {/* código de barras */}
      <g opacity="0.6">
        {[60, 63, 65.5, 69, 71.5, 75].map((x, i) => (
          <line key={i} x1={x} y1={62 - (x - 60) * 0.53} x2={x} y2={74 - (x - 60) * 0.53} stroke="#4c3a20" strokeWidth={i % 2 ? 1 : 1.8} />
        ))}
      </g>
    </svg>
  )
}

// Marca de cada compañía RECREADA fiel a la real (GOFO rojo en cursiva ·
// SpeedX "Speed" negro + "X" azul). Cuando lleguen los archivos oficiales,
// solo hay que cambiar este componente por las imágenes.
function LogoMarca({ id, nombre }) {
  if (id === 'gofo') {
    return (
      <svg viewBox="0 0 180 44" className="h-9 w-auto md:h-11" aria-label="GOFO">
        <text x="90" y="34" textAnchor="middle" fontFamily="Inter, 'Arial Black', sans-serif" fontStyle="italic" fontWeight="900" fontSize="37" letterSpacing="1" fill="#E8391D">GOFO</text>
      </svg>
    )
  }
  if (id === 'speedx') {
    return (
      <svg viewBox="0 0 190 44" className="h-9 w-auto md:h-11" aria-label="SpeedX">
        <text x="95" y="33" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="33">
          <tspan fill="#101418">Speed</tspan><tspan fill="#2F80ED" fontWeight="900">X</tspan>
        </text>
      </svg>
    )
  }
  return <span className="text-2xl font-black text-slate-800">{nombre}</span>
}

// Pared de cajas del "almacén" (tres filas con profundidad; el desenfoque de
// abajo la hace ver fotográfica detrás del vidrio).
const FILAS_ALMACEN = [
  { top: '2%', size: 150, brillo: 0.5, n: 8 },
  { top: '24%', size: 205, brillo: 0.68, n: 7 },
  { top: '50%', size: 270, brillo: 0.88, n: 6 },
]
function FondoAlmacen() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(170deg, #46362a 0%, #2c2015 55%, #17100a 100%)' }} />
      {/* luz cálida entrando por arriba a la izquierda */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 55% at 22% 0%, rgba(255,206,134,0.35), transparent 60%)' }} />
      {/* pared de cajas con leve desenfoque fotográfico y deriva de cámara */}
      <div className="mp-anim absolute -inset-10" style={{ filter: 'blur(3px) saturate(1.05)', animation: 'mppan 70s ease-in-out infinite alternate' }}>
        {FILAS_ALMACEN.map((f, fi) => (
          <div key={fi} className="absolute inset-x-0" style={{ top: f.top, filter: `brightness(${f.brillo})` }}>
            {Array.from({ length: f.n }).map((_, i) => (
              <div key={i} className="absolute" style={{ left: `${(i / f.n) * 108 - 5 + (fi % 2) * 5}%`, top: (i % 2) * 22 }}>
                <Caja size={f.size} flip={(i + fi) % 2 === 1} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* viñeta para centrar la mirada en la tarjeta */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 70% at 50% 45%, transparent 40%, rgba(10,6,3,0.72) 100%)' }} />
    </div>
  )
}

// Color de marca para el hover de cada tarjeta (rojo GOFO · azul SpeedX).
const ACENTO_MARCA = { gofo: '#E8391D', speedx: '#2F80ED' }

function SelectorCompania() {
  const { t } = useLang()
  const { user, perfil, cerrarSesion } = useAuth()
  const { setCarrier } = useCarrier()
  const nombre = perfil?.nombre || user?.email || ''
  // Solo se ofrecen las compañías a las que ESTE usuario tiene acceso.
  const permitidos = useCarriersPermitidos()
  const carriers = listaCarriers().filter((c) => permitidos.includes(c.id))
  return (
    <div className="relative flex min-h-screen w-full flex-col text-white">
      {/* Animaciones: deriva de cámara, entrada de la tarjeta y barrido de luz */}
      <style>{`
        @keyframes mppan{0%{transform:translate3d(0,0,0) scale(1.04)}100%{transform:translate3d(-2.2%,-1.2%,0) scale(1.09)}}
        @keyframes mpin{0%{opacity:0;transform:translateY(26px) scale(0.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes mpsweep{0%,55%{transform:translateX(-160%) skewX(-18deg)}85%,100%{transform:translateX(320%) skewX(-18deg)}}
        @media (prefers-reduced-motion: reduce){.mp-anim{animation:none!important}}
      `}</style>
      <FondoAlmacen />

      {/* Barra superior sobre la foto */}
      <header className="relative z-10 flex items-center justify-end gap-3 px-5 py-4 md:px-8">
        <LangToggle />
        <button onClick={cerrarSesion} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/25 px-3 py-1.5 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-black/40 hover:text-white">
          <LogOut size={15} strokeWidth={1.9} /> {t('Salir')}
        </button>
      </header>

      {/* Tarjeta de VIDRIO centrada (entra con animación) */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12 md:px-6">
        <div className="mp-anim relative w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/25 bg-white/10 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-2xl md:p-10" style={{ animation: 'mpin 0.8s cubic-bezier(0.22,1,0.36,1) both' }}>
          {/* barrido de luz sobre el vidrio, cada pocos segundos */}
          <div className="mp-anim pointer-events-none absolute inset-y-0 w-1/3" style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.14), transparent)', animation: 'mpsweep 7.5s ease-in-out 1.2s infinite' }} />
          <div className="text-center">
            <div className="text-3xl font-black tracking-tight md:text-4xl">MilePay<span className="text-brand-gold">.</span></div>
            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">{t('Plataforma de gestión last-mile')}</div>
            <div className="mt-6 text-sm font-semibold text-white/85 md:text-base">{t('Hola')}{nombre ? `, ${String(nombre).split(' ')[0]}` : ''} 👋 · {t('¿Con qué compañía vas a trabajar?')}</div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {carriers.map((c, i) => {
              const acc = ACENTO_MARCA[c.id] || '#ffffff'
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCarrier(c.id)}
                  style={{ '--acc': acc, animation: `mpin 0.7s cubic-bezier(0.22,1,0.36,1) ${0.18 + i * 0.14}s both` }}
                  className="group mp-anim rounded-2xl border border-white/25 bg-white/10 p-4 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--acc)] hover:bg-white/15 hover:shadow-[0_22px_50px_-14px_var(--acc)] md:p-5"
                >
                  <div className="grid h-20 place-items-center rounded-xl bg-white shadow-md transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-[0_10px_30px_-8px_var(--acc)] md:h-24">
                    <LogoMarca id={c.id} nombre={c.nombre} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">{c.nombre}</div>
                      <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-white transition-all duration-300 group-hover:gap-2.5">
                        {t('Entrar')} <ArrowRight size={15} strokeWidth={2.4} className="transition-colors duration-300 group-hover:text-[color:var(--acc)]" />
                      </div>
                      {/* subrayado con el color de la marca */}
                      <div className="mt-1 h-0.5 w-0 rounded-full transition-all duration-300 group-hover:w-14" style={{ background: acc }} />
                    </div>
                    {!c.listo && <span className="rounded-full bg-amber-400/25 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-200">{t('En preparación')}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-white/45">
            {t('Cada compañía tiene sus propias facturas, choferes, tarifas y ciudades — nada se mezcla.')} {t('Podrás cambiar de compañía en cualquier momento desde el menú.')}
          </p>
        </div>
      </div>
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
  const { carrier, setCarrier, cambiarCarrier } = useCarrier()
  const permitidos = useCarriersPermitidos()
  const activo = !cargando && !!user && !esDriver
  // ACCESO POR USUARIO: si la compañía elegida (p. ej. quedó guardada en este
  // navegador por otro usuario) NO está permitida para esta cuenta, se limpia;
  // y si el usuario solo tiene UNA compañía permitida, entra directo sin selector.
  useEffect(() => {
    if (!activo) return
    if (carrier && !permitidos.includes(carrier)) cambiarCarrier()
    else if (!carrier && permitidos.length === 1) setCarrier(permitidos[0])
  }, [activo, carrier, permitidos, setCarrier, cambiarCarrier])
  if (!activo) return children
  if (!carrier) return permitidos.length === 1 ? null : <SelectorCompania />
  if (!permitidos.includes(carrier)) return null
  if (!CARRIERS[carrier]?.listo) return <CarrierEnPreparacion id={carrier} />
  return children
}
