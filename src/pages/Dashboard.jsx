import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { useData } from '../DataContext'
import { calcularPagos, rankingsChoferes, rankingsRutas, alertasCambioPrecio, porCiudad, totalesFiltrados, TODAS } from '../utils/calc'
import { COLORS, CHART_COLORS, nombreCiudad, UMBRAL_CAMBIO_PRECIO } from '../constants'
import { money, num, pct } from '../utils/format'
import { Card, Stat, PageTitle, Tabla, Aviso, Badge, Cargando, EstadoVacio } from '../components/ui'
import Verificacion from '../components/Verificacion'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

export default function Dashboard() {
  const { invoices, selectedInvoice, selectedInvoiceId, claims, drivers, selectedCity, cargando } = useData()

  const pagos = useMemo(() => calcularPagos(selectedInvoice, claims, drivers, selectedCity), [selectedInvoice, claims, drivers, selectedCity])
  const rc = useMemo(() => rankingsChoferes(selectedInvoice, claims, drivers, selectedCity), [selectedInvoice, claims, drivers, selectedCity])
  const rr = useMemo(() => rankingsRutas(selectedInvoice, drivers, selectedCity), [selectedInvoice, drivers, selectedCity])
  const tot = useMemo(() => totalesFiltrados(selectedInvoice, selectedCity), [selectedInvoice, selectedCity])

  const invAnterior = useMemo(() => {
    const idx = invoices.findIndex((i) => i.id === selectedInvoiceId)
    return idx >= 0 ? invoices[idx + 1] : null
  }, [invoices, selectedInvoiceId])
  const alertas = useMemo(() => alertasCambioPrecio(selectedInvoice, invAnterior), [selectedInvoice, invAnterior])

  const comparativoCiudades = useMemo(() => {
    if (!selectedInvoice) return []
    return (selectedInvoice.resumenCiudades || []).map((c) => {
      const pc = calcularPagos(selectedInvoice, claims, drivers, c.ubicacion)
      const ingreso = pc.reduce((a, p) => a + p.ingreso, 0)
      const costo = pc.reduce((a, p) => a + p.totalPagar, 0)
      return { ciudad: nombreCiudad(c.ubicacion), ingreso, ganancia: ingreso - costo, claims: c.numClaims, paquetes: c.paquetes }
    })
  }, [selectedInvoice, claims, drivers])

  const costoTotal = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const ingresoTotal = tot.ingreso
  const gananciaTotal = ingresoTotal - costoTotal

  const rutasTop = [...porCiudad(selectedInvoice?.resumenRutas || [], selectedCity)].sort((a, b) => b.ingreso - a.ingreso).slice(0, 10)
  const chartIngreso = rutasTop.map((r) => ({ name: r.ruta, valor: Math.round(r.ingreso) }))
  const chartClaims = [...rr.porClaims].filter((r) => (r.numClaims || 0) > 0).slice(0, 12).map((r) => ({ name: r.ruta, valor: r.numClaims }))

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Dashboard</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando datos…" />
      ) : (
        <>
          {alertas.length > 0 && (
            <Aviso tipo="warn">
              ⚠️ Gofo cambió el precio (±{pct(UMBRAL_CAMBIO_PRECIO, 0)}) en {alertas.length} ruta(s) vs la semana anterior:
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {alertas.slice(0, 6).map((a) => (
                  <li key={a.ruta}>
                    <b>{a.ruta}</b> ({a.nombreCiudad}): ${a.antesLb.toFixed(3)}/lb → ${a.ahoraLb.toFixed(3)}/lb ({a.cambioLb >= 0 ? '+' : ''}{pct(a.cambioLb)})
                  </li>
                ))}
                {alertas.length > 6 && <li>…y {alertas.length - 6} más.</li>}
              </ul>
            </Aviso>
          )}

          {/* Tarjetas: se muestran SIEMPRE (con ceros si no hay datos) */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Stat label="Ingreso total" value={money(ingresoTotal)} color={COLORS.green} />
            <Stat label="Costo total" value={money(costoTotal)} color={COLORS.navy} />
            <Stat label="Ganancia total" value={money(gananciaTotal)} color={COLORS.gold} />
            <Stat label="% Dobles" value={pct(tot.pctDobles)} sub={`${num(tot.dobles)} de ${num(tot.paquetes)}`} />
            <Stat label="Total claims" value={num(tot.numClaims)} color={COLORS.red} />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio />
          ) : (
            <>
              <Verificacion v={selectedInvoice.verificacion} compacto />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 18 }}>
                <VBar title="Ingreso por ruta (top 10)" data={chartIngreso} color={COLORS.navy} fmt={money} />
                <VBar title="Claims por ruta" data={chartClaims} color={COLORS.red} fmt={num} />
              </div>

              {selectedCity === TODAS && comparativoCiudades.length > 1 && (
                <Card style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Comparativo entre ciudades</h3>
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

              <h2 style={{ color: COLORS.navy, fontSize: 20, margin: '8px 0 12px' }}>Rankings de choferes</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 18 }}>
                <RankCard titulo="Por productividad (ingreso)" lista={rc.productividad} valor={(p) => p.ingreso} fmt={money} />
                <RankCard titulo="Por ganancia" lista={rc.ganancia} valor={(p) => p.ganancia} fmt={money} marcaSinTarifa />
                <RankCard titulo="Por calidad (menos claims = mejor)" lista={rc.calidad} valor={(p) => p.claimsTotales} fmt={num} />
              </div>

              <h2 style={{ color: COLORS.navy, fontSize: 20, margin: '8px 0 12px' }}>Rankings de rutas</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <MiniLista titulo="Más reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) > 0).slice(0, 5)} render={(r) => `${r.ruta} — ${r.numClaims} claims`} vacio="Ninguna ruta con claims." />
                <MiniLista titulo="Cero reclamos" rows={rr.porClaims.filter((r) => (r.numClaims || 0) === 0).slice(0, 8)} render={(r) => `${r.ruta}`} vacio="Todas las rutas tienen algún claim." />
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

