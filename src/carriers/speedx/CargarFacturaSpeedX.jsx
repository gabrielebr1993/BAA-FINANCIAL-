// ============================================================================
// SPEEDX · CARGAR FACTURA — la pantalla de importación del módulo SpeedX.
//
// Mismo flujo que Gofo (subir → verificar → tarifas → guardar) pero con el
// algoritmo de SpeedX: 1 solo archivo .xlsx (5 hojas). Lo que SPEEDX NOS PAGA
// sale de la propia factura (CONFIRM RATE: por peso + stops). Lo que NOSOTROS
// le pagamos al chofer es una TARIFA FIJA POR PAQUETE (todos los paquetes
// valen lo mismo, sin importar peso ni stop). Claims SIEMPRE con método M2
// (se le cobra al chofer lo que SpeedX nos cobró) y control de FONDO
// (SpeedX paga la semana ~2–3 semanas después).
//
// Guarda EXACTAMENTE las mismas colecciones que Gofo (invoices, claims,
// drivers, driverStats) con `carrier: 'speedx'`, así todas las pantallas
// (Dashboard, Financiero, Pagos, portal del chofer…) funcionan sin cambios.
// ============================================================================
import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../AuthContext'
import { useData } from '../../DataContext'
import { procesarArchivoSpeedX } from './parser'
import { construirResumenSpeedX } from './resumen'
import { CARRIERS } from '../index'
import { buscarDriver, calcularPagos, promediosFlota, calificarChofer, TODAS } from '../../utils/calc'
import { registrarAuditoria } from '../../utils/auditoria'
import { guardarCiudadesEmpresa } from '../../utils/empresaSettings'
import { money, num } from '../../utils/format'
import { Upload, Zap, Package, DollarSign, Truck, AlertTriangle, Save, CheckCircle2, X, PiggyBank, CalendarClock, FileSpreadsheet, Layers } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

