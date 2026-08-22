import { useMemo, useState } from 'react'
import { Download, Plus, Mail, MessageCircle, Truck, Building2, DollarSign, Wallet, Clock, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { crear, guardar, siguienteSecuencia } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { armarFactura, armarAvisoPago, estadoDocumento } from '../domain/facturacion'
import { enlacesEnvio } from '../domain/envio'
import { generarFacturaPDF } from '../data/facturaPDF'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, Tabla } from '../../components/ui'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ESTADO_COLOR = { enviada: 'gold', firmada: 'green', pagada: 'navy', rechazada: 'slate', enviado: 'gold', pagado: 'green' }

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
function Stat({ icon: Icon, label, value, sub, color = 'navy' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Pestañas segmentadas, más grandes y claras. */}
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
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const cliente = (id) => clientes.find((c) => c.id === id)
  const nombreCliente = (id) => cliente(id)?.nombre || '—'
  const preview = useMemo(() => f.clienteId ? armarFactura(ordenes.filter((o) => o.clienteId === f.clienteId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])
  const facturasFiltradas = useMemo(() => filtrarFacturas(facturas, busq, { nombreKey: 'clienteNombre' }), [facturas, busq])

  // Resumen (KPIs) sobre el CONJUNTO FILTRADO (por fecha de emisión y demás criterios
  // del buscador de abajo). Así "Facturado / Cobrado / Por cobrar / Vencido" responden
  // al rango de tiempo elegido; sin filtro = histórico total.
  const filtroActivo = hayFiltroActivo(busq)
  const kpis = useMemo(() => {
    let total = 0, cobrado = 0, vencido = 0
    for (const r of facturasFiltradas || []) {
      const v = Number(r.total) || 0
      total += v
      if (r.estado === 'pagada') cobrado += v
      else if (estadoDocumento(r.vence).estado === 'vencido') vencido += v
    }
    return { total, cobrado, porCobrar: total - cobrado, vencido, n: facturasFiltradas.length }
  }, [facturasFiltradas])
  const periodoTxt = (busq.desde || busq.hasta) ? `${busq.desde || '…'} → ${busq.hasta || t('hoy')}` : (filtroActivo ? t('resultados del filtro') : t('histórico total'))

  const marcarPagada = async (r) => {
    const pagar = r.estado !== 'pagada'
    await guardar('invoices', r.id, { estado: pagar ? 'pagada' : (r.firma ? 'firmada' : 'enviada'), pagadaEn: pagar ? new Date().toISOString() : null })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: pagar ? 'factura_pagada' : 'factura_no_pagada', entidad: 'factura', detalle: `${r.numero} · ${r.clienteNombre}` })
  }

  const generar = async () => {
    if (!f.clienteId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: t('Selecciona un cliente con órdenes entregadas en el periodo.') }); return }
    const seq = await siguienteSecuencia(tenantId, 'factura')
    const numero = `FAC-${String(seq).padStart(5, '0')}`
    const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    await crear('invoices', tenantId, {
      numero, clienteId: f.clienteId, clienteNombre: nombreCliente(f.clienteId),
      desde: f.desde || null, hasta: f.hasta || null, vence,
      lineas: preview.lineas, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviada', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_factura', entidad: 'factura', detalle: `${numero} · ${nombreCliente(f.clienteId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `${t('Factura')} ${numero} ${t('generada y enviada al cliente para su aprobación.')}` })
    setF({ clienteId: '', desde: '', hasta: '' })
  }

  return (
    <>
      {/* Resumen — responde al filtro de fecha del buscador (más abajo). */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Resumen')}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${filtroActivo ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{periodoTxt}</span>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FileText} label={t('Facturado')} value={money(kpis.total)} sub={`${kpis.n} ${t('facturas')}`} color="navy" />
        <Stat icon={CheckCircle2} label={t('Cobrado')} value={money(kpis.cobrado)} color="green" />
        <Stat icon={Clock} label={t('Por cobrar')} value={money(kpis.porCobrar)} color="gold" />
        <Stat icon={AlertTriangle} label={t('Vencido')} value={money(kpis.vencido)} color="red" />
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
        {/* Vista previa del periodo seleccionado. */}
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
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas emitidas')} <span className="text-slate-400">({hayFiltroActivo(busq) ? `${facturasFiltradas.length}/${facturas.length}` : facturas.length})</span></h3>
        {facturas.length > 0 && <BuscadorFacturas f={busq} setF={setBusq} conNombre placeholderTexto={t('Número o cliente…')} />}
        {facturas.length === 0 ? <EstadoVacioFact t={t} texto={t('Aún no hay facturas.')} />
          : facturasFiltradas.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{t('No hay facturas que coincidan con los criterios de búsqueda.')}</p> : (
          <div className="scroll-thin overflow-x-auto">
            <Tabla
              columns={[{ key: 'numero', label: t('Factura') }, { key: 'clienteNombre', label: t('Cliente') }, { key: 'periodo', label: t('Periodo') }, { key: 'vence', label: t('Vence') }, { key: 'toneladas', label: t('Ton'), align: 'right' }, { key: 'total', label: t('Total'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: t('Enviar'), align: 'right' }]}
              rows={facturasFiltradas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
              renderCell={(r, k) => {
                if (k === 'numero') return <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{r.numero}</span>
                if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
                if (k === 'vence') { const ed = estadoDocumento(r.vence); return <span className={`text-xs ${r.estado !== 'pagada' && ed.estado === 'vencido' ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{r.vence || '—'}</span> }
                if (k === 'total') return <span className="font-bold text-brand-navy dark:text-slate-100">{money(r.total)}</span>
                if (k === 'estado') {
                  const vencida = r.estado !== 'pagada' && estadoDocumento(r.vence).estado === 'vencido'
                  return (
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => marcarPagada(r)} title={t('Marcar pagada / pendiente')}><Badge color={ESTADO_COLOR[r.estado] || 'slate'}>{r.estado}{r.firma ? ' ✓' : ''}</Badge></button>
                      {r.estado === 'rechazada' && <span title={r.motivoRechazo || ''} className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">{t('disputada')}</span>}
                      {vencida && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">{t('vencida')}</span>}
                    </div>
                  )
                }
                if (k === 'acciones') {
                  const asunto = `${t('Factura')} ${r.numero} · ${empresa}`
                  const cuerpo = `${t('Estimado')} ${r.clienteNombre},\n${t('Adjuntamos la factura')} ${r.numero} ${t('por')} ${money(r.total)} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${t('Gracias.')} ${empresa}`
                  const enlaces = enlacesEnvio(cliente(r.clienteId)?.contacto, { asunto, cuerpo })
                  return <AccionesEnvio r={r} enlaces={enlaces} empresa={empresa} paraLabel={t('Cliente')} paraNombre={r.clienteNombre} t={t} />
                }
                return r[k]
              }}
            />
          </div>
        )}
      </Card>
    </>
  )
}

