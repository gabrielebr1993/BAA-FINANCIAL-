import { useMemo, useState } from 'react'
import { Plus, Trash2, Boxes, Truck, MapPin, Check, Search, X, Pencil, StickyNote } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { preciosDe, plantasQueOfrecen } from '../domain/materialesPrecios'
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
      // PRECIOS POR PLANTA: si eligió planta, nace ya como fila de configuración.
      precios: f.planta ? [{ plantaId: f.planta, precio: Number(f.precio) || 0, unidad: f.unidad, disponible: true, notas: '' }] : [],
      activo: true,
    })
    // Reset LIMPIO del formulario (nada del material anterior queda en memoria).
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

  if (cargando) return <Cargando />

  // Orden ESTABLE: por nombre y, en empate, por id. Nunca por planta: la planta
  // se edita desde la propia tarjeta y, si ordenara, la tarjeta "saltaría" a otra
  // posición del grid al cambiarla (parecía que la interfaz se daba vuelta).
  // Cambiar de planta ahora solo actualiza los datos; el layout no se mueve.
  const ordenados = materiales.slice().sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '') || (a.id || '').localeCompare(b.id || ''))

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
              {/* Resumen: qué plantas lo ofrecen y a qué precio. */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {plantasQueOfrecen(m).length === 0
                  ? <Badge color="slate"><span className="inline-flex items-center gap-1"><MapPin size={11} /> {t('Todas las plantas')}{Number(m.precio) > 0 ? ` · ${money(m.precio)}/${m.unidad || 'ton'}` : ''}</span></Badge>
                  : plantasQueOfrecen(m).map((p, i) => (
                    <Badge key={p.plantaId || i} color="blue"><span className="inline-flex items-center gap-1"><MapPin size={11} /> {nombrePlanta[p.plantaId] || t('Planta')} · {money(p.precio)}/{p.unidad || m.unidad || 'ton'}</span></Badge>
                  ))}
              </div>
              {/* PRECIOS POR PLANTA: lista de configuraciones (planta, precio, unidad,
                  disponibilidad, notas). Cada fila se agrega/edita/elimina sin tocar
                  las demás y SIEMPRE escribe sobre ESTE material (m.id). */}
              <div className="mt-2">
                <PreciosPorPlanta t={t} m={m} plantasAct={plantasAct} nombrePlanta={nombrePlanta} />
              </div>
              {/* Precio GENERAL (respaldo cuando la orden no sale de una planta con fila). */}
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{t('Precio general (sin planta) por')} {m.unidad || 'ton'}</span>
                <Input type="number" step="0.01" defaultValue={m.precio ?? 0} onBlur={(e) => editarPrecio(m, e.target.value)} className="h-10 w-full text-sm" />
              </label>
              <div className="mt-2">
                <ChipsEquipos t={t} opciones={equiposAct} sel={equiposDe(m)} onToggle={(eq) => toggleEquipoMaterial(m, eq)} compacto />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PRECIOS POR PLANTA de un material ───────────────────────────────────────
// Lista editable de configuraciones { planta, precio, unidad, disponible, notas }.
// Todas las escrituras usan m.id (el ID del documento es la fuente de verdad):
// agregar/editar/eliminar una fila jamás toca otro material. El estado del
// formulario se resetea limpio al guardar o cancelar.
function PreciosPorPlanta({ t, m, plantasAct, nombrePlanta }) {
  const filas = preciosDe(m)
  const [edit, setEdit] = useState(null) // null | 'nueva' | índice de fila
  const FORM_VACIO = { plantaId: '', precio: '', unidad: m.unidad || 'ton', disponible: true, notas: '' }
  const [g, setG] = useState(FORM_VACIO)
  const abrir = (i) => {
    if (i === 'nueva') setG({ ...FORM_VACIO })
    else { const p = filas[i]; setG({ plantaId: p.plantaId || '', precio: String(p.precio ?? ''), unidad: p.unidad || m.unidad || 'ton', disponible: p.disponible !== false, notas: p.notas || '' }) }
    setEdit(i)
  }
  const cerrar = () => { setEdit(null); setG({ ...FORM_VACIO }) }
  // Persiste el arreglo completo de filas SOLO en este material (m.id).
  const persistir = async (nuevas) => {
    await guardar('materials', m.id, { precios: nuevas.map((p) => ({ plantaId: p.plantaId || '', precio: Number(p.precio) || 0, unidad: p.unidad || 'ton', disponible: p.disponible !== false, notas: p.notas || '' })) })
  }
  const guardarFila = async () => {
    if (!g.plantaId || !(Number(g.precio) > 0)) return
    const fila = { plantaId: g.plantaId, precio: Number(g.precio), unidad: g.unidad, disponible: g.disponible, notas: g.notas.trim() }
    const base = filas.map((p) => ({ ...p }))
    if (edit === 'nueva') {
      // Una fila por planta: si ya existe esa planta, se reemplaza.
      const ix = base.findIndex((p) => p.plantaId === fila.plantaId)
      if (ix >= 0) base[ix] = fila; else base.push(fila)
    } else base[edit] = fila
    await persistir(base)
    cerrar()
  }
  const eliminarFila = async (i) => {
    if (!window.confirm(`${t('¿Quitar el precio de')} ${nombrePlanta[filas[i]?.plantaId] || t('esa planta')}?`)) return
    await persistir(filas.filter((_, j) => j !== i))
    if (edit === i) cerrar()
  }
  const toggleDisponible = async (i) => {
    const base = filas.map((p, j) => (j === i ? { ...p, disponible: p.disponible === false } : p))
    await persistir(base)
  }
  const plantasLibres = plantasAct

  return (
    <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><MapPin size={12} /> {t('Precios por planta')}</span>
        <button type="button" onClick={() => abrir('nueva')} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-400"><Plus size={11} /> {t('Agregar')}</button>
      </div>

      {filas.length === 0 && edit == null && (
        <p className="m-0 py-1 text-[11px] text-slate-400">{t('Sin precios por planta: aplica el precio general. Agrega una planta para fijar su precio propio.')}</p>
      )}

      {filas.map((p, i) => (
        <div key={p.plantaId || i} className={`flex items-center gap-1.5 border-b border-dashed border-slate-100 py-1 text-xs last:border-0 dark:border-slate-800 ${p.disponible === false ? 'opacity-50' : ''}`}>
          <button type="button" onClick={() => toggleDisponible(i)} title={p.disponible === false ? t('No disponible (toca para activar)') : t('Disponible (toca para pausar)')} className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${p.disponible === false ? 'bg-slate-300 dark:bg-slate-600' : 'bg-emerald-500'}`} />
          <span className="min-w-0 flex-1 truncate font-semibold text-brand-navy dark:text-slate-100">{nombrePlanta[p.plantaId] || t('Planta')}</span>
          {p.notas && <span title={p.notas} className="text-slate-400"><StickyNote size={11} /></span>}
          <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(p.precio)}<span className="font-normal text-slate-400">/{p.unidad || 'ton'}</span></span>
          <button type="button" onClick={() => abrir(i)} title={t('Editar')} className="text-slate-400 hover:text-amber-600"><Pencil size={12} /></button>
          <button type="button" onClick={() => eliminarFila(i)} title={t('Quitar')} className="text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
        </div>
      ))}

      {edit != null && (
        <div className="mt-1.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <div className="grid grid-cols-2 gap-1.5">
            <Select value={g.plantaId} onChange={(e) => setG((s) => ({ ...s, plantaId: e.target.value }))} className="h-9 w-full text-xs">
              <option value="">{t('— Planta —')}</option>
              {plantasLibres.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
            <div className="flex gap-1.5">
              <Input type="number" step="0.01" min="0" placeholder={t('Precio')} value={g.precio} onChange={(e) => setG((s) => ({ ...s, precio: e.target.value }))} className="h-9 w-full text-xs" />
              <Select value={g.unidad} onChange={(e) => setG((s) => ({ ...s, unidad: e.target.value }))} className="h-9 text-xs">{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
            </div>
          </div>
          <Input placeholder={t('Notas (opcional)')} value={g.notas} onChange={(e) => setG((s) => ({ ...s, notas: e.target.value }))} className="mt-1.5 h-9 w-full text-xs" />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={g.disponible} onChange={(e) => setG((s) => ({ ...s, disponible: e.target.checked }))} className="accent-emerald-500" /> {t('Disponible')}
            </label>
            <button type="button" onClick={guardarFila} disabled={!g.plantaId || !(Number(g.precio) > 0)} className="ml-auto rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-amber-500 dark:text-slate-900">{t('Guardar')}</button>
            <button type="button" onClick={cerrar} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600">{t('Cancelar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
