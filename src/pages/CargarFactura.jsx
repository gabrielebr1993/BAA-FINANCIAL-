import { useState, useRef, useMemo } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { procesarArchivo, combinarArchivos } from '../utils/excel'
import { buscarDriver, nombreCiudadDe } from '../utils/calc'
import { CIUDADES, nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import Verificacion from '../components/Verificacion'

export default function CargarFactura() {
  const { perfil } = useAuth()
  const { invoices, drivers, selectedInvoiceId, reloadInvoices, reloadDrivers, reloadClaims, setSelectedInvoiceId } = useData()

  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [procesados, setProcesados] = useState([]) // resultados crudos por archivo
  const [ciudadPorArchivo, setCiudadPorArchivo] = useState([]) // código de ciudad manual por archivo
  const [ciudadesExtra, setCiudadesExtra] = useState([]) // [{codigo, nombre}] añadidas por el usuario
  const [semana, setSemana] = useState('')
  const [avisos, setAvisos] = useState([])
  const [errores, setErrores] = useState([])
  const [guardado, setGuardado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [precios, setPrecios] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [bulk, setBulk] = useState({ ind: '', doble: '' })
  const [nuevaCiudad, setNuevaCiudad] = useState({ codigo: '', nombre: '' })
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const inputRef = useRef(null)

  const reset = () => {
    setProcesados([])
    setCiudadPorArchivo([])
    setSemana('')
    setAvisos([])
    setErrores([])
    setGuardado(false)
    setPrecios({})
    setBusqueda('')
    setBulk({ ind: '', doble: '' })
  }

  const nombreMap = useMemo(() => Object.fromEntries(ciudadesExtra.map((c) => [c.codigo, c.nombre])), [ciudadesExtra])

  // Opciones del selector de ciudad: estándar + personalizadas + detectadas.
  const opcionesCiudad = useMemo(() => {
    const map = new Map()
    Object.entries(CIUDADES).forEach(([codigo, nombre]) => map.set(codigo, nombre))
    ciudadesExtra.forEach((c) => map.set(c.codigo, c.nombre))
    procesados.forEach((p) => p.ciudadesDetectadas.forEach((code) => { if (!map.has(code)) map.set(code, nombreCiudad(code)) }))
    return [...map.entries()].map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [ciudadesExtra, procesados])

  // Combinado recalculado con la ciudad MANUAL de cada archivo.
  const combinado = useMemo(() => {
    if (procesados.length === 0) return null
    const overridden = procesados.map((p, i) => {
      const code = ciudadPorArchivo[i] || ''
      return {
        ...p,
        detalles: p.detalles.map((d) => ({ ...d, ciudad: code })),
        claims: p.claims.map((c) => ({ ...c, ciudad: code })),
      }
    })
    return combinarArchivos(overridden, nombreMap)
  }, [procesados, ciudadPorArchivo, nombreMap])

  const manejarArchivos = async (fileList) => {
    const files = Array.from(fileList).filter((f) => /\.xlsx?$/i.test(f.name))
    if (files.length === 0) return setErrores(['No se detectaron archivos .xlsx.'])
    reset()
    setProcesando(true)
    const nuevosAvisos = []
    const nuevosErrores = []
    try {
      const procs = []
      for (const f of files) {
        const buf = await f.arrayBuffer()
        const p = procesarArchivo(buf, f.name)
        if (p.errores.length) p.errores.forEach((e) => nuevosErrores.push(`${f.name}: ${e}`))
        procs.push(p)
      }
      const semanas = [...new Set(procs.map((p) => p.semana).filter(Boolean))]
      let semanaFinal = semanas[0] || ''
      if (semanas.length > 1) nuevosAvisos.push(`⚠️ Los archivos tienen semanas distintas (${semanas.join(', ')}). Se usará "${semanaFinal}". Revisa que correspondan a la misma semana.`)
      if (!semanaFinal) nuevosAvisos.push('No se detectó la semana en el nombre de los archivos. Escríbela manualmente antes de guardar.')

      // choferes únicos (log de diagnóstico) — no dependen de la ciudad
      const couriersUnicos = [...new Set(procs.flatMap((p) => p.detalles.map((d) => d.courier)))]
      // eslint-disable-next-line no-console
      console.log(`[Gofo] Choferes únicos detectados en "Details of Delivery Fees": ${couriersUnicos.length}`, couriersUnicos)
      const nuevos = couriersUnicos.filter((n) => !buscarDriver(drivers, n))
      const p0 = {}
      nuevos.forEach((n) => (p0[n] = { ind: '', doble: '' }))
      setPrecios(p0)

      setProcesados(procs)
      setCiudadPorArchivo(procs.map((p) => p.ciudadesDetectadas[0] || '')) // sugerencia por defecto
      setSemana(semanaFinal)
      setAvisos(nuevosAvisos)
      setErrores(nuevosErrores)
    } catch (e) {
      setErrores([e.message])
    } finally {
      setProcesando(false)
    }
  }

  const setCiudad = (i, code) => setCiudadPorArchivo((arr) => arr.map((c, j) => (j === i ? code : c)))

  const agregarCiudad = () => {
    const codigo = nuevaCiudad.codigo.trim().toUpperCase()
    const nombre = nuevaCiudad.nombre.trim()
    if (!codigo || !nombre) return
    setCiudadesExtra((arr) => (arr.some((c) => c.codigo === codigo) ? arr : [...arr, { codigo, nombre }]))
    setNuevaCiudad({ codigo: '', nombre: '' })
  }

  // ---- choferes nuevos / precios ----
  const choferesNuevos = useMemo(
    () => (combinado ? [...new Set(combinado.resumenChoferes.map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n)).sort() : []),
    [combinado, drivers]
  )
  const setPrecio = (courier, campo, valor) => setPrecios((p) => ({ ...p, [courier]: { ...(p[courier] || { ind: '', doble: '' }), [campo]: valor } }))
  const aplicarBulk = () => {
    setPrecios((p) => {
      const np = { ...p }
      choferesNuevos.forEach((n) => {
        np[n] = {
          ind: np[n]?.ind && Number(np[n].ind) > 0 ? np[n].ind : bulk.ind,
          doble: np[n]?.doble && Number(np[n].doble) > 0 ? np[n].doble : bulk.doble,
        }
      })
      return np
    })
  }
  const todosConPrecio = choferesNuevos.every((n) => Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0)
  const nuevosFiltrados = choferesNuevos.filter((n) => n.toLowerCase().includes(busqueda.trim().toLowerCase()))
  const nConPrecio = choferesNuevos.filter((n) => Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0).length

  const todasCiudadesAsignadas = ciudadPorArchivo.length > 0 && ciudadPorArchivo.every((c) => !!c)

  const guardar = async () => {
    if (!combinado) return
    if (!semana.trim()) return setErrores(['Debes indicar la semana antes de guardar.'])
    if (!todasCiudadesAsignadas) return setErrores(['Asigna una ciudad a cada archivo antes de guardar.'])
    if (choferesNuevos.length > 0 && !todosConPrecio) return setErrores(['Falta asignar precio individual y doble (>0) a todos los choferes nuevos.'])
    setGuardando(true)
    setErrores([])
    try {
      if (choferesNuevos.length > 0) {
        const chunk = 450
        for (let i = 0; i < choferesNuevos.length; i += chunk) {
          const batch = writeBatch(db)
          for (const n of choferesNuevos.slice(i, i + chunk)) {
            const dref = doc(collection(db, 'drivers'))
            batch.set(dref, {
              nombre: n,
              precioIndividual: Number(precios[n].ind) || 0,
              precioDoble: Number(precios[n].doble) || 0,
              activo: true,
              companyId: perfil?.companyId || 'default',
              creadoEn: serverTimestamp(),
            })
          }
          await batch.commit()
        }
        await reloadDrivers()
      }

      const { detalles, claims, ...resumen } = combinado
      const ciudadesMap = Object.fromEntries(combinado.resumenCiudades.map((c) => [c.ubicacion, c.nombreCiudad]))
      const ciudadPrincipal = combinado.ciudades[0] || ''
      const invoicePayload = {
        semana: semana.trim(),
        archivoNombre: procesados.map((p) => p.archivoNombre).join(', '),
        fechaCarga: serverTimestamp(),
        ciudad: ciudadPrincipal,
        ciudadNombre: ciudadesMap[ciudadPrincipal] || nombreCiudad(ciudadPrincipal),
        ciudadesMap,
        ...resumen,
      }
      const ref = await addDoc(collection(db, 'invoices'), invoicePayload)
      const chunk = 450
      for (let i = 0; i < claims.length; i += chunk) {
        const batch = writeBatch(db)
        for (const c of claims.slice(i, i + chunk)) {
          const cref = doc(collection(db, 'claims'))
          batch.set(cref, {
            invoiceId: ref.id,
            semana: semana.trim(),
            waybill: c.waybill,
            courier: c.courier,
            date: c.date,
            postalCode: c.postalCode,
            claimType: c.claimType,
            montoGofo: c.montoGofo,
            ciudad: c.ciudad || '',
            perdonado: false,
            motivo: '',
            perdonadoPor: '',
            perdonadoEn: null,
          })
        }
        await batch.commit()
      }
      await reloadInvoices()
      setSelectedInvoiceId(ref.id)
      setGuardado(true)
      reset()
    } catch (e) {
      setErrores(['Error al guardar: ' + e.message])
    } finally {
      setGuardando(false)
    }
  }

  // ---- eliminar factura (cascada) ----
  const eliminarFactura = async () => {
    if (!porEliminar) return
    setEliminando(true)
    try {
      const cs = await getDocs(query(collection(db, 'claims'), where('invoiceId', '==', porEliminar.id)))
      const ps = await getDocs(query(collection(db, 'payroll'), where('invoiceId', '==', porEliminar.id)))
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
      setErrores(['Error al eliminar: ' + e.message])
    } finally {
      setEliminando(false)
    }
  }

  const puedeGuardar = !guardando && !!semana.trim() && todasCiudadesAsignadas && (choferesNuevos.length === 0 || todosConPrecio)

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
      <PageTitle>Cargar Factura</PageTitle>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivos(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'
        }`}
      >
        <div className="text-4xl">⬆️</div>
        <div className="mt-2 font-bold text-brand-navy dark:text-slate-100">Arrastra uno o varios .xlsx (uno por ciudad)</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">o haz clic para seleccionar archivos</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => manejarArchivos(e.target.files)} />
      </div>

      {procesando && (
        <Aviso tipo="info">
          <span className="inline-flex items-center gap-2"><Spinner className="text-sky-600" /> Procesando archivo(s)…</span>
        </Aviso>
      )}
      {errores.map((e, i) => <Aviso key={i} tipo="error">{e}</Aviso>)}
      {avisos.map((a, i) => <Aviso key={i} tipo="warn">{a}</Aviso>)}
      {guardado && <Aviso tipo="ok">✅ Factura guardada correctamente en la base de datos.</Aviso>}

      {combinado && (
        <>
          {/* Asignación MANUAL de ciudad por archivo */}
          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Asigna la ciudad de cada archivo</h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Elige (o confirma) la ciudad de cada archivo. Es obligatorio y es la ciudad que se guardará (no la auto-detectada).
            </p>
            <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-3 py-2 text-left font-semibold">Archivo</th>
                    <th className="px-3 py-2 text-left font-semibold">Semana</th>
                    <th className="px-3 py-2 text-left font-semibold">Detectada</th>
                    <th className="px-3 py-2 text-left font-semibold">Ciudad (manual) *</th>
                  </tr>
                </thead>
                <tbody>
                  {procesados.map((p, i) => (
                    <tr key={p.archivoNombre + i} className="border-t border-slate-100 dark:border-slate-700/50">
                      <td className="px-3 py-2">{p.archivoNombre}</td>
                      <td className="px-3 py-2">{p.semana || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.ciudadesDetectadas.map(nombreCiudad).join(', ') || '—'}</td>
                      <td className="px-3 py-2">
                        <Select value={ciudadPorArchivo[i] || ''} onChange={(e) => setCiudad(i, e.target.value)} className={!ciudadPorArchivo[i] ? 'border-rose-400' : ''}>
                          <option value="">— Elegir ciudad —</option>
                          {opcionesCiudad.map((c) => (
                            <option key={c.codigo} value={c.codigo}>{c.nombre} ({c.codigo})</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Agregar ciudad — código</div>
                <Input className="w-32" placeholder="Ej. PHX01" value={nuevaCiudad.codigo} onChange={(e) => setNuevaCiudad((c) => ({ ...c, codigo: e.target.value }))} />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">nombre</div>
                <Input className="w-40" placeholder="Ej. Phoenix" value={nuevaCiudad.nombre} onChange={(e) => setNuevaCiudad((c) => ({ ...c, nombre: e.target.value }))} />
              </div>
              <Boton variant="ghost" onClick={agregarCiudad}>+ Agregar ciudad</Boton>
              {!todasCiudadesAsignadas && <span className="text-xs text-amber-600 dark:text-amber-400">Falta asignar ciudad a algún archivo.</span>}
            </div>
          </Card>

          <Verificacion v={combinado.verificacion} />

          <div className="mb-4 flex flex-wrap gap-3">
            <KPI label="Paquetes" value={num(combinado.totalPaquetes)} icon="📦" accent="navy" />
            <KPI label="Individuales" value={num(combinado.totalIndividuales)} accent="blue" />
            <KPI label="Dobles" value={num(combinado.totalDobles)} accent="gold" />
            <KPI label="Ingreso total" value={money(combinado.ingresoTotal)} icon="💵" accent="green" />
            <KPI label="Choferes" value={num(combinado.numChoferes)} icon="🚚" accent="slate" />
            <KPI label="Rutas" value={num(combinado.numRutas)} accent="slate" />
            <KPI label="Claims" value={num(combinado.totalClaims)} icon="⚠️" accent="red" />
          </div>

          {choferesNuevos.length > 0 && (
            <Card className="mb-4 border-2 border-brand-gold/60 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes nuevos — asigna sus tarifas</h3>
                <Badge color="gold">{choferesNuevos.length} nuevos</Badge>
                <Badge color={nConPrecio === choferesNuevos.length ? 'green' : 'slate'}>{nConPrecio}/{choferesNuevos.length} con precio</Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Cada chofer tiene su propia tarifa. Asigna precio individual y doble (&gt; 0) a todos antes de guardar.
              </p>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <Input className="w-56" placeholder="🔎 Buscar chofer…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                <div className="ml-auto flex items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Rellenar: individual</div>
                    <Input className="w-24" type="number" step="0.01" value={bulk.ind} onChange={(e) => setBulk((b) => ({ ...b, ind: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">doble</div>
                    <Input className="w-24" type="number" step="0.01" value={bulk.doble} onChange={(e) => setBulk((b) => ({ ...b, doble: e.target.value }))} />
                  </div>
                  <Boton variant="ghost" onClick={aplicarBulk}>Aplicar a vacíos</Boton>
                </div>
              </div>
              <div className="scroll-thin max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Chofer</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio individual</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio doble</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nuevosFiltrados.map((n, i) => {
                      const ok = Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0
                      return (
                        <tr key={n} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                          <td className="px-3 py-1.5">{ok ? '✅ ' : '• '}{n}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Input className="w-28 text-right" type="number" step="0.01" min="0" value={precios[n]?.ind ?? ''} onChange={(e) => setPrecio(n, 'ind', e.target.value)} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input className="w-28 text-right" type="number" step="0.01" min="0" value={precios[n]?.doble ?? ''} onChange={(e) => setPrecio(n, 'doble', e.target.value)} />
                          </td>
                        </tr>
                      )
                    })}
                    {nuevosFiltrados.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">Sin choferes que coincidan.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Resumen por ciudad</h3>
            <Tabla
              columns={[
                { key: 'nombreCiudad', label: 'Ciudad' },
                { key: 'paquetes', label: 'Paquetes', align: 'right' },
                { key: 'individuales', label: 'Ind.', align: 'right' },
                { key: 'dobles', label: 'Dobles', align: 'right' },
                { key: 'ingreso', label: 'Ingreso', align: 'right' },
                { key: 'numChoferes', label: 'Choferes', align: 'right' },
                { key: 'numRutas', label: 'Rutas', align: 'right' },
                { key: 'numClaims', label: 'Claims', align: 'right' },
              ]}
              rows={combinado.resumenCiudades.map((c) => ({ ...c, _key: c.ubicacion }))}
              renderCell={(row, key) => (key === 'ingreso' ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
            />
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-500 dark:text-slate-400">Semana:</label>
              <Input className="min-w-[240px]" value={semana} onChange={(e) => setSemana(e.target.value)} placeholder="ej. 22_06_2026-28_06_2026" />
              <Boton onClick={guardar} disabled={!puedeGuardar} variant="gold" className="ml-auto">
                {guardando ? <><Spinner /> Guardando…</> : choferesNuevos.length > 0 ? '💾 Guardar tarifas y procesar' : '💾 Guardar en base de datos'}
              </Boton>
              <Boton onClick={reset} variant="ghost">Descartar</Boton>
            </div>
          </Card>
        </>
      )}

      {/* Listado de facturas cargadas + eliminar */}
      <Card className="mt-6 p-4">
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
          emptyText="No hay facturas cargadas."
          renderCell={(row, key) => {
            if (key === 'ingresoTotal') return money(row.ingresoTotal)
            if (key === 'fechaCarga') return fmtFecha(row.fechaCarga)
            if (key === 'ciudades')
              return (row.resumenCiudades || []).map((c) => nombreCiudadDe(row, c.ubicacion)).join(', ') || row.ciudadNombre || '—'
            if (key === 'archivoNombre') return <span className="text-xs text-slate-500 dark:text-slate-400">{row.archivoNombre}</span>
            if (key === 'acciones')
              return <Boton variant="danger" onClick={() => setPorEliminar(row)} className="px-3 py-1 text-xs">Eliminar</Boton>
            return row[key]
          }}
        />
      </Card>

      {/* Modal de confirmación de borrado */}
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
              <Boton variant="danger" onClick={eliminarFactura} disabled={eliminando}>
                {eliminando ? <><Spinner /> Eliminando…</> : 'Sí, eliminar'}
              </Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
