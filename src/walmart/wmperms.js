// ============================================================================
// WALMART · Roles y permisos (núcleo PURO, sin Firebase ni DOM).
//
// Catálogo de permisos por categoría, plantillas de rol, dependencias y las
// reglas de "quién puede conceder qué" (anti auto-elevación). Es puro para
// poder probarlo con Node. La aplicación real de estos permisos se hace en:
//   · la UI (ocultar/bloquear) vía useWalPerms (WalmartApp.jsx), y
//   · el BACKEND vía reglas de Firestore (firestore.rules → wal_usuarios).
//
// Aislamiento: EXCLUSIVO del módulo Walmart. No toca usuarios/roles/permisos
// de Gofo/Speedex/Freight/Warehouse: vive en la colección propia wal_usuarios.
// ============================================================================

// Roles de Walmart. 'driver' es especial: solo su portal (no usa la matriz).
export const ROLES_WAL = [
  { id: 'driver', label: 'Driver (chofer)', desc: 'Solo su portal y su propia información.' },
  { id: 'manager', label: 'Manager de almacén', desc: 'Opera sus almacenes asignados; sin finanzas por defecto.' },
  { id: 'admin', label: 'Administrador de Walmart', desc: 'Acceso configurable; NO es acceso total automático.' },
]
export const rolWalInfo = (id) => ROLES_WAL.find((r) => r.id === id) || ROLES_WAL[0]

// Catálogo de permisos agrupado por categoría. Cada permiso: { id, label, dep? }
// `dep` = permiso que DEBE estar activo para que este tenga sentido (dependencia).
export const CATEGORIAS_PERM = [
  {
    id: 'operacion', label: 'Operación y rutas', perms: [
      { id: 'rutas_ver', label: 'Ver rutas' },
      { id: 'rutas_crear', label: 'Crear rutas', dep: 'rutas_ver' },
      { id: 'rutas_editar', label: 'Editar rutas', dep: 'rutas_ver' },
      { id: 'rutas_asignar_driver', label: 'Asignar o cambiar drivers', dep: 'rutas_ver' },
      { id: 'tarifa_driver_ver', label: 'Ver tarifas de pago al driver' },
      { id: 'tarifa_driver_editar', label: 'Colocar o modificar tarifas al driver', dep: 'tarifa_driver_ver' },
    ],
  },
  {
    id: 'drivers', label: 'Drivers y documentos', perms: [
      { id: 'drivers_ver', label: 'Ver perfiles de drivers' },
      { id: 'drivers_crear', label: 'Agregar drivers', dep: 'drivers_ver' },
      { id: 'drivers_editar', label: 'Editar perfiles', dep: 'drivers_ver' },
      { id: 'docs_ver', label: 'Ver documentos', dep: 'drivers_ver' },
      { id: 'docs_subir', label: 'Subir o actualizar documentos', dep: 'docs_ver' },
      { id: 'docs_descargar', label: 'Descargar documentos', dep: 'docs_ver' },
      { id: 'contratos_ver', label: 'Ver contratos', dep: 'drivers_ver' },
      { id: 'contratos_gestionar', label: 'Crear o gestionar contratos', dep: 'contratos_ver' },
    ],
  },
  {
    id: 'pagos', label: 'Pagos y Fast Pay', perms: [
      { id: 'pagos_ver', label: 'Ver liquidaciones y pagos' },
      { id: 'liq_preparar', label: 'Preparar liquidaciones semanales', dep: 'pagos_ver' },
      { id: 'pagos_ejecutar', label: 'Ejecutar o confirmar pagos semanales', dep: 'pagos_ver' },
      { id: 'fp_ver', label: 'Ver operaciones de Fast Pay' },
      { id: 'fp_preparar', label: 'Preparar un Fast Pay', dep: 'fp_ver' },
      { id: 'fp_ejecutar', label: 'Ejecutar o confirmar un Fast Pay', dep: 'fp_ver' },
      { id: 'pagos_anular', label: 'Anular o revertir pagos', dep: 'pagos_ver' },
    ],
  },
  {
    id: 'finanzas', label: 'Financiero y reportes', perms: [
      { id: 'fin_dashboard_ver', label: 'Ver el dashboard financiero' },
      { id: 'fin_ingresos_ver', label: 'Ver ingresos', dep: 'fin_dashboard_ver' },
      { id: 'fin_costos_ver', label: 'Ver costos', dep: 'fin_dashboard_ver' },
      { id: 'fin_utilidad_oper_ver', label: 'Ver utilidad operativa', dep: 'fin_dashboard_ver' },
      { id: 'fin_utilidad_fin_ver', label: 'Ver utilidad por financiamiento', dep: 'fin_dashboard_ver' },
      { id: 'reportes_exportar', label: 'Exportar reportes autorizados', dep: 'fin_dashboard_ver' },
    ],
  },
  {
    id: 'admin', label: 'Administrativo', perms: [
      { id: 'usuarios_crear', label: 'Crear usuarios' },
      { id: 'usuarios_editar', label: 'Editar usuarios', dep: 'usuarios_crear' },
      { id: 'usuarios_roles', label: 'Asignar roles y permisos', dep: 'usuarios_editar' },
      { id: 'usuarios_warehouses', label: 'Asignar warehouses', dep: 'usuarios_editar' },
      { id: 'historial_ver', label: 'Ver el historial de cambios' },
    ],
  },
]

