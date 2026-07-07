import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { useData } from '../DataContext'
import {
  calcularPagos, rankingsChoferes, rankingsRutas, alertasCambioPrecio,
  porCiudad, totalesFiltrados, resumenEstimado, variacion, nombreCiudadDe, TODAS,
} from '../utils/calc'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { money, num, pct } from '../utils/format'
import { KPI, PageTitle, Tabla, Aviso, Badge, Cargando, EstadoVacio, Card } from '../components/ui'
import { BarCard, StackedBarCard, DonutCard, TrendCard, GaugeCard, Widget, useChartTheme, PALETTE } from '../components/charts'
import Verificacion from '../components/Verificacion'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

export default function Dashboard() {
  const { facturaRango: inv, invoicesRango, invoices, claims, drivers, selectedCity, vista, cargando } = useData()
  const esRango = !!inv?.esRango
  const variasSemanas = invoicesRango.length > 1

  const rc = useMemo(() => rankingsChoferes(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])
  const rr = useMemo(() => rankingsRutas(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const tot = useMemo(() => totalesFiltrados(inv, selectedCity), [inv, selectedCity])
  const pagos = useMemo(() => calcularPagos(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])

  const invAnterior = useMemo(() => {
    if (!inv || esRango) return null
    const idx = invoices.findIndex((i) => i.id === inv.id)
    return idx >= 0 ? invoices[idx + 1] : null
  }, [inv, esRango, invoices])

  const est = useMemo(() => resumenEstimado(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const estPrev = useMemo(() => (invAnterior ? resumenEstimado(invAnterior, drivers, selectedCity) : null), [invAnterior, drivers, selectedCity])
  const alertas = useMemo(() => (esRango ? [] : alertasCambioPrecio(inv, invAnterior)), [esRango, inv, invAnterior])

  const trendData = useMemo(
    () => [...invoicesRango].reverse().map((f) => {
      const e = resumenEstimado(f, drivers, selectedCity)
      return { name: f.semana, ingreso: Math.round(e.ingreso), costo: Math.round(e.costo), ganancia: Math.round(e.ganancia), paquetes: e.paquetes, claims: e.claims }
    }),
    [invoicesRango, drivers, selectedCity]
  )

  const comparativoCiudades = useMemo(() => {
    if (!inv) return []
    return (inv.resumenCiudades || []).map((c) => {
      const e = resumenEstimado(inv, drivers, c.ubicacion)
      return { ciudad: nombreCiudadDe(inv, c.ubicacion), ingreso: e.ingreso, ganancia: e.ganancia, claims: c.numClaims, paquetes: c.paquetes }
    })
  }, [inv, drivers])

  const costoTotal = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const gananciaTotal = tot.ingreso - costoTotal
  const margen = tot.ingreso > 0 ? gananciaTotal / tot.ingreso : 0
  const calidad = tot.paquetes > 0 ? 1 - tot.numClaims / tot.paquetes : 1

  const ciudades = porCiudad(inv?.resumenCiudades || [], selectedCity)
  const ingresoPorCiudad = ciudades.map((c) => ({ name: nombreCiudadDe(inv, c.ubicacion), valor: Math.round(c.ingreso) }))
  const stackedCiudad = ciudades.map((c) => ({ name: nombreCiudadDe(inv, c.ubicacion), Individuales: c.individuales, Dobles: c.dobles }))
  const rutasTop = [...porCiudad(inv?.resumenRutas || [], selectedCity)].sort((a, b) => b.ingreso - a.ingreso).slice(0, 10)
  const ingresoPorRuta = rutasTop.map((r) => ({ name: r.ruta, valor: Math.round(r.ingreso) }))
  const claimsPorRuta = [...rr.porClaims].filter((r) => (r.numClaims || 0) > 0).slice(0, 12).map((r) => ({ name: r.ruta, valor: r.numClaims }))
  const donutTipo = [{ name: 'Individuales', valor: tot.individuales }, { name: 'Dobles', valor: tot.dobles }]

  const rankProd = rc.productividad.slice(0, 6).map((p) => ({ name: p.nombre, valor: Math.round(p.ingreso) }))
  const rankGan = rc.ganancia.slice(0, 6).map((p) => ({ name: p.nombre, valor: Math.round(p.ganancia) }))
  const rankCal = [...rc.calidad].filter((p) => p.claimsTotales > 0).slice(0, 6).map((p) => ({ name: p.nombre, valor: p.claimsTotales }))

  const porSemana = variasSemanas && vista === 'porSemana'

  return (
    <div>
      <PageTitle right={<><RangeSelector /><CitySelector /></>}>Dashboard</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : (
        <>
          {alertas.length > 0 && (
            <Aviso tipo="warn">
              ⚠️ Gofo cambió el precio (±{pct(UMBRAL_CAMBIO_PRECIO, 0)}) en {alertas.length} ruta(s) vs la semana anterior:
              <ul className="mt-2 list-disc pl-5">
                {alertas.slice(0, 6).map((a) => (
                  <li key={a.ruta}><b>{a.ruta}</b> ({a.nombreCiudad}): ${a.antesLb.toFixed(3)}/lb → ${a.ahoraLb.toFixed(3)}/lb ({a.cambioLb >= 0 ? '+' : ''}{pct(a.cambioLb)})</li>
                ))}
                {alertas.length > 6 && <li>…y {alertas.length - 6} más.</li>}
              </ul>
            </Aviso>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <KPI label="Ingreso total" value={money(tot.ingreso)} icon="💵" accent="green" trend={estPrev && variacion(est.ingreso, estPrev.ingreso)} />
            <KPI label="Costo total" value={money(costoTotal)} icon="🧾" accent="navy" trend={estPrev && variacion(est.costo, estPrev.costo)} />
            <KPI label="Ganancia" value={money(gananciaTotal)} icon="📈" accent="gold" trend={estPrev && variacion(est.ganancia, estPrev.ganancia)} />
            <KPI label="Margen" value={pct(margen)} icon="🎯" accent="blue" />
            <KPI label="Paquetes" value={num(tot.paquetes)} icon="📦" accent="slate" trend={estPrev && variacion(est.paquetes, estPrev.paquetes)} />
            <KPI label="% Dobles" value={pct(tot.pctDobles)} icon="🔁" accent="gold" />
            <KPI label="Claims" value={num(tot.numClaims)} icon="⚠️" accent="red" trend={estPrev && variacion(est.claims, estPrev.claims)} />
          </div>

          {!inv ? (
            <EstadoVacio titulo="Sin datos en este rango" texto="No hay facturas en el rango de fechas seleccionado. Cambia el rango o carga una factura." />
          ) : porSemana ? (
            /* -------- VISTA POR SEMANA -------- */
            <>
              <div className="mb-4">
                <TrendCard
                  title="Evolución semana a semana"
                  subtitle="Ingreso, costo y ganancia por semana"
                  area
                  data={trendData}
                  fmt={money}
                  series={[
                    { key: 'ingreso', label: 'Ingreso', color: '#13233f' },
                    { key: 'costo', label: 'Costo', color: '#c47f5a' },
                    { key: 'ganancia', label: 'Ganancia', color: '#c9a24b' },
                  ]}
                />
              </div>
              <Card className="p-4">
                <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Detalle por semana</h3>
                <Tabla
                  columns={[
                    { key: 'name', label: 'Semana' },
                    { key: 'ingreso', label: 'Ingreso', align: 'right' },
                    { key: 'costo', label: 'Costo', align: 'right' },
                    { key: 'ganancia', label: 'Ganancia', align: 'right' },
                    { key: 'paquetes', label: 'Paquetes', align: 'right' },
                    { key: 'claims', label: 'Claims', align: 'right' },
                  ]}
                  rows={[...trendData].reverse().map((r, i) => ({ ...r, _key: i }))}
                  renderCell={(row, key) => (['ingreso', 'costo', 'ganancia'].includes(key) ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
                />
              </Card>
            </>
          ) : (
            /* -------- VISTA COMBINADA -------- */
            <>
              <Verificacion v={inv.verificacion} compacto />

              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <GaugeCard title="Margen de ganancia" value={margen} color="#c9a24b" />
                <GaugeCard title="% de dobles" value={tot.pctDobles} color="#3b6ea5" />
                <GaugeCard title="Calidad (entregas sin claim)" value={calidad} color="#4a9c8c" />
              </div>

              {variasSemanas && (
                <div className="mb-4">
                  <TrendCard title="Tendencia semana a semana" subtitle="Ingreso, costo y ganancia por semana" area data={trendData} fmt={money}
                    series={[{ key: 'ingreso', label: 'Ingreso', color: '#13233f' }, { key: 'costo', label: 'Costo', color: '#c47f5a' }, { key: 'ganancia', label: 'Ganancia', color: '#c9a24b' }]} />
                </div>
              )}

              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BarCard title="Ingreso por ciudad" data={ingresoPorCiudad} fmt={money} horizontal />
                <DonutCard title="Distribución individual vs doble" data={donutTipo} fmt={num} />
                <BarCard title="Ingreso por ruta (top 10)" data={ingresoPorRuta} color="#13233f" fmt={money} />
                <StackedBarCard title="Individuales vs dobles por ciudad" data={stackedCiudad} fmt={num}
                  series={[{ key: 'Individuales', label: 'Individuales', color: '#3b6ea5' }, { key: 'Dobles', label: 'Dobles', color: '#c9a24b' }]} />
                {ingresoPorCiudad.length > 1 && <DonutCard title="Ingreso por ciudad" data={ingresoPorCiudad} fmt={money} />}
                <BarCard title="Claims por ruta" data={claimsPorRuta} color="#c47f5a" fmt={num} />
              </div>

              {selectedCity === TODAS && comparativoCiudades.length > 1 && (
                <Card className="mb-4 p-4">
                  <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Comparativo entre ciudades</h3>
                  <Tabla
                    columns={[
                      { key: 'ciudad', label: 'Ciudad' },
                      { key: 'paquetes', label: 'Paquetes', align: 'right' },
                      { key: 'ingreso', label: 'Ingreso', align: 'right' },
                      { key: 'ganancia', label: 'Ganancia', align: 'right' },
                      { key: 'claims', label: 'Claims', align: 'right' },
                    ]}
                    rows={[...comparativoCiudades].sort((a, b) => b.ingreso - a.ingreso).map((c) => ({ ...c, _key: c.ciudad }))}
                    renderCell={(row, key) => (['ingreso', 'ganancia'].includes(key) ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
                  />
                </Card>
              )}

              <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Rankings de choferes</h2>
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <RankWidget title="Por productividad (ingreso)" data={rankProd} lista={rc.productividad} fmt={money} valor={(p) => p.ingreso} />
                <RankWidget title="Por ganancia" data={rankGan} lista={rc.ganancia} fmt={money} valor={(p) => p.ganancia} marcaSinTarifa />
                <RankWidget title="Por calidad (menos claims)" data={rankCal} lista={rc.calidad} fmt={num} valor={(p) => p.claimsTotales} />
              </div>

              <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Rankings de rutas</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MiniLista titulo="Más reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio="Ninguna ruta con claims." />
                <MiniLista titulo="Cero reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 8)} render={(r) => r.ruta} vacio="Todas tienen algún claim." />
                <MiniLista titulo="Más ingreso" rows={rr.porIngreso.slice(0, 5)} render={(r) => `${r.ruta} — ${money(r.ingreso)}`} />
                <MiniLista titulo="Mejor $/lb" rows={rr.porPrecioLb.slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function RankWidget({ title, data, lista, fmt, valor, marcaSinTarifa }) {
  const mejor = lista[0]
  const peor = lista[lista.length - 1]
  return (
    <Widget title={title}>
      <BarCardInline data={data} fmt={fmt} />
      {mejor && (
        <div className="mt-2 text-xs">
          <Badge color="green">Mejor</Badge> {mejor?.nombre} · {fmt(valor(mejor) || 0)}
          {marcaSinTarifa && mejor?.sinTarifa ? ' (sin tarifa)' : ''}
        </div>
      )}
      {peor && lista.length > 1 && (
        <div className="mt-1 text-xs">
          <Badge color="red">Peor</Badge> {peor?.nombre} · {fmt(valor(peor) || 0)}
        </div>
      )}
    </Widget>
  )
}

function BarCardInline({ data, fmt }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: t.axis }} tickFormatter={fmt} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: t.axis }} width={92} />
        <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function MiniLista({ titulo, rows, render, vacio }) {
  return (
    <Widget title={titulo}>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">{vacio || 'Sin datos.'}</div>
      ) : (
        <ol className="m-0 list-decimal pl-5 text-sm leading-8">
          {rows.map((r, i) => (
            <li key={r.ruta || i}>{render(r)}</li>
          ))}
        </ol>
      )}
    </Widget>
  )
}
