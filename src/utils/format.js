// Helpers de formato numérico / moneda.

export function money(n) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function num(n, dec = 0) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function pct(n, dec = 1) {
  const v = Number(n) || 0
  return `${(v * 100).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`
}
