import { useState } from 'react'
import { Plus, Trash2, MapPin, MousePointerClick } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import MapaLeaflet from '../components/MapaLeaflet'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { useLang } from '../../i18n'

const TIPOS = [
  { v: 'planta', l: 'Planta' }, { v: 'destino', l: 'Destino' },
  { v: 'patio', l: 'Patio' }, { v: 'proyecto', l: 'Proyecto' },
]
const COLOR = { planta: '#c9a24b', destino: '#2563eb', patio: '#64748b', proyecto: '#10b981' }

export default function Geocercas() {
  const { t } = useLang()
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
  const elegirDelMapa = ({ lat, lng }) => setF((s) => ({ ...s, lat: lat.toFixed(6), lng: lng.toFixed(6) }))

  if (cargando) return <Cargando />
  const plantasSinGeocerca = plantas.filter((p) => p.gps && !geocercas.some((g) => g.plantaId === p.id))
  // Marcador de la geocerca que se está creando (para verla antes de guardar).
  // Solo si ambas coordenadas son números finitos (evita NaN → crash del mapa).
  const latN = Number(f.lat), lngN = Number(f.lng)
  const preview = Number.isFinite(latN) && Number.isFinite(lngN) && f.lat !== '' && f.lng !== ''
    ? [{ lat: latN, lng: lngN, label: f.nombre || t('Nueva geocerca'), color: COLOR[f.tipo] }] : []
  const coordTxt = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(5) : '—')

  return (
    <div>
      <PageTitle>{t('Geocercas')}</PageTitle>

      {/* Mapa con todas las geocercas + clic para marcar */}
      <Card className="mb-4 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <MousePointerClick size={14} className="text-amber-500" /> {t('Toca el mapa para marcar la ubicación de una nueva geocerca.')}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {TIPOS.map((ti) => <span key={ti.v} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[ti.v] }} /> {t(ti.l)}</span>)}
          </span>
        </div>
        <MapaLeaflet geocercas={geocercas} marcadores={preview} onPick={elegirDelMapa} alto="52vh" />
      </Card>

      {/* Formulario */}
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nueva geocerca')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
          <Select value={f.tipo} onChange={set('tipo')}>{TIPOS.map((ti) => <option key={ti.v} value={ti.v}>{t(ti.l)}</option>)}</Select>
          <Input placeholder={t('Lat (o toca el mapa)')} value={f.lat} onChange={set('lat')} />
          <Input placeholder={t('Lng (o toca el mapa)')} value={f.lng} onChange={set('lng')} />
          <Input placeholder={t('Radio (m)')} value={f.radio} onChange={set('radio')} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim() || !f.lat || !f.lng}><Plus size={16} /> {t('Agregar')}</Boton>
          {f.lat && f.lng && <span className="text-xs text-slate-400">{t('Marcado:')} {Number(f.lat).toFixed(4)}, {Number(f.lng).toFixed(4)}</span>}
        </div>
        {plantasSinGeocerca.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Crear desde planta (usa su GPS)')}</div>
            <div className="flex flex-wrap gap-1.5">
              {plantasSinGeocerca.map((p) => <button key={p.id} onClick={() => desdePlanta(p)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">+ {p.nombre}</button>)}
            </div>
          </div>
        )}
      </Card>

      {geocercas.length === 0 ? <EstadoVacio titulo={t('Sin geocercas')} texto={t('Toca el mapa de arriba para marcar la primera, o créala desde una planta con GPS.')} mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {geocercas.map((g) => (
            <Card key={g.id} className="p-3">
              <div className="flex items-center gap-2"><MapPin size={16} style={{ color: COLOR[g.tipo] || '#c9a24b' }} /><span className="font-semibold text-brand-navy dark:text-slate-100">{g.nombre}</span><Badge color="navy">{g.tipo}</Badge><button onClick={() => window.confirm(`${t('¿Eliminar geocerca')} "${g.nombre}"?`) && eliminar('geofences', g.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></div>
              <div className="mt-1 text-xs text-slate-400">{coordTxt(g.lat)}, {coordTxt(g.lng)} · {t('radio')} {g.radio} m</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
