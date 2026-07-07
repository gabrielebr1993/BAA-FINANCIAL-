import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { X, Search, Filter, RotateCcw } from 'lucide-react'
import { useData } from '../DataContext'
import { calcularPagos, rankingsRutas, porCiudad, claimsValidos, etiquetaTipoClaim } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card, PageTitle, Aviso, Badge, Boton, Input, Select, Cargando, EstadoVacio } from '../components/ui'
import { BarCard, DonutCard, Widget } from '../components/charts'
import RankingClaimsTipo from '../components/RankingClaimsTipo'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

const TH = 'px-2.5 py-2.5 cursor-pointer whitespace-nowrap font-semibold'

export default function Performance() {
  const { facturaRango: selectedInvoice, claims, drivers, selectedCity, cargando } = useData()
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
