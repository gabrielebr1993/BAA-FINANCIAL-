import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, ClipboardList, DollarSign, User, LogOut, Grid2x2, CheckCircle2, Camera, MapPin, Clock, MessageSquare, ScanLine, Navigation, Copy, Check, Building2, Package, FileText, KeyRound, Wifi, Power, Landmark, Save, Phone, IdCard, Languages, Volume2, VolumeX } from 'lucide-react'
import { sonidoActivo, setSonido } from '../integraciones/sonido'
import ChatOrden from '../components/ChatOrden'
import RepararAcceso from '../components/RepararAcceso'
import CambiarClave from '../components/CambiarClave'
import IndicadorConexion from '../components/IndicadorConexion'
import { convChofer, noLeidosPorConv } from '../data/chat'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion, useDoc } from '../data/useColeccion'
import { guardar, crearConId, where } from '../data/repo'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { siguientePasoChofer, faseChofer, ESTADOS_ACTIVOS_CHOFER, ESTADOS_HISTORIAL, ahora } from '../domain/flujo'
import { puedeMarcarLlegada, geocercaObjetivo, distanciaM, dentroGeocerca } from '../domain/geo'
import { evaluarLiberacion, liberacionAutomatica } from '../domain/liberacion'
import { tsMillis } from '../data/chatKeys'
import { conectar, desconectar, latir, ocupar, liberar, reportarUbicacion } from '../data/presencia'
import { leerFotoReducida } from '../components/foto'
import { useGpsTracker } from './useGpsTracker'
import { useGeoPos } from './useGeoPos'
import { beep, tonoOrden, notificar, pedirPermisoNotif } from '../integraciones/alertasLocales'
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
  const { datos: carriers } = useColeccion('carriers')
  // carrierId EFECTIVO: el del login y, si no lo trae, el del transporte donde
  // aparezco en la plantilla (por nombre). Así las órdenes llegan aunque la cuenta
  // no tenga el claim de carrier.
  const _norm = (s) => (s || '').trim().toLowerCase()
  const _miCarrierBoot = carriers.find((c) => (c.choferes || []).some((d) => _norm(d.nombre) === _norm(usuario?.nombre)))
  const carrierId = usuario?.carrierId || _miCarrierBoot?.id || null
  // Acotamos a las órdenes de MI transporte: así el listener cumple las reglas
  // (el chofer no puede leer toda la colección) y vemos tanto las que se están
  // notificando como las que ya me asignaron.
  const { datos: _ordenesRaw } = useColeccion('orders', [where('transportistaId', '==', carrierId || '__none__')])
  // Inc.2 Fase 2: el pago del chofer se lee de su doc de pago por audiencia
  // (fallback al campo de la orden para las órdenes anteriores a la migración).
  const { datos: pagosChofer } = useColeccion('orderPay_chofer', [where('choferId', '==', usuario?.id || '__none__')])
  const ordenes = useMemo(() => {
    const m = {}; for (const p of pagosChofer || []) m[p.orderId || p.id] = p.pagoChofer
    return (_ordenesRaw || []).map((o) => (m[o.id] != null ? { ...o, pagoChofer: m[o.id] } : o))
  }, [_ordenesRaw, pagosChofer])
  const { datos: geocercas } = useColeccion('geofences')
  const { datos: plantas } = useColeccion('plants')
  // Solo la conversación con la OFICINA (no todos los mensajes del tenant). El chat
  // de la orden activa se suscribe aparte (abajo). Así el chofer no descarga chats
  // ajenos.
  const { datos: mensajesOficina } = useColeccion('messages', [where('orderId', '==', convChofer(usuario?.nombre) || '__none__')])
  const { datos: presencias } = useColeccion('presence', [where('uid', '==', usuario?.id || '__none__')])
  // Mi perfil: se lee por ID de documento (= mi uid), NO como consulta de colección.
  // Una consulta `where('uid','==',uid)` la BLOQUEA la regla (que se basa en el id del
  // doc), y por eso la foto/banco salían en blanco en la app aunque estaban guardados.
  const { dato: miPerfilDoc } = useDoc('driverProfiles', usuario?.id)
  const { datos: signals } = useColeccion('signals')
  const liberacionAuto = (signals || []).some((s) => s.id === 'liberacion' && s.auto === true)
  const [tab, setTab] = useState('ordenes')
  // Fast Pay: retiro instantáneo de las ganancias PAGADAS a la cuenta del chofer.
  // Flujo: null → 'confirmar' (revisar monto/comisión/cuenta) → 'listo' (dinero en camino).
  const [fastPay, setFastPay] = useState(null)

  const miConv = convChofer(usuario?.nombre)
  const noLeidosOficina = useMemo(() => noLeidosPorConv(mensajesOficina, usuario?.id)[miConv] || 0, [mensajesOficina, usuario, miConv])

  // Mi ficha en la plantilla del transporte (por nombre). Sirve para el contador de
  // rechazos y para reactivarme al reingresar.
  const claveN = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Resolución ROBUSTA para que los equipos/trabajos (que el admin asigna al
  // roster) siempre aparezcan aunque el nombre de la cuenta no coincida exacto.
  // Mi transporte = aquel cuyo roster me contiene (por uid → por nombre); si en
  // ninguno aparezco, el del claim carrierId (y, si tiene un solo chofer, esa ficha).
  const miCarrier = carriers.find((c) => (c.choferes || []).some((d) => d.uid && d.uid === usuario?.id))
    || carriers.find((c) => (c.choferes || []).some((d) => claveN(d.nombre) === claveN(usuario?.nombre)))
    || carriers.find((c) => c.id === carrierId)
  const rosterCho = miCarrier?.choferes || []
  const miChofer = rosterCho.find((d) => d.uid && d.uid === usuario?.id)
    || rosterCho.find((d) => claveN(d.nombre) === claveN(usuario?.nombre))
    || (miCarrier?.id === carrierId && rosterCho.length === 1 ? rosterCho[0] : null)
  // Enlaza mi ficha del roster con mi cuenta (uid) la primera vez, para que el
  // emparejamiento sea estable aunque cambie el nombre.
  useEffect(() => {
    if (miCarrier && miChofer && !miChofer.uid && usuario?.id) {
      guardar('carriers', miCarrier.id, { choferes: miCarrier.choferes.map((d) => (d.id === miChofer.id ? { ...d, uid: usuario.id } : d)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miCarrier?.id, miChofer?.id, usuario?.id])
  // Al abrir sesión: si estaba desactivado (3 rechazos), me reactiva y me vuelve a
  // poner en la cola de espera (resetea el contador).
  useEffect(() => {
    if (miCarrier && miChofer && (miChofer.activo === false || (miChofer.rechazos || 0) > 0)) {
      guardar('carriers', miCarrier.id, { choferes: miCarrier.choferes.map((d) => (d.id === miChofer.id ? { ...d, activo: true, rechazos: 0 } : d)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miCarrier?.id, miChofer?.id])
  // Cuenta un rechazo; al llegar a 3 me desactiva (salgo de la cola de espera).
  const registrarRechazo = async () => {
    if (!miCarrier || !miChofer) return
    const nRech = (miChofer.rechazos || 0) + 1
    const off = nRech >= 3
    await guardar('carriers', miCarrier.id, { choferes: miCarrier.choferes.map((d) => (d.id === miChofer.id ? { ...d, rechazos: nRech, activo: off ? false : d.activo !== false } : d)) })
    if (off) notificar(t('Cuenta desactivada'), t('Rechazaste 3 órdenes. Cierra sesión y vuelve a entrar para reactivarte.'))
  }
  // Una orden es "mía" si me la asignaron por mi uid de login, por mi id en el
  // roster del transporte (d_xxx, cuando la asigna el transportista) o por mi nombre.
  const misIds = [usuario?.id, miChofer?.id].filter(Boolean)
  const esMia = (o) => misIds.includes(o.choferId) || (o.choferNombre && claveN(o.choferNombre) === claveN(usuario?.nombre))
  const misOrdenes = useMemo(() => ordenes.filter(esMia), [ordenes, usuario, miChofer])
  const activa = misOrdenes.find((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado))
  useGpsTracker(activa, geocercas, tenantId) // envía GPS y eventos de geocerca en vivo
  // Orden que el dispatcher me OFRECIÓ automáticamente (notificando + a mi uid) y aún
  // no respondo → pantalla superpuesta con contador de 2:00.
  // Oferta entrante = cualquier orden NOTIFICANDO que sea MÍA (por uid, por id del
  // roster o por nombre) — así también aparece la pantalla de aceptar cuando me la
  // asignaron a mano por el id del roster (antes solo salía si era por uid).
  // Órdenes que YA respondí (acepté/rechacé) en este dispositivo: se ocultan al
  // instante aunque Firestore tarde en propagar, para que NUNCA reaparezca la misma
  // oferta ni el sonido siga sonando tras responder. (Anti-inundación robusto.)
  const [respondidas, setRespondidas] = useState(() => new Set())
  const marcarRespondida = (id) => setRespondidas((s) => new Set(s).add(id))
  const entrante = !activa ? misOrdenes.find((o) => o.estado === E.NOTIFICANDO && !respondidas.has(o.id)) : null
  // Suelta el "ya respondí" en cuanto Firestore refleja el cambio (la orden deja de
  // estar NOTIFICANDO para mí). Así una oferta futura legítima sí vuelve a aparecer.
  useEffect(() => {
    setRespondidas((prev) => {
      if (prev.size === 0) return prev
      const vivos = new Set(misOrdenes.filter((o) => o.estado === E.NOTIFICANDO).map((o) => o.id))
      let cambia = false; const next = new Set()
      for (const id of prev) { if (vivos.has(id)) next.add(id); else cambia = true }
      return cambia ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misOrdenes])
  const pos = useGeoPos(!!activa || !!entrante) // posición en vivo: habilita "Llegué" y la distancia en la oferta
  // Chat de MI orden activa (acotado por orderId) — para el contador de no leídos.
  const { datos: mensajesActiva } = useColeccion('messages', [where('orderId', '==', activa?.id || '__none__')])
  const noLeidosChatActiva = useMemo(() => (activa ? (noLeidosPorConv(mensajesActiva, usuario?.id)[activa.id] || 0) : 0), [mensajesActiva, activa, usuario])

  // ── Presencia: en línea / disponible ───────────────────────────────────────
  const miPresencia = (presencias || []).find((p) => p.uid === usuario?.id)
  const enLinea = miPresencia?.enLinea === true
  // Perfil propio del chofer (foto, datos, banco) — editable por él mismo.
  const miPerfil = miPerfilDoc || null
  // Los EQUIPOS los asigna el administrador (roster); el chofer solo los ve.
  const miEquipos = (miChofer?.equipos && miChofer.equipos.length) ? miChofer.equipos : (miChofer?.equipo ? [miChofer.equipo] : [])
  const conectarme = () => conectar(tenantId, { uid: usuario.id, nombre: usuario.nombre, carrierId, carrierNombre: miCarrier?.nombre, equipos: miEquipos, jobs: miChofer?.jobs || [] })
  const desconectarme = () => desconectar(usuario.id)
  // Latido + UBICACIÓN cada 30 s mientras esté en línea (aunque no tenga orden), para
  // que el dispatcher lo vea en el Mapa en vivo. Al cerrar la pestaña, me desconecta.
  useEffect(() => {
    if (!enLinea) return
    const reportar = async () => { const p = await capturarGPS(); await reportarUbicacion(usuario.id, p) }
    reportar()
    const id = setInterval(reportar, 30000)
    const salir = () => desconectar(usuario.id)
    window.addEventListener('beforeunload', salir)
    return () => { clearInterval(id); window.removeEventListener('beforeunload', salir) }
  }, [enLinea, usuario?.id])

  // Alerta local: al ofrecerme una orden nueva, suena y muestra notificación.
  const prevEntrante = useRef(null)
  useEffect(() => { pedirPermisoNotif() }, [])
  useEffect(() => {
    if (entrante && entrante.id !== prevEntrante.current) {
      if (sonidoActivo()) tonoOrden()
      notificar(t('Nueva orden asignada'), t('Tienes una orden nueva por aceptar.'))
    }
    prevEntrante.current = entrante?.id || null
  }, [entrante?.id])
  // Mientras haya una orden entrante sin responder, suena un tono largo en bucle.
  useEffect(() => {
    if (!entrante || !sonidoActivo()) return
    tonoOrden()
    const id = setInterval(() => tonoOrden(), 2000)
    return () => clearInterval(id)
  }, [entrante?.id])
  // Aviso local cuando llega un mensaje nuevo de la oficina.
  const prevOficina = useRef(null)
  useEffect(() => {
    if (prevOficina.current != null && noLeidosOficina > prevOficina.current) {
      if (sonidoActivo()) beep()
      notificar(t('Mensajes con la oficina'), t('Tienes un mensaje nuevo de la oficina.'))
    }
    prevOficina.current = noLeidosOficina
  }, [noLeidosOficina])
  const historial = misOrdenes.filter((o) => ESTADOS_HISTORIAL.includes(o.estado))
  const ganancias = misOrdenes.filter((o) => [E.ENTREGADA, ...ESTADOS_HISTORIAL].includes(o.estado)).reduce((a, o) => a + (Number(o.pagoChofer) || 0), 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#f2f3f7] dark:bg-slate-950">
      <IndicadorConexion />
      <header className="head-safe bg-gradient-to-b from-[#13233f] to-[#1e3a5f] px-4 pb-9 text-white">
        <div className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-[#c9a24b] text-[#13233f] shadow-md"><Truck size={22} strokeWidth={2} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-black leading-tight">{usuario?.nombre}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-300">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${enLinea ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {enLinea ? t('En línea') : t('Desconectado')} · {t('Chofer')}
            </div>
          </div>
          <button onClick={() => navigate('/elegir')} className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10" title={t('Cambiar módulo')}><Grid2x2 size={18} /></button>
          <button onClick={cerrarSesion} className="rounded-xl p-2 text-rose-300 transition hover:bg-white/10" title={t('Salir')}><LogOut size={18} /></button>
        </div>
      </header>

      <main className="relative -mt-5 flex-1 overflow-y-auto rounded-t-[1.75rem] bg-[#f2f3f7] p-3 pb-24 dark:bg-slate-950">
        {tab === 'ordenes' && (
          <>
            {!carrierId && (
              <Aviso tipo="warn" className="mb-3">
                <div>{t('Tu cuenta no está ligada a un transportista. Si el administrador ya la asignó, toca “Reparar mi acceso”. Si no, pídele que la asigne.')}</div>
                <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
              </Aviso>
            )}
            {activa ? <OrdenActiva orden={activa} tenantId={tenantId} usuario={usuario} rol={rol} geocercas={geocercas} plantas={plantas} pos={pos} liberacionAuto={liberacionAuto} noLeidosChat={noLeidosChatActiva} />
              : carrierId ? (
                <div className="mx-auto max-w-sm pt-4">
                  {enLinea ? (
                    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-6 text-center shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-900">
                      <div className="relative mx-auto mb-4 grid h-24 w-24 place-items-center">
                        <span className="absolute inline-flex h-24 w-24 animate-ping rounded-full bg-emerald-400/30" />
                        <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-emerald-400/20" />
                        <div className="relative grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg"><Truck size={30} /></div>
                      </div>
                      <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{t('En línea')}</div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('Buscando cargas para ti…')}</div>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"><Truck size={12} className="text-amber-500" /> {(miPresencia?.equipos && miPresencia.equipos.join(', ')) || miEquipos.join(', ') || '—'}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"><Clock size={12} /> {t('desde')} {miPresencia?.desde ? new Date(tsMillis(miPresencia.desde)).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                      <button onClick={desconectarme} className="mt-6 w-full rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><Power size={15} className="mr-1 inline" /> {t('Desconectarme')}</button>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><Power size={30} /></div>
                      <div className="text-lg font-black text-brand-navy dark:text-slate-100">{t('Estás desconectado')}</div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('Conéctate para recibir órdenes que coincidan con tu camión.')}</div>
                      <div className="mt-4">
                        {miEquipos.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1.5">{miEquipos.map((eq) => <span key={eq} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400"><Truck size={14} /> {eq}</span>)}</div>
                        ) : (
                          <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <div>{t('Sin equipo asignado. Pídele al administrador que te asigne un camión para recibir órdenes.')}</div>
                            <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
                          </div>
                        )}
                      </div>
                      <button onClick={conectarme} disabled={!miEquipos.length} className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-base font-black text-white shadow-lg transition hover:bg-emerald-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800"><Wifi size={18} className="mr-1 inline" /> {t('Conectarme')}</button>
                    </div>
                  )}
                </div>
              ) : null}
          </>
        )}
        {tab === 'historial' && (
          historial.length === 0 ? <VacioMsg icon={Clock} texto={t('Aún no tienes entregas cerradas.')} />
            : historial.map((o) => (
              <div key={o.id} className="mb-2 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700/60 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={16} /></span>
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="green">{t('Entregada')}</Badge>
                  <span className="ml-auto text-base font-black text-emerald-600 dark:text-emerald-400">{money(o.pagoChofer)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1"><Package size={12} className="text-amber-500" /> {t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</span>
                  {o.hitos?.entrega && <span>{new Date(o.hitos.entrega).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>}
                </div>
              </div>
            ))
        )}
        {tab === 'ganancias' && (() => {
          const enCurso = misOrdenes.filter((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado))
          const pendiente = enCurso.reduce((a, o) => a + (Number(o.pagoChofer) || 0), 0)
          const total = ganancias + pendiente
          const viajes = [...enCurso, ...historial]
          return (
            <div>
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#15b66b] to-emerald-600 p-6 text-center text-white shadow-lg">
                <div className="text-xs font-bold uppercase tracking-widest opacity-80">{t('Ganancias')}</div>
                <div className="mt-1 text-5xl font-black tracking-tight">{money(total)}</div>
                <div className="mt-1 text-sm font-semibold opacity-90">{viajes.length} {t('viaje(s)')}</div>
              </div>
              {/* Fast Pay: retira las ganancias YA PAGADAS a la cuenta bancaria del chofer. */}
              <button
                onClick={() => setFastPay(ganancias > 0 ? 'confirmar' : 'sinsaldo')}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-amber-500/30 transition active:scale-[0.98] disabled:opacity-50"
                disabled={ganancias <= 0}
              >
                <DollarSign size={18} /> {t('Fast Pay')} · {t('Cobrar')} {money(ganancias)}
              </button>
              <div className="mt-1.5 text-center text-[11px] text-slate-400">{t('Retiro instantáneo a tu cuenta · comisión 3%')}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><CheckCircle2 size={13} className="text-[#15b66b]" /> {t('Pagado')}</div>
                  <div className="mt-1 text-2xl font-black text-[#15b66b]">{money(ganancias)}</div>
                  <div className="text-[11px] text-slate-400">{historial.length} {t('entrega(s)')}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Clock size={13} className="text-amber-500" /> {t('Pendiente')}</div>
                  <div className="mt-1 text-2xl font-black text-brand-navy dark:text-slate-100">{money(pendiente)}</div>
                  <div className="text-[11px] text-slate-400">{enCurso.length} {t('en curso')}</div>
                </div>
              </div>
              <div className="mt-4 mb-1 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Desglose de viajes')}</div>
              {viajes.length === 0 ? (
                <VacioMsg icon={DollarSign} texto={t('Aún no tienes viajes con pago.')} />
              ) : (
                <div className="space-y-2">
                  {viajes.map((o) => {
                    const cerrada = historial.includes(o)
                    return (
                      <div key={o.id} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-900">
                        <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ${cerrada ? 'bg-[#15b66b]/10 text-[#15b66b]' : 'bg-amber-500/10 text-amber-500'}`}>{cerrada ? <CheckCircle2 size={16} /> : <Clock size={16} />}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</div>
                          <div className="truncate text-[11px] text-slate-400">{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</div>
                        </div>
                        <span className={`text-base font-black ${cerrada ? 'text-[#15b66b]' : 'text-slate-400'}`}>{money(o.pagoChofer)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {fastPay && (
                <FastPayModal
                  estado={fastPay}
                  setEstado={setFastPay}
                  monto={ganancias}
                  banco={miPerfil?.banco}
                  nombre={usuario?.nombre}
                  onIrPerfil={() => { setFastPay(null); setTab('perfil') }}
                  t={t}
                />
              )}
            </div>
          )
        })()}
        {tab === 'mensajes' && (
          <Card className="flex h-[calc(100vh-11rem)] flex-col p-3">
            <div className="mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-amber-500" /><span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Mensajes con la oficina')}</span></div>
            <div className="min-h-0 flex-1"><ChatOrden orden={{ id: convChofer(usuario?.nombre), numero: t('Oficina') }} fill /></div>
          </Card>
        )}
        {tab === 'perfil' && (
          <PerfilChofer usuario={usuario} tenantId={tenantId} miPerfil={miPerfil} miCarrier={miCarrier} miChofer={miChofer} carrierId={carrierId} />
        )}
      </main>

      <nav className="nav-safe fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
      {entrante && <OverlayEntrante orden={entrante} usuario={usuario} tenantId={tenantId} rol={rol} plantas={plantas} geocercas={geocercas} pos={pos} onRechazo={registrarRechazo} onResponder={marcarRespondida} miChofer={miChofer} />}
    </div>
  )
}

// Orden entrante a pantalla completa: se sobrepone a todo con Aceptar / Rechazar
// y un contador de 2:00. Si vence sin respuesta, cuenta como rechazo (timeout).
function OverlayEntrante({ orden, usuario, tenantId, rol, plantas, geocercas, pos, onRechazo, onResponder, miChofer }) {
  const { t } = useLang()
  const OFERTA_MS = 120000
  const [ocupado, setOcupado] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  const rest = orden.asignacionExpira ? Math.max(0, tsMillis(orden.asignacionExpira) - now) : null
  const mmss = rest != null ? `${Math.floor(rest / 60000)}:${String(Math.floor((rest % 60000) / 1000)).padStart(2, '0')}` : null
  const pct = rest != null ? Math.max(0, Math.min(100, (rest / OFERTA_MS) * 100)) : 100
  const planta = (plantas || []).find((p) => p.id === orden.plantaId) || null
  // Fallback por geocerca (misma razón que en OrdenActiva): el chofer no siempre
  // puede leer la planta, pero SÍ su geocerca — de ahí sacamos nombre/dirección.
  const _geoRec = (geocercas || []).find((g) => g.plantaId && g.plantaId === orden.plantaId) || null
  const plantaNom = planta?.nombre || _geoRec?.nombre || orden.plantaNombre || t('Planta')
  const plantaDir = planta?.direccion || ''
  // $/tonelada y distancia a la recogida (contexto para decidir la oferta).
  const porTon = orden.pesoEstimado ? Number(orden.pagoChofer || 0) / Number(orden.pesoEstimado) : null
  const objRecogida = geocercaObjetivo(orden, 'recogida', geocercas, plantas)
  const objL = objRecogida ? (Array.isArray(objRecogida) ? objRecogida : [objRecogida]) : []
  const distM = (pos && objL.length) ? Math.min(...objL.map((g) => (g.lat != null ? distanciaM(pos, { lat: g.lat, lng: g.lng }) : Infinity))) : null
  const distTxt = distM == null || !isFinite(distM) ? null : (distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${Math.round(distM)} m`)

  const aceptar = async () => {
    if (ocupado) return
    setOcupado(true)
    onResponder?.(orden.id) // oculta la oferta YA (no espera a Firestore)
    await guardar('orders', orden.id, { choferId: usuario.id, choferNombre: usuario.nombre, estado: E.ACEPTADA, asignacionExpira: null, asignacionManual: false, hitos: { ...(orden.hitos || {}), tomada: ahora() } })
    await ocupar(usuario.id, orden.id) // salgo de la cola de disponibles
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_acepta', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async (motivo) => {
    if (ocupado) return
    const m = motivo || window.prompt(t('Motivo del rechazo:')) || 'Sin motivo'
    setOcupado(true)
    onResponder?.(orden.id) // oculta la oferta YA (no espera a Firestore)
    // Excluye TODOS mis identificadores (uid + id del roster) para que el motor no me
    // reasigne la misma orden por otra vía; y limpio choferNombre para que no vuelva a
    // "engancharse" por nombre.
    const misIds = [usuario.id, miChofer?.id, usuario.nombre].filter(Boolean)
    const rechazadoPor = [...new Set([...(orden.rechazadoPor || []), ...misIds])]
    await guardar('orders', orden.id, { estado: E.CREADA, transportistaId: null, choferId: null, choferNombre: null, asignacionManual: false, asignacionExpira: null, rechazadoPor, ultimoRechazo: { por: usuario.nombre, motivo: m, ts: ahora() } })
    await liberar(usuario.id) // vuelvo al final de la cola de en línea
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'chofer_rechaza', entidad: 'orden', entidadId: orden.id, detalle: m })
    await onRechazo?.()
  }
  // Auto-rechazo por timeout si el contador llega a 0 (respaldo si el dispatcher no lo hace).
  const venciendo = useRef(false)
  useEffect(() => {
    if (rest === 0 && !venciendo.current && !ocupado) { venciendo.current = true; rechazar('timeout') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center">
      <div className="pb-safe w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        {/* Barra de tiempo (2:00) */}
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-r-full bg-amber-500 transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400"><Truck size={13} /> {t('Nueva carga')}</span>
            {mmss && <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-slate-500 dark:text-slate-400"><Clock size={15} /> {mmss}</span>}
          </div>

          {/* Pago protagonista */}
          <div className="mt-3 text-center">
            <div className="text-4xl font-black tracking-tight text-brand-navy dark:text-slate-100">{money(orden.pagoChofer)}</div>
            <div className="mt-0.5 text-xs font-medium text-slate-400">{t('Tu pago por este viaje')} · <span className="font-mono">{orden.numero}</span></div>
          </div>

          {/* Chips material / equipo / peso */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Package size={12} className="text-amber-500" /> {orden.material || t('material s/e')}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Truck size={12} className="text-amber-500" /> {orden.tipoEquipo || t('equipo s/e')}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{orden.pesoEstimado} ton</span>
            {porTon != null && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">{money(porTon)}/ton</span>}
            {distTxt && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><MapPin size={12} /> {distTxt} {t('a recogida')}</span>}
          </div>

          {/* Ruta recogida → entrega */}
          <div className="mt-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" />
                <span className="my-0.5 w-px flex-1 bg-slate-300 dark:bg-slate-600" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('Recoger')}</div>
                  <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{plantaNom}{plantaDir ? ` · ${plantaDir}` : ''}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('Entregar')}</div>
                  <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{orden.direccionEntrega || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <button onClick={aceptar} disabled={ocupado} className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-base font-black text-white shadow-lg transition hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-60">
            {ocupado ? t('Guardando…') : <><CheckCircle2 size={18} className="mr-1 inline" /> {t('Aceptar carga')}</>}
          </button>
          <button onClick={() => rechazar()} disabled={ocupado} className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-slate-400 transition hover:text-rose-500 disabled:opacity-60">{t('Rechazar')}</button>
        </div>
      </div>
    </div>
  )
}

function VacioMsg({ icon: Icon, texto }) {
  return <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400"><Icon size={34} strokeWidth={1.4} /><p className="max-w-xs text-sm">{texto}</p></div>
}

// Perfil del chofer (tipo red social): foto, datos y datos bancarios para MilePay.
// El propio chofer lo edita; se guarda en bulk_driverProfiles (doc id = su uid).
function PerfilChofer({ usuario, tenantId, miPerfil, miCarrier, miChofer, carrierId }) {
  const { t, lang, setLang } = useLang()
  const { cerrarSesion } = useBulkAuth()
  const [sonido, setSonidoOn] = useState(sonidoActivo())
  const toggleSonido = () => { const v = !sonido; setSonidoOn(v); setSonido(v); if (v) beep() }
  const [foto, setFoto] = useState(null)
  const [telefono, setTelefono] = useState('')
  const [licencia, setLicencia] = useState('')
  const [banco, setBanco] = useState({ titular: '', banco: '', cuenta: '', routing: '' })
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)
  const [verClave, setVerClave] = useState(false)
  const [lightboxP, setLightboxP] = useState(null)
  const tocado = useRef(false)
  const equiposCh = (miChofer?.equipos && miChofer.equipos.length) ? miChofer.equipos : (miChofer?.equipo ? [miChofer.equipo] : []) // asignados por el admin (solo lectura)
  const trabajos = miChofer?.jobsNombres || [] // nombres denormalizados (solo lectura)

  // Sembrar el formulario cuando carga el perfil (o desde la ficha del roster).
  useEffect(() => {
    setFoto(miPerfil?.foto || null)
    setTelefono(miPerfil?.telefono || miChofer?.telefono || '')
    if (tocado.current) return // no pisar lo que el chofer está editando
    setLicencia(miPerfil?.licencia || miChofer?.licencia || '')
    setBanco(miPerfil?.banco || { titular: '', banco: '', cuenta: '', routing: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miPerfil?.uid, miChofer?.id])

  // Guarda campos en el perfil de inmediato (merge). Incluye uid+nombre siempre
  // para que la oficina pueda encontrarlo. Así la foto no se pierde al re-render.
  const guardarCampo = async (patch) => {
    try { await crearConId('driverProfiles', usuario.id, tenantId, { uid: usuario.id, nombre: usuario.nombre, ...patch }) }
    catch { window.alert(t('No se pudo guardar. Puede que falten desplegar las reglas de driverProfiles.')) }
  }
  const onFoto = async (e) => { const f = await leerFotoReducida(e.target.files?.[0]); if (!f) return; setFoto(f); await guardarCampo({ foto: f }) }
  // Sube un documento (licencia/social) — se guarda al instante y queda bloqueado
  // para el chofer; solo el admin puede cambiarlo después.
  const subirDoc = async (campo, e) => { const f = await leerFotoReducida(e.target.files?.[0]); if (!f) return; await guardarCampo({ [campo]: f }) }
  const setB = (k) => (e) => { tocado.current = true; setBanco((s) => ({ ...s, [k]: e.target.value })) }
  const guardarPerfil = async () => {
    setGuardando(true)
    try {
      await guardarCampo({ telefono, licencia, banco })
      setOk(true); setTimeout(() => setOk(false), 2000)
    } catch { window.alert(t('No se pudo guardar el perfil. Puede que falten desplegar las reglas de driverProfiles.')) }
    finally { setGuardando(false) }
  }

  return (
    <div className="space-y-3">
      {/* Portada + foto tipo red social */}
      <Card className="overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-r from-amber-500 via-amber-600 to-brand-navy" />
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="relative">
              {foto
                ? <img src={foto} alt={usuario?.nombre} className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg dark:border-slate-900" />
                : <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-brand-navy text-3xl font-black text-white shadow-lg dark:border-slate-900">{(usuario?.nombre || '?').charAt(0).toUpperCase()}</div>}
              <label className="absolute bottom-0 right-0 grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 border-white bg-amber-500 text-slate-900 shadow dark:border-slate-900" title={t('Cambiar foto')}>
                <Camera size={13} /><input type="file" accept="image/*" onChange={onFoto} className="hidden" />
              </label>
            </div>
            <div className="min-w-0 pb-1">
              <div className="truncate text-lg font-black text-brand-navy dark:text-slate-100">{usuario?.nombre}</div>
              <div className="truncate text-xs text-slate-400">{usuario?.email}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><User size={12} /> {t('Chofer')}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Truck size={12} className="text-amber-500" /> {carrierId ? (miCarrier?.nombre || carrierId) : '—'}</span>
            {equiposCh.map((eq) => <span key={eq} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><Truck size={12} /> {eq}</span>)}
            {(miChofer?.jobs || []).length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{miChofer.jobs.length} {t('trabajo(s)')}</span>}
          </div>
        </div>
      </Card>

      {/* AJUSTES: idioma (cambia toda la app del chofer) + sonido de avisos */}
      <Card className="p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Ajustes')}</div>
        <div className="flex items-center justify-between border-b border-slate-100 py-2.5 dark:border-slate-800">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-navy dark:text-slate-100"><Languages size={17} className="text-amber-500" /> {t('Idioma')}</span>
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
            {[{ k: 'es', l: 'Español' }, { k: 'en', l: 'English' }].map((o) => (
              <button key={o.k} onClick={() => setLang(o.k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${lang === o.k ? 'bg-white text-brand-navy shadow-sm dark:bg-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-navy dark:text-slate-100">{sonido ? <Volume2 size={17} className="text-amber-500" /> : <VolumeX size={17} className="text-slate-400" />} {t('Sonido de notificaciones')}</span>
          <button onClick={toggleSonido} role="switch" aria-checked={sonido} className={`relative h-6 w-11 rounded-full transition ${sonido ? 'bg-[#15b66b]' : 'bg-slate-300 dark:bg-slate-600'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${sonido ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </Card>

      {/* Mis datos */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Mis datos')}</div>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"><Phone size={15} className="text-slate-400" /><input value={telefono} onChange={(e) => { tocado.current = true; setTelefono(e.target.value) }} placeholder={t('Teléfono')} className="w-full bg-transparent text-sm outline-none dark:text-slate-100" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"><IdCard size={15} className="text-slate-400" /><input value={licencia} onChange={(e) => { tocado.current = true; setLicencia(e.target.value) }} placeholder={t('N.º de licencia')} className="w-full bg-transparent text-sm outline-none dark:text-slate-100" /></label>
        </div>
      </Card>

      {/* Documentos: licencia y seguro social. Una vez subidos, solo el admin los cambia. */}
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><FileText size={16} className="text-amber-500" /> {t('Mis documentos')}</div>
        <p className="mb-3 text-[11px] text-slate-400">{t('Sube una foto de tu licencia y de tu seguro social. Al subirlas quedan bloqueadas: solo la oficina puede cambiarlas.')}</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ campo: 'licenciaFoto', l: t('Licencia') }, { campo: 'socialFoto', l: t('Seguro social') }].map((d) => {
            const val = miPerfil?.[d.campo]
            return (
              <div key={d.campo} className="rounded-xl border border-slate-200 p-2 text-center dark:border-slate-700">
                <div className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{d.l}</div>
                {val ? (
                  <>
                    <button type="button" onClick={() => setLightboxP(val)} className="block w-full"><img src={val} alt={d.l} className="h-24 w-full rounded-lg object-cover" /></button>
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><Check size={11} /> {t('Enviado')}</div>
                  </>
                ) : (
                  <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600">
                    <Camera size={20} /> {t('Subir')}
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => subirDoc(d.campo, e)} className="hidden" />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Asignación (solo lectura): la define el administrador */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Mi asignación')}</div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><Truck size={15} className="text-amber-500" /> {t('Mis camiones')}</span>
          {equiposCh.length > 0 ? <span className="flex flex-wrap justify-end gap-1">{equiposCh.map((eq) => <span key={eq} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-brand-navy dark:bg-slate-800 dark:text-slate-100">{eq}</span>)}</span> : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('sin asignar')}</span>}
        </div>
        <div className="py-2">
          <div className="mb-1 text-sm text-slate-500 dark:text-slate-400">{t('Trabajos asignados')}</div>
          {trabajos.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">{trabajos.map((j, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{j}</span>)}</div>
          ) : <span className="text-xs text-slate-400">{t('Todos los trabajos (sin restricción)')}</span>}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t('Tu camión y tus trabajos los asigna la oficina. Determinan qué órdenes recibes.')}</p>
      </Card>

      {/* Datos bancarios (MilePay) */}
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Landmark size={16} className="text-emerald-500" /> {t('Datos bancarios (MilePay)')}</div>
        <p className="mb-3 text-[11px] text-slate-400">{t('Para recibir tus pagos. Solo lo ve la oficina.')}</p>
        <div className="space-y-2.5">
          <input value={banco.titular} onChange={setB('titular')} placeholder={t('Titular de la cuenta')} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          <input value={banco.banco} onChange={setB('banco')} placeholder={t('Banco')} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          <div className="flex gap-2">
            <input value={banco.cuenta} onChange={setB('cuenta')} placeholder={t('N.º de cuenta')} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            <input value={banco.routing} onChange={setB('routing')} placeholder={t('Routing / CLABE')} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
        </div>
      </Card>

      <button onClick={guardarPerfil} disabled={guardando} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-black text-white shadow-lg transition hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-60">
        {guardando ? <><Spinner /> {t('Guardando…')}</> : ok ? <><Check size={18} /> {t('Guardado')}</> : <><Save size={18} /> {t('Guardar perfil')}</>}
      </button>

      <button onClick={() => setVerClave(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><KeyRound size={16} /> {t('Cambiar contraseña')}</button>

      <Card className="p-4">
        <div className="mb-1.5 text-[11px] text-slate-400">{t('¿No ves tus órdenes o cambió tu transportista? Refresca tus permisos aquí.')}</div>
        <RepararAcceso variant="ghost" />
      </Card>
      <button onClick={cerrarSesion} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"><LogOut size={16} /> {t('Cerrar sesión')}</button>

      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
      <Lightbox src={lightboxP} onClose={() => setLightboxP(null)} />
    </div>
  )
}

// Instrucción en lenguaje claro (estilo DoorDash): qué hacer AHORA, paso a paso.
const GUIA_CHOFER = {
  [E.ACEPTADA]:   { paso: 1, txt: 'Ve a la planta a recoger la carga' },
  [E.EN_PLANTA]:  { paso: 2, txt: 'Carga y escanea el ticket de báscula' },
  [E.EN_RUTA]:    { paso: 3, txt: 'Lleva la carga al punto de entrega' },
  [E.EN_DESTINO]: { paso: 4, txt: 'Descarga y registra la entrega (foto + firma)' },
  [E.ENTREGADA]:  { paso: 5, txt: 'Pide el código al supervisor para cerrar' },
}

function OrdenActiva({ orden, tenantId, usuario, rol, geocercas, plantas, pos, liberacionAuto = false, noLeidosChat = 0 }) {
  const { t } = useLang()
  const paso = siguientePasoChofer(orden.estado)
  const fase = faseChofer(orden.estado)
  const guia = GUIA_CHOFER[orden.estado] || null
  const [modal, setModal] = useState(null) // 'ticket' | 'pod' | 'chat'
  const [ocupado, setOcupado] = useState(false)
  const [peso, setPeso] = useState('')
  const [ticketNum, setTicketNum] = useState('')
  const [foto, setFoto] = useState(null)
  const [firma, setFirma] = useState(null)
  const [coment, setComent] = useState('')
  const [ocr, setOcr] = useState(null) // {cargando, progreso, msg}
  // Peso OFICIAL: el que lee el OCR del ticket es la fuente de verdad. El chofer no
  // lo edita libremente; para cambiarlo debe abrir una EXCEPCIÓN con motivo.
  const [pesoOcr, setPesoOcr] = useState(null) // valor leído del ticket (número)
  const [excepcionPeso, setExcepcionPeso] = useState(false)
  const [motivoPeso, setMotivoPeso] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [errCod, setErrCod] = useState(false)
  const [lightbox, setLightbox] = useState(null) // src de la foto ampliada

  // Destino de la fase actual: recogida = planta; entrega = dirección de entrega.
  const planta = (plantas || []).find((p) => p.id === orden.plantaId) || null
  const enRecogida = fase === 'recogida'
  // FALLBACK robusto: si el chofer no puede leer la planta (colección restringida),
  // usamos la GEOCERCA de la planta (que SÍ puede leer) para el nombre y las
  // coordenadas de navegación. Así el botón Navegar y la dirección SIEMPRE aparecen.
  const geoRecogida = (geocercas || []).find((g) => g.plantaId && g.plantaId === orden.plantaId && g.lat != null) || null
  const plantaGps = planta?.gps || (geoRecogida ? { lat: geoRecogida.lat, lng: geoRecogida.lng } : null)
  const plantaNombre = planta?.nombre || geoRecogida?.nombre || orden.plantaNombre || ''
  const gps = enRecogida ? plantaGps : null
  const dirTexto = enRecogida ? (planta?.direccion || plantaNombre || '') : (orden.direccionEntrega || '')
  const mapsUrl = (gps && gps.lat != null) ? `https://maps.google.com/?q=${gps.lat},${gps.lng}`
    : (dirTexto ? `https://maps.google.com/?q=${encodeURIComponent(dirTexto)}` : null)
  const copiaTexto = (gps && gps.lat != null) ? `${gps.lat}, ${gps.lng}` : dirTexto
  // Destino para navegar: coordenadas si hay, si no la dirección. Deja elegir app.
  const tieneDest = (gps && gps.lat != null) || !!dirTexto
  const navDest = (gps && gps.lat != null) ? `${gps.lat},${gps.lng}` : encodeURIComponent(dirTexto)
  const navUrls = {
    google: `https://www.google.com/maps/dir/?api=1&destination=${navDest}`,
    waze: (gps && gps.lat != null) ? `https://waze.com/ul?ll=${gps.lat},${gps.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(dirTexto)}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${navDest}`,
  }
  const puedeLlegar = paso?.gate ? puedeMarcarLlegada(pos, orden, fase, geocercas, plantas) : true
  const objetivo = geocercaObjetivo(orden, fase, geocercas, plantas)
  const hayGeocerca = !!objetivo
  // Distancia en vivo al punto objetivo (para orientar al chofer mientras se acerca).
  const objLista = objetivo ? (Array.isArray(objetivo) ? objetivo : [objetivo]) : []
  const distM = (pos && objLista.length) ? Math.min(...objLista.map((g) => (g.lat != null ? distanciaM(pos, { lat: g.lat, lng: g.lng }) : Infinity))) : null
  const distTxt = distM == null || !isFinite(distM) ? null : (distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${Math.round(distM)} m`)

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

  // Override manual cuando el GPS no fija: registra la llegada SIN verificación de
  // geocerca (queda marcado como manual y auditado). Evita que el chofer se atasque.
  const avanzarManual = async () => {
    if (!paso) return
    if (!window.confirm(t('¿Confirmas que ya estás en el punto? Se registrará sin verificación de GPS.'))) return
    if (paso.requiere === 'ticket') return setModal('ticket')
    if (paso.requiere === 'pod') return setModal('pod')
    setOcupado(true)
    const g = await capturarGPS()
    await guardar('orders', orden.id, { estado: paso.next, hitos: { ...(orden.hitos || {}), [paso.hito]: ahora() }, [`gps_${paso.hito}`]: g, [`manual_${paso.hito}`]: true })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: `hito_${paso.hito}_manual`, entidad: 'orden', entidadId: orden.id, detalle: 'sin verificación GPS' })
    setOcupado(false)
  }

  const guardarTicket = async () => {
    setOcupado(true)
    const g = await capturarGPS()
    // Peso OFICIAL: si el OCR leyó el ticket, MANDA el ticket (fuente de verdad); si
    // no, vale el que puso el chofer a mano. Cuando difieren, se registra la
    // diferencia para auditoría (la oficina la puede revisar).
    const manual = Number(peso) || null
    const desdeOcr = pesoOcr != null
    const oficial = desdeOcr ? pesoOcr : manual
    const fuente = desdeOcr ? 'ocr' : 'manual'
    const difiere = desdeOcr && manual != null && Math.abs(manual - pesoOcr) >= 0.5
    const ticket = {
      numero: ticketNum || null, foto: foto || null,
      peso: oficial, pesoOcr, pesoManual: manual, unidad: 'ton', fuente, ts: ahora(),
      ...(difiere ? { diferencia: { manual, ocr: pesoOcr, por: usuario?.nombre || usuario?.email || '', ts: ahora() } } : {}),
    }
    await guardar('orders', orden.id, {
      estado: paso.next, hitos: { ...(orden.hitos || {}), carga: ahora(), salidaPlanta: ahora() },
      pesoReal: oficial != null ? oficial : orden.pesoEstimado, pesoFuente: fuente,
      ticket, gps_carga: g,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: difiere ? 'ticket_diferencia_peso' : (desdeOcr ? 'ticket_carga_ocr' : 'ticket_carga'), entidad: 'orden', entidadId: orden.id, detalle: `Peso ${oficial} ton (${fuente})${difiere ? ` · a mano ${manual}` : ''}` })
    setModal(null); setOcupado(false); setFoto(null); setPeso(''); setTicketNum(''); setOcr(null); setPesoOcr(null); setExcepcionPeso(false); setMotivoPeso('')
  }

  const guardarPOD = async () => {
    if (!foto) { window.alert(t('Toma la foto de la entrega.')); return }
    if (!firma) { window.alert(t('Falta la firma.')); return }
    setOcupado(true)
    const g = await capturarGPS()
    const ordenPOD = { ...orden, pod: { firma, foto: foto || null }, gps_entrega: g }
    // Motor de liberación por confianza: ¿la entrega está dentro de la zona de destino?
    const objEnt = geocercaObjetivo(orden, 'entrega', geocercas, plantas)
    const objEntL = objEnt ? (Array.isArray(objEnt) ? objEnt : [objEnt]) : []
    const dentroGeocercaEntrega = objEntL.length ? (g ? objEntL.some((gf) => dentroGeocerca(g, gf)) : false) : null
    const evalLib = evaluarLiberacion(ordenPOD, { dentroGeocercaEntrega })
    const auto = liberacionAuto && liberacionAutomatica(evalLib)
    const podData = { firma, foto: foto || null, comentarios: coment || '', gps: g, ts: ahora() }
    if (auto) {
      // Confianza alta + liberación automática activa: se libera sin código de supervisor.
      // Usa la clave de hito 'liberacion' (la misma que muestra la línea de tiempo).
      await guardar('orders', orden.id, {
        estado: E.LIBERADA, hitos: { ...(orden.hitos || {}), entrega: ahora(), liberacion: ahora() },
        pod: podData, gps_entrega: g,
        liberacion: { modo: 'auto', nivel: evalLib.nivel, razones: evalLib.razones, ts: ahora() },
      })
      await liberar(usuario.id) // liberación automática: vuelvo a la cola de disponibles
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberacion_auto', entidad: 'orden', entidadId: orden.id, detalle: `confianza ${evalLib.nivel}` })
    } else {
      // Código de 4 dígitos que el supervisor verá y le dará al chofer para liberar.
      const codigoLiberacion = String(Math.floor(1000 + Math.random() * 9000))
      await guardar('orders', orden.id, {
        estado: E.ENTREGADA, hitos: { ...(orden.hitos || {}), entrega: ahora() }, codigoLiberacion,
        pod: podData, gps_entrega: g,
        liberacion: { modo: 'manual', nivel: evalLib.nivel, razones: evalLib.razones, ts: ahora() },
      })
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'pod_entrega', entidad: 'orden', entidadId: orden.id, detalle: `confianza ${evalLib.nivel}` })
    }
    setModal(null); setOcupado(false); setFoto(null); setFirma(null); setComent('')
  }

  const liberarConCodigo = async () => {
    setErrCod(false)
    if (codigo.trim() !== String(orden.codigoLiberacion || '')) { setErrCod(true); return }
    setOcupado(true)
    await guardar('orders', orden.id, { estado: E.LIBERADA, hitos: { ...(orden.hitos || {}), liberacion: ahora() }, liberadaPor: usuario?.nombre || usuario?.email })
    await liberar(usuario.id) // terminé: vuelvo a la cola de en línea (disponible)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id })
    setOcupado(false); setCodigo('')
  }

  const onFoto = async (e) => setFoto(await leerFotoReducida(e.target.files?.[0]))

  // Escaneo de ticket: abre la cámara, reduce la foto y CORRE EL OCR de una vez
  // (el chofer no tiene que tocar otro botón). Al terminar, si el peso leído difiere
  // del que puso a mano, la UI muestra una alerta y usa el del ticket.
  const onEscanearTicket = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const img = await leerFotoReducida(file)
    setFoto(img)
    setOcr({ cargando: true, progreso: 0 })
    try {
      const escaneada = await escanearParaOCR(img)
      const r = await leerTicket(escaneada, (p) => setOcr({ cargando: true, progreso: p }))
      if (r?.pesoNeto) { setPesoOcr(r.pesoNeto); setExcepcionPeso(false) }
      if (r?.ticket) setTicketNum(r.ticket)
      setOcr({ cargando: false, msg: r?.pesoNeto ? null : t('No se pudo leer el peso. Escribe el peso del ticket a mano abajo.') })
    } catch { setOcr({ cargando: false, msg: t('No se pudo leer el ticket. Escribe el peso a mano abajo.') }) }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
        <Badge color="navy">{t(ORDEN_ESTADO_LABEL[orden.estado])}</Badge>
        <button onClick={() => setModal('chat')} className="relative ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <MessageSquare size={14} /> {t('Chat')}
          {noLeidosChat > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{noLeidosChat}</span>}
        </button>
      </div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">{orden.material} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo}</div>

      {/* Guía "qué hacer ahora" en lenguaje claro (paso X de 5) — estilo DoorDash */}
      {guia && (
        <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-brand-navy p-3 text-white dark:bg-slate-800">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white/15 text-xs font-black">{guia.paso}/5</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">{t('Qué hacer ahora')}</div>
            <div className="text-sm font-bold leading-tight">{t(guia.txt)}{distTxt ? ` · ${distTxt}` : ''}</div>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-baseline gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10">
        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(orden.pagoChofer)}</span>
        <span className="text-xs font-medium text-emerald-700/70 dark:text-emerald-400/70">{t('tu pago por este viaje')}</span>
      </div>

      {/* Tarjeta de recogida / entrega según la fase */}
      {fase && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {enRecogida ? <Building2 size={13} /> : <MapPin size={13} />} {enRecogida ? t('Recoger en la planta') : t('Llevar a la entrega')}
          </div>
          {enRecogida && plantaNombre && <div className="mt-1 text-sm font-bold text-brand-navy dark:text-slate-100">{plantaNombre}</div>}
          {dirTexto && <div className="mt-0.5 text-sm text-brand-navy dark:text-slate-100">{dirTexto}</div>}
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1"><Package size={12} className="text-amber-500" /> {orden.material || '—'} · {orden.pesoReal ?? orden.pesoEstimado} ton</span>
            {orden.po && <span className="inline-flex items-center gap-1"><FileText size={12} className="text-amber-500" /> PO {orden.po}</span>}
          </div>
          <div className="relative mt-2.5 flex gap-2">
            {tieneDest && (
              <button type="button" onClick={() => setNavOpen((v) => !v)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-navy py-2.5 text-sm font-bold text-white dark:bg-amber-500 dark:text-slate-900"><Navigation size={15} /> {t('Navegar')}</button>
            )}
            <button type="button" onClick={copiar} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {copiado ? <><Check size={15} className="text-emerald-500" /> {t('Copiado')}</> : <><Copy size={15} /> {t('Copiar')}</>}
            </button>
            {navOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNavOpen(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">{t('Abrir con')}</div>
                  {[{ k: 'google', l: 'Google Maps' }, { k: 'waze', l: 'Waze' }, { k: 'apple', l: 'Apple Maps' }].map((a) => (
                    <a key={a.k} href={navUrls[a.k]} target="_blank" rel="noreferrer" onClick={() => setNavOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand-navy hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><Navigation size={14} className="text-amber-500" /> {a.l}</a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TIMELINE de progreso: completados (verde ✓), actual (dorado con anillo), pendientes (gris) */}
      {(() => {
        const idxActual = ORDEN_HITOS.findIndex((h) => !orden.hitos?.[h.key])
        return (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Progreso del viaje')}</div>
            <ol className="relative space-y-0">
              {ORDEN_HITOS.map((h, i) => {
                const done = !!orden.hitos?.[h.key]
                const actual = !done && i === idxActual
                const ultimo = i === ORDEN_HITOS.length - 1
                return (
                  <li key={h.key} className="relative flex gap-3 pb-3 last:pb-0">
                    {!ultimo && <span className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${done ? 'bg-[#15b66b]' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                    <span className={`relative z-10 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full ${done ? 'bg-[#15b66b] text-white' : actual ? 'bg-[#c9a24b] text-white ring-4 ring-[#c9a24b]/25' : 'border-2 border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'}`}>
                      {done ? <Check size={13} strokeWidth={3} /> : actual ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2 pt-0.5">
                      <span className={`text-sm ${done ? 'font-medium text-brand-navy dark:text-slate-200' : actual ? 'font-bold text-[#c9a24b]' : 'text-slate-400'}`}>{t(h.label)}</span>
                      {done && <span className="ml-auto text-[11px] tabular-nums text-slate-400">{new Date(orden.hitos[h.key]).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>}
                      {actual && <span className="ml-auto rounded-full bg-[#c9a24b]/15 px-2 py-0.5 text-[10px] font-bold text-[#c9a24b]">{t('ahora')}</span>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })()}

      {/* Fotos ya registradas (toca para ampliar) */}
      {(orden.ticket?.foto || orden.pod?.foto) && (
        <div className="mt-3 flex gap-2">
          <FotoMini src={orden.ticket?.foto} etiqueta={t('Ticket')} onAmpliar={setLightbox} />
          <FotoMini src={orden.pod?.foto} etiqueta={t('Entrega')} onAmpliar={setLightbox} />
        </div>
      )}

      {paso ? (
        <>
          <button onClick={avanzar} disabled={ocupado || (paso.gate && !puedeLlegar)}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed ${paso.gate && !puedeLlegar ? 'bg-slate-200 text-slate-400 shadow-none dark:bg-slate-800' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
            {ocupado ? <><Spinner /> {t('Guardando…')}</> : <>{paso.gate && !puedeLlegar ? <MapPin size={18} /> : <CheckCircle2 size={18} />} {t(paso.label)}</>}
          </button>
          {paso.gate && !puedeLlegar && (
            <>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-slate-400">
                <MapPin size={12} /> {distTxt ? `${t('A')} ${distTxt} ${t('del punto — el botón se activa al llegar.')}` : (hayGeocerca ? t('El botón se activa cuando llegues (dentro de la zona).') : t('Acércate al punto para activar el botón.'))}
              </p>
              {/* Override: si el GPS no fija (o falla), el chofer no queda atascado. */}
              <button onClick={avanzarManual} disabled={ocupado}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <MapPin size={13} /> {t('No me detecta el GPS — ya estoy aquí')}
              </button>
            </>
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

      {/* Modal ticket de carga — el PESO OFICIAL sale del ticket (OCR), no del chofer */}
      {modal === 'ticket' && (
        <Modal onClose={() => setModal(null)} titulo={t('Ticket de carga')}>
          {/* 1) Peso a mano (lo que el chofer lee del ticket). 2) Escanea el ticket:
              se abre la cámara y el OCR lee el peso. Si difieren, se avisa y manda el ticket. */}
          <Input placeholder={t('N° de ticket (opcional)')} value={ticketNum} onChange={(e) => setTicketNum(e.target.value)} className="mb-2" />

          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{t('Peso (ton)')}</label>
          <Input type="number" inputMode="decimal" placeholder={t('Escribe el peso del ticket, ej. 24')} value={peso} onChange={(e) => setPeso(e.target.value)} className="mb-3" />

          {/* Botón grande: abre la cámara y escanea el ticket automáticamente */}
          <label className={`mb-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg ${ocr?.cargando ? 'bg-slate-400' : 'bg-brand-navy dark:bg-amber-500 dark:text-slate-900'}`}>
            {ocr?.cargando ? <><Spinner /> {t('Escaneando…')} {ocr.progreso || 0}%</> : <><ScanLine size={18} /> {foto ? t('Volver a escanear ticket') : t('Escanear ticket con la cámara')}</>}
            <input type="file" accept="image/*" capture="environment" onChange={onEscanearTicket} disabled={ocr?.cargando} className="hidden" />
          </label>
          {foto && <div className="mb-2"><FotoMini src={foto} etiqueta={t('Ampliar')} onAmpliar={setLightbox} /></div>}
          {ocr?.msg && <p className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">{ocr.msg}</p>}

          {/* Peso leído del ticket + alerta si difiere del que puso a mano */}
          {pesoOcr != null && (() => {
            const manual = Number(peso) || null
            const difiere = manual != null && Math.abs(manual - pesoOcr) >= 0.5
            return (
              <div className="mb-2 rounded-xl border border-emerald-300 bg-emerald-500/10 p-3 dark:border-emerald-500/40">
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{t('Peso leído del ticket')}</div>
                <div className="flex items-baseline gap-2"><span className="text-2xl font-black text-brand-navy dark:text-slate-100">{pesoOcr}</span><span className="text-sm text-slate-500">ton</span></div>
                {difiere && (
                  <div className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-2 text-[12px] text-rose-600 dark:text-rose-400">
                    <b>⚠ {t('Diferencia detectada.')}</b> {t('Escribiste')} {manual} ton {t('pero el ticket dice')} {pesoOcr} ton. {t('Se usará el del ticket.')}
                    <button type="button" onClick={() => setPeso(String(pesoOcr))} className="ml-1 font-bold underline">{t('Igualar a la cámara')}</button>
                  </div>
                )}
                <button type="button" onClick={() => { setPesoOcr(null); setOcr(null) }} className="mt-1.5 text-[11px] font-semibold text-slate-400 underline">{t('El ticket dice otra cosa — usar mi peso a mano')}</button>
              </div>
            )
          })()}

          <Boton variant="gold" onClick={guardarTicket} className="w-full justify-center"
            disabled={ocupado || !(pesoOcr != null || peso)}>
            {ocupado ? <Spinner /> : t('Confirmar carga')}
          </Boton>
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
      <div className="pb-safe w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

// Fast Pay: retiro instantáneo de las ganancias a la cuenta del chofer.
// MODO TEST: no mueve dinero real (no hay backend de payout para bulk). Simula el
// flujo para ver cómo se ve. Comisión del 3% sobre el monto retirado.
const FASTPAY_COMISION = 0.03
function FastPayModal({ estado, setEstado, monto, banco, nombre, onIrPerfil, t }) {
  const comision = monto * FASTPAY_COMISION
  const neto = monto - comision
  const cuentaOk = banco && (banco.cuenta || '').trim() && (banco.titular || '').trim()
  const cierra = () => setEstado(null)

  // Al confirmar, "procesa" ~1.8 s (simulado) y muestra el mensaje de éxito.
  useEffect(() => {
    if (estado !== 'procesando') return
    const id = setTimeout(() => setEstado('listo'), 1800)
    return () => clearTimeout(id)
  }, [estado, setEstado])

  const enmascarar = (n) => {
    const s = (n || '').replace(/\s/g, '')
    return s.length > 4 ? `···· ${s.slice(-4)}` : s
  }

  return (
    <Modal titulo={estado === 'listo' ? '' : t('Fast Pay')} onClose={estado === 'procesando' ? () => {} : cierra}>
      {estado === 'sinsaldo' && (
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><DollarSign size={28} /></div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">{t('Aún no tienes ganancias pagadas disponibles para retirar. Cuando cierres una entrega, tu pago aparecerá aquí.')}</p>
          <Boton className="mt-4 w-full" onClick={cierra}>{t('Entendido')}</Boton>
        </div>
      )}

      {estado === 'confirmar' && !cuentaOk && (
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15"><Landmark size={26} /></div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">{t('Primero registra tu cuenta bancaria en tu Perfil para poder recibir el dinero.')}</p>
          <Boton className="mt-4 w-full" onClick={onIrPerfil}>{t('Ir a mi Perfil')}</Boton>
          <button onClick={cierra} className="mt-2 w-full py-1 text-xs text-slate-400">{t('Cancelar')}</button>
        </div>
      )}

      {estado === 'confirmar' && cuentaOk && (
        <div>
          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">{t('Modo prueba · no se mueve dinero real')}</div>
          <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">{t('Monto disponible')}</span><span className="font-semibold text-brand-navy dark:text-slate-100">{money(monto)}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">{t('Comisión')} (3%)</span><span className="font-semibold text-rose-500">− {money(comision)}</span></div>
            <div className="my-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('Recibes')}</span><span className="text-xl font-black text-[#15b66b]">{money(neto)}</span></div>
          </div>
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-navy/5 text-brand-navy dark:bg-slate-800 dark:text-slate-200"><Landmark size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{banco.banco || t('Cuenta registrada')}</div>
              <div className="truncate text-[11px] text-slate-400">{banco.titular} · {enmascarar(banco.cuenta)}</div>
            </div>
          </div>
          <Boton className="mt-4 w-full" onClick={() => setEstado('procesando')}>{t('Confirmar retiro')} · {money(neto)}</Boton>
          <button onClick={cierra} className="mt-2 w-full py-1 text-xs text-slate-400">{t('Cancelar')}</button>
        </div>
      )}

      {estado === 'procesando' && (
        <div className="flex flex-col items-center py-6">
          <Spinner />
          <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-300">{t('Enviando tu dinero…')}</p>
        </div>
      )}

      {estado === 'listo' && (
        <div className="py-2 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#15b66b]/10 text-[#15b66b]"><CheckCircle2 size={40} /></div>
          <p className="mt-4 text-lg font-black text-brand-navy dark:text-slate-100">{t('¡En hora buena!')} 🎉</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{t('Tu dinero está en camino')}, {nombre || t('chofer')}.</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#15b66b]/10 px-3 py-1 text-sm font-bold text-[#15b66b]">{money(neto)}</div>
          <Boton className="mt-4 w-full" onClick={cierra}>{t('Listo')}</Boton>
        </div>
      )}
    </Modal>
  )
}
