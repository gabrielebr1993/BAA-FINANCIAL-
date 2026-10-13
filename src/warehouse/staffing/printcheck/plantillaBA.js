// ============================================================================
// PRINT CHECK · Plantilla de impresión CLONADA del software anterior de B&A
// (coordenadas medidas del PDF real, 72 pt = 1 pulgada). Archivo PURO (sin
// React/Firebase) para poder validarla en pruebas automatizadas.
//
// El diseñador en vivo guarda ajustes por elemento en impresion.pos
// ({clave: {x, y, s}} en puntos); aquí se mezclan sobre las POSICIONES BASE,
// así la vista previa, la impresión y "Ver cheque" usan siempre lo mismo.
// Las etiquetas (DATE:, Amount:, Pay To:, MEMO:) acompañan a su valor.
// ============================================================================
import { numeroEnPalabras } from './logicaPrint'

// Posiciones base (x, y en puntos desde arriba-izquierda; s = tamaño).
export const POS_BASE = {
  empresa: { x: 31, y: 20, s: 11.5 },   // nombre de la compañía (+ dirección debajo)
  banco: { x: 262, y: 21, s: 10 },      // nombre del banco
  numero: { x: 490, y: 25, s: 10.5 },   // número de cheque (alineado a la derecha)
  fecha: { x: 500, y: 61, s: 10 },      // fecha (la etiqueta DATE: la acompaña)
  palabras: { x: 116, y: 100, s: 10 },  // importe en palabras (etiqueta Amount :)
  payto: { x: 118, y: 121, s: 10.5 },   // beneficiario (etiqueta Pay To :)
  importe: { x: 443, y: 121, s: 16 },   // $ **1,234.56 grande
  memo: { x: 32, y: 187, s: 8.5 },      // MEMO : texto
  firma: { x: 421, y: 158, s: 40 },     // recuadro de firma (s = alto del recuadro)
  micr: { x: 94, y: 226, s: 12 },       // línea MICR
}
export const ETIQUETAS_POS = {
  empresa: 'Compañía (membrete)', banco: 'Banco', numero: 'Número de cheque',
  fecha: 'Fecha', palabras: 'Importe en palabras', payto: 'Beneficiario (Pay To)',
  importe: 'Importe grande ($)', memo: 'Memo', firma: 'Firma', micr: 'Línea MICR',
}

