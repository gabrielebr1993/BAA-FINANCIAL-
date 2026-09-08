// ============================================================================
// BULK · Portal del SUPERVISOR — REDISEÑO MÓVIL 2026 (Bloque 2.5).
// Carcasa app (crema, header sin barra, FloatingTabBar) con la MISMA lógica de
// siempre: solo ve las órdenes cuyo jobId está en sus trabajos asignados
// (bulk_users.jobIds, reforzado por las reglas con bMyJobs). COMPAT: un
// supervisor aún no migrado (solo con plantaId) sigue viendo su planta.
// Acción principal: autorizar entregas con su código (token) y vigilar el patio.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Package, Truck, PackageCheck, KeyRound, RefreshCw, History, Copy, Clock, MapPin, Map as MapIcon, ArrowLeft, MessageSquare, Home, Scale, Grid2x2, LogOut, Languages } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useBulkAuth } from '../BulkAuthContext'
import MapaLeaflet from '../components/MapaLeaflet'
import Avatar from '../components/Avatar'
import CambiarClave from '../components/CambiarClave'
import { useFotoUsuario } from '../data/useCodigoUsuario'
import { useColeccion, useDoc } from '../data/useColeccion'
import { guardar, suscribir, where } from '../data/repo'
import { liberar as liberarPresencia } from '../data/presencia'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { etaOrden, etaTexto } from '../domain/eta'
import { NIVEL_LABEL } from '../domain/liberacion'
import { beep, notificar } from '../integraciones/alertasLocales'
import { Card, Badge, Aviso, EstadoVacio, Tabla } from '../../components/ui'
// Kit del REDISEÑO 2026 (Bloque 1): carcasa, home y accesos usan este lenguaje.
import { IconButton, PrimaryButton, Card as MpCard, StatCard, ListRow, Badge as MpBadge, FloatingTabBar } from '../ui'
import PanelConversaciones from '../components/PanelConversaciones'
import { usePrivados } from '../components/usePrivados'
import { useGrupos } from '../data/useGrupos'
import GruposModal from '../components/GruposModal'
import { menuGrupoConv } from '../data/grupos'
import BotonReunion from '../components/BotonReunion'
import { esRolStaff } from '../domain/comunicacion'
import { useLang, LangToggle } from '../../i18n'

const FINAL = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
// Grupos de estado: cada página interna lista las órdenes de SUS trabajos en
// ese estado. 'planta' es además la pestaña BÁSCULA de la barra flotante.
const GRUPOS_ESTADO = {
  cola: { label: 'En cola (por aceptar)', estados: [E.CREADA, E.EN_COLA, E.NOTIFICANDO], icon: ClipboardList },
  hacia: { label: 'Hacia la planta', estados: [E.ACEPTADA], icon: Truck },
  planta: { label: 'En planta / cargando', estados: [E.EN_PLANTA, E.CARGANDO], icon: Package },
  ruta: { label: 'En ruta', estados: [E.EN_RUTA], icon: Truck },
}
const COLOR_NIVEL = { alta: 'green', media: 'gold', baja: 'slate', critico: 'red' }
// Pestañas internas válidas (todas las secciones del portal siguen existiendo).
const TABS_VALIDAS = ['inicio', 'perfil', 'token', 'espera', 'mensajes', 'mapa', 'liberar', 'liberaciones', 'actividad']

