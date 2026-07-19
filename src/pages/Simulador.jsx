// Proyección de precios de Gofo (menú "Proyección" / pestaña en Rutas). SOLO
// simulación/lectura: no cambia ningún precio, tarifa ni dato real. Elige una o VARIAS
// ciudades → (cada ciudad usa SU factura) → edita precios de las rutas de todas ellas →
// "Generar proyección" → resumen con KPIs, gráficas y recomendaciones.
// La GANANCIA mostrada es la REAL (igual que Financiero): ingreso neto − pago real a
// choferes − gastos fijos. El pago a choferes es fijo (no cambia con los precios de Gofo).
import { useState, useMemo, useEffect, useRef } from 'react'
import { updateDoc, doc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, rutasConGanancia, gananciaRealDe, tarifaDriver } from '../utils/calc'
import { construirBase, proyectar } from '../utils/simulador'
import { reprocesarFactura } from '../utils/reprocesar'
import { guardarProyeccion, borrarProyeccion } from '../utils/proyeccionesGuardadas'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { nombreCiudad } from '../constants'
import { Card, KPI, Boton, Select, Input, Aviso, EstadoVacio, PageTitle, Spinner } from '../components/ui'
import { ComparativoCard, ImpactoCard, GaugeCard } from '../components/charts'
import { SlidersHorizontal, RotateCcw, TrendingUp, DollarSign, Building2, Target, Receipt, Globe, FileSpreadsheet, FileText, Zap, AlertTriangle, CheckCircle2, Info, Scale, ChevronDown, Check, Save, History, Trash2, FolderOpen, Eye, EyeOff, Search, X } from 'lucide-react'

const MENSUAL = 4.3
const ORDEN_RANGO = ['(promedio)', '0-1lb', '1-5lb', '5-10lb', '10-20lb', '20-30lb', '30-40lb', '40+lb']
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fFecha = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '')
const bePctTxt = (p) => `−${Math.abs(Math.round((p || 0) * 1000) / 10)}%`

