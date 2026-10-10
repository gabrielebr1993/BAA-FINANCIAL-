// ============================================================================
// WAREHOUSE · Módulo independiente de servicios de almacén (EN CONSTRUCCIÓN).
//
// Servicios que ofrece la empresa: clasificación/sorteo de paquetes, personal
// (staffing), manejo INBOUND (recepción) y OUTBOUND (despacho), almacenaje y
// cross-dock. Mismo patrón que Ecommerce: módulo separado, colecciones con
// prefijo wh_, acceso PRIVADO del dueño (correo verificado, también en
// firestore.rules) y datos de DEMOSTRACIÓN marcados — nada real todavía.
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { esDuenoEcom } from '../ecommerce/datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, Cargando, EstadoVacio } from '../components/ui'
import { Warehouse, ArrowLeft, Lock, LogOut, LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, Users, Boxes, Plus, Trash2, Sparkles } from 'lucide-react'

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

const DEMO_IN = [
  { ref: 'IN-1001', cliente: 'Marca de ropa (demo)', tipo: 'Cajas', unidades: 420, estado: 'recibido', notas: 'Llegó completo' },
  { ref: 'IN-1002', cliente: 'Electrónica LATAM (demo)', tipo: 'Pallets', unidades: 12, estado: 'clasificado', notas: '2 pallets frágiles' },
  { ref: 'IN-1003', cliente: 'Ecommerce MilePay (demo)', tipo: 'Paquetes', unidades: 260, estado: 'programado', notas: 'Cita martes 9am' },
]
const DEMO_OUT = [
  { ref: 'OUT-2001', destino: 'Tienda Centro (demo)', transportista: 'Flota propia', unidades: 180, estado: 'listo' },
  { ref: 'OUT-2002', destino: 'Cliente mayorista (demo)', transportista: 'Courier aliado', unidades: 36, estado: 'despachado' },
]
const DEMO_STAFF = [
  { nombre: 'Operador Demo 1', rol: 'Clasificador', turno: 'AM', activo: true },
  { nombre: 'Operador Demo 2', rol: 'Montacarguista', turno: 'PM', activo: true },
  { nombre: 'Supervisor Demo', rol: 'Supervisor', turno: 'AM', activo: true },
]

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
          <div className="text-lg font-bold text-brand-navy dark:text-slate-100">Módulo en construcción</div>
          <p className="mt-2 text-sm text-slate-500">Warehouse todavía no está disponible. Muy pronto: clasificación, staffing e inbound/outbound gestionados por MilePay.</p>
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
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-violet-500">En construcción · acceso privado</div>
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
  const [tab, setTab] = useState('resumen')
  return (
    <div className="min-h-screen bg-surface dark:bg-surface-dark">
      <div className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5">
          <button onClick={() => navigate('/elegir')} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar de módulo"><ArrowLeft size={16} /></button>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black text-brand-navy dark:text-slate-100">Warehouse</span>
            <Badge color="gold">En construcción</Badge>
            <Badge color="slate">Privado · solo dueño</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">{user.email}</span>
            <button onClick={() => signOut(auth)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title="Cerrar sesión"><LogOut size={15} /></button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((tdef) => {
            const Icono = tdef.icono
            return (
              <button key={tdef.id} onClick={() => setTab(tdef.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${tab === tdef.id ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Icono size={14} /> {tdef.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-5">
        {tab === 'resumen' && <WhResumen irA={setTab} />}
        {tab === 'servicios' && <WhServicios />}
        {tab === 'inbound' && <WhTabla col="wh_inbound" titulo="Inbound (recepciones)" estados={ESTADOS_IN} demo={DEMO_IN}
          campos={[['ref', 'Referencia'], ['cliente', 'Cliente / marca'], ['tipo', 'Tipo (cajas/pallets/paquetes)'], ['unidades', 'Unidades'], ['notas', 'Notas']]} />}
        {tab === 'outbound' && <WhTabla col="wh_outbound" titulo="Outbound (despachos)" estados={ESTADOS_OUT} demo={DEMO_OUT}
          campos={[['ref', 'Referencia'], ['destino', 'Destino'], ['transportista', 'Transportista'], ['unidades', 'Unidades']]} />}
        {tab === 'personal' && <WhPersonal />}
      </div>
    </div>
  )
}

function WhResumen({ irA }) {
  const [n, setN] = useState({ inb: '…', out: '…', staff: '…' })
  useEffect(() => { (async () => {
    try {
      const [a, b, c] = await Promise.all([cargarCol('wh_inbound'), cargarCol('wh_outbound'), cargarCol('wh_staff')])
      setN({ inb: a.length, out: b.length, staff: c.filter((x) => x.activo).length })
    } catch { setN({ inb: 0, out: 0, staff: 0 }) }
  })() }, [])
  return (
    <div>
      <PageTitle>Resumen del almacén</PageTitle>
      <Aviso tipo="warn" className="mb-4"><b>Módulo en construcción con datos de DEMOSTRACIÓN.</b> Aquí se gestionarán los servicios de almacén que ofrece tu empresa: clasificación, staffing, inbound, outbound, almacenaje y cross-dock. Solo tu cuenta puede entrar.</Aviso>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Recepciones (inbound)</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{n.inb}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Despachos (outbound)</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{n.out}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Personal activo</div><div className="text-2xl font-black text-brand-navy dark:text-slate-100">{n.staff}</div></Card>
      </div>
      <Card className="p-5">
        <div className="mb-2 font-bold text-brand-navy dark:text-slate-100">Por dónde empezar</div>
        <div className="flex flex-wrap gap-2">
          <Boton variant="gold" onClick={() => irA('servicios')}>Ver los servicios que ofreces</Boton>
          <Boton variant="ghost" onClick={() => irA('inbound')}>Registrar una recepción</Boton>
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

// Tabla genérica para Inbound/Outbound: crear, avanzar estado, borrar, sembrar demo.
function WhTabla({ col, titulo, estados, demo, campos }) {
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
    await addDoc(collection(db, col), { ...form, unidades: Number(form.unidades) || 0, estado: estados[0], demo: true, creadoEn: serverTimestamp() })
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
          {filas.length === 0 && <Boton variant="ghost" onClick={sembrar} disabled={trabajando}>{trabajando ? <Spinner /> : <Sparkles size={15} />} Sembrar demo</Boton>}
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
                  {f.demo && <Badge color="gold">DEMO</Badge>}
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
    await addDoc(collection(db, 'wh_staff'), { ...form, activo: true, demo: true, creadoEn: serverTimestamp() })
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
          {filas.length === 0 && <Boton variant="ghost" onClick={sembrar} disabled={trabajando}>{trabajando ? <Spinner /> : <Sparkles size={15} />} Sembrar demo</Boton>}
          <Boton variant="gold" onClick={() => setForm({ nombre: '', rol: ROLES_STAFF[0], turno: 'AM' })}><Plus size={15} /> Agregar persona</Boton>
        </>
      }>Personal del almacén (staffing)</PageTitle>
      {filas.length === 0 ? <EstadoVacio titulo="Sin personal" texto="Arma tu plantilla: clasificadores, empacadores, montacarguistas y supervisores." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filas.map((f) => (
            <Card key={f.id} className={`p-4 ${!f.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{f.nombre}</b>
                {f.demo && <Badge color="gold">DEMO</Badge>}
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
