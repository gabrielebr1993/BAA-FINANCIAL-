// ============================================================================
// MÓDULO AUTOASIGNACIÓN (Fase 1) · El "cerebro" + la cola de órdenes.
//
// Arma el plan de reparto de paquetes por ruta (motorAuto), lo validas y lo
// apruebas en 3 pasos: Proponer → Guardar borrador → Confirmar y DAR LA ORDEN.
// Al dar la orden, queda en la cola `auto_ordenes` con estado 'pendiente', lista
// para que el AGENTE (Fase 2) la ejecute en GOFO. Este módulo NO toca GOFO.
//
// Solo el dueño entra (igual que Warehouse). Colecciones: auto_rutas, auto_ordenes.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { esDuenoEcom } from '../ecommerce/datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import { Target, ArrowLeft, Lock, Plus, Trash2, Send, Save, ListChecks, Route as RouteIcon, RefreshCw } from 'lucide-react'
import { distribuir, planValido, huellaOrden } from './motorAuto'

const money = (n) => (Number(n) || 0).toLocaleString('en-US')
const COL_RUTAS = 'auto_rutas'
const COL_ORDENES = 'auto_ordenes'

export default function AutoAsignApp() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setCargando(false) }), [])
  if (cargando) return <div className="grid min-h-screen place-items-center bg-slate-950"><Spinner /></div>
  if (!user) return <AutoLogin onVolver={() => navigate('/elegir')} />
  if (!esDuenoEcom(user.email)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-slate-500 dark:bg-slate-700"><Lock size={24} /></div>
          <div className="text-lg font-bold text-brand-navy dark:text-slate-100">Sin acceso</div>
          <p className="mt-2 text-sm text-slate-500">Tu cuenta no tiene acceso a Autoasignación. Pide acceso al dueño.</p>
          <Boton variant="ghost" className="mt-5" onClick={() => navigate('/elegir')}><ArrowLeft size={15} /> Volver</Boton>
        </Card>
      </div>
    )
  }
  return <AutoShell user={user} onVolver={() => navigate('/elegir')} />
}

