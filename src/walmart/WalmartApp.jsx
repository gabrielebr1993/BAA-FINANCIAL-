// ============================================================================
// WALMART · submódulo de Package (carrier 'walmart'). Operación independiente.
//
// Fase 1: Candidatos/Drivers (alta, perfil, búsqueda y filtros), Almacenes y
// Configuración de tarifas. Las demás secciones (Rutas, Cierre, Pagos,
// Fast Pay, Gastos, Financiero, Contratos) aparecen como "próximas fases".
//
// Visualmente usa el mismo diseño del sistema (componentes ui, colores de
// marca). Los datos viven en colecciones wal_* separadas.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { useCarrier } from '../carriers/CarrierContext'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, KPI } from '../components/ui'

// Gráficas diferidas (SVG puro; no entran en el arranque).
const ChartSemanas = lazy(() => import('./ChartSemanas'))
const ChartComparativa = lazy(() => import('./ChartComparativa'))
// jsPDF se importa bajo demanda al generar un PDF.
const cargarJsPDF = async () => (await import('jspdf')).jsPDF
import {
  Users, Warehouse as WhIcon, Settings, ArrowLeftRight, Plus, Trash2, ArrowLeft, Search,
  Route as RouteIcon, ClipboardCheck, Wallet, Receipt, BarChart3, FileSignature,
  CreditCard, Eye, EyeOff, ShieldCheck, Zap, LogOut, LayoutDashboard, Clock, TrendingUp, AlertTriangle, DollarSign,
  CalendarDays, X, Sun, Sunset, GripVertical, Camera, Upload, FileText, Download, FileSpreadsheet, Copy, ChevronDown,
  Smartphone, Share, History, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { BANCOS_USA } from './bancosUSA'
import { generarW9Base64, W9_OFICIAL_URL } from '../utils/w9'
import { activarPush, escucharPush } from './push'
import { Toaster, walToast, confeti, Dona, PulseDot, saludo, fechaLarga } from './wow'
import '../styles/cloudmotion.css'
import './foldable.css'
import {
  COL, ESTADOS, estadoInfo, DISPONIBILIDAD, DIAS, TIPOS_VEHICULO, SI_NO_PEND, PROPIETARIO,
  TARIFAS_DEFAULT, suscribir, guardar, borrar, auditar, nombreCompleto, sembrarAlmacenes, tarifaDeDriver, tieneRatePropio, ingresoDeAlmacen,
  BLOQUES, ESTADOS_RUTA, estadoRutaInfo, money2, idRuta, ingresoRuta, gananciaDriver,
  hoyISO, lunesDe, domingoDe, cerrarDia, reabrirDia, borrarRutaActualizandoCierre,
  METODOS_PAGO, liquidadoFPruta, resumenSemana, calcularFastPay, conciliacionSemana, utilidadFinanciamiento,
  ESTADOS_FP, ESTADO_FP_LABEL, ESTADO_FP_COLOR, estadoFP, fpLiquida, fpBloquea, rutaBloqueadaFP, fpDeRuta,
  CATEGORIAS_GASTO, distribuirMensual, gastoEnSemana, financieroSemana,
  ESTADOS_CONTRATO, estadoContratoInfo, CAMPOS_CONTRATO, renderPlantilla, faltantesPlantilla,
  tokenAleatorio, datosDeDriver,
  ultimasSemanas, receivableNet30, acumuladoDriver,
  AGENDA_TURNOS, agendaTurnoInfo, idAgenda, planAgendaVacio, planNormalizado, coberturaDia, huecosAgenda, necesitaDeAlmacen,
  leerImagenRedimensionada, leerArchivoComoDataURL, suscribirDocs,
  financieroRango, facturaDelPeriodo, mesDe, primerDiaMes, ultimoDiaMes, sumarDias, nombreMes, idFactura,
  suscribirMiUsuarioWal, suscribirUsuariosWal, guardarUsuarioWal, borrarUsuarioWal, idUsuarioWal,
  suscribirPorDriver, suscribirMiFicha,
  solicitarFastPay, suscribirSolicitudes, suscribirMisSolicitudes, atenderSolicitud,
} from './datosWal'
import {
  ROLES_WAL, rolWalInfo, CATEGORIAS_PERM, TODOS_PERMISOS, DEP_DE, LABEL_PERM, PLANTILLA_ROL,
  normalizarPermisos, permisosConcedibles, warehousesAsignables, validarCambioPermisos,
  tienePermisoWal, enAlcanceAlmacen, resumenPermisos,
} from './wmperms'

const WALMART_AZUL = '#0071dc'
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dinero = (n) => `$${money2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Instalar la app en el teléfono (Add to Home Screen / PWA) ────────────────
// En Android/Chrome capturamos el evento 'beforeinstallprompt' y mostramos un
// botón nativo. En iPhone (Safari) no existe ese evento, así que mostramos las
// instrucciones (Compartir → Añadir a pantalla de inicio). Se oculta si ya está
// instalada (display-mode: standalone) o si el usuario lo descartó.
function InstalarApp({ compacto = false }) {
  const [evt, setEvt] = useState(null)
  const [cerrado, setCerrado] = useState(() => { try { return localStorage.getItem('wal_install_off') === '1' } catch { return false } })
  const instalada = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone)
  const esIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    const done = () => { setEvt(null); try { localStorage.setItem('wal_install_off', '1') } catch { /* noop */ } }
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', done) }
  }, [])
  const descartar = () => { setCerrado(true); try { localStorage.setItem('wal_install_off', '1') } catch { /* noop */ } }
  if (instalada || cerrado) return null
  // Mostrar solo si hay evento (Android) o si es iOS (instrucciones manuales).
  if (!evt && !esIOS) return null
  const instalar = async () => { if (!evt) return; evt.prompt(); try { await evt.userChoice } catch { /* noop */ } setEvt(null) }
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-3 ${compacto ? 'py-2' : 'py-2.5'}`}>
      <Smartphone size={compacto ? 16 : 18} className="shrink-0 text-brand-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-brand-navy dark:text-slate-100">Instala la app en tu teléfono</div>
        {esIOS && !evt
          ? <div className="text-[11px] text-slate-500 dark:text-slate-400">Toca <Share size={11} className="inline" /> <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.</div>
          : <div className="text-[11px] text-slate-500 dark:text-slate-400">Ábrela como una app, sin abrir el navegador.</div>}
      </div>
      {evt && <button type="button" onClick={instalar} className="shrink-0 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-bold text-white">Instalar</button>}
      <button type="button" onClick={descartar} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Cerrar"><X size={16} /></button>
    </div>
  )
}

// Pestañas en ORDEN y agrupadas por sección (grupo). Menos ruido, más jerarquía.
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icono: LayoutDashboard, grupo: 'Inicio' },
  { id: 'agenda', label: 'Agenda semanal', icono: CalendarDays, grupo: 'Operación' },
  { id: 'rutas', label: 'Rutas', icono: RouteIcon, grupo: 'Operación' },
  { id: 'cierre', label: 'Cierre diario', icono: ClipboardCheck, grupo: 'Operación' },
  { id: 'personas', label: 'Drivers', icono: Users, grupo: 'Equipo' },
  { id: 'contratos', label: 'Contratos', icono: FileSignature, grupo: 'Equipo' },
  { id: 'pagos', label: 'Pagos y Fast Pay', icono: Wallet, grupo: 'Pagos' },
  { id: 'gastos', label: 'Gastos', icono: Receipt, grupo: 'Pagos' },
  { id: 'financiero', label: 'Financiero', icono: BarChart3, grupo: 'Finanzas' },
  { id: 'facturas', label: 'Facturas', icono: FileSpreadsheet, grupo: 'Finanzas' },
  { id: 'reportes', label: 'Reportes', icono: Download, grupo: 'Finanzas' },
  { id: 'almacenes', label: 'Almacenes', icono: WhIcon, grupo: 'Ajustes' },
  { id: 'usuarios', label: 'Usuarios y permisos', icono: ShieldCheck, grupo: 'Ajustes' },
  { id: 'historial', label: 'Historial de cambios', icono: History, grupo: 'Ajustes' },
  { id: 'config', label: 'Configuración', icono: Settings, grupo: 'Ajustes' },
]
const GRUPOS_ORDEN = ['Inicio', 'Operación', 'Equipo', 'Pagos', 'Finanzas', 'Ajustes']

// Permiso mínimo para VER cada pestaña. '__owner__' = solo dueño/súper-admin.
const PERM_TAB = {
  dashboard: 'fin_dashboard_ver',
  agenda: 'rutas_ver',
  personas: 'drivers_ver',
  almacenes: 'rutas_ver',
  rutas: 'rutas_ver',
  cierre: 'liq_preparar',
  pagos: 'pagos_ver', // el hub muestra Fast Pay si además tiene fp_ver
  gastos: 'fin_costos_ver',
  financiero: 'fin_dashboard_ver',
  facturas: 'fin_ingresos_ver',
  reportes: 'reportes_exportar',
  contratos: 'contratos_ver',
  usuarios: 'usuarios_crear',
  historial: 'historial_ver',
  config: '__owner__',
}

