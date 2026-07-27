import { NavLink, useNavigate } from 'react-router-dom'
import { Truck, LogOut, Grid2x2 } from 'lucide-react'
import { useBulkAuth } from './BulkAuthContext'
import { NAV, puedeVer } from './nav'
import { BULK_ROLES_LABEL } from './domain/constants'

export default function BulkLayout({ children }) {
  const { usuario, rol, cerrarSesion } = useBulkAuth()
  const navigate = useNavigate()
  const items = NAV.filter((i) => puedeVer(rol, i.roles))

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={19} strokeWidth={2} /></div>
          <div>
            <div className="text-base font-extrabold leading-none">Freight</div>
            <div className="text-[11px] text-slate-400">Transporte de materiales</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5">
          {items.map((i) => (
            <NavLink key={i.path} to={`/bulk/${i.path}`} end={i.path === ''}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              <i.icon size={17} strokeWidth={1.9} /> {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          <div className="px-3 py-1 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">{usuario?.nombre || usuario?.email}</div>
            <div className="text-slate-400">{BULK_ROLES_LABEL[rol] || rol}</div>
          </div>
          <button onClick={() => navigate('/elegir')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Grid2x2 size={16} /> Cambiar módulo</button>
          <button onClick={cerrarSesion} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><LogOut size={16} /> Salir</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">{children}</main>
    </div>
  )
}
