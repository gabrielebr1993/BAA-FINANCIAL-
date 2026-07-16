// ---------------------------------------------------------------------------
// Estado compartido: facturas, choferes, claims + selección global
// (empresa activa, rango de fechas, ciudad, factura). Multi-empresa: todos los
// datos se filtran por companyId (la empresa activa).
// ---------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'
import { TODAS, TODOS } from './utils/calc'
import { conFechas, invoicesEnRango, combinarFacturas, combinarVerificacion, facturaDeChofer } from './utils/rango'
import { calcularAlertas, SEVERIDAD_ORDEN } from './utils/alertas'
import { cargarEstadosAlertas, guardarEstadoAlerta, borrarEstadoAlerta } from './utils/alertEstados'
import { subirBackupStorage } from './utils/backup'

const INTERVALO_BACKUP_MS = 24 * 60 * 60 * 1000 // backup automático cada 24 h

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const { user, perfil, companyId, esSuperAdmin, esDriver, cargando: cargandoAuth, ciudadUsuario, ciudadesUsuario, ciudadBloqueada } = useAuth()
  const ciudadesUsuarioKey = (ciudadesUsuario || []).join('|')
  const [companies, setCompanies] = useState([])
  // Empresa activa PERSISTIDA: al refrescar se mantiene la que estabas viendo
  // (solo aplica al súper-admin, que puede cambiar de empresa).
  const [activeCompanyId, setActiveCompanyId] = useState(() => {
    try { return localStorage.getItem('milepay_activeCompany') || null } catch { return null }
  })
  const [invoices, setInvoices] = useState([])
  const [drivers, setDrivers] = useState([])
  const [managers, setManagers] = useState([])
  const [claims, setClaims] = useState([])
  const [ajustes, setAjustes] = useState(null) // settings/{companyId}: ciudades, onboardingCompleto, marca…
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  // Ciudad y rango PERSISTIDOS: al recargar se mantiene lo que tenías elegido.
  const [selectedCity, setSelectedCity] = useState(() => {
    try { return localStorage.getItem('milepay_selectedCity') || TODAS } catch { return TODAS }
  })
  const [rango, setRango] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem('milepay_rango') || 'null'); return r && r.preset ? r : { preset: 'ultima', desde: '', hasta: '' } } catch { return { preset: 'ultima', desde: '', hasta: '' } }
  })
  // Chofer seleccionado (filtro "Refinar"): "todos" por defecto. Persistido igual que
  // la ciudad. Acota TODOS los datos a ese chofer (ver facturaRango más abajo).
  const [selectedDriver, setSelectedDriver] = useState(() => {
    try { return localStorage.getItem('milepay_selectedDriver') || TODOS } catch { return TODOS }
  })
  // MULTISELECCIÓN de ciudades: subconjunto de ciudades a ver COMBINADAS (sumadas).
  // - vacío o 1 → se usa selectedCity normal (Todas / una).
  // - 2+ → modo "subconjunto": se filtran las facturas a esas ciudades y se combinan
  //   (la ciudad efectiva pasa a ser TODAS sobre ese subconjunto).
  const [selectedCities, setSelectedCities] = useState(() => {
    try { const a = JSON.parse(localStorage.getItem('milepay_selectedCities') || '[]'); return Array.isArray(a) ? a.filter(Boolean) : [] } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem('milepay_selectedCities', JSON.stringify(selectedCities)) } catch { /* noop */ } }, [selectedCities])
  const selectedCitiesKey = [...selectedCities].sort().join('|')
  const subsetActivo = selectedCities.length >= 2
  // Ciudad EFECTIVA que consumen las páginas y las funciones de cálculo: en modo
  // subconjunto es TODAS (se combina sobre las facturas ya filtradas al subconjunto).
  const selectedCityEff = subsetActivo ? TODAS : selectedCity
  useEffect(() => { try { localStorage.setItem('milepay_selectedCity', selectedCity) } catch { /* noop */ } }, [selectedCity])
  useEffect(() => { try { localStorage.setItem('milepay_rango', JSON.stringify(rango)) } catch { /* noop */ } }, [rango])
  useEffect(() => { try { localStorage.setItem('milepay_selectedDriver', selectedDriver) } catch { /* noop */ } }, [selectedDriver])

  // Preferencias del filtro guardadas EN LA NUBE (por usuario): al iniciar sesión se
  // aplican (te siguen en cualquier dispositivo); al cambiar, se guardan (con
  // pequeño retardo para no escribir en cada tecleo).
  const prefsAplicadas = useRef(false)
  useEffect(() => {
    if (prefsAplicadas.current || !perfil) return
    prefsAplicadas.current = true
    const p = perfil.prefFiltro
    if (p) {
      if (p.selectedCity) setSelectedCity(p.selectedCity)
      if (p.rango && p.rango.preset) setRango(p.rango)
      if (p.selectedDriver) setSelectedDriver(p.selectedDriver)
    }
  }, [perfil])
  useEffect(() => {
    if (!user?.uid || esDriver || !prefsAplicadas.current) return
    const t = setTimeout(() => {
      updateDoc(doc(db, 'users', user.uid), { prefFiltro: { selectedCity, rango, selectedDriver } }).catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [selectedCity, rango, selectedDriver, user, esDriver])
  const [vista, setVista] = useState('combinado')
  // Estado persistido de cada alerta: { alertId: 'resuelta' | 'descartada' }.
  const [estadosAlertas, setEstadosAlertas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const ordenar = (list) =>
    [...list].sort((a, b) => {
      const ta = a.fechaInicio instanceof Date ? a.fechaInicio.getTime() : 0
      const tb = b.fechaInicio instanceof Date ? b.fechaInicio.getTime() : 0
      return tb - ta
    })

  // El súper-admin ve todas las empresas; un usuario normal solo la suya
  // (compatible con reglas de seguridad estrictas de Firestore).
  const cargarCompanies = useCallback(async () => {
    try {
      if (esDriver) { setCompanies([]); return [] }
      if (esSuperAdmin) {
        const snap = await getDocs(collection(db, 'companies'))
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setCompanies(list)
        return list
      }
      if (companyId) {
        const s = await getDoc(doc(db, 'companies', companyId))
        const list = s.exists() ? [{ id: s.id, ...s.data() }] : []
        setCompanies(list)
        return list
      }
      setCompanies([])
      return []
    } catch {
      return []
    }
  }, [esSuperAdmin, esDriver, companyId])

  // Facturas de la empresa activa (sin orderBy para no requerir índice compuesto).
  const cargarInvoices = useCallback(async (cid) => {
    if (!cid) { setInvoices([]); setSelectedInvoiceId(null); return [] }
    try {
      const snap = await getDocs(query(collection(db, 'invoices'), where('companyId', '==', cid)))
      const list = ordenar(snap.docs.map((d) => conFechas({ id: d.id, ...d.data() })))
      setInvoices(list)
      setSelectedInvoiceId((prev) => (list.some((i) => i.id === prev) ? prev : list[0] ? list[0].id : null))
      return list
    } catch (e) {
      setError('No se pudieron cargar las facturas: ' + e.message)
      return []
    }
  }, [])

  const cargarDrivers = useCallback(async (cid) => {
    if (!cid) { setDrivers([]); return }
    const snap = await getDocs(query(collection(db, 'drivers'), where('companyId', '==', cid)))
    setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, [])

  const cargarManagers = useCallback(async (cid) => {
    if (!cid) { setManagers([]); return }
    try {
      const snap = await getDocs(query(collection(db, 'managers'), where('companyId', '==', cid)))
      setManagers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch { setManagers([]) }
  }, [])

  // Ajustes de la empresa (ciudades propias, flag de onboarding, marca…).
  const cargarAjustes = useCallback(async (cid) => {
    if (!cid) { setAjustes(null); return }
    try {
      const s = await getDoc(doc(db, 'settings', cid))
      setAjustes(s.exists() ? s.data() : {})
    } catch { setAjustes({}) }
  }, [])

  // Claims por conjunto de facturas. Se filtra también por companyId para ser
  // compatible con las reglas de seguridad (una query lista debe acotar por empresa).
  // Carga claims del rango por invoiceId Y por SEMANA. Cargar por semana hace que un
  // claim aparezca aunque su documento haya quedado bajo OTRA factura de la misma
  // semana (facturas duplicadas). Se deduplica por id de documento; los waybills
  // repetidos se colapsan luego en claimsValidos.
  const cargarClaimsDe = useCallback(async (ids, semanas, cid) => {
    const listaIds = (ids || []).filter(Boolean)
    const listaSem = [...new Set((semanas || []).filter(Boolean))]
    if (!cid || (listaIds.length === 0 && listaSem.length === 0)) { setClaims([]); return }
    const consultas = [
      ...listaIds.map((id) => getDocs(query(collection(db, 'claims'), where('companyId', '==', cid), where('invoiceId', '==', id)))),
      ...listaSem.map((s) => getDocs(query(collection(db, 'claims'), where('companyId', '==', cid), where('semana', '==', s)))),
    ]
    const snaps = await Promise.all(consultas)
    const map = {}
    for (const snap of snaps) for (const d of snap.docs) map[d.id] = { id: d.id, ...d.data() }
    setClaims(Object.values(map))
  }, [])

  // Cargar empresas al iniciar sesión.
  useEffect(() => {
    if (!user) { setCompanies([]); return }
    cargarCompanies()
  }, [user, cargarCompanies])

  // Determinar la empresa activa.
  useEffect(() => {
    // Mientras la sesión aún carga NO tocamos la empresa activa (si la ponemos en
    // null se pierde la persistida y luego cae a la primera de la lista).
    if (!user) { if (!cargandoAuth) setActiveCompanyId(null); return }
    if (!esSuperAdmin) { setActiveCompanyId(companyId || null); return }
    // Súper-admin: conservar la empresa que estaba viendo (persistida) mientras
    // siga siendo válida. Si `prev` se perdió, se REELE de localStorage antes de
    // caer a la primera de la lista, para no cambiar de empresa al refrescar.
    const persistida = (() => { try { return localStorage.getItem('milepay_activeCompany') } catch { return null } })()
    const valida = (id) => !!id && (companies.length === 0 || companies.some((c) => c.id === id))
    setActiveCompanyId((prev) => {
      if (valida(prev)) return prev
      if (valida(persistida)) return persistida
      return companyId || (companies[0] ? companies[0].id : null)
    })
  }, [user, cargandoAuth, esSuperAdmin, companyId, companies])

  // Persistir la empresa activa para que sobreviva al refresco.
  useEffect(() => {
    try {
      if (activeCompanyId) localStorage.setItem('milepay_activeCompany', activeCompanyId)
    } catch { /* almacenamiento no disponible */ }
  }, [activeCompanyId])

  // Cargar datos de la empresa activa.
  useEffect(() => {
    // SEGURIDAD: un chofer NUNCA carga los datos de la empresa (facturas,
    // choferes, claims, etc.). Su portal consulta solo lo suyo por separado.
    if (!user || esDriver) {
      setInvoices([]); setDrivers([]); setManagers([]); setClaims([]); setAjustes(null); setSelectedInvoiceId(null); setCargando(false)
      return
    }
    ;(async () => {
      setCargando(true)
      const [, , , estados] = await Promise.all([
        cargarInvoices(activeCompanyId),
        cargarDrivers(activeCompanyId).catch(() => {}),
        cargarManagers(activeCompanyId).catch(() => {}),
        cargarEstadosAlertas(activeCompanyId),
        cargarAjustes(activeCompanyId).catch(() => {}),
      ])
      setEstadosAlertas(estados || {})
      setCargando(false)
    })()
  }, [user, esDriver, activeCompanyId, cargarInvoices, cargarDrivers, cargarManagers, cargarAjustes])

  // Backup AUTOMÁTICO cada 24 h a Firebase Storage (silencioso). Se dispara cuando
  // hay empresa activa y datos cargados, si pasó el intervalo desde el último backup.
  // Un ref evita repetirlo varias veces en la misma sesión.
  const backupIntentado = useRef(new Set())
  useEffect(() => {
    if (!user || esDriver || !activeCompanyId || !ajustes) return
    const marca = backupIntentado.current
    if (marca.has(activeCompanyId)) return
    const ult = ajustes.ultimoBackupAuto
    const ultMs = ult?.toDate ? ult.toDate().getTime() : (typeof ult?.seconds === 'number' ? ult.seconds * 1000 : 0)
    if (ultMs && Date.now() - ultMs < INTERVALO_BACKUP_MS) return
    marca.add(activeCompanyId)
    // No bloquea la UI; si falla (ej. Storage sin habilitar) se ignora en silencio.
    subirBackupStorage(activeCompanyId).catch(() => {})
  }, [user, esDriver, activeCompanyId, ajustes])

  // Usuario FIJADO a una ciudad (admin/manager por ciudad): ve ÚNICAMENTE las facturas
  // de SU ciudad en TODAS las pantallas (filtro, dashboard, por factura, ganancias…).
  // El dueño y el súper-admin ven todo.
  const invoicesVisibles = useMemo(() => {
    if (!ciudadBloqueada || !ciudadesUsuarioKey) return invoices
    const set = new Set(ciudadesUsuarioKey.split('|'))
    return invoices.filter((inv) =>
      set.has(inv.ciudad || '') ||
      (inv.resumenCiudades || []).some((c) => set.has(c.ubicacion))
    )
  }, [invoices, ciudadBloqueada, ciudadesUsuarioKey])

  const invoicesRangoBase = useMemo(() => invoicesEnRango(invoicesVisibles, rango), [invoicesVisibles, rango])
  // En modo subconjunto, se dejan SOLO las facturas de las ciudades elegidas (una
  // factura pertenece si su ciudad —o alguna de sus ciudades— está en el subconjunto).
  const invoicesRango = useMemo(() => {
    if (!subsetActivo) return invoicesRangoBase
    const set = new Set(selectedCities)
    return invoicesRangoBase.filter((i) => {
      const cs = [...new Set((i.resumenCiudades || []).map((c) => c.ubicacion).filter(Boolean))]
      if (cs.length === 0) return set.has(i.ciudad || '')
      return cs.some((c) => set.has(c))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicesRangoBase, subsetActivo, selectedCitiesKey])
  // Factura COMPLETA del rango (todos los choferes/ciudades): base para construir
  // las listas de los selectores (ciudad/chofer) y para las alertas globales.
  const facturaRangoFull = useMemo(() => combinarFacturas(invoicesRango), [invoicesRango])
  // Factura que CONSUMEN las páginas: si hay un chofer elegido, se reduce a ese
  // chofer (recomputando ciudades/rutas/totales); si no, es la completa. Así todo el
  // resto de la app (funciones de cálculo intactas) muestra solo sus datos.
  const hayChofer = selectedDriver && selectedDriver !== TODOS
  const facturaRango = useMemo(
    () => (hayChofer ? facturaDeChofer(facturaRangoFull, selectedDriver) : facturaRangoFull),
    [facturaRangoFull, hayChofer, selectedDriver]
  )
  // Verificación de Gofo de la CIUDAD seleccionada. Como cada factura es de una sola
  // ciudad (Gofo paga por ciudad), se suma la verificación de las facturas del rango
  // que son EXACTAMENTE de esa ciudad → su "Cuadra con Gofo" real e independiente.
  // Con "Todas" se usa la del rango completo. Si una factura es multi-ciudad (histórico
  // combinado) no se puede atribuir a una sola → queda null (se avisa en la UI).
  const verificacionCiudad = useMemo(() => {
    if (!selectedCityEff || selectedCityEff === TODAS) return facturaRangoFull?.verificacion || null
    const invs = invoicesRango.filter((i) => {
      const cs = [...new Set((i.resumenCiudades || []).map((c) => c.ubicacion).filter(Boolean))]
      if (cs.length === 0) return (i.ciudad || '') === selectedCityEff
      return cs.length === 1 && cs[0] === selectedCityEff
    })
    return combinarVerificacion(invs)
  }, [selectedCityEff, invoicesRango, facturaRangoFull])

  const rangoIds = invoicesRango.map((i) => i.id)
  const rangoKey = rangoIds.join(',')
  const rangoSemanas = invoicesRango.map((i) => i.semana).filter(Boolean)
  const rangoSemanasKey = [...new Set(rangoSemanas)].sort().join('|')
  // Número de SEMANAS distintas del rango (por el campo `semana`, no por # de
  // facturas). Se usa para multiplicar los gastos fijos semanales (managers): si una
  // misma semana trae varias facturas (ej. una por ciudad), NO se debe cobrar el
  // gasto fijo dos veces. Facturas sin `semana` cuentan por su id (una c/u).
  const numSemanas = Math.max(1, new Set(invoicesRango.map((i) => i.semana || i.id)).size)

  // Claims EFECTIVOS: los de la colección + un respaldo EMBEBIDO en la factura
  // (inv.claimsData) para las facturas del rango que no trajeron ningún claim de la
  // colección (facturas duplicadas, índices, etc.). Así el claim siempre se ve.
  const claimsEfectivos = useMemo(() => {
    const conDocs = new Set(claims.map((c) => c.invoiceId))
    const extra = []
    for (const inv of invoicesRango) {
      if (conDocs.has(inv.id)) continue
      if (Array.isArray(inv.claimsData) && inv.claimsData.length) {
        for (const c of inv.claimsData) extra.push({ ...c, invoiceId: inv.id })
      }
    }
    return extra.length ? [...claims, ...extra] : claims
  }, [claims, invoicesRango])

  // Claims que consumen las páginas: reducidos al chofer elegido (si lo hay), para
  // que los claims/fallidos correspondan a la MISMA selección que el resto.
  const claimsFiltrados = useMemo(
    () => (hayChofer ? claimsEfectivos.filter((c) => c.courier === selectedDriver) : claimsEfectivos),
    [claimsEfectivos, hayChofer, selectedDriver]
  )

  // Ajustes manuales de pago (préstamo/bono) por chofer, SUMADOS sobre las facturas
  // del rango. Cada factura guarda inv.ajustesPago = { [driverKey]: {prestamo,bono} }.
  const ajustesPorChofer = useMemo(() => {
    const acc = {}
    for (const inv of invoicesRango) {
      const m = inv.ajustesPago || {}
      for (const [k, v] of Object.entries(m)) {
        acc[k] = acc[k] || { prestamo: 0, bono: 0 }
        acc[k].prestamo += Number(v.prestamo) || 0
        acc[k].bono += Number(v.bono) || 0
      }
    }
    return acc
  }, [invoicesRango])

  // La ciudad elegida es MANUAL y se respeta siempre (aunque esté en 0). Se mantiene
  // persistida; NO se rebota a "Todas". El usuario cambia de ciudad cuando quiere.

  // Si la empresa tiene UNA sola ciudad, se selecciona sola (una sola vez, con ref).
  const autoCiudadHecha = useRef(false)
  useEffect(() => {
    if (autoCiudadHecha.current || ciudadBloqueada) return
    const cities = (ajustes?.ciudades || []).filter((c) => c.codigo)
    if (cities.length === 1 && selectedCity === TODAS) { autoCiudadHecha.current = true; setSelectedCity(cities[0].codigo) }
  }, [ajustes, ciudadBloqueada, selectedCity])

  // CADA EMPRESA TIENE SUS CIUDADES. Si la ciudad seleccionada (se persiste por
  // usuario) no pertenece a la empresa activa, se vuelve a "Todas" para no arrastrar
  // la ciudad de otra empresa. Al cambiar de empresa se reinicia el auto-seleccionado.
  const empresaCiudadRef = useRef(activeCompanyId)
  useEffect(() => {
    if (empresaCiudadRef.current !== activeCompanyId) { empresaCiudadRef.current = activeCompanyId; autoCiudadHecha.current = false }
    if (ciudadBloqueada || selectedCity === TODAS) return
    const disponibles = new Set([
      ...((ajustes?.ciudades || []).map((c) => c.codigo).filter(Boolean)),
      ...invoices.flatMap((i) => (i.resumenCiudades || []).map((c) => c.ubicacion)),
    ])
    if (disponibles.size > 0 && !disponibles.has(selectedCity)) setSelectedCity(TODAS)
  }, [activeCompanyId, ajustes, invoices, selectedCity, ciudadBloqueada])

  // Usuario asignado a una ciudad (ej. manager por ciudad): su vista queda fija en
  // su ciudad; no puede ver ni cambiar a otras.
  useEffect(() => {
    if (!ciudadBloqueada) return
    const cs = ciudadesUsuarioKey ? ciudadesUsuarioKey.split('|') : []
    if (cs.length === 1) {
      // Una sola ciudad: vista fija en esa ciudad.
      if (selectedCity !== cs[0]) setSelectedCity(cs[0])
    } else if (cs.length > 1) {
      // Varias ciudades: puede ver "Todas" (= todas SUS ciudades) o una de ellas.
      if (selectedCity !== TODAS && !cs.includes(selectedCity)) setSelectedCity(TODAS)
    }
  }, [ciudadBloqueada, ciudadesUsuarioKey, selectedCity])

  useEffect(() => {
    cargarClaimsDe(rangoKey ? rangoKey.split(',') : [], rangoSemanas, activeCompanyId).catch((e) => setError('Error cargando claims: ' + e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoKey, rangoSemanasKey, activeCompanyId, cargarClaimsDe])

  // PREDICTIVO: si la selección persistida (una factura borrada, un rango personalizado
  // sin facturas…) quedó SIN datos pero SÍ hay facturas, volver a "última semana" para
  // no mostrar una pantalla vacía al abrir.
  useEffect(() => {
    if (cargando) return
    if (invoicesVisibles.length > 0 && invoicesRango.length === 0 && rango.preset !== 'ultima') {
      setRango({ preset: 'ultima', desde: '', hasta: '' })
    }
  }, [cargando, invoicesVisibles, invoicesRango, rango.preset])

  // Si el chofer elegido ya no está en el período/ciudad actual (cambio de modo o de
  // semana), volver a "Todos" para no arrastrar una selección residual.
  useEffect(() => {
    if (!hayChofer) return
    const existe = (facturaRangoFull?.resumenChoferes || []).some((c) => c.nombre === selectedDriver)
    if (!existe) setSelectedDriver(TODOS)
  }, [hayChofer, facturaRangoFull, selectedDriver])

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) || null

  // Alertas SIEMPRE globales (no dependen del filtro de chofer): se calculan sobre la
  // factura completa del rango y todos sus claims.
  const invAnterior = useMemo(() => {
    if (!facturaRangoFull || facturaRangoFull.esRango) return null
    const idx = invoices.findIndex((i) => i.id === facturaRangoFull.id)
    return idx >= 0 ? invoices[idx + 1] : null
  }, [facturaRangoFull, invoices])

  const alertasBase = useMemo(() => calcularAlertas({ inv: facturaRangoFull, claims: claimsEfectivos, drivers, managers, semanas: numSemanas, invAnterior }), [facturaRangoFull, claimsEfectivos, drivers, managers, numSemanas, invAnterior])
  // Todas las alertas con su estado persistido adjunto.
  const alertasTodas = useMemo(
    () => alertasBase
      .map((a) => ({ ...a, estado: estadosAlertas[a.id] || 'activa' }))
      .sort((a, b) => SEVERIDAD_ORDEN[a.tipo] - SEVERIDAD_ORDEN[b.tipo]),
    [alertasBase, estadosAlertas]
  )
  // Visibles = ni descartadas ni resueltas (las que exigen atención).
  const alertasVisibles = useMemo(() => alertasTodas.filter((a) => a.estado === 'activa'), [alertasTodas])

  // Marca una alerta con un estado y lo persiste en Firestore.
  const marcarAlerta = useCallback(async (id, estado) => {
    setEstadosAlertas((s) => ({ ...s, [id]: estado }))
    await guardarEstadoAlerta(activeCompanyId, id, estado).catch(() => {})
  }, [activeCompanyId])
  // Reactiva una alerta (borra su estado).
  const reactivarAlerta = useCallback(async (id) => {
    setEstadosAlertas((s) => { const n = { ...s }; delete n[id]; return n })
    await borrarEstadoAlerta(activeCompanyId, id).catch(() => {})
  }, [activeCompanyId])
  // Compat: descartar = marcar como descartada.
  const descartarAlerta = useCallback((id) => marcarAlerta(id, 'descartada'), [marcarAlerta])

  const empresaActiva = companies.find((c) => c.id === activeCompanyId) || null

  // Lista de códigos de ciudad disponibles (configuradas + detectadas en facturas),
  // acotada a las del usuario si está bloqueado. Base para el multiselector.
  const ciudadesDisponibles = useMemo(() => {
    const set = new Set([
      ...((ajustes?.ciudades || []).map((c) => c.codigo).filter(Boolean)),
      ...invoicesVisibles.flatMap((i) => [...(i.resumenCiudades || []).map((c) => c.ubicacion), i.ciudad]).filter(Boolean),
    ])
    let arr = [...set]
    if (ciudadBloqueada && ciudadesUsuarioKey) {
      const permit = new Set(ciudadesUsuarioKey.split('|'))
      arr = arr.filter((c) => permit.has(c))
    }
    return arr
  }, [ajustes, invoicesVisibles, ciudadBloqueada, ciudadesUsuarioKey])

  // Conjunto de ciudades EN VISTA ahora mismo (para filtrar managers/gastos fijos):
  //  - subconjunto → las elegidas; una ciudad → [esa]; Todas → todas las disponibles.
  const ciudadesActivas = useMemo(() => {
    if (subsetActivo) return selectedCities
    if (selectedCity && selectedCity !== TODAS) return [selectedCity]
    return ciudadesDisponibles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsetActivo, selectedCitiesKey, selectedCity, ciudadesDisponibles])

  // Fija el subconjunto de ciudades (multiselección). Colapsa a selección simple
  // cuando quedan 0 (→ Todas) o 1 (→ esa ciudad). Respeta el bloqueo por ciudad.
  const setSelectedCitiesSafe = useCallback((arr) => {
    let lista = [...new Set((arr || []).filter(Boolean))]
    if (ciudadBloqueada) {
      const permit = new Set((ciudadesUsuario || []))
      lista = lista.filter((c) => permit.has(c))
    }
    if (lista.length <= 1) {
      setSelectedCities([])
      const uno = lista[0] || TODAS
      if (!ciudadBloqueada || uno === TODAS || (ciudadesUsuario || []).includes(uno)) setSelectedCity(uno)
    } else {
      setSelectedCities(lista)
    }
  }, [ciudadBloqueada, ciudadesUsuario])

  // Poda el subconjunto si alguna ciudad ya no existe (p.ej. al cambiar de empresa),
  // para no dejar el filtro apuntando a ciudades ausentes (pantalla vacía).
  useEffect(() => {
    if (!subsetActivo || ciudadesDisponibles.length === 0) return
    const disp = new Set(ciudadesDisponibles)
    const filtradas = selectedCities.filter((c) => disp.has(c))
    if (filtradas.length !== selectedCities.length) setSelectedCities(filtradas.length ? filtradas : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsetActivo, selectedCitiesKey, ciudadesDisponibles])

  const value = {
    // multi-empresa
    companies,
    activeCompanyId,
    setActiveCompanyId,
    empresaActiva,
    reloadCompanies: cargarCompanies,
    // datos
    invoices: invoicesVisibles,
    drivers,
    managers,
    claims: claimsFiltrados,
    ajustesPorChofer,
    ajustes,
    ciudadesEmpresa: (ajustes?.ciudades || []),
    reloadAjustes: () => cargarAjustes(activeCompanyId),
    selectedInvoice,
    selectedInvoiceId,
    setSelectedInvoiceId,
    rango,
    setRango,
    vista,
    setVista,
    invoicesRango,
    numSemanas,
    facturaRango,
    facturaRangoFull,
    verificacionCiudad,
    selectedDriver,
    setSelectedDriver,
    invAnterior,
    alertasTodas,
    alertasVisibles,
    numAlertas: alertasVisibles.length,
    estadosAlertas,
    marcarAlerta,
    reactivarAlerta,
    descartarAlerta,
    // Ciudad EFECTIVA (en subconjunto = TODAS sobre las ciudades elegidas).
    selectedCity: selectedCityEff,
    // Usuario bloqueado a su(s) ciudad(es): solo puede elegir "Todas" (= todas SUS
    // ciudades) o una de las suyas; cualquier otra se ignora. Elegir una ciudad simple
    // limpia el subconjunto de multiselección.
    setSelectedCity: (c) => {
      if (ciudadBloqueada && !(c === TODAS || (ciudadesUsuario || []).includes(c))) return
      setSelectedCities([])
      setSelectedCity(c)
    },
    // Multiselección de ciudades (ver varias combinadas).
    selectedCities,
    setSelectedCities: setSelectedCitiesSafe,
    subsetCiudades: subsetActivo,
    ciudadesActivas,
    ciudadesDisponibles,
    ciudadBloqueada,
    ciudadUsuario,
    ciudadesUsuario,
    cargando,
    error,
    reloadInvoices: () => cargarInvoices(activeCompanyId),
    reloadDrivers: () => cargarDrivers(activeCompanyId),
    reloadManagers: () => cargarManagers(activeCompanyId),
    reloadClaims: () => cargarClaimsDe(rangoIds, rangoSemanas, activeCompanyId),
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
