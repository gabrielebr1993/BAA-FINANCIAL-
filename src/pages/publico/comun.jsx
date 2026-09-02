// ============================================================================
// SITIO PÚBLICO de MilePay (marketing) · armazón COMPARTIDO de las páginas de
// función (/asignacion, /gps, …) y "Por qué MilePay". La página de inicio (/)
// NO usa nada de esto: su HTML/CSS viven aparte y quedan intactos.
//   · Mismo lenguaje visual del sitio: navy/dorado/crema, Space Grotesk/Inter/
//     JetBrains Mono, íconos lucide, borde a borde con padding lateral fluido.
//   · Bilingüe ES/EN con el MISMO toggle visual de la landing; la elección se
//     persiste en localStorage (la landing mantiene su propia lógica interna).
// ============================================================================
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Truck, Menu, X, LogIn, ArrowRight } from 'lucide-react'

export const NAVY = '#13233f'
export const NAVY_DEEP = '#0d1a30'
export const NAVY_800 = '#1b3050'
export const GOLD = '#c9a24b'
export const CREAM = '#f8f3eb'
export const CREAM_LINE = '#ece3d3'
export const OK = '#3f9d6b'
export const STEEL = '#5b6b82'

const LANG_KEY = 'mp-pub-lang'
export function useLangPub() {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es' } catch { return 'es' } })
  const fijar = (lg) => { setLang(lg); try { localStorage.setItem(LANG_KEY, lg) } catch { /* privado */ } try { document.documentElement.lang = lg } catch { /* ssr */ } }
  const tx = (es, en) => (lang === 'en' ? en : es)
  return { lang, fijar, tx }
}

// Páginas del sitio (menú + footer). El orden es el del menú.
export const PAGINAS = [
  { path: '/asignacion', es: 'Asignación', en: 'Assignment' },
  { path: '/gps', es: 'GPS', en: 'GPS' },
  { path: '/app-chofer', es: 'App del chofer', en: 'Driver app' },
  { path: '/facturacion', es: 'Facturación', en: 'Billing' },
  { path: '/roles', es: 'Roles', en: 'Roles' },
  { path: '/sistema', es: 'El sistema', en: 'The system' },
  { path: '/por-que-milepay', es: 'Por qué MilePay', en: 'Why MilePay' },
]

// Estilos base compartidos (fuentes de marca + reset mínimo). Se inyectan como
// <style> dentro de cada página pública; no afectan a la landing ni a la app.
export const CSS_PUB = `
  .pub{font-family:'Inter',sans-serif;color:${NAVY};background:${CREAM};line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  .pub h1,.pub h2,.pub h3,.pub h4,.f-display{font-family:'Space Grotesk',sans-serif;font-weight:600;line-height:1.08;letter-spacing:-.02em}
  .f-mono{font-family:'JetBrains Mono',monospace}
  .wrap-pub{padding-inline:clamp(20px,3vw,56px)}
  .pub a{text-decoration:none;color:inherit}
  @keyframes pulsoPub{0%{box-shadow:0 0 0 0 rgba(201,162,75,.55)}70%{box-shadow:0 0 0 9px rgba(201,162,75,0)}100%{box-shadow:0 0 0 0 rgba(201,162,75,0)}}
  @keyframes blinkPub{50%{opacity:.35}}
  .rev{opacity:0;transform:translateY(22px);animation:revIn .7s ease forwards}
  @keyframes revIn{to{opacity:1;transform:none}}
  @media(prefers-reduced-motion:reduce){.pub *{animation:none!important;transition:none!important}.rev{opacity:1;transform:none}}
`

const logoSvg = (
  <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[9px]" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}>
    <Truck size={19} strokeWidth={2.2} style={{ color: NAVY_DEEP }} />
  </span>
)

