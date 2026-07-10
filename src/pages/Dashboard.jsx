import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { DollarSign, Receipt, TrendingUp, Target, Package, Repeat, AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react'
import { useData } from '../DataContext'
import {
  calcularPagos, rankingsChoferes, rankingsRutas, alertasCambioPrecio,
  porCiudad, totalesFiltrados, resumenEstimado, variacion, gananciaRealDe, economiaClaims, nombreCiudadDe, contarClaimsValidos, TODAS,
} from '../utils/calc'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { money, num, pct } from '../utils/format'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { KPI, PageTitle, Tabla, Aviso, Badge, Cargando, EstadoVacio, Card, Boton } from '../components/ui'
import RecomendacionesJarvis from '../components/RecomendacionesJarvis'
import { BarCard, StackedBarCard, DonutCard, TrendCard, GaugeCard, Widget, useChartTheme, PALETTE } from '../components/charts'
import Verificacion from '../components/Verificacion'
import GananciaReal from '../components/GananciaReal'
import PanelClaims from '../components/PanelClaims'
import RankingClaimsTipo from '../components/RankingClaimsTipo'
import RankingCiudades from '../components/RankingCiudades'
import RankingCalificacion from '../components/RankingCalificacion'
import Onboarding from '../components/Onboarding'

export default function Dashboard() {
  const { facturaRango: inv, invoicesRango, invoices, claims, drivers, managers, ajustes, selectedCity, setSelectedCity, vista, cargando } = useData()
  const navigate = useNavigate()
  // Navega a una sección y, opcionalmente, preselecciona la ciudad de destino.
  const irA = (ruta, ciudad) => { if (ciudad !== undefined) setSelectedCity(ciudad); navigate(ruta) }
  // Navega al perfil completo de un chofer.
  const irAChofer = (nombre) => { if (nombre) navigate(`/choferes/${encodeURIComponent(nombre)}`) }
  const gReal = useMemo(() => gananciaRealDe(inv, claims, drivers, managers, selectedCity, Math.max(1, invoicesRango.length)), [inv, claims, drivers, managers, selectedCity, invoicesRango])
  const esRango = !!inv?.esRango
  const variasSemanas = invoicesRango.length > 1

  const rc = useMemo(() => rankingsChoferes(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])
  const rr = useMemo(() => rankingsRutas(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const tot = useMemo(() => totalesFiltrados(inv, selectedCity), [inv, selectedCity])
  const pagos = useMemo(() => calcularPagos(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])
  const claimEco = useMemo(() => economiaClaims(porCiudad(claims, selectedCity), inv), [claims, selectedCity, inv])

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
      return { code: c.ubicacion, ciudad: nombreCiudadDe(inv, c.ubicacion), ingreso: e.ingreso, ganancia: e.ganancia, claims: c.numClaims, paquetes: c.paquetes }
    })
  }, [inv, drivers])

  const costoTotal = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const gananciaTotal = tot.ingreso - costoTotal
  const margen = tot.ingreso > 0 ? gananciaTotal / tot.ingreso : 0
  // Conteo CANÓNICO de claims válidos (mismo en todas las pantallas).
  const claimsCiudad = useMemo(() => porCiudad(claims, selectedCity), [claims, selectedCity])
  const numClaims = useMemo(() => contarClaimsValidos(claimsCiudad), [claimsCiudad])
  const calidad = tot.paquetes > 0 ? 1 - numClaims / tot.paquetes : 1
  // eslint-disable-next-line no-console
  console.log('[MilePay] Claims usados en dashboard:', numClaims)

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

  // Descarga del resumen del periodo (Excel/PDF) reutilizando las utilidades de exportar.
  const nombreArch = `MilePay Dashboard ${inv?.semana || 'periodo'}`
  const filasCiudades = comparativoCiudades.map((c) => ({ Ciudad: c.ciudad, Paquetes: c.paquetes, Ingreso: Math.round(c.ingreso), Ganancia: Math.round(c.ganancia), Claims: c.claims }))
  const descargarExcel = () =>
    exportarExcel(nombreArch, [
      { nombre: 'Resumen', rows: [
        { Métrica: 'Ingreso total', Valor: Math.round(tot.ingreso) },
        { Métrica: 'Costo total', Valor: Math.round(costoTotal) },
        { Métrica: 'Ganancia', Valor: Math.round(gananciaTotal) },
        { Métrica: 'Margen', Valor: pct(margen) },
        { Métrica: 'Paquetes', Valor: tot.paquetes },
        { Métrica: '% Dobles', Valor: pct(tot.pctDobles) },
        { Métrica: 'Claims', Valor: numClaims },
      ] },
      ...(filasCiudades.length ? [{ nombre: 'Ciudades', rows: filasCiudades }] : []),
      ...(rc.ganancia.length ? [{ nombre: 'Choferes', rows: rc.ganancia.map((p) => ({ Chofer: p.nombre, Ingreso: Math.round(p.ingreso), Ganancia: Math.round(p.ganancia) })) }] : []),
    ])
  const descargarPDF = () =>
    exportarPDF(nombreArch, 'Resumen del Dashboard', inv?.semana || '', [
      { titulo: 'Métricas del periodo', head: ['Métrica', 'Valor'], body: [
        ['Ingreso total', money(tot.ingreso)],
        ['Costo total', money(costoTotal)],
        ['Ganancia', money(gananciaTotal)],
        ['Margen', pct(margen)],
        ['Paquetes', num(tot.paquetes)],
        ['% Dobles', pct(tot.pctDobles)],
        ['Claims', num(numClaims)],
      ] },
      ...(comparativoCiudades.length ? [{ titulo: 'Por ciudad', head: ['Ciudad', 'Paquetes', 'Ingreso', 'Ganancia', 'Claims'],
        body: [...comparativoCiudades].sort((a, b) => b.ingreso - a.ingreso).map((c) => [c.ciudad, num(c.paquetes), money(c.ingreso), money(c.ganancia), num(c.claims)]) }] : []),
    ])

  // Mostrar onboarding solo a empresas nuevas (sin flag y sin facturas) o si se
  // reabrió explícitamente desde "primeros pasos" (onboardingCompleto === false).
  // Nunca a empresas que ya operan (no molesta a las existentes).
  const onbAbierto = !!ajustes && (ajustes.onboardingCompleto === false || (ajustes.onboardingCompleto === undefined && invoices.length === 0))

  return (
    <div>
      <PageTitle right={
        inv && !cargando && (
          <>
            <Boton variant="ghost" onClick={descargarExcel}><FileSpreadsheet size={16} strokeWidth={1.8} /> Excel</Boton>
            <Boton variant="gold" onClick={descargarPDF}><FileText size={16} strokeWidth={1.8} /> PDF</Boton>
          </>
        )
      }>Dashboard</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : onbAbierto && invoices.length === 0 ? (
        /* Empresa nueva / vacía: pantalla de bienvenida y guía. */
        <Onboarding />
      ) : (
        <>
          {onbAbierto && <Onboarding />}
          <RecomendacionesJarvis />
          {alertas.length > 0 && (
            <Aviso tipo="warn">
              <span className="inline-flex items-center gap-1.5"><AlertTriangle size={15} strokeWidth={1.8} /> Gofo cambió el precio (±{pct(UMBRAL_CAMBIO_PRECIO, 0)}) en {alertas.length} ruta(s) vs la semana anterior:</span>
              <ul className="mt-2 list-disc pl-5">
                {alertas.slice(0, 6).map((a) => (
                  <li key={a.ruta}><b>{a.ruta}</b> ({a.nombreCiudad}): ${a.antesLb.toFixed(3)}/lb → ${a.ahoraLb.toFixed(3)}/lb ({a.cambioLb >= 0 ? '+' : ''}{pct(a.cambioLb)})</li>
                ))}
                {alertas.length > 6 && <li>…y {alertas.length - 6} más.</li>}
              </ul>
            </Aviso>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <KPI label="Ingreso total" value={money(tot.ingreso)} icon={DollarSign} accent="green" trend={estPrev && variacion(est.ingreso, estPrev.ingreso)} onClick={() => irA('/financiero')} />
            <KPI label="Costo total" value={money(costoTotal)} icon={Receipt} accent="navy" trend={estPrev && variacion(est.costo, estPrev.costo)} onClick={() => irA('/pagos')} />
            <KPI label="Ganancia" value={money(gananciaTotal)} icon={TrendingUp} accent="gold" trend={estPrev && variacion(est.ganancia, estPrev.ganancia)} onClick={() => irA('/financiero')} />
            <KPI label="Margen" value={pct(margen)} icon={Target} accent="blue" onClick={() => irA('/financiero')} />
            <KPI label="Paquetes" value={num(tot.paquetes)} icon={Package} accent="slate" trend={estPrev && variacion(est.paquetes, estPrev.paquetes)} onClick={() => irA('/performance')} />
            <KPI label="% Dobles" value={pct(tot.pctDobles)} icon={Repeat} accent="gold" onClick={() => irA('/performance')} />
            <KPI label="Claims" value={num(numClaims)} icon={AlertTriangle} accent="red" trend={estPrev && variacion(est.claims, estPrev.claims)} onClick={() => irA('/claims')} />
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
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ClickWrap onClick={() => irA('/financiero')} titulo="Ver detalle financiero">
                  <Verificacion v={inv.verificacion} compacto />
                </ClickWrap>
                <ClickWrap onClick={() => irA('/financiero')} titulo="Ver detalle financiero">
                  <GananciaReal g={gReal} ciudadLabel={selectedCity === TODAS ? '' : nombreCiudadDe(inv, selectedCity)} claims={claimEco} />
                </ClickWrap>
              </div>

              <ClickWrap onClick={() => irA('/claims')} titulo="Ver claims">
                <PanelClaims claims={porCiudad(claims, selectedCity)} inv={inv} compacto />
              </ClickWrap>

              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <GaugeCard title="Margen de ganancia" value={margen} color="#c9a24b" />
                <GaugeCard title="% de dobles" value={tot.pctDobles} color="#3d5a80" />
                <GaugeCard title="Calidad (entregas sin claim)" value={calidad} color="#4a9c8c" nota={`${num(numClaims)} claims de ${num(tot.paquetes)} paquetes`} />
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
                  series={[{ key: 'Individuales', label: 'Individuales', color: '#3d5a80' }, { key: 'Dobles', label: 'Dobles', color: '#c9a24b' }]} />
                {ingresoPorCiudad.length > 1 && <DonutCard title="Ingreso por ciudad" data={ingresoPorCiudad} fmt={money} />}
                <BarCard title="Claims por ruta" data={claimsPorRuta} color="#c47f5a" fmt={num} />
              </div>

              {selectedCity === TODAS && (
                <div className="mb-4">
                  <RankingCiudades compacto />
                </div>
              )}

              {selectedCity === TODAS && comparativoCiudades.length > 1 && (
                <Card className="mb-4 p-4">
                  <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Comparativo entre ciudades</h3>
                  <p className="mb-3 text-xs text-slate-400">Haz clic en una ciudad para filtrar el financiero por ella.</p>
                  <Tabla
                    columns={[
                      { key: 'ciudad', label: 'Ciudad' },
                      { key: 'paquetes', label: 'Paquetes', align: 'right' },
                      { key: 'ingreso', label: 'Ingreso', align: 'right' },
                      { key: 'ganancia', label: 'Ganancia', align: 'right' },
                      { key: 'claims', label: 'Claims', align: 'right' },
                    ]}
                    rows={[...comparativoCiudades].sort((a, b) => b.ingreso - a.ingreso).map((c) => ({ ...c, _key: c.ciudad }))}
                    onRowClick={(row) => irA('/financiero', row.code)}
                    renderCell={(row, key) => (['ingreso', 'ganancia'].includes(key) ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
                  />
                </Card>
              )}

              <div className="mb-4">
                <RankingCalificacion compacto limite={5} />
              </div>

              <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Rankings de choferes</h2>
              <p className="-mt-2 mb-3 text-xs text-slate-400">Haz clic en un chofer para ver su detalle en Performance.</p>
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <RankWidget title="Por productividad (ingreso)" data={rankProd} lista={rc.productividad} fmt={money} valor={(p) => p.ingreso} onPick={irAChofer} />
                <RankWidget title="Por ganancia" data={rankGan} lista={rc.ganancia} fmt={money} valor={(p) => p.ganancia} marcaSinTarifa onPick={irAChofer} />
                <RankWidget title="Por calidad (menos claims)" data={rankCal} lista={rc.calidad} fmt={num} valor={(p) => p.claimsTotales} onPick={irAChofer} />
              </div>

              <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Rankings de rutas</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MiniLista titulo="Más reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio="Ninguna ruta con claims." onPick={() => irA('/performance')} />
                <MiniLista titulo="Cero reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 8)} render={(r) => r.ruta} vacio="Todas tienen algún claim." onPick={() => irA('/performance')} />
                <MiniLista titulo="Más ingreso" rows={rr.porIngreso.slice(0, 5)} render={(r) => `${r.ruta} — ${money(r.ingreso)}`} onPick={() => irA('/performance')} />
                <MiniLista titulo="Mejor $/lb" rows={rr.porPrecioLb.slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} onPick={() => irA('/performance')} />
              </div>

              {porCiudad(claims, selectedCity).length > 0 && (
                <>
                  <h2 className="mb-1 mt-6 text-xl font-bold text-brand-navy dark:text-slate-100">Claims por tipo</h2>
                  <p className="mb-3 text-xs text-slate-400">Choferes con más claims por tipo. Haz clic para ver su detalle.</p>
                  <RankingClaimsTipo claims={porCiudad(claims, selectedCity)} compacto />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// Envoltura clicable con elevación al hacer hover (estilo Mercury).
function ClickWrap({ onClick, titulo, children }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={titulo}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="cursor-pointer rounded-2xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-cardhover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
    >
      {children}
    </div>
  )
}

function RankWidget({ title, data, lista, fmt, valor, marcaSinTarifa, onPick }) {
  const mejor = lista[0]
  const peor = lista[lista.length - 1]
  return (
    <Widget title={title}>
      <BarCardInline data={data} fmt={fmt} onPick={onPick} />
      {mejor && (
        <button onClick={() => onPick?.(mejor.nombre)} className="mt-2 block w-full text-left text-xs hover:underline">
          <Badge color="green">Mejor</Badge> {mejor?.nombre} · {fmt(valor(mejor) || 0)}
          {marcaSinTarifa && mejor?.sinTarifa ? ' (sin tarifa)' : ''}
        </button>
      )}
      {peor && lista.length > 1 && (
        <button onClick={() => onPick?.(peor.nombre)} className="mt-1 block w-full text-left text-xs hover:underline">
          <Badge color="red">Peor</Badge> {peor?.nombre} · {fmt(valor(peor) || 0)}
        </button>
      )}
    </Widget>
  )
}

function BarCardInline({ data, fmt, onPick }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: t.axis }} tickFormatter={fmt} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: t.axis }} width={92} />
        <Tooltip formatter={(v) => fmt(v)} {...t.tooltip} cursor={{ fill: t.grid, opacity: 0.4 }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} className={onPick ? 'cursor-pointer' : ''} onClick={(d) => onPick?.(d?.name)}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function MiniLista({ titulo, rows, render, vacio, onPick }) {
  return (
    <Widget title={titulo}>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">{vacio || 'Sin datos.'}</div>
      ) : (
        <ol className="m-0 list-decimal pl-5 text-sm leading-8">
          {rows.map((r, i) => (
            <li key={r.ruta || i}>
              {onPick ? (
                <button onClick={() => onPick(r)} className="text-left hover:underline">{render(r)}</button>
              ) : render(r)}
            </li>
          ))}
        </ol>
      )}
    </Widget>
  )
}
