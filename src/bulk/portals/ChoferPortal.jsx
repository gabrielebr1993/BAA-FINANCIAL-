import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, ClipboardList, DollarSign, User, LogOut, Grid2x2, CheckCircle2, XCircle, Camera, MapPin, QrCode, Clock, MessageSquare } from 'lucide-react'
import ChatOrden from '../components/ChatOrden'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { siguientePasoChofer, ESTADOS_ACTIVOS_CHOFER, ESTADOS_HISTORIAL, ahora } from '../domain/flujo'
import { leerFotoReducida } from '../components/foto'
import { useGpsTracker } from './useGpsTracker'
import FirmaPad from '../components/FirmaPad'
import { Card, Boton, Input, Badge, Aviso, Spinner } from '../../components/ui'
import { money } from '../../utils/format'

const capturarGPS = () => new Promise((res) => {
  if (!navigator.geolocation) return res(null)
  navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, ts: ahora() }),
    () => res(null), { timeout: 4000 })
})

export default function ChoferPortal() {
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const { datos: ordenes } = useColeccion('orders')
  const { datos: geocercas } = useColeccion('geofences')
  const [tab, setTab] = useState('ordenes')

  const carrierId = usuario?.carrierId || null
  const misOrdenes = useMemo(() => ordenes.filter((o) => o.choferId === usuario?.id), [ordenes, usuario])
  const disponibles = useMemo(() => ordenes.filter((o) => o.transportistaId && o.transportistaId === carrierId && o.estado === E.NOTIFICANDO && !o.choferId), [ordenes, carrierId])
  const activa = misOrdenes.find((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado))
  useGpsTracker(activa, geocercas, tenantId) // envía GPS y eventos de geocerca en vivo
  const historial = misOrdenes.filter((o) => ESTADOS_HISTORIAL.includes(o.estado))
  const ganancias = misOrdenes.filter((o) => [E.ENTREGADA, ...ESTADOS_HISTORIAL].includes(o.estado)).reduce((a, o) => a + (Number(o.pagoChofer) || 0), 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={18} /></div>
        <div className="min-w-0"><div className="truncate text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">Chofer</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10" title="Cambiar módulo"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10" title="Salir"><LogOut size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-20">
        {tab === 'ordenes' && (
          <>
            {!carrierId && <Aviso tipo="warn" className="mb-3">Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.</Aviso>}
            {activa ? <OrdenActiva orden={activa} tenantId={tenantId} usuario={usuario} rol={rol} />
              : disponibles.length === 0 ? <VacioMsg icon={ClipboardList} texto="No tienes órdenes asignadas ahora. Cuando el dispatcher te asigne una, aparecerá aquí y sonará." />
              : disponibles.map((o) => <TarjetaNueva key={o.id} orden={o} usuario={usuario} tenantId={tenantId} rol={rol} />)}
          </>
        )}
        {tab === 'historial' && (
          historial.length === 0 ? <VacioMsg icon={Clock} texto="Aún no tienes entregas cerradas." />
            : historial.map((o) => (
              <Card key={o.id} className="mb-2 p-3">
                <div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="green">{ORDEN_ESTADO_LABEL[o.estado]}</Badge><span className="ml-auto text-sm font-semibold">{money(o.pagoChofer)}</span></div>
                <div className="mt-1 text-xs text-slate-400">{o.material} · {o.pesoReal ?? o.pesoEstimado} ton</div>
              </Card>
            ))
        )}
        {tab === 'ganancias' && (
          <Card className="p-5 text-center">
            <div className="text-xs uppercase text-slate-400">Ganancias acumuladas</div>
            <div className="mt-1 text-4xl font-black text-amber-500">{money(ganancias)}</div>
            <div className="mt-1 text-xs text-slate-400">{historial.length} entrega(s) cerrada(s)</div>
          </Card>
        )}
        {tab === 'perfil' && (
          <Card className="p-4">
            <div className="text-sm"><b>{usuario?.nombre}</b></div>
            <div className="text-xs text-slate-400">{usuario?.email}</div>
            <div className="mt-2 text-xs text-slate-400">Rol: Chofer · Transportista: {carrierId ? carrierId : '—'}</div>
          </Card>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {[{ k: 'ordenes', l: 'Órdenes', I: ClipboardList }, { k: 'historial', l: 'Historial', I: Clock }, { k: 'ganancias', l: 'Ganancias', I: DollarSign }, { k: 'perfil', l: 'Perfil', I: User }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${tab === t.k ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
            <t.I size={20} strokeWidth={tab === t.k ? 2.4 : 1.8} /> {t.l}
          </button>
        ))}
      </nav>
    </div>
  )
}

function VacioMsg({ icon: Icon, texto }) {
  return <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400"><Icon size={34} strokeWidth={1.4} /><p className="max-w-xs text-sm">{texto}</p></div>
}

function TarjetaNueva({ orden, usuario, tenantId, rol }) {
  const [ocupado, setOcupado] = useState(false)
  const aceptar = async () => {
    setOcupado(true)
    await guardar('orders', orden.id, { choferId: usuario.id, choferNombre: usuario.nombre, estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: ahora() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_acepta', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo:') || 'Sin motivo'
    setOcupado(true)
    await guardar('orders', orden.id, { estado: E.CREADA, transportistaId: null, rechazo: { por: usuario.nombre, motivo, ts: ahora() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_rechaza', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }
  return (
    <Card className="mb-3 animate-pulse border-2 border-amber-400 p-4">
      <div className="flex items-center gap-2"><span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span><Badge color="gold">Nueva</Badge></div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">{orden.material} · {orden.pesoEstimado} ton · {orden.tipoEquipo}</div>
      <div className="mt-1 text-sm font-semibold text-emerald-600">Tu pago: {money(orden.pagoChofer)}</div>
      <div className="mt-3 flex gap-2">
        <Boton variant="success" onClick={aceptar} disabled={ocupado} className="flex-1 justify-center"><CheckCircle2 size={16} /> Aceptar</Boton>
        <Boton variant="danger" onClick={rechazar} disabled={ocupado} className="flex-1 justify-center"><XCircle size={16} /> Rechazar</Boton>
      </div>
    </Card>
  )
}

function OrdenActiva({ orden, tenantId, usuario, rol }) {
  const paso = siguientePasoChofer(orden.estado)
  const [modal, setModal] = useState(null) // 'ticket' | 'pod'
  const [ocupado, setOcupado] = useState(false)
  const [peso, setPeso] = useState('')
  const [ticketNum, setTicketNum] = useState('')
  const [foto, setFoto] = useState(null)
  const [firma, setFirma] = useState(null)
  const [coment, setComent] = useState('')

  const avanzar = async () => {
    if (!paso) return
    if (paso.requiere === 'ticket') return setModal('ticket')
    if (paso.requiere === 'pod') return setModal('pod')
    setOcupado(true)
    const gps = await capturarGPS()
    await guardar('orders', orden.id, { estado: paso.next, hitos: { ...(orden.hitos || {}), [paso.hito]: ahora() }, [`gps_${paso.hito}`]: gps })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: `hito_${paso.hito}`, entidad: 'orden', entidadId: orden.id })
    setOcupado(false)
  }

  const guardarTicket = async () => {
    setOcupado(true)
    const gps = await capturarGPS()
    await guardar('orders', orden.id, {
      estado: paso.next, hitos: { ...(orden.hitos || {}), [paso.hito]: ahora() },
      pesoReal: Number(peso) || orden.pesoEstimado,
      ticket: { numero: ticketNum || null, foto: foto || null, peso: Number(peso) || null, ts: ahora() },
      [`gps_${paso.hito}`]: gps,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'ticket_carga', entidad: 'orden', entidadId: orden.id, detalle: `Peso real ${peso}` })
    setModal(null); setOcupado(false); setFoto(null); setPeso(''); setTicketNum('')
  }

  const guardarPOD = async () => {
    if (!firma) { window.alert('Falta la firma.'); return }
    setOcupado(true)
    const gps = await capturarGPS()
    await guardar('orders', orden.id, {
      estado: E.ENTREGADA, hitos: { ...(orden.hitos || {}), entrega: ahora() },
      pod: { firma, foto: foto || null, comentarios: coment || '', gps, ts: ahora() },
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'pod_entrega', entidad: 'orden', entidadId: orden.id })
    setModal(null); setOcupado(false); setFoto(null); setFirma(null); setComent('')
  }

  const onFoto = async (e) => setFoto(await leerFotoReducida(e.target.files?.[0]))

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
        <Badge color="navy">{ORDEN_ESTADO_LABEL[orden.estado]}</Badge>
        <button onClick={() => setModal('chat')} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={14} /> Chat</button>
      </div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">{orden.material} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo}</div>
      <div className="mt-1 text-sm font-semibold text-emerald-600">Tu pago: {money(orden.pagoChofer)}</div>

      {/* Hitos registrados */}
      <div className="mt-3 space-y-1">
        {ORDEN_HITOS.map((h) => (
          <div key={h.key} className="flex items-center gap-2 text-xs">
            {orden.hitos?.[h.key] ? <CheckCircle2 size={14} className="text-emerald-500" /> : <div className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600" />}
            <span className={orden.hitos?.[h.key] ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}>{h.label}</span>
            {orden.hitos?.[h.key] && <span className="ml-auto text-slate-400">{new Date(orden.hitos[h.key]).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        ))}
      </div>

      {paso ? (
        <Boton variant="gold" onClick={avanzar} disabled={ocupado} className="mt-4 w-full justify-center py-2.5">
          {ocupado ? <><Spinner /> Guardando…</> : paso.label}
        </Boton>
      ) : orden.estado === E.ENTREGADA ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-amber-400 p-4 text-center">
          <QrCode size={40} className="mx-auto text-amber-500" />
          <div className="mt-1 text-xs text-slate-400">Muestra este código al supervisor para liberar la carga</div>
          <div className="mt-1 text-2xl font-black tracking-widest text-brand-navy dark:text-slate-100">{orden.numero}</div>
          <div className="mt-1 text-xs text-slate-400">Esperando liberación…</div>
        </div>
      ) : null}

      {/* Chat de la orden */}
      {modal === 'chat' && (
        <Modal onClose={() => setModal(null)} titulo={`Chat · ${orden.numero}`}>
          <ChatOrden orden={orden} alto={360} />
        </Modal>
      )}

      {/* Modal ticket de carga */}
      {modal === 'ticket' && (
        <Modal onClose={() => setModal(null)} titulo="Ticket de carga">
          <Input type="number" placeholder="Peso real (ton)" value={peso} onChange={(e) => setPeso(e.target.value)} className="mb-2" />
          <Input placeholder="N° de ticket (opcional)" value={ticketNum} onChange={(e) => setTicketNum(e.target.value)} className="mb-2" />
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
            <Camera size={18} /> {foto ? 'Foto lista ✓' : 'Tomar foto del ticket'}
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
          </label>
          <p className="mb-2 text-[11px] text-slate-400">El peso real reemplaza al estimado. (Fase 5: OCR leerá el ticket automáticamente.)</p>
          <Boton variant="gold" onClick={guardarTicket} disabled={ocupado || !peso} className="w-full justify-center">{ocupado ? <Spinner /> : 'Confirmar carga'}</Boton>
        </Modal>
      )}

      {/* Modal POD */}
      {modal === 'pod' && (
        <Modal onClose={() => setModal(null)} titulo="Prueba de entrega (POD)">
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
            <Camera size={18} /> {foto ? 'Foto lista ✓' : 'Foto de la entrega'}
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
          </label>
          <div className="mb-1 text-xs font-semibold text-slate-500">Firma de quien recibe</div>
          <FirmaPad onChange={setFirma} />
          <Input placeholder="Comentarios (opcional)" value={coment} onChange={(e) => setComent(e.target.value)} className="my-2" />
          <div className="mb-2 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={12} /> Se guardará tu GPS, fecha y hora automáticamente.</div>
          <Boton variant="gold" onClick={guardarPOD} disabled={ocupado} className="w-full justify-center">{ocupado ? <Spinner /> : 'Confirmar entrega'}</Boton>
        </Modal>
      )}
    </Card>
  )
}

function Modal({ titulo, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
