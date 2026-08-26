// Genera el PDF del MATERIAL TICKET / BOL (formato angosto ~80 mm, misma
// estructura que la vista y la impresión: identificación+tiempos, cadena
// Supplier/Customer/Delivery To, material y transporte, tabla Gross/Tare/Net
// en lb y tons, control del pedido y firma). Legible en B/N. Usa jsPDF.
const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]
const GREEN = [63, 157, 107]
const GRIS = [148, 163, 184]
const TINTA = [30, 41, 59]

const fFecha = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-US') } catch { return String(s) } }
const nLb = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const nT = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
const o = (v) => (v == null || v === '' ? '—' : String(v))

export async function generarTicketPDF(d, { empresa = 'Freight' } = {}) {
  const { default: jsPDF } = await import('jspdf')
  const W = 80
  const doc = new jsPDF({ unit: 'mm', format: [W, 240] })
  const M = 5 // margen
  let y = 0
  const p = d.pesos || {}
  const ped = d.pedido || null
  const carga = d.event === 'Loaded'

  // 1 · Encabezado
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 15, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255)
  doc.text('MilePay', M, 7)
  doc.setTextColor(...GOLD); doc.text(empresa, M + doc.getTextWidth('MilePay ') , 7)
  doc.setFontSize(6); doc.text('MATERIAL TICKET · BILL OF LADING', M, 11.5)
  const evW = doc.getTextWidth(d.event.toUpperCase()) + 5
  doc.setFillColor(...(carga ? GREEN : GOLD)); doc.roundedRect(W - M - evW, 4.5, evW, 6, 1, 1, 'F')
  doc.setFontSize(8); doc.setTextColor(...(carga ? [255, 255, 255] : NAVY)); doc.text(d.event.toUpperCase(), W - M - evW + 2.5, 8.6)
  y = 21

  // 2 · Identificación y tiempos
  doc.setFont('courier', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY)
  doc.text(o(d.ticketNumber || d.ordenNumero), M, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100)
  doc.text(fFecha(d.date), W - M, y, { align: 'right' })
  y += 4

  const colW3 = (W - M * 2) / 3
  const celda = (x, yy, l, v, w) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5); doc.setTextColor(...GRIS)
    doc.text(String(l).toUpperCase(), x, yy)
    doc.setFontSize(7.5); doc.setTextColor(...TINTA)
    const txt = doc.splitTextToSize(o(v), w - 2)
    doc.text(txt[0] || '—', x, yy + 3)
    doc.setDrawColor(203, 213, 225); doc.setLineDashPattern([1, 1], 0)
    doc.line(x, yy + 4.2, x + w - 2, yy + 4.2)
    doc.setLineDashPattern([], 0)
  }
  celda(M, y, 'Time In', d.timeIn, colW3); celda(M + colW3, y, 'Time Out', d.timeOut, colW3); celda(M + colW3 * 2, y, 'Total', d.timeTotal, colW3)
  y += 7
  celda(M, y, 'PO #', d.po, colW3); celda(M + colW3, y, 'Order #', d.ordenNumero, colW3); celda(M + colW3 * 2, y, 'Job', d.jobLabel, colW3)
  y += 8

  const seccion = (titulo) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...GOLD)
    doc.text(titulo.toUpperCase(), M, y); y += 2.5
  }

  // 3 · Cadena Supplier / Customer / Delivery To
  seccion('Supplier · Customer · Delivery')
  const altoCad = 14
  doc.setFillColor(248, 243, 235); doc.roundedRect(M, y, W - M * 2, altoCad, 1.5, 1.5, 'F')
  const cad = (x, l, v, w) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5); doc.setTextColor(...GRIS)
    doc.text(String(l).toUpperCase(), x, y + 3.4)
    doc.setFontSize(6.8); doc.setTextColor(...TINTA)
    doc.text(doc.splitTextToSize(o(v), w - 2).slice(0, 3), x, y + 6.4)
  }
  const wCad = (W - M * 2) / 3
  cad(M + 1.5, 'Supplier / Ship From', d.supplier, wCad)
  cad(M + 1.5 + wCad, 'Customer', d.customer, wCad)
  cad(M + 1.5 + wCad * 2, 'Delivery To', d.deliveryTo, wCad)
  y += altoCad + 4

  // 4 · Material y transporte
  seccion('Material & Haul')
  const colW2 = (W - M * 2) / 2
  celda(M, y, 'Material / Product', d.material, colW2); celda(M + colW2, y, 'Origin', d.origin, colW2); y += 7
  celda(M, y, 'Carrier', d.carrier, colW2); celda(M + colW2, y, 'Truck # / Vehicle', d.truck, colW2); y += 7
  celda(M, y, 'License', d.license, colW2); celda(M + colW2, y, 'Weighmaster', d.weighmaster, colW2); y += 7
  celda(M, y, 'Sales / P&D Status', d.salesStatus, W - M * 2); y += 8

  // 5 · Tabla de peso Gross/Tare/Net
  seccion('Weights')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5); doc.setTextColor(...GRIS)
  doc.text('POUNDS', W - M - 24, y, { align: 'right' }); doc.text('TONS', W - M, y, { align: 'right' }); y += 1.2
  const filaPeso = (l, lb, t, net = false) => {
    if (net) { doc.setFillColor(236, 247, 241); doc.rect(M, y, W - M * 2, 5.2, 'F') }
    doc.setDrawColor(...(net ? GREEN : [226, 232, 240])); doc.setLineWidth(net ? 0.5 : 0.2)
    doc.line(M, y, W - M, y)
    doc.setFont('helvetica', net ? 'bold' : 'bold'); doc.setFontSize(7.5)
    doc.setTextColor(...(net ? GREEN : [100, 116, 139])); doc.text(l, M + 1, y + 3.7)
    doc.setFont('courier', 'bold'); doc.setTextColor(...(net ? GREEN : TINTA))
    doc.text(nLb(lb), W - M - 24, y + 3.7, { align: 'right' })
    doc.text(nT(t), W - M, y + 3.7, { align: 'right' })
    y += 5.2
  }
  filaPeso('Gross', p.grossLb, p.grossT)
  filaPeso('Tare', p.tareLb, p.tareT)
  filaPeso('Net', p.netLb, p.netT, true)
  y += 2
  // Net grande
  doc.setDrawColor(...GREEN); doc.setLineWidth(0.6); doc.roundedRect(M, y, W - M * 2, 9, 1.5, 1.5, 'S')
  doc.setFont('courier', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY)
  const netTxt = nT(p.netT)
  doc.text(netTxt, W / 2 - 8, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(100)
  doc.text(`NET TONS${p.netLb != null ? `  (${nLb(p.netLb)} lb)` : ''}`, W / 2 - 5, y + 6)
  y += 13

  // 6 · Control del pedido
  if (ped && (ped.ordered != null || ped.received > 0)) {
    seccion('Order Progress')
    if (ped.ordered > 0) {
      const pct = Math.min(1, ped.received / ped.ordered)
      doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - M * 2, 2, 1, 1, 'F')
      if (pct > 0) { doc.setFillColor(...GREEN); doc.roundedRect(M, y, (W - M * 2) * pct, 2, 1, 1, 'F') }
      y += 4
    }
    const wP = (W - M * 2) / 4
    const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
    ;[['Ordered', ped.ordered], ['Received', ped.received], ['Remaining', ped.remaining], ['Loads', ped.loads]].forEach(([l, v], i) => {
      const cx = M + wP * i + wP / 2
      doc.setFont('courier', 'bold'); doc.setFontSize(8); doc.setTextColor(...TINTA)
      doc.text(num(v), cx, y + 2.5, { align: 'center' })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5); doc.setTextColor(...GRIS)
      doc.text(String(l).toUpperCase(), cx, y + 5.3, { align: 'center' })
    })
    y += 9
  }

  // 7 · Firma
  y += 5
  if (d.firmaImg) {
    try { doc.addImage(d.firmaImg, 'PNG', M, y - 2, 34, 10) } catch { /* firma no embebible */ }
  }
  y += 9
  doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 3
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRIS)
  doc.text(carga ? 'LOADED BY (PLANT SUPERVISOR)' : 'RECEIVED BY', M, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(71, 85, 105)
  doc.text(`${o(d.receivedBy)}${d.date ? ` · ${fFecha(d.date)}` : ''}`, W - M, y, { align: 'right' })
  y += 5

  // 8 · Pie
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 3
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...GRIS)
  doc.text('MilePay Freight · milepay.io', W / 2, y, { align: 'center' })

  doc.save(`${carga ? 'Ticket-Loaded' : 'Ticket-Received'}-${d.ticketNumber || d.ordenNumero || 'orden'}.pdf`)
}
