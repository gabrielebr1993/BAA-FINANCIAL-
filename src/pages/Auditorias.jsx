// Módulo de AUDITORÍAS con 3 pestañas:
//   1) Financiera (banco): sube el extracto del banco y lo cruza con los pagos
//      calculados por MilePay → descuadres, pagos sin match y diferencias de monto.
//   2) Registro de cambios: bitácora de quién hizo qué (pagos, ajustes, claims,
//      facturas), leída de settings.auditLog.
//   3) Datos: anomalías (facturas que no cuadran con Gofo, choferes en pérdida,
//      alertas de rentabilidad) para vigilar la confianza de los datos.
import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, TODAS } from '../utils/calc'
import { parseExtractoBanco, conciliar, tokensNombre } from '../utils/conciliacionBanco'
import { ACCIONES, limpiarAuditoria } from '../utils/auditoria'
import { money } from '../utils/format'
import { Card, KPI, PageTitle, Boton, Badge, Aviso, EstadoVacio, Spinner } from '../components/ui'
import HistorialReconciliacion from '../components/HistorialReconciliacion'
import { ShieldCheck, Landmark, ScrollText, Activity, Upload, CheckCircle2, AlertTriangle, TrendingDown, FileText, FileSpreadsheet } from 'lucide-react'
import { useLang } from '../i18n'

// Lee un extracto (Excel o CSV) a matriz de filas. Usa SheetJS y, si el CSV no se
// interpreta, cae a un parseo de texto simple (comillas + comas).
async function leerExtracto(file) {
  const buf = await file.arrayBuffer()
  let aoa = []
  try {
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (ws) aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  } catch { aoa = [] }
  if ((!aoa || aoa.length < 2) && /\.csv$/i.test(file.name)) {
    const txt = await file.text()
    aoa = txt.split(/\r?\n/).filter((l) => l.trim() !== '').map((linea) => {
      const celdas = []
      let cur = '', dentro = false
      for (let i = 0; i < linea.length; i++) {
        const ch = linea[i]
        if (ch === '"') { if (dentro && linea[i + 1] === '"') { cur += '"'; i++ } else dentro = !dentro }
        else if (ch === ',' && !dentro) { celdas.push(cur); cur = '' }
        else cur += ch
      }
      celdas.push(cur)
      return celdas.map((c) => { const n = parseFloat(c); return c.trim() !== '' && isFinite(n) && String(n) === c.trim() ? n : c.trim() })
    })
  }
  return aoa || []
}

const TABS = [
  { key: 'financiera', label: 'Financiera (banco)', icon: Landmark },
  { key: 'registro', label: 'Registro de cambios', icon: ScrollText },
  { key: 'datos', label: 'Datos', icon: Activity },
]

