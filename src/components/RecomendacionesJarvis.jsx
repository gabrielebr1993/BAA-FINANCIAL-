// Panel "Recomendaciones de JARVIS": análisis accionable de la semana en curso.
// Automático (se genera al ver el dashboard) y también accesible pidiéndoselo a
// JARVIS por voz/chat. Solo owner/súper-admin. SOLO sugerencias, no ejecuta nada.
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, RefreshCw, ArrowRight, Lightbulb } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { obtenerRecomendaciones } from '../utils/recomendaciones'
import { Card, Spinner } from './ui'

const RUTA = { pagos: '/pagos', choferes: '/choferes', rutas: '/rutas', performance: '/performance', financiero: '/financiero', claims: '/claims', dashboard: '/' }
const COLOR_PRIO = ['#c9a24b', '#c9a24b', '#d97706', '#64748b', '#64748b']

export default function RecomendacionesJarvis() {
  const navigate = useNavigate()
  const { perfil, esSuperAdmin } = useAuth()
  const { activeCompanyId, facturaRango } = useData()
  const puede = esSuperAdmin || perfil?.role === 'owner'
  const semana = facturaRango?.semana || null

  const [recs, setRecs] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const cacheRef = useRef({}) // por semana, para no repetir la llamada

  const cargar = async (forzar = false) => {
    if (!activeCompanyId || !semana) return
    if (!forzar && cacheRef.current[semana]) { setRecs(cacheRef.current[semana]); return }
    setCargando(true); setError('')
    try {
      const r = await obtenerRecomendaciones({ companyId: activeCompanyId, semana })
      if (!r.ok) { setError(r.error || 'No se pudieron generar.'); return }
      cacheRef.current[semana] = r.recomendaciones || []
      setRecs(r.recomendaciones || [])
    } catch (e) { setError('Error: ' + e.message) } finally { setCargando(false) }
  }

  useEffect(() => { if (puede) cargar() /* eslint-disable-next-line */ }, [activeCompanyId, semana, puede])

  if (!puede || !semana) return null

  return (
    <Card className="mb-4 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Recomendaciones de JARVIS</h3>
        <span className="text-xs text-slate-400">análisis de {semana}</span>
        <button onClick={() => cargar(true)} disabled={cargando} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-40 dark:hover:text-white" title="Volver a analizar">
          {cargando ? <Spinner /> : <RefreshCw size={13} strokeWidth={1.9} />} Analizar
        </button>
      </div>

      {cargando && recs.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Spinner /> JARVIS está analizando tu semana…</div>
      ) : error ? (
        <div className="text-sm text-amber-600 dark:text-amber-400">{error}</div>
      ) : recs.length === 0 ? (
        <div className="text-sm text-slate-500">Sin recomendaciones destacadas esta semana. ¡Buen trabajo!</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recs.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/40">
              <div className="mb-1 flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: COLOR_PRIO[(r.prioridad || 3) - 1] || '#64748b' }}>{r.prioridad || '·'}</span>
                <div className="font-semibold text-brand-navy dark:text-slate-100">{r.titulo}</div>
              </div>
              <div className="mb-1.5 text-sm text-slate-600 dark:text-slate-300">{r.detalle}</div>
              {r.dato && <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Lightbulb size={13} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-brand-gold" />{r.dato}</div>}
              {r.seccion && RUTA[r.seccion] && (
                <button onClick={() => navigate(RUTA[r.seccion])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline">Ver {r.seccion} <ArrowRight size={12} strokeWidth={2.2} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-[11px] text-slate-400">Sugerencias basadas en tus datos para ayudarte a decidir — la decisión es tuya. Pídele a JARVIS “dame recomendaciones” para profundizar.</div>
    </Card>
  )
}
