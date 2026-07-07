// Panel "Ganancia por claims" (Orden 3).
// El chofer paga $100 fijo por cada claim NO perdonado (cobradoChoferes).
// Gofo descuenta un monto variable por cada claim (descontadoGofo, ya en el neto).
// Perdonar = renunciar a los $100 y ABSORBER lo que Gofo cobró (perdidaAbsorbida).
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
        <Fila label={`Cobrado a choferes (${num(e.activos)} × $100)`} valor={e.cobradoChoferes} />
        <Fila label="Descontado por Gofo" valor={e.descontadoGofo} negativo />
        {e.perdonados > 0 && <Fila label={`Pérdida absorbida por perdones (${num(e.perdonados)})`} valor={e.perdidaAbsorbida} negativo />}
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-brand-navy dark:text-slate-100">GANANCIA NETA POR CLAIMS</span>
          <span className={`text-xl font-extrabold ${e.gananciaNetaClaims >= 0 ? 'text-brand-gold' : 'text-rose-600 dark:text-rose-400'}`}>
            {money(e.gananciaNetaClaims)}
          </span>
        </div>
      </div>

      {!compacto && (
        <p className="mt-3 text-xs text-slate-400">
          El descuento de Gofo ya está reflejado en el neto verificado. Perdonar un claim te cuesta los $100 que
          dejas de cobrar más el monto que Gofo ya te descontó.
        </p>
      )}
    </Card>
  )
}
