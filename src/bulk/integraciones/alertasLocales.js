// Alertas LOCALES (sin backend): sonido + notificación del navegador mientras la app
// está abierta. El push a apps CERRADAS requiere FCM + backend (ver notificaciones.js).
let ctx

// Devuelve el AudioContext y lo REANUDA si el navegador lo suspendió (política de
// autoplay en iOS/Chrome): sin esto el primer sonido "tardaba" o no salía.
function ac() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') { try { ctx.resume() } catch { /* noop */ } }
  return ctx
}

// DESBLOQUEA el audio. Los navegadores (sobre todo iOS/Safari) NO dejan sonar nada
// hasta que el usuario TOCA la pantalla. Hay que llamar esto DENTRO de un gesto
// (tap/click): reanuda el contexto y suena un tono casi inaudible para "abrirlo".
// Después ya suenan las alertas de órdenes aunque lleguen sin tocar nada.
export function desbloquearAudio() {
  try {
    const c = ac()
    if (c.state === 'suspended') c.resume()
    const o = c.createOscillator(); const g = c.createGain()
    g.gain.value = 0.0001
    o.connect(g); g.connect(c.destination)
    o.start(); o.stop(c.currentTime + 0.02)
  } catch { /* noop */ }
}

// Engancha UN desbloqueo global al primer toque/click/tecla del usuario. Idempotente.
let audioEnganchado = false
export function engancharDesbloqueoAudio() {
  if (audioEnganchado || typeof window === 'undefined') return
  audioEnganchado = true
  const fn = () => { desbloquearAudio() }
  const opts = { once: true, passive: true }
  window.addEventListener('pointerdown', fn, opts)
  window.addEventListener('touchstart', fn, opts)
  window.addEventListener('keydown', fn, opts)
}

// Un pitido corto (avisos de mensajes). Onda cuadrada = más audible.
export function beep(veces = 2) {
  try {
    const c = ac()
    for (let i = 0; i < veces; i++) {
      const t = c.currentTime + i * 0.28
      const o = c.createOscillator(); const g = c.createGain()
      o.connect(g); g.connect(c.destination); o.type = 'square'; o.frequency.value = 950
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      o.start(t); o.stop(t + 0.24)
    }
  } catch { /* noop */ }
}

// Tono CORTO y DISCRETO para un mensaje nuevo (estilo SaaS): dos notas suaves
// ascendentes tipo "pop". `volumen` 0..1 escala el nivel (0 = silencio). Respeta el
// desbloqueo de audio del navegador (usa el mismo AudioContext reanudado).
export function tonoMensaje(volumen = 0.5) {
  const vol = Math.max(0, Math.min(1, Number(volumen)))
  if (!vol) return
  try {
    const c = ac()
    const t0 = c.currentTime
    ;[[660, 0.0], [880, 0.09]].forEach(([f, off]) => {
      const t = t0 + off
      const o = c.createOscillator(); const g = c.createGain()
      o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
      o.start(t); o.stop(t + 0.16)
    })
  } catch { /* noop */ }
}

// Un "ding" brillante tipo campana (dos osciladores afinados) en un instante dado.
function campana(c, t, f, vol = 0.55, dur = 0.5) {
  ;[f, f * 2.01].forEach((freq, k) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.connect(g); g.connect(c.destination); o.type = k === 0 ? 'triangle' : 'sine'; o.frequency.value = freq
    const v = k === 0 ? vol : vol * 0.4
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.start(t); o.stop(t + dur + 0.02)
  })
}

// Sirena que SUBE de tono (glissando) para máxima atención, en un instante dado.
function sirena(c, t, f0, f1, dur = 0.5, vol = 0.5) {
  const o = c.createOscillator(); const g = c.createGain()
  o.connect(g); g.connect(c.destination); o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.linearRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.setValueAtTime(vol, t + dur - 0.06)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.start(t); o.stop(t + dur + 0.02)
}

// Alerta URGENTE y LLAMATIVA para una orden entrante (~1.4 s): arpegio de campana
// ascendente + doble barrido de sirena, con volumen alto y vibración fuerte. Es un
// sonido distintivo (estilo "cha-ching" + alarma) difícil de ignorar.
export function tonoOrden() {
  try {
    const c = ac()
    const t0 = c.currentTime
    // Arpegio brillante ascendente (do-mi-sol-do) — el "gancho" que llama la atención.
    campana(c, t0 + 0.00, 784, 0.5, 0.35)   // G5
    campana(c, t0 + 0.12, 988, 0.5, 0.35)   // B5
    campana(c, t0 + 0.24, 1175, 0.55, 0.4)  // D6
    campana(c, t0 + 0.38, 1568, 0.6, 0.6)   // G6 (remate más largo)
    // Dos barridos de sirena que suben — refuerzan la urgencia.
    sirena(c, t0 + 0.62, 700, 1500, 0.42, 0.42)
    sirena(c, t0 + 1.06, 700, 1500, 0.42, 0.42)
    // Vibración fuerte tipo alarma en móviles compatibles.
    try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 400]) } catch { /* noop */ }
  } catch { /* noop */ }
}

export async function pedirPermisoNotif() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission() } catch { /* noop */ }
}

export function notificar(titulo, cuerpo) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, { body: cuerpo, tag: 'bulk' }) } catch { /* noop */ }
}
