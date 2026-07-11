// Barra de filtros GLOBAL (rango de fechas + ciudad), fija en el encabezado.
// Al vivir en el Layout, el rango se puede cambiar desde cualquier página de datos
// y el cambio se refleja en toda la app (el rango ya es estado global en DataContext).
import { useLocation } from 'react-router-dom'
import RangeSelector from './RangeSelector'
import CitySelector from './CitySelector'

export default function GlobalFilterBar() {
  useLocation() // re-render al navegar (el filtro es global y fijo en TODAS las páginas)
  return (
    <div className="scroll-thin overflow-x-auto border-t border-slate-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/90">
      <div className="flex flex-wrap items-center gap-2">
        <RangeSelector />
        <CitySelector />
      </div>
    </div>
  )
}
