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
import { useAuth } from '../AuthContext'
import { useCarrier } from '../carriers/CarrierContext'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import {
  Users, Warehouse as WhIcon, Settings, ArrowLeftRight, Plus, Trash2, ArrowLeft, Search,
  Route as RouteIcon, ClipboardCheck, Wallet, Receipt, BarChart3, FileSignature,
} from 'lucide-react'
import {
  COL, ESTADOS, estadoInfo, DISPONIBILIDAD, DIAS, TIPOS_VEHICULO, SI_NO_PEND, PROPIETARIO,
  TARIFAS_DEFAULT, suscribir, guardar, borrar, auditar, nombreCompleto, sembrarAlmacenes,
} from './datosWal'

const WALMART_AZUL = '#0071dc'
const hoy = () => new Date().toISOString().slice(0, 10)

const TABS = [
  { id: 'personas', label: 'Candidatos / Drivers', icono: Users },
  { id: 'almacenes', label: 'Almacenes', icono: WhIcon },
  { id: 'rutas', label: 'Rutas', icono: RouteIcon, fase: 2 },
  { id: 'cierre', label: 'Cierre diario', icono: ClipboardCheck, fase: 2 },
  { id: 'pagos', label: 'Pagos / Fast Pay', icono: Wallet, fase: 3 },
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
  useEffect(() => suscribir(COL.candidatos, setPersonas), [])
  useEffect(() => suscribir(COL.almacenes, setAlmacenes), [])

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
        {tab === 'config' && <TabConfig />}
        {['rutas', 'cierre', 'pagos', 'gastos', 'financiero', 'contratos'].includes(tab) && (
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
      <Card className="mt-4 p-4">
        <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Historial, rutas, pagos, Fast Pay, documentos y contratos</div>
        <p className="text-sm text-slate-500">Estas secciones se llenan solas cuando registres rutas y pagos (Fases 2–5). El perfil ya está listo para recibirlas.</p>
      </Card>
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
