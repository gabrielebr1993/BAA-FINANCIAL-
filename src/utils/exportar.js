// Exportación de reportes a Excel (SheetJS) y PDF (jsPDF) con branding MilePay.
// jsPDF se carga bajo demanda (import dinámico) para no engordar el bundle inicial.
import * as XLSX from 'xlsx'

const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]

// hojas = [{ nombre, rows: [obj] }]
export function exportarExcel(nombreArchivo, hojas) {
  const wb = XLSX.utils.book_new()
  hojas.forEach((h) => {
    const ws = XLSX.utils.json_to_sheet(h.rows || [])
    XLSX.utils.book_append_sheet(wb, ws, (h.nombre || 'Hoja').slice(0, 31))
  })
  XLSX.writeFile(wb, nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`)
}

// tablas = [{ titulo, head: [..], body: [[..]] }]
export async function exportarPDF(nombreArchivo, titulo, subtitulo, tablas) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()

  // encabezado con branding (posiciones calculadas para no encimarse)
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, ancho, 64, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(0, 64, ancho, 4, 'F')
  // Marca MilePay (dorado) + tagline
  doc.setTextColor(...GOLD)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('MilePay', 40, 30)
  const brandW = doc.getTextWidth('MilePay')
  doc.setTextColor(150, 165, 185)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Gestión de facturas y pagos', 40, 46)
  // Separador vertical + título (después de la marca, con espacio)
  const tx = 40 + brandW + 18
  doc.setDrawColor(90, 105, 130)
  doc.line(tx - 9, 16, tx - 9, 48)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, tx, 28)
  if (subtitulo) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(210, 216, 226)
    doc.text(subtitulo, tx, 44)
  }

  let y = 92
  tablas.forEach((t) => {
    if (t.titulo) {
      doc.setTextColor(...NAVY)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(t.titulo, 40, y)
      y += 8
    }
    autoTable(doc, {
      startY: y + 4,
      head: [t.head],
      body: t.body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      alternateRowStyles: { fillColor: [244, 245, 247] },
      margin: { left: 40, right: 40 },
    })
    y = doc.lastAutoTable.finalY + 24
  })

  doc.save(nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`)
}
