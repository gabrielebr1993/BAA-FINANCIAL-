import { useMemo, useState } from 'react'
import { Plus, Trash2, Boxes, Truck, MapPin, Check, Search, X } from 'lucide-react'
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

// Equipos de un material con COMPATIBILIDAD HACIA ATRÁS: si el doc viejo guardó
// `equipo` (string único), se lee como arreglo de un elemento.
const equiposDe = (m) => (m?.equipos && m.equipos.length) ? m.equipos : (m?.equipo ? [m.equipo] : [])

// Multiselección de equipos con chips (mismo estilo que el resto del formulario:
// MultiChips de Tarifas / chips de Choferes). Buscador solo si la lista es larga.
function ChipsEquipos({ t, opciones, sel, onToggle, onQuitarTodos, compacto = false }) {
  const [q, setQ] = useState('')
  const largo = opciones.length > 8
  const vis = q ? opciones.filter((e) => (e.nombre || '').toLowerCase().includes(q.toLowerCase())) : opciones
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Truck size={12} /> {t('Equipo requerido')}</span>
        {sel.length > 0 && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{sel.length}</span>}
        {sel.length > 0 && onQuitarTodos && <button type="button" onClick={onQuitarTodos} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-rose-500"><X size={11} /> {t('Quitar todos')}</button>}
      </div>
      {largo && (
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar equipo…')} className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-sm text-slate-800 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {vis.length === 0 ? <span className="text-xs text-slate-400">{t('Sin equipos.')}</span>
          : vis.map((e) => {
            const on = sel.includes(e.nombre)
            return (
              <button key={e.id} type="button" onClick={() => onToggle(e.nombre)}
                className={`inline-flex items-center gap-1 rounded-full border ${compacto ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} font-semibold transition ${on
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {on && <Check size={12} strokeWidth={3} />} {e.nombre}
              </button>
            )
          })}
      </div>
    </div>
  )
}

export default function Materiales() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: materiales, cargando } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')
  const { datos: plantas } = useColeccion('plants')
  const equiposAct = equipos.filter((e) => e.activo !== false)
  const plantasAct = plantas.filter((p) => p.activo !== false).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  const nombrePlanta = useMemo(() => {
    const m = {}
    plantas.forEach((p) => { m[p.id] = p.nombre || '' })
    return m
  }, [plantas])

  const [f, setF] = useState({ nombre: '', unidad: 'ton', precio: '', equipos: [], planta: '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // Alternar un equipo en el formulario (sin duplicados).
  const toggleEquipoForm = (eq) => setF((s) => ({ ...s, equipos: s.equipos.includes(eq) ? s.equipos.filter((x) => x !== eq) : [...s.equipos, eq] }))

  const agregar = async () => {
    if (!f.nombre.trim()) { setErr(t('Escribe el nombre del material.')); return }
    if (f.equipos.length === 0) { setErr(t('Selecciona al menos un equipo requerido.')); return }
    setErr('')
    const equipos = [...new Set(f.equipos)] // sin duplicados
    await crear('materials', tenantId, {
      nombre: f.nombre.trim(),
      unidad: f.unidad,
      precio: Number(f.precio) || 0,
      equipos,
      equipo: equipos[0] || '', // espejo del primero (compatibilidad con lectores antiguos)
      plantaId: f.planta || '',
      activo: true,
    })
    setF({ nombre: '', unidad: 'ton', precio: '', equipos: [], planta: '' })
  }
  const toggle = async (m) => { await guardar('materials', m.id, { activo: m.activo === false }) }
  const editarPrecio = async (m, v) => { await guardar('materials', m.id, { precio: Number(v) || 0 }) }
  // Alternar un equipo directamente en la tarjeta (guarda arreglo + espejo `equipo`).
  const toggleEquipoMaterial = async (m, eq) => {
    const cur = equiposDe(m)
    const next = cur.includes(eq) ? cur.filter((x) => x !== eq) : [...cur, eq]
    await guardar('materials', m.id, { equipos: next, equipo: next[0] || '' })
  }
  const editarPlanta = async (m, v) => { await guardar('materials', m.id, { plantaId: v }) }

  if (cargando) return <Cargando />

  // Orden: por planta y luego por nombre, para agrupar visualmente el mismo material de distintas plantas.
  const ordenados = materiales.slice().sort((a, b) => {
    const pa = nombrePlanta[a.plantaId] || ''
    const pb = nombrePlanta[b.plantaId] || ''
    if (pa !== pb) return pa.localeCompare(pb)
    return (a.nombre || '').localeCompare(b.nombre || '')
  })

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
          <Campo label={t('Planta')}>
            <Select value={f.planta} onChange={set('planta')} className="h-11 w-full">
              <option value="">{t('— Todas las plantas —')}</option>
              {plantasAct.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label={t('Unidad')}>
            <Select value={f.unidad} onChange={set('unidad')} className="h-11 w-full">{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          </Campo>
          <Campo label={`${t('Precio por')} ${f.unidad}`}>
            <Input type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={set('precio')} className="h-11 w-full" />
          </Campo>
        </div>
        {/* Equipo requerido = MULTISELECCIÓN (un material puede cargarse con varios equipos). */}
        <div className="mt-3">
          <ChipsEquipos t={t} opciones={equiposAct} sel={f.equipos} onToggle={toggleEquipoForm} onQuitarTodos={() => setF((s) => ({ ...s, equipos: [] }))} />
        </div>
        {err && <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{err}</p>}
        <div className="mt-3">
          <Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim() || f.equipos.length === 0} className="w-full justify-center sm:w-auto"><Plus size={16} /> {t('Agregar material')}</Boton>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('Asocia el material a una planta para fijar su precio en esa planta. Un mismo material puede existir en varias plantas con precios distintos. Deja “Todas las plantas” para un precio de referencia general. El “equipo requerido” hace que las órdenes solo se ofrezcan a choferes con ese camión.')}</p>
      </Card>

      {materiales.length === 0 ? <EstadoVacio titulo={t('Sin materiales')} texto={t('Agrega el primero arriba.')} mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ordenados.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="flex items-center gap-2">
                <Boxes size={16} className="text-amber-500" />
                <span className="font-semibold text-brand-navy dark:text-slate-100">{t(m.nombre)}</span>
                <button onClick={() => toggle(m)}><Badge color={m.activo === false ? 'slate' : 'green'}>{m.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
                <button onClick={() => window.confirm(`${t('¿Eliminar')} "${t(m.nombre)}"?`) && eliminar('materials', m.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
              {/* Planta asociada: badge de referencia rápida. */}
              <div className="mt-1.5">
                <Badge color={m.plantaId ? 'blue' : 'slate'}>
                  <span className="inline-flex items-center gap-1"><MapPin size={11} /> {m.plantaId ? (nombrePlanta[m.plantaId] || t('Planta')) : t('Todas las plantas')}</span>
                </Badge>
              </div>
              {/* Planta editable. */}
              <label className="mt-2 flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><MapPin size={12} /> {t('Planta')}</span>
                <Select value={m.plantaId || ''} onChange={(e) => editarPlanta(m, e.target.value)} className="h-10 w-full text-sm">
                  <option value="">{t('— Todas las plantas —')}</option>
                  {plantasAct.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
              </label>
              {/* Precio (propio) + Equipos requeridos (MULTISELECCIÓN con chips). */}
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{t('Precio por')} {m.unidad || 'ton'}</span>
                <Input type="number" step="0.01" defaultValue={m.precio ?? 0} onBlur={(e) => editarPrecio(m, e.target.value)} className="h-10 w-full text-sm" />
              </label>
              <div className="mt-2">
                <ChipsEquipos t={t} opciones={equiposAct} sel={equiposDe(m)} onToggle={(eq) => toggleEquipoMaterial(m, eq)} compacto />
              </div>
              <div className="mt-1.5 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{money(m.precio || 0)} / {m.unidad || 'ton'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
