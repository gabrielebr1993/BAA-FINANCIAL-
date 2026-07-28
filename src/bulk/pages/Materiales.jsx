import { useState } from 'react'
import { Plus, Trash2, Boxes } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const UNIDADES = ['ton', 'yd³', 'm³', 'viaje']

export default function Materiales() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: materiales, cargando } = useColeccion('materials')
  const [f, setF] = useState({ nombre: '', unidad: 'ton', precio: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    await crear('materials', tenantId, { nombre: f.nombre.trim(), unidad: f.unidad, precio: Number(f.precio) || 0, activo: true })
    setF({ nombre: '', unidad: 'ton', precio: '' })
  }
  const toggle = async (m) => { await guardar('materials', m.id, { activo: m.activo === false }) }
  const editarPrecio = async (m, v) => { await guardar('materials', m.id, { precio: Number(v) || 0 }) }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Materiales')}</PageTitle>

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo material')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t('Nombre (ej. Grava)')} value={f.nombre} onChange={set('nombre')} />
          <Select value={f.unidad} onChange={set('unidad')}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          <div>
            <div className="mb-1 text-[11px] uppercase text-slate-400">{t('Precio por')} {f.unidad}</div>
            <Input type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={set('precio')} />
          </div>
          <div className="flex items-end"><Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim()} className="w-full justify-center"><Plus size={16} /> {t('Agregar')}</Boton></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('El precio es la referencia del material. El precio final al cliente puede ajustarse por planta/acuerdo en el motor de tarifas y en el trabajo.')}</p>
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
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-400">{t('Precio por')} {m.unidad || 'ton'}:</span>
                <Input type="number" step="0.01" defaultValue={m.precio ?? 0} onBlur={(e) => editarPrecio(m, e.target.value)} className="w-28 py-1 text-sm" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{money(m.precio || 0)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
