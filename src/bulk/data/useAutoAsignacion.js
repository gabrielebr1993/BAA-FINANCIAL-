// Hook: MOTOR de asignación automática. Corre en el panel de staff (montado en
// BulkLayout) para que el emparejamiento ocurra mientras CUALQUIER dispatcher/admin
// tenga la app abierta — no solo en la pantalla de Órdenes.
//
// Empareja órdenes en cola con choferes en línea compatibles (equipo + trabajo),
// les ofrece la orden (estado NOTIFICANDO + push + reserva) con 2:00 de plazo, y
// al vencer las reencola para otro chofer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from './useColeccion'
import { guardar } from './repo'
import { reservar, liberar } from './presencia'
import { auditar } from './auditoria'
import { asignarPagos, liberarPagosAsignacion } from './ordenPagos'
import { enviarPush } from '../integraciones/notificaciones'
import { emparejar, ofertaVencida, ESPERA_RESPUESTA_MS, enriquecerConRoster } from '../domain/asignacionAuto'
import { calcularPagoChofer, configDeChofer } from '../domain/pagoChofer'
import { ORDEN_ESTADO as E } from '../domain/constants'

const STAFF = ['super_admin', 'admin', 'dispatcher']
const iso = () => new Date().toISOString()

export function useAutoAsignacion() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const esStaff = STAFF.includes(rol)
  const { datos: ordenes } = useColeccion('orders')
  const { datos: presencias } = useColeccion('presence')
  // Interruptor: si el matching corre en el SERVIDOR (Cloud Function), el motor del
  // navegador se apaga para no chocar. Se enciende en Modo test (señal 'matching').
  const { datos: signals } = useColeccion('signals')
  const serverSide = (signals || []).some((s) => s.id === 'matching' && s.serverSide === true)
  // Para calcular el pago del chofer con la MISMA config del transportista que se
  // usa cuando asigna a mano (así el chofer cobra igual sin importar quién asigna).
  const { datos: carriers } = useColeccion('carriers')
  const { datos: carrierConfigs } = useColeccion('carrierConfig')
  // Pago del chofer para esta orden según la config de su transportista (o null →
  // se deja la tarifa base ya guardada).
  const pagoChoferDe = (orden, chofer) => {
    const carrier = (carriers || []).find((c) => c.id === chofer.carrierId)
    const rosterId = (carrier?.choferes || []).find((d) => d.uid === chofer.uid)?.id || null
    const cfg = (carrierConfigs || []).find((c) => c.id === chofer.carrierId)?.pagoChoferes || {}
    return rosterId ? calcularPagoChofer(orden.precioTransportista, configDeChofer(cfg, rosterId)) : null
  }

  const porAsignar = useMemo(() => ordenes.filter((o) => [E.CREADA, E.EN_COLA].includes(o.estado)), [ordenes])
  const emparejando = useMemo(() => ordenes.filter((o) => o.estado === E.NOTIFICANDO), [ordenes])

  // Tic lento (5s) solo para vencer ofertas; el emparejado reacciona a los datos.
  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 5000); return () => clearInterval(id) }, [])

  const ofrecer = async (orden, chofer) => {
    await guardar('orders', orden.id, {
      estado: E.NOTIFICANDO, transportistaId: chofer.carrierId, choferId: chofer.uid, choferNombre: chofer.nombre,
      asignadoEn: iso(), asignacionExpira: new Date(Date.now() + ESPERA_RESPUESTA_MS).toISOString(),
    })
    await reservar(chofer.uid, orden.id)
    // Inc.2: fija al dueño (transportista/chofer) en los docs de pago; los importes
    // ya están guardados desde la creación. Si el transportista definió cómo paga a
    // este chofer, fijamos también su pago (consistente con la asignación manual).
    const pago = pagoChoferDe(orden, chofer)
    await asignarPagos(tenantId, orden.id, { transportistaId: chofer.carrierId, choferId: chofer.uid, numero: orden.numero, ...(pago != null ? { pagoChofer: pago } : {}) })
    enviarPush(tenantId, `chofer:${chofer.uid}`, 'Nueva orden', `Orden ${orden.numero} — ${orden.pesoEstimado} ton (${orden.tipoEquipo || '—'})`)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'ofrecer_orden', entidad: 'orden', entidadId: orden.id, detalle: `→ ${chofer.nombre}` })
  }

  const reofertar = async (orden, motivo) => {
    const uid = orden.choferId
    const rechazadoPor = [...new Set([...(orden.rechazadoPor || []), uid].filter(Boolean))]
    await guardar('orders', orden.id, {
      estado: E.CREADA, transportistaId: null, choferId: null, asignacionExpira: null,
      rechazadoPor, ultimoRechazo: { por: orden.choferNombre || '', motivo, ts: iso() },
    })
    if (uid) await liberar(uid)
    // Inc.2: al liberar, quita solo al dueño en los docs de pago (conserva importes).
    await liberarPagosAsignacion(tenantId, orden.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'reofertar_orden', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }

  // Emparejar: reacciona a cambios de cola/presencia (no cada segundo).
  const enVuelo = useRef(new Set())
  const enVueloChofer = useRef(new Set())
  useEffect(() => {
    if (!esStaff || serverSide) return
    try {
      // Los choferes DEMO (presencia de prueba) se muestran en la columna de en
      // línea pero NO se les ofrecen órdenes, para que un chofer real reciba la carga.
      // Se ENRIQUECE cada presencia con los Trabajos/equipos ACTUALES del roster
      // (mismo criterio que el diagnóstico) para que los cambios del admin apliquen
      // al instante sin reconectar.
      const pool = enriquecerConRoster(presencias, carriers)
        .filter((p) => !enVueloChofer.current.has(p.uid) && !p.demo)
      const pares = emparejar(porAsignar, pool, Date.now())
      for (const { orden, chofer } of pares) {
        if (enVuelo.current.has(orden.id)) continue
        enVuelo.current.add(orden.id); enVueloChofer.current.add(chofer.uid)
        ofrecer(orden, chofer).catch(() => {}).finally(() => { enVuelo.current.delete(orden.id); enVueloChofer.current.delete(chofer.uid) })
      }
    } catch { /* no romper */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porAsignar, presencias, carriers, esStaff, serverSide])

  // Vencimiento 2:00 (o notificando heredada sin contador) → reencolar.
  const revirtiendo = useRef(new Set())
  useEffect(() => {
    if (!esStaff || serverSide) return
    try {
      const ahora = Date.now()
      for (const o of emparejando) {
        // Asignación MANUAL (dispatcher/transportista eligió a un chofer): no se
        // reencola ni se roba. Espera a que ESE chofer acepte o rechace.
        if (o.asignacionManual) continue
        const revertir = ofertaVencida(o, ahora) || !o.asignacionExpira
        if (!revertir || revirtiendo.current.has(o.id)) continue
        revirtiendo.current.add(o.id)
        reofertar(o, o.asignacionExpira ? 'timeout' : 'reencolar').catch(() => {}).finally(() => revirtiendo.current.delete(o.id))
      }
    } catch { /* no romper */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emparejando, tick, esStaff, serverSide])
}
