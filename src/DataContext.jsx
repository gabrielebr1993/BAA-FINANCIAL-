// ---------------------------------------------------------------------------
// Estado compartido: facturas, choferes, claims + selección global
// (rango de fechas, ciudad, factura). Se lee de Firestore.
// ---------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'
import { TODAS } from './utils/calc'
import { conFechas, invoicesEnRango, combinarFacturas } from './utils/rango'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [drivers, setDrivers] = useState([])
  const [claims, setClaims] = useState([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  const [selectedCity, setSelectedCity] = useState(TODAS)
  const [rango, setRango] = useState({ preset: 'ultima', desde: '', hasta: '' })
  const [vista, setVista] = useState('combinado') // 'combinado' | 'porSemana'
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargarInvoices = useCallback(async () => {
    const mapear = (snap) => snap.docs.map((d) => conFechas({ id: d.id, ...d.data() }))
    const ordenar = (list) =>
      [...list].sort((a, b) => {
        const ta = a.fechaInicio instanceof Date ? a.fechaInicio.getTime() : 0
        const tb = b.fechaInicio instanceof Date ? b.fechaInicio.getTime() : 0
        return tb - ta
      })
    try {
      const snap = await getDocs(query(collection(db, 'invoices'), orderBy('fechaCarga', 'desc')))
      const list = ordenar(mapear(snap))
      setInvoices(list)
      setSelectedInvoiceId((prev) => prev || (list[0] ? list[0].id : null))
      return list
    } catch {
      try {
        const snap = await getDocs(collection(db, 'invoices'))
        const list = ordenar(mapear(snap))
        setInvoices(list)
        setSelectedInvoiceId((prev) => prev || (list[0] ? list[0].id : null))
        return list
      } catch (e2) {
        setError('No se pudieron cargar las facturas: ' + e2.message)
        return []
      }
    }
  }, [])

  const cargarDrivers = useCallback(async () => {
    const snap = await getDocs(collection(db, 'drivers'))
    setDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, [])

  // carga de claims para un conjunto de facturas (una consulta por factura).
  const cargarClaimsDe = useCallback(async (ids) => {
    if (!ids || ids.length === 0) {
      setClaims([])
      return
    }
    const partes = await Promise.all(
      ids.map((id) => getDocs(query(collection(db, 'claims'), where('invoiceId', '==', id))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    )
    setClaims(partes.flat())
  }, [])

  // carga inicial (y al iniciar/cerrar sesión)
  useEffect(() => {
    if (!user) {
      setInvoices([])
      setDrivers([])
      setClaims([])
      setSelectedInvoiceId(null)
      setCargando(false)
      return
    }
    ;(async () => {
      setCargando(true)
      await Promise.all([cargarInvoices(), cargarDrivers().catch(() => {})])
      setCargando(false)
    })()
  }, [user, cargarInvoices, cargarDrivers])

  // facturas dentro del rango + factura efectiva (combinada si hay varias).
  const invoicesRango = useMemo(() => invoicesEnRango(invoices, rango), [invoices, rango])
  const facturaRango = useMemo(() => combinarFacturas(invoicesRango), [invoicesRango])
  const rangoIds = invoicesRango.map((i) => i.id)
  const rangoKey = rangoIds.join(',')

  // recargar claims cuando cambian las facturas del rango
  useEffect(() => {
    cargarClaimsDe(rangoKey ? rangoKey.split(',') : []).catch((e) => setError('Error cargando claims: ' + e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoKey, cargarClaimsDe])

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) || null

  const value = {
    invoices,
    drivers,
    claims,
    // selección de factura individual (usada en Cargar Factura)
    selectedInvoice,
    selectedInvoiceId,
    setSelectedInvoiceId,
    // rango de fechas + vista + factura efectiva
    rango,
    setRango,
    vista,
    setVista,
    invoicesRango,
    facturaRango,
    // ciudad
    selectedCity,
    setSelectedCity,
    cargando,
    error,
    reloadInvoices: cargarInvoices,
    reloadDrivers: cargarDrivers,
    reloadClaims: () => cargarClaimsDe(rangoIds),
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
