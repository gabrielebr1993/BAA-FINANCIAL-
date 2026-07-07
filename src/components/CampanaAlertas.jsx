// Campana de alertas global para el header: badge con el número de alertas
// activas y un dropdown con las más urgentes, agrupadas por severidad.
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ArrowRight, CheckCircle2, Check, X } from 'lucide-react'
import { useData } from '../DataContext'
import { NOMBRE_TIPO } from '../utils/alertas'

const PUNTO = { red: 'bg-rose-500', yellow: 'bg-amber-500', blue: 'bg-sky-500' }

export default function CampanaAlertas() {
  const { alertasVisibles, marcarAlerta } = useData()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const n = alertasVisibles.length

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const ir = (a) => { setAbierto(false); navigate(a.link) }
  const top = alertasVisibles.slice(0, 6)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label="Alertas"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40"
      >
        <Bell size={19} strokeWidth={1.8} />
        {n > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-cardhover dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <span className="font-bold text-brand-navy dark:text-slate-100">Alertas</span>
            <span className="text-xs text-slate-400">{n} activa(s)</span>
          </div>

          {n === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle2 size={32} strokeWidth={1.5} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Todo en orden.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {top.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 border-b border-slate-50 px-4 py-3 last:border-0 dark:border-slate-700/50">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${PUNTO[a.tipo]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{NOMBRE_TIPO[a.tipo]}</span>
                      <span className="text-[10px] text-slate-300 dark:text-slate-500">· {a.categoria}</span>
                    </div>
                    <button onClick={() => ir(a)} className="block w-full truncate text-left text-sm font-semibold text-brand-navy hover:underline dark:text-slate-100" title={a.titulo}>
                      {a.titulo}
                    </button>
                    <div className="mt-1 flex items-center gap-2">
                      <button onClick={() => marcarAlerta(a.id, 'resuelta')} title="Marcar como resuelta" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                        <Check size={12} strokeWidth={2.4} /> Resolver
                      </button>
                      <button onClick={() => marcarAlerta(a.id, 'descartada')} title="Descartar" className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:underline">
                        <X size={12} strokeWidth={2.4} /> Descartar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => { setAbierto(false); navigate('/alertas') }}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-brand-navy transition hover:bg-slate-50 dark:border-slate-700 dark:text-brand-gold dark:hover:bg-slate-700/40"
          >
            Ver todas las alertas <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}
