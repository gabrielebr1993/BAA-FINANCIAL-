// ============================================================================
// WAREHOUSE / STAFFING · DASHBOARD: KPIs, tendencia semanal y JARVIS.
// Mismo lenguaje visual del Dashboard de Paquetería (KPI/Card de ui.jsx,
// recharts para la tendencia, recomendaciones de JARVIS calculadas sobre los
// datos importados). Los períodos parciales se marcan para no engañar.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { Card, PageTitle, KPI, Badge, Spinner, EstadoVacio } from '../../components/ui'
import { Sparkles, BarChart3 } from 'lucide-react'
import { COL, cargar } from './datosStaff'
import { resumenPeriodo, gastosFijosDe } from './calculosStaff'
import { recomendacionesStaff } from './jarvisStaff'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WhPanelStaff({ irA }) {
  const [datos, setDatos] = useState(null)
  useEffect(() => {
    (async () => {
      const [periodos, registros, ajustes, gastos, cobros, cheques, configs] = await Promise.all([
        cargar(COL.periodos), cargar(COL.registros), cargar(COL.ajustes), cargar(COL.gastos), cargar(COL.cobros), cargar(COL.cheques), cargar(COL.config),
      ])
      const gastosFijos = configs.find((c) => c.id === 'gastosFijos')?.lista || []
      setDatos({ periodos: periodos.sort((a, b) => String(a.inicio).localeCompare(b.inicio)), registros, ajustes, gastos, cobros, cheques, gastosFijos })
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

  const ult = semanas[semanas.length - 1]
  const ant = semanas.length > 1 ? semanas[semanas.length - 2] : null
  const tendencia = (campo) => {
    if (!ant || !ant.res[campo]) return undefined
    const d = ((ult.res[campo] - ant.res[campo]) / Math.abs(ant.res[campo])) * 100
    return Math.round(d * 10) / 10
  }
  const recs = recomendacionesStaff({ semanas, registros: datos.registros, ajustes: datos.ajustes, cheques: datos.cheques })
  const grafico = semanas.map((x) => ({
    nombre: x.periodo.inicio.slice(5),
    Ingreso: x.res.ingreso,
    Pagos: x.res.pagoCalc,
    Gastos: x.res.gastos,
    Utilidad: x.res.parcial ? null : x.res.utilidad,
  }))
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

      {/* KPIs de la última semana */}
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        Última semana: <b className="text-brand-navy dark:text-slate-200">{ult.periodo.inicio} → {ult.periodo.fin}</b>
        {ult.res.parcial && <Badge color="red">PARCIAL: faltan tarifas</Badge>}
      </div>
      <div className="cm-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPI label="Ingreso Gofo" value={dinero(ult.res.ingreso)} trend={tendencia('ingreso')} />
        <KPI label="Pagos calculados" value={dinero(ult.res.pagoCalc)} trend={tendencia('pagoCalc')} />
        <KPI label="Gastos" value={dinero(ult.res.gastos)} />
        <KPI label="Utilidad" value={ult.res.parcial ? 'pendiente' : dinero(ult.res.utilidad)} accent={ult.res.utilidad >= 0 ? 'green' : 'red'} sub={ult.res.parcial ? 'faltan tarifas' : (ult.res.pctUtilidad === null ? 'no aplica' : `${ult.res.pctUtilidad}% del ingreso`)} />
        <KPI label="Horas · personas" value={`${Math.round(ult.res.horas).toLocaleString()} h`} sub={`${ult.res.trabajadores} personas`} />
        <KPI label="Por cobrar · por pagar" value={dinero(ult.res.porCobrar)} sub={`por pagar ${dinero(ult.res.porPagar)}`} />
      </div>

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
    </div>
  )
}
