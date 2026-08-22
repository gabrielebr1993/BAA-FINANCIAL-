import { useMemo, useState } from 'react'
import {
  Download, Plus, Mail, MessageCircle, Truck, Building2, Wallet, Clock,
  AlertTriangle, CheckCircle2, FileText, X, Copy, Files, Ban, Calendar,
  Receipt, Hash, ChevronRight, Filter,
} from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { crear, guardar, siguienteSecuencia } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { armarFactura, armarAvisoPago, estadoDocumento, diasParaVencer } from '../domain/facturacion'
import { enlacesEnvio, partesContacto } from '../domain/envio'
import { generarFacturaPDF } from '../data/facturaPDF'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso } from '../../components/ui'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

// ── Estados visuales ────────────────────────────────────────────────────────
// Devuelve la etiqueta + color principal del documento y si está vencido.
function estadoInfo(r, tipo, t) {
  const e = r.estado
  if (e === 'pagada' || e === 'pagado') return { label: tipo === 'cliente' ? t('Pagada') : t('Pagado'), color: 'green' }
  if (e === 'anulada') return { label: t('Anulada'), color: 'slate' }
  if (e === 'rechazada') return { label: t('Disputada'), color: 'red' }
  if (e === 'firmada') return { label: t('Firmada'), color: 'blue' }
  return { label: tipo === 'cliente' ? t('Enviada') : t('Enviado'), color: 'gold' }
}
const esVencida = (r) => !['pagada', 'anulada'].includes(r.estado) && estadoDocumento(r.vence).estado === 'vencido'

const PALETA = ['bg-brand-navy', 'bg-brand-steel', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-violet-500']
const colorDe = (s) => PALETA[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]
const inicialesDe = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// Campo con etiqueta uniforme (todos los recuadros del mismo tamaño).
function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

// Tarjeta de KPI (resumen) con ícono, acento de color y valor grande.
const ACENTO = {
  navy: 'from-brand-navy/10 text-brand-navy dark:text-slate-100',
  green: 'from-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  gold: 'from-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'from-rose-500/15 text-rose-600 dark:text-rose-400',
}
function Stat({ icon: Icon, label, value, sub, color = 'navy', onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${clickable ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${color === 'green' ? 'bg-emerald-500' : color === 'gold' ? 'bg-amber-500' : color === 'red' ? 'bg-rose-500' : 'bg-brand-navy'}`} />
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br to-transparent ${ACENTO[color]}`}><Icon size={16} /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-black ${color === 'green' ? 'text-emerald-600 dark:text-emerald-400' : color === 'gold' ? 'text-amber-600 dark:text-amber-400' : color === 'red' ? 'text-rose-600 dark:text-rose-400' : 'text-brand-navy dark:text-slate-100'}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

// Pequeña píldora de conteo por estado (fila secundaria del resumen).
function Pildora({ label, n, color }) {
  const c = { green: 'text-emerald-600 dark:text-emerald-400', gold: 'text-amber-600 dark:text-amber-400', red: 'text-rose-600 dark:text-rose-400', blue: 'text-brand-steel dark:text-brand-steel-soft', slate: 'text-slate-500 dark:text-slate-300' }[color] || ''
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
      <span className={`font-black ${c}`}>{n}</span>
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
    </span>
  )
}

export default function Facturacion() {
  const { t } = useLang()
  const { tenantId, usuario, rol } = useBulkAuth()
  const empresa = usuario?.empresa || 'Freight'
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: facturas } = useColeccion('invoices')
  const { datos: avisos } = useColeccion('carrierStatements')
  const [tab, setTab] = useState('clientes')
  const [msg, setMsg] = useState(null)

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Facturación y pagos')}</PageTitle>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        {t('Emite y cobra facturas a clientes y controla los pagos a transportistas, todo en un solo lugar con estados, vencimientos y envío por email o WhatsApp.')}
      </p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Pestañas segmentadas */}
      <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800/60 sm:inline-grid sm:auto-cols-max sm:grid-flow-col">
        {[{ k: 'clientes', l: t('Facturas a clientes'), icon: Building2 }, { k: 'transportistas', l: t('Pagos a transportistas'), icon: Truck }].map((it) => (
          <button key={it.k} onClick={() => setTab(it.k)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === it.k ? 'bg-brand-navy text-white shadow dark:bg-amber-500 dark:text-slate-900' : 'text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
            <it.icon size={16} /> {it.l}
          </button>
        ))}
      </div>

      {tab === 'clientes'
        ? <FacturasClientes clientes={clientes} ordenes={ordenes} facturas={facturas} empresa={empresa} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} t={t} />
        : <PagosTransportistas carriers={carriers} ordenes={ordenes} avisos={avisos} empresa={empresa} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} t={t} />}
    </div>
  )
}

