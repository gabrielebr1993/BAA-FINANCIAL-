// ============================================================================
// WAREHOUSE / STAFFING · Importador de HOMEBASE (timesheet PDF).
//
// Paga con el archivo de Homebase usando las POSICIONES que ya están en el
// sistema (perfil o historial del trabajador) y MIS tarifas/reglas — Homebase
// no trae posición ni reparte OT. Antes de importar muestra una vista previa:
//   · personas agrupadas por posición (grupos expandibles con flecha),
//   · tarifa y regla de cada quien (incluye flat rate),
//   · aviso de empleado NUEVO y alerta de posible PERFIL DUPLICADO,
//   · clasificar a los "sin clasificar" (se guarda en su perfil).
// Respeta tus reglas de días/horas/OT porque reusa calcularPagos.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Card, PageTitle, Boton, Aviso, Badge, Spinner, Select } from '../../components/ui'
import { Upload, ChevronDown, ChevronRight, RefreshCw, UserPlus, AlertTriangle, Users } from 'lucide-react'
import { POSICIONES_BASE, normalizarNombre, hashContenido, mapearPosicion } from './parserGofo'
import { calcularPagos, expandirTarifas } from './calculosStaff'
import { mapaUltimaPosicion, resolverFilasHomebase } from './posicionesStaff'
import {
  COL, cargar, cargarPor, auditarStaff, escribirEnLotes, refDoc, resolverWorker,
  idRegistro, serverTimestamp, arrayUnion,
} from './datosStaff'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const horas = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`
const SIN = '__sin__'

export default function WhHomebase({ user }) {
  const [bd, setBd] = useState(null)
  const [res, setRes] = useState(null) // { periodo, personas, avisos, numPaginas }
  const [archivoNombre, setArchivoNombre] = useState('')
  const [trabajando, setTrabajando] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  // decisiones locales previas a importar:
  const [clasif, setClasif] = useState({}) // nombreNorm → posicion elegida
  const [dup, setDup] = useState({}) // nombreNorm → 'same' | 'other'
  const [abiertos, setAbiertos] = useState({}) // posicion → bool

  const recargarBd = async () => {
    const [periodos, tarifas, workers, configs, gruposLista, registros] = await Promise.all([
      cargar(COL.periodos), cargar(COL.tarifas), cargar(COL.workers), cargar(COL.config), cargar(COL.grupos), cargar(COL.registros),
    ])
    const posiciones = configs.find((c) => c.id === 'posiciones')?.mapa || POSICIONES_BASE
    const reglas = configs.find((c) => c.id === 'reglas') || { reglaOT: 'gofo', umbralSemanal: 40 }
    setBd({
      periodos: Object.fromEntries(periodos.map((p) => [p.id, p])),
      tarifas: expandirTarifas(Object.fromEntries(tarifas.map((t) => [t.id, t])), posiciones),
      workers, posiciones, reglas,
      grupos: Object.fromEntries(gruposLista.map((g) => [g.id, g])),
      ultima: mapaUltimaPosicion(registros),
    })
  }
  useEffect(() => { recargarBd() }, [])

  const alArchivo = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) procesar(f) }

  const procesar = async (f) => {
    if (!f || !bd) return
    if (!/\.pdf$/i.test(f.name)) { setMensaje({ tipo: 'error', texto: `"${f.name}" no es un PDF. Sube el timesheet de Homebase en PDF.` }); return }
    setTrabajando('analizando'); setMensaje(null); setClasif({}); setDup({})
    try {
      // pdfjs (grande) se carga solo al subir un PDF, no al abrir el módulo
      const { analizarPdfHomebase } = await import('./pdfHomebase')
      const r = await analizarPdfHomebase(await f.arrayBuffer())
      if (!r.personas.length) { setMensaje({ tipo: 'error', texto: 'No encontré personas en el PDF. ¿Es el timesheet de Homebase?' }); setTrabajando(''); return }
      setRes(r); setArchivoNombre(f.name)
      await auditarStaff('homebase_analizado', `${f.name}: ${r.personas.length} personas, ${r.numPaginas} págs`)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo leer el PDF: ' + (err.message || err) })
    } finally { setTrabajando('') }
  }

  // Puestos para clasificar, en forma CANÓNICA (legible): los de chino y las
  // variantes se mapean a su nombre en inglés y se de-duplican (nada de dos
  // "Forklift" ni 分拣工 sueltos en el menú).
  const puestos = useMemo(() => {
    if (!bd) return []
    const map = bd.posiciones || {}
    const s = new Set()
    const add = (raw) => { const m = mapearPosicion(raw, map); if (m) s.add(m) }
    Object.values(map).forEach((v) => s.add(v))
    Object.keys(bd.tarifas || {}).forEach(add)
    bd.workers.forEach((w) => { if (w.posicion) add(w.posicion) })
    Object.values(bd.ultima?.porId || {}).forEach(add)
    return [...s].filter((x) => x && x !== SIN).sort()
  }, [bd])

  const workersMap = useMemo(() => (bd ? Object.fromEntries(bd.workers.flatMap((w) => [[w.nombreNorm, w], ...(w.alias || []).map((a) => [a, w])])) : {}), [bd])

  // Filas con posición del sistema + decisiones locales (clasificar / duplicado).
  const filas = useMemo(() => {
    if (!bd || !res) return []
    const base = resolverFilasHomebase(res.personas, bd.workers, bd.ultima)
    return base.map((f) => {
      const pos = clasif[f.nombreNorm] != null ? clasif[f.nombreNorm] : f.posicion
      const esMismo = dup[f.nombreNorm] === 'same' && f.posibleDuplicadoDe
      return {
        ...f,
        posicion: pos === SIN ? '' : pos,
        posicionFuente: clasif[f.nombreNorm] != null && clasif[f.nombreNorm] !== SIN ? 'clasificado' : f.posicionFuente,
        workerId: esMismo ? f.posibleDuplicadoDe : f.workerId,
        nuevo: esMismo ? false : f.nuevo,
      }
    })
  }, [bd, res, clasif, dup])

  const pagos = useMemo(() => {
    if (!bd || !filas.length) return []
    return calcularPagos(filas, bd.tarifas, workersMap, bd.reglas, res?.periodo?.fin, bd.grupos)
      .map((p, i) => ({ ...p, ...filas[i] })) // conserva nuevo/dup/fuente
  }, [bd, filas, workersMap, res])

  // Agrupar por posición (sin clasificar al final).
  const grupos = useMemo(() => {
    const m = {}
    for (const p of pagos) {
      const k = p.posicion || SIN
      if (!m[k]) m[k] = { posicion: k, gente: [], horas: 0, pago: 0 }
      m[k].gente.push(p); m[k].horas += p.horasTotal || 0; m[k].pago += p.miPago || 0
    }
    return Object.values(m).sort((a, b) => (a.posicion === SIN ? 1 : b.posicion === SIN ? -1 : a.posicion.localeCompare(b.posicion)))
  }, [pagos])

  const nNuevos = pagos.filter((p) => p.nuevo).length
  const nSin = pagos.filter((p) => !p.posicion).length
  const nDup = pagos.filter((p) => p.posibleDuplicadoDe && !dup[p.nombreNorm]).length
  const totalHoras = pagos.reduce((a, p) => a + (p.horasTotal || 0), 0)
  const totalPago = pagos.reduce((a, p) => a + (p.miPago || 0), 0)

  const reglaDe = (p) => {
    const w = workersMap[p.nombreNorm]
    const g = w && w.grupoId ? bd.grupos[w.grupoId] : null
    const regla = g && g.reglaOT ? g.reglaOT : bd.reglas.reglaOT
    const umbral = g && g.umbralSemanal ? g.umbralSemanal : bd.reglas.umbralSemanal
    if (!p.pendienteTarifa && p.miTarifaOT === p.miTarifaReg) return 'flat rate'
    return regla === 'semanal' ? `OT semanal ${umbral}h` : 'OT según Gofo'
  }
  const tarifaDe = (p) => {
    if (p.pendienteTarifa) return null
    const ot = p.miTarifaOT === p.miTarifaReg ? 'OT flat (= regular)' : `OT ${dinero(p.miTarifaOT)}`
    return `${dinero(p.miTarifaReg)}/h · ${ot}`
  }

  const periodoId = res?.periodo ? `hb_${res.periodo.inicio}__${res.periodo.fin}` : null
  const huella = useMemo(() => (res ? hashContenido(pagos.map((p) => [p.nombreNorm, p.horasTotal, p.posicion])) : ''), [res, pagos])
  const yaImportado = periodoId && bd?.periodos[periodoId]
  const sinTarifa = [...new Set(pagos.filter((p) => p.pendienteTarifa).map((p) => p.posicion))]

  const importar = async () => {
    if (!periodoId) return
    setTrabajando('importar'); setMensaje(null)
    try {
      const ops = []
      const nuevos = {}
      const idDe = {}
      for (const p of pagos) {
        if (idDe[p.nombreNorm]) continue
        const r = resolverWorker(p.nombre, [...bd.workers, ...Object.values(nuevos)])
        const id = dup[p.nombreNorm] === 'same' && p.posibleDuplicadoDe ? p.posibleDuplicadoDe : r.id
        idDe[p.nombreNorm] = id
        const posElegida = clasif[p.nombreNorm] && clasif[p.nombreNorm] !== SIN ? clasif[p.nombreNorm] : null
        if (dup[p.nombreNorm] === 'same' && p.posibleDuplicadoDe) {
          // unir al perfil existente: su nombre nuevo queda como alias
          ops.push({ ref: refDoc(COL.workers, p.posibleDuplicadoDe), merge: true, data: { alias: arrayUnion(p.nombreNorm), ...(posElegida ? { posicion: posElegida } : {}) } })
        } else if (r.nuevo && !nuevos[id]) {
          nuevos[id] = { id, nombre: p.nombre, nombreNorm: p.nombreNorm, alias: [] }
          ops.push({
            ref: refDoc(COL.workers, id), merge: true,
            data: {
              nombre: p.nombre, nombreNorm: p.nombreNorm, alias: [],
              creadoEn: serverTimestamp(), creadoPor: user.email, origenAlta: 'homebase',
              ...(posElegida ? { posicion: posElegida } : {}),
              ...(r.posibleDuplicadoDe ? { posibleDuplicadoDe: r.posibleDuplicadoDe } : {}),
            },
          })
        } else if (posElegida) {
          // existente al que clasificaste: fija su posición en el perfil
          ops.push({ ref: refDoc(COL.workers, id), merge: true, data: { posicion: posElegida } })
        }
      }
      // reemplazar registros previos de este período (reimportación segura)
      if (yaImportado) {
        const viejos = await cargarPor(COL.registros, 'periodoId', periodoId)
        for (const v of viejos) ops.push({ ref: refDoc(COL.registros, v.id), borrar: true })
      }
      for (const p of pagos) {
        ops.push({
          ref: refDoc(COL.registros, idRegistro(periodoId, p)),
          data: {
            periodoId, inicio: res.periodo.inicio, fin: res.periodo.fin, cliente: 'Homebase',
            workerId: idDe[p.nombreNorm], nombre: p.nombre, nombreNorm: p.nombreNorm,
            posicion: p.posicion || '', posicionFuente: p.posicionFuente || '',
            dias: p.dias, horasTotal: p.horasTotal, horasReg: p.miHorasReg, horasOT: p.miHorasOT,
            wageHomebase: p.wageHomebase || null, roleArchivo: p.roleArchivo || '',
            miHorasReg: p.miHorasReg, miHorasOT: p.miHorasOT,
            miTarifaReg: p.miTarifaReg, miTarifaOT: p.miTarifaOT, miPago: p.miPago,
            pendienteTarifa: !!p.pendienteTarifa, origenTarifa: p.origenTarifa || null,
            origen: { archivo: archivoNombre, fuente: 'homebase', fila: p.fila },
          },
        })
      }
      const previo = bd.periodos[periodoId]
      ops.push({
        ref: refDoc(COL.periodos, periodoId), merge: true,
        data: {
          cliente: 'Homebase', inicio: res.periodo.inicio, fin: res.periodo.fin,
          personas: [...new Set(pagos.map((p) => p.nombreNorm))],
          totales: { personas: new Set(pagos.map((p) => p.nombreNorm)).size, horas: Math.round(totalHoras * 100) / 100, pago: Math.round(totalPago * 100) / 100 },
          huella, estado: 'importado', archivo: archivoNombre,
          importadoEn: serverTimestamp(), importadoPor: user.email,
          ...(previo ? { versiones: [...(previo.versiones || []), { huellaAnterior: previo.huella, fecha: new Date().toISOString(), por: user.email }] } : {}),
        },
      })
      await escribirEnLotes(ops)
      await auditarStaff('homebase_importado', `${periodoId} desde ${archivoNombre}: ${pagos.length} registros, pago ${dinero(totalPago)}`)
      setMensaje({ tipo: 'ok', texto: `Importado ${res.periodo.inicio} → ${res.periodo.fin}: ${pagos.length} personas, pago total ${dinero(totalPago)}.` })
      await recargarBd()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'La importación no se confirmó (puedes reintentar sin duplicar): ' + (err.message || err) })
    } finally { setTrabajando('') }
  }

  if (!bd) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando…</div>

  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={recargarBd}><RefreshCw size={14} /> Recargar</Boton>}>Homebase · Pagar con tu timesheet</PageTitle>
      <Aviso tipo="info" className="mb-4">
        Sube el <b>timesheet de Homebase (PDF)</b>. Cada persona se paga con <b>su posición del sistema</b> (perfil o historial) y <b>tus tarifas y reglas</b> — Homebase no trae posición. Revisa la vista previa y clasifica a los que falten <b>antes</b> de importar.
      </Aviso>

      <div
        className={`mb-4 rounded-2xl border-2 border-dashed p-5 text-center shadow-card transition ${arrastrando ? 'border-brand-gold bg-amber-50/70 dark:bg-amber-500/10' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) procesar(f) }}
      >
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          <Upload size={15} /> {trabajando === 'analizando' ? 'Leyendo PDF…' : 'Subir timesheet de Homebase (.pdf)'}
          <input type="file" accept=".pdf" className="hidden" onChange={alArchivo} disabled={trabajando !== ''} />
        </label>
        <div className="mt-2 text-xs text-slate-400">{arrastrando ? '¡Suéltalo aquí!' : 'o arrastra el PDF y suéltalo aquí'}</div>
        {archivoNombre && <div className="mt-1 text-xs text-slate-400">{archivoNombre}{res?.numPaginas ? ` · ${res.numPaginas} págs` : ''}</div>}
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} className="mb-4">{mensaje.texto}</Aviso>}

      {res && (
        <>
          {res.periodo && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{res.periodo.inicio} → {res.periodo.fin}</span>
              {yaImportado && <Badge color="gold">Ya importado antes · reimportar lo reemplaza</Badge>}
            </div>
          )}

          {/* resumen */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResumenTile n={pagos.length} l="Personas" destacado />
            <ResumenTile n={Math.round(totalHoras)} l="Horas totales" />
            <ResumenTile n={nNuevos} l="Empleados nuevos" verde />
            <ResumenTile n={nSin} l="Sin clasificar" ambar={nSin > 0} />
          </div>

          {res.avisos?.length > 0 && (
            <Aviso tipo="warn" className="mb-3"><b>Observaciones del lector:</b><ul className="mt-1 list-disc pl-5">{res.avisos.slice(0, 6).map((a, i) => <li key={i}>{a}</li>)}</ul></Aviso>
          )}
          {nDup > 0 && (
            <Aviso tipo="warn" className="mb-3"><AlertTriangle size={14} className="mb-0.5 mr-1 inline" /><b>{nDup} posible(s) perfil(es) duplicado(s):</b> hay nombres parecidos a perfiles que ya existen. Resuélvelos abajo para no crear perfiles dobles.</Aviso>
          )}

          {/* grupos por posición */}
          <div className="space-y-2">
            {grupos.map((g) => {
              const abierto = abiertos[g.posicion] ?? (g.posicion === SIN)
              const esSin = g.posicion === SIN
              return (
                <Card key={g.posicion} className={`overflow-hidden p-0 ${esSin ? 'border-amber-300 dark:border-amber-500/40' : ''}`}>
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => setAbiertos({ ...abiertos, [g.posicion]: !abierto })}>
                    {abierto ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                    <span className={`inline-block h-3 w-3 rounded ${esSin ? 'bg-amber-400' : 'bg-brand-gold'}`} />
                    <span className="font-bold text-brand-navy dark:text-slate-100">{esSin ? 'Sin clasificar' : g.posicion}</span>
                    <span className="font-mono text-sm font-semibold text-slate-400">{g.gente.length}</span>
                    <span className="font-mono text-xs text-slate-400">· {horas(g.horas)}</span>
                    <span className="ml-auto font-mono text-sm font-semibold text-brand-navy dark:text-slate-100">{dinero(g.pago)}</span>
                  </button>
                  {abierto && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      {g.gente.map((p, i) => (
                        <PersonaRow key={p.nombreNorm + i} p={p} esSin={esSin} puestos={puestos}
                          tarifa={tarifaDe(p)} regla={reglaDe(p)}
                          clasifValor={clasif[p.nombreNorm]} dupValor={dup[p.nombreNorm]}
                          onClasificar={(v) => setClasif({ ...clasif, [p.nombreNorm]: v })}
                          onDup={(v) => setDup({ ...dup, [p.nombreNorm]: v })}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {sinTarifa.length > 0 && (
            <Aviso tipo="warn" className="mt-3">
              <b>Falta tu tarifa para:</b> {sinTarifa.join(', ')}. Configúralas en <b>Warehouse · Tarifas</b> y recarga; esas personas no se pueden pagar hasta tener tarifa.
            </Aviso>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Boton variant="gold" disabled={trabajando === 'importar' || nSin > 0} onClick={importar}>
              {trabajando === 'importar' ? <Spinner /> : `Importar y pagar · ${dinero(totalPago)}`}
            </Boton>
            {nSin > 0 && <span className="text-xs text-amber-600 dark:text-amber-400">Clasifica primero a las {nSin} persona(s) sin posición.</span>}
            <span className="ml-auto text-xs text-slate-400">Importar no emite cheques; registra horas y pago calculado.</span>
          </div>
        </>
      )}
    </div>
  )
}

function ResumenTile({ n, l, destacado, verde, ambar }) {
  const cls = destacado ? 'bg-amber-50 dark:bg-amber-500/10' : verde ? 'bg-emerald-50 dark:bg-emerald-500/10' : ambar ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-surface-card dark:bg-surface-dark-card'
  const numCls = destacado ? 'text-brand-gold' : verde ? 'text-emerald-600 dark:text-emerald-400' : ambar ? 'text-amber-600 dark:text-amber-400' : 'text-brand-navy dark:text-slate-100'
  return (
    <div className={`rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${cls}`}>
      <div className={`font-mono text-2xl font-extrabold ${numCls}`}>{n}</div>
      <div className="text-[11px] font-semibold text-slate-500">{l}</div>
    </div>
  )
}

function PersonaRow({ p, esSin, puestos, tarifa, regla, clasifValor, dupValor, onClasificar, onDup }) {
  const resuelto = !!dupValor
  return (
    <div className="border-b border-slate-100 px-4 py-2.5 last:border-0 dark:border-slate-800">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-navy dark:text-slate-100">{p.nombre}</span>
            {p.nuevo && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">nuevo</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {p.posicionFuente === 'perfil' && 'posición de su perfil'}
            {p.posicionFuente === 'historial' && 'posición de su historial'}
            {p.posicionFuente === 'clasificado' && <span className="text-blue-600 dark:text-blue-400">clasificado ahora</span>}
            {!p.posicionFuente && !esSin && 'posición del sistema'}
            {esSin && (p.nuevo ? 'no está en tu sistema' : 'tiene perfil, nunca tuvo puesto')}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {tarifa
              ? <span className="rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{tarifa}</span>
              : <span className="rounded-md bg-rose-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">sin tarifa aún</span>}
            <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">{regla}</span>
          </div>
        </div>
        {esSin ? (
          <Select className="w-40" value={clasifValor || ''} onChange={(e) => onClasificar(e.target.value)}>
            <option value="">Clasificar…</option>
            {puestos.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        ) : (
          <div className="text-right font-mono text-sm">
            <div className="font-semibold text-brand-navy dark:text-slate-100">{horas(p.horasTotal)}</div>
            <div className="text-xs text-slate-400">{dinero(p.miPago)}</div>
          </div>
        )}
      </div>
      {p.posibleDuplicadoDe && (
        <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10 ${resuelto ? 'opacity-60' : ''}`}>
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">Se parece a <b className="text-amber-700 dark:text-amber-300">{p.nombreDuplicado}</b> que ya existe. ¿Es la misma persona? Así evitas un perfil doble.</span>
          {resuelto
            ? <Badge color={dupValor === 'same' ? 'green' : 'slate'}>{dupValor === 'same' ? 'unida al perfil' : 'es otra persona'}</Badge>
            : <div className="flex gap-1.5">
              <button className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white" onClick={() => onDup('same')}><Users size={11} className="mb-0.5 mr-1 inline" />Es la misma</button>
              <button className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-slate-600" onClick={() => onDup('other')}><UserPlus size={11} className="mb-0.5 mr-1 inline" />Es otra</button>
            </div>}
        </div>
      )}
    </div>
  )
}
