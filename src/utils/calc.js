// ---------------------------------------------------------------------------
// Cálculos de negocio derivados del resumen de una factura.
// Reglas por defecto: doble = monto 0.5 ; CLAIM_FEE = $100 por claim no perdonado.
// Ambas son CONFIGURABLES por empresa y por ciudad (ver resolverReglas). El pago
// = individuales*tarifaInd + dobles*tarifaDoble - claimsNoPerdonados*claimFee.
// ---------------------------------------------------------------------------
import { CLAIM_FEE, DOBLE_MONTO, CATEGORIAS_CLAIM, CATEGORIAS_CLAIM_KEYS, METODO_CLAIM_DEFAULT, UMBRAL_CAMBIO_PRECIO, nombreCiudad, PESOS_CALIF_CHOFER, PESOS_CALIF_CIUDAD, PESO_CALIDAD_CHOFER, UMBRALES_CALIF, UMBRALES_ESTRELLAS, CALIDAD_FACTOR, BASE_PROMEDIO } from '../constants'

export const TODAS = 'todas'
export const TODOS = 'todos' // filtro de chofer: "Todos los choferes"

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v))

// ---- reglas de cálculo configurables (empresa → ciudad → global) -------------
const numONull = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null }

// Resuelve claimFee y dobleMonto para una ciudad, con jerarquía:
//   ciudad (si la definió) → empresa (default de la empresa) → global (100 / 0.5).
// `ajustes` = settings/{companyId} con { reglas:{claimFee,dobleMonto},
//   reglasCiudad:{ [codigoCiudad]: {claimFee?, dobleMonto?} } }.
export function resolverReglas(ajustes, ciudad) {
  const emp = ajustes?.reglas || {}
  const ciu = (ajustes?.reglasCiudad && ajustes.reglasCiudad[ciudad]) || {}
  const claimFee = numONull(ciu.claimFee) ?? numONull(emp.claimFee) ?? CLAIM_FEE
  const dobleMonto = numONull(ciu.dobleMonto) ?? numONull(emp.dobleMonto) ?? DOBLE_MONTO
  // Método de cobro por CATEGORÍA de claim (M1/M2/M3): ciudad → empresa → M1.
  const metodos = {}
  // Monto de M1 por categoría (opcional). Si no se define, se usa claimFee.
  const montos = {}
  for (const cat of CATEGORIAS_CLAIM_KEYS) {
    metodos[cat] = (ciu.metodos && ciu.metodos[cat]) || (emp.metodos && emp.metodos[cat]) || METODO_CLAIM_DEFAULT
    const mv = numONull(ciu.montos && ciu.montos[cat]) ?? numONull(emp.montos && emp.montos[cat])
    if (mv != null) montos[cat] = mv
  }
  return { claimFee, dobleMonto, metodos, montos }
}

// Detecta la CATEGORÍA de un claim desde su "Claim Type" (normaliza mayúsculas,
// espacios y símbolos). Devuelve 'damaged' | 'lost' | 'fakepod' | 'tracking' | 'otro'.
export function categoriaClaim(claimType) {
  const s = String(claimType || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const c of CATEGORIAS_CLAIM) if (c.match.some((p) => s.includes(p))) return c.key
  return 'otro'
}
// Etiqueta legible de una categoría.
export function etiquetaCategoria(cat) {
  const c = CATEGORIAS_CLAIM.find((x) => x.key === cat)
  return c ? c.label : 'Otro'
}

// ¿Un paquete es "doble" según la regla (monto == dobleMonto, con tolerancia)?
export function esDoblePorRegla(monto, dobleMonto = DOBLE_MONTO) {
  return Math.abs((Number(monto) || 0) - (Number(dobleMonto) || 0)) < 1e-9
}

// ¿Un DETALLE es "doble"? Prioriza la columna "STOP Point Details" (posición en la
// parada: 2+ = envío subsiguiente al mismo domicilio = doble), que es el criterio
// correcto e independiente del peso/monto. Si esa columna no viene en la factura,
// se cae al criterio por monto (dobleMonto configurable por ciudad).
export function esDobleDetalle(d, dobleMonto = DOBLE_MONTO) {
  const pos = Number(d?.stopPos)
  if (Number.isFinite(pos) && pos > 0) return pos >= 2
  return esDoblePorRegla(d?.monto, dobleMonto)
}

// claimFee (multa M1) aplicado a una factura para una ciudad. Usa las reglas que se
// guardaron EN la factura al procesarla (histórico consistente); si no, global 100.
export function claimFeeDe(inv, ciudad) {
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r && numONull(r.claimFee) != null) return Number(r.claimFee)
  if (inv?.reglaEmpresa && numONull(inv.reglaEmpresa.claimFee) != null) return Number(inv.reglaEmpresa.claimFee)
  return CLAIM_FEE
}

// Método (M1/M2/M3) que le corresponde a UN claim. Prioridad:
//   1) claim.metodo (override guardado/manual en ese claim)
//   2) reglas de la ciudad guardadas en la factura, por su categoría
//   3) reglas de empresa de la factura, por su categoría
//   4) M1 (default)
export function metodoDe(inv, ciudad, claim) {
  if (claim?.metodo === 'M1' || claim?.metodo === 'M2' || claim?.metodo === 'M3') return claim.metodo
  const cat = categoriaClaim(claim?.claimType)
  // Modo POR RUTA: el método sale de la regla de la ruta asignada al chofer.
  if (inv?.modoConfig === 'ruta') {
    const rr = inv?.reglasRutaAplicadas && inv.reglasRutaAplicadas[claim?.rutaAsignada]
    if (rr?.metodos && rr.metodos[cat]) return rr.metodos[cat]
    return METODO_CLAIM_DEFAULT
  }
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r?.metodos && r.metodos[cat]) return r.metodos[cat]
  if (inv?.reglaEmpresa?.metodos && inv.reglaEmpresa.metodos[cat]) return inv.reglaEmpresa.metodos[cat]
  return METODO_CLAIM_DEFAULT
}

