// Esfera-cerebro neuronal (canvas TRANSPARENTE, fondo claro). Reacciona a `estado`
// (idle/listening/thinking/speaking), `animo` (positivo/neutro/alerta) y `alerta`.
// RESPONSIVA: mide su contenedor y ajusta la resolución al tamaño real mostrado
// (nítida y ligera en iPhone/iPad; se re-mide al rotar). `size` = lado máx en px.
import { useEffect, useRef } from 'react'

// Dibuja la animación en el canvas a un lado S (px CSS). Devuelve un "stop".
function animar(canvas, S, estadoRef, alertaRef, animoRef) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  canvas.width = Math.round(S * dpr)
  canvas.height = Math.round(S * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const cx = S / 2, cy = S / 2, R = S * 0.355
  const k = R / 270
  const esCorto = S < 90
  const liviano = S < 380 // móviles: menos nodos/partículas para ir fluido

  const N = esCorto ? 16 : liviano ? 60 : 96
  const nodos = Array.from({ length: N }, () => {
    const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1)
    return { th, ph, r: R * (0.55 + Math.random() * 0.45), sp: 0.0015 + Math.random() * 0.0025, f: Math.random() * 6, jx: 0, jy: 0, pulso: 0, phSp: (Math.random() - 0.5) * 0.004 }
  })
  const cnx = []
  if (!esCorto) for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (Math.random() < 0.05) cnx.push([i, j, Math.random()])
  const parts = esCorto ? [] : Array.from({ length: liviano ? 90 : 170 }, () => {
    const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1)
    return { th, ph, r: R * (0.9 + Math.random() * 0.3), sp: 0.002 + Math.random() * 0.003 }
  })

  const pr = (th, ph, r, jx = 0, jy = 0) => {
    const x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph)
    return { x: cx + x + jx, y: cy + y * 0.6 + jy, sc: (z + R) / (2 * R) }
  }

  let raf, t = 0
  const draw = () => {
    t++
    const e = estadoRef.current
    let node = [201, 162, 75], line = [19, 35, 63], core = [201, 162, 75], sp = 1, amp = 1, pu = 0.4, think = 0
    if (e === 'listening') { node = [22, 163, 74]; line = [22, 130, 74]; core = [22, 163, 74]; sp = 1.3; amp = 1 + Math.sin(t * 0.15) * 0.08; pu = 0.6 }
    else if (e === 'thinking') { sp = 3.2; pu = 1; amp = 1.04; think = 1 }
    else if (e === 'speaking') { sp = 1.1; amp = 1 + Math.abs(Math.sin(t * 0.25)) * 0.14; pu = 0.8 }
    else { sp = 0.55; amp = 1 + Math.sin(t * 0.05) * 0.025 }
    const mood = animoRef.current
    if ((e === 'speaking' || e === 'idle') && !alertaRef.current) {
      if (mood === 'positivo') { node = [214, 178, 92]; core = [222, 188, 104]; pu *= 1.18; sp *= 1.12 }
      else if (mood === 'alerta') { node = [198, 120, 52]; core = [198, 120, 52]; sp *= 0.8; pu *= 0.85 }
    }
    if (alertaRef.current) { node = [217, 119, 6]; core = [217, 119, 6] }

    ctx.clearRect(0, 0, S, S)
    const [cr, cg, cb] = core
    const gr = ctx.createRadialGradient(cx, cy, 20 * k, cx, cy, R * 1.05)
    gr.addColorStop(0, `rgba(${cr},${cg},${cb},0.08)`); gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 6.28); ctx.fill()

    nodos.forEach((n) => {
      n.th += n.sp * sp
      if (think) {
        n.jx = Math.sin(t * 0.3 + n.f) * 6 * k + (Math.random() - 0.5) * 4 * k
        n.jy = Math.cos(t * 0.35 + n.f) * 6 * k + (Math.random() - 0.5) * 4 * k
        n.ph += n.phSp * 3
        if (n.ph < 0.2 || n.ph > 3) n.phSp *= -1
        if (Math.random() < 0.03) n.pulso = 1
      } else { n.jx *= 0.9; n.jy *= 0.9 }
      if (n.pulso > 0) n.pulso *= 0.9
    })

    const [lr, lg, lb] = line
    cnx.forEach((c) => {
      const [i, j] = c
      const a = pr(nodos[i].th, nodos[i].ph, nodos[i].r * amp, nodos[i].jx, nodos[i].jy)
      const b = pr(nodos[j].th, nodos[j].ph, nodos[j].r * amp, nodos[j].jx, nodos[j].jy)
      let op = 0.05 + ((a.sc + b.sc) / 2) * 0.18
      if (think) op *= 0.5 + Math.abs(Math.sin(t * 0.1 + c[2] * 6)) * 0.9
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${op})`; ctx.lineWidth = Math.max(0.5, 0.7 * k)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      if (pu > 0.5) {
        const p = ((t * 0.03 * sp) + c[2]) % 1, px = a.x + (b.x - a.x) * p, py = a.y + (b.y - a.y) * p
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.7 * pu})`
        ctx.beginPath(); ctx.arc(px, py, (think ? 2.2 : 1.6) * k, 0, 6.28); ctx.fill()
      }
    })

    const [nr, ng, nb] = node
    parts.forEach((p) => {
      p.th += p.sp * sp
      const q = pr(p.th, p.ph, p.r * amp)
      ctx.fillStyle = `rgba(${nr},${ng},${nb},${0.1 + q.sc * 0.35})`
      ctx.beginPath(); ctx.arc(q.x, q.y, (0.5 + q.sc * 1.4) * k, 0, 6.28); ctx.fill()
    })
    nodos.forEach((n) => {
      const q = pr(n.th, n.ph, n.r * amp, n.jx, n.jy)
      const ac = (Math.sin(t * 0.06 * sp + n.f) * 0.5 + 0.5) * pu
      const s = (1.3 + q.sc * 2.4) * (0.85 + ac * 0.5) * (1 + n.pulso * 0.8) * k
      ctx.fillStyle = `rgba(${nr},${ng},${nb},${0.4 + q.sc * 0.5})`
      ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, 6.28); ctx.fill()
      if (n.pulso > 0.3) { ctx.fillStyle = `rgba(255,255,255,${n.pulso * 0.7})`; ctx.beginPath(); ctx.arc(q.x, q.y, s * 1.8, 0, 6.28); ctx.fill() }
    })

    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.95)`; ctx.beginPath(); ctx.arc(cx, cy, 17 * k * amp, 0, 6.28); ctx.fill()
    const c2 = ctx.createRadialGradient(cx, cy, 5 * k, cx, cy, 36 * k * amp)
    c2.addColorStop(0, `rgba(${cr},${cg},${cb},0.35)`); c2.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, 36 * k * amp, 0, 6.28); ctx.fill()

    raf = requestAnimationFrame(draw)
  }
  draw()
  return () => cancelAnimationFrame(raf)
}

export default function JarvisSphere({ estado = 'idle', size = 300, alerta = false, animo = 'neutro' }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const estadoRef = useRef(estado)
  const alertaRef = useRef(alerta)
  const animoRef = useRef(animo)
  useEffect(() => { estadoRef.current = estado }, [estado])
  useEffect(() => { alertaRef.current = alerta }, [alerta])
  useEffect(() => { animoRef.current = animo }, [animo])

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    let stop = null, ladoActual = 0
    const construir = () => {
      const S = Math.max(40, Math.round(wrap.clientWidth) || size)
      if (S === ladoActual) return
      ladoActual = S
      if (stop) stop()
      stop = animar(canvas, S, estadoRef, alertaRef, animoRef)
    }
    construir()
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(construir); ro.observe(wrap) }
    else if (typeof window !== 'undefined') window.addEventListener('resize', construir)
    return () => { if (ro) ro.disconnect(); else if (typeof window !== 'undefined') window.removeEventListener('resize', construir); if (stop) stop() }
  }, [size])

  const esMini = size < 90
  const lado = esMini ? `${size}px` : `min(${size}px, 92vw, 82vh)`
  return (
    <div ref={wrapRef} style={{ width: lado, height: lado }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
