import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import { DataProvider } from './DataContext'
import ProtectedRoute from './ProtectedRoute'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CargarFactura from './pages/CargarFactura'
import Facturas from './pages/Facturas'
import Configuracion from './pages/Configuracion'
import Financiero from './pages/Financiero'
import ReclamosGofo from './pages/ReclamosGofo'
import Claims from './pages/Claims'
import Choferes from './pages/Choferes'
import PerfilChofer from './pages/PerfilChofer'
import TrackingFicha from './pages/TrackingFicha'
import Pagos from './pages/Pagos'
import Rutas from './pages/Rutas'
import RutaFicha from './pages/RutaFicha'
import Performance from './pages/Performance'
import Alertas from './pages/Alertas'
import Comparar from './pages/Comparar'
import Empresas from './pages/Empresas'
import Usuarios from './pages/Usuarios'
import DriverPortal from './pages/DriverPortal'

// Envuelve una página con verificación de permiso + layout de sidebar.
function Page({ filtro, soloSuperAdmin, children }) {
  return (
    <ProtectedRoute filtro={filtro} soloSuperAdmin={soloSuperAdmin}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

// Portal del chofer: sin el layout normal (chrome de la app), solo lo suyo.
function PortalPage({ children }) {
  return <ProtectedRoute soloDriver>{children}</ProtectedRoute>
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
            <Route path="/configuracion" element={<Page filtro="gestionarUsuarios"><Configuracion /></Page>} />
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
              <Route path="*" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
            </Routes>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
