// SITIO PÚBLICO · selector de página por URL (/asignacion, /gps, …). Vive en su
// propio chunk (lazy desde App.jsx); la página de inicio (/) NO pasa por aquí.
import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Cargando } from '../../components/ui'

const Asignacion = lazy(() => import('./Asignacion'))
const Gps = lazy(() => import('./Gps'))
const AppChofer = lazy(() => import('./AppChofer'))
const Facturacion = lazy(() => import('./FacturacionPub'))
const Roles = lazy(() => import('./RolesPub'))
const Sistema = lazy(() => import('./Sistema'))
const PorQue = lazy(() => import('./PorQue'))

export const RUTAS_PUBLICAS = ['/asignacion', '/gps', '/app-chofer', '/facturacion', '/roles', '/sistema', '/por-que-milepay']

const TITULOS = {
  '/asignacion': 'Asignación automática · MilePay Freight',
  '/gps': 'Seguimiento GPS en vivo · MilePay Freight',
  '/app-chofer': 'App del chofer · MilePay Freight',
  '/facturacion': 'Facturación y tickets · MilePay Freight',
  '/roles': 'Roles y multi-empresa · MilePay Freight',
  '/sistema': 'El sistema completo · MilePay Freight',
  '/por-que-milepay': 'Por qué MilePay · MilePay Freight',
}

export default function SitioPublico() {
  const { pathname } = useLocation()
  useEffect(() => {
    const prev = document.title
    document.title = TITULOS[pathname] || 'MilePay Freight'
    window.scrollTo(0, 0)
    return () => { document.title = prev }
  }, [pathname])
  const Pagina = {
    '/asignacion': Asignacion, '/gps': Gps, '/app-chofer': AppChofer,
    '/facturacion': Facturacion, '/roles': Roles, '/sistema': Sistema, '/por-que-milepay': PorQue,
  }[pathname] || Sistema
  return <Suspense fallback={<Cargando texto="…" />}><Pagina /></Suspense>
}
