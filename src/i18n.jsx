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
  'GESTIÓN DE FACTURAS DE REPARTO': 'DELIVERY INVOICE MANAGEMENT',
  'Acceso seguro': 'Secure access',
  'Ingresa tus credenciales para continuar.': 'Enter your credentials to continue.',
  'Correo electrónico': 'Email address',
  'Recordarme': 'Remember me',
  '¿Olvidaste tu contraseña?': 'Forgot your password?',
  'Entrando…': 'Signing in…',
  'Conexión cifrada y protegida': 'Encrypted, protected connection',
  'Recuperar contraseña': 'Recover password',
  'Te enviaremos un enlace para crear una nueva contraseña.': 'We’ll send you a link to create a new password.',
  'Enviando…': 'Sending…',
  'Enviar enlace': 'Send link',
  'Volver a iniciar sesión': 'Back to sign in',
  'Todos los derechos reservados': 'All rights reserved',
  'El control financiero de tu operación': 'Financial control for your',
  'de última milla': 'last-mile operation',
  'Calcula pagos, verifica facturas contra tu proveedor y controla tu rentabilidad — con la precisión que tu negocio exige.': 'Calculate pay, verify invoices against your provider, and control your profitability — with the precision your business demands.',
  'Verificación al centavo con tu proveedor': 'To-the-cent verification with your provider',
  'Pagos calculados automáticamente': 'Payments calculated automatically',
  'Datos cifrados y protegidos': 'Encrypted, protected data',
  'El formato del correo no es válido.': 'The email format is invalid.',
  'No existe una cuenta con ese correo.': 'No account exists with that email.',
  'Correo o contraseña incorrectos.': 'Incorrect email or password.',
  'Demasiados intentos. Espera un momento e inténtalo de nuevo.': 'Too many attempts. Wait a moment and try again.',
  'Escribe tu contraseña.': 'Enter your password.',
  'Ocurrió un error. Inténtalo de nuevo.': 'An error occurred. Please try again.',
  'Escribe tu correo para enviarte el enlace.': 'Enter your email so we can send you the link.',
  'Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja (y spam).': 'We sent you an email to reset your password. Check your inbox (and spam).',

  // — Dashboard —
  'Cargando datos…': 'Loading data…',
  'Ocultar montos ($)': 'Hide amounts ($)',
  'Mostrar montos ($)': 'Show amounts ($)',
  'Ocultar $': 'Hide $',
  'Ver $': 'Show $',
  'Ingreso total': 'Total revenue',
  'Costo total': 'Total cost',
  'Ganancia': 'Profit',
  'Margen': 'Margin',
  'Paquetes': 'Packages',
  '% Dobles': '% Doubles',
  'Claims': 'Claims',
  'Sin datos en este rango': 'No data in this range',
  'No hay facturas en el rango de fechas seleccionado. Cambia el rango o carga una factura.': 'There are no invoices in the selected date range. Change the range or upload an invoice.',
  'Evolución semana a semana': 'Week-over-week evolution',
  'Ingreso, costo y ganancia por semana': 'Revenue, cost and profit per week',
  'Tendencia semana a semana': 'Week-over-week trend',
  'Detalle por semana': 'Weekly detail',
  'Semana': 'Week',
  'Ingreso': 'Revenue',
  'Costo': 'Cost',
  'Ver detalle financiero': 'View financial detail',
  'Ver claims': 'View claims',
  'No hay desglose de pago de Gofo para esta ciudad en este período.': 'There is no Gofo payment breakdown for this city in this period.',
  'Margen de ganancia': 'Profit margin',
  '% de dobles': '% of doubles',
  'Calidad (entregas sin claim)': 'Quality (deliveries without a claim)',
  'Ingreso por ciudad': 'Revenue by city',
  'Distribución individual vs doble': 'Single vs double distribution',
  'Ingreso por ruta (top 10)': 'Revenue by route (top 10)',
  'Individuales vs dobles por ciudad': 'Singles vs doubles by city',
  'Claims por ruta': 'Claims by route',
  'Comparativo entre ciudades': 'City comparison',
  'Haz clic en una ciudad para filtrar el financiero por ella.': 'Click a city to filter the financials by it.',
  'Ciudad': 'City',
  'Rankings de choferes': 'Driver rankings',
  'Haz clic en un chofer para ver su detalle en Performance.': 'Click a driver to see their detail in Performance.',
  'Por productividad (ingreso)': 'By productivity (revenue)',
  'Por ganancia': 'By profit',
  'Por calidad (menos claims)': 'By quality (fewest claims)',
  'Rankings de rutas': 'Route rankings',
  'Más reclamos': 'Most claims',
  'Cero reclamos': 'Zero claims',
  'Más ingreso': 'Most revenue',
  'Mejor $/lb': 'Best $/lb',
  'Ninguna ruta con claims.': 'No route with claims.',
  'Todas tienen algún claim.': 'All have some claim.',
  'Claims por tipo': 'Claims by type',
  'Choferes con más claims por tipo. Haz clic para ver su detalle.': 'Drivers with the most claims by type. Click to see their detail.',
  'Mejor': 'Best',
  'Peor': 'Worst',
  'Sin datos.': 'No data.',

  // — Común —
  'Ocultar': 'Hide',
  'Mostrar': 'Show',
  'Ciudad': 'City',
  'Estado': 'Status',
  'Pagado': 'Paid',
  'Pendiente': 'Pending',
  'Ver todos': 'View all',

  // — Pagos —
  'Pagos a Choferes': 'Driver Payments',
  'Cargando pagos…': 'Loading payments…',
  'Total a pagar': 'Total to pay',
  'Por cobrar a choferes': 'Owed by drivers',
  'Gastos fijos': 'Fixed costs',
  'Ajustes (préstamo / bono)': 'Adjustments (loan / bonus)',
  'Ganancia real': 'Real profit',
  'Pendientes / Pagados': 'Pending / Paid',
  'lo que sale del banco (saldos positivos)': 'what leaves the bank (positive balances)',
  'saldos negativos: te deben (no se pagan por ACH)': 'negative balances: they owe you (not paid via ACH)',
  'managers / renta / etc.': 'managers / rent / etc.',
  'Cuando cargues una factura verás aquí el pago calculado de cada chofer.': 'Once you upload an invoice, each driver’s calculated payment will appear here.',
  'Solo pendientes': 'Pending only',
  'Solo pagados': 'Paid only',
  'Buscar por nombre o rate (ej. 1.6)…': 'Search by name or rate (e.g. 1.6)…',
  'Ingreso Gofo': 'Gofo revenue',
  'Sin choferes con este filtro.': 'No drivers with this filter.',
  'Chofer': 'Driver',
  'Ruta': 'Route',
  'Ind.': 'Sing.',
  'Dobles': 'Doubles',
  'Claims (act/tot)': 'Claims (act/total)',
  'T.Ind': 'Sing.rate',
  'T.Doble': 'Dbl.rate',
  'Desc. Claims': 'Claims disc.',
  'Total a Pagar': 'Total to pay',
  'Marcar pendiente': 'Mark pending',
  'Marcar pagado': 'Mark paid',
  'sin tarifa': 'no rate',
  'Pagar (Stripe)': 'Pay (Stripe)',
  'Sin banco': 'No bank',
  'Ajustes de pago de': 'Payment adjustments for',
  'Préstamo / descuento ($)': 'Loan / discount ($)',
  'Bono ($)': 'Bonus ($)',
  'Guardar ajuste': 'Save adjustment',
  'Sin claims.': 'No claims.',
  'Perdonado': 'Waived',
  'Quitar perdón': 'Undo waiver',
  'Perdonar': 'Waive',
  'Gastos fijos del periodo': 'Fixed costs for the period',
  'Gasto fijo': 'Fixed cost',
  'TOTAL gastos fijos': 'TOTAL fixed costs',
  'Cargando…': 'Loading…',
  'Claims de': 'Claims of',
  'Activo': 'Active',
  'Motivo…': 'Reason…',
  'préstamo': 'loan',
  'bono': 'bonus',
  'Monto': 'Amount',

  // — Facturas (historial) —
  'Facturas cargadas': 'Loaded invoices',
  'Ciudad(es)': 'City(ies)',
  'Cargada': 'Loaded',
  'Archivo': 'File',
  'No hay facturas cargadas. Ve a Cargar Factura para subir la primera.': 'No invoices loaded. Go to Upload Invoice to add the first one.',
  'Extraer peso': 'Extract weight',
  'Eliminar': 'Delete',
  'Eliminar factura': 'Delete invoice',
  'Cancelar': 'Cancel',
  'Eliminando…': 'Deleting…',
  'Sí, eliminar': 'Yes, delete',
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
