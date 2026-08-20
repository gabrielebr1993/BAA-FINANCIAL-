// BULK · Grupos de chat. Toda mutación pasa por la Cloud Function `bulkGrupoOp`
// (validación de permisos en el backend). El cliente solo LEE bulk_groups (reglas)
// y envía mensajes al canal grp_<id> (mismo mecanismo que cualquier chat).
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'

// Clave de conversación de un grupo (para bulk_messages.orderId).
export const convGrupo = (grupoId) => `grp_${grupoId}`
export const esConvGrupo = (id) => typeof id === 'string' && id.startsWith('grp_')
export const grupoIdDeConv = (id) => (esConvGrupo(id) ? id.slice(4) : id)

const op = (accion, data = {}) => httpsCallable(funcsBulk, 'bulkGrupoOp')({ accion, ...data }).then((r) => r.data)

export const crearGrupo = (nombre, invitados = []) => op('crear', { nombre, invitados })
export const invitarAGrupo = (grupoId, invitados = []) => op('invitar', { grupoId, invitados })
export const aceptarGrupo = (grupoId) => op('aceptar', { grupoId })
export const rechazarGrupo = (grupoId) => op('rechazar', { grupoId })
export const salirGrupo = (grupoId) => op('salir', { grupoId })
export const expulsarDeGrupo = (grupoId, uid) => op('expulsar', { grupoId, uid })
export const renombrarGrupo = (grupoId, nombre) => op('renombrar', { grupoId, nombre })
export const disolverGrupo = (grupoId) => op('disolver', { grupoId })
