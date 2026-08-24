// ============================================================================
// BULK · Sala de una reunión (usuarios de MilePay). Pide el token de anfitrión
// al backend y ABRE la sala en la capa flotante global (ReunionProvider): la
// videollamada puede minimizarse y seguir activa mientras se navega por
// cualquier sección del sistema.
// ============================================================================
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Maximize2, Radio, Video, Phone } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useDoc } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { useReunion } from '../components/ReunionProvider'
import { Cargando, Aviso, Boton, EstadoVacio, Card } from '../../components/ui'
import { useLang } from '../../i18n'

export default function SalaReunion() {
  const { t } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const { usuario } = useBulkAuth()
  const { dato: reunion, cargando } = useDoc('meetings', id)
  const reunionCtx = useReunion()
  const [err, setErr] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)

  const yaActiva = reunionCtx.activa?.id === id

  useEffect(() => {
    if (!id || pidiendo || !reunion || reunion.estado === 'finalizada') return
    // Si esta reunión YA está activa en la capa flotante, solo la restauramos.
    if (yaActiva) { reunionCtx.restaurar(); return }
    setPidiendo(true)
    const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
    fn({ op: 'token', id, nombre: usuario?.nombre || usuario?.email || '' })
      .then((r) => {
        const sala = r?.data || null
        if (!sala?.url) { setErr(t('No se pudo entrar a la reunión.')); return }
        reunionCtx.abrir({ id, titulo: reunion.titulo, tipo: reunion.tipo, codigo: reunion.codigo, url: sala.url, token: sala.token })
      })
      .catch((e) => setErr(e?.message || t('No se pudo entrar a la reunión.')))
      .finally(() => setPidiendo(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reunion?.estado])

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

  // La sala se ve en la capa flotante; esta página queda como "ancla" con estado.
  return (
    <div>
      <button onClick={() => navigate('/bulk/reuniones')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver a Reuniones')}</button>
      {err && <Aviso tipo="error">{err}</Aviso>}
      <Card className="mx-auto max-w-md p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: reunion.tipo === 'voz' ? '#3f9d6b' : '#13233f' }}>{reunion.tipo === 'voz' ? <Phone size={24} /> : <Video size={24} />}</span>
        <h3 className="mt-3 text-base font-black text-brand-navy dark:text-slate-100">{reunion.titulo}</h3>
        {yaActiva ? (
          <>
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><Radio size={11} className="animate-pulse" /> {t('Estás conectado')}</div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('La llamada está en la ventana flotante. Puedes minimizarla y navegar por el sistema sin salir de la reunión.')}</p>
            <Boton variant="gold" className="mt-3 w-full justify-center" onClick={reunionCtx.restaurar}><Maximize2 size={15} /> {t('Abrir la llamada')}</Boton>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{pidiendo ? t('Conectando a la sala…') : t('Preparando la sala…')}</p>
        )}
      </Card>
    </div>
  )
}
