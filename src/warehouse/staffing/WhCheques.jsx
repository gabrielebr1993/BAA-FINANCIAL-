// ============================================================================
// WAREHOUSE / STAFFING · Control y conciliación de CHEQUES (última etapa).
//
// A) Historial de EMISIÓN (de mi sistema de impresión): número → persona.
// B) Reporte BANCARIO: confirma qué cheques se cobraron.
// El cruce actualiza el estado del cheque y el historial del trabajador.
//
// · Las columnas de estos archivos NO se inventan: al subir cada archivo se
//   propone un mapeo por encabezados y el dueño lo confirma; se guarda para
//   la próxima vez. · Se puede subir en cualquier orden y reimportar sin
//   duplicar. · Ausencia en el banco ≠ cancelado: cancelar es una acción
//   explícita y auditable. · Cancelado que aparece cobrado → alerta.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../../components/ui'
import { Upload, Banknote, Ban, Link2 } from 'lucide-react'
import {
  normalizarNumero, normalizarCuenta, idCheque, huellaFilaBanco, adivinarMapeo, conciliarBanco,
  vincularBeneficiario, validarDistribucion,
} from './logicaCheques'
import { COL, cargar, auditarStaff, escribirEnLotes, refDoc, setDoc, arrayUnion } from './datosStaff'
import { hashContenido, paraBuscar } from './parserGofo'
import { enmascarar } from './printcheck/logicaPrint'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const COLORES_ESTADO = { emitido: 'gold', cobrado: 'green', cancelado: 'slate', diferencia: 'red' }
const CAMPOS = [
  ['numero', 'Número de cheque'], ['beneficiario', 'Beneficiario'], ['importe', 'Importe'],
  ['fecha', 'Fecha'], ['cuenta', 'Cuenta bancaria'], ['periodo', 'Período de nómina / memo'], ['estado', 'Estado'],
]

function leerHoja(ws) {
  const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  const noVacias = matriz.filter((f) => f.some((c) => String(c).trim() !== ''))
  if (!noVacias.length) return null
  // la fila de encabezados es la primera con 2+ celdas de texto
  let idx = matriz.findIndex((f) => f.filter((c) => String(c).trim() !== '').length >= 2)
  if (idx < 0) idx = 0
  return { encabezados: matriz[idx].map((h) => String(h).trim()), filas: matriz.slice(idx + 1).filter((f) => f.some((c) => String(c).trim() !== '')) }
}