// ── Facturas a CLIENTES (para que me paguen) ────────────────────────────────
function FacturasClientes({ clientes, ordenes, facturas, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ clienteId: '', desde: '', hasta: '' })
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const [chip, setChip] = useState('todas')
  const [detalle, setDetalle] = useState(null)
  const [porAnular, setPorAnular] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const cliente = (id) => clientes.find((c) => c.id === id)
  const nombreCliente = (id) => cliente(id)?.nombre || '—'
  const preview = useMemo(() => f.clienteId ? armarFactura(ordenes.filter((o) => o.clienteId === f.clienteId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])
  const filtradasBusq = useMemo(() => filtrarFacturas(facturas, busq, { nombreKey: 'clienteNombre' }), [facturas, busq])

  // Filtro rápido por estado, encima del buscador.
  const coincideChip = (r) => {
    if (chip === 'todas') return true
    if (chip === 'pendientes') return r.estado === 'enviada' && !esVencida(r)
    if (chip === 'firmadas') return r.estado === 'firmada'
    if (chip === 'pagadas') return r.estado === 'pagada'
    if (chip === 'vencidas') return esVencida(r)
    if (chip === 'disputadas') return r.estado === 'rechazada'
    if (chip === 'anuladas') return r.estado === 'anulada'
    return true
  }
  const lista = useMemo(
    () => filtradasBusq.filter(coincideChip).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradasBusq, chip]
  )

  const filtroActivo = hayFiltroActivo(busq)
  // KPIs sobre el conjunto FILTRADO por el buscador (fecha, etc.). Las anuladas NO cuentan.
  const kpis = useMemo(() => {
    let total = 0, cobrado = 0, vencido = 0
    const c = { enviada: 0, firmada: 0, pagada: 0, rechazada: 0, anulada: 0, vencida: 0 }
    for (const r of filtradasBusq || []) {
      c[r.estado] = (c[r.estado] || 0) + 1
      if (r.estado === 'anulada') continue
      const v = Number(r.total) || 0
      total += v
      if (r.estado === 'pagada') cobrado += v
      else if (esVencida(r)) { vencido += v; c.vencida += 1 }
    }
    return { total, cobrado, porCobrar: total - cobrado, vencido, n: filtradasBusq.length, c }
  }, [filtradasBusq])
  const periodoTxt = (busq.desde || busq.hasta) ? `${busq.desde || '…'} → ${busq.hasta || t('hoy')}` : (filtroActivo ? t('resultados del filtro') : t('histórico total'))

  const marcarPagada = async (r) => {
    const pagar = r.estado !== 'pagada'
    await guardar('invoices', r.id, { estado: pagar ? 'pagada' : (r.firma ? 'firmada' : 'enviada'), pagadaEn: pagar ? new Date().toISOString() : null })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: pagar ? 'factura_pagada' : 'factura_no_pagada', entidad: 'factura', detalle: `${r.numero} · ${r.clienteNombre}` })
    setDetalle((d) => (d && d.id === r.id ? { ...d, estado: pagar ? 'pagada' : (r.firma ? 'firmada' : 'enviada') } : d))
  }
  const anular = async (r) => {
    await guardar('invoices', r.id, { estado: 'anulada', anuladaEn: new Date().toISOString() })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'factura_anulada', entidad: 'factura', detalle: `${r.numero} · ${r.clienteNombre}` })
    setPorAnular(null); setDetalle((d) => (d && d.id === r.id ? { ...d, estado: 'anulada' } : d))
    setMsg({ tipo: 'ok', txt: `${t('Factura')} ${r.numero} ${t('anulada.')}` })
  }
  const duplicar = async (r) => {
    const seq = await siguienteSecuencia(tenantId, 'factura')
    const numero = `FAC-${String(seq).padStart(5, '0')}`
    const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    await crear('invoices', tenantId, {
      numero, clienteId: r.clienteId, clienteNombre: r.clienteNombre, desde: r.desde || null, hasta: r.hasta || null, vence,
      lineas: r.lineas || [], subtotal: r.subtotal ?? r.total ?? 0, total: r.total || 0, toneladas: r.toneladas || 0,
      estado: 'enviada', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'duplicar_factura', entidad: 'factura', detalle: `${numero} · ${r.clienteNombre}` })
    setMsg({ tipo: 'ok', txt: `${t('Factura duplicada como')} ${numero}.` })
  }

  const generar = async () => {
    if (!f.clienteId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: t('Selecciona un cliente con órdenes entregadas en el periodo.') }); return }
    const seq = await siguienteSecuencia(tenantId, 'factura')
    const numero = `FAC-${String(seq).padStart(5, '0')}`
    const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    await crear('invoices', tenantId, {
      numero, clienteId: f.clienteId, clienteNombre: nombreCliente(f.clienteId),
      desde: f.desde || null, hasta: f.hasta || null, vence,
      lineas: preview.lineas, subtotal: preview.subtotal, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviada', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_factura', entidad: 'factura', detalle: `${numero} · ${nombreCliente(f.clienteId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `${t('Factura')} ${numero} ${t('generada y enviada al cliente para su aprobación.')}` })
    setF({ clienteId: '', desde: '', hasta: '' })
  }

  const CHIPS = [
    { k: 'todas', l: t('Todas'), n: filtradasBusq.length },
    { k: 'pendientes', l: t('Pendientes'), n: filtradasBusq.filter((r) => r.estado === 'enviada' && !esVencida(r)).length },
    { k: 'firmadas', l: t('Firmadas'), n: kpis.c.firmada },
    { k: 'pagadas', l: t('Pagadas'), n: kpis.c.pagada },
    { k: 'vencidas', l: t('Vencidas'), n: kpis.c.vencida },
    { k: 'disputadas', l: t('Disputadas'), n: kpis.c.rechazada },
    { k: 'anuladas', l: t('Anuladas'), n: kpis.c.anulada },
  ].filter((c) => c.k === 'todas' || c.n > 0)

  return (
    <>
      {/* Resumen */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Resumen')}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${filtroActivo ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{periodoTxt}</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FileText} label={t('Facturado')} value={money(kpis.total)} sub={`${kpis.n} ${t('facturas')}`} color="navy" />
        <Stat icon={CheckCircle2} label={t('Cobrado')} value={money(kpis.cobrado)} sub={`${kpis.c.pagada} ${t('pagadas')}`} color="green" onClick={() => setChip('pagadas')} />
        <Stat icon={Clock} label={t('Por cobrar')} value={money(kpis.porCobrar)} color="gold" />
        <Stat icon={AlertTriangle} label={t('Vencido')} value={money(kpis.vencido)} sub={kpis.c.vencida ? `${kpis.c.vencida} ${t('vencidas')}` : undefined} color="red" onClick={() => setChip('vencidas')} />
      </div>
      {/* Conteos por estado */}
      <div className="mb-5 flex flex-wrap gap-2">
        {kpis.c.enviada > 0 && <Pildora label={t('enviadas')} n={kpis.c.enviada} color="gold" />}
        {kpis.c.firmada > 0 && <Pildora label={t('firmadas')} n={kpis.c.firmada} color="blue" />}
        {kpis.c.rechazada > 0 && <Pildora label={t('disputadas')} n={kpis.c.rechazada} color="red" />}
        {kpis.c.anulada > 0 && <Pildora label={t('anuladas')} n={kpis.c.anulada} color="slate" />}
      </div>

      {/* Nueva factura */}
      <Card className="mb-5 p-5">
        <h3 className="m-0 mb-4 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Plus size={16} className="text-amber-500" /> {t('Nueva factura al cliente')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label={t('Cliente')}>
            <Select value={f.clienteId} onChange={set('clienteId')} className="h-11 w-full"><option value="">{t('— Cliente —')}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          </Campo>
          <Campo label={t('Desde')}><Input type="date" value={f.desde} onChange={set('desde')} className="h-11 w-full" /></Campo>
          <Campo label={t('Hasta')}><Input type="date" value={f.hasta} onChange={set('hasta')} className="h-11 w-full" /></Campo>
        </div>
        {preview && (
          <div className={`mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl p-4 text-sm ${preview.n === 0 ? 'bg-slate-50 text-slate-400 dark:bg-slate-800/50' : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'}`}>
            {preview.n === 0 ? <span>{t('Sin órdenes entregadas para ese cliente/periodo.')}</span> : (
              <>
                <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{preview.n}</b> {t('órdenes')}</span>
                <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{preview.toneladas}</b> {t('ton')}</span>
                <span className="ml-auto text-slate-500 dark:text-slate-300">{t('Total')} <b className="text-lg text-emerald-600 dark:text-emerald-400">{money(preview.total)}</b></span>
              </>
            )}
          </div>
        )}
        <div className="mt-4">
          <Boton variant="gold" onClick={generar} disabled={!preview || preview.n === 0} className="w-full justify-center px-6 sm:w-auto"><Plus size={16} /> {t('Generar factura')}</Boton>
        </div>
      </Card>

      {/* Facturas emitidas */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas emitidas')}</h3>
          <span className="text-sm text-slate-400">({hayFiltroActivo(busq) || chip !== 'todas' ? `${lista.length}/${facturas.length}` : facturas.length})</span>
        </div>
        {facturas.length > 0 && (
          <>
            <div className="scroll-thin mb-3 flex items-center gap-1.5 overflow-x-auto">
              <Filter size={14} className="flex-shrink-0 text-slate-400" />
              {CHIPS.map((c) => (
                <button key={c.k} onClick={() => setChip(c.k)} className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${chip === c.k ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                  {c.l}<span className={`rounded-full px-1.5 text-[10px] ${chip === c.k ? 'bg-white/20' : 'bg-slate-200/80 dark:bg-slate-600/60'}`}>{c.n}</span>
                </button>
              ))}
            </div>
            <BuscadorFacturas f={busq} setF={setBusq} conNombre placeholderTexto={t('Número o cliente…')} />
          </>
        )}
        {facturas.length === 0 ? <EstadoVacioFact t={t} texto={t('Aún no hay facturas. Genera la primera arriba.')} />
          : lista.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{t('No hay facturas que coincidan con los criterios de búsqueda.')}</p> : (
            <div className="mt-3 space-y-2.5">
              {lista.map((r) => (
                <DocCard key={r.id} r={r} tipo="cliente" empresa={empresa} cliente={cliente} t={t}
                  onVer={() => setDetalle(r)} onPagar={() => marcarPagada(r)} onDuplicar={() => duplicar(r)} onAnular={() => setPorAnular(r)} setMsg={setMsg} />
              ))}
            </div>
          )}
      </Card>

      {detalle && (
        <DocDrawer r={detalle} tipo="cliente" empresa={empresa} persona={cliente(detalle.clienteId)} t={t}
          onClose={() => setDetalle(null)} onPagar={() => marcarPagada(detalle)} onDuplicar={() => duplicar(detalle)} onAnular={() => setPorAnular(detalle)} setMsg={setMsg} />
      )}

      {porAnular && (
        <ConfirmAnular r={porAnular} t={t} onClose={() => setPorAnular(null)} onConfirm={() => anular(porAnular)} />
      )}
    </>
  )
}

// ── Avisos de PAGO a TRANSPORTISTAS ─────────────────────────────────────────
function PagosTransportistas({ carriers, ordenes, avisos, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const [chip, setChip] = useState('todas')
  const [detalle, setDetalle] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const carrier = (id) => carriers.find((c) => c.id === id)
  const nombreCarrier = (id) => carrier(id)?.nombre || '—'
  const preview = useMemo(() => f.carrierId ? armarAvisoPago(ordenes.filter((o) => o.transportistaId === f.carrierId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])
  const filtradasBusq = useMemo(() => filtrarFacturas(avisos, busq, { nombreKey: 'carrierNombre' }), [avisos, busq])
  const coincideChip = (r) => chip === 'todas' || (chip === 'pendientes' ? r.estado !== 'pagado' : r.estado === 'pagado')
  const lista = useMemo(
    () => filtradasBusq.filter(coincideChip).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradasBusq, chip]
  )

  const filtroActivo = hayFiltroActivo(busq)
  const kpis = useMemo(() => {
    let total = 0, pagado = 0, nPag = 0
    for (const r of filtradasBusq || []) { const v = Number(r.total) || 0; total += v; if (r.estado === 'pagado') { pagado += v; nPag += 1 } }
    return { total, pagado, pendiente: total - pagado, n: filtradasBusq.length, nPag, nPend: filtradasBusq.length - nPag }
  }, [filtradasBusq])
  const periodoTxt = (busq.desde || busq.hasta) ? `${busq.desde || '…'} → ${busq.hasta || t('hoy')}` : (filtroActivo ? t('resultados del filtro') : t('histórico total'))

  const generar = async () => {
    if (!f.carrierId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: t('Selecciona un transportista con cargas entregadas en el periodo.') }); return }
    const seq = await siguienteSecuencia(tenantId, 'pago')
    const numero = `PAGO-${String(seq).padStart(5, '0')}`
    await crear('carrierStatements', tenantId, {
      numero, carrierId: f.carrierId, carrierNombre: nombreCarrier(f.carrierId),
      desde: f.desde || null, hasta: f.hasta || null, fechaPago: f.fechaPago || null,
      lineas: preview.lineas, subtotal: preview.subtotal, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviado', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'aviso_pago_transportista', entidad: 'pago', detalle: `${numero} · ${nombreCarrier(f.carrierId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `${t('Aviso de pago')} ${numero} ${t('generado. Envíaselo al transportista para que sepa cuánto y cuándo le pagas.')}` })
    setF({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  }
  const marcarPagado = async (r) => {
    const pagar = r.estado !== 'pagado'
    await guardar('carrierStatements', r.id, { estado: pagar ? 'pagado' : 'enviado', pagadoEn: pagar ? new Date().toISOString() : null })
    setDetalle((d) => (d && d.id === r.id ? { ...d, estado: pagar ? 'pagado' : 'enviado' } : d))
  }
  const duplicar = async (r) => {
    const seq = await siguienteSecuencia(tenantId, 'pago')
    const numero = `PAGO-${String(seq).padStart(5, '0')}`
    await crear('carrierStatements', tenantId, {
      numero, carrierId: r.carrierId, carrierNombre: r.carrierNombre, desde: r.desde || null, hasta: r.hasta || null, fechaPago: null,
      lineas: r.lineas || [], subtotal: r.subtotal ?? r.total ?? 0, total: r.total || 0, toneladas: r.toneladas || 0,
      estado: 'enviado', ts: new Date().toISOString(),
    })
    setMsg({ tipo: 'ok', txt: `${t('Aviso duplicado como')} ${numero}.` })
  }

  const CHIPS = [
    { k: 'todas', l: t('Todos'), n: filtradasBusq.length },
    { k: 'pendientes', l: t('Pendientes'), n: kpis.nPend },
    { k: 'pagados', l: t('Pagados'), n: kpis.nPag },
  ].filter((c) => c.k === 'todas' || c.n > 0)

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Resumen')}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${filtroActivo ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{periodoTxt}</span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat icon={Wallet} label={t('A pagar')} value={money(kpis.total)} sub={`${kpis.n} ${t('avisos')}`} color="navy" />
        <Stat icon={CheckCircle2} label={t('Pagado')} value={money(kpis.pagado)} sub={`${kpis.nPag} ${t('pagados')}`} color="green" onClick={() => setChip('pagados')} />
        <Stat icon={Clock} label={t('Pendiente')} value={money(kpis.pendiente)} sub={kpis.nPend ? `${kpis.nPend} ${t('pendientes')}` : undefined} color="gold" onClick={() => setChip('pendientes')} />
      </div>

      <Card className="mb-5 p-5">
        <h3 className="m-0 mb-4 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Plus size={16} className="text-amber-500" /> {t('Nuevo aviso de pago al transportista')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label={t('Transportista')}>
            <Select value={f.carrierId} onChange={set('carrierId')} className="h-11 w-full"><option value="">{t('— Transportista —')}</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          </Campo>
          <Campo label={t('Desde')}><Input type="date" value={f.desde} onChange={set('desde')} className="h-11 w-full" /></Campo>
          <Campo label={t('Hasta')}><Input type="date" value={f.hasta} onChange={set('hasta')} className="h-11 w-full" /></Campo>
          <Campo label={t('Te pago el')}><Input type="date" value={f.fechaPago} onChange={set('fechaPago')} className="h-11 w-full" /></Campo>
        </div>
        {preview && (
          <div className={`mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl p-4 text-sm ${preview.n === 0 ? 'bg-slate-50 text-slate-400 dark:bg-slate-800/50' : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'}`}>
            {preview.n === 0 ? <span>{t('Sin cargas entregadas para ese transportista/periodo.')}</span> : (
              <>
                <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{preview.n}</b> {t('cargas')}</span>
                <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{preview.toneladas}</b> {t('ton')}</span>
                <span className="ml-auto text-slate-500 dark:text-slate-300">{t('Le pagas')} <b className="text-lg text-emerald-600 dark:text-emerald-400">{money(preview.total)}</b></span>
              </>
            )}
          </div>
        )}
        <div className="mt-4">
          <Boton variant="gold" onClick={generar} disabled={!preview || preview.n === 0} className="w-full justify-center px-6 sm:w-auto"><Plus size={16} /> {t('Generar aviso de pago')}</Boton>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago emitidos')}</h3>
          <span className="text-sm text-slate-400">({hayFiltroActivo(busq) || chip !== 'todas' ? `${lista.length}/${avisos.length}` : avisos.length})</span>
        </div>
        {avisos.length > 0 && (
          <>
            <div className="scroll-thin mb-3 flex items-center gap-1.5 overflow-x-auto">
              <Filter size={14} className="flex-shrink-0 text-slate-400" />
              {CHIPS.map((c) => (
                <button key={c.k} onClick={() => setChip(c.k)} className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${chip === c.k ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                  {c.l}<span className={`rounded-full px-1.5 text-[10px] ${chip === c.k ? 'bg-white/20' : 'bg-slate-200/80 dark:bg-slate-600/60'}`}>{c.n}</span>
                </button>
              ))}
            </div>
            <BuscadorFacturas f={busq} setF={setBusq} conNombre placeholderTexto={t('Número o transportista…')} montoLabel={t('Monto de pago…')} />
          </>
        )}
        {avisos.length === 0 ? <EstadoVacioFact t={t} texto={t('Aún no hay avisos de pago. Genera el primero arriba.')} />
          : lista.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">{t('No hay avisos de pago que coincidan con los criterios de búsqueda.')}</p> : (
            <div className="mt-3 space-y-2.5">
              {lista.map((r) => (
                <DocCard key={r.id} r={r} tipo="carrier" empresa={empresa} cliente={carrier} t={t}
                  onVer={() => setDetalle(r)} onPagar={() => marcarPagado(r)} onDuplicar={() => duplicar(r)} setMsg={setMsg} />
              ))}
            </div>
          )}
      </Card>

      {detalle && (
        <DocDrawer r={detalle} tipo="carrier" empresa={empresa} persona={carrier(detalle.carrierId)} t={t}
          onClose={() => setDetalle(null)} onPagar={() => marcarPagado(detalle)} onDuplicar={() => duplicar(detalle)} setMsg={setMsg} />
      )}
    </>
  )
}

// ── Tarjeta de un documento (factura / aviso) ───────────────────────────────
function DocCard({ r, tipo, t, onVer, onPagar }) {
  const persona = tipo === 'cliente' ? r.clienteNombre : r.carrierNombre
  const info = estadoInfo(r, tipo, t)
  const venc = tipo === 'cliente' ? estadoDocumento(r.vence) : null
  const dias = tipo === 'cliente' ? diasParaVencer(r.vence) : null
  const pagado = r.estado === 'pagada' || r.estado === 'pagado'
  return (
    <div onClick={onVer} className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:p-4">
      <div className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl text-sm font-black text-white ${colorDe(persona)}`}>{inicialesDe(persona)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-black text-brand-navy dark:text-slate-100">{r.numero}</span>
          <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{persona}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><Calendar size={12} /> {r.desde || '—'} → {r.hasta || '—'}</span>
          {tipo === 'cliente'
            ? <span className={`inline-flex items-center gap-1 ${!pagado && venc?.estado === 'vencido' ? 'font-bold text-rose-600 dark:text-rose-400' : ''}`}><Clock size={12} /> {t('Vence')} {r.vence || '—'}{!pagado && dias != null && dias >= 0 && dias <= 7 ? ` · ${dias}${t('d')}` : ''}</span>
            : <span className="inline-flex items-center gap-1"><Wallet size={12} /> {t('Pago')} {r.fechaPago || '—'}</span>}
          <span>{r.toneladas || 0} {t('ton')}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge color={info.color}>{info.label}{r.firma ? ' ✓' : ''}</Badge>
        {tipo === 'cliente' && esVencida(r) && <Badge color="red">{t('vencida')}</Badge>}
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
        <div className="text-right text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.total)}</div>
      </div>
      <div className="flex items-center gap-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        {r.estado !== 'anulada' && (
          <button onClick={onPagar} title={pagado ? t('Marcar pendiente') : t('Marcar pagada')} className={`grid h-8 w-8 place-items-center rounded-lg transition ${pagado ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700'}`}><CheckCircle2 size={16} /></button>
        )}
        <button onClick={onVer} title={t('Ver detalle')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

// ── Drawer de detalle ───────────────────────────────────────────────────────
function DocDrawer({ r, tipo, empresa, persona, t, onClose, onPagar, onDuplicar, onAnular, setMsg }) {
  const nombre = tipo === 'cliente' ? r.clienteNombre : r.carrierNombre
  const info = estadoInfo(r, tipo, t)
  const pagado = r.estado === 'pagada' || r.estado === 'pagado'
  const { email, tel } = partesContacto(persona?.contacto)
  const asunto = tipo === 'cliente' ? `${t('Factura')} ${r.numero} · ${empresa}` : `${t('Aviso de pago')} ${r.numero} · ${empresa}`
  const cuerpo = tipo === 'cliente'
    ? `${t('Estimado')} ${nombre},\n${t('Adjuntamos la factura')} ${r.numero} ${t('por')} ${money(r.total)} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${t('Gracias.')} ${empresa}`
    : `${t('Estimado')} ${nombre},\n${t('Te informamos el pago de')} ${money(r.total)} ${t('por')} ${r.lineas?.length || 0} ${t('cargas')} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${r.fechaPago ? `${t('Fecha de pago:')} ${r.fechaPago}.` : ''}\n${empresa}`
  const enlaces = enlacesEnvio(persona?.contacto, { asunto, cuerpo })
  const copiar = async () => {
    try { await navigator.clipboard.writeText(`${asunto}\n${cuerpo}`); setMsg({ tipo: 'ok', txt: t('Resumen copiado al portapapeles.') }) }
    catch { setMsg({ tipo: 'warn', txt: t('No se pudo copiar.') }) }
  }
  const historial = [
    r.ts && { label: t('Emitida'), fecha: r.ts },
    r.firmadaEn && { label: t('Firmada por el cliente'), fecha: r.firmadaEn },
    r.rechazadaEn && { label: `${t('Disputada')}${r.motivoRechazo ? ` · ${r.motivoRechazo}` : ''}`, fecha: r.rechazadaEn },
    r.pagadaEn && { label: t('Pagada'), fecha: r.pagadaEn },
    r.pagadoEn && { label: t('Pagado'), fecha: r.pagadoEn },
    r.anuladaEn && { label: t('Anulada'), fecha: r.anuladaEn },
  ].filter(Boolean).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))

  const accion = (Icon, label, onClick, danger) => (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${danger ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10' : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={onClose}>
      <div className="animate-slide-up flex h-full w-full max-w-lg flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-base font-black text-white ${colorDe(nombre)}`}>{inicialesDe(nombre)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-black text-brand-navy dark:text-slate-100">{r.numero}</span>
                <Badge color={info.color}>{info.label}{r.firma ? ' ✓' : ''}</Badge>
                {tipo === 'cliente' && esVencida(r) && <Badge color="red">{t('vencida')}</Badge>}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-600 dark:text-slate-300">{nombre}</div>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X size={18} /></button>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(r.total)}</div>
        </div>

        {/* Cuerpo */}
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          {/* Datos */}
          <div className="grid grid-cols-2 gap-2">
            <DatoMini icon={Calendar} label={t('Periodo')} value={`${r.desde || '—'} → ${r.hasta || '—'}`} />
            {tipo === 'cliente'
              ? <DatoMini icon={Clock} label={t('Vence')} value={r.vence || '—'} alerta={esVencida(r)} />
              : <DatoMini icon={Wallet} label={t('Fecha de pago')} value={r.fechaPago || '—'} />}
            <DatoMini icon={Receipt} label={t('Toneladas')} value={`${r.toneladas || 0} ton`} />
            <DatoMini icon={Hash} label={t('Líneas')} value={String((r.lineas || []).length)} />
          </div>

          {/* Persona */}
          {persona && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                {tipo === 'cliente' ? <Building2 size={13} /> : <Truck size={13} />} {tipo === 'cliente' ? t('Cliente') : t('Transportista')}
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{persona.nombre}</div>
              {persona.rfc && <div className="text-xs text-slate-400">{t('Tax ID')}: {persona.rfc}</div>}
              {email && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Mail size={12} /> {email}</div>}
              {tel && <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><MessageCircle size={12} /> {tel}</div>}
              {persona.facturacion && <div className="mt-0.5 text-xs text-slate-400">{persona.facturacion}</div>}
            </div>
          )}

          {/* Líneas */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Detalle')}</h3>
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2 bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <span className="flex-1">{t('Orden / Material')}</span><span className="w-14 text-right">{t('Ton')}</span><span className="w-20 text-right">{t('Importe')}</span>
              </div>
              {(r.lineas || []).length === 0 ? <div className="px-3 py-4 text-center text-xs text-slate-400">{t('Sin líneas')}</div>
                : (r.lineas || []).map((l, i) => (
                  <div key={l.orderId || i} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${i % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/30'}`}>
                    <span className="min-w-0 flex-1"><span className="font-mono text-xs font-semibold text-brand-navy dark:text-slate-200">{l.numero || '—'}</span>{l.material ? <span className="ml-1 text-slate-500 dark:text-slate-400">· {l.material}</span> : ''}</span>
                    <span className="w-14 text-right tabular-nums text-slate-500 dark:text-slate-400">{l.ton || 0}</span>
                    <span className="w-20 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">{money(l.precio)}</span>
                  </div>
                ))}
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <span className="flex-1 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Total')}</span>
                <span className="text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.total)}</span>
              </div>
            </div>
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Historial')}</h3>
              <div className="space-y-1.5">
                {historial.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-200"><CheckCircle2 size={11} /></span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{h.label}</span>
                    <span className="ml-auto text-slate-400">{String(h.fecha).slice(0, 16).replace('T', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pie de acciones */}
        <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-1.5">
            {accion(Download, 'PDF', () => generarFacturaPDF(r, { empresa, titulo: tipo === 'cliente' ? 'FACTURA' : 'AVISO DE PAGO', paraLabel: tipo === 'cliente' ? t('Cliente') : t('Transportista'), para: nombre, clienteNombre: nombre }))}
            {enlaces.mailto && <a href={enlaces.mailto} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50"><Mail size={13} /> Email</a>}
            {enlaces.whatsapp && <a href={enlaces.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"><MessageCircle size={13} /> WhatsApp</a>}
            {accion(Copy, t('Copiar'), copiar)}
            {accion(Files, t('Duplicar'), onDuplicar)}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {r.estado !== 'anulada' && accion(CheckCircle2, pagado ? t('Marcar pendiente') : (tipo === 'cliente' ? t('Registrar pago') : t('Marcar pagado')), onPagar)}
            {tipo === 'cliente' && r.estado !== 'anulada' && r.estado !== 'pagada' && <div className="ml-auto">{accion(Ban, t('Anular'), onAnular, true)}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DatoMini({ icon: Icon, label, value, alerta }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon size={11} /> {label}</div>
      <div className={`mt-0.5 text-sm font-bold ${alerta ? 'text-rose-600 dark:text-rose-400' : 'text-brand-navy dark:text-slate-100'}`}>{value}</div>
    </div>
  )
}

// Confirmación de anulación (acción crítica con advertencia).
function ConfirmAnular({ r, t, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><Ban size={18} /></span>
          <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Anular factura')}</h3>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          {t('Vas a anular la factura')} <b>{r.numero}</b> {t('de')} <b>{r.clienteNombre}</b> ({money(r.total)}). {t('Dejará de contar en tus totales de facturado y por cobrar. Esta acción queda registrada y no se puede deshacer.')}
        </p>
        <div className="flex justify-end gap-2">
          <Boton variant="ghost" onClick={onClose}>{t('Cancelar')}</Boton>
          <Boton variant="danger" onClick={onConfirm}><Ban size={15} /> {t('Sí, anular')}</Boton>
        </div>
      </Card>
    </div>
  )
}

// Estado vacío bonito para las listas.
function EstadoVacioFact({ t, texto }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><FileText size={26} /></div>
      <p className="m-0 text-sm text-slate-400">{texto}</p>
    </div>
  )
}
