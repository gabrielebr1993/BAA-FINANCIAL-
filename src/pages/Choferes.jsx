import { useState } from 'react'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { buscarDriver } from '../utils/calc'
import { COLORS } from '../constants'
import { money } from '../utils/format'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge } from '../components/ui'

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
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio (debe coincidir con "Courier" del Excel).')
      return
    }
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

  // choferes de la última factura que no tienen tarifa registrada
  const sinTarifa = selectedInvoice
    ? [...new Set((selectedInvoice.resumenChoferes || []).map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []

  return (
    <div>
      <PageTitle>Choferes y Tarifas</PageTitle>

      {sinTarifa.length > 0 && (
        <Aviso tipo="warn">
          🚚 Choferes sin tarifa en la última factura ({sinTarifa.length}):
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {sinTarifa.map((n) => (
              <Boton key={n} variant="ghost" onClick={() => crearRapido(n)} style={{ padding: '5px 10px', fontSize: 13 }}>
                + {n}
              </Boton>
            ))}
          </div>
        </Aviso>
      )}

      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>{editId ? 'Editar chofer' : 'Agregar chofer'}</h3>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Campo label="Nombre (= Courier del Excel)">
            <input value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} style={inputStyle} disabled={!!editId} />
          </Campo>
          <Campo label="Precio individual ($)">
            <input type="number" step="0.01" value={form.precioIndividual} onChange={(e) => setF('precioIndividual', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Precio doble ($)">
            <input type="number" step="0.01" value={form.precioDoble} onChange={(e) => setF('precioDoble', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Activo">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
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
          if (key === 'activo') return row.activo !== false ? <Badge color={COLORS.green}>Activo</Badge> : <Badge color={COLORS.muted}>Inactivo</Badge>
          if (key === 'acciones')
            return (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Boton variant="ghost" onClick={() => empezarEdicion(row)} style={{ padding: '5px 10px', fontSize: 13 }}>
                  Editar
                </Boton>
                <Boton variant="ghost" onClick={() => toggleActivo(row)} style={{ padding: '5px 10px', fontSize: 13 }}>
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

const inputStyle = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, width: 160 }

function Campo({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
