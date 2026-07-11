// Generador del W-9 en el SERVIDOR (pdf-lib). Rellena el formulario con los datos
// del chofer (nombre, dirección, SSN) YA guardados y embebe la FIRMA (imagen PNG
// que el chofer dibuja en la app, tipo DocuSign) + la fecha. Devuelve un Buffer PDF.
// Archivo con prefijo "_": es una librería interna, NO una ruta serverless.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const fmtSSN = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d }

export async function generarW9Buffer(datos = {}) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // Carta
  const W = 612, M = 48
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.074, 0.137, 0.247)
  const gold = rgb(0.788, 0.635, 0.294)
  const gray = rgb(0.35, 0.35, 0.35)
  const dark = rgb(0.08, 0.08, 0.08)
  const linea = rgb(0.78, 0.78, 0.78)

  let y = 792 - 56
  const draw = (t, x, yy, { f = font, size = 11, color = dark } = {}) => page.drawText(String(t == null || t === '' ? '—' : t), { x, y: yy, size, font: f, color })

  // Encabezado
  draw('Form W-9', M, y, { f: bold, size: 16, color: navy })
  draw('Request for Taxpayer Identification Number and Certification', M, y - 16, { f: font, size: 10, color: gray })
  y -= 34
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: gold })
  y -= 26

  // Campo con etiqueta + valor + subrayado.
  const campo = (label, valor, ancho) => {
    draw(label, M, y, { f: bold, size: 9, color: gray })
    draw(valor, M, y - 15, { size: 11, color: dark })
    page.drawLine({ start: { x: M, y: y - 20 }, end: { x: ancho || (W - M), y: y - 20 }, thickness: 1, color: linea })
    y -= 38
  }

  campo('1. Name (as shown on your income tax return) / Nombre', datos.nombre)
  campo('2. Business name (if different) / Nombre de negocio', datos.businessName || '')
  campo('3. Federal tax classification', datos.clasificacion || 'Individual / sole proprietor')
  campo('5. Address (number, street, city, state, ZIP) / Dirección', datos.direccion)

  // Part I — TIN
  y -= 4
  draw('Part I — Taxpayer Identification Number (TIN)', M, y, { f: bold, size: 11, color: navy })
  y -= 20
  campo('Social Security Number (SSN)', datos.ssnFormateado || fmtSSN(datos.ssn))

  // Part II — Certification
  y -= 6
  draw('Part II — Certification', M, y, { f: bold, size: 11, color: navy })
  y -= 16
  const cert = 'Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number, that I am not subject to backup withholding, and that I am a U.S. person.'
  // Envuelve el texto de certificación.
  const wrap = (t, max, size) => {
    const words = String(t).split(' '); const out = []; let cur = ''
    for (const w of words) { const test = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(test, size) > max) { out.push(cur); cur = w } else cur = test }
    if (cur) out.push(cur); return out
  }
  wrap(cert, W - 2 * M, 8.5).forEach((ln) => { draw(ln, M, y, { size: 8.5, color: gray }); y -= 12 })
  y -= 22

  // Firma (imagen) + fecha
  draw('Signature / Firma', M, y, { f: bold, size: 9, color: gray })
  draw('Date / Fecha', W / 2 + 20, y, { f: bold, size: 9, color: gray })
  const sigY = y - 46
  if (datos.firmaPngBase64) {
    try {
      const png = await pdf.embedPng(Buffer.from(datos.firmaPngBase64, 'base64'))
      const maxW = 180, maxH = 44
      let w = png.width, h = png.height
      const r = Math.min(maxW / w, maxH / h)
      w *= r; h *= r
      page.drawImage(png, { x: M, y: sigY + 2, width: w, height: h })
    } catch { /* si la firma no es PNG válido, se deja la línea vacía */ }
  } else if (datos.firma) {
    draw(datos.firma, M, y - 24, { size: 13, color: dark })
  }
  page.drawLine({ start: { x: M, y: sigY }, end: { x: W / 2 - 10, y: sigY }, thickness: 1, color: linea })
  draw(datos.fecha || '', W / 2 + 20, y - 24, { size: 11, color: dark })
  page.drawLine({ start: { x: W / 2 + 20, y: sigY }, end: { x: W - M, y: sigY }, thickness: 1, color: linea })

  draw('Documento generado y firmado en MilePay a partir de los datos del chofer.', M, 40, { f: font, size: 8, color: rgb(0.6, 0.6, 0.6) })

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
