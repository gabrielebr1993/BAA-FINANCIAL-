import { useState } from 'react'
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { Copy, Check, Building2, UserPlus } from 'lucide-react'
import { db, auth } from '../firebase'
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
  const [crearOwnerTambien, setCrearOwnerTambien] = useState(true)
  const [ownerNuevo, setOwnerNuevo] = useState({ nombre: '', email: '', password: '' })
  const [resumenAcceso, setResumenAcceso] = useState(null)
  const [copiado, setCopiado] = useState(false)
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
    if (crearOwnerTambien) {
      if (!ownerNuevo.nombre.trim() || !ownerNuevo.email.trim()) return setError('Completa nombre y email del dueño (o desmarca "crear también el usuario dueño").')
      if (String(ownerNuevo.password).length < 6) return setError('La contraseña del dueño debe tener al menos 6 caracteres.')
    }
    setCreando(true); setError(''); setOk(''); setResumenAcceso(null)
    try {
      const ref = await addDoc(collection(db, 'companies'), { nombre: nombre.trim(), activo: true, creadaEn: serverTimestamp() })
      await reloadCompanies()
      setActiveCompanyId(ref.id)
      if (crearOwnerTambien) {
        const permissions = {}
        PERMISOS.forEach((p) => (permissions[p.key] = true))
        const token = await auth.currentUser.getIdToken()
        const resp = await fetch('/api/crear-usuario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ nombre: ownerNuevo.nombre.trim(), email: ownerNuevo.email.trim(), password: ownerNuevo.password, role: 'owner', permissions, companyId: ref.id }),
        })
        const data = await resp.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor.' }))
        if (!resp.ok || !data.ok) {
          setError(`Empresa "${nombre.trim()}" creada, pero no se pudo crear el dueño: ${data.error || ''} Puedes crearlo abajo (modo manual con UID).`)
          setNombre('')
          return
        }
        setResumenAcceso({ empresa: nombre.trim(), email: ownerNuevo.email.trim(), password: ownerNuevo.password, link: window.location.origin })
        setOwnerNuevo({ nombre: '', email: '', password: '' })
      }
      setNombre('')
      setOk(crearOwnerTambien ? 'Empresa y usuario dueño creados.' : 'Empresa creada y activada.')
    } catch (e) {
      setError('Error al crear la empresa: ' + e.message)
    } finally {
      setCreando(false)
    }
  }

  const copiarAcceso = async () => {
    if (!resumenAcceso) return
    const txt = `Empresa creada. Acceso del cliente:\nCorreo: ${resumenAcceso.email}\nContraseña: ${resumenAcceso.password}\nLink: ${resumenAcceso.link}`
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* noop */ }
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
        <h3 className="m-0 mb-3 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Building2 size={18} strokeWidth={1.8} className="text-brand-gold" /> Crear empresa cliente</h3>
        <div className="mb-3">
          <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre de la empresa</div>
          <Input className="w-72" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. BAA Financial" />
        </div>

        <label className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={crearOwnerTambien} onChange={(e) => setCrearOwnerTambien(e.target.checked)} />
          <UserPlus size={15} strokeWidth={1.8} /> Crear también el usuario dueño (owner) de esta empresa
        </label>

        {crearOwnerTambien && (
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div><div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre del dueño</div><Input className="w-48" value={ownerNuevo.nombre} onChange={(e) => setOwnerNuevo((o) => ({ ...o, nombre: e.target.value }))} placeholder="Ej. Juan Pérez" /></div>
            <div><div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Email</div><Input className="w-56" type="email" value={ownerNuevo.email} onChange={(e) => setOwnerNuevo((o) => ({ ...o, email: e.target.value }))} placeholder="cliente@correo.com" /></div>
            <div><div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Contraseña (mín. 6)</div><Input className="w-44" value={ownerNuevo.password} onChange={(e) => setOwnerNuevo((o) => ({ ...o, password: e.target.value }))} placeholder="la que tú definas" /></div>
          </div>
        )}

        <Boton variant="gold" onClick={crearEmpresa} disabled={creando}>{creando ? 'Creando…' : crearOwnerTambien ? 'Crear empresa y dueño' : 'Crear empresa'}</Boton>
        <p className="mt-2 text-xs text-slate-400">El dueño se crea con acceso completo (Firebase Admin, sin UID manual) y solo verá su empresa. Requiere FIREBASE_SERVICE_ACCOUNT_BASE64 en el servidor.</p>
      </Card>

      {resumenAcceso && (
        <Card className="mb-4 border-2 border-emerald-400/60 p-4">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Check size={18} strokeWidth={2} className="text-emerald-500" /> Acceso del cliente — pásaselo</h3>
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div><span className="text-slate-400">Empresa:</span> <b className="text-brand-navy dark:text-slate-100">{resumenAcceso.empresa}</b></div>
            <div><span className="text-slate-400">Correo:</span> <b className="text-brand-navy dark:text-slate-100">{resumenAcceso.email}</b></div>
            <div><span className="text-slate-400">Contraseña:</span> <b className="text-brand-navy dark:text-slate-100">{resumenAcceso.password}</b></div>
            <div><span className="text-slate-400">Link:</span> <b className="text-brand-navy dark:text-slate-100">{resumenAcceso.link}</b></div>
          </div>
          <Boton variant={copiado ? 'success' : 'primary'} onClick={copiarAcceso} className="mt-3">
            {copiado ? <><Check size={16} strokeWidth={2} /> Copiado</> : <><Copy size={16} strokeWidth={1.8} /> Copiar datos de acceso</>}
          </Boton>
        </Card>
      )}

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
