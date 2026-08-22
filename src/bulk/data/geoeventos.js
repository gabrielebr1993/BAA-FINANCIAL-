// BULK · Eventos de geocerca → formato de notificación para la CAMPANA (acumula y se
// marca leído por dispositivo). Staff escucha todo el tenant; el transportista, su carrier.
import { useMemo } from 'react'
import { where } from './repo'
import { useColeccion } from './useColeccion'
import { tsMillis } from './chatKeys'

export function useNotifsGeocerca(carrierId = null) {
  const filtros = carrierId ? [where('carrierId', '==', carrierId)] : []
  const opts = carrierId ? {} : { orden: 'ts', dir: 'desc', limite: 40 }
  const { datos } = useColeccion('geoeventos', filtros, opts)
  return useMemo(() => {
    const arr = (datos || []).slice().sort((a, b) => tsMillis(b.ts) - tsMillis(a.ts)).slice(0, 40)
    return arr.map((e) => {
      const entrada = e.evento === 'entrada'
      const cuando = tsMillis(e.ts) ? new Date(tsMillis(e.ts)).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
      const idTxt = e.choferCodigo ? ` (ID: ${e.choferCodigo})` : ''
      return {
        id: e.id,
        tipo: 'geocerca',
        sev: entrada ? 'info' : 'warn',
        titulo: `${entrada ? '🚨 Entrada' : '🔔 Salida'}: ${e.choferNombre || 'Chofer'}${idTxt}`,
        detalle: `${e.geocerca || 'Geocerca'}${e.unidad ? ` · Unidad ${e.unidad}` : ''} · ${cuando}`,
        // El staff puede saltar directo a la UBICACIÓN de la geocerca en el Mapa en vivo
        // (por geofenceId y, de respaldo, la posición del evento). El transportista no
        // tiene esa ruta.
        accion: carrierId ? null : 'Ver ubicación en el mapa',
        link: carrierId ? null : `/bulk/mapa?geo=${encodeURIComponent(e.geofenceId || '')}&lat=${e.lat != null ? e.lat : ''}&lng=${e.lng != null ? e.lng : ''}`,
        ts: e.ts,
      }
    })
  }, [datos, carrierId])
}
