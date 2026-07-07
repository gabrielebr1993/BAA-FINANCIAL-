// Asistente de primeros pasos para empresas nuevas (empresa sin facturas).
// 3 pasos: agregar ciudades, cargar la primera factura, revisar el dashboard.
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, MapPin, Upload, LayoutDashboard, ArrowRight, Sparkles } from 'lucide-react'
import { useData } from '../DataContext'
import { setOnboardingCompleto } from '../utils/empresaSettings'
import { Card, Boton } from './ui'

export default function Onboarding() {
  const { empresaActiva, ciudadesEmpresa, invoices, activeCompanyId, reloadAjustes } = useData()
  const navigate = useNavigate()

  const paso1 = ciudadesEmpresa.length > 0
  const paso2 = invoices.length > 0
  const listos = paso1 && paso2

  const finalizar = async () => { await setOnboardingCompleto(activeCompanyId, true); await reloadAjustes(); navigate('/') }
  const omitir = async () => { await setOnboardingCompleto(activeCompanyId, true); await reloadAjustes() }

  const pasos = [
    { hecho: paso1, icon: MapPin, titulo: 'Agrega tus ciudades', desc: 'Registra las ciudades donde operas (ej. Dallas · DFW01).', boton: 'Agregar ciudades', ir: () => navigate('/configuracion') },
    { hecho: paso2, icon: Upload, titulo: 'Carga tu primera factura', desc: 'Sube el Excel de Gofo. En la pantalla previa configuras tus choferes y tarifas.', boton: 'Cargar factura', ir: () => navigate('/facturas'), bloqueado: !paso1 },
    { hecho: listos, icon: LayoutDashboard, titulo: 'Revisa tu dashboard', desc: 'Cuando tengas una factura, verás tus métricas y verificación con Gofo.', boton: 'Ir al dashboard', ir: finalizar, bloqueado: !listos },
  ]
  const completados = pasos.filter((p) => p.hecho).length

  return (
    <Card className="mb-5 p-6">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-brand-gold"><Sparkles size={20} strokeWidth={1.8} /></span>
        <h2 className="m-0 text-xl font-bold text-brand-navy dark:text-slate-100">¡Bienvenido a MilePay{empresaActiva?.nombre ? `, ${empresaActiva.nombre}` : ''}!</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Vamos a configurar tu cuenta en 3 pasos ({completados}/3 listos).</p>

      <div className="space-y-3">
        {pasos.map((p, i) => {
          const Icon = p.icon
          return (
            <div key={i} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${p.hecho ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-700/60'}`}>
              {p.hecho ? <CheckCircle2 size={24} strokeWidth={1.8} className="flex-shrink-0 text-emerald-500" /> : <Circle size={24} strokeWidth={1.8} className="flex-shrink-0 text-slate-300 dark:text-slate-600" />}
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-brand-navy dark:bg-slate-800 dark:text-slate-100"><Icon size={18} strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-brand-navy dark:text-slate-100">{i + 1}. {p.titulo}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{p.desc}</div>
              </div>
              {!p.hecho && (
                <Boton variant={p.bloqueado ? 'ghost' : 'gold'} disabled={p.bloqueado} onClick={p.ir} className="whitespace-nowrap">
                  {p.boton} <ArrowRight size={15} strokeWidth={2} />
                </Boton>
              )}
              {p.hecho && i < 2 && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Hecho</span>}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {listos && <Boton variant="gold" onClick={finalizar}>Finalizar y ver mi dashboard <ArrowRight size={15} strokeWidth={2} /></Boton>}
        <button onClick={omitir} className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Omitir la guía por ahora</button>
      </div>
    </Card>
  )
}
