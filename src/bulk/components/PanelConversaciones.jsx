// ============================================================================
// BULK · Panel de conversaciones (maestro-detalle) reutilizable para TODOS los
// perfiles. Recibe `secciones` ya categorizadas (Clientes/Transportistas/Choferes/
// Administrador…) y pinta:
//   - Pestañas por sección (si hay más de una), con contador de no leídos.
//   - Lista rica: nombre, rol, viaje/material, vista previa del último mensaje,
//     fecha/hora e indicador de no leídos.
//   - Chat de la conversación seleccionada (reutiliza ChatOrden).
// Responsive: en móvil muestra la lista y, al elegir, el chat con botón "volver".
// No cambia la mensajería; solo ORGANIZA y PRESENTA lo que ya existe.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowLeft, MessageSquare, Building2, Truck, User, Shield, Trash2, Users, Plus, MoreVertical, LogOut } from 'lucide-react'
import ChatOrden from './ChatOrden'
import { useVisualViewport } from './useVisualViewport'
import { tsMillis } from '../data/chatKeys'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { Card, Badge, Input, EstadoVacio } from '../../components/ui'
import { useLang } from '../../i18n'

const ICONO = { cliente: Building2, transportista: Truck, chofer: User, admin: Shield, dispatcher: Shield, supervisor: Shield, orden: MessageSquare, operacion: MessageSquare, grupo: Users }

