// ============================================================================
// PORTADA `/` — hero navy INTERACTIVO por módulo + secciones. Lee todo de
// src/config/modules.js. Datos de ejemplo (nunca reales). Bilingüe EN/ES.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { useLang } from '../i18n'
import { MODULES, getModule, tx } from '../config/modules'
import MilePayLogo from '../components/MilePayLogo'
import ModulePreview from '../components/ModulePreview'
import Warehouse3DSection from '../components/Warehouse3DSection'

const UI = {
  nav: {
    modules: { en: 'Modules', es: 'Módulos' },
    how: { en: 'How it works', es: 'Cómo funciona' },
    pricing: { en: 'Pricing', es: 'Precios' },
    faq: { en: 'FAQ', es: 'FAQ' },
    signin: { en: 'Sign in', es: 'Iniciar sesión' },
    demo: { en: 'Request a demo', es: 'Solicita una demo' },
  },
  explore: { en: 'Explore', es: 'Explorar' },
  sampleData: { en: 'Sample data', es: 'Datos de ejemplo' },
  what: { en: 'What moves your business?', es: '¿Qué mueve tu negocio?' },
  whatSub: { en: 'Pick what you do. MilePay shapes itself around it.', es: 'Elige lo que haces. MilePay se adapta a ti.' },
  benefits: [
    { en: 'Numbers that balance', es: 'Números que cuadran' },
    { en: 'Live tracking', es: 'Seguimiento en vivo' },
    { en: 'One login, every module', es: 'Un login, todos los módulos' },
    { en: 'English & Spanish', es: 'Inglés y español' },
  ],
  thatSimple: { en: 'That simple', es: 'Así de simple' },
  steps: [
    { t: { en: 'Pick your module', es: 'Elige tu módulo' }, d: { en: 'Last mile, freight, warehouse or ecommerce.', es: 'Última milla, freight, bodega o ecommerce.' } },
    { t: { en: 'Sign in', es: 'Inicia sesión' }, d: { en: 'One account. Switch modules anytime.', es: 'Una cuenta. Cambia de módulo cuando quieras.' } },
    { t: { en: 'Run your operation', es: 'Opera tu negocio' }, d: { en: 'Real numbers, real control — every day.', es: 'Números reales, control real — cada día.' } },
  ],
  finalTitle: { en: 'Ready to see your numbers balance?', es: '¿Listo para ver tus números cuadrar?' },
  finalSub: { en: 'Choose a module and sign in — or request a demo.', es: 'Elige un módulo e inicia sesión — o pide una demo.' },
  getStarted: { en: 'Get started', es: 'Empezar' },
  rights: { en: 'All rights reserved.', es: 'Todos los derechos reservados.' },
}

