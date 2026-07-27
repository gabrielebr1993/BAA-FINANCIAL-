import { useState } from 'react'
import { Plus, Trash2, MapPin } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio } from '../../components/ui'

const TIPOS = [
  { v: 'planta', l: 'Planta' }, { v: 'destino', l: 'Destino' },
  { v: 'patio', l: 'Patio' }, { v: 'proyecto', l: 'Proyecto' },
]

export default function Geocercas() {
  const { tenantId } = useBulkAuth()
  const { datos: geocercas, cargando } = useColeccion('geofences')
  const { datos: plantas } = useColeccion('plants')
  const [f, setF] = useState({ nombre: '', tipo: 'destino', lat: '', lng: '', radio: '200' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.nombre.trim() || !f.lat || !f.lng) return
    await crear('geofences', tenantId, { nombre: f.nombre.trim(), tipo: f.tipo, lat: Number(f.lat), lng: Number(f.lng), radio: Number(f.radio) || 200 })
    setF({ nombre: '', tipo: 'destino', lat: '', lng: '', radio: '200' })
  }
  const desdePlanta = async (p) => {
    if (!p.gps) return
    await crear('geofences', tenantId, { nombre: p.nombre, tipo: 'planta', lat: p.gps.lat, lng: p.gps.lng, radio: 200, plantaId: p.id })
  }

  if (cargando) return <Cargando />
  const plantasSinGeocerca = plantas.filter((p) => p.gps && !geocercas.some((g) => g.plantaId === p.id))

  return (
    <div>
      <PageTitle>Geocercas</PageTitle>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nueva geocerca</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="Nombre" value={f.nombre} onChange={set('nombre')} />
          <Select value={f.tipo} onChange={set('tipo')}>{TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select>
          <Input placeholder="Lat" value={f.lat} onChange={set('lat')} />
          <Input placeholder="Lng" value={f.lng} onChange={set('lng')} />
          <Input placeholder="Radio (m)" value={f.radio} onChange={set('radio')} />
        </div>
        <div className="mt-3"><Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim() || !f.lat || !f.lng}><Plus size={16} /> Agregar</Boton></div>
        {plantasSinGeocerca.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Crear desde planta (usa su GPS)</div>
            <div className="flex flex-wrap gap-1.5">
              {plantasSinGeocerca.map((p) => <button key={p.id} onClick={() => desdePlanta(p)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">+ {p.nombre}</button>)}
            </div>
          </div>
        )}
      </Card>

      {geocercas.length === 0 ? <EstadoVacio titulo="Sin geocercas" texto="Crea la primera arriba o desde una planta con GPS." mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {geocercas.map((g) => (
            <Card key={g.id} className="p-3">
              <div className="flex items-center gap-2"><MapPin size={16} className="text-amber-500" /><span className="font-semibold text-brand-navy dark:text-slate-100">{g.nombre}</span><Badge color="navy">{g.tipo}</Badge><button onClick={() => window.confirm(`¿Eliminar geocerca "${g.nombre}"?`) && eliminar('geofences', g.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></div>
              <div className="mt-1 text-xs text-slate-400">{g.lat.toFixed(5)}, {g.lng.toFixed(5)} · radio {g.radio} m</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
