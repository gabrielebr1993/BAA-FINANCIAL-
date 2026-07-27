import { useState } from 'react'
import { Plus, Building2, MapPin, Trash2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar } from '../data/repo'
import { where } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Cargando, EstadoVacio, Badge } from '../../components/ui'
import { money } from '../../utils/format'

function Plantas({ cliente }) {
  const { tenantId } = useBulkAuth()
  const { datos: plantas } = useColeccion('plants', [where('clienteId', '==', cliente.id)])
  const { datos: materiales } = useColeccion('materials')
  const [f, setF] = useState({ nombre: '', direccion: '', lat: '', lng: '', horario: '', ofertas: [] })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const tieneMat = (m) => f.ofertas.some((o) => o.material === m)
  const toggleMat = (m) => setF((s) => tieneMat(m)
    ? ({ ...s, ofertas: s.ofertas.filter((o) => o.material !== m) })
    : ({ ...s, ofertas: [...s.ofertas, { material: m, precio: '', po: '' }] }))
  const setOferta = (m, k, v) => setF((s) => ({ ...s, ofertas: s.ofertas.map((o) => (o.material === m ? { ...o, [k]: v } : o)) }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    const ofertas = f.ofertas.map((o) => ({ material: o.material, precio: Number(o.precio) || 0, po: (o.po || '').trim() }))
    await crear('plants', tenantId, {
      clienteId: cliente.id, nombre: f.nombre.trim(), direccion: f.direccion.trim(),
      gps: (f.lat && f.lng) ? { lat: Number(f.lat), lng: Number(f.lng) } : null,
      horario: f.horario.trim(), ofertas, materiales: ofertas.map((o) => o.material), activo: true,
    })
    setF({ nombre: '', direccion: '', lat: '', lng: '', horario: '', ofertas: [] })
  }
  const matsActivos = materiales.filter((m) => m.activo !== false)

  return (
    <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Plantas de {cliente.nombre}</div>
      {plantas.map((p) => (
        <div key={p.id} className="mb-1.5 rounded-lg border border-slate-100 p-2 dark:border-slate-700/50">
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={14} className="text-amber-500" />
            <span className="font-medium">{p.nombre}</span>
            <span className="text-slate-400">{p.direccion}{p.gps ? ` · ${p.gps.lat}, ${p.gps.lng}` : ''}</span>
            <button onClick={() => eliminar('plants', p.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>
          </div>
          {((p.ofertas && p.ofertas.length) || (p.materiales || []).length) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(p.ofertas && p.ofertas.length ? p.ofertas : (p.materiales || []).map((m) => ({ material: m }))).map((o) => (
                <Badge key={o.material} color="green">{o.material}{o.precio ? ` · ${money(o.precio)}` : ''}{o.po ? ` · PO ${o.po}` : ''}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nombre de la planta" value={f.nombre} onChange={set('nombre')} />
        <Input placeholder="Dirección" value={f.direccion} onChange={set('direccion')} />
        <Input placeholder="Lat (GPS)" value={f.lat} onChange={set('lat')} />
        <Input placeholder="Lng (GPS)" value={f.lng} onChange={set('lng')} />
        <Input placeholder="Horario (ej. 6am–4pm)" value={f.horario} onChange={set('horario')} />
      </div>
      {matsActivos.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Materiales que ofrece esta planta (precio y PO por material)</div>
          <div className="flex flex-wrap gap-1.5">
            {matsActivos.map((m) => (
              <button key={m.id} type="button" onClick={() => toggleMat(m.nombre)} className={`rounded-lg border px-2.5 py-1 text-xs ${tieneMat(m.nombre) ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{m.nombre}</button>
            ))}
          </div>
          {f.ofertas.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {f.ofertas.map((o) => (
                <div key={o.material} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="w-28 font-medium text-brand-navy dark:text-slate-100">{o.material}</span>
                  <Input type="number" step="0.01" placeholder="Precio" value={o.precio} onChange={(e) => setOferta(o.material, 'precio', e.target.value)} className="w-24 py-1" />
                  <Input placeholder="PO" value={o.po} onChange={(e) => setOferta(o.material, 'po', e.target.value)} className="w-28 py-1" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-2"><Boton variant="ghost" onClick={agregar} disabled={!f.nombre.trim()} className="text-xs"><Plus size={14} /> Agregar planta</Boton></div>
    </div>
  )
}

export default function Clientes() {
  const { tenantId } = useBulkAuth()
  const { datos: clientes, cargando } = useColeccion('clients')
  const [f, setF] = useState({ nombre: '', rfc: '', contacto: '', facturacion: '' })
  const [abierto, setAbierto] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    await crear('clients', tenantId, { nombre: f.nombre.trim(), rfc: f.rfc.trim(), contacto: f.contacto.trim(), facturacion: f.facturacion.trim(), activo: true })
    setF({ nombre: '', rfc: '', contacto: '', facturacion: '' })
  }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>Clientes y Plantas</PageTitle>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nuevo cliente</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Nombre" value={f.nombre} onChange={set('nombre')} />
          <Input placeholder="RFC / Tax ID" value={f.rfc} onChange={set('rfc')} />
          <Input placeholder="Contacto" value={f.contacto} onChange={set('contacto')} />
          <Input placeholder="Datos de facturación" value={f.facturacion} onChange={set('facturacion')} />
        </div>
        <div className="mt-3"><Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim()}><Plus size={16} /> Agregar cliente</Boton></div>
      </Card>

      {clientes.length === 0 ? <EstadoVacio titulo="Sin clientes" texto="Agrega el primero arriba." mostrarBoton={false} /> : (
        <div className="space-y-3">
          {clientes.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-2">
                <Building2 size={17} className="text-amber-500" />
                <span className="font-bold text-brand-navy dark:text-slate-100">{c.nombre}</span>
                {c.rfc && <Badge color="slate">{c.rfc}</Badge>}
                <button onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="ml-auto text-xs text-amber-600 hover:underline">{abierto === c.id ? 'Ocultar plantas' : 'Ver / agregar plantas'}</button>
                <button onClick={() => window.confirm(`¿Eliminar cliente "${c.nombre}"?`) && eliminar('clients', c.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
              {(c.contacto || c.facturacion) && <div className="mt-1 text-xs text-slate-400">{c.contacto}{c.facturacion ? ` · ${c.facturacion}` : ''}</div>}
              {abierto === c.id && <Plantas cliente={c} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
