import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { AuthProvider, useAuth } from './AuthContext'
import { db } from './firebase'
import { useInactividad } from './hooks/useInactividad'
import { logoutAplicable } from './data/sesiones'
import { ThemeProvider } from './ThemeContext'
import { LangProvider } from './i18n'
import { DataProvider } from './DataContext'
import ProtectedRoute from './ProtectedRoute'
import Layout from './components/Layout'
import { Cargando } from './components/ui'
import ModuleSelector, { getModulo } from './ModuleSelector'

// Módulo Bulk: producto independiente (auth, datos y rutas propios). Vive bajo /bulk.
const BulkApp = lazy(() => import('./bulk/BulkApp'))
// Landing PÚBLICA de Freight (marketing, sin autenticación). Se muestra en la raíz a
// los visitantes que aún no han elegido módulo (clientes potenciales).
const LandingFreight = lazy(() => import('./pages/LandingFreight'))

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
const Auditorias = lazy(() => import('./pages/Auditorias'))
const Simulador = lazy(() => import('./pages/Simulador'))
const Empresas = lazy(() => import('./pages/Empresas'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Backups = lazy(() => import('./pages/Backups'))
const Stripe = lazy(() => import('./pages/Stripe'))
const ManagerPerfil = lazy(() => import('./pages/ManagerPerfil'))
const Jarvis = lazy(() => import('./pages/Jarvis'))
const PanelControl = lazy(() => import('./pages/PanelControl'))
const DriverPortal = lazy(() => import('./pages/DriverPortal'))
const RegistroPublico = lazy(() => import('./pages/RegistroPublico'))

// Envuelve una página con verificación de permiso + layout de sidebar.
function Page({ filtro, soloSuperAdmin, roles, children }) {
  return (
    <ProtectedRoute filtro={filtro} soloSuperAdmin={soloSuperAdmin} roles={roles}>
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

// Guarda de sesión (Package): cierra por inactividad (10 min) y obedece la señal
// de cierre forzado que emite el dueño en authSignals/{companyId}.
function SesionGuard() {
  const { user, companyId, cerrarSesion } = useAuth()
  useInactividad(cerrarSesion, { minutos: 10, activo: !!user })
  const inicio = useRef(Date.now())
  useEffect(() => {
    if (!companyId || !user) return
    const unsub = onSnapshot(doc(db, 'authSignals', companyId), (s) => {
      const sig = s.exists() ? s.data() : null
      if (logoutAplicable(sig, user.uid) > inicio.current) cerrarSesion()
    }, () => { /* sin permiso/sin doc: ignorar */ })
    return unsub
  }, [companyId, user, cerrarSesion])
  return null
}

// Package (MyPay): EXACTAMENTE el sistema actual — mismos providers y mismas rutas.
// No cambia nada de su funcionamiento; solo se anida bajo el router de arriba.
function PackageApp() {
  return (
    <AuthProvider>
      <DataProvider>
            <SesionGuard />
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
              <Route path="/managers/:id" element={<Page filtro="gestionarChoferes"><ManagerPerfil /></Page>} />
              <Route path="/choferes/:nombre" element={<Page filtro="verDashboard"><PerfilChofer /></Page>} />
              <Route path="/tracking/:waybill" element={<Page filtro="verDashboard"><TrackingFicha /></Page>} />
              <Route path="/pagos" element={<Page filtro="verPagos"><Pagos /></Page>} />
              <Route path="/rutas" element={<Page filtro="verDashboard"><Rutas /></Page>} />
              <Route path="/rutas/:ruta" element={<Page filtro="verDashboard"><RutaFicha /></Page>} />
              <Route path="/performance" element={<Page filtro="verDashboard"><Performance /></Page>} />
              <Route path="/alertas" element={<Page filtro="verDashboard"><Alertas /></Page>} />
              <Route path="/comparar" element={<Page filtro="verDashboard"><Comparar /></Page>} />
              <Route path="/auditorias" element={<Page filtro="verFinanzas"><Auditorias /></Page>} />
              <Route path="/proyeccion" element={<Page roles={['owner']}><Simulador /></Page>} />
              <Route path="/empresas" element={<Page soloSuperAdmin><Empresas /></Page>} />
              <Route path="/usuarios" element={<Page filtro="gestionarUsuarios"><Usuarios /></Page>} />
              <Route path="/backups" element={<Page filtro="gestionarConfiguracion"><Backups /></Page>} />
              <Route path="/stripe" element={<Page filtro="gestionarConfiguracion"><Stripe /></Page>} />
              <Route path="/ia/jarvis" element={<Page roles={['owner', 'admin']}><Jarvis /></Page>} />
              <Route path="/ia/panel" element={<Page soloSuperAdmin><PanelControl /></Page>} />
              <Route path="*" element={<Page filtro="verDashboard"><Dashboard /></Page>} />
            </Routes>
      </DataProvider>
    </AuthProvider>
  )
}

// Ramifica en el nivel más alto por la URL: /bulk → módulo Bulk (independiente);
// /elegir o primera visita sin elección → selector; el resto → Package (intacto).
function TopBranch() {
  const { pathname } = useLocation()
  if (pathname === '/bulk' || pathname.startsWith('/bulk/')) {
    return <Suspense fallback={<Cargando texto="Cargando Freight…" />}><BulkApp /></Suspense>
  }
  // Selección de módulo / login: en /elegir (a donde llevan los botones de la landing).
  if (pathname === '/elegir') return <ModuleSelector />
  // Landing PÚBLICA de marketing:
  //  - /inicio → SIEMPRE la landing (link compartible; se ve aunque ya tengas sesión).
  //  - / → la landing solo para visitantes NUEVOS (sin módulo elegido). Quien ya eligió
  //    módulo entra a su app en / exactamente como hoy (nada cambia para ellos).
  if (pathname === '/inicio' || (!getModulo() && pathname === '/')) {
    return <Suspense fallback={<Cargando texto="Cargando…" />}><LandingFreight /></Suspense>
  }
  return <PackageApp />
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <BrowserRouter>
          <TopBranch />
        </BrowserRouter>
      </LangProvider>
    </ThemeProvider>
  )
}
