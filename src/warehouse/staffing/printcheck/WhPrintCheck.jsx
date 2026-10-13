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
import { Banknote, Printer, Plus, FileSignature, Settings, LayoutDashboard, ListChecks, Landmark, QrCode, PencilRuler } from 'lucide-react'
import QRCode from 'qrcode'
import { COL, cargar, cargarPor, auditarStaff, refDoc, setDoc, escribirEnLotes, serverTimestamp } from '../datosStaff'
import { idCheque, normalizarNumero } from '../logicaCheques'
import { planearLote, asignarNumeros, enmascarar, r2 } from './logicaPrint'
import { htmlLote } from './plantillaBA'

const COLP = { cuentas: 'wh_pc_cuentas', lotes: 'wh_pc_lotes', firmas: 'wh_pc_firmas', firmasPend: 'wh_pc_firmas_pend', config: 'wh_pc_config' }
const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function WhPrintCheck({ user }) {
  const [sub, setSub] = useState('panel')
  const [bd, setBd] = useState(null)
  const [loteImprimir, setLoteImprimir] = useState('')
  const [chequeSolo, setChequeSolo] = useState('')
  const recargar = async () => {
    const [cuentas, firmas, lotes, cfgs, cheques, periodos, workers] = await Promise.all([
      cargar(COLP.cuentas), cargar(COLP.firmas), cargar(COLP.lotes), cargar(COLP.config), cargar(COL.cheques), cargar(COL.periodos), cargar(COL.workers),
    ])
    setBd({
      cuentas, firmas, cheques, workers,
      lotes: lotes.sort((a, b) => String(b.creadoISO || '').localeCompare(a.creadoISO || '')),
      periodos: periodos.sort((a, b) => String(b.inicio).localeCompare(a.inicio)),
      // valores iniciales tomados del membrete real del software anterior
      empresa: cfgs.find((c) => c.id === 'empresa') || { nombre: 'B&A American Group', marca: 'NEXSEND', direccion1: '5605 FM 423 STE 500-313', direccion2: 'FRISCO TEXAS 75036' },
      impresion: cfgs.find((c) => c.id === 'impresion') || { offX: 0, offY: 0, mostrarMICR: true, papel: 'blanco' },
    })
  }
  useEffect(() => { recargar() }, [])
  if (!bd) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando Print Check…</div>

  const SUBS = [
    ['panel', 'Dashboard', LayoutDashboard], ['crear', 'Crear cheques', Plus], ['imprimir', 'Imprimir', Printer],
    ['registro', 'Registro', ListChecks], ['diseno', 'Diseño del cheque', PencilRuler], ['cuentas', 'Cuentas bancarias', Landmark], ['firmas', 'Firmas', FileSignature], ['ajustes', 'Ajustes', Settings],
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
      {sub === 'panel' && <PcDashboard bd={bd} irA={setSub} />}
      {sub === 'crear' && <PcCrear bd={bd} user={user} recargar={recargar} irAImprimir={irAImprimir} />}
      {sub === 'imprimir' && <PcImprimir bd={bd} user={user} loteInicial={loteImprimir} chequeSolo={chequeSolo} />}
      {sub === 'registro' && <PcRegistro bd={bd} user={user} recargar={recargar} irAImprimir={irAImprimir} />}
      {sub === 'diseno' && <PcDiseno bd={bd} />}
      {sub === 'cuentas' && <PcCuentas bd={bd} user={user} recargar={recargar} />}
      {sub === 'firmas' && <PcFirmas bd={bd} user={user} recargar={recargar} />}
      {sub === 'ajustes' && <PcAjustes bd={bd} user={user} recargar={recargar} />}
    </div>
  )
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function PcDashboard({ bd, irA }) {
  const [filtro, setFiltro] = useState({ cuentaId: '', desde: '', hasta: '', estado: 'todos' })
  const ch = bd.cheques
    .filter((c) => !filtro.cuentaId || c.cuentaId === filtro.cuentaId)
    .filter((c) => !filtro.desde || (c.fecha || '') >= filtro.desde)
    .filter((c) => !filtro.hasta || (c.fecha || '') <= filtro.hasta)
    .filter((c) => filtro.estado === 'todos' || (c.estado || 'emitido') === filtro.estado)
  const suma = (lista) => r2(lista.reduce((s, c) => s + (c.importe || 0), 0))
  const emitidos = ch.filter((c) => c.estado !== 'cancelado')
  const cobrados = ch.filter((c) => c.estado === 'cobrado')
  const anulados = ch.filter((c) => c.estado === 'cancelado')
  const pendientes = ch.filter((c) => c.estado !== 'cancelado' && c.estado !== 'cobrado')
  const K = ({ label, n, sub, color }) => (
    <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">{label}</div>
      <div className={`text-xl font-black ${color || 'text-brand-navy dark:text-slate-100'}`}>{n}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}</Card>
  )
  return (
    <div>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
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
          {(filtro.cuentaId || filtro.desde || filtro.hasta || filtro.estado !== 'todos') && (
            <Boton variant="ghost" onClick={() => setFiltro({ cuentaId: '', desde: '', hasta: '', estado: 'todos' })}>Limpiar</Boton>
          )}
          <span className="ml-auto text-slate-400">{ch.length} cheques en el filtro · {dinero(suma(ch))}</span>
        </div>
      </Card>
      <div className="cm-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <K label="Cheques emitidos" n={emitidos.length} sub={dinero(suma(emitidos))} />
        <K label="Pendientes de cobro (outstanding)" n={pendientes.length} sub={dinero(suma(pendientes))} color="text-amber-600" />
        <K label="Cobrados" n={cobrados.length} sub={dinero(suma(cobrados))} color="text-emerald-600" />
        <K label="Anulados" n={anulados.length} sub={dinero(suma(anulados))} color="text-rose-500" />
        <K label="Lotes generados" n={bd.lotes.length} sub={bd.cuentas.length + ' cuenta(s) bancaria(s)'} />
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
  const cuenta = bd.cuentas.find((c) => c.id === cuentaId)

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
              {bd.periodos.map((p) => <option key={p.id} value={p.id}>{p.inicio} → {p.fin}</option>)}
            </Select></div>
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
                  <td className="pr-2 font-semibold text-brand-navy dark:text-slate-100">{f.nombre}</td>
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

function PcImprimir({ bd, user, loteInicial, chequeSolo }) {
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

  const imprimir = async () => {
    const html = htmlLote({ cheques, cuenta, empresa: bd.empresa, firma, impresion: bd.impresion, prueba })
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) { window.alert('Permite las ventanas emergentes para imprimir.'); return }
    win.document.write(html)
    win.document.close()
    await auditarStaff(prueba ? 'pc_impresion_prueba' : 'pc_impresion', `${chequeSolo ? '1 cheque' : `lote ${loteId} (${cheques.length} cheques)`}${prueba ? ' [SAMPLE]' : ''} por ${user.email}`)
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
function PcRegistro({ bd, user, recargar, irAImprimir }) {
  const [filtro, setFiltro] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const lista = bd.cheques
    .filter((c) => filtro === 'todos' || c.estado === filtro)
    .filter((c) => !buscar || String(c.numeroRaw).includes(buscar) || String(c.beneficiario || '').toLowerCase().includes(buscar.toLowerCase()))
    .sort((a, b) => Number(b.numeroRaw || 0) - Number(a.numeroRaw || 0))
  const anular = async (c) => {
    const motivo = window.prompt(`¿Anular el cheque #${c.numeroRaw} de ${c.beneficiario}? Escribe el motivo:`)
    if (!motivo) return
    await setDoc(refDoc(COL.cheques, c.id), { estado: 'cancelado', motivoCancelacion: motivo, canceladoEn: new Date().toISOString(), canceladoPor: user.email }, { merge: true })
    await auditarStaff('pc_cheque_anulado', `#${c.numeroRaw} ${c.beneficiario} ${dinero(c.importe)}: ${motivo}`)
    recargar()
  }
  return (
    <div>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Select className="w-44" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos los estados</option><option value="emitido">Emitidos</option>
            <option value="cobrado">Cobrados</option><option value="cancelado">Anulados</option>
          </Select>
          <Input className="w-56" placeholder="Buscar número o beneficiario…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <span className="ml-auto text-slate-400">{lista.length} cheques · {dinero(r2(lista.reduce((s, c) => s + (c.importe || 0), 0)))}</span>
        </div>
      </Card>
      {lista.length === 0 && <EstadoVacio icono={Banknote} titulo="Sin cheques" texto="Los cheques generados (y los importados en la pestaña Cheques) aparecen aquí." mostrarBoton={false} />}
      <div className="grid gap-2">
        {lista.map((c) => (
          <Card key={c.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">#{c.numeroRaw || c.numeroNorm}</span>
              <span className="font-semibold">{c.beneficiario || '—'}</span>
              <Badge color={c.estado === 'cobrado' ? 'green' : c.estado === 'cancelado' ? 'red' : 'gold'}>{c.estado || 'emitido'}</Badge>
              <span className="text-slate-400">{c.fecha || ''} {c.banco ? `· ${c.banco}` : ''} {c.loteId ? `· ${c.loteId}` : ''}</span>
              <b className="ml-auto">{dinero(c.importe)}</b>
              {c.origen === 'printcheck' && c.estado !== 'cancelado' && (
                <Boton variant="ghost" onClick={async () => { await auditarStaff('pc_reimpresion', `#${c.numeroRaw} ${c.beneficiario}`); irAImprimir('', c.id) }}><Printer size={13} /> Reimprimir</Boton>
              )}
              {c.estado !== 'cancelado' && c.estado !== 'cobrado' && <button className="text-rose-400 hover:text-rose-600" onClick={() => anular(c)}>anular</button>}
            </div>
            {c.motivoCancelacion && <div className="mt-1 text-[11px] text-rose-400">Anulado: {c.motivoCancelacion}</div>}
          </Card>
        ))}
      </div>
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

// ── DISEÑO DEL CHEQUE (vista previa en vivo del formato clonado de B&A) ────
function PcDiseno({ bd }) {
  const cuenta = bd.cuentas[0] || { banco: 'JPMORGAN CHASE BANK NA', routing: '111000614', numero: '0000000000', siguiente: 7505 }
  const firma = bd.firmas.find((f) => f.id === cuenta.firmaId) || bd.firmas[0] || null
  const html = htmlLote({
    cheques: [{ numeroRaw: String(cuenta.siguiente || '7505'), beneficiario: 'Nombre Del Trabajador', importe: 1234.56, fecha: hoyISO(), memo: 'Payroll', detalle: [{ posicion: 'Sorter', horas: 48, pago: 1234.56 }], idEmpleado: 'TX000000' }],
    cuenta, empresa: bd.empresa, firma, impresion: bd.impresion, prueba: true,
  }).replace(/<script>[\s\S]*?<\/script>/, '')
  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        Este es tu diseño actual: el <b>clon exacto del formato de tu software anterior</b> (medido del PDF real), para papel EZ Checks con el cheque arriba.
        La vista usa datos de muestra con la marca SAMPLE. Lo que se ajusta hoy: compañía, banco/cuenta, firma, tipo de papel, línea MICR y desplazamientos (pestaña Ajustes).
        El editor visual de arrastrar y soltar elementos es la siguiente fase.
      </Aviso>
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
