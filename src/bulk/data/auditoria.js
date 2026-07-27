// BULK · Auditoría completa: usuario, fecha/hora, IP, dispositivo y cambios.
import { crear } from './repo'

export async function auditar(tenantId, { usuario, rol, accion, entidad, entidadId, detalle, cambios }) {
  try {
    await crear('audit', tenantId, {
      usuario: usuario || 'desconocido',
      rol: rol || '',
      accion,
      entidad: entidad || '',
      entidadId: entidadId || '',
      detalle: detalle || '',
      cambios: cambios || null,
      ip: null, // se completa en backend (aquí no es confiable)
      dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      ts: new Date().toISOString(),
    })
  } catch { /* la auditoría nunca debe romper la operación */ }
}