// ── Avisos de PAGO a TRANSPORTISTAS (para que sepan cuándo/cuánto les pago) ───
function PagosTransportistas({ carriers, ordenes, avisos, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const carrier = (id) => carriers.find((c) => c.id === id)
  const nombreCarrier = (id) => carrier(id)?.nombre || '—'
  const preview = useMemo(() => f.carrierId ? armarAvisoPago(ordenes.filter((o) => o.transportistaId === f.carrierId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])
  const avisosFiltrados = useMemo(() => filtrarFacturas(avisos, busq, { nombreKey: 'carrierNombre' }), [avisos, busq])

  const filtroActivo = hayFiltroActivo(busq)
  const kpis = useMemo(() => {
    let total = 0, pagado = 0
    for (const r of avisosFiltrados || []) { const v = Number(r.total) || 0; total += v; if (r.estado === 'pagado') pagado += v }
    return { total, pagado, pendiente: total - pagado, n: avisosFiltrados.length }
  }, [avisosFiltrados])
  const periodoTxt = (busq.desde || busq.hasta) ? `${busq.desde || '…'} → ${busq.hasta || t('hoy')}` : (filtroActivo ? t('resultados del filtro') : t('histórico total'))

  const generar = async () => {
    if (!f.carrierId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: t('Selecciona un transportista con cargas entregadas en el periodo.') }); return }
    const seq = await siguienteSecuencia(tenantId, 'pago')
    const numero = `PAGO-${String(seq).padStart(5, '0')}`
    await crear('carrierStatements', tenantId, {
      numero, carrierId: f.carrierId, carrierNombre: nombreCarrier(f.carrierId),
      desde: f.desde || null, hasta: f.hasta || null, fechaPago: f.fechaPago || null,
      lineas: preview.lineas, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviado', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'aviso_pago_transportista', entidad: 'pago', detalle: `${numero} · ${nombreCarrier(f.carrierId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `${t('Aviso de pago')} ${numero} ${t('generado. Envíaselo al transportista para que sepa cuánto y cuándo le pagas.')}` })
    setF({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  }

  const marcarPagado = async (r) => {
    await guardar('carrierStatements', r.id, { estado: r.estado === 'pagado' ? 'enviado' : 'pagado', pagadoEn: r.estado === 'pagado' ? null : new Date().toISOString() })
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Resumen')}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${filtroActivo ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{periodoTxt}</span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat icon={Wallet} label={t('A pagar')} value={money(kpis.total)} sub={`${kpis.n} ${t('avisos')}`} color="navy" />
        <Stat icon={CheckCircle2} label={t('Pagado')} value={money(kpis.pagado)} color="green" />
        <Stat icon={Clock} label={t('Pendiente')} value={money(kpis.pendiente)} color="gold" />
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
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago emitidos')} <span className="text-slate-400">({hayFiltroActivo(busq) ? `${avisosFiltrados.length}/${avisos.length}` : avisos.length})</span></h3>
        {avisos.length > 0 && <BuscadorFacturas f={busq} setF={setBusq} conNombre placeholderTexto={t('Número o transportista…')} montoLabel={t('Monto de pago…')} />}
        {avisos.length === 0 ? <EstadoVacioFact t={t} texto={t('Aún no hay avisos de pago.')} />
          : avisosFiltrados.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{t('No hay avisos de pago que coincidan con los criterios de búsqueda.')}</p> : (
          <div className="scroll-thin overflow-x-auto">
            <Tabla
              columns={[{ key: 'numero', label: t('Aviso') }, { key: 'carrierNombre', label: t('Transportista') }, { key: 'periodo', label: t('Periodo') }, { key: 'fechaPago', label: t('Pago') }, { key: 'total', label: t('Le pagas'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: t('Enviar'), align: 'right' }]}
              rows={avisosFiltrados.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
              renderCell={(r, k) => {
                if (k === 'numero') return <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{r.numero}</span>
                if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
                if (k === 'fechaPago') return <span className="text-xs text-slate-400">{r.fechaPago || '—'}</span>
                if (k === 'total') return <span className="font-bold text-brand-navy dark:text-slate-100">{money(r.total)}</span>
                if (k === 'estado') return <button onClick={() => marcarPagado(r)} title={t('Marcar pagado / pendiente')}><Badge color={ESTADO_COLOR[r.estado] || 'slate'}>{r.estado}</Badge></button>
                if (k === 'acciones') {
                  const asunto = `${t('Aviso de pago')} ${r.numero} · ${empresa}`
                  const cuerpo = `${t('Estimado')} ${r.carrierNombre},\n${t('Te informamos el pago de')} ${money(r.total)} ${t('por')} ${r.lineas?.length || 0} ${t('cargas')} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${r.fechaPago ? `${t('Fecha de pago:')} ${r.fechaPago}.` : ''}\n${empresa}`
                  const enlaces = enlacesEnvio(carrier(r.carrierId)?.contacto, { asunto, cuerpo })
                  return <AccionesEnvio r={r} enlaces={enlaces} empresa={empresa} titulo="AVISO DE PAGO" paraLabel={t('Transportista')} paraNombre={r.carrierNombre} t={t} />
                }
                return r[k]
              }}
            />
          </div>
        )}
      </Card>
    </>
  )
}

// Estado vacío bonito para las listas.
function EstadoVacioFact({ t, texto }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><FileText size={22} /></div>
      <p className="m-0 text-sm text-slate-400">{texto}</p>
    </div>
  )
}

// Botonera de envío: PDF + email + WhatsApp (según el contacto disponible).
function AccionesEnvio({ r, enlaces, empresa, titulo = 'FACTURA', paraLabel = 'Cliente', paraNombre, t }) {
  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <Boton variant="ghost" onClick={() => generarFacturaPDF(r, { empresa, titulo, paraLabel, para: paraNombre, clienteNombre: paraNombre })} className="px-2 py-1 text-xs"><Download size={13} /> PDF</Boton>
      {enlaces.mailto && <a href={enlaces.mailto} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('Enviar por email')}><Mail size={13} /> Email</a>}
      {enlaces.whatsapp && <a href={enlaces.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20" title={t('Enviar por WhatsApp')}><MessageCircle size={13} /> WhatsApp</a>}
      {!enlaces.mailto && !enlaces.whatsapp && <span className="text-[11px] text-slate-400">{t('sin contacto')}</span>}
    </div>
  )
}
