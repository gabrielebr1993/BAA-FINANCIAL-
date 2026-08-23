// Genera el PDF de una factura Bulk (jsPDF + autotable, import dinámico).
const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function construirFacturaDoc(factura, { clienteNombre, empresa, titulo = 'FACTURA', paraLabel = 'Cliente', para } = {}) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255); doc.setFontSize(18); doc.setFont(undefined, 'bold')
  doc.text(empresa || 'Freight', 14, 15)
  doc.setFontSize(10); doc.setFont(undefined, 'normal')
  doc.text(titulo, 14, 22)
  doc.setTextColor(...GOLD); doc.setFontSize(12); doc.setFont(undefined, 'bold')
  doc.text(factura.numero || '', W - 14, 15, { align: 'right' })

  doc.setTextColor(60); doc.setFontSize(10)
  let y = 38
  doc.text(`${paraLabel}: ${para || clienteNombre || '—'}`, 14, y); y += 6
  doc.text(`Periodo: ${factura.desde || '—'} a ${factura.hasta || '—'}`, 14, y); y += 6
  if (factura.vence) { doc.text(`Vence: ${factura.vence}`, 14, y); y += 6 }
  doc.text(`Estado: ${factura.estado || 'enviada'}`, 14, y)

  const jobDe = (l) => l.jobNombre ? `${l.jobCodigo ? l.jobCodigo + ' · ' : ''}${l.jobNombre}` : (l.jobCodigo || '')
  const conJob = (factura.lineas || []).some((l) => jobDe(l))
  const head = conJob ? [['Job', 'Ticket', 'Material', 'Ton', 'Importe']] : [['Ticket', 'Material', 'Ton', 'Importe']]
  const body = (factura.lineas || []).map((l) => {
    const base = [l.numero, l.material, String(l.ton), money(l.precio)]
    return conJob ? [jobDe(l), ...base] : base
  })
  autoTable(doc, {
    startY: y + 6,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: NAVY },
    // Las DOS últimas columnas (Ton, Importe) van alineadas a la derecha TANTO en el
    // encabezado como en el cuerpo, para que los números queden a la par de su título.
    didParseCell: (data) => {
      const cols = data.table.columns.length
      if (data.column.index >= cols - 2) data.cell.styles.halign = 'right'
    },
  })

  let fy = doc.lastAutoTable.finalY + 8
  doc.setFontSize(11); doc.setFont(undefined, 'bold')
  doc.text(`Toneladas: ${factura.toneladas}`, 14, fy)
  doc.setTextColor(...NAVY); doc.setFontSize(13)
  doc.text(`TOTAL: ${money(factura.total)}`, W - 14, fy, { align: 'right' })

  if (factura.firma) {
    fy += 14
    try { doc.addImage(factura.firma, 'PNG', 14, fy, 50, 20) } catch { /* noop */ }
    doc.setTextColor(90); doc.setFontSize(9); doc.setFont(undefined, 'normal')
    doc.text(`Firmado por ${factura.firmante || 'cliente'} · ${factura.firmadaEn ? new Date(factura.firmadaEn).toLocaleString('es') : ''}`, 14, fy + 26)
  }

  return doc
}

// Descarga el PDF (comportamiento de siempre).
export async function generarFacturaPDF(factura, opts = {}) {
  const doc = await construirFacturaDoc(factura, opts)
  doc.save(`${factura.numero || 'factura'}.pdf`)
}

// Devuelve el PDF como base64 + nombre, para ADJUNTARLO a un correo.
export async function generarFacturaPDFBase64(factura, opts = {}) {
  const doc = await construirFacturaDoc(factura, opts)
  const buf = new Uint8Array(doc.output('arraybuffer'))
  let bin = ''
  const paso = 0x8000
  for (let i = 0; i < buf.length; i += paso) bin += String.fromCharCode.apply(null, buf.subarray(i, i + paso))
  return { datab64: btoa(bin), nombre: `${factura.numero || 'factura'}.pdf`, bytes: buf.length }
}
