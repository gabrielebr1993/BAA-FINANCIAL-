// ============================================================================
// PRINT CHECK · Plantilla CLONADA del software anterior de B&A (coordenadas
// medidas del PDF real; 72 pt = 1 pulgada). Archivo PURO (sin React/Firebase).
//
// La página se describe UNA sola vez como lista de elementos primitivos
// (elementosPagina) y de ahí salen las dos salidas IDÉNTICAS:
//   · htmlLote  → ventana de impresión / vista previa en vivo
//   · (pdfLote.js) → descarga en PDF con jsPDF, mismas coordenadas
// impresion.pos = ajustes del diseñador {clave: {x, y, s}} sobre POS_BASE.
// impresion.mostrarLineas (apagado por defecto): el papel EZ Checks ya trae
// su banda de seguridad y las rayas impresas estorban.
// ============================================================================
import { numeroEnPalabras } from './logicaPrint'
import { limpiarNombrePersona } from '../parserGofo'

export const POS_BASE = {
  empresa: { x: 31, y: 20, s: 11.5 },
  banco: { x: 262, y: 21, s: 10 },
  numero: { x: 490, y: 25, s: 10.5 },
  fecha: { x: 500, y: 61, s: 10 },
  palabras: { x: 116, y: 100, s: 10 },
  payto: { x: 118, y: 121, s: 10.5 },
  importe: { x: 443, y: 121, s: 16 },
  memo: { x: 32, y: 187, s: 8.5 },
  firma: { x: 421, y: 158, s: 40 },
  micr: { x: 94, y: 226, s: 12 },
}
export const ETIQUETAS_POS = {
  empresa: 'Compañía (membrete)', banco: 'Banco', numero: 'Número de cheque',
  fecha: 'Fecha', palabras: 'Importe en palabras', payto: 'Beneficiario (Pay To)',
  importe: 'Importe grande ($)', memo: 'Memo', firma: 'Firma', micr: 'Línea MICR',
}

export function posicionesEfectivas(impresion) {
  const P = {}
  for (const k of Object.keys(POS_BASE)) {
    const o = (impresion && impresion.pos && impresion.pos[k]) || {}
    P[k] = {
      x: Number.isFinite(Number(o.x)) ? Number(o.x) : POS_BASE[k].x,
      y: Number.isFinite(Number(o.y)) ? Number(o.y) : POS_BASE[k].y,
      s: Number.isFinite(Number(o.s)) && Number(o.s) > 0 ? Number(o.s) : POS_BASE[k].s,
    }
  }
  return P
}

const fFecha = (iso) => { const [a, m, d] = String(iso || '').split('-'); return m ? `${m}/${d}/${a}` : iso || '' }
const importeNum = (ch) => '**' + Number(ch.importe).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const palabrasDe = (ch) => {
  // estilo del software anterior: "Three Hundred Ten and 70/100*****"
  const w = (numeroEnPalabras(ch.importe) || '').replace(/ DOLLARS$/, '').replace(/-/g, ' ')
  const t = w.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and')
  return t + '*****'
}

