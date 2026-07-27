// ============================================================================
// BULK · Dominio · Constantes
// Módulo 100% independiente de "Package/MyPay". No importa nada del sistema
// existente. Aquí viven los enumerados y catálogos base del negocio de fletes.
// ============================================================================

// Límite físico de carga por viaje (ninguna orden puede exceder esto).
export const MAX_TON_POR_VIAJE = 25

// ---- Roles (independientes de los de Package) -----------------------------
export const BULK_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  DISPATCHER: 'dispatcher',
  CLIENTE: 'cliente',
  TRANSPORTISTA: 'transportista',
  CHOFER: 'chofer',
  SUPERVISOR_PLANTA: 'supervisor_planta',
}

export const BULK_ROLES_LABEL = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  dispatcher: 'Dispatcher',
  cliente: 'Cliente',
  transportista: 'Transportista',
  chofer: 'Chofer',
  supervisor_planta: 'Supervisor de Planta',
}

// ---- Estados de una orden (ciclo de vida completo) ------------------------
export const ORDEN_ESTADO = {
  CREADA: 'creada',
  EN_COLA: 'en_cola',
  NOTIFICANDO: 'notificando',
  ACEPTADA: 'aceptada',
  RECHAZADA: 'rechazada',
  EN_PLANTA: 'en_planta',
  CARGANDO: 'cargando',
  EN_RUTA: 'en_ruta',
  EN_DESTINO: 'en_destino',
  ENTREGADA: 'entregada',
  LIBERADA: 'liberada',
  CERRADA: 'cerrada',
  CANCELADA: 'cancelada',
}

export const ORDEN_ESTADO_LABEL = {
  creada: 'Creada',
  en_cola: 'En cola',
  notificando: 'Notificando…',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  en_planta: 'En planta',
  cargando: 'Cargando',
  en_ruta: 'En ruta',
  en_destino: 'En destino',
  entregada: 'Entregada',
  liberada: 'Liberada',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
}

// Marcas de tiempo que la orden registra automáticamente durante su ciclo.
export const ORDEN_HITOS = [
  { key: 'tomada', label: 'Tomada por el chofer' },
  { key: 'llegadaPlanta', label: 'Llegada a planta' },
  { key: 'carga', label: 'Carga' },
  { key: 'salidaPlanta', label: 'Salida de planta' },
  { key: 'llegadaDestino', label: 'Llegada a destino' },
  { key: 'entrega', label: 'Entrega' },
  { key: 'liberacion', label: 'Liberación (supervisor)' },
  { key: 'cierre', label: 'Cierre de la orden' },
]

// ---- Catálogos base (administrables; estos son solo las semillas) ---------
export const MATERIALES_SEED = [
  { nombre: 'Arena', unidad: 'ton' },
  { nombre: 'Piedra', unidad: 'ton' },
  { nombre: 'Grava', unidad: 'ton' },
  { nombre: 'Tierra', unidad: 'ton' },
  { nombre: 'Concreto', unidad: 'ton' },
  { nombre: 'Asfalto', unidad: 'ton' },
  { nombre: 'Material reciclado', unidad: 'ton' },
]

export const EQUIPOS_SEED = [
  'End Dump', 'Belly Dump', 'Dump Truck', 'Concrete Mixer', 'Flatbed',
  'Lowboy', 'Walking Floor', 'Side Dump', 'Tanker',
].map((nombre) => ({ nombre }))

// ---- Reglas del motor de tarifas (tipos soportados) -----------------------
export const REGLA_TARIFA_TIPOS = [
  'por_tonelada', 'por_milla', 'por_viaje', 'por_material', 'por_equipo',
  'por_cliente', 'por_planta', 'por_horario', 'por_urgencia', 'por_zona',
]
