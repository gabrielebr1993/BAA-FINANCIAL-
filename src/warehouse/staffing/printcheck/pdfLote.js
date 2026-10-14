// ============================================================================
// PRINT CHECK · Descarga en PDF (jsPDF) — misma lista de elementos que la
// vista/impresión HTML (elementosPagina), mismas coordenadas en puntos.
//
// Para que el PDF caiga EXACTO donde cae la impresión del navegador:
// · la línea base de cada texto se mide con la MISMA fuente que usa el HTML
//   (canvas.measureText → fontBoundingBoxAscent), no con un factor fijo;
// · la línea MICR lleva el mismo espaciado extra (letter-spacing 1px = 0.75pt);
// · las imágenes sin ancho propio (firmas) usan su proporción REAL, que se
//   precarga antes de dibujar (por eso la función es async).
// Si el dueño subió su fuente MICR (.ttf) en Ajustes, se incrusta en el PDF.
// ============================================================================
import { jsPDF } from 'jspdf'
import { elementosPagina } from './plantillaBA'

// mismas familias que el CSS de htmlLote
const FAM = {
  mono: "'Courier New',Courier,monospace",
  prop: 'Arial,Helvetica,sans-serif',
  micr: "'MICRCustom','MICR','MICR E13B','MICR Encoding','MICRe13b','E-13B','Courier New',monospace",
}

let ctxMedir = null
function ascentDe(familia, s) {
  // dónde pone el navegador la línea base: tope del elemento + ascent de la fuente
  try {
    if (!ctxMedir) ctxMedir = document.createElement('canvas').getContext('2d')
    ctxMedir.font = `${s}px ${familia}`
    const m = ctxMedir.measureText('Hg0&')
    if (m && Number.isFinite(m.fontBoundingBoxAscent) && m.fontBoundingBoxAscent > 0) return m.fontBoundingBoxAscent
  } catch { /* navegadores sin fontBoundingBoxAscent */ }
  return s * 0.82
}

const cargarImg = (src) => new Promise((res) => {
  const i = new Image()
  i.onload = () => res(i)
  i.onerror = () => res(null)
  i.src = src
})

export async function generarPdfLote({ cheques, cuenta, empresa, firma, impresion, prueba, nombreArchivo }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) // 612 × 792 pt
  const offX = (Number(impresion.offX) || 0) * 72
  const offY = (Number(impresion.offY) || 0) * 72

  // fuente MICR propia (dataURL .ttf) → incrustada en el PDF
  let fuenteMicr = 'courier'
  try {
    if (impresion.fuenteMICR && String(impresion.fuenteMICR).startsWith('data:')) {
      const b64 = String(impresion.fuenteMICR).split(',')[1]
      doc.addFileToVFS('micr.ttf', b64)
      doc.addFont('micr.ttf', 'MICRCustom', 'normal')
      fuenteMicr = 'MICRCustom'
    }
  } catch { /* cae a courier */ }

  // la fuente MICR también debe estar registrada en el navegador para poder
  // medir su línea base igual que la pinta el HTML (p. ej. PDF desde el
  // perfil del trabajador sin haber abierto Print Check)
  try {
    if (impresion.fuenteMICR && !document.fonts.check('12px MICRCustom')) {
      const ff = new FontFace('MICRCustom', `url(${impresion.fuenteMICR})`)
      document.fonts.add(await ff.load())
    }
  } catch { /* opcional: solo afecta la medición fina */ }

  // páginas calculadas una vez; proporción real de las imágenes sin ancho
  const paginas = cheques.map((ch) => elementosPagina({ ch, cuenta, empresa, firma, impresion, prueba }))
  const proporciones = {}
  const pendientes = new Set()
  for (const p of paginas) for (const e of p) if (e.t === 'img' && !e.w && e.src) pendientes.add(e.src)
  await Promise.all([...pendientes].map(async (src) => {
    const img = await cargarImg(src)
    if (img && img.height > 0) proporciones[src] = img.width / img.height
  }))

  paginas.forEach((els, idx) => {
    if (idx > 0) doc.addPage('letter')
    if (prueba) {
      doc.saveGraphicsState()
      doc.setGState(new doc.GState({ opacity: 0.22 }))
      doc.setTextColor(200, 30, 30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(46)
      doc.text('SAMPLE — NON-NEGOTIABLE', 70 + offX, 300 + offY, { angle: 18 })
      doc.restoreGraphicsState()
      doc.setTextColor(17, 17, 17)
    }
    for (const e of els) {
      const x = e.x + offX
      const y = e.y + offY
      if (e.t === 'line') {
        doc.setDrawColor(68, 68, 68); doc.setLineWidth(e.g || 0.8)
        doc.line(x, y, x + e.w, y)
      } else if (e.t === 'vline') {
        doc.setDrawColor(68, 68, 68); doc.setLineWidth(e.g || 0.8)
        doc.line(x, y, x, y + e.h)
      } else if (e.t === 'rect') {
        doc.setDrawColor(17, 17, 17); doc.setLineWidth(1.5)
        doc.rect(x, y, e.w, e.h)
      } else if (e.t === 'img') {
        try {
          const w = e.w || e.h * (proporciones[e.src] || 3)
          doc.addImage(e.src, 'PNG', x, y, w, e.h)
        } catch { /* una firma no rasterizable no debe tumbar el PDF */ }
      } else {
        const esMicr = e.f === 'micr'
        const fuente = e.f === 'prop' ? 'helvetica' : esMicr ? fuenteMicr : 'courier'
        doc.setFont(fuente, fuente === 'MICRCustom' ? 'normal' : (e.b ? 'bold' : 'normal'))
        doc.setFontSize(e.s)
        doc.setTextColor(e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17)
        const familia = e.f === 'prop' ? FAM.prop : esMicr ? FAM.micr : FAM.mono
        const baseline = y + ascentDe(familia, e.s)
        const ops = esMicr ? { charSpace: 0.75 } : {} // letter-spacing 1px del CSS
        if (e.al === 'r') doc.text(e.str, x + (e.w || 0), baseline, { align: 'right', ...ops })
        else doc.text(e.str, x, baseline, ops)
      }
    }
  })
  doc.save(nombreArchivo || 'cheques.pdf')
}
