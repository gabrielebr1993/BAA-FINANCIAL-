// Cliente del asistente JARVIS: llama a los endpoints serverless (la clave de
// Anthropic/ElevenLabs vive en el servidor) y gestiona la voz (TTS con fallback
// al navegador, y reconocimiento de voz del navegador).
import { auth } from '../firebase'

async function token() {
  const t = await auth.currentUser?.getIdToken()
  if (!t) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  return t
}

// Pregunta al cerebro. messages = [{ role:'user'|'assistant', content }].
export async function preguntarAsistente({ companyId, messages }) {
  const resp = await fetch('/api/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ companyId, messages }),
  })
  const data = await resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
  return data
}

// Aplica un cambio YA confirmado por el usuario (whitelist en backend).
export async function ejecutarAccionAsistente(body) {
  const resp = await fetch('/api/asistente-accion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(body),
  })
  return resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
}

// --- Voz que HABLA -----------------------------------------------------------
let audioActual = null
export function detenerVoz() {
  try { if (audioActual) { audioActual.pause(); audioActual = null } } catch { /* noop */ }
  try { window.speechSynthesis?.cancel() } catch { /* noop */ }
}

// Intenta ElevenLabs; si no está configurado (204) o falla, usa el navegador.
// `onFin` se llama cuando termina de hablar. Devuelve una función para cortar.
export async function hablar(texto, { idioma = 'es', onInicio, onFin } = {}) {
  detenerVoz()
  if (!texto?.trim()) { onFin?.(); return detenerVoz }
  try {
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ texto }),
    })
    if (resp.status === 204) return hablarNavegador(texto, idioma, { onInicio, onFin })
    if (!resp.ok) return hablarNavegador(texto, idioma, { onInicio, onFin })
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioActual = audio
    audio.onplay = () => onInicio?.()
    audio.onended = () => { URL.revokeObjectURL(url); if (audioActual === audio) audioActual = null; onFin?.() }
    audio.onerror = () => { URL.revokeObjectURL(url); hablarNavegador(texto, idioma, { onInicio, onFin }) }
    await audio.play()
  } catch {
    return hablarNavegador(texto, idioma, { onInicio, onFin })
  }
  return detenerVoz
}

function hablarNavegador(texto, idioma, { onInicio, onFin } = {}) {
  try {
    const synth = window.speechSynthesis
    if (!synth) { onFin?.(); return detenerVoz }
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = idioma?.startsWith('en') ? 'en-US' : 'es-ES'
    u.rate = 1.02; u.pitch = 1
    u.onstart = () => onInicio?.()
    u.onend = () => onFin?.()
    synth.speak(u)
  } catch { onFin?.() }
  return detenerVoz
}

// --- Voz que ESCUCHA (reconocimiento del navegador) --------------------------
export function reconocimientoDisponible() {
  return typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Crea un reconocedor. onTexto(final, esFinal). Devuelve { iniciar, detener }.
export function crearReconocedor({ idioma = 'es-ES', onTexto, onFin, onError } = {}) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Rec) return null
  const rec = new Rec()
  rec.lang = idioma
  rec.interimResults = true
  rec.continuous = false
  rec.onresult = (e) => {
    let txt = ''
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript
    const final = e.results[e.results.length - 1].isFinal
    onTexto?.(txt, final)
  }
  rec.onerror = (e) => onError?.(e.error)
  rec.onend = () => onFin?.()
  return { iniciar: () => { try { rec.start() } catch { /* ya activo */ } }, detener: () => { try { rec.stop() } catch { /* noop */ } } }
}

// Detecta idioma muy simple para elegir voz/mic (es por defecto).
export function detectarIdioma(texto = '') {
  const t = texto.toLowerCase()
  const enHints = [' the ', ' what ', ' show ', ' driver ', ' route ', ' payment ', ' how ', ' which ', ' compare ']
  const esHints = [' el ', ' la ', ' qué ', ' muestra ', ' chofer ', ' ruta ', ' pago ', ' cómo ', ' cuál ', ' compara ']
  const en = enHints.filter((h) => (' ' + t + ' ').includes(h)).length
  const es = esHints.filter((h) => (' ' + t + ' ').includes(h)).length
  return en > es ? 'en' : 'es'
}
