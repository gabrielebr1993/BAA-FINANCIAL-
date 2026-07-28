import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, LogOut, Grid2x2, ClipboardList, Users, DollarSign, Package, Phone, IdCard } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar, where } from '../data/repo'
import { auditar } from '../data/auditoria'
import { BULK_ROLES, ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { desgloseVisible } from '../domain/pagos'
import { Card, KPI, Badge, Cargando, Aviso, EstadoVacio, Select } from '../../components/ui'
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
  const [tab, setTab] = useState('ordenes')

  const carrier = carriers.find((c) => c.id === carrierId)
  const choferes = carrier?.choferes || [] // plantilla del transporte (la gestiona el admin)
  const nombreChofer = (id) => choferes.find((c) => c.id === id)?.nombre || ''
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
    await guardar('orders', orden.id, {
      choferId: driverId, choferNombre: d?.nombre || '',
      ...(avanza ? { estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: ahora() } } : {}),
    })
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
        {!usuario?.carrierId && <Aviso tipo="warn" className="mb-3">{t('Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.')}</Aviso>}

        <div className="mb-4 flex flex-wrap gap-3">
          <KPI label={t('Órdenes activas')} value={stats.activas} icon={ClipboardList} accent="navy" />
          <KPI label={t('Viajes hechos')} value={stats.viajes} icon={Truck} accent="green" />
          <KPI label={t('Choferes')} value={choferes.length} icon={Users} accent="gold" />
          <KPI label={t('Tu utilidad')} value={money(stats.util)} icon={DollarSign} accent="blue" />
        </div>

        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {[{ k: 'ordenes', l: t('Órdenes') }, { k: 'choferes', l: t('Mis choferes') }, { k: 'equipos', l: t('Equipos') }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm font-medium ${tab === t.k ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{t.l}</button>
          ))}
        </div>

        {tab === 'ordenes' && (
          ordenes.length === 0 ? <EstadoVacio texto={t('Cuando el dispatcher te asigne órdenes, aparecerán aquí para que asignes tus choferes.')} mostrarBoton={false} /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => {
                const fin = desgloseVisible(o, BULK_ROLES.TRANSPORTISTA)
                return (
                  <Card key={o.id} className="p-3">
                    <div className="flex items-center gap-2"><span className="font-mono font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="navy">{o.pesoReal ?? o.pesoEstimado} ton</Badge><Badge color="slate">{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge></div>
                    <div className="mt-1 text-xs text-slate-400">{o.material} · {o.tipoEquipo}</div>
                    <div className="mt-1 text-xs">{t('Recibes')} {money(fin.precioTransportista)} {t('· pagas al chofer')} {money(fin.pagoChofer)} {t('· utilidad')} {money(fin.utilidadTransportista)}</div>
                    {o.choferNombre && <div className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('Chofer:')} {o.choferNombre}</div>}
                    {!FINAL.includes(o.estado) && (
                      choferes.length > 0 ? (
                        <Select className="mt-2 w-full py-1 text-xs" value={o.choferId || ''} onChange={(e) => e.target.value && asignarChofer(o, e.target.value)}>
                          <option value="">{o.choferId ? t('Cambiar chofer…') : t('Asignar chofer…')}</option>
                          {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </Select>
                      ) : <div className="mt-2 text-[11px] text-slate-400">{t('El administrador aún no te ha registrado choferes.')}</div>
                    )}
                  </Card>
                )
              })}
            </div>
          )
        )}

        {tab === 'choferes' && (
          <>
            <Aviso tipo="info" className="mb-3">{t('Tus choferes los da de alta y transfiere el administrador. Aquí los ves y los asignas a tus órdenes (un chofer puede ir en varias).')}</Aviso>
            {choferes.length === 0 ? <EstadoVacio titulo={t('Sin choferes')} texto={t('Pídele al administrador que registre tus choferes.')} mostrarBoton={false} /> : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {choferes.map((c) => (
                  <Card key={c.id} className="p-3">
                    <div className="font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      {c.telefono && <span className="inline-flex items-center gap-0.5"><Phone size={10} /> {c.telefono}</span>}
                      {c.licencia && <span className="inline-flex items-center gap-0.5"><IdCard size={10} /> {c.licencia}</span>}
                    </div>
                    <div className="mt-1"><Badge color={c.activo === false ? 'slate' : 'green'}>{c.activo === false ? t('Inactivo') : t('Activo')}</Badge></div>
                  </Card>
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
      </main>
    </div>
  )
}
