import { useState, useMemo } from 'react'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { porCiudad, TODAS } from '../utils/calc'
import { CLAIM_FEE, COLORS, nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, Stat, PageTitle, Boton, Tabla, Aviso, Badge } from '../components/ui'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

export default function Claims() {
  const { perfil } = useAuth()
  const { claims, selectedInvoice, selectedCity, reloadClaims } = useData()
  const [fCourier, setFCourier] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const base = useMemo(() => porCiudad(claims, selectedCity), [claims, selectedCity])

  const couriers = useMemo(() => [...new Set(base.map((c) => c.courier))].sort(), [base])
  const tipos = useMemo(() => [...new Set(base.map((c) => c.claimType).filter(Boolean))].sort(), [base])

  const filtrados = base.filter((c) => {
    if (fCourier && c.courier !== fCourier) return false
    if (fTipo && c.claimType !== fTipo) return false
    if (fEstado === 'perdonado' && !c.perdonado) return false
    if (fEstado === 'activo' && c.perdonado) return false
    return true
  })

  const totalClaims = base.length
  const perdonados = base.filter((c) => c.perdonado).length
  const activos = totalClaims - perdonados
  const descuentoChoferes = activos * CLAIM_FEE
  const descuentoGofo = base.reduce((a, c) => a + (c.montoGofo || 0), 0)

  const confirmarPerdon = async (claim) => {
    setOcupado(true)
    await perdonarClaim(claim, motivo, perfil)
    await reloadClaims()
    setPerdonandoId(null)
    setMotivo('')
    setOcupado(false)
  }

  const restaurar = async (claim) => {
    setOcupado(true)
    await quitarPerdon(claim)
    await reloadClaims()
    setOcupado(false)
  }

  if (!selectedInvoice) return <Vacio />

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Claims</PageTitle>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Stat label="Total claims" value={num(totalClaims)} />
        <Stat label="Perdonados" value={num(perdonados)} color={COLORS.green} />
        <Stat label="Activos" value={num(activos)} color={COLORS.red} />
        <Stat label="Descuento a choferes" value={money(descuentoChoferes)} sub={`${num(activos)} × $${CLAIM_FEE}`} />
        <Stat label="Te descontó Gofo" value={money(descuentoGofo)} color={COLORS.red} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={fCourier} onChange={(e) => setFCourier(e.target.value)} style={selStyle}>
            <option value="">Todos los choferes</option>
            {couriers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={selStyle}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={selStyle}>
            <option value="">Todos los estados</option>
            <option value="activo">Solo activos</option>
            <option value="perdonado">Solo perdonados</option>
          </select>
          <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 13 }}>{filtrados.length} claim(s)</span>
        </div>
      </Card>

      <Tabla
        columns={[
          { key: 'waybill', label: 'Waybill' },
          { key: 'courier', label: 'Chofer' },
          { key: 'date', label: 'Fecha' },
          { key: 'claimType', label: 'Tipo' },
          { key: 'ciudad', label: 'Ciudad' },
          { key: 'montoGofo', label: 'Monto Gofo', align: 'right' },
          { key: 'estado', label: 'Estado', align: 'center' },
          { key: 'acciones', label: 'Acción', align: 'right' },
        ]}
        rows={filtrados.map((c) => ({ ...c, _key: c.id }))}
        emptyText="Sin claims con estos filtros."
        renderCell={(row, key) => {
          if (key === 'montoGofo') return money(row.montoGofo)
          if (key === 'ciudad') return nombreCiudad(row.ciudad)
          if (key === 'estado')
            return row.perdonado ? (
              <Badge color={COLORS.green} title={row.motivo}>Perdonado</Badge>
            ) : (
              <Badge color={COLORS.red}>Activo</Badge>
            )
          if (key === 'acciones') {
            if (perdonandoId === row.id)
              return (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder="Motivo…"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    style={{ ...selStyle, width: 150 }}
                  />
                  <Boton variant="success" disabled={ocupado} onClick={() => confirmarPerdon(row)} style={{ padding: '5px 10px', fontSize: 13 }}>
                    OK
                  </Boton>
                  <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} style={{ padding: '5px 10px', fontSize: 13 }}>
                    ✕
                  </Boton>
                </div>
              )
            return row.perdonado ? (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {row.motivo && <span style={{ fontSize: 12, color: COLORS.muted, alignSelf: 'center' }} title={row.motivo}>“{row.motivo.slice(0, 18)}”</span>}
                <Boton variant="ghost" disabled={ocupado} onClick={() => restaurar(row)} style={{ padding: '5px 10px', fontSize: 13 }}>
                  Quitar perdón
                </Boton>
              </div>
            ) : (
              <Boton variant="ghost" onClick={() => { setPerdonandoId(row.id); setMotivo('') }} style={{ padding: '5px 10px', fontSize: 13 }}>
                Perdonar
              </Boton>
            )
          }
          return row[key] || '—'
        }}
      />
    </div>
  )
}

const selStyle = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, background: '#fff' }

function Vacio() {
  return (
    <div>
      <PageTitle>Claims</PageTitle>
      <Aviso tipo="info">No hay facturas cargadas todavía. Ve a <b>Cargar Factura</b> para subir la primera.</Aviso>
    </div>
  )
}
