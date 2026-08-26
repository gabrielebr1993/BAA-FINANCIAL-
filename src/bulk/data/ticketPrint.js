// ============================================================================
// BULK · Impresión del MATERIAL TICKET / BOL por iframe oculto.
// window.print() sobre la página completa falla o imprime mal en la PWA
// instalada (Android/iOS). Aquí construimos un documento HTML AUTOCONTENIDO
// (solo el ticket, estilos en línea, ancho tipo comprobante ~80 mm compatible
// con impresoras térmicas, legible en B/N) en un <iframe> oculto y llamamos a
// print() del iframe: se abre el diálogo del sistema.
// Estructura (formato real Heidelberg/CIMSA): encabezado + identificación y
// tiempos + cadena Supplier/Customer/Delivery To + material y transporte +
// tabla Gross/Tare/Net (lb y tons) + control del pedido + firma + pie.
// ============================================================================

const NAVY = '#13233f'
const GOLD = '#c9a24b'
const GREEN = '#3f9d6b'
const CREAM = '#f8f3eb'

const esc = (s) => String(s == null || s === '' ? '—' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fFecha = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-US') } catch { return String(s) } }
const nLb = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const nT = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))

const celda = (l, v, mono = false, span = 1) => `
  <div class="celda" style="grid-column:span ${span}"><div class="lbl">${esc(l)}</div><div class="val${mono ? ' mono' : ''}">${esc(v)}</div></div>`

