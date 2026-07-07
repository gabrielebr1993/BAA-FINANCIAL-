// Exportación de reportes a Excel (SheetJS) y PDF (jsPDF) con branding Gofo.
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

  // encabezado con branding
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, ancho, 54, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(0, 54, ancho, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Gofo', 40, 34)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.text(titulo, 100, 34)
  if (subtitulo) {
    doc.setFontSize(9)
    doc.setTextColor(200, 200, 200)
    doc.text(subtitulo, ancho - 40, 34, { align: 'right' })
  }

  let y = 78
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
