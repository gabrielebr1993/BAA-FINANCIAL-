// ---------------------------------------------------------------------------
// Registro de cambios (auditoría). Se guarda dentro de settings/{companyId} en el
// campo `auditLog` usando arrayUnion (append ATÓMICO, sin condiciones de carrera),
// así no requiere colección nueva ni cambios en las reglas de Firestore: el staff
// ya puede escribir en settings de su empresa. La lectura sale gratis de `ajustes`
// (settings) que el DataContext ya carga.
// ---------------------------------------------------------------------------
import { doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'

// Etiquetas legibles + color por tipo de acción (para la UI).
export const ACCIONES = {
  pago_marcado: { label: 'Pago marcado', color: 'green' },
  pago_desmarcado: { label: 'Pago desmarcado', color: 'slate' },
  ajuste_guardado: { label: 'Ajuste (préstamo/bono)', color: 'gold' },
  claim_perdonado: { label: 'Claim perdonado', color: 'yellow' },
  claim_restaurado: { label: 'Claim restaurado', color: 'slate' },
  gasto_marcado: { label: 'Gasto fijo pagado', color: 'green' },
  gasto_desmarcado: { label: 'Gasto fijo pendiente', color: 'slate' },
  factura_subida: { label: 'Factura cargada', color: 'green' },
  factura_borrada: { label: 'Factura borrada', color: 'red' },
  pago_stripe: { label: 'Pago por Stripe', color: 'green' },
}

// Registra un evento. Best-effort: si falla (permisos/red) NO interrumpe la acción
// principal del usuario. `entrada` = { accion, entidad, detalle, usuario, rol, monto }.
export async function registrarAuditoria(companyId, entrada) {
  if (!companyId || !entrada?.accion) return
  const ent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    accion: entrada.accion,
    entidad: entrada.entidad || '',
    detalle: entrada.detalle || '',
    usuario: entrada.usuario || '',
    rol: entrada.rol || '',
    ...(entrada.monto != null ? { monto: Number(entrada.monto) || 0 } : {}),
    ...(entrada.ciudad ? { ciudad: entrada.ciudad } : {}),
    ...(entrada.semana ? { semana: entrada.semana } : {}),
  }
  try {
    await updateDoc(doc(db, 'settings', companyId), { auditLog: arrayUnion(ent) })
  } catch {
    // El doc de settings podría no existir aún: se crea con el primer evento.
    try { await setDoc(doc(db, 'settings', companyId), { auditLog: [ent] }, { merge: true }) } catch { /* noop */ }
  }
}

// Vacía el registro (mantenimiento; solo dueño). Deja las últimas `conservar` entradas.
export async function limpiarAuditoria(companyId, entradas, conservar = 200) {
  if (!companyId) return
  const ordenadas = [...(entradas || [])].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, conservar)
  await setDoc(doc(db, 'settings', companyId), { auditLog: ordenadas }, { merge: true }).catch(() => {})
}
