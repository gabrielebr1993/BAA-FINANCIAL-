// ============================================================================
// WALMART · Acceso directo (enlace compartible) + login propio.
//
// Ruta /walmart: inicio de sesión con la identidad visual de MilePay (mismos
// campos, botones y espaciados que el login general) pero con el acento azul
// de Walmart. Tras entrar, el usuario va DIRECTO a Walmart sin pasar por el
// selector de módulos. La redirección por rol la resuelve WalmartApp:
//   · driver  → su portal del chofer
//   · manager → operación de sus almacenes (primeras pestañas permitidas)
//   · admin   → funciones autorizadas
//   · dueño   → acceso total
//
// El enlace NO lleva contraseñas ni salta la autenticación: solo apunta a esta
// pantalla. Aislado al módulo Walmart; no cambia el login de otros módulos.
// ============================================================================
import { lazy, Suspense, useEffect, useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { Eye, EyeOff, Lock, ArrowLeft, Truck, PackageCheck, MapPin } from 'lucide-react'
import { auth } from '../firebase'
import { AuthProvider, useAuth } from '../AuthContext'
import { CarrierProvider } from '../carriers/CarrierContext'
import { Spinner } from '../components/ui'

const WalmartApp = lazy(() => import('./WalmartApp'))
const AZUL = '#0071dc'
const AMARILLO = '#ffc220'

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

function WalmartLogin() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [modoReset, setModoReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetCargando, setResetCargando] = useState(false)

  const entrar = async () => {
    if (cargando) return
    setError(''); setCargando(true)
    try { await signInWithEmailAndPassword(auth, email.trim(), pass) }
    catch (e) { setError(mensajeError(e.code)) }
    finally { setCargando(false) }
  }
  const enviarReset = async () => {
    setResetMsg(''); setError('')
    if (!resetEmail.trim()) return setError('Escribe tu correo para enviarte el enlace.')
    setResetCargando(true)
    try { await sendPasswordResetEmail(auth, resetEmail.trim()); setResetMsg('Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja (y spam).') }
    catch (e) { setError(mensajeError(e.code)) }
    finally { setResetCargando(false) }
  }

  const inputBase = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--azul)] focus:ring-2 focus:ring-[color:var(--azul)]/15 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500'

  return (
    <div className="flex min-h-screen bg-white dark:bg-surface-dark" style={{ '--azul': AZUL }}>
      {/* ============ IZQUIERDA · formulario ============ */}
      <div className="flex w-full flex-col lg:w-[44%]">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            {/* logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl shadow-sm" style={{ background: AZUL }}>
                <span className="text-xl font-black" style={{ color: AMARILLO }}>W</span>
              </div>
              <div>
                <div className="text-xl font-extrabold leading-none text-brand-navy dark:text-slate-100">MilePay <span style={{ color: AZUL }}>· Walmart</span></div>
                <div className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-slate-400">PORTAL DE OPERACIÓN Y CHOFERES</div>
              </div>
            </div>

            {!modoReset ? (
              <>
                <h1 className="m-0 mb-1 text-2xl font-bold text-brand-navy dark:text-slate-100">Acceso Walmart</h1>
                <p className="m-0 mb-7 text-sm text-slate-500 dark:text-slate-400">Ingresa con tu correo y contraseña para continuar.</p>

                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Correo electrónico</label>
                <input className={`mb-4 ${inputBase}`} placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} autoComplete="username" />

                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Contraseña</label>
                <div className="relative mb-5">
                  <input className={`pr-11 ${inputBase}`} placeholder="••••••••" type={verPass ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} autoComplete="current-password" />
                  <button type="button" onClick={() => setVerPass((v) => !v)} aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    {verPass ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
                  </button>
                </div>

                <div className="mb-5 flex justify-end">
                  <button type="button" onClick={() => { setModoReset(true); setError(''); setResetEmail(email) }} className="text-sm font-semibold hover:underline" style={{ color: AZUL }}>¿Olvidaste tu contraseña?</button>
                </div>

                <button onClick={entrar} disabled={cargando} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" style={{ background: AZUL }}>
                  {cargando ? (<><Spinner /> Entrando…</>) : 'Iniciar sesión'}
                </button>
                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

                <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400"><Lock size={14} strokeWidth={1.9} /> Conexión cifrada y protegida</div>
              </>
            ) : (
              <>
                <h1 className="m-0 mb-1 text-2xl font-bold text-brand-navy dark:text-slate-100">Recuperar contraseña</h1>
                <p className="m-0 mb-7 text-sm text-slate-500 dark:text-slate-400">Te enviaremos un enlace para crear una nueva contraseña.</p>
                <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">Correo electrónico</label>
                <input className={`mb-4 ${inputBase}`} placeholder="tucorreo@ejemplo.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarReset()} />
                <button onClick={enviarReset} disabled={resetCargando} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" style={{ background: AZUL }}>
                  {resetCargando ? (<><Spinner /> Enviando…</>) : 'Enviar enlace'}
                </button>
                <button type="button" onClick={() => { setModoReset(false); setError(''); setResetMsg('') }} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline" style={{ color: AZUL }}><ArrowLeft size={14} strokeWidth={2} /> Volver a iniciar sesión</button>
                {resetMsg && <p className="mt-3 text-sm text-emerald-600">{resetMsg}</p>}
                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
              </>
            )}

            <p className="mt-10 text-center text-xs text-slate-400">© 2026 MilePay · Blue Box Logistic LLC</p>
          </div>
        </div>
      </div>

      {/* ============ DERECHA · panel de marca (logística) ============ */}
      <div className="relative hidden overflow-hidden text-white lg:flex lg:w-[56%] lg:flex-col" style={{ background: `linear-gradient(160deg, ${AZUL} 0%, #004f9a 100%)` }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: 0.06, backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        {/* ilustración simple de logística */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-10 bottom-10 opacity-20"><Truck size={320} strokeWidth={0.7} /></div>
          <div className="absolute left-10 top-16 opacity-15"><PackageCheck size={120} strokeWidth={0.8} /></div>
          <div className="absolute right-24 top-24 opacity-15"><MapPin size={90} strokeWidth={0.8} /></div>
        </div>
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <div className="mb-6 h-1 w-14 rounded-full" style={{ background: AMARILLO }} />
          <h2 className="m-0 max-w-lg text-4xl font-bold leading-tight xl:text-[2.6rem]">Tu operación de <span style={{ color: AMARILLO }}>última milla</span>, bajo control</h2>
          <p className="m-0 mt-5 max-w-md text-[15px] leading-relaxed text-white/85">Rutas, pagos, Fast Pay y liquidaciones semanales — para managers y choferes, cada quien con su acceso.</p>
          <ul className="m-0 mt-9 list-none space-y-4 p-0">
            {['Choferes: tus rutas, pagos y recibos', 'Managers: operación de tus almacenes', 'Pagos y Fast Pay con comprobantes'].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: 'rgba(255,194,32,0.22)' }}><PackageCheck size={14} strokeWidth={2.5} style={{ color: AMARILLO }} /></span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative z-10 flex items-center gap-2.5 px-12 pb-10 xl:px-16">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><span className="text-sm font-black" style={{ color: AMARILLO }}>W</span></div>
          <span className="text-sm font-bold tracking-wide text-white/90">MilePay · Walmart</span>
        </div>
      </div>
    </div>
  )
}

// Puerta del acceso directo: login propio → Walmart (sin selector de módulos).
function Puerta() {
  const { user, cargando } = useAuth()
  // Al entrar, fija la compañía activa en Walmart (por si luego navega al selector).
  useEffect(() => { if (user) { try { localStorage.setItem('mp_carrier', 'walmart') } catch { /* sin storage */ } } }, [user])
  if (cargando) return <div className="grid min-h-screen place-items-center bg-white dark:bg-surface-dark"><Spinner /></div>
  if (!user) return <WalmartLogin />
  return (
    <CarrierProvider>
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-surface dark:bg-surface-dark"><Spinner /></div>}>
        <WalmartApp />
      </Suspense>
    </CarrierProvider>
  )
}

export default function WalmartAcceso() {
  return (
    <AuthProvider>
      <Puerta />
    </AuthProvider>
  )
}
