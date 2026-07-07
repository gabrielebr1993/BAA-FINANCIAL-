// Panel de desglose BRUTO → NETO + verificación "cuadra con Gofo".
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { money } from '../utils/format'
import { Card, Aviso, Badge, Tabla } from './ui'

// Monto con negativos en rojo suave.
function Monto({ v, fuerte }) {
  const neg = (Number(v) || 0) < 0
  return <span className={`${fuerte ? 'font-bold' : 'font-semibold'} ${neg ? 'text-rose-600 dark:text-rose-400' : ''}`}>{money(v)}</span>
}

export default function Verificacion({ v, compacto }) {
  if (!v) return null
  const hayGofo = v.gofo && v.gofo.disponible
  const borde = !hayGofo ? '' : v.cuadra ? 'border-emerald-400 dark:border-emerald-500/60' : 'border-rose-400 dark:border-rose-500/60'

  return (
    <Card className={`mb-4 p-5 ${hayGofo ? 'border-2 ' + borde : ''}`}>
      {/* --- Desglose BRUTO → NETO --- */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">Desglose del pago de Gofo</h3>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Entregas <Badge color="slate">bruto</Badge></span>
              <Monto v={v.sumaEntregas} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Offset</span>
              <Monto v={v.sumaOffset} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Claims (Gofo)</span>
              <Monto v={v.sumaClaims} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Ajustes</span>
              <Monto v={v.sumaAjustes} />
            </li>
            <li className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-bold text-brand-navy dark:text-slate-100">NETO A COBRAR <Badge color="gold">neto</Badge></span>
              <span className="text-xl font-extrabold text-brand-gold">{money(v.netoCalculado)}</span>
            </li>
          </ul>
        </div>

        {/* --- Verificación con Gofo --- */}
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          {hayGofo ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                {v.cuadra ? <CheckCircle2 size={18} className="text-emerald-500" /> : <AlertTriangle size={18} className="text-rose-500" />}
                {v.cuadra ? <Badge color="green">Cuadra con Gofo</Badge> : <Badge color="red">No cuadra: {money(v.diferencia)}</Badge>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Nuestro neto</span><span className="font-semibold">{money(v.netoCalculado)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total oficial de Gofo</span><span className="font-semibold">{money(v.gofo.totalGofo)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Diferencia</span><span className={`font-bold ${v.cuadra ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(v.diferencia)}</span></div>
              </div>
            </>
          ) : (
            <Aviso tipo="warn" className="mb-0">Esta factura no incluyó la hoja "DSP Summary" para verificar. Neto calculado: {money(v.netoCalculado)}.</Aviso>
          )}
        </div>
      </div>

      {/* --- Desglose lado a lado (solo si NO cuadra o vista completa) --- */}
      {!compacto && hayGofo && (
        <Tabla
          minWidth="min-w-[420px]"
          columns={[
            { key: 'linea', label: 'Línea' },
            { key: 'nuestro', label: 'Nuestro cálculo', align: 'right' },
            { key: 'gofo', label: 'Gofo (DSP Summary)', align: 'right' },
          ]}
          rows={[
            { _key: 'e', linea: 'Entregas (bruto)', nuestro: v.sumaEntregas, gofo: null },
            { _key: 'o', linea: 'Offset', nuestro: v.sumaOffset, gofo: -Math.abs(v.gofo.offset) },
            { _key: 'c', linea: 'Claims', nuestro: v.sumaClaims, gofo: -Math.abs(v.gofo.claim) },
            { _key: 'a', linea: 'Ajustes', nuestro: v.sumaAjustes, gofo: -Math.abs(v.gofo.ajuste) },
            { _key: 't', linea: 'NETO', nuestro: v.netoCalculado, gofo: v.gofo.totalGofo },
          ]}
          renderCell={(row, key) => {
            if (key === 'linea') return <b>{row.linea}</b>
            return row[key] == null ? '—' : <Monto v={row[key]} fuerte={row.linea === 'NETO'} />
          }}
        />
      )}

      {/* Cuadre por semana cuando el rango tiene varias facturas */}
      {!compacto && Array.isArray(v.porFactura) && v.porFactura.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Cuadre por semana (cada factura tiene su propio Bill Number)</div>
          <Tabla
            minWidth="min-w-[420px]"
            columns={[
              { key: 'semana', label: 'Semana' },
              { key: 'neto', label: 'Nuestro neto', align: 'right' },
              { key: 'gofo', label: 'Gofo', align: 'right' },
              { key: 'estado', label: 'Estado', align: 'center' },
            ]}
            rows={v.porFactura.map((f, i) => ({ _key: i, semana: f.semana, vv: f.v }))}
            renderCell={(row, key) => {
              const vv = row.vv || {}
              if (key === 'semana') return row.semana
              if (key === 'neto') return money(vv.netoCalculado)
              if (key === 'gofo') return vv.gofo?.disponible ? money(vv.gofo.totalGofo) : '—'
              if (key === 'estado')
                return vv.cuadra == null ? <Badge color="slate">s/DSP</Badge> : vv.cuadra ? <Badge color="green">OK</Badge> : <Badge color="red">≠</Badge>
              return null
            }}
          />
        </div>
      )}
    </Card>
  )
}
