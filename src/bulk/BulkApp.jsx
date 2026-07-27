import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { BulkAuthProvider, useBulkAuth } from './BulkAuthContext'
import BulkLogin from './BulkLogin'
import BulkLayout from './BulkLayout'
import { puedeVer } from './nav'
import { Cargando } from '../components/ui'

const BulkDashboard = lazy(() => import('./pages/BulkDashboard'))
const Ordenes = lazy(() => import('./pages/Ordenes'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Transportistas = lazy(() => import('./pages/Transportistas'))
const Materiales = lazy(() => import('./pages/Materiales'))
const Equipos = lazy(() => import('./pages/Equipos'))
const BulkUsuarios = lazy(() => import('./pages/BulkUsuarios'))

// Envuelve una página con verificación de rol + layout de Bulk.
function P({ roles, children }) {
  const { rol } = useBulkAuth()
  if (roles && !puedeVer(rol, roles)) return <BulkLayout><div className="p-6 text-slate-400">No tienes acceso a esta sección.</div></BulkLayout>
  return <BulkLayout><Suspense fallback={<Cargando texto="Cargando…" />}>{children}</Suspense></BulkLayout>
}

function Interno() {
  const { usuario, cargando } = useBulkAuth()
  if (cargando) return <div className="grid min-h-screen place-items-center bg-slate-950"><Cargando texto="Cargando Bulk…" /></div>
  if (!usuario) return <BulkLogin />
  const R = ['super_admin', 'admin', 'dispatcher']
  const CAT = ['super_admin', 'admin']
  return (
    <Routes>
      <Route path="/bulk" element={<P roles={R}><BulkDashboard /></P>} />
      <Route path="/bulk/ordenes" element={<P roles={R}><Ordenes /></P>} />
      <Route path="/bulk/jobs" element={<P roles={R}><Jobs /></P>} />
      <Route path="/bulk/clientes" element={<P roles={R}><Clientes /></P>} />
      <Route path="/bulk/transportistas" element={<P roles={R}><Transportistas /></P>} />
      <Route path="/bulk/materiales" element={<P roles={CAT}><Materiales /></P>} />
      <Route path="/bulk/equipos" element={<P roles={CAT}><Equipos /></P>} />
      <Route path="/bulk/usuarios" element={<P roles={CAT}><BulkUsuarios /></P>} />
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
