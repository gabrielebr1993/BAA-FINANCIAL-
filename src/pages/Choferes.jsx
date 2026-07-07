import { useState } from 'react'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { buscarDriver } from '../utils/calc'
import { money } from '../utils/format'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input } from '../components/ui'

const vacio = { nombre: '', precioIndividual: '', precioDoble: '', activo: true }

export default function Choferes() {
  const { drivers, reloadDrivers, selectedInvoice } = useData()
  const [form, setForm] = useState(vacio)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const empezarEdicion = (d) => {
    setEditId(d.id)
    setForm({ nombre: d.nombre || '', precioIndividual: d.precioIndividual ?? '', precioDoble: d.precioDoble ?? '', activo: d.activo !== false })
  }
  const cancelar = () => {
    setEditId(null)
    setForm(vacio)
    setError('')
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio (debe coincidir con "Courier" del Excel).')
    setGuardando(true)
    setError('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        precioIndividual: Number(form.precioIndividual) || 0,
        precioDoble: Number(form.precioDoble) || 0,
        activo: !!form.activo,
      }
      if (editId) await updateDoc(doc(db, 'drivers', editId), payload)
      else await addDoc(collection(db, 'drivers'), payload)
      await reloadDrivers()
      cancelar()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (d) => {
    await updateDoc(doc(db, 'drivers', d.id), { activo: !(d.activo !== false) })
    await reloadDrivers()
  }

  const crearRapido = (nombre) => {
    setEditId(null)
    setForm({ ...vacio, nombre })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sinTarifa = selectedInvoice
    ? [...new Set((selectedInvoice.resumenChoferes || []).map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []

  return (
    <div>
      <PageTitle>Choferes y Tarifas</PageTitle>

      {sinTarifa.length > 0 && (
        <Aviso tipo="warn">
          🚚 Choferes sin tarifa en la última factura ({sinTarifa.length}):
          <div className="mt-2 flex flex-wrap gap-2">
            {sinTarifa.map((n) => (
              <Boton key={n} variant="ghost" onClick={() => crearRapido(n)} className="px-2.5 py-1 text-xs">
                + {n}
              </Boton>
            ))}
          </div>
        </Aviso>
      )}

      <Card className="mb-5 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar chofer' : 'Agregar chofer'}</h3>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Nombre (= Courier del Excel)">
            <Input className="w-52" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} disabled={!!editId} />
          </Campo>
          <Campo label="Precio individual ($)">
            <Input className="w-40" type="number" step="0.01" value={form.precioIndividual} onChange={(e) => setF('precioIndividual', e.target.value)} />
          </Campo>
          <Campo label="Precio doble ($)">
            <Input className="w-40" type="number" step="0.01" value={form.precioDoble} onChange={(e) => setF('precioDoble', e.target.value)} />
          </Campo>
          <Campo label="Activo">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.activo} onChange={(e) => setF('activo', e.target.checked)} /> {form.activo ? 'Sí' : 'No'}
            </label>
          </Campo>
          <Boton onClick={guardar} disabled={guardando} variant="gold">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Agregar'}
          </Boton>
          {editId && (
            <Boton onClick={cancelar} variant="ghost">
              Cancelar
            </Boton>
          )}
        </div>
      </Card>

      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes registrados</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">Mostrando {drivers.length} de {drivers.length}</span>
      </div>
      <Tabla
        columns={[
          { key: 'nombre', label: 'Chofer' },
          { key: 'precioIndividual', label: 'Precio individual', align: 'right' },
          { key: 'precioDoble', label: 'Precio doble', align: 'right' },
          { key: 'activo', label: 'Estado', align: 'center' },
          { key: 'acciones', label: 'Acciones', align: 'right' },
        ]}
        rows={[...drivers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((d) => ({ ...d, _key: d.id }))}
        emptyText="Aún no hay choferes registrados."
        renderCell={(row, key) => {
          if (key === 'precioIndividual' || key === 'precioDoble') return money(row[key])
          if (key === 'activo') return row.activo !== false ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>
          if (key === 'acciones')
            return (
              <div className="flex justify-end gap-2">
                <Boton variant="ghost" onClick={() => empezarEdicion(row)} className="px-2.5 py-1 text-xs">
                  Editar
                </Boton>
                <Boton variant="ghost" onClick={() => toggleActivo(row)} className="px-2.5 py-1 text-xs">
                  {row.activo !== false ? 'Desactivar' : 'Activar'}
                </Boton>
              </div>
            )
          return row[key]
        }}
      />
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}
