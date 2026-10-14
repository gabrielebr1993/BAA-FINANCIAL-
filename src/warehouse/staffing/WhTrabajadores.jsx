// ============================================================================
// WAREHOUSE / STAFFING · Perfiles ÚNICOS de trabajadores e historial semanal.
//
// · El perfil se crea automáticamente al importar y se reutiliza después.
// · Alias para variantes verificadas del mismo nombre (nunca se unen solos:
//   los posibles duplicados quedan en una lista de revisión con botón "Unir").
// · Una persona con varias posiciones en la semana = UN perfil con registros
//   separados por posición, agregados al final.
// · Por período: posición/agencia/warehouse, horas, tarifas e ingreso de Gofo,
//   mis tarifas y pago calculado, ajustes, cheques, pagado real y saldo.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner, EstadoVacio } from '../../components/ui'
import { Users, ArrowLeft, Link2, FileDown, Printer } from 'lucide-react'
import { COL, cargar, auditarStaff, escribirEnLotes, refDoc, setDoc, arrayUnion } from './datosStaff'
import { Select } from '../../components/ui'
import { normalizarNombre, limpiarNombrePersona } from './parserGofo'
import { htmlLote } from './printcheck/plantillaBA'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WhTrabajadores({ user, perfilInicial }) {
  const [datos, setDatos] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [nuevaExterna, setNuevaExterna] = useState('')
  const [sel, setSel] = useState(perfilInicial?.id || null)
  useEffect(() => { if (perfilInicial?.id) setSel(perfilInicial.id) }, [perfilInicial])
  const recargar = async () => {
    const [workers, registros, ajustes, cheques, grupos, pcCuentas, pcFirmas, pcConfig] = await Promise.all([
      cargar(COL.workers), cargar(COL.registros), cargar(COL.ajustes), cargar(COL.cheques), cargar(COL.grupos),
      cargar('wh_pc_cuentas'), cargar('wh_pc_firmas'), cargar('wh_pc_config'),
    ])
    setDatos({
      workers, registros, ajustes, cheques, grupos,
      pc: {
        cuentas: pcCuentas, firmas: pcFirmas,
        empresa: pcConfig.find((c) => c.id === 'empresa') || { nombre: 'B&A American Group', direccion1: '5605 FM 423 STE 500-313', direccion2: 'FRISCO TEXAS 75036' },
        impresion: pcConfig.find((c) => c.id === 'impresion') || { offX: 0, offY: 0, mostrarMICR: true, papel: 'blanco' },
      },
    })
  }
  useEffect(() => { recargar() }, [])
  if (!datos) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando perfiles…</div>

  const activos = datos.workers.filter((w) => !w.fusionadoEn)
  const duplicados = activos.filter((w) => w.posibleDuplicadoDe && datos.workers.some((x) => x.id === w.posibleDuplicadoDe))

  // Nombres con sufijo numérico del archivo ("Alberto Leon 3"): limpieza en
  // un clic — el nombre viejo queda como ALIAS para que futuras importaciones
  // (con o sin sufijo) sigan cayendo en el mismo perfil.
  // Personas EXTERNAS (fuera de Gofo): perfil manual para que sus cheques
  // queden agrupados igual que los de un trabajador del staffing.
  const agregarExterna = async () => {
    const nombre = limpiarNombrePersona(nuevaExterna)
    if (!nombre) return
    const norm = normalizarNombre(nombre)
    if (activos.some((w) => w.nombreNorm === norm || (w.alias || []).includes(norm))) { window.alert('Ya existe un perfil con ese nombre.'); return }
    const id = 'ext_' + norm.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    await setDoc(refDoc(COL.workers, id), { nombre, nombreNorm: norm, alias: [], externo: true, creadoPor: user.email, creadoEn: new Date().toISOString() })
    await auditarStaff('worker_externo_creado', nombre)
    setNuevaExterna('')
    recargar()
  }

  const conSufijo = activos.filter((w) => limpiarNombrePersona(w.nombre) !== w.nombre)
  const limpiarSufijos = async () => {
    if (!window.confirm(`¿Limpiar ${conSufijo.length} nombre(s)? Se quitan los números y las etiquetas en chino (叉车, 分拣工, 清洁工) del final. El nombre original queda como alias (nada se duplica ni se pierde).`)) return
    const normsExistentes = new Set(activos.map((w) => w.nombreNorm))
    const ops = []
    let saltados = 0
    for (const w of conSufijo) {
      const limpio = limpiarNombrePersona(w.nombre)
      const normLimpio = normalizarNombre(limpio)
      // si YA existe otro perfil con el nombre limpio, no se toca (revisión manual)
      if (normLimpio !== w.nombreNorm && normsExistentes.has(normLimpio)) { saltados++; continue }
      ops.push({ ref: refDoc(COL.workers, w.id), merge: true, data: { nombre: limpio, nombreNorm: normLimpio, alias: arrayUnion(w.nombreNorm) } })
      normsExistentes.add(normLimpio)
    }
    if (ops.length) await escribirEnLotes(ops)
    await auditarStaff('workers_sufijos_limpiados', `${ops.length} nombres limpiados${saltados ? `, ${saltados} saltados por coincidir con otro perfil` : ''}`)
    recargar()
  }

  if (sel) {
    const w = datos.workers.find((x) => x.id === sel)
    return <PerfilWorker w={w} datos={datos} user={user} volver={() => setSel(null)} recargar={recargar} />
  }

  const lista = activos
    .map((w) => {
      const regs = datos.registros.filter((r) => r.workerId === w.id)
      const aj = datos.ajustes.filter((a) => a.workerId === w.id && a.estado !== 'revision').reduce((s, a) => s + (a.importe || 0), 0)
      const calc = regs.reduce((s, r) => s + (r.miPago || 0), 0) + aj
      const chequesW = datos.cheques.filter((c) => c.workerId === w.id && c.estado !== 'cancelado')
      const emitido = chequesW.reduce((s, c) => s + (c.importe || 0), 0)
      const cobradoCheques = chequesW.filter((c) => c.estado === 'cobrado').reduce((s, c) => s + (c.importe || 0), 0)
      // estado de pago derivado de sus cheques: pagado / en tránsito / por pagar
      const estadoPago = calc <= 0.01 ? null
        : cobradoCheques >= calc - 0.01 ? { color: 'green', texto: 'pagado' }
        : emitido >= calc - 0.01 ? { color: 'gold', texto: 'cheque en tránsito' }
        : { color: 'red', texto: `por pagar $${(Math.round((calc - emitido) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` }
      return { w, periodos: new Set(regs.map((r) => r.periodoId)).size, horas: regs.reduce((s, r) => s + (r.horasTotal || 0), 0), calc, cobradoCheques, estadoPago }
    })
    .filter((x) => !buscar || x.w.nombreNorm.includes(normalizarNombre(buscar)))
    .sort((a, b) => b.horas - a.horas)

  return (
    <div>
      <PageTitle>Trabajadores · perfiles e historial</PageTitle>
      {duplicados.length > 0 && (
        <Aviso tipo="warn" className="mb-4">
          <b>Posibles duplicados para revisar</b> (no se unen solos):
          <div className="mt-2 space-y-1">
            {duplicados.map((w) => {
              const otro = datos.workers.find((x) => x.id === w.posibleDuplicadoDe)
              return (
                <div key={w.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <b>{w.nombre}</b> <span className="text-slate-400">podría ser la misma persona que</span> <b>{otro?.nombre}</b>
                  <Boton variant="ghost" onClick={() => unir(w, otro, datos, user, recargar)}><Link2 size={13} /> Unir (alias)</Boton>
                  <Boton variant="ghost" onClick={() => descartarDuplicado(w, recargar)}>Son personas distintas</Boton>
                </div>
              )
            })}
          </div>
        </Aviso>
      )}
      {conSufijo.length > 0 && (
        <Aviso tipo="info" className="mb-4">
          <b>{conSufijo.length} nombres traen sufijos del archivo</b> — números o etiquetas en chino (p. ej. "{conSufijo[0].nombre}").
          <Boton variant="ghost" className="ml-2" onClick={limpiarSufijos}>Limpiar todos los nombres</Boton>
          <span className="ml-2 text-[11px] text-slate-400">Quita el número y las letras chinas del final; el nombre viejo queda como alias y las importaciones nuevas ya vienen limpias.</span>
        </Aviso>
      )}
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[220px] flex-1" placeholder="Buscar trabajador…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <Input className="w-56" placeholder="Nombre de persona externa…" value={nuevaExterna} onChange={(e) => setNuevaExterna(e.target.value)} />
          <Boton variant="ghost" disabled={!nuevaExterna.trim()} onClick={agregarExterna}>+ Agregar externa</Boton>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">Externa = alguien fuera de Gofo (limpieza, proveedores…): tendrá su perfil con el historial de sus cheques.</div>
      </Card>
      {lista.length === 0 && <EstadoVacio icono={Users} titulo="Sin trabajadores todavía" texto="Importa un período de Gofo en la pestaña Staffing Gofo y los perfiles se crean solos." mostrarBoton={false} />}
      <div className="grid gap-2">
        {lista.map(({ w, periodos, horas, calc, cobradoCheques, estadoPago }) => (
          <Card key={w.id} className="cursor-pointer p-3 hover:shadow-md" onClick={() => setSel(w.id)}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-brand-navy dark:text-slate-100">{w.nombre}</span>
              {w.idEmpleado && <Badge color="navy">{w.idEmpleado}</Badge>}
              {w.externo && <Badge color="slate">externa</Badge>}
              {estadoPago && <Badge color={estadoPago.color}>{estadoPago.texto}</Badge>}
              {(w.alias || []).length > 0 && <Badge color="slate">{w.alias.length} alias</Badge>}
              <span className="ml-auto text-xs text-slate-400">{periodos} semanas · {Math.round(horas * 100) / 100} h · calculado {dinero(calc)} · cobrado {dinero(cobradoCheques)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

async function unir(dup, principal, datos, user, recargar) {
  // mueve registros/ajustes/cheques del duplicado al principal + alias; auditable
  const ops = []
  for (const r of datos.registros.filter((x) => x.workerId === dup.id)) ops.push({ ref: refDoc(COL.registros, r.id), merge: true, data: { workerId: principal.id } })
  for (const a of datos.ajustes.filter((x) => x.workerId === dup.id)) ops.push({ ref: refDoc(COL.ajustes, a.id), merge: true, data: { workerId: principal.id } })
  for (const c of datos.cheques.filter((x) => x.workerId === dup.id)) ops.push({ ref: refDoc(COL.cheques, c.id), merge: true, data: { workerId: principal.id } })
  ops.push({ ref: refDoc(COL.workers, principal.id), merge: true, data: { alias: arrayUnion(dup.nombreNorm) } })
  ops.push({ ref: refDoc(COL.workers, dup.id), merge: true, data: { fusionadoEn: principal.id, posibleDuplicadoDe: null } })
  await escribirEnLotes(ops)
  await auditarStaff('workers_unidos', `"${dup.nombre}" unido a "${principal.nombre}" como alias`)
  recargar()
}
async function descartarDuplicado(w, recargar) {
  await setDoc(refDoc(COL.workers, w.id), { posibleDuplicadoDe: null, duplicadoDescartado: true }, { merge: true })
  await auditarStaff('duplicado_descartado', w.nombre)
  recargar()
}

function PerfilWorker({ w, datos, user, volver, recargar }) {
  const regs = datos.registros.filter((r) => r.workerId === w.id)
  const ajustes = datos.ajustes.filter((a) => a.workerId === w.id)
  const cheques = datos.cheques.filter((c) => c.workerId === w.id)
  const porPeriodo = useMemo(() => {
    const m = {}
    for (const r of regs) {
      m[r.periodoId] = m[r.periodoId] || { inicio: r.inicio, fin: r.fin, filas: [] }
      m[r.periodoId].filas.push(r)
    }
    return Object.entries(m).sort((a, b) => String(b[1].inicio).localeCompare(a[1].inicio))
  }, [regs])

  const calc = regs.reduce((s, r) => s + (r.miPago || 0), 0) + ajustes.reduce((s, a) => s + (a.importe || 0), 0)
  const emitido = cheques.filter((c) => c.estado !== 'cancelado').reduce((s, c) => s + (c.importe || 0), 0)
  const cobrado = cheques.filter((c) => c.estado === 'cobrado').reduce((s, c) => s + (c.importe || 0), 0)

  const posiciones = [...new Set(regs.map((r) => r.posicion).filter(Boolean))]
  const horasTot = Math.round(regs.reduce((s, r) => s + (r.horasTotal || 0), 0) * 100) / 100
  const grupoNombre = w.grupoId ? (datos.grupos.find((g) => g.id === w.grupoId)?.nombre || w.grupoId) : null
  const iniciales = (w.nombre || '?').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

  // ── Exportar historial completo a CSV (abre en Excel) ─────────────────────
  const exportarCSV = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const enc = ['Semana inicio', 'Semana fin', 'Concepto', 'Posición', 'Agencia', 'Warehouse', 'Días trabajados', 'Horas totales', 'Horas reg', 'Horas OT', 'Mi tarifa reg', 'Mi tarifa OT', 'Pago', 'Cheque(s)']
    const lineas = [enc.map(esc).join(',')]
    for (const [pid, p] of porPeriodo.slice().reverse()) {
      const chP = cheques.filter((c) => (c.distribucion || []).some((d) => d.periodoId === pid))
      const chTxt = chP.map((c) => `#${c.numeroRaw || c.numeroNorm} (${c.estado})`).join(' · ')
      p.filas.forEach((r, i) => lineas.push([
        r.inicio, r.fin, 'Trabajo', r.posicion, r.agencia || '', r.warehouse || '',
        Object.values(r.dias || {}).filter((h) => (Number(h) || 0) > 0).length,
        r.horasTotal, r.horasReg, r.horasOT, r.miTarifaReg ?? '', r.miTarifaOT ?? '', r.miPago ?? '',
        i === 0 ? chTxt : '',
      ].map(esc).join(',')))
      for (const a of ajustes.filter((x) => x.periodoAplicaId === pid)) {
        lineas.push([p.inicio, p.fin, `Ajuste: ${a.concepto}`, '', '', '', '', '', '', '', '', '', a.importe, ''].map(esc).join(','))
      }
    }
    const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `historial_${(w.nombre || 'trabajador').replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    auditarStaff('historial_exportado', `${w.nombre}: CSV con ${regs.length} registros`)
  }

  // ── Paystub imprimible de UNA semana (ventana lista para imprimir/PDF) ────
  const paystub = (pid, p) => {
    const ajP = ajustes.filter((a) => a.periodoAplicaId === pid)
    const chP = cheques.filter((c) => (c.distribucion || []).some((d) => d.periodoId === pid))
    const subtotal = p.filas.reduce((s, r) => s + (r.miPago || 0), 0)
    const totAj = ajP.reduce((s, a) => s + (a.importe || 0), 0)
    const fmt = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    const filasHtml = p.filas.map((r) => `
      <tr><td>${r.posicion || ''}</td><td class="n">${r.horasReg ?? ''}</td><td class="n">${r.horasOT ?? ''}</td>
      <td class="n">${fmt(r.miTarifaReg)}</td><td class="n">${fmt(r.miTarifaOT)}</td><td class="n"><b>${fmt(r.miPago)}</b></td></tr>`).join('')
    const ajHtml = ajP.map((a) => `<tr><td colspan="5">Ajuste: ${a.concepto}</td><td class="n"><b>${fmt(a.importe)}</b></td></tr>`).join('')
    const chHtml = chP.length
      ? `<p class="meta">Cheque(s): ${chP.map((c) => `#${c.numeroRaw || c.numeroNorm} ${fmt((c.distribucion || []).find((d) => d.periodoId === pid)?.importe)} [${c.estado}]`).join(' · ')}</p>`
      : ''
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Paystub · ${w.nombre} · ${p.inicio}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#13233f;margin:40px;font-size:13px}
        .cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #13233f;padding-bottom:12px;margin-bottom:16px}
        .logo{font-size:22px;font-weight:900}.logo span{color:#b78a2e}
        h1{font-size:16px;margin:0 0 2px}
        .meta{color:#5b6b85;font-size:12px;margin:2px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b85;text-align:left;border-bottom:1px solid #d7dce6;padding:6px 8px}
        td{padding:7px 8px;border-bottom:1px solid #eef1f6}
        .n{text-align:right}
        .tot td{border-top:2px solid #13233f;border-bottom:none;font-size:15px;font-weight:900}
        .pie{margin-top:26px;color:#8a94a6;font-size:10px;border-top:1px solid #d7dce6;padding-top:10px}
        @media print{body{margin:16mm}}
      </style></head><body>
      <div class="cab">
        <div><div class="logo">MilePay <span>· Warehouse</span></div><div class="meta">Comprobante de pago · Pay statement</div></div>
        <div style="text-align:right"><h1>${w.nombre}</h1>
          ${w.idEmpleado ? `<div class="meta">ID empleado: <b>${w.idEmpleado}</b></div>` : ''}
          <div class="meta">Semana: <b>${p.inicio} → ${p.fin}</b></div>
          ${grupoNombre ? `<div class="meta">Grupo: ${grupoNombre}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th>Posición</th><th class="n">Horas reg</th><th class="n">Horas OT</th><th class="n">Tarifa reg</th><th class="n">Tarifa OT</th><th class="n">Pago</th></tr></thead>
        <tbody>${filasHtml}${ajHtml}
          <tr class="tot"><td colspan="5">TOTAL</td><td class="n">${fmt(subtotal + totAj)}</td></tr>
        </tbody>
      </table>
      ${chHtml}
      <p class="pie">Documento informativo generado por MilePay el ${new Date().toLocaleDateString()} · no constituye un comprobante fiscal.</p>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
      </body></html>`
    const win = window.open('', '_blank', 'width=820,height=980')
    if (!win) { window.alert('Tu navegador bloqueó la ventana del paystub. Permite las ventanas emergentes para milepay.io.'); return }
    win.document.write(html)
    win.document.close()
    auditarStaff('paystub_generado', `${w.nombre}: ${p.inicio} → ${p.fin}`)
  }

  // abre el cheque impreso (misma plantilla/diseño de Print Check)
  const verCheque = (c) => {
    const cuenta = (datos.pc?.cuentas || []).find((x) => x.id === c.cuentaId) || { banco: c.banco || '', routing: '', numero: c.cuenta || '' }
    const firma = (datos.pc?.firmas || []).find((f) => f.id === cuenta.firmaId) || (datos.pc?.firmas || [])[0] || null
    const html = htmlLote({ cheques: [c], cuenta, empresa: datos.pc?.empresa || {}, firma, impresion: datos.pc?.impresion || {}, prueba: false })
      .replace(/<script>[\s\S]*?<\/script>/, '')
      .replace('</body>', '<div style="position:fixed;top:10px;right:10px;z-index:9;display:flex;gap:8px"><button onclick="window.print()" style="background:#13233f;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">Imprimir</button><button onclick="window.close()" style="background:#e2e8f0;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">Cerrar</button></div></body>')
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) { window.alert('Permite las ventanas emergentes para ver el cheque.'); return }
    win.document.write(html)
    win.document.close()
  }

  const [nuevaExc, setNuevaExc] = useState({ posicion: '', reg: '', ot: '', desde: '' })
  const [guardando, setGuardando] = useState(false)
  const [idEmp, setIdEmp] = useState(w.idEmpleado || '')
  const [guardandoId, setGuardandoId] = useState(false)
  const guardarId = async () => {
    setGuardandoId(true)
    try {
      await setDoc(refDoc(COL.workers, w.id), { idEmpleado: idEmp.trim() || null, idEmpleadoFuente: 'manual' }, { merge: true })
      await auditarStaff('worker_id', `${w.nombre}: ID ${idEmp.trim() || '(quitado)'}`)
      recargar()
    } finally { setGuardandoId(false) }
  }
  const cambiarGrupo = async (grupoId) => {
    await setDoc(refDoc(COL.workers, w.id), { grupoId: grupoId || null }, { merge: true })
    await auditarStaff('worker_grupo', `${w.nombre} → ${grupoId ? (datos.grupos.find((g) => g.id === grupoId)?.nombre || grupoId) : 'sin grupo'}`)
    recargar()
  }
  const guardarExc = async () => {
    if (!nuevaExc.reg || !nuevaExc.ot) return
    setGuardando(true)
    try {
      await setDoc(refDoc(COL.workers, w.id), {
        tarifas: [...(w.tarifas || []), { posicion: nuevaExc.posicion || '', reg: Number(nuevaExc.reg), ot: Number(nuevaExc.ot), desde: nuevaExc.desde || new Date().toISOString().slice(0, 10), por: user.email }],
      }, { merge: true })
      await auditarStaff('excepcion_tarifa', `${w.nombre}: ${nuevaExc.posicion || 'todas'} $${nuevaExc.reg}/${nuevaExc.ot} desde ${nuevaExc.desde || 'hoy'}`)
      setNuevaExc({ posicion: '', reg: '', ot: '', desde: '' })
      recargar()
    } finally { setGuardando(false) }
  }

  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={volver}><ArrowLeft size={14} /> Volver</Boton>}>Perfil del trabajador</PageTitle>

      {/* ── Encabezado profesional del perfil ── */}
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-navy text-2xl font-black text-brand-gold">{iniciales}</div>
          <div className="min-w-0">
            <div className="text-xl font-black text-brand-navy dark:text-slate-100">{w.nombre}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {w.idEmpleado && <Badge color="navy">ID {w.idEmpleado}</Badge>}
              {posiciones.map((pos) => <Badge key={pos} color="slate">{pos}</Badge>)}
              {grupoNombre && <Badge color="gold">Grupo: {grupoNombre}</Badge>}
              {(w.alias || []).length > 0 && <Badge color="slate">{w.alias.length} alias</Badge>}
              {w.revisarId && <Badge color="red">ID en conflicto: {w.idConflicto}</Badge>}
            </div>
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <Boton variant="gold" onClick={exportarCSV}><FileDown size={14} /> Exportar historial (CSV)</Boton>
            <span className="text-xs text-slate-400">{porPeriodo.length} semanas · {horasTot} h trabajadas</span>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Calculado a pagar</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(calc)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Cheques emitidos</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(emitido)}</div><div className="text-[11px] text-slate-400">pendiente de emitir {dinero(Math.max(0, calc - emitido))}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Cobrado (banco)</div><div className="text-xl font-black text-emerald-600">{dinero(cobrado)}</div><div className="text-[11px] text-slate-400">en tránsito {dinero(Math.max(0, emitido - cobrado))}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Saldo restante</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(calc - cobrado)}</div></Card>
      </div>

      {(w.alias || []).length > 0 && <div className="mb-3 text-xs text-slate-400">Alias verificados: {(w.alias || []).join(' · ')}</div>}

      {/* ── Todo lo asociado: resumen por posición y cheques ── */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Resumen por posición</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
              <th className="py-1 pr-2">Posición</th><th className="pr-2 text-right">Semanas</th><th className="pr-2 text-right">Horas</th><th className="pr-2 text-right">Tarifa (última)</th><th className="pr-2 text-right">Pago</th>
            </tr></thead>
            <tbody>
              {Object.values(regs.reduce((m, r) => {
                const k = r.posicion || '—'
                m[k] = m[k] || { posicion: k, semanas: new Set(), horas: 0, pago: 0, tarifa: null, fin: '' }
                m[k].semanas.add(r.periodoId); m[k].horas += r.horasTotal || 0; m[k].pago += r.miPago || 0
                // tarifa usada más reciente para esta posición (con su origen)
                if (r.miTarifaReg != null && String(r.fin || '') >= m[k].fin) {
                  m[k].fin = String(r.fin || '')
                  m[k].tarifa = { reg: r.miTarifaReg, ot: r.miTarifaOT, origen: r.origenTarifa }
                }
                return m
              }, {})).sort((a, b) => b.pago - a.pago).map((x) => (
                <tr key={x.posicion} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{x.posicion}</td>
                  <td className="pr-2 text-right">{x.semanas.size}</td>
                  <td className="pr-2 text-right">{Math.round(x.horas * 100) / 100}</td>
                  <td className="pr-2 text-right">
                    {x.tarifa ? <>
                      <b>{dinero(x.tarifa.reg)}</b>{x.tarifa.ot != null && x.tarifa.ot !== x.tarifa.reg ? ` / ${dinero(x.tarifa.ot)} OT` : <span className="text-slate-400"> flat</span>}
                      {x.tarifa.origen && <div className="text-[10px] text-slate-400">{x.tarifa.origen}</div>}
                    </> : '—'}
                  </td>
                  <td className="pr-2 text-right font-semibold">{dinero(Math.round(x.pago * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Cheques de este trabajador ({cheques.length})</div>
          {cheques.length === 0 && <div className="text-xs text-slate-400">Todavía no hay cheques vinculados. Se vinculan en la pestaña Cheques.</div>}
          {cheques.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
                <th className="py-1 pr-2">Cheque</th><th className="pr-2 text-right">Importe</th><th className="pr-2">Estado</th><th className="pr-2">Semanas que cubre</th><th className="pr-2"></th>
              </tr></thead>
              <tbody>
                {cheques.slice().sort((a, b) => String(b.numeroNorm).localeCompare(String(a.numeroNorm))).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2 font-mono font-semibold text-brand-navy dark:text-slate-100">#{c.numeroRaw || c.numeroNorm}</td>
                    <td className="pr-2 text-right">{dinero(c.importe)}</td>
                    <td className="pr-2"><Badge color={c.estado === 'cobrado' ? 'green' : c.estado === 'cancelado' ? 'red' : 'gold'}>{c.estado || 'pendiente'}</Badge></td>
                    <td className="pr-2 text-slate-500">{(c.distribucion || []).map((d) => `${String(d.periodoId).replace('gofo_', '').replace('_', ' → ')} (${dinero(d.importe)})`).join(' · ') || '—'}</td>
                    <td className="pr-2 text-right">{c.origen === 'printcheck' && <button className="font-semibold text-brand-navy hover:underline dark:text-slate-200" onClick={() => verCheque(c)}>ver</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Identidad y grupo de pago</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">ID de empleado (工号):</span>
          <Input className="w-36" placeholder="p. ej. TX042885" value={idEmp} onChange={(e) => setIdEmp(e.target.value)} />
          <Boton variant="ghost" disabled={guardandoId || idEmp === (w.idEmpleado || '')} onClick={guardarId}>{guardandoId ? <Spinner /> : 'Guardar ID'}</Boton>
          <span className="ml-4 text-slate-500">Grupo de pago:</span>
          <Select className="w-52" value={w.grupoId || ''} onChange={(e) => cambiarGrupo(e.target.value)}>
            <option value="">Sin grupo (tarifas de posición)</option>
            {datos.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">El ID viene del reporte de asistencia de Gofo (fuente autorizada) o se escribe a mano. El grupo aplica sus tarifas y su regla de OT; la excepción individual sigue mandando.</div>
      </Card>

      <Card className="mb-4 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Excepciones de tarifa (mandan sobre la tarifa de su posición)</div>
        {(w.tarifas || []).length > 0 && (
          <ul className="mb-2 space-y-1 text-xs text-slate-500">
            {(w.tarifas || []).map((t, i) => <li key={i}>• {t.posicion || 'Todas las posiciones'}: {dinero(t.reg)}/h reg · {dinero(t.ot)}/h OT · vigente desde {t.desde}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Posición (vacío = todas)" className="w-44" value={nuevaExc.posicion} onChange={(e) => setNuevaExc({ ...nuevaExc, posicion: e.target.value })} />
          <Input type="number" step="0.25" placeholder="$ reg/h" className="w-24" value={nuevaExc.reg} onChange={(e) => setNuevaExc({ ...nuevaExc, reg: e.target.value })} />
          <Input type="number" step="0.25" placeholder="$ OT/h" className="w-24" value={nuevaExc.ot} onChange={(e) => setNuevaExc({ ...nuevaExc, ot: e.target.value })} />
          <Input type="date" className="w-40" value={nuevaExc.desde} onChange={(e) => setNuevaExc({ ...nuevaExc, desde: e.target.value })} />
          <Boton variant="gold" disabled={guardando} onClick={guardarExc}>{guardando ? <Spinner /> : 'Agregar'}</Boton>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">Cambiar una tarifa NO modifica períodos ya importados o pagados.</div>
      </Card>

      {porPeriodo.map(([pid, p]) => {
        const ajP = ajustes.filter((a) => a.periodoAplicaId === pid)
        const chP = cheques.filter((c) => (c.distribucion || []).some((d) => d.periodoId === pid))
        const tot = p.filas.reduce((s, r) => ({ h: s.h + (r.horasTotal || 0), g: s.g + (r.importeGofo || 0), m: s.m + (r.miPago || 0) }), { h: 0, g: 0, m: 0 })
        return (
          <Card key={pid} className="mb-3 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{p.inicio} → {p.fin}</span>
              {(() => {
                // estado de pago de la semana derivado de sus cheques
                const activos = chP.filter((c) => c.estado !== 'cancelado')
                if (activos.some((c) => c.estado === 'cobrado')) return <Badge color="green">pagada · cheque cobrado</Badge>
                if (activos.length) return <Badge color="gold">cheque #{activos[0].numeroRaw || activos[0].numeroNorm} en tránsito</Badge>
                if (chP.length) return <Badge color="red">cheque anulado · reemitir</Badge>
                return <Badge color="slate">sin cheque emitido</Badge>
              })()}
              <span className="ml-auto text-xs text-slate-400">{Math.round(tot.h * 100) / 100} h · Gofo {dinero(tot.g)} · mi pago {dinero(tot.m)}</span>
              <Boton variant="ghost" onClick={() => paystub(pid, p)}><Printer size={13} /> Paystub</Boton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
                  <th className="py-1 pr-2">Posición</th><th className="pr-2">Agencia</th><th className="pr-2">WH</th>
                  <th className="pr-2 text-right">Horas (reg/OT)</th><th className="pr-2 text-right">Tarifa Gofo</th><th className="pr-2 text-right">Ingreso Gofo</th>
                  <th className="pr-2 text-right">Mi tarifa</th><th className="pr-2 text-right">Mi pago</th>
                </tr></thead>
                <tbody>
                  {p.filas.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1 pr-2 font-semibold">{r.posicion}</td>
                      <td className="pr-2">{r.agencia}</td><td className="pr-2">{r.warehouse}</td>
                      <td className="pr-2 text-right">{r.horasTotal} ({r.horasReg}/{r.horasOT})</td>
                      <td className="pr-2 text-right">{dinero(r.tarifaGofoReg)}/{dinero(r.tarifaGofoOT)}</td>
                      <td className="pr-2 text-right">{dinero(r.importeGofo)}</td>
                      <td className="pr-2 text-right">{r.pendienteTarifa ? <Badge color="red">sin tarifa</Badge> : `${dinero(r.miTarifaReg)}/${dinero(r.miTarifaOT)}`}</td>
                      <td className="pr-2 text-right font-semibold">{r.pendienteTarifa ? '—' : dinero(r.miPago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 grid gap-1 text-xs text-slate-500">
              <div>Días: {p.filas.map((r) => Object.entries(r.dias || {}).sort().map(([d, h]) => `${d.slice(5)}: ${h}h`).join(' · ')).join(' | ') || 'sin detalle diario'}</div>
              {ajP.length > 0 && <div>Ajustes: {ajP.map((a) => `${dinero(a.importe)} (${a.concepto})`).join(' · ')}</div>}
              {chP.length > 0 && <div>Cheques: {chP.map((c) => `#${c.numeroRaw || c.numeroNorm} ${dinero((c.distribucion || []).find((d) => d.periodoId === pid)?.importe)} [${c.estado}]`).join(' · ')}</div>}
              <div className="text-[11px] text-slate-400">Origen: {p.filas[0]?.origen?.archivo} · pestaña {p.filas[0]?.origen?.hoja}{p.filas.map((r) => ` · fila ${r.origen?.fila}`).join('')}</div>
            </div>
          </Card>
        )
      })}
      {porPeriodo.length === 0 && <EstadoVacio icono={Users} titulo="Sin semanas importadas" texto="Este perfil existe pero aún no tiene registros." mostrarBoton={false} />}
    </div>
  )
}
