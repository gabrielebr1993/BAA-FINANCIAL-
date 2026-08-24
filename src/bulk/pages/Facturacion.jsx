import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Truck, Building2, Wallet, Clock, AlertTriangle, CheckCircle2, FileText, Files, Ban, Filter, LayoutDashboard, Mail, Pencil, Repeat, Power, Trash2, X } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { crear, guardar, eliminar, siguienteSecuencia } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { armarFactura, armarAvisoPago } from '../domain/facturacion'
import { PageTitle, Card, Boton, Input, Select, Cargando, Aviso } from '../../components/ui'
import { DocCard, DocDrawer, BotonDoc, esVencidaDoc } from '../components/FacturaDoc'
import DashboardFacturacion from '../components/DashboardFacturacion'
import EnviarFacturaEmail from '../components/EnviarFacturaEmail'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

// Enriquece las líneas con el código+nombre del job (para que viajen en la factura y se
// vean en el documento sin depender de permisos de lectura de jobs de cada rol).
const enriquecerLineas = (lineas, jobsMap = {}) => (lineas || []).map((l) => {
  const j = l.jobId ? jobsMap[l.jobId] : null
  return j ? { ...l, jobCodigo: j.codigo || '', jobNombre: j.nombre || '' } : l
})

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
  const navigate = useNavigate()
  const { tenantId, usuario, rol } = useBulkAuth()
  const empresa = usuario?.empresa || 'Freight'
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: facturas } = useColeccion('invoices')
  const { datos: avisos } = useColeccion('carrierStatements')
  const { datos: jobs } = useColeccion('jobs')
  const jobsMap = useMemo(() => { const m = {}; for (const j of jobs || []) m[j.id] = j; return m }, [jobs])
  const [tab, setTab] = useState('panel')
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
      <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800/60 sm:inline-grid sm:auto-cols-max sm:grid-flow-col">
        {[{ k: 'panel', l: t('Panel'), icon: LayoutDashboard }, { k: 'clientes', l: t('Facturas a clientes'), icon: Building2 }, { k: 'transportistas', l: t('Pagos a transportistas'), icon: Truck }].map((it) => (
          <button key={it.k} onClick={() => setTab(it.k)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === it.k ? 'bg-brand-navy text-white shadow dark:bg-amber-500 dark:text-slate-900' : 'text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
            <it.icon size={16} /> {it.l}
          </button>
        ))}
      </div>

      {tab === 'panel' && (
        <DashboardFacturacion rol="admin" facturas={facturas} avisos={avisos} jobsMap={jobsMap} onVer={(fid, tp) => navigate(`/bulk/facturas/${fid}?tipo=${tp}`)} t={t} />
      )}
      {tab === 'clientes' && <FacturasClientes clientes={clientes} ordenes={ordenes} facturas={facturas} jobsMap={jobsMap} empresa={empresa} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} t={t} />}
      {tab === 'transportistas' && <PagosTransportistas carriers={carriers} ordenes={ordenes} avisos={avisos} jobsMap={jobsMap} empresa={empresa} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} t={t} />}
    </div>
  )
}

