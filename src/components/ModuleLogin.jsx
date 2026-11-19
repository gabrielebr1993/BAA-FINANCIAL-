// ============================================================================
// <ModuleLogin> — login ÚNICO para los 4 módulos. Idéntico en todos; solo
// cambian color y mensajes (vienen de src/config/modules.js). La LÓGICA de
// autenticación se recibe por props (onSignIn/onReset) para conservar EXACTO
// el login de cada módulo (misma función Firebase, misma redirección por auth).
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, Lock, ShieldCheck, Loader2 } from 'lucide-react'
import { useLang } from '../i18n'
import { MODULES, getModule, tx } from '../config/modules'
import MilePayLogo from './MilePayLogo'
import ModulePreview from './ModulePreview'

const UI = {
  switch: { en: 'Switch module', es: 'Cambiar módulo' },
  welcome: { en: 'Welcome back', es: 'Bienvenido de nuevo' },
  choose: { en: 'Choose your module and sign in.', es: 'Elige tu módulo e inicia sesión.' },
  email: { en: 'Email', es: 'Correo' },
  password: { en: 'Password', es: 'Contraseña' },
  show: { en: 'Show', es: 'Mostrar' },
  hide: { en: 'Hide', es: 'Ocultar' },
  forgot: { en: 'Forgot password?', es: '¿Olvidaste tu contraseña?' },
  keep: { en: 'Keep me signed in on this device', es: 'Mantener la sesión en este dispositivo' },
  signIn: { en: 'Sign in to', es: 'Entrar a' },
  encrypted: { en: 'Encrypted connection', es: 'Conexión cifrada' },
  newTo: { en: 'New to MilePay?', es: '¿Nuevo en MilePay?' },
  demo: { en: 'Request a demo', es: 'Solicita una demo' },
  samplePreview: { en: 'Sample preview', es: 'Vista previa de ejemplo' },
  errEmailEmpty: { en: 'Enter your email.', es: 'Escribe tu correo.' },
  errEmail: { en: 'Enter a valid email.', es: 'Escribe un correo válido.' },
  errPass: { en: 'Enter your password.', es: 'Escribe tu contraseña.' },
  resetPrompt: { en: 'Enter your email above to get a reset link.', es: 'Escribe tu correo arriba para enviarte el enlace.' },
  resetSent: { en: 'We sent you a reset link. Check your inbox (and spam).', es: 'Te enviamos un enlace. Revisa tu bandeja (y spam).' },
}

