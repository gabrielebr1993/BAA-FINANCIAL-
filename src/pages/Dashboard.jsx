import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { TrendingUp, Package, Repeat, AlertTriangle, FileSpreadsheet, FileText, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { useLang } from '../i18n'
import {
  calcularPagos, rankingsChoferes, rankingsRutas, alertasCambioPrecio,
  porCiudad, totalesFiltrados, resumenEstimado, variacion, gananciaRealDe, economiaClaims, nombreCiudadDe, contarClaimsValidos, claimsDeCiudad, TODAS,
} from '../utils/calc'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { money, num, pct } from '../utils/format'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { PageTitle, Tabla, Aviso, Badge, Cargando, EstadoVacio, Card, Boton } from '../components/ui'
import '../styles/cloudmotion.css'
import RecomendacionesJarvis from '../components/RecomendacionesJarvis'
import { BarCard, StackedBarCard, TrendCard, Widget, useChartTheme, PALETTE } from '../components/charts'
import Verificacion from '../components/Verificacion'
import GananciaReal from '../components/GananciaReal'
import PanelClaims from '../components/PanelClaims'
import RankingClaimsTipo from '../components/RankingClaimsTipo'
import RankingCiudades from '../components/RankingCiudades'
import RankingCalificacion from '../components/RankingCalificacion'
import Onboarding from '../components/Onboarding'
import { conCarrier } from '../utils/carrierTexto'

export default function Dashboard() {
  const { facturaRango: inv, invoicesRango, numSemanas, invoices, claims, drivers, managers, ajustes, ajustesPorChofer, selectedCity, setSelectedCity, verificacionCiudad, vista, cargando } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const { t } = useLang()
  // Solo owner/admin/superadmin ven la info financiera de Gofo (descuentos). Al manager se
  // le oculta el panel "Ganancia por claims" (muestra "Lo que Gofo te descontó").
  const verGofo = esSuperAdmin || perfil?.role === 'owner' || perfil?.role === 'admin'
  const navigate = useNavigate()
  // Ojo: oculta las cifras de dinero (ingreso, costo, ganancia, margen) en pantalla.
  const [verDinero, setVerDinero] = useState(true)
  const OCULTO = '••••••'
  const fD = (v) => (verDinero ? money(v) : OCULTO)
  const fP = (v) => (verDinero ? pct(v) : OCULTO)
  // Navega a una sección y, opcionalmente, preselecciona la ciudad de destino.
  const irA = (ruta, ciudad) => { if (ciudad !== undefined) setSelectedCity(ciudad); navigate(ruta) }
  // Navega al perfil completo de un chofer.
  const irAChofer = (nombre) => { if (nombre) navigate(`/choferes/${encodeURIComponent(nombre)}`) }
  const gReal = useMemo(() => gananciaRealDe(inv, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer), [inv, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer])
  const esRango = !!inv?.esRango
  const variasSemanas = numSemanas > 1

  const rc = useMemo(() => rankingsChoferes(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])
  const rr = useMemo(() => rankingsRutas(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const tot = useMemo(() => totalesFiltrados(inv, selectedCity), [inv, selectedCity])
  const pagos = useMemo(() => calcularPagos(inv, claims, drivers, selectedCity, ajustesPorChofer), [inv, claims, drivers, selectedCity, ajustesPorChofer])
  const claimEco = useMemo(() => economiaClaims(claimsDeCiudad(claims, selectedCity, inv), inv), [claims, selectedCity, inv])

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
  const claimsCiudad = useMemo(() => claimsDeCiudad(claims, selectedCity, inv), [claims, selectedCity, inv])
  const numClaims = useMemo(() => contarClaimsValidos(claimsCiudad), [claimsCiudad])
  const calidad = tot.paquetes > 0 ? 1 - numClaims / tot.paquetes : 1

  const ciudades = porCiudad(inv?.resumenCiudades || [], selectedCity)
  const stackedCiudad = ciudades.map((c) => ({ name: nombreCiudadDe(inv, c.ubicacion), Individuales: c.individuales, Dobles: c.dobles }))
  const rutasTop = [...porCiudad(inv?.resumenRutas || [], selectedCity)].sort((a, b) => b.ingreso - a.ingreso).slice(0, 10)
  const ingresoPorRuta = rutasTop.map((r) => ({ name: r.ruta, valor: Math.round(r.ingreso) }))
  const claimsPorRuta = [...rr.porClaims].filter((r) => (r.numClaims || 0) > 0).slice(0, 12).map((r) => ({ name: r.ruta, valor: r.numClaims }))

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
        { Métrica: 'Dobles', Valor: tot.dobles },
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
        ['Dobles', num(tot.dobles)],
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
      {/* Cloud Motion ahora vive en Layout (todas las páginas del módulo). */}
      <PageTitle right={
        inv && !cargando && (
          <>
            <Boton variant="ghost" onClick={() => setVerDinero((v) => !v)} title={verDinero ? t('Ocultar montos ($)') : t('Mostrar montos ($)')}>{verDinero ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />} {verDinero ? t('Ocultar $') : t('Ver $')}</Boton>
            <Boton variant="ghost" onClick={descargarExcel}><FileSpreadsheet size={16} strokeWidth={1.8} /> Excel</Boton>
            <Boton variant="gold" onClick={descargarPDF}><FileText size={16} strokeWidth={1.8} /> PDF</Boton>
          </>
        )
      }>Dashboard</PageTitle>

      {cargando ? (
        <Cargando texto={t('Cargando datos…')} />
      ) : onbAbierto && invoices.length === 0 ? (
        /* Empresa nueva / vacía: pantalla de bienvenida y guía. */
        <Onboarding />
      ) : (
        <>
          {onbAbierto && <Onboarding />}
          {/* Recomendaciones: solo si la ciudad seleccionada tiene datos (evita mostrar
              choferes de otra ciudad cuando estás en una ciudad vacía). */}
          {/* Resumen principal: la GANANCIA manda (tarjeta navy grande), con
              ingreso/costo/margen dentro y una fila de chips para volumen y calidad.
              En iPhone ocupa una sola pantalla; en web queda a la izquierda. */}
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
            <ClickWrap className="h-full" onClick={() => irA('/financiero')} titulo={t('Ver detalle financiero')}>
              <div className="mp-in relative flex h-full flex-col justify-center overflow-hidden rounded-card bg-brand-navy p-5 text-white shadow-card sm:p-6">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300"><TrendingUp size={14} strokeWidth={2} /> {t('Ganancia')}</div>
                <div className="mt-1 font-display text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-brand-gold sm:text-5xl">{fD(gananciaTotal)}</div>
                <Tendencia v={estPrev && variacion(est.ganancia, estPrev.ganancia)} claro texto={t('vs semana anterior')} />
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
                  <MiniDato label={t('Ingreso total')} valor={fD(tot.ingreso)} trend={estPrev && variacion(est.ingreso, estPrev.ingreso)} />
                  <MiniDato label={t('Costo total')} valor={fD(costoTotal)} trend={estPrev && variacion(est.costo, estPrev.costo)} invertido sub={(gReal.totalPrestamo > 0 || gReal.totalBono > 0) ? `ajustes: ${gReal.totalPrestamo > 0 ? `−${money(gReal.totalPrestamo)}` : ''}${gReal.totalPrestamo > 0 && gReal.totalBono > 0 ? ' · ' : ''}${gReal.totalBono > 0 ? `+${money(gReal.totalBono)}` : ''}` : undefined} />
                  <MiniDato label={t('Margen')} valor={fP(margen)} />
                </div>
              </div>
            </ClickWrap>
            <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-1">
              <Chip icon={Package} label={t('Paquetes')} valor={num(tot.paquetes)} trend={estPrev && variacion(est.paquetes, estPrev.paquetes)} onClick={() => irA('/performance')} />
              <Chip icon={Repeat} label={t('% Dobles')} valor={pct(tot.pctDobles)} sub={`${num(tot.dobles)} ${t('dobles')}`} onClick={() => irA('/performance')} />
              <Chip icon={AlertTriangle} label={t('Claims')} valor={num(numClaims)} sub={`${t('Calidad')} ${pct(calidad)}`} trend={estPrev && variacion(est.claims, estPrev.claims)} invertido onClick={() => irA('/claims')} alerta />
            </div>
          </div>

          {alertas.length > 0 && (
            <Aviso tipo="warn">
              <span className="inline-flex items-center gap-1.5"><AlertTriangle size={15} strokeWidth={1.8} /> {conCarrier('Gofo cambió el precio')} (±{pct(UMBRAL_CAMBIO_PRECIO, 0)}) en {alertas.length} ruta(s) vs la semana anterior:</span>
              <ul className="mt-2 list-disc pl-5">
                {alertas.slice(0, 6).map((a) => (
                  <li key={a.ruta}><b>{a.ruta}</b> ({a.nombreCiudad}): ${a.antesLb.toFixed(3)}/lb → ${a.ahoraLb.toFixed(3)}/lb ({a.cambioLb >= 0 ? '+' : ''}{pct(a.cambioLb)})</li>
                ))}
                {alertas.length > 6 && <li>…y {alertas.length - 6} más.</li>}
              </ul>
            </Aviso>
          )}

          {!inv ? (
            <EstadoVacio titulo={t('Sin datos en este rango')} texto={t('No hay facturas en el rango de fechas seleccionado. Cambia el rango o carga una factura.')} />
          ) : porSemana ? (
            /* -------- VISTA POR SEMANA -------- */
            <>
              <div className="mb-4">
                <TrendCard
                  title={t('Evolución semana a semana')}
                  subtitle={t('Ingreso, costo y ganancia por semana')}
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
                <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Detalle por semana')}</h3>
                <Tabla
                  columns={[
                    { key: 'name', label: t('Semana') },
                    { key: 'ingreso', label: t('Ingreso'), align: 'right' },
                    { key: 'costo', label: t('Costo'), align: 'right' },
                    { key: 'ganancia', label: t('Ganancia'), align: 'right' },
                    { key: 'paquetes', label: t('Paquetes'), align: 'right' },
                    { key: 'claims', label: t('Claims'), align: 'right' },
                  ]}
                  rows={[...trendData].reverse().map((r, i) => ({ ...r, _key: i }))}
                  renderCell={(row, key) => (['ingreso', 'costo', 'ganancia'].includes(key) ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
                />
              </Card>
            </>
          ) : (
            /* -------- VISTA COMBINADA -------- */
            <>
              {/* Ganancia: desglose de Gofo + ganancia real (lado a lado en web). */}
              <Seccion titulo={t('Ganancia real')} abierta>
                <div className="grid grid-cols-1 gap-4 fold:grid-cols-2">
                  {verificacionCiudad ? (
                    <ClickWrap onClick={() => irA('/financiero')} titulo={t('Ver detalle financiero')}>
                      <Verificacion v={verificacionCiudad} compacto />
                    </ClickWrap>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                      {conCarrier(t('No hay desglose de pago de Gofo para esta ciudad en este período.'))}
                    </div>
                  )}
                  <ClickWrap onClick={() => irA('/financiero')} titulo={t('Ver detalle financiero')}>
                    <GananciaReal g={gReal} ciudadLabel={selectedCity === TODAS ? '' : nombreCiudadDe(inv, selectedCity)} claims={claimEco} oculto={!verDinero} verGofo={verGofo} />
                  </ClickWrap>
                </div>
                {variasSemanas && (
                  <div className="mt-4">
                    <TrendCard title={t('Tendencia semana a semana')} subtitle={t('Ingreso, costo y ganancia por semana')} area data={trendData} fmt={money}
                      series={[{ key: 'ingreso', label: 'Ingreso', color: '#13233f' }, { key: 'costo', label: 'Costo', color: '#c47f5a' }, { key: 'ganancia', label: 'Ganancia', color: '#c9a24b' }]} />
                  </div>
                )}
              </Seccion>

              {/* Comparativo entre ciudades: UNA vista por dato (antes había gráficas repetidas). */}
              <Seccion titulo={t('Comparativo entre ciudades')} abierta>
                <div className="mb-4"><RankingCiudades compacto /></div>
                <div className="grid grid-cols-1 gap-4 fold:grid-cols-2">
                  <BarCard title={t('Ingreso por ruta (top 10)')} data={ingresoPorRuta} color="#13233f" fmt={money} />
                  <StackedBarCard title={t('Individuales vs dobles por ciudad')} data={stackedCiudad} fmt={num}
                    series={[{ key: 'Individuales', label: 'Individuales', color: '#3d5a80' }, { key: 'Dobles', label: 'Dobles', color: '#c9a24b' }]} />
                </div>
              </Seccion>

              {/* Claims: todo lo de calidad junto, plegado por defecto en el móvil. */}
              {verGofo && (
                <Seccion titulo={t('Claims')} resumen={`${num(numClaims)} · ${t('Calidad (entregas sin claim)')} ${pct(calidad)}`}>
                  <PanelClaims claims={claimsCiudad} inv={inv} compacto />
                  <div className="grid grid-cols-1 gap-4 fold:grid-cols-2">
                    <BarCard title={t('Claims por ruta')} data={claimsPorRuta} color="#c47f5a" fmt={num} />
                    {claimsCiudad.length > 0 && (
                      <Widget title={t('Claims por tipo')} subtitle={t('Choferes con más claims por tipo. Haz clic para ver su detalle.')}>
                        <RankingClaimsTipo claims={claimsCiudad} compacto />
                      </Widget>
                    )}
                  </div>
                </Seccion>
              )}

              {/* Rankings de choferes y de rutas (cada uno en su sección). */}
              <Seccion titulo={t('Rankings de choferes')}>
                <div className="mb-4"><RankingCalificacion compacto limite={5} /></div>
                <div className="mb-4 grid grid-cols-1 gap-4 fold:grid-cols-2 xl:grid-cols-3">
                  <RankWidget title={t('Por productividad (ingreso)')} data={rankProd} lista={rc.productividad} fmt={money} valor={(p) => p.ingreso} onPick={irAChofer} />
                  <RankWidget title={t('Por ganancia')} data={rankGan} lista={rc.ganancia} fmt={money} valor={(p) => p.ganancia} marcaSinTarifa onPick={irAChofer} />
                  <RankWidget title={t('Por calidad (menos claims)')} data={rankCal} lista={rc.calidad} fmt={num} valor={(p) => p.claimsTotales} onPick={irAChofer} />
                </div>
              </Seccion>

              <Seccion titulo={t('Rankings de rutas')}>
                <div className="grid grid-cols-1 gap-4 fold:grid-cols-2 lg:grid-cols-4">
                  <MiniLista titulo={t('Más reclamos')} rows={rr.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio={t('Ninguna ruta con claims.')} onPick={() => irA('/performance')} />
                  <MiniLista titulo={t('Cero reclamos')} rows={rr.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 8)} render={(r) => r.ruta} vacio={t('Todas tienen algún claim.')} onPick={() => irA('/performance')} />
                  <MiniLista titulo={t('Más ingreso')} rows={rr.porIngreso.slice(0, 5)} render={(r) => `${r.ruta} — ${money(r.ingreso)}`} onPick={() => irA('/performance')} />
                  <MiniLista titulo={t('Mejor $/lb')} rows={rr.porPrecioLb.slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} onPick={() => irA('/performance')} />
                </div>
              </Seccion>

              {/* Recomendaciones de JARVIS: al final y plegadas (antes tapaban los números). */}
              {(selectedCity === TODAS || est.paquetes > 0) && (
                <Seccion titulo={t('Recomendaciones de JARVIS')}>
                  <RecomendacionesJarvis />
                </Seccion>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// Envoltura clicable con elevación al hacer hover (estilo Mercury).
function ClickWrap({ onClick, titulo, children, className = '' }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={titulo}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`cursor-pointer rounded-2xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-cardhover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold ${className}`}
    >
      {children}
    </div>
  )
}

function RankWidget({ title, data, lista, fmt, valor, marcaSinTarifa, onPick }) {
  const { t } = useLang()
  const mejor = lista[0]
  const peor = lista[lista.length - 1]
  return (
    <Widget title={title}>
      <BarCardInline data={data} fmt={fmt} onPick={onPick} />
      {mejor && (
        <button onClick={() => onPick?.(mejor.nombre)} className="mt-2 block w-full text-left text-xs hover:underline">
          <Badge color="green">{t('Mejor')}</Badge> {mejor?.nombre} · {fmt(valor(mejor) || 0)}
          {marcaSinTarifa && mejor?.sinTarifa ? ' (sin tarifa)' : ''}
        </button>
      )}
      {peor && lista.length > 1 && (
        <button onClick={() => onPick?.(peor.nombre)} className="mt-1 block w-full text-left text-xs hover:underline">
          <Badge color="red">{t('Peor')}</Badge> {peor?.nombre} · {fmt(valor(peor) || 0)}
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
  const { t } = useLang()
  return (
    <Widget title={titulo}>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">{vacio || t('Sin datos.')}</div>
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

// Sección plegable (acordeón nativo <details>): en el iPhone deja el dashboard en
// pocas pantallas; en web (lg+) se ve con el mismo título. `abierta` = abierta al cargar.
function Seccion({ titulo, resumen, abierta = false, children }) {
  return (
    <details open={abierta} className="group mb-4 rounded-card border border-slate-200/80 bg-white/70 shadow-card dark:border-slate-700/60 dark:bg-surface-dark-card/60">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block h-5 w-1 shrink-0 rounded-full bg-brand-gold" />
        <span className="text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</span>
        {resumen && <span className="truncate text-xs text-slate-400">{resumen}</span>}
        <ChevronDown size={18} strokeWidth={2} className="ml-auto shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  )
}

// Tendencia ▲▼ vs la semana anterior. `invertido`: subir es malo (costo, claims).
function Tendencia({ v, claro, texto, invertido }) {
  if (v == null || !isFinite(v)) return null
  const bueno = invertido ? v <= 0 : v >= 0
  const color = claro ? (bueno ? 'text-emerald-300' : 'text-rose-300') : (bueno ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
  return (
    <div className={`mt-2 text-xs font-semibold ${color}`}>
      {v >= 0 ? '▲' : '▼'} {Math.abs(v * 100).toFixed(1)}%{texto ? <span className={`ml-1 font-medium ${claro ? 'text-slate-300' : 'text-slate-400'}`}>{texto}</span> : null}
    </div>
  )
}

// Dato pequeño dentro de la tarjeta navy de ganancia.
function MiniDato({ label, valor, trend, invertido, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-[17px] font-bold tabular-nums text-white sm:text-lg">{valor}</div>
      <Tendencia v={trend} claro invertido={invertido} />
      {sub && <div className="mt-0.5 truncate text-[10.5px] text-slate-400">{sub}</div>}
    </div>
  )
}

// Chip de volumen/calidad (Paquetes, % Dobles, Claims). Área táctil ≥ 44px.
function Chip({ icon: Icon, label, valor, sub, trend, invertido, onClick, alerta }) {
  return (
    <button type="button" onClick={onClick} className="mp-in flex min-h-[88px] min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-surface-card p-3 text-left shadow-card transition hover:border-brand-gold/60 hover:shadow-cardhover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold dark:border-slate-700/60 dark:bg-surface-dark-card lg:flex-row lg:items-center lg:gap-3 lg:p-4">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${alerta ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100'}`}><Icon size={16} strokeWidth={1.9} /></span>
      <span className="mt-2 min-w-0 lg:mt-0">
        <span className="block truncate text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block truncate text-lg font-bold tabular-nums text-brand-navy dark:text-slate-100">{valor}</span>
        {sub && <span className="block truncate text-[10.5px] text-slate-400">{sub}</span>}
        <Tendencia v={trend} invertido={invertido} />
      </span>
    </button>
  )
}
