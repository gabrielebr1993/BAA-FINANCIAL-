// ============================================================================
// SPEEDX · AUDITORÍA — capa de NAVEGADOR: convierte un archivo (PDF de Chase,
// Excel o CSV) en depósitos de SpeedX, usando pdfjs / xlsx. La lógica de
// parseo y conciliación vive en ./auditoriaCobros (pura, testeable en Node).
// ============================================================================
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'
import { parsearEstadoCuenta, depositosDeFilas, SPEEDX_MARCADORES } from './auditoriaCobros'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// PDF (ArrayBuffer/Uint8Array) → líneas de texto reconstruidas por posición.
async function lineasDePdf(data) {
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise
  const lineas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }))
    items.sort((a, b) => b.y - a.y || a.x - b.x)
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
  return lineas
}

// Un archivo → { fuente, periodo, depositos[], todosDepositos[], avisos[] }.
export async function analizarArchivo(file, { marcadores = SPEEDX_MARCADORES } = {}) {
  const nombre = file.name || 'archivo'
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  const buf = await file.arrayBuffer()

  if (ext === 'pdf' || file.type === 'application/pdf') {
    const lineas = await lineasDePdf(new Uint8Array(buf))
    const res = parsearEstadoCuenta(lineas, { marcadores })
    return { fuente: nombre, tipo: 'pdf', ...res }
  }

  // Excel / CSV con xlsx.
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const todas = []
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: '' })
    if (filas.length) todas.push(...filas)
  }
  const res = depositosDeFilas(todas, { marcadores })
  return { fuente: nombre, tipo: ext === 'csv' ? 'csv' : 'excel', periodo: null, ...res }
}

// Varios archivos → depósitos combinados (dedupe por fecha+monto+descripción).
export async function analizarArchivos(files, opts = {}) {
  const fuentes = []
  const avisos = []
  const depositos = []
  const todosDepositos = []
  let periodo = null
  const vistos = new Set()
  for (const f of files) {
    try {
      const r = await analizarArchivo(f, opts)
      fuentes.push({ nombre: r.fuente, tipo: r.tipo, nSpeedX: r.depositos.length, periodo: r.periodo })
      if (!periodo && r.periodo) periodo = r.periodo
      ;(r.avisos || []).forEach((a) => avisos.push(`${r.fuente}: ${a}`))
      for (const d of r.depositos) {
        const k = `${d.fecha}|${d.monto}|${d.descripcion}`
        if (vistos.has(k)) continue
        vistos.add(k)
        depositos.push({ ...d, fuente: r.fuente })
      }
      for (const d of r.todosDepositos || []) todosDepositos.push({ ...d, fuente: r.fuente })
    } catch (e) {
      avisos.push(`${f.name}: no pude leer el archivo (${e.message || e}).`)
    }
  }
  depositos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  return { fuentes, periodo, depositos, todosDepositos, avisos }
}
