// ============================================================================
// FREIGHT · Inicio de sesión (rediseño "Opción A": marca arriba + tarjeta).
// SOLO cambia el diseño: la autenticación (iniciarSesion), el toggle ES/EN,
// "Cambiar de módulo" y el ver/ocultar contraseña se conservan tal cual.
// Extra: "¿Olvidaste tu contraseña?" envía el correo de restablecimiento de
// Firebase con el correo escrito en el campo (no toca la sesión ni el ruteo).
// ============================================================================
import { useState } from 'react'
import { Truck, ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { useBulkAuth } from './BulkAuthContext'
import { authBulk } from './firebaseBulk'
import { Aviso, Spinner } from '../components/ui'
import { useLang, LangToggle } from '../i18n'

const F_DISPLAY = "'Space Grotesk','Inter',sans-serif"
const F_MONO = "'JetBrains Mono',ui-monospace,monospace"

export default function BulkLogin() {
  const { t } = useLang()
  const { iniciarSesion } = useBulkAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [verPass, setVerPass] = useState(false)
  const [msg, setMsg] = useState(null) // { tipo: 'error'|'ok', txt }
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const enviar = async (e) => {
    e.preventDefault(); setMsg(null); setOcupado(true)
    try {
      await iniciarSesion(form.email, form.password)
    } catch (err) { setMsg({ tipo: 'error', txt: t(err.message) }) } finally { setOcupado(false) }
  }

  // Restablecer contraseña: usa el correo escrito en el campo.
  const olvido = async () => {
    setMsg(null)
    const email = form.email.trim()
    if (!email) { setMsg({ tipo: 'error', txt: t('Escribe tu correo arriba y vuelve a tocar el enlace.') }); return }
    try {
      await sendPasswordResetEmail(authBulk, email)
      setMsg({ tipo: 'ok', txt: t('Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja (y el spam).') })
    } catch {
      setMsg({ tipo: 'error', txt: t('No se pudo enviar el correo. Verifica que esté bien escrito.') })
    }
  }

  // Caja de campo con ícono integrado (foco: borde dorado + halo sutil).
  const Caja = ({ children }) => (
    <div className="flex items-center gap-2.5 rounded-[13px] border border-white/10 bg-white/5 px-3.5 transition focus-within:border-amber-400/70 focus-within:ring-2 focus-within:ring-amber-400/20">
      {children}
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'linear-gradient(180deg,#16294a 0%,#0a1424 100%)' }}>
      {/* Barra superior: cambiar de módulo + idioma (funciones intactas) */}
      <div className="flex items-center justify-between px-5 pt-5">
        <Link to="/elegir" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
          <ArrowLeft size={15} /> {t('Cambiar de módulo')}
        </Link>
        <LangToggle />
      </div>

      {/* Bloque de marca: tile dorado con glow + wordmark + tagline + mini-ruta */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="relative mb-5">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/25 blur-[46px]" aria-hidden="true" />
          <div className="relative grid h-[82px] w-[82px] place-items-center rounded-[24px] shadow-lg shadow-amber-900/40" style={{ background: 'linear-gradient(135deg,#e0b95f,#a9863a)' }}>
            <Truck size={40} strokeWidth={2} className="text-[#0a1424]" />
          </div>
        </div>
        <div className="text-[28px] font-bold leading-none text-white" style={{ fontFamily: F_DISPLAY }}>
          MilePay <span className="text-[#c9a24b]">Freight</span>
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-slate-400" style={{ fontFamily: F_MONO }}>
          {t('Despacho de materiales a granel')}
        </div>
        {/* Mini-ruta decorativa: línea punteada con 3 puntos y el camión pasando */}
        <div className="fr-route relative mt-6 h-8 w-full max-w-[260px]">
          <div className="fr-road" aria-hidden="true" />
          <span className="fr-pin" style={{ left: '6%' }} aria-hidden="true" />
          <span className="fr-pin" style={{ left: '50%' }} aria-hidden="true" />
          <span className="fr-pin" style={{ left: '94%' }} aria-hidden="true" />
          <div className="fr-truck" aria-hidden="true"><Truck size={17} strokeWidth={2} /></div>
        </div>
      </div>

      {/* Tarjeta del formulario: sube desde abajo (móvil) / centrada (desktop) */}
      <div className="w-full rounded-t-[28px] bg-[#0d1a30] px-6 pb-9 pt-7 shadow-[0_-18px_50px_rgba(0,0,0,.45)] sm:mx-auto sm:mb-10 sm:max-w-md sm:rounded-[28px] sm:px-8 sm:shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <h1 className="m-0 text-[22px] font-bold text-white" style={{ fontFamily: F_DISPLAY }}>{t('Bienvenido de vuelta')}</h1>
        <p className="mb-5 mt-1 text-sm text-slate-400">{t('Inicia sesión para continuar.')}</p>

        {msg && <Aviso tipo={msg.tipo === 'ok' ? 'ok' : 'error'} className="mb-3">{msg.txt}</Aviso>}

        <form onSubmit={enviar} className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400" style={{ fontFamily: F_MONO }}>{t('Correo')}</label>
            <Caja>
              <Mail size={17} className="shrink-0 text-[#c9a24b]" />
              <input
                type="email" required autoComplete="email" inputMode="email"
                placeholder={t('tucorreo@empresa.com')} value={form.email} onChange={set('email')}
                className="h-12 w-full bg-transparent text-base text-white placeholder-slate-500 outline-none"
              />
            </Caja>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400" style={{ fontFamily: F_MONO }}>{t('Contraseña')}</label>
            <Caja>
              <Lock size={17} className="shrink-0 text-[#c9a24b]" />
              <input
                type={verPass ? 'text' : 'password'} required autoComplete="current-password"
                placeholder="••••••••" value={form.password} onChange={set('password')}
                className="h-12 w-full bg-transparent text-base text-white placeholder-slate-500 outline-none"
              />
              <button type="button" onClick={() => setVerPass((v) => !v)} aria-label={verPass ? t('Ocultar contraseña') : t('Mostrar contraseña')} className="shrink-0 p-1.5 text-slate-400 transition hover:text-slate-200">
                {verPass ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
              </button>
            </Caja>
          </div>

          <button
            type="submit" disabled={ocupado}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-base font-bold text-[#13233f] shadow-[0_12px_30px_-8px_rgba(201,162,75,.55)] transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#c9a24b,#b8912f)' }}
          >
            {ocupado ? <><Spinner /> {t('Procesando…')}</> : t('Iniciar sesión')}
          </button>
        </form>

        <div className="mt-3 text-right">
          <button type="button" onClick={olvido} className="text-sm font-semibold text-[#c9a24b] underline-offset-2 transition hover:underline">
            {t('¿Olvidaste tu contraseña?')}
          </button>
        </div>
      </div>

      {/* Mini-ruta: misma animación de marca de siempre, reestilizada en dorado */}
      <style>{`
        .fr-road { position:absolute; left:0; right:0; bottom:12px; height:2px;
          background:repeating-linear-gradient(90deg, rgba(201,162,75,.55) 0 12px, transparent 12px 24px);
          animation: fr-flow .7s linear infinite; }
        .fr-pin { position:absolute; bottom:9px; width:8px; height:8px; margin-left:-4px; border-radius:9999px;
          background:#c9a24b; box-shadow:0 0 0 3px rgba(201,162,75,.18); animation: fr-pulse 2.4s ease-in-out infinite; }
        .fr-truck { position:absolute; bottom:14px; color:#e0b95f; filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));
          animation: fr-drive 6.5s cubic-bezier(.5,0,.5,1) infinite, fr-bob .6s ease-in-out infinite; }
        @keyframes fr-flow { to { background-position-x:-24px; } }
        @keyframes fr-drive { 0% { left:-8%; opacity:0; } 8% { opacity:1; } 92% { opacity:1; } 100% { left:100%; opacity:0; } }
        @keyframes fr-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-1.5px); } }
        @keyframes fr-pulse { 0%,100% { box-shadow:0 0 0 3px rgba(201,162,75,.18); } 50% { box-shadow:0 0 0 5px rgba(201,162,75,.06); } }
        @media (prefers-reduced-motion: reduce) {
          .fr-road, .fr-truck, .fr-pin { animation:none; }
          .fr-truck { left:50%; }
        }
      `}</style>
    </div>
  )
}
