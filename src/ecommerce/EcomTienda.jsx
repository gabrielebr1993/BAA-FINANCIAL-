// ============================================================================
// ECOMMERCE · Tienda — VISTA PREVIA del cliente (solo visible para el dueño).
//
// Es exactamente la experiencia que verá el cliente cuando se publique:
// catálogo, buscador, filtros, ficha con variantes, carrito y checkout.
// El carrito vive en localStorage (sobrevive registro/inicio de sesión).
// El checkout crea un PEDIDO DEMO (demo:true, sin cobro) para probar el
// recorrido completo: validación → pedido → compra → logística → entrega.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { calcularPrecio, money2, leerCarrito, guardarCarrito, ESTADOS_ENVIO } from './datos'
import { cargarProductos } from './EcomCatalogo'
import { Card, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../components/ui'
import { ShoppingCart, Search, X, Trash2, ChevronLeft } from 'lucide-react'

export default function EcomTienda({ ctx }) {
  const { config, user, auditar } = ctx
  const [productos, setProductos] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [pais, setPais] = useState((config.paises || []).find((p) => p.activo)?.codigo || 'VE')
  const [ficha, setFicha] = useState(null)        // producto abierto
  const [carrito, setCarrito] = useState(leerCarrito)
  const [verCarrito, setVerCarrito] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [pedidoListo, setPedidoListo] = useState(null)
  useEffect(() => { cargarProductos().then(setProductos) }, [])
  useEffect(() => { guardarCarrito(carrito) }, [carrito])

  const visibles = useMemo(() => {
    if (!productos) return []
    const f = busqueda.trim().toLowerCase()
    return productos.filter((p) =>
      p.activo !== false &&
      (p.paises || []).includes(pais) &&
      (!categoria || p.categoria === categoria) &&
      (!f || `${p.nombre} ${p.descripcion} ${p.categoria}`.toLowerCase().includes(f))
    )
  }, [productos, busqueda, categoria, pais])

  const agregar = (p, variante) => {
    const precio = calcularPrecio(p, config, pais)
    setCarrito((c) => {
      const clave = `${p.id}::${variante || ''}`
      const existe = c.find((i) => i.clave === clave)
      if (existe) return c.map((i) => (i.clave === clave ? { ...i, cant: i.cant + 1 } : i))
      return [...c, { clave, productoId: p.id, nombre: p.nombre, emoji: p.emoji, imagenUrl: p.imagenUrl || '', variante: variante || '', precioUSD: precio.precioUSD, cant: 1, pais, demo: !!p.demo, proveedor: p.proveedor, refProveedor: p.refProveedor || '' }]
    })
    setFicha(null); setVerCarrito(true)
  }
  const totalUSD = carrito.reduce((a, i) => a + i.precioUSD * i.cant, 0)

  if (!productos) return <div className="py-16 text-center"><Spinner /></div>

  if (pedidoListo) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="text-4xl">🎉</div>
        <div className="mt-2 text-xl font-black text-brand-navy dark:text-slate-100">¡Pedido de prueba creado!</div>
        <p className="mt-2 text-sm text-slate-500">Número: <b>{pedidoListo}</b>. Es un pedido <b>DEMO</b> — sin cobro, sin compra al proveedor. Síguelo en la pestaña <b>Pedidos</b>: ahí puedes avanzarlo por los 9 pasos logísticos hasta la entrega.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Boton variant="gold" onClick={() => setPedidoListo(null)}>Seguir comprando (demo)</Boton>
        </div>
      </Card>
    )
  }

  return (
    <div>
      {/* Barra de la tienda */}
      <Aviso tipo="warn" className="mb-4"><b>VISTA PREVIA · solo tú la ves.</b> Así se verá la tienda pública. Los pagos están en modo DEMO: nada se cobra ni se compra.</Aviso>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="¿Qué estás buscando?" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-44">
          <option value="">Todas las categorías</option>
          {(config.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={pais} onChange={(e) => setPais(e.target.value)} className="w-44">
          {(config.paises || []).filter((p) => p.activo).map((p) => <option key={p.codigo} value={p.codigo}>Entregar en {p.nombre}</option>)}
        </Select>
        <button onClick={() => setVerCarrito(true)} className="relative ml-auto inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-bold text-white">
          <ShoppingCart size={16} /> Carrito
          {carrito.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-gold px-1 text-[11px] font-black text-brand-navy">{carrito.reduce((a, i) => a + i.cant, 0)}</span>}
        </button>
      </div>

      {/* Catálogo */}
      {visibles.length === 0 ? <EstadoVacio titulo="Sin resultados" texto="Prueba otra búsqueda, categoría o país. Si el catálogo está vacío, siembra la demo en la pestaña Catálogo." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibles.map((p) => {
            const precio = calcularPrecio(p, config, pais)
            return (
              <Card key={p.id} className="flex cursor-pointer flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-cardhover" onClick={() => setFicha(p)}>
                <div className="grid h-28 place-items-center rounded-xl bg-slate-100 text-5xl dark:bg-slate-700/60">
                  {p.imagenUrl ? <img src={p.imagenUrl} alt="" className="h-full w-full rounded-xl object-cover" /> : (p.emoji || '📦')}
                </div>
                <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{p.categoria}{p.demo ? ' · DEMO' : ''}</div>
                <div className="font-bold leading-snug text-brand-navy dark:text-slate-100">{p.nombre}</div>
                <div className="mt-auto pt-2">
                  <div className="text-lg font-black text-emerald-600">{money2(precio.precioUSD)}</div>
                  <div className="text-[11px] text-slate-400">impuestos y entrega incluidos · {precio.moneda !== 'USD' ? `≈ ${money2(precio.precioLocal, precio.moneda)} · ` : ''}15–25 días</div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Ficha de producto */}
      {ficha && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setFicha(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <FichaProducto p={ficha} config={config} pais={pais} onAgregar={agregar} onCerrar={() => setFicha(null)} />
          </div>
        </div>
      )}

      {/* Carrito lateral */}
      {verCarrito && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={() => setVerCarrito(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-black text-brand-navy dark:text-slate-100">Tu carrito</div>
              <button onClick={() => setVerCarrito(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {carrito.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Vacío. Agrega productos del catálogo.</div>}
              {carrito.map((i) => (
                <div key={i.clave} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 dark:border-slate-700/60">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl dark:bg-slate-700/60">{i.imagenUrl ? <img src={i.imagenUrl} alt="" className="h-full w-full rounded-lg object-cover" /> : i.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{i.nombre}</div>
                    <div className="text-xs text-slate-500">{i.variante || 'Única'} · {money2(i.precioUSD)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="h-7 w-7 rounded-lg border border-slate-200 text-sm dark:border-slate-600" onClick={() => setCarrito((c) => c.map((x) => x.clave === i.clave ? { ...x, cant: Math.max(1, x.cant - 1) } : x))}>−</button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">{i.cant}</span>
                    <button className="h-7 w-7 rounded-lg border border-slate-200 text-sm dark:border-slate-600" onClick={() => setCarrito((c) => c.map((x) => x.clave === i.clave ? { ...x, cant: x.cant + 1 } : x))}>+</button>
                  </div>
                  <button onClick={() => setCarrito((c) => c.filter((x) => x.clave !== i.clave))} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3 dark:border-slate-700/60">
              <div className="mb-3 flex items-center justify-between text-sm"><span className="text-slate-500">Total ({pais} · todo incluido)</span><b className="text-lg text-brand-navy dark:text-slate-100">{money2(totalUSD)}</b></div>
              <Boton variant="gold" className="w-full" disabled={carrito.length === 0} onClick={() => { setVerCarrito(false); setCheckout(true) }}>Finalizar compra (DEMO)</Boton>
              <p className="mt-2 text-center text-[11px] text-slate-400">En la tienda pública: aquí se pediría crear cuenta o iniciar sesión; el carrito se conserva.</p>
            </div>
          </div>
        </div>
      )}

      {/* Checkout */}
      {checkout && (
        <CheckoutDemo carrito={carrito} totalUSD={totalUSD} pais={pais} config={config} user={user}
          onCerrar={() => setCheckout(false)}
          onListo={async (numero) => { setCarrito([]); setCheckout(false); setPedidoListo(numero); auditar('pedido_demo_creado', numero) }} />
      )}
    </div>
  )
}

function FichaProducto({ p, config, pais, onAgregar, onCerrar }) {
  const [variante, setVariante] = useState((p.variantes || [])[0] || '')
  const precio = calcularPrecio(p, config, pais)
  return (
    <div>
      <button onClick={onCerrar} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"><ChevronLeft size={14} /> Volver al catálogo</button>
      <div className="grid h-44 place-items-center rounded-2xl bg-slate-100 text-7xl dark:bg-slate-700/60">
        {p.imagenUrl ? <img src={p.imagenUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : (p.emoji || '📦')}
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{p.categoria}{p.demo ? ' · PRODUCTO DEMO' : ''}</div>
      <h3 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{p.nombre}</h3>
      <p className="mt-1 text-sm text-slate-500">{p.descripcion}</p>
      {(p.variantes || []).length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-500">Opción:</div>
          <div className="flex flex-wrap gap-2">
            {p.variantes.map((v) => (
              <button key={v} onClick={() => setVariante(v)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${variante === v ? 'border-brand-gold bg-brand-gold/15 text-brand-navy dark:text-brand-gold' : 'border-slate-300 text-slate-500 dark:border-slate-600'}`}>{v}</button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-700/40">
        <div className="text-2xl font-black text-emerald-600">{money2(precio.precioUSD)} <span className="text-sm font-semibold text-slate-400">{precio.moneda !== 'USD' ? `≈ ${money2(precio.precioLocal, precio.moneda)}` : ''}</span></div>
        <div className="mt-1 text-xs text-slate-500">✓ Incluye compra al proveedor, transporte internacional, impuestos de importación y entrega en tu puerta. Entrega estimada: <b>15–25 días</b>. Sin trámites para ti.</div>
      </div>
      <Boton variant="gold" className="mt-4 w-full" onClick={() => onAgregar(p, variante)}><ShoppingCart size={15} /> Agregar al carrito</Boton>
    </div>
  )
}

// ── Checkout DEMO: valida, pide dirección y crea el pedido (sin cobrar) ────
function CheckoutDemo({ carrito, totalUSD, pais, config, user, onCerrar, onListo }) {
  const [form, setForm] = useState({ nombre: '', telefono: '', linea1: '', ciudad: '', zona: '', referencia: '' })
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const set = (c, v) => setForm((f) => ({ ...f, [c]: v }))
  const crear = async () => {
    if (!form.nombre.trim() || !form.linea1.trim() || !form.ciudad.trim()) return setError('Completa nombre, dirección y ciudad.')
    setCreando(true); setError('')
    try {
      const numero = 'EC-' + Date.now().toString(36).toUpperCase()
      await addDoc(collection(db, 'ecom_orders'), {
        demo: true, numero,
        cliente: { nombre: form.nombre, correo: user.email, telefono: form.telefono },
        pais, direccion: { linea1: form.linea1, ciudad: form.ciudad, zona: form.zona, referencia: form.referencia },
        items: carrito.map(({ clave, ...i }) => i),
        totalUSD: Math.round(totalUSD * 100) / 100,
        estadoPedido: 'nuevo', estadoPago: 'demo_sin_cobro', estadoCompra: 'pendiente',
        estadoEnvio: ESTADOS_ENVIO[0].id,
        timeline: [{ estado: ESTADOS_ENVIO[0].id, fecha: new Date().toISOString(), nota: 'Pedido DEMO creado desde la vista previa' }],
        paquetes: [], creadoEn: serverTimestamp(),
      })
      onListo(numero)
    } catch (e) {
      setError('No se pudo crear el pedido: ' + e.message)
    } finally { setCreando(false) }
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-lg font-black text-brand-navy dark:text-slate-100">Finalizar compra</div>
        <Badge color="gold">DEMO · no se cobra nada</Badge>
        <div className="mt-4 space-y-2.5">
          <Input placeholder="Nombre completo" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          <Input placeholder="Teléfono (WhatsApp)" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
          <Input placeholder="Dirección (calle, edificio, nro.)" value={form.linea1} onChange={(e) => set('linea1', e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <Input placeholder="Ciudad" value={form.ciudad} onChange={(e) => set('ciudad', e.target.value)} />
            <Input placeholder="Zona / municipio" value={form.zona} onChange={(e) => set('zona', e.target.value)} />
          </div>
          <Input placeholder="Punto de referencia (opcional)" value={form.referencia} onChange={(e) => set('referencia', e.target.value)} />
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-700/40">
          <div className="flex justify-between"><span>{carrito.reduce((a, i) => a + i.cant, 0)} artículo(s)</span><b>{money2(totalUSD)}</b></div>
          <div className="mt-1 text-xs text-slate-500">Pago: <b>DEMO (sin cobro)</b>. En producción: el pago se AUTORIZA aquí y solo se CAPTURA cuando confirmemos disponibilidad y costo con el proveedor; si algo cambia, te pedimos aceptar antes de continuar.</div>
        </div>
        {error && <Aviso tipo="error" className="mt-3">{error}</Aviso>}
        <div className="mt-4 flex justify-end gap-2">
          <Boton variant="ghost" onClick={onCerrar}>Volver</Boton>
          <Boton variant="gold" onClick={crear} disabled={creando}>{creando ? <Spinner /> : 'Crear pedido de prueba'}</Boton>
        </div>
      </div>
    </div>
  )
}
