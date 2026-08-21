// BULK · Avatar de perfil REUTILIZABLE. Muestra la foto del usuario (dataURL) o, si no
// tiene, su inicial sobre un fondo de color estable (por nombre). Con `editable`, añade
// un botón de cámara que abre un menú para elegir la foto DE LA GALERÍA o TOMARLA con la
// cámara del dispositivo (la reduce antes de guardar).
import { useRef, useState } from 'react'
import { Camera, Image as ImageIcon, X, Trash2 } from 'lucide-react'
import { leerFotoReducida } from './foto'
import { useLang } from '../../i18n'

// Color de fondo estable a partir del nombre (para distinguir avatares sin foto).
const PALETA = ['#1e3a8a', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#4d7c0f', '#9333ea']
const colorDe = (s) => { let h = 0; for (const ch of (s || '?')) h = (h * 31 + ch.charCodeAt(0)) % 997; return PALETA[h % PALETA.length] }

export default function Avatar({ foto, nombre, size = 40, editable = false, onFoto, className = '', title }) {
  const { t } = useLang()
  const galRef = useRef(null)   // galería (sin capture → el SO ofrece la fototeca)
  const camRef = useRef(null)   // cámara (capture → abre la cámara directamente)
  const [menu, setMenu] = useState(false)
  const inicial = ((nombre || '?').trim().charAt(0) || '?').toUpperCase()
  const box = { width: size, height: size }
  const elegir = async (e) => {
    const f = e.target.files?.[0]
    if (e.target) e.target.value = ''
    setMenu(false)
    if (!f) return
    const dataUrl = await leerFotoReducida(f, 256, 0.72).catch(() => null)
    if (dataUrl && onFoto) onFoto(dataUrl)
  }
  return (
    <div className={`relative flex-shrink-0 ${className}`} style={box} title={title || nombre || ''}>
      {foto
        ? <img src={foto} alt={nombre || ''} className="h-full w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700" style={box} />
        : <div className="grid h-full w-full place-items-center rounded-xl font-black text-white" style={{ ...box, background: colorDe(nombre), fontSize: Math.round(size * 0.42) }}>{inicial}</div>}
      {editable && (
        <>
          <button type="button" onClick={() => setMenu(true)} title={t('Cambiar foto')} className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-brand-gold text-slate-900 shadow ring-2 ring-white transition hover:scale-110 dark:ring-slate-900"><Camera size={11} /></button>
          {/* Entradas ocultas: una para galería, otra para cámara. */}
          <input ref={galRef} type="file" accept="image/*" onChange={elegir} className="hidden" />
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
          {/* Hoja inferior con las opciones (funciona igual en móvil y escritorio). */}
          {menu && (
            <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setMenu(false)}>
              <div className="w-full max-w-sm rounded-t-2xl bg-white p-2 shadow-2xl dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center px-2 py-2">
                  <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Foto de perfil')}</span>
                  <button type="button" onClick={() => setMenu(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
                </div>
                <button type="button" onClick={() => galRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <ImageIcon size={18} className="text-brand-gold" /> {t('Elegir de la galería')}
                </button>
                <button type="button" onClick={() => camRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Camera size={18} className="text-brand-gold" /> {t('Tomar una foto')}
                </button>
                {foto && onFoto && (
                  <button type="button" onClick={() => { setMenu(false); onFoto(null) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                    <Trash2 size={18} /> {t('Eliminar foto')}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
