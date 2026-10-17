// ============================================================================
// WAREHOUSE / STAFFING · Gráficas reutilizables del Dashboard y Finanzas.
// Mismo lenguaje visual del resto de MilePay (paleta navy/gold/emerald):
// · Gauge (medidor circular de %)       · Waterfall (ingreso → ganancia)
// · HeatmapDias (horas por día, calor)  · AreaAcumulada (ganancia acumulada)
// ============================================================================
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts'
import { Card } from '../../components/ui'

const dinero = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── GAUGE: medidor de porcentaje (0–100) ───────────────────────────────────
export function Gauge({ label, pct, sub, color }) {
  const sinDato = pct === null || pct === undefined || !isFinite(pct)
  const v = sinDato ? 0 : Math.max(0, Math.min(100, Math.round(pct)))
  const c = color || (v >= 0 ? '#149d80' : '#e0526a')
  return (
    <Card className="p-4">
      <div className="text-center text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className="relative" style={{ height: 110 }}>
        <ResponsiveContainer>
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: v }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} fill={c} background={{ fill: 'rgba(148,163,184,.18)' }} isAnimationActive />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-5">
          <span className="text-2xl font-black" style={{ color: c }}>{sinDato ? '—' : `${v}%`}</span>
        </div>
      </div>
      {sub && <div className="text-center text-[11px] text-slate-400">{sub}</div>}
    </Card>
  )
}

// ── WATERFALL: cómo el ingreso se convierte en ganancia ────────────────────
export function WaterfallUtilidad({ titulo, ingreso, pagos, gastos }) {
  const utilidad = Math.round((ingreso - pagos - gastos) * 100) / 100
  const pasos = [
    { nombre: 'Ingreso', base: 0, valor: Math.max(0, ingreso), real: ingreso, color: '#3d5a80' },
    { nombre: '− Pagos', base: Math.max(0, ingreso - pagos), valor: Math.min(pagos, Math.max(0, ingreso)), real: -pagos, color: '#c9a24b' },
    { nombre: '− Gastos', base: Math.max(0, ingreso - pagos - gastos), valor: Math.min(gastos, Math.max(0, ingreso - pagos)), real: -gastos, color: '#9aa3b2' },
    { nombre: 'Ganancia', base: utilidad >= 0 ? 0 : utilidad, valor: Math.abs(utilidad), real: utilidad, color: utilidad >= 0 ? '#149d80' : '#e0526a' },
  ]
  const TooltipPaso = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const p = payload[0].payload
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow dark:border-slate-600 dark:bg-slate-800">
        <b>{p.nombre}</b>: <span style={{ color: p.color }}>{p.real < 0 ? '−' : ''}{dinero(Math.abs(p.real))}</span>
      </div>
    )
  }
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{titulo || '¿Cómo el ingreso se vuelve ganancia?'}</div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={pasos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" vertical={false} />
            <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipPaso />} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="valor" stackId="w" radius={[6, 6, 0, 0]}>
              {pasos.map((p, i) => <Cell key={i} fill={p.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ── HEATMAP: intensidad de horas por día de la semana ──────────────────────
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export function HeatmapDias({ titulo, filas, nota }) {
  // filas: [{ etiqueta, dias: [h0..h6] }] (0 = domingo)
  const max = Math.max(1, ...filas.flatMap((f) => f.dias))
  const celda = (h) => {
    if (!h) return { fondo: 'rgba(148,163,184,.10)', texto: 'inherit', opaco: true }
    const t = h / max
    return { fondo: `rgba(61,90,128,${0.15 + t * 0.8})`, texto: t > 0.55 ? '#fff' : 'inherit' }
  }
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400">
              <th className="py-1 pr-2 text-left">&nbsp;</th>
              {DIAS_CORTOS.map((d) => <th key={d} className="px-1 py-1 text-center">{d}</th>)}
              <th className="px-1 py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta}>
                <td className="max-w-[140px] truncate py-0.5 pr-2 font-semibold text-brand-navy dark:text-slate-200">{f.etiqueta}</td>
                {f.dias.map((h, i) => {
                  const c = celda(h)
                  return (
                    <td key={i} className="p-0.5">
                      <div className="rounded-md px-1 py-1.5 text-center font-semibold" style={{ background: c.fondo, color: c.texto }}>
                        {h ? Math.round(h) : ''}
                      </div>
                    </td>
                  )
                })}
                <td className="py-0.5 pl-1 text-right font-bold">{Math.round(f.dias.reduce((s, h) => s + h, 0)).toLocaleString()} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota && <div className="mt-1 text-[11px] text-slate-400">{nota}</div>}
    </Card>
  )
}

// ── ÁREA: ganancia real acumulada a lo largo de las semanas ────────────────
export function AreaAcumulada({ titulo, puntos, nota }) {
  // puntos: [{ nombre, valor }] en orden cronológico; se acumulan aquí
  let suma = 0
  const data = puntos.map((p) => { suma += p.valor || 0; return { nombre: p.nombre, Acumulado: Math.round(suma * 100) / 100 } })
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{titulo || 'Ganancia real acumulada'}</div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#149d80" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#149d80" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" vertical={false} />
            <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => dinero(v)} />
            <Area type="monotone" dataKey="Acumulado" stroke="#149d80" strokeWidth={2.5} fill="url(#gradAcum)" dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {nota && <div className="mt-1 text-[11px] text-slate-400">{nota}</div>}
    </Card>
  )
}
