// Hook: mientras el chofer tiene una orden activa, envía su posición GPS (throttled)
// y registra automáticamente los eventos de entrada/salida de geocercas en la orden.
import { useEffect, useRef } from 'react'
import { updateDoc, arrayUnion } from 'firebase/firestore'
import { ref } from '../data/repo'
import { enviarPunto } from '../data/tracking'
import { distanciaM, dentroGeocerca, transicionGeocerca } from '../domain/geo'
import { ESTADOS_ACTIVOS_CHOFER, ahora } from '../domain/flujo'

export function useGpsTracker(orden, geocercas, tenantId) {
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
      // Eventos de geocerca (entrada/salida).
      for (const gf of geoRef.current || []) {
        const t = transicionGeocerca(!!estados.current[gf.id], pos, gf)
        estados.current[gf.id] = dentroGeocerca(pos, gf)
        if (t) {
          try { await updateDoc(ref('orders', orden.id), { geoEventos: arrayUnion({ geofenceId: gf.id, geocerca: gf.nombre, tipo: gf.tipo, evento: t, ts: ahora() }) }) } catch { /* noop */ }
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