// Avatar de una conversación: FOTO real si existe; si no, ícono según su tipo. No
// inventa imágenes — solo muestra la foto cuando el dato existe en la base.
function Avatar({ foto, icon, nombre, size = 40, resalte = false }) {
  const Icono = ICONO[icon] || MessageSquare
  const px = { width: size, height: size }
  if (foto) return <img src={foto} alt={nombre || ''} style={px} className="chat-img flex-shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-700" />
  return (
    <div style={px} className={`grid flex-shrink-0 place-items-center rounded-xl ${resalte ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
      <Icono size={Math.round(size * 0.42)} />
    </div>
  )
}

// Hora/fecha corta para la fila (hoy → hora; otro día → dd/mm).
function horaCorta(ts) {
  const ms = tsMillis(ts)
  if (!ms) return ''
  const d = new Date(ms)
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })
}

export default function PanelConversaciones({ secciones = [], titulo, accion = null, abrir = null, onEliminarConversacion = null, menuConversacion = null, alturaClass = 'h-mensajes' }) {
  const { t } = useLang()
  const [tab, setTab] = useState(secciones[0]?.k || '')
  const [sel, setSel] = useState('')
  const [buscar, setBuscar] = useState('')
  const [verChatMovil, setVerChatMovil] = useState(false)
  const [menuKey, setMenuKey] = useState(null) // conversación cuyo menú ⋮ está abierto

  // Acciones del menú ⋮ de una conversación: usa `menuConversacion` si se pasó; si no,
  // cae al viejo `onEliminarConversacion` (compatibilidad). Devuelve [] si no hay acciones.
  const menuDe = (item) => {
    if (menuConversacion) return menuConversacion(item) || []
    if (onEliminarConversacion) return [{ label: t('Eliminar conversación'), icon: 'eliminar', danger: true, onClick: () => onEliminarConversacion(item) }]
    return []
  }
  const ICONO_MENU = { eliminar: Trash2, salir: LogOut }

  // Abrir por control externo (p. ej. al iniciar una conversación nueva): salta a su
  // sección, la selecciona y muestra el chat (también en móvil).
  useEffect(() => {
    if (!abrir) return
    const s = secciones.find((x) => (x.items || []).some((c) => c.key === abrir))
    if (s) { setTab(s.k); setSel(abrir); setVerChatMovil(true); setBuscar('') }
  }, [abrir]) // eslint-disable-line react-hooks/exhaustive-deps

  const seccion = secciones.find((s) => s.k === tab) || secciones[0] || { items: [] }
  const items = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (seccion.items || [])
      .filter((c) => !q || [c.titulo, c.viaje, c.material, c.carrierNombre, c.lastText].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => (b.noLeidos || 0) - (a.noLeidos || 0) || tsMillis(b.lastTs) - tsMillis(a.lastTs))
  }, [seccion, buscar])

  const activa = items.find((c) => c.key === sel) || items[0] || null

  const elegir = (k) => { setSel(k); setVerChatMovil(true) }

  // Con el teclado abierto (móvil), la capa del chat se ciñe al viewport VISIBLE
  // (visualViewport): el campo de mensaje queda a la vista y el layout no salta.
  const vv = useVisualViewport(verChatMovil)

  return (
    <div className={`flex flex-col ${alturaClass}`}>
      {(titulo || accion) && (
        <div className="mb-2 flex items-center gap-2">
          {titulo && <h2 className="m-0 text-lg font-black text-brand-navy dark:text-slate-100">{titulo}</h2>}
          {accion && <div className="ml-auto">{accion}</div>}
        </div>
      )}

      {/* Pestañas por sección (solo si hay más de una). En MÓVIL: una sola fila de
          píldoras deslizable a los lados (antes se partían en filas cuadradas y el
          panel cambiaba de alto). En escritorio: equilibradas a lo ancho. */}
      {secciones.length > 1 && (
        <div className="scroll-thin mb-3 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
          {secciones.map((s) => {
            const noLeidos = (s.items || []).reduce((a, c) => a + (c.noLeidos || 0), 0)
            const Icono = ICONO[s.icon] || MessageSquare
            const on = s.k === tab
            return (
              <button key={s.k} type="button" onClick={() => { setTab(s.k); setSel(''); setVerChatMovil(false) }}
                className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition sm:flex-1 sm:flex-shrink sm:basis-0 sm:rounded-xl sm:px-3 sm:py-2.5 ${on ? 'bg-brand-navy text-white shadow-sm dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                <Icono size={16} /> <span className="truncate">{s.label}</span>
                {noLeidos > 0 && <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? 'bg-white/25 text-white dark:bg-slate-900/25 dark:text-slate-900' : 'bg-rose-500 text-white'}`}>{noLeidos}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        {/* Lista de conversaciones */}
        <Card className={`min-h-0 flex-col p-3 lg:col-span-1 lg:flex ${verChatMovil ? 'hidden lg:flex' : 'flex'}`}>
          {/* Botón propio de cada pestaña: crear conversación (o grupo) filtrado por su rol. */}
          {seccion.onNueva && (
            <button type="button" onClick={seccion.onNueva} className="mb-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-600">
              <Plus size={16} /> {seccion.nuevaLabel || t('Nueva conversación')}
            </button>
          )}
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar…')} className="w-full pl-8" />
          </div>
          <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-2 py-8 text-center text-xs text-slate-400">{seccion.vacio || t('Sin conversaciones.')}</div>
            ) : items.map((c) => {
              const menu = menuDe(c)
              const esActiva = activa?.key === c.key
              const noLeido = c.noLeidos > 0 && !esActiva // el chat abierto ya se marca leído
              return (
                <div key={c.key} role="button" tabIndex={0} onClick={() => elegir(c.key)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && elegir(c.key)} className={`group relative flex w-full cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${esActiva ? 'border-amber-500 bg-amber-500/10' : noLeido ? 'border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  {/* Barra de acento a la izquierda cuando hay mensajes nuevos. */}
                  {noLeido && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-rose-500" aria-hidden="true" />}
                  <Avatar foto={c.foto} icon={c.icon} nombre={c.titulo} size={40} resalte={c.noLeidos > 0} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {noLeido && <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-rose-500" title={t('Mensajes nuevos')} />}
                      <span className={`truncate text-sm text-brand-navy dark:text-slate-100 ${noLeido ? 'font-black' : 'font-bold'}`}>{c.titulo}</span>
                      {c.rolLabel && <Badge color={c.rolColor || 'slate'}>{c.rolLabel}</Badge>}
                      <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">{horaCorta(c.lastTs)}</span>
                      {/* Menú ⋮ para actuar sin abrir el chat (eliminar / salir). */}
                      {menu.length > 0 && (
                        <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => setMenuKey(menuKey === c.key ? null : c.key)} title={t('Opciones')} className="rounded-md p-0.5 text-slate-400 opacity-100 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 sm:opacity-0 sm:group-hover:opacity-100" style={menuKey === c.key ? { opacity: 1 } : undefined}><MoreVertical size={16} /></button>
                          {menuKey === c.key && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuKey(null)} />
                              <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                {menu.map((m, i) => {
                                  const IcoM = ICONO_MENU[m.icon] || Trash2
                                  return (
                                    <button key={i} type="button" onClick={() => { setMenuKey(null); m.onClick() }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${m.danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                      <IcoM size={15} /> {m.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {(c.viaje || c.material || c.carga || c.operacion || c.carrierNombre) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {c.viaje && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-brand-navy dark:bg-slate-800 dark:text-slate-200">{c.viaje}</span>}
                        {c.material && <span className="truncate">{c.material}</span>}
                        {c.carga && <span className="truncate text-slate-400">· {c.carga}</span>}
                        {c.operacion && <span className="truncate text-slate-400">· {c.operacion}</span>}
                        {c.carrierNombre && <span className="inline-flex items-center gap-0.5 truncate text-slate-400"><Truck size={10} /> {c.carrierNombre}</span>}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`truncate text-xs ${c.noLeidos > 0 ? 'font-semibold text-slate-600 dark:text-slate-200' : 'text-slate-400'}`}>{c.lastText || t('Sin mensajes aún')}</span>
                      {c.noLeidos > 0 && <span className="ml-auto grid h-5 min-w-[20px] flex-shrink-0 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{c.noLeidos}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Conversación activa. En MÓVIL el chat abierto se muestra a PANTALLA COMPLETA
            (capa fija propia, como WhatsApp): así no comparte scroll con la página del
            portal ni salta cuando se abre el teclado. En escritorio sigue en la grilla. */}
        <div
          className={`min-h-0 lg:static lg:z-auto lg:col-span-2 lg:block lg:bg-transparent lg:p-0 ${verChatMovil ? 'pt-safe pb-safe fixed inset-0 z-[60] flex flex-col bg-[#f2f3f7] p-2 dark:bg-slate-950' : 'hidden'}`}
          style={verChatMovil && vv ? { top: vv.top, height: vv.height, bottom: 'auto', paddingBottom: 8, paddingTop: 8 } : undefined}
        >
          {activa ? (
            <Card className="flex h-full min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                <button type="button" onClick={() => setVerChatMovil(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"><ArrowLeft size={18} /></button>
                <Avatar foto={activa.foto} icon={activa.icon} nombre={activa.titulo} size={42} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-brand-navy dark:text-slate-100">{activa.titulo}</span>
                    {activa.rolLabel && <Badge color={activa.rolColor || 'slate'}>{activa.rolLabel}</Badge>}
                  </div>
                  {(activa.viaje || activa.material || activa.carga || activa.carrierNombre || activa.operacion) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {activa.viaje && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-brand-navy dark:bg-slate-800 dark:text-slate-200">{activa.viaje}</span>}
                      {activa.operacion && <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} /> {activa.operacion}</span>}
                      {activa.material && <span>{activa.material}</span>}
                      {activa.carga && <span className="text-slate-400">· {activa.carga}</span>}
                      {activa.carrierNombre && <span className="inline-flex items-center gap-0.5"><Truck size={11} /> {activa.carrierNombre}</span>}
                    </div>
                  )}
                </div>
                {/* Menú ⋮ del chat abierto: acciones diferenciadas (salir / eliminar). */}
                {menuDe(activa).length > 0 && (
                  <div className="relative ml-auto flex-shrink-0">
                    <button type="button" onClick={() => setMenuKey(menuKey === 'activa' ? null : 'activa')} title={t('Opciones')} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><MoreVertical size={18} /></button>
                    {menuKey === 'activa' && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuKey(null)} />
                        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          {menuDe(activa).map((m, i) => {
                            const IcoM = ICONO_MENU[m.icon] || Trash2
                            return (
                              <button key={i} type="button" onClick={() => { setMenuKey(null); m.onClick() }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${m.danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                <IcoM size={15} /> {m.label}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <ChatOrden key={activa.chatId} orden={{ id: activa.chatId, numero: activa.titulo }} participantes={activa.participantes ?? null} contacto={activa.contacto ?? null} grupoUids={activa.grupoUids ?? null} fill />
              </div>
            </Card>
          ) : (
            <EstadoVacio titulo={t('Selecciona una conversación')} texto={t('Elige un chat de la lista para ver los mensajes.')} mostrarBoton={false} />
          )}
        </div>
      </div>
    </div>
  )
}
