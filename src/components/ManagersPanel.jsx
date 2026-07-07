import { useState } from 'react'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { costoManagers } from '../utils/calc'
import { money } from '../utils/format'
import { Card, Boton, Tabla, Aviso, Badge, Input } from './ui'

const vacio = { nombre: '', sueldoSemanal: '' }

export default function ManagersPanel() {
  const { managers, reloadManagers, activeCompanyId, invoicesRango } = useData()
  const [form, setForm] = useState(vacio)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const semanas = Math.max(1, invoicesRango.length)
  const activos = managers.filter((m) => m.activo !== false)

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const cancelar = () => { setEditId(null); setForm(vacio); setError('') }

  const guardar = async () => {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio.')
    if (Number(form.sueldoSemanal) < 0) return setError('El sueldo no puede ser negativo.')
    setGuardando(true)
    setError('')
    try {
      const payload = { nombre: form.nombre.trim(), sueldoSemanal: Number(form.sueldoSemanal) || 0 }
      if (editId) await updateDoc(doc(db, 'managers', editId), payload)
      else await addDoc(collection(db, 'managers'), { ...payload, activo: true, companyId: activeCompanyId })
      await reloadManagers()
      cancelar()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const editar = (m) => { setEditId(m.id); setForm({ nombre: m.nombre || '', sueldoSemanal: m.sueldoSemanal ?? '' }) }
  const toggle = async (m) => { await updateDoc(doc(db, 'managers', m.id), { activo: !(m.activo !== false) }); await reloadManagers() }

  return (
    <div>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar manager' : 'Agregar manager'}</h3>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre</div>
            <Input className="w-56" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} disabled={!!editId} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Sueldo semanal ($)</div>
            <Input className="w-40" type="number" step="0.01" min="0" value={form.sueldoSemanal} onChange={(e) => setF('sueldoSemanal', e.target.value)} />
          </div>
          <Boton variant="gold" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar' : 'Agregar'}</Boton>
          {editId && <Boton variant="ghost" onClick={cancelar}>Cancelar</Boton>}
        </div>
      </Card>

      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Managers ({managers.length})</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Costo fijo del periodo ({semanas} sem.): <b className="text-brand-navy dark:text-slate-200">{money(costoManagers(activos, semanas))}</b>
        </span>
      </div>
      <Tabla
        columns={[
          { key: 'nombre', label: 'Manager' },
          { key: 'sueldoSemanal', label: 'Sueldo semanal', align: 'right' },
          { key: 'activo', label: 'Estado', align: 'center' },
          { key: 'acciones', label: '', align: 'right' },
        ]}
        rows={[...managers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((m) => ({ ...m, _key: m.id }))}
        emptyText="Aún no hay managers. Agrégalos arriba; su sueldo se suma como costo fijo semanal."
        renderCell={(row, key) => {
          if (key === 'sueldoSemanal') return money(row.sueldoSemanal)
          if (key === 'activo') return row.activo !== false ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>
          if (key === 'acciones')
            return (
              <div className="flex justify-end gap-2">
                <Boton variant="ghost" onClick={() => editar(row)} className="px-2.5 py-1 text-xs">Editar</Boton>
                <Boton variant="ghost" onClick={() => toggle(row)} className="px-2.5 py-1 text-xs">{row.activo !== false ? 'Desactivar' : 'Activar'}</Boton>
              </div>
            )
          return row[key]
        }}
      />
    </div>
  )
}
