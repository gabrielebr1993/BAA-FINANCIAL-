// ============================================================================
// BULK · OCR de tickets de báscula EN EL NAVEGADOR (Tesseract.js, sin backend).
// Lee la foto del ticket y extrae peso neto/bruto/tara, número, fecha. El chofer
// SIEMPRE confirma el resultado (la precisión depende de la foto). Import dinámico
// para no cargar Tesseract hasta que se use.
// Para OCR de mayor precisión (documentos borrosos, manuscritos) se puede sustituir
// por un servicio en la nube (Google Vision / Textract) desde el backend: mismo
// contrato de salida.
// ============================================================================

const aNum = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')) || null)
const num = (t, re) => { const m = t.match(re); return m ? aNum(m[1]) : null }

// Convierte un peso leído a TONELADAS según la unidad que acompañe al número (la
// app trabaja en toneladas). Sin unidad clara: si el número es grande (>200) se
// asume que viene en libras (típico en tickets de báscula de EE. UU.).
function aToneladas(valor, contexto) {
  if (valor == null) return null
  const c = (contexto || '').toLowerCase()
  if (/\b(lb|lbs|libras?|pound)/.test(c)) return +(valor / 2000).toFixed(2)  // libras → ton corta
  if (/\bkg|kilo/.test(c)) return +(valor / 1000).toFixed(2)                  // kg → ton métrica
  if (/\b(ton|tonel|tn|mt)\b/.test(c)) return +valor.toFixed(2)               // ya en toneladas
  return valor > 200 ? +(valor / 2000).toFixed(2) : +valor.toFixed(2)         // heurística por magnitud
}

// Busca un peso etiquetado (net/neto, gross/bruto, tare/tara) tolerando OCR sucio.
// Devuelve { valor, contexto } para poder convertir la unidad después.
function pesoEtiquetado(t, etiquetas) {
  for (const et of etiquetas) {
    const re = new RegExp(`${et}[^0-9]{0,12}([\\d.,]{2,})\\s*(lbs?|kg|tons?|toneladas?|tn)?`, 'i')
    const m = t.match(re)
    if (m) return { valor: aNum(m[1]), contexto: (m[0] || '') + ' ' + (m[2] || '') }
  }
  return { valor: null, contexto: '' }
}

export function parsearTicket(texto) {
  const t = (texto || '').replace(/\r/g, '')
  // Etiquetas EN + ES, tolerando variantes que suele producir el OCR.
  const netoRaw = pesoEtiquetado(t, ['net\\s*(?:weight|wt)?', 'neto', 'peso\\s*neto', 'nt\\s*wt'])
  const brutoRaw = pesoEtiquetado(t, ['gross\\s*(?:weight|wt)?', 'bruto', 'peso\\s*bruto', 'gr\\s*wt'])
  const taraRaw = pesoEtiquetado(t, ['tare', 'tara'])
  let pesoNeto = aToneladas(netoRaw.valor, netoRaw.contexto)
  const pesoBruto = aToneladas(brutoRaw.valor, brutoRaw.contexto)
  const tara = aToneladas(taraRaw.valor, taraRaw.contexto)
  // Si no hubo "neto" pero sí bruto y tara, el neto es la resta.
  if (pesoNeto == null && pesoBruto != null && tara != null) pesoNeto = +(pesoBruto - tara).toFixed(2)
  // Último recurso: el mayor número con pinta de peso (evita fechas/horas/teléfonos).
  if (pesoNeto == null) {
    const cands = [...t.matchAll(/([\d.,]{2,})\s*(lbs?|kg|tons?|toneladas?|tn)\b/gi)].map((m) => aToneladas(aNum(m[1]), m[0]))
    const validos = cands.filter((v) => v != null && v > 0 && v < 100) // una carga real no pasa de ~100 ton
    if (validos.length) pesoNeto = Math.max(...validos)
  }
  const ticket = (t.match(/ticket\s*#?\s*[:\-]?\s*([A-Z0-9\-]{3,})/i) || [])[1]
    || (t.match(/\bticket\b[^\d]{0,10}(\d{4,})/i) || [])[1]
    || (t.match(/\b(\d{6,})\b/) || [])[1] || null
  const fecha = (t.match(/(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/) || [])[1] || null
  return { texto: t, pesoNeto, pesoBruto, tara, ticket, fecha }
}

// OCR local (Tesseract) sobre un dataURL. Devuelve el objeto parseado o null.
export async function leerTicketLocal(dataURL, onProgreso) {
  if (!dataURL) return null
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', undefined, {
    logger: (m) => { if (m.status === 'recognizing text' && onProgreso) onProgreso(Math.round(m.progress * 100)) },
  })
  try {
    const { data: { text } } = await worker.recognize(dataURL)
    return parsearTicket(text)
  } finally {
    await worker.terminate()
  }
}

// OCR en la NUBE (Google Vision vía /api/ocr-ticket). Devuelve el objeto parseado,
// o null si no hay key configurada / falla (el llamador cae al OCR local).
export async function leerTicketNube(dataURL) {
  if (!dataURL) return null
  try {
    const r = await fetch('/api/ocr-ticket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataURL }),
    })
    if (!r.ok) return null // 503 sin key, 502 error → fallback local
    const data = await r.json()
    if (!data.ok || !data.texto) return null
    return { ...parsearTicket(data.texto), fuente: 'nube' }
  } catch { return null }
}

// Ejecuta el OCR: intenta la NUBE (más precisa); si no hay key o falla, usa el LOCAL.
export async function leerTicket(dataURL, onProgreso) {
  if (!dataURL) return null
  if (onProgreso) onProgreso(5)
  const nube = await leerTicketNube(dataURL)
  if (nube && (nube.pesoNeto != null || nube.pesoBruto != null || nube.ticket)) {
    if (onProgreso) onProgreso(100)
    return nube
  }
  return leerTicketLocal(dataURL, onProgreso)
}
