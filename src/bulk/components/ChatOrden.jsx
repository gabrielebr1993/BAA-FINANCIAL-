// Chat en tiempo real de UNA orden. Reutilizable en cualquier portal (chofer, staff,
// transportista, cliente). Texto, foto, ubicación, marca de urgente y confirmación de
// lectura. Elimina la necesidad de WhatsApp para la operación.
import { useEffect, useRef, useState } from 'react'
import { Send, Camera, MapPin, AlertTriangle, Check, CheckCheck, Smile, Trash2, Phone, Video, Paperclip, FileText, Users } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { enviarMensaje, suscribirChat, marcarLeidos, eliminarMensaje } from '../data/chat'
import { esConvGrupo } from '../data/grupos'
import PerfilRapido from './PerfilRapido'
import Avatar from './Avatar'
import { useAvatares } from '../data/useCodigoUsuario'
import { useLlamada } from './LlamadaProvider'
import { leerFotoReducida } from './foto'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { Input } from '../../components/ui'
import { useLang } from '../../i18n'

// Emojis frecuentes estilo WhatsApp (caras, manitos, corazones, trabajo).
const EMOJIS = ['👍', '👎', '🙏', '👌', '💪', '👏', '🤝', '✌️', '😀', '😅', '😂', '🙂', '😉', '😍', '🤔', '😎', '😢', '😡', '🥳', '😴', '❤️', '🧡', '💛', '💚', '💙', '🔥', '⭐', '✅', '❌', '⚠️', '🚚', '⛽', '📍', '⏰', '💰', '📦', '🛻', '🏭', '👋', '🆗']
// ¿El mensaje es solo emojis (para mostrarlo grande, como WhatsApp)?
const soloEmojis = (s) => { const x = (s || '').replace(/\s/g, ''); return x.length > 0 && x.length <= 8 && !/[0-9a-zA-ZÀ-ɏ]/.test(x) }

