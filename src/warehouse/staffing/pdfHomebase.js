// ============================================================================
// Capa de NAVEGADOR del importador Homebase: extrae las líneas de texto del PDF
// con pdfjs y las pasa al parser puro (./parserHomebase). Se separa de la
// lógica para poder probar el parser en Node sin pdfjs.
//
// Reconstrucción de líneas: pdfjs da fragmentos con coordenadas (x,y). Agrupo
// por cercanía vertical (±3px = misma línea visual) y ordeno por x; así obtengo
// las mismas líneas que vería una persona, listas para el parser.
// ============================================================================
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parsearHomebase } from './parserHomebase'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// ArrayBuffer/Uint8Array del PDF → array de líneas de texto (todas las páginas).
export async function lineasDePdf(data) {
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise
  const lineas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }))
    items.sort((a, b) => b.y - a.y || a.x - b.x) // de arriba a abajo, izq. a der.
    const grupos = []
    let cur = null
    for (const it of items) {
      if (!cur || Math.abs(it.y - cur.y) > 3) { cur = { y: it.y, its: [it] }; grupos.push(cur) }
      else cur.its.push(it)
    }
    for (const g of grupos) {
      const txt = g.its.sort((a, b) => a.x - b.x).map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim()
      if (txt) lineas.push(txt)
    }
    page.cleanup()
  }
  return { lineas, numPaginas: pdf.numPages }
}

// Punto de entrada: File/Blob/ArrayBuffer del PDF → resultado del parser
// { periodo, personas[], avisos[] }.
export async function analizarPdfHomebase(entrada) {
  let data = entrada
  if (entrada instanceof Blob) data = await entrada.arrayBuffer()
  const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  const { lineas, numPaginas } = await lineasDePdf(buf)
  const res = parsearHomebase(lineas)
  return { ...res, numPaginas }
}
