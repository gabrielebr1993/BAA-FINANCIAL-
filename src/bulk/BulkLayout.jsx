import { useMemo, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Truck, LogOut, Grid2x2, PanelLeftClose, PanelLeft, ChevronDown } from 'lucide-react'
import { useBulkAuth } from './BulkAuthContext'
import { navVisible, GRUPOS_ORDEN } from './nav'
import { BULK_ROLES_LABEL } from './domain/constants'
import { etiquetaRol } from './domain/permisos'
import { useAutoAsignacion } from './data/useAutoAsignacion'
import { useColeccion } from './data/useColeccion'
import { noLeidosVisibles } from './data/chat'
import { notificar, pedirPermisoNotif } from './integraciones/alertasLocales'
import CambiarClave from './components/CambiarClave'
import AvisosMensajes from './components/AvisosMensajes'
import { UserId } from './components/UserId'
import Avatar from './components/Avatar'
import AvisosGeocerca from './components/AvisosGeocerca'
import { guardarAvatar, where } from './data/repo'
import { useFotoUsuario } from './data/useCodigoUsuario'
import IndicadorConexion from './components/IndicadorConexion'
import NotificacionesCentro from './components/NotificacionesCentro'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useLang, LangToggle } from '../i18n'

export default function BulkLayout({ children }) {
  const { usuario, rol, cerrarSesion, puede, rolesConfig } = useBulkAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const items = useMemo(() => navVisible(puede), [puede])
  // Menú plegable MÚLTIPLE: se pueden tener varios grupos abiertos a la vez;
  // abrir uno NO cierra los demás. Arranca con el grupo de la ruta activa abierto.
  const ubic = useLocation()
  const subRuta = ubic.pathname.replace(/^\/bulk\/?/, '')
  const grupoActivoBulk = (items.find((i) => i.path === subRuta) || items.find((i) => i.path === ''))?.grupo
  const [grpBulk, setGrpBulk] = useState(() => new Set([grupoActivoBulk || GRUPOS_ORDEN[1]]))
  useEffect(() => { if (grupoActivoBulk) setGrpBulk((s) => s.has(grupoActivoBulk) ? s : new Set(s).add(grupoActivoBulk)) }, [grupoActivoBulk])
  const [verClave, setVerClave] = useState(false)
  // Foto de perfil propia (cada usuario puede ponerla/cambiarla/quitarla). Preview local
  // instantáneo (undefined = usar la guardada; null = quitada; dataUrl = nueva).
  const [miFoto, setMiFoto] = useState(undefined)
  const fotoGuardada = useFotoUsuario(usuario?.id)
  const fotoMostrar = miFoto !== undefined ? miFoto : (fotoGuardada ?? null)
  const cambiarMiFoto = async (dataUrl) => {
    setMiFoto(dataUrl || null)
    try { if (usuario?.id) await guardarAvatar(usuario.tenantId, usuario.id, dataUrl || null) } catch { /* regla no desplegada */ }
  }
  // Menú lateral: se puede ocultar/mostrar. Recordamos la preferencia.
  const [menuAbierto, setMenuAbierto] = useState(() => {
    try { return localStorage.getItem('bulk_menu_oculto') !== '1' } catch { return true }
  })
  const alternarMenu = () => setMenuAbierto((v) => {
    const n = !v
    try { localStorage.setItem('bulk_menu_oculto', n ? '0' : '1') } catch { /* noop */ }
    return n
  })
  // Motor de asignación automática: corre mientras cualquier staff tenga el panel
  // abierto (en cualquier pantalla), no solo en Órdenes.
  useAutoAsignacion()

  // Contador global de mensajes sin leer (para el badge del menú) + aviso in-app.
  const { datos: mensajes } = useColeccion('messages')
  // Grupos de los que SIGO siendo miembro (para no contar mensajes de grupos que dejé).
  const { datos: misGrupos } = useColeccion('groups', [where('miembros', 'array-contains', usuario?.id || '__none__')])
  const gruposActivos = useMemo(() => new Set((misGrupos || []).map((g) => 'grp_' + g.id)), [misGrupos])
  const noLeidos = useMemo(() => noLeidosVisibles(mensajes, usuario?.id, gruposActivos), [mensajes, usuario, gruposActivos])
  const prevNoLeidos = useRef(null)
  useEffect(() => { pedirPermisoNotif() }, [])
  useEffect(() => {
    // El aviso VISUAL + sonido lo da <AvisosMensajes/>; aquí solo la notificación del
    // sistema (útil cuando la pestaña está en segundo plano).
    if (prevNoLeidos.current != null && noLeidos > prevNoLeidos.current) {
      notificar(t('Nuevo mensaje'), t('Tienes un mensaje nuevo.'))
    }
    prevNoLeidos.current = noLeidos
  }, [noLeidos]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {/* Avisos en-app de entrada/salida de geocercas (staff). */}
      <AvisosGeocerca />
      {/* Aviso VISUAL rápido de mensajes nuevos (tarjeta que aparece y se va sola). */}
      <AvisosMensajes />
      {/* Fondo oscuro en móvil cuando el menú está abierto (para cerrarlo al tocar). */}
      {menuAbierto && <div onClick={alternarMenu} className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden="true" />}
      <aside className={`${menuAbierto ? 'flex' : 'hidden'} pt-safe fixed inset-y-0 left-0 z-40 h-screen w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0`}>
        <div className="mb-2 flex flex-shrink-0 items-center gap-1.5 px-1 py-1">
          {/* Marca: recuadro ancho con un CAMIÓN EN MOVIMIENTO (líneas de velocidad). */}
          <div className="flex h-11 flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-sm">
            <span className="flex flex-col items-end gap-1">
              <span className="animate-speed block h-[3px] w-3 rounded-full bg-slate-900/50" style={{ animationDelay: '0ms' }} />
              <span className="animate-speed block h-[3px] w-5 rounded-full bg-slate-900/50" style={{ animationDelay: '120ms' }} />
              <span className="animate-speed block h-[3px] w-4 rounded-full bg-slate-900/50" style={{ animationDelay: '240ms' }} />
            </span>
            <Truck size={30} strokeWidth={2} className="animate-truck drop-shadow-sm" />
          </div>
          <button onClick={alternarMenu} title={t('Ocultar menú')} className="-mr-1 grid h-8 w-7 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><PanelLeftClose size={18} /></button>
        </div>
        {/* Mi perfil (arriba, cerca de la marca): avatar grande + nombre + ID + rol. */}
        <div className="mb-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/40">
          <Avatar foto={fotoMostrar} nombre={usuario?.nombre || usuario?.email} size={52} editable onFoto={cambiarMiFoto} title={t('Cambiar mi foto de perfil')} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-brand-navy dark:text-slate-100">{usuario?.nombre || usuario?.email}</div>
            <div className="text-[11px] leading-tight text-slate-400">{BULK_ROLES_LABEL[rol] ? t(BULK_ROLES_LABEL[rol]) : etiquetaRol(rol, rolesConfig)}</div>
            {usuario?.codigo && <UserId codigo={usuario.codigo} />}
          </div>
        </div>
        <nav className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {GRUPOS_ORDEN.map((grupo) => {
            const g = items.filter((i) => i.grupo === grupo)
            if (!g.length) return null
            const Fila = (i) => (
              <NavLink key={i.path} to={`/bulk/${i.path}`} end={i.path === ''}
                className={({ isActive }) => `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-slate-100 font-semibold text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {({ isActive }) => (<>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-amber-400" />}
                  <i.icon size={17} strokeWidth={1.9} className={isActive ? 'text-amber-500' : ''} /> {t(i.label)}
                  {i.path === 'mensajes' && noLeidos > 0 && <span className="ml-auto grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{noLeidos}</span>}
                </>)}
              </NavLink>
            )
            if (grupo === 'Inicio') return <div key={grupo} className="mb-1">{g.map(Fila)}</div>
            const abierto = grpBulk.has(grupo)
            const badgeG = !abierto && g.some((i) => i.path === 'mensajes') && noLeidos > 0
            return (
              <div key={grupo} className="mb-1">
                <button onClick={() => setGrpBulk((s) => { const n = new Set(s); n.has(grupo) ? n.delete(grupo) : n.add(grupo); return n })} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-800">
                  <span className="flex-1 text-left">{t(grupo)}</span>
                  {badgeG && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                  <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
                </button>
                {abierto && <div className="space-y-0.5">{g.map(Fila)}</div>}
              </div>
            )
          })}
        </nav>
        <div className="mt-2 flex-shrink-0 border-t border-slate-200 pt-2 dark:border-slate-800">
          <div className="px-3 py-1.5"><LangToggle /></div>
          <button onClick={() => setVerClave(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><KeyRound size={16} /> {t('Cambiar contraseña')}</button>
          <button onClick={() => navigate('/elegir')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Grid2x2 size={16} /> {t('Cambiar módulo')}</button>
          <button onClick={cerrarSesion} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><LogOut size={16} /> {t('Salir')}</button>
        </div>
      </aside>
      <main className="pt-safe min-w-0 flex-1 overflow-x-hidden p-4 sm:p-5">
        <IndicadorConexion />
        <div className="mb-3 flex items-center gap-2">
          {!menuAbierto && (
            <button onClick={alternarMenu} title={t('Mostrar menú')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              <PanelLeft size={17} /> {t('Menú')}
            </button>
          )}
          <div className="ml-auto"><NotificacionesCentro /></div>
        </div>
        <div className="w-full">{children}</div>
      </main>
      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
    </div>
  )
}
