// ============================================================================
// BULK · Componentes COMPARTIDOS de facturación (tarjeta + drawer de detalle).
// Se usan igual en: panel de admin (facturas a clientes / pagos a transportistas),
// portal del CLIENTE (sus facturas) y portal del TRANSPORTISTA (sus pagos). Así los
// tres perfiles ven exactamente el mismo diseño premium.
//   · DocCard  → fila-tarjeta moderna (no tabla Excel).
//   · DocDrawer→ vista de detalle lateral con líneas, persona e historial.
// Las acciones específicas de cada rol se inyectan (pie / onPagar), para no duplicar
// la lógica de negocio (firmar, disputar, pagar, anular…).
// ============================================================================
import { useMemo } from 'react'
import {
  X, Mail, MessageCircle, Copy, Calendar, Clock, Wallet, Receipt, Hash, Building2,
  Truck, CheckCircle2, ChevronRight, Download,
} from 'lucide-react'
import { estadoDocumento, diasParaVencer } from '../domain/facturacion'
import { enlacesEnvio, partesContacto } from '../domain/envio'
import { generarFacturaPDF } from '../data/facturaPDF'
import { money } from '../../utils/format'
import { Badge } from '../../components/ui'

const PALETA = ['bg-brand-navy', 'bg-brand-steel', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-violet-500']
export const colorDeDoc = (s) => PALETA[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]
export const inicialesDeDoc = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// Etiqueta + color del estado del documento.
export function estadoInfoDoc(r, tipo, t) {
  const e = r.estado
  if (e === 'pagada' || e === 'pagado') return { label: tipo === 'cliente' ? t('Pagada') : t('Pagado'), color: 'green' }
  if (e === 'anulada') return { label: t('Anulada'), color: 'slate' }
  if (e === 'rechazada') return { label: t('Disputada'), color: 'red' }
  if (e === 'firmada') return { label: t('Firmada'), color: 'blue' }
  return { label: tipo === 'cliente' ? t('Enviada') : t('Enviado'), color: 'gold' }
}
export const esVencidaDoc = (r) => !['pagada', 'anulada'].includes(r.estado) && estadoDocumento(r.vence).estado === 'vencido'

// Botón de acción con estilo uniforme para pies de drawer.
export function BotonDoc({ icon: Icon, children, onClick, danger, primary }) {
  const cls = danger
    ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10'
    : primary
      ? 'border-transparent bg-brand-navy text-white hover:opacity-90 dark:bg-amber-500 dark:text-slate-900'
      : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50'
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${cls}`}>
      {Icon && <Icon size={13} />} {children}
    </button>
  )
}

// ── Tarjeta de un documento ─────────────────────────────────────────────────
export function DocCard({ r, tipo, t, onVer, onPagar }) {
  const persona = tipo === 'cliente' ? r.clienteNombre : r.carrierNombre
  const info = estadoInfoDoc(r, tipo, t)
  const venc = tipo === 'cliente' ? estadoDocumento(r.vence) : null
  const dias = tipo === 'cliente' ? diasParaVencer(r.vence) : null
  const pagado = r.estado === 'pagada' || r.estado === 'pagado'
  return (
    <div onClick={onVer} className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:p-4">
      <div className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl text-sm font-black text-white ${colorDeDoc(persona)}`}>{inicialesDeDoc(persona)}</div>
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
        {tipo === 'cliente' && esVencidaDoc(r) && <Badge color="red">{t('vencida')}</Badge>}
        {Number(r.version) > 1 && <Badge color="slate">v{r.version}</Badge>}
        {r.recurrenteId && <Badge color="blue">{t('Recurrente')}</Badge>}
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
        <div className="text-right text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.total)}</div>
      </div>
      <div className="flex items-center gap-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        {onPagar && r.estado !== 'anulada' && (
          <button onClick={onPagar} title={pagado ? t('Marcar pendiente') : t('Marcar pagada')} className={`grid h-8 w-8 place-items-center rounded-lg transition ${pagado ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700'}`}><CheckCircle2 size={16} /></button>
        )}
        <button onClick={onVer} title={t('Ver detalle')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><ChevronRight size={16} /></button>
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

// ── Drawer de detalle ───────────────────────────────────────────────────────
// `pie` = nodo con acciones específicas del rol (firmar/disputar/pagar/anular…).
export function DocDrawer({ r, tipo, empresa, persona, t, onClose, setMsg, pie = null }) {
  const nombre = tipo === 'cliente' ? r.clienteNombre : r.carrierNombre
  const info = estadoInfoDoc(r, tipo, t)
  const { email, tel } = partesContacto(persona?.contacto)
  const asunto = tipo === 'cliente' ? `${t('Factura')} ${r.numero} · ${empresa}` : `${t('Aviso de pago')} ${r.numero} · ${empresa}`
  const cuerpo = tipo === 'cliente'
    ? `${t('Estimado')} ${nombre},\n${t('Adjuntamos la factura')} ${r.numero} ${t('por')} ${money(r.total)} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${t('Gracias.')} ${empresa}`
    : `${t('Estimado')} ${nombre},\n${t('Te informamos el pago de')} ${money(r.total)} ${t('por')} ${r.lineas?.length || 0} ${t('cargas')} (${r.toneladas} ${t('ton')}).\n${t('Periodo:')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${r.fechaPago ? `${t('Fecha de pago:')} ${r.fechaPago}.` : ''}\n${empresa}`
  const enlaces = enlacesEnvio(persona?.contacto, { asunto, cuerpo })
  const copiar = async () => {
    try { await navigator.clipboard.writeText(`${asunto}\n${cuerpo}`); setMsg && setMsg({ tipo: 'ok', txt: t('Resumen copiado al portapapeles.') }) }
    catch { setMsg && setMsg({ tipo: 'warn', txt: t('No se pudo copiar.') }) }
  }
  const historial = useMemo(() => [
    r.ts && { label: r.recurrenteId ? t('Emitida automáticamente (recurrente)') : t('Emitida'), fecha: r.ts },
    // Ediciones posteriores a la emisión: cada versión queda registrada (quién y qué).
    ...(Array.isArray(r.historialCambios) ? r.historialCambios.map((h) => ({
      label: `${t('Editada')}${h.version ? ` (v${h.version})` : ''}${h.detalle ? ` · ${h.detalle}` : ''}${h.usuario ? ` · ${h.usuario}` : ''}`,
      fecha: h.ts,
    })) : []),
    r.firmadaEn && { label: t('Firmada por el cliente'), fecha: r.firmadaEn },
    r.rechazadaEn && { label: `${t('Disputada')}${r.motivoRechazo ? ` · ${r.motivoRechazo}` : ''}`, fecha: r.rechazadaEn },
    r.pagadaEn && { label: t('Pagada'), fecha: r.pagadaEn },
    r.pagadoEn && { label: t('Pagado'), fecha: r.pagadoEn },
    r.anuladaEn && { label: t('Anulada'), fecha: r.anuladaEn },
  ].filter(Boolean).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')), [r, t])

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={onClose}>
      <div className="animate-slide-up flex h-full w-full max-w-lg flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-base font-black text-white ${colorDeDoc(nombre)}`}>{inicialesDeDoc(nombre)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-black text-brand-navy dark:text-slate-100">{r.numero}</span>
                <Badge color={info.color}>{info.label}{r.firma ? ' ✓' : ''}</Badge>
                {tipo === 'cliente' && esVencidaDoc(r) && <Badge color="red">{t('vencida')}</Badge>}
                {Number(r.version) > 1 && <Badge color="slate">v{r.version}</Badge>}
                {r.recurrenteId && <Badge color="blue">{t('Recurrente')}</Badge>}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-600 dark:text-slate-300">{nombre}</div>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X size={18} /></button>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(r.total)}</div>
        </div>

        {/* Cuerpo */}
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <DatoMini icon={Calendar} label={t('Periodo')} value={`${r.desde || '—'} → ${r.hasta || '—'}`} />
            {tipo === 'cliente'
              ? <DatoMini icon={Clock} label={t('Vence')} value={r.vence || '—'} alerta={esVencidaDoc(r)} />
              : <DatoMini icon={Wallet} label={t('Fecha de pago')} value={r.fechaPago || '—'} />}
            <DatoMini icon={Receipt} label={t('Toneladas')} value={`${r.toneladas || 0} ton`} />
            <DatoMini icon={Hash} label={t('Líneas')} value={String((r.lineas || []).length)} />
          </div>

          {persona && (persona.nombre || persona.rfc || email || tel || persona.facturacion) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                {tipo === 'cliente' ? <Building2 size={13} /> : <Truck size={13} />} {tipo === 'cliente' ? t('Cliente') : t('Transportista')}
              </div>
              {persona.nombre && <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{persona.nombre}</div>}
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
            <BotonDoc icon={Download} onClick={() => generarFacturaPDF(r, { empresa, titulo: tipo === 'cliente' ? 'FACTURA' : 'AVISO DE PAGO', paraLabel: tipo === 'cliente' ? t('Cliente') : t('Transportista'), para: nombre, clienteNombre: nombre })}>PDF</BotonDoc>
            {enlaces.mailto && <a href={enlaces.mailto} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50"><Mail size={13} /> Email</a>}
            {enlaces.whatsapp && <a href={enlaces.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"><MessageCircle size={13} /> WhatsApp</a>}
            <BotonDoc icon={Copy} onClick={copiar}>{t('Copiar')}</BotonDoc>
          </div>
          {pie && <div className="mt-2 flex flex-wrap items-center gap-1.5">{pie}</div>}
        </div>
      </div>
    </div>
  )
}
