import { useState } from 'react'
import { UserPlus, Trash2, ShieldCheck, Search, X, KeyRound, LogOut, Power } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { eliminar, guardar } from '../data/repo'
import { authBulk } from '../firebaseBulk'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { cerrarTodos, cerrarPorRol, cerrarUsuario } from '../data/sesiones'
import { BULK_ROLES, BULK_ROLES_LABEL } from '../domain/constants'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, Tabla } from '../../components/ui'
import { useLang } from '../../i18n'

const ROLES_ASIGNABLES = [
  BULK_ROLES.ADMIN, BULK_ROLES.DISPATCHER, BULK_ROLES.CLIENTE,
  BULK_ROLES.TRANSPORTISTA, BULK_ROLES.CHOFER, BULK_ROLES.SUPERVISOR_PLANTA,
]

export default function BulkUsuarios() {
  const { t } = useLang()
  const { tenantId, usuario, rol, crearUsuario } = useBulkAuth()
  const { datos: usuarios, cargando } = useColeccion('users')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: BULK_ROLES.DISPATCHER, vinculo: '' })
  const [msg, setMsg] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [alta, setAlta] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const necesitaCliente = f.rol === BULK_ROLES.CLIENTE
  const necesitaCarrier = f.rol === BULK_ROLES.TRANSPORTISTA || f.rol === BULK_ROLES.CHOFER

  const agregar = async () => {
    setMsg(null)
    const email = f.email.trim().toLowerCase()
    if (!f.nombre.trim() || !email || !f.password) { setMsg({ tipo: 'warn', txt: t('Completa nombre, correo y contraseña.') }); return }
    if (usuarios.some((u) => (u.email || '').toLowerCase() === email)) { setMsg({ tipo: 'error', txt: t('Ese correo ya existe.') }); return }
    if (necesitaCliente && !f.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona el cliente al que pertenece.') }); return }
    if (necesitaCarrier && !f.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona el transportista al que pertenece.') }); return }
    try {
      await crearUsuario({
        nombre: f.nombre.trim(), email, password: f.password, rol: f.rol,
        clienteId: necesitaCliente ? f.vinculo : undefined,
        carrierId: necesitaCarrier ? f.vinculo : undefined,
      })
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear_usuario', entidad: 'usuario', detalle: `${email} (${f.rol})` })
      setF({ nombre: '', email: '', password: '', rol: BULK_ROLES.DISPATCHER, vinculo: '' })
      setMsg({ tipo: 'ok', txt: t('Usuario creado.') })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudo crear (¿backend desplegado?).') }) }
  }
  const borrar = async (u) => {
    if (u.rol === BULK_ROLES.SUPER_ADMIN) return
    if (!window.confirm(`${t('¿Eliminar a')} ${u.email}?`)) return
    await eliminar('users', u.id)
  }
  const toggle = async (u) => { if (u.rol !== BULK_ROLES.SUPER_ADMIN) await guardar('users', u.id, { activo: u.activo === false }) }
  // Admin fija una nueva contraseña a un usuario (vía endpoint con Admin SDK).
  const cambiarClave = async (u) => {
    setMsg(null)
    const nueva = window.prompt(`${t('Nueva contraseña para')} ${u.email}:`)
    if (nueva == null) return
    if (String(nueva).length < 6) { setMsg({ tipo: 'error', txt: t('La contraseña debe tener al menos 6 caracteres.') }); return }
    try {
      const token = await authBulk.currentUser.getIdToken()
      const r = await fetch('/api/cambiar-clave', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: u.email, password: nueva }) })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || 'Error')
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cambiar_clave', entidad: 'usuario', detalle: u.email })
      setMsg({ tipo: 'ok', txt: `${t('Contraseña actualizada para')} ${u.email}.` })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudo cambiar la contraseña (¿backend desplegado?).') }) }
  }

  // ── Cierre de sesión forzado (a todos / por rol / a un usuario) ──────────
  const forzarTodos = async () => {
    if (!window.confirm(t('¿Cerrar la sesión de TODOS los usuarios? Tendrán que volver a iniciar sesión.'))) return
    await cerrarTodos(tenantId)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'todos', detalle: 'todos' })
    setMsg({ tipo: 'ok', txt: t('Se cerró la sesión de todos los usuarios.') })
  }
  const forzarRol = async (r) => {
    if (!window.confirm(`${t('¿Cerrar la sesión de todos los usuarios con el rol')} "${t(BULK_ROLES_LABEL[r])}"?`)) return
    await cerrarPorRol(tenantId, r)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'rol', detalle: r })
    setMsg({ tipo: 'ok', txt: `${t('Se cerró la sesión del rol')} ${t(BULK_ROLES_LABEL[r])}.` })
  }
  const forzarUsuario = async (u) => {
    if (!window.confirm(`${t('¿Cerrar la sesión de')} ${u.email}?`)) return
    await cerrarUsuario(tenantId, u.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'usuario', detalle: u.email })
    setMsg({ tipo: 'ok', txt: `${t('Se cerró la sesión de')} ${u.email}.` })
  }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Usuarios y roles')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar usuario…')} className="w-64 pl-8" />
        </div>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)} className="ml-auto">{alta ? <><X size={16} /> {t('Cerrar')}</> : <><UserPlus size={16} /> {t('Nuevo usuario')}</>}</Boton>
      </div>

      {alta && (
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo usuario')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
          <Input type="email" placeholder={t('Correo')} value={f.email} onChange={set('email')} />
          <Input type="password" placeholder={t('Contraseña')} value={f.password} onChange={set('password')} />
          <Select value={f.rol} onChange={(e) => setF((s) => ({ ...s, rol: e.target.value, vinculo: '' }))}>
            {ROLES_ASIGNABLES.map((r) => <option key={r} value={r}>{t(BULK_ROLES_LABEL[r])}</option>)}
          </Select>
        </div>
        {(necesitaCliente || necesitaCarrier) && (
          <div className="mt-3 max-w-xs">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{necesitaCliente ? t('Cliente al que pertenece') : t('Transportista al que pertenece')}</div>
            <Select value={f.vinculo} onChange={set('vinculo')}>
              <option value="">{t('— Seleccionar —')}</option>
              {(necesitaCliente ? clientes : carriers).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </Select>
          </div>
        )}
        <div className="mt-3"><Boton variant="gold" onClick={agregar}><UserPlus size={16} /> {t('Crear usuario')}</Boton></div>
      </Card>
      )}

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Power size={16} className="text-brand-gold" />
          <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Cerrar sesiones')}</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('Obliga a los usuarios a volver a iniciar sesión. Útil tras un cambio de contraseña o por seguridad.')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Boton variant="danger" onClick={forzarTodos}><Power size={15} /> {t('Cerrar sesión a TODOS')}</Boton>
          <span className="mx-1 text-xs font-semibold uppercase text-slate-400">{t('por rol')}:</span>
          {ROLES_ASIGNABLES.map((r) => (
            <Boton key={r} variant="ghost" onClick={() => forzarRol(r)} className="px-3 py-1 text-xs">{t(BULK_ROLES_LABEL[r])}</Boton>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'email', label: t('Correo') }, { key: 'rol', label: t('Rol') }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
          rows={usuarios
            .filter((u) => { const s = buscar.trim().toLowerCase(); return !s || (u.nombre || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s) || (t(BULK_ROLES_LABEL[u.rol]) || u.rol || '').toLowerCase().includes(s) })
            .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((u) => ({ ...u, _key: u.id }))}
          emptyText={t('Sin usuarios.')}
          renderCell={(row, key) => {
            if (key === 'rol') return <Badge color={row.rol === BULK_ROLES.SUPER_ADMIN ? 'gold' : 'navy'}>{t(BULK_ROLES_LABEL[row.rol]) || row.rol}</Badge>
            if (key === 'estado') return <button onClick={() => toggle(row)}><Badge color={row.activo === false ? 'slate' : 'green'}>{row.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
            if (key === 'acciones') return (
              <div className="flex justify-end gap-1.5">
                <Boton variant="ghost" onClick={() => forzarUsuario(row)} className="px-2.5 py-1 text-xs" title={t('Cerrar sesión de este usuario')}><LogOut size={13} /></Boton>
                <Boton variant="ghost" onClick={() => cambiarClave(row)} className="px-2.5 py-1 text-xs" title={t('Cambiar contraseña')}><KeyRound size={13} /></Boton>
                {row.rol === BULK_ROLES.SUPER_ADMIN ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><ShieldCheck size={13} /> {t('protegido')}</span> : <Boton variant="danger" onClick={() => borrar(row)} className="px-2.5 py-1 text-xs"><Trash2 size={13} /></Boton>}
              </div>
            )
            return row[key]
          }}
        />
      </Card>
    </div>
  )
}
