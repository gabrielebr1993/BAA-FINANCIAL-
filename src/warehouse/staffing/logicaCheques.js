// ============================================================================
// LÓGICA PURA de control y conciliación de CHEQUES (sin Firebase: testeable).
//
// Dos fuentes:
//  A) Historial de EMISIÓN (mi sistema de impresión): número → beneficiario.
//  B) Reporte BANCARIO: números cobrados (y a veces importe/fecha/cuenta).
//
// Reglas del dueño:
// · El número es un identificador: se normalizan ceros a la izquierda de forma
//   consistente, conservando el número original.
// · Cruce por número + cuenta cuando ambas existan.
// · Número que coincide con VARIOS cheques → revisión (no se concilia solo).
// · Importes se verifican cuando ambos archivos los traen; si el banco solo
//   trae números, se concilian coincidencias únicas y queda registrado que el
//   importe no se verificó.
// · El cobro ACTUALIZA el cheque emitido; nunca crea un segundo pago.
// · Ausencia en el banco ≠ cancelado. Cancelar requiere acción explícita.
// · Un cheque CANCELADO que aparece cobrado → alerta.
// ============================================================================
import { normalizarNombre, hashContenido } from './parserGofo'

export function normalizarNumero(n) {
  const s = String(n == null ? '' : n).trim().replace(/[^\d]/g, '')
  const sinCeros = s.replace(/^0+/, '')
  return sinCeros || (s ? '0' : '')
}
export function normalizarCuenta(c) {
  return String(c == null ? '' : c).trim().replace(/[^\dA-Za-z]/g, '').toUpperCase()
}
export function idCheque(numero, cuenta) {
  const num = normalizarNumero(numero)
  const cta = normalizarCuenta(cuenta)
  return `chq_${cta || 'SINCTA'}_${num}`
}
export function huellaFilaBanco(fila) {
  return hashContenido([normalizarNumero(fila.numero), fila.importe ?? '', fila.fechaCobro ?? '', normalizarCuenta(fila.cuenta)])
}

// Adivina el mapeo de columnas por los encabezados (el usuario lo confirma).
export function adivinarMapeo(encabezados) {
  const buscar = (rx) => {
    const i = encabezados.findIndex((h) => rx.test(String(h || '').toLowerCase()))
    return i >= 0 ? i : null
  }
  return {
    numero: buscar(/check\s*(no|num|#)|cheque|number|núm|^no\.?$|^#$/),
    beneficiario: buscar(/payee|beneficiari|name|nombre|pay\s*to/),
    importe: buscar(/amount|importe|monto|total/),
    fecha: buscar(/date|fecha/),
    cuenta: buscar(/account|cuenta|bank\s*acc/),
    periodo: buscar(/period|periodo|memo|week|semana/),
    estado: buscar(/status|estado/),
  }
}

// Concilia filas del reporte bancario contra los cheques existentes.
// cheques: array de documentos {id, numeroNorm, cuentaNorm, importe, estado, cobro, huellasBanco[]}
// Devuelve acciones (no muta): cobros confirmados, diferencias, ambiguos,
// sin identificar, duplicados ignorados y alertas de cancelados cobrados.
export function conciliarBanco(filasBanco, cheques) {
  const acciones = { cobros: [], diferencias: [], ambiguos: [], sinIdentificar: [], yaConciliados: [], alertas: [] }
  for (const fila of filasBanco) {
    const num = normalizarNumero(fila.numero)
    if (!num) { acciones.sinIdentificar.push({ fila, motivo: 'sin número de cheque' }); continue }
    const cta = normalizarCuenta(fila.cuenta)
    const huella = huellaFilaBanco(fila)
    let candidatos = cheques.filter((c) => c.numeroNorm === num)
    if (cta) {
      const conCuenta = candidatos.filter((c) => c.cuentaNorm === cta)
      // si el banco trae cuenta y hay cheques con esa cuenta, se exige la cuenta
      if (conCuenta.length) candidatos = conCuenta
    }
    if (!candidatos.length) { acciones.sinIdentificar.push({ fila, motivo: `el cheque ${num} no está en el historial de emisión` }); continue }
    if (candidatos.length > 1) { acciones.ambiguos.push({ fila, motivo: `el número ${num} coincide con ${candidatos.length} cheques`, candidatos: candidatos.map((c) => c.id) }); continue }
    const ch = candidatos[0]
    if ((ch.huellasBanco || []).includes(huella)) { acciones.yaConciliados.push({ fila, chequeId: ch.id }); continue }
    if (ch.estado === 'cancelado') { acciones.alertas.push({ fila, chequeId: ch.id, motivo: `el cheque ${num} está CANCELADO pero el banco lo reporta cobrado` }); continue }
    // verificación de importe cuando ambos lo traen
    if (fila.importe != null && ch.importe != null && Math.abs(Number(fila.importe) - Number(ch.importe)) > 0.009) {
      acciones.diferencias.push({ fila, chequeId: ch.id, motivo: `importe del banco $${Number(fila.importe).toFixed(2)} ≠ emitido $${Number(ch.importe).toFixed(2)}`, huella })
      continue
    }
    acciones.cobros.push({
      chequeId: ch.id,
      huella,
      cobro: {
        fecha: fila.fechaCobro || null,
        importe: fila.importe != null ? Number(fila.importe) : null,
        importeVerificado: fila.importe != null && ch.importe != null,
      },
    })
  }
  return acciones
}

// Vincula un beneficiario con un trabajador por nombre normalizado + alias.
// Devuelve { workerId } con coincidencia ÚNICA, o { ambiguo: [...] } / null.
export function vincularBeneficiario(beneficiario, workers) {
  const norm = normalizarNombre(beneficiario)
  if (!norm) return null
  const coincidencias = workers.filter((w) => w.nombreNorm === norm || (w.alias || []).includes(norm))
  if (coincidencias.length === 1) return { workerId: coincidencias[0].id }
  if (coincidencias.length > 1) return { ambiguo: coincidencias.map((w) => w.id) }
  return null
}

// Valida una distribución de un cheque entre semanas: nunca más que el importe.
export function validarDistribucion(importeCheque, distribucion) {
  const suma = (distribucion || []).reduce((s, d) => s + (Number(d.importe) || 0), 0)
  return {
    suma: Math.round(suma * 100) / 100,
    valida: suma <= (Number(importeCheque) || 0) + 0.009 && (distribucion || []).every((d) => Number(d.importe) > 0 && d.periodoId),
    restante: Math.round(((Number(importeCheque) || 0) - suma) * 100) / 100,
  }
}
