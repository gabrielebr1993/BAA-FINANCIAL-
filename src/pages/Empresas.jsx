import { useState } from 'react'
import { collection, addDoc, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { Copy, Check, Building2, UserPlus, Eye, EyeOff, Trash2, AlertTriangle } from 'lucide-react'
import { db, auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { PERMISOS } from '../constants'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select } from '../components/ui'
import { borrarRefsEnLotes } from '../utils/borrado'
import { crearUsuarioApi } from '../utils/api'

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
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false)
  const [porEliminar, setPorEliminar] = useState(null)
  const [confirmNombre, setConfirmNombre] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [progreso, setProgreso] = useState(null) // { hechos, total } durante el borrado
  const [borrarUsuarios, setBorrarUsuarios] = useState(false)

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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerNuevo.email.trim())) return setError('El email del dueño no es válido. Escribe un correo real, por ejemplo nombre@dominio.com.')
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
        const data = await crearUsuarioApi({ nombre: ownerNuevo.nombre.trim(), email: ownerNuevo.email.trim(), password: ownerNuevo.password, role: 'owner', permissions, companyId: ref.id }, token)
        if (!data.ok) {
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

  // Colecciones de DATOS reales de una empresa (todas con companyId). Solo las que
  // la app escribe; NO incluye `users` (opcional aparte) ni colecciones fantasma
  // (que solo generaban consultas denegadas y ralentizaban el borrado).
  const COLECCIONES_DATOS = ['invoices', 'drivers', 'claims', 'payroll', 'managers', 'alertEstados', 'driverStats']

  // Envuelve una promesa con un tope de tiempo: si algo (consulta o borrado) se
  // queda colgado, RECHAZA en vez de dejar el "Eliminando…" pegado para siempre.
  const conTimeout = (promesa, ms, etiqueta) =>
    Promise.race([
      Promise.resolve(promesa),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Tiempo de espera agotado en ${etiqueta} (${Math.round(ms / 1000)}s). Revisa tu conexión o las reglas de Firestore.`)), ms)),
    ])

  // Devuelve las refs de una colección de esa empresa (acotada por companyId).
  // Si falla (colección inexistente, permisos), avisa y sigue con [].
  const refsDeColeccion = async (col, cid) => {
    try {
      const snap = await conTimeout(getDocs(query(collection(db, col), where('companyId', '==', cid))), 30000, `leer ${col}`)
      return snap.docs.map((d) => d.ref)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[MilePay] ${col}: no se pudo leer (${e.message})`)
      return []
    }
  }

  // Refs de usuarios de la empresa (opcional). NUNCA incluye súper-admin ni a ti.
  const refsUsuarios = async (cid) => {
    const snap = await conTimeout(getDocs(query(collection(db, 'users'), where('companyId', '==', cid))), 30000, 'leer usuarios')
    return snap.docs.filter((d) => d.data().superAdmin !== true && d.id !== auth.currentUser?.uid).map((d) => d.ref)
  }

  // Elimina una empresa concreta (por su ID) y TODOS sus datos por companyId.
  // RÁPIDO: lee todas las colecciones EN PARALELO, junta las refs y las borra en
  // lotes de 450 ejecutados en paralelo por olas (segundos, no minutos). Blindado
  // contra cuelgues (timeouts) y el finally SIEMPRE apaga "Eliminando…".
  const eliminarEmpresa = async () => {
    if (!porEliminar) return
    const cid = porEliminar.id
    const nombreBorrado = porEliminar.nombre
    setEliminando(true); setError(''); setOk(''); setProgreso({ hechos: 0, total: 0 })
    try {
      // eslint-disable-next-line no-console
      console.log(`[MilePay] Eliminando empresa "${nombreBorrado}" (id: ${cid})…`)
      // 1) Reunir refs de TODAS las colecciones de datos en paralelo.
      const grupos = await Promise.all(COLECCIONES_DATOS.map((c) => refsDeColeccion(c, cid)))
      let refs = grupos.flat()
      if (borrarUsuarios) {
        const u = await refsUsuarios(cid).catch((e) => { console.warn('[MilePay] users:', e.message); return [] })
        refs = refs.concat(u)
      }
      // 2) Borrar todo en lotes paralelos con progreso.
      const total = await borrarRefsEnLotes(refs, (hechos, t) => setProgreso({ hechos, total: t }))
      // 3) settings (doc id = cid) y el propio doc de la empresa.
      await conTimeout(deleteDoc(doc(db, 'settings', cid)).catch(() => {}), 15000, 'ajustes')
      await conTimeout(deleteDoc(doc(db, 'companies', cid)), 15000, 'empresa')
      // eslint-disable-next-line no-console
      console.log(`[MilePay] Empresa "${nombreBorrado}" eliminada. Docs de datos borrados: ${total}`)
      const restantes = await conTimeout(reloadCompanies(), 15000, 'refrescar lista').catch(() => null)
      if (activeCompanyId === cid) setActiveCompanyId(restantes && restantes[0] ? restantes[0].id : null)
      setPorEliminar(null); setConfirmNombre(''); setBorrarUsuarios(false)
      setOk(`Empresa "${nombreBorrado}" eliminada (${total} registro(s) de datos borrados).`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[MilePay] Error al eliminar empresa:', e)
      setError(`No se pudo eliminar: ${e.message}`)
    } finally {
      setEliminando(false) // pase lo que pase, nunca se queda en "Eliminando…"
      setProgreso(null)
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
            if (key === 'nombre') return <span>{row.nombre} <span className="ml-1 font-mono text-[11px] text-slate-400">{String(row.id).slice(0, 6)}…</span></span>
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
                  <Boton variant="danger" onClick={() => { setPorEliminar(row); setConfirmNombre(''); setBorrarUsuarios(false) }} className="px-2.5 py-1 text-xs"><Trash2 size={13} strokeWidth={1.8} /> Eliminar</Boton>
                </div>
              )
            return row[key]
          }}
        />
      </Card>

      {/* Método avanzado (con UID) — oculto por defecto para no confundir. */}
      <Card className="p-4">
        <button onClick={() => setMostrarAvanzado((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-500 hover:text-brand-navy dark:text-slate-400 dark:hover:text-slate-200">
          {mostrarAvanzado ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
          Método avanzado (crear owner con UID de Firebase)
          <span className="text-xs text-slate-400">— {mostrarAvanzado ? 'ocultar' : 'mostrar solo si lo necesitas'}</span>
        </button>
        {mostrarAvanzado && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700/60">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Usa la forma de arriba (email + contraseña, sin UID) para crear empresas y dueños. Este método solo es un respaldo:
              crea el documento del usuario owner con un UID ya existente en Firebase Auth (el acceso se crea aparte en la consola de Firebase).
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
              <Boton variant="ghost" onClick={crearOwner} disabled={guardandoOwner}>{guardandoOwner ? 'Creando…' : 'Crear owner (avanzado)'}</Boton>
            </div>
          </div>
        )}
      </Card>

      {/* Confirmación de borrado de empresa (escribiendo su nombre) */}
      {porEliminar && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={() => !eliminando && setPorEliminar(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 flex items-center gap-2 text-lg font-bold text-rose-600 dark:text-rose-400"><AlertTriangle size={20} strokeWidth={1.8} /> Eliminar empresa</h3>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              Vas a borrar <b>{porEliminar.nombre}</b> y <b>todos sus datos</b> (facturas, choferes, claims, pagos, managers, ajustes). Esta acción no se puede deshacer.
            </p>
            <p className="mb-3 text-xs text-slate-400">ID: <span className="font-mono">{porEliminar.id}</span> — se borra exactamente esta (útil si hay nombres duplicados).</p>
            <label className="mb-3 flex items-start gap-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              <input type="checkbox" checked={borrarUsuarios} onChange={(e) => setBorrarUsuarios(e.target.checked)} className="mt-0.5" />
              <span>También eliminar los usuarios de esta empresa (nunca borra súper-admins ni tu propio usuario). Si lo dejas sin marcar, los usuarios se conservan.</span>
            </label>
            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Para confirmar, escribe el nombre exacto de la empresa:</div>
              <Input className="w-full" value={confirmNombre} onChange={(e) => setConfirmNombre(e.target.value)} placeholder={porEliminar.nombre} />
            </div>
            {eliminando && progreso && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Eliminando datos…</span>
                  <span>{progreso.hechos} de {progreso.total || '—'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-gold transition-all duration-200" style={{ width: `${progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 5}%` }} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setPorEliminar(null)} disabled={eliminando}>Cancelar</Boton>
              <Boton variant="danger" onClick={eliminarEmpresa} disabled={eliminando || confirmNombre.trim() !== porEliminar.nombre.trim()}>
                {eliminando ? 'Eliminando…' : <><Trash2 size={15} strokeWidth={1.8} /> Eliminar definitivamente</>}
              </Boton>
            </div>
          </Card>
        </div>
      )}
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