// Monto de M1 para un claim: precio por su CATEGORÍA si se configuró, si no la
// multa general de la ciudad (claimFee).
export function montoM1De(inv, ciudad, claim) {
  const cat = categoriaClaim(claim?.claimType)
  // Modo POR RUTA: precio M1 de la ruta asignada (por categoría → multa de la ruta).
  if (inv?.modoConfig === 'ruta') {
    const rr = inv?.reglasRutaAplicadas && inv.reglasRutaAplicadas[claim?.rutaAsignada]
    if (rr?.montos && numONull(rr.montos[cat]) != null) return Number(rr.montos[cat])
    if (rr && numONull(rr.claimFee) != null) return Number(rr.claimFee)
    return CLAIM_FEE
  }
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r?.montos && numONull(r.montos[cat]) != null) return Number(r.montos[cat])
  if (inv?.reglaEmpresa?.montos && numONull(inv.reglaEmpresa.montos[cat]) != null) return Number(inv.reglaEmpresa.montos[cat])
  return claimFeeDe(inv, ciudad)
}

// Tarifas (individual/doble) de un chofer. En modo POR RUTA salen de la regla de
// la ruta asignada; si no, del perfil del chofer (como siempre).
export function tarifaDriver(inv, drivers, nombre) {
  if (inv?.modoConfig === 'ruta') {
    const ruta = inv?.asignacionRuta && inv.asignacionRuta[nombre]
    const rr = ruta && inv?.reglasRutaAplicadas && inv.reglasRutaAplicadas[ruta]
    if (rr) {
      const tarifaInd = Number(rr.tarifaInd) || 0
      const tarifaDoble = Number(rr.tarifaDoble) || 0
      return { tarifaInd, tarifaDoble, sinTarifa: !(tarifaInd > 0 || tarifaDoble > 0) }
    }
    return { tarifaInd: 0, tarifaDoble: 0, sinTarifa: true } // sin ruta asignada
  }
  const d = buscarDriver(drivers, nombre)
  return { tarifaInd: d ? Number(d.precioIndividual) || 0 : 0, tarifaDoble: d ? Number(d.precioDoble) || 0 : 0, sinTarifa: !d }
}

// Lo que se le COBRA al chofer por UN claim, según su método:
//   M1 → la multa fija (precio por categoría si existe, si no claimFee de la ciudad)
//   M2 → exactamente lo que Gofo descontó (|montoGofo|)
//   M3 → 0 (perdón)
export function feeDeClaim(inv, ciudad, claim) {
  const m = metodoDe(inv, ciudad, claim)
  if (m === 'M2') return Math.abs(Number(claim?.montoGofo) || 0)
  if (m === 'M3') return 0
  return montoM1De(inv, ciudad, claim)
}

// ---- calificación de choferes ------------------------------------------------
// Promedios de la flota (para comparar productividad y rentabilidad).
export function promediosFlota(pagos) {
  const lista = (pagos || []).filter((p) => (p.individuales + p.dobles) > 0)
  const n = lista.length || 1
  const paquetes = lista.reduce((a, p) => a + (p.individuales + p.dobles), 0) / n
  const ganancia = lista.reduce((a, p) => a + (p.ganancia || 0), 0) / n
  return { paquetes, ganancia, n: lista.length }
}

const nivelSub = (s) => (s >= 80 ? 'excelente' : s >= 60 ? 'alta' : s >= 40 ? 'media' : 'baja')

// Estrellas 1-5 a partir del puntaje (bandas en constants).
export function estrellasDe(puntaje) {
  const p = Number(puntaje) || 0
  for (const u of UMBRALES_ESTRELLAS) if (p >= u.min) return u.estrellas
  return 1
}

// Calcula la calificación 0-100 de un chofer combinando calidad, productividad
// y rentabilidad (pesos en constants). Devuelve subpuntajes, nivel y desglose.
export function calificarChofer(pago, prom) {
  const paquetes = pago.paquetes ?? (pago.individuales + pago.dobles)
  const claims = pago.claimsTotales || 0
  const fallidos = pago.fallidos || 0
  // La CALIDAD combina claims y fallidos (ambos por cada 100 paquetes). Los claims
  // pesan más (70/30): tienen costo; los fallidos son señal de mal desempeño.
  const claimsPor100 = paquetes > 0 ? (claims / paquetes) * 100 : 0
  const fallidosPor100 = paquetes > 0 ? (fallidos / paquetes) * 100 : 0
  const calidadClaims = clamp(100 - claimsPor100 * CALIDAD_FACTOR)
  const calidadFallidos = clamp(100 - fallidosPor100 * CALIDAD_FACTOR)
  const wq = PESO_CALIDAD_CHOFER
  const calidad = wq.claims * calidadClaims + wq.fallidos * calidadFallidos
  const productividad = prom?.paquetes > 0 ? clamp(BASE_PROMEDIO * (paquetes / prom.paquetes)) : 50
  const rentabilidad = prom?.ganancia > 0 ? clamp(BASE_PROMEDIO * ((pago.ganancia || 0) / prom.ganancia)) : (pago.ganancia >= 0 ? 50 : 0)
  const w = PESOS_CALIF_CHOFER
  const puntaje = Math.round(w.calidad * calidad + w.productividad * productividad + w.rentabilidad * rentabilidad)
  const nivel = puntaje >= UMBRALES_CALIF.bueno ? 'bueno' : puntaje >= UMBRALES_CALIF.regular ? 'regular' : 'malo'
  const etiqueta = nivel === 'bueno' ? 'Bueno' : nivel === 'regular' ? 'Regular' : 'Malo'
  return {
    puntaje,
    estrellas: estrellasDe(puntaje),
    calidad, productividad, rentabilidad,
    nivel, etiqueta,
    desglose: `Calidad: ${nivelSub(calidad)} · Productividad: ${nivelSub(productividad)} · Rentabilidad: ${nivelSub(rentabilidad)}`,
  }
}

