// ---------------------------------------------------------------------------
// Estado compartido de datos: facturas, choferes, claims + selección global
// (factura seleccionada y ciudad seleccionada). Se lee de Firestore.
// ---------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'
import { TODAS } from './utils/calc'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [drivers, setDrivers] = useState([])
  const [claims, setClaims] = useState([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  const [selectedCity, setSelectedCity] = useState(TODAS)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargarInvoices = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'invoices'), orderBy('fechaCarga', 'desc')))
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setInvoices(list)
      setSelectedInvoiceId((prev) => prev || (list[0] ? list[0].id : null))
      return list
    } catch (e) {
      // orderBy falla si aún no hay documentos con ese campo; reintenta sin orden.
      try {
        const snap = await getDocs(collection(db, 'invoices'))
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
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

  const cargarClaims = useCallback(async (invoiceId) => {
    if (!invoiceId) {
      setClaims([])
      return
    }
    const snap = await getDocs(query(collection(db, 'claims'), where('invoiceId', '==', invoiceId)))
    setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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

  // recargar claims al cambiar de factura
  useEffect(() => {
    cargarClaims(selectedInvoiceId).catch((e) => setError('Error cargando claims: ' + e.message))
  }, [selectedInvoiceId, cargarClaims])

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) || null

  const value = {
    invoices,
    drivers,
    claims,
    selectedInvoice,
    selectedInvoiceId,
    setSelectedInvoiceId,
    selectedCity,
    setSelectedCity,
    cargando,
    error,
    reloadInvoices: cargarInvoices,
    reloadDrivers: cargarDrivers,
    reloadClaims: () => cargarClaims(selectedInvoiceId),
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
