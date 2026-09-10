// Centro de notificaciones del STAFF (§14): datos del tenant → notificaciones
// accionables. Reutiliza la campana presentacional CampanaNotificaciones.
import { useEffect, useMemo, useState } from 'react'
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
  // Pulso de 1 min: la alerta de GPS APAGADO depende de que NO lleguen datos,
  // así que el reloj debe avanzar solo (no con cada snapshot).
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 60000); return () => clearInterval(id) }, [])
  const notifs = useMemo(
    () => [...geo, ...construirNotificaciones({ ordenes, facturas, incidencias, documentos, mensajesNuevos, ahoraMs: ahora })],
    [geo, ordenes, facturas, incidencias, documentos, mensajesNuevos, ahora],
  )
  return <CampanaNotificaciones notifs={notifs} claveLS="bulk_notif_leidas" />
}
