import { useState, useMemo } from 'react'
import { useData } from '../DataContext'
import { resumenEstimado, variacion, nombreCiudadDe, TODAS, TODOS } from '../utils/calc'
import { facturaDeChofer } from '../utils/rango'
import { money, num, pct } from '../utils/format'
import { PageTitle, Card, Select, Aviso, EstadoVacio } from '../components/ui'
import { BarCard } from '../components/charts'

export default function Comparar() {
  const { invoices, drivers, selectedCity, selectedDriver, facturaRangoFull } = useData()
  const [idA, setIdA] = useState(invoices[1]?.id || invoices[0]?.id || '')
  const [idB, setIdB] = useState(invoices[0]?.id || '')

  const invA = invoices.find((i) => i.id === idA) || null
  const invB = invoices.find((i) => i.id === idB) || null

  // Respeta el filtro global de ciudad y chofer (Refinar): cada semana se acota al
  // mismo chofer/ciudad para comparar lo mismo (no semanas completas si hay filtro).
  const hayChofer = selectedDriver && selectedDriver !== TODOS
  const invAf = hayChofer ? facturaDeChofer(invA, selectedDriver) : invA
  const invBf = hayChofer ? facturaDeChofer(invB, selectedDriver) : invB
  const eA = useMemo(() => resumenEstimado(invAf, drivers, selectedCity), [invAf, drivers, selectedCity])
  const eB = useMemo(() => resumenEstimado(invBf, drivers, selectedCity), [invBf, drivers, selectedCity])

  if (invoices.length < 2) {
    return (
      <div>
        <PageTitle>Comparar semanas</PageTitle>
        <EstadoVacio titulo="Necesitas al menos 2 facturas" texto="Carga al menos dos semanas para poder compararlas." />
      </div>
    )
  }

  const metricas = [
    { key: 'ingreso', label: 'Ingreso', fmt: money },
    { key: 'costo', label: 'Costo', fmt: money },
    { key: 'ganancia', label: 'Ganancia', fmt: money },
    { key: 'paquetes', label: 'Paquetes', fmt: num },
    { key: 'dobles', label: 'Dobles', fmt: num },
    { key: 'claims', label: 'Claims', fmt: num },
  ]

  const chartData = [
    { name: 'Ingreso', A: Math.round(eA.ingreso), B: Math.round(eB.ingreso) },
    { name: 'Costo', A: Math.round(eA.costo), B: Math.round(eB.costo) },
    { name: 'Ganancia', A: Math.round(eA.ganancia), B: Math.round(eB.ganancia) },
  ]

  return (
    <div>
      <PageTitle>Comparar semanas</PageTitle>

      {(selectedCity !== TODAS || hayChofer) && (
        <div className="mb-3 flex items-center gap-1.5 text-[13px]">
          <span className="text-slate-400 dark:text-slate-500">Filtro aplicado:</span>
          <span className="font-semibold text-brand-navy dark:text-white">{selectedCity === TODAS ? 'Todas las ciudades' : (nombreCiudadDe(facturaRangoFull, selectedCity) || selectedCity)}</span>
          {hayChofer && (<><span className="text-slate-300 dark:text-slate-600">·</span><span className="text-slate-600 dark:text-slate-300">{selectedDriver}</span></>)}
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Semana A</div>
            <Select value={idA} onChange={(e) => setIdA(e.target.value)}>
              {invoices.map((i) => (<option key={i.id} value={i.id}>{i.semana}</option>))}
            </Select>
          </div>
          <div className="text-2xl text-slate-400">vs</div>
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Semana B</div>
            <Select value={idB} onChange={(e) => setIdB(e.target.value)}>
              {invoices.map((i) => (<option key={i.id} value={i.id}>{i.semana}</option>))}
            </Select>
          </div>
        </div>
      </Card>

      {idA === idB && <Aviso tipo="warn">Estás comparando la misma semana. Elige dos semanas distintas.</Aviso>}

      <Card className="mb-4 p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <th className="px-4 py-2.5 text-left font-semibold">Métrica</th>
              <th className="px-4 py-2.5 text-right font-semibold">A · {invA?.semana}</th>
              <th className="px-4 py-2.5 text-right font-semibold">B · {invB?.semana}</th>
              <th className="px-4 py-2.5 text-right font-semibold">Variación</th>
            </tr>
          </thead>
          <tbody>
            {metricas.map((m) => {
              const va = eA[m.key] || 0
              const vb = eB[m.key] || 0
              const v = variacion(vb, va)
              return (
                <tr key={m.key} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-4 py-2.5 font-medium">{m.label}</td>
                  <td className="px-4 py-2.5 text-right">{m.fmt(va)}</td>
                  <td className="px-4 py-2.5 text-right">{m.fmt(vb)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {v == null ? '—' : `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarCard title={`Semana A · ${invA?.semana || ''}`} data={chartData} fmt={money} dataKey="A" color="#13233f" />
        <BarCard title={`Semana B · ${invB?.semana || ''}`} data={chartData} fmt={money} dataKey="B" color="#c9a24b" />
      </div>
    </div>
  )
}
