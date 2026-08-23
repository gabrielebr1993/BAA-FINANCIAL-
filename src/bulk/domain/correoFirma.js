// BULK · Dominio · Firma corporativa de correo (lógica pura, compartida por la
// bandeja CRM y el envío de facturas). Genera la firma en HTML (identidad
// navy/dorado, estilos en línea = seguro para clientes de correo) y en texto.
export const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function firmaHtmlDe(f, de) {
  if (!f) return ''
  const linea2 = [f.cargo, f.empresa].filter(Boolean).join(' · ')
  const contacto = [
    f.telefono ? escHtml(f.telefono) : null,
    de ? `<a href="mailto:${escHtml(de)}" style="color:#c9a24b;text-decoration:none">${escHtml(de)}</a>` : null,
    f.web ? `<a href="https://${escHtml(String(f.web).replace(/^https?:\/\//, ''))}" style="color:#c9a24b;text-decoration:none">${escHtml(f.web)}</a>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')
  return `<br><br><table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse"><tr><td style="border-left:3px solid #c9a24b;padding:2px 0 2px 14px">` +
    `<div style="font-size:15px;font-weight:bold;color:#13233f">${escHtml(f.nombre || '')}</div>` +
    (linea2 ? `<div style="font-size:12px;color:#5b6b82;margin-top:2px">${escHtml(linea2)}</div>` : '') +
    (contacto ? `<div style="font-size:12px;color:#5b6b82;margin-top:5px">${contacto}</div>` : '') +
    (f.eslogan ? `<div style="font-size:11px;color:#94a3b8;margin-top:7px;font-style:italic">${escHtml(f.eslogan)}</div>` : '') +
    `</td></tr></table>`
}

export function firmaTextoDe(f, de) {
  if (!f) return ''
  return ['--', f.nombre, [f.cargo, f.empresa].filter(Boolean).join(' · '), [f.telefono, de, f.web].filter(Boolean).join(' · '), f.eslogan]
    .filter(Boolean).join('\n')
}

// Cuerpo HTML completo de un correo de texto plano + firma (si aplica).
export function cuerpoHtmlConFirma(cuerpo, firma, de) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap;line-height:1.5">${escHtml(cuerpo || '')}</div>${firmaHtmlDe(firma, de)}`
}
