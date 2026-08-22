// Hook: mientras el chofer tiene una orden activa, envía su posición GPS (throttled)
// y registra automáticamente los eventos de entrada/salida de geocercas en la orden.
import { useEffect, useRef } from 'react'
import { updateDoc, arrayUnion } from 'firebase/firestore'
import { ref, crear } from '../data/repo'
import { enviarPunto } from '../data/tracking'
import { distanciaM } from '../domain/geo'
import { ESTADOS_ACTIVOS_CHOFER, ahora } from '../domain/flujo'

// `datos` = info del chofer para las notificaciones: { nombre, codigo, unidad, uid }.
export function useGpsTracker(orden, geocercas, tenantId, datos = {}) {
  const datosRef = useRef(datos)
  datosRef.current = datos
  const estados = useRef({})       // geofenceId -> dentro?
  const ultimoEnvio = useRef(0)
  const ultimaPos = useRef(null)
  const geoRef = useRef(geocercas)
  geoRef.current = geocercas

  const activo = !!orden && ESTADOS_ACTIVOS_CHOFER.includes(orden.estado)
  useEffect(() => {
    if (!activo || typeof navigator === 'undefined' || !navigator.geolocation) return
    const onPos = async (p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed != null ? p.coords.speed : null }
      // Eventos de geocerca (entrada/salida) con HISTÉRESIS: para SALIR hay que
      // alejarse 40 m más allá del radio, así el GPS temblando en el borde no genera
      // notificaciones repetidas de entrada/salida.
      for (const gf of geoRef.current || []) {
        const r = Number(gf.radio) || 0
        const dist = distanciaM(pos, { lat: gf.lat, lng: gf.lng })
        const estaba = !!estados.current[gf.id]
        const dentro = estaba ? dist <= r + 40 : dist <= r
        const t = (dentro && !estaba) ? 'entrada' : ((!dentro && estaba) ? 'salida' : null)
        estados.current[gf.id] = dentro
        if (t) {
          const cuando = ahora()
          // Registro en la orden (bitácora) — sin repetir "entrada" mientras siga dentro.
          try { await updateDoc(ref('orders', orden.id), { geoEventos: arrayUnion({ geofenceId: gf.id, geocerca: gf.nombre, tipo: gf.tipo, evento: t, ts: cuando }) }) } catch { /* noop */ }
          // Evento de geocerca → dispara la NOTIFICACIÓN (admin/transportista/staff) vía
          // la Cloud Function bulkPushGeocerca. NO se notifica al chofer ni al cliente.
          const d = datosRef.current || {}
          try {
            await crear('geoeventos', tenantId, {
              orderId: orden.id, geofenceId: gf.id, geocerca: gf.nombre || '', plantaId: gf.plantaId || null, tipoGeocerca: gf.tipo || '',
              evento: t, // 'entrada' | 'salida'
              choferNombre: orden.choferNombre || d.nombre || '', choferId: orden.choferId || d.uid || null, choferCodigo: d.codigo || null,
              unidad: d.unidad || orden.unidad || orden.placa || orden.tipoEquipo || '',
              carrierId: orden.transportistaId || d.carrierId || null,
              lat: pos.lat, lng: pos.lng, ts: cuando,
            })
          } catch { /* noop */ }
        }
      }
      // Envío throttled del punto (cada ~20s o si se movió >40 m).
      const now = Date.now()
      const movido = ultimaPos.current ? distanciaM(ultimaPos.current, pos) : Infinity
      if (now - ultimoEnvio.current > 20000 || movido > 40) {
        ultimoEnvio.current = now; ultimaPos.current = pos
        try { await enviarPunto(tenantId, orden, pos) } catch { /* noop */ }
      }
    }
    const id = navigator.geolocation.watchPosition(onPos, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    return () => navigator.geolocation.clearWatch(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, orden?.id, tenantId])
}