// Lista de primitivos de UNA página (cheque + talón).
// {t:'tx', x, y, s, str, b?, f?('mono'|'prop'|'micr'|'det'), al?('r'), w?}
// {t:'img', x, y, h, src} · {t:'rect', x, y, w, h} · {t:'line', x, y, w}
export function elementosPagina({ ch, cuenta, empresa, firma, impresion, prueba }) {
  const P = posicionesEfectivas(impresion)
  const preimpreso = impresion.papel === 'preimpreso'
  const num = prueba ? '000000' : String(ch.numeroRaw || '')
  const els = []
  const tx = (id, x, y, s, str, extra) => els.push({ id, t: 'tx', x, y, s, str: String(str ?? ''), ...(extra || {}) })

  if (!preimpreso) {
    tx('empresa', P.empresa.x, P.empresa.y, P.empresa.s, empresa.nombre, { b: 1 })
    tx('empresaDir1', P.empresa.x + 1, P.empresa.y + 15, 9.5, empresa.direccion1)
    tx('empresaDir2', P.empresa.x + 1, P.empresa.y + 28, 9.5, empresa.direccion2)
    tx('banco', P.banco.x, P.banco.y, P.banco.s, cuenta.banco, { b: 1 })
    tx('numero', P.numero.x, P.numero.y, P.numero.s, num, { b: 1, al: 'r', w: 80 })
  }
  tx('fechaEtiqueta', P.fecha.x - 38, P.fecha.y - 1, 10.5, 'DATE:', { b: 1 })
  tx('fecha', P.fecha.x, P.fecha.y, P.fecha.s, fFecha(ch.fecha))
  tx('palabrasEtiqueta', 33, P.palabras.y - 1, 10.5, 'Amount :', { b: 1 })
  tx('palabras', P.palabras.x, P.palabras.y, P.palabras.s, palabrasDe(ch), { f: 'prop' })
  tx('paytoEtiqueta', 33, P.payto.y - 1, 10.5, 'Pay To :', { b: 1 })
  tx('payto', P.payto.x, P.payto.y, P.payto.s, limpiarNombrePersona(ch.beneficiario))
  tx('importe', P.importe.x, P.importe.y, P.importe.s, '$ ' + importeNum(ch), { b: 1 })
  tx('memo', P.memo.x, P.memo.y, P.memo.s, 'MEMO : ' + (ch.memo || ''), { b: 1 })
  els.push({ id: 'firmaCaja', t: 'rect', x: P.firma.x, y: P.firma.y, w: 154, h: P.firma.s })
  if (firma && firma.imagen) els.push({ id: 'firmaImagen', t: 'img', x: P.firma.x + 12, y: P.firma.y + 2, h: P.firma.s - 4, src: firma.imagen })
  tx('firmaEtiqueta', P.firma.x + 22, P.firma.y + P.firma.s + 3, 8, 'AUTHORIZED SIGNATURE', { f: 'det' })
  if (impresion.mostrarLineas) els.push({ id: 'linea1', t: 'line', x: 0, y: 215, w: 612 })
  if (impresion.mostrarMICR && !preimpreso) {
    tx('micr', P.micr.x, P.micr.y, P.micr.s, `(${num})   &${cuenta.routing || ''}&  ${cuenta.numero || ''})`, { f: 'micr', b: 1 })
  }
  if (impresion.mostrarLineas) els.push({ id: 'linea2', t: 'line', x: 0, y: 251, w: 612 })

  // ── talón ──
  tx('talonFecha', 26, 273, 10, fFecha(ch.fecha))
  tx('talonNumero', 470, 273, 10, num, { b: 1, al: 'r', w: 70 })
  tx('talonPaytoEtiqueta', 24, 313, 10, 'Pay To:')
  tx('talonPayto', 110, 313, 10.5, `${limpiarNombrePersona(ch.beneficiario)}${ch.idEmpleado ? ' · ID ' + ch.idEmpleado : ''}`)
  tx('talonPayfromEtiqueta', 24, 381, 10, 'Pay From:')
  tx('talonPayfrom', 111, 381, 10.5, empresa.nombre)
  tx('talonPayfromDir1', 111, 395, 10, empresa.direccion1)
  tx('talonPayfromDir2', 111, 409, 10, empresa.direccion2)
  ;(ch.detalle || []).slice(0, 4).forEach((d, i) => {
    const tarifa = d.tarifa != null ? Number(d.tarifa) : (Number(d.horas) > 0 ? Math.round((Number(d.pago) / Number(d.horas)) * 100) / 100 : null)
    tx('talonDetalle' + (i + 1), 111, 433 + i * 11, 8, `${d.posicion || ''}${d.horas != null ? ' · ' + d.horas + ' h' : ''}${tarifa != null ? ' · $' + tarifa.toFixed(2) + '/h' : ''} · $${Number(d.pago || 0).toFixed(2)}`, { f: 'det' })
  })
  tx('talonMemo', 28, 476, 8.5, 'MEMO: ' + (ch.memo || ''), { b: 1 })
  tx('talonImporte', 440, 475, 10, importeNum(ch), { b: 1, al: 'r', w: 100 })
  if (impresion.mostrarLineas) els.push({ id: 'linea3', t: 'line', x: 0, y: 515, w: 612 })

  // ajustes finos por elemento del diseñador: {id: {dx, dy, ds}}
  const finos = (impresion && impresion.pos2) || {}
  for (const e of els) {
    const o = finos[e.id]
    if (!o) continue
    e.x += Number(o.dx) || 0
    e.y += Number(o.dy) || 0
    if (e.t === 'tx' && Number.isFinite(Number(o.ds))) e.s = Math.max(4, e.s + Number(o.ds))
    if (e.t === 'img' && Number.isFinite(Number(o.ds))) e.h = Math.max(8, e.h + Number(o.ds))
    if (e.t === 'rect' && Number.isFinite(Number(o.ds))) e.h = Math.max(10, e.h + Number(o.ds))
  }
  return els
}

