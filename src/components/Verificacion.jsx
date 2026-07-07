// Panel de verificación "cuadra con Gofo" reutilizable (Financiero, Dashboard).
import { COLORS } from '../constants'
import { money } from '../utils/format'
import { Card, Tabla, Aviso, Badge } from './ui'

export default function Verificacion({ v, compacto }) {
  if (!v) return null
  if (!v.gofo || !v.gofo.disponible) {
    return (
      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 8px', color: COLORS.navy }}>Verificación con Gofo</h3>
        <Aviso tipo="warn">Esta factura no incluyó la hoja "DSP Summary". Neto calculado: {money(v.netoCalculado)}.</Aviso>
      </Card>
    )
  }
  return (
    <Card style={{ marginBottom: 18, borderColor: v.cuadra ? COLORS.green : COLORS.red, borderWidth: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, color: COLORS.navy }}>Verificación con Gofo</h3>
        <span style={{ marginLeft: 'auto' }}>
          {v.cuadra ? <Badge color={COLORS.green}>✅ Cuadra con Gofo</Badge> : <Badge color={COLORS.red}>⚠️ No cuadra — revisar</Badge>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: compacto ? 0 : 16 }}>
        <Bloque label="Nuestro neto calculado" value={money(v.netoCalculado)} />
        <Bloque label="Total oficial de Gofo" value={money(v.gofo.totalGofo)} />
        <Bloque label="Diferencia" value={money(v.diferencia)} color={v.cuadra ? COLORS.green : COLORS.red} />
      </div>
      {!compacto && (
        <Tabla
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

function Bloque({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || COLORS.navy }}>{value}</div>
    </div>
  )
}
