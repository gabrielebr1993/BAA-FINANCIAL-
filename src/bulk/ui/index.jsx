// ============================================================================
// MilePay · Kit de componentes del REDISEÑO MÓVIL 2026 (Bloque 1)
// Un solo lenguaje visual para los 5 roles. Reglas duras:
//   · Radios: pill (999) para botones/campos/chips/tab bar; card (24) tarjetas
//     grandes; row (18) filas; bubble (20) burbujas de chat. Ningún otro.
//   · UN solo botón dorado (PrimaryButton) visible por pantalla.
//   · Iconos Lucide, stroke 1.75.
//   · Sin headers con barra de color: el navy es color de TARJETA (FeatureCard).
// Vive en src/bulk/ui/ (aparte de components/ui.jsx, el kit viejo) para poder
// migrar pantalla por pantalla sin romper lo existente.
// ============================================================================
import { ChevronRight } from 'lucide-react'
import '../../styles/tokens.css'

const S = 1.75 // stroke Lucide del sistema

// Botón de header: círculo 40 blanco con icono 20 navy. Con `badge` numérico.
export function IconButton({ icon: Icon, onClick, label, badge = 0, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`relative grid h-10 w-10 flex-shrink-0 place-items-center rounded-pill bg-white text-mp-navy shadow-card transition active:scale-95 ${className}`}>
      {Icon && <Icon size={20} strokeWidth={S} />}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-mp-gold px-1 text-[11px] font-semibold text-mp-navy">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}

// La ÚNICA acción dorada de la pantalla. Alto 52, pill.
export function PrimaryButton({ children, onClick, disabled, icon: Icon, className = '', type = 'button' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-mp-gold text-[15px] font-medium text-mp-navy transition active:scale-[0.99] disabled:opacity-50 ${className}`}>
      {Icon && <Icon size={20} strokeWidth={S} />} {children}
    </button>
  )
}

// Acción secundaria: pill con borde navy.
export function SecondaryButton({ children, onClick, disabled, icon: Icon, className = '', alto = 'h-[44px]' }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex ${alto} w-full items-center justify-center gap-2 rounded-pill border border-mp-navy bg-transparent text-[14px] font-medium text-mp-navy transition active:scale-[0.99] disabled:opacity-50 ${className}`}>
      {Icon && <Icon size={18} strokeWidth={S} />} {children}
    </button>
  )
}

// Tarjeta blanca estándar (24px).
export function Card({ children, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag {...(onClick ? { type: 'button', onClick } : {})}
      className={`block w-full rounded-card bg-white p-4 text-left shadow-card ${className}`}>
      {children}
    </Tag>
  )
}

// Tarjeta destacada NAVY (el bloque protagonista de cada home).
export function FeatureCard({ children, className = '' }) {
  return <div className={`rounded-card bg-mp-navy p-5 text-mp-cream shadow-card ${className}`}>{children}</div>
}

// Tarjeta de estadística: etiqueta 12 + número 28/500. `oscura` = navy con número dorado.
export function StatCard({ etiqueta, valor, sufijo, oscura = false, className = '' }) {
  return (
    <div className={`rounded-[22px] p-4 shadow-card ${oscura ? 'bg-mp-navy' : 'bg-white'} ${className}`}>
      <div className={`text-[12px] ${oscura ? 'text-mp-cream/70' : 'text-mp-ink-2'}`}>{etiqueta}</div>
      <div className={`mt-1 text-[28px] font-medium leading-none ${oscura ? 'text-mp-gold' : 'text-mp-ink'}`}>
        {valor}{sufijo && <span className={`text-[15px] font-normal ${oscura ? 'text-mp-cream/60' : 'text-mp-ink-2'}`}> {sufijo}</span>}
      </div>
    </div>
  )
}

// Fila de lista: icono en cuadrado 32 (radio 10), título 14/500, meta 12, chevron.
export function ListRow({ icon: Icon, iconClass = 'bg-mp-cream text-mp-navy', titulo, meta, derecha, onClick, chevron = true, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag {...(onClick ? { type: 'button', onClick } : {})}
      className={`flex w-full items-center gap-3 rounded-row bg-white p-3 text-left shadow-card ${className}`}>
      {Icon && (
        <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] ${iconClass}`}>
          <Icon size={18} strokeWidth={S} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-mp-ink">{titulo}</span>
        {meta && <span className="block truncate text-[12px] text-mp-ink-2">{meta}</span>}
      </span>
      {derecha}
      {chevron && onClick && <ChevronRight size={18} strokeWidth={S} className="flex-shrink-0 text-mp-ink-2" />}
    </Tag>
  )
}

// Pill dorado con número (no leídos).
export function Badge({ children, className = '' }) {
  return <span className={`grid h-5 min-w-[20px] place-items-center rounded-pill bg-mp-gold px-1.5 text-[11px] font-semibold text-mp-navy ${className}`}>{children}</span>
}

// Pill translúcido con punto de color y texto 12.
export function StatusPill({ color = 'var(--mp-green)', children, sobreNavy = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] ${sobreNavy ? 'bg-white/10 text-mp-cream' : 'bg-mp-navy/5 text-mp-ink'} ${className}`}>
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill" style={{ background: color }} />
      {children}
    </span>
  )
}

// Barra de pestañas FLOTANTE: pill translúcido con blur, 4 tabs, activo = círculo
// navy con icono dorado. Chats SIEMPRE en tercera posición (responsabilidad del
// que arma el arreglo `tabs`).
export function FloatingTabBar({ tabs = [], activo, onSelect, className = '' }) {
  return (
    <nav className={`fixed inset-x-4 z-40 mx-auto max-w-md rounded-pill shadow-float ${className}`}
      style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)', background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map((tb) => {
          const on = tb.k === activo
          const Icon = tb.icon
          return (
            <button key={tb.k} type="button" onClick={() => onSelect?.(tb.k)} aria-label={tb.label}
              className="relative flex flex-col items-center gap-0.5 px-2">
              <span className={`grid h-10 w-10 place-items-center rounded-pill transition ${on ? 'bg-mp-navy text-mp-gold' : 'text-mp-ink-2'}`}>
                <Icon size={on ? 20 : 24} strokeWidth={S} />
              </span>
              {!on && <span className="text-[10px] text-mp-ink-2">{tb.label}</span>}
              {tb.badge > 0 && <Badge className="absolute -right-0.5 -top-0.5">{tb.badge > 99 ? '99+' : tb.badge}</Badge>}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// Estructura estándar de toda pantalla de la app:
//   [safe-area, fondo crema] [fila de header sin barra] [contenido scroll] [tab bar o botón fijo]
export function PantallaApp({ izquierda, titulo, derecha, children, tabBar, accionFija, className = '' }) {
  return (
    <div className={`mp-app mp-app-safe mx-auto flex min-h-dvh max-w-md flex-col ${className}`}>
      {(izquierda || titulo || derecha) && (
        <div className="flex items-center gap-3 px-4 pb-1 pt-2">
          {izquierda || <span className="w-10" />}
          <div className="min-w-0 flex-1 text-center text-[12px] text-mp-ink-2">{titulo}</div>
          {derecha || <span className="w-10" />}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-32 pt-1">{children}</div>
      {tabBar}
      {accionFija && !tabBar && (
        <div className="fixed inset-x-4 z-40 mx-auto max-w-md" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          {accionFija}
        </div>
      )}
    </div>
  )
}
