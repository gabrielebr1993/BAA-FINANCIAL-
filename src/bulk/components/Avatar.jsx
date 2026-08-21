// BULK · Avatar de perfil REUTILIZABLE. Muestra la foto del usuario (dataURL) o, si no
// tiene, su inicial sobre un fondo de color estable (por nombre). Con `editable`, añade
// un botón de cámara para elegir/cambiar la foto (la reduce antes de guardar).
import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { leerFotoReducida } from './foto'

// Color de fondo estable a partir del nombre (para distinguir avatares sin foto).
const PALETA = ['#1e3a8a', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#4d7c0f', '#9333ea']
const colorDe = (s) => { let h = 0; for (const ch of (s || '?')) h = (h * 31 + ch.charCodeAt(0)) % 997; return PALETA[h % PALETA.length] }

export default function Avatar({ foto, nombre, size = 40, editable = false, onFoto, className = '', title }) {
  const inputRef = useRef(null)
  const inicial = ((nombre || '?').trim().charAt(0) || '?').toUpperCase()
  const box = { width: size, height: size }
  const elegir = async (e) => {
    const f = e.target.files?.[0]
    if (e.target) e.target.value = ''
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
          <button type="button" onClick={() => inputRef.current?.click()} title="Cambiar foto" className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-brand-gold text-slate-900 shadow ring-2 ring-white transition hover:scale-110 dark:ring-slate-900"><Camera size={11} /></button>
          <input ref={inputRef} type="file" accept="image/*" onChange={elegir} className="hidden" />
        </>
      )}
    </div>
  )
}
