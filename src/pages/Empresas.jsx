import { useState } from 'react'
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { PERMISOS } from '../constants'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select } from '../components/ui'

export default function Empresas() {
  const { esSuperAdmin } = useAuth()
  const { companies, activeCompanyId, setActiveCompanyId, reloadCompanies } = useData()
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [ownerForm, setOwnerForm] = useState({ uid: '', nombre: '', email: '', companyId: '' })
  const [guardandoOwner, setGuardandoOwner] = useState(false)

  if (!esSuperAdmin) {
    return (
      <div>
        <PageTitle>Empresas</PageTitle>
        <Aviso tipo="error">Esta sección es solo para súper-administradores.</Aviso>
      </div>
    )
  }

  const crearEmpresa = async () => {
    if (!nombre.trim()) return setError('Escribe el nombre de la empresa.')
    setCreando(true)
    setError('')
    setOk('')
    try {
      const ref = await addDoc(collection(db, 'companies'), { nombre: nombre.trim(), activo: true, creadaEn: serverTimestamp() })
      await reloadCompanies()
      setActiveCompanyId(ref.id)
      setNombre('')
      setOk('Empresa creada y activada.')
    } catch (e) {
      setError('Error al crear la empresa: ' + e.message)
    } finally {
      setCreando(false)
    }
  }

  const toggleActivo = async (c) => {
    await updateDoc(doc(db, 'companies', c.id), { activo: !(c.activo !== false) })
    await reloadCompanies()
  }

  const crearOwner = async () => {
    setError('')
    setOk('')
    const cid = ownerForm.companyId || activeCompanyId
    if (!cid) return setError('Elige una empresa para el owner.')
    if (!ownerForm.uid.trim() || !ownerForm.nombre.trim() || !ownerForm.email.trim()) return setError('UID, nombre y email del owner son obligatorios.')
    setGuardandoOwner(true)
    try {
      const permissions = {}
      PERMISOS.forEach((p) => (permissions[p.key] = true))
      await setDoc(doc(db, 'users', ownerForm.uid.trim()), {
        nombre: ownerForm.nombre.trim(),
        email: ownerForm.email.trim(),
        role: 'owner',
        permissions,
        companyId: cid,
        superAdmin: false,
      })
      setOwnerForm({ uid: '', nombre: '', email: '', companyId: '' })
      setOk('Owner creado para la empresa.')
    } catch (e) {
      setError('Error al crear el owner: ' + e.message)
    } finally {
      setGuardandoOwner(false)
    }
  }

  return (
    <div>
      <PageTitle>Empresas (súper-admin)</PageTitle>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Crear empresa</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre de la empresa</div>
            <Input className="w-64" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Gofo / BAA Financial" />
          </div>
          <Boton variant="gold" onClick={crearEmpresa} disabled={creando}>{creando ? 'Creando…' : 'Crear empresa'}</Boton>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Empresas registradas ({companies.length})</h3>
        <Tabla
          columns={[
            { key: 'nombre', label: 'Empresa' },
            { key: 'activo', label: 'Estado', align: 'center' },
            { key: 'activa', label: 'Activa ahora', align: 'center' },
            { key: 'acciones', label: '', align: 'right' },
          ]}
          rows={companies.map((c) => ({ ...c, _key: c.id }))}
          emptyText="Aún no hay empresas. Crea la primera arriba."
          renderCell={(row, key) => {
            if (key === 'activo') return row.activo !== false ? <Badge color="green">Activa</Badge> : <Badge color="slate">Inactiva</Badge>
            if (key === 'activa') return row.id === activeCompanyId ? <Badge color="gold">● En uso</Badge> : ''
            if (key === 'acciones')
              return (
                <div className="flex justify-end gap-2">
                  <Boton variant={row.id === activeCompanyId ? 'ghost' : 'primary'} onClick={() => setActiveCompanyId(row.id)} className="px-2.5 py-1 text-xs" disabled={row.id === activeCompanyId}>
                    {row.id === activeCompanyId ? 'En uso' : 'Usar esta'}
                  </Boton>
                  <Boton variant="ghost" onClick={() => toggleActivo(row)} className="px-2.5 py-1 text-xs">
                    {row.activo !== false ? 'Desactivar' : 'Activar'}
                  </Boton>
                </div>
              )
            return row[key]
          }}
        />
      </Card>

      <Card className="p-4">
        <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Crear owner de una empresa</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          El acceso en Firebase Auth (correo/contraseña) se crea aparte (en la consola de Firebase). Aquí se crea el documento del usuario owner con su UID y se le asigna la empresa; luego ese owner gestiona sus propios usuarios.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Empresa">
            <Select className="w-52" value={ownerForm.companyId || activeCompanyId || ''} onChange={(e) => setOwnerForm((f) => ({ ...f, companyId: e.target.value }))}>
              <option value="">— Elegir —</option>
              {companies.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </Select>
          </Campo>
          <Campo label="UID (Firebase Auth)"><Input className="w-52" value={ownerForm.uid} onChange={(e) => setOwnerForm((f) => ({ ...f, uid: e.target.value }))} /></Campo>
          <Campo label="Nombre"><Input className="w-44" value={ownerForm.nombre} onChange={(e) => setOwnerForm((f) => ({ ...f, nombre: e.target.value }))} /></Campo>
          <Campo label="Email"><Input className="w-52" value={ownerForm.email} onChange={(e) => setOwnerForm((f) => ({ ...f, email: e.target.value }))} /></Campo>
          <Boton variant="gold" onClick={crearOwner} disabled={guardandoOwner}>{guardandoOwner ? 'Creando…' : 'Crear owner'}</Boton>
        </div>
      </Card>
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
