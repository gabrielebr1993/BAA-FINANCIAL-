// ============================================================================
// ECOMMERCE · Operación: Pedidos (cadena logística de 9 pasos), Compras a
// proveedor vinculadas, Finanzas (demo) y Tickets de soporte.
//
// Estados SEPARADOS por diseño (pedido / pago / compra / envío): un fallo en
// uno no "confirma" otro por accidente. La compra al proveedor es un registro
// APARTE unido al pedido (orderId) con evidencia manual (número de orden del
// proveedor + enlace) — nunca se marca comprada sin evidencia.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { ESTADOS_ENVIO, labelEstadoEnvio, money2, PROVEEDORES } from './datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../components/ui'
import { X, Plus } from 'lucide-react'

const cargar = async (col, ord = 'creadoEn') => {
  try {
    const snap = await getDocs(query(collection(db, col), orderBy(ord, 'desc')))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch {
    const snap = await getDocs(collection(db, col))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
}
const colorEstado = (e) => (e === 'entregado' ? 'green' : e === 'cancelado' || e === 'incidencia' ? 'red' : 'slate')

// ── PEDIDOS ────────────────────────────────────────────────────────────────
export function EcomPedidos({ ctx }) {
  const { auditar } = ctx
  const [pedidos, setPedidos] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const recargar = async () => setPedidos(await cargar('ecom_orders'))
  useEffect(() => { recargar() }, [])
  if (!pedidos) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle>Pedidos</PageTitle>
      {pedidos.length === 0 ? (
        <EstadoVacio titulo="Sin pedidos" texto="Crea uno desde la Tienda (vista previa) con el checkout DEMO." />
      ) : (
        <div className="space-y-2.5">
          {pedidos.map((p) => (
            <Card key={p.id} className="cursor-pointer p-4 transition hover:shadow-cardhover" onClick={() => setAbierto(p)}>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{p.numero}</b>
                {p.demo && <Badge color="gold">DEMO</Badge>}
                <Badge color={colorEstado(p.estadoEnvio)}>{labelEstadoEnvio(p.estadoEnvio)}</Badge>
                <Badge color="slate">pago: {p.estadoPago}</Badge>
                <Badge color="slate">compra: {p.estadoCompra}</Badge>
                <span className="ml-auto font-black tabular-nums text-emerald-600">{money2(p.totalUSD)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{p.cliente?.nombre} · {p.pais} · {p.direccion?.ciudad} · {(p.items || []).reduce((a, i) => a + i.cant, 0)} artículo(s) · {(p.paquetes || []).length} paquete(s)</div>
            </Card>
          ))}
        </div>
      )}
      {abierto && <DetallePedido pedido={abierto} onCerrar={() => setAbierto(null)} onCambio={async () => { await recargar(); setAbierto(null) }} auditar={auditar} />}
    </div>
  )
}

function DetallePedido({ pedido, onCerrar, onCambio, auditar }) {
  const [nota, setNota] = useState('')
  const [tracking, setTracking] = useState('')
  const [guardando, setGuardando] = useState(false)
  const idx = ESTADOS_ENVIO.findIndex((e) => e.id === pedido.estadoEnvio)
  const siguiente = ESTADOS_ENVIO[idx + 1]
  const avanzar = async () => {
    if (!siguiente) return
    // Control: no se avanza a "compra al proveedor" completada sin compra creada.
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'ecom_orders', pedido.id), {
        estadoEnvio: siguiente.id,
        estadoPedido: siguiente.id === 'entregado' ? 'entregado' : 'en_proceso',
        timeline: [...(pedido.timeline || []), { estado: siguiente.id, fecha: new Date().toISOString(), nota: nota || '' }],
      })
      auditar('pedido_avanzado', `${pedido.numero} → ${siguiente.label}`)
      onCambio()
    } finally { setGuardando(false) }
  }
  const agregarPaquete = async () => {
    if (!tracking.trim()) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'ecom_orders', pedido.id), {
        paquetes: [...(pedido.paquetes || []), { tracking: tracking.trim(), fecha: new Date().toISOString() }],
      })
      auditar('paquete_agregado', `${pedido.numero} · ${tracking.trim()}`)
      onCambio()
    } finally { setGuardando(false) }
  }
  const cancelar = async () => {
    if (!window.confirm('¿Marcar este pedido como CANCELADO? (demo: no hay reembolsos reales)')) return
    await updateDoc(doc(db, 'ecom_orders', pedido.id), {
      estadoPedido: 'cancelado', estadoPago: pedido.estadoPago === 'capturado' ? 'reembolsado' : pedido.estadoPago,
      timeline: [...(pedido.timeline || []), { estado: 'cancelado', fecha: new Date().toISOString(), nota: nota || 'Cancelado por el panel' }],
    })
    auditar('pedido_cancelado', pedido.numero)
    onCambio()
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><b className="text-lg text-brand-navy dark:text-slate-100">{pedido.numero}</b>{pedido.demo && <Badge color="gold">DEMO</Badge>}{pedido.estadoPedido === 'cancelado' && <Badge color="red">CANCELADO</Badge>}</div>
          <button onClick={onCerrar} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Cliente</div>
            <div className="text-sm">{pedido.cliente?.nombre}<br />{pedido.cliente?.correo}<br />{pedido.cliente?.telefono}</div>
            <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Entrega · {pedido.pais}</div>
            <div className="text-sm">{pedido.direccion?.linea1}, {pedido.direccion?.zona}, {pedido.direccion?.ciudad}{pedido.direccion?.referencia ? ` (${pedido.direccion.referencia})` : ''}</div>
            <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Artículos</div>
            {(pedido.items || []).map((i, n) => (
              <div key={n} className="flex justify-between text-sm"><span>{i.emoji} {i.nombre}{i.variante ? ` · ${i.variante}` : ''} ×{i.cant}</span><span className="tabular-nums">{money2(i.precioUSD * i.cant)}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-black dark:border-slate-700/60"><span>Total</span><span className="tabular-nums text-emerald-600">{money2(pedido.totalUSD)}</span></div>
            <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Paquetes / tracking</div>
            {(pedido.paquetes || []).length === 0 && <div className="text-xs text-slate-400">Aún sin paquetes.</div>}
            {(pedido.paquetes || []).map((pq, n) => <div key={n} className="text-sm tabular-nums">📦 {pq.tracking}</div>)}
            <div className="mt-1.5 flex gap-2">
              <Input placeholder="Agregar nro. de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
              <Boton variant="ghost" onClick={agregarPaquete} disabled={guardando}><Plus size={14} /></Boton>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Cadena logística</div>
            <ol className="space-y-1.5">
              {ESTADOS_ENVIO.map((e, i) => (
                <li key={e.id} className={`flex items-center gap-2 text-sm ${i <= idx ? '' : 'opacity-40'}`}>
                  <span>{e.icono}</span><span className={i === idx ? 'font-bold text-brand-navy dark:text-brand-gold' : ''}>{e.label}</span>
                  {i === idx && <Badge color="gold">actual</Badge>}
                </li>
              ))}
            </ol>
            {pedido.estadoPedido !== 'cancelado' && siguiente && (
              <div className="mt-3 space-y-2">
                <Input placeholder="Nota del paso (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
                <Boton variant="gold" className="w-full" onClick={avanzar} disabled={guardando}>{guardando ? <Spinner /> : `Avanzar a: ${siguiente.label}`}</Boton>
              </div>
            )}
            {pedido.estadoPedido !== 'cancelado' && <Boton variant="ghost" className="mt-2 w-full" onClick={cancelar}>Cancelar pedido</Boton>}
            <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Historial</div>
            <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-500">
              {[...(pedido.timeline || [])].reverse().map((t, n) => (
                <div key={n}>• {labelEstadoEnvio(t.estado)} — {new Date(t.fecha).toLocaleString()} {t.nota ? `· ${t.nota}` : ''}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── COMPRAS A PROVEEDOR ────────────────────────────────────────────────────
export function EcomCompras({ ctx }) {
  const { auditar } = ctx
  const [compras, setCompras] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const recargar = async () => { setCompras(await cargar('ecom_purchases')); setPedidos(await cargar('ecom_orders')) }
  useEffect(() => { recargar() }, [])
  const pendientes = useMemo(() => pedidos.filter((p) => p.estadoPedido !== 'cancelado'), [pedidos])
  const guardar = async () => {
    if (!form.orderId || !form.proveedor) return window.alert('Elige pedido y proveedor.')
    if (form.estado === 'comprada' && !form.ordenProveedor.trim()) return window.alert('Para marcarla COMPRADA necesitas la evidencia: número de orden del proveedor.')
    setGuardando(true)
    try {
      const pedido = pedidos.find((p) => p.id === form.orderId)
      await addDoc(collection(db, 'ecom_purchases'), {
        ...form, demo: !!pedido?.demo, numeroPedido: pedido?.numero || '',
        costoReal: Number(form.costoReal) || 0, creadoEn: serverTimestamp(),
      })
      if (form.estado === 'comprada') {
        await updateDoc(doc(db, 'ecom_orders', form.orderId), { estadoCompra: 'comprada' })
      }
      auditar('compra_registrada', `${pedido?.numero || ''} · ${form.proveedor} · ${form.estado}`)
      setForm(null); await recargar()
    } finally { setGuardando(false) }
  }
  if (!compras) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setForm({ orderId: '', proveedor: 'aliexpress', ordenProveedor: '', enlace: '', costoReal: '', estado: 'cotizando', notas: '' })}><Plus size={15} /> Registrar compra</Boton>}>Compras a proveedor</PageTitle>
      <Aviso tipo="info" className="mb-4">La compra al proveedor es un registro <b>separado del pedido</b> y requiere <b>evidencia</b> (número de orden del proveedor) para marcarse como comprada. Hoy es un flujo manual trazable; cuando haya integraciones aprobadas, este mismo registro se llenará solo.</Aviso>
      {compras.length === 0 ? <EstadoVacio titulo="Sin compras registradas" texto="Registra la compra o cotización de un pedido." /> : (
        <div className="space-y-2.5">
          {compras.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{c.numeroPedido || c.orderId}</b>
                {c.demo && <Badge color="gold">DEMO</Badge>}
                <Badge color="slate">{PROVEEDORES.find((p) => p.id === c.proveedor)?.nombre || c.proveedor}</Badge>
                <Badge color={c.estado === 'comprada' || c.estado === 'recibida_origen' ? 'green' : c.estado === 'incidencia' ? 'red' : 'slate'}>{c.estado}</Badge>
                <span className="ml-auto tabular-nums text-sm">costo real: <b>{money2(c.costoReal)}</b></span>
              </div>
              <div className="mt-1 text-xs text-slate-500">Orden proveedor: {c.ordenProveedor || '—'} {c.enlace && <>· <a href={c.enlace} target="_blank" rel="noreferrer" className="text-brand-steel underline">enlace</a></>} {c.notas && `· ${c.notas}`}</div>
            </Card>
          ))}
        </div>
      )}
      {form && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-brand-navy dark:text-slate-100">Registrar compra / cotización</div>
            <div className="space-y-2.5 text-sm">
              <label>Pedido
                <Select value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}>
                  <option value="">—</option>
                  {pendientes.map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.cliente?.nombre}</option>)}
                </Select>
              </label>
              <label>Proveedor
                <Select value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}>
                  {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
              </label>
              <label>Estado
                <Select value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                  {['cotizando', 'comprada', 'recibida_origen', 'incidencia', 'cancelada'].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </label>
              <label>Nro. de orden del proveedor (evidencia)<Input value={form.ordenProveedor} onChange={(e) => setForm((f) => ({ ...f, ordenProveedor: e.target.value }))} /></label>
              <label>Enlace (orden / producto)<Input value={form.enlace} onChange={(e) => setForm((f) => ({ ...f, enlace: e.target.value }))} /></label>
              <label>Costo real (USD)<Input type="number" step="0.01" value={form.costoReal} onChange={(e) => setForm((f) => ({ ...f, costoReal: e.target.value }))} /></label>
              <label>Notas<Input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={guardar} disabled={guardando}>{guardando ? <Spinner /> : 'Guardar'}</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FINANZAS (demo): utilidad por pedido con costos reales registrados ─────
export function EcomFinanzas() {
  const [pedidos, setPedidos] = useState(null)
  const [compras, setCompras] = useState([])
  useEffect(() => { (async () => { setPedidos(await cargar('ecom_orders')); setCompras(await cargar('ecom_purchases')) })() }, [])
  if (!pedidos) return <div className="py-16 text-center"><Spinner /></div>
  const filas = pedidos.filter((p) => p.estadoPedido !== 'cancelado').map((p) => {
    const costo = compras.filter((c) => c.orderId === p.id).reduce((a, c) => a + (Number(c.costoReal) || 0), 0)
    return { numero: p.numero, demo: p.demo, venta: p.totalUSD || 0, costo, utilidad: (p.totalUSD || 0) - costo, pago: p.estadoPago }
  })
  const tot = filas.reduce((a, f) => ({ venta: a.venta + f.venta, costo: a.costo + f.costo, utilidad: a.utilidad + f.utilidad }), { venta: 0, costo: 0, utilidad: 0 })
  const exportarCSV = () => {
    const csv = ['pedido,venta_usd,costo_registrado_usd,utilidad_usd,estado_pago,demo', ...filas.map((f) => `${f.numero},${f.venta},${f.costo},${f.utilidad},${f.pago},${f.demo ? 'SI' : 'NO'}`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'ecommerce_finanzas.csv'
    a.click()
  }
  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={exportarCSV}>Exportar CSV</Boton>}>Finanzas</PageTitle>
      <Aviso tipo="warn" className="mb-4">Cifras de <b>demostración</b>: no hay cobros reales. "Venta" = total del pedido; "Costo" = compras registradas a proveedor. Los ingresos cobrados vs pendientes se separarán cuando exista pasarela real.</Aviso>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Ventas (demo)</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{money2(tot.venta)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Costos registrados</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{money2(tot.costo)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Utilidad estimada</div><div className="text-xl font-black text-emerald-600">{money2(tot.utilidad)}</div></Card>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="p-3">Pedido</th><th className="p-3">Venta</th><th className="p-3">Costo</th><th className="p-3">Utilidad</th><th className="p-3">Pago</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.numero} className="border-t border-slate-100 dark:border-slate-700/60">
                <td className="p-3 font-semibold">{f.numero} {f.demo && <Badge color="gold">DEMO</Badge>}</td>
                <td className="p-3 tabular-nums">{money2(f.venta)}</td>
                <td className="p-3 tabular-nums">{money2(f.costo)}</td>
                <td className={`p-3 font-bold tabular-nums ${f.utilidad >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{money2(f.utilidad)}</td>
                <td className="p-3">{f.pago}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Sin pedidos todavía.</div>}
      </Card>
    </div>
  )
}

// ── TICKETS DE SOPORTE ─────────────────────────────────────────────────────
export function EcomTickets({ ctx }) {
  const { auditar, user } = ctx
  const [tickets, setTickets] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [form, setForm] = useState(null)
  const recargar = async () => { setTickets(await cargar('ecom_tickets')); setPedidos(await cargar('ecom_orders')) }
  useEffect(() => { recargar() }, [])
  const crear = async () => {
    if (!form.asunto.trim()) return
    await addDoc(collection(db, 'ecom_tickets'), { ...form, estado: 'abierto', demo: true, creadoPor: user.email, creadoEn: serverTimestamp(), mensajes: [{ de: user.email, texto: form.detalle, fecha: new Date().toISOString() }] })
    auditar('ticket_creado', form.asunto)
    setForm(null); await recargar()
  }
  const cerrar = async (t) => {
    await updateDoc(doc(db, 'ecom_tickets', t.id), { estado: 'cerrado' })
    auditar('ticket_cerrado', t.asunto)
    await recargar()
  }
  if (!tickets) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setForm({ asunto: '', detalle: '', orderId: '', tipo: 'incidencia' })}><Plus size={15} /> Nuevo ticket</Boton>}>Soporte</PageTitle>
      {tickets.length === 0 ? <EstadoVacio titulo="Sin tickets" texto="Los tickets van vinculados a un pedido: incidencias, devoluciones, daños, cambios." /> : (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{t.asunto}</b>
                <Badge color="slate">{t.tipo}</Badge>
                <Badge color={t.estado === 'abierto' ? 'red' : 'green'}>{t.estado}</Badge>
                {t.orderId && <Badge color="slate">{pedidos.find((p) => p.id === t.orderId)?.numero || 'pedido'}</Badge>}
                {t.estado === 'abierto' && <Boton variant="ghost" className="ml-auto" onClick={() => cerrar(t)}>Cerrar</Boton>}
              </div>
              <div className="mt-1 text-xs text-slate-500">{(t.mensajes || [])[0]?.texto}</div>
            </Card>
          ))}
        </div>
      )}
      {form && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-brand-navy dark:text-slate-100">Nuevo ticket</div>
            <div className="space-y-2.5 text-sm">
              <label>Asunto<Input value={form.asunto} onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))} /></label>
              <label>Tipo
                <Select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  {['incidencia', 'devolucion', 'producto_incorrecto', 'dano', 'perdida', 'compra_fallida', 'consulta'].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </label>
              <label>Pedido (opcional)
                <Select value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}>
                  <option value="">—</option>
                  {pedidos.map((p) => <option key={p.id} value={p.id}>{p.numero}</option>)}
                </Select>
              </label>
              <label>Detalle<Input value={form.detalle} onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={crear}>Crear</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