export function NavPub({ lang, fijar, tx, activo }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <nav className="fixed inset-x-0 top-0 z-[100] border-b" style={{ background: 'rgba(13,26,48,.85)', backdropFilter: 'blur(14px)', borderColor: 'rgba(201,162,75,.18)' }}>
      <div className="wrap-pub flex h-[68px] items-center justify-between">
        <Link to="/" className="flex items-center gap-[11px]" style={{ color: CREAM }}>
          {logoSvg}
          <span className="f-display text-[19px] font-bold">MilePay <span style={{ color: GOLD }}>Freight</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <div className={`${abierto ? 'absolute left-0 right-0 top-[68px] flex flex-col gap-4 border-b px-7 py-5' : 'hidden'} lg:static lg:flex lg:flex-row lg:items-center lg:gap-6 lg:border-0 lg:p-0`} style={abierto ? { background: NAVY_DEEP, borderColor: 'rgba(201,162,75,.2)' } : undefined}>
            {PAGINAS.map((p) => (
              <Link key={p.path} to={p.path} onClick={() => setAbierto(false)}
                className="text-[14px] font-medium transition-colors"
                style={{ color: activo === p.path ? GOLD : 'rgba(248,243,235,.72)', fontWeight: activo === p.path ? 700 : 500 }}>
                {tx(p.es, p.en)}
              </Link>
            ))}
          </div>
          <a href="/#demo" className="hidden rounded-[9px] px-[18px] py-[9px] text-[14px] font-semibold sm:block" style={{ background: GOLD, color: NAVY_DEEP }}>{tx('Solicitar demo', 'Request demo')}</a>
          <Link to="/elegir" className="hidden items-center gap-2 whitespace-nowrap rounded-[9px] border px-4 py-2 text-[14px] font-semibold sm:inline-flex" style={{ color: CREAM, borderColor: 'rgba(248,243,235,.28)' }}><LogIn size={15} /> {tx('Iniciar sesión', 'Log in')}</Link>
          <span className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(201,162,75,.32)' }}>
            {['es', 'en'].map((lg) => (
              <button key={lg} onClick={() => fijar(lg)} className="f-mono px-[11px] py-[7px] text-[12px] font-semibold uppercase tracking-wide"
                style={lang === lg ? { background: GOLD, color: NAVY_DEEP } : { color: 'rgba(248,243,235,.6)' }}>{lg}</button>
            ))}
          </span>
          <button onClick={() => setAbierto(!abierto)} className="lg:hidden" style={{ color: CREAM }} aria-label="menu">{abierto ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
    </nav>
  )
}

export function FooterPub({ tx }) {
  return (
    <footer className="border-t pb-9 pt-[54px]" style={{ background: NAVY_DEEP, color: 'rgba(248,243,235,.6)', borderColor: 'rgba(201,162,75,.14)' }}>
      <div className="wrap-pub">
        <div className="mb-10 grid grid-cols-2 gap-9 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="flex items-center gap-[11px]" style={{ color: CREAM }}>{logoSvg}<span className="f-display text-[19px] font-bold">MilePay <span style={{ color: GOLD }}>Freight</span></span></span>
            <p className="mt-3.5 max-w-[280px] text-[14px] leading-relaxed">{tx('Despacho, GPS, app del chofer y facturación para materiales a granel — en un solo sistema.', 'Dispatch, GPS, driver app and billing for bulk materials — one system.')}</p>
          </div>
          <div>
            <h5 className="f-display mb-4 text-[13px] font-semibold uppercase tracking-widest" style={{ color: CREAM }}>{tx('Funciones', 'Features')}</h5>
            {PAGINAS.slice(0, 6).map((p) => <Link key={p.path} to={p.path} className="mb-2.5 block text-[14px] transition-colors hover:text-[#c9a24b]">{tx(p.es, p.en)}</Link>)}
          </div>
          <div>
            <h5 className="f-display mb-4 text-[13px] font-semibold uppercase tracking-widest" style={{ color: CREAM }}>{tx('Empresa', 'Company')}</h5>
            <Link to="/por-que-milepay" className="mb-2.5 block text-[14px] hover:text-[#c9a24b]">{tx('Por qué MilePay', 'Why MilePay')}</Link>
            <a href="/#demo" className="mb-2.5 block text-[14px] hover:text-[#c9a24b]">{tx('Solicitar demo', 'Request demo')}</a>
            <Link to="/elegir" className="mb-2.5 block text-[14px] hover:text-[#c9a24b]">{tx('Iniciar sesión', 'Log in')}</Link>
          </div>
          <div>
            <h5 className="f-display mb-4 text-[13px] font-semibold uppercase tracking-widest" style={{ color: CREAM }}>{tx('Sitio', 'Site')}</h5>
            <Link to="/" className="mb-2.5 block text-[14px] hover:text-[#c9a24b]">{tx('Inicio', 'Home')}</Link>
            <Link to="/sistema" className="mb-2.5 block text-[14px] hover:text-[#c9a24b]">{tx('El sistema completo', 'The full system')}</Link>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t pt-6 text-[13px]" style={{ borderColor: 'rgba(255,255,255,.08)', color: 'rgba(248,243,235,.4)' }}>
          <span>© {new Date().getFullYear()} MilePay Freight · milepay.io</span>
          <span>{tx('Hecho para materiales a granel', 'Built for bulk materials')}</span>
        </div>
      </div>
    </footer>
  )
}

