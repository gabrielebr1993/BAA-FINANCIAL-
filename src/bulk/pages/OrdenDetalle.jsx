import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Truck, User, Building2, Package, DollarSign, FileText, AlertTriangle, MessageSquare, CheckCircle2, Circle, Ban, Trash2, MoreVertical, ShieldAlert, Navigation, Camera, Settings, UserPlus, Wifi, Search, History, Printer } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { suscribirTrack } from '../data/tracking'
import { guardar, siguienteSecuencia } from '../data/repo'
import { datosTicket } from '../domain/documentos'
import TicketOrden from '../components/TicketOrden'
import { auditar } from '../data/auditoria'
import { leerFotoReducida } from '../components/foto'
import { useBulkAuth } from '../BulkAuthContext'
import { desgloseVisible } from '../domain/pagos'
import { resumenIntentos, INTENTO_LABEL, INTENTO_COLOR } from '../domain/historialAsignacion'
import { eliminarOrden, ordenFacturada, puedeCancelar } from '../data/ordenAcciones'
import { asignarOrdenManual, asignarOrdenATransporte } from '../data/asignacionManual'
import { liberar } from '../data/presencia'
import { equipoCompatible, choferDisponible } from '../domain/asignacionAuto'
import { calcularPagoChofer, configDeChofer } from '../domain/pagoChofer'
import { alertaOrden } from '../domain/alertas'
import ModalCancelarOrden from '../components/ModalCancelarOrden'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
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
  const { tenantId, rol, usuario, permisos } = useBulkAuth()
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: plantas } = useColeccion('plants')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: materiales } = useColeccion('materials')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: facturas } = useColeccion('invoices')
  const { datos: presencias } = useColeccion('presence')
  const { datos: carrierConfigs } = useColeccion('carrierConfig')
  const [track, setTrack] = useState([])
  const [accion, setAccion] = useState(null) // 'cancelar' | 'eliminar' | null
  const [menu, setMenu] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [transporteSel, setTransporteSel] = useState('')
  const [ticketEvt, setTicketEvt] = useState(null) // 'Loaded' | 'Received'
  const [ticketMenu, setTicketMenu] = useState(false)

  const esStaff = ['super_admin', 'admin', 'dispatcher'].includes(rol)
  const esAdmin = ['super_admin', 'admin'].includes(rol)
  const orden = useMemo(() => ordenes.find((o) => o.id === id) || null, [ordenes, id])
  const jobsMap = useMemo(() => { const m = {}; for (const j of jobs || []) m[j.id] = j; return m }, [jobs])
  const plantasMap = useMemo(() => { const m = {}; for (const p of plantas || []) m[p.id] = p; return m }, [plantas])
  const carriersMap = useMemo(() => { const m = {}; for (const c of carriers || []) m[c.id] = c; return m }, [carriers])
  const materialesMap = useMemo(() => { const m = {}; for (const x of materiales || []) m[(x.nombre || '').trim().toLowerCase()] = x; return m }, [materiales])

  // Genera (si falta) el número correlativo del ticket y abre la vista imprimible.
  const abrirTicket = async (evt) => {
    setTicketMenu(false)
    const campo = evt === 'Loaded' ? 'ticketCarga' : 'ticketEntrega'
    if (orden && !orden[campo]) {
      try {
        const seq = await siguienteSecuencia(tenantId, campo)
        const num = `${evt === 'Loaded' ? 'TC' : 'TE'}-${String(seq).padStart(6, '0')}`
        await guardar('orders', orden.id, { [campo]: num })
        auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_ticket', entidad: 'orden', detalle: `${num} · ${orden.numero} · ${evt}` })
      } catch { /* si falla la secuencia, se usa el número de orden como respaldo */ }
    } else {
      auditar(tenantId, { usuario: usuario?.email, rol, accion: 'imprimir_ticket', entidad: 'orden', detalle: `${orden?.[campo] || orden?.numero} · ${evt}` })
    }
    setTicketEvt(evt)
  }
  const guardarCampoOrden = (campo) => (e) => { const v = e.target.value; if (orden && (orden[campo] || '') !== v) guardar('orders', orden.id, { [campo]: v }) }

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
  const fin = desgloseVisible(orden, rol, permisos)
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
    // REGLA CRÍTICA: 'entregada' NUNCA se escribe directo — ni siquiera el staff.
    // Requiere el token del supervisor y pasa por el backend (bulkEntregarOrden);
    // las reglas de Firestore bloquean cualquier otro camino.
    if (nuevo === E.ENTREGADA) { setAccion('entregar'); return }
    if (nuevo === E.LIBERADA && orden.estado !== E.ENTREGADA) {
      window.alert(t('Una orden no puede pasar a Liberada sin ser entregada con autorización del supervisor. Usa «Marcar entregada» (pide el código del supervisor).'))
      return
    }
    if (!window.confirm(`${t('¿Cambiar el estado a')} "${t(ORDEN_ESTADO_LABEL[nuevo])}"?`)) return
    await guardar('orders', orden.id, { estado: nuevo })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'estado_manual', entidad: 'orden', entidadId: orden.id, detalle: `${t(ORDEN_ESTADO_LABEL[orden.estado])} → ${t(ORDEN_ESTADO_LABEL[nuevo])}` })
  }
  // Liberación REMOTA por el admin (§8): cuando el supervisor no está disponible.
  // Requiere motivo, doble confirmación y queda auditada.
  const liberarRemoto = async () => {
    const motivo = window.prompt(t('Motivo de la liberación remota:'))
    if (motivo == null) return
    if (!window.confirm(t('¿Confirmas la liberación remota de esta carga? Quedará auditada.'))) return
    await guardar('orders', orden.id, {
      estado: E.LIBERADA, hitos: { ...(orden.hitos || {}), liberacion: new Date().toISOString() },
      liberacion: { modo: 'remoto', por: usuario?.nombre || usuario?.email, motivo: motivo.trim() || 'Sin motivo', ts: new Date().toISOString() },
    })
    // Libera la presencia del chofer (si no, queda 'ocupado' y el matcher lo ignora).
    if (orden.choferId) { try { await liberar(orden.choferId) } catch { /* noop */ } }
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberacion_remota', entidad: 'orden', entidadId: orden.id, detalle: motivo.trim() })
  }
  // Subir/cambiar foto de la orden manualmente — con registro de quién.
  const subirFotoManual = async (e) => {
    const f = await leerFotoReducida(e.target.files?.[0]); if (!f) return
    await guardar('orders', orden.id, { fotoManual: { foto: f, por: usuario?.nombre || usuario?.email, ts: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'foto_manual', entidad: 'orden', entidadId: orden.id })
  }

  return (
    <div className="w-full">
      {ticketEvt && (
        <TicketOrden
          datos={datosTicket(orden, ticketEvt, { jobsMap, plantasMap, carriersMap, materialesMap })}
          empresa={usuario?.empresa || 'Freight'}
          onClose={() => setTicketEvt(null)}
        />
      )}
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
              {orden.pesoRevisar && <Badge color="red">{t('Revisar peso')}</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(orden.material || 'material s/e')} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo || t('equipo s/e')}</div>
            {orden.pesoRevisar && (
              <div className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[12px] font-medium text-rose-600 dark:text-rose-400">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {t('El OCR no pudo leer el peso del ticket; el chofer lo puso a mano. Verifica el peso contra la foto del ticket.')}
              </div>
            )}
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
            {/* Imprimir ticket de material (carga / entrega) */}
            <div className="relative">
              <Boton variant="ghost" onClick={() => setTicketMenu((v) => !v)} className="px-3 py-1.5 text-xs"><Printer size={14} /> {t('Imprimir ticket')}</Boton>
              {ticketMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTicketMenu(false)} />
                  <div className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <button onClick={() => abrirTicket('Loaded')} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-brand-navy hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><Package size={15} className="text-emerald-500" /> {t('Ticket de carga')} <span className="ml-auto font-mono text-[11px] text-slate-400">{orden.ticketCarga || 'TC'}</span></button>
                    <button onClick={() => abrirTicket('Received')} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-brand-navy hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><CheckCircle2 size={15} className="text-brand-navy dark:text-amber-400" /> {t('Ticket de entrega')} <span className="ml-auto font-mono text-[11px] text-slate-400">{orden.ticketEntrega || 'TE'}</span></button>
                  </div>
                </>
              )}
            </div>
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

      {/* Recorrido de asignación (auditoría): a quién se ofreció, quién rechazó / dejó
          vencer el tiempo y quién aceptó. Solo staff. */}
      {esStaff && orden.intentos?.length > 0 && (() => {
        const res = resumenIntentos(orden.intentos)
        const dur = res.tiempoTotalMs != null ? `${Math.floor(res.tiempoTotalMs / 60000)}m ${Math.round((res.tiempoTotalMs % 60000) / 1000)}s` : null
        return (
          <Card className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><History size={16} className="text-amber-500" /> {t('Recorrido de asignación')}</div>
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
              <Badge color="navy">{t('Intentos')}: {res.total}</Badge>
              {res.rechazados > 0 && <Badge color="red">{t('Rechazados')}: {res.rechazados}</Badge>}
              {res.expirados > 0 && <Badge color="slate">{t('Expirados')}: {res.expirados}</Badge>}
              {res.aceptado && <Badge color="green">{t('Aceptó')}: {res.aceptado.choferNombre}</Badge>}
              {dur && <Badge color="gold">{t('Tiempo total')}: {dur}</Badge>}
            </div>
            <ol className="space-y-2">
              {orden.intentos.map((it, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 border-l-2 border-slate-200 pl-3 text-sm dark:border-slate-700">
                  <Badge color={INTENTO_COLOR[it.estado] || 'slate'}>{t(INTENTO_LABEL[it.estado] || it.estado)}</Badge>
                  <span className="font-semibold text-brand-navy dark:text-slate-100">{it.choferNombre || t('Chofer')}</span>
                  {it.ronda > 1 && <span className="text-[11px] text-slate-400">· {t('ronda')} {it.ronda}</span>}
                  <span className="ml-auto text-xs text-slate-400">{hora(it.ofrecidoEn) || '—'}{it.respondidoEn ? ` → ${hora(it.respondidoEn)}` : ''}</span>
                  {it.motivo && <span className="w-full text-[11px] text-slate-400">{t('Motivo')}: {it.motivo}</span>}
                </li>
              ))}
            </ol>
          </Card>
        )
      })()}

      {accion === 'entregar' && <ModalEntregarConToken orden={orden} onClose={() => setAccion(null)} t={t} />}
      {accion === 'asignar' && <ModalAsignar orden={orden} carriers={carriers} presencias={presencias} carrierConfigs={carrierConfigs} onClose={() => setAccion(null)} onDone={() => setAccion(null)} ctx={{ tenantId, usuario, rol }} t={t} />}
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
            {![E.CANCELADA, E.ENTREGADA, E.LIBERADA, E.CERRADA].includes(orden.estado) && (
              <div>
                <div className="mb-1 text-[11px] uppercase text-slate-400">{orden.choferId ? t('Reasignar / transferir') : t('Asignar a un chofer')}</div>
                <Boton variant="gold" onClick={() => setAccion('asignar')} className="px-3 py-2 text-sm"><UserPlus size={15} /> {orden.choferId ? t('Transferir orden') : t('Asignar manualmente')}</Boton>
              </div>
            )}
            {/* Asignar a un TRANSPORTE (sin chofer): cae en la Cola de ese transporte,
                grupo "Esperando chofer", para que él le ponga uno de sus choferes. */}
            {![E.CANCELADA, E.ENTREGADA, E.LIBERADA, E.CERRADA].includes(orden.estado) && (
              <div>
                <div className="mb-1 text-[11px] uppercase text-slate-400">{t('Asignar a un transporte')}</div>
                <div className="flex items-center gap-2">
                  <select value={transporteSel} onChange={(e) => setTransporteSel(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    <option value="">{t('— Elegir transporte —')}</option>
                    {carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <Boton variant="ghost" disabled={!transporteSel} onClick={async () => { await asignarOrdenATransporte(tenantId, orden, transporteSel, { usuario, rol }); setTransporteSel('') }} className="px-3 py-2 text-sm"><Truck size={15} /> {t('Asignar a transporte')}</Boton>
                </div>
              </div>
            )}
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
          {orden.estado === E.ENTREGADA && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-500/5 p-3 dark:border-amber-500/30">
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t('Liberación de carga')}</div>
              {orden.liberacion && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('Confianza evaluada')}: <b>{orden.liberacion.nivel || '—'}</b>
                  {orden.liberacion.razones && orden.liberacion.razones.length ? ` · ${orden.liberacion.razones.join(', ')}` : ''}
                </div>
              )}
              <div className="mt-2"><Boton variant="gold" onClick={liberarRemoto}><ShieldAlert size={15} /> {t('Liberar carga (remoto)')}</Boton></div>
              <p className="mt-1 text-[11px] text-slate-400">{t('Para cuando el supervisor no está disponible. Requiere motivo y queda auditada.')}</p>
            </div>
          )}
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

          {/* Datos del ticket (editables por staff): completan el material ticket. Si se
              dejan vacíos, el ticket los deriva de la planta/equipo automáticamente. */}
          {esStaff && (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-3">
              {[{ k: 'supplier', l: t('Supplier (proveedor)') }, { k: 'camion', l: t('Truck # (camión)') }, { k: 'origen', l: t('Origin (origen)') }].map((c) => (
                <label key={c.k} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.l}</span>
                  <input defaultValue={orden[c.k] || ''} onBlur={guardarCampoOrden(c.k)} placeholder={t('(auto)')} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                </label>
              ))}
            </div>
          )}
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