export default function WalmartApp() {
  const { user, esSuperAdmin, perfil } = useAuth()
  const { cambiarCarrier } = useCarrier()
  // Dueño/súper-admin: acceso total (preserva a los administradores globales).
  const esDueno = esSuperAdmin || perfil?.role === 'owner'
  // Documento de permisos Walmart del usuario actual (EN VIVO: retirar un permiso
  // afecta la sesión activa sin cerrar sesión).
  const [miWal, setMiWal] = useState(undefined) // undefined = cargando
  useEffect(() => {
    if (esDueno) { setMiWal(null); return }
    if (!user?.email) { setMiWal(null); return }
    return suscribirMiUsuarioWal(user.email, setMiWal)
  }, [esDueno, user?.email])
  // Perfil de permisos normalizado para esta sesión.
  const perm = useMemo(() => ({
    owner: esDueno,
    uid: user?.uid || '', email: (user?.email || '').toLowerCase(),
    rol: esDueno ? 'owner' : (miWal?.rol || null),
    permisos: esDueno ? {} : (miWal?.permisos || {}),
    warehouses: esDueno ? [] : (Array.isArray(miWal?.warehouses) ? miWal.warehouses : []),
    activo: esDueno ? true : (!!miWal && miWal.activo !== false),
  }), [esDueno, user, miWal])
  const puede = useCallback((key, opts) => tienePermisoWal(perm, key, opts), [perm])
  // Pestañas visibles según permisos (el dueño ve todas).
  const tabsVisibles = useMemo(() => TABS.filter((t) => {
    if (esDueno) return true
    if (t.id === 'pagos') return puede('pagos_ver') || puede('fp_ver') // hub: liquidaciones o fast pay
    const req = PERM_TAB[t.id]
    if (req === '__owner__') return false
    return puede(req)
  }), [esDueno, puede])

  const [tab, setTabRaw] = useState(() => {
    try { const t = localStorage.getItem('wal_tab'); if (t && TABS.some((x) => x.id === t)) return t } catch { /* sin storage */ }
    return 'dashboard'
  })
  const setTab = (t) => { setTabRaw(t); try { localStorage.setItem('wal_tab', t) } catch { /* sin storage */ } }
  // Si la pestaña activa no está permitida, cae a la primera visible.
  useEffect(() => {
    if (miWal === undefined && !esDueno) return
    if (tabsVisibles.length && !tabsVisibles.some((t) => t.id === tab)) setTabRaw(tabsVisibles[0].id)
  }, [tabsVisibles, tab, miWal, esDueno])
  const [personas, setPersonas] = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [rutas, setRutas] = useState([])
  const [cierres, setCierres] = useState([])
  const [pagos, setPagos] = useState([])
  const [gastos, setGastos] = useState([])
  const [cobros, setCobros] = useState([])
  const [contratos, setContratos] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [agenda, setAgenda] = useState([])
  const [facturas, setFacturas] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [tarifas, setTarifas] = useState(TARIFAS_DEFAULT)
  useEffect(() => suscribir(COL.candidatos, setPersonas), [])
  useEffect(() => suscribir(COL.almacenes, setAlmacenes), [])
  useEffect(() => suscribir(COL.rutas, setRutas), [])
  useEffect(() => suscribir(COL.cierres, setCierres), [])
  useEffect(() => suscribir(COL.pagos, setPagos), [])
  useEffect(() => suscribir(COL.gastos, setGastos), [])
  useEffect(() => suscribir(COL.cobros, setCobros), [])
  useEffect(() => suscribir(COL.contratos, setContratos), [])
  useEffect(() => suscribir(COL.plantillas, setPlantillas), [])
  useEffect(() => suscribir(COL.agenda, setAgenda), [])
  useEffect(() => suscribir(COL.facturas, setFacturas), [])
  useEffect(() => suscribir(COL.config, (docs) => setTarifas({ ...TARIFAS_DEFAULT, ...(docs.find((d) => d.id === 'tarifas') || {}) })), [])
  // Solicitudes de Fast Pay de los choferes (solo las lee dueño/staff con fp_ver).
  useEffect(() => suscribirSolicitudes(setSolicitudes), [])
  // Pendientes = solicitadas cuya ruta AÚN no tiene Fast Pay (al hacerlo o
  // rechazarla, desaparecen solas del contador y la lista).
  const solPendientes = useMemo(() => solicitudes.filter((s) => s.estado === 'solicitada' && !rutaBloqueadaFP(pagos, s.rutaId)), [solicitudes, pagos])
  // Notificación EN VIVO: avisa cuando entra una solicitud nueva.
  const solRef = useRef(solPendientes.length)
  useEffect(() => {
    if (solPendientes.length > solRef.current) walToast(`⚡ Nueva solicitud de Fast Pay (${solPendientes.length} pendiente${solPendientes.length !== 1 ? 's' : ''})`, 'gold')
    solRef.current = solPendientes.length
  }, [solPendientes.length])
  // Notificaciones push al teléfono (aviso aunque la app esté cerrada).
  const [pushOn, setPushOn] = useState(() => { try { return localStorage.getItem('wal_push_on') === '1' } catch { return false } })
  useEffect(() => { let unsub; escucharPush((payload) => { const n = payload?.notification; walToast('⚡ ' + (n?.title || 'Nueva solicitud'), 'gold') }).then((u) => { unsub = u }); return () => { if (typeof unsub === 'function') unsub() } }, [])
  const activarAvisos = async () => {
    walToast('Activando avisos…', 'navy')
    const r = await activarPush(user?.uid, user?.email)
    if (r.ok) { setPushOn(true); try { localStorage.setItem('wal_push_on', '1') } catch { /* noop */ } walToast('Avisos activados en este dispositivo ✓', 'gold') }
    else walToast('No se pudieron activar: ' + r.motivo, 'red')
  }

  // ── Alcance por almacén: el dueño ve TODO; un usuario con warehouses asignados
  // solo ve los datos de esos almacenes. (La aplicación REAL es por reglas de
  // Firestore; esto además limita lo que la UI muestra.)
  const enAlc = useCallback((almacenId) => enAlcanceAlmacen(perm, almacenId), [perm])
  const porAlm = useCallback((arr, campo = 'almacenId') => (esDueno ? arr : (arr || []).filter((x) => !x[campo] || enAlc(x[campo]))), [esDueno, enAlc])
  const almacenesV = esDueno ? almacenes : almacenes.filter((a) => enAlc(a.id))
  const rutasV = porAlm(rutas)
  const cierresV = porAlm(cierres)
  const gastosV = porAlm(gastos)
  const cobrosV = porAlm(cobros)
  const agendaV = porAlm(agenda)
  const facturasV = porAlm(facturas)
  // Personas en alcance: con route en un almacén permitido, o asignadas a él / 'ambos'.
  const personasV = useMemo(() => {
    if (esDueno) return personas
    const ids = new Set(rutasV.map((r) => r.driverId))
    return personas.filter((p) => ids.has(p.id) || p.almacen === 'ambos' || enAlc(p.almacenId))
  }, [esDueno, personas, rutasV, enAlc])

  const contenido = (
    <>
      {tab === 'dashboard' && puede('fin_dashboard_ver') && <TabDashboard rutas={rutasV} pagos={pagos} gastos={gastosV} cobros={cobrosV} personas={personasV} almacenes={almacenesV} contratos={contratos} solPend={solPendientes.length} irA={setTab} user={user} perm={perm} />}
      {tab === 'agenda' && puede('rutas_ver') && <TabAgenda personas={personasV} almacenes={almacenesV} agenda={agendaV} rutas={rutasV} tarifas={tarifas} perm={perm} irA={setTab} />}
      {tab === 'personas' && puede('drivers_ver') && <TabPersonas personas={personasV} almacenes={almacenesV} rutas={rutasV} pagos={pagos} contratos={contratos} gastos={gastosV} tarifas={tarifas} user={user} perm={perm} />}
      {tab === 'almacenes' && puede('rutas_ver') && <TabAlmacenes almacenes={almacenesV} user={user} />}
      {tab === 'rutas' && puede('rutas_ver') && <TabRutas rutas={rutasV} almacenes={almacenesV} personas={personasV} tarifas={tarifas} cierres={cierresV} perm={perm} />}
      {tab === 'cierre' && puede('liq_preparar') && <TabCierre rutas={rutasV} almacenes={almacenesV} cierres={cierresV} esDueno />}
      {tab === 'pagos' && (puede('pagos_ver') || puede('fp_ver')) && <TabPagosHub rutas={rutasV} pagos={pagos} personas={personasV} almacenes={almacenesV} tarifas={tarifas} perm={perm} solicitudes={solicitudes} />}
      {tab === 'gastos' && puede('fin_costos_ver') && <TabGastos gastos={gastosV} almacenes={almacenesV} personas={personasV} rutas={rutasV} />}
      {tab === 'financiero' && puede('fin_dashboard_ver') && <TabFinanciero rutas={rutasV} pagos={pagos} gastos={gastosV} cobros={cobrosV} personas={personasV} almacenes={almacenesV} facturas={facturasV} perm={perm} />}
      {tab === 'facturas' && puede('fin_ingresos_ver') && <TabFacturas rutas={rutasV} almacenes={almacenesV} facturas={facturasV} cobros={cobrosV} />}
      {tab === 'reportes' && puede('reportes_exportar') && <TabReportes rutas={rutasV} pagos={pagos} gastos={gastosV} cobros={cobrosV} personas={personasV} almacenes={almacenesV} facturas={facturasV} solicitudes={solicitudes} tarifas={tarifas} />}
      {tab === 'contratos' && puede('contratos_ver') && <TabContratos contratos={contratos} plantillas={plantillas} personas={personasV} almacenes={almacenesV} tarifas={tarifas} />}
      {tab === 'usuarios' && (esDueno || puede('usuarios_crear')) && <TabUsuariosWal almacenes={almacenes} personas={personas} perm={perm} />}
      {tab === 'historial' && (esDueno || puede('historial_ver')) && <TabHistorial />}
      {tab === 'config' && esDueno && <TabConfig />}
    </>
  )

  // Usuario sin NINGÚN acceso a Walmart (ni dueño ni permisos): pantalla clara.
  const sinAcceso = !esDueno && miWal !== undefined && tabsVisibles.length === 0
  if (miWal === undefined && !esDueno) {
    return <div className="grid min-h-screen place-items-center bg-surface dark:bg-surface-dark"><Spinner /></div>
  }
  // DRIVER (chofer): su portal propio, solo su información (antes de "sin acceso").
  if (!esDueno && perm.rol === 'driver') {
    return <WalmartDriverPortal driverId={miWal?.driverId} email={user?.email} tarifas={tarifas} onSalir={() => signOut(auth)} onCambiar={cambiarCarrier} />
  }
  if (sinAcceso) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface px-6 dark:bg-surface-dark">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy text-brand-gold"><ShieldCheck size={26} /></div>
          <h1 className="mt-4 text-xl font-extrabold text-brand-navy dark:text-slate-100">Sin acceso a Walmart</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">Tu cuenta ({user?.email}) no tiene permisos activos en el módulo Walmart. Pide al administrador que te asigne un rol y almacenes.</p>
          <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
            <button onClick={cambiarCarrier} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"><ArrowLeftRight size={16} /> Cambiar de compañía</button>
            <button onClick={() => signOut(auth)} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-slate-600"><LogOut size={15} /> Cerrar sesión</button>
          </div>
        </div>
      </div>
    )
  }
  const rolEtiqueta = esDueno ? 'dueño' : (rolWalInfo(perm.rol).label)
  return (
    <div className="flex min-h-screen bg-surface dark:bg-surface-dark">
      <Toaster />
      {/* MENÚ LATERAL (escritorio): mismo estilo que Warehouse/Paquetería */}
      <aside className="wal-aside sticky top-0 hidden h-screen w-64 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex dark:border-slate-700/60 dark:bg-surface-dark-card">
        <div className="flex items-center gap-3 px-1 pb-3 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
          <div>
            <div className="text-lg font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Walmart</div>
          </div>
        </div>
        <nav className="mt-1 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {GRUPOS_ORDEN.map((g) => {
            const items = tabsVisibles.filter((t) => t.grupo === g)
            if (!items.length) return null
            return (
              <div key={g} className="mb-0.5">
                <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">{g}</div>
                {items.map((tdef) => {
                  const Icono = tdef.icono; const activo = tab === tdef.id
                  return (
                    <button key={tdef.id} onClick={() => setTab(tdef.id)}
                      style={activo ? { borderLeftColor: WALMART_AZUL, background: 'rgba(0,113,220,0.10)', color: WALMART_AZUL } : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-xl border-l-2 py-2 pl-3 pr-3 text-left text-sm transition-all duration-150 ${activo
                        ? 'font-semibold'
                        : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'}`}>
                      <Icono size={18} strokeWidth={1.8} className="flex-shrink-0" />
                      <span className="flex-1">{tdef.label}</span>
                      {tdef.id === 'pagos' && solPendientes.length > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{solPendientes.length}</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700/60">
          <div className="truncate px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{user?.email}</div>
          <div className="px-1 text-[11px] text-slate-400">usuario · {rolEtiqueta}{!esDueno && perm.warehouses.length ? ` · ${perm.warehouses.length} almacén(es)` : ''}</div>
          {(esDueno || puede('fp_ver')) && (
            <button onClick={activarAvisos} className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition ${pushOn ? 'border-emerald-200 text-emerald-600 dark:border-emerald-500/30' : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40'}`}>
              {pushOn ? '🔔 Avisos activados ✓' : '🔔 Activar avisos de Fast Pay'}
            </button>
          )}
          <div className="mt-2"><InstalarApp compacto /></div>
          <button onClick={cambiarCarrier} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
            <ArrowLeftRight size={15} /> Cambiar de compañía
          </button>
          <button onClick={() => signOut(auth)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700/40">
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="wal-content cm-scope min-w-0 flex-1">
        {/* Cloud Motion: mismas nubes suaves que los otros módulos */}
        <div className="cm-nubes" aria-hidden="true"><span className="cm-n1" /><span className="cm-n2" /><span className="cm-n3" /></div>
        {/* Barra superior con pestañas SOLO en móvil */}
        <div className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur md:hidden dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <button onClick={cambiarCarrier} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar de compañía"><ArrowLeftRight size={16} /></button>
            <span className="text-lg font-black text-brand-navy dark:text-slate-100">Walmart</span>
            <div className="ml-auto"><button onClick={() => signOut(auth)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title="Cerrar sesión"><LogOut size={15} /></button></div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-2">
            {tabsVisibles.map((tdef) => {
              const Icono = tdef.icono
              return (
                <button key={tdef.id} onClick={() => setTab(tdef.id)}
                  style={tab === tdef.id ? { background: WALMART_AZUL, color: '#fff' } : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${tab === tdef.id ? '' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <Icono size={14} /> {tdef.label}
                  {tdef.id === 'pagos' && solPendientes.length > 0 && <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{solPendientes.length}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[1800px] overflow-x-clip p-3 sm:p-5 lg:p-6">{contenido}</div>
      </div>
    </div>
  )
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function TabDashboard({ rutas, pagos, gastos, cobros, personas, almacenes, contratos = [], solPend = 0, irA, user }) {
  const nombre = (() => { const n = (user?.email || '').split('@')[0].split(/[.\-_]/)[0]; return n ? n.charAt(0).toUpperCase() + n.slice(1) : '' })()
  const [modo, setModo] = useState('dia') // dia | semana | mes | rango — por defecto HOY
  const [fecha, setFecha] = useState(hoyISO())
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const semana = lunesDe(fecha)
  let desde, hasta, etiqueta, esSemana = false
  if (modo === 'dia') { desde = fecha; hasta = fecha; etiqueta = `Día · ${fecha}` }
  else if (modo === 'semana') { desde = semana; hasta = domingoDe(fecha); etiqueta = `Semana ${semana} → ${hasta}`; esSemana = true }
  else if (modo === 'mes') { desde = primerDiaMes(mes); hasta = ultimoDiaMes(mes); etiqueta = nombreMes(mes) }
  else { desde = d1 <= d2 ? d1 : d2; hasta = d1 <= d2 ? d2 : d1; etiqueta = `${desde} → ${hasta}` }
  const subPer = modo === 'dia' ? 'de hoy' : modo === 'mes' ? 'del mes' : modo === 'rango' ? 'del período' : 'de la semana'
  // Financiero del DÍA: se calcula sobre las rutas/gastos de esa fecha exacta
  // (las funciones financieroSemana/Rango son por semana, no por día).
  const finDia = (f) => {
    const rs = (rutas || []).filter((r) => r.fecha === f && r.estado === 'completada' && (!almId || r.almacenId === almId))
    const ingresoRutas = money2(rs.reduce((a, r) => a + ingresoRuta(r), 0))
    const costoDrivers = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
    const comisionesFP = money2((pagos || []).filter((p) => p.fecha === f && fpLiquida(p) && (!almId || !p.almacenId || p.almacenId === almId)).reduce((a, p) => a + (Number(p.comision) || 0), 0))
    const gastosOper = money2((gastos || []).filter((g) => g.fecha === f && (!almId || !g.almacenId || g.almacenId === almId) && !g.esFinanciamiento).reduce((a, g) => a + (Number(g.monto) || 0), 0))
    const bonosTotal = money2(rs.reduce((a, r) => a + (Array.isArray(r.bonos) ? r.bonos.reduce((x, b) => x + (Number(b.monto) || 0), 0) : 0), 0))
    return { ingresoRutas, costoDrivers, margen: money2(ingresoRutas - costoDrivers), gastosOper, gastoFinanc: 0, comisionesFP, efectivoFP: 0, pagosNormales: 0, resultadoOperativo: money2(ingresoRutas - costoDrivers - gastosOper + comisionesFP), cobrado: 0, porCobrar: 0, efectivoADrivers: 0, gastosPagados: 0, bonosTotal, flujoCaja: money2(gastosOper + bonosTotal), nRutas: rs.length }
  }
  const fin = useMemo(() => (modo === 'dia' ? finDia(fecha) : esSemana ? financieroSemana(rutas, pagos, gastos, cobros, semana, almId) : financieroRango(rutas, pagos, gastos, cobros, desde, hasta, almId)), [rutas, pagos, gastos, cobros, semana, desde, hasta, almId, esSemana, modo, fecha]) // eslint-disable-line
  const net30 = useMemo(() => receivableNet30(rutas, cobros, almId), [rutas, cobros, almId])
  const activos = personas.filter((p) => p.estadoOperativo === 'activo').length
  const standby = personas.filter((p) => p.estadoOperativo === 'standby').length
  const enPeriodo = (r) => (esSemana ? lunesDe(r.fecha) === semana : (r.fecha >= desde && r.fecha <= hasta))
  const rWeek = rutas.filter((r) => enPeriodo(r) && (!almId || r.almacenId === almId))
  const rC = rWeek.filter((r) => r.estado === 'completada').length
  const pend = rWeek.filter((r) => r.estado === 'pendiente' || r.estado === 'en_progreso').length
  const driversSemana = [...new Set(rWeek.filter((r) => r.estado === 'completada').map((r) => r.driverId))]
  const saldoDrivers = money2(driversSemana.reduce((a, did) => a + resumenSemana(rutas, pagos, did, semana).saldo, 0))
  const serie = useMemo(() => ultimasSemanas(8, fecha).map((s) => { const f = financieroSemana(rutas, pagos, gastos, cobros, s, almId); return { semana: s.slice(5), Ingreso: f.ingresoRutas, Resultado: f.resultadoOperativo } }), [rutas, pagos, gastos, cobros, almId, fecha])
  const contratosSinFirmar = (contratos || []).filter((c) => c.estado === 'pendiente_firma').length
  const alertas = []
  if (solPend > 0) alertas.push({ t: `${solPend} solicitud(es) de Fast Pay de choferes esperando`, tab: 'pagos', urgente: true })
  if (pend > 0) alertas.push({ t: `${pend} ruta(s) pendientes o en progreso esta semana — ciérralas o cancélalas`, tab: 'cierre' })
  if (saldoDrivers > 0) alertas.push({ t: `${dinero(saldoDrivers)} por pagar a drivers esta semana`, tab: 'pagos' })
  if (contratosSinFirmar > 0) alertas.push({ t: `${contratosSinFirmar} contrato(s) sin firmar`, tab: 'contratos' })
  if (net30.vencido > 0) alertas.push({ t: `${dinero(net30.vencido)} vencido: Walmart ya pasó net-30 sin cobrar`, tab: 'financiero' })

  return (
    <div>
      {/* HERO */}
      <div className="relative mb-4 overflow-hidden rounded-2xl p-5 text-white shadow-card sm:p-6" style={{ background: 'linear-gradient(120deg,#0f1d35 0%,#13233f 42%,#2b4c8c 78%,#c9a24b 140%)' }}>
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full" style={{ background: 'radial-gradient(circle,rgba(201,162,75,.35),transparent 65%)' }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-white/70">{saludo()}{nombre ? `, ${nombre}` : ''} · <span className="capitalize">{fechaLarga()}</span></div>
            <div className="mt-0.5 text-2xl font-black tracking-tight sm:text-[28px]">Panel de Walmart</div>
            <div className="mt-1 text-[13px] text-white/60">{etiqueta}</div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <HeroStat label="Drivers activos" valor={activos} dot />
            <HeroStat label="Rutas completadas" valor={rC} />
            <HeroStat label="Por cobrar" valor={dinero(net30.totalPorCobrar)} chico />
          </div>
        </div>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Ver por"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="dia">Día (hoy)</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="rango">Rango de fechas</option></Select></F>
          {modo === 'dia' && <F label="Día"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>}
          {modo === 'semana' && <F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>}
          {modo === 'mes' && <F label="Mes"><Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></F>}
          {modo === 'rango' && <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          {modo === 'dia' && fecha !== hoyISO() && <button className="pb-1.5 text-xs font-semibold text-brand-gold hover:underline" onClick={() => setFecha(hoyISO())}>↺ Hoy</button>}
          <span className="pb-1.5 text-xs font-semibold text-slate-400">{etiqueta}</span>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
        <KPI animado label="Drivers activos" value={String(activos)} icon={Users} accent="navy" sub={`${standby} en stand-by`} />
        <KPI animado label="Rutas completadas" value={String(rC)} icon={RouteIcon} accent="green" sub={pend ? `${pend} pendientes` : subPer} />
        <KPI animado label="Ingreso Walmart" value={dinero(fin.ingresoRutas)} icon={DollarSign} accent="navy" sub={subPer} />
        <KPI animado label="Ganancia drivers" value={dinero(fin.costoDrivers)} icon={Wallet} accent="blue" sub="antes de Fast Pay" />
        <KPI animado label="Comisiones Fast Pay" value={dinero(fin.comisionesFP)} icon={Zap} accent="gold" sub="ingreso de la compañía" />
        <KPI animado label="Resultado operativo" value={dinero(fin.resultadoOperativo)} icon={TrendingUp} accent={fin.resultadoOperativo >= 0 ? 'green' : 'red'} sub={`margen − gastos + comisiones · ${subPer}`} />
        <KPI animado label="Por cobrar a Walmart" value={dinero(net30.totalPorCobrar)} icon={Clock} accent={net30.vencido > 0 ? 'red' : 'gold'} sub={net30.vencido > 0 ? `${dinero(net30.vencido)} vencido` : 'net 30'} />
        <KPI animado label="Por pagar a drivers" value={dinero(saldoDrivers)} icon={Wallet} accent={saldoDrivers > 0 ? 'gold' : 'green'} sub="saldo de la semana" />
      </div>

      {alertas.length > 0 ? (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={16} className="text-amber-500" /> Centro de pendientes <span className="ml-auto text-xs font-normal text-slate-400">{alertas.length} por atender</span></div>
          <div className="space-y-1.5">
            {alertas.map((a, i) => (
              <button key={i} onClick={() => irA(a.tab)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${a.urgente ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200' : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'}`}>
                {a.urgente && <Zap size={14} className="shrink-0" />}
                <span className="flex-1">{a.t}</span><ArrowLeft size={13} className="rotate-180" />
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mb-4 flex items-center gap-2 p-4 text-sm text-slate-500"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">✓</span> Todo al día — no hay pendientes por atender.</Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Ingreso vs resultado (últimas 8 semanas)</div>
          <Suspense fallback={<div className="grid h-[260px] place-items-center text-xs text-slate-400"><Spinner /></div>}>
            <ChartSemanas data={serie} />
          </Suspense>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-brand-gold" /> Cuentas por cobrar (net 30)</div>
          <div className="mb-3"><div className="font-mono text-2xl font-extrabold text-brand-navy dark:text-slate-100">{dinero(net30.totalPorCobrar)}</div><div className="text-xs text-slate-400">total pendiente de Walmart</div></div>
          {net30.proximo && <div className="mb-2 text-xs text-slate-500">Próximo cobro estimado: <b>{dinero(net30.proximo.pend)}</b> el <b>{net30.proximo.venceEl}</b> (semana {net30.proximo.semana})</div>}
          {net30.vencido > 0 && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-500/10">⚠ {dinero(net30.vencido)} ya venció el net-30</div>}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {net30.detalle.slice(-6).reverse().map((d) => (
              <div key={d.semana} className="flex items-center justify-between text-xs"><span className="text-slate-500">sem {d.semana} · vence {d.venceEl}</span><span className={`font-mono font-semibold ${d.vencido ? 'text-rose-500' : 'text-brand-navy dark:text-slate-100'}`}>{dinero(d.pend)}</span></div>
            ))}
            {net30.detalle.length === 0 && <div className="text-xs text-slate-400">Todo cobrado. Registra cobros en Financiero.</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}

function HeroStat({ label, valor, dot, chico }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">{dot && <PulseDot color="#34d399" size={7} />}{label}</div>
      <div className={`mt-0.5 font-black tabular-nums ${chico ? 'text-lg' : 'text-2xl'}`}>{valor}</div>
    </div>
  )
}

// ── AGENDA SEMANAL ──────────────────────────────────────────────────────────
const ini = (p) => `${(p?.nombre || '?')[0] || ''}${(p?.apellido || '')[0] || ''}`.toUpperCase() || '?'
const DIA_LARGO = { Lun: 'Lunes', Mar: 'Martes', 'Mié': 'Miércoles', Jue: 'Jueves', Vie: 'Viernes', 'Sáb': 'Sábado', Dom: 'Domingo' }

// Orden real de los días DESDE el inicio de la semana operativa (sábado).
// 'semana' (lunesDe) es el sábado, así que la fecha de cada día = sábado + offset.
const ORDEN_SEMANA_DESDE_SABADO = ['Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const fechaDeDiaSemana = (semanaISO, dia) => sumarDias(semanaISO, Math.max(0, ORDEN_SEMANA_DESDE_SABADO.indexOf(dia)))

function TabAgenda({ personas, almacenes, agenda, rutas = [], tarifas, perm, irA }) {
  const [almId, setAlmId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('activo')
  const [ambito, setAmbito] = useState('almacen') // 'almacen' | 'todos'
  const [sel, setSel] = useState(null) // driverId seleccionado (para tocar y colocar)
  const [sobre, setSobre] = useState('') // "dia|turno" en arrastre encima
  const [repetir, setRepetir] = useState(false)

  const semana = lunesDe(fecha)
  useEffect(() => { if (!almId && almacenes.length) setAlmId(almacenes[0].id) }, [almacenes, almId])
  const almSel = almacenes.find((a) => a.id === almId)
  const necesita = necesitaDeAlmacen(almSel) // { manana, tarde }
  const necTotal = necesita.manana + necesita.tarde

  const doc0 = agenda.find((a) => a.id === idAgenda(almId, semana))
  const plan = useMemo(() => planNormalizado(doc0?.plan), [doc0])

  // Ámbito: este almacén (incluye sin asignar) o todos. Filtro por estado.
  const delAlmacen = useMemo(() => (ambito === 'todos' ? personas : personas.filter((p) => p.almacenId === almId || !p.almacenId || p.almacenId === 'ambos')), [personas, almId, ambito])
  const panel = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return delAlmacen
      .filter((p) => (fEstado === 'todos' ? true : p.estadoOperativo === fEstado))
      .filter((p) => !txt || `${nombreCompleto(p)} ${p.ciudad || ''} ${p.telefono || ''}`.toLowerCase().includes(txt))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  }, [delAlmacen, q, fEstado])
  // Diagnóstico para el mensaje de panel vacío.
  const diag = useMemo(() => ({
    total: personas.length,
    enAlmacen: personas.filter((p) => p.almacenId === almId || !p.almacenId || p.almacenId === 'ambos').length,
    activosAqui: personas.filter((p) => (p.almacenId === almId || !p.almacenId || p.almacenId === 'ambos') && p.estadoOperativo === 'activo').length,
  }), [personas, almId])

  const nombreDe = (id) => { const p = personas.find((x) => x.id === id); return p ? nombreCompleto(p) : '—' }
  const personaDe = (id) => personas.find((x) => x.id === id)
  const diasAsignado = (id) => DIAS.filter((d) => plan[d].manana.includes(id) || plan[d].tarde.includes(id)).length

  const guardarPlan = async (nuevo) => { if (!almId) return; await guardar(COL.agenda, idAgenda(almId, semana), { almacenId: almId, semana, plan: nuevo }); walToast('Agenda guardada') }
  const asignar = (driverId, dia, turno) => {
    if (!driverId) return
    const nuevo = planNormalizado(plan)
    const otro = turno === 'manana' ? 'tarde' : 'manana'
    nuevo[dia][otro] = nuevo[dia][otro].filter((x) => x !== driverId) // un turno por día
    if (!nuevo[dia][turno].includes(driverId)) nuevo[dia][turno].push(driverId)
    guardarPlan(nuevo)
  }
  const quitar = (driverId, dia, turno) => {
    const nuevo = planNormalizado(plan)
    nuevo[dia][turno] = nuevo[dia][turno].filter((x) => x !== driverId)
    guardarPlan(nuevo)
  }
  const limpiarDia = (dia) => { const nuevo = planNormalizado(plan); nuevo[dia] = { manana: [], tarde: [] }; guardarPlan(nuevo) }
  const guardarNec = (campo, val) => { if (almId) guardar(COL.almacenes, almId, { [campo]: Math.max(0, Number(val) || 0) }) }

  // ── Generar rutas desde la agenda (un clic) ──────────────────────────────────
  // Crea una ruta por cada driver asignado en cada día/turno de la semana. El id
  // es determinista (almacén+fecha+turno+driver), así que volver a generar NO
  // duplica: salta las que ya existen (incluidas las de días ya cerrados).
  const pCrearRutas = !perm || perm.owner || perm.permisos?.rutas_crear
  const [generando, setGenerando] = useState(false)
  const planAsignados = () => {
    const out = []
    for (const d of DIAS) {
      for (const turno of ['manana', 'tarde']) {
        for (const did of (plan[d]?.[turno] || [])) out.push({ dia: d, turno, did, fecha: fechaDeDiaSemana(semana, d) })
      }
    }
    return out
  }
  const asignados = planAsignados()
  const yaExiste = (f, turno, did) => rutas.some((r) => r.id === idRuta(almId, f, turno, did) || (r.almacenId === almId && r.fecha === f && r.bloque === turno && r.driverId === did))
  const porCrear = asignados.filter((a) => !yaExiste(a.fecha, a.turno, a.did))
  const generarRutasSemana = async () => {
    if (!almId || !porCrear.length) return
    if (!window.confirm(`¿Crear ${porCrear.length} ruta(s) de esta semana (${semana} → ${domingoDe(fecha)}) para ${almSel?.nombre || 'este almacén'}?\n\nLas que ya existan no se tocan. Podrás editarlas en Rutas.`)) return
    setGenerando(true)
    try {
      const alm = almacenes.find((a) => a.id === almId)
      let n = 0
      for (const a of porCrear) {
        const d = personas.find((p) => p.id === a.did)
        if (!d) continue
        const id = idRuta(almId, a.fecha, a.turno, a.did)
        const data = {
          fecha: a.fecha, semana: lunesDe(a.fecha), almacenId: almId, driverId: a.did, driverNombre: nombreCompleto(d),
          identificador: '', bloque: a.turno, vehiculoTipo: d.tipoVehiculo || '', propietarioVehiculo: d.propietarioVehiculo || 'driver',
          estado: 'pendiente', goHome: false, tarifaWalmart: ingresoDeAlmacen(alm, tarifas), tarifaDriver: tarifaDeDriver(d, tarifas),
          otUnidades: 0, otIngreso: 0, otPago: 0, bonos: [], deducciones: [], notas: 'Generada desde agenda', motivoCancel: '',
        }
        await guardar(COL.rutas, id, data); n++
      }
      await auditar('rutas_generadas', `${alm?.nombre || ''} · ${semana} · ${n} rutas`)
      walToast(`${n} ruta(s) creada(s) ✓`, 'gold'); confeti()
    } catch (e) { walToast('No se pudo generar: ' + (e?.message || e), 'red') } finally { setGenerando(false) }
  }

  const activos = (dia, turno) => panel.filter((p) => p.estadoOperativo === 'activo' && !plan[dia].manana.includes(p.id) && !plan[dia].tarde.includes(p.id))
  const huecos = DIAS.map((d) => ({ dia: d, ...huecosAgenda(plan, d, necesita) })).filter((h) => h.faltan > 0)

  // Cobertura semanal (para la dona) y confeti cuando queda al 100%.
  const cubiertos = DIAS.reduce((a, d) => { const c = coberturaDia(plan, d); return a + Math.min(c.manana, necesita.manana) + Math.min(c.tarde, necesita.tarde) }, 0)
  const slotsTotal = necTotal * DIAS.length
  const pctCob = slotsTotal ? cubiertos / slotsTotal : 0
  const semanaCubierta = slotsTotal > 0 && cubiertos >= slotsTotal
  const cubiertaRef = useRef(semanaCubierta)
  useEffect(() => {
    if (semanaCubierta && !cubiertaRef.current) { confeti(); walToast('¡Semana 100% cubierta!', 'gold') }
    cubiertaRef.current = semanaCubierta
  }, [semanaCubierta])

  if (!almacenes.length) {
    return (<div><PageTitle>Agenda semanal</PageTitle><Aviso tipo="info">Primero crea un almacén en la pestaña <b>Almacenes</b>. Cada almacén tiene su propia agenda.</Aviso></div>)
  }

  return (
    <div>
      <PageTitle right={<>
        {pCrearRutas && <Boton variant="gold" disabled={generando || porCrear.length === 0} onClick={generarRutasSemana}>{generando ? <Spinner /> : <><RouteIcon size={14} /> Generar rutas{porCrear.length ? ` (${porCrear.length})` : ''}</>}</Boton>}
        <Boton variant="ghost" onClick={() => setRepetir(true)}><Copy size={14} /> Repetir / copiar</Boton>
      </>}>Agenda semanal</PageTitle>
      <p className="-mt-1 mb-3 text-xs text-slate-400">Arrastra (o toca) un driver y suéltalo en el día — <b className="text-emerald-600">mañana</b> o <b className="text-blue-600">tarde</b>. El sistema avisa si falta gente. Se guarda al instante. Con <b className="text-brand-gold">Generar rutas</b> creas de una vez todas las rutas de la semana asignadas aquí{asignados.length ? ` (${asignados.length} asignadas, ${porCrear.length} por crear)` : ''}.</p>

      {/* Controles */}
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)} className="min-w-[160px]">{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Semana"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[150px]" /></F>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Necesita por turno</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <Sun size={13} className="text-emerald-600" /><Input type="number" min="0" className="w-14 border-0 bg-transparent p-0 text-center" defaultValue={necesita.manana} key={`m${almId}${necesita.manana}`} onBlur={(e) => guardarNec('necesitaManana', e.target.value)} />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-500/30 dark:bg-blue-500/10">
                <Sunset size={13} className="text-blue-600" /><Input type="number" min="0" className="w-14 border-0 bg-transparent p-0 text-center" defaultValue={necesita.tarde} key={`t${almId}${necesita.tarde}`} onBlur={(e) => guardarNec('necesitaTarde', e.target.value)} />
              </div>
            </div>
          </div>
          <span className="pb-1.5 text-xs text-slate-400">{semana} → {domingoDe(fecha)} · {necTotal}/día</span>
          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <Dona pct={pctCob} size={52} color={semanaCubierta ? '#2E9E6B' : pctCob > 0.5 ? '#c9a24b' : '#E0533D'}>{Math.round(pctCob * 100)}%</Dona>
            <span className="text-[11px] font-semibold text-slate-400">cobertura<br />semanal</span>
          </div>
        </div>
      </Card>

      {/* Cobertura por día (por turno) */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {DIAS.map((d) => {
          const c = coberturaDia(plan, d)
          const fM = Math.max(0, necesita.manana - c.manana), fT = Math.max(0, necesita.tarde - c.tarde)
          const ok = fM + fT === 0
          return (
            <div key={d} className={`rounded-xl border p-2 ${ok ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10'}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-brand-navy dark:text-slate-100">{d}</span>
                <span className={`rounded-full px-1.5 text-[9px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{ok ? 'OK' : `−${fM + fT}`}</span>
              </div>
              <div className="space-y-1">
                <div className={`flex items-center justify-between rounded-md px-1.5 py-0.5 text-[11px] font-bold ${fM ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'}`}><span className="flex items-center gap-1"><Sun size={11} />Mañ</span><span>{c.manana}/{necesita.manana}</span></div>
                <div className={`flex items-center justify-between rounded-md px-1.5 py-0.5 text-[11px] font-bold ${fT ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-700'}`}><span className="flex items-center gap-1"><Sunset size={11} />Tar</span><span>{c.tarde}/{necesita.tarde}</span></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alertas de huecos (por turno) */}
      {huecos.length > 0 && (
        <Card className="mb-3 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={15} className="text-amber-500" /> Huecos detectados</div>
          <div className="space-y-1.5">
            {huecos.map((h) => {
              const libM = activos(h.dia, 'manana'), libT = activos(h.dia, 'tarde')
              return (
                <div key={h.dia} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  <b className="text-brand-navy dark:text-slate-100">{DIA_LARGO[h.dia]}:</b>
                  {h.faltanM > 0 && <span>🟢 Mañana faltan <b>{h.faltanM}</b>{libM.length ? ` (disp: ${libM.slice(0, 2).map(nombreCompleto).join(', ')}${libM.length > 2 ? '…' : ''})` : ' (sin libres)'}</span>}
                  {h.faltanT > 0 && <span>🔵 Tarde faltan <b>{h.faltanT}</b>{libT.length ? ` (disp: ${libT.slice(0, 2).map(nombreCompleto).join(', ')}${libT.length > 2 ? '…' : ''})` : ' (sin libres)'}</span>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[232px_1fr]">
        {/* Panel de drivers */}
        <Card className="p-3 lg:sticky lg:top-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Drivers</span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{fEstado === 'activo' && panel.length > 0 && <PulseDot size={6} />}{panel.length}</span>
          </div>
          <div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" /><Input className="pl-8" placeholder="Buscar driver…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="activo">Activos</option><option value="standby">Stand-by</option><option value="candidato">Candidatos</option><option value="pendiente_doc">Pend. doc</option><option value="todos">Todo estado</option>
            </Select>
            <Select value={ambito} onChange={(e) => setAmbito(e.target.value)}>
              <option value="almacen">Este almacén</option><option value="todos">Todos</option>
            </Select>
          </div>
          {sel && <div className="mb-2 rounded-lg border border-brand-gold/40 bg-amber-50 px-2 py-1.5 text-[11px] text-brand-navy dark:bg-amber-500/10 dark:text-slate-200">Toca un turno para asignar a <b>{nombreDe(sel)}</b> · <button className="font-semibold underline" onClick={() => setSel(null)}>cancelar</button></div>}
          <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
            {panel.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                {diag.total === 0
                  ? <>No hay drivers creados.<br />Crea uno en <b>Candidatos / Drivers</b>.</>
                  : diag.activosAqui === 0 && fEstado === 'activo' && diag.enAlmacen > 0
                    ? <>Tienes <b>{diag.enAlmacen}</b> driver(s) aquí, pero ninguno <b>Activo</b>. Cambia el filtro a <b>“Todo estado”</b> o pon su estado en <b>Activo</b> (en su perfil).</>
                    : diag.enAlmacen === 0
                      ? <>Tus drivers están en <b>otro almacén</b>. Cambia el ámbito a <b>“Todos”</b> o elige el otro almacén arriba.</>
                      : <>Ningún driver con este filtro. Prueba <b>“Todo estado”</b> o <b>“Todos”</b> los almacenes.</>}
              </div>
            )}
            {panel.map((p) => {
              const nd = diasAsignado(p.id); const act = sel === p.id
              return (
                <div key={p.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'copy' }}
                  onClick={() => setSel(act ? null : p.id)}
                  className={`flex cursor-grab items-center gap-2 rounded-xl border px-2 py-1.5 transition active:cursor-grabbing ${act ? 'border-brand-gold bg-amber-50 shadow-sm dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-brand-gold/50 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800'}`}>
                  <GripVertical size={13} className="shrink-0 text-slate-300" />
                  <Avatar p={p} size={28} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</span><span className="block truncate text-[10px] text-slate-400">{p.tipoVehiculo || 'Driver'}{nd ? ` · ${nd}d` : ''}</span></span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Tablero semanal — min-w-0 deja que esta columna del grid se encoja y
            haga scroll interno en vez de desbordarse sobre el panel de Drivers. */}
        <div className="min-w-0 overflow-x-auto pb-1">
          <div className="grid min-w-[840px] grid-cols-7 gap-2">
            {DIAS.map((d) => (
              <div key={d} className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-xs font-extrabold text-brand-navy dark:text-slate-100">{d}</span>
                  {(plan[d].manana.length + plan[d].tarde.length) > 0 && <button onClick={() => limpiarDia(d)} title="Vaciar día" className="text-slate-300 transition hover:text-rose-500"><Trash2 size={12} /></button>}
                </div>
                {AGENDA_TURNOS.map((t) => {
                  const lista = plan[d][t.id]; const activo = sobre === `${d}|${t.id}`
                  const Ico = t.id === 'manana' ? Sun : Sunset
                  return (
                    <div key={t.id}
                      onDragOver={(e) => { e.preventDefault(); if (sobre !== `${d}|${t.id}`) setSobre(`${d}|${t.id}`) }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSobre('') }}
                      onDrop={(e) => { e.preventDefault(); setSobre(''); asignar(e.dataTransfer.getData('text/plain'), d, t.id) }}
                      onClick={() => { if (sel) { asignar(sel, d, t.id); setSel(null) } }}
                      style={activo ? { background: t.bg, borderColor: t.br } : undefined}
                      className={`flex-1 border-b-2 px-1.5 py-1.5 transition last:border-b-0 ${sel ? 'cursor-pointer' : ''} ${activo ? 'ring-1 ring-inset' : 'border-transparent'}`}>
                      <div className="mb-1 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wide" style={{ color: t.tx }}>
                        <span className="flex items-center gap-1 truncate"><Ico size={11} className="shrink-0" />{t.label}</span>
                        <span className="shrink-0 rounded-full px-1" style={{ background: t.bg }}>{lista.length}</span>
                      </div>
                      <div className="space-y-1">
                        {lista.map((id) => {
                          const p = personaDe(id)
                          return (
                            <div key={id} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold shadow-sm" style={{ background: t.bg, color: t.tx, border: `1px solid ${t.br}` }}>
                              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: t.hex }}>{ini(p)}</span>
                              <span className="min-w-0 flex-1 truncate">{p ? nombreCompleto(p) : '—'}</span>
                              <button onClick={(e) => { e.stopPropagation(); quitar(id, d, t.id) }} className="shrink-0 opacity-50 transition hover:opacity-100"><X size={11} /></button>
                            </div>
                          )
                        })}
                        {lista.length === 0 && <div className="grid h-12 place-items-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-300 dark:border-slate-700">suelta aquí</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {repetir && <RepetirModal almId={almId} semana={semana} plan={plan} agenda={agenda} almacenes={almacenes} onCerrar={() => setRepetir(false)} />}
    </div>
  )
}

// Copiar/repetir la agenda: por turnos (ambos/mañana/tarde) a mes, semana,
// semana específica, otro almacén, o rellenar la semana con un día.
function RepetirModal({ almId, semana, plan, agenda, almacenes, onCerrar }) {
  const [turnos, setTurnos] = useState('ambos') // ambos | manana | tarde
  const [modo, setModo] = useState('mes') // mes | proxima | especifica | almacen | diaSemana
  const [fechaDestino, setFechaDestino] = useState(sumarDias(semana, 7))
  const [almDest, setAlmDest] = useState(almacenes.find((a) => a.id !== almId)?.id || '')
  const [diaOrigen, setDiaOrigen] = useState(DIAS[0])
  const [trabajando, setTrabajando] = useState(false)
  const hayOtroAlm = almacenes.filter((a) => a.id !== almId).length > 0
  const losTurnos = turnos === 'ambos' ? ['manana', 'tarde'] : [turnos]

  const semanasDelMes = () => {
    const mes = mesDe(semana), fin = ultimoDiaMes(mes)
    const out = []; let w = lunesDe(primerDiaMes(mes)); let g = 0
    while (w <= fin && g < 40) { out.push(w); w = sumarDias(w, 7); g++ }
    return out
  }
  const planDe = (alm, w) => planNormalizado(agenda.find((a) => a.id === idAgenda(alm, w))?.plan)
  // Copia los turnos elegidos del plan fuente (día a día, o un solo día fuente) al destino, conservando el otro turno.
  const aplicarA = async (alm, w, diaFuente) => {
    const dest = planDe(alm, w); const src = planNormalizado(plan)
    for (const d of DIAS) for (const t of losTurnos) dest[d][t] = [...(diaFuente ? src[diaFuente][t] : src[d][t])]
    await guardar(COL.agenda, idAgenda(alm, w), { almacenId: alm, semana: w, plan: dest })
  }

  const aplicar = async () => {
    setTrabajando(true)
    try {
      if (modo === 'diaSemana') { await aplicarA(almId, semana, diaOrigen); walToast('Semana rellenada ✓', 'gold'); onCerrar(); return }
      let destinos = []
      if (modo === 'mes') destinos = semanasDelMes().filter((w) => w !== semana).map((w) => ({ alm: almId, w }))
      else if (modo === 'proxima') destinos = [{ alm: almId, w: lunesDe(sumarDias(semana, 7)) }]
      else if (modo === 'especifica') { const w = lunesDe(fechaDestino); if (w !== semana) destinos = [{ alm: almId, w }] }
      else if (modo === 'almacen') { if (almDest && almDest !== almId) destinos = [{ alm: almDest, w: semana }] }
      if (!destinos.length) { onCerrar(); return }
      const quéT = turnos === 'ambos' ? 'ambos turnos' : turnos === 'manana' ? 'solo mañanas' : 'solo tardes'
      if (!window.confirm(`Se copiará (${quéT}) a ${destinos.length} destino(s), reemplazando esos turnos. ¿Continuar?`)) { setTrabajando(false); return }
      for (const { alm, w } of destinos) await aplicarA(alm, w)
      walToast(`Copiado a ${destinos.length} destino(s) ✓`, 'gold'); onCerrar()
    } finally { setTrabajando(false) }
  }

  const Op = ({ v, children }) => (
    <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
      <input type="radio" name="repmodo" checked={modo === v} onChange={() => setModo(v)} className="mt-0.5 accent-brand-gold" />
      <span className="flex flex-1 flex-wrap items-center gap-1.5">{children}</span>
    </label>
  )
  const Chip = ({ v, children }) => (
    <button type="button" onClick={() => setTurnos(v)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${turnos === v ? 'border-brand-gold bg-amber-50 text-brand-navy dark:bg-amber-500/10 dark:text-amber-200' : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700'}`}>{children}</button>
  )
  return (
    <Modal titulo="Repetir / copiar agenda" onCerrar={onCerrar}>
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Qué turnos copiar</div>
        <div className="flex flex-wrap gap-1.5"><Chip v="ambos">Ambos</Chip><Chip v="manana">Solo mañanas</Chip><Chip v="tarde">Solo tardes</Chip></div>
      </div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">A dónde</div>
      <div className="space-y-2">
        <Op v="mes">Copiar a <b>todo el mes</b> (este almacén)</Op>
        <Op v="proxima">Copiar a la <b>próxima semana</b></Op>
        <Op v="especifica">Copiar a una <b>semana específica</b>{modo === 'especifica' && <DateField value={fechaDestino} onChange={(e) => setFechaDestino(e.target.value)} className="w-40" />}</Op>
        {hayOtroAlm && <Op v="almacen">Copiar a <b>otro almacén</b> (misma semana){modo === 'almacen' && <Select value={almDest} onChange={(e) => setAlmDest(e.target.value)} className="w-44">{almacenes.filter((a) => a.id !== almId).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select>}</Op>}
        <Op v="diaSemana">Rellenar <b>la semana</b> con el día{modo === 'diaSemana' && <Select value={diaOrigen} onChange={(e) => setDiaOrigen(e.target.value)} className="w-24">{DIAS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>}</Op>
      </div>
      <div className="mt-4 flex gap-2">
        <Boton variant="gold" disabled={trabajando} onClick={aplicar}>{trabajando ? <Spinner /> : 'Aplicar'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Copiar <b>reemplaza</b> los turnos elegidos en el destino (conserva el otro turno). Usa los mismos drivers.</p>
    </Modal>
  )
}

function Proximamente({ tab }) {
  return (
    <Card className="p-8 text-center">
      <tab.icono className="mx-auto mb-3 text-slate-300" size={40} />
      <div className="text-lg font-bold text-brand-navy dark:text-slate-100">{tab.label}</div>
      <p className="mt-2 text-sm text-slate-500">Esta sección llega en la <b>Fase {tab.fase}</b>. Por ahora ya puedes registrar candidatos/drivers, almacenes y las tarifas.</p>
    </Card>
  )
}

// ── CANDIDATOS / DRIVERS ────────────────────────────────────────────────────
function TabPersonas({ personas, almacenes, rutas, pagos, contratos, gastos, tarifas, user, perm }) {
  const puedeCrear = !perm || perm.owner || perm.permisos?.drivers_crear
  const puedeEditar = !perm || perm.owner || perm.permisos?.drivers_editar
  const [editar, setEditar] = useState(null) // persona en edición / {} nuevo
  const [ver, setVer] = useState(null) // perfil abierto
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fAlmacen, setFAlmacen] = useState('')
  const [fDisp, setFDisp] = useState('')

  const almacenNombre = (id) => id === 'ambos' ? 'Ambos' : (almacenes.find((a) => a.id === id)?.nombre || '')
  const lista = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return personas.filter((p) => {
      if (fEstado && p.estadoOperativo !== fEstado) return false
      if (fAlmacen && p.almacenId !== fAlmacen && p.almacenId !== 'ambos') return false
      if (fDisp && p.disponibilidad !== fDisp) return false
      if (txt) {
        const hay = `${nombreCompleto(p)} ${p.ciudad || ''} ${p.estado || ''} ${p.telefono || ''} ${p.tipoVehiculo || ''}`.toLowerCase()
        if (!hay.includes(txt)) return false
      }
      return true
    }).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  }, [personas, q, fEstado, fAlmacen, fDisp])

  if (ver) return <PerfilDriver persona={personas.find((p) => p.id === ver.id) || ver} almacenes={almacenes} rutas={rutas} pagos={pagos} contratos={contratos} gastos={gastos} tarifas={tarifas} onVolver={() => setVer(null)} onEditar={puedeEditar ? (p) => { setVer(null); setEditar(p) } : undefined} />
  if (editar) return <EditorPersona persona={editar} almacenes={almacenes} user={user} rutas={rutas} onCerrar={() => setEditar(null)} />

  const conteo = (id) => personas.filter((p) => p.estadoOperativo === id).length
  return (
    <div>
      <PageTitle right={puedeCrear ? <Boton variant="gold" onClick={() => setEditar({})}><Plus size={15} /> Nuevo</Boton> : null}>Candidatos y Drivers</PageTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {ESTADOS.map((e) => <Badge key={e.id} color={e.color}>{e.label}: {conteo(e.id)}</Badge>)}
      </div>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-8" placeholder="Buscar por nombre, ciudad, teléfono, vehículo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-40" value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="">Todos los estados</option>{ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select>
          <Select className="w-40" value={fAlmacen} onChange={(e) => setFAlmacen(e.target.value)}><option value="">Todos los almacenes</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select>
          <Select className="w-36" value={fDisp} onChange={(e) => setFDisp(e.target.value)}><option value="">Disponibilidad</option>{DISPONIBILIDAD.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
        </div>
      </Card>

      {lista.length === 0 && <Vacio icono={Users}>{personas.length ? 'Ningún resultado con esos filtros.' : 'Aún no hay candidatos. Agrega el primero con “Nuevo”.'}</Vacio>}
      <div className="space-y-1.5">
        {lista.map((p) => {
          const e = estadoInfo(p.estadoOperativo)
          return (
            <Card key={p.id} className={FILA}>
              <Avatar p={p} size={36} />
              <button className="font-bold text-brand-navy hover:underline dark:text-slate-100" onClick={() => setVer(p)}>{nombreCompleto(p)}</button>
              <Badge color={e.color}>{e.label}</Badge>
              {p.almacenId && <span className="text-xs text-slate-400">{almacenNombre(p.almacenId)}</span>}
              <span className="text-xs text-slate-400">{[p.ciudad, p.estado].filter(Boolean).join(', ')}</span>
              {p.tipoVehiculo && <Badge color="slate">{p.tipoVehiculo}</Badge>}
              <div className="ml-auto flex gap-3 text-xs">
                <button className="font-semibold text-brand-gold hover:underline" onClick={() => setVer(p)}>ver perfil</button>
                {puedeEditar && <button className="font-semibold text-slate-400 hover:text-brand-navy" onClick={() => setEditar(p)}>editar</button>}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

const inic = (p) => `${(p.nombre || '?')[0] || ''}${(p.apellido || '')[0] || ''}`.toUpperCase()

// Avatar: foto real del driver si existe, si no las iniciales.
function Avatar({ p, size = 36, cuadrado, className = '' }) {
  const st = { width: size, height: size }
  const radio = cuadrado ? 'rounded-2xl' : 'rounded-full'
  if (p?.fotoURL) return <img src={p.fotoURL} alt={nombreCompleto(p)} style={st} className={`shrink-0 object-cover ${radio} ${className}`} />
  return <span style={{ ...st, fontSize: Math.round(size * 0.36) }} className={`grid shrink-0 place-items-center bg-brand-navy font-bold text-brand-gold ${radio} ${className}`}>{inic(p)}</span>
}

function EditorPersona({ persona, almacenes, user, rutas = [], onCerrar }) {
  const nuevo = !persona.id
  const [p, setP] = useState(() => ({
    nombre: '', apellido: '', telefono: '', correo: '', direccion: '', ciudad: '', estado: '',
    fechaRegistro: hoy(), responsable: user?.email || '', notas: '',
    tieneSSN: 'pendiente', tieneLicencia: 'pendiente', disponibilidad: 'ambas', diasDisponibles: [],
    tipoVehiculo: 'SUV', marca: '', modelo: '', anio: '', propietarioVehiculo: 'driver', rateDriver: '',
    estadoOperativo: 'candidato', almacenId: '', ...persona,
  }))
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const toggleDia = (d) => setP((x) => ({ ...x, diasDisponibles: x.diasDisponibles.includes(d) ? x.diasDisponibles.filter((y) => y !== d) : [...x.diasDisponibles, d] }))
  const puedeActivar = p.estadoOperativo !== 'activo' || p.almacenId
  const salvar = async () => {
    if (!p.nombre.trim()) { window.alert('Pon al menos el nombre.'); return }
    if (p.estadoOperativo === 'activo' && !p.almacenId) { window.alert('Un driver ACTIVO debe tener un almacén asignado.'); return }
    setGuardando(true)
    try {
      const id = await guardar(COL.candidatos, persona.id, p)
      await auditar(nuevo ? 'persona_creada' : 'persona_editada', `${nombreCompleto(p)} · ${p.estadoOperativo}`)
      walToast(nuevo ? 'Driver creado ✓' : 'Driver guardado ✓')
      onCerrar(id)
    } finally { setGuardando(false) }
  }
  // Rutas asociadas a este driver: si tiene, NO se borra (perderíamos su historial
  // de pagos y liquidaciones) — se archiva en su lugar.
  const nRutas = useMemo(() => (persona.id ? (rutas || []).filter((r) => r.driverId === persona.id).length : 0), [rutas, persona.id])
  const archivar = async () => {
    if (!persona.id) return
    if (!window.confirm(`¿Archivar a ${nombreCompleto(p)}?\n\nDeja de aparecer en listas activas y agenda, pero se conserva todo su historial de rutas y pagos. Puedes reactivarlo cambiando su estado.`)) return
    setGuardando(true)
    try {
      await guardar(COL.candidatos, persona.id, { ...p, estadoOperativo: 'archivado', almacenId: '' })
      await auditar('persona_archivada', `${nombreCompleto(p)} · ${nRutas} rutas`)
      walToast('Driver archivado ✓')
      onCerrar(persona.id)
    } finally { setGuardando(false) }
  }
  const eliminar = async () => {
    if (!persona.id) return
    if (nRutas > 0) {
      window.alert(`No se puede borrar a ${nombreCompleto(p)}: tiene ${nRutas} ruta(s) registradas y se perdería su historial de pagos.\n\nUsa "Archivar" en su lugar.`)
      return
    }
    if (!window.confirm(`¿Borrar definitivamente a ${nombreCompleto(p)}? No tiene rutas, así que es seguro. Esta acción no se puede deshacer.`)) return
    setGuardando(true)
    try {
      await borrar(COL.candidatos, persona.id)
      await auditar('persona_borrada', nombreCompleto(p))
      walToast('Driver borrado')
      onCerrar()
    } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={() => onCerrar()}><ArrowLeft size={14} /> Volver</Boton>}>{nuevo ? 'Nuevo candidato' : `Editar · ${nombreCompleto(p)}`}</PageTitle>
      <Card className="mb-3 p-4">
        <Seccion titulo="Datos personales">
          <Grid>
            <F label="Nombre"><Input value={p.nombre} onChange={(e) => set('nombre', e.target.value)} /></F>
            <F label="Apellido"><Input value={p.apellido} onChange={(e) => set('apellido', e.target.value)} /></F>
            <F label="Teléfono"><Input value={p.telefono} onChange={(e) => set('telefono', e.target.value)} /></F>
            <F label="Correo"><Input type="email" value={p.correo} onChange={(e) => set('correo', e.target.value)} /></F>
            <F label="Dirección"><Input value={p.direccion} onChange={(e) => set('direccion', e.target.value)} /></F>
            <F label="Ciudad"><Input value={p.ciudad} onChange={(e) => set('ciudad', e.target.value)} /></F>
            <F label="Estado"><Input value={p.estado} onChange={(e) => set('estado', e.target.value)} placeholder="TX, UT…" /></F>
            <F label="Fecha de registro"><DateField value={p.fechaRegistro} onChange={(e) => set('fechaRegistro', e.target.value)} /></F>
          </Grid>
        </Seccion>
        <Seccion titulo="Documentación">
          <Grid>
            <F label="¿Tiene SSN?"><Select value={p.tieneSSN} onChange={(e) => set('tieneSSN', e.target.value)}>{SI_NO_PEND.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
            <F label="¿Tiene licencia?"><Select value={p.tieneLicencia} onChange={(e) => set('tieneLicencia', e.target.value)}>{SI_NO_PEND.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
          </Grid>
          <p className="mt-1 text-[11px] text-slate-400">Solo se guarda sí/no/pendiente — nunca el número de SSN completo.</p>
        </Seccion>
        <Seccion titulo="Disponibilidad">
          <Grid>
            <F label="Turno"><Select value={p.disponibilidad} onChange={(e) => set('disponibilidad', e.target.value)}>{DISPONIBILIDAD.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></F>
          </Grid>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIAS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDia(d)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${p.diasDisponibles.includes(d) ? 'border-brand-gold bg-amber-50 text-brand-navy dark:bg-amber-500/15 dark:text-amber-200' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{d}</button>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Vehículo">
          <Grid>
            <F label="Tipo"><Select value={p.tipoVehiculo} onChange={(e) => set('tipoVehiculo', e.target.value)}>{TIPOS_VEHICULO.map((t) => <option key={t} value={t}>{t}</option>)}</Select></F>
            <F label="Marca"><Input value={p.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Chevrolet" /></F>
            <F label="Modelo"><Input value={p.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Suburban" /></F>
            <F label="Año"><Input value={p.anio} onChange={(e) => set('anio', e.target.value)} placeholder="2021" /></F>
            <F label="Propietario"><Select value={p.propietarioVehiculo} onChange={(e) => set('propietarioVehiculo', e.target.value)}>{PROPIETARIO.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
            <F label="Pago por ruta (USD) — opcional"><Input type="number" value={p.rateDriver} onChange={(e) => set('rateDriver', e.target.value)} placeholder={p.propietarioVehiculo === 'compania' ? 'por defecto compañía' : 'por defecto propio'} /></F>
          </Grid>
          <p className="mt-1 text-[11px] text-slate-400">Si este driver cobra distinto, pon aquí su pago por ruta. Se usará automáticamente al crear sus rutas. Si lo dejas vacío, usa la tarifa por defecto según el propietario del vehículo.</p>
        </Seccion>
        <Seccion titulo="Estado y almacén">
          <Grid>
            <F label="Estado operativo"><Select value={p.estadoOperativo} onChange={(e) => set('estadoOperativo', e.target.value)}>{ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></F>
            <F label="Almacén asignado"><Select value={p.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">— sin asignar —</option><option value="ambos">Ambos almacenes</option>{almacenes.filter((a) => a.activo !== false).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          </Grid>
          {p.estadoOperativo === 'activo' && !p.almacenId && <p className="mt-1 text-[11px] text-amber-600">Un driver activo necesita un almacén para recibir rutas.</p>}
        </Seccion>
        <Seccion titulo="Notas">
          <textarea value={p.notas} onChange={(e) => set('notas', e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        </Seccion>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Boton variant="gold" disabled={guardando || !puedeActivar} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar'}</Boton>
        <Boton variant="ghost" onClick={() => onCerrar()}>Cancelar</Boton>
        {!nuevo && p.estadoOperativo !== 'archivado' && (
          <button type="button" disabled={guardando} className="ml-auto text-sm font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-50 dark:hover:text-white" onClick={archivar}>Archivar</button>
        )}
        {!nuevo && (
          <button type="button" disabled={guardando} className={`text-sm font-semibold text-rose-400 hover:text-rose-600 disabled:opacity-50 ${p.estadoOperativo === 'archivado' ? 'ml-auto' : ''}`} onClick={eliminar}>Borrar</button>
        )}
      </div>
      {!nuevo && nRutas > 0 && <p className="mt-2 text-[11px] text-slate-400">Este driver tiene <b>{nRutas}</b> ruta(s) en el historial. Por eso no se puede borrar: usa <b>Archivar</b> para sacarlo de las listas activas sin perder sus pagos.</p>}
      <p className="mt-3 text-[11px] text-slate-400">Datos bancarios, foto, documentos y contratos se agregan desde el perfil en fases siguientes (con cifrado y permisos).</p>
    </div>
  )
}

function PerfilDriver({ persona, almacenes, rutas, pagos, contratos, gastos, tarifas, onVolver, onEditar }) {
  const p = persona
  const e = estadoInfo(p.estadoOperativo)
  const gastosDrv = useMemo(() => (gastos || []).filter((g) => g.driverId === p.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [gastos, p.id])
  const totalGastosDrv = money2(gastosDrv.reduce((a, g) => a + (Number(g.monto) || 0), 0))
  const fotoRef = useRef(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [editRate, setEditRate] = useState(false)
  const [rateVal, setRateVal] = useState(p.rateDriver ?? '')
  const rateEfectivo = tarifaDeDriver(p, tarifas || TARIFAS_DEFAULT)
  const ratePropio = tieneRatePropio(p)
  const guardarRate = async () => {
    const v = rateVal === '' ? '' : money2(rateVal)
    await guardar(COL.candidatos, p.id, { rateDriver: v })
    await auditar('rate_driver', `${nombreCompleto(p)} · ${v === '' ? 'por defecto' : dinero(v)}`)
    walToast('Pago por ruta actualizado ✓'); setEditRate(false)
  }
  const subirFoto = async (file) => {
    if (!file) return
    setSubiendoFoto(true)
    try {
      const dataURL = await leerImagenRedimensionada(file, 200, 0.74) // avatar liviano (~10-20KB) para que la lista cargue rápido
      await guardar(COL.candidatos, p.id, { fotoURL: dataURL })
      await auditar('foto_driver', nombreCompleto(p))
      walToast('Foto actualizada ✓')
    } catch (err) { window.alert('No se pudo subir la foto: ' + (err.message || err)) } finally { setSubiendoFoto(false) }
  }
  const alm = almacenes.find((a) => a.id === p.almacenId)
  const acc = useMemo(() => acumuladoDriver(rutas || [], pagos || [], p.id), [rutas, pagos, p.id])
  const rutasDrv = useMemo(() => (rutas || []).filter((r) => r.driverId === p.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 12), [rutas, p.id])
  const pagosDrv = useMemo(() => (pagos || []).filter((x) => x.driverId === p.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 12), [pagos, p.id])
  const contratosDrv = (contratos || []).filter((c) => c.driverId === p.id)
  const dato = (l, v) => <div><div className="text-[10px] font-bold uppercase text-slate-400">{l}</div><div className="text-sm text-brand-navy dark:text-slate-100">{v || '—'}</div></div>
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={onVolver}><ArrowLeft size={14} /> Volver</Boton>}>Perfil</PageTitle>
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => fotoRef.current?.click()} className="group relative" title="Cambiar foto">
            <Avatar p={p} size={64} cuadrado />
            <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/45 opacity-0 transition group-hover:opacity-100">{subiendoFoto ? <Spinner /> : <Camera size={20} className="text-white" />}</span>
            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={(ev) => { subirFoto(ev.target.files?.[0]); ev.target.value = '' }} />
          </button>
          <div className="min-w-0">
            <div className="text-xl font-black text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge color={e.color}>{e.label}</Badge>
              {alm && <Badge color="navy">{alm.nombre}</Badge>}
              {p.almacenId === 'ambos' && <Badge color="navy">Ambos almacenes</Badge>}
              {p.tipoVehiculo && <Badge color="slate">{p.tipoVehiculo}{p.marca ? ` · ${p.marca} ${p.modelo}` : ''}</Badge>}
            </div>
          </div>
          <Boton variant="ghost" className="ml-auto" onClick={() => onEditar(p)}>Editar</Boton>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4"><div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Contacto</div><div className="grid grid-cols-2 gap-3">{dato('Teléfono', p.telefono)}{dato('Correo', p.correo)}{dato('Dirección', p.direccion)}{dato('Ciudad / Estado', [p.ciudad, p.estado].filter(Boolean).join(', '))}</div></Card>
        <Card className="p-4"><div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Disponibilidad y documentación</div><div className="grid grid-cols-2 gap-3">{dato('Turno', DISPONIBILIDAD.find((d) => d.id === p.disponibilidad)?.label)}{dato('Días', (p.diasDisponibles || []).join(', '))}{dato('SSN', SI_NO_PEND.find((o) => o.id === p.tieneSSN)?.label)}{dato('Licencia', SI_NO_PEND.find((o) => o.id === p.tieneLicencia)?.label)}</div></Card>
        <Card className="p-4"><div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Vehículo</div><div className="grid grid-cols-2 gap-3">{dato('Tipo', p.tipoVehiculo)}{dato('Marca / Modelo', [p.marca, p.modelo].filter(Boolean).join(' '))}{dato('Año', p.anio)}{dato('Propietario', PROPIETARIO.find((o) => o.id === p.propietarioVehiculo)?.label)}</div></Card>
        <Card className="p-4"><div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Notas</div><div className="text-sm text-slate-600 dark:text-slate-300">{p.notas || '—'}</div></Card>
      </div>
      {/* Acumulados históricos */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat l="Rutas completadas" v={String(acc.nRutas)} />
        <MiniStat l="Total ganado" v={dinero(acc.ganado)} />
        <MiniStat l="Pagado (FP + pagos)" v={dinero(acc.liquidadoFP + acc.pagadoNormal)} />
        <MiniStat l="Saldo pendiente" v={dinero(acc.saldo)} ambar={acc.saldo > 0.005} />
      </div>

      {/* Pago por ruta (tarifa del driver) — editable al instante */}
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Wallet size={18} className="text-brand-gold" />
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">Pago por ruta</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="font-mono text-xl font-extrabold text-brand-navy dark:text-slate-100">{dinero(rateEfectivo)}</span>
              <Badge color={ratePropio ? 'gold' : 'slate'}>{ratePropio ? 'personalizado' : (p.propietarioVehiculo === 'compania' ? 'por defecto compañía' : 'por defecto propio')}</Badge>
            </div>
          </div>
          {!editRate
            ? <Boton variant="ghost" className="ml-auto" onClick={() => { setRateVal(p.rateDriver ?? ''); setEditRate(true) }}>Cambiar</Boton>
            : (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Input type="number" value={rateVal} onChange={(ev) => setRateVal(ev.target.value)} className="w-28" placeholder="por defecto" />
                <Boton variant="gold" onClick={guardarRate}>Guardar</Boton>
                <Boton variant="ghost" onClick={() => setEditRate(false)}>Cancelar</Boton>
              </div>
            )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Se usa automáticamente al crear rutas de este driver. Déjalo vacío para usar la tarifa por defecto según el propietario del vehículo.</p>
      </Card>

      <BankSection driverId={p.id} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Historial de rutas</div>
          {rutasDrv.length === 0 && <div className="text-sm text-slate-400">Sin rutas aún.</div>}
          {rutasDrv.map((r) => {
            const er = estadoRutaInfo(r.estado)
            return <div key={r.id} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-xs last:border-0 dark:border-slate-800/60"><span className="font-mono text-slate-400">{r.fecha}</span><span>{BLOQUES.find((b) => b.id === r.bloque)?.label}</span><Badge color={er.color}>{er.label}</Badge><span className="ml-auto font-mono font-semibold text-emerald-600">{dinero(gananciaDriver(r))}</span></div>
          })}
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Pagos y Fast Pay</div>
          {pagosDrv.length === 0 && <div className="text-sm text-slate-400">Sin pagos aún.</div>}
          {pagosDrv.map((x, i) => <div key={i} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-xs last:border-0 dark:border-slate-800/60"><Badge color={x.tipo === 'fastpay' ? 'gold' : 'navy'}>{x.tipo === 'fastpay' ? 'Fast Pay' : 'Pago'}</Badge><span className="font-mono text-slate-400">{x.fecha}</span><span className="ml-auto font-mono font-semibold">{dinero(x.tipo === 'fastpay' ? x.efectivo : x.monto)}</span></div>)}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Receipt size={15} className="text-brand-gold" /> Gastos de la compañía atribuidos <span className="ml-auto font-mono text-brand-navy dark:text-slate-100">{dinero(totalGastosDrv)}</span></div>
        {gastosDrv.length === 0 && <div className="text-sm text-slate-400">Sin gastos atribuidos. Regístralos en <b>Gastos</b> eligiendo este driver.</div>}
        {gastosDrv.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 py-1.5 text-xs last:border-0 dark:border-slate-800/60">
            <Badge color="navy">{g.categoria}</Badge>
            <span className="text-brand-navy dark:text-slate-100">{g.concepto || '—'}</span>
            <span className="font-mono text-slate-400">{g.fecha}</span>
            {g.rutaId && <Badge color="slate">ruta</Badge>}
            <span className="ml-auto font-mono font-semibold">{dinero(g.monto)}</span>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-slate-400">Costos que cubrió la compañía por este driver (gasolina, etc.). <b>No se le descuentan</b>; si quieres descontarle algo, usa deducciones en la ruta.</p>
      </Card>

      <Card className="mt-4 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Contratos</div>
        {contratosDrv.length === 0 && <div className="text-sm text-slate-400">Sin contratos. Genera uno en la pestaña Contratos.</div>}
        {contratosDrv.map((c) => { const ec = estadoContratoInfo(c.estado); return <div key={c.id} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-sm last:border-0 dark:border-slate-800/60"><FileSignature size={14} className="text-brand-gold" /><span className="font-semibold text-brand-navy dark:text-slate-100">{c.titulo}</span><Badge color={ec.color}>{ec.label}</Badge></div> })}
      </Card>

      <DocsDriver driverId={p.id} nombre={nombreCompleto(p)} />
    </div>
  )
}

// Documentos del driver (foto/licencia/ID/seguro…) guardados como dataURL.
function DocsDriver({ driverId, nombre }) {
  const [docs, setDocs] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [tipo, setTipo] = useState('Licencia')
  const inputRef = useRef(null)
  useEffect(() => suscribirDocs(driverId, setDocs), [driverId])
  const subir = async (file) => {
    if (!file) return
    setSubiendo(true)
    try {
      let dataURL, kind
      if (/^image\//.test(file.type)) { dataURL = await leerImagenRedimensionada(file, 1400, 0.8); kind = 'image' }
      else if (file.type === 'application/pdf') { dataURL = await leerArchivoComoDataURL(file); kind = 'pdf' }
      else throw new Error('Solo imágenes o PDF.')
      if (dataURL.length > 920000) throw new Error('El archivo es muy grande. Usa una foto o un PDF más pequeño (~650 KB).')
      await guardar(COL.docs, null, { driverId, nombre: file.name || tipo, tipo, kind, dataURL, size: dataURL.length, fecha: hoyISO() })
      await auditar('doc_driver', `${nombre} · ${tipo}`)
      walToast('Documento subido ✓')
    } catch (err) { window.alert('No se pudo subir: ' + (err.message || err)) } finally { setSubiendo(false) }
  }
  const abrir = (d) => { const w = window.open(); if (w) { w.document.title = d.nombre || 'documento'; w.document.body.style.margin = '0'; w.document.body.innerHTML = `<iframe src="${d.dataURL}" style="border:0;width:100vw;height:100vh"></iframe>` } }
  const bajar = (d) => { const a = document.createElement('a'); a.href = d.dataURL; a.download = d.nombre || 'documento'; a.click() }
  const quitar = async (d) => { if (window.confirm('¿Borrar este documento?')) { await borrar(COL.docs, d.id); walToast('Documento borrado') } }
  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileText size={16} className="text-brand-gold" />
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Documentos</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{docs.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-32"><option>Licencia</option><option>SSN / ID</option><option>Seguro</option><option>Vehículo</option><option>Otro</option></Select>
          <Boton variant="ghost" onClick={() => inputRef.current?.click()} disabled={subiendo}>{subiendo ? <Spinner /> : <><Upload size={14} /> Subir</>}</Boton>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </div>
      {docs.length === 0 && <div className="text-sm text-slate-400">Sin documentos. Sube licencia, ID, seguro… como foto o PDF.</div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 transition hover:border-brand-gold/40 dark:border-slate-700">
            {d.kind === 'image'
              ? <img src={d.dataURL} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-700"><FileText size={18} /></span>}
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-brand-navy dark:text-slate-100">{d.nombre}</div><div className="text-[10px] text-slate-400">{d.tipo} · {d.fecha}</div></div>
            <button onClick={() => abrir(d)} title="Ver" className="shrink-0 text-slate-400 hover:text-brand-navy dark:hover:text-white"><Eye size={14} /></button>
            <button onClick={() => bajar(d)} title="Descargar" className="shrink-0 text-slate-400 hover:text-brand-navy dark:hover:text-white"><Download size={14} /></button>
            <button onClick={() => quitar(d)} title="Borrar" className="shrink-0 text-slate-400 hover:text-rose-500"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Se guardan cifrados por las reglas (solo el dueño). Las fotos se optimizan automáticamente; para PDF usa archivos de hasta ~650 KB.</p>
    </Card>
  )
}
function MiniStat({ l, v, ambar }) {
  return <div className="rounded-xl border border-slate-200 bg-surface-card p-3 dark:border-slate-700 dark:bg-surface-dark-card"><div className={`font-mono text-lg font-extrabold ${ambar ? 'text-amber-600' : 'text-brand-navy dark:text-slate-100'}`}>{v}</div><div className="text-[10px] font-semibold text-slate-500">{l}</div></div>
}

// ── DATOS BANCARIOS (cifrados en el servidor) ───────────────────────────────
function BankSection({ driverId }) {
  const [info, setInfo] = useState(undefined) // undefined=cargando · null=sin datos · obj=enmascarado
  const [editar, setEditar] = useState(false)
  const [rev, setRev] = useState(null)
  const [cargRev, setCargRev] = useState(false)
  useEffect(() => {
    if (!driverId) { setInfo(null); return }
    return onSnapshot(doc(db, 'wal_bank', driverId), (s) => setInfo(s.exists() ? s.data() : null), () => setInfo(null))
  }, [driverId])
  const revelar = async () => {
    setCargRev(true)
    try { const r = await httpsCallable(getFunctions(), 'walBankReveal')({ driverId }); setRev(r.data); setTimeout(() => setRev(null), 25000) }
    catch (e) { window.alert('No se pudo revelar: ' + (e.message || e)) } finally { setCargRev(false) }
  }
  if (editar) return <Card className="mt-4 p-4"><BankEditor driverId={driverId} inicial={info} onCerrar={() => setEditar(false)} /></Card>
  return (
    <Card className="mt-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CreditCard size={16} className="text-brand-gold" />
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Datos bancarios</span>
        <ShieldCheck size={14} className="text-emerald-500" title="Cifrado en el servidor" />
        <span className="text-[11px] text-slate-400">cifrado · solo el dueño</span>
        {info && <button className="ml-auto text-xs font-semibold text-brand-gold hover:underline" onClick={() => setEditar(true)}>editar</button>}
      </div>
      {info === undefined && <Spinner />}
      {info === null && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Sin datos bancarios.</span>
          <Boton variant="ghost" onClick={() => setEditar(true)}><Plus size={14} /> Agregar</Boton>
        </div>
      )}
      {info && info !== undefined && (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Dato l="Titular" v={info.titular} />
          <Dato l="Banco" v={info.banco} />
          <Dato l="Tipo" v={info.tipo === 'savings' ? 'Savings' : 'Checking'} />
          <Dato l="Routing" v={rev ? rev.routing : `•••••${info.routingLast4 || ''}`} badge={info.routingValido ? 'válido' : 'revisar'} />
          <Dato l="Cuenta" v={rev ? rev.account : `••••••${info.accountLast4 || ''}`} />
          <div className="flex items-end">
            <Boton variant="ghost" disabled={cargRev} onClick={rev ? () => setRev(null) : revelar}>
              {cargRev ? <Spinner /> : rev ? <><EyeOff size={14} /> Ocultar</> : <><Eye size={14} /> Revelar</>}
            </Boton>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Se guarda para que un usuario autorizado consulte al registrar al driver en el banco. Guardarlo no inicia transferencias. La validación del routing es de formato, no confirma la cuenta. Cada acceso queda auditado sin los números.</p>
    </Card>
  )
}

function Dato({ l, v, badge }) {
  return <div><div className="text-[10px] font-bold uppercase text-slate-400">{l}</div><div className="font-mono text-sm text-brand-navy dark:text-slate-100">{v || '—'} {badge && <span className={`ml-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${badge === 'válido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{badge}</span>}</div></div>
}

function BankEditor({ driverId, inicial, onCerrar }) {
  const [f, setF] = useState({ titular: inicial?.titular || '', banco: inicial?.banco || '', tipo: inicial?.tipo || 'checking', routing: '', account: '', account2: '' })
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const salvar = async () => {
    const routing = f.routing.replace(/\D/g, ''); const account = f.account.replace(/\D/g, '')
    if (!routing || routing.length !== 9) { setErr('El routing debe tener 9 dígitos.'); return }
    if (!account) { setErr('Escribe el número de cuenta.'); return }
    if (account !== f.account2.replace(/\D/g, '')) { setErr('El número de cuenta y su confirmación no coinciden.'); return }
    setErr(''); setGuardando(true)
    try {
      await httpsCallable(getFunctions(), 'walBankSave')({ driverId, titular: f.titular, banco: f.banco, tipo: f.tipo, routing, account })
      onCerrar()
    } catch (e) { setErr('No se pudo guardar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><CreditCard size={16} className="text-brand-gold" /> Datos bancarios (se cifran al guardar)</div>
      <Grid>
        <F label="Nombre del titular"><Input value={f.titular} onChange={(e) => set('titular', e.target.value)} /></F>
        <F label="Banco"><Input list="wal-bancos" value={f.banco} onChange={(e) => set('banco', e.target.value)} placeholder="Busca o escribe…" /><datalist id="wal-bancos">{BANCOS_USA.map((b) => <option key={b} value={b} />)}</datalist></F>
        <F label="Tipo de cuenta"><Select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="checking">Checking</option><option value="savings">Savings</option></Select></F>
        <F label="Routing number (9 dígitos)"><Input inputMode="numeric" value={f.routing} onChange={(e) => set('routing', e.target.value)} placeholder="000000000" /></F>
        <F label="Número de cuenta"><Input inputMode="numeric" value={f.account} onChange={(e) => set('account', e.target.value)} /></F>
        <F label="Confirmar número de cuenta"><Input inputMode="numeric" value={f.account2} onChange={(e) => set('account2', e.target.value)} /></F>
      </Grid>
      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar cifrado'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Se guardan como texto (conserva ceros iniciales), cifrados en el servidor. No se incluyen en contratos ni comprobantes.</p>
    </div>
  )
}

// ── ALMACENES ───────────────────────────────────────────────────────────────
function TabAlmacenes({ almacenes, user }) {
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)
  const sembrar = async () => { const n = await sembrarAlmacenes(); setMsg(n ? `Se crearon ${n} almacén(es): Salt Lake y/o Frisco.` : 'Salt Lake y Frisco ya existen.') }
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setEdit({ activo: true })}><Plus size={15} /> Nuevo almacén</Boton>}>Almacenes Walmart</PageTitle>
      {almacenes.length === 0 && <Aviso tipo="info" className="mb-3">No hay almacenes. Crea los tuyos o usa <button className="font-semibold text-brand-gold underline" onClick={sembrar}>crear Salt Lake y Frisco</button>.</Aviso>}
      {msg && <Aviso tipo="ok" className="mb-3">{msg}</Aviso>}
      {edit && <EditorAlmacen almacen={edit} user={user} onCerrar={() => setEdit(null)} />}
      <div className="space-y-2">
        {almacenes.map((a) => (
          <Card key={a.id} className={FILA}>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: WALMART_AZUL }}><WhIcon size={15} /></span>
            <span className="font-bold text-brand-navy dark:text-slate-100">{a.nombre}</span>
            <span className="text-xs text-slate-400">{[a.ciudad, a.estado].filter(Boolean).join(', ')}{a.zonaHoraria ? ` · ${a.zonaHoraria}` : ''}</span>
            <Badge color={a.activo === false ? 'red' : 'green'}>{a.activo === false ? 'Inactivo' : 'Activo'}</Badge>
            <button className="ml-auto text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEdit(a)}>editar</button>
          </Card>
        ))}
      </div>
    </div>
  )
}

function EditorAlmacen({ almacen, user, onCerrar }) {
  const [a, setA] = useState({ nombre: '', direccion: '', ciudad: '', estado: '', zonaHoraria: '', responsable: '', tarifaWalmart: '', activo: true, ...almacen })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }))
  const salvar = async () => {
    if (!a.nombre.trim()) { window.alert('Ponle nombre al almacén.'); return }
    setGuardando(true)
    try { await guardar(COL.almacenes, almacen.id, a); await auditar('almacen_guardado', a.nombre); walToast('Almacén guardado ✓'); onCerrar() } finally { setGuardando(false) }
  }
  return (
    <Card className="mb-4 p-4">
      <Grid>
        <F label="Nombre"><Input value={a.nombre} onChange={(e) => set('nombre', e.target.value)} /></F>
        <F label="Dirección"><Input value={a.direccion} onChange={(e) => set('direccion', e.target.value)} /></F>
        <F label="Ciudad"><Input value={a.ciudad} onChange={(e) => set('ciudad', e.target.value)} /></F>
        <F label="Estado"><Input value={a.estado} onChange={(e) => set('estado', e.target.value)} placeholder="UT, TX…" /></F>
        <F label="Zona horaria"><Input value={a.zonaHoraria} onChange={(e) => set('zonaHoraria', e.target.value)} placeholder="America/Denver" /></F>
        <F label="Responsable"><Input value={a.responsable} onChange={(e) => set('responsable', e.target.value)} /></F>
        <F label="Ingreso de Walmart por ruta (USD)"><Input type="number" value={a.tarifaWalmart} onChange={(e) => set('tarifaWalmart', e.target.value)} placeholder={`por defecto ${TARIFAS_DEFAULT.ingresoWalmart}`} /></F>
      </Grid>
      <p className="mt-1 text-[11px] text-slate-400">Este es el precio que paga Walmart por cada ruta de este almacén. Se usa automáticamente al crear rutas aquí.</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={a.activo !== false} onChange={(e) => set('activo', e.target.checked)} className="accent-brand-gold" /> Activo</label>
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
        {almacen.id && <button className="ml-auto text-sm font-semibold text-rose-400 hover:text-rose-600" onClick={async () => { if (window.confirm('¿Borrar almacén?')) { await borrar(COL.almacenes, almacen.id); onCerrar() } }}>Borrar</button>}
      </div>
    </Card>
  )
}

// ── CONFIG (tarifas) ────────────────────────────────────────────────────────
// ── HISTORIAL DE CAMBIOS (auditoría) ─────────────────────────────────────────
// Muestra el registro de wal_audit: quién hizo qué y cuándo. Solo lectura.
const ACCION_LABEL = {
  persona_creada: 'Driver creado', persona_editada: 'Driver editado', persona_archivada: 'Driver archivado', persona_borrada: 'Driver borrado',
  rate_driver: 'Pago por ruta cambiado', foto_driver: 'Foto de driver', doc_driver: 'Documento de driver',
  almacen_guardado: 'Almacén guardado', tarifas_guardadas: 'Tarifas guardadas',
  factura_generada: 'Factura generada', pago_masivo: 'Pago masivo', rutas_generadas: 'Rutas generadas desde agenda',
  rutas_importadas: 'Rutas importadas de Walmart', fastpay: 'Fast Pay',
}
function fechaAudit(f) {
  try { const d = f?.toDate ? f.toDate() : (f?.seconds ? new Date(f.seconds * 1000) : null); return d ? d.toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—' } catch { return '—' }
}
function TabHistorial() {
  const [docs, setDocs] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => suscribir(COL.audit, setDocs), [])
  const lista = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return (docs || [])
      .filter((d) => !txt || `${ACCION_LABEL[d.accion] || d.accion} ${d.detalle || ''} ${d.correo || ''}`.toLowerCase().includes(txt))
      .sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0))
      .slice(0, 400)
  }, [docs, q])
  if (docs === null) return <Spinner />
  return (
    <div>
      <PageTitle>Historial de cambios</PageTitle>
      <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por acción, detalle o usuario…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800" /></div>
        <span className="text-xs text-slate-400">{lista.length} registro(s)</span>
      </Card>
      {lista.length === 0 && <Vacio icono={History}>Sin registros para este filtro.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((d) => (
          <Card key={d.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-brand-navy dark:bg-slate-700 dark:text-slate-100">{ACCION_LABEL[d.accion] || d.accion}</span>
            {d.detalle && <span className="text-sm text-slate-600 dark:text-slate-300">{d.detalle}</span>}
            <span className="ml-auto text-xs text-slate-400">{d.correo || '—'}</span>
            <span className="font-mono text-[11px] text-slate-400">{fechaAudit(d.fecha)}</span>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Se muestran los últimos 400 cambios. El registro es solo lectura.</p>
    </div>
  )
}

function TabConfig() {
  const [t, setT] = useState(null)
  useEffect(() => suscribir(COL.config, (docs) => setT({ ...TARIFAS_DEFAULT, ...(docs.find((d) => d.id === 'tarifas') || {}), id: 'tarifas' })), [])
  const [guardando, setGuardando] = useState(false)
  if (!t) return <Spinner />
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }))
  const num = (v) => Number(v) || 0
  const salvar = async () => {
    setGuardando(true)
    try {
      await guardar(COL.config, 'tarifas', { ingresoWalmart: num(t.ingresoWalmart), pagoDriverPropio: num(t.pagoDriverPropio), pagoDriverCompania: num(t.pagoDriverCompania), comisionFastPay: num(t.comisionFastPay), otIngreso: num(t.otIngreso), otPago: num(t.otPago) })
      await auditar('tarifas_guardadas', `WM ${t.ingresoWalmart} / propio ${t.pagoDriverPropio} / compañía ${t.pagoDriverCompania} / FP ${t.comisionFastPay}% / OT ${t.otIngreso}·${t.otPago}`)
      walToast('Tarifas guardadas ✓')
    } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle>Configuración de tarifas</PageTitle>
      <Card className="p-4">
        <p className="mb-3 text-xs text-slate-500">Estos son <b>valores por defecto</b>. El <b>ingreso por ruta</b> se define ahora en cada <b>almacén</b> y el <b>pago</b> en cada <b>driver</b>; estos solo se usan cuando el almacén o el driver no tienen su propio valor. Cada ruta guarda sus importes, así que cambiarlos luego no altera el historial.</p>
        <Grid>
          <F label="Ingreso de Walmart por ruta — por defecto (USD)"><Input type="number" value={t.ingresoWalmart} onChange={(e) => set('ingresoWalmart', e.target.value)} /></F>
          <F label="Pago driver propio — por defecto (USD)"><Input type="number" value={t.pagoDriverPropio} onChange={(e) => set('pagoDriverPropio', e.target.value)} /></F>
          <F label="Pago driver compañía — por defecto (USD)"><Input type="number" value={t.pagoDriverCompania} onChange={(e) => set('pagoDriverCompania', e.target.value)} /></F>
          <F label="Comisión de Fast Pay (%)"><Input type="number" step="0.5" value={t.comisionFastPay} onChange={(e) => set('comisionFastPay', e.target.value)} /></F>
          <F label="OT — Walmart paga por OT (USD)"><Input type="number" value={t.otIngreso} onChange={(e) => set('otIngreso', e.target.value)} /></F>
          <F label="OT — pago al driver por OT (USD)"><Input type="number" value={t.otPago} onChange={(e) => set('otPago', e.target.value)} /></F>
        </Grid>
        <p className="mt-2 text-[11px] text-slate-400">OT (overtime): por cada OT, Walmart te paga el primer valor y tú le pagas al driver el segundo. Se aplica al poner OT en una ruta y entra al Financiero y al invoice.</p>
        <Boton variant="gold" className="mt-4" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar tarifas'}</Boton>
      </Card>
    </div>
  )
}

// ── PORTAL DEL CHOFER (Walmart) ───────────────────────────────────────────────
// Solo lectura de SU propia información: rutas, pagos/Fast Pay + recibos,
// documentos, contratos y perfil. Consultas limitadas por driverId (las reglas
// de Firestore impiden ver datos de otros).
function WalmartDriverPortal({ driverId, email, tarifas, onSalir, onCambiar }) {
  const [ficha, setFicha] = useState(null)
  const [rutas, setRutas] = useState([])
  const [pagos, setPagos] = useState([])
  const [docs, setDocs] = useState([])
  const [contratos, setContratos] = useState([])
  const [sec, setSec] = useState('resumen') // resumen | rutas | pagos | docs | contratos
  const [firmar, setFirmar] = useState(null) // contrato a firmar
  const [w9Open, setW9Open] = useState(false)
  const [modo, setModo] = useState('semana') // semana | rango
  const [fecha, setFecha] = useState(hoyISO())
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  useEffect(() => suscribirMiFicha(driverId, setFicha), [driverId])
  useEffect(() => suscribirPorDriver(COL.rutas, driverId, setRutas), [driverId])
  useEffect(() => suscribirPorDriver(COL.pagos, driverId, setPagos), [driverId])
  useEffect(() => suscribirPorDriver(COL.docs, driverId, setDocs), [driverId])
  useEffect(() => suscribirPorDriver(COL.contratos, driverId, setContratos), [driverId])
  const [misSol, setMisSol] = useState([])
  useEffect(() => suscribirMisSolicitudes(driverId, setMisSol), [driverId])
  // La app del chofer SIEMPRE arranca y regresa al día actual (semana de hoy).
  useEffect(() => {
    const alDia = () => { if (document.visibilityState === 'visible') { setModo('semana'); setFecha(hoyISO()) } }
    document.addEventListener('visibilitychange', alDia)
    return () => document.removeEventListener('visibilitychange', alDia)
  }, [])
  const pedirFP = async (r) => {
    try { await solicitarFastPay({ ...r, bruto: gananciaDriver(r) }, ficha); walToast('Solicitud de Fast Pay enviada ✓', 'gold') }
    catch (e) { walToast('No se pudo enviar la solicitud: ' + (e?.message || e), 'red') }
  }
  const [pushOn, setPushOn] = useState(() => { try { return localStorage.getItem('wal_push_on') === '1' } catch { return false } })
  const [pushCerrado, setPushCerrado] = useState(() => { try { return localStorage.getItem('wal_push_ban') === '0' } catch { return false } })
  useEffect(() => { let unsub; escucharPush((payload) => { const n = payload?.notification; walToast((n?.title || 'Aviso') + (n?.body ? ' · ' + n.body : ''), 'gold') }).then((u) => { unsub = u }); return () => { if (typeof unsub === 'function') unsub() } }, [])
  const activarAvisosChofer = async () => {
    walToast('Activando avisos…', 'navy')
    const r = await activarPush(auth.currentUser?.uid, email)
    if (r.ok) { setPushOn(true); try { localStorage.setItem('wal_push_on', '1') } catch { /* noop */ } walToast('Avisos activados ✓ — te avisaremos de tus pagos', 'gold') }
    else walToast('No se pudieron activar: ' + r.motivo, 'red')
  }

  // Fast Pay HUÉRFANOS (cuya ruta ya no existe) no deben inflar lo que ve el
  // chofer: se ignoran los fastpay cuyo rutaId no corresponde a una ruta suya.
  // Así la app siempre muestra números que cuadran (adelantado ≤ ganado).
  const idsRutasOk = useMemo(() => new Set((rutas || []).filter((r) => r.estado === 'completada').map((r) => r.id)), [rutas])
  const pagosValidos = useMemo(
    () => (pagos || []).filter((p) => p.tipo !== 'fastpay' || !p.rutaId || idsRutasOk.has(p.rutaId)),
    [pagos, idsRutasOk],
  )

  // ACUMULADO HASTA HOY (todas sus rutas, no solo el período).
  const hist = useMemo(() => {
    const rc = (rutas || []).filter((r) => r.estado === 'completada')
    const totalGanado = money2(rc.reduce((a, r) => a + gananciaDriver(r), 0))
    const liquidadoFP = money2(pagosValidos.filter(fpLiquida).reduce((a, p) => a + (Number(p.bruto) || 0), 0))
    const efectivoFP = money2(pagosValidos.filter(fpLiquida).reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
    const pagadoNormal = money2(pagosValidos.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
    const saldo = money2(totalGanado - liquidadoFP - pagadoNormal)
    return { totalGanado, liquidadoFP, efectivoFP, pagadoNormal, saldo, nRutas: rc.length }
  }, [rutas, pagosValidos])

  // Rutas que el chofer puede pedir por Fast Pay (todas, sin adelanto ni solicitud).
  const disponible = useMemo(() => {
    const pedibles = (rutas || []).filter((r) => {
      if (r.estado !== 'completada') return false
      const liq = liquidadoFPruta(pagos, r.id)
      if (rutaBloqueadaFP(pagos, r.id) || liq > 0.005) return false
      if ((misSol || []).some((s) => s.rutaId === r.id && s.estado === 'solicitada')) return false
      return money2(gananciaDriver(r) - liq) > 0.005
    })
    const total = money2(pedibles.reduce((a, r) => a + (gananciaDriver(r) - liquidadoFPruta(pagos, r.id)), 0))
    return { pedibles, total }
  }, [rutas, pagos, misSol])
  const pedirTodo = async () => {
    if (!disponible.pedibles.length) return
    try {
      for (const r of disponible.pedibles) await solicitarFastPay({ ...r, bruto: gananciaDriver(r) }, ficha)
      walToast(`Solicitud de Fast Pay enviada por ${disponible.pedibles.length} ruta(s) ✓`, 'gold')
    } catch (e) { walToast('No se pudo enviar: ' + (e?.message || e), 'red') }
  }

  const semana = lunesDe(fecha)
  // Período efectivo (semana sábado→viernes, o rango de fechas). Agrega las
  // semanas que cruza el rango y junta rutas + movimientos.
  const detDesde = modo === 'semana' ? semana : (d1 <= d2 ? d1 : d2)
  const detHasta = modo === 'semana' ? domingoDe(fecha) : (d1 <= d2 ? d2 : d1)
  const weeks = useMemo(() => {
    if (modo === 'semana') return [semana]
    const out = []; let w = lunesDe(d1 <= d2 ? d1 : d2); const fin = lunesDe(d1 <= d2 ? d2 : d1); let g = 0
    while (w <= fin && g < 160) { out.push(w); const dd = new Date(`${w}T00:00:00`); dd.setDate(dd.getDate() + 7); w = dd.toISOString().slice(0, 10); g++ }
    return out
  }, [modo, semana, d1, d2])
  const res = useMemo(() => {
    if (!driverId) return null
    const acc = { totalGanado: 0, liquidadoFP: 0, efectivoFP: 0, comisiones: 0, enProcesoFP: 0, pagadoNormal: 0, saldo: 0 }
    let rutasSemana = [], pagosAll = []
    for (const w of weeks) {
      const r = resumenSemana(rutas, pagosValidos, driverId, w)
      for (const k in acc) acc[k] = money2(acc[k] + (r[k] || 0))
      rutasSemana = rutasSemana.concat(r.rutasSemana); pagosAll = pagosAll.concat(r.pagos)
    }
    rutasSemana.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    return { ...acc, rutasSemana, pagos: pagosAll }
  }, [driverId, rutas, pagosValidos, weeks]) // eslint-disable-line
  const nombre = ficha ? nombreCompleto(ficha) : (email || 'Chofer')
  const rutasSem = res ? res.rutasSemana : []
  const pagosPeriodo = res ? res.pagos : []
  const fpBadge = { pendiente: 'gold', confirmado: 'green', fallido: 'red', anulado: 'slate' }
  const contratosPend = (contratos || []).filter((c) => c.estado === 'pendiente_firma')
  // Control de período para el chofer: chips rápidos + flechas de semana. Más
  // fácil de tocar en el teléfono que los selectores de formulario.
  const semActual = lunesDe(fecha)
  const esEstaSem = modo === 'semana' && semActual === lunesDe(hoyISO())
  const esSemPasada = modo === 'semana' && semActual === lunesDe(sumarDias(hoyISO(), -7))
  const esEsteMes = modo === 'rango' && d1 === primerDiaMes(mesDe(hoyISO())) && d2 === hoyISO()
  const esPersonal = modo === 'rango' && !esEsteMes
  const chipPer = (label, on, onClick) => (
    <button type="button" onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${on ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`} style={on ? { background: WALMART_AZUL } : undefined}>{label}</button>
  )
  const fmtCorto = (iso) => { try { const d = new Date(iso + 'T12:00'); return d.toLocaleDateString('es-US', { day: 'numeric', month: 'short' }) } catch { return iso } }
  const FiltroPeriodo = (
    <Card className="mb-3 p-3">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {chipPer('Esta semana', esEstaSem, () => { setModo('semana'); setFecha(hoyISO()) })}
        {chipPer('Semana pasada', esSemPasada, () => { setModo('semana'); setFecha(sumarDias(hoyISO(), -7)) })}
        {chipPer('Este mes', esEsteMes, () => { setModo('rango'); setD1(primerDiaMes(mesDe(hoyISO()))); setD2(hoyISO()) })}
        {chipPer('Personalizado', esPersonal, () => { setModo('rango') })}
      </div>
      {modo === 'semana' ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
          <button type="button" onClick={() => setFecha(sumarDias(fecha, -7))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-brand-navy dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Semana anterior"><ChevronLeft size={20} /></button>
          <div className="text-center leading-tight">
            <div className="text-[14px] font-extrabold text-brand-navy dark:text-slate-100">{fmtCorto(detDesde)} – {fmtCorto(detHasta)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Semana · sáb → vie</div>
          </div>
          <button type="button" onClick={() => setFecha(sumarDias(fecha, 7))} disabled={semActual >= lunesDe(hoyISO())} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-brand-navy disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Semana siguiente"><ChevronRight size={20} /></button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F>
          <F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F>
          <span className="pb-2 text-xs font-semibold text-slate-400">{fmtCorto(detDesde)} – {fmtCorto(detHasta)}</span>
        </div>
      )}
    </Card>
  )

  if (!driverId) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface px-6 dark:bg-surface-dark">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: WALMART_AZUL }}><Users size={26} /></div>
          <h1 className="mt-4 text-xl font-extrabold text-brand-navy dark:text-slate-100">Portal del chofer</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">Tu cuenta aún no está vinculada a un perfil de chofer. Pide al administrador que te asocie.</p>
          <button onClick={onSalir} className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-600"><LogOut size={15} /> Cerrar sesión</button>
        </div>
      </div>
    )
  }
  const SECCIONES = [
    { id: 'resumen', label: 'Resumen', icono: LayoutDashboard },
    { id: 'rutas', label: 'Mis rutas', icono: RouteIcon },
    { id: 'pagos', label: 'Mis pagos', icono: Wallet },
    { id: 'docs', label: 'Documentos', icono: FileText },
    { id: 'contratos', label: 'Contratos', icono: FileSignature },
  ]
  return (
    <div className="min-h-screen bg-surface dark:bg-surface-dark">
      <Toaster />
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: WALMART_AZUL }}>W</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-brand-navy dark:text-slate-100">Hola, {String(nombre).split(' ')[0]}</div>
          <div className="text-[11px] text-slate-400">Portal del chofer · Walmart</div>
        </div>
        <button onClick={onSalir} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title="Cerrar sesión"><LogOut size={16} /></button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200/70 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/60">
        {SECCIONES.map((s) => { const I = s.icono; return (
          <button key={s.id} onClick={() => setSec(s.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${sec === s.id ? 'text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} style={sec === s.id ? { background: WALMART_AZUL } : undefined}><I size={14} /> {s.label}</button>
        ) })}
      </nav>

      <div className="mx-auto w-full max-w-3xl p-3 sm:p-5">
        {sec === 'resumen' && res && (
          <>
            {/* HERO "tarjeta de pago" (opción C): una sola tarjeta azul con el saludo
                dentro y el pendiente grande. Sin números negativos. */}
            <div className="relative mb-3 overflow-hidden rounded-3xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#0b2a4a,#0071dc)' }}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="relative mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-sm font-extrabold text-white">{(nombre || 'NE').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold leading-tight">Hola, {String(nombre).split(' ')[0]} 👋</div>
                  <div className="text-[11px] text-white/75">Portal del chofer</div>
                </div>
              </div>
              <div className="relative text-[10px] font-bold uppercase tracking-wide text-white/70">Pendiente por cobrar</div>
              <div className="relative font-mono text-[42px] font-extrabold leading-none">{dinero(Math.max(0, hist.saldo))}</div>
              <div className="relative mt-1.5 text-[12px] text-white/80">{Math.max(0, hist.saldo) > 0.005 ? 'Es lo que falta que te paguen.' : 'No tienes nada pendiente ✓'}</div>
            </div>
            {!pushOn && !pushCerrado && (
              <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
                <span className="text-sm">🔔 <b className="text-brand-navy dark:text-slate-100">Activa las notificaciones</b> para saber cuándo te pagan y te aprueban el Fast Pay.</span>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => { setPushCerrado(true); try { localStorage.setItem('wal_push_ban', '0') } catch { /* noop */ } }} className="text-xs font-semibold text-slate-400 hover:text-slate-600">ahora no</button>
                  <button onClick={activarAvisosChofer} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: WALMART_AZUL }}>Activar</button>
                </div>
              </Card>
            )}
            <div className="mb-3"><InstalarApp /></div>
            {contratosPend.length > 0 && (
              <Card className="mb-3 flex flex-wrap items-center gap-2 border-l-4 border-l-brand-gold p-3">
                <FileSignature size={16} className="text-brand-gold" />
                <span className="text-sm font-semibold text-brand-navy dark:text-slate-100">Tienes {contratosPend.length} contrato(s) <b>pendiente(s) de firma</b>.</span>
                <Boton variant="gold" className="ml-auto" onClick={() => setFirmar(contratosPend[0])}>Revisar y firmar</Boton>
              </Card>
            )}
            {/* Pedir Fast Pay de TODO lo disponible (todas las rutas acumuladas) */}
            {disponible.total > 0.005 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-4 text-white shadow-lg" style={{ background: 'linear-gradient(120deg,#0071dc,#004f9a)' }}>
                <Zap size={20} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold">Pedir Fast Pay de todo</div>
                  <div className="text-[11px] text-white/80">{disponible.pedibles.length} ruta(s) sin adelanto · disponible <b className="font-mono">{dinero(disponible.total)}</b></div>
                </div>
                <button onClick={pedirTodo} className="ml-auto rounded-xl bg-white px-4 py-2 text-sm font-extrabold" style={{ color: WALMART_AZUL }}>Pedir todo</button>
              </div>
            )}
            <p className="px-1 text-[11px] text-slate-400">Pide Fast Pay de una ruta en <b>Mis rutas</b>. En <b>Mis pagos</b> ves el detalle por semana.</p>
          </>
        )}

        {sec === 'rutas' && (
          <>
          {FiltroPeriodo}
          <Card className="p-0">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Mis rutas · {detDesde} → {detHasta}</div>
            {rutasSem.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin rutas en el período.</div>}
            {rutasSem.map((r) => {
              const liq = liquidadoFPruta(pagos, r.id)
              const bloqueado = rutaBloqueadaFP(pagos, r.id) || liq > 0.005
              const sol = misSol.find((s) => s.rutaId === r.id)
              const puedePedir = r.estado === 'completada' && !bloqueado && money2(gananciaDriver(r) - liq) > 0.005
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                  <span className="font-mono text-xs text-slate-400">{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label || ''}</span>
                  {r.identificador && <span className="text-xs text-slate-400">{r.identificador}</span>}
                  <Badge color={estadoRutaInfo(r.estado).color === 'green' ? 'green' : estadoRutaInfo(r.estado).color === 'red' ? 'red' : 'slate'}>{estadoRutaInfo(r.estado).label}</Badge>
                  {r.goHome && <Badge color="gold">🏠 GO Home</Badge>}
                  <span className="ml-auto font-mono font-semibold">{dinero(gananciaDriver(r))}</span>
                  {bloqueado ? <Badge color="green">adelantado ✓</Badge>
                    : sol ? <Badge color={sol.estado === 'rechazada' ? 'red' : sol.estado === 'atendida' ? 'green' : 'gold'}>{sol.estado === 'solicitada' ? 'Fast Pay solicitado' : sol.estado === 'atendida' ? 'Aprobado' : 'Rechazado'}</Badge>
                    : puedePedir ? <button onClick={() => pedirFP(r)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-white" style={{ background: WALMART_AZUL }}><Zap size={12} /> Pedir Fast Pay</button>
                    : null}
                </div>
              )
            })}
          </Card>
          </>
        )}

        {sec === 'pagos' && (
          <>
            {FiltroPeriodo}
            {res && (
              <Card className="mb-3 p-3 text-sm">
                <div className="mb-2 font-bold text-brand-navy dark:text-slate-100">Liquidación del período</div>
                <div className="flex justify-between"><span className="text-slate-500">Total ganado</span><b className="font-mono">{dinero(res.totalGanado)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Adelantado por Fast Pay (efectivo)</span><b className="font-mono">{dinero(res.efectivoFP)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Otros pagos recibidos</span><b className="font-mono">{dinero(res.pagadoNormal)}</b></div>
                <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 dark:border-slate-700"><span className="font-semibold">Por cobrar</span><b className="font-mono" style={{ color: Math.max(0, res.saldo) > 0.005 ? '#D9822B' : '#2E9E6B' }}>{dinero(Math.max(0, res.saldo))}</b></div>
                {ficha && res.rutasSemana.length > 0 && <Boton variant="ghost" className="mt-3" onClick={() => pdfPayStub(ficha, detDesde, detHasta, res)}><Download size={14} /> Descargar comprobante (PDF)</Boton>}
              </Card>
            )}
            <Card className="p-0">
              <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Mis recibos y movimientos</div>
              {pagosPeriodo.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin movimientos en el período.</div>}
              {pagosPeriodo.filter((p) => !(p.tipo === 'fastpay' && (estadoFP(p) === 'anulado' || estadoFP(p) === 'fallido'))).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((p, i) => {
                const est = p.tipo === 'fastpay' ? estadoFP(p) : null
                return (
                  <div key={p.id || i} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2 text-sm last:border-0 dark:border-slate-800/60">
                    <Badge color={p.tipo === 'fastpay' ? 'gold' : 'navy'}>{p.tipo === 'fastpay' ? 'Fast Pay' : 'Pago'}</Badge>
                    {est && <Badge color={fpBadge[est]}>{ESTADO_FP_LABEL[est]}</Badge>}
                    <span className="font-mono text-xs text-slate-400">{p.fecha}</span>
                    {p.tipo === 'fastpay'
                      ? <span className="text-xs">recibiste <b>{dinero(p.efectivo)}</b> <span className="text-slate-400">(de {dinero(p.bruto)}, comisión {dinero(p.comision)})</span></span>
                      : <span className="text-xs">recibiste <b>{dinero(p.monto)}</b></span>}
                    {p.comprobante && <span className="text-xs italic text-slate-400">· {p.comprobante}</span>}
                    {p.tipo === 'fastpay' && est === 'confirmado' && <button onClick={() => pdfReciboFP(p, ficha)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline"><Download size={12} /> recibo</button>}
                  </div>
                )
              })}
            </Card>
          </>
        )}

        {sec === 'docs' && (() => {
          const w9 = (docs || []).find((d) => d.tipo === 'W-9')
          return (
            <>
              {/* W-9 — flujo independiente (autocompletado + firma propia) */}
              <Card className="mb-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText size={16} className="text-brand-gold" />
                  <span className="font-bold text-brand-navy dark:text-slate-100">Formulario W-9</span>
                  {w9 ? <Badge color="green">Firmado</Badge> : <Badge color="gold">Pendiente</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    {w9 && w9.dataURL && <a href={w9.dataURL} download="W-9.pdf" className="text-xs font-bold text-brand-gold hover:underline">descargar</a>}
                    <Boton variant={w9 ? 'ghost' : 'gold'} onClick={() => setW9Open(true)}>{w9 ? 'Firmar de nuevo' : 'Completar y firmar'}</Boton>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">El W-9 es tu certificación fiscal (nombre, dirección y número de identificación/SSN). Es <b>independiente</b> del contrato: llénalo y fírmalo aquí. {w9 ? `Última firma: ${w9.fecha || ''}${w9.ssnLast4 ? ` · SSN ••${w9.ssnLast4}` : ''}.` : ''}</p>
              </Card>

              <Card className="p-0">
                <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Mis documentos</div>
                {(docs || []).length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin documentos.</div>}
                {(docs || []).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                    <FileText size={15} className="text-slate-400" />
                    <span className="font-semibold text-brand-navy dark:text-slate-100">{d.nombre || d.tipo || 'Documento'}</span>
                    {d.tipo === 'W-9' && <Badge color="green">W-9</Badge>}
                    <span className="text-xs text-slate-400">{d.fecha}</span>
                    {d.dataURL && <a href={d.dataURL} download={d.nombre || 'documento'} className="ml-auto text-xs font-bold text-brand-gold hover:underline">descargar</a>}
                  </div>
                ))}
              </Card>
            </>
          )
        })()}

        {sec === 'contratos' && (
          <Card className="p-0">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Mis contratos</div>
            {(contratos || []).length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin contratos.</div>}
            {(contratos || []).map((c) => {
              const pend = c.estado === 'pendiente_firma'
              const firmado = c.estado === 'firmado'
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                  <FileSignature size={15} className="text-slate-400" />
                  <span className="font-semibold text-brand-navy dark:text-slate-100">{c.titulo || 'Contrato'}</span>
                  <Badge color={firmado ? 'green' : c.estado === 'anulado' ? 'slate' : 'gold'}>{firmado ? 'Firmado' : c.estado === 'anulado' ? 'Anulado' : 'Pendiente de firma'}</Badge>
                  <div className="ml-auto flex items-center gap-3">
                    {pend && <Boton variant="gold" onClick={() => setFirmar(c)}><FileSignature size={13} /> Revisar y firmar</Boton>}
                    {firmado && <button className="text-xs font-bold text-brand-gold hover:underline" onClick={() => pdfContrato(c, true)}>descargar PDF firmado</button>}
                    {!pend && !firmado && <button className="text-xs font-semibold text-slate-500 hover:text-brand-navy" onClick={() => setFirmar(c)}>ver</button>}
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </div>
      {firmar && <FirmarContratoModal contrato={firmar} nombreDefault={nombre} onCerrar={() => setFirmar(null)} />}
      {w9Open && <W9Modal ficha={ficha} driverId={driverId} nombreDefault={nombre} onCerrar={() => setW9Open(false)} />}
    </div>
  )
}

// W-9 del chofer: autocompletado desde su ficha + firma propia, independiente
// del contrato. Genera el PDF en el navegador y lo guarda vía Cloud Function.
// Rellena el W-9 OFICIAL del IRS (public/w9/fw9.pdf) con los campos reales del
// formulario + firma y fecha dibujadas sobre la línea. Devuelve el PDF en base64.
async function generarW9OficialBase64({ nombre, businessName, clasificacion, direccion, ciudadEstadoZip, ssn, firmante, fecha }) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const bytes = await fetch('/w9/fw9.pdf').then((r) => { if (!r.ok) throw new Error('No se encontró el formulario oficial del IRS.'); return r.arrayBuffer() })
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const P = 'topmostSubform[0].Page1[0].'
  const setT = (n, v) => { try { form.getTextField(n).setText(v || '') } catch { /* campo ausente */ } }
  const chk = (n) => { try { form.getCheckBox(n).check() } catch { /* ausente */ } }
  setT(P + 'f1_01[0]', nombre)
  setT(P + 'f1_02[0]', businessName)
  const idx = { 'Individual / sole proprietor': 0, 'C Corporation': 1, 'S Corporation': 2, 'Partnership': 3, 'Trust/estate': 4, 'LLC': 5, 'Other': 6 }[clasificacion]
  chk(P + `Boxes3a-b_ReadOrder[0].c1_1[${idx == null ? 0 : idx}]`)
  setT(P + 'Address_ReadOrder[0].f1_07[0]', direccion)
  setT(P + 'Address_ReadOrder[0].f1_08[0]', ciudadEstadoZip)
  const d = String(ssn).replace(/\D/g, '')
  setT(P + 'f1_11[0]', d.slice(0, 3)); setT(P + 'f1_12[0]', d.slice(3, 5)); setT(P + 'f1_13[0]', d.slice(5, 9))
  const page = pdf.getPages()[0]
  const fo = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const fn = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(String(firmante || nombre || ''), { x: 140, y: 212, size: 12, font: fo })
  page.drawText(String(fecha || ''), { x: 430, y: 212, size: 11, font: fn })
  form.flatten()
  const outBytes = await pdf.save()
  let bin = ''; const u = new Uint8Array(outBytes); const CH = 0x8000
  for (let i = 0; i < u.length; i += CH) bin += String.fromCharCode.apply(null, u.subarray(i, i + CH))
  return btoa(bin)
}

function W9Modal({ ficha, driverId, nombreDefault, onCerrar }) {
  const dirDefault = ficha?.direccion || ''
  const czDefault = [ficha?.ciudad, ficha?.estado, ficha?.zip || ficha?.codigoPostal].filter(Boolean).join(', ')
  const [f, setF] = useState({
    nombre: nombreDefault || (ficha ? nombreCompleto(ficha) : ''),
    businessName: '', clasificacion: 'Individual / sole proprietor',
    direccion: dirDefault, ciudadEstadoZip: czDefault, ssn: '',
  })
  const [acepto, setAcepto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const ssnFmt = (s) => { const d = String(s).replace(/\D/g, '').slice(0, 9); return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d }
  const [ssnRecordado, setSsnRecordado] = useState(false)
  // Si el SSN ya está guardado (cifrado), lo prellenamos para no pedirlo de nuevo.
  useEffect(() => {
    if (!driverId) return
    httpsCallable(getFunctions(), 'walTaxReveal')({ driverId })
      .then((r) => { if (r?.data?.ssn) { setF((x) => ({ ...x, ssn: ssnFmt(r.data.ssn) })); setSsnRecordado(true) } })
      .catch(() => { /* sin SSN guardado o función no desplegada: se pide normal */ })
  }, [driverId]) // eslint-disable-line
  const guardar = async () => {
    const ssnDig = String(f.ssn).replace(/\D/g, '')
    if (!f.nombre.trim()) { setErr('Escribe tu nombre completo.'); return }
    if (!f.direccion.trim() || !f.ciudadEstadoZip.trim()) { setErr('Completa tu dirección, ciudad, estado y código postal.'); return }
    if (ssnDig.length !== 9) { setErr('El SSN debe tener 9 dígitos.'); return }
    if (!acepto) { setErr('Marca la casilla de certificación para firmar.'); return }
    setErr(''); setEnviando(true)
    try {
      const base64 = await generarW9OficialBase64({
        nombre: f.nombre.trim(), businessName: f.businessName.trim(), clasificacion: f.clasificacion,
        direccion: f.direccion.trim(), ciudadEstadoZip: f.ciudadEstadoZip.trim(),
        ssn: ssnDig, firmante: f.nombre.trim(), fecha: new Date().toLocaleDateString(),
      })
      const dataURL = `data:application/pdf;base64,${base64}`
      await httpsCallable(getFunctions(), 'walW9Set')({ driverId, dataURL, nombreFirmante: f.nombre.trim(), ssnLast4: ssnDig.slice(-4) })
      // Guarda el SSN CIFRADO para que el próximo W-9 salga automático.
      try { await httpsCallable(getFunctions(), 'walTaxSave')({ driverId, ssn: ssnDig }) } catch { /* no bloquea el W-9 */ }
      walToast('W-9 firmado y guardado ✓', 'gold')
      onCerrar()
    } catch (e) { setErr(e?.message || 'No se pudo guardar el W-9.') } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Formulario W-9 · certificación fiscal" onCerrar={onCerrar}>
      {/* Datos que YA están en tu perfil (confirmación, no se vuelven a pedir) */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/40">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tus datos (de tu perfil)</span>
          <button type="button" onClick={() => setEditando((v) => !v)} className="ml-auto text-xs font-semibold text-brand-gold hover:underline">{editando ? 'ocultar' : 'corregir'}</button>
        </div>
        {!editando ? (
          <div className="space-y-0.5 text-slate-600 dark:text-slate-300">
            <div><b className="text-brand-navy dark:text-slate-100">{f.nombre || '—'}</b></div>
            <div className="text-xs">{f.direccion || '(sin dirección)'}{f.ciudadEstadoZip ? ` · ${f.ciudadEstadoZip}` : ''}</div>
            <div className="text-xs">{f.clasificacion}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F label="Nombre (como en tu declaración)"><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></F></div>
            <F label="Nombre de negocio (si aplica)"><Input value={f.businessName} onChange={(e) => set('businessName', e.target.value)} /></F>
            <F label="Clasificación fiscal"><Select value={f.clasificacion} onChange={(e) => set('clasificacion', e.target.value)}>{['Individual / sole proprietor', 'C Corporation', 'S Corporation', 'Partnership', 'LLC', 'Trust/estate', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}</Select></F>
            <div className="sm:col-span-2"><F label="Dirección (número y calle)"><Input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} /></F></div>
            <div className="sm:col-span-2"><F label="Ciudad, estado y código postal"><Input value={f.ciudadEstadoZip} onChange={(e) => set('ciudadEstadoZip', e.target.value)} placeholder="Houston, TX 77001" /></F></div>
          </div>
        )}
      </div>
      {/* SSN: se guarda CIFRADO para autocompletar el próximo W-9 */}
      <F label={`Número de Seguro Social (SSN)${ssnRecordado ? ' · guardado ✓' : ''}`}><Input value={f.ssn} onChange={(e) => { set('ssn', ssnFmt(e.target.value)); setSsnRecordado(false) }} placeholder="000-00-0000" inputMode="numeric" /></F>
      <p className="mt-1 text-[11px] text-slate-400">{ssnRecordado ? 'Tu SSN está guardado cifrado; solo se usa para generar tu W-9.' : 'Se guarda cifrado (como los datos bancarios) y se usa solo para tu W-9; la próxima vez saldrá automático.'}</p>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5" /> <span>Bajo pena de perjurio, certifico que la información es correcta, que el número es mi identificación fiscal y que soy una persona de EE. UU. Firmo con mi nombre.</span></label>
      <p className="mt-2 text-[11px] text-slate-400">¿Prefieres el PDF oficial del IRS? <a href={W9_OFICIAL_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-gold hover:underline">Ábrelo aquí</a> y súbelo como documento.</p>
      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={enviando} onClick={guardar}>{enviando ? <Spinner /> : 'Generar, firmar y guardar W-9'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </Modal>
  )
}

// Firma de un contrato DESDE el portal del chofer. Reutiliza el MISMO flujo
// existente (Cloud Function walFirmaSet con el token del contrato); no crea otro
// generador. Si faltan datos de la plantilla (quedan {{campos}} sin rellenar),
// se avisa y NO se permite firmar.
function FirmarContratoModal({ contrato, nombreDefault, onCerrar }) {
  const [nombre, setNombre] = useState(contrato.firmanteNombre || nombreDefault || contrato.driverNombre || '')
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(contrato.estado === 'firmado')
  const canvasRef = useRef(null)
  const yaFirmado = contrato.estado === 'firmado' || ok
  const texto = contrato.textoRenderizado || ''
  const faltan = (texto.match(/\{\{\s*[\w.]+\s*\}\}/g) || []) // placeholders sin rellenar
  const limpiarFirma = () => { const cv = canvasRef.current; if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height) }
  const firmar = async () => {
    const cv = canvasRef.current
    if (faltan.length) { setErr('Faltan datos obligatorios en el contrato. Pide al administrador que los complete antes de firmar.'); return }
    if (!cv || lienzoVacio(cv)) { setErr('Dibuja tu firma en el recuadro.'); return }
    if (!nombre.trim()) { setErr('Escribe tu nombre.'); return }
    if (!acepto) { setErr('Marca la casilla de consentimiento.'); return }
    if (!contrato.signingToken) { setErr('Este contrato no tiene enlace de firma. Pide al administrador que lo regenere.'); return }
    setErr(''); setEnviando(true)
    try {
      await httpsCallable(getFunctions(), 'walFirmaSet')({ token: contrato.signingToken, firma: cv.toDataURL('image/png'), nombreFirmante: nombre.trim() })
      setOk(true)
      walToast('Contrato firmado ✓', 'gold')
    } catch (e) { setErr(e?.message || 'No se pudo firmar.') } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={contrato.titulo || 'Contrato'} onCerrar={onCerrar}>
      {contrato.empresa && <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-brand-gold">{contrato.empresa}</div>}
      <div className="mb-3 max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-800/40">
        <pre className="whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-200">{texto}</pre>
      </div>
      {yaFirmado ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="font-bold text-emerald-700 dark:text-emerald-300">✅ Contrato firmado</div>
          {contrato.firma && <img src={contrato.firma} alt="firma" className="mt-2 h-16 rounded border border-slate-200 bg-white" />}
          <div className="mt-2"><Boton variant="ghost" onClick={() => pdfContrato({ ...contrato, estado: 'firmado' }, true)}>Descargar PDF firmado</Boton></div>
        </div>
      ) : (
        <>
          {faltan.length > 0 && <Aviso tipo="warn" className="mb-2">Faltan datos obligatorios en el contrato. No puedes firmarlo hasta que el administrador los complete.</Aviso>}
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tu firma</div>
          <p className="mb-1 text-xs text-slate-400">Dibújala con el dedo o el mouse.</p>
          <canvas ref={canvasRef} width={600} height={180} className="w-full rounded-xl border border-dashed border-brand-gold bg-white" style={{ height: 150, touchAction: 'none' }}
            onMouseDown={(e) => lienzoStart(e, canvasRef)} onMouseMove={(e) => lienzoMove(e, canvasRef)} onMouseUp={() => lienzoEnd()} onMouseLeave={() => lienzoEnd()}
            onTouchStart={(e) => lienzoStart(e, canvasRef)} onTouchMove={(e) => lienzoMove(e, canvasRef)} onTouchEnd={() => lienzoEnd()} />
          <button type="button" onClick={limpiarFirma} className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-600">Borrar firma</button>
          <div className="mt-3"><F label="Tu nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></F></div>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5" /> He revisado el documento completo y acepto firmarlo electrónicamente.</label>
          {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
          <div className="mt-3 flex gap-2">
            <Boton variant="gold" disabled={enviando || faltan.length > 0} onClick={firmar}>{enviando ? <Spinner /> : 'Firmar y finalizar'}</Boton>
            <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
          </div>
        </>
      )}
    </Modal>
  )
}
// Lienzo de firma (compartido): estado de dibujo a nivel de módulo.
let _lienzoDibujando = false
function lienzoPos(e, cv) { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) } }
function lienzoStart(e, ref) { e.preventDefault(); _lienzoDibujando = true; const cv = ref.current; const ctx = cv.getContext('2d'); const p = lienzoPos(e, cv); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
function lienzoMove(e, ref) { if (!_lienzoDibujando) return; e.preventDefault(); const cv = ref.current; const ctx = cv.getContext('2d'); const p = lienzoPos(e, cv); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#13233f'; ctx.lineTo(p.x, p.y); ctx.stroke() }
function lienzoEnd() { _lienzoDibujando = false }
function lienzoVacio(cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false; return true }

// ── USUARIOS Y PERMISOS (Walmart) ─────────────────────────────────────────────
function TabUsuariosWal({ almacenes, personas, perm }) {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editar, setEditar] = useState(null) // usuario a editar, o {} para nuevo
  useEffect(() => suscribirUsuariosWal((u) => { setUsuarios(u); setCargando(false) }), [])
  const nombreAlm = Object.fromEntries(almacenes.map((a) => [a.id, a.nombre]))
  const puedeCrear = perm.owner || perm.permisos?.usuarios_crear
  const puedeEditar = perm.owner || perm.permisos?.usuarios_editar
  return (
    <div>
      <PageTitle>Usuarios y permisos de Walmart</PageTitle>
      <Aviso tipo="info" className="mb-3">Estos usuarios y permisos son <b>exclusivos de Walmart</b> (no afectan a otros módulos). La aplicación real se hace también en el backend (reglas de Firestore). El dueño siempre tiene acceso total.</Aviso>
      <div className="mb-3 flex items-center gap-2">
        {puedeCrear && <Boton variant="gold" onClick={() => setEditar({ nuevo: true, rol: 'manager', permisos: { ...PLANTILLA_ROL.manager }, warehouses: [], activo: true })}><Plus size={14} /> Agregar usuario</Boton>}
        <span className="text-xs text-slate-400">{usuarios.length} usuario(s)</span>
      </div>
      {cargando ? <Spinner /> : (
        <div className="space-y-1.5">
          {usuarios.length === 0 && <Vacio icono={ShieldCheck}>Aún no hay usuarios de Walmart. Agrega managers o administradores y define sus permisos.</Vacio>}
          {usuarios.map((u) => {
            const r = resumenPermisos(u, nombreAlm)
            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy/10 text-xs font-bold text-brand-navy dark:bg-white/10 dark:text-slate-100">{(u.email || '?').slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-brand-navy dark:text-slate-100">{u.email}</div>
                  <div className="text-[11px] text-slate-400">{rolWalInfo(u.rol).label} · {r.warehouses.join(', ')}</div>
                </div>
                <Badge color={u.activo === false ? 'slate' : 'green'}>{u.activo === false ? 'Inactivo' : 'Activo'}</Badge>
                <span className="text-xs text-slate-400">{u.rol === 'driver' ? 'portal del chofer' : `${r.nActivos} permisos`}</span>
                {puedeEditar && <button className="ml-auto text-xs font-bold text-brand-gold hover:underline" onClick={() => setEditar({ ...u })}>editar</button>}
              </Card>
            )
          })}
        </div>
      )}
      {editar && <WalUsuarioModal inicial={editar} almacenes={almacenes} personas={personas} editor={perm} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

function WalUsuarioModal({ inicial, almacenes, personas, editor, onCerrar }) {
  const esNuevo = !!inicial.nuevo
  const [email, setEmail] = useState(inicial.email || '')
  const [rol, setRol] = useState(inicial.rol || 'manager')
  const [activo, setActivo] = useState(inicial.activo !== false)
  const [permisos, setPermisos] = useState(() => normalizarPermisos(inicial.permisos))
  const [warehouses, setWarehouses] = useState(Array.isArray(inicial.warehouses) ? inicial.warehouses : [])
  const [driverId, setDriverId] = useState(inicial.driverId || '')
  const drivers = (personas || []).filter((p) => p.estadoOperativo === 'activo' || p.id === inicial.driverId)
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [verResumen, setVerResumen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const idsAlm = almacenes.map((a) => a.id)
  const concedibles = useMemo(() => new Set(permisosConcedibles(editor)), [editor])
  const whAsignables = useMemo(() => new Set(warehousesAsignables(editor, idsAlm)), [editor, idsAlm.join(',')]) // eslint-disable-line
  const nombreAlm = Object.fromEntries(almacenes.map((a) => [a.id, a.nombre]))

  // Alternar un permiso, respetando dependencias (encender dep al encender hijo;
  // apagar hijos al apagar el padre).
  const toggle = (id) => setPermisos((prev) => {
    const n = { ...prev }
    if (n[id]) {
      delete n[id]
      // apaga los que dependían de este
      for (const k of TODOS_PERMISOS) if (DEP_DE[k] === id && n[k]) delete n[k]
    } else {
      n[id] = true
      // enciende la cadena de dependencias
      let dep = DEP_DE[id]
      let g = 0
      while (dep && g < 6) { if (concedibles.has(dep)) n[dep] = true; dep = DEP_DE[dep]; g++ }
    }
    return normalizarPermisos(n)
  })
  const aplicarPlantilla = (nuevoRol) => {
    setRol(nuevoRol)
    if (nuevoRol === 'driver') { setPermisos({}); return }
    // Solo enciende de la plantilla lo que el editor puede conceder.
    const base = normalizarPermisos(PLANTILLA_ROL[nuevoRol] || {})
    const filtrado = {}
    for (const k of Object.keys(base)) if (concedibles.has(k)) filtrado[k] = true
    setPermisos(normalizarPermisos(filtrado))
  }
  const toggleWh = (id) => setWarehouses((w) => w.includes(id) ? w.filter((x) => x !== id) : [...w, id])

  const guardar2 = async () => {
    const correo = idUsuarioWal(email)
    if (!correo || !/.+@.+\..+/.test(correo)) { setErr('Correo válido requerido.'); return }
    if (rol === 'driver' && !driverId) { setErr('Elige a qué chofer (perfil) corresponde esta cuenta.'); return }
    const payload = { rol, activo, permisos: rol === 'driver' ? {} : normalizarPermisos(permisos), warehouses, driverId: rol === 'driver' ? driverId : '' }
    const v = validarCambioPermisos(editor, { uid: inicial.uid, email: correo }, payload, idsAlm)
    if (!v.ok) { setErr(v.motivo); return }
    if (password && password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return }
    setErr(''); setGuardando(true)
    try {
      // 1) Si se escribió una contraseña, crea/actualiza la CUENTA de login
      //    (correo + clave) vía la Cloud Function. Si las funciones no están
      //    desplegadas, se avisa pero NO se pierde la asignación de permisos.
      if (password) {
        try {
          await httpsCallable(getFunctions(), 'walUsuarioCrear')({ email: correo, password, nombre: '' })
        } catch (e) {
          setGuardando(false)
          setErr('No se pudo crear la cuenta de login: ' + (e?.message || e) + '  ·  Si no has desplegado las funciones (firebase deploy --only functions), crea la contraseña en Firebase Console → Authentication. Los permisos sí puedes guardarlos sin contraseña.')
          return
        }
      }
      // 2) Guarda rol/permisos/almacenes (con sus reglas).
      const antes = esNuevo ? '(nuevo)' : `${inicial.rol}/${Object.keys(normalizarPermisos(inicial.permisos)).length}perm/${(inicial.warehouses || []).length}alm/activo=${inicial.activo !== false}`
      const despues = `${rol}/${Object.keys(payload.permisos).length}perm/${warehouses.length}alm/activo=${activo}`
      await guardarUsuarioWal(correo, payload)
      await auditar('wal_usuario_permisos', `${correo} · ${antes} → ${despues} · por ${editor.email || 'dueño'}`)
      walToast(password ? 'Usuario y clave guardados ✓' : 'Usuario guardado ✓', 'gold')
      onCerrar()
    } catch (e) { setErr('No se pudo guardar: ' + (e.message || e)) } finally { setGuardando(false) }
  }

  const resumen = resumenPermisos({ permisos, warehouses }, nombreAlm)

  return (
    <Modal titulo={esNuevo ? 'Nuevo usuario de Walmart' : `Editar · ${inicial.email}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <F label="Correo (correo de inicio de sesión)"><Input value={email} disabled={!esNuevo} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" /></F>
        <F label="Rol (plantilla inicial)"><Select value={rol} onChange={(e) => aplicarPlantilla(e.target.value)}>{ROLES_WAL.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></F>
      </div>
      <div className="mt-3">
        <F label={esNuevo ? 'Contraseña de acceso' : 'Nueva contraseña (opcional)'}>
          <div className="relative">
            <Input type={verPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={esNuevo ? 'mínimo 6 caracteres' : 'dejar vacío para no cambiarla'} className="pr-10" />
            <button type="button" onClick={() => setVerPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">{verPass ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </F>
        <p className="mt-1 text-[11px] text-slate-400">Al escribir una contraseña se crea (o actualiza) la cuenta de inicio de sesión de esta persona. La persona entra en <b>milepay.io/walmart</b> con su correo y esta clave (puede cambiarla luego con “¿Olvidaste tu contraseña?”).</p>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-navy dark:text-slate-200"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Usuario activo</label>
      <p className="mt-1 text-[11px] text-slate-400">{rolWalInfo(rol).desc}</p>

      {/* Alcance: warehouses */}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Almacenes asignados {warehouses.length === 0 && <span className="font-normal normal-case text-slate-400">· (ninguno = todos los que administras)</span>}</div>
        <div className="flex flex-wrap gap-1.5">
          {almacenes.map((a) => {
            const puede = whAsignables.has(a.id)
            const on = warehouses.includes(a.id)
            return <button key={a.id} type="button" disabled={!puede} onClick={() => toggleWh(a.id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? 'bg-brand-navy text-white' : puede ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200' : 'cursor-not-allowed bg-slate-50 text-slate-300 dark:bg-slate-800'}`}>{a.nombre}</button>
          })}
        </div>
      </div>

      {/* Matriz de permisos (oculta para driver) */}
      {rol === 'driver' ? (
        <div className="mt-3">
          <F label="Perfil de chofer vinculado"><Select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">Elegir chofer…</option>{drivers.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
          <Aviso tipo="info" className="mt-2">El <b>driver</b> solo accede a su portal y a su propia información (sus rutas, pagos, Fast Pay, recibos, documentos, contratos y perfil). No usa el panel de permisos. Debe quedar vinculado a su perfil de chofer para ver sus datos.</Aviso>
        </div>
      ) : (
        <div className="mt-3 max-h-[42vh] overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
          {CATEGORIAS_PERM.map((cat) => (
            <div key={cat.id} className="mb-2 last:mb-0">
              <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-brand-steel">{cat.label}</div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {cat.perms.map((p) => {
                  const puedeConceder = concedibles.has(p.id)
                  const dep = p.dep
                  const depFalta = dep && !permisos[dep]
                  return (
                    <label key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${puedeConceder ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`} title={!puedeConceder ? 'No puedes conceder un permiso que tú no tienes' : (dep ? `Requiere: ${LABEL_PERM[dep]}` : '')}>
                      <input type="checkbox" disabled={!puedeConceder} checked={!!permisos[p.id]} onChange={() => toggle(p.id)} />
                      <span>{p.label}{dep && <span className="ml-1 text-[10px] text-slate-400">↳ req. {LABEL_PERM[dep]}</span>}{depFalta && permisos[p.id] && <span className="ml-1 text-[10px] text-rose-400">(falta dep.)</span>}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen antes de guardar */}
      {verResumen && (
        <div className="mt-3 rounded-xl border border-brand-gold/40 bg-brand-gold/5 p-3 text-sm">
          <div className="mb-1 font-bold text-brand-navy dark:text-slate-100">Resumen de accesos</div>
          <div className="text-xs text-slate-500">Rol: <b>{rolWalInfo(rol).label}</b> · Estado: <b>{activo ? 'Activo' : 'Inactivo'}</b> · Almacenes: <b>{resumen.warehouses.join(', ')}</b></div>
          {rol !== 'driver' && (resumen.porCat.length ? resumen.porCat.map((c) => (
            <div key={c.cat} className="mt-1 text-xs"><b className="text-brand-steel">{c.cat}:</b> {c.perms.join(', ')}</div>
          )) : <div className="mt-1 text-xs text-slate-400">Sin permisos marcados.</div>)}
        </div>
      )}

      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!verResumen
          ? <Boton variant="gold" onClick={() => setVerResumen(true)}>Revisar y guardar</Boton>
          : <Boton variant="gold" disabled={guardando} onClick={guardar2}>{guardando ? <Spinner /> : 'Confirmar y guardar'}</Boton>}
        {verResumen && <Boton variant="ghost" onClick={() => setVerResumen(false)}>Seguir editando</Boton>}
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </Modal>
  )
}

// ── mini UI helpers ─────────────────────────────────────────────────────────
function Seccion({ titulo, children }) { return <div className="mb-4 last:mb-0"><div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{titulo}</div>{children}</div> }
function Grid({ children }) { return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div> }
function F({ label, children }) { return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>{children}</label> }
// Estado vacío consistente (icono + mensaje) para todas las listas.
function Vacio({ icono: Ico = Search, children }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center dark:border-slate-700 dark:bg-slate-800/30">
      {Ico && <Ico size={30} className="mb-2 text-slate-300" strokeWidth={1.6} />}
      <div className="max-w-xs px-4 text-sm text-slate-400">{children}</div>
    </div>
  )
}
// Clase reutilizable para filas-tarjeta con hover suave.
const FILA = 'flex flex-wrap items-center gap-2.5 p-3 transition duration-150 hover:-translate-y-px hover:border-brand-gold/40 hover:shadow-md'

// ── RUTAS ───────────────────────────────────────────────────────────────────
function TabRutas({ rutas, almacenes, personas, tarifas, perm }) {
  const puedeCrear = !perm || perm.owner || perm.permisos?.rutas_crear
  const puedeEditar = !perm || perm.owner || perm.permisos?.rutas_editar
  const [modo, setModo] = useState('dia') // dia | rango
  const [fecha, setFecha] = useState(hoyISO())
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fBloque, setFBloque] = useState('')
  const [q, setQ] = useState('')
  const [editar, setEditar] = useState(null)
  const [importar, setImportar] = useState(false)
  const almNombre = (id) => id === 'ambos' ? 'Ambos' : (almacenes.find((a) => a.id === id)?.nombre || '')

  const desde = modo === 'dia' ? fecha : (d1 <= d2 ? d1 : d2)
  const hasta = modo === 'dia' ? fecha : (d1 <= d2 ? d2 : d1)
  const lista = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return rutas.filter((r) => {
      if (r.fecha < desde || r.fecha > hasta) return false
      if (almId && r.almacenId !== almId) return false
      if (driverId && r.driverId !== driverId) return false
      if (fEstado && r.estado !== fEstado) return false
      if (fBloque && r.bloque !== fBloque) return false
      if (txt && !`${r.driverNombre || ''} ${r.identificador || ''} ${almNombre(r.almacenId)}`.toLowerCase().includes(txt)) return false
      return true
    }).sort((a, b) => (b.fecha !== a.fecha ? String(b.fecha).localeCompare(String(a.fecha)) : `${a.almacenId}${a.bloque}`.localeCompare(`${b.almacenId}${b.bloque}`)))
  }, [rutas, desde, hasta, almId, driverId, fEstado, fBloque, q]) // eslint-disable-line

  if (editar) return <RutaEditor ruta={editar} rutas={rutas} almacenes={almacenes} personas={personas} tarifas={tarifas} onCerrar={() => setEditar(null)} soloLectura={editar.id ? !puedeEditar : false} puedeEliminar={puedeEditar} />
  if (importar) return <ImportarWalmart rutas={rutas} almacenes={almacenes} personas={personas} tarifas={tarifas} onCerrar={() => setImportar(false)} />

  const totIng = lista.reduce((a, r) => a + ingresoRuta(r), 0)
  const totGan = lista.reduce((a, r) => a + gananciaDriver(r), 0)
  const driversConRutas = personas.filter((p) => rutas.some((r) => r.driverId === p.id)).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  const hayFiltro = almId || driverId || fEstado || fBloque || q
  const limpiar = () => { setAlmId(''); setDriverId(''); setFEstado(''); setFBloque(''); setQ('') }

  return (
    <div>
      <PageTitle right={puedeCrear ? <>
        <Boton variant="ghost" onClick={() => setImportar(true)}><Upload size={15} /> Importar de Walmart</Boton>
        <Boton variant="gold" onClick={() => setEditar({ fecha: modo === 'dia' ? fecha : hoyISO(), almacenId: almId })}><Plus size={15} /> Nueva ruta</Boton>
      </> : null}>Rutas</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Ver por"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="dia">Día</option><option value="rango">Rango de fechas</option></Select></F>
          {modo === 'dia'
            ? <F label="Fecha"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
            : <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Driver"><Select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">Todos</option>{driversConRutas.map((d) => <option key={d.id} value={d.id}>{nombreCompleto(d)}</option>)}</Select></F>
          <F label="Estado"><Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="">Todos</option>{ESTADOS_RUTA.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
          <F label="Turno"><Select value={fBloque} onChange={(e) => setFBloque(e.target.value)}><option value="">Todos</option>{BLOQUES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></F>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-8" placeholder="Buscar por driver, identificador o almacén…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {hayFiltro && <button className="text-xs font-semibold text-slate-400 hover:text-brand-navy dark:hover:text-white" onClick={limpiar}>limpiar filtros</button>}
          <div className="text-right text-xs text-slate-400"><b className="text-brand-navy dark:text-slate-100">{lista.length}</b> rutas · Ingreso <b className="text-brand-navy dark:text-slate-100">{dinero(totIng)}</b> · Pago <b className="text-brand-navy dark:text-slate-100">{dinero(totGan)}</b></div>
        </div>
      </Card>
      {lista.length === 0 && <Vacio icono={RouteIcon}>No hay rutas con esos filtros. Ajusta la búsqueda{hayFiltro ? ' o ' : ''}{hayFiltro ? <button className="font-semibold text-brand-gold underline" onClick={limpiar}>limpia los filtros</button> : ''}, o crea una con “Nueva ruta”.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((r) => {
          const e = estadoRutaInfo(r.estado)
          return (
            <Card key={r.id} className={FILA}>
              <span className="font-mono text-xs text-slate-400">{r.fecha}</span>
              <Badge color="navy">{almNombre(r.almacenId)}</Badge>
              <Badge color="slate">{BLOQUES.find((b) => b.id === r.bloque)?.label || r.bloque}</Badge>
              <span className="font-bold text-brand-navy dark:text-slate-100">{r.driverNombre || '(sin driver)'}</span>
              {r.identificador && <span className="text-xs text-slate-400">{r.identificador}</span>}
              <Badge color={e.color}>{e.label}</Badge>
              {r.goHome && <Badge color="gold">🏠 GO Home</Badge>}
              {(Number(r.otUnidades) || 0) > 0 && <Badge color="blue">OT ×{r.otUnidades}</Badge>}
              {r.cerrada && <Badge color="slate">día cerrado</Badge>}
              <span className="ml-auto font-mono text-xs text-slate-500">WM {dinero(ingresoRuta(r))} · drv {dinero(gananciaDriver(r))}</span>
              <button className="text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEditar(r)}>{(r.cerrada || !puedeEditar) ? 'ver' : 'editar'}</button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Calendario propio (reemplaza al date picker nativo del navegador) ────────
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DOW_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
function DateField({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const [vm, setVm] = useState('') // 'YYYY-MM' en vista
  const btnRef = useRef(null)
  const hoy = hoyISO()
  const abrir = () => { const r = btnRef.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 6, width: r.width }); setVm((value || hoy).slice(0, 7)); setOpen(true) }
  useEffect(() => {
    if (!open) return
    const cerrar = () => setOpen(false)
    window.addEventListener('scroll', cerrar, true); window.addEventListener('resize', cerrar)
    return () => { window.removeEventListener('scroll', cerrar, true); window.removeEventListener('resize', cerrar) }
  }, [open])

  const [y, m] = (vm || hoy.slice(0, 7)).split('-').map(Number)
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // lunes = 0
  const diasMes = new Date(y, m, 0).getDate()
  const celdas = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasMes; d++) celdas.push(d)
  const iso = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const cambiarMes = (delta) => { const dd = new Date(y, m - 1 + delta, 1); setVm(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`) }
  const elegir = (isoStr) => { onChange({ target: { value: isoStr } }); setOpen(false) }
  const mostrar = value ? (() => { const [yy, mm, dd] = value.split('-'); return `${dd} ${MESES_ES[Number(mm) - 1]?.slice(0, 3)} ${yy}` })() : 'Elegir fecha'
  const anchoPop = 300
  const left = rect ? Math.max(8, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - anchoPop - 8)) : 0

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : abrir())} className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${className}`}>
        <span className={value ? '' : 'text-slate-400'}>{mostrar}</span>
        <CalendarDays size={16} className="shrink-0 text-brand-gold" />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="fixed z-[9999] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-800" style={{ left, top: rect.top, width: anchoPop }}>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => cambiarMes(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"><ChevronDown size={18} className="rotate-90" /></button>
              <div className="text-sm font-bold capitalize text-brand-navy dark:text-slate-100">{MESES_ES[m - 1]} {y}</div>
              <button type="button" onClick={() => cambiarMes(1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"><ChevronDown size={18} className="-rotate-90" /></button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">{DOW_ES.map((d) => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => d === null ? <div key={i} /> : (() => {
                const is = iso(d); const esSel = value === is; const esHoy = hoy === is
                return <button key={i} type="button" onClick={() => elegir(is)} className={`grid h-9 place-items-center rounded-lg text-sm font-semibold transition ${esSel ? 'bg-brand-gold text-brand-navy shadow' : esHoy ? 'text-brand-navy ring-1 ring-brand-gold dark:text-slate-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}>{d}</button>
              })())}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-700">
              <button type="button" onClick={() => elegir(hoy)} className="font-semibold text-brand-gold hover:underline">Hoy</button>
              <button type="button" onClick={() => setOpen(false)} className="font-semibold text-slate-400 hover:text-brand-navy dark:hover:text-white">Cerrar</button>
            </div>
          </div>
        </>, document.body)}
    </>
  )
}

// Selector-buscador de driver (todos los activos, sin filtrar por almacén).
// La lista se dibuja en un portal (document.body) para que ninguna tarjeta
// con efecto "vidrio" (backdrop-filter) la recorte.
function DriverPicker({ personas, almacenes, value, onPick }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const almNombre = (id) => id === 'ambos' ? 'Ambos' : (almacenes.find((a) => a.id === id)?.nombre || '')
  const sel = personas.find((p) => p.id === value)
  const txt = q.trim().toLowerCase()
  const lista = personas
    .filter((p) => p.estadoOperativo === 'activo')
    .filter((p) => !txt || `${nombreCompleto(p)} ${p.telefono || ''} ${p.ciudad || ''}`.toLowerCase().includes(txt))
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))

  const reposicionar = () => { const r = btnRef.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width }) }
  const abrir = () => { reposicionar(); setOpen(true); setQ('') }
  const popRef = useRef(null)
  useEffect(() => {
    if (!open) return
    // Al hacer scroll reposicionamos el panel (NO lo cerramos), para que el
    // scroll DENTRO de la lista de drivers funcione. Ignoramos los scrolls que
    // nacen dentro del propio panel.
    const onScroll = (e) => { if (popRef.current && popRef.current.contains(e.target)) return; reposicionar() }
    const cerrar = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', cerrar)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', cerrar) }
  }, [open])

  return (
    <div>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : abrir())} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
        <span className={`flex items-center gap-2 truncate ${sel ? '' : 'text-slate-400'}`}>{sel ? <><Avatar p={sel} size={20} /> {nombreCompleto(sel)}</> : 'Buscar y elegir driver…'}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div ref={popRef} className="fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800" style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 240) }}>
            <div className="border-b border-slate-100 p-2 dark:border-slate-700">
              <div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input autoFocus className="pl-8" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {lista.length === 0 && <div className="px-3 py-3 text-center text-xs text-slate-400">Sin drivers activos con ese nombre.</div>}
              {lista.map((p) => (
                <button key={p.id} type="button" onClick={() => { onPick(p.id); setOpen(false); setQ('') }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50 ${p.id === value ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}>
                  <Avatar p={p} size={26} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</span>
                  {p.almacenId && <span className="shrink-0 text-[11px] text-slate-400">{almNombre(p.almacenId)}</span>}
                </button>
              ))}
            </div>
          </div>
        </>, document.body)}
    </div>
  )
}

// ── IMPORTADOR DE WALMART (CSV) ──────────────────────────────────────────────
// Lee el reporte de Walmart y crea rutas: una por chofer + día + turno (no cuenta
// paradas). Ignora filas sin chofer. NUNCA toca lo que ya existe (protege lo
// pagado): si una ruta chofer+fecha+turno ya está, la salta. No crea ni modifica
// pagos, gastos, bonos, deducciones ni choferes. Aislado al módulo Walmart.
const normNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
function fechaBloqueWal(s) {
  const p = String(s).trim().split(/\s+/)
  const m = (p[0] || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ['', '']
  const fecha = `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
  let h = parseInt((p[1] || '0').split(':')[0], 10) || 0
  const ap = (p[2] || '').toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return [fecha, h < 12 ? 'manana' : 'tarde']
}
function parseCSVWal(text) {
  const rows = []; let row = [], field = '', inq = false, i = 0
  while (i < text.length) {
    const c = text[i]
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue } inq = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"') { inq = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}
function ImportarWalmart({ rutas, almacenes, personas, tarifas, onCerrar }) {
  const [paso, setPaso] = useState(1)
  const [parsed, setParsed] = useState(null)
  const [alias, setAlias] = useState({})
  const [tiendaMap, setTiendaMap] = useState({})
  const [err, setErr] = useState('')
  const [creando, setCreando] = useState(false)
  const [hechas, setHechas] = useState(null)
  const [estadoImport, setEstadoImport] = useState('auto') // auto | completada | en_progreso
  const [nuevos, setNuevos] = useState([]) // choferes creados aquí mismo (por si aún no refresca la suscripción)
  const cfgRef = useRef({})
  useEffect(() => suscribir(COL.config, (docs) => { cfgRef.current = docs.find((d) => d.id === 'importwalmart') || {} }), [])
  const activos = useMemo(() => {
    const base = personas.filter((p) => p.estadoOperativo !== 'archivado')
    const extra = nuevos.filter((x) => !base.some((p) => p.id === x.id))
    return [...base, ...extra].sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  }, [personas, nuevos])
  const nombreDeId = (id) => { const p = personas.find((x) => x.id === id) || nuevos.find((x) => x.id === id); return p ? nombreCompleto(p) : '' }
  // Crea un chofer nuevo con el nombre del archivo y lo asocia. Requiere permiso
  // para crear drivers (el dueño siempre puede).
  // Almacén para un chofer nuevo, según las tiendas donde trabajó en el archivo:
  // una sola tienda → ese almacén; dos → "Ambos"; sin mapear aún → "Ambos".
  const almacenDeChofer = (n) => {
    const stores = [...new Set((parsed?.grupos || []).filter((g) => g.driverRaw === n).map((g) => g.store))]
    const ids = [...new Set(stores.map((s) => tiendaMap[s]).filter(Boolean))]
    if (ids.length === 1) return ids[0]
    return 'ambos'
  }
  const crearChofer = async (n) => {
    const parts = n.trim().split(/\s+/)
    const nombre = parts[0] || n, apellido = parts.slice(1).join(' ')
    const almacenId = almacenDeChofer(n)
    const almNom = almacenId === 'ambos' ? 'Ambos almacenes' : (almacenes.find((a) => a.id === almacenId)?.nombre || 'Ambos almacenes')
    try {
      const id = await guardar(COL.candidatos, null, {
        nombre, apellido, telefono: '', correo: '', direccion: '', ciudad: '', estado: '',
        fechaRegistro: hoyISO(), notas: 'Creado al importar de Walmart', tieneSSN: 'pendiente', tieneLicencia: 'pendiente',
        disponibilidad: 'ambas', diasDisponibles: [], tipoVehiculo: 'SUV', propietarioVehiculo: 'driver', rateDriver: '',
        estadoOperativo: 'activo', almacenId,
      })
      await auditar('persona_creada', `${nombre} ${apellido} · desde import Walmart · ${almNom}`)
      setNuevos((x) => [...x, { id, nombre, apellido }])
      setAlias((x) => ({ ...x, [n]: id }))
      walToast(`Chofer "${nombre} ${apellido}" creado en ${almNom} ✓`, 'gold')
    } catch (e) { setErr(`No se pudo crear el chofer "${n}": ${e.message || e}. ¿Tienes permiso para crear drivers?`) }
  }

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => { try { procesar(String(rd.result || '')) } catch (ex) { setErr('No se pudo leer el archivo: ' + (ex.message || ex)) } }
    rd.onerror = () => setErr('No se pudo leer el archivo.')
    rd.readAsText(f)
  }
  function procesar(text) {
    text = text.replace(/^﻿/, '')
    const rows = parseCSVWal(text)
    if (rows.length < 2) { setErr('El archivo está vacío o no es un CSV válido.'); return }
    const H = rows[0].map((x) => x.trim())
    const iDrv = H.indexOf('driverName'), iTime = H.indexOf('pickupStartTime'), iStore = H.indexOf('pickupBusinessName'), iJob = H.indexOf('jobId'), iStat = H.indexOf('jobStatus')
    if (iDrv < 0 || iTime < 0 || iStore < 0) { setErr('No reconozco las columnas de este archivo. ¿Es el reporte de rutas de Walmart?'); return }
    // Estado de la parada:
    //  • TERMINADA (→ Completada): entregada, devuelta, cancelada o fallida.
    //  • EN PROGRESO: algo sigue en curso (devolución en progreso, en camino,
    //    asignada, aceptada, pendiente, creada).
    // Primero se revisa lo terminado (así "CANCELED_BY_REASSIGN" no se confunde
    // con "assigned"); lo desconocido se trata como terminado por seguridad.
    const esTerminal = (s) => {
      const u = String(s || '').toUpperCase()
      if (/COMPLETE|CANCEL|FAIL|DELIVERED|RETURNED/.test(u)) return true
      if (/IN_PROGRESS|ENROUTE|ARRIVED|ASSIGNED|ACCEPTED|PENDING|CREATED/.test(u)) return false
      return true
    }
    // Una ruta = un LOTE de Walmart (jobId). El estado se decide por TURNO: si
    // cualquier parada del chofer ese día/turno sigue en progreso, TODOS sus
    // lotes de ese turno quedan "en progreso" (opción B).
    const L = new Map(), nombres = new Map(), tiendas = new Map(), turnoActivo = new Set(); let sinChofer = 0
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]; if (!row || row.length <= iTime) continue
      const drv = (row[iDrv] || '').trim(); const t = (row[iTime] || '').trim(); if (!t) continue
      if (!drv) { sinChofer++; continue }
      const [fecha, bloque] = fechaBloqueWal(t); if (!fecha) continue
      const store = (row[iStore] || '').trim()
      const job = ((iJob >= 0 ? (row[iJob] || '') : '').trim()) || `${drv}|${fecha}|${bloque}`
      if (iStat >= 0 && !esTerminal(row[iStat])) turnoActivo.add(drv + '|' + fecha + '|' + bloque)
      if (!L.has(job)) L.set(job, { job, driver: new Map(), fecha: new Map(), bloque: new Map(), store: new Map() })
      const l = L.get(job)
      l.driver.set(drv, (l.driver.get(drv) || 0) + 1)
      l.fecha.set(fecha, (l.fecha.get(fecha) || 0) + 1)
      l.bloque.set(bloque, (l.bloque.get(bloque) || 0) + 1)
      if (store) l.store.set(store, (l.store.get(store) || 0) + 1)
      nombres.set(drv, (nombres.get(drv) || 0) + 1)
      if (store) tiendas.set(store, (tiendas.get(store) || 0) + 1)
    }
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    const grupos = [...L.values()].map((l) => {
      const driverRaw = top(l.driver), fecha = top(l.fecha), bloque = top(l.bloque)
      return { job: l.job, fecha, driverRaw, bloque, store: top(l.store), lotes: 1, estadoAuto: turnoActivo.has(driverRaw + '|' + fecha + '|' + bloque) ? 'en_progreso' : 'completada' }
    })
    grupos.sort((a, b) => a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : (a.driverRaw.localeCompare(b.driverRaw) || a.bloque.localeCompare(b.bloque)))
    const savedA = cfgRef.current.alias || {}, savedT = cfgRef.current.tiendas || {}
    const al = {}
    for (const [n] of nombres) {
      if (savedA[n] != null && (savedA[n] === '__ignorar__' || personas.some((p) => p.id === savedA[n]))) { al[n] = savedA[n]; continue }
      const m = personas.find((p) => normNom(nombreCompleto(p)) === normNom(n))
      al[n] = m ? m.id : ''
    }
    const tm = {}
    for (const [s] of tiendas) { tm[s] = (savedT[s] != null && (savedT[s] === '' || almacenes.some((a) => a.id === savedT[s]))) ? savedT[s] : (almacenes.find((a) => normNom(a.nombre) && normNom(s).includes(normNom(a.nombre)))?.id || '') }
    setParsed({ grupos, nombres: [...nombres.entries()].sort((a, b) => b[1] - a[1]), tiendas: [...tiendas.entries()].sort((a, b) => b[1] - a[1]), sinChofer })
    setAlias(al); setTiendaMap(tm); setErr(''); setPaso(2)
  }
  const didDe = (n) => { const v = alias[n]; return v && v !== '__ignorar__' ? v : '' }
  // Estado efectivo de una ruta: "auto" usa lo que dice Walmart; si no, se fuerza.
  const estadoDe = (g) => estadoImport === 'auto' ? (g.estadoAuto || 'completada') : estadoImport
  // Id determinista por LOTE (jobId) → reimportar el mismo lote no duplica.
  const idLote = (job) => ('wm_' + String(job || '')).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 480)
  const preview = useMemo(() => {
    if (!parsed) return []
    return parsed.grupos.map((g) => {
      const did = didDe(g.driverRaw), almId = tiendaMap[g.store]
      let estado = 'crear', motivo = ''
      if (!did) { estado = 'ignorado'; motivo = alias[g.driverRaw] === '__ignorar__' ? 'chofer ignorado' : 'chofer sin asociar' }
      else if (!almId) { estado = 'ignorado'; motivo = 'almacén sin asociar' }
      else { const docId = idLote(g.job); const ya = rutas.find((r) => r.id === docId || (g.job && r.identificador === g.job && r.driverId === did)); if (ya) { estado = 'existe'; motivo = estadoRutaInfo(ya.estado).label } }
      return { ...g, did, almId, estado, motivo }
    })
  }, [parsed, alias, tiendaMap, rutas]) // eslint-disable-line
  const aCrear = preview.filter((x) => x.estado === 'crear')
  const nCrear = aCrear.length
  const nExiste = preview.filter((x) => x.estado === 'existe').length
  const nIgnora = preview.filter((x) => x.estado === 'ignorado').length
  const nCompl = aCrear.filter((x) => estadoDe(x) === 'completada').length
  const nProg = aCrear.filter((x) => estadoDe(x) === 'en_progreso').length
  const nombresReconocidos = parsed ? parsed.nombres.filter(([n]) => didDe(n)).length : 0
  const nombresFaltan = parsed ? parsed.nombres.length - nombresReconocidos : 0

  const crear = async () => {
    setCreando(true); setErr('')
    try {
      let n = 0, cCompl = 0, cProg = 0
      for (const x of preview) {
        if (x.estado !== 'crear') continue
        const driver = personas.find((p) => p.id === x.did), alm = almacenes.find((a) => a.id === x.almId)
        if (!driver || !alm) continue
        if (estadoDe(x) === 'en_progreso') cProg++; else cCompl++
        await guardar(COL.rutas, idLote(x.job), {
          fecha: x.fecha, semana: lunesDe(x.fecha), almacenId: x.almId, driverId: x.did, driverNombre: nombreCompleto(driver),
          identificador: x.job || 'Walmart', bloque: x.bloque, vehiculoTipo: driver.tipoVehiculo || '', propietarioVehiculo: driver.propietarioVehiculo || 'driver',
          estado: estadoDe(x), goHome: false, tarifaWalmart: ingresoDeAlmacen(alm, tarifas), tarifaDriver: tarifaDeDriver(driver, tarifas),
          otUnidades: 0, otIngreso: 0, otPago: 0, bonos: [], deducciones: [], notas: 'Importada de Walmart', motivoCancel: '',
        }); n++
      }
      // Guardar los alias (nombres/almacenes) para la próxima vez. No es crítico:
      // solo el dueño puede escribir la configuración, así que si falla (un manager),
      // el import igual queda hecho.
      try { await guardar(COL.config, 'importwalmart', { alias, tiendas: tiendaMap }) } catch { /* noop */ }
      await auditar('rutas_importadas', `Walmart · ${n} creadas (${cCompl} compl., ${cProg} en prog.) · ${nExiste} ya existían · ${nIgnora} ignoradas`)
      walToast(`${n} ruta(s) importada(s) ✓`, 'gold'); confeti()
      setHechas({ n, existe: nExiste, ignora: nIgnora, compl: cCompl, prog: cProg }); setPaso(5)
    } catch (e) { setErr('No se pudo completar: ' + (e.message || e)) } finally { setCreando(false) }
  }

  const Stepper = () => (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {[[1, 'Subir'], [2, 'Nombres'], [3, 'Almacenes'], [4, 'Verificar']].map(([n, l]) => (
        <span key={n} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${paso === n ? 'border-brand-azul bg-brand-azul text-white' : paso > n ? 'border-emerald-300 text-emerald-600' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`} style={paso === n ? { background: WALMART_AZUL, borderColor: WALMART_AZUL } : {}}>
          <span className="grid h-4 w-4 place-items-center rounded-full bg-black/10 text-[10px]">{paso > n ? '✓' : n}</span>{l}
        </span>
      ))}
    </div>
  )
  const diaLargo = (iso) => { try { const d = new Date(iso + 'T12:00'); return `${iso.slice(8)}/${iso.slice(5, 7)} · ${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]}` } catch { return iso } }

  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton>}>Importar de Walmart</PageTitle>
      <Stepper />
      {err && <Aviso tipo="error" className="mb-3">{err}</Aviso>}

      {paso === 1 && (
        <>
          <Card className="mb-3 p-4">
            <h3 className="mb-1 font-bold text-brand-navy dark:text-slate-100">Sube el reporte de Walmart (CSV)</h3>
            <p className="mb-3 text-xs text-slate-500">El archivo que descargas de Walmart. Creamos <b>una ruta por chofer, día y turno</b> (mañana/tarde). No contamos paradas. Las filas sin chofer se ignoran.</p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-semibold text-slate-500 hover:border-brand-gold dark:border-slate-700 dark:bg-slate-800/40">
              <Upload size={18} /> Elegir archivo CSV…
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
            <div className="mt-3">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Estado de las rutas</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEstadoImport('auto')} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${estadoImport === 'auto' ? 'border-brand-gold bg-amber-50 text-brand-navy dark:bg-amber-500/10 dark:text-slate-100' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>✨ Automático (según Walmart)</button>
                <button type="button" onClick={() => setEstadoImport('completada')} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${estadoImport === 'completada' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>✓ Todas completadas</button>
                <button type="button" onClick={() => setEstadoImport('en_progreso')} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${estadoImport === 'en_progreso' ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>⏳ Todas en progreso</button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400"><b>Automático</b> (recomendado): leo la columna de estado de Walmart y marco cada ruta como corresponde — entregada/devuelta/cancelada → <b>Completada</b>; en camino → <b>En progreso</b>. Las otras dos opciones fuerzan todas al mismo estado.</p>
            </div>
          </Card>
          <Aviso tipo="info">Nada se crea en este paso. Primero verás los nombres por asociar y la lista de rutas; solo creas al final, cuando confirmes.</Aviso>
        </>
      )}

      {paso === 2 && parsed && (
        <>
          <Card className="mb-3 p-4">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile txt={String(preview.length)} l="Rutas detectadas" />
              <Tile txt={String(parsed.grupos.filter((g) => g.bloque === 'manana').length)} l="Turnos mañana" />
              <Tile txt={String(parsed.grupos.filter((g) => g.bloque === 'tarde').length)} l="Turnos tarde" />
              <Tile txt={String(parsed.sinChofer)} l="Filas sin chofer (ignoradas)" />
            </div>
            <h3 className="font-bold text-brand-navy dark:text-slate-100">Asociar nombres <span className="text-xs font-semibold text-slate-400">· {nombresReconocidos} reconocidos, {nombresFaltan} por asociar</span></h3>
            <p className="mb-2 text-xs text-slate-500">Empareja cada nombre del archivo con <b>tu chofer</b>. Se guarda para la próxima vez. Siempre quedan <b>tus nombres</b>; el del archivo solo sirve para emparejar.</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {parsed.nombres.map(([n, c]) => (
                <div key={n} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-300">{n.replace(/\s+/g, ' ')}</span>
                  <span className="text-[10px] text-slate-400">· {c} paradas</span>
                  <ArrowLeftRight size={12} className="text-slate-300" />
                  <select value={alias[n] ?? ''} onChange={(e) => { const v = e.target.value; if (v === '__crear__') crearChofer(n); else setAlias((x) => ({ ...x, [n]: v })) }} className="ml-auto max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="">— elegir chofer —</option>
                    {activos.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}
                    <option value="__crear__">➕ Crear chofer nuevo con este nombre</option>
                    <option value="__ignorar__">(ignorar este nombre)</option>
                  </select>
                  {didDe(n) ? <Badge color="green">ok</Badge> : <Badge color={alias[n] === '__ignorar__' ? 'slate' : 'gold'}>{alias[n] === '__ignorar__' ? 'ignora' : 'falta'}</Badge>}
                </div>
              ))}
            </div>
          </Card>
          <div className="flex gap-2"><Boton variant="ghost" onClick={() => setPaso(1)}><ArrowLeft size={14} /> Atrás</Boton><Boton variant="gold" onClick={() => setPaso(3)}>Siguiente: almacenes</Boton></div>
        </>
      )}

      {paso === 3 && parsed && (
        <>
          <Card className="mb-3 p-4">
            <h3 className="font-bold text-brand-navy dark:text-slate-100">Asociar almacenes</h3>
            <p className="mb-2 text-xs text-slate-500">Cada tienda de Walmart se asocia a tu almacén. Se guarda para la próxima.</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {parsed.tiendas.map(([s, c]) => (
                <div key={s} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="font-semibold text-brand-navy dark:text-slate-100">{s}</span>
                  <span className="text-[10px] text-slate-400">· {c} paradas</span>
                  <ArrowLeftRight size={12} className="text-slate-300" />
                  <select value={tiendaMap[s] ?? ''} onChange={(e) => setTiendaMap((x) => ({ ...x, [s]: e.target.value }))} className="ml-auto max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="">— elegir almacén —</option>
                    {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  {tiendaMap[s] ? <Badge color="green">ok</Badge> : <Badge color="gold">falta</Badge>}
                </div>
              ))}
            </div>
          </Card>
          <div className="flex gap-2"><Boton variant="ghost" onClick={() => setPaso(2)}><ArrowLeft size={14} /> Atrás</Boton><Boton variant="gold" onClick={() => setPaso(4)}>Siguiente: verificar</Boton></div>
        </>
      )}

      {paso === 4 && parsed && (
        <>
          <Card className="mb-3 p-4">
            <h3 className="mb-2 font-bold text-brand-navy dark:text-slate-100">Verificar antes de crear</h3>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✅ <b>{nCrear}</b> nuevas se crearán · <b>{nExiste}</b> ya existen (se saltan, no se tocan las pagadas) · <b>{nIgnora}</b> ignoradas
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Se crearán como:</span>
              {estadoImport === 'auto'
                ? <>{nCompl > 0 && <Badge color="green">{nCompl} completadas</Badge>}{nProg > 0 && <Badge color="blue">{nProg} en progreso</Badge>}<span className="text-[11px]">· automático (según Walmart)</span></>
                : <Badge color={estadoImport === 'completada' ? 'green' : 'blue'}>{estadoImport === 'completada' ? 'Completadas' : 'En progreso'}</Badge>}
              <button className="font-semibold text-brand-gold hover:underline" onClick={() => setPaso(1)}>cambiar</button>
            </div>
            {nCrear === 0 && (
              <Aviso tipo="info" className="mb-3">Nada nuevo que crear: todas estas rutas <b>ya existen</b> (o se ignoran). Si subiste el archivo por error, no pasa nada — <b>no se creará ni modificará ninguna ruta</b>.</Aviso>
            )}
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {(() => { let cur = ''; const out = []
                for (const x of preview) {
                  if (x.fecha !== cur) { cur = x.fecha; out.push(<div key={'d' + cur} className="mb-1 mt-3 text-xs font-bold text-slate-400 first:mt-0">{diaLargo(cur)}</div>) }
                  const drvN = x.did ? (nombreDeId(x.did) || x.driverRaw) : x.driverRaw
                  out.push(
                    <div key={x.job || (x.fecha + x.driverRaw + x.bloque)} className={`mb-1 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800 ${x.estado !== 'crear' ? 'opacity-60' : ''}`}>
                      <Badge color={x.almId ? 'navy' : 'slate'}>{x.almId ? (almacenes.find((a) => a.id === x.almId)?.nombre || '—') : '—'}</Badge>
                      <Badge color={x.bloque === 'manana' ? 'green' : 'blue'}>{x.bloque === 'manana' ? 'Mañana' : 'Tarde'}</Badge>
                      <span className="font-semibold text-brand-navy dark:text-slate-100">{drvN}</span>
                      {x.estado === 'crear' && <><Badge color="green">nueva</Badge><Badge color={estadoDe(x) === 'en_progreso' ? 'blue' : 'slate'}>{estadoDe(x) === 'en_progreso' ? 'En progreso' : 'Completada'}</Badge></>}
                      {x.estado === 'existe' && <span className="ml-auto text-xs text-slate-400">🔒 ya existe · {x.motivo}</span>}
                      {x.estado === 'ignorado' && <span className="ml-auto text-xs text-amber-500">ignorada · {x.motivo}</span>}
                    </div>
                  )
                }
                return out })()}
            </div>
          </Card>
          <div className="flex gap-2">
            <Boton variant="ghost" onClick={() => setPaso(3)}><ArrowLeft size={14} /> Atrás</Boton>
            <Boton variant="gold" disabled={creando || nCrear === 0} onClick={crear}>{creando ? <Spinner /> : `Crear ${nCrear} ruta(s)`}</Boton>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">No se crean pagos, gastos, bonos ni deducciones. Lo que ya existe no se toca. Ningún chofer se borra ni modifica.</p>
        </>
      )}

      {paso === 5 && hechas && (
        <Card className="p-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-500/15">✓</div>
          <h3 className="text-lg font-black text-brand-navy dark:text-slate-100">{hechas.n} rutas importadas</h3>
          <p className="mt-1 text-sm text-slate-500">{hechas.compl > 0 && <><b>{hechas.compl}</b> completadas</>}{hechas.compl > 0 && hechas.prog > 0 && ' · '}{hechas.prog > 0 && <><b>{hechas.prog}</b> en progreso</>}. {hechas.existe} ya existían (se saltaron) y {hechas.ignora} se ignoraron. Los nombres y almacenes quedaron guardados para la próxima.</p>
          <div className="mt-4 flex justify-center gap-2"><Boton variant="gold" onClick={onCerrar}>Ver mis rutas</Boton></div>
        </Card>
      )}
    </div>
  )
}

function RutaEditor({ ruta, rutas, almacenes, personas, tarifas, onCerrar, soloLectura = false, puedeEliminar = true }) {
  const bloqueado = !!ruta.cerrada || soloLectura
  const eliminarRuta = async () => {
    const aviso = ruta.cerrada ? '¿Eliminar esta ruta? El día está CERRADO; la ruta se borra y el cierre se actualiza. No se puede deshacer.' : '¿Eliminar esta ruta? No se puede deshacer.'
    if (!window.confirm(aviso)) return
    const delDia = (rutas || []).filter((x) => x.fecha === ruta.fecha && x.almacenId === ruta.almacenId)
    await borrarRutaActualizandoCierre(ruta, delDia)
    walToast(ruta.cerrada ? 'Ruta eliminada · cierre actualizado' : 'Ruta eliminada')
    onCerrar()
  }
  const [r, setR] = useState(() => {
    const base = {
      fecha: hoyISO(), almacenId: '', driverId: '', driverNombre: '', identificador: '', bloque: 'manana',
      vehiculoTipo: '', propietarioVehiculo: 'driver', estado: 'pendiente', goHome: false,
      tarifaWalmart: tarifas.ingresoWalmart, tarifaDriver: tarifas.pagoDriverPropio,
      otUnidades: 0, otIngreso: 0, otPago: 0,
      bonos: [], deducciones: [], notas: '', motivoCancel: '', ...ruta,
    }
    if (!ruta.id) { // ruta nueva: toma precio del almacén y pago del driver
      if (base.almacenId) base.tarifaWalmart = ingresoDeAlmacen(almacenes.find((a) => a.id === base.almacenId), tarifas)
      if (base.driverId) base.tarifaDriver = tarifaDeDriver(personas.find((p) => p.id === base.driverId), tarifas)
    }
    return base
  })
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }))
  const elegirAlmacen = (id) => setR((x) => ({ ...x, almacenId: id, tarifaWalmart: ingresoDeAlmacen(almacenes.find((a) => a.id === id), tarifas) }))
  const elegirDriver = (id) => {
    const d = personas.find((x) => x.id === id)
    const homeAlm = d?.almacenId && d.almacenId !== 'ambos' ? d.almacenId : ''
    setR((x) => ({ ...x, driverId: id, driverNombre: d ? nombreCompleto(d) : '', vehiculoTipo: d?.tipoVehiculo || x.vehiculoTipo, propietarioVehiculo: d?.propietarioVehiculo || x.propietarioVehiculo, almacenId: x.almacenId || homeAlm, tarifaWalmart: x.almacenId ? x.tarifaWalmart : ingresoDeAlmacen(almacenes.find((a) => a.id === homeAlm), tarifas), tarifaDriver: x.goHome ? x.tarifaDriver : tarifaDeDriver(d, tarifas) }))
  }
  const setProp = (v) => setR((x) => { const d = personas.find((y) => y.id === x.driverId); return { ...x, propietarioVehiculo: v, tarifaDriver: x.goHome ? x.tarifaDriver : (tieneRatePropio(d) ? tarifaDeDriver(d, tarifas) : (v === 'compania' ? tarifas.pagoDriverCompania : tarifas.pagoDriverPropio)) } })
  const setGoHome = (on) => setR((x) => { const d = personas.find((y) => y.id === x.driverId); return { ...x, goHome: on, tarifaDriver: on ? (x.tarifaDriver || '') : tarifaDeDriver(d, tarifas) } })
  const setOT = (u) => setR((x) => { const n = Math.max(0, Number(u) || 0); return { ...x, otUnidades: u, otIngreso: money2(n * (Number(tarifas.otIngreso) || 0)), otPago: money2(n * (Number(tarifas.otPago) || 0)) } })
  const addAj = (tipo) => set(tipo, [...(r[tipo] || []), { concepto: '', monto: '', responsable: '', aplicaA: 'driver' }])
  const setAj = (tipo, i, k, v) => set(tipo, r[tipo].map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const delAj = (tipo, i) => set(tipo, r[tipo].filter((_, j) => j !== i))

  const salvar = async () => {
    if (!r.driverId) { setErr('Elige el driver.'); return }
    if (!r.almacenId) { setErr('Elige el almacén.'); return }
    if (r.estado === 'cancelada' && !r.motivoCancel.trim()) { setErr('Una ruta cancelada necesita motivo.'); return }
    setErr(''); setGuardando(true)
    try {
      const id = ruta.id || idRuta(r.almacenId, r.fecha, r.bloque, r.driverId)
      const limpio = {
        ...r, semana: lunesDe(r.fecha),
        tarifaWalmart: money2(r.tarifaWalmart), tarifaDriver: money2(r.tarifaDriver),
        otUnidades: Math.max(0, Number(r.otUnidades) || 0), otIngreso: money2(r.otIngreso), otPago: money2(r.otPago),
        bonos: (r.bonos || []).filter((b) => b.concepto && b.monto).map((b) => ({ ...b, monto: money2(b.monto) })),
        deducciones: (r.deducciones || []).filter((b) => b.concepto && b.monto).map((b) => ({ ...b, monto: money2(b.monto) })),
      }
      await guardar(COL.rutas, id, limpio)
      await auditar('ruta_guardada', `${r.driverNombre} · ${r.fecha} · ${r.bloque} · ${r.estado}`)
      walToast('Ruta guardada ✓')
      onCerrar()
    } catch (e) { setErr('No se pudo guardar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton>}>{ruta.id ? (bloqueado ? 'Ruta (día cerrado)' : 'Editar ruta') : 'Nueva ruta'}</PageTitle>
      {ruta.cerrada && <Aviso tipo="warn" className="mb-3">Este día está cerrado. Para corregir, reábrelo en <b>Cierre diario</b> (queda auditado).</Aviso>}
      {soloLectura && !ruta.cerrada && <Aviso tipo="info" className="mb-3">Vista de solo lectura: no tienes permiso para editar rutas.</Aviso>}
      <fieldset disabled={bloqueado} className="disabled:opacity-70">
        <Card className="mb-3 p-4">
          <Grid>
            <F label="Fecha de servicio"><DateField value={r.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
            <F label="Almacén"><Select value={r.almacenId} onChange={(e) => elegirAlmacen(e.target.value)}><option value="">Elegir…</option>{almacenes.filter((a) => a.activo !== false).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
            <F label="Driver (cualquier almacén)"><DriverPicker personas={personas} almacenes={almacenes} value={r.driverId} onPick={elegirDriver} /></F>
            <F label="Identificador (opcional)"><Input value={r.identificador} onChange={(e) => set('identificador', e.target.value)} placeholder="DFW01-140-B" /></F>
            <F label="Bloque"><Select value={r.bloque} onChange={(e) => set('bloque', e.target.value)}>{BLOQUES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></F>
            <F label="Vehículo"><Input value={r.vehiculoTipo} onChange={(e) => set('vehiculoTipo', e.target.value)} /></F>
            <F label="Propietario vehículo"><Select value={r.propietarioVehiculo} onChange={(e) => setProp(e.target.value)}>{PROPIETARIO.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
            <F label="Estado"><Select value={r.estado} onChange={(e) => set('estado', e.target.value)}>{ESTADOS_RUTA.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
          </Grid>
          {r.estado === 'cancelada' && <div className="mt-2"><F label="Motivo de cancelación"><Input value={r.motivoCancel} onChange={(e) => set('motivoCancel', e.target.value)} /></F></div>}
        </Card>
        <Card className="mb-3 p-4">
          {/* GO Home: Walmart paga el ingreso del almacén y tú defines el pago manualmente */}
          <div className={`mb-3 flex items-center gap-3 rounded-xl border p-3 ${r.goHome ? 'border-brand-gold bg-amber-50 dark:border-brand-gold/50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
            <button type="button" role="switch" aria-checked={r.goHome} onClick={() => setGoHome(!r.goHome)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.goHome ? 'bg-brand-gold' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.goHome ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100">🏠 GO Home {r.goHome && <Badge color="gold">activo</Badge>}</div>
              <div className="text-[11px] text-slate-400">Walmart paga el ingreso del almacén (se cobra en el invoice) y <b>tú defines a mano</b> el pago al driver. Ignora su tarifa.</div>
            </div>
          </div>

          <div className="mb-2 text-[11px] font-bold uppercase text-slate-400">Importes (se guardan en la ruta)</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="text-[10px] font-bold uppercase text-slate-400">Ingreso de Walmart (del almacén)</div>
              <div className="font-mono text-xl font-extrabold text-brand-navy dark:text-slate-100">{dinero(r.tarifaWalmart)}</div>
              <div className="text-[11px] text-slate-400">{r.almacenId ? (almacenes.find((a) => a.id === r.almacenId)?.nombre || '') : 'elige un almacén'}{r.goHome ? ' · se cobra a Walmart' : ''}</div>
            </div>
            <div className={`rounded-xl border p-3 ${r.goHome ? 'border-brand-gold bg-amber-50/60 dark:border-brand-gold/50 dark:bg-amber-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'}`}>
              <div className="text-[10px] font-bold uppercase text-slate-400">Pago al driver {r.goHome ? '(GO Home · manual)' : '(de su tarifa)'}</div>
              {r.goHome
                ? <Input type="number" value={r.tarifaDriver} onChange={(e) => set('tarifaDriver', e.target.value)} className="mt-1 w-32 font-mono text-lg font-bold" placeholder="0.00" />
                : <div className="font-mono text-xl font-extrabold text-emerald-600">{dinero(r.tarifaDriver)}</div>}
              <div className="text-[11px] text-slate-400">{r.goHome ? 'lo que le ofreciste (lo pagas tú)' : (r.driverId ? (tieneRatePropio(personas.find((x) => x.id === r.driverId)) ? 'tarifa personalizada' : 'tarifa por defecto') : 'elige un driver')}</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{r.goHome ? <>En <b>GO Home</b>, Walmart te paga el ingreso del almacén (entra al Financiero y al invoice) y el pago al driver lo pones a mano.</> : <>El <b>precio</b> lo define el <b>almacén</b> y el <b>pago</b> lo define el <b>driver</b>. Para un ajuste solo de esta ruta, usa bonos o deducciones.</>}</p>

          {/* Overtime (OT): Walmart paga otIngreso por OT, al driver se le paga otPago */}
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <F label="OT (overtime)"><Input type="number" min="0" value={r.otUnidades} onChange={(e) => setOT(e.target.value)} className="w-24" /></F>
            <div className="pb-1.5 text-xs">
              {(Number(r.otUnidades) || 0) > 0
                ? <span className="text-slate-500 dark:text-slate-300">OT: Walmart paga <b className="text-brand-navy dark:text-slate-100">{dinero(r.otIngreso)}</b> · driver recibe <b className="text-emerald-600">{dinero(r.otPago)}</b> <span className="text-slate-400">(${tarifas.otIngreso}/${tarifas.otPago} por OT)</span></span>
                : <span className="text-slate-400">Sin OT. Cada OT: Walmart <b>${tarifas.otIngreso}</b> · driver <b>${tarifas.otPago}</b> (se configura en Configuración).</span>}
            </div>
          </div>
          <AjustesEditor titulo="Bonos" tipo="bonos" lista={r.bonos} onAdd={() => addAj('bonos')} onSet={(i, k, v) => setAj('bonos', i, k, v)} onDel={(i) => delAj('bonos', i)} />
          <AjustesEditor titulo="Deducciones" tipo="deducciones" lista={r.deducciones} onAdd={() => addAj('deducciones')} onSet={(i, k, v) => setAj('deducciones', i, k, v)} onDel={(i) => delAj('deducciones', i)} />
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>Ingreso Walmart de esta ruta: <b className="font-mono text-brand-navy dark:text-slate-100">{dinero(ingresoRuta({ ...r, estado: 'completada' }))}</b></span>
            <span>Ganancia del driver: <b className="font-mono text-emerald-600">{dinero(gananciaDriver({ ...r, estado: 'completada' }))}</b></span>
            <span className="text-slate-400">(se cuentan solo si la ruta queda completada)</span>
          </div>
        </Card>
        <Card className="mb-3 p-4"><F label="Notas"><Input value={r.notas} onChange={(e) => set('notas', e.target.value)} /></F></Card>
      </fieldset>
      {err && <Aviso tipo="error" className="mb-3">{err}</Aviso>}
      <div className="flex flex-wrap items-center gap-2">
        {!bloqueado && <><Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar ruta'}</Boton><Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton></>}
        {bloqueado && <Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton>}
        {ruta.id && puedeEliminar && <button className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-rose-400 hover:text-rose-600" onClick={eliminarRuta}><Trash2 size={14} /> Eliminar ruta</button>}
      </div>
      {bloqueado && ruta.id && <p className="mt-2 text-[11px] text-slate-400">El día está cerrado. Si eliminas esta ruta, el cierre se actualiza automáticamente (sin reabrir el día).</p>}
    </div>
  )
}
function AjustesEditor({ titulo, lista, onAdd, onSet, onDel }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">{titulo}</div>
      {(lista || []).map((x, i) => (
        <div key={i} className="mb-1.5 flex flex-wrap items-center gap-2">
          <Input className="flex-1 min-w-[120px]" placeholder="Concepto" value={x.concepto} onChange={(e) => onSet(i, 'concepto', e.target.value)} />
          <Input type="number" className="w-24" placeholder="Monto" value={x.monto} onChange={(e) => onSet(i, 'monto', e.target.value)} />
          <Select className="w-32" value={x.aplicaA} onChange={(e) => onSet(i, 'aplicaA', e.target.value)}><option value="driver">A ganancia driver</option><option value="walmart">A ingreso Walmart</option></Select>
          <Input className="w-28" placeholder="Responsable" value={x.responsable} onChange={(e) => onSet(i, 'responsable', e.target.value)} />
          <button className="text-rose-400 hover:text-rose-600" onClick={() => onDel(i)}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline" onClick={onAdd}><Plus size={13} /> Agregar {titulo.toLowerCase()}</button>
    </div>
  )
}

// ── CIERRE DIARIO ───────────────────────────────────────────────────────────
function TabCierre({ rutas, almacenes, cierres }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [selAlms, setSelAlms] = useState([])
  const [filtro, setFiltro] = useState('todos') // todos | abiertos | cerrados | pendientes
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState(null)
  const activos = almacenes.filter((a) => a.activo !== false)
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && activos.length) { setSelAlms(activos.map((a) => a.id)); initRef.current = true } }, [almacenes]) // eslint-disable-line

  const datosAlm = (almId) => {
    const dia = rutas.filter((r) => r.fecha === fecha && r.almacenId === almId)
    const cierreDoc = cierres.find((c) => c.id === `c_${almId}_${fecha}`)
    const cerrado = cierreDoc?.estado === 'cerrado'
    const completadas = dia.filter((r) => r.estado === 'completada')
    const canceladas = dia.filter((r) => r.estado === 'cancelada')
    const pendientes = dia.filter((r) => r.estado === 'pendiente' || r.estado === 'en_progreso')
    const ingresoWM = money2(dia.reduce((a, r) => a + ingresoRuta(r), 0))
    const gananciaDrv = money2(dia.reduce((a, r) => a + gananciaDriver(r), 0))
    const drivers = new Set(dia.map((r) => r.driverId)).size
    return { almId, nombre: almacenes.find((a) => a.id === almId)?.nombre || '', dia, cierreDoc, cerrado, completadas, canceladas, pendientes, ingresoWM, gananciaDrv, drivers, puedeCerrar: dia.length > 0 && pendientes.length === 0 && !cerrado }
  }
  const seleccionados = activos.filter((a) => selAlms.includes(a.id)).map((a) => datosAlm(a.id))
  const visibles = seleccionados.filter((d) => filtro === 'todos' || (filtro === 'abiertos' && !d.cerrado) || (filtro === 'cerrados' && d.cerrado) || (filtro === 'pendientes' && d.pendientes.length > 0))
  const totIng = money2(seleccionados.reduce((a, d) => a + d.ingresoWM, 0))
  const totGan = money2(seleccionados.reduce((a, d) => a + d.gananciaDrv, 0))
  const totRutas = seleccionados.reduce((a, d) => a + d.dia.length, 0)
  const totPend = seleccionados.reduce((a, d) => a + d.pendientes.length, 0)
  const cerrables = seleccionados.filter((d) => d.puedeCerrar)

  const toggleAlm = (id) => setSelAlms((x) => x.includes(id) ? x.filter((y) => y !== id) : [...x, id])
  const resumenDe = (d) => ({ registradas: d.dia.length, completadas: d.completadas.length, canceladas: d.canceladas.length, pendientes: d.pendientes.length, drivers: d.drivers, ingresoWM: d.ingresoWM, gananciaDrv: d.gananciaDrv })

  const cerrarUno = async (d) => {
    if (!d.puedeCerrar) return
    setTrabajando(true); setMsg(null)
    try { await cerrarDia(d.almId, fecha, d.dia, resumenDe(d)); walToast(`${d.nombre} cerrado ✓`) }
    catch (e) { setMsg({ t: 'error', x: `No se pudo cerrar ${d.nombre}: ${e.message || e}` }) } finally { setTrabajando(false) }
  }
  const reabrirUno = async (d) => {
    const motivo = window.prompt(`Motivo de la reapertura de ${d.nombre} (queda auditado):`)
    if (motivo == null) return
    setTrabajando(true); setMsg(null)
    try { await reabrirDia(d.cierreDoc.id, d.dia, motivo); walToast(`${d.nombre} reabierto`) }
    catch (e) { setMsg({ t: 'error', x: `No se pudo reabrir ${d.nombre}: ${e.message || e}` }) } finally { setTrabajando(false) }
  }
  const cerrarTodos = async () => {
    if (!cerrables.length) { setMsg({ t: 'error', x: 'No hay almacenes listos para cerrar (revisa rutas pendientes o si ya están cerrados).' }); return }
    if (!window.confirm(`Se cerrará el día de ${cerrables.length} almacén(es): ${cerrables.map((d) => d.nombre).join(', ')}. ¿Confirmas?`)) return
    setTrabajando(true); setMsg(null)
    try {
      for (const d of cerrables) await cerrarDia(d.almId, fecha, d.dia, resumenDe(d))
      confeti(); walToast(`${cerrables.length} almacén(es) cerrados ✓`, 'gold')
      setMsg({ t: 'ok', x: `Cerrados: ${cerrables.map((d) => d.nombre).join(', ')}.` })
    } catch (e) { setMsg({ t: 'error', x: 'No se pudo cerrar todo: ' + (e.message || e) }) } finally { setTrabajando(false) }
  }

  return (
    <div>
      <PageTitle>Cierre diario</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Fecha"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <F label="Mostrar"><Select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="abiertos">Solo abiertos</option><option value="cerrados">Solo cerrados</option><option value="pendientes">Con pendientes</option></Select></F>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Almacenes (multiselección)</span>
            <div className="flex flex-wrap gap-1.5">
              {activos.map((a) => { const on = selAlms.includes(a.id); return <button key={a.id} type="button" onClick={() => toggleAlm(a.id)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${on ? 'border-brand-gold bg-amber-50 text-brand-navy dark:bg-amber-500/10 dark:text-amber-200' : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-700'}`}>{on ? '✓ ' : ''}{a.nombre}</button> })}
              {activos.length > 1 && <button type="button" onClick={() => setSelAlms(selAlms.length === activos.length ? [] : activos.map((a) => a.id))} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-gold hover:underline">{selAlms.length === activos.length ? 'Ninguno' : 'Todos'}</button>}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile n={totRutas} l="Rutas (selección)" />
        <Tile n={totPend} l="Pendientes" ambar={totPend > 0} />
        <Tile txt={dinero(totIng)} l="Ingreso Walmart" />
        <Tile txt={dinero(totGan)} l="Ganancia drivers" verde />
        <Tile n={cerrables.length} l="Listos para cerrar" />
      </div>

      {msg && <Aviso tipo={msg.t === 'ok' ? 'ok' : 'error'} className="mb-3">{msg.x}</Aviso>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Boton variant="gold" disabled={trabajando || !cerrables.length} onClick={cerrarTodos}>{trabajando ? <Spinner /> : `Cerrar seleccionados (${cerrables.length})`}</Boton>
        <span className="text-xs text-slate-400">Cierra a la vez todos los almacenes listos del día.</span>
      </div>

      <div className="space-y-2">
        {visibles.length === 0 && <Vacio icono={ClipboardCheck}>Sin almacenes para este filtro/selección.</Vacio>}
        {visibles.map((d) => (
          <Card key={d.almId} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: WALMART_AZUL }}><WhIcon size={15} /></span>
              <span className="font-bold text-brand-navy dark:text-slate-100">{d.nombre}</span>
              {d.cerrado ? <Badge color="green">Cerrado</Badge> : d.pendientes.length > 0 ? <Badge color="red">{d.pendientes.length} pendientes</Badge> : d.dia.length ? <Badge color="gold">Listo</Badge> : <Badge color="slate">Sin rutas</Badge>}
              <span className="ml-auto font-mono text-xs text-slate-500">WM {dinero(d.ingresoWM)} · drv {dinero(d.gananciaDrv)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile n={d.dia.length} l="Rutas" />
              <Tile n={d.completadas.length} l="Completadas" verde />
              <Tile n={d.pendientes.length} l="Pendientes" ambar={d.pendientes.length > 0} />
              <Tile n={d.canceladas.length} l="Canceladas" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!d.cerrado
                ? <Boton variant="ghost" disabled={trabajando || !d.puedeCerrar} onClick={() => cerrarUno(d)}>{d.puedeCerrar ? `Cerrar ${d.nombre}` : (d.pendientes.length ? 'Hay pendientes' : 'Sin rutas')}</Boton>
                : <><Badge color="green">Cerrado por {d.cierreDoc.cerradoPor || '—'}</Badge>{(d.cierreDoc.reaperturas || []).length > 0 && <span className="text-xs text-slate-400">{d.cierreDoc.reaperturas.length} reapertura(s)</span>}<Boton variant="ghost" disabled={trabajando} onClick={() => reabrirUno(d)}>Reabrir (auditado)</Boton></>}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">Cerrar consolida el día y bloquea las rutas de ese almacén. Con "Cerrar seleccionados" cierras varios almacenes a la vez.</p>
    </div>
  )
}
function Tile({ n, txt, l, verde, ambar }) {
  const cls = verde ? 'text-emerald-600 dark:text-emerald-400' : ambar ? 'text-amber-600 dark:text-amber-400' : 'text-brand-navy dark:text-slate-100'
  return <div className="rounded-xl border border-slate-200 bg-surface-card p-3 dark:border-slate-700 dark:bg-surface-dark-card"><div className={`font-mono text-xl font-extrabold ${cls}`}>{txt != null ? txt : n}</div><div className="text-[11px] font-semibold text-slate-500">{l}</div></div>
}

// ── PAGOS / FAST PAY ────────────────────────────────────────────────────────
// Hub de Pagos: una sola pantalla con sub-pestañas "Liquidaciones" y "Fast Pay".
function TabPagosHub({ rutas, pagos, personas, almacenes, tarifas, perm, solicitudes }) {
  const verLiq = !perm || perm.owner || perm.permisos?.pagos_ver
  const verFP = !perm || perm.owner || perm.permisos?.fp_ver
  const subs = []
  if (verLiq) subs.push({ id: 'liq', l: 'Liquidaciones' })
  if (verFP) subs.push({ id: 'fp', l: 'Fast Pay' })
  const [sub, setSub] = useState(() => { try { const s = localStorage.getItem('wal_pagos_sub'); if (subs.some((x) => x.id === s)) return s } catch { /* noop */ } return subs[0]?.id || 'liq' })
  const cambiar = (id) => { setSub(id); try { localStorage.setItem('wal_pagos_sub', id) } catch { /* noop */ } }
  const solPend = (solicitudes || []).filter((s) => s.estado === 'solicitada' && !rutaBloqueadaFP(pagos, s.rutaId))
  return (
    <div>
      {subs.length > 1 && (
        <div className="mb-3 inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
          {subs.map((s) => (
            <button key={s.id} onClick={() => cambiar(s.id)} style={sub === s.id ? { background: WALMART_AZUL, color: '#fff' } : undefined} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${sub === s.id ? 'shadow-sm' : 'text-slate-500 hover:text-brand-navy dark:text-slate-300'}`}>
              {s.l}{s.id === 'fp' && solPend.length > 0 && <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{solPend.length}</span>}
            </button>
          ))}
        </div>
      )}
      {sub === 'liq' && verLiq && <TabPagos rutas={rutas} pagos={pagos} personas={personas} tarifas={tarifas} perm={perm} />}
      {sub === 'fp' && verFP && <TabFastPay rutas={rutas} pagos={pagos} personas={personas} almacenes={almacenes} tarifas={tarifas} perm={perm} solicitudes={solicitudes} />}
    </div>
  )
}

function TabPagos({ rutas, pagos, personas, tarifas, perm }) {
  // Permisos de acción (separar ver de ejecutar/confirmar/anular). Dueño = todo.
  const pPreparaFP = !perm || perm.owner || perm.permisos?.fp_preparar
  const pEjecutaFP = !perm || perm.owner || perm.permisos?.fp_ejecutar
  const pPagaSemanal = !perm || perm.owner || perm.permisos?.pagos_ejecutar
  const pAnula = !perm || perm.owner || perm.permisos?.pagos_anular
  const [driverId, setDriverId] = useState('')
  const [modo, setModo] = useState('semana') // semana | rango
  const [fecha, setFecha] = useState(hoyISO())
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [fEstado, setFEstado] = useState('todos') // todos | pendiente | parcial | pagado
  const [q, setQ] = useState('')
  const [fpRuta, setFpRuta] = useState(null)
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const semana = lunesDe(fecha)
  const driver = personas.find((p) => p.id === driverId)
  const badgeEstado = { pendiente: 'red', parcial: 'gold', pagado: 'green' }
  const etiquetaEstado = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' }

  // Semanas incluidas en el período (para el modo rango).
  const semanasRango = () => { const out = []; let w = lunesDe(d1 <= d2 ? d1 : d2); const fin = lunesDe(d1 <= d2 ? d2 : d1); let g = 0; while (w <= fin && g < 120) { out.push(w); const dd = new Date(`${w}T00:00:00`); dd.setDate(dd.getDate() + 7); w = dd.toISOString().slice(0, 10); g++ } return out }
  const weeks = modo === 'semana' ? [semana] : semanasRango()
  // Período efectivo del detalle (mismo que el filtro de arriba).
  const detDesde = modo === 'semana' ? semana : (d1 <= d2 ? d1 : d2)
  const detHasta = modo === 'semana' ? domingoDe(fecha) : (d1 <= d2 ? d2 : d1)
  // Resumen del DETALLE sobre TODO el período (no una sola semana): agrega las
  // semanas del rango y junta todas las rutas y movimientos.
  const res = useMemo(() => {
    if (!driverId) return null
    const acc = { totalGanado: 0, liquidadoFP: 0, efectivoFP: 0, comisiones: 0, enProcesoFP: 0, pagadoNormal: 0, saldo: 0 }
    let rutasSemana = [], pagosAll = []
    for (const w of weeks) {
      const r = resumenSemana(rutas, pagos, driverId, w)
      for (const k in acc) acc[k] = money2(acc[k] + (r[k] || 0))
      rutasSemana = rutasSemana.concat(r.rutasSemana)
      pagosAll = pagosAll.concat(r.pagos)
    }
    rutasSemana.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    const estado = acc.saldo <= 0.005 ? (acc.totalGanado > 0.005 ? 'pagado' : 'pendiente') : ((acc.liquidadoFP + acc.pagadoNormal) > 0.005 ? 'parcial' : 'pendiente')
    return { ...acc, estado, rutasSemana, pagos: pagosAll }
  }, [driverId, rutas, pagos, weeks.join(',')]) // eslint-disable-line
  const resumenPeriodo = (did) => {
    const acc = { totalGanado: 0, liquidadoFP: 0, efectivoFP: 0, comisiones: 0, pagadoNormal: 0, saldo: 0 }
    for (const w of weeks) { const r = resumenSemana(rutas, pagos, did, w); for (const k in acc) acc[k] = money2(acc[k] + (r[k] || 0)) }
    const pagadoAlgo = (acc.liquidadoFP + acc.pagadoNormal) > 0.005
    acc.estado = acc.saldo <= 0.005 ? (acc.totalGanado > 0.005 ? 'pagado' : 'pendiente') : (pagadoAlgo ? 'parcial' : 'pendiente')
    acc.pagado = money2(acc.efectivoFP + acc.pagadoNormal)
    return acc
  }
  const lista = useMemo(() => personas.map((p) => ({ p, r: resumenPeriodo(p.id) }))
    // En Pagos solo tiene sentido ver a quien tuvo actividad en el período
    // (ganó algo); los que están en $0 no se muestran.
    .filter((x) => x.r.totalGanado > 0.005)
    .filter((x) => fEstado === 'todos' || x.r.estado === fEstado)
    .filter((x) => !q.trim() || nombreCompleto(x.p).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.r.saldo - a.r.saldo || nombreCompleto(a.p).localeCompare(nombreCompleto(b.p))), [personas, rutas, pagos, weeks.join(','), fEstado, q]) // eslint-disable-line
  const totPorPagar = money2(lista.reduce((a, x) => a + Math.max(0, x.r.saldo), 0))
  const nPend = lista.filter((x) => x.r.estado !== 'pagado' && x.r.saldo > 0.005).length

  // ── Multiselección para PAGAR A VARIOS a la vez y marcarlos pagados ──────────
  const [sel, setSel] = useState(() => new Set())
  const conSaldo = lista.filter((x) => x.r.saldo > 0.005)
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosSel = conSaldo.length > 0 && conSaldo.every((x) => sel.has(x.p.id))
  const selTodos = () => setSel(todosSel ? new Set() : new Set(conSaldo.map((x) => x.p.id)))
  const selItems = conSaldo.filter((x) => sel.has(x.p.id))
  const totalSel = money2(selItems.reduce((a, x) => a + x.r.saldo, 0))
  const [pagandoMasivo, setPagandoMasivo] = useState(false)
  const pagarSeleccionados = async () => {
    if (!selItems.length) return
    if (!window.confirm(`Marcar como PAGADO el saldo de ${selItems.length} chofer(es) por ${dinero(totalSel)}?\n\nSe registra un pago por cada semana con saldo. No se puede deshacer en bloque.`)) return
    setPagandoMasivo(true)
    try {
      let n = 0
      for (const { p } of selItems) {
        for (const w of weeks) {
          const rw = resumenSemana(rutas, pagos, p.id, w)
          if (rw.saldo > 0.005) { await guardar(COL.pagos, null, { tipo: 'pago', driverId: p.id, driverNombre: nombreCompleto(p), semana: w, monto: rw.saldo, fecha: hoyISO(), metodo: 'Efectivo', referencia: 'Pago masivo', responsable: perm?.email || 'dueño' }); n++ }
        }
      }
      await auditar('pago_masivo', `${selItems.length} choferes · ${dinero(totalSel)} · ${n} pagos`)
      walToast(`Pagados ${selItems.length} chofer(es) ✓`, 'gold')
      setSel(new Set())
    } catch (e) { walToast('No se pudo completar: ' + (e?.message || e), 'red') } finally { setPagandoMasivo(false) }
  }

  // Colores de badge por estado Fast Pay.
  const fpBadge = { pendiente: 'gold', confirmado: 'green', fallido: 'red', anulado: 'slate' }
  // Cambia el estado de un pago Fast Pay (confirmar / marcar fallido).
  const cambiarEstadoFP = async (p, nuevo, extra = {}) => {
    try {
      await guardar(COL.pagos, p.id, { estado: nuevo, ...extra })
      await auditar('fastpay-estado', `${p.driverNombre || ''} · ruta ${p.rutaId} · ${estadoFP(p)} → ${nuevo}`)
      walToast(`Fast Pay: ${ESTADO_FP_LABEL[nuevo]} ✓`, nuevo === 'confirmado' ? 'gold' : 'navy')
    } catch (e) { walToast('No se pudo actualizar: ' + (e.message || e), 'red') }
  }
  // Anula un Fast Pay confirmado: exige registrar cómo se recuperó el dinero.
  const anularFP = async (p) => {
    const nota = window.prompt('Anular este Fast Pay confirmado.\n\nEscribe cómo se RECUPERÓ el dinero adelantado al driver (obligatorio):')
    if (nota == null) return
    if (!nota.trim()) { walToast('Debes registrar la recuperación para poder anular.', 'red'); return }
    await cambiarEstadoFP(p, 'anulado', { recuperacion: nota.trim(), anuladoEn: hoyISO() })
  }

  return (
    <div>
      <PageTitle>Pagos y Fast Pay</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Ver por"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="semana">Semana</option><option value="rango">Rango de fechas</option></Select></F>
          {modo === 'semana'
            ? <F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
            : <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          <F label="Estado"><Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="parcial">Parciales</option><option value="pagado">Pagados</option></Select></F>
          <div className="relative min-w-[160px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-8" placeholder="Buscar driver…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="pb-1.5 text-xs font-semibold text-slate-400">{modo === 'semana' ? `${semana} → ${domingoDe(fecha)}` : `${d1 <= d2 ? d1 : d2} → ${d1 <= d2 ? d2 : d1}`} · Por pagar <b className="text-brand-navy dark:text-slate-100">{dinero(totPorPagar)}</b> · {nPend} pendientes</span>
        </div>
      </Card>

      {/* LISTA de drivers (cuando no hay uno abierto) */}
      {!driverId && (
        <>
          {lista.length === 0 && <Vacio icono={Wallet}>Sin drivers para este filtro.</Vacio>}

          {/* Barra de selección múltiple: pagar a varios de una vez. */}
          {pPagaSemanal && conSaldo.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/5 px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-navy dark:text-slate-100">
                <input type="checkbox" className="h-4 w-4 accent-brand-gold" checked={todosSel} onChange={selTodos} />
                Seleccionar todos con saldo ({conSaldo.length})
              </label>
              {selItems.length > 0
                ? <span className="text-xs text-slate-500 dark:text-slate-400"><b>{selItems.length}</b> seleccionado(s) · total <b className="text-brand-navy dark:text-slate-100">{dinero(totalSel)}</b></span>
                : <span className="text-xs text-slate-400">Marca los choferes que vas a pagar</span>}
              <Boton variant="gold" className="ml-auto" disabled={!selItems.length || pagandoMasivo} onClick={pagarSeleccionados}>
                {pagandoMasivo ? 'Pagando…' : <><Wallet size={14} /> Pagar seleccionados {selItems.length ? `(${selItems.length})` : ''}</>}
              </Boton>
            </div>
          )}

          <div className="space-y-1.5">
            {lista.map(({ p, r }) => {
              const marcable = pPagaSemanal && r.saldo > 0.005
              const marcado = sel.has(p.id)
              return (
                <Card key={p.id} className={`${FILA} ${marcado ? 'ring-2 ring-brand-gold' : ''}`} onClick={() => { if (modo === 'rango') setFecha(d2); setDriverId(p.id) }}>
                  {marcable
                    ? <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-gold" checked={marcado} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(p.id)} title="Seleccionar para pago masivo" />
                    : <span className="w-4 shrink-0" />}
                  <Avatar p={p} size={34} />
                  <span className="font-bold text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</span>
                  <Badge color={badgeEstado[r.estado]}>{etiquetaEstado[r.estado]}</Badge>
                  <span className="text-xs text-slate-400">ganó {dinero(r.totalGanado)} · pagado {dinero(r.pagado)}</span>
                  <span className="ml-auto font-mono text-sm font-bold" style={{ color: r.saldo > 0.005 ? '#D9822B' : '#2E9E6B' }}>{r.saldo > 0.005 ? `saldo ${dinero(r.saldo)}` : 'al día'}</span>
                  <span className="text-xs font-semibold text-brand-gold">ver / pagar →</span>
                </Card>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Marca varios y usa <b>Pagar seleccionados</b> para liquidar a todos de una vez, o toca un driver para ver sus rutas y hacer Fast Pay. En modo <b>Rango</b> el pago masivo registra un pago por cada semana con saldo.</p>
        </>
      )}

      {/* DETALLE de un driver (semana de la fecha elegida) */}
      {driverId && (
        <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-steel hover:text-brand-navy dark:hover:text-white" onClick={() => setDriverId('')}><ArrowLeft size={15} /> Volver a la lista</button>
      )}
      {driverId && (
        <Card className="mb-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar p={driver} size={32} /><span className="font-bold text-brand-navy dark:text-slate-100">{nombreCompleto(driver)}</span>
            {modo === 'semana'
              ? <><F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F><span className="pb-1 text-xs text-slate-400">{semana} → {domingoDe(fecha)}</span></>
              : <span className="pb-1 text-xs font-semibold text-slate-400">Período {detDesde} → {detHasta} <span className="font-normal">· cambia las fechas en el filtro de arriba</span></span>}
          </div>
        </Card>
      )}
      {driverId && res && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile txt={dinero(res.totalGanado)} l="Total ganado (antes de FP)" />
            <Tile txt={dinero(res.liquidadoFP)} l="Bruto liquidado por Fast Pay" />
            <Tile txt={dinero(res.efectivoFP)} l="Efectivo entregado (FP)" />
            <Tile txt={dinero(res.comisiones)} l="Comisiones FP (ingreso compañía)" verde />
            <Tile txt={dinero(res.pagadoNormal)} l="Otros pagos" />
            {res.enProcesoFP > 0.005 && <Tile txt={dinero(res.enProcesoFP)} l="En proceso (FP pendiente)" ambar />}
            <Tile txt={dinero(res.saldo)} l="Saldo pendiente" ambar={res.saldo > 0.005} />
          </div>
          <Card className="mb-3 p-3 text-xs text-slate-500 dark:text-slate-400">
            <b className="text-brand-navy dark:text-slate-100">Conciliación del período:</b> {res.rutasSemana.length} rutas · bruto generado {dinero(res.totalGanado)} · liquidado por Fast Pay {dinero(res.liquidadoFP)} · comisiones {dinero(res.comisiones)} (ingreso aparte, <b>no</b> se resta del saldo) · otros pagos {dinero(res.pagadoNormal)} → <b>saldo pendiente {dinero(res.saldo)}</b>.
          </Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge color={badgeEstado[res.estado]}>{res.estado === 'pagado' ? 'Pagado' : res.estado === 'parcial' ? 'Parcialmente pagado' : 'Pendiente'}</Badge>
            {res.saldo > 0.005 && pPagaSemanal && modo === 'semana' && <Boton variant="gold" onClick={() => setPagoAbierto(true)}><Wallet size={14} /> Registrar pago del saldo</Boton>}
            {res.saldo > 0.005 && modo === 'rango' && <span className="text-xs text-slate-400">Para pagar: usa <b>Fast Pay</b> en cada ruta (abajo), o cambia a modo <b>Semana</b> para registrar el pago del saldo.</span>}
            {driver && res.rutasSemana.length > 0 && <Boton variant="ghost" onClick={() => pdfPayStub(driver, detDesde, detHasta, res)}>Pay stub PDF</Boton>}
          </div>

          <Card className="mb-3 p-0">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Rutas completadas del período</div>
            {res.rutasSemana.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin rutas completadas en el período.</div>}
            {res.rutasSemana.map((r) => {
              const liq = liquidadoFPruta(pagos, r.id)
              const bruto = gananciaDriver(r)
              const resta = money2(bruto - liq)
              const fpPend = pagos.find((p) => p.rutaId === r.id && estadoFP(p) === 'pendiente') || null
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                  <span className="font-mono text-xs text-slate-400">{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label}</span>
                  {r.identificador && <span className="text-xs text-slate-400">{r.identificador}</span>}
                  <span className="font-mono font-semibold">{dinero(bruto)}</span>
                  {liq > 0 && <Badge color="green">FP liquidado {dinero(liq)}</Badge>}
                  {fpPend && <Badge color="gold">FP en proceso {dinero(fpPend.bruto)}</Badge>}
                  <span className="ml-auto text-xs text-slate-400">resta {dinero(resta)}</span>
                  {fpPend ? (
                    pEjecutaFP ? (
                      <span className="flex items-center gap-2">
                        <button className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => cambiarEstadoFP(fpPend, 'confirmado')}>Confirmar</button>
                        <button className="text-xs font-bold text-rose-500 hover:underline" onClick={() => cambiarEstadoFP(fpPend, 'fallido')}>Falló</button>
                      </span>
                    ) : <span className="text-xs text-slate-400">en proceso</span>
                  ) : resta > 0.005 && pPreparaFP ? (
                    <button className="text-xs font-bold text-brand-gold hover:underline" onClick={() => setFpRuta({ ...r, resta })}><Zap size={12} className="mb-0.5 mr-0.5 inline" />Fast Pay</button>
                  ) : null}
                </div>
              )
            })}
          </Card>

          {res.pagos.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Movimientos del período</div>
              {res.pagos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((p, i) => {
                const est = p.tipo === 'fastpay' ? estadoFP(p) : null
                return (
                <div key={p.id || i} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2 text-sm last:border-0 dark:border-slate-800/60">
                  <Badge color={p.tipo === 'fastpay' ? 'gold' : 'navy'}>{p.tipo === 'fastpay' ? 'Fast Pay' : 'Pago'}</Badge>
                  {est && <Badge color={fpBadge[est]}>{ESTADO_FP_LABEL[est]}</Badge>}
                  <span className="font-mono text-xs text-slate-400">{p.fecha}</span>
                  {p.tipo === 'fastpay'
                    ? <span className="text-xs">bruto {dinero(p.bruto)} · comisión {dinero(p.comision)} ({p.comisionPct}%) · efectivo <b>{dinero(p.efectivo)}</b></span>
                    : <span className="text-xs">monto <b>{dinero(p.monto)}</b></span>}
                  {p.recuperacion && <span className="text-xs italic text-slate-400">recuperación: {p.recuperacion}</span>}
                  <span className="ml-auto text-xs text-slate-400">{p.metodo}{p.referencia ? ` · ${p.referencia}` : ''}{p.responsable ? ` · ${p.responsable}` : ''}</span>
                  {est === 'pendiente' && pEjecutaFP && (
                    <span className="flex items-center gap-2">
                      <button className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => cambiarEstadoFP(p, 'confirmado')}>Confirmar</button>
                      <button className="text-xs font-bold text-rose-500 hover:underline" onClick={() => cambiarEstadoFP(p, 'fallido')}>Falló</button>
                    </span>
                  )}
                  {est === 'confirmado' && pAnula && <button className="text-xs font-bold text-slate-400 hover:text-rose-500 hover:underline" onClick={() => anularFP(p)}>Anular</button>}
                </div>
                )
              })}
            </Card>
          )}
        </>
      )}

      {fpRuta && <FastPayModal ruta={fpRuta} driver={driver} semana={semana} pagos={pagos} pctDefault={tarifas.comisionFastPay} puedeEjecutar={pEjecutaFP} onCerrar={() => setFpRuta(null)} />}
      {pagoAbierto && res && <PagoModal driver={driver} semana={semana} saldo={res.saldo} onCerrar={() => setPagoAbierto(false)} />}
    </div>
  )
}

// ── FAST PAY (consola dedicada) ───────────────────────────────────────────────
// Lista TODAS las rutas disponibles para adelantar (de todos los choferes), con
// su botón de Fast Pay, confirmaciones y un resumen. Reutiliza FastPayModal.
function TabFastPay({ rutas, pagos, personas, almacenes, tarifas, perm, solicitudes = [] }) {
  const pPreparaFP = !perm || perm.owner || perm.permisos?.fp_preparar
  const pEjecutaFP = !perm || perm.owner || perm.permisos?.fp_ejecutar
  const pAnula = !perm || perm.owner || perm.permisos?.pagos_anular
  // Solicitudes de los choferes aún sin atender (ruta sin Fast Pay).
  const solPend = (solicitudes || []).filter((s) => s.estado === 'solicitada' && !rutaBloqueadaFP(pagos, s.rutaId))
  const rechazar = async (s) => { if (!window.confirm('¿Rechazar esta solicitud de Fast Pay?')) return; try { await atenderSolicitud(s.id, 'rechazada'); walToast('Solicitud rechazada') } catch (e) { walToast('No se pudo: ' + (e?.message || e), 'red') } }
  const [modo, setModo] = useState('semana')
  const [fecha, setFecha] = useState(hoyISO())
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const [q, setQ] = useState('')
  const [vista, setVista] = useState('disponibles') // disponibles | en_proceso | liquidadas
  const [fpRuta, setFpRuta] = useState(null)
  const desde = modo === 'semana' ? lunesDe(fecha) : (d1 <= d2 ? d1 : d2)
  const hasta = modo === 'semana' ? domingoDe(fecha) : (d1 <= d2 ? d2 : d1)
  const driverNombre = (id) => { const p = personas.find((x) => x.id === id); return p ? nombreCompleto(p) : '—' }
  const fpBadge = { pendiente: 'gold', confirmado: 'green', fallido: 'red', anulado: 'slate' }

  const cambiarEstadoFP = async (p, nuevo, extra = {}) => {
    try { await guardar(COL.pagos, p.id, { estado: nuevo, ...extra }); await auditar('fastpay-estado', `${p.driverNombre || ''} · ruta ${p.rutaId} · ${estadoFP(p)} → ${nuevo}`); walToast(`Fast Pay: ${ESTADO_FP_LABEL[nuevo]} ✓`, nuevo === 'confirmado' ? 'gold' : 'navy') } catch (e) { walToast('No se pudo: ' + (e.message || e), 'red') }
  }
  const anularFP = async (p) => { const nota = window.prompt('Anular este Fast Pay confirmado.\n\n¿Cómo RECUPERASTE el dinero adelantado? (obligatorio)'); if (nota == null) return; if (!nota.trim()) { walToast('Debes registrar la recuperación.', 'red'); return } await cambiarEstadoFP(p, 'anulado', { recuperacion: nota.trim(), anuladoEn: hoyISO() }) }

  const txt = q.trim().toLowerCase()
  const items = useMemo(() => rutas
    .filter((r) => r.estado === 'completada' && r.fecha >= desde && r.fecha <= hasta && (!almId || r.almacenId === almId))
    .filter((r) => !txt || `${r.driverNombre || driverNombre(r.driverId)} ${r.identificador || ''}`.toLowerCase().includes(txt))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .map((r) => {
      const liq = liquidadoFPruta(pagos, r.id)
      const bruto = gananciaDriver(r)
      const resta = money2(bruto - liq)
      const fp = pagos.find((p) => p.rutaId === r.id && (estadoFP(p) === 'pendiente' || estadoFP(p) === 'confirmado')) || null
      const est = fp ? estadoFP(fp) : (resta > 0.005 ? 'disponible' : 'nada')
      return { r, bruto, liq, resta, fp, est }
    }), [rutas, pagos, desde, hasta, almId, txt, personas]) // eslint-disable-line
  const disponibles = items.filter((x) => x.est === 'disponible')
  const enProceso = items.filter((x) => x.est === 'pendiente')
  const liquidadas = items.filter((x) => x.est === 'confirmado')
  const totDisp = money2(disponibles.reduce((a, x) => a + x.resta, 0))
  const totProceso = money2(enProceso.reduce((a, x) => a + (Number(x.fp.bruto) || 0), 0))
  const totLiq = money2(liquidadas.reduce((a, x) => a + (Number(x.fp.efectivo) || 0), 0))
  const totComis = money2(liquidadas.reduce((a, x) => a + (Number(x.fp.comision) || 0), 0))
  const lista = vista === 'disponibles' ? disponibles : vista === 'en_proceso' ? enProceso : liquidadas
  const VISTAS = [{ id: 'disponibles', l: `Disponibles (${disponibles.length})` }, { id: 'en_proceso', l: `En proceso (${enProceso.length})` }, { id: 'liquidadas', l: `Liquidadas (${liquidadas.length})` }]

  return (
    <div>
      <PageTitle>Fast Pay · adelantos por ruta</PageTitle>

      {/* Solicitudes de los choferes (notificación + atención) */}
      {solPend.length > 0 && (
        <Card className="mb-3 border-l-4 border-l-rose-400 p-0">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <Zap size={15} className="text-rose-500" />
            <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Solicitudes de Fast Pay</span>
            <Badge color="red">{solPend.length} nueva{solPend.length !== 1 ? 's' : ''}</Badge>
          </div>
          {solPend.map((s) => {
            const r = rutas.find((x) => x.id === s.rutaId)
            const bruto = r ? gananciaDriver(r) : (Number(s.bruto) || 0)
            const resta = r ? money2(bruto - liquidadoFPruta(pagos, r.id)) : bruto
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/10 text-[10px] font-bold text-rose-500">{(s.driverNombre || '?').slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-brand-navy dark:text-slate-100">{s.driverNombre || driverNombre(s.driverId)}</div>
                  <div className="font-mono text-[11px] text-slate-400">{s.fecha}{r ? ` · ${BLOQUES.find((b) => b.id === r.bloque)?.label || ''}` : ''}{s.nota ? ` · "${s.nota}"` : ''}</div>
                </div>
                <span className="ml-auto font-mono font-semibold">{dinero(bruto)}</span>
                {r && pPreparaFP && resta > 0.005 && <Boton variant="gold" onClick={() => setFpRuta({ ...r, resta })}><Zap size={13} /> Hacer Fast Pay</Boton>}
                {!r && <span className="text-xs text-slate-400">ruta no encontrada</span>}
                <button className="text-xs font-semibold text-slate-400 hover:text-rose-500 hover:underline" onClick={() => rechazar(s)}>rechazar</button>
              </div>
            )
          })}
        </Card>
      )}

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Ver por"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="semana">Semana (sáb→vie)</option><option value="rango">Rango de fechas</option></Select></F>
          {modo === 'semana'
            ? <F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
            : <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <div className="relative min-w-[160px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-8" placeholder="Buscar driver…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="pb-1.5 text-xs font-semibold text-slate-400">{desde} → {hasta}</span>
        </div>
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KPI animado label="Disponible para FP" value={dinero(totDisp)} icon={Zap} accent="gold" sub={`${disponibles.length} rutas`} />
        <KPI animado label="En proceso (pendiente)" value={dinero(totProceso)} icon={Clock} accent="navy" sub={`${enProceso.length} rutas`} />
        <KPI animado label="Adelantado (confirmado)" value={dinero(totLiq)} icon={Wallet} accent="green" sub={`${liquidadas.length} rutas`} />
        <KPI animado label="Comisiones (utilidad)" value={dinero(totComis)} icon={TrendingUp} accent="green" sub="ingreso compañía" />
      </div>

      <div className="mb-2 flex gap-1">
        {VISTAS.map((v) => <button key={v.id} onClick={() => setVista(v.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${vista === v.id ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{v.l}</button>)}
      </div>

      <Card className="p-0">
        {lista.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">{vista === 'disponibles' ? 'No hay rutas disponibles para Fast Pay en este período.' : vista === 'en_proceso' ? 'Sin Fast Pay en proceso.' : 'Sin Fast Pay liquidados.'}</div>}
        {lista.map(({ r, bruto, resta, fp }) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-[10px] font-bold text-brand-navy dark:bg-white/10 dark:text-slate-100">{(driverNombre(r.driverId) || '?').slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-brand-navy dark:text-slate-100">{driverNombre(r.driverId)}</div>
              <div className="font-mono text-[11px] text-slate-400">{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label || ''}{r.identificador ? ` · ${r.identificador}` : ''}</div>
            </div>
            {fp && <Badge color={fpBadge[estadoFP(fp)]}>{ESTADO_FP_LABEL[estadoFP(fp)]} {dinero(fp.bruto)}</Badge>}
            <span className="ml-auto font-mono font-semibold">{dinero(bruto)}</span>
            {vista === 'disponibles' && pPreparaFP && <Boton variant="gold" onClick={() => setFpRuta({ ...r, resta })}><Zap size={13} /> Fast Pay</Boton>}
            {vista === 'en_proceso' && fp && (pEjecutaFP
              ? <span className="flex items-center gap-2"><button className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => cambiarEstadoFP(fp, 'confirmado')}>Confirmar</button><button className="text-xs font-bold text-rose-500 hover:underline" onClick={() => cambiarEstadoFP(fp, 'fallido')}>Falló</button></span>
              : <span className="text-xs text-slate-400">en proceso</span>)}
            {vista === 'liquidadas' && fp && <span className="flex items-center gap-2 text-xs text-slate-400">efectivo {dinero(fp.efectivo)} · com. {dinero(fp.comision)}<button className="inline-flex items-center gap-1 font-semibold text-brand-gold hover:underline" onClick={() => pdfReciboFP(fp, personas.find((p) => p.id === r.driverId))}><Download size={12} /> recibo</button>{pAnula && <button className="font-bold text-slate-400 hover:text-rose-500 hover:underline" onClick={() => anularFP(fp)}>anular</button>}</span>}
          </div>
        ))}
      </Card>
      <p className="mt-3 text-[11px] text-slate-400">Fast Pay adelanta el pago de una ruta completada con una comisión ({tarifas.comisionFastPay}%) que es tu <b>utilidad por financiamiento</b>. "Disponibles" son rutas sin adelanto; una ruta no se puede pagar dos veces.</p>

      {fpRuta && <FastPayModal ruta={fpRuta} driver={personas.find((p) => p.id === fpRuta.driverId)} semana={lunesDe(fpRuta.fecha)} pagos={pagos} pctDefault={tarifas.comisionFastPay} puedeEjecutar={pEjecutaFP} onCerrar={() => setFpRuta(null)} />}
    </div>
  )
}

function FastPayModal({ ruta, driver, semana, pagos, pctDefault, puedeEjecutar = true, onCerrar }) {
  const [bruto, setBruto] = useState(ruta.resta)
  const [pct, setPct] = useState(pctDefault)
  const [metodo, setMetodo] = useState('Efectivo')
  const [referencia, setReferencia] = useState('')
  const [responsable, setResponsable] = useState('')
  const [comprobante, setComprobante] = useState('')
  // Quien solo puede PREPARAR (no ejecutar) deja el pago en 'pendiente'.
  const [estadoIni, setEstadoIni] = useState(puedeEjecutar ? 'confirmado' : 'pendiente')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const calc = calcularFastPay(bruto, pct)
  const restante = money2(ruta.resta - calc.bruto)
  const yaBloqueada = rutaBloqueadaFP(pagos || [], ruta.id) // anti doble pago
  const confirmar = async () => {
    if (yaBloqueada) { setErr('Esta ruta ya tiene un Fast Pay en proceso o liquidado. No se puede pagar dos veces.'); return }
    if (calc.bruto <= 0) { setErr('El bruto debe ser mayor a 0.'); return }
    if (calc.bruto > ruta.resta + 0.005) { setErr(`No puedes liquidar más que el saldo de la ruta (${dinero(ruta.resta)}).`); return }
    setErr(''); setGuardando(true)
    const idDet = `fp_${ruta.id}`.replace(/[^a-zA-Z0-9_]/g, '')
    const payload = {
      rutaId: ruta.id, estado: estadoIni, driverId: driver.id, driverNombre: nombreCompleto(driver),
      semana: lunesDe(ruta.fecha), almacenId: ruta.almacenId || '',
      bruto: calc.bruto, comisionPct: Number(pct) || 0, fecha: hoyISO(), metodo, referencia, responsable, comprobante,
    }
    try {
      // 1) Vía preferida: Cloud Function con TRANSACCIÓN (anti doble pago real,
      // incluso entre dos dispositivos a la vez).
      await httpsCallable(getFunctions(), 'walFastPayCrear')(payload)
      walToast(estadoIni === 'confirmado' ? 'Fast Pay confirmado ✓' : 'Fast Pay iniciado (pendiente)', 'gold')
      onCerrar()
    } catch (e) {
      const code = e?.code || ''
      if (code === 'functions/already-exists') { setErr('Esta ruta ya tiene un Fast Pay. No se puede pagar dos veces.'); setGuardando(false); return }
      if (code === 'functions/permission-denied') { setErr(e.message || 'No tienes permiso para este Fast Pay.'); setGuardando(false); return }
      // 2) Respaldo (si la función aún no está desplegada): escritura directa con
      // id determinista. Sigue evitando duplicados de documento en este navegador.
      try {
        await guardar(COL.pagos, idDet, {
          tipo: 'fastpay', estado: estadoIni, driverId: driver.id, driverNombre: nombreCompleto(driver), semana: lunesDe(ruta.fecha), rutaId: ruta.id, almacenId: ruta.almacenId || '',
          bruto: calc.bruto, comisionPct: Number(pct) || 0, comision: calc.comision, efectivo: calc.efectivo,
          fecha: hoyISO(), metodo, referencia, responsable, comprobante,
        })
        await auditar('fastpay', `${nombreCompleto(driver)} · ruta ${ruta.id} · ${estadoIni} · bruto ${calc.bruto} · comisión ${calc.comision} · efectivo ${calc.efectivo}`)
        walToast(estadoIni === 'confirmado' ? 'Fast Pay confirmado ✓' : 'Fast Pay iniciado (pendiente)', 'gold')
        onCerrar()
      } catch (e2) { setErr('No se pudo registrar: ' + (e2.message || e2)) }
    } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Fast Pay (anticipo de una ruta completada)" onCerrar={onCerrar}>
      {yaBloqueada && <Aviso tipo="warn" className="mb-3">Esta ruta ya tiene un Fast Pay en proceso o liquidado. No se puede volver a pagar.</Aviso>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <F label="Importe bruto a liquidar"><Input type="number" value={bruto} onChange={(e) => setBruto(e.target.value)} /></F>
        <F label="Comisión (%)"><Input type="number" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} /></F>
        <F label="Estado del pago"><Select value={estadoIni} onChange={(e) => setEstadoIni(e.target.value)} disabled={!puedeEjecutar}>{puedeEjecutar && <option value="confirmado">Confirmado (pagado ahora)</option>}<option value="pendiente">Pendiente (en proceso)</option></Select></F>
        <F label="Método"><Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}</Select></F>
        <F label="Referencia"><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></F>
        <F label="Responsable"><Select value={responsable} onChange={(e) => setResponsable(e.target.value)}><option value="">— elegir —</option><option value="Gabriele">Gabriele</option><option value="Carlos">Carlos</option></Select></F>
        <div className="sm:col-span-2"><F label="Comprobante (nota / # recibo)"><Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} /></F></div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex justify-between"><span>Bruto liquidado</span><b className="font-mono">{dinero(calc.bruto)}</b></div>
        <div className="flex justify-between text-amber-700 dark:text-amber-300"><span>Comisión ({pct}%) — ingreso de la compañía</span><b className="font-mono">−{dinero(calc.comision)}</b></div>
        <div className="flex justify-between border-t border-amber-200 pt-1 dark:border-amber-500/30"><span>Efectivo a entregar al driver</span><b className="font-mono text-emerald-600">{dinero(calc.efectivo)}</b></div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Saldo restante de la ruta</span><span className="font-mono">{dinero(restante)}</span></div>
        <div className="mt-1 text-[11px] text-slate-500">{estadoIni === 'confirmado' ? 'Se liquida la ruta de inmediato y la comisión cuenta como utilidad por financiamiento.' : 'La ruta queda bloqueada (no se puede volver a pagar) pero NO se liquida hasta confirmar.'}</div>
      </div>
      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={guardando || yaBloqueada} onClick={confirmar}>{guardando ? <Spinner /> : (estadoIni === 'confirmado' ? 'Confirmar Fast Pay' : 'Iniciar (pendiente)')}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </Modal>
  )
}

function PagoModal({ driver, semana, saldo, onCerrar }) {
  const [monto, setMonto] = useState(saldo)
  const [metodo, setMetodo] = useState('Efectivo')
  const [referencia, setReferencia] = useState('')
  const [responsable, setResponsable] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const confirmar = async () => {
    const m = money2(monto)
    if (m <= 0) { setErr('El monto debe ser mayor a 0.'); return }
    if (m > saldo + 0.005) { setErr(`No puedes pagar más que el saldo pendiente (${dinero(saldo)}).`); return }
    setErr(''); setGuardando(true)
    try {
      await guardar(COL.pagos, null, { tipo: 'pago', driverId: driver.id, driverNombre: nombreCompleto(driver), semana, monto: m, fecha: hoyISO(), metodo, referencia, responsable })
      await auditar('pago', `${nombreCompleto(driver)} · semana ${semana} · ${m}`)
      walToast('Pago registrado ✓')
      onCerrar()
    } catch (e) { setErr('No se pudo registrar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Registrar pago del saldo" onCerrar={onCerrar}>
      <Grid>
        <F label="Monto (saldo pendiente)"><Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></F>
        <F label="Método"><Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}</Select></F>
        <F label="Referencia"><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></F>
        <F label="Responsable"><Select value={responsable} onChange={(e) => setResponsable(e.target.value)}><option value="">— elegir —</option><option value="Gabriele">Gabriele</option><option value="Carlos">Carlos</option></Select></F>
      </Grid>
      <p className="mt-2 text-xs text-slate-400">Puedes pagar parcial. La fecha del pago no cambia la semana en que se ganó el dinero.</p>
      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={guardando} onClick={confirmar}>{guardando ? <Spinner /> : 'Registrar pago'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </Modal>
  )
}

function Modal({ titulo, children, onCerrar, ancho = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-8 sm:p-4 sm:pt-16" onClick={onCerrar}>
      <div className={`flex max-h-[calc(100vh-4rem)] w-full ${ancho} flex-col overflow-hidden rounded-2xl bg-surface-card shadow-2xl dark:bg-surface-dark-card`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</div>
          <button onClick={onCerrar} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── GASTOS ──────────────────────────────────────────────────────────────────
function TabGastos({ gastos, almacenes, personas, rutas }) {
  const [editar, setEditar] = useState(null)
  const [fCat, setFCat] = useState('')
  const [fAlm, setFAlm] = useState('')
  const [fDrv, setFDrv] = useState('')
  const almNombre = (id) => almacenes.find((a) => a.id === id)?.nombre || 'General'
  const driverNombre = (id) => { const p = personas.find((x) => x.id === id); return p ? nombreCompleto(p) : '—' }
  const rutaInfo = (id) => { const r = (rutas || []).find((x) => x.id === id); return r ? `${r.fecha} · ${BLOQUES.find((b) => b.id === r.bloque)?.label || r.bloque}${r.driverNombre ? ` · ${r.driverNombre}` : ''}${r.identificador ? ` · ${r.identificador}` : ''}` : '' }
  const conGasto = personas.filter((p) => gastos.some((g) => g.driverId === p.id)).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  const lista = useMemo(() => gastos.filter((g) => (!fCat || g.categoria === fCat) && (!fAlm || g.almacenId === fAlm) && (!fDrv || g.driverId === fDrv)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [gastos, fCat, fAlm, fDrv])
  if (editar) return <GastoEditor gasto={editar} almacenes={almacenes} personas={personas} rutas={rutas} onCerrar={() => setEditar(null)} />
  const total = lista.reduce((a, g) => a + (Number(g.monto) || 0), 0)
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setEditar({})}><Plus size={15} /> Nuevo gasto</Boton>}>Gastos</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Categoría"><Select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas</option>{CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}</Select></F>
          <F label="Almacén"><Select value={fAlm} onChange={(e) => setFAlm(e.target.value)}><option value="">Todos / General</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Driver"><Select value={fDrv} onChange={(e) => setFDrv(e.target.value)}><option value="">Todos</option>{conGasto.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
          <div className="ml-auto text-right text-xs text-slate-400">Total mostrado <b className="text-brand-navy dark:text-slate-100">{dinero(total)}</b></div>
        </div>
      </Card>
      {(() => {
        const porDrv = {}
        for (const g of lista) { const k = g.driverId || '__none'; porDrv[k] = (porDrv[k] || 0) + (Number(g.monto) || 0) }
        const filas = Object.entries(porDrv).map(([k, v]) => ({ k, v: money2(v), nombre: k === '__none' ? 'Sin driver' : driverNombre(k) })).sort((a, b) => b.v - a.v)
        if (filas.length <= 1) return null
        return (
          <Card className="mb-3 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Gasto por driver (lo mostrado)</div>
            <div className="flex flex-wrap gap-2">
              {filas.map((f) => (
                <button key={f.k} type="button" onClick={() => setFDrv(f.k === '__none' ? '' : (fDrv === f.k ? '' : f.k))} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${fDrv === f.k ? 'border-brand-gold bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 hover:border-brand-gold/50 dark:border-slate-700'}`}>
                  <span className="font-semibold text-brand-navy dark:text-slate-100">{f.nombre}</span>
                  <span className="font-mono font-bold text-brand-gold">{dinero(f.v)}</span>
                </button>
              ))}
            </div>
          </Card>
        )
      })()}
      {lista.length === 0 && <Vacio icono={Receipt}>Sin gastos. Agrega el primero con “Nuevo gasto”.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((g) => (
          <Card key={g.id} className="p-3 transition hover:border-brand-gold/40 hover:shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="navy">{g.categoria}</Badge>
              <span className="font-semibold text-brand-navy dark:text-slate-100">{g.concepto || '—'}</span>
              <span className="font-mono text-sm font-bold">{dinero(g.monto)}</span>
              <Badge color="slate">{almNombre(g.almacenId)}</Badge>
              {g.periodoDesde && <Badge color="gold">mensual · reparte</Badge>}
              {g.esFinanciamiento && <Badge color="blue">financiamiento</Badge>}
              <Badge color={g.estadoPago === 'pagado' ? 'green' : 'red'}>{g.estadoPago === 'pagado' ? 'pagado' : 'pendiente'}</Badge>
              <button className="ml-auto text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEditar(g)}>editar</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>📅 {g.fecha}</span>
              {g.driverId && <span>👤 Driver: <b className="text-brand-navy dark:text-slate-200">{driverNombre(g.driverId)}</b></span>}
              {g.rutaId && rutaInfo(g.rutaId) && <span>🛣️ Ruta: <b className="text-brand-navy dark:text-slate-200">{rutaInfo(g.rutaId)}</b></span>}
              {g.rutaId && !rutaInfo(g.rutaId) && <span className="text-rose-400">🛣️ Ruta: (eliminada)</span>}
              {g.vehiculo && <span>🚐 {g.vehiculo}</span>}
              {g.responsable && <span>· {g.responsable}</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function GastoEditor({ gasto, almacenes, personas, rutas, onCerrar }) {
  const [g, setG] = useState({ categoria: CATEGORIAS_GASTO[1], concepto: '', monto: '', fecha: hoyISO(), tipo: 'variable', almacenId: '', driverId: '', vehiculo: '', rutaId: '', responsable: '', estadoPago: 'pendiente', fechaPago: '', esFinanciamiento: false, periodoDesde: '', periodoHasta: '', ...gasto, mensual: !!gasto.periodoDesde })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setG((x) => ({ ...x, [k]: v }))
  const rutasDrv = (rutas || []).filter((r) => !g.driverId || r.driverId === g.driverId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 30)
  const dist = g.mensual && g.periodoDesde && g.periodoHasta ? distribuirMensual(g.monto, g.periodoDesde, g.periodoHasta) : []
  const salvar = async () => {
    if (!g.concepto.trim() || !g.monto) { window.alert('Pon concepto y monto.'); return }
    setGuardando(true)
    try {
      const data = { ...g, monto: money2(g.monto), semana: lunesDe(g.fecha), categoria: g.categoria, esFinanciamiento: g.categoria === 'Cargo Van (financiamiento)' || g.esFinanciamiento }
      if (!g.mensual) { delete data.periodoDesde; delete data.periodoHasta }
      delete data.mensual
      await guardar(COL.gastos, gasto.id, data)
      await auditar('gasto_guardado', `${g.categoria} · ${g.concepto} · ${money2(g.monto)}`)
      walToast('Gasto guardado ✓')
      onCerrar()
    } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton>}>{gasto.id ? 'Editar gasto' : 'Nuevo gasto'}</PageTitle>
      <Card className="mb-3 p-4">
        <Grid>
          <F label="Categoría"><Select value={g.categoria} onChange={(e) => set('categoria', e.target.value)}>{CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}</Select></F>
          <F label="Concepto"><Input value={g.concepto} onChange={(e) => set('concepto', e.target.value)} /></F>
          <F label="Monto (USD)"><Input type="number" value={g.monto} onChange={(e) => set('monto', e.target.value)} /></F>
          <F label="Fecha"><DateField value={g.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
          <F label="Tipo"><Select value={g.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="variable">Variable</option><option value="fijo">Fijo / recurrente</option></Select></F>
          <F label="Almacén (o General)"><Select value={g.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">General</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Atribuir a driver (opcional)"><Select value={g.driverId} onChange={(e) => set('driverId', e.target.value)}><option value="">—</option>{personas.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
          <F label="Ruta (opcional)"><Select value={g.rutaId} onChange={(e) => set('rutaId', e.target.value)}><option value="">—</option>{rutasDrv.map((r) => <option key={r.id} value={r.id}>{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label} · {r.driverNombre}</option>)}</Select></F>
          <F label="Vehículo (opcional)"><Input value={g.vehiculo} onChange={(e) => set('vehiculo', e.target.value)} /></F>
          <F label="Responsable"><Input value={g.responsable} onChange={(e) => set('responsable', e.target.value)} /></F>
          <F label="Estado de pago"><Select value={g.estadoPago} onChange={(e) => set('estadoPago', e.target.value)}><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></Select></F>
          {g.estadoPago === 'pagado' && <F label="Fecha de pago"><DateField value={g.fechaPago} onChange={(e) => set('fechaPago', e.target.value)} /></F>}
        </Grid>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={g.mensual} onChange={(e) => set('mensual', e.target.checked)} className="accent-brand-gold" /> Es mensual (repartir entre semanas)</label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={g.esFinanciamiento} onChange={(e) => set('esFinanciamiento', e.target.checked)} className="accent-brand-gold" /> Es financiamiento (salida de caja, no gasto operativo)</label>
        </div>
        {g.mensual && (
          <div className="mt-2">
            <Grid><F label="Período desde"><DateField value={g.periodoDesde} onChange={(e) => set('periodoDesde', e.target.value)} /></F><F label="Período hasta"><DateField value={g.periodoHasta} onChange={(e) => set('periodoHasta', e.target.value)} /></F></Grid>
            {dist.length > 0 && <div className="mt-2 text-xs text-slate-500">Se reparte: {dist.map((d) => `${d.semana}: ${dinero(d.monto)}`).join(' · ')}</div>}
          </div>
        )}
      </Card>
      <div className="flex gap-2"><Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar gasto'}</Boton><Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>{gasto.id && <button className="ml-auto text-sm font-semibold text-rose-400 hover:text-rose-600" onClick={async () => { if (window.confirm('¿Borrar gasto?')) { await borrar(COL.gastos, gasto.id); onCerrar() } }}>Borrar</button>}</div>
      <p className="mt-2 text-[11px] text-slate-400">Atribuir un gasto a un driver es solo costo; NO se le descuenta (las deducciones van en la ruta). Lo mensual se reparte por semanas y no se cuenta doble con el total.</p>
    </div>
  )
}

// ── FINANCIERO + DASHBOARD ──────────────────────────────────────────────────
// ── REPORTES (descargas CSV / Excel) ─────────────────────────────────────────
function aCSV(rows) {
  if (!rows || !rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
}
function descargarArchivo(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob(['﻿' + contenido], { type: tipo || 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
async function descargarXLSX(nombre, rows) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  descargarArchivo(nombre, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

function TabReportes({ rutas, pagos, gastos, cobros, personas, almacenes, facturas, solicitudes, tarifas }) {
  const [tipo, setTipo] = useState('fastpay')
  const [modo, setModo] = useState('mes') // semana | mes | rango | todo
  const [fecha, setFecha] = useState(hoyISO())
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const [drvId, setDrvId] = useState('')
  const [generando, setGenerando] = useState(false)

  const desde = modo === 'semana' ? lunesDe(fecha) : modo === 'mes' ? primerDiaMes(mes) : modo === 'rango' ? (d1 <= d2 ? d1 : d2) : '0000-00-00'
  const hasta = modo === 'semana' ? domingoDe(fecha) : modo === 'mes' ? ultimoDiaMes(mes) : modo === 'rango' ? (d1 <= d2 ? d2 : d1) : '9999-99-99'
  const nombreDrv = (id) => { const p = personas.find((x) => x.id === id); return p ? nombreCompleto(p) : (id || '') }
  const nombreAlm = (id) => almacenes.find((a) => a.id === id)?.nombre || (id || '')
  const enRango = (f) => (f || '') >= desde && (f || '') <= hasta
  const okAlm = (aId) => !almId || aId === almId
  const okDrv = (dId) => !drvId || dId === drvId

  const REPORTES = {
    fastpay: {
      label: 'Fast Pay (adelantos por chofer)', periodico: true,
      filas: () => pagos.filter((p) => p.tipo === 'fastpay' && enRango(p.fecha) && okDrv(p.driverId) && okAlm(p.almacenId || ''))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((p) => ({ Fecha: p.fecha, Chofer: p.driverNombre || nombreDrv(p.driverId), Almacén: nombreAlm(p.almacenId || ''), Ruta: p.rutaId || '', Bruto: money2(p.bruto), 'Comisión %': p.comisionPct || '', Comisión: money2(p.comision), 'Efectivo entregado': money2(p.efectivo), Estado: ESTADO_FP_LABEL[estadoFP(p)] || '', Método: p.metodo || '', Referencia: p.referencia || '', Responsable: p.responsable || '', Comprobante: p.comprobante || '', Recuperación: p.recuperacion || '' })),
    },
    pagos: {
      label: 'Pagos normales a choferes', periodico: true,
      filas: () => pagos.filter((p) => p.tipo === 'pago' && enRango(p.fecha) && okDrv(p.driverId))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((p) => ({ Fecha: p.fecha, Chofer: p.driverNombre || nombreDrv(p.driverId), Semana: p.semana || '', Monto: money2(p.monto), Método: p.metodo || '', Referencia: p.referencia || '', Responsable: p.responsable || '' })),
    },
    rutas: {
      label: 'Historial de rutas', periodico: true,
      filas: () => rutas.filter((r) => enRango(r.fecha) && okAlm(r.almacenId) && okDrv(r.driverId))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((r) => ({ Fecha: r.fecha, Almacén: nombreAlm(r.almacenId), Chofer: r.driverNombre || nombreDrv(r.driverId), Turno: BLOQUES.find((b) => b.id === r.bloque)?.label || r.bloque, Identificador: r.identificador || '', Estado: r.estado, 'GO Home': r.goHome ? 'Sí' : '', OT: r.otUnidades || 0, 'Tarifa Walmart': money2(r.tarifaWalmart), 'Tarifa Driver': money2(r.tarifaDriver), 'Ingreso Walmart': money2(ingresoRuta(r)), 'Ganancia Driver': money2(gananciaDriver(r)) })),
    },
    gastos: {
      label: 'Gastos', periodico: true,
      filas: () => gastos.filter((g) => enRango(g.fecha) && okAlm(g.almacenId || ''))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((g) => ({ Fecha: g.fecha, Categoría: g.categoria || '', Almacén: nombreAlm(g.almacenId || ''), Chofer: g.driverId ? nombreDrv(g.driverId) : '', Monto: money2(g.monto), Descripción: g.descripcion || g.concepto || '', Responsable: g.responsable || '', 'Estado pago': g.estadoPago || '' })),
    },
    cobros: {
      label: 'Cobros de Walmart (ingresos)', periodico: true,
      filas: () => cobros.filter((c) => enRango(c.fecha) && okAlm(c.almacenId || ''))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((c) => ({ Fecha: c.fecha, Almacén: nombreAlm(c.almacenId || ''), Monto: money2(c.monto), Referencia: c.referencia || '', Responsable: c.responsable || '' })),
    },
    solicitudes: {
      label: 'Solicitudes de Fast Pay', periodico: true,
      filas: () => (solicitudes || []).filter((s) => enRango(s.fecha) && okDrv(s.driverId))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((s) => ({ Fecha: s.fecha, Chofer: s.driverNombre || nombreDrv(s.driverId), Ruta: s.rutaId || '', Bruto: money2(s.bruto), Estado: s.estado, Nota: s.nota || '' })),
    },
    financiero: {
      label: 'Financiero por semana', periodico: true,
      filas: () => { const out = []; let w = lunesDe(desde); const fin = lunesDe(hasta); let g = 0; while (w <= fin && g < 200) { const f = financieroSemana(rutas, pagos, gastos, cobros, w, almId); out.push({ Semana: w, 'Ingreso Walmart': f.ingresoRutas, 'Costo drivers': f.costoDrivers, Margen: f.margen, 'Gastos operativos': f.gastosOper, 'Comisiones FP': f.comisionesFP, 'Resultado operativo': f.resultadoOperativo, Cobrado: f.cobrado, 'Por cobrar': f.porCobrar, 'Flujo de caja': f.flujoCaja, Rutas: f.nRutas }); const dd = new Date(`${w}T00:00:00`); dd.setDate(dd.getDate() + 7); w = dd.toISOString().slice(0, 10); g++ } return out },
    },
    drivers: {
      label: 'Lista de drivers', periodico: false,
      filas: () => personas.filter((p) => okAlm(p.almacenId) || p.almacen === 'ambos').map((p) => ({ Nombre: nombreCompleto(p), Teléfono: p.telefono || '', Correo: p.correo || '', Ciudad: p.ciudad || '', Estado: p.estado || '', Almacén: p.almacenId === 'ambos' ? 'Ambos' : nombreAlm(p.almacenId), Vehículo: [p.marca, p.modelo, p.anio].filter(Boolean).join(' ') || p.tipoVehiculo || '', Propietario: p.propietarioVehiculo || '', 'Pago por ruta': p.rateDriver || '', 'Estado operativo': p.estadoOperativo || '' })),
    },
    drivers_full: {
      label: 'Info completa de drivers (todos)', periodico: false,
      filas: () => personas.slice().sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b))).map((p) => ({
        Nombre: p.nombre || '', Apellido: p.apellido || '', 'Nombre completo': nombreCompleto(p),
        Teléfono: p.telefono || '', Correo: p.correo || '', Dirección: p.direccion || '', Ciudad: p.ciudad || '', Estado: p.estado || '',
        'Fecha registro': p.fechaRegistro || '', 'Tiene SSN': p.tieneSSN || '', 'Tiene licencia': p.tieneLicencia || '',
        Disponibilidad: p.disponibilidad || '', 'Días disponibles': Array.isArray(p.diasDisponibles) ? p.diasDisponibles.join(' ') : '',
        'Tipo de vehículo': p.tipoVehiculo || '', Marca: p.marca || '', Modelo: p.modelo || '', Año: p.anio || '',
        'Propietario del vehículo': p.propietarioVehiculo || '', 'Pago por ruta': p.rateDriver || '',
        Almacén: p.almacenId === 'ambos' ? 'Ambos' : nombreAlm(p.almacenId), 'Estado operativo': p.estadoOperativo || '', Notas: p.notas || '',
      })),
    },
    facturas: {
      label: 'Facturas a Walmart', periodico: false,
      filas: () => (facturas || []).sort((a, b) => String(b.desde).localeCompare(String(a.desde))).map((f) => ({ Número: f.numero || f.id, Desde: f.desde, Hasta: f.hasta, Total: money2(f.total), Estado: f.estado || '', Emitida: f.fecha || '' })),
    },
  }

  const def = REPORTES[tipo]
  const filas = useMemo(() => { try { return def.filas() } catch { return [] } }, [tipo, pagos, rutas, gastos, cobros, personas, solicitudes, facturas, desde, hasta, almId, drvId]) // eslint-disable-line
  const total = filas.reduce((a, r) => a + (Number(r.Bruto || r.Monto || r.Total || r['Ingreso Walmart'] || 0) || 0), 0)
  const periodoTxt = def.periodico ? (modo === 'todo' ? 'todo el historial' : `${desde} → ${hasta}`) : 'todos'
  const nombreBase = `walmart_${tipo}_${def.periodico && modo !== 'todo' ? `${desde}_${hasta}` : 'todo'}`

  const bajar = async (fmt) => {
    if (!filas.length) { walToast('No hay datos para ese reporte/filtro.', 'red'); return }
    setGenerando(true)
    try {
      if (fmt === 'xlsx') await descargarXLSX(`${nombreBase}.xlsx`, filas)
      else descargarArchivo(`${nombreBase}.csv`, aCSV(filas))
      await auditar('reporte_descargado', `${tipo} · ${periodoTxt} · ${filas.length} filas · ${fmt}`)
      walToast(`Reporte descargado (${filas.length} filas) ✓`, 'gold')
    } catch (e) { walToast('No se pudo generar: ' + (e?.message || e), 'red') } finally { setGenerando(false) }
  }

  const cols = filas.length ? Object.keys(filas[0]) : []
  return (
    <div>
      <PageTitle>Reportes y descargas</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Reporte"><Select value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(REPORTES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></F>
          {def.periodico && (
            <>
              <F label="Período"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="semana">Semana</option><option value="mes">Mes</option><option value="rango">Rango</option><option value="todo">Todo</option></Select></F>
              {modo === 'semana' && <F label="Semana"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>}
              {modo === 'mes' && <F label="Mes"><Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></F>}
              {modo === 'rango' && <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
            </>
          )}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          {tipo !== 'financiero' && tipo !== 'cobros' && tipo !== 'facturas' && <F label="Chofer"><Select value={drvId} onChange={(e) => setDrvId(e.target.value)}><option value="">Todos</option>{personas.slice().sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b))).map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>}
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-500"><b className="text-brand-navy dark:text-slate-100">{filas.length}</b> filas · {periodoTxt}{total > 0 ? <> · total <b className="text-brand-navy dark:text-slate-100">{dinero(total)}</b></> : ''}</span>
        <div className="ml-auto flex gap-2">
          <Boton variant="gold" disabled={generando || !filas.length} onClick={() => bajar('xlsx')}><Download size={14} /> Excel</Boton>
          <Boton variant="ghost" disabled={generando || !filas.length} onClick={() => bajar('csv')}><Download size={14} /> CSV</Boton>
        </div>
      </div>

      <Card className="p-0">
        {!filas.length && <div className="px-4 py-8 text-center text-sm text-slate-400">No hay datos para este reporte con los filtros elegidos.</div>}
        {!!filas.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-100 dark:border-slate-800">{cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-bold uppercase tracking-wide text-slate-400">{c}</th>)}</tr></thead>
              <tbody>
                {filas.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">{cols.map((c) => <td key={c} className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-300">{String(r[c] == null ? '' : r[c])}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {filas.length > 50 && <div className="px-3 py-2 text-[11px] text-slate-400">Vista previa de 50 de {filas.length} filas. La descarga incluye todas.</div>}
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11px] text-slate-400">Elige el reporte, el período y los filtros, y descarga en <b>Excel</b> o <b>CSV</b>. Incluye: Fast Pay por chofer, pagos, historial de rutas, gastos, cobros, solicitudes, financiero por semana, lista de drivers y facturas.</p>
    </div>
  )
}

function TabFinanciero({ rutas, pagos, gastos, cobros, personas, almacenes, facturas, perm }) {
  // Permiso por indicador: el dashboard no habilita automáticamente todos los datos.
  const vIng = !perm || perm.owner || perm.permisos?.fin_ingresos_ver
  const vCos = !perm || perm.owner || perm.permisos?.fin_costos_ver
  const vOper = !perm || perm.owner || perm.permisos?.fin_utilidad_oper_ver
  const vFin = !perm || perm.owner || perm.permisos?.fin_utilidad_fin_ver
  const [modo, setModo] = useState('semana') // semana | mes | rango | factura
  const [fecha, setFecha] = useState(hoyISO())
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(hoyISO())
  const [facturaId, setFacturaId] = useState('')
  const [almId, setAlmId] = useState('')
  const [cobroOpen, setCobroOpen] = useState(false)
  const semana = lunesDe(fecha)
  const facturaSel = facturas.find((f) => f.id === facturaId)

  // Período efectivo según el modo.
  let desde, hasta, etiqueta, esSemana = false
  if (modo === 'semana') { desde = semana; hasta = domingoDe(fecha); etiqueta = `Semana ${semana} → ${hasta}`; esSemana = true }
  else if (modo === 'mes') { desde = primerDiaMes(mes); hasta = ultimoDiaMes(mes); etiqueta = nombreMes(mes) }
  else if (modo === 'factura') { if (facturaSel) { desde = facturaSel.desde; hasta = facturaSel.hasta; etiqueta = `Factura ${facturaSel.numero}` } else { desde = primerDiaMes(mes); hasta = ultimoDiaMes(mes); etiqueta = 'Elige una factura' } }
  else { desde = d1 <= d2 ? d1 : d2; hasta = d1 <= d2 ? d2 : d1; etiqueta = `${desde} → ${hasta}` }

  const fin = useMemo(() => (esSemana ? financieroSemana(rutas, pagos, gastos, cobros, semana, almId) : financieroRango(rutas, pagos, gastos, cobros, desde, hasta, almId)), [rutas, pagos, gastos, cobros, semana, desde, hasta, almId, esSemana])
  const nAct = personas.filter((p) => p.estadoOperativo === 'activo').length
  const nStandby = personas.filter((p) => p.estadoOperativo === 'standby').length
  const nCand = personas.filter((p) => p.estadoOperativo === 'candidato').length
  const enPeriodo = (r) => (esSemana ? lunesDe(r.fecha) === semana : (r.fecha >= desde && r.fecha <= hasta))
  const rsPer = rutas.filter((r) => enPeriodo(r) && (!almId || r.almacenId === almId))
  const rCompl = rsPer.filter((r) => r.estado === 'completada').length
  const rCan = rsPer.filter((r) => r.estado === 'cancelada').length
  const rsGoHome = rsPer.filter((r) => r.goHome && r.estado === 'completada')
  const goHomeIngreso = money2(rsGoHome.reduce((a, r) => a + ingresoRuta(r), 0))
  const cobrosPer = cobros.filter((c) => (esSemana ? c.semana === semana : (c.fecha >= desde && c.fecha <= hasta)) && (!almId || c.almacenId === almId)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  // Período anterior (mismo tamaño, justo antes) para la comparativa.
  const prevHasta = sumarDias(desde, -1)
  const lenDias = Math.max(0, Math.round((new Date(`${hasta}T00:00:00`) - new Date(`${desde}T00:00:00`)) / 86400000))
  const prevDesde = sumarDias(prevHasta, -lenDias)
  const finPrev = useMemo(() => financieroRango(rutas, pagos, gastos, cobros, prevDesde, prevHasta, almId), [rutas, pagos, gastos, cobros, prevDesde, prevHasta, almId])
  // Utilidad por financiamiento (Fast Pay): concepto independiente; solo confirmados.
  const uf = useMemo(() => utilidadFinanciamiento(pagos, rutas, desde, hasta, { almacenId: almId }), [pagos, rutas, desde, hasta, almId])
  const tr = (cur, prev) => (prev && isFinite(prev) && prev !== 0 ? (cur - prev) / Math.abs(prev) : null)
  const comparativa = [
    { label: 'Ingreso', actual: fin.ingresoRutas, anterior: finPrev.ingresoRutas },
    { label: 'Costo drivers', actual: fin.costoDrivers, anterior: finPrev.costoDrivers },
    { label: 'Margen', actual: fin.margen, anterior: finPrev.margen },
    { label: 'Resultado', actual: fin.resultadoOperativo, anterior: finPrev.resultadoOperativo },
    { label: 'Flujo', actual: fin.flujoCaja, anterior: finPrev.flujoCaja },
  ]

  return (
    <div>
      <PageTitle>Financiero</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Ver por"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="semana">Semana</option><option value="mes">Mes</option><option value="rango">Rango de fechas</option><option value="factura">Factura</option></Select></F>
          {modo === 'semana' && <F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>}
          {modo === 'mes' && <F label="Mes"><Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></F>}
          {modo === 'rango' && <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          {modo === 'factura' && <F label="Factura"><Select value={facturaId} onChange={(e) => setFacturaId(e.target.value)}><option value="">Elegir…</option>{facturas.map((f) => <option key={f.id} value={f.id}>{f.numero} · {dinero(f.total)}</option>)}</Select></F>}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <span className="pb-1.5 text-xs font-semibold text-slate-400">{etiqueta}</span>
        </div>
      </Card>

      {/* KPIs financieros con comparativa vs período anterior */}
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Indicadores <span className="font-normal normal-case">· comparado con {prevDesde} → {prevHasta}</span></div>
      <div className="mb-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {vIng && <KPI animado label="Ingreso Walmart" value={dinero(fin.ingresoRutas)} icon={DollarSign} accent="navy" trend={tr(fin.ingresoRutas, finPrev.ingresoRutas)} sub={`ant. ${dinero(finPrev.ingresoRutas)}`} />}
        {vCos && <KPI animado label="Costo drivers" value={dinero(fin.costoDrivers)} icon={Wallet} accent="blue" sub="antes de Fast Pay" />}
        {vOper && <KPI animado label="Resultado operativo" value={dinero(fin.resultadoOperativo)} icon={TrendingUp} accent={fin.resultadoOperativo >= 0 ? 'green' : 'red'} trend={tr(fin.resultadoOperativo, finPrev.resultadoOperativo)} sub={`ant. ${dinero(finPrev.resultadoOperativo)}`} />}
        {vFin && <KPI animado label="Comisiones Fast Pay" value={dinero(fin.comisionesFP)} icon={Zap} accent="gold" trend={tr(fin.comisionesFP, finPrev.comisionesFP)} sub="ingreso compañía" />}
        {vIng && <KPI animado label="Por cobrar" value={dinero(fin.porCobrar)} icon={Clock} accent={fin.porCobrar > 0 ? 'gold' : 'green'} sub="devengado − cobrado" />}
        {vOper && <KPI animado label="Flujo de caja" value={dinero(fin.flujoCaja)} icon={BarChart3} accent="navy" trend={tr(fin.flujoCaja, finPrev.flujoCaja)} sub="gastos + bonos" />}
      </div>

      {/* comparativa actual vs anterior */}
      {vOper && (
      <Card className="mb-4 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Este período vs. el anterior</div>
        <Suspense fallback={<div className="grid h-[230px] place-items-center"><Spinner /></div>}>
          <ChartComparativa data={comparativa} />
        </Suspense>
      </Card>
      )}

      {/* conteos operativos */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile n={nAct} l="Drivers activos" />
        <Tile n={nStandby} l="Stand-by" />
        <Tile n={nCand} l="Candidatos" />
        <Tile n={rCompl} l="Rutas completadas" verde />
        <Tile n={rCan} l="Rutas canceladas" />
        <Tile n={rsGoHome.length} l={`GO Home · ${dinero(goHomeIngreso)}`} />
      </div>

      {/* resultado operativo */}
      {vOper && (
      <Card className="mb-3 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Resultado operativo · {etiqueta}</div>
        <FilaFin l="Ingreso de rutas (con ajustes Walmart)" v={fin.ingresoRutas} />
        <FilaFin l="Costo de drivers (ganancia antes de Fast Pay)" v={-fin.costoDrivers} />
        <FilaFin l="Margen antes de gastos" v={fin.margen} fuerte />
        <FilaFin l="Gastos operativos asignados" v={-fin.gastosOper} />
        <FilaFin l="Comisiones de Fast Pay (ingreso aparte)" v={fin.comisionesFP} verde />
        <FilaFin l="Resultado operativo" v={fin.resultadoOperativo} fuerte borde />
        {fin.gastoFinanc > 0 && <p className="mt-2 text-[11px] text-slate-400">+ {dinero(fin.gastoFinanc)} de financiamiento (Cargo Vans): es salida de caja, no entra al resultado operativo.</p>}
      </Card>
      )}

      {/* utilidad por financiamiento (Fast Pay) — concepto independiente */}
      {vFin && (
      <Card className="mb-3 p-4">
        <div className="mb-2 flex items-center gap-2"><Zap size={15} className="text-brand-gold" /><span className="text-sm font-bold text-brand-navy dark:text-slate-100">Utilidad por financiamiento · Fast Pay</span><Badge color="gold">solo confirmados</Badge></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile txt={dinero(uf.comision)} l="Utilidad (comisiones)" verde />
          <Tile txt={dinero(uf.bruto)} l="Bruto financiado" />
          <Tile txt={dinero(uf.desembolsado)} l="Neto desembolsado" />
          <Tile txt={`${uf.nPagos} · ${uf.nRutas} rutas`} l="Pagos confirmados" />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Es la ganancia del servicio Fast Pay, <b>independiente</b> del resultado operativo. Solo cuenta pagos <b>confirmados</b>; los anulados y fallidos no suman. {almId ? 'Filtrado por el almacén elegido.' : 'Todos los almacenes.'}</p>
      </Card>
      )}

      {/* flujo de caja */}
      {vIng && (
      <Card className="mb-3 p-4">
        <div className="mb-2 flex items-center gap-2"><span className="text-sm font-bold text-brand-navy dark:text-slate-100">Flujo de caja y cobros</span><Boton variant="ghost" className="ml-auto" onClick={() => setCobroOpen(true)}><Plus size={13} /> Registrar cobro de Walmart</Boton></div>
        <FilaFin l="Cobrado de Walmart" v={fin.cobrado} verde />
        <FilaFin l="Por cobrar (devengado − cobrado)" v={fin.porCobrar} />
        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
        <FilaFin l="Gastos del período" v={fin.gastosOper + fin.gastoFinanc} />
        <FilaFin l="Bonos agregados (driver / ruta)" v={fin.bonosTotal} />
        <FilaFin l="Flujo de caja (solo gastos + bonos)" v={fin.flujoCaja} fuerte borde />
        {cobrosPer.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Cobros del período</div>
            {cobrosPer.map((c) => <div key={c.id} className="flex flex-wrap gap-2 text-xs text-slate-500"><span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{dinero(c.monto)}</span><span>{c.fecha}</span>{c.referencia && <span>· {c.referencia}</span>}{c.responsable && <span>· {c.responsable}</span>}</div>)}
          </div>
        )}
      </Card>
      )}
      <p className="text-xs text-slate-400">Para <b>facturar a Walmart</b> por mes, usa la pestaña <b>Facturas</b>. Fast Pay: la ganancia del driver va completa como costo y la comisión como ingreso aparte — nunca se descuenta dos veces.</p>

      {cobroOpen && <CobroModal semana={semana} almacenes={almacenes} almId={almId} onCerrar={() => setCobroOpen(false)} />}
    </div>
  )
}
function FilaFin({ l, v, fuerte, verde, borde }) {
  const neg = v < 0
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${borde ? 'mt-1 border-t border-slate-200 pt-2 dark:border-slate-700' : ''}`}>
      <span className={fuerte ? 'font-bold text-brand-navy dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}>{l}</span>
      <span className={`font-mono ${fuerte ? 'font-extrabold' : 'font-semibold'} ${verde ? 'text-emerald-600' : neg ? 'text-rose-500' : 'text-brand-navy dark:text-slate-100'}`}>{neg ? '−' : ''}{dinero(Math.abs(v))}</span>
    </div>
  )
}
function CobroModal({ semana, almacenes, almId, onCerrar }) {
  const [c, setC] = useState({ fecha: hoyISO(), monto: '', almacenId: almId || '', referencia: '', responsable: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))
  const salvar = async () => {
    if (!c.monto) { window.alert('Pon el monto.'); return }
    setGuardando(true)
    try {
      await guardar(COL.cobros, null, { ...c, monto: money2(c.monto), semana: lunesDe(c.fecha) })
      await auditar('cobro_walmart', `${money2(c.monto)} · ${c.fecha}`)
      walToast('Cobro registrado ✓', 'gold')
      onCerrar()
    } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Registrar cobro de Walmart" onCerrar={onCerrar}>
      <Grid>
        <F label="Fecha"><DateField value={c.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
        <F label="Monto (USD)"><Input type="number" value={c.monto} onChange={(e) => set('monto', e.target.value)} /></F>
        <F label="Almacén"><Select value={c.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">General</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
        <F label="Referencia"><Input value={c.referencia} onChange={(e) => set('referencia', e.target.value)} /></F>
        <F label="Responsable"><Input value={c.responsable} onChange={(e) => set('responsable', e.target.value)} /></F>
      </Grid>
      <p className="mt-2 text-xs text-slate-400">La semana se toma de la fecha del cobro. Vincula el cobro a la semana para el flujo de caja y lo por cobrar.</p>
      <div className="mt-3 flex gap-2"><Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Registrar cobro'}</Boton><Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton></div>
    </Modal>
  )
}

// Pay stub (comprobante de liquidación) en PDF, basado en la semana del driver.
async function pdfPayStub(driver, semana, hasta, res) {
  const jsPDF = await cargarJsPDF()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 56; let y = 70
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(201, 162, 75); doc.text('B&A AMERICAN GROUP LLC · WALMART', M, y); y += 20
  doc.setTextColor(19, 35, 63); doc.setFontSize(15); doc.text('Comprobante de liquidación (pay stub)', M, y); y += 24
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 54, 80)
  doc.text(`Driver: ${nombreCompleto(driver)}`, M, y); y += 16
  doc.text(`Semana: ${semana} a ${hasta}`, M, y); y += 22
  const fila = (l, v) => { doc.text(l, M, y); doc.text(v, 440, y, { align: 'right' }); y += 17 }
  fila('Rutas completadas', String(res.rutasSemana.length))
  fila('Total ganado (antes de Fast Pay)', dinero(res.totalGanado))
  fila('Bruto liquidado por Fast Pay', dinero(res.liquidadoFP))
  fila('Comisiones Fast Pay retenidas', dinero(res.comisiones))
  fila('Efectivo entregado (Fast Pay)', dinero(res.efectivoFP))
  fila('Otros pagos', dinero(res.pagadoNormal))
  y += 4; doc.setDrawColor(220, 220, 220); doc.line(M, y, 480, y); y += 16
  doc.setFont('helvetica', 'bold'); fila('Saldo pendiente', dinero(res.saldo)); doc.setFont('helvetica', 'normal')
  y += 18; doc.setTextColor(120, 130, 150); doc.setFontSize(9)
  doc.text(`Estado: ${res.estado} · generado ${new Date().toLocaleString()}`, M, y)
  doc.save(`paystub_${nombreCompleto(driver).replace(/\s+/g, '_')}_${semana}.pdf`)
}

// Recibo individual de un adelanto Fast Pay (una ruta / un pago).
async function pdfReciboFP(pago, driver) {
  const jsPDF = await cargarJsPDF()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 56; let y = 70
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(201, 162, 75); doc.text('B&A AMERICAN GROUP LLC · WALMART', M, y); y += 20
  doc.setTextColor(19, 35, 63); doc.setFontSize(15); doc.text('Recibo de Fast Pay (adelanto)', M, y); y += 24
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 54, 80)
  if (driver) { doc.text(`Driver: ${nombreCompleto(driver)}`, M, y); y += 16 }
  doc.text(`Fecha del adelanto: ${pago.fecha || '—'}`, M, y); y += 16
  if (pago.rutaId) { doc.text(`Ruta: ${pago.rutaId}`, M, y); y += 16 }
  const est = estadoFP(pago)
  doc.text(`Estado: ${ESTADO_FP_LABEL[est] || est}`, M, y); y += 22
  const fila = (l, v) => { doc.text(l, M, y); doc.text(v, 440, y, { align: 'right' }); y += 17 }
  fila('Bruto de la ruta', dinero(pago.bruto))
  fila(`Comisión Fast Pay${pago.comisionPct != null ? ` (${pago.comisionPct}%)` : ''}`, `− ${dinero(pago.comision)}`)
  y += 4; doc.setDrawColor(220, 220, 220); doc.line(M, y, 480, y); y += 16
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); fila('Efectivo entregado', dinero(pago.efectivo)); doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  y += 20; doc.setTextColor(120, 130, 150); doc.setFontSize(9)
  doc.text(`Método: ${pago.metodo || 'Efectivo'} · generado ${new Date().toLocaleString()}`, M, y)
  doc.save(`fastpay_${(driver ? nombreCompleto(driver) : 'driver').replace(/\s+/g, '_')}_${pago.fecha || ''}.pdf`)
}

// ── FACTURAS (cobro a Walmart) ───────────────────────────────────────────────
function TabFacturas({ rutas, almacenes, facturas }) {
  const [modo, setModo] = useState('semana') // semana | mes | rango
  const [fecha, setFecha] = useState(hoyISO())
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [d1, setD1] = useState(primerDiaMes(mesDe(hoyISO())))
  const [d2, setD2] = useState(ultimoDiaMes(mesDe(hoyISO())))
  const [almId, setAlmId] = useState('')
  const [generando, setGenerando] = useState(false)

  const desde = modo === 'semana' ? lunesDe(fecha) : modo === 'mes' ? primerDiaMes(mes) : (d1 <= d2 ? d1 : d2)
  const hasta = modo === 'semana' ? domingoDe(fecha) : modo === 'mes' ? ultimoDiaMes(mes) : (d1 <= d2 ? d2 : d1)
  const periodo = modo === 'semana' ? desde : modo === 'mes' ? mes : `${desde}_${hasta}`
  const prev = useMemo(() => facturaDelPeriodo(rutas, desde, hasta, almId, almacenes), [rutas, desde, hasta, almId, almacenes])
  const venceEl = sumarDias(hasta, 30)
  const almNombre = almId ? (almacenes.find((a) => a.id === almId)?.nombre || '') : 'Todos los almacenes'

  const generar = async () => {
    if (prev.total <= 0) { window.alert('No hay rutas completadas en ese período para facturar.'); return }
    setGenerando(true)
    try {
      const numero = idFactura(modo === 'mes' ? mes : mesDe(desde))
      const data = { numero, periodo, modo, mes: modo === 'mes' ? mes : '', desde, hasta, almacenId: almId, almacenNombre: almNombre, lineas: prev.lineas, totalRutas: prev.totalRutas, total: prev.total, emitidaEn: hoyISO(), venceEl, estado: 'emitida', empresa: 'B&A American Group LLC' }
      const id = await guardar(COL.facturas, null, data)
      await auditar('factura_generada', `${numero} · ${dinero(prev.total)} · ${periodo}`)
      walToast('Factura generada ✓', 'gold'); confeti()
      pdfFactura({ ...data, id })
    } finally { setGenerando(false) }
  }
  const marcar = async (f, estado) => { await guardar(COL.facturas, f.id, { estado }); walToast(estado === 'cobrada' ? 'Factura cobrada ✓' : 'Factura reabierta') }
  const borrarF = async (f) => { if (window.confirm(`¿Borrar la factura ${f.numero}?`)) { await borrar(COL.facturas, f.id); walToast('Factura borrada') } }
  const lista = [...facturas].sort((a, b) => String(b.emitidaEn || '').localeCompare(String(a.emitidaEn || '')))

  return (
    <div>
      <PageTitle>Facturas a Walmart</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <F label="Período"><Select value={modo} onChange={(e) => setModo(e.target.value)}><option value="semana">Semana (Sáb–Vie)</option><option value="mes">Mes</option><option value="rango">Rango</option></Select></F>
          {modo === 'semana' && <F label="Semana (cualquier día)"><DateField value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>}
          {modo === 'mes' && <F label="Mes"><Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></F>}
          {modo === 'rango' && <><F label="Desde"><DateField value={d1} onChange={(e) => setD1(e.target.value)} /></F><F label="Hasta"><DateField value={d2} onChange={(e) => setD2(e.target.value)} /></F></>}
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <span className="pb-1.5 text-xs font-semibold text-slate-400">{modo === 'semana' ? `Sáb ${desde} → Vie ${hasta}` : `${desde} → ${hasta}`}</span>
        </div>
      </Card>

      {/* Vista previa de la factura */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Vista previa</span>
          <span className="text-xs text-slate-400">{desde} → {hasta} · vence {venceEl} (net 30)</span>
          <Boton variant="gold" className="ml-auto" disabled={generando || prev.total <= 0} onClick={generar}>{generando ? <Spinner /> : <><FileSpreadsheet size={15} /> Generar factura</>}</Boton>
        </div>
        {prev.lineas.length === 0
          ? <Vacio icono={FileSpreadsheet}>No hay rutas completadas en este período. Cierra días con rutas completadas para poder facturar.</Vacio>
          : (
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="py-1 text-left font-bold">Almacén</th><th className="text-right font-bold">Rutas</th><th className="text-right font-bold">Tarifa prom.</th><th className="text-right font-bold">Importe</th></tr></thead>
              <tbody>{prev.lineas.map((l) => <tr key={l.almacenId} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5 text-brand-navy dark:text-slate-100">{l.nombre}</td><td className="text-right font-mono">{l.rutas}</td><td className="text-right font-mono text-slate-500">{dinero(l.tarifaProm)}</td><td className="text-right font-mono font-semibold">{dinero(l.importe)}</td></tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-slate-200 dark:border-slate-700"><td className="py-2 font-bold text-brand-navy dark:text-slate-100">Total a cobrar</td><td className="text-right font-mono font-bold">{prev.totalRutas}</td><td /><td className="text-right font-mono text-base font-extrabold text-brand-navy dark:text-slate-100">{dinero(prev.total)}</td></tr></tfoot>
            </table>
          )}
      </Card>

      <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Facturas emitidas</div>
      {lista.length === 0 && <Vacio icono={FileSpreadsheet}>Aún no has generado facturas. Elige un mes arriba y pulsa “Generar factura”.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((f) => {
          const vencida = f.estado !== 'cobrada' && String(f.venceEl) < hoyISO()
          return (
            <Card key={f.id} className={FILA}>
              <FileSpreadsheet size={16} className="text-brand-gold" />
              <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{f.numero}</span>
              <Badge color="slate">{f.mes ? nombreMes(f.mes) : `${f.desde} → ${f.hasta}`}</Badge>
              <span className="text-xs text-slate-400">{f.almacenNombre}</span>
              <span className="font-mono font-semibold">{dinero(f.total)}</span>
              <Badge color={f.estado === 'cobrada' ? 'green' : vencida ? 'red' : 'gold'}>{f.estado === 'cobrada' ? 'Cobrada' : vencida ? 'Vencida' : 'Emitida'}</Badge>
              <span className="text-xs text-slate-400">vence {f.venceEl}</span>
              <div className="ml-auto flex gap-3 text-xs">
                <button className="font-semibold text-brand-gold hover:underline" onClick={() => pdfFactura(f)}>PDF</button>
                {f.estado !== 'cobrada'
                  ? <button className="font-semibold text-emerald-600 hover:underline" onClick={() => marcar(f, 'cobrada')}>marcar cobrada</button>
                  : <button className="font-semibold text-slate-400 hover:text-brand-navy" onClick={() => marcar(f, 'emitida')}>reabrir</button>}
                <button className="font-semibold text-rose-400 hover:text-rose-600" onClick={() => borrarF(f)}>borrar</button>
              </div>
            </Card>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">La factura suma las rutas <b>completadas</b> del período × tarifa de Walmart de cada ruta. Vence a 30 días (net 30). Para el flujo de caja, registra el cobro real en <b>Financiero → Registrar cobro de Walmart</b>.</p>
    </div>
  )
}

async function pdfFactura(f) {
  const jsPDF = await cargarJsPDF()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 56, W = doc.internal.pageSize.getWidth()
  let y = 64
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(201, 162, 75); doc.text('B&A AMERICAN GROUP LLC', M, y)
  doc.setTextColor(19, 35, 63); doc.setFontSize(22); doc.text('FACTURA', W - M, y, { align: 'right' }); y += 18
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120, 130, 150)
  doc.text('Operación Walmart · last-mile', M, y); doc.text(String(f.numero), W - M, y, { align: 'right' }); y += 30
  doc.setTextColor(40, 54, 80); doc.setFontSize(11)
  doc.text('Facturar a:  Walmart', M, y)
  doc.text(`Emitida: ${f.emitidaEn}`, W - M, y, { align: 'right' }); y += 16
  doc.text(`Período: ${f.mes ? nombreMes(f.mes) : `${f.desde} a ${f.hasta}`}`, M, y)
  doc.text(`Vence (net 30): ${f.venceEl}`, W - M, y, { align: 'right' }); y += 16
  doc.text(`Almacén: ${f.almacenNombre || 'Todos'}`, M, y); y += 24
  doc.setFillColor(19, 35, 63); doc.rect(M, y - 13, W - 2 * M, 22, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Almacén', M + 10, y + 2); doc.text('Rutas', W - M - 210, y + 2, { align: 'right' }); doc.text('Tarifa prom.', W - M - 110, y + 2, { align: 'right' }); doc.text('Importe', W - M - 10, y + 2, { align: 'right' }); y += 26
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 54, 80); doc.setFontSize(11)
  for (const l of (f.lineas || [])) {
    if (y > 700) { doc.addPage(); y = 64 }
    doc.text(String(l.nombre), M + 10, y); doc.text(String(l.rutas), W - M - 210, y, { align: 'right' }); doc.text(dinero(l.tarifaProm), W - M - 110, y, { align: 'right' }); doc.text(dinero(l.importe), W - M - 10, y, { align: 'right' }); y += 19
  }
  y += 6; doc.setDrawColor(200, 200, 200); doc.line(M, y, W - M, y); y += 22
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(19, 35, 63)
  doc.text('TOTAL A COBRAR', M + 10, y); doc.text(dinero(f.total), W - M - 10, y, { align: 'right' }); y += 26
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 130, 150)
  doc.text(`${f.totalRutas} rutas completadas · condiciones de pago: net 30 (vence ${f.venceEl}).`, M, y)
  doc.save(`${String(f.numero || 'factura')}.pdf`)
}

// ── CONTRATOS ───────────────────────────────────────────────────────────────
async function pdfContrato(c, firmado) {
  const jsPDF = await cargarJsPDF()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const M = 56, W = doc.internal.pageSize.getWidth() - M * 2
  let y = 70
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(201, 162, 75); doc.text(String(c.empresa || '').toUpperCase(), M, y); y += 22
  doc.setTextColor(19, 35, 63); doc.setFontSize(16); doc.text(c.titulo || 'Contrato', M, y); y += 26
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 54, 80)
  for (const ln of doc.splitTextToSize(c.textoRenderizado || '', W)) { if (y > 720) { doc.addPage(); y = 70 } doc.text(ln, M, y); y += 16 }
  y += 24
  if (firmado && c.firma) {
    if (y > 620) { doc.addPage(); y = 70 }
    doc.setFontSize(10); doc.setTextColor(120, 130, 150); doc.text('Firma:', M, y); y += 6
    try { doc.addImage(c.firma, 'PNG', M, y, 180, 70) } catch { /* noop */ }
    y += 82; doc.setTextColor(40, 54, 80); doc.text(`Firmado por: ${c.firmanteNombre || c.driverNombre || ''}`, M, y); y += 14
    doc.setTextColor(120, 130, 150); doc.text('Firmado electrónicamente vía enlace seguro.', M, y)
  }
  doc.save(`${String(c.titulo || 'contrato').replace(/\s+/g, '_')}${firmado ? '_firmado' : ''}.pdf`)
}

function TabContratos({ contratos, plantillas, personas, almacenes, tarifas }) {
  const [vista, setVista] = useState('lista')
  const nav = [{ id: 'lista', l: 'Contratos' }, { id: 'generar', l: 'Generar' }, { id: 'plantillas', l: 'Plantillas' }]
  return (
    <div>
      <PageTitle>Contratos</PageTitle>
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
        {nav.map((n) => <button key={n.id} onClick={() => setVista(n.id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${vista === n.id ? 'bg-brand-navy text-white' : 'text-slate-500 hover:text-brand-navy'}`}>{n.l}</button>)}
      </div>
      {vista === 'lista' && <VistaContratos contratos={contratos} personas={personas} almacenes={almacenes} />}
      {vista === 'generar' && <VistaGenerar plantillas={plantillas} personas={personas} almacenes={almacenes} tarifas={tarifas} onIrLista={() => setVista('lista')} onIrPlantillas={() => setVista('plantillas')} />}
      {vista === 'plantillas' && <VistaPlantillas plantillas={plantillas} />}
    </div>
  )
}

function VistaContratos({ contratos, personas, almacenes }) {
  const [fEstado, setFEstado] = useState(''); const [fDriver, setFDriver] = useState(''); const [ver, setVer] = useState(null)
  const estadoVista = (c) => (c.estado !== 'firmado' && c.estado !== 'anulado' && c.vence && new Date(c.vence) < new Date()) ? 'vencido' : c.estado
  const lista = contratos.filter((c) => (!fEstado || estadoVista(c) === fEstado) && (!fDriver || c.driverId === fDriver)).sort((a, b) => String(b.creadoEn?.seconds || 0) - String(a.creadoEn?.seconds || 0))
  const copiar = (c) => { navigator.clipboard?.writeText(`${window.location.origin}/wfirma?t=${c.signingToken}`); window.alert('Enlace copiado.') }
  const anular = async (c) => { if (window.confirm('¿Anular este contrato?')) { await guardar(COL.contratos, c.id, { estado: 'anulado' }); await auditar('contrato_anulado', c.id) } }
  return (
    <div>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Estado"><Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="">Todos</option>{ESTADOS_CONTRATO.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></F>
          <F label="Driver"><Select value={fDriver} onChange={(e) => setFDriver(e.target.value)}><option value="">Todos</option>{personas.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
        </div>
      </Card>
      {lista.length === 0 && <Vacio icono={FileSignature}>Sin contratos. Genera uno en la pestaña “Generar”.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((c) => {
          const e = estadoContratoInfo(estadoVista(c))
          return (
            <Card key={c.id} className={FILA}>
              <FileSignature size={16} className="text-brand-gold" />
              <span className="font-bold text-brand-navy dark:text-slate-100">{c.titulo}</span>
              <span className="text-xs text-slate-400">{c.driverNombre}</span>
              <Badge color={e.color}>{e.label}</Badge>
              <div className="ml-auto flex gap-3 text-xs">
                <button className="font-semibold text-brand-gold hover:underline" onClick={() => setVer(c)}>ver</button>
                {c.estado !== 'firmado' && c.estado !== 'anulado' && <button className="font-semibold text-slate-500 hover:text-brand-navy" onClick={() => copiar(c)}>copiar enlace</button>}
                {c.estado !== 'anulado' && <button className="font-semibold text-rose-400 hover:text-rose-600" onClick={() => anular(c)}>anular</button>}
              </div>
            </Card>
          )
        })}
      </div>
      {ver && (
        <Modal titulo={ver.titulo} onCerrar={() => setVer(null)}>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"><pre className="whitespace-pre-wrap font-sans">{ver.textoRenderizado}</pre></div>
          {ver.estado === 'firmado' && ver.firma && <div className="mt-2 text-xs text-slate-500">Firmado por <b>{ver.firmanteNombre || ver.driverNombre}</b>{ver.evidencia?.fecha ? ` · ${new Date(ver.evidencia.fecha).toLocaleString()}` : ''}<img src={ver.firma} alt="firma" className="mt-1 h-16 rounded border border-slate-200" /></div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton variant="ghost" onClick={() => pdfContrato(ver, false)}>Descargar PDF original</Boton>
            {ver.estado === 'firmado' && <Boton variant="gold" onClick={() => pdfContrato(ver, true)}>Descargar PDF firmado</Boton>}
            {ver.estado !== 'firmado' && ver.estado !== 'anulado' && <Boton variant="ghost" onClick={() => copiar(ver)}>Copiar enlace de firma</Boton>}
          </div>
        </Modal>
      )}
    </div>
  )
}

function VistaGenerar({ plantillas, personas, almacenes, tarifas, onIrLista, onIrPlantillas }) {
  const [plId, setPlId] = useState(''); const [driverId, setDriverId] = useState('')
  const [datos, setDatos] = useState({}); const [link, setLink] = useState(''); const [guardando, setGuardando] = useState(false)
  const pl = plantillas.find((p) => p.id === plId); const driver = personas.find((p) => p.id === driverId)
  const almNombre = almacenes.find((a) => a.id === driver?.almacenId)?.nombre || ''
  useEffect(() => { if (driver) setDatos(datosDeDriver(driver, almNombre, 'B&A American Group LLC', tarifaDeDriver(driver, tarifas))); else setDatos({}); setLink('') }, [driverId]) // eslint-disable-line
  const texto = pl ? renderPlantilla(pl.texto, datos) : ''
  const faltan = pl ? faltantesPlantilla(pl.texto, datos) : []
  const set = (k, v) => setDatos((x) => ({ ...x, [k]: v }))
  const generar = async () => {
    if (!pl || !driver) { window.alert('Elige plantilla y driver.'); return }
    if (faltan.length) { window.alert('Faltan datos obligatorios: ' + faltan.join(', ')); return }
    setGuardando(true)
    try {
      const token = tokenAleatorio()
      const id = await guardar(COL.contratos, null, {
        titulo: pl.titulo, textoRenderizado: texto, templateId: pl.id, templateVersion: pl.version || 1,
        datos, driverId: driver.id, driverNombre: nombreCompleto(driver), almacenId: driver.almacenId || '',
        empresa: datos.empresa, estado: 'pendiente_firma', signingToken: token,
        vence: new Date(Date.now() + 14 * 86400000).toISOString(),
      })
      await auditar('contrato_generado', `${nombreCompleto(driver)} · ${pl.titulo}`)
      setLink(`${window.location.origin}/wfirma?t=${token}`)
      walToast('Contrato generado ✓')
    } finally { setGuardando(false) }
  }
  if (!plantillas.length) return <Aviso tipo="info">Primero crea una plantilla en <button className="font-semibold text-brand-gold underline" onClick={onIrPlantillas}>Plantillas</button>.</Aviso>
  return (
    <div>
      <Card className="mb-3 p-4">
        <Grid>
          <F label="Plantilla"><Select value={plId} onChange={(e) => setPlId(e.target.value)}><option value="">Elegir…</option>{plantillas.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}</Select></F>
          <F label="Driver"><Select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">Elegir…</option>{personas.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
        </Grid>
        {driver && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Datos (autocompletados del perfil; edítalos si hace falta)</div>
            <Grid>{CAMPOS_CONTRATO.map((c) => <F key={c.k} label={c.l}><Input value={datos[c.k] || ''} onChange={(e) => set(c.k, e.target.value)} /></F>)}</Grid>
          </div>
        )}
      </Card>
      {pl && (
        <Card className="mb-3 p-4">
          <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Vista previa</div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"><pre className="whitespace-pre-wrap font-sans">{texto}</pre></div>
          {faltan.length > 0 && <Aviso tipo="warn" className="mt-2">Faltan datos obligatorios: {faltan.join(', ')}</Aviso>}
        </Card>
      )}
      {!link ? (
        <Boton variant="gold" disabled={guardando || !pl || !driver} onClick={generar}>{guardando ? <Spinner /> : 'Generar contrato y enlace de firma'}</Boton>
      ) : (
        <Card className="p-4">
          <Aviso tipo="ok">Contrato generado. Envíale este enlace al driver para que firme:</Aviso>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input readOnly value={link} className="flex-1 min-w-[220px] font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Boton variant="gold" onClick={() => { navigator.clipboard?.writeText(link); window.alert('Enlace copiado.') }}>Copiar enlace</Boton>
            <Boton variant="ghost" onClick={onIrLista}>Ver contratos</Boton>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Generar o copiar el enlace no significa que se envió, abrió o firmó. El enlace vence en 14 días.</p>
        </Card>
      )}
    </div>
  )
}

function VistaPlantillas({ plantillas }) {
  const [edit, setEdit] = useState(null)
  if (edit) return <PlantillaEditor plantilla={edit} onCerrar={() => setEdit(null)} />
  return (
    <div>
      <div className="mb-3"><Boton variant="gold" onClick={() => setEdit({})}><Plus size={15} /> Nueva plantilla</Boton></div>
      {plantillas.length === 0 && <div className="text-sm text-slate-400">Sin plantillas. Crea una reutilizable con campos automáticos.</div>}
      <div className="space-y-1.5">
        {plantillas.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="font-bold text-brand-navy dark:text-slate-100">{p.titulo}</span>
            <Badge color="slate">v{p.version || 1}</Badge>
            <button className="ml-auto text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEdit(p)}>editar</button>
          </Card>
        ))}
      </div>
    </div>
  )
}
function PlantillaEditor({ plantilla, onCerrar }) {
  const [p, setP] = useState({ titulo: '', texto: 'Contrato de prestación de servicios\n\nEntre {{empresa}} y {{nombre}}, con dirección {{direccion}}, teléfono {{telefono}}.\n\nAlmacén: {{almacen}}\nVehículo: {{vehiculo}}\nTarifa acordada: {{tarifa}} por ruta\nFecha de inicio: {{fechaInicio}}\n\nFirma del conductor: ______________________\nFecha: {{fecha}}', ...plantilla })
  const [guardando, setGuardando] = useState(false)
  const salvar = async () => {
    if (!p.titulo.trim()) { window.alert('Ponle título.'); return }
    setGuardando(true)
    try { await guardar(COL.plantillas, plantilla.id, { titulo: p.titulo.trim(), texto: p.texto, version: (plantilla.version || 0) + 1 }); await auditar('plantilla_guardada', p.titulo); onCerrar() } finally { setGuardando(false) }
  }
  return (
    <div>
      <div className="mb-3"><Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton></div>
      <Card className="p-4">
        <F label="Título"><Input value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} /></F>
        <div className="mt-3"><F label="Texto (usa {{campo}} para autollenar)"><textarea value={p.texto} onChange={(e) => setP({ ...p, texto: e.target.value })} rows={12} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></F></div>
        <div className="mt-2 flex flex-wrap gap-1.5">{CAMPOS_CONTRATO.map((c) => <button key={c.k} onClick={() => setP((x) => ({ ...x, texto: `${x.texto}{{${c.k}}}` }))} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">{`{{${c.k}}}`}</button>)}</div>
        <div className="mt-4 flex gap-2"><Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar plantilla'}</Boton><Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>{plantilla.id && <button className="ml-auto text-sm font-semibold text-rose-400 hover:text-rose-600" onClick={async () => { if (window.confirm('¿Borrar plantilla?')) { await borrar(COL.plantillas, plantilla.id); onCerrar() } }}>Borrar</button>}</div>
        <p className="mt-2 text-[11px] text-slate-400">No incluyas datos bancarios ni sensibles. Los contratos ya emitidos no cambian si editas la plantilla.</p>
      </Card>
    </div>
  )
}
