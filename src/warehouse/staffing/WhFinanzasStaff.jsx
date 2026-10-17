// ============================================================================
// WAREHOUSE / STAFFING · Finanzas: comparación semanal.
//
// Por semana: ingreso reconocido por Gofo (con ajustes), dinero cobrado,
// pagos calculados, dinero efectivamente pagado (cheques cobrados), gastos,
// margen, utilidad operativa y %, saldos por cobrar/pagar, personas y horas.
// · Mejor/peor semana por ingreso, cobro real y utilidad.
// · Variación vs semana anterior en $ y % + qué la explica (horas, tarifas,
//   gastos). · Filtros por período, persona, posición y warehouse.
// · Los períodos con tarifas pendientes se marcan PARCIALES para no comparar
//   contra números incompletos. Rentabilidad ≠ flujo de caja: se muestran
//   ambos por separado.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio, KPI } from '../../components/ui'
import { BarChart3, Plus, Trash2, FileDown, TrendingUp, DollarSign, Wallet, Banknote, Receipt, Clock } from 'lucide-react'
import { COL, cargar, auditarStaff, refDoc, setDoc, escribirEnLotes } from './datosStaff'
import { resumenPeriodo, gastosFijosDe } from './calculosStaff'
import { normalizarNombre, hashContenido, paraBuscar } from './parserGofo'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const pct = (n) => (n === null || n === undefined ? 'no aplica' : `${n}%`)

