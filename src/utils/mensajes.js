// Configuración de MENSAJES a choferes por empresa (SMS/WhatsApp/Correo).
// Se guarda en settings/{companyId}: numeroEmpresa + plantillas. Cada empresa tiene
// las suyas, independientes. Las plantillas usan variables entre llaves: {nombre},
// {enlace}, {pin}, {monto}, {semana}, {empresa}.

export const PLANTILLA_REGISTRO_DEFAULT =
  'Hola {nombre} 👋\n' +
  'Para registrar tus datos de pago (SSN, banco y tu W-9) entra a este enlace:\n' +
  '{enlace}\n\n' +
  'Tu PIN es: {pin}\n\n' +
  'Solo tú puedes usar este enlace. Cuando lo envíes, queda guardado y listo. ¡Gracias!\n' +
  '— {empresa}'

export const PLANTILLA_PAGO_DEFAULT =
  'Hola {nombre} 👋\n' +
  '¡Ya te pagamos! Te transferimos {monto} por la semana {semana}.\n' +
  'Puedes ver tu recibo en la app. ¡Gracias por tu trabajo!\n' +
  '— {empresa}'

// Rellena una plantilla sustituyendo {variables} por sus valores.
export function llenarPlantilla(tpl, vars = {}) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

// Nombre de la empresa para firmar el mensaje.
export function nombreEmpresa(ajustes, empresaActiva) {
  return (ajustes?.marca || empresaActiva?.nombre || 'MilePay').trim()
}

// Teléfono / correo del chofer si ya los tenemos (para prellenar el destinatario).
export const telChofer = (d) => String(d?.telefono || d?.verificacion?.telefono || '').replace(/[^\d+]/g, '')
export const emailChofer = (d) => String(d?.email || d?.accesoEmail || d?.verificacion?.email || '').trim()

// Construye los enlaces de envío para un chofer y un texto ya armado.
// SMS: "?&body=" funciona en iOS y Android. Correo: mailto. WhatsApp: wa.me.
export function enviosChofer(d, texto, asunto = 'Mensaje de tu empresa') {
  const t = encodeURIComponent(texto)
  const tel = telChofer(d)
  return {
    sms: `sms:${tel}?&body=${t}`,
    wa: `https://wa.me/${tel.replace(/\D/g, '')}?text=${t}`,
    mail: `mailto:${emailChofer(d)}?subject=${encodeURIComponent(asunto)}&body=${t}`,
  }
}
