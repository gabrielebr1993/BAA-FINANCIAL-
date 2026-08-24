// ============================================================================
// BULK · Reunión FLOTANTE (Picture-in-Picture propio). La sala de Daily vive en
// este proveedor GLOBAL (no en la página), así el iframe de la videollamada NO
// se desmonta al navegar: el usuario puede minimizarla a una ventanita flotante,
// recorrer cualquier sección (Dashboard, Órdenes, Facturación, Chat…) y
// restaurarla o colgar cuando quiera. El mismo iframe cambia solo de tamaño
// (pantalla completa ↔ mini), por lo que la llamada nunca se corta.
// ============================================================================
import { createContext, useCallback, useContext, useState } from 'react'
import { Copy, Maximize2, Minimize2, PhoneOff, Radio, StopCircle, Video, Phone } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useLang } from '../../i18n'

const Ctx = createContext(null)
export const useReunion = () => useContext(Ctx) || { activa: null, modo: 'full', abrir: () => {}, minimizar: () => {}, restaurar: () => {}, colgar: () => {} }

export default function ReunionProvider({ children }) {
  const { t } = useLang()
  const [activa, setActiva] = useState(null) // { id, titulo, tipo, codigo, url, token }
  const [modo, setModo] = useState('full')   // 'full' | 'mini'
  const [copiado, setCopiado] = useState(false)

  const abrir = useCallback((r) => {
    setActiva((cur) => (cur && cur.id === r.id ? cur : r))
    setModo('full')
  }, [])
  const minimizar = useCallback(() => setModo('mini'), [])
  const restaurar = useCallback(() => setModo('full'), [])
  const colgar = useCallback(() => setActiva(null), [])

  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meet/${activa?.codigo}`); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* noop */ }
  }
  const finalizarTodos = async () => {
    if (!activa) return
    if (!window.confirm(t('¿Finalizar la reunión para todos? El link dejará de funcionar.'))) return
    try {
      const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
      await fn({ op: 'finalizar', id: activa.id })
    } catch { /* si falla, al menos colgamos localmente */ }
    setActiva(null)
  }

  const full = modo === 'full'
  return (
    <Ctx.Provider value={{ activa, modo, abrir, minimizar, restaurar, colgar }}>
      {children}
      {activa && (
        <div className={full
          ? 'fixed inset-0 z-[85] flex flex-col bg-slate-950'
          : 'fixed bottom-4 right-3 z-[85] flex w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl'}>
          {/* Barra de control (cambia según el tamaño) */}
          <div className={`flex items-center gap-2 bg-slate-900/95 text-white ${full ? 'px-4 py-2.5' : 'px-2.5 py-1.5'}`}>
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg" style={{ background: activa.tipo === 'voz' ? '#3f9d6b' : '#13233f' }}>{activa.tipo === 'voz' ? <Phone size={13} /> : <Video size={13} />}</span>
            <div className="min-w-0 flex-1">
              <div className={`truncate font-bold ${full ? 'text-sm' : 'text-xs'}`}>{activa.titulo || t('Reunión')}</div>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400"><Radio size={9} className="animate-pulse" /> {t('En vivo')}</div>
            </div>
            {full && (
              <>
                <button onClick={copiarLink} title={t('Copiar link de invitación')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"><Copy size={13} /> {copiado ? t('Copiado') : t('Copiar link')}</button>
                <button onClick={finalizarTodos} title={t('Finalizar para todos')} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"><StopCircle size={13} /> {t('Finalizar')}</button>
              </>
            )}
            <button onClick={full ? minimizar : restaurar} title={full ? t('Minimizar (la llamada sigue activa)') : t('Restaurar')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-slate-800">
              {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={colgar} title={t('Salir de la llamada')} className="grid h-8 w-8 place-items-center rounded-lg bg-rose-600/90 text-white hover:bg-rose-700"><PhoneOff size={14} /></button>
          </div>
          {/* El MISMO iframe en ambos tamaños (React reutiliza el nodo → la llamada no se corta). */}
          <iframe
            title={activa.titulo || 'Reunión'}
            src={`${activa.url}?t=${activa.token}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; clipboard-write"
            className={full ? 'min-h-0 w-full flex-1' : 'aspect-video w-full'}
            style={{ border: 0 }}
          />
        </div>
      )}
    </Ctx.Provider>
  )
}
