// ============================================================================
// PRINT CHECK · Descarga en PDF (jsPDF) — misma lista de elementos que la
// vista/impresión HTML (elementosPagina), mismas coordenadas en puntos.
// Si el dueño subió su fuente MICR (.ttf) en Ajustes, se incrusta en el PDF;
// si no, la línea MICR sale en Courier (para papel preimpreso da igual).
// ============================================================================
import { jsPDF } from 'jspdf'
import { elementosPagina } from './plantillaBA'

export function generarPdfLote({ cheques, cuenta, empresa, firma, impresion, prueba, nombreArchivo }) {
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

  cheques.forEach((ch, idx) => {
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
    for (const e of elementosPagina({ ch, cuenta, empresa, firma, impresion, prueba })) {
      const x = e.x + offX
      const y = e.y + offY
      if (e.t === 'line') {
        doc.setDrawColor(68, 68, 68); doc.setLineWidth(0.8)
        doc.line(x, y, x + e.w, y)
      } else if (e.t === 'rect') {
        doc.setDrawColor(17, 17, 17); doc.setLineWidth(1.5)
        doc.rect(x, y, e.w, e.h)
      } else if (e.t === 'img') {
        try {
          // alto fijo; el ancho se estima 3:1 (las firmas se optimizan apaisadas)
          doc.addImage(e.src, 'PNG', x, y, e.h * 3, e.h)
        } catch { /* una firma no rasterizable no debe tumbar el PDF */ }
      } else {
        const fuente = e.f === 'prop' ? 'helvetica' : e.f === 'micr' ? fuenteMicr : 'courier'
        doc.setFont(fuente, fuente === 'MICRCustom' ? 'normal' : (e.b ? 'bold' : 'normal'))
        doc.setFontSize(e.s)
        doc.setTextColor(e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17)
        // CSS posiciona el TOPE del texto; jsPDF la LÍNEA BASE → compensar
        const baseline = y + e.s * 0.82
        if (e.al === 'r') doc.text(e.str, x + (e.w || 0), baseline, { align: 'right' })
        else doc.text(e.str, x, baseline)
      }
    }
  })
  doc.save(nombreArchivo || 'cheques.pdf')
}
