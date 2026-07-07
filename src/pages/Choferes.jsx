import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { calcularPagos, buscarDriver } from '../utils/calc'
import { CLAIM_FEE } from '../constants'
import { money, num } from '../utils/format'
import { Truck, Check } from 'lucide-react'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../components/ui'
import ManagersPanel from '../components/ManagersPanel'

const vacio = { nombre: '', precioIndividual: '', precioDoble: '', activo: true }
const key = (n) => (n || '').trim().toLowerCase()

export default function Choferes() {
  const { drivers, reloadDrivers, facturaRango, claims, activeCompanyId } = useData()
  const navigate = useNavigate()

  const [tab, setTab] = useState('choferes')
  // ---- alta de chofer ----
  const [form, setForm] = useState(vacio)
  const [guardandoAlta, setGuardandoAlta] = useState(false)
  const [error, setError] = useState('')

  // ---- edición en línea ----
  const [borradores, setBorradores] = useState({}) // id -> { ind, dob }
  const [guardadoId, setGuardadoId] = useState(null)

  // ---- selección / masivo ----
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [busqueda, setBusqueda] = useState('')
  const [bulkTarifa, setBulkTarifa] = useState({ ind: '', dob: '' })
  const [bulkAjuste, setBulkAjuste] = useState({ modo: 'monto', op: 'sumar', valor: '' })
  const [confirm, setConfirm] = useState(null) // { texto, accion }
  const [ocupado, setOcupado] = useState(false)

  // ---- modal edición ----
  const [modal, setModal] = useState(null) // driver
  const [modalForm, setModalForm] = useState(null)
  const [guardandoModal, setGuardandoModal] = useState(false)
  const [historial, setHistorial] = useState([])
  const [cargandoHist, setCargandoHist] = useState(false)

  // sincronizar borradores con drivers
  useEffect(() => {
    setBorradores((prev) => {
      const next = { ...prev }
      drivers.forEach((d) => { if (!next[d.id]) next[d.id] = { ind: String(d.precioIndividual ?? ''), dob: String(d.precioDoble ?? '') } })
      return next
    })
  }, [drivers])

  const pagoMap = useMemo(() => {
    const m = {}
    calcularPagos(facturaRango, claims, drivers, 'todas').forEach((p) => (m[key(p.nombre)] = p))
    return m
  }, [facturaRango, claims, drivers])

  const filtrados = useMemo(
    () => [...drivers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).filter((d) => (d.nombre || '').toLowerCase().includes(busqueda.trim().toLowerCase())),
    [drivers, busqueda]
  )

  const totalRow = (d) => {
    const w = pagoMap[key(d.nombre)]
    if (!w) return null
    const ind = Number(borradores[d.id]?.ind ?? d.precioIndividual) || 0
    const dob = Number(borradores[d.id]?.dob ?? d.precioDoble) || 0
    return w.individuales * ind + w.dobles * dob - w.claimsActivos * CLAIM_FEE
  }
  const totalNomina = filtrados.reduce((a, d) => a + (totalRow(d) || 0), 0)

  // ---- alta ----
  const agregar = async () => {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio (debe coincidir con "Courier" del Excel).')
    if (Number(form.precioIndividual) < 0 || Number(form.precioDoble) < 0) return setError('Las tarifas no pueden ser negativas.')
    setGuardandoAlta(true)
    setError('')
    try {
      await addDoc(collection(db, 'drivers'), {
        nombre: form.nombre.trim(),
        precioIndividual: Number(form.precioIndividual) || 0,
        precioDoble: Number(form.precioDoble) || 0,
        activo: !!form.activo,
        companyId: activeCompanyId,
      })
      await reloadDrivers()
      setForm(vacio)
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardandoAlta(false)
    }
  }

  // ---- edición en línea (guarda al salir del campo) ----
  const setBorrador = (id, campo, valor) => setBorradores((b) => ({ ...b, [id]: { ...b[id], [campo]: valor } }))
  const guardarTarifa = async (d) => {
    const ind = Number(borradores[d.id]?.ind)
    const dob = Number(borradores[d.id]?.dob)
    if (isNaN(ind) || isNaN(dob) || ind < 0 || dob < 0) return
    if (ind === Number(d.precioIndividual) && dob === Number(d.precioDoble)) return
    await updateDoc(doc(db, 'drivers', d.id), { precioIndividual: ind, precioDoble: dob })
    await reloadDrivers()
    setGuardadoId(d.id)
    setTimeout(() => setGuardadoId((g) => (g === d.id ? null : g)), 1800)
  }

  const toggleActivoUno = async (d) => {
    await updateDoc(doc(db, 'drivers', d.id), { activo: !(d.activo !== false) })
    await reloadDrivers()
  }

  // ---- selección ----
  const toggleSel = (id) => setSeleccion((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosSel = filtrados.length > 0 && filtrados.every((d) => seleccion.has(d.id))
  const toggleTodos = () => setSeleccion((s) => { const n = new Set(s); if (todosSel) filtrados.forEach((d) => n.delete(d.id)); else filtrados.forEach((d) => n.add(d.id)); return n })
  const idsSel = () => filtrados.filter((d) => seleccion.has(d.id)).map((d) => d.id)

  const aplicarBatch = async (fn, textoOk) => {
    setOcupado(true)
    try {
      const ids = idsSel()
      const chunk = 400
      for (let i = 0; i < ids.length; i += chunk) {
        const batch = writeBatch(db)
        ids.slice(i, i + chunk).forEach((id) => { const d = drivers.find((x) => x.id === id); if (d) fn(batch, d) })
        await batch.commit()
      }
      await reloadDrivers()
      setSeleccion(new Set())
      setConfirm(null)
    } finally {
      setOcupado(false)
    }
  }

  const pedirAplicarTarifa = () => {
    const ind = Number(bulkTarifa.ind), dob = Number(bulkTarifa.dob)
    if ((bulkTarifa.ind !== '' && (isNaN(ind) || ind < 0)) || (bulkTarifa.dob !== '' && (isNaN(dob) || dob < 0))) return setError('Tarifas inválidas.')
    setConfirm({
      texto: `Aplicar tarifa ${bulkTarifa.ind !== '' ? 'individual ' + money(ind) : ''}${bulkTarifa.dob !== '' ? ' doble ' + money(dob) : ''} a ${idsSel().length} chofer(es).`,
      accion: () => aplicarBatch((batch, d) => {
        const p = {}
        if (bulkTarifa.ind !== '') p.precioIndividual = ind
        if (bulkTarifa.dob !== '') p.precioDoble = dob
        batch.update(doc(db, 'drivers', d.id), p)
      }),
    })
  }

  const pedirAjustar = () => {
    const v = Number(bulkAjuste.valor)
    if (isNaN(v)) return setError('Valor de ajuste inválido.')
    const signo = bulkAjuste.op === 'restar' ? -1 : 1
    const ajustar = (base) => {
      const nb = bulkAjuste.modo === 'pct' ? base * (1 + (signo * v) / 100) : base + signo * v
      return Math.max(0, Math.round(nb * 100) / 100)
    }
    setConfirm({
      texto: `Ajustar tarifas ${bulkAjuste.op === 'restar' ? '−' : '+'}${v}${bulkAjuste.modo === 'pct' ? '%' : ' $'} a ${idsSel().length} chofer(es).`,
      accion: () => aplicarBatch((batch, d) => batch.update(doc(db, 'drivers', d.id), { precioIndividual: ajustar(Number(d.precioIndividual) || 0), precioDoble: ajustar(Number(d.precioDoble) || 0) })),
    })
  }

  const pedirActivar = (activo) =>
    setConfirm({ texto: `${activo ? 'Activar' : 'Desactivar'} ${idsSel().length} chofer(es).`, accion: () => aplicarBatch((batch, d) => batch.update(doc(db, 'drivers', d.id), { activo })) })

  // ---- modal ----
  const abrirModal = async (d) => {
    setModal(d)
    setModalForm({ nombre: d.nombre || '', precioIndividual: d.precioIndividual ?? '', precioDoble: d.precioDoble ?? '', activo: d.activo !== false, notas: d.notas || '' })
    setCargandoHist(true)
    setHistorial([])
    try {
      const q = activeCompanyId
        ? query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('driverNombre', '==', d.nombre))
        : query(collection(db, 'payroll'), where('driverNombre', '==', d.nombre))
      const snap = await getDocs(q)
      setHistorial(snap.docs.map((x) => ({ id: x.id, ...x.data() })))
    } catch { /* noop */ } finally {
      setCargandoHist(false)
    }
  }
  const guardarModal = async () => {
    if (Number(modalForm.precioIndividual) < 0 || Number(modalForm.precioDoble) < 0) return setError('Las tarifas no pueden ser negativas.')
    setGuardandoModal(true)
    try {
      await updateDoc(doc(db, 'drivers', modal.id), {
        precioIndividual: Number(modalForm.precioIndividual) || 0,
        precioDoble: Number(modalForm.precioDoble) || 0,
        activo: !!modalForm.activo,
        notas: modalForm.notas,
        notasEditadoEn: serverTimestamp(),
      })
      await reloadDrivers()
      setModal(null)
    } finally {
      setGuardandoModal(false)
    }
  }

  const sinTarifa = facturaRango
    ? [...new Set((facturaRango.resumenChoferes || []).map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []
  const nSel = idsSel().length

  return (
    <div>
      <PageTitle right={facturaRango && <span className="text-sm text-slate-500 dark:text-slate-400">Semana: <b className="text-brand-navy dark:text-slate-200">{facturaRango.semana}</b></span>}>Choferes y Tarifas</PageTitle>

      <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        {[{ k: 'choferes', l: 'Choferes' }, { k: 'managers', l: 'Managers' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm font-medium transition ${tab === t.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'managers' ? (
        <ManagersPanel />
      ) : (
       <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {sinTarifa.length > 0 && (
        <Aviso tipo="warn">
          <span className="inline-flex items-center gap-1.5"><Truck size={15} strokeWidth={1.8} /> {sinTarifa.length} chofer(es) de la factura sin tarifa: {sinTarifa.slice(0, 8).join(', ')}{sinTarifa.length > 8 ? '…' : ''}. Créalos abajo.</span>
        </Aviso>
      )}

      {/* Alta de chofer */}
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Agregar chofer</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Nombre (= Courier del Excel)"><Input className="w-56" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></Campo>
          <Campo label="Precio individual ($)"><Input className="w-36" type="number" step="0.01" min="0" value={form.precioIndividual} onChange={(e) => setForm((f) => ({ ...f, precioIndividual: e.target.value }))} /></Campo>
          <Campo label="Precio doble ($)"><Input className="w-36" type="number" step="0.01" min="0" value={form.precioDoble} onChange={(e) => setForm((f) => ({ ...f, precioDoble: e.target.value }))} /></Campo>
          <Boton variant="gold" onClick={agregar} disabled={guardandoAlta}>{guardandoAlta ? 'Guardando…' : 'Agregar'}</Boton>
        </div>
      </Card>

      {/* Barra de búsqueda + contador */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Input className="w-64" placeholder="Buscar chofer…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="text-sm text-slate-500 dark:text-slate-400">Mostrando {filtrados.length} de {drivers.length}</span>
      </div>

      {/* Barra de acciones masivas */}
      {nSel > 0 && (
        <Card className="mb-2 border-2 border-brand-gold/50 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <span className="self-center font-semibold text-brand-navy dark:text-slate-100">{nSel} seleccionado(s)</span>
            <div className="flex items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
              <Campo label="Tarifa ind."><Input className="w-24" type="number" step="0.01" min="0" value={bulkTarifa.ind} onChange={(e) => setBulkTarifa((b) => ({ ...b, ind: e.target.value }))} /></Campo>
              <Campo label="doble"><Input className="w-24" type="number" step="0.01" min="0" value={bulkTarifa.dob} onChange={(e) => setBulkTarifa((b) => ({ ...b, dob: e.target.value }))} /></Campo>
              <Boton variant="ghost" onClick={pedirAplicarTarifa}>Aplicar tarifa</Boton>
            </div>
            <div className="flex items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
              <Campo label="Ajustar">
                <select value={bulkAjuste.op} onChange={(e) => setBulkAjuste((b) => ({ ...b, op: e.target.value }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  <option value="sumar">+</option>
                  <option value="restar">−</option>
                </select>
              </Campo>
              <Input className="w-20" type="number" step="0.01" value={bulkAjuste.valor} onChange={(e) => setBulkAjuste((b) => ({ ...b, valor: e.target.value }))} />
              <select value={bulkAjuste.modo} onChange={(e) => setBulkAjuste((b) => ({ ...b, modo: e.target.value }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="monto">$</option>
                <option value="pct">%</option>
              </select>
              <Boton variant="ghost" onClick={pedirAjustar}>Ajustar</Boton>
            </div>
            <Boton variant="ghost" onClick={() => pedirActivar(true)}>Activar</Boton>
            <Boton variant="ghost" onClick={() => pedirActivar(false)}>Desactivar</Boton>
            <Boton variant="ghost" onClick={() => setSeleccion(new Set())}>Limpiar</Boton>
          </div>
        </Card>
      )}

      {/* Tabla */}
      <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <th className="px-2 py-2.5"><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>
              <th className="px-3 py-2.5 text-left font-semibold">Chofer</th>
              <th className="px-3 py-2.5 text-right font-semibold">Precio parada</th>
              <th className="px-3 py-2.5 text-right font-semibold">Precio doble</th>
              <th className="px-3 py-2.5 text-right font-semibold">Ind.</th>
              <th className="px-3 py-2.5 text-right font-semibold">Dobles</th>
              <th className="px-3 py-2.5 text-right font-semibold">Claims</th>
              <th className="px-3 py-2.5 text-right font-semibold">Total semana</th>
              <th className="px-3 py-2.5 text-center font-semibold">Activo</th>
              <th className="px-3 py-2.5 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">Sin choferes.</td></tr>}
            {filtrados.map((d, i) => {
              const w = pagoMap[key(d.nombre)]
              const total = totalRow(d)
              return (
                <tr key={d.id} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/40 dark:bg-slate-800/20' : ''}`}>
                  <td className="px-2 py-2 text-center"><input type="checkbox" checked={seleccion.has(d.id)} onChange={() => toggleSel(d.id)} /></td>
                  <td className="px-3 py-2">
                    <button onClick={() => navigate(`/choferes/${encodeURIComponent(d.nombre)}`)} className="font-medium text-brand-navy hover:underline dark:text-slate-100">{d.nombre}</button>
                    {guardadoId === d.id && <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400"><Check size={12} strokeWidth={2.4} /> guardado</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" min="0" value={borradores[d.id]?.ind ?? ''} onChange={(e) => setBorrador(d.id, 'ind', e.target.value)} onBlur={() => guardarTarifa(d)}
                      className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" min="0" value={borradores[d.id]?.dob ?? ''} onChange={(e) => setBorrador(d.id, 'dob', e.target.value)} onBlur={() => guardarTarifa(d)}
                      className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                  </td>
                  <td className="px-3 py-2 text-right">{w ? num(w.individuales) : '—'}</td>
                  <td className="px-3 py-2 text-right">{w ? num(w.dobles) : '—'}</td>
                  <td className="px-3 py-2 text-right">{w ? `${w.claimsActivos}/${w.claimsTotales}` : '—'}</td>
                  <td className="px-3 py-2 text-right font-bold">{total == null ? '—' : money(total)}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => toggleActivoUno(d)}>{d.activo !== false ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>}</button>
                  </td>
                  <td className="px-3 py-2 text-right"><Boton variant="ghost" onClick={() => abrirModal(d)} className="px-2.5 py-1 text-xs">Editar</Boton></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold dark:bg-slate-800">
              <td colSpan={7} className="px-3 py-2.5 text-right">Total nómina de la semana:</td>
              <td className="px-3 py-2.5 text-right text-brand-gold">{money(totalNomina)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal de confirmación masiva */}
      {confirm && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={() => !ocupado && setConfirm(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-lg font-bold text-brand-navy dark:text-slate-100">Confirmar cambio masivo</h3>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{confirm.texto}</p>
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setConfirm(null)} disabled={ocupado}>Cancelar</Boton>
              <Boton variant="gold" onClick={confirm.accion} disabled={ocupado}>{ocupado ? <><Spinner /> Aplicando…</> : 'Confirmar'}</Boton>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de edición */}
      {modal && modalForm && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">Editar chofer</h3>
              <Boton variant="ghost" onClick={() => setModal(null)} className="ml-auto px-2.5 py-1 text-xs">Cerrar</Boton>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre (= Courier del Excel)</div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">{modalForm.nombre}</div>
            </div>
            <div className="mb-3 flex flex-wrap gap-3">
              <Campo label="Precio individual ($)"><Input className="w-36" type="number" step="0.01" min="0" value={modalForm.precioIndividual} onChange={(e) => setModalForm((f) => ({ ...f, precioIndividual: e.target.value }))} /></Campo>
              <Campo label="Precio doble ($)"><Input className="w-36" type="number" step="0.01" min="0" value={modalForm.precioDoble} onChange={(e) => setModalForm((f) => ({ ...f, precioDoble: e.target.value }))} /></Campo>
              <Campo label="Activo">
                <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={modalForm.activo} onChange={(e) => setModalForm((f) => ({ ...f, activo: e.target.checked }))} /> {modalForm.activo ? 'Sí' : 'No'}</label>
              </Campo>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Notas</div>
              <textarea rows={3} value={modalForm.notas} onChange={(e) => setModalForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Ej. advertido por claims el 05/07…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>

            <div className="mb-3">
              <div className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Historial de pagos</div>
              {cargandoHist ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-400"><Spinner className="text-brand-gold" /> Cargando…</div>
              ) : historial.length === 0 ? (
                <div className="py-2 text-sm text-slate-400">Sin pagos registrados.</div>
              ) : (
                <>
                  <div className="scroll-thin max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full border-collapse text-sm">
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
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Acumulado: <b>{money(historial.reduce((a, h) => a + (h.totalPagar || 0), 0))}</b></div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setModal(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={guardarModal} disabled={guardandoModal}>{guardandoModal ? <><Spinner /> Guardando…</> : 'Guardar cambios'}</Boton>
            </div>
          </Card>
        </div>
      )}
       </>
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
