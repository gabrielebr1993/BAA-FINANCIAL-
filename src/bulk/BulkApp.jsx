import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { BulkAuthProvider, useBulkAuth } from './BulkAuthContext'
import BulkLogin from './BulkLogin'
import BulkLayout from './BulkLayout'
import { puedeVer } from './nav'
import { Cargando } from '../components/ui'

const BulkDashboard = lazy(() => import('./pages/BulkDashboard'))
const Ordenes = lazy(() => import('./pages/Ordenes'))
const MapaVivo = lazy(() => import('./pages/MapaVivo'))
const Geocercas = lazy(() => import('./pages/Geocercas'))
const Tarifas = lazy(() => import('./pages/Tarifas'))
const Facturacion = lazy(() => import('./pages/Facturacion'))
const Incidencias = lazy(() => import('./pages/Incidencias'))
const Documentos = lazy(() => import('./pages/Documentos'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Transportistas = lazy(() => import('./pages/Transportistas'))
const Materiales = lazy(() => import('./pages/Materiales'))
const Equipos = lazy(() => import('./pages/Equipos'))
const BulkUsuarios = lazy(() => import('./pages/BulkUsuarios'))
const ModoTest = lazy(() => import('./pages/ModoTest'))
const ChoferPortal = lazy(() => import('./portals/ChoferPortal'))
const ClientePortal = lazy(() => import('./portals/ClientePortal'))
const TransportistaPortal = lazy(() => import('./portals/TransportistaPortal'))
const SupervisorPortal = lazy(() => import('./portals/SupervisorPortal'))

// Cada rol operativo entra a SU propio portal (no al panel de staff).
const PORTALES = {
  chofer: ChoferPortal,
  cliente: ClientePortal,
  transportista: TransportistaPortal,
  supervisor_planta: SupervisorPortal,
}

// Envuelve una página con verificación de rol + layout de Bulk.
function P({ roles, children }) {
  const { rol } = useBulkAuth()
  if (roles && !puedeVer(rol, roles)) return <BulkLayout><div className="p-6 text-slate-400">No tienes acceso a esta sección.</div></BulkLayout>
  return <BulkLayout><Suspense fallback={<Cargando texto="Cargando…" />}>{children}</Suspense></BulkLayout>
}

function Interno() {
  const { usuario, cargando, rol } = useBulkAuth()
  if (cargando) return <div className="grid min-h-screen place-items-center bg-slate-950"><Cargando texto="Cargando Freight…" /></div>
  if (!usuario) return <BulkLogin />
  // Roles operativos → su portal dedicado (móvil / cliente / transportista / supervisor).
  const Portal = PORTALES[rol]
  if (Portal) return <Suspense fallback={<Cargando texto="Cargando…" />}><Portal /></Suspense>
  const R = ['super_admin', 'admin', 'dispatcher']
  const CAT = ['super_admin', 'admin']
  return (
    <Routes>
      <Route path="/bulk" element={<P roles={R}><BulkDashboard /></P>} />
      <Route path="/bulk/ordenes" element={<P roles={R}><Ordenes /></P>} />
      <Route path="/bulk/mapa" element={<P roles={R}><MapaVivo /></P>} />
      <Route path="/bulk/geocercas" element={<P roles={CAT}><Geocercas /></P>} />
      <Route path="/bulk/tarifas" element={<P roles={CAT}><Tarifas /></P>} />
      <Route path="/bulk/facturacion" element={<P roles={CAT}><Facturacion /></P>} />
      <Route path="/bulk/incidencias" element={<P roles={R}><Incidencias /></P>} />
      <Route path="/bulk/documentos" element={<P roles={CAT}><Documentos /></P>} />
      <Route path="/bulk/jobs" element={<P roles={R}><Jobs /></P>} />
      <Route path="/bulk/clientes" element={<P roles={R}><Clientes /></P>} />
      <Route path="/bulk/transportistas" element={<P roles={R}><Transportistas /></P>} />
      <Route path="/bulk/materiales" element={<P roles={CAT}><Materiales /></P>} />
      <Route path="/bulk/equipos" element={<P roles={CAT}><Equipos /></P>} />
      <Route path="/bulk/usuarios" element={<P roles={CAT}><BulkUsuarios /></P>} />
      <Route path="/bulk/demo" element={<P roles={CAT}><ModoTest /></P>} />
      <Route path="/bulk/*" element={<Navigate to="/bulk" replace />} />
    </Routes>
  )
}

export default function BulkApp() {
  return (
    <BulkAuthProvider>
      <Interno />
    </BulkAuthProvider>
  )
}
