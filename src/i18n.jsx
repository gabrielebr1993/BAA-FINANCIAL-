// ============================================================================
// i18n mínimo y NO invasivo para MilePay (Package) + inicio.
// Estrategia: se traduce por "texto fuente en español". `t('Dashboard')` devuelve
// el inglés si el idioma es 'en', o el propio español si no hay traducción. Así se
// puede traducir pantalla por pantalla sin romper nada: lo no traducido queda en
// español. El idioma se guarda en localStorage (mp_lang).
// ============================================================================
import { createContext, useCallback, useContext, useState } from 'react'

// Diccionario ES→EN. Ir agregando entradas por pantalla. Si falta una, cae al español.
const EN = {
  // — Inicio / selector —
  'Plataforma de logística': 'Logistics platform',
  'Facturas, pagos y claims.': 'Invoices, payments and claims.',
  'Fletes de materiales, en vivo.': 'Material freight, live.',
  'Entrar': 'Enter',
  'Puedes cambiar de módulo en cualquier momento.': 'You can switch modules anytime.',

  // — Marca / layout —
  'Gestión de facturas': 'Invoice management',
  'Cambiar módulo': 'Switch module',
  'Cerrar sesión': 'Sign out',
  'Usuario': 'User',
  'IA': 'AI',

  // — Menú (SECCIONES) —
  'Dashboard': 'Dashboard',
  'Cargar Factura': 'Upload Invoice',
  'Facturas': 'Invoices',
  'Financiero': 'Financials',
  'Reclamos a Gofo': 'Gofo Claims',
  'Claims': 'Claims',
  'Choferes y Tarifas': 'Drivers & Rates',
  'Pagos': 'Payments',
  'Rutas': 'Routes',
  'Performance': 'Performance',
  'Comparar semanas': 'Compare weeks',
  'Auditorías': 'Audits',
  'Alertas': 'Alerts',
  'Usuarios': 'Users',
  'Configuración': 'Settings',
  'Backups': 'Backups',
  'Proyección': 'Projection',
  'Empresas': 'Companies',
  'Panel de Control': 'Control Panel',
  'JARVIS': 'JARVIS',

  // — Login —
  'Iniciar sesión': 'Sign in',
  'Bienvenido de vuelta': 'Welcome back',
  'Correo': 'Email',
  'Contraseña': 'Password',
  'Cambiar de módulo': 'Switch module',
  'Tema claro': 'Light theme',
  'Tema oscuro': 'Dark theme',
}

const Ctx = createContext(null)
const leerLang = () => { try { return localStorage.getItem('mp_lang') || 'es' } catch { return 'es' } }

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(leerLang)
  const setLang = useCallback((l) => { try { localStorage.setItem('mp_lang', l) } catch { /* noop */ } setLangState(l) }, [])
  const t = useCallback((s) => (lang === 'en' ? (EN[s] ?? s) : s), [lang])
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

// Si por algo un componente queda fuera del provider, devuelve identidad (español).
export function useLang() {
  return useContext(Ctx) || { lang: 'es', setLang: () => {}, t: (s) => s }
}

// Interruptor ES | EN reutilizable.
export function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-bold dark:border-white/15 ${className}`}>
      {['es', 'en'].map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 uppercase transition ${lang === l ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
