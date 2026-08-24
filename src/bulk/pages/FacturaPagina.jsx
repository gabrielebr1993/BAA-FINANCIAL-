// Documento de facturación formal, imprimible (@media print) y descargable en PDF.
//   · DocumentoFactura → presentacional (recibe el doc ya cargado). Se usa como PÁGINA
//     con URL para el staff (/bulk/facturas/:id) y como OVERLAY en los portales de
//     cliente/transportista (que no tienen rutas propias). Mismo documento para todos.
//   · FacturaPagina → envoltura de ruta: carga por :id y lo muestra.
// No recalcula: usa los montos y líneas que ya guardó el sistema.
import { useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Download, Building2, Truck, X } from 'lucide-react'
import { useDoc, useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { jobLabel } from '../domain/documentos'
import { estadoInfoDoc, esVencidaDoc } from '../components/FacturaDoc'
import { generarFacturaPDF } from '../data/facturaPDF'
import { money } from '../../utils/format'
import { Cargando, Badge, EstadoVacio } from '../../components/ui'
import { useLang } from '../../i18n'

const fFecha = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s } }

// ── Documento presentacional ────────────────────────────────────────────────
export function DocumentoFactura({ doc, tipo = 'cliente', empresa = 'Freight', jobsMap = {}, onBack, overlay = false }) {
  const { t } = useLang()
  const esCliente = tipo === 'cliente'
  const receptor = esCliente ? (doc.clienteNombre || t('Cliente')) : (doc.carrierNombre || t('Transportista'))
  const titulo = esCliente ? t('FACTURA') : t('ESTADO DE CUENTA')
  const info = estadoInfoDoc(doc, tipo, t)
  const vencida = esCliente && esVencidaDoc(doc)
  const pagado = doc.estado === 'pagada' || doc.estado === 'pagado'
  const jobDeLinea = (l) => l.jobNombre ? `${l.jobCodigo ? l.jobCodigo + ' · ' : ''}${l.jobNombre}` : jobLabel(l.jobId, jobsMap)
  const subtotal = doc.subtotal != null ? doc.subtotal : doc.total
  const totalDoc = Number(doc.total) || 0
  const descargar = () => generarFacturaPDF(doc, { empresa, titulo: esCliente ? 'FACTURA' : 'ESTADO DE CUENTA', paraLabel: esCliente ? t('Cliente') : t('Transportista'), para: receptor, clienteNombre: receptor })

  return (
    <div className={overlay ? 'fixed inset-0 z-[80] overflow-y-auto bg-black/50 p-3 sm:p-6' : ''} onClick={overlay ? onBack : undefined}>
      <div className={overlay ? 'mx-auto max-w-3xl' : ''} onClick={overlay ? (e) => e.stopPropagation() : undefined}>
        {/* Acciones (no se imprimen) */}
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          {onBack && <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">{overlay ? <X size={16} /> : <ArrowLeft size={16} />} {overlay ? t('Cerrar') : t('Volver')}</button>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-navy hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><Printer size={16} /> {t('Imprimir')}</button>
            <button onClick={descargar} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-90 dark:bg-amber-500 dark:text-slate-900"><Download size={16} /> {t('Descargar PDF')}</button>
          </div>
        </div>

        {/* DOCUMENTO */}
        <div className="doc-print doc-page mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-card">
          <div className="flex items-start justify-between gap-4 p-6" style={{ background: '#13233f', color: '#fff' }}>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: '#c9a24b', color: '#13233f' }}><Truck size={26} /></div>
              <div>
                <div className="text-xl font-black">{empresa}</div>
                <div className="text-xs opacity-80">{t('Transporte de materiales a granel')}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold" style={{ color: '#c9a24b' }}>{titulo}</div>
              <div className="font-mono text-lg font-black">{doc.numero}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-6 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{esCliente ? <Building2 size={13} /> : <Truck size={13} />} {esCliente ? t('Facturar a') : t('Pagar a')}</div>
              <div className="text-base font-bold text-slate-800">{receptor}</div>
            </div>
            <div className="sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Estado')}</span>
                <Badge color={info.color}>{info.label}</Badge>
                {vencida && <Badge color="red">{t('vencida')}</Badge>}
              </div>
              <div className="mt-2 text-sm text-slate-500">{t('Emitida')}: <b className="text-slate-700">{fFecha(doc.ts)}</b></div>
              <div className="text-sm text-slate-500">{t('Periodo')}: <b className="text-slate-700">{fFecha(doc.desde)} → {fFecha(doc.hasta)}</b></div>
              {esCliente ? <div className="text-sm text-slate-500">{t('Vence')}: <b className={vencida ? 'text-rose-600' : 'text-slate-700'}>{fFecha(doc.vence)}</b></div>
                : doc.fechaPago && <div className="text-sm text-slate-500">{t('Fecha de pago')}: <b className="text-slate-700">{fFecha(doc.fechaPago)}</b></div>}
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr style={{ background: '#f8f3eb' }} className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-bold">{t('Job')}</th>
                    <th className="px-3 py-2 font-bold">{t('Ticket')}</th>
                    <th className="px-3 py-2 font-bold">{t('Material')}</th>
                    <th className="px-3 py-2 font-bold">{t('Equipo')}</th>
                    <th className="px-3 py-2 text-right font-bold">{t('Ton')}</th>
                    <th className="px-3 py-2 text-right font-bold">{t('Importe')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.lineas || []).map((l, i) => (
                    <tr key={l.orderId || i} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{jobDeLinea(l) || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.numero || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{l.material || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{l.tipoEquipo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.ton || 0}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{money(l.precio)}</td>
                    </tr>
                  ))}
                  {(doc.lineas || []).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">{t('Sin líneas')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>{t('Subtotal')}</span><span className="tabular-nums">{money(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>{t('Toneladas')}</span><span className="tabular-nums">{doc.toneladas || 0}</span></div>
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-black" style={{ color: '#13233f' }}><span>{t('TOTAL')}</span><span className="tabular-nums">{money(totalDoc)}</span></div>
                {/* Fast Pay aplicado: el documento muestra Total − Fast Pay = Balance. */}
                {Number(doc.fastPayAplicado) > 0 && (
                  <>
                    <div className="flex justify-between font-bold" style={{ color: '#c9a24b' }}><span>Fast Pay</span><span className="tabular-nums">− {money(doc.fastPayAplicado)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black" style={{ color: '#13233f' }}><span>{t('Balance restante')}</span><span className="tabular-nums">{money(Math.max(0, totalDoc - (Number(doc.fastPayAplicado) || 0)))}</span></div>
                  </>
                )}
                {!esCliente && !(Number(doc.fastPayAplicado) > 0) && (
                  <>
                    <div className="flex justify-between text-emerald-600"><span>{t('Pagado')}</span><span className="tabular-nums">{money(pagado ? totalDoc : 0)}</span></div>
                    <div className="flex justify-between font-bold" style={{ color: '#c9a24b' }}><span>{t('Pendiente')}</span><span className="tabular-nums">{money(pagado ? 0 : totalDoc)}</span></div>
                  </>
                )}
              </div>
            </div>

            {doc.firma && (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Firma de aprobación')}</div>
                <img src={doc.firma} alt="firma" className="mt-1 h-16" />
                <div className="text-xs text-slate-500">{doc.firmante || ''} {doc.firmadaEn ? `· ${fFecha(doc.firmadaEn)}` : ''}</div>
              </div>
            )}

            <div className="mt-6 rounded-xl p-3 text-xs text-slate-500" style={{ background: '#f8f3eb' }}>
              {esCliente
                ? t('Condiciones de pago: 30 días a partir de la emisión. Gracias por su preferencia.')
                : t('Este estado de cuenta resume los viajes del periodo. Cualquier aclaración, contáctanos.')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Envoltura de ruta (staff): carga por :id ────────────────────────────────
export default function FacturaPagina() {
  const { t } = useLang()
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { usuario } = useBulkAuth()
  const empresa = usuario?.empresa || 'Freight'
  const tipo = params.get('tipo') === 'carrier' ? 'carrier' : 'cliente'
  const { dato: inv, cargando: c1 } = useDoc('invoices', tipo === 'cliente' ? id : null)
  const { dato: st, cargando: c2 } = useDoc('carrierStatements', tipo === 'carrier' ? id : null)
  const doc = tipo === 'cliente' ? inv : st
  const cargando = tipo === 'cliente' ? c1 : c2
  const { datos: jobs } = useColeccion('jobs')
  const jobsMap = useMemo(() => { const m = {}; for (const j of jobs || []) m[j.id] = j; return m }, [jobs])

  if (cargando) return <Cargando />
  if (!doc) return <EstadoVacio titulo={t('Documento no encontrado')} texto={t('No existe o no tienes acceso a este documento.')} mostrarBoton={false} />
  return <DocumentoFactura doc={doc} tipo={tipo} empresa={empresa} jobsMap={jobsMap} onBack={() => navigate(-1)} />
}
