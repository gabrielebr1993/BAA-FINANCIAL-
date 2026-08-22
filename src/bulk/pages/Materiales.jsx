import { useState } from 'react'
import { Plus, Trash2, Boxes, Truck } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const UNIDADES = ['ton', 'yd³', 'm³', 'viaje']

// Campo con etiqueta uniforme arriba (mantiene todas las alturas alineadas).
function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export default function Materiales() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: materiales, cargando } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')
  const equiposAct = equipos.filter((e) => e.activo !== false)
  const [f, setF] = useState({ nombre: '', unidad: 'ton', precio: '', equipo: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    await crear('materials', tenantId, { nombre: f.nombre.trim(), unidad: f.unidad, precio: Number(f.precio) || 0, equipo: f.equipo || '', activo: true })
    setF({ nombre: '', unidad: 'ton', precio: '', equipo: '' })
  }
  const toggle = async (m) => { await guardar('materials', m.id, { activo: m.activo === false }) }
  const editarPrecio = async (m, v) => { await guardar('materials', m.id, { precio: Number(v) || 0 }) }
  const editarEquipo = async (m, v) => { await guardar('materials', m.id, { equipo: v }) }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Materiales')}</PageTitle>

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo material')}</h3>
        {/* Campos con etiqueta uniforme (alturas alineadas) y el botón en su propia fila
            para que nunca se encimen. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label={t('Nombre')}>
            <Input placeholder={t('Nombre (ej. Grava)')} value={f.nombre} onChange={set('nombre')} className="h-11 w-full" />
          </Campo>
          <Campo label={t('Unidad')}>
            <Select value={f.unidad} onChange={set('unidad')} className="h-11 w-full">{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          </Campo>
          <Campo label={t('Equipo requerido')}>
            <Select value={f.equipo} onChange={set('equipo')} className="h-11 w-full">
              <option value="">{t('— cualquiera —')}</option>
              {equiposAct.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label={`${t('Precio por')} ${f.unidad}`}>
            <Input type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={set('precio')} className="h-11 w-full" />
          </Campo>
        </div>
        <div className="mt-3">
          <Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim()} className="w-full justify-center sm:w-auto"><Plus size={16} /> {t('Agregar material')}</Boton>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('El “equipo requerido” hace que las órdenes de este material solo se ofrezcan a choferes con ese camión. El precio es la referencia; el final puede ajustarse en tarifas y en el trabajo.')}</p>
      </Card>

      {materiales.length === 0 ? <EstadoVacio titulo={t('Sin materiales')} texto={t('Agrega el primero arriba.')} mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {materiales.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((m) => (
            <Card key={m.id} className="p-3">
              <div className="flex items-center gap-2">
                <Boxes size={16} className="text-amber-500" />
                <span className="font-semibold text-brand-navy dark:text-slate-100">{t(m.nombre)}</span>
                <button onClick={() => toggle(m)}><Badge color={m.activo === false ? 'slate' : 'green'}>{m.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
                <button onClick={() => window.confirm(`${t('¿Eliminar')} "${t(m.nombre)}"?`) && eliminar('materials', m.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
              {/* Precio y Equipo: mismos recuadros (mismo ancho y alto) para una vista uniforme. */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">{t('Precio por')} {m.unidad || 'ton'}</span>
                  <Input type="number" step="0.01" defaultValue={m.precio ?? 0} onBlur={(e) => editarPrecio(m, e.target.value)} className="h-10 w-full text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Truck size={12} /> {t('Equipo')}</span>
                  <Select value={m.equipo || ''} onChange={(e) => editarEquipo(m, e.target.value)} className="h-10 w-full text-sm">
                    <option value="">{t('— cualquiera —')}</option>
                    {equiposAct.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  </Select>
                </label>
              </div>
              <div className="mt-1.5 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{money(m.precio || 0)} / {m.unidad || 'ton'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