function errMsg(code, lang) {
  const map = {
    'auth/invalid-email': { en: 'The email format is not valid.', es: 'El formato del correo no es válido.' },
    'auth/user-not-found': { en: 'No account exists with that email.', es: 'No existe una cuenta con ese correo.' },
    'auth/wrong-password': { en: 'Wrong email or password.', es: 'Correo o contraseña incorrectos.' },
    'auth/invalid-credential': { en: 'Wrong email or password.', es: 'Correo o contraseña incorrectos.' },
    'auth/too-many-requests': { en: 'Too many attempts. Wait a moment and try again.', es: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' },
    'auth/missing-password': { en: 'Enter your password.', es: 'Escribe tu contraseña.' },
  }
  const e = map[code] || { en: 'Something went wrong. Try again.', es: 'Ocurrió un error. Inténtalo de nuevo.' }
  return e[lang] ?? e.en
}

export default function ModuleLogin({ moduleId, onSignIn, onReset }) {
  const m = getModule(moduleId)
  const navigate = useNavigate()
  const { lang, setLang } = useLang()
  const L = (k) => UI[k][lang] ?? UI[k].en
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [ver, setVer] = useState(false)
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cargando, setCargando] = useState(false)
  const Icono = m.icon

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const entrar = async (e) => {
    e?.preventDefault?.()
    if (cargando) return
    setError(''); setInfo('')
    if (!email.trim()) return setError(L('errEmailEmpty'))
    if (!emailOk) return setError(L('errEmail'))
    if (!pass) return setError(L('errPass'))
    setCargando(true)
    try { await onSignIn(email.trim(), pass) } catch (err) { setError(errMsg(err?.code, lang)) } finally { setCargando(false) }
  }

  const olvido = async () => {
    setError(''); setInfo('')
    if (!emailOk) return setError(L('resetPrompt'))
    try { await onReset?.(email.trim()); setInfo(L('resetSent')) } catch (err) { setError(errMsg(err?.code, lang)) }
  }

  const inputCls = 'w-full rounded-xl border border-rd-line bg-white px-3.5 py-2.5 text-[15px] text-rd-ink outline-none transition placeholder:text-rd-ink-sub/70 focus:border-[color:var(--acc)] focus:ring-2 focus:ring-[color:var(--acc)]/20'

  return (
    <div className="min-h-[100dvh] bg-rd-bg font-sans text-rd-ink" style={{ '--acc': m.strong }}>
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col lg:grid lg:grid-cols-2">
        {/* ── IZQUIERDA (navy) ── */}
        <section className="relative flex flex-col justify-between overflow-hidden bg-rd-navy px-6 py-8 text-white sm:px-10 lg:py-14">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: m.strong }} />
          <MilePayLogo dark size="text-lg" />
          <div className="relative my-8 lg:my-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rd-navy-line px-3 py-1 font-mono text-[11px] uppercase tracking-wide" style={{ color: m.strong }}>
              <Icono size={13} /> {tx(m.label, lang)}
            </div>
            <h1 className="max-w-md font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">{tx(m.loginTitle, lang)}</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-rd-navy-sub">{tx(m.paragraph, lang)}</p>
            <div className="mt-6 max-w-sm">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-rd-navy-sub">{L('samplePreview')}</div>
              <ModulePreview module={m} lang={lang} compact sampleLabel={lang === 'en' ? 'Sample data' : 'Datos de ejemplo'} />
            </div>
          </div>
          <div className="relative hidden items-center gap-2 text-[12px] text-rd-navy-sub lg:flex">
            <ShieldCheck size={14} /> {L('encrypted')}
          </div>
        </section>

        {/* ── DERECHA (claro) ── */}
        <section className="flex flex-col px-6 py-8 sm:px-10 lg:py-14">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/elegir')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rd-ink-sub transition hover:text-rd-ink">
              <ArrowLeft size={16} /> {L('switch')}
            </button>
            <div className="inline-flex overflow-hidden rounded-full border border-rd-line text-xs font-bold">
              {['en', 'es'].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase transition ${lang === l ? 'bg-rd-navy text-white' : 'text-rd-ink-sub hover:bg-rd-bg'}`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-rd-ink">{L('welcome')}</h2>
            <p className="mt-1 text-sm text-rd-ink-sub">{L('choose')}</p>

            {/* selector de módulo 2×2 */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              {MODULES.map((x) => {
                const Ix = x.icon; const activo = x.id === m.id
                return (
                  <button key={x.id} type="button" onClick={() => { if (!activo) navigate(x.loginRoute) }}
                    aria-pressed={activo}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${activo ? 'border-transparent text-white' : 'border-rd-line bg-white text-rd-ink hover:border-rd-ink-sub/40'}`}
                    style={activo ? { background: x.strong } : undefined}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: activo ? 'rgba(255,255,255,.22)' : x.soft, color: activo ? '#fff' : x.strong }}><Ix size={15} /></span>
                    <span className="truncate">{tx(x.name, lang)}</span>
                  </button>
                )
              })}
            </div>

            <form onSubmit={entrar} className="mt-5 space-y-3">
              <div>
                <label htmlFor="ml-email" className="mb-1 block text-xs font-semibold text-rd-ink-sub">{L('email')}</label>
                <input id="ml-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="ml-pass" className="block text-xs font-semibold text-rd-ink-sub">{L('password')}</label>
                  <button type="button" onClick={() => setVer((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-rd-ink-sub hover:text-rd-ink">
                    {ver ? <EyeOff size={13} /> : <Eye size={13} />} {ver ? L('hide') : L('show')}
                  </button>
                </div>
                <input id="ml-pass" type={ver ? 'text' : 'password'} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} placeholder="••••••••" />
              </div>

              <div className="flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-rd-ink-sub">
                  <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 rounded border-rd-line" style={{ accentColor: m.strong }} /> {L('keep')}
                </label>
              </div>

              <button type="submit" disabled={cargando} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-70" style={{ background: m.strong }}>
                {cargando ? <Loader2 size={17} className="animate-spin" /> : <Lock size={16} />} {L('signIn')} {tx(m.name, lang)}
              </button>

              <div className="flex items-center justify-between">
                <button type="button" onClick={olvido} className="text-xs font-semibold text-rd-ink-sub hover:text-rd-ink">{L('forgot')}</button>
                <span className="inline-flex items-center gap-1 text-[11px] text-rd-ink-sub lg:hidden"><ShieldCheck size={12} /> {L('encrypted')}</span>
              </div>

              {error && <p role="alert" className="rounded-lg bg-rd-parcel-soft px-3 py-2 text-sm font-medium" style={{ background: '#FDECEA', color: '#C0392B' }}>{error}</p>}
              {info && <p className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: m.soft, color: m.strong }}>{info}</p>}
            </form>

            <p className="mt-6 text-center text-xs text-rd-ink-sub">
              {L('newTo')}{' '}
              <button onClick={() => navigate('/')} className="font-semibold" style={{ color: m.strong }}>{L('demo')}</button>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
