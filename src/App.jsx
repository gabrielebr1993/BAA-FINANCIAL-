import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import ProtectedRoute from './ProtectedRoute'

function Navbar() {
  const { perfil, cerrarSesion, puede } = useAuth()
  if (!perfil) return null
  return (
    <nav style={{ display: 'flex', gap: 16, padding: 12, background: '#13233f', color: '#fff', alignItems: 'center' }}>
      {puede('verDashboard') && <Link to="/" style={{ color: '#fff' }}>Dashboard</Link>}
      {puede('subirFacturas') && <Link to="/facturas" style={{ color: '#fff' }}>Facturas</Link>}
      {puede('verPagos') && <Link to="/pagos" style={{ color: '#fff' }}>Pagos</Link>}
      {puede('gestionarUsuarios') && <Link to="/usuarios" style={{ color: '#fff' }}>Usuarios</Link>}
      <span style={{ marginLeft: 'auto' }}>
        {perfil.nombre} · <button onClick={cerrarSesion}>Salir</button>
      </span>
    </nav>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<ProtectedRoute filtro="verDashboard"><h1 style={{padding:24}}>Dashboard (próximamente)</h1></ProtectedRoute>} />
          <Route path="/facturas" element={<ProtectedRoute filtro="subirFacturas"><h1 style={{padding:24}}>Cargar factura (Fase 2)</h1></ProtectedRoute>} />
          <Route path="/pagos" element={<ProtectedRoute filtro="verPagos"><h1 style={{padding:24}}>Pagos a choferes (Fase 3)</h1></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute filtro="gestionarUsuarios"><h1 style={{padding:24}}>Gestión de usuarios (Fase 1)</h1></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
