import { useMemo, useState } from 'react'
import { Scale, AlertTriangle, TrendingDown, FileWarning, Download, CheckCircle2 } from 'lucide-react'
import { useData } from '../DataContext'
import { claimsDeCiudad, TODAS } from '../utils/calc'
import { facturasQueNoCuadran, cambiosDePrecio, claimsSospechosos, totalEnDisputa, descargarReporteReclamo, descargarReporteConsolidado } from '../utils/reclamos'
import { money, num, pct } from '../utils/format'
import { Card, PageTitle, Boton, Badge, Cargando, EstadoVacio } from '../components/ui'

export default function ReclamosGofo() {
  const { facturaRango: inv, invoicesRango, invAnterior, claims, selectedCity, empresaActiva, cargando } = useData()
  const [generando, setGenerando] = useState(null)

  // Respeta el filtro de ciudad: solo las facturas de esa ciudad (cada factura es de
  // una ciudad). Con "Todas" se revisan todas.
  const cuadres = useMemo(() => facturasQueNoCuadran(
    selectedCity === TODAS ? invoicesRango
      : invoicesRango.filter((f) => (f.ciudad || '') === selectedCity || (f.resumenCiudades || []).some((c) => c.ubicacion === selectedCity))
  ), [invoicesRango, selectedCity])
  const precios = useMemo(() => cambiosDePrecio(inv, invAnterior, selectedCity), [inv, invAnterior, selectedCity])
  const sospechosos = useMemo(() => claimsSospechosos(claimsDeCiudad(claims, selectedCity, inv)), [claims, selectedCity, inv])
  const total = totalEnDisputa(cuadres, precios, sospechosos)
  const nHallazgos = cuadres.length + precios.length + sospechosos.length

  const meta = useMemo(
    () => ({ empresa: empresaActiva?.nombre || 'Nuestra empresa', semana: inv?.semana || '', fecha: new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) }),
    [empresaActiva, inv]
  )

  const generar = async (h, key) => {
    setGenerando(key)
    try { await descargarReporteReclamo(h, meta) } finally { setGenerando(null) }
  }

  const generarTodo = async () => {
    setGenerando('todo')
    try { await descargarReporteConsolidado({ cuadres, precios, sospechosos, meta }) } finally { setGenerando(null) }
  }

  const BotonReporte = ({ h, keyId }) => (
    <Boton variant="gold" disabled={generando === keyId} onClick={() => generar(h, keyId)} className="px-3 py-1.5 text-xs">
      <Download size={14} strokeWidth={1.8} /> {generando === keyId ? 'Generando…' : 'Generar reporte de reclamo'}
    </Boton>
  )

  return (
    <div>
      <PageTitle>Reclamos a Gofo</PageTitle>

      {cargando ? (
        <Cargando texto="Analizando facturación…" />
      ) : !inv ? (
        <EstadoVacio titulo="Sin datos en este rango" texto="No hay facturas en el rango seleccionado para revisar reclamos." />
      ) : (
        <>
          {/* Resumen: dinero en disputa */}
          <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-navy text-brand-gold"><Scale size={24} strokeWidth={1.8} /></div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">En disputa este periodo</div>
              <div className={`text-3xl font-extrabold ${total > 0 ? 'text-brand-gold' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(total)}</div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-2">
              <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                {nHallazgos > 0 ? <><b className="text-brand-navy dark:text-slate-100">{num(nHallazgos)}</b> hallazgo(s)</> : 'Todo en orden'}
              </div>
              {nHallazgos > 0 && (
                <Boton variant="gold" disabled={generando === 'todo'} onClick={generarTodo} className="px-3 py-1.5 text-xs">
                  <Download size={14} strokeWidth={1.8} /> {generando === 'todo' ? 'Generando…' : 'Descargar todo'}
                </Boton>
              )}
            </div>
          </Card>

          {nHallazgos === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 size={40} strokeWidth={1.5} className="mx-auto text-emerald-500" />
              <h3 className="mt-2 text-lg font-bold text-brand-navy dark:text-slate-100">No hay nada que reclamar</h3>
              <p className="text-slate-500 dark:text-slate-400">Las facturas cuadran, no hay cambios de precio anómalos ni claims sospechosos en este periodo.</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* 1) Facturas que no cuadran */}
              {cuadres.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-brand-navy dark:text-slate-100"><FileWarning size={19} strokeWidth={1.8} className="text-rose-500" /> Facturas que no cuadran ({cuadres.length})</h2>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {cuadres.map((h) => (
                      <Card key={h.invoiceId} className="border-l-4 border-l-rose-500 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-bold text-brand-navy dark:text-slate-100">{h.referencia}</span>
                          <Badge color="red">Dif {money(h.diferencia)}</Badge>
                          <span className="ml-auto text-xs text-slate-400">Semana {h.semana || '—'}</span>
                        </div>
                        <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                          <table className="w-full min-w-[420px] border-collapse text-[13px]">
                            <thead>
                              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <th className="px-2.5 py-2 text-left font-semibold">Línea</th>
                                <th className="px-2.5 py-2 text-right font-semibold">Nuestro</th>
                                <th className="px-2.5 py-2 text-right font-semibold">Gofo</th>
                                <th className="px-2.5 py-2 text-right font-semibold">Diferencia</th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.lineas.map((l) => (
                                <tr key={l.linea} className={`border-t border-slate-100 dark:border-slate-700/50 ${l.linea === h.lineaPrincipal?.linea ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}`}>
                                  <td className="px-2.5 py-1.5">{l.linea}{l.linea === h.lineaPrincipal?.linea && <span className="ml-1 text-[10px] font-semibold text-rose-500">← principal</span>}</td>
                                  <td className="px-2.5 py-1.5 text-right">{money(l.nuestro)}</td>
                                  <td className="px-2.5 py-1.5 text-right">{money(l.gofo)}</td>
                                  <td className={`px-2.5 py-1.5 text-right font-medium ${Math.abs(l.dif) > 0.01 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{money(l.dif)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-slate-200 font-bold dark:border-slate-600">
                                <td className="px-2.5 py-1.5">TOTAL / NETO</td>
                                <td className="px-2.5 py-1.5 text-right">{money(h.netoNuestro)}</td>
                                <td className="px-2.5 py-1.5 text-right">{money(h.totalGofo)}</td>
                                <td className="px-2.5 py-1.5 text-right text-rose-600 dark:text-rose-400">{money(h.diferencia)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 flex justify-end"><BotonReporte h={h} keyId={`cuadre:${h.invoiceId}`} /></div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {/* 2) Cambios de precio */}
              {precios.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-brand-navy dark:text-slate-100"><TrendingDown size={19} strokeWidth={1.8} className="text-amber-500" /> Cambios de precio de Gofo ({precios.length})</h2>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {precios.map((h) => (
                      <Card key={h.ruta} className="border-l-4 border-l-amber-500 p-4">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-bold text-brand-navy dark:text-slate-100">Ruta {h.ruta}</span>
                          <span className="text-xs text-slate-400">{h.nombreCiudad}</span>
                          <Badge color={h.impacto >= 0 ? 'red' : 'green'}>Impacto {money(h.impacto)}</Badge>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          $/paquete: {money(h.antesPq)} → {money(h.ahoraPq)} <span className={h.cambioPq < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>({h.cambioPq >= 0 ? '+' : ''}{pct(h.cambioPq)})</span>
                          {' · '}$/lb: {money(h.antesLb)} → {money(h.ahoraLb)}
                        </p>
                        <p className="text-xs text-slate-400">Sobre {num(h.paquetes)} paquetes de la ruta en este periodo.</p>
                        <div className="mt-3 flex justify-end"><BotonReporte h={h} keyId={`precio:${h.ruta}`} /></div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {/* 3) Claims sospechosos */}
              {sospechosos.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={19} strokeWidth={1.8} className="text-rose-500" /> Claims sospechosos ({sospechosos.length})</h2>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {sospechosos.map((h, i) => (
                      <Card key={`${h.waybill}:${i}`} className="border-l-4 border-l-rose-400 p-4">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{h.waybill}</span>
                          <Badge color={h.tipo === 'reversion' ? 'gold' : 'red'}>{h.tipo === 'reversion' ? 'Reversión' : 'Monto alto'}</Badge>
                          <span className="ml-auto font-semibold text-rose-600 dark:text-rose-400">{money(h.disputa)}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{h.courier} · {h.claimType || 'sin tipo'} · Gofo: {money(h.montoGofo)}</p>
                        <p className="text-xs text-slate-400">{h.motivo}{h.umbral ? ` (umbral ${money(h.umbral)})` : ''}.</p>
                        <div className="mt-3 flex justify-end"><BotonReporte h={h} keyId={`claim:${h.waybill}:${i}`} /></div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
