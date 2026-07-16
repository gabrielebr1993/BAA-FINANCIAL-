// Módulo de AUDITORÍAS con 3 pestañas:
//   1) Financiera (banco): sube el extracto del banco y lo cruza con los pagos
//      calculados por MilePay → descuadres, pagos sin match y diferencias de monto.
//   2) Registro de cambios: bitácora de quién hizo qué (pagos, ajustes, claims,
//      facturas), leída de settings.auditLog.
//   3) Datos: anomalías (facturas que no cuadran con Gofo, choferes en pérdida,
//      alertas de rentabilidad) para vigilar la confianza de los datos.
import { useState, useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, TODAS } from '../utils/calc'
import { parseExtractoBanco, conciliar } from '../utils/conciliacionBanco'
import { ACCIONES, limpiarAuditoria } from '../utils/auditoria'
import { money } from '../utils/format'
import { Card, KPI, PageTitle, Boton, Badge, Aviso, EstadoVacio } from '../components/ui'
import HistorialReconciliacion from '../components/HistorialReconciliacion'
import { ShieldCheck, Landmark, ScrollText, Activity, Upload, CheckCircle2, AlertTriangle, TrendingDown, FileText } from 'lucide-react'

const TABS = [
  { key: 'financiera', label: 'Financiera (banco)', icon: Landmark },
  { key: 'registro', label: 'Registro de cambios', icon: ScrollText },
  { key: 'datos', label: 'Datos', icon: Activity },
]

