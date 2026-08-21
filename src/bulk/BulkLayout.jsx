import { useMemo, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Truck, LogOut, Grid2x2, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useBulkAuth } from './BulkAuthContext'
import { navVisible } from './nav'
import { BULK_ROLES_LABEL } from './domain/constants'
import { etiquetaRol } from './domain/permisos'
import { useAutoAsignacion } from './data/useAutoAsignacion'
import { useColeccion } from './data/useColeccion'
import { noLeidosPorConv } from './data/chat'
import { beep, notificar, pedirPermisoNotif } from './integraciones/alertasLocales'
import CambiarClave from './components/CambiarClave'
import { UserId } from './components/UserId'
import Avatar from './components/Avatar'
import { guardarAvatar } from './data/repo'
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
  const noLeidos = useMemo(() => Object.values(noLeidosPorConv(mensajes, usuario?.id)).reduce((a, n) => a + n, 0), [mensajes, usuario])
  const prevNoLeidos = useRef(null)
  useEffect(() => { pedirPermisoNotif() }, [])
  useEffect(() => {
    if (prevNoLeidos.current != null && noLeidos > prevNoLeidos.current) {
      beep(); notificar(t('Nuevo mensaje'), t('Tienes un mensaje nuevo.'))
    }
    prevNoLeidos.current = noLeidos
  }, [noLeidos]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {/* Fondo oscuro en móvil cuando el menú está abierto (para cerrarlo al tocar). */}
      {menuAbierto && <div onClick={alternarMenu} className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden="true" />}
      <aside className={`${menuAbierto ? 'flex' : 'hidden'} pt-safe fixed inset-y-0 left-0 z-40 h-screen w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0`}>
        <div className="mb-4 flex flex-shrink-0 items-center gap-2 px-2 py-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={19} strokeWidth={2} /></div>
          <div>
            <div className="text-base font-extrabold leading-none">Freight</div>
            <div className="text-[11px] text-slate-400">{t('Transporte de materiales')}</div>
          </div>
          <button onClick={alternarMenu} title={t('Ocultar menú')} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><PanelLeftClose size={18} /></button>
        </div>
        {/* Mi perfil (arriba, separado de la marca): avatar + ID + nombre + rol. */}
        <div className="mb-3 mt-1 flex flex-shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/40">
          <Avatar foto={fotoMostrar} nombre={usuario?.nombre || usuario?.email} size={40} editable onFoto={cambiarMiFoto} title={t('Cambiar mi foto de perfil')} />
          <div className="min-w-0">
            {usuario?.codigo && <UserId codigo={usuario.codigo} />}
            <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{usuario?.nombre || usuario?.email}</div>
            <div className="text-[11px] text-slate-400">{BULK_ROLES_LABEL[rol] ? t(BULK_ROLES_LABEL[rol]) : etiquetaRol(rol, rolesConfig)}</div>
          </div>
        </div>
        <nav className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {items.map((i) => (
            <NavLink key={i.path} to={`/bulk/${i.path}`} end={i.path === ''}
              className={({ isActive }) => `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-amber-500/15 font-semibold text-amber-700 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-500 dark:text-amber-300' : 'font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              <i.icon size={17} strokeWidth={1.9} /> {t(i.label)}
              {i.path === 'mensajes' && noLeidos > 0 && <span className="ml-auto grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{noLeidos}</span>}
            </NavLink>
          ))}
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
