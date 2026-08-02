// ============================================================================
// BULK · OCR de tickets de báscula EN EL NAVEGADOR (Tesseract.js, sin backend).
// Lee la foto del ticket y extrae peso neto/bruto/tara, número, fecha. El chofer
// SIEMPRE confirma el resultado (la precisión depende de la foto). Import dinámico
// para no cargar Tesseract hasta que se use.
// Para OCR de mayor precisión (documentos borrosos, manuscritos) se puede sustituir
// por un servicio en la nube (Google Vision / Textract) desde el backend: mismo
// contrato de salida.
// ============================================================================

const num = (t, re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, '')) : null }

export function parsearTicket(texto) {
  const t = (texto || '').replace(/\r/g, '')
  const pesoNeto = num(t, /net\s*(?:weight|wt|:)?\s*[:\-]?\s*([\d.,]{2,})/i)
  const pesoBruto = num(t, /gross\s*(?:weight|wt|:)?\s*[:\-]?\s*([\d.,]{2,})/i)
  const tara = num(t, /tare\s*[:\-]?\s*([\d.,]{2,})/i)
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