// Filtra un arreglo del resumen por ciudad. `campo` es la clave que guarda el código.
export function porCiudad(arr, ciudad, campo = 'ciudad') {
  if (!arr) return []
  if (!ciudad || ciudad === TODAS) return arr
  return arr.filter((x) => (x[campo] || x.ubicacion) === ciudad)
}

// Filtra CLAIMS por ciudad de forma ROBUSTA: por su código de ciudad y, si ese
// código no existe en la factura (claim con la ciudad vacía o mal guardada de una
// carga anterior), lo ubica por la ciudad de SU chofer en el resumen. Así un claim
// no "desaparece" al filtrar por ciudad aunque su código quedó desalineado.
export function claimsDeCiudad(claims, ciudad, inv) {
  const lista = claims || []
  if (!ciudad || ciudad === TODAS) return lista
  const codigosInv = new Set((inv?.resumenCiudades || []).map((c) => c.ubicacion))
  const choferesCiudad = new Set(
    (inv?.resumenChoferes || []).filter((c) => (c.ciudad || c.ubicacion) === ciudad).map((c) => c.nombre)
  )
  return lista.filter((c) => {
    const cc = c.ciudad || c.ubicacion || ''
    if (cc === ciudad) return true
    // Claim huérfano (sin ciudad o con un código que no está en la factura): se
    // asigna por su chofer, evitando doble conteo de claims con ciudad válida.
    if (!codigosInv.has(cc)) return choferesCiudad.has(c.courier)
    return false
  })
}

// Lista de ciudades disponibles (códigos) presentes en una factura.
export function ciudadesDeFactura(inv) {
  if (!inv) return []
  const set = new Set()
  ;(inv.resumenCiudades || []).forEach((c) => set.add(c.ubicacion))
  return [...set].filter(Boolean).sort()
}

// Nombre legible de una ciudad para una factura concreta: primero el mapa
// guardado (ciudades personalizadas), luego el resumen, luego la tabla estándar.
export function nombreCiudadDe(inv, code) {
  if (inv?.ciudadesMap && inv.ciudadesMap[code]) return inv.ciudadesMap[code]
  const r = (inv?.resumenCiudades || []).find((c) => c.ubicacion === code)
  if (r?.nombreCiudad) return r.nombreCiudad
  return nombreCiudad(code)
}

// Totales globales respetando el filtro de ciudad, calculados desde resumenChoferes/Rutas.
export function totalesFiltrados(inv, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad)
  const ingreso = choferes.reduce((a, c) => a + c.ingreso, 0)
  const individuales = choferes.reduce((a, c) => a + c.individuales, 0)
  const dobles = choferes.reduce((a, c) => a + c.dobles, 0)
  const numClaims = choferes.reduce((a, c) => a + c.numClaims, 0)
  const paquetes = individuales + dobles
  return {
    ingreso,
    individuales,
    dobles,
    paquetes,
    numClaims,
    pctDobles: paquetes > 0 ? dobles / paquetes : 0,
    numChoferes: choferes.length,
    numRutas: rutas.length,
  }
}

// Empareja un chofer del resumen con su tarifa en `drivers` (por nombre, texto).
export function buscarDriver(drivers, nombre) {
  if (!drivers || !nombre) return null
  const n = nombre.trim().toLowerCase()
  return drivers.find((d) => (d.nombre || '').trim().toLowerCase() === n) || null
}

// ---- claims repetidos y conteo canónico --------------------------------------
// Un claim puede tener `estadoRevision`:
//   undefined / 'aprobado' -> cuenta como válido
//   'anulado'              -> no cuenta (reversión rechazada por el dueño)
//   'pendiente'            -> repetido sin decidir; no cuenta hasta aprobarse
// Un caso REPETIDO = un mismo Waybill No. que aparece >1 vez dentro de la MISMA
// factura (invoiceId). Suele ser un claim (monto negativo) + su reversión
// (monto positivo). El dueño decide manualmente si el caso se aprueba o se anula.

// Clave de agrupación: factura + waybill (para no cruzar facturas distintas).
function claveWaybill(c) {
  const wb = (c.waybill || '').trim()
  return `${c.invoiceId || ''}||${wb || `__${c.id || Math.random()}`}`
}

// Detecta los casos de waybill repetido en un conjunto de claims.
// Devuelve [{ waybill, invoiceId, courier, estado, claims: [...] }].
export function detectarClaimsRepetidos(claims) {
  const grupos = {}
  for (const c of claims || []) {
    if (!(c.waybill || '').trim()) continue
    const k = claveWaybill(c)
    ;(grupos[k] = grupos[k] || []).push(c)
  }
  return Object.values(grupos)
    .filter((arr) => arr.length > 1)
    .map((arr) => ({
      waybill: (arr[0].waybill || '').trim(),
      invoiceId: arr[0].invoiceId || '',
      courier: arr[0].courier,
      ciudad: arr[0].ciudad || '',
      estado: arr[0].estadoRevision || 'pendiente',
      claims: arr,
    }))
}

// Casos repetidos aún sin resolver (pendientes de aprobación del dueño).
export function claimsRepetidosPendientes(claims) {
  return detectarClaimsRepetidos(claims).filter((g) => (g.estado || 'pendiente') === 'pendiente')
}

// Conteo CANÓNICO: lista de claims VÁLIDOS (mismo criterio en todo el sistema).
// - No repetido: cuenta salvo que esté 'anulado'.
// - Repetido: cuenta UNA vez y solo si el caso está 'aprobado' (representado por
//   el claim de monto negativo, el "real"); 'pendiente'/'anulado' no cuentan.
export function claimsValidos(claims) {
  const grupos = {}
  for (const c of claims || []) {
    const k = claveWaybill(c)
    ;(grupos[k] = grupos[k] || []).push(c)
  }
  const validos = []
  for (const arr of Object.values(grupos)) {
    if (arr.length === 1) {
      if (arr[0].estadoRevision !== 'anulado') validos.push(arr[0])
    } else {
      const estado = arr[0].estadoRevision || 'pendiente'
      if (estado === 'aprobado') {
        const real = arr.find((c) => Number(c.montoGofo) < 0) || arr[0]
        validos.push(real)
      }
    }
  }
  return validos
}

