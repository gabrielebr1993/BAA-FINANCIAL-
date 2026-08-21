import { useMemo, useState } from 'react'
import { Building2, DollarSign, ClipboardList, FileText, Download, PenLine, LayoutDashboard, Layers, MessageSquare } from 'lucide-react'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import { notificacionesCliente } from '../domain/notificaciones'
import { useBulkAuth } from '../BulkAuthContext'
import RepararAcceso from '../components/RepararAcceso'
import PortalLayout from '../components/PortalLayout'
import PanelConversaciones from '../components/PanelConversaciones'
import GruposModal from '../components/GruposModal'
import { usePrivados } from '../components/usePrivados'
import { useGrupos } from '../data/useGrupos'
import { menuGrupoConv } from '../data/grupos'
import { convClienteOrden, resumenPorConversacion } from '../data/chat'
import { useColeccion } from '../data/useColeccion'
import { where, guardar } from '../data/repo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { generarFacturaPDF } from '../data/facturaPDF'
import FirmaPad from '../components/FirmaPad'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { Card, KPI, Badge, Boton, Cargando, EstadoVacio, Tabla } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const FINAL = [...ENTREGADAS, E.CANCELADA]
const n = (v) => Number(v) || 0
// Código de proyecto derivado del número de orden (ej. "ABC-0012" → "ABC"). El
// cliente no puede leer bulk_jobs (reglas), así que agrupamos por sus propias órdenes.
const codigoProyecto = (o) => o.jobId || String(o.numero || '').split('-').slice(0, -1).join('-') || '—'
const fechaEntrega = (o) => o?.hitos?.entrega ? new Date(o.hitos.entrega) : null

