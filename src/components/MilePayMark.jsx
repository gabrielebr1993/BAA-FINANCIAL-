// Ícono de MilePay: una RUTA dorada (con línea central de carretera) que sale de
// un punto de inicio y llega a un PIN de destino, sobre el cuadro navy de la marca.
// Acabado LIQUID GLASS (iOS 26/27): capas con sombra propia, reflejo especular
// arriba y filo de luz en el borde. Mismo dibujo que public/logo.svg y los
// íconos de la app (favicon, PWA, iOS).
import { useId } from 'react'

export default function MilePayMark({ size = 36, className = '', title = 'MilePay' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs><linearGradient id={`mpg${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22487a"/><stop offset=".55" stopColor="#13233f"/><stop offset="1" stopColor="#0b1628"/></linearGradient>
    <linearGradient id={`mps${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28"/><stop offset=".45" stopColor="#fff" stopOpacity="0"/></linearGradient>
    <linearGradient id={`mpr${id}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#b8892f"/><stop offset=".5" stopColor="#e2c171"/><stop offset="1" stopColor="#c9a24b"/></linearGradient>
    <linearGradient id={`mpp${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#dfe7f2"/></linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill={`url(#mpg${id})`}/>
  <path d="M14 50 C12 38, 26 39, 29 32 S 32 22, 42 24" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="8" strokeLinecap="round" transform="translate(0 1.5)"/>
  <path d="M14 50 C12 38, 26 39, 29 32 S 32 22, 42 24" fill="none" stroke={`url(#mpr${id})`} strokeWidth="7.5" strokeLinecap="round"/>
  <path d="M14 50 C12 38, 26 39, 29 32 S 32 22, 42 24" fill="none" stroke="#13233f" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3.6"/>
  <circle cx="14" cy="50" r="6" fill={`url(#mpp${id})`}/><circle cx="14" cy="50" r="2.6" fill="#c9a24b"/>
  <path d="M46 7.5 a10 10 0 0 1 10 10 c0 7.4 -10 17 -10 17 s-10 -9.6 -10 -17 a10 10 0 0 1 10 -10z" fill="#000" fillOpacity=".25"/>
  <path d="M46 6 a10 10 0 0 1 10 10 c0 7.4 -10 17 -10 17 s-10 -9.6 -10 -17 a10 10 0 0 1 10 -10z" fill={`url(#mpp${id})`}/>
  <circle cx="46" cy="16" r="3.8" fill="#13233f"/>
  <rect width="64" height="64" rx="16" fill={`url(#mps${id})`}/>
  <rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5"/>
    </svg>
  )
}
