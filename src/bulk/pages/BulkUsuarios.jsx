import { useState, useEffect, useRef } from 'react'
import { UserPlus, Trash2, ShieldCheck, Search, X, Pencil, LogOut, Power, Save, KeyRound } from 'lucide-react'
import { useColeccion, useDoc } from '../data/useColeccion'
import { guardar, guardarCampos, reservarCodigo, reservarCodigos, guardarAvatar, guardarDirectorio, crearConId } from '../data/repo'
import { useAvatares } from '../data/useCodigoUsuario'
import { useDirectorio, useMatrizComunicacion } from '../data/useComunicacion'
import MatrizComunicacion from '../components/MatrizComunicacion'
import { authBulk } from '../firebaseBulk'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { cerrarTodos, cerrarPorRol, cerrarUsuario } from '../data/sesiones'
import { BULK_ROLES, BULK_ROLES_LABEL } from '../domain/constants'
import { rolesPersonalizados, etiquetaRol } from '../domain/permisos'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, Tabla } from '../../components/ui'
import { UserId } from '../components/UserId'
import Avatar from '../components/Avatar'
import { useLang } from '../../i18n'

const ROLES_ASIGNABLES = [
  BULK_ROLES.ADMIN, BULK_ROLES.DISPATCHER, BULK_ROLES.CLIENTE,
  BULK_ROLES.TRANSPORTISTA, BULK_ROLES.CHOFER, BULK_ROLES.SUPERVISOR_PLANTA,
]

