import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { PERMISOS, ROLES, SECCIONES, COLORS } from '../constants'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge } from '../components/ui'

function permisosVacios() {
  const o = {}
  PERMISOS.forEach((p) => (o[p.key] = false))
  return o
}

const formVacio = { uid: '', nombre: '', email: '', role: 'manager', permissions: permisosVacios() }

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(formVacio)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    const snap = await getDocs(collection(db, 'users'))
    setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const togglePermiso = (k) => setForm((f) => ({ ...f, permissions: { ...f.permissions, [k]: !f.permissions[k] } }))

  const nuevo = () => {
    setEditId(null)
    setForm(formVacio)
    setError('')
    setOk('')
  }

  const editar = (u) => {
    setEditId(u.id)
    setForm({ uid: u.id, nombre: u.nombre || '', email: u.email || '', role: u.role || 'manager', permissions: { ...permisosVacios(), ...(u.permissions || {}) } })
    setError('')
    setOk('')
  }

  const guardar = async () => {
    setError('')
    setOk('')
    if (!editId && !form.uid.trim()) return setError('Indica el UID de Firebase Auth del usuario.')
    if (!form.nombre.trim() || !form.email.trim()) return setError('Nombre y email son obligatorios.')
    setGuardando(true)
    try {
      const payload = { nombre: form.nombre.trim(), email: form.email.trim(), role: form.role, permissions: form.permissions }
      if (editId) await updateDoc(doc(db, 'users', editId), payload)
      else await setDoc(doc(db, 'users', form.uid.trim()), payload)
      await cargar()
      setOk(editId ? 'Usuario actualizado.' : 'Usuario creado.')
      nuevo()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  // resumen de qué podrá ver (owner ve todo)
  const seccionesPermitidas =
    form.role === 'owner'
      ? SECCIONES
      : SECCIONES.filter((s) => form.permissions[s.permiso])

  return (
    <div>
      <PageTitle>Usuarios y Permisos</PageTitle>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>{editId ? 'Editar usuario' : 'Crear usuario'}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <Campo label="UID (Firebase Auth)">
            <input value={form.uid} onChange={(e) => setF('uid', e.target.value)} disabled={!!editId} style={inputStyle} placeholder="uid del usuario" />
          </Campo>
          <Campo label="Nombre">
            <input value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Email">
            <input value={form.email} onChange={(e) => setF('email', e.target.value)} style={inputStyle} />
          </Campo>
          <Campo label="Rol">
            <select value={form.role} onChange={(e) => setF('role', e.target.value)} style={inputStyle}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8 }}>
          Permisos {form.role === 'owner' ? '(el owner ve todo automáticamente)' : '(elige qué puede ver)'}:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14, opacity: form.role === 'owner' ? 0.5 : 1 }}>
          {PERMISOS.map((p) => (
            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, cursor: 'pointer' }}>
              <Switch on={form.role === 'owner' ? true : form.permissions[p.key]} onClick={() => form.role !== 'owner' && togglePermiso(p.key)} />
              <span style={{ fontSize: 14 }}>{p.label}</span>
            </label>
          ))}
        </div>

        <Aviso tipo="info">
          Este usuario podrá ver: {seccionesPermitidas.length === 0 ? 'ninguna sección.' : seccionesPermitidas.map((s) => s.label).join(', ') + '.'}
        </Aviso>

        <div style={{ display: 'flex', gap: 10 }}>
          <Boton onClick={guardar} disabled={guardando} variant="gold">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear usuario'}
          </Boton>
          {editId && <Boton onClick={nuevo} variant="ghost">Cancelar</Boton>}
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 10 }}>
          Nota: el acceso en Firebase Auth (correo/contraseña) se crea aparte. Aquí se crea/edita el documento en la colección <code>users</code> con ese UID.
        </div>
      </Card>

      <Tabla
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'email', label: 'Email' },
          { key: 'role', label: 'Rol' },
          { key: 'permisos', label: 'Permisos', wrap: true },
          { key: 'acciones', label: '', align: 'right' },
        ]}
        rows={usuarios.map((u) => ({ ...u, _key: u.id }))}
        emptyText="No hay usuarios registrados."
        renderCell={(row, key) => {
          if (key === 'role') return <Badge color={row.role === 'owner' ? COLORS.gold : COLORS.navy}>{row.role}</Badge>
          if (key === 'permisos') {
            if (row.role === 'owner') return <Badge color={COLORS.gold}>Todo (owner)</Badge>
            const activos = PERMISOS.filter((p) => row.permissions?.[p.key])
            return activos.length ? activos.map((p) => <Badge key={p.key}>{p.label}</Badge>) : <span style={{ color: COLORS.muted }}>Sin permisos</span>
          }
          if (key === 'acciones')
            return (
              <Boton variant="ghost" onClick={() => editar(row)} style={{ padding: '5px 10px', fontSize: 13 }}>
                Editar
              </Boton>
            )
          return row[key]
        }}
      />
    </div>
  )
}

const inputStyle = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, width: 200 }

function Campo({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Switch({ on, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        width: 38,
        height: 22,
        borderRadius: 20,
        background: on ? COLORS.green : '#cbd2dc',
        position: 'relative',
        display: 'inline-block',
        transition: 'background .15s',
        flexShrink: 0,
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </span>
  )
}
