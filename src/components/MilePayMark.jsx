// Ícono de MilePay: una RUTA dorada (con línea central de carretera) que sale de
// un punto de inicio y llega a un PIN de destino, sobre el cuadro navy de la marca.
// Reemplaza al cuadro con la letra «M». Mismo dibujo que public/logo.svg y los
// íconos de la app (favicon, PWA, iOS).
import { useId } from 'react'

export default function MilePayMark({ size = 36, className = '', title = 'MilePay' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`mpg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c3a63" />
          <stop offset="1" stopColor="#0d1930" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#mpg${id})`} />
      <path d="M14 50 C12 38, 26 39, 29 32 S 32 22, 42 24" fill="none" stroke="#c9a24b" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M14 50 C12 38, 26 39, 29 32 S 32 22, 42 24" fill="none" stroke="#13233f" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3.6" />
      <circle cx="14" cy="50" r="6" fill="#ffffff" />
      <circle cx="14" cy="50" r="2.6" fill="#c9a24b" />
      <path d="M46 6 a10 10 0 0 1 10 10 c0 7.4 -10 17 -10 17 s-10 -9.6 -10 -17 a10 10 0 0 1 10 -10z" fill="#ffffff" />
      <circle cx="46" cy="16" r="3.8" fill="#13233f" />
    </svg>
  )
}
