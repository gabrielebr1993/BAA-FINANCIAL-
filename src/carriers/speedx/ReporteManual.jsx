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
import { useData } from '../../DataContext'
import { procesarArchivoSpeedX } from './parser'
import { construirResumenSpeedX } from './resumen'
import { buscarDriver } from '../../utils/calc'
import { exportarExcel, exportarPDF } from '../../utils/exportar'
import { money, num } from '../../utils/format'
import { Upload, FileClock, Package, DollarSign, AlertTriangle, X, FileSpreadsheet, FileText, Info, Layers } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

const keyDe = (n) => (n || '').trim().toLowerCase()
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function ReporteManual() {
  const { t } = useLang()
  const { drivers, empresaActiva } = useData()

  const [procesando, setProcesando] = useState(false)
  const [proc, setProc] = useState(null)
  const [errores, setErrores] = useState([])
  const [avisos, setAvisos] = useState([])
  const [tarifas, setTarifas] = useState({}) // key → { ind, dob } (solo local, no se guarda)
  const [bulk, setBulk] = useState({ ind: '', dob: '' })
  const [dragOver, setDragOver] = useState(false)
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
      const p = procesarArchivoSpeedX(buf, f.name)
      const resumen = construirResumenSpeedX(p)
      setProc({ ...p, resumen })
      // En un reporte provisional es NORMAL que falten hojas: se avisa suave.
      setAvisos([...(p.avisos || []), ...(resumen.avisos || [])].filter((a) => !a.includes('DSP Summary')))
      const tf = {}
      for (const ch of resumen.resumenChoferes) {
        const d = buscarDriver(drivers, ch.nombre)
        tf[keyDe(ch.nombre)] = {
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
    if (!proc) return
    setTarifas((tf) => {
      const nx = { ...tf }
      for (const ch of proc.resumen.resumenChoferes) {
        const k = keyDe(ch.nombre)
        nx[k] = { ind: bulk.ind !== '' ? bulk.ind : nx[k]?.ind || '', dob: bulk.dob !== '' ? bulk.dob : nx[k]?.dob || '' }
      }
      return nx
    })
  }

  const claimsPorChofer = useMemo(() => {
    const m = {}
    for (const c of proc?.claims || []) m[keyDe(c.courier)] = (m[keyDe(c.courier)] || 0) + Math.abs(c.montoGofo)
    return m
  }, [proc])

  const filas = useMemo(() => {
    if (!proc) return []
    return proc.resumen.resumenChoferes.map((ch) => {
      const k = keyDe(ch.nombre)
      const tInd = Number(tarifas[k]?.ind) || 0
      const tDob = Number(tarifas[k]?.dob) || 0
      const paquetes = ch.individuales + ch.dobles
      const pago = ch.individuales * tInd + ch.dobles * tDob
      const claims = claimsPorChofer[k] || 0
      return { ...ch, _key: k, tInd, tDob, paquetes, pago: r2(pago), claimsMonto: r2(claims), total: r2(pago - claims), listo: tInd > 0 && tDob > 0 }
    }).sort((a, b) => b.total - a.total)
  }, [proc, tarifas, claimsPorChofer])

  const totalPagar = r2(filas.reduce((a, f) => a + f.total, 0))
  const sinTarifa = filas.filter((f) => !f.listo)
  const hayClaims = (proc?.claims || []).length > 0
  const res = proc?.resumen

  const filasExport = () => ([
    ...filas.map((f) => ({
      [t('Chofer')]: f.nombre,
      [t('Paquetes')]: f.paquetes,
      [t('Individuales')]: f.individuales,
      [t('Dobles')]: f.dobles,
      [t('Tarifa individual')]: f.tInd,
      [t('Tarifa doble')]: f.tDob,
      [t('Claims (M2)')]: -f.claimsMonto,
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
      [t('Total a pagar')]: totalPagar,
    },
  ])

  const descargarExcel = () => {
    exportarExcel(`pagos_provisionales_speedx_${proc?.semana || 'semana'}`, [{ nombre: 'Pagos', rows: filasExport() }])
  }
  const descargarPDF = async () => {
    await exportarPDF(
      `pagos_provisionales_speedx_${proc?.semana || 'semana'}`,
      empresaActiva?.nombre || 'MilePay',
      `${t('Pagos PROVISIONALES a choferes (reporte manual SpeedX)')} · ${t('Semana')} ${proc?.semana || ''}`,
      [{
        titulo: t('Pagos por chofer'),
        head: [t('Chofer'), t('Paquetes'), t('Individuales'), t('Dobles'), t('Tarifa individual'), t('Tarifa doble'), t('Claims (M2)'), t('Total a pagar')],
        body: [
          ...filas.map((f) => [f.nombre, num(f.paquetes), num(f.individuales), num(f.dobles), money(f.tInd), money(f.tDob), f.claimsMonto ? `−${money(f.claimsMonto)}` : '—', money(f.total)]),
          ['TOTAL', num(filas.reduce((a, f) => a + f.paquetes, 0)), '', '', '', '', '', money(totalPagar)],
        ],
      }]
    )
  }

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
      {avisos.map((a, i) => <Aviso key={`a${i}`} tipo="warn" className="mb-3">{a}</Aviso>)}

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
            <div className="font-semibold text-brand-navy dark:text-slate-200">{procesando ? t('Leyendo el reporte…') : t('Arrastra aquí el reporte provisional de SpeedX (.xlsx)')}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('Basta con que traiga la hoja de paquetes (PLD). Si trae claims, también se descuentan.')}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { manejarArchivo(e.target.files); e.target.value = '' }} />
          </div>
        </Card>
      )}

      {proc && (
        <>
          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                <FileSpreadsheet size={17} /> {proc.nombreArchivo}
                <Badge color="slate">{t('Semana')} {proc.semana}</Badge>
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
            </div>
            {!hayClaims && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {t('Este reporte no trae claims: el pago provisional sale sin descuentos. Los claims se descontarán cuando subas la factura oficial de la semana.')}
              </p>
            )}
          </Card>

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
                if (key === 'total') return <b className="text-brand-navy dark:text-slate-100">{money(row.total)}</b>
                return row[key]
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">
                {t('Total a pagar a choferes')}: <b className="text-brand-navy dark:text-slate-100">{money(totalPagar)}</b>
                {sinTarifa.length > 0 && <span className="ml-2 text-xs font-semibold text-amber-600">({sinTarifa.length} {t('chofer(es) sin tarifa no suman')})</span>}
              </span>
              <div className="flex items-center gap-2">
                <Boton variant="ghost" onClick={descargarExcel}><FileSpreadsheet size={16} /> {t('Descargar Excel')}</Boton>
                <Boton onClick={descargarPDF}><FileText size={16} /> {t('Descargar PDF')}</Boton>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