export default function SupervisorPortal() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  // Alcance por TRABAJOS, leído EN VIVO de su propio doc de usuario (get por id,
  // permitido por reglas). Así, cuando el admin le asigna trabajos, el portal se
  // actualiza al instante — sin depender de la sesión ni de volver a entrar.
  const { dato: miDoc } = useDoc('users', usuario?.id)
  const jobIds = (miDoc?.jobIds?.length ? miDoc.jobIds : usuario?.jobIds) || []
  const jobsNombres = (miDoc?.jobsNombres?.length ? miDoc.jobsNombres : usuario?.jobsNombres) || []
  const plantaId = (miDoc ? miDoc.plantaId : usuario?.plantaId) || null
  const sinAsignacion = jobIds.length === 0 && !plantaId
  // Órdenes de SUS trabajos: UNA suscripción de IGUALDAD por trabajo, fusionadas.
  // (Con el filtro `jobId in [...]` el motor de reglas no podía probar la consulta
  // y la denegaba completa en silencio: el portal se veía vacío.)
  const [ordenes, setOrdenes] = useState([])
  const jobsClave = jobIds.slice(0, 10).join('|')
  useEffect(() => {
    if (!tenantId) { setOrdenes([]); return }
    const porFuente = {}
    const emitir = () => {
      const m = new Map()
      for (const lista of Object.values(porFuente)) for (const o of lista) m.set(o.id, o)
      setOrdenes([...m.values()])
    }
    const offs = []
    if (jobsClave) {
      for (const j of jobsClave.split('|')) {
        offs.push(suscribir('orders', tenantId, (d) => { porFuente[j] = d; emitir() }, [where('jobId', '==', j)]))
      }
    } else {
      offs.push(suscribir('orders', tenantId, (d) => { porFuente.planta = d; emitir() }, [where('plantaId', '==', plantaId || '__none__')]))
    }
    return () => offs.forEach((f) => f())
  }, [tenantId, jobsClave, plantaId])
  const { datos: geocercas } = useColeccion('geofences')
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [verClave, setVerClave] = useState(false)
  const miFoto = useFotoUsuario(usuario?.id)

  // Órdenes 'entregada' = SOLO legado (el sistema nuevo entrega y libera en un
  // paso con el token; ninguna orden nueva se queda en este estado).
  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === E.ENTREGADA), [ordenes])
  // ¿La orden ya está DENTRO de la zona de entrega según la GEOCERCA? El GPS del
  // chofer registra entrada/salida en o.geoEventos automáticamente (aunque él no
  // haya tocado «Llegué»): si el último evento de una geocerca de destino/proyecto
  // es 'entrada', el camión está en la zona.
  const enZonaEntrega = (o) => {
    const evs = (o.geoEventos || []).filter((e) => ['destino', 'proyecto'].includes(e.tipo))
    return evs.length > 0 && evs[evs.length - 1].evento === 'entrada'
  }
  // POR AUTORIZAR: el chofer marcó llegada (en_destino) O su camión YA cruzó la
  // geocerca de entrega (en_ruta + dentro de la zona). EN CAMINO: el resto en ruta.
  const porAutorizar = useMemo(() => ordenes.filter((o) => o.estado === E.EN_DESTINO || (o.estado === E.EN_RUTA && enZonaEntrega(o))), [ordenes])
  const enCamino = useMemo(() => ordenes.filter((o) => o.estado === E.EN_RUTA && !enZonaEntrega(o)), [ordenes])

  // Aviso al supervisor cuando ENTRA una carga nueva a la zona (sonido + notificación).
  // Aviso ÚNICO por orden (persistido): recargar la página no vuelve a sonar.
  const avisadasRef = useRef(null)
  if (avisadasRef.current === null) {
    try { avisadasRef.current = new Set(JSON.parse(localStorage.getItem('mp-sup-avisadas') || '[]')) }
    catch { avisadasRef.current = new Set() }
  }
  useEffect(() => {
    // Solo las órdenes que NUNCA se han avisado disparan sonido/notificación.
    const nuevas = porAutorizar.filter((o) => !avisadasRef.current.has(o.id))
    if (nuevas.length > 0) {
      try { beep() } catch { /* sin audio */ }
      const quien = nuevas.map((o) => `${o.numero}${o.choferNombre ? ` (${o.choferNombre})` : ''}`).join(', ')
      notificar(t('Camión en zona de entrega'), `${quien} — ${t('esperando tu código de autorización.')}`)
      for (const o of nuevas) avisadasRef.current.add(o.id)
      try { localStorage.setItem('mp-sup-avisadas', JSON.stringify([...avisadasRef.current].slice(-300))) } catch { /* lleno */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porAutorizar])
  const activas = useMemo(() => ordenes.filter((o) => !FINAL.includes(o.estado) || o.estado === E.ENTREGADA), [ordenes])
  const stats = useMemo(() => {
    const n = {}
    for (const [k, g] of Object.entries(GRUPOS_ESTADO)) n[k] = ordenes.filter((o) => g.estados.includes(o.estado)).length
    return n
  }, [ordenes])

  // ── HOME 2026 (Bloque 2.5): el patio de la planta ──────────────────────────
  // "En patio" = camiones físicamente en la planta ahora (en_planta | cargando).
  // Momento de llegada: hito llegadaPlanta del chofer o, si no lo marcó, el
  // evento de ENTRADA a la geocerca de la planta (lo escribe el GPS solo).
  const llegadaPatioMs = (o) => {
    const ms = Date.parse(o.hitos?.llegadaPlanta || '')
    if (Number.isFinite(ms)) return ms
    const ev = (o.geoEventos || []).filter((e) => e.tipo === 'planta' && e.evento === 'entrada').pop()
    const ms2 = Date.parse(ev?.ts || '')
    return Number.isFinite(ms2) ? ms2 : null
  }
  const enPatio = useMemo(() => {
    const lista = ordenes.filter((o) => [E.EN_PLANTA, E.CARGANDO].includes(o.estado))
    // El que sigue en báscula = el que llegó PRIMERO (sin timestamp, al final).
    return lista.sort((a, b) => (llegadaPatioMs(a) ?? Infinity) - (llegadaPatioMs(b) ?? Infinity))
  }, [ordenes])
  const hoyStr = new Date().toDateString()
  const esHoy = (ts) => { const ms = Date.parse(ts || ''); return Number.isFinite(ms) && new Date(ms).toDateString() === hoyStr }
  // "Cargados hoy" = órdenes con hito de CARGA (ticket de báscula) de hoy.
  const cargadosHoy = useMemo(() => ordenes.filter((o) => esHoy(o.hitos?.carga)).length, [ordenes]) // eslint-disable-line react-hooks/exhaustive-deps
  const unidadDe = (o) => o.unidad || o.placa || o.tipoEquipo || ''
  const minEsperando = (o) => {
    const ms = llegadaPatioMs(o)
    return ms == null ? null : Math.max(0, Math.round((Date.now() - ms) / 60000))
  }

  const nivelDe = (o) => (o.liberacion && o.liberacion.nivel) || null

  const liberarOrden = async (orden) => {
    const nivel = nivelDe(orden)
    const sensible = nivel === 'baja' || nivel === 'critico'
    let motivo = ''
    if (sensible) {
      const m = window.prompt(t('Confianza baja/crítica. Escribe el motivo para liberar de todos modos:'))
      if (m == null) return
      motivo = m.trim()
      if (!window.confirm(t('¿Confirmas liberar esta carga pese a la baja confianza?'))) return
    } else if (!window.confirm(`${t('¿Liberar la orden')} ${orden.numero}?`)) return

    const liberacion = { ...(orden.liberacion || {}), modo: 'supervisor', por: usuario?.nombre || usuario?.email, ts: ahora() }
    if (motivo) liberacion.motivo = motivo
    await guardar('orders', orden.id, {
      estado: E.LIBERADA,
      hitos: { ...(orden.hitos || {}), liberacion: ahora() },
      liberadaPor: usuario?.nombre || usuario?.email,
      liberacion,
    })
    // Libera la presencia del chofer para que vuelva a la cola de disponibles.
    if (orden.choferId) { try { await liberarPresencia(orden.choferId) } catch { /* noop */ } }
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id, detalle: sensible ? `confianza ${nivel} · ${motivo}` : `confianza ${nivel || 'n/d'}` })
    setMsg({ tipo: 'ok', txt: `${t('Orden')} ${orden.numero} ${t('liberada. El chofer ya puede tomar otra carga.')}` })
  }

  // Historial de MIS liberaciones (autorizaciones con mi token, escritas por el backend).
  const { datos: misLiberaciones } = useColeccion('liberaciones', [where('supervisorId', '==', usuario?.id || '__none__')])

  // ── MENSAJES del supervisor ────────────────────────────────────────────────
  // Puede hablar con: el ADMIN/operaciones (staff), los TRANSPORTISTAS asociados
  // a sus trabajos y los CHOFERES de esos transportistas. El alcance se filtra
  // aquí con los carriers de las órdenes de SUS jobs (la matriz de roles del
  // backend valida el resto).
  const { datos: misMensajes } = useColeccion('messages', [where('participantes', 'array-contains', usuario?.id || '__none__')])
  const carriersDeMisJobs = useMemo(() => new Set((ordenes || []).map((o) => o.transportistaId).filter(Boolean)), [ordenes])
  const filtrarContactoSup = useMemo(() => (p) => {
    if (esRolStaff(p.rol)) return true // admin / operaciones: siempre
    if (p.rol === 'transportista' || p.rol === 'chofer') return p.carrierId && carriersDeMisJobs.has(p.carrierId)
    return false // clientes u otros: no
  }, [carriersDeMisJobs])
  const yoPriv = useMemo(() => ({ uid: usuario?.id, rol: 'supervisor_planta' }), [usuario])
  const { seccion: seccionPriv, abrir: abrirPriv, modal: modalPriv, noLeidos: noLeidosPriv } = usePrivados({ mensajes: misMensajes, uid: usuario?.id, tenantId, yo: yoPriv, filtrarContacto: filtrarContactoSup })
  const [verGrupos, setVerGrupos] = useState(false)
  const { items: gruposItems, grupos, invitaciones } = useGrupos()
  const noLeidosGrupos = useMemo(() => (gruposItems || []).reduce((a, g) => a + (g.noLeidos || 0), 0), [gruposItems])
  const seccionesSup = useMemo(() => [
    seccionPriv,
    { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('No perteneces a ningún grupo.') },
  ], [seccionPriv, gruposItems, t])
  const noLeidosMsgTotal = noLeidosPriv + noLeidosGrupos

  // Pestaña interna activa (todas las secciones anteriores siguen existiendo).
  const activo = (tab.startsWith('g:') || TABS_VALIDAS.includes(tab)) ? tab : 'inicio'
  // Pestaña de la BARRA flotante que corresponde a la sección interna:
  //   Báscula = la operación en la planta (patio, mi código, por autorizar,
  //   cargas antiguas). Registro = actividad, liberaciones y mapa en vivo.
  const activoBar = ['inicio', 'perfil'].includes(activo) ? 'inicio'
    : activo === 'mensajes' ? 'mensajes'
      : (activo.startsWith('g:') && activo !== 'g:planta') ? 'inicio'
        : (activo === 'g:planta' || ['token', 'espera', 'liberar'].includes(activo)) ? 'bascula'
          : 'registro'

  // Avisos comunes (mensaje de acción + estado de asignación), sobre el contenido.
  const avisos = (
    <>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
      {sinAsignacion && <Aviso tipo="warn" className="mb-3">{t('Aún no tienes trabajos asignados. Pídele al administrador que te asigne tus trabajos en Usuarios para ver sus cargas.')}</Aviso>}
      {jobIds.length === 0 && plantaId && <Aviso tipo="info" className="mb-3">{t('Estás viendo las cargas de tu planta (modelo anterior). El administrador puede asignarte trabajos para el nuevo alcance por trabajo.')}</Aviso>}
    </>
  )

  return (
    // Carcasa 2026: fondo crema a todo el alto, header de fila (sin barra navy),
    // el cuerpo desplaza por dentro y la barra de pestañas FLOTA abajo.
    <div className="mp-app h-dvh mx-auto flex max-w-md flex-col overflow-hidden">
      <header className="mp-app-safe flex items-center gap-3 px-4 pb-1 pt-2">
        <button type="button" onClick={() => setTab('perfil')} title={t('Mi perfil')} className="transition active:scale-95">
          <Avatar foto={miFoto} nombre={usuario?.nombre} size={40} redondo />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-mp-ink">{usuario?.nombre}</div>
          <div className="truncate text-[12px] text-mp-ink-2">{t('Supervisor de trabajos')}{jobsNombres.length > 0 ? ` · ${jobsNombres.join(', ')}` : ''}</div>
        </div>
        <IconButton icon={Grid2x2} label={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
        <IconButton icon={LogOut} label={t('Salir')} onClick={cerrarSesion} />
      </header>

      {/* En Mensajes la página NO desplaza: el panel de chats mide exacto y
          desplaza por dentro (mismo patrón que el portal del chofer). */}
      <main className={`relative flex-1 p-3 ${activo === 'mensajes' ? 'overflow-hidden pb-2' : 'overflow-y-auto pb-32'}`}>
        {activo !== 'mensajes' && avisos}

        {/* ── INICIO (Bloque 2.5): la planta de un vistazo ────────────────── */}
        {activo === 'inicio' && (
          <div className="space-y-2 px-1">
            <div className="pb-1 pt-1">
              <div className="text-[12px] text-mp-ink-2">{t('Hola')}, {String(usuario?.nombre || '').split(' ')[0]} 👋</div>
              <h1 className="m-0 text-[22px] font-medium text-mp-ink">{t('Planta')}</h1>
            </div>

            {/* Patio ahora + cargados del día */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard oscura etiqueta={t('En patio')} valor={enPatio.length} />
              <StatCard etiqueta={t('Cargados hoy')} valor={cargadosHoy} />
            </div>

            {/* Siguiente en báscula: el camión que llegó primero al patio. */}
            <MpCard>
              <div className="text-[12px] text-mp-ink-2">{t('Siguiente en báscula')}</div>
              {enPatio.length > 0 ? (() => {
                const s = enPatio[0]
                const uni = unidadDe(s)
                return (
                  <>
                    <div className="mt-1 truncate text-[18px] font-medium text-mp-ink">{s.choferNombre || t('Sin chofer')}{uni ? ` · ${uni}` : ''}</div>
                    <div className="mt-0.5 truncate text-[13px] text-mp-ink-2">{t(s.material || 'material s/e')} · {s.pesoReal ?? s.pesoEstimado} ton · {s.numero}</div>
                    <PrimaryButton className="mt-4" icon={Scale} onClick={() => setTab('g:planta')}>{t('Registrar peso')}</PrimaryButton>
                  </>
                )
              })() : (
                <div className="mt-1 text-[14px] text-mp-ink-2">{t('No hay camiones en el patio ahora mismo.')}</div>
              )}
            </MpCard>

            {/* Camiones en espera (el resto del patio), con minutos esperando
                cuando hay timestamp de llegada (hito o geocerca). */}
            {enPatio.length > 1 && (
              <>
                <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Camiones en espera')}</div>
                {enPatio.slice(1).map((o) => {
                  const min = minEsperando(o)
                  return (
                    <ListRow key={o.id} icon={Truck} titulo={`${o.choferNombre || t('Sin chofer')}${unidadDe(o) ? ` · ${unidadDe(o)}` : ''}`}
                      meta={`${t(o.material || 'material s/e')} · ${o.pesoReal ?? o.pesoEstimado} ton · ${o.numero}`}
                      derecha={min != null ? <span className="flex-shrink-0 text-[12px] text-mp-ink-2">{min} {t('min')}</span> : null}
                      onClick={() => setTab('g:planta')} />
                  )
                })}
              </>
            )}
            {/* NOTA: el portal no tiene datos de INVENTARIO por material (solo
                órdenes y geocercas), así que esa sección se omite a propósito. */}

            {/* Accesos a las demás secciones del portal (siguen todas vivas). */}
            <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Accesos rápidos')}</div>
            <ListRow icon={KeyRound} titulo={t('Mi código')} meta={t('Autoriza las entregas de tus trabajos')} onClick={() => setTab('token')} />
            <ListRow icon={Clock} titulo={t('Por autorizar')} meta={t('En destino, esperando tu autorización')}
              derecha={porAutorizar.length > 0 ? <MpBadge>{porAutorizar.length}</MpBadge> : null} onClick={() => setTab('espera')} />
            <ListRow icon={ClipboardList} titulo={t('En cola (por aceptar)')} derecha={stats.cola > 0 ? <MpBadge>{stats.cola}</MpBadge> : null} onClick={() => setTab('g:cola')} />
            <ListRow icon={Truck} titulo={t('Hacia la planta')} derecha={stats.hacia > 0 ? <MpBadge>{stats.hacia}</MpBadge> : null} onClick={() => setTab('g:hacia')} />
            <ListRow icon={Truck} titulo={t('En ruta')} derecha={stats.ruta > 0 ? <MpBadge>{stats.ruta}</MpBadge> : null} onClick={() => setTab('g:ruta')} />
            <ListRow icon={MapIcon} titulo={t('Mapa')} meta={t('Mis camiones en vivo')} onClick={() => setTab('mapa')} />
            <ListRow icon={History} titulo={t('Liberaciones')} onClick={() => setTab('liberaciones')} />
            {pendientes.length > 0 && (
              <ListRow icon={PackageCheck} titulo={t('Cargas antiguas')} derecha={<MpBadge>{pendientes.length}</MpBadge>} onClick={() => setTab('liberar')} />
            )}
          </div>
        )}

        {/* ── PERFIL (mínimo): idioma, clave, módulo, salir ───────────────── */}
        {activo === 'perfil' && (
          <div className="space-y-2 px-1">
            <MpCard className="flex items-center gap-3">
              <Avatar foto={miFoto} nombre={usuario?.nombre} size={48} redondo />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-mp-ink">{usuario?.nombre}</div>
                <div className="truncate text-[12px] text-mp-ink-2">{usuario?.email}</div>
                <div className="truncate text-[12px] text-mp-ink-2">{t('Supervisor de trabajos')}{jobsNombres.length > 0 ? ` · ${jobsNombres.join(', ')}` : ''}</div>
              </div>
            </MpCard>
            <MpCard className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[14px] font-medium text-mp-ink"><Languages size={18} strokeWidth={1.75} className="text-mp-ink-2" /> {t('Idioma')}</span>
              <LangToggle />
            </MpCard>
            <ListRow icon={KeyRound} titulo={t('Cambiar contraseña')} onClick={() => setVerClave(true)} />
            <ListRow icon={Grid2x2} titulo={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
            <ListRow icon={LogOut} iconClass="bg-mp-red/10 text-mp-red" titulo={t('Cerrar sesión')} onClick={cerrarSesion} />
            {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
          </div>
        )}

        {/* Página de un ESTADO (g:planta = pestaña Báscula de la barra). */}
        {activo.startsWith('g:') && (() => {
          const g = GRUPOS_ESTADO[activo.slice(2)]
          if (!g) return null
          const lista = ordenes.filter((o) => g.estados.includes(o.estado)).sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
          const GIcon = g.icon
          return (
            <>
              <div className="mb-3 flex items-center gap-2">
                <button onClick={() => setTab('inicio')} className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={16} strokeWidth={1.75} /> {t('Volver')}</button>
                <GIcon size={16} className="text-amber-500" />
                <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t(g.label)}</h3>
                <Badge color="navy">{lista.length}</Badge>
              </div>
              {lista.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 p-8 text-center text-slate-400"><GIcon size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('No hay órdenes en este estado ahora mismo.')}</p></Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {lista.map((o) => (
                    <Card key={o.id} className="p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                        <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                        {(() => { const e = etaOrden(o, geocercas); return e ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.viejo ? 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300' : 'bg-blue-500/10 text-blue-600 dark:text-blue-300'}`} title={`${e.distKm} km ${e.fase === 'recogida' ? t('a la planta') : t('a la entrega')}`}>{etaTexto(e)}{e.viejo ? ` (${t('GPS viejo')})` : ''}</span> : null })()}
                        <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                        {o.urgente && <Badge color="red">{t('Urgente')}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || t('sin asignar')}{o.tipoEquipo ? ` · ${o.tipoEquipo}` : ''}</div>
                      {o.direccionEntrega && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} /> {o.direccionEntrega}</div>}
                      <ProgresoViaje o={o} t={t} />
                      {o.ultimaPos?.lat != null && <button onClick={() => setTab('mapa')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"><MapIcon size={11} /> {t('Ver en el mapa')}</button>}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )
        })()}

        {activo === 'mensajes' && (
          <>
            <PanelConversaciones secciones={seccionesSup} alturaClass="h-mensajes-chofer" abrir={abrirPriv} estiloApp
              menuConversacion={(item) => menuGrupoConv({ item, grupos, uid: usuario?.id, t })}
              accion={<span className="flex items-center gap-1.5">
                <BotonReunion />
                <button onClick={() => setVerGrupos(true)} className="inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-mp-ink shadow-card"><MessageSquare size={13} strokeWidth={1.75} /> {t('Grupos')}{invitaciones.length > 0 && <span className="ml-0.5 grid h-4 min-w-[16px] place-items-center rounded-pill bg-mp-gold px-1 text-[10px] font-bold text-mp-navy">{invitaciones.length}</span>}</button>
              </span>} />
            {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={[]} puedeCrear={false} uid={usuario?.id} onClose={() => setVerGrupos(false)} />}
            {modalPriv}
          </>
        )}

        {activo === 'token' && <TokenSupervisor t={t} />}

        {activo === 'espera' && (<>
          <Aviso tipo="info" className="mb-3">{t('Estas cargas están EN EL DESTINO: el chofer necesita tu código de 6 dígitos (pestaña «Mi código») para poder entregar. Al validar el código, la orden queda entregada y liberada de una vez.')}</Aviso>
          <div className="mb-2 flex items-center gap-2"><Clock size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En destino, esperando tu autorización')}</h3><Badge color="gold">{porAutorizar.length}</Badge></div>
          {porAutorizar.length === 0 ? (
            <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><CheckCircle2 size={30} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('Nadie está esperando tu código ahora mismo. Cuando un chofer llegue al destino, aparecerá aquí.')}</p></Card>
          ) : (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {porAutorizar.map((o) => (
                <Card key={o.id} className="p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                    {o.estado === E.EN_DESTINO
                      ? <Badge color="blue">{t('En destino')}</Badge>
                      : <Badge color="gold"><MapPin size={10} className="mr-0.5 inline" />{t('Cruzó la geocerca de entrega')}</Badge>}
                    <button onClick={() => setTab('token')} className="ml-auto inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-mp-ink shadow-card"><KeyRound size={13} strokeWidth={1.75} /> {t('Ver mi código')}</button>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || '—'}</div>
                  {o.direccionEntrega && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} /> {o.direccionEntrega}</div>}
                  <ProgresoViaje o={o} t={t} />
                  {o.ultimaPos?.lat != null && <button onClick={() => setTab('mapa')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"><MapIcon size={11} /> {t('Ver en el mapa')}</button>}
                </Card>
              ))}
            </div>
          )}
          {enCamino.length > 0 && (<>
            <div className="mb-2 flex items-center gap-2"><Truck size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En camino (pronto pedirán tu código)')}</h3><Badge color="blue">{enCamino.length}</Badge></div>
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {enCamino.map((o) => (
                <Card key={o.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="blue">{t('En ruta')}</Badge>
                    <span className="ml-auto text-xs text-slate-400">{o.choferNombre || '—'}</span>
                  </div>
                  <ProgresoViaje o={o} t={t} />
                </Card>
              ))}
            </div>
          </>)}
        </>)}

        {activo === 'mapa' && (() => {
          // Camiones ACTIVOS de sus trabajos con posición conocida, coloreados por
          // etapa, sobre las geocercas (planta y zona de entrega).
          const colorPunto = { aceptada: '#64748b', en_planta: '#13233f', cargando: '#13233f', en_ruta: '#2563eb', en_destino: '#f59e0b' }
          const activos = ordenes.filter((o) => !FINAL.includes(o.estado) && o.ultimaPos?.lat != null)
          const marcadores = activos.map((o) => ({ id: `o_${o.id}`, lat: o.ultimaPos.lat, lng: o.ultimaPos.lng, icon: 'truck', color: colorPunto[o.estado] || '#64748b', label: `${o.numero} · ${o.choferNombre || t('sin chofer')} · ${t(PASO_LABEL[o.estado] || o.estado)}` }))
          return (
            <Card className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                <MapIcon size={14} className="text-amber-500" />
                <span className="font-bold text-brand-navy dark:text-slate-100">{t('Mis camiones en vivo')}</span>
                <Badge color="navy">{activos.length}</Badge>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} /> {t('En ruta')}</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} /> {t('En destino')}</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#13233f' }} /> {t('En planta / cargando')}</span>
                </span>
              </div>
              {activos.length === 0
                ? <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400"><MapIcon size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('Ningún camión activo con GPS ahora mismo. Cuando un chofer esté en viaje, lo verás aquí con las geocercas.')}</p></div>
                : <MapaLeaflet geocercas={geocercas} marcadores={marcadores} alto="58vh" />}
              <p className="mt-2 px-1 text-[11px] text-slate-400">{t('La posición se actualiza con el GPS del chofer (cada ~20 s en viaje). Los círculos son las geocercas de planta y de entrega.')}</p>
            </Card>
          )
        })()}

        {activo === 'liberaciones' && (<>
          <div className="mb-2 flex items-center gap-2"><History size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Órdenes que he liberado')}</h3><Badge color="navy">{misLiberaciones.length}</Badge></div>
          {misLiberaciones.length === 0 ? (
            <EstadoVacio titulo={t('Aún no has liberado entregas')} texto={t('Cuando un chofer entregue con tu código, cada autorización quedará registrada aquí.')} mostrarBoton={false} />
          ) : (
            <div className="space-y-2">
              {misLiberaciones.slice().sort((a, b) => (b.autorizadaEn || '').localeCompare(a.autorizadaEn || '')).map((l) => (
                <Card key={l.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={16} /></span>
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{l.orderNumero || l.orderId}</span>
                    <Badge color="green">{t('Liberada')}</Badge>
                    <span className="ml-auto text-xs text-slate-400">{String(l.autorizadaEn || '').slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('Entregó')}: <b>{l.empleadoNombre || '—'}</b> ({t(l.empleadoRol || '')})
                    {l.intentosFallidosPrevios > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400">· {l.intentosFallidosPrevios} {t('intento(s) fallido(s) previos')}</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>)}

        {activo === 'liberar' && (<>
          {/* SOLO órdenes ANTIGUAS: entregadas antes del sistema de token. Las
              entregas nuevas se autorizan con «Mi código» y no pasan por aquí.
              Estas se liberan directo con el botón (sin códigos de 4 dígitos). */}
          <Aviso tipo="info" className="mb-3">{t('Estas cargas quedaron entregadas con el sistema anterior. Libéralas con el botón. Las entregas nuevas se autorizan con tu código de la pestaña «Mi código» y no aparecen aquí.')}</Aviso>
          <div className="mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-emerald-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Cargas antiguas por liberar')}</h3><Badge color="gold">{pendientes.length}</Badge></div>
          {pendientes.length === 0 ? (
            <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><CheckCircle2 size={30} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('No queda ninguna carga del sistema anterior. Todo lo nuevo se autoriza con tu código.')}</p></Card>
          ) : (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {pendientes.map((o) => (
                <Card key={o.id} className="p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                    {nivelDe(o) && <Badge color={COLOR_NIVEL[nivelDe(o)] || 'slate'}>{t(NIVEL_LABEL[nivelDe(o)] || nivelDe(o))}</Badge>}
                    <button onClick={() => liberarOrden(o)} className="ml-auto inline-flex items-center gap-1 rounded-pill bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600"><CheckCircle2 size={14} strokeWidth={1.75} /> {t('Liberar')}</button>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || '—'}</div>
                </Card>
              ))}
            </div>
          )}
        </>)}

        {activo === 'actividad' && (<>
          <div className="mb-2 flex items-center gap-2"><ClipboardList size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Actividad de mis trabajos')}</h3><Badge color="navy">{activas.length} {t('en curso')}</Badge></div>
          {activas.length === 0 ? (
            <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><ClipboardList size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('Ahora mismo no hay viajes EN CURSO en tus trabajos. Abajo quedan los terminados recientes; cuando arranque un viaje nuevo, aparecerá aquí con su avance.')}</p></Card>
          ) : (
            <Tabla
              columns={[
                { key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') },
                { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tipoEquipo', label: t('Camión') },
                { key: 'chofer', label: t('Chofer') }, { key: 'estado', label: t('Estado') },
              ]}
              rows={activas.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => ({ ...o, _key: o.id }))}
              renderCell={(o, k) => {
                if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
                if (k === 'material') return t(o.material || '—')
                if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
                if (k === 'tipoEquipo') return o.tipoEquipo || '—'
                if (k === 'chofer') return o.choferNombre || <span className="text-slate-400">{t('Sin asignar')}</span>
                if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                return null
              }}
              minWidth="min-w-[640px]"
            />
          )}
          {(() => {
            // Terminadas recientes (liberadas/cerradas/canceladas), las últimas 15.
            const term = ordenes
              .filter((o) => [E.LIBERADA, E.CERRADA, E.CANCELADA].includes(o.estado))
              .sort((a, b) => String(b.hitos?.liberacion || b.hitos?.entrega || '').localeCompare(String(a.hitos?.liberacion || a.hitos?.entrega || '')))
              .slice(0, 15)
            if (!term.length) return null
            return (<>
              <div className="mb-2 mt-5 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Terminadas recientes')}</h3><Badge color="green">{term.length}</Badge></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {term.map((o) => (
                  <Card key={o.id} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                      <Badge color={o.estado === E.CANCELADA ? 'red' : 'green'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                      <span className="ml-auto text-xs text-slate-400">{String(o.hitos?.liberacion || o.hitos?.entrega || '').slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton · {o.choferNombre || '—'}</div>
                  </Card>
                ))}
              </div>
            </>)
          })()}
          <div className="mt-4 space-y-2">
            {/* Desde Registro también se llega al historial de liberaciones y al mapa. */}
            <ListRow icon={History} titulo={t('Liberaciones')} meta={t('Órdenes que he liberado')} onClick={() => setTab('liberaciones')} />
            <ListRow icon={MapIcon} titulo={t('Mapa')} meta={t('Mis camiones en vivo')} onClick={() => setTab('mapa')} />
          </div>
        </>)}
      </main>

      {/* Barra FLOTANTE 2026: 4 pestañas, Chats en tercera posición.
          Báscula = patio de la planta (sección real «En planta / cargando»);
          Registro = sección real «Actividad» (tabla + terminadas recientes). */}
      <FloatingTabBar
        activo={activoBar}
        onSelect={(k) => setTab(k === 'bascula' ? 'g:planta' : k === 'registro' ? 'actividad' : k)}
        tabs={[
          { k: 'inicio', label: t('Inicio'), icon: Home },
          { k: 'bascula', label: t('Báscula'), icon: Scale },
          { k: 'mensajes', label: t('Chats'), icon: MessageSquare, badge: noLeidosMsgTotal },
          { k: 'registro', label: t('Registro'), icon: ClipboardList },
        ]}
      />
    </div>
  )
}

// ── "Token bancario" del supervisor ─────────────────────────────────────────
// Muestra el código TOTP vigente (el SECRETO nunca sale del servidor), cuánto
// falta para que cambie, y permite generar uno nuevo a mano (rotar = revoca el
// anterior al instante). El backend lo recalcula al vencer cada periodo.
function TokenSupervisor({ t }) {
  const [info, setInfo] = useState(null) // { codigo, segundos, periodo }
  const [seg, setSeg] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const pidiendo = useRef(false)

  const pedir = async (op = 'codigo') => {
    if (pidiendo.current) return
    pidiendo.current = true
    setCargando(true); setErr('')
    try {
      const fn = httpsCallable(funcsBulk, 'bulkTotpOp', { timeout: 15000 })
      const r = await fn({ op, ...(op === 'rotar' ? { motivo: 'rotación manual desde el portal' } : {}) })
      setInfo(r?.data || null); setSeg(r?.data?.segundos || 0)
    } catch (e) { setErr(e?.message || t('No se pudo obtener el código.')) }
    finally { setCargando(false); pidiendo.current = false }
  }
  useEffect(() => { pedir('codigo') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuenta regresiva local; al llegar a 0 se pide el código nuevo al backend.
  useEffect(() => {
    if (!info) return
    const id = setInterval(() => {
      setSeg((s) => {
        if (s <= 1) { pedir('codigo'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  const copiar = async () => {
    try { await navigator.clipboard.writeText(info?.codigo || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1200) } catch { /* noop */ }
  }
  const pct = info ? Math.max(0, Math.min(100, (seg / info.periodo) * 100)) : 0

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><KeyRound size={26} /></div>
      <h3 className="mt-3 text-base font-black text-brand-navy dark:text-slate-100">{t('Mi código de autorización')}</h3>
      <p className="mt-1 text-xs text-slate-400">{t('El chofer lo escribe para poder entregar. Solo sirve para las órdenes de TUS trabajos, cambia solo y cada uso queda registrado.')}</p>
      {err && <Aviso tipo="error" className="mt-3">{err}</Aviso>}
      {info ? (
        <>
          <button type="button" onClick={copiar} title={t('Copiar')} className="mt-4 inline-flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-500/5 px-6 py-4">
            <span className="font-mono text-4xl font-black tracking-[0.35em] text-brand-navy dark:text-slate-100">{cargando ? '· · ·' : info.codigo}</span>
            <Copy size={16} className="text-slate-400" />
          </button>
          {copiado && <div className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{t('Copiado')}</div>}
          <div className="mx-auto mt-4 max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full transition-all duration-1000 ${seg <= 10 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`mt-1 text-xs font-bold ${seg <= 10 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {t('Código válido durante')}: {seg} s <span className="font-normal text-slate-400">({t('rota cada')} {info.periodo} s)</span>
            </div>
          </div>
        </>
      ) : (
        <div className="py-6 text-sm text-slate-400">{cargando ? t('Generando tu código…') : ''}</div>
      )}
      <button type="button" onClick={() => window.confirm(t('¿Generar un código nuevo? El actual dejará de valer de inmediato (útil si crees que alguien lo vio).')) && pedir('rotar')} disabled={cargando}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
        <RefreshCw size={15} /> {t('Generar nuevo código (revoca el actual)')}
      </button>
    </Card>
  )
}


// ── Progreso del viaje (mini barra por tarjeta) ─────────────────────────────
// Etapas del viaje hacia la entrega y el % que representa cada estado.
const PASOS_VIAJE = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const PASO_LABEL = { aceptada: 'Aceptada', en_planta: 'En planta', cargando: 'Cargando', en_ruta: 'En ruta', en_destino: 'En destino' }
const haceTxt = (ts) => {
  const ms = Date.parse(ts || '')
  if (!Number.isFinite(ms)) return null
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000))
  return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`
}
function ProgresoViaje({ o, t }) {
  const idx = PASOS_VIAJE.indexOf(o.estado)
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / PASOS_VIAJE.length) * 100)
  const gps = o.ultimaPos?.ts ? haceTxt(o.ultimaPos.ts) : null
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{t(PASO_LABEL[o.estado] || o.estado)}</span>
        <span>{pct}%{gps ? ` · GPS ${t(gps)}` : ''}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all ${o.estado === E.EN_DESTINO ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
    </div>
  )
}
