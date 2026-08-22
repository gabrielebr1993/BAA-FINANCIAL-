// Centro de notificaciones del STAFF (§14): datos del tenant → notificaciones
// accionables. Reutiliza la campana presentacional CampanaNotificaciones.
import { useMemo } from 'react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { noLeidosPorConv } from '../data/chat'
import { construirNotificaciones } from '../domain/notificaciones'
import { useNotifsGeocerca } from '../data/geoeventos'
import CampanaNotificaciones from './CampanaNotificaciones'

export default function NotificacionesCentro() {
  const { usuario } = useBulkAuth()
  const { datos: ordenes } = useColeccion('orders')
  const { datos: facturas } = useColeccion('invoices')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: documentos } = useColeccion('documents')
  const { datos: mensajes } = useColeccion('messages')
  const mensajesNuevos = useMemo(() => Object.values(noLeidosPorConv(mensajes, usuario?.id)).reduce((a, n) => a + n, 0), [mensajes, usuario])

  const geo = useNotifsGeocerca(null) // staff: entradas/salidas de geocerca de todo el tenant
  const notifs = useMemo(
    () => [...geo, ...construirNotificaciones({ ordenes, facturas, incidencias, documentos, mensajesNuevos, ahoraMs: Date.now() })],
    [geo, ordenes, facturas, incidencias, documentos, mensajesNuevos],
  )
  return <CampanaNotificaciones notifs={notifs} claveLS="bulk_notif_leidas" />
}
