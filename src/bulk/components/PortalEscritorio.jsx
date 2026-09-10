// ============================================================================
// BULK · BARRA LATERAL DE ESCRITORIO para los portales de CLIENTE y
// TRANSPORTISTA: en pantalla grande (≥768px) el portal se ve IGUAL que el
// panel del admin (BulkLayout) — marca dorada, tarjeta de perfil, menú con
// acento ámbar y acciones abajo — en vez de la carcasa "tipo app".
// En el teléfono no se pinta nada (hidden md:flex): la app móvil sigue igual.
// Solo chofer y supervisor conservan la experiencia tipo app en todos lados.
// ============================================================================
import { Truck, LogOut, Grid2x2 } from 'lucide-react'
import Avatar from './Avatar'
import { useLang, LangToggle } from '../../i18n'

export default function PortalEscritorio({ tabs = [], activo, onSelect, usuario, rolLabel = '', foto = null, cerrarSesion, irModulos, onPerfil }) {
  const { t } = useLang()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white p-3 md:flex">
      {/* Marca: mismo recuadro dorado con camión del panel del staff. */}
      <div className="mb-2 flex flex-shrink-0 items-center gap-1.5 px-1 py-1">
        <div className="flex h-11 flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-sm">
          <span className="flex flex-col items-end gap-1">
            <span className="animate-speed block h-[3px] w-3 rounded-full bg-slate-900/50" style={{ animationDelay: '0ms' }} />
            <span className="animate-speed block h-[3px] w-5 rounded-full bg-slate-900/50" style={{ animationDelay: '120ms' }} />
            <span className="animate-speed block h-[3px] w-4 rounded-full bg-slate-900/50" style={{ animationDelay: '240ms' }} />
          </span>
          <Truck size={30} strokeWidth={2} className="animate-truck drop-shadow-sm" />
        </div>
      </div>
      {/* Perfil (clic → pestaña de perfil del portal). */}
      <button type="button" onClick={() => onPerfil?.()}
        className="mb-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left shadow-sm transition hover:bg-slate-100">
        <Avatar foto={foto} nombre={usuario?.nombre || usuario?.email} size={44} redondo />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-tight text-brand-navy">{usuario?.nombre || usuario?.email}</span>
          <span className="block text-[11px] leading-tight text-slate-400">{rolLabel}</span>
        </span>
      </button>
      {/* Menú: las mismas pestañas del portal, estilo del panel del staff. */}
      <nav className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {tabs.map((tb) => {
          const on = tb.k === activo
          const Icon = tb.icon
          return (
            <button key={tb.k} type="button" onClick={() => onSelect?.(tb.k)}
              className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${on ? 'bg-amber-500/15 font-semibold text-amber-700 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-500' : 'font-medium text-slate-600 hover:bg-slate-100'}`}>
              {Icon && <Icon size={17} strokeWidth={1.9} />} {tb.label}
              {tb.badge > 0 && <span className="ml-auto grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{tb.badge > 99 ? '99+' : tb.badge}</span>}
            </button>
          )
        })}
      </nav>
      <div className="mt-2 flex-shrink-0 border-t border-slate-200 pt-2">
        <div className="px-3 py-1.5"><LangToggle /></div>
        <button type="button" onClick={() => irModulos?.()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"><Grid2x2 size={16} /> {t('Cambiar módulo')}</button>
        <button type="button" onClick={() => cerrarSesion?.()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-50"><LogOut size={16} /> {t('Salir')}</button>
      </div>
    </aside>
  )
}