export function BandaCTA({ tx }) {
  return (
    <section className="wrap-pub py-16">
      <div className="relative overflow-hidden rounded-[28px] px-7 py-14 text-center sm:px-14" style={{ background: `linear-gradient(155deg,${NAVY},${NAVY_DEEP})`, color: CREAM }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(600px 300px at 50% 0%,rgba(201,162,75,.16),transparent 60%)' }} />
        <h2 className="relative mb-4 text-[clamp(28px,3.6vw,42px)] font-bold">{tx('Míralo funcionando con tu operación', 'See it running on your operation')}</h2>
        <p className="relative mx-auto mb-8 max-w-[520px] text-[17px]" style={{ color: 'rgba(248,243,235,.75)' }}>{tx('Agenda una demo: cargamos tus plantas, materiales y camiones de ejemplo y despachas una orden en vivo.', 'Book a demo: we load your plants, materials and sample trucks and you dispatch a live order.')}</p>
        <a href="/#demo" className="relative inline-flex items-center gap-2 rounded-[11px] px-7 py-[15px] text-[15.5px] font-semibold" style={{ background: GOLD, color: NAVY_DEEP, boxShadow: '0 10px 30px -10px rgba(201,162,75,.5)' }}>{tx('Solicitar demo', 'Request demo')} <ArrowRight size={16} /></a>
      </div>
    </section>
  )
}

// Hero de página de función: migas + ícono en tile dorado + título + subtítulo +
// CTAs + visual interactivo a la derecha.
export function HeroFuncion({ tx, migas, icono: Icono, titulo, sub, visual }) {
  return (
    <header className="relative overflow-hidden pb-16 pt-[116px]" style={{ background: NAVY_DEEP, color: CREAM }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 500px at 82% 8%,rgba(201,162,75,.14),transparent 60%),radial-gradient(700px 600px at 5% 90%,rgba(91,107,130,.22),transparent 55%)' }} />
      <div className="wrap-pub relative grid items-center gap-[clamp(40px,5vw,90px)] lg:grid-cols-[1.02fr_1.1fr]">
        <div className="rev min-w-0">
          <div className="f-mono mb-5 text-[12.5px] uppercase tracking-[.14em]" style={{ color: 'rgba(248,243,235,.5)' }}>
            <Link to="/sistema" className="hover:text-[#c9a24b]">{tx('Funciones', 'Features')}</Link> <span style={{ color: GOLD }}>/</span> {migas}
          </div>
          <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}><Icono size={28} style={{ color: NAVY_DEEP }} /></span>
          <h1 className="mb-5 text-[clamp(34px,4.4vw,54px)] font-bold">{titulo}</h1>
          <p className="mb-8 max-w-[560px] text-[18px] leading-relaxed" style={{ color: 'rgba(248,243,235,.78)' }}>{sub}</p>
          <div className="flex flex-wrap items-center gap-3.5">
            <a href="/#demo" className="rounded-[11px] px-7 py-[15px] text-[15.5px] font-semibold" style={{ background: GOLD, color: NAVY_DEEP, boxShadow: '0 10px 30px -10px rgba(201,162,75,.5)' }}>{tx('Solicitar demo', 'Request demo')}</a>
            <Link to="/sistema" className="inline-flex items-center gap-2 rounded-[11px] border px-6 py-[15px] text-[15.5px] font-semibold" style={{ color: CREAM, borderColor: 'rgba(248,243,235,.24)' }}>{tx('Ver el sistema completo', 'See the full system')} <ArrowRight size={15} /></Link>
          </div>
        </div>
        <div className="rev min-w-0" style={{ animationDelay: '.15s' }}>{visual}</div>
      </div>
    </header>
  )
}

