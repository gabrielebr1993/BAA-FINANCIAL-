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

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const { user, companyId, esSuperAdmin } = useAuth()
  const [companies, setCompanies] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [drivers, setDrivers] = useState([])
  const [managers, setManagers] = useState([])
  const [claims, setClaims] = useState([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  const [selectedCity, setSelectedCity] = useState(TODAS)
  const [rango, setRango] = useState({ preset: 'ultima', desde: '', hasta: '' })
  const [vista, setVista] = useState('combinado')
  const [alertasDescartadas, setAlertasDescartadas] = useState(() => new Set())
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
  }, [esSuperAdmin, companyId])

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
    setActiveCompanyId((prev) => prev || companyId || (companies[0] ? companies[0].id : null))
  }, [user, esSuperAdmin, companyId, companies])

  // Cargar datos de la empresa activa.
  useEffect(() => {
    if (!user) {
      setInvoices([]); setDrivers([]); setManagers([]); setClaims([]); setSelectedInvoiceId(null); setCargando(false)
      return
    }
    ;(async () => {
      setCargando(true)
      await Promise.all([cargarInvoices(activeCompanyId), cargarDrivers(activeCompanyId).catch(() => {}), cargarManagers(activeCompanyId).catch(() => {})])
      setCargando(false)
    })()
  }, [user, activeCompanyId, cargarInvoices, cargarDrivers, cargarManagers])

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
  const alertasVisibles = useMemo(
    () => alertasBase.filter((a) => !alertasDescartadas.has(a.id)).sort((a, b) => SEVERIDAD_ORDEN[a.tipo] - SEVERIDAD_ORDEN[b.tipo]),
    [alertasBase, alertasDescartadas]
  )
  const descartarAlerta = useCallback((id) => setAlertasDescartadas((s) => new Set(s).add(id)), [])
  const restaurarAlertas = useCallback(() => setAlertasDescartadas(new Set()), [])

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
    alertasVisibles,
    numAlertas: alertasVisibles.length,
    alertasDescartadas,
    descartarAlerta,
    restaurarAlertas,
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