export default function ChatOrden({ orden, alto = 340, fill = false, participantes: partProp = null, contacto = null }) {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  const avatares = useAvatares()
  const { iniciar, iniciarGrupo, pedirLlamadaGrupo } = useLlamada()
  const esAdmin = rol === 'admin' || rol === 'super_admin'
  // Borra un mensaje de forma permanente. Solo el autor o el admin (las reglas lo refuerzan).
  const borrarMensaje = async (m) => {
    if (!window.confirm(t('¿Eliminar este mensaje? Esta acción no se puede deshacer.'))) return
    try { await eliminarMensaje(m.id) } catch { /* sin permiso o error de red */ }
  }
  const [msgs, setMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [verEmojis, setVerEmojis] = useState(false)
  const [perfilRapido, setPerfilRapido] = useState(null) // {id,nombre,rol} del autor al que se le hizo clic
  const finRef = useRef(null)

  useEffect(() => {
    if (!orden?.id) return
    const off = suscribirChat(tenantId, orden.id, setMsgs)
    return off
  }, [tenantId, orden?.id])

  useEffect(() => {
    if (usuario?.id && msgs.length) marcarLeidos(msgs.filter((m) => m.autorId !== usuario.id), usuario.id)
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, usuario])

  const enviar = async (extra = {}) => {
    const t = texto.trim()
    if (!t && !extra.foto && !extra.ubicacion && !extra.archivo) return
    setEnviando(true)
    try {
      // En chats de ORDEN, marcamos quién puede leerlo (chofer/carrier/cliente).
      // En chats de oficina estos ids no existen → participantes vacío (sin campo).
      // `partProp` permite acotar explícitamente (p. ej. canal cliente↔oficina: solo
      // el cliente), sin depender de los ids de la orden.
      const participantes = partProp != null ? partProp.filter(Boolean) : [orden.choferId, orden.transportistaId, orden.clienteId].filter(Boolean)
      await enviarMensaje(tenantId, orden.id, usuario, { texto: t, urgente, ...extra }, participantes)
      setTexto(''); setUrgente(false)
    } finally { setEnviando(false) }
  }
  const onFoto = async (e) => { const f = await leerFotoReducida(e.target.files?.[0]); if (f) await enviar({ tipo: 'foto', foto: f }) }
  // Adjuntar un archivo (PDF, doc, etc.). Se guarda en línea; límite ~700 KB por el
  // tope de tamaño de un documento en Firestore. Para archivos grandes, avisa.
  const onArchivo = async (e) => {
    const f = e.target.files?.[0]; if (e.target) e.target.value = ''
    if (!f) return
    if (f.size > 700 * 1024) { alert(t('El archivo es muy grande. Máximo 700 KB (para archivos grandes, compártelos por otro medio).')); return }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f) }).catch(() => null)
    if (dataUrl) await enviar({ tipo: 'archivo', archivo: dataUrl, nombreArchivo: f.name, mime: f.type })
  }
  const compartirUbicacion = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((p) => enviar({ tipo: 'ubicacion', ubicacion: { lat: p.coords.latitude, lng: p.coords.longitude } }), () => {}, { timeout: 5000 })
  }

  // La "otra persona" del chat (a quién llamar en 1-a-1). PRIORIDAD: el TITULAR real del
  // chat cuando se conoce (prop `contacto` = el transportista/chofer/cliente/persona con
  // quien es la conversación), NO "el último que escribió". Sin esto, en un canal donde
  // solo respondieron administradores, la llamada iba al último admin en vez de al titular.
  // Si `contacto` viene definido pero sin uid (empresa sin cuenta), no hay a quién llamar.
  // Si NO viene (canales de oficina genéricos), se cae al autor más reciente distinto a mí.
  // ¿Es un chat de GRUPO? Entonces las llamadas son SIEMPRE grupales (a todos los
  // miembros); nunca 1-a-1 al último que escribió.
  const esGrupo = esConvGrupo(orden?.id)
  let otroAuto = null
  for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m.autorId && m.autorId !== usuario?.id) { otroAuto = { id: m.autorId, nombre: m.autorNombre, rol: m.autorRol }; break } }
  const otro = esGrupo
    ? null
    : (contacto !== null
        ? (contacto.uid && contacto.uid !== usuario?.id ? { id: contacto.uid, nombre: contacto.nombre || '', rol: contacto.rol || '' } : null)
        : otroAuto)
  // Todos los OTROS participantes distintos (por autor de mensaje) → para llamada GRUPAL.
  const otrosChat = []
  const vistosChat = new Set()
  for (const m of msgs) { if (m.autorId && m.autorId !== usuario?.id && !vistosChat.has(m.autorId)) { vistosChat.add(m.autorId); otrosChat.push({ uid: m.autorId, nombre: m.autorNombre, rol: m.autorRol }) } }
  // Contexto del chat para dejar historial de la llamada (perdida/duración) aquí mismo.
  const ctxLlamada = { chatId: orden?.id, participantes: partProp != null ? partProp.filter(Boolean) : [orden?.choferId, orden?.transportistaId, orden?.clienteId].filter(Boolean) }
  // Contexto para llamada grupal (incluye candidatos para "agregar personas" en curso).
  const ctxGrupo = { ...ctxLlamada, candidatos: otrosChat }
  // Abre el selector de personas (directorio + matriz) preseleccionando al TITULAR del
  // chat (p. ej. el transportista Aguilar) y a quienes ya participaron. Así NO se
  // preselecciona por error al último que escribió (un admin). Garantiza uids REALES.
  // Miembros del grupo (uids reales) = participantes del chat de grupo, menos yo.
  const miembrosGrupo = esGrupo ? [...new Set((partProp || []).filter((u) => u && u !== usuario?.id))] : []
  const nombreSala = esGrupo ? (orden?.numero || t('Grupo')) : (orden?.numero ? `${t('Operación')} ${orden.numero}` : t('Llamada grupal'))
  const preseleccionGrupo = [...new Set([contacto?.uid, ...otrosChat.map((x) => x.uid)].filter((u) => u && u !== usuario?.id))]
  // En un GRUPO se llama DIRECTO a todos los miembros (sin filtrar por la matriz: el
  // grupo ya define quién participa). En otros chats se abre el selector de contactos.
  const llamarGrupo = (tipo) => {
    if (esGrupo) {
      if (!miembrosGrupo.length) return
      iniciarGrupo(miembrosGrupo.map((uid) => ({ uid })), tipo, ctxGrupo, nombreSala)
    } else {
      pedirLlamadaGrupo(tipo, ctxGrupo, nombreSala, preseleccionGrupo)
    }
  }

  // Encabezado a mostrar: el titular del chat (con o sin cuenta). Si no hay ninguno
  // (canal vacío sin contacto conocido), no se pinta cabecera.
  const cab = esGrupo
    ? { id: null, nombre: orden?.numero || t('Grupo'), rol: '', grupo: true }
    : (otro || (contacto && (contacto.nombre || contacto.uid)
        ? { id: contacto.uid || null, nombre: contacto.nombre || t('Conversación'), rol: contacto.rol || '' }
        : null))
  return (
    <div className={`flex flex-col rounded-xl border border-slate-200 dark:border-slate-700/60 ${fill ? 'h-full' : ''}`}>
      {cab && (
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700/60">
          <Avatar foto={cab.id ? avatares[cab.id] : null} nombre={cab.nombre} size={32} />
          <button type="button" onClick={() => cab.id && setPerfilRapido(cab)} className="truncate text-sm font-bold text-brand-navy hover:underline dark:text-slate-100">{cab.nombre}</button>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Llamada 1-a-1: SOLO si el titular tiene cuenta (uid). Llama a ESA persona. */}
            {otro && (
              <>
                <button type="button" onClick={() => iniciar(otro.id, otro.nombre, 'audio', ctxLlamada)} title={t('Llamar')} className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600"><Phone size={15} /></button>
                <button type="button" onClick={() => iniciar(otro.id, otro.nombre, 'video', ctxLlamada)} title={t('Videollamada')} className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy text-white transition hover:opacity-90 dark:bg-slate-700"><Video size={15} /></button>
                <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
              </>
            )}
            <button type="button" onClick={() => llamarGrupo('audio')} title={t('Llamada grupal')} className="grid h-8 w-8 place-items-center rounded-full bg-amber-500 text-slate-900 transition hover:bg-amber-600"><Users size={15} /></button>
            <button type="button" onClick={() => llamarGrupo('video')} title={t('Videollamada grupal')} className="relative grid h-8 w-8 place-items-center rounded-full bg-amber-500 text-slate-900 transition hover:bg-amber-600"><Users size={13} /><Video size={9} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-brand-navy p-[1px] text-white" /></button>
          </div>
        </div>
      )}
      <div className={`scroll-thin space-y-2 overflow-y-auto p-3 ${fill ? 'min-h-0 flex-1' : ''}`} style={fill ? undefined : { maxHeight: alto }}>
        {msgs.length === 0 && <div className="py-6 text-center text-xs text-slate-400">{t('Sin mensajes. Escribe el primero.')}</div>}
        {msgs.map((m) => {
          const mio = m.autorId === usuario?.id
          const leidoPorOtro = (m.leidoPor || []).some((u) => u !== m.autorId)
          const puedeBorrar = mio || esAdmin
          return (
            <div key={m.id} className={`group flex items-center gap-1.5 ${mio ? 'justify-end' : 'justify-start'}`}>
              {!mio && (
                <div className="shrink-0 self-end">
                  <Avatar foto={avatares[m.autorId]} nombre={m.autorNombre} size={28} />
                </div>
              )}
              {mio && puedeBorrar && (
                <button type="button" onClick={() => borrarMensaje(m)} title={t('Eliminar mensaje')} className="order-1 opacity-0 transition group-hover:opacity-100 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
              )}
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mio ? 'order-2' : ''} ${m.urgente ? 'border border-rose-400 bg-rose-50 dark:bg-rose-500/10' : mio ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {!mio && (
                  <button type="button" onClick={() => setPerfilRapido({ id: m.autorId, nombre: m.autorNombre, rol: m.autorRol })}
                    className="mb-0.5 text-[10px] font-semibold opacity-70 hover:underline">
                    {m.autorNombre} · {t(BULK_ROLES_LABEL[m.autorRol]) || m.autorRol}
                  </button>
                )}
                {m.urgente && <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-rose-600"><AlertTriangle size={11} /> {t('URGENTE')}</div>}
                {m.tipo === 'foto' && m.foto && <img src={m.foto} alt="foto" loading="lazy" className="chat-img mb-1 max-h-40 rounded-lg" />}
                {m.tipo === 'ubicacion' && m.ubicacion && (
                  <a href={`https://maps.google.com/?q=${m.ubicacion.lat},${m.ubicacion.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><MapPin size={13} /> {t('Ver ubicación')}</a>
                )}
                {m.tipo === 'archivo' && m.archivo && (
                  <a href={m.archivo} download={m.nombreArchivo || 'archivo'} className="mb-0.5 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 underline dark:bg-white/10"><FileText size={16} /> <span className="truncate">{m.nombreArchivo || t('Archivo')}</span></a>
                )}
                {m.texto && <div className={`whitespace-pre-wrap break-words ${soloEmojis(m.texto) ? 'text-3xl leading-tight' : ''}`}>{m.texto}</div>}
                <div className={`mt-0.5 flex items-center gap-1 text-[9px] ${mio ? 'text-white/60 dark:text-slate-900/60' : 'text-slate-400'}`}>
                  {new Date(m.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  {mio && (leidoPorOtro ? <CheckCheck size={11} /> : <Check size={11} />)}
                </div>
              </div>
              {!mio && esAdmin && (
                <button type="button" onClick={() => borrarMensaje(m)} title={t('Eliminar mensaje')} className="opacity-0 transition group-hover:opacity-100 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
              )}
            </div>
          )
        })}
        <div ref={finRef} />
      </div>
      {/* Panel de emojis (tipo WhatsApp) */}
      {verEmojis && (
        <div className="scroll-thin grid max-h-36 grid-cols-8 gap-1 overflow-y-auto border-t border-slate-200 p-2 dark:border-slate-700/60">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => setTexto((s) => s + e)} className="rounded-lg py-1.5 text-xl transition hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-800">{e}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-slate-200 p-2 dark:border-slate-700/60">
        <button onClick={() => setVerEmojis((v) => !v)} title={t('Emojis')} className={`rounded-lg p-2 ${verEmojis ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Smile size={16} /></button>
        <button onClick={() => setUrgente((u) => !u)} title={t('Marcar urgente')} className={`rounded-lg p-2 ${urgente ? 'bg-rose-500 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><AlertTriangle size={16} /></button>
        <label className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('Enviar foto')}><Camera size={16} /><input type="file" accept="image/*" onChange={onFoto} className="hidden" /></label>
        <label className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('Adjuntar archivo')}><Paperclip size={16} /><input type="file" onChange={onArchivo} className="hidden" /></label>
        <button onClick={compartirUbicacion} title={t('Compartir ubicación')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><MapPin size={16} /></button>
        <Input className="flex-1" placeholder={urgente ? t('Mensaje URGENTE…') : t('Escribe un mensaje…')} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !enviando && (setVerEmojis(false), enviar())} />
        <button onClick={() => { setVerEmojis(false); enviar() }} disabled={enviando} className="rounded-lg bg-amber-500 p-2 text-slate-900 disabled:opacity-50"><Send size={16} /></button>
      </div>
      {perfilRapido && <PerfilRapido autor={perfilRapido} ctxLlamada={ctxLlamada} onClose={() => setPerfilRapido(null)} />}
    </div>
  )
}
