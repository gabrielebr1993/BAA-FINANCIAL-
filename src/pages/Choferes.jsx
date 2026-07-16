import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { calcularPagos, buscarDriver, TODAS } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { crearUsuarioApi } from '../utils/api'
import { Truck, Check, KeyRound, Trash2, FileSpreadsheet, Landmark, MapPin } from 'lucide-react'
import { exportarExcel } from '../utils/exportar'
import { exportarDatosBancarios } from '../utils/exportarBancos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../components/ui'
import ManagersPanel from '../components/ManagersPanel'
import RegistroChoferes from '../components/RegistroChoferes'

const vacio = { nombre: '', precioIndividual: '', precioDoble: '', activo: true }
const key = (n) => (n || '').trim().toLowerCase()

export default function Choferes() {
  const { drivers: driversAll, reloadDrivers, facturaRango, invoices, claims, activeCompanyId, selectedCity, ciudadesEmpresa, ajustes } = useData()
  // Modo POR RUTA: el rate del chofer sale de su RUTA (no editable aquí); en modo
  // estándar sale de su ficha (editable). Se muestra el que realmente se le aplica.
  const modoRuta = ajustes?.modoConfig === 'ruta'
  const rutasDef = ajustes?.reglasRuta || {}
  const rateDeRuta = (d) => { const r = rutasDef[d?.rutaDefault] || {}; return { ind: Number(r.tarifaInd) || 0, dob: Number(r.tarifaDoble) || 0, ruta: d?.rutaDefault } }
  // Nombre legible de una ciudad (config de la empresa primero, luego catálogo).
  const nombreCiudadCorto = (cod) => (ciudadesEmpresa || []).find((c) => c.codigo === cod)?.nombre || nombreCiudad(cod)
  const { ciudadBloqueada, ciudadesUsuario, esSuperAdmin, perfil } = useAuth()
  const ciudadesUsuarioKey = (ciudadesUsuario || []).join('|')
  // Ciudades relevantes para filtrar listas: la elegida (si ≠ Todas); si no y el
  // usuario está bloqueado, SUS ciudades; si no, null (todas).
  const ciudadesRelevantes = (selectedCity && selectedCity !== TODAS)
    ? new Set([selectedCity])
    : (ciudadBloqueada ? new Set(ciudadesUsuarioKey ? ciudadesUsuarioKey.split('|') : []) : null)
  const esDueno = esSuperAdmin || perfil?.role === 'owner'
  // El dueño/súper-admin ven Gastos fijos de todas las ciudades; el ADMIN también
  // los gestiona pero solo de SU ciudad (ManagersPanel ya respeta ciudadBloqueada).
  const puedeGastos = esDueno || perfil?.role === 'admin'
  const navigate = useNavigate()

  // Ciudad "de casa" de cada chofer (por nombre): donde tiene más paquetes en TODAS
  // las facturas. Sirve para respetar el filtro de ciudad aunque el chofer no esté
  // en el rango actual.
  const ciudadDeDriverNombre = useMemo(() => {
    const acc = {}
    for (const inv of (invoices || [])) {
      for (const ch of (inv.resumenChoferes || [])) {
        if (!ch.ciudad) continue
        const pq = (ch.individuales || 0) + (ch.dobles || 0)
        acc[ch.nombre] = acc[ch.nombre] || {}
        acc[ch.nombre][ch.ciudad] = (acc[ch.nombre][ch.ciudad] || 0) + pq
      }
    }
    const out = {}
    for (const [nombre, m] of Object.entries(acc)) out[nombre] = Object.keys(m).sort((a, b) => m[b] - m[a])[0] || ''
    return out
  }, [invoices])

  // Lista de choferes respetando la CIUDAD seleccionada en la barra global:
  //  - Usuario bloqueado a su ciudad: solo los de SU ciudad.
  //  - Cualquiera con una ciudad elegida (≠ Todas): solo los de esa ciudad.
  //  - "Todas": todos.
  const drivers = useMemo(() => {
    if (!ciudadesRelevantes || ciudadesRelevantes.size === 0) return driversAll
    const enEsasCiudades = new Set()
    ;(facturaRango?.resumenChoferes || []).forEach((c) => { if (ciudadesRelevantes.has(c.ciudad)) enEsasCiudades.add((c.nombre || '').trim().toLowerCase()) })
    return driversAll.filter((d) =>
      (d.ciudad && ciudadesRelevantes.has(d.ciudad)) ||
      ciudadesRelevantes.has(ciudadDeDriverNombre[d.nombre]) ||
      enEsasCiudades.has((d.nombre || '').trim().toLowerCase())
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driversAll, ciudadesUsuarioKey, ciudadBloqueada, selectedCity, facturaRango, ciudadDeDriverNombre])

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
  // ---- acceso del chofer (rol driver) ----
  const [accesoForm, setAccesoForm] = useState({ email: '', password: '' })
  const [creandoAcceso, setCreandoAcceso] = useState(false)
  const [accesoMsg, setAccesoMsg] = useState(null)

  const crearAccesoDriver = async () => {
    setAccesoMsg(null)
    if (!accesoForm.email.trim()) return setAccesoMsg({ tipo: 'error', txt: 'Escribe el email del chofer.' })
    if (String(accesoForm.password).length < 6) return setAccesoMsg({ tipo: 'error', txt: 'La contraseña debe tener al menos 6 caracteres.' })
    if (!activeCompanyId || !modal) return
    setCreandoAcceso(true)
    try {
      const token = await auth.currentUser.getIdToken()
      const email = accesoForm.email.trim()
      const data = await crearUsuarioApi({ nombre: modalForm.nombre, email, password: accesoForm.password, role: 'driver', companyId: activeCompanyId, driverId: modal.id, driverNombre: modalForm.nombre }, token)
      if (!data.ok) return setAccesoMsg({ tipo: 'error', txt: data.error || 'No se pudo crear el acceso.' })
      // Guardar en el doc del chofer que ya tiene cuenta (email de acceso), para
      // saber de un vistazo quién ya tiene portal. No rompe nada del cálculo.
      try {
        await updateDoc(doc(db, 'drivers', modal.id), { accesoEmail: email })
        setModal((m) => (m ? { ...m, accesoEmail: email } : m))
        await reloadDrivers()
      } catch { /* si falla el updateDoc, el acceso igual quedó creado */ }
      setAccesoMsg({ tipo: 'ok', txt: `Acceso creado. Correo: ${email} · Contraseña: ${accesoForm.password} · Link: ${window.location.origin}` })
      setAccesoForm({ email: '', password: '' })
    } catch (e) {
      setAccesoMsg({ tipo: 'error', txt: 'Error: ' + e.message })
    } finally {
      setCreandoAcceso(false)
    }
  }

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
    calcularPagos(facturaRango, claims, drivers, selectedCity).forEach((p) => (m[key(p.nombre)] = p))
    return m
  }, [facturaRango, claims, drivers, selectedCity])

  // Filtra por nombre O por rate (individual/doble): escribir "1.6" muestra los que ganan 1.6.
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return [...drivers]
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .filter((d) => {
        if (!q) return true
        const nombre = (d.nombre || '').toLowerCase()
        const ind = String(d.precioIndividual ?? '')
        const dob = String(d.precioDoble ?? '')
        return nombre.includes(q) || ind.includes(q) || dob.includes(q)
      })
  }, [drivers, busqueda])

  const totalRow = (d) => {
    const w = pagoMap[key(d.nombre)]
    if (!w) return null
    const ind = Number(borradores[d.id]?.ind ?? d.precioIndividual) || 0
    const dob = Number(borradores[d.id]?.dob ?? d.precioDoble) || 0
    return w.individuales * ind + w.dobles * dob - (w.descuentoClaims || 0)
  }
  const totalNomina = filtrados.reduce((a, d) => a + (totalRow(d) || 0), 0)

  // Exporta a Excel los choferes mostrados (todos si no hay búsqueda) con su rate,
  // estado y sus números de la semana seleccionada.
  const exportarChoferes = () => {
    const rows = filtrados.map((d) => {
      const w = pagoMap[key(d.nombre)]
      const t = totalRow(d)
      return {
        Chofer: d.nombre,
        'Rate individual': Number(d.precioIndividual) || 0,
        'Rate doble': Number(d.precioDoble) || 0,
        Activo: d.activo === false ? 'No' : 'Sí',
        Individuales: w ? w.individuales : 0,
        Dobles: w ? w.dobles : 0,
        Claims: w ? w.claimsTotales : 0,
        'Total semana': t == null ? 0 : Math.round(t),
      }
    })
    exportarExcel(`choferes_${new Date().toISOString().slice(0, 10)}`, [{ nombre: 'Choferes', rows }])
  }

  // Exporta datos bancarios (Excel). Si hay selección → solo los seleccionados;
  // si no → los choferes mostrados (todos si no hay búsqueda).
  const exportarBancarios = () => {
    const base = (seleccion.size > 0 ? drivers.filter((d) => seleccion.has(d.id)) : filtrados)
      .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    exportarDatosBancarios(base.map((d) => ({ nombre: d.nombre, verificacion: d.verificacion })), `datos-bancarios-choferes_${new Date().toISOString().slice(0, 10)}`)
  }

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

  const pedirBorrar = () =>
    setConfirm({
      peligro: true,
      texto: `Vas a ELIMINAR ${idsSel().length} chofer(es) de forma permanente. El historial de pagos y los claims ya cargados NO se borran (quedan como registro), pero estos choferes desaparecerán de la lista y de los cálculos futuros. Esta acción no se puede deshacer.`,
      accion: () => aplicarBatch((batch, d) => batch.delete(doc(db, 'drivers', d.id))),
    })

  // Eliminar UN chofer desde su ficha. Cierra la ficha y pide confirmación roja.
  const pedirBorrarUno = (d) => {
    setModal(null)
    setConfirm({
      peligro: true,
      texto: `Vas a ELIMINAR al chofer "${d.nombre}" de forma permanente. El historial de pagos y los claims ya cargados NO se borran (quedan como registro), pero desaparecerá de la lista y de los cálculos futuros. Esta acción no se puede deshacer.`,
      accion: async () => {
        setOcupado(true)
        try {
          await deleteDoc(doc(db, 'drivers', d.id))
          await reloadDrivers()
          setSeleccion((s) => { const n = new Set(s); n.delete(d.id); return n })
          setConfirm(null)
        } finally {
          setOcupado(false)
        }
      },
    })
  }

  // ---- modal ----
  const abrirModal = async (d) => {
    setModal(d)
    setModalForm({ nombre: d.nombre || '', precioIndividual: d.precioIndividual ?? '', precioDoble: d.precioDoble ?? '', activo: d.activo !== false, notas: d.notas || '' })
    setAccesoForm({ email: '', password: '' })
    setAccesoMsg(null)
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

  // Choferes de la factura sin tarifa creada. Se acota a las ciudades relevantes
  // (la elegida, o las del usuario si está bloqueado).
  const sinTarifa = facturaRango
    ? [...new Set((facturaRango.resumenChoferes || [])
        .filter((c) => !ciudadesRelevantes || ciudadesRelevantes.has(c.ciudad))
        .map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []
  const nSel = idsSel().length

  return (
    <div>
      <PageTitle right={facturaRango && <span className="text-sm text-slate-500 dark:text-slate-400">Semana: <b className="text-brand-navy dark:text-slate-200">{facturaRango.semana}</b></span>}>Choferes y Tarifas</PageTitle>

      {/* Gastos fijos: dueño/súper-admin (todas las ciudades) y admin (solo su ciudad). El manager no. */}
      {puedeGastos && (
        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {[{ k: 'choferes', l: 'Choferes' }, { k: 'managers', l: 'Gastos fijos' }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm font-medium transition ${tab === t.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>
              {t.l}
            </button>
          ))}
        </div>
      )}

      {puedeGastos && tab === 'managers' ? (
        <ManagersPanel />
      ) : (
       <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {sinTarifa.length > 0 && (
        <Aviso tipo="warn">
          <span className="inline-flex items-center gap-1.5"><Truck size={15} strokeWidth={1.8} /> {sinTarifa.length} chofer(es) de la factura sin tarifa: {sinTarifa.slice(0, 8).join(', ')}{sinTarifa.length > 8 ? '…' : ''}. Créalos abajo.</span>
        </Aviso>
      )}

      {/* Enlace público de registro (SSN / banco / W-9) */}
      <RegistroChoferes drivers={drivers} activeCompanyId={activeCompanyId} reloadDrivers={reloadDrivers} />

      {/* Alta de chofer */}
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Agregar chofer</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Nombre (= Courier del Excel)"><Input className="w-56" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></Campo>
          <Campo label="Rate individual ($) — lo que le pagas"><Input className="w-36" type="number" step="0.01" min="0" value={form.precioIndividual} onChange={(e) => setForm((f) => ({ ...f, precioIndividual: e.target.value }))} /></Campo>
          <Campo label="Rate doble ($) — lo que le pagas"><Input className="w-36" type="number" step="0.01" min="0" value={form.precioDoble} onChange={(e) => setForm((f) => ({ ...f, precioDoble: e.target.value }))} /></Campo>
          <Boton variant="gold" onClick={agregar} disabled={guardandoAlta}>{guardandoAlta ? 'Guardando…' : 'Agregar'}</Boton>
        </div>
      </Card>

      {/* Barra de búsqueda + contador */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Input className="w-64" placeholder="Buscar por nombre o rate (ej. 1.6)…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="text-sm text-slate-500 dark:text-slate-400">Mostrando {filtrados.length} de {drivers.length}</span>
        <Boton variant="ghost" className="ml-auto px-3 py-1.5 text-xs" onClick={exportarChoferes} disabled={filtrados.length === 0}>
          <FileSpreadsheet size={15} strokeWidth={1.8} /> Exportar Excel
        </Boton>
        <Boton variant="ghost" className="px-3 py-1.5 text-xs" onClick={exportarBancarios} disabled={filtrados.length === 0} title="Descargar nombre, cuenta, ruta y banco (todos o seleccionados)">
          <Landmark size={15} strokeWidth={1.8} /> Datos bancarios
        </Boton>
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
            <Boton variant="ghost" onClick={exportarBancarios}><Landmark size={15} strokeWidth={1.8} /> Datos bancarios</Boton>
            <Boton variant="danger" onClick={pedirBorrar}><Trash2 size={15} strokeWidth={1.8} /> Borrar</Boton>
            <Boton variant="ghost" onClick={() => setSeleccion(new Set())}>Limpiar</Boton>
          </div>
        </Card>
      )}

      {/* Tabla */}
      <div className="scroll-thin max-h-[60vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 [&>th]:bg-slate-100 dark:[&>th]:bg-slate-800">
              <th className="px-2 py-2.5"><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>
              <th className="px-3 py-2.5 text-left font-semibold">Chofer</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rate individual</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rate doble</th>
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
                    <div className="flex items-center gap-2">
                      {d.fotoUrl ? (
                        <img src={d.fotoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
                      ) : (
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Truck size={15} strokeWidth={1.8} /></span>
                      )}
                      <div className="min-w-0">
                        <button onClick={() => navigate(`/choferes/${encodeURIComponent(d.nombre)}`)} className="block truncate font-medium text-brand-navy hover:underline dark:text-slate-100">{d.nombre}</button>
                        {ciudadDeDriverNombre[d.nombre] && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700/60 dark:text-slate-300">
                            <MapPin size={9} strokeWidth={2} /> {nombreCiudadCorto(ciudadDeDriverNombre[d.nombre])}
                          </span>
                        )}
                      </div>
                      {guardadoId === d.id && <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400"><Check size={12} strokeWidth={2.4} /> guardado</span>}
                    </div>
                  </td>
                  {modoRuta ? (
                    <>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold">{money(rateDeRuta(d).ind)}</div>
                        <div className="text-[10px] text-slate-400">{rateDeRuta(d).ruta ? `ruta ${rateDeRuta(d).ruta}` : 'sin ruta'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{money(rateDeRuta(d).dob)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" min="0" value={borradores[d.id]?.ind ?? ''} onChange={(e) => setBorrador(d.id, 'ind', e.target.value)} onBlur={() => guardarTarifa(d)}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" min="0" value={borradores[d.id]?.dob ?? ''} onChange={(e) => setBorrador(d.id, 'dob', e.target.value)} onBlur={() => guardarTarifa(d)}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                      </td>
                    </>
                  )}
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
          <Card className={`w-full max-w-md p-5 ${confirm.peligro ? 'border-2 border-rose-400/70' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={`m-0 mb-2 flex items-center gap-2 text-lg font-bold ${confirm.peligro ? 'text-rose-600 dark:text-rose-400' : 'text-brand-navy dark:text-slate-100'}`}>
              {confirm.peligro && <Trash2 size={18} strokeWidth={1.9} />}{confirm.peligro ? 'Eliminar choferes' : 'Confirmar cambio masivo'}
            </h3>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{confirm.texto}</p>
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setConfirm(null)} disabled={ocupado}>Cancelar</Boton>
              <Boton variant={confirm.peligro ? 'danger' : 'gold'} onClick={confirm.accion} disabled={ocupado}>{ocupado ? <><Spinner /> {confirm.peligro ? 'Borrando…' : 'Aplicando…'}</> : (confirm.peligro ? 'Sí, eliminar' : 'Confirmar')}</Boton>
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
              <Campo label="Rate individual ($)"><Input className="w-36" type="number" step="0.01" min="0" value={modalForm.precioIndividual} onChange={(e) => setModalForm((f) => ({ ...f, precioIndividual: e.target.value }))} /></Campo>
              <Campo label="Rate doble ($)"><Input className="w-36" type="number" step="0.01" min="0" value={modalForm.precioDoble} onChange={(e) => setModalForm((f) => ({ ...f, precioDoble: e.target.value }))} /></Campo>
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

            {/* Dar acceso al chofer (usuario rol driver) */}
            <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <KeyRound size={15} strokeWidth={1.8} className="text-brand-gold" /> Dar acceso al chofer
              </div>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Crea un usuario para <b>{modalForm.nombre}</b> que solo verá su portal (sus pagos, entregas, claims y calificación). No verá finanzas ni a otros choferes.
              </p>
              {modal.accesoEmail && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <KeyRound size={13} strokeWidth={1.9} /> Ya tiene acceso: {modal.accesoEmail}. Crear de nuevo generará otra cuenta.
                </div>
              )}
              {accesoMsg && <Aviso tipo={accesoMsg.tipo}>{accesoMsg.txt}</Aviso>}
              <div className="flex flex-wrap items-end gap-2">
                <Campo label="Email del chofer"><Input className="w-52" type="email" value={accesoForm.email} onChange={(e) => setAccesoForm((f) => ({ ...f, email: e.target.value }))} placeholder="chofer@correo.com" /></Campo>
                <Campo label="Contraseña (mín. 6)"><Input className="w-40" value={accesoForm.password} onChange={(e) => setAccesoForm((f) => ({ ...f, password: e.target.value }))} placeholder="la que definas" /></Campo>
                <Boton variant="primary" disabled={creandoAcceso} onClick={crearAccesoDriver}>{creandoAcceso ? <><Spinner /> Creando…</> : <><KeyRound size={15} strokeWidth={1.8} /> Crear acceso</>}</Boton>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Boton variant="danger" onClick={() => pedirBorrarUno(modal)}><Trash2 size={15} strokeWidth={1.8} /> Eliminar chofer</Boton>
              <div className="ml-auto flex gap-2">
                <Boton variant="ghost" onClick={() => setModal(null)}>Cancelar</Boton>
                <Boton variant="gold" onClick={guardarModal} disabled={guardandoModal}>{guardandoModal ? <><Spinner /> Guardando…</> : 'Guardar cambios'}</Boton>
              </div>
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
