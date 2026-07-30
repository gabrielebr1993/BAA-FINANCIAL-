import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, ClipboardList, DollarSign, User, LogOut, Grid2x2, CheckCircle2, XCircle, Camera, MapPin, Clock, MessageSquare, ScanLine, Navigation, Copy, Check, Building2, Package, FileText, KeyRound } from 'lucide-react'
import ChatOrden from '../components/ChatOrden'
import RepararAcceso from '../components/RepararAcceso'
import { convChofer, noLeidosPorConv } from '../data/chat'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar, where } from '../data/repo'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { siguientePasoChofer, faseChofer, ESTADOS_ACTIVOS_CHOFER, ESTADOS_HISTORIAL, ahora } from '../domain/flujo'
import { puedeMarcarLlegada, geocercaObjetivo } from '../domain/geo'
import { leerFotoReducida } from '../components/foto'
import { useGpsTracker } from './useGpsTracker'
import { useGeoPos } from './useGeoPos'
import { beep, notificar, pedirPermisoNotif } from '../integraciones/alertasLocales'
import { leerTicket } from '../integraciones/ocr'
import { escanearParaOCR } from '../integraciones/escaner'
import FirmaPad from '../components/FirmaPad'
import { Card, Boton, Input, Badge, Aviso, Spinner } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const capturarGPS = () => new Promise((res) => {
  if (!navigator.geolocation) return res(null)
  navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, ts: ahora() }),
    () => res(null), { timeout: 4000 })
})