export default function Auditorias() {
  const { t } = useLang()
  const [tab, setTab] = useState('financiera')
  return (
    <div>
      <PageTitle right={<span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><ShieldCheck size={16} className="text-brand-gold" /> {t('Confianza de datos')}</span>}>{t('Auditorías')}</PageTitle>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700/60">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon
          const on = tab === tabItem.key
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${on ? 'border-brand-gold text-brand-navy dark:text-white' : 'border-transparent text-slate-500 hover:text-brand-navy dark:text-slate-400 dark:hover:text-white'}`}
            >
              <Icon size={15} strokeWidth={1.9} /> {t(tabItem.label)}
            </button>
          )
        })}
      </div>
      {tab === 'financiera' && <TabFinanciera />}
      {tab === 'registro' && <TabRegistro />}
      {tab === 'datos' && <TabDatos />}
    </div>
  )
}

// Gastos fijos (managers) del filtro actual × semanas — igual criterio que en Pagos.
function useGastosFijos() {
  const { managers, numSemanas, selectedCity, selectedCities } = useData()
  return useMemo(() => {
    const activos = (managers || []).filter((m) => m.activo !== false)
    const subset = (selectedCities || []).length >= 2 ? new Set(selectedCities) : null
    return activos
      .filter((m) => {
        const c = m.ciudad || ''
        if (subset) return subset.has(c)
        if (selectedCity && selectedCity !== TODAS) return c === selectedCity
        return true
      })
      .map((m) => ({ nombre: m.nombre, ciudad: m.ciudad || '', monto: (Number(m.sueldoSemanal) || 0) * numSemanas }))
  }, [managers, numSemanas, selectedCity, selectedCities])
}

// Zona para arrastrar/soltar o hacer clic para elegir el extracto del banco.
function Dropzone({ onArchivo, cargando, banco }) {
  const { t } = useLang()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)
  const soltar = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onArchivo(f) }
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={soltar}
      className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${drag ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 bg-white hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800'}`}
    >
      {cargando ? <Spinner /> : <Upload size={26} strokeWidth={1.8} className="text-brand-gold" />}
      <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{cargando ? t('Leyendo…') : (banco ? t('Arrastra otro extracto o haz clic para cambiarlo') : t('Arrastra el extracto del banco aquí'))}</div>
      <div className="text-xs text-slate-400">{t('o haz clic para elegir un archivo · .xlsx, .xls, .csv')}</div>
      {banco && <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-700/50 dark:text-slate-300"><FileSpreadsheet size={13} strokeWidth={1.9} /> {banco.nombreArchivo} · {banco.movimientos.length} {t('pagos')} · {money(banco.total)}</div>}
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f) }} />
    </div>
  )
}

