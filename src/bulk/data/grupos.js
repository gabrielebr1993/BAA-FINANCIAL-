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

// Menú contextual (⋮) de una conversación de GRUPO, según el rol del usuario. Acciones
// DIFERENCIADAS con permisos claros y confirmaciones (evita borrados accidentales):
//   - Miembro normal → SOLO "Salir del grupo" (el grupo sigue para los demás).
//   - Creador/Admin  → "Eliminar grupo para todos" (disuelve). El creador no sale
//     (debe disolver); un admin distinto del creador puede salir y/o disolver.
// Devuelve [] si no es un grupo o no se encuentra. Cada acción pide confirmación.
export function menuGrupoConv({ item, grupos = [], uid, esAdmin = false, t = (x) => x, tras = () => {} }) {
  const key = item?.key || item?.chatId
  if (!esConvGrupo(key)) return []
  const g = grupos.find((x) => convGrupo(x.id) === key)
  if (!g) return []
  const gestor = g.creadorId === uid || esAdmin
  const m = []
  if (g.creadorId !== uid) {
    m.push({ label: t('Salir del grupo'), icon: 'salir', onClick: async () => {
      if (!window.confirm(`${t('¿Quieres salir de este grupo?')}\n\n${t('El grupo continuará existiendo para los demás miembros, pero dejarás de formar parte de él.')}`)) return
      try { await salirGrupo(g.id); tras(g) } catch (e) { window.alert(e?.message || t('No se pudo salir del grupo.')) }
    } })
  }
  if (gestor) {
    m.push({ label: t('Eliminar grupo para todos'), icon: 'eliminar', danger: true, onClick: async () => {
      if (!window.confirm(`${t('¿Eliminar este grupo para todos?')}\n\n${t('Esta acción eliminará definitivamente el grupo y todos sus miembros dejarán de tener acceso. Esta acción no se puede deshacer.')}`)) return
      try { await disolverGrupo(g.id); tras(g) } catch (e) { window.alert(e?.message || t('No se pudo eliminar el grupo.')) }
    } })
  }
  return m
}
