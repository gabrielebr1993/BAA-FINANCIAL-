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
import { FileText, Zap, ArrowLeftRight, LogOut, ArrowRight, Package, PackageOpen, Boxes, Truck } from 'lucide-react'
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
const DECOR = [
  { I: Package, l: '6%', t: '14%', s: 96, r: -14 },
  { I: Boxes, l: '80%', t: '12%', s: 72, r: 16 },
  { I: Truck, l: '10%', t: '72%', s: 120, r: 6 },
  { I: Package, l: '72%', t: '68%', s: 58, r: -20 },
  { I: PackageOpen, l: '44%', t: '6%', s: 46, r: 22 },
  { I: Boxes, l: '88%', t: '46%', s: 44, r: -8 },
  { I: Package, l: '30%', t: '84%', s: 40, r: 12 },
]
function SelectorCompania() {
  const { t } = useLang()
  const { user, perfil, cerrarSesion } = useAuth()
  const { setCarrier } = useCarrier()
  const nombre = perfil?.nombre || user?.email || ''
  const ICONO = { gofo: FileText, speedx: Zap }
  const carriers = listaCarriers()
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0d1526] text-white">
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
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/50 md:text-base">{t('Cada compañía tiene sus propias facturas, choferes, tarifas y ciudades — nada se mezcla.')}</p>
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
              {/* Fondo con el color de la compañía */}
              <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{ background: `radial-gradient(120% 90% at 50% 115%, ${c.color}66, transparent 62%), linear-gradient(165deg, #131f38 0%, #0d1526 70%)` }}
              />
              {/* Paquetes y camiones decorativos */}
              {DECOR.map((d, i) => {
                const DIcon = d.I
                return (
                  <DIcon
                    key={i}
                    strokeWidth={1.2}
                    className="pointer-events-none absolute text-white transition-transform duration-500 group-hover:scale-110"
                    style={{ left: d.l, top: d.t, width: d.s, height: d.s, opacity: 0.06, transform: `rotate(${d.r}deg)` }}
                  />
                )
              })}
              {/* Contenido */}
              <div className="relative z-10 flex flex-col items-center gap-4 md:gap-5">
                <span
                  className="grid h-20 w-20 place-items-center rounded-3xl text-white shadow-2xl ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110 md:h-24 md:w-24"
                  style={{ background: c.color }}
                >
                  <Icon size={40} strokeWidth={1.8} />
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-black tracking-tight md:text-6xl">{c.nombre}</span>
                  {!c.listo && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">{t('En preparación')}</span>}
                </div>
                <p className="max-w-sm text-sm leading-relaxed text-white/60 md:text-base">{t(c.descripcion)}</p>
                <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-[#0d1526] shadow-lg transition-all duration-300 group-hover:gap-3.5 group-hover:shadow-xl">
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
