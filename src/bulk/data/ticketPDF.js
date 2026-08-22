// Genera el PDF de un MATERIAL TICKET (formato angosto tipo comprobante, 80mm).
// Legible en blanco y negro. Usa jsPDF (ya en el proyecto).
const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]

const fFecha = (s) => { if (!s) return '—'; try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(s) } }

export async function generarTicketPDF(d, { empresa = 'Freight' } = {}) {
  const { default: jsPDF } = await import('jspdf')
  const W = 80
  const doc = new jsPDF({ unit: 'mm', format: [W, 200] })
  let y = 8
  // Encabezado
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 16, 'F')
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(empresa, 6, 7)
  doc.setTextColor(...GOLD); doc.setFontSize(9)
  doc.text(d.event === 'Loaded' ? 'LOADING TICKET' : 'DELIVERY TICKET', 6, 12)
  y = 22
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(String(d.ticketNumber || d.ordenNumero || ''), 6, y); y += 6

  const row = (label, val) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110)
    doc.text(String(label).toUpperCase(), 6, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20)
    const txt = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), W - 12)
    doc.text(txt, 6, y + 3.6)
    y += 3.6 + txt.length * 3.8 + 2.4
  }
  row('Ticket Number', d.ticketNumber || d.ordenNumero)
  row('Job', d.jobLabel)
  row('Date', fFecha(d.date))
  row('Event', d.event)
  row('Supplier', d.supplier)
  row('Material', d.material)
  row('Origin', d.origin)
  row('Batch Plant Location', d.batchPlant)
  row('Quantity', `${d.quantity} ${d.unit}`)
  row('Carrier', d.carrier)
  row('Truck #', d.truck)
  if (d.destino) row(d.event === 'Loaded' ? 'Destination' : 'Delivered to', d.destino)

  // Firma
  y += 4
  doc.setDrawColor(150); doc.line(6, y, W - 6, y); y += 3.6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110)
  doc.text(d.event === 'Loaded' ? 'Plant supervisor signature' : 'Received by (signature)', 6, y)

  doc.save(`${d.event === 'Loaded' ? 'Ticket-Carga' : 'Ticket-Entrega'}-${d.ordenNumero || d.ticketNumber || 'orden'}.pdf`)
}
