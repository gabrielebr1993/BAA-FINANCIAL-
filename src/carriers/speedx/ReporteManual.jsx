// ============================================================================
// SPEEDX · REPORTE MANUAL — plan B cuando la factura oficial llega tarde.
//
// SpeedX envía su reporte los martes, pero a veces se retrasa y los choferes
// no pueden esperar. Esta pantalla acepta un reporte provisional (basta con
// que traiga la hoja de paquetes "PLD"; claims y totales oficiales son
// opcionales), calcula CUÁNTO PAGARLE A CADA CHOFER con sus tarifas
// guardadas y lo descarga en Excel/PDF para pagar hoy mismo.
//
// IMPORTANTE: aquí NO se guarda nada en el sistema (ni factura, ni claims,
// ni estadísticas). Cuando llegue la factura oficial se sube en «Cargar
// Factura» como siempre y ahí queda todo registrado UNA sola vez.
// ============================================================================
import { useState, useRef, useMemo, useEffect } from 'react'
import { collection, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../AuthContext'
import { useData } from '../../DataContext'
import { procesarArchivoSpeedX, procesarReporteRutasSpeedX } from './parser'
import { construirResumenSpeedX } from './resumen'
import { buscarDriver } from '../../utils/calc'
import { exportarExcel, exportarPDF } from '../../utils/exportar'
import { money, num } from '../../utils/format'
import { Upload, FileClock, Package, DollarSign, AlertTriangle, X, FileSpreadsheet, FileText, Info, Layers, CheckCircle2, Trash2, ChevronDown, ChevronUp, Save, MapPin } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

const keyDe = (n) => (n || '').trim().toLowerCase()
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const deISO = (iso) => {
  if (!iso) return null
  const [y, mm, dd] = String(iso).split('-').map(Number)
  return new Date(y, (mm || 1) - 1, dd || 1, 12)
}
const fmtF = (d) => {
  const dt = d?.toDate ? d.toDate() : d instanceof Date ? d : null
  return dt ? dt.toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—'
}

export default function ReporteManual() {
  const { t } = useLang()
  const { perfil } = useAuth()
  const { drivers, empresaActiva, activeCompanyId, provisionales, reloadInvoices } = useData()

  const [procesando, setProcesando] = useState(false)
  const [proc, setProc] = useState(null)
  const [errores, setErrores] = useState([])
  const [avisos, setAvisos] = useState([])
  const [tarifas, setTarifas] = useState({}) // key → { ind, dob } (solo local, no se guarda)
  const [bulk, setBulk] = useState({ ind: '', dob: '' })
  const [dragOver, setDragOver] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [okMsg, setOkMsg] = useState('')
  const [abierto, setAbierto] = useState(null) // provisional expandido en la lista
  const [rango, setRango] = useState(null) // { ini, fin } ISO — días del reporte que se PAGAN
  const [ciudadSel, setCiudadSel] = useState('') // ciudad detectada del reporte (editable)
  // Lo que SPEEDX TE PAGA (estimado): por paquete individual y por doble.
  // Opcional — sirve para estimar tu ingreso y margen antes de la factura.
  // Se recuerda por ciudad en este navegador.
  const [pagoSpx, setPagoSpx] = useState({ ind: '', dob: '' })
  // Descuentos MANUALES por chofer (adelantos, préstamos, etc.): se restan del
  // total a pagar de este cálculo. Solo viven aquí (y en el provisional).
  const [descuentos, setDescuentos] = useState({})
  const [provEdit, setProvEdit] = useState(null) // provisional PENDIENTE abierto para editar
  const [filtroCiudad, setFiltroCiudad] = useState('') // filtro de la lista ('' = todas)
  const inputRef = useRef(null)

  // Soltar el archivo en cualquier parte de la página (sin abrir otra pestaña).
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

  const manejarArchivo = async (fileList) => {
    const f = Array.from(fileList || []).find((x) => /\.xlsx?$/i.test(x.name))
    if (!f) return setErrores([t('El reporte debe ser un archivo .xlsx.')])
    setProcesando(true)
    setErrores([])
    setAvisos([])
    try {
      const buf = await f.arrayBuffer()
      // Acepta DOS formatos: la factura semanal (hoja PLD) o el reporte de
      // rutas descargable (route_parcel_info, hoja "result").
      let p
      try { p = procesarArchivoSpeedX(buf, f.name) }
      catch { p = procesarReporteRutasSpeedX(buf, f.name) }
      setProc(p)
      setProvEdit(null)
      // Por defecto se paga TODO el reporte; abajo se puede acotar por semana
      // (sábado a viernes) o por un rango de días a mano.
      setRango({ ini: p.fechaInicioISO || '', fin: p.fechaFinISO || '' })
      // Ciudad DETECTADA del nombre del fleet (p. ej. "CHS - B&J…" → CHS);
      // editable por si el reporte viene raro o quieres otro código.
      setCiudadSel(p.ciudad || '')
      setDescuentos({})
      try { setPagoSpx(JSON.parse(localStorage.getItem(`mp_spx_paga_${p.ciudad || ''}`) || '{"ind":"","dob":""}')) } catch { setPagoSpx({ ind: '', dob: '' }) }
      // En un reporte provisional es NORMAL que falten hojas: se avisa suave.
      setAvisos([...(p.avisos || [])].filter((a) => !a.includes('DSP Summary') && !a.includes('hoja "Claims"')))
      const tf = {}
      for (const nombre of [...new Set(p.detalles.map((d) => d.courier))]) {
        const d = buscarDriver(drivers, nombre)
        tf[keyDe(nombre)] = {
          ind: d && Number(d.precioIndividual) > 0 ? String(d.precioIndividual) : '',
          dob: d && Number(d.precioDoble) > 0 ? String(d.precioDoble) : '',
        }
      }
      setTarifas(tf)
    } catch (e) {
      setProc(null)
      setErrores([t('No se pudo leer el reporte:') + ' ' + e.message])
    } finally {
      setProcesando(false)
    }
  }
  manejarRef.current = manejarArchivo

  const setTarifa = (nombre, campo, valor) => setTarifas((tf) => ({ ...tf, [keyDe(nombre)]: { ...tf[keyDe(nombre)], [campo]: valor } }))
  const aplicarBulk = () => {
    // Aplica sobre las filas VISIBLES: funciona igual con un archivo recién
    // subido que al reabrir un provisional guardado.
    setTarifas((tf) => {
      const nx = { ...tf }
      for (const f of filas) {
        const k = f._key
        nx[k] = { ind: bulk.ind !== '' ? bulk.ind : nx[k]?.ind || '', dob: bulk.dob !== '' ? bulk.dob : nx[k]?.dob || '' }
      }
      return nx
    })
  }

  // Semanas SÁBADO→VIERNES presentes en el reporte (el corte del dueño), con
  // su conteo de paquetes, para elegir cuál pagar de un clic.
  const semanasDetectadas = useMemo(() => {
    // Días disponibles: del archivo procesado o del desglose por día guardado
    // en el provisional (así el selector de periodo también funciona al reabrir).
    const dias = proc
      ? proc.detalles.map((d) => ({ fecha: d.fecha, n: 1 }))
      : (provEdit?.porDia || []).map((r) => ({ fecha: r.f, n: (r.i || 0) + (r.d || 0) }))
    if (!dias.length) return []
    const buckets = {}
    for (const d of dias) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) continue
      const dt = deISO(d.fecha)
      const desdeSab = (dt.getDay() + 1) % 7 // sábado=0
      const ini = new Date(dt); ini.setDate(ini.getDate() - desdeSab)
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6)
      const aI = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
      const k = aI(ini)
      buckets[k] = buckets[k] || { ini: aI(ini), fin: aI(fin), n: 0 }
      buckets[k].n += d.n
    }
    return Object.values(buckets).sort((a, b) => (a.ini < b.ini ? -1 : 1))
  }, [proc, provEdit])

  // Resumen SOLO de los días elegidos (los dobles ya vienen calculados por
  // parada y las rutas son de un día, así que filtrar por fecha es exacto).
  const res = useMemo(() => {
    if (!proc) return null
    const del = proc.detalles.filter((d) => (!rango?.ini || d.fecha >= rango.ini) && (!rango?.fin || d.fecha <= rango.fin))
    if (!del.length) return construirResumenSpeedX({ ...proc, detalles: proc.detalles.slice(0, 1), claims: [] })
    return construirResumenSpeedX({ ...proc, detalles: del })
  }, [proc, rango])
  const mmdd = (iso) => (iso ? String(iso).slice(5, 7) + String(iso).slice(8, 10) : '')
  const semanaSel = rango?.ini ? `${mmdd(rango.ini)}-${mmdd(rango.fin)}` : proc?.semana || ''

  const claimsPorChofer = useMemo(() => {
    const m = {}
    for (const c of proc?.claims || []) m[keyDe(c.courier)] = (m[keyDe(c.courier)] || 0) + Math.abs(c.montoGofo)
    return m
  }, [proc])

  const filas = useMemo(() => {
    // Base: el archivo procesado o, en modo edición, las filas GUARDADAS del
    // provisional (conteos fijos; tarifas y descuentos editables).
    const clGuardados = Object.fromEntries(((provEdit?.claimsCh) || []).map((c) => [keyDe(c.n), c.m || 0]))
    const base = proc
      ? (res?.resumenChoferes || [])
      : (provEdit?.porDia || []).length
        ? (() => {
            // Con desglose por día guardado: recontar según el rango elegido.
            const acc = {}
            for (const r of provEdit.porDia) {
              if (rango?.ini && r.f < rango.ini) continue
              if (rango?.fin && r.f > rango.fin) continue
              const k = keyDe(r.n)
              acc[k] = acc[k] || { nombre: r.n, individuales: 0, dobles: 0 }
              acc[k].individuales += r.i || 0
              acc[k].dobles += r.d || 0
            }
            return Object.values(acc).map((x) => ({ ...x, _claims: clGuardados[keyDe(x.nombre)] || 0 }))
          })()
        : (provEdit?.filas || []).map((f) => ({ nombre: f.nombre, individuales: f.individuales || 0, dobles: f.dobles || 0, _claims: f.claims || 0 }))
    if (!base.length) return []
    return base.map((ch) => {
      const k = keyDe(ch.nombre)
      const tInd = Number(tarifas[k]?.ind) || 0
      const tDob = Number(tarifas[k]?.dob) || 0
      const paquetes = ch.individuales + ch.dobles
      const pago = ch.individuales * tInd + ch.dobles * tDob
      const claims = proc ? (claimsPorChofer[k] || 0) : (ch._claims || 0)
      const desc = Number(descuentos[k]) || 0
      return { ...ch, _key: k, tInd, tDob, paquetes, pago: r2(pago), claimsMonto: r2(claims), desc: r2(desc), total: r2(pago - claims - desc), listo: tInd > 0 && tDob > 0 }
    }).sort((a, b) => b.total - a.total)
  }, [proc, res, provEdit, rango, tarifas, claimsPorChofer, descuentos])

  const totalPagar = r2(filas.reduce((a, f) => a + f.total, 0))
  const spxInd = Number(pagoSpx.ind) || 0
  const spxDob = Number(pagoSpx.dob) || 0
  const ingresoEst = r2(filas.reduce((a, f) => a + f.individuales, 0) * spxInd + filas.reduce((a, f) => a + f.dobles, 0) * spxDob)
  const setPagoSpxCampo = (campo, valor) => setPagoSpx((x) => {
    const nx = { ...x, [campo]: valor }
    try { localStorage.setItem(`mp_spx_paga_${(ciudadSel || '').trim().toUpperCase()}`, JSON.stringify(nx)) } catch { /* noop */ }
    return nx
  })
  const sinTarifa = filas.filter((f) => !f.listo)
  const hayClaims = (proc?.claims || []).length > 0

  const filasExport = () => ([
    ...filas.map((f) => ({
      [t('Chofer')]: f.nombre,
      [t('Paquetes')]: f.paquetes,
      [t('Individuales')]: f.individuales,
      [t('Dobles')]: f.dobles,
      [t('Tarifa individual')]: f.tInd,
      [t('Tarifa doble')]: f.tDob,
      [t('Claims (M2)')]: -f.claimsMonto,
      [t('Descuento')]: -f.desc,
      [t('Total a pagar')]: f.total,
    })),
    {
      [t('Chofer')]: 'TOTAL',
      [t('Paquetes')]: filas.reduce((a, f) => a + f.paquetes, 0),
      [t('Individuales')]: filas.reduce((a, f) => a + f.individuales, 0),
      [t('Dobles')]: filas.reduce((a, f) => a + f.dobles, 0),
      [t('Tarifa individual')]: '',
      [t('Tarifa doble')]: '',
      [t('Claims (M2)')]: -r2(filas.reduce((a, f) => a + f.claimsMonto, 0)),
      [t('Descuento')]: -r2(filas.reduce((a, f) => a + f.desc, 0)),
      [t('Total a pagar')]: totalPagar,
    },
    ...(ingresoEst > 0 ? [
      { [t('Chofer')]: t('SpeedX te pagará (estimado)'), [t('Total a pagar')]: ingresoEst },
      { [t('Chofer')]: t('Margen estimado'), [t('Total a pagar')]: r2(ingresoEst - totalPagar) },
    ] : []),
  ])

  const descargarExcel = () => {
    exportarExcel(`pagos_provisionales_speedx_${semanaSel || 'semana'}`, [{ nombre: 'Pagos', rows: filasExport() }])
  }
  const descargarPDF = async () => {
    await exportarPDF(
      `pagos_provisionales_speedx_${semanaSel || 'semana'}`,
      empresaActiva?.nombre || 'MilePay',
      `${t('Pagos PROVISIONALES a choferes (reporte manual SpeedX)')} · ${t('Semana')} ${semanaSel}`,
      [{
        titulo: t('Pagos por chofer'),
        head: [t('Chofer'), t('Paquetes'), t('Individuales'), t('Dobles'), t('Tarifa individual'), t('Tarifa doble'), t('Claims (M2)'), t('Descuento'), t('Total a pagar')],
        body: [
          ...filas.map((f) => [f.nombre, num(f.paquetes), num(f.individuales), num(f.dobles), money(f.tInd), money(f.tDob), f.claimsMonto ? `−${money(f.claimsMonto)}` : '—', f.desc ? `−${money(f.desc)}` : '—', money(f.total)]),
          ['TOTAL', num(filas.reduce((a, f) => a + f.paquetes, 0)), '', '', '', '', '', `−${money(r2(filas.reduce((a, f) => a + f.desc, 0)))}`, money(totalPagar)],
          ...(ingresoEst > 0 ? [
            [t('SpeedX te pagará (estimado)'), '', '', '', '', '', '', '', money(ingresoEst)],
            [t('Margen estimado'), '', '', '', '', '', '', '', money(r2(ingresoEst - totalPagar))],
          ] : []),
        ],
      }]
    )
  }

  // Guarda el cálculo como PROVISIONAL PENDIENTE: cuando se suba la factura
  // oficial de la misma semana/ciudad, el sistema los compara chofer a chofer.
  const guardarProvisional = async () => {
    if (!proc || guardando) return
    setGuardando(true)
    setOkMsg('')
    try {
      await addDoc(collection(db, 'invoices'), {
        companyId: activeCompanyId,
        carrier: 'speedx',
        provisional: true,
        estado: 'pendiente',
        semana: semanaSel,
        ciudad: (ciudadSel || proc.ciudad || '').trim().toUpperCase(),
        archivoNombre: proc.nombreArchivo || '',
        fechaCarga: serverTimestamp(),
        fechaInicio: deISO(rango?.ini || proc.fechaInicioISO),
        fechaFin: deISO(rango?.fin || proc.fechaFinISO),
        totalPagar,
        totalPaquetes: res.totalPaquetes,
        ...(ingresoEst > 0 ? { ingresoEstimado: ingresoEst, pagoSpeedX: { ind: spxInd, dob: spxDob } } : {}),
        creadoPor: perfil?.email || perfil?.nombre || '',
        filas: filas.map((f) => ({ nombre: f.nombre, paquetes: f.paquetes, individuales: f.individuales, dobles: f.dobles, tInd: f.tInd, tDob: f.tDob, claims: f.claimsMonto, descuento: f.desc, total: f.total })),
        // Desglose por DÍA y chofer de TODO el reporte (compacto): permite
        // reabrir el pendiente y volver a elegir el periodo.
        porDia: (() => {
          const acc = {}
          for (const d of proc.detalles) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) continue
            const k = `${d.fecha}||${keyDe(d.courier)}`
            acc[k] = acc[k] || { f: d.fecha, n: d.courier, i: 0, d: 0 }
            if (d.esStopAdicional) acc[k].d++
            else acc[k].i++
          }
          return Object.values(acc)
        })(),
        claimsCh: Object.entries(claimsPorChofer).map(([k, m]) => ({ n: k, m: r2(m) })),
        fechasReporte: { ini: proc.fechaInicioISO || '', fin: proc.fechaFinISO || '' },
      })
      await reloadInvoices()
      setOkMsg(t('Provisional guardado como PENDIENTE. Cuando subas la factura oficial de esa semana, lo comparo automáticamente y te muestro las diferencias.'))
    } catch (e) {
      setErrores([t('Error al guardar:') + ' ' + e.message])
    } finally {
      setGuardando(false)
    }
  }
  const aISOx = (d) => {
    const dt = d?.toDate ? d.toDate() : d instanceof Date ? d : null
    return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : ''
  }
  // Reabre un provisional PENDIENTE para ajustar tarifas/descuentos y volver a guardar.
  const abrirProvisional = (pr) => {
    setProc(null); setErrores([]); setAvisos([]); setOkMsg('')
    setProvEdit(pr)
    setCiudadSel(pr.ciudad || '')
    setRango({ ini: aISOx(pr.fechaInicio), fin: aISOx(pr.fechaFin) })
    const tf = {}, ds = {}
    for (const f of pr.filas || []) {
      tf[keyDe(f.nombre)] = { ind: f.tInd ? String(f.tInd) : '', dob: f.tDob ? String(f.tDob) : '' }
      if (f.descuento) ds[keyDe(f.nombre)] = String(f.descuento)
    }
    // Choferes que pueden entrar al ampliar el periodo: tarifa del perfil.
    for (const r of pr.porDia || []) {
      const k = keyDe(r.n)
      if (!tf[k]) {
        const d = buscarDriver(drivers, r.n)
        tf[k] = { ind: d && Number(d.precioIndividual) > 0 ? String(d.precioIndividual) : '', dob: d && Number(d.precioDoble) > 0 ? String(d.precioDoble) : '' }
      }
    }
    setTarifas(tf)
    setDescuentos(ds)
    setPagoSpx(pr.pagoSpeedX ? { ind: String(pr.pagoSpeedX.ind || ''), dob: String(pr.pagoSpeedX.dob || '') } : { ind: '', dob: '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const guardarCambiosProvisional = async () => {
    if (!provEdit || guardando) return
    setGuardando(true)
    setOkMsg('')
    try {
      await updateDoc(doc(db, 'invoices', provEdit.id), {
        ciudad: (ciudadSel || provEdit.ciudad || '').trim().toUpperCase(),
        totalPagar,
        semana: semanaSel || provEdit.semana || '',
        ...(rango?.ini ? { fechaInicio: deISO(rango.ini), fechaFin: deISO(rango.fin) } : {}),
        totalPaquetes: filas.reduce((a, f) => a + f.paquetes, 0),
        actualizadoEn: new Date().toISOString(),
        ...(ingresoEst > 0 ? { ingresoEstimado: ingresoEst, pagoSpeedX: { ind: spxInd, dob: spxDob } } : {}),
        // El desglose por día (porDia), claimsCh y fechasReporte YA están en el
        // documento y no cambian al editar: no se tocan.
        filas: filas.map((f) => ({ nombre: f.nombre, paquetes: f.paquetes, individuales: f.individuales, dobles: f.dobles, tInd: f.tInd, tDob: f.tDob, claims: f.claimsMonto, descuento: f.desc, total: f.total })),
      })
      await reloadInvoices()
      setOkMsg(t('Cambios guardados en el provisional pendiente.'))
      setProvEdit(null)
    } catch (e) {
      setErrores([t('Error al guardar:') + ' ' + e.message])
    } finally {
      setGuardando(false)
    }
  }
  const borrarProvisional = async (pr) => {
    if (!window.confirm(`${t('¿Eliminar el provisional de la semana')} ${pr.semana}?`)) return
    await deleteDoc(doc(db, 'invoices', pr.id))
    await reloadInvoices()
  }
  const provisionalesOrdenados = [...(provisionales || [])]
    .filter((pr) => !filtroCiudad || (pr.ciudad || '') === filtroCiudad)
    .sort((a, b) => (b.fechaCarga?.seconds || 0) - (a.fechaCarga?.seconds || 0))
  const ciudadesProv = [...new Set((provisionales || []).map((pr) => pr.ciudad || '').filter(Boolean))].sort()

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">{t('Empresa:')} <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>
        <span className="inline-flex items-center gap-2"><FileClock size={22} /> {t('Reporte manual')} <Badge color="navy">SpeedX</Badge></span>
      </PageTitle>

      <Aviso tipo="info" className="mb-4">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Info size={15} className="flex-shrink-0" />
          <span><b>{t('Plan B para no retrasar los pagos:')}</b> {t('si la factura oficial de SpeedX viene tarde, sube aquí el reporte provisional que te manden. Calculo cuánto pagarle a cada chofer y te lo descargas en Excel o PDF.')} <b>{t('Aquí NO se guarda nada')}</b>{t(': cuando llegue la factura oficial, súbela en «Cargar Factura» como siempre y ahí queda todo registrado en el dashboard, sin duplicados.')}</span>
        </span>
      </Aviso>

      {errores.map((e, i) => <Aviso key={i} tipo="error" className="mb-3">{e}</Aviso>)}
      {okMsg && <Aviso tipo="ok" className="mb-3"><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {okMsg}</span></Aviso>}
      {avisos.map((a, i) => <Aviso key={`a${i}`} tipo="warn" className="mb-3">{a}</Aviso>)}

      {/* Provisionales guardados: pendientes de verificar y ya verificados */}
      {(provisionalesOrdenados.length > 0 || filtroCiudad) && (
        <Card className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Provisionales guardados')}</h3>
            {ciudadesProv.length > 1 && (
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setFiltroCiudad('')}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${!filtroCiudad ? 'border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {t('Todas')}
                </button>
                {ciudadesProv.map((c) => (
                  <button type="button" key={c} onClick={() => setFiltroCiudad(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${filtroCiudad === c ? 'border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {c}
                  </button>
                ))}
              </span>
            )}
          </div>
          {provisionalesOrdenados.length === 0 && <p className="py-2 text-sm text-slate-400">{t('No hay provisionales de esa ciudad.')}</p>}
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {provisionalesOrdenados.map((pr) => {
              const verificado = pr.estado === 'verificado'
              const comp = pr.comparacion
              const abiertoEste = abierto === pr.id
              return (
                <div key={pr.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={verificado ? 'green' : 'gold'}>{verificado ? t('VERIFICADO') : t('PENDIENTE')}</Badge>
                    <span className="font-semibold text-brand-navy dark:text-slate-100">{pr.ciudad} · {t('Semana')} {pr.semana}</span>
                    <span className="text-xs text-slate-400">{fmtF(pr.fechaInicio)} – {fmtF(pr.fechaFin)} · {num(pr.totalPaquetes || 0)} {t('paquetes')}</span>
                    <span className="ml-auto font-bold text-brand-navy dark:text-slate-100">{money(pr.totalPagar || 0)}</span>
                    {verificado && comp && (
                      <button onClick={() => setAbierto(abiertoEste ? null : pr.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy dark:text-slate-200">
                        {t('Diferencias')} {abiertoEste ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                    {!verificado && (
                      <button onClick={() => abrirProvisional(pr)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-brand-navy transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/40">{t('Abrir')}</button>
                    )}
                    <button onClick={() => borrarProvisional(pr)} className="text-slate-400 transition hover:text-rose-500" title={t('Eliminar')}><Trash2 size={15} /></button>
                  </div>
                  {verificado && comp && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t('Pagaste (provisional)')} <b>{money(comp.totalProvisional)}</b> · {t('lo correcto (factura oficial)')} <b>{money(comp.totalOficial)}</b> · {t('diferencia')}{' '}
                      <b className={comp.diferencia > 0 ? 'text-amber-600' : comp.diferencia < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {comp.diferencia > 0 ? '+' : ''}{money(comp.diferencia)}
                      </b>{' '}
                      {comp.diferencia > 0 ? t('(pagaste de más: descuéntalo en la próxima semana)') : comp.diferencia < 0 ? t('(pagaste de menos: debes la diferencia)') : t('(cuadró exacto)')}
                    </div>
                  )}
                  {verificado && comp && abiertoEste && (
                    <div className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-slate-400"><th className="py-1">{t('Chofer')}</th><th className="text-right">{t('Provisional')}</th><th className="text-right">{t('Oficial')}</th><th className="text-right">{t('Diferencia')}</th></tr></thead>
                        <tbody>
                          {(comp.porChofer || []).filter((c) => Math.abs(c.diferencia) >= 0.01).map((c, i) => (
                            <tr key={i} className="border-t border-slate-200 dark:border-slate-700/60">
                              <td className="py-1 font-medium">{c.nombre}</td>
                              <td className="text-right">{money(c.provisional)}</td>
                              <td className="text-right">{money(c.oficial)}</td>
                              <td className={`text-right font-bold ${c.diferencia > 0 ? 'text-amber-600' : 'text-rose-600'}`}>{c.diferencia > 0 ? '+' : ''}{money(c.diferencia)}</td>
                            </tr>
                          ))}
                          {(comp.porChofer || []).every((c) => Math.abs(c.diferencia) < 0.01) && (
                            <tr><td colSpan={4} className="py-1 text-emerald-600">{t('Todos los choferes cuadraron exacto.')}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {!proc && !provEdit && (
        <Card className="mb-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivo(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragOver ? 'border-brand-navy bg-brand-navy/5' : 'border-slate-300 hover:border-brand-navy/50 dark:border-slate-600'}`}
          >
            {procesando ? <Spinner /> : <Upload size={28} className="text-brand-navy dark:text-slate-300" />}
            <div className="font-semibold text-brand-navy dark:text-slate-200">{procesando ? t('Leyendo el reporte…') : t('Arrastra aquí el reporte provisional de SpeedX (.xlsx)')}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('Basta con que traiga la hoja de paquetes (PLD). Si trae claims, también se descuentan.')}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { manejarArchivo(e.target.files); e.target.value = '' }} />
          </div>
        </Card>
      )}

      {(proc || provEdit) && (
        <>
          {provEdit && (
            <Card className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="gold">{t('EDITANDO PENDIENTE')}</Badge>
                <span className="font-bold text-brand-navy dark:text-slate-100">{provEdit.ciudad} · {t('Semana')} {provEdit.semana}</span>
                <span className="text-xs text-slate-400">{fmtF(provEdit.fechaInicio)} – {fmtF(provEdit.fechaFin)} · {provEdit.archivoNombre}</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin size={14} className="text-brand-gold" /> {t('Ciudad:')}
                  <Input className="w-20 uppercase" value={ciudadSel} onChange={(e) => setCiudadSel(e.target.value)} />
                </span>
                <span className="ml-auto inline-flex items-center gap-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{t('Por paquete:')}</span>
                  <Input type="number" step="0.01" min="0" className="w-24" placeholder="$" value={pagoSpx.ind} onChange={(e) => setPagoSpxCampo('ind', e.target.value)} />
                  <span className="text-slate-500 dark:text-slate-400">{t('Por doble:')}</span>
                  <Input type="number" step="0.01" min="0" className="w-24" placeholder="$" value={pagoSpx.dob} onChange={(e) => setPagoSpxCampo('dob', e.target.value)} />
                </span>
              </div>
            </Card>
          )}
          {proc && (
          <>
          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                <FileSpreadsheet size={17} /> {proc.nombreArchivo}
                <Badge color="slate">{t('Días pagados')}: {rango?.ini ? `${fmtF(deISO(rango.ini))} – ${fmtF(deISO(rango.fin))}` : proc.semana}</Badge>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400" title={t('Detectada del nombre del fleet en el reporte; puedes corregirla')}>
                  <MapPin size={14} className="text-brand-gold" /> {t('Ciudad:')}
                  <Input className="w-20 uppercase" value={ciudadSel} onChange={(e) => setCiudadSel(e.target.value)} />
                </span>
                <Badge color="gold">{t('PROVISIONAL — no se guarda')}</Badge>
              </div>
              <Boton variant="ghost" onClick={() => { setProc(null); setErrores([]); setAvisos([]) }}><X size={15} /> {t('Descartar')}</Boton>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <KPI label={t('Paquetes')} value={num(res.totalPaquetes)} icon={Package} />
              <KPI label={t('Individuales')} value={num(res.totalIndividuales)} icon={Package} sub={t('primer paquete de la parada')} />
              <KPI label={t('Dobles')} value={num(res.totalDobles)} icon={Layers} sub={t('paquete extra en la misma parada')} />
              <KPI label={`${t('Claims')} (${res.totalClaims})`} value={money(res.totalDescuentoGofo)} icon={AlertTriangle} accent="red" sub={hayClaims ? undefined : t('este reporte no trae claims')} />
              <KPI label={t('Total a pagar a choferes')} value={money(totalPagar)} icon={DollarSign} accent="gold" />
              {ingresoEst > 0 && <KPI label={t('SpeedX te pagará (estimado)')} value={money(ingresoEst)} icon={DollarSign} accent="green" sub={`${money(spxInd)} ${t('ind.')} · ${money(spxDob)} ${t('doble')}`} />}
              {ingresoEst > 0 && <KPI label={t('Margen estimado')} value={money(r2(ingresoEst - totalPagar))} icon={DollarSign} accent={ingresoEst - totalPagar >= 0 ? 'gold' : 'red'} sub={t('ingreso est. − pago a choferes')} />}
            </div>
            {/* Lo que SpeedX te paga (para el estimado de ingreso/margen) */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <span className="font-semibold text-brand-navy dark:text-slate-200">{t('¿Cuánto te paga SpeedX?')}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('(opcional — estima tu ingreso y margen antes de la factura)')}</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">{t('Por paquete:')}</span>
              <Input type="number" step="0.01" min="0" className="w-24" placeholder="$" value={pagoSpx.ind} onChange={(e) => setPagoSpxCampo('ind', e.target.value)} />
              <span className="text-slate-500 dark:text-slate-400">{t('Por doble:')}</span>
              <Input type="number" step="0.01" min="0" className="w-24" placeholder="$" value={pagoSpx.dob} onChange={(e) => setPagoSpxCampo('dob', e.target.value)} />
            </div>
            {!hayClaims && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {t('Este reporte no trae claims: el pago provisional sale sin descuentos. Los claims se descontarán cuando subas la factura oficial de la semana.')}
              </p>
            )}
          </Card>

          </>
          )}

          {/* ¿QUÉ DÍAS SE PAGAN? El reporte puede mezclar semanas (el corte es
              sábado→viernes): elige una semana de un clic o marca un rango a mano.
              También al REABRIR un pendiente (usa el desglose por día guardado). */}
          {(proc || (provEdit?.porDia || []).length > 0) && (
          <Card className="mb-4">
            <div className="mb-2 font-bold text-brand-navy dark:text-slate-100">{t('¿Qué días vas a pagar?')}</div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('Tu semana va de sábado a viernes. El reporte puede traer días de dos semanas: elige la semana correcta o marca solo los días que vas a pagar, y el cálculo usa únicamente esos días.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const todo = proc
                  ? { ini: proc.fechaInicioISO || '', fin: proc.fechaFinISO || '' }
                  : { ini: provEdit?.fechasReporte?.ini || '', fin: provEdit?.fechasReporte?.fin || '' }
                const on = rango?.ini === todo.ini && rango?.fin === todo.fin
                return (
                  <button type="button" onClick={() => setRango(todo)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {t('Todo el reporte')}
                  </button>
                )
              })()}
              {semanasDetectadas.map((w) => {
                const on = rango?.ini === w.ini && rango?.fin === w.fin
                return (
                  <button key={w.ini} type="button" onClick={() => setRango({ ini: w.ini, fin: w.fin })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {t('Semana')} {fmtF(deISO(w.ini))} – {fmtF(deISO(w.fin))} · {num(w.n)} {t('paq.')}
                  </button>
                )
              })}
              <span className="mx-1 hidden text-slate-300 sm:inline">|</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('A mano:')}</span>
              <Input type="date" className="w-40" value={rango?.ini || ''} onChange={(e) => setRango((r) => ({ ...r, ini: e.target.value }))} />
              <Input type="date" className="w-40" value={rango?.fin || ''} onChange={(e) => setRango((r) => ({ ...r, fin: e.target.value }))} />
              <Badge color="navy">{num(proc ? res.totalPaquetes : filas.reduce((a, f) => a + f.paquetes, 0))} {t('paquetes en el rango')}</Badge>
            </div>
          </Card>
          )}

          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                {t('Pagos por chofer')} <Badge color="slate">{filas.length}</Badge>
                {sinTarifa.length > 0 && <Badge color="red">{sinTarifa.length} {t('sin tarifa')}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('Rellenar a todos:')}</span>
                <Input type="number" step="0.01" min="0" placeholder={t('Individual')} className="w-28" value={bulk.ind} onChange={(e) => setBulk((b) => ({ ...b, ind: e.target.value }))} />
                <Input type="number" step="0.01" min="0" placeholder={t('Doble')} className="w-28" value={bulk.dob} onChange={(e) => setBulk((b) => ({ ...b, dob: e.target.value }))} />
                <Boton variant="ghost" onClick={aplicarBulk}>{t('Aplicar')}</Boton>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {t('Las tarifas vienen precargadas del perfil de cada chofer; puedes ajustarlas SOLO para este cálculo (aquí no se guardan). Los choferes nuevos aparecen sin tarifa: escríbela para incluirlos.')}
            </p>
            <Tabla
              minWidth="min-w-[900px]"
              columns={[
                { key: 'nombre', label: t('Chofer') },
                { key: 'paquetes', label: t('Paquetes'), align: 'right' },
                { key: 'individuales', label: t('Individuales'), align: 'right' },
                { key: 'dobles', label: t('Dobles'), align: 'right' },
                { key: 'ind', label: t('Tarifa individual'), align: 'center' },
                { key: 'dob', label: t('Tarifa doble'), align: 'center' },
                { key: 'claimsMonto', label: t('Claims (M2)'), align: 'right' },
                { key: 'desc', label: t('Descuento'), align: 'center' },
                { key: 'total', label: t('Total a pagar'), align: 'right' },
              ]}
              rows={filas}
              renderCell={(row, key) => {
                if (key === 'nombre') return <span className="font-semibold text-brand-navy dark:text-slate-100">{row.nombre}</span>
                if (key === 'paquetes') return <b>{num(row.paquetes)}</b>
                if (key === 'individuales' || key === 'dobles') return num(row[key] || 0)
                if (key === 'ind' || key === 'dob') {
                  const val = tarifas[row._key]?.[key] ?? ''
                  return <Input type="number" step="0.01" min="0" className={`w-24 text-right ${!(Number(val) > 0) ? 'border-rose-400' : ''}`} value={val} onChange={(e) => setTarifa(row.nombre, key, e.target.value)} />
                }
                if (key === 'claimsMonto') return row.claimsMonto ? <span className="text-rose-600 dark:text-rose-400">−{money(row.claimsMonto)}</span> : '—'
                if (key === 'desc') {
                  return <Input type="number" step="0.01" min="0" placeholder="$" className="w-24 text-right" value={descuentos[row._key] ?? ''} onChange={(e) => setDescuentos((d) => ({ ...d, [row._key]: e.target.value }))} />
                }
                if (key === 'total') return <b className="text-brand-navy dark:text-slate-100">{money(row.total)}</b>
                return row[key]
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                <span className="text-base font-extrabold text-brand-navy dark:text-slate-100">{t('TOTAL a pagar')}: {money(totalPagar)}</span>
                {ingresoEst > 0 && <span>{t('SpeedX te pagará (estimado)')}: <b className="text-emerald-600 dark:text-emerald-400">{money(ingresoEst)}</b></span>}
                {ingresoEst > 0 && <span>{t('Margen estimado')}: <b className={ingresoEst - totalPagar >= 0 ? 'text-brand-gold' : 'text-rose-600'}>{money(r2(ingresoEst - totalPagar))}</b></span>}
                <Badge color="gold">{t('TEMPORAL')}</Badge>
                {sinTarifa.length > 0 && <span className="text-xs font-semibold text-amber-600">({sinTarifa.length} {t('chofer(es) sin tarifa no suman')})</span>}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Boton variant="ghost" onClick={descargarExcel}><FileSpreadsheet size={16} /> {t('Descargar Excel')}</Boton>
                <Boton variant="ghost" onClick={descargarPDF}><FileText size={16} /> {t('Descargar PDF')}</Boton>
                {provEdit ? (
                  <>
                    <Boton variant="ghost" onClick={() => setProvEdit(null)}>{t('Cancelar')}</Boton>
                    <Boton onClick={guardarCambiosProvisional} disabled={guardando || sinTarifa.length > 0}>
                      {guardando ? <Spinner /> : <Save size={16} />} {t('Guardar cambios')}
                    </Boton>
                  </>
                ) : (
                  <Boton onClick={guardarProvisional} disabled={guardando || sinTarifa.length > 0}>
                    {guardando ? <Spinner /> : <Save size={16} />} {t('Guardar como pendiente')}
                  </Boton>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
