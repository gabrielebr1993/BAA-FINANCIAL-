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
import { Users, ArrowLeft, Link2 } from 'lucide-react'
import { COL, cargar, auditarStaff, escribirEnLotes, refDoc, setDoc, arrayUnion } from './datosStaff'
import { Select } from '../../components/ui'
import { normalizarNombre } from './parserGofo'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WhTrabajadores({ user }) {
  const [datos, setDatos] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(null)
  const recargar = async () => {
    const [workers, registros, ajustes, cheques, grupos] = await Promise.all([
      cargar(COL.workers), cargar(COL.registros), cargar(COL.ajustes), cargar(COL.cheques), cargar(COL.grupos),
    ])
    setDatos({ workers, registros, ajustes, cheques, grupos })
  }
  useEffect(() => { recargar() }, [])
  if (!datos) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando perfiles…</div>

  const activos = datos.workers.filter((w) => !w.fusionadoEn)
  const duplicados = activos.filter((w) => w.posibleDuplicadoDe && datos.workers.some((x) => x.id === w.posibleDuplicadoDe))

  if (sel) {
    const w = datos.workers.find((x) => x.id === sel)
    return <PerfilWorker w={w} datos={datos} user={user} volver={() => setSel(null)} recargar={recargar} />
  }

  const lista = activos
    .map((w) => {
      const regs = datos.registros.filter((r) => r.workerId === w.id)
      const calc = regs.reduce((s, r) => s + (r.miPago || 0), 0)
      const cobradoCheques = datos.cheques.filter((c) => c.workerId === w.id && c.estado === 'cobrado').reduce((s, c) => s + (c.importe || 0), 0)
      return { w, periodos: new Set(regs.map((r) => r.periodoId)).size, horas: regs.reduce((s, r) => s + (r.horasTotal || 0), 0), calc, cobradoCheques }
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
      <Card className="mb-3 p-3"><Input placeholder="Buscar trabajador…" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></Card>
      {lista.length === 0 && <EstadoVacio icono={Users} titulo="Sin trabajadores todavía" texto="Importa un período de Gofo en la pestaña Staffing Gofo y los perfiles se crean solos." mostrarBoton={false} />}
      <div className="grid gap-2">
        {lista.map(({ w, periodos, horas, calc, cobradoCheques }) => (
          <Card key={w.id} className="cursor-pointer p-3 hover:shadow-md" onClick={() => setSel(w.id)}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-brand-navy dark:text-slate-100">{w.nombre}</span>
              {w.idEmpleado && <Badge color="navy">{w.idEmpleado}</Badge>}
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
      <PageTitle right={<Boton variant="ghost" onClick={volver}><ArrowLeft size={14} /> Volver</Boton>}>{w.nombre}</PageTitle>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Calculado a pagar</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(calc)}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Cheques emitidos</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(emitido)}</div><div className="text-[11px] text-slate-400">pendiente de emitir {dinero(Math.max(0, calc - emitido))}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Cobrado (banco)</div><div className="text-xl font-black text-emerald-600">{dinero(cobrado)}</div><div className="text-[11px] text-slate-400">en tránsito {dinero(Math.max(0, emitido - cobrado))}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase text-slate-400">Saldo restante</div><div className="text-xl font-black text-brand-navy dark:text-slate-100">{dinero(calc - cobrado)}</div></Card>
      </div>

      {(w.alias || []).length > 0 && <div className="mb-3 text-xs text-slate-400">Alias verificados: {(w.alias || []).join(' · ')}</div>}

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
              <span className="ml-auto text-xs text-slate-400">{Math.round(tot.h * 100) / 100} h · Gofo {dinero(tot.g)} · mi pago {dinero(tot.m)}</span>
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
