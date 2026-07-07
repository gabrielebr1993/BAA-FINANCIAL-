import { useState } from 'react'
import { collection, getDocs, query, where, doc, writeBatch } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { nombreCiudadDe } from '../utils/calc'
import { money } from '../utils/format'
import { Card, PageTitle, Boton, Tabla, Aviso, Spinner } from '../components/ui'

export default function Facturas() {
  const { invoices, selectedInvoiceId, activeCompanyId, reloadInvoices, reloadClaims, setSelectedInvoiceId } = useData()
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')

  const eliminar = async () => {
    if (!porEliminar) return
    setEliminando(true)
    setError('')
    try {
      const cs = await getDocs(query(collection(db, 'claims'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', porEliminar.id)))
      const ps = await getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', porEliminar.id)))
      const refs = [...cs.docs.map((d) => d.ref), ...ps.docs.map((d) => d.ref), doc(db, 'invoices', porEliminar.id)]
      const chunk = 450
      for (let i = 0; i < refs.length; i += chunk) {
        const batch = writeBatch(db)
        refs.slice(i, i + chunk).forEach((r) => batch.delete(r))
        await batch.commit()
      }
      const eraSeleccionada = selectedInvoiceId === porEliminar.id
      const restantes = await reloadInvoices()
      if (eraSeleccionada) setSelectedInvoiceId(restantes && restantes[0] ? restantes[0].id : null)
      await reloadClaims()
      setPorEliminar(null)
    } catch (e) {
      setError('Error al eliminar: ' + e.message)
    } finally {
      setEliminando(false)
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

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Facturas cargadas ({invoices.length})</h3>
        <Tabla
          columns={[
            { key: 'semana', label: 'Semana' },
            { key: 'ciudades', label: 'Ciudad(es)' },
            { key: 'fechaCarga', label: 'Cargada' },
            { key: 'archivoNombre', label: 'Archivo', wrap: true },
            { key: 'ingresoTotal', label: 'Total', align: 'right' },
            { key: 'acciones', label: '', align: 'right' },
          ]}
          rows={invoices.map((inv) => ({ ...inv, _key: inv.id }))}
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
