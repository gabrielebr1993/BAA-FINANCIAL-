// ============================================================================
// Página PÚBLICA de firma de contrato (Walmart). Sin login: el token del enlace
// (?t=…) es la única llave y solo da acceso a ESE contrato. Toda la lectura y la
// firma pasan por Cloud Functions (walFirmaGet / walFirmaSet).
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'

const AZUL = '#13233f'
const GOLD = '#c9a24b'

export default function FirmaPublica() {
  const token = new URLSearchParams(window.location.search).get('t') || ''
  const [estado, setEstado] = useState('cargando') // cargando | ok | firmado | error
  const [contrato, setContrato] = useState(null)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!token) { setEstado('error'); setError('Enlace inválido.'); return }
    httpsCallable(getFunctions(), 'walFirmaGet')({ token })
      .then((r) => { setContrato(r.data); setNombre(r.data.driverNombre || ''); setEstado(r.data.yaFirmado ? 'firmado' : 'ok') })
      .catch((e) => { setEstado('error'); setError(e.message || 'No se pudo abrir el contrato.') })
  }, [token])

  const firmar = async () => {
    const cv = canvasRef.current
    if (!cv || cvVacio(cv)) { setError('Firma en el recuadro antes de finalizar.'); return }
    if (!nombre.trim()) { setError('Escribe tu nombre.'); return }
    if (!acepto) { setError('Marca la casilla de consentimiento.'); return }
    setError(''); setEnviando(true)
    try {
      await httpsCallable(getFunctions(), 'walFirmaSet')({ token, firma: cv.toDataURL('image/png'), nombreFirmante: nombre.trim() })
      setEstado('firmado')
    } catch (e) { setError(e.message || 'No se pudo firmar.') } finally { setEnviando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef0ec', fontFamily: 'system-ui, sans-serif', color: AZUL }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: AZUL, color: GOLD, display: 'grid', placeItems: 'center', fontWeight: 800 }}>M</div>
          <b style={{ fontSize: 18 }}>MilePay · Firma de contrato</b>
        </div>

        {estado === 'cargando' && <Caja>Cargando contrato…</Caja>}
        {estado === 'error' && <Caja><b style={{ color: '#c0392b' }}>No se pudo abrir</b><p style={{ color: '#5c6b84', marginTop: 6 }}>{error}</p></Caja>}

        {estado === 'firmado' && (
          <Caja>
            <div style={{ fontSize: 40 }}>✅</div>
            <b style={{ fontSize: 18 }}>Contrato firmado</b>
            <p style={{ color: '#5c6b84', marginTop: 6 }}>Gracias{nombre ? `, ${nombre}` : ''}. Tu firma quedó registrada. Puedes cerrar esta página.</p>
          </Caja>
        )}

        {estado === 'ok' && contrato && (
          <>
            <Caja>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: GOLD }}>{contrato.empresa}</div>
              <h1 style={{ fontSize: 20, margin: '4px 0 12px' }}>{contrato.titulo}</h1>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#2a3650', margin: 0 }}>{contrato.texto}</pre>
            </Caja>
            <Caja>
              <b style={{ fontSize: 15 }}>Firma</b>
              <p style={{ color: '#5c6b84', fontSize: 13, margin: '4px 0 10px' }}>Dibuja tu firma con el dedo o el mouse.</p>
              <Lienzo canvasRef={canvasRef} />
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8a97ac' }}>Tu nombre</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inp} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, color: '#2a3650' }}>
                <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} style={{ marginTop: 3 }} />
                <span>He revisado el documento completo y acepto firmarlo electrónicamente.</span>
              </label>
              {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{error}</p>}
              <button onClick={firmar} disabled={enviando} style={{ ...btn, marginTop: 14, opacity: enviando ? 0.6 : 1 }}>{enviando ? 'Enviando…' : 'Firmar y finalizar'}</button>
            </Caja>
          </>
        )}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#8a97ac', marginTop: 16 }}>Este enlace es individual y da acceso solo a este contrato.</p>
      </div>
    </div>
  )
}

const Caja = ({ children }) => <div style={{ background: '#fff', border: '1px solid #e4e2d8', borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 1px 2px rgba(19,35,63,.05),0 8px 24px rgba(19,35,63,.06)' }}>{children}</div>
const inp = { width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '9px 10px', borderRadius: 9, border: '1px solid #e4e2d8', fontSize: 15, fontFamily: 'inherit' }
const btn = { width: '100%', padding: '12px', border: 'none', borderRadius: 11, background: GOLD, color: AZUL, fontSize: 15, fontWeight: 700, cursor: 'pointer' }

function Lienzo({ canvasRef }) {
  const dibujando = useRef(false)
  const pos = (e, cv) => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) } }
  const start = (e) => { e.preventDefault(); dibujando.current = true; const cv = canvasRef.current; const ctx = cv.getContext('2d'); const p = pos(e, cv); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  const move = (e) => { if (!dibujando.current) return; e.preventDefault(); const cv = canvasRef.current; const ctx = cv.getContext('2d'); const p = pos(e, cv); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#13233f'; ctx.lineTo(p.x, p.y); ctx.stroke() }
  const end = () => { dibujando.current = false }
  const limpiar = () => { const cv = canvasRef.current; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height) }
  return (
    <div>
      <canvas ref={canvasRef} width={600} height={180}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ width: '100%', height: 150, border: '1px dashed #c9a24b', borderRadius: 10, background: '#fcfbf7', touchAction: 'none' }} />
      <button onClick={limpiar} style={{ marginTop: 6, background: 'none', border: 'none', color: '#8a97ac', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Borrar firma</button>
    </div>
  )
}

function cvVacio(cv) {
  const ctx = cv.getContext('2d'); const d = ctx.getImageData(0, 0, cv.width, cv.height).data
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false
  return true
}