function AutoLogin({ onVolver }) {
  const [correo, setCorreo] = useState(''); const [clave, setClave] = useState('')
  const [error, setError] = useState(''); const [entrando, setEntrando] = useState(false)
  const entrar = async (e) => {
    e.preventDefault(); setError(''); setEntrando(true)
    try { await signInWithEmailAndPassword(auth, correo.trim(), clave) } catch { setError('Correo o contraseña incorrectos.') } finally { setEntrando(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2 text-xl font-black text-brand-navy dark:text-slate-100"><Target size={20} /> Autoasignación</div>
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-brand-gold">Reparto de rutas supervisado</div>
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

const TABS = [
  { id: 'nueva', label: 'Nueva asignación', icono: Target },
  { id: 'rutas', label: 'Rutas', icono: RouteIcon },
  { id: 'ordenes', label: 'Órdenes', icono: ListChecks },
]

function AutoShell({ user, onVolver }) {
  const [tab, setTab] = useState('nueva')
  const [rutas, setRutas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  useEffect(() => onSnapshot(collection(db, COL_RUTAS), (s) => setRutas(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [])
  useEffect(() => onSnapshot(query(collection(db, COL_ORDENES), orderBy('creadoEn', 'desc')), (s) => setOrdenes(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [])
  const pendientes = ordenes.filter((o) => o.estado === 'pendiente').length

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-surface-card px-4 py-3 dark:border-slate-800 dark:bg-surface-dark-card">
        <button onClick={onVolver} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar de módulo"><ArrowLeft size={16} /></button>
        <span className="flex items-center gap-2 text-lg font-black text-brand-navy dark:text-slate-100"><Target size={18} className="text-brand-gold" /> Autoasignación</span>
        <nav className="ml-2 flex flex-wrap gap-1.5">
          {TABS.map((td) => (
            <button key={td.id} onClick={() => setTab(td.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${tab === td.id ? 'bg-slate-100 text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <td.icono size={14} /> {td.label}
              {td.id === 'ordenes' && pendientes > 0 && <span className="rounded-full bg-brand-gold px-1.5 text-[10px] font-bold text-brand-navy">{pendientes}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">
        {tab === 'nueva' && <TabNueva rutas={rutas} user={user} irARutas={() => setTab('rutas')} />}
        {tab === 'rutas' && <TabRutas rutas={rutas} user={user} />}
        {tab === 'ordenes' && <TabOrdenes ordenes={ordenes} />}
      </main>
    </div>
  )
}

// ── NUEVA ASIGNACIÓN ────────────────────────────────────────────────────────
function TabNueva({ rutas, user, irARutas }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [rutaId, setRutaId] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [total, setTotal] = useState('')
  const [fijas, setFijas] = useState({}) // nombre → cantidad fija
  const [propuesto, setPropuesto] = useState(false)
  const [borradorId, setBorradorId] = useState(null) // id de la orden guardada (paso 2)
  const [paso, setPaso] = useState(1) // 1 proponer · 2 guardar · 3 confirmar
  const [msg, setMsg] = useState(null)
  const [trabajando, setTrabajando] = useState('')

  const ruta = rutas.find((r) => r.id === rutaId)
  const conductores = useMemo(() => (ruta?.conductores || []).map((c) => ({ ...c, fija: fijas[c.nombre] })), [ruta, fijas])
  const plan = useMemo(() => (ruta && total ? distribuir(total, conductores, { zip: !!ruta.metodoZip }) : null), [ruta, total, conductores])
  const valido = planValido(plan)

  const reset = () => { setPropuesto(false); setBorradorId(null); setPaso(1); setMsg(null) }
  const cambiar = (fn) => { reset(); fn() }

  const proponer = () => {
    if (!ruta) { setMsg({ t: 'error', x: 'Elige una ruta primero.' }); return }
    if (!plan || plan.total <= 0) { setMsg({ t: 'error', x: 'Escribe el total de paquetes.' }); return }
    setPropuesto(true)
    if (valido) { setPaso(2); setMsg(null) } else setMsg({ t: 'error', x: plan.excedeCap ? 'El total no cabe en las capacidades: ajusta cantidades o capacidades.' : `Faltan por asignar ${money(plan.faltante)} paquetes.` })
  }

  const ordenBase = () => ({
    fecha, almacen: ruta.almacen || '', ruta: ruta.code || ruta.id, rutaNombre: ruta.nombre || '',
    total: plan.total, metodoZip: !!ruta.metodoZip,
    lineas: plan.lineas.filter((l) => l.cantidad > 0).map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, fija: l.fija || 0, rangoDesde: l.rangoDesde, rangoHasta: l.rangoHasta, capacidadMax: l.capacidadMax })),
  })

  const guardar = async () => {
    if (!valido) return
    setTrabajando('save'); setMsg(null)
    try {
      const base = ordenBase()
      const id = `ord_${base.fecha}_${base.ruta}_${huellaOrden(base)}`
      await setDoc(doc(db, COL_ORDENES, id), { ...base, huella: huellaOrden(base), estado: 'borrador', creadoEn: serverTimestamp(), creadoPor: user.email }, { merge: true })
      setBorradorId(id); setPaso(3)
      setMsg({ t: 'ok', x: 'Borrador guardado. Revisa y confirma para dar la orden.' })
    } catch (e) { setMsg({ t: 'error', x: 'No se pudo guardar: ' + (e.message || e) }) } finally { setTrabajando('') }
  }

  const confirmar = async () => {
    if (!borradorId) return
    if (!window.confirm('Segunda aprobación: ¿CONFIRMAR y DAR LA ORDEN? Quedará en la cola para ejecutarse una sola vez.')) return
    setTrabajando('conf'); setMsg(null)
    try {
      await setDoc(doc(db, COL_ORDENES, borradorId), { estado: 'pendiente', confirmadoEn: serverTimestamp(), confirmadoPor: user.email }, { merge: true })
      setMsg({ t: 'ok', x: '✓ Orden dada. Está en la cola (Órdenes), lista para ejecutarse en GOFO.' })
      setPaso(4)
    } catch (e) { setMsg({ t: 'error', x: 'No se pudo confirmar: ' + (e.message || e) }) } finally { setTrabajando('') }
  }

  if (!rutas.length) {
    return <Aviso tipo="info">Primero configura una ruta con sus conductores y capacidades en la pestaña <b>Rutas</b>. <button className="font-semibold text-brand-gold underline" onClick={irARutas}>Ir a Rutas</button>.</Aviso>
  }

  return (
    <div>
      <PageTitle>Nueva asignación</PageTitle>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Fecha"><Input type="date" value={fecha} onChange={(e) => cambiar(() => setFecha(e.target.value))} /></Campo>
          <Campo label="Ruta"><Select value={rutaId} onChange={(e) => cambiar(() => { setRutaId(e.target.value); setFijas({}) })}>
            <option value="">Elegir…</option>
            {rutas.map((r) => <option key={r.id} value={r.id}>{r.code || r.id} · {r.nombre}{r.metodoZip ? ' (ZIP)' : ''}</option>)}
          </Select></Campo>
          <Campo label="Almacén"><Input value={ruta?.almacen || ''} readOnly placeholder="—" /></Campo>
          <Campo label="Total de paquetes"><Input type="number" min="0" value={total} onChange={(e) => cambiar(() => setTotal(e.target.value))} placeholder="0" /></Campo>
        </div>
      </Card>

      {ruta && (
        <Card className="mb-4 p-0">
          <div className="grid grid-cols-[1.4fr_.8fr_.9fr_.8fr_1fr] gap-2 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <span>Conductor</span><span className="text-right">Máx</span><span className="text-right">Fija</span><span className="text-right">Asignado</span><span className="text-right">Rango</span>
          </div>
          {(ruta.conductores || []).map((c, i) => {
            const l = plan?.lineas.find((x) => x.nombre === c.nombre)
            const low = propuesto && l && l.cantidad > 0 && l.cantidad < 150
            const over = propuesto && l && !ruta.metodoZip && l.cantidad > (c.capacidadMax || 0)
            return (
              <div key={i} className={`grid grid-cols-[1.4fr_.8fr_.9fr_.8fr_1fr] items-center gap-2 border-b border-slate-50 px-4 py-2 text-[13px] last:border-0 dark:border-slate-800/60 ${over ? 'bg-rose-50/60 dark:bg-rose-500/10' : ''}`}>
                <span className="font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</span>
                <span className="text-right font-mono text-slate-500">{ruta.metodoZip ? 'ZIP' : money(c.capacidadMax)}</span>
                <span className="text-right"><input type="number" min="0" placeholder="0" value={fijas[c.nombre] || ''} onChange={(e) => cambiar(() => setFijas((f) => ({ ...f, [c.nombre]: e.target.value })))} className="w-16 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></span>
                <span className={`text-right font-mono font-bold ${low ? 'text-amber-600' : 'text-emerald-600'}`}>{propuesto && l ? money(l.cantidad) : '—'}</span>
                <span className="text-right font-mono text-brand-steel">{propuesto && l ? (ruta.metodoZip ? 'ZIP' : (l.rangoDesde ? `${l.rangoDesde}–${l.rangoHasta}` : '—')) : '—'}</span>
              </div>
            )
          })}
          {propuesto && plan && (
            <div className="grid grid-cols-[1.4fr_.8fr_.9fr_.8fr_1fr] gap-2 border-t-2 border-slate-200 px-4 py-2 text-[13px] font-extrabold dark:border-slate-700">
              <span>Total</span><span></span><span className="text-right font-mono">{money(plan.fijos)}</span><span className="text-right font-mono">{money(plan.suma)}</span><span className="text-right font-mono">{plan.zip ? 'ZIP' : `1–${money(plan.suma)}`}</span>
            </div>
          )}
        </Card>
      )}

      {propuesto && plan && (
        <Card className="mb-4 p-4">
          <Check ok={plan.cuadra}>El total cuadra: <b>{money(plan.suma)}</b> de <b>{money(plan.total)}</b>{plan.cuadra ? '' : ` · faltan ${money(plan.faltante)}`}</Check>
          <Check ok>Sin paquetes perdidos ni duplicados (cada paquete en un solo conductor)</Check>
          <Check ok={!plan.excedeCap}>Ninguna asignación supera la capacidad máxima</Check>
          <Check ok={plan.sinHuecos}>{plan.zip ? 'Método ZIP: por código postal (sin rangos 1–N)' : 'Cobertura de rangos sin huecos ni solapamientos'}</Check>
          {plan.bajos.length > 0 && (
            <Aviso tipo="warn" className="mt-2"><b>{plan.bajos.length} conductor(es) bajo 150 paquetes:</b> {plan.bajos.join(', ')}. {(ruta.code === '019' || ruta.code === '222') ? 'Evalúa el balanceo 019 ⇄ 222 antes de dar la orden.' : 'Revísalo antes de dar la orden.'}</Aviso>
          )}
        </Card>
      )}

      {msg && <Aviso tipo={msg.t === 'ok' ? 'ok' : msg.t === 'error' ? 'error' : 'info'} className="mb-4">{msg.x}</Aviso>}

      {/* 3 pasos de aprobación */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Paso n={1} activo={paso === 1} hecho={paso > 1} titulo="Proponer" desc="Calcula el reparto. No guarda nada.">
          <Boton variant="gold" className="w-full" onClick={proponer}>Proponer plan</Boton>
        </Paso>
        <Paso n={2} activo={paso === 2} hecho={paso > 2} titulo="Guardar" desc="Guarda el borrador tras tu revisión.">
          <Boton variant="gold" className="w-full" disabled={paso !== 2 || !valido || trabajando} onClick={guardar}>{trabajando === 'save' ? <Spinner /> : <><Save size={14} /> Guardar borrador</>}</Boton>
        </Paso>
        <Paso n={3} activo={paso === 3} hecho={paso > 3} titulo="Dar la orden" desc="2ª aprobación. Deja la orden lista para GOFO.">
          <Boton variant="gold" className="w-full" disabled={paso !== 3 || trabajando} onClick={confirmar}>{trabajando === 'conf' ? <Spinner /> : <><Send size={14} /> Confirmar y dar la orden</>}</Boton>
        </Paso>
      </div>
      <p className="mt-3 text-xs text-slate-400">Cada paso es un permiso aparte. La orden solo se ejecuta en GOFO cuando el agente (Fase 2) la tome de la cola — y una sola vez.</p>
    </div>
  )
}

function Campo({ label, children }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>{children}</label>
}
function Check({ ok, children }) {
  return <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300"><span className={`grid h-[18px] w-[18px] place-items-center rounded-md text-[11px] font-extrabold text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>{ok ? '✓' : '✕'}</span><span>{children}</span></div>
}
function Paso({ n, activo, hecho, titulo, desc, children }) {
  return (
    <div className={`rounded-xl border p-3.5 dark:border-slate-700 ${activo ? 'border-brand-gold ring-2 ring-brand-gold/25' : 'border-slate-200'} ${hecho ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'bg-surface-card dark:bg-surface-dark-card'}`}>
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-brand-navy dark:text-slate-100">
        <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-extrabold ${hecho ? 'bg-emerald-500 text-white' : activo ? 'bg-brand-gold text-brand-navy' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>{hecho ? '✓' : n}</span>{titulo}
      </div>
      <p className="mb-2.5 text-[11.5px] text-slate-500">{desc}</p>
      {children}
    </div>
  )
}

// ── RUTAS (config de conductores y capacidades) ─────────────────────────────
function TabRutas({ rutas, user }) {
  const [edit, setEdit] = useState(null) // ruta en edición (o null)
  const nueva = () => setEdit({ code: '', nombre: '', almacen: '', metodoZip: false, conductores: [{ nombre: '', capacidadMax: 200 }] })
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={nueva}><Plus size={15} /> Nueva ruta</Boton>}>Rutas y conductores</PageTitle>
      {edit && <EditorRuta ruta={edit} onCerrar={() => setEdit(null)} user={user} />}
      {rutas.length === 0 && !edit && <Aviso tipo="info">Aún no hay rutas. Crea una con sus conductores y capacidades máximas.</Aviso>}
      <div className="space-y-2">
        {rutas.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-2 p-3">
            <Badge color="navy">{r.code || r.id}</Badge>
            <span className="font-bold text-brand-navy dark:text-slate-100">{r.nombre}</span>
            {r.almacen && <span className="text-xs text-slate-400">{r.almacen}</span>}
            {r.metodoZip && <Badge color="gold">ZIP</Badge>}
            <span className="text-xs text-slate-400">{(r.conductores || []).length} conductores</span>
            <button className="ml-auto text-sm font-semibold text-brand-gold hover:underline" onClick={() => setEdit(r)}>editar</button>
          </Card>
        ))}
      </div>
    </div>
  )
}

function EditorRuta({ ruta, onCerrar, user }) {
  const [r, setR] = useState(ruta)
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }))
  const setC = (i, k, v) => setR((x) => ({ ...x, conductores: x.conductores.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }))
  const addC = () => setR((x) => ({ ...x, conductores: [...x.conductores, { nombre: '', capacidadMax: 200 }] }))
  const delC = (i) => setR((x) => ({ ...x, conductores: x.conductores.filter((_, j) => j !== i) }))
  const guardar = async () => {
    const code = (r.code || '').trim()
    if (!code) { window.alert('Ponle un código a la ruta (ej. 019).'); return }
    setGuardando(true)
    try {
      const conductores = (r.conductores || []).filter((c) => (c.nombre || '').trim()).map((c) => ({ nombre: c.nombre.trim(), capacidadMax: Math.max(0, Math.round(Number(c.capacidadMax) || 0)) }))
      await setDoc(doc(db, COL_RUTAS, code), { code, nombre: (r.nombre || '').trim(), almacen: (r.almacen || '').trim(), metodoZip: !!r.metodoZip, conductores, actualizadoEn: serverTimestamp(), actualizadoPor: user.email }, { merge: true })
      onCerrar()
    } finally { setGuardando(false) }
  }
  const borrar = async () => {
    if (!ruta.id) { onCerrar(); return }
    if (!window.confirm(`¿Borrar la ruta ${ruta.code || ruta.id}?`)) return
    await deleteDoc(doc(db, COL_RUTAS, ruta.id)); onCerrar()
  }
  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo label="Código"><Input value={r.code} onChange={(e) => set('code', e.target.value)} placeholder="019" /></Campo>
        <Campo label="Nombre"><Input value={r.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ruta norte" /></Campo>
        <Campo label="Almacén"><Input value={r.almacen} onChange={(e) => set('almacen', e.target.value)} placeholder="DFW01" /></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={!!r.metodoZip} onChange={(e) => set('metodoZip', e.target.checked)} className="accent-brand-gold" /> Método ZIP (081)</label>
      </div>
      <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Conductores y capacidad máxima</div>
      <div className="space-y-1.5">
        {(r.conductores || []).map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input className="flex-1" value={c.nombre} onChange={(e) => setC(i, 'nombre', e.target.value)} placeholder="Nombre del conductor" />
            <Input type="number" min="0" className="w-24" value={c.capacidadMax} onChange={(e) => setC(i, 'capacidadMax', e.target.value)} placeholder="máx" />
            <button className="text-rose-400 hover:text-rose-600" onClick={() => delC(i)}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-gold hover:underline" onClick={addC}><Plus size={14} /> Agregar conductor</button>
      <div className="mt-4 flex flex-wrap gap-2">
        <Boton variant="gold" disabled={guardando} onClick={guardar}>{guardando ? <Spinner /> : 'Guardar ruta'}</Boton>
        <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
        {ruta.id && <button className="ml-auto text-sm font-semibold text-rose-400 hover:text-rose-600" onClick={borrar}>Borrar ruta</button>}
      </div>
    </Card>
  )
}

// ── ÓRDENES (la cola que leerá el agente) ───────────────────────────────────
const ESTADOS = {
  borrador: { color: 'slate', label: 'Borrador' },
  pendiente: { color: 'gold', label: 'Pendiente de ejecutar' },
  ejecutando: { color: 'blue', label: 'Ejecutando…' },
  ejecutada: { color: 'green', label: 'Ejecutada ✓' },
  error: { color: 'red', label: 'Error — revisar' },
  cancelada: { color: 'slate', label: 'Cancelada' },
}
function TabOrdenes({ ordenes }) {
  const cancelar = async (o) => {
    if (!window.confirm(`¿Cancelar la orden de ${o.fecha} ruta ${o.ruta}?`)) return
    await setDoc(doc(db, COL_ORDENES, o.id), { estado: 'cancelada' }, { merge: true })
  }
  const borrar = async (o) => { if (window.confirm('¿Borrar esta orden del historial?')) await deleteDoc(doc(db, COL_ORDENES, o.id)) }
  return (
    <div>
      <PageTitle>Cola de órdenes</PageTitle>
      <Aviso tipo="info" className="mb-4">Las órdenes <b>pendientes</b> son las que el agente (Fase 2) tomará para ejecutar en GOFO, una sola vez. Aquí verás su estado y la evidencia cuando se ejecuten.</Aviso>
      {ordenes.length === 0 && <div className="text-sm text-slate-400">Todavía no hay órdenes. Crea una en <b>Nueva asignación</b>.</div>}
      <div className="space-y-2">
        {ordenes.map((o) => {
          const e = ESTADOS[o.estado] || { color: 'slate', label: o.estado }
          return (
            <Card key={o.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="navy">{o.ruta}</Badge>
                <span className="font-mono text-sm font-semibold text-brand-navy dark:text-slate-100">{o.fecha}</span>
                <span className="text-xs text-slate-400">{(o.lineas || []).length} conductores · {money(o.total)} paquetes{o.almacen ? ` · ${o.almacen}` : ''}</span>
                <Badge color={e.color}>{e.label}</Badge>
                <div className="ml-auto flex gap-3 text-xs">
                  {o.estado === 'pendiente' && <button className="font-semibold text-amber-600 hover:underline" onClick={() => cancelar(o)}>cancelar</button>}
                  {(o.estado === 'ejecutada' || o.estado === 'error' || o.estado === 'cancelada' || o.estado === 'borrador') && <button className="font-semibold text-rose-400 hover:text-rose-600" onClick={() => borrar(o)}>borrar</button>}
                </div>
              </div>
              {o.estado === 'error' && o.errorMsg && <div className="mt-2 text-xs text-rose-500">⚠ {o.errorMsg}</div>}
              {o.evidenciaUrl && <a href={o.evidenciaUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand-gold underline">ver evidencia (captura)</a>}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