// Lista plana de todos los permisos y mapa id → dep.
export const TODOS_PERMISOS = CATEGORIAS_PERM.flatMap((c) => c.perms.map((p) => p.id))
export const DEP_DE = Object.fromEntries(CATEGORIAS_PERM.flatMap((c) => c.perms.map((p) => [p.id, p.dep || null])))
export const LABEL_PERM = Object.fromEntries(CATEGORIAS_PERM.flatMap((c) => c.perms.map((p) => [p.id, p.label])))

// Plantillas de rol (punto de partida; luego se personaliza por usuario).
// IMPORTANTE: admin NO es acceso total; finanzas/pagos/FP/admin de usuarios OFF.
export const PLANTILLA_ROL = {
  driver: {}, // el driver no usa la matriz
  manager: {
    rutas_ver: true, rutas_crear: true, rutas_editar: true, rutas_asignar_driver: true,
    tarifa_driver_ver: true, drivers_ver: true, docs_ver: true,
  },
  admin: {
    rutas_ver: true, rutas_crear: true, rutas_editar: true, rutas_asignar_driver: true,
    tarifa_driver_ver: true, tarifa_driver_editar: true,
    drivers_ver: true, drivers_crear: true, drivers_editar: true, docs_ver: true, docs_subir: true, contratos_ver: true,
    pagos_ver: true, fp_ver: true,
    // finanzas OFF, pagos_ejecutar/fp_ejecutar/anular OFF, admin de usuarios OFF → se conceden explícitamente
  },
}

// Normaliza un mapa de permisos: aplica dependencias (si falta la dependencia,
// el permiso dependiente se apaga) y descarta claves desconocidas.
export function normalizarPermisos(permisos) {
  const base = {}
  for (const k of TODOS_PERMISOS) if (permisos && permisos[k] === true) base[k] = true
  // Varias pasadas por si hay cadenas de dependencias (A→B→C).
  for (let i = 0; i < 4; i++) {
    for (const k of TODOS_PERMISOS) {
      const dep = DEP_DE[k]
      if (base[k] && dep && !base[dep]) delete base[k]
    }
  }
  return base
}

// Permisos que un EDITOR puede conceder: el dueño/súper puede todos; otro solo
// los que él mismo posee (no se pueden otorgar permisos que no se tienen).
export function permisosConcedibles(editor) {
  if (!editor) return []
  if (editor.owner || editor.rol === 'owner') return TODOS_PERMISOS.slice()
  const mios = normalizarPermisos(editor.permisos)
  return TODOS_PERMISOS.filter((k) => mios[k] === true)
}

