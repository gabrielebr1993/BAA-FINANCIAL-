// Pad de firma digital sobre <canvas> (sin librerías). Devuelve un dataURL PNG.
import { useRef, useState, useEffect } from 'react'
import { Eraser } from 'lucide-react'

export default function FirmaPad({ onChange, alto = 160 }) {
  const ref = useRef(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a'
  }, [])

  const pos = (e) => {
    const c = ref.current, r = c.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }
  }
  const start = (e) => { e.preventDefault(); dibujando.current = true; const { x, y } = pos(e); const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(x, y) }
  const move = (e) => { if (!dibujando.current) return; e.preventDefault(); const { x, y } = pos(e); const ctx = ref.current.getContext('2d'); ctx.lineTo(x, y); ctx.stroke(); if (vacio) setVacio(false) }
  const end = () => { if (!dibujando.current) return; dibujando.current = false; if (!vacio) onChange?.(ref.current.toDataURL('image/png')) }
  const limpiar = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setVacio(true); onChange?.(null) }

  return (
    <div>
      <canvas ref={ref} width={600} height={alto}
        className="w-full touch-none rounded-xl border border-slate-300 bg-white dark:border-slate-600"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>{vacio ? 'Firma aquí' : 'Firmado'}</span>
        <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 hover:text-slate-600"><Eraser size={12} /> Borrar</button>
      </div>
    </div>
  )
}