// Nombres legibles para el diseñador (clic sobre el elemento).
export const ETIQUETAS_EL = {
  empresa: 'Nombre de la compañía', empresaDir1: 'Dirección línea 1', empresaDir2: 'Dirección línea 2',
  banco: 'Banco', numero: 'Número de cheque', fechaEtiqueta: 'Etiqueta DATE:', fecha: 'Fecha',
  palabrasEtiqueta: 'Etiqueta Amount:', palabras: 'Importe en palabras', paytoEtiqueta: 'Etiqueta Pay To:',
  payto: 'Beneficiario', importe: 'Importe grande ($)', memo: 'Memo del cheque',
  firmaCaja: 'Recuadro de la firma', firmaImagen: 'Imagen de la firma', firmaEtiqueta: 'AUTHORIZED SIGNATURE',
  micr: 'Línea MICR (números del banco)', linea1: 'Raya 1 (fin del cheque)', linea2: 'Raya 2 (bajo la MICR)', linea3: 'Raya 3 (fin del talón)',
  talonFecha: 'Talón · fecha', talonNumero: 'Talón · número', talonPaytoEtiqueta: 'Talón · etiqueta Pay To',
  talonPayto: 'Talón · beneficiario', talonPayfromEtiqueta: 'Talón · etiqueta Pay From', talonPayfrom: 'Talón · compañía',
  talonPayfromDir1: 'Talón · dirección 1', talonPayfromDir2: 'Talón · dirección 2',
  talonDetalle1: 'Talón · detalle 1', talonDetalle2: 'Talón · detalle 2', talonDetalle3: 'Talón · detalle 3', talonDetalle4: 'Talón · detalle 4',
  talonMemo: 'Talón · memo', talonImporte: 'Talón · importe',
}

// ── Salida HTML (impresión del navegador / vista previa) ───────────────────
export function htmlLote({ cheques, cuenta, empresa, firma, impresion, prueba }) {
  const offX = (Number(impresion.offX) || 0) * 72
  const offY = (Number(impresion.offY) || 0) * 72
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const el = (e) => {
    if (e.t === 'line') return `<div class="el linea" style="left:${e.x}pt;top:${e.y}pt;width:${e.w}pt"></div>`
    if (e.t === 'rect') return `<div class="el cajafirma" style="left:${e.x}pt;top:${e.y}pt;width:${e.w}pt;height:${e.h}pt"></div>`
    if (e.t === 'img') return `<img class="el" src="${e.src}" style="left:${e.x}pt;top:${e.y}pt;height:${e.h}pt" alt="" />`
    const clase = ['el', e.b ? 'b' : '', e.f === 'prop' ? 'prop' : '', e.f === 'det' ? 'det' : '', e.f === 'micr' ? 'micr' : ''].filter(Boolean).join(' ')
    const ancho = e.al === 'r' ? `width:${e.w}pt;text-align:right;` : ''
    return `<div class="${clase}" style="left:${e.x}pt;top:${e.y}pt;font-size:${e.s}pt;${ancho}">${esc(e.str)}</div>`
  }
  const uno = (ch) => `
    <div class="pagina">
      ${prueba ? '<div class="muestra">SAMPLE — NON-NEGOTIABLE</div>' : ''}
      ${elementosPagina({ ch, cuenta, empresa, firma, impresion, prueba }).map(el).join('')}
    </div>`
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
    .det{color:#333}
    .cajafirma{border:1.5pt solid #111}
    .linea{border-top:0.8pt solid #444;height:0}
    .micr{font-family:'MICRCustom','MICR','MICR E13B','MICR Encoding','MICRe13b','E-13B','Courier New',monospace;letter-spacing:1px}
    .muestra{position:absolute;top:220pt;left:60pt;font-size:52px;font-weight:900;color:rgba(200,30,30,.25);transform:rotate(-18deg);letter-spacing:4px;z-index:5}
  </style></head><body>${cheques.map(uno).join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
}
