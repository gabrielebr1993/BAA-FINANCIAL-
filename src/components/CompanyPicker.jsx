// ============================================================================
// <CompanyPicker> — selector de COMPAÑÍA tras entrar a Última milla. Solo se
// muestra cuando el usuario tiene MÁS DE UNA empresa. Al elegir, llama onPick(id)
// (que hace setActiveCompanyId) y entra. NO toca auth ni rutas. Estilo del
// rediseño (navy, logo, EN/ES), acento azul de Última milla.
// ============================================================================
import { useLang } from '../i18n'
import { getModule, tx } from '../config/modules'
import MilePayLogo from './MilePayLogo'
import { ArrowRight, LogOut, Package } from 'lucide-react'

const UI = {
  title: { en: 'Which company do you want to open?', es: '¿Qué compañía quieres abrir?' },
  sub: { en: 'You have access to several companies. Pick one to work in — you can switch anytime from the menu.', es: 'Tienes acceso a varias compañías. Elige una para trabajar — puedes cambiar cuando quieras desde el menú.' },
  open: { en: 'Open', es: 'Abrir' },
  signout: { en: 'Sign out', es: 'Salir' },
}

const iniciales = (n) => (String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase()

export default function CompanyPicker({ companies = [], onPick, onSignOut }) {
  const { lang, setLang } = useLang()
  const m = getModule('package') // azul Última milla
  const t = (o) => tx(o, lang)

  return (
    <div className="min-h-[100dvh] bg-rd-navy font-sans text-white">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MilePayLogo dark size="text-lg" />
            <span className="hidden items-center gap-1.5 rounded-full border border-rd-navy-line px-3 py-1 font-mono text-[11px] uppercase tracking-wide sm:inline-flex" style={{ color: m.strong }}>
              <Package size={12} /> {t(m.name)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-full border border-rd-navy-line text-xs font-bold">
              {['en', 'es'].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase transition ${lang === l ? 'bg-white text-rd-navy' : 'text-rd-navy-sub hover:text-white'}`}>{l}</button>
              ))}
            </div>
            {onSignOut && (
              <button onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-full border border-rd-navy-line px-3.5 py-1.5 text-sm font-semibold text-rd-navy-sub transition hover:text-white">
                <LogOut size={15} /> {t(UI.signout)}
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-2xl text-center">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t(UI.title)}</h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-rd-navy-sub">{t(UI.sub)}</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 pb-14 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <div key={c.id} className="flex flex-col rounded-2xl border border-rd-navy-line bg-rd-navy-card p-5">
              <span className="grid h-13 w-13 place-items-center rounded-xl font-display text-lg font-extrabold" style={{ background: m.soft, color: m.strong, height: '52px', width: '52px' }}>{iniciales(c.nombre)}</span>
              <span className="mt-4 font-display text-xl font-bold text-white">{c.nombre || c.id}</span>
              <span className="mt-1 text-[13px] text-rd-navy-sub">{tx(m.label, lang)}</span>
              <button onClick={() => onPick?.(c.id)} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105" style={{ background: m.strong }}>
                {t(UI.open)} {c.nombre || c.id} <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
