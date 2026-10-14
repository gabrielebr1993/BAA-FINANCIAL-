// ============================================================================
// PRINT CHECK · Descarga en PDF (jsPDF) — misma lista de elementos que la
// vista/impresión HTML (elementosPagina), mismas coordenadas en puntos.
//
// jsPDF mide las letras con SUS tablas (Helvetica/Courier de Adobe), que no
// son las del navegador, así que un texto dibujado "de corrido" se va
// desfasando. Para que el PDF caiga EXACTO donde cae la impresión HTML:
// · cada carácter se coloca en la posición que mide el navegador
//   (canvas.measureText con la MISMA familia, negrita/cursiva y
//   letter-spacing del CSS) — el desfase no se acumula;
// · la línea base se mide con fontBoundingBoxAscent (donde la pone el HTML);
// · los recuadros imitan el borde CSS (hacia afuera del ancho/alto);
// · las rayas se corren media línea como el border-top/left del CSS;
// · las imágenes sin ancho (firmas) usan su proporción real precargada.
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
const ESPACIADO_MICR = 0.75 // letter-spacing:1px del CSS, en pt de impresión

let ctxMedir = null
function ctxDe(familia, s, b, i) {
  if (!ctxMedir) ctxMedir = document.createElement('canvas').getContext('2d')
  // el letter-spacing se suma a mano (k × esp): mismo resultado en Chrome y
  // en Safari, que no soporta letterSpacing en canvas
  try { if ('letterSpacing' in ctxMedir) ctxMedir.letterSpacing = '0px' } catch { /* opcional */ }
  ctxMedir.font = `${i ? 'italic ' : ''}${b ? 'bold ' : ''}${s}px ${familia}`
  return ctxMedir
}
function ascentDe(familia, s) {
  try {
    const m = ctxDe(familia, s, 0, 0).measureText('Hg0&')
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

export async function generarPdfLote(args) {
  // si algo truena en un navegador concreto (Safari…), que el usuario VEA
  // el error en vez de un botón que no hace nada
  try {
    await generarPdfLoteInterno(args)
  } catch (err) {
    console.error('PDF:', err)
    try { window.alert('No se pudo generar el PDF: ' + (err && err.message ? err.message : err)) } catch { /* sin UI */ }
  }
}

async function generarPdfLoteInterno({ cheques, cuenta, empresa, firma, impresion, prueba, nombreArchivo }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) // 612 × 792 pt
  // instrucción interna del PDF: imprimir a TAMAÑO REAL, sin "ajustar al
  // papel" — evita que Vista Previa/Adobe reescalen y el cheque baje
  try { doc.viewerPreferences({ PrintScaling: 'None' }) } catch { /* opcional */ }
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
  // medirla igual que la pinta el HTML (p. ej. PDF desde el perfil del
  // trabajador sin haber abierto Print Check). OJO: document.fonts.check()
  // responde "sí" para familias desconocidas, así que se recorre el set.
  try {
    if (impresion.fuenteMICR) {
      let registrada = false
      document.fonts.forEach((f) => { if (String(f.family).replace(/["']/g, '') === 'MICRCustom') registrada = true })
      if (!registrada) {
        const ff = new FontFace('MICRCustom', `url(${impresion.fuenteMICR})`)
        document.fonts.add(await ff.load())
      }
      await document.fonts.load('12px MICRCustom')
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

  // texto colocado carácter por carácter donde lo mediría el navegador
  const textoExacto = (e, x, y) => {
    const esMicr = e.f === 'micr'
    const familia = e.f === 'prop' ? FAM.prop : esMicr ? FAM.micr : FAM.mono
    const fuentePdf = e.f === 'prop' ? 'helvetica' : esMicr ? fuenteMicr : 'courier'
    const estilo = fuentePdf === 'MICRCustom' ? 'normal' : (e.b && e.i ? 'bolditalic' : e.b ? 'bold' : e.i ? 'italic' : 'normal')
    doc.setFont(fuentePdf, estilo)
    doc.setFontSize(e.s)
    doc.setTextColor(e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17, e.f === 'det' ? 51 : 17)
    const esp = esMicr ? ESPACIADO_MICR : 0
    const baseline = y + ascentDe(familia, e.s)
    // el HTML colapsa los espacios seguidos a uno (white-space: nowrap);
    // el PDF debe hacer lo mismo o los grupos quedan corridos
    const str = String(e.str || '').replace(/\s+/g, ' ')
    let ctx
    try { ctx = ctxDe(familia, e.s, e.b, e.i) } catch { ctx = null }
    if (!ctx || !str) { doc.text(str, x, baseline); return }
    // alineado a la derecha: arrancar donde arrancaría el navegador
    let x0 = x
    if (e.al === 'r') x0 = x + (e.w || 0) - (ctx.measureText(str).width + str.length * esp)
    for (let k = 0; k < str.length; k++) {
      const antes = ctx.measureText(str.slice(0, k)).width + k * esp
      doc.text(str[k], x0 + antes, baseline)
    }
  }

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
        // el CSS pinta el border-top de y hacia abajo; la línea del PDF se
        // centra en su trazo → correr media línea
        const g = e.g || 0.8
        doc.setDrawColor(68, 68, 68); doc.setLineWidth(g)
        doc.line(x, y + g / 2, x + e.w, y + g / 2)
      } else if (e.t === 'vline') {
        const g = e.g || 0.8
        doc.setDrawColor(68, 68, 68); doc.setLineWidth(g)
        doc.line(x + g / 2, y, x + g / 2, y + e.h)
      } else if (e.t === 'rect') {
        // el CSS dibuja el borde HACIA AFUERA del ancho/alto (content-box)
        doc.setDrawColor(17, 17, 17); doc.setLineWidth(1.5)
        doc.rect(x + 0.75, y + 0.75, e.w + 1.5, e.h + 1.5)
      } else if (e.t === 'img') {
        try {
          const w = e.w || e.h * (proporciones[e.src] || 3)
          doc.addImage(e.src, 'PNG', x, y, w, e.h)
        } catch { /* una firma no rasterizable no debe tumbar el PDF */ }
      } else {
        textoExacto(e, x, y)
      }
    }
  })
  doc.save(nombreArchivo || 'cheques.pdf')
}
