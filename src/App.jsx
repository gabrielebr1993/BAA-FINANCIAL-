import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import { DataProvider } from './DataContext'
import ProtectedRoute from './ProtectedRoute'
import Layout from './components/Layout'
import { Cargando } from './components/ui'

// Páginas cargadas bajo demanda (code-splitting por ruta): cada una es su propio
// chunk, así el arranque solo descarga lo imprescindible y cada pantalla se baja
// al visitarla. El portal del chofer nunca descarga el código de administración.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CargarFactura = lazy(() => import('./pages/CargarFactura'))
const Facturas = lazy(() => import('./pages/Facturas'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Financiero = lazy(() => import('./pages/Financiero'))
const ReclamosGofo = lazy(() => import('./pages/ReclamosGofo'))
const Claims = lazy(() => import('./pages/Claims'))
const Choferes = lazy(() => import('./pages/Choferes'))
const PerfilChofer = lazy(() => import('./pages/PerfilChofer'))
const TrackingFicha = lazy(() => import('./pages/TrackingFicha'))
const Pagos = lazy(() => import('./pages/Pagos'))
const Rutas = lazy(() => import('./pages/Rutas'))
const RutaFicha = lazy(() => import('./pages/RutaFicha'))
const Performance = lazy(() => import('./pages/Performance'))
const Alertas = lazy(() => import('./pages/Alertas'))
const Comparar = lazy(() => import('./pages/Comparar'))
const Empresas = lazy(() => import('./pages/Empresas'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Backups = lazy(() => import('./pages/Backups'))
const Stripe = lazy(() => import('./pages/Stripe'))
const DriverPortal = lazy(() => import('./pages/DriverPortal'))

// Envuelve una página con verificación de permiso + layout de sidebar.
function Page({ filtro, soloSuperAdmin, children }) {
  return (
    <ProtectedRoute filtro={filtro} soloSuperAdmin={soloSuperAdmin}>
      <Layout>
        <Suspense fallback={<Cargando texto="Cargando…" />}>{children}</Suspense>
      </Layout>
    </ProtectedRoute>
  )
}

// Portal del chofer: sin el layout normal (chrome de la app), solo lo suyo.
function PortalPage({ children }) {
  return (
    <ProtectedRoute soloDriver>
      <Suspense fallback={<Cargando texto="Cargando tu portal…" />}>{children}</Suspense>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/portal" element={<PortalPage><DriverPortal /></PortalPage>} />
              <Route path="/" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
              <Route path="/facturas" element={<Page filtro="subirFacturas"><CargarFactura /></Page>} />
            <Route path="/historial" element={<Page filtro="subirFacturas"><Facturas /></Page>} />
            <Route path="/configuracion" element={<Page filtro="gestionarConfiguracion"><Configuracion /></Page>} />
              <Route path="/financiero" element={<Page filtro="verFinanzas"><Financiero /></Page>} />
              <Route path="/reclamos" element={<Page filtro="verFinanzas"><ReclamosGofo /></Page>} />
              <Route path="/claims" element={<Page filtro="verClaims"><Claims /></Page>} />
              <Route path="/choferes" element={<Page filtro="gestionarChoferes"><Choferes /></Page>} />
              <Route path="/choferes/:nombre" element={<Page filtro="verDashboard"><PerfilChofer /></Page>} />
              <Route path="/tracking/:waybill" element={<Page filtro="verDashboard"><TrackingFicha /></Page>} />
              <Route path="/pagos" element={<Page filtro="verPagos"><Pagos /></Page>} />
              <Route path="/rutas" element={<Page filtro="verDashboard"><Rutas /></Page>} />
              <Route path="/rutas/:ruta" element={<Page filtro="verDashboard"><RutaFicha /></Page>} />
              <Route path="/performance" element={<Page filtro="verDashboard"><Performance /></Page>} />
              <Route path="/alertas" element={<Page filtro="verDashboard"><Alertas /></Page>} />
              <Route path="/comparar" element={<Page filtro="verDashboard"><Comparar /></Page>} />
              <Route path="/empresas" element={<Page soloSuperAdmin><Empresas /></Page>} />
              <Route path="/usuarios" element={<Page filtro="gestionarUsuarios"><Usuarios /></Page>} />
              <Route path="/backups" element={<Page filtro="gestionarConfiguracion"><Backups /></Page>} />
              <Route path="/stripe" element={<Page filtro="gestionarConfiguracion"><Stripe /></Page>} />
              <Route path="*" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
            </Routes>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
