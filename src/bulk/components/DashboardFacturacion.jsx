// ============================================================================
// BULK · Dashboard de FACTURACIÓN (role-aware). Un solo componente que resume:
//   · Cuentas por cobrar (facturas a clientes) y por pagar (a transportistas).
//   · KPIs, antigüedad de saldos (aging), gráfico mensual y filtros.
// El MISMO componente filtra y OCULTA secciones según el rol:
//   rol='admin'   → todo (por cobrar + por pagar).
//   rol='cliente' → solo SUS facturas (por cobrar).
//   rol='carrier' → solo SU estado de cuenta (por pagar).
// Reutiliza los montos ya guardados (no recalcula).
// ============================================================================
import { useMemo, useState } from 'react'
import { DollarSign, Clock, AlertTriangle, CheckCircle2, Wallet, TrendingUp, Search, Filter, ChevronRight } from 'lucide-react'
import { estadoDocumento, diasParaVencer } from '../domain/facturacion'
import { estadoInfoDoc, esVencidaDoc } from './FacturaDoc'
import { KPI, Card, Badge } from '../../components/ui'
import { money, num } from '../../utils/format'
import { useLang } from '../../i18n'

const tsMs = (d) => { try { return d?.ts ? new Date(d.ts).getTime() : 0 } catch { return 0 } }
const mesClave = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export default function DashboardFacturacion({ rol = 'admin', facturas = [], avisos = [], jobsMap = {}, onVer, soloResumen = false, t: tExt }) {
  const { t: tHook } = useLang()
  const t = tExt || tHook
  const verCobrar = rol === 'admin' || rol === 'cliente'
  const verPagar = rol === 'admin' || rol === 'carrier'

  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cliente, setCliente] = useState('')
  const [carrier, setCarrier] = useState('')
  const hayFiltro = q || estado !== 'todas' || desde || hasta || cliente || carrier
  const limpiar = () => { setQ(''); setEstado('todas'); setDesde(''); setHasta(''); setCliente(''); setCarrier('') }

  const enRango = (d) => {
    const f = String(d.ts || '').slice(0, 10)
    if (desde && f && f < desde) return false
    if (hasta && f && f > hasta) return false
    return true
  }
  const matchTexto = (campos) => { const s = q.trim().toLowerCase(); return !s || campos.filter(Boolean).some((v) => String(v).toLowerCase().includes(s)) }

  const facturasF = useMemo(() => (facturas || []).filter((f) => {
    if (!enRango(f)) return false
    if (cliente && f.clienteId !== cliente) return false
    if (estado !== 'todas') {
      if (estado === 'vencida') { if (!esVencidaDoc(f)) return false }
      else if (f.estado !== estado) return false
    }
    return matchTexto([f.numero, f.clienteNombre])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [facturas, q, estado, desde, hasta, cliente])

  const avisosF = useMemo(() => (avisos || []).filter((a) => {
    if (!enRango(a)) return false
    if (carrier && a.carrierId !== carrier) return false
    if (estado === 'pagada' && a.estado !== 'pagado') return false
    if (estado === 'pagado' && a.estado !== 'pagado') return false
    return matchTexto([a.numero, a.carrierNombre])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [avisos, q, estado, desde, hasta, carrier])

  // KPIs (reutilizan los montos guardados).
  const k = useMemo(() => {
    let facturado = 0, cobrado = 0, porCobrar = 0, vencido = 0
    for (const f of facturasF) {
      if (f.estado === 'anulada') continue
      const v = Number(f.total) || 0
      facturado += v
      if (f.estado === 'pagada') cobrado += v
      else { porCobrar += v; if (esVencidaDoc(f)) vencido += v }
    }
    let porPagar = 0, pagado = 0, aPagar = 0
    for (const a of avisosF) {
      const v = Number(a.total) || 0
      aPagar += v
      if (a.estado === 'pagado') pagado += v; else porPagar += v
    }
    return { facturado, cobrado, porCobrar, vencido, porPagar, pagado, aPagar, utilidad: cobrado - pagado }
  }, [facturasF, avisosF])

  // Aging de lo por cobrar (facturas no pagadas/anuladas).
  const aging = useMemo(() => {
    const b = { corriente: 0, d30: 0, d60: 0, d60p: 0 }
    for (const f of facturasF) {
      if (f.estado === 'pagada' || f.estado === 'anulada') continue
      const v = Number(f.total) || 0
      const dias = diasParaVencer(f.vence)
      if (dias == null || dias >= 0) b.corriente += v
      else if (dias >= -30) b.d30 += v
      else if (dias >= -60) b.d60 += v
      else b.d60p += v
    }
    return b
  }, [facturasF])

  // Gráfico: facturado vs cobrado por mes (últimos 6 meses).
  const chart = useMemo(() => {
    const map = {}
    for (const f of facturasF) {
      if (f.estado === 'anulada') continue
      const m = mesClave(tsMs(f) || Date.now())
      map[m] = map[m] || { facturado: 0, cobrado: 0 }
      map[m].facturado += Number(f.total) || 0
      if (f.estado === 'pagada') { const mc = mesClave(f.pagadaEn ? new Date(f.pagadaEn).getTime() : tsMs(f)); map[mc] = map[mc] || { facturado: 0, cobrado: 0 }; map[mc].cobrado += Number(f.total) || 0 }
    }
    const keys = Object.keys(map).sort().slice(-6)
    const max = Math.max(1, ...keys.map((m) => Math.max(map[m].facturado, map[m].cobrado)))
    return keys.map((m) => ({ m, ...map[m], etiqueta: MESES[parseInt(m.slice(5), 10) - 1] + ' ' + m.slice(2, 4), max }))
  }, [facturasF])

  const clientes = useMemo(() => [...new Map((facturas || []).map((f) => [f.clienteId, f.clienteNombre])).entries()].filter(([id]) => id), [facturas])
  const carriers = useMemo(() => [...new Map((avisos || []).map((a) => [a.carrierId, a.carrierNombre])).entries()].filter(([id]) => id), [avisos])

  const fecha = (s) => s || '—'
  const jobDe = (f) => { const l = (f.lineas || []).find((x) => x.jobNombre || x.jobId); return l ? (l.jobNombre ? `${l.jobCodigo ? l.jobCodigo + ' · ' : ''}${l.jobNombre}` : (jobsMap[l.jobId]?.codigo || '')) : '' }

  const inputCls = 'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {verCobrar && <KPI label={t('Facturado')} value={money(k.facturado)} icon={DollarSign} accent="navy" sub={`${facturasF.length} ${t('facturas')}`} />}
        {verCobrar && <KPI label={t('Por cobrar')} value={money(k.porCobrar)} icon={Clock} accent="gold" />}
        {verCobrar && <KPI label={t('Vencido')} value={money(k.vencido)} icon={AlertTriangle} accent="red" />}
        {verCobrar && <KPI label={t('Cobrado')} value={money(k.cobrado)} icon={CheckCircle2} accent="green" />}
        {verPagar && <KPI label={t('Por pagar')} value={money(k.porPagar)} icon={Wallet} accent="blue" sub={rol === 'carrier' ? t('a ti') : t('a transportistas')} />}
        {rol === 'admin' && <KPI label={t('Utilidad')} value={money(k.utilidad)} icon={TrendingUp} accent="gold" sub={t('cobrado − pagado')} />}
        {rol === 'carrier' && <KPI label={t('Pagado')} value={money(k.pagado)} icon={CheckCircle2} accent="green" />}
      </div>

      {/* Filtros */}
      {!soloResumen && <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Número, cliente, transportista…')} className={`${inputCls} w-full pl-8`} />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls} aria-label={t('Estado')}>
            <option value="todas">{t('Todos los estados')}</option>
            {verCobrar && <><option value="enviada">{t('Enviada')}</option><option value="firmada">{t('Firmada')}</option><option value="pagada">{t('Pagada')}</option><option value="vencida">{t('Vencida')}</option><option value="rechazada">{t('Disputada')}</option><option value="anulada">{t('Anulada')}</option></>}
          </select>
          {rol === 'admin' && clientes.length > 0 && (
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} aria-label={t('Cliente')}>
              <option value="">{t('Todos los clientes')}</option>
              {clientes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          )}
          {rol === 'admin' && carriers.length > 0 && (
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls} aria-label={t('Transportista')}>
              <option value="">{t('Todos los transportistas')}</option>
              {carriers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          )}
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} aria-label={t('Desde')} />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} aria-label={t('Hasta')} />
          {hayFiltro && <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50"><Filter size={13} /> {t('Limpiar')}</button>}
        </div>
      </Card>}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Aging */}
        {verCobrar && (
          <Card className="p-4">
            <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Antigüedad de saldos (por cobrar)')}</h3>
            {[['corriente', t('Corriente'), 'bg-emerald-500'], ['d30', t('1–30 días'), 'bg-amber-500'], ['d60', t('31–60 días'), 'bg-orange-500'], ['d60p', t('60+ días'), 'bg-rose-500']].map(([kk, lbl, color]) => {
              const val = aging[kk]; const tot = aging.corriente + aging.d30 + aging.d60 + aging.d60p
              const pct = tot > 0 ? Math.round((val / tot) * 100) : 0
              return (
                <div key={kk} className="mb-2.5">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-slate-600 dark:text-slate-300">{lbl}</span><span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">{money(val)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </Card>
        )}

        {/* Gráfico mensual */}
        {verCobrar && (
          <Card className="p-4">
            <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Facturado vs cobrado por mes')}</h3>
            {chart.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">{t('Sin datos en el período.')}</p> : (
              <div className="flex items-end justify-around gap-2" style={{ height: 160 }}>
                {chart.map((c) => (
                  <div key={c.m} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-[130px] items-end gap-1">
                      <div className="w-3 rounded-t bg-brand-navy dark:bg-slate-300" style={{ height: `${Math.round((c.facturado / c.max) * 120)}px` }} title={`${t('Facturado')}: ${money(c.facturado)}`} />
                      <div className="w-3 rounded-t bg-emerald-500" style={{ height: `${Math.round((c.cobrado / c.max) * 120)}px` }} title={`${t('Cobrado')}: ${money(c.cobrado)}`} />
                    </div>
                    <span className="text-[10px] text-slate-400">{c.etiqueta}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-navy dark:bg-slate-300" /> {t('Facturado')}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> {t('Cobrado')}</span>
            </div>
          </Card>
        )}
      </div>

      {/* Cuentas por cobrar */}
      {!soloResumen && verCobrar && (
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Cuentas por cobrar')} <span className="text-slate-400">({facturasF.length})</span></h3>
          {facturasF.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{t('Sin facturas para el filtro.')}</p> : (
            <div className="space-y-1.5">
              {facturasF.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((f) => {
                const info = estadoInfoDoc(f, 'cliente', t)
                return (
                  <button key={f.id} onClick={() => onVer && onVer(f.id, 'cliente')} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-brand-gold/50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <span className="font-mono text-xs font-bold text-brand-navy dark:text-slate-100">{f.numero}</span>
                    {rol === 'admin' && <span className="truncate text-sm text-slate-600 dark:text-slate-300">{f.clienteNombre}</span>}
                    {jobDe(f) && <span className="hidden truncate text-xs text-slate-400 sm:inline">{jobDe(f)}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      <span className="hidden text-xs text-slate-400 sm:inline">{fecha(f.vence)}</span>
                      <Badge color={info.color}>{info.label}</Badge>
                      {esVencidaDoc(f) && <Badge color="red">{t('vencida')}</Badge>}
                      <span className="tabular-nums text-sm font-bold text-slate-700 dark:text-slate-200">{money(f.total)}</span>
                      <ChevronRight size={15} className="text-slate-300" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Cuentas por pagar */}
      {!soloResumen && verPagar && (
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Cuentas por pagar (transportistas)')} <span className="text-slate-400">({avisosF.length})</span></h3>
          {avisosF.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{t('Sin avisos de pago para el filtro.')}</p> : (
            <div className="space-y-1.5">
              {avisosF.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((a) => (
                <button key={a.id} onClick={() => onVer && onVer(a.id, 'carrier')} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-brand-gold/50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <span className="font-mono text-xs font-bold text-brand-navy dark:text-slate-100">{a.numero}</span>
                  {rol === 'admin' && <span className="truncate text-sm text-slate-600 dark:text-slate-300">{a.carrierNombre}</span>}
                  <span className="hidden text-xs text-slate-400 sm:inline">{a.desde || '—'} → {a.hasta || '—'}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <Badge color={a.estado === 'pagado' ? 'green' : 'gold'}>{a.estado === 'pagado' ? t('Pagado') : t('Pendiente')}</Badge>
                    <span className="tabular-nums text-sm font-bold text-slate-700 dark:text-slate-200">{money(a.total)}</span>
                    <ChevronRight size={15} className="text-slate-300" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
