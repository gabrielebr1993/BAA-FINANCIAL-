// ============================================================================
// BULK · PortalLayout — MISMO chrome del panel del admin (menú lateral) para los
// portales (transportista, cliente, supervisor). Así todos los roles comparten el
// mismo layout con sidebar; solo cambian los ítems y su contenido. El chofer NO usa
// esto (conserva su diseño de app móvil).
//
// A diferencia de BulkLayout (que navega por rutas), aquí los ítems cambian una
// PESTAÑA interna del portal (activo/onSelect), porque los portales viven en un solo
// componente. El aspecto visual es idéntico: logo, lista con activo en ámbar, pie con
// idioma / cambiar contraseña / cambiar módulo / salir, y barra superior con campana.
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Grid2x2, PanelLeftClose, PanelLeft, KeyRound } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import CambiarClave from './CambiarClave'
import Avatar from './Avatar'
import { UserId } from './UserId'
import { guardarAvatar } from '../data/repo'
import { useFotoUsuario } from '../data/useCodigoUsuario'
import IndicadorConexion from './IndicadorConexion'
import { LangToggle, useLang } from '../../i18n'

export default function PortalLayout({ icon: Icon, titulo, subtitulo, items = [], activo, onSelect, campana, aviso, children }) {
  const { t } = useLang()
  const { cerrarSesion, usuario } = useBulkAuth()
  const navigate = useNavigate()
  const [verClave, setVerClave] = useState(false)
  // Foto de perfil propia (cualquier rol). Preview instantáneo (undefined=guardada, null=quitada).
  const [miFoto, setMiFoto] = useState(undefined)
  const fotoGuardada = useFotoUsuario(usuario?.id)
  const fotoMostrar = miFoto !== undefined ? miFoto : (fotoGuardada ?? null)
  const cambiarMiFoto = async (dataUrl) => {
    setMiFoto(dataUrl || null)
    try { if (usuario?.id) await guardarAvatar(usuario.tenantId, usuario.id, dataUrl || null) } catch { /* regla no desplegada */ }
  }
  const [menuAbierto, setMenuAbierto] = useState(() => {
    try { return localStorage.getItem('bulk_portal_menu_oculto') !== '1' } catch { return true }
  })
  const alternarMenu = () => setMenuAbierto((v) => {
    const n = !v
    try { localStorage.setItem('bulk_portal_menu_oculto', n ? '0' : '1') } catch { /* noop */ }
    return n
  })

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {menuAbierto && <div onClick={alternarMenu} className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden="true" />}
      <aside className={`${menuAbierto ? 'flex' : 'hidden'} pt-safe fixed inset-y-0 left-0 z-40 h-screen w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0`}>
        <div className="mb-2 flex flex-shrink-0 items-center gap-2 px-1 py-1">
          {/* Marca: ícono del rol EN MOVIMIENTO (mismo estilo que la barra del staff). */}
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-sm">{Icon && <Icon size={24} strokeWidth={2} className="animate-truck drop-shadow-sm" />}</div>
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold leading-none">{titulo}</div>
            <div className="truncate text-[11px] text-slate-400">{subtitulo}</div>
          </div>
          <button onClick={alternarMenu} title={t('Ocultar menú')} className="-mr-1 ml-auto grid h-8 w-7 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><PanelLeftClose size={18} /></button>
        </div>
        {/* Mi perfil (arriba, cerca de la marca): avatar grande + nombre + ID. */}
        <div className="mb-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/40">
          <Avatar foto={fotoMostrar} nombre={usuario?.nombre || titulo} size={52} editable onFoto={cambiarMiFoto} title={t('Cambiar mi foto de perfil')} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-brand-navy dark:text-slate-100">{usuario?.nombre || titulo}</div>
            {usuario?.codigo && <div className="mt-0.5"><UserId codigo={usuario.codigo} /></div>}
          </div>
        </div>
        <nav className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {items.map((i) => (
            <button
              key={i.k} onClick={() => { onSelect?.(i.k); if (window.innerWidth < 768) setMenuAbierto(false) }}
              className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${activo === i.k
                ? 'bg-amber-500/15 font-semibold text-amber-700 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-500 dark:text-amber-300'
                : 'font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              {i.icon && <i.icon size={17} strokeWidth={1.9} />} {i.label}
              {i.badge > 0 && <span className="ml-auto grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{i.badge}</span>}
            </button>
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
          {campana && <div className="ml-auto">{campana}</div>}
        </div>
        {aviso}
        <div className="w-full">{children}</div>
      </main>
      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
    </div>
  )
}