// Número oficial de claims válidos.
export function contarClaimsValidos(claims) {
  return claimsValidos(claims).length
}

// Claims activos (válidos y no perdonados) por chofer → base del cobro de $100.
export function claimsActivosPorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) {
    if (c.perdonado) continue
    map[c.courier] = (map[c.courier] || 0) + 1
  }
  return map
}

// Igual que el anterior, pero devuelve la LISTA de claims activos por chofer
// (para poder cobrar una multa distinta según el tipo de cada claim).
export function claimsActivosDetallePorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) {
    if (c.perdonado) continue
    ;(map[c.courier] = map[c.courier] || []).push(c)
  }
  return map
}

// Claims válidos (perdonados incluidos) por chofer → conteo de calidad.
export function claimsValidosPorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) map[c.courier] = (map[c.courier] || 0) + 1
  return map
}

// Calcula la nómina (payroll) por chofer para una factura, con el filtro de ciudad.
// Devuelve filas con ingreso, tarifas, descuento de claims, total a pagar y ganancia.
// `ajustesPorChofer` (opcional): mapa nombre.toLowerCase() -> { prestamo, bono }.
// Se aplica UNA vez por chofer (a su fila principal si tiene varias ciudades):
//   totalPagar = pagoBase − descuentoClaims − prestamo + bono.
export function calcularPagos(inv, claims, drivers, ciudad, ajustesPorChofer = null) {
  const choferesFull = inv?.resumenChoferes || []
  const choferes = porCiudad(choferesFull, ciudad)

  // Ciudades de cada chofer (del resumen COMPLETO) para asignar cada claim a la
  // fila (chofer, ciudad) correcta y no duplicarlo en choferes de varias ciudades.
  const ciudadesPorChofer = {}
  for (const ch of choferesFull) (ciudadesPorChofer[ch.nombre] = ciudadesPorChofer[ch.nombre] || []).push(ch.ciudad)
  const ciudadDeClaim = (c) => {
    const cs = ciudadesPorChofer[c.courier] || []
    if (cs.length <= 1) return cs[0] ?? c.ciudad ?? ''
    if (c.ciudad && cs.includes(c.ciudad)) return c.ciudad
    return cs[0] // sin coincidencia → ciudad principal (primera), sin doble conteo
  }
  const K = (nombre, ciu) => `${nombre}||${ciu}`

  // Claims válidos agrupados por (chofer, ciudad). Perdón = flag manual O método M3.
  const activosDet = {}, totalPorCh = {}, descGofoPorCh = {}
  for (const c of claimsValidos(claims)) {
    const ciu = ciudadDeClaim(c)
    const key = K(c.courier, ciu)
    totalPorCh[key] = (totalPorCh[key] || 0) + 1
    descGofoPorCh[key] = (descGofoPorCh[key] || 0) + Math.abs(Number(c.montoGofo) || 0)
    const perdon = c.perdonado || metodoDe(inv, ciu, c) === 'M3'
    if (!perdon) (activosDet[key] = activosDet[key] || []).push(c)
  }

  const filas = choferes.map((ch) => {
    const { tarifaInd, tarifaDoble, sinTarifa } = tarifaDriver(inv, drivers, ch.nombre)
    const key = K(ch.nombre, ch.ciudad)
    const misActivos = activosDet[key] || []
    const claimsActivos = misActivos.length
    const claimsTotales = totalPorCh[key] || 0
    const claimsPerdonados = claimsTotales - claimsActivos
    const claimFee = claimFeeDe(inv, ch.ciudad) // general (referencia/visualización)
    // Lo que le COBRAS al chofer por sus claims activos (según método/categoría).
    const descuentoClaims = misActivos.reduce((a, cl) => a + feeDeClaim(inv, ch.ciudad, cl), 0)
    // Lo que GOFO te descontó a ti por los claims de este chofer (pérdida real).
    const descontadoGofo = descGofoPorCh[key] || 0
    const pagoBase = ch.individuales * tarifaInd + ch.dobles * tarifaDoble
    const totalPagar = pagoBase - descuentoClaims
    // Fallidos ("Failed delivery"): informativo de desempeño; no afecta pago ni neto.
    const fallidos = Number(ch.fallidos) || 0
    const entregados = ch.individuales + ch.dobles
    const intentos = entregados + fallidos // un fallido es un intento no entregado
    return {
      nombre: ch.nombre,
      ciudad: ch.ciudad,
      nombreCiudad: nombreCiudad(ch.ciudad),
      individuales: ch.individuales,
      dobles: ch.dobles,
      ingreso: ch.ingreso,
      fallidos,
      pctFallidos: intentos > 0 ? fallidos / intentos : 0,
      tarifaInd,
      tarifaDoble,
      sinTarifa,
      claimFee,
      claimsTotales,
      claimsActivos,
      claimsPerdonados,
      descuentoClaims,
      descontadoGofo,
      gananciaClaims: descuentoClaims - descontadoGofo,
      prestamo: 0,
      bono: 0,
      totalPagar,
      // Ganancia NETA para la empresa: ingreso bruto − pago al chofer − lo que Gofo
      // te descontó por claims (lo que recuperas del chofer ya está en totalPagar).
      ganancia: ch.ingreso - totalPagar - descontadoGofo,
    }
  })

  // Ajustes manuales (préstamo/bono) por chofer: se aplican una sola vez por chofer
  // (a la primera fila = ciudad principal) para no duplicar en choferes multi-ciudad.
  if (ajustesPorChofer) {
    const aplicado = new Set()
    for (const r of filas) {
      const k = (r.nombre || '').trim().toLowerCase()
      const adj = ajustesPorChofer[k]
      if (!adj || aplicado.has(k)) continue
      aplicado.add(k)
      const prestamo = Number(adj.prestamo) || 0
      const bono = Number(adj.bono) || 0
      if (!prestamo && !bono) continue
      r.prestamo = prestamo
      r.bono = bono
      r.totalPagar = r.totalPagar - prestamo + bono
      r.ganancia = r.ingreso - r.totalPagar - r.descontadoGofo
    }
  }
  return filas
}

