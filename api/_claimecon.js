// ---------------------------------------------------------------------------
// Economía de claims para el SERVIDOR (sin dependencias de React/constants).
// Réplica mínima de src/utils/calc.js para que JARVIS y las Recomendaciones
// calculen la MISMA ganancia neta que la app (ingreso − pago − descuentoGofo +
// cobrado al chofer). Un archivo "_" no es una ruta en Vercel.
// ---------------------------------------------------------------------------
const CLAIM_FEE = 100
const METODO_DEFAULT = 'M1'
const CATEGORIAS = [
  { key: 'damaged', match: ['damageditem', 'damaged', 'damage', 'danado'] },
  { key: 'lost', match: ['lostitem', 'lost', 'perdido'] },
  { key: 'fakepod', match: ['fakepod', 'falsopod'] },
  { key: 'tracking', match: ['trackinginterruption', 'tracking', 'interrupcion'] },
]
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)

function categoria(claimType) {
  const s = String(claimType || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const c of CATEGORIAS) if (c.match.some((p) => s.includes(p))) return c.key
  return 'otro'
}
function claimFeeDe(inv, ciudad) {
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r && num(r.claimFee) != null) return Number(r.claimFee)
  if (inv?.reglaEmpresa && num(inv.reglaEmpresa.claimFee) != null) return Number(inv.reglaEmpresa.claimFee)
  return CLAIM_FEE
}
function metodoDe(inv, ciudad, claim) {
  if (claim?.metodo === 'M1' || claim?.metodo === 'M2' || claim?.metodo === 'M3') return claim.metodo
  const cat = categoria(claim?.claimType)
  if (inv?.modoConfig === 'ruta') {
    const rr = inv?.reglasRutaAplicadas && inv.reglasRutaAplicadas[claim?.rutaAsignada]
    if (rr?.metodos && rr.metodos[cat]) return rr.metodos[cat]
    return METODO_DEFAULT
  }
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r?.metodos && r.metodos[cat]) return r.metodos[cat]
  if (inv?.reglaEmpresa?.metodos && inv.reglaEmpresa.metodos[cat]) return inv.reglaEmpresa.metodos[cat]
  return METODO_DEFAULT
}
function montoM1De(inv, ciudad, claim) {
  const cat = categoria(claim?.claimType)
  if (inv?.modoConfig === 'ruta') {
    const rr = inv?.reglasRutaAplicadas && inv.reglasRutaAplicadas[claim?.rutaAsignada]
    if (rr?.montos && num(rr.montos[cat]) != null) return Number(rr.montos[cat])
    if (rr && num(rr.claimFee) != null) return Number(rr.claimFee)
    return CLAIM_FEE
  }
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r?.montos && num(r.montos[cat]) != null) return Number(r.montos[cat])
  if (inv?.reglaEmpresa?.montos && num(inv.reglaEmpresa.montos[cat]) != null) return Number(inv.reglaEmpresa.montos[cat])
  return claimFeeDe(inv, ciudad)
}
function feeDeClaim(inv, ciudad, claim) {
  const m = metodoDe(inv, ciudad, claim)
  if (m === 'M2') return Math.abs(Number(claim?.montoGofo) || 0)
  if (m === 'M3') return 0
  return montoM1De(inv, ciudad, claim)
}

// Claims VÁLIDOS (mismo criterio que la app): repetidos por waybill dentro de una
// factura cuentan una vez y solo si el caso está 'aprobado'.
function claimsValidos(claims) {
  const grupos = {}
  for (const c of claims || []) {
    const wb = (c.waybill || '').trim()
    const k = `${c.invoiceId || ''}||${wb || `__${c.id || Math.random()}`}`
    ;(grupos[k] = grupos[k] || []).push(c)
  }
  const out = []
  for (const arr of Object.values(grupos)) {
    if (arr.length === 1) { if (arr[0].estadoRevision !== 'anulado') out.push(arr[0]) }
    else if ((arr[0].estadoRevision || 'pendiente') === 'aprobado') out.push(arr.find((c) => Number(c.montoGofo) < 0) || arr[0])
  }
  return out
}

// Neto de claims por chofer (courier): { descontadoGofo, cobrado, gananciaClaims }.
// invById mapea invoiceId → factura (para leer sus reglas). Perdón = flag o M3.
export function netoClaimsPorChofer(claims, invById) {
  const map = {}
  for (const c of claimsValidos(claims)) {
    const inv = invById[c.invoiceId] || null
    const ciudad = c.ciudad || ''
    const perdon = c.perdonado || metodoDe(inv, ciudad, c) === 'M3'
    const gofo = Math.abs(Number(c.montoGofo) || 0)
    const fee = perdon ? 0 : feeDeClaim(inv, ciudad, c)
    const t = (map[c.courier] = map[c.courier] || { descontadoGofo: 0, cobrado: 0, gananciaClaims: 0, claims: 0 })
    t.descontadoGofo += gofo
    t.cobrado += fee
    t.gananciaClaims += fee - gofo
    t.claims += 1
  }
  return map
}