const keyDe = (n) => (n || '').trim().toLowerCase()
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ISO 'aaaa-mm-dd' → Date local (mediodía, para que no salte de día por zona horaria).
const deISO = (iso) => {
  if (!iso) return null
  const [y, m, d] = String(iso).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1, 12)
  return isNaN(dt.getTime()) ? null : dt
}
const aISO = (dt) => (dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : '')
// Semana en el formato de Gofo (dd_mm_aaaa-dd_mm_aaaa) para que parsearPeriodo
// y todos los filtros por rango la entiendan sin cambios.
const semanaGofo = (iniISO, finISO) => {
  const f = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}_${m}_${y}` }
  return iniISO && finISO ? `${f(iniISO)}-${f(finISO)}` : ''
}

export default function CargarFacturaSpeedX() {
  const { t } = useLang()
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const { invoices, drivers, activeCompanyId, empresaActiva, ciudadesEmpresa, reloadInvoices, reloadDrivers, reloadClaims, reloadAjustes, setSelectedInvoiceId } = useData()

  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [proc, setProc] = useState(null) // { ...parser, resumen }
  const [errores, setErrores] = useState([])
  const [avisos, setAvisos] = useState([])
  const [tarifas, setTarifas] = useState({}) // key → { rate } (tarifa FIJA por paquete)
  const [bulk, setBulk] = useState({ rate: '' })
  const [fechaCobro, setFechaCobro] = useState('') // ISO editable (fondo)
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const diasFondo = CARRIERS.speedx?.diasFondo || 19

  // GUARDIA DE ARRASTRE: si el archivo se suelta fuera del recuadro, el
  // navegador lo ABRE en otra pestaña. En esta pantalla, soltar el .xlsx en
  // CUALQUIER parte lo procesa, y nunca navega fuera.
  const manejarRef = useRef(null)
  useEffect(() => {
    const over = (e) => e.preventDefault()
    const drop = (e) => {
      e.preventDefault()
      if (e.dataTransfer?.files?.length) manejarRef.current?.(e.dataTransfer.files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])

  // ── 1) Procesar el archivo ────────────────────────────────────────────────
  const manejarArchivo = async (fileList) => {
    const f = Array.from(fileList || []).find((x) => /\.xlsx?$/i.test(x.name))
    if (!f) return setErrores([t('La factura de SpeedX debe ser un archivo .xlsx.')])
    setProcesando(true)
    setErrores([])
    setAvisos([])
    setGuardado(false)
    setConfirmarDuplicado(false)
    try {
      const buf = await f.arrayBuffer()
      const p = procesarArchivoSpeedX(buf, f.name)
      const resumen = construirResumenSpeedX(p)
      setProc({ ...p, resumen })
      setAvisos([...(p.avisos || []), ...(resumen.avisos || [])])
      // Tarifas: precargar la del perfil de cada chofer. En SpeedX es UNA sola
      // tarifa fija por paquete (se guarda en los 3 campos de precio del perfil
      // con el mismo valor, para reutilizar el motor de pagos sin cambios).
      const tf = {}
      for (const ch of resumen.resumenChoferes) {
        const d = buscarDriver(drivers, ch.nombre)
        tf[keyDe(ch.nombre)] = { rate: d && Number(d.precioIndividual) > 0 ? String(d.precioIndividual) : '' }
      }
      setTarifas(tf)
      // Fondo: fecha esperada de cobro = fin de semana + días de fondo (editable).
      const fin = deISO(p.fechaFinISO)
      if (fin) { const est = new Date(fin); est.setDate(est.getDate() + diasFondo); setFechaCobro(aISO(est)) }
      else setFechaCobro('')
    } catch (e) {
      setProc(null)
      setErrores([t('No se pudo leer la factura:') + ' ' + e.message])
    } finally {
      setProcesando(false)
    }
  }
  // La guardia global usa siempre la versión vigente de manejarArchivo.
  manejarRef.current = manejarArchivo

  const semana = proc ? semanaGofo(proc.fechaInicioISO, proc.fechaFinISO) || proc.semana : ''
  // CANDADO anti-doble procesamiento: misma semana ya importada en SpeedX
  // (las `invoices` de useData ya vienen filtradas al carrier activo).
  const duplicada = useMemo(() => {
    if (!proc || !semana) return null
    return (invoices || []).find((inv) => inv.companyId === activeCompanyId && (inv.semana === semana || (proc.semana && inv.semanaSpeedX === proc.semana))) || null
  }, [invoices, proc, semana, activeCompanyId])

  // ── 2) Tarifas y estimación de pago ──────────────────────────────────────
  const setTarifa = (nombre, campo, valor) => setTarifas((tf) => ({ ...tf, [keyDe(nombre)]: { ...tf[keyDe(nombre)], [campo]: valor } }))
  const aplicarBulk = () => {
    if (!proc || bulk.rate === '') return
    setTarifas((tf) => {
      const nx = { ...tf }
      for (const ch of proc.resumen.resumenChoferes) nx[keyDe(ch.nombre)] = { rate: bulk.rate }
      return nx
    })
  }

  // Claims (M2) por chofer, para la estimación en pantalla.
  const claimsPorChofer = useMemo(() => {
    const m = {}
    for (const c of proc?.claims || []) m[keyDe(c.courier)] = (m[keyDe(c.courier)] || 0) + Math.abs(c.montoGofo)
    return m
  }, [proc])

  const filas = useMemo(() => {
    if (!proc) return []
    return proc.resumen.resumenChoferes.map((ch) => {
      const k = keyDe(ch.nombre)
      // Tarifa FIJA por paquete: todos los paquetes del chofer valen lo mismo.
      const rate = Number(tarifas[k]?.rate) || 0
      const paquetes = ch.individuales + ch.dobles + ch.stopAdicionales
      const pago = paquetes * rate
      const claims = claimsPorChofer[k] || 0
      const existente = buscarDriver(drivers, ch.nombre)
      return { ...ch, _key: k, rate, paquetes, pago: r2(pago), claimsMonto: r2(claims), total: r2(pago - claims), nuevo: !existente, listo: rate > 0 }
    }).sort((a, b) => b.ingreso - a.ingreso)
  }, [proc, tarifas, claimsPorChofer, drivers])

  const totalPagoChoferes = r2(filas.reduce((a, f) => a + f.total, 0))
  const choferesSinTarifa = filas.filter((f) => !f.listo)

  const montoCobro = proc ? r2(proc.oficial?.totalPago ?? proc.verificacion.totalCalculado) : 0

  // ── 3) Guardar ────────────────────────────────────────────────────────────
  const motivoBloqueo = (() => {
    if (!proc) return t('Sube la factura de SpeedX (.xlsx).')
    if (guardando) return t('Guardando…')
    if (!activeCompanyId) return t('No hay una empresa activa.')
    if (!semana) return t('No se pudo detectar la semana de la factura (columna NOTE).')
    if (duplicada && !confirmarDuplicado) return t('Esta semana ya fue importada en SpeedX (candado anti-duplicados).')
    if (choferesSinTarifa.length) return `${t('Faltan')} ${choferesSinTarifa.length} ${t('chofer(es) con su tarifa por paquete (> 0)')}: ${choferesSinTarifa.slice(0, 4).map((f) => f.nombre).join(', ')}${choferesSinTarifa.length > 4 ? '…' : ''}.`
    return null
  })()

  const guardar = async () => {
    if (motivoBloqueo) return
    setGuardando(true)
    setErrores([])
    try {
      const chunk = 400
      const { resumen } = proc

      // a) Choferes: crear los nuevos (con carrier) y actualizar tarifas de los
      // existentes. La tarifa de SpeedX es FIJA por paquete: se guarda el MISMO
      // valor en los 3 campos de precio (individual/doble/stop) para que el
      // motor de pagos de siempre dé paquetes × tarifa sin cambios.
      const nuevosPayload = []
      const updates = {}
      for (const f of filas) {
        const d = buscarDriver(drivers, f.nombre)
        if (d) {
          if (Number(d.precioIndividual) !== f.rate || Number(d.precioDoble) !== f.rate || (Number(d.precioStopAdicional) || 0) !== f.rate || d.activo === false) {
            updates[d.id] = { precioIndividual: f.rate, precioDoble: f.rate, precioStopAdicional: f.rate, activo: true }
          }
        } else {
          nuevosPayload.push({
            nombre: f.nombre,
            precioIndividual: f.rate,
            precioDoble: f.rate,
            precioStopAdicional: f.rate,
            activo: true,
            companyId: activeCompanyId,
            carrier: 'speedx',
            creadoEn: serverTimestamp(),
          })
        }
      }
      for (let i = 0; i < nuevosPayload.length; i += chunk) {
        const batch = writeBatch(db)
        nuevosPayload.slice(i, i + chunk).forEach((p) => batch.set(doc(collection(db, 'drivers')), p))
        await batch.commit()
      }
      const upIds = Object.keys(updates)
      for (let i = 0; i < upIds.length; i += chunk) {
        const batch = writeBatch(db)
        upIds.slice(i, i + chunk).forEach((id) => batch.update(doc(db, 'drivers', id), updates[id]))
        await batch.commit()
      }
      if (nuevosPayload.length || upIds.length) await reloadDrivers()

      // b) La factura. Misma estructura que Gofo + los campos propios de SpeedX
      // (fondo, oficial del DSP Summary y auditoría de importación embebida).
      const { verificacion, avisos: _av, ...resumenSinVerif } = resumen
      const periodoIni = deISO(proc.fechaInicioISO)
      const periodoFin = deISO(proc.fechaFinISO)
      const invoicePayload = {
        companyId: activeCompanyId,
        carrier: 'speedx',
        semana,
        semanaSpeedX: proc.semana, // formato original de SpeedX ("0829-0904")
        archivoNombre: proc.nombreArchivo,
        fechaCarga: serverTimestamp(),
        fechaInicio: periodoIni,
        fechaFin: periodoFin,
        ciudad: proc.ciudad,
        ciudadNombre: proc.ciudad,
        ciudadesMap: proc.ciudad ? { [proc.ciudad]: proc.ciudad } : {},
        fleet: proc.fleet || '',
        modoConfig: 'estandar',
        totalFallidos: 0,
        fallidosPorChofer: {},
        ...resumenSinVerif,
        verificacion,
        oficialSpeedX: proc.oficial || null,
        // FONDO: SpeedX paga la semana con retraso. Control de cobro editable.
        fechaEsperadaCobro: deISO(fechaCobro) || null,
        estadoCobro: 'pendiente',
        fechaCobro: null,
        montoCobrado: null,
        montoACobrar: montoCobro,
        gastosTemporales: [],
        // Auditoría de importación (quién, cuándo, cuántos registros, estado).
        importAudit: {
          carrier: 'speedx',
          archivo: proc.nombreArchivo,
          fecha: new Date().toISOString(),
          usuario: perfil?.email || perfil?.nombre || 'usuario',
          filas: resumen.totalPaquetes,
          aceptados: resumen.totalPaquetes,
          rechazados: 0,
          duplicados: (proc.avisos || []).some((a) => a.includes('repetidos')) ? Number((proc.avisos.find((a) => a.includes('repetidos')) || '0').match(/\d+/)?.[0] || 0) : 0,
          claims: proc.claims.length,
          total: montoCobro,
          cuadra: verificacion.cuadra === true,
          estado: 'completado',
        },
      }
      const ref = await addDoc(collection(db, 'invoices'), invoicePayload)
      registrarAuditoria(activeCompanyId, {
        accion: 'factura_subida',
        usuario: perfil?.email || perfil?.nombre || 'usuario',
        rol: perfil?.role || '',
        entidad: `SpeedX · ${proc.ciudad}`,
        detalle: `Factura SpeedX ${proc.semana} cargada (${num(resumen.totalPaquetes)} paquetes)`,
        ciudad: proc.ciudad || '',
        semana,
        monto: montoCobro,
      })

      // Ciudad de SpeedX: se registra UNA sola vez en el catálogo propio de
      // SpeedX (separado del de Gofo). Si otra factura trae la misma ciudad,
      // se reutiliza la existente — nunca se crea duplicada.
      try {
        const cod = String(proc.ciudad || '').trim()
        const yaExiste = (ciudadesEmpresa || []).some((c) => String(c.codigo || '').toUpperCase() === cod.toUpperCase())
        if (cod && !yaExiste) {
          await guardarCiudadesEmpresa(activeCompanyId, [...(ciudadesEmpresa || []), { codigo: cod, nombre: cod }], 'speedx')
          await reloadAjustes()
        }
      } catch { /* si falla el registro de ciudad no se bloquea el guardado */ }

      // c) Claims — SIEMPRE M2 en SpeedX: se le cobra al chofer exactamente lo
      // que SpeedX nos descontó. Anti-doble-cobro: un tracking ya cobrado en
      // otra factura SpeedX se perdona automáticamente.
      const normWb = (w) => (w || '').trim().toUpperCase()
      const activosPrev = new Set()
      for (const inv of invoices || []) {
        if (inv.companyId !== activeCompanyId) continue
        for (const cc of inv.claimsData || []) {
          if (cc.perdonado === true || (cc.estadoRevision || 'aprobado') === 'anulado') continue
          const w = normWb(cc.waybill)
          if (w) activosPrev.add(w)
        }
      }
      let autoPerdonN = 0
      const claimDocsEmbed = []
      const detPorWaybill = {}
      for (const d of proc.detalles) if (d.waybill && !detPorWaybill[d.waybill]) detPorWaybill[d.waybill] = d
      for (let i = 0; i < proc.claims.length; i += chunk) {
        const batch = writeBatch(db)
        for (const c of proc.claims.slice(i, i + chunk)) {
          const cref = doc(collection(db, 'claims'))
          const autoDup = activosPrev.has(normWb(c.waybill))
          if (autoDup) autoPerdonN++
          const det = detPorWaybill[(c.waybill || '').trim()] || null
          const payload = {
            companyId: activeCompanyId,
            carrier: 'speedx',
            invoiceId: ref.id,
            semana,
            waybill: c.waybill,
            courier: c.courier,
            date: c.date,
            postalCode: c.postalCode,
            claimType: c.claimType,
            categoria: c.categoria,
            metodo: 'M2', // cobramos lo que SpeedX cobra (decisión del dueño)
            montoGofo: c.montoGofo, // negativo: lo que SpeedX nos descontó
            valorPaquete: c.valor,
            feeEntrega: c.delFee,
            ciudad: c.ciudad || '',
            ruta: det?.ruta || c.ruta || '',
            peso: det?.peso ?? null,
            rangoPeso: det?.rangoPeso || '',
            montoEntrega: det?.monto ?? null,
            estadoRevision: 'aprobado',
            esRepetido: false,
            revisadoPor: '',
            revisadoEn: null,
            perdonado: autoDup,
            motivo: autoDup ? `Tracking duplicado ${c.waybill} — ya se cobra en otra factura (auto)` : '',
            perdonadoPor: autoDup ? 'Sistema · anti-duplicado' : '',
            perdonadoEn: autoDup ? new Date().toISOString() : null,
          }
          batch.set(cref, payload)
          claimDocsEmbed.push(payload)
        }
        await batch.commit()
      }
      if (claimDocsEmbed.length && claimDocsEmbed.length <= 1500) {
        await updateDoc(doc(db, 'invoices', ref.id), { claimsData: claimDocsEmbed })
      }

      // d) driverStats para el portal del chofer: MISMO motor de Gofo
      // (calcularPagos ya suma stops × tarifaStop) + calificación vs. la flota.
      const driversFinal = drivers.map((d) => {
        const f = filas.find((x) => keyDe(x.nombre) === keyDe(d.nombre))
        return f ? { ...d, precioIndividual: f.rate, precioDoble: f.rate, precioStopAdicional: f.rate } : d
      })
      for (const f of filas) {
        if (!buscarDriver(driversFinal, f.nombre)) {
          driversFinal.push({ id: `nuevo_${f._key}`, nombre: f.nombre, precioIndividual: f.rate, precioDoble: f.rate, precioStopAdicional: f.rate, activo: true })
        }
      }
      const claimsCalc = claimDocsEmbed.map((c) => ({ ...c }))
      const invCalc = { ...resumenSinVerif, verificacion, modoConfig: 'estandar' }
      const pagosFinal = calcularPagos(invCalc, claimsCalc, driversFinal, TODAS)
      const prom = promediosFlota(pagosFinal)
      const fechaInicioISO = periodoIni ? periodoIni.toISOString() : ''
      const stopsPorChofer = {}
      for (const ch of resumen.resumenChoferes) stopsPorChofer[keyDe(ch.nombre)] = { stops: ch.stopAdicionales || 0, temu: ch.temu || 0 }
      for (let i = 0; i < pagosFinal.length; i += chunk) {
        const batch = writeBatch(db)
        for (const p of pagosFinal.slice(i, i + chunk)) {
          const key = keyDe(p.nombre)
          const extra = stopsPorChofer[key] || { stops: 0, temu: 0 }
          const paquetes = (p.individuales || 0) + (p.dobles || 0) + extra.stops
          const calif = calificarChofer({ ...p, paquetes }, prom)
          const sref = doc(db, 'driverStats', `${ref.id}__${key.replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`)
          batch.set(sref, {
            companyId: activeCompanyId,
            carrier: 'speedx',
            invoiceId: ref.id,
            semana,
            fechaInicioISO,
            driverNombre: p.nombre,
            driverKey: key,
            ciudad: p.ciudad || '',
            individuales: p.individuales,
            dobles: p.dobles,
            stopAdicionales: extra.stops,
            temu: extra.temu,
            paquetes,
            fallidos: 0,
            ingreso: p.ingreso,
            tarifaInd: p.tarifaInd,
            tarifaDoble: p.tarifaDoble,
            tarifaStop: p.tarifaStop || 0,
            claimsTotales: p.claimsTotales,
            claimsActivos: p.claimsActivos,
            claimsPerdonados: p.claimsPerdonados,
            descuentoClaims: p.descuentoClaims,
            descontadoGofo: p.descontadoGofo,
            totalPagar: p.totalPagar,
            ganancia: p.ganancia,
            calificacion: { puntaje: calif.puntaje, estrellas: calif.estrellas, nivel: calif.nivel, etiqueta: calif.etiqueta, desglose: calif.desglose },
          })
        }
        await batch.commit()
      }

      await reloadInvoices()
      await reloadClaims()
      setSelectedInvoiceId(ref.id)
      setGuardado(true)
      setProc(null)
      setTarifas({})
      if (autoPerdonN > 0) setAvisos([`${autoPerdonN} claim(s) se perdonaron automáticamente: ese tracking ya se cobra en otra factura.`])
      else setAvisos([])
    } catch (e) {
      setErrores([t('Error al guardar:') + ' ' + e.message])
    } finally {
      setGuardando(false)
    }
  }

  const v = proc?.verificacion
  const res = proc?.resumen

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">{t('Empresa:')} <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>
        <span className="inline-flex items-center gap-2">{t('Cargar Factura')} <Badge color="navy"><span className="inline-flex items-center gap-1"><Zap size={12} /> SpeedX</span></Badge></span>
      </PageTitle>

      {errores.map((e, i) => <Aviso key={i} tipo="error" className="mb-3">{e}</Aviso>)}
      {guardado && (
        <Aviso tipo="ok" className="mb-3">
          <span className="inline-flex flex-wrap items-center gap-2">
            <CheckCircle2 size={16} /> {t('Factura SpeedX guardada. El cobro quedó registrado como pendiente en')} <button onClick={() => navigate('/cobros')} className="font-bold underline">{t('Cobros y fondo')}</button>.
          </span>
        </Aviso>
      )}
      {avisos.map((a, i) => <Aviso key={`a${i}`} tipo="warn" className="mb-3">{a}</Aviso>)}

      {/* 1) Subir el archivo (uno solo: la factura semanal trae las 5 hojas) */}
      {!proc && (
        <Card className="mb-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivo(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragOver ? 'border-brand-navy bg-brand-navy/5' : 'border-slate-300 hover:border-brand-navy/50 dark:border-slate-600'}`}
          >
            {procesando ? <Spinner /> : <Upload size={28} className="text-brand-navy dark:text-slate-300" />}
            <div className="font-semibold text-brand-navy dark:text-slate-200">{procesando ? t('Leyendo la factura…') : t('Arrastra aquí la factura semanal de SpeedX (.xlsx)')}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('Un solo archivo con sus 5 hojas: PLD, Driver Summary, Claims, Claim Pivot y DSP Summary.')}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { manejarArchivo(e.target.files); e.target.value = '' }} />
          </div>
        </Card>
      )}

      {proc && (
        <>
          {/* 2) Verificación del cuadre (como la de Gofo, con los totales del DSP) */}
          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                <FileSpreadsheet size={17} /> {proc.nombreArchivo}
                <Badge color="slate">{t('Semana')} {proc.semana}</Badge>
                {proc.fleet && <Badge color="slate">{proc.fleet}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {v?.cuadra === true && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} /> {t('Cuadra con SpeedX')}</span></Badge>}
                {v?.cuadra === false && <Badge color="red"><span className="inline-flex items-center gap-1"><AlertTriangle size={13} /> {t('NO cuadra')} ({money(v.diferencia)})</span></Badge>}
                <Boton variant="ghost" onClick={() => { setProc(null); setErrores([]); setAvisos([]) }}><X size={15} /> {t('Descartar')}</Boton>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <KPI label={t('Paquetes')} value={num(res.totalPaquetes)} icon={Package} />
              <KPI label="<1 lb" value={num(res.totalIndividuales)} icon={Package} sub={t('primera entrega')} />
              <KPI label="≥1 lb" value={num(res.totalDobles)} icon={Package} sub={t('primera entrega')} />
              <KPI label={t('Stops adicionales')} value={num(res.totalStopAdicionales)} icon={Layers} sub={t('misma parada')} />
              <KPI label={t('Ingreso (CONFIRM RATE)')} value={money(res.ingresoTotal)} icon={DollarSign} accent="gold" />
              <KPI label={`${t('Claims')} (${res.totalClaims})`} value={money(res.totalDescuentoGofo)} icon={AlertTriangle} accent="red" />
            </div>
            {v?.gofo?.disponible && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">{t('Total oficial de SpeedX (DSP Summary):')}</span>{' '}
                <b className="text-brand-navy dark:text-slate-100">{money(v.gofo.totalGofo)}</b>
                <span className="text-slate-400"> · {t('calculado')}: {money(v.netoCalculado)} · {t('ajustes de la semana previa')}: {money((v.sumaAjustes || 0) + (v.sumaOffset || 0))}</span>
              </div>
            )}
          </Card>

          {/* 3) FONDO: cuándo nos paga SpeedX esta semana (editable) */}
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy text-brand-gold"><PiggyBank size={19} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-brand-navy dark:text-slate-100">{t('Cobro de esta semana (fondo)')}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('SpeedX paga con ~2 semanas en fondo. Fecha estimada')} = {t('fin de semana')} + {diasFondo} {t('días. Puedes ajustarla; el control vive en «Cobros y fondo».')}</div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock size={16} className="text-slate-400" />
                <Input type="date" className="w-40" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} />
                <Badge color="gold">{t('A cobrar:')} {money(montoCobro)}</Badge>
              </div>
            </div>
          </Card>

          {/* Candado anti-duplicados */}
          {duplicada && (
            <Aviso tipo="error" className="mb-4">
              <div className="flex flex-col gap-2">
                <span><b>{t('Candado anti-duplicados:')}</b> {t('la semana')} <b>{proc.semana}</b> {t('ya fue importada en SpeedX')} ({duplicada.archivoNombre || t('factura previa')}). {t('Si la vuelves a guardar, los paquetes y claims se contarían DOS veces.')}</span>
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={confirmarDuplicado} onChange={(e) => setConfirmarDuplicado(e.target.checked)} />
                  {t('Entiendo el riesgo y quiero guardarla de todos modos (por ejemplo, porque borré la anterior).')}
                </label>
              </div>
            </Aviso>
          )}

          {/* 4) Tarifas por chofer (propias, no espejo de SpeedX) + estimación */}
          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                <Truck size={17} /> {t('Tarifas por chofer')} <Badge color="slate">{filas.length}</Badge>
                {choferesSinTarifa.length > 0 && <Badge color="red">{choferesSinTarifa.length} {t('sin tarifa')}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('Rellenar a todos:')}</span>
                <Input type="number" step="0.01" min="0" placeholder={t('$ por paquete')} className="w-32" value={bulk.rate} onChange={(e) => setBulk({ rate: e.target.value })} />
                <Boton variant="ghost" onClick={aplicarBulk}>{t('Aplicar')}</Boton>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {t('Lo que TÚ le pagas a cada chofer: una tarifa FIJA por paquete (todos sus paquetes valen lo mismo, sin importar peso ni stops). Lo que SpeedX TE paga a ti sale solo de la factura (columna «SpeedX te paga»). Los claims se descuentan con el método M2: al chofer se le cobra exactamente lo que SpeedX te descontó.')}
            </p>
            <Tabla
              minWidth="min-w-[900px]"
              columns={[
                { key: 'nombre', label: t('Chofer') },
                { key: 'paquetes', label: t('Paquetes'), align: 'right' },
                { key: 'individuales', label: '<1 lb', align: 'right' },
                { key: 'dobles', label: '≥1 lb', align: 'right' },
                { key: 'stopAdicionales', label: t('Stops'), align: 'right' },
                { key: 'ingreso', label: t('SpeedX te paga'), align: 'right' },
                { key: 'rate', label: t('Tarifa por paquete'), align: 'center' },
                { key: 'claimsMonto', label: t('Claims (M2)'), align: 'right' },
                { key: 'total', label: t('Pago estimado'), align: 'right' },
              ]}
              rows={filas}
              renderCell={(row, key) => {
                if (key === 'nombre') return <span className="font-semibold text-brand-navy dark:text-slate-100">{row.nombre} {row.nuevo && <Badge color="gold">{t('nuevo')}</Badge>}</span>
                if (key === 'paquetes') return <b>{num(row.paquetes)}</b>
                if (key === 'individuales' || key === 'dobles' || key === 'stopAdicionales') return num(row[key])
                if (key === 'ingreso') return money(row.ingreso)
                if (key === 'rate') {
                  const val = tarifas[row._key]?.rate ?? ''
                  return <Input type="number" step="0.01" min="0" className={`w-24 text-right ${!(Number(val) > 0) ? 'border-rose-400' : ''}`} value={val} onChange={(e) => setTarifa(row.nombre, 'rate', e.target.value)} />
                }
                if (key === 'claimsMonto') return row.claimsMonto ? <span className="text-rose-600 dark:text-rose-400">−{money(row.claimsMonto)}</span> : '—'
                if (key === 'total') return <b className={row.total >= 0 ? 'text-brand-navy dark:text-slate-100' : 'text-rose-600'}>{money(row.total)}</b>
                return row[key]
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">
                {t('Ingreso')}: <b className="text-brand-navy dark:text-slate-200">{money(res.ingresoTotal + res.totalDescuentoGofo)}</b> ({t('neto de claims')}) · {t('Pago a choferes (estimado)')}: <b className="text-brand-navy dark:text-slate-200">{money(totalPagoChoferes)}</b> · {t('Margen estimado')}: <b className="text-brand-gold">{money(r2(res.ingresoTotal + res.totalDescuentoGofo - totalPagoChoferes))}</b>
              </span>
              <div className="flex items-center gap-3">
                {motivoBloqueo && <span className="text-xs font-semibold text-amber-600">{motivoBloqueo}</span>}
                <Boton onClick={guardar} disabled={!!motivoBloqueo}>
                  {guardando ? <Spinner /> : <Save size={16} />} {t('Guardar factura SpeedX')}
                </Boton>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
