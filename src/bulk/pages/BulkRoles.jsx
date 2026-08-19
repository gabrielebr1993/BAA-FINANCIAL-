// ============================================================================
// BULK · Roles y permisos (RBAC configurable)
// El admin decide, por rol, qué módulos/acciones e información financiera se
// autorizan. Se guarda por tenant en bulk_roles/{tenantId} = { roles: {...} }.
// Mientras un rol no se personalice, rige su PRESET (comportamiento actual).
//
// SEGURIDAD: esta pantalla configura la capa de aplicación. El aislamiento
// financiero DURO de la cadena (cliente/transportista/chofer solo ven su propio
// pago) lo imponen las reglas de Firestore sobre bulk_orderPay_*. Un permiso aquí
// nunca puede otorgar una lectura que las reglas no permitan.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Save, RotateCcw, Lock, DollarSign, Info, Check, Plus, X, Trash2 } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { crearConId } from '../data/repo'
import { auditar } from '../data/auditoria'
import { BULK_ROLES, BULK_ROLES_LABEL } from '../domain/constants'
import {
  MODULOS, FIN_PERMISOS, ACCION_LABEL, permKey,
  permisosDeRol, PRESET_ROLES, ROLES_TOTALES,
  rolesPersonalizados, etiquetaRol, slugRol,
} from '../domain/permisos'
import { PageTitle, Card, Boton, Badge, Aviso, Input } from '../../components/ui'
import { useLang } from '../../i18n'

// Roles que el admin puede personalizar (super_admin siempre tiene acceso total).
const ROLES_EDITABLES = [
  BULK_ROLES.ADMIN, BULK_ROLES.DISPATCHER, BULK_ROLES.CLIENTE,
  BULK_ROLES.TRANSPORTISTA, BULK_ROLES.CHOFER, BULK_ROLES.SUPERVISOR_PLANTA,
]

// Casilla de permiso reutilizable.
function Casilla({ activo, onClick, children, peligro }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
        activo
          ? peligro
            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
      }`}
    >
      <span className={`grid h-3.5 w-3.5 place-items-center rounded ${activo ? (peligro ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white') : 'border border-slate-300 dark:border-slate-600'}`}>
        {activo && <Check size={10} strokeWidth={3} />}
      </span>
      {children}
    </button>
  )
}