function VBar({ title, data, color, fmt }) {
  return (
    <Card>
      <h4 style={{ margin: '0 0 10px', color: COLORS.navy, fontSize: 15 }}>{title}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={54} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v) => fmt(v)} />
          <Bar dataKey="valor" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

function RankCard({ titulo, lista, valor, fmt, marcaSinTarifa }) {
  const data = lista.slice(0, 6).map((p) => ({ name: p.nombre, valor: Math.round((valor(p) || 0) * 1000) / 1000, sinTarifa: p.sinTarifa }))
  const mejor = lista[0]
  const peor = lista[lista.length - 1]
  return (
    <Card>
      <h4 style={{ margin: '0 0 10px', color: COLORS.navy, fontSize: 15 }}>{titulo}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
          <Tooltip formatter={(v) => fmt(v)} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {mejor && (
        <div style={{ fontSize: 12.5, marginTop: 8 }}>
          <Badge color={COLORS.green}>Mejor</Badge> {mejor?.nombre} · {fmt(valor(mejor) || 0)}
          {marcaSinTarifa && mejor?.sinTarifa ? ' (sin tarifa)' : ''}
        </div>
      )}
      {peor && lista.length > 1 && (
        <div style={{ fontSize: 12.5, marginTop: 4 }}>
          <Badge color={COLORS.red}>Peor</Badge> {peor?.nombre} · {fmt(valor(peor) || 0)}
        </div>
      )}
    </Card>
  )
}

function MiniLista({ titulo, rows, render, vacio }) {
  return (
    <Card>
      <h4 style={{ margin: '0 0 10px', color: COLORS.navy, fontSize: 15 }}>{titulo}</h4>
      {rows.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{vacio || 'Sin datos.'}</div>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9 }}>
          {rows.map((r, i) => (
            <li key={r.ruta || i}>{render(r)}</li>
          ))}
        </ol>
      )}
    </Card>
  )
}
