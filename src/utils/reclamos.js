// Detección de reclamos a Gofo + generación de reportes descargables.
// Todo es NUEVO y aislado; no modifica la lógica de lectura ni la verificación.
import { porCiudad, claimsValidos, detectarClaimsRepetidos, alertasCambioPrecio } from './calc'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'

const abs = (n) => Math.abs(Number(n) || 0)

// 1) Facturas cuyo neto no cuadra con el Total Billing de Gofo (dif > $0.01).
//    Devuelve el desglose línea a línea (nuestro vs Gofo) y en qué línea está la diferencia.
export function facturasQueNoCuadran(invoices) {
  const res = []
  for (const inv of invoices || []) {
    const v = inv.verificacion
    if (!v || !v.gofo?.disponible) continue
    if (abs(v.diferencia) <= 0.01) continue
    const gEntregas = (v.gofo.totalGofo || 0) - (v.gofo.offset || 0) - (v.gofo.claim || 0) - (v.gofo.ajuste || 0)
    const lineas = [
      { linea: 'Entregas', nuestro: v.sumaEntregas || 0, gofo: gEntregas },
      { linea: 'Offset', nuestro: v.sumaOffset || 0, gofo: v.gofo.offset || 0 },
      { linea: 'Claims', nuestro: v.sumaClaims || 0, gofo: v.gofo.claim || 0 },
      { linea: 'Ajustes', nuestro: v.sumaAjustes || 0, gofo: v.gofo.ajuste || 0 },
    ].map((l) => ({ ...l, dif: l.nuestro - l.gofo }))
    const lineaPrincipal = [...lineas].sort((a, b) => abs(b.dif) - abs(a.dif))[0]
    res.push({
      tipo: 'cuadre',
      invoiceId: inv.id,
      semana: inv.semana || '',
      referencia: inv.archivoNombre || inv.semana || inv.id,
      lineas,
      lineaPrincipal,
      netoNuestro: v.netoCalculado || 0,
      totalGofo: v.gofo.totalGofo || 0,
      diferencia: v.diferencia || 0,
      disputa: abs(v.diferencia),
    })
  }
  return res.sort((a, b) => b.disputa - a.disputa)
}

// 2) Rutas donde Gofo cambió el $/lb o $/paquete más de ±umbral vs. la factura anterior,
//    con el impacto en dinero (positivo = ahora te pagan menos → dinero en disputa).
export function cambiosDePrecio(invNueva, invAnterior, ciudad, umbral = UMBRAL_CAMBIO_PRECIO) {
  if (!invNueva || !invAnterior) return []
  const alertas = alertasCambioPrecio(invNueva, invAnterior, umbral)
  const rutas = porCiudad(invNueva.resumenRutas || [], ciudad)
  const pqPorRuta = {}
  rutas.forEach((r) => { pqPorRuta[r.ruta] = r.paquetes || 0 })
  const rutasSet = new Set(rutas.map((r) => r.ruta))
  return alertas
    .filter((a) => rutasSet.has(a.ruta))
    .map((a) => {
      const paquetes = pqPorRuta[a.ruta] || 0
      const impacto = (a.antesPq - a.ahoraPq) * paquetes
      return { tipo: 'precio', ...a, paquetes, impacto, disputa: abs(impacto) }
    })
    .sort((a, b) => b.disputa - a.disputa)
}

// 3) Claims sospechosos: montos inusualmente altos o reversiones que no cancelan el claim.
export function claimsSospechosos(claims) {
  const validos = claimsValidos(claims)
  const out = []
  if (validos.length) {
    const montos = validos.map((c) => abs(c.montoGofo)).sort((a, b) => a - b)
    const mediana = montos[Math.floor(montos.length / 2)] || 0
    const umbral = Math.max(50, mediana * 3)
    validos
      .filter((c) => abs(c.montoGofo) >= umbral)
      .forEach((c) =>
        out.push({ tipo: 'claim', motivo: 'Monto inusualmente alto de Gofo', waybill: c.waybill, courier: c.courier, claimType: c.claimType, montoGofo: c.montoGofo, umbral, disputa: abs(c.montoGofo) })
      )
  }
  // reversiones desbalanceadas (par claim+reversión que no suma cero)
  detectarClaimsRepetidos(claims).forEach((g) => {
    const suma = g.claims.reduce((a, c) => a + (Number(c.montoGofo) || 0), 0)
    if (abs(suma) > 0.01) {
      out.push({ tipo: 'reversion', motivo: 'Reversión que no cancela el claim', waybill: g.waybill, courier: g.courier, claimType: g.claims.map((c) => c.claimType).join(' / '), montoGofo: suma, disputa: abs(suma) })
    }
  })
  return out.sort((a, b) => b.disputa - a.disputa)
}

// Total de dinero en disputa del periodo (todas las categorías).
export function totalEnDisputa(cuadres, precios, sospechosos) {
  const s = (arr) => (arr || []).reduce((a, x) => a + (x.disputa || 0), 0)
  return s(cuadres) + s(precios) + s(sospechosos)
}

