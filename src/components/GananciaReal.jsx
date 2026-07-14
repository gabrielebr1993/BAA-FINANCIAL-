// Panel de ganancia real: ingresoNeto − costoChoferes − costoManagers.
import { money, pct } from '../utils/format'
import { Card } from './ui'

export default function GananciaReal({ g, ciudadLabel, claims }) {
  if (!g) return null
  const neto = claims ? Number(claims.gananciaNetaClaims) || 0 : null
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
        {(g.totalPrestamo > 0 || g.totalBono > 0) && (
          <div className="flex items-center justify-between pl-3 text-xs">
            <span className="text-slate-400">↳ incluye ajustes: {g.totalPrestamo > 0 ? `−${money(g.totalPrestamo)} préstamos` : ''}{g.totalPrestamo > 0 && g.totalBono > 0 ? ' · ' : ''}{g.totalBono > 0 ? `+${money(g.totalBono)} bonos` : ''}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">− Gastos fijos{ciudadLabel ? ` (${ciudadLabel})` : ''}</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">−{money(g.costoManagers)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-brand-navy dark:text-slate-100">GANANCIA REAL</span>
          <span className={`text-xl font-extrabold ${g.gananciaReal >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>
            {money(g.gananciaReal)} <span className="text-sm font-semibold text-slate-400">({pct(g.margen)})</span>
          </span>
        </div>
      </div>

      {/* El efecto de los claims YA está dentro (en el ingreso neto y el pago a
          choferes). Se muestra aquí solo para transparencia; no se vuelve a sumar. */}
      {neto != null && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60">
          <span className="text-slate-500 dark:text-slate-400">Incluye neto de claims (ya contado)</span>
          <span className={`font-semibold ${neto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {neto >= 0 ? '+' : '−'}{money(Math.abs(neto))}
            <span className="ml-1 font-normal text-slate-400">(cobrado {money(claims.cobradoChoferes)} − Gofo {money(claims.descontadoGofo)})</span>
          </span>
        </div>
      )}

      {g.ingresoAprox && <p className="mt-2 text-xs text-slate-400">Para una ciudad, el ingreso neto es aproximado (entregas + claims de esa ciudad) y los gastos fijos son los de esa ciudad.</p>}
    </Card>
  )
}
