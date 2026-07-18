import { useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Route as RouteIcon, Search, TrendingUp, TrendingDown, FileSpreadsheet, FileText, DollarSign, Scale, SlidersHorizontal } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { rutasConGanancia } from '../utils/calc'
import { reprocesarFactura } from '../utils/reprocesar'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { Card, PageTitle, Input, Boton, Badge, Aviso, Spinner, Cargando, EstadoVacio } from '../components/ui'
import Simulador from './Simulador'

const RANGOS_ORD = ['0-1lb', '1-5lb', '5-10lb', '10-20lb', '20-30lb', '30-40lb', '40+lb']

export default function Rutas() {
  const { facturaRango: inv, invoicesRango, drivers, selectedCity, cargando, reloadInvoices } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const esDueno = esSuperAdmin || perfil?.role === 'owner'
  const navigate = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [sortKey, setSortKey] = useState('ganancia')

  // Reprocesar (solo dueño): extrae el desglose por peso de la factura seleccionada.
  const facturaUnica = (invoicesRango || []).length === 1 ? invoicesRango[0] : null
  const fileRef = useRef(null)
  const [reproMsg, setReproMsg] = useState(null)
  const [reprocesando, setReprocesando] = useState(false)
  const [dragRepro, setDragRepro] = useState(false)
  const procesarArchivos = async (fileList) => {
    const files = [...(fileList || [])]
    if (!files.length) return
    setReproMsg(null); setReprocesando(true)
    try {
      const r = await reprocesarFactura(facturaUnica, files)
      if (r) { setReproMsg(r); if (r.tipo === 'ok') await reloadInvoices() }
    } catch (err) {
      setReproMsg({ tipo: 'error', txt: 'No se pudo procesar: ' + err.message })
    } finally { setReprocesando(false) }
  }
  const onReprocesar = (e) => { const f = e.target.files; e.target.value = ''; procesarArchivos(f) }

  // Desglose de PRECIO POR PESO por ruta (dato real de la factura). Vacío en facturas
  // viejas sin el desglose (se avisa y se usa el promedio en la pestaña Resumen).
  const preciosPeso = useMemo(() => {
    const todos = (inv?.simuladorDesglose || inv?.resumenRutaPeso) || []
    const conCiudad = todos.filter((x) => selectedCity === 'todas' || x.ciudad === selectedCity)
    // Respaldo: si el filtro por ciudad queda vacío pero hay desglose, se usa todo.
    const rp = (conCiudad.length || selectedCity === 'todas') ? conCiudad : todos
    const map = {}
    const rangosSet = new Set()
    for (const x of rp) {
      const r = map[x.ruta] || (map[x.ruta] = { ruta: x.ruta, ciudad: x.ciudad, nombreCiudad: x.nombreCiudad, celdas: {}, dobles: 0, ingresoDobles: 0, individuales: 0, ingreso: 0 })
      if (x.doble) { r.dobles += x.cantidad || 0; r.ingresoDobles += x.ingreso || 0 }
      else { r.celdas[x.rango] = { precio: x.precio, cantidad: x.cantidad || 0, ingreso: x.ingreso || 0 }; r.individuales += x.cantidad || 0; rangosSet.add(x.rango) }
      r.ingreso += x.ingreso || 0
    }
    const rutas = Object.values(map).sort((a, b) => String(a.ruta).localeCompare(String(b.ruta)))
    return { rutas, rangos: RANGOS_ORD.filter((rg) => rangosSet.has(rg)), hay: rutas.length > 0 }
  }, [inv, selectedCity])
  const [asc, setAsc] = useState(false)
  const [busca, setBusca] = useState('')

  const rutas = useMemo(() => rutasConGanancia(inv, drivers, selectedCity), [inv, drivers, selectedCity])
  const mejor = useMemo(() => [...rutas].sort((a, b) => b.ganancia - a.ganancia)[0], [rutas])
  const peor = useMemo(() => (rutas.length > 1 ? [...rutas].sort((a, b) => a.ganancia - b.ganancia)[0] : null), [rutas])

  // Nivel de rentabilidad por TERCILES de ganancia (sobre TODAS las rutas, para que el
  // color signifique lo mismo aunque busques): tercio superior = verde (más dejan),
  // medio = amarillo, inferior = rojo. Cualquier ruta en pérdida (ganancia < 0) va roja.
  const nivelPorRuta = useMemo(() => {
    const orden = [...rutas].sort((a, b) => b.ganancia - a.ganancia)
    const n = orden.length
    const m = {}
    orden.forEach((r, i) => {
      let nivel = i < n / 3 ? 'alta' : i < (2 * n) / 3 ? 'media' : 'baja'
      if (r.ganancia < 0) nivel = 'baja'
      m[r.ruta] = nivel
    })
    return m
  }, [rutas])
  const NIVEL = {
    alta: { borde: 'border-l-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', punto: 'bg-emerald-500' },
    media: { borde: 'border-l-amber-400', texto: 'text-amber-600 dark:text-amber-400', punto: 'bg-amber-400' },
    baja: { borde: 'border-l-rose-500', texto: 'text-rose-600 dark:text-rose-400', punto: 'bg-rose-500' },
  }

  const filtradas = rutas.filter((r) => r.ruta.toLowerCase().includes(busca.trim().toLowerCase()))
  const rows = [...filtradas].sort((a, b) => {
    const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })
  const cambiar = (k) => { if (sortKey === k) setAsc((v) => !v); else { setSortKey(k); setAsc(false) } }
  const flecha = (k) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  // Exportaciones (respetan el orden y la búsqueda actuales: exportan lo que se ve).
  const nombreExp = `rutas_${(selectedCity !== 'todas' ? selectedCity : '') || inv?.semana || 'periodo'}`.replace(/[^\w-]+/g, '_')
  const exportarE = () =>
    exportarExcel(nombreExp, [{ nombre: 'Rutas', rows: rows.map((r) => ({
      Ruta: r.ruta, Ciudad: r.nombreCiudad, Paquetes: r.paquetes, Individuales: r.individuales, Dobles: r.dobles,
      Ingreso: Math.round(r.ingreso), '$/paq (paga Gofo)': Number((r.precioPorPaquete || 0).toFixed(2)), '$/lb': Number((r.precioPorLb || 0).toFixed(3)),
      'Costo choferes': Math.round(r.costoChoferes), Ganancia: Math.round(r.ganancia), 'Ganancia/paquete': Number((r.gananciaPorPaquete || 0).toFixed(2)), Claims: r.numClaims || 0,
      'Calidad (%)': r.calidad != null ? Number((r.calidad * 100).toFixed(1)) : '',
    })) }])
  const exportarP = () =>
    exportarPDF(nombreExp, 'Rutas', inv?.semana || '', [{
      titulo: `Rutas (${rows.length})`,
      head: ['Ruta', 'Ciudad', 'Paq.', 'Ind.', 'Dobles', 'Ingreso', '$/paq Gofo', '$/lb', 'Costo chof.', 'Ganancia', 'Gan/paq', 'Claims', 'Calidad'],
      body: rows.map((r) => [r.ruta, r.nombreCiudad, num(r.paquetes), num(r.individuales), num(r.dobles), money(r.ingreso), money(r.precioPorPaquete), `$${(r.precioPorLb || 0).toFixed(3)}`, money(r.costoChoferes), money(r.ganancia), money(r.gananciaPorPaquete), num(r.numClaims || 0), pct(r.calidad, 1)]),
    }])

  const cols = [
    { k: 'ruta', label: 'Ruta', txt: true },
    { k: 'paquetes', label: 'Paquetes' },
    { k: 'individuales', label: 'Ind.' },
    { k: 'dobles', label: 'Dobles' },
    { k: 'ingreso', label: 'Ingreso' },
    { k: 'precioPorPaquete', label: '$/paq Gofo' },
    { k: 'precioPorLb', label: '$/lb' },
    { k: 'costoChoferes', label: 'Costo choferes' },
    { k: 'ganancia', label: 'Ganancia' },
    { k: 'gananciaPorPaquete', label: 'Gan/paq' },
    { k: 'numClaims', label: 'Claims' },
    { k: 'calidad', label: 'Calidad' },
  ]

  return (
    <div>
      <PageTitle>Rutas</PageTitle>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700/60">
        {[
          { k: 'resumen', l: 'Resumen', Icon: RouteIcon },
          { k: 'precios', l: 'Precios por ruta', Icon: DollarSign },
          ...(esDueno ? [{ k: 'proyeccion', l: 'Proyección', Icon: SlidersHorizontal }] : []),
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === t.k ? 'border-brand-gold text-brand-navy dark:text-white' : 'border-transparent text-slate-500 hover:text-brand-navy dark:text-slate-400 dark:hover:text-white'}`}
          >
            <t.Icon size={15} strokeWidth={1.9} /> {t.l}
          </button>
        ))}
      </div>

      {esDueno && tab === 'proyeccion' ? (
        <Simulador embed />
      ) : cargando ? (
        <Cargando texto="Cargando rutas…" />
      ) : !inv ? (
        <EstadoVacio titulo="Sin datos en este rango" texto="No hay facturas en el rango seleccionado para analizar rutas." />
      ) : tab === 'precios' ? (
        !preciosPeso.hay ? (
          <Card className="p-4">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple onChange={onReprocesar} className="hidden" />
            {reproMsg && <Aviso tipo={reproMsg.tipo} className="mb-3">{reproMsg.txt}</Aviso>}
            <div className="mb-3 flex items-center gap-3">
              <Scale size={22} strokeWidth={1.8} className="text-amber-500" />
              <div>
                <div className="font-semibold text-brand-navy dark:text-slate-100">Sin desglose por peso todavía</div>
                <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
                  Esta factura no trae el precio por rango de peso (0-1lb, 1-5lb…). {esDueno ? 'Reprocésala para extraerlo (solo alimenta Rutas y el simulador; no cambia pagos ni totales).' : 'Se guarda al cargar facturas nuevas.'} Mientras tanto, en <b>Resumen</b> ves el precio promedio por ruta.
                </p>
              </div>
            </div>
            {esDueno && (
              facturaUnica
                ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragRepro(true) }}
                    onDragLeave={() => setDragRepro(false)}
                    onDrop={(e) => { e.preventDefault(); setDragRepro(false); procesarArchivos(e.dataTransfer.files) }}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${dragRepro ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 hover:border-brand-gold dark:border-slate-600'}`}
                  >
                    {reprocesando ? <Spinner /> : <Scale size={22} strokeWidth={1.8} className="text-brand-gold" />}
                    <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{reprocesando ? 'Procesando…' : 'Arrastra el Excel de esta factura aquí'}</div>
                    <div className="text-xs text-slate-400">o haz clic para elegirlo · .xlsx, .xls</div>
                  </div>
                )
                : <span className="text-xs text-slate-400">Elige arriba <b>Una factura</b> (una sola semana/ciudad) para poder reprocesarla.</span>
            )}
          </Card>
        ) : (
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <DollarSign size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Precio real por peso</h3>
              <span className="ml-auto text-xs text-slate-400">{preciosPeso.rutas.length} ruta(s) · lo que paga Gofo por paquete según el peso</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">Cada celda: <b>precio por paquete</b> (grande) y cantidad de paquetes en ese tramo de peso. Los dobles (envío al mismo domicilio) pagan $0.50 fijo.</p>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-2.5 py-2.5 text-left font-semibold">Ruta</th>
                    {preciosPeso.rangos.map((rg) => <th key={rg} className="px-2 py-2.5 text-center font-semibold">{rg}</th>)}
                    <th className="px-2.5 py-2.5 text-center font-semibold">Dobles</th>
                    <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso ruta</th>
                  </tr>
                </thead>
                <tbody>
                  {preciosPeso.rutas.map((r) => (
                    <tr key={r.ruta} className="border-t border-slate-100 dark:border-slate-700/50">
                      <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{r.ruta} {selectedCity === 'todas' && <span className="text-xs text-slate-400">{r.nombreCiudad || r.ciudad}</span>}</td>
                      {preciosPeso.rangos.map((rg) => {
                        const c = r.celdas[rg]
                        if (!c) return <td key={rg} className="px-2 py-2 text-center text-slate-300">—</td>
                        return (
                          <td key={rg} className="px-2 py-1.5 text-center">
                            <div className="text-[15px] font-bold text-brand-navy dark:text-slate-100">{money(c.precio)}</div>
                            <div className="text-[11px] text-slate-400">{num(c.cantidad)} paq</div>
                          </td>
                        )
                      })}
                      <td className="px-2.5 py-2 text-center text-slate-500">{r.dobles ? `${num(r.dobles)} × $0.50` : '—'}</td>
                      <td className="px-2.5 py-2 text-right font-semibold text-brand-navy dark:text-slate-200">{money(r.ingreso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <>
          {(mejor || peor) && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mejor && (
                <Card className="flex items-center gap-3 border-l-4 border-l-emerald-500 p-4">
                  <TrendingUp size={22} strokeWidth={1.8} className="text-emerald-500" />
                  <div><div className="text-xs text-slate-400">Ruta más rentable</div><div className="font-bold text-brand-navy dark:text-slate-100">{mejor.ruta} · {money(mejor.ganancia)}</div></div>
                </Card>
              )}
              {peor && (
                <Card className="flex items-center gap-3 border-l-4 border-l-rose-500 p-4">
                  <TrendingDown size={22} strokeWidth={1.8} className="text-rose-500" />
                  <div><div className="text-xs text-slate-400">Ruta menos rentable</div><div className="font-bold text-brand-navy dark:text-slate-100">{peor.ruta} · {money(peor.ganancia)}</div></div>
                </Card>
              )}
            </div>
          )}

          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="w-56 pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ruta…" />
              </div>
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{rows.length} ruta(s)</span>
              <Boton variant="ghost" onClick={exportarE} disabled={rows.length === 0} className="px-3 py-1.5 text-xs"><FileSpreadsheet size={15} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={exportarP} disabled={rows.length === 0} className="px-3 py-1.5 text-xs"><FileText size={15} strokeWidth={1.8} /> PDF</Boton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Ordenar:</span>
              {[
                { k: 'ganancia', asc: false, l: 'Mayor ganancia' },
                { k: 'ganancia', asc: true, l: 'Menor ganancia' },
                { k: 'paquetes', asc: false, l: 'Mayor volumen' },
                { k: 'paquetes', asc: true, l: 'Menor volumen' },
              ].map((o) => {
                const activo = sortKey === o.k && asc === o.asc
                return (
                  <button
                    key={o.l}
                    onClick={() => { setSortKey(o.k); setAsc(o.asc) }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activo ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    {o.l}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-400">Rentabilidad:</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Más rentables</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Intermedias</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Menos rentables / pérdida</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <RouteIcon size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Todas las rutas</h3>
              <span className="ml-auto text-xs text-slate-400">{rows.length && rows.every((r) => r.costoExacto) ? 'Costo de choferes REAL (tarifa de cada chofer en la ruta)' : 'Costo de choferes estimado con la tarifa promedio (facturas nuevas traen el real)'}</span>
            </div>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[1000px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {cols.map((c) => (
                      <th key={c.k} onClick={() => cambiar(c.k)} className={`cursor-pointer whitespace-nowrap px-2.5 py-2.5 font-semibold ${c.txt ? 'text-left' : 'text-right'}`}>{c.label}{flecha(c.k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const nivel = NIVEL[nivelPorRuta[r.ruta] || 'media']
                    return (
                    <tr key={r.ruta} onClick={() => navigate(`/rutas/${encodeURIComponent(r.ruta)}`)} className={`cursor-pointer border-t border-l-4 border-slate-100 ${nivel.borde} hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30`}>
                      <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${nivel.punto}`} />
                        {r.ruta} <span className="text-xs text-slate-400">{r.nombreCiudad}</span>
                      </td>
                      <td className="px-2.5 py-2 text-right">{num(r.paquetes)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.individuales)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.dobles)}</td>
                      <td className="px-2.5 py-2 text-right">{money(r.ingreso)}</td>
                      <td className="px-2.5 py-2 text-right">{money(r.precioPorPaquete)}</td>
                      <td className="px-2.5 py-2 text-right">${(r.precioPorLb || 0).toFixed(3)}</td>
                      <td className="px-2.5 py-2 text-right text-brand-navy dark:text-slate-200">{money(r.costoChoferes)}</td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${nivel.texto}`}>{money(r.ganancia)}</td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${nivel.texto}`}>{money(r.gananciaPorPaquete)}</td>
                      <td className="px-2.5 py-2 text-right">{num(r.numClaims || 0)}</td>
                      <td className="px-2.5 py-2 text-right">{pct(r.calidad, 1)}</td>
                    </tr>
                    )
                  })}
                  {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-slate-400">Sin rutas con ese nombre.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">Ganancia = ingreso (lo que paga Gofo) − costo estimado de choferes. En rojo, rutas no rentables. Haz clic en una ruta para ver su detalle e historial.</p>
          </Card>
        </>
      )}
    </div>
  )
}
