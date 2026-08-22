// BULK · Red de CONTACTOS entre choferes (capa de datos). Acciones validadas en el
// backend (Cloud Function `bulkContacto`) + hooks de lectura en tiempo real.
import { useMemo, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { where, suscribirDoc } from './repo'
import { useColeccion, useDoc } from './useColeccion'
import { useAvatares } from './useCodigoUsuario'
import { useDirectorio } from './useComunicacion'
import { useBulkAuth } from '../BulkAuthContext'

const op = (accion, data = {}) => httpsCallable(funcsBulk, 'bulkContacto')({ accion, ...data }).then((r) => r.data)

export const buscarChoferPorId = (codigo) => op('buscar', { codigo })
export const solicitarContacto = (data) => op('solicitar', data)         // { paraUid } | { codigo }
export const responderSolicitud = (requestId, aceptar) => op('responder', { requestId, aceptar })
export const eliminarContacto = (paraUid) => op('eliminar', { paraUid })
export const bloquearContacto = (paraUid) => op('bloquear', { paraUid })
export const desbloquearContacto = (paraUid) => op('desbloquear', { paraUid })
export const restringirSolicitudes = (valor) => op('restringir', { valor })
export const reportarContacto = (paraUid, motivo) => op('reportar', { paraUid, motivo })

// Doc de contactos del usuario actual: { contactos:[uid], bloqueados:[uid], noSolicitudes }.
export function useMisContactosDoc() {
  const { usuario } = useBulkAuth()
  const { dato } = useDoc('contacts', usuario?.id)
  return dato || {}
}

// Contactos ya resueltos (uid → nombre/ID/foto vía directorio + avatares).
export function useMisContactos() {
  const doc = useMisContactosDoc()
  const directorio = useDirectorio()
  const fotos = useAvatares()
  return useMemo(() => {
    const porUid = {}
    for (const d of directorio || []) porUid[d.uid || d.id] = d
    const uids = doc.contactos || []
    return uids.map((uid) => {
      const info = porUid[uid] || {}
      return { uid, nombre: info.nombre || 'Chofer', codigo: info.codigo || null, foto: fotos[uid] || null }
    }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  }, [doc, directorio, fotos])
}

// Solicitudes de contacto RECIBIDAS y pendientes para el usuario actual.
export function useSolicitudesContacto() {
  const { usuario } = useBulkAuth()
  const { datos } = useColeccion('contactRequests', [where('paraUid', '==', usuario?.id || '__none__'), where('estado', '==', 'pendiente')])
  return datos || []
}

// Estado (presencia) de una lista de contactos: mapa uid → doc de presencia. Se lee
// doc por doc (las reglas permiten leer la presencia de tus contactos, no listarla).
export function usePresenciasContactos(uids = []) {
  const [mapa, setMapa] = useState({})
  const clave = (uids || []).filter(Boolean).join(',')
  useEffect(() => {
    const lista = clave ? clave.split(',') : []
    if (!lista.length) { setMapa({}); return }
    const offs = lista.map((u) => suscribirDoc('presence', u, (d) => setMapa((m) => ({ ...m, [u]: d || null }))))
    return () => offs.forEach((o) => o && o())
  }, [clave])
  return mapa
}

// Traduce un doc de presencia a { label, color } para el badge de estado.
export function estadoPresencia(p) {
  if (!p || p.enLinea !== true) return { label: 'Desconectado', color: 'slate' }
  if (['reservado', 'ocupado', 'en_viaje'].includes(p.estado)) return { label: 'Ocupado', color: 'gold' }
  return { label: 'Disponible', color: 'green' }
}
