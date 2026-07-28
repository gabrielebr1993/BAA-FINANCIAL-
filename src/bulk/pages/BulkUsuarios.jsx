import { useState } from 'react'
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { eliminar, guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
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

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Usuarios y roles')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
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

      <Card className="p-4">
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'email', label: t('Correo') }, { key: 'rol', label: t('Rol') }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
          rows={usuarios.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((u) => ({ ...u, _key: u.id }))}
          emptyText={t('Sin usuarios.')}
          renderCell={(row, key) => {
            if (key === 'rol') return <Badge color={row.rol === BULK_ROLES.SUPER_ADMIN ? 'gold' : 'navy'}>{t(BULK_ROLES_LABEL[row.rol]) || row.rol}</Badge>
            if (key === 'estado') return <button onClick={() => toggle(row)}><Badge color={row.activo === false ? 'slate' : 'green'}>{row.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
            if (key === 'acciones') return row.rol === BULK_ROLES.SUPER_ADMIN ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><ShieldCheck size={13} /> {t('protegido')}</span> : <Boton variant="danger" onClick={() => borrar(row)} className="px-2.5 py-1 text-xs"><Trash2 size={13} /></Boton>
            return row[key]
          }}
        />
      </Card>
    </div>
  )
}
