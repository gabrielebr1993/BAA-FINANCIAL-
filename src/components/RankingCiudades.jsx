// Ranking de ciudades con calificación general (0-100) y semáforo.
// Combina ganancia, rentabilidad $/lb, calidad (claims), % fallidos (proxy) y
// volumen. Cada ciudad es clicable y filtra el resto del sistema por ella.
import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { useData } from '../DataContext'
import { rankingCiudades } from '../utils/calc'
import { money, num, pct } from '../utils/format'
import { Card, EstadoVacio } from './ui'
import { BarCard } from './charts'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }

function SemaforoCiudad({ c }) {
  const color = COLOR_NIVEL[c.nivel]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="font-semibold" style={{ color }}>{c.puntaje}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{c.etiqueta}</span>
    </span>
  )
}

export default function RankingCiudades({ compacto = false }) {
  const { facturaRango: inv, numSemanas, claims, drivers, managers, setSelectedCity } = useData()
  const ranking = useMemo(
    () => rankingCiudades(inv, claims, drivers, managers, numSemanas),
    [inv, claims, drivers, managers, numSemanas]
  )

  if (!ranking.length) {
    return <EstadoVacio titulo="Sin ciudades" texto="Carga una factura para ver el ranking de ciudades." />
  }

  const gananciaData = ranking.map((c) => ({ name: c.nombre, valor: Math.round(c.ganancia) }))
  const claimsData = ranking.map((c) => ({ name: c.nombre, valor: c.numClaims }))
  const lbData = ranking.map((c) => ({ name: c.nombre, valor: Number((c.precioLb || 0).toFixed(3)) }))

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Building2 size={18} strokeWidth={1.8} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ranking de ciudades</h3>
          <span className="ml-auto text-xs text-slate-400">Clic en una ciudad para filtrar todo por ella</span>
        </div>
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2.5 text-left font-semibold">Ciudad</th>
                <th className="px-3 py-2.5 text-right font-semibold">Paquetes</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ingreso neto</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ganancia</th>
                <th className="px-3 py-2.5 text-right font-semibold">$/lb</th>
                <th className="px-3 py-2.5 text-right font-semibold">Claims</th>
                <th className="px-3 py-2.5 text-right font-semibold">% claims</th>
                <th className="px-3 py-2.5 text-left font-semibold">Calificación</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((c) => (
                <tr key={c.code} onClick={() => setSelectedCity(c.code)} className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-2 font-medium text-brand-navy dark:text-slate-100">{c.nombre}</td>
                  <td className="px-3 py-2 text-right">{num(c.paquetes)}</td>
                  <td className="px-3 py-2 text-right">{money(c.ingresoNeto)}</td>
                  <td className={`px-3 py-2 text-right ${c.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(c.ganancia)}</td>
                  <td className="px-3 py-2 text-right">${(c.precioLb || 0).toFixed(3)}</td>
                  <td className="px-3 py-2 text-right">{num(c.numClaims)}</td>
                  <td className="px-3 py-2 text-right">{pct(c.pctClaims, 2)}</td>
                  <td className="px-3 py-2"><SemaforoCiudad c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!compacto && (
          <p className="mt-2 text-xs text-slate-400">
            Pesos: Ganancia 30% · Rentabilidad $/lb 20% · Calidad (claims) 25% · Fallidos 15% (proxy = claims) · Volumen 10%.
            {ranking.length === 1 && ' Con una sola ciudad los factores relativos quedan al 100%.'}
          </p>
        )}
      </Card>

      {!compacto && ranking.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <BarCard title="Ganancia por ciudad" data={gananciaData} fmt={money} horizontal height={220} />
          <BarCard title="Claims por ciudad" data={claimsData} fmt={num} horizontal height={220} />
          <BarCard title="$ por libra por ciudad" data={lbData} fmt={(v) => `$${Number(v).toFixed(3)}`} horizontal height={220} />
        </div>
      )}
    </div>
  )
}
