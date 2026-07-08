// Panel de ganancia real: ingresoNeto − costoChoferes − costoManagers.
import { money, pct } from '../utils/format'
import { Card } from './ui'

export default function GananciaReal({ g, ciudadLabel }) {
  if (!g) return null
  return (
    <Card className="mb-4 p-5">
      <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Ganancia real</h3>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">Ingreso neto (Gofo)</span>
          <span className="font-semibold">{money(g.ingresoNeto)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">− Pago a choferes</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">−{money(g.costoChoferes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">− Pago a managers{ciudadLabel ? ` (${ciudadLabel})` : ''}</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">−{money(g.costoManagers)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-brand-navy dark:text-slate-100">GANANCIA REAL</span>
          <span className={`text-xl font-extrabold ${g.gananciaReal >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>
            {money(g.gananciaReal)} <span className="text-sm font-semibold text-slate-400">({pct(g.margen)})</span>
          </span>
        </div>
      </div>
      {g.ingresoAprox && <p className="mt-2 text-xs text-slate-400">Para una ciudad, el ingreso neto es aproximado (entregas + claims de esa ciudad) y el costo de managers es el de esa ciudad.</p>}
    </Card>
  )
}