// Nómina EXACTA por una ruta puntual, usando el desglose por (chofer, ruta) que
// guarda cada factura nueva (inv.resumenChoferRuta) y los claims de esa ruta.
// Devuelve las mismas filas que calcularPagos, pero acotadas a la ruta.
// Si la factura no trae el desglose (histórico), devuelve [] (el llamador cae
// a la aproximación por ciudad).
export function pagosPorRuta(inv, claims, drivers, ruta) {
  const filas = (inv?.resumenChoferRuta || []).filter((r) => r.ruta === ruta)
  if (!filas.length) return []
  const claimsRuta = (claims || []).filter((c) => (c.ruta || '') === ruta)
  const activosDet = claimsActivosDetallePorChofer(claimsRuta)
  const totalPorChofer = claimsValidosPorChofer(claimsRuta)
  const descGofo = {}
  for (const c of claimsValidos(claimsRuta)) descGofo[c.courier] = (descGofo[c.courier] || 0) + Math.abs(Number(c.montoGofo) || 0)
  return filas.map((ch) => {
    const { tarifaInd, tarifaDoble, sinTarifa } = tarifaDriver(inv, drivers, ch.nombre)
    const misActivos = activosDet[ch.nombre] || []
    const claimsActivos = misActivos.length
    const claimsTotales = totalPorChofer[ch.nombre] || 0
    const descuentoClaims = misActivos.reduce((a, cl) => a + feeDeClaim(inv, ch.ciudad, cl), 0)
    const descontadoGofo = descGofo[ch.nombre] || 0
    const pagoBase = ch.individuales * tarifaInd + ch.dobles * tarifaDoble
    const totalPagar = pagoBase - descuentoClaims
    return {
      nombre: ch.nombre,
      ciudad: ch.ciudad,
      nombreCiudad: nombreCiudad(ch.ciudad),
      ruta: ch.ruta,
      individuales: ch.individuales,
      dobles: ch.dobles,
      paquetes: ch.individuales + ch.dobles,
      ingreso: ch.ingreso,
      fallidos: Number(ch.fallidos) || 0,
      pctFallidos: (ch.individuales + ch.dobles + (Number(ch.fallidos) || 0)) > 0 ? (Number(ch.fallidos) || 0) / (ch.individuales + ch.dobles + (Number(ch.fallidos) || 0)) : 0,
      tarifaInd,
      tarifaDoble,
      sinTarifa,
      claimsTotales,
      claimsActivos,
      claimsPerdonados: claimsTotales - claimsActivos,
      descuentoClaims,
      descontadoGofo,
      gananciaClaims: descuentoClaims - descontadoGofo,
      totalPagar,
      // Ganancia NETA: resta también lo que Gofo descontó por claims.
      ganancia: ch.ingreso - totalPagar - descontadoGofo,
    }
  })
}

// Estimación rápida de totales de una factura (sin depender de la colección de
// claims perdonados). Trata todos los claims como activos. Útil para comparar
// tendencia semana-a-semana en los KPIs.
export function resumenEstimado(inv, drivers, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  let ingreso = 0, costo = 0, individuales = 0, dobles = 0, claims = 0
  for (const ch of choferes) {
    const driver = buscarDriver(drivers, ch.nombre)
    const tInd = driver ? Number(driver.precioIndividual) || 0 : 0
    const tDob = driver ? Number(driver.precioDoble) || 0 : 0
    ingreso += ch.ingreso
    individuales += ch.individuales
    dobles += ch.dobles
    claims += ch.numClaims
    // Costo = pago al chofer por entregas. (Aquí no hay detalle de claims por
    // chofer: el costo NETO de claims se resta abajo con el descuento de Gofo.)
    costo += ch.individuales * tInd + ch.dobles * tDob
  }
  // Costo neto de claims (aprox. para tendencia): lo que Gofo te descontó. Solo se
  // conoce a nivel de factura completa; por ciudad se omite (se ve el margen de
  // entrega). El P&L exacto de claims está en Financiero/economiaClaims.
  const esTodas = !ciudad || ciudad === TODAS
  if (esTodas) costo += Math.abs(Number(inv?.totalDescuentoGofo) || 0)
  const paquetes = individuales + dobles
  return {
    ingreso,
    costo,
    ganancia: ingreso - costo,
    individuales,
    dobles,
    paquetes,
    claims,
    pctDobles: paquetes > 0 ? dobles / paquetes : 0,
    margen: ingreso > 0 ? (ingreso - costo) / ingreso : 0,
  }
}

