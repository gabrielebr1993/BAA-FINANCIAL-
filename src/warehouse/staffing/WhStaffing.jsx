// ============================================================================
// WAREHOUSE / STAFFING · Importador del reporte semanal de GOFO.
//
// Flujo: subir libro → análisis local (parserGofo) → vista previa por período
// (personas, posiciones, horas, tarifas, importes, ajustes y observaciones) →
// confirmar importación SOLO de períodos definitivos, completos y nuevos.
// · Pestañas provisionales (Shift/Sheet N) y auxiliares se omiten y se listan.
// · Períodos ya importados sin cambios se omiten (huella de contenido).
// · Períodos con cambios muestran las diferencias y requieren aprobación.
// · Importar NO significa que Gofo pagó ni que yo pagué al trabajador.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../../components/ui'
import { Upload, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { analizarLibro, POSICIONES_BASE, normalizarNombre } from './parserGofo'
import { calcularPagos, expandirTarifas } from './calculosStaff'
import {
  COL, cargar, cargarPor, auditarStaff, escribirEnLotes, refDoc, resolverWorker, idRegistro, serverTimestamp, setDoc,
} from './datosStaff'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WhStaffing({ user }) {
  const [bd, setBd] = useState(null) // { periodos:{id→doc}, tarifas:{pos→doc}, workers:[], config }
  const [analisis, setAnalisis] = useState(null)
  const [archivoNombre, setArchivoNombre] = useState('')
  const [trabajando, setTrabajando] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)

  const recargarBd = async () => {
    const [periodos, tarifas, workers, configs, gruposLista] = await Promise.all([
      cargar(COL.periodos), cargar(COL.tarifas), cargar(COL.workers), cargar(COL.config), cargar(COL.grupos),
    ])
    const posiciones = configs.find((c) => c.id === 'posiciones')?.mapa || POSICIONES_BASE
    const reglas = configs.find((c) => c.id === 'reglas') || { reglaOT: 'gofo', umbralSemanal: 40 }
    setBd({
      periodos: Object.fromEntries(periodos.map((p) => [p.id, p])),
      // con alias del mapeo: tarifa guardada como 分拣工 sirve para Sorter y viceversa
      tarifas: expandirTarifas(Object.fromEntries(tarifas.map((t) => [t.id, t])), posiciones),
      workers,
      posiciones,
      reglas,
      grupos: Object.fromEntries(gruposLista.map((g) => [g.id, g])),
    })
  }
  useEffect(() => { recargarBd() }, [])

  const alArchivo = (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (f) procesarArchivo(f)
  }

  // Procesa el libro (viene del botón o de arrastrar y soltar).
  const procesarArchivo = async (f) => {
    if (!f || !bd) return
    if (!/\.(xlsx|xls)$/i.test(f.name)) { setMensaje({ tipo: 'error', texto: `"${f.name}" no es un Excel (.xlsx o .xls).` }); return }
    setTrabajando('analizando')
    setMensaje(null)
    try {
      const data = await f.arrayBuffer()
      // sheetStubs: las fórmulas SIN resultado guardado llegan como stubs y el
      // parser las evalúa (nunca las interpreta como cero).
      const wb = XLSX.read(data, { cellFormula: true, cellDates: true, sheetStubs: true })
      const r = analizarLibro(wb, { posiciones: bd.posiciones })
      setAnalisis(r)
      setArchivoNombre(f.name)
      await auditarStaff('staffing_analizado', `${f.name}: ${r.periodos.length} períodos, ${r.omitidas.length} pestañas omitidas`)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo leer el archivo: ' + (err.message || err) })
    } finally { setTrabajando('') }
  }

  // Categoría de cada período frente a lo que ya existe en la base.
  const categorizar = (p) => {
    if (p.estado === 'pendiente') return 'incompleto'
    const existente = bd.periodos[p.idPeriodo]
    if (!existente) return 'nuevo'
    if (existente.huella === p.huella) return 'ya'
    return 'cambios'
  }

  const importar = async (p, esActualizacion) => {
    setTrabajando(p.idPeriodo)
    setMensaje(null)
    try {
      // 1) pagos con MIS tarifas vigentes
      const workersMap = Object.fromEntries(bd.workers.flatMap((w) => [[w.nombreNorm, w], ...(w.alias || []).map((a) => [a, w])]))
      const pagos = calcularPagos(p.filas, bd.tarifas, workersMap, bd.reglas, p.fin, bd.grupos)
      // 2) perfiles: crear los que falten / reutilizar existentes (nunca duplicar)
      // Los IDs de empleado (工号) de la asistencia del MISMO archivo se
      // aplican solos: el perfil nuevo nace con su ID, el existente sin ID lo
      // recibe, y un ID distinto al guardado se marca para revisar.
      const idsPorNombre = {}
      for (const x of (analisis?.idsEmpleado || [])) idsPorNombre[x.nombreNorm] = x
      const ops = []
      const nuevosWorkers = {}
      const workerIdDe = {}
      const idsTratados = new Set()
      for (const fila of pagos) {
        if (workerIdDe[fila.nombreNorm]) continue
        const res = resolverWorker(fila.nombre, [...bd.workers, ...Object.values(nuevosWorkers)])
        workerIdDe[fila.nombreNorm] = res.id
        const infoId = idsPorNombre[fila.nombreNorm]
        if (res.nuevo && !nuevosWorkers[res.id]) {
          nuevosWorkers[res.id] = { id: res.id, nombre: fila.nombre, nombreNorm: fila.nombreNorm, alias: [] }
          ops.push({
            ref: refDoc(COL.workers, res.id),
            merge: true,
            data: {
              nombre: fila.nombre, nombreNorm: fila.nombreNorm, alias: [],
              creadoEn: serverTimestamp(), creadoPor: user.email,
              ...(res.posibleDuplicadoDe ? { posibleDuplicadoDe: res.posibleDuplicadoDe } : {}),
              ...(infoId ? { idEmpleado: infoId.idEmpleado, idEmpleadoFuente: `asistencia ${infoId.hoja}` } : {}),
            },
          })
        } else if (!res.nuevo && infoId && !idsTratados.has(res.id)) {
          idsTratados.add(res.id)
          const w = bd.workers.find((ww) => ww.id === res.id)
          if (w && !w.idEmpleado) {
            ops.push({ ref: refDoc(COL.workers, res.id), merge: true, data: { idEmpleado: infoId.idEmpleado, idEmpleadoFuente: `asistencia ${infoId.hoja}` } })
          } else if (w && w.idEmpleado !== infoId.idEmpleado) {
            ops.push({ ref: refDoc(COL.workers, res.id), merge: true, data: { idConflicto: `${w.idEmpleado} vs ${infoId.idEmpleado} (${infoId.hoja})`, revisarId: true } })
          }
        }
      }
      // 3) si es actualización aprobada: borrar los registros/ajustes anteriores
      if (esActualizacion) {
        const [viejos, viejosAj] = await Promise.all([
          cargarPor(COL.registros, 'periodoId', p.idPeriodo),
          cargarPor(COL.ajustes, 'periodoAplicaId', p.idPeriodo),
        ])
        for (const v of viejos) ops.push({ ref: refDoc(COL.registros, v.id), borrar: true })
        for (const v of viejosAj) ops.push({ ref: refDoc(COL.ajustes, v.id), borrar: true })
      }
      // 4) registros (id determinista → reintentos sin duplicados)
      for (const fila of pagos) {
        ops.push({
          ref: refDoc(COL.registros, idRegistro(p.idPeriodo, fila)),
          data: {
            periodoId: p.idPeriodo, inicio: p.inicio, fin: p.fin,
            workerId: workerIdDe[fila.nombreNorm],
            nombre: fila.nombre, nombreNorm: fila.nombreNorm,
            estadoGofo: fila.estado || '', agencia: fila.agencia || '', warehouse: fila.warehouse || '',
            posicion: fila.posicion || '', posicionRaw: fila.posicionRaw || '',
            dias: fila.dias, horasTotal: fila.horasTotal, horasReg: fila.horasReg, horasOT: fila.horasOT,
            tarifaGofoReg: fila.tarifaGofoReg, tarifaGofoOT: fila.tarifaGofoOT,
            importeGofoReg: fila.importeGofoReg, importeGofoOT: fila.importeGofoOT, importeGofo: fila.importeGofo,
            miHorasReg: fila.miHorasReg, miHorasOT: fila.miHorasOT,
            miTarifaReg: fila.miTarifaReg, miTarifaOT: fila.miTarifaOT, miPago: fila.miPago,
            pendienteTarifa: !!fila.pendienteTarifa, origenTarifa: fila.origenTarifa || null,
            origen: { archivo: archivoNombre, hoja: p.hoja, fila: fila.fila },
          },
        })
      }
      // 5) ajustes POR SEPARADO (nunca dentro del detalle)
      p.ajustes.forEach((aj, i) => {
        const norm = aj.personaRaw ? normalizarNombre(aj.personaRaw) : null
        ops.push({
          ref: refDoc(COL.ajustes, `${p.idPeriodo}__aj${i}_${aj.origen.fila}`),
          data: {
            periodoAplicaId: p.idPeriodo, concepto: aj.concepto, importe: aj.importe,
            periodoOrigenTexto: aj.periodoOrigenTexto || null,
            personaRaw: aj.personaRaw || null, workerId: norm ? (workerIdDe[norm] || null) : null,
            estado: aj.personaRaw || aj.periodoOrigenTexto ? 'aplicado' : 'revision',
            origen: { archivo: archivoNombre, ...aj.origen },
          },
        })
      })
      // 6) confirmación AL FINAL: el período solo queda importado si todo lo
      //    anterior se escribió (reintento = mismos ids, cero duplicados)
      const previo = bd.periodos[p.idPeriodo]
      ops.push({
        ref: refDoc(COL.periodos, p.idPeriodo),
        data: {
          cliente: 'Gofo', inicio: p.inicio, fin: p.fin, hoja: p.hoja,
          agencias: p.agencias, warehouses: p.warehouses, posiciones: p.posiciones,
          personas: [...new Set(pagos.map((x) => x.nombreNorm))],
          totales: p.totales, avisos: p.avisos, huella: p.huella,
          estado: 'importado',
          archivo: archivoNombre,
          importadoEn: serverTimestamp(), importadoPor: user.email,
          ...(esActualizacion && previo ? { versiones: [...(previo.versiones || []), { huellaAnterior: previo.huella, fecha: new Date().toISOString(), por: user.email }] } : {}),
        },
      })
      await escribirEnLotes(ops)
      await auditarStaff(esActualizacion ? 'staffing_periodo_actualizado' : 'staffing_periodo_importado', `${p.idPeriodo} (${p.hoja}) desde ${archivoNombre}: ${pagos.length} registros, ${p.ajustes.length} ajustes, ingreso ${dinero(p.totales.ingresoGofo)}`)
      setMensaje({ tipo: 'ok', texto: `Período ${p.inicio} a ${p.fin} ${esActualizacion ? 'actualizado' : 'importado'}: ${pagos.length} registros y ${p.ajustes.length} ajustes.` })
      await recargarBd()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'La importación no se confirmó (puedes reintentar sin riesgo de duplicados): ' + (err.message || err) })
    } finally { setTrabajando('') }
  }

  const aplicarIds = async () => {
    if (!analisis || !analisis.idsEmpleado) return
    setTrabajando('ids')
    try {
      const ops = []
      let aplicados = 0, conflictos = 0, sinPerfil = 0
      for (const x of analisis.idsEmpleado) {
        const w = bd.workers.find((ww) => ww.nombreNorm === x.nombreNorm || (ww.alias || []).includes(x.nombreNorm))
        if (!w) { sinPerfil++; continue } // de la asistencia NO se crean perfiles
        if (w.idEmpleado && w.idEmpleado !== x.idEmpleado) {
          conflictos++
          ops.push({ ref: refDoc(COL.workers, w.id), merge: true, data: { idConflicto: `${w.idEmpleado} vs ${x.idEmpleado} (${x.hoja})`, revisarId: true } })
          continue
        }
        if (!w.idEmpleado) {
          aplicados++
          ops.push({ ref: refDoc(COL.workers, w.id), merge: true, data: { idEmpleado: x.idEmpleado, idEmpleadoFuente: `asistencia ${x.hoja}` } })
        }
      }
      if (ops.length) await escribirEnLotes(ops)
      await auditarStaff('ids_aplicados', `${aplicados} IDs aplicados, ${conflictos} conflictos marcados, ${sinPerfil} sin perfil (no se crean desde asistencia)`)
      setMensaje({ tipo: 'ok', texto: `IDs: ${aplicados} aplicados · ${conflictos} en conflicto (marcados para revisar) · ${sinPerfil} nombres sin perfil todavía (se crearán al importar su semana).` })
      await recargarBd()
    } finally { setTrabajando('') }
  }

  // RECALCULAR un período ya importado con las tarifas/grupos/reglas ACTUALES
  // (acción explícita y auditada: cambiar una tarifa nunca recalcula solo).
  const recalcularPeriodo = async (pd) => {
    setTrabajando('re_' + pd.id)
    try {
      const regs = await cargarPor(COL.registros, 'periodoId', pd.id)
      const workersMap = Object.fromEntries(bd.workers.flatMap((w) => [[w.nombreNorm, w], ...(w.alias || []).map((al) => [al, w])]))
      const pagos = calcularPagos(regs, bd.tarifas, workersMap, bd.reglas, pd.fin, bd.grupos)
      const ops = pagos.map((x) => ({
        ref: refDoc(COL.registros, x.id),
        merge: true,
        data: { miHorasReg: x.miHorasReg, miHorasOT: x.miHorasOT, miTarifaReg: x.miTarifaReg, miTarifaOT: x.miTarifaOT, miPago: x.miPago, pendienteTarifa: !!x.pendienteTarifa, origenTarifa: x.origenTarifa || null, recalculadoEn: new Date().toISOString(), recalculadoPor: user.email },
      }))
      ops.push({ ref: refDoc(COL.periodos, pd.id), merge: true, data: { recalculadoEn: new Date().toISOString() } })
      await escribirEnLotes(ops)
      const pendientes = pagos.filter((x) => x.pendienteTarifa).length
      await auditarStaff('periodo_recalculado', `${pd.id}: ${pagos.length} registros con tarifas/reglas actuales (${pendientes} aún sin tarifa)`)
      setMensaje({ tipo: 'ok', texto: `Período ${pd.inicio} recalculado con tus tarifas, grupos y reglas actuales (${pagos.length} registros${pendientes ? `, ${pendientes} siguen sin tarifa` : ''}).` })
      await recargarBd()
    } finally { setTrabajando('') }
  }

  if (!bd) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando staffing…</div>

  const categorias = analisis ? analisis.periodos.map((p) => ({ p, cat: categorizar(p) })) : []
  const conteo = (cat) => categorias.filter((x) => x.cat === cat).length

  return (
    <div>
      <PageTitle right={<Boton variant="ghost" onClick={recargarBd}><RefreshCw size={14} /> Recargar</Boton>}>Staffing Gofo · Importador</PageTitle>
      <Aviso tipo="info" className="mb-4">
        Sube la copia del libro semanal de Gofo. Solo se importan pestañas con <b>período definitivo</b> (p. ej. 08.24-08.30) y datos completos.
        Las provisionales (Shift/Sheet + número) se omiten siempre. Importar el reporte <b>no</b> significa que Gofo ya pagó ni que ya pagaste al trabajador.
      </Aviso>

      <div
        className={`mb-4 rounded-2xl border-2 border-dashed p-5 text-center shadow-card transition ${arrastrando ? 'border-brand-gold bg-amber-50/70 dark:bg-amber-500/10' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) procesarArchivo(f) }}
      >
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          <Upload size={15} /> {trabajando === 'analizando' ? 'Analizando…' : 'Subir libro de Gofo (.xlsx)'}
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={alArchivo} disabled={trabajando !== ''} />
        </label>
        <div className="mt-2 text-xs text-slate-400">{arrastrando ? '¡Suéltalo aquí!' : 'o arrastra el reporte y suéltalo en este recuadro'}</div>
        {archivoNombre && <div className="mt-1 text-xs text-slate-400">{archivoNombre}</div>}
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} className="mb-4">{mensaje.texto}</Aviso>}

      {analisis && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge color="green">{conteo('nuevo')} por importar</Badge>
            <Badge color="slate">{conteo('ya')} ya procesados</Badge>
            <Badge color="gold">{conteo('cambios')} con cambios</Badge>
            <Badge color="red">{conteo('incompleto')} incompletos</Badge>
            <Badge color="slate">{analisis.omitidas.length} pestañas omitidas</Badge>
          </div>

          {categorias.map(({ p, cat }) => (
            <PeriodoPreview key={p.hoja} p={p} cat={cat} bd={bd} previo={bd.periodos[p.idPeriodo]}
              importando={trabajando === p.idPeriodo}
              onImportar={() => importar(p, false)}
              onAprobar={() => importar(p, true)}
              onTarifaGuardada={recargarBd}
              user={user}
            />
          ))}

          {analisis.idsEmpleado && analisis.idsEmpleado.length > 0 && (
            <Card className="mt-4 p-4">
              <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">IDs de empleado encontrados (工号, hoja de asistencia)</div>
              <p className="mb-2 text-xs text-slate-500">
                La hoja provisional trae el ID oficial de cada trabajador. De ahí NO se importan horas ni perfiles;
                solo puedes aplicar los IDs a los perfiles que YA existen (coincidencia por nombre). {analisis.idsEmpleado.length} encontrados.
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                {analisis.idsEmpleado.slice(0, 8).map((x) => <Badge key={x.nombreNorm} color="slate">{x.nombre} → {x.idEmpleado}</Badge>)}
                {analisis.idsEmpleado.length > 8 && <span className="text-slate-400">… y {analisis.idsEmpleado.length - 8} más</span>}
              </div>
              <Boton variant="ghost" disabled={trabajando === 'ids'} onClick={aplicarIds}>{trabajando === 'ids' ? <Spinner /> : 'Aplicar IDs a los perfiles existentes'}</Boton>
            </Card>
          )}

          {analisis.omitidas.length > 0 && (
            <Card className="mt-4 p-4">
              <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Pestañas omitidas</div>
              <ul className="space-y-1 text-xs text-slate-500">
                {analisis.omitidas.map((o) => <li key={o.hoja}>• <b>{o.hoja}</b> — {o.motivo}</li>)}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Períodos ya importados (histórico) */}
      <Card className="mt-6 p-4">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Períodos importados</div>
        {Object.values(bd.periodos).length === 0 && <div className="text-xs text-slate-400">Todavía no hay períodos importados.</div>}
        <div className="space-y-1">
          {Object.values(bd.periodos).sort((a, b) => String(b.inicio).localeCompare(a.inicio)).map((pd) => (
            <div key={pd.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{pd.inicio} → {pd.fin}</span>
              <span className="text-slate-400">{pd.totales?.personas} personas · {pd.totales?.horas} h · ingreso {dinero(pd.totales?.ingresoGofo)}</span>
              {(pd.versiones || []).length > 0 && <Badge color="gold">{pd.versiones.length} actualización(es)</Badge>}
              <span className="ml-auto text-slate-400">{pd.archivo}</span>
              <button className="font-semibold text-brand-gold hover:underline" disabled={trabajando === 're_' + pd.id}
                onClick={() => recalcularPeriodo(pd)} title="Recalcular MI pago con las tarifas, grupos y reglas de hoy (no toca los datos de Gofo)">
                {trabajando === 're_' + pd.id ? 'recalculando…' : 'recalcular pagos'}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function PeriodoPreview({ p, cat, bd, previo, importando, onImportar, onAprobar, onTarifaGuardada, user }) {
  const [abierto, setAbierto] = useState(cat === 'nuevo' || cat === 'cambios')
  const workersMap = useMemo(() => Object.fromEntries(bd.workers.flatMap((w) => [[w.nombreNorm, w], ...(w.alias || []).map((a) => [a, w])])), [bd.workers])
  const pagos = useMemo(() => calcularPagos(p.filas, bd.tarifas, workersMap, bd.reglas, p.fin, bd.grupos), [p, bd, workersMap])
  const sinTarifa = [...new Set(pagos.filter((x) => x.pendienteTarifa).map((x) => x.posicion))]
  const color = cat === 'nuevo' ? 'green' : cat === 'ya' ? 'slate' : cat === 'cambios' ? 'gold' : 'red'
  const etiqueta = cat === 'nuevo' ? 'Listo para importar' : cat === 'ya' ? 'Ya procesado (sin cambios)' : cat === 'cambios' ? 'Cambió desde la importación — requiere revisión' : 'Incompleto / pendiente'
  return (
    <Card className="mb-3 p-4">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full flex-wrap items-center gap-2 text-left">
        {abierto ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{p.hoja}</span>
        {p.inicio && <span className="text-xs text-slate-400">{p.inicio} → {p.fin}</span>}
        <Badge color={color}>{etiqueta}</Badge>
        <span className="ml-auto text-xs text-slate-400">{p.totales.personas} personas · {p.totales.horas} h · {dinero(p.totales.ingresoGofo)}{p.ajustes.length ? ` · ajustes ${dinero(p.totales.ajustes)}` : ''}</span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {p.motivos.length > 0 && (
            <Aviso tipo="error"><b>Pendiente — falta información:</b><ul className="mt-1 list-disc pl-5">{p.motivos.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}{p.motivos.length > 8 && <li>… y {p.motivos.length - 8} más</li>}</ul></Aviso>
          )}
          {p.avisos.length > 0 && (
            <Aviso tipo="warn"><b>Observaciones:</b><ul className="mt-1 list-disc pl-5">{p.avisos.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}{p.avisos.length > 8 && <li>… y {p.avisos.length - 8} más</li>}</ul></Aviso>
          )}
          {cat === 'cambios' && previo && (
            <Aviso tipo="warn">
              <b>Diferencias contra lo importado:</b>{' '}
              personas {previo.totales?.personas} → {p.totales.personas} · horas {previo.totales?.horas} → {p.totales.horas} · ingreso {dinero(previo.totales?.ingresoGofo)} → {dinero(p.totales.ingresoGofo)}.
              {(() => {
                const antes = new Set(previo.personas || [])
                const ahora = new Set(p.filas.map((f) => f.nombreNorm))
                const nuevos = [...ahora].filter((x) => !antes.has(x))
                const fuera = [...antes].filter((x) => !ahora.has(x))
                return <> {nuevos.length > 0 && <span> Nuevos: {nuevos.join(', ')}.</span>}{fuera.length > 0 && <span> Ya no aparecen: {fuera.join(', ')} (el historial anterior no se borra solo; aprueba para aplicar).</span>}</>
              })()}
              {' '}No se recontabiliza automáticamente: revisa y aprueba la actualización.
            </Aviso>
          )}
          {sinTarifa.length > 0 && cat !== 'ya' && (
            <FaltaTarifa posiciones={sinTarifa} onGuardada={onTarifaGuardada} user={user} />
          )}

          {/* vista previa de personas */}
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
                <th className="py-1.5 pr-2">Trabajador</th><th className="pr-2">Posición</th><th className="pr-2">Agencia</th><th className="pr-2">WH</th>
                <th className="pr-2 text-right">Horas</th><th className="pr-2 text-right">OT</th>
                <th className="pr-2 text-right">Tarifa Gofo</th><th className="pr-2 text-right">Ingreso Gofo</th>
                <th className="pr-2 text-right">Mi tarifa</th><th className="pr-2 text-right">Mi pago</th>
              </tr></thead>
              <tbody>
                {pagos.map((x, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{x.nombre}</td>
                    <td className="pr-2">{x.posicion}{x.posicionRaw && x.posicionRaw !== x.posicion ? <span className="text-slate-400"> ({x.posicionRaw})</span> : ''}</td>
                    <td className="pr-2">{x.agencia}</td><td className="pr-2">{x.warehouse}</td>
                    <td className="pr-2 text-right">{x.horasTotal}</td><td className="pr-2 text-right">{x.horasOT || 0}</td>
                    <td className="pr-2 text-right">{dinero(x.tarifaGofoReg)} / {dinero(x.tarifaGofoOT)}</td>
                    <td className="pr-2 text-right font-semibold">{dinero(x.importeGofo)}</td>
                    <td className="pr-2 text-right">{x.pendienteTarifa ? <Badge color="red">sin tarifa</Badge> : `${dinero(x.miTarifaReg)} / ${dinero(x.miTarifaOT)}`}</td>
                    <td className="pr-2 text-right font-semibold">{x.pendienteTarifa ? '—' : dinero(x.miPago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {p.ajustes.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Ajustes del reporte (se registran por separado, sin doble conteo)</div>
              <ul className="space-y-1 text-xs">
                {p.ajustes.map((a, i) => (
                  <li key={i} className="flex flex-wrap gap-2">
                    <span className="font-semibold">{dinero(a.importe)}</span>
                    <span className="text-slate-500">{a.concepto}</span>
                    {a.personaRaw && <Badge color="slate">{a.personaRaw}</Badge>}
                    {a.periodoOrigenTexto && <Badge color="gold">origen {a.periodoOrigenTexto}</Badge>}
                    {!a.personaRaw && !a.periodoOrigenTexto && <Badge color="red">requiere revisión</Badge>}
                    <span className="text-slate-400">({a.origen.hoja} fila {a.origen.fila})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {cat === 'nuevo' && <Boton variant="gold" disabled={importando} onClick={onImportar}>{importando ? <Spinner /> : `Confirmar importación (${p.inicio} → ${p.fin})`}</Boton>}
            {cat === 'cambios' && <Boton variant="gold" disabled={importando} onClick={onAprobar}>{importando ? <Spinner /> : 'Aprobar actualización (auditable)'}</Boton>}
            {cat === 'ya' && <span className="text-xs text-slate-400">Este período ya está en el sistema con el mismo contenido; no se vuelve a contabilizar.</span>}
            {cat === 'incompleto' && <span className="text-xs text-slate-400">Completa la información en el archivo de Gofo y vuelve a subirlo.</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

// Pide la tarifa de pago cuando una posición importada no la tiene y la guarda
// para futuras semanas (wh_staff_tarifas/{posicion}).
function FaltaTarifa({ posiciones, onGuardada, user }) {
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState('')
  const guardar = async (pos) => {
    const v = valores[pos] || {}
    if (!v.reg || (!v.otFlat && !v.ot)) return
    setGuardando(pos)
    try {
      await setDoc(refDoc(COL.tarifas, pos), {
        posicion: pos, reg: Number(v.reg), ot: v.otFlat ? 0 : Number(v.ot),
        vigenteDesde: v.desde || new Date().toISOString().slice(0, 10),
        actualizadoPor: user.email, actualizadoEn: new Date().toISOString(),
      }, { merge: true })
      await auditarStaff('tarifa_creada', `${pos}: $${v.reg}/h reg · ${v.otFlat ? 'OT flat (= regular)' : `$${v.ot}/h OT`}`)
      onGuardada()
    } finally { setGuardando('') }
  }
  return (
    <Aviso tipo="warn">
      <b>¿Cuánto quieres pagar?</b> Estas posiciones no tienen tu tarifa configurada (se guardará para futuras semanas):
      <div className="mt-2 space-y-2">
        {posiciones.map((pos) => (
          <div key={pos} className="flex flex-wrap items-center gap-2">
            <Badge color="navy">{pos}</Badge>
            <Input type="number" step="0.25" placeholder="$ regular/h" className="w-28" value={valores[pos]?.reg || ''} onChange={(e) => setValores({ ...valores, [pos]: { ...valores[pos], reg: e.target.value } })} />
            {!valores[pos]?.otFlat && <Input type="number" step="0.25" placeholder="$ OT/h" className="w-28" value={valores[pos]?.ot || ''} onChange={(e) => setValores({ ...valores, [pos]: { ...valores[pos], ot: e.target.value } })} />}
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <input type="checkbox" checked={!!valores[pos]?.otFlat} onChange={(e) => setValores({ ...valores, [pos]: { ...valores[pos], otFlat: e.target.checked, ot: '' } })} />
              flat rate
            </label>
            <Input type="date" className="w-40" value={valores[pos]?.desde || ''} onChange={(e) => setValores({ ...valores, [pos]: { ...valores[pos], desde: e.target.value } })} />
            <Boton variant="gold" disabled={guardando === pos || !valores[pos]?.reg || (!valores[pos]?.otFlat && !valores[pos]?.ot)} onClick={() => guardar(pos)}>{guardando === pos ? <Spinner /> : 'Guardar'}</Boton>
          </div>
        ))}
      </div>
    </Aviso>
  )
}
