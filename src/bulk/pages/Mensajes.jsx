import { useEffect, useMemo, useState } from 'react'
import { Search, Truck, User, Building2, X, Users, Shield } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crearConId } from '../data/repo'
import { convChofer, convCarrier, convClienteOrden, convStaff, resumenPorConversacion, eliminarConversacion } from '../data/chat'
import { esConvGrupo, grupoIdDeConv, convGrupo, disolverGrupo, salirGrupo } from '../data/grupos'
import { useGrupos } from '../data/useGrupos'
import { conversacionesAdmin } from '../domain/conversaciones'
import { onAbrirConversacion, consumirConversacionPendiente } from '../data/notifsMensajes'
import { useAvatares } from '../data/useCodigoUsuario'
import { useBulkAuth } from '../BulkAuthContext'
import { ORDEN_ESTADO as E, BULK_ROLES_LABEL } from '../domain/constants'
import PanelConversaciones from '../components/PanelConversaciones'
import GruposModal from '../components/GruposModal'
import { Card, Cargando, Input, Boton } from '../../components/ui'
import { useLang } from '../../i18n'

// Órdenes con las que tiene sentido chatear: en cola asignada o en proceso.
const CHATEABLES = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]

export default function Mensajes() {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  const esAdmin = rol === 'admin' || rol === 'super_admin'
  const { datos: ordenes, cargando } = useColeccion('orders')
  // Señal de chat del tenant: ¿el CLIENTE ve los chats por viaje? (admin la apaga/enciende)
  const { datos: signalsChat } = useColeccion('signals')
  const clienteVeOrdenes = ((signalsChat || []).find((x) => x.id === 'chat') || {}).clienteVeOrdenes !== false
  const esAdminMsg = rol === 'admin' || rol === 'super_admin'
  const toggleChatCliente = async () => {
    try { await crearConId('signals', 'chat', tenantId, { clienteVeOrdenes: !clienteVeOrdenes }) } catch { /* permisos */ }
  }
  const { datos: carriers } = useColeccion('carriers')
  const { datos: clientes } = useColeccion('clients')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: usuarios } = useColeccion('users')
  const { datos: mensajes } = useColeccion('messages')
  const avatares = useAvatares()
  const { items: gruposItems, grupos, invitaciones } = useGrupos()
  const [nuevoDe, setNuevoDe] = useState(null) // sección cuyo selector de "nueva conversación" está abierto
  const [buscarNuevo, setBuscarNuevo] = useState('')
  const [verGrupos, setVerGrupos] = useState(false)
  // Conversaciones iniciadas en esta sesión (aún sin mensajes): filas listas para el panel.
  const [directos, setDirectos] = useState([])
  const [abrir, setAbrir] = useState(null)

  // Abrir una conversación al tocar su aviso flotante (AvisosMensajes). Al montar,
  // consume la conversación pendiente (si el usuario venía de otra pantalla).
  useEffect(() => {
    const abrirConv = (k) => { if (k && k !== '__mensajes__') { setAbrir(k); setTimeout(() => setAbrir(null), 0) } }
    abrirConv(consumirConversacionPendiente())
    return onAbrirConversacion(abrirConv)
  }, [])

  // Candidatos a grupos: el admin/staff puede enumerar a todos los usuarios del tenant.
  const candidatos = useMemo(
    () => (usuarios || []).filter((u) => u.id !== usuario?.id).map((u) => ({ uid: u.id, nombre: u.nombre || u.email || 'Usuario', rol: u.rol, foto: null })),
    [usuarios, usuario],
  )

  // Choferes = plantilla de todos los transportes (carrier.choferes).
  const choferes = useMemo(
    () => carriers.flatMap((c) => (c.choferes || []).map((d) => ({ ...d, carrierNombre: c.nombre }))),
    [carriers],
  )

  // Categorización de TODAS las conversaciones con historial en 4 secciones.
  const cats = useMemo(
    () => conversacionesAdmin({ mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, uid: usuario?.id }),
    [mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, usuario],
  )

  // Mezcla las conversaciones recién iniciadas (sin mensajes) en su sección, sin duplicar.
  const secciones = useMemo(() => {
    const mezclar = (base, seccion) => {
      const keys = new Set(base.map((x) => x.key))
      const extra = directos.filter((d) => d.seccion === seccion && !keys.has(d.key))
      return [...extra, ...base]
    }
    const abrirNuevo = (k) => { setNuevoDe(k); setBuscarNuevo('') }
    return [
      { k: 'clientes', label: t('Clientes'), icon: 'cliente', items: mezclar(cats.clientes, 'clientes'), vacio: t('Sin conversaciones con clientes.'), onNueva: () => abrirNuevo('clientes'), nuevaLabel: t('Nueva conversación con cliente') },
      { k: 'transportistas', label: t('Transportistas'), icon: 'transportista', items: mezclar(cats.transportistas, 'transportistas'), vacio: t('Sin conversaciones con transportistas.'), onNueva: () => abrirNuevo('transportistas'), nuevaLabel: t('Nueva conversación con transportista') },
      { k: 'conductores', label: t('Conductores'), icon: 'chofer', items: mezclar(cats.conductores, 'conductores'), vacio: t('Sin conversaciones con conductores (por viaje/carga) aún.'), onNueva: () => abrirNuevo('conductores'), nuevaLabel: t('Nueva conversación con conductor') },
      { k: 'operaciones', label: t('Operaciones'), icon: 'operacion', items: mezclar(cats.operaciones, 'operaciones'), vacio: t('Sin conversaciones internas con el equipo del staff.'), onNueva: () => abrirNuevo('operaciones'), nuevaLabel: t('Nueva conversación con staff') },
      { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('Aún no perteneces a ningún grupo.'), onNueva: () => setVerGrupos(true), nuevaLabel: t('Crear nuevo grupo') },
    ]
  }, [cats, directos, gruposItems, t])

  // Personal del STAFF (operaciones): miembros del tenant que NO son de la cadena
  // (cliente/transportista/chofer/supervisor). Se filtran por rol para "Operaciones".
  const CADENA = ['cliente', 'transportista', 'chofer', 'supervisor_planta']
  const staffUsers = useMemo(() => usuarios.filter((u) => u.id !== usuario?.id && u.rol && !CADENA.includes(u.rol)), [usuarios, usuario])

  // Selector de "nueva conversación" FILTRADO por la pestaña activa (nuevoDe). Cada
  // pestaña solo ofrece los usuarios de su rol; nada de listas mezcladas.
  const resultadosNuevo = useMemo(() => {
    const q = buscarNuevo.trim().toLowerCase()
    if (nuevoDe === 'transportistas') {
      return carriers.filter((c) => !q || (c.nombre || '').toLowerCase().includes(q))
        .map((c) => ({ id: convCarrier(c.id), nombre: c.nombre || '', tipo: 'carrier', seccion: 'transportistas' }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    }
    if (nuevoDe === 'conductores') {
      return choferes.filter((d) => !q || (d.nombre || '').toLowerCase().includes(q))
        .map((d) => ({ id: convChofer(d.nombre), nombre: d.nombre || '', tipo: 'driver', sub: d.carrierNombre, seccion: 'conductores' }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    }
    if (nuevoDe === 'operaciones') {
      return staffUsers.filter((u) => !q || (u.nombre || u.email || '').toLowerCase().includes(q))
        .map((u) => ({ id: convStaff(usuario?.id, u.id), nombre: u.nombre || u.email || t('Staff'), tipo: 'staff', sub: u.rol, seccion: 'operaciones', participantes: [u.id, usuario?.id].filter(Boolean) }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    }
    // clientes: SIEMPRE aparece la lista de CLIENTES (antes solo salían viajes
    // "chateables": si el cliente no tenía viajes activos, la lista quedaba VACÍA
    // y no había a quién elegir). El canal cliente↔oficina es por viaje, así que
    // cada cliente usa su viaje MÁS RECIENTE; además se listan sus viajes activos
    // por si quieres hablar de uno específico. Cliente sin viajes → fila
    // deshabilitada con el motivo (aún no hay canal por el cual el cliente reciba).
    const items = []
    const usados = new Set()
    for (const c of clientes.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))) {
      const suyas = ordenes.filter((o) => o.clienteId === c.id && o.estado !== 'cancelada')
        .sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
      const coincide = !q || (c.nombre || '').toLowerCase().includes(q) || suyas.some((o) => (o.numero || '').toLowerCase().includes(q))
      if (!coincide) continue
      const reciente = suyas[0]
      if (reciente) {
        usados.add(convClienteOrden(reciente.id))
        items.push({ id: convClienteOrden(reciente.id), nombre: c.nombre || t('Cliente'), tipo: 'cliente', sub: `${reciente.numero || ''}${reciente.material ? ` · ${reciente.material}` : ''}`, seccion: 'clientes', viaje: reciente.numero, material: reciente.material, participantes: [c.id] })
      } else {
        items.push({ id: `sin_${c.id}`, nombre: c.nombre || t('Cliente'), tipo: 'cliente', sub: t('sin viajes aún — crea una orden para abrir su canal'), seccion: 'clientes', deshabilitado: true })
      }
      // Viajes ACTIVOS adicionales del mismo cliente (canal por viaje específico).
      for (const o of suyas.filter((o) => CHATEABLES.includes(o.estado))) {
        const id = convClienteOrden(o.id)
        if (usados.has(id)) continue
        usados.add(id)
        items.push({ id, nombre: c.nombre || t('Cliente'), tipo: 'cliente', sub: `${o.numero || ''}${o.material ? ` · ${o.material}` : ''}`, seccion: 'clientes', viaje: o.numero, material: o.material, participantes: [c.id] })
      }
    }
    return items
  }, [nuevoDe, carriers, choferes, staffUsers, ordenes, clientes, buscarNuevo, usuario, t])

  const abrirDirecto = (item) => {
    const iconoDe = { carrier: 'transportista', cliente: 'cliente', driver: 'chofer', staff: 'operacion' }
    const rolDe = { carrier: t('Transportista'), cliente: t('Cliente'), driver: t('Chofer'), staff: t('Staff') }
    const colorDe = { carrier: 'gold', cliente: 'green', driver: 'navy', staff: 'slate' }
    const fila = {
      key: item.id, chatId: item.id, seccion: item.seccion,
      icon: iconoDe[item.tipo] || 'chofer',
      titulo: item.nombre,
      rolLabel: rolDe[item.tipo] || t('Chofer'),
      rolColor: colorDe[item.tipo] || 'navy',
      viaje: item.viaje || '', material: item.material || '', carrierNombre: item.sub && item.tipo === 'driver' ? item.sub : '',
      lastText: '', lastTs: '', noLeidos: 0, participantes: item.participantes ?? null,
    }
    setDirectos((s) => (s.some((d) => d.key === fila.key) ? s : [...s, fila]))
    setAbrir(item.id); setNuevoDe(null); setBuscarNuevo('')
    // Reinicia el disparador para permitir reabrir la misma conversación después.
    setTimeout(() => setAbrir(null), 0)
  }

  // Mapa clave→grupo, para conocer el rol del usuario en cada grupo (creador/admin/normal).
  const grupoPorConv = useMemo(() => Object.fromEntries((grupos || []).map((g) => [convGrupo(g.id), g])), [grupos])

  // ── Acciones DIFERENCIADAS y con permisos claros ──────────────────────────
  // 1) SALIR del grupo (cualquier miembro; el grupo sigue existiendo para los demás).
  const salirDelGrupo = async (g) => {
    if (!g) return
    if (!window.confirm(`${t('¿Quieres salir de este grupo?')}\n\n${t('El grupo continuará existiendo para los demás miembros, pero dejarás de formar parte de él.')}`)) return
    setDirectos((s) => s.filter((d) => d.key !== convGrupo(g.id)))
    try { await salirGrupo(g.id) } catch (e) { window.alert(e?.message || t('No se pudo salir del grupo.')) }
  }
  // 2) ELIMINAR el grupo para TODOS (solo creador/admin). Confirmación fuerte.
  const eliminarGrupoTodos = async (g) => {
    if (!g) return
    if (!window.confirm(`${t('¿Eliminar este grupo para todos?')}\n\n${t('Esta acción eliminará definitivamente el grupo y todos sus miembros dejarán de tener acceso. Esta acción no se puede deshacer.')}`)) return
    try { await disolverGrupo(g.id) } catch (e) { window.alert(e?.message || t('No se pudo eliminar el grupo.')) }
  }
  // 3) Eliminar una conversación DIRECTA (no grupo) de forma permanente (admin/staff).
  const eliminarDirecto = async (item) => {
    if (!item?.chatId) return
    if (!window.confirm(`${t('¿Eliminar este chat?')}\n\n${t('Esta acción eliminará el chat de forma permanente para todos y no se puede deshacer.')}`)) return
    setDirectos((s) => s.filter((d) => d.key !== item.key))
    try { await eliminarConversacion(tenantId, item.chatId) } catch { /* noop */ }
  }

  // Menú contextual (⋮) de cada conversación, según su tipo y el rol del usuario.
  const menuConversacion = (item) => {
    const key = item?.key || item?.chatId
    if (esConvGrupo(key)) {
      const g = grupoPorConv[key]
      if (!g) return []
      const gestor = g.creadorId === usuario?.id || esAdmin
      const m = []
      if (g.creadorId !== usuario?.id) m.push({ label: t('Salir del grupo'), icon: 'salir', onClick: () => salirDelGrupo(g) })
      if (gestor) m.push({ label: t('Eliminar grupo para todos'), icon: 'eliminar', danger: true, onClick: () => eliminarGrupoTodos(g) })
      return m
    }
    return [{ label: t('Eliminar chat'), icon: 'eliminar', danger: true, onClick: () => eliminarDirecto(item) }]
  }

  const tituloNuevo = { clientes: t('Nueva conversación con cliente'), transportistas: t('Nueva conversación con transportista'), conductores: t('Nueva conversación con conductor'), operaciones: t('Nueva conversación con staff') }
  const placeholderNuevo = { clientes: t('Buscar cliente / viaje…'), transportistas: t('Buscar transportista…'), conductores: t('Buscar conductor…'), operaciones: t('Buscar personal del staff…') }

  if (cargando) return <Cargando />

  return (
    <>
      <PanelConversaciones
        secciones={secciones}
        abrir={abrir}
        titulo={t('Mensajes')}
        menuConversacion={menuConversacion}
        accion={<span className="flex items-center gap-1.5">
          {esAdminMsg && (
            <button onClick={toggleChatCliente} title={t('¿El cliente ve los chats por viaje en su portal?')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${clienteVeOrdenes ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
              {t('Chat de viajes al cliente')}: {clienteVeOrdenes ? 'ON' : 'OFF'}
            </button>
          )}
          {invitaciones.length > 0 && <Boton variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setVerGrupos(true)}><Users size={15} /> {t('Invitaciones')}<span className="ml-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{invitaciones.length}</span></Boton>}
        </span>}
      />

      {/* Selector de nueva conversación FILTRADO por la pestaña activa. */}
      {nuevoDe && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20" onClick={() => setNuevoDe(null)}>
          <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{tituloNuevo[nuevoDe] || t('Nueva conversación')}</h3>
              <button onClick={() => setNuevoDe(null)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input autoFocus value={buscarNuevo} onChange={(e) => setBuscarNuevo(e.target.value)} placeholder={placeholderNuevo[nuevoDe] || t('Buscar…')} className="w-full pl-8" />
            </div>
            <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
              {resultadosNuevo.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">{t('Sin resultados.')}</div>
              ) : resultadosNuevo.map((r) => (
                <button key={r.id} onClick={() => !r.deshabilitado && abrirDirecto(r)} disabled={r.deshabilitado}
                  className={`flex w-full items-center gap-2 rounded-xl border border-transparent p-2.5 text-left ${r.deshabilitado ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                    {r.tipo === 'carrier' ? <Truck size={16} /> : r.tipo === 'cliente' ? <Building2 size={16} /> : r.tipo === 'staff' ? <Shield size={16} /> : <User size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</div>
                    <div className="truncate text-xs text-slate-400">{r.tipo === 'carrier' ? t('Transporte') : r.tipo === 'cliente' ? `${t('Cliente')} · ${r.sub}` : r.tipo === 'staff' ? `${t('Staff')}${r.sub ? ` · ${t(BULK_ROLES_LABEL[r.sub]) || r.sub}` : ''}` : `${t('Chofer')}${r.sub ? ` · ${r.sub}` : ''}`}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {verGrupos && (
        <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={candidatos} puedeCrear uid={usuario?.id} onClose={() => setVerGrupos(false)} />
      )}
    </>
  )
}
