import { useMemo, useState } from 'react'
import { Radio, CheckCircle2, XCircle, Truck, Sparkles, Zap, MessageSquare } from 'lucide-react'
import ChatOrden from '../components/ChatOrden'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { transportistasCompatibles, transportistaCompatible } from '../domain/ordenes'
import { recomendarTransportistas } from '../domain/asignacion'
import { enviarPush } from '../integraciones/notificaciones'
import { desgloseVisible } from '../domain/pagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, EstadoVacio, Select, Boton } from '../../components/ui'
import { money } from '../../utils/format'

const EN_COLA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO]
const ACTIVAS_EST = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]

// Color semántico por estado (mismos nombres que acepta <Badge/>).
const COLOR_ESTADO = {
  creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy',
  cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green',
  cerrada: 'green', cancelada: 'red', rechazada: 'red',
}

function Chip({ label, val, color }) {
  const c = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    gold: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    navy: 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  }[color]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${c}`}>
      {label}<span className="tabular-nums">{val}</span>
    </span>
  )
}

export default function Ordenes() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: plants } = useColeccion('plants')
  const [verSug, setVerSug] = useState('') // orderId con panel de sugerencia abierto
  const [chatOrden, setChatOrden] = useState(null) // orden con el chat abierto

  const { cola, activas } = useMemo(() => {
    const cola = ordenes.filter((o) => EN_COLA.includes(o.estado))
    const activas = ordenes.filter((o) => !EN_COLA.includes(o.estado) && o.estado !== E.CANCELADA)
    return { cola, activas }
  }, [ordenes])

  // Stats por transportista para el motor de asignación (disponibilidad, desempeño, posición).
  const statsPorCarrier = useMemo(() => {
    const m = {}
    for (const c of carriers) m[c.id] = { activas: 0, completadas: 0, rechazos: 0, pos: null, posTs: '' }
    for (const o of ordenes) {
      const cid = o.transportistaId; if (!cid || !m[cid]) continue
      if (ACTIVAS_EST.includes(o.estado)) m[cid].activas++
      if ([E.LIBERADA, E.CERRADA].includes(o.estado)) m[cid].completadas++
      if (o.ultimaPos?.ts && o.ultimaPos.ts > m[cid].posTs) { m[cid].pos = { lat: o.ultimaPos.lat, lng: o.ultimaPos.lng }; m[cid].posTs = o.ultimaPos.ts }
    }
    return m
  }, [ordenes, carriers])
  const plantaGps = (o) => plants.find((p) => p.id === o.plantaId)?.gps || null
  const sugerir = (o) => recomendarTransportistas(o, carriers, statsPorCarrier, plantaGps(o))

  const asignar = async (orden, carrierId) => {
    const carrier = carriers.find((c) => c.id === carrierId)
    // Regla dura: jamás asignar un equipo incompatible.
    if (carrier && !transportistaCompatible(carrier.equipos, orden.tipoEquipo)) {
      window.alert(`${carrier.nombre} no tiene el equipo requerido (${orden.tipoEquipo}).`); return
    }
    await guardar('orders', orden.id, { transportistaId: carrierId, estado: E.NOTIFICANDO })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'asignar_orden', entidad: 'orden', entidadId: orden.id, detalle: `Asignada a ${carrier?.nombre} · notificando` })
    enviarPush(tenantId, `carrier:${carrierId}`, 'Nueva orden', `Orden ${orden.numero} — ${orden.pesoEstimado} ton (${orden.tipoEquipo})`)
  }
  const autoAsignar = async (orden) => {
    const rank = sugerir(orden)
    if (!rank.length) { window.alert('No hay transportistas compatibles disponibles.'); return }
    await guardar('orders', orden.id, { transportistaId: rank[0].carrier.id, estado: E.NOTIFICANDO, asignacionAuto: { score: rank[0].score, motivo: rank[0].detalle } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'auto_asignar', entidad: 'orden', entidadId: orden.id, detalle: `Auto → ${rank[0].carrier.nombre} (score ${rank[0].score})` })
    setVerSug('')
  }
  const aceptar = async (orden) => {
    await guardar('orders', orden.id, { estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'aceptar_orden', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async (orden) => {
    const motivo = window.prompt('Motivo del rechazo:') || 'Sin motivo'
    await guardar('orders', orden.id, { estado: E.CREADA, transportistaId: null, rechazo: { motivo, ts: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'rechazar_orden', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }

  if (cargando) return <Cargando />
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'
  const FINALES = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
  const notifN = cola.filter((o) => o.estado === E.NOTIFICANDO).length
  const enProcesoN = activas.filter((o) => !FINALES.includes(o.estado)).length
  const entregadasN = activas.filter((o) => FINALES.includes(o.estado)).length
  const avance = (o) => { const h = o.hitos || {}; const done = ORDEN_HITOS.filter((k) => h[k.key]).length; return Math.round((done / ORDEN_HITOS.length) * 100) }

  return (
    <div>
      <PageTitle>Órdenes / Cola</PageTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip label="En cola" val={cola.length - notifN} color="slate" />
        <Chip label="Notificando" val={notifN} color="gold" />
        <Chip label="En proceso" val={enProcesoN} color="navy" />
        <Chip label="Entregadas" val={entregadasN} color="green" />
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2"><Radio size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Cola en tiempo real ({cola.length})</h3></div>
        {cola.length === 0 ? <p className="text-sm text-slate-400">No hay órdenes en cola. Genera órdenes desde un Trabajo (Job).</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cola.map((o) => {
              const compat = transportistasCompatibles(carriers, o.tipoEquipo)
              const fin = desgloseVisible(o, rol)
              const notificando = o.estado === E.NOTIFICANDO
              return (
                <div key={o.id} className={`rounded-xl border p-3 ${notificando ? 'animate-pulse border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700/60'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="navy">{o.pesoEstimado} ton</Badge>
                    {o.tipoEquipo && <Badge color="slate">{o.tipoEquipo}</Badge>}
                    <button onClick={() => setChatOrden(o)} title="Chat de la orden" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"><MessageSquare size={15} /></button>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{o.material || 'material s/e'} · {ORDEN_ESTADO_LABEL[o.estado]}</div>
                  {'precioCliente' in fin && fin.precioCliente != null && <div className="mt-1 text-xs">Cliente: {money(fin.precioCliente)}</div>}
                  <div className="mt-2">
                    <Select className="w-full py-1 text-xs" value={o.transportistaId || ''} onChange={(e) => asignar(o, e.target.value)}>
                      <option value="">{compat.length ? 'Asignar transportista…' : 'Sin transportistas compatibles'}</option>
                      {compat.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </Select>
                  </div>
                  {compat.length > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      <Boton variant="gold" onClick={() => autoAsignar(o)} className="flex-1 justify-center px-2 py-1 text-xs"><Zap size={13} /> Auto-asignar</Boton>
                      <Boton variant="ghost" onClick={() => setVerSug(verSug === o.id ? '' : o.id)} className="px-2 py-1 text-xs"><Sparkles size={13} /> Sugerir</Boton>
                    </div>
                  )}
                  {verSug === o.id && (
                    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                      <div className="text-[10px] font-semibold uppercase text-slate-400">Recomendación por reglas</div>
                      {sugerir(o).slice(0, 3).map((r, i) => (
                        <div key={r.carrier.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-1.5">
                            {i === 0 && <Sparkles size={12} className="text-amber-500" />}
                            <span className="text-xs font-semibold text-brand-navy dark:text-slate-100">{r.carrier.nombre}</span>
                            <Badge color={i === 0 ? 'gold' : 'slate'}>{Math.round(r.score * 100)}</Badge>
                            <button onClick={() => asignar(o, r.carrier.id)} className="ml-auto rounded bg-brand-navy px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-amber-500 dark:text-slate-900">Asignar</button>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            cercanía {r.detalle.cercania}{r.detalle.distKm != null ? ` (${r.detalle.distKm} km)` : ''} · dispon. {r.detalle.disponibilidad} · calif. {r.detalle.calificacion} · desemp. {r.detalle.desempeno}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {notificando && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => aceptar(o)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white"><CheckCircle2 size={13} /> Aceptar</button>
                      <button onClick={() => rechazar(o)} className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white"><XCircle size={13} /> Rechazar</button>
                      <span className="ml-auto self-center text-[10px] text-slate-400">→ {nombreCarrier(o.transportistaId)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><Truck size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">En proceso / finalizadas ({activas.length})</h3></div>
        {activas.length === 0 ? <EstadoVacio texto="Cuando un chofer acepte una orden, saldrá de la cola y aparecerá aquí." mostrarBoton={false} /> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">Orden</th><th>Ton</th><th>Equipo</th><th>Transportista</th><th>Estado</th><th>Avance</th><th>Chat</th></tr></thead>
              <tbody>
                {activas.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-700/50">
                    <td className="py-2 font-mono font-medium text-brand-navy dark:text-slate-100">{o.numero}</td>
                    <td className="tabular-nums">{o.pesoReal ?? o.pesoEstimado}</td>
                    <td>{o.tipoEquipo || '—'}</td>
                    <td>{nombreCarrier(o.transportistaId)}</td>
                    <td><Badge color={COLOR_ESTADO[o.estado] || 'slate'}>{ORDEN_ESTADO_LABEL[o.estado]}</Badge></td>
                    <td className="w-32">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                          <div className={`h-full rounded-full ${o.estado === E.CERRADA ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${avance(o)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-slate-400">{avance(o)}%</span>
                      </div>
                    </td>
                    <td><button onClick={() => setChatOrden(o)} title="Chat de la orden" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:text-amber-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={13} /> Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {chatOrden && (
        <ModalChat titulo={`Chat · ${chatOrden.numero}`} onClose={() => setChatOrden(null)}>
          <ChatOrden orden={chatOrden} alto={380} />
        </ModalChat>
      )}
    </div>
  )
}

function ModalChat({ titulo, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
