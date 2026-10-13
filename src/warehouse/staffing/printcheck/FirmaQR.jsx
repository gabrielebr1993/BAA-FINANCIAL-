// ============================================================================
// PRINT CHECK · Página /firma-qr: firmar desde el iPad o el teléfono.
//
// Flujo: en la computadora (Print Check → Firmas → "Firmar con iPad") se
// genera un QR con un token de un solo uso; el iPad lo escanea, abre esta
// página, el dueño inicia sesión (el candado de Firestore exige su cuenta:
// escanear el QR por sí solo NO da acceso), dibuja la firma con el dedo o el
// Apple Pencil y la envía. La computadora la ve al instante y el dueño
// confirma guardarla en la biblioteca. El token caduca a los 15 minutos.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../../firebase'
import { esDuenoEcom } from '../../../ecommerce/datos'
import { Card, Boton, Aviso, Input, Spinner } from '../../../components/ui'
import { COL as _COL, refDoc, setDoc } from '../datosStaff'

const COL_PEND = 'wh_pc_firmas_pend'
const MAX_EDAD_MIN = 15

export default function FirmaQR() {
  const token = (window.location.hash || '').replace('#', '')
  const [user, setUser] = useState(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setCargando(false) }), [])

  if (!token) return <Pantalla><Aviso tipo="error">Enlace incompleto: vuelve a escanear el QR desde la computadora.</Aviso></Pantalla>
  if (cargando) return <Pantalla><div className="py-10 text-center"><Spinner /></div></Pantalla>
  if (!user) return <Pantalla><LoginMini /></Pantalla>
  if (!esDuenoEcom(user.email)) return <Pantalla><Aviso tipo="error">Esta cuenta no tiene acceso. Inicia sesión con la cuenta del dueño.</Aviso></Pantalla>
  return <Pantalla><PadFirma token={token} user={user} /></Pantalla>
}

function Pantalla({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mx-auto max-w-2xl pt-6">
        <div className="mb-4 text-center text-xl font-black text-white">MilePay · <span className="text-brand-gold">Firma remota</span></div>
        {children}
      </div>
    </div>
  )
}

function LoginMini() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)
  const entrar = async (e) => {
    e.preventDefault(); setError(''); setEntrando(true)
    try { await signInWithEmailAndPassword(auth, correo.trim(), clave) } catch { setError('Correo o contraseña incorrectos.') } finally { setEntrando(false) }
  }
  return (
    <Card className="p-6">
      <div className="mb-3 text-sm text-slate-500">Por seguridad, escanear el QR no da acceso por sí solo: confirma que eres tú.</div>
      <form onSubmit={entrar} className="space-y-3">
        <Input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <Input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" variant="gold" disabled={entrando} className="w-full">{entrando ? <Spinner /> : 'Entrar y firmar'}</Boton>
      </form>
    </Card>
  )
}

function PadFirma({ token, user }) {
  const ref = useRef(null)
  const [trazos, setTrazos] = useState([]) // [{color, grosor, puntos:[{x,y}]}]
  const [actual, setActual] = useState(null)
  const [grosor, setGrosor] = useState(3)
  const [color, setColor] = useState('#13233f')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  // la fecha del token viene en el propio token: qr_<timestamp>_<aleatorio>
  const creado = Number((token.split('_')[1] || 0))
  const caducado = creado && (Date.now() - creado) > MAX_EDAD_MIN * 60 * 1000

  const redibujar = (extra) => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const t of [...trazos, ...(extra ? [extra] : [])]) {
      ctx.strokeStyle = t.color; ctx.lineWidth = t.grosor; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath()
      t.puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    }
  }
  useEffect(() => { redibujar() })

  const punto = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (ref.current.width / r.width), y: (e.clientY - r.top) * (ref.current.height / r.height) }
  }
  const empezar = (e) => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); setActual({ color, grosor, puntos: [punto(e)] }) }
  const mover = (e) => { if (!actual) return; e.preventDefault(); const a = { ...actual, puntos: [...actual.puntos, punto(e)] }; setActual(a); redibujar(a) }
  const terminar = () => { if (actual && actual.puntos.length > 1) setTrazos([...trazos, actual]); setActual(null) }

  const enviar = async () => {
    if (!trazos.length) return
    setEnviando(true)
    try {
      await setDoc(refDoc(COL_PEND, token), {
        imagen: ref.current.toDataURL('image/png'),
        firmadoPor: user.email, firmadoEn: new Date().toISOString(),
      })
      setListo(true)
    } catch (e) { window.alert('No se pudo enviar: ' + (e.message || e)) } finally { setEnviando(false) }
  }

  if (caducado) return <Aviso tipo="error">Este QR ya caducó ({MAX_EDAD_MIN} min). Genera uno nuevo en la computadora.</Aviso>
  if (listo) {
    return (
      <Card className="p-8 text-center">
        <div className="text-4xl">✅</div>
        <div className="mt-2 text-lg font-black text-brand-navy dark:text-slate-100">Firma enviada</div>
        <p className="mt-2 text-sm text-slate-500">Vuelve a la computadora: ahí aparece la vista previa para confirmarla y guardarla en la biblioteca.</p>
      </Card>
    )
  }
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Firma aquí (dedo o Apple Pencil)</div>
      <canvas
        ref={ref} width={900} height={300}
        className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Grosor</span>
        {[2, 3, 5].map((g) => <button key={g} onClick={() => setGrosor(g)} className={`grid h-8 w-8 place-items-center rounded-lg border ${grosor === g ? 'border-brand-gold bg-amber-50' : 'border-slate-200'}`}><span className="rounded-full bg-slate-800" style={{ width: g * 2, height: g * 2 }} /></button>)}
        <span className="ml-2 text-slate-500">Color</span>
        {['#13233f', '#000000', '#1d4ed8'].map((c) => <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-lg border-2 ${color === c ? 'border-brand-gold' : 'border-transparent'}`} style={{ background: c }} />)}
        <span className="ml-auto flex gap-2">
          <Boton variant="ghost" onClick={() => setTrazos(trazos.slice(0, -1))}>Deshacer</Boton>
          <Boton variant="ghost" onClick={() => setTrazos([])}>Borrar</Boton>
          <Boton variant="gold" disabled={enviando || !trazos.length} onClick={enviar}>{enviando ? <Spinner /> : 'Guardar y enviar'}</Boton>
        </span>
      </div>
    </Card>
  )
}
