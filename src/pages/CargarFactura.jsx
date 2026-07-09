import { useState, useRef, useMemo } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { procesarArchivo, combinarArchivos } from '../utils/excel'
import { buscarDriver, nombreCiudadDe, detectarClaimsRepetidos, contarClaimsValidos, calcularPagos, promediosFlota, calificarChofer, resolverReglas, esDoblePorRegla, metodoDe, categoriaClaim, TODAS } from '../utils/calc'
import { parsearPeriodo } from '../utils/rango'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Upload, FolderOpen, Package, Layers, DollarSign, Truck, AlertTriangle, Save, Copy, Check, X, CheckCircle2, MapPin, Users, ChevronDown } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import Verificacion from '../components/Verificacion'

export default function CargarFactura() {
  const { perfil } = useAuth()
  const { invoices, drivers, selectedInvoiceId, activeCompanyId, empresaActiva, ciudadesEmpresa, ajustes, reloadInvoices, reloadDrivers, setSelectedInvoiceId } = useData()

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
  const [decisiones, setDecisiones] = useState({}) // { waybill: 'aprobado' | 'anulado' }
  const [verExistentes, setVerExistentes] = useState(false)
  const [editExist, setEditExist] = useState({}) // nombre -> { ind, doble }
  const [guardandoExist, setGuardandoExist] = useState(false)
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
    setDecisiones({})
  }

  const nombreMap = useMemo(() => Object.fromEntries(ciudadesExtra.map((c) => [c.codigo, c.nombre])), [ciudadesExtra])

  // Opciones del selector de ciudad: las de ESTA empresa + personalizadas + detectadas.
  const opcionesCiudad = useMemo(() => {
    const map = new Map()
    ;(ciudadesEmpresa || []).forEach((c) => { if (c.codigo) map.set(c.codigo, c.nombre) })
    ciudadesExtra.forEach((c) => map.set(c.codigo, c.nombre))
    procesados.forEach((p) => p.ciudadesDetectadas.forEach((code) => { if (!map.has(code)) map.set(code, nombreCiudad(code)) }))
    return [...map.entries()].map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [ciudadesEmpresa, ciudadesExtra, procesados])

  // Combinado recalculado con la ciudad MANUAL de cada archivo. Además reclasifica
  // "doble" según la regla (dobleMonto) de la CIUDAD de cada archivo (config
  // empresa→ciudad). Con el default (0.5) el resultado es idéntico al actual.
  const combinado = useMemo(() => {
    if (procesados.length === 0) return null
    const overridden = procesados.map((p, i) => {
      const code = ciudadPorArchivo[i] || ''
      const { dobleMonto } = resolverReglas(ajustes, code)
      return {
        ...p,
        detalles: p.detalles.map((d) => ({ ...d, ciudad: code, esDoble: esDoblePorRegla(d.monto, dobleMonto) })),
        claims: p.claims.map((c) => ({ ...c, ciudad: code })),
      }
    })
    return combinarArchivos(overridden, nombreMap)
  }, [procesados, ciudadPorArchivo, nombreMap, ajustes])

  // Casos de claim repetido (mismo Waybill No. más de una vez) que requieren
  // que el dueño apruebe o anule ANTES de guardar la factura.
  const casosRepetidos = useMemo(() => detectarClaimsRepetidos(combinado?.claims || []), [combinado])
  const todosRepetidosResueltos = casosRepetidos.every((c) => decisiones[c.waybill])
  const setDecision = (waybill, decision) => setDecisiones((d) => ({ ...d, [waybill]: decision }))

  // Vista previa del conteo oficial de claims válidos según las decisiones actuales.
  const claimsValidosPreview = useMemo(() => {
    if (!combinado) return 0
    const conDecision = combinado.claims.map((c) => {
      const wb = (c.waybill || '').trim()
      const esRep = casosRepetidos.some((k) => k.waybill === wb)
      return { ...c, estadoRevision: esRep ? decisiones[wb] || 'pendiente' : 'aprobado' }
    })
    return contarClaimsValidos(conDecision)
  }, [combinado, casosRepetidos, decisiones])

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
      if (semanas.length > 1) nuevosAvisos.push(`Los archivos tienen semanas distintas (${semanas.join(', ')}). Se usará "${semanaFinal}". Revisa que correspondan a la misma semana.`)
      if (!semanaFinal) nuevosAvisos.push('No se detectó la semana en el nombre de los archivos. Escríbela manualmente antes de guardar.')

      // choferes únicos (log de diagnóstico) — no dependen de la ciudad
      const couriersUnicos = [...new Set(procs.flatMap((p) => p.detalles.map((d) => d.courier)))]
      // eslint-disable-next-line no-console
      console.log(`[MilePay] Choferes únicos detectados en "Details of Delivery Fees": ${couriersUnicos.length}`, couriersUnicos)
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

  // ---- choferes: reconocidos (tarifa guardada) vs nuevos (sin precio) ----
  const tienePrecio = (d) => d && Number(d.precioIndividual) > 0 && Number(d.precioDoble) > 0
  const nombresFactura = useMemo(() => (combinado ? [...new Set(combinado.resumenChoferes.map((c) => c.nombre))] : []), [combinado])
  // Nuevo = no existe en drivers, o existe pero sin precio (match por nombre normalizado).
  const choferesNuevos = useMemo(() => nombresFactura.filter((n) => !tienePrecio(buscarDriver(drivers, n))).sort(), [nombresFactura, drivers])
  const reconocidos = useMemo(() => nombresFactura.filter((n) => tienePrecio(buscarDriver(drivers, n))).sort(), [nombresFactura, drivers])
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

  // Editar tarifas de choferes ya reconocidos (opcional).
  const valorExist = (n, campo) => {
    const e = editExist[n]
    if (e && e[campo] !== undefined) return e[campo]
    const d = buscarDriver(drivers, n)
    return (campo === 'ind' ? d?.precioIndividual : d?.precioDoble) ?? ''
  }
  const setExist = (n, campo, val) => setEditExist((e) => ({ ...e, [n]: { ...(e[n] || {}), [campo]: val } }))
  const guardarExistentes = async () => {
    setGuardandoExist(true)
    try {
      for (const [n, v] of Object.entries(editExist)) {
        const d = buscarDriver(drivers, n)
        if (!d) continue
        const ni = v.ind !== undefined && Number(v.ind) > 0 ? Number(v.ind) : Number(d.precioIndividual)
        const nd = v.doble !== undefined && Number(v.doble) > 0 ? Number(v.doble) : Number(d.precioDoble)
        if (ni !== Number(d.precioIndividual) || nd !== Number(d.precioDoble)) {
          await updateDoc(doc(db, 'drivers', d.id), { precioIndividual: ni, precioDoble: nd })
        }
      }
      await reloadDrivers()
      setEditExist({})
    } finally {
      setGuardandoExist(false)
    }
  }

  const todasCiudadesAsignadas = ciudadPorArchivo.length > 0 && ciudadPorArchivo.every((c) => !!c)

  const guardar = async () => {
    if (!combinado) return
    if (!activeCompanyId) return setErrores(['No hay una empresa activa seleccionada. Selecciona una empresa antes de guardar.'])
    if (!semana.trim()) return setErrores(['Debes indicar la semana antes de guardar.'])
    if (!todasCiudadesAsignadas) return setErrores(['Asigna una ciudad a cada archivo antes de guardar.'])
    if (choferesNuevos.length > 0 && !todosConPrecio) return setErrores(['Falta asignar precio individual y doble (>0) a todos los choferes nuevos.'])
    if (!todosRepetidosResueltos) return setErrores([`Hay ${casosRepetidos.filter((c) => !decisiones[c.waybill]).length} claim(s) repetido(s) sin resolver. Aprueba o anula cada uno antes de guardar.`])
    setGuardando(true)
    setErrores([])
    try {
      if (choferesNuevos.length > 0) {
        // Un chofer "nuevo" puede ser inexistente (crear) o existente sin precio
        // (actualizar), para no duplicarlo. Match por nombre normalizado.
        const aCrear = choferesNuevos.filter((n) => !buscarDriver(drivers, n))
        const aActualizar = choferesNuevos.filter((n) => buscarDriver(drivers, n))
        const chunk = 450
        for (let i = 0; i < aCrear.length; i += chunk) {
          const batch = writeBatch(db)
          for (const n of aCrear.slice(i, i + chunk)) {
            const dref = doc(collection(db, 'drivers'))
            batch.set(dref, {
              nombre: n,
              precioIndividual: Number(precios[n].ind) || 0,
              precioDoble: Number(precios[n].doble) || 0,
              activo: true,
              companyId: activeCompanyId,
              creadoEn: serverTimestamp(),
            })
          }
          await batch.commit()
        }
        for (const n of aActualizar) {
          const d = buscarDriver(drivers, n)
          await updateDoc(doc(db, 'drivers', d.id), { precioIndividual: Number(precios[n].ind) || 0, precioDoble: Number(precios[n].doble) || 0, activo: true })
        }
        await reloadDrivers()
      }

      const { detalles, claims, ...resumen } = combinado
      const ciudadesMap = Object.fromEntries(combinado.resumenCiudades.map((c) => [c.ubicacion, c.nombreCiudad]))
      const ciudadPrincipal = combinado.ciudades[0] || ''
      const periodo = parsearPeriodo(semana.trim())
      // Reglas de cálculo APLICADAS (claimFee/dobleMonto) por ciudad + default de
      // empresa, guardadas EN la factura para que el histórico sea consistente
      // aunque la config cambie después.
      const reglaEmpresa = resolverReglas(ajustes, '__empresa__')
      const reglasAplicadas = Object.fromEntries((combinado.ciudades || []).map((c) => [c, resolverReglas(ajustes, c)]))
      const invoicePayload = {
        companyId: activeCompanyId,
        semana: semana.trim(),
        archivoNombre: procesados.map((p) => p.archivoNombre).join(', '),
        fechaCarga: serverTimestamp(),
        fechaInicio: periodo.fechaInicio || null,
        fechaFin: periodo.fechaFin || null,
        ciudad: ciudadPrincipal,
        ciudadNombre: ciudadesMap[ciudadPrincipal] || nombreCiudad(ciudadPrincipal),
        ciudadesMap,
        reglaEmpresa,
        reglasAplicadas,
        ...resumen,
      }
      const ref = await addDoc(collection(db, 'invoices'), invoicePayload)
      // Mapa waybill -> detalle de entrega, para enriquecer cada claim con la
      // info del paquete (ruta, peso, rango de peso, monto de entrega).
      const detPorWaybill = {}
      for (const d of detalles) {
        const wb = (d.waybill || '').trim()
        if (wb && !detPorWaybill[wb]) detPorWaybill[wb] = d
      }
      const chunk = 450
      for (let i = 0; i < claims.length; i += chunk) {
        const batch = writeBatch(db)
        for (const c of claims.slice(i, i + chunk)) {
          const cref = doc(collection(db, 'claims'))
          // Los claims repetidos guardan la decisión del dueño; el resto quedan
          // 'aprobado' (cuentan como claim válido normal).
          const wb = (c.waybill || '').trim()
          const esRepetido = casosRepetidos.some((k) => k.waybill === wb)
          const estadoRevision = esRepetido ? decisiones[wb] || 'pendiente' : 'aprobado'
          const det = detPorWaybill[wb] || null
          batch.set(cref, {
            companyId: activeCompanyId,
            invoiceId: ref.id,
            semana: semana.trim(),
            waybill: c.waybill,
            courier: c.courier,
            date: c.date,
            postalCode: c.postalCode,
            claimType: c.claimType,
            categoria: categoriaClaim(c.claimType),
            metodo: metodoDe({ reglaEmpresa, reglasAplicadas }, c.ciudad || '', c),
            montoGofo: c.montoGofo,
            ciudad: c.ciudad || '',
            // Info del paquete (paquete con claim) tomada del detalle de entrega.
            ruta: det?.ruta || '',
            peso: det?.peso ?? null,
            rangoPeso: det?.rango || '',
            montoEntrega: det?.monto ?? null,
            estadoRevision,
            esRepetido,
            revisadoPor: esRepetido ? perfil?.nombre || perfil?.email || '' : '',
            revisadoEn: null,
            perdonado: false,
            motivo: '',
            perdonadoPor: '',
            perdonadoEn: null,
          })
        }
        await batch.commit()
      }

      // Resumen por chofer y semana (driverStats), para el PORTAL DEL CHOFER.
      // Se calcula con las tarifas finales y la calificación vs. la flota, y cada
      // chofer solo podrá leer su propia fila (reglas de Firestore por driverKey).
      const preciosNuevos = {}
      choferesNuevos.forEach((n) => { preciosNuevos[n.trim().toLowerCase()] = { ind: Number(precios[n]?.ind) || 0, dob: Number(precios[n]?.doble) || 0 } })
      const driversFinal = drivers.map((d) => {
        let ind = Number(d.precioIndividual) || 0
        let dob = Number(d.precioDoble) || 0
        const e = editExist[d.nombre]
        if (e) { if (e.ind !== undefined && Number(e.ind) > 0) ind = Number(e.ind); if (e.doble !== undefined && Number(e.doble) > 0) dob = Number(e.doble) }
        const pn = preciosNuevos[(d.nombre || '').trim().toLowerCase()]
        if (pn) { ind = pn.ind; dob = pn.dob }
        return { ...d, precioIndividual: ind, precioDoble: dob }
      })
      choferesNuevos.filter((n) => !buscarDriver(drivers, n)).forEach((n) => {
        driversFinal.push({ id: `nuevo_${n}`, nombre: n, precioIndividual: Number(precios[n]?.ind) || 0, precioDoble: Number(precios[n]?.doble) || 0, activo: true })
      })
      const claimsConDecision = combinado.claims.map((c) => {
        const wb = (c.waybill || '').trim()
        const esRep = casosRepetidos.some((k) => k.waybill === wb)
        return { ...c, estadoRevision: esRep ? decisiones[wb] || 'pendiente' : 'aprobado', perdonado: false }
      })
      const pagosFinal = calcularPagos({ ...combinado, reglaEmpresa, reglasAplicadas }, claimsConDecision, driversFinal, TODAS)
      const prom = promediosFlota(pagosFinal)
      const fechaInicioISO = periodo.fechaInicio ? periodo.fechaInicio.toISOString() : ''
      for (let i = 0; i < pagosFinal.length; i += chunk) {
        const batch = writeBatch(db)
        for (const p of pagosFinal.slice(i, i + chunk)) {
          const key = (p.nombre || '').trim().toLowerCase()
          const calif = calificarChofer({ ...p, paquetes: p.individuales + p.dobles }, prom)
          const sref = doc(db, 'driverStats', `${ref.id}__${key.replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`)
          batch.set(sref, {
            companyId: activeCompanyId,
            invoiceId: ref.id,
            semana: semana.trim(),
            fechaInicioISO,
            driverNombre: p.nombre,
            driverKey: key,
            ciudad: p.ciudad || '',
            individuales: p.individuales,
            dobles: p.dobles,
            paquetes: p.individuales + p.dobles,
            ingreso: p.ingreso,
            tarifaInd: p.tarifaInd,
            tarifaDoble: p.tarifaDoble,
            claimsTotales: p.claimsTotales,
            claimsActivos: p.claimsActivos,
            claimsPerdonados: p.claimsPerdonados,
            descuentoClaims: p.descuentoClaims,
            descontadoGofo: p.descontadoGofo,
            totalPagar: p.totalPagar,
            ganancia: p.ganancia,
            calificacion: { puntaje: calif.puntaje, estrellas: calif.estrellas, nivel: calif.nivel, etiqueta: calif.etiqueta, desglose: calif.desglose },
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

  const puedeGuardar = !guardando && !!semana.trim() && todasCiudadesAsignadas && (choferesNuevos.length === 0 || todosConPrecio) && todosRepetidosResueltos

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
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Cargar Factura</PageTitle>

      {!activeCompanyId && (
        <Aviso tipo="warn">No hay una empresa activa. Ve a <b>Empresas</b> (o pide a tu administrador que te asigne una) antes de cargar facturas.</Aviso>
      )}

      {activeCompanyId && ciudadesEmpresa.length === 0 && (
        <Aviso tipo="warn">
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} strokeWidth={1.8} /> Aún no configuraste las ciudades de tu empresa. Agrégalas en <b>Configuración → Mis ciudades</b> (o al asignar la ciudad de cada archivo, abajo).</span>
        </Aviso>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivos(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'
        }`}
      >
        <Upload size={40} strokeWidth={1.5} className="mx-auto text-brand-gold" />
        <div className="mt-2 font-bold text-brand-navy dark:text-slate-100">Arrastra uno o varios .xlsx (uno por ciudad)</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">o usa el botón para seleccionar desde tu dispositivo</div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white"
        >
          <FolderOpen size={18} strokeWidth={1.8} /> Seleccionar archivo
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => manejarArchivos(e.target.files)} />
      </div>

      {procesando && (
        <Aviso tipo="info">
          <span className="inline-flex items-center gap-2"><Spinner className="text-brand-gold" /> Procesando archivo(s)…</span>
        </Aviso>
      )}
      {errores.map((e, i) => <Aviso key={i} tipo="error">{e}</Aviso>)}
      {avisos.map((a, i) => <Aviso key={i} tipo="warn">{a}</Aviso>)}
      {guardado && <Aviso tipo="ok"><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} strokeWidth={1.8} /> Factura guardada correctamente en la base de datos.</span></Aviso>}

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

          {casosRepetidos.length > 0 && (
            <Card className="mb-4 border-2 border-amber-400/70 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Copy size={18} strokeWidth={1.8} className="text-amber-500" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Claims repetidos — requieren tu aprobación</h3>
                <Badge color={todosRepetidosResueltos ? 'green' : 'gold'}>
                  {casosRepetidos.filter((c) => decisiones[c.waybill]).length}/{casosRepetidos.length} resueltos
                </Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Estos trackings aparecen más de una vez en “Claims Detail” (normalmente un claim y su reversión).
                Decide manualmente si cada uno se <b>aprueba</b> (cuenta como claim y se le cobran $100 al chofer) o se
                <b> anula</b> (no cuenta, no se cobra). El monto que Gofo descuenta del neto no cambia.
              </p>
              <div className="space-y-3">
                {casosRepetidos.map((caso) => {
                  const d = decisiones[caso.waybill]
                  return (
                    <div key={caso.waybill} className={`rounded-xl border p-3 ${d === 'aprobado' ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/50 dark:bg-emerald-500/5' : d === 'anulado' ? 'border-rose-300 bg-rose-50/60 dark:border-rose-700/50 dark:bg-rose-500/5' : 'border-slate-200 dark:border-slate-700/60'}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-brand-navy dark:text-slate-100">{caso.waybill}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">· {caso.courier}</span>
                        <div className="ml-auto flex gap-2">
                          <Boton variant={d === 'aprobado' ? 'success' : 'ghost'} onClick={() => setDecision(caso.waybill, 'aprobado')} className="px-3 py-1.5 text-xs">
                            <Check size={14} strokeWidth={2} /> Aprobar
                          </Boton>
                          <Boton variant={d === 'anulado' ? 'danger' : 'ghost'} onClick={() => setDecision(caso.waybill, 'anulado')} className="px-3 py-1.5 text-xs">
                            <X size={14} strokeWidth={2} /> Anular
                          </Boton>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caso.claims.map((c, i) => (
                          <span key={i} className={`rounded-lg px-2 py-1 text-xs font-medium ${Number(c.montoGofo) < 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
                            {money(c.montoGofo)} · {c.claimType || 'sin tipo'}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">Este claim parece anulado por una reversión. Tú decides si cuenta.</p>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <div className="mb-4 flex flex-wrap gap-3">
            <KPI label="Paquetes" value={num(combinado.totalPaquetes)} icon={Package} accent="navy" />
            <KPI label="Individuales" value={num(combinado.totalIndividuales)} icon={Layers} accent="blue" />
            <KPI label="Dobles" value={num(combinado.totalDobles)} accent="gold" />
            <KPI label="Ingreso total" value={money(combinado.ingresoTotal)} icon={DollarSign} accent="green" />
            <KPI label="Choferes" value={num(combinado.numChoferes)} icon={Truck} accent="slate" />
            <KPI label="Rutas" value={num(combinado.numRutas)} accent="slate" />
            <KPI label="Claims válidos" value={num(claimsValidosPreview)} icon={AlertTriangle} accent="red" sub={casosRepetidos.length > 0 ? `${combinado.totalClaims} filas · ${casosRepetidos.length} repetido(s)` : `${combinado.totalClaims} filas`} />
          </div>

          {/* Resumen: reconocidos (tarifa guardada) vs nuevos */}
          <Aviso tipo={choferesNuevos.length === 0 ? 'ok' : 'info'}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Users size={15} strokeWidth={1.8} />
              <b>{reconocidos.length}</b> chofer(es) reconocidos con su tarifa guardada · <b>{choferesNuevos.length}</b> nuevo(s)
              {choferesNuevos.length === 0 ? '. Se procesa directo con las tarifas guardadas.' : ' que requieren precio.'}
            </span>
          </Aviso>

          {/* Ver/editar choferes existentes (opcional) */}
          {reconocidos.length > 0 && (
            <Card className="mb-4 p-4">
              <button onClick={() => setVerExistentes((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-brand-navy dark:text-slate-100">
                <ChevronDown size={16} strokeWidth={2} className={`transition ${verExistentes ? 'rotate-180' : ''}`} /> Ver/editar choferes existentes ({reconocidos.length})
              </button>
              {verExistentes && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Opcional: cambia una tarifa antes de procesar. Si no tocas nada, se usan las tarifas guardadas.</p>
                  <div className="scroll-thin max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0"><tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <th className="px-3 py-2 text-left font-semibold">Chofer</th>
                        <th className="px-3 py-2 text-right font-semibold">Precio individual</th>
                        <th className="px-3 py-2 text-right font-semibold">Precio doble</th>
                      </tr></thead>
                      <tbody>
                        {reconocidos.map((n, i) => (
                          <tr key={n} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                            <td className="px-3 py-1.5">{n}</td>
                            <td className="px-3 py-1.5 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valorExist(n, 'ind')} onChange={(e) => setExist(n, 'ind', e.target.value)} /></td>
                            <td className="px-3 py-1.5 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valorExist(n, 'doble')} onChange={(e) => setExist(n, 'doble', e.target.value)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <Boton variant="gold" disabled={guardandoExist || Object.keys(editExist).length === 0} onClick={guardarExistentes}>
                      {guardandoExist ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> Guardar cambios de tarifas</>}
                    </Boton>
                  </div>
                </div>
              )}
            </Card>
          )}

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
                <Input className="w-56" placeholder="Buscar chofer…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
                          <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5">{ok ? <Check size={14} strokeWidth={2.2} className="text-emerald-500" /> : <span className="text-slate-300">•</span>}{n}</span></td>
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
                { key: 'ingreso', label: 'Ingreso (bruto)', align: 'right' },
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
                {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> {choferesNuevos.length > 0 ? 'Guardar tarifas y procesar' : 'Guardar en base de datos'}</>}
              </Boton>
              <Boton onClick={reset} variant="ghost">Descartar</Boton>
            </div>
          </Card>
        </>
      )}

      <p className="mt-4 text-xs text-slate-400">El historial de facturas y su eliminación están en la sección <b>Facturas</b>.</p>
    </div>
  )
}
