import { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { Eye, EyeOff, ArrowLeft, FileText, Lock, Check } from 'lucide-react'
import { auth } from './firebase'
import { Spinner } from './components/ui'

function mensajeError(code) {
  const map = {
    'auth/invalid-email': 'El formato del correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/missing-password': 'Escribe tu contraseña.',
  }
  return map[code] || 'Ocurrió un error. Inténtalo de nuevo.'
}

// Velas del gráfico de fondo (precomputadas, sin datos reales). y crece hacia abajo.
// Área del gráfico: viewBox 0 0 640 280, base en y=250.
const VELAS = [
  { x: 40, sube: true, wickT: 150, wickB: 205, bodyT: 165, bodyB: 200 },
  { x: 82, sube: true, wickT: 135, wickB: 195, bodyT: 150, bodyB: 185 },
  { x: 124, sube: false, wickT: 130, wickB: 190, bodyT: 145, bodyB: 178 },
  { x: 166, sube: true, wickT: 110, wickB: 175, bodyT: 128, bodyB: 165 },
  { x: 208, sube: true, wickT: 95, wickB: 160, bodyT: 112, bodyB: 150 },
  { x: 250, sube: false, wickT: 100, wickB: 158, bodyT: 118, bodyB: 148 },
  { x: 292, sube: true, wickT: 80, wickB: 145, bodyT: 96, bodyB: 138 },
  { x: 334, sube: true, wickT: 62, wickB: 128, bodyT: 78, bodyB: 120 },
  { x: 376, sube: false, wickT: 70, wickB: 132, bodyT: 86, bodyB: 122 },
  { x: 418, sube: true, wickT: 55, wickB: 118, bodyT: 70, bodyB: 108 },
  { x: 460, sube: true, wickT: 40, wickB: 100, bodyT: 55, bodyB: 92 },
  { x: 502, sube: false, wickT: 48, wickB: 104, bodyT: 62, bodyB: 96 },
  { x: 544, sube: true, wickT: 30, wickB: 88, bodyT: 44, bodyB: 78 },
  { x: 586, sube: true, wickT: 18, wickB: 74, bodyT: 32, bodyB: 62 },
]
// Línea de tendencia dorada: sigue el cierre de cada vela.
const TENDENCIA = VELAS.map((v) => `${v.x},${v.sube ? v.bodyT : v.bodyB}`).join(' ')

const TICKER = [
  ['INGRESO', '▲', '$166,116'],
  ['GANANCIA', '▲', '$54,732'],
  ['MARGEN', '', '31.6%'],
  ['CLAIMS', '▼', '312'],
  ['PAQUETES', '▲', '101,024'],
  ['TICKET', '', '$1.64'],
]

function Ticker({ compacto = false }) {
  const fila = (
    <div className="flex shrink-0 items-center">
      {TICKER.map(([k, flecha, val], i) => (
        <span key={i} className="flex items-center whitespace-nowrap px-4">
          <span className="text-white/45">{k}</span>
          {flecha && (
            <span className={`ml-1.5 ${flecha === '▲' ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{flecha}</span>
          )}
          <span className="ml-1.5 text-brand-gold/90">{val}</span>
          <span className="ml-4 text-white/15">·</span>
        </span>
      ))}
    </div>
  )
  return (
    <div className={`overflow-hidden ${compacto ? 'py-2' : 'py-2.5'}`}>
      <div className="flex w-max font-mono text-[12px] tracking-wide" style={{ animation: 'slideTicker 22s linear infinite' }}>
        {fila}
        {fila}
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const [modoReset, setModoReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetCargando, setResetCargando] = useState(false)

  const entrar = async () => {
    if (cargando) return
    setError('')
    setCargando(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass)
    } catch (e) {
      setError(mensajeError(e.code))
    } finally {
      setCargando(false)
    }
  }

  const enviarReset = async () => {
    setResetMsg('')
    setError('')
    if (!resetEmail.trim()) return setError('Escribe tu correo para enviarte el enlace.')
    setResetCargando(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim())
      setResetMsg('Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja (y spam).')
    } catch (e) {
      setError(mensajeError(e.code))
    } finally {
      setResetCargando(false)
    }
  }

  const inputBase =
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500'

  return (
    <div className="flex min-h-screen bg-white dark:bg-surface-dark">
      {/* keyframes de las animaciones (velas, tendencia, ticker) */}
      <style>{`
        @keyframes growCandle { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes drawTrend { to { stroke-dashoffset: 0; } }
        @keyframes slideTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .mp-candle, .mp-trend { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>

      {/* ============ IZQUIERDA · formulario ============ */}
      <div className="flex w-full flex-col lg:w-[44%]">
        {/* franja compacta con ticker solo en móvil */}
        <div className="bg-brand-navy lg:hidden">
          <Ticker compacto />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            {/* logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-navy shadow-sm">
                <FileText size={22} strokeWidth={1.9} className="text-brand-gold" />
              </div>
              <div>
                <div className="text-xl font-extrabold leading-none text-brand-navy dark:text-slate-100">MilePay</div>
                <div className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-slate-400">GESTIÓN DE FACTURAS DE REPARTO</div>
              </div>
            </div>

            {!modoReset ? (
              <>
                <h1 className="m-0 mb-1 text-2xl font-bold text-brand-navy dark:text-slate-100">Acceso seguro</h1>
                <p className="m-0 mb-7 text-sm text-slate-500 dark:text-slate-400">Ingresa tus credenciales para continuar.</p>

                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Correo electrónico</label>
                <input
                  className={`mb-4 ${inputBase}`}
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && entrar()}
                />

                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Contraseña</label>
                <div className="relative mb-3">
                  <input
                    className={`pr-11 ${inputBase}`}
                    placeholder="••••••••"
                    type={verPass ? 'text' : 'password'}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && entrar()}
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass((v) => !v)}
                    aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {verPass ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
                  </button>
                </div>

                <div className="mb-5 flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={recordar}
                      onChange={(e) => setRecordar(e.target.checked)}
                      style={{ accentColor: '#13233f' }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    Recordarme
                  </label>
                  <button
                    type="button"
                    onClick={() => { setModoReset(true); setError(''); setResetEmail(email) }}
                    className="text-sm font-semibold text-brand-gold hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button
                  onClick={entrar}
                  disabled={cargando}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-navy-700 disabled:opacity-60"
                >
                  {cargando ? (<><Spinner /> Entrando…</>) : 'Iniciar sesión'}
                </button>

                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

                <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Lock size={14} strokeWidth={1.9} />
                  Conexión cifrada y protegida
                </div>
              </>
            ) : (
              <>
                <h1 className="m-0 mb-1 text-2xl font-bold text-brand-navy dark:text-slate-100">Recuperar contraseña</h1>
                <p className="m-0 mb-7 text-sm text-slate-500 dark:text-slate-400">Te enviaremos un enlace para crear una nueva contraseña.</p>

                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Correo electrónico</label>
                <input
                  className={`mb-4 ${inputBase}`}
                  placeholder="tucorreo@ejemplo.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && enviarReset()}
                />

                <button
                  onClick={enviarReset}
                  disabled={resetCargando}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-navy-700 disabled:opacity-60"
                >
                  {resetCargando ? (<><Spinner /> Enviando…</>) : 'Enviar enlace'}
                </button>

                <button
                  type="button"
                  onClick={() => { setModoReset(false); setError(''); setResetMsg('') }}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline dark:text-slate-300"
                >
                  <ArrowLeft size={14} strokeWidth={2} /> Volver a iniciar sesión
                </button>

                {resetMsg && <p className="mt-3 text-sm text-emerald-600">{resetMsg}</p>}
                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
              </>
            )}

            <p className="mt-10 text-center text-xs text-slate-400">© 2026 MilePay · Todos los derechos reservados</p>
          </div>
        </div>
      </div>

      {/* ============ DERECHA · panel de marca ============ */}
      <div
        className="relative hidden overflow-hidden text-white lg:flex lg:w-[56%] lg:flex-col"
        style={{ background: 'linear-gradient(160deg, #13233f 0%, #0e1a30 100%)' }}
      >
        {/* patrón de puntos muy sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.04,
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        {/* ticker superior */}
        <div className="relative z-20 border-b border-white/10">
          <Ticker />
        </div>

        {/* gráfico de bolsa al fondo, parte baja, semitransparente */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0" style={{ opacity: 0.45 }}>
          <svg viewBox="0 0 640 280" preserveAspectRatio="none" className="h-[46vh] w-full">
            {VELAS.map((v, i) => {
              const color = v.sube ? '#4ade80' : '#f87171'
              const top = Math.min(v.bodyT, v.bodyB)
              const alto = Math.max(4, Math.abs(v.bodyB - v.bodyT))
              return (
                <g
                  key={i}
                  className="mp-candle"
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'bottom',
                    animation: `growCandle 0.5s ease-out both`,
                    animationDelay: `${0.25 + i * 0.06}s`,
                  }}
                >
                  <line x1={v.x} y1={v.wickT} x2={v.x} y2={v.wickB} stroke={color} strokeWidth="1.4" />
                  <rect x={v.x - 8} y={top} width="16" height={alto} rx="1.5" fill={color} />
                </g>
              )
            })}
            {/* línea de tendencia dorada dibujándose encima */}
            <polyline
              className="mp-trend"
              points={TENDENCIA}
              fill="none"
              stroke="#c9a24b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: 'drawTrend 2.4s ease-out 0.4s forwards',
              }}
            />
          </svg>
        </div>

        {/* contenido principal encima de todo */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <div className="mb-6 h-1 w-14 rounded-full bg-brand-gold" />
          <h2 className="m-0 max-w-lg text-4xl font-bold leading-tight xl:text-[2.6rem]">
            El control financiero de tu operación <span className="text-brand-gold">de última milla</span>
          </h2>
          <p className="m-0 mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
            Calcula pagos, verifica facturas contra tu proveedor y controla tu rentabilidad — con la precisión que tu negocio exige.
          </p>

          <ul className="m-0 mt-9 list-none space-y-4 p-0">
            {[
              'Verificación al centavo con tu proveedor',
              'Pagos calculados automáticamente',
              'Datos cifrados y protegidos',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-slate-200">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: 'rgba(201,162,75,0.18)' }}>
                  <Check size={14} strokeWidth={2.5} className="text-brand-gold" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* marca abajo a la izquierda */}
        <div className="relative z-10 flex items-center gap-2.5 px-12 pb-10 xl:px-16">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">
            <FileText size={16} strokeWidth={1.9} className="text-brand-gold" />
          </div>
          <span className="text-sm font-bold tracking-wide text-white/90">MilePay</span>
        </div>
      </div>
    </div>
  )
}
