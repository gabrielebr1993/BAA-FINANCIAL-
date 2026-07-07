import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { PERMISOS, ROLES, SECCIONES } from '../constants'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select } from '../components/ui'

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

  const seccionesPermitidas = form.role === 'owner' ? SECCIONES : SECCIONES.filter((s) => form.permissions[s.permiso])

  return (
    <div>
      <PageTitle>Usuarios y Permisos</PageTitle>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Card className="mb-5 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar usuario' : 'Crear usuario'}</h3>
        <div className="mb-4 flex flex-wrap gap-3">
          <Campo label="UID (Firebase Auth)">
            <Input className="w-52" value={form.uid} onChange={(e) => setF('uid', e.target.value)} disabled={!!editId} placeholder="uid del usuario" />
          </Campo>
          <Campo label="Nombre">
            <Input className="w-52" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} />
          </Campo>
          <Campo label="Email">
            <Input className="w-52" value={form.email} onChange={(e) => setF('email', e.target.value)} />
          </Campo>
          <Campo label="Rol">
            <Select className="w-40" value={form.role} onChange={(e) => setF('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Campo>
        </div>

        <div className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Permisos {form.role === 'owner' ? '(el owner ve todo automáticamente)' : '(elige qué puede ver)'}:
        </div>
        <div className={`mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 ${form.role === 'owner' ? 'opacity-50' : ''}`}>
          {PERMISOS.map((p) => {
            const on = form.role === 'owner' ? true : form.permissions[p.key]
            return (
              <label
                key={p.key}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                onClick={() => form.role !== 'owner' && togglePermiso(p.key)}
              >
                <Switch on={on} />
                <span className="text-sm text-slate-700 dark:text-slate-200">{p.label}</span>
              </label>
            )
          })}
        </div>

        <Aviso tipo="info">
          Este usuario podrá ver: {seccionesPermitidas.length === 0 ? 'ninguna sección.' : seccionesPermitidas.map((s) => s.label).join(', ') + '.'}
        </Aviso>

        <div className="flex gap-2">
          <Boton onClick={guardar} disabled={guardando} variant="gold">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear usuario'}
          </Boton>
          {editId && <Boton onClick={nuevo} variant="ghost">Cancelar</Boton>}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Nota: el acceso en Firebase Auth (correo/contraseña) se crea aparte. Aquí se crea/edita el documento en la colección <code>users</code> con ese UID.
        </p>
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
          if (key === 'role') return <Badge color={row.role === 'owner' ? 'gold' : 'navy'}>{row.role}</Badge>
          if (key === 'permisos') {
            if (row.role === 'owner') return <Badge color="gold">Todo (owner)</Badge>
            const activos = PERMISOS.filter((p) => row.permissions?.[p.key])
            return activos.length ? (
              <div className="flex flex-wrap gap-1">
                {activos.map((p) => (
                  <Badge key={p.key}>{p.label}</Badge>
                ))}
              </div>
            ) : (
              <span className="text-slate-400">Sin permisos</span>
            )
          }
          if (key === 'acciones')
            return (
              <Boton variant="ghost" onClick={() => editar(row)} className="px-2.5 py-1 text-xs">
                Editar
              </Boton>
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

function Switch({ on }) {
  return (
    <span className={`relative inline-block h-5 w-9 flex-shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  )
}
