import { useState, useEffect, useCallback, useMemo } from 'react'
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
const formVacio = { uid: '', nombre: '', email: '', password: '', role: 'manager', driverId: '', ciudades: [], permissions: permisosVacios() }

export default function Usuarios() {
  const { activeCompanyId, empresaActiva, drivers, ciudadesEmpresa, invoices } = useData()
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(formVacio)
  const [editId, setEditId] = useState(null)
  const [filtroCiudadDriver, setFiltroCiudadDriver] = useState('') // filtro de ciudad para elegir chofer
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
  const toggleCiudad = (code) => setForm((f) => {
    const has = (f.ciudades || []).includes(code)
    return { ...f, ciudades: has ? f.ciudades.filter((c) => c !== code) : [...(f.ciudades || []), code] }
  })

  const nuevo = () => {
    setEditId(null)
    setForm(formVacio)
    setError('')
    setOk('')
  }
  const editar = (u) => {
    setEditId(u.id)
    setForm({ uid: u.id, nombre: u.nombre || '', email: u.email || '', role: u.role || 'manager', driverId: u.driverId || '', ciudades: (Array.isArray(u.ciudades) && u.ciudades.length) ? u.ciudades : (u.ciudad ? [u.ciudad] : []), permissions: { ...permisosVacios(), ...(u.permissions || {}) } })
    setError('')
    setOk('')
  }

  // Nombre del chofer vinculado (para rol driver).
  const driverNombreDe = (id) => drivers.find((d) => d.id === id)?.nombre || ''

  // Ciudad de cada chofer (por nombre): la ciudad donde tiene MÁS paquetes en las
  // facturas cargadas. Sirve para el filtro por ciudad al elegir el chofer.
  const ciudadDeDriverNombre = useMemo(() => {
    const acc = {} // nombre -> { ciudad -> paquetes }
    for (const inv of (invoices || [])) {
      for (const ch of (inv.resumenChoferes || [])) {
        if (!ch.ciudad) continue
        const pq = (ch.individuales || 0) + (ch.dobles || 0)
        acc[ch.nombre] = acc[ch.nombre] || {}
        acc[ch.nombre][ch.ciudad] = (acc[ch.nombre][ch.ciudad] || 0) + pq
      }
    }
    const out = {}
    for (const [nombre, m] of Object.entries(acc)) out[nombre] = Object.keys(m).sort((a, b) => m[b] - m[a])[0] || ''
    return out
  }, [invoices])

  // Choferes ordenados y filtrados por la ciudad elegida (si hay filtro).
  const driversFiltrados = useMemo(() => {
    const orden = [...drivers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    if (!filtroCiudadDriver) return orden
    return orden.filter((d) => ciudadDeDriverNombre[d.nombre] === filtroCiudadDriver)
  }, [drivers, filtroCiudadDriver, ciudadDeDriverNombre])

  const guardar = async () => {
    setError('')
    setOk('')
    if (!form.nombre.trim() || !form.email.trim()) return setError('Nombre y email son obligatorios.')
    if (!activeCompanyId) return setError('No hay una empresa activa. Selecciona una empresa primero.')
    const esDriver = form.role === 'driver'
    if (esDriver && !form.driverId) { setError('Elige a qué chofer se vincula este acceso.'); return }
    // Un driver no tiene permisos de gestión; sí queda vinculado a su chofer.
    const driverNombre = esDriver ? driverNombreDe(form.driverId) : ''
    const permisos = esDriver ? {} : form.permissions
    const extraDriver = esDriver ? { driverId: form.driverId, driverNombre, driverKey: driverNombre.toLowerCase() } : {}
    // Ciudades asignadas: solo para roles de gestión (manager/admin). [] = todas las
    // ciudades (sin restricción). El owner ve todo; el driver no aplica. Se guarda el
    // arreglo `ciudades` y `ciudad` = la primera (compatibilidad con lo anterior).
    const asignaCiudad = form.role !== 'owner' && form.role !== 'driver'
    const ciudadesAsignadas = asignaCiudad ? [...new Set((form.ciudades || []).filter(Boolean))] : []
    const campoCiudades = { ciudades: ciudadesAsignadas, ciudad: ciudadesAsignadas[0] || '' }
    setGuardando(true)
    try {
      if (editId) {
        // editar: solo actualiza el documento (permisos/rol), no toca Auth
        await updateDoc(doc(db, 'users', editId), { nombre: form.nombre.trim(), email: form.email.trim(), role: form.role, permissions: permisos, companyId: activeCompanyId, ...campoCiudades, ...extraDriver })
        await cargar()
        setOk('Usuario actualizado.')
        nuevo()
      } else if (modoManual) {
        // respaldo: crear con UID manual (el acceso en Auth se crea aparte)
        if (!form.uid.trim()) return setError('Indica el UID de Firebase Auth del usuario.')
        await setDoc(doc(db, 'users', form.uid.trim()), { nombre: form.nombre.trim(), email: form.email.trim(), role: form.role, permissions: permisos, companyId: activeCompanyId, ...campoCiudades, ...extraDriver })
        await cargar()
        setOk('Usuario creado (modo manual).')
        nuevo()
      } else {
        // flujo principal: crear Auth + documento vía función serverless
        if (String(form.password).length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
        const token = await auth.currentUser.getIdToken()
        const data = await crearUsuarioApi({ nombre: form.nombre.trim(), email: form.email.trim(), password: form.password, role: form.role, permissions: permisos, companyId: activeCompanyId, ciudades: ciudadesAsignadas, ...(esDriver ? { driverId: form.driverId, driverNombre } : {}) }, token)
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
              {ROLES.map((r) => (
                <option key={r} value={r}>{r === 'driver' ? 'driver (chofer)' : r}</option>
              ))}
            </Select>
          </Campo>
          {form.role === 'driver' && (
            <>
              <Campo label="Filtrar por ciudad">
                <Select className="w-44" value={filtroCiudadDriver} onChange={(e) => setFiltroCiudadDriver(e.target.value)}>
                  <option value="">Todas las ciudades</option>
                  {[...(ciudadesEmpresa || [])].filter((c) => c.codigo).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((c) => (
                    <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Chofer vinculado">
                <Select className="w-56" value={form.driverId} onChange={(e) => setF('driverId', e.target.value)}>
                  <option value="">— Elige el chofer —</option>
                  {driversFiltrados.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}{ciudadDeDriverNombre[d.nombre] ? ` · ${ciudadDeDriverNombre[d.nombre]}` : ''}</option>
                  ))}
                </Select>
              </Campo>
            </>
          )}
          {form.role !== 'owner' && form.role !== 'driver' && (
            <Campo label="Ciudades asignadas">
              <div className="flex max-w-[520px] flex-wrap gap-1.5">
                {[...(ciudadesEmpresa || [])].filter((c) => c.codigo).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((c) => {
                  const on = (form.ciudades || []).includes(c.codigo)
                  return (
                    <button type="button" key={c.codigo} onClick={() => toggleCiudad(c.codigo)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? 'border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {on ? '✓ ' : ''}{c.nombre}
                    </button>
                  )
                })}
                {(ciudadesEmpresa || []).filter((c) => c.codigo).length === 0 && (
                  <span className="text-xs text-slate-400">No hay ciudades configuradas. Ve a Configuración → Mis ciudades.</span>
                )}
              </div>
            </Campo>
          )}
        </div>
        {form.role !== 'owner' && form.role !== 'driver' && (
          <p className="-mt-2 mb-4 text-xs text-slate-400">
            Elige <b>una o más ciudades</b>: este usuario <b>solo verá los datos de esas ciudades</b> (según sus permisos) y podrá alternar entre ellas. <b>Sin ninguna seleccionada</b> = ve <b>todas</b> las ciudades.
          </p>
        )}

        {form.role === 'driver' ? (
          <Aviso tipo="info">
            Acceso de <b>chofer</b>: solo verá su portal (sus pagos, entregas, claims y calificación){form.driverId ? <> vinculado a <b>{driverNombreDe(form.driverId)}</b></> : ''}. No ve finanzas ni a otros choferes ni el menú de gestión.
          </Aviso>
        ) : (
          <>
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
          </>
        )}

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
          { key: 'ciudades', label: 'Ciudades' },
          { key: 'permisos', label: 'Permisos', wrap: true },
          { key: 'acciones', label: '', align: 'right' },
        ]}
        rows={usuarios.map((u) => ({ ...u, _key: u.id }))}
        emptyText="No hay usuarios registrados."
        renderCell={(row, key) => {
          if (key === 'role') return <Badge color={row.role === 'owner' ? 'gold' : 'navy'}>{row.role}</Badge>
          if (key === 'ciudades') {
            if (row.role === 'owner' || row.role === 'driver') return <span className="text-slate-400">—</span>
            const cs = (Array.isArray(row.ciudades) && row.ciudades.length) ? row.ciudades : (row.ciudad ? [row.ciudad] : [])
            if (!cs.length) return <span className="text-slate-400">Todas</span>
            const nom = (code) => (ciudadesEmpresa || []).find((c) => c.codigo === code)?.nombre || code
            return <div className="flex flex-wrap gap-1">{cs.map((c) => <Badge key={c}>{nom(c)}</Badge>)}</div>
          }
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
