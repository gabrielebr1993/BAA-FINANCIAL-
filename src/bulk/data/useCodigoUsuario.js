// BULK · Hook para obtener el ID ÚNICO de un usuario (campo `codigo`, 8 dígitos)
// a partir de su uid. La visibilidad se respeta AUTOMÁTICAMENTE por las reglas de
// Firestore: un `get` a bulk_users/{uid} solo lo permiten el propio usuario o un
// admin del tenant; para cualquier otro, la lectura falla y devolvemos null (no se
// muestra el ID). Así no hace falta duplicar la lógica de permisos en cada pantalla.
import { useEffect, useState } from 'react'
import { suscribirDoc } from './repo'

// Devuelve el doc de perfil del usuario (o null) respetando permisos (reglas).
export function usePerfilUsuario(uid) {
  const [perfil, setPerfil] = useState(null)
  useEffect(() => {
    if (!uid) { setPerfil(null); return }
    // suscribirDoc → get en tiempo real de bulk_users/{uid}. Si las reglas lo niegan
    // (rol sin permiso), el callback recibe null y no se muestra nada.
    const off = suscribirDoc('users', uid, (d) => setPerfil(d || null))
    return off
  }, [uid])
  return perfil
}

export function useCodigoUsuario(uid) {
  return usePerfilUsuario(uid)?.codigo || null
}

export function useFotoUsuario(uid) {
  return usePerfilUsuario(uid)?.foto || null
}
