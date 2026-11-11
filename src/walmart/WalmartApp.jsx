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
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useCarrier } from '../carriers/CarrierContext'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import {
  Users, Warehouse as WhIcon, Settings, ArrowLeftRight, Plus, Trash2, ArrowLeft, Search,
  Route as RouteIcon, ClipboardCheck, Wallet, Receipt, BarChart3, FileSignature,
  CreditCard, Eye, EyeOff, ShieldCheck, Zap,
} from 'lucide-react'
import { BANCOS_USA } from './bancosUSA'
import {
  COL, ESTADOS, estadoInfo, DISPONIBILIDAD, DIAS, TIPOS_VEHICULO, SI_NO_PEND, PROPIETARIO,
  TARIFAS_DEFAULT, suscribir, guardar, borrar, auditar, nombreCompleto, sembrarAlmacenes,
  BLOQUES, ESTADOS_RUTA, estadoRutaInfo, money2, idRuta, ingresoRuta, gananciaDriver,
  hoyISO, lunesDe, domingoDe, cerrarDia, reabrirDia,
  METODOS_PAGO, liquidadoFPruta, resumenSemana, calcularFastPay,
} from './datosWal'

const WALMART_AZUL = '#0071dc'
const hoy = () => new Date().toISOString().slice(0, 10)
const dinero = (n) => `$${money2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TABS = [
  { id: 'personas', label: 'Candidatos / Drivers', icono: Users },
  { id: 'almacenes', label: 'Almacenes', icono: WhIcon },
  { id: 'rutas', label: 'Rutas', icono: RouteIcon },
  { id: 'cierre', label: 'Cierre diario', icono: ClipboardCheck },
  { id: 'pagos', label: 'Pagos / Fast Pay', icono: Wallet },
  { id: 'gastos', label: 'Gastos', icono: Receipt, fase: 4 },
  { id: 'financiero', label: 'Financiero', icono: BarChart3, fase: 4 },
  { id: 'contratos', label: 'Contratos', icono: FileSignature, fase: 5 },
  { id: 'config', label: 'Configuración', icono: Settings },
]

export default function WalmartApp() {
  const { user } = useAuth()
  const { cambiarCarrier } = useCarrier()
  const [tab, setTab] = useState('personas')
  const [personas, setPersonas] = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [rutas, setRutas] = useState([])
  const [cierres, setCierres] = useState([])
  const [pagos, setPagos] = useState([])
  const [tarifas, setTarifas] = useState(TARIFAS_DEFAULT)
  useEffect(() => suscribir(COL.candidatos, setPersonas), [])
  useEffect(() => suscribir(COL.almacenes, setAlmacenes), [])
  useEffect(() => suscribir(COL.rutas, setRutas), [])
  useEffect(() => suscribir(COL.cierres, setCierres), [])
  useEffect(() => suscribir(COL.pagos, setPagos), [])
  useEffect(() => suscribir(COL.config, (docs) => setTarifas({ ...TARIFAS_DEFAULT, ...(docs.find((d) => d.id === 'tarifas') || {}) })), [])

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-surface-card px-4 py-3 dark:border-slate-800 dark:bg-surface-dark-card">
        <button onClick={cambiarCarrier} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar de compañía"><ArrowLeftRight size={16} /></button>
        <span className="flex items-center gap-2 text-lg font-black text-brand-navy dark:text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: WALMART_AZUL }}>W</span> Walmart
        </span>
        <nav className="ml-1 flex flex-wrap gap-1">
          {TABS.map((td) => (
            <button key={td.id} onClick={() => setTab(td.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition ${tab === td.id ? 'bg-slate-100 text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <td.icono size={14} /> {td.label}
              {td.fase && <span className="rounded bg-slate-200 px-1 text-[9px] font-bold text-slate-500 dark:bg-slate-700">F{td.fase}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === 'personas' && <TabPersonas personas={personas} almacenes={almacenes} user={user} />}
        {tab === 'almacenes' && <TabAlmacenes almacenes={almacenes} user={user} />}
        {tab === 'rutas' && <TabRutas rutas={rutas} almacenes={almacenes} personas={personas} tarifas={tarifas} cierres={cierres} />}
        {tab === 'cierre' && <TabCierre rutas={rutas} almacenes={almacenes} cierres={cierres} esDueno />}
        {tab === 'pagos' && <TabPagos rutas={rutas} pagos={pagos} personas={personas} tarifas={tarifas} />}
        {tab === 'config' && <TabConfig />}
        {['gastos', 'financiero', 'contratos'].includes(tab) && (
          <Proximamente tab={TABS.find((t) => t.id === tab)} />
        )}
      </main>
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
function TabPersonas({ personas, almacenes, user }) {
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

  if (ver) return <PerfilDriver persona={personas.find((p) => p.id === ver.id) || ver} almacenes={almacenes} onVolver={() => setVer(null)} onEditar={(p) => { setVer(null); setEditar(p) }} />
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

      {lista.length === 0 && <div className="text-sm text-slate-400">{personas.length ? 'Ningún resultado con esos filtros.' : 'Aún no hay candidatos. Agrega el primero con “Nuevo”.'}</div>}
      <div className="space-y-1.5">
        {lista.map((p) => {
          const e = estadoInfo(p.estadoOperativo)
          return (
            <Card key={p.id} className="flex flex-wrap items-center gap-2.5 p-3">
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

function PerfilDriver({ persona, almacenes, onVolver, onEditar }) {
  const p = persona
  const e = estadoInfo(p.estadoOperativo)
  const alm = almacenes.find((a) => a.id === p.almacenId)
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
      <BankSection driverId={p.id} />

      <Card className="mt-4 p-4">
        <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Historial, rutas, pagos, Fast Pay, documentos y contratos</div>
        <p className="text-sm text-slate-500">Estas secciones se llenan solas cuando registres rutas y pagos (Fases 2–5). El perfil ya está listo para recibirlas.</p>
      </Card>
    </div>
  )
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
          <Card key={a.id} className="flex flex-wrap items-center gap-2 p-3">
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
      {delDia.length === 0 && <div className="text-sm text-slate-400">No hay rutas registradas para ese día{almId ? ` en ${almNombre(almId)}` : ''}. Crea una con “Nueva ruta”.</div>}
      <div className="space-y-1.5">
        {delDia.map((r) => {
          const e = estadoRutaInfo(r.estado)
          return (
            <Card key={r.id} className="flex flex-wrap items-center gap-2.5 p-3">
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

      {!driverId && <div className="text-sm text-slate-400">Elige un driver para ver su semana.</div>}
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
