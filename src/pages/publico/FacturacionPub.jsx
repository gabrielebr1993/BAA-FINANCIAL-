// SITIO PÚBLICO · /facturacion — Facturación y tickets. Demo interactivo: el
// visitante mueve el slider de toneladas (peso de báscula) y ve recalcularse el
// ticket BOL y la factura en vivo (datos de ejemplo, solo front-end).
import { useState } from 'react'
import { Receipt, ScanLine, FileCheck2, Calculator } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK } from './comun'

const TARIFA_VENTA = 21.5 // $/tn al cliente
const COSTO_MATERIAL = 16.0
const PAGO_TRANSPORTE = 4.75

function DemoFactura({ tx }) {
  const [tn, setTn] = useState(24.75)
  const venta = tn * TARIFA_VENTA
  const material = tn * COSTO_MATERIAL
  const flete = tn * PAGO_TRANSPORTE
  const utilidad = venta - material - flete
  const lb = Math.round(tn * 2000)
  const fila = (l, v, extra = {}) => (
    <div className="flex items-center justify-between py-1.5 text-[13px]" style={extra}>
      <span style={{ color: '#5b6b82' }}>{l}</span><span className="f-mono font-bold" style={{ color: extra.color || NAVY }}>{v}</span>
    </div>
  )
  return (
    <div className="rounded-[20px] border bg-white p-4 sm:p-5" style={{ borderColor: 'rgba(201,162,75,.35)', boxShadow: '0 40px 80px -30px rgba(19,35,63,.45)' }}>
      <div className="mb-3 flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: NAVY }}>
        <span className="f-display text-[14px] font-bold text-white">MilePay <span style={{ color: GOLD }}>Freight</span></span>
        <span className="f-mono text-[10px] uppercase tracking-widest" style={{ color: GOLD }}>Material Ticket · BOL</span>
      </div>
      <div className="mb-1 text-[12.5px] font-semibold" style={{ color: NAVY }}>{tx('Peso NETO de báscula (muévelo tú):', 'NET scale weight (drag it):')}</div>
      <input type="range" min="18" max="28" step="0.25" value={tn} onChange={(e) => setTn(Number(e.target.value))} className="w-full accent-[#c9a24b]" aria-label="toneladas" />
      <div className="mb-3 mt-1 rounded-xl border-2 p-2 text-center" style={{ borderColor: OK }}>
        <span className="f-mono text-[24px] font-black" style={{ color: NAVY }}>{tn.toFixed(2)}</span>
        <span className="ml-1 text-[11px] font-bold" style={{ color: '#5b6b82' }}>NET TONS</span>
        <span className="ml-2 text-[11px] font-semibold" style={{ color: '#94a3b8' }}>({lb.toLocaleString('en-US')} lb)</span>
      </div>
      <div className="divide-y divide-[#ece3d3]">
        {fila(tx('Factura al cliente', 'Customer invoice') + ` · $${TARIFA_VENTA.toFixed(2)}/tn`, `$${venta.toFixed(2)}`)}
        {fila(tx('Costo del material', 'Material cost') + ` · $${COSTO_MATERIAL.toFixed(2)}/tn`, `−$${material.toFixed(2)}`, { color: '#e05d5d' })}
        {fila(tx('Pago al transporte', 'Carrier pay') + ` · $${PAGO_TRANSPORTE.toFixed(2)}/tn`, `−$${flete.toFixed(2)}`, { color: '#e05d5d' })}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: 'rgba(63,157,107,.1)' }}>
        <span className="text-[13.5px] font-bold" style={{ color: NAVY }}>{tx('Tu utilidad de este viaje', 'Your profit on this trip')}</span>
        <span className="f-mono text-[20px] font-black" style={{ color: OK }}>${utilidad.toFixed(2)}</span>
      </div>
      <p className="f-mono mt-3 text-center text-[10.5px] uppercase tracking-wider" style={{ color: '#94a3b8' }}>
        {tx('El peso del ticket OCR manda: factura, pago y utilidad se recalculan solos', 'The OCR ticket weight rules: invoice, pay and profit recalculate on their own')}
      </p>
    </div>
  )
}

export default function FacturacionPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/facturacion"
      hero={{
        migas: tx('Facturación y tickets', 'Billing & tickets'),
        icono: Receipt,
        titulo: <>{tx('Del ticket de báscula a la factura, ', 'From scale ticket to invoice, ')}<em className="not-italic" style={{ color: GOLD }}>{tx('sin teclear.', 'no typing.')}</em></>,
        sub: tx('Cada viaje genera su Material Ticket / BOL con formato real del sector (Gross/Tare/Net, control del pedido, firma) y la factura al cliente sale del peso REAL de báscula — no de estimados. Los pagos al transporte y al chofer se calculan del mismo número.', 'Every trip produces its Material Ticket / BOL in the real industry format (Gross/Tare/Net, order progress, signature) and the customer invoice comes from the REAL scale weight — not estimates. Carrier and driver pay are computed from that same number.'),
        visual: <DemoFactura tx={tx} />,
      }}
      pasos={{
        titulo: tx('Un solo número manda: el peso real', 'One number rules: the real weight'),
        items: [
          { icono: ScanLine, t: tx('El ticket entra por OCR', 'The ticket comes in via OCR'), d: tx('El chofer fotografía el ticket de báscula; el sistema lee bruto, tara y neto y los guarda en la orden.', 'The driver snaps the scale ticket; the system reads gross, tare and net and stores them on the order.') },
          { icono: Calculator, t: tx('Todo se recalcula solo', 'Everything recalculates itself'), d: tx('Cobro al cliente, pago al transporte, pago al chofer y tu utilidad: todos salen del mismo peso real. Cero dobles capturas.', 'Customer billing, carrier pay, driver pay and your profit all come from the same real weight. Zero double entry.') },
          { icono: FileCheck2, t: tx('Ticket y factura listos', 'Ticket and invoice ready'), d: tx('BOL imprimible (térmica 80 mm o PDF), factura por viaje o por período, y filtros por fechas para tu contador.', 'Printable BOL (80 mm thermal or PDF), invoicing per trip or per period, and date filters for your accountant.') },
        ],
      }}
      metricas={[
        { n: '0', pct: 100, t: tx('pesos tecleados a mano', 'weights typed by hand'), d: tx('El OCR captura la báscula por ti.', 'OCR captures the scale for you.') },
        { n: '3', pct: 100, t: tx('pagos de un solo peso', 'payouts from one weight'), d: tx('Cliente, transporte y chofer, siempre cuadrados.', 'Customer, carrier and driver, always squared.') },
        { n: 'BOL', pct: 100, t: tx('formato real del sector', 'real industry format'), d: tx('Como los tickets de las grandes cementeras.', 'Like the majors print their tickets.') },
        { n: '100%', pct: 100, t: tx('auditable por viaje', 'auditable per trip'), d: tx('Cada dólar se rastrea hasta su ticket.', 'Every dollar traces back to its ticket.') },
      ]}
    />
  )
}
