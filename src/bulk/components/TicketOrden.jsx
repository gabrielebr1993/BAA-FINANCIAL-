// Material ticket imprimible (formato angosto tipo comprobante). Se muestra como
// overlay; se puede IMPRIMIR (diálogo del sistema, vía iframe autocontenido —
// compatible con PWA e impresoras térmicas) o descargar en PDF.
// Recibe `datos` ya normalizados por domain/documentos.datosTicket().
import { useState } from 'react'
import { Printer, Download, X, AlertTriangle } from 'lucide-react'
import { generarTicketPDF } from '../data/ticketPDF'
import { imprimirTicket } from '../data/ticketPrint'
import { useLang } from '../../i18n'

const fFecha = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(s) } }

function Fila({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-1 text-[13px]">
      <span className="font-semibold uppercase tracking-wide text-slate-400" style={{ fontSize: 10 }}>{label}</span>
      <span className="text-right font-bold text-slate-800">{value == null || value === '' ? '—' : value}</span>
    </div>
  )
}

export default function TicketOrden({ datos, empresa = 'Freight', onClose }) {
  const { t } = useLang()
  const carga = datos.event === 'Loaded'
  const [avisoImp, setAvisoImp] = useState('')
  // Abre el DIÁLOGO DE IMPRESIÓN del sistema (el usuario elige su impresora).
  // Si el dispositivo no da acceso al servicio de impresión, avisamos y queda
  // el PDF como alternativa (se puede imprimir desde el visor de PDF).
  const imprimir = async () => {
    setAvisoImp('')
    const ok = await imprimirTicket(datos, empresa)
    if (!ok) setAvisoImp(t('Tu navegador o dispositivo no permitió abrir la impresión. Descarga el PDF y imprímelo desde ahí.'))
  }
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div className="mx-auto max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="no-print mb-3 flex items-center gap-2">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><X size={16} /> {t('Cerrar')}</button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={imprimir} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><Printer size={16} /> {t('Imprimir')}</button>
            <button onClick={() => generarTicketPDF(datos, { empresa })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-sm font-bold text-white dark:bg-amber-500 dark:text-slate-900"><Download size={16} /> PDF</button>
          </div>
        </div>
        {avisoImp && (
          <div className="no-print mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> <span>{avisoImp}</span>
          </div>
        )}

        {/* TICKET */}
        <div className="doc-print ticket-narrow doc-page mx-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-base font-black" style={{ color: '#13233f' }}>{empresa}</div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#c9a24b' }}>{carga ? 'Loading Ticket' : 'Delivery Ticket'}</div>
            </div>
            <div className="rounded-md px-2 py-0.5 text-[11px] font-black text-white" style={{ background: carga ? '#3f9d6b' : '#13233f' }}>{datos.event}</div>
          </div>
          <div className="mb-2 font-mono text-lg font-black" style={{ color: '#13233f' }}>{datos.ticketNumber || datos.ordenNumero || '—'}</div>

          <Fila label="Ticket Number" value={datos.ticketNumber || datos.ordenNumero} />
          <Fila label="Job" value={datos.jobLabel} />
          <Fila label="Date" value={fFecha(datos.date)} />
          <Fila label="Event" value={datos.event} />
          <Fila label="Supplier" value={datos.supplier} />
          <Fila label="Material" value={datos.material} />
          <Fila label="Origin" value={datos.origin} />
          <Fila label="Batch Plant Location" value={datos.batchPlant} />
          <Fila label="Quantity" value={`${datos.quantity} ${datos.unit}`} />
          <Fila label="Carrier" value={datos.carrier} />
          <Fila label="Truck #" value={datos.truck} />
          {datos.destino && <Fila label={carga ? 'Destination' : 'Delivered to'} value={datos.destino} />}

          <div className="mt-4">
            <div className="h-10 border-b border-slate-400" />
            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{carga ? t('Firma del supervisor de planta') : t('Firma de quien recibe')}</div>
          </div>
          {!carga && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('Observaciones')}</div>
              <div className="h-8 border-b border-dashed border-slate-300" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
