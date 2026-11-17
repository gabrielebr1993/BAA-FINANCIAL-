// ============================================================================
// SPEEDX · AUDITORÍA DE COBROS — pantalla de SOLO LECTURA. Subes estados de
// cuenta (PDF de Chase / Excel / CSV) y el sistema cruza lo que SpeedX te pagó
// contra tus facturas (invoices): cuadran, diferencia, pago en bloque, sin
// pagar y pago sin factura. NO escribe nada en la base de datos.
// ============================================================================
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useData } from '../../DataContext'
import { useLang } from '../../i18n'
import { money, num } from '../../utils/format'
import { exportarExcel, exportarPDF } from '../../utils/exportar'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../../components/ui'
import { analizarArchivos } from './auditoriaArchivos'
import { conciliar, conciliarSemana, SPEEDX_MARCADORES } from './auditoriaCobros'
import {
  ScanSearch, UploadCloud, FileText, X, CheckCircle2, AlertTriangle,
  Layers, XCircle, HelpCircle, FileSpreadsheet, Download, Settings2, CalendarDays, Receipt,
} from 'lucide-react'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtFecha = (iso) => {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso)
}
const signo = (n) => (n > 0 ? `+${money(n)}` : money(n))

export default function AuditoriaCobros({ embebido = false }) {
  const { t } = useLang()
  const { invoices, provisionales } = useData()
  const inputRef = useRef(null)

  const [cargando, setCargando] = useState(false)
  const [analisis, setAnalisis] = useState(null)
  const [archivos, setArchivos] = useState([])
  const [arrastrando, setArrastrando] = useState(false)
  const [modo, setModo] = useState('semana') // 'semana' = como paga SpeedX · 'factura' = detalle
  const [tol, setTol] = useState(5)
  const [avanzado, setAvanzado] = useState(false)
  const [nombresTxt, setNombresTxt] = useState(SPEEDX_MARCADORES.nombres.join(', '))
  const [idsTxt, setIdsTxt] = useState(SPEEDX_MARCADORES.origIds.join(', '))

  const marcadores = useMemo(() => ({
    nombres: nombresTxt.split(',').map((s) => s.trim()).filter(Boolean),
    origIds: idsTxt.split(',').map((s) => s.trim()).filter(Boolean),
  }), [nombresTxt, idsTxt])

  // Facturas de SpeedX a comparar: las OFICIALES + las del REPORTE MANUAL
  // (provisionales), sin duplicar una semana/ciudad que ya tenga oficial.
  const normClave = (sem, ciu) => `${(sem || '').trim()}||${(ciu || '').trim().toUpperCase()}`
  const facturas = useMemo(() => {
    const oficiales = (invoices || []).filter((i) => (i.carrier || 'gofo') === 'speedx')
    const claves = new Set(oficiales.map((i) => normClave(i.semanaSpeedX || i.semana, i.ciudad || i.ciudadNombre)))
    const ofMapeadas = oficiales.map((i) => ({
      id: i.id,
      montoACobrar: Number(i.montoACobrar) || Number(i.verificacion?.gofo?.totalGofo) || Number(i.verificacion?.netoCalculado) || Number(i.ingresoTotal) || 0,
      ciudad: i.ciudadNombre || i.ciudad || '',
      fleet: i.fleet || '',
      semana: i.semanaSpeedX || i.semana || '',
      estadoCobro: i.estadoCobro || 'pendiente',
      manual: false,
    }))
    // Provisionales (reporte manual): se usa el ingreso estimado de SpeedX.
    const provMapeadas = (provisionales || [])
      .filter((p) => (p.carrier || 'gofo') === 'speedx')
      .filter((p) => !claves.has(normClave(p.semana || p.semanaSpeedX, p.ciudad)))
      .map((p) => ({
        id: p.id,
        montoACobrar: Number(p.ingresoEstimado) || Number(p.montoACobrar) || 0,
        ciudad: p.ciudad || '',
        fleet: p.fleet || '',
        semana: p.semana || p.semanaSpeedX || '',
        estadoCobro: p.estadoCobro || 'pendiente',
        manual: true,
      }))
    return [...ofMapeadas, ...provMapeadas].filter((f) => f.montoACobrar > 0)
  }, [invoices, provisionales])

  // Analiza TODA la lista de archivos acumulados (varios estados de cuenta).
  const analizar = useCallback(async (lista) => {
    if (!lista.length) { setAnalisis(null); return }
    setCargando(true)
    try {
      const res = await analizarArchivos(lista, { marcadores })
      setAnalisis(res)
    } catch (e) {
      setAnalisis({ error: e.message || String(e), depositos: [], avisos: [] })
    } finally {
      setCargando(false)
    }
  }, [marcadores])

  // Agrega archivos nuevos (sin duplicar) y vuelve a cruzar todo junto.
  const procesar = useCallback((files) => {
    const arr = Array.from(files || []).filter(Boolean)
    if (!arr.length) return
    const existentes = new Set(archivos.map((f) => f.name + '|' + f.size))
    const nuevos = arr.filter((f) => !existentes.has(f.name + '|' + f.size))
    if (!nuevos.length) return
    const todos = [...archivos, ...nuevos]
    setArchivos(todos)
    analizar(todos)
    if (inputRef.current) inputRef.current.value = ''
  }, [archivos, analizar])

  const quitarArchivo = (idx) => {
    const todos = archivos.filter((_, i) => i !== idx)
    setArchivos(todos)
    analizar(todos)
  }

  // Si cambian los identificadores de SpeedX, re-cruza los archivos ya cargados.
  useEffect(() => { if (archivos.length) analizar(archivos) }, [marcadores]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback((e) => {
    e.preventDefault(); setArrastrando(false)
    procesar(e.dataTransfer.files)
  }, [procesar])

  const conc = useMemo(() => {
    if (!analisis || !analisis.depositos) return null
    return conciliar(analisis.depositos, facturas, { tol: Number(tol) || 0 })
  }, [analisis, facturas, tol])

  const concSem = useMemo(() => {
    if (!analisis || !analisis.depositos) return null
    return conciliarSemana(analisis.depositos, facturas, { tol: Number(tol) || 0 })
  }, [analisis, facturas, tol])

  const limpiar = () => { setArchivos([]); setAnalisis(null); if (inputRef.current) inputRef.current.value = '' }

  // ---- Exportar --------------------------------------------------------------
  function hojasSemana() {
    const T = concSem.totales
    return [
      { nombre: 'Semanas pagadas', rows: concSem.pagadas.map((p) => ({ Semana: p.semana, Facturado: p.total, 'Te pagaron': p.totalPagado, 'Ajuste SpeedX': p.dif, Transferencias: p.pagos.map((d) => fmtFecha(d.fecha) + ' ' + money(d.monto)).join(' + ') })) },
      { nombre: 'Semanas pendientes', rows: concSem.pendientes.map((p) => ({ Semana: p.semana, Facturado: p.total, Facturas: p.facturas.map((f) => f.etiqueta).join(', ') })) },
      { nombre: 'Pagos sin asignar', rows: concSem.pagosSinSemana.map((d) => ({ Fecha: fmtFecha(d.fecha), Monto: d.monto, Descripción: d.descripcion })) },
      { nombre: 'Resumen', rows: [
        { Concepto: 'Total facturado', Valor: T.totalFacturado }, { Concepto: 'Total pagado', Valor: T.totalPagado },
        { Concepto: 'Semanas pagadas', Valor: T.nPagadas }, { Concepto: 'Semanas pendientes', Valor: T.nPendientes },
        { Concepto: 'Pendiente por cobrar', Valor: T.totalPendiente }, { Concepto: 'Ajustes/descuentos SpeedX', Valor: T.totalAjustes },
      ] },
    ]
  }
  function hojasFactura() {
    const T = conc.totales
    return [
      { nombre: 'Cuadran', rows: conc.cuadran.map((x) => ({ Factura: x.factura.etiqueta, Semana: x.factura.semana, Facturado: x.factura.monto, Pagado: x.deposito.monto, Diferencia: x.dif, 'Fecha pago': fmtFecha(x.deposito.fecha) })) },
      { nombre: 'Pago en bloque', rows: conc.bloques.flatMap((b) => b.facturas.map((f) => ({ 'Fecha pago': fmtFecha(b.deposito.fecha), 'Monto pago': b.deposito.monto, Factura: f.etiqueta, Semana: f.semana, Facturado: f.monto }))) },
      { nombre: 'Diferencia', rows: conc.diferencia.map((x) => ({ Factura: x.factura.etiqueta, Semana: x.factura.semana, Facturado: x.factura.monto, Pagado: x.deposito.monto, Diferencia: x.dif })) },
      { nombre: 'Sin pagar', rows: conc.sinPagar.map((x) => ({ Factura: x.factura.etiqueta, Semana: x.factura.semana, Facturado: x.factura.monto })) },
      { nombre: 'Pago sin factura', rows: conc.sinFactura.map((x) => ({ Fecha: fmtFecha(x.deposito.fecha), Monto: x.deposito.monto, Descripción: x.deposito.descripcion })) },
      { nombre: 'Resumen', rows: [
        { Concepto: 'Total pagado', Valor: T.montoDepositado }, { Concepto: 'Total facturado', Valor: T.montoFacturado },
        { Concepto: 'Cuadran', Valor: T.nCuadran }, { Concepto: 'Diferencia', Valor: T.nDiferencia },
        { Concepto: 'Sin pagar', Valor: T.nSinPagar }, { Concepto: 'Pago sin factura', Valor: T.nSinFactura },
      ] },
    ]
  }
  const exportarXls = () => exportarExcel('auditoria-cobros-speedx', modo === 'semana' ? hojasSemana() : hojasFactura())
  const exportarPdf = () => {
    if (modo === 'semana') {
      const tablas = [
        { titulo: 'Semanas pagadas', head: ['Semana', 'Facturado', 'Te pagaron', 'Ajuste SpeedX'], body: concSem.pagadas.map((p) => [p.semana, money(p.total), money(p.totalPagado), signo(p.dif)]) },
        { titulo: 'Semanas pendientes', head: ['Semana', 'Facturado'], body: concSem.pendientes.map((p) => [p.semana, money(p.total)]) },
        { titulo: 'Pagos sin asignar', head: ['Fecha', 'Descripción', 'Monto'], body: concSem.pagosSinSemana.map((d) => [fmtFecha(d.fecha), d.descripcion, money(d.monto)]) },
      ]
      exportarPDF('auditoria-cobros-speedx', 'Auditoría de cobros · SpeedX (por semana)', `Facturado ${money(concSem.totales.totalFacturado)} · Pagado ${money(concSem.totales.totalPagado)} · Pendiente ${money(concSem.totales.totalPendiente)}`, tablas)
      return
    }
    const tablas = [
      { titulo: 'Cuadran', head: ['Factura', 'Semana', 'Facturado', 'Pagado', 'Dif.'], body: conc.cuadran.map((x) => [x.factura.etiqueta, x.factura.semana, money(x.factura.monto), money(x.deposito.monto), signo(x.dif)]) },
      { titulo: 'Diferencia de monto', head: ['Factura', 'Semana', 'Facturado', 'Pagado', 'Dif.'], body: conc.diferencia.map((x) => [x.factura.etiqueta, x.factura.semana, money(x.factura.monto), money(x.deposito.monto), signo(x.dif)]) },
      { titulo: 'Sin pagar', head: ['Factura', 'Semana', 'Facturado'], body: conc.sinPagar.map((x) => [x.factura.etiqueta, x.factura.semana, money(x.factura.monto)]) },
      { titulo: 'Pago sin factura', head: ['Fecha', 'Descripción', 'Monto'], body: conc.sinFactura.map((x) => [fmtFecha(x.deposito.fecha), x.deposito.descripcion, money(x.deposito.monto)]) },
    ]
    exportarPDF('auditoria-cobros-speedx', 'Auditoría de cobros · SpeedX', `${num(conc.totales.nDepositos)} pagos · ${money(conc.totales.montoDepositado)}`, tablas)
  }

  return (
    <div className="space-y-4">
      {embebido ? (
        analisis && <div className="flex justify-end"><Boton variant="ghost" onClick={limpiar}><X size={16} /> {t('Limpiar')}</Boton></div>
      ) : (
        <PageTitle right={analisis && <Boton variant="ghost" onClick={limpiar}><X size={16} /> {t('Limpiar')}</Boton>}>
          <span className="inline-flex items-center gap-2"><ScanSearch size={22} /> {t('Auditoría de cobros')} <Badge color="navy">SpeedX</Badge></span>
        </PageTitle>
      )}

      <Aviso tipo="info">
        {t('Sube los estados de cuenta (PDF de Chase, Excel o CSV) y el sistema cruza lo que SpeedX te pagó contra tus facturas. Esta pantalla es solo de lectura: no modifica nada.')}
      </Aviso>

      {/* Zona de carga */}
      <Card
        className={`border-2 border-dashed text-center transition-colors ${arrastrando ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 dark:border-slate-600'}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center gap-2 py-4">
          <UploadCloud size={30} className="text-brand-gold" />
          <div className="font-semibold text-brand-navy dark:text-slate-100">{t('Arrastra tus estados de cuenta aquí')}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('PDF de Chase, Excel o CSV · puedes subir varios a la vez (y seguir agregando)')}</div>
          <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" multiple className="hidden" onChange={(e) => procesar(e.target.files)} />
          <div className="mt-2 flex items-center gap-2">
            <Boton variant="gold" onClick={() => inputRef.current?.click()} disabled={cargando}>
              {cargando ? <><Spinner /> {t('Leyendo…')}</> : <><FileText size={16} /> {archivos.length ? t('Agregar más archivos') : t('Elegir archivos')}</>}
            </Boton>
          </div>
        </div>
      </Card>

      {/* Lista de estados de cuenta cargados */}
      {archivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">{t('Cargados')} ({archivos.length}):</span>
          {archivos.map((f, i) => {
            const info = analisis?.fuentes?.find((x) => x.nombre === f.name)
            return (
              <span key={f.name + i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700/60 dark:bg-slate-800">
                <FileText size={12} className="text-brand-steel" />
                <span className="max-w-[180px] truncate" title={f.name}>{f.name}</span>
                {info && <Badge color={info.nSpeedX ? 'green' : 'slate'}>{info.nSpeedX} {t('SpeedX')}</Badge>}
                <button onClick={() => quitarArchivo(i)} title={t('Quitar')} className="text-slate-400 hover:text-rose-500"><X size={13} /></button>
              </span>
            )
          })}
        </div>
      )}

      {/* Configuración (margen + identificadores) */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-2">
          ⚙️ {t('Margen para "cuadra": ±')}
          <Input type="number" min="0" step="1" value={tol} onChange={(e) => setTol(e.target.value)} className="w-20 text-center" /> {t('dólares')}
        </span>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-steel hover:underline" onClick={() => setAvanzado((v) => !v)}>
          <Settings2 size={14} /> {avanzado ? t('Ocultar avanzado') : t('Identificadores de SpeedX')}
        </button>
      </div>
      {avanzado && (
        <Card className="space-y-2">
          <div className="text-xs font-semibold text-slate-500">{t('Cómo reconozco un pago de SpeedX en el estado de cuenta (separa con comas):')}</div>
          <label className="block text-xs text-slate-500">{t('Nombres')}
            <Input value={nombresTxt} onChange={(e) => setNombresTxt(e.target.value)} className="mt-1 w-full" />
          </label>
          <label className="block text-xs text-slate-500">{t('Orig ID')}
            <Input value={idsTxt} onChange={(e) => setIdsTxt(e.target.value)} className="mt-1 w-full" />
          </label>
          <div className="text-[11px] text-slate-400">{t('Si cambias esto, vuelve a subir los archivos.')}</div>
        </Card>
      )}

      {analisis?.error && <Aviso tipo="error">{analisis.error}</Aviso>}
      {analisis?.avisos?.length > 0 && (
        <Aviso tipo="warn">
          <ul className="list-disc space-y-0.5 pl-4">{analisis.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Aviso>
      )}

      {analisis?.depositos?.length > 0 && concSem && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Boton variant="ghost" onClick={exportarXls}><FileSpreadsheet size={16} /> {t('Excel')}</Boton>
            <Boton variant="ghost" onClick={exportarPdf}><Download size={16} /> {t('PDF')}</Boton>
          </div>
          <VistaSemana c={concSem} t={t} />
        </>
      )}

      {analisis && !analisis.error && (!analisis.depositos || analisis.depositos.length === 0) && (
        <Aviso tipo="warn">{t('No encontré pagos de SpeedX en los archivos subidos. Revisa que sea el estado de cuenta correcto, o ajusta los identificadores en "avanzado".')}</Aviso>
      )}

      {!analisis && facturas.length === 0 && (
        <Aviso tipo="info">{t('Aún no tienes facturas de SpeedX cargadas para comparar. Carga facturas en "Cargar Factura" y luego vuelve aquí.')}</Aviso>
      )}
    </div>
  )
}

// Parsea "MMDD-MMDD" y arma un rango legible "17 oct – 30 oct".
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function parseSemana(s) {
  const m = String(s || '').match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  if (!m) return null
  return { ini: { mes: +m[1], dia: +m[2] }, fin: { mes: +m[3], dia: +m[4] } }
}
function rangoSemanas(lista) {
  const parts = lista.map((p) => parseSemana(p.semana)).filter(Boolean)
  if (!parts.length) return ''
  const key = (x) => x.mes * 100 + x.dia
  let ini = parts[0].ini, fin = parts[0].fin
  for (const p of parts) { if (key(p.ini) < key(ini)) ini = p.ini; if (key(p.fin) > key(fin)) fin = p.fin }
  const f = (x) => `${x.dia} ${MESES_ES[x.mes - 1] || ''}`
  return `${f(ini)} – ${f(fin)}`
}

// ---- VISTA SIMPLE POR SEMANA ------------------------------------------------
function VistaSemana({ c, t }) {
  const T = c.totales
  const debe = T.totalPendiente
  const rango = rangoSemanas(c.pendientes)
  const hayManual = c.pagadas.some((p) => p.esManual) || c.pendientes.some((p) => p.esManual)
  return (
    <>
      {/* Lo más importante, bien grande: cuánto te deben */}
      <div className={`rounded-2xl p-5 text-white shadow-md ${debe > 0.005 ? 'bg-gradient-to-br from-rose-600 to-rose-500' : 'bg-gradient-to-br from-emerald-600 to-emerald-500'}`}>
        <div className="text-sm font-semibold opacity-90">{debe > 0.005 ? t('SpeedX te debe') : t('SpeedX está al día')}</div>
        <div className="font-mono text-4xl font-extrabold tabular-nums">{money(debe)}</div>
        {debe > 0.005
          ? <div className="mt-1 text-sm opacity-90">{num(T.nPendientes)} {t('semanas sin pagar')}{rango ? ` · ${rango}` : ''}</div>
          : <div className="mt-1 text-sm opacity-90">{t('No te deben nada pendiente ✓')}</div>}
      </div>

      {/* 2 datos de apoyo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('Te pagaron')}</div>
          <div className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{money(T.totalPagado)}</div>
          <div className="text-xs text-slate-400">{num(T.nPagadas)} {t('semanas pagadas')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('Facturado (total)')}</div>
          <div className="font-mono text-xl font-extrabold text-brand-navy dark:text-slate-100">{money(T.totalFacturado)}</div>
          <div className="text-xs text-slate-400">{num(T.nSemanas)} {t('semanas')}</div>
        </div>
      </div>

      {hayManual && (
        <Aviso tipo="warn">{t('Las semanas con “manual” vienen del Reporte manual (monto estimado). Al subir la factura oficial se reemplaza por el valor real.')}</Aviso>
      )}

      {/* TE DEBEN (lo que importa, primero) */}
      <Seccion color="red" icono={XCircle} titulo={t('Te deben (sin pagar)')} n={c.pendientes.length} unidad={t('semanas')}>
        {c.pendientes.length > 0 && <div className="mb-2 text-xs text-slate-500">{t('Si son las semanas más recientes, es normal: SpeedX paga con unas semanas de retraso.')}</div>}
        <Tabla
          columns={[
            { key: 'semana', label: t('Semana') },
            { key: 'ciudades', label: t('Facturas'), wrap: true },
            { key: 'monto', label: t('Te deben'), align: 'right' },
          ]}
          rows={c.pendientes}
          emptyText={t('Nada pendiente. 🎉')}
          renderCell={(p, k) => {
            if (k === 'semana') return <span className="inline-flex items-center gap-1.5"><b>{p.semana}</b>{p.esManual && <Badge color="slate">{t('manual')}</Badge>}</span>
            if (k === 'ciudades') return <span className="text-slate-500">{p.facturas.map((f) => f.etiqueta).join(' · ')}</span>
            return <span className="tabular-nums font-bold text-rose-600 dark:text-rose-400">{money(p.total)}</span>
          }}
        />
      </Seccion>

      {/* PAGADAS */}
      <Seccion color="green" icono={CheckCircle2} titulo={t('Pagadas')} n={c.pagadas.length} unidad={t('semanas')}>
        <Tabla
          columns={[
            { key: 'semana', label: t('Semana') },
            { key: 'facturado', label: t('Facturado'), align: 'right' },
            { key: 'pagado', label: t('Te pagaron'), align: 'right' },
            { key: 'ajuste', label: t('Ajuste'), align: 'right' },
          ]}
          rows={c.pagadas}
          emptyText={t('Ninguna todavía.')}
          renderCell={(p, k) => {
            if (k === 'semana') return <span className="inline-flex items-center gap-1.5"><b>{p.semana}</b>{p.esManual && <Badge color="slate">{t('manual')}</Badge>}</span>
            if (k === 'facturado') return <span className="tabular-nums">{money(p.total)}</span>
            if (k === 'pagado') return <span className="tabular-nums font-semibold">{money(p.totalPagado)}</span>
            if (Math.abs(p.dif) < 0.005) return <Badge color="green">{t('exacto')}</Badge>
            if (p.dif < 0) return <Badge color="gold">−{money(-p.dif)}</Badge>
            return <Badge color="blue">+{money(p.dif)}</Badge>
          }}
        />
      </Seccion>

      {c.pagosSinSemana.length > 0 && (
        <Seccion color="gray" icono={HelpCircle} titulo={t('Pagos que no cuadran con ninguna factura')} n={c.pagosSinSemana.length} unidad={t('pagos')}>
          <Tabla
            columns={[{ key: 'fecha', label: t('Fecha') }, { key: 'monto', label: t('Monto'), align: 'right' }]}
            rows={c.pagosSinSemana}
            emptyText={t('Ninguno.')}
            renderCell={(d, k) => (k === 'fecha' ? <b>{fmtFecha(d.fecha)}</b> : <span className="tabular-nums font-semibold">{money(d.monto)}</span>)}
          />
        </Seccion>
      )}
    </>
  )
}

// Encabezado de sección de color + tarjeta.
function Seccion({ color, icono: Icono, titulo, n, unidad, children }) {
  const estilos = {
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    gold: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    red: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    gray: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  }
  return (
    <Card className="overflow-hidden !p-0">
      <div className={`flex items-center gap-2 px-4 py-3 text-sm font-bold ${estilos[color]}`}>
        <Icono size={18} /> {titulo}
        <span className="ml-auto rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-black/20 dark:text-slate-300">{num(n)} {unidad}</span>
      </div>
      <div className="p-3">{children}</div>
    </Card>
  )
}
