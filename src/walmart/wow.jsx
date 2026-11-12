// ============================================================================
// WALMART · efectos visuales "wow" (aislados del resto). Sin dependencias
// externas: toasts, confeti en canvas, dona de progreso, punto pulsante.
// ============================================================================
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// CSS puntual (keyframes) inyectado una sola vez.
if (typeof document !== 'undefined' && !document.getElementById('wal-wow-css')) {
  const s = document.createElement('style')
  s.id = 'wal-wow-css'
  s.textContent = '@keyframes walToastIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}'
  document.head.appendChild(s)
}

const prefiereReducir = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// ── Toasts ───────────────────────────────────────────────────────────────────
const subs = new Set()
export function walToast(msg, tipo = 'ok') { subs.forEach((fn) => fn({ id: Math.random().toString(36).slice(2), msg, tipo })) }
const TOAST_COLOR = { ok: '#2E9E6B', info: '#2B4C8C', error: '#E0533D', gold: '#c9a24b' }
const TOAST_ICON = { ok: '✓', info: 'ⓘ', error: '⚠', gold: '★' }

export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const fn = (t) => { setItems((x) => [...x, t]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 2400) }
    subs.add(fn); return () => { subs.delete(fn) }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {items.map((t) => {
        const c = TOAST_COLOR[t.tipo] || TOAST_COLOR.ok
        return (
          <div key={t.id} style={{ animation: 'walToastIn .22s ease', background: '#fff', color: '#13233f', border: '1px solid #e6e4da', borderLeft: `4px solid ${c}`, borderRadius: 11, padding: '9px 14px', boxShadow: '0 8px 26px rgba(19,35,63,.14)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9, minWidth: 180 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', background: c, color: '#fff', fontSize: 11 }}>{TOAST_ICON[t.tipo] || '✓'}</span>
            {t.msg}
          </div>
        )
      })}
    </div>, document.body)
}

// ── Confeti (canvas, sin librerías) ──────────────────────────────────────────
let confetiActivo = false
export function confeti() {
  if (typeof document === 'undefined' || prefiereReducir() || confetiActivo) return
  confetiActivo = true
  const cv = document.createElement('canvas')
  const W = window.innerWidth, H = window.innerHeight
  cv.width = W; cv.height = H
  cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998'
  document.body.appendChild(cv)
  const ctx = cv.getContext('2d')
  const cols = ['#c9a24b', '#13233f', '#2E9E6B', '#2B4C8C', '#ffffff', '#f0c660']
  const ps = Array.from({ length: 150 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 220, y: H * 0.32,
    vx: (Math.random() - 0.5) * 11, vy: Math.random() * -13 - 4, g: 0.32 + Math.random() * 0.2,
    s: 5 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.45,
    c: cols[(Math.random() * cols.length) | 0],
  }))
  const t0 = performance.now()
  const frame = (t) => {
    const el = t - t0
    ctx.clearRect(0, 0, W, H)
    ps.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, 1 - el / 2300); ctx.fillStyle = p.c
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62); ctx.restore()
    })
    if (el < 2300) requestAnimationFrame(frame)
    else { cv.remove(); confetiActivo = false }
  }
  requestAnimationFrame(frame)
}

// ── Dona de progreso ─────────────────────────────────────────────────────────
export function Dona({ pct = 0, size = 58, stroke = 8, color = '#2E9E6B', track = '#e8e6dc', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(1, pct)))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }} />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: Math.round(size * 0.26), color }}>{children}</div>
    </div>
  )
}

// ── Punto pulsante (estado "vivo") ───────────────────────────────────────────
export function PulseDot({ color = '#2E9E6B', size = 8 }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  )
}

// ── Saludo según la hora ─────────────────────────────────────────────────────
export function saludo() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }
export function fechaLarga(d = new Date()) {
  try { return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) } catch { return d.toISOString().slice(0, 10) }
}
