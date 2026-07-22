import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { perdonarClaim, quitarPerdon, decidirClaimRepetido, perdonarVarios, quitarPerdonVarios, cambiarMetodoClaim, cambiarMetodoVarios } from '../utils/claims'
import { porCiudad, claimsDeCiudad, claimsValidos, detectarClaimsRepetidos, feeDeClaim, metodoDe, categoriaClaim, etiquetaCategoria } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { AlertTriangle, Handshake, Ban, Percent, TrendingDown, Copy, Check, X } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Badge, Input, Select, Cargando, EstadoVacio } from '../components/ui'

export default function Claims() {
  const { perfil, esSuperAdmin } = useAuth()
  // Solo owner/admin/superadmin ven la info financiera de Gofo (igual que el resto de la
  // app). Al MANAGER se le ocultan la columna Categoría·Método y Monto Gofo, y las tarjetas
  // de "Descuento a choferes" y "Te descontó Gofo".
  const verGofo = esSuperAdmin || perfil?.role === 'owner' || perfil?.role === 'admin'
  const ocultarGofo = !verGofo
  const { claims, facturaRango: selectedInvoice, selectedCity, reloadClaims, cargando } = useData()
  const [fCourier, setFCourier] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // multiselección
  const [sel, setSel] = useState(() => new Set())
  const [lote, setLote] = useState(false) // true = capturando motivo del lote
  const [motivoLote, setMotivoLote] = useState('')

  const base = useMemo(() => claimsDeCiudad(claims, selectedCity, selectedInvoice), [claims, selectedCity, selectedInvoice])
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
  // Descuento a choferes = suma de la multa de cada claim activo, según su tipo/modo
  // (general, reducida para tracking interruption/lost, o "real" = lo de Gofo).
  const descuentoChoferes = validos.filter((c) => !c.perdonado).reduce((a, c) => a + feeDeClaim(selectedInvoice, c.ciudad, c), 0)
  const descuentoGofo = base.reduce((a, c) => a + (c.montoGofo || 0), 0)

  // ---- multiselección (respeta los filtros activos) ----
  const idsFiltrados = filtrados.map((c) => c.id)
  const todosSel = idsFiltrados.length > 0 && idsFiltrados.every((id) => sel.has(id))
  const toggleUno = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodos = () => setSel((s) => {
    const n = new Set(s)
    if (todosSel) idsFiltrados.forEach((id) => n.delete(id))
    else idsFiltrados.forEach((id) => n.add(id))
    return n
  })
  const seleccionados = filtrados.filter((c) => sel.has(c.id))
  const selPorPerdonar = seleccionados.filter((c) => !c.perdonado)
  const selPorRestaurar = seleccionados.filter((c) => c.perdonado)
  const limpiarSel = () => { setSel(new Set()); setLote(false); setMotivoLote('') }

  const confirmarLote = async () => {
    setOcupado(true)
    await perdonarVarios(selPorPerdonar, motivoLote, perfil)
    await reloadClaims()
    limpiarSel()
    setOcupado(false)
  }
  const quitarPerdonLote = async () => {
    setOcupado(true)
    await quitarPerdonVarios(selPorRestaurar)
    await reloadClaims()
    limpiarSel()
    setOcupado(false)
  }

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

  // Cambiar el método (M1/M2/M3 o 'auto') de UN claim.
  const cambiarMetodo = async (claim, metodo) => {
    setOcupado(true)
    await cambiarMetodoClaim(claim, metodo === 'auto' ? null : metodo)
    await reloadClaims()
    setOcupado(false)
  }
  // Cambiar el método de los seleccionados.
  const cambiarMetodoLote = async (metodo) => {
    setOcupado(true)
    await cambiarMetodoVarios(seleccionados, metodo === 'auto' ? null : metodo)
    await reloadClaims()
    limpiarSel()
    setOcupado(false)
  }

  return (
    <div>
      <PageTitle>Claims</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando claims…" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <KPI label="Total claims" value={num(totalClaims)} icon={AlertTriangle} accent="navy" />
            <KPI label="Perdonados" value={num(perdonados)} icon={Handshake} accent="green" />
            <KPI label="Activos" value={num(activos)} icon={Ban} accent="red" />
            {!ocultarGofo && <KPI label="Descuento a choferes" value={money(descuentoChoferes)} icon={Percent} accent="gold" sub={`${num(activos)} claim(s) activo(s)`} />}
            {!ocultarGofo && <KPI label="Te descontó Gofo" value={money(descuentoGofo)} icon={TrendingDown} accent="red" />}
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
                          {ocultarGofo ? (c.claimType || 'sin tipo') : <>{money(c.montoGofo)} · {c.claimType || 'sin tipo'}</>}
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

              {/* Barra de acciones en lote (multiselección) */}
              {seleccionados.length > 0 && (
                <Card className="mb-3 border-2 border-brand-gold/50 p-3">
                  {!lote ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-brand-navy dark:text-slate-100">{seleccionados.length} seleccionado(s)</span>
                      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Método:</span>
                        {['M1', 'M2', 'M3', 'auto'].map((mm) => (
                          <Boton key={mm} variant="ghost" disabled={ocupado} onClick={() => cambiarMetodoLote(mm)} className="px-2 py-1 text-xs">{mm === 'auto' ? 'Auto' : mm}</Boton>
                        ))}
                      </div>
                      <div className="ml-auto flex flex-wrap gap-2">
                        <Boton variant="success" disabled={ocupado || selPorPerdonar.length === 0} onClick={() => setLote(true)} className="px-3 py-1.5 text-xs">
                          <Handshake size={14} strokeWidth={1.8} /> Perdonar seleccionados ({selPorPerdonar.length})
                        </Boton>
                        <Boton variant="danger" disabled={ocupado || selPorRestaurar.length === 0} onClick={quitarPerdonLote} className="px-3 py-1.5 text-xs">
                          Quitar perdón ({selPorRestaurar.length})
                        </Boton>
                        <Boton variant="ghost" onClick={limpiarSel} className="px-3 py-1.5 text-xs">Limpiar</Boton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input autoFocus className="w-64" placeholder="Motivo del perdón (uno para todos)…" value={motivoLote} onChange={(e) => setMotivoLote(e.target.value)} />
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Vas a perdonar <b>{selPorPerdonar.length}</b> claim(s){motivoLote ? <> con el motivo: “{motivoLote}”</> : null}. Cada uno absorbe su propio monto de Gofo.
                      </span>
                      <div className="ml-auto flex gap-2">
                        <Boton variant="success" disabled={ocupado} onClick={confirmarLote} className="px-3 py-1.5 text-xs">Confirmar</Boton>
                        <Boton variant="ghost" onClick={() => { setLote(false); setMotivoLote('') }} className="px-3 py-1.5 text-xs">Cancelar</Boton>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              <Tabla
                columns={[
                  { key: 'sel', label: <input type="checkbox" aria-label="Seleccionar todos" checked={todosSel} onChange={toggleTodos} />, align: 'center' },
                  { key: 'waybill', label: 'Waybill' },
                  { key: 'courier', label: 'Chofer' },
                  { key: 'date', label: 'Fecha' },
                  { key: 'claimType', label: 'Tipo' },
                  !ocultarGofo && { key: 'metodo', label: 'Categoría · Método', align: 'center' },
                  { key: 'ciudad', label: 'Ciudad' },
                  !ocultarGofo && { key: 'montoGofo', label: 'Monto Gofo', align: 'right' },
                  { key: 'revision', label: 'Revisión', align: 'center' },
                  { key: 'estado', label: 'Estado', align: 'center' },
                  { key: 'acciones', label: 'Acción', align: 'right' },
                ].filter(Boolean)}
                rows={filtrados.map((c) => ({ ...c, _key: c.id }))}
                emptyText="Sin claims con estos filtros."
                renderCell={(row, key) => {
                  if (key === 'sel') return <input type="checkbox" aria-label="Seleccionar claim" checked={sel.has(row.id)} onChange={() => toggleUno(row.id)} />
                  if (key === 'waybill') return <Link to={`/tracking/${encodeURIComponent(row.waybill)}`} className="font-medium text-brand-navy hover:underline dark:text-brand-gold">{row.waybill || '—'}</Link>
                  if (key === 'montoGofo') return money(row.montoGofo)
                  if (key === 'metodo') {
                    const cat = row.categoria || categoriaClaim(row.claimType)
                    const manual = row.metodo === 'M1' || row.metodo === 'M2' || row.metodo === 'M3'
                    // método que resolverían las reglas (ignorando el override manual)
                    const auto = metodoDe(selectedInvoice, row.ciudad, { ...row, metodo: undefined })
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{etiquetaCategoria(cat)}</span>
                        <Select className="w-40 py-1 text-xs" value={manual ? row.metodo : 'auto'} disabled={ocupado} onChange={(e) => cambiarMetodo(row, e.target.value)}>
                          <option value="auto">Auto ({auto === 'M1' ? 'Manual' : auto === 'M2' ? 'Gofo' : 'Perdón'})</option>
                          <option value="M1">Manual</option>
                          <option value="M2">Lo que Gofo cobra</option>
                          <option value="M3">Perdón</option>
                        </Select>
                        {manual && <span className="text-[10px] font-semibold text-brand-gold">manual</span>}
                      </div>
                    )
                  }
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
                          <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} className="px-2.5 py-1 text-xs"><X size={13} strokeWidth={2.2} /></Boton>
                        </div>
                      )
                    return row.perdonado ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {row.motivo && <span className="self-center text-xs text-slate-400" title={row.motivo}>“{row.motivo.slice(0, 18)}”</span>}
                        {!ocultarGofo && (
                          <span className="self-center text-xs font-semibold text-rose-600 dark:text-rose-400" title="Solo lo que Gofo te descontó por ESTE claim (los $100 son una multa que dejas de cobrar, no una pérdida)">
                            te costó {money(Math.abs(Number(row.montoGofo) || 0))}
                          </span>
                        )}
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
