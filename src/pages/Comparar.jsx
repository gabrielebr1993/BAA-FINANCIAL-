import { useState, useMemo, useEffect } from 'react'
import { useData } from '../DataContext'
import { resumenEstimado, variacion, costoManagers, nombreCiudadDe, TODAS, TODOS } from '../utils/calc'
import { combinarFacturas, facturaDeChofer } from '../utils/rango'
import { money, num, pct } from '../utils/format'
import { PageTitle, Card, Select, Aviso, EstadoVacio } from '../components/ui'
import { BarCard } from '../components/charts'
import { useLang } from '../i18n'

export default function Comparar() {
  const { t } = useLang()
  const { invoices, drivers, managers, selectedCity, selectedDriver, facturaRangoFull } = useData()
  const hayChofer = selectedDriver && selectedDriver !== TODOS

  // Gastos fijos (sueldos semanales de managers) de UNA semana, respetando el filtro de
  // ciudad. Es la misma configuración vigente para ambas semanas; se resta por separado a
  // cada una para obtener la GANANCIA REAL de esa semana. Con un chofer filtrado no se
  // cargan (los gastos fijos son un costo de ciudad/empresa, no del chofer).
  const gastosFijosSemana = useMemo(
    () => (hayChofer ? 0 : costoManagers(managers, 1, selectedCity)),
    [managers, selectedCity, hayChofer]
  )

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
  // Resumen operativo + gastos fijos de la semana + GANANCIA REAL (operativa − fijos).
  const conFijos = (e) => ({
    ...e,
    gastosFijos: gastosFijosSemana,
    gananciaReal: e.ganancia - gastosFijosSemana,
  })
  const eA = useMemo(() => conFijos(resumenEstimado(combSemana(wkA), drivers, selectedCity)), [wkA, weeks, drivers, selectedCity, hayChofer, selectedDriver, gastosFijosSemana])
  const eB = useMemo(() => conFijos(resumenEstimado(combSemana(wkB), drivers, selectedCity)), [wkB, weeks, drivers, selectedCity, hayChofer, selectedDriver, gastosFijosSemana])

  if (weeks.length < 2) {
    return (
      <div>
        <PageTitle>{t('Comparar semanas')}</PageTitle>
        <EstadoVacio titulo={t('Necesitas al menos 2 semanas')} texto={t('Carga al menos dos semanas distintas para poder compararlas.')} />
      </div>
    )
  }

  const metricas = [
    { key: 'ingreso', label: t('Ingreso'), fmt: money },
    { key: 'costo', label: t('Costo (choferes + claims)'), fmt: money },
    { key: 'ganancia', label: t('Ganancia operativa'), fmt: money },
    { key: 'gastosFijos', label: t('− Gastos fijos'), fmt: money, negativo: true },
    { key: 'gananciaReal', label: t('Ganancia real'), fmt: money, destacar: true },
    { key: 'paquetes', label: t('Paquetes'), fmt: num },
    { key: 'dobles', label: t('Dobles'), fmt: num },
    { key: 'claims', label: t('Claims'), fmt: num },
  ]

  const chartData = [
    { name: t('Ingreso'), A: Math.round(eA.ingreso), B: Math.round(eB.ingreso) },
    { name: t('Ganancia operativa'), A: Math.round(eA.ganancia), B: Math.round(eB.ganancia) },
    { name: t('Ganancia real'), A: Math.round(eA.gananciaReal), B: Math.round(eB.gananciaReal) },
  ]

  return (
    <div>
      <PageTitle>{t('Comparar semanas')}</PageTitle>

      {(selectedCity !== TODAS || hayChofer) && (
        <div className="mb-3 flex items-center gap-1.5 text-[13px]">
          <span className="text-slate-400 dark:text-slate-500">{t('Filtro aplicado:')}</span>
          <span className="font-semibold text-brand-navy dark:text-white">{selectedCity === TODAS ? t('Todas las ciudades') : (nombreCiudadDe(facturaRangoFull, selectedCity) || selectedCity)}</span>
          {hayChofer && (<><span className="text-slate-300 dark:text-slate-600">·</span><span className="text-slate-600 dark:text-slate-300">{selectedDriver}</span></>)}
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('Semana A')}</div>
            <Select value={wkA} onChange={(e) => setWkA(e.target.value)}>
              {weeks.map((w) => (<option key={w.semana} value={w.semana}>{w.semana}</option>))}
            </Select>
          </div>
          <div className="text-2xl text-slate-400">vs</div>
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('Semana B')}</div>
            <Select value={wkB} onChange={(e) => setWkB(e.target.value)}>
              {weeks.map((w) => (<option key={w.semana} value={w.semana}>{w.semana}</option>))}
            </Select>
          </div>
        </div>
      </Card>

      {wkA === wkB && <Aviso tipo="warn">{t('Estás comparando la misma semana. Elige dos semanas distintas.')}</Aviso>}

      <Card className="mb-4 p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <th className="px-4 py-2.5 text-left font-semibold">{t('Métrica')}</th>
              <th className="px-4 py-2.5 text-right font-semibold">A · {wkA}</th>
              <th className="px-4 py-2.5 text-right font-semibold">B · {wkB}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t('Variación')}</th>
            </tr>
          </thead>
          <tbody>
            {metricas.map((m) => {
              const va = eA[m.key] || 0
              const vb = eB[m.key] || 0
              const v = variacion(vb, va)
              const rowCls = m.destacar
                ? 'border-t-2 border-brand-gold/50 bg-brand-gold/5 dark:bg-brand-gold/10'
                : 'border-t border-slate-100 dark:border-slate-700/50'
              const cellCls = m.destacar ? 'font-bold text-brand-navy dark:text-slate-100' : ''
              const valCls = m.negativo ? 'text-rose-600 dark:text-rose-400' : (m.destacar ? 'font-bold' : '')
              return (
                <tr key={m.key} className={rowCls}>
                  <td className={`px-4 py-2.5 font-medium ${cellCls}`}>{m.label}</td>
                  <td className={`px-4 py-2.5 text-right ${valCls}`}>{m.negativo ? '−' : ''}{m.fmt(va)}</td>
                  <td className={`px-4 py-2.5 text-right ${valCls}`}>{m.negativo ? '−' : ''}{m.fmt(vb)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {v == null ? '—' : `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <p className="mb-4 -mt-2 px-1 text-xs text-slate-400 dark:text-slate-500">
        {hayChofer
          ? t('Con un chofer filtrado no se cargan gastos fijos (son un costo de ciudad/empresa). La ganancia real coincide con la operativa.')
          : `${t('Ganancia real = ganancia operativa − gastos fijos de la semana')} (${money(gastosFijosSemana)}${selectedCity !== TODAS ? ` · ${nombreCiudadDe(facturaRangoFull, selectedCity) || selectedCity}` : ''}). ${t('Son los sueldos semanales vigentes; se restan a cada semana por igual.')}`}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarCard title={`${t('Semana A')} · ${wkA || ''}`} data={chartData} fmt={money} dataKey="A" color="#13233f" />
        <BarCard title={`${t('Semana B')} · ${wkB || ''}`} data={chartData} fmt={money} dataKey="B" color="#c9a24b" />
      </div>
    </div>
  )
}
