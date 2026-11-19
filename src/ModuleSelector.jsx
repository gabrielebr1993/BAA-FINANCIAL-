// ============================================================================
// SELECTOR `/elegir` — 4 tarjetas de módulo en grid (4/2/1 columnas, sin scroll
// horizontal). Cada botón lleva a la ruta de login ACTUAL de ese módulo. Lee de
// src/config/modules.js. Bilingüe EN/ES.
// ============================================================================
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useLang } from './i18n'
import { MODULES, tx } from './config/modules'
import MilePayLogo from './components/MilePayLogo'

// Se conservan por compatibilidad (elección previa guardada); el ruteo real es
// por URL, nadie más los lee hoy.
export function setModulo(m) { try { localStorage.setItem('mp_module', m) } catch { /* noop */ } }
export function getModulo() { try { return localStorage.getItem('mp_module') } catch { return null } }

const UI = {
  title: { en: 'Which module do you want to open?', es: '¿Qué módulo quieres abrir?' },
  sub: { en: 'Each business has its own screens and numbers. You can switch modules anytime after you sign in.', es: 'Cada negocio tiene sus propias pantallas y números. Puedes cambiar de módulo cuando quieras después de iniciar sesión.' },
  home: { en: 'Home', es: 'Inicio' },
  signInTo: { en: 'Sign in to', es: 'Entrar a' },
}

export default function ModuleSelector() {
  const navigate = useNavigate()
  const { lang, setLang } = useLang()
  const t = (o) => tx(o, lang)
  const abrir = (m) => { setModulo(m.id); navigate(m.loginRoute) }

  return (
    <div className="min-h-[100dvh] bg-rd-navy font-sans text-white">
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* barra superior */}
        <div className="flex items-center justify-between">
          <MilePayLogo dark size="text-lg" />
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-full border border-rd-navy-line text-xs font-bold">
              {['en', 'es'].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase transition ${lang === l ? 'bg-white text-rd-navy' : 'text-rd-navy-sub hover:text-white'}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 rounded-full border border-rd-navy-line px-3.5 py-1.5 text-sm font-semibold text-rd-navy-sub transition hover:text-white">
              <ArrowLeft size={15} /> {t(UI.home)}
            </button>
          </div>
        </div>

        {/* título */}
        <div className="mx-auto mt-12 max-w-2xl text-center">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t(UI.title)}</h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-rd-navy-sub">{t(UI.sub)}</p>
        </div>

        {/* grid de módulos */}
        <div className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-4 pb-14 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.id} className="flex flex-col rounded-2xl border border-rd-navy-line bg-rd-navy-card p-5">
              <span className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: m.soft, color: m.strong }}><m.icon size={22} /></span>
              <span className="mt-4 font-mono text-[11px] uppercase tracking-wide" style={{ color: m.strong }}>{t(m.phrase)}</span>
              <span className="mt-1 font-display text-xl font-bold text-white">{t(m.name)}</span>
              <ul className="mt-3 flex-1 space-y-1.5">
                {m.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-rd-navy-sub">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.strong }} /> {t(b)}
                  </li>
                ))}
              </ul>
              <button onClick={() => abrir(m)} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-rd-navy transition hover:brightness-95">
                {t(UI.signInTo)} {t(m.name)} <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
