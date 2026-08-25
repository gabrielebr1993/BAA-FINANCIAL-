// BULK · Hook + modal para la sección "Privados" (chat interno 1-a-1) reutilizable en
// TODOS los portales (chofer, transportista, cliente, staff). Encapsula:
//   - La sección lista para PanelConversaciones (conversaciones pv_ con foto/nombre/rol).
//   - El botón "Nueva conversación" (abre el selector de contactos permitidos).
//   - La apertura optimista de una conversación recién creada (aún sin mensajes).
// Requiere que el portal ya se suscriba a sus mensajes con `participantes
// array-contains <su uid>` (así los pv_ llegan en tiempo real).
import { useMemo, useState } from 'react'
import ContactosModal from './ContactosModal'
import { conversacionesPrivadas } from '../domain/comunicacion'
import { useDirectorio } from '../data/useComunicacion'
import { useAvatares } from '../data/useCodigoUsuario'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { useLang } from '../../i18n'

const ICONO_ROL = (rol) => {
  if (rol === 'cliente') return 'cliente'
  if (rol === 'transportista') return 'transportista'
  if (rol === 'chofer') return 'chofer'
  if (rol === 'supervisor_planta') return 'supervisor'
  return 'admin' // staff / roles personalizados
}
const COLOR_ROL = (rol) => {
  if (rol === 'cliente') return 'green'
  if (rol === 'transportista') return 'gold'
  if (rol === 'chofer') return 'navy'
  if (rol === 'supervisor_planta') return 'blue'
  return 'slate'
}

// yo = { uid, rol, carrierId?, clienteId? } · mensajes = suscripción del portal.
export function usePrivados({ mensajes = [], uid, tenantId, yo, rolesConfig, filtrarContacto = null }) {
  const { t } = useLang()
  const directorio = useDirectorio()
  const fotos = useAvatares()
  const [verContactos, setVerContactos] = useState(false)
  const [extra, setExtra] = useState([]) // conversaciones abiertas en esta sesión, aún sin mensajes
  const [abrir, setAbrir] = useState(null)

  const label = (rol) => (BULK_ROLES_LABEL[rol] ? t(BULK_ROLES_LABEL[rol]) : (rol || t('Usuario')))

  const base = useMemo(
    () => conversacionesPrivadas({ mensajes, uid, directorio, fotos }),
    [mensajes, uid, directorio, fotos],
  )
  const items = useMemo(() => {
    const keys = new Set(base.map((x) => x.key))
    const merged = [...extra.filter((e) => !keys.has(e.key)), ...base]
    return merged.map((c) => ({
      ...c,
      // La lista pinta `titulo`: sin esto solo se veía la etiqueta del rol
      // ("Chofer") y no el NOMBRE de la persona.
      titulo: c.nombre || label(c.rol),
      icon: ICONO_ROL(c.rol),
      rolLabel: label(c.rol),
      rolColor: COLOR_ROL(c.rol),
      // Titular real del chat (para llamar a la persona correcta, no al último autor).
      contacto: { uid: c.otroUid || null, nombre: c.nombre || '', rol: c.rol || '' },
    }))
  }, [base, extra, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const seccion = {
    k: 'privados', label: t('Privados'), icon: 'operacion', items,
    vacio: t('Aún no tienes conversaciones privadas. Toca “Nueva conversación”.'),
    onNueva: () => setVerContactos(true), nuevaLabel: t('Nueva conversación'),
  }

  const onAbrir = ({ key, participantes, contacto }) => {
    setExtra((s) => (s.some((d) => d.key === key) ? s : [...s, {
      key, chatId: key,
      otroUid: contacto?.uid || (participantes || []).find((u) => u !== uid) || null,
      nombre: contacto?.nombre || t('Usuario'), rol: contacto?.rol || '',
      foto: contacto?.foto || null, lastText: '', lastTs: '', noLeidos: 0,
      participantes: participantes || null,
    }]))
    setAbrir(key)
    setTimeout(() => setAbrir(null), 0) // permite reabrir la misma conversación luego
  }

  const modal = verContactos
    ? <ContactosModal yo={yo} tenantId={tenantId} onAbrir={onAbrir} onClose={() => setVerContactos(false)} filtrar={filtrarContacto} />
    : null

  const noLeidos = useMemo(() => items.reduce((a, c) => a + (c.noLeidos || 0), 0), [items])

  return { seccion, abrir, modal, noLeidos, abrirContactos: () => setVerContactos(true) }
}
