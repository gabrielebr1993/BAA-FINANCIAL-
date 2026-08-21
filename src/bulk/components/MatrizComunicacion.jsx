// BULK · Editor de la MATRIZ de comunicación (chat interno por roles). Permite al
// administrador definir QUÉ ROLES pueden chatear entre sí, SIN TOCAR CÓDIGO: cada
// cambio se guarda en bulk_comMatrix/{tenantId}.pares = { 'rolA|rolB': bool }. Las
// celdas sin override usan el valor POR DEFECTO de la política (comunicacion.js). El
// aislamiento por compañía (mismo carrier, etc.) se aplica aparte y no se configura aquí.
import { useMemo, useState } from 'react'
import { Check, X, RotateCcw } from 'lucide-react'
import { clavePar, puedeChatearRol, permisoPorDefecto } from '../domain/comunicacion'
import { guardarMatrizComunicacion } from '../data/repo'
import { Card, Boton } from '../../components/ui'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { etiquetaRol } from '../domain/permisos'
import { useLang } from '../../i18n'

export default function MatrizComunicacion({ tenantId, roles = [], matriz = {}, rolesConfig, onClose }) {
  const { t } = useLang()
  const [pares, setPares] = useState(() => ({ ...(matriz.pares || {}) }))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const label = (r) => (BULK_ROLES_LABEL[r] ? t(BULK_ROLES_LABEL[r]) : etiquetaRol(r, rolesConfig))

  // Lista única de roles a mostrar (ordenada por etiqueta).
  const lista = useMemo(() => [...new Set(roles.filter(Boolean))].sort((a, b) => label(a).localeCompare(label(b))), [roles]) // eslint-disable-line react-hooks/exhaustive-deps
  // Todos los PARES no ordenados (incluye el par consigo mismo: rol↔mismo rol).
  const combos = useMemo(() => {
    const out = []
    for (let i = 0; i < lista.length; i++) for (let j = i; j < lista.length; j++) out.push([lista[i], lista[j]])
    return out
  }, [lista])

  const valor = (a, b) => {
    const k = clavePar(a, b)
    if (Object.prototype.hasOwnProperty.call(pares, k)) return !!pares[k]
    return permisoPorDefecto(a, b)
  }
  const esOverride = (a, b) => Object.prototype.hasOwnProperty.call(pares, clavePar(a, b))
  const alternar = (a, b) => {
    const k = clavePar(a, b)
    setPares((p) => ({ ...p, [k]: !valor(a, b) }))
  }
  const restaurarPar = (a, b) => {
    const k = clavePar(a, b)
    setPares((p) => { const n = { ...p }; delete n[k]; return n })
  }

  const guardar = async () => {
    setGuardando(true); setMsg('')
    try {
      await guardarMatrizComunicacion(tenantId, pares)
      setMsg('ok')
      setTimeout(() => onClose?.(), 600)
    } catch (e) {
      setMsg(e?.message || t('No se pudo guardar. ¿Desplegaste las reglas nuevas?'))
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <Card className="w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Reglas de comunicación')}</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('Define qué roles pueden iniciar un chat privado entre sí. Los cambios se aplican de inmediato, sin tocar código. La comunicación siempre queda limitada a la misma empresa.')}</p>
        <div className="scroll-thin max-h-[55vh] space-y-1 overflow-y-auto">
          {combos.map(([a, b]) => {
            const on = valor(a, b)
            const over = esOverride(a, b)
            return (
              <div key={clavePar(a, b)} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0 flex-1 text-sm text-brand-navy dark:text-slate-100">
                  <span className="font-semibold">{label(a)}</span>
                  <span className="mx-1 text-slate-400">↔</span>
                  <span className="font-semibold">{a === b ? t('(mismo rol)') : label(b)}</span>
                  {over && <span className="ml-2 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">{t('personalizado')}</span>}
                </div>
                {over && (
                  <button onClick={() => restaurarPar(a, b)} title={t('Volver al valor por defecto')} className="text-slate-300 hover:text-slate-500 dark:hover:text-slate-300"><RotateCcw size={14} /></button>
                )}
                <button
                  onClick={() => alternar(a, b)}
                  className={`flex h-6 w-11 items-center rounded-full px-0.5 transition ${on ? 'justify-end bg-emerald-500' : 'justify-start bg-slate-300 dark:bg-slate-700'}`}
                  title={on ? t('Permitido') : t('Bloqueado')}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-slate-600 shadow">{on ? <Check size={12} className="text-emerald-600" /> : <X size={12} />}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {msg === 'ok' ? <span className="text-xs font-semibold text-emerald-600">{t('Guardado.')}</span>
            : msg ? <span className="text-xs font-medium text-rose-600">{msg}</span> : <span className="text-[11px] text-slate-400">{t('Verde = permitido · Gris = bloqueado')}</span>}
          <Boton variant="gold" onClick={guardar} disabled={guardando} className="ml-auto px-4 py-1.5 text-sm">{guardando ? t('Guardando…') : t('Guardar reglas')}</Boton>
        </div>
      </Card>
    </div>
  )
}