export default function HomeRedesign() {
  const navigate = useNavigate()
  const { lang, setLang } = useLang()
  const [sel, setSel] = useState('package')
  const m = getModule(sel)
  const heroRef = useRef(null)
  useEffect(() => { document.title = lang === 'en' ? 'MilePay — One platform for your operation' : 'MilePay — Una plataforma para tu operación' }, [lang])

  const irHero = (id) => { setSel(id); heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const t = (o) => tx(o, lang)

  return (
    <div className="min-h-[100dvh] bg-rd-bg font-sans text-rd-ink">
      {/* ── NAV ── */}
      <header className="sticky top-0 z-30 border-b border-rd-navy-line/40 bg-rd-navy/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5">
          <MilePayLogo dark size="text-lg" />
          <nav className="ml-6 hidden items-center gap-6 text-sm font-medium text-rd-navy-sub md:flex">
            {['modules', 'how', 'pricing', 'faq'].map((k) => (
              <a key={k} href={`#${k}`} className="transition hover:text-white">{t(UI.nav[k])}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden overflow-hidden rounded-full border border-rd-navy-line text-xs font-bold sm:inline-flex">
              {['en', 'es'].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase transition ${lang === l ? 'bg-white text-rd-navy' : 'text-rd-navy-sub hover:text-white'}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => navigate('/elegir')} className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10">{t(UI.nav.signin)}</button>
            <a href="#demo" className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-rd-navy transition hover:brightness-95">{t(UI.nav.demo)}</a>
          </div>
        </div>
      </header>

      {/* ── HERO (navy, interactivo) ── */}
      <section ref={heroRef} id="modules" className="relative overflow-hidden bg-rd-navy text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full opacity-25 blur-3xl transition-colors duration-500" style={{ background: m.strong }} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rd-navy-line px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-500" style={{ color: m.strong }}>
              <m.icon size={13} /> {t(m.label)}
            </div>
            <h1 className="max-w-xl font-display text-[2.1rem] font-extrabold leading-[1.08] tracking-tight transition-all duration-500 sm:text-5xl">{t(m.hero)}</h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-rd-navy-sub">{t(m.paragraph)}</p>

            {/* chips de módulo */}
            <div className="mt-6 flex flex-wrap gap-2">
              {MODULES.map((x) => {
                const activo = x.id === sel
                return (
                  <button key={x.id} onClick={() => setSel(x.id)} aria-pressed={activo}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${activo ? 'border-transparent text-white' : 'border-rd-navy-line text-rd-navy-sub hover:text-white'}`}
                    style={activo ? { background: x.strong } : undefined}>
                    <x.icon size={15} /> {t(x.name)}
                  </button>
                )
              })}
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#demo" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:brightness-105" style={{ background: m.strong }}>
                {t(UI.nav.demo)} <ArrowRight size={16} />
              </a>
              <button onClick={() => navigate(m.loginRoute)} className="inline-flex items-center gap-2 rounded-full border border-rd-navy-line px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
                {t(UI.explore)} {t(m.name)}
              </button>
            </div>
          </div>

          {/* tarjeta de la derecha */}
          <div className="transition-all duration-500">
            <ModulePreview module={m} lang={lang} sampleLabel={t(UI.sampleData)} />
          </div>
        </div>
      </section>

      {/* ── ALMACÉN 3D (sección opcional) ── */}
      <Warehouse3DSection />

      {/* ── WHAT MOVES (claro, 4 tarjetas) ── */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t(UI.what)}</h2>
        <p className="mt-2 text-rd-ink-sub">{t(UI.whatSub)}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((x) => (
            <button key={x.id} onClick={() => irHero(x.id)}
              className="group flex flex-col rounded-2xl border border-rd-line bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(5,18,40,0.25)]"
              style={{ borderTop: `4px solid ${x.strong}` }}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: x.soft, color: x.strong }}><x.icon size={20} /></span>
              <span className="mt-4 font-mono text-[11px] uppercase tracking-wide" style={{ color: x.strong }}>{t(x.phrase)}</span>
              <span className="mt-1 font-display text-lg font-bold">{t(x.name)}</span>
              <ul className="mt-3 space-y-1.5">
                {x.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rd-ink-sub"><Check size={15} className="mt-0.5 shrink-0" style={{ color: x.strong }} /> {t(b)}</li>
                ))}
              </ul>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold transition group-hover:gap-2" style={{ color: x.strong }}>{t(UI.explore)} <ArrowRight size={15} /></span>
            </button>
          ))}
        </div>
      </section>

      {/* ── FRANJA DE BENEFICIOS ── */}
      <section className="border-y border-rd-line bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4">
          {UI.benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rd-parcel-soft text-rd-parcel"><Check size={16} /></span>
              <span className="text-sm font-semibold">{t(b)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── THAT SIMPLE (3 pasos) ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t(UI.thatSimple)}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {UI.steps.map((s, i) => (
            <div key={i} className="rounded-2xl border border-rd-line bg-white p-6">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-rd-navy font-mono text-sm font-bold text-white">{i + 1}</div>
              <div className="mt-4 font-display text-lg font-bold">{t(s.t)}</div>
              <p className="mt-1 text-sm text-rd-ink-sub">{t(s.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL (navy) ── */}
      <section id="demo" className="bg-rd-navy">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl">{t(UI.finalTitle)}</h2>
          <p className="mx-auto mt-3 max-w-xl text-rd-navy-sub">{t(UI.finalSub)}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button onClick={() => navigate('/elegir')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-bold text-rd-navy transition hover:brightness-95">{t(UI.getStarted)} <ArrowRight size={16} /></button>
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-rd-navy-sub"><ShieldCheck size={14} /> {lang === 'en' ? 'Encrypted connection' : 'Conexión cifrada'}</div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="faq" className="bg-rd-navy">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 border-t border-rd-navy-line px-5 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <MilePayLogo dark size="text-base" />
          <p className="font-mono text-[11px] text-rd-navy-sub">© {new Date().getFullYear()} MilePay · {t(UI.rights)}</p>
        </div>
      </footer>
    </div>
  )
}
