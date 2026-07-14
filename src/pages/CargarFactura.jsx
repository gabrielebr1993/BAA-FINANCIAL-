import { useState, useRef, useMemo } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { procesarArchivo, combinarArchivos, procesarReporteFallidos, procesarArchivoPrecios } from '../utils/excel'
import { buscarDriver, nombreCiudadDe, detectarClaimsRepetidos, contarClaimsValidos, calcularPagos, promediosFlota, calificarChofer, resolverReglas, esDobleDetalle, metodoDe, categoriaClaim, TODAS } from '../utils/calc'
import { asociarFallidos, normNombre, tokensNombre, resolverNombre } from '../utils/fallidos'
import { guardarCiudadesEmpresa } from '../utils/empresaSettings'
import { parsearPeriodo } from '../utils/rango'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Upload, FolderOpen, Package, Layers, DollarSign, Truck, AlertTriangle, Save, Copy, Check, X, CheckCircle2, MapPin, Users, ChevronDown, Route as RouteIcon, PackageX, FileWarning, FileSpreadsheet } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Select, Spinner } from '../components/ui'
import Combobox from '../components/Combobox'
import Verificacion from '../components/Verificacion'

export default function CargarFactura() {
  const { perfil } = useAuth()
  const { invoices, drivers, selectedInvoiceId, activeCompanyId, empresaActiva, ciudadesEmpresa, ajustes, reloadInvoices, reloadDrivers, reloadAjustes, setSelectedInvoiceId } = useData()

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
  const [asignacionRuta, setAsignacionRuta] = useState({}) // { driverNombre: rutaCode } (modo 'ruta')
  const [verExistentes, setVerExistentes] = useState(false)
  const [filtroExist, setFiltroExist] = useState('') // filtro por nombre o rate en existentes
  const [editExist, setEditExist] = useState({}) // nombre -> { ind, doble }
  const [guardandoExist, setGuardandoExist] = useState(false)
  const [fallidosProc, setFallidosProc] = useState(null) // { porNombre, totalFailed, archivoNombre }
  const [procesandoFallidos, setProcesandoFallidos] = useState(false)
  const [preciosResumen, setPreciosResumen] = useState(null) // { archivoNombre, total }
  const [procesandoPrecios, setProcesandoPrecios] = useState(false)
  const [dragPrecios, setDragPrecios] = useState(false) // arrastrar el archivo de rates
  const [ratesList, setRatesList] = useState([]) // lista maestra de choferes desde el archivo de rates
  const [mapaManual, setMapaManual] = useState({}) // { rawNombre: canonicalName | '__nuevo__' }
  const [verUniones, setVerUniones] = useState(false)
  const inputRef = useRef(null)
  const inputFallidosRef = useRef(null)
  const inputPreciosRef = useRef(null)

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
    setAsignacionRuta({})
    setEditExist({})
    setMapaManual({})
    // NO se limpia ratesList/preciosResumen aquí: la lista maestra de choferes se
    // conserva aunque cambies el archivo de factura. Se limpia al Descartar/guardar.
  }

  // Procesa el REPORTE DE FALLIDOS (segundo archivo). Solo extrae los "Failed
  // delivery" por chofer; ignora el resto del archivo. No toca la factura.
  const manejarFallidos = async (fileList) => {
    const f = Array.from(fileList).find((x) => /\.xlsx?$/i.test(x.name))
    if (!f) return setErrores((e) => [...e, 'El reporte de fallidos debe ser un .xlsx.'])
    setProcesandoFallidos(true)
    try {
      const buf = await f.arrayBuffer()
      const rep = procesarReporteFallidos(buf, f.name)
      setFallidosProc(rep)
      if (rep.errores?.length) setErrores((e) => [...e, ...rep.errores.map((m) => `${f.name}: ${m}`)])
    } catch (e) {
      setErrores((prev) => [...prev, e.message])
    } finally {
      setProcesandoFallidos(false)
    }
  }

  // Nombre por código: tu configuración manda (así la factura y el filtro guardan el
  // nombre que elegiste); las ciudades extra añadidas aquí lo pueden sobrescribir.
  const nombreMap = useMemo(() => ({
    ...Object.fromEntries((ciudadesEmpresa || []).filter((c) => c.codigo).map((c) => [c.codigo, c.nombre])),
    ...Object.fromEntries(ciudadesExtra.map((c) => [c.codigo, c.nombre])),
  }), [ciudadesEmpresa, ciudadesExtra])

  // ---- unificación de nombres de chofer (variantes de Gofo → chofer real) ----
  // Lista CANÓNICA de choferes: los que ya existen (con sus alias guardados) + los
  // del archivo de rates (lista maestra de 99). Cada nombre crudo de la factura se
  // resuelve a uno de estos; lo que no se resuelve con seguridad va a "sin asociar".
  const canonicos = useMemo(() => {
    const out = []
    const vistos = new Set()
    for (const d of drivers) {
      const norm = normNombre(d.nombre)
      if (!norm || vistos.has(norm)) continue
      vistos.add(norm)
      out.push({ nombre: d.nombre, norm, toks: tokensNombre(d.nombre), aliasNorm: (d.alias || []).map(normNombre) })
    }
    for (const p of ratesList) {
      const norm = normNombre(p.nombre)
      if (!norm || vistos.has(norm)) continue
      vistos.add(norm)
      out.push({ nombre: p.nombre, norm, toks: tokensNombre(p.nombre), aliasNorm: [] })
    }
    return out
  }, [drivers, ratesList])

  // Nombres crudos de "Courier" presentes en los archivos.
  const rawCouriers = useMemo(
    () => (procesados.length ? [...new Set(procesados.flatMap((p) => p.detalles.map((d) => d.courier)))].filter(Boolean).sort() : []),
    [procesados]
  )

  // Resolución: raw → canónico. mapaManual manda; luego el match automático; si no,
  // se deja el nombre crudo (chofer nuevo) y se lista en "sin asociar".
  const unif = useMemo(() => {
    const map = {}
    const auto = {} // raw -> canónico (solo los unidos automáticamente, para mostrarlos)
    const sinAsociar = []
    for (const raw of rawCouriers) {
      const man = mapaManual[raw]
      if (man && man !== '__nuevo__') { map[raw] = man; continue }
      if (man === '__nuevo__') { map[raw] = raw; continue }
      const r = resolverNombre(raw, canonicos)
      if (r) { map[raw] = r.nombre; if (normNombre(r.nombre) !== normNombre(raw)) auto[raw] = r.nombre } else { map[raw] = raw; sinAsociar.push(raw) }
    }
    const unidas = rawCouriers.filter((raw) => normNombre(map[raw]) !== normNombre(raw)).length
    const totalReal = new Set(rawCouriers.map((raw) => normNombre(map[raw]))).size
    return { map, auto, sinAsociar, unidas, totalReal }
  }, [rawCouriers, canonicos, mapaManual])
  const asignarManual = (raw, valor) => setMapaManual((m) => ({ ...m, [raw]: valor }))
  // Opciones del combobox de choferes (nuevo + toda la lista canónica).
  const opcionesChofer = useMemo(
    () => [{ value: '__nuevo__', label: '➕ Es un chofer NUEVO (no unir)' }, ...canonicos.map((c) => ({ value: c.nombre, label: c.nombre }))],
    [canonicos]
  )

  // Mapea un código DETECTADO al código CONFIGURADO de la empresa si tienen el mismo
  // NOMBRE (evita ciudades duplicadas: se usa siempre el código configurado).
  const codigoConfigurado = (code) => {
    if (!code) return code
    const nom = String(nombreCiudad(code)).trim().toLowerCase()
    const conf = (ciudadesEmpresa || []).find((c) => c.codigo && String(c.nombre || '').trim().toLowerCase() === nom)
    return conf ? conf.codigo : code
  }

  // Opciones del selector de ciudad: empresa + personalizadas + detectadas, pero
  // DEDUPLICADAS por NOMBRE (una sola por ciudad) prefiriendo el código configurado.
  const opcionesCiudad = useMemo(() => {
    const porNombre = new Map() // nombre -> { codigo, pri }
    const add = (codigo, nombre, pri) => {
      if (!codigo) return
      const nom = String(nombre || codigo).trim()
      const prev = porNombre.get(nom)
      if (!prev || pri > prev.pri) porNombre.set(nom, { codigo, pri })
    }
    ;(ciudadesEmpresa || []).forEach((c) => add(c.codigo, c.nombre, 2))
    ciudadesExtra.forEach((c) => add(c.codigo, c.nombre, 2))
    procesados.forEach((p) => p.ciudadesDetectadas.forEach((code) => add(code, nombreCiudad(code), 1)))
    return [...porNombre.entries()].map(([nombre, v]) => ({ codigo: v.codigo, nombre }))
  }, [ciudadesEmpresa, ciudadesExtra, procesados])

  // Combinado recalculado con la ciudad MANUAL de cada archivo. Además reclasifica
  // "doble" según la regla (dobleMonto) de la CIUDAD de cada archivo (config
  // empresa→ciudad). Con el default (0.5) el resultado es idéntico al actual.
  const combinado = useMemo(() => {
    if (procesados.length === 0) return null
    const nom = (raw) => unif.map[raw] || raw // nombre canónico (unificado)
    const overridden = procesados.map((p, i) => {
      const code = ciudadPorArchivo[i] || ''
      const { dobleMonto } = resolverReglas(ajustes, code)
      return {
        ...p,
        detalles: p.detalles.map((d) => ({ ...d, courier: nom(d.courier), ciudad: code, esDoble: esDobleDetalle(d, dobleMonto) })),
        claims: p.claims.map((c) => ({ ...c, courier: nom(c.courier), ciudad: code })),
      }
    })
    return combinarArchivos(overridden, nombreMap)
  }, [procesados, ciudadPorArchivo, nombreMap, ajustes, unif.map])

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
      setCiudadPorArchivo(procs.map((p) => codigoConfigurado(p.ciudadesDetectadas[0] || ''))) // sugerencia: código configurado si coincide el nombre
      // Precarga la ruta de cada chofer (la que quedó guardada la última vez), para
      // no reasignar cada semana (modo POR RUTA).
      const preRutas = {}
      couriersUnicos.forEach((n) => { const d = buscarDriver(drivers, n); if (d?.rutaDefault) preRutas[n] = d.rutaDefault })
      setAsignacionRuta(preRutas)
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
  // Filtro de la lista de existentes: por nombre o por rate (individual o doble).
  const reconocidosFiltrados = useMemo(() => {
    const q = filtroExist.trim().toLowerCase()
    if (!q) return reconocidos
    return reconocidos.filter((n) => {
      const d = buscarDriver(drivers, n)
      const ind = String(d?.precioIndividual ?? '')
      const dob = String(d?.precioDoble ?? '')
      return n.toLowerCase().includes(q) || ind.includes(q) || dob.includes(q)
    })
  }, [reconocidos, filtroExist, drivers])
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
  // Filtra los choferes nuevos por nombre O por el rate que ya les asignaste (ind/doble).
  const nuevosFiltrados = choferesNuevos.filter((n) => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    const ind = String(precios[n]?.ind ?? '')
    const dob = String(precios[n]?.doble ?? '')
    return n.toLowerCase().includes(q) || ind.includes(q) || dob.includes(q)
  })
  const nConPrecio = choferesNuevos.filter((n) => Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0).length

  // Carga el archivo de RATES (hoja "Rates": Nombre / Rate / Paquetes Dobles). Es
  // la LISTA MAESTRA de choferes reales (nombres oficiales) y sus precios. Con ella
  // se unifican los nombres de la factura y se rellenan los precios por nombre
  // canónico (el nombre del archivo). Todo queda editable a mano.
  const manejarArchivoPrecios = async (fileList) => {
    const f = Array.from(fileList).find((x) => /\.xlsx?$/i.test(x.name))
    if (!f) return setErrores((e) => [...e, 'El archivo de precios debe ser un .xlsx.'])
    setProcesandoPrecios(true)
    try {
      const buf = await f.arrayBuffer()
      const { precios: lista, errores } = procesarArchivoPrecios(buf, f.name)
      if (errores?.length) setErrores((e) => [...e, ...errores.map((m) => `${f.name}: ${m}`)])
      setRatesList(lista)
      const preciosNuevos = {}
      for (const p of lista) preciosNuevos[p.nombre] = { ind: String(p.ind ?? ''), doble: String(p.doble ?? '') }
      setPrecios((prev) => ({ ...prev, ...preciosNuevos }))
      setPreciosResumen({ archivoNombre: f.name, total: lista.length })
    } catch (e) {
      setErrores((prev) => [...prev, e.message])
    } finally {
      setProcesandoPrecios(false)
    }
  }

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
      const cambios = []
      for (const [n, v] of Object.entries(editExist)) {
        const d = buscarDriver(drivers, n)
        if (!d) continue
        const ni = v.ind !== undefined && Number(v.ind) > 0 ? Number(v.ind) : Number(d.precioIndividual)
        const nd = v.doble !== undefined && Number(v.doble) > 0 ? Number(v.doble) : Number(d.precioDoble)
        if (ni !== Number(d.precioIndividual) || nd !== Number(d.precioDoble)) cambios.push({ id: d.id, precioIndividual: ni, precioDoble: nd })
      }
      const chunk = 450
      for (let i = 0; i < cambios.length; i += chunk) {
        const batch = writeBatch(db)
        cambios.slice(i, i + chunk).forEach((c) => batch.update(doc(db, 'drivers', c.id), { precioIndividual: c.precioIndividual, precioDoble: c.precioDoble }))
        await batch.commit()
      }
      await reloadDrivers()
      setEditExist({})
    } finally {
      setGuardandoExist(false)
    }
  }

  // ---- modo POR RUTA: asignación manual de choferes a rutas ----
  const modoRuta = ajustes?.modoConfig === 'ruta'
  const rutasDef = useMemo(() => ajustes?.reglasRuta || {}, [ajustes])
  // Ciudades presentes en esta carga (las asignadas a cada archivo).
  const ciudadesFactura = useMemo(() => new Set((ciudadPorArchivo || []).filter(Boolean)), [ciudadPorArchivo])
  // Ciudad de cada chofer de la factura (para filtrar la lista por ruta/ciudad).
  const ciudadDeChofer = useMemo(() => {
    const m = {}
    for (const c of (combinado?.resumenChoferes || [])) m[c.nombre] = c.ciudad
    return m
  }, [combinado])
  // Rutas visibles: solo las de las ciudades de esta factura (las sin ciudad se ven
  // siempre). Si ninguna calza, se muestran todas para no bloquear la asignación.
  const codigosRuta = useMemo(() => {
    const todas = Object.keys(rutasDef).sort()
    const filtradas = todas.filter((code) => { const ciu = rutasDef[code]?.ciudad; return !ciu || ciudadesFactura.has(ciu) })
    return filtradas.length > 0 ? filtradas : todas
  }, [rutasDef, ciudadesFactura])
  const toggleDriverRuta = (driver, code) => setAsignacionRuta((a) => {
    const n = { ...a }
    if (n[driver] === code) delete n[driver]
    else n[driver] = code
    return n
  })
  const driversSinRuta = useMemo(() => (modoRuta ? nombresFactura.filter((n) => !asignacionRuta[n]) : []), [modoRuta, nombresFactura, asignacionRuta])
  const todosDriversRuta = !modoRuta || (nombresFactura.length > 0 && driversSinRuta.length === 0)

  // Asociación de los "Failed delivery" del reporte a los choferes de la factura.
  const fallidosAsoc = useMemo(
    () => (fallidosProc && combinado ? asociarFallidos(fallidosProc.porNombre, nombresFactura) : null),
    [fallidosProc, combinado, nombresFactura]
  )

  const todasCiudadesAsignadas = ciudadPorArchivo.length > 0 && ciudadPorArchivo.every((c) => !!c)

  // DISCREPANCIA DE NOMBRE: la ciudad asignada ya existe en tu configuración con un
  // nombre distinto al que le corresponde a ese código en la factura. Se avisa y se
  // ofrece corregirlo (actualiza config + filtros; en la carga se refleja al instante).
  const discrepanciasCiudad = useMemo(() => {
    const out = []
    const vistos = new Set()
    for (const code of (ciudadPorArchivo || [])) {
      const cod = String(code || '').trim()
      if (!cod || vistos.has(cod.toUpperCase())) continue
      vistos.add(cod.toUpperCase())
      const conf = (ciudadesEmpresa || []).find((c) => String(c.codigo || '').toUpperCase() === cod.toUpperCase())
      if (!conf) continue // aún no configurada: se registra sola, no es discrepancia
      const nombreFactura = String(nombreCiudad(cod)).trim()
      const nombreConfig = String(conf.nombre || '').trim()
      // Solo si el estándar conoce un nombre real (distinto del código) y no coincide.
      if (nombreFactura && nombreFactura.toUpperCase() !== cod.toUpperCase() && nombreConfig.toLowerCase() !== nombreFactura.toLowerCase()) {
        out.push({ codigo: cod, nombreConfig, nombreFactura })
      }
    }
    return out
  }, [ciudadPorArchivo, ciudadesEmpresa])

  // Aplica el nombre de la factura a una ciudad ya configurada (config + filtros).
  const [corrigiendoCiudad, setCorrigiendoCiudad] = useState('')
  const usarNombreFactura = async (codigo, nombre) => {
    setCorrigiendoCiudad(codigo)
    try {
      const lista = (ciudadesEmpresa || []).map((c) =>
        String(c.codigo || '').toUpperCase() === String(codigo).toUpperCase() ? { ...c, nombre } : c)
      await guardarCiudadesEmpresa(activeCompanyId, lista)
      await reloadAjustes()
    } catch (e) { setErrores([`No se pudo actualizar el nombre de la ciudad: ${e.message}`]) }
    finally { setCorrigiendoCiudad('') }
  }

  const guardar = async () => {
    if (!combinado) return
    if (!activeCompanyId) return setErrores(['No hay una empresa activa seleccionada. Selecciona una empresa antes de guardar.'])
    if (!semana.trim()) return setErrores(['Debes indicar la semana antes de guardar.'])
    if (!todasCiudadesAsignadas) return setErrores(['Asigna una ciudad a cada archivo antes de guardar.'])
    if (!fallidosProc) return setErrores(['Falta el segundo archivo obligatorio: el Reporte de fallidos (GOFO).'])
    if (!modoRuta && choferesNuevos.length > 0 && !todosConPrecio) return setErrores(['Falta asignar precio individual y doble (>0) a todos los choferes nuevos.'])
    if (modoRuta) {
      if (codigosRuta.length === 0) return setErrores(['Estás en modo “Por ruta” pero no hay rutas configuradas. Ve a Configuración → Modo de configuración → Por ruta.'])
      if (!todosDriversRuta) return setErrores([`Asigna cada chofer a una ruta antes de guardar. Faltan ${driversSinRuta.length}.`])
    }
    if (!todosRepetidosResueltos) return setErrores([`Hay ${casosRepetidos.filter((c) => !decisiones[c.waybill]).length} claim(s) repetido(s) sin resolver. Aprueba o anula cada uno antes de guardar.`])
    setGuardando(true)
    setErrores([])
    try {
      // Alias por chofer canónico: los nombres crudos (variantes de Gofo) que se
      // unieron a un chofer real se guardan como alias para reconocerlos solos la
      // próxima vez.
      const aliasPorCanonico = {}
      for (const raw of rawCouriers) {
        const canon = unif.map[raw] || raw
        if (normNombre(canon) !== normNombre(raw)) (aliasPorCanonico[canon] = aliasPorCanonico[canon] || []).push(raw)
      }
      const chunk = 450
      // Crear los choferes NUEVOS (inexistentes) en batch, con su alias.
      if (choferesNuevos.length > 0) {
        const aCrear = choferesNuevos.filter((n) => !buscarDriver(drivers, n))
        for (let i = 0; i < aCrear.length; i += chunk) {
          const batch = writeBatch(db)
          for (const n of aCrear.slice(i, i + chunk)) {
            const dref = doc(collection(db, 'drivers'))
            batch.set(dref, {
              nombre: n,
              precioIndividual: Number(precios[n]?.ind) || 0,
              precioDoble: Number(precios[n]?.doble) || 0,
              activo: true,
              companyId: activeCompanyId,
              alias: aliasPorCanonico[n] || [],
              creadoEn: serverTimestamp(),
            })
          }
          await batch.commit()
        }
      }
      // Actualizar choferes EXISTENTES: precio/activo (los "nuevos" que ya existían sin
      // precio) + alias. Se combinan por documento (Firestore no permite dos escrituras
      // al mismo doc en un batch) y se comitean en lotes, en vez de uno por uno.
      const updates = {}
      if (choferesNuevos.length > 0) {
        for (const n of choferesNuevos.filter((x) => buscarDriver(drivers, x))) {
          const d = buscarDriver(drivers, n)
          updates[d.id] = { ...(updates[d.id] || {}), precioIndividual: Number(precios[n]?.ind) || 0, precioDoble: Number(precios[n]?.doble) || 0, activo: true }
        }
      }
      for (const [canon, aliases] of Object.entries(aliasPorCanonico)) {
        const d = buscarDriver(drivers, canon)
        if (d && aliases.length) updates[d.id] = { ...(updates[d.id] || {}), alias: arrayUnion(...aliases) }
      }
      const upIds = Object.keys(updates)
      for (let i = 0; i < upIds.length; i += chunk) {
        const batch = writeBatch(db)
        upIds.slice(i, i + chunk).forEach((id) => batch.update(doc(db, 'drivers', id), updates[id]))
        await batch.commit()
      }
      if (choferesNuevos.length > 0 || upIds.length) await reloadDrivers()

      const { detalles, claims, ...resumen } = combinado
      const ciudadesMap = Object.fromEntries(combinado.resumenCiudades.map((c) => [c.ubicacion, c.nombreCiudad]))
      const ciudadPrincipal = combinado.ciudades[0] || ''
      const periodo = parsearPeriodo(semana.trim())

      // FALLIDOS: asociar los "Failed delivery" a los choferes de la factura e
      // inyectar el conteo en la fila del chofer de su CIUDAD PRINCIPAL (la de más
      // paquetes), para que sume bien por ciudad y en "Todas" sin doble conteo.
      const asoc = asociarFallidos(fallidosProc?.porNombre || {}, nombresFactura)
      const fallidosPorChofer = asoc.porChofer
      const ciudadPrincipalChofer = {}
      const mejorPq = {}
      for (const ch of resumen.resumenChoferes || []) {
        const pq = ch.individuales + ch.dobles
        if (mejorPq[ch.nombre] == null || pq > mejorPq[ch.nombre]) { mejorPq[ch.nombre] = pq; ciudadPrincipalChofer[ch.nombre] = ch.ciudad }
      }
      resumen.resumenChoferes = (resumen.resumenChoferes || []).map((ch) => ({
        ...ch,
        fallidos: ciudadPrincipalChofer[ch.nombre] === ch.ciudad ? (fallidosPorChofer[ch.nombre] || 0) : 0,
      }))
      // Reglas de cálculo APLICADAS (claimFee/dobleMonto) por ciudad + default de
      // empresa, guardadas EN la factura para que el histórico sea consistente
      // aunque la config cambie después.
      const reglaEmpresa = resolverReglas(ajustes, '__empresa__')
      const reglasAplicadas = Object.fromEntries((combinado.ciudades || []).map((c) => [c, resolverReglas(ajustes, c)]))
      // Modo POR RUTA: snapshot de las reglas de ruta y de la asignación chofer→ruta
      // guardados EN la factura (histórico consistente aunque cambie la config).
      const reglasRutaAplicadas = modoRuta ? JSON.parse(JSON.stringify(rutasDef)) : null
      const asignacionRutaFinal = modoRuta ? { ...asignacionRuta } : null
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
        modoConfig: modoRuta ? 'ruta' : 'estandar',
        ...(modoRuta ? { reglasRutaAplicadas, asignacionRuta: asignacionRutaFinal } : {}),
        // Fallidos (solo informativo de desempeño; no afecta pago ni neto).
        totalFallidos: fallidosProc?.totalFailed || 0,
        fallidosPorChofer,
        fallidosSinAsociar: asoc.sinAsociar,
        fallidosArchivo: fallidosProc?.archivoNombre || '',
        ...resumen,
      }
      const ref = await addDoc(collection(db, 'invoices'), invoicePayload)

      // Registra en "Mis ciudades" (Configuración) cualquier ciudad de esta factura
      // que aún no esté guardada, para que aparezca en el filtro y se pueda renombrar
      // o eliminar si el nombre quedó mal. Se usa el nombre de la factura como nombre.
      try {
        const codigosExistentes = new Set((ciudadesEmpresa || []).map((c) => String(c.codigo || '').toUpperCase()))
        const ciudadesNuevas = []
        for (const code of (combinado.ciudades || [])) {
          const cod = String(code || '').trim()
          if (!cod || codigosExistentes.has(cod.toUpperCase())) continue
          codigosExistentes.add(cod.toUpperCase())
          ciudadesNuevas.push({ nombre: ciudadesMap[cod] || nombreCiudad(cod), codigo: cod })
        }
        if (ciudadesNuevas.length) {
          await guardarCiudadesEmpresa(activeCompanyId, [...(ciudadesEmpresa || []), ...ciudadesNuevas])
          await reloadAjustes()
        }
      } catch { /* si falla el registro de ciudad no se bloquea el guardado de la factura */ }

      // Recuerda la ruta de cada chofer (modo POR RUTA): se guarda en su ficha para
      // precargarla la próxima factura y para que Pagos la tenga a mano.
      if (modoRuta) {
        const rutaUpd = {}
        Object.entries(asignacionRuta).forEach(([nombre, code]) => { const d = buscarDriver(drivers, nombre); if (d && code) rutaUpd[d.id] = code })
        const rutaIds = Object.keys(rutaUpd)
        for (let i = 0; i < rutaIds.length; i += chunk) {
          const batch = writeBatch(db)
          rutaIds.slice(i, i + chunk).forEach((id) => batch.update(doc(db, 'drivers', id), { rutaDefault: rutaUpd[id] }))
          await batch.commit()
        }
        if (rutaIds.length) await reloadDrivers()
      }
      // Objeto de reglas para resolver el método (M1/M2/M3) de cada claim, sensible al modo.
      const invReglas = { reglaEmpresa, reglasAplicadas, modoConfig: modoRuta ? 'ruta' : 'estandar', reglasRutaAplicadas }
      // Mapa waybill -> detalle de entrega, para enriquecer cada claim con la
      // info del paquete (ruta, peso, rango de peso, monto de entrega).
      const detPorWaybill = {}
      for (const d of detalles) {
        const wb = (d.waybill || '').trim()
        if (wb && !detPorWaybill[wb]) detPorWaybill[wb] = d
      }
      // Se construye el payload de cada claim UNA vez y se usa para: (a) el documento
      // de la colección `claims` y (b) una copia EMBEBIDA en la factura (`claimsData`),
      // que sirve de respaldo para que el claim SIEMPRE se muestre aunque la consulta
      // a la colección no lo traiga (facturas duplicadas, índices, etc.).
      const claimDocsEmbed = []
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
          const rutaAsignada = modoRuta ? (asignacionRuta[c.courier] || '') : ''
          const payload = {
            companyId: activeCompanyId,
            invoiceId: ref.id,
            semana: semana.trim(),
            waybill: c.waybill,
            courier: c.courier,
            date: c.date,
            postalCode: c.postalCode,
            claimType: c.claimType,
            categoria: categoriaClaim(c.claimType),
            metodo: metodoDe(invReglas, c.ciudad || '', { ...c, rutaAsignada }),
            rutaAsignada,
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
          }
          batch.set(cref, payload)
          claimDocsEmbed.push(payload)
        }
        await batch.commit()
      }
      // Copia embebida en la factura (respaldo de visualización). Se limita para no
      // acercarse al tope de 1 MB por documento (los claims son casos excepcionales).
      if (claimDocsEmbed.length && claimDocsEmbed.length <= 1500) {
        await updateDoc(doc(db, 'invoices', ref.id), { claimsData: claimDocsEmbed })
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
        const rutaAsignada = modoRuta ? (asignacionRuta[c.courier] || '') : ''
        return { ...c, estadoRevision: esRep ? decisiones[wb] || 'pendiente' : 'aprobado', perdonado: false, rutaAsignada }
      })
      const invCalc = { ...combinado, resumenChoferes: resumen.resumenChoferes, reglaEmpresa, reglasAplicadas, modoConfig: modoRuta ? 'ruta' : 'estandar', reglasRutaAplicadas, asignacionRuta: asignacionRutaFinal }
      const pagosFinal = calcularPagos(invCalc, claimsConDecision, driversFinal, TODAS)
      // Un chofer que entrega en 2 ciudades sale como 2 filas (una por ciudad). Para
      // el portal se AGREGAN en UNA sola fila por chofer (mismo driverKey) sumando sus
      // números; si no, el segundo documento pisaba al primero y el portal mostraba
      // solo una ciudad. La ciudad guardada es la principal (donde entrega más).
      const SUMAR = ['individuales', 'dobles', 'ingreso', 'claimsTotales', 'claimsActivos', 'claimsPerdonados', 'descuentoClaims', 'descontadoGofo', 'totalPagar', 'ganancia', 'gananciaClaims', 'fallidos']
      const porDriver = {}
      for (const p of pagosFinal) {
        const key = (p.nombre || '').trim().toLowerCase()
        const pq = (p.individuales || 0) + (p.dobles || 0)
        if (!porDriver[key]) {
          porDriver[key] = { ...p, _pqPrincipal: pq }
        } else {
          const t = porDriver[key]
          SUMAR.forEach((k) => { t[k] = (t[k] || 0) + (p[k] || 0) })
          if (!t.tarifaInd && p.tarifaInd) t.tarifaInd = p.tarifaInd
          if (!t.tarifaDoble && p.tarifaDoble) t.tarifaDoble = p.tarifaDoble
          if (pq > t._pqPrincipal) { t._pqPrincipal = pq; t.ciudad = p.ciudad; t.nombreCiudad = p.nombreCiudad }
          t.sinTarifa = t.sinTarifa && p.sinTarifa
        }
      }
      const pagosPorChofer = Object.values(porDriver)
      const prom = promediosFlota(pagosPorChofer)
      const fechaInicioISO = periodo.fechaInicio ? periodo.fechaInicio.toISOString() : ''
      for (let i = 0; i < pagosPorChofer.length; i += chunk) {
        const batch = writeBatch(db)
        for (const p of pagosPorChofer.slice(i, i + chunk)) {
          const key = (p.nombre || '').trim().toLowerCase()
          const paquetes = (p.individuales || 0) + (p.dobles || 0)
          const calif = calificarChofer({ ...p, paquetes }, prom)
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
            paquetes,
            fallidos: p.fallidos || 0,
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
      setFallidosProc(null)
      setRatesList([])
      setPreciosResumen(null)
    } catch (e) {
      setErrores(['Error al guardar: ' + e.message])
    } finally {
      setGuardando(false)
    }
  }

  // Motivo EXACTO por el que el botón de procesar está deshabilitado (null = todo ok).
  // Se evalúa campo por campo para poder mostrárselo al usuario (nada en silencio).
  const motivoBloqueo = (() => {
    if (guardando) return 'Guardando…'
    if (!semana.trim()) return 'Falta indicar la semana.'
    if (!todasCiudadesAsignadas) return 'Falta asignar la ciudad de cada archivo.'
    if (!fallidosProc) return 'Falta subir el Reporte de fallidos (GOFO).'
    if (modoRuta) {
      if (codigosRuta.length === 0) return 'Modo “Por ruta”: no hay rutas configuradas en Configuración.'
      if (!todosDriversRuta) return `Modo “Por ruta”: faltan ${driversSinRuta.length} chofer(es) por asignar a una ruta.`
    } else if (choferesNuevos.length > 0 && !todosConPrecio) {
      const faltan = choferesNuevos.filter((n) => !(Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0))
      return `Faltan ${faltan.length} chofer(es) con precio (individual y doble > 0)${faltan.length ? ': ' + faltan.slice(0, 4).join(', ') + (faltan.length > 4 ? '…' : '') : ''}.`
    }
    if (!todosRepetidosResueltos) return `Hay ${casosRepetidos.filter((c) => !decisiones[c.waybill]).length} claim(s) repetido(s) sin aprobar/anular.`
    return null
  })()
  const puedeGuardar = !motivoBloqueo

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

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1) FACTURA (obligatoria) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivos(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? 'border-brand-gold bg-brand-gold/5' : procesados.length ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-600/60 dark:bg-emerald-500/5' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'
          }`}
        >
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-2.5 py-0.5 text-[11px] font-bold text-white">1 · Obligatorio</div>
          <Upload size={34} strokeWidth={1.5} className="mt-1 text-brand-gold" />
          <div className="mt-2 font-bold text-brand-navy dark:text-slate-100">Factura de pagos (GOFO)</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">El Excel “Details of Delivery Fees”. Uno o varios .xlsx (uno por ciudad).</div>
          {procesados.length > 0 && <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} strokeWidth={1.9} /> {procesados.length} archivo(s) cargado(s)</div>}
          <button type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }} className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">
            <FolderOpen size={16} strokeWidth={1.8} /> Seleccionar factura
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => manejarArchivos(e.target.files)} />
        </div>

        {/* 2) REPORTE DE FALLIDOS (obligatorio) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); manejarFallidos(e.dataTransfer.files) }}
          onClick={() => inputFallidosRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-8 text-center transition ${
            fallidosProc ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-600/60 dark:bg-emerald-500/5' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'
          }`}
        >
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-bold text-white">2 · Obligatorio</div>
          <PackageX size={34} strokeWidth={1.5} className="mt-1 text-rose-500" />
          <div className="mt-2 font-bold text-brand-navy dark:text-slate-100">Reporte de fallidos (GOFO)</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">El Excel con hoja “sheet”. Solo se usan los <b>“Failed delivery”</b> por chofer.</div>
          {procesandoFallidos ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"><Spinner className="text-rose-500" /> Procesando…</div>
          ) : fallidosProc && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} strokeWidth={1.9} /> {num(fallidosProc.totalFailed)} “Failed delivery” · {fallidosProc.archivoNombre}</div>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); inputFallidosRef.current?.click() }} className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
            <FolderOpen size={16} strokeWidth={1.8} /> Seleccionar reporte
          </button>
          <input ref={inputFallidosRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => manejarFallidos(e.target.files)} />
        </div>
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
          {/* Ciudad por archivo: automática (detectada) con opción de cambiarla */}
          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Ciudad de cada archivo</h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              La ciudad se detecta <strong>automáticamente</strong> desde la factura. Si es una ciudad nueva, se <strong>crea y se guarda sola</strong> en tu configuración (Mis ciudades) al guardar la factura, con sus reglas por defecto. Puedes cambiarla si hace falta; si la cambias a mano, se marca como <strong>Manual</strong>.
            </p>
            <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-3 py-2 text-left font-semibold">Archivo</th>
                    <th className="px-3 py-2 text-left font-semibold">Semana</th>
                    <th className="px-3 py-2 text-left font-semibold">Detectada</th>
                    <th className="px-3 py-2 text-left font-semibold">Ciudad (automática) *</th>
                  </tr>
                </thead>
                <tbody>
                  {procesados.map((p, i) => (
                    <tr key={p.archivoNombre + i} className="border-t border-slate-100 dark:border-slate-700/50">
                      <td className="px-3 py-2">{p.archivoNombre}</td>
                      <td className="px-3 py-2">{p.semana || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.ciudadesDetectadas.map(nombreCiudad).join(', ') || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <Select value={ciudadPorArchivo[i] || ''} onChange={(e) => setCiudad(i, e.target.value)} className={!ciudadPorArchivo[i] ? 'border-rose-400' : ''}>
                            <option value="">— Elegir ciudad —</option>
                            {opcionesCiudad.map((c) => (
                              <option key={c.codigo} value={c.codigo}>{c.nombre} ({c.codigo})</option>
                            ))}
                          </Select>
                          {(() => {
                            const sugerido = codigoConfigurado(p.ciudadesDetectadas[0] || '')
                            if (!ciudadPorArchivo[i]) return null
                            const auto = ciudadPorArchivo[i] === sugerido
                            return auto
                              ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">● Automática</span>
                              : <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">● Manual</span>
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {discrepanciasCiudad.map((d) => (
              <div key={d.codigo} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                <AlertTriangle size={16} strokeWidth={1.9} className="text-amber-600 dark:text-amber-400" />
                <span className="text-amber-800 dark:text-amber-200">
                  La ciudad <strong>{d.codigo}</strong> la tienes guardada como <strong>“{d.nombreConfig}”</strong>, pero en la factura corresponde a <strong>“{d.nombreFactura}”</strong>.
                </span>
                <Boton variant="gold" disabled={corrigiendoCiudad === d.codigo} onClick={() => usarNombreFactura(d.codigo, d.nombreFactura)} className="ml-auto px-3 py-1 text-xs">
                  {corrigiendoCiudad === d.codigo ? 'Actualizando…' : `Usar “${d.nombreFactura}”`}
                </Boton>
              </div>
            ))}
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

          {/* Reporte de fallidos: resumen + nombres sin asociar */}
          {!fallidosProc ? (
            <Aviso tipo="warn">
              <span className="inline-flex flex-wrap items-center gap-1.5"><PackageX size={15} strokeWidth={1.8} /> Falta el <b>Reporte de fallidos (GOFO)</b> (obligatorio). Súbelo arriba para poder guardar.</span>
            </Aviso>
          ) : fallidosAsoc && (
            <Card className="mb-4 border-2 border-rose-300/70 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <PackageX size={18} strokeWidth={1.8} className="text-rose-500" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Reporte de fallidos</h3>
                <Badge color="red">{num(fallidosProc.totalFailed)} Failed delivery</Badge>
                <Badge color="green">{num(fallidosAsoc.asociados)} choferes</Badge>
                {fallidosAsoc.sinAsociar.length > 0 && <Badge color="gold">{num(fallidosAsoc.sinAsociar.length)} sin asociar</Badge>}
              </div>
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                Reporte de fallidos procesado: <b>{num(fallidosProc.totalFailed)}</b> “Failed delivery” asociados a <b>{num(fallidosAsoc.asociados)}</b> choferes.
                {fallidosAsoc.sinAsociar.length > 0 ? <> <b>{num(fallidosAsoc.sinAsociar.length)}</b> nombres sin asociar (revisar).</> : ' Todos los nombres se asociaron.'}
              </p>
              {fallidosAsoc.sinAsociar.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-xs dark:bg-amber-500/10">
                  <div className="mb-1 inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300"><FileWarning size={14} strokeWidth={1.9} /> Nombres del reporte que no coinciden con ningún chofer de la factura:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fallidosAsoc.sinAsociar.map((s, i) => (
                      <span key={i} className="rounded-md bg-white px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s.nombre} <b className="text-rose-600 dark:text-rose-400">({s.n})</b></span>
                    ))}
                  </div>
                  <div className="mt-1.5 text-amber-700/80 dark:text-amber-300/80">Estos fallidos NO se asignarán a ningún chofer. Si es el mismo chofer escrito distinto, ajústalo y vuelve a subir el reporte.</div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Los fallidos son solo informativos de desempeño: no afectan el pago ni el neto de Gofo.</p>
            </Card>
          )}

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

          {/* Modo POR RUTA: asignar manualmente choferes a cada ruta */}
          {modoRuta && (
            <Card className="mb-4 border-2 border-brand-gold/60 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <RouteIcon size={18} strokeWidth={1.8} className="text-brand-gold" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Asigna cada chofer a su ruta</h3>
                <Badge color={todosDriversRuta ? 'green' : 'gold'}>{nombresFactura.length - driversSinRuta.length}/{nombresFactura.length} asignados</Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Estás en modo <b>Por ruta</b>. Se ignora la ruta del archivo: tú decides a qué ruta pertenece cada chofer y se le paga con las tarifas y métodos de esa ruta. Un chofer pertenece a una sola ruta.
              </p>
              {codigosRuta.length === 0 ? (
                <Aviso tipo="warn">No hay rutas configuradas. Ve a <b>Configuración → Modo de configuración → Por ruta</b> y crea al menos una ruta con sus tarifas.</Aviso>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {codigosRuta.map((code) => {
                      const r = rutasDef[code] || {}
                      const enRuta = nombresFactura.filter((n) => asignacionRuta[n] === code)
                      // Choferes que se ofrecen para esta ruta: si la ruta tiene ciudad,
                      // solo los de esa ciudad; si no, todos. Si el filtro deja la lista
                      // vacía, se muestran todos (para no impedir la asignación).
                      const choferesRuta = (() => {
                        if (!r.ciudad) return nombresFactura
                        const soloCiudad = nombresFactura.filter((n) => ciudadDeChofer[n] === r.ciudad)
                        return soloCiudad.length > 0 ? soloCiudad : nombresFactura
                      })()
                      return (
                        <div key={code} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge color="gold">{code}</Badge>
                            {r.nombre && <span className="text-sm font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</span>}
                            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                              Ind. {money(Number(r.tarifaInd) || 0)} · Doble {money(Number(r.tarifaDoble) || 0)} · {enRuta.length} chofer(es)
                            </span>
                          </div>
                          <div className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
                            {choferesRuta.map((n) => {
                              const asignadoAqui = asignacionRuta[n] === code
                              const asignadoOtra = asignacionRuta[n] && asignacionRuta[n] !== code
                              return (
                                <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm ${asignadoAqui ? 'bg-brand-gold/10' : asignadoOtra ? 'opacity-40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                  <input type="checkbox" checked={asignadoAqui} onChange={() => toggleDriverRuta(n, code)} className="h-4 w-4 accent-brand-gold" />
                                  <span className="truncate">{n}</span>
                                  {asignadoOtra && <span className="ml-auto text-[10px] text-slate-400">→ {asignacionRuta[n]}</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {driversSinRuta.length > 0 && (
                    <Aviso tipo="warn" className="mt-3">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <AlertTriangle size={15} strokeWidth={1.8} /> Faltan <b>{driversSinRuta.length}</b> chofer(es) sin ruta: {driversSinRuta.slice(0, 8).join(', ')}{driversSinRuta.length > 8 ? '…' : ''}
                      </span>
                    </Aviso>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Resumen: reconocidos (tarifa guardada) vs nuevos (solo modo estándar) */}
          {!modoRuta && (
            <Aviso tipo={choferesNuevos.length === 0 ? 'ok' : 'info'}>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Users size={15} strokeWidth={1.8} />
                <b>{reconocidos.length}</b> chofer(es) reconocidos con su tarifa guardada · <b>{choferesNuevos.length}</b> nuevo(s)
                {choferesNuevos.length === 0 ? '. Se procesa directo con las tarifas guardadas.' : ' que requieren precio.'}
              </span>
            </Aviso>
          )}

          {/* Precios desde archivo (opcional; convive con el manual) */}
          {!modoRuta && (
            <Card className="mb-4 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <FileSpreadsheet size={18} strokeWidth={1.8} className="text-brand-gold" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Precios de choferes desde archivo (opcional)</h3>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Dos formas de poner precios: escríbelos <b>a mano</b> abajo, o sube el <b>Excel de rates</b> (hoja <b>“Rates”</b>: <b>Nombre</b>, <b>Rate</b>, <b>Paquetes Dobles</b>). Ese archivo es tu <b>lista maestra</b> de choferes reales: se usan sus nombres para <b>unificar</b> las variantes de la factura y se rellenan los precios. Todo queda editable.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragPrecios(true) }}
                onDragLeave={() => setDragPrecios(false)}
                onDrop={(e) => { e.preventDefault(); setDragPrecios(false); manejarArchivoPrecios(e.dataTransfer.files) }}
                onClick={() => inputPreciosRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition ${
                  dragPrecios ? 'border-brand-gold bg-brand-gold/5' : preciosResumen ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-600/60 dark:bg-emerald-500/5' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                <Upload size={26} strokeWidth={1.5} className="text-brand-gold" />
                <div className="text-sm text-slate-500 dark:text-slate-400"><b>Arrastra el Excel aquí</b> o haz clic para seleccionarlo</div>
                <Boton variant="gold" onClick={(e) => { e.stopPropagation(); inputPreciosRef.current?.click() }} disabled={procesandoPrecios}>
                  {procesandoPrecios ? <><Spinner /> Leyendo…</> : <><Upload size={16} strokeWidth={1.8} /> Cargar rates / precios desde Excel</>}
                </Boton>
                <input ref={inputPreciosRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => manejarArchivoPrecios(e.target.files)} />
                {preciosResumen && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} strokeWidth={1.9} /> {num(preciosResumen.total)} choferes en la lista · {preciosResumen.archivoNombre}</span>}
              </div>
            </Card>
          )}

          {/* Unificación de nombres: variantes de Gofo → chofer real */}
          {!modoRuta && rawCouriers.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Users size={18} strokeWidth={1.8} className="text-brand-gold" />
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Unificación de nombres</h3>
                <Badge color="green">{num(rawCouriers.length)} → {num(unif.totalReal)} choferes</Badge>
                {unif.unidas > 0 && <Badge color="gold">{num(unif.unidas)} variantes unidas</Badge>}
                {unif.sinAsociar.length > 0 && <Badge color="red">{num(unif.sinAsociar.length)} sin asociar</Badge>}
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                <b>{num(rawCouriers.length)}</b> nombres en la factura se asociaron a <b>{num(unif.totalReal)}</b> choferes reales ({num(unif.unidas)} variantes unidas). Los paquetes, pagos y claims de cada variante se suman al chofer correcto.
              </p>

              {unif.sinAsociar.length > 0 && (
                <div className="mb-3 rounded-lg border border-rose-200 p-3 dark:border-rose-700/50">
                  <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300"><FileWarning size={15} strokeWidth={1.9} /> Sin asociar — asígnalos a un chofer o déjalos como nuevo</div>
                  <div className="space-y-1.5">
                    {unif.sinAsociar.map((raw) => (
                      <div key={raw} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[200px] flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{raw}</span>
                        <Combobox
                          className="w-72"
                          value={mapaManual[raw] || ''}
                          onChange={(v) => asignarManual(raw, v)}
                          options={opcionesChofer}
                          placeholder="— Revisar / elegir —"
                          searchPlaceholder="Escribe un nombre (ej. figue)…"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Al asignar a un chofer, ese nombre se guarda como <b>alias</b> y en próximas facturas se unirá solo.</p>
                </div>
              )}

              {Object.keys(unif.auto).length > 0 && (
                <div>
                  <button onClick={() => setVerUniones((v) => !v)} className="flex items-center gap-2 text-left text-sm font-semibold text-brand-navy dark:text-slate-100">
                    <ChevronDown size={16} strokeWidth={2} className={`transition ${verUniones ? 'rotate-180' : ''}`} /> Ver uniones automáticas ({Object.keys(unif.auto).length})
                  </button>
                  {verUniones && (
                    <div className="mt-2 scroll-thin max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
                      {Object.entries(unif.auto).map(([raw, canon]) => (
                        <div key={raw} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">{raw}</span>
                          <span className="text-brand-gold">→</span>
                          <b className="text-brand-navy dark:text-slate-100">{canon}</b>
                          <button onClick={() => asignarManual(raw, '__nuevo__')} className="ml-1 text-[11px] text-rose-500 hover:underline">separar (es otro)</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Ver/editar choferes existentes (opcional) */}
          {!modoRuta && reconocidos.length > 0 && (
            <Card className="mb-4 p-4">
              <button onClick={() => setVerExistentes((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-brand-navy dark:text-slate-100">
                <ChevronDown size={16} strokeWidth={2} className={`transition ${verExistentes ? 'rotate-180' : ''}`} /> Ver/editar choferes existentes ({reconocidos.length})
              </button>
              {verExistentes && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Opcional: cambia una tarifa antes de procesar. Si no tocas nada, se usan las tarifas guardadas.</p>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Users size={14} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input className="w-64 pl-8" value={filtroExist} onChange={(e) => setFiltroExist(e.target.value)} placeholder="Filtrar por nombre o rate (ej. 1.6)" />
                    </div>
                    {filtroExist && <Boton variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setFiltroExist('')}><X size={13} strokeWidth={2} /> Limpiar</Boton>}
                    <span className="text-xs text-slate-500 dark:text-slate-400">{reconocidosFiltrados.length} de {reconocidos.length}</span>
                  </div>
                  <div className="scroll-thin max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0"><tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <th className="px-3 py-2 text-left font-semibold">Chofer</th>
                        <th className="px-3 py-2 text-right font-semibold">Rate individual</th>
                        <th className="px-3 py-2 text-right font-semibold">Rate doble</th>
                      </tr></thead>
                      <tbody>
                        {reconocidosFiltrados.map((n, i) => (
                          <tr key={n} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                            <td className="px-3 py-1.5">{n}</td>
                            <td className="px-3 py-1.5 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valorExist(n, 'ind')} onChange={(e) => setExist(n, 'ind', e.target.value)} /></td>
                            <td className="px-3 py-1.5 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valorExist(n, 'doble')} onChange={(e) => setExist(n, 'doble', e.target.value)} /></td>
                          </tr>
                        ))}
                        {reconocidosFiltrados.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">Ningún chofer con ese nombre o rate.</td></tr>
                        )}
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

          {!modoRuta && choferesNuevos.length > 0 && (
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
                <Input className="w-56" placeholder="Buscar por nombre o rate (ej. 1.6)…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
                      <th className="px-3 py-2 text-right font-semibold">Rate individual</th>
                      <th className="px-3 py-2 text-right font-semibold">Rate doble</th>
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
              <div className="ml-auto flex items-center gap-3">
                {motivoBloqueo && !guardando && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={14} strokeWidth={1.9} /> No puedes procesar: {motivoBloqueo}
                  </span>
                )}
                <Boton onClick={guardar} disabled={!puedeGuardar} variant="gold" title={motivoBloqueo || 'Procesar factura'}>
                  {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> {choferesNuevos.length > 0 ? 'Guardar tarifas y procesar' : 'Guardar en base de datos'}</>}
                </Boton>
                <Boton onClick={() => { reset(); setFallidosProc(null); setRatesList([]); setPreciosResumen(null) }} variant="ghost">Descartar</Boton>
              </div>
            </div>
          </Card>
        </>
      )}

      <p className="mt-4 text-xs text-slate-400">El historial de facturas y su eliminación están en la sección <b>Facturas</b>.</p>
    </div>
  )
}
