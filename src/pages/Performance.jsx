import { useMemo, useState } from 'react'
import { useData } from '../DataContext'
import { calcularPagos, rankingsRutas } from '../utils/calc'
import { COLORS } from '../constants'
import { money, num } from '../utils/format'
import { Card, PageTitle, Aviso, Badge, Cargando, EstadoVacio } from '../components/ui'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

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
    { key: 'nombre', label: 'Chofer', tipo: 'txt' },
    { key: 'nombreCiudad', label: 'Ciudad', tipo: 'txt' },
    { key: 'paquetes', label: 'Paquetes' },
    { key: 'individuales', label: 'Ind.' },
    { key: 'dobles', label: 'Dobles' },
    { key: 'ingreso', label: 'Ingreso', money: true },
    { key: 'totalPagar', label: 'Pago', money: true },
    { key: 'ganancia', label: 'Ganancia', money: true },
    { key: 'claimsTotales', label: 'Claims' },
  ]

  const conClaims = [...pagos].filter((p) => p.claimsTotales > 0).sort((a, b) => b.claimsTotales - a.claimsTotales)
  const ceroClaims = pagos.filter((p) => p.claimsTotales === 0)

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

          <Card style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Tabla completa de choferes (clic en encabezado para ordenar)</h3>
            <div style={{ overflowX: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5, minWidth: 820 }}>
                <thead>
                  <tr style={{ background: COLORS.navy, color: '#fff' }}>
                    {cols.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => cambiarOrden(c.key)}
                        style={{ padding: '10px 10px', textAlign: c.tipo === 'txt' ? 'left' : 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {c.label} {sortKey === c.key ? (asc ? '▲' : '▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((p, i) => (
                    <tr key={p.nombre} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? '#fafbfc' : '#fff' }}>
                      <td style={{ padding: '8px 10px' }}>
                        {p.nombre} {p.sinTarifa && <Badge color={COLORS.red}>sin tarifa</Badge>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>{p.nombreCiudad}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(p.paquetes)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(p.individuales)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(p.dobles)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(p.ingreso)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(p.totalPagar)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: p.ganancia >= 0 ? COLORS.green : COLORS.red }}>{money(p.ganancia)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(p.claimsTotales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <Lista titulo="🏆 Mejor productividad (ingreso)" rows={[...pagos].sort((a, b) => b.ingreso - a.ingreso).slice(0, 5)} render={(p) => `${p.nombre} — ${money(p.ingreso)} (${num(p.paquetes)} paq.)`} />
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
    <Card>
      <h4 style={{ margin: '0 0 10px', color: COLORS.navy, fontSize: 15 }}>{titulo}</h4>
      {rows.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{vacio || 'Sin datos.'}</div>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9 }}>
          {rows.map((r, i) => (
            <li key={r.nombre || r.ruta || i}>{render(r)}</li>
          ))}
        </ol>
      )}
    </Card>
  )
}
