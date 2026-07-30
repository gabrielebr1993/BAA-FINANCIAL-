import { useMemo, useState } from 'react'
import { Radio, CheckCircle2, XCircle, Truck, Sparkles, Zap, MessageSquare, User, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Input } from '../../components/ui'
import ChatOrden from '../components/ChatOrden'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { transportistaCompatible, transportistasElegibles } from '../domain/ordenes'
import { recomendarTransportistas } from '../domain/asignacion'
import { enviarPush } from '../integraciones/notificaciones'
import { desgloseVisible } from '../domain/pagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, EstadoVacio, Select, Boton } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

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
  const { t } = useLang()
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: plants } = useColeccion('plants')
  const { datos: jobs } = useColeccion('jobs')
  // Transportistas autorizados en el trabajo de una orden (el filtro que controla
  // qué transportes —y sus choferes— reciben las órdenes de ese trabajo).
  const autorizadosDe = (o) => jobs.find((j) => j.id === o.jobId)?.transportistasAutorizados || []
  const [verSug, setVerSug] = useState('') // orderId con panel de sugerencia abierto
  const [chatOrden, setChatOrden] = useState(null) // orden con el chat abierto
  const [buscar, setBuscar] = useState('')

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
  // La sugerencia/auto-asignación solo considera transportistas ELEGIBLES (equipo + autorizados en el trabajo).
  const sugerir = (o) => recomendarTransportistas(o, transportistasElegibles(carriers, o.tipoEquipo, autorizadosDe(o)), statsPorCarrier, plantaGps(o))

  const asignar = async (orden, carrierId) => {
    const carrier = carriers.find((c) => c.id === carrierId)
    // Regla dura: jamás asignar un equipo incompatible.
    if (carrier && !transportistaCompatible(carrier.equipos, orden.tipoEquipo)) {
      window.alert(`${carrier.nombre} ${t('no tiene el equipo requerido')} (${orden.tipoEquipo}).`); return
    }
    // Regla del trabajo: solo transportistas autorizados en el trabajo de la orden.
    const aut = autorizadosDe(orden)
    if (aut.length && !aut.includes(carrierId)) {
      window.alert(t('Ese transportista no está autorizado en este trabajo. Agrégalo en Trabajos.')); return
    }
    await guardar('orders', orden.id, { transportistaId: carrierId, estado: E.NOTIFICANDO })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'asignar_orden', entidad: 'orden', entidadId: orden.id, detalle: `Asignada a ${carrier?.nombre} · notificando` })
    enviarPush(tenantId, `carrier:${carrierId}`, 'Nueva orden', `Orden ${orden.numero} — ${orden.pesoEstimado} ton (${orden.tipoEquipo})`)
  }
  const autoAsignar = async (orden) => {
    const rank = sugerir(orden)
    if (!rank.length) { window.alert(t('No hay transportistas compatibles disponibles.')); return }
    await guardar('orders', orden.id, { transportistaId: rank[0].carrier.id, estado: E.NOTIFICANDO, asignacionAuto: { score: rank[0].score, motivo: rank[0].detalle } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'auto_asignar', entidad: 'orden', entidadId: orden.id, detalle: `Auto → ${rank[0].carrier.nombre} (score ${rank[0].score})` })
    setVerSug('')
  }
  const aceptar = async (orden) => {
    await guardar('orders', orden.id, { estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'aceptar_orden', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async (orden) => {
    const motivo = window.prompt(t('Motivo del rechazo:')) || 'Sin motivo'
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
  const q = buscar.trim().toLowerCase()
  const coincide = (o) => !q || (o.numero || '').toLowerCase().includes(q) || (o.choferNombre || '').toLowerCase().includes(q) || (nombreCarrier(o.transportistaId) || '').toLowerCase().includes(q)
  const colaF = cola.filter(coincide)
  const activasF = activas.filter(coincide)

  return (
    <div>
      <PageTitle>{t('Órdenes / Cola')}</PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip label={t('En cola')} val={cola.length - notifN} color="slate" />
        <Chip label={t('Notificando')} val={notifN} color="gold" />
        <Chip label={t('En proceso')} val={enProcesoN} color="navy" />
        <Chip label={t('Entregadas')} val={entregadasN} color="green" />
        <div className="relative ml-auto">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar N.º de orden o chofer…')} className="w-60 pl-8" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><Radio size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Cola · por asignar')} ({cola.length})</h3></div>
        {colaF.length === 0 ? <p className="text-sm text-slate-400">{buscar ? t('Ninguna orden en cola coincide con la búsqueda.') : t('No hay órdenes en cola. Genera órdenes desde un Trabajo (Job).')}</p> : (
          <div className="scroll-thin max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto pr-1">
            {colaF.map((o) => {
              const compat = transportistasElegibles(carriers, o.tipoEquipo, autorizadosDe(o))
              const fin = desgloseVisible(o, rol)
              const notificando = o.estado === E.NOTIFICANDO
              return (
                <div key={o.id} className={`rounded-xl border p-3 ${notificando ? 'animate-pulse border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700/60'}`}>
                  <div className="flex items-center gap-2">
                    <Link to={`/bulk/ordenes/${o.id}`} className="font-mono text-sm font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{o.numero}</Link>
                    <Badge color="navy">{o.pesoEstimado} ton</Badge>
                    {o.tipoEquipo && <Badge color="slate">{o.tipoEquipo}</Badge>}
                    <button onClick={() => setChatOrden(o)} title={t('Chat de la orden')} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"><MessageSquare size={15} /></button>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t(ORDEN_ESTADO_LABEL[o.estado])}</div>
                  {'precioCliente' in fin && fin.precioCliente != null && <div className="mt-1 text-xs">{t('Cliente')}: {money(fin.precioCliente)}</div>}
                  <div className="mt-2">
                    <Select className="w-full py-1 text-xs" value={o.transportistaId || ''} onChange={(e) => asignar(o, e.target.value)}>
                      <option value="">{compat.length ? t('Asignar transportista…') : t('Sin transportistas compatibles')}</option>
                      {compat.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </Select>
                  </div>
                  {compat.length > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      <Boton variant="gold" onClick={() => autoAsignar(o)} className="flex-1 justify-center px-2 py-1 text-xs"><Zap size={13} /> {t('Auto-asignar')}</Boton>
                      <Boton variant="ghost" onClick={() => setVerSug(verSug === o.id ? '' : o.id)} className="px-2 py-1 text-xs"><Sparkles size={13} /> {t('Sugerir')}</Boton>
                    </div>
                  )}
                  {verSug === o.id && (
                    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                      <div className="text-[10px] font-semibold uppercase text-slate-400">{t('Recomendación por reglas')}</div>
                      {sugerir(o).slice(0, 3).map((r, i) => (
                        <div key={r.carrier.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-1.5">
                            {i === 0 && <Sparkles size={12} className="text-amber-500" />}
                            <span className="text-xs font-semibold text-brand-navy dark:text-slate-100">{r.carrier.nombre}</span>
                            <Badge color={i === 0 ? 'gold' : 'slate'}>{Math.round(r.score * 100)}</Badge>
                            <button onClick={() => asignar(o, r.carrier.id)} className="ml-auto rounded bg-brand-navy px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-amber-500 dark:text-slate-900">{t('Asignar')}</button>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {t('cercanía')} {r.detalle.cercania}{r.detalle.distKm != null ? ` (${r.detalle.distKm} km)` : ''} · {t('dispon.')} {r.detalle.disponibilidad} · {t('calif.')} {r.detalle.calificacion} · {t('desemp.')} {r.detalle.desempeno}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {notificando && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => aceptar(o)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white"><CheckCircle2 size={13} /> {t('Aceptar')}</button>
                      <button onClick={() => rechazar(o)} className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white"><XCircle size={13} /> {t('Rechazar')}</button>
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
        <div className="mb-3 flex items-center gap-2"><Truck size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Asignación en vivo')} ({activas.length})</h3></div>
        {activasF.length === 0 ? <EstadoVacio texto={buscar ? t('Ninguna orden asignada coincide con la búsqueda.') : t('Cuando asignes una orden y el chofer la acepte, aparecerá aquí con su chofer y su avance en tiempo real.')} mostrarBoton={false} /> : (
          <div className="scroll-thin max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto pr-1">
            {activasF.map((o) => {
              const enRuta = o.estado === E.EN_RUTA
              const fin = FINALES.includes(o.estado)
              return (
                <div key={o.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${enRuta ? 'animate-pulse bg-emerald-500' : fin ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <Link to={`/bulk/ordenes/${o.id}`} className="font-mono text-sm font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{o.numero}</Link>
                    <Badge color={COLOR_ESTADO[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                    <button onClick={() => setChatOrden(o)} title={t('Chat de la orden')} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"><MessageSquare size={15} /></button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <User size={13} className="text-amber-500" />
                    <span className="font-semibold text-brand-navy dark:text-slate-100">{o.choferNombre || nombreCarrier(o.transportistaId)}</span>
                    <span className="text-slate-400">· {t(o.material)} · {o.pesoReal ?? o.pesoEstimado} ton</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                      <div className={`h-full rounded-full ${fin ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${avance(o)}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-slate-400">{avance(o)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      </div>

      {chatOrden && (
        <ModalChat titulo={`${t('Chat')} · ${chatOrden.numero}`} onClose={() => setChatOrden(null)}>
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
