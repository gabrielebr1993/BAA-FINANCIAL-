// Pantalla de inicio: elegir entre Package (MyPay, el sistema actual) y Bulk
// (la nueva plataforma de fletes). Guarda la elección para no volver a preguntar.
import { useNavigate } from 'react-router-dom'
import { FileText, Truck, ArrowRight, ShieldCheck } from 'lucide-react'

export function setModulo(m) { try { localStorage.setItem('mp_module', m) } catch { /* noop */ } }
export function getModulo() { try { return localStorage.getItem('mp_module') } catch { return null } }

const OpcionCard = ({ onClick, icon: Icon, titulo, desc, features, acento, glow }) => (
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
    <ul className="relative mt-4 space-y-1.5">
      {features.map((f) => (
        <li key={f} className="flex items-center gap-2 text-[13px] text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${acento}`} /> {f}
        </li>
      ))}
    </ul>
    <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-white">
      Entrar <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
    </div>
  </button>
)

export default function ModuleSelector() {
  const navigate = useNavigate()
  const elegir = (m) => { setModulo(m); navigate(m === 'bulk' ? '/bulk' : '/', { replace: true }) }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 p-4">
      {/* fondo decorativo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-navy/40 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 translate-x-1/2 rounded-full bg-amber-500/20 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-4xl">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300">
            <ShieldCheck size={13} className="text-amber-400" /> Plataforma unificada
          </div>
          <h1 className="m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">My Pay</h1>
          <p className="mx-auto mt-2 max-w-md text-slate-400">Elige el módulo con el que quieres trabajar. Cada uno es un producto independiente.</p>
        </div>

        <div className="flex flex-col items-stretch justify-center gap-5 sm:flex-row">
          <OpcionCard
            onClick={() => elegir('package')} icon={FileText} acento="bg-brand-navy" glow="bg-brand-navy"
            titulo="Package" desc="Gestión de facturas, pagos, choferes y claims. El sistema actual."
            features={['Facturación y conciliación', 'Pagos y proyecciones', 'Claims y reportes a Gofo']}
          />
          <OpcionCard
            onClick={() => elegir('bulk')} icon={Truck} acento="bg-amber-500" glow="bg-amber-500"
            titulo="Bulk" desc="Transporte de materiales de construcción, de la orden a la entrega."
            features={['Órdenes, GPS y geocercas en vivo', 'Portales de chofer, cliente y transportista', 'Chat, POD y prueba de entrega']}
          />
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">© {new Date().getFullYear()} My Pay · Puedes cambiar de módulo en cualquier momento.</p>
      </div>
    </div>
  )
}
