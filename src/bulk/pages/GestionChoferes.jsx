import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Truck, User, ArrowRightLeft, Phone, IdCard } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { PageTitle, Card, Boton, Input, Select, Cargando, EstadoVacio } from '../../components/ui'

const nuevoId = () => `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export default function GestionChoferes() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const [f, setF] = useState({ carrierId: '', nombre: '', telefono: '', licencia: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    const c = carriers.find((x) => x.id === f.carrierId)
    if (!c || !f.nombre.trim()) return
    // Un chofer solo puede estar en UN transporte.
    const yaExiste = carriers.some((x) => (x.choferes || []).some((d) => (d.nombre || '').toLowerCase() === f.nombre.trim().toLowerCase()))
    if (yaExiste) { window.alert('Ese chofer ya está en un transporte. Un chofer solo puede estar en uno; usa “Reasignar” para moverlo.'); return }
    const chofer = { id: nuevoId(), nombre: f.nombre.trim(), telefono: f.telefono.trim(), licencia: f.licencia.trim(), activo: true }
    await guardar('carriers', c.id, { choferes: [...(c.choferes || []), chofer] })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'alta_chofer', entidad: 'chofer', detalle: `${chofer.nombre} → ${c.nombre}` })
    setF({ carrierId: '', nombre: '', telefono: '', licencia: '' })
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

  return (
    <div>
      <PageTitle>Choferes por transporte</PageTitle>

      {/* Alta */}
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nuevo chofer</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={f.carrierId} onChange={set('carrierId')}>
            <option value="">— Transporte —</option>
            {carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Input placeholder="Nombre del chofer" value={f.nombre} onChange={set('nombre')} />
          <Input placeholder="Teléfono" value={f.telefono} onChange={set('telefono')} />
          <Input placeholder="Licencia" value={f.licencia} onChange={set('licencia')} />
        </div>
        <div className="mt-3"><Boton variant="gold" onClick={agregar} disabled={!f.carrierId || !f.nombre.trim()}><Plus size={16} /> Agregar chofer</Boton></div>
        <p className="mt-2 text-[11px] text-slate-400">Para darle acceso a la app móvil, créalo también en “Usuarios y roles” como rol Chofer. Aquí gestionas la plantilla y las reasignaciones.</p>
      </Card>

      {carriers.length === 0 ? <EstadoVacio titulo="Sin transportes" texto="Primero crea transportistas." mostrarBoton={false} /> : totalChoferes === 0 ? (
        <EstadoVacio titulo="Sin choferes" texto="Agrega el primero arriba, o carga el Modo test." mostrarBoton={false} />
      ) : (
        <div className="space-y-3">
          {carriers.filter((c) => (c.choferes || []).length > 0).map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Truck size={16} className="text-amber-500" />
                <Link to={`/bulk/transportistas/${c.id}`} className="font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{c.nombre}</Link>
                <span className="text-xs text-slate-400">· {(c.choferes || []).length} chofer(es)</span>
              </div>
              <div className="space-y-2">
                {(c.choferes || []).map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-2.5 dark:border-slate-700/50">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">{(d.nombre || '?').charAt(0)}</div>
                    <div className="min-w-0">
                      <Link to={`/bulk/chofer/${encodeURIComponent(d.nombre)}`} className="text-sm font-semibold text-brand-navy hover:text-amber-600 dark:text-slate-100">{d.nombre}</Link>
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                        {d.telefono && <span className="inline-flex items-center gap-0.5"><Phone size={10} /> {d.telefono}</span>}
                        {d.licencia && <span className="inline-flex items-center gap-0.5"><IdCard size={10} /> {d.licencia}</span>}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <ArrowRightLeft size={13} className="text-slate-400" />
                      <Select value="" onChange={(e) => reasignar(c, d, e.target.value)} className="py-1 text-xs">
                        <option value="">Reasignar a…</option>
                        {carriers.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </Select>
                      <button onClick={() => borrar(c, d)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
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