export function htmlLote({ cheques, cuenta, empresa, firma, impresion, prueba }) {
  const offX = (Number(impresion.offX) || 0) * 72
  const offY = (Number(impresion.offY) || 0) * 72
  const preimpreso = impresion.papel === 'preimpreso'
  // posiciones efectivas = base + ajustes del diseñador
  const P = {}
  for (const k of Object.keys(POS_BASE)) {
    const o = (impresion.pos && impresion.pos[k]) || {}
    P[k] = {
      x: Number.isFinite(Number(o.x)) ? Number(o.x) : POS_BASE[k].x,
      y: Number.isFinite(Number(o.y)) ? Number(o.y) : POS_BASE[k].y,
      s: Number.isFinite(Number(o.s)) && Number(o.s) > 0 ? Number(o.s) : POS_BASE[k].s,
    }
  }
  const fFecha = (iso) => { const [a, m, d] = String(iso || '').split('-'); return m ? `${m}/${d}/${a}` : iso || '' }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const importeNum = (ch) => '**' + Number(ch.importe).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const palabras = (ch) => {
    // estilo del software anterior: "Three Hundred Ten and 70/100*****"
    const w = (numeroEnPalabras(ch.importe) || '').replace(/ DOLLARS$/, '').replace(/-/g, ' ')
    const t = w.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and')
    return t + '*****'
  }
  const el = (p, extra, contenido, clase = '') =>
    `<div class="el ${clase}" data-k="${p.k || ''}" style="left:${p.x}pt;top:${p.y}pt;font-size:${p.fs}pt;${extra || ''}">${contenido}</div>`
  const uno = (ch) => {
    const num = prueba ? '000000' : ch.numeroRaw
    return `
    <div class="pagina">
      ${prueba ? '<div class="muestra">SAMPLE — NON-NEGOTIABLE</div>' : ''}
      ${preimpreso ? '' : `
      ${el({ k: 'empresa', x: P.empresa.x, y: P.empresa.y, fs: P.empresa.s }, '', esc(empresa.nombre), 'b')}
      ${el({ k: 'empresa', x: P.empresa.x + 1, y: P.empresa.y + 15, fs: 9.5 }, '', esc(empresa.direccion1))}
      ${el({ k: 'empresa', x: P.empresa.x + 1, y: P.empresa.y + 28, fs: 9.5 }, '', esc(empresa.direccion2))}
      ${el({ k: 'banco', x: P.banco.x, y: P.banco.y, fs: P.banco.s }, '', esc(cuenta.banco), 'b')}
      ${el({ k: 'numero', x: P.numero.x, y: P.numero.y, fs: P.numero.s }, 'width:80pt;text-align:right', esc(num), 'b')}`}
      ${el({ k: 'fecha', x: P.fecha.x - 38, y: P.fecha.y - 1, fs: 10.5 }, '', 'DATE:', 'b')}
      ${el({ k: 'fecha', x: P.fecha.x, y: P.fecha.y, fs: P.fecha.s }, '', esc(fFecha(ch.fecha)))}
      ${el({ k: 'palabras', x: 33, y: P.palabras.y - 1, fs: 10.5 }, '', 'Amount :', 'b')}
      ${el({ k: 'palabras', x: P.palabras.x, y: P.palabras.y, fs: P.palabras.s }, 'width:320pt', esc(palabras(ch)), 'prop')}
      ${el({ k: 'payto', x: 33, y: P.payto.y - 1, fs: 10.5 }, '', 'Pay To :', 'b')}
      ${el({ k: 'payto', x: P.payto.x, y: P.payto.y, fs: P.payto.s }, 'width:300pt', esc(ch.beneficiario))}
      ${el({ k: 'importe', x: P.importe.x, y: P.importe.y, fs: P.importe.s }, '', '$ ' + esc(importeNum(ch)), 'b')}
      ${el({ k: 'memo', x: P.memo.x, y: P.memo.y, fs: P.memo.s }, '', 'MEMO : <span style="font-weight:400">' + esc(ch.memo) + '</span>', 'b')}
      <div class="el cajafirma" data-k="firma" style="left:${P.firma.x}pt;top:${P.firma.y}pt;width:154pt;height:${P.firma.s}pt"></div>
      ${firma ? `<img class="el" data-k="firma" src="${firma.imagen}" style="left:${P.firma.x + 12}pt;top:${P.firma.y + 2}pt;height:${P.firma.s - 4}pt" alt="" />` : ''}
      ${el({ k: 'firma', x: P.firma.x + 22, y: P.firma.y + P.firma.s + 3, fs: 8 }, 'color:#555;letter-spacing:.5px', 'AUTHORIZED SIGNATURE')}
      <div class="el linea" style="left:0;top:215pt;width:612pt"></div>
      ${impresion.mostrarMICR && !preimpreso ? el({ k: 'micr', x: P.micr.x, y: P.micr.y, fs: P.micr.s }, '', `(${esc(num)})&nbsp;&nbsp;&nbsp;&amp;${esc(cuenta.routing)}&amp;&nbsp;&nbsp;${esc(cuenta.numero)})`, 'micr') : ''}
      <div class="el linea" style="left:0;top:251pt;width:612pt"></div>
      <div class="el" style="left:26pt;top:273pt;font-size:10pt">${esc(fFecha(ch.fecha))}</div>
      <div class="el b" style="left:470pt;top:273pt;font-size:10pt;width:70pt;text-align:right">${esc(num)}</div>
      <div class="el" style="left:24pt;top:313pt;font-size:10pt">Pay To:</div>
      <div class="el" style="left:110pt;top:313pt;font-size:10.5pt;width:340pt">${esc(ch.beneficiario)}${ch.idEmpleado ? ' · ID ' + esc(ch.idEmpleado) : ''}</div>
      <div class="el" style="left:24pt;top:381pt;font-size:10pt">Pay From:</div>
      <div class="el" style="left:111pt;top:381pt;font-size:10.5pt">${esc(empresa.nombre)}</div>
      <div class="el" style="left:111pt;top:395pt;font-size:10pt">${esc(empresa.direccion1)}</div>
      <div class="el" style="left:111pt;top:409pt;font-size:10pt">${esc(empresa.direccion2)}</div>
      ${(ch.detalle || []).slice(0, 4).map((d, i) => `<div class="el det" style="left:111pt;top:${433 + i * 11}pt">${esc(d.posicion)}${d.horas != null ? ' · ' + d.horas + ' h' : ''} · $${Number(d.pago || 0).toFixed(2)}</div>`).join('')}
      <div class="el b" style="left:28pt;top:476pt;font-size:8.5pt">MEMO: <span style="font-weight:400">${esc(ch.memo)}</span></div>
      <div class="el b" style="left:440pt;top:475pt;font-size:10pt;width:100pt;text-align:right">${esc(importeNum(ch))}</div>
      <div class="el linea" style="left:0;top:515pt;width:612pt"></div>
    </div>`
  }
  const fontFace = impresion.fuenteMICR
    ? `@font-face{font-family:'MICRCustom';src:url(${impresion.fuenteMICR})}`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Checks</title><style>
    ${fontFace}
    @page{size:8.5in 11in;margin:0}
    body{margin:0;font-family:'Courier New',Courier,monospace;color:#111}
    .pagina{position:relative;width:612pt;height:792pt;page-break-after:always;overflow:hidden}
    .el{position:absolute;white-space:nowrap;transform:translate(${offX}pt,${offY}pt)}
    .b{font-weight:700}
    .prop{font-family:Arial,Helvetica,sans-serif}
    .det{font-size:8pt;color:#333}
    .cajafirma{border:1.5pt solid #111}
    .linea{border-top:0.8pt solid #444;height:0}
    .micr{font-family:'MICRCustom','MICR','MICR E13B','MICR Encoding','MICRe13b','E-13B','Courier New',monospace;font-weight:700;letter-spacing:1px}
    .muestra{position:absolute;top:220pt;left:60pt;font-size:52px;font-weight:900;color:rgba(200,30,30,.25);transform:rotate(-18deg);letter-spacing:4px;z-index:5}
  </style></head><body>${cheques.map(uno).join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
}
