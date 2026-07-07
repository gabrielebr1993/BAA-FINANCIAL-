// Ilustración SVG inline moderna de paquetes / logística (navy + dorado).
// Sin dependencias externas ni imágenes hospedadas.
import { COLORS } from '../constants'

export default function Ilustracion({ height = 260, style }) {
  const navy = COLORS.navy
  const gold = COLORS.gold
  return (
    <svg viewBox="0 0 420 320" height={height} width="100%" role="img" aria-label="Paquetes de reparto" style={{ maxWidth: 420, ...style }}>
      {/* piso / sombra */}
      <ellipse cx="210" cy="286" rx="150" ry="16" fill={navy} opacity="0.08" />

      {/* caja grande central */}
      <g style={{ animation: 'gofofloat 5s ease-in-out infinite' }}>
        <path d="M130 150 L210 120 L290 150 L210 182 Z" fill={gold} />
        <path d="M130 150 L210 182 L210 262 L130 230 Z" fill={navy} />
        <path d="M290 150 L210 182 L210 262 L290 230 Z" fill="#1c3a63" />
        {/* cinta */}
        <path d="M210 120 L210 182" stroke="#fff" strokeWidth="4" opacity="0.5" />
        <path d="M210 182 L210 262" stroke="#fff" strokeWidth="3" opacity="0.25" />
      </g>

      {/* caja pequeña izquierda */}
      <g style={{ animation: 'gofofloat 6s ease-in-out infinite', animationDelay: '.4s' }}>
        <path d="M70 196 L112 180 L154 196 L112 212 Z" fill={gold} opacity="0.9" />
        <path d="M70 196 L112 212 L112 252 L70 236 Z" fill={navy} />
        <path d="M154 196 L112 212 L112 252 L154 236 Z" fill="#1c3a63" />
      </g>

      {/* caja pequeña derecha */}
      <g style={{ animation: 'gofofloat 5.5s ease-in-out infinite', animationDelay: '.8s' }}>
        <path d="M266 196 L308 180 L350 196 L308 212 Z" fill={gold} opacity="0.9" />
        <path d="M266 196 L308 212 L308 252 L266 236 Z" fill={navy} />
        <path d="M350 196 L308 212 L308 252 L350 236 Z" fill="#1c3a63" />
      </g>

      {/* marcador de ruta / pin */}
      <g style={{ animation: 'gofofloat 4.5s ease-in-out infinite' }}>
        <circle cx="330" cy="86" r="26" fill={gold} />
        <circle cx="330" cy="82" r="9" fill="#fff" />
        <path d="M330 108 L322 122 L338 122 Z" fill={gold} />
      </g>

      {/* líneas de movimiento */}
      <g stroke={navy} strokeWidth="4" strokeLinecap="round" opacity="0.5">
        <path d="M40 96 L96 96" />
        <path d="M28 120 L80 120" />
        <path d="M52 144 L104 144" />
      </g>
    </svg>
  )
}
