// ============================================================================
// BULK · Dominio · Scorecards (lógica pura, testeable): desempeño por transportista
// y por chofer a partir de las órdenes. Puntualidad, viajes, toneladas, $/ton y un
// score 0–100. Sin React ni Firebase.
// ============================================================================
import { tsMillis } from '../data/chatKeys'

const FIN = ['entregada', 'liberada', 'cerrada']
const n = (v) => Number(v) || 0
const A_TIEMPO_MIN = 180 // tomada → entrega considerada puntual

const durMin = (o) => {
  const a = tsMillis(o.hitos && o.hitos.tomada), b = tsMillis(o.hitos && o.hitos.entrega)
  return (a && b && b > a) ? (b - a) / 60000 : null
}

// Agrupa entregas por una clave y calcula métricas. `montoDe` extrae el importe
// del nivel que corresponde (transportista o chofer).
function agrupar(ordenes, keyDe, nombreDe, montoDe) {
  const m = new Map()
  for (const o of ordenes) {
    if (!FIN.includes(o.estado)) continue
    const k = keyDe(o)
    if (k == null || k === '') continue
    const g = m.get(k) || { key: k, nombre: nombreDe(o, k), viajes: 0, ton: 0, monto: 0, durs: [], rechazos: 0 }
    g.viajes += 1
    g.ton += n(o.pesoReal != null ? o.pesoReal : o.pesoEstimado)
    g.monto += montoDe(o)
    const d = durMin(o); if (d != null) g.durs.push(d)
    m.set(k, g)
  }
  return [...m.values()].map((g) => {
    const conDur = g.durs.length
    const aTiempo = g.durs.filter((d) => d <= A_TIEMPO_MIN).length
    const puntualidad = conDur ? Math.round((aTiempo / conDur) * 100) : null
    const ton = Math.round(g.ton)
    const porTon = g.ton > 0 ? Math.round((g.monto / g.ton) * 100) / 100 : null
    // Score 0–100: puntualidad si hay datos; si no, base por volumen entregado.
    const score = puntualidad != null ? puntualidad : Math.min(100, g.viajes * 10)
    return { key: g.key, nombre: g.nombre, viajes: g.viajes, ton, monto: Math.round(g.monto), porTon, puntualidad, score }
  }).sort((a, b) => b.score - a.score || b.viajes - a.viajes)
}

// Scorecard por transportista. `carriers` para resolver el nombre; el monto es lo
// que se le paga al transportista (precioTransportista).
export function scorecardsTransportistas(ordenes = [], carriers = []) {
  const nombre = (o, id) => (carriers.find((c) => c.id === id) || {}).nombre || o.transportistaNombre || id
  return agrupar(ordenes, (o) => o.transportistaId, nombre, (o) => n(o.precioTransportista))
}

// Scorecard por chofer. Agrupa por choferId (uid) y muestra su nombre; el monto es
// lo que se le paga al chofer (pagoChofer).
export function scorecardsChoferes(ordenes = []) {
  const nombre = (o) => o.choferNombre || o.choferId || '—'
  return agrupar(ordenes, (o) => o.choferId || o.choferNombre, nombre, (o) => n(o.pagoChofer))
}
