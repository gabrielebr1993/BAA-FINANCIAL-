import { useMemo, useState } from 'react'
import { Download, Plus, Mail, MessageCircle, Truck, Building2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { crear, guardar, siguienteSecuencia } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { armarFactura, armarAvisoPago, estadoDocumento } from '../domain/facturacion'
import { enlacesEnvio } from '../domain/envio'
import { generarFacturaPDF } from '../data/facturaPDF'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, Tabla } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ESTADO_COLOR = { enviada: 'gold', firmada: 'green', pagada: 'navy', rechazada: 'slate', enviado: 'gold', pagado: 'green' }

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

      <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        {[{ k: 'clientes', l: t('Facturas a clientes'), icon: Building2 }, { k: 'transportistas', l: t('Pagos a transportistas'), icon: Truck }].map((it) => (
          <button key={it.k} onClick={() => setTab(it.k)} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium ${tab === it.k ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <it.icon size={15} /> {it.l}
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
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const cliente = (id) => clientes.find((c) => c.id === id)
  const nombreCliente = (id) => cliente(id)?.nombre || '—'
  const preview = useMemo(() => f.clienteId ? armarFactura(ordenes.filter((o) => o.clienteId === f.clienteId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])

  // El staff marca una factura como pagada (o revierte). Auditado.
  const marcarPagada = async (r) => {
    const pagar = r.estado !== 'pagada'
    await guardar('invoices', r.id, { estado: pagar ? 'pagada' : (r.firma ? 'firmada' : 'enviada'), pagadaEn: pagar ? new Date().toISOString() : null })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: pagar ? 'factura_pagada' : 'factura_no_pagada', entidad: 'factura', detalle: `${r.numero} · ${r.clienteNombre}` })
  }

  const generar = async () => {
    if (!f.clienteId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: t('Selecciona un cliente con órdenes entregadas en el periodo.') }); return }
    const seq = await siguienteSecuencia(tenantId, 'factura')
    const numero = `FAC-${String(seq).padStart(5, '0')}`
    // Vencimiento por defecto: 30 días desde hoy (neto 30).
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
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nueva factura al cliente')}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={f.clienteId} onChange={set('clienteId')}><option value="">{t('— Cliente —')}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Desde')}</div><Input type="date" value={f.desde} onChange={set('desde')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Hasta')}</div><Input type="date" value={f.hasta} onChange={set('hasta')} /></div>
          <div className="flex items-end"><Boton variant="gold" onClick={generar} disabled={!preview || preview.n === 0}><Plus size={16} /> {t('Generar')}</Boton></div>
        </div>
        {preview && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            {preview.n === 0 ? <span className="text-slate-400">{t('Sin órdenes entregadas para ese cliente/periodo.')}</span> : <span><b>{preview.n}</b> {t('órdenes')} · <b>{preview.toneladas}</b> {t('ton')} · {t('Total')} <b className="text-brand-navy dark:text-slate-100">{money(preview.total)}</b></span>}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas emitidas')} ({facturas.length})</h3>
        {facturas.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no hay facturas.')}</p> : (
          <Tabla
            columns={[{ key: 'numero', label: t('Factura') }, { key: 'clienteNombre', label: t('Cliente') }, { key: 'periodo', label: t('Periodo') }, { key: 'vence', label: t('Vence') }, { key: 'toneladas', label: t('Ton'), align: 'right' }, { key: 'total', label: t('Total'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: t('Enviar'), align: 'right' }]}
            rows={facturas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
            renderCell={(r, k) => {
              if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
              if (k === 'vence') { const ed = estadoDocumento(r.vence); return <span className={`text-xs ${r.estado !== 'pagada' && ed.estado === 'vencido' ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{r.vence || '—'}</span> }
              if (k === 'total') return money(r.total)
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
        )}
      </Card>
    </>
  )
}

// ── Avisos de PAGO a TRANSPORTISTAS (para que sepan cuándo/cuánto les pago) ───
function PagosTransportistas({ carriers, ordenes, avisos, empresa, tenantId, usuario, rol, setMsg, t }) {
  const [f, setF] = useState({ carrierId: '', desde: '', hasta: '', fechaPago: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const carrier = (id) => carriers.find((c) => c.id === id)
  const nombreCarrier = (id) => carrier(id)?.nombre || '—'
  const preview = useMemo(() => f.carrierId ? armarAvisoPago(ordenes.filter((o) => o.transportistaId === f.carrierId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])

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
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo aviso de pago al transportista')}</h3>
        <div className="grid gap-3 sm:grid-cols-5">
          <Select value={f.carrierId} onChange={set('carrierId')}><option value="">{t('— Transportista —')}</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Desde')}</div><Input type="date" value={f.desde} onChange={set('desde')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Hasta')}</div><Input type="date" value={f.hasta} onChange={set('hasta')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Te pago el')}</div><Input type="date" value={f.fechaPago} onChange={set('fechaPago')} /></div>
          <div className="flex items-end"><Boton variant="gold" onClick={generar} disabled={!preview || preview.n === 0}><Plus size={16} /> {t('Generar')}</Boton></div>
        </div>
        {preview && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            {preview.n === 0 ? <span className="text-slate-400">{t('Sin cargas entregadas para ese transportista/periodo.')}</span> : <span><b>{preview.n}</b> {t('cargas')} · <b>{preview.toneladas}</b> {t('ton')} · {t('Le pagas')} <b className="text-brand-navy dark:text-slate-100">{money(preview.total)}</b></span>}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago emitidos')} ({avisos.length})</h3>
        {avisos.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no hay avisos de pago.')}</p> : (
          <Tabla
            columns={[{ key: 'numero', label: t('Aviso') }, { key: 'carrierNombre', label: t('Transportista') }, { key: 'periodo', label: t('Periodo') }, { key: 'fechaPago', label: t('Pago') }, { key: 'total', label: t('Le pagas'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: t('Enviar'), align: 'right' }]}
            rows={avisos.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
            renderCell={(r, k) => {
              if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
              if (k === 'fechaPago') return <span className="text-xs text-slate-400">{r.fechaPago || '—'}</span>
              if (k === 'total') return money(r.total)
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
        )}
      </Card>
    </>
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
