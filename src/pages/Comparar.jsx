import { useState, useMemo, useEffect } from 'react'
import { useData } from '../DataContext'
import { resumenEstimado, variacion, nombreCiudadDe, TODAS, TODOS } from '../utils/calc'
import { combinarFacturas, facturaDeChofer } from '../utils/rango'
import { money, num, pct } from '../utils/format'
import { PageTitle, Card, Select, Aviso, EstadoVacio } from '../components/ui'
import { BarCard } from '../components/charts'

export default function Comparar() {
  const { invoices, drivers, selectedCity, selectedDriver, facturaRangoFull } = useData()
  const hayChofer = selectedDriver && selectedDriver !== TODOS

  // SEMANAS DISTINTAS. Cada semana puede tener VARIAS facturas (una por ciudad, porque
  // Gofo paga por ciudad). El selector muestra la semana UNA sola vez y al elegirla se
  // combinan todas sus ciudades (y luego se aplica el filtro global).
  const weeks = useMemo(() => {
    const map = new Map()
    for (const i of (invoices || [])) {
      const wk = (i.semana || '').trim()
      if (!wk) continue
      if (!map.has(wk)) map.set(wk, { semana: wk, invs: [], t: i.fechaInicio instanceof Date ? i.fechaInicio.getTime() : 0 })
      map.get(wk).invs.push(i)
    }
    return [...map.values()].sort((a, b) => b.t - a.t)
  }, [invoices])

  const [wkA, setWkA] = useState('')
  const [wkB, setWkB] = useState('')
  useEffect(() => {
    if (!weeks.length) return
    setWkB((prev) => (weeks.some((w) => w.semana === prev) ? prev : weeks[0].semana))
    setWkA((prev) => (weeks.some((w) => w.semana === prev) ? prev : (weeks[1] || weeks[0]).semana))
  }, [weeks])

  // Combina TODAS las facturas (ciudades) de una semana en una sola; si hay un chofer
  // filtrado, la reduce a ese chofer. El filtro de CIUDAD se aplica en resumenEstimado.
  const combSemana = (wk) => {
    const w = weeks.find((x) => x.semana === wk)
    if (!w) return null
    const comb = combinarFacturas(w.invs)
    return hayChofer ? facturaDeChofer(comb, selectedDriver) : comb
  }
  const eA = useMemo(() => resumenEstimado(combSemana(wkA), drivers, selectedCity), [wkA, weeks, drivers, selectedCity, hayChofer, selectedDriver])
  const eB = useMemo(() => resumenEstimado(combSemana(wkB), drivers, selectedCity), [wkB, weeks, drivers, selectedCity, hayChofer, selectedDriver])

  if (weeks.length < 2) {
    return (
      <div>
        <PageTitle>Comparar semanas</PageTitle>
        <EstadoVacio titulo="Necesitas al menos 2 semanas" texto="Carga al menos dos semanas distintas para poder compararlas." />
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
            <Select value={wkA} onChange={(e) => setWkA(e.target.value)}>
              {weeks.map((w) => (<option key={w.semana} value={w.semana}>{w.semana}</option>))}
            </Select>
          </div>
          <div className="text-2xl text-slate-400">vs</div>
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Semana B</div>
            <Select value={wkB} onChange={(e) => setWkB(e.target.value)}>
              {weeks.map((w) => (<option key={w.semana} value={w.semana}>{w.semana}</option>))}
            </Select>
          </div>
        </div>
      </Card>

      {wkA === wkB && <Aviso tipo="warn">Estás comparando la misma semana. Elige dos semanas distintas.</Aviso>}

      <Card className="mb-4 p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <th className="px-4 py-2.5 text-left font-semibold">Métrica</th>
              <th className="px-4 py-2.5 text-right font-semibold">A · {wkA}</th>
              <th className="px-4 py-2.5 text-right font-semibold">B · {wkB}</th>
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
        <BarCard title={`Semana A · ${wkA || ''}`} data={chartData} fmt={money} dataKey="A" color="#13233f" />
        <BarCard title={`Semana B · ${wkB || ''}`} data={chartData} fmt={money} dataKey="B" color="#c9a24b" />
      </div>
    </div>
  )
}