export default function BulkRoles() {
  const { t } = useLang()
  const { tenantId, usuario, rol, rolesConfig } = useBulkAuth()
  const [selRol, setSelRol] = useState(BULK_ROLES.DISPATCHER)
  const [draft, setDraft] = useState(() => new Set())
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)

  // Roles personalizados creados por el admin (además de los built-in editables).
  const personalizados = useMemo(() => rolesPersonalizados(rolesConfig), [rolesConfig])
  const esCustom = personalizados.includes(selRol)
  const bloqueado = ROLES_TOTALES.has(selRol) // super_admin: no editable

  // (Re)inicializa el borrador cuando cambia el rol seleccionado o llega config nueva.
  useEffect(() => {
    setDraft(new Set(permisosDeRol(selRol, rolesConfig)))
    setDirty(false)
  }, [selRol, rolesConfig])

  const tiene = (clave) => draft.has(clave)
  const alternar = (clave) => {
    if (bloqueado) return
    setDraft((prev) => {
      const s = new Set(prev)
      s.has(clave) ? s.delete(clave) : s.add(clave)
      return s
    })
    setDirty(true)
  }
  // Marca/desmarca TODAS las acciones de un módulo.
  const alternarModulo = (mod, activar) => {
    if (bloqueado) return
    setDraft((prev) => {
      const s = new Set(prev)
      mod.acciones.forEach((a) => { const k = permKey(mod.key, a); activar ? s.add(k) : s.delete(k) })
      return s
    })
    setDirty(true)
  }

  const restablecer = () => {
    setDraft(new Set(PRESET_ROLES[selRol] || []))
    setDirty(true)
    setMsg({ tipo: 'info', txt: t('Se cargó el preset por defecto de este rol. Recuerda guardar.') })
  }

  const guardar = async () => {
    if (bloqueado || !tenantId) return
    setGuardando(true)
    try {
      // Conserva nombre/custom de un rol personalizado al guardar sus permisos.
      const roles = { ...(rolesConfig || {}), [selRol]: { ...(rolesConfig?.[selRol] || {}), permisos: [...draft] } }
      await crearConId('roles', tenantId, tenantId, { roles })
      await auditar(tenantId, {
        usuario: usuario?.nombre || usuario?.email, rol,
        accion: 'permisos_rol_actualizados', entidad: 'role', entidadId: selRol,
        detalle: `${BULK_ROLES_LABEL[selRol] || selRol}: ${draft.size} permisos`,
        cambios: { rol: selRol, permisos: [...draft] },
      })
      setDirty(false)
      setMsg({ tipo: 'ok', txt: t('Permisos guardados. Los usuarios de este rol ya reflejan el cambio.') })
    } catch (e) {
      setMsg({ tipo: 'error', txt: (e?.message || t('No se pudo guardar.')) })
    } finally { setGuardando(false) }
  }

  // Crear un ROL NUEVO (personalizado). Clave segura con prefijo rol_ (sin colisión).
  const crearRol = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre || !tenantId) return
    const key = slugRol(nombre)
    if (!key) { setMsg({ tipo: 'error', txt: t('Nombre no válido.') }); return }
    if ((key in BULK_ROLES_LABEL) || rolesConfig?.[key]) { setMsg({ tipo: 'error', txt: t('Ya existe un rol con ese nombre.') }); return }
    setGuardando(true)
    try {
      const roles = { ...(rolesConfig || {}), [key]: { nombre, custom: true, permisos: [] } }
      await crearConId('roles', tenantId, tenantId, { roles })
      await auditar(tenantId, { usuario: usuario?.nombre || usuario?.email, rol, accion: 'rol_creado', entidad: 'role', entidadId: key, detalle: nombre })
      setNuevoNombre(''); setCreando(false); setSelRol(key)
      setMsg({ tipo: 'ok', txt: t('Rol creado. Marca sus permisos y ya puedes asignarlo a usuarios.') })
    } catch (e) { setMsg({ tipo: 'error', txt: e?.message || t('No se pudo crear el rol.') }) }
    finally { setGuardando(false) }
  }

  // Eliminar un rol personalizado (los usuarios con ese rol quedan sin permisos hasta
  // reasignarlos; por eso conviene mover primero a esos usuarios).
  const eliminarRol = async () => {
    if (!esCustom || !tenantId) return
    if (!window.confirm(t('¿Eliminar este rol? Los usuarios que lo tengan se quedarán sin permisos hasta que les asignes otro rol.'))) return
    setGuardando(true)
    try {
      const roles = { ...(rolesConfig || {}) }
      delete roles[selRol]
      await crearConId('roles', tenantId, tenantId, { roles })
      await auditar(tenantId, { usuario: usuario?.nombre || usuario?.email, rol, accion: 'rol_eliminado', entidad: 'role', entidadId: selRol })
      setSelRol(BULK_ROLES.DISPATCHER)
      setMsg({ tipo: 'ok', txt: t('Rol eliminado.') })
    } catch (e) { setMsg({ tipo: 'error', txt: e?.message || t('No se pudo eliminar.') }) }
    finally { setGuardando(false) }
  }

  const totalPerms = draft.size
  const personalizado = !!rolesConfig?.[selRol] // ¿este rol ya tiene config guardada?

  return (
    <div>
      <PageTitle>{t('Roles y permisos')}</PageTitle>

      <Aviso tipo="info" className="mb-4">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            {t('Define qué puede ver y hacer cada rol. Todos los usuarios comparten la misma interfaz; solo cambia lo que tienen habilitado. El aislamiento financiero de la cadena (cada nivel ve solo su propio dinero) está garantizado en el servidor por las reglas de seguridad y no puede saltarse desde aquí.')}
          </div>
        </div>
      </Aviso>

      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Selector de rol */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('Rol')}:</span>
        <button
          type="button" disabled
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800"
          title={t('Acceso total, no editable')}
        >
          <Lock size={12} /> {t(BULK_ROLES_LABEL[BULK_ROLES.SUPER_ADMIN])}
        </button>
        {[...ROLES_EDITABLES, ...personalizados].map((r) => (
          <button
            key={r} type="button" onClick={() => setSelRol(r)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selRol === r
                ? 'border-amber-400 bg-amber-500 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck size={13} /> {personalizados.includes(r) ? etiquetaRol(r, rolesConfig) : t(BULK_ROLES_LABEL[r] || r)}
          </button>
        ))}
        {/* Crear rol nuevo */}
        {creando ? (
          <span className="inline-flex items-center gap-1.5">
            <Input autoFocus value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && crearRol()}
              placeholder={t('Nombre del rol (ej. Contador)')} className="h-8 w-48 text-xs" />
            <Boton variant="gold" onClick={crearRol} disabled={guardando || !nuevoNombre.trim()} className="px-2.5 py-1 text-xs"><Check size={14} /></Boton>
            <button type="button" onClick={() => { setCreando(false); setNuevoNombre('') }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={14} /></button>
          </span>
        ) : (
          <button type="button" onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-amber-400 hover:text-amber-600 dark:border-slate-600 dark:text-slate-400">
            <Plus size={13} /> {t('Rol nuevo')}
          </button>
        )}
      </div>

      {/* Barra de acciones del rol seleccionado */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100">
            {etiquetaRol(selRol, rolesConfig)} {esCustom && <Badge color="blue">{t('Rol nuevo')}</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {totalPerms} {t('permisos')} · {esCustom ? <span className="text-slate-400">{t('Rol creado por ti')}</span> : personalizado ? <Badge color="gold">{t('Personalizado')}</Badge> : <span className="text-slate-400">{t('Usando preset por defecto')}</span>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {esCustom
            ? <Boton variant="ghost" onClick={eliminarRol} disabled={guardando} className="text-xs text-rose-500"><Trash2 size={14} /> {t('Eliminar rol')}</Boton>
            : <Boton variant="ghost" onClick={restablecer} disabled={bloqueado} className="text-xs"><RotateCcw size={14} /> {t('Restablecer al preset')}</Boton>}
          <Boton variant="gold" onClick={guardar} disabled={bloqueado || guardando || !dirty}><Save size={15} /> {guardando ? t('Guardando…') : t('Guardar cambios')}</Boton>
        </div>
      </Card>

      {bloqueado ? (
        <Card className="p-6 text-center text-sm text-slate-400"><Lock size={18} className="mx-auto mb-2" />{t('El Super Administrador siempre tiene acceso total. No es configurable.')}</Card>
      ) : (
        <>
          {/* Matriz de módulos × acciones */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MODULOS.map((mod) => {
              const activos = mod.acciones.filter((a) => tiene(permKey(mod.key, a))).length
              const todos = activos === mod.acciones.length
              return (
                <Card key={mod.key} className="p-3.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{t(mod.label)}</div>
                    <button
                      type="button" onClick={() => alternarModulo(mod, !todos)}
                      className="ml-auto text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
                    >
                      {todos ? t('Quitar todo') : t('Todo')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mod.acciones.map((a) => (
                      <Casilla key={a} activo={tiene(permKey(mod.key, a))} onClick={() => alternar(permKey(mod.key, a))}>
                        {t(ACCION_LABEL[a] || a)}
                      </Casilla>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Información financiera */}
          <Card className="mt-3 p-4">
            <div className="mb-3 flex items-center gap-2">
              <DollarSign size={16} className="text-rose-500" />
              <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Información financiera')}</h3>
              <span className="text-[11px] text-slate-400">{t('Qué números puede ver este rol')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FIN_PERMISOS.map((p) => (
                <Casilla key={p.key} activo={tiene(p.key)} onClick={() => alternar(p.key)} peligro>
                  {t(p.label)}
                </Casilla>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              {t('Recuerda: aunque marques un número aquí, un rol de la cadena solo podrá verlo si las reglas de Firestore le dan acceso a ese documento. Estos ajustes refinan la vista dentro de lo ya permitido; nunca amplían el acceso al dinero de otro nivel.')}
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
