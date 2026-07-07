// Ranking de choferes por TIPO de claim (Orden 6).
// Dos vistas: matriz general chofer×tipo (TOTAL desc, en rojo si >2) y
// ranking por cada tipo. Los tipos se detectan dinámicamente y los conocidos
// se traducen al español. Clic en un chofer -> detalle en Performance.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { rankingClaimsPorTipo } from '../utils/calc'
import { num } from '../utils/format'
import { Card, EstadoVacio } from '../components/ui'
import { useChartTheme, PALETTE } from '../components/charts'

// Celda de conteo: en rojo/negrita cuando supera el umbral (2).
function Celda({ n, umbral = 2, onClick }) {
  if (!n) return <span className="text-slate-300 dark:text-slate-600">—</span>
  const alto = n > umbral
  return (
    <button onClick={onClick} className={`hover:underline ${alto ? 'font-bold text-rose-600 dark:text-rose-400' : ''}`}>
      {num(n)}
    </button>
  )
}

function RankTipo({ label, rows, onPick }) {
  const t = useChartTheme()
  const data = rows.slice(0, 8).map((r) => ({ name: r.courier, valor: r.n }))
  return (
    <Card className="p-4">
      <h4 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{label}</h4>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">Sin claims de este tipo.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 26)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: t.axis }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: t.axis }} width={96} />
            <Tooltip formatter={(v) => num(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={(d) => onPick?.(d?.name)}>
              {data.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

export default function RankingClaimsTipo({ claims, compacto = false }) {
  const navigate = useNavigate()
  const { tipos, matriz, porTipo } = useMemo(() => rankingClaimsPorTipo(claims), [claims])
  const irAChofer = (nombre) => { if (nombre) navigate(`/choferes/${encodeURIComponent(nombre)}`) }

  if (matriz.length === 0) {
    return <EstadoVacio titulo="Sin claims" texto="No hay claims en el rango/ciudad seleccionados para rankear por tipo." />
  }

  const filas = compacto ? matriz.slice(0, 6) : matriz

  return (
    <div className="space-y-4">
      {/* Vista 1: matriz general chofer × tipo */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-500" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes por tipo de claim</h3>
          <span className="ml-auto text-xs text-slate-400">En rojo: más de 2 de un mismo tipo</span>
        </div>
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2.5 text-left font-semibold">Chofer</th>
                {tipos.map((t) => (
                  <th key={t.key} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t.label}</th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.courier} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-2">
                    <button onClick={() => irAChofer(m.courier)} className="font-medium text-brand-navy hover:underline dark:text-slate-100">{m.courier}</button>
                  </td>
                  {tipos.map((t) => (
                    <td key={t.key} className="px-3 py-2 text-right"><Celda n={m.porTipo[t.key]} onClick={() => irAChofer(m.courier)} /></td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <span className={m.total > 2 ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-semibold'}>{num(m.total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {compacto && matriz.length > filas.length && (
          <p className="mt-2 text-xs text-slate-400">Mostrando los {filas.length} con más claims. Ve a Performance para el ranking completo.</p>
        )}
      </Card>

      {/* Vista 2: ranking por cada tipo */}
      {!compacto && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ranking por tipo de claim</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tipos.map((t) => (
              <RankTipo key={t.key} label={t.label} rows={porTipo[t.key]} onPick={irAChofer} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
