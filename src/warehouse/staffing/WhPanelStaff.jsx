// ============================================================================
// WAREHOUSE / STAFFING · DASHBOARD: KPIs, tendencia semanal y JARVIS.
// Mismo lenguaje visual del Dashboard de Paquetería (KPI/Card de ui.jsx,
// recharts para la tendencia, recomendaciones de JARVIS calculadas sobre los
// datos importados). Los períodos parciales se marcan para no engañar.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { Card, PageTitle, KPI, Badge, Spinner, EstadoVacio, Select } from '../../components/ui'
import { Gauge, WaterfallUtilidad, HeatmapDias, AreaAcumulada } from './graficasStaff'
import { Sparkles, BarChart3 } from 'lucide-react'
import { COL, cargar } from './datosStaff'
import { resumenPeriodo, gastosFijosDe } from './calculosStaff'
import { recomendacionesStaff } from './jarvisStaff'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WhPanelStaff({ irA }) {
  const [datos, setDatos] = useState(null)
  const [rango, setRango] = useState('12') // últimas N semanas en el análisis
  const [semanaSel, setSemanaSel] = useState('') // una semana específica
  useEffect(() => {
    (async () => {
      const [periodos, registros, ajustes, gastos, cobros, cheques, configs, workers] = await Promise.all([
        cargar(COL.periodos), cargar(COL.registros), cargar(COL.ajustes), cargar(COL.gastos), cargar(COL.cobros), cargar(COL.cheques), cargar(COL.config), cargar(COL.workers),
      ])
      const gastosFijos = configs.find((c) => c.id === 'gastosFijos')?.lista || []
      const pagoAparteIds = new Set(workers.filter((w) => w.pagoAparte).map((w) => w.id))
      setDatos({ periodos: periodos.sort((a, b) => String(a.inicio).localeCompare(b.inicio)), registros, ajustes, gastos, cobros, cheques, gastosFijos, pagoAparteIds })
    })()
  }, [])

  const semanas = useMemo(() => {
    if (!datos) return []
    return datos.periodos.map((p) => {
      const regs = datos.registros.filter((r) => r.periodoId === p.id)
      const res = resumenPeriodo({
        registros: regs,
        ajustes: datos.ajustes.filter((a) => a.periodoAplicaId === p.id && a.estado !== 'revision'),
        gastos: [...datos.gastos.filter((g) => g.periodoId === p.id), ...gastosFijosDe(datos.gastosFijos, p.fin)],
        cobros: datos.cobros.filter((c) => c.periodoId === p.id),
        cheques: datos.cheques.filter((c) => (c.distribucion || []).some((d) => d.periodoId === p.id)),
        pagoAparteIds: datos.pagoAparteIds,
      })
      return { periodo: p, res, regs }
    }).filter((x) => x.regs.length > 0)
  }, [datos])

  if (!datos) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando dashboard…</div>
  if (!semanas.length) {
    return (
      <div>
        <PageTitle>Dashboard · Staffing</PageTitle>
        <EstadoVacio icono={BarChart3} titulo="Aún no hay semanas importadas" texto="Importa el primer reporte de Gofo en Staffing Gofo y aquí verás tus números y las recomendaciones de JARVIS." mostrarBoton={false} />
      </div>
    )
  }

  // los KPIs muestran la semana elegida (o la última si no hay elección)
  const idxUlt = semanaSel ? semanas.findIndex((x) => x.periodo.id === semanaSel) : semanas.length - 1
  const ult = semanas[idxUlt] || semanas[semanas.length - 1]
  const ant = idxUlt > 0 ? semanas[idxUlt - 1] : null
  const tendencia = (campo) => {
    if (!ant || !ant.res[campo]) return undefined
    const d = ((ult.res[campo] - ant.res[campo]) / Math.abs(ant.res[campo])) * 100
    return Math.round(d * 10) / 10
  }
  const recs = recomendacionesStaff({ semanas, registros: datos.registros, ajustes: datos.ajustes, cheques: datos.cheques })
  // rango de análisis (gráfico, totales, top y posiciones); una semana
  // específica elegida manda sobre el rango
  const vis = semanaSel
    ? semanas.filter((x) => x.periodo.id === semanaSel)
    : (rango === 'todas' ? semanas : semanas.slice(-Number(rango)))
  const grafico = vis.map((x) => ({
    nombre: x.periodo.inicio.slice(5),
    Ingreso: x.res.ingreso,
    Pagos: x.res.pagoCalc,
    Gastos: x.res.gastos,
    Utilidad: x.res.parcial ? null : x.res.utilidad,
  }))
  const completasVis = vis.filter((x) => !x.res.parcial)
  const acum = {
    ingreso: vis.reduce((s, x) => s + x.res.ingreso, 0),
    pagos: vis.reduce((s, x) => s + x.res.pagoCalc, 0),
    gastos: vis.reduce((s, x) => s + x.res.gastos, 0),
    utilidad: completasVis.reduce((s, x) => s + x.res.utilidad, 0),
    horas: vis.reduce((s, x) => s + x.res.horas, 0),
    cobrado: vis.reduce((s, x) => s + x.res.cobrado, 0),
    parciales: vis.length - completasVis.length,
  }
  const regsVis = vis.flatMap((x) => x.regs)
  const topTrab = Object.values(regsVis.reduce((m, r) => {
    const k = r.workerId || r.nombreNorm
    m[k] = m[k] || { nombre: r.nombre, horas: 0, pago: 0, semanas: new Set() }
    m[k].horas += r.horasTotal || 0
    m[k].pago += r.miPago || 0
    m[k].semanas.add(r.periodoId)
    return m
  }, {})).sort((a, b) => b.pago - a.pago).slice(0, 8)
  const porPos = Object.values(regsVis.reduce((m, r) => {
    const k = r.posicion || '—'
    m[k] = m[k] || { posicion: k, personas: new Set(), horas: 0, pago: 0, ingreso: 0 }
    m[k].personas.add(r.workerId || r.nombreNorm)
    m[k].horas += r.horasTotal || 0
    m[k].pago += r.miPago || 0
    m[k].ingreso += r.importeGofo || 0
    return m
  }, {})).sort((a, b) => b.pago - a.pago)
  const colorRec = { urgente: 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10', atencion: 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10', ok: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10' }

  return (
    <div>
      <PageTitle>Dashboard · Staffing</PageTitle>

      {/* JARVIS */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={17} className="text-brand-gold" />
          <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Recomendaciones de JARVIS</span>
          <span className="text-xs text-slate-400">análisis de {semanas.length} semana{semanas.length === 1 ? '' : 's'} importada{semanas.length === 1 ? '' : 's'}</span>
        </div>
        {recs.length === 0 && <div className="text-xs text-slate-400">Sin observaciones: los números de tus semanas se ven sanos.</div>}
        <div className="grid gap-2 md:grid-cols-2">
          {recs.map((r, i) => (
            <div key={i} className={`rounded-xl border p-3 ${colorRec[r.tipo]}`}>
              <div className="mb-1 text-[13px] font-bold text-brand-navy dark:text-slate-100">{r.icono} {r.titulo}</div>
              <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{r.detalle}</div>
              {r.accion && irA && (
                <button onClick={() => irA(r.accion)} className="mt-1.5 text-xs font-bold text-brand-gold hover:underline">Ir a {r.accion} →</button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Sugerencias calculadas con tus datos importados — la decisión siempre es tuya.</div>
      </Card>

      {/* KPIs de la semana elegida (o la última) */}
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {semanaSel ? 'Semana elegida:' : 'Última semana:'} <b className="text-brand-navy dark:text-slate-200">{ult.periodo.inicio} → {ult.periodo.fin}</b>
        {ult.res.parcial && <Badge color="red">PARCIAL: faltan tarifas</Badge>}
        <Select className="ml-auto w-52 text-xs" value={semanaSel} onChange={(e) => setSemanaSel(e.target.value)}>
          <option value="">Ver una semana específica…</option>
          {semanas.slice().reverse().map((x) => <option key={x.periodo.id} value={x.periodo.id}>{x.periodo.inicio} → {x.periodo.fin}</option>)}
        </Select>
      </div>
      <div className="cm-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPI label="Ingreso Gofo" value={dinero(ult.res.ingreso)} trend={tendencia('ingreso')} />
        <KPI label="Pagos calculados" value={dinero(ult.res.pagoCalc)} trend={tendencia('pagoCalc')} />
        <KPI label="Gastos" value={dinero(ult.res.gastos)} />
        <KPI label="Utilidad" value={ult.res.parcial ? 'pendiente' : dinero(ult.res.utilidad)} accent={ult.res.utilidad >= 0 ? 'green' : 'red'} sub={ult.res.parcial ? 'faltan tarifas' : (ult.res.pctUtilidad === null ? 'no aplica' : `${ult.res.pctUtilidad}% del ingreso`)} />
        <KPI label="Horas · personas" value={`${Math.round(ult.res.horas).toLocaleString()} h`} sub={`${ult.res.trabajadores} personas`} />
        <KPI label="Por cobrar · por pagar" value={dinero(ult.res.porCobrar)} sub={`por pagar ${dinero(ult.res.porPagar)}`} />
      </div>

      {/* Totales del rango elegido: la GANANCIA REAL manda */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Acumulado del rango</span>
          <Select className="ml-auto w-44 text-xs" value={rango} onChange={(e) => setRango(e.target.value)}>
            <option value="4">Últimas 4 semanas</option>
            <option value="8">Últimas 8 semanas</option>
            <option value="12">Últimas 12 semanas</option>
            <option value="todas">Todas las semanas</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
            <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Ganancia real (después de gastos)</div>
            <div className={`text-xl font-black ${acum.utilidad >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{dinero(acum.utilidad)}</div>
            <div className="text-[10px] text-slate-400">{acum.ingreso > 0 ? `${Math.round((acum.utilidad / acum.ingreso) * 1000) / 10}% del ingreso` : 'no aplica'}{acum.parciales ? ` · sin ${acum.parciales} parcial(es)` : ''}</div>
          </div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Ingreso Gofo</div><div className="text-lg font-black text-brand-navy dark:text-slate-100">{dinero(acum.ingreso)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Pagos a trabajadores</div><div className="text-lg font-black text-brand-navy dark:text-slate-100">{dinero(acum.pagos)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Gastos</div><div className="text-lg font-black text-brand-navy dark:text-slate-100">{dinero(acum.gastos)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Cobrado de Gofo</div><div className="text-lg font-black text-brand-navy dark:text-slate-100">{dinero(acum.cobrado)}</div><div className="text-[10px] text-slate-400">por cobrar {dinero(Math.max(0, acum.ingreso - acum.cobrado))}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Horas</div><div className="text-lg font-black text-brand-navy dark:text-slate-100">{Math.round(acum.horas).toLocaleString()} h</div></div>
        </div>
      </Card>

      {/* Tendencia semanal */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Tendencia semana a semana</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafico} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => dinero(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingreso" fill="#3d5a80" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Pagos" fill="#c9a24b" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Gastos" fill="#9aa3b2" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="Utilidad" stroke="#149d80" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">La línea de utilidad se corta en semanas parciales (tarifas pendientes) para no mostrar números incompletos. Incluye gastos fijos configurados.</div>
      </Card>

      {/* Medidores + waterfall + ganancia acumulada */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Gauge label="% de ganancia (semana elegida)" pct={ult.res.parcial ? null : ult.res.pctUtilidad} sub={ult.res.parcial ? 'faltan tarifas' : `${dinero(ult.res.utilidad)} de ${dinero(ult.res.ingreso)}`} color={!ult.res.parcial && ult.res.utilidad < 0 ? '#e0526a' : '#149d80'} />
        <Gauge label="% cobrado de Gofo (rango)" pct={acum.ingreso > 0 ? (acum.cobrado / acum.ingreso) * 100 : null} sub={`${dinero(acum.cobrado)} de ${dinero(acum.ingreso)}`} color="#3d5a80" />
        <div className="sm:col-span-2">
          <WaterfallUtilidad titulo={`¿Cómo el ingreso se vuelve ganancia? (${ult.periodo.inicio.slice(5)} → ${ult.periodo.fin.slice(5)})`} ingreso={ult.res.ingreso} pagos={ult.res.pagoCalc} gastos={ult.res.gastos} />
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {vis.length > 1 && (
          <AreaAcumulada titulo="Ganancia real acumulada del rango" nota={acum.parciales ? `sin ${acum.parciales} semana(s) parcial(es)` : undefined}
            puntos={completasVis.map((x) => ({ nombre: x.periodo.inicio.slice(5), valor: x.res.utilidad }))} />
        )}
        <HeatmapDias titulo={`Horas por día y posición (${semanaSel ? 'semana elegida' : 'rango'})`}
          nota="Más oscuro = más horas ese día. Útil para ver qué días pesan más en la nómina."
          filas={(() => {
            const mapa = {}
            for (const r of regsVis) {
              const k = r.posicion || '—'
              mapa[k] = mapa[k] || [0, 0, 0, 0, 0, 0, 0]
              for (const [f, h] of Object.entries(r.dias || {})) {
                const d = new Date(f + 'T12:00:00').getDay()
                if (d >= 0) mapa[k][d] += Number(h) || 0
              }
            }
            return Object.entries(mapa).map(([etiqueta, dias]) => ({ etiqueta, dias })).sort((a, b) => b.dias.reduce((s, x) => s + x, 0) - a.dias.reduce((s, x) => s + x, 0)).slice(0, 7)
          })()} />
      </div>

      {/* Top de trabajadores y reparto por posición (del rango elegido) */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Top trabajadores por pago</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
              <th className="py-1 pr-2">Trabajador</th><th className="pr-2 text-right">Semanas</th><th className="pr-2 text-right">Horas</th><th className="pr-2 text-right">$/h</th><th className="pr-2 text-right">Pago</th>
            </tr></thead>
            <tbody>
              {topTrab.map((t) => (
                <tr key={t.nombre} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{t.nombre}</td>
                  <td className="pr-2 text-right">{t.semanas.size}</td>
                  <td className="pr-2 text-right">{Math.round(t.horas * 100) / 100}</td>
                  <td className="pr-2 text-right">{t.horas > 0 ? dinero(Math.round((t.pago / t.horas) * 100) / 100) : '—'}</td>
                  <td className="pr-2 text-right font-semibold">{dinero(Math.round(t.pago * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Reparto por posición</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
              <th className="py-1 pr-2">Posición</th><th className="pr-2 text-right">Personas</th><th className="pr-2 text-right">Horas</th><th className="pr-2 text-right">Mi $/h</th><th className="pr-2 text-right">Ingreso</th><th className="pr-2 text-right">Pago</th><th className="pr-2 text-right">Margen</th>
            </tr></thead>
            <tbody>
              {porPos.map((x) => (
                <tr key={x.posicion} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{x.posicion}</td>
                  <td className="pr-2 text-right">{x.personas.size}</td>
                  <td className="pr-2 text-right">{Math.round(x.horas * 100) / 100}</td>
                  <td className="pr-2 text-right">{x.horas > 0 ? dinero(Math.round((x.pago / x.horas) * 100) / 100) : '—'}</td>
                  <td className="pr-2 text-right">{dinero(Math.round(x.ingreso * 100) / 100)}</td>
                  <td className="pr-2 text-right">{dinero(Math.round(x.pago * 100) / 100)}</td>
                  <td className={`pr-2 text-right font-semibold ${x.ingreso - x.pago >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{dinero(Math.round((x.ingreso - x.pago) * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-slate-400">Margen = ingreso de Gofo − tu pago, antes de gastos generales.</div>
        </Card>
      </div>
    </div>
  )
}
