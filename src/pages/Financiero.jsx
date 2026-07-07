import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useData } from '../DataContext'
import { calcularPagos, porCiudad } from '../utils/calc'
import { COLORS } from '../constants'
import { money, num, pct } from '../utils/format'
import { Card, Stat, PageTitle, Tabla, Cargando, EstadoVacio } from '../components/ui'
import Verificacion from '../components/Verificacion'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

export default function Financiero() {
  const { selectedInvoice, claims, drivers, selectedCity, cargando } = useData()

  const avg = useMemo(() => {
    const act = (drivers || []).filter((d) => d.activo !== false)
    const ind = act.reduce((a, d) => a + (Number(d.precioIndividual) || 0), 0) / (act.length || 1)
    const dob = act.reduce((a, d) => a + (Number(d.precioDoble) || 0), 0) / (act.length || 1)
    return { ind, dob }
  }, [drivers])

  const pagos = useMemo(
    () => calcularPagos(selectedInvoice, claims, drivers, selectedCity),
    [selectedInvoice, claims, drivers, selectedCity]
  )

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

  const topRutas = [...rutas].sort((a, b) => b.ingreso - a.ingreso).slice(0, 10)
  const chartIngreso = topRutas.map((r) => ({ name: r.ruta, valor: Math.round(r.ingreso) }))
  const chartGanancia = [...rutas].sort((a, b) => b.ganancia - a.ganancia).slice(0, 10).map((r) => ({ name: r.ruta, valor: Math.round(r.ganancia) }))
  const chartLb = topRutas.map((r) => ({ name: r.ruta, valor: Number((r.precioPorLb || 0).toFixed(3)) }))

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Financiero</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : (
        <>
          {selectedInvoice && <Verificacion v={selectedInvoice.verificacion} />}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Stat label="Ingreso (Gofo)" value={money(ingresoTotal)} color={COLORS.green} />
            <Stat label="Costo (pagos choferes)" value={money(costoTotal)} color={COLORS.navy} />
            <Stat label="Descuentos claims" value={money(descuentos)} color={COLORS.red} />
            <Stat label="Ganancia real" value={money(gananciaReal)} color={COLORS.gold} sub={pct(ingresoTotal > 0 ? gananciaReal / ingresoTotal : 0)} />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 18 }}>
                <ChartCard title="Ingreso por ruta (top 10)" data={chartIngreso} color={COLORS.navy} formato={money} />
                <ChartCard title="Ganancia por ruta (top 10)" data={chartGanancia} color={COLORS.gold} formato={money} />
                <ChartCard title="$ por libra por ruta (top 10)" data={chartLb} color={COLORS.green} formato={(v) => `$${Number(v).toFixed(3)}`} />
              </div>

              <Card>
                <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Rentabilidad por ruta (ordenado por $/lb)</h3>
                <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
                  Costo por ruta estimado con la tarifa promedio de los choferes ({money(avg.ind)} ind. / {money(avg.dob)} doble).
                </div>
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
                    if (key === 'margen') return <span style={{ color: row.margen >= 0 ? COLORS.green : COLORS.red }}>{pct(row.margen)}</span>
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

function ChartCard({ title, data, color, formato }) {
  return (
    <Card>
      <h4 style={{ margin: '0 0 10px', color: COLORS.navy, fontSize: 15 }}>{title}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={54} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v) => formato(v)} />
          <Bar dataKey="valor" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
