// ============================================================================
// PRINT CHECK · B&A AMERICAN GROUP LLC / NEXSEND — Fase 1 (núcleo).
//
// · Cuentas bancarias con secuencia de cheques propia (número enmascarado).
// · Crear cheques desde una semana importada de Gofo: neto por trabajador,
//   candado antiduplicados (quien ya tiene cheque activo queda bloqueado),
//   numeración consecutiva, lote idempotente (ids chq_CTA_NUM: reintentar no
//   duplica), integrado con wh_cheques (conciliación bancaria existente).
// · Impresión: formato voucher (cheque + 2 talones), importe en palabras,
//   firma de la biblioteca, calibración (offsets), modo PRUEBA con marca
//   "SAMPLE — NON-NEGOTIABLE". El MICR negociable exige fuente E-13B y tóner
//   magnético o papel preimpreso: se avisa, no se finge.
// · Registro con estados (emitido/cobrado/cancelado), anulación con motivo y
//   reimpresión auditada. · Firmas: biblioteca de imágenes. · Ajustes: datos
//   de la compañía emisora y calibración. Todo en colecciones wh_pc_* (las
//   reglas wh_.* ya desplegadas las protegen: solo el dueño).
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../../../components/ui'
import { Banknote, Printer, Plus, FileSignature, Settings, LayoutDashboard, ListChecks, Landmark, QrCode, PencilRuler, Eye, Copy, X, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { COL, cargar, cargarPor, auditarStaff, refDoc, setDoc, escribirEnLotes, serverTimestamp, arrayUnion } from '../datosStaff'
import { idCheque, normalizarNumero } from '../logicaCheques'
import { planearLote, asignarNumeros, enmascarar, r2 } from './logicaPrint'
import { htmlLote, POS_BASE, ETIQUETAS_POS } from './plantillaBA'

const COLP = { cuentas: 'wh_pc_cuentas', lotes: 'wh_pc_lotes', firmas: 'wh_pc_firmas', firmasPend: 'wh_pc_firmas_pend', config: 'wh_pc_config' }
const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const hoyISO = () => new Date().toISOString().slice(0, 10)
// abre el perfil del trabajador (pestaña Trabajadores) desde cualquier parte
const abrirPerfil = (workerId) => { if (workerId) window.dispatchEvent(new CustomEvent('wh-abrir-perfil', { detail: workerId })) }

export default function WhPrintCheck({ user }) {
  const [sub, setSub] = useState('panel')
  const [bd, setBd] = useState(null)
  const [loteImprimir, setLoteImprimir] = useState('')
  const [chequeSolo, setChequeSolo] = useState('')
  const [registroEstado, setRegistroEstado] = useState('todos')
  const recargar = async () => {
    const [cuentas, firmas, lotes, cfgs, cheques, periodos, workers] = await Promise.all([
      cargar(COLP.cuentas), cargar(COLP.firmas), cargar(COLP.lotes), cargar(COLP.config), cargar(COL.cheques), cargar(COL.periodos), cargar(COL.workers),
    ])
    setBd({
      cuentas, firmas, cheques, workers,
      lotes: lotes.sort((a, b) => String(b.creadoISO || '').localeCompare(a.creadoISO || '')),
      periodos: periodos.sort((a, b) => String(b.inicio).localeCompare(a.inicio)),
      // valores iniciales tomados del membrete real del software anterior
      plaid: cfgs.find((c) => c.id === 'plaid') || { conectado: false },
      empresa: cfgs.find((c) => c.id === 'empresa') || { nombre: 'B&A American Group', marca: 'NEXSEND', direccion1: '5605 FM 423 STE 500-313', direccion2: 'FRISCO TEXAS 75036' },
      impresion: cfgs.find((c) => c.id === 'impresion') || { offX: 0, offY: 0, mostrarMICR: true, papel: 'blanco' },
    })
  }
  useEffect(() => { recargar() }, [])
  if (!bd) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando Print Check…</div>

  const SUBS = [
    ['panel', 'Dashboard', LayoutDashboard], ['crear', 'Crear cheques', Plus], ['imprimir', 'Imprimir', Printer],
    ['registro', 'Registro', ListChecks], ['diseno', 'Diseño del cheque', PencilRuler], ['cuentas', 'Cuentas bancarias', Landmark],
    ['banco', 'Banco automático', RefreshCw], ['firmas', 'Firmas', FileSignature], ['ajustes', 'Ajustes', Settings],
  ]
  const irAImprimir = (loteId, chequeId) => { setLoteImprimir(loteId || ''); setChequeSolo(chequeId || ''); setSub('imprimir') }

  return (
    <div>
      <PageTitle>Print Check · emisión e impresión de cheques</PageTitle>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SUBS.map(([id, label, Icono]) => (
          <button key={id} onClick={() => setSub(id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${sub === id ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
            <Icono size={14} /> {label}
          </button>
        ))}
      </div>
      {sub === 'panel' && <PcDashboard bd={bd} irA={setSub} abrirRegistro={(estado) => { setRegistroEstado(estado || 'todos'); setSub('registro') }} />}
      {sub === 'crear' && <PcCrear bd={bd} user={user} recargar={recargar} irAImprimir={irAImprimir} />}
      {sub === 'imprimir' && <PcImprimir bd={bd} user={user} loteInicial={loteImprimir} chequeSolo={chequeSolo} recargar={recargar} />}
      {sub === 'registro' && <PcRegistro bd={bd} user={user} recargar={recargar} irAImprimir={irAImprimir} estadoInicial={registroEstado} />}
      {sub === 'diseno' && <PcDiseno bd={bd} user={user} recargar={recargar} />}
      {sub === 'cuentas' && <PcCuentas bd={bd} user={user} recargar={recargar} />}
      {sub === 'banco' && <PcBanco bd={bd} recargar={recargar} />}
      {sub === 'firmas' && <PcFirmas bd={bd} user={user} recargar={recargar} />}
      {sub === 'ajustes' && <PcAjustes bd={bd} user={user} recargar={recargar} />}
    </div>
  )
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function PcDashboard({ bd, irA, abrirRegistro }) {
  const [filtro, setFiltro] = useState({ cuentaId: '', desde: '', hasta: '', estado: 'todos', periodoId: '' })
  const ch = bd.cheques
    .filter((c) => !filtro.periodoId || (c.distribucion || []).some((d) => d.periodoId === filtro.periodoId))
    .filter((c) => !filtro.cuentaId || c.cuentaId === filtro.cuentaId)
    .filter((c) => !filtro.desde || (c.fecha || '') >= filtro.desde)
    .filter((c) => !filtro.hasta || (c.fecha || '') <= filtro.hasta)
    .filter((c) => filtro.estado === 'todos' || (c.estado || 'emitido') === filtro.estado)
  const suma = (lista) => r2(lista.reduce((s, c) => s + (c.importe || 0), 0))
  const emitidos = ch.filter((c) => c.estado !== 'cancelado')
  const cobrados = ch.filter((c) => c.estado === 'cobrado')
  const anulados = ch.filter((c) => c.estado === 'cancelado')
  const pendientes = ch.filter((c) => c.estado !== 'cancelado' && c.estado !== 'cobrado')
  const K = ({ label, n, sub, color, onClick }) => (
    <Card className={`p-4 ${onClick ? 'cursor-pointer transition hover:shadow-md' : ''}`} onClick={onClick}>
      <div className="text-[11px] font-bold uppercase text-slate-400">{label}</div>
      <div className={`text-xl font-black ${color || 'text-brand-navy dark:text-slate-100'}`}>{n}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      {onClick && <div className="mt-0.5 text-[10px] font-semibold text-brand-gold">ver listado →</div>}
    </Card>
  )
  return (
    <div>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Select className="w-52" value={filtro.periodoId} onChange={(e) => setFiltro({ ...filtro, periodoId: e.target.value })}>
            <option value="">Todas las semanas</option>
            {bd.periodos.map((p) => <option key={p.id} value={p.id}>{p.inicio} → {p.fin}</option>)}
          </Select>
          <Select className="w-56" value={filtro.cuentaId} onChange={(e) => setFiltro({ ...filtro, cuentaId: e.target.value })}>
            <option value="">Todas las cuentas</option>
            {bd.cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {enmascarar(c.numero)}</option>)}
          </Select>
          <span className="text-slate-500">Del</span>
          <Input type="date" className="w-36" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
          <span className="text-slate-500">al</span>
          <Input type="date" className="w-36" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
          <Select className="w-44" value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
            <option value="todos">Todos los estados</option>
            <option value="emitido">Emitidos</option>
            <option value="cobrado">Cobrados</option>
            <option value="cancelado">Anulados</option>
          </Select>
          {(filtro.cuentaId || filtro.desde || filtro.hasta || filtro.estado !== 'todos' || filtro.periodoId) && (
            <Boton variant="ghost" onClick={() => setFiltro({ cuentaId: '', desde: '', hasta: '', estado: 'todos', periodoId: '' })}>Limpiar</Boton>
          )}
          <span className="ml-auto text-slate-400">{ch.length} cheques en el filtro · {dinero(suma(ch))}</span>
        </div>
      </Card>
      <div className="cm-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <K label="Cheques emitidos" n={emitidos.length} sub={dinero(suma(emitidos))} onClick={() => abrirRegistro('todos')} />
        <K label="Pendientes de cobro (outstanding)" n={pendientes.length} sub={dinero(suma(pendientes))} color="text-amber-600" onClick={() => abrirRegistro('emitido')} />
        <K label="Cobrados" n={cobrados.length} sub={dinero(suma(cobrados))} color="text-emerald-600" onClick={() => abrirRegistro('cobrado')} />
        <K label="Anulados" n={anulados.length} sub={dinero(suma(anulados))} color="text-rose-500" onClick={() => abrirRegistro('cancelado')} />
        <K label="Lotes generados" n={bd.lotes.length} sub={bd.cuentas.length + ' cuenta(s) bancaria(s)'} onClick={() => irA('imprimir')} />
      </div>
      {bd.cuentas.length === 0 && (
        <Aviso tipo="info">Para empezar: crea tu <b>cuenta bancaria</b> (pestaña Cuentas bancarias), sube una <b>firma</b> y luego genera cheques desde una semana importada en <b>Crear cheques</b>.</Aviso>
      )}
      {bd.cuentas.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Por cuenta bancaria</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
              <th className="py-1 pr-2">Cuenta</th><th className="pr-2 text-right">Siguiente cheque</th><th className="pr-2 text-right">Emitidos</th><th className="pr-2 text-right">Outstanding</th>
            </tr></thead>
            <tbody>{bd.cuentas.map((cta) => {
              const deCta = ch.filter((c) => c.cuentaId === cta.id)
              const out = deCta.filter((c) => c.estado !== 'cancelado' && c.estado !== 'cobrado')
              return (
                <tr key={cta.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{cta.banco} · {enmascarar(cta.numero)}</td>
                  <td className="pr-2 text-right font-mono">#{cta.siguiente}</td>
                  <td className="pr-2 text-right">{deCta.filter((c) => c.estado !== 'cancelado').length}</td>
                  <td className="pr-2 text-right font-semibold text-amber-600">{dinero(r2(out.reduce((s, c) => s + (c.importe || 0), 0)))}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── CREAR CHEQUES desde una semana importada ───────────────────────────────
function PcCrear({ bd, user, recargar, irAImprimir }) {
  const [periodoId, setPeriodoId] = useState('')
  const [cuentaId, setCuentaId] = useState(bd.cuentas[0]?.id || '')
  const [fecha, setFecha] = useState(hoyISO())
  const [memo, setMemo] = useState('')
  const [plan, setPlan] = useState(null)
  const [sel, setSel] = useState({})
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [verPagadas, setVerPagadas] = useState(false)
  const [hist, setHist] = useState(null) // panel "ya pagadas fuera del sistema": {sel:{}}
  const [histTrabajando, setHistTrabajando] = useState(false)
  const cuenta = bd.cuentas.find((c) => c.id === cuentaId)

  // Semanas con pagos PENDIENTES de cheque: por defecto solo se listan esas.
  const idPorNombre = {}
  for (const w of bd.workers) { idPorNombre[w.nombreNorm] = w.id; for (const a of (w.alias || [])) idPorNombre[a] = w.id }
  const pendientesDe = (p) => {
    const personas = p.personas || []
    if (!personas.length) return null // períodos viejos sin lista → no se puede saber
    return personas.filter((norm) => {
      const wid = idPorNombre[norm]
      return !bd.cheques.some((ch) => ch.estado !== 'cancelado' && ch.workerId === wid && (ch.distribucion || []).some((d) => d.periodoId === p.id))
    }).length
  }
  const periodosVisibles = bd.periodos.filter((p) => {
    if (verPagadas) return true
    const pend = pendientesDe(p)
    return pend === null || pend > 0
  })

  const cargarPlan = async (pid) => {
    setPeriodoId(pid); setPlan(null); setMensaje(null)
    if (!pid) return
    const p = bd.periodos.find((x) => x.id === pid)
    setMemo(`Payroll ${p.inicio} - ${p.fin}`)
    const [registros, ajustes] = await Promise.all([
      cargarPor(COL.registros, 'periodoId', pid), cargarPor(COL.ajustes, 'periodoAplicaId', pid),
    ])
    const filas = planearLote({ periodoId: pid, registros, ajustes, cheques: bd.cheques, workers: bd.workers })
    setPlan(filas)
    setSel(Object.fromEntries(filas.filter((f) => f.elegible).map((f) => [f.workerId || f.nombre, true])))
  }
  const seleccion = (plan || []).filter((f) => f.elegible && sel[f.workerId || f.nombre])
  const total = r2(seleccion.reduce((s, f) => s + f.neto, 0))
  const desde = Number(cuenta?.siguiente) || 1
  const hasta = desde + Math.max(0, seleccion.length - 1)

  // ── Semanas ya pagadas FUERA del sistema (con el software anterior):
  // crea registros históricos (estado cobrado, sin imprimir) para que la
  // semana salga de la lista de pendientes y el trabajador quede "pagado".
  const abrirHist = () => {
    const pendientes = bd.periodos.filter((p) => { const n = pendientesDe(p); return n === null || n > 0 })
    if (!pendientes.length) { setMensaje({ tipo: 'ok', texto: 'No hay semanas pendientes.' }); return }
    const masReciente = pendientes.reduce((m, p) => (String(p.inicio) > String(m.inicio) ? p : m), pendientes[0])
    // preseleccionadas TODAS menos la más reciente (esa es la que vas a imprimir)
    setHist({ sel: Object.fromEntries(pendientes.filter((p) => p.id !== masReciente.id).map((p) => [p.id, true])), masReciente: masReciente.id })
  }
  const marcarHistoricas = async () => {
    const ids = Object.keys(hist.sel).filter((k) => hist.sel[k])
    if (!ids.length) return
    if (!window.confirm(`¿Marcar ${ids.length} semana(s) como YA PAGADAS fuera del sistema?\n\nSe registran como cheques históricos COBRADOS (sin imprimir nada). Las semanas saldrán de la lista de pendientes y cada trabajador quedará "pagado" en esas semanas.`)) return
    setHistTrabajando(true)
    try {
      let total = 0
      for (const pid of ids) {
        const [registros, ajustes] = await Promise.all([
          cargarPor(COL.registros, 'periodoId', pid), cargarPor(COL.ajustes, 'periodoAplicaId', pid),
        ])
        const plan = planearLote({ periodoId: pid, registros, ajustes, cheques: bd.cheques, workers: bd.workers })
        const elegibles = plan.filter((f) => f.elegible)
        const ahora = new Date().toISOString()
        const ops = elegibles.map((f) => ({
          ref: refDoc(COL.cheques, `hist_${pid}_${(f.workerId || f.nombre).replace(/[^a-zA-Z0-9_]/g, '_')}`),
          merge: true,
          data: {
            numeroRaw: 'HIST', numeroNorm: `hist_${pid}`.slice(0, 40),
            workerId: f.workerId, beneficiario: f.nombre, importe: f.neto,
            fecha: pid.split('_')[2] || null, memo: 'Pago histórico (software anterior)',
            estado: 'cobrado', origen: 'historico', loteId: null,
            distribucion: [{ periodoId: pid, importe: f.neto }], idEmpleado: f.idEmpleado || null,
            creadoEn: serverTimestamp(), creadoPor: user.email,
            historial: [{ accion: 'creado', fecha: ahora, por: user.email, nota: 'Registrado como pagado fuera del sistema' }],
          },
        }))
        if (ops.length) await escribirEnLotes(ops)
        await auditarStaff('pc_semana_historica', `${pid}: ${ops.length} pagos marcados como históricos (cobrados, sin imprimir)`)
        total += ops.length
      }
      setMensaje({ tipo: 'ok', texto: `Listo: ${ids.length} semana(s) marcadas como pagadas (${total} pagos históricos). En la lista solo quedan las semanas por imprimir.` })
      setHist(null)
      await recargar()
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'No se completó (reintentar es seguro): ' + (e.message || e) })
    } finally { setHistTrabajando(false) }
  }

  const generar = async () => {
    if (!cuenta || !seleccion.length) return
    setTrabajando(true); setMensaje(null)
    try {
      const conNumero = asignarNumeros(seleccion, cuenta.siguiente)
      const loteId = `lote_${periodoId}_${cuenta.id}_${desde}`
      const ops = conNumero.map((f) => ({
        ref: refDoc(COL.cheques, idCheque(f.numero, cuenta.numero || cuenta.id)),
        merge: true,
        data: {
          numeroRaw: f.numero, numeroNorm: normalizarNumero(f.numero),
          cuenta: cuenta.numero || '', cuentaId: cuenta.id, banco: cuenta.banco || '',
          workerId: f.workerId, beneficiario: f.nombre, importe: f.neto, fecha, memo,
          estado: 'emitido', origen: 'printcheck', loteId,
          distribucion: [{ periodoId, importe: f.neto }],
          detalle: f.detalle, idEmpleado: f.idEmpleado || null,
          creadoEn: serverTimestamp(), creadoPor: user.email,
          historial: [{ accion: 'creado', fecha: new Date().toISOString(), por: user.email, nota: `Lote #${desde}–#${hasta}` }],
        },
      }))
      ops.push({ ref: refDoc(COLP.cuentas, cuenta.id), merge: true, data: { siguiente: desde + conNumero.length, ultimoEmitido: String(hasta) } })
      ops.push({
        ref: refDoc(COLP.lotes, loteId),
        data: {
          periodoId, cuentaId: cuenta.id, banco: cuenta.banco || '', desde: String(desde), hasta: String(hasta),
          cantidad: conNumero.length, total, fecha, memo, creadoISO: new Date().toISOString(), creadoPor: user.email,
        },
      })
      await escribirEnLotes(ops)
      await auditarStaff('pc_lote_generado', `${loteId}: ${conNumero.length} cheques #${desde}–#${hasta}, total ${dinero(total)} (${cuenta.banco})`)
      setMensaje({ tipo: 'ok', texto: `Lote generado: ${conNumero.length} cheques (#${desde} a #${hasta}) por ${dinero(total)}. Pasando a Imprimir…` })
      await recargar()
      irAImprimir(loteId)
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'No se generó el lote (reintentar es seguro, no duplica): ' + (e.message || e) })
    } finally { setTrabajando(false) }
  }

  return (
    <div>
      {bd.cuentas.length === 0 && <Aviso tipo="warn">Primero crea una <b>cuenta bancaria</b> en la pestaña "Cuentas bancarias".</Aviso>}
      <Card className="mb-4 p-4">
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="mb-1 font-bold text-slate-500">Semana (del staffing importado)</div>
            <Select value={periodoId} onChange={(e) => cargarPlan(e.target.value)}>
              <option value="">Elegir semana…</option>
              {periodosVisibles.map((p) => {
                const pend = pendientesDe(p)
                return <option key={p.id} value={p.id}>{p.inicio} → {p.fin}{pend !== null ? ` · ${pend} por pagar` : ''}</option>
              })}
            </Select>
            <label className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <input type="checkbox" checked={verPagadas} onChange={(e) => setVerPagadas(e.target.checked)} />
              mostrar también semanas ya pagadas por completo
            </label>
            <button className="mt-1 block text-[11px] font-semibold text-brand-gold hover:underline" onClick={abrirHist}>
              ¿Semanas viejas ya pagadas con tu software anterior? Márcalas aquí →
            </button></div>
          <div><div className="mb-1 font-bold text-slate-500">Cuenta bancaria emisora</div>
            <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              {bd.cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {enmascarar(c.numero)}</option>)}
            </Select></div>
          <div><div className="mb-1 font-bold text-slate-500">Fecha de emisión</div>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div><div className="mb-1 font-bold text-slate-500">Memo</div>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Payroll semana…" /></div>
        </div>
      </Card>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} className="mb-4">{mensaje.texto}</Aviso>}

      {hist && (
        <Card className="mb-4 p-4">
          <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Marcar semanas como YA pagadas (fuera del sistema)</div>
          <p className="mb-3 text-xs text-slate-500">
            Para las semanas que pagaste con tu software anterior: se registran como <b>pagos históricos cobrados</b> (no se imprime nada, no se usa numeración).
            Esas semanas salen de la lista de pendientes y cada trabajador queda "pagado". La semana más reciente viene <b>desmarcada</b> — esa es la que vas a imprimir.
          </p>
          <div className="space-y-1.5">
            {bd.periodos.filter((p) => { const n = pendientesDe(p); return n === null || n > 0 }).map((p) => {
              const pend = pendientesDe(p)
              return (
                <label key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!hist.sel[p.id]} onChange={(e) => setHist({ ...hist, sel: { ...hist.sel, [p.id]: e.target.checked } })} />
                  <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{p.inicio} → {p.fin}</span>
                  <span className="text-slate-400">{pend !== null ? `${pend} pagos pendientes` : ''}</span>
                  {p.id === hist.masReciente && <Badge color="gold">esta la imprimes tú — queda fuera</Badge>}
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Boton variant="gold" disabled={histTrabajando || !Object.values(hist.sel).some(Boolean)} onClick={marcarHistoricas}>
              {histTrabajando ? <Spinner /> : `Marcar ${Object.values(hist.sel).filter(Boolean).length} semana(s) como pagadas`}
            </Boton>
            <Boton variant="ghost" onClick={() => setHist(null)}>Cancelar</Boton>
            <span className="text-[11px] text-slate-400">Reversible: en Registro puedes borrar los pagos históricos (busca "HIST").</span>
          </div>
        </Card>
      )}

      {plan && (
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <b className="text-brand-navy dark:text-slate-100">Pagos de la semana</b>
            <span className="text-xs text-slate-400">{plan.length} trabajadores · {plan.filter((f) => f.yaTiene).length} ya con cheque activo (bloqueados)</span>
            <span className="ml-auto text-xs font-semibold">{seleccion.length} seleccionados · {dinero(total)} · #{desde}–#{hasta}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
                <th className="py-1 pr-2"><input type="checkbox" checked={seleccion.length === plan.filter((f) => f.elegible).length && seleccion.length > 0}
                  onChange={(e) => setSel(Object.fromEntries(plan.filter((f) => f.elegible).map((f) => [f.workerId || f.nombre, e.target.checked])))} /></th>
                <th className="pr-2">Trabajador</th><th className="pr-2">ID</th><th className="pr-2 text-right">Horas</th><th className="pr-2 text-right">Neto a pagar</th><th className="pr-2">Estado</th>
              </tr></thead>
              <tbody>{plan.map((f) => (
                <tr key={f.workerId || f.nombre} className={`border-b border-slate-100 dark:border-slate-800 ${!f.elegible ? 'opacity-50' : ''}`}>
                  <td className="py-1 pr-2">{f.elegible && <input type="checkbox" checked={!!sel[f.workerId || f.nombre]} onChange={(e) => setSel({ ...sel, [f.workerId || f.nombre]: e.target.checked })} />}</td>
                  <td className="pr-2 font-semibold text-brand-navy dark:text-slate-100">{f.workerId ? <button className="hover:underline" title="Abrir su perfil" onClick={() => abrirPerfil(f.workerId)}>{f.nombre}</button> : f.nombre}</td>
                  <td className="pr-2 font-mono">{f.idEmpleado || '—'}</td>
                  <td className="pr-2 text-right">{Math.round(f.horas * 100) / 100}</td>
                  <td className="pr-2 text-right font-semibold">{dinero(f.neto)}</td>
                  <td className="pr-2">
                    {f.yaTiene && <Badge color="gold">ya tiene cheque #{f.yaTiene}</Badge>}
                    {f.pendienteTarifa && <Badge color="red">sin tarifa</Badge>}
                    {f.elegible && <Badge color="green">listo</Badge>}
                    {!f.yaTiene && !f.pendienteTarifa && f.neto <= 0 && <Badge color="slate">neto $0</Badge>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Boton variant="gold" disabled={trabajando || !cuenta || seleccion.length === 0} onClick={generar}>
              {trabajando ? <Spinner /> : <>Generar {seleccion.length} cheque(s) · {dinero(total)}</>}
            </Boton>
            <span className="text-[11px] text-slate-400">Un trabajador con cheque activo de esta semana queda bloqueado: para pagarle de nuevo, primero anula su cheque en Registro (queda auditado).</span>
          </div>
        </Card>
      )}
    </div>
  )
}

function PcImprimir({ bd, user, loteInicial, chequeSolo, recargar }) {
  const [loteId, setLoteId] = useState(loteInicial || bd.lotes[0]?.id || '')
  const [prueba, setPrueba] = useState(false)
  const lote = bd.lotes.find((l) => l.id === loteId)
  const cheques = useMemo(() => {
    let lista = bd.cheques.filter((c) => c.loteId === loteId)
    if (chequeSolo) lista = bd.cheques.filter((c) => c.id === chequeSolo)
    return lista.sort((a, b) => Number(a.numeroRaw) - Number(b.numeroRaw))
  }, [bd, loteId, chequeSolo])
  const cuenta = bd.cuentas.find((c) => c.id === (cheques[0]?.cuentaId || lote?.cuentaId)) || {}
  const firma = bd.firmas.find((f) => f.id === cuenta.firmaId) || bd.firmas[0] || null

  // Borrar el lote completo: solo si NINGÚN cheque está cobrado. Si era el
  // último lote de la cuenta, la numeración se regresa para reusar los números.
  const borrarLote = async () => {
    if (!lote || chequeSolo) return
    const delLote = bd.cheques.filter((c) => c.loteId === lote.id)
    if (delLote.some((c) => c.estado === 'cobrado')) { window.alert('Este lote tiene cheques COBRADOS: no se puede borrar. Anula individualmente los que correspondan.'); return }
    if (!window.confirm(`¿Borrar el lote completo (${delLote.length} cheques #${lote.desde}–#${lote.hasta}, ${dinero(lote.total)})?\n\nEsto es para lotes generados por error ANTES de entregarlos. Si un cheque ya salió a la calle, usa "anular", no borrar.`)) return
    const ops = delLote.map((c) => ({ ref: refDoc(COL.cheques, c.id), borrar: true }))
    ops.push({ ref: refDoc(COLP.lotes, lote.id), borrar: true })
    const cta = bd.cuentas.find((x) => x.id === lote.cuentaId)
    const reversa = cta && Number(cta.siguiente) === Number(lote.hasta) + 1
    if (reversa) ops.push({ ref: refDoc(COLP.cuentas, cta.id), merge: true, data: { siguiente: Number(lote.desde) } })
    await escribirEnLotes(ops)
    await auditarStaff('pc_lote_borrado', `${lote.id}: ${delLote.length} cheques #${lote.desde}–#${lote.hasta} ${dinero(lote.total)}${reversa ? ` · numeración regresada a #${lote.desde}` : ''}`)
    setLoteId('')
    recargar()
  }

  const imprimir = async () => {
    const html = htmlLote({ cheques, cuenta, empresa: bd.empresa, firma, impresion: bd.impresion, prueba })
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) { window.alert('Permite las ventanas emergentes para imprimir.'); return }
    win.document.write(html)
    win.document.close()
    await auditarStaff(prueba ? 'pc_impresion_prueba' : 'pc_impresion', `${chequeSolo ? '1 cheque' : `lote ${loteId} (${cheques.length} cheques)`}${prueba ? ' [SAMPLE]' : ''} por ${user.email}`)
    if (!prueba) {
      // huella de impresión en el historial de CADA cheque
      const evento = { accion: 'impreso', fecha: new Date().toISOString(), por: user.email }
      await escribirEnLotes(cheques.map((c) => ({ ref: refDoc(COL.cheques, c.id), merge: true, data: { historial: arrayUnion(evento), impresoEn: evento.fecha } })))
      if (recargar) recargar()
    }
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          {!chequeSolo && (
            <div><div className="mb-1 font-bold text-slate-500">Lote</div>
              <Select className="w-72" value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                {bd.lotes.length === 0 && <option value="">No hay lotes todavía</option>}
                {bd.lotes.map((l) => <option key={l.id} value={l.id}>{l.fecha} · #{l.desde}–#{l.hasta} · {l.cantidad} cheques · {dinero(l.total)}</option>)}
              </Select></div>
          )}
          <label className="inline-flex items-center gap-1.5 pb-2 font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={prueba} onChange={(e) => setPrueba(e.target.checked)} /> Impresión de PRUEBA (marca SAMPLE, número 000000)
          </label>
          <Boton variant="gold" disabled={!cheques.length} onClick={imprimir}><Printer size={14} /> {prueba ? 'Imprimir prueba' : `Imprimir ${cheques.length} cheque(s)`}</Boton>
          {!chequeSolo && lote && <button className="pb-2 text-xs font-semibold text-rose-400 hover:text-rose-600" onClick={borrarLote}>Borrar lote</button>}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Formato voucher: cheque arriba + copia del empleado + copia de la compañía. En el diálogo de impresión usa escala 100% y sin márgenes.
          <b> Importante:</b> un cheque negociable en papel en blanco exige fuente MICR E-13B y tóner magnético; con papel preimpreso del banco, apaga la línea MICR en Ajustes.
        </div>
      </Card>
      {cheques.length === 0 && <EstadoVacio icono={Printer} titulo="Nada para imprimir" texto="Genera un lote en Crear cheques y aparecerá aquí." mostrarBoton={false} />}
      {cheques.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Vista previa del lote</div>
          <div className="grid gap-2">
            {cheques.map((ch) => (
              <div key={ch.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-700/60">
                <span className="font-mono font-bold text-brand-navy dark:text-slate-100">#{ch.numeroRaw}</span>
                <span className="font-semibold">{ch.beneficiario}</span>
                <span className="text-slate-400">{ch.fecha} · {ch.memo}</span>
                <Badge color={ch.estado === 'cobrado' ? 'green' : ch.estado === 'cancelado' ? 'red' : 'gold'}>{ch.estado}</Badge>
                <b className="ml-auto">{dinero(ch.importe)}</b>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── REGISTRO (estados, anulación, reimpresión auditada) ────────────────────
function PcRegistro({ bd, user, recargar, irAImprimir, estadoInicial }) {
  const [filtro, setFiltro] = useState(estadoInicial || 'todos')
  const [buscar, setBuscar] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const [sel, setSel] = useState({}) // multiselección para borrar en grupo
  const [fichaId, setFichaId] = useState(null) // ficha completa (el "ojito")
  const q = buscar.trim().toLowerCase()
  const lista = bd.cheques
    .filter((c) => filtro === 'todos' || (c.estado || 'emitido') === filtro)
    .filter((c) => !cuentaId || c.cuentaId === cuentaId)
    .filter((c) => !rango.desde || (c.fecha || '') >= rango.desde)
    .filter((c) => !rango.hasta || (c.fecha || '') <= rango.hasta)
    .filter((c) => !q
      || String(c.numeroRaw || c.numeroNorm || '').toLowerCase().includes(q)
      || String(c.beneficiario || '').toLowerCase().includes(q)
      || String(c.memo || '').toLowerCase().includes(q)
      || String(c.loteId || '').toLowerCase().includes(q)
      || Number(c.importe || 0).toFixed(2).includes(q))
    .sort((a, b) => Number(b.numeroRaw || 0) - Number(a.numeroRaw || 0))

  // abre el cheque TAL COMO SE IMPRIMIÓ (regenerado con sus datos guardados)
  const verCheque = (c) => {
    const cuenta = bd.cuentas.find((x) => x.id === c.cuentaId) || { banco: c.banco || '', routing: '', numero: c.cuenta || '' }
    const firma = bd.firmas.find((f) => f.id === cuenta.firmaId) || bd.firmas[0] || null
    const html = htmlLote({ cheques: [c], cuenta, empresa: bd.empresa, firma, impresion: bd.impresion, prueba: false })
      .replace(/<script>[\s\S]*?<\/script>/, '')
      .replace('</body>', `<div style="position:fixed;top:10px;right:10px;z-index:9;display:flex;gap:8px">
        <button onclick="window.print()" style="background:#13233f;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">Imprimir</button>
        <button onclick="window.close()" style="background:#e2e8f0;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">Cerrar</button>
      </div></body>`)
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) { window.alert('Permite las ventanas emergentes para ver el cheque.'); return }
    win.document.write(html)
    win.document.close()
  }
  const anular = async (c) => {
    const motivo = window.prompt(`¿Anular el cheque #${c.numeroRaw} de ${c.beneficiario}? Escribe el motivo:`)
    if (!motivo) return
    await setDoc(refDoc(COL.cheques, c.id), { estado: 'cancelado', motivoCancelacion: motivo, canceladoEn: new Date().toISOString(), canceladoPor: user.email, historial: arrayUnion({ accion: 'anulado', fecha: new Date().toISOString(), por: user.email, nota: motivo }) }, { merge: true })
    await auditarStaff('pc_cheque_anulado', `#${c.numeroRaw} ${c.beneficiario} ${dinero(c.importe)}: ${motivo}`)
    recargar()
  }
  // Borrar = eliminarlo del historial (solo errores ANTES de entregar el
  // papel; un cheque cobrado jamás se borra; uno entregado se ANULA).
  const borrar = async (c) => {
    if (c.estado === 'cobrado' && c.origen !== 'historico') return
    if (!window.confirm(`¿BORRAR el cheque #${c.numeroRaw || c.numeroNorm} de ${c.beneficiario || '—'} (${dinero(c.importe)})?\n\nBorrar lo elimina del historial: es para cheques generados por error que NUNCA se entregaron. Si el cheque ya salió a la calle, usa "anular".`)) return
    await escribirEnLotes([{ ref: refDoc(COL.cheques, c.id), borrar: true }])
    await auditarStaff('pc_cheque_borrado', `#${c.numeroRaw || c.numeroNorm} ${c.beneficiario || ''} ${dinero(c.importe)} [${c.estado || 'emitido'}]`)
    recargar()
  }
  // ── Acciones MASIVAS sobre la selección (10, 50, los que sean) ───────────
  const seleccionables = lista
  const seleccionados = seleccionables.filter((c) => sel[c.id])
  const resumenSel = (ls) => `${ls.slice(0, 8).map((c) => `#${c.numeroRaw || c.numeroNorm} ${c.beneficiario || ''} ${dinero(c.importe)}`).join('\n')}${ls.length > 8 ? `\n… y ${ls.length - 8} más` : ''}`
  const borrarSeleccionados = async () => {
    const aptos = seleccionados.filter((c) => c.estado !== 'cobrado' || c.origen === 'historico')
    const saltados = seleccionados.length - aptos.length
    if (!aptos.length) { window.alert('Los cheques cobrados no se pueden borrar (solo los históricos).'); return }
    const total = r2(aptos.reduce((s, c) => s + (c.importe || 0), 0))
    if (!window.confirm(`¿BORRAR ${aptos.length} cheque(s) por ${dinero(total)}?\n\n${resumenSel(aptos)}${saltados ? `\n\n(${saltados} cobrados NO se tocan)` : ''}\n\nSolo para cheques que NUNCA se entregaron; si ya salieron, usa Anular.`)) return
    await escribirEnLotes(aptos.map((c) => ({ ref: refDoc(COL.cheques, c.id), borrar: true })))
    await auditarStaff('pc_cheques_borrados', `${aptos.length} cheques ${dinero(total)}: ${aptos.map((c) => '#' + (c.numeroRaw || c.numeroNorm)).join(', ')}`)
    setSel({})
    recargar()
  }
  const marcarSeleccionados = async (nuevoEstado) => {
    const aptos = seleccionados.filter((c) => (c.estado || 'emitido') !== nuevoEstado && c.estado !== 'cancelado')
    if (!aptos.length) { window.alert('Ninguno de los seleccionados puede pasar a ese estado (los anulados no cambian desde aquí).'); return }
    const etiqueta = nuevoEstado === 'cobrado' ? 'COBRADOS (pagados por el banco)' : 'PENDIENTES (emitidos, sin cobrar)'
    if (!window.confirm(`¿Marcar ${aptos.length} cheque(s) como ${etiqueta}?\n\n${resumenSel(aptos)}`)) return
    const ahora = new Date().toISOString()
    await escribirEnLotes(aptos.map((c) => ({
      ref: refDoc(COL.cheques, c.id), merge: true,
      data: {
        estado: nuevoEstado,
        ...(nuevoEstado === 'cobrado' ? { fechaCobro: hoyISO(), cobro: { via: 'manual', fecha: hoyISO() } } : {}),
        historial: arrayUnion({ accion: nuevoEstado === 'cobrado' ? 'cobrado' : 'estado', fecha: ahora, por: user.email, nota: nuevoEstado === 'cobrado' ? 'marcado cobrado a mano' : 'devuelto a pendiente a mano' }),
      },
    })))
    await auditarStaff('pc_cheques_estado', `${aptos.length} cheques → ${nuevoEstado}: ${aptos.map((c) => '#' + (c.numeroRaw || c.numeroNorm)).join(', ')}`)
    setSel({})
    recargar()
  }
  const anularSeleccionados = async () => {
    const aptos = seleccionados.filter((c) => c.estado !== 'cancelado' && c.estado !== 'cobrado')
    if (!aptos.length) { window.alert('Solo se anulan cheques que no están cobrados ni ya anulados.'); return }
    const motivo = window.prompt(`¿Anular ${aptos.length} cheque(s)?\n\n${resumenSel(aptos)}\n\nEscribe el motivo (se aplica a todos):`)
    if (!motivo) return
    const ahora = new Date().toISOString()
    await escribirEnLotes(aptos.map((c) => ({
      ref: refDoc(COL.cheques, c.id), merge: true,
      data: { estado: 'cancelado', motivoCancelacion: motivo, canceladoEn: ahora, canceladoPor: user.email, historial: arrayUnion({ accion: 'anulado', fecha: ahora, por: user.email, nota: motivo }) },
    })))
    await auditarStaff('pc_cheques_anulados', `${aptos.length} cheques: ${motivo} (${aptos.map((c) => '#' + (c.numeroRaw || c.numeroNorm)).join(', ')})`)
    setSel({})
    recargar()
  }
  return (
    <div>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Input className="w-64" placeholder="Buscar: nombre, número, importe, memo, lote…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <Select className="w-40" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos los estados</option><option value="emitido">Emitidos</option>
            <option value="cobrado">Cobrados</option><option value="cancelado">Anulados</option>
          </Select>
          <Select className="w-52" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {bd.cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {enmascarar(c.numero)}</option>)}
          </Select>
          <span className="text-slate-500">Del</span>
          <Input type="date" className="w-36" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
          <span className="text-slate-500">al</span>
          <Input type="date" className="w-36" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
          {(q || filtro !== 'todos' || cuentaId || rango.desde || rango.hasta) && (
            <Boton variant="ghost" onClick={() => { setBuscar(''); setFiltro('todos'); setCuentaId(''); setRango({ desde: '', hasta: '' }) }}>Limpiar</Boton>
          )}
          <span className="ml-auto text-slate-400">{lista.length} cheques · {dinero(r2(lista.reduce((s, c) => s + (c.importe || 0), 0)))}</span>
        </div>
        {seleccionables.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-700/60">
            <label className="inline-flex items-center gap-1.5 text-slate-500">
              <input type="checkbox" checked={seleccionados.length === seleccionables.length && seleccionados.length > 0}
                onChange={(e) => setSel(e.target.checked ? Object.fromEntries(seleccionables.map((c) => [c.id, true])) : {})} />
              Seleccionar todos los visibles ({seleccionables.length})
            </label>
            {seleccionados.length > 0 && (
              <>
                <span className="font-semibold text-brand-navy dark:text-slate-100">{seleccionados.length} seleccionados · {dinero(r2(seleccionados.reduce((s, c) => s + (c.importe || 0), 0)))}:</span>
                <button className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:opacity-90" onClick={() => marcarSeleccionados('cobrado')}>Marcar cobrados</button>
                <button className="rounded-lg border border-slate-300 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300" onClick={() => marcarSeleccionados('emitido')}>Volver a pendiente</button>
                <button className="rounded-lg border border-amber-300 px-2.5 py-1 font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10" onClick={anularSeleccionados}>Anular</button>
                <button className="rounded-lg border border-rose-300 px-2.5 py-1 font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={borrarSeleccionados}>Borrar</button>
              </>
            )}
            <span className="text-[11px] text-slate-400">Borrar nunca toca cobrados (salvo históricos); anular nunca toca cobrados.</span>
          </div>
        )}
      </Card>
      {lista.length === 0 && <EstadoVacio icono={Banknote} titulo="Sin cheques" texto="Los cheques generados (y los importados en la pestaña Cheques) aparecen aquí." mostrarBoton={false} />}
      <div className="grid gap-2">
        {lista.map((c) => (
          <Card key={c.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input type="checkbox" checked={!!sel[c.id]} onChange={(e) => setSel({ ...sel, [c.id]: e.target.checked })} onClick={(e) => e.stopPropagation()} />
              <button className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700" title="Ver ficha completa" onClick={() => setFichaId(c.id)}><Eye size={15} /></button>
              <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">#{c.numeroRaw || c.numeroNorm}</span>
              {c.workerId ? <button className="font-semibold hover:underline" title="Abrir su perfil" onClick={() => abrirPerfil(c.workerId)}>{c.beneficiario}</button> : <span className="font-semibold">{c.beneficiario || '—'}</span>}
              <Badge color={c.estado === 'cobrado' ? 'green' : c.estado === 'cancelado' ? 'red' : 'gold'}>{c.estado || 'emitido'}</Badge>
              {c.origen === 'historico' && <Badge color="slate">histórico</Badge>}
              <span className="text-slate-400">{c.fecha || ''} {c.banco ? `· ${c.banco}` : ''} {c.loteId ? `· ${c.loteId}` : ''}</span>
              <b className="ml-auto">{dinero(c.importe)}</b>
              {c.origen === 'printcheck' && (
                <Boton variant="ghost" onClick={() => verCheque(c)}>Ver cheque</Boton>
              )}
              {c.origen === 'printcheck' && c.estado !== 'cancelado' && (
                <Boton variant="ghost" onClick={async () => { await auditarStaff('pc_reimpresion', `#${c.numeroRaw} ${c.beneficiario}`); irAImprimir('', c.id) }}><Printer size={13} /> Reimprimir</Boton>
              )}
              {c.estado !== 'cancelado' && c.estado !== 'cobrado' && <button className="text-rose-400 hover:text-rose-600" onClick={() => anular(c)}>anular</button>}
              {(c.estado !== 'cobrado' || c.origen === 'historico') && <button className="text-rose-300 hover:text-rose-600" onClick={() => borrar(c)}>borrar</button>}
            </div>
            {c.motivoCancelacion && <div className="mt-1 text-[11px] text-rose-400">Anulado: {c.motivoCancelacion}</div>}
            {c.revisarBanco && <div className="mt-1 text-[11px] font-semibold text-amber-600">⚠ Revisar contra el banco: {c.revisarBanco}</div>}
          </Card>
        ))}
      </div>
      {fichaId && (() => {
        const c = bd.cheques.find((x) => x.id === fichaId)
        if (!c) return null
        return <FichaCheque c={c} bd={bd} user={user} recargar={recargar} cerrar={() => setFichaId(null)}
          anular={() => anular(c)} borrar={() => { setFichaId(null); borrar(c) }} verCheque={() => verCheque(c)} />
      })()}
    </div>
  )
}

// ── FICHA COMPLETA del cheque (el "ojito"): vista previa, acciones, historial
//    de actividad y resumen del beneficiario (como tu software anterior, pero
//    integrado con el staffing). ─────────────────────────────────────────────
function FichaCheque({ c, bd, user, recargar, cerrar, anular, borrar, verCheque }) {
  const cuenta = bd.cuentas.find((x) => x.id === c.cuentaId) || { banco: c.banco || '', routing: '', numero: c.cuenta || '' }
  const firma = bd.firmas.find((f) => f.id === cuenta.firmaId) || bd.firmas[0] || null
  const html = htmlLote({ cheques: [c], cuenta, empresa: bd.empresa, firma, impresion: bd.impresion, prueba: false })
    .replace(/<script>[\s\S]*?<\/script>/, '')
  // totales a este beneficiario (cheques no anulados)
  const deEste = bd.cheques.filter((x) => x.workerId && x.workerId === c.workerId && x.estado !== 'cancelado')
  const hoy = hoyISO()
  const suma = (lista) => r2(lista.reduce((s, x) => s + (x.importe || 0), 0))
  const mes = suma(deEste.filter((x) => String(x.fecha || '').slice(0, 7) === hoy.slice(0, 7)))
  const anio = suma(deEste.filter((x) => String(x.fecha || '').slice(0, 4) === hoy.slice(0, 4)))
  const ultimos = deEste.slice().sort((a, b) => String(b.fecha || '').localeCompare(a.fecha || '') || Number(b.numeroRaw || 0) - Number(a.numeroRaw || 0)).slice(0, 10)
  // línea de tiempo: historial guardado + eventos derivados de los campos
  const eventos = [...(c.historial || [])]
  if (!eventos.some((e) => e.accion === 'creado') && c.creadoPor) eventos.unshift({ accion: 'creado', fecha: c.fecha || '', por: c.creadoPor })
  if (c.estado === 'cobrado') eventos.push({ accion: 'cobrado', fecha: c.fechaCobro || '', por: 'conciliación bancaria' })
  eventos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const fEv = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—')
  const ETIQ = { creado: 'Creado', impreso: 'Impreso', reimpreso: 'Reimpreso', anulado: 'Anulado', cobrado: 'Cobrado en el banco', clonado: 'Clonado' }

  const clonar = async () => {
    const cta = bd.cuentas.find((x) => x.id === c.cuentaId)
    if (!cta) { window.alert('La cuenta original ya no existe; crea el cheque desde Crear cheques.'); return }
    if (!window.confirm(`¿Clonar este cheque? Se crea uno NUEVO con el siguiente número (#${cta.siguiente}) para ${c.beneficiario} por ${dinero(c.importe)}. Ojo: el candado antiduplicados no aplica a los clones — úsalo solo si de verdad corresponde otro pago.`)) return
    const numero = String(cta.siguiente)
    const evento = { accion: 'creado', fecha: new Date().toISOString(), por: user.email, nota: `Clon del cheque #${c.numeroRaw}` }
    await escribirEnLotes([
      {
        ref: refDoc(COL.cheques, idCheque(numero, cta.numero || cta.id)),
        merge: true,
        data: {
          numeroRaw: numero, numeroNorm: normalizarNumero(numero),
          cuenta: cta.numero || '', cuentaId: cta.id, banco: cta.banco || '',
          workerId: c.workerId || null, beneficiario: c.beneficiario, importe: c.importe, fecha: hoyISO(), memo: c.memo || '',
          estado: 'emitido', origen: 'printcheck', loteId: null, distribucion: c.distribucion || [], detalle: c.detalle || [],
          idEmpleado: c.idEmpleado || null, creadoEn: serverTimestamp(), creadoPor: user.email, historial: [evento],
        },
      },
      { ref: refDoc(COLP.cuentas, cta.id), merge: true, data: { siguiente: Number(cta.siguiente) + 1, ultimoEmitido: numero } },
      { ref: refDoc(COL.cheques, c.id), merge: true, data: { historial: arrayUnion({ accion: 'clonado', fecha: new Date().toISOString(), por: user.email, nota: `→ #${numero}` }) } },
    ])
    await auditarStaff('pc_cheque_clonado', `#${c.numeroRaw} → #${numero} ${c.beneficiario} ${dinero(c.importe)}`)
    cerrar()
    recargar()
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-3" onClick={cerrar}>
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-4 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-black text-brand-navy dark:text-slate-100">Cheque #{c.numeroRaw || c.numeroNorm}</span>
          <Badge color={c.estado === 'cobrado' ? 'green' : c.estado === 'cancelado' ? 'red' : 'gold'}>{c.estado || 'emitido'}</Badge>
          <span className="text-xs text-slate-400">{c.fecha} · {cuenta.banco} · {c.loteId || 'sin lote'}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <Boton variant="ghost" onClick={verCheque}><Printer size={13} /> Imprimir</Boton>
            {c.estado !== 'cancelado' && <Boton variant="ghost" onClick={clonar}><Copy size={13} /> Clonar</Boton>}
            {c.estado !== 'cancelado' && c.estado !== 'cobrado' && <Boton variant="ghost" onClick={anular}>Anular</Boton>}
            {(c.estado !== 'cobrado' || c.origen === 'historico') && <button className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={borrar}>Borrar</button>}
            <button className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={cerrar}><X size={17} /></button>
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" style={{ height: 480 }}>
              <iframe title={`Cheque ${c.numeroRaw}`} srcDoc={html} className="mx-auto block bg-white" style={{ border: 0, width: 830, height: 1060 }} />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Actividad de este cheque</div>
              <div className="space-y-1 text-xs">
                {eventos.length === 0 && <div className="text-slate-400">Sin eventos registrados.</div>}
                {eventos.map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-700/60">
                    <Badge color={e.accion === 'anulado' ? 'red' : e.accion === 'cobrado' ? 'green' : 'slate'}>{ETIQ[e.accion] || e.accion}</Badge>
                    <span className="text-slate-500">{fEv(e.fecha)}</span>
                    <span className="text-slate-400">{e.por}</span>
                    {e.nota && <span className="text-slate-500">· {e.nota}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Card className="p-3">
              <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">{c.workerId ? <button className="hover:underline" title="Abrir su perfil" onClick={() => { cerrar(); abrirPerfil(c.workerId) }}>{c.beneficiario}</button> : (c.beneficiario || '—')}</div>
              {c.idEmpleado && <Badge color="navy">ID {c.idEmpleado}</Badge>}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div><div className="text-[10px] font-bold uppercase text-slate-400">Este mes</div><b>{dinero(mes)}</b></div>
                <div><div className="text-[10px] font-bold uppercase text-slate-400">Este año</div><b>{dinero(anio)}</b></div>
                <div><div className="text-[10px] font-bold uppercase text-slate-400">Histórico</div><b>{dinero(suma(deEste))}</b></div>
              </div>
              <div className="mt-1 text-center text-[10px] text-slate-400">pagado a esta persona (sin anulados)</div>
            </Card>
            <Card className="p-3">
              <div className="mb-1 text-xs font-bold text-brand-navy dark:text-slate-100">Últimos cheques de esta persona</div>
              <div className="space-y-1 text-xs">
                {ultimos.map((x) => (
                  <div key={x.id} className={`flex items-center gap-2 ${x.id === c.id ? 'font-bold text-brand-navy dark:text-slate-100' : 'text-slate-500'}`}>
                    <span className="font-mono">#{x.numeroRaw || x.numeroNorm}</span>
                    <span>{x.fecha || '—'}</span>
                    <Badge color={x.estado === 'cobrado' ? 'green' : 'gold'}>{x.estado || 'emitido'}</Badge>
                    <b className="ml-auto">{dinero(x.importe)}</b>
                  </div>
                ))}
                {ultimos.length === 0 && <div className="text-slate-400">Sin cheques previos.</div>}
              </div>
            </Card>
            {(c.detalle || []).length > 0 && (
              <Card className="p-3">
                <div className="mb-1 text-xs font-bold text-brand-navy dark:text-slate-100">Qué paga este cheque</div>
                <div className="space-y-1 text-xs text-slate-500">
                  {(c.distribucion || []).map((d, i) => <div key={i}>Semana {String(d.periodoId).replace('gofo_', '').replace('_', ' → ')}: <b>{dinero(d.importe)}</b></div>)}
                  {(c.detalle || []).map((d, i) => <div key={i}>{d.posicion}{d.horas != null ? ` · ${d.horas} h` : ''} · {dinero(d.pago)}</div>)}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BANCO AUTOMÁTICO (Plaid): el banco se consulta cada 6 horas y marca los
//    cheques cobrados solo; "Sincronizar ahora" fuerza una corrida. ─────────
function PcBanco({ bd, recargar }) {
  const [trabajando, setTrabajando] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [entorno, setEntorno] = useState(bd.plaid.entorno || 'production')
  const plaidOp = (data) => httpsCallable(getFunctions(), 'plaidOp')(data).then((r) => r.data)

  const conectar = async () => {
    setTrabajando('conectar'); setMensaje(null)
    try {
      const { linkToken } = await plaidOp({ op: 'link_token', entorno })
      // carga el widget oficial de Plaid bajo demanda
      if (!window.Plaid) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
          s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar Plaid Link'))
          document.head.appendChild(s)
        })
      }
      window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken) => {
          try {
            const r = await plaidOp({ op: 'exchange', entorno, publicToken })
            setMensaje({ tipo: 'ok', texto: `Banco conectado${r.institucion ? `: ${r.institucion}` : ''}. La sincronización corre sola cada 6 horas.` })
            recargar()
          } catch (e) { setMensaje({ tipo: 'error', texto: 'No se guardó la conexión: ' + (e.message || e) }) }
        },
        onExit: () => setTrabajando(''),
      }).open()
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (String(e.message || e).includes('not-found') || String(e.message || e).includes('internal'))
        ? 'Las functions de Plaid aún no están desplegadas (o faltan los secretos). Sigue los pasos de abajo en Cloud Shell y reintenta.'
        : 'No se pudo iniciar Plaid: ' + (e.message || e) })
    } finally { setTrabajando('') }
  }
  const sincronizar = async () => {
    setTrabajando('sync'); setMensaje(null)
    try {
      const r = await plaidOp({ op: 'sync_now' })
      setMensaje({ tipo: 'ok', texto: `Sincronizado: ${r.cobrados} cheque(s) marcados cobrados · ${r.revisar} a revisar · ${r.alertas} alerta(s).` })
      recargar()
    } catch (e) { setMensaje({ tipo: 'error', texto: 'No se pudo sincronizar: ' + (e.message || e) }) } finally { setTrabajando('') }
  }
  const desconectar = async () => {
    if (!window.confirm('¿Desconectar el banco? La conciliación automática se detiene (los cheques ya marcados no cambian).')) return
    setTrabajando('des')
    try { await plaidOp({ op: 'desconectar' }); setMensaje({ tipo: 'ok', texto: 'Banco desconectado.' }); recargar() } finally { setTrabajando('') }
  }

  const u = bd.plaid.ultimoSync
  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        Conecta tu cuenta bancaria con <b>Plaid</b> y la conciliación se vuelve automática: cada <b>6 horas</b> se revisan los movimientos nuevos
        y los cheques que el banco ya pagó se marcan <b>cobrados</b> solos (por número de cheque + importe exacto; una diferencia va a revisión, nunca se adivina).
        Tus credenciales bancarias las maneja Plaid — aquí jamás se guardan usuario ni contraseña del banco.
      </Aviso>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} className="mb-4">{mensaje.texto}</Aviso>}

      {!bd.plaid.conectado && (
        <Card className="mb-4 p-5">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Conectar mi banco</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-56" value={entorno} onChange={(e) => setEntorno(e.target.value)}>
              <option value="production">Producción (banco real)</option>
              <option value="sandbox">Sandbox (pruebas de Plaid)</option>
            </Select>
            <Boton variant="gold" disabled={trabajando === 'conectar'} onClick={conectar}>{trabajando === 'conectar' ? <Spinner /> : 'Conectar con Plaid'}</Boton>
          </div>
        </Card>
      )}

      {bd.plaid.conectado && (
        <Card className="mb-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="green">conectado</Badge>
            <b className="text-brand-navy dark:text-slate-100">{bd.plaid.institucion || 'Banco'}</b>
            <span className="text-xs text-slate-400">{bd.plaid.entorno === 'sandbox' ? 'sandbox' : 'producción'} · corre sola cada 6 horas</span>
            <span className="ml-auto flex gap-2">
              <Boton variant="gold" disabled={trabajando === 'sync'} onClick={sincronizar}>{trabajando === 'sync' ? <Spinner /> : <><RefreshCw size={14} /> Sincronizar ahora</>}</Boton>
              <Boton variant="ghost" disabled={trabajando === 'des'} onClick={desconectar}>Desconectar</Boton>
            </span>
          </div>
          {u && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Última corrida</div><b>{String(u.fecha || '').replace('T', ' ').slice(0, 16)}</b></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Marcados cobrados</div><b className="text-emerald-600">{u.cobrados}</b></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">A revisar</div><b className="text-amber-600">{u.revisar}</b></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Alertas</div><b className="text-rose-500">{u.alertas}</b></div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 text-xs text-slate-500">
        <div className="mb-1 font-bold text-brand-navy dark:text-slate-100">Instalación (una sola vez, en Cloud Shell)</div>
        <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-[11px] dark:bg-slate-800">{`cd ~/BAA-FINANCIAL- && git pull origin main
firebase functions:secrets:set PLAID_CLIENT_ID   # pega tu client_id de Plaid
firebase functions:secrets:set PLAID_SECRET      # pega tu secret de Plaid
firebase deploy --only functions:plaidOp,functions:plaidSync`}</pre>
        <div className="mt-1">Las llaves viven como secretos del servidor; nunca en la página ni en el código. La cuenta debe tener el producto <b>Transactions</b> activo en tu panel de Plaid.</div>
      </Card>
    </div>
  )
}

// ── CUENTAS BANCARIAS ──────────────────────────────────────────────────────
// Bancos principales de EE. UU. para autocompletar (se puede escribir otro).
const BANCOS_US = [
  'JPMORGAN CHASE BANK NA', 'BANK OF AMERICA NA', 'WELLS FARGO BANK NA', 'CITIBANK NA',
  'U.S. BANK NA', 'PNC BANK NA', 'TRUIST BANK', 'CAPITAL ONE NA', 'TD BANK NA',
  'FIFTH THIRD BANK', 'CITIZENS BANK NA', 'REGIONS BANK', 'M&T BANK', 'KEYBANK NA',
  'HUNTINGTON NATIONAL BANK', 'BMO BANK NA', 'COMERICA BANK', 'ZIONS BANCORPORATION',
  'FIRST CITIZENS BANK', 'ALLY BANK', 'AMERICAN EXPRESS NATIONAL BANK', 'DISCOVER BANK',
  'SYNCHRONY BANK', 'NAVY FEDERAL CREDIT UNION', 'FROST BANK', 'TEXAS CAPITAL BANK',
  'PROSPERITY BANK', 'WOODFOREST NATIONAL BANK', 'AMEGY BANK', 'BOK FINANCIAL',
  'EAST WEST BANK', 'CATHAY BANK', 'SANTANDER BANK NA', 'HSBC BANK USA NA',
]
function PcCuentas({ bd, user, recargar }) {
  const VACIA = { banco: '', titular: '', routing: '', numero: '', tipo: 'Checking', direccionBanco: '', siguiente: '1001', firmaId: '' }
  const [form, setForm] = useState(VACIA)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    if (!form.banco.trim() || !form.numero.trim()) return
    setGuardando(true)
    try {
      const id = 'cta_' + form.banco.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + form.numero.slice(-4)
      await setDoc(refDoc(COLP.cuentas, id), { ...form, siguiente: Number(form.siguiente) || 1, creadoPor: user.email, creadoEn: new Date().toISOString() }, { merge: true })
      await auditarStaff('pc_cuenta_guardada', `${form.banco} ····${form.numero.slice(-4)} (siguiente #${form.siguiente})`)
      setForm(VACIA)
      recargar()
    } finally { setGuardando(false) }
  }
  return (
    <div>
      <Aviso tipo="info" className="mb-4">El número de cuenta completo solo se usa para imprimir la línea MICR; en pantalla siempre se muestra enmascarado. Nunca guardes aquí claves de banca en línea.</Aviso>
      {bd.cuentas.map((c) => (
        <Card key={c.id} className="mb-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Landmark size={16} className="text-brand-gold" />
            <b className="text-brand-navy dark:text-slate-100">{c.banco}</b>
            <span className="text-xs text-slate-500">{c.titular} · {c.tipo} · {enmascarar(c.numero)} · routing {c.routing || '—'}</span>
            <span className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-slate-400">Siguiente cheque:</span>
              <Input className="w-24 text-right font-mono" defaultValue={c.siguiente} onBlur={async (e) => {
                const v = Number(e.target.value)
                if (!v || v === c.siguiente) return
                await setDoc(refDoc(COLP.cuentas, c.id), { siguiente: v }, { merge: true })
                await auditarStaff('pc_secuencia_cambiada', `${c.banco}: siguiente #${c.siguiente} → #${v}`)
                recargar()
              }} />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Firma para esta cuenta:
            <Select className="w-56" value={c.firmaId || ''} onChange={async (e) => {
              await setDoc(refDoc(COLP.cuentas, c.id), { firmaId: e.target.value }, { merge: true })
              await auditarStaff('pc_firma_asignada', `${c.banco} → firma ${e.target.value || '(ninguna)'}`)
              recargar()
            }}>
              <option value="">Sin firma (línea en blanco)</option>
              {bd.firmas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </Select>
          </div>
        </Card>
      ))}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Agregar cuenta bancaria</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Banco (elige o escribe)" list="pc-bancos-us" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
          <datalist id="pc-bancos-us">{BANCOS_US.map((b) => <option key={b} value={b} />)}</datalist>
          <Input placeholder="Titular (B&A American Group LLC)" value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
          <Input placeholder="Routing number" value={form.routing} onChange={(e) => setForm({ ...form, routing: e.target.value })} />
          <Input placeholder="Número de cuenta" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          <Input placeholder="Dirección del banco (opcional)" value={form.direccionBanco} onChange={(e) => setForm({ ...form, direccionBanco: e.target.value })} />
          <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option>Checking</option><option>Savings</option><option>Payroll</option>
          </Select>
          <Input type="number" placeholder="Primer número de cheque" value={form.siguiente} onChange={(e) => setForm({ ...form, siguiente: e.target.value })} />
          <Boton variant="gold" disabled={guardando} onClick={guardar}>{guardando ? <Spinner /> : 'Guardar cuenta'}</Boton>
        </div>
      </Card>
    </div>
  )
}

// ── DISEÑADOR EN VIVO: mueve cada elemento y ve el cheque al instante ──────
function PcDiseno({ bd, user, recargar }) {
  const [pos, setPos] = useState(() => JSON.parse(JSON.stringify(bd.impresion.pos || {})))
  const [elem, setElem] = useState('payto')
  const [muestra, setMuestra] = useState({ beneficiario: 'Nombre Del Trabajador', importe: '1234.56', memo: 'Payroll', numero: '' })
  const [guardando, setGuardando] = useState(false)

  const cuenta = bd.cuentas[0] || { banco: 'JPMORGAN CHASE BANK NA', routing: '111000614', numero: '0000000000', siguiente: 7505 }
  const firma = bd.firmas.find((f) => f.id === cuenta.firmaId) || bd.firmas[0] || null
  const chequeMuestra = {
    numeroRaw: muestra.numero || String(cuenta.siguiente || '7505'),
    beneficiario: muestra.beneficiario || 'Nombre Del Trabajador',
    importe: Number(muestra.importe) || 0,
    fecha: hoyISO(), memo: muestra.memo,
    detalle: [{ posicion: 'Sorter', horas: 48, pago: Number(muestra.importe) || 0 }], idEmpleado: 'TX000000',
  }
  const impresionViva = { ...bd.impresion, pos }
  const html = htmlLote({ cheques: [chequeMuestra], cuenta, empresa: bd.empresa, firma, impresion: impresionViva, prueba: true })
    .replace(/<script>[\s\S]*?<\/script>/, '')

  const efectiva = (k) => ({ ...POS_BASE[k], ...(pos[k] || {}) })
  const mover = (k, campo, delta) => {
    const e = efectiva(k)
    const v = Math.max(0, Math.round((Number(e[campo]) + delta) * 10) / 10)
    setPos({ ...pos, [k]: { ...efectiva(k), [campo]: v } })
  }
  const fijar = (k, campo, valor) => setPos({ ...pos, [k]: { ...efectiva(k), [campo]: Number(valor) || 0 } })
  const cambiado = Object.keys(pos).length > 0

  const guardar = async () => {
    setGuardando(true)
    try {
      await setDoc(refDoc(COLP.config, 'impresion'), { pos, actualizadoPor: user.email }, { merge: true })
      await auditarStaff('pc_diseno_guardado', Object.keys(pos).map((k) => `${k}(${efectiva(k).x},${efectiva(k).y},${efectiva(k).s})`).join(' ') || 'sin cambios')
      recargar()
    } finally { setGuardando(false) }
  }
  const restablecer = async () => {
    if (!window.confirm('¿Volver al diseño original (el clon de tu software anterior)?')) return
    setPos({})
    setGuardando(true)
    try {
      await setDoc(refDoc(COLP.config, 'impresion'), { pos: {}, actualizadoPor: user.email }, { merge: true })
      await auditarStaff('pc_diseno_restablecido', 'posiciones base')
      recargar()
    } finally { setGuardando(false) }
  }
  const imprimirPrueba = () => {
    const conPrint = htmlLote({ cheques: [chequeMuestra], cuenta, empresa: bd.empresa, firma, impresion: impresionViva, prueba: true })
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) { window.alert('Permite las ventanas emergentes para imprimir la prueba.'); return }
    win.document.write(conPrint)
    win.document.close()
    auditarStaff('pc_impresion_prueba', 'desde el diseñador')
  }

  const e = efectiva(elem)
  const Flecha = ({ t, campo, delta }) => (
    <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700" onClick={() => mover(elem, campo, delta)}>{t}</button>
  )
  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Elemento a mover</div>
          <Select value={elem} onChange={(ev) => setElem(ev.target.value)}>
            {Object.entries(ETIQUETAS_POS).map(([k, v]) => <option key={k} value={k}>{v}{pos[k] ? ' ●' : ''}</option>)}
          </Select>
          <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
            <div className="grid grid-cols-3 gap-1">
              <span /><Flecha t="▲" campo="y" delta={-2} /><span />
              <Flecha t="◀" campo="x" delta={-2} />
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-[10px] text-slate-400 dark:border-slate-600" title="pasos de 2 puntos (~0.7 mm)">2pt</button>
              <Flecha t="▶" campo="x" delta={2} />
              <span /><Flecha t="▼" campo="y" delta={2} /><span />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-2">X (desde la izquierda)
                <Input type="number" step="1" className="w-20 text-right" value={e.x} onChange={(ev) => fijar(elem, 'x', ev.target.value)} /></label>
              <label className="flex items-center justify-between gap-2">Y (desde arriba)
                <Input type="number" step="1" className="w-20 text-right" value={e.y} onChange={(ev) => fijar(elem, 'y', ev.target.value)} /></label>
              <label className="flex items-center justify-between gap-2">{elem === 'firma' ? 'Alto del recuadro' : 'Tamaño de letra'}
                <Input type="number" step="0.5" className="w-20 text-right" value={e.s} onChange={(ev) => fijar(elem, 's', ev.target.value)} /></label>
              {pos[elem] && <button className="text-[11px] text-slate-400 hover:text-rose-500" onClick={() => { const { [elem]: _, ...resto } = pos; setPos(resto) }}>devolver este elemento a su lugar original</button>}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">Las medidas están en puntos (72 = 1 pulgada). Las etiquetas (DATE:, Pay To:…) acompañan a su dato.</div>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Datos de prueba</div>
          <div className="space-y-2 text-xs">
            <Input placeholder="Beneficiario" value={muestra.beneficiario} onChange={(ev) => setMuestra({ ...muestra, beneficiario: ev.target.value })} />
            <div className="flex gap-2">
              <Input type="number" step="0.01" placeholder="Importe" value={muestra.importe} onChange={(ev) => setMuestra({ ...muestra, importe: ev.target.value })} />
              <Input placeholder={`Nº (${cuenta.siguiente || ''})`} value={muestra.numero} onChange={(ev) => setMuestra({ ...muestra, numero: ev.target.value })} />
            </div>
            <Input placeholder="Memo" value={muestra.memo} onChange={(ev) => setMuestra({ ...muestra, memo: ev.target.value })} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <Boton variant="gold" disabled={guardando} onClick={guardar}>{guardando ? <Spinner /> : 'Guardar diseño (se usa al imprimir)'}</Boton>
            <Boton variant="ghost" onClick={imprimirPrueba}><Printer size={14} /> Imprimir prueba con este diseño</Boton>
            {cambiado && <Boton variant="ghost" onClick={restablecer}>Restablecer el diseño original</Boton>}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">El diseño guardado lo usan Imprimir, Ver cheque y las reimpresiones. La prueba sale con SAMPLE y número 000000.</div>
        </Card>
      </div>
      <Card className="p-3">
        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-900">
          <iframe title="Vista previa del cheque" srcDoc={html} className="mx-auto block rounded-lg bg-white shadow-lg" style={{ border: 0, width: 830, height: 780 }} />
        </div>
      </Card>
    </div>
  )
}

// ── FIRMAS (biblioteca de imágenes + firma remota por QR) ──────────────────
function PcFirmas({ bd, user, recargar }) {
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [qr, setQr] = useState(null) // { token, imagen }
  const [remota, setRemota] = useState(null) // doc recibido del iPad

  // sondeo: cuando el iPad envía la firma, aparece aquí para confirmarla
  useEffect(() => {
    if (!qr) return undefined
    const timer = setInterval(async () => {
      const pendientes = await cargar(COLP.firmasPend)
      const doc = pendientes.find((p) => p.id === qr.token)
      if (doc && doc.imagen) setRemota(doc)
    }, 3000)
    return () => clearInterval(timer)
  }, [qr])

  const generarQR = async () => {
    const token = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const url = `${window.location.origin}/firma-qr#${token}`
    const imagen = await QRCode.toDataURL(url, { width: 280, margin: 1 })
    setRemota(null)
    setQr({ token, url, imagen })
    await auditarStaff('pc_qr_generado', 'firma remota solicitada')
  }
  const confirmarRemota = async () => {
    if (!remota || !nombre.trim()) { if (!nombre.trim()) window.alert('Escribe el nombre del firmante antes de confirmar.'); return }
    setGuardando(true)
    try {
      const id = 'fir_' + nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      await setDoc(refDoc(COLP.firmas, id), { nombre: nombre.trim(), imagen: remota.imagen, origen: 'ipad-qr', creadoPor: user.email, creadoEn: new Date().toISOString() })
      await escribirEnLotes([{ ref: refDoc(COLP.firmasPend, remota.id), borrar: true }])
      await auditarStaff('pc_firma_remota_guardada', `${nombre.trim()} (firmada en otro dispositivo por ${remota.firmadoPor})`)
      setQr(null); setRemota(null); setNombre('')
      recargar()
    } finally { setGuardando(false) }
  }
  const descartarRemota = async () => {
    if (remota) await escribirEnLotes([{ ref: refDoc(COLP.firmasPend, remota.id), borrar: true }])
    setQr(null); setRemota(null)
  }
  const subir = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f || !nombre.trim()) { if (!nombre.trim()) window.alert('Primero escribe el nombre del firmante.'); return }
    setGuardando(true)
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f) })
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
      const canvas = document.createElement('canvas')
      const esc = Math.min(1, 600 / img.width)
      canvas.width = Math.round(img.width * esc); canvas.height = Math.round(img.height * esc)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const optimizada = canvas.toDataURL('image/png')
      const id = 'fir_' + nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      await setDoc(refDoc(COLP.firmas, id), { nombre: nombre.trim(), imagen: optimizada, creadoPor: user.email, creadoEn: new Date().toISOString() })
      await auditarStaff('pc_firma_subida', nombre.trim())
      setNombre('')
      recargar()
    } catch (err) { window.alert('No se pudo procesar la imagen: ' + (err.message || err)) } finally { setGuardando(false) }
  }
  const quitar = async (f) => {
    if (!window.confirm(`¿Eliminar la firma de "${f.nombre}"?`)) return
    await escribirEnLotes([{ ref: refDoc(COLP.firmas, f.id), borrar: true }])
    await auditarStaff('pc_firma_eliminada', f.nombre)
    recargar()
  }
  return (
    <div>
      <Aviso tipo="info" className="mb-4">Sube la firma autorizada como imagen (PNG/JPG, idealmente tinta oscura sobre fondo blanco o transparente). Se optimiza sola para impresión. Cada uso en un lote queda auditado.</Aviso>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        {bd.firmas.map((f) => (
          <Card key={f.id} className="p-3 text-center">
            <img src={f.imagen} alt={f.nombre} className="mx-auto h-14 object-contain" />
            <div className="mt-1 text-xs font-semibold text-brand-navy dark:text-slate-100">{f.nombre}</div>
            <button className="mt-1 text-[11px] text-rose-400 hover:text-rose-600" onClick={() => quitar(f)}>eliminar</button>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-56" placeholder="Nombre del firmante" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            <FileSignature size={15} /> {guardando ? 'Procesando…' : 'Subir imagen de firma'}
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={subir} disabled={guardando} />
          </label>
          <Boton variant="ghost" onClick={generarQR}><QrCode size={15} /> Firmar con iPad / teléfono (QR)</Boton>
        </div>

        {qr && (
          <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-700/60">
            <div className="text-center">
              <img src={qr.imagen} alt="QR para firmar" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
              <div className="mt-2 text-xs text-slate-500">1. Escanea con la cámara del iPad o teléfono.<br />2. Inicia sesión con tu cuenta (el QR solo no da acceso).<br />3. Firma con el dedo o el Apple Pencil y toca "Guardar y enviar".</div>
              <div className="mt-1 text-[11px] text-slate-400">El código caduca en 15 minutos y es de un solo uso.</div>
            </div>
            <div className="text-center">
              {!remota && <div className="grid h-full place-items-center text-xs text-slate-400"><span><Spinner className="mx-auto mb-2" /><br />Esperando la firma desde el otro dispositivo…</span></div>}
              {remota && (
                <div>
                  <div className="mb-1 text-xs font-bold text-emerald-600">¡Firma recibida!</div>
                  <img src={remota.imagen} alt="Firma recibida" className="mx-auto h-24 rounded-xl border border-slate-200 bg-white object-contain px-3 dark:border-slate-600" />
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Boton variant="gold" disabled={guardando} onClick={confirmarRemota}>{guardando ? <Spinner /> : 'Confirmar y guardar en la biblioteca'}</Boton>
                    <Boton variant="ghost" onClick={descartarRemota}>Descartar</Boton>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">Usa el campo "Nombre del firmante" de arriba antes de confirmar.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── AJUSTES (compañía emisora + calibración de impresión) ──────────────────
function PcAjustes({ bd, user, recargar }) {
  const [emp, setEmp] = useState(bd.empresa)
  const [imp, setImp] = useState(bd.impresion)
  const [guardando, setGuardando] = useState('')
  const guardarEmp = async () => {
    setGuardando('emp')
    try {
      await setDoc(refDoc(COLP.config, 'empresa'), { ...emp, actualizadoPor: user.email }, { merge: true })
      await auditarStaff('pc_empresa', emp.nombre)
      recargar()
    } finally { setGuardando('') }
  }
  const guardarImp = async () => {
    setGuardando('imp')
    try {
      await setDoc(refDoc(COLP.config, 'impresion'), { offX: Number(imp.offX) || 0, offY: Number(imp.offY) || 0, mostrarMICR: !!imp.mostrarMICR, papel: imp.papel || 'blanco', actualizadoPor: user.email }, { merge: true })
      await auditarStaff('pc_calibracion', `papel ${imp.papel || 'blanco'} · offset ${imp.offX}/${imp.offY} in · MICR ${imp.mostrarMICR ? 'sí' : 'no'}`)
      recargar()
    } finally { setGuardando('') }
  }
  const subirFuente = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 400 * 1024) { window.alert('La fuente es muy grande (máx 400 KB). Usa el archivo .ttf de la fuente MICR.'); return }
    setGuardando('fuente')
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f) })
      await setDoc(refDoc(COLP.config, 'impresion'), { fuenteMICR: url, fuenteMICRNombre: f.name, actualizadoPor: user.email }, { merge: true })
      await auditarStaff('pc_fuente_micr', f.name)
      recargar()
    } finally { setGuardando('') }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Compañía emisora (lo que se imprime en el cheque)</div>
        <div className="grid gap-2">
          <Input placeholder="Razón social (B&A AMERICAN GROUP LLC)" value={emp.nombre || ''} onChange={(e) => setEmp({ ...emp, nombre: e.target.value })} />
          <Input placeholder="Marca (NEXSEND)" value={emp.marca || ''} onChange={(e) => setEmp({ ...emp, marca: e.target.value })} />
          <Input placeholder="Dirección línea 1" value={emp.direccion1 || ''} onChange={(e) => setEmp({ ...emp, direccion1: e.target.value })} />
          <Input placeholder="Dirección línea 2 (ciudad, estado, ZIP)" value={emp.direccion2 || ''} onChange={(e) => setEmp({ ...emp, direccion2: e.target.value })} />
          <Boton variant="gold" disabled={guardando === 'emp'} onClick={guardarEmp}>{guardando === 'emp' ? <Spinner /> : 'Guardar compañía'}</Boton>
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Papel y calibración de impresión</div>
        <div className="grid gap-2 text-xs">
          <label className="flex items-center gap-2">Tipo de papel
            <Select className="w-72" value={imp.papel || 'blanco'} onChange={(e) => setImp({ ...imp, papel: e.target.value })}>
              <option value="blanco">EZ Checks EN BLANCO (se imprime todo, incluida la MICR)</option>
              <option value="preimpreso">Preimpreso (el papel ya trae membrete, número y MICR)</option>
            </Select></label>
          <label className="flex items-center gap-2">Desplazamiento horizontal (pulgadas)
            <Input type="number" step="0.05" className="w-24" value={imp.offX} onChange={(e) => setImp({ ...imp, offX: e.target.value })} /></label>
          <label className="flex items-center gap-2">Desplazamiento vertical (pulgadas)
            <Input type="number" step="0.05" className="w-24" value={imp.offY} onChange={(e) => setImp({ ...imp, offY: e.target.value })} /></label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!imp.mostrarMICR} onChange={(e) => setImp({ ...imp, mostrarMICR: e.target.checked })} />
            Imprimir línea MICR (apágala si usas papel preimpreso del banco)
          </label>
          <Boton variant="gold" disabled={guardando === 'imp'} onClick={guardarImp}>{guardando === 'imp' ? <Spinner /> : 'Guardar calibración'}</Boton>
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700/60">
            <div className="mb-1 font-bold text-slate-500">Fuente MICR (para papel en blanco)</div>
            <div className="text-[11px] text-slate-400">
              {bd.impresion.fuenteMICRNombre
                ? <>Fuente cargada: <b>{bd.impresion.fuenteMICRNombre}</b> — se usa al imprimir la línea MICR.</>
                : 'Si tu computadora ya tiene instalada la fuente "MICR" de tu software anterior, se usa sola. Si imprimes desde otro equipo, sube aquí el archivo .ttf de la fuente E-13B.'}
            </div>
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              {guardando === 'fuente' ? <Spinner /> : 'Subir fuente MICR (.ttf/.otf)'}
              <input type="file" accept=".ttf,.otf,font/ttf,font/otf" className="hidden" onChange={subirFuente} disabled={guardando === 'fuente'} />
            </label>
          </div>
          <div className="text-[11px] text-slate-400">Usa "Impresión de PRUEBA" en la pestaña Imprimir y ajusta los desplazamientos hasta que el texto caiga exacto sobre tu papel EZ Checks (cheque arriba).</div>
        </div>
      </Card>
    </div>
  )
}
