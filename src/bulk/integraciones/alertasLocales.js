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

// Sirena URGENTE y FUERTE para una orden entrante (~1.4 s): alterna dos tonos altos
// con onda cuadrada (penetrante) y volumen alto — difícil de ignorar. Suena de una.
export function tonoOrden() {
  try {
    const c = ac()
    const notas = [1046, 1318, 1046, 1318, 1046, 1318, 1046]
    notas.forEach((f, i) => {
      const t = c.currentTime + i * 0.2
      const o = c.createOscillator(); const g = c.createGain()
      o.connect(g); g.connect(c.destination); o.type = 'square'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
      o.start(t); o.stop(t + 0.18)
    })
    // Pequeña vibración en móviles compatibles (refuerza el aviso).
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]) } catch { /* noop */ }
  } catch { /* noop */ }
}

export async function pedirPermisoNotif() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission() } catch { /* noop */ }
}

export function notificar(titulo, cuerpo) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, { body: cuerpo, tag: 'bulk' }) } catch { /* noop */ }
}
