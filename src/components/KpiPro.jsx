// Tarjeta KPI enriquecida (solo usada por la sección "Indicadores" de Performance).
// Ícono con fondo tenue, valor grande, subtítulo, tendencia ▲▼ y mini-sparkline.
// No reemplaza al componente KPI existente; es un añadido independiente.
import { ResponsiveContainer, LineChart, Line } from 'recharts'
import { Card } from './ui'

const ACC = {
  navy: 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100',
  gold: 'bg-brand-gold/15 text-brand-gold',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  steel: 'bg-brand-steel/10 text-brand-steel dark:bg-brand-steel-soft/15 dark:text-brand-steel-soft',
}
const LINE = { navy: '#13233f', gold: '#c9a24b', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', steel: '#3d5a80' }

export default function KpiPro({ icon: Icon, label, value, sub, accent = 'navy', valueColor, trend, spark, onClick }) {
  const clickable = typeof onClick === 'function'
  const tendencia =
    trend == null || !isFinite(trend) ? null : (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend * 100).toFixed(1)}%
      </span>
    )
  const sparkData = (spark || []).map((v, i) => ({ i, v: Number(v) || 0 }))
  return (
    <Card
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`flex min-w-[190px] flex-1 flex-col p-4 ${clickable ? 'cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-cardhover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
        {Icon && <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl ${ACC[accent] || ACC.navy}`}><Icon size={17} strokeWidth={1.8} /></span>}
      </div>
      <div className={`mt-2 text-2xl font-bold leading-tight tracking-tight ${valueColor || 'text-brand-navy dark:text-slate-100'}`}>{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {tendencia}
        {sub != null && <span className="truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span>}
      </div>
      {sparkData.length > 1 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line type="monotone" dataKey="v" stroke={LINE[accent] || LINE.navy} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