export default function BulkUsuarios() {
  const { t } = useLang()
  const { tenantId, usuario, rol, crearUsuario, rolesConfig } = useBulkAuth()
  const { datos: usuarios, cargando } = useColeccion('users')
  const { datos: perfilesDriver } = useColeccion('driverProfiles')
  const avatares = useAvatares()
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  // Trabajos (jobs): el SUPERVISOR ahora se asigna a trabajos, no a una planta.
  const { datos: jobsCat } = useColeccion('jobs')
  const { datos: equiposCat } = useColeccion('equipment')
  const jobsActivos = jobsCat.filter((j) => j.activo !== false)
  const nombreJobU = (id) => { const j = jobsCat.find((x) => x.id === id); return j ? (j.codigo ? `${j.codigo} · ${j.nombre || ''}` : (j.nombre || id)) : id }
  const directorio = useDirectorio()
  const matrizCom = useMatrizComunicacion(tenantId)
  const [verMatriz, setVerMatriz] = useState(false)

  const esAdmin = rol === BULK_ROLES.ADMIN || rol === BULK_ROLES.SUPER_ADMIN

  // Roles asignables = built-in + los ROLES NUEVOS que el admin haya creado (Fase 4).
  const asignables = [...ROLES_ASIGNABLES, ...rolesPersonalizados(rolesConfig)]
  // Etiqueta de un rol: built-in traducido, o el nombre del rol personalizado.
  const label = (r) => (BULK_ROLES_LABEL[r] ? t(BULK_ROLES_LABEL[r]) : etiquetaRol(r, rolesConfig))

  // ── IDENTIFICACIÓN LEGIBLE de 8 dígitos (campo `codigo`) ────────────────────
  // El uid de Auth es una cadena larga; para el día a día cada usuario lleva un ID
  // ÚNICO de 8 dígitos, secuencial (el siguiente = mayor existente + 1). Se asigna al
  // crear y se rellena a los usuarios antiguos que aún no lo tengan.
  const CODIGO_BASE = 10000000
  const codigoNum = (u) => { const n = parseInt(u?.codigo, 10); return Number.isFinite(n) ? n : NaN }
  const maxCodigo = (lista) => lista.reduce((m, u) => { const n = codigoNum(u); return Number.isFinite(n) && n > m ? n : m }, CODIGO_BASE)
  const idVisible = (u) => (Number.isFinite(codigoNum(u)) ? String(u.codigo) : '········')

  // Espeja (una vez) las fotos que los CHOFERES subieron en su perfil del portal
  // (bulk_driverProfiles) y las del roster hacia el sistema CENTRAL (bulk_avatars),
  // para que se vean en chats, listas y demás sin que el chofer tenga que reingresar.
  const espejoAvatarRef = useRef(false)
  useEffect(() => {
    if (espejoAvatarRef.current || cargando || !esAdmin) return
    const fuentes = {}
    for (const p of perfilesDriver || []) { const id = p.uid || p.id; if (id && p.foto) fuentes[id] = p.foto }
    for (const c of carriers || []) for (const d of (c.choferes || [])) { if (d.uid && d.foto && !fuentes[d.uid]) fuentes[d.uid] = d.foto }
    const pendientes = Object.entries(fuentes).filter(([uid]) => !avatares[uid])
    if (!pendientes.length) return
    espejoAvatarRef.current = true
    ;(async () => { for (const [uid, foto] of pendientes) { try { await guardarAvatar(tenantId, uid, foto) } catch { /* permiso */ } } })()
  }, [cargando, esAdmin, perfilesDriver, carriers, avatares, tenantId])

  // Sincroniza (una vez por sesión de admin) el DIRECTORIO del tenant a partir de los
  // usuarios: ficha NO sensible (uid, nombre, rol, carrier/cliente, código) legible por
  // cualquier miembro para descubrir contactos del chat interno. Escribe solo lo que
  // falta o cambió, para no repetir escrituras.
  const dirRef = useRef(false)
  useEffect(() => {
    if (dirRef.current || cargando || !esAdmin) return
    const porUid = Object.fromEntries((directorio || []).map((d) => [d.uid || d.id, d]))
    const pend = []
    for (const u of usuarios || []) {
      if (!u.id || !u.rol) continue
      const d = porUid[u.id]
      const codigo = Number.isFinite(codigoNum(u)) ? String(u.codigo) : (d?.codigo || null)
      const cambia = !d || d.nombre !== (u.nombre || '') || d.rol !== u.rol
        || (d.carrierId || null) !== (u.carrierId || null) || (d.clienteId || null) !== (u.clienteId || null)
        || (d.codigo || null) !== codigo
      if (cambia) pend.push({ uid: u.id, datos: { nombre: u.nombre || '', rol: u.rol, carrierId: u.carrierId || null, clienteId: u.clienteId || null, codigo } })
    }
    if (!pend.length) return
    dirRef.current = true
    ;(async () => { for (const p of pend) { try { await guardarDirectorio(tenantId, p.uid, p.datos) } catch { /* permiso */ } } })()
  }, [cargando, esAdmin, usuarios, directorio, tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Relleno automático (una vez) de los IDs faltantes, en orden estable. El ID es
  // ÚNICO y GLOBAL entre TODOS los perfiles: usuarios, transportistas (empresa) y
  // clientes (empresa). Así dos "carlos" se distinguen por su #ID, y una empresa
  // también tiene su propio identificador de perfil.
  const backfillRef = useRef(false)
  useEffect(() => {
    if (backfillRef.current || cargando || !esAdmin) return
    const orden = (l) => l.slice().sort((a, b) => (a.creadoEn?.seconds || 0) - (b.creadoEn?.seconds || 0) || (a.nombre || '').localeCompare(b.nombre || ''))
    const faltanU = orden(usuarios.filter((u) => !Number.isFinite(codigoNum(u))))
    const faltanC = orden(carriers.filter((c) => !Number.isFinite(codigoNum(c))))
    const faltanK = orden(clientes.filter((c) => !Number.isFinite(codigoNum(c))))
    if (!faltanU.length && !faltanC.length && !faltanK.length) return
    backfillRef.current = true
    const total = faltanU.length + faltanC.length + faltanK.length
    // Reserva un bloque de IDs del contador atómico, sembrándolo por encima del mayor
    // ID ya existente (piso) para no colisionar con los previos ni entre colecciones.
    const piso = Math.max(maxCodigo(usuarios), maxCodigo(carriers), maxCodigo(clientes))
    ;(async () => {
      let codigos = []
      try { codigos = await reservarCodigos(tenantId, total, piso) } catch { codigos = [] }
      if (codigos.length < total) { backfillRef.current = false; return }
      let i = 0
      for (const u of faltanU) { try { await guardarCampos('users', u.id, { codigo: codigos[i] }) } catch { /* permiso */ } i++ }
      for (const c of faltanC) { try { await guardarCampos('carriers', c.id, { codigo: codigos[i] }) } catch { /* permiso */ } i++ }
      for (const k of faltanK) { try { await guardarCampos('clients', k.id, { codigo: codigos[i] }) } catch { /* permiso */ } i++ }
    })()
  }, [cargando, usuarios, carriers, clientes, esAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: BULK_ROLES.DISPATCHER, vinculo: '', chofer: '', equipos: [] })
  const [msg, setMsg] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [rolFiltro, setRolFiltro] = useState('') // '' = todos los roles
  const [alta, setAlta] = useState(false)
  const [objetivoCierre, setObjetivoCierre] = useState('') // '' | 'ALL' | <rol> — a quién cerrar sesión
  const [usuarioCierre, setUsuarioCierre] = useState('')   // uid de la persona específica a cerrar sesión
  const [editar, setEditar] = useState(null)               // usuario en edición (modal) o null
  const [edicion, setEdicion] = useState({ nombre: '', email: '', password: '', plantaId: '' })
  const [guardandoEd, setGuardandoEd] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const necesitaCliente = f.rol === BULK_ROLES.CLIENTE
  const necesitaCarrier = f.rol === BULK_ROLES.TRANSPORTISTA
  const necesitaChofer = f.rol === BULK_ROLES.CHOFER
  // Choferes ya registrados en el roster (para afiliar la cuenta a su ficha).
  const rosterDrivers = carriers.flatMap((c) => (c.choferes || []).map((d) => ({ carrierId: c.id, carrierNombre: c.nombre, rosterId: d.id, nombre: d.nombre, uid: d.uid, equipos: Array.isArray(d.equipos) ? d.equipos : [] })))
  // Al elegir un chofer registrado: prellena nombre, transportista y sus camiones.
  const elegirChofer = (e) => {
    const v = e.target.value
    const rd = rosterDrivers.find((x) => `${x.carrierId}::${x.rosterId}` === v)
    setF((s) => ({ ...s, chofer: v, nombre: rd?.nombre || s.nombre, vinculo: rd?.carrierId || s.vinculo, equipos: rd?.equipos?.length ? rd.equipos : s.equipos }))
  }
  const toggleEquipo = (nombreEq) => setF((s) => ({ ...s, equipos: s.equipos.includes(nombreEq) ? s.equipos.filter((x) => x !== nombreEq) : [...s.equipos, nombreEq] }))

  const agregar = async () => {
    setMsg(null)
    const email = f.email.trim().toLowerCase()
    if (!f.nombre.trim() || !email || !f.password) { setMsg({ tipo: 'warn', txt: t('Completa nombre, correo y contraseña.') }); return }
    if (usuarios.some((u) => (u.email || '').toLowerCase() === email)) { setMsg({ tipo: 'error', txt: t('Ese correo ya existe.') }); return }
    if (necesitaCliente && !f.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona el cliente al que pertenece.') }); return }
    if ((necesitaCarrier || necesitaChofer) && !f.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona el transportista al que pertenece.') }); return }
    // Chofer: se afilia al TRANSPORTISTA. La ficha del roster es opcional: si se
    // elige una existente se enlaza; si no, se crea automáticamente en el roster.
    let rd = null
    if (necesitaChofer && f.chofer) {
      rd = rosterDrivers.find((x) => `${x.carrierId}::${x.rosterId}` === f.chofer)
      if (!rd) { setMsg({ tipo: 'error', txt: t('El chofer registrado ya no existe.') }); return }
      if (rd.uid) { setMsg({ tipo: 'error', txt: t('Ese chofer ya está afiliado a otra cuenta.') }); return }
    }
    try {
      const res = await crearUsuario({
        nombre: f.nombre.trim(), email, password: f.password, rol: f.rol,
        clienteId: necesitaCliente ? f.vinculo : undefined,
        carrierId: necesitaCarrier ? f.vinculo : (necesitaChofer ? (rd?.carrierId || f.vinculo) : undefined),
      })
      // Asigna el ID único de 8 dígitos (del contador atómico) a la cuenta recién creada.
      let codigo = ''
      if (res?.uid) {
        try {
          codigo = await reservarCodigo(tenantId, Math.max(maxCodigo(usuarios), maxCodigo(carriers), maxCodigo(clientes)))
          await guardarCampos('users', res.uid, { codigo })
        } catch { /* regla no desplegada aún */ }
      }
      // Enlaza (o crea) la ficha del roster del transportista con la cuenta nueva.
      if (necesitaChofer && res?.uid) {
        if (rd) {
          const carrier = carriers.find((c) => c.id === rd.carrierId)
          if (carrier) await guardar('carriers', carrier.id, { choferes: (carrier.choferes || []).map((d) => (d.id === rd.rosterId ? { ...d, uid: res.uid, equipos: f.equipos.length ? f.equipos : (d.equipos || []) } : d)) })
        } else {
          // Sin ficha elegida: alta automática en el roster del carrier seleccionado.
          const carrier = carriers.find((c) => c.id === f.vinculo)
          if (carrier) {
            const ficha = { id: `d_${Math.random().toString(36).slice(2, 9)}`, nombre: f.nombre.trim(), uid: res.uid, equipos: f.equipos }
            await guardar('carriers', carrier.id, { choferes: [...(carrier.choferes || []), ficha] })
          }
        }
      }
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear_usuario', entidad: 'usuario', detalle: `${email} (${f.rol})${codigo ? ` · ID ${codigo}` : ''}${rd ? ` → ${rd.nombre}` : ''}` })
      setF({ nombre: '', email: '', password: '', rol: BULK_ROLES.DISPATCHER, vinculo: '', chofer: '', equipos: [] })
      setMsg({ tipo: 'ok', txt: `${t('Usuario creado.')}${codigo ? ` ID: ${codigo}` : ''}` })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudo crear (¿backend desplegado?).') }) }
  }
  const borrar = async (u) => {
    if (u.rol === BULK_ROLES.SUPER_ADMIN) return
    if (!window.confirm(`${t('¿Eliminar a')} ${u.email}?`)) return
    setMsg(null)
    try {
      // El borrado real pasa por el backend (Admin SDK): elimina la cuenta de
      // Auth y el doc de bulk_users. Las reglas bloquean el borrado directo.
      const token = await authBulk.currentUser.getIdToken()
      const r = await fetch('/api/eliminar-usuario', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ uid: u.id, email: u.email }) })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || 'Error')
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'eliminar_usuario', entidad: 'usuario', detalle: u.email })
      setMsg({ tipo: 'ok', txt: `${t('Usuario eliminado')}: ${u.email}.` })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudo eliminar (¿backend desplegado?).') }) }
  }
  const toggle = async (u) => { if (u.rol !== BULK_ROLES.SUPER_ADMIN) await guardar('users', u.id, { activo: u.activo === false }) }
  // ── Editar usuario (nombre, correo, contraseña y planta) ──────────────────
  // Abre un panel; guarda vía endpoint con Admin SDK (Auth + doc bulk_users).
  const abrirEditar = (u) => {
    setMsg(null)
    setEditar(u)
    setEdicion({ nombre: u.nombre || '', email: u.email || '', password: '', plantaId: u.plantaId || '', jobIds: u.jobIds || [], rol: u.rol || '', vinculo: u.clienteId || u.carrierId || '', foto: avatares[u.id] || null })
  }
  // El admin cambia la foto de perfil del usuario en edición (regla lo permite).
  const guardarFotoEditar = async (dataUrl) => {
    if (!editar) return
    setEdicion((s) => ({ ...s, foto: dataUrl || null }))
    try { await guardarAvatar(tenantId, editar.id, dataUrl || null); setMsg({ tipo: 'ok', txt: dataUrl ? t('Foto de perfil actualizada.') : t('Foto de perfil eliminada.') }) }
    catch { setMsg({ tipo: 'error', txt: t('No se pudo guardar la foto. ¿Falta desplegar las reglas nuevas?') }) }
  }
  // Roles seleccionables al editar (incluye el actual aunque no sea "asignable", p. ej. super_admin).
  const opcionesRolEdit = editar ? [...new Set([editar.rol, ...asignables].filter(Boolean))] : []
  // Al cambiar el rol dentro del panel: si es el rol original recupera su vínculo; si es otro, lo limpia.
  const cambiarRolEdit = (e) => {
    const nuevo = e.target.value
    setEdicion((s) => ({ ...s, rol: nuevo, vinculo: (editar && nuevo === editar.rol) ? (editar.clienteId || editar.carrierId || '') : '' }))
  }
  const edicionNecesitaCliente = edicion.rol === BULK_ROLES.CLIENTE
  const edicionNecesitaCarrier = edicion.rol === BULK_ROLES.TRANSPORTISTA || edicion.rol === BULK_ROLES.CHOFER
  const setEd = (k) => (e) => setEdicion((s) => ({ ...s, [k]: e.target.value }))
  const guardarEdicion = async () => {
    if (!editar) return
    setMsg(null)
    const nombre = (edicion.nombre || '').trim()
    const email = (edicion.email || '').trim().toLowerCase()
    if (!nombre || !email) { setMsg({ tipo: 'warn', txt: t('El nombre y el correo son obligatorios.') }); return }
    if (edicion.password && edicion.password.length < 6) { setMsg({ tipo: 'error', txt: t('La contraseña debe tener al menos 6 caracteres.') }); return }
    const nuevoRol = edicion.rol || editar.rol
    const esSupervisor = nuevoRol === BULK_ROLES.SUPERVISOR_PLANTA
    // Roles de la cadena necesitan vínculo (a qué cliente/transportista pertenece).
    if (edicionNecesitaCliente && !edicion.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona a qué cliente pertenece.') }); return }
    if (edicionNecesitaCarrier && !edicion.vinculo) { setMsg({ tipo: 'warn', txt: t('Selecciona a qué transportista pertenece.') }); return }
    setGuardandoEd(true)
    try {
      const token = await authBulk.currentUser.getIdToken()
      const r = await fetch('/api/editar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uid: editar.id, nombre, email, rol: nuevoRol,
          password: edicion.password || undefined,
          // Supervisor por TRABAJOS (jobs). plantaId queda como legado (se limpia
          // al asignar trabajos para completar la migración de ese usuario).
          jobIds: esSupervisor ? (edicion.jobIds || []) : undefined,
          jobsNombres: esSupervisor ? (edicion.jobIds || []).map(nombreJobU) : undefined,
          plantaId: esSupervisor ? ((edicion.jobIds || []).length ? null : (edicion.plantaId || null)) : undefined,
          clienteId: edicionNecesitaCliente ? edicion.vinculo : null,
          carrierId: edicionNecesitaCarrier ? edicion.vinculo : null,
        }),
      })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || 'Error')
      // Refuerzo: los TRABAJOS del supervisor se escriben también directo al doc
      // (la regla lo permite al admin). Así la asignación nunca se pierde aunque
      // el backend de Vercel esté desactualizado o falle en silencio.
      if (esSupervisor) {
        try { await guardarCampos('users', editar.id, { jobIds: edicion.jobIds || [], jobsNombres: (edicion.jobIds || []).map(nombreJobU), plantaId: (edicion.jobIds || []).length ? null : (edicion.plantaId || null) }) } catch { /* el api ya lo escribió */ }
      }
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'editar_usuario', entidad: 'usuario', detalle: `${email}${data.rolCambiado ? ` · rol→${label(nuevoRol)}` : ''}${edicion.password ? ' · contraseña' : ''}` })
      const debeReiniciar = data.rolCambiado || data.claimsCambiados
      setMsg({ tipo: 'ok', txt: data.rolCambiado
        ? `${t('Usuario actualizado')}: ${email}. ${t('Cambió a rol')} “${label(nuevoRol)}” — ${t('deberá volver a iniciar sesión.')}`
        : `${t('Usuario actualizado')}: ${email}.${debeReiniciar ? ` ${t('Deberá volver a iniciar sesión.')}` : ''}` })
      setEditar(null)
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudo actualizar (¿backend desplegado?).') }) }
    finally { setGuardandoEd(false) }
  }

  // ── Cierre de sesión forzado (a todos / por rol / a un usuario) ──────────
  const forzarTodos = async () => {
    if (!window.confirm(t('¿Cerrar la sesión de TODOS los usuarios? Tendrán que volver a iniciar sesión.'))) return
    await cerrarTodos(tenantId)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'todos', detalle: 'todos' })
    setMsg({ tipo: 'ok', txt: t('Se cerró la sesión de todos los usuarios.') })
  }
  const forzarRol = async (r) => {
    if (!window.confirm(`${t('¿Cerrar la sesión de todos los usuarios con el rol')} "${label(r)}"?`)) return
    await cerrarPorRol(tenantId, r)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'rol', detalle: r })
    setMsg({ tipo: 'ok', txt: `${t('Se cerró la sesión del rol')} ${label(r)}.` })
  }
  const forzarUsuario = async (u) => {
    if (!window.confirm(`${t('¿Cerrar la sesión de')} ${u.email}?`)) return
    await cerrarUsuario(tenantId, u.id)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cerrar_sesiones', entidad: 'usuario', detalle: u.email })
    setMsg({ tipo: 'ok', txt: `${t('Se cerró la sesión de')} ${u.email}.` })
  }
  // Aplica el cierre según el objetivo elegido en la lista (evita clics accidentales
  // en "TODOS": hay que seleccionarlo a propósito y luego confirmar).
  const aplicarCierre = async () => {
    if (!objetivoCierre) return
    if (objetivoCierre === 'ALL') await forzarTodos()
    else await forzarRol(objetivoCierre)
    setObjetivoCierre('')
  }

  // ── Reparar IDs A PEDIDO (faltantes + DUPLICADOS heredados) ────────────────
  // 1) Asigna #ID a los perfiles que aún no lo tienen.
  // 2) Corrige duplicados: si dos perfiles comparten un ID, MANTIENE uno (el de mayor
  //    prioridad usuario>transportista>cliente y, a igualdad, el más antiguo) y reasigna
  //    un ID nuevo (del contador global) al resto. Usuarios, transportistas y clientes
  //    comparten la misma secuencia → tras reparar, ningún #ID se repite.
  const [generandoIds, setGenerandoIds] = useState(false)
  const perfilesTodos = () => [
    ...usuarios.map((u) => ({ col: 'users', id: u.id, codigo: u.codigo, ts: (u.creadoEn?.seconds || 0), pri: 3, etq: t('usuario'), nombre: u.nombre || u.email })),
    ...carriers.map((c) => ({ col: 'carriers', id: c.id, codigo: c.codigo, ts: (c.creadoEn?.seconds || 0), pri: 2, etq: t('transportista'), nombre: c.nombre })),
    ...clientes.map((c) => ({ col: 'clients', id: c.id, codigo: c.codigo, ts: (c.creadoEn?.seconds || 0), pri: 1, etq: t('cliente'), nombre: c.nombre })),
  ]
  const repararIds = async () => {
    const perfiles = perfilesTodos()
    const sinCodigo = perfiles.filter((p) => !Number.isFinite(parseInt(p.codigo, 10)))
    // Agrupar por codigo para detectar duplicados.
    const grupos = {}
    for (const p of perfiles) { if (Number.isFinite(parseInt(p.codigo, 10))) (grupos[p.codigo] = grupos[p.codigo] || []).push(p) }
    const duplicados = []
    for (const arr of Object.values(grupos)) {
      if (arr.length <= 1) continue
      // Keeper = mayor prioridad y, a igualdad, el más antiguo; el resto se reasigna.
      arr.sort((a, b) => b.pri - a.pri || (a.ts || 0) - (b.ts || 0))
      duplicados.push(...arr.slice(1))
    }
    const objetivos = [...sinCodigo, ...duplicados]
    if (!objetivos.length) { setMsg({ tipo: 'ok', txt: t('Todos los perfiles ya tienen un ID único. No hay nada que reparar.') }); return }
    setMsg(null); setGenerandoIds(true)
    try {
      const piso = Math.max(maxCodigo(usuarios), maxCodigo(carriers), maxCodigo(clientes))
      const codigos = await reservarCodigos(tenantId, objetivos.length, piso)
      if (codigos.length < objetivos.length) throw new Error(t('No se pudieron reservar los IDs.'))
      let i = 0, ok = 0; const errs = []
      for (const p of objetivos) { try { await guardarCampos(p.col, p.id, { codigo: codigos[i] }); ok++ } catch { errs.push(`${p.etq} ${p.nombre || p.id}`) } i++ }
      const dupTxt = duplicados.length ? ` (${duplicados.length} ${t('duplicados corregidos')})` : ''
      if (errs.length) setMsg({ tipo: 'warn', txt: `${t('IDs reparados')}: ${ok}${dupTxt}. ${t('No se pudo con')}: ${errs.slice(0, 4).join(', ')}${errs.length > 4 ? '…' : ''}` })
      else setMsg({ tipo: 'ok', txt: `${t('Se repararon')} ${ok} ${t('IDs correctamente.')}${dupTxt}` })
    } catch (e) { setMsg({ tipo: 'error', txt: e.message || t('No se pudieron reparar los IDs.') }) }
    finally { setGenerandoIds(false) }
  }
  // Cierra la sesión de UNA persona concreta elegida en el desplegable.
  const cerrarPersonaSel = async () => {
    const u = usuarios.find((x) => x.id === usuarioCierre)
    if (!u) return
    await forzarUsuario(u)
    setUsuarioCierre('')
  }

  // ── Filtro cómodo: texto (nombre, correo, ID o rol) + desplegable por ROL ──
  const s = buscar.trim().toLowerCase()
  const usuariosFiltrados = usuarios
    .filter((u) => (rolFiltro ? u.rol === rolFiltro : true))
    .filter((u) => !s
      || (u.nombre || '').toLowerCase().includes(s)
      || (u.email || '').toLowerCase().includes(s)
      || (u.codigo || '').toLowerCase().includes(s)
      || (u.id || '').toLowerCase().includes(s)
      || (label(u.rol) || u.rol || '').toLowerCase().includes(s))
    .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  const hayFiltro = !!s || !!rolFiltro
  const limpiar = () => { setBuscar(''); setRolFiltro('') }
  // Perfiles ya creados que aún no tienen #ID (usuarios + empresas).
  const faltanId = usuarios.filter((u) => !Number.isFinite(codigoNum(u))).length
    + carriers.filter((c) => !Number.isFinite(codigoNum(c))).length
    + clientes.filter((c) => !Number.isFinite(codigoNum(c))).length
  // IDs DUPLICADOS heredados (mismo #ID en dos o más perfiles).
  const frecCodigo = {}
  for (const p of [...usuarios, ...carriers, ...clientes]) { if (Number.isFinite(codigoNum(p))) frecCodigo[p.codigo] = (frecCodigo[p.codigo] || 0) + 1 }
  const dupId = Object.values(frecCodigo).reduce((s, n) => s + (n > 1 ? n - 1 : 0), 0)

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Usuarios y roles')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Seguridad de entregas: cada cuánto rota el código de autorización (TOTP)
          de los supervisores. Lo lee el backend en cada validación. */}
      {esAdmin && <ConfigCodigoLiberacion t={t} tenantId={tenantId} usuario={usuario} rol={rol} setMsg={setMsg} />}

      {/* Perfiles sin ID o con ID DUPLICADO: botón para repararlos de una vez. */}
      {(faltanId > 0 || dupId > 0) && (
        <Aviso tipo="warn" className="mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {faltanId > 0 && `${faltanId} ${faltanId === 1 ? t('perfil sin número de ID') : t('perfiles sin número de ID')}`}
              {faltanId > 0 && dupId > 0 && ' · '}
              {dupId > 0 && `${dupId} ${dupId === 1 ? t('ID duplicado') : t('IDs duplicados')}`}
              {'. '}{t('Cada perfil debe tener un ID único.')}
            </span>
            <Boton variant="gold" onClick={repararIds} disabled={generandoIds} className="px-3 py-1.5 text-xs">
              {generandoIds ? t('Reparando…') : `${t('Reparar IDs')} (${faltanId + dupId})`}
            </Boton>
          </div>
        </Aviso>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar por nombre, correo, ID o rol…')} className="h-11 w-full pl-9 pr-9 text-sm" />
          {buscar && <button type="button" onClick={() => setBuscar('')} title={t('Limpiar')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"><X size={16} /></button>}
        </div>
        <Select value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)} className="h-11 w-full text-sm sm:w-60">
          <option value="">{t('Todos los roles')}</option>
          {asignables.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
        <span className="whitespace-nowrap text-xs font-medium text-slate-400">{usuariosFiltrados.length} {usuariosFiltrados.length === 1 ? t('usuario') : t('usuarios')}</span>
        {hayFiltro && <Boton variant="ghost" onClick={limpiar} className="px-3 py-1 text-xs"><X size={14} /> {t('Limpiar')}</Boton>}
        {esAdmin && <Boton variant="ghost" onClick={() => setVerMatriz(true)} className="ml-auto px-3 py-1.5 text-xs"><ShieldCheck size={15} /> {t('Reglas de chat')}</Boton>}
        <Boton variant="gold" onClick={() => setAlta((v) => !v)} className={esAdmin ? '' : 'ml-auto'}>{alta ? <><X size={16} /> {t('Cerrar')}</> : <><UserPlus size={16} /> {t('Nuevo usuario')}</>}</Boton>
      </div>

      {verMatriz && (
        <MatrizComunicacion
          tenantId={tenantId}
          matriz={matrizCom}
          rolesConfig={rolesConfig}
          roles={[...asignables, BULK_ROLES.SUPER_ADMIN]}
          onClose={() => setVerMatriz(false)}
        />
      )}

      {alta && (
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo usuario')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
          <Input type="email" placeholder={t('Correo')} value={f.email} onChange={set('email')} />
          <Input type="password" placeholder={t('Contraseña')} value={f.password} onChange={set('password')} />
          <Select value={f.rol} onChange={(e) => setF((s) => ({ ...s, rol: e.target.value, vinculo: '', chofer: '', equipos: [] }))}>
            {asignables.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </Select>
        </div>
        {(necesitaCliente || necesitaCarrier || necesitaChofer) && (
          <div className="mt-3 max-w-xs">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{necesitaCliente ? t('Cliente al que pertenece') : t('Transportista al que pertenece')}</div>
            <Select value={f.vinculo} onChange={(e) => setF((s) => ({ ...s, vinculo: e.target.value, chofer: '' }))}>
              <option value="">{t('— Seleccionar —')}</option>
              {(necesitaCliente ? clientes : carriers).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </Select>
          </div>
        )}
        {necesitaChofer && f.vinculo && (
          <div className="mt-3 max-w-md">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Ficha del roster (opcional)')}</div>
            <Select value={f.chofer} onChange={elegirChofer}>
              <option value="">{t('— Ninguna: crear su ficha automáticamente —')}</option>
              {rosterDrivers.filter((d) => d.carrierId === f.vinculo).map((d) => <option key={`${d.carrierId}::${d.rosterId}`} value={`${d.carrierId}::${d.rosterId}`} disabled={!!d.uid}>{d.nombre}{d.uid ? ` (${t('ya afiliado')})` : ''}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-slate-400">{t('Si el transportista ya lo tenía registrado, elígelo para enlazar su ficha (equipos, historial). Si no, se crea sola en el roster del transportista.')}</p>
          </div>
        )}
        {necesitaChofer && f.vinculo && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-semibold uppercase text-slate-400">{t('Camión / equipo que maneja')} {f.equipos.length > 0 && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">{f.equipos.length}</span>}</div>
            <div className="flex flex-wrap gap-1.5">
              {equiposCat.filter((e) => e.activo !== false).length === 0
                ? <span className="text-xs text-slate-400">{t('No hay tipos de equipo. Créalos en “Tipos de equipo”.')}</span>
                : equiposCat.filter((e) => e.activo !== false).map((e) => {
                  const on = f.equipos.includes(e.nombre)
                  return (
                    <button key={e.id} type="button" onClick={() => toggleEquipo(e.nombre)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{e.nombre}</button>
                  )
                })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{t('Solo recibirá órdenes compatibles con estos camiones. Se guarda en su ficha del roster del transportista.')}</p>
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
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{t('Obliga a los usuarios a volver a iniciar sesión. Útil tras un cambio de contraseña o por seguridad.')}</p>
        {/* Dos filtros del MISMO tamaño: una persona específica, o por rol / todos. */}
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {/* Persona específica */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-slate-800/40">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><LogOut size={14} className="text-brand-gold" /> {t('Una persona específica')}</div>
            <Select value={usuarioCierre} onChange={(e) => setUsuarioCierre(e.target.value)} className="h-11 w-full text-sm">
              <option value="">{t('— Selecciona una persona —')}</option>
              {usuarios.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((u) => (
                <option key={u.id} value={u.id}>{(u.nombre || t('Sin nombre'))} · ID {idVisible(u)} · {label(u.rol) || u.rol}</option>
              ))}
            </Select>
            <Boton variant="gold" onClick={cerrarPersonaSel} disabled={!usuarioCierre} className="mt-3 h-11 w-full">
              <Power size={15} /> {t('Cerrar su sesión')}
            </Boton>
          </div>
          {/* Por rol o todo el sistema */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-slate-800/40">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><ShieldCheck size={14} className="text-brand-gold" /> {t('Por rol o todo el sistema')}</div>
            <Select value={objetivoCierre} onChange={(e) => setObjetivoCierre(e.target.value)} className="h-11 w-full text-sm">
              <option value="">{t('— Selecciona un objetivo —')}</option>
              <optgroup label={t('Por rol')}>
                {asignables.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </optgroup>
              <optgroup label={t('Todo el sistema')}>
                <option value="ALL">⚠ {t('Todos los usuarios')}</option>
              </optgroup>
            </Select>
            <Boton variant={objetivoCierre === 'ALL' ? 'danger' : 'gold'} onClick={aplicarCierre} disabled={!objetivoCierre} className="mt-3 h-11 w-full">
              <Power size={15} /> {objetivoCierre === 'ALL' ? t('Cerrar sesión a TODOS') : objetivoCierre ? `${t('Cerrar sesión')}: ${label(objetivoCierre)}` : t('Cerrar sesión')}
            </Boton>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'email', label: t('Correo') }, { key: 'rol', label: t('Rol') }, { key: 'planta', label: t('Trabajos') }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
          rows={usuariosFiltrados.map((u) => ({ ...u, _key: u.id }))}
          emptyText={hayFiltro ? t('Ningún usuario coincide con el filtro.') : t('Sin usuarios.')}
          renderCell={(row, key) => {
            if (key === 'nombre') return (
              <div className="flex items-center gap-3">
                <Avatar foto={avatares[row.id]} nombre={row.nombre} size={42} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-brand-navy dark:text-slate-100">{row.nombre || '—'}</div>
                  {Number.isFinite(codigoNum(row)) ? <UserId codigo={row.codigo} /> : <span className="font-mono text-[11px] tracking-wide text-slate-400">{t('ID')}: ········</span>}
                </div>
              </div>
            )
            if (key === 'rol') return <Badge color={row.rol === BULK_ROLES.SUPER_ADMIN ? 'gold' : 'navy'}>{label(row.rol) || row.rol}</Badge>
            if (key === 'planta') {
              if (row.rol !== BULK_ROLES.SUPERVISOR_PLANTA) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
              // Supervisor por TRABAJOS: se asignan en el modal de edición (lápiz).
              const jids = row.jobIds || []
              return (
                <button type="button" onClick={() => abrirEditar(row)} className="inline-flex max-w-[220px] flex-wrap items-center gap-1 text-left" title={t('Editar trabajos asignados')}>
                  {jids.length === 0
                    ? (row.plantaId
                        ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{t('planta (migrar a trabajos)')}</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400 dark:bg-slate-800">{t('Sin trabajos')}</span>)
                    : jids.slice(0, 2).map((id) => <span key={id} className="truncate rounded-full bg-brand-navy/10 px-2 py-0.5 text-[11px] font-semibold text-brand-navy dark:bg-white/10 dark:text-slate-200">{nombreJobU(id)}</span>)}
                  {jids.length > 2 && <span className="text-[11px] text-slate-400">+{jids.length - 2}</span>}
                </button>
              )
            }
            if (key === 'estado') return <button onClick={() => toggle(row)}><Badge color={row.activo === false ? 'slate' : 'green'}>{row.activo === false ? t('Inactivo') : t('Activo')}</Badge></button>
            if (key === 'acciones') return (
              <div className="flex justify-end gap-1.5">
                <Boton variant="ghost" onClick={() => forzarUsuario(row)} className="px-2.5 py-1 text-xs" title={t('Cerrar sesión de este usuario')}><LogOut size={13} /></Boton>
                <Boton variant="ghost" onClick={() => abrirEditar(row)} className="px-2.5 py-1 text-xs" title={t('Editar usuario')}><Pencil size={13} /></Boton>
                {row.rol === BULK_ROLES.SUPER_ADMIN ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><ShieldCheck size={13} /> {t('protegido')}</span> : <Boton variant="danger" onClick={() => borrar(row)} className="px-2.5 py-1 text-xs"><Trash2 size={13} /></Boton>}
              </div>
            )
            return row[key]
          }}
        />
      </Card>

      {/* ── Modal EDITAR USUARIO ── */}
      {editar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !guardandoEd && setEditar(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <Avatar foto={edicion.foto} nombre={edicion.nombre || editar.nombre} size={52} editable onFoto={guardarFotoEditar} />
              <div className="min-w-0">
                <h3 className="m-0 truncate text-sm font-bold text-brand-navy dark:text-slate-100">{t('Editar usuario')}</h3>
                <p className="m-0 truncate text-xs text-slate-400">{t('ID')}: {Number.isFinite(codigoNum(editar)) ? `#${editar.codigo}` : '········'} · {label(editar.rol) || editar.rol}</p>
              </div>
              <button type="button" onClick={() => !guardandoEd && setEditar(null)} className="ml-auto text-slate-400 hover:text-rose-500"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Nombre')}</div>
                <Input value={edicion.nombre} onChange={setEd('nombre')} placeholder={t('Nombre')} className="h-11 w-full text-sm" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Correo')}</div>
                <Input type="email" value={edicion.email} onChange={setEd('email')} placeholder={t('Correo')} className="h-11 w-full text-sm" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Nueva contraseña')}</div>
                <Input type="password" value={edicion.password} onChange={setEd('password')} placeholder={t('Dejar en blanco para no cambiarla')} className="h-11 w-full text-sm" />
                <p className="mt-1 text-[11px] text-slate-400">{t('Mínimo 6 caracteres. Si lo dejas vacío, la contraseña no cambia.')}</p>
              </div>
              {editar.rol !== BULK_ROLES.SUPER_ADMIN && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Rol')}</div>
                  <Select value={edicion.rol} onChange={cambiarRolEdit} className="h-11 w-full text-sm">
                    {opcionesRolEdit.map((r) => <option key={r} value={r}>{label(r) || r}</option>)}
                  </Select>
                  {edicion.rol !== editar.rol && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t('Al cambiar el rol, la persona deberá volver a iniciar sesión.')}</p>
                  )}
                </div>
              )}
              {(edicionNecesitaCliente || edicionNecesitaCarrier) && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{edicionNecesitaCliente ? t('Cliente al que pertenece') : t('Transportista al que pertenece')}</div>
                  <Select value={edicion.vinculo} onChange={setEd('vinculo')} className="h-11 w-full text-sm">
                    <option value="">{t('— Seleccionar —')}</option>
                    {(edicionNecesitaCliente ? clientes : carriers).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </Select>
                  {edicionNecesitaCarrier && edicion.rol === BULK_ROLES.CHOFER && (
                    <p className="mt-1 text-[11px] text-slate-400">{t('Para vincular la ficha del chofer (equipos/trabajos), afílialo también en la pantalla “Choferes”.')}</p>
                  )}
                </div>
              )}
              {edicion.rol === BULK_ROLES.SUPERVISOR_PLANTA && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Trabajos asignados')}</div>
                  {jobsActivos.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('Aún no hay trabajos. Créalos en “Trabajos (Jobs)” y vuelve aquí para asignarlos.')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {jobsActivos.map((j) => {
                        const on = (edicion.jobIds || []).includes(j.id)
                        return (
                          <button key={j.id} type="button"
                            onClick={() => setEdicion((s) => ({ ...s, jobIds: on ? (s.jobIds || []).filter((x) => x !== j.id) : [...(s.jobIds || []), j.id] }))}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {j.codigo ? `${j.codigo} · ` : ''}{j.nombre}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">{t('El supervisor solo verá las órdenes de estos trabajos. Puedes asignarle uno o varios.')}</p>
                  {edicion.plantaId && (edicion.jobIds || []).length === 0 && (
                    <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">{t('Este supervisor aún usa el modelo viejo por planta; al asignarle trabajos se migra automáticamente.')}</p>
                  )}
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setEditar(null)} disabled={guardandoEd}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={guardarEdicion} disabled={guardandoEd}><Save size={16} /> {guardandoEd ? t('Guardando…') : t('Guardar cambios')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}


// ── Configuración del CÓDIGO DE LIBERACIÓN (token de supervisores) ──────────
// El código rota automáticamente cada `periodo` segundos (30/60/120). El valor
// vive en bulk_settings.liberacion.periodo y el backend lo aplica al generar y
// validar cada token. Solo el administrador lo cambia.
function ConfigCodigoLiberacion({ t, tenantId, usuario, rol, setMsg }) {
  const { dato: settings } = useDoc('settings', tenantId)
  const actual = [30, 60, 120].includes(Number(settings?.liberacion?.periodo)) ? Number(settings.liberacion.periodo) : 60
  const fijar = async (v) => {
    if (v === actual) return
    try {
      await crearConId('settings', tenantId, tenantId, { liberacion: { periodo: v } })
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberacion_periodo', entidad: 'liberacion', detalle: `Código de autorización rota cada ${v} s` })
      setMsg({ tipo: 'ok', txt: `${t('Listo: el código de los supervisores ahora rota cada')} ${v} s.` })
    } catch { setMsg({ tipo: 'error', txt: t('No se pudo guardar la configuración.') }) }
  }
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><KeyRound size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Código de autorización de entregas')}</div>
          <div className="text-xs text-slate-400">{t('Ninguna orden puede entregarse sin el código vigente de un supervisor. Elige cada cuánto rota el código (tipo token bancario).')}</div>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
          {[30, 60, 120].map((v) => (
            <button key={v} type="button" onClick={() => fijar(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${actual === v ? 'bg-white text-brand-navy shadow-sm dark:bg-slate-900 dark:text-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
              {v} s
            </button>
          ))}
        </div>
      </div>
      {/* Código PROPIO del administrador: su alcance cubre TODAS las órdenes del
          tenant (respaldo cuando un trabajo no tiene supervisor asignado). */}
      <MiCodigoAdmin t={t} />
    </Card>
  )
}

// Código de autorización del PROPIO admin (bulkTotpOp), en formato compacto:
// código + cuenta regresiva + regenerar. Sirve para autorizar cualquier orden.
function MiCodigoAdmin({ t }) {
  const [info, setInfo] = useState(null)
  const [seg, setSeg] = useState(0)
  const [ver, setVer] = useState(false)
  const [err, setErr] = useState('')
  const ocupadoRef = useRef(false)
  const pedir = async (op = 'codigo') => {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    setErr('')
    try {
      const { httpsCallable } = await import('firebase/functions')
      const { funcsBulk } = await import('../firebaseBulk')
      const fn = httpsCallable(funcsBulk, 'bulkTotpOp', { timeout: 15000 })
      const r = await fn({ op, ...(op === 'rotar' ? { motivo: 'rotación manual (admin)' } : {}) })
      setInfo(r?.data || null); setSeg(r?.data?.segundos || 0)
    } catch (e) { setErr(e?.message || t('No se pudo obtener el código.')) }
    finally { ocupadoRef.current = false }
  }
  useEffect(() => { if (ver && !info) pedir('codigo') }, [ver]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ver || !info) return
    const id = setInterval(() => setSeg((x) => { if (x <= 1) { pedir('codigo'); return 0 } return x - 1 }), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, info])
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      {!ver ? (
        <button type="button" onClick={() => setVer(true)} className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400">{t('Ver mi código de autorización (admin) — sirve para cualquier orden')}</button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl border-2 border-amber-400 bg-amber-500/5 px-4 py-2 font-mono text-2xl font-black tracking-[0.3em] text-brand-navy dark:text-slate-100">{info?.codigo || '· · ·'}</span>
          {info && <span className={`text-xs font-bold ${seg <= 10 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>{t('válido')} {seg} s</span>}
          <button type="button" onClick={() => pedir('rotar')} className="text-xs font-semibold text-slate-400 hover:text-slate-600">{t('Regenerar')}</button>
          <button type="button" onClick={() => setVer(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">{t('Ocultar')}</button>
          {err && <span className="text-xs font-semibold text-rose-500">{err}</span>}
        </div>
      )}
    </div>
  )
}
