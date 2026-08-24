// ============================================================================
// BULK · Impresión de TICKETS por iframe oculto.
// window.print() sobre la página completa falla o imprime mal en la PWA
// instalada (Android/iOS) y depende del CSS @media print de toda la app. Aquí
// construimos un documento HTML AUTOCONTENIDO (solo el ticket, estilos en
// línea, ancho tipo comprobante ~80 mm compatible con impresoras térmicas) en
// un <iframe> oculto de la MISMA página (no abre ventanas → nada que el
// navegador pueda bloquear) y llamamos a print() del iframe: se abre el
// diálogo del sistema y el usuario elige su impresora.
// Devuelve true si se pudo invocar; false si el dispositivo no da acceso al
// servicio de impresión (el llamador muestra un aviso y ofrece el PDF).
// ============================================================================

const esc = (s) => String(s == null || s === '' ? '—' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fFecha = (s) => {
  if (!s) return '—'
  try { return new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return String(s) }
}

function filasHtml(pares) {
  return pares.map(([l, v]) => `
    <div class="fila"><span class="lbl">${esc(l)}</span><span class="val">${esc(v)}</span></div>`).join('')
}

export function htmlTicket(datos, empresa = 'Freight') {
  const carga = datos.event === 'Loaded'
  const filas = filasHtml([
    ['Ticket Number', datos.ticketNumber || datos.ordenNumero],
    ['Job', datos.jobLabel],
    ['Date', fFecha(datos.date)],
    ['Event', datos.event],
    ['Supplier', datos.supplier],
    ['Material', datos.material],
    ['Origin', datos.origin],
    ['Batch Plant Location', datos.batchPlant],
    ['Quantity', `${datos.quantity ?? '—'} ${datos.unit || ''}`.trim()],
    ['Carrier', datos.carrier],
    ['Truck #', datos.truck],
    ...(datos.destino ? [[carga ? 'Destination' : 'Delivered to', datos.destino]] : []),
  ])
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(datos.ticketNumber || datos.ordenNumero || 'Ticket')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #1e293b; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .ticket { width: 80mm; max-width: 100%; margin: 0 auto; padding: 4mm 3mm; }
  .cab { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2mm; }
  .empresa { font-size: 13px; font-weight: 900; color: #13233f; }
  .tipo { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #c9a24b; }
  .evento { font-size: 9px; font-weight: 900; color: #fff; background: ${carga ? '#3f9d6b' : '#13233f'}; border-radius: 3px; padding: 1px 5px; }
  .num { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 15px; font-weight: 900; color: #13233f; margin-bottom: 2mm; }
  .fila { display: flex; justify-content: space-between; gap: 8px; padding: 1.2mm 0; border-bottom: 1px dashed #cbd5e1; font-size: 10.5px; }
  .lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; align-self: center; }
  .val { font-weight: 700; text-align: right; }
  .firma { margin-top: 8mm; }
  .firma .linea { border-bottom: 1px solid #64748b; height: 9mm; }
  .firma .pie, .obs .pie { font-size: 7.5px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; margin-top: 1mm; }
  .obs { margin-top: 4mm; }
  .obs .linea { border-bottom: 1px dashed #cbd5e1; height: 7mm; }
  @page { margin: 5mm; }
  @media print { .ticket { width: 100%; } }
</style></head><body>
  <div class="ticket">
    <div class="cab">
      <div><div class="empresa">${esc(empresa)}</div><div class="tipo">${carga ? 'Loading Ticket' : 'Delivery Ticket'}</div></div>
      <div class="evento">${esc(datos.event)}</div>
    </div>
    <div class="num">${esc(datos.ticketNumber || datos.ordenNumero)}</div>
    ${filas}
    <div class="firma"><div class="linea"></div><div class="pie">${carga ? 'Firma del supervisor de planta' : 'Firma de quien recibe'}</div></div>
    ${carga ? '' : '<div class="obs"><div class="pie">Observaciones</div><div class="linea"></div></div>'}
  </div>
</body></html>`
}

// Imprime el ticket con el diálogo del sistema. Resuelve true si se invocó la
// impresión, false si el navegador/dispositivo no lo permite.
export function imprimirTicket(datos, empresa = 'Freight') {
  return new Promise((resolve) => {
    let frame = null
    const limpiar = () => { try { frame && frame.remove() } catch { /* noop */ } }
    try {
      frame = document.createElement('iframe')
      // Oculto pero PRESENTE (display:none rompe print() en algunos navegadores).
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
      document.body.appendChild(frame)
      const fdoc = frame.contentWindow?.document
      if (!fdoc) { limpiar(); resolve(false); return }
      fdoc.open(); fdoc.write(htmlTicket(datos, empresa)); fdoc.close()
      let hecho = false
      const lanzar = () => {
        if (hecho) return
        hecho = true
        try {
          const w = frame.contentWindow
          // Al cerrar el diálogo (imprimir o cancelar) retiramos el iframe.
          try { w.onafterprint = () => setTimeout(limpiar, 300) } catch { /* noop */ }
          w.focus()
          w.print()
          // Respaldo por si onafterprint no dispara (iOS): limpiar tarde.
          setTimeout(limpiar, 60000)
          resolve(true)
        } catch { limpiar(); resolve(false) }
      }
      // Espera a que el iframe cargue; respaldo por timeout (srcdoc-less write
      // suele estar listo de inmediato, pero iOS a veces tarda un tick).
      frame.onload = () => setTimeout(lanzar, 50)
      setTimeout(lanzar, 400)
    } catch {
      limpiar(); resolve(false)
    }
  })
}
