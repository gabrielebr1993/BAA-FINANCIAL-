// BULK · Chat interno por roles/perfiles — capa de datos (hooks + acción).
// Junta el DIRECTORIO (bulk_directorio) y la MATRIZ configurable (bulk_comMatrix)
// con la lógica PURA de dominio (comunicacion.js) para ofrecer:
//   - useDirectorio()            → lista de perfiles del tenant (uid/nombre/rol/…)
//   - useMatrizComunicacion()    → matriz de permisos por par de roles (o {} default)
//   - useContactos(yo)           → contactos permitidos, agrupados por rol (con foto)
//   - abrirPrivado(paraUid)      → valida en el BACKEND y devuelve la clave pv_ del chat
import { useMemo } from 'react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion, useDoc } from './useColeccion'
import { useAvatares } from './useCodigoUsuario'
import { contactosDisponibles, puedeComunicarse } from '../domain/comunicacion'
import { convPrivada } from './chatKeys'

// Directorio del tenant (legible por cualquier miembro). Cada item: { id(uid), uid,
// nombre, rol, carrierId?, clienteId?, codigo? }.
export function useDirectorio() {
  const { datos } = useColeccion('directorio')
  return datos
}

// Matriz de comunicación del tenant (doc id = tenantId). Devuelve { pares } o {}.
export function useMatrizComunicacion(tenantId) {
  const { dato } = useDoc('comMatrix', tenantId)
  return dato || {}
}

// Contactos con los que `yo` puede iniciar chat privado, agrupados por rol y con foto.
// `yo` = { uid, rol, carrierId?, clienteId? }.
export function useContactos(yo, tenantId) {
  const directorio = useDirectorio()
  const matriz = useMatrizComunicacion(tenantId)
  const fotos = useAvatares()
  return useMemo(
    () => contactosDisponibles({ yo, directorio, matriz, fotos }),
    [yo, directorio, matriz, fotos],
  )
}

// Abre (o recupera) el chat PRIVADO con `paraUid`. Valida en el BACKEND (misma
// compañía + matriz de roles) vía la Cloud Function `bulkChatPrivado`, que registra
// la conversación en bulk_conversaciones. Devuelve { key, participantes }.
export async function abrirPrivado(paraUid) {
  const r = await httpsCallable(funcsBulk, 'bulkChatPrivado')({ paraUid })
  return r.data // { key, participantes: [a,b] }
}

// Comprobación LOCAL (para la UI) equivalente a la del backend. No sustituye a la
// validación del servidor: solo evita ofrecer contactos no permitidos.
export { puedeComunicarse, convPrivada }
