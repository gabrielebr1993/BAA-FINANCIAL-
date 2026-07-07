// Panel "Ganancia por claims".
// Multa al chofer: $100 fijo por claim NO perdonado (cobradoChoferes).
// Descuento de Gofo: monto VARIABLE por claim (descontadoGofo, ya en el neto).
// Perdonar = no cobrar los $100 (multa que dejas de cobrar, NO pérdida) y solo
// absorber el montoGofo REAL de ese claim (perdidaAbsorbida, variable por claim).
// Ganancia neta por claims = cobradoChoferes − descontadoGofo.
import { economiaClaims } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card } from './ui'
import { Handshake } from 'lucide-react'

export default function PanelClaims({ claims, compacto = false }) {
  const e = economiaClaims(claims)
  if (!e.total) return null

  const Fila = ({ label, valor, negativo, fuerte }) => (
    <div className="flex items-center justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`font-semibold ${negativo ? 'text-rose-600 dark:text-rose-400' : ''} ${fuerte ? 'text-base' : ''}`}>
        {negativo ? '−' : ''}{money(Math.abs(valor))}
      </span>
    </div>
  )

  return (
    <Card className="mb-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Handshake size={18} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ganancia por claims</h3>
        <span className="ml-auto text-xs text-slate-400">
          {num(e.total)} claim(s) · {num(e.activos)} activos · {num(e.perdonados)} perdonados
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <Fila label={`Multas cobradas a choferes (${num(e.activos)} × $100)`} valor={e.cobradoChoferes} />
        <Fila label="Descontado por Gofo (todos los claims, variable)" valor={e.descontadoGofo} negativo />
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-brand-navy dark:text-slate-100">GANANCIA NETA POR CLAIMS</span>
          <span className={`text-xl font-extrabold ${e.gananciaNetaClaims >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>
            {money(e.gananciaNetaClaims)}
          </span>
        </div>
        {e.perdonados > 0 && (
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>De lo anterior, perdonar {num(e.perdonados)} claim(s) te costó (solo lo de Gofo)</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">{money(e.perdidaAbsorbida)}</span>
          </div>
        )}
      </div>

      {!compacto && (
        <p className="mt-3 text-xs text-slate-400">
          El descuento de Gofo ya está reflejado en el neto verificado. Perdonar un claim solo te cuesta el monto
          que Gofo te descontó por ESE claim (variable, ej. $40 o $1); los $100 son una multa al chofer que dejas
          de cobrar, no una pérdida de tu bolsillo.
        </p>
      )}
    </Card>
  )
}
