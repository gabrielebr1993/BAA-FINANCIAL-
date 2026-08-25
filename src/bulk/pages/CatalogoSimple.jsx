// Catálogo administrable genérico (Materiales, Tipos de equipo). Reutilizable.
import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar, listar, where } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { PageTitle, Card, Boton, Input, Tabla, Badge, Cargando } from '../../components/ui'
import { useLang } from '../../i18n'

export default function CatalogoSimple({ titulo, coleccion, semilla = [], entidad }) {
  const { t } = useLang()
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos, cargando } = useColeccion(coleccion)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null) // { id, valor } | null

  const agregar = async () => {
    const n = nombre.trim()
    if (!n) return
    setOcupado(true)
    await crear(coleccion, tenantId, { nombre: n, activo: true })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear', entidad, detalle: `Alta ${entidad}: ${n}` })
    setNombre(''); setOcupado(false)
  }
  const borrar = async (row) => {
    if (!window.confirm(`${t('¿Eliminar')} "${row.nombre}"?`)) return
    await eliminar(coleccion, row.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'eliminar', entidad, entidadId: row.id, detalle: `Baja ${entidad}: ${row.nombre}` })
  }
  const toggle = async (row) => { await guardar(coleccion, row.id, { activo: row.activo === false }) }

  // Renombrar con propagación: en "Tipos de equipo" el nombre se usa como
  // referencia en transportistas (equipos[]), materiales, trabajos y órdenes
  // activas — si no se actualizan, dejarían de ser compatibles.
  const renombrar = async (row, nuevo) => {
    const n = (nuevo || '').trim()
    if (!n || n === row.nombre) { setEditando(null); return }
    setOcupado(true)
    try {
      await guardar(coleccion, row.id, { nombre: n })
      if (coleccion === 'equipment' && row.nombre) {
        const viejo = row.nombre
        const [carriers, materiales, jobs, ordenes] = await Promise.all([
          listar('carriers', tenantId).catch(() => []),
          listar('materials', tenantId, [where('tipoEquipo', '==', viejo)]).catch(() => []),
          listar('jobs', tenantId, [where('tipoEquipo', '==', viejo)]).catch(() => []),
          listar('orders', tenantId, [where('tipoEquipo', '==', viejo)]).catch(() => []),
        ])
        const tareas = []
        for (const c of carriers) {
          const eq = Array.isArray(c.equipos) ? c.equipos : []
          if (eq.includes(viejo)) tareas.push(guardar('carriers', c.id, { equipos: eq.map((e) => (e === viejo ? n : e)) }))
        }
        for (const m of materiales) tareas.push(guardar('materials', m.id, { tipoEquipo: n }))
        for (const j of jobs) tareas.push(guardar('jobs', j.id, { tipoEquipo: n }))
        for (const o of ordenes) {
          if (!['liberada', 'cerrada', 'cancelada'].includes(o.estado)) tareas.push(guardar('orders', o.id, { tipoEquipo: n }))
        }
        await Promise.all(tareas)
      }
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'editar', entidad, entidadId: row.id, detalle: `Renombrar ${entidad}: "${row.nombre}" → "${n}"` })
    } catch (e) {
      window.alert(t('No se pudo renombrar: ') + (e?.message || ''))
    }
    setEditando(null)
    setOcupado(false)
  }
  const sembrar = async () => {
    setOcupado(true)
    for (const s of semilla) await crear(coleccion, tenantId, { ...s, activo: true })
    setOcupado(false)
  }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{titulo}</PageTitle>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-64" placeholder={`${t('Nuevo')} ${entidad}…`} value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
          <Boton variant="gold" onClick={agregar} disabled={ocupado || !nombre.trim()}><Plus size={16} /> {t('Agregar')}</Boton>
          {datos.length === 0 && semilla.length > 0 && <Boton variant="ghost" onClick={sembrar} disabled={ocupado}>{t('Cargar catálogo base')}</Boton>}
        </div>
      </Card>
      <Card className="p-4">
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
          rows={datos.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((d) => ({ ...d, _key: d.id }))}
          emptyText={t('Sin elementos. Agrega el primero arriba.')}
          renderCell={(row, key) => {
            if (key === 'nombre') {
              if (editando?.id === row.id) {
                return (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      className="w-48 py-1 text-sm"
                      value={editando.valor}
                      onChange={(e) => setEditando({ id: row.id, valor: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renombrar(row, editando.valor)
                        if (e.key === 'Escape') setEditando(null)
                      }}
                    />
                    <button onClick={() => renombrar(row, editando.valor)} disabled={ocupado} className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400" title={t('Guardar')}><Check size={14} /></button>
                    <button onClick={() => setEditando(null)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-200/70 text-slate-500 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300" title={t('Cancelar')}><X size={14} /></button>
                  </div>
                )
              }
              return (
                <span className="inline-flex items-center gap-2">
                  {row.nombre}
                  <button onClick={() => setEditando({ id: row.id, valor: row.nombre || '' })} className="text-slate-300 hover:text-amber-500 dark:text-slate-600 dark:hover:text-amber-400" title={t('Editar nombre')}><Pencil size={13} /></button>
                </span>
              )
            }
            if (key === 'estado') return <button onClick={() => toggle(row)}><Badge color={row.activo === false ? 'slate' : 'green'}>{row.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
            if (key === 'acciones') return <Boton variant="danger" onClick={() => borrar(row)} className="px-2.5 py-1 text-xs"><Trash2 size={13} /> {t('Eliminar')}</Boton>
            return row[key]
          }}
        />
      </Card>
    </div>
  )
}
