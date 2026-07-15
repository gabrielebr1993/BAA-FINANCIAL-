// Panel "Ganancia por claims".
// Cada claim se evalúa por su MÉTODO (según ciudad + categoría), NO todo × $100:
//   M1 (cobra la multa): ganancia = multa − montoGofo
//   M2 (cobra lo de Gofo): ganancia = 0
//   M3 (perdón): ganancia = − montoGofo
// Ganancia neta por claims = suma de las ganancias individuales.
import { economiaClaims } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card } from './ui'
import { Handshake } from 'lucide-react'

export default function PanelClaims({ claims, inv, compacto = false }) {
  const e = economiaClaims(claims, inv)
  if (!e.total) return null
  const pm = e.porMetodo

  const g = (v) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}`

  return (
    <Card className="mb-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Handshake size={18} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ganancia por claims</h3>
        <span className="ml-auto text-xs text-slate-400">{num(e.total)} claim(s)</span>
      </div>

      <div className="space-y-1.5 text-sm">
        {/* Desglose por método. En "Lo que Gofo cobra" (M2) se muestra el MONTO que
            Gofo descontó por esos claims (lo que le cobras al chofer), no la ganancia
            —que es 0 porque no ganas ni pierdes. */}
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">Manual · le cobras el monto ({num(pm.M1.n)} claim(s))</span>
          <span className={`font-semibold ${pm.M1.ganancia >= 0 ? '' : 'text-rose-600 dark:text-rose-400'}`}>{g(pm.M1.ganancia)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">Lo que Gofo cobra ({num(pm.M2.n)} claim(s)) <span className="text-xs text-slate-400">· se lo cobras al chofer</span></span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{money(pm.M2.gofo)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">Perdón ({num(pm.M3.n)} claim(s))</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">{g(pm.M3.ganancia)}</span>
        </div>

        {/* Lo que Gofo te descontó en total (el dinero que Gofo te cobra por claims). */}
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-300">Lo que Gofo te descontó (total)</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">−{money(e.descontadoGofo)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">Cobrado a choferes (total)</span>
          <span className="font-semibold">{money(e.cobradoChoferes)}</span>
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-brand-navy dark:text-slate-100">GANANCIA NETA POR CLAIMS</span>
          <span className={`text-xl font-extrabold ${e.gananciaNetaClaims >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>
            {money(e.gananciaNetaClaims)}
          </span>
        </div>
      </div>

      {!compacto && (
        <p className="mt-3 text-xs text-slate-400">
          Cada claim se cobra según el <b>método configurado para su ciudad y tipo</b> (M1/M2/M3). El descuento de Gofo ya
          está en el neto verificado; en M3 (perdón) tu único costo es el monto que Gofo te descontó por ese claim.
        </p>
      )}
    </Card>
  )
}
