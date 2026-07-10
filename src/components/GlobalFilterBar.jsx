// Barra de filtros GLOBAL (rango de fechas + ciudad), fija en el encabezado.
// Al vivir en el Layout, el rango se puede cambiar desde cualquier página de datos
// y el cambio se refleja en toda la app (el rango ya es estado global en DataContext).
import { useLocation } from 'react-router-dom'
import RangeSelector from './RangeSelector'
import CitySelector from './CitySelector'

// Rutas donde filtrar por rango/ciudad tiene sentido (vistas de datos).
// Se ocultan las de configuración/gestión (cargar factura, choferes lista,
// configuración, empresas, usuarios, backups, comparar…).
function conFiltro(pathname) {
  if (pathname === '/') return true
  if (/^\/choferes\/.+/.test(pathname)) return true // perfil de un chofer (no la lista)
  if (pathname.startsWith('/rutas')) return true // /rutas y /rutas/:ruta
  return ['/financiero', '/reclamos', '/claims', '/pagos', '/performance', '/alertas'].some((p) => pathname.startsWith(p))
}

export default function GlobalFilterBar() {
  const { pathname } = useLocation()
  if (!conFiltro(pathname)) return null
  return (
    <div className="scroll-thin overflow-x-auto border-t border-slate-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/90">
      <div className="flex flex-wrap items-center gap-2">
        <RangeSelector />
        <CitySelector />
      </div>
    </div>
  )
}
