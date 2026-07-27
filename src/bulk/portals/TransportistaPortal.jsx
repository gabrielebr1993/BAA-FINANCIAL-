import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, LogOut, Grid2x2, UserPlus, ClipboardList, Users, DollarSign, Package } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar, where } from '../data/repo'
import { auditar } from '../data/auditoria'
import { BULK_ROLES, ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { desgloseVisible } from '../domain/pagos'
import { Card, KPI, Boton, Input, Select, Badge, Cargando, Aviso, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]

export default function TransportistaPortal() {
  const { usuario, cerrarSesion, tenantId, rol, crearUsuario } = useBulkAuth()
  const navigate = useNavigate()
  const carrierId = usuario?.carrierId || '__none__'
  const { datos: ordenes, cargando } = useColeccion('orders', [where('transportistaId', '==', carrierId)])
  const { datos: usuarios } = useColeccion('users', [where('carrierId', '==', carrierId)])
  const { datos: carriers } = useColeccion('carriers')
  const [tab, setTab] = useState('ordenes')
  const [f, setF] = useState({ nombre: '', email: '', password: '' })
  const [msg, setMsg] = useState(null)

  const carrier = carriers.find((c) => c.id === carrierId)
  const choferes = usuarios.filter((u) => u.rol === BULK_ROLES.CHOFER)
  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const util = entregadas.reduce((a, o) => a + ((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0)), 0)
    return { viajes: entregadas.length, activas: ordenes.filter((o) => !ENTREGADAS.includes(o.estado) && o.estado !== E.CANCELADA).length, util }
  }, [ordenes])

  const crearChofer = async () => {
    setMsg(null)
    if (!f.nombre.trim() || !f.email.trim() || !f.password) { setMsg({ tipo: 'warn', txt: 'Completa nombre, correo y contraseña.' }); return }
    try {
      await crearUsuario({ nombre: f.nombre.trim(), email: f.email.trim().toLowerCase(), password: f.password, rol: BULK_ROLES.CHOFER, carrierId })
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear_chofer', entidad: 'usuario', detalle: f.email })
      setF({ nombre: '', email: '', password: '' }); setMsg({ tipo: 'ok', txt: 'Chofer creado.' })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || 'No se pudo crear (¿backend desplegado?).' }) }
  }
  const asignarChofer = async (orden, choferId) => {
    const ch = choferes.find((c) => c.id === choferId)
    await guardar('orders', orden.id, { choferId, choferNombre: ch?.nombre || '', estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: ahora() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'asignar_chofer', entidad: 'orden', entidadId: orden.id, detalle: ch?.nombre })
  }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={18} /></div>
        <div><div className="text-sm font-bold">{carrier?.nombre || usuario?.nombre}</div><div className="text-[11px] text-slate-400">Transportista</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {!usuario?.carrierId && <Aviso tipo="warn" className="mb-3">Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.</Aviso>}

        <div className="mb-4 flex flex-wrap gap-3">
          <KPI label="Órdenes activas" value={stats.activas} icon={ClipboardList} accent="navy" />
          <KPI label="Viajes hechos" value={stats.viajes} icon={Truck} accent="green" />
          <KPI label="Choferes" value={choferes.length} icon={Users} accent="gold" />
          <KPI label="Tu utilidad" value={money(stats.util)} icon={DollarSign} accent="blue" />
        </div>

        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {[{ k: 'ordenes', l: 'Órdenes' }, { k: 'choferes', l: 'Choferes' }, { k: 'equipos', l: 'Equipos' }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm font-medium ${tab === t.k ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{t.l}</button>
          ))}
        </div>

        {tab === 'ordenes' && (
          ordenes.length === 0 ? <EstadoVacio texto="Cuando el dispatcher te asigne órdenes, aparecerán aquí para que asignes chofer." mostrarBoton={false} /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => {
                const fin = desgloseVisible(o, BULK_ROLES.TRANSPORTISTA)
                return (
                  <Card key={o.id} className="p-3">
                    <div className="flex items-center gap-2"><span className="font-mono font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="navy">{o.pesoReal ?? o.pesoEstimado} ton</Badge><Badge color="slate">{ORDEN_ESTADO_LABEL[o.estado]}</Badge></div>
                    <div className="mt-1 text-xs text-slate-400">{o.material} · {o.tipoEquipo}</div>
                    <div className="mt-1 text-xs">Recibes {money(fin.precioTransportista)} · pagas al chofer {money(fin.pagoChofer)} · utilidad {money(fin.utilidadTransportista)}</div>
                    {!o.choferId && [E.NOTIFICANDO, E.ACEPTADA, E.CREADA].includes(o.estado) && choferes.length > 0 && (
                      <Select className="mt-2 w-full py-1 text-xs" value="" onChange={(e) => e.target.value && asignarChofer(o, e.target.value)}>
                        <option value="">Asignar chofer…</option>
                        {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </Select>
                    )}
                    {o.choferNombre && <div className="mt-1 text-xs text-slate-500">Chofer: {o.choferNombre}</div>}
                  </Card>
                )
              })}
            </div>
          )
        )}

        {tab === 'choferes' && (
          <>
            {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nuevo chofer</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Nombre" value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} />
                <Input type="email" placeholder="Correo (para su app)" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} />
                <Input type="password" placeholder="Contraseña" value={f.password} onChange={(e) => setF((s) => ({ ...s, password: e.target.value }))} />
              </div>
              <div className="mt-3"><Boton variant="gold" onClick={crearChofer} disabled={!usuario?.carrierId}><UserPlus size={16} /> Crear chofer</Boton></div>
            </Card>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {choferes.map((c) => (
                <Card key={c.id} className="p-3"><div className="font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</div><div className="text-xs text-slate-400">{c.email}</div><Badge color={c.activo === false ? 'slate' : 'green'}>{c.activo === false ? 'Inactivo' : 'Activo'}</Badge></Card>
              ))}
              {choferes.length === 0 && <p className="text-sm text-slate-400">Sin choferes aún.</p>}
            </div>
          </>
        )}

        {tab === 'equipos' && (
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2"><Package size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mis tipos de equipo</h3></div>
            <div className="flex flex-wrap gap-1.5">
              {(carrier?.equipos || []).length ? carrier.equipos.map((e) => <Badge key={e} color="navy">{e}</Badge>) : <span className="text-sm text-slate-400">El administrador aún no registró tus equipos.</span>}
            </div>
            <p className="mt-2 text-xs text-slate-400">La edición de equipos por el propio transportista llega en una fase siguiente; por ahora los registra el administrador.</p>
          </Card>
        )}
      </main>
    </div>
  )
}