// ---------------------------------------------------------------------------
// Generación del reporte de reclamo (PDF con jsPDF; Excel de respaldo).
// ---------------------------------------------------------------------------
const NAVY = [19, 35, 63]
const GOLD = [201, 162, 75]
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Construye título, filas de tabla y texto formal según el tipo de hallazgo.
function armarContenido(h, meta) {
  if (h.tipo === 'cuadre') {
    return {
      asunto: `Descuadre de facturación — ${h.referencia}`,
      head: ['Línea', 'Nuestro cálculo', 'Total de Gofo', 'Diferencia'],
      body: [
        ...h.lineas.map((l) => [l.linea, money(l.nuestro), money(l.gofo), money(l.dif)]),
        ['TOTAL / NETO', money(h.netoNuestro), money(h.totalGofo), money(h.diferencia)],
      ],
      texto:
        `Hemos conciliado la facturación de la semana ${h.semana || meta.semana} y detectamos una diferencia de ${money(h.diferencia)} ` +
        `entre nuestro neto calculado (${money(h.netoNuestro)}) y el Total Billing de Gofo (${money(h.totalGofo)}). ` +
        `La discrepancia principal se encuentra en la línea "${h.lineaPrincipal?.linea}" (${money(h.lineaPrincipal?.dif)}). ` +
        `Solicitamos la revisión y corrección de dicho monto.`,
    }
  }
  if (h.tipo === 'precio') {
    return {
      asunto: `Cambio de precio no acordado — ruta ${h.ruta}`,
      head: ['Ruta', 'Antes ($/paq)', 'Ahora ($/paq)', 'Paquetes', 'Impacto'],
      body: [[h.ruta, money(h.antesPq), money(h.ahoraPq), String(h.paquetes), money(h.impacto)]],
      texto:
        `En la ruta ${h.ruta} (${h.nombreCiudad || ''}) el precio por paquete cambió de ${money(h.antesPq)} a ${money(h.ahoraPq)} ` +
        `(${(h.cambioPq * 100).toFixed(1)}%) respecto a la factura anterior, con un impacto estimado de ${money(h.impacto)} sobre ${h.paquetes} paquetes. ` +
        `Solicitamos aclaración o corrección de este cambio de tarifa.`,
    }
  }
  // claim / reversión
  return {
    asunto: `Claim en disputa — ${h.waybill}`,
    head: ['Waybill', 'Chofer', 'Tipo', 'Monto de Gofo', 'En disputa'],
    body: [[h.waybill, h.courier, h.claimType || '—', money(h.montoGofo), money(h.disputa)]],
    texto:
      `Detectamos un claim con ${h.motivo.toLowerCase()} (waybill ${h.waybill}, chofer ${h.courier}). ` +
      `Gofo aplicó un monto de ${money(h.montoGofo)}. Solicitamos la revisión y, de proceder, el reembolso de ${money(h.disputa)}.`,
  }
}

// Descarga el reporte formal de un hallazgo. Intenta PDF; si falla, Excel.
export async function descargarReporteReclamo(h, meta = {}) {
  const c = armarContenido(h, meta)
  const nombre = `reclamo_gofo_${(h.referencia || h.waybill || h.ruta || 'periodo')}`.replace(/[^\w-]+/g, '_').slice(0, 60)
  try {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const ancho = doc.internal.pageSize.getWidth()
    // encabezado con branding navy/dorado
    doc.setFillColor(...NAVY); doc.rect(0, 0, ancho, 56, 'F')
    doc.setFillColor(...GOLD); doc.rect(0, 56, ancho, 4, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text('Gofo', 40, 36)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12)
    doc.text('Reclamo formal a Gofo', 96, 36)

    let y = 88
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(c.asunto, 40, y); y += 20
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60)
    const metaLinea = [
      meta.empresa ? `Empresa: ${meta.empresa}` : null,
      (h.semana || meta.semana) ? `Semana: ${h.semana || meta.semana}` : null,
      h.referencia ? `Referencia (Bill/Archivo): ${h.referencia}` : null,
      meta.fecha ? `Fecha: ${meta.fecha}` : null,
    ].filter(Boolean).join('   ·   ')
    if (metaLinea) { doc.text(metaLinea, 40, y); y += 18 }

    autoTable(doc, {
      startY: y + 2,
      head: [c.head],
      body: c.body,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      alternateRowStyles: { fillColor: [244, 245, 247] },
      margin: { left: 40, right: 40 },
    })
    y = doc.lastAutoTable.finalY + 22

    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`Monto en disputa: ${money(h.disputa)}`, 40, y); y += 22
    doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5)
    const intro = `Estimado equipo de Gofo:`
    doc.text(intro, 40, y); y += 16
    const cuerpo = `${meta.empresa || 'Nuestra empresa'} presenta el siguiente reclamo formal respecto a la facturación del periodo. ${c.texto} Quedamos atentos a su respuesta y a la corrección correspondiente. Agradecemos su atención.`
    const lineas = doc.splitTextToSize(cuerpo, ancho - 80)
    doc.text(lineas, 40, y)

    doc.save(`${nombre}.pdf`)
    return { formato: 'pdf' }
  } catch {
    // Respaldo: Excel con la librería xlsx ya instalada.
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const rows = [
      { Campo: 'Asunto', Valor: c.asunto },
      { Campo: 'Empresa', Valor: meta.empresa || '' },
      { Campo: 'Semana', Valor: h.semana || meta.semana || '' },
      { Campo: 'Referencia', Valor: h.referencia || '' },
      { Campo: 'Monto en disputa', Valor: money(h.disputa) },
      {},
      { Campo: c.head[0], Valor: c.head.slice(1).join(' | ') },
      ...c.body.map((b) => ({ Campo: b[0], Valor: b.slice(1).join(' | ') })),
      {},
      { Campo: 'Texto', Valor: c.texto },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Reclamo')
    XLSX.writeFile(wb, `${nombre}.xlsx`)
    return { formato: 'excel' }
  }
}
