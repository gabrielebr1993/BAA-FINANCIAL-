import { useState, useMemo } from 'react'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { perdonarClaim, quitarPerdon, decidirClaimRepetido } from '../utils/claims'
import { porCiudad, claimsValidos, detectarClaimsRepetidos } from '../utils/calc'
import { CLAIM_FEE, nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { AlertTriangle, Handshake, Ban, Percent, TrendingDown, Copy, Check, X } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Badge, Input, Select, Cargando, EstadoVacio } from '../components/ui'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

export default function Claims() {
  const { perfil } = useAuth()
  const { claims, facturaRango: selectedInvoice, selectedCity, reloadClaims, cargando } = useData()
  const [fCourier, setFCourier] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const base = useMemo(() => porCiudad(claims, selectedCity), [claims, selectedCity])
  const couriers = useMemo(() => [...new Set(base.map((c) => c.courier))].sort(), [base])
  const tipos = useMemo(() => [...new Set(base.map((c) => c.claimType).filter(Boolean))].sort(), [base])

  // Casos de claim repetido (mismo waybill) y su estado de revisión por waybill.
  const casosRepetidos = useMemo(() => detectarClaimsRepetidos(base), [base])
  const estadoPorWaybill = useMemo(() => {
    const m = {}
    for (const g of casosRepetidos) m[g.waybill] = g.estado
    return m
  }, [casosRepetidos])
  const pendientesRepetidos = casosRepetidos.filter((g) => (g.estado || 'pendiente') === 'pendiente')

  const resolverRepetido = async (caso, decision) => {
    setOcupado(true)
    await decidirClaimRepetido(caso.claims, decision, perfil)
    await reloadClaims()
    setOcupado(false)
  }

  const filtrados = base.filter((c) => {
    if (fCourier && c.courier !== fCourier) return false
    if (fTipo && c.claimType !== fTipo) return false
    if (fEstado === 'perdonado' && !c.perdonado) return false
    if (fEstado === 'activo' && c.perdonado) return false
    return true
  })

  const validos = useMemo(() => claimsValidos(base), [base])
  const totalClaims = validos.length
  const perdonados = validos.filter((c) => c.perdonado).length
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
      <PageTitle right={<><RangeSelector /><CitySelector /></>}>Claims</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando claims…" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <KPI label="Total claims" value={num(totalClaims)} icon={AlertTriangle} accent="navy" />
            <KPI label="Perdonados" value={num(perdonados)} icon={Handshake} accent="green" />
            <KPI label="Activos" value={num(activos)} icon={Ban} accent="red" />
            <KPI label="Descuento a choferes" value={money(descuentoChoferes)} icon={Percent} accent="gold" sub={`${num(activos)} × $${CLAIM_FEE}`} />
            <KPI label="Te descontó Gofo" value={money(descuentoGofo)} icon={TrendingDown} accent="red" />
          </div>

          {pendientesRepetidos.length > 0 && (
            <Card className="mb-4 border-2 border-amber-400/70 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Copy size={18} strokeWidth={1.8} className="text-amber-500" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Claims repetidos pendientes de aprobación</h3>
                <Badge color="gold">{pendientesRepetidos.length}</Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Un mismo tracking aparece más de una vez (claim + reversión). Aprobar cuenta el claim y cobra $100 al chofer; anular no cuenta ni cobra. El neto de Gofo no cambia.
              </p>
              <div className="space-y-3">
                {pendientesRepetidos.map((caso) => (
                  <div key={caso.waybill} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-semibold text-brand-navy dark:text-slate-100">{caso.waybill}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">· {caso.courier}</span>
                      <div className="ml-auto flex gap-2">
                        <Boton variant="success" disabled={ocupado} onClick={() => resolverRepetido(caso, 'aprobado')} className="px-3 py-1.5 text-xs"><Check size={14} strokeWidth={2} /> Aprobar</Boton>
                        <Boton variant="danger" disabled={ocupado} onClick={() => resolverRepetido(caso, 'anulado')} className="px-3 py-1.5 text-xs"><X size={14} strokeWidth={2} /> Anular</Boton>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {caso.claims.map((c, i) => (
                        <span key={i} className={`rounded-lg px-2 py-1 text-xs font-medium ${Number(c.montoGofo) < 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
                          {money(c.montoGofo)} · {c.claimType || 'sin tipo'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
                  { key: 'revision', label: 'Revisión', align: 'center' },
                  { key: 'estado', label: 'Estado', align: 'center' },
                  { key: 'acciones', label: 'Acción', align: 'right' },
                ]}
                rows={filtrados.map((c) => ({ ...c, _key: c.id }))}
                emptyText="Sin claims con estos filtros."
                renderCell={(row, key) => {
                  if (key === 'montoGofo') return money(row.montoGofo)
                  if (key === 'ciudad') return nombreCiudad(row.ciudad)
                  if (key === 'revision') {
                    const est = estadoPorWaybill[(row.waybill || '').trim()]
                    if (!est) return <span className="text-slate-300 dark:text-slate-600">—</span>
                    if (est === 'aprobado') return <Badge color="green">Repetido · aprobado</Badge>
                    if (est === 'anulado') return <Badge color="slate">Repetido · anulado</Badge>
                    return <Badge color="gold">Repetido · pendiente</Badge>
                  }
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
                        <span className="self-center text-xs font-semibold text-rose-600 dark:text-rose-400" title="Los $100 que dejaste de cobrar más lo que Gofo ya te descontó">
                          te costó {money(CLAIM_FEE + Math.abs(Number(row.montoGofo) || 0))}
                        </span>
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
