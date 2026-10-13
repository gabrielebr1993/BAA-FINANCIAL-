// ============================================================================
// PRINT CHECK · Plantilla de impresión CLONADA del software anterior de B&A
// (coordenadas medidas del PDF real, 72 pt = 1 pulgada). Archivo PURO (sin
// React/Firebase) para poder validarla en pruebas automatizadas.
// ============================================================================
import { numeroEnPalabras } from './logicaPrint'

// ── IMPRESIÓN · plantilla CLONADA del software anterior de B&A ─────────────
// Coordenadas tomadas del PDF real (página carta en puntos, 72 pt = 1 in):
// cheque arriba (compañía izq, banco centro, número der, DATE, Amount en
// palabras con *****, Pay To, $ **importe, MEMO, AUTHORIZED SIGNATURE, línea
// MICR "(num) &routing& cuenta)") + talón con Pay To / Pay From / MEMO.
export function htmlLote({ cheques, cuenta, empresa, firma, impresion, prueba }) {
  const offX = (Number(impresion.offX) || 0) * 72
  const offY = (Number(impresion.offY) || 0) * 72
  const fFecha = (iso) => { const [a, m, d] = String(iso || '').split('-'); return m ? `${m}/${d}/${a}` : iso || '' }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const importeNum = (ch) => '**' + Number(ch.importe).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const palabras = (ch) => {
    // estilo del software anterior: "Three Hundred Ten and 70/100*****"
    // (Title Case, sin guiones, sin la palabra DOLLARS, relleno de *****)
    const w = (numeroEnPalabras(ch.importe) || '').replace(/ DOLLARS$/, '').replace(/-/g, ' ')
    const t = w.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and')
    return t + '*****'
  }
  const uno = (ch) => {
    const num = prueba ? '000000' : ch.numeroRaw
    return `
    <div class="pagina">
      ${prueba ? '<div class="muestra">SAMPLE — NON-NEGOTIABLE</div>' : ''}
      <div class="el b" style="left:31pt;top:20pt;font-size:11.5pt">${esc(empresa.nombre)}</div>
      <div class="el b" style="left:262pt;top:21pt;font-size:10pt">${esc(cuenta.banco)}</div>
      <div class="el b" style="left:490pt;top:25pt;font-size:10.5pt;width:80pt;text-align:right">${esc(num)}</div>
      <div class="el" style="left:32pt;top:35pt;font-size:9.5pt">${esc(empresa.direccion1)}</div>
      <div class="el" style="left:32pt;top:48pt;font-size:9.5pt">${esc(empresa.direccion2)}</div>
      <div class="el b" style="left:462pt;top:60pt;font-size:10.5pt">DATE:</div>
      <div class="el" style="left:500pt;top:61pt;font-size:10pt">${esc(fFecha(ch.fecha))}</div>
      <div class="el b" style="left:33pt;top:99pt;font-size:10.5pt">Amount :</div>
      <div class="el prop" style="left:116pt;top:100pt;font-size:10pt;width:320pt">${esc(palabras(ch))}</div>
      <div class="el b" style="left:33pt;top:120pt;font-size:10.5pt">Pay To :</div>
      <div class="el" style="left:118pt;top:121pt;font-size:10.5pt;width:300pt">${esc(ch.beneficiario)}</div>
      <div class="el b" style="left:443pt;top:121pt;font-size:16pt">$ ${esc(importeNum(ch))}</div>
      <div class="el b" style="left:32pt;top:187pt;font-size:8.5pt">MEMO : <span style="font-weight:400">${esc(ch.memo)}</span></div>
      <div class="el cajafirma" style="left:421pt;top:158pt;width:154pt;height:40pt"></div>
      ${firma ? `<img class="el" src="${firma.imagen}" style="left:433pt;top:160pt;height:36pt" alt="" />` : ''}
      <div class="el" style="left:443pt;top:201pt;font-size:8pt;color:#555;letter-spacing:.5px">AUTHORIZED SIGNATURE</div>
      <div class="el linea" style="left:0;top:215pt;width:612pt"></div>
      ${impresion.mostrarMICR ? `
      <div class="el micr" style="left:94pt;top:226pt">(${esc(num)})&nbsp;&nbsp;&nbsp;&amp;${esc(cuenta.routing)}&amp;&nbsp;&nbsp;${esc(cuenta.numero)})</div>` : ''}
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Checks</title><style>
    @page{size:8.5in 11in;margin:0}
    body{margin:0;font-family:'Courier New',Courier,monospace;color:#111}
    .pagina{position:relative;width:612pt;height:792pt;page-break-after:always;overflow:hidden}
    .el{position:absolute;white-space:nowrap;transform:translate(${offX}pt,${offY}pt)}
    .b{font-weight:700}
    .prop{font-family:Arial,Helvetica,sans-serif}
    .det{font-size:8pt;color:#333}
    .cajafirma{border:1.5pt solid #111}
    .linea{border-top:0.8pt solid #444;height:0}
    .micr{font-family:'MICR E13B','MICR','Courier New',monospace;font-size:12pt;font-weight:700;letter-spacing:1px}
    .muestra{position:absolute;top:220pt;left:60pt;font-size:52px;font-weight:900;color:rgba(200,30,30,.25);transform:rotate(-18deg);letter-spacing:4px;z-index:5}
  </style></head><body>${cheques.map(uno).join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
}