// ============================ TAB 1: FINANCIERA ============================
function TabFinanciera() {
  const { t } = useLang()
  const { facturaRango, claims, drivers, selectedCity, ajustesPorChofer } = useData()
  const gastosFijos = useGastosFijos()
  const [banco, setBanco] = useState(null) // { movimientos, total, nombreArchivo }
  const [error, setError] = useState('')

  // Lo que MilePay dice que DEBE salir del banco: choferes con saldo positivo + fijos.
  // Se AGRUPA por persona (nombre): el banco paga UN ACH por persona, mientras que
  // MilePay tiene una fila por ciudad; si un chofer trabaja en 2 ciudades se sumarían
  // sus dos filas para cuadrar con el único pago del banco.
  const milePay = useMemo(() => {
    const pagos = calcularPagos(facturaRango, claims, drivers, selectedCity, ajustesPorChofer)
    const choferes = pagos.filter((p) => p.totalPagar > 0).map((p) => ({ nombre: p.nombre, monto: Math.round(p.totalPagar * 100) / 100, tipo: 'chofer', ciudad: p.nombreCiudad }))
    const fijos = gastosFijos.map((g) => ({ nombre: g.nombre, monto: Math.round(g.monto * 100) / 100, tipo: 'fijo', ciudad: g.ciudad }))
    const acc = {}
    for (const p of [...choferes, ...fijos]) {
      const k = (p.nombre || '').trim().toLowerCase()
      if (!acc[k]) acc[k] = { ...p, ciudades: new Set([p.ciudad].filter(Boolean)) }
      else { acc[k].monto = Math.round((acc[k].monto + p.monto) * 100) / 100; if (p.ciudad) acc[k].ciudades.add(p.ciudad); if (p.tipo === 'chofer') acc[k].tipo = 'chofer' }
    }
    return Object.values(acc).map((p) => ({ ...p, ciudad: [...p.ciudades].join(', ') }))
  }, [facturaRango, claims, drivers, selectedCity, ajustesPorChofer, gastosFijos])

  const res = useMemo(() => (banco ? conciliar(milePay, banco.movimientos) : null), [banco, milePay])
  // El banco oculta los nombres (cuentas enmascaradas tipo ####1234): no se puede
  // casar por nombre, solo por MONTO y por el TOTAL. Se detecta si la MAYORÍA de los
  // movimientos no tienen letras en el beneficiario.
  const sinNombres = banco && banco.movimientos.length > 0 &&
    (banco.movimientos.filter((m) => tokensNombre(m.nombre).length === 0).length / banco.movimientos.length) > 0.6

  const [cargando, setCargando] = useState(false)
  const procesar = async (file) => {
    setError('')
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError(t('Formato no soportado. Sube un archivo .xlsx, .xls o .csv del banco.')); return }
    setCargando(true)
    try {
      const aoa = await leerExtracto(file)
      const parsed = parseExtractoBanco(aoa)
      if (!parsed.movimientos.length) { setError(`${t('No se detectaron pagos en')} "${file.name}". ${t('Revisa que el archivo tenga columnas de descripción y monto (débitos).')}`); setBanco(null); return }
      setBanco({ ...parsed, nombreArchivo: file.name })
    } catch (err) {
      setError(t('No se pudo leer el archivo:') + ' ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        {t('Sube el')} <b>{t('extracto del banco')}</b> {t('(Excel o CSV con la actividad de la cuenta). MilePay lo cruza con lo que')}
        <b> {t('debe salir')}</b> {t('del banco según el filtro actual (choferes con saldo positivo + gastos fijos) y te muestra si')} <b>{t('cuadra')}</b>.
        {t('Ajusta el filtro de arriba (semana/ciudad) para que coincida con el periodo del extracto.')}
      </Aviso>

      <Dropzone onArchivo={procesar} cargando={cargando} banco={banco} />
      {error && <Aviso tipo="error" className="mb-4">{error}</Aviso>}
      {banco && milePay.length === 0 && (
        <Aviso tipo="warn" className="mb-4">{t('El extracto se cargó')} ({banco.movimientos.length} {t('pagos')} · {money(banco.total)}), {t('pero el')} <b>{t('filtro actual no tiene pagos calculados')}</b>. {t('Elige arriba la semana y la(s) ciudad(es) que correspondan a este extracto para poder conciliar.')}</Aviso>
      )}
      {sinNombres && (
        <Aviso tipo="info" className="mb-4">{t('Este banco')} <b>{t('no muestra los nombres')}</b> {t('de los beneficiarios (cuentas enmascaradas). La conciliación se hace por')} <b>{t('monto')}</b> {t('y por el')} <b>{t('total')}</b>; {t('los nombres no se pueden emparejar.')}</Aviso>
      )}

      {!res ? (
        <EstadoVacio titulo={t('Sin extracto cargado')} texto={t('Arrastra el extracto del banco o haz clic para elegirlo.')} mostrarBoton={false} />
      ) : (
        <>
          <div className="mb-4 mt-4 flex flex-wrap gap-3">
            <KPI label={t('MilePay (debe salir)')} value={money(res.totMilePay)} icon={FileText} accent="navy" sub={`${milePay.length} ${t('pagos calculados')}`} />
            <KPI label={t('Banco (salió real)')} value={money(res.totBanco)} icon={Landmark} accent="slate" sub={`${banco.movimientos.length} ${t('movimientos')}`} />
            <KPI
              label={res.cuadra ? t('Cuadra') : t('Diferencia')}
              value={res.cuadra ? '✓' : money(res.diferencia)}
              icon={res.cuadra ? CheckCircle2 : AlertTriangle}
              accent={res.cuadra ? 'green' : 'red'}
              sub={res.cuadra ? t('MilePay = banco') : t('MilePay − banco')}
            />
          </div>

          {res.difs.length > 0 && (
            <Card className="mb-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-brand-navy dark:text-slate-100"><AlertTriangle size={16} className="text-amber-500" /> {t('Diferencias de monto')} ({res.difs.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-1.5">{t('Beneficiario')}</th><th>MilePay</th><th>{t('Banco')}</th><th className="text-right">{t('Diferencia')}</th></tr></thead>
                  <tbody>
                    {res.difs.map((d, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="py-1.5">{d.mp.nombre} {d.mp.ciudad && <span className="text-xs text-slate-400">· {d.mp.ciudad}</span>}</td>
                        <td>{money(d.mp.monto)}</td>
                        <td>{money(d.banco.monto)}</td>
                        <td className={`text-right font-semibold ${d.dif > 0 ? 'text-red-600' : 'text-amber-600'}`}>{d.dif > 0 ? '+' : ''}{money(d.dif)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">{t('En MilePay, sin salir del banco')} ({res.soloMilePay.length})</div>
              {res.soloMilePay.length === 0 ? <div className="text-sm text-slate-400">{t('Todo lo calculado tiene su pago en el banco.')}</div> : (
                <ul className="space-y-1 text-sm">
                  {res.soloMilePay.map((p, i) => (
                    <li key={i} className="flex justify-between border-t border-slate-100 py-1.5 dark:border-slate-700/50">
                      <span>{p.nombre} {p.tipo === 'fijo' && <Badge color="slate">{t('fijo')}</Badge>}</span>
                      <span className="font-semibold">{money(p.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">{t('Posibles causas: pago aún no enviado, saldo negativo no cobrado, o nombre distinto en el banco.')}</p>
            </Card>
            <Card>
              <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">{t('En el banco, sin match en MilePay')} ({res.soloBanco.length})</div>
              {res.soloBanco.length === 0 ? <div className="text-sm text-slate-400">{t('Cada movimiento del banco corresponde a un pago calculado.')}</div> : (
                <ul className="space-y-1 text-sm">
                  {res.soloBanco.map((b, i) => (
                    <li key={i} className="flex justify-between border-t border-slate-100 py-1.5 dark:border-slate-700/50">
                      <span className="truncate" title={b.descripcion}>{b.nombre}</span>
                      <span className="font-semibold">{money(b.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">{t('Posibles causas: pago fuera de MilePay, otra semana/ciudad, un manager no registrado, o gasto ajeno a nómina.')}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ============================ TAB 2: REGISTRO ============================
function TabRegistro() {
  const { t } = useLang()
  const { ajustes, reloadAjustes, activeCompanyId } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const esDueno = esSuperAdmin || perfil?.role === 'owner'
  const [filtro, setFiltro] = useState('')
  const [limpiando, setLimpiando] = useState(false)
  // Al abrir la pestaña, recarga settings para traer los últimos cambios registrados.
  useEffect(() => { reloadAjustes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const entradas = useMemo(() => {
    const list = Array.isArray(ajustes?.auditLog) ? ajustes.auditLog : []
    return [...list].sort((a, b) => (a.ts < b.ts ? 1 : -1))
  }, [ajustes])
  const filtradas = filtro ? entradas.filter((e) => e.accion === filtro) : entradas
  const accionesPresentes = [...new Set(entradas.map((e) => e.accion))]

  const fmtFecha = (ts) => { try { return new Date(ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return ts } }
  const vaciar = async () => {
    if (!window.confirm(t('¿Vaciar el registro dejando solo las últimas 200 entradas?'))) return
    setLimpiando(true)
    await limpiarAuditoria(activeCompanyId, entradas, 200)
    await reloadAjustes()
    setLimpiando(false)
  }

  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        {t('Bitácora de cambios sensibles: pagos marcados, ajustes de préstamo/bono, claims perdonados y facturas cargadas o borradas. Se registra automáticamente a partir de ahora, con el usuario y la fecha.')}
      </Aviso>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setFiltro('')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${!filtro ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}>{t('Todas')} ({entradas.length})</button>
        {accionesPresentes.map((a) => (
          <button key={a} onClick={() => setFiltro(a)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filtro === a ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}>{ACCIONES[a]?.label || a}</button>
        ))}
        {esDueno && entradas.length > 0 && <Boton variant="ghost" onClick={vaciar} disabled={limpiando} className="ml-auto px-2.5 py-1 text-xs">{limpiando ? t('Vaciando…') : t('Vaciar registro')}</Boton>}
      </div>

      {filtradas.length === 0 ? (
        <EstadoVacio titulo={t('Sin cambios registrados')} texto={t('Aparecerán aquí cuando marques pagos, ajustes, claims o cargues facturas.')} mostrarBoton={false} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">{t('Fecha')}</th><th>{t('Acción')}</th><th>{t('Detalle')}</th><th>{t('Usuario')}</th><th className="text-right">{t('Monto')}</th></tr></thead>
              <tbody>
                {filtradas.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700/50">
                    <td className="whitespace-nowrap py-2 text-slate-500">{fmtFecha(e.ts)}</td>
                    <td><Badge color={ACCIONES[e.accion]?.color || 'navy'}>{ACCIONES[e.accion]?.label || e.accion}</Badge></td>
                    <td className="text-slate-700 dark:text-slate-200">{e.detalle}{e.semana && <span className="text-xs text-slate-400"> · {e.semana}</span>}{e.ciudad && <span className="text-xs text-slate-400"> · {e.ciudad}</span>}</td>
                    <td className="whitespace-nowrap text-slate-500">{e.usuario}{e.rol && <span className="text-xs text-slate-400"> ({e.rol})</span>}</td>
                    <td className="whitespace-nowrap text-right font-semibold">{e.monto != null ? money(e.monto) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ============================ TAB 3: DATOS ============================
function TabDatos() {
  const { t } = useLang()
  const { facturaRango, claims, drivers, selectedCity, ajustesPorChofer, invoices, alertasTodas } = useData()

  const pagos = useMemo(() => calcularPagos(facturaRango, claims, drivers, selectedCity, ajustesPorChofer), [facturaRango, claims, drivers, selectedCity, ajustesPorChofer])
  const enPerdida = pagos.filter((p) => p.totalPagar < 0)
  const noCuadran = (invoices || []).filter((i) => i.verificacion && i.verificacion.cuadra === false)
  const alertas = (alertasTodas || []).filter((a) => a.estado !== 'descartada')
  const graves = alertas.filter((a) => a.tipo === 'red')

  const colorTipo = { red: 'red', yellow: 'yellow', blue: 'navy' }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <KPI label={t('Alertas activas')} value={String(alertas.length)} icon={AlertTriangle} accent={graves.length ? 'red' : 'slate'} sub={graves.length ? `${graves.length} ${t('graves')}` : t('sin alertas graves')} />
        <KPI label={t('Facturas que no cuadran con Gofo')} value={String(noCuadran.length)} icon={Landmark} accent={noCuadran.length ? 'red' : 'green'} sub={t('neto MilePay vs total Gofo')} />
        <KPI label={t('Choferes en pérdida')} value={String(enPerdida.length)} icon={TrendingDown} accent={enPerdida.length ? 'red' : 'green'} sub={t('pago negativo (te deben)')} />
      </div>

      {enPerdida.length > 0 && (
        <Card className="mb-4">
          <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">{t('Choferes con saldo negativo')}</div>
          <ul className="space-y-1 text-sm">
            {enPerdida.map((p, i) => (
              <li key={i} className="flex justify-between border-t border-slate-100 py-1.5 dark:border-slate-700/50">
                <span>{p.nombre} <span className="text-xs text-slate-400">· {p.nombreCiudad}</span></span>
                <span className="font-semibold text-red-600">{money(p.totalPagar)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">{t('Alertas de rentabilidad y datos')} ({alertas.length})</div>
        {alertas.length === 0 ? <div className="text-sm text-slate-400">{t('Sin alertas activas. Todo en orden.')}</div> : (
          <ul className="space-y-2">
            {alertas.slice(0, 40).map((a) => (
              <li key={a.id} className="flex items-start gap-2 border-t border-slate-100 py-2 dark:border-slate-700/50">
                <Badge color={colorTipo[a.tipo] || 'navy'}>{a.categoria}</Badge>
                <div>
                  <div className="text-sm font-medium text-brand-navy dark:text-slate-100">{a.titulo}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{a.detalle}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">{t('Reconciliación con Gofo (por factura)')}</div>
      <HistorialReconciliacion />
    </div>
  )
}
