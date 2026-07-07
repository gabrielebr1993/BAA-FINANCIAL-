import { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from './firebase'
import { COLORS } from './constants'
import Ilustracion from './components/Ilustracion'
import { Spinner } from './components/ui'

// Traduce códigos de error de Firebase a mensajes claros en español.
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

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  // recuperación de contraseña
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
    if (!resetEmail.trim()) {
      setError('Escribe tu correo para enviarte el enlace.')
      return
    }
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

  const onKey = (e) => e.key === 'Enter' && entrar()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: COLORS.bg }}>
      {/* Panel lateral con ilustración */}
      <div
        className="gofo-loginhero"
        style={{
          flex: 1,
          background: `linear-gradient(160deg, ${COLORS.navy} 0%, #0d1930 100%)`,
          color: '#fff',
          padding: 48,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: COLORS.gold, color: COLORS.navy, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 24 }}>
            G
          </div>
          <div style={{ fontWeight: 800, fontSize: 26 }}>Gofo</div>
        </div>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '0 0 12px', maxWidth: 420 }}>
          Gestión de facturas de <span style={{ color: COLORS.gold }}>reparto</span>
        </h1>
        <p style={{ color: '#aebbd4', maxWidth: 400, margin: '0 0 24px', fontSize: 15 }}>
          Verifica tus totales con Gofo al centavo, controla pagos a choferes y mide el rendimiento por ciudad.
        </p>
        <Ilustracion height={280} />
      </div>

      {/* Panel del formulario */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {!modoReset ? (
            <>
              <h2 style={{ color: COLORS.navy, margin: '0 0 4px' }}>Iniciar sesión</h2>
              <p style={{ color: COLORS.muted, margin: '0 0 24px', fontSize: 14 }}>Entra para acceder a tu panel.</p>

              <label style={labelStyle}>Correo</label>
              <input
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKey}
                style={inputStyle}
              />

              <label style={labelStyle}>Contraseña</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  placeholder="••••••••"
                  type={verPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={onKey}
                  style={{ ...inputStyle, marginBottom: 0, paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setVerPass((v) => !v)}
                  aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={verPass ? 'Ocultar' : 'Mostrar'}
                  style={ojoStyle}
                >
                  {verPass ? '🙈' : '👁️'}
                </button>
              </div>

              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => { setModoReset(true); setError(''); setResetEmail(email) }}
                  style={linkBtnStyle}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <button onClick={entrar} disabled={cargando} style={{ ...btnStyle, opacity: cargando ? 0.8 : 1, cursor: cargando ? 'default' : 'pointer' }}>
                {cargando ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <Spinner /> Entrando…
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>

              {error && <p style={{ color: COLORS.red, marginTop: 12, fontSize: 14 }}>{error}</p>}
            </>
          ) : (
            <>
              <h2 style={{ color: COLORS.navy, margin: '0 0 4px' }}>Recuperar contraseña</h2>
              <p style={{ color: COLORS.muted, margin: '0 0 24px', fontSize: 14 }}>
                Te enviaremos un enlace para crear una nueva contraseña.
              </p>

              <label style={labelStyle}>Correo</label>
              <input
                placeholder="tucorreo@ejemplo.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviarReset()}
                style={inputStyle}
              />

              <button onClick={enviarReset} disabled={resetCargando} style={{ ...btnStyle, opacity: resetCargando ? 0.8 : 1, cursor: resetCargando ? 'default' : 'pointer' }}>
                {resetCargando ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <Spinner /> Enviando…
                  </span>
                ) : (
                  'Enviar enlace'
                )}
              </button>

              <button type="button" onClick={() => { setModoReset(false); setError(''); setResetMsg('') }} style={{ ...linkBtnStyle, display: 'block', marginTop: 16 }}>
                ← Volver a iniciar sesión
              </button>

              {resetMsg && <p style={{ color: COLORS.green, marginTop: 12, fontSize: 14 }}>{resetMsg}</p>}
              {error && <p style={{ color: COLORS.red, marginTop: 12, fontSize: 14 }}>{error}</p>}
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 780px) {
          .gofo-loginhero { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 13, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }
const inputStyle = { width: '100%', padding: '11px 12px', marginBottom: 16, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 15, outline: 'none' }
const btnStyle = { width: '100%', padding: 12, background: COLORS.navy, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15 }
const ojoStyle = { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }
const linkBtnStyle = { background: 'transparent', border: 'none', color: COLORS.navy, cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'underline', padding: 0 }
