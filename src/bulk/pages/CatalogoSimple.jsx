// Catálogo administrable genérico (Materiales, Tipos de equipo). Reutilizable.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { PageTitle, Card, Boton, Input, Tabla, Badge, Cargando } from '../../components/ui'

export default function CatalogoSimple({ titulo, coleccion, semilla = [], entidad }) {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos, cargando } = useColeccion(coleccion)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const agregar = async () => {
    const n = nombre.trim()
    if (!n) return
    setOcupado(true)
    await crear(coleccion, tenantId, { nombre: n, activo: true })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear', entidad, detalle: `Alta ${entidad}: ${n}` })
    setNombre(''); setOcupado(false)
  }
  const borrar = async (row) => {
    if (!window.confirm(`¿Eliminar "${row.nombre}"?`)) return
    await eliminar(coleccion, row.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'eliminar', entidad, entidadId: row.id, detalle: `Baja ${entidad}: ${row.nombre}` })
  }
  const toggle = async (row) => { await guardar(coleccion, row.id, { activo: row.activo === false }) }
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
          <Input className="w-64" placeholder={`Nuevo ${entidad}…`} value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
          <Boton variant="gold" onClick={agregar} disabled={ocupado || !nombre.trim()}><Plus size={16} /> Agregar</Boton>
          {datos.length === 0 && semilla.length > 0 && <Boton variant="ghost" onClick={sembrar} disabled={ocupado}>Cargar catálogo base</Boton>}
        </div>
      </Card>
      <Card className="p-4">
        <Tabla
          columns={[{ key: 'nombre', label: 'Nombre' }, { key: 'estado', label: 'Estado', align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
          rows={datos.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((d) => ({ ...d, _key: d.id }))}
          emptyText="Sin elementos. Agrega el primero arriba."
          renderCell={(row, key) => {
            if (key === 'estado') return <button onClick={() => toggle(row)}><Badge color={row.activo === false ? 'slate' : 'green'}>{row.activo === false ? 'Inactivo' : 'Activo'}</Badge></button>
            if (key === 'acciones') return <Boton variant="danger" onClick={() => borrar(row)} className="px-2.5 py-1 text-xs"><Trash2 size={13} /> Eliminar</Boton>
            return row[key]
          }}
        />
      </Card>
    </div>
  )
}
