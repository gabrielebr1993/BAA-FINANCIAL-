import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Scale, TrendingDown, Route, DollarSign, Truck, Wallet, Handshake, Copy, FileSpreadsheet, FileText, X, Check, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { calcularAlertas, SEVERIDAD_ORDEN, NOMBRE_TIPO, CATEGORIAS } from '../utils/alertas'
import { calcularPagos } from '../utils/calc'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { KPI, PageTitle, Card, Boton, Badge, Cargando, EstadoVacio } from '../components/ui'
import RangeSelector from '../components/RangeSelector'

const ESTILO = {
  red: 'border-l-rose-500 bg-rose-50 dark:bg-rose-500/10',
  yellow: 'border-l-amber-500 bg-amber-50 dark:bg-amber-500/10',
  blue: 'border-l-sky-500 bg-sky-50 dark:bg-sky-500/10',
}
const COLOR_TIPO = { red: 'text-rose-500', yellow: 'text-amber-500', blue: 'text-sky-500' }

// Icono Lucide según el tipo de alerta (derivado del id).
function iconoDe(a) {
  const id = a.id || ''
  if (id.startsWith('claims:')) return AlertTriangle
  if (id === 'claimsPerdonados') return Handshake
  if (id === 'claimsRepetidos') return Copy
  if (id === 'cuadre') return Scale
  if (id.startsWith('perdida')) return TrendingDown
  if (id.startsWith('ruta')) return Route
  if (id.startsWith('precio')) return DollarSign
  if (id.startsWith('tarifa')) return Truck
  if (id === 'pagos') return Wallet
  return Info
}

