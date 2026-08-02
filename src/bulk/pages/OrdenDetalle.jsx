import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Truck, User, Building2, Package, DollarSign, FileText, AlertTriangle, MessageSquare, CheckCircle2, Circle, Ban, Trash2, MoreVertical, ShieldAlert, Navigation, Camera, Settings } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { suscribirTrack } from '../data/tracking'
import { guardar } from '../data/repo'
import { auditar } from '../data/auditoria'
import { leerFotoReducida } from '../components/foto'
import { useBulkAuth } from '../BulkAuthContext'
import { desgloseVisible } from '../domain/pagos'
import { eliminarOrden, ordenFacturada, puedeCancelar } from '../data/ordenAcciones'
import { alertaOrden } from '../domain/alertas'
import ModalCancelarOrden from '../components/ModalCancelarOrden'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import MapaLeaflet from '../components/MapaLeaflet'
import ChatOrden from '../components/ChatOrden'
import { Card, Badge, Boton, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const COLOR_ESTADO = {
  creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy',
  cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green',
  cerrada: 'green', cancelada: 'red', rechazada: 'red',
}
const hora = (ts) => (ts ? new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)

export default function OrdenDetalle() {
  const { t } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenantId, rol, usuario } = useBulkAuth()
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: plantas } = useColeccion('plants')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: facturas } = useColeccion('invoices')
  const [track, setTrack] = useState([])
  const [accion, setAccion] = useState(null) // 'cancelar' | 'eliminar' | null
  const [menu, setMenu] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const esStaff = ['super_admin', 'admin', 'dispatcher'].includes(rol)
  const esAdmin = ['super_admin', 'admin'].includes(rol)
  const orden = useMemo(() => ordenes.find((o) => o.id === id) || null, [ordenes, id])

  useEffect(() => {
    if (!orden?.id) { setTrack([]); return }
    const off = suscribirTrack(tenantId, orden.id, setTrack)
    return off
  }, [tenantId, orden?.id])

  if (cargando) return <Cargando />
  if (!orden) return (
    <div>
      <Link to="/bulk/ordenes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver a Órdenes')}</Link>
      <EstadoVacio titulo={t('Orden no encontrada')} texto={t('Puede que se haya borrado o el enlace sea incorrecto.')} mostrarBoton={false} />
    </div>
  )

  const cliente = clientes.find((c) => c.id === orden.clienteId)
  const carrier = carriers.find((c) => c.id === orden.transportistaId)
  const planta = plantas.find((p) => p.id === orden.plantaId)
  const fin = desgloseVisible(orden, rol)
  const incs = incidencias.filter((i) => i.orden && i.orden === orden.numero)
  const hitosHechos = ORDEN_HITOS.filter((h) => orden.hitos?.[h.key]).length
  const atrasada = alertaOrden(orden, Date.now())

  // Navegar a la dirección de entrega con la app que elija el usuario.
  const navDest = orden.direccionEntrega ? encodeURIComponent(orden.direccionEntrega) : null
  const navUrls = navDest ? {
    google: `https://www.google.com/maps/dir/?api=1&destination=${navDest}`,
    waze: `https://waze.com/ul?q=${navDest}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${navDest}`,
  } : null

  // Cambio MANUAL de estado (staff) — con registro en auditoría de quién lo hizo.
  const cambiarEstado = async (nuevo) => {
    if (!nuevo || nuevo === orden.estado) return
    if (!window.confirm(`${t('¿Cambiar el estado a')} "${t(ORDEN_ESTADO_LABEL[nuevo])}"?`)) return
    await guardar('orders', orden.id, { estado: nuevo })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'estado_manual', entidad: 'orden', entidadId: orden.id, detalle: `${t(ORDEN_ESTADO_LABEL[orden.estado])} → ${t(ORDEN_ESTADO_LABEL[nuevo])}` })
  }
  // Subir/cambiar foto de la orden manualmente — con registro de quién.
  const subirFotoManual = async (e) => {
    const f = await leerFotoReducida(e.target.files?.[0]); if (!f) return
    await guardar('orders', orden.id, { fotoManual: { foto: f, por: usuario?.nombre || usuario?.email, ts: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'foto_manual', entidad: 'orden', entidadId: orden.id })
  }

  return (
    <div className="w-full">
      <Link to="/bulk/ordenes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver a Órdenes')}</Link>

      {atrasada && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={18} /> {atrasada.tipo === 'recogida' ? t('Lleva más de 3 h sin recogerse') : t('Lleva más de 3 h sin entregarse')} ({atrasada.horas} h)
        </div>
      )}

      {/* Encabezado */}
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Package size={24} /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-mono text-2xl font-black text-brand-navy dark:text-slate-100">{orden.numero}</h1>
              <Badge color={COLOR_ESTADO[orden.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[orden.estado])}</Badge>
              {orden.urgente && <Badge color="red">{t('Urgente')}</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(orden.material || 'material s/e')} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo || t('equipo s/e')}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] uppercase text-slate-400">{t('Avance')}</div>
            <div className="text-xl font-black text-brand-navy dark:text-slate-100">{Math.round((hitosHechos / ORDEN_HITOS.length) * 100)}%</div>
          </div>
        </div>

        {/* Acciones de gestión (staff cancela; admin/owner puede eliminar) */}
        {esStaff && (
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {navUrls && (
              <div className="relative">
                <Boton variant="ghost" onClick={() => setNavOpen((v) => !v)} className="px-3 py-1.5 text-xs"><Navigation size={14} /> {t('Navegar')}</Boton>
                {navOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNavOpen(false)} />
                    <div className="absolute left-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">{t('Abrir con')}</div>
                      {[{ k: 'google', l: 'Google Maps' }, { k: 'waze', l: 'Waze' }, { k: 'apple', l: 'Apple Maps' }].map((a) => (
                        <a key={a.k} href={navUrls[a.k]} target="_blank" rel="noreferrer" onClick={() => setNavOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand-navy hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><Navigation size={14} className="text-amber-500" /> {a.l}</a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {orden.estado === E.CANCELADA ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400"><Ban size={14} /> {t('Orden cancelada')}{orden.cancelacion?.motivo ? ` · ${orden.cancelacion.motivo}` : ''}</span>
            ) : puedeCancelar(orden) ? (
              <Boton variant="ghost" onClick={() => setAccion('cancelar')} className="px-3 py-1.5 text-xs"><Ban size={14} /> {t('Cancelar orden')}</Boton>
            ) : (
              <span className="text-xs text-slate-400">{t('Orden finalizada — no se puede cancelar.')}</span>
            )}
            {esAdmin && (
              <div className="relative ml-auto">
                <button onClick={() => setMenu((v) => !v)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title={t('Más acciones')}><MoreVertical size={18} /></button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <button onClick={() => { setMenu(false); setAccion('eliminar') }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"><Trash2 size={15} /> {t('Eliminar orden…')}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {accion === 'cancelar' && <ModalCancelarOrden orden={orden} onClose={() => setAccion(null)} onDone={() => setAccion(null)} ctx={{ tenantId, usuario, rol }} />}
      {accion === 'eliminar' && <ModalEliminar orden={orden} facturada={ordenFacturada(orden, facturas)} onClose={() => setAccion(null)} onDone={() => navigate('/bulk/ordenes')} ctx={{ tenantId, usuario, rol, facturas }} t={t} />}

      {/* Administración (staff): cambio manual de estado + foto — todo queda en auditoría */}
      {esStaff && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Settings size={16} className="text-amber-500" /> {t('Administración')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-[11px] uppercase text-slate-400">{t('Cambiar estado manualmente')}</div>
              <select value={orden.estado} onChange={(e) => cambiarEstado(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                {Object.values(E).map((es) => <option key={es} value={es}>{t(ORDEN_ESTADO_LABEL[es])}</option>)}
              </select>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-600">
              <Camera size={16} /> {orden.fotoManual?.foto ? t('Cambiar foto') : t('Subir foto')}
              <input type="file" accept="image/*" onChange={subirFotoManual} className="hidden" />
            </label>
            {orden.fotoManual?.foto && (
              <a href={orden.fotoManual.foto} target="_blank" rel="noreferrer" title={t('Ver foto')}>
                <img src={orden.fotoManual.foto} alt="foto" className="h-12 w-12 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
              </a>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('Cada cambio manual queda registrado en la auditoría (quién y cuándo).')}</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Datos */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Información')}</h3>
          <div className="space-y-2.5 text-sm">
            <Dato icon={Building2} label={t('Cliente')} val={cliente?.nombre || '—'} />
            <Dato icon={MapPin} label={t('Planta / origen')} val={planta ? `${planta.nombre}${planta.direccion ? ` · ${planta.direccion}` : ''}` : '—'} />
            <Dato icon={MapPin} label={t('Entrega (lo que ve el driver)')} val={orden.direccionEntrega || '—'} />
            {orden.po && <Dato icon={FileText} label="PO" val={orden.po} />}
            <Dato icon={Truck} label={t('Transporte')} val={carrier?.nombre || t('sin asignar')} />
            <Dato icon={User} label={t('Chofer')} val={orden.choferNombre || t('sin asignar')} />
            {'precioCliente' in fin && fin.precioCliente != null && <Dato icon={DollarSign} label={t('Precio cliente')} val={money(fin.precioCliente)} />}
            {'pagoChofer' in fin && fin.pagoChofer != null && <Dato icon={DollarSign} label={t('Pago chofer')} val={money(fin.pagoChofer)} />}
            {orden.ticket?.numero && <Dato icon={FileText} label={t('Ticket de carga')} val={`#${orden.ticket.numero}${orden.ticket.peso ? ` · ${orden.ticket.peso} ton` : ''}`} />}
          </div>
          {(orden.ticket?.foto || orden.pod?.foto) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {orden.ticket?.foto && (
                <a href={orden.ticket.foto} target="_blank" rel="noreferrer" title={t('Ver ticket completo')} className="group relative">
                  <img src={orden.ticket.foto} alt="ticket" className="max-h-44 rounded-lg border border-slate-200 object-cover transition group-hover:opacity-90 dark:border-slate-700" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('Ticket de carga')}</span>
                </a>
              )}
              {orden.pod?.foto && (
                <a href={orden.pod.foto} target="_blank" rel="noreferrer" title={t('Ver prueba de entrega')} className="group relative">
                  <img src={orden.pod.foto} alt="pod" className="max-h-44 rounded-lg border border-slate-200 object-cover transition group-hover:opacity-90 dark:border-slate-700" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">POD</span>
                </a>
              )}
            </div>
          )}
        </Card>

        {/* Trayectoria (hitos) */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Trayectoria')}</h3>
          <ol className="relative ml-1 space-y-3 border-l border-slate-200 pl-5 dark:border-slate-700">
            {ORDEN_HITOS.map((h) => {
              const ts = orden.hitos?.[h.key]
              return (
                <li key={h.key} className="relative">
                  <span className="absolute -left-[27px] top-0.5 grid place-items-center">
                    {ts ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                  </span>
                  <div className={`text-sm font-medium ${ts ? 'text-brand-navy dark:text-slate-100' : 'text-slate-400'}`}>{t(h.label)}{h.key === 'tomada' && ts && orden.choferNombre ? ` · ${orden.choferNombre}` : ''}</div>
                  <div className="text-xs text-slate-400">{hora(ts) || t('pendiente')}</div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>

      {/* Recorrido */}
      <Card className="mt-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Recorrido y geocercas')}</h3>
        <MapaLeaflet puntos={track} alto={360} />
        {(orden.geoEventos || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {orden.geoEventos.map((ev, i) => (
              <Badge key={i} color={ev.evento === 'entrada' ? 'green' : 'slate'}><MapPin size={11} className="mr-0.5 inline" />{ev.evento} · {ev.geocerca} · {hora(ev.ts)}</Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Incidencias */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={15} className="text-amber-500" /> {t('Incidencias')} ({incs.length})</h3>
          {incs.length === 0 ? <p className="text-sm text-slate-400">{t('Sin incidencias registradas para esta orden.')}</p> : (
            <div className="space-y-2">
              {incs.map((inc) => (
                <div key={inc.id} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-700/50">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold capitalize text-brand-navy dark:text-slate-100">{inc.tipo}</span><Badge color={inc.estado === 'resuelta' ? 'green' : inc.estado === 'en_proceso' ? 'gold' : 'red'}>{inc.estado}</Badge></div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{inc.descripcion}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Chat */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><MessageSquare size={15} className="text-amber-500" /> {t('Chat de la orden')}</h3>
          <ChatOrden orden={orden} alto={300} />
        </Card>
      </div>
    </div>
  )
}

function Dato({ icon: Icon, label, val }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="font-medium text-brand-navy dark:text-slate-100">{val}</div>
      </div>
    </div>
  )
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// Eliminar: doble confirmación (escribir el número). Bloqueado si está facturada.
function ModalEliminar({ orden, facturada, onClose, onDone, ctx, t }) {
  const [txt, setTxt] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const ok = txt.trim() === (orden.numero || '').trim()
  const confirmar = async () => {
    setOcupado(true)
    try { await eliminarOrden(orden, ctx); onDone() }
    catch (e) {
      if (e?.code === 'FACTURADA') window.alert(t('Esta orden está en una factura; cancélala o ajusta la factura primero.'))
      else window.alert(t('No se pudo eliminar la orden.'))
      setOcupado(false)
    }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="mb-1 flex items-center gap-2"><ShieldAlert size={18} className="text-rose-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Eliminar orden')} {orden.numero}</h3></div>
      {facturada ? (
        <>
          <div className="my-3 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{t('Esta orden está en una factura; cancélala o ajusta la factura primero.')} {t('Para no romper la contabilidad, no se puede eliminar una orden facturada.')}</span>
          </div>
          <div className="flex justify-end"><Boton variant="ghost" onClick={onClose} className="px-3 py-2 text-sm">{t('Entendido')}</Boton></div>
        </>
      ) : (
        <>
          <p className="my-2 text-sm text-slate-600 dark:text-slate-300">{t('Esta acción es permanente e irreversible: la orden se borrará por completo. Se guardará solo un registro en auditoría.')}</p>
          <label className="mb-1 block text-xs font-semibold text-slate-500">{t('Escribe el número de la orden para confirmar:')} <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span></label>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={orden.numero} className="mb-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          <div className="mt-3 flex justify-end gap-2">
            <Boton variant="ghost" onClick={onClose} disabled={ocupado} className="px-3 py-2 text-sm">{t('Volver')}</Boton>
            <Boton variant="danger" onClick={confirmar} disabled={ocupado || !ok} className="px-3 py-2 text-sm"><Trash2 size={15} /> {t('Sí, eliminar definitivamente')}</Boton>
          </div>
        </>
      )}
    </Overlay>
  )
}
