import { useMemo } from 'react'
import { useData } from '../DataContext'
import { calcularPagos, porCiudad, gananciaRealDe, desgloseGananciaCiudades, nombreCiudadDe, TODAS } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money, num, pct } from '../utils/format'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { DollarSign, Receipt, AlertTriangle, TrendingUp, Target, FileSpreadsheet, FileText } from 'lucide-react'
import { Card, KPI, PageTitle, Tabla, Boton, Cargando, EstadoVacio } from '../components/ui'
import { BarCard, DonutCard, GaugeCard } from '../components/charts'
import Verificacion from '../components/Verificacion'
import GananciaReal from '../components/GananciaReal'
import PanelClaims from '../components/PanelClaims'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

export default function Financiero() {
  const { facturaRango: selectedInvoice, claims, drivers, managers, invoicesRango, selectedCity, cargando } = useData()
  const semanas = Math.max(1, invoicesRango.length)
  const gReal = useMemo(
    () => gananciaRealDe(selectedInvoice, claims, drivers, managers, selectedCity, semanas),
    [selectedInvoice, claims, drivers, managers, selectedCity, semanas]
  )
  const desgloseCiudades = useMemo(
    () => desgloseGananciaCiudades(selectedInvoice, claims, drivers, managers, semanas),
    [selectedInvoice, claims, drivers, managers, semanas]
  )
  const ciudadLabel = selectedCity === TODAS ? '' : nombreCiudadDe(selectedInvoice, selectedCity)

  const avg = useMemo(() => {
    const act = (drivers || []).filter((d) => d.activo !== false)
    const ind = act.reduce((a, d) => a + (Number(d.precioIndividual) || 0), 0) / (act.length || 1)
    const dob = act.reduce((a, d) => a + (Number(d.precioDoble) || 0), 0) / (act.length || 1)
    return { ind, dob }
  }, [drivers])

  const pagos = useMemo(() => calcularPagos(selectedInvoice, claims, drivers, selectedCity), [selectedInvoice, claims, drivers, selectedCity])

  const rutas = useMemo(() => {
    const base = porCiudad(selectedInvoice?.resumenRutas || [], selectedCity)
    return base
      .map((r) => {
        const costoEst = r.individuales * avg.ind + r.dobles * avg.dob
        const ganancia = r.ingreso - costoEst
        return { ...r, costoEst, ganancia, margen: r.ingreso > 0 ? ganancia / r.ingreso : 0 }
      })
      .sort((a, b) => (b.precioPorLb || 0) - (a.precioPorLb || 0))
  }, [selectedInvoice, selectedCity, avg])

  const ingresoTotal = pagos.reduce((a, p) => a + p.ingreso, 0)
  const costoTotal = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const descuentos = pagos.reduce((a, p) => a + p.descuentoClaims, 0)
  const gananciaReal = ingresoTotal - costoTotal
  const margen = ingresoTotal > 0 ? gananciaReal / ingresoTotal : 0

  const topRutas = [...rutas].sort((a, b) => b.ingreso - a.ingreso).slice(0, 10)
  const ingresoPorRuta = topRutas.map((r) => ({ name: r.ruta, valor: Math.round(r.ingreso) }))
  const gananciaPorRuta = [...rutas].sort((a, b) => b.ganancia - a.ganancia).slice(0, 10).map((r) => ({ name: r.ruta, valor: Math.round(r.ganancia) }))
  const lbPorRuta = topRutas.map((r) => ({ name: r.ruta, valor: Number((r.precioPorLb || 0).toFixed(3)) }))
  const ingresoPorCiudad = porCiudad(selectedInvoice?.resumenCiudades || [], selectedCity).map((c) => ({ name: nombreCiudad(c.ubicacion), valor: Math.round(c.ingreso) }))

  const nombreArch = `financiero_${selectedInvoice?.semana || 'periodo'}`
  const exportarE = () =>
    exportarExcel(nombreArch, [
      { nombre: 'Resumen', rows: [{ Ingreso: ingresoTotal, Costo: costoTotal, Descuentos: descuentos, Ganancia: gananciaReal, Margen: pct(margen) }] },
      { nombre: 'Rutas', rows: rutas.map((r) => ({ Ruta: r.ruta, Ciudad: r.nombreCiudad, Paquetes: r.paquetes, Ingreso: r.ingreso, '$/lb': r.precioPorLb, CostoEst: r.costoEst, Ganancia: r.ganancia, Margen: r.margen })) },
    ])
  const exportarP = () =>
    exportarPDF(nombreArch, 'Resumen Financiero', selectedInvoice?.semana || '', [
      { titulo: 'Totales', head: ['Ingreso', 'Costo', 'Descuentos', 'Ganancia', 'Margen'], body: [[money(ingresoTotal), money(costoTotal), money(descuentos), money(gananciaReal), pct(margen)]] },
      { titulo: 'Rentabilidad por ruta', head: ['Ruta', 'Ciudad', 'Paquetes', 'Ingreso', '$/lb', 'Costo est.', 'Ganancia', 'Margen'], body: rutas.map((r) => [r.ruta, r.nombreCiudad, num(r.paquetes), money(r.ingreso), `$${(r.precioPorLb || 0).toFixed(3)}`, money(r.costoEst), money(r.ganancia), pct(r.margen)]) },
    ])

  return (
    <div>
      <PageTitle right={<><RangeSelector /><CitySelector /></>}>Financiero</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : (
        <>
          {selectedInvoice && <Verificacion v={selectedInvoice.verificacion} />}
          {selectedInvoice && <GananciaReal g={gReal} ciudadLabel={ciudadLabel} />}

          {/* Desglose de ganancia real por ciudad */}
          {selectedInvoice && desgloseCiudades.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Ganancia real por ciudad</h3>
              <p className="mb-3 text-xs text-slate-400">Ingreso neto (aprox. por ciudad) − costo de choferes − costo de managers de esa ciudad. El total general es la fila inferior.</p>
              <Tabla
                columns={[
                  { key: 'nombreCiudad', label: 'Ciudad' },
                  { key: 'ingresoNeto', label: 'Ingreso neto', align: 'right' },
                  { key: 'costoChoferes', label: 'Costo choferes', align: 'right' },
                  { key: 'costoManagers', label: 'Costo managers', align: 'right' },
                  { key: 'gananciaReal', label: 'Ganancia real', align: 'right' },
                  { key: 'margen', label: 'Margen', align: 'right' },
                ]}
                rows={desgloseCiudades.map((c) => ({ ...c, _key: c.code }))}
                renderCell={(row, key) => {
                  if (key === 'margen') return <span className={row.margen >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{pct(row.margen)}</span>
                  if (key === 'gananciaReal') return <span className={`font-semibold ${row.gananciaReal >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>{money(row.gananciaReal)}</span>
                  if (['ingresoNeto', 'costoChoferes', 'costoManagers'].includes(key)) return money(row[key])
                  return row[key]
                }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-end gap-4 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">TOTAL general:</span>
                <span>Managers <b className="text-brand-navy dark:text-slate-100">{money(desgloseCiudades.reduce((a, c) => a + c.costoManagers, 0))}</b></span>
                <span>Ganancia real <b className="text-brand-gold">{money(desgloseCiudades.reduce((a, c) => a + c.gananciaReal, 0))}</b></span>
              </div>
            </Card>
          )}

          {selectedInvoice && <PanelClaims claims={porCiudad(claims, selectedCity)} inv={selectedInvoice} />}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KPI label="Ingreso (Gofo)" value={money(ingresoTotal)} icon={DollarSign} accent="green" />
            <KPI label="Costo (choferes)" value={money(costoTotal)} icon={Receipt} accent="navy" />
            <KPI label="Descuentos claims" value={money(descuentos)} icon={AlertTriangle} accent="red" />
            <KPI label="Ganancia real" value={money(gananciaReal)} icon={TrendingUp} accent="gold" />
            <KPI label="Margen" value={pct(margen)} icon={Target} accent="blue" />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <GaugeCard title="Margen de ganancia" value={margen} color="#c9a24b" />
                <div className="lg:col-span-2">
                  <DonutCard title="Distribución de ingreso por ciudad" data={ingresoPorCiudad} fmt={money} height={200} />
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BarCard title="Ingreso por ruta (top 10)" data={ingresoPorRuta} color="#13233f" fmt={money} />
                <BarCard title="Ganancia por ruta (top 10)" data={gananciaPorRuta} color="#c9a24b" fmt={money} />
                <BarCard title="$ por libra por ruta (top 10)" data={lbPorRuta} color="#4a9c8c" fmt={(v) => `$${Number(v).toFixed(3)}`} />
                <BarCard title="Ingreso por ciudad" data={ingresoPorCiudad} fmt={money} horizontal />
              </div>

              <Card className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Rentabilidad por ruta (ordenado por $/lb)</h3>
                  <div className="ml-auto flex gap-2">
                    <Boton variant="ghost" onClick={exportarE}><FileSpreadsheet size={16} strokeWidth={1.8} /> Excel</Boton>
                    <Boton variant="gold" onClick={exportarP}><FileText size={16} strokeWidth={1.8} /> PDF</Boton>
                  </div>
                </div>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  Costo por ruta estimado con la tarifa promedio de los choferes ({money(avg.ind)} ind. / {money(avg.dob)} doble).
                </p>
                <Tabla
                  columns={[
                    { key: 'ruta', label: 'Ruta' },
                    { key: 'nombreCiudad', label: 'Ciudad' },
                    { key: 'paquetes', label: 'Paquetes', align: 'right' },
                    { key: 'pesoTotalLb', label: 'Peso (lb)', align: 'right' },
                    { key: 'ingreso', label: 'Ingreso', align: 'right' },
                    { key: 'precioPorLb', label: '$/lb', align: 'right' },
                    { key: 'precioPorPaquete', label: '$/paq', align: 'right' },
                    { key: 'costoEst', label: 'Costo est.', align: 'right' },
                    { key: 'ganancia', label: 'Ganancia', align: 'right' },
                    { key: 'margen', label: 'Margen', align: 'right' },
                  ]}
                  rows={rutas.map((r) => ({ ...r, _key: r.ruta }))}
                  renderCell={(row, key) => {
                    if (['ingreso', 'costoEst', 'ganancia', 'precioPorPaquete'].includes(key)) return money(row[key])
                    if (key === 'precioPorLb') return `$${(row[key] || 0).toFixed(3)}`
                    if (key === 'pesoTotalLb') return num(row[key], 1)
                    if (key === 'margen') return <span className={row.margen >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{pct(row.margen)}</span>
                    if (key === 'paquetes') return num(row[key])
                    return row[key]
                  }}
                />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
