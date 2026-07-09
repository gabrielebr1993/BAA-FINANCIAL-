// ---------------------------------------------------------------------------
// Estado compartido: facturas, choferes, claims + selección global
// (empresa activa, rango de fechas, ciudad, factura). Multi-empresa: todos los
// datos se filtran por companyId (la empresa activa).
// ---------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'
import { TODAS } from './utils/calc'
import { conFechas, invoicesEnRango, combinarFacturas } from './utils/rango'
import { calcularAlertas, SEVERIDAD_ORDEN } from './utils/alertas'
import { cargarEstadosAlertas, guardarEstadoAlerta, borrarEstadoAlerta } from './utils/alertEstados'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const { user, companyId, esSuperAdmin, esDriver } = useAuth()
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
  const [selectedCity, setSelectedCity] = useState(TODAS)
  const [rango, setRango] = useState({ preset: 'ultima', desde: '', hasta: '' })
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
  const cargarClaimsDe = useCallback(async (ids, cid) => {
    if (!ids || ids.length === 0 || !cid) { setClaims([]); return }
    const partes = await Promise.all(
      ids.map((id) =>
        getDocs(query(collection(db, 'claims'), where('companyId', '==', cid), where('invoiceId', '==', id))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    )
    setClaims(partes.flat())
  }, [])

  // Cargar empresas al iniciar sesión.
  useEffect(() => {
    if (!user) { setCompanies([]); return }
    cargarCompanies()
  }, [user, cargarCompanies])

  // Determinar la empresa activa.
  useEffect(() => {
    if (!user) { setActiveCompanyId(null); return }
    if (!esSuperAdmin) { setActiveCompanyId(companyId || null); return }
    // Súper-admin: conservar la empresa que estaba viendo (persistida) mientras
    // siga siendo válida. Si aún no cargó la lista, se respeta lo persistido; una
    // vez cargada, si esa empresa ya no existe, se pasa a la primera disponible.
    setActiveCompanyId((prev) => {
      if (prev && (companies.length === 0 || companies.some((c) => c.id === prev))) return prev
      return companyId || (companies[0] ? companies[0].id : null)
    })
  }, [user, esSuperAdmin, companyId, companies])

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

  const invoicesRango = useMemo(() => invoicesEnRango(invoices, rango), [invoices, rango])
  const facturaRango = useMemo(() => combinarFacturas(invoicesRango), [invoicesRango])
  const rangoIds = invoicesRango.map((i) => i.id)
  const rangoKey = rangoIds.join(',')

  useEffect(() => {
    cargarClaimsDe(rangoKey ? rangoKey.split(',') : [], activeCompanyId).catch((e) => setError('Error cargando claims: ' + e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoKey, activeCompanyId, cargarClaimsDe])

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) || null

  const invAnterior = useMemo(() => {
    if (!facturaRango || facturaRango.esRango) return null
    const idx = invoices.findIndex((i) => i.id === facturaRango.id)
    return idx >= 0 ? invoices[idx + 1] : null
  }, [facturaRango, invoices])

  const alertasBase = useMemo(() => calcularAlertas({ inv: facturaRango, claims, drivers, invAnterior }), [facturaRango, claims, drivers, invAnterior])
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

  const value = {
    // multi-empresa
    companies,
    activeCompanyId,
    setActiveCompanyId,
    empresaActiva,
    reloadCompanies: cargarCompanies,
    // datos
    invoices,
    drivers,
    managers,
    claims,
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
    facturaRango,
    invAnterior,
    alertasTodas,
    alertasVisibles,
    numAlertas: alertasVisibles.length,
    estadosAlertas,
    marcarAlerta,
    reactivarAlerta,
    descartarAlerta,
    selectedCity,
    setSelectedCity,
    cargando,
    error,
    reloadInvoices: () => cargarInvoices(activeCompanyId),
    reloadDrivers: () => cargarDrivers(activeCompanyId),
    reloadManagers: () => cargarManagers(activeCompanyId),
    reloadClaims: () => cargarClaimsDe(rangoIds, activeCompanyId),
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
