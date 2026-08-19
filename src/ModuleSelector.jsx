// Pantalla de inicio: elegir entre Package (MyPay, el sistema actual) y Freight
// (la nueva plataforma de fletes). Guarda la elección para no volver a preguntar.
import { useNavigate } from 'react-router-dom'
import { FileText, Truck, ArrowRight, Route } from 'lucide-react'
import { useLang, LangToggle } from './i18n'

export function setModulo(m) { try { localStorage.setItem('mp_module', m) } catch { /* noop */ } }
export function getModulo() { try { return localStorage.getItem('mp_module') } catch { return null } }

const OpcionCard = ({ onClick, icon: Icon, titulo, desc, features, acento, glow }) => {
  const { t } = useLang()
  return (
  <button
    onClick={onClick}
    className="group relative flex w-full max-w-sm flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.08]"
  >
    <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full ${glow} opacity-40 blur-3xl transition-opacity group-hover:opacity-70`} />
    <div className={`relative grid h-14 w-14 place-items-center rounded-2xl ${acento} text-white shadow-lg`}>
      <Icon size={26} strokeWidth={2} />
    </div>
    <div className="relative mt-4 text-2xl font-black text-white">{titulo}</div>
    <div className="relative mt-1 text-sm leading-relaxed text-slate-300">{desc}</div>
    {features?.length > 0 && (
      <ul className="relative mt-4 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-[13px] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${acento}`} /> {f}
          </li>
        ))}
      </ul>
    )}
    <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-white">
      {t('Entrar')} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
    </div>
  </button>
  )
}

export default function ModuleSelector() {
  const navigate = useNavigate()
  const { t } = useLang()
  const elegir = (m) => { setModulo(m); navigate(m === 'bulk' ? '/bulk' : '/dashboard', { replace: true }) }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 p-4">
      <div className="absolute right-4 top-4 z-10"><LangToggle /></div>
      {/* fondo decorativo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-navy/40 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 translate-x-1/2 rounded-full bg-amber-500/20 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-4xl">
        <div className="ms-in mb-7 flex flex-col items-center">
          <div className="flex items-center gap-2.5">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-900 shadow-lg shadow-amber-500/25">
              <Route size={22} strokeWidth={2.4} />
            </div>
            <div className="text-[2.1rem] font-black leading-none tracking-tight text-white">Mile<span className="text-amber-400">Pay</span></div>
          </div>
          <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{t('Plataforma de logística')}</div>
        </div>

        <div className="ms-in ms-in-2 mb-9 flex justify-center">
          <div className="ms-scene relative h-14 w-full max-w-sm overflow-hidden" aria-hidden="true">
            <div className="ms-road" />
            <span className="ms-item ms-truck"><Truck size={24} strokeWidth={2} /></span>
            <span className="ms-item ms-box" style={{ animationDelay: '-0.7s' }} />
            <span className="ms-item ms-box" style={{ animationDelay: '-1.4s' }} />
            <span className="ms-item ms-box ms-box-amber" style={{ animationDelay: '-2.1s' }} />
          </div>
        </div>

        <div className="ms-in ms-in-3 flex flex-col items-stretch justify-center gap-5 sm:flex-row">
          <OpcionCard
            onClick={() => elegir('package')} icon={FileText} acento="bg-brand-navy" glow="bg-blue-600"
            titulo="Package" desc={t('Facturas, pagos y claims.')}
          />
          <OpcionCard
            onClick={() => elegir('bulk')} icon={Truck} acento="bg-amber-500" glow="bg-amber-500"
            titulo="Freight" desc={t('Fletes de materiales, en vivo.')}
          />
        </div>

        <p className="ms-in ms-in-3 mt-10 text-center text-xs text-slate-500">© {new Date().getFullYear()} MilePay · {t('Puedes cambiar de módulo en cualquier momento.')}</p>
      </div>

      <style>{`
        .ms-road { position:absolute; left:0; right:0; bottom:18px; height:2px;
          background:repeating-linear-gradient(90deg, rgba(148,163,184,.35) 0 12px, transparent 12px 24px);
          animation: ms-flow .8s linear infinite; }
        .ms-item { position:absolute; bottom:20px; animation: ms-drive 5s linear infinite; }
        .ms-truck { color:#f59e0b; bottom:22px; filter:drop-shadow(0 3px 5px rgba(0,0,0,.5)); }
        .ms-box { width:13px; height:13px; border-radius:3px; background:#1e3a8a; box-shadow:0 2px 6px rgba(0,0,0,.45); }
        .ms-box-amber { background:#f59e0b; }
        @keyframes ms-flow { to { background-position-x:-24px; } }
        @keyframes ms-drive { 0% { left:-12%; opacity:0; } 6% { opacity:1; } 94% { opacity:1; } 100% { left:108%; opacity:0; } }
        .ms-in { opacity:0; animation: ms-rise .6s cubic-bezier(.2,.7,.3,1) forwards; }
        .ms-in-2 { animation-delay:.12s; }
        .ms-in-3 { animation-delay:.24s; }
        @keyframes ms-rise { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:none; } }
        @media (prefers-reduced-motion: reduce) {
          .ms-road, .ms-item { animation:none; }
          .ms-truck { left:44%; } .ms-box { display:none; }
          .ms-in { opacity:1; animation:none; }
        }
      `}</style>
    </div>
  )
}
