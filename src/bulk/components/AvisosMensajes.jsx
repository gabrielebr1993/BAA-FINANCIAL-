// Aviso VISUAL rápido (in-app) de mensajes nuevos: una tarjetita que aparece arriba
// a la derecha, suena un pitido y desaparece sola a los pocos segundos. Es solo un
// aviso ligero de "te están escribiendo"; no reemplaza la bandeja de Mensajes.
// Reutilizable en TODOS los perfiles/roles (staff, chofer, transportista, cliente).
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { where } from '../data/repo'
import { tsMillis } from '../data/chatKeys'
import { beep } from '../integraciones/alertasLocales'
import { useLang } from '../../i18n'

const VISIBLE_MS = 6000 // cuánto dura visible cada aviso antes de desvanecerse.

// ¿Este mensaje es un aviso VÁLIDO para mí? Mismo criterio que el badge de "Mensajes"
// (noLeidosVisibles): no propio, no leído, no registro de llamada, y si es una
// conversación personal (privada/staff/grupo) debo ser participante y, en grupos,
// seguir siendo miembro actual.
function esParaMi(m, uid, gruposActivos) {
  if (!m || m.autorId === uid) return false
  if ((m.leidoPor || []).includes(uid)) return false
  if (m.tipo === 'llamada') return false
  const k = m.orderId || ''
  const personal = k.startsWith('pv_') || k.startsWith('st_') || k.startsWith('grp_')
  if (personal && !((m.participantes || []).includes(uid))) return false
  if (k.startsWith('grp_') && gruposActivos && !gruposActivos.has(k)) return false
  return true
}

function vistaPrevia(m, t) {
  if (m.tipo === 'foto') return '📷 ' + t('Foto')
  if (m.tipo === 'ubicacion') return '📍 ' + t('Ubicación')
  if (m.tipo === 'archivo') return '📎 ' + (m.nombreArchivo || t('Archivo'))
  return m.texto || ''
}

export default function AvisosMensajes() {
  const { t } = useLang()
  const { usuario } = useBulkAuth()
  const uid = usuario?.id
  const { datos: mensajes } = useColeccion('messages')
  const { datos: misGrupos } = useColeccion('groups', [where('miembros', 'array-contains', uid || '__none__')])
  const gruposActivos = useMemo(() => new Set((misGrupos || []).map((g) => 'grp_' + g.id)), [misGrupos])

  const [avisos, setAvisos] = useState([]) // [{ id, autor, texto }]
  // Solo avisamos de mensajes que lleguen DESPUÉS de montar (no del historial). Los
  // ids ya avisados se recuerdan para no repetir cuando el snapshot se refresca.
  const desde = useRef(tsMillis(new Date().toISOString()))
  const avisados = useRef(new Set())
  const timers = useRef({})

  useEffect(() => {
    if (!uid) return
    const nuevos = []
    for (const m of mensajes || []) {
      if (!m.id || avisados.current.has(m.id)) continue
      if (tsMillis(m.ts) <= desde.current) { avisados.current.add(m.id); continue }
      if (!esParaMi(m, uid, gruposActivos)) continue
      avisados.current.add(m.id)
      nuevos.push({ id: m.id, autor: m.autorNombre || t('Mensaje'), texto: vistaPrevia(m, t) })
    }
    if (!nuevos.length) return
    beep() // sonido para saber que te notificaron.
    setAvisos((prev) => [...prev, ...nuevos].slice(-4)) // como mucho 4 apiladas.
    for (const n of nuevos) {
      timers.current[n.id] = setTimeout(() => {
        setAvisos((prev) => prev.filter((a) => a.id !== n.id))
        delete timers.current[n.id]
      }, VISIBLE_MS)
    }
  }, [mensajes, gruposActivos, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  const cerrar = (id) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id))
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
  }

  if (!avisos.length) return null
  return (
    <div className="pointer-events-none fixed left-4 right-4 top-4 z-[80] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end">
      {avisos.map((a) => (
        <div
          key={a.id}
          onClick={() => cerrar(a.id)}
          className="animate-slide-up pointer-events-auto flex w-full max-w-sm cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
        >
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <MessageCircle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{a.autor}</div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{a.texto || t('Nuevo mensaje')}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); cerrar(a.id) }} className="flex-shrink-0 text-slate-300 hover:text-slate-500 dark:hover:text-slate-200"><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}
