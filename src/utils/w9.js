// URL del formulario W-9 OFICIAL del IRS (fillable). El chofer puede abrirlo,
// llenarlo en su teléfono/PC y subirlo. Es la fuente oficial y siempre vigente.
export const W9_OFICIAL_URL = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf'

// Genera una planilla W-9 (Request for Taxpayer Identification Number and
// Certification) PRELLENADA con los datos del chofer, y la devuelve en base64
// (para subirla). No es el PDF oficial editable del IRS, sino un documento claro
// con los mismos campos y valores, firmado con el nombre y la fecha.
export async function generarW9Base64(datos) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const M = 48
  let y = 56

  const line = (label, valor, opts = {}) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
    doc.text(label, M, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
    const val = valor == null || valor === '' ? '—' : String(valor)
    doc.text(val, M, y + 15)
    doc.setDrawColor(200, 200, 200); doc.line(M, y + 20, opts.ancho || (W - M), y + 20)
    y += 38
  }

  // Encabezado
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(19, 35, 63)
  doc.text('Form W-9', M, y)
  doc.setFontSize(10); doc.setTextColor(80, 80, 80)
  doc.text('Request for Taxpayer Identification Number and Certification', M, y + 16)
  y += 40
  doc.setDrawColor(201, 162, 75); doc.setLineWidth(2); doc.line(M, y, W - M, y); doc.setLineWidth(1); y += 22

  line('1. Name (as shown on your income tax return) / Nombre', datos.nombre)
  line('2. Business name (if different) / Nombre de negocio', datos.businessName || '')
  line('3. Federal tax classification / Clasificación fiscal', datos.clasificacion || 'Individual / sole proprietor')
  line('5. Address (number, street) / Dirección', datos.direccion)
  line('6. City, state, ZIP / Ciudad, estado, código postal', datos.ciudadEstadoZip || '')

  // Part I - TIN
  y += 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(19, 35, 63)
  doc.text('Part I — Taxpayer Identification Number (TIN)', M, y); y += 20
  line('Social Security Number (SSN)', datos.ssnFormateado || datos.ssn)

  // Part II - Certification
  y += 6
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(19, 35, 63)
  doc.text('Part II — Certification', M, y); y += 16
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70)
  const cert = 'Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number, and (2) I am not subject to backup withholding, and (3) I am a U.S. person. / Bajo pena de perjurio, certifico que la información es correcta y que soy una persona de EE. UU.'
  doc.text(doc.splitTextToSize(cert, W - 2 * M), M, y); y += 40

  line('Signature / Firma (nombre)', datos.firma || datos.nombre, { ancho: (W - M) / 2 })
  // Fecha al lado
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
  doc.text('Date / Fecha', W / 2 + 20, y - 38)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
  doc.text(datos.fecha || new Date().toLocaleDateString(), W / 2 + 20, y - 23)

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('Documento generado en MilePay a partir de los datos ingresados por el chofer.', M, doc.internal.pageSize.getHeight() - 30)

  return doc.output('datauristring').split(',')[1] // base64
}