export default function ChoferPortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const carrierId = usuario?.carrierId || null
  // Acotamos a las órdenes de MI transporte: así el listener cumple las reglas
  // (el chofer no puede leer toda la colección) y vemos tanto las que se están
  // notificando como las que ya me asignaron.
  const { datos: ordenes } = useColeccion('orders', [where('transportistaId', '==', carrierId || '__none__')])
  const { datos: geocercas } = useColeccion('geofences')
  const { datos: plantas } = useColeccion('plants')
  const { datos: mensajes } = useColeccion('messages')
  const { datos: carriers } = useColeccion('carriers')
  const [tab, setTab] = useState('ordenes')

  const miConv = convChofer(usuario?.nombre)
  const noLeidosOficina = (noLeidosPorConv(mensajes, usuario?.id)[miConv]) || 0

  // Mi ficha en la plantilla del transporte (por nombre). Sirve para el contador de
  // rechazos y para reactivarme al reingresar.
  const claveN = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const miCarrier = carriers.find((c) => (c.choferes || []).some((d) => claveN(d.nombre) === claveN(usuario?.nombre)))
  const miChofer = miCarrier?.choferes?.find((d) => claveN(d.nombre) === claveN(usuario?.nombre))
  // Al abrir sesión: si estaba desactivado (3 rechazos), me reactiva y me vuelve a
  // poner en la cola de espera (resetea el contador).
  useEffect(() => {
    if (miCarrier && miChofer && (miChofer.activo === false || (miChofer.rechazos || 0) > 0)) {
      guardar('carriers', miCarrier.id, { choferes: miCarrier.choferes.map((d) => (claveN(d.nombre) === claveN(usuario?.nombre) ? { ...d, activo: true, rechazos: 0 } : d)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miCarrier?.id])
  // Cuenta un rechazo; al llegar a 3 me desactiva (salgo de la cola de espera).
  const registrarRechazo = async () => {
    if (!miCarrier || !miChofer) return
    const nRech = (miChofer.rechazos || 0) + 1
    const off = nRech >= 3
    await guardar('carriers', miCarrier.id, { choferes: miCarrier.choferes.map((d) => (claveN(d.nombre) === claveN(usuario?.nombre) ? { ...d, rechazos: nRech, activo: off ? false : d.activo !== false } : d)) })
    if (off) notificar(t('Cuenta desactivada'), t('Rechazaste 3 órdenes. Cierra sesión y vuelve a entrar para reactivarte.'))
  }
  // Una orden es "mía" si me la asignaron por mi uid de login, por mi id en el
  // roster del transporte (d_xxx, cuando la asigna el transportista) o por mi nombre.
  const misIds = [usuario?.id, miChofer?.id].filter(Boolean)
  const esMia = (o) => misIds.includes(o.choferId) || (o.choferNombre && claveN(o.choferNombre) === claveN(usuario?.nombre))
  const misOrdenes = useMemo(() => ordenes.filter(esMia), [ordenes, usuario, miChofer])
  const disponibles = useMemo(() => ordenes.filter((o) => o.estado === E.NOTIFICANDO && !o.choferId), [ordenes])
  const activa = misOrdenes.find((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado))
  useGpsTracker(activa, geocercas, tenantId) // envía GPS y eventos de geocerca en vivo
  const pos = useGeoPos(!!activa) // posición en vivo para habilitar "Llegué" por geocerca
  // Orden nueva que entra y aún no acepté ni rechacé (para la pantalla superpuesta).
  const entrante = !activa ? disponibles[0] : null

  // Alerta local: al asignarle una orden nueva, suena y muestra notificación.
  const prevIds = useRef(null)
  useEffect(() => { pedirPermisoNotif() }, [])
  useEffect(() => {
    const ids = new Set(disponibles.map((o) => o.id))
    if (prevIds.current && [...ids].some((id) => !prevIds.current.has(id))) {
      beep(); notificar(t('Nueva orden asignada'), t('Tienes una orden nueva por aceptar.'))
    }
    prevIds.current = ids
  }, [disponibles])
  // Mientras haya una orden entrante sin responder, suena en bucle hasta que acepte/rechace.
  useEffect(() => {
    if (!entrante) return
    beep(2)
    const id = setInterval(() => beep(2), 2200)
    return () => clearInterval(id)
  }, [entrante?.id])
  // Aviso local cuando llega un mensaje nuevo de la oficina.
  const prevOficina = useRef(null)
  useEffect(() => {
    if (prevOficina.current != null && noLeidosOficina > prevOficina.current) {
      beep(); notificar(t('Mensajes con la oficina'), t('Tienes un mensaje nuevo de la oficina.'))
    }
    prevOficina.current = noLeidosOficina
  }, [noLeidosOficina])
  const historial = misOrdenes.filter((o) => ESTADOS_HISTORIAL.includes(o.estado))
  const ganancias = misOrdenes.filter((o) => [E.ENTREGADA, ...ESTADOS_HISTORIAL].includes(o.estado)).reduce((a, o) => a + (Number(o.pagoChofer) || 0), 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={18} /></div>
        <div className="min-w-0"><div className="truncate text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Chofer')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10" title={t('Cambiar módulo')}><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10" title={t('Salir')}><LogOut size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-20">
        {tab === 'ordenes' && (
          <>
            {!carrierId && (
              <Aviso tipo="warn" className="mb-3">
                <div>{t('Tu cuenta no está ligada a un transportista. Si el administrador ya la asignó, toca “Reparar mi acceso”. Si no, pídele que la asigne.')}</div>
                <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
              </Aviso>
            )}
            {activa ? <OrdenActiva orden={activa} tenantId={tenantId} usuario={usuario} rol={rol} geocercas={geocercas} plantas={plantas} pos={pos} />
              : <VacioMsg icon={ClipboardList} texto={t('No tienes órdenes asignadas ahora. Cuando el dispatcher te asigne una, aparecerá aquí y sonará.')} />}
          </>
        )}
        {tab === 'historial' && (
          historial.length === 0 ? <VacioMsg icon={Clock} texto={t('Aún no tienes entregas cerradas.')} />
            : historial.map((o) => (
              <Card key={o.id} className="mb-2 p-3">
                <div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="green">{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge><span className="ml-auto text-sm font-semibold">{money(o.pagoChofer)}</span></div>
                <div className="mt-1 text-xs text-slate-400">{o.material} · {o.pesoReal ?? o.pesoEstimado} ton</div>
              </Card>
            ))
        )}
        {tab === 'ganancias' && (
          <Card className="p-5 text-center">
            <div className="text-xs uppercase text-slate-400">{t('Ganancias acumuladas')}</div>
            <div className="mt-1 text-4xl font-black text-amber-500">{money(ganancias)}</div>
            <div className="mt-1 text-xs text-slate-400">{historial.length} {t('entrega(s) cerrada(s)')}</div>
          </Card>
        )}
        {tab === 'mensajes' && (
          <Card className="flex h-[calc(100vh-11rem)] flex-col p-3">
            <div className="mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-amber-500" /><span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Mensajes con la oficina')}</span></div>
            <div className="min-h-0 flex-1"><ChatOrden orden={{ id: convChofer(usuario?.nombre), numero: t('Oficina') }} fill /></div>
          </Card>
        )}
        {tab === 'perfil' && (
          <Card className="p-4">
            <div className="text-sm"><b>{usuario?.nombre}</b></div>
            <div className="text-xs text-slate-400">{usuario?.email}</div>
            <div className="mt-2 text-xs text-slate-400">{t('Rol: Chofer · Transportista:')} {carrierId ? (miCarrier?.nombre || carrierId) : '—'}</div>
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-1.5 text-[11px] text-slate-400">{t('¿No ves tus órdenes o cambió tu transportista? Refresca tus permisos aquí.')}</div>
              <RepararAcceso variant="ghost" />
            </div>
          </Card>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {[{ k: 'ordenes', l: t('Órdenes'), I: ClipboardList }, { k: 'historial', l: t('Historial'), I: Clock }, { k: 'mensajes', l: t('Mensajes'), I: MessageSquare, badge: noLeidosOficina }, { k: 'ganancias', l: t('Ganancias'), I: DollarSign }, { k: 'perfil', l: t('Perfil'), I: User }].map((it) => (
          <button key={it.k} onClick={() => setTab(it.k)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${tab === it.k ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
            <span className="relative">
              <it.I size={20} strokeWidth={tab === it.k ? 2.4 : 1.8} />
              {it.badge > 0 && <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{it.badge}</span>}
            </span>
            {it.l}
          </button>
        ))}
      </nav>

      {/* Pantalla superpuesta cuando entra una orden nueva (suena hasta responder) */}
      {entrante && <OverlayEntrante orden={entrante} usuario={usuario} tenantId={tenantId} rol={rol} onRechazo={registrarRechazo} />}
    </div>
  )
}

// Orden entrante a pantalla completa: se sobrepone a todo con Aceptar / Rechazar.
function OverlayEntrante({ orden, usuario, tenantId, rol, onRechazo }) {
  const { t } = useLang()
  const [ocupado, setOcupado] = useState(false)
  const aceptar = async () => {
    setOcupado(true)
    await guardar('orders', orden.id, { choferId: usuario.id, choferNombre: usuario.nombre, estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: ahora() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_acepta', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async () => {
    const motivo = window.prompt(t('Motivo del rechazo:')) || 'Sin motivo'
    setOcupado(true)
    await guardar('orders', orden.id, { estado: E.CREADA, transportistaId: null, rechazo: { por: usuario.nombre, motivo, ts: ahora() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_rechaza', entidad: 'orden', entidadId: orden.id, detalle: motivo })
    await onRechazo?.()
  }
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center">
      <div className="mb-3 grid h-16 w-16 animate-pulse place-items-center rounded-full bg-amber-500/20"><Truck size={32} className="text-amber-400" /></div>
      <div className="text-xs font-bold uppercase tracking-widest text-amber-400">{t('¡Nueva orden!')}</div>
      <div className="mt-1 font-mono text-3xl font-black text-white">{orden.numero}</div>
      <div className="mt-3 w-full max-w-xs space-y-1.5 rounded-2xl bg-white/5 p-4 text-left text-sm text-slate-200">
        <div className="flex items-center gap-2"><Package size={15} className="text-amber-400" /> {orden.material || t('material s/e')} · {orden.pesoEstimado} ton</div>
        <div className="flex items-center gap-2"><Truck size={15} className="text-amber-400" /> {orden.tipoEquipo || t('equipo s/e')}</div>
        {orden.direccionEntrega && <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 flex-shrink-0 text-amber-400" /> {orden.direccionEntrega}</div>}
        <div className="flex items-center gap-2 font-semibold text-emerald-400"><DollarSign size={15} /> {t('Tu pago:')} {money(orden.pagoChofer)}</div>
      </div>
      <div className="mt-5 flex w-full max-w-xs gap-3">
        <Boton variant="success" onClick={aceptar} disabled={ocupado} className="flex-1 justify-center py-3 text-base"><CheckCircle2 size={18} /> {t('Aceptar')}</Boton>
        <Boton variant="danger" onClick={rechazar} disabled={ocupado} className="flex-1 justify-center py-3 text-base"><XCircle size={18} /> {t('Rechazar')}</Boton>
      </div>
    </div>
  )
}

function VacioMsg({ icon: Icon, texto }) {
  return <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400"><Icon size={34} strokeWidth={1.4} /><p className="max-w-xs text-sm">{texto}</p></div>
}

function OrdenActiva({ orden, tenantId, usuario, rol, geocercas, plantas, pos }) {
  const { t } = useLang()
  const paso = siguientePasoChofer(orden.estado)
  const fase = faseChofer(orden.estado)
  const [modal, setModal] = useState(null) // 'ticket' | 'pod' | 'chat'
  const [ocupado, setOcupado] = useState(false)
  const [peso, setPeso] = useState('')
  const [ticketNum, setTicketNum] = useState('')
  const [foto, setFoto] = useState(null)
  const [firma, setFirma] = useState(null)
  const [coment, setComent] = useState('')
  const [ocr, setOcr] = useState(null) // {cargando, progreso, msg}
  const [copiado, setCopiado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [errCod, setErrCod] = useState(false)
  const [lightbox, setLightbox] = useState(null) // src de la foto ampliada

  // Destino de la fase actual: recogida = planta; entrega = dirección de entrega.
  const planta = (plantas || []).find((p) => p.id === orden.plantaId) || null
  const enRecogida = fase === 'recogida'
  const gps = enRecogida ? planta?.gps : null
  const dirTexto = enRecogida ? (planta?.direccion || planta?.nombre || '') : (orden.direccionEntrega || '')
  const mapsUrl = (gps && gps.lat != null) ? `https://maps.google.com/?q=${gps.lat},${gps.lng}`
    : (dirTexto ? `https://maps.google.com/?q=${encodeURIComponent(dirTexto)}` : null)
  const copiaTexto = (gps && gps.lat != null) ? `${gps.lat}, ${gps.lng}` : dirTexto
  const puedeLlegar = paso?.gate ? puedeMarcarLlegada(pos, orden, fase, geocercas, plantas) : true
  const hayGeocerca = !!geocercaObjetivo(orden, fase, geocercas, plantas)

  const copiar = async () => {
    try { await navigator.clipboard.writeText(copiaTexto); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* noop */ }
  }

  const avanzar = async () => {
    if (!paso) return
    if (paso.gate && !puedeLlegar) return
    if (paso.requiere === 'ticket') return setModal('ticket')
    if (paso.requiere === 'pod') return setModal('pod')
    setOcupado(true)
    const g = await capturarGPS()
    await guardar('orders', orden.id, { estado: paso.next, hitos: { ...(orden.hitos || {}), [paso.hito]: ahora() }, [`gps_${paso.hito}`]: g })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: `hito_${paso.hito}`, entidad: 'orden', entidadId: orden.id })
    setOcupado(false)
  }

  const guardarTicket = async () => {
    setOcupado(true)
    const g = await capturarGPS()
    // Al registrar el ticket, la carga queda hecha y sale de la planta (dos hitos).
    await guardar('orders', orden.id, {
      estado: paso.next, hitos: { ...(orden.hitos || {}), carga: ahora(), salidaPlanta: ahora() },
      pesoReal: Number(peso) || orden.pesoEstimado,
      ticket: { numero: ticketNum || null, foto: foto || null, peso: Number(peso) || null, ts: ahora() },
      gps_carga: g,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'ticket_carga', entidad: 'orden', entidadId: orden.id, detalle: `Peso real ${peso}` })
    setModal(null); setOcupado(false); setFoto(null); setPeso(''); setTicketNum(''); setOcr(null)
  }

  const guardarPOD = async () => {
    if (!foto) { window.alert(t('Toma la foto de la entrega.')); return }
    if (!firma) { window.alert(t('Falta la firma.')); return }
    setOcupado(true)
    const g = await capturarGPS()
    // Código de 4 dígitos que el supervisor verá y le dará al chofer para liberar.
    const codigoLiberacion = String(Math.floor(1000 + Math.random() * 9000))
    await guardar('orders', orden.id, {
      estado: E.ENTREGADA, hitos: { ...(orden.hitos || {}), entrega: ahora() }, codigoLiberacion,
      pod: { firma, foto: foto || null, comentarios: coment || '', gps: g, ts: ahora() },
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'pod_entrega', entidad: 'orden', entidadId: orden.id })
    setModal(null); setOcupado(false); setFoto(null); setFirma(null); setComent('')
  }

  const liberarConCodigo = async () => {
    setErrCod(false)
    if (codigo.trim() !== String(orden.codigoLiberacion || '')) { setErrCod(true); return }
    setOcupado(true)
    await guardar('orders', orden.id, { estado: E.LIBERADA, hitos: { ...(orden.hitos || {}), liberacion: ahora() }, liberadaPor: usuario?.nombre || usuario?.email })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id })
    setOcupado(false); setCodigo('')
  }

  const onFoto = async (e) => setFoto(await leerFotoReducida(e.target.files?.[0]))

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
        <Badge color="navy">{t(ORDEN_ESTADO_LABEL[orden.estado])}</Badge>
        <button onClick={() => setModal('chat')} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={14} /> {t('Chat')}</button>
      </div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">{orden.material} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo}</div>
      <div className="mt-1 text-sm font-semibold text-emerald-600">{t('Tu pago:')} {money(orden.pagoChofer)}</div>

      {/* Tarjeta de recogida / entrega según la fase */}
      {fase && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {enRecogida ? <Building2 size={13} /> : <MapPin size={13} />} {enRecogida ? t('Recoger en la planta') : t('Llevar a la entrega')}
          </div>
          {enRecogida && planta?.nombre && <div className="mt-1 text-sm font-bold text-brand-navy dark:text-slate-100">{planta.nombre}</div>}
          {dirTexto && <div className="mt-0.5 text-sm text-brand-navy dark:text-slate-100">{dirTexto}</div>}
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1"><Package size={12} className="text-amber-500" /> {orden.material || '—'} · {orden.pesoReal ?? orden.pesoEstimado} ton</span>
            {orden.po && <span className="inline-flex items-center gap-1"><FileText size={12} className="text-amber-500" /> PO {orden.po}</span>}
          </div>
          <div className="mt-2.5 flex gap-2">
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-navy py-2 text-sm font-semibold text-white dark:bg-amber-500 dark:text-slate-900"><Navigation size={15} /> {t('Ir')}</a>}
            <button type="button" onClick={copiar} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {copiado ? <><Check size={15} className="text-emerald-500" /> {t('Copiado')}</> : <><Copy size={15} /> {t('Copiar dirección')}</>}
            </button>
          </div>
        </div>
      )}

      {/* Hitos registrados */}
      <div className="mt-3 space-y-1">
        {ORDEN_HITOS.map((h) => (
          <div key={h.key} className="flex items-center gap-2 text-xs">
            {orden.hitos?.[h.key] ? <CheckCircle2 size={14} className="text-emerald-500" /> : <div className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600" />}
            <span className={orden.hitos?.[h.key] ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}>{t(h.label)}</span>
            {orden.hitos?.[h.key] && <span className="ml-auto text-slate-400">{new Date(orden.hitos[h.key]).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        ))}
      </div>

      {/* Fotos ya registradas (toca para ampliar) */}
      {(orden.ticket?.foto || orden.pod?.foto) && (
        <div className="mt-3 flex gap-2">
          <FotoMini src={orden.ticket?.foto} etiqueta={t('Ticket')} onAmpliar={setLightbox} />
          <FotoMini src={orden.pod?.foto} etiqueta={t('Entrega')} onAmpliar={setLightbox} />
        </div>
      )}

      {paso ? (
        <>
          <Boton variant="gold" onClick={avanzar} disabled={ocupado || (paso.gate && !puedeLlegar)} className="mt-4 w-full justify-center py-2.5">
            {ocupado ? <><Spinner /> {t('Guardando…')}</> : t(paso.label)}
          </Boton>
          {paso.gate && !puedeLlegar && (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-slate-400">
              <MapPin size={12} /> {hayGeocerca ? t('El botón se activa cuando llegues (dentro de la zona).') : t('Acércate al punto para activar el botón.')}
            </p>
          )}
        </>
      ) : orden.estado === E.ENTREGADA ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-amber-400 p-4 text-center">
          <KeyRound size={36} className="mx-auto text-amber-500" />
          <div className="mt-1 text-sm font-semibold text-brand-navy dark:text-slate-100">{t('Pide el código de liberación al supervisor')}</div>
          <div className="mt-0.5 text-xs text-slate-400">{t('Al ingresarlo, la orden se libera y puedes tomar otra.')}</div>
          <div className="mt-3 flex gap-2">
            <Input inputMode="numeric" placeholder={t('Código (4 dígitos)')} value={codigo} onChange={(e) => { setCodigo(e.target.value); setErrCod(false) }} className="flex-1 text-center tracking-widest" />
            <Boton variant="gold" onClick={liberarConCodigo} disabled={ocupado || !codigo.trim()}>{ocupado ? <Spinner /> : t('Liberar')}</Boton>
          </div>
          {errCod && <div className="mt-1.5 text-xs font-semibold text-rose-500">{t('Código incorrecto. Verifícalo con el supervisor.')}</div>}
        </div>
      ) : null}

      {/* Chat de la orden */}
      {modal === 'chat' && (
        <Modal onClose={() => setModal(null)} titulo={`${t('Chat')} · ${orden.numero}`}>
          <ChatOrden orden={orden} alto={360} />
        </Modal>
      )}

      {/* Modal ticket de carga */}
      {modal === 'ticket' && (
        <Modal onClose={() => setModal(null)} titulo={t('Ticket de carga')}>
          <Input type="number" placeholder={t('Peso real (ton)')} value={peso} onChange={(e) => setPeso(e.target.value)} className="mb-2" />
          <Input placeholder={t('N° de ticket (opcional)')} value={ticketNum} onChange={(e) => setTicketNum(e.target.value)} className="mb-2" />
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
            <Camera size={18} /> {foto ? t('Foto lista ✓ (toca para reemplazar)') : t('Tomar foto del ticket')}
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
          </label>
          {foto && <div className="mb-2"><FotoMini src={foto} etiqueta={t('Ampliar')} onAmpliar={setLightbox} /></div>}
          {foto && (
            <button type="button" disabled={ocr?.cargando}
              onClick={async () => {
                setOcr({ cargando: true, progreso: 0 })
                try {
                  const escaneada = await escanearParaOCR(foto) // realza para que el OCR lea mejor
                  const r = await leerTicket(escaneada, (p) => setOcr({ cargando: true, progreso: p }))
                  if (r) { if (r.pesoNeto) setPeso(String(r.pesoNeto)); if (r.ticket) setTicketNum(r.ticket) }
                  setOcr({ cargando: false, msg: r ? t('Leído — revisa y corrige (las unidades pueden variar).') : t('No se pudo leer el ticket.') })
                } catch { setOcr({ cargando: false, msg: t('No se pudo leer el ticket.') }) }
              }}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-navy py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-amber-500 dark:text-slate-900">
              {ocr?.cargando ? <><Spinner /> {t('Escaneando…')} {ocr.progreso || 0}%</> : <><ScanLine size={15} /> {t('Escanear ticket')}</>}
            </button>
          )}
          {ocr?.msg && <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">{ocr.msg}</p>}
          <p className="mb-2 text-[11px] text-slate-400">{t('El peso real reemplaza al estimado. El OCR pre-llena; confirma el valor.')}</p>
          <Boton variant="gold" onClick={guardarTicket} disabled={ocupado || !peso} className="w-full justify-center">{ocupado ? <Spinner /> : t('Confirmar carga')}</Boton>
        </Modal>
      )}

      {/* Modal POD */}
      {modal === 'pod' && (
        <Modal onClose={() => setModal(null)} titulo={t('Prueba de entrega (POD)')}>
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
            <Camera size={18} /> {foto ? t('Foto lista ✓ (toca para reemplazar)') : t('Foto de la entrega')}
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
          </label>
          {foto && <div className="mb-2"><FotoMini src={foto} etiqueta={t('Ampliar')} onAmpliar={setLightbox} /></div>}
          <div className="mb-1 text-xs font-semibold text-slate-500">{t('Firma de quien recibe')}</div>
          <FirmaPad onChange={setFirma} />
          <Input placeholder={t('Comentarios (opcional)')} value={coment} onChange={(e) => setComent(e.target.value)} className="my-2" />
          <div className="mb-2 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={12} /> {t('Se guardará tu GPS, fecha y hora automáticamente.')}</div>
          <Boton variant="gold" onClick={guardarPOD} disabled={ocupado} className="w-full justify-center">{ocupado ? <Spinner /> : t('Confirmar entrega')}</Boton>
        </Modal>
      )}

      {/* Visor de foto a pantalla completa */}
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </Card>
  )
}

// Miniatura que abre la foto a pantalla completa al tocarla.
function FotoMini({ src, etiqueta, onAmpliar }) {
  if (!src) return null
  return (
    <button type="button" onClick={() => onAmpliar(src)} className="group relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <img src={src} alt={etiqueta} className="h-20 w-20 object-cover transition group-hover:opacity-90" />
      {etiqueta && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">{etiqueta}</span>}
    </button>
  )
}

// Visor a pantalla completa; se cierra al tocar en cualquier lado.
function Lightbox({ src, onClose }) {
  const { t } = useLang()
  if (!src) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <img src={src} alt="foto" className="max-h-full max-w-full rounded-lg object-contain" />
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">{t('Cerrar')}</button>
    </div>
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
