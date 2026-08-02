import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, LogOut, Grid2x2, ClipboardList, Users, DollarSign, Package, Phone, IdCard, MessageSquare } from 'lucide-react'
import ChatOrden from '../components/ChatOrden'
import RepararAcceso from '../components/RepararAcceso'
import { convCarrier, noLeidosPorConv } from '../data/chat'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar, crearConId, where } from '../data/repo'
import { auditar } from '../data/auditoria'
import { sincronizarPagoAsignacion } from '../data/ordenPagos'
import { BULK_ROLES, ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { desgloseVisible } from '../domain/pagos'
import { calcularPagoChofer, configDeChofer, etiquetaPago } from '../domain/pagoChofer'
import { Card, KPI, Badge, Cargando, Aviso, EstadoVacio, Select, Input, Boton } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const FINAL = [...ENTREGADAS, E.CANCELADA]

export default function TransportistaPortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const carrierId = usuario?.carrierId || '__none__'
  const { datos: ordenes, cargando } = useColeccion('orders', [where('transportistaId', '==', carrierId)])
  const { datos: carriers } = useColeccion('carriers')
  const { datos: configs } = useColeccion('carrierConfig')
  const { datos: mensajes } = useColeccion('messages')
  const [tab, setTab] = useState('ordenes')
  const noLeidosOficina = (noLeidosPorConv(mensajes, usuario?.id)[convCarrier(carrierId)]) || 0

  const carrier = carriers.find((c) => c.id === carrierId)
  const choferes = carrier?.choferes || [] // plantilla del transporte (la gestiona el admin)
  const nombreChofer = (id) => choferes.find((c) => c.id === id)?.nombre || ''
  const pagoChoferes = (configs.find((c) => c.id === carrierId)?.pagoChoferes) || {}

  // Cuánto se le ha pagado (acumulado) a cada chofer por sus cargas entregadas.
  const pagadoPorChofer = useMemo(() => {
    const acc = {}
    for (const o of ordenes) {
      if (!o.choferId || !ENTREGADAS.includes(o.estado)) continue
      acc[o.choferId] = (acc[o.choferId] || 0) + (Number(o.pagoChofer) || 0)
    }
    return acc
  }, [ordenes])

  // Guarda (o cambia) cómo se le paga a un chofer: % de la carga o valor fijo.
  const guardarPago = async (driverId, tipo, valor) => {
    const next = { ...pagoChoferes, [driverId]: { tipo, valor: Number(valor) || 0 } }
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: next })
  }
  const quitarPago = async (driverId) => {
    const next = { ...pagoChoferes }; delete next[driverId]
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: next })
  }
  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const util = entregadas.reduce((a, o) => a + ((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0)), 0)
    return { viajes: entregadas.length, activas: ordenes.filter((o) => !FINAL.includes(o.estado)).length, util }
  }, [ordenes])

  // El transporte asigna (o cambia) uno de SUS choferes a una de sus órdenes.
  // Un chofer puede ir en 1 o más órdenes.
  const asignarChofer = async (orden, driverId) => {
    const d = choferes.find((c) => c.id === driverId)
    const avanza = [E.CREADA, E.EN_COLA, E.NOTIFICANDO].includes(orden.estado)
    // Si el transportista definió cómo paga a este chofer, calculamos su pago para esta carga.
    const pago = calcularPagoChofer(orden.precioTransportista, configDeChofer(pagoChoferes, driverId))
    await guardar('orders', orden.id, {
      choferId: driverId, choferNombre: d?.nombre || '',
      ...(pago != null ? { pagoChofer: pago } : {}),
      ...(avanza ? { estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: ahora() } } : {}),
    })
    // Inc.2 Fase 1: proyecta los pagos (transportista ya fijado; chofer y su pago).
    await sincronizarPagoAsignacion(tenantId, { ...orden, choferId: driverId, ...(pago != null ? { pagoChofer: pago } : {}) })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'asignar_chofer', entidad: 'orden', entidadId: orden.id, detalle: d?.nombre })
  }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={18} /></div>
        <div><div className="text-sm font-bold">{carrier?.nombre || usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Transportista')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {!usuario?.carrierId && (
          <Aviso tipo="warn" className="mb-3">
            <div>{t('Tu cuenta no está ligada a un transportista. Si el administrador ya la asignó, toca “Reparar mi acceso”. Si no, pídele que la asigne.')}</div>
            <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
          </Aviso>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <KPI label={t('Órdenes activas')} value={stats.activas} icon={ClipboardList} accent="navy" />
          <KPI label={t('Viajes hechos')} value={stats.viajes} icon={Truck} accent="green" />
          <KPI label={t('Choferes')} value={choferes.length} icon={Users} accent="gold" />
          <KPI label={t('Tu utilidad')} value={money(stats.util)} icon={DollarSign} accent="blue" />
        </div>

        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {[{ k: 'ordenes', l: t('Órdenes') }, { k: 'choferes', l: t('Mis choferes') }, { k: 'equipos', l: t('Equipos') }, { k: 'mensajes', l: t('Mensajes'), badge: noLeidosOficina }].map((it) => (
            <button key={it.k} onClick={() => setTab(it.k)} className={`px-4 py-2 text-sm font-medium ${tab === it.k ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {it.l}
              {it.badge > 0 && <span className="ml-1.5 inline-grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 align-middle text-[10px] font-bold text-white">{it.badge}</span>}
            </button>
          ))}
        </div>

        {tab === 'ordenes' && (
          ordenes.length === 0 ? <EstadoVacio texto={t('Cuando el dispatcher te asigne órdenes, aparecerán aquí para que asignes tus choferes.')} mostrarBoton={false} /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => {
                const fin = desgloseVisible(o, BULK_ROLES.TRANSPORTISTA)
                return (
                  <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700/60 dark:bg-slate-900">
                    <div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="navy">{o.pesoReal ?? o.pesoEstimado} ton</Badge><Badge color="slate">{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge></div>
                    <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {o.tipoEquipo}</div>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">{t('Recibes')} <b className="text-brand-navy dark:text-slate-100">{money(fin.precioTransportista)}</b></span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{t('utilidad')} {money(fin.utilidadTransportista)}</span>
                    </div>
                    {o.choferNombre && <div className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('Chofer:')} {o.choferNombre}</div>}
                    {!FINAL.includes(o.estado) && (
                      choferes.length > 0 ? (
                        <Select className="mt-2 w-full py-1 text-xs" value={o.choferId || ''} onChange={(e) => e.target.value && asignarChofer(o, e.target.value)}>
                          <option value="">{o.choferId ? t('Cambiar chofer…') : t('Asignar chofer…')}</option>
                          {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </Select>
                      ) : <div className="mt-2 text-[11px] text-slate-400">{t('El administrador aún no te ha registrado choferes.')}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {tab === 'choferes' && (
          <>
            <Aviso tipo="info" className="mb-3">{t('Tus choferes los da de alta el administrador. Aquí defines cómo le pagas a cada uno: un porcentaje de lo que recibes por cada carga, o un valor fijo por carga entregada. Se aplica al asignarlo a una orden.')}</Aviso>
            {choferes.length === 0 ? <EstadoVacio titulo={t('Sin choferes')} texto={t('Pídele al administrador que registre tus choferes.')} mostrarBoton={false} /> : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {choferes.map((c) => (
                  <PagoChoferCard
                    key={c.id} c={c}
                    config={pagoChoferes[c.id]}
                    pagado={pagadoPorChofer[c.id] || 0}
                    onGuardar={(tipo, valor) => guardarPago(c.id, tipo, valor)}
                    onQuitar={() => quitarPago(c.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'equipos' && (
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2"><Package size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis tipos de equipo')}</h3></div>
            <div className="flex flex-wrap gap-1.5">
              {(carrier?.equipos || []).length ? carrier.equipos.map((e) => <Badge key={e} color="navy">{e}</Badge>) : <span className="text-sm text-slate-400">{t('El administrador aún no registró tus equipos.')}</span>}
            </div>
          </Card>
        )}

        {tab === 'mensajes' && (
          <Card className="flex h-[70vh] flex-col p-3">
            <div className="mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mensajes con la oficina')}</h3></div>
            {usuario?.carrierId
              ? <div className="min-h-0 flex-1"><ChatOrden orden={{ id: convCarrier(carrierId), numero: t('Oficina') }} fill /></div>
              : <span className="text-sm text-slate-400">{t('Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.')}</span>}
          </Card>
        )}
      </main>
    </div>
  )
}

// Tarjeta de un chofer con el modo de pago (porcentaje / fijo) editable por el transportista.
function PagoChoferCard({ c, config, pagado, onGuardar, onQuitar }) {
  const { t } = useLang()
  const [tipo, setTipo] = useState(config?.tipo || 'porcentaje')
  const [valor, setValor] = useState(config?.valor != null ? String(config.valor) : '')
  const [editando, setEditando] = useState(false)
  const guardar = async () => { await onGuardar(tipo, valor); setEditando(false) }
  const etiqueta = etiquetaPago(config)

  return (
    <Card className="p-3">
      <div className="font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</div>
      <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
        {c.telefono && <span className="inline-flex items-center gap-0.5"><Phone size={10} /> {c.telefono}</span>}
        {c.licencia && <span className="inline-flex items-center gap-0.5"><IdCard size={10} /> {c.licencia}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge color={c.activo === false ? 'slate' : 'green'}>{c.activo === false ? t('Inactivo') : t('Activo')}</Badge>
        {etiqueta && <Badge color="gold"><DollarSign size={10} className="mr-0.5 inline" />{t(etiqueta)}</Badge>}
      </div>
      {pagado > 0 && <div className="mt-1 text-[11px] text-slate-400">{t('Pagado (entregadas):')} <b className="text-emerald-600 dark:text-emerald-400">{money(pagado)}</b></div>}

      {!editando ? (
        <button onClick={() => setEditando(true)} className="mt-2 text-xs font-medium text-amber-600 hover:underline">
          {etiqueta ? t('Cambiar forma de pago') : t('Definir forma de pago')}
        </button>
      ) : (
        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700/60">
          <Select className="w-full py-1 text-xs" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="porcentaje">{t('Porcentaje de la carga (%)')}</option>
            <option value="fijo">{t('Valor fijo por carga ($)')}</option>
          </Select>
          <Input type="number" step="0.01" className="w-full py-1 text-xs" placeholder={tipo === 'porcentaje' ? t('Ej. 80 (= 80%)') : t('Ej. 120 ($ por carga)')} value={valor} onChange={(e) => setValor(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            <Boton variant="gold" onClick={guardar} disabled={!(Number(valor) > 0)} className="px-2.5 py-1 text-xs">{t('Guardar')}</Boton>
            <Boton variant="ghost" onClick={() => setEditando(false)} className="px-2.5 py-1 text-xs">{t('Cancelar')}</Boton>
            {config && <Boton variant="ghost" onClick={() => { onQuitar(); setEditando(false) }} className="px-2.5 py-1 text-xs text-rose-500">{t('Quitar')}</Boton>}
          </div>
        </div>
      )}
    </Card>
  )
}
