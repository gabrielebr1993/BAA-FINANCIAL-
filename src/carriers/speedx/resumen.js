// ============================================================================
// SPEEDX · RESUMEN de la factura — produce EXACTAMENTE la misma estructura que
// el resumen de Gofo (construirResumen de utils/excel), para que Dashboard,
// Financiero, Pagos, Performance, Rutas, perfiles, etc. funcionen SIN CAMBIOS.
//
// Clasificación (MISMO concepto que Gofo, confirmado por el dueño):
//   · individuales = primer paquete de cada parada (entrega normal)
//   · dobles       = paquete ADICIONAL de la misma parada (SpeedX lo paga a
//                    la tarifa de stop, ~$0.45; en la factura viene con el
//                    ajuste "Pay per stop adj." negativo)
//   · menor1Lb / mayor1Lb = conteo POR PESO (informativo: es como FACTURA
//     SpeedX y como reporta su "Driver Summary"; no cambia el pago del chofer)
//   · temu = marcador informativo (no cambia tarifas)
// En Gofo los campos extra no existen y todo suma 0 (compatibilidad total).
// ============================================================================
import { nombreCiudad } from '../../constants'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// `p` = salida de procesarArchivoSpeedX. `nombreMap` (opcional) = nombres de
// ciudades personalizadas de la empresa ({ codigo: nombre }).
export function construirResumenSpeedX(p, nombreMap = null) {
  const nombreDe = (code) => (nombreMap && nombreMap[code]) || nombreCiudad(code)
  const porChofer = {}
  const porChoferRuta = {}
  const porRuta = {}
  const porCiudad = {}

  let totalPaquetes = 0
  let totalIndividuales = 0
  let totalDobles = 0
  let totalMenor1Lb = 0
  let totalMayor1Lb = 0
  let totalTemu = 0
  let ingresoTotal = 0

  for (const d of p.detalles) {
    // DOBLE = paquete adicional de la misma parada (ajuste de stop negativo).
    const esDoble = d.esStopAdicional
    totalPaquetes += 1
    ingresoTotal += d.monto
    if (esDoble) totalDobles += 1
    else totalIndividuales += 1
    if (d.esMenor1Lb) totalMenor1Lb += 1
    else totalMayor1Lb += 1
    if (d.temu) totalTemu += 1

    const ck = `${d.courier}||${d.ciudad}`
    if (!porChofer[ck]) porChofer[ck] = { nombre: d.courier, ciudad: d.ciudad, individuales: 0, dobles: 0, menor1Lb: 0, mayor1Lb: 0, temu: 0, ingreso: 0, numClaims: 0 }
    const c = porChofer[ck]
    c.ingreso += d.monto
    if (esDoble) c.dobles += 1
    else c.individuales += 1
    if (d.esMenor1Lb) c.menor1Lb += 1
    else c.mayor1Lb += 1
    if (d.temu) c.temu += 1

    const crk = `${d.courier}||${d.ruta}`
    if (!porChoferRuta[crk]) porChoferRuta[crk] = { nombre: d.courier, ruta: d.ruta, ciudad: d.ciudad, individuales: 0, dobles: 0, ingreso: 0 }
    const cr = porChoferRuta[crk]
    cr.ingreso += d.monto
    if (esDoble) cr.dobles += 1
    else cr.individuales += 1

    if (!porRuta[d.ruta]) porRuta[d.ruta] = { ruta: d.ruta, ciudad: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, pesoTotalLb: 0 }
    const r = porRuta[d.ruta]
    r.paquetes += 1
    r.ingreso += d.monto
    r.pesoTotalLb += d.peso || 0
    if (esDoble) r.dobles += 1
    else r.individuales += 1

    if (!porCiudad[d.ciudad]) porCiudad[d.ciudad] = { ubicacion: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, _choferes: new Set(), _rutas: new Set() }
    const ci = porCiudad[d.ciudad]
    ci.paquetes += 1
    ci.ingreso += d.monto
    ci._choferes.add(d.courier)
    ci._rutas.add(d.ruta)
    if (esDoble) ci.dobles += 1
    else ci.individuales += 1
  }

  // Claims por chofer / ciudad (los claims de SpeedX vienen con courier + ciudad).
  for (const c of p.claims) {
    const ck = `${c.courier}||${c.ciudad || ''}`
    if (porChofer[ck]) porChofer[ck].numClaims += 1
    else {
      const alt = Object.values(porChofer).find((x) => x.nombre === c.courier)
      if (alt) alt.numClaims += 1
    }
    if (porCiudad[c.ciudad]) porCiudad[c.ciudad].numClaims += 1
  }

  // VERIFICACIÓN chofer a chofer contra el "Driver Summary" de SpeedX:
  // compensación total Y conteos por peso (SpeedX reporta <1/≥1 lb con los
  // stops incluidos en su rango). Si algo no coincide, se avisa (no bloquea:
  // la fuente de verdad es el PLD que SpeedX facturó).
  const avisos = []
  const norm = (n) => (n || '').trim().toLowerCase()
  const acum = {}
  for (const c of Object.values(porChofer)) {
    const k = norm(c.nombre)
    acum[k] = acum[k] || { ingreso: 0, men1: 0, may1: 0 }
    acum[k].ingreso = r2(acum[k].ingreso + c.ingreso)
    acum[k].men1 += c.menor1Lb
    acum[k].may1 += c.mayor1Lb
  }
  for (const ds of p.driverSummary || []) {
    const a = acum[norm(ds.courier)]
    if (!a) { avisos.push(`El chofer "${ds.courier}" aparece en el Driver Summary pero no en el detalle PLD.`); continue }
    if (Math.abs(a.ingreso - r2(ds.compensacionCarrier)) >= 0.01) {
      avisos.push(`Compensación de "${ds.courier}" no cuadra con el Driver Summary: detalle $${a.ingreso.toFixed(2)} vs resumen $${r2(ds.compensacionCarrier).toFixed(2)}.`)
    }
    if ((Number.isFinite(ds.menor1) && a.men1 !== ds.menor1) || (Number.isFinite(ds.mayor1) && a.may1 !== ds.mayor1)) {
      avisos.push(`Conteo por peso de "${ds.courier}" no cuadra con el Driver Summary: <1 lb ${a.men1} vs ${ds.menor1} · ≥1 lb ${a.may1} vs ${ds.mayor1}.`)
    }
  }

  const claimsPorRuta = {}
  for (const c of p.claims) if (c.ruta) claimsPorRuta[c.ruta] = (claimsPorRuta[c.ruta] || 0) + 1
  const resumenRutas = Object.values(porRuta).map((r) => ({
    ...r,
    precioPorLb: r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0,
    precioPorPaquete: r.paquetes > 0 ? r.ingreso / r.paquetes : 0,
    numClaims: claimsPorRuta[r.ruta] || 0,
  }))
  const resumenCiudades = Object.values(porCiudad).map((c) => ({
    ubicacion: c.ubicacion,
    nombreCiudad: nombreDe(c.ubicacion),
    paquetes: c.paquetes,
    individuales: c.individuales,
    dobles: c.dobles,
    ingreso: r2(c.ingreso),
    numClaims: c.numClaims,
    numChoferes: c._choferes.size,
    numRutas: c._rutas.size,
  }))
  const resumenChoferes = Object.values(porChofer).map((c) => ({ ...c, ingreso: r2(c.ingreso), nombreCiudad: nombreDe(c.ciudad) }))

  const totalClaims = p.claims.length
  const totalDescuentoGofo = r2(p.claims.reduce((a, c) => a + c.montoGofo, 0)) // negativo

  // VERIFICACIÓN en el MISMO formato que Gofo (Financiero/Facturas la leen tal
  // cual): entregas + claims (negativos) + ajustes de semanas previas = neto, y
  // se compara contra el TOTAL PAYMENT oficial del DSP Summary.
  const o = p.oficial
  const v = p.verificacion
  const verificacion = {
    sumaEntregas: v.sumaDetalle,
    sumaOffset: r2(o?.claimPrevio || 0),   // ajuste de claims de la semana previa
    sumaClaims: totalDescuentoGofo,        // claims de ESTA semana (negativo)
    sumaAjustes: r2(o?.ajustePrevio || 0), // ajuste de pago de la semana previa
    netoCalculado: v.totalCalculado,
    gofo: {
      totalGofo: r2(o?.totalPago ?? v.totalCalculado),
      claim: totalDescuentoGofo,
      ajuste: r2(o?.ajustePrevio || 0),
      offset: r2(o?.claimPrevio || 0),
      numDeliveries: o?.pcs ?? totalPaquetes,
      first: totalIndividuales,
      subsequent: totalDobles,
      disponible: !!o,
    },
    diferencia: v.difMonto ?? 0,
    cuadra: o ? v.cuadra : null,
  }

  return {
    totalPaquetes,
    totalIndividuales,
    totalDobles,
    totalMenor1Lb,
    totalMayor1Lb,
    totalTemu,
    ingresoTotal: r2(ingresoTotal),
    numChoferes: new Set(p.detalles.map((d) => d.courier)).size,
    numRutas: Object.keys(porRuta).length,
    totalClaims,
    totalDescuentoGofo,
    resumenChoferes,
    resumenChoferRuta: Object.values(porChoferRuta).map((c) => ({ ...c, ingreso: r2(c.ingreso) })),
    resumenRutas,
    resumenCiudades,
    verificacion,
    avisos,
  }
}
