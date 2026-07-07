import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import { DataProvider } from './DataContext'
import ProtectedRoute from './ProtectedRoute'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CargarFactura from './pages/CargarFactura'
import Financiero from './pages/Financiero'
import Claims from './pages/Claims'
import Choferes from './pages/Choferes'
import Pagos from './pages/Pagos'
import Performance from './pages/Performance'
import Usuarios from './pages/Usuarios'

// Envuelve una página con verificación de permiso + layout de sidebar.
function Page({ filtro, children }) {
  return (
    <ProtectedRoute filtro={filtro}>
      <Layout>{children}</Layout>
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
              <Route path="/" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
              <Route path="/facturas" element={<Page filtro="subirFacturas"><CargarFactura /></Page>} />
              <Route path="/financiero" element={<Page filtro="verFinanzas"><Financiero /></Page>} />
              <Route path="/claims" element={<Page filtro="verClaims"><Claims /></Page>} />
              <Route path="/choferes" element={<Page filtro="gestionarChoferes"><Choferes /></Page>} />
              <Route path="/pagos" element={<Page filtro="verPagos"><Pagos /></Page>} />
              <Route path="/performance" element={<Page filtro="verDashboard"><Performance /></Page>} />
              <Route path="/usuarios" element={<Page filtro="gestionarUsuarios"><Usuarios /></Page>} />
              <Route path="*" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
            </Routes>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
