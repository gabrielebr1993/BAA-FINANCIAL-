import { useMemo, useState } from 'react'
import { useData } from '../DataContext'
import { calcularPagos, rankingsRutas } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card, PageTitle, Aviso, Badge, Cargando, EstadoVacio } from '../components/ui'
import { BarCard, DonutCard, Widget } from '../components/charts'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

const TH = 'px-2.5 py-2.5 cursor-pointer whitespace-nowrap font-semibold'

export default function Performance() {
  const { selectedInvoice, claims, drivers, selectedCity, cargando } = useData()
  const [sortKey, setSortKey] = useState('ingreso')
  const [asc, setAsc] = useState(false)

  const pagos = useMemo(
    () => calcularPagos(selectedInvoice, claims, drivers, selectedCity).map((p) => ({ ...p, paquetes: p.individuales + p.dobles })),
    [selectedInvoice, claims, drivers, selectedCity]
  )
  const rr = useMemo(() => rankingsRutas(selectedInvoice, drivers, selectedCity), [selectedInvoice, drivers, selectedCity])

  const ordenados = [...pagos].sort((a, b) => {
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
  ]

  const conClaims = [...pagos].filter((p) => p.claimsTotales > 0).sort((a, b) => b.claimsTotales - a.claimsTotales)
  const ceroClaims = pagos.filter((p) => p.claimsTotales === 0)

  const topProd = [...pagos].sort((a, b) => b.ingreso - a.ingreso).slice(0, 8).map((p) => ({ name: p.nombre, valor: Math.round(p.ingreso) }))
  const topGan = [...pagos].sort((a, b) => b.ganancia - a.ganancia).slice(0, 8).map((p) => ({ name: p.nombre, valor: Math.round(p.ganancia) }))
  const claimsDona = [
    { name: 'Sin claims', valor: ceroClaims.length },
    { name: 'Con claims', valor: conClaims.length },
  ]

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Performance</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : !selectedInvoice ? (
        <EstadoVacio texto="Cuando cargues una factura verás aquí el ranking detallado de choferes y rutas." />
      ) : (
        <>
          <Aviso tipo="info">
            Nota: por ahora la factura solo trae paquetes entregados (no fallidos), por lo que los <b>claims</b> se usan como indicador de problemas. El código queda listo para agregar "fallidos" en el futuro.
          </Aviso>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BarCard title="Top choferes por ingreso" data={topProd} fmt={money} horizontal height={240} />
            <BarCard title="Top choferes por ganancia" data={topGan} fmt={money} horizontal height={240} />
            <DonutCard title="Calidad: con vs sin claims" data={claimsDona} fmt={num} height={240} />
          </div>

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Tabla completa de choferes (clic en encabezado para ordenar)</h3>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
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
                  {ordenados.map((p, i) => (
                    <tr key={p.nombre} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                      <td className="px-2.5 py-2">{p.nombre} {p.sinTarifa && <Badge color="red">sin tarifa</Badge>}</td>
                      <td className="px-2.5 py-2">{p.nombreCiudad}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.paquetes)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.individuales)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.dobles)}</td>
                      <td className="px-2.5 py-2 text-right">{money(p.ingreso)}</td>
                      <td className="px-2.5 py-2 text-right">{money(p.totalPagar)}</td>
                      <td className={`px-2.5 py-2 text-right ${p.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(p.ganancia)}</td>
                      <td className="px-2.5 py-2 text-right">{num(p.claimsTotales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Lista titulo="🏆 Mejor productividad" rows={[...pagos].sort((a, b) => b.ingreso - a.ingreso).slice(0, 5)} render={(p) => `${p.nombre} — ${money(p.ingreso)} (${num(p.paquetes)} paq.)`} />
            <Lista titulo="💵 Mejor ganancia" rows={[...pagos].sort((a, b) => b.ganancia - a.ganancia).slice(0, 5)} render={(p) => `${p.nombre} — ${money(p.ganancia)}`} />
            <Lista titulo="⚠️ Más claims (peor calidad)" rows={conClaims.slice(0, 5)} render={(p) => `${p.nombre} — ${num(p.claimsTotales)} claims`} vacio="Nadie con claims." />
            <Lista titulo="✅ Cero claims" rows={ceroClaims.slice(0, 10)} render={(p) => p.nombre} vacio="Todos tienen algún claim." />
            <Lista titulo="Rutas con más reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio="Ninguna con claims." />
            <Lista titulo="Rutas con cero reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 10)} render={(r) => r.ruta} vacio="—" />
            <Lista titulo="Rutas más rentables ($/lb)" rows={rr.porPrecioLb.slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} />
            <Lista titulo="Rutas menos rentables ($/lb)" rows={[...rr.porPrecioLb].reverse().slice(0, 5)} render={(r) => `${r.ruta} — $${(r.precioPorLb || 0).toFixed(3)}/lb`} />
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
