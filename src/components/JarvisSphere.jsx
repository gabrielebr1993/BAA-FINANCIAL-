// Esfera JARVIS estilo "cerebro neuronal" (canvas): nodos/sinapsis orbitando con
// pulsos de energía y núcleo brillante. Reacciona a `estado`:
//   'idle' | 'listening' | 'speaking' | 'thinking'.
// `alerta` (ámbar) para el mini-orbe del Panel de Control. `size` en px (CSS).
import { useEffect, useRef } from 'react'

export default function JarvisSphere({ estado = 'idle', size = 200, alerta = false }) {
  const canvasRef = useRef(null)
  const estadoRef = useRef(estado)
  const alertaRef = useRef(alerta)
  useEffect(() => { estadoRef.current = estado }, [estado])
  useEffect(() => { alertaRef.current = alerta }, [alerta])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    const S = size
    canvas.width = S * dpr
    canvas.height = S * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const cx = S / 2, cy = S / 2, R = S * 0.34
    const k = R / 210 // factor de escala respecto al diseño original

    const N = 58
    const nodos = Array.from({ length: N }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: R * (0.55 + Math.random() * 0.45),
      sp: 0.0015 + Math.random() * 0.003,
      fase: Math.random() * Math.PI * 2,
    }))
    const conex = []
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (Math.random() < 0.08) conex.push([i, j])

    const M = 90
    const parts = Array.from({ length: M }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: R * (0.9 + Math.random() * 0.3),
      sp: 0.002 + Math.random() * 0.004,
    }))

    const proj = (theta, phi, r) => {
      const x3 = r * Math.sin(phi) * Math.cos(theta)
      const y3 = r * Math.sin(phi) * Math.sin(theta)
      const z3 = r * Math.cos(phi)
      const sc = (z3 + R) / (2 * R)
      return { x: cx + x3, y: cy + y3 * 0.6, sc }
    }

    let raf, t = 0
    const draw = () => {
      t++
      const e = estadoRef.current
      let col = [227, 201, 136], speed = 1, amp = 1, pulso = 0.5
      if (e === 'listening') { col = [74, 222, 128]; speed = 1.3; amp = 1 + Math.sin(t * 0.15) * 0.1; pulso = 0.6 }
      else if (e === 'thinking') { col = [227, 201, 136]; speed = 3; amp = 1.05; pulso = 1 }
      else if (e === 'speaking') { col = [201, 162, 75]; speed = 1.1; amp = 1 + Math.abs(Math.sin(t * 0.25)) * 0.16; pulso = 0.8 }
      else { speed = 0.5; amp = 1 + Math.sin(t * 0.05) * 0.03; pulso = 0.3 }
      if (alertaRef.current) col = [245, 158, 11] // ámbar si hay alerta crítica
      const [r, g, b] = col

      ctx.clearRect(0, 0, S, S)

      const grad = ctx.createRadialGradient(cx, cy, 20 * k, cx, cy, R * amp * 1.1)
      grad.addColorStop(0, `rgba(${r},${g},${b},0.45)`)
      grad.addColorStop(0.5, `rgba(${r},${g},${b},0.18)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(cx, cy, R * amp * 1.1, 0, Math.PI * 2); ctx.fill()

      nodos.forEach((n) => { n.theta += n.sp * speed })

      conex.forEach(([i, j], idx) => {
        const a = proj(nodos[i].theta, nodos[i].phi, nodos[i].r * amp)
        const bb = proj(nodos[j].theta, nodos[j].phi, nodos[j].r * amp)
        const op = 0.08 + ((a.sc + bb.sc) / 2) * 0.25 * pulso
        ctx.strokeStyle = `rgba(${r},${g},${b},${op})`
        ctx.lineWidth = Math.max(0.5, 0.8 * k)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bb.x, bb.y); ctx.stroke()
        if (pulso > 0.5) {
          const prog = ((t * 0.02 * speed) + idx * 0.3) % 1
          const px = a.x + (bb.x - a.x) * prog, py = a.y + (bb.y - a.y) * prog
          ctx.fillStyle = `rgba(248,243,235,${0.6 * pulso})`
          ctx.beginPath(); ctx.arc(px, py, 1.6 * k, 0, Math.PI * 2); ctx.fill()
        }
      })

      parts.forEach((p) => {
        p.theta += p.sp * speed
        const pr = proj(p.theta, p.phi, p.r * amp)
        ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + pr.sc * 0.4})`
        ctx.beginPath(); ctx.arc(pr.x, pr.y, (0.5 + pr.sc * 1.6) * k, 0, Math.PI * 2); ctx.fill()
      })

      nodos.forEach((n) => {
        const pr = proj(n.theta, n.phi, n.r * amp)
        const activa = (Math.sin(t * 0.08 * speed + n.fase) * 0.5 + 0.5) * pulso
        const s = (1.2 + pr.sc * 2.5) * (0.8 + activa * 0.6) * k
        ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + pr.sc * 0.6})`
        ctx.beginPath(); ctx.arc(pr.x, pr.y, s, 0, Math.PI * 2); ctx.fill()
        if (activa > 0.7) {
          ctx.fillStyle = `rgba(248,243,235,${(activa - 0.7) * 0.8})`
          ctx.beginPath(); ctx.arc(pr.x, pr.y, s * 2, 0, Math.PI * 2); ctx.fill()
        }
      })

      ctx.fillStyle = `rgba(248,243,235,${0.85 + pulso * 0.15})`
      ctx.beginPath(); ctx.arc(cx, cy, 20 * k * amp, 0, Math.PI * 2); ctx.fill()
      const ng = ctx.createRadialGradient(cx, cy, 5 * k, cx, cy, 40 * k * amp)
      ng.addColorStop(0, 'rgba(248,243,235,0.6)')
      ng.addColorStop(1, 'rgba(248,243,235,0)')
      ctx.fillStyle = ng
      ctx.beginPath(); ctx.arc(cx, cy, 40 * k * amp, 0, Math.PI * 2); ctx.fill()

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, filter: `drop-shadow(0 0 ${Math.round(size * 0.28)}px rgba(201,162,75,0.45))` }}
    />
  )
}
