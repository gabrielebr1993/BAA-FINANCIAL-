// ============================================================================
// WAREHOUSE · Módulo independiente de servicios de almacén (PRIVADO, real).
//
// Servicios que ofrece la empresa: clasificación/sorteo de paquetes, personal
// (staffing), manejo INBOUND (recepción) y OUTBOUND (despacho), almacenaje y
// cross-dock. Mismo patrón que Ecommerce: módulo separado, colecciones con
// prefijo wh_, acceso PRIVADO del dueño (correo verificado, también en
// firestore.rules). Módulo REAL: staffing con Gofo, tarifas, finanzas y cheques.
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { esDuenoEcom } from '../ecommerce/datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, Cargando, EstadoVacio } from '../components/ui'
import { Warehouse, ArrowLeft, Lock, LogOut, LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, Users, Boxes, Plus, Trash2, Gauge, FileSpreadsheet, UserRound, DollarSign, BarChart3, Banknote, Printer, Menu, X } from 'lucide-react'
import WhPanelStaff from './staffing/WhPanelStaff'
import WhStaffing from './staffing/WhStaffing'
import WhTrabajadores from './staffing/WhTrabajadores'
import WhTarifas from './staffing/WhTarifas'
import WhFinanzasStaff from './staffing/WhFinanzasStaff'
import WhCheques from './staffing/WhCheques'
import WhPrintCheck from './staffing/printcheck/WhPrintCheck'
import '../styles/cloudmotion.css'

async function auditarWh(accion, detalle) {
  try {
    await addDoc(collection(db, 'wh_audit'), { accion, detalle: detalle || '', correo: auth.currentUser?.email || '', fecha: serverTimestamp() })
  } catch { /* nunca bloquea */ }
}
const cargarCol = async (col) => {
  const snap = await getDocs(collection(db, col))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const ESTADOS_IN = ['programado', 'recibido', 'clasificado', 'almacenado']
const ESTADOS_OUT = ['preparando', 'listo', 'despachado', 'entregado']
const ROLES_STAFF = ['Clasificador', 'Empacador', 'Montacarguista', 'Supervisor', 'Inventario']


const SERVICIOS = [
  { icono: '🔀', nombre: 'Clasificación y sorteo', desc: 'Sorting de paquetes por ruta, zona o cliente, con escaneo y conteo verificado.', estado: 'Incluido' },
  { icono: '👷', nombre: 'Staffing (personal)', desc: 'Clasificadores, empacadores, montacarguistas y supervisores por turno, a tu medida.', estado: 'Incluido' },
  { icono: '📥', nombre: 'Inbound (recepción)', desc: 'Citas, descarga, verificación contra manifiesto y reporte de diferencias.', estado: 'Incluido' },
  { icono: '📤', nombre: 'Outbound (despacho)', desc: 'Preparación, carga, manifiesto de salida y entrega al transportista.', estado: 'Incluido' },
  { icono: '🏗️', nombre: 'Almacenaje', desc: 'Posiciones de pallet y estantería con control de entradas/salidas.', estado: 'Incluido' },
  { icono: '🔁', nombre: 'Cross-dock', desc: 'Del camión de entrada al de salida sin almacenar: mismo día.', estado: 'Incluido' },
  { icono: '🛒', nombre: 'Fulfillment ecommerce', desc: 'Pick & pack por pedido para el módulo Ecommerce y marcas externas.', estado: 'Próximamente' },
]

const TABS = [
  { id: 'resumen', label: 'Resumen', icono: LayoutDashboard },
  { id: 'panel', label: 'Dashboard', icono: Gauge },
  { id: 'gofo', label: 'Staffing Gofo', icono: FileSpreadsheet },
  { id: 'trabajadores', label: 'Trabajadores', icono: UserRound },
  { id: 'tarifas', label: 'Mis tarifas', icono: DollarSign },
  { id: 'finanzas', label: 'Finanzas', icono: BarChart3 },
  { id: 'cheques', label: 'Cheques', icono: Banknote },
  { id: 'printcheck', label: 'Print Check', icono: Printer },
  { id: 'servicios', label: 'Servicios', icono: Boxes },
  { id: 'inbound', label: 'Inbound', icono: ArrowDownToLine },
  { id: 'outbound', label: 'Outbound', icono: ArrowUpFromLine },
  { id: 'personal', label: 'Personal', icono: Users },
]

export default function WhApp() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setCargando(false) }), [])
  if (cargando) return <div className="grid min-h-screen place-items-center bg-slate-950"><Cargando texto="Cargando Warehouse…" /></div>
  if (!user) return <WhLogin onVolver={() => navigate('/elegir')} />
  if (!esDuenoEcom(user.email)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-slate-500 dark:bg-slate-700"><Lock size={24} /></div>
          <div className="text-lg font-bold text-brand-navy dark:text-slate-100">Sin acceso</div>
          <p className="mt-2 text-sm text-slate-500">Tu cuenta no tiene acceso al módulo Warehouse. Pide acceso al dueño de la cuenta.</p>
          <Boton variant="ghost" className="mt-5" onClick={() => navigate('/elegir')}><ArrowLeft size={15} /> Volver</Boton>
        </Card>
      </div>
    )
  }
  return <WhShell user={user} />
}