// Asignar / transferir MANUAL: el dispatcher elige el chofer. Lista a los choferes
// del roster de cada transportista, marca quién está EN LÍNEA y avisa si el equipo
// no coincide con el que pide la orden (se puede asignar igual, con confirmación).
function ModalAsignar({ orden, carriers, presencias, carrierConfigs, onClose, onDone, ctx, t }) {
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const now = Date.now()
  const claveN = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // uid de choferes en línea y libres (para el badge y el orden).
  const online = new Map()
  for (const p of (presencias || [])) {
    if (p.uid && choferDisponible(p, now)) online.set(p.uid, p)
  }

  // Candidatos = choferes del roster de cada transportista (con su uid si ya entró).
  const candidatos = []
  for (const c of (carriers || [])) {
    for (const d of (c.choferes || [])) {
      const uid = d.uid || null
      const equipos = (d.equipos && d.equipos.length) ? d.equipos : (d.equipo ? [d.equipo] : [])
      candidatos.push({
        key: `${c.id}:${d.id || d.nombre}`,
        uid, id: d.id || null, nombre: d.nombre || '—',
        carrierId: c.id, carrierNombre: c.nombre || '',
        equipos, enLinea: !!(uid && online.has(uid)),
        compatible: equipoCompatible(equipos, orden.tipoEquipo),
        actual: (uid && uid === orden.choferId) || (d.id && d.id === orden.choferId) || (orden.choferNombre && claveN(orden.choferNombre) === claveN(d.nombre)),
      })
    }
  }
  const q = busca.trim().toLowerCase()
  const lista = candidatos
    .filter((x) => !q || x.nombre.toLowerCase().includes(q) || x.carrierNombre.toLowerCase().includes(q))
    .sort((a, b) => (b.enLinea - a.enLinea) || (b.compatible - a.compatible) || a.nombre.localeCompare(b.nombre))

  const asignar = async (cand) => {
    if (cand.actual) { window.alert(t('Esta orden ya está con ese chofer.')); return }
    if (!cand.compatible && !window.confirm(`${t('Ese chofer no tiene el equipo que pide la orden')} (${orden.tipoEquipo || '—'}). ${t('¿Asignar de todos modos?')}`)) return
    setOcupado(true)
    try {
      // Pago del chofer según la config de su transportista (consistente con las
      // demás vías de asignación). cand.id es el id del roster que usa la config.
      const cfg = (carrierConfigs || []).find((c) => c.id === cand.carrierId)?.pagoChoferes || {}
      const pago = cand.id ? calcularPagoChofer(orden.precioTransportista, configDeChofer(cfg, cand.id)) : null
      await asignarOrdenManual(ctx.tenantId, orden, cand, ctx, { pagoChofer: pago != null ? pago : undefined })
      onDone()
    } catch (e) {
      window.alert(t('No se pudo asignar: ') + (e?.message || ''))
      setOcupado(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="mb-1 flex items-center gap-2"><UserPlus size={18} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{orden.choferId ? t('Transferir orden') : t('Asignar orden')} {orden.numero}</h3></div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{t('Se le ofrece la orden al chofer que elijas; le llega la notificación y debe aceptarla. Pide equipo:')} <b>{orden.tipoEquipo || t('cualquiera')}</b>.</p>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('Buscar chofer o transportista…')} className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" autoFocus />
      </div>
      <div className="scroll-thin max-h-72 space-y-1.5 overflow-y-auto">
        {lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{t('No hay choferes en el roster. Agrégalos en Transportistas.')}</p>
        ) : lista.map((cand) => (
          <button
            key={cand.key}
            onClick={() => asignar(cand)}
            disabled={ocupado || cand.actual}
            className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition disabled:opacity-60 ${cand.actual ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10' : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800"><User size={16} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{cand.nombre}</span>
                {cand.enLinea && <Badge color="green"><Wifi size={10} className="mr-0.5 inline" />{t('en línea')}</Badge>}
                {cand.actual && <Badge color="green">{t('actual')}</Badge>}
              </div>
              <div className="truncate text-xs text-slate-400">{cand.carrierNombre} · {cand.equipos.length ? cand.equipos.join(', ') : t('sin equipo')}</div>
            </div>
            {!cand.compatible && <span className="flex-shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" title={t('El equipo no coincide con el que pide la orden')}>≠ {t('equipo')}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><Boton variant="ghost" onClick={onClose} disabled={ocupado} className="px-3 py-2 text-sm">{t('Cerrar')}</Boton></div>
    </Overlay>
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

// ── Entrega manual del STAFF con token de supervisor ────────────────────────
// "Autorización de supervisor requerida": el staff tampoco puede marcar
// 'entregada' sin un código válido. Llama al MISMO backend que el chofer
// (bulkEntregarOrden), que valida token, alcance, unicidad y concurrencia.
function ModalEntregarConToken({ orden, onClose, t }) {
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const entregar = async () => {
    if (!token.trim() || ocupado) return
    setOcupado(true); setErr('')
    try {
      const fn = httpsCallable(funcsBulk, 'bulkEntregarOrden', { timeout: 30000 })
      await fn({ orderId: orden.id, token: token.trim() })
      setOk(true)
    } catch (e) {
      const m = e?.message || ''
      setErr(/inválido|invalido|expirado|permission/i.test(m)
        ? t('Código inválido o expirado. La orden no puede ser entregada.')
        : /Demasiados/i.test(m) ? t('Demasiados intentos fallidos. Espera unos minutos.')
          : /ya fue entregada/i.test(m) ? t('Esta orden ya fue entregada.') : (m || t('No se pudo completar la entrega.')))
    } finally { setOcupado(false) }
  }
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={ocupado ? undefined : onClose}>
      <Card className="w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        {ok ? (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={28} /></div>
            <h3 className="mt-3 text-base font-black text-brand-navy dark:text-slate-100">{t('Orden liberada por supervisor')}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{orden.numero} {t('quedó entregada y liberada. Todo quedó auditado.')}</p>
            <Boton variant="gold" className="mt-4 w-full justify-center" onClick={onClose}>{t('Listo')}</Boton>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><ShieldAlert size={18} /></span>
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Autorización de supervisor requerida')}</h3>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {t('Para marcar')} <b className="font-mono">{orden.numero}</b> {t('como entregada, escribe el código vigente del supervisor de este trabajo (cambia cada pocos segundos; lo ve en su pantalla «Mi código»).')}
            </p>
            <input inputMode="numeric" maxLength={6} autoFocus value={token}
              onChange={(e) => { setToken(e.target.value.replace(/\D/g, '')); setErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && entregar()}
              placeholder="000000"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-center font-mono text-2xl font-black tracking-[0.35em] outline-none focus:border-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            {err && <p className="mt-2 text-xs font-semibold text-rose-500">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={onClose} disabled={ocupado}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={entregar} disabled={ocupado || token.length !== 6}>{ocupado ? t('Validando…') : t('Validar y entregar')}</Boton>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
