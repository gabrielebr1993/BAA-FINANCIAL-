// Proyección de precios de Gofo (menú "Proyección"). SOLO simulación/lectura: no
// cambia ningún precio, tarifa ni dato real. Elige ciudad (o "Todas") → factura →
// edita precios (por %, por rango de peso o por celda) → "Generar proyección" →
// resumen con KPIs, gráficas y recomendaciones. La ganancia real usa las tarifas
// reales de los choferes (fijas: el pago no cambia cuando Gofo cambia sus precios).
import { useState, useMemo, useEffect } from 'react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, rutasConGanancia } from '../utils/calc'
import { construirBase, proyectar } from '../utils/simulador'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { nombreCiudad } from '../constants'
import { Card, KPI, Boton, Select, Input, Aviso, EstadoVacio, PageTitle } from '../components/ui'
import { ComparativoCard, ImpactoCard, GaugeCard } from '../components/charts'
import { SlidersHorizontal, RotateCcw, TrendingUp, DollarSign, Building2, Target, Receipt, Globe, FileSpreadsheet, FileText, Zap, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

const TODAS_SIM = '__todas__'
const MENSUAL = 4.3 // semanas por mes (aprox) para el estimado mensual
const fFecha = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '')
const bePctTxt = (p) => `−${Math.abs(Math.round((p || 0) * 1000) / 10)}%`

// Recomendaciones automáticas a partir del resumen y las filas (rutas o ciudades).
function recomendar(r, filas, esTodas) {
  const recs = []
  const dif = r.gananciaProy - r.gananciaBase
  const mensual = dif * MENSUAL
  const uni = esTodas ? 'ciudad(es)' : 'ruta(s)'
  if (r.gananciaProy < 0) recs.push({ nivel: 'critico', texto: `Con estos precios, ${r.label} quedaría en PÉRDIDA (${money(r.gananciaProy)}). No es sostenible.` })
  else if (r.margenProy < 0.05) recs.push({ nivel: 'aviso', texto: `El margen de ${r.label} bajaría a ${pct(r.margenProy)} (menos de 5%). Queda muy justo.` })
  else recs.push({ nivel: 'ok', texto: `${r.label} seguiría en positivo: ${money(r.gananciaProy)} de ganancia (margen ${pct(r.margenProy)}).` })
  if (dif < -0.01) recs.push({ nivel: 'aviso', texto: `Dejarías de ganar ${money(Math.abs(dif))} por semana ≈ ${money(Math.abs(mensual))} al mes.` })
  else if (dif > 0.01) recs.push({ nivel: 'ok', texto: `Ganarías ${money(dif)} más por semana ≈ ${money(mensual)} al mes.` })
  const perd = filas.filter((f) => f.gananciaProy < 0)
  if (perd.length) recs.push({ nivel: 'critico', texto: `${perd.length} ${uni} quedarían en pérdida: ${perd.slice(0, 4).map((f) => f.name).join(', ')}${perd.length > 4 ? '…' : ''}.` })
  const bajo = filas.filter((f) => f.gananciaProy >= 0 && f.ingresoProy > 0 && f.gananciaProy / f.ingresoProy < 0.05)
  if (bajo.length) recs.push({ nivel: 'aviso', texto: `${bajo.length} ${uni} con margen bajo (<5%): ${bajo.slice(0, 4).map((f) => f.name).join(', ')}${bajo.length > 4 ? '…' : ''}.` })
  if (filas.length > 1) {
    const peor = [...filas].sort((a, b) => (a.gananciaProy - a.gananciaBase) - (b.gananciaProy - b.gananciaBase))[0]
    const d = peor.gananciaProy - peor.gananciaBase
    if (d < -0.01) recs.push({ nivel: 'aviso', texto: `La más golpeada sería ${peor.name}: ${money(d)} de ganancia.` })
  }
  recs.push({ nivel: r.bePct > -0.05 ? 'critico' : 'ok', texto: `Margen para negociar: Gofo puede bajar hasta ${Math.abs(Math.round(r.bePct * 1000) / 10)}% (sobre primeras entregas) antes de que ${r.label} pierda.` })
  return recs
}

