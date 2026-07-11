// Pad de FIRMA (tipo DocuSign): el chofer dibuja su firma con el dedo o el mouse.
// Devuelve la firma como PNG (dataURL) al confirmar. Fondo transparente.
import { useRef, useState, useEffect } from 'react'
import { Eraser } from 'lucide-react'
import { Boton } from './ui'

export default function FirmaCanvas({ onFirma, alto = 160 }) {
  const ref = useRef(null)
  const dibujando = useRef(false)
  const [hayTrazo, setHayTrazo] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    canvas.width = w * ratio
    canvas.height = alto * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#13233f'
  }, [alto])

  const pos = (e) => {
    const canvas = ref.current
    const r = canvas.getBoundingClientRect()
    const t = e.touches?.[0]
    const cx = (t ? t.clientX : e.clientX) - r.left
    const cy = (t ? t.clientY : e.clientY) - r.top
    return { x: cx, y: cy }
  }
  const inicio = (e) => { e.preventDefault(); dibujando.current = true; const ctx = ref.current.getContext('2d'); const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
  const mover = (e) => { if (!dibujando.current) return; e.preventDefault(); const ctx = ref.current.getContext('2d'); const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); setHayTrazo(true) }
  const fin = () => { dibujando.current = false }

  const limpiar = () => {
    const canvas = ref.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHayTrazo(false)
    onFirma?.(null)
  }
  const confirmar = () => { if (!hayTrazo) return; onFirma?.(ref.current.toDataURL('image/png').split(',')[1]) }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900/40" style={{ touchAction: 'none' }}>
        <canvas
          ref={ref}
          style={{ width: '100%', height: alto, display: 'block' }}
          onMouseDown={inicio} onMouseMove={mover} onMouseUp={fin} onMouseLeave={fin}
          onTouchStart={inicio} onTouchMove={mover} onTouchEnd={fin}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Boton variant="ghost" onClick={limpiar} className="px-3 py-1.5 text-xs"><Eraser size={14} strokeWidth={1.9} /> Borrar</Boton>
        <span className="text-xs text-slate-400">Firma con el dedo o el mouse.</span>
        <Boton variant="primary" onClick={confirmar} disabled={!hayTrazo} className="ml-auto px-3 py-1.5 text-xs">Usar esta firma</Boton>
      </div>
    </div>
  )
}