// ── Facturas a CLIENTES (para que me paguen) ────────────────────────────────
function FacturasClientes({ clientes, ordenes, facturas, jobsMap, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ clienteId: '', desde: '', hasta: '' })
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const [chip, setChip] = useState('todas')
  const [detalle, setDetalle] = useState(null)
  const [porAnular, setPorAnular] = useState(null)
  const [porCorreo, setPorCorreo] = useState(null)
  const [porEditar, setPorEditar] = useState(null)
  const navigate = useNavigate()
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const cliente = (id) => clientes.find((c) => c.id === id)
  const nombreCliente = (id) => cliente(id)?.nombre || '—'
  const preview = useMemo(() => f.clienteId ? armarFactura(ordenes.filter((o) => o.clienteId === f.clienteId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])
  const filtradasBusq = useMemo(() => filtrarFacturas(facturas, busq, { nombreKey: 'clienteNombre' }), [facturas, busq])

  // Filtro rápido por estado, encima del buscador.
  const coincideChip = (r) => {
    if (chip === 'todas') return true
    if (chip === 'pendientes') return r.estado === 'enviada' && !esVencidaDoc(r)
    if (chip === 'firmadas') return r.estado === 'firmada'
    if (chip === 'pagadas') return r.estado === 'pagada'
    if (chip === 'vencidas') return esVencidaDoc(r)
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
      else if (esVencidaDoc(r)) { vencido += v; c.vencida += 1 }
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
  // Edición de una factura EMITIDA: nunca pisa el historial — cada guardado sube la
  // versión y registra quién cambió qué. Si ya estaba FIRMADA, vuelve a 'enviada'
  // (la firma era sobre otro contenido: el cliente debe firmar de nuevo).
  const editarGuardar = async (r, c) => {
    const version = (Number(r.version) || 1) + 1
    const reFirmar = r.estado === 'firmada'
    await guardar('invoices', r.id, {
      vence: c.vence || r.vence || null, lineas: c.lineas, subtotal: c.subtotal, total: c.total, toneladas: c.toneladas,
      version, historialCambios: [...(r.historialCambios || []), { ts: new Date().toISOString(), usuario: usuario?.email || '', version, detalle: c.detalle }],
      ...(reFirmar ? { estado: 'enviada', firma: null, firmante: null, firmadaEn: null } : {}),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'editar_factura', entidad: 'factura', detalle: `${r.numero} v${version} · ${c.detalle}` })
    setPorEditar(null); setDetalle(null)
    setMsg({ tipo: 'ok', txt: `${t('Factura')} ${r.numero} ${t('actualizada como versión')} ${version}.${reFirmar ? ' ' + t('El cliente deberá firmarla de nuevo.') : ''}` })
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
      lineas: enriquecerLineas(preview.lineas, jobsMap), subtotal: preview.subtotal, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviada', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_factura', entidad: 'factura', detalle: `${numero} · ${nombreCliente(f.clienteId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `${t('Factura')} ${numero} ${t('generada y enviada al cliente para su aprobación.')}` })
    setF({ clienteId: '', desde: '', hasta: '' })
  }

  const CHIPS = [
    { k: 'todas', l: t('Todas'), n: filtradasBusq.length },
    { k: 'pendientes', l: t('Pendientes'), n: filtradasBusq.filter((r) => r.estado === 'enviada' && !esVencidaDoc(r)).length },
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

      {/* Facturas recurrentes (se emiten solas por periodo) */}
      <RecurrentesCard clientes={clientes} jobsMap={jobsMap} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} t={t} />

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
                <DocCard key={r.id} r={r} tipo="cliente" t={t} onVer={() => setDetalle(r)} onPagar={() => marcarPagada(r)} />
              ))}
            </div>
          )}
      </Card>

      {detalle && (
        <DocDrawer r={detalle} tipo="cliente" empresa={empresa} persona={cliente(detalle.clienteId)} t={t} onClose={() => setDetalle(null)} setMsg={setMsg}
          pie={<>
            <BotonDoc icon={FileText} primary onClick={() => navigate(`/bulk/facturas/${detalle.id}?tipo=cliente`)}>{t('Ver documento')}</BotonDoc>
            {detalle.estado !== 'anulada' && <BotonDoc icon={Mail} onClick={() => { setPorCorreo(detalle); setDetalle(null) }}>{t('Enviar por correo')}</BotonDoc>}
            {detalle.estado !== 'anulada' && <BotonDoc icon={CheckCircle2} onClick={() => marcarPagada(detalle)}>{detalle.estado === 'pagada' ? t('Marcar pendiente') : t('Registrar pago')}</BotonDoc>}
            {!['anulada', 'pagada'].includes(detalle.estado) && <BotonDoc icon={Pencil} onClick={() => { setPorEditar(detalle); setDetalle(null) }}>{t('Editar')}</BotonDoc>}
            <BotonDoc icon={Files} onClick={() => duplicar(detalle)}>{t('Duplicar')}</BotonDoc>
            {detalle.estado !== 'anulada' && detalle.estado !== 'pagada' && <BotonDoc icon={Ban} danger onClick={() => setPorAnular(detalle)}>{t('Anular')}</BotonDoc>}
          </>} />
      )}

      {porCorreo && (
        <EnviarFacturaEmail r={porCorreo} tipo="cliente" persona={cliente(porCorreo.clienteId)} empresa={empresa}
          onClose={() => setPorCorreo(null)} onEnviado={(txt) => setMsg({ tipo: 'ok', txt })} />
      )}

      {porEditar && (
        <ModalEditarDoc r={porEditar} tipo="cliente" t={t} onClose={() => setPorEditar(null)} onGuardar={(c) => editarGuardar(porEditar, c)} />
      )}

      {porAnular && (
        <ConfirmAnular r={porAnular} t={t} onClose={() => setPorAnular(null)} onConfirm={() => anular(porAnular)} />
      )}
    </>
  )
}

// ── Avisos de PAGO a TRANSPORTISTAS ─────────────────────────────────────────
function PagosTransportistas({ carriers, ordenes, avisos, jobsMap, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const [chip, setChip] = useState('todas')
  const [detalle, setDetalle] = useState(null)
  const [porCorreo, setPorCorreo] = useState(null)
  const [porEditar, setPorEditar] = useState(null)
  const navigate = useNavigate()
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
      lineas: enriquecerLineas(preview.lineas, jobsMap), subtotal: preview.subtotal, total: preview.total, toneladas: preview.toneladas,
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
  // Edición de un aviso emitido, con versión + historial (igual que las facturas).
  const editarGuardar = async (r, c) => {
    const version = (Number(r.version) || 1) + 1
    await guardar('carrierStatements', r.id, {
      fechaPago: c.fechaPago || r.fechaPago || null, lineas: c.lineas, subtotal: c.subtotal, total: c.total, toneladas: c.toneladas,
      version, historialCambios: [...(r.historialCambios || []), { ts: new Date().toISOString(), usuario: usuario?.email || '', version, detalle: c.detalle }],
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'editar_aviso_pago', entidad: 'pago', detalle: `${r.numero} v${version} · ${c.detalle}` })
    setPorEditar(null); setDetalle(null)
    setMsg({ tipo: 'ok', txt: `${t('Aviso de pago')} ${r.numero} ${t('actualizado como versión')} ${version}.` })
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
                <DocCard key={r.id} r={r} tipo="carrier" t={t} onVer={() => setDetalle(r)} onPagar={() => marcarPagado(r)} />
              ))}
            </div>
          )}
      </Card>

      {detalle && (
        <DocDrawer r={detalle} tipo="carrier" empresa={empresa} persona={carrier(detalle.carrierId)} t={t} onClose={() => setDetalle(null)} setMsg={setMsg}
          pie={<>
            <BotonDoc icon={FileText} primary onClick={() => navigate(`/bulk/facturas/${detalle.id}?tipo=carrier`)}>{t('Ver documento')}</BotonDoc>
            <BotonDoc icon={Mail} onClick={() => { setPorCorreo(detalle); setDetalle(null) }}>{t('Enviar por correo')}</BotonDoc>
            <BotonDoc icon={CheckCircle2} onClick={() => marcarPagado(detalle)}>{detalle.estado === 'pagado' ? t('Marcar pendiente') : t('Marcar pagado')}</BotonDoc>
            {detalle.estado !== 'pagado' && <BotonDoc icon={Pencil} onClick={() => { setPorEditar(detalle); setDetalle(null) }}>{t('Editar')}</BotonDoc>}
            <BotonDoc icon={Files} onClick={() => duplicar(detalle)}>{t('Duplicar')}</BotonDoc>
          </>} />
      )}

      {porCorreo && (
        <EnviarFacturaEmail r={porCorreo} tipo="carrier" persona={carrier(porCorreo.carrierId)} empresa={empresa}
          onClose={() => setPorCorreo(null)} onEnviado={(txt) => setMsg({ tipo: 'ok', txt })} />
      )}

      {porEditar && (
        <ModalEditarDoc r={porEditar} tipo="carrier" t={t} onClose={() => setPorEditar(null)} onGuardar={(c) => editarGuardar(porEditar, c)} />
      )}
    </>
  )
}

// ── Edición de un documento EMITIDO (factura o aviso de pago) ───────────────
// Permite ajustar la fecha (vence / fecha de pago), corregir el importe de cada
// línea y quitar líneas. Los totales se recalculan solos y el guardado registra
// versión + detalle en el historial (nunca se pierde lo que decía antes).
const r2doc = (n) => Math.round((Number(n) || 0) * 100) / 100
function ModalEditarDoc({ r, tipo, t, onClose, onGuardar }) {
  const [fecha, setFecha] = useState((tipo === 'cliente' ? r.vence : r.fechaPago) || '')
  const [lineas, setLineas] = useState(() => (r.lineas || []).map((l) => ({ ...l })))
  const [motivo, setMotivo] = useState('')
  const setPrecio = (i) => (e) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, precio: e.target.value } : l)))
  const quitar = (i) => setLineas((ls) => ls.filter((_, j) => j !== i))
  const subtotal = r2doc(lineas.reduce((a, l) => a + (Number(l.precio) || 0), 0))
  const toneladas = r2doc(lineas.reduce((a, l) => a + (Number(l.ton) || 0), 0))
  const fechaOriginal = (tipo === 'cliente' ? r.vence : r.fechaPago) || ''

  const guardarCambios = () => {
    if (!lineas.length) return
    // Resumen legible de QUÉ cambió (queda en el historial y la auditoría).
    const originales = new Map((r.lineas || []).map((l) => [l.orderId || l.numero, l]))
    const conPrecioNuevo = lineas.filter((l) => { const o = originales.get(l.orderId || l.numero); return o && r2doc(o.precio) !== r2doc(l.precio) }).length
    const quitadas = (r.lineas || []).length - lineas.length
    const partes = []
    if (quitadas > 0) partes.push(`${quitadas} ${t('línea(s) quitada(s)')}`)
    if (conPrecioNuevo > 0) partes.push(`${t('importe de')} ${conPrecioNuevo} ${t('línea(s)')}`)
    if (fecha !== fechaOriginal) partes.push(`${tipo === 'cliente' ? t('vence') : t('fecha de pago')} ${fechaOriginal || '—'} → ${fecha || '—'}`)
    if (r2doc(r.total) !== subtotal) partes.push(`${t('total')} ${money(r.total)} → ${money(subtotal)}`)
    if (motivo.trim()) partes.push(motivo.trim())
    onGuardar({
      vence: tipo === 'cliente' ? fecha : undefined, fechaPago: tipo === 'carrier' ? fecha : undefined,
      lineas: lineas.map((l) => ({ ...l, precio: r2doc(l.precio), ton: r2doc(l.ton) })),
      subtotal, total: subtotal, toneladas,
      detalle: partes.length ? partes.join(' · ') : t('sin cambios de fondo'),
    })
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Pencil size={17} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{tipo === 'cliente' ? t('Editar factura') : t('Editar aviso de pago')} <span className="font-mono">{r.numero}</span></h3>
            <p className="m-0 text-xs text-slate-400">{t('Se guardará como versión')} {(Number(r.version) || 1) + 1} {t('y el cambio quedará en el historial.')}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          {r.estado === 'firmada' && (
            <Aviso tipo="warn">{t('Esta factura ya está FIRMADA por el cliente. Si guardas cambios volverá a estado «Enviada» y el cliente deberá firmarla de nuevo.')}</Aviso>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label={tipo === 'cliente' ? t('Vence') : t('Te pago el')}>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11 w-full" />
            </Campo>
            <Campo label={t('Motivo del cambio (opcional)')}>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t('Ej. corrección de tarifa acordada')} className="h-11 w-full" />
            </Campo>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Líneas')} ({lineas.length})</h4>
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              {lineas.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-rose-500">{t('No puedes dejar el documento sin líneas. Si quieres cancelarlo, usa «Anular».')}</div>
              ) : lineas.map((l, i) => (
                <div key={l.orderId || i} className={`flex items-center gap-2 px-3 py-2 text-sm ${i % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/30'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-semibold text-brand-navy dark:text-slate-200">{l.numero || '—'}</span>
                    {l.material ? <span className="ml-1 text-slate-500 dark:text-slate-400">· {l.material}</span> : ''}
                    <span className="ml-1 text-xs text-slate-400">· {l.ton || 0} {t('ton')}</span>
                  </span>
                  <Input type="number" step="0.01" min="0" value={l.precio} onChange={setPrecio(i)} className="h-9 w-28 text-right" />
                  <button onClick={() => quitar(i)} title={t('Quitar línea')} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{lineas.length}</b> {t('líneas')}</span>
            <span className="text-slate-500 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{toneladas}</b> {t('ton')}</span>
            <span className="ml-auto text-slate-500 dark:text-slate-300">{t('Nuevo total')} <b className={`text-lg ${subtotal !== r2doc(r.total) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(subtotal)}</b>{subtotal !== r2doc(r.total) && <span className="ml-1.5 text-xs text-slate-400 line-through">{money(r.total)}</span>}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-3.5 dark:border-slate-800">
          <Boton variant="ghost" onClick={onClose}>{t('Cancelar')}</Boton>
          <Boton variant="gold" onClick={guardarCambios} disabled={!lineas.length}><Pencil size={15} /> {t('Guardar versión')} {(Number(r.version) || 1) + 1}</Boton>
        </div>
      </Card>
    </div>
  )
}

// ── Facturas RECURRENTES (se emiten solas) ──────────────────────────────────
// El staff programa la regla (cliente + frecuencia + primera emisión) y el backend
// (bulkFacturasRecurrentes, diario 07:00 hora centro) emite la factura con las
// órdenes entregadas del periodo, con la MISMA numeración FAC- y el MISMO cálculo
// que las manuales. Si un periodo no tuvo órdenes, no genera factura vacía.
const FRECUENCIAS = [
  { k: 'semanal', l: 'Cada semana' },
  { k: 'quincenal', l: 'Cada 14 días' },
  { k: 'mensual', l: 'Cada mes' },
]
function RecurrentesCard({ clientes, jobsMap, tenantId, usuario, rol, setMsg, t }) {
  const { datos: reglas } = useColeccion('recurrentes')
  const hoy = new Date().toISOString().slice(0, 10)
  const [abrir, setAbrir] = useState(false)
  const [g, setG] = useState({ clienteId: '', jobId: '', frecuencia: 'mensual', cubreDesde: hoy, proximaEmision: '', venceDias: '30' })
  const [porBorrar, setPorBorrar] = useState(null)
  const set = (k) => (e) => setG((s) => ({ ...s, [k]: e.target.value }))
  const jobs = Object.values(jobsMap || {})
  const frecTxt = (k) => t((FRECUENCIAS.find((f) => f.k === k) || {}).l || k)

  const crearRegla = async () => {
    const cli = clientes.find((c) => c.id === g.clienteId)
    if (!cli || !g.proximaEmision) { setMsg({ tipo: 'warn', txt: t('Elige el cliente y la fecha de la primera emisión.') }); return }
    const job = jobs.find((j) => j.id === g.jobId)
    await crear('recurrentes', tenantId, {
      clienteId: cli.id, clienteNombre: cli.nombre || '',
      jobId: job?.id || null, jobNombre: job ? `${job.codigo ? job.codigo + ' · ' : ''}${job.nombre || ''}` : null,
      frecuencia: g.frecuencia, cubreDesde: g.cubreDesde || hoy, proximaEmision: g.proximaEmision,
      venceDias: Math.max(1, Number(g.venceDias) || 30), activa: true, creadaPor: usuario?.email || '',
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear_recurrente', entidad: 'factura', detalle: `${cli.nombre} · ${g.frecuencia} · 1ª emisión ${g.proximaEmision}` })
    setG({ clienteId: '', jobId: '', frecuencia: 'mensual', cubreDesde: hoy, proximaEmision: '', venceDias: '30' })
    setAbrir(false)
    setMsg({ tipo: 'ok', txt: `${t('Factura recurrente programada para')} ${cli.nombre}. ${t('La primera se emitirá el')} ${g.proximaEmision}.` })
  }
  const alternar = async (r) => {
    await guardar('recurrentes', r.id, { activa: !r.activa })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: r.activa ? 'pausar_recurrente' : 'reanudar_recurrente', entidad: 'factura', detalle: r.clienteNombre })
  }
  const borrar = async (r) => {
    await eliminar('recurrentes', r.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'eliminar_recurrente', entidad: 'factura', detalle: r.clienteNombre })
    setPorBorrar(null)
    setMsg({ tipo: 'ok', txt: t('Programación recurrente eliminada.') })
  }

  return (
    <Card className="mb-5 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Repeat size={16} className="text-amber-500" /> {t('Facturas recurrentes')}</h3>
        {reglas.length > 0 && <span className="text-sm text-slate-400">({reglas.length})</span>}
        <Boton variant={abrir ? 'ghost' : 'primary'} onClick={() => setAbrir((v) => !v)} className="ml-auto !px-3 !py-1.5 text-xs">{abrir ? t('Cerrar') : <><Plus size={14} /> {t('Programar')}</>}</Boton>
      </div>
      <p className="m-0 mb-3 text-xs text-slate-400">{t('Se generan solas cada periodo con las órdenes entregadas del cliente, misma numeración y mismo cálculo que las manuales (emisión diaria a las 7:00 a. m., hora centro).')}</p>

      {abrir && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label={t('Cliente')}>
              <Select value={g.clienteId} onChange={set('clienteId')} className="h-11 w-full"><option value="">{t('— Cliente —')}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
            </Campo>
            <Campo label={`${t('Job')} (${t('opcional')})`}>
              <Select value={g.jobId} onChange={set('jobId')} className="h-11 w-full"><option value="">{t('— Todos los jobs —')}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.codigo ? `${j.codigo} · ` : ''}{j.nombre}</option>)}</Select>
            </Campo>
            <Campo label={t('Frecuencia')}>
              <Select value={g.frecuencia} onChange={set('frecuencia')} className="h-11 w-full">{FRECUENCIAS.map((fr) => <option key={fr.k} value={fr.k}>{t(fr.l)}</option>)}</Select>
            </Campo>
            <Campo label={t('Cubre órdenes desde')}><Input type="date" value={g.cubreDesde} onChange={set('cubreDesde')} className="h-11 w-full" /></Campo>
            <Campo label={t('Primera emisión')}><Input type="date" value={g.proximaEmision} min={hoy} onChange={set('proximaEmision')} className="h-11 w-full" /></Campo>
            <Campo label={t('Días para vencer')}><Input type="number" min="1" value={g.venceDias} onChange={set('venceDias')} className="h-11 w-full" /></Campo>
          </div>
          <div className="mt-3">
            <Boton variant="gold" onClick={crearRegla} className="w-full justify-center px-6 sm:w-auto"><Repeat size={15} /> {t('Programar factura recurrente')}</Boton>
          </div>
        </div>
      )}

      {reglas.length === 0 ? (
        !abrir && <p className="m-0 py-2 text-center text-sm text-slate-400">{t('Aún no hay facturas recurrentes. Prográmalas y se emitirán solas.')}</p>
      ) : (
        <div className="space-y-2">
          {reglas.slice().sort((a, b) => (a.proximaEmision || '').localeCompare(b.proximaEmision || '')).map((r) => (
            <div key={r.id} className={`flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center ${r.activa ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-800/40'}`}>
              <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${r.activa ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-400 dark:bg-slate-700'}`}><Repeat size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{r.clienteNombre}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{frecTxt(r.frecuencia)}</span>
                  {r.jobNombre && <span className="rounded-full bg-brand-navy/5 px-2 py-0.5 text-[11px] font-semibold text-brand-navy dark:bg-white/10 dark:text-slate-200">{r.jobNombre}</span>}
                  {!r.activa && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{t('Pausada')}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><Clock size={12} /> {t('Próxima emisión')}: <b className="text-slate-600 dark:text-slate-300">{r.proximaEmision || '—'}</b></span>
                  <span>{t('Cubre desde')} {r.cubreDesde || '—'}</span>
                  {r.ultimaEmision && <span>{t('Última')}: {r.ultimaEmision}{r.ultimoResultado ? ` (${r.ultimoResultado === 'sin_ordenes' ? t('sin órdenes') : r.ultimoResultado})` : ''}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {porBorrar === r.id ? (
                  <>
                    <Boton variant="danger" onClick={() => borrar(r)} className="!px-3 !py-1.5 text-xs"><Trash2 size={13} /> {t('Sí, eliminar')}</Boton>
                    <Boton variant="ghost" onClick={() => setPorBorrar(null)} className="!px-3 !py-1.5 text-xs">{t('Cancelar')}</Boton>
                  </>
                ) : (
                  <>
                    <button onClick={() => alternar(r)} title={r.activa ? t('Pausar') : t('Reanudar')} className={`grid h-8 w-8 place-items-center rounded-lg transition ${r.activa ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700'}`}><Power size={16} /></button>
                    <button onClick={() => setPorBorrar(r.id)} title={t('Eliminar')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={16} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
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
