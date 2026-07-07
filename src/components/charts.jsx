// Gráficos reutilizables estilo Power BI (Recharts), adaptados a tema claro/oscuro.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts'
import { useTheme } from '../ThemeContext'
import { Card } from './ui'

export const NAVY = '#13233f'
export const GOLD = '#c9a24b'
// Navy, dorado + índigo suave y grises (paleta sobria estilo Mercury).
export const PALETTE = [NAVY, GOLD, '#5b6cc4', '#8b96d6', '#94a3b8', '#64748b', '#b08968']

// Colores de ejes/grid/tooltip según el tema.
export function useChartTheme() {
  const { oscuro } = useTheme()
  return {
    oscuro,
    axis: oscuro ? '#94a3b8' : '#64748b',
    grid: oscuro ? '#334155' : '#e2e8f0',
    tooltip: {
      contentStyle: {
        background: oscuro ? '#1b2b45' : '#ffffff',
        border: `1px solid ${oscuro ? '#334155' : '#e2e8f0'}`,
        borderRadius: 10,
        fontSize: 12,
        color: oscuro ? '#e2e8f0' : '#1c2536',
        boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      },
      labelStyle: { color: oscuro ? '#e2e8f0' : '#1c2536', fontWeight: 600 },
      itemStyle: { color: oscuro ? '#cbd5e1' : '#334155' },
    },
    palette: PALETTE,
    navy: NAVY,
    gold: GOLD,
  }
}

// Contenedor de widget con título + subtítulo.
export function Widget({ title, subtitle, right, children, className = '' }) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="m-0 text-[15px] font-semibold text-brand-navy dark:text-slate-100">{title}</h4>
          {subtitle && <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}

// Barras (vertical u horizontal).
export function BarCard({ title, subtitle, data, dataKey = 'valor', color, horizontal, fmt = (v) => v, height = 260 }) {
  const t = useChartTheme()
  const fill = color || t.navy
  return (
    <Widget title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: t.axis }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: t.axis }} width={96} />
            <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: t.axis }} angle={-30} textAnchor="end" height={54} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: t.axis }} width={48} tickFormatter={fmt} />
            <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
            <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </Widget>
  )
}

// Barras apiladas (ej. individuales vs dobles).
export function StackedBarCard({ title, subtitle, data, series, fmt = (v) => v, height = 260 }) {
  const t = useChartTheme()
  return (
    <Widget title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: t.axis }} angle={-30} textAnchor="end" height={54} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: t.axis }} width={44} tickFormatter={fmt} />
          <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color || PALETTE[i % PALETTE.length]} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  )
}

// Dona / pastel con leyenda.
export function DonutCard({ title, subtitle, data, fmt = (v) => v, height = 260, dataKey = 'valor' }) {
  const t = useChartTheme()
  return (
    <Widget title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
        </PieChart>
      </ResponsiveContainer>
    </Widget>
  )
}

// Líneas / área — tendencia semana a semana.
export function TrendCard({ title, subtitle, data, series, fmt = (v) => v, height = 280, area }) {
  const t = useChartTheme()
  const Chart = area ? AreaChart : LineChart
  return (
    <Widget title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: t.axis }} />
          <YAxis tick={{ fontSize: 11, fill: t.axis }} width={52} tickFormatter={fmt} />
          <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
          {series.map((s, i) =>
            area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} fill={s.color || PALETTE[i % PALETTE.length]} fillOpacity={0.15} strokeWidth={2} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={2.5} dot={{ r: 3 }} />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </Widget>
  )
}

// Medidor / gauge semicircular con valor al centro.
// `nota` (opcional) se muestra en pequeño bajo el número (ej. "28 claims de 101,024").
export function GaugeCard({ title, subtitle, value, color, height = 200, formato, nota }) {
  const t = useChartTheme()
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100))
  const fill = color || t.gold
  const data = [{ name: title, value: pct, fill }]
  // 2 decimales para no “redondear a 100%” cuando en realidad hay algún claim;
  // solo muestra 100% cuando es exactamente perfecto.
  const texto = formato ? formato(value) : pct >= 100 ? '100%' : `${pct.toFixed(2)}%`
  return (
    <Widget title={title} subtitle={subtitle}>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="72%" innerRadius="70%" outerRadius="115%" barSize={18} data={data} startAngle={180} endAngle={0}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: t.oscuro ? '#26374f' : '#eef1f6' }} dataKey="value" cornerRadius={10} angleAxisId={0} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color: fill }}>
            {texto}
          </span>
          {nota && <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{nota}</span>}
        </div>
      </div>
    </Widget>
  )
}
