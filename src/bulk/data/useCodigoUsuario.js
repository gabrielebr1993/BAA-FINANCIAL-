// BULK · Hook para obtener el ID ÚNICO de un usuario (campo `codigo`, 8 dígitos)
// a partir de su uid. La visibilidad se respeta AUTOMÁTICAMENTE por las reglas de
// Firestore: un `get` a bulk_users/{uid} solo lo permiten el propio usuario o un
// admin del tenant; para cualquier otro, la lectura falla y devolvemos null (no se
// muestra el ID). Así no hace falta duplicar la lógica de permisos en cada pantalla.
import { useEffect, useState, useMemo } from 'react'
import { suscribirDoc } from './repo'
import { useColeccion } from './useColeccion'

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

// Foto de perfil (avatar) de UN usuario, desde bulk_avatars (legible por la empresa).
export function useFotoUsuario(uid) {
  const [foto, setFoto] = useState(null)
  useEffect(() => {
    if (!uid) { setFoto(null); return }
    const off = suscribirDoc('avatars', uid, (d) => setFoto(d?.foto || null))
    return off
  }, [uid])
  return foto
}

// Mapa uid → foto de TODOS los avatares del tenant (para pintar listas/chat sin abrir
// una suscripción por cada persona).
export function useAvatares() {
  const { datos } = useColeccion('avatars')
  return useMemo(() => {
    const m = {}
    for (const a of datos || []) if (a.foto) m[a.id] = a.foto
    return m
  }, [datos])
}