export function htmlTicket(d, empresa = 'Freight') {
  const carga = d.event === 'Loaded'
  const p = d.pesos || {}
  const ped = d.pedido || null
  const pct = ped && ped.ordered > 0 ? Math.min(100, Math.round((ped.received / ped.ordered) * 100)) : null
  const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.ticketNumber || d.ordenNumero || 'Ticket')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; color: #1e293b; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .ticket { width: 80mm; max-width: 100%; margin: 0 auto; }
  .cab { display: flex; justify-content: space-between; align-items: center; background: ${NAVY}; padding: 3mm; }
  .marca { font-size: 12px; font-weight: 900; color: #fff; }
  .marca b { color: ${GOLD}; }
  .tipo { font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: ${GOLD}; margin-top: 1px; }
  .evento { font-size: 9px; font-weight: 900; text-transform: uppercase; border-radius: 2px; padding: 1.5px 6px; background: ${carga ? GREEN : GOLD}; color: ${carga ? '#fff' : NAVY}; }
  .cuerpo { padding: 3mm; }
  .idfila { display: flex; justify-content: space-between; align-items: baseline; }
  .bol { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 15px; font-weight: 900; color: ${NAVY}; }
  .fecha { font-size: 9px; font-weight: 700; color: #64748b; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5mm 3mm; margin-top: 2mm; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 3mm; }
  .celda { border-bottom: 1px dashed #cbd5e1; padding-bottom: 1mm; min-width: 0; overflow: hidden; }
  .lbl { font-size: 6.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; }
  .val { font-size: 9.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .sec { font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: .18em; color: ${GOLD}; margin: 3mm 0 1mm; }
  .cadena { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2mm; background: ${CREAM}; border-radius: 2mm; padding: 2mm; }
  .cadena > div + div { border-left: 1px dashed #cbd5e1; padding-left: 2mm; }
  .cadena .val { white-space: normal; font-size: 8.5px; line-height: 1.25; }
  table.peso { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  table.peso th { font-size: 6.5px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; text-align: right; padding: .5mm 0; }
  table.peso th:first-child { text-align: left; }
  table.peso td { border-top: 1px solid #e2e8f0; padding: 1mm 0; font-weight: 800; text-align: right; font-family: ui-monospace, Menlo, Consolas, monospace; }
  table.peso td:first-child { text-align: left; font-family: inherit; color: #64748b; }
  tr.net td { border-top: 2px solid ${GREEN}; color: ${GREEN}; background: #3f9d6b14; font-weight: 900; }
  .netbox { border: 2px solid ${GREEN}; border-radius: 2mm; text-align: center; padding: 1.5mm; margin-top: 2mm; }
  .netbox .n { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 17px; font-weight: 900; color: ${NAVY}; }
  .netbox .u { font-size: 8px; font-weight: 800; color: #64748b; }
  .barra { height: 2mm; background: #f1f5f9; border-radius: 99mm; overflow: hidden; }
  .barra > div { height: 100%; background: ${GREEN}; border-radius: 99mm; }
  .ped { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1mm; text-align: center; margin-top: 1.5mm; }
  .ped .n { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5px; font-weight: 900; }
  .ped .l { font-size: 6.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; }
  .firma { margin-top: 6mm; }
  .firma .linea { border-bottom: 1px solid #64748b; height: 9mm; }
  .firma img { height: 11mm; display: block; border-bottom: 1px solid #64748b; }
  .firma .pie { display: flex; justify-content: space-between; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; margin-top: 1mm; }
  .firma .pie b { color: #475569; text-transform: none; }
  .footer { border-top: 1px solid #e2e8f0; margin-top: 3mm; padding-top: 1.5mm; text-align: center; font-size: 7px; font-weight: 700; letter-spacing: .06em; color: #94a3b8; }
  @page { margin: 4mm; }
  @media print { .ticket { width: 100%; } }
</style></head><body>
  <div class="ticket">
    <div class="cab">
      <div><div class="marca">MilePay <b>${esc(empresa)}</b></div><div class="tipo">Material Ticket · Bill of Lading</div></div>
      <div class="evento">${esc(d.event)}</div>
    </div>
    <div class="cuerpo">
      <div class="idfila"><div class="bol">${esc(d.ticketNumber || d.ordenNumero)}</div><div class="fecha">${fFecha(d.date)}</div></div>
      <div class="grid3">
        ${celda('Time In', d.timeIn, true)}${celda('Time Out', d.timeOut, true)}${celda('Total', d.timeTotal, true)}
        ${celda('PO #', d.po, true)}${celda('Order #', d.ordenNumero, true)}${celda('Job', d.jobLabel)}
      </div>
      <div class="sec">Supplier · Customer · Delivery</div>
      <div class="cadena">
        <div><div class="lbl">Supplier / Ship From</div><div class="val">${esc(d.supplier)}</div></div>
        <div><div class="lbl">Customer</div><div class="val">${esc(d.customer)}</div></div>
        <div><div class="lbl">Delivery To</div><div class="val">${esc(d.deliveryTo)}</div></div>
      </div>
      <div class="sec">Material &amp; Haul</div>
      <div class="grid2">
        ${celda('Material / Product', d.material)}${celda('Origin', d.origin)}
        ${celda('Carrier', d.carrier)}${celda('Truck # / Vehicle', d.truck, true)}
        ${celda('License', d.license, true)}${celda('Weighmaster', d.weighmaster)}
        ${celda('Sales / P&D Status', d.salesStatus, false, 2)}
      </div>
      <div class="sec">Weights</div>
      <table class="peso">
        <tr><th></th><th>Pounds</th><th>Tons</th></tr>
        <tr><td>Gross</td><td>${nLb(p.grossLb)}</td><td>${nT(p.grossT)}</td></tr>
        <tr><td>Tare</td><td>${nLb(p.tareLb)}</td><td>${nT(p.tareT)}</td></tr>
        <tr class="net"><td>Net</td><td>${nLb(p.netLb)}</td><td>${nT(p.netT)}</td></tr>
      </table>
      <div class="netbox"><span class="n">${nT(p.netT)}</span> <span class="u">NET TONS${p.netLb != null ? ` (${nLb(p.netLb)} lb)` : ''}</span></div>
      ${ped && (ped.ordered != null || ped.received > 0) ? `
      <div class="sec">Order Progress</div>
      ${pct != null ? `<div class="barra"><div style="width:${pct}%"></div></div>` : ''}
      <div class="ped">
        <div><div class="n">${num(ped.ordered)}</div><div class="l">Ordered</div></div>
        <div><div class="n">${num(ped.received)}</div><div class="l">Received</div></div>
        <div><div class="n">${num(ped.remaining)}</div><div class="l">Remaining</div></div>
        <div><div class="n">${num(ped.loads)}</div><div class="l">Loads</div></div>
      </div>` : ''}
      <div class="firma">
        ${d.firmaImg ? `<img src="${d.firmaImg}" alt="signature" />` : '<div class="linea"></div>'}
        <div class="pie"><span>${carga ? 'Loaded by (plant supervisor)' : 'Received by'}</span><b>${esc(d.receivedBy)}${d.date ? ` · ${fFecha(d.date)}` : ''}</b></div>
      </div>
      <div class="footer">MilePay Freight · milepay.io</div>
    </div>
  </div>
</body></html>`
}

// Imprime el ticket con el diálogo del sistema. Resuelve true si se invocó la
// impresión, false si el navegador/dispositivo no lo permite.
export function imprimirTicket(datos, empresa = 'Freight') {
  return new Promise((resolve) => {
    let frame = null
    const limpiar = () => { try { frame && frame.remove() } catch { /* noop */ } }
    try {
      frame = document.createElement('iframe')
      // Oculto pero PRESENTE (display:none rompe print() en algunos navegadores).
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
      document.body.appendChild(frame)
      const fdoc = frame.contentWindow?.document
      if (!fdoc) { limpiar(); resolve(false); return }
      fdoc.open(); fdoc.write(htmlTicket(datos, empresa)); fdoc.close()
      let hecho = false
      const lanzar = () => {
        if (hecho) return
        hecho = true
        try {
          const w = frame.contentWindow
          try { w.onafterprint = () => setTimeout(limpiar, 300) } catch { /* noop */ }
          w.focus()
          w.print()
          setTimeout(limpiar, 60000)
          resolve(true)
        } catch { limpiar(); resolve(false) }
      }
      frame.onload = () => setTimeout(lanzar, 50)
      setTimeout(lanzar, 400)
    } catch {
      limpiar(); resolve(false)
    }
  })
}
