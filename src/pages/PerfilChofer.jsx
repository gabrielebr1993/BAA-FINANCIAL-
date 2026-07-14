import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Truck, Star, MapPin, DollarSign, Package, AlertTriangle, TrendingUp, Wallet, PackageX, Route, Settings2, Eye, EyeOff, HandCoins, Gift, FileSpreadsheet, FileText } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import {
  calcularPagos, promediosFlota, calificarChofer, buscarDriver,
  claimsValidos, porCiudad, claimsDeCiudad, nombreCiudadDe, etiquetaTipoClaim, feeDeClaim, TODAS,
} from '../utils/calc'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { Card, KPI, PageTitle, Badge, Tabla, Cargando, EstadoVacio, Aviso, Boton } from '../components/ui'
import { TrendCard } from '../components/charts'
import VerificacionChofer from '../components/VerificacionChofer'
import FotoPerfil from '../components/FotoPerfil'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }

// Dato rápido en forma de "pill" para la cabecera.
function Pill({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 dark:border-slate-700/60 dark:bg-slate-800/50">
      {Icon && <Icon size={15} strokeWidth={1.8} className="text-brand-gold" />}
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{value}</span>
    </div>
  )
}

export default function PerfilChofer() {
  const { nombre } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(nombre || '')
  const { facturaRango: inv, invoicesRango, claims, drivers, selectedCity, activeCompanyId, empresaActiva, reloadDrivers, cargando, ajustes, ajustesPorChofer } = useData()
  const modoRuta = (inv?.modoConfig || ajustes?.modoConfig) === 'ruta'
  const [pagosStatus, setPagosStatus] = useState({}) // invoiceId -> 'pagado' | 'pendiente'
  const [pagosStatusSemana, setPagosStatusSemana] = useState({}) // semana -> estado (respaldo si el invoiceId no coincide por duplicados)
  const [verDatos, setVerDatos] = useState(false) // ojo: mostrar datos sensibles (personal/banco/Stripe)
  const [verMontosClaim, setVerMontosClaim] = useState(false) // ojo: montos de claims (mi descuento / Gofo)

  const driver = useMemo(() => buscarDriver(drivers, decoded), [drivers, decoded])
  const pagos = useMemo(() => calcularPagos(inv, claims, drivers, selectedCity, ajustesPorChofer), [inv, claims, drivers, selectedCity, ajustesPorChofer])
  const prom = useMemo(() => promediosFlota(pagos), [pagos])
  const pago = useMemo(() => pagos.find((p) => p.nombre === decoded) || null, [pagos, decoded])
  const calif = useMemo(() => (pago ? calificarChofer({ ...pago, paquetes: pago.individuales + pago.dobles }, prom) : null), [pago, prom])
  // Tarifas para la cabecera: de la actividad si la hay, si no del registro del chofer.
  const tarInd = pago ? pago.tarifaInd : (driver ? Number(driver.precioIndividual) || 0 : 0)
  const tarDob = pago ? pago.tarifaDoble : (driver ? Number(driver.precioDoble) || 0 : 0)

  // Claims del chofer en el periodo (respetando ciudad).
  const claimsChofer = useMemo(() => claimsDeCiudad(claims, selectedCity, inv).filter((c) => c.courier === decoded), [claims, selectedCity, decoded, inv])
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
        const p = calcularPagos(f, claimsSemana, drivers, selectedCity, f.ajustesPago || null).find((x) => x.nombre === decoded)
        if (!p) return null
        return {
          id: f.id,
          semana: f.semana,
          fechaInicio: f.fechaInicio,
          paquetes: p.individuales + p.dobles,
          totalPagar: p.totalPagar,
          prestamo: p.prestamo || 0,
          bono: p.bono || 0,
          descuentoClaims: p.descuentoClaims || 0,
          claims: p.claimsTotales,
          fallidos: p.fallidos || 0,
          ingreso: p.ingreso || 0,
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

  // Exportar el resumen de pagos del chofer por el RANGO actual (Excel / PDF), con el
  // nombre de la empresa. Útil si el chofer pide su recibo.
  const nombreEmpresa = empresaActiva?.nombre || 'MilePay'
  const estadoDe = (h) => ((pagosStatus[h.id] || pagosStatusSemana[h.semana]) === 'pagado' ? 'Pagado' : 'Pendiente')
  const archivoPago = `${nombreEmpresa} - Pagos ${decoded}`.replace(/[^\w\s.-]/g, '').trim()
  const exportarPagoExcel = () => exportarExcel(archivoPago, [
    { nombre: 'Pagos', rows: historial.map((h) => ({
      Semana: h.semana, Entregas: h.paquetes, Claims: h.claims, Fallidos: h.fallidos,
      Prestamo: -(h.prestamo || 0), Bono: h.bono || 0, 'Descuento claims': -(h.descuentoClaims || 0),
      Pagado: h.totalPagar, Estado: estadoDe(h),
    })) },
  ])
  const exportarPagoPDF = () => exportarPDF(archivoPago, `${nombreEmpresa} — Recibo de pagos`, `${decoded}`, [
    { titulo: 'Resumen de pagos por semana', head: ['Semana', 'Entregas', 'Claims', 'Préstamo', 'Bono', 'Pagado', 'Estado'],
      body: historial.map((h) => [h.semana, num(h.paquetes), num(h.claims), h.prestamo > 0 ? `-${money(h.prestamo)}` : money(0), h.bono > 0 ? `+${money(h.bono)}` : money(0), money(h.totalPagar), estadoDe(h)]) },
    { titulo: 'Total del periodo', head: ['Concepto', 'Monto'], body: [['Total pagado', money(totalPagadoAcumulado)]] },
  ])
  const trendData = [...historial].reverse().map((h) => ({ name: h.semana, entregas: h.paquetes, claims: h.claims }))

  // Estado de pago por semana (payroll).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!activeCompanyId || !decoded) return
      const snap = await getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('driverNombre', '==', decoded)))
      const m = {}, mSem = {}
      snap.docs.forEach((d) => {
        const x = d.data()
        m[x.invoiceId] = x.estado || 'pendiente'
        // Por semana: 'pagado' gana (si alguna factura de esa semana quedó pagada).
        if (x.semana && (x.estado === 'pagado' || !mSem[x.semana])) mSem[x.semana] = x.estado || 'pendiente'
      })
      if (vivo) { setPagosStatus(m); setPagosStatusSemana(mSem) }
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
          {/* Cabecera (hero) */}
          <Card className="mb-4 overflow-hidden">
            {/* Banda superior con degradado + calificación destacada */}
            <div className="relative overflow-hidden bg-gradient-to-br from-brand-navy via-brand-navy to-brand-steel px-5 pb-16 pt-5 sm:px-7">
              {/* Resplandor dorado suave y difuminado (decorativo) */}
              <div className="pointer-events-none absolute -bottom-16 left-4 h-52 w-52 rounded-full bg-brand-gold/25 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -top-10 right-24 h-36 w-36 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden />
              {calif && (
                <div className="absolute right-4 top-4 flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur">
                  <span className="grid h-11 w-11 place-items-center rounded-full text-base font-extrabold text-white ring-2 ring-white/40" style={{ background: COLOR_NIVEL[calif.nivel] }}>{calif.puntaje}</span>
                  <div className="pr-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                      {calif.etiqueta}
                      <span className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={13} strokeWidth={1.8} className={n <= calif.estrellas ? 'fill-brand-gold text-brand-gold' : 'text-white/30'} />
                        ))}
                      </span>
                    </div>
                    <div className="hidden text-[11px] text-white/70 sm:block">{calif.desglose}</div>
                  </div>
                </div>
              )}
            </div>
            {/* Cuerpo con la foto sobrepuesta */}
            <div className="px-5 pb-5 sm:px-7">
              <div className="-mt-12 flex flex-wrap items-end gap-4">
                <div className="relative shrink-0">
                  {/* Halo dorado difuminado detrás de la foto */}
                  <div className="pointer-events-none absolute -inset-2.5 rounded-[1.4rem] bg-brand-gold/40 blur-xl dark:bg-brand-gold/30" aria-hidden />
                  <div className="relative">
                    <FotoPerfil url={driver?.fotoUrl} alt={decoded} icon={Truck} ringClass="ring-4 ring-white dark:ring-surface-dark-card shadow-lg" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-2xl font-bold text-brand-navy dark:text-slate-100">{decoded}</h2>
                    {driver ? (
                      driver.activo === false ? <Badge color="slate">Inactivo</Badge> : <Badge color="green">Activo</Badge>
                    ) : <Badge color="red">Sin tarifa</Badge>}
                  </div>
                </div>
              </div>
              {/* Datos rápidos en pills */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill icon={MapPin} label="Ciudad" value={ciudades.join(', ') || '—'} />
                <Pill icon={Settings2} label="Modo de pago" value={modoRuta ? 'Por ruta' : 'Estándar (por ciudad)'} />
                {modoRuta && <Pill icon={Route} label="Ruta" value={inv?.asignacionRuta?.[decoded] || driver?.rutaDefault || '—'} />}
                <Pill label="Tarifa individual" value={money(tarInd)} />
                <Pill label="Tarifa doble" value={money(tarDob)} />
              </div>
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
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen del periodo</h3>
              <div className="flex flex-wrap gap-3">
              <KPI label="Entregas" value={num(pago.individuales + pago.dobles)} icon={Package} accent="navy" sub={`${num(pago.individuales)} ind · ${num(pago.dobles)} dob`} />
              <KPI label="Ingreso generado" value={money(pago.ingreso)} icon={DollarSign} accent="green" />
              <KPI label="Se le pagó" value={money(pago.totalPagar)} icon={Wallet} accent="gold" sub={[pago.descuentoClaims > 0 ? `−${money(pago.descuentoClaims)} claims` : '', pago.prestamo > 0 ? `−${money(pago.prestamo)} préstamo` : '', pago.bono > 0 ? `+${money(pago.bono)} bono` : ''].filter(Boolean).join(' · ') || undefined} />
              <KPI label="Ganancia que deja" value={money(pago.ganancia)} icon={TrendingUp} accent="blue" sub={pct(pago.ingreso > 0 ? pago.ganancia / pago.ingreso : 0)} />
              <KPI label="Préstamo (loan)" value={pago.prestamo > 0 ? `−${money(pago.prestamo)}` : money(0)} icon={HandCoins} accent="red" sub="descuento" />
              <KPI label="Bono" value={pago.bono > 0 ? `+${money(pago.bono)}` : money(0)} icon={Gift} accent="green" sub="a favor" />
              <KPI label="Claims" value={num(pago.claimsTotales)} icon={AlertTriangle} accent="red" sub={pago.claimsPerdonados > 0 ? `${num(pago.claimsPerdonados)} perdonados` : undefined} />
              <KPI label="Paquetes fallidos" value={num(pago.fallidos || 0)} icon={PackageX} accent="amber" sub={(pago.fallidos || 0) > 0 ? `${pct(pago.pctFallidos || 0)} de sus entregas` : 'sin fallidos'} />
              </div>
            </div>
          )}

          {/* Verificación del chofer + estado de pago (Stripe). Datos sensibles ocultos
              por defecto (información personal, bancaria y Stripe): se muestran con el ojo. */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Datos personales, bancarios y Stripe</h3>
              <button onClick={() => setVerDatos((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-brand-gold dark:border-slate-700 dark:text-slate-300" title={verDatos ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles'}>
                {verDatos ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
                {verDatos ? 'Ocultar datos' : 'Ver datos'}
              </button>
            </div>
            {verDatos ? (
              <VerificacionChofer driver={driver} activeCompanyId={activeCompanyId} onReload={reloadDrivers} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40">
                Información personal, bancaria y de Stripe oculta. Toca <b>“Ver datos”</b> para mostrarla.
              </div>
            )}
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
          {(pago || historial.length > 0 || claimsChofer.length > 0) && (<>
          <Card className="mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Historial de pagos</h3>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Total pagado en el rango: <b className="text-brand-navy dark:text-slate-100">{money(totalPagadoAcumulado)}</b></span>
                {historial.length > 0 && (
                  <>
                    <Boton variant="ghost" onClick={exportarPagoExcel} className="px-2.5 py-1 text-xs"><FileSpreadsheet size={13} strokeWidth={1.8} /> Excel</Boton>
                    <Boton variant="gold" onClick={exportarPagoPDF} className="px-2.5 py-1 text-xs"><FileText size={13} strokeWidth={1.8} /> PDF</Boton>
                  </>
                )}
              </div>
            </div>
            <Tabla
              columns={[
                { key: 'semana', label: 'Semana' },
                { key: 'paquetes', label: 'Entregas', align: 'right' },
                { key: 'claims', label: 'Claims', align: 'right' },
                { key: 'fallidos', label: 'Fallidos', align: 'right' },
                { key: 'prestamo', label: 'Préstamo', align: 'right' },
                { key: 'bono', label: 'Bono', align: 'right' },
                { key: 'totalPagar', label: 'Pagado', align: 'right' },
                { key: 'estado', label: 'Estado', align: 'center' },
              ]}
              rows={historial.map((h) => ({ ...h, _key: h.id }))}
              emptyText="Sin semanas en el rango."
              renderCell={(row, key) => {
                if (key === 'totalPagar') return <b>{money(row.totalPagar)}</b>
                if (key === 'prestamo') return row.prestamo > 0 ? <span className="text-rose-600 dark:text-rose-400">−{money(row.prestamo)}</span> : <span className="text-slate-400">{money(0)}</span>
                if (key === 'bono') return row.bono > 0 ? <span className="text-emerald-600 dark:text-emerald-400">+{money(row.bono)}</span> : <span className="text-slate-400">{money(0)}</span>
                if (key === 'paquetes' || key === 'claims' || key === 'fallidos') return num(row[key] || 0)
                if (key === 'estado') {
                  const e = pagosStatus[row.id] || pagosStatusSemana[row.semana]
                  return e === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>
                }
                return row[key]
              }}
            />
          </Card>

          {/* Detalle de claims */}
          <Card className="p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Detalle de claims ({claimsChofer.length})</h3>
              <button onClick={() => setVerMontosClaim((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-gold dark:border-slate-700 dark:text-slate-300" title={verMontosClaim ? 'Ocultar montos' : 'Mostrar montos'}>
                {verMontosClaim ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
                {verMontosClaim ? 'Ocultar montos' : 'Ver montos'}
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-400">“Te cobré” = lo que le descontaste al chofer por ese claim · “Descontó Gofo” = lo que Gofo te quitó a ti. Haz clic en un claim para abrir la ficha del tracking.</p>
            <Tabla
              columns={[
                { key: 'waybill', label: 'Waybill' },
                { key: 'date', label: 'Fecha' },
                { key: 'claimType', label: 'Tipo' },
                { key: 'miDescuento', label: 'Te cobré', align: 'right' },
                { key: 'montoGofo', label: 'Descontó Gofo', align: 'right' },
                { key: 'estadoRevision', label: 'Revisión', align: 'center' },
                { key: 'estado', label: 'Estado', align: 'center' },
              ]}
              rows={claimsChofer.map((c) => ({ ...c, _key: c.id }))}
              onRowClick={(row) => row.waybill && navigate(`/tracking/${encodeURIComponent(row.waybill)}`)}
              emptyText="Sin claims en el periodo."
              renderCell={(row, key) => {
                if (key === 'miDescuento') { const v = row.perdonado ? 0 : feeDeClaim(inv, row.ciudad, row); return verMontosClaim ? <span className="font-semibold text-rose-600 dark:text-rose-400">{row.perdonado ? '—' : `−${money(v)}`}</span> : '••••' }
                if (key === 'montoGofo') return verMontosClaim ? <span className="text-slate-500">−{money(Math.abs(Number(row.montoGofo) || 0))}</span> : '••••'
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
