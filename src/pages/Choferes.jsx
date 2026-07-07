import { useState } from 'react'
import { collection, addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { buscarDriver } from '../utils/calc'
import { money } from '../utils/format'
import { Card, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../components/ui'

const vacio = { nombre: '', precioIndividual: '', precioDoble: '', activo: true }

export default function Choferes() {
  const { drivers, reloadDrivers, selectedInvoice, activeCompanyId } = useData()
  const [form, setForm] = useState(vacio)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState(null) // driver en detalle
  const [notasDraft, setNotasDraft] = useState('')
  const [historial, setHistorial] = useState([])
  const [cargandoDet, setCargandoDet] = useState(false)
  const [guardandoNota, setGuardandoNota] = useState(false)

  const abrirDetalle = async (d) => {
    if (detalle?.id === d.id) { setDetalle(null); return }
    setDetalle(d)
    setNotasDraft(d.notas || '')
    setCargandoDet(true)
    setHistorial([])
    try {
      const q = activeCompanyId
        ? query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('driverNombre', '==', d.nombre))
        : query(collection(db, 'payroll'), where('driverNombre', '==', d.nombre))
      const snap = await getDocs(q)
      setHistorial(snap.docs.map((x) => ({ id: x.id, ...x.data() })))
    } catch { /* noop */ } finally {
      setCargandoDet(false)
    }
  }

  const guardarNota = async () => {
    if (!detalle) return
    setGuardandoNota(true)
    try {
      await updateDoc(doc(db, 'drivers', detalle.id), { notas: notasDraft, notasEditadoEn: serverTimestamp() })
      await reloadDrivers()
      setDetalle((d) => ({ ...d, notas: notasDraft, notasEditadoEn: { toDate: () => new Date() } }))
    } finally {
      setGuardandoNota(false)
    }
  }

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const empezarEdicion = (d) => {
    setEditId(d.id)
    setForm({ nombre: d.nombre || '', precioIndividual: d.precioIndividual ?? '', precioDoble: d.precioDoble ?? '', activo: d.activo !== false })
  }
  const cancelar = () => {
    setEditId(null)
    setForm(vacio)
    setError('')
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio (debe coincidir con "Courier" del Excel).')
    setGuardando(true)
    setError('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        precioIndividual: Number(form.precioIndividual) || 0,
        precioDoble: Number(form.precioDoble) || 0,
        activo: !!form.activo,
      }
      if (editId) await updateDoc(doc(db, 'drivers', editId), payload)
      else await addDoc(collection(db, 'drivers'), { ...payload, companyId: activeCompanyId })
      await reloadDrivers()
      cancelar()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (d) => {
    await updateDoc(doc(db, 'drivers', d.id), { activo: !(d.activo !== false) })
    await reloadDrivers()
  }

  const crearRapido = (nombre) => {
    setEditId(null)
    setForm({ ...vacio, nombre })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sinTarifa = selectedInvoice
    ? [...new Set((selectedInvoice.resumenChoferes || []).map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []

  return (
    <div>
      <PageTitle>Choferes y Tarifas</PageTitle>

      {sinTarifa.length > 0 && (
        <Aviso tipo="warn">
          🚚 Choferes sin tarifa en la última factura ({sinTarifa.length}):
          <div className="mt-2 flex flex-wrap gap-2">
            {sinTarifa.map((n) => (
              <Boton key={n} variant="ghost" onClick={() => crearRapido(n)} className="px-2.5 py-1 text-xs">
                + {n}
              </Boton>
            ))}
          </div>
        </Aviso>
      )}

      <Card className="mb-5 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar chofer' : 'Agregar chofer'}</h3>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Nombre (= Courier del Excel)">
            <Input className="w-52" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} disabled={!!editId} />
          </Campo>
          <Campo label="Precio individual ($)">
            <Input className="w-40" type="number" step="0.01" value={form.precioIndividual} onChange={(e) => setF('precioIndividual', e.target.value)} />
          </Campo>
          <Campo label="Precio doble ($)">
            <Input className="w-40" type="number" step="0.01" value={form.precioDoble} onChange={(e) => setF('precioDoble', e.target.value)} />
          </Campo>
          <Campo label="Activo">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.activo} onChange={(e) => setF('activo', e.target.checked)} /> {form.activo ? 'Sí' : 'No'}
            </label>
          </Campo>
          <Boton onClick={guardar} disabled={guardando} variant="gold">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Agregar'}
          </Boton>
          {editId && (
            <Boton onClick={cancelar} variant="ghost">
              Cancelar
            </Boton>
          )}
        </div>
      </Card>

      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes registrados</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">Mostrando {drivers.length} de {drivers.length}</span>
      </div>
      <Tabla
        columns={[
          { key: 'nombre', label: 'Chofer' },
          { key: 'precioIndividual', label: 'Precio individual', align: 'right' },
          { key: 'precioDoble', label: 'Precio doble', align: 'right' },
          { key: 'activo', label: 'Estado', align: 'center' },
          { key: 'acciones', label: 'Acciones', align: 'right' },
        ]}
        rows={[...drivers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map((d) => ({ ...d, _key: d.id }))}
        emptyText="Aún no hay choferes registrados."
        renderCell={(row, key) => {
          if (key === 'precioIndividual' || key === 'precioDoble') return money(row[key])
          if (key === 'activo') return row.activo !== false ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>
          if (key === 'acciones')
            return (
              <div className="flex justify-end gap-2">
                <Boton variant="ghost" onClick={() => abrirDetalle(row)} className="px-2.5 py-1 text-xs">
                  {detalle?.id === row.id ? 'Cerrar' : 'Detalle'}
                </Boton>
                <Boton variant="ghost" onClick={() => empezarEdicion(row)} className="px-2.5 py-1 text-xs">
                  Editar
                </Boton>
                <Boton variant="ghost" onClick={() => toggleActivo(row)} className="px-2.5 py-1 text-xs">
                  {row.activo !== false ? 'Desactivar' : 'Activar'}
                </Boton>
              </div>
            )
          return row[key]
        }}
      />

      {detalle && (
        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Detalle de {detalle.nombre}</h3>
            <Boton variant="ghost" onClick={() => setDetalle(null)} className="ml-auto px-2.5 py-1 text-xs">Cerrar</Boton>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Notas */}
            <div>
              <div className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Notas</div>
              <textarea
                value={notasDraft}
                onChange={(e) => setNotasDraft(e.target.value)}
                rows={4}
                placeholder="Ej. advertido por claims el 05/07…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <div className="mt-2 flex items-center gap-2">
                <Boton variant="gold" onClick={guardarNota} disabled={guardandoNota}>{guardandoNota ? <><Spinner /> Guardando…</> : 'Guardar nota'}</Boton>
                {detalle.notasEditadoEn?.toDate && (
                  <span className="text-xs text-slate-400">Última edición: {detalle.notasEditadoEn.toDate().toLocaleString('es')}</span>
                )}
              </div>
            </div>

            {/* Historial de pagos */}
            <div>
              <div className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Historial de pagos</div>
              {cargandoDet ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Spinner className="text-brand-gold" /> Cargando…</div>
              ) : historial.length === 0 ? (
                <div className="py-4 text-sm text-slate-400">Sin pagos registrados todavía.</div>
              ) : (
                <>
                  <div className="scroll-thin max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0">
                        <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <th className="px-3 py-2 text-left font-semibold">Semana</th>
                          <th className="px-3 py-2 text-right font-semibold">Total</th>
                          <th className="px-3 py-2 text-center font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((h) => (
                          <tr key={h.id} className="border-t border-slate-100 dark:border-slate-700/50">
                            <td className="px-3 py-1.5">{h.semana}</td>
                            <td className="px-3 py-1.5 text-right">{money(h.totalPagar)}</td>
                            <td className="px-3 py-1.5 text-center">{h.estado === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Total acumulado: <b>{money(historial.reduce((a, h) => a + (h.totalPagar || 0), 0))}</b> · Pagado: <b>{money(historial.filter((h) => h.estado === 'pagado').reduce((a, h) => a + (h.totalPagar || 0), 0))}</b>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}
