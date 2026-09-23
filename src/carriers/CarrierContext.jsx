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
import { FileText, Zap, ArrowLeftRight, LogOut, Check } from 'lucide-react'
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
function SelectorCompania() {
  const { t } = useLang()
  const { user, perfil, cerrarSesion } = useAuth()
  const { setCarrier } = useCarrier()
  const nombre = perfil?.nombre || user?.email || ''
  const ICONO = { gofo: FileText, speedx: Zap }
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10 dark:bg-surface-dark">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={cerrarSesion} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-brand-navy dark:hover:text-slate-200">
            <LogOut size={15} strokeWidth={1.9} /> {t('Salir')}
          </button>
          <LangToggle />
        </div>
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-navy shadow-sm">
            <FileText size={22} strokeWidth={1.9} className="text-brand-gold" />
          </div>
          <div>
            <div className="text-xl font-extrabold leading-none text-brand-navy dark:text-slate-100">MilePay</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-slate-400">{t('GESTIÓN DE FACTURAS DE REPARTO')}</div>
          </div>
        </div>

        <h1 className="text-lg font-bold text-brand-navy dark:text-slate-100">{t('Hola')}{nombre ? `, ${String(nombre).split(' ')[0]}` : ''} 👋</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500 dark:text-slate-400">{t('¿Con qué compañía quieres trabajar hoy?')}</p>

        <div className="space-y-3">
          {listaCarriers().map((c) => {
            const Icon = ICONO[c.id] || FileText
            return (
              <button key={c.id} type="button" onClick={() => setCarrier(c.id)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-navy/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: c.color }}>
                  <Icon size={22} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold text-brand-navy dark:text-slate-100">{c.nombre}</span>
                    {!c.listo && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">{t('En preparación')}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{t(c.descripcion)}</span>
                </span>
                <Check size={18} className="flex-shrink-0 text-slate-300 transition group-hover:text-brand-navy dark:group-hover:text-slate-200" />
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">{t('Podrás cambiar de compañía en cualquier momento desde el menú.')}</p>
      </div>
    </div>
  )
}

// ── Módulo SPEEDX (cascarón): se completa tras analizar una factura real ────
function SpeedXApp() {
  const { t } = useLang()
  const { cambiarCarrier } = useCarrier()
  const { cerrarSesion } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-surface-dark">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-white shadow-sm" style={{ background: CARRIERS.speedx.color }}>
          <Zap size={30} strokeWidth={1.9} />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-brand-navy dark:text-slate-100">MilePay · SpeedX</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {t('El módulo de SpeedX está en preparación: su estructura de facturas, columnas y cálculos se definen analizando un archivo REAL de factura de SpeedX (no se inventa nada).')}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-brand-navy dark:text-slate-200">
          {t('Entrega una factura real de SpeedX para analizar su estructura y construir el módulo.')}
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
// Sin compañía elegida → selector. SpeedX → su módulo. Gofo → children intacto.
export function CarrierGate({ children }) {
  const { user, cargando, esDriver } = useAuth()
  const { carrier } = useCarrier()
  if (cargando || !user || esDriver) return children
  if (!carrier) return <SelectorCompania />
  if (carrier === 'speedx') return <SpeedXApp />
  return children
}
