import { useState, useMemo } from 'react'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { porCiudad } from '../utils/calc'
import { CLAIM_FEE, nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, KPI, PageTitle, Boton, Tabla, Badge, Input, Select, Cargando, EstadoVacio } from '../components/ui'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

export default function Claims() {
  const { perfil } = useAuth()
  const { claims, selectedInvoice, selectedCity, reloadClaims, cargando } = useData()
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

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Claims</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando claims…" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <KPI label="Total claims" value={num(totalClaims)} icon="⚠️" accent="navy" />
            <KPI label="Perdonados" value={num(perdonados)} icon="🤝" accent="green" />
            <KPI label="Activos" value={num(activos)} icon="💢" accent="red" />
            <KPI label="Descuento a choferes" value={money(descuentoChoferes)} accent="gold" sub={`${num(activos)} × $${CLAIM_FEE}`} />
            <KPI label="Te descontó Gofo" value={money(descuentoGofo)} accent="red" />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio texto="Cuando cargues una factura verás aquí todos los claims para perdonarlos o cobrarlos." />
          ) : (
            <>
              <Card className="mb-4 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={fCourier} onChange={(e) => setFCourier(e.target.value)}>
                    <option value="">Todos los choferes</option>
                    {couriers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                  <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {tipos.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                  <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="activo">Solo activos</option>
                    <option value="perdonado">Solo perdonados</option>
                  </Select>
                  <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{filtrados.length} claim(s)</span>
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
                    return row.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo</Badge>
                  if (key === 'acciones') {
                    if (perdonandoId === row.id)
                      return (
                        <div className="flex items-center justify-end gap-1.5">
                          <Input autoFocus className="w-36" placeholder="Motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                          <Boton variant="success" disabled={ocupado} onClick={() => confirmarPerdon(row)} className="px-2.5 py-1 text-xs">OK</Boton>
                          <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} className="px-2.5 py-1 text-xs">✕</Boton>
                        </div>
                      )
                    return row.perdonado ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {row.motivo && <span className="self-center text-xs text-slate-400" title={row.motivo}>“{row.motivo.slice(0, 18)}”</span>}
                        <Boton variant="ghost" disabled={ocupado} onClick={() => restaurar(row)} className="px-2.5 py-1 text-xs">Quitar perdón</Boton>
                      </div>
                    ) : (
                      <Boton variant="ghost" onClick={() => { setPerdonandoId(row.id); setMotivo('') }} className="px-2.5 py-1 text-xs">Perdonar</Boton>
                    )
                  }
                  return row[key] || '—'
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
