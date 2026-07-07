import { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from './firebase'
import Ilustracion from './components/Ilustracion'
import { Spinner, Input, Boton } from './components/ui'

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

// Íconos de ojo (SVG inline).
function OjoAbierto() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function OjoTachado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function Login() {
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

  return (
    <div className="flex min-h-screen bg-surface-light">
      {/* panel ilustración */}
      <div className="hidden flex-1 flex-col justify-center bg-gradient-to-br from-brand-navy to-brand-navy-900 p-12 text-white md:flex">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gold text-2xl font-extrabold text-brand-navy">G</div>
          <div className="text-2xl font-extrabold">Gofo</div>
        </div>
        <h1 className="m-0 mb-3 max-w-md text-3xl font-bold leading-tight">
          Gestión de facturas de <span className="text-brand-gold">reparto</span>
        </h1>
        <p className="m-0 mb-6 max-w-sm text-[15px] text-slate-300">
          Verifica tus totales con Gofo al centavo, controla pagos a choferes y mide el rendimiento por ciudad.
        </p>
        <Ilustracion height={280} />
      </div>

      {/* panel formulario */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {!modoReset ? (
            <>
              <h2 className="m-0 mb-1 text-2xl font-bold text-brand-navy">Iniciar sesión</h2>
              <p className="m-0 mb-6 text-sm text-slate-500">Entra para acceder a tu panel.</p>

              <label className="mb-1.5 block text-sm font-semibold text-slate-600">Correo</label>
              <Input
                className="mb-4 w-full"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && entrar()}
              />

              <label className="mb-1.5 block text-sm font-semibold text-slate-600">Contraseña</label>
              <div className="relative mb-2">
                <Input
                  className="w-full pr-11"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                >
                  {verPass ? <OjoTachado /> : <OjoAbierto />}
                </button>
              </div>

              <div className="mb-4 text-right">
                <button
                  type="button"
                  onClick={() => { setModoReset(true); setError(''); setResetEmail(email) }}
                  className="text-xs font-semibold text-brand-navy underline hover:text-brand-navy-700"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <Boton onClick={entrar} disabled={cargando} className="w-full">
                {cargando ? (
                  <>
                    <Spinner /> Entrando…
                  </>
                ) : (
                  'Entrar'
                )}
              </Boton>

              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </>
          ) : (
            <>
              <h2 className="m-0 mb-1 text-2xl font-bold text-brand-navy">Recuperar contraseña</h2>
              <p className="m-0 mb-6 text-sm text-slate-500">Te enviaremos un enlace para crear una nueva contraseña.</p>

              <label className="mb-1.5 block text-sm font-semibold text-slate-600">Correo</label>
              <Input
                className="mb-4 w-full"
                placeholder="tucorreo@ejemplo.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviarReset()}
              />

              <Boton onClick={enviarReset} disabled={resetCargando} className="w-full">
                {resetCargando ? (
                  <>
                    <Spinner /> Enviando…
                  </>
                ) : (
                  'Enviar enlace'
                )}
              </Boton>

              <button
                type="button"
                onClick={() => { setModoReset(false); setError(''); setResetMsg('') }}
                className="mt-4 block text-xs font-semibold text-brand-navy underline hover:text-brand-navy-700"
              >
                ← Volver a iniciar sesión
              </button>

              {resetMsg && <p className="mt-3 text-sm text-emerald-600">{resetMsg}</p>}
              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
