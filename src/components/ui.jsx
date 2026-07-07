// Componentes de interfaz reutilizables (estilo minimalista navy/dorado).
import { COLORS } from '../constants'

export function Card({ children, style }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 18, ...style }}>
      {children}
    </div>
  )
}

export function Stat({ label, value, color, sub }) {
  return (
    <Card style={{ minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 12, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || COLORS.navy, marginTop: 4 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

export function PageTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
      <h1 style={{ margin: 0, fontSize: 24, color: COLORS.navy }}>{children}</h1>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>
    </div>
  )
}

export function Boton({ children, onClick, variant = 'primary', disabled, style }) {
  const base = {
    padding: '9px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: 14,
    opacity: disabled ? 0.5 : 1,
  }
  const variants = {
    primary: { background: COLORS.navy, color: '#fff' },
    gold: { background: COLORS.gold, color: COLORS.navy },
    ghost: { background: 'transparent', color: COLORS.navy, border: `1px solid ${COLORS.border}` },
    danger: { background: COLORS.red, color: '#fff' },
    success: { background: COLORS.green, color: '#fff' },
  }
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  )
}

export function Tabla({ columns, rows, renderCell, emptyText = 'Sin datos.' }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, minWidth: 640 }}>
        <thead>
          <tr style={{ background: COLORS.navy, color: '#fff' }}>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left', padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 20, textAlign: 'center', color: COLORS.muted }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row._key || i} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? '#fafbfc' : '#fff' }}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'left', padding: '9px 12px', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
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

export function Badge({ children, color }) {
  return (
    <span style={{ background: (color || COLORS.navy) + '22', color: color || COLORS.navy, padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  )
}

export function Aviso({ tipo = 'info', children }) {
  const map = {
    info: { bg: '#eef2f8', color: COLORS.navy },
    warn: { bg: '#fff4e0', color: '#8a5a00' },
    error: { bg: '#fde8e6', color: COLORS.red },
    ok: { bg: '#e6f4ec', color: COLORS.green },
  }
  const s = map[tipo]
  return (
    <div style={{ background: s.bg, color: s.color, padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 12 }}>
      {children}
    </div>
  )
}