// "Cómo funciona": 3 pasos numerados con íconos.
export function Pasos({ tx, titulo, pasos }) {
  return (
    <section className="wrap-pub py-20">
      <div className="f-mono mb-3 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Cómo funciona', 'How it works')}</div>
      <h2 className="mb-12 max-w-[680px] text-[clamp(26px,3.2vw,38px)]" style={{ color: NAVY }}>{titulo}</h2>
      <div className="grid gap-5 md:grid-cols-3">
        {pasos.map((p, i) => (
          <div key={i} className="rounded-2xl border bg-white p-7 transition-transform hover:-translate-y-1" style={{ borderColor: CREAM_LINE }}>
            <div className="mb-4 flex items-center gap-3">
              <span className="f-mono grid h-9 w-9 place-items-center rounded-xl text-[14px] font-semibold" style={{ background: NAVY, color: GOLD }}>{i + 1}</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: CREAM }}><p.icono size={21} style={{ color: NAVY }} /></span>
            </div>
            <h3 className="mb-2 text-[18px]" style={{ color: NAVY }}>{p.t}</h3>
            <p className="text-[14.5px] leading-relaxed" style={{ color: STEEL }}>{p.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// "Lo que ganas": métricas de beneficio con barra.
export function Metricas({ tx, items }) {
  return (
    <section className="border-y py-16" style={{ background: NAVY, borderColor: 'rgba(201,162,75,.14)' }}>
      <div className="wrap-pub">
        <div className="f-mono mb-8 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Lo que ganas', 'What you gain')}</div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m, i) => (
            <div key={i}>
              <div className="f-display text-[clamp(30px,3.4vw,44px)] font-bold" style={{ color: GOLD }}>{m.n}</div>
              <div className="mt-1 text-[14px] font-semibold" style={{ color: CREAM }}>{m.t}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}><div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: GOLD }} /></div>
              <div className="mt-2 text-[12.5px]" style={{ color: 'rgba(248,243,235,.55)' }}>{m.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Página completa de función: nav + hero + pasos + métricas + CTA + footer.
export function PaginaFuncion({ lang, fijar, tx, activo, hero, pasos, metricas, extra = null }) {
  return (
    <div className="pub min-h-screen">
      <style>{CSS_PUB}</style>
      <NavPub lang={lang} fijar={fijar} tx={tx} activo={activo} />
      <HeroFuncion tx={tx} {...hero} />
      <Pasos tx={tx} titulo={pasos.titulo} pasos={pasos.items} />
      <Metricas tx={tx} items={metricas} />
      {extra}
      <BandaCTA tx={tx} />
      <FooterPub tx={tx} />
    </div>
  )
}
