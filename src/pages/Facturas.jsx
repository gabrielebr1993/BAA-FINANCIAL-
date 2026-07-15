import { useState, useMemo } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { useData } from '../DataContext'
import { nombreCiudadDe, TODAS } from '../utils/calc'
import { eliminarFacturaCascada } from '../utils/borrado'
import { money } from '../utils/format'
import { Card, PageTitle, Boton, Tabla, Aviso, Spinner } from '../components/ui'

export default function Facturas() {
  // `invoices` ya viene filtrado por ciudad para el rol admin (desde DataContext).
  const { invoices, invoicesRango, selectedCity, selectedInvoiceId, activeCompanyId, reloadInvoices, reloadClaims, setSelectedInvoiceId } = useData()
  // La lista RESPETA el filtro global de arriba (período + ciudad). Para verlas TODAS,
  // pon "Todo" y "Todas las ciudades" en el filtro. El aviso de duplicados sí revisa
  // todas las facturas (es una limpieza global).
  const listaMostrada = useMemo(
    () => (invoicesRango || []).filter((inv) =>
      selectedCity === TODAS || (inv.ciudad || '') === selectedCity ||
      (inv.resumenCiudades || []).some((c) => c.ubicacion === selectedCity)
    ),
    [invoicesRango, selectedCity]
  )
  const filtrando = selectedCity !== TODAS || (invoices || []).length !== listaMostrada.length
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [progreso, setProgreso] = useState(null) // { hechos, total }
  const [error, setError] = useState('')

  // Posibles DUPLICADOS: facturas con la misma ciudad + semana. Suele pasar al re-subir
  // sin borrar la anterior. Se avisa para que borres las sobrantes (deja una por semana).
  const duplicados = useMemo(() => {
    const grupos = {}
    for (const inv of invoices) {
      const ciu = inv.ciudad || (inv.resumenCiudades || [])[0]?.ubicacion || ''
      const k = `${ciu}||${inv.semana || ''}`
      ;(grupos[k] = grupos[k] || []).push(inv)
    }
    return Object.values(grupos).filter((g) => g.length > 1)
  }, [invoices])

  const eliminar = async () => {
    if (!porEliminar) return
    setEliminando(true)
    setProgreso({ hechos: 0, total: 0 })
    setError('')
    try {
      await eliminarFacturaCascada(activeCompanyId, porEliminar.id, (hechos, total) => setProgreso({ hechos, total }))
      const eraSeleccionada = selectedInvoiceId === porEliminar.id
      const restantes = await reloadInvoices()
      if (eraSeleccionada) setSelectedInvoiceId(restantes && restantes[0] ? restantes[0].id : null)
      await reloadClaims()
      setPorEliminar(null)
    } catch (e) {
      setError('Error al eliminar: ' + e.message)
    } finally {
      setEliminando(false)
      setProgreso(null)
    }
  }

  const fmtFecha = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : null
      return d ? d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
    } catch {
      return '—'
    }
  }

  return (
    <div>
      <PageTitle>Facturas</PageTitle>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {duplicados.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} strokeWidth={1.9} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <b>Posibles facturas duplicadas</b> (misma ciudad y semana). Esto pasa al re-subir una factura sin borrar la anterior, y puede desajustar claims y pagos. Deja <b>una sola por semana</b> y borra las demás con el botón <b>Eliminar</b>.
              <ul className="mt-1.5 list-disc pl-5">
                {duplicados.map((g, i) => (
                  <li key={i}>{(g[0].ciudadNombre || (g[0].resumenCiudades || []).map((c) => nombreCiudadDe(g[0], c.ubicacion)).join(', ') || 'Sin ciudad')} — {g[0].semana}: <b>{g.length} copias</b></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Facturas cargadas ({listaMostrada.length})</h3>
          {filtrando && (
            <span className="text-xs text-slate-400">de {invoices.length} en total · según el filtro de arriba. Pon “Todo” y “Todas las ciudades” para verlas todas.</span>
          )}
        </div>
        <Tabla
          columns={[
            { key: 'semana', label: 'Semana' },
            { key: 'ciudades', label: 'Ciudad(es)' },
            { key: 'fechaCarga', label: 'Cargada' },
            { key: 'archivoNombre', label: 'Archivo', wrap: true },
            { key: 'ingresoTotal', label: 'Total', align: 'right' },
            { key: 'acciones', label: '', align: 'right' },
          ]}
          rows={listaMostrada.map((inv) => ({ ...inv, _key: inv.id }))}
          emptyText="No hay facturas cargadas. Ve a Cargar Factura para subir la primera."
          renderCell={(row, key) => {
            if (key === 'ingresoTotal') return money(row.ingresoTotal)
            if (key === 'fechaCarga') return fmtFecha(row.fechaCarga)
            if (key === 'ciudades') return (row.resumenCiudades || []).map((c) => nombreCiudadDe(row, c.ubicacion)).join(', ') || row.ciudadNombre || '—'
            if (key === 'archivoNombre') return <span className="text-xs text-slate-500 dark:text-slate-400">{row.archivoNombre}</span>
            if (key === 'acciones')
              return <Boton variant="danger" onClick={() => setPorEliminar(row)} className="px-3 py-1 text-xs"><Trash2 size={14} strokeWidth={1.8} /> Eliminar</Boton>
            return row[key]
          }}
        />
      </Card>

      {porEliminar && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={() => !eliminando && setPorEliminar(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-lg font-bold text-brand-navy dark:text-slate-100">Eliminar factura</h3>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              ¿Seguro que quieres eliminar la factura de <b>{porEliminar.ciudadNombre || (porEliminar.resumenCiudades || []).map((c) => nombreCiudadDe(porEliminar, c.ubicacion)).join(', ')}</b> — <b>{porEliminar.semana}</b>?
              Se borrarán también sus <b>claims</b> y <b>pagos</b> asociados. Esta acción no se puede deshacer.
            </p>
            {eliminando && progreso && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Eliminando…</span>
                  <span>{progreso.hechos} de {progreso.total || '—'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-gold transition-all duration-200" style={{ width: `${progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 5}%` }} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setPorEliminar(null)} disabled={eliminando}>Cancelar</Boton>
              <Boton variant="danger" onClick={eliminar} disabled={eliminando}>{eliminando ? <><Spinner /> Eliminando…</> : 'Sí, eliminar'}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
