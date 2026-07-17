// Simulador de precios de Gofo (dentro de Rutas). SOLO proyección/lectura: no cambia
// ningún precio, tarifa ni dato real. Elige ciudad → factura → edita precios (por %,
// por rango de peso o por celda) y ve el impacto en ingreso, ganancia y margen, más
// el punto de equilibrio (hasta dónde puede bajar Gofo antes de perder).
import { useState, useMemo, useEffect } from 'react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, rutasConGanancia } from '../utils/calc'
import { construirBase, proyectar } from '../utils/simulador'
import { money, num, pct } from '../utils/format'
import { nombreCiudad } from '../constants'
import { Card, KPI, Boton, Select, Input, Aviso, EstadoVacio } from '../components/ui'
import { SlidersHorizontal, RotateCcw, TrendingUp, TrendingDown, DollarSign, Building2, Target, Receipt } from 'lucide-react'

const fFecha = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '')

export default function Simulador() {
  const { invoices, drivers, ciudadesEmpresa, activeCompanyId } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const esDueno = esSuperAdmin || perfil?.role === 'owner'

  const [ciudadSim, setCiudadSim] = useState('')
  const [facturaSimId, setFacturaSimId] = useState('')
  const [pctGlobal, setPctGlobal] = useState(0)
  const [pesoFijo, setPesoFijo] = useState({})
  const [celda, setCelda] = useState({})

  const nombreDeCiudad = (code) => (ciudadesEmpresa || []).find((c) => c.codigo === code)?.nombre || nombreCiudad(code)

  // Ciudades disponibles (las que tienen facturas). Aislamiento total por ciudad.
  const ciudades = useMemo(() => {
    const set = new Map()
    for (const i of invoices || []) {
      const codes = new Set([...(i.resumenRutas || []).map((r) => r.ciudad), i.ciudad].filter(Boolean))
      for (const c of codes) if (!set.has(c)) set.set(c, nombreDeCiudad(c))
    }
    return [...set.entries()].map(([codigo, nombre]) => ({ codigo, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, ciudadesEmpresa])

  const facturasCiudad = useMemo(() => (invoices || [])
    .filter((i) => (i.resumenRutas || []).some((r) => r.ciudad === ciudadSim) || i.ciudad === ciudadSim)
    .sort((a, b) => (b.fechaInicio?.getTime?.() || 0) - (a.fechaInicio?.getTime?.() || 0)), [invoices, ciudadSim])

  // Defaults: primera ciudad y su factura más reciente.
  useEffect(() => { if (!ciudadSim && ciudades.length) setCiudadSim(ciudades[0].codigo) }, [ciudades, ciudadSim])
  useEffect(() => {
    if (facturasCiudad.length && !facturasCiudad.some((f) => f.id === facturaSimId)) setFacturaSimId(facturasCiudad[0].id)
    if (!facturasCiudad.length) setFacturaSimId('')
  }, [facturasCiudad, facturaSimId])

  const invSel = useMemo(() => (invoices || []).find((i) => i.id === facturaSimId) || null, [invoices, facturaSimId])
  const base = useMemo(() => (invSel && ciudadSim ? construirBase(invSel, ciudadSim) : { rutas: [], rangos: [], tieneDetalle: false }), [invSel, ciudadSim])

  // Costo de choferes por ruta (fijo). Se escala para que su suma sea el pago REAL de
  // la ciudad (tarifas reales, vía calcularPagos), así ciudad = suma de rutas.
  const costoPorRuta = useMemo(() => {
    if (!invSel) return {}
    const rg = rutasConGanancia(invSel, drivers, ciudadSim)
    const raw = {}; let tot = 0
    for (const r of rg) { raw[r.ruta] = r.costoChoferes || 0; tot += r.costoChoferes || 0 }
    const pago = calcularPagos(invSel, [], drivers, ciudadSim).reduce((a, p) => a + (p.totalPagar || 0), 0)
    const factor = tot > 0 ? pago / tot : 0
    const out = {}
    for (const k in raw) out[k] = raw[k] * factor
    // Si no hubo desglose por ruta pero sí pago, repártelo parejo entre rutas.
    if (tot === 0 && base.rutas.length && pago > 0) for (const r of base.rutas) out[r.ruta] = pago / base.rutas.length
    return out
  }, [invSel, drivers, ciudadSim, base])

  const ov = useMemo(() => ({ pct: pctGlobal, peso: pesoFijo, celda }), [pctGlobal, pesoFijo, celda])
  const proj = useMemo(() => proyectar(base, ov, costoPorRuta), [base, ov, costoPorRuta])

  const resetear = () => { setPctGlobal(0); setPesoFijo({}); setCelda({}) }
  const hayCambios = pctGlobal !== 0 || Object.values(pesoFijo).some((v) => v !== '' && v != null) || Object.values(celda).some((v) => v !== '' && v != null)

  if (!esDueno) return <Aviso tipo="warn">El simulador está disponible solo para el dueño.</Aviso>
  if (!ciudades.length) return <EstadoVacio titulo="Sin facturas" texto="Carga una factura para poder simular precios." mostrarBoton={false} />

  const difIngreso = proj.ingresoProy - proj.ingresoBase
  const difGanancia = proj.gananciaProy - proj.gananciaBase
  const mensajeGanancia = difGanancia < -0.01
    ? `Dejarías de ganar ${money(Math.abs(difGanancia))}`
    : difGanancia > 0.01 ? `Ganarías ${money(difGanancia)} más` : 'Sin cambio en la ganancia'

  const colorCelda = (proyec, actual) => (proyec < actual - 0.001 ? 'text-rose-600 border-rose-300 dark:text-rose-400' : proyec > actual + 0.001 ? 'text-emerald-600 border-emerald-300 dark:text-emerald-400' : 'text-slate-600 border-slate-200 dark:text-slate-300')

  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        <b>Simulador de precios.</b> Proyecta qué pasa con tu ingreso y tu ganancia si Gofo cambia sus precios. Es
        <b> solo simulación</b>: no cambia ningún precio, tarifa ni dato real. El pago a los choferes es fijo (depende de sus tarifas, no de Gofo).
      </Aviso>

      {/* 1-2. Ciudad y factura */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Building2 size={13} /> Ciudad</div>
            <Select value={ciudadSim} onChange={(e) => { setCiudadSim(e.target.value); resetear() }} className="min-w-[180px]">
              {ciudades.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Receipt size={13} /> Factura</div>
            <Select value={facturaSimId} onChange={(e) => { setFacturaSimId(e.target.value); resetear() }} className="min-w-[220px]">
              {facturasCiudad.map((f) => <option key={f.id} value={f.id}>{f.semana || `${fFecha(f.fechaInicio)}–${fFecha(f.fechaFin)}`}</option>)}
            </Select>
          </div>
          <span className="ml-auto text-xs text-slate-400">{base.rutas.length} ruta(s) en {nombreDeCiudad(ciudadSim)}</span>
        </div>
      </Card>

      {base.rutas.length === 0 ? (
        <EstadoVacio titulo="Sin rutas" texto="Esta factura no tiene rutas para esta ciudad." mostrarBoton={false} />
      ) : (
        <>
          {/* 3. Base actual */}
          <div className="mb-4 flex flex-wrap gap-3">
            <KPI label="Ingreso Gofo (actual)" value={money(proj.ingresoBase)} icon={DollarSign} accent="green" />
            <KPI label="Pago a choferes (fijo)" value={money(proj.pagoCiudad)} icon={Receipt} accent="navy" sub="no cambia con los precios" />
            <KPI label="Ganancia actual" value={money(proj.gananciaBase)} icon={TrendingUp} accent="gold" sub={`margen ${pct(proj.margenBase)}`} />
          </div>

          {/* 4. Ajuste masivo */}
          <Card className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal size={17} strokeWidth={1.9} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ajuste masivo</h3>
              {hayCambios && <Boton variant="ghost" onClick={resetear} className="ml-auto px-2.5 py-1 text-xs"><RotateCcw size={13} strokeWidth={2} /> Reiniciar</Boton>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Cambiar todos los precios:</span>
              <input type="range" min={-0.30} max={0.10} step={0.01} value={pctGlobal} onChange={(e) => setPctGlobal(Number(e.target.value))} className="w-56 accent-brand-navy" />
              <span className={`w-16 text-center text-sm font-bold ${pctGlobal < 0 ? 'text-rose-600' : pctGlobal > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{pctGlobal > 0 ? '+' : ''}{Math.round(pctGlobal * 100)}%</span>
              <div className="flex gap-1">
                {[-0.05, -0.10, -0.15].map((v) => (
                  <button key={v} onClick={() => setPctGlobal(v)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${pctGlobal === v ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300'}`}>{Math.round(v * 100)}%</button>
                ))}
                <button onClick={() => setPctGlobal(0)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300">0%</button>
              </div>
            </div>
            {base.tieneDetalle && (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
                <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Fijar precio por rango de peso (aplica a todas las rutas):</div>
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
          </Card>

          {/* 5. Resultados */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className={`p-4 ${difIngreso < 0 ? 'border-l-4 border-l-rose-500' : difIngreso > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
              <div className="text-xs text-slate-400">Ingreso proyectado</div>
              <div className="text-xl font-bold text-brand-navy dark:text-slate-100">{money(proj.ingresoProy)}</div>
              <div className={`text-sm font-semibold ${difIngreso < 0 ? 'text-rose-600' : difIngreso > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{difIngreso >= 0 ? '+' : ''}{money(difIngreso)} vs actual</div>
            </Card>
            <Card className={`p-4 ${difGanancia < 0 ? 'border-l-4 border-l-rose-500' : difGanancia > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
              <div className="text-xs text-slate-400">Ganancia proyectada</div>
              <div className={`text-xl font-bold ${proj.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-100'}`}>{money(proj.gananciaProy)}</div>
              <div className={`text-sm font-semibold ${difGanancia < 0 ? 'text-rose-600' : difGanancia > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{mensajeGanancia}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">Margen</div>
              <div className="text-xl font-bold text-brand-navy dark:text-slate-100">{pct(proj.margenProy)}</div>
              <div className="text-sm text-slate-400">actual {pct(proj.margenBase)}</div>
            </Card>
          </div>

          {/* 5.b Punto de equilibrio ciudad */}
          <Card className={`mb-4 flex items-start gap-3 p-4 ${proj.bePctCiudad > -0.001 ? 'border-l-4 border-l-rose-500' : ''}`}>
            <Target size={20} strokeWidth={1.8} className={proj.bePctCiudad > -0.05 ? 'text-rose-500' : 'text-amber-500'} />
            <div>
              <div className="font-semibold text-brand-navy dark:text-slate-100">Punto de equilibrio de {nombreDeCiudad(ciudadSim)}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Si Gofo baja sus precios <b>más de {Math.abs(Math.round(proj.bePctCiudad * 1000) / 10)}%</b> (sobre las primeras entregas), la ganancia de esta ciudad llega a <b>$0</b>. Ese es tu margen para negociar.
              </div>
            </div>
          </Card>

          {/* 6. Tabla por ruta */}
          <Card className="p-4">
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Precios por ruta</h3>
            <p className="mb-3 text-xs text-slate-400">
              Cada celda muestra el precio actual (gris) y un campo para el precio nuevo. <span className="text-rose-600">Rojo</span> = Gofo baja · <span className="text-emerald-600">verde</span> = Gofo sube.
              {!base.tieneDetalle && ' Esta factura no trae el desglose por peso; se simula con el precio promedio por ruta.'}
            </p>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-2.5 py-2.5 text-left font-semibold">Ruta</th>
                    {base.rangos.map((rg) => <th key={rg} className="px-2 py-2.5 text-center font-semibold">{rg === '(promedio)' ? 'Precio/paq' : rg}</th>)}
                    <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso proy.</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia proy.</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold">Δ Ganancia</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold">Equilibrio</th>
                  </tr>
                </thead>
                <tbody>
                  {proj.rutas.map((r) => {
                    const dG = r.gananciaProy - r.gananciaBase
                    const enRiesgo = r.gananciaProy < 0 || r.bePct > -0.05
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
                              <div className="text-[11px] text-slate-400">{money(c.precio)} · {num(c.cantidad)}</div>
                              <input
                                type="number" step="0.01" min="0"
                                value={val ?? ''}
                                placeholder={proyec.toFixed(2)}
                                onChange={(e) => setCelda((s) => ({ ...s, [k]: e.target.value }))}
                                className={`w-16 rounded-md border bg-transparent px-1 py-0.5 text-center text-[13px] outline-none focus:border-brand-gold ${colorCelda(proyec, c.precio)}`}
                              />
                            </td>
                          )
                        })}
                        <td className="px-2.5 py-2 text-right">{money(r.ingresoProy)}</td>
                        <td className={`px-2.5 py-2 text-right font-semibold ${r.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-200'}`}>{money(r.gananciaProy)}</td>
                        <td className={`px-2.5 py-2 text-right font-semibold ${dG < -0.01 ? 'text-rose-600' : dG > 0.01 ? 'text-emerald-600' : 'text-slate-400'}`}>{dG >= 0 ? '+' : ''}{money(dG)}</td>
                        <td className={`px-2.5 py-2 text-right text-xs ${enRiesgo ? 'font-semibold text-rose-600' : 'text-slate-500'}`} title={`Precio de equilibrio ≈ ${money(r.beAvg)}/paq`}>
                          {r.bePct <= -0.001 ? `−${Math.abs(Math.round(r.bePct * 1000) / 10)}%` : '⚠ en pérdida'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <td className="px-2.5 py-2.5">Total {nombreDeCiudad(ciudadSim)}</td>
                    {base.rangos.map((rg) => <td key={rg} />)}
                    <td className="px-2.5 py-2.5 text-right">{money(proj.ingresoProy)}</td>
                    <td className={`px-2.5 py-2.5 text-right ${proj.gananciaProy < 0 ? 'text-rose-600' : ''}`}>{money(proj.gananciaProy)}</td>
                    <td className={`px-2.5 py-2.5 text-right ${difGanancia < -0.01 ? 'text-rose-600' : difGanancia > 0.01 ? 'text-emerald-600' : ''}`}>{difGanancia >= 0 ? '+' : ''}{money(difGanancia)}</td>
                    <td className="px-2.5 py-2.5 text-right text-xs">−{Math.abs(Math.round(proj.bePctCiudad * 1000) / 10)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              "Equilibrio" por ruta = cuánto puede bajar Gofo el precio antes de que esa ruta pierda dinero. El costo de choferes por ruta es {base.tieneDetalle ? 'exacto' : 'estimado (tarifa promedio de la ciudad)'} — el total de la ciudad usa las tarifas reales.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
