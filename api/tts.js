// ---------------------------------------------------------------------------
// Texto→voz con ElevenLabs (modelo multilingüe: la misma voz habla ES e EN).
// La clave vive solo en el servidor. Si no está configurado (falta API key o
// voice id), responde 204 y el frontend cae a la voz del navegador.
// Devuelve audio/mpeg (MP3) en binario.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
// Voz "premade" de ElevenLabs usable en CUALQUIER plan (incluida la capa gratis).
// Sirve de respaldo si la voz elegida es de la BIBLIOTECA y el plan/cuenta no la
// permite por API ("Free users cannot use library voices"). Configurable por env.
const VOZ_FALLBACK = process.env.ELEVENLABS_FALLBACK_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' // Rachel (multilingüe)

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY
    const voiceId = process.env.ELEVENLABS_VOICE_ID

    // Sonda de estado (sin exponer la clave): dice si ElevenLabs está configurado
    // en ESTE deploy. Útil para mostrar en la UI qué voz se usará.
    if (req.method === 'GET' || (req.body && req.body.probe)) {
      return res.status(200).json({ ok: true, configurado: !!(apiKey && voiceId) })
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    // No configurado → 204: el navegador usará SpeechSynthesis.
    if (!apiKey || !voiceId) return res.status(204).end()

    // Autenticación (sin exponer la voz a cualquiera). Cualquier usuario válido
    // no-driver puede pedir TTS; el contenido lo genera el propio asistente.
    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch { return res.status(204).end() }
    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })
    if (auth.caller && auth.caller.role === 'driver') return res.status(403).json({ ok: false, error: 'No autorizado.' })

    const texto = String((req.body && req.body.texto) || '').slice(0, 2000)
    if (!texto.trim()) return res.status(400).json({ ok: false, error: 'Falta texto.' })

    // Ajusta la EXPRESIÓN de la voz según el ánimo (sin exagerar):
    //   positivo → más expresivo/animado · alerta → más contenido/serio · neutro → equilibrado.
    const mood = String((req.body && req.body.mood) || 'neutro')
    const AJUSTE = {
      positivo: { stability: 0.32, similarity_boost: 0.78, style: 0.45 },
      alerta: { stability: 0.6, similarity_boost: 0.72, style: 0.08 },
      neutro: { stability: 0.45, similarity_boost: 0.75, style: 0.2 },
    }
    const vs = { ...(AJUSTE[mood] || AJUSTE.neutro), use_speaker_boost: true }

    const sintetizar = (vId) => fetch(`${ELEVEN_URL}/${vId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2', voice_settings: vs }),
    })

    let r = await sintetizar(voiceId)
    let alterna = false
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      // Si la voz elegida es de biblioteca / el plan no la permite → reintenta con
      // una voz premade (válida en cualquier plan) para no caer en la voz robótica.
      const esProblemaPlan = r.status === 401 || r.status === 403 || /library|free users|subscription|can ?not use|no puede/i.test(t)
      if (esProblemaPlan && VOZ_FALLBACK && VOZ_FALLBACK !== voiceId) {
        const r2 = await sintetizar(VOZ_FALLBACK)
        if (r2.ok) { r = r2; alterna = true }
        else { const t2 = await r2.text().catch(() => ''); return res.status(502).json({ ok: false, error: 'ElevenLabs ' + r2.status + ': ' + t2.slice(0, 200) }) }
      } else {
        return res.status(502).json({ ok: false, error: 'ElevenLabs ' + r.status + ': ' + t.slice(0, 200) })
      }
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Voice-Fallback', alterna ? '1' : '0') // 1 = se usó la voz alterna
    return res.status(200).send(buf)
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'TTS error: ' + (e?.message || 'desconocido') })
  }
}
