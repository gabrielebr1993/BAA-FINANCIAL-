// ---------------------------------------------------------------------------
// Función serverless de Vercel: OCR de tickets de báscula con Google Cloud Vision
// (DOCUMENT_TEXT_DETECTION) — mucho más preciso que el OCR del navegador para
// documentos borrosos/manuscritos. La KEY vive en el servidor (nunca en el cliente).
//
// Requiere GOOGLE_VISION_API_KEY en Vercel. Si no está, responde 503 y el cliente
// cae al OCR local (Tesseract). Devuelve { ok, texto } — el cliente lo parsea con
// el MISMO parseador (parsearTicket) que usa para el OCR local.
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    const key = process.env.GOOGLE_VISION_API_KEY
    if (!key) return res.status(503).json({ ok: false, error: 'SIN_KEY' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    let img = body.imageBase64 || ''
    if (!img) return res.status(400).json({ ok: false, error: 'Falta imageBase64.' })
    // Acepta dataURL (data:image/...;base64,XXXX) o base64 puro.
    const coma = img.indexOf('base64,')
    if (coma !== -1) img = img.slice(coma + 7)

    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: img },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['en', 'es'] },
        }],
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ ok: false, error: (data && data.error && data.error.message) || 'Error de Vision' })
    const texto = (data.responses && data.responses[0] && data.responses[0].fullTextAnnotation && data.responses[0].fullTextAnnotation.text) || ''
    return res.status(200).json({ ok: true, texto })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'No se pudo procesar el OCR: ' + (e?.message || 'desconocido') })
  }
}