// Variación relativa (para flechas ▲▼). null si no hay base comparable.
export function variacion(actual, anterior) {
  if (anterior == null || anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}

// Costo semanal de los managers activos × número de semanas del periodo.
// Cada manager pertenece a UNA ciudad (campo `ciudad`). Con `ciudad` se cuenta
// solo esa ciudad; con "Todas" (o sin ciudad) se suman todas las ciudades.
export function costoManagers(managers, semanas = 1, ciudad) {
  const esTodas = !ciudad || ciudad === TODAS
  const base = (managers || [])
    .filter((m) => m.activo !== false)
    .filter((m) => esTodas || (m.ciudad || '') === ciudad)
    .reduce((a, m) => a + (Number(m.sueldoSemanal) || 0), 0)
  return base * (semanas || 1)
}

// Ganancia real = ingresoNeto − costoChoferes − costoManagers.
// ingresoNeto: si "Todas", el neto verificado (entregas+offset+claims+ajustes);
// si una ciudad, se aproxima con entregas(ciudad) + claimsGofo(ciudad).
// El costo de managers respeta el filtro de ciudad (solo los de esa ciudad, o el
// total si es "Todas").
export function gananciaRealDe(inv, claims, drivers, managers, ciudad, semanas = 1, ajustesPorChofer = null) {
  const pagos = calcularPagos(inv, claims, drivers, ciudad, ajustesPorChofer)
  const costoChoferes = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const esTodas = !ciudad || ciudad === TODAS
  let ingresoNeto
  if (esTodas && inv?.verificacion) {
    ingresoNeto = inv.verificacion.netoCalculado
  } else {
    const entregas = porCiudad(inv?.resumenCiudades || [], ciudad).reduce((a, c) => a + c.ingreso, 0)
    const claimsGofo = porCiudad(claims || [], ciudad).reduce((a, c) => a + (c.montoGofo || 0), 0)
    ingresoNeto = entregas + claimsGofo
  }
  // Costo de managers de la ciudad:
  //   - un manager cuenta para la ciudad cuyo código coincide con el suyo;
  //   - un manager SIN ciudad (campo vacío) se atribuye a la ciudad PRINCIPAL, para no
  //     perderlo. Un manager con OTRA ciudad (aunque no esté en esta factura) NO se
  //     mezcla aquí: es de su ciudad, no de esta.
  const activosMgr = (managers || []).filter((m) => m.activo !== false)
  const sueldoDe = (arr) => arr.reduce((a, m) => a + (Number(m.sueldoSemanal) || 0), 0) * (semanas || 1)
  let cMgr
  // Filtro por chofer: un solo chofer no carga el sueldo de los managers (es un costo
  // de ciudad/empresa). Su ganancia = ingreso − pago − Gofo, sin overhead de managers.
  if (inv?.__choferScope) {
    cMgr = 0
  } else if (esTodas) {
    cMgr = sueldoDe(activosMgr)
  } else {
    const ciudadesInv = ciudadesDeFactura(inv)
    const principal = ciudadesInv[0]
    const match = activosMgr.filter((m) => (m.ciudad || '') === ciudad)
    const sinCiudad = ciudad === principal ? activosMgr.filter((m) => !(m.ciudad || '')) : []
    cMgr = sueldoDe([...match, ...sinCiudad])
  }
  const ganancia = ingresoNeto - costoChoferes - cMgr
  // Ajustes manuales incluidos en el pago a choferes (para transparencia contable).
  const totalPrestamo = pagos.reduce((a, p) => a + (Number(p.prestamo) || 0), 0)
  const totalBono = pagos.reduce((a, p) => a + (Number(p.bono) || 0), 0)
  return {
    ingresoNeto,
    costoChoferes,
    costoManagers: cMgr,
    gananciaReal: ganancia,
    margen: ingresoNeto > 0 ? ganancia / ingresoNeto : 0,
    ingresoAprox: !esTodas, // en una ciudad el ingreso neto es aproximado
    totalPrestamo,
    totalBono,
  }
}

// Desglose de ganancia real POR CIUDAD (una fila por ciudad de la factura).
export function desgloseGananciaCiudades(inv, claims, drivers, managers, semanas = 1, ajustesPorChofer = null) {
  return (inv?.resumenCiudades || [])
    .map((c) => {
      const g = gananciaRealDe(inv, claims, drivers, managers, c.ubicacion, semanas, ajustesPorChofer)
      return { code: c.ubicacion, nombreCiudad: nombreCiudadDe(inv, c.ubicacion), ...g }
    })
    .sort((a, b) => b.gananciaReal - a.gananciaReal)
}

// Economía de claims por MÉTODO (M1/M2/M3), evaluando CADA claim individualmente
// según su ciudad y categoría (NO multiplica todo × $100).
//   - Ganancia de un claim = feeDeClaim − |montoGofo|
//       M1: multa − montoGofo   |   M2: 0   |   M3: −montoGofo (perdón)
//   - Perdón MANUAL (c.perdonado) se trata como M3.
// `inv` = factura (para leer las reglas guardadas). Si no se pasa, todo es M1.
export function economiaClaims(claims, inv) {
  const validos = claimsValidos(claims)
  const total = validos.length
  // Por método: n (conteo), ganancia (fee−gofo), gofo (lo que Gofo descontó) y
  // cobrado (lo que le cobras al chofer). gofo/cobrado son informativos (no cambian
  // la ganancia); sirven para mostrar "lo que Gofo cobra" aunque la ganancia sea 0.
  const porMetodo = {
    M1: { n: 0, ganancia: 0, gofo: 0, cobrado: 0 },
    M2: { n: 0, ganancia: 0, gofo: 0, cobrado: 0 },
    M3: { n: 0, ganancia: 0, gofo: 0, cobrado: 0 },
  }
  let cobradoChoferes = 0
  let descontadoGofo = 0
  let perdidaAbsorbida = 0
  for (const c of validos) {
    const gofo = Math.abs(Number(c.montoGofo) || 0)
    descontadoGofo += gofo
    // Perdón manual = M3. Si no, el método resuelto por reglas.
    const m = c.perdonado ? 'M3' : (inv ? metodoDe(inv, c.ciudad, c) : METODO_CLAIM_DEFAULT)
    const fee = c.perdonado ? 0 : (inv ? feeDeClaim(inv, c.ciudad, c) : CLAIM_FEE)
    const ganancia = fee - gofo
    cobradoChoferes += fee
    porMetodo[m].n += 1
    porMetodo[m].ganancia += ganancia
    porMetodo[m].gofo += gofo
    porMetodo[m].cobrado += fee
    if (m === 'M3') perdidaAbsorbida += gofo
  }
  return {
    total,
    perdonados: porMetodo.M3.n,
    activos: total - porMetodo.M3.n,
    cobradoChoferes,
    descontadoGofo,
    perdidaAbsorbida,
    porMetodo,
    gananciaNetaClaims: cobradoChoferes - descontadoGofo,
  }
}

// ---- ranking de ciudades -----------------------------------------------------
// Calificación 0-100 por ciudad combinando ganancia, rentabilidad $/lb, calidad
// (claims), % fallidos (proxy = claims por ahora) y volumen. Pesos en constants.
// Funciona con una sola ciudad (los factores relativos quedan al 100%).
export function rankingCiudades(inv, claims, drivers, managers, semanas = 1) {
  const ciudades = inv?.resumenCiudades || []
  if (!ciudades.length) return []

  // Peso e ingreso por ciudad (desde rutas) para el $/lb.
  const pesoPorCiudad = {}, ingresoRutaPorCiudad = {}
  for (const r of inv?.resumenRutas || []) {
    pesoPorCiudad[r.ciudad] = (pesoPorCiudad[r.ciudad] || 0) + (r.pesoTotalLb || 0)
    ingresoRutaPorCiudad[r.ciudad] = (ingresoRutaPorCiudad[r.ciudad] || 0) + (r.ingreso || 0)
  }
  // Paquetes fallidos reales por ciudad (del reporte de fallidos, atribuidos a la
  // ciudad principal de cada chofer en resumenChoferes).
  const fallidosPorCiudad = {}
  for (const ch of inv?.resumenChoferes || []) fallidosPorCiudad[ch.ciudad] = (fallidosPorCiudad[ch.ciudad] || 0) + (Number(ch.fallidos) || 0)

  const base = ciudades.map((c) => {
    const code = c.ubicacion
    const claimsCiudad = porCiudad(claims, code)
    const numClaims = contarClaimsValidos(claimsCiudad)
    const g = gananciaRealDe(inv, claims, drivers, managers, code, semanas)
    const peso = pesoPorCiudad[code] || 0
    const precioLb = peso > 0 ? (ingresoRutaPorCiudad[code] || c.ingreso) / peso : 0
    const paquetes = c.paquetes || 0
    return {
      code,
      nombre: nombreCiudadDe(inv, code),
      paquetes,
      ingreso: c.ingreso,
      ingresoNeto: g.ingresoNeto,
      ganancia: g.gananciaReal,
      precioLb,
      numClaims,
      // Fallidos reales del reporte (antes se usaban los claims como proxy).
      fallidos: fallidosPorCiudad[code] || 0,
      pctClaims: paquetes > 0 ? numClaims / paquetes : 0,
    }
  })

  const maxGan = Math.max(...base.map((b) => b.ganancia), 0) || 1
  const maxLb = Math.max(...base.map((b) => b.precioLb), 0) || 1
  const maxPq = Math.max(...base.map((b) => b.paquetes), 0) || 1
  const w = PESOS_CALIF_CIUDAD

  return base
    .map((b) => {
      const gananciaScore = clamp(b.ganancia > 0 ? (b.ganancia / maxGan) * 100 : 0)
      const rentabilidadScore = clamp((b.precioLb / maxLb) * 100)
      const claimsPor100 = b.paquetes > 0 ? (b.numClaims / b.paquetes) * 100 : 0
      const calidadScore = clamp(100 - claimsPor100 * CALIDAD_FACTOR)
      const fallidosPor100 = b.paquetes > 0 ? (b.fallidos / b.paquetes) * 100 : 0
      const fallidosScore = clamp(100 - fallidosPor100 * CALIDAD_FACTOR)
      const volumenScore = clamp((b.paquetes / maxPq) * 100)
      const puntaje = Math.round(
        w.ganancia * gananciaScore + w.rentabilidad * rentabilidadScore + w.calidad * calidadScore + w.fallidos * fallidosScore + w.volumen * volumenScore
      )
      const nivel = puntaje >= UMBRALES_CALIF.bueno ? 'bueno' : puntaje >= UMBRALES_CALIF.regular ? 'regular' : 'malo'
      return {
        ...b,
        gananciaScore, rentabilidadScore, calidadScore, fallidosScore, volumenScore,
        puntaje,
        nivel,
        etiqueta: nivel === 'bueno' ? 'Buena' : nivel === 'regular' ? 'Regular' : 'Mala',
        desglose: `Ganancia ${nivelSub(gananciaScore)} · Calidad ${nivelSub(calidadScore)} · $/lb ${nivelSub(rentabilidadScore)} · Volumen ${nivelSub(volumenScore)}`,
      }
    })
    .sort((a, b) => b.puntaje - a.puntaje)
}

// ---- ranking de claims por tipo ----------------------------------------------

// Etiquetas en español para los tipos de claim conocidos (Claim Type de Gofo).
// Se comparan en minúsculas; los tipos no listados se muestran tal cual.
const ETIQUETAS_CLAIM = {
  'tracking interruption': 'Interrupción de tracking',
  'fake pod': 'POD falso',
  'damaged item': 'Artículo dañado',
  'lost': 'Perdido',
}
export function etiquetaTipoClaim(tipo) {
  if (!tipo) return 'Sin tipo'
  return ETIQUETAS_CLAIM[String(tipo).trim().toLowerCase()] || String(tipo).trim()
}

// Ranking de choferes por TIPO de claim, a partir del detalle de claims
// (Claim Type + Courier). Detecta los tipos dinámicamente.
// Devuelve:
//   tipos  : [{ key, raw, label }]  tipos presentes (orden alfabético por etiqueta)
//   matriz : [{ courier, total, porTipo: { [key]: n } }]  ordenado por total desc
//   porTipo: { [key]: [{ courier, n }] }  ranking por cada tipo (desc)
export function rankingClaimsPorTipo(claims) {
  const lista = claimsValidos(claims)
  const tiposMap = new Map() // key normalizado -> etiqueta cruda representativa
  const porCourier = {}
  for (const c of lista) {
    const raw = (c.claimType || 'Sin tipo').trim() || 'Sin tipo'
    const key = raw.toLowerCase()
    if (!tiposMap.has(key)) tiposMap.set(key, raw)
    const courier = c.courier || '—'
    if (!porCourier[courier]) porCourier[courier] = { courier, total: 0, porTipo: {} }
    porCourier[courier].porTipo[key] = (porCourier[courier].porTipo[key] || 0) + 1
    porCourier[courier].total += 1
  }
  const tipos = [...tiposMap.entries()]
    .map(([key, raw]) => ({ key, raw, label: etiquetaTipoClaim(raw) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const matriz = Object.values(porCourier).sort((a, b) => b.total - a.total || a.courier.localeCompare(b.courier))
  const porTipo = {}
  for (const t of tipos) {
    porTipo[t.key] = matriz
      .map((m) => ({ courier: m.courier, n: m.porTipo[t.key] || 0 }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n || a.courier.localeCompare(b.courier))
  }
  return { tipos, matriz, porTipo }
}

// ---- rankings ----------------------------------------------------------------

// Rankings de choferes (productividad, ganancia, calidad) con filtro de ciudad.
export function rankingsChoferes(inv, claims, drivers, ciudad) {
  const pagos = calcularPagos(inv, claims, drivers, ciudad)
  const productividad = [...pagos].sort((a, b) => b.ingreso - a.ingreso)
  const ganancia = [...pagos].sort((a, b) => b.ganancia - a.ganancia)
  const calidad = [...pagos].sort((a, b) => a.claimsTotales - b.claimsTotales) // menos claims = mejor
  return { pagos, productividad, ganancia, calidad }
}

// Rankings de rutas (por claims, por ingreso, por ganancia estimada, por $/lb).
export function rankingsRutas(inv, drivers, ciudad) {
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad).map((r) => {
    // costo estimado de la ruta: no tenemos el desglose de choferes por ruta en el
    // resumen guardado, así que estimamos con la tarifa promedio de individuales/dobles.
    return { ...r, nombreCiudad: nombreCiudad(r.ciudad) }
  })
  return {
    porClaims: [...rutas].sort((a, b) => (b.numClaims || 0) - (a.numClaims || 0)),
    porIngreso: [...rutas].sort((a, b) => b.ingreso - a.ingreso),
    porPrecioLb: [...rutas].sort((a, b) => (b.precioPorLb || 0) - (a.precioPorLb || 0)),
  }
}

// ---- análisis de rutas -------------------------------------------------------

// Tarifa promedio (individual/doble) de los choferes que operan en una ciudad.
// Si no hay datos de esa ciudad, cae al promedio de todos los choferes activos.
// (La factura solo guarda el agregado por ruta, no el desglose chofer×ruta, por
// eso el costo por ruta se estima con la tarifa promedio de su ciudad.)
export function tarifaPromedio(drivers, resumenChoferes, ciudad) {
  const media = (arr, f) => { const v = arr.map(f).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
  const chof = (resumenChoferes || []).filter((c) => !ciudad || c.ciudad === ciudad)
  const tarifas = chof.map((c) => buscarDriver(drivers, c.nombre)).filter(Boolean)
  let ind = media(tarifas, (d) => Number(d.precioIndividual) || 0)
  let dob = media(tarifas, (d) => Number(d.precioDoble) || 0)
  if (!ind || !dob) {
    const act = (drivers || []).filter((d) => d.activo !== false)
    if (!ind) ind = media(act, (d) => Number(d.precioIndividual) || 0)
    if (!dob) dob = media(act, (d) => Number(d.precioDoble) || 0)
  }
  return { ind, dob }
}

// Rutas con costo de choferes estimado, ganancia, $/paquete, $/lb y calidad.
export function rutasConGanancia(inv, drivers, ciudad) {
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad)
  const rc = inv?.resumenChoferes || []
  return rutas.map((r) => {
    const paquetes = r.paquetes || (r.individuales + r.dobles)
    const t = tarifaPromedio(drivers, rc, r.ciudad)
    const costoChoferes = r.individuales * t.ind + r.dobles * t.dob
    const ganancia = r.ingreso - costoChoferes
    return {
      ...r,
      paquetes,
      precioPorPaquete: r.precioPorPaquete != null ? r.precioPorPaquete : (paquetes > 0 ? r.ingreso / paquetes : 0),
      precioPorLb: r.precioPorLb != null ? r.precioPorLb : (r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0),
      tarifaIndProm: t.ind,
      tarifaDobleProm: t.dob,
      costoChoferes,
      ganancia,
      margen: r.ingreso > 0 ? ganancia / r.ingreso : 0,
      calidad: paquetes > 0 ? 1 - (r.numClaims || 0) / paquetes : 1,
      nombreCiudad: r.nombreCiudad || nombreCiudad(r.ciudad),
    }
  })
}

// ---- alertas de cambio de precio ---------------------------------------------

// Compara precios por ruta de la factura nueva vs la anterior. Devuelve las rutas
// cuyo $/lb o $/paquete cambió más del umbral (±5% por defecto).
export function alertasCambioPrecio(invNueva, invAnterior, umbral = UMBRAL_CAMBIO_PRECIO) {
  if (!invNueva || !invAnterior) return []
  const anterioresPorRuta = {}
  for (const r of invAnterior.resumenRutas || []) anterioresPorRuta[r.ruta] = r
  const alertas = []
  for (const r of invNueva.resumenRutas || []) {
    const prev = anterioresPorRuta[r.ruta]
    if (!prev) continue
    const cambio = (nuevo, viejo) => (viejo > 0 ? (nuevo - viejo) / viejo : 0)
    const dLb = cambio(r.precioPorLb, prev.precioPorLb)
    const dPq = cambio(r.precioPorPaquete, prev.precioPorPaquete)
    if (Math.abs(dLb) >= umbral || Math.abs(dPq) >= umbral) {
      alertas.push({
        ruta: r.ruta,
        ciudad: r.ciudad,
        nombreCiudad: nombreCiudad(r.ciudad),
        antesLb: prev.precioPorLb,
        ahoraLb: r.precioPorLb,
        cambioLb: dLb,
        antesPq: prev.precioPorPaquete,
        ahoraPq: r.precioPorPaquete,
        cambioPq: dPq,
      })
    }
  }
  return alertas.sort((a, b) => Math.abs(b.cambioLb) - Math.abs(a.cambioLb))
}
