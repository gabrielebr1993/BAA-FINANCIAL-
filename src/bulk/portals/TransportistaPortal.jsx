// ============================================================================
// BULK · Portal del TRANSPORTISTA — mismo lenguaje visual del panel del admin
// (KPIs, tablas, badges, colores navy/dorado/verde/crema), pero mostrando SOLO lo
// de su propio carrier. AISLAMIENTO: todas las consultas filtran por su carrierId
// (== bulkCarrierId del claim); las reglas de Firestore refuerzan el aislamiento.
//   Pestañas: Órdenes · Mis choferes · Equipos · Estado de cuenta · Mensajes.
// ============================================================================
import { useMemo, useState } from 'react'
import {
  Truck, ClipboardList, Users, DollarSign, Phone, IdCard,
  MessageSquare, Plus, X, UserPlus, Wallet, Search, Trash2, MapPin, FileText, Radio,
} from 'lucide-react'
import RepararAcceso from '../components/RepararAcceso'
import PortalLayout from '../components/PortalLayout'
import PanelConversaciones from '../components/PanelConversaciones'
import { convCarrier, noLeidosPorConv, resumenPorConversacion } from '../data/chat'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { crearConId, guardar, where, documentId } from '../data/repo'
import { asignarOrdenManual } from '../data/asignacionManual'
import { auditar } from '../data/auditoria'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import { notificacionesTransportista } from '../domain/notificaciones'
import { BULK_ROLES, ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { calcularPagoChofer, configDeChofer, etiquetaPago } from '../domain/pagoChofer'
import { PRESENCIA_TTL_MS } from '../domain/asignacionAuto'
import { tsMillis } from '../data/chatKeys'
import { Card, KPI, Badge, Cargando, Aviso, EstadoVacio, Select, Input, Boton, Tabla } from '../../components/ui'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const FINAL = [...ENTREGADAS, E.CANCELADA]
const nuevoId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const fecha = (v) => (v ? new Date(tsMillis(v) || v).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—')
const FLOTA_ESTADO = { disponible: { c: 'green', l: 'Disponible' }, en_viaje: { c: 'blue', l: 'En viaje' }, mantenimiento: { c: 'gold', l: 'Mantenimiento' } }

export default function TransportistaPortal() {
  const { t } = useLang()
  const { usuario, tenantId, rol, crearUsuario, puede } = useBulkAuth()
  const carrierId = usuario?.carrierId || '__none__'

  // ── Datos (TODO filtrado a MI carrier) ─────────────────────────────────────
  const { datos: _ordenesRaw, cargando } = useColeccion('orders', [where('transportistaId', '==', carrierId)])
  const { datos: pagosCarrier } = useColeccion('orderPay_carrier', [where('transportistaId', '==', carrierId)])
  const { datos: pagosChofer } = useColeccion('orderPay_chofer', [where('transportistaId', '==', carrierId)])
  const { datos: carriers } = useColeccion('carriers', [where(documentId(), '==', carrierId)])
  const { datos: configs } = useColeccion('carrierConfig', [where(documentId(), '==', carrierId)])
  const { datos: statements } = useColeccion('carrierStatements', [where('carrierId', '==', carrierId)])
  const { datos: presencias } = useColeccion('presence', [where('carrierId', '==', carrierId)])
  const { datos: plantas } = useColeccion('plants')
  const { datos: mensajes } = useColeccion('messages', [where('orderId', '==', convCarrier(carrierId))])
  // Chats de ORDEN en los que participa este transporte (para hablar con sus choferes,
  // organizados por viaje). El aislamiento lo garantizan las reglas (carrierId ∈ participantes).
  const { datos: mensajesOrdenes } = useColeccion('messages', [where('participantes', 'array-contains', carrierId)])

  const ordenes = useMemo(() => {
    const mc = {}; for (const p of pagosCarrier || []) mc[p.orderId || p.id] = p.precioTransportista
    const md = {}; for (const p of pagosChofer || []) md[p.orderId || p.id] = p.pagoChofer
    return (_ordenesRaw || []).map((o) => ({
      ...o,
      precioTransportista: mc[o.id] != null ? mc[o.id] : o.precioTransportista,
      pagoChofer: md[o.id] != null ? md[o.id] : o.pagoChofer,
    }))
  }, [_ordenesRaw, pagosCarrier, pagosChofer])

  const [tab, setTab] = useState('cola')
  const carrier = carriers.find((c) => c.id === carrierId)
  const choferes = carrier?.choferes || []
  const config = configs.find((c) => c.id === carrierId) || {}
  const pagoChoferes = config.pagoChoferes || {}
  const flota = config.flota || []
  const nombrePlanta = (id) => plantas.find((p) => p.id === id)?.nombre || ''
  const rosterIdDe = (id) => choferes.find((c) => c.uid === id)?.id || id

  const noLeidosOficina = (noLeidosPorConv(mensajes, usuario?.id)[convCarrier(carrierId)]) || 0
  // Resumen de los chats de orden (por chofer/viaje) para la sección CHOFERES.
  const resumenOrd = useMemo(() => resumenPorConversacion(mensajesOrdenes, usuario?.id), [mensajesOrdenes, usuario])
  const noLeidosChoferes = useMemo(() => Object.values(resumenOrd).reduce((a, r) => a + (r.noLeidos || 0), 0), [resumenOrd])
  const mensajesNuevos = noLeidosOficina + noLeidosChoferes
  // Secciones del panel de mensajes: CHOFERES (chats por viaje) · ADMINISTRADOR (oficina).
  const seccionesMsg = useMemo(() => {
    const fotoChofer = (nombre) => { const k = (nombre || '').trim().toLowerCase(); return (choferes.find((d) => (d.nombre || '').trim().toLowerCase() === k)?.foto) || null }
    const itemsChoferes = ordenes
      .filter((o) => resumenOrd[o.id] || !FINAL.includes(o.estado))
      .filter((o) => o.choferNombre) // solo órdenes con chofer asignado (a quién escribir)
      .map((o) => {
        const r = resumenOrd[o.id] || {}
        return { key: o.id, chatId: o.id, icon: 'chofer', foto: fotoChofer(o.choferNombre), titulo: o.choferNombre, rolLabel: t('Conductor'), rolColor: 'navy', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', lastText: r.lastText || '', lastTs: r.lastTs || o.creadoEn || '', noLeidos: r.noLeidos || 0, participantes: [o.choferId, o.transportistaId, o.clienteId].filter(Boolean) }
      })
    const rOfi = resumenPorConversacion(mensajes, usuario?.id)[convCarrier(carrierId)] || {}
    const itemsAdmin = [{ key: convCarrier(carrierId), chatId: convCarrier(carrierId), icon: 'admin', titulo: t('Administrador / Oficina'), rolLabel: t('Administrador'), rolColor: 'navy', lastText: rOfi.lastText || '', lastTs: rOfi.lastTs || '', noLeidos: noLeidosOficina, participantes: null }]
    return [
      { k: 'choferes', label: t('Choferes'), icon: 'chofer', items: itemsChoferes, vacio: t('Sin conversaciones con tus choferes todavía.') },
      { k: 'admin', label: t('Administrador'), icon: 'admin', items: itemsAdmin, vacio: t('Sin mensajes con la oficina.') },
    ]
  }, [ordenes, resumenOrd, mensajes, usuario, carrierId, noLeidosOficina, choferes, t])
  const notifsT = useMemo(() => notificacionesTransportista({ ordenes, statements, mensajesNuevos, ahoraMs: Date.now() }), [ordenes, statements, mensajesNuevos])

  // Presencia viva (en línea) por uid de chofer.
  const now = Date.now()
  const enLineaUid = useMemo(() => {
    const s = new Set()
    for (const p of presencias || []) {
      if (p.enLinea === true && (now - tsMillis(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS) s.add(p.uid || p.id)
    }
    return s
  }, [presencias, now])
  const choferEnLinea = (c) => enLineaUid.has(c.uid) || enLineaUid.has(c.id)
  const viajeActual = (c) => ordenes.find((o) => !FINAL.includes(o.estado) && (o.choferId === c.uid || o.choferId === c.id))

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const util = entregadas.reduce((a, o) => a + ((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0)), 0)
    const ganado = entregadas.reduce((a, o) => a + (Number(o.precioTransportista) || 0), 0)
    return { viajes: entregadas.length, activas: ordenes.filter((o) => !FINAL.includes(o.estado)).length, util, ganado, entregadas }
  }, [ordenes])
  const choferesEnLineaN = choferes.filter(choferEnLinea).length

  // ── Estado de cuenta ────────────────────────────────────────────────────────
  const cuenta = useMemo(() => {
    const pagado = (statements || []).filter((s) => s.estado === 'pagado').reduce((a, s) => a + (Number(s.total) || 0), 0)
    return { ganado: stats.ganado, pagado, pendiente: Math.max(0, stats.ganado - pagado) }
  }, [statements, stats.ganado])

  // ── Acciones ────────────────────────────────────────────────────────────────
  const guardarPago = async (driverId, tipo, valor) => {
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: { ...pagoChoferes, [driverId]: { tipo, valor: Number(valor) || 0 } } })
  }
  const quitarPago = async (driverId) => {
    const next = { ...pagoChoferes }; delete next[driverId]
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: next })
  }
  const asignarChofer = async (orden, driverId) => {
    const d = choferes.find((c) => c.id === driverId)
    const pago = calcularPagoChofer(orden.precioTransportista, configDeChofer(pagoChoferes, driverId))
    await asignarOrdenManual(tenantId, orden, { uid: d?.uid || null, id: driverId, nombre: d?.nombre || '', carrierId: orden.transportistaId || carrierId }, { usuario, rol }, { pagoChofer: pago != null ? pago : undefined })
  }
  // Alta de chofer: agrega al roster de MI carrier y, si se dio correo/clave, crea su
  // cuenta de acceso (rol chofer, mismo carrier) para que entre a la app del chofer.
  const agregarChofer = async ({ nombre, email, password, telefono, licencia, equipo }) => {
    let uid = null
    if (email && password) {
      const r = await crearUsuario({ nombre, email, password, rol: BULK_ROLES.CHOFER, carrierId })
      uid = r?.uid || null
    }
    const chofer = { id: nuevoId('d'), nombre: nombre.trim(), telefono: (telefono || '').trim(), licencia: (licencia || '').trim(), equipos: equipo ? [equipo] : [], equipo: equipo || '', uid, activo: true }
    await guardar('carriers', carrierId, { choferes: [...choferes, chofer] })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'alta_chofer', entidad: 'chofer', detalle: `${chofer.nombre}${uid ? ' (con acceso)' : ''}` })
  }
  const toggleActivoChofer = async (chofer) => {
    await guardar('carriers', carrierId, { choferes: choferes.map((d) => (d.id === chofer.id ? { ...d, activo: d.activo === false } : d)) })
  }
  // Flota (equipos/camiones) del carrier → vive en carrierConfig (lo escribe el propio
  // transportista). No toca carrier.equipos (tipos aprobados, que gestiona el admin).
  const guardarFlota = async (lista) => { await crearConId('carrierConfig', carrierId, tenantId, { flota: lista }) }
  const agregarEquipo = async (v) => guardarFlota([...flota, { id: nuevoId('v'), ...v }])
  const editarEquipo = async (id, patch) => guardarFlota(flota.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const eliminarEquipo = async (id) => guardarFlota(flota.filter((f) => f.id !== id))

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  const items = [
    // "Órdenes" (solo las afiliadas a su transporte) — controlable desde Roles con
    // el permiso ordenes.ver (activado por defecto para el transportista).
    // "Cola" = sus órdenes ACTIVAS (por asignar / en curso) para despachar sus
    // choferes. "Órdenes" = todas sus órdenes afiliadas (lista completa/historial).
    // Ambas controlables desde Roles con ordenes.ver (activado por defecto).
    ...(puede('ordenes.ver') ? [{ k: 'cola', label: t('Cola'), icon: Radio }] : []),
    ...(puede('ordenes.ver') ? [{ k: 'ordenes', label: t('Órdenes'), icon: ClipboardList }] : []),
    { k: 'choferes', label: t('Mis choferes'), icon: Users },
    { k: 'equipos', label: t('Equipos'), icon: Truck },
    { k: 'cuenta', label: t('Estado de cuenta'), icon: Wallet },
    // "Facturación" (sus avisos de pago) aparece SOLO si el admin le activó el
    // permiso facturacion.ver en la pantalla de Roles.
    ...(puede('facturacion.ver') ? [{ k: 'facturacion', label: t('Facturación'), icon: FileText }] : []),
    { k: 'mensajes', label: t('Mensajes'), icon: MessageSquare, badge: mensajesNuevos },
  ]
  // Sección activa: si la actual quedó oculta por permisos, cae a la primera visible.
  const activo = items.some((i) => i.k === tab) ? tab : (items[0]?.k || 'mensajes')

  return (
    <PortalLayout
      icon={Truck}
      titulo={carrier?.nombre || usuario?.nombre}
      subtitulo={t('Transportista')}
      items={items}
      activo={activo}
      onSelect={setTab}
      campana={<CampanaNotificaciones notifs={notifsT} claveLS="bulk_notif_transportista" />}
      aviso={!usuario?.carrierId && (
        <Aviso tipo="warn" className="mb-3">
          <div>{t('Tu cuenta no está ligada a un transportista. Si el administrador ya la asignó, toca “Reparar mi acceso”. Si no, pídele que la asigne.')}</div>
          <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
        </Aviso>
      )}
    >
      {/* KPIs (mismas tarjetas del admin), persistentes arriba del contenido */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label={t('Órdenes activas')} value={stats.activas} icon={ClipboardList} accent="navy" />
        <KPI label={t('Viajes hechos')} value={stats.viajes} icon={Truck} accent="green" />
        <KPI label={t('Choferes en línea')} value={choferesEnLineaN} icon={Users} accent="gold" />
        <KPI label={t('Tu utilidad')} value={money(stats.util)} icon={DollarSign} accent="blue" />
      </div>

      {activo === 'cola' && puede('ordenes.ver') && <TabCola {...{ t, ordenes, nombrePlanta }} />}
      {activo === 'ordenes' && puede('ordenes.ver') && <TabOrdenes {...{ t, ordenes, choferes, rosterIdDe, asignarChofer, nombrePlanta }} />}
      {activo === 'choferes' && <TabChoferes {...{ t, choferes, choferEnLinea, viajeActual, pagoChoferes, guardarPago, quitarPago, toggleActivoChofer, agregarChofer }} />}
      {activo === 'equipos' && <TabEquipos {...{ t, flota, choferes, carrier, agregarEquipo, editarEquipo, eliminarEquipo }} />}
      {activo === 'cuenta' && <TabCuenta {...{ t, cuenta, stats, statements }} />}
      {activo === 'facturacion' && puede('facturacion.ver') && <TabFacturacion {...{ t, statements, cuenta }} />}
      {activo === 'mensajes' && (
        usuario?.carrierId
          ? <PanelConversaciones secciones={seccionesMsg} alturaClass="h-[calc(100vh-11rem)]" />
          : <Card className="p-4"><span className="text-sm text-slate-400">{t('Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.')}</span></Card>
      )}
    </PortalLayout>
  )
}

// ── Tab Cola / En proceso: solo LECTURA. Muestra las órdenes de su transporte que
// un chofer YA ACEPTÓ y están en curso (aceptada → en destino). La asignación de
// choferes se hace en la pestaña "Órdenes"; aquí no se asigna.
const EN_PROCESO_EST = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
function TabCola({ t, ordenes, nombrePlanta }) {
  const PRIO = { aceptada: 0, en_planta: 1, cargando: 2, en_ruta: 3, en_destino: 4 }
  const cola = ordenes.filter((o) => EN_PROCESO_EST.includes(o.estado))
    .sort((a, b) => (PRIO[a.estado] ?? 9) - (PRIO[b.estado] ?? 9) || (a.numero || '').localeCompare(b.numero || ''))

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Truck size={16} className="text-amber-500" />
        <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En proceso')}</h3>
        <Badge color="gold">{cola.length}</Badge>
      </div>
      {cola.length === 0
        ? <EstadoVacio titulo={t('No hay órdenes en proceso')} texto={t('Aquí verás tus órdenes una vez que un chofer las acepte y estén en curso.')} mostrarBoton={false} />
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cola.map((o) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="navy">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                  <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {o.tipoEquipo || '—'}</div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} className="text-amber-500" /> {nombrePlanta(o.plantaId) || t('Planta')} → {o.direccionEntrega || '—'}</div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">{t('Recibes')} <b className="text-brand-navy dark:text-slate-100">{money(o.precioTransportista)}</b></span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{money((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0))}</span>
                </div>
                {o.choferNombre && <div className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('Chofer:')} {o.choferNombre}</div>}
              </Card>
            ))}
          </div>
        )}
    </>
  )
}

