// Primitivos de interfaz en Tailwind (claros/oscuros, navy/dorado).
import { Link } from 'react-router-dom'
import Ilustracion from './Ilustracion'

// --- Card -------------------------------------------------------------------
export function Card({ children, className = '', ...rest }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-surface-card shadow-card dark:border-slate-700/60 dark:bg-surface-dark-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

// --- KPI / tarjeta de métrica (estilo Power BI) -----------------------------
const ACCENTS = {
  navy: { bar: 'bg-brand-navy', text: 'text-brand-navy dark:text-slate-100', chip: 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100' },
  gold: { bar: 'bg-brand-gold', text: 'text-brand-gold', chip: 'bg-brand-gold/15 text-yellow-700 dark:text-brand-gold' },
  green: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  red: { bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  blue: { bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  slate: { bar: 'bg-slate-400', text: 'text-slate-700 dark:text-slate-200', chip: 'bg-slate-400/10 text-slate-600 dark:text-slate-300' },
}

export function KPI({ label, value, icon, accent = 'navy', trend, sub, onClick }) {
  const a = ACCENTS[accent] || ACCENTS.navy
  const tendencia =
    trend == null || !isFinite(trend) ? null : (
      <span className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend * 100).toFixed(1)}%
      </span>
    )
  const Icon = typeof icon === 'function' ? icon : null
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`flex-1 min-w-[150px] rounded-2xl border border-slate-200/80 bg-surface-card p-5 shadow-card dark:border-slate-700/60 dark:bg-surface-dark-card ${
        clickable ? 'cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-cardhover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
        {(Icon || (icon && typeof icon === 'string')) && (
          <span className={`grid h-8 w-8 place-items-center rounded-xl ${a.chip}`}>
            {Icon ? <Icon size={17} strokeWidth={1.8} /> : icon}
          </span>
        )}
      </div>
      <div className={`mt-2 text-[28px] font-bold leading-none tracking-tight ${a.text}`}>{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {tendencia}
        {sub != null && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
    </div>
  )
}

// Alias retro-compatible (algunas páginas usan <Stat/>).
export function Stat({ label, value, accent = 'navy', sub, icon, trend }) {
  return <KPI label={label} value={value} accent={accent} sub={sub} icon={icon} trend={trend} />
}

// --- Título de página -------------------------------------------------------
export function PageTitle({ children, right }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <h1 className="m-0 text-2xl font-bold text-brand-navy dark:text-slate-100">{children}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  )
}

// --- Botón ------------------------------------------------------------------
const BTN = {
  primary: 'bg-brand-navy text-white hover:bg-brand-navy-700',
  gold: 'bg-brand-gold text-brand-navy hover:brightness-105',
  ghost: 'border border-slate-300 bg-transparent text-brand-navy hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50',
  danger: 'bg-rose-500 text-white hover:bg-rose-600',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600',
}
export function Boton({ children, onClick, variant = 'primary', disabled, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// --- Inputs -----------------------------------------------------------------
const FIELD =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function Input({ className = '', ...rest }) {
  return <input className={`${FIELD} ${className}`} {...rest} />
}
export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${FIELD} ${className}`} {...rest}>
      {children}
    </select>
  )
}

// --- Badge ------------------------------------------------------------------
const BADGE = {
  navy: 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100',
  gold: 'bg-brand-gold/15 text-yellow-700 dark:text-brand-gold',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  slate: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
}
export function Badge({ children, color = 'navy', title }) {
  return (
    <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[color] || BADGE.navy}`}>
      {children}
    </span>
  )
}

// --- Aviso ------------------------------------------------------------------
const AVISO = {
  info: 'bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
}
export function Aviso({ tipo = 'info', children, className = '' }) {
  return <div className={`mb-3 rounded-lg px-4 py-3 text-sm ${AVISO[tipo]} ${className}`}>{children}</div>
}

// --- Spinner ----------------------------------------------------------------
export function Spinner({ className = '', tamano = 'h-4 w-4' }) {
  return <span className={`inline-block ${tamano} animate-spin rounded-full border-2 border-current border-t-transparent align-middle ${className}`} />
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
      <Spinner tamano="h-6 w-6" className="text-brand-gold" />
      <span className="text-sm">{texto}</span>
    </div>
  )
}

// --- Estado vacío -----------------------------------------------------------
export function EstadoVacio({
  titulo = 'Aún no has cargado ninguna factura',
  texto = 'Ve a Cargar Factura para empezar a ver tus métricas aquí.',
  mostrarBoton = true,
}) {
  return (
    <Card className="px-6 py-8 text-center">
      <Ilustracion height={200} className="mx-auto mb-2" />
      <h3 className="m-0 mb-1 text-lg font-bold text-brand-navy dark:text-slate-100">{titulo}</h3>
      <p className="mx-auto mb-4 max-w-md text-slate-500 dark:text-slate-400">{texto}</p>
      {mostrarBoton && (
        <Link
          to="/facturas"
          className="inline-block rounded-lg bg-brand-gold px-5 py-2.5 font-bold text-brand-navy no-underline transition hover:brightness-105"
        >
          ⬆️ Cargar Factura
        </Link>
      )}
    </Card>
  )
}

// --- Tabla ------------------------------------------------------------------
export function Tabla({ columns, rows, renderCell, emptyText = 'Sin datos.', minWidth = 'min-w-[640px]', onRowClick }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
      <table className={`w-full border-collapse text-sm ${minWidth}`}>
        <thead>
          <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row._key || i}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={`border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.wrap ? '' : 'whitespace-nowrap'}`}>
                    {renderCell(row, c.key, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
