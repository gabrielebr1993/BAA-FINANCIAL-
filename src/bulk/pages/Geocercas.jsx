import { useState } from 'react'
import { Plus, Trash2, MapPin, MousePointerClick, Pencil, Save, X, Move } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar, guardar } from '../data/repo'
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
  const { tenantId, rol } = useBulkAuth()
  const esAdmin = rol === 'admin' || rol === 'super_admin'
  const { datos: geocercas, cargando } = useColeccion('geofences')
  const { datos: plantas } = useColeccion('plants')
  const [f, setF] = useState({ nombre: '', tipo: 'destino', lat: '', lng: '', radio: '200' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // Geocerca en EDICIÓN (mover centro / ajustar radio) o null. Solo admins.
  const [editando, setEditando] = useState(null) // { id, nombre, tipo, lat, lng, radio, color }
  const [guardando, setGuardando] = useState(false)
  const iniciarEdicion = (g) => setEditando({ id: g.id, nombre: g.nombre, tipo: g.tipo, lat: Number(g.lat), lng: Number(g.lng), radio: Number(g.radio) || 200, color: COLOR[g.tipo] || '#c9a24b' })
  const guardarEdicion = async () => {
    if (!editando) return
    setGuardando(true)
    try { await guardar('geofences', editando.id, { lat: Number(editando.lat), lng: Number(editando.lng), radio: Math.round(Number(editando.radio) || 200) }); setEditando(null) }
    catch { window.alert(t('No se pudo guardar. Solo un administrador puede editar geocercas.')) }
    finally { setGuardando(false) }
  }

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
          {editando
            ? <><Move size={14} className="text-blue-500" /> {t('Arrastra el punto del centro en el mapa y ajusta el radio abajo.')}</>
            : <><MousePointerClick size={14} className="text-amber-500" /> {t('Toca el mapa para marcar la ubicación de una nueva geocerca.')}</>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {TIPOS.map((ti) => <span key={ti.v} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[ti.v] }} /> {t(ti.l)}</span>)}
          </span>
        </div>
        <MapaLeaflet
          geocercas={geocercas}
          marcadores={editando ? [] : preview}
          onPick={editando ? null : elegirDelMapa}
          editable={editando}
          onEditable={({ lat, lng }) => setEditando((e) => (e ? { ...e, lat, lng } : e))}
          alto="52vh"
        />
        {/* Panel de edición de radio/centro (área actual visible en el mapa). */}
        {editando && (
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/40 dark:bg-blue-500/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Editando')}: {editando.nombre}</span>
              <span className="text-xs text-slate-500">{Number(editando.lat).toFixed(5)}, {Number(editando.lng).toFixed(5)}</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500">{t('Radio')}</span>
              <input type="range" min="25" max="3000" step="25" value={editando.radio} onChange={(e) => setEditando((s) => ({ ...s, radio: Number(e.target.value) }))} className="h-2 flex-1 accent-blue-600" />
              <input type="number" min="25" max="5000" value={editando.radio} onChange={(e) => setEditando((s) => ({ ...s, radio: Number(e.target.value) }))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" />
              <span className="text-xs text-slate-500">m</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Boton variant="gold" onClick={guardarEdicion} disabled={guardando}><Save size={15} /> {guardando ? t('Guardando…') : t('Guardar cambios')}</Boton>
              <Boton variant="ghost" onClick={() => setEditando(null)} disabled={guardando}><X size={15} /> {t('Cancelar')}</Boton>
            </div>
          </div>
        )}
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
            <Card key={g.id} className={`p-3 ${editando?.id === g.id ? 'ring-2 ring-blue-400' : ''}`}>
              <div className="flex items-center gap-2">
                <MapPin size={16} style={{ color: COLOR[g.tipo] || '#c9a24b' }} />
                <span className="font-semibold text-brand-navy dark:text-slate-100">{g.nombre}</span>
                <Badge color="navy">{g.tipo}</Badge>
                {esAdmin && (
                  <button onClick={() => iniciarEdicion(g)} title={t('Editar geocerca')} className="ml-auto text-slate-400 hover:text-blue-600"><Pencil size={14} /></button>
                )}
                {esAdmin && <button onClick={() => window.confirm(`${t('¿Eliminar geocerca')} "${g.nombre}"?`) && eliminar('geofences', g.id)} className={`${esAdmin ? '' : 'ml-auto'} text-rose-400 hover:text-rose-600`}><Trash2 size={14} /></button>}
              </div>
              <div className="mt-1 text-xs text-slate-400">{coordTxt(g.lat)}, {coordTxt(g.lng)} · {t('radio')} {g.radio} m</div>
              {esAdmin && <button onClick={() => iniciarEdicion(g)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"><Move size={13} /> {t('Ajustar en el mapa')}</button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
