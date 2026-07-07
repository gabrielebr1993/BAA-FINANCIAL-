// Ilustración SVG inline moderna de paquetes / logística (navy + dorado).
// Sin dependencias externas ni imágenes hospedadas.
const NAVY = '#13233f'
const GOLD = '#c9a24b'

export default function Ilustracion({ height = 260, className = '' }) {
  return (
    <svg viewBox="0 0 420 320" height={height} width="100%" role="img" aria-label="Paquetes de reparto" className={`max-w-[420px] ${className}`}>
      <ellipse cx="210" cy="286" rx="150" ry="16" fill={NAVY} opacity="0.08" />

      <g className="animate-float">
        <path d="M130 150 L210 120 L290 150 L210 182 Z" fill={GOLD} />
        <path d="M130 150 L210 182 L210 262 L130 230 Z" fill={NAVY} />
        <path d="M290 150 L210 182 L210 262 L290 230 Z" fill="#1c3a63" />
        <path d="M210 120 L210 182" stroke="#fff" strokeWidth="4" opacity="0.5" />
        <path d="M210 182 L210 262" stroke="#fff" strokeWidth="3" opacity="0.25" />
      </g>

      <g className="animate-float" style={{ animationDelay: '.4s' }}>
        <path d="M70 196 L112 180 L154 196 L112 212 Z" fill={GOLD} opacity="0.9" />
        <path d="M70 196 L112 212 L112 252 L70 236 Z" fill={NAVY} />
        <path d="M154 196 L112 212 L112 252 L154 236 Z" fill="#1c3a63" />
      </g>

      <g className="animate-float" style={{ animationDelay: '.8s' }}>
        <path d="M266 196 L308 180 L350 196 L308 212 Z" fill={GOLD} opacity="0.9" />
        <path d="M266 196 L308 212 L308 252 L266 236 Z" fill={NAVY} />
        <path d="M350 196 L308 212 L308 252 L350 236 Z" fill="#1c3a63" />
      </g>

      <g className="animate-float">
        <circle cx="330" cy="86" r="26" fill={GOLD} />
        <circle cx="330" cy="82" r="9" fill="#fff" />
        <path d="M330 108 L322 122 L338 122 Z" fill={GOLD} />
      </g>

      <g stroke={NAVY} strokeWidth="4" strokeLinecap="round" opacity="0.5">
        <path d="M40 96 L96 96" />
        <path d="M28 120 L80 120" />
        <path d="M52 144 L104 144" />
      </g>
    </svg>
  )
}