const NIVEL_UI = {
  critico: { Icon: AlertTriangle, cls: 'border-l-rose-500 bg-rose-50/60 dark:bg-rose-500/5', ico: 'text-rose-500' },
  aviso: { Icon: Info, cls: 'border-l-amber-400 bg-amber-50/60 dark:bg-amber-500/5', ico: 'text-amber-500' },
  ok: { Icon: CheckCircle2, cls: 'border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5', ico: 'text-emerald-500' },
}

export default function Simulador() {
  const { invoices, drivers, ciudadesEmpresa } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const esDueno = esSuperAdmin || perfil?.role === 'owner'

  const [ciudadSim, setCiudadSim] = useState('')
  const [facturaSimId, setFacturaSimId] = useState('')
  const [pctGlobal, setPctGlobal] = useState(0)
  const [pesoFijo, setPesoFijo] = useState({})
  const [celda, setCelda] = useState({})
  const [generado, setGenerado] = useState(false)

  const nombreDeCiudad = (code) => (ciudadesEmpresa || []).find((c) => c.codigo === code)?.nombre || nombreCiudad(code)

  const ciudades = useMemo(() => {
    const set = new Map()
    for (const i of invoices || []) {
      const codes = new Set([...(i.resumenRutas || []).map((r) => r.ciudad), i.ciudad].filter(Boolean))
      for (const c of codes) if (!set.has(c)) set.set(c, nombreDeCiudad(c))
    }
    return [...set.entries()].map(([codigo, nombre]) => ({ codigo, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, ciudadesEmpresa])

  const esTodas = ciudadSim === TODAS_SIM
  const facturasDe = (codigo) => (invoices || [])
    .filter((i) => (i.resumenRutas || []).some((r) => r.ciudad === codigo) || i.ciudad === codigo)
    .sort((a, b) => (b.fechaInicio?.getTime?.() || 0) - (a.fechaInicio?.getTime?.() || 0))
  const facturasCiudad = useMemo(() => (esTodas ? [] : facturasDe(ciudadSim)), [invoices, ciudadSim, esTodas]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!ciudadSim && ciudades.length) setCiudadSim(ciudades[0].codigo) }, [ciudades, ciudadSim])
  useEffect(() => {
    if (esTodas) return
    if (facturasCiudad.length && !facturasCiudad.some((f) => f.id === facturaSimId)) setFacturaSimId(facturasCiudad[0].id)
    if (!facturasCiudad.length) setFacturaSimId('')
  }, [facturasCiudad, facturaSimId, esTodas])

  // Al cambiar CUALQUIER entrada, se oculta el resumen para regenerarlo con lo nuevo.
  const pesoKey = JSON.stringify(pesoFijo)
  const celdaKey = JSON.stringify(celda)
  useEffect(() => { setGenerado(false) }, [pctGlobal, pesoKey, celdaKey, ciudadSim, facturaSimId])

  const costoDe = (inv, ciudad, base) => {
    const rg = rutasConGanancia(inv, drivers, ciudad)
    const raw = {}; let tot = 0
    for (const r of rg) { raw[r.ruta] = r.costoChoferes || 0; tot += r.costoChoferes || 0 }
    const pago = calcularPagos(inv, [], drivers, ciudad).reduce((a, p) => a + (p.totalPagar || 0), 0)
    const factor = tot > 0 ? pago / tot : 0
    const out = {}
    for (const k in raw) out[k] = raw[k] * factor
    if (tot === 0 && base?.rutas?.length && pago > 0) for (const r of base.rutas) out[r.ruta] = pago / base.rutas.length
    return out
  }

  const invSel = useMemo(() => (invoices || []).find((i) => i.id === facturaSimId) || null, [invoices, facturaSimId])
  const base = useMemo(() => (!esTodas && invSel && ciudadSim ? construirBase(invSel, ciudadSim) : { rutas: [], rangos: [], tieneDetalle: false }), [invSel, ciudadSim, esTodas])
  const costoPorRuta = useMemo(() => (invSel && !esTodas ? costoDe(invSel, ciudadSim, base) : {}), [invSel, ciudadSim, esTodas, base]) // eslint-disable-line react-hooks/exhaustive-deps
  const ov = useMemo(() => ({ pct: pctGlobal, peso: pesoFijo, celda }), [pctGlobal, pesoFijo, celda])
  const proj = useMemo(() => proyectar(base, ov, costoPorRuta), [base, ov, costoPorRuta])

  const proyTodas = useMemo(() => {
    if (!esTodas) return []
    return ciudades.map((c) => {
      const inv = facturasDe(c.codigo)[0]
      if (!inv) return null
      const b = construirBase(inv, c.codigo)
      if (!b.rutas.length) return null
      const p = proyectar(b, { pct: pctGlobal }, costoDe(inv, c.codigo, b))
      return { codigo: c.codigo, nombre: c.nombre, semana: inv.semana, tieneDetalle: b.tieneDetalle, ...p }
    }).filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esTodas, ciudades, pctGlobal, invoices, drivers])

  const totTodas = useMemo(() => {
    const s = { ingresoBase: 0, ingresoProy: 0, gananciaBase: 0, gananciaProy: 0, pagoCiudad: 0, ingresoIndTotal: 0, ingresoDoblesTotal: 0 }
    for (const c of proyTodas) { s.ingresoBase += c.ingresoBase; s.ingresoProy += c.ingresoProy; s.gananciaBase += c.gananciaBase; s.gananciaProy += c.gananciaProy; s.pagoCiudad += c.pagoCiudad; s.ingresoIndTotal += c.ingresoIndTotal; s.ingresoDoblesTotal += c.ingresoDoblesTotal }
    const r2 = (n) => Math.round(n * 100) / 100
    return { ...s, ingresoBase: r2(s.ingresoBase), ingresoProy: r2(s.ingresoProy), gananciaBase: r2(s.gananciaBase), gananciaProy: r2(s.gananciaProy), margenBase: s.ingresoBase > 0 ? s.gananciaBase / s.ingresoBase : 0, margenProy: s.ingresoProy > 0 ? s.gananciaProy / s.ingresoProy : 0, bePctGlobal: s.ingresoIndTotal > 0 ? (s.pagoCiudad - s.ingresoDoblesTotal) / s.ingresoIndTotal - 1 : 0 }
  }, [proyTodas])

  const resetear = () => { setPctGlobal(0); setPesoFijo({}); setCelda({}) }
  const hayCambios = pctGlobal !== 0 || Object.values(pesoFijo).some((v) => v !== '' && v != null) || Object.values(celda).some((v) => v !== '' && v != null)
  const pctTxt = `${pctGlobal > 0 ? '+' : ''}${Math.round(pctGlobal * 100)}%`
  const hayResultado = esTodas ? proyTodas.length > 0 : base.rutas.length > 0

  // Resumen unificado + filas (rutas o ciudades) para gráficas/recomendaciones.
  const resumen = esTodas
    ? { label: 'el negocio', ingresoBase: totTodas.ingresoBase, ingresoProy: totTodas.ingresoProy, gananciaBase: totTodas.gananciaBase, gananciaProy: totTodas.gananciaProy, margenBase: totTodas.margenBase, margenProy: totTodas.margenProy, bePct: totTodas.bePctGlobal }
    : { label: nombreDeCiudad(ciudadSim), ingresoBase: proj.ingresoBase, ingresoProy: proj.ingresoProy, gananciaBase: proj.gananciaBase, gananciaProy: proj.gananciaProy, margenBase: proj.margenBase, margenProy: proj.margenProy, bePct: proj.bePctCiudad }
  const filas = esTodas
    ? proyTodas.map((c) => ({ name: c.nombre, gananciaBase: c.gananciaBase, gananciaProy: c.gananciaProy, ingresoProy: c.ingresoProy }))
    : proj.rutas.map((r) => ({ name: r.ruta, gananciaBase: r.gananciaBase, gananciaProy: r.gananciaProy, ingresoProy: r.ingresoProy }))
  const difIngreso = resumen.ingresoProy - resumen.ingresoBase
  const difGanancia = resumen.gananciaProy - resumen.gananciaBase
  const recs = generado ? recomendar(resumen, filas, esTodas) : []
  const comparativo = [
    { name: 'Ingreso', Actual: Math.round(resumen.ingresoBase), Proyectado: Math.round(resumen.ingresoProy) },
    { name: 'Ganancia', Actual: Math.round(resumen.gananciaBase), Proyectado: Math.round(resumen.gananciaProy) },
  ]
  const impacto = [...filas].map((f) => ({ name: f.name, valor: Math.round(f.gananciaProy - f.gananciaBase) })).sort((a, b) => a.valor - b.valor).slice(0, 12)

  if (!esDueno) return <div><PageTitle>Proyección</PageTitle><Aviso tipo="warn">La proyección está disponible solo para el dueño.</Aviso></div>
  if (!ciudades.length) return <div><PageTitle>Proyección</PageTitle><EstadoVacio titulo="Sin facturas" texto="Carga una factura para poder simular precios." mostrarBoton={false} /></div>

  const colorCelda = (proyec, actual) => (proyec < actual - 0.001 ? 'text-rose-600 border-rose-300 dark:text-rose-400' : proyec > actual + 0.001 ? 'text-emerald-600 border-emerald-300 dark:text-emerald-400' : 'text-slate-600 border-slate-200 dark:text-slate-300')

  return (
    <div>
      <PageTitle>Proyección</PageTitle>
      <Aviso tipo="info" className="mb-4">
        <b>Simulador de precios.</b> Proyecta qué pasa con tu ingreso y tu ganancia si Gofo cambia sus precios. Es
        <b> solo simulación</b>: no cambia ningún precio, tarifa ni dato real. El pago a los choferes es fijo (depende de sus tarifas, no de Gofo).
      </Aviso>

      {/* Selectores */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Building2 size={13} /> Ciudad</div>
            <Select value={ciudadSim} onChange={(e) => { setCiudadSim(e.target.value); resetear() }} className="min-w-[190px]">
              <option value={TODAS_SIM}>🌎 Todas las ciudades</option>
              {ciudades.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
            </Select>
          </div>
          {!esTodas && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Receipt size={13} /> Factura</div>
              <Select value={facturaSimId} onChange={(e) => { setFacturaSimId(e.target.value); resetear() }} className="min-w-[220px]">
                {facturasCiudad.map((f) => <option key={f.id} value={f.id}>{f.semana || `${fFecha(f.fechaInicio)}–${fFecha(f.fechaFin)}`}</option>)}
              </Select>
            </div>
          )}
          <span className="text-xs text-slate-400">{esTodas ? `${proyTodas.length} ciudad(es) · factura más reciente de cada una` : `${base.rutas.length} ruta(s) en ${nombreDeCiudad(ciudadSim)}`}</span>
          {hayResultado && (
            <div className="ml-auto flex gap-2">
              <Boton variant="ghost" onClick={() => exportar('excel')} className="px-3 py-1.5 text-xs"><FileSpreadsheet size={15} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={() => exportar('pdf')} className="px-3 py-1.5 text-xs"><FileText size={15} strokeWidth={1.8} /> PDF</Boton>
            </div>
          )}
        </div>
      </Card>

      {!hayResultado ? (
        <EstadoVacio titulo="Sin rutas" texto="No hay rutas para simular con esta selección." mostrarBoton={false} />
      ) : (
        <>
          {/* Base actual */}
          <div className="mb-4 flex flex-wrap gap-3">
            <KPI label="Ingreso Gofo (actual)" value={money(resumen.ingresoBase)} icon={DollarSign} accent="green" />
            <KPI label="Pago a choferes (fijo)" value={money(esTodas ? totTodas.pagoCiudad : proj.pagoCiudad)} icon={Receipt} accent="navy" sub="no cambia con los precios" />
            <KPI label="Ganancia actual" value={money(resumen.gananciaBase)} icon={TrendingUp} accent="gold" sub={`margen ${pct(resumen.margenBase)}`} />
          </div>

          {/* Punto de equilibrio */}
          <Card className={`mb-4 flex items-start gap-3 p-4 ${resumen.bePct > -0.05 ? 'border-l-4 border-l-rose-500' : ''}`}>
            <Target size={20} strokeWidth={1.8} className={resumen.bePct > -0.05 ? 'text-rose-500' : 'text-amber-500'} />
            <div>
              <div className="font-semibold text-brand-navy dark:text-slate-100">Punto de equilibrio de {resumen.label}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Si Gofo baja sus precios <b>más de {Math.abs(Math.round(resumen.bePct * 1000) / 10)}%</b> (sobre las primeras entregas), la ganancia llega a <b>$0</b>. Ese es tu margen para negociar.</div>
            </div>
          </Card>

          {/* Ajuste masivo */}
          <Card className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal size={17} strokeWidth={1.9} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ajuste de precios</h3>
              {hayCambios && <Boton variant="ghost" onClick={resetear} className="ml-auto px-2.5 py-1 text-xs"><RotateCcw size={13} strokeWidth={2} /> Reiniciar</Boton>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Cambiar todos los precios:</span>
              <input type="range" min={-0.30} max={0.10} step={0.01} value={pctGlobal} onChange={(e) => setPctGlobal(Number(e.target.value))} className="w-56 accent-brand-navy" />
              <span className={`w-16 text-center text-sm font-bold ${pctGlobal < 0 ? 'text-rose-600' : pctGlobal > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{pctTxt}</span>
              <div className="flex gap-1">
                {[-0.05, -0.10, -0.15].map((v) => (
                  <button key={v} onClick={() => setPctGlobal(v)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${pctGlobal === v ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300'}`}>{Math.round(v * 100)}%</button>
                ))}
                <button onClick={() => setPctGlobal(0)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300">0%</button>
              </div>
            </div>
            {!esTodas && base.tieneDetalle && (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
                <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Fijar precio por rango de peso (todas las rutas):</div>
                <div className="flex flex-wrap gap-2">
                  {base.rangos.map((rg) => (
                    <div key={rg} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
                      <span className="text-xs font-medium text-slate-500">{rg}</span>
                      <Input type="number" step="0.01" min="0" className="w-20" placeholder="$" value={pesoFijo[rg] ?? ''} onChange={(e) => setPesoFijo((s) => ({ ...s, [rg]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Prioridad: precio de una celda &gt; precio fijo por peso &gt; % global &gt; precio actual.</p>
              </div>
            )}
            {esTodas && <p className="mt-2 text-[11px] text-slate-400">En "Todas las ciudades" se aplica el % global a la factura más reciente de cada ciudad. Para editar precios por ruta o por peso, elige una ciudad.</p>}
          </Card>

          {/* Tabla editable (una ciudad) o resumen por ciudad (todas) */}
          {!esTodas ? (
            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Precios por ruta</h3>
              <p className="mb-3 text-xs text-slate-400">
                El <b>precio actual</b> (grande) es el dato real de la factura. Escribe abajo el <b>precio nuevo</b>. <span className="text-rose-600">Rojo</span> = Gofo baja · <span className="text-emerald-600">verde</span> = sube.
                {!base.tieneDetalle && ' Esta factura no trae desglose por peso; se usa el precio promedio por ruta.'}
              </p>
              <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-2.5 py-2.5 text-left font-semibold">Ruta</th>
                      {base.rangos.map((rg) => <th key={rg} className="px-2 py-2.5 text-center font-semibold">{rg === '(promedio)' ? 'Precio/paq' : rg}</th>)}
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Δ Gan.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proj.rutas.map((r) => {
                      const dG = r.gananciaProy - r.gananciaBase
                      return (
                        <tr key={r.ruta} className={`border-t border-slate-100 dark:border-slate-700/50 ${r.gananciaProy < 0 ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}`}>
                          <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{r.ruta}</td>
                          {base.rangos.map((rg) => {
                            const c = r.celdas[rg]
                            if (!c) return <td key={rg} className="px-2 py-2 text-center text-slate-300">—</td>
                            const k = `${r.ruta}||${rg}`
                            const val = celda[k]
                            const proyec = (val != null && val !== '' && isFinite(Number(val))) ? Number(val)
                              : (base.tieneDetalle && pesoFijo[rg] != null && pesoFijo[rg] !== '' ? Number(pesoFijo[rg]) : c.precio * (1 + pctGlobal))
                            return (
                              <td key={rg} className="px-2 py-1.5 text-center">
                                <div className="text-[15px] font-bold text-brand-navy dark:text-slate-100">{money(c.precio)}</div>
                                <div className="mb-1 text-[10px] text-slate-400">{num(c.cantidad)} paq</div>
                                <input type="number" step="0.01" min="0" value={val ?? ''} placeholder={proyec.toFixed(2)} onChange={(e) => setCelda((s) => ({ ...s, [k]: e.target.value }))} className={`w-16 rounded-md border bg-transparent px-1 py-0.5 text-center text-[13px] outline-none focus:border-brand-gold ${colorCelda(proyec, c.precio)}`} />
                              </td>
                            )
                          })}
                          <td className="px-2.5 py-2 text-right">{money(r.ingresoProy)}</td>
                          <td className={`px-2.5 py-2 text-right font-semibold ${r.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-200'}`}>{money(r.gananciaProy)}</td>
                          <td className={`px-2.5 py-2 text-right font-semibold ${dG < -0.01 ? 'text-rose-600' : dG > 0.01 ? 'text-emerald-600' : 'text-slate-400'}`}>{dG >= 0 ? '+' : ''}{money(dG)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="mb-4 p-4">
              <div className="mb-1 flex items-center gap-2"><Globe size={17} strokeWidth={1.8} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Impacto por ciudad ({pctTxt})</h3></div>
              <p className="mb-3 text-xs text-slate-400">Cada ciudad con su factura más reciente. El % global se aplica a todas.</p>
              <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-2.5 py-2.5 text-left font-semibold">Ciudad</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso actual</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia actual</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Δ Gan.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proyTodas.map((c) => {
                      const dG = c.gananciaProy - c.gananciaBase
                      return (
                        <tr key={c.codigo} className={`border-t border-slate-100 dark:border-slate-700/50 ${c.gananciaProy < 0 ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}`}>
                          <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{c.nombre} {!c.tieneDetalle && <span className="text-[10px] text-slate-400">(nivel ruta)</span>}</td>
                          <td className="px-2.5 py-2 text-right">{money(c.ingresoBase)}</td>
                          <td className="px-2.5 py-2 text-right">{money(c.ingresoProy)}</td>
                          <td className="px-2.5 py-2 text-right">{money(c.gananciaBase)}</td>
                          <td className={`px-2.5 py-2 text-right font-semibold ${c.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-200'}`}>{money(c.gananciaProy)}</td>
                          <td className={`px-2.5 py-2 text-right font-semibold ${dG < -0.01 ? 'text-rose-600' : dG > 0.01 ? 'text-emerald-600' : 'text-slate-400'}`}>{dG >= 0 ? '+' : ''}{money(dG)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Botón GENERAR */}
          {!generado && (
            <div className="mb-4 flex justify-center">
              <button onClick={() => setGenerado(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-6 py-3 text-base font-bold text-white shadow-sm transition hover:brightness-110 dark:bg-brand-gold dark:text-brand-navy">
                <Zap size={20} strokeWidth={2} /> Generar proyección
              </button>
            </div>
          )}

          {/* RESUMEN generado: KPIs + gráficas + recomendaciones */}
          {generado && (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Card className={`p-4 ${difIngreso < 0 ? 'border-l-4 border-l-rose-500' : difIngreso > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
                  <div className="text-xs text-slate-400">Ingreso Gofo · actual → proyectado</div>
                  <div className="text-lg font-bold text-brand-navy dark:text-slate-100">{money(resumen.ingresoBase)} → {money(resumen.ingresoProy)}</div>
                  <div className={`text-sm font-semibold ${difIngreso < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{difIngreso >= 0 ? '+' : ''}{money(difIngreso)}/sem</div>
                </Card>
                <Card className={`p-4 ${difGanancia < 0 ? 'border-l-4 border-l-rose-500' : difGanancia > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
                  <div className="text-xs text-slate-400">Ganancia real · actual → proyectada</div>
                  <div className={`text-lg font-bold ${resumen.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-100'}`}>{money(resumen.gananciaBase)} → {money(resumen.gananciaProy)}</div>
                  <div className={`text-sm font-semibold ${difGanancia < 0 ? 'text-rose-600' : difGanancia > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{difGanancia < -0.01 ? `Dejarías de ganar ${money(Math.abs(difGanancia))}` : difGanancia > 0.01 ? `Ganarías ${money(difGanancia)}` : 'Sin cambio'}/sem</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-slate-400">Estimado mensual (~{MENSUAL} sem)</div>
                  <div className={`text-lg font-bold ${difGanancia < 0 ? 'text-rose-600' : difGanancia > 0 ? 'text-emerald-600' : 'text-brand-navy dark:text-slate-100'}`}>{difGanancia >= 0 ? '+' : ''}{money(difGanancia * MENSUAL)}</div>
                  <div className="text-sm text-slate-400">margen {pct(resumen.margenBase)} → {pct(resumen.margenProy)}</div>
                </Card>
              </div>

              <div className="mb-4 grid gap-4 lg:grid-cols-2">
                <ComparativoCard title="Ingreso y ganancia · Actual vs Proyectado" data={comparativo} fmt={(v) => money(v)} />
                <ImpactoCard title="Impacto por ruta/ciudad (Δ ganancia)" subtitle="Rojo = cae · verde = sube" data={impacto} fmt={(v) => money(v)} />
              </div>

              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <GaugeCard title="Margen actual" value={Math.max(0, resumen.margenBase)} color="#13233f" />
                <GaugeCard title="Margen proyectado" value={Math.max(0, resumen.margenProy)} color={resumen.margenProy < 0.05 ? '#e11d48' : '#c9a24b'} />
              </div>

              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2"><Zap size={17} strokeWidth={1.9} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Recomendaciones</h3></div>
                <div className="space-y-2">
                  {recs.map((rec, i) => {
                    const u = NIVEL_UI[rec.nivel]
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 ${u.cls}`}>
                        <u.Icon size={16} strokeWidth={1.9} className={`mt-0.5 flex-shrink-0 ${u.ico}`} />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{rec.texto}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )

  // Exportaciones (definidas aquí abajo para cerrar sobre el estado actual).
  function exportar(tipo) {
    if (esTodas) {
      const filasX = proyTodas.map((c) => ({ Ciudad: c.nombre, Semana: c.semana || '', 'Ingreso actual': Math.round(c.ingresoBase), 'Ingreso proyectado': Math.round(c.ingresoProy), 'Ganancia actual': Math.round(c.gananciaBase), 'Ganancia proyectada': Math.round(c.gananciaProy), 'Δ Ganancia': Math.round(c.gananciaProy - c.gananciaBase), Equilibrio: bePctTxt(c.bePctCiudad) }))
      const nombre = `proyeccion_todas_${pctTxt.replace('%', 'pct')}`
      if (tipo === 'excel') return exportarExcel(nombre, [{ nombre: 'Todas las ciudades', rows: filasX }])
      return exportarPDF(nombre, `Proyección · Todas las ciudades (${pctTxt})`, '', [{ titulo: 'Proyección por ciudad', head: ['Ciudad', 'Semana', 'Ing. actual', 'Ing. proy.', 'Gan. actual', 'Gan. proy.', 'Δ Ganancia', 'Equilibrio'], body: proyTodas.map((c) => [c.nombre, c.semana || '', money(c.ingresoBase), money(c.ingresoProy), money(c.gananciaBase), money(c.gananciaProy), money(c.gananciaProy - c.gananciaBase), bePctTxt(c.bePctCiudad)]) }])
    }
    const filasX = proj.rutas.map((r) => ({ Ruta: r.ruta, 'Ingreso actual': Math.round(r.ingresoBase), 'Ingreso proyectado': Math.round(r.ingresoProy), 'Ganancia actual': Math.round(r.gananciaBase), 'Ganancia proyectada': Math.round(r.gananciaProy), 'Δ Ganancia': Math.round(r.gananciaProy - r.gananciaBase), Equilibrio: bePctTxt(r.bePct) }))
    const nombre = `proyeccion_${nombreDeCiudad(ciudadSim)}_${pctTxt.replace('%', 'pct')}`.replace(/[^\w-]+/g, '_')
    if (tipo === 'excel') return exportarExcel(nombre, [{ nombre: 'Rutas', rows: filasX }])
    return exportarPDF(nombre, `Proyección · ${nombreDeCiudad(ciudadSim)} (${pctTxt})`, invSel?.semana || '', [{ titulo: 'Proyección por ruta', head: ['Ruta', 'Ing. actual', 'Ing. proy.', 'Gan. actual', 'Gan. proy.', 'Δ Ganancia', 'Equilibrio'], body: proj.rutas.map((r) => [r.ruta, money(r.ingresoBase), money(r.ingresoProy), money(r.gananciaBase), money(r.gananciaProy), money(r.gananciaProy - r.gananciaBase), bePctTxt(r.bePct)]) }])
  }
}
