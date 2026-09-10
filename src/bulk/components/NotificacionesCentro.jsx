// Centro de notificaciones del STAFF (§14): datos del tenant → notificaciones
// accionables. Reutiliza la campana presentacional CampanaNotificaciones.
import { useEffect, useMemo, useState } from 'react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { noLeidosVisibles } from '../data/chat'
import { where } from '../data/repo'
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
  // Mismo criterio que el badge del menú (BulkLayout): solo cuentan los hilos
  // VISIBLES para este usuario (excluye privados ajenos y grupos que dejó) —
  // si no, el contador se congela en mensajes que nunca podría "leer".
  const { datos: misGrupos } = useColeccion('groups', [where('miembros', 'array-contains', usuario?.id || '__none__')])
  const gruposActivos = useMemo(() => new Set((misGrupos || []).map((g) => 'grp_' + g.id)), [misGrupos])
  const mensajesNuevos = useMemo(() => noLeidosVisibles(mensajes, usuario?.id, gruposActivos), [mensajes, usuario, gruposActivos])

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