export default function Auditorias() {
  const [tab, setTab] = useState('financiera')
  return (
    <div>
      <PageTitle right={<span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><ShieldCheck size={16} className="text-brand-gold" /> Confianza de datos</span>}>Auditorías</PageTitle>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700/60">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${on ? 'border-brand-gold text-brand-navy dark:text-white' : 'border-transparent text-slate-500 hover:text-brand-navy dark:text-slate-400 dark:hover:text-white'}`}
            >
              <Icon size={15} strokeWidth={1.9} /> {t.label}
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

// ============================ TAB 1: FINANCIERA ============================
function TabFinanciera() {
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

  const onFile = async (e) => {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const parsed = parseExtractoBanco(aoa)
      if (!parsed.movimientos.length) { setError('No se detectaron movimientos de pago en el archivo. Revisa que tenga columnas de descripción y monto.'); return }
      setBanco({ ...parsed, nombreArchivo: file.name })
    } catch (err) {
      setError('No se pudo leer el archivo: ' + err.message)
    }
    e.target.value = ''
  }

  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        Sube el <b>extracto del banco</b> (Excel/CSV con la actividad de la cuenta). MilePay lo cruza con lo que
        <b> debe salir</b> del banco según el filtro actual (choferes con saldo positivo + gastos fijos) y te muestra si <b>cuadra</b>.
        Cambia el filtro de arriba (semana/ciudad) para conciliar el periodo que corresponde al extracto.
      </Aviso>

      <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
        <Upload size={16} strokeWidth={1.9} className="text-brand-gold" />
        {banco ? 'Cambiar extracto' : 'Subir extracto del banco'}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
      </label>
      {banco && <span className="ml-3 text-sm text-slate-500">{banco.nombreArchivo} · {banco.movimientos.length} movimientos</span>}
      {error && <Aviso tipo="error" className="mb-4">{error}</Aviso>}

      {!res ? (
        <EstadoVacio titulo="Sin extracto cargado" texto="Sube el extracto del banco para ver la conciliación." mostrarBoton={false} />
      ) : (
        <>
          <div className="mb-4 mt-4 flex flex-wrap gap-3">
            <KPI label="MilePay (debe salir)" value={money(res.totMilePay)} icon={FileText} accent="navy" sub={`${milePay.length} pagos calculados`} />
            <KPI label="Banco (salió real)" value={money(res.totBanco)} icon={Landmark} accent="slate" sub={`${banco.movimientos.length} movimientos`} />
            <KPI
              label={res.cuadra ? 'Cuadra' : 'Diferencia'}
              value={res.cuadra ? '✓' : money(res.diferencia)}
              icon={res.cuadra ? CheckCircle2 : AlertTriangle}
              accent={res.cuadra ? 'green' : 'red'}
              sub={res.cuadra ? 'MilePay = banco' : 'MilePay − banco'}
            />
          </div>

          {res.difs.length > 0 && (
            <Card className="mb-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-brand-navy dark:text-slate-100"><AlertTriangle size={16} className="text-amber-500" /> Diferencias de monto ({res.difs.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-1.5">Beneficiario</th><th>MilePay</th><th>Banco</th><th className="text-right">Diferencia</th></tr></thead>
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
              <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">En MilePay, sin salir del banco ({res.soloMilePay.length})</div>
              {res.soloMilePay.length === 0 ? <div className="text-sm text-slate-400">Todo lo calculado tiene su pago en el banco.</div> : (
                <ul className="space-y-1 text-sm">
                  {res.soloMilePay.map((p, i) => (
                    <li key={i} className="flex justify-between border-t border-slate-100 py-1.5 dark:border-slate-700/50">
                      <span>{p.nombre} {p.tipo === 'fijo' && <Badge color="slate">fijo</Badge>}</span>
                      <span className="font-semibold">{money(p.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">Posibles causas: pago aún no enviado, saldo negativo no cobrado, o nombre distinto en el banco.</p>
            </Card>
            <Card>
              <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">En el banco, sin match en MilePay ({res.soloBanco.length})</div>
              {res.soloBanco.length === 0 ? <div className="text-sm text-slate-400">Cada movimiento del banco corresponde a un pago calculado.</div> : (
                <ul className="space-y-1 text-sm">
                  {res.soloBanco.map((b, i) => (
                    <li key={i} className="flex justify-between border-t border-slate-100 py-1.5 dark:border-slate-700/50">
                      <span className="truncate" title={b.descripcion}>{b.nombre}</span>
                      <span className="font-semibold">{money(b.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">Posibles causas: pago fuera de MilePay, otra semana/ciudad, un manager no registrado, o gasto ajeno a nómina.</p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ============================ TAB 2: REGISTRO ============================
function TabRegistro() {
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
    if (!window.confirm('¿Vaciar el registro dejando solo las últimas 200 entradas?')) return
    setLimpiando(true)
    await limpiarAuditoria(activeCompanyId, entradas, 200)
    await reloadAjustes()
    setLimpiando(false)
  }

  return (
    <div>
      <Aviso tipo="info" className="mb-4">
        Bitácora de cambios sensibles: pagos marcados, ajustes de préstamo/bono, claims perdonados y facturas cargadas o borradas.
        Se registra automáticamente a partir de ahora, con el usuario y la fecha.
      </Aviso>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setFiltro('')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${!filtro ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}>Todas ({entradas.length})</button>
        {accionesPresentes.map((a) => (
          <button key={a} onClick={() => setFiltro(a)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filtro === a ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}>{ACCIONES[a]?.label || a}</button>
        ))}
        {esDueno && entradas.length > 0 && <Boton variant="ghost" onClick={vaciar} disabled={limpiando} className="ml-auto px-2.5 py-1 text-xs">{limpiando ? 'Vaciando…' : 'Vaciar registro'}</Boton>}
      </div>

      {filtradas.length === 0 ? (
        <EstadoVacio titulo="Sin cambios registrados" texto="Aparecerán aquí cuando marques pagos, ajustes, claims o cargues facturas." mostrarBoton={false} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">Fecha</th><th>Acción</th><th>Detalle</th><th>Usuario</th><th className="text-right">Monto</th></tr></thead>
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
        <KPI label="Alertas activas" value={String(alertas.length)} icon={AlertTriangle} accent={graves.length ? 'red' : 'slate'} sub={graves.length ? `${graves.length} graves` : 'sin alertas graves'} />
        <KPI label="Facturas que no cuadran con Gofo" value={String(noCuadran.length)} icon={Landmark} accent={noCuadran.length ? 'red' : 'green'} sub="neto MilePay vs total Gofo" />
        <KPI label="Choferes en pérdida" value={String(enPerdida.length)} icon={TrendingDown} accent={enPerdida.length ? 'red' : 'green'} sub="pago negativo (te deben)" />
      </div>

      {enPerdida.length > 0 && (
        <Card className="mb-4">
          <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">Choferes con saldo negativo</div>
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
        <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">Alertas de rentabilidad y datos ({alertas.length})</div>
        {alertas.length === 0 ? <div className="text-sm text-slate-400">Sin alertas activas. Todo en orden.</div> : (
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

      <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">Reconciliación con Gofo (por factura)</div>
      <HistorialReconciliacion />
    </div>
  )
}