export default function Alertas() {
  const { facturaRango: inv, invoicesRango, claims, drivers, invAnterior, activeCompanyId, estadosAlertas, marcarAlerta, reactivarAlerta, cargando } = useData()
  const [pendientes, setPendientes] = useState(0)
  const [fTipo, setFTipo] = useState('')      // '', 'red', 'yellow', 'blue'
  const [fCategoria, setFCategoria] = useState('') // '', una de CATEGORIAS
  const [verEstado, setVerEstado] = useState('activa') // 'activa' | 'resuelta' | 'descartada'

  // pagos pendientes sin marcar (solo cuando el rango es una sola semana)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (invoicesRango.length !== 1 || !activeCompanyId) return setPendientes(0)
      const id = invoicesRango[0].id
      const snap = await getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', id)))
      const pagadas = new Set(snap.docs.filter((d) => d.data().estado === 'pagado').map((d) => d.data().driverNombre))
      const total = calcularPagos(inv, claims, drivers, 'todas').length
      if (vivo) setPendientes(Math.max(0, total - pagadas.size))
    })().catch(() => {})
    return () => { vivo = false }
  }, [invoicesRango, inv, claims, drivers, activeCompanyId])

  const todas = useMemo(
    () => calcularAlertas({ inv, claims, drivers, invAnterior, pendientes })
      .map((a) => ({ ...a, estado: estadosAlertas[a.id] || 'activa' }))
      .sort((a, b) => SEVERIDAD_ORDEN[a.tipo] - SEVERIDAD_ORDEN[b.tipo]),
    [inv, claims, drivers, invAnterior, pendientes, estadosAlertas]
  )

  const activas = todas.filter((a) => a.estado === 'activa')
  const nRed = activas.filter((a) => a.tipo === 'red').length
  const nYellow = activas.filter((a) => a.tipo === 'yellow').length
  const nBlue = activas.filter((a) => a.tipo === 'blue').length
  const nResueltas = todas.filter((a) => a.estado === 'resuelta').length
  const nDescartadas = todas.filter((a) => a.estado === 'descartada').length

  // Alertas del estado que se está viendo, con filtros de tipo y categoría.
  const filtradas = todas.filter((a) => {
    if (a.estado !== verEstado) return false
    if (fTipo && a.tipo !== fTipo) return false
    if (fCategoria && a.categoria !== fCategoria) return false
    return true
  })

  // Agrupar por categoría para el render.
  const porCategoria = CATEGORIAS.map((cat) => ({ cat, items: filtradas.filter((a) => a.categoria === cat) })).filter((g) => g.items.length > 0)

  const exportarE = () => exportarExcel(`alertas_${inv?.semana || 'periodo'}`, [{ nombre: 'Alertas', rows: activas.map((a) => ({ Severidad: NOMBRE_TIPO[a.tipo], Categoría: a.categoria, Título: a.titulo, Detalle: a.detalle })) }])
  const exportarP = () =>
    exportarPDF(`alertas_${inv?.semana || 'periodo'}`, 'Alertas', inv?.semana || '', [
      { titulo: 'Alertas activas', head: ['Severidad', 'Categoría', 'Título', 'Detalle'], body: activas.map((a) => [NOMBRE_TIPO[a.tipo], a.categoria, a.titulo, a.detalle]) },
    ])

  const Pill = ({ activo, onClick, children }) => (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${activo ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}>{children}</button>
  )

  return (
    <div>
      <PageTitle right={<RangeSelector />}>Alertas</PageTitle>

      {cargando ? (
        <Cargando texto="Calculando alertas…" />
      ) : !inv ? (
        <EstadoVacio titulo="Sin datos en este rango" texto="No hay facturas en el rango seleccionado para calcular alertas." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <KPI label="Graves" value={nRed} icon={AlertTriangle} accent="red" />
            <KPI label="Avisos" value={nYellow} icon={AlertCircle} accent="gold" />
            <KPI label="Info" value={nBlue} icon={Info} accent="blue" />
            <div className="ml-auto flex gap-2">
              <Boton variant="ghost" onClick={exportarE} disabled={activas.length === 0}><FileSpreadsheet size={16} strokeWidth={1.8} /> Excel</Boton>
              <Boton variant="gold" onClick={exportarP} disabled={activas.length === 0}><FileText size={16} strokeWidth={1.8} /> PDF</Boton>
            </div>
          </div>

          {/* Filtros: estado, severidad y categoría */}
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ver</span>
              <Pill activo={verEstado === 'activa'} onClick={() => setVerEstado('activa')}>Activas ({activas.length})</Pill>
              <Pill activo={verEstado === 'resuelta'} onClick={() => setVerEstado('resuelta')}>Resueltas ({nResueltas})</Pill>
              <Pill activo={verEstado === 'descartada'} onClick={() => setVerEstado('descartada')}>Descartadas ({nDescartadas})</Pill>
              <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Severidad</span>
              <Pill activo={fTipo === ''} onClick={() => setFTipo('')}>Todas</Pill>
              <Pill activo={fTipo === 'red'} onClick={() => setFTipo('red')}>Graves</Pill>
              <Pill activo={fTipo === 'yellow'} onClick={() => setFTipo('yellow')}>Avisos</Pill>
              <Pill activo={fTipo === 'blue'} onClick={() => setFTipo('blue')}>Info</Pill>
              <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categoría</span>
              <Pill activo={fCategoria === ''} onClick={() => setFCategoria('')}>Todas</Pill>
              {CATEGORIAS.map((c) => (
                <Pill key={c} activo={fCategoria === c} onClick={() => setFCategoria(c)}>{c}</Pill>
              ))}
            </div>
          </Card>

          {filtradas.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 size={40} strokeWidth={1.5} className="mx-auto text-emerald-500" />
              <h3 className="mt-2 text-lg font-bold text-brand-navy dark:text-slate-100">{verEstado === 'activa' ? 'Todo en orden' : 'Nada aquí'}</h3>
              <p className="text-slate-500 dark:text-slate-400">
                {verEstado === 'activa' ? 'No hay alertas activas con estos filtros.' : `No hay alertas ${verEstado === 'resuelta' ? 'resueltas' : 'descartadas'} con estos filtros.`}
              </p>
            </Card>
          ) : (
            <div className="space-y-5">
              {porCategoria.map((grupo) => (
                <div key={grupo.cat}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {grupo.cat} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{grupo.items.length}</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {grupo.items.map((a) => {
                      const Icon = iconoDe(a)
                      return (
                        <Card key={a.id} className={`flex items-start gap-3 border-l-4 p-4 ${ESTILO[a.tipo]}`}>
                          <Icon size={22} strokeWidth={1.8} className={`mt-0.5 flex-shrink-0 ${COLOR_TIPO[a.tipo]}`} />
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5"><Badge color={a.tipo === 'red' ? 'red' : a.tipo === 'yellow' ? 'gold' : 'blue'}>{NOMBRE_TIPO[a.tipo]}</Badge></div>
                            <div className="font-bold text-brand-navy dark:text-slate-100">{a.titulo}</div>
                            <div className="text-sm text-slate-600 dark:text-slate-300">{a.detalle}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <Link to={a.link} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy dark:text-brand-gold">Ir a la sección <ArrowRight size={13} strokeWidth={2} /></Link>
                              {a.estado === 'activa' ? (
                                <>
                                  <button onClick={() => marcarAlerta(a.id, 'resuelta')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"><Check size={13} strokeWidth={2.2} /> Marcar como resuelta</button>
                                  <button onClick={() => marcarAlerta(a.id, 'descartada')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:underline"><X size={13} strokeWidth={2.2} /> Descartar</button>
                                </>
                              ) : (
                                <button onClick={() => reactivarAlerta(a.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline dark:text-slate-200"><RotateCcw size={13} strokeWidth={2.2} /> Reactivar</button>
                              )}
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
