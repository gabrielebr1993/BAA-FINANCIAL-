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
import { enviarPush } from '../integraciones/notificaciones'
import { emparejar, ofertaVencida, ESPERA_RESPUESTA_MS } from '../domain/asignacionAuto'
import { ORDEN_ESTADO as E } from '../domain/constants'

const STAFF = ['super_admin', 'admin', 'dispatcher']
const iso = () => new Date().toISOString()

export function useAutoAsignacion() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const esStaff = STAFF.includes(rol)
  const { datos: ordenes } = useColeccion('orders')
  const { datos: presencias } = useColeccion('presence')

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
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'reofertar_orden', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }

  // Emparejar: reacciona a cambios de cola/presencia (no cada segundo).
  const enVuelo = useRef(new Set())
  const enVueloChofer = useRef(new Set())
  useEffect(() => {
    if (!esStaff) return
    try {
      const pool = (presencias || []).filter((p) => !enVueloChofer.current.has(p.uid))
      const pares = emparejar(porAsignar, pool, Date.now())
      for (const { orden, chofer } of pares) {
        if (enVuelo.current.has(orden.id)) continue
        enVuelo.current.add(orden.id); enVueloChofer.current.add(chofer.uid)
        ofrecer(orden, chofer).catch(() => {}).finally(() => { enVuelo.current.delete(orden.id); enVueloChofer.current.delete(chofer.uid) })
      }
    } catch { /* no romper */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porAsignar, presencias, esStaff])

  // Vencimiento 2:00 (o notificando heredada sin contador) → reencolar.
  const revirtiendo = useRef(new Set())
  useEffect(() => {
    if (!esStaff) return
    try {
      const ahora = Date.now()
      for (const o of emparejando) {
        const revertir = ofertaVencida(o, ahora) || !o.asignacionExpira
        if (!revertir || revirtiendo.current.has(o.id)) continue
        revirtiendo.current.add(o.id)
        reofertar(o, o.asignacionExpira ? 'timeout' : 'reencolar').catch(() => {}).finally(() => revirtiendo.current.delete(o.id))
      }
    } catch { /* no romper */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emparejando, tick, esStaff])
}