export default function WhCheques({ user }) {
  const [datos, setDatos] = useState(null)
  const [importa, setImporta] = useState(null) // { tipo:'emision'|'banco', encabezados, filas, mapeo }
  const [mensaje, setMensaje] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [arrastrando, setArrastrando] = useState('')

  const recargar = async () => {
    const [cheques, pend, workers, periodos, configs] = await Promise.all([
      cargar(COL.cheques), cargar(COL.bancoPend), cargar(COL.workers), cargar(COL.periodos), cargar(COL.config),
    ])
    setDatos({ cheques, pend, workers: workers.filter((w) => !w.fusionadoEn), periodos: periodos.sort((a, b) => String(b.inicio).localeCompare(a.inicio)), configCheques: configs.find((c) => c.id === 'cheques') || {} })
  }
  useEffect(() => { recargar() }, [])

  // ── filtros de la lista (hook ANTES de cualquier return temprano) ──
  const lista = useMemo(() => {
    if (!datos) return []
    let l = datos.cheques
    if (filtroEstado === 'pendientes') l = l.filter((c) => c.estado === 'emitido')
    else if (filtroEstado === 'cobrados') l = l.filter((c) => c.estado === 'cobrado')
    else if (filtroEstado === 'cancelados') l = l.filter((c) => c.estado === 'cancelado')
    else if (filtroEstado === 'revision') l = l.filter((c) => c.estado === 'diferencia' || c.revision || c.alerta || c.workerAmbiguo)
    if (buscar) {
      const q = paraBuscar(buscar)
      l = l.filter((c) => [c.numeroRaw, c.numeroNorm, c.beneficiario, c.cuenta, c.periodoTexto, c.fechaEmision, c.cobro?.fecha].some((v) => paraBuscar(v).includes(q)))
    }
    return l.sort((a, b) => String(b.fechaEmision || '').localeCompare(String(a.fechaEmision || '')) || String(a.numeroNorm).localeCompare(b.numeroNorm, undefined, { numeric: true }))
  }, [datos, filtroEstado, buscar])

  if (!datos) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando cheques…</div>

  const alArchivo = (e, tipo) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (f) procesarArchivo(f, tipo)
  }
  // Procesa el archivo (botón o arrastrar y soltar).
  const procesarArchivo = async (f, tipo) => {
    if (!f) return
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setMensaje({ tipo: 'error', texto: `"${f.name}" no es un Excel ni CSV.` }); return }
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true })
      let hoja = null
      for (const n of wb.SheetNames) { const h = leerHoja(wb.Sheets[n]); if (h && h.filas.length) { hoja = { ...h, nombre: n }; break } }
      if (!hoja) { setMensaje({ tipo: 'error', texto: 'El archivo no tiene filas legibles.' }); return }
      const guardado = datos.configCheques[tipo === 'emision' ? 'mapeoEmision' : 'mapeoBanco']
      const mapeo = guardado && guardado.encabezados === hashContenido(hoja.encabezados) ? guardado.mapeo : adivinarMapeo(hoja.encabezados)
      setImporta({ tipo, archivo: f.name, ...hoja, mapeo })
      setMensaje(null)
    } catch (err) { setMensaje({ tipo: 'error', texto: 'No se pudo leer: ' + (err.message || err) }) }
  }

  const valorDe = (fila, campo) => {
    const i = importa.mapeo[campo]
    return i === null || i === undefined ? '' : String(fila[i] ?? '').trim()
  }
  const numeroDe = (fila, campo) => {
    const s = valorDe(fila, campo).replace(/[$,\s]/g, '')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }

  const confirmarImportacion = async () => {
    setTrabajando(true)
    setMensaje(null)
    try {
      // guarda el mapeo confirmado para la próxima vez
      await setDoc(refDoc(COL.config, 'cheques'), {
        [importa.tipo === 'emision' ? 'mapeoEmision' : 'mapeoBanco']: { encabezados: hashContenido(importa.encabezados), mapeo: importa.mapeo },
        ...(importa.tipo === 'banco' ? { ultimoBanco: { archivo: importa.archivo, fecha: new Date().toISOString(), filas: importa.filas.length } } : {}),
      }, { merge: true })

      if (importa.tipo === 'emision') {
        if (importa.mapeo.numero === null || importa.mapeo.numero === undefined) throw new Error('indica cuál columna es el número de cheque')
        const ops = []
        let nuevos = 0, actualizados = 0, conflictos = 0
        for (const fila of importa.filas) {
          const numeroRaw = valorDe(fila, 'numero')
          if (!normalizarNumero(numeroRaw)) continue
          const cuenta = valorDe(fila, 'cuenta')
          const id = idCheque(numeroRaw, cuenta)
          const beneficiario = valorDe(fila, 'beneficiario')
          const importe = numeroDe(fila, 'importe')
          const estadoTxt = valorDe(fila, 'estado').toLowerCase()
          const existente = datos.cheques.find((c) => c.id === id)
          const vinculo = beneficiario ? vincularBeneficiario(beneficiario, datos.workers) : null
          let conflicto = null
          if (existente && importe !== null && existente.importe !== null && existente.importe !== undefined && Math.abs(existente.importe - importe) > 0.009) { conflicto = `importe cambió de ${dinero(existente.importe)} a ${dinero(importe)}`; conflictos++ }
          else if (existente) actualizados++
          else nuevos++
          ops.push({
            ref: refDoc(COL.cheques, id),
            merge: true,
            data: {
              numeroNorm: normalizarNumero(numeroRaw), numeroRaw, cuentaNorm: normalizarCuenta(cuenta), cuenta,
              beneficiario: beneficiario || existente?.beneficiario || '',
              workerId: existente?.workerId || (vinculo && vinculo.workerId) || null,
              workerAmbiguo: !!(vinculo && vinculo.ambiguo),
              importe: importe !== null ? importe : (existente ? existente.importe : null),
              fechaEmision: valorDe(fila, 'fecha') || existente?.fechaEmision || null,
              periodoTexto: valorDe(fila, 'periodo') || existente?.periodoTexto || null,
              // el estado cobrado/cancelado existente NUNCA se pisa con una reimportación
              estado: existente && ['cobrado', 'cancelado', 'diferencia'].includes(existente.estado) ? existente.estado : (/void|cancel|anulad/.test(estadoTxt) ? 'cancelado' : 'emitido'),
              ...(conflicto ? { conflicto, revision: true } : {}),
              origenEmision: importa.archivo,
            },
          })
        }
        await escribirEnLotes(ops)
        await auditarStaff('cheques_emision_importada', `${importa.archivo}: ${nuevos} nuevos, ${actualizados} actualizados, ${conflictos} con conflicto`)
        setMensaje({ tipo: 'ok', texto: `Emisión importada: ${nuevos} cheques nuevos, ${actualizados} ya existentes actualizados, ${conflictos} con conflicto para revisar.` })
      } else {
        // BANCO: conciliar con la lógica pura y aplicar acciones
        const filasBanco = importa.filas.map((fila) => ({
          numero: valorDe(fila, 'numero'),
          importe: numeroDe(fila, 'importe'),
          fechaCobro: valorDe(fila, 'fecha') || null,
          cuenta: valorDe(fila, 'cuenta'),
        })).filter((x) => String(x.numero).trim() !== '')
        const acc = conciliarBanco(filasBanco, datos.cheques)
        const ops = []
        for (const c of acc.cobros) ops.push({ ref: refDoc(COL.cheques, c.chequeId), merge: true, data: { estado: 'cobrado', cobro: c.cobro, huellasBanco: arrayUnion(c.huella), conciliadoEn: new Date().toISOString(), conciliadoPor: user.email } })
        for (const d of acc.diferencias) ops.push({ ref: refDoc(COL.cheques, d.chequeId), merge: true, data: { estado: 'diferencia', revision: true, bancoPendiente: { ...d.fila, motivo: d.motivo }, huellasBanco: arrayUnion(d.huella) } })
        for (const a of [...acc.ambiguos, ...acc.sinIdentificar]) {
          ops.push({ ref: refDoc(COL.bancoPend, 'bp_' + huellaFilaBanco(a.fila)), merge: true, data: { ...a.fila, numeroNorm: normalizarNumero(a.fila.numero), motivo: a.motivo, candidatos: a.candidatos || [], archivo: importa.archivo, importadoEn: new Date().toISOString() } })
        }
        for (const al of acc.alertas) ops.push({ ref: refDoc(COL.cheques, al.chequeId), merge: true, data: { alerta: al.motivo, revision: true } })
        await escribirEnLotes(ops)
        await auditarStaff('cheques_banco_importado', `${importa.archivo}: ${acc.cobros.length} cobros, ${acc.diferencias.length} diferencias, ${acc.ambiguos.length} ambiguos, ${acc.sinIdentificar.length} sin identificar, ${acc.yaConciliados.length} ya conciliados, ${acc.alertas.length} alertas`)
        setMensaje({ tipo: 'ok', texto: `Banco conciliado: ${acc.cobros.length} cobros confirmados · ${acc.diferencias.length} diferencias de importe · ${acc.ambiguos.length} ambiguos · ${acc.sinIdentificar.length} sin identificar · ${acc.yaConciliados.length} ya estaban conciliados · ${acc.alertas.length} ALERTAS de cancelados cobrados.` })
      }
      setImporta(null)
      await recargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se confirmó la importación (reintenta sin riesgo de duplicados): ' + (err.message || err) })
    } finally { setTrabajando(false) }
  }

  const suma = (l) => l.reduce((s, c) => s + (c.importe || 0), 0)
  const porEstado = (e) => datos.cheques.filter((c) => c.estado === e)

  return (
    <div>
      <PageTitle>Cheques · control y conciliación</PageTitle>
      <Aviso tipo="info" className="mb-4">
        Sube el <b>historial de emisión</b> (tu sistema de impresión) y el <b>reporte bancario</b>, en cualquier orden.
        El cruce confirma cobros sin crear pagos dobles. La ausencia de un cheque en el banco <b>no</b> significa que esté cancelado.
        {datos.configCheques.ultimoBanco && <span> Último reporte bancario: <b>{datos.configCheques.ultimoBanco.archivo}</b> ({new Date(datos.configCheques.ultimoBanco.fecha).toLocaleString()}).</span>}
      </Aviso>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {[['emision', 'Subir historial de emisión', Upload], ['banco', 'Subir reporte bancario', Banknote]].map(([tipo, titulo, Icono]) => (
          <div key={tipo}
            className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${arrastrando === tipo ? 'border-brand-gold bg-amber-50/70 dark:bg-amber-500/10' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(tipo) }}
            onDragLeave={() => setArrastrando('')}
            onDrop={(e) => { e.preventDefault(); setArrastrando(''); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) procesarArchivo(f, tipo) }}
          >
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tipo === 'emision' ? 'bg-brand-navy text-white hover:opacity-90' : 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              <Icono size={15} /> {titulo}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => alArchivo(e, tipo)} />
            </label>
            <div className="mt-1.5 text-[11px] text-slate-400">{arrastrando === tipo ? '¡Suéltalo aquí!' : 'o arrastra el archivo a este recuadro'}</div>
          </div>
        ))}
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} className="mb-4">{mensaje.texto}</Aviso>}

      {importa && (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">
            Confirma el mapeo de columnas · {importa.tipo === 'emision' ? 'historial de emisión' : 'reporte bancario'} ({importa.archivo}, {importa.filas.length} filas)
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPOS.filter(([k]) => importa.tipo === 'banco' ? ['numero', 'importe', 'fecha', 'cuenta'].includes(k) : true).map(([k, etiqueta]) => (
              <div key={k}>
                <div className="text-[10px] font-bold uppercase text-slate-400">{etiqueta}{k === 'numero' && ' *'}</div>
                <Select value={importa.mapeo[k] ?? ''} onChange={(e) => setImporta({ ...importa, mapeo: { ...importa.mapeo, [k]: e.target.value === '' ? null : Number(e.target.value) } })}>
                  <option value="">— no viene —</option>
                  {importa.encabezados.map((h, i) => <option key={i} value={i}>{h || `(columna ${i + 1})`}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <div className="mb-3 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[560px] text-[11px]">
              <thead><tr className="text-left text-[10px] uppercase text-slate-400">{importa.encabezados.map((h, i) => <th key={i} className="px-2 py-1">{h}</th>)}</tr></thead>
              <tbody>{importa.filas.slice(0, 4).map((f, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800">{importa.encabezados.map((_, j) => <td key={j} className="px-2 py-1">{String(f[j] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Boton variant="gold" disabled={trabajando || importa.mapeo.numero === null || importa.mapeo.numero === undefined} onClick={confirmarImportacion}>{trabajando ? <Spinner /> : 'Confirmar e importar'}</Boton>
            <Boton variant="ghost" onClick={() => setImporta(null)}>Cancelar</Boton>
          </div>
        </Card>
      )}

      {/* alertas y pendientes de conciliación */}
      {datos.cheques.filter((c) => c.alerta).map((c) => (
        <Aviso key={c.id} tipo="error" className="mb-2"><b>ALERTA:</b> {c.alerta} (cheque #{c.numeroRaw})</Aviso>
      ))}
      {datos.pend.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Movimientos del banco sin conciliar ({datos.pend.length})</div>
          <ul className="space-y-1 text-xs text-slate-500">
            {datos.pend.map((b) => <li key={b.id}>• Cheque {b.numero} {b.importe != null ? dinero(b.importe) : ''} {b.fechaCobro || ''} — {b.motivo}</li>)}
          </ul>
        </Card>
      )}

      {/* resumen + filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {[['todos', `Todos (${datos.cheques.length} · ${dinero(suma(datos.cheques))})`],
          ['pendientes', `Pendientes por cobrar (${porEstado('emitido').length} · ${dinero(suma(porEstado('emitido')))})`],
          ['cobrados', `Pagados/cobrados (${porEstado('cobrado').length} · ${dinero(suma(porEstado('cobrado')))})`],
          ['cancelados', `Cancelados (${porEstado('cancelado').length})`],
          ['revision', `Sin conciliar / diferencias (${datos.cheques.filter((c) => c.estado === 'diferencia' || c.revision || c.workerAmbiguo).length})`],
        ].map(([k, etiqueta]) => (
          <button key={k} onClick={() => setFiltroEstado(k)} className={`rounded-lg px-3 py-1.5 font-semibold transition ${filtroEstado === k ? 'bg-slate-100 text-brand-navy dark:bg-slate-700/50 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{etiqueta}</button>
        ))}
        <Input className="ml-auto w-64" placeholder="Buscar persona, número, período, fecha, cuenta…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>

      {lista.length === 0 && <EstadoVacio icono={Banknote} titulo="Sin cheques" texto="Sube el historial de emisión para empezar." mostrarBoton={false} />}
      <div className="space-y-2">
        {lista.map((c) => <ChequeCard key={c.id} c={c} datos={datos} user={user} recargar={recargar} />)}
      </div>
    </div>
  )
}

function ChequeCard({ c, datos, user, recargar }) {
  const [abierto, setAbierto] = useState(false)
  const [dist, setDist] = useState({ periodoId: '', importe: '' })
  const [workerSel, setWorkerSel] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const worker = datos.workers.find((w) => w.id === c.workerId)
  const validacion = validarDistribucion(c.importe, c.distribucion)

  const accion = async (fn, auditMsg) => {
    setTrabajando(true)
    try { await fn(); await auditarStaff(auditMsg.accion, auditMsg.detalle); recargar() } finally { setTrabajando(false) }
  }
  const cancelar = () => {
    const motivo = window.prompt('Motivo de la cancelación (queda en auditoría):')
    if (motivo === null) return
    accion(
      () => setDoc(refDoc(COL.cheques, c.id), { estado: 'cancelado', cancelacion: { motivo, por: user.email, fecha: new Date().toISOString() } }, { merge: true }),
      { accion: 'cheque_cancelado', detalle: `#${c.numeroRaw}: ${motivo}` },
    )
  }
  const asignarWorker = () => {
    if (!workerSel) return
    accion(
      () => setDoc(refDoc(COL.cheques, c.id), { workerId: workerSel, workerAmbiguo: false }, { merge: true }),
      { accion: 'cheque_vinculado', detalle: `#${c.numeroRaw} → ${datos.workers.find((w) => w.id === workerSel)?.nombre}` },
    )
  }
  const agregarDist = () => {
    if (!dist.periodoId || !dist.importe) return
    const nueva = [...(c.distribucion || []), { periodoId: dist.periodoId, importe: Number(dist.importe) }]
    const v = validarDistribucion(c.importe, nueva)
    if (!v.valida) return
    accion(
      () => setDoc(refDoc(COL.cheques, c.id), { distribucion: nueva }, { merge: true }),
      { accion: 'cheque_distribuido', detalle: `#${c.numeroRaw}: ${dinero(Number(dist.importe))} → ${dist.periodoId}` },
    )
    setDist({ periodoId: '', importe: '' })
  }
  const quitarDist = (i) => {
    const nueva = (c.distribucion || []).filter((_, j) => j !== i)
    accion(
      () => setDoc(refDoc(COL.cheques, c.id), { distribucion: nueva }, { merge: true }),
      { accion: 'cheque_distribucion_quitada', detalle: `#${c.numeroRaw}` },
    )
  }

  return (
    <Card className="p-3">
      <button className="flex w-full flex-wrap items-center gap-2 text-left text-xs" onClick={() => setAbierto(!abierto)}>
        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">#{c.numeroRaw || c.numeroNorm}</span>
        <Badge color={COLORES_ESTADO[c.estado] || 'slate'}>{c.estado}</Badge>
        {c.revision && <Badge color="red">revisar</Badge>}
        {c.workerAmbiguo && <Badge color="red">beneficiario ambiguo</Badge>}
        <span className="font-semibold">{c.beneficiario}</span>
        {worker && <Badge color="slate">{worker.nombre}</Badge>}
        <span className="ml-auto">{dinero(c.importe)}</span>
        <span className="text-slate-400">{c.fechaEmision || c.fecha || 'sin fecha'}{c.cobro?.fecha ? ` · cobrado ${c.cobro.fecha}` : ''}{c.cuenta ? ` · cta ${enmascarar(c.cuenta)}` : ''}</span>
      </button>
      {abierto && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
          {c.conflicto && <Aviso tipo="warn">Conflicto en reimportación: {c.conflicto}</Aviso>}
          {c.bancoPendiente && <Aviso tipo="error">Diferencia con el banco: {c.bancoPendiente.motivo}</Aviso>}
          {c.cobro && <div>Cobro: {c.cobro.fecha || 'sin fecha'} · {c.cobro.importe != null ? dinero(c.cobro.importe) : 'importe no informado'} · importe {c.cobro.importeVerificado ? 'VERIFICADO' : 'no verificado (el banco no lo incluyó)'}</div>}
          {c.cancelacion && <div>Cancelado por {c.cancelacion.por} el {new Date(c.cancelacion.fecha).toLocaleDateString()}: {c.cancelacion.motivo}</div>}
          {c.periodoTexto && <div>Período según emisión: {c.periodoTexto}</div>}

          <div>
            <div className="mb-1 font-bold text-slate-500">Semanas que paga este cheque (sin duplicar: restante {dinero(validacion.restante)})</div>
            {(c.distribucion || []).map((d, i) => {
              const p = datos.periodos.find((x) => x.id === d.periodoId)
              return <div key={i} className="flex items-center gap-2"><span>{p ? `${p.inicio} → ${p.fin}` : d.periodoId}</span><b>{dinero(d.importe)}</b><button className="text-rose-400" onClick={() => quitarDist(i)}>quitar</button></div>
            })}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Select className="w-52" value={dist.periodoId} onChange={(e) => setDist({ ...dist, periodoId: e.target.value })}>
                <option value="">Asignar a período…</option>
                {datos.periodos.map((p) => <option key={p.id} value={p.id}>{p.inicio} → {p.fin}</option>)}
              </Select>
              <Input className="w-28" type="number" step="0.01" placeholder="$" value={dist.importe} onChange={(e) => setDist({ ...dist, importe: e.target.value })} />
              <Boton variant="ghost" disabled={trabajando} onClick={agregarDist}>Asignar</Boton>
              <span className="text-[11px] text-slate-400">El período no se deduce de la fecha de cobro: asígnalo aquí.</span>
            </div>
          </div>

          {(!worker || c.workerAmbiguo) && (
            <div className="flex flex-wrap items-center gap-2">
              <Link2 size={13} className="text-slate-400" />
              <Select className="w-56" value={workerSel} onChange={(e) => setWorkerSel(e.target.value)}>
                <option value="">Vincular con trabajador…</option>
                {datos.workers.map((w) => <option key={w.id} value={w.id}>{w.nombre}</option>)}
              </Select>
              <Boton variant="ghost" disabled={trabajando || !workerSel} onClick={asignarWorker}>Vincular</Boton>
            </div>
          )}

          {c.estado !== 'cancelado' && c.estado !== 'cobrado' && (
            <Boton variant="ghost" disabled={trabajando} onClick={cancelar}><Ban size={13} /> Cancelar cheque (auditable)</Boton>
          )}
        </div>
      )}
    </Card>
  )
}
