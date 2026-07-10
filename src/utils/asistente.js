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

// ¿Está ElevenLabs configurado en el deploy actual? (para mostrar en la UI).
export async function estadoVozIA() {
  try {
    const resp = await fetch('/api/tts', { method: 'GET' })
    if (!resp.ok) return { configurado: false }
    const d = await resp.json().catch(() => ({}))
    return { configurado: !!d.configurado }
  } catch { return { configurado: false } }
}

// --- Voz que HABLA -----------------------------------------------------------
// Se reutiliza UN solo elemento <audio> desbloqueado por un gesto del usuario:
// así los navegadores permiten reproducir las respuestas siguientes (modo
// continuo) sin bloquear por "autoplay".
let audioEl = null
const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
function getAudioEl() {
  if (!audioEl) { audioEl = typeof Audio !== 'undefined' ? new Audio() : null; if (audioEl) audioEl.preload = 'auto' }
  return audioEl
}
// Llamar DENTRO de un gesto del usuario (clic/tap) para habilitar el audio.
export function desbloquearAudio() {
  try {
    const el = getAudioEl(); if (!el) return
    el.muted = true; el.src = SILENCIO
    const p = el.play()
    if (p && p.then) p.then(() => { try { el.pause(); el.currentTime = 0 } catch { /* noop */ } el.muted = false }).catch(() => { el.muted = false })
    else el.muted = false
  } catch { /* noop */ }
}
export function detenerVoz() {
  try { if (audioEl) { audioEl.pause() } } catch { /* noop */ }
  try { window.speechSynthesis?.cancel() } catch { /* noop */ }
}

// Intenta ElevenLabs; si no está configurado (204) o falla, usa el navegador.
// `onFuente('elevenlabs'|'navegador')` avisa qué voz se usó. `onError(msg)` reporta
// el error real de ElevenLabs (para no fallar en silencio). Devuelve función de corte.
export async function hablar(texto, { idioma = 'es', onInicio, onFin, onFuente, onError } = {}) {
  detenerVoz()
  if (!texto?.trim()) { onFin?.(); return detenerVoz }
  try {
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ texto }),
    })
    if (resp.status === 204) return hablarNavegador(texto, idioma, { onInicio, onFin, onFuente })
    if (!resp.ok) {
      const d = await resp.json().catch(() => null)
      if (d?.error) onError?.(d.error)
      return hablarNavegador(texto, idioma, { onInicio, onFin, onFuente })
    }
    const alterna = resp.headers.get('X-Voice-Fallback') === '1'
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const audio = getAudioEl()
    if (!audio) return hablarNavegador(texto, idioma, { onInicio, onFin, onFuente })
    audio.muted = false
    audio.src = url
    audio.onplay = () => { onFuente?.(alterna ? 'elevenlabs-alt' : 'elevenlabs'); onInicio?.() }
    audio.onended = () => { URL.revokeObjectURL(url); onFin?.() }
    audio.onerror = () => { URL.revokeObjectURL(url); hablarNavegador(texto, idioma, { onInicio, onFin, onFuente }) }
    try {
      await audio.play()
    } catch {
      // Autoplay bloqueado por el navegador (fuera de un gesto): caer al navegador.
      URL.revokeObjectURL(url); return hablarNavegador(texto, idioma, { onInicio, onFin, onFuente })
    }
  } catch {
    return hablarNavegador(texto, idioma, { onInicio, onFin, onFuente })
  }
  return detenerVoz
}

// Elige la mejor voz del navegador para el idioma (evita la más robótica).
function mejorVoz(idioma) {
  try {
    const voces = window.speechSynthesis?.getVoices?.() || []
    if (!voces.length) return null
    const pref = idioma?.startsWith('en') ? 'en' : 'es'
    const delIdioma = voces.filter((v) => (v.lang || '').toLowerCase().startsWith(pref))
    const candidatas = delIdioma.length ? delIdioma : voces
    // Prioriza voces "naturales" (Google/Microsoft/Natural/Premium) sobre las básicas.
    const bonus = (v) => /google|natural|premium|microsoft|neural|enhanced/i.test(v.name || '') ? 1 : 0
    return candidatas.slice().sort((a, b) => bonus(b) - bonus(a))[0] || null
  } catch { return null }
}

function hablarNavegador(texto, idioma, { onInicio, onFin, onFuente } = {}) {
  try {
    const synth = window.speechSynthesis
    if (!synth) { onFin?.(); return detenerVoz }
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = idioma?.startsWith('en') ? 'en-US' : 'es-ES'
    const v = mejorVoz(idioma)
    if (v) u.voice = v
    u.rate = 1.0; u.pitch = 1.05
    u.onstart = () => { onFuente?.('navegador'); onInicio?.() }
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
