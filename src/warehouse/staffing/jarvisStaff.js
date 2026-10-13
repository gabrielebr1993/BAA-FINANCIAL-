// ============================================================================
// JARVIS · recomendaciones del módulo Warehouse / Staffing.
// Heurísticas calculadas SOBRE LOS DATOS REALES importados (nada inventado):
// sugieren, no deciden. Cada una dice qué mirar y por qué.
// ============================================================================

const dinero = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// datos: { semanas: [{periodo, res, regs}] (orden cronológico), registros,
//          ajustes, cheques, pendRevision }
export function recomendacionesStaff({ semanas, registros, ajustes, cheques }) {
  const recs = []
  const ultima = semanas.length ? semanas[semanas.length - 1] : null

  // 1) tarifas sin configurar = utilidad a ciegas
  const sinTarifa = (registros || []).filter((r) => r.pendienteTarifa)
  if (sinTarifa.length) {
    const posiciones = [...new Set(sinTarifa.map((r) => r.posicion))]
    recs.push({
      icono: '⚙️', tipo: 'urgente',
      titulo: 'Configura tus tarifas pendientes',
      detalle: `${sinTarifa.length} registros no tienen tu tarifa de pago (${posiciones.join(', ')}): la utilidad de esas semanas está incompleta hasta que las definas.`,
      accion: 'tarifas',
    })
  }

  // 2) margen de la última semana completa
  if (ultima && !ultima.res.parcial && ultima.res.ingreso > 0) {
    const pct = ultima.res.pctUtilidad
    if (pct !== null && pct < 5) {
      recs.push({
        icono: '📉', tipo: 'urgente',
        titulo: `Utilidad de ${pct}% en la última semana`,
        detalle: `La semana ${ultima.periodo.inicio} dejó ${dinero(ultima.res.utilidad)} sobre ${dinero(ultima.res.ingreso)} de ingreso. Revisa tarifas de pago, OT y gastos: por debajo de 5% cualquier ajuste de Gofo te deja en rojo.`,
      })
    } else if (pct !== null && pct >= 10) {
      recs.push({
        icono: '✅', tipo: 'ok',
        titulo: `Buena semana: ${pct}% de utilidad`,
        detalle: `${ultima.periodo.inicio} → ${ultima.periodo.fin}: ${dinero(ultima.res.utilidad)} de utilidad operativa. Mantén la mezcla de posiciones y horas de esta semana.`,
      })
    }
  }

  // 3) OT alto sostenido por persona (≥2 semanas con 10+ h de OT)
  const otPorPersona = {}
  for (const r of registros || []) {
    if ((r.horasOT || 0) >= 10) {
      otPorPersona[r.nombreNorm] = otPorPersona[r.nombreNorm] || { nombre: r.nombre, semanas: new Set(), horas: 0 }
      otPorPersona[r.nombreNorm].semanas.add(r.periodoId)
      otPorPersona[r.nombreNorm].horas += r.horasOT
    }
  }
  const otRecurrente = Object.values(otPorPersona).filter((x) => x.semanas.size >= 2).sort((a, b) => b.horas - a.horas)
  if (otRecurrente.length) {
    const top = otRecurrente[0]
    recs.push({
      icono: '⏱️', tipo: 'atencion',
      titulo: `OT recurrente: ${top.nombre}`,
      detalle: `${Math.round(top.horas)} h de overtime en ${top.semanas.size} semanas${otRecurrente.length > 1 ? ` (y ${otRecurrente.length - 1} personas más en la misma situación)` : ''}. El OT se paga más caro: si es constante, conviene sumar gente al turno.`,
      accion: 'trabajadores',
    })
  }

  // 4) OVERPAID / ajustes recurrentes de una persona
  const ajPorPersona = {}
  for (const a of ajustes || []) {
    if (!a.personaRaw || (a.importe || 0) >= 0) continue
    const k = a.personaRaw
    ajPorPersona[k] = ajPorPersona[k] || { n: 0, total: 0 }
    ajPorPersona[k].n += 1
    ajPorPersona[k].total += a.importe
  }
  const reincidentes = Object.entries(ajPorPersona).filter(([, x]) => x.n >= 2).sort((a, b) => a[1].total - b[1].total)
  if (reincidentes.length) {
    const [nombre, x] = reincidentes[0]
    recs.push({
      icono: '🔁', tipo: 'atencion',
      titulo: `Ajustes repetidos: ${nombre}`,
      detalle: `${x.n} deducciones de Gofo por ${dinero(Math.abs(x.total))} asociadas a esta persona. Vale la pena revisar sus registros de horas antes de que se repita.`,
    })
  }

  // 5) concentración de horas (top 5 personas)
  if (ultima && ultima.regs.length >= 10) {
    const horasPersona = {}
    for (const r of ultima.regs) horasPersona[r.nombreNorm] = (horasPersona[r.nombreNorm] || 0) + (r.horasTotal || 0)
    const orden = Object.values(horasPersona).sort((a, b) => b - a)
    const total = orden.reduce((s, x) => s + x, 0)
    const top5 = orden.slice(0, 5).reduce((s, x) => s + x, 0)
    if (total > 0 && top5 / total > 0.3) {
      recs.push({
        icono: '👥', tipo: 'atencion',
        titulo: 'Horas concentradas en pocas personas',
        detalle: `En la última semana, 5 personas acumulan el ${Math.round((top5 / total) * 100)}% de las horas. Si una falta, el turno se cae: conviene repartir más.`,
      })
    }
  }

  // 6) cheques emitidos sin cobrar / sin conciliar
  const pendientes = (cheques || []).filter((c) => c.estado === 'emitido')
  const enRevision = (cheques || []).filter((c) => c.estado === 'diferencia' || c.revision || c.workerAmbiguo)
  if (pendientes.length >= 5 || enRevision.length) {
    recs.push({
      icono: '🏦', tipo: enRevision.length ? 'urgente' : 'atencion',
      titulo: enRevision.length ? `${enRevision.length} cheques necesitan revisión` : `${pendientes.length} cheques sin cobrar`,
      detalle: `${pendientes.length} emitidos pendientes de cobro por ${dinero(pendientes.reduce((s, c) => s + (c.importe || 0), 0))}${enRevision.length ? ` y ${enRevision.length} con diferencias o sin conciliar` : ''}. Sube el reporte bancario más reciente para cerrar el ciclo.`,
      accion: 'cheques',
    })
  }

  // 7) margen por posición (cuál deja más)
  const porPos = {}
  for (const r of registros || []) {
    if (r.pendienteTarifa || !r.posicion) continue
    porPos[r.posicion] = porPos[r.posicion] || { ingreso: 0, pago: 0, horas: 0 }
    porPos[r.posicion].ingreso += r.importeGofo || 0
    porPos[r.posicion].pago += r.miPago || 0
    porPos[r.posicion].horas += r.horasTotal || 0
  }
  const margenes = Object.entries(porPos)
    .filter(([, x]) => x.ingreso > 500)
    .map(([pos, x]) => ({ pos, pct: Math.round(((x.ingreso - x.pago) / x.ingreso) * 1000) / 10, horas: x.horas }))
    .sort((a, b) => b.pct - a.pct)
  if (margenes.length >= 2) {
    const mejor = margenes[0], peor = margenes[margenes.length - 1]
    recs.push({
      icono: '💡', tipo: 'ok',
      titulo: `${mejor.pos} es tu mejor margen (${mejor.pct}%)`,
      detalle: `${mejor.pos} deja ${mejor.pct}% antes de gastos; ${peor.pos} deja ${peor.pct}%. Cuando puedas elegir qué horas crecen, ya sabes dónde conviene.`,
    })
  }

  // 8) por cobrar acumulado
  const porCobrar = semanas.reduce((s, x) => s + Math.max(0, x.res.porCobrar || 0), 0)
  const ingresoTotal = semanas.reduce((s, x) => s + (x.res.ingreso || 0), 0)
  if (ingresoTotal > 0 && porCobrar > ingresoTotal * 0.5 && semanas.length >= 2) {
    recs.push({
      icono: '💵', tipo: 'atencion',
      titulo: `${dinero(porCobrar)} pendientes de cobrar a Gofo`,
      detalle: 'Más de la mitad del ingreso reconocido aún no entra a la cuenta. Registra los cobros en Finanzas cuando lleguen para que el flujo de caja sea real.',
      accion: 'finanzas',
    })
  }

  const orden = { urgente: 0, atencion: 1, ok: 2 }
  return recs.sort((a, b) => orden[a.tipo] - orden[b.tipo]).slice(0, 5)
}