export default function ClientePortal() {
  const { t } = useLang()
  const { usuario, tenantId } = useBulkAuth()
  const [tab, setTab] = useState('resumen')
  const clienteId = usuario?.clienteId || '__none__'
  const { datos: _ordenesRaw, cargando } = useColeccion('orders', [where('clienteId', '==', clienteId)])
  // Inc.2 Fase 2: el precio del cliente se lee de su doc de pago por audiencia
  // (fallback al campo de la orden para las órdenes anteriores a la migración).
  const { datos: pagosCliente } = useColeccion('orderPay_cliente', [where('clienteId', '==', clienteId)])
  const ordenes = useMemo(() => {
    const m = {}; for (const p of pagosCliente || []) m[p.orderId || p.id] = p.precioCliente
    return (_ordenesRaw || []).map((o) => (m[o.id] != null ? { ...o, precioCliente: m[o.id] } : o))
  }, [_ordenesRaw, pagosCliente])
  const { datos: facturas } = useColeccion('invoices', [where('clienteId', '==', clienteId)])
  const [firmando, setFirmando] = useState(null) // factura en firma
  const [firma, setFirma] = useState(null)
  // Buscador: solo reduce el listado de SUS facturas (ya aisladas por la consulta).
  const [busqFac, setBusqFac] = useState(FILTRO_FACTURAS_VACIO)
  const facturasFiltradas = useMemo(() => filtrarFacturas(facturas, busqFac), [facturas, busqFac])

  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const ton = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const gasto = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
    const hoy = new Date(); const d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    const semana = new Date(d0); semana.setDate(d0.getDate() - d0.getDay())
    const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const enRango = (o, desde) => { const f = fechaEntrega(o); return f && f >= desde }
    const sum = (arr) => arr.reduce((a, o) => a + n(o.precioCliente), 0)
    const porMaterial = {}
    for (const o of entregadas) { const m = o.material || '—'; porMaterial[m] = porMaterial[m] || { material: m, ton: 0, gasto: 0 }; porMaterial[m].ton += n(o.pesoReal ?? o.pesoEstimado); porMaterial[m].gasto += n(o.precioCliente) }
    // Proyectos: agrupa TODAS sus órdenes por código de proyecto.
    const proy = {}
    for (const o of ordenes) {
      const k = codigoProyecto(o)
      proy[k] = proy[k] || { key: k, codigo: k, total: 0, enCurso: 0, entregadas: 0, gasto: 0 }
      proy[k].total += 1
      if (!FINAL.includes(o.estado)) proy[k].enCurso += 1
      if (ENTREGADAS.includes(o.estado)) { proy[k].entregadas += 1; proy[k].gasto += n(o.precioCliente) }
    }
    const proyectos = Object.values(proy).sort((a, b) => b.total - a.total)
    return {
      total: ordenes.length, entregadas: entregadas.length, ton, gasto,
      activas: ordenes.filter((o) => !FINAL.includes(o.estado)).length,
      proyectosActivos: proyectos.filter((p) => p.enCurso > 0).length,
      proyectos,
      hoy: sum(entregadas.filter((o) => enRango(o, d0))),
      semana: sum(entregadas.filter((o) => enRango(o, semana))),
      mes: sum(entregadas.filter((o) => enRango(o, mes))),
      porMaterial: Object.values(porMaterial).sort((a, b) => b.gasto - a.gasto),
    }
  }, [ordenes])

  const firmarFactura = async () => {
    if (!firma || !firmando) return
    const datos = { estado: 'firmada', firma, firmante: usuario?.nombre || usuario?.email, firmadaEn: new Date().toISOString() }
    await guardar('invoices', firmando.id, datos)
    generarFacturaPDF({ ...firmando, ...datos }, { clienteNombre: firmando.clienteNombre, empresa: 'Freight' })
    setFirmando(null); setFirma(null)
  }
  // El cliente disputa/rechaza una factura enviada, con motivo (queda para el staff).
  const notifsC = useMemo(() => notificacionesCliente({ facturas }), [facturas])

  // Mensajes: SOLO con la oficina/administrador, ORGANIZADOS POR VIAJE. Cada viaje
  // usa un canal propio cliente↔oficina (co_<orderId>) donde no participan chofer ni
  // transporte. La consulta trae únicamente los mensajes donde el cliente participa
  // (aislamiento garantizado por reglas). No se mezclan viajes distintos.
  const { datos: misMensajes } = useColeccion('messages', [where('participantes', 'array-contains', clienteId)])
  const resumenMsg = useMemo(() => resumenPorConversacion(misMensajes, usuario?.id), [misMensajes, usuario])
  // Chats PRIVADOS 1-a-1 del cliente (con la oficina/administración), por su UID.
  const { datos: mensajesPriv } = useColeccion('messages', [where('participantes', 'array-contains', usuario?.id || '__none__')])
  const ordenesChat = useMemo(
    () => ordenes.filter((o) => !FINAL.includes(o.estado) || resumenMsg[convClienteOrden(o.id)]),
    [ordenes, resumenMsg],
  )
  const seccionesMsg = useMemo(() => {
    const items = ordenesChat.map((o) => {
      const key = convClienteOrden(o.id)
      const r = resumenMsg[key] || {}
      return { key, chatId: key, icon: 'admin', titulo: o.numero || t('Viaje'), rolLabel: t('Administrador'), rolColor: 'navy', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', lastText: r.lastText || '', lastTs: r.lastTs || o.creadoEn || '', noLeidos: r.noLeidos || 0, participantes: [clienteId] }
    })
    return [{ k: 'admin', label: t('Administrador'), icon: 'admin', items, vacio: t('Aún no tienes conversaciones. Se crean por viaje cuando escribes al administrador.') }]
  }, [ordenesChat, resumenMsg, clienteId, t])
  const noLeidosMsg = useMemo(() => Object.values(resumenMsg).reduce((a, r) => a + (r.noLeidos || 0), 0), [resumenMsg])
  // Grupos del cliente (puede ser invitado; no crea). Se añaden como sección aparte.
  const { items: gruposItems, grupos, invitaciones, noLeidos: noLeidosGrupos } = useGrupos()
  const [verGrupos, setVerGrupos] = useState(false)
  const yoPriv = useMemo(() => ({ uid: usuario?.id, rol: 'cliente', clienteId: usuario?.clienteId || null }), [usuario?.id, usuario?.clienteId])
  const { seccion: seccionPriv, abrir: abrirPriv, modal: modalPriv, noLeidos: noLeidosPriv } = usePrivados({ mensajes: mensajesPriv, uid: usuario?.id, tenantId, yo: yoPriv })
  const seccionesCliente = useMemo(() => [
    { k: 'admin', label: t('Administrador'), icon: 'admin', items: seccionesMsg[0]?.items || [], vacio: seccionesMsg[0]?.vacio },
    seccionPriv,
    { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('No perteneces a ningún grupo.') },
  ], [seccionesMsg, gruposItems, seccionPriv, t])

  const rechazarFactura = async (r) => {
    const motivo = window.prompt(t('¿Por qué disputas esta factura?'))
    if (motivo == null) return
    await guardar('invoices', r.id, { estado: 'rechazada', motivoRechazo: motivo.trim() || 'Sin motivo', rechazadaEn: new Date().toISOString() })
  }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  const facturasPend = facturas.filter((x) => x.estado === 'enviada').length
  const items = [
    { k: 'resumen', label: t('Resumen'), icon: LayoutDashboard },
    { k: 'ordenes', label: t('Órdenes'), icon: ClipboardList },
    { k: 'proyectos', label: t('Proyectos'), icon: Layers },
    { k: 'facturas', label: t('Facturas'), icon: FileText, badge: facturasPend },
    { k: 'mensajes', label: t('Mensajes'), icon: MessageSquare, badge: noLeidosMsg + noLeidosGrupos + noLeidosPriv },
  ]

  // Nombre de la empresa cliente (denormalizado en sus órdenes/facturas; el cliente no
  // puede leer bulk_clients por reglas).
  const empresaCliente = (ordenes.find((o) => o.clienteNombre)?.clienteNombre) || (facturas.find((f) => f.clienteNombre)?.clienteNombre) || ''

  return (
    <>
      <PortalLayout
        icon={Building2}
        empresa={empresaCliente}
        titulo={usuario?.nombre}
        subtitulo={t('Cliente')}
        items={usuario?.clienteId ? items : []}
        activo={tab}
        onSelect={setTab}
        campana={<CampanaNotificaciones notifs={notifsC} claveLS="bulk_notif_cliente" />}
      >
        {!usuario?.clienteId ? (
          <div className="text-center">
            <EstadoVacio titulo={t('Cuenta no vinculada')} texto={t('Tu usuario aún no está ligado a un cliente. Si el administrador ya lo asignó, toca “Reparar mi acceso”. Si no, pídele que lo asigne.')} mostrarBoton={false} />
            <RepararAcceso className="mt-1 px-3 py-1.5 text-xs" />
          </div>
        ) : (
          <>
            {tab === 'resumen' && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KPI label={t('Proyectos activos')} value={stats.proyectosActivos} icon={Layers} accent="navy" />
                  <KPI label={t('Órdenes en curso')} value={stats.activas} icon={ClipboardList} accent="gold" />
                  <KPI label={t('Entregadas')} value={stats.entregadas} icon={ClipboardList} accent="green" />
                  <KPI label={t('Gasto total')} value={money(stats.gasto)} icon={DollarSign} accent="blue" />
                </div>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto hoy')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.hoy)}</div></Card>
                  <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto esta semana')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.semana)}</div></Card>
                  <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto este mes')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.mes)}</div></Card>
                </div>
                <Card className="p-4">
                  <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Costos por material')}</h3>
                  {stats.porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Sin entregas todavía.')}</p> : (
                    <Tabla columns={[{ key: 'material', label: t('Material') }, { key: 'ton', label: t('Toneladas'), align: 'right' }, { key: 'gasto', label: t('Gasto'), align: 'right' }]}
                      rows={stats.porMaterial.map((m) => ({ ...m, _key: m.material }))}
                      renderCell={(r, k) => k === 'gasto' ? money(r.gasto) : k === 'ton' ? Math.round(r.ton) : r[k]} />
                  )}
                </Card>
              </>
            )}

            {tab === 'proyectos' && (
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2"><Layers size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis proyectos')}</h3></div>
                {stats.proyectos.length === 0 ? <EstadoVacio titulo={t('Aún no tienes proyectos')} texto={t('Cuando tengas órdenes, se agruparán aquí por proyecto.')} mostrarBoton={false} /> : (
                  <Tabla columns={[{ key: 'codigo', label: t('Proyecto') }, { key: 'total', label: t('Órdenes'), align: 'right' }, { key: 'enCurso', label: t('En curso'), align: 'right' }, { key: 'entregadas', label: t('Entregadas'), align: 'right' }, { key: 'gasto', label: t('Gasto'), align: 'right' }]}
                    rows={stats.proyectos.map((p) => ({ ...p, _key: p.key }))}
                    renderCell={(r, k) => {
                      if (k === 'codigo') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{r.codigo}</span>
                      if (k === 'enCurso') return r.enCurso > 0 ? <Badge color="gold">{r.enCurso}</Badge> : <span className="text-slate-400">0</span>
                      if (k === 'gasto') return money(r.gasto)
                      return r[k]
                    }} minWidth="min-w-[520px]" />
                )}
              </Card>
            )}

            {tab === 'ordenes' && (
              <Card className="p-4">
                <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis órdenes')}</h3>
                {ordenes.length === 0 ? <EstadoVacio titulo={t('Aún no hay órdenes')} texto={t('Aquí verás tus órdenes con su estado en tiempo real.')} mostrarBoton={false} /> : (
                  <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precioCliente', label: t('Precio'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }]}
                    rows={ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).slice(0, 100).map((o) => ({ ...o, _key: o.id }))}
                    renderCell={(o, k) => {
                      if (k === 'ton') return o.pesoReal ?? o.pesoEstimado
                      if (k === 'precioCliente') return o.precioCliente != null ? money(o.precioCliente) : '—'
                      if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                      return o[k]
                    }} />
                )}
              </Card>
            )}

            {tab === 'facturas' && (
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2"><FileText size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas')}</h3></div>
                {facturas.length > 0 && <BuscadorFacturas f={busqFac} setF={setBusqFac} montoLabel={t('Monto de cobro…')} />}
                {facturas.length === 0 ? <EstadoVacio titulo={t('Aún no tienes facturas')} texto={t('Cuando el administrador emita una factura, aparecerá aquí para revisar y firmar.')} mostrarBoton={false} />
                  : facturasFiltradas.length === 0 ? <p className="text-sm text-slate-400">{t('No hay facturas que coincidan con los criterios de búsqueda.')}</p> : (
                  <Tabla columns={[{ key: 'numero', label: t('Factura') }, { key: 'periodo', label: t('Periodo') }, { key: 'total', label: t('Total'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
                    rows={facturasFiltradas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
                    renderCell={(r, k) => {
                      if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
                      if (k === 'total') return money(r.total)
                      if (k === 'estado') return <Badge color={r.estado === 'firmada' ? 'green' : r.estado === 'pagada' ? 'navy' : r.estado === 'rechazada' ? 'slate' : 'gold'}>{r.estado}</Badge>
                      if (k === 'acciones') return (
                        <div className="flex justify-end gap-1.5">
                          {r.estado === 'enviada' && <Boton variant="gold" onClick={() => { setFirmando(r); setFirma(null) }} className="px-2.5 py-1 text-xs"><PenLine size={13} /> {t('Revisar y firmar')}</Boton>}
                          {r.estado === 'enviada' && <Boton variant="ghost" onClick={() => rechazarFactura(r)} className="px-2.5 py-1 text-xs">{t('Disputar')}</Boton>}
                          <Boton variant="ghost" onClick={() => generarFacturaPDF(r, { clienteNombre: r.clienteNombre, empresa: 'Freight' })} className="px-2.5 py-1 text-xs"><Download size={13} /> PDF</Boton>
                        </div>
                      )
                      return r[k]
                    }} />
                )}
              </Card>
            )}

            {tab === 'mensajes' && (
              <>
                <PanelConversaciones secciones={seccionesCliente} alturaClass="h-mensajes-portal" abrir={abrirPriv}
                  menuConversacion={(item) => menuGrupoConv({ item, grupos, uid: usuario?.id, t })}
                  accion={<Boton variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setVerGrupos(true)}><MessageSquare size={15} /> {t('Grupos')}{invitaciones.length > 0 && <span className="ml-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{invitaciones.length}</span>}</Boton>} />
                {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={[]} puedeCrear={false} uid={usuario?.id} onClose={() => setVerGrupos(false)} />}
                {modalPriv}
              </>
            )}
          </>
        )}
      </PortalLayout>

      {firmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFirmando(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">{t('Revisar factura')} {firmando.numero}</h3>
            <div className="scroll-thin mb-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precio', label: t('Precio'), align: 'right' }]}
                rows={(firmando.lineas || []).map((l, i) => ({ ...l, _key: i }))}
                renderCell={(l, k) => k === 'precio' ? money(l.precio) : l[k]} minWidth="min-w-[360px]" />
            </div>
            <div className="mb-2 text-right text-lg font-bold text-brand-navy dark:text-slate-100">{t('Total')}: {money(firmando.total)}</div>
            <div className="mb-1 text-xs font-semibold text-slate-500">{t('Firma de aprobación')}</div>
            <FirmaPad onChange={setFirma} />
            <div className="mt-3 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setFirmando(null)}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={firmarFactura} disabled={!firma}><PenLine size={15} /> {t('Aprobar y firmar')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
