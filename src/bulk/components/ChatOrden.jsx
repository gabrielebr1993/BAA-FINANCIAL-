// Chat en tiempo real de UNA orden. Reutilizable en cualquier portal (chofer, staff,
// transportista, cliente). Texto, foto, ubicación, marca de urgente y confirmación de
// lectura. Elimina la necesidad de WhatsApp para la operación.
import { useEffect, useRef, useState } from 'react'
import { Send, Camera, MapPin, AlertTriangle, Check, CheckCheck, Smile } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { enviarMensaje, suscribirChat, marcarLeidos } from '../data/chat'
import { leerFotoReducida } from './foto'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { Input } from '../../components/ui'
import { useLang } from '../../i18n'

// Emojis frecuentes estilo WhatsApp (caras, manitos, corazones, trabajo).
const EMOJIS = ['👍', '👎', '🙏', '👌', '💪', '👏', '🤝', '✌️', '😀', '😅', '😂', '🙂', '😉', '😍', '🤔', '😎', '😢', '😡', '🥳', '😴', '❤️', '🧡', '💛', '💚', '💙', '🔥', '⭐', '✅', '❌', '⚠️', '🚚', '⛽', '📍', '⏰', '💰', '📦', '🛻', '🏭', '👋', '🆗']
// ¿El mensaje es solo emojis (para mostrarlo grande, como WhatsApp)?
const soloEmojis = (s) => { const x = (s || '').replace(/\s/g, ''); return x.length > 0 && x.length <= 8 && !/[0-9a-zA-ZÀ-ɏ]/.test(x) }

export default function ChatOrden({ orden, alto = 340, fill = false, participantes: partProp = null }) {
  const { t } = useLang()
  const { usuario, tenantId } = useBulkAuth()
  const [msgs, setMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [verEmojis, setVerEmojis] = useState(false)
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
    if (!t && !extra.foto && !extra.ubicacion) return
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
  const compartirUbicacion = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((p) => enviar({ tipo: 'ubicacion', ubicacion: { lat: p.coords.latitude, lng: p.coords.longitude } }), () => {}, { timeout: 5000 })
  }

  return (
    <div className={`flex flex-col rounded-xl border border-slate-200 dark:border-slate-700/60 ${fill ? 'h-full' : ''}`}>
      <div className={`scroll-thin space-y-2 overflow-y-auto p-3 ${fill ? 'min-h-0 flex-1' : ''}`} style={fill ? undefined : { maxHeight: alto }}>
        {msgs.length === 0 && <div className="py-6 text-center text-xs text-slate-400">{t('Sin mensajes. Escribe el primero.')}</div>}
        {msgs.map((m) => {
          const mio = m.autorId === usuario?.id
          const leidoPorOtro = (m.leidoPor || []).some((u) => u !== m.autorId)
          return (
            <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.urgente ? 'border border-rose-400 bg-rose-50 dark:bg-rose-500/10' : mio ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {!mio && <div className="mb-0.5 text-[10px] font-semibold opacity-70">{m.autorNombre} · {t(BULK_ROLES_LABEL[m.autorRol]) || m.autorRol}</div>}
                {m.urgente && <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-rose-600"><AlertTriangle size={11} /> {t('URGENTE')}</div>}
                {m.tipo === 'foto' && m.foto && <img src={m.foto} alt="foto" className="mb-1 max-h-40 rounded-lg" />}
                {m.tipo === 'ubicacion' && m.ubicacion && (
                  <a href={`https://maps.google.com/?q=${m.ubicacion.lat},${m.ubicacion.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><MapPin size={13} /> {t('Ver ubicación')}</a>
                )}
                {m.texto && <div className={`whitespace-pre-wrap break-words ${soloEmojis(m.texto) ? 'text-3xl leading-tight' : ''}`}>{m.texto}</div>}
                <div className={`mt-0.5 flex items-center gap-1 text-[9px] ${mio ? 'text-white/60 dark:text-slate-900/60' : 'text-slate-400'}`}>
                  {new Date(m.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  {mio && (leidoPorOtro ? <CheckCheck size={11} /> : <Check size={11} />)}
                </div>
              </div>
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
        <button onClick={compartirUbicacion} title={t('Compartir ubicación')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><MapPin size={16} /></button>
        <Input className="flex-1" placeholder={urgente ? t('Mensaje URGENTE…') : t('Escribe un mensaje…')} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !enviando && (setVerEmojis(false), enviar())} />
        <button onClick={() => { setVerEmojis(false); enviar() }} disabled={enviando} className="rounded-lg bg-amber-500 p-2 text-slate-900 disabled:opacity-50"><Send size={16} /></button>
      </div>
    </div>
  )
}
