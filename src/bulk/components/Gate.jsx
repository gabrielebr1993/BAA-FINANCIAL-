// ============================================================================
// BULK · Gate — muestra su contenido solo si el usuario tiene el permiso (RBAC).
// Uso:   <Gate perm="ordenes.crear"><Boton …>Nueva orden</Boton></Gate>
// Con condición extra: <Gate perm="clientes.eliminar" si={esDueno}> … </Gate>
// `fallback` (opcional) se muestra si NO tiene permiso (por defecto: nada).
//
// Nota de seguridad: ocultar un botón mejora la UX pero NO es la barrera real; la
// seguridad la imponen las reglas de Firestore. Esto refleja los permisos en la UI.
// ============================================================================
import { useBulkAuth } from '../BulkAuthContext'

export function Gate({ perm, si = true, fallback = null, children }) {
  const { puede } = useBulkAuth()
  if (perm && !puede(perm)) return fallback
  if (!si) return fallback
  return children
}

// Hook de conveniencia para lógica condicional (deshabilitar, ocultar columnas…).
export function usePuede() {
  return useBulkAuth().puede
}