export default function WhFinanzasStaff({ user }) {
  const [datos, setDatos] = useState(null)
  const [filtro, setFiltro] = useState({ periodo: '', persona: '', posicion: '', warehouse: '', cobro: '' })
  const [orden, setOrden] = useState('fecha')
  const recargar = async () => {
    const [periodos, registros, ajustes, gastos, cobros, cheques, configs, workers] = await Promise.all([
      cargar(COL.periodos), cargar(COL.registros), cargar(COL.ajustes), cargar(COL.gastos), cargar(COL.cobros), cargar(COL.cheques), cargar(COL.config), cargar(COL.workers),
    ])
    const gastosFijos = configs.find((c) => c.id === 'gastosFijos')?.lista || []
    const pagoAparteIds = new Set(workers.filter((w) => w.pagoAparte).map((w) => w.id))
    setDatos({ periodos: periodos.sort((a, b) => String(a.inicio).localeCompare(b.inicio)), registros, ajustes, gastos, cobros, cheques, gastosFijos, pagoAparteIds })
  }
  useEffect(() => { recargar() }, [])

  const filas = useMemo(() => {
    if (!datos) return []
    const hayFiltroDetalle = filtro.persona || filtro.posicion || filtro.warehouse
    return datos.periodos
      .filter((p) => !filtro.periodo || p.id === filtro.periodo)
      .map((p) => {
        let regs = datos.registros.filter((r) => r.periodoId === p.id)
        if (filtro.persona) regs = regs.filter((r) => paraBuscar(r.nombre || r.nombreNorm).includes(paraBuscar(filtro.persona)))
        if (filtro.posicion) regs = regs.filter((r) => r.posicion === filtro.posicion)
        if (filtro.warehouse) regs = regs.filter((r) => r.warehouse === filtro.warehouse)
        const res = resumenPeriodo({
          registros: regs,
          ajustes: hayFiltroDetalle ? [] : datos.ajustes.filter((a) => a.periodoAplicaId === p.id && a.estado !== 'revision'),
          gastos: hayFiltroDetalle ? [] : [...datos.gastos.filter((g) => g.periodoId === p.id), ...gastosFijosDe(datos.gastosFijos, p.fin)],
          cobros: hayFiltroDetalle ? [] : datos.cobros.filter((c) => c.periodoId === p.id),
          cheques: hayFiltroDetalle ? [] : datos.cheques.filter((c) => (c.distribucion || []).some((d) => d.periodoId === p.id)),
          pagoAparteIds: datos.pagoAparteIds,
        })
        return { p, res, regs }
      })
      .filter((x) => x.regs.length > 0)
      // filtro de cobro: solo sin filtros de detalle (con ellos los cobros no
      // se incluyen y todas las semanas parecerían pendientes)
      .filter((x) => {
        if (!filtro.cobro || hayFiltroDetalle) return true
        const cobrada = x.res.porCobrar <= 0.01
        return filtro.cobro === 'cobradas' ? cobrada : !cobrada
      })
  }, [datos, filtro])

  if (!datos) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando finanzas…</div>

  const completos = filas.filter((x) => !x.res.parcial)
  const extremo = (campo, fn) => {
    if (!completos.length) return null
    return completos.reduce((m, x) => (fn(x.res[campo], m.res[campo]) ? x : m), completos[0])
  }
  const mayor = (c) => extremo(c, (a, b) => a > b)
  const menor = (c) => extremo(c, (a, b) => a < b)
  const hayFiltroDetalle = filtro.persona || filtro.posicion || filtro.warehouse

  const posiciones = [...new Set(datos.registros.map((r) => r.posicion).filter(Boolean))]
  const warehouses = [...new Set(datos.registros.map((r) => r.warehouse).filter(Boolean))]

  // pares (semana, anterior cronológica) para que el orden elegido no rompa
  // la comparación "vs semana anterior"
  const pares = filas.map((x, i) => ({ x, ant: i > 0 ? filas[i - 1] : null }))
  const paresOrdenados = orden === 'fecha' ? pares : [...pares].sort((a, b) => (b.x.res[orden] || 0) - (a.x.res[orden] || 0))

  // totales de lo filtrado: la GANANCIA REAL (después de gastos) manda
  const totFiltro = {
    ingreso: filas.reduce((s, x) => s + x.res.ingreso, 0),
    cobrado: filas.reduce((s, x) => s + x.res.cobrado, 0),
    pagos: filas.reduce((s, x) => s + x.res.pagoCalc, 0),
    gastos: filas.reduce((s, x) => s + x.res.gastos, 0),
    utilidad: completos.reduce((s, x) => s + x.res.utilidad, 0),
    horas: filas.reduce((s, x) => s + x.res.horas, 0),
    parciales: filas.length - completos.length,
  }

  const exportarCSV = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const enc = ['Semana inicio', 'Semana fin', 'Personas', 'Horas', 'Ingreso Gofo', 'Ajustes', 'Cobrado', 'Por cobrar', 'Pagos calculados', 'Pagado real', 'Por pagar', 'Gastos', 'Margen', 'Ganancia real (después de gastos)', '% utilidad', 'Estado']
    const lineas = [enc.map(esc).join(',')]
    for (const { x } of pares) {
      const r = x.res
      lineas.push([x.p.inicio, x.p.fin, r.trabajadores, r.horas, r.ingreso, r.ajustes, r.cobrado, r.porCobrar, r.pagoCalc, r.pagado, r.porPagar, r.gastos,
        r.parcial ? '' : r.margen, r.parcial ? '' : r.utilidad, r.pctUtilidad ?? '', r.parcial ? 'PARCIAL' : (r.porCobrar <= 0.01 ? 'cobrada' : 'por cobrar')].map(esc).join(','))
    }
    lineas.push(['TOTAL', '', '', totFiltro.horas, totFiltro.ingreso, '', totFiltro.cobrado, Math.max(0, totFiltro.ingreso - totFiltro.cobrado), totFiltro.pagos, '', '', totFiltro.gastos, '', totFiltro.utilidad, '', ''].map(esc).join(','))
    const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'finanzas_staffing.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    auditarStaff('finanzas_exportadas', `${filas.length} semanas a CSV`)
  }

  return (
    <div>
      <PageTitle>Finanzas · Warehouse / Staffing</PageTitle>
      {datos.periodos.length === 0 && <EstadoVacio icono={BarChart3} titulo="Sin períodos importados" texto="Importa semanas de Gofo para ver la comparación." mostrarBoton={false} />}

      {datos.periodos.length > 0 && (
        <>
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Select className="w-52" value={filtro.periodo} onChange={(e) => setFiltro({ ...filtro, periodo: e.target.value })}>
                <option value="">Todos los períodos</option>
                {datos.periodos.map((p) => <option key={p.id} value={p.id}>{p.inicio} → {p.fin}</option>)}
              </Select>
              <Input className="w-44" placeholder="Persona…" value={filtro.persona} onChange={(e) => setFiltro({ ...filtro, persona: e.target.value })} />
              <Select className="w-40" value={filtro.posicion} onChange={(e) => setFiltro({ ...filtro, posicion: e.target.value })}>
                <option value="">Todas las posiciones</option>
                {posiciones.map((x) => <option key={x}>{x}</option>)}
              </Select>
              <Select className="w-40" value={filtro.warehouse} onChange={(e) => setFiltro({ ...filtro, warehouse: e.target.value })}>
                <option value="">Todos los warehouses</option>
                {warehouses.map((x) => <option key={x}>{x}</option>)}
              </Select>
              <Select className="w-52" value={filtro.cobro} onChange={(e) => setFiltro({ ...filtro, cobro: e.target.value })} disabled={!!hayFiltroDetalle} title={hayFiltroDetalle ? 'Quita los filtros de detalle para filtrar por cobro' : ''}>
                <option value="">Cobro: todas las semanas</option>
                <option value="cobradas">Cobradas al 100%</option>
                <option value="pendientes">Con saldo por cobrar</option>
              </Select>
              <Select className="w-44" value={orden} onChange={(e) => setOrden(e.target.value)}>
                <option value="fecha">Orden: cronológico</option>
                <option value="utilidad">Orden: mayor ganancia</option>
                <option value="ingreso">Orden: mayor ingreso</option>
                <option value="porCobrar">Orden: mayor saldo por cobrar</option>
              </Select>
              <Boton variant="ghost" onClick={exportarCSV}><FileDown size={13} /> Exportar CSV</Boton>
              {(filtro.periodo || filtro.cobro || hayFiltroDetalle) && <Boton variant="ghost" onClick={() => setFiltro({ periodo: '', persona: '', posicion: '', warehouse: '', cobro: '' })}>Limpiar</Boton>}
            </div>
            {hayFiltroDetalle && <div className="mt-2 text-[11px] text-slate-400">Con filtros de detalle, los gastos, cobros, ajustes y cheques (que son del período completo) no se incluyen para no engañar la comparación.</div>}
          </Card>

          {/* Totales de lo filtrado: KPIs con la ganancia real al frente */}
          {!hayFiltroDetalle && filas.length > 0 && (
            <>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Totales de las semanas mostradas ({filas.length})</div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <KPI label="Ganancia real (después de gastos)" value={dinero(totFiltro.utilidad)} icon={TrendingUp} animado
                  accent={totFiltro.utilidad >= 0 ? 'green' : 'red'}
                  sub={`${totFiltro.ingreso > 0 ? `${Math.round((totFiltro.utilidad / totFiltro.ingreso) * 1000) / 10}% del ingreso` : 'no aplica'}${totFiltro.parciales ? ` · sin ${totFiltro.parciales} parcial(es)` : ''}`} />
                <KPI label="Ingreso Gofo" value={dinero(totFiltro.ingreso)} icon={DollarSign} accent="navy" animado />
                <KPI label="Cobrado" value={dinero(totFiltro.cobrado)} icon={Wallet} accent="blue" animado sub={`por cobrar ${dinero(Math.max(0, totFiltro.ingreso - totFiltro.cobrado))}`} />
                <KPI label="Pagos a trabajadores" value={dinero(totFiltro.pagos)} icon={Banknote} accent="gold" animado />
                <KPI label="Gastos" value={dinero(totFiltro.gastos)} icon={Receipt} accent="slate" animado />
                <KPI label="Horas trabajadas" value={`${Math.round(totFiltro.horas).toLocaleString()} h`} icon={Clock} accent="slate" animado />
              </div>
            </>
          )}

          {/* Gráfica semanal: ingreso vs pagos+gastos y la línea de ganancia real */}
          {!hayFiltroDetalle && filas.length > 1 && (
            <Card className="mb-4 p-4">
              <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Ingreso, pagos y ganancia real por semana</div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart data={filas.map(({ p, res }) => ({
                    nombre: String(p.inicio || '').slice(5),
                    Ingreso: res.ingreso,
                    Pagos: res.pagoCalc,
                    Gastos: res.gastos,
                    'Ganancia real': res.parcial ? null : res.utilidad,
                  }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" />
                    <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => dinero(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ingreso" fill="#3d5a80" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Pagos" fill="#c9a24b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Gastos" fill="#9aa3b2" radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="Ganancia real" stroke="#149d80" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">La línea de ganancia se corta en semanas parciales (tarifas pendientes) para no mostrar números incompletos.</div>
            </Card>
          )}

          {!hayFiltroDetalle && completos.length > 1 && (
            <div className="mb-4 grid gap-2 text-xs sm:grid-cols-3">
              <Card className="p-3"><b className="text-brand-navy dark:text-slate-100">Ingreso</b><div>Mayor: {mayor('ingreso')?.p.inicio} ({dinero(mayor('ingreso')?.res.ingreso)})</div><div>Menor: {menor('ingreso')?.p.inicio} ({dinero(menor('ingreso')?.res.ingreso)})</div></Card>
              <Card className="p-3"><b className="text-brand-navy dark:text-slate-100">Cobro real</b><div>Mayor: {mayor('cobrado')?.p.inicio} ({dinero(mayor('cobrado')?.res.cobrado)})</div><div>Menor: {menor('cobrado')?.p.inicio} ({dinero(menor('cobrado')?.res.cobrado)})</div></Card>
              <Card className="p-3"><b className="text-brand-navy dark:text-slate-100">Utilidad</b><div>Mayor: {mayor('utilidad')?.p.inicio} ({dinero(mayor('utilidad')?.res.utilidad)})</div><div>Menor: {menor('utilidad')?.p.inicio} ({dinero(menor('utilidad')?.res.utilidad)})</div></Card>
            </div>
          )}

          {!hayFiltroDetalle && <GastosFijos lista={datos.gastosFijos} user={user} recargar={recargar} />}

          {paresOrdenados.map(({ x, ant }) => (
            <SemanaCard key={x.p.id} x={x} anterior={ant} user={user} recargar={recargar}
              hayFiltroDetalle={hayFiltroDetalle}
              gastos={datos.gastos.filter((g) => g.periodoId === x.p.id)}
              cobros={datos.cobros.filter((c) => c.periodoId === x.p.id)} />
          ))}
        </>
      )}
    </div>
  )
}

function Delta({ ahora, antes, formato }) {
  if (antes === null || antes === undefined || ahora === null || ahora === undefined) return null
  const d = Math.round((ahora - antes) * 100) / 100
  const p = antes !== 0 ? Math.round((d / Math.abs(antes)) * 1000) / 10 : null
  const color = d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose-500' : 'text-slate-400'
  return <span className={`ml-1 text-[10px] font-bold ${color}`}>{d >= 0 ? '+' : ''}{formato ? formato(d) : d}{p !== null ? ` (${p >= 0 ? '+' : ''}${p}%)` : ''}</span>
}

function SemanaCard({ x, anterior, user, recargar, hayFiltroDetalle, gastos, cobros }) {
  const { p, res, regs } = x
  const ant = anterior && !hayFiltroDetalle ? anterior.res : null
  const [nuevoGasto, setNuevoGasto] = useState({ concepto: '', importe: '' })
  const [nuevoCobro, setNuevoCobro] = useState({ fecha: '', importe: '' })
  const [guardando, setGuardando] = useState('')

  const agregarGasto = async () => {
    if (!nuevoGasto.concepto || !nuevoGasto.importe) return
    setGuardando('gasto')
    try {
      const id = `${p.id}__g_${hashContenido(nuevoGasto.concepto + Date.now())}`
      await setDoc(refDoc(COL.gastos, id), { periodoId: p.id, concepto: nuevoGasto.concepto, importe: Number(nuevoGasto.importe), creadoPor: user.email, creadoEn: new Date().toISOString() })
      await auditarStaff('gasto_agregado', `${p.id}: ${nuevoGasto.concepto} ${nuevoGasto.importe}`)
      setNuevoGasto({ concepto: '', importe: '' })
      recargar()
    } finally { setGuardando('') }
  }
  const quitarGasto = async (g) => {
    setGuardando('gasto')
    try {
      await escribirEnLotes([{ ref: refDoc(COL.gastos, g.id), borrar: true }])
      await auditarStaff('gasto_eliminado', `${p.id}: ${g.concepto} ${g.importe}`)
      recargar()
    } finally { setGuardando('') }
  }
  const agregarCobro = async () => {
    if (!nuevoCobro.importe) return
    setGuardando('cobro')
    try {
      const id = `${p.id}__c_${hashContenido((nuevoCobro.fecha || '') + nuevoCobro.importe + Date.now())}`
      await setDoc(refDoc(COL.cobros, id), { periodoId: p.id, fecha: nuevoCobro.fecha || null, importe: Number(nuevoCobro.importe), creadoPor: user.email, creadoEn: new Date().toISOString() })
      await auditarStaff('cobro_registrado', `${p.id}: ${dinero(Number(nuevoCobro.importe))} recibido de Gofo`)
      setNuevoCobro({ fecha: '', importe: '' })
      recargar()
    } finally { setGuardando('') }
  }

  // qué explica la diferencia vs semana anterior
  const explicacion = []
  if (ant && anterior) {
    const dHoras = Math.round((res.horas - ant.horas) * 100) / 100
    if (Math.abs(dHoras) > 0.01) explicacion.push(`${dHoras > 0 ? '+' : ''}${dHoras} horas`)
    const tarifaProm = (rr) => { const conT = rr.filter((r) => r.miTarifaReg); return conT.length ? conT.reduce((s, r) => s + r.miTarifaReg, 0) / conT.length : null }
    const tAhora = tarifaProm(regs), tAntes = tarifaProm(anterior.regs)
    if (tAhora && tAntes && Math.abs(tAhora - tAntes) > 0.01) explicacion.push(`tarifa media ${dinero(tAntes)} → ${dinero(tAhora)}`)
    const dGastos = Math.round((res.gastos - ant.gastos) * 100) / 100
    if (Math.abs(dGastos) > 0.01) explicacion.push(`gastos ${dGastos > 0 ? '+' : ''}${dinero(dGastos)}`)
    const dPers = res.trabajadores - ant.trabajadores
    if (dPers !== 0) explicacion.push(`${dPers > 0 ? '+' : ''}${dPers} personas`)
  }

  return (
    <Card className="mb-3 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{p.inicio} → {p.fin}</span>
        {res.parcial && <Badge color="red">PARCIAL: {res.pendientesTarifa} registros sin tarifa</Badge>}
        {!hayFiltroDetalle && (res.porCobrar <= 0.01
          ? <Badge color="green">cobrada</Badge>
          : <Badge color="gold">por cobrar {dinero(res.porCobrar)}</Badge>)}
        <span className="ml-auto text-xs text-slate-400">{res.trabajadores} personas · {res.horas} h</span>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Ingreso Gofo{res.ajustes ? ` (ajustes ${dinero(res.ajustes)})` : ''}</div><div className="text-base font-black text-brand-navy dark:text-slate-100">{dinero(res.ingreso)}<Delta ahora={res.ingreso} antes={ant?.ingreso} formato={dinero} /></div><div className="text-slate-400">cobrado {dinero(res.cobrado)}<Delta ahora={res.cobrado} antes={ant?.cobrado} formato={dinero} /> · por cobrar {dinero(res.porCobrar)}</div></div>
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Pagos calculados</div><div className="text-base font-black text-brand-navy dark:text-slate-100">{dinero(res.pagoCalc)}<Delta ahora={res.pagoCalc} antes={ant?.pagoCalc} formato={dinero} /></div><div className="text-slate-400">pagado real {dinero(res.pagado)} · por pagar {dinero(res.porPagar)}</div></div>
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Gastos</div><div className="text-base font-black text-brand-navy dark:text-slate-100">{dinero(res.gastos)}<Delta ahora={res.gastos} antes={ant?.gastos} formato={dinero} /></div></div>
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Margen antes de gastos</div><div className="text-base font-black text-brand-navy dark:text-slate-100">{res.parcial ? 'pendiente' : dinero(res.margen)}</div></div>
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Utilidad operativa</div><div className={`text-base font-black ${res.utilidad >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{res.parcial ? 'pendiente' : dinero(res.utilidad)}{!res.parcial && <Delta ahora={res.utilidad} antes={ant?.utilidad} formato={dinero} />}</div><div className="text-slate-400">{res.parcial ? 'faltan tarifas' : pct(res.pctUtilidad)}</div></div>
      </div>
      {explicacion.length > 0 && <div className="mt-2 text-[11px] text-slate-500">Qué cambió vs la semana anterior: {explicacion.join(' · ')}</div>}

      {!hayFiltroDetalle && (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs md:grid-cols-2 dark:border-slate-800">
          <div>
            <div className="mb-1 font-bold text-slate-500">Gastos del período (supervisión, admin, seguros, cargas de nómina…)</div>
            {gastos.map((g) => <div key={g.id} className="flex items-center gap-2"><span>{g.concepto}</span><b>{dinero(g.importe)}</b><button className="text-rose-400 hover:text-rose-600" onClick={() => quitarGasto(g)} title="Eliminar"><Trash2 size={12} /></button></div>)}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input className="w-44" placeholder="Concepto" value={nuevoGasto.concepto} onChange={(e) => setNuevoGasto({ ...nuevoGasto, concepto: e.target.value })} />
              <Input className="w-28" type="number" step="0.01" placeholder="$" value={nuevoGasto.importe} onChange={(e) => setNuevoGasto({ ...nuevoGasto, importe: e.target.value })} />
              <Boton variant="ghost" disabled={guardando === 'gasto'} onClick={agregarGasto}><Plus size={13} /> Gasto</Boton>
            </div>
          </div>
          <div>
            <div className="mb-1 font-bold text-slate-500">Dinero recibido de Gofo (flujo de caja, separado de lo reconocido)</div>
            {cobros.map((c) => <div key={c.id} className="flex items-center gap-2"><span>{c.fecha || 'sin fecha'}</span><b>{dinero(c.importe)}</b></div>)}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input className="w-36" type="date" value={nuevoCobro.fecha} onChange={(e) => setNuevoCobro({ ...nuevoCobro, fecha: e.target.value })} />
              <Input className="w-28" type="number" step="0.01" placeholder="$" value={nuevoCobro.importe} onChange={(e) => setNuevoCobro({ ...nuevoCobro, importe: e.target.value })} />
              <Boton variant="ghost" disabled={guardando === 'cobro'} onClick={agregarCobro}><Plus size={13} /> Cobro</Boton>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}


// Gastos FIJOS: se aplican automáticamente a cada semana (etiquetados "fijo")
// desde su fecha de vigencia. Ejemplos: supervisión, administración, seguros,
// cargas de nómina. Nada se descuenta dos veces: los gastos del período son
// aparte y se capturan en cada tarjeta semanal.
function GastosFijos({ lista, user, recargar }) {
  const [nuevo, setNuevo] = useState({ concepto: '', importe: '', desde: '' })
  const [guardando, setGuardando] = useState(false)
  const guardarLista = async (nueva, accion, detalle) => {
    setGuardando(true)
    try {
      await setDoc(refDoc(COL.config, 'gastosFijos'), { lista: nueva, actualizadoPor: user.email, actualizadoEn: new Date().toISOString() }, { merge: true })
      await auditarStaff(accion, detalle)
      recargar()
    } finally { setGuardando(false) }
  }
  const agregar = () => {
    if (!nuevo.concepto.trim() || !Number(nuevo.importe)) return
    const item = { concepto: nuevo.concepto.trim(), importe: Number(nuevo.importe), desde: nuevo.desde || new Date().toISOString().slice(0, 10), activo: true }
    guardarLista([...(lista || []), item], 'gasto_fijo_agregado', `${item.concepto}: ${dinero(item.importe)}/semana desde ${item.desde}`)
    setNuevo({ concepto: '', importe: '', desde: '' })
  }
  const alternar = (i) => {
    const nueva = lista.map((g, j) => (j === i ? { ...g, activo: g.activo === false } : g))
    guardarLista(nueva, 'gasto_fijo_alternado', `${lista[i].concepto} → ${lista[i].activo === false ? 'activo' : 'pausado'}`)
  }
  const quitar = (i) => {
    guardarLista(lista.filter((_, j) => j !== i), 'gasto_fijo_eliminado', lista[i].concepto)
  }
  // edición en línea: concepto, importe y fecha "desde" (sin borrar y recrear)
  const [editando, setEditando] = useState(null)
  const [edit, setEdit] = useState({ concepto: '', importe: '', desde: '' })
  const empezarEditar = (i) => { setEditando(i); setEdit({ concepto: lista[i].concepto, importe: lista[i].importe, desde: lista[i].desde || '' }) }
  const guardarEdicion = () => {
    const i = editando
    const nueva = lista.map((g, j) => (j === i ? { ...g, concepto: edit.concepto.trim() || g.concepto, importe: Number(edit.importe) > 0 ? Number(edit.importe) : g.importe, desde: edit.desde || g.desde } : g))
    guardarLista(nueva, 'gasto_fijo_editado', `${nueva[i].concepto}: ${dinero(nueva[i].importe)}/semana desde ${nueva[i].desde}`)
    setEditando(null)
  }
  const totalActivo = (lista || []).filter((g) => g.activo !== false).reduce((s, g) => s + (Number(g.importe) || 0), 0)
  return (
    <Card className="mb-3 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100">
        Gastos fijos semanales
        <span className="text-xs font-normal text-slate-400">se descuentan solos en cada semana · activos: {dinero(totalActivo)}/semana</span>
      </div>
      {(lista || []).map((g, i) => (
        editando === i ? (
          <div key={i} className="flex flex-wrap items-center gap-2 py-1 text-xs">
            <Input className="w-44" value={edit.concepto} onChange={(e) => setEdit({ ...edit, concepto: e.target.value })} />
            <Input className="w-24" type="number" step="0.01" value={edit.importe} onChange={(e) => setEdit({ ...edit, importe: e.target.value })} />
            <Input className="w-36" type="date" value={edit.desde} onChange={(e) => setEdit({ ...edit, desde: e.target.value })} />
            <button className="font-semibold text-emerald-600 hover:text-emerald-700" disabled={guardando} onClick={guardarEdicion}>guardar</button>
            <button className="text-slate-400 hover:text-brand-navy dark:hover:text-white" onClick={() => setEditando(null)}>cancelar</button>
          </div>
        ) : (
        <div key={i} className="flex flex-wrap items-center gap-2 py-1 text-xs">
          <span className={g.activo === false ? 'text-slate-400 line-through' : ''}>{g.concepto}</span>
          <b className={g.activo === false ? 'text-slate-400 line-through' : ''}>{dinero(g.importe)}</b>
          <span className="text-slate-400">desde {g.desde}</span>
          <button className="text-slate-400 hover:text-brand-navy dark:hover:text-white" onClick={() => empezarEditar(i)}>editar</button>
          <button className="text-slate-400 hover:text-brand-navy dark:hover:text-white" onClick={() => alternar(i)}>{g.activo === false ? 'reactivar' : 'pausar'}</button>
          <button className="text-rose-400 hover:text-rose-600" onClick={() => quitar(i)}>quitar</button>
        </div>
        )
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="Concepto (supervisión, seguro…)" value={nuevo.concepto} onChange={(e) => setNuevo({ ...nuevo, concepto: e.target.value })} />
        <Input className="w-28" type="number" step="0.01" placeholder="$/semana" value={nuevo.importe} onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })} />
        <Input className="w-40" type="date" value={nuevo.desde} onChange={(e) => setNuevo({ ...nuevo, desde: e.target.value })} />
        <Boton variant="ghost" disabled={guardando} onClick={agregar}><Plus size={13} /> Gasto fijo</Boton>
      </div>
    </Card>
  )
}
