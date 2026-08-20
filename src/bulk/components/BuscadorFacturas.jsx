// BULK · Barra de búsqueda/filtrado de facturas. Presentacional: el estado del
// filtro vive en el componente padre (para no cambiar el flujo de datos actual).
// Se integra con el diseño existente (mismos Input y colores). Muestra solo los
// campos que apliquen a cada perfil:
//   - Admin: texto (número o nombre) + monto + rango de fechas.
//   - Cliente/Transportista: texto (número) + monto + rango de fechas (sin nombre).
import { Search, X } from 'lucide-react'
import { Input } from '../../components/ui'
import { hayFiltroActivo } from '../domain/filtroFacturas'
import { useLang } from '../../i18n'

export default function BuscadorFacturas({ f, setF, conNombre = false, placeholderTexto, montoLabel }) {
  const { t } = useLang()
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const limpiar = () => setF({ texto: '', monto: '', desde: '', hasta: '' })
  const activo = hayFiltroActivo(f)
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-0.5 text-[10px] uppercase text-slate-400">{conNombre ? t('Número o nombre') : t('Número')}</div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={f.texto} onChange={set('texto')} placeholder={placeholderTexto || (conNombre ? t('Número o nombre…') : t('Número de factura…'))} className="w-full py-1.5 pl-8 text-sm" />
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase text-slate-400">{t('Monto')}</div>
          <Input value={f.monto} onChange={set('monto')} inputMode="decimal" placeholder={montoLabel || t('Monto…')} className="w-full py-1.5 text-sm" />
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase text-slate-400">{t('Desde')}</div>
          <Input type="date" value={f.desde} onChange={set('desde')} className="w-full py-1.5 text-sm" />
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase text-slate-400">{t('Hasta')}</div>
          <Input type="date" value={f.hasta} onChange={set('hasta')} className="w-full py-1.5 text-sm" />
        </div>
      </div>
      {activo && (
        <button type="button" onClick={limpiar} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400">
          <X size={13} /> {t('Limpiar filtros')}
        </button>
      )}
    </div>
  )
}
