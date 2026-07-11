import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Truck, Star, MapPin, DollarSign, Package, AlertTriangle, TrendingUp, Wallet, PackageX } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import {
  calcularPagos, promediosFlota, calificarChofer, buscarDriver,
  claimsValidos, porCiudad, nombreCiudadDe, etiquetaTipoClaim, TODAS,
} from '../utils/calc'
import { money, num, pct } from '../utils/format'
import { Card, KPI, PageTitle, Badge, Tabla, Cargando, EstadoVacio, Aviso } from '../components/ui'
import { TrendCard } from '../components/charts'
import VerificacionChofer from '../components/VerificacionChofer'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }

// Semáforo + estrellas de la calificación.
function Calificacion({ c }) {
  const color = COLOR_NIVEL[c.nivel]
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: color }}>{c.puntaje}</span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold" style={{ color }}>{c.etiqueta}</span>
            <span className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={15} strokeWidth={1.8} className={n <= c.estrellas ? 'fill-brand-gold text-brand-gold' : 'text-slate-300 dark:text-slate-600'} />
              ))}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{c.desglose}</div>
        </div>
      </div>
    </div>
  )
}

export default function PerfilChofer() {
  const { nombre } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(nombre || '')
  const { facturaRango: inv, invoicesRango, claims, drivers, selectedCity, activeCompanyId, reloadDrivers, cargando } = useData()
  const [pagosStatus, setPagosStatus] = useState({}) // invoiceId -> 'pagado' | 'pendiente'

  const driver = useMemo(() => buscarDriver(drivers, decoded), [drivers, decoded])
  const pagos = useMemo(() => calcularPagos(inv, claims, drivers, selectedCity), [inv, claims, drivers, selectedCity])
  const prom = useMemo(() => promediosFlota(pagos), [pagos])
  const pago = useMemo(() => pagos.find((p) => p.nombre === decoded) || null, [pagos, decoded])
  const calif = useMemo(() => (pago ? calificarChofer({ ...pago, paquetes: pago.individuales + pago.dobles }, prom) : null), [pago, prom])
  // Tarifas para la cabecera: de la actividad si la hay, si no del registro del chofer.
  const tarInd = pago ? pago.tarifaInd : (driver ? Number(driver.precioIndividual) || 0 : 0)
  const tarDob = pago ? pago.tarifaDoble : (driver ? Number(driver.precioDoble) || 0 : 0)

  // Claims del chofer en el periodo (respetando ciudad).
  const claimsChofer = useMemo(() => porCiudad(claims, selectedCity).filter((c) => c.courier === decoded), [claims, selectedCity, decoded])
  const validosChofer = useMemo(() => claimsValidos(claimsChofer), [claimsChofer])
  const tiposChofer = useMemo(() => {
    const m = {}
    for (const c of validosChofer) { const k = etiquetaTipoClaim(c.claimType); m[k] = (m[k] || 0) + 1 }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [validosChofer])

  // Historial semana a semana.
  const historial = useMemo(() => {
    return [...invoicesRango]
      .map((f) => {
        const claimsSemana = claims.filter((c) => c.invoiceId === f.id)
        const p = calcularPagos(f, claimsSemana, drivers, selectedCity).find((x) => x.nombre === decoded)
        if (!p) return null
        return {
          id: f.id,
          semana: f.semana,
          fechaInicio: f.fechaInicio,
          paquetes: p.individuales + p.dobles,
          totalPagar: p.totalPagar,
          claims: p.claimsTotales,
          fallidos: p.fallidos || 0,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a.fechaInicio instanceof Date ? a.fechaInicio.getTime() : 0
        const tb = b.fechaInicio instanceof Date ? b.fechaInicio.getTime() : 0
        return tb - ta
      })
  }, [invoicesRango, claims, drivers, selectedCity, decoded])

  const totalPagadoAcumulado = historial.reduce((a, h) => a + h.totalPagar, 0)
  const trendData = [...historial].reverse().map((h) => ({ name: h.semana, entregas: h.paquetes, claims: h.claims }))

  // Estado de pago por semana (payroll).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!activeCompanyId || !decoded) return
      const snap = await getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('driverNombre', '==', decoded)))
      const m = {}
      snap.docs.forEach((d) => { const x = d.data(); m[x.invoiceId] = x.estado || 'pendiente' })
      if (vivo) setPagosStatus(m)
    })().catch(() => {})
    return () => { vivo = false }
  }, [activeCompanyId, decoded])

  const ciudades = useMemo(() => {
    const set = new Set(pagos.filter((p) => p.nombre === decoded).map((p) => p.nombreCiudad))
    // el chofer puede aparecer en varias ciudades; buscar en resumenChoferes
    ;(inv?.resumenChoferes || []).filter((c) => c.nombre === decoded).forEach((c) => set.add(nombreCiudadDe(inv, c.ciudad)))
    return [...set].filter(Boolean)
  }, [pagos, inv, decoded])

  return (
    <div>
      <PageTitle>
        <button onClick={() => navigate(-1)} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-white">
          <ArrowLeft size={16} strokeWidth={2} /> Volver
        </button>
        Perfil del chofer
      </PageTitle>

      {cargando ? (
        <Cargando texto="Cargando perfil…" />
      ) : !pago && !driver ? (
        <EstadoVacio titulo={decoded} texto="Este chofer no tiene datos en el rango de fechas / ciudad seleccionados, y no está guardado como chofer. Cámbialo en el filtro o créalo en Choferes." />
      ) : (
        <>
          {/* Cabecera */}
          <Card className="mb-4 p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy text-brand-gold">
                <Truck size={26} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-2xl font-bold text-brand-navy dark:text-slate-100">{decoded}</h2>
                  {driver ? (
                    driver.activo === false ? <Badge color="slate">Inactivo</Badge> : <Badge color="green">Activo</Badge>
                  ) : <Badge color="red">Sin tarifa</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><MapPin size={14} strokeWidth={1.8} /> {ciudades.join(', ') || '—'}</span>
                  <span>Tarifa individual: <b className="text-brand-navy dark:text-slate-200">{money(tarInd)}</b></span>
                  <span>Tarifa doble: <b className="text-brand-navy dark:text-slate-200">{money(tarDob)}</b></span>
                </div>
              </div>
              {calif && <Calificacion c={calif} />}
            </div>
          </Card>

          {/* Sin actividad en el rango: igual se puede verificar/registrar el pago. */}
          {!pago && (
            <div className="mb-4">
              <Aviso tipo="info">Este chofer no tiene actividad en el rango de fechas / ciudad seleccionados. Aún así puedes completar su <b>verificación y registro de pago</b> aquí abajo.</Aviso>
            </div>
          )}

          {/* Métricas del periodo */}
          {pago && (
            <div className="mb-4 flex flex-wrap gap-3">
              <KPI label="Entregas" value={num(pago.individuales + pago.dobles)} icon={Package} accent="navy" sub={`${num(pago.individuales)} ind · ${num(pago.dobles)} dob`} />
              <KPI label="Ingreso generado" value={money(pago.ingreso)} icon={DollarSign} accent="green" />
              <KPI label="Se le pagó" value={money(pago.totalPagar)} icon={Wallet} accent="gold" sub={pago.descuentoClaims > 0 ? `−${money(pago.descuentoClaims)} claims` : undefined} />
              <KPI label="Ganancia que deja" value={money(pago.ganancia)} icon={TrendingUp} accent="blue" sub={pct(pago.ingreso > 0 ? pago.ganancia / pago.ingreso : 0)} />
              <KPI label="Claims" value={num(pago.claimsTotales)} icon={AlertTriangle} accent="red" sub={pago.claimsPerdonados > 0 ? `${num(pago.claimsPerdonados)} perdonados` : undefined} />
              <KPI label="Paquetes fallidos" value={num(pago.fallidos || 0)} icon={PackageX} accent="amber" sub={(pago.fallidos || 0) > 0 ? `${pct(pago.pctFallidos || 0)} de sus entregas` : 'sin fallidos'} />
            </div>
          )}

          {/* Verificación del chofer + estado de pago (Stripe). Solo owner/súper-admin. */}
          <div className="mb-4">
            <VerificacionChofer driver={driver} activeCompanyId={activeCompanyId} onReload={reloadDrivers} />
          </div>

          {pago && tiposChofer.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">Claims por tipo</h3>
              <div className="flex flex-wrap gap-2">
                {tiposChofer.map(([tipo, n]) => (
                  <span key={tipo} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm dark:bg-slate-800">
                    {tipo}: <b>{num(n)}</b>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Tendencia */}
          {trendData.length > 1 && (
            <div className="mb-4">
              <TrendCard
                title="Evolución semana a semana"
                subtitle="Entregas y claims por semana"
                data={trendData}
                fmt={num}
                series={[
                  { key: 'entregas', label: 'Entregas', color: '#13233f' },
                  { key: 'claims', label: 'Claims', color: '#ef4444' },
                ]}
              />
            </div>
          )}

          {/* Historial de pagos */}
          {pago && (<>
          <Card className="mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Historial de pagos</h3>
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">Total pagado en el rango: <b className="text-brand-navy dark:text-slate-100">{money(totalPagadoAcumulado)}</b></span>
            </div>
            <Tabla
              columns={[
                { key: 'semana', label: 'Semana' },
                { key: 'paquetes', label: 'Entregas', align: 'right' },
                { key: 'claims', label: 'Claims', align: 'right' },
                { key: 'fallidos', label: 'Fallidos', align: 'right' },
                { key: 'totalPagar', label: 'Pagado', align: 'right' },
                { key: 'estado', label: 'Estado', align: 'center' },
              ]}
              rows={historial.map((h) => ({ ...h, _key: h.id }))}
              emptyText="Sin semanas en el rango."
              renderCell={(row, key) => {
                if (key === 'totalPagar') return money(row.totalPagar)
                if (key === 'paquetes' || key === 'claims' || key === 'fallidos') return num(row[key] || 0)
                if (key === 'estado') {
                  const e = pagosStatus[row.id]
                  return e === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>
                }
                return row[key]
              }}
            />
          </Card>

          {/* Detalle de claims */}
          <Card className="p-4">
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Detalle de claims ({claimsChofer.length})</h3>
            <p className="mb-3 text-xs text-slate-400">Haz clic en un claim para abrir la ficha del tracking.</p>
            <Tabla
              columns={[
                { key: 'waybill', label: 'Waybill' },
                { key: 'date', label: 'Fecha' },
                { key: 'claimType', label: 'Tipo' },
                { key: 'montoGofo', label: 'Descontó Gofo', align: 'right' },
                { key: 'estadoRevision', label: 'Revisión', align: 'center' },
                { key: 'estado', label: 'Estado', align: 'center' },
              ]}
              rows={claimsChofer.map((c) => ({ ...c, _key: c.id }))}
              onRowClick={(row) => row.waybill && navigate(`/tracking/${encodeURIComponent(row.waybill)}`)}
              emptyText="Sin claims en el periodo."
              renderCell={(row, key) => {
                if (key === 'montoGofo') return money(row.montoGofo)
                if (key === 'claimType') return etiquetaTipoClaim(row.claimType)
                if (key === 'estadoRevision') {
                  const e = row.estadoRevision
                  if (e === 'anulado') return <Badge color="slate">Anulado</Badge>
                  if (e === 'pendiente') return <Badge color="gold">Pendiente</Badge>
                  if (row.esRepetido) return <Badge color="green">Aprobado</Badge>
                  return <span className="text-slate-300 dark:text-slate-600">—</span>
                }
                if (key === 'estado') return row.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo</Badge>
                return row[key] || '—'
              }}
            />
          </Card>
          </>)}
        </>
      )}
    </div>
  )
}