function WhLogin({ onVolver }) {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)
  const entrar = async (e) => {
    e.preventDefault(); setError(''); setEntrando(true)
    try { await signInWithEmailAndPassword(auth, correo.trim(), clave) } catch { setError('Correo o contraseña incorrectos.') } finally { setEntrando(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2 text-xl font-black text-brand-navy dark:text-slate-100"><Warehouse size={20} /> Warehouse</div>
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-violet-500">Operación de almacén</div>
        <form onSubmit={entrar} className="space-y-3">
          <Input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          <Input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton type="submit" variant="gold" disabled={entrando} className="w-full">{entrando ? <Spinner /> : 'Entrar'}</Boton>
        </form>
        <button onClick={onVolver} className="mt-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ArrowLeft size={13} /> Volver al selector</button>
      </Card>
    </div>
  )
}

function WhShell({ user }) {
  const navigate = useNavigate()
  // La pestaña activa vive en el hash de la URL (/wh#tarifas) para que
  // recargar con F5 te deje en la misma página y no en el Resumen.
  const [tab, setTabEstado] = useState(() => {
    const h = (window.location.hash || '').replace('#', '')
    return TABS.some((t) => t.id === h) ? h : 'resumen'
  })
  const [menuAbierto, setMenuAbierto] = useState(false) // cajón lateral (móvil/plegable)
  const setTab = (id) => {
    setTabEstado(id)
    setMenuAbierto(false) // al elegir, se cierra el cajón
    try { window.history.replaceState(null, '', '#' + id) } catch { /* sin historial */ }
  }
  const tabActual = TABS.find((t) => t.id === tab)
  // "abrir el perfil de este trabajador" desde cualquier pestaña (p. ej. al
  // tocar un nombre en Print Check): evento global → pestaña Trabajadores.
  const [perfilPedido, setPerfilPedido] = useState(null)
  useEffect(() => {
    const h = (e) => { if (e.detail) { setPerfilPedido({ id: e.detail, t: Date.now() }); setTab('trabajadores') } }
    window.addEventListener('wh-abrir-perfil', h)
    return () => window.removeEventListener('wh-abrir-perfil', h)
  }, [])
  return (
    <div className="flex min-h-screen bg-surface dark:bg-surface-dark">
      {/* ── MENÚ LATERAL en escritorio: mismo estilo que el módulo de
             Paquetería (sidebar blanco, ítem activo con píldora dorada) ── */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex dark:border-slate-700/60 dark:bg-surface-dark-card">
        <div className="flex items-center gap-3 px-1 pb-3 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
          <div>
            <div className="text-lg font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Warehouse</div>
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
          {TABS.map((tdef) => {
            const Icono = tdef.icono
            const activo = tab === tdef.id
            return (
              <button key={tdef.id} onClick={() => setTab(tdef.id)}
                className={`group relative flex items-center gap-3 rounded-xl border-l-2 py-2.5 pl-3 pr-3 text-left text-sm transition-all duration-150 ${
                  activo
                    ? 'border-transparent bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white'
                    : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40 dark:hover:text-white'
                }`}>
                <Icono size={19} strokeWidth={1.8} className="flex-shrink-0" />
                <span className="flex-1">{tdef.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700/60">
          <div className="truncate px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{user.email}</div>
          <div className="px-1 text-[11px] text-slate-400">usuario · dueño</div>
          <button onClick={() => navigate('/elegir')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40">
            <ArrowLeft size={15} /> Cambiar de módulo
          </button>
          <button onClick={() => signOut(auth)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-700/40">
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="cm-scope min-w-0 flex-1">
        {/* Cloud Motion igual que en el módulo de paquetería: nubes pastel muy
            suaves detrás del contenido, nunca sobre el menú lateral. */}
        <div className="cm-nubes" aria-hidden="true"><span className="cm-n1" /><span className="cm-n2" /><span className="cm-n3" /></div>
        {/* Barra superior SOLO en pantallas sin sidebar fijo (móvil / plegable
            cerrado): hamburguesa que abre el MENÚ LATERAL + sección actual */}
        <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200/70 bg-white/80 px-4 py-2.5 backdrop-blur md:hidden dark:border-slate-700/60 dark:bg-slate-900/80"
          style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setMenuAbierto(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title="Abrir menú"><Menu size={20} /></button>
          <div className="flex items-center gap-2 font-black text-brand-navy dark:text-slate-100">
            {tabActual?.icono ? <tabActual.icono size={18} /> : null}
            <span className="text-base">{tabActual?.label || 'Warehouse'}</span>
          </div>
          <button onClick={() => signOut(auth)} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title="Cerrar sesión"><LogOut size={16} /></button>
        </div>

        {/* CAJÓN lateral deslizable (móvil / plegable en cualquier posición) */}
        {menuAbierto && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMenuAbierto(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-1 border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700/60 dark:bg-surface-dark-card"
              style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center gap-3 px-1 pb-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
                <div className="flex-1">
                  <div className="text-lg font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
                  <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Warehouse</div>
                </div>
                <button onClick={() => setMenuAbierto(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {TABS.map((tdef) => {
                  const Icono = tdef.icono
                  const activo = tab === tdef.id
                  return (
                    <button key={tdef.id} onClick={() => setTab(tdef.id)}
                      className={`flex items-center gap-3 rounded-xl py-3 pl-3 pr-3 text-left text-sm transition ${activo ? 'bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-300 dark:hover:bg-slate-700/40'}`}>
                      <Icono size={19} strokeWidth={1.8} className="flex-shrink-0" />
                      <span className="flex-1">{tdef.label}</span>
                    </button>
                  )
                })}
              </nav>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700/60">
                <div className="truncate px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{user.email}</div>
                <div className="px-1 text-[11px] text-slate-400">usuario · dueño</div>
                <button onClick={() => navigate('/elegir')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <ArrowLeft size={15} /> Cambiar de módulo
                </button>
              </div>
            </aside>
          </div>
        )}
        <div className="max-w-full py-4 sm:py-6 lg:py-8"
          style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {tab === 'resumen' && <WhResumen irA={setTab} />}
        {tab === 'panel' && <WhPanelStaff irA={setTab} />}
        {tab === 'gofo' && <WhStaffing user={user} />}
        {tab === 'trabajadores' && <WhTrabajadores user={user} perfilInicial={perfilPedido} />}
        {tab === 'tarifas' && <WhTarifas user={user} />}
        {tab === 'finanzas' && <WhFinanzasStaff user={user} />}
        {tab === 'cheques' && <WhCheques user={user} />}
        {tab === 'printcheck' && <WhPrintCheck user={user} />}
        {tab === 'servicios' && <WhServicios />}
        {tab === 'inbound' && <WhTabla col="wh_inbound" titulo="Inbound (recepciones)" estados={ESTADOS_IN}
          campos={[['ref', 'Referencia'], ['cliente', 'Cliente / marca'], ['tipo', 'Tipo (cajas/pallets/paquetes)'], ['unidades', 'Unidades'], ['notas', 'Notas']]} />}
        {tab === 'outbound' && <WhTabla col="wh_outbound" titulo="Outbound (despachos)" estados={ESTADOS_OUT}
          campos={[['ref', 'Referencia'], ['destino', 'Destino'], ['transportista', 'Transportista'], ['unidades', 'Unidades']]} />}
        {tab === 'personal' && <WhPersonal />}
        </div>
      </div>
    </div>
  )
}

function WhResumen({ irA }) {
  const [n, setN] = useState(null)
  useEffect(() => { (async () => {
    try {
      const [a, b, c, periodos, workers, cheques] = await Promise.all([
        cargarCol('wh_inbound'), cargarCol('wh_outbound'), cargarCol('wh_staff'),
        cargarCol('wh_staff_periodos'), cargarCol('wh_workers'), cargarCol('wh_cheques'),
      ])
      const ult = periodos.sort((x, y) => String(x.inicio || '').localeCompare(y.inicio || '')).slice(-1)[0] || null
      setN({
        inb: a.length,
        out: b.length,
        staff: c.filter((x) => x.activo).length,
        semanas: periodos.length,
        trabajadores: workers.filter((w) => !w.fusionadoEn).length,
        chequesPend: cheques.filter((x) => x.estado === 'emitido').length,
        ult,
      })
    } catch { setN({ inb: 0, out: 0, staff: 0, semanas: 0, trabajadores: 0, chequesPend: 0, ult: null }) }
  })() }, [])
  const dinero = (x) => (x === null || x === undefined ? '—' : `$${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  const v = (x) => (n ? x : '…')
  // Accesos grandes a cada área (misma lógica visual del módulo de Paquetería)
  const AREAS = [
    { id: 'panel', icono: Gauge, t: 'Dashboard', d: 'KPIs, tendencia semanal y recomendaciones de JARVIS sobre tus números.' },
    { id: 'gofo', icono: FileSpreadsheet, t: 'Staffing Gofo', d: 'Sube el libro semanal: vista previa, candados antiduplicado y confirmación.' },
    { id: 'trabajadores', icono: UserRound, t: 'Trabajadores', d: 'Perfiles únicos con ID (工号), historial, alias, grupo y excepciones.' },
    { id: 'tarifas', icono: DollarSign, t: 'Mis tarifas', d: 'Tarifas por posición, grupos de pago, regla de OT y mapeo de posiciones.' },
    { id: 'finanzas', icono: BarChart3, t: 'Finanzas', d: 'Ingreso vs cobrado, pagos vs pagado, gastos fijos y utilidad por semana.' },
    { id: 'cheques', icono: Banknote, t: 'Cheques', d: 'Emisión + reporte bancario: conciliación sin pagos dobles.' },
    { id: 'inbound', icono: ArrowDownToLine, t: 'Inbound', d: 'Recepciones: cita, descarga, verificación y almacenaje.' },
    { id: 'outbound', icono: ArrowUpFromLine, t: 'Outbound', d: 'Despachos: preparación, carga y entrega al transportista.' },
  ]
  return (
    <div>
      <PageTitle>Resumen del almacén</PageTitle>
      <p className="-mt-2 mb-4 text-sm text-slate-500 dark:text-slate-400">Staffing con Gofo (reportes, tarifas, finanzas y cheques) + servicios de almacén: clasificación, inbound, outbound, almacenaje y cross-dock.</p>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Semanas importadas</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{v(n?.semanas)}</div>{n?.ult && <div className="text-[11px] text-slate-400">última: {n.ult.inicio}</div>}</Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Trabajadores</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{v(n?.trabajadores)}</div><div className="text-[11px] text-slate-400">perfiles únicos</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Ingreso última semana</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{n ? (n.ult ? dinero(n.ult.totales?.ingresoGofo) : '—') : '…'}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Cheques por cobrar</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{v(n?.chequesPend)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Recepciones (inbound)</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{v(n?.inb)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Despachos (outbound)</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{v(n?.out)}</div></Card>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {AREAS.map((a2) => (
          <Card key={a2.id} className="cursor-pointer p-5 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => irA(a2.id)}>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-brand-navy dark:bg-slate-700/50 dark:text-slate-100"><a2.icono size={19} strokeWidth={1.8} /></div>
            <div className="mb-1 text-[15px] font-bold text-brand-navy dark:text-slate-100">{a2.t}</div>
            <div className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{a2.d}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-2 font-bold text-brand-navy dark:text-slate-100">Por dónde empezar</div>
        <div className="flex flex-wrap gap-2">
          <Boton variant="gold" onClick={() => irA('gofo')}>Importar el reporte de Gofo</Boton>
          <Boton variant="ghost" onClick={() => irA('tarifas')}>Configurar mis tarifas</Boton>
          <Boton variant="ghost" onClick={() => irA('servicios')}>Ver los servicios que ofreces</Boton>
          <Boton variant="ghost" onClick={() => irA('personal')}>Armar tu plantilla</Boton>
        </div>
      </Card>
    </div>
  )
}

function WhServicios() {
  return (
    <div>
      <PageTitle>Servicios del almacén</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICIOS.map((s) => (
          <Card key={s.nombre} className="p-4">
            <div className="text-3xl">{s.icono}</div>
            <div className="mt-1.5 flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">{s.nombre}
              <Badge color={s.estado === 'Incluido' ? 'green' : 'gold'}>{s.estado}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">{s.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

// Tabla genérica para Inbound/Outbound: crear, avanzar estado y borrar.
function WhTabla({ col, titulo, estados, campos }) {
  const [filas, setFilas] = useState(null)
  const [form, setForm] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const recargar = async () => setFilas(await cargarCol(col))
  useEffect(() => { recargar() }, [col])
  const sembrar = async () => {
    setTrabajando(true)
    try {
      for (const d of demo) await addDoc(collection(db, col), { ...d, demo: true, creadoEn: serverTimestamp() })
      auditarWh('demo_sembrada', col)
      await recargar()
    } finally { setTrabajando(false) }
  }
  const crear = async () => {
    if (!form.ref?.trim()) return window.alert('Ponle una referencia.')
    await addDoc(collection(db, col), { ...form, unidades: Number(form.unidades) || 0, estado: estados[0], creadoEn: serverTimestamp() })
    auditarWh('registro_creado', `${col} · ${form.ref}`)
    setForm(null); await recargar()
  }
  const avanzar = async (f) => {
    const i = estados.indexOf(f.estado)
    if (i < 0 || i >= estados.length - 1) return
    await updateDoc(doc(db, col, f.id), { estado: estados[i + 1] })
    auditarWh('estado_avanzado', `${col} · ${f.ref} → ${estados[i + 1]}`)
    await recargar()
  }
  const borrar = async (f) => {
    if (!window.confirm(`¿Eliminar ${f.ref}?`)) return
    await deleteDoc(doc(db, col, f.id))
    await recargar()
  }
  if (!filas) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={
        <>
          <Boton variant="gold" onClick={() => setForm(Object.fromEntries(campos.map(([k]) => [k, ''])))}><Plus size={15} /> Nuevo</Boton>
        </>
      }>{titulo}</PageTitle>
      {filas.length === 0 ? <EstadoVacio titulo="Sin registros" texto="Siembra la demo o crea el primero." /> : (
        <div className="space-y-2.5">
          {filas.map((f) => {
            const i = estados.indexOf(f.estado)
            return (
              <Card key={f.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-brand-navy dark:text-slate-100">{f.ref}</b>
                  <Badge color={i === estados.length - 1 ? 'green' : 'slate'}>{f.estado}</Badge>
                  <span className="text-xs text-slate-500">{f.cliente || f.destino} · {f.unidades} unidades {f.transportista ? `· ${f.transportista}` : ''} {f.notas ? `· ${f.notas}` : ''}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {i < estados.length - 1 && <Boton variant="ghost" onClick={() => avanzar(f)}>Avanzar a: {estados[i + 1]}</Boton>}
                    <button onClick={() => borrar(f)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
                  </span>
                </div>
                {/* Línea de progreso del flujo */}
                <div className="mt-2.5 flex gap-1.5">
                  {estados.map((e, j) => <span key={e} title={e} className={`h-1.5 flex-1 rounded-full ${j <= i ? 'bg-brand-gold' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {form && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-brand-navy dark:text-slate-100">Nuevo registro</div>
            <div className="space-y-2.5 text-sm">
              {campos.map(([k, label]) => (
                <label key={k}>{label}<Input value={form[k] ?? ''} onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))} /></label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={crear}>Guardar</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WhPersonal() {
  const [filas, setFilas] = useState(null)
  const [form, setForm] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const recargar = async () => setFilas(await cargarCol('wh_staff'))
  useEffect(() => { recargar() }, [])
  const sembrar = async () => {
    setTrabajando(true)
    try {
      for (const d of DEMO_STAFF) await addDoc(collection(db, 'wh_staff'), { ...d, demo: true, creadoEn: serverTimestamp() })
      auditarWh('demo_sembrada', 'wh_staff')
      await recargar()
    } finally { setTrabajando(false) }
  }
  const crear = async () => {
    if (!form.nombre?.trim()) return
    await addDoc(collection(db, 'wh_staff'), { ...form, activo: true, creadoEn: serverTimestamp() })
    auditarWh('staff_creado', form.nombre)
    setForm(null); await recargar()
  }
  const alternar = async (f) => { await updateDoc(doc(db, 'wh_staff', f.id), { activo: !f.activo }); await recargar() }
  const borrar = async (f) => { if (window.confirm(`¿Eliminar a ${f.nombre}?`)) { await deleteDoc(doc(db, 'wh_staff', f.id)); await recargar() } }
  if (!filas) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={
        <>
          <Boton variant="gold" onClick={() => setForm({ nombre: '', rol: ROLES_STAFF[0], turno: 'AM' })}><Plus size={15} /> Agregar persona</Boton>
        </>
      }>Personal del almacén (staffing)</PageTitle>
      {filas.length === 0 ? <EstadoVacio titulo="Sin personal" texto="Arma tu plantilla: clasificadores, empacadores, montacarguistas y supervisores." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filas.map((f) => (
            <Card key={f.id} className={`p-4 ${!f.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{f.nombre}</b>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{f.rol} · turno {f.turno}</div>
              <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-700/60">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={!!f.activo} onChange={() => alternar(f)} /> Activo</label>
                <button onClick={() => borrar(f)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {form && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-brand-navy dark:text-slate-100">Agregar persona</div>
            <div className="space-y-2.5 text-sm">
              <label>Nombre<Input value={form.nombre} onChange={(e) => setForm((x) => ({ ...x, nombre: e.target.value }))} /></label>
              <label>Rol
                <Select value={form.rol} onChange={(e) => setForm((x) => ({ ...x, rol: e.target.value }))}>
                  {ROLES_STAFF.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </label>
              <label>Turno
                <Select value={form.turno} onChange={(e) => setForm((x) => ({ ...x, turno: e.target.value }))}>
                  <option value="AM">AM</option><option value="PM">PM</option><option value="Nocturno">Nocturno</option>
                </Select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={crear}>Guardar</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
