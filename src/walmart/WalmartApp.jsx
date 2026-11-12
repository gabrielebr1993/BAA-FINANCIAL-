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
import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { signOut } from 'firebase/auth'
import { jsPDF } from 'jspdf'
import { db, auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { useCarrier } from '../carriers/CarrierContext'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, KPI } from '../components/ui'
import {
  Users, Warehouse as WhIcon, Settings, ArrowLeftRight, Plus, Trash2, ArrowLeft, Search,
  Route as RouteIcon, ClipboardCheck, Wallet, Receipt, BarChart3, FileSignature,
  CreditCard, Eye, EyeOff, ShieldCheck, Zap, LogOut, LayoutDashboard, Clock, TrendingUp, AlertTriangle, DollarSign,
  CalendarDays, X, Sun, Sunset, GripVertical,
} from 'lucide-react'
import { BANCOS_USA } from './bancosUSA'
import '../styles/cloudmotion.css'
import {
  COL, ESTADOS, estadoInfo, DISPONIBILIDAD, DIAS, TIPOS_VEHICULO, SI_NO_PEND, PROPIETARIO,
  TARIFAS_DEFAULT, suscribir, guardar, borrar, auditar, nombreCompleto, sembrarAlmacenes,
  BLOQUES, ESTADOS_RUTA, estadoRutaInfo, money2, idRuta, ingresoRuta, gananciaDriver,
  hoyISO, lunesDe, domingoDe, cerrarDia, reabrirDia,
  METODOS_PAGO, liquidadoFPruta, resumenSemana, calcularFastPay,
  CATEGORIAS_GASTO, distribuirMensual, gastoEnSemana, financieroSemana,
  ESTADOS_CONTRATO, estadoContratoInfo, CAMPOS_CONTRATO, renderPlantilla, faltantesPlantilla,
  tokenAleatorio, datosDeDriver,
  ultimasSemanas, receivableNet30, acumuladoDriver,
  AGENDA_TURNOS, agendaTurnoInfo, idAgenda, planAgendaVacio, planNormalizado, coberturaDia, huecosAgenda, necesitaDeAlmacen,
} from './datosWal'

