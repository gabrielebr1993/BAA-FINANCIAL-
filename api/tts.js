// ---------------------------------------------------------------------------
// Texto→voz con ElevenLabs (modelo multilingüe: la misma voz habla ES e EN).
// La clave vive solo en el servidor. Si no está configurado (falta API key o
// voice id), responde 204 y el frontend cae a la voz del navegador.
// Devuelve audio/mpeg (MP3) en binario.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    const apiKey = process.env.ELEVENLABS_API_KEY
    const voiceId = process.env.ELEVENLABS_VOICE_ID
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

    const r = await fetch(`${ELEVEN_URL}/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return res.status(502).json({ ok: false, error: 'ElevenLabs ' + r.status + ': ' + t.slice(0, 200) })
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(buf)
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'TTS error: ' + (e?.message || 'desconocido') })
  }
}
