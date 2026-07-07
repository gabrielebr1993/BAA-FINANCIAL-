import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { X, Search, Filter, RotateCcw, TrendingUp, AlertTriangle, Handshake, Wallet, Package, Route, Clock, UserX } from 'lucide-react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { calcularPagos, rankingsRutas, porCiudad, claimsValidos, contarClaimsValidos, costoManagers, etiquetaTipoClaim } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card, PageTitle, Aviso, Badge, Boton, Input, Select, Cargando, EstadoVacio } from '../components/ui'
import { BarCard, DonutCard, Widget } from '../components/charts'
import KpiPro from '../components/KpiPro'
import RankingClaimsTipo from '../components/RankingClaimsTipo'
import RankingCiudades from '../components/RankingCiudades'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

const TH = 'px-2.5 py-2.5 cursor-pointer whitespace-nowrap font-semibold'

export default function Performance() {
  const { facturaRango: selectedInvoice, claims, drivers, managers, invoicesRango, selectedCity, activeCompanyId, cargando } = useData()
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState('ingreso')
  const [asc, setAsc] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  // Chofer preseleccionado desde el Dashboard (?driver=Nombre).
  const driverSel = searchParams.get('driver') || ''
  const limpiarDriver = () => setSearchParams((p) => { const n = new URLSearchParams(p); n.delete('driver'); return n })
  const verPerfil = (nombre) => nombre && navigate(`/choferes/${encodeURIComponent(nombre)}`)

  // ---- filtros locales (se combinan con ciudad/fecha globales) ----
  const [fRuta, setFRuta] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fMin, setFMin] = useState('')
  const [fMax, setFMax] = useState('')
  const [fBusca, setFBusca] = useState('')
  const hayFiltros = fRuta || fTipo || fMin !== '' || fMax !== '' || fBusca
  const limpiarFiltros = () => { setFRuta(''); setFTipo(''); setFMin(''); setFMax(''); setFBusca('') }

  const pagos = useMemo(
    () => calcularPagos(selectedInvoice, claims, drivers, selectedCity).map((p) => ({ ...p, paquetes: p.individuales + p.dobles })),
    [selectedInvoice, claims, drivers, selectedCity]
  )
  const rr = useMemo(() => rankingsRutas(selectedInvoice, drivers, selectedCity), [selectedInvoice, drivers, selectedCity])
  const claimsCiudad = useMemo(() => porCiudad(claims, selectedCity), [claims, selectedCity])

  // opciones de los selectores
  const rutasOpts = useMemo(() => [...new Set(porCiudad(selectedInvoice?.resumenRutas || [], selectedCity).map((r) => r.ruta))].sort(), [selectedInvoice, selectedCity])
  const tiposOpts = useMemo(() => [...new Set(claimsValidos(claimsCiudad).map((c) => (c.claimType || '').trim()).filter(Boolean))].sort(), [claimsCiudad])

  // couriers que tienen algún claim válido del tipo seleccionado
  const couriersConTipo = useMemo(() => {
    if (!fTipo) return null
    return new Set(claimsValidos(claimsCiudad).filter((c) => (c.claimType || '').toLowerCase() === fTipo.toLowerCase()).map((c) => c.courier))
  }, [fTipo, claimsCiudad])

  // claims filtrados por tipo para la sección "Claims por tipo"
  const claimsParaTipo = useMemo(
    () => (fTipo ? claimsCiudad.filter((c) => (c.claimType || '').toLowerCase() === fTipo.toLowerCase()) : claimsCiudad),
    [claimsCiudad, fTipo]
  )

  const ordenados = [...pagos]
    .filter((p) => {
      if (fBusca && !p.nombre.toLowerCase().includes(fBusca.trim().toLowerCase())) return false
      if (fMin !== '' && p.claimsTotales < Number(fMin)) return false
      if (fMax !== '' && p.claimsTotales > Number(fMax)) return false
      if (couriersConTipo && !couriersConTipo.has(p.nombre)) return false
      return true
    })
    .sort((a, b) => {
      const va = a[sortKey] ?? 0
      const vb = b[sortKey] ?? 0
      if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
      return asc ? va - vb : vb - va
    })

  const cambiarOrden = (key) => {
    if (sortKey === key) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(false)
    }
  }

  const cols = [
    { key: 'nombre', label: 'Chofer', txt: true },
    { key: 'nombreCiudad', label: 'Ciudad', txt: true },
    { key: 'paquetes', label: 'Paquetes' },
    { key: 'individuales', label: 'Ind.' },
    { key: 'dobles', label: 'Dobles' },
    { key: 'ingreso', label: 'Ingreso' },
    { key: 'totalPagar', label: 'Pago' },
    { key: 'ganancia', label: 'Ganancia' },
    { key: 'claimsTotales', label: 'Claims' },
    { key: 'descuentoClaims', label: 'Desc. al chofer' },
    { key: 'descontadoGofo', label: 'Descontado Gofo' },
    { key: 'gananciaClaims', label: 'Ganancia claims' },
  ]

  const conClaims = [...pagos].filter((p) => p.claimsTotales > 0).sort((a, b) => b.claimsTotales - a.claimsTotales)
  const ceroClaims = pagos.filter((p) => p.claimsTotales === 0)

  // filtro de ruta para los rankings de rutas
  const filtrarRuta = (arr) => (fRuta ? arr.filter((r) => r.ruta === fRuta) : arr)
  const rrF = { porClaims: filtrarRuta(rr.porClaims), porIngreso: filtrarRuta(rr.porIngreso), porPrecioLb: filtrarRuta(rr.porPrecioLb) }

  const topProd = [...pagos].sort((a, b) => b.ingreso - a.ingreso).slice(0, 8).map((p) => ({ name: p.nombre, valor: Math.round(p.ingreso) }))
  const topGan = [...pagos].sort((a, b) => b.ganancia - a.ganancia).slice(0, 8).map((p) => ({ name: p.nombre, valor: Math.round(p.ganancia) }))
  const claimsDona = [
    { name: 'Sin claims', valor: ceroClaims.length },
    { name: 'Con claims', valor: conClaims.length },
  ]

  // ---- INDICADORES (sección NUEVA; respeta ciudad + rango globales) ----------
  const avgTar = useMemo(() => {
    const act = (drivers || []).filter((d) => d.activo !== false)
    const indT = act.reduce((a, d) => a + (Number(d.precioIndividual) || 0), 0) / (act.length || 1)
    const dobT = act.reduce((a, d) => a + (Number(d.precioDoble) || 0), 0) / (act.length || 1)
    return { ind: indT, dob: dobT }
  }, [drivers])

  // Serie semana a semana para mini-sparklines y tendencia vs. periodo anterior.
  const serie = useMemo(() => {
    return [...invoicesRango]
      .sort((a, b) => {
        const ta = a.fechaInicio instanceof Date ? a.fechaInicio.getTime() : 0
        const tb = b.fechaInicio instanceof Date ? b.fechaInicio.getTime() : 0
        return ta - tb
      })
      .map((f) => {
        const cl = claims.filter((c) => c.invoiceId === f.id)
        const ps = calcularPagos(f, cl, drivers, selectedCity)
        const paquetes = ps.reduce((a, p) => a + p.individuales + p.dobles, 0)
        const ingreso = ps.reduce((a, p) => a + p.ingreso, 0)
        const nomina = ps.reduce((a, p) => a + p.totalPagar, 0)
        const gananciaClaims = ps.reduce((a, p) => a + p.gananciaClaims, 0)
        return { ticket: paquetes > 0 ? ingreso / paquetes : 0, nomina, gananciaClaims }
      })
  }, [invoicesRango, claims, drivers, selectedCity])

  const trendDe = (key) => {
    if (serie.length < 2) return null
    const prev = serie[serie.length - 2][key]
    const act = serie[serie.length - 1][key]
    if (prev == null || prev === 0) return null
    return (act - prev) / Math.abs(prev)
  }

  const indic = useMemo(() => {
    const conTarifa = pagos.filter((p) => !p.sinTarifa)
    const masRentable = [...(conTarifa.length ? conTarifa : pagos)].sort((a, b) => b.ganancia - a.ganancia)[0] || null
    const masProblematico = [...pagos].filter((p) => p.claimsTotales > 0).sort((a, b) => b.claimsTotales - a.claimsTotales)[0] || null
    const gananciaClaims = pagos.reduce((a, p) => a + p.gananciaClaims, 0)
    const nominaChoferes = pagos.reduce((a, p) => a + p.totalPagar, 0)
    const costoMgr = costoManagers(managers, Math.max(1, invoicesRango.length))
    const ingresoBruto = pagos.reduce((a, p) => a + p.ingreso, 0)
    const paquetes = pagos.reduce((a, p) => a + p.individuales + p.dobles, 0)
    const rutasG = porCiudad(selectedInvoice?.resumenRutas || [], selectedCity).map((r) => ({
      ruta: r.ruta,
      ganancia: r.ingreso - (r.individuales * avgTar.ind + r.dobles * avgTar.dob),
    }))
    const rutasOrden = [...rutasG].sort((a, b) => b.ganancia - a.ganancia)
    const rutaTop = rutasOrden[0] || null
    const rutaBottom = rutasOrden.length > 1 ? rutasOrden[rutasOrden.length - 1] : null
    const sinTarifaN = (drivers || []).filter((d) => !(Number(d.precioIndividual) > 0) || !(Number(d.precioDoble) > 0)).length
    const entregaron = new Set(pagos.filter((p) => p.individuales + p.dobles > 0).map((p) => p.nombre))
    const inactivosN = (drivers || []).filter((d) => d.activo !== false && !entregaron.has(d.nombre)).length
    return {
      masRentable, masProblematico, gananciaClaims,
      nominaChoferes, costoMgr, nominaTotal: nominaChoferes + costoMgr,
      ticket: paquetes > 0 ? ingresoBruto / paquetes : 0, paquetes,
      rutaTop, rutaBottom, sinTarifaN, inactivosN,
    }
  }, [pagos, managers, invoicesRango, selectedInvoice, selectedCity, avgTar, drivers])

  // Pagos pendientes (nómina no marcada como pagada) en el rango.
  const [pendientes, setPendientes] = useState({ monto: 0, choferes: 0 })
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!activeCompanyId || invoicesRango.length === 0) { if (vivo) setPendientes({ monto: 0, choferes: 0 }); return }
      const pagadas = new Set()
      await Promise.all(invoicesRango.map((f) =>
        getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', f.id)))
          .then((s) => s.docs.forEach((d) => { const x = d.data(); if (x.estado === 'pagado') pagadas.add(`${x.invoiceId}||${x.driverNombre}`) }))
      ))
      let monto = 0
      const chof = new Set()
      for (const f of invoicesRango) {
        const cl = claims.filter((c) => c.invoiceId === f.id)
        for (const p of calcularPagos(f, cl, drivers, selectedCity)) {
          if (!pagadas.has(`${f.id}||${p.nombre}`)) { monto += p.totalPagar; chof.add(p.nombre) }
        }
      }
      if (vivo) setPendientes({ monto, choferes: chof.size })
    })().catch(() => {})
    return () => { vivo = false }
  }, [activeCompanyId, invoicesRango, claims, drivers, selectedCity])

  return (
    <div>
      <PageTitle right={<><RangeSelector /><CitySelector /></>}>Performance</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : !selectedInvoice ? (
        <EstadoVacio texto="Cuando cargues una factura verás aquí el ranking detallado de choferes y rutas." />
      ) : (
        <>
          <Aviso tipo="info">
            Nota: por ahora la factura solo trae paquetes entregados (no fallidos), por lo que los <b>claims</b> se usan como indicador de problemas. El código queda listo para agregar "fallidos" en el futuro.
          </Aviso>

          {/* ==== Indicadores (sección nueva; respeta ciudad + fechas globales) ==== */}
          <h2 className="mb-2 mt-1 text-xl font-bold text-brand-navy dark:text-slate-100">Indicadores</h2>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiPro
              icon={TrendingUp} accent="gold" label="Chofer más rentable"
              value={indic.masRentable ? indic.masRentable.nombre : '—'}
              sub={indic.masRentable ? `Ganancia ${money(indic.masRentable.ganancia)}` : 'Sin datos'}
              onClick={indic.masRentable ? () => verPerfil(indic.masRentable.nombre) : undefined}
            />
            <KpiPro
              icon={AlertTriangle} accent="red" valueColor="text-rose-600 dark:text-rose-400" label="Chofer más problemático"
              value={indic.masProblematico ? indic.masProblematico.nombre : '—'}
              sub={indic.masProblematico ? `${num(indic.masProblematico.claimsTotales)} claims` : 'Nadie con claims'}
              onClick={indic.masProblematico ? () => verPerfil(indic.masProblematico.nombre) : undefined}
            />
            <KpiPro
              icon={Handshake} accent="green" label="Ganancia por claims"
              value={money(indic.gananciaClaims)}
              valueColor={indic.gananciaClaims >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
              sub="Cobrado a choferes − descontado Gofo"
              spark={serie.map((s) => s.gananciaClaims)} trend={trendDe('gananciaClaims')}
              onClick={() => navigate('/claims')}
            />
            <KpiPro
              icon={Wallet} accent="navy" label="Costo total de nómina"
              value={money(indic.nominaTotal)}
              sub={`Choferes ${money(indic.nominaChoferes)} + managers ${money(indic.costoMgr)}`}
              spark={serie.map((s) => s.nomina)} trend={trendDe('nomina')}
              onClick={() => navigate('/pagos')}
            />
            <KpiPro
              icon={Package} accent="steel" label="Ticket promedio / paquete"
              value={indic.paquetes > 0 ? money(indic.ticket) : '—'}
              sub={`${num(indic.paquetes)} paquetes`}
              spark={serie.map((s) => s.ticket)} trend={trendDe('ticket')}
              onClick={() => navigate('/financiero')}
            />
            <KpiPro
              icon={Route} accent="gold" label="Ruta más / menos rentable"
              value={indic.rutaTop ? indic.rutaTop.ruta : '—'}
              sub={indic.rutaTop ? `${money(indic.rutaTop.ganancia)}${indic.rutaBottom ? ` · peor: ${indic.rutaBottom.ruta} (${money(indic.rutaBottom.ganancia)})` : ''}` : 'Sin rutas'}
              onClick={indic.rutaTop ? () => setFRuta(indic.rutaTop.ruta) : undefined}
            />
            <KpiPro
              icon={Clock} accent="amber" valueColor="text-amber-600 dark:text-amber-400" label="Pagos pendientes"
              value={money(pendientes.monto)}
              sub={`${num(pendientes.choferes)} chofer(es) por pagar`}
              onClick={() => navigate('/pagos')}
            />
            <KpiPro
              icon={UserX} accent="red" label="Sin tarifa / inactivos"
              value={num(indic.sinTarifaN)}
              sub={`sin tarifa · ${num(indic.inactivosN)} sin entregas`}
              onClick={() => navigate('/choferes')}
            />
          </div>

          {/* Barra de filtros combinables */}
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Filter size={14} strokeWidth={2} /> Filtros</div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Ruta</div>
                <Select value={fRuta} onChange={(e) => setFRuta(e.target.value)}>
                  <option value="">Todas</option>
                  {rutasOpts.map((r) => (<option key={r} value={r}>{r}</option>))}
                </Select>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Tipo de claim</div>
                <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                  <option value="">Todos</option>
                  {tiposOpts.map((t) => (<option key={t} value={t}>{etiquetaTipoClaim(t)}</option>))}
                </Select>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Claims ≥</div>
                <Input className="w-20" type="number" min="0" value={fMin} onChange={(e) => setFMin(e.target.value)} placeholder="mín" />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Claims ≤</div>
                <Input className="w-20" type="number" min="0" value={fMax} onChange={(e) => setFMax(e.target.value)} placeholder="máx" />
              </div>
              <div className="relative">
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Buscar chofer</div>
                <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-[30px] text-slate-400" />
                <Input className="w-48 pl-8" value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Nombre…" />
              </div>
              {hayFiltros && (
                <Boton variant="ghost" onClick={limpiarFiltros} className="px-3 py-2 text-xs"><RotateCcw size={14} strokeWidth={2} /> Limpiar filtros</Boton>
              )}
            </div>
          </Card>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BarCard title="Top choferes por ingreso" data={topProd} fmt={money} horizontal height={240} />
            <BarCard title="Top choferes por ganancia" data={topGan} fmt={money} horizontal height={240} />
            <DonutCard title="Calidad: con vs sin claims" data={claimsDona} fmt={num} height={240} />
          </div>

          {driverSel && (
            <Aviso tipo="info" className="flex items-center gap-2">
              <span>Mostrando el detalle de <b>{driverSel}</b>.</span>
              <button onClick={limpiarDriver} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline dark:text-brand-gold">
                <X size={14} strokeWidth={2} /> Ver todos
              </button>
            </Aviso>
          )}

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">
              {driverSel ? `Detalle de ${driverSel}` : 'Tabla completa de choferes (clic en encabezado para ordenar)'}
            </h3>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[1120px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {cols.map((c) => (
                      <th key={c.key} onClick={() => cambiarOrden(c.key)} className={`${TH} ${c.txt ? 'text-left' : 'text-right'}`}>
                        {c.label} {sortKey === c.key ? (asc ? '▲' : '▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(driverSel ? ordenados.filter((p) => p.nombre === driverSel) : ordenados).map((p) => (
                    <tr key={p.nombre} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                      <td className="px-2.5 py-2">
                        <button onClick={() => verPerfil(p.nombre)} className="font-medium text-brand-navy hover:underline dark:text-slate-100">{p.nombre}</button>
                        {p.sinTarifa && <Badge color="red">sin tarifa</Badge>}
                      </td>
                      <td className="px-2.5 py-2">{p.nombreCiudad}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.paquetes)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.individuales)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.dobles)}</td>
                      <td className="px-2.5 py-2 text-right">{money(p.ingreso)}</td>
                      <td className="px-2.5 py-2 text-right">{money(p.totalPagar)}</td>
                      <td className={`px-2.5 py-2 text-right ${p.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(p.ganancia)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.claimsTotales)}</td>
                      <td className="px-2.5 py-2 text-right font-medium text-brand-navy dark:text-slate-200">{money(p.descuentoClaims)}</td>
                      <td className="px-2.5 py-2 text-right text-rose-600 dark:text-rose-400">{money(p.descontadoGofo)}</td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${p.gananciaClaims >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(p.gananciaClaims)}</td>
                    </tr>
                  ))}
                  {ordenados.length === 0 && (
                    <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-slate-400">Ningún chofer con estos filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {ordenados.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Totales de claims ({ordenados.length} chofer{ordenados.length === 1 ? '' : 'es'}):</span>
                <span>Desc. al chofer <b className="text-brand-navy dark:text-slate-100">{money(ordenados.reduce((a, p) => a + p.descuentoClaims, 0))}</b></span>
                <span>Descontado Gofo <b className="text-rose-600 dark:text-rose-400">{money(ordenados.reduce((a, p) => a + p.descontadoGofo, 0))}</b></span>
                <span>Ganancia por claims <b className="text-emerald-600 dark:text-emerald-400">{money(ordenados.reduce((a, p) => a + p.gananciaClaims, 0))}</b></span>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400">“Desc. al chofer” = claims válidos no perdonados × $100. “Descontado Gofo” = lo que Gofo te quitó por esos claims. Ganancia por claims = la diferencia.</p>
          </Card>

          <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Ranking de ciudades</h2>
          <div className="mb-4">
            <RankingCiudades />
          </div>

          <h2 className="mb-3 mt-2 text-xl font-bold text-brand-navy dark:text-slate-100">Claims por tipo{fTipo ? ` · ${etiquetaTipoClaim(fTipo)}` : ''}</h2>
          <div className="mb-4">
            <RankingClaimsTipo claims={claimsParaTipo} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Lista titulo="Mejor productividad" rows={[...pagos].sort((a, b) => b.ingreso - a.ingreso).slice(0, 5)} render={(p) => `${p.nombre} — ${money(p.ingreso)} (${num(p.paquetes)} paq.)`} />
            <Lista titulo="Mejor ganancia" rows={[...pagos].sort((a, b) => b.ganancia - a.ganancia).slice(0, 5)} render={(p) => `${p.nombre} — ${money(p.ganancia)}`} />
            <Lista titulo="Más claims (peor calidad)" rows={conClaims.slice(0, 5)} render={(p) => `${p.nombre} — ${num(p.claimsTotales)} claims`} vacio="Nadie con claims." />
            <Lista titulo="Cero claims" rows={ceroClaims.slice(0, 10)} render={(p) => p.nombre} vacio="Todos tienen algún claim." />
            <Lista titulo="Rutas con más reclamos" rows={rrF.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio="Ninguna con claims." />
            <Lista titulo="Rutas con cero reclamos" rows={rrF.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 10)} render={(r) => r.ruta} vacio="—" />
            <Lista titulo="Rutas más rentables ($/lb)" rows={rrF.porPrecioLb.slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} />
            <Lista titulo="Rutas menos rentables ($/lb)" rows={[...rrF.porPrecioLb].reverse().slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} />
          </div>
        </>
      )}
    </div>
  )
}

function Lista({ titulo, rows, render, vacio }) {
  return (
    <Widget title={titulo}>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">{vacio || 'Sin datos.'}</div>
      ) : (
        <ol className="m-0 list-decimal pl-5 text-sm leading-8">
          {rows.map((r, i) => (
            <li key={r.nombre || r.ruta || i}>{render(r)}</li>
          ))}
        </ol>
      )}
    </Widget>
  )
}