const WALMART_AZUL = '#0071dc'
const hoy = () => new Date().toISOString().slice(0, 10)
const dinero = (n) => `$${money2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icono: LayoutDashboard },
  { id: 'agenda', label: 'Agenda semanal', icono: CalendarDays },
  { id: 'personas', label: 'Candidatos / Drivers', icono: Users },
  { id: 'almacenes', label: 'Almacenes', icono: WhIcon },
  { id: 'rutas', label: 'Rutas', icono: RouteIcon },
  { id: 'cierre', label: 'Cierre diario', icono: ClipboardCheck },
  { id: 'pagos', label: 'Pagos / Fast Pay', icono: Wallet },
  { id: 'gastos', label: 'Gastos', icono: Receipt },
  { id: 'financiero', label: 'Financiero', icono: BarChart3 },
  { id: 'contratos', label: 'Contratos', icono: FileSignature },
  { id: 'config', label: 'Configuración', icono: Settings },
]

export default function WalmartApp() {
  const { user } = useAuth()
  const { cambiarCarrier } = useCarrier()
  const [tab, setTab] = useState('dashboard')
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
  useEffect(() => suscribir(COL.config, (docs) => setTarifas({ ...TARIFAS_DEFAULT, ...(docs.find((d) => d.id === 'tarifas') || {}) })), [])

  const contenido = (
    <>
      {tab === 'dashboard' && <TabDashboard rutas={rutas} pagos={pagos} gastos={gastos} cobros={cobros} personas={personas} almacenes={almacenes} irA={setTab} />}
      {tab === 'agenda' && <TabAgenda personas={personas} almacenes={almacenes} agenda={agenda} irA={setTab} />}
      {tab === 'personas' && <TabPersonas personas={personas} almacenes={almacenes} rutas={rutas} pagos={pagos} contratos={contratos} user={user} />}
      {tab === 'almacenes' && <TabAlmacenes almacenes={almacenes} user={user} />}
      {tab === 'rutas' && <TabRutas rutas={rutas} almacenes={almacenes} personas={personas} tarifas={tarifas} cierres={cierres} />}
      {tab === 'cierre' && <TabCierre rutas={rutas} almacenes={almacenes} cierres={cierres} esDueno />}
      {tab === 'pagos' && <TabPagos rutas={rutas} pagos={pagos} personas={personas} tarifas={tarifas} />}
      {tab === 'gastos' && <TabGastos gastos={gastos} almacenes={almacenes} personas={personas} rutas={rutas} />}
      {tab === 'financiero' && <TabFinanciero rutas={rutas} pagos={pagos} gastos={gastos} cobros={cobros} personas={personas} almacenes={almacenes} />}
      {tab === 'contratos' && <TabContratos contratos={contratos} plantillas={plantillas} personas={personas} almacenes={almacenes} tarifas={tarifas} />}
      {tab === 'config' && <TabConfig />}
    </>
  )
  return (
    <div className="flex min-h-screen bg-surface dark:bg-surface-dark">
      {/* MENÚ LATERAL (escritorio): mismo estilo que Warehouse/Paquetería */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex dark:border-slate-700/60 dark:bg-surface-dark-card">
        <div className="flex items-center gap-3 px-1 pb-3 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
          <div>
            <div className="text-lg font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Walmart</div>
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
          {TABS.map((tdef) => {
            const Icono = tdef.icono; const activo = tab === tdef.id
            return (
              <button key={tdef.id} onClick={() => setTab(tdef.id)}
                className={`group relative flex items-center gap-3 rounded-xl border-l-2 py-2.5 pl-3 pr-3 text-left text-sm transition-all duration-150 ${activo
                  ? 'border-transparent bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white'
                  : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'}`}>
                <Icono size={19} strokeWidth={1.8} className="flex-shrink-0" />
                <span className="flex-1">{tdef.label}</span>
                {tdef.fase && <span className="rounded bg-slate-200 px-1 text-[9px] font-bold text-slate-500 dark:bg-slate-700">F{tdef.fase}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700/60">
          <div className="truncate px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{user?.email}</div>
          <div className="px-1 text-[11px] text-slate-400">usuario · dueño</div>
          <button onClick={cambiarCarrier} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
            <ArrowLeftRight size={15} /> Cambiar de compañía
          </button>
          <button onClick={() => signOut(auth)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700/40">
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="cm-scope min-w-0 flex-1">
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
            {TABS.map((tdef) => {
              const Icono = tdef.icono
              return (
                <button key={tdef.id} onClick={() => setTab(tdef.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${tab === tdef.id ? 'bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <Icono size={14} /> {tdef.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="relative p-4 sm:p-5 lg:p-6">{contenido}</div>
      </div>
    </div>
  )
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function TabDashboard({ rutas, pagos, gastos, cobros, personas, almacenes, irA }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const semana = lunesDe(fecha)
  const fin = useMemo(() => financieroSemana(rutas, pagos, gastos, cobros, semana, almId), [rutas, pagos, gastos, cobros, semana, almId])
  const net30 = useMemo(() => receivableNet30(rutas, cobros, almId), [rutas, cobros, almId])
  const activos = personas.filter((p) => p.estadoOperativo === 'activo').length
  const standby = personas.filter((p) => p.estadoOperativo === 'standby').length
  const rWeek = rutas.filter((r) => r.semana === semana && (!almId || r.almacenId === almId))
  const rC = rWeek.filter((r) => r.estado === 'completada').length
  const pend = rWeek.filter((r) => r.estado === 'pendiente' || r.estado === 'en_progreso').length
  const driversSemana = [...new Set(rWeek.filter((r) => r.estado === 'completada').map((r) => r.driverId))]
  const saldoDrivers = money2(driversSemana.reduce((a, did) => a + resumenSemana(rutas, pagos, did, semana).saldo, 0))
  const serie = useMemo(() => ultimasSemanas(8, fecha).map((s) => { const f = financieroSemana(rutas, pagos, gastos, cobros, s, almId); return { semana: s.slice(5), Ingreso: f.ingresoRutas, Resultado: f.resultadoOperativo } }), [rutas, pagos, gastos, cobros, almId, fecha])
  const alertas = []
  if (pend > 0) alertas.push({ t: `${pend} ruta(s) pendientes o en progreso esta semana — ciérralas o cancélalas`, tab: 'cierre' })
  if (net30.vencido > 0) alertas.push({ t: `${dinero(net30.vencido)} vencido: Walmart ya pasó net-30 sin cobrar`, tab: 'financiero' })
  if (saldoDrivers > 0) alertas.push({ t: `${dinero(saldoDrivers)} por pagar a drivers esta semana`, tab: 'pagos' })

  return (
    <div>
      <PageTitle>Dashboard</PageTitle>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Semana (cualquier día)"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <span className="mt-4 text-xs text-slate-400">Semana {semana} → {domingoDe(fecha)}</span>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="Drivers activos" value={String(activos)} icon={Users} accent="navy" sub={`${standby} en stand-by`} />
        <KPI label="Rutas completadas" value={String(rC)} icon={RouteIcon} accent="green" sub={pend ? `${pend} pendientes` : 'semana'} />
        <KPI label="Ingreso Walmart" value={dinero(fin.ingresoRutas)} icon={DollarSign} accent="navy" sub="de la semana" />
        <KPI label="Ganancia drivers" value={dinero(fin.costoDrivers)} icon={Wallet} accent="blue" sub="antes de Fast Pay" />
        <KPI label="Comisiones Fast Pay" value={dinero(fin.comisionesFP)} icon={Zap} accent="gold" sub="ingreso de la compañía" />
        <KPI label="Resultado operativo" value={dinero(fin.resultadoOperativo)} icon={TrendingUp} accent={fin.resultadoOperativo >= 0 ? 'green' : 'red'} sub="margen − gastos + comisiones" />
        <KPI label="Por cobrar a Walmart" value={dinero(net30.totalPorCobrar)} icon={Clock} accent={net30.vencido > 0 ? 'red' : 'gold'} sub={net30.vencido > 0 ? `${dinero(net30.vencido)} vencido` : 'net 30'} />
        <KPI label="Por pagar a drivers" value={dinero(saldoDrivers)} icon={Wallet} accent={saldoDrivers > 0 ? 'gold' : 'green'} sub="saldo de la semana" />
      </div>

      {alertas.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={16} className="text-amber-500" /> Alertas</div>
          <div className="space-y-1.5">
            {alertas.map((a, i) => (
              <button key={i} onClick={() => irA(a.tab)} className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <span className="flex-1">{a.t}</span><ArrowLeft size={13} className="rotate-180" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Ingreso vs resultado (últimas 8 semanas)</div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e6ec" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#8a97ac' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8a97ac' }} />
                <Tooltip formatter={(v) => dinero(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingreso" fill="#13233f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resultado" fill="#c9a24b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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

// ── AGENDA SEMANAL ──────────────────────────────────────────────────────────
const ini = (p) => `${(p?.nombre || '?')[0] || ''}${(p?.apellido || '')[0] || ''}`.toUpperCase() || '?'
const DIA_LARGO = { Lun: 'Lunes', Mar: 'Martes', 'Mié': 'Miércoles', Jue: 'Jueves', Vie: 'Viernes', 'Sáb': 'Sábado', Dom: 'Domingo' }

function TabAgenda({ personas, almacenes, agenda }) {
  const [almId, setAlmId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('activo')
  const [sel, setSel] = useState(null) // driverId seleccionado (para tocar y colocar)
  const [sobre, setSobre] = useState('') // "dia|turno" en arrastre encima

  const semana = lunesDe(fecha)
  useEffect(() => { if (!almId && almacenes.length) setAlmId(almacenes[0].id) }, [almacenes, almId])
  const almSel = almacenes.find((a) => a.id === almId)
  const necesita = necesitaDeAlmacen(almSel) // { manana, tarde }
  const necTotal = necesita.manana + necesita.tarde

  const doc0 = agenda.find((a) => a.id === idAgenda(almId, semana))
  const plan = useMemo(() => planNormalizado(doc0?.plan), [doc0])

  const delAlmacen = useMemo(() => personas.filter((p) => p.almacenId === almId), [personas, almId])
  const panel = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return delAlmacen
      .filter((p) => (fEstado === 'todos' ? true : p.estadoOperativo === fEstado))
      .filter((p) => !txt || `${nombreCompleto(p)} ${p.ciudad || ''} ${p.telefono || ''}`.toLowerCase().includes(txt))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  }, [delAlmacen, q, fEstado])

  const nombreDe = (id) => { const p = personas.find((x) => x.id === id); return p ? nombreCompleto(p) : '—' }
  const personaDe = (id) => personas.find((x) => x.id === id)
  const diasAsignado = (id) => DIAS.filter((d) => plan[d].manana.includes(id) || plan[d].tarde.includes(id)).length

  const guardarPlan = async (nuevo) => { if (almId) await guardar(COL.agenda, idAgenda(almId, semana), { almacenId: almId, semana, plan: nuevo }) }
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

  const activos = (dia, turno) => panel.filter((p) => p.estadoOperativo === 'activo' && !plan[dia].manana.includes(p.id) && !plan[dia].tarde.includes(p.id))
  const huecos = DIAS.map((d) => ({ dia: d, ...huecosAgenda(plan, d, necesita) })).filter((h) => h.faltan > 0)

  if (!almacenes.length) {
    return (<div><PageTitle>Agenda semanal</PageTitle><Aviso tipo="info">Primero crea un almacén en la pestaña <b>Almacenes</b>. Cada almacén tiene su propia agenda.</Aviso></div>)
  }

  return (
    <div>
      <PageTitle>Agenda semanal</PageTitle>
      <p className="-mt-1 mb-3 text-xs text-slate-400">Arrastra (o toca) un driver y suéltalo en el día — <b className="text-emerald-600">mañana</b> o <b className="text-blue-600">tarde</b>. El sistema avisa si falta gente. Se guarda al instante.</p>

      {/* Controles */}
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)} className="min-w-[160px]">{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Semana"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[150px]" /></F>
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
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{panel.length}</span>
          </div>
          <div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" /><Input className="pl-8" placeholder="Buscar driver…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="mb-2">
            <option value="activo">Solo activos</option><option value="standby">Stand-by</option><option value="todos">Todos</option>
          </Select>
          {sel && <div className="mb-2 rounded-lg border border-brand-gold/40 bg-amber-50 px-2 py-1.5 text-[11px] text-brand-navy dark:bg-amber-500/10 dark:text-slate-200">Toca un turno para asignar a <b>{nombreDe(sel)}</b> · <button className="font-semibold underline" onClick={() => setSel(null)}>cancelar</button></div>}
          <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
            {panel.length === 0 && <div className="py-8 text-center text-xs text-slate-400">Sin drivers para este filtro.<br />Agrégalos en <b>Candidatos / Drivers</b>.</div>}
            {panel.map((p) => {
              const nd = diasAsignado(p.id); const act = sel === p.id
              return (
                <div key={p.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'copy' }}
                  onClick={() => setSel(act ? null : p.id)}
                  className={`flex cursor-grab items-center gap-2 rounded-xl border px-2 py-1.5 transition active:cursor-grabbing ${act ? 'border-brand-gold bg-amber-50 shadow-sm dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-brand-gold/50 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800'}`}>
                  <GripVertical size={13} className="shrink-0 text-slate-300" />
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-bold text-brand-gold">{ini(p)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</span><span className="block truncate text-[10px] text-slate-400">{p.tipoVehiculo || 'Driver'}{nd ? ` · ${nd}d` : ''}</span></span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Tablero semanal */}
        <div className="overflow-x-auto pb-1">
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
    </div>
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
function TabPersonas({ personas, almacenes, rutas, pagos, contratos, user }) {
  const [editar, setEditar] = useState(null) // persona en edición / {} nuevo
  const [ver, setVer] = useState(null) // perfil abierto
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fAlmacen, setFAlmacen] = useState('')
  const [fDisp, setFDisp] = useState('')

  const almacenNombre = (id) => almacenes.find((a) => a.id === id)?.nombre || ''
  const lista = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return personas.filter((p) => {
      if (fEstado && p.estadoOperativo !== fEstado) return false
      if (fAlmacen && p.almacenId !== fAlmacen) return false
      if (fDisp && p.disponibilidad !== fDisp) return false
      if (txt) {
        const hay = `${nombreCompleto(p)} ${p.ciudad || ''} ${p.estado || ''} ${p.telefono || ''} ${p.tipoVehiculo || ''}`.toLowerCase()
        if (!hay.includes(txt)) return false
      }
      return true
    }).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  }, [personas, q, fEstado, fAlmacen, fDisp])

  if (ver) return <PerfilDriver persona={personas.find((p) => p.id === ver.id) || ver} almacenes={almacenes} rutas={rutas} pagos={pagos} contratos={contratos} onVolver={() => setVer(null)} onEditar={(p) => { setVer(null); setEditar(p) }} />
  if (editar) return <EditorPersona persona={editar} almacenes={almacenes} user={user} onCerrar={() => setEditar(null)} />

  const conteo = (id) => personas.filter((p) => p.estadoOperativo === id).length
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setEditar({})}><Plus size={15} /> Nuevo</Boton>}>Candidatos y Drivers</PageTitle>
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
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-bold text-brand-gold">{inic(p)}</div>
              <button className="font-bold text-brand-navy hover:underline dark:text-slate-100" onClick={() => setVer(p)}>{nombreCompleto(p)}</button>
              <Badge color={e.color}>{e.label}</Badge>
              {p.almacenId && <span className="text-xs text-slate-400">{almacenNombre(p.almacenId)}</span>}
              <span className="text-xs text-slate-400">{[p.ciudad, p.estado].filter(Boolean).join(', ')}</span>
              {p.tipoVehiculo && <Badge color="slate">{p.tipoVehiculo}</Badge>}
              <div className="ml-auto flex gap-3 text-xs">
                <button className="font-semibold text-brand-gold hover:underline" onClick={() => setVer(p)}>ver perfil</button>
                <button className="font-semibold text-slate-400 hover:text-brand-navy" onClick={() => setEditar(p)}>editar</button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

const inic = (p) => `${(p.nombre || '?')[0] || ''}${(p.apellido || '')[0] || ''}`.toUpperCase()

function EditorPersona({ persona, almacenes, user, onCerrar }) {
  const nuevo = !persona.id
  const [p, setP] = useState(() => ({
    nombre: '', apellido: '', telefono: '', correo: '', direccion: '', ciudad: '', estado: '',
    fechaRegistro: hoy(), responsable: user?.email || '', notas: '',
    tieneSSN: 'pendiente', tieneLicencia: 'pendiente', disponibilidad: 'ambas', diasDisponibles: [],
    tipoVehiculo: 'SUV', marca: '', modelo: '', anio: '', propietarioVehiculo: 'driver',
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
      onCerrar(id)
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
            <F label="Fecha de registro"><Input type="date" value={p.fechaRegistro} onChange={(e) => set('fechaRegistro', e.target.value)} /></F>
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
          </Grid>
        </Seccion>
        <Seccion titulo="Estado y almacén">
          <Grid>
            <F label="Estado operativo"><Select value={p.estadoOperativo} onChange={(e) => set('estadoOperativo', e.target.value)}>{ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></F>
            <F label="Almacén asignado"><Select value={p.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">— sin asignar —</option>{almacenes.filter((a) => a.activo !== false).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          </Grid>
          {p.estadoOperativo === 'activo' && !p.almacenId && <p className="mt-1 text-[11px] text-amber-600">Un driver activo necesita un almacén para recibir rutas.</p>}
        </Seccion>
        <Seccion titulo="Notas">
          <textarea value={p.notas} onChange={(e) => set('notas', e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        </Seccion>
      </Card>
      <div className="flex gap-2">
        <Boton variant="gold" disabled={guardando || !puedeActivar} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar'}</Boton>
        <Boton variant="ghost" onClick={() => onCerrar()}>Cancelar</Boton>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Datos bancarios, foto, documentos y contratos se agregan desde el perfil en fases siguientes (con cifrado y permisos).</p>
    </div>
  )
}

function PerfilDriver({ persona, almacenes, rutas, pagos, contratos, onVolver, onEditar }) {
  const p = persona
  const e = estadoInfo(p.estadoOperativo)
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
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-navy text-2xl font-black text-brand-gold">{inic(p)}</div>
          <div className="min-w-0">
            <div className="text-xl font-black text-brand-navy dark:text-slate-100">{nombreCompleto(p)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge color={e.color}>{e.label}</Badge>
              {alm && <Badge color="navy">{alm.nombre}</Badge>}
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
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Contratos</div>
        {contratosDrv.length === 0 && <div className="text-sm text-slate-400">Sin contratos. Genera uno en la pestaña Contratos.</div>}
        {contratosDrv.map((c) => { const ec = estadoContratoInfo(c.estado); return <div key={c.id} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-sm last:border-0 dark:border-slate-800/60"><FileSignature size={14} className="text-brand-gold" /><span className="font-semibold text-brand-navy dark:text-slate-100">{c.titulo}</span><Badge color={ec.color}>{ec.label}</Badge></div> })}
      </Card>

      <p className="mt-3 text-[11px] text-slate-400">Subir foto y documentos (archivos) llega en una mejora con almacenamiento. El resto del perfil ya es completo.</p>
    </div>
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
  const [a, setA] = useState({ nombre: '', direccion: '', ciudad: '', estado: '', zonaHoraria: '', responsable: '', activo: true, ...almacen })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }))
  const salvar = async () => {
    if (!a.nombre.trim()) { window.alert('Ponle nombre al almacén.'); return }
    setGuardando(true)
    try { await guardar(COL.almacenes, almacen.id, a); await auditar('almacen_guardado', a.nombre); onCerrar() } finally { setGuardando(false) }
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
      </Grid>
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
function TabConfig() {
  const [t, setT] = useState(null)
  useEffect(() => suscribir(COL.config, (docs) => setT(docs.find((d) => d.id === 'tarifas') || { id: 'tarifas', ...TARIFAS_DEFAULT })), [])
  const [guardando, setGuardando] = useState(false)
  if (!t) return <Spinner />
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }))
  const num = (v) => Number(v) || 0
  const salvar = async () => {
    setGuardando(true)
    try {
      await guardar(COL.config, 'tarifas', { ingresoWalmart: num(t.ingresoWalmart), pagoDriverPropio: num(t.pagoDriverPropio), pagoDriverCompania: num(t.pagoDriverCompania), comisionFastPay: num(t.comisionFastPay) })
      await auditar('tarifas_guardadas', `WM ${t.ingresoWalmart} / propio ${t.pagoDriverPropio} / compañía ${t.pagoDriverCompania} / FP ${t.comisionFastPay}%`)
    } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle>Configuración de tarifas</PageTitle>
      <Card className="p-4">
        <p className="mb-3 text-xs text-slate-500">Valores por defecto por ruta. Se usan al registrar rutas (Fase 2) y se <b>guardan en cada ruta</b>, así que cambiarlos luego no altera el historial.</p>
        <Grid>
          <F label="Ingreso de Walmart por ruta (USD)"><Input type="number" value={t.ingresoWalmart} onChange={(e) => set('ingresoWalmart', e.target.value)} /></F>
          <F label="Pago al driver con vehículo propio (USD)"><Input type="number" value={t.pagoDriverPropio} onChange={(e) => set('pagoDriverPropio', e.target.value)} /></F>
          <F label="Pago al driver con vehículo de la compañía (USD)"><Input type="number" value={t.pagoDriverCompania} onChange={(e) => set('pagoDriverCompania', e.target.value)} /></F>
          <F label="Comisión de Fast Pay (%)"><Input type="number" step="0.5" value={t.comisionFastPay} onChange={(e) => set('comisionFastPay', e.target.value)} /></F>
        </Grid>
        <Boton variant="gold" className="mt-4" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar tarifas'}</Boton>
      </Card>
    </div>
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
function TabRutas({ rutas, almacenes, personas, tarifas, cierres }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const [editar, setEditar] = useState(null)
  const almNombre = (id) => almacenes.find((a) => a.id === id)?.nombre || ''
  const diaCerrado = (aId) => cierres.some((c) => c.id === `c_${aId}_${fecha}` && c.estado === 'cerrado')
  const delDia = useMemo(() => rutas.filter((r) => r.fecha === fecha && (!almId || r.almacenId === almId)).sort((a, b) => `${a.almacenId}${a.bloque}`.localeCompare(`${b.almacenId}${b.bloque}`)), [rutas, fecha, almId])

  if (editar) return <RutaEditor ruta={editar} almacenes={almacenes} personas={personas} tarifas={tarifas} onCerrar={() => setEditar(null)} />

  const totIng = delDia.reduce((a, r) => a + ingresoRuta(r), 0)
  const totGan = delDia.reduce((a, r) => a + gananciaDriver(r), 0)
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setEditar({ fecha, almacenId: almId })}><Plus size={15} /> Nueva ruta</Boton>}>Rutas</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <div className="ml-auto text-right text-xs text-slate-400">Ingreso Walmart <b className="text-brand-navy dark:text-slate-100">{dinero(totIng)}</b> · Ganancia drivers <b className="text-brand-navy dark:text-slate-100">{dinero(totGan)}</b></div>
        </div>
      </Card>
      {delDia.length === 0 && <Vacio icono={RouteIcon}>No hay rutas registradas para ese día{almId ? ` en ${almNombre(almId)}` : ''}. Crea una con “Nueva ruta”.</Vacio>}
      <div className="space-y-1.5">
        {delDia.map((r) => {
          const e = estadoRutaInfo(r.estado)
          return (
            <Card key={r.id} className={FILA}>
              <Badge color="navy">{almNombre(r.almacenId)}</Badge>
              <Badge color="slate">{BLOQUES.find((b) => b.id === r.bloque)?.label || r.bloque}</Badge>
              <span className="font-bold text-brand-navy dark:text-slate-100">{r.driverNombre || '(sin driver)'}</span>
              {r.identificador && <span className="text-xs text-slate-400">{r.identificador}</span>}
              <Badge color={e.color}>{e.label}</Badge>
              {r.cerrada && <Badge color="slate">día cerrado</Badge>}
              <span className="ml-auto font-mono text-xs text-slate-500">WM {dinero(ingresoRuta(r))} · drv {dinero(gananciaDriver(r))}</span>
              <button className="text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEditar(r)}>{r.cerrada ? 'ver' : 'editar'}</button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function RutaEditor({ ruta, almacenes, personas, tarifas, onCerrar }) {
  const bloqueado = !!ruta.cerrada
  const [r, setR] = useState(() => ({
    fecha: hoyISO(), almacenId: '', driverId: '', driverNombre: '', identificador: '', bloque: 'manana',
    vehiculoTipo: '', propietarioVehiculo: 'driver', estado: 'pendiente',
    tarifaWalmart: tarifas.ingresoWalmart, tarifaDriver: tarifas.pagoDriverPropio,
    bonos: [], deducciones: [], notas: '', motivoCancel: '', ...ruta,
  }))
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }))
  const driversActivos = personas.filter((p) => p.estadoOperativo === 'activo' && (!r.almacenId || p.almacenId === r.almacenId))
  const elegirDriver = (id) => {
    const d = personas.find((x) => x.id === id)
    setR((x) => ({ ...x, driverId: id, driverNombre: d ? nombreCompleto(d) : '', vehiculoTipo: d?.tipoVehiculo || x.vehiculoTipo, propietarioVehiculo: d?.propietarioVehiculo || x.propietarioVehiculo, almacenId: x.almacenId || d?.almacenId || '', tarifaDriver: (d?.propietarioVehiculo === 'compania' ? tarifas.pagoDriverCompania : tarifas.pagoDriverPropio) }))
  }
  const setProp = (v) => setR((x) => ({ ...x, propietarioVehiculo: v, tarifaDriver: v === 'compania' ? tarifas.pagoDriverCompania : tarifas.pagoDriverPropio }))
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
        bonos: (r.bonos || []).filter((b) => b.concepto && b.monto).map((b) => ({ ...b, monto: money2(b.monto) })),
        deducciones: (r.deducciones || []).filter((b) => b.concepto && b.monto).map((b) => ({ ...b, monto: money2(b.monto) })),
      }
      await guardar(COL.rutas, id, limpio)
      await auditar('ruta_guardada', `${r.driverNombre} · ${r.fecha} · ${r.bloque} · ${r.estado}`)
      onCerrar()
    } catch (e) { setErr('No se pudo guardar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={onCerrar}><ArrowLeft size={14} /> Volver</Boton>}>{ruta.id ? (bloqueado ? 'Ruta (día cerrado)' : 'Editar ruta') : 'Nueva ruta'}</PageTitle>
      {bloqueado && <Aviso tipo="warn" className="mb-3">Este día está cerrado. Para corregir, reábrelo en <b>Cierre diario</b> (queda auditado).</Aviso>}
      <fieldset disabled={bloqueado} className="disabled:opacity-70">
        <Card className="mb-3 p-4">
          <Grid>
            <F label="Fecha de servicio"><Input type="date" value={r.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
            <F label="Almacén"><Select value={r.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">Elegir…</option>{almacenes.filter((a) => a.activo !== false).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
            <F label="Driver (activo)"><Select value={r.driverId} onChange={(e) => elegirDriver(e.target.value)}><option value="">Elegir…</option>{driversActivos.map((d) => <option key={d.id} value={d.id}>{nombreCompleto(d)}</option>)}</Select></F>
            <F label="Identificador (opcional)"><Input value={r.identificador} onChange={(e) => set('identificador', e.target.value)} placeholder="DFW01-140-B" /></F>
            <F label="Bloque"><Select value={r.bloque} onChange={(e) => set('bloque', e.target.value)}>{BLOQUES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></F>
            <F label="Vehículo"><Input value={r.vehiculoTipo} onChange={(e) => set('vehiculoTipo', e.target.value)} /></F>
            <F label="Propietario vehículo"><Select value={r.propietarioVehiculo} onChange={(e) => setProp(e.target.value)}>{PROPIETARIO.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
            <F label="Estado"><Select value={r.estado} onChange={(e) => set('estado', e.target.value)}>{ESTADOS_RUTA.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></F>
          </Grid>
          {r.estado === 'cancelada' && <div className="mt-2"><F label="Motivo de cancelación"><Input value={r.motivoCancel} onChange={(e) => set('motivoCancel', e.target.value)} /></F></div>}
        </Card>
        <Card className="mb-3 p-4">
          <div className="mb-2 text-[11px] font-bold uppercase text-slate-400">Tarifas (se guardan en la ruta; cambios futuros no la alteran)</div>
          <Grid>
            <F label="Ingreso de Walmart (USD)"><Input type="number" value={r.tarifaWalmart} onChange={(e) => set('tarifaWalmart', e.target.value)} /></F>
            <F label="Pago al driver (USD)"><Input type="number" value={r.tarifaDriver} onChange={(e) => set('tarifaDriver', e.target.value)} /></F>
          </Grid>
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
      {!bloqueado && <div className="flex gap-2"><Boton variant="gold" disabled={guardando} onClick={salvar}>{guardando ? <Spinner /> : 'Guardar ruta'}</Boton><Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton></div>}
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
  const [almId, setAlmId] = useState('')
  useEffect(() => { if (!almId && almacenes[0]) setAlmId(almacenes[0].id) }, [almacenes, almId])
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState(null)

  const dia = useMemo(() => rutas.filter((r) => r.fecha === fecha && r.almacenId === almId), [rutas, fecha, almId])
  const cierreDoc = cierres.find((c) => c.id === `c_${almId}_${fecha}`)
  const cerrado = cierreDoc?.estado === 'cerrado'
  const completadas = dia.filter((r) => r.estado === 'completada')
  const canceladas = dia.filter((r) => r.estado === 'cancelada')
  const pendientes = dia.filter((r) => r.estado === 'pendiente' || r.estado === 'en_progreso')
  const ingresoWM = dia.reduce((a, r) => a + ingresoRuta(r), 0)
  const gananciaDrv = dia.reduce((a, r) => a + gananciaDriver(r), 0)
  const driversUnicos = new Set(dia.map((r) => r.driverId)).size

  const resumen = { registradas: dia.length, completadas: completadas.length, canceladas: canceladas.length, pendientes: pendientes.length, drivers: driversUnicos, ingresoWM: money2(ingresoWM), gananciaDrv: money2(gananciaDrv) }

  const cerrar = async () => {
    if (pendientes.length) { setMsg({ t: 'error', x: `No puedes cerrar: hay ${pendientes.length} ruta(s) pendientes o en progreso. Complétalas o cancélalas con motivo.` }); return }
    if (!dia.length) { setMsg({ t: 'error', x: 'No hay rutas ese día.' }); return }
    if (!window.confirm(`Registraste ${dia.length} ruta(s): ${completadas.length} completadas, ${canceladas.length} canceladas. ¿Confirmas el cierre?`)) return
    setTrabajando(true); setMsg(null)
    try { await cerrarDia(almId, fecha, dia, resumen); setMsg({ t: 'ok', x: 'Día cerrado y consolidado.' }) }
    catch (e) { setMsg({ t: 'error', x: 'No se pudo cerrar: ' + (e.message || e) }) } finally { setTrabajando(false) }
  }
  const reabrir = async () => {
    const motivo = window.prompt('Motivo de la reapertura (queda auditado):')
    if (motivo == null) return
    setTrabajando(true); setMsg(null)
    try { await reabrirDia(cierreDoc.id, dia, motivo); setMsg({ t: 'ok', x: 'Día reabierto. Corrige lo necesario y vuelve a cerrar.' }) }
    catch (e) { setMsg({ t: 'error', x: 'No se pudo reabrir: ' + (e.message || e) }) } finally { setTrabajando(false) }
  }

  return (
    <div>
      <PageTitle>Cierre diario</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          {cerrado && <Badge color="green">Día cerrado</Badge>}
        </div>
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile n={dia.length} l="Rutas registradas" />
        <Tile n={completadas.length} l="Completadas" verde />
        <Tile n={pendientes.length} l="Pendientes / en progreso" ambar={pendientes.length > 0} />
        <Tile n={canceladas.length} l="Canceladas" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile n={driversUnicos} l="Drivers" />
        <Tile txt={dinero(ingresoWM)} l="Ingreso Walmart" />
        <Tile txt={dinero(gananciaDrv)} l="Ganancia drivers" verde />
      </div>

      {msg && <Aviso tipo={msg.t === 'ok' ? 'ok' : 'error'} className="mb-3">{msg.x}</Aviso>}
      {pendientes.length > 0 && !cerrado && <Aviso tipo="warn" className="mb-3">Hay {pendientes.length} ruta(s) pendientes o en progreso. Complétalas o cancélalas (con motivo) antes de cerrar.</Aviso>}

      {!cerrado ? (
        <Boton variant="gold" disabled={trabajando || pendientes.length > 0 || !dia.length} onClick={cerrar}>{trabajando ? <Spinner /> : `Cerrar día (${dia.length} rutas)`}</Boton>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Badge color="green">Cerrado por {cierreDoc.cerradoPor || '—'}</Badge>
          {(cierreDoc.reaperturas || []).length > 0 && <span className="text-xs text-slate-400">{cierreDoc.reaperturas.length} reapertura(s)</span>}
          <Boton variant="ghost" disabled={trabajando} onClick={reabrir}>Reabrir día (auditado)</Boton>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">Cerrar consolida el día; las rutas quedan bloqueadas. Fast Pay de rutas completadas se podrá hacer antes del cierre (Fase 3) y el cierre no lo vuelve a generar.</p>
    </div>
  )
}
function Tile({ n, txt, l, verde, ambar }) {
  const cls = verde ? 'text-emerald-600 dark:text-emerald-400' : ambar ? 'text-amber-600 dark:text-amber-400' : 'text-brand-navy dark:text-slate-100'
  return <div className="rounded-xl border border-slate-200 bg-surface-card p-3 dark:border-slate-700 dark:bg-surface-dark-card"><div className={`font-mono text-xl font-extrabold ${cls}`}>{txt != null ? txt : n}</div><div className="text-[11px] font-semibold text-slate-500">{l}</div></div>
}

// ── PAGOS / FAST PAY ────────────────────────────────────────────────────────
function TabPagos({ rutas, pagos, personas, tarifas }) {
  const [driverId, setDriverId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [fpRuta, setFpRuta] = useState(null)
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const semana = lunesDe(fecha)
  const driver = personas.find((p) => p.id === driverId)
  const res = driverId ? resumenSemana(rutas, pagos, driverId, semana) : null
  const driversLista = personas.filter((p) => p.estadoOperativo === 'activo' || rutas.some((r) => r.driverId === p.id)).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)))
  const badgeEstado = { pendiente: 'red', parcial: 'gold', pagado: 'green' }

  return (
    <div>
      <PageTitle>Pagos y Fast Pay</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Driver"><Select value={driverId} onChange={(e) => setDriverId(e.target.value)}><option value="">Elegir…</option>{driversLista.map((d) => <option key={d.id} value={d.id}>{nombreCompleto(d)}</option>)}</Select></F>
          <F label="Semana (cualquier día)"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <span className="mt-4 text-xs text-slate-400">Semana {semana} → {domingoDe(fecha)}</span>
        </div>
      </Card>

      {!driverId && <Vacio icono={Wallet}>Elige un driver para ver su semana de pago, Fast Pay y saldo.</Vacio>}
      {res && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile txt={dinero(res.totalGanado)} l="Total ganado (antes de FP)" />
            <Tile txt={dinero(res.liquidadoFP)} l="Bruto liquidado por Fast Pay" />
            <Tile txt={dinero(res.efectivoFP)} l="Efectivo entregado (FP)" />
            <Tile txt={dinero(res.comisiones)} l="Comisiones FP (ingreso compañía)" verde />
            <Tile txt={dinero(res.pagadoNormal)} l="Otros pagos" />
            <Tile txt={dinero(res.saldo)} l="Saldo pendiente" ambar={res.saldo > 0.005} />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge color={badgeEstado[res.estado]}>{res.estado === 'pagado' ? 'Pagado' : res.estado === 'parcial' ? 'Parcialmente pagado' : 'Pendiente'}</Badge>
            {res.saldo > 0.005 && <Boton variant="gold" onClick={() => setPagoAbierto(true)}><Wallet size={14} /> Registrar pago del saldo</Boton>}
            {driver && res.rutasSemana.length > 0 && <Boton variant="ghost" onClick={() => pdfPayStub(driver, semana, domingoDe(fecha), res)}>Pay stub PDF</Boton>}
          </div>

          <Card className="mb-3 p-0">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Rutas completadas de la semana</div>
            {res.rutasSemana.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin rutas completadas esta semana.</div>}
            {res.rutasSemana.map((r) => {
              const liq = liquidadoFPruta(pagos, r.id)
              const bruto = gananciaDriver(r)
              const resta = money2(bruto - liq)
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 dark:border-slate-800/60">
                  <span className="font-mono text-xs text-slate-400">{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label}</span>
                  {r.identificador && <span className="text-xs text-slate-400">{r.identificador}</span>}
                  <span className="font-mono font-semibold">{dinero(bruto)}</span>
                  {liq > 0 && <Badge color="gold">FP {dinero(liq)}</Badge>}
                  <span className="ml-auto text-xs text-slate-400">resta {dinero(resta)}</span>
                  {resta > 0.005 && <button className="text-xs font-bold text-brand-gold hover:underline" onClick={() => setFpRuta({ ...r, resta })}><Zap size={12} className="mb-0.5 mr-0.5 inline" />Fast Pay</button>}
                </div>
              )
            })}
          </Card>

          {res.pagos.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">Movimientos de la semana</div>
              {res.pagos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-4 py-2 text-sm last:border-0 dark:border-slate-800/60">
                  <Badge color={p.tipo === 'fastpay' ? 'gold' : 'navy'}>{p.tipo === 'fastpay' ? 'Fast Pay' : 'Pago'}</Badge>
                  <span className="font-mono text-xs text-slate-400">{p.fecha}</span>
                  {p.tipo === 'fastpay'
                    ? <span className="text-xs">bruto {dinero(p.bruto)} · comisión {dinero(p.comision)} ({p.comisionPct}%) · efectivo <b>{dinero(p.efectivo)}</b></span>
                    : <span className="text-xs">monto <b>{dinero(p.monto)}</b></span>}
                  <span className="ml-auto text-xs text-slate-400">{p.metodo}{p.referencia ? ` · ${p.referencia}` : ''}{p.responsable ? ` · ${p.responsable}` : ''}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {fpRuta && <FastPayModal ruta={fpRuta} driver={driver} semana={semana} pctDefault={tarifas.comisionFastPay} onCerrar={() => setFpRuta(null)} />}
      {pagoAbierto && res && <PagoModal driver={driver} semana={semana} saldo={res.saldo} onCerrar={() => setPagoAbierto(false)} />}
    </div>
  )
}

function FastPayModal({ ruta, driver, semana, pctDefault, onCerrar }) {
  const [bruto, setBruto] = useState(ruta.resta)
  const [pct, setPct] = useState(pctDefault)
  const [metodo, setMetodo] = useState('Efectivo')
  const [referencia, setReferencia] = useState('')
  const [responsable, setResponsable] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const calc = calcularFastPay(bruto, pct)
  const restante = money2(ruta.resta - calc.bruto)
  const confirmar = async () => {
    if (calc.bruto <= 0) { setErr('El bruto debe ser mayor a 0.'); return }
    if (calc.bruto > ruta.resta + 0.005) { setErr(`No puedes liquidar más que el saldo de la ruta (${dinero(ruta.resta)}).`); return }
    setErr(''); setGuardando(true)
    try {
      await guardar(COL.pagos, null, {
        tipo: 'fastpay', driverId: driver.id, driverNombre: nombreCompleto(driver), semana, rutaId: ruta.id,
        bruto: calc.bruto, comisionPct: Number(pct) || 0, comision: calc.comision, efectivo: calc.efectivo,
        fecha: hoyISO(), metodo, referencia, responsable,
      })
      await auditar('fastpay', `${nombreCompleto(driver)} · ruta ${ruta.id} · bruto ${calc.bruto} · comisión ${calc.comision} · efectivo ${calc.efectivo}`)
      onCerrar()
    } catch (e) { setErr('No se pudo registrar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Fast Pay (anticipo de una ruta completada)" onCerrar={onCerrar}>
      <Grid>
        <F label="Importe bruto a liquidar"><Input type="number" value={bruto} onChange={(e) => setBruto(e.target.value)} /></F>
        <F label="Comisión (%)"><Input type="number" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} /></F>
        <F label="Método"><Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}</Select></F>
        <F label="Referencia"><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></F>
        <F label="Responsable"><Input value={responsable} onChange={(e) => setResponsable(e.target.value)} /></F>
      </Grid>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex justify-between"><span>Bruto liquidado</span><b className="font-mono">{dinero(calc.bruto)}</b></div>
        <div className="flex justify-between text-amber-700 dark:text-amber-300"><span>Comisión ({pct}%) — ingreso de la compañía</span><b className="font-mono">−{dinero(calc.comision)}</b></div>
        <div className="flex justify-between border-t border-amber-200 pt-1 dark:border-amber-500/30"><span>Efectivo a entregar al driver</span><b className="font-mono text-emerald-600">{dinero(calc.efectivo)}</b></div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Saldo restante de la ruta</span><span className="font-mono">{dinero(restante)}</span></div>
      </div>
      {err && <Aviso tipo="error" className="mt-2">{err}</Aviso>}
      <div className="mt-3 flex gap-2">
        <Boton variant="gold" disabled={guardando} onClick={confirmar}>{guardando ? <Spinner /> : 'Confirmar Fast Pay'}</Boton>
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
      onCerrar()
    } catch (e) { setErr('No se pudo registrar: ' + (e.message || e)) } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Registrar pago del saldo" onCerrar={onCerrar}>
      <Grid>
        <F label="Monto (saldo pendiente)"><Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></F>
        <F label="Método"><Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}</Select></F>
        <F label="Referencia"><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></F>
        <F label="Responsable"><Input value={responsable} onChange={(e) => setResponsable(e.target.value)} /></F>
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

function Modal({ titulo, children, onCerrar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onCerrar}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-card p-5 shadow-2xl dark:bg-surface-dark-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</div>
        {children}
      </div>
    </div>
  )
}

// ── GASTOS ──────────────────────────────────────────────────────────────────
function TabGastos({ gastos, almacenes, personas, rutas }) {
  const [editar, setEditar] = useState(null)
  const [fCat, setFCat] = useState('')
  const [fAlm, setFAlm] = useState('')
  const almNombre = (id) => almacenes.find((a) => a.id === id)?.nombre || 'General'
  const lista = useMemo(() => gastos.filter((g) => (!fCat || g.categoria === fCat) && (!fAlm || g.almacenId === fAlm)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [gastos, fCat, fAlm])
  if (editar) return <GastoEditor gasto={editar} almacenes={almacenes} personas={personas} rutas={rutas} onCerrar={() => setEditar(null)} />
  const total = lista.reduce((a, g) => a + (Number(g.monto) || 0), 0)
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setEditar({})}><Plus size={15} /> Nuevo gasto</Boton>}>Gastos</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Categoría"><Select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas</option>{CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}</Select></F>
          <F label="Almacén"><Select value={fAlm} onChange={(e) => setFAlm(e.target.value)}><option value="">Todos / General</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <div className="ml-auto text-right text-xs text-slate-400">Total mostrado <b className="text-brand-navy dark:text-slate-100">{dinero(total)}</b></div>
        </div>
      </Card>
      {lista.length === 0 && <Vacio icono={Receipt}>Sin gastos. Agrega el primero con “Nuevo gasto”.</Vacio>}
      <div className="space-y-1.5">
        {lista.map((g) => (
          <Card key={g.id} className={FILA}>
            <Badge color="navy">{g.categoria}</Badge>
            <span className="font-semibold text-brand-navy dark:text-slate-100">{g.concepto || '—'}</span>
            <span className="font-mono text-sm">{dinero(g.monto)}</span>
            <span className="text-xs text-slate-400">{g.fecha}</span>
            <Badge color="slate">{almNombre(g.almacenId)}</Badge>
            {g.periodoDesde && <Badge color="gold">mensual · reparte</Badge>}
            {g.esFinanciamiento && <Badge color="blue">financiamiento</Badge>}
            <Badge color={g.estadoPago === 'pagado' ? 'green' : 'red'}>{g.estadoPago === 'pagado' ? 'pagado' : 'pendiente'}</Badge>
            <button className="ml-auto text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEditar(g)}>editar</button>
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
          <F label="Fecha"><Input type="date" value={g.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
          <F label="Tipo"><Select value={g.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="variable">Variable</option><option value="fijo">Fijo / recurrente</option></Select></F>
          <F label="Almacén (o General)"><Select value={g.almacenId} onChange={(e) => set('almacenId', e.target.value)}><option value="">General</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <F label="Atribuir a driver (opcional)"><Select value={g.driverId} onChange={(e) => set('driverId', e.target.value)}><option value="">—</option>{personas.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}</Select></F>
          <F label="Ruta (opcional)"><Select value={g.rutaId} onChange={(e) => set('rutaId', e.target.value)}><option value="">—</option>{rutasDrv.map((r) => <option key={r.id} value={r.id}>{r.fecha} · {BLOQUES.find((b) => b.id === r.bloque)?.label} · {r.driverNombre}</option>)}</Select></F>
          <F label="Vehículo (opcional)"><Input value={g.vehiculo} onChange={(e) => set('vehiculo', e.target.value)} /></F>
          <F label="Responsable"><Input value={g.responsable} onChange={(e) => set('responsable', e.target.value)} /></F>
          <F label="Estado de pago"><Select value={g.estadoPago} onChange={(e) => set('estadoPago', e.target.value)}><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></Select></F>
          {g.estadoPago === 'pagado' && <F label="Fecha de pago"><Input type="date" value={g.fechaPago} onChange={(e) => set('fechaPago', e.target.value)} /></F>}
        </Grid>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={g.mensual} onChange={(e) => set('mensual', e.target.checked)} className="accent-brand-gold" /> Es mensual (repartir entre semanas)</label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={g.esFinanciamiento} onChange={(e) => set('esFinanciamiento', e.target.checked)} className="accent-brand-gold" /> Es financiamiento (salida de caja, no gasto operativo)</label>
        </div>
        {g.mensual && (
          <div className="mt-2">
            <Grid><F label="Período desde"><Input type="date" value={g.periodoDesde} onChange={(e) => set('periodoDesde', e.target.value)} /></F><F label="Período hasta"><Input type="date" value={g.periodoHasta} onChange={(e) => set('periodoHasta', e.target.value)} /></F></Grid>
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
function TabFinanciero({ rutas, pagos, gastos, cobros, personas, almacenes }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [almId, setAlmId] = useState('')
  const [cobroOpen, setCobroOpen] = useState(false)
  const semana = lunesDe(fecha)
  const fin = useMemo(() => financieroSemana(rutas, pagos, gastos, cobros, semana, almId), [rutas, pagos, gastos, cobros, semana, almId])
  const nAct = personas.filter((p) => p.estadoOperativo === 'activo').length
  const nStandby = personas.filter((p) => p.estadoOperativo === 'standby').length
  const nCand = personas.filter((p) => p.estadoOperativo === 'candidato').length
  const rsWeek = rutas.filter((r) => r.semana === semana && (!almId || r.almacenId === almId))
  const rCompl = rsWeek.filter((r) => r.estado === 'completada').length
  const rCan = rsWeek.filter((r) => r.estado === 'cancelada').length
  const cobrosSemana = cobros.filter((c) => c.semana === semana && (!almId || c.almacenId === almId)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  return (
    <div>
      <PageTitle>Financiero</PageTitle>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <F label="Semana (cualquier día)"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></F>
          <F label="Almacén"><Select value={almId} onChange={(e) => setAlmId(e.target.value)}><option value="">Todos</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></F>
          <span className="mt-4 text-xs text-slate-400">Semana {semana} → {domingoDe(fecha)}</span>
        </div>
      </Card>

      {/* dashboard rápido */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile n={nAct} l="Drivers activos" />
        <Tile n={nStandby} l="Stand-by" />
        <Tile n={nCand} l="Candidatos" />
        <Tile n={rCompl} l="Rutas completadas" verde />
        <Tile n={rCan} l="Rutas canceladas" />
      </div>

      {/* resultado operativo */}
      <Card className="mb-3 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Resultado operativo de la semana</div>
        <FilaFin l="Ingreso de rutas (con ajustes Walmart)" v={fin.ingresoRutas} />
        <FilaFin l="Costo de drivers (ganancia antes de Fast Pay)" v={-fin.costoDrivers} />
        <FilaFin l="Margen antes de gastos" v={fin.margen} fuerte />
        <FilaFin l="Gastos operativos asignados" v={-fin.gastosOper} />
        <FilaFin l="Comisiones de Fast Pay (ingreso aparte)" v={fin.comisionesFP} verde />
        <FilaFin l="Resultado operativo" v={fin.resultadoOperativo} fuerte borde />
        {fin.gastoFinanc > 0 && <p className="mt-2 text-[11px] text-slate-400">+ {dinero(fin.gastoFinanc)} de financiamiento (Cargo Vans): es salida de caja, no entra al resultado operativo.</p>}
      </Card>

      {/* flujo de caja */}
      <Card className="mb-3 p-4">
        <div className="mb-2 flex items-center gap-2"><span className="text-sm font-bold text-brand-navy dark:text-slate-100">Flujo de caja y cobros</span><Boton variant="ghost" className="ml-auto" onClick={() => setCobroOpen(true)}><Plus size={13} /> Registrar cobro de Walmart</Boton></div>
        <FilaFin l="Cobrado de Walmart" v={fin.cobrado} verde />
        <FilaFin l="Por cobrar (devengado − cobrado)" v={fin.porCobrar} />
        <FilaFin l="Efectivo entregado a drivers (FP + pagos)" v={-fin.efectivoADrivers} />
        <FilaFin l="Gastos pagados en la semana" v={-fin.gastosPagados} />
        <FilaFin l="Flujo de caja de la semana" v={fin.flujoCaja} fuerte borde />
        {cobrosSemana.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Cobros de la semana</div>
            {cobrosSemana.map((c) => <div key={c.id} className="flex flex-wrap gap-2 text-xs text-slate-500"><span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{dinero(c.monto)}</span><span>{c.fecha}</span>{c.referencia && <span>· {c.referencia}</span>}{c.responsable && <span>· {c.responsable}</span>}</div>)}
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-400">Separa lo devengado (ingreso/costo de la semana ganada) de lo cobrado/pagado (caja). Fast Pay: la ganancia del driver va completa como costo y la comisión como ingreso aparte — nunca se descuenta dos veces.</p>

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
      onCerrar()
    } finally { setGuardando(false) }
  }
  return (
    <Modal titulo="Registrar cobro de Walmart" onCerrar={onCerrar}>
      <Grid>
        <F label="Fecha"><Input type="date" value={c.fecha} onChange={(e) => set('fecha', e.target.value)} /></F>
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
function pdfPayStub(driver, semana, hasta, res) {
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

// ── CONTRATOS ───────────────────────────────────────────────────────────────
function pdfContrato(c, firmado) {
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
  useEffect(() => { if (driver) setDatos(datosDeDriver(driver, almNombre, 'B&A American Group LLC', tarifas.pagoDriverPropio)); else setDatos({}); setLink('') }, [driverId]) // eslint-disable-line
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
