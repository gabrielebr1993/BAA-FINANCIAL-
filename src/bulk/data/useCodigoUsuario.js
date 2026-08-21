// BULK · Hook para obtener el ID ÚNICO de un usuario (campo `codigo`, 8 dígitos)
// a partir de su uid. La visibilidad se respeta AUTOMÁTICAMENTE por las reglas de
// Firestore: un `get` a bulk_users/{uid} solo lo permiten el propio usuario o un
// admin del tenant; para cualquier otro, la lectura falla y devolvemos null (no se
// muestra el ID). Así no hace falta duplicar la lógica de permisos en cada pantalla.
import { useEffect, useState } from 'react'
import { suscribirDoc } from './repo'

export function useCodigoUsuario(uid) {
  const [codigo, setCodigo] = useState(null)
  useEffect(() => {
    if (!uid) { setCodigo(null); return }
    // suscribirDoc → get en tiempo real de bulk_users/{uid}. Si las reglas lo niegan
    // (rol sin permiso), el callback recibe null y no se muestra nada.
    const off = suscribirDoc('users', uid, (d) => setCodigo(d?.codigo || null))
    return off
  }, [uid])
  return codigo
}
