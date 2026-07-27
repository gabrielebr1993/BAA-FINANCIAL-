// Alertas LOCALES (sin backend): sonido + notificación del navegador mientras la app
// está abierta. El push a apps CERRADAS requiere FCM + backend (ver notificaciones.js).
let ctx

export function beep(veces = 2) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < veces; i++) {
      const t = ctx.currentTime + i * 0.35
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
      o.start(t); o.stop(t + 0.32)
    }
  } catch { /* noop */ }
}

export async function pedirPermisoNotif() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission() } catch { /* noop */ }
}

export function notificar(titulo, cuerpo) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, { body: cuerpo, tag: 'bulk' }) } catch { /* noop */ }
}
