// Avatar de perfil (chofer/manager): muestra la foto o un ícono de reemplazo, y al
// tocar la foto la amplía a pantalla completa (lightbox) para ver el detalle.
import { useState } from 'react'
import { Maximize2, X } from 'lucide-react'

export default function FotoPerfil({ url, alt = '', icon: Icon, grande = true, ringClass = 'ring-1 ring-slate-200 dark:ring-slate-700' }) {
  const [zoom, setZoom] = useState(false)
  const dim = grande ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14'
  const iconSize = grande ? 34 : 26

  if (!url) {
    return (
      <div className={`grid ${dim} flex-shrink-0 place-items-center rounded-2xl bg-brand-navy text-brand-gold ${ringClass}`}>
        {Icon && <Icon size={iconSize} strokeWidth={1.8} />}
      </div>
    )
  }
  return (
    <>
      <button onClick={() => setZoom(true)} title="Ampliar foto" className={`group relative ${dim} flex-shrink-0 overflow-hidden rounded-2xl ${ringClass}`}>
        <img src={url} alt={alt} className="h-full w-full object-cover transition group-hover:brightness-90" />
        <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 size={13} strokeWidth={2} /></span>
      </button>
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          <img src={url} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" />
          <button onClick={() => setZoom(false)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25" aria-label="Cerrar">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
      )}
    </>
  )
}
