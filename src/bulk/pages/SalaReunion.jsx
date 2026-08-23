// ============================================================================
// BULK · Sala de una reunión (usuarios de MilePay). Embebe Daily Prebuilt (iframe
// con token de anfitrión): video/audio, mute, cámara, compartir pantalla, chat,
// participantes y lobby (admitir invitados). El token lo entrega el backend.
// ============================================================================
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, StopCircle, Video, Phone, Radio } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useDoc } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { Cargando, Aviso, Boton, EstadoVacio } from '../../components/ui'
import { useLang } from '../../i18n'

export default function SalaReunion() {
  const { t } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const { usuario } = useBulkAuth()
  const { dato: reunion, cargando } = useDoc('meetings', id)
  const [sala, setSala] = useState(null) // { url, token }
  const [err, setErr] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    if (!id || sala || pidiendo || !reunion || reunion.estado === 'finalizada') return
    setPidiendo(true)
    const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
    fn({ op: 'token', id, nombre: usuario?.nombre || usuario?.email || '' })
      .then((r) => setSala(r?.data || null))
      .catch((e) => setErr(e?.message || t('No se pudo entrar a la reunión.')))
      .finally(() => setPidiendo(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reunion?.estado])

  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meet/${reunion?.codigo}`) } catch { /* noop */ }
  }
  const finalizar = async () => {
    if (!window.confirm(t('¿Finalizar la reunión para todos? El link dejará de funcionar.'))) return
    try {
      const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
      await fn({ op: 'finalizar', id })
      navigate('/bulk/reuniones')
    } catch (e) { setErr(e?.message || t('No se pudo finalizar.')) }
  }

  if (cargando) return <Cargando />
  if (!reunion) return <EstadoVacio titulo={t('Reunión no encontrada')} texto={t('Puede que se haya borrado o el enlace sea incorrecto.')} mostrarBoton={false} />
  if (reunion.estado === 'finalizada') {
    return (
      <div>
        <button onClick={() => navigate('/bulk/reuniones')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver a Reuniones')}</button>
        <EstadoVacio titulo={t('Esta reunión ya finalizó')} texto={`${reunion.titulo}${reunion.duracionMin ? ` · ${reunion.duracionMin} min` : ''}`} mostrarBoton={false} />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)', minHeight: 480 }}>
      {/* Barra superior */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => navigate('/bulk/reuniones')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><ArrowLeft size={15} /> {t('Salir')}</button>
        <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: reunion.tipo === 'voz' ? '#3f9d6b' : '#13233f' }}>{reunion.tipo === 'voz' ? <Phone size={16} /> : <Video size={16} />}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-brand-navy dark:text-slate-100">{reunion.titulo}</div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Radio size={11} className="animate-pulse" /> {t('En vivo')}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Boton variant="ghost" onClick={copiarLink} className="px-3 py-1.5 text-xs"><Copy size={14} /> {t('Copiar link')}</Boton>
          <Boton variant="danger" onClick={finalizar} className="px-3 py-1.5 text-xs"><StopCircle size={14} /> {t('Finalizar para todos')}</Boton>
        </div>
      </div>

      {err && <Aviso tipo="error">{err}</Aviso>}

      {/* Sala embebida (Daily Prebuilt) */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-card dark:border-slate-700">
        {!sala ? (
          <div className="grid h-full place-items-center"><Cargando texto={t('Conectando a la sala…')} /></div>
        ) : (
          <iframe
            title={reunion.titulo}
            src={`${sala.url}?t=${sala.token}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; clipboard-write"
            className="h-full w-full"
            style={{ border: 0 }}
          />
        )}
      </div>
    </div>
  )
}
