import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Route as RouteIcon, Search, TrendingUp, TrendingDown, FileSpreadsheet, FileText } from 'lucide-react'
import { useData } from '../DataContext'
import { rutasConGanancia } from '../utils/calc'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { Card, PageTitle, Input, Boton, Badge, Cargando, EstadoVacio } from '../components/ui'

export default function Rutas() {
  const { facturaRango: inv, drivers, selectedCity, cargando } = useData()
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState('ganancia')
  const [asc, setAsc] = useState(false)
  const [busca, setBusca] = useState('')

  const rutas = useMemo(() => rutasConGanancia(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const mejor = useMemo(() => [...rutas].sort((a, b) => b.ganancia - a.ganancia)[0], [rutas])
  const peor = useMemo(() => (rutas.length > 1 ? [...rutas].sort((a, b) => a.ganancia - b.ganancia)[0] : null), [rutas])

  // Nivel de rentabilidad por TERCILES de ganancia (sobre TODAS las rutas, para que el
  // color signifique lo mismo aunque busques): tercio superior = verde (más dejan),
  // medio = amarillo, inferior = rojo. Cualquier ruta en pérdida (ganancia < 0) va roja.
  const nivelPorRuta = useMemo(() => {
    const orden = [...rutas].sort((a, b) => b.ganancia - a.ganancia)
    const n = orden.length
    const m = {}
    orden.forEach((r, i) => {
      let nivel = i < n / 3 ? 'alta' : i < (2 * n) / 3 ? 'media' : 'baja'
      if (r.ganancia < 0) nivel = 'baja'
      m[r.ruta] = nivel
    })
    return m
  }, [rutas])
  const NIVEL = {
    alta: { borde: 'border-l-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', punto: 'bg-emerald-500' },
    media: { borde: 'border-l-amber-400', texto: 'text-amber-600 dark:text-amber-400', punto: 'bg-amber-400' },
    baja: { borde: 'border-l-rose-500', texto: 'text-rose-600 dark:text-rose-400', punto: 'bg-rose-500' },
  }

  const filtradas = rutas.filter((r) => r.ruta.toLowerCase().includes(busca.trim().toLowerCase()))
  const rows = [...filtradas].sort((a, b) => {
    const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })
  const cambiar = (k) => { if (sortKey === k) setAsc((v) => !v); else { setSortKey(k); setAsc(false) } }
  const flecha = (k) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  // Exportaciones (respetan el orden y la búsqueda actuales: exportan lo que se ve).
  const nombreExp = `rutas_${(selectedCity !== 'todas' ? selectedCity : '') || inv?.semana || 'periodo'}`.replace(/[^\w-]+/g, '_')
  const exportarE = () =>
    exportarExcel(nombreExp, [{ nombre: 'Rutas', rows: rows.map((r) => ({
      Ruta: r.ruta, Ciudad: r.nombreCiudad, Paquetes: r.paquetes, Individuales: r.individuales, Dobles: r.dobles,
      Ingreso: Math.round(r.ingreso), '$/paquete': Number((r.precioPorPaquete || 0).toFixed(2)), '$/lb': Number((r.precioPorLb || 0).toFixed(3)),
      'Costo choferes': Math.round(r.costoChoferes), Ganancia: Math.round(r.ganancia), Claims: r.numClaims || 0,
      'Calidad (%)': r.calidad != null ? Number((r.calidad * 100).toFixed(1)) : '',
    })) }])
  const exportarP = () =>
    exportarPDF(nombreExp, 'Rutas', inv?.semana || '', [{
      titulo: `Rutas (${rows.length})`,
      head: ['Ruta', 'Ciudad', 'Paq.', 'Ind.', 'Dobles', 'Ingreso', '$/paq', '$/lb', 'Costo chof.', 'Ganancia', 'Claims', 'Calidad'],
      body: rows.map((r) => [r.ruta, r.nombreCiudad, num(r.paquetes), num(r.individuales), num(r.dobles), money(r.ingreso), money(r.precioPorPaquete), `$${(r.precioPorLb || 0).toFixed(3)}`, money(r.costoChoferes), money(r.ganancia), num(r.numClaims || 0), pct(r.calidad, 1)]),
    }])

  const cols = [
    { k: 'ruta', label: 'Ruta', txt: true },
    { k: 'paquetes', label: 'Paquetes' },
    { k: 'individuales', label: 'Ind.' },
    { k: 'dobles', label: 'Dobles' },
    { k: 'ingreso', label: 'Ingreso' },
    { k: 'precioPorPaquete', label: '$/paq' },
    { k: 'precioPorLb', label: '$/lb' },
    { k: 'costoChoferes', label: 'Costo choferes' },
    { k: 'ganancia', label: 'Ganancia' },
    { k: 'numClaims', label: 'Claims' },
    { k: 'calidad', label: 'Calidad' },
  ]

  return (
    <div>
      <PageTitle>Rutas</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando rutas…" />
      ) : !inv ? (
        <EstadoVacio titulo="Sin datos en este rango" texto="No hay facturas en el rango seleccionado para analizar rutas." />
      ) : (
        <>
          {(mejor || peor) && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mejor && (
                <Card className="flex items-center gap-3 border-l-4 border-l-emerald-500 p-4">
                  <TrendingUp size={22} strokeWidth={1.8} className="text-emerald-500" />
                  <div><div className="text-xs text-slate-400">Ruta más rentable</div><div className="font-bold text-brand-navy dark:text-slate-100">{mejor.ruta} · {money(mejor.ganancia)}</div></div>
                </Card>
              )}
              {peor && (
                <Card className="flex items-center gap-3 border-l-4 border-l-rose-500 p-4">
                  <TrendingDown size={22} strokeWidth={1.8} className="text-rose-500" />
                  <div><div className="text-xs text-slate-400">Ruta menos rentable</div><div className="font-bold text-brand-navy dark:text-slate-100">{peor.ruta} · {money(peor.ganancia)}</div></div>
                </Card>
              )}
            </div>
          )}

          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="w-56 pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ruta…" />
              </div>
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{rows.length} ruta(s)</span>
              <Boton variant="ghost" onClick={exportarE} disabled={rows.length === 0} className="px-3 py-1.5 text-xs"><FileSpreadsheet size={15} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={exportarP} disabled={rows.length === 0} className="px-3 py-1.5 text-xs"><FileText size={15} strokeWidth={1.8} /> PDF</Boton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Ordenar:</span>
              {[
                { k: 'ganancia', asc: false, l: 'Mayor ganancia' },
                { k: 'ganancia', asc: true, l: 'Menor ganancia' },
                { k: 'paquetes', asc: false, l: 'Mayor volumen' },
                { k: 'paquetes', asc: true, l: 'Menor volumen' },
              ].map((o) => {
                const activo = sortKey === o.k && asc === o.asc
                return (
                  <button
                    key={o.l}
                    onClick={() => { setSortKey(o.k); setAsc(o.asc) }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activo ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    {o.l}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-400">Rentabilidad:</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Más rentables</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Intermedias</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Menos rentables / pérdida</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <RouteIcon size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Todas las rutas</h3>
              <span className="ml-auto text-xs text-slate-400">Costo de choferes estimado con la tarifa promedio de su ciudad</span>
            </div>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {cols.map((c) => (
                      <th key={c.k} onClick={() => cambiar(c.k)} className={`cursor-pointer whitespace-nowrap px-2.5 py-2.5 font-semibold ${c.txt ? 'text-left' : 'text-right'}`}>{c.label}{flecha(c.k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const nivel = NIVEL[nivelPorRuta[r.ruta] || 'media']
                    return (
                    <tr key={r.ruta} onClick={() => navigate(`/rutas/${encodeURIComponent(r.ruta)}`)} className={`cursor-pointer border-t border-l-4 border-slate-100 ${nivel.borde} hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30`}>
                      <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${nivel.punto}`} />
                        {r.ruta} <span className="text-xs text-slate-400">{r.nombreCiudad}</span>
                      </td>
                      <td className="px-2.5 py-2 text-right">{num(r.paquetes)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.individuales)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.dobles)}</td>
                      <td className="px-2.5 py-2 text-right">{money(r.ingreso)}</td>
                      <td className="px-2.5 py-2 text-right">{money(r.precioPorPaquete)}</td>
                      <td className="px-2.5 py-2 text-right">${(r.precioPorLb || 0).toFixed(3)}</td>
                      <td className="px-2.5 py-2 text-right text-brand-navy dark:text-slate-200">{money(r.costoChoferes)}</td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${nivel.texto}`}>{money(r.ganancia)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.numClaims || 0)}</td>
                      <td className="px-2.5 py-2 text-right">{pct(r.calidad, 1)}</td>
                    </tr>
                    )
                  })}
                  {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-slate-400">Sin rutas con ese nombre.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">Ganancia = ingreso (lo que paga Gofo) − costo estimado de choferes. En rojo, rutas no rentables. Haz clic en una ruta para ver su detalle e historial.</p>
          </Card>
        </>
      )}
    </div>
  )
}
