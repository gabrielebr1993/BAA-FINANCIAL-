import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { calcularAlertas, SEVERIDAD_ORDEN } from '../utils/alertas'
import { calcularPagos } from '../utils/calc'
import { exportarExcel, exportarPDF } from '../utils/exportar'
import { KPI, PageTitle, Card, Boton, Cargando, EstadoVacio } from '../components/ui'
import RangeSelector from '../components/RangeSelector'

const ESTILO = {
  red: 'border-l-rose-500 bg-rose-50 dark:bg-rose-500/10',
  yellow: 'border-l-amber-500 bg-amber-50 dark:bg-amber-500/10',
  blue: 'border-l-sky-500 bg-sky-50 dark:bg-sky-500/10',
}
const NOMBRE_TIPO = { red: 'Grave', yellow: 'Aviso', blue: 'Info' }

export default function Alertas() {
  const { facturaRango: inv, invoicesRango, claims, drivers, invAnterior, alertasDescartadas, descartarAlerta, restaurarAlertas, cargando } = useData()
  const [pendientes, setPendientes] = useState(0)

  // pagos pendientes sin marcar (solo cuando el rango es una sola semana)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (invoicesRango.length !== 1) return setPendientes(0)
      const id = invoicesRango[0].id
      const snap = await getDocs(query(collection(db, 'payroll'), where('invoiceId', '==', id)))
      const pagadas = new Set(snap.docs.filter((d) => d.data().estado === 'pagado').map((d) => d.data().driverNombre))
      const total = calcularPagos(inv, claims, drivers, 'todas').length
      if (vivo) setPendientes(Math.max(0, total - pagadas.size))
    })().catch(() => {})
    return () => { vivo = false }
  }, [invoicesRango, inv, claims, drivers])

  const todas = useMemo(
    () => calcularAlertas({ inv, claims, drivers, invAnterior, pendientes }).sort((a, b) => SEVERIDAD_ORDEN[a.tipo] - SEVERIDAD_ORDEN[b.tipo]),
    [inv, claims, drivers, invAnterior, pendientes]
  )
  const visibles = todas.filter((a) => !alertasDescartadas.has(a.id))
  const nRed = visibles.filter((a) => a.tipo === 'red').length
  const nYellow = visibles.filter((a) => a.tipo === 'yellow').length
  const nBlue = visibles.filter((a) => a.tipo === 'blue').length
  const nDescartadas = todas.length - visibles.length

  const exportarE = () => exportarExcel(`alertas_${inv?.semana || 'periodo'}`, [{ nombre: 'Alertas', rows: visibles.map((a) => ({ Severidad: NOMBRE_TIPO[a.tipo], Título: a.titulo, Detalle: a.detalle })) }])
  const exportarP = () =>
    exportarPDF(`alertas_${inv?.semana || 'periodo'}`, 'Alertas', inv?.semana || '', [
      { titulo: 'Alertas activas', head: ['Severidad', 'Título', 'Detalle'], body: visibles.map((a) => [NOMBRE_TIPO[a.tipo], a.titulo, a.detalle]) },
    ])

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
            <KPI label="Graves" value={nRed} icon="🔴" accent="red" />
            <KPI label="Avisos" value={nYellow} icon="🟡" accent="gold" />
            <KPI label="Info" value={nBlue} icon="🔵" accent="blue" />
            <div className="ml-auto flex gap-2">
              {nDescartadas > 0 && <Boton variant="ghost" onClick={restaurarAlertas}>Restaurar {nDescartadas} descartada(s)</Boton>}
              <Boton variant="ghost" onClick={exportarE} disabled={visibles.length === 0}>📊 Excel</Boton>
              <Boton variant="gold" onClick={exportarP} disabled={visibles.length === 0}>📄 PDF</Boton>
            </div>
          </div>

          {visibles.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-4xl">✅</div>
              <h3 className="mt-2 text-lg font-bold text-brand-navy dark:text-slate-100">Todo en orden</h3>
              <p className="text-slate-500 dark:text-slate-400">No hay alertas activas para este periodo.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {visibles.map((a) => (
                <div key={a.id} className={`flex items-start gap-3 rounded-xl border border-slate-200 border-l-4 p-4 dark:border-slate-700/60 ${ESTILO[a.tipo]}`}>
                  <div className="text-2xl">{a.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-brand-navy dark:text-slate-100">{a.titulo}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{a.detalle}</div>
                    <Link to={a.link} className="mt-1 inline-block text-xs font-semibold text-brand-navy underline dark:text-brand-gold">Ir a la sección →</Link>
                  </div>
                  <button onClick={() => descartarAlerta(a.id)} title="Descartar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
