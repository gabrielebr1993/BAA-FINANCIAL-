// Pantalla de inicio: elegir entre Package (MyPay, el sistema actual) y Bulk
// (la nueva plataforma de fletes). Guarda la elección para no volver a preguntar.
import { useNavigate } from 'react-router-dom'
import { FileText, Truck } from 'lucide-react'

export function setModulo(m) { try { localStorage.setItem('mp_module', m) } catch { /* noop */ } }
export function getModulo() { try { return localStorage.getItem('mp_module') } catch { return null } }

export default function ModuleSelector() {
  const navigate = useNavigate()
  const elegir = (m) => { setModulo(m); navigate(m === 'bulk' ? '/bulk' : '/', { replace: true }) }

  const Card = ({ onClick, icon: Icon, titulo, desc, color }) => (
    <button onClick={onClick} className="group flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur transition hover:scale-[1.02] hover:border-white/20 hover:bg-white/10">
      <div className={`grid h-16 w-16 place-items-center rounded-2xl ${color} text-white shadow-lg`}><Icon size={30} strokeWidth={2} /></div>
      <div className="text-xl font-extrabold text-white">{titulo}</div>
      <div className="text-sm text-slate-300">{desc}</div>
      <span className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white group-hover:bg-white/20">Entrar</span>
    </button>
  )

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="m-0 text-3xl font-black text-white">My Pay</h1>
          <p className="mt-1 text-slate-400">Elige el módulo con el que quieres trabajar</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-5 sm:flex-row sm:items-stretch">
          <Card onClick={() => elegir('package')} icon={FileText} color="bg-brand-navy" titulo="Package" desc="Gestión de facturas, pagos y choferes (sistema actual)." />
          <Card onClick={() => elegir('bulk')} icon={Truck} color="bg-amber-500" titulo="Bulk" desc="Plataforma de transporte de materiales de construcción." />
        </div>
      </div>
    </div>
  )
}