function recomendar(r, filas, esResumen) {
  const recs = []
  const dif = r.gananciaProy - r.gananciaBase
  const mensual = dif * MENSUAL
  const uni = esResumen ? 'ciudad(es)' : 'ruta(s)'
  if (r.gananciaProy < 0) recs.push({ nivel: 'critico', texto: `Con estos precios, ${r.label} quedaría en PÉRDIDA (${money(r.gananciaProy)} de ganancia real). No es sostenible.` })
  else if (r.margenProy < 0.05) recs.push({ nivel: 'aviso', texto: `El margen real de ${r.label} bajaría a ${pct(r.margenProy)} (menos de 5%). Queda muy justo.` })
  else recs.push({ nivel: 'ok', texto: `${r.label} seguiría en positivo: ${money(r.gananciaProy)} de ganancia real (margen ${pct(r.margenProy)}).` })
  if (dif < -0.01) recs.push({ nivel: 'aviso', texto: `Dejarías de ganar ${money(Math.abs(dif))} por semana ≈ ${money(Math.abs(mensual))} al mes.` })
  else if (dif > 0.01) recs.push({ nivel: 'ok', texto: `Ganarías ${money(dif)} más por semana ≈ ${money(mensual)} al mes.` })
  const perd = filas.filter((f) => f.gananciaProy < 0)
  if (perd.length) recs.push({ nivel: 'critico', texto: `${perd.length} ${uni} con entregas por debajo de su costo: ${perd.slice(0, 4).map((f) => f.name).join(', ')}${perd.length > 4 ? '…' : ''}.` })
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

export default function Simulador({ embed = false }) {
  const { invoices, drivers, managers, ciudadesEmpresa, activeCompanyId, ajustes, reloadAjustes, reloadInvoices } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const esDueno = esSuperAdmin || perfil?.role === 'owner'
  const [dragRepro, setDragRepro] = useState(false)
  const [verHist, setVerHist] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [margenObj, setMargenObj] = useState(0.2) // margen objetivo para sugerir pago al driver
  const [pagoManual, setPagoManual] = useState({}) // rate $/paq editado por el usuario, por ruta/driver
  const [gofoManual, setGofoManual] = useState({}) // Gofo $/paq editado a mano, por ruta/driver
  const [modoPago, setModoPago] = useState('ruta') // 'ruta' | 'driver': cómo agrupar el pago
  // Visibilidad de columnas de la tabla de pago (ojito): oculta en pantalla y en el export.
  const [colsPago, setColsPago] = useState({ ciudad: true, paquetes: true, gofo: true, actual: true, sugerido: true, max: true, margen: true, ganancia: true })
  const [verColsPago, setVerColsPago] = useState(false)
  const [buscarPago, setBuscarPago] = useState('') // filtro por nombre de driver/ruta en la tabla de pago
  const cargarRef = useRef(false)

  const [ciudadesSel, setCiudadesSel] = useState([]) // [] = todas (resumen); 1+ = detalle editable
  const [abreCiudades, setAbreCiudades] = useState(false)
  const [facturaSimId, setFacturaSimId] = useState('')
  const [pctGlobal, setPctGlobal] = useState(0)
  const [pesoFijo, setPesoFijo] = useState({})
  const [celda, setCelda] = useState({})
  const [generado, setGenerado] = useState(false)
  const [reproMsg, setReproMsg] = useState(null)
  const [reprocesando, setReprocesando] = useState(false)
  const [reproTargetId, setReproTargetId] = useState(null)
  const [dragCiudad, setDragCiudad] = useState(null)
  const [claimsInv, setClaimsInv] = useState([])
  const fileRef = useRef(null)
  const cRef = useRef(null)
  const defHecho = useRef(false)
  const targetInvRef = useRef(null)

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

  const esResumen = ciudadesSel.length === 0        // "Todas" → resumen por ciudad (solo %)
  const unaCiudad = ciudadesSel.length === 1        // detalle con selector de factura
  const ciudadUnica = unaCiudad ? ciudadesSel[0] : ''
  const ciudadesSelKey = [...ciudadesSel].sort().join('|')

  const facturasDe = (codigo) => (invoices || [])
    .filter((i) => (i.resumenRutas || []).some((r) => r.ciudad === codigo) || i.ciudad === codigo)
    .sort((a, b) => (b.fechaInicio?.getTime?.() || 0) - (a.fechaInicio?.getTime?.() || 0))
  const facturasCiudad = useMemo(() => (ciudadUnica ? facturasDe(ciudadUnica) : []), [invoices, ciudadUnica]) // eslint-disable-line react-hooks/exhaustive-deps
  const invSel = useMemo(() => (invoices || []).find((i) => i.id === facturaSimId) || null, [invoices, facturaSimId])

  // Unidades = (ciudad, factura) del alcance. Cada ciudad usa SU factura: la elegida si
  // es una sola ciudad; la más reciente de cada ciudad si son varias (o "Todas").
  const unidades = useMemo(() => {
    const cods = esResumen ? ciudades.map((c) => c.codigo) : ciudadesSel
    return cods.map((code) => ({ ciudad: code, inv: (unaCiudad && invSel) ? invSel : facturasDe(code)[0] })).filter((u) => u.inv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esResumen, ciudadesSelKey, ciudades, invSel, unaCiudad, invoices])
  // Clave para queries de claims (solo ids). La clave de DATOS incluye el tamaño del
  // desglose por peso, para que al REPROCESAR (mismo id, datos nuevos) todo se recalcule.
  const unidadesIdKey = unidades.map((u) => u.inv.id).join(',')
  const unidadesKey = unidades.map((u) => `${u.inv.id}:${((u.inv.simuladorDesglose || u.inv.resumenRutaPeso) || []).length}`).join(',')
  const variasCiudades = unidades.length > 1

  // Defaults
  useEffect(() => { if (!defHecho.current && ciudades.length) { defHecho.current = true; setCiudadesSel([ciudades[0].codigo]) } }, [ciudades])
  useEffect(() => {
    if (!ciudadUnica) return
    if (facturasCiudad.length && !facturasCiudad.some((f) => f.id === facturaSimId)) setFacturaSimId(facturasCiudad[0].id)
    if (!facturasCiudad.length) setFacturaSimId('')
  }, [facturasCiudad, facturaSimId, ciudadUnica])

  // El resumen se OCULTA solo al cambiar el ALCANCE (ciudad/factura). Los cambios de
  // precio NO lo esconden. Al CARGAR una proyección guardada no se oculta (flag).
  useEffect(() => {
    if (cargarRef.current) { cargarRef.current = false; return }
    setGenerado(false)
  }, [ciudadesSelKey, facturaSimId])
  useEffect(() => {
    if (!abreCiudades) return
    const fuera = (e) => { if (cRef.current && !cRef.current.contains(e.target)) setAbreCiudades(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abreCiudades])

  // Claims de las facturas del alcance (para la ganancia REAL, igual que Financiero).
  useEffect(() => {
    let cancel = false
    const ids = unidades.map((u) => u.inv.id).filter(Boolean)
    const sems = [...new Set(unidades.map((u) => u.inv.semana).filter(Boolean))]
    if (!activeCompanyId || (!ids.length && !sems.length)) { setClaimsInv([]); return }
    ;(async () => {
      try {
        const qs = [
          ...ids.map((id) => getDocs(query(collection(db, 'claims'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', id)))),
          ...sems.map((s) => getDocs(query(collection(db, 'claims'), where('companyId', '==', activeCompanyId), where('semana', '==', s)))),
        ]
        const snaps = await Promise.all(qs)
        const map = {}
        for (const snap of snaps) for (const d of snap.docs) map[d.id] = { id: d.id, ...d.data() }
        if (!cancel) setClaimsInv(Object.values(map))
      } catch { if (!cancel) setClaimsInv([]) }
    })()
    return () => { cancel = true }
  }, [activeCompanyId, unidadesIdKey])

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

  // Tarifa LINEAL por paquete que realmente le pagas al/los driver(s) asignado(s) a una
  // ruta: su `precioIndividual` (0–1 lb), tomado del chofer asociado a la ruta vía
  // resumenChoferRuta. Si varios choferes cubren la ruta, se pondera por sus paquetes.
  // Devuelve null si la factura no trae el desglose chofer×ruta (facturas viejas).
  const tarifaLinealRuta = (inv, rutaRaw) => {
    const filas = (inv?.resumenChoferRuta || []).filter((x) => x.ruta === rutaRaw)
    if (!filas.length) return null
    let paq = 0, suma = 0
    for (const x of filas) {
      const rate = tarifaDriver(inv, drivers, x.nombre).tarifaInd || 0
      const n = (x.individuales || 0) + (x.dobles || 0)
      paq += n; suma += rate * n
    }
    return paq > 0 ? suma / paq : null
  }

  // Base combinada: rutas de TODAS las ciudades del alcance (clave única ciudad::ruta).
  const baseMulti = useMemo(() => {
    const rutas = []; const rangosSet = new Set(); const costo = {}; const tarifaLineal = {}; let tieneDetalle = false; let ingresoIndTotal = 0
    for (const u of unidades) {
      const b = construirBase(u.inv, u.ciudad)
      const c = costoDe(u.inv, u.ciudad, b)
      if (b.tieneDetalle) tieneDetalle = true
      for (const r of b.rutas) {
        const key = `${u.ciudad}::${r.ruta}`
        rutas.push({ ...r, ruta: key, rutaNombre: r.ruta, ciudad: u.ciudad, nombreCiudad: nombreDeCiudad(u.ciudad) })
        costo[key] = c[r.ruta] || 0
        tarifaLineal[key] = tarifaLinealRuta(u.inv, r.ruta)
        ingresoIndTotal += r.ingresoInd || 0
        Object.keys(r.celdas).forEach((rg) => rangosSet.add(rg))
      }
    }
    return { rutas, rangos: ORDEN_RANGO.filter((rg) => rangosSet.has(rg)), tieneDetalle, costo, tarifaLineal, ingresoIndTotal: r2(ingresoIndTotal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadesKey, drivers])

  const ov = useMemo(() => ({ pct: pctGlobal, peso: pesoFijo, celda }), [pctGlobal, pesoFijo, celda])
  const proj = useMemo(() => proyectar({ rutas: baseMulti.rutas, rangos: baseMulti.rangos, tieneDetalle: baseMulti.tieneDetalle }, ov, baseMulti.costo), [baseMulti, ov])

  // Ganancia REAL del alcance (suma por ciudad, como Financiero) + delta por entregas.
  const real = useMemo(() => {
    let gan = 0, neto = 0, pago = 0, gastos = 0
    const porCiudad = []
    for (const u of unidades) {
      const g = gananciaRealDe(u.inv, claimsInv, drivers, managers, u.ciudad)
      gan += g.gananciaReal; neto += g.ingresoNeto; pago += g.costoChoferes; gastos += g.costoManagers
      porCiudad.push({ codigo: u.ciudad, nombre: nombreDeCiudad(u.ciudad), semana: u.inv.semana, inv: u.inv, ...g })
    }
    return { gananciaReal: r2(gan), ingresoNeto: r2(neto), pago: r2(pago), gastos: r2(gastos), porCiudad }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadesKey, claimsInv, drivers, managers])

  // Delta de entregas por ciudad (para el resumen por ciudad en modo "Todas").
  const proyCiudad = useMemo(() => real.porCiudad.map((rc) => {
    const b = construirBase(rc.inv, rc.codigo)
    const p = proyectar(b, { pct: pctGlobal }, costoDe(rc.inv, rc.codigo, b))
    const delta = r2(p.ingresoProy - p.ingresoBase)
    const ganBase = rc.gananciaReal, ganProy = r2(rc.gananciaReal + delta)
    const ingBase = p.ingresoBase, ingProy = p.ingresoProy // bruto entregas (lo que paga Gofo)
    const beMax = p.ingresoIndTotal > 0 ? -rc.gananciaReal / p.ingresoIndTotal : 0
    return { codigo: rc.codigo, nombre: rc.nombre, semana: rc.semana, tieneDetalle: b.tieneDetalle, ingresoBase: ingBase, ingresoProy: ingProy, gananciaBase: ganBase, gananciaProy: ganProy, bePctCiudad: beMax }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [real, pctGlobal])

  const resetear = () => { setPctGlobal(0); setPesoFijo({}); setCelda({}) }
  const hayCambios = pctGlobal !== 0 || Object.values(pesoFijo).some((v) => v !== '' && v != null) || Object.values(celda).some((v) => v !== '' && v != null)
  const pctTxt = `${pctGlobal > 0 ? '+' : ''}${Math.round(pctGlobal * 100)}%`
  const hayResultado = baseMulti.rutas.length > 0

  const etiquetaCiudades = ciudadesSel.length === 0 ? 'Todas las ciudades' : ciudadesSel.length === 1 ? nombreDeCiudad(ciudadesSel[0]) : `${ciudadesSel.length} ciudades`
  const toggleCiudad = (code) => { setCiudadesSel((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code])); resetear() }

  // Reprocesa una factura CONCRETA (para poder reprocesar la de cada ciudad).
  const reprocesarInv = async (inv, fileList) => {
    const files = [...(fileList || [])]
    if (!files.length || !inv) return
    setReproMsg(null); setReprocesando(true); setReproTargetId(inv.id)
    try {
      const rr = await reprocesarFactura(inv, files)
      if (rr) { setReproMsg(rr); if (rr.tipo === 'ok') await reloadInvoices() }
    } catch (err) { setReproMsg({ tipo: 'error', txt: 'No se pudo procesar: ' + err.message }) }
    finally { setReprocesando(false); setReproTargetId(null) }
  }
  const pedirArchivo = (inv) => { targetInvRef.current = inv; fileRef.current?.click() }
  const onReprocesar = (e) => { const f = e.target.files; e.target.value = ''; reprocesarInv(targetInvRef.current || invSel, f) }
  const tieneDesglose = (inv, ciudad) => ((inv?.simuladorDesglose || inv?.resumenRutaPeso) || []).some((x) => x.ciudad === ciudad)

  // Resumen REAL. El "Ingreso Gofo" mostrado es el BRUTO de ENTREGAS (lo que paga Gofo
  // por entregar = suma de precios×paquetes de todas las rutas). El neto (para la
  // ganancia real, igual que Financiero) resta los claims que Gofo descuenta.
  const entregasBruto = proj.ingresoBase          // = lo que paga Gofo (suma de rutas)
  const entregasProy = proj.ingresoProy
  const delta = r2(entregasProy - entregasBruto)
  const claimsGofo = r2(real.ingresoNeto - entregasBruto) // negativo (descuento de Gofo)
  const netoBase = real.ingresoNeto
  const netoProy = r2(real.ingresoNeto + delta)
  const gananciaBase = real.gananciaReal
  const gananciaProy = r2(real.gananciaReal + delta)
  const bePct = baseMulti.ingresoIndTotal > 0 ? -real.gananciaReal / baseMulti.ingresoIndTotal : 0
  const resumen = {
    label: ciudadesSel.length === 0 ? 'el negocio' : ciudadesSel.length === 1 ? nombreDeCiudad(ciudadUnica) : 'las ciudades elegidas',
    ingresoBase: entregasBruto, ingresoProy: entregasProy, gananciaBase, gananciaProy,
    margenBase: netoBase > 0 ? gananciaBase / netoBase : 0,
    margenProy: netoProy > 0 ? gananciaProy / netoProy : 0,
    bePct, pago: real.pago, gastos: real.gastos, claimsGofo, netoBase, netoProy,
  }
  const difIngreso = resumen.ingresoProy - resumen.ingresoBase
  const difGanancia = resumen.gananciaProy - resumen.gananciaBase
  const filas = esResumen
    ? proyCiudad.map((c) => ({ name: c.nombre, gananciaBase: c.gananciaBase, gananciaProy: c.gananciaProy, ingresoProy: c.ingresoProy }))
    : proj.rutas.map((r) => ({ name: baseMulti.rutas.find((x) => x.ruta === r.ruta)?.rutaNombre || r.ruta, gananciaBase: r.gananciaBase, gananciaProy: r.gananciaProy, ingresoProy: r.ingresoProy }))
  const recs = generado ? recomendar(resumen, filas, esResumen) : []
  const comparativo = [
    { name: 'Ingreso', Actual: Math.round(resumen.ingresoBase), Proyectado: Math.round(resumen.ingresoProy) },
    { name: 'Ganancia', Actual: Math.round(resumen.gananciaBase), Proyectado: Math.round(resumen.gananciaProy) },
  ]
  const impacto = [...filas].map((f) => ({ name: f.name, valor: Math.round(f.gananciaProy - f.gananciaBase) })).sort((a, b) => a.valor - b.valor).slice(0, 12)

  // --- Recomendación de PAGO AL DRIVER por paquete (pago lineal, no por peso) ---
  // Por ruta: cuánto paga Gofo por paquete (I/P) y hasta cuánto pagar al driver para
  // dejar el margen objetivo (I×(1−m)/P). El MÁXIMO (equilibrio) = I/P.
  const sugPagoDriver = useMemo(() => {
    const rows = baseMulti.rutas.map((r) => {
      const P = (r.individuales || 0) + (r.dobles || 0)
      const I = r.ingresoBase || 0
      const gofoPq = P > 0 ? I / P : 0
      // "Pago actual $/paq" = tarifa LINEAL del driver asignado a la ruta (su precio de
      // 0–1 lb). Si la factura no trae el desglose chofer×ruta, se estima con el costo
      // real de la ruta ÷ sus paquetes (promedio, marcado como estimado).
      const lineal = baseMulti.tarifaLineal[r.ruta]
      const exacto = lineal != null
      const actualPq = exacto ? lineal : (P > 0 ? (baseMulti.costo[r.ruta] || 0) / P : 0)
      return { key: r.ruta, ciudad: r.nombreCiudad, ruta: r.rutaNombre, P, gofoPq, actualPq, actualExacto: exacto, maxPq: gofoPq, sugPq: gofoPq * (1 - margenObj) }
    }).sort((a, b) => a.ciudad.localeCompare(b.ciudad) || String(a.ruta).localeCompare(String(b.ruta)))
    const totalP = rows.reduce((a, f) => a + f.P, 0)
    const totalI = baseMulti.rutas.reduce((a, r) => a + (r.ingresoBase || 0), 0)
    // Costo actual total = pago REAL a choferes (calcularPagos), para que el impacto en la
    // ganancia real quede exacto. La columna por ruta muestra la tarifa lineal del driver.
    const totalCosto = baseMulti.rutas.reduce((a, r) => a + (baseMulti.costo[r.ruta] || 0), 0)
    // Promedio de la tarifa lineal por paquete (lo que muestra la columna), ponderado.
    const linealFlat = totalP > 0 ? rows.reduce((a, f) => a + f.actualPq * f.P, 0) / totalP : 0
    return { rows, totalP, totalI, totalCosto, linealFlat, sugFlat: totalP > 0 ? (totalI * (1 - margenObj)) / totalP : 0, actualFlat: totalP > 0 ? totalCosto / totalP : 0 }
  }, [baseMulti, margenObj])

  // Igual que arriba pero agrupado POR DRIVER: se reparte el ingreso Gofo de cada ruta
  // entre los choferes que la cubren (proporcional a sus paquetes) y se toma su tarifa
  // lineal (precio 0–1 lb). Requiere el desglose chofer×ruta (facturas nuevas).
  const sugPorDriver = useMemo(() => {
    const rlu = {}
    for (const r of baseMulti.rutas) rlu[r.ruta] = { I: r.ingresoBase || 0, P: (r.individuales || 0) + (r.dobles || 0) }
    const acc = {}
    for (const u of unidades) {
      for (const x of (u.inv?.resumenChoferRuta || [])) {
        const info = rlu[`${u.ciudad}::${x.ruta}`]
        if (!info || info.P <= 0) continue
        const dp = (x.individuales || 0) + (x.dobles || 0)
        if (dp <= 0) continue
        const rate = tarifaDriver(u.inv, drivers, x.nombre).tarifaInd || 0
        const k = x.nombre
        if (!acc[k]) acc[k] = { P: 0, I: 0, cost: 0, ciudades: new Set() }
        acc[k].P += dp
        acc[k].I += info.I * dp / info.P
        acc[k].cost += rate * dp
        acc[k].ciudades.add(nombreDeCiudad(u.ciudad))
      }
    }
    const rows = Object.entries(acc).map(([nombre, a]) => {
      const gofoPq = a.P > 0 ? a.I / a.P : 0
      const actualPq = a.P > 0 ? a.cost / a.P : 0
      return { key: `drv::${nombre}`, ciudad: [...a.ciudades].join(', '), ruta: nombre, P: a.P, gofoPq, actualPq, actualExacto: true, maxPq: gofoPq, sugPq: gofoPq * (1 - margenObj) }
    }).sort((a, b) => String(a.ruta).localeCompare(String(b.ruta)))
    const totalP = rows.reduce((a, f) => a + f.P, 0)
    const totalI = rows.reduce((a, f) => a + f.gofoPq * f.P, 0)
    // Mismo costo real y total de paquetes que por ruta → el impacto en la ganancia es idéntico.
    const totalCosto = baseMulti.rutas.reduce((a, r) => a + (baseMulti.costo[r.ruta] || 0), 0)
    const linealFlat = totalP > 0 ? rows.reduce((a, f) => a + f.actualPq * f.P, 0) / totalP : 0
    return { rows, totalP, totalI, totalCosto, linealFlat, sugFlat: totalP > 0 ? (totalI * (1 - margenObj)) / totalP : 0, actualFlat: totalP > 0 ? totalCosto / totalP : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMulti, margenObj, drivers, unidadesKey])

  // Fuente activa según el modo elegido (por ruta o por driver).
  const fuente = modoPago === 'driver' ? sugPorDriver : sugPagoDriver

  // ESCENARIO: por fila se puede editar el Gofo $/paq (lo que Gofo paga) y el rate al
  // driver. De ahí salen el pago, el ingreso, la ganancia y el margen con los valores
  // que el usuario prueba. `gofoBase` guarda el valor original para el placeholder.
  const pagoManualKey = JSON.stringify(pagoManual)
  const gofoManualKey = JSON.stringify(gofoManual)
  const escenario = useMemo(() => {
    const rows = fuente.rows.map((f) => {
      const rawG = gofoManual[f.key]
      const gManual = rawG != null && rawG !== '' && Number.isFinite(Number(rawG))
      const gofoPq = gManual ? Math.max(0, Number(rawG)) : f.gofoPq   // Gofo $/paq efectivo
      const sugPq = gofoPq * (1 - margenObj)                          // sugerido sobre el Gofo efectivo
      const maxPq = gofoPq                                            // equilibrio = Gofo efectivo
      const raw = pagoManual[f.key]
      const manual = raw != null && raw !== '' && Number.isFinite(Number(raw))
      const rate = manual ? Math.max(0, Number(raw)) : sugPq
      const I = gofoPq * f.P              // ingreso Gofo de la fila (Gofo efectivo × paquetes)
      const pago = rate * f.P
      const gan = I - pago
      const margen = I > 0 ? gan / I : 0
      return { ...f, gofoBase: f.gofoPq, gofoPq, gManual, sugPq, maxPq, manual, rate, pago, gan, margen, I }
    })
    const totalPay = rows.reduce((a, f) => a + f.pago, 0)
    const totalIng = rows.reduce((a, f) => a + f.I, 0)      // ingreso Gofo del escenario
    return { rows, totalPay, totalIng }
  }, [fuente, pagoManualKey, gofoManualKey, margenObj])
  const hayManual = escenario.rows.some((f) => f.manual)
  const hayGofoManual = escenario.rows.some((f) => f.gManual)
  // Impacto en la GANANCIA REAL de seguir el escenario. Cambian el pago a choferes y, si
  // editaste el Gofo, también el ingreso; gastos y claims quedan fijos.
  const pagoSugTotal = r2(escenario.totalPay)
  const difPago = r2(fuente.totalCosto - pagoSugTotal)          // + = pagarías MENOS al driver
  const deltaIngreso = r2(escenario.totalIng - fuente.totalI)   // + = Gofo pagaría MÁS
  const difTotal = r2(difPago + deltaIngreso)                  // cambio total en la ganancia real
  const gananciaSiSigo = r2(real.gananciaReal + difTotal)
  const netoSiSigo = real.ingresoNeto + deltaIngreso
  const margenSiSigo = netoSiSigo > 0 ? gananciaSiSigo / netoSiSigo : 0
  const effFlat = fuente.totalP > 0 ? escenario.totalPay / fuente.totalP : 0
  const etiquetaFila = modoPago === 'driver' ? 'driver' : 'ruta'   // texto en minúscula
  const EtiquetaFila = modoPago === 'driver' ? 'Driver' : 'Ruta'   // encabezado de columna
  // Columnas de métricas que se pueden ocultar con el ojito (la ciudad depende de si hay varias).
  const COLS_PAGO = [
    { key: 'ciudad', label: 'Ciudad', disponible: variasCiudades },
    { key: 'paquetes', label: 'Paquetes', disponible: true },
    { key: 'gofo', label: 'Gofo $/paq', disponible: true },
    { key: 'actual', label: 'Pago actual $/paq', disponible: true },
    { key: 'sugerido', label: 'Sugerido $/paq', disponible: true },
    { key: 'max', label: 'Máx $/paq', disponible: true },
    { key: 'margen', label: 'Margen', disponible: true },
    { key: 'ganancia', label: 'Ganancia', disponible: true },
  ].filter((c) => c.disponible)
  const verCol = (k) => colsPago[k] !== false
  const nColsPago = 1 + COLS_PAGO.filter((c) => verCol(c.key)).length // +1 = columna de ruta/driver (fija)
  // Filtro del buscador: solo cambia las filas mostradas; totales e impacto siguen sobre TODO.
  const filasPago = buscarPago.trim()
    ? escenario.rows.filter((f) => `${f.ruta} ${f.ciudad}`.toLowerCase().includes(buscarPago.trim().toLowerCase()))
    : escenario.rows

  // --- Historial de proyecciones guardadas ---
  const proyeccionesGuardadas = [...(ajustes?.proyecciones || [])].sort((a, b) => (a.ts < b.ts ? 1 : -1))
  const fmtFechaHist = (ts) => { try { return new Date(ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) } catch { return ts } }
  const guardar = async () => {
    const sug = `${resumen.label} ${pctTxt} · ${new Date().toLocaleDateString('es')}`
    const nombre = window.prompt('Nombre de la proyección:', sug)
    if (nombre == null) return
    setGuardando(true)
    try {
      await guardarProyeccion(activeCompanyId, {
        usuario: perfil?.email || perfil?.nombre || 'usuario',
        nombre: nombre.trim() || sug,
        ciudades: ciudadesSel, facturaSimId, pctGlobal, pesoFijo, celda,
        // Pago al driver: margen objetivo, vista (ruta/driver) y los valores editados a mano.
        margenObj, modoPago, pagoManual, gofoManual,
        resumen: { label: resumen.label, ingresoBase: resumen.ingresoBase, ingresoProy: resumen.ingresoProy, gananciaBase: resumen.gananciaBase, gananciaProy: resumen.gananciaProy, margenBase: resumen.margenBase, margenProy: resumen.margenProy, pct: pctTxt, pagoEditado: hayManual, pagoEff: r2(effFlat), gananciaSiSigo: r2(gananciaSiSigo) },
      })
      await reloadAjustes()
      setReproMsg({ tipo: 'ok', txt: 'Proyección guardada en el historial.' })
    } catch (e) { setReproMsg({ tipo: 'error', txt: 'No se pudo guardar: ' + e.message }) }
    finally { setGuardando(false) }
  }
  const cargar = (p) => {
    cargarRef.current = true
    setCiudadesSel(p.ciudades || [])
    if (p.facturaSimId) setFacturaSimId(p.facturaSimId)
    setPctGlobal(p.pctGlobal || 0)
    setPesoFijo(p.pesoFijo || {})
    setCelda(p.celda || {})
    // Restaura el pago al driver: margen objetivo, vista y los "Sugerido $/paq" editados.
    if (p.margenObj != null) setMargenObj(p.margenObj)
    if (p.modoPago) setModoPago(p.modoPago)
    setPagoManual(p.pagoManual || {})
    setGofoManual(p.gofoManual || {})
    setGenerado(true)
    setVerHist(false)
  }
  const borrar = async (id) => {
    if (!window.confirm('¿Eliminar esta proyección guardada?')) return
    await borrarProyeccion(activeCompanyId, proyeccionesGuardadas, id)
    await reloadAjustes()
  }
  const exportarPagoDriver = (tipo) => {
    const porDrv = modoPago === 'driver'
    const etiquetaCol = porDrv ? 'Driver' : 'Ruta'
    const nombre = `pago_${porDrv ? 'por_driver' : 'por_ruta'}_${etiquetaCiudades}_margen${Math.round(margenObj * 100)}`.replace(/[^\w-]+/g, '_')
    const resumenRows = [
      { Concepto: 'Agrupado por', Valor: porDrv ? 'Driver' : 'Ruta' },
      { Concepto: 'Margen objetivo', Valor: `${Math.round(margenObj * 100)}%` },
      { Concepto: hayManual ? 'Rates editados a mano' : 'Rates', Valor: hayManual ? 'Sí (algunos valores manuales)' : 'Todos sugeridos' },
      { Concepto: 'Pago al driver actual ($/paq)', Valor: Number(fuente.linealFlat.toFixed(2)) },
      { Concepto: 'Pago al driver del escenario ($/paq)', Valor: Number(effFlat.toFixed(2)) },
      { Concepto: 'Ganancia real hoy', Valor: Math.round(real.gananciaReal) },
      { Concepto: 'Ganancia real con este escenario', Valor: Math.round(gananciaSiSigo) },
      ...(hayGofoManual ? [{ Concepto: 'Cambio de ingreso Gofo (editado)', Valor: Math.round(deltaIngreso) }] : []),
      { Concepto: 'Diferencia por semana', Valor: Math.round(difTotal) },
      { Concepto: 'Diferencia por mes (~4.3 sem)', Valor: Math.round(difTotal * MENSUAL) },
    ]
    // Solo se exportan las columnas visibles (ojito). La columna ruta/driver siempre va.
    if (tipo === 'excel') {
      const rows = escenario.rows.map((f) => {
        const o = {}
        if (verCol('ciudad') && variasCiudades) o.Ciudad = f.ciudad
        o[etiquetaCol] = f.ruta
        if (verCol('paquetes')) o.Paquetes = f.P
        if (verCol('gofo')) o['Gofo $/paq'] = Number(f.gofoPq.toFixed(2))
        if (verCol('actual')) o['Pago actual $/paq'] = Number(f.actualPq.toFixed(2))
        if (verCol('sugerido')) { o[`Sugerido $/paq (margen ${Math.round(margenObj * 100)}%)`] = Number(f.sugPq.toFixed(2)); o['Rate usado $/paq'] = Number(f.rate.toFixed(2)) }
        if (verCol('max')) o['Máximo $/paq (equilibrio)'] = Number(f.maxPq.toFixed(2))
        if (verCol('margen')) o['Margen'] = `${(f.margen * 100).toFixed(1)}%`
        if (verCol('ganancia')) o['Ganancia'] = Math.round(f.gan)
        return o
      })
      return exportarExcel(nombre, [
        { nombre: 'Resumen', rows: resumenRows },
        { nombre: porDrv ? 'Pago por driver' : 'Pago por ruta', rows },
      ])
    }
    const head = []
    if (verCol('ciudad') && variasCiudades) head.push('Ciudad')
    head.push(etiquetaCol)
    if (verCol('paquetes')) head.push('Paq.')
    if (verCol('gofo')) head.push('Gofo $/paq')
    if (verCol('actual')) head.push('Actual $/paq')
    if (verCol('sugerido')) head.push('Sugerido $/paq', 'Rate usado')
    if (verCol('max')) head.push('Máx $/paq')
    if (verCol('margen')) head.push('Margen')
    if (verCol('ganancia')) head.push('Ganancia')
    const body = escenario.rows.map((f) => {
      const r = []
      if (verCol('ciudad') && variasCiudades) r.push(f.ciudad)
      r.push(f.ruta)
      if (verCol('paquetes')) r.push(num(f.P))
      if (verCol('gofo')) r.push(money(f.gofoPq))
      if (verCol('actual')) r.push(money(f.actualPq))
      if (verCol('sugerido')) r.push(money(f.sugPq), money(f.rate))
      if (verCol('max')) r.push(money(f.maxPq))
      if (verCol('margen')) r.push(`${(f.margen * 100).toFixed(1)}%`)
      if (verCol('ganancia')) r.push(money(f.gan))
      return r
    })
    return exportarPDF(nombre, `Pago por paquete (${porDrv ? 'por driver' : 'por ruta'}) · margen ${pct(margenObj)}`, etiquetaCiudades, [
      { titulo: 'Impacto en la ganancia real', head: ['Concepto', 'Valor'], body: resumenRows.map((r) => [r.Concepto, typeof r.Valor === 'number' ? money(r.Valor) : r.Valor]) },
      { titulo: `Pago por paquete (lineal) por ${porDrv ? 'driver' : 'ruta'}`, head, body },
    ])
  }

  if (!esDueno) return <div>{!embed && <PageTitle>Proyección</PageTitle>}<Aviso tipo="warn">La proyección está disponible solo para el dueño.</Aviso></div>
  if (!ciudades.length) return <div>{!embed && <PageTitle>Proyección</PageTitle>}<EstadoVacio titulo="Sin facturas" texto="Carga una factura para poder simular precios." mostrarBoton={false} /></div>

  const colorCelda = (proyec, actual) => (proyec < actual - 0.001 ? 'text-rose-600 border-rose-300 dark:text-rose-400' : proyec > actual + 0.001 ? 'text-emerald-600 border-emerald-300 dark:text-emerald-400' : 'text-slate-600 border-slate-200 dark:text-slate-300')

  function exportar(tipo) {
    if (esResumen) {
      const filasX = proyCiudad.map((c) => ({ Ciudad: c.nombre, Semana: c.semana || '', 'Ingreso actual': Math.round(c.ingresoBase), 'Ingreso proyectado': Math.round(c.ingresoProy), 'Ganancia real actual': Math.round(c.gananciaBase), 'Ganancia real proyectada': Math.round(c.gananciaProy), 'Δ': Math.round(c.gananciaProy - c.gananciaBase), Equilibrio: bePctTxt(c.bePctCiudad) }))
      const nombre = `proyeccion_${etiquetaCiudades}_${pctTxt.replace('%', 'pct')}`.replace(/[^\w-]+/g, '_')
      if (tipo === 'excel') return exportarExcel(nombre, [{ nombre: 'Ciudades', rows: filasX }])
      return exportarPDF(nombre, `Proyección · ${etiquetaCiudades} (${pctTxt})`, '', [{ titulo: 'Proyección por ciudad', head: ['Ciudad', 'Semana', 'Ing. actual', 'Ing. proy.', 'Gan. actual', 'Gan. proy.', 'Δ', 'Equilibrio'], body: proyCiudad.map((c) => [c.nombre, c.semana || '', money(c.ingresoBase), money(c.ingresoProy), money(c.gananciaBase), money(c.gananciaProy), money(c.gananciaProy - c.gananciaBase), bePctTxt(c.bePctCiudad)]) }])
    }
    const filasX = proj.rutas.map((r) => { const b = baseMulti.rutas.find((x) => x.ruta === r.ruta) || {}; return { Ciudad: b.nombreCiudad || '', Ruta: b.rutaNombre || r.ruta, 'Ingreso actual': Math.round(r.ingresoBase), 'Ingreso proyectado': Math.round(r.ingresoProy), 'Ganancia (ruta) proy.': Math.round(r.gananciaProy), 'Δ ruta': Math.round(r.gananciaProy - r.gananciaBase) } })
    const nombre = `proyeccion_${etiquetaCiudades}_${pctTxt.replace('%', 'pct')}`.replace(/[^\w-]+/g, '_')
    if (tipo === 'excel') return exportarExcel(nombre, [{ nombre: 'Rutas', rows: filasX }])
    return exportarPDF(nombre, `Proyección · ${etiquetaCiudades} (${pctTxt})`, '', [{ titulo: 'Proyección por ruta', head: ['Ciudad', 'Ruta', 'Ing. actual', 'Ing. proy.', 'Gan. ruta proy.', 'Δ ruta'], body: proj.rutas.map((r) => { const b = baseMulti.rutas.find((x) => x.ruta === r.ruta) || {}; return [b.nombreCiudad || '', b.rutaNombre || r.ruta, money(r.ingresoBase), money(r.ingresoProy), money(r.gananciaProy), money(r.gananciaProy - r.gananciaBase)] }) }])
  }

  return (
    <div>
      {!embed && <PageTitle>Proyección</PageTitle>}
      <Aviso tipo="info" className="mb-4">
        <b>Simulador de precios.</b> Proyecta tu ingreso y tu <b>ganancia REAL</b> (igual que Financiero: ingreso neto − pago a choferes − gastos fijos) si Gofo cambia sus precios. Es
        <b> solo simulación</b>: no cambia ningún dato. El pago a los choferes usa la <b>tarifa real</b> y es fijo.
      </Aviso>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative" ref={cRef}>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Building2 size={13} /> Ciudad(es)</div>
            <button type="button" onClick={() => setAbreCiudades((o) => !o)} className="inline-flex min-w-[190px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Building2 size={15} strokeWidth={1.8} className="text-brand-gold" />
              <span className="flex-1 truncate text-left">{etiquetaCiudades}</span>
              <ChevronDown size={15} strokeWidth={2} className={`transition-transform ${abreCiudades ? 'rotate-180' : ''}`} />
            </button>
            {abreCiudades && (
              <div className="absolute left-0 z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <button type="button" onClick={() => { setCiudadesSel([]); resetear() }} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${ciudadesSel.length === 0 ? 'bg-brand-navy/5 font-semibold text-brand-navy dark:bg-brand-gold/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>🌎 Todas las ciudades{ciudadesSel.length === 0 && <Check size={15} strokeWidth={2.4} className="text-brand-gold" />}</button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />
                {ciudades.map((c) => {
                  const on = ciudadesSel.includes(c.codigo)
                  return (
                    <button key={c.codigo} type="button" onClick={() => toggleCiudad(c.codigo)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? 'bg-brand-navy/5 font-semibold text-brand-navy dark:bg-brand-gold/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
                      <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${on ? 'border-brand-gold bg-brand-gold text-white' : 'border-slate-300 dark:border-slate-600'}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                      <span className="truncate">{c.nombre}</span>
                    </button>
                  )
                })}
                {ciudadesSel.length >= 2 && <div className="mt-1 border-t border-slate-100 px-2.5 pt-1.5 text-[11px] text-slate-400 dark:border-slate-700/60">Editas las rutas de {ciudadesSel.length} ciudades y ves su proyección combinada.</div>}
              </div>
            )}
          </div>
          {unaCiudad && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400"><Receipt size={13} /> Factura</div>
              <Select value={facturaSimId} onChange={(e) => { setFacturaSimId(e.target.value); resetear() }} className="min-w-[220px]">
                {facturasCiudad.map((f) => <option key={f.id} value={f.id}>{f.semana || `${fFecha(f.fechaInicio)}–${fFecha(f.fechaFin)}`}</option>)}
              </Select>
            </div>
          )}
          <span className="text-xs text-slate-400">{esResumen ? `${unidades.length} ciudad(es) · factura más reciente de cada una` : `${baseMulti.rutas.length} ruta(s) · ${unidades.length} ciudad(es)`}</span>
          {unaCiudad && invSel && (baseMulti.tieneDetalle
            ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 size={12} strokeWidth={2.2} /> desglose por peso disponible</span>
                <button onClick={() => fileRef.current?.click()} disabled={reprocesando} className="text-xs text-slate-400 underline underline-offset-2 hover:text-brand-navy disabled:opacity-50 dark:hover:text-white">{reprocesando ? 'actualizando…' : 'actualizar'}</button>
              </span>
            )
            : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><Scale size={12} strokeWidth={2} /> Sin desglose — reprocesar</span>)}
          {hayResultado && (
            <div className="ml-auto flex gap-2">
              <Boton variant="ghost" onClick={() => exportar('excel')} className="px-3 py-1.5 text-xs"><FileSpreadsheet size={15} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={() => exportar('pdf')} className="px-3 py-1.5 text-xs"><FileText size={15} strokeWidth={1.8} /> PDF</Boton>
            </div>
          )}
        </div>
      </Card>

      {reproMsg && <Aviso tipo={reproMsg.tipo} className="mb-4">{reproMsg.txt}</Aviso>}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple onChange={onReprocesar} className="hidden" />
      {unaCiudad && invSel && (
        <Card className={`mb-4 p-4 ${baseMulti.tieneDetalle ? '' : 'border-l-4 border-l-amber-400'}`}>
          <div className="mb-3 flex items-center gap-2">
            <Scale size={20} strokeWidth={1.8} className={baseMulti.tieneDetalle ? 'text-emerald-500' : 'text-amber-500'} />
            <div>
              <div className="font-semibold text-brand-navy dark:text-slate-100">{baseMulti.tieneDetalle ? 'Desglose por peso disponible ✓' : 'Esta factura usa el precio PROMEDIO por ruta'}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{baseMulti.tieneDetalle ? 'Ya tienes los precios reales por peso. Puedes volver a subir el Excel para actualizarlos.' : 'Reprocesa su Excel para obtener los precios reales por peso.'} Solo alimenta el simulador — <b>no cambia pagos, ganancias ni totales</b>.</div>
            </div>
          </div>
          <div
            onClick={() => pedirArchivo(invSel)}
            onDragOver={(e) => { e.preventDefault(); setDragRepro(true) }}
            onDragLeave={() => setDragRepro(false)}
            onDrop={(e) => { e.preventDefault(); setDragRepro(false); reprocesarInv(invSel, e.dataTransfer.files) }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${dragRepro ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 hover:border-brand-gold dark:border-slate-600'}`}
          >
            {reprocesando ? <Spinner /> : <Scale size={22} strokeWidth={1.8} className="text-brand-gold" />}
            <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{reprocesando ? 'Procesando…' : (baseMulti.tieneDetalle ? 'Arrastra el Excel aquí para actualizar el desglose' : 'Arrastra el Excel de esta factura aquí')}</div>
            <div className="text-xs text-slate-400">o haz clic para elegirlo · .xlsx, .xls</div>
          </div>
        </Card>
      )}

      {/* Multi-ciudad: reprocesar la factura de CADA ciudad para tener sus precios por peso. */}
      {!esResumen && variasCiudades && (
        <Card className="mb-4 p-4">
          <div className="mb-1 flex items-center gap-2"><Scale size={18} strokeWidth={1.8} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Precios por peso · factura de cada ciudad</h3></div>
          <p className="mb-3 text-xs text-slate-400">Sube o <b>arrastra</b> el Excel de la factura de cada ciudad para tener los precios reales por peso de todas sus rutas. Solo alimenta el simulador — no cambia pagos ni totales.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unidades.map((u) => {
              const ok = tieneDesglose(u.inv, u.ciudad)
              const proc = reproTargetId === u.inv.id
              return (
                <div
                  key={u.ciudad}
                  onClick={() => pedirArchivo(u.inv)}
                  onDragOver={(e) => { e.preventDefault(); setDragCiudad(u.ciudad) }}
                  onDragLeave={() => setDragCiudad(null)}
                  onDrop={(e) => { e.preventDefault(); setDragCiudad(null); reprocesarInv(u.inv, e.dataTransfer.files) }}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-3 text-center transition ${dragCiudad === u.ciudad ? 'border-brand-gold bg-brand-gold/5' : ok ? 'border-emerald-300 hover:border-brand-gold dark:border-emerald-500/40' : 'border-amber-300 hover:border-brand-gold dark:border-amber-500/40'}`}
                >
                  <div className="font-semibold text-brand-navy dark:text-slate-100">{nombreDeCiudad(u.ciudad)}</div>
                  <div className="text-[11px] text-slate-400">{u.inv.semana || fFecha(u.inv.fechaInicio)}</div>
                  <div className="mt-1.5 text-xs">
                    {proc ? <span className="inline-flex items-center gap-1 text-slate-500"><Spinner /> Procesando…</span>
                      : ok ? <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 size={13} strokeWidth={2.2} /> desglose por peso</span>
                        : <span className="font-medium text-amber-600">sin desglose · arrastra o clic</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {!hayResultado ? (
        <EstadoVacio titulo="Sin rutas" texto="No hay rutas para simular con esta selección." mostrarBoton={false} />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-3">
            <KPI label="Ingreso Gofo (entregas)" value={money(resumen.ingresoBase)} icon={DollarSign} accent="green" sub="lo que paga Gofo" />
            {Math.abs(resumen.claimsGofo) > 0.01 && <KPI label="Claims (Gofo descuenta)" value={money(resumen.claimsGofo)} icon={AlertTriangle} accent="red" sub="rebaja de Gofo por claims" />}
            <KPI label="Pago a choferes REAL (fijo)" value={money(resumen.pago)} icon={Receipt} accent="navy" sub="tarifa real · no cambia" />
            <KPI label="Gastos fijos" value={money(resumen.gastos)} icon={Building2} accent="slate" sub="managers de la(s) ciudad(es)" />
            <KPI label="Ganancia REAL actual" value={money(resumen.gananciaBase)} icon={TrendingUp} accent="gold" sub={`margen ${pct(resumen.margenBase)}`} />
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Cuadre: Ingreso Gofo <b>{money(resumen.ingresoBase)}</b>
            {Math.abs(resumen.claimsGofo) > 0.01 && <> − claims <b>{money(-resumen.claimsGofo)}</b></>}
            {' '}− pago choferes <b>{money(resumen.pago)}</b> − gastos fijos <b>{money(resumen.gastos)}</b> = <b className="text-brand-navy dark:text-slate-200">{money(resumen.gananciaBase)}</b> de ganancia real.
          </p>

          <Card className={`mb-4 flex items-start gap-3 p-4 ${resumen.bePct > -0.05 ? 'border-l-4 border-l-rose-500' : ''}`}>
            <Target size={20} strokeWidth={1.8} className={resumen.bePct > -0.05 ? 'text-rose-500' : 'text-amber-500'} />
            <div>
              <div className="font-semibold text-brand-navy dark:text-slate-100">Punto de equilibrio de {resumen.label}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Si Gofo baja sus precios <b>más de {Math.abs(Math.round(resumen.bePct * 1000) / 10)}%</b> (sobre las primeras entregas), la <b>ganancia real</b> llega a <b>$0</b>. Ese es tu margen para negociar.</div>
            </div>
          </Card>

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
            {!esResumen && baseMulti.tieneDetalle && (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
                <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Fijar precio por rango de peso (todas las rutas):</div>
                <div className="flex flex-wrap gap-2">
                  {baseMulti.rangos.filter((rg) => rg !== '(promedio)').map((rg) => (
                    <div key={rg} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
                      <span className="text-xs font-medium text-slate-500">{rg}</span>
                      <Input type="number" step="0.01" min="0" className="w-20" placeholder="$" value={pesoFijo[rg] ?? ''} onChange={(e) => setPesoFijo((s) => ({ ...s, [rg]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Prioridad: precio de una celda &gt; precio fijo por peso &gt; % global &gt; precio actual.</p>
              </div>
            )}
            {esResumen && <p className="mt-2 text-[11px] text-slate-400">En "Todas las ciudades" se aplica el % global a la factura más reciente de cada una. Elige ciudades específicas para editar precios por ruta.</p>}
          </Card>

          {!esResumen ? (
            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Precios por ruta{variasCiudades ? ` · ${unidades.length} ciudades` : ''}</h3>
              <p className="mb-3 text-xs text-slate-400">
                El <b>precio actual</b> (grande) es el dato real de la factura de cada ciudad. Escribe el <b>precio nuevo</b>. <span className="text-rose-600">Rojo</span> = baja · <span className="text-emerald-600">verde</span> = sube. La ganancia por ruta es a nivel de entregas (los gastos fijos entran en el total).
              </p>
              <div className="scroll-thin max-h-[520px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {variasCiudades && <th className="px-2.5 py-2.5 text-left font-semibold">Ciudad</th>}
                      <th className="px-2.5 py-2.5 text-left font-semibold">Ruta</th>
                      {baseMulti.rangos.map((rg) => <th key={rg} className="px-2 py-2.5 text-center font-semibold">{rg === '(promedio)' ? 'Precio/paq' : rg}</th>)}
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Δ Ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proj.rutas.map((r) => {
                      const b = baseMulti.rutas.find((x) => x.ruta === r.ruta) || {}
                      const dI = r.ingresoProy - r.ingresoBase
                      return (
                        <tr key={r.ruta} className="border-t border-slate-100 dark:border-slate-700/50">
                          {variasCiudades && <td className="px-2.5 py-2 text-xs text-slate-500">{b.nombreCiudad}</td>}
                          <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{b.rutaNombre}</td>
                          {baseMulti.rangos.map((rg) => {
                            const c = r.celdas[rg]
                            if (!c) return <td key={rg} className="px-2 py-2 text-center text-slate-300">—</td>
                            const k = `${r.ruta}||${rg}`
                            const val = celda[k]
                            const proyec = (val != null && val !== '' && isFinite(Number(val))) ? Number(val)
                              : (baseMulti.tieneDetalle && pesoFijo[rg] != null && pesoFijo[rg] !== '' ? Number(pesoFijo[rg]) : c.precio * (1 + pctGlobal))
                            return (
                              <td key={rg} className="px-2 py-1.5 text-center">
                                <div className="text-[15px] font-bold text-brand-navy dark:text-slate-100">{money(c.precio)}</div>
                                <div className="mb-1 text-[10px] text-slate-400">{num(c.cantidad)} paq</div>
                                <input type="number" step="0.01" min="0" value={val ?? ''} placeholder={proyec.toFixed(2)} onChange={(e) => setCelda((s) => ({ ...s, [k]: e.target.value }))} className={`w-16 rounded-md border bg-transparent px-1 py-0.5 text-center text-[13px] outline-none focus:border-brand-gold ${colorCelda(proyec, c.precio)}`} />
                              </td>
                            )
                          })}
                          <td className="px-2.5 py-2 text-right">{money(r.ingresoProy)}</td>
                          <td className={`px-2.5 py-2 text-right font-semibold ${dI < -0.01 ? 'text-rose-600' : dI > 0.01 ? 'text-emerald-600' : 'text-slate-400'}`}>{dI >= 0 ? '+' : ''}{money(dI)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="mb-4 p-4">
              <div className="mb-1 flex items-center gap-2"><Globe size={17} strokeWidth={1.8} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Ganancia real por ciudad ({pctTxt})</h3></div>
              <p className="mb-3 text-xs text-slate-400">Cada ciudad con su factura más reciente. Ganancia real = ingreso neto − pago choferes − gastos fijos.</p>
              <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-2.5 py-2.5 text-left font-semibold">Ciudad</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso actual</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ingreso proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia real</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia proy.</th>
                      <th className="px-2.5 py-2.5 text-right font-semibold">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proyCiudad.map((c) => {
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
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <td className="px-2.5 py-2.5">Total</td>
                      <td className="px-2.5 py-2.5 text-right">{money(resumen.ingresoBase)}</td>
                      <td className="px-2.5 py-2.5 text-right">{money(resumen.ingresoProy)}</td>
                      <td className="px-2.5 py-2.5 text-right">{money(resumen.gananciaBase)}</td>
                      <td className={`px-2.5 py-2.5 text-right ${resumen.gananciaProy < 0 ? 'text-rose-600' : ''}`}>{money(resumen.gananciaProy)}</td>
                      <td className={`px-2.5 py-2.5 text-right ${difGanancia < -0.01 ? 'text-rose-600' : difGanancia > 0.01 ? 'text-emerald-600' : ''}`}>{difGanancia >= 0 ? '+' : ''}{money(difGanancia)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {!esResumen && sugPagoDriver.rows.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <TrendingUp size={17} strokeWidth={1.9} className="text-brand-gold" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Cuánto pagar al driver por paquete (pago lineal)</h3>
                {/* Sub-pestañas: agrupar el pago por Ruta o por Driver individual */}
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-slate-700">
                  <button onClick={() => setModoPago('ruta')} className={`px-3 py-1.5 transition ${modoPago === 'ruta' ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Por ruta</button>
                  <button onClick={() => setModoPago('driver')} className={`px-3 py-1.5 transition ${modoPago === 'driver' ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Por driver</button>
                </div>
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Margen objetivo</span>
                  <Input type="number" step="1" min="0" max="90" className="w-16" value={Math.round(margenObj * 100)} onChange={(e) => setMargenObj(Math.max(0, Math.min(0.9, (Number(e.target.value) || 0) / 100)))} />
                  <span className="text-slate-500">%</span>
                  {(hayManual || hayGofoManual) && <Boton variant="ghost" onClick={() => { setPagoManual({}); setGofoManual({}) }} className="px-2.5 py-1 text-xs"><RotateCcw size={14} strokeWidth={1.8} /> Restablecer</Boton>}
                  <div className="relative">
                    <Boton variant="ghost" onClick={() => setVerColsPago((v) => !v)} className="px-2.5 py-1 text-xs"><Eye size={14} strokeWidth={1.8} /> Columnas</Boton>
                    {verColsPago && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setVerColsPago(false)} />
                        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                          <div className="px-2 py-1 text-[11px] font-semibold uppercase text-slate-400">Mostrar en tabla y export</div>
                          {COLS_PAGO.map((c) => (
                            <button key={c.key} onClick={() => setColsPago((s) => ({ ...s, [c.key]: !verCol(c.key) }))} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700/60">
                              <span className={verCol(c.key) ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'}>{c.label}</span>
                              {verCol(c.key) ? <Eye size={15} strokeWidth={1.8} className="text-brand-gold" /> : <EyeOff size={15} strokeWidth={1.8} className="text-slate-400" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <Boton variant="ghost" onClick={() => exportarPagoDriver('excel')} className="px-2.5 py-1 text-xs"><FileSpreadsheet size={14} strokeWidth={1.8} /> Excel</Boton>
                  <Boton variant="gold" onClick={() => exportarPagoDriver('pdf')} className="px-2.5 py-1 text-xs"><FileText size={14} strokeWidth={1.8} /> PDF</Boton>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-400">Tú le pagas al driver un rate <b>fijo por paquete</b> (no por peso). Con las pestañas de arriba ves el pago agrupado <b>por ruta</b> o <b>por driver individual</b>. Puedes <b>editar tanto el "Gofo $/paq"</b> (lo que te paga Gofo) <b>como el "Sugerido $/paq"</b> (lo que le pagas al driver) a mano: el sugerido, el máximo, el margen, la ganancia y el impacto en la ganancia real se recalculan al instante. El <b>máximo</b> es el punto de equilibrio: por encima de eso, se pierde.</p>
              {/* Impacto en la ganancia real de seguir el escenario (sugerido o editado a mano) */}
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Card className="p-3">
                  <div className="text-[11px] text-slate-400">Pago al driver · hoy → {(hayManual || hayGofoManual) ? 'escenario' : 'sugerido'}</div>
                  <div className="text-base font-bold text-brand-navy dark:text-slate-100">{money(fuente.linealFlat)} → {money(effFlat)}<span className="text-xs font-normal text-slate-400"> /paq</span></div>
                  <div className="text-xs text-slate-400">total {money(fuente.totalCosto)} → {money(pagoSugTotal)}</div>
                </Card>
                <Card className={`p-3 ${difTotal > 0.01 ? 'border-l-4 border-l-emerald-500' : difTotal < -0.01 ? 'border-l-4 border-l-rose-500' : ''}`}>
                  <div className="text-[11px] text-slate-400">Ganancia REAL · hoy → con este escenario</div>
                  <div className="text-base font-bold text-brand-navy dark:text-slate-100">{money(real.gananciaReal)} → {money(gananciaSiSigo)}</div>
                  <div className="text-xs text-slate-400">margen {pct(resumen.margenBase)} → {pct(margenSiSigo)}{hayGofoManual ? ` · Gofo ${deltaIngreso >= 0 ? '+' : ''}${money(deltaIngreso)}` : ''}</div>
                </Card>
                <Card className={`p-3 ${difTotal > 0.01 ? 'border-l-4 border-l-emerald-500' : difTotal < -0.01 ? 'border-l-4 border-l-rose-500' : ''}`}>
                  <div className="text-[11px] text-slate-400">Diferencia con este escenario</div>
                  <div className={`text-base font-bold ${difTotal > 0.01 ? 'text-emerald-600' : difTotal < -0.01 ? 'text-rose-600' : 'text-slate-500'}`}>{difTotal >= 0 ? '+' : ''}{money(difTotal)}/sem</div>
                  <div className="text-xs text-slate-400">{difTotal > 0.01 ? `Ganarías ${money(difTotal * MENSUAL)} más al mes` : difTotal < -0.01 ? `Perderías ${money(-difTotal * MENSUAL)} al mes` : 'Igual que hoy'}</div>
                </Card>
              </div>
              <Aviso tipo="ok" className="mb-3">{(hayManual || hayGofoManual) ? <>Con lo que pusiste, pagarías <b>{money(effFlat)} por paquete</b> en promedio → ganancia real <b>{money(gananciaSiSigo)}</b> ({difTotal >= 0 ? '+' : ''}{money(difTotal)}/sem vs hoy). Edita el Gofo o el sugerido de cada {etiquetaFila}, o pulsa <b>Restablecer</b> para volver al original.</> : <>Sugerencia: paga <b>{money(fuente.sugFlat)} por paquete</b> (hoy ~{money(fuente.linealFlat)}) → ganancia real <b>{money(gananciaSiSigo)}</b> ({difTotal >= 0 ? '+' : ''}{money(difTotal)}/sem vs hoy). Sube o baja el <b>margen objetivo</b> o edita el Gofo/sugerido de cada {etiquetaFila} abajo para probar escenarios.</>}</Aviso>
              {/* Buscador para editar rápido un solo driver/ruta */}
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input type="text" value={buscarPago} onChange={(e) => setBuscarPago(e.target.value)} placeholder={modoPago === 'driver' ? 'Buscar driver…' : 'Buscar ruta…'} className="w-full pl-8 pr-8" />
                  {buscarPago && <button onClick={() => setBuscarPago('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Limpiar"><X size={14} strokeWidth={2} /></button>}
                </div>
                {buscarPago.trim() && <span className="text-xs text-slate-400">{filasPago.length} de {escenario.rows.length}</span>}
              </div>
              <div className="scroll-thin max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {variasCiudades && verCol('ciudad') && <th className="px-2.5 py-2.5 text-left font-semibold">Ciudad</th>}
                      <th className="px-2.5 py-2.5 text-left font-semibold">{EtiquetaFila}</th>
                      {verCol('paquetes') && <th className="px-2.5 py-2.5 text-right font-semibold">Paquetes</th>}
                      {verCol('gofo') && <th className="px-2.5 py-2.5 text-right font-semibold">Gofo $/paq <span className="font-normal text-slate-400">(editable)</span></th>}
                      {verCol('actual') && <th className="px-2.5 py-2.5 text-right font-semibold">Pago actual $/paq</th>}
                      {verCol('sugerido') && <th className="px-2.5 py-2.5 text-right font-semibold">Sugerido $/paq <span className="font-normal text-slate-400">(editable)</span></th>}
                      {verCol('max') && <th className="px-2.5 py-2.5 text-right font-semibold">Máx $/paq</th>}
                      {verCol('margen') && <th className="px-2.5 py-2.5 text-right font-semibold">Margen</th>}
                      {verCol('ganancia') && <th className="px-2.5 py-2.5 text-right font-semibold">Ganancia</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {escenario.rows.length === 0 && (
                      <tr><td colSpan={nColsPago} className="px-2.5 py-6 text-center text-sm text-slate-400">Esta factura no trae el desglose chofer×ruta necesario para agrupar por driver. Reprocesa la factura arriba, o usa la vista <b>Por ruta</b>.</td></tr>
                    )}
                    {escenario.rows.length > 0 && filasPago.length === 0 && (
                      <tr><td colSpan={nColsPago} className="px-2.5 py-6 text-center text-sm text-slate-400">Sin resultados para “{buscarPago}”. <button onClick={() => setBuscarPago('')} className="text-brand-gold underline">Limpiar</button></td></tr>
                    )}
                    {filasPago.map((f) => {
                      const over = f.rate > f.maxPq + 0.001            // paga por encima del equilibrio → pierde
                      const bajoObj = f.margen < margenObj - 0.001      // rinde menos que el margen objetivo
                      return (
                        <tr key={f.key} className={`border-t border-slate-100 dark:border-slate-700/50 ${over ? 'bg-rose-50/50 dark:bg-rose-500/5' : ''}`}>
                          {variasCiudades && verCol('ciudad') && <td className="px-2.5 py-2 text-xs text-slate-500">{f.ciudad}</td>}
                          <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{f.ruta}</td>
                          {verCol('paquetes') && <td className="px-2.5 py-2 text-right">{num(f.P)}</td>}
                          {verCol('gofo') && (
                            <td className="px-2.5 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-400">$</span>
                                <Input type="number" step="0.05" min="0" className={`w-20 text-right ${f.gManual ? 'border-brand-gold font-bold text-brand-navy dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`} value={f.gManual ? gofoManual[f.key] : ''} placeholder={f.gofoBase.toFixed(2)} onChange={(e) => { const v = e.target.value; setGofoManual((m) => { const n = { ...m }; if (v === '') delete n[f.key]; else n[f.key] = v; return n }) }} />
                              </div>
                            </td>
                          )}
                          {verCol('actual') && <td className="px-2.5 py-2 text-right font-semibold text-slate-600 dark:text-slate-300" title={f.actualExacto ? 'Tarifa lineal (0–1 lb) del driver asignado a la ruta' : 'Estimado: la factura no trae el desglose chofer×ruta; se usa el costo real ÷ paquetes'}>{f.actualExacto ? '' : '~'}{money(f.actualPq)}</td>}
                          {verCol('sugerido') && (
                            <td className="px-2.5 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-400">$</span>
                                <Input type="number" step="0.05" min="0" className={`w-20 text-right ${f.manual ? 'border-brand-gold font-bold text-brand-navy dark:text-slate-100' : 'font-bold text-emerald-600 dark:text-emerald-400'}`} value={f.manual ? pagoManual[f.key] : ''} placeholder={f.sugPq.toFixed(2)} onChange={(e) => { const v = e.target.value; setPagoManual((m) => { const n = { ...m }; if (v === '') delete n[f.key]; else n[f.key] = v; return n }) }} />
                              </div>
                            </td>
                          )}
                          {verCol('max') && <td className="px-2.5 py-2 text-right text-slate-500">{money(f.maxPq)}</td>}
                          {verCol('margen') && <td className={`px-2.5 py-2 text-right font-semibold ${f.margen < 0 ? 'text-rose-600' : bajoObj ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{(f.margen * 100).toFixed(1)}%</td>}
                          {verCol('ganancia') && <td className={`px-2.5 py-2 text-right font-semibold ${f.gan < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>{money(f.gan)}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-800/60">
                      {variasCiudades && verCol('ciudad') && <td className="px-2.5 py-2.5 text-xs text-slate-500">Total</td>}
                      <td className="px-2.5 py-2.5 text-brand-navy dark:text-slate-100">{variasCiudades && verCol('ciudad') ? '' : 'Total'}</td>
                      {verCol('paquetes') && <td className="px-2.5 py-2.5 text-right">{num(fuente.totalP)}</td>}
                      {verCol('gofo') && <td className="px-2.5 py-2.5 text-right text-slate-500">{money(fuente.totalP > 0 ? escenario.totalIng / fuente.totalP : 0)}</td>}
                      {verCol('actual') && <td className="px-2.5 py-2.5 text-right text-slate-600 dark:text-slate-300">{money(fuente.linealFlat)}</td>}
                      {verCol('sugerido') && <td className="px-2.5 py-2.5 text-right text-brand-navy dark:text-slate-100">{money(effFlat)}</td>}
                      {verCol('max') && <td className="px-2.5 py-2.5"></td>}
                      {verCol('margen') && <td className={`px-2.5 py-2.5 text-right ${escenario.totalIng - escenario.totalPay < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>{pct(escenario.totalIng > 0 ? (escenario.totalIng - escenario.totalPay) / escenario.totalIng : 0)}</td>}
                      {verCol('ganancia') && <td className={`px-2.5 py-2.5 text-right ${escenario.totalIng - escenario.totalPay < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>{money(escenario.totalIng - escenario.totalPay)}</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-400"><b>"Pago actual $/paq"</b> = la tarifa lineal (0–1 lb) del driver, o sea lo que realmente le pagas por paquete (un <b>~</b> indica que se estimó porque la factura no trae el desglose chofer×ruta). {modoPago === 'driver' ? 'En la vista por driver, el ingreso de Gofo se reparte entre los choferes de cada ruta según sus paquetes.' : ''} Edita el <b>Gofo $/paq</b> (simula que Gofo pague más/menos) o el <b>Sugerido $/paq</b> (tu pago al driver) de cualquier {etiquetaFila}; el <span className="text-amber-600">margen en ámbar</span> rinde menos que tu objetivo ({pct(margenObj)}) y en <span className="text-rose-600">rojo</span> se pierde (pagas por encima del equilibrio). "Margen" y "Ganancia" son sobre el ingreso de Gofo de ese {etiquetaFila}.</p>
            </Card>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <button onClick={() => setGenerado(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-6 py-3 text-base font-bold text-white shadow-sm transition hover:brightness-110 dark:bg-brand-gold dark:text-brand-navy">
              <Zap size={20} strokeWidth={2} /> {generado ? 'Actualizar proyección' : 'Generar proyección'}
            </button>
            <Boton variant="gold" onClick={guardar} disabled={guardando} className="px-4 py-3 text-sm">{guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.9} /> Guardar</>}</Boton>
            <Boton variant="ghost" onClick={() => setVerHist((v) => !v)} className="px-4 py-3 text-sm"><History size={16} strokeWidth={1.9} /> Historial ({proyeccionesGuardadas.length})</Boton>
          </div>

          {verHist && (
            <Card className="mb-4 p-4">
              <div className="mb-2 flex items-center gap-2"><History size={17} strokeWidth={1.8} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Historial de proyecciones ({proyeccionesGuardadas.length})</h3></div>
              {proyeccionesGuardadas.length === 0 ? (
                <div className="text-sm text-slate-400">Aún no has guardado proyecciones. Ajusta precios y dale a <b>Guardar</b> para tenerlas aquí.</div>
              ) : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">Nombre</th><th>Fecha</th><th>Alcance</th><th className="text-right">Ganancia real (actual → proy.)</th><th></th></tr></thead>
                    <tbody>
                      {proyeccionesGuardadas.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700/50">
                          <td className="py-2 font-medium text-brand-navy dark:text-slate-100">{p.nombre}</td>
                          <td className="whitespace-nowrap text-slate-500">{fmtFechaHist(p.ts)}</td>
                          <td className="text-slate-500">{p.resumen?.label} · {p.resumen?.pct}{p.resumen?.pagoEditado ? <span className="ml-1 rounded bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-gold">pago {money(p.resumen?.pagoEff)}/paq</span> : null}</td>
                          <td className="whitespace-nowrap text-right">{money(p.resumen?.gananciaBase)} → <b className={p.resumen?.gananciaProy < 0 ? 'text-rose-600' : 'text-brand-navy dark:text-slate-200'}>{money(p.resumen?.gananciaProy)}</b></td>
                          <td className="whitespace-nowrap text-right">
                            <Boton variant="ghost" onClick={() => cargar(p)} className="px-2 py-1 text-xs"><FolderOpen size={13} strokeWidth={1.8} /> Cargar</Boton>
                            {esDueno && <button onClick={() => borrar(p.id)} className="ml-1 rounded-lg px-1.5 py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Eliminar"><Trash2 size={14} strokeWidth={1.8} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {generado && (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Card className={`p-4 ${difIngreso < 0 ? 'border-l-4 border-l-rose-500' : difIngreso > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
                  <div className="text-xs text-slate-400">Ingreso Gofo · actual → proyectado</div>
                  <div className="text-lg font-bold text-brand-navy dark:text-slate-100">{money(resumen.ingresoBase)} → {money(resumen.ingresoProy)}</div>
                  <div className={`text-sm font-semibold ${difIngreso < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{difIngreso >= 0 ? '+' : ''}{money(difIngreso)}/sem</div>
                </Card>
                <Card className={`p-4 ${difGanancia < 0 ? 'border-l-4 border-l-rose-500' : difGanancia > 0 ? 'border-l-4 border-l-emerald-500' : ''}`}>
                  <div className="text-xs text-slate-400">Ganancia REAL · actual → proyectada</div>
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
                <ComparativoCard title="Ingreso y ganancia real · Actual vs Proyectado" data={comparativo} fmt={(v) => money(v)} />
                <ImpactoCard title={esResumen ? 'Impacto por ciudad (Δ ganancia)' : 'Impacto por ruta (Δ ingreso)'} subtitle="Rojo = cae · verde = sube" data={impacto} fmt={(v) => money(v)} />
              </div>

              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <GaugeCard title="Margen real actual" value={Math.max(0, resumen.margenBase)} color="#13233f" />
                <GaugeCard title="Margen real proyectado" value={Math.max(0, resumen.margenProy)} color={resumen.margenProy < 0.05 ? '#e11d48' : '#c9a24b'} />
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
}
