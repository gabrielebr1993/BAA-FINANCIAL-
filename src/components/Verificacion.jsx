// Panel "cuadra con Gofo" (Financiero, Dashboard) en Tailwind.
import { money } from '../utils/format'
import { Card, Aviso, Badge, Tabla } from './ui'

export default function Verificacion({ v, compacto }) {
  if (!v) return null
  if (!v.gofo || !v.gofo.disponible) {
    return (
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">Verificación con Gofo</h3>
        <Aviso tipo="warn">Esta factura no incluyó la hoja "DSP Summary". Neto calculado: {money(v.netoCalculado)}.</Aviso>
      </Card>
    )
  }
  const borde = v.cuadra ? 'border-emerald-400 dark:border-emerald-500/60' : 'border-rose-400 dark:border-rose-500/60'
  return (
    <Card className={`mb-4 border-2 p-4 ${borde}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Verificación con Gofo</h3>
        <span className="ml-auto">
          {v.cuadra ? <Badge color="green">✅ Cuadra con Gofo</Badge> : <Badge color="red">⚠️ No cuadra — revisar</Badge>}
        </span>
      </div>
      <div className={`flex flex-wrap gap-6 ${compacto ? '' : 'mb-4'}`}>
        <Bloque label="Nuestro neto calculado" value={money(v.netoCalculado)} />
        <Bloque label="Total oficial de Gofo" value={money(v.gofo.totalGofo)} />
        <Bloque label="Diferencia" value={money(v.diferencia)} clase={v.cuadra ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} />
      </div>
      {!compacto && (
        <Tabla
          minWidth="min-w-[420px]"
          columns={[
            { key: 'linea', label: 'Línea' },
            { key: 'nuestro', label: 'Nuestro cálculo', align: 'right' },
            { key: 'gofo', label: 'Gofo (DSP Summary)', align: 'right' },
          ]}
          rows={[
            { _key: 'e', linea: 'Entregas', nuestro: v.sumaEntregas, gofo: null },
            { _key: 'o', linea: 'Offset', nuestro: v.sumaOffset, gofo: -Math.abs(v.gofo.offset) },
            { _key: 'c', linea: 'Claims', nuestro: v.sumaClaims, gofo: -Math.abs(v.gofo.claim) },
            { _key: 'a', linea: 'Ajustes', nuestro: v.sumaAjustes, gofo: -Math.abs(v.gofo.ajuste) },
            { _key: 't', linea: 'NETO', nuestro: v.netoCalculado, gofo: v.gofo.totalGofo },
          ]}
          renderCell={(row, key) => {
            if (key === 'linea') return <b>{row.linea}</b>
            return row[key] == null ? '—' : money(row[key])
          }}
        />
      )}
    </Card>
  )
}

function Bloque({ label, value, clase }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${clase || 'text-brand-navy dark:text-slate-100'}`}>{value}</div>
    </div>
  )
}
