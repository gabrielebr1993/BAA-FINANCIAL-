import { useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Route as RouteIcon, Package, DollarSign, TrendingUp, Users, AlertTriangle, Scale, FileSpreadsheet, FileText } from 'lucide-react'
import { useData } from '../DataContext'
import { rutasConGanancia, pagosPorRuta, claimsValidos, etiquetaTipoClaim, TODAS } from '../utils/calc'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { money, num, pct } from '../utils/format'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { Card, KPI, PageTitle, Boton, Tabla, Badge, Aviso, Cargando, EstadoVacio } from '../components/ui'
import { TrendCard } from '../components/charts'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

const tms = (d) => (d instanceof Date ? d.getTime() : 0)

export default function RutaFicha() {
  const { ruta } = useParams()
  const decoded = decodeURIComponent(ruta || '')
  const navigate = useNavigate()
  const { facturaRango: inv, invoices, invAnterior, claims, drivers, cargando } = useData()

  const rutaActual = useMemo(() => rutasConGanancia(inv, drivers, TODAS).find((r) => r.ruta === decoded) || null, [inv, drivers, decoded])

  // Historial usando TODAS las facturas cargadas.
  const historial = useMemo(() => {
    return [...(invoices || [])]
      .sort((a, b) => tms(a.fechaInicio) - tms(b.fechaInicio))
      .map((f) => {
        const r = rutasConGanancia(f, drivers, TODAS).find((x) => x.ruta === decoded)
        if (!r) return null
        return { id: f.id, semana: f.semana, ingreso: r.ingreso, ganancia: r.ganancia, paquetes: r.paquetes, ppp: r.precioPorPaquete, claims: r.numClaims || 0 }
      })
      .filter(Boolean)
  }, [invoices, drivers, decoded])

  const trendData = historial.map((h) => ({ name: h.semana, ingreso: Math.round(h.ingreso), ganancia: Math.round(h.ganancia) }))
  const trendPpp = historial.map((h) => ({ name: h.semana, valor: Number((h.ppp || 0).toFixed(3)) }))

  // Alerta de precio vs. semana anterior.
  const alertaPrecio = useMemo(() => {
    if (!invAnterior || !rutaActual) return null
    const prev = (invAnterior.resumenRutas || []).find((r) => r.ruta === decoded)
    if (!prev) return null
    const antesPq = prev.precioPorPaquete != null ? prev.precioPorPaquete : (prev.paquetes > 0 ? prev.ingreso / prev.paquetes : 0)
    const antesLb = prev.precioPorLb != null ? prev.precioPorLb : (prev.pesoTotalLb > 0 ? prev.ingreso / prev.pesoTotalLb : 0)
    const dPq = antesPq > 0 ? (rutaActual.precioPorPaquete - antesPq) / antesPq : 0
    const dLb = antesLb > 0 ? (rutaActual.precioPorLb - antesLb) / antesLb : 0
    if (Math.abs(dPq) >= UMBRAL_CAMBIO_PRECIO || Math.abs(dLb) >= UMBRAL_CAMBIO_PRECIO) {
      return { antesPq, ahoraPq: rutaActual.precioPorPaquete, dPq, antesLb, ahoraLb: rutaActual.precioPorLb, dLb }
    }
    return null
  }, [invAnterior, rutaActual, decoded])

  // Claims de la ruta (respetando el rango cargado).
  const claimsRuta = useMemo(() => (claims || []).filter((c) => (c.ruta || '') === decoded), [claims, decoded])
  const choferes = useMemo(() => {
    const m = {}
    for (const c of claimsValidos(claimsRuta)) m[c.courier] = (m[c.courier] || 0) + 1
    return Object.entries(m).map(([nombre, n]) => ({ nombre, claims: n })).sort((a, b) => b.claims - a.claims)
  }, [claimsRuta])

  // Choferes de la ruta con números EXACTOS (opción B: desglose chofer×ruta que
  // guardan las facturas nuevas). Vacío si la factura no lo trae (histórico).
  const choferesRuta = useMemo(() => pagosPorRuta(inv, claims, drivers, decoded).sort((a, b) => b.ingreso - a.ingreso), [inv, claims, drivers, decoded])

  const nombreExp = `ruta_${decoded}`.replace(/[^\w-]+/g, '_')
  const exportarE = () =>
    exportarExcel(nombreExp, [
      ...(rutaActual ? [{ nombre: 'Resumen', rows: [
        { Métrica: 'Ruta', Valor: decoded },
        { Métrica: 'Paquetes', Valor: rutaActual.paquetes },
        { Métrica: 'Ingreso', Valor: Math.round(rutaActual.ingreso) },
        { Métrica: '$/paquete', Valor: rutaActual.precioPorPaquete },
        { Métrica: 'Costo choferes', Valor: Math.round(rutaActual.costoChoferes) },
        { Métrica: 'Ganancia', Valor: Math.round(rutaActual.ganancia) },
        { Métrica: 'Claims', Valor: rutaActual.numClaims || 0 },
      ] }] : []),
      ...(choferesRuta.length ? [{ nombre: 'Choferes', rows: choferesRuta.map((p) => ({ Chofer: p.nombre, Paquetes: p.paquetes, Individuales: p.individuales, Dobles: p.dobles, Ingreso: Math.round(p.ingreso), Pago: Math.round(p.totalPagar), Ganancia: Math.round(p.ganancia), Claims: p.claimsTotales })) }] : []),
      ...(historial.length ? [{ nombre: 'Historial', rows: historial.map((h) => ({ Semana: h.semana, Paquetes: h.paquetes, Ingreso: Math.round(h.ingreso), Ganancia: Math.round(h.ganancia), Claims: h.claims })) }] : []),
    ])
  const exportarP = () =>
    exportarPDF(nombreExp, `Ruta ${decoded}`, inv?.semana || '', [
      ...(rutaActual ? [{ titulo: 'Resumen de la ruta', head: ['Métrica', 'Valor'], body: [
        ['Paquetes', num(rutaActual.paquetes)], ['Ingreso (Gofo)', money(rutaActual.ingreso)], ['$/paquete', money(rutaActual.precioPorPaquete)],
        ['Costo choferes', money(rutaActual.costoChoferes)], ['Ganancia', money(rutaActual.ganancia)], ['Claims', num(rutaActual.numClaims || 0)],
      ] }] : []),
      ...(choferesRuta.length ? [{ titulo: `Choferes de la ruta (${choferesRuta.length})`, head: ['Chofer', 'Paq.', 'Ingreso', 'Pago', 'Ganancia', 'Claims'], body: choferesRuta.map((p) => [p.nombre, num(p.paquetes), money(p.ingreso), money(p.totalPagar), money(p.ganancia), num(p.claimsTotales)]) }] : []),
    ])

  const hayDatos = rutaActual || historial.length > 0

  return (
    <div>
      <PageTitle right={
        <>
          <RangeSelector /><CitySelector />
          {hayDatos && !cargando && (
            <>
              <Boton variant="ghost" onClick={exportarE} className="px-3 py-1.5 text-xs"><FileSpreadsheet size={15} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={exportarP} className="px-3 py-1.5 text-xs"><FileText size={15} strokeWidth={1.8} /> PDF</Boton>
            </>
          )}
        </>
      }>
        <button onClick={() => navigate(-1)} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-white">
          <ArrowLeft size={16} strokeWidth={2} /> Volver
        </button>
        Ruta {decoded}
      </PageTitle>

      {cargando ? (
        <Cargando texto="Cargando ruta…" />
      ) : !hayDatos ? (
        <EstadoVacio titulo={decoded} texto="Esta ruta no tiene datos en el rango seleccionado." />
      ) : (
        <>
          {alertaPrecio && (
            <Aviso tipo="warn">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <AlertTriangle size={15} strokeWidth={1.8} /> Gofo cambió el precio de esta ruta vs. la semana anterior:
                $/paq {money(alertaPrecio.antesPq)} → {money(alertaPrecio.ahoraPq)} ({alertaPrecio.dPq >= 0 ? '+' : ''}{pct(alertaPrecio.dPq)}) ·
                $/lb ${(alertaPrecio.antesLb || 0).toFixed(3)} → ${(alertaPrecio.ahoraLb || 0).toFixed(3)} ({alertaPrecio.dLb >= 0 ? '+' : ''}{pct(alertaPrecio.dLb)}).
                Útil para reclamar a Gofo.
              </span>
            </Aviso>
          )}

          {/* 1. Resumen del periodo */}
          {rutaActual && (
            <div className="mb-4 flex flex-wrap gap-3">
              <KPI label="Paquetes" value={num(rutaActual.paquetes)} icon={Package} accent="navy" sub={`${num(rutaActual.individuales)} ind · ${num(rutaActual.dobles)} dob`} />
              <KPI label="Ingreso (Gofo)" value={money(rutaActual.ingreso)} icon={DollarSign} accent="green" />
              <KPI label="$/paquete" value={money(rutaActual.precioPorPaquete)} icon={DollarSign} accent="gold" />
              <KPI label="$/lb" value={`$${(rutaActual.precioPorLb || 0).toFixed(3)}`} icon={Scale} accent="steel" />
              <KPI label="Costo choferes" value={money(rutaActual.costoChoferes)} icon={Users} accent="navy" />
              <KPI label="Ganancia" value={money(rutaActual.ganancia)} icon={TrendingUp} accent={rutaActual.ganancia >= 0 ? 'gold' : 'red'} valueColor={rutaActual.ganancia >= 0 ? undefined : 'text-rose-600'} sub={pct(rutaActual.margen)} />
              <KPI label="Claims" value={num(rutaActual.numClaims || 0)} icon={AlertTriangle} accent="red" sub={`Calidad ${pct(rutaActual.calidad, 1)}`} />
            </div>
          )}

          {/* 2. Historial semana a semana */}
          {historial.length > 1 && (
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TrendCard title="Ingreso y ganancia por semana" data={trendData} fmt={money}
                series={[{ key: 'ingreso', label: 'Ingreso', color: '#13233f' }, { key: 'ganancia', label: 'Ganancia', color: '#c9a24b' }]} />
              <TrendCard title="$/paquete por semana" data={trendPpp} fmt={money}
                series={[{ key: 'valor', label: '$/paquete', color: '#3d5a80' }]} />
            </div>
          )}
          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Historial de la ruta</h3>
            <Tabla
              columns={[
                { key: 'semana', label: 'Semana' },
                { key: 'paquetes', label: 'Paquetes', align: 'right' },
                { key: 'ingreso', label: 'Ingreso', align: 'right' },
                { key: 'ganancia', label: 'Ganancia', align: 'right' },
                { key: 'ppp', label: '$/paq', align: 'right' },
                { key: 'claims', label: 'Claims', align: 'right' },
              ]}
              rows={[...historial].reverse().map((h) => ({ ...h, _key: h.id }))}
              emptyText="Sin historial."
              renderCell={(row, key) => {
                if (key === 'ingreso' || key === 'ganancia' || key === 'ppp') return money(row[key])
                if (key === 'paquetes' || key === 'claims') return num(row[key])
                return row[key]
              }}
            />
          </Card>

          {/* 3. Choferes de la ruta */}
          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Choferes de esta ruta{choferesRuta.length ? ` (${choferesRuta.length})` : ''}</h3>
            {choferesRuta.length > 0 ? (
              <>
                <p className="mb-3 text-xs text-slate-400">Números exactos de esta ruta (paquetes, ingreso, pago y claims). Clic en un chofer para ver su perfil.</p>
                <Tabla
                  columns={[
                    { key: 'nombre', label: 'Chofer' },
                    { key: 'paquetes', label: 'Paquetes', align: 'right' },
                    { key: 'individuales', label: 'Ind.', align: 'right' },
                    { key: 'dobles', label: 'Dobles', align: 'right' },
                    { key: 'ingreso', label: 'Ingreso', align: 'right' },
                    { key: 'totalPagar', label: 'Pago', align: 'right' },
                    { key: 'ganancia', label: 'Ganancia', align: 'right' },
                    { key: 'claimsTotales', label: 'Claims', align: 'right' },
                  ]}
                  rows={choferesRuta.map((p) => ({ ...p, _key: p.nombre }))}
                  onRowClick={(row) => navigate(`/choferes/${encodeURIComponent(row.nombre)}`)}
                  renderCell={(row, key) => {
                    if (['ingreso', 'totalPagar', 'ganancia'].includes(key)) return money(row[key])
                    if (['paquetes', 'individuales', 'dobles', 'claimsTotales'].includes(key)) return num(row[key])
                    return row[key]
                  }}
                />
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-400">Esta factura no guardó el desglose por chofer×ruta (histórico). Se muestran los choferes con claims en la ruta. Las facturas nuevas ya traen el detalle completo.</p>
                {choferes.length === 0 ? (
                  <div className="text-sm text-slate-400">Sin choferes con claims en esta ruta en el periodo.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {choferes.map((c) => (
                      <Link key={c.nombre} to={`/choferes/${encodeURIComponent(c.nombre)}`} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
                        <Users size={14} strokeWidth={1.8} className="text-slate-400" /> {c.nombre} <Badge color="red">{c.claims} claim(s)</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* 5. Claims de la ruta */}
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <RouteIcon size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Claims de la ruta ({claimsRuta.length})</h3>
            </div>
            <p className="mb-3 text-xs text-slate-400">Haz clic en un claim para abrir la ficha del tracking.</p>
            <Tabla
              columns={[
                { key: 'waybill', label: 'Waybill' },
                { key: 'courier', label: 'Chofer' },
                { key: 'claimType', label: 'Tipo' },
                { key: 'montoGofo', label: 'Monto Gofo', align: 'right' },
                { key: 'estado', label: 'Estado', align: 'center' },
              ]}
              rows={claimsRuta.map((c) => ({ ...c, _key: c.id }))}
              onRowClick={(row) => row.waybill && navigate(`/tracking/${encodeURIComponent(row.waybill)}`)}
              emptyText="Sin claims en esta ruta en el periodo."
              renderCell={(row, key) => {
                if (key === 'montoGofo') return money(row.montoGofo)
                if (key === 'claimType') return etiquetaTipoClaim(row.claimType)
                if (key === 'estado') return row.estadoRevision === 'anulado' ? <Badge color="slate">Anulado</Badge> : row.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo</Badge>
                return row[key] || '—'
              }}
            />
          </Card>
        </>
      )}
    </div>
  )
}
