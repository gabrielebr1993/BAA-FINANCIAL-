import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, query, where, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useData } from '../DataContext'
import { PERMISOS, ROLES, SECCIONES } from '../constants'
import { crearUsuarioApi } from '../utils/api'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select, Spinner } from '../components/ui'

function permisosVacios() {
  const o = {}
  PERMISOS.forEach((p) => (o[p.key] = false))
  return o
}
const formVacio = { uid: '', nombre: '', email: '', password: '', role: 'manager', permissions: permisosVacios() }

export default function Usuarios() {
  const { activeCompanyId, empresaActiva } = useData()
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(formVacio)
  const [editId, setEditId] = useState(null)
  const [modoManual, setModoManual] = useState(false) // respaldo: crear con UID manual
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    if (!activeCompanyId) { setUsuarios([]); return }
    const snap = await getDocs(query(collection(db, 'users'), where('companyId', '==', activeCompanyId)))
    setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, [activeCompanyId])
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
    if (!form.nombre.trim() || !form.email.trim()) return setError('Nombre y email son obligatorios.')
    if (!activeCompanyId) return setError('No hay una empresa activa. Selecciona una empresa primero.')
    setGuardando(true)
    try {
      if (editId) {
        // editar: solo actualiza el documento (permisos/rol), no toca Auth
        await updateDoc(doc(db, 'users', editId), { nombre: form.nombre.trim(), email: form.email.trim(), role: form.role, permissions: form.permissions, companyId: activeCompanyId })
        await cargar()
        setOk('Usuario actualizado.')
        nuevo()
      } else if (modoManual) {
        // respaldo: crear con UID manual (el acceso en Auth se crea aparte)
        if (!form.uid.trim()) return setError('Indica el UID de Firebase Auth del usuario.')
        await setDoc(doc(db, 'users', form.uid.trim()), { nombre: form.nombre.trim(), email: form.email.trim(), role: form.role, permissions: form.permissions, companyId: activeCompanyId })
        await cargar()
        setOk('Usuario creado (modo manual).')
        nuevo()
      } else {
        // flujo principal: crear Auth + documento vía función serverless
        if (String(form.password).length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
        const token = await auth.currentUser.getIdToken()
        const data = await crearUsuarioApi({ nombre: form.nombre.trim(), email: form.email.trim(), password: form.password, role: form.role, permissions: form.permissions, companyId: activeCompanyId }, token)
        if (!data.ok) {
          setError(data.error || 'No se pudo crear el usuario.')
          return
        }
        await cargar()
        setOk('Usuario creado con acceso (correo y contraseña).')
        nuevo()
      }
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const seccionesPermitidas = form.role === 'owner' ? SECCIONES : SECCIONES.filter((s) => form.permissions[s.permiso])

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Usuarios y Permisos</PageTitle>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar usuario' : 'Crear usuario'}</h3>
          {!editId && (
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={modoManual} onChange={(e) => setModoManual(e.target.checked)} />
              Modo manual (con UID, respaldo)
            </label>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <Campo label="Nombre">
            <Input className="w-52" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} />
          </Campo>
          <Campo label="Email">
            <Input className="w-52" type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} />
          </Campo>
          {!editId && !modoManual && (
            <Campo label="Contraseña (mín. 6)">
              <Input className="w-52" type="password" value={form.password} onChange={(e) => setF('password', e.target.value)} placeholder="••••••••" />
            </Campo>
          )}
          {!editId && modoManual && (
            <Campo label="UID (Firebase Auth)">
              <Input className="w-52" value={form.uid} onChange={(e) => setF('uid', e.target.value)} placeholder="uid del usuario" />
            </Campo>
          )}
          <Campo label="Rol">
            <Select className="w-40" value={form.role} onChange={(e) => setF('role', e.target.value)}>
              {ROLES.filter((r) => r !== 'driver').map((r) => (
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
            {guardando ? <><Spinner /> {editId ? 'Guardando…' : 'Creando…'}</> : editId ? 'Guardar cambios' : 'Crear usuario'}
          </Boton>
          {editId && <Boton onClick={nuevo} variant="ghost">Cancelar</Boton>}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {editId
            ? 'Editar solo cambia el rol y los permisos del usuario (no su contraseña).'
            : modoManual
              ? 'Modo manual: crea solo el documento en users con un UID ya existente en Firebase Auth (respaldo si el servidor no está configurado).'
              : 'El sistema crea el acceso completo (correo + contraseña en Firebase Auth) y su documento, sin cerrar tu sesión. Requiere FIREBASE_SERVICE_ACCOUNT_BASE64 configurado en el servidor.'}
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
