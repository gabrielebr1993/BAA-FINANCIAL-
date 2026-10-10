// ============================================================================
// ECOMMERCE · Catálogo (productos con proveedor/origen) y panel de Precios.
//
// Cada producto guarda internamente: proveedor, referencia original y fecha de
// actualización. Lo comercial (nombre, fotos, variantes, países, activo) es lo
// único que verá el cliente; los costos y márgenes JAMÁS salen del panel.
// Los productos sembrados desde la demo llevan demo:true bien visible.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { PROVEEDORES, PRODUCTOS_DEMO, calcularPrecio, money2 } from './datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../components/ui'
import { Plus, Trash2, Pencil, Sparkles, X } from 'lucide-react'

export async function cargarProductos() {
  const snap = await getDocs(query(collection(db, 'ecom_products'), orderBy('nombre')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const PRODUCTO_VACIO = {
  nombre: '', categoria: '', proveedor: 'aliexpress', refProveedor: '', urlOrigen: '',
  descripcion: '', emoji: '📦', imagenUrl: '', variantes: [], paises: [], tipo: 'bajo_pedido',
  costoProveedor: '', fleteOrigen: '', pesoKg: '', largoCm: '', anchoCm: '', altoCm: '',
  margenPct: '', moq: '', activo: true, demo: false,
}

export default function EcomCatalogo({ ctx }) {
  const { config, auditar } = ctx
  const [productos, setProductos] = useState(null)
  const [editando, setEditando] = useState(null) // objeto producto en el formulario
  const [guardando, setGuardando] = useState(false)
  const [sembrando, setSembrando] = useState(false)
  const [filtro, setFiltro] = useState('')
  const recargar = async () => setProductos(await cargarProductos())
  useEffect(() => { recargar() }, [])

  const sembrarDemo = async () => {
    if (!window.confirm('¿Crear los 10 productos de DEMOSTRACIÓN? Quedan marcados como DEMO y puedes borrarlos cuando quieras.')) return
    setSembrando(true)
    try {
      for (const p of PRODUCTOS_DEMO) {
        await addDoc(collection(db, 'ecom_products'), {
          ...PRODUCTO_VACIO, ...p, demo: true, activo: true,
          creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
        })
      }
      auditar('catalogo_demo', `${PRODUCTOS_DEMO.length} productos de demostración sembrados`)
      await recargar()
    } finally { setSembrando(false) }
  }

  const guardar = async () => {
    if (!editando.nombre.trim()) return window.alert('Ponle nombre al producto.')
    setGuardando(true)
    try {
      const payload = { ...editando, actualizadoEn: serverTimestamp() }
      delete payload.id
      if (editando.id) {
        await updateDoc(doc(db, 'ecom_products', editando.id), payload)
        auditar('producto_editado', editando.nombre)
      } else {
        await addDoc(collection(db, 'ecom_products'), { ...payload, creadoEn: serverTimestamp() })
        auditar('producto_creado', editando.nombre)
      }
      setEditando(null)
      await recargar()
    } finally { setGuardando(false) }
  }
  const borrar = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}"?`)) return
    await deleteDoc(doc(db, 'ecom_products', p.id))
    auditar('producto_borrado', p.nombre)
    await recargar()
  }
  const alternarActivo = async (p) => {
    await updateDoc(doc(db, 'ecom_products', p.id), { activo: !p.activo, actualizadoEn: serverTimestamp() })
    await recargar()
  }

  const visibles = useMemo(() => {
    if (!productos) return []
    const f = filtro.trim().toLowerCase()
    return f ? productos.filter((p) => `${p.nombre} ${p.categoria} ${p.refProveedor}`.toLowerCase().includes(f)) : productos
  }, [productos, filtro])

  if (!productos) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={
        <>
          <Boton variant="ghost" onClick={sembrarDemo} disabled={sembrando}>{sembrando ? <Spinner /> : <Sparkles size={15} />} Sembrar datos demo</Boton>
          <Boton variant="gold" onClick={() => setEditando({ ...PRODUCTO_VACIO })}><Plus size={15} /> Nuevo producto</Boton>
        </>
      }>Catálogo</PageTitle>
      {productos.length === 0 && (
        <Aviso tipo="info" className="mb-4">El catálogo está vacío. Usa <b>Sembrar datos demo</b> para crear 10 productos de ejemplo (marcados DEMO) o crea el primero a mano.</Aviso>
      )}
      <div className="mb-3"><Input placeholder="Buscar por nombre, categoría o referencia…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" /></div>

      {visibles.length === 0 ? <EstadoVacio titulo="Sin productos" texto="Crea un producto o siembra la demo." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((p) => {
            const precio = calcularPrecio(p, config, (p.paises || [])[0] || 'VE')
            const prov = PROVEEDORES.find((x) => x.id === p.proveedor)
            return (
              <Card key={p.id} className={`p-4 ${!p.activo ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-3xl dark:bg-slate-700/60">
                    {p.imagenUrl ? <img src={p.imagenUrl} alt="" className="h-full w-full object-cover" /> : (p.emoji || '📦')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-brand-navy dark:text-slate-100">{p.nombre}</span>
                      {p.demo && <Badge color="gold">DEMO</Badge>}
                      {!p.activo && <Badge color="slate">Inactivo</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{p.categoria} · {prov?.nombre || p.proveedor} · ref {p.refProveedor || '—'}</div>
                    <div className="mt-1 text-xs text-slate-500">Países: {(p.paises || []).join(', ') || '—'} · {p.tipo === 'inventario' ? 'Inventario propio' : 'Bajo pedido'}{p.moq ? ` · MOQ ${p.moq}` : ''}</div>
                    <div className="mt-1.5 text-sm"><b className="text-emerald-600">{money2(precio.precioUSD)}</b> <span className="text-xs text-slate-400">venta {precio.pais} · costo {money2(Number(p.costoProveedor) || 0)}</span>{precio.alertaMargen && <Badge color="red">margen bajo</Badge>}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700/60">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={!!p.activo} onChange={() => alternarActivo(p)} /> Visible en tienda</label>
                  <span className="ml-auto" />
                  <button onClick={() => setEditando({ ...PRODUCTO_VACIO, ...p })} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><Pencil size={14} /></button>
                  <button onClick={() => borrar(p)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editando && (
        <FormProducto producto={editando} setProducto={setEditando} config={config}
          onGuardar={guardar} onCerrar={() => setEditando(null)} guardando={guardando} />
      )}
    </div>
  )
}

// ── Formulario de producto (modal) ─────────────────────────────────────────
function FormProducto({ producto, setProducto, config, onGuardar, onCerrar, guardando }) {
  const set = (campo, v) => setProducto((p) => ({ ...p, [campo]: v }))
  const paisesActivos = (config.paises || []).filter((p) => p.activo)
  const precio = calcularPrecio(producto, config, (producto.paises || [])[0] || paisesActivos[0]?.codigo || 'VE')
  const togglePais = (codigo) => set('paises', (producto.paises || []).includes(codigo)
    ? producto.paises.filter((c) => c !== codigo)
    : [...(producto.paises || []), codigo])
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{producto.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button onClick={onCerrar} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Nombre<Input value={producto.nombre} onChange={(e) => set('nombre', e.target.value)} /></label>
          <label className="text-sm">Categoría
            <Select value={producto.categoria} onChange={(e) => set('categoria', e.target.value)}>
              <option value="">—</option>
              {(config.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
          <label className="text-sm">Proveedor
            <Select value={producto.proveedor} onChange={(e) => set('proveedor', e.target.value)}>
              {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </label>
          <label className="text-sm">Referencia del proveedor<Input value={producto.refProveedor} onChange={(e) => set('refProveedor', e.target.value)} placeholder="SKU / item id original" /></label>
          <label className="text-sm">Enlace de origen<Input value={producto.urlOrigen} onChange={(e) => set('urlOrigen', e.target.value)} placeholder="https://… (para compra asistida)" /></label>
          <label className="text-sm sm:col-span-2">Descripción<Input value={producto.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></label>
          <label className="text-sm">Imagen (URL)<Input value={producto.imagenUrl} onChange={(e) => set('imagenUrl', e.target.value)} placeholder="https://… (opcional)" /></label>
          <label className="text-sm">Emoji si no hay imagen<Input value={producto.emoji} onChange={(e) => set('emoji', e.target.value)} className="w-20" /></label>
          <label className="text-sm sm:col-span-2">Variantes (separadas por coma)<Input value={(producto.variantes || []).join(', ')} onChange={(e) => set('variantes', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} placeholder="Negro, Blanco, 42…" /></label>
          <div className="text-sm sm:col-span-2">
            <div className="mb-1">Disponible en países</div>
            <div className="flex flex-wrap gap-2">
              {paisesActivos.map((p) => (
                <label key={p.codigo} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${(producto.paises || []).includes(p.codigo) ? 'border-brand-gold bg-brand-gold/15 text-brand-navy dark:text-brand-gold' : 'border-slate-300 text-slate-500 dark:border-slate-600'}`}>
                  <input type="checkbox" className="hidden" checked={(producto.paises || []).includes(p.codigo)} onChange={() => togglePais(p.codigo)} />{p.nombre}
                </label>
              ))}
            </div>
          </div>
          <label className="text-sm">Tipo
            <Select value={producto.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="bajo_pedido">Bajo pedido (se compra al proveedor)</option>
              <option value="inventario">Inventario propio</option>
            </Select>
          </label>
          <label className="text-sm">MOQ (mínimo del proveedor)<Input type="number" value={producto.moq} onChange={(e) => set('moq', e.target.value)} placeholder="solo Alibaba" /></label>
          <label className="text-sm">Costo del proveedor (USD)<Input type="number" step="0.01" value={producto.costoProveedor} onChange={(e) => set('costoProveedor', e.target.value)} /></label>
          <label className="text-sm">Flete a hub de origen (USD)<Input type="number" step="0.01" value={producto.fleteOrigen} onChange={(e) => set('fleteOrigen', e.target.value)} /></label>
          <label className="text-sm">Peso (kg)<Input type="number" step="0.01" value={producto.pesoKg} onChange={(e) => set('pesoKg', e.target.value)} /></label>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label>Largo cm<Input type="number" value={producto.largoCm} onChange={(e) => set('largoCm', e.target.value)} /></label>
            <label>Ancho cm<Input type="number" value={producto.anchoCm} onChange={(e) => set('anchoCm', e.target.value)} /></label>
            <label>Alto cm<Input type="number" value={producto.altoCm} onChange={(e) => set('altoCm', e.target.value)} /></label>
          </div>
          <label className="text-sm">Margen propio (%) — vacío = regla general<Input type="number" step="1" value={producto.margenPct === '' || producto.margenPct == null ? '' : Math.round(Number(producto.margenPct) * 100)} onChange={(e) => set('margenPct', e.target.value === '' ? '' : Number(e.target.value) / 100)} /></label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-700/40">
          <b>Vista previa del precio ({precio.pais}):</b> <span className="font-black text-emerald-600">{money2(precio.precioUSD)}</span>
          <span className="ml-2 text-xs text-slate-500">producto {money2(precio.desglose.producto)} + flete {money2(precio.desglose.fleteOrigen)} + manejo {money2(precio.desglose.manejoOrigen)} + intl {money2(precio.desglose.internacional)} + aduana {money2(precio.desglose.aduana)} + entrega {money2(precio.desglose.entregaLocal)} + comisión {money2(precio.desglose.comisionPago)} + margen {money2(precio.desglose.margen)} ({Math.round(precio.margenPct * 100)}%)</span>
          {precio.alertaMargen && <div className="mt-1 text-xs font-bold text-rose-500">⚠ Margen por debajo del mínimo configurado.</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variant="ghost" onClick={onCerrar}>Cancelar</Boton>
          <Boton variant="gold" onClick={onGuardar} disabled={guardando}>{guardando ? <Spinner /> : 'Guardar producto'}</Boton>
        </div>
      </div>
    </div>
  )
}

// ── Panel de PRECIOS: todos los productos × países, con desglose ───────────
export function EcomPrecios({ ctx }) {
  const { config } = ctx
  const [productos, setProductos] = useState(null)
  useEffect(() => { cargarProductos().then(setProductos) }, [])
  const paisesActivos = (config.paises || []).filter((p) => p.activo)
  const [pais, setPais] = useState('')
  const codigo = pais || paisesActivos[0]?.codigo || 'VE'
  if (!productos) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={
        <Select value={codigo} onChange={(e) => setPais(e.target.value)} className="w-44">
          {paisesActivos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </Select>
      }>Precios por país</PageTitle>
      <Aviso tipo="info" className="mb-4">Este desglose es <b>interno</b>: el cliente solo ve el precio final y el texto comercial de qué incluye. Cambia márgenes y reglas en Configuración, o el margen propio de cada producto en el Catálogo.</Aviso>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
            {['Producto', 'Costo', 'Flete origen', 'Manejo', 'Internacional', 'Aduana', 'Entrega', 'Comisión', 'Margen', 'Precio venta', 'Moneda local'].map((h) => <th key={h} className="p-3">{h}</th>)}
          </tr></thead>
          <tbody>
            {productos.filter((p) => (p.paises || []).includes(codigo)).map((p) => {
              const x = calcularPrecio(p, config, codigo)
              return (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700/60">
                  <td className="p-3 font-semibold">{p.emoji} {p.nombre} {p.demo && <Badge color="gold">DEMO</Badge>}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.producto)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.fleteOrigen)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.manejoOrigen)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.internacional)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.aduana)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.entregaLocal)}</td>
                  <td className="p-3 tabular-nums">{money2(x.desglose.comisionPago)}</td>
                  <td className={`p-3 tabular-nums ${x.alertaMargen ? 'font-bold text-rose-500' : ''}`}>{money2(x.desglose.margen)} ({Math.round(x.margenPct * 100)}%)</td>
                  <td className="p-3 font-black tabular-nums text-emerald-600">{money2(x.precioUSD)}</td>
                  <td className="p-3 tabular-nums text-slate-500">{money2(x.precioLocal, x.moneda)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {productos.filter((p) => (p.paises || []).includes(codigo)).length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">No hay productos disponibles para este país.</div>
        )}
      </Card>
    </div>
  )
}
