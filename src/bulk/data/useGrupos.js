// BULK · Hook de GRUPOS del usuario. Lee (reglas) los grupos donde es MIEMBRO y
// aquellos donde tiene una INVITACIÓN pendiente, y resume el último mensaje / no
// leídos de cada grupo (canal grp_<id>). Los mensajes de grupo llevan participantes
// = uids de los miembros, así que la consulta por array-contains(uid) los trae.
import { useMemo } from 'react'
import { useColeccion } from './useColeccion'
import { where } from './repo'
import { useBulkAuth } from '../BulkAuthContext'
import { convGrupo } from './grupos'
import { resumenPorConversacion } from './chatKeys'

export function useGrupos() {
  const { usuario } = useBulkAuth()
  const uid = usuario?.id || '__none__'
  const { datos: grupos } = useColeccion('groups', [where('miembros', 'array-contains', uid)])
  const { datos: invitaciones } = useColeccion('groups', [where('invitados', 'array-contains', uid)])
  const { datos: msgs } = useColeccion('messages', [where('participantes', 'array-contains', uid)])
  const resumen = useMemo(() => resumenPorConversacion(msgs, usuario?.id), [msgs, usuario])

  // Filas listas para PanelConversaciones (sección "Grupos").
  const items = useMemo(() => (grupos || []).map((g) => {
    const r = resumen[convGrupo(g.id)] || {}
    return {
      key: convGrupo(g.id), chatId: convGrupo(g.id), icon: 'grupo',
      titulo: g.nombre || 'Grupo', rolLabel: 'Grupo', rolColor: 'blue',
      operacion: `${(g.miembros || []).length} ${(g.miembros || []).length === 1 ? 'integrante' : 'integrantes'}`,
      participantes: g.miembros || [], lastText: r.lastText || '', lastTs: r.lastTs || g.actualizadoEn || '', noLeidos: r.noLeidos || 0,
      _grupo: g,
    }
  }), [grupos, resumen])

  const noLeidos = useMemo(() => items.reduce((a, i) => a + (i.noLeidos || 0), 0), [items])
  return { grupos: grupos || [], invitaciones: invitaciones || [], items, noLeidos }
}
