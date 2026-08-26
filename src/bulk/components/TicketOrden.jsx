// MATERIAL TICKET / BILL OF LADING imprimible (formato real del sector, validado
// contra tickets de Heidelberg Materials y CIMSA). Formato angosto tipo
// comprobante, legible en B/N. Misma plantilla para Loaded (carga) y Received
// (entrega): cambia el Event, los tiempos y quién firma.
// Se muestra como overlay; IMPRIMIR usa el diálogo del sistema (iframe
// autocontenido, compatible con PWA/térmicas) y PDF descarga igual apariencia.
// Recibe `datos` ya normalizados por domain/documentos.datosTicket().
import { useState } from 'react'
import { Printer, Download, X, AlertTriangle } from 'lucide-react'
import { generarTicketPDF } from '../data/ticketPDF'
import { imprimirTicket } from '../data/ticketPrint'
import { useLang } from '../../i18n'

const NAVY = '#13233f'
const GOLD = '#c9a24b'
const GREEN = '#3f9d6b'
const CREAM = '#f8f3eb'

const fFechaCorta = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-US') } catch { return String(s) } }
const nLb = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const nT = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
const o = (v) => (v == null || v === '' ? '—' : v)

function Celda({ label, value, mono = false, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }} className="min-w-0 border-b border-dashed border-slate-200 pb-1">
      <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`truncate text-[12px] font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{o(value)}</div>
    </div>
  )
}

function TituloSec({ children }) {
  return <div className="mb-1 mt-3 text-[9px] font-black uppercase tracking-widest" style={{ color: GOLD }}>{children}</div>
}

export default function TicketOrden({ datos: d, empresa = 'Freight', onClose }) {
  const { t } = useLang()
  const carga = d.event === 'Loaded'
  const [avisoImp, setAvisoImp] = useState('')
  const imprimir = async () => {
    setAvisoImp('')
    const ok = await imprimirTicket(d, empresa)
    if (!ok) setAvisoImp(t('Tu navegador o dispositivo no permitió abrir la impresión. Descarga el PDF y imprímelo desde ahí.'))
  }
  const p = d.pesos || {}
  const ped = d.pedido || null
  const pct = ped && ped.ordered > 0 ? Math.min(100, Math.round((ped.received / ped.ordered) * 100)) : null

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div className="mx-auto max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="no-print mb-3 flex items-center gap-2">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><X size={16} /> {t('Cerrar')}</button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={imprimir} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><Printer size={16} /> {t('Imprimir')}</button>
            <button onClick={() => generarTicketPDF(d, { empresa })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-sm font-bold text-white dark:bg-amber-500 dark:text-slate-900"><Download size={16} /> PDF</button>
          </div>
        </div>
        {avisoImp && (
          <div className="no-print mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> <span>{avisoImp}</span>
          </div>
        )}

        {/* ══ TICKET / BOL ══ */}
        <div className="doc-print ticket-narrow doc-page mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-card">
          {/* 1 · Encabezado */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY }}>
            <div>
              <div className="text-base font-black leading-none text-white">MilePay <span style={{ color: GOLD }}>{empresa}</span></div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>Material Ticket · Bill of Lading</div>
            </div>
            <div className="rounded-md px-2.5 py-1 text-[11px] font-black uppercase text-white" style={{ background: carga ? GREEN : GOLD, color: carga ? '#fff' : NAVY }}>{d.event}</div>
          </div>

          <div className="p-4">
            {/* 2 · Identificación y tiempos */}
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-xl font-black" style={{ color: NAVY }}>{o(d.ticketNumber || d.ordenNumero)}</div>
              <div className="text-[11px] font-bold text-slate-500">{fFechaCorta(d.date)}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
              <Celda label="Time In" value={d.timeIn} mono />
              <Celda label="Time Out" value={d.timeOut} mono />
              <Celda label="Total" value={d.timeTotal} mono />
              <Celda label="PO #" value={d.po} mono />
              <Celda label="Order #" value={d.ordenNumero} mono />
              <Celda label="Job" value={d.jobLabel} />
            </div>

            {/* 3 · Cadena Supplier → Customer → Delivery To */}
            <TituloSec>Supplier · Customer · Delivery</TituloSec>
            <div className="grid grid-cols-3 gap-2 rounded-lg p-2" style={{ background: CREAM }}>
              <div className="min-w-0">
                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Supplier / Ship From</div>
                <div className="text-[11px] font-bold leading-tight text-slate-800">{o(d.supplier)}</div>
              </div>
              <div className="min-w-0 border-l border-dashed border-slate-300 pl-2">
                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Customer</div>
                <div className="text-[11px] font-bold leading-tight text-slate-800">{o(d.customer)}</div>
              </div>
              <div className="min-w-0 border-l border-dashed border-slate-300 pl-2">
                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Delivery To</div>
                <div className="text-[11px] font-bold leading-tight text-slate-800">{o(d.deliveryTo)}</div>
              </div>
            </div>

            {/* 4 · Material y transporte */}
            <TituloSec>Material & Haul</TituloSec>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <Celda label="Material / Product" value={d.material} />
              <Celda label="Origin" value={d.origin} />
              <Celda label="Carrier" value={d.carrier} />
              <Celda label="Truck # / Vehicle" value={d.truck} mono />
              <Celda label="License" value={d.license} mono />
              <Celda label="Weighmaster" value={d.weighmaster} />
              <Celda label="Sales / P&D Status" value={d.salesStatus} span={2} />
            </div>

            {/* 5 · Peso Gross / Tare / Net */}
            <TituloSec>Weights</TituloSec>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-0.5 text-left font-bold" />
                  <th className="py-0.5 text-right font-bold">Pounds</th>
                  <th className="py-0.5 text-right font-bold">Tons</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-slate-200"><td className="py-1 font-sans font-bold text-slate-500">Gross</td><td className="py-1 text-right font-bold">{nLb(p.grossLb)}</td><td className="py-1 text-right font-bold">{nT(p.grossT)}</td></tr>
                <tr className="border-t border-slate-200"><td className="py-1 font-sans font-bold text-slate-500">Tare</td><td className="py-1 text-right font-bold">{nLb(p.tareLb)}</td><td className="py-1 text-right font-bold">{nT(p.tareT)}</td></tr>
                <tr className="border-t-2" style={{ borderColor: GREEN, background: '#3f9d6b14' }}>
                  <td className="py-1 font-sans font-black" style={{ color: GREEN }}>Net</td>
                  <td className="py-1 text-right font-black" style={{ color: GREEN }}>{nLb(p.netLb)}</td>
                  <td className="py-1 text-right font-black" style={{ color: GREEN }}>{nT(p.netT)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2 rounded-lg border-2 p-2 text-center" style={{ borderColor: GREEN }}>
              <span className="align-baseline font-mono text-2xl font-black" style={{ color: NAVY }}>{nT(p.netT)}</span>
              <span className="ml-1 text-[11px] font-bold text-slate-500">NET TONS</span>
              {p.netLb != null && <span className="ml-2 text-[11px] font-semibold text-slate-400">({nLb(p.netLb)} lb)</span>}
            </div>

            {/* 6 · Control del pedido */}
            {ped && (ped.ordered != null || ped.received > 0) && (
              <>
                <TituloSec>Order Progress</TituloSec>
                {pct != null && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GREEN }} />
                  </div>
                )}
                <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
                  {[['Ordered', ped.ordered], ['Received', ped.received], ['Remaining', ped.remaining], ['Loads', ped.loads]].map(([l, v]) => (
                    <div key={l}>
                      <div className="font-mono text-[12px] font-black text-slate-800">{v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                      <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{l}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 7 · Firma */}
            <div className="mt-4">
              {d.firmaImg
                ? <img src={d.firmaImg} alt="signature" className="h-12 border-b border-slate-400 object-contain" />
                : <div className="h-10 border-b border-slate-400" />}
              <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-wide text-slate-400">
                <span>{carga ? 'Loaded by (plant supervisor)' : 'Received by'}</span>
                <span className="font-bold normal-case text-slate-600">{o(d.receivedBy)}{d.date ? ` · ${fFechaCorta(d.date)}` : ''}</span>
              </div>
            </div>

            {/* 8 · Pie */}
            <div className="mt-3 border-t border-slate-200 pt-2 text-center text-[9px] font-semibold tracking-wide text-slate-400">
              MilePay Freight · milepay.io
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
