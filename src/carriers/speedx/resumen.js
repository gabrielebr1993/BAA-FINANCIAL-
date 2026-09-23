// ============================================================================
// SPEEDX · RESUMEN de la factura — produce EXACTAMENTE la misma estructura que
// el resumen de Gofo (construirResumen de utils/excel), para que Dashboard,
// Financiero, Pagos, Performance, Rutas, perfiles, etc. funcionen SIN CAMBIOS.
//
// Diferencias de SpeedX (aditivas, no rompen nada):
//   · individuales = paquetes <1 lb (primera entrega de la parada)
//   · dobles       = paquetes ≥1 lb (primera entrega de la parada)
//   · stopAdicionales = paquetes ADICIONALES de una misma parada (tarifa stop)
//   · temu         = marcador informativo (no cambia tarifas)
// En Gofo esos campos extra no existen y todo suma 0 (compatibilidad total).
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
  let totalStopAdicionales = 0
  let totalTemu = 0
  let ingresoTotal = 0

  for (const d of p.detalles) {
    // Clasificación de pago: stop adicional > peso. TEMU es solo marcador.
    const tipo = d.esStopAdicional ? 'stop' : d.esMenor1Lb ? 'ind' : 'dob'
    totalPaquetes += 1
    ingresoTotal += d.monto
    if (tipo === 'ind') totalIndividuales += 1
    else if (tipo === 'dob') totalDobles += 1
    else totalStopAdicionales += 1
    if (d.temu) totalTemu += 1

    const ck = `${d.courier}||${d.ciudad}`
    if (!porChofer[ck]) porChofer[ck] = { nombre: d.courier, ciudad: d.ciudad, individuales: 0, dobles: 0, stopAdicionales: 0, temu: 0, ingreso: 0, numClaims: 0 }
    const c = porChofer[ck]
    c.ingreso += d.monto
    if (tipo === 'ind') c.individuales += 1
    else if (tipo === 'dob') c.dobles += 1
    else c.stopAdicionales += 1
    if (d.temu) c.temu += 1

    const crk = `${d.courier}||${d.ruta}`
    if (!porChoferRuta[crk]) porChoferRuta[crk] = { nombre: d.courier, ruta: d.ruta, ciudad: d.ciudad, individuales: 0, dobles: 0, stopAdicionales: 0, ingreso: 0 }
    const cr = porChoferRuta[crk]
    cr.ingreso += d.monto
    if (tipo === 'ind') cr.individuales += 1
    else if (tipo === 'dob') cr.dobles += 1
    else cr.stopAdicionales += 1

    if (!porRuta[d.ruta]) porRuta[d.ruta] = { ruta: d.ruta, ciudad: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, stopAdicionales: 0, ingreso: 0, pesoTotalLb: 0 }
    const r = porRuta[d.ruta]
    r.paquetes += 1
    r.ingreso += d.monto
    r.pesoTotalLb += d.peso || 0
    if (tipo === 'ind') r.individuales += 1
    else if (tipo === 'dob') r.dobles += 1
    else r.stopAdicionales += 1

    if (!porCiudad[d.ciudad]) porCiudad[d.ciudad] = { ubicacion: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, _choferes: new Set(), _rutas: new Set() }
    const ci = porCiudad[d.ciudad]
    ci.paquetes += 1
    ci.ingreso += d.monto
    ci._choferes.add(d.courier)
    ci._rutas.add(d.ruta)
    if (tipo === 'dob') ci.dobles += 1
    else ci.individuales += 1 // en la vista por ciudad los stops cuentan como paquete sencillo
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

  // VERIFICACIÓN chofer a chofer contra el "Driver Summary" de SpeedX: si la
  // compensación calculada del detalle no coincide con la del resumen oficial,
  // se avisa (no se bloquea: la fuente de verdad es el PLD que SpeedX facturó).
  const avisos = []
  const norm = (n) => (n || '').trim().toLowerCase()
  const compCalc = {}
  for (const c of Object.values(porChofer)) compCalc[norm(c.nombre)] = r2((compCalc[norm(c.nombre)] || 0) + c.ingreso)
  for (const ds of p.driverSummary || []) {
    const calc = compCalc[norm(ds.courier)]
    if (calc === undefined) { avisos.push(`El chofer "${ds.courier}" aparece en el Driver Summary pero no en el detalle PLD.`); continue }
    if (Math.abs(calc - r2(ds.compensacionCarrier)) >= 0.01) {
      avisos.push(`Compensación de "${ds.courier}" no cuadra con el Driver Summary: detalle $${calc.toFixed(2)} vs resumen $${r2(ds.compensacionCarrier).toFixed(2)}.`)
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
    totalStopAdicionales,
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
