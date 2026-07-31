import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Truck, User, ArrowRightLeft, Phone, IdCard, Search, X, Briefcase } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { PageTitle, Card, Boton, Input, Select, Cargando, EstadoVacio } from '../../components/ui'

const nuevoId = () => `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export default function GestionChoferes() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const { datos: equipos } = useColeccion('equipment')
  const { datos: jobs } = useColeccion('jobs')
  const equiposAct = equipos.filter((e) => e.activo !== false)
  const jobsAct = jobs.filter((j) => j.activo !== false)
  const nombreJob = (id) => jobs.find((j) => j.id === id)?.nombre || jobs.find((j) => j.id === id)?.codigo || id
  const [f, setF] = useState({ carrierId: '', nombre: '', telefono: '', licencia: '', equipo: '', jobs: [] })
  const [buscar, setBuscar] = useState('')
  const [alta, setAlta] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggleFJob = (id) => setF((s) => ({ ...s, jobs: s.jobs.includes(id) ? s.jobs.filter((x) => x !== id) : [...s.jobs, id] }))

  const agregar = async () => {
    const c = carriers.find((x) => x.id === f.carrierId)
    if (!c || !f.nombre.trim()) return
    // Un chofer solo puede estar en UN transporte.
    const yaExiste = carriers.some((x) => (x.choferes || []).some((d) => (d.nombre || '').toLowerCase() === f.nombre.trim().toLowerCase()))
    if (yaExiste) { window.alert('Ese chofer ya está en un transporte. Un chofer solo puede estar en uno; usa “Reasignar” para moverlo.'); return }
    const chofer = { id: nuevoId(), nombre: f.nombre.trim(), telefono: f.telefono.trim(), licencia: f.licencia.trim(), equipo: f.equipo || '', jobs: f.jobs || [], activo: true }
    await guardar('carriers', c.id, { choferes: [...(c.choferes || []), chofer] })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'alta_chofer', entidad: 'chofer', detalle: `${chofer.nombre} → ${c.nombre}` })
    setF({ carrierId: '', nombre: '', telefono: '', licencia: '', equipo: '', jobs: [] })
  }

  // Edición en sitio de un campo del chofer embebido (equipo, jobs, …).
  const editarChofer = async (carrier, chofer, patch) => {
    await guardar('carriers', carrier.id, { choferes: (carrier.choferes || []).map((d) => (d.id === chofer.id ? { ...d, ...patch } : d)) })
  }
  const toggleJob = (carrier, chofer, id) => {
    const actuales = chofer.jobs || []
    editarChofer(carrier, chofer, { jobs: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id] })
  }

  const borrar = async (carrier, chofer) => {
    if (!window.confirm(`¿Eliminar al chofer "${chofer.nombre}"?`)) return
    await guardar('carriers', carrier.id, { choferes: (carrier.choferes || []).filter((d) => d.id !== chofer.id) })
  }

  // Reasignar: quitar del transporte origen y agregar al destino.
  const reasignar = async (from, chofer, toId) => {
    if (!toId || toId === from.id) return
    const to = carriers.find((c) => c.id === toId)
    if (!to) return
    await guardar('carriers', from.id, { choferes: (from.choferes || []).filter((d) => d.id !== chofer.id) })
    await guardar('carriers', to.id, { choferes: [...(to.choferes || []), chofer] })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'reasignar_chofer', entidad: 'chofer', detalle: `${chofer.nombre}: ${from.nombre} → ${to.nombre}` })
  }

  if (cargando) return <Cargando />
  const totalChoferes = carriers.reduce((a, c) => a + (c.choferes || []).length, 0)
  const q = buscar.trim().toLowerCase()
  const carriersV = carriers
    .map((c) => ({ ...c, _cho: (c.choferes || []).filter((d) => !q || (d.nombre || '').toLowerCase().includes(q)) }))
    .filter((c) => c._cho.length > 0)

  return (
    <div>
      <PageTitle>Choferes por transporte</PageTitle>

      {/* Barra: buscador + botón para mostrar el alta */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar chofer…" className="w-64 pl-8" />
        </div>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)} className="ml-auto">{alta ? <><X size={16} /> Cerrar</> : <><Plus size={16} /> Nuevo chofer</>}</Boton>
      </div>

      {/* Alta (colapsable) */}
      {alta && (
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nuevo chofer</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select value={f.carrierId} onChange={set('carrierId')}>
            <option value="">— Transporte —</option>
            {carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Input placeholder="Nombre del chofer" value={f.nombre} onChange={set('nombre')} />
          <Select value={f.equipo} onChange={set('equipo')}>
            <option value="">— Equipo (camión) —</option>
            {equiposAct.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
          </Select>
          <Input placeholder="Teléfono" value={f.telefono} onChange={set('telefono')} />
          <Input placeholder="Licencia" value={f.licencia} onChange={set('licencia')} />
        </div>
        {jobsAct.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400"><Briefcase size={12} /> Trabajos afiliados <span className="normal-case text-slate-400">(vacío = todos)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {jobsAct.map((j) => (
                <button key={j.id} type="button" onClick={() => toggleFJob(j.id)} className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${f.jobs.includes(j.id) ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>{j.nombre || j.codigo}</button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3"><Boton variant="gold" onClick={agregar} disabled={!f.carrierId || !f.nombre.trim()}><Plus size={16} /> Agregar chofer</Boton></div>
        <p className="mt-2 text-[11px] text-slate-400">El equipo del chofer decide qué órdenes recibe (solo las que piden ese camión). Los trabajos afiliados lo limitan a esos trabajos (si no eliges ninguno, recibe de todos). Para acceso a la app, créalo también en “Usuarios y roles” como Chofer.</p>
      </Card>
      )}

      {carriers.length === 0 ? <EstadoVacio titulo="Sin transportes" texto="Primero crea transportistas." mostrarBoton={false} /> : totalChoferes === 0 ? (
        <EstadoVacio titulo="Sin choferes" texto="Agrega el primero (botón “Nuevo chofer”), o carga el Modo test." mostrarBoton={false} />
      ) : carriersV.length === 0 ? (
        <EstadoVacio titulo="Sin resultados" texto="Ningún chofer coincide con la búsqueda." mostrarBoton={false} />
      ) : (
        <div className="space-y-3">
          {carriersV.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Truck size={16} className="text-amber-500" />
                <Link to={`/bulk/transportistas/${c.id}`} className="font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{c.nombre}</Link>
                <span className="text-xs text-slate-400">· {c._cho.length} chofer(es)</span>
              </div>
              <div className="space-y-2">
                {c._cho.map((d) => (
                  <div key={d.id} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-700/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">{(d.nombre || '?').charAt(0)}</div>
                      <div className="min-w-0">
                        <Link to={`/bulk/chofer/${encodeURIComponent(d.nombre)}`} className="text-sm font-semibold text-brand-navy hover:text-amber-600 dark:text-slate-100">{d.nombre}</Link>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                          {d.telefono && <span className="inline-flex items-center gap-0.5"><Phone size={10} /> {d.telefono}</span>}
                          {d.licencia && <span className="inline-flex items-center gap-0.5"><IdCard size={10} /> {d.licencia}</span>}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Truck size={13} className="text-slate-400" />
                        <Select value={d.equipo || ''} onChange={(e) => editarChofer(c, d, { equipo: e.target.value })} className="py-1 text-xs">
                          <option value="">— equipo —</option>
                          {equiposAct.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                        </Select>
                        <ArrowRightLeft size={13} className="text-slate-400" />
                        <Select value="" onChange={(e) => reasignar(c, d, e.target.value)} className="py-1 text-xs">
                          <option value="">Reasignar a…</option>
                          {carriers.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                        </Select>
                        <button onClick={() => borrar(c, d)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {jobsAct.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-700/50">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Briefcase size={11} /> Trabajos:</span>
                        {jobsAct.map((j) => {
                          const on = (d.jobs || []).includes(j.id)
                          return <button key={j.id} type="button" onClick={() => toggleJob(c, d, j.id)} className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>{j.nombre || j.codigo}</button>
                        })}
                        {(d.jobs || []).length === 0 && <span className="text-[11px] text-slate-400">todos</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