// ── Tab Órdenes: tabla filtrada a MIS órdenes, con estados de color ───────────
function TabOrdenes({ t, ordenes, choferes, rosterIdDe, asignarChofer, nombrePlanta }) {
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const estados = [...new Set(ordenes.map((o) => o.estado))]
  const rows = ordenes
    .filter((o) => !fEstado || o.estado === fEstado)
    .filter((o) => { const s = q.trim().toLowerCase(); return !s || `${o.numero} ${o.material} ${o.choferNombre}`.toLowerCase().includes(s) })
    .sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
    .map((o) => ({ ...o, _key: o.id }))

  if (ordenes.length === 0) return <EstadoVacio titulo={t('Aún no tienes órdenes asignadas')} texto={t('Cuando el dispatcher te asigne órdenes, aparecerán aquí para que asignes tus choferes.')} mostrarBoton={false} />

  const cols = [
    { key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') },
    { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tipoEquipo', label: t('Camión') },
    { key: 'chofer', label: t('Chofer') }, { key: 'ruta', label: t('Ruta'), wrap: true },
    { key: 'estado', label: t('Estado') }, { key: 'fecha', label: t('Fecha') },
    { key: 'pago', label: t('Pago del viaje'), align: 'right' },
  ]
  const render = (o, k) => {
    if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
    if (k === 'material') return t(o.material || '—')
    if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
    if (k === 'tipoEquipo') return o.tipoEquipo || '—'
    if (k === 'chofer') {
      if (!FINAL.includes(o.estado) && choferes.length > 0) {
        return (
          <Select className="w-full min-w-[9rem] py-1 text-xs" value={rosterIdDe(o.choferId) || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => e.target.value && asignarChofer(o, e.target.value)}>
            <option value="">{o.choferId ? t('Cambiar chofer…') : t('Asignar chofer…')}</option>
            {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        )
      }
      return o.choferNombre || <span className="text-slate-400">{t('Sin asignar')}</span>
    }
    if (k === 'ruta') return <span className="text-xs text-slate-500 dark:text-slate-400">{nombrePlanta(o.plantaId) || t('Planta')} → {o.direccionEntrega || '—'}</span>
    if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
    if (k === 'fecha') return <span className="text-xs text-slate-500">{fecha(o.creadoEn)}</span>
    if (k === 'pago') return <span className="font-semibold text-brand-navy dark:text-slate-100">{money(o.precioTransportista)}</span>
    return null
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar orden, material o chofer…')} className="w-64 pl-8" /></div>
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="py-2"><option value="">{t('Todos los estados')}</option>{estados.map((s) => <option key={s} value={s}>{t(ORDEN_ESTADO_LABEL[s] || s)}</option>)}</Select>
        <span className="ml-auto text-xs text-slate-400">{rows.length} {t('órdenes')}</span>
      </div>
      <Tabla columns={cols} rows={rows} renderCell={render} minWidth="min-w-[860px]" emptyText={t('Ninguna orden coincide con el filtro.')} />
    </>
  )
}

// ── Tab Mis choferes: tabla con estado en línea, viaje actual y forma de pago ──
function TabChoferes({ t, choferes, choferEnLinea, viajeActual, pagoChoferes, guardarPago, quitarPago, toggleActivoChofer, agregarChofer }) {
  const [alta, setAlta] = useState(false)
  const [pagoEdit, setPagoEdit] = useState(null) // chofer.id en edición de pago

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Aviso tipo="info" className="flex-1">{t('Gestiona tu flota de choferes. Define cómo le pagas a cada uno (porcentaje o valor fijo por carga); se aplica al asignarlo a una orden.')}</Aviso>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)}>{alta ? <><X size={16} /> {t('Cerrar')}</> : <><UserPlus size={16} /> {t('Agregar chofer')}</>}</Boton>
      </div>

      {alta && <AltaChoferForm t={t} onCrear={async (d) => { await agregarChofer(d); setAlta(false) }} />}

      {choferes.length === 0 ? (
        <EstadoVacio titulo={t('Agrega tu primer chofer')} texto={t('Da de alta a tus choferes para asignarles cargas y definir su pago.')} mostrarBoton={false} />
      ) : (
        <div className="space-y-2">
          {choferes.map((c) => {
            const viaje = viajeActual(c)
            const online = choferEnLinea(c)
            return (
              <Card key={c.id} className="p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-[9rem]">
                    <div className="font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                      {c.telefono && <span className="inline-flex items-center gap-0.5"><Phone size={10} /> {c.telefono}</span>}
                      {c.licencia && <span className="inline-flex items-center gap-0.5"><IdCard size={10} /> {c.licencia}</span>}
                    </div>
                  </div>
                  <Badge color="navy">{c.equipo || (c.equipos || [])[0] || t('Sin equipo')}</Badge>
                  <Badge color={online ? 'green' : 'slate'}>{online ? t('En línea') : t('Fuera de línea')}</Badge>
                  {viaje ? <Badge color="blue">{t('En viaje')} · {viaje.numero}</Badge> : <span className="text-xs text-slate-400">{t('Sin viaje')}</span>}
                  {etiquetaPago(pagoChoferes[c.id]) && <Badge color="gold"><DollarSign size={10} className="mr-0.5 inline" />{t(etiquetaPago(pagoChoferes[c.id]))}</Badge>}
                  {c.uid ? <Badge color="green">{t('Con acceso')}</Badge> : <Badge color="slate">{t('Sin acceso')}</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setPagoEdit(pagoEdit === c.id ? null : c.id)} className="text-xs font-medium text-amber-600 hover:underline">{etiquetaPago(pagoChoferes[c.id]) ? t('Cambiar pago') : t('Definir pago')}</button>
                    <button onClick={() => toggleActivoChofer(c)} className={`text-xs font-medium hover:underline ${c.activo === false ? 'text-emerald-600' : 'text-rose-500'}`}>{c.activo === false ? t('Activar') : t('Desactivar')}</button>
                  </div>
                </div>
                {pagoEdit === c.id && (
                  <PagoEditor t={t} config={pagoChoferes[c.id]} onGuardar={async (tipo, valor) => { await guardarPago(c.id, tipo, valor); setPagoEdit(null) }} onQuitar={async () => { await quitarPago(c.id); setPagoEdit(null) }} />
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function AltaChoferForm({ t, onCrear }) {
  const [f, setF] = useState({ nombre: '', email: '', password: '', telefono: '', licencia: '', equipo: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const crear = async () => {
    if (!f.nombre.trim()) return
    setOcupado(true); setMsg(null)
    try { await onCrear(f) }
    catch (e) { setMsg(e?.message || t('No se pudo crear el chofer.')); setOcupado(false) }
  }
  return (
    <Card className="mb-3 p-4">
      <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo chofer')}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
        <Input placeholder={t('Teléfono')} value={f.telefono} onChange={set('telefono')} />
        <Input placeholder={t('Licencia')} value={f.licencia} onChange={set('licencia')} />
        <Input placeholder={t('Tipo de camión (ej. Dump Truck)')} value={f.equipo} onChange={set('equipo')} />
        <Input type="email" placeholder={t('Correo (para su acceso a la app)')} value={f.email} onChange={set('email')} />
        <Input type="password" placeholder={t('Contraseña (opcional)')} value={f.password} onChange={set('password')} />
      </div>
      {msg && <div className="mt-2 text-xs text-rose-500">{msg}</div>}
      <p className="mt-2 text-[11px] text-slate-400">{t('Si pones correo y contraseña, se crea su cuenta para entrar a la app del chofer. Si no, queda solo en tu lista para asignarle cargas.')}</p>
      <div className="mt-3"><Boton variant="gold" onClick={crear} disabled={ocupado || !f.nombre.trim()}><UserPlus size={16} /> {ocupado ? t('Creando…') : t('Agregar chofer')}</Boton></div>
    </Card>
  )
}

function PagoEditor({ t, config, onGuardar, onQuitar }) {
  const [tipo, setTipo] = useState(config?.tipo || 'porcentaje')
  const [valor, setValor] = useState(config?.valor != null ? String(config.valor) : '')
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700/60">
      <Select className="py-1 text-xs" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="porcentaje">{t('Porcentaje de la carga (%)')}</option>
        <option value="fijo">{t('Valor fijo por carga ($)')}</option>
      </Select>
      <Input type="number" step="0.01" className="w-40 py-1 text-xs" placeholder={tipo === 'porcentaje' ? t('Ej. 80 (= 80%)') : t('Ej. 120 ($ por carga)')} value={valor} onChange={(e) => setValor(e.target.value)} />
      <Boton variant="gold" onClick={() => onGuardar(tipo, valor)} disabled={!(Number(valor) > 0)} className="px-2.5 py-1 text-xs">{t('Guardar')}</Boton>
      {config && <Boton variant="ghost" onClick={onQuitar} className="px-2.5 py-1 text-xs text-rose-500">{t('Quitar')}</Boton>}
    </div>
  )
}

// ── Tab Equipos: flota de camiones del carrier (carrierConfig.flota) ──────────
function TabEquipos({ t, flota, choferes, carrier, agregarEquipo, editarEquipo, eliminarEquipo }) {
  const [alta, setAlta] = useState(false)
  const tiposBase = (carrier?.equipos || [])
  const nombreChofer = (id) => choferes.find((c) => c.id === id)?.nombre || ''

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('Tus camiones y su estado. El tipo debe estar entre los equipos aprobados por el administrador.')}</div>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)} className="ml-auto">{alta ? <><X size={16} /> {t('Cerrar')}</> : <><Plus size={16} /> {t('Agregar equipo')}</>}</Boton>
      </div>
      {alta && <AltaEquipoForm t={t} tipos={tiposBase} choferes={choferes} onCrear={async (v) => { await agregarEquipo(v); setAlta(false) }} />}

      {flota.length === 0 ? (
        <EstadoVacio titulo={t('Agrega tu primer equipo')} texto={t('Registra tus camiones (tipo, placa y estado) para llevar el control de tu flota.')} mostrarBoton={false} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flota.map((v) => {
            const est = FLOTA_ESTADO[v.estado] || FLOTA_ESTADO.disponible
            return (
              <Card key={v.id} className="p-3.5">
                <div className="flex items-start gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy text-brand-gold"><Truck size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-brand-navy dark:text-slate-100">{v.tipo || t('Camión')}</div>
                    <div className="font-mono text-xs text-slate-400">{v.placa || t('sin placa')}</div>
                  </div>
                  <button onClick={() => eliminarEquipo(v.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge color={est.c}>{t(est.l)}</Badge>
                  {v.choferId && <Badge color="navy">{nombreChofer(v.choferId)}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Select className="py-1 text-xs" value={v.estado || 'disponible'} onChange={(e) => editarEquipo(v.id, { estado: e.target.value })}>
                    {Object.entries(FLOTA_ESTADO).map(([k, o]) => <option key={k} value={k}>{t(o.l)}</option>)}
                  </Select>
                  <Select className="py-1 text-xs" value={v.choferId || ''} onChange={(e) => editarEquipo(v.id, { choferId: e.target.value || null })}>
                    <option value="">{t('Sin chofer')}</option>
                    {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function AltaEquipoForm({ t, tipos, onCrear }) {
  const [f, setF] = useState({ tipo: tipos[0] || '', placa: '', estado: 'disponible' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Card className="mb-3 p-4">
      <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo equipo')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {tipos.length
          ? <Select value={f.tipo} onChange={set('tipo')}>{tipos.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          : <Input placeholder={t('Tipo (ej. Dump Truck)')} value={f.tipo} onChange={set('tipo')} />}
        <Input placeholder={t('Placa / identificador')} value={f.placa} onChange={set('placa')} />
        <Select value={f.estado} onChange={set('estado')}>{Object.entries(FLOTA_ESTADO).map(([k, o]) => <option key={k} value={k}>{t(o.l)}</option>)}</Select>
      </div>
      <div className="mt-3"><Boton variant="gold" onClick={() => f.tipo && onCrear(f)} disabled={!f.tipo}><Plus size={16} /> {t('Agregar equipo')}</Boton></div>
    </Card>
  )
}

// ── Tab Facturación: avisos de pago del transportista (bulk_carrierStatements) ──
function TabFacturacion({ t, statements, cuenta }) {
  // Buscador: solo reduce el listado de SUS avisos (ya aislados por carrierId).
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const filtrados = filtrarFacturas(statements, busq)
  const rows = filtrados.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((s) => ({ ...s, _key: s.id }))
  const cols = [
    { key: 'numero', label: t('Aviso') }, { key: 'periodo', label: t('Periodo') },
    { key: 'toneladas', label: t('Ton'), align: 'right' }, { key: 'total', label: t('Total'), align: 'right' },
    { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'fechaPago', label: t('Fecha de pago') },
  ]
  const render = (s, k) => {
    if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{s.numero}</span>
    if (k === 'periodo') return <span className="text-xs text-slate-400">{s.desde || '—'} → {s.hasta || '—'}</span>
    if (k === 'toneladas') return s.toneladas != null ? Math.round(s.toneladas) : '—'
    if (k === 'total') return <span className="font-semibold text-brand-navy dark:text-slate-100">{money(s.total)}</span>
    if (k === 'estado') return <Badge color={s.estado === 'pagado' ? 'green' : 'gold'}>{t(s.estado === 'pagado' ? 'Pagado' : 'Pendiente')}</Badge>
    if (k === 'fechaPago') return <span className="text-xs text-slate-500">{s.fechaPago ? fecha(s.fechaPago) : '—'}</span>
    return null
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI label={t('Total facturado (periodo)')} value={money(cuenta.ganado)} icon={FileText} accent="navy" />
        <KPI label={t('Pagado')} value={money(cuenta.pagado)} icon={DollarSign} accent="green" />
        <KPI label={t('Pendiente de cobro')} value={money(cuenta.pendiente)} icon={Wallet} accent="gold" />
      </div>
      <div className="mb-2 flex items-center gap-2"><FileText size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago')}</h3></div>
      {(statements || []).length > 0 && <BuscadorFacturas f={busq} setF={setBusq} montoLabel={t('Monto de pago…')} />}
      {(statements || []).length === 0
        ? <EstadoVacio titulo={t('Aún no tienes avisos de pago')} texto={t('Cuando el administrador emita tu facturación/aviso de pago, aparecerá aquí con su detalle.')} mostrarBoton={false} />
        : rows.length === 0
          ? <p className="text-sm text-slate-400">{t('No hay avisos de pago que coincidan con los criterios de búsqueda.')}</p>
          : <Tabla columns={cols} rows={rows} renderCell={render} minWidth="min-w-[640px]" />}
    </>
  )
}

// ── Tab Estado de cuenta: resumen + detalle por viaje (usa el cálculo existente) ─
function TabCuenta({ t, cuenta, stats, statements }) {
  const rows = stats.entregadas
    .slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
    .map((o) => ({ ...o, _key: o.id }))
  const cols = [
    { key: 'numero', label: t('Viaje') }, { key: 'material', label: t('Material') },
    { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tarifa', label: t('Tarifa'), align: 'right' },
    { key: 'pagoChofer', label: t('Pago chofer'), align: 'right' }, { key: 'util', label: t('Tu utilidad'), align: 'right' },
    { key: 'fecha', label: t('Fecha') },
  ]
  const render = (o, k) => {
    if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
    if (k === 'material') return t(o.material || '—')
    if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
    if (k === 'tarifa') return money(o.precioTransportista)
    if (k === 'pagoChofer') return <span className="text-slate-500">{money(o.pagoChofer)}</span>
    if (k === 'util') return <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0))}</span>
    if (k === 'fecha') return <span className="text-xs text-slate-500">{fecha(o.hitos?.entrega || o.creadoEn)}</span>
    return null
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI label={t('Total ganado (periodo)')} value={money(cuenta.ganado)} icon={Wallet} accent="navy" />
        <KPI label={t('Pagado')} value={money(cuenta.pagado)} icon={DollarSign} accent="green" />
        <KPI label={t('Pendiente')} value={money(cuenta.pendiente)} icon={ClipboardList} accent="gold" />
      </div>
      {statements && statements.length > 0 && (
        <Card className="mb-4 p-4">
          <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago')}</h3>
          <div className="flex flex-wrap gap-2">
            {statements.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700/60">
                <div className="font-mono font-semibold text-brand-navy dark:text-slate-100">{s.numero}</div>
                <div className="text-slate-500">{money(s.total)} · <Badge color={s.estado === 'pagado' ? 'green' : 'gold'}>{t(s.estado === 'pagado' ? 'Pagado' : 'Pendiente')}</Badge></div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="mb-2 flex items-center gap-2"><MapPin size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Detalle por viaje')}</h3></div>
      {rows.length === 0
        ? <EstadoVacio titulo={t('Aún no hay viajes cerrados')} texto={t('Cuando completes viajes, su detalle y tu utilidad aparecerán aquí.')} mostrarBoton={false} />
        : <Tabla columns={cols} rows={rows} renderCell={render} minWidth="min-w-[720px]" />}
    </>
  )
}