// Warehouses que un EDITOR puede asignar: dueño = todos (lista vacía = todos);
// otro solo los que él administra.
export function warehousesAsignables(editor, todosLosIds) {
  if (!editor || editor.owner || editor.rol === 'owner') return (todosLosIds || []).slice()
  return (Array.isArray(editor.warehouses) ? editor.warehouses : []).filter(Boolean)
}

// ¿El editor puede guardar estos cambios sobre el usuario destino?
// Reglas anti auto-elevación:
//   · nadie (salvo dueño) puede editar SU PROPIO documento de permisos;
//   · no se puede conceder un permiso que el editor no posee;
//   · no se puede asignar un warehouse que el editor no administra.
// Devuelve { ok, motivo }.
export function validarCambioPermisos(editor, destino, nuevo, todosLosIds) {
  if (!editor) return { ok: false, motivo: 'Sin editor.' }
  const esDueno = editor.owner || editor.rol === 'owner'
  if (esDueno) return { ok: true }
  // Auto-elevación: no editar los permisos propios.
  if (destino && editor.uid && destino.uid && editor.uid === destino.uid) {
    return { ok: false, motivo: 'No puedes modificar tus propios permisos.' }
  }
  if (destino && editor.email && destino.email && editor.email.toLowerCase() === destino.email.toLowerCase()) {
    return { ok: false, motivo: 'No puedes modificar tus propios permisos.' }
  }
  const concedibles = new Set(permisosConcedibles(editor))
  const permNuevos = normalizarPermisos(nuevo.permisos)
  for (const k of Object.keys(permNuevos)) {
    if (!concedibles.has(k)) return { ok: false, motivo: `No puedes conceder "${LABEL_PERM[k] || k}": tú no lo tienes.` }
  }
  const whOk = new Set(warehousesAsignables(editor, todosLosIds))
  for (const w of (nuevo.warehouses || [])) {
    if (!whOk.has(w)) return { ok: false, motivo: 'No puedes asignar un almacén que no administras.' }
  }
  return { ok: true }
}

// ¿El perfil Walmart tiene el permiso `key`? Respeta activo + alcance de almacén.
//   · dueño/súper → todo (se resuelve antes, en el contexto).
//   · inactivo → nada.
//   · si pasas almacenId y el usuario tiene warehouses, debe incluirlo.
export function tienePermisoWal(perfil, key, opts = {}) {
  if (!perfil) return false
  if (perfil.owner || perfil.rol === 'owner') return true
  if (perfil.activo === false) return false
  const { almacenId } = opts
  if (almacenId && Array.isArray(perfil.warehouses) && perfil.warehouses.length && !perfil.warehouses.includes(almacenId)) return false
  const p = normalizarPermisos(perfil.permisos)
  return p[key] === true
}

// ¿Puede ver/operar en este almacén? (alcance de warehouses)
export function enAlcanceAlmacen(perfil, almacenId) {
  if (!perfil || perfil.owner || perfil.rol === 'owner') return true
  if (!Array.isArray(perfil.warehouses) || perfil.warehouses.length === 0) return true
  return perfil.warehouses.includes(almacenId)
}

// Resumen legible de los accesos (para mostrar antes de guardar).
export function resumenPermisos(perfil, nombresAlmacen = {}) {
  const p = normalizarPermisos(perfil.permisos)
  const activos = TODOS_PERMISOS.filter((k) => p[k])
  const porCat = CATEGORIAS_PERM.map((c) => ({
    cat: c.label,
    perms: c.perms.filter((x) => p[x.id]).map((x) => x.label),
  })).filter((c) => c.perms.length)
  const wh = (Array.isArray(perfil.warehouses) && perfil.warehouses.length)
    ? perfil.warehouses.map((id) => nombresAlmacen[id] || id)
    : ['Todos los almacenes']
  return { nActivos: activos.length, porCat, warehouses: wh }
}
