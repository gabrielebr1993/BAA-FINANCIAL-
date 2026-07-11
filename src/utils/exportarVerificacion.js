// Exporta la ficha de VERIFICACIÓN de un chofer a un PDF con branding MilePay,
// incrustando las imágenes de sus documentos (licencia/ID, W-9) cuando son
// imágenes. Si un documento es PDF u otra cosa, o falla la descarga (CORS),
// se incluye como enlace clicable. jsPDF se carga bajo demanda.
import { ESTADOS_VERIFICACION } from './verificacion'

const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]

// Descarga un archivo de Storage y, si es imagen, lo devuelve como dataURL + medidas.
async function traerDocumento(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) return { tipo: 'archivo', mime: blob.type }
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('No se pudo leer el archivo'))
    fr.readAsDataURL(blob)
  })
  const dims = await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 })
    img.onerror = () => resolve({ w: 0, h: 0 })
    img.src = dataUrl
  })
  const fmt = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
  return { tipo: 'imagen', dataUrl, fmt, ...dims }
}

const ESTADO_LABEL = (k) => (ESTADOS_VERIFICACION.find((e) => e.key === k)?.label || k || 'Pendiente')
const STRIPE_LABEL = {
  sin_registrar: 'Sin registrar', pendiente: 'Pendiente (falta completar)',
  en_revision: 'En revisión de Stripe', verificado: 'Verificada en Stripe',
}

export async function exportarVerificacionPDF(driver, v) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  let y = 78

  // --- branding: se repite arriba de cada página ---
  const encabezado = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 54, 'F')
    doc.setFillColor(...GOLD); doc.rect(0, 54, W, 4, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text('MilePay', M, 34)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12)
    doc.text('Verificación del chofer', 108, 34)
    doc.setFontSize(9); doc.setTextColor(210, 210, 210)
    doc.text(driver?.nombre || v?.nombreCompleto || '', W - M, 34, { align: 'right' })
  }
  encabezado()

  const nuevaPagina = () => { doc.addPage(); encabezado(); y = 78 }
  const asegurar = (alto) => { if (y + alto > H - M) nuevaPagina() }

  const seccion = (titulo) => {
    asegurar(40)
    doc.setFillColor(244, 245, 247); doc.rect(M, y, W - 2 * M, 22, 'F')
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(titulo, M + 8, y + 15)
    y += 32
  }

  const campo = (label, valor) => {
    const txt = valor === '' || valor == null ? '—' : String(valor)
    const lines = doc.splitTextToSize(txt, W - 2 * M - 158)
    const alto = Math.max(16, lines.length * 13)
    asegurar(alto)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
    doc.text(label, M + 8, y + 10)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(25, 25, 25)
    doc.text(lines, M + 158, y + 10)
    y += alto + 4
  }

  const documento = async (label, url) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
    asegurar(18)
    doc.text(label, M + 8, y + 10); y += 16
    if (!url) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(150, 150, 150)
      doc.text('Sin documento', M + 8, y + 8); y += 22
      return
    }
    try {
      const r = await traerDocumento(url)
      if (r.tipo === 'imagen' && r.w && r.h) {
        const maxW = W - 2 * M - 16
        const maxH = 300
        const s = Math.min(maxW / r.w, maxH / r.h)
        const w = r.w * s, h = r.h * s
        asegurar(h + 12)
        doc.setDrawColor(220, 220, 220)
        doc.rect(M + 8, y, w + 2, h + 2)
        doc.addImage(r.dataUrl, r.fmt, M + 9, y + 1, w, h)
        y += h + 16
      } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY)
        doc.textWithLink('Abrir documento (enlace)', M + 8, y + 8, { url })
        y += 22
      }
    } catch {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(180, 70, 70)
      doc.textWithLink('No se pudo incrustar — abrir enlace del documento', M + 8, y + 8, { url })
      y += 22
    }
  }

  // ---------------- contenido ----------------
  seccion('Datos personales')
  campo('Nombre completo', v.nombreCompleto || driver?.nombre)
  campo('Teléfono', v.telefono)
  campo('Email', v.email)
  campo('Fecha de nacimiento', v.fechaNacimiento)
  campo('Dirección', v.direccion)

  seccion('Documentos e identificación')
  campo('Número de licencia / ID', v.licenciaNumero)
  campo('¿Entregó 1099?', v.w9Entregado ? 'Sí' : 'No')
  await documento('Imagen de licencia / ID', v.licenciaUrl)
  await documento('Documento 1099', v.w9Url)

  seccion('Estado de verificación')
  campo('Estatus', ESTADO_LABEL(v.estado))
  campo('Notas de revisión', v.notas)
  campo('Última revisión por', v.revisadoPor)

  seccion('Datos bancarios y pago (Stripe)')
  campo('Estado de la cuenta', STRIPE_LABEL[driver?.stripeEstado || 'sin_registrar'] || 'Sin registrar')
  if (driver?.stripeAccountId) campo('Cuenta Stripe', driver.stripeAccountId)
  if (driver?.stripeTest) campo('Modo', 'TEST')
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  asegurar(16)
  doc.text('Los datos bancarios los gestiona Stripe; MilePay no los almacena.', M + 8, y + 8)

  // pie con fecha de generación
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160)
  doc.text('Generado el ' + new Date().toLocaleString(), M, H - 20)

  const base = (driver?.nombre || v.nombreCompleto || 'chofer').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  doc.save(`verificacion_${base || 'chofer'}.pdf`)
}
