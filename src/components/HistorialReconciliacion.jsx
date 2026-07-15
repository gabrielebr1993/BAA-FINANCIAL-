// Historial de reconciliación con Gofo: una fila por factura (ciudad · semana) con
// nuestro neto vs el total oficial de Gofo y si CUADRA. Sirve para ver de un vistazo
// qué semanas/ciudades no cuadraron y perseguir la diferencia (confianza de datos).
import { useData } from '../DataContext'
import { money } from '../utils/format'
import { Card, Badge } from './ui'
import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'

export default function HistorialReconciliacion() {
  const { invoices } = useData()
  const filas = (invoices || [])
    .filter((i) => i.verificacion)
    .map((i) => {
      const v = i.verificacion
      return {
        id: i.id,
        ciudad: i.ciudadNombre || i.ciudad || '—',
        semana: i.semana || '—',
        neto: v.netoCalculado || 0,
        gofo: v.gofo?.totalGofo || 0,
        diferencia: v.diferencia || 0,
        // cuadra: true/false si hay total de Gofo; null si no se pudo comparar.
        cuadra: v.gofo?.disponible ? !!v.cuadra : null,
        t: i.fechaInicio instanceof Date ? i.fechaInicio.getTime() : 0,
      }
    })
    .sort((a, b) => b.t - a.t)

  if (!filas.length) return null
  const noCuadran = filas.filter((f) => f.cuadra === false).length

  const Estado = ({ f }) => {
    if (f.cuadra === null) return <span className="inline-flex items-center gap-1 text-slate-400"><MinusCircle size={15} strokeWidth={1.9} /> Sin total Gofo</span>
    if (f.cuadra) return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={15} strokeWidth={1.9} /> Cuadra</span>
    return <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle size={15} strokeWidth={1.9} /> No cuadra</span>
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Historial de reconciliación con Gofo</h3>
        {noCuadran > 0
          ? <Badge color="red">{noCuadran} no cuadra(n)</Badge>
          : <Badge color="green">Todo cuadra</Badge>}
        <span className="ml-auto text-xs text-slate-400">{filas.length} factura(s)</span>
      </div>
      <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <th className="px-3 py-2.5 text-left font-semibold">Ciudad</th>
              <th className="px-3 py-2.5 text-left font-semibold">Semana</th>
              <th className="px-3 py-2.5 text-right font-semibold">Nuestro neto</th>
              <th className="px-3 py-2.5 text-right font-semibold">Total Gofo</th>
              <th className="px-3 py-2.5 text-right font-semibold">Diferencia</th>
              <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={`border-t border-slate-100 dark:border-slate-700/50 ${f.cuadra === false ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}`}>
                <td className="px-3 py-2 font-medium text-brand-navy dark:text-slate-100">{f.ciudad}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{f.semana}</td>
                <td className="px-3 py-2 text-right">{money(f.neto)}</td>
                <td className="px-3 py-2 text-right">{money(f.gofo)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${Math.abs(f.diferencia) < 0.01 ? 'text-slate-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(f.diferencia)}</td>
                <td className="px-3 py-2"><Estado f={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Cada factura es una ciudad-semana. "No cuadra" = nuestro neto calculado difiere del total oficial que pagó Gofo — revisa esa carga.</p>
    </Card>
  )
}
