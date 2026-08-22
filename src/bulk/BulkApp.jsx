import { lazy, Suspense, useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { BulkAuthProvider, useBulkAuth } from './BulkAuthContext'
import { useColeccion } from './data/useColeccion'
import { logoutAplicable } from './data/sesiones'
import { useInactividad } from '../hooks/useInactividad'
import { activarPush } from './integraciones/fcm'
import BulkLogin from './BulkLogin'
import BulkLayout from './BulkLayout'
import LlamadaProvider from './components/LlamadaProvider'
import { puedeVer } from './nav'
import { Cargando } from '../components/ui'
const BulkRoles = lazy(() => import('./pages/BulkRoles'))
const BulkDiagnostico = lazy(() => import('./pages/BulkDiagnostico'))
import { useLang } from '../i18n'

const BulkDashboard = lazy(() => import('./pages/BulkDashboard'))
const Ordenes = lazy(() => import('./pages/Ordenes'))
const OrdenDetalle = lazy(() => import('./pages/OrdenDetalle'))
const MapaVivo = lazy(() => import('./pages/MapaVivo'))
const Mensajes = lazy(() => import('./pages/Mensajes'))
const Geocercas = lazy(() => import('./pages/Geocercas'))
const Facturacion = lazy(() => import('./pages/Facturacion'))
const Incidencias = lazy(() => import('./pages/Incidencias'))
const Documentos = lazy(() => import('./pages/Documentos'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Clientes = lazy(() => import('./pages/Clientes'))
const ClientePerfil = lazy(() => import('./pages/ClientePerfil'))
const Transportistas = lazy(() => import('./pages/Transportistas'))
const TransportistaPerfil = lazy(() => import('./pages/TransportistaPerfil'))
const GestionChoferes = lazy(() => import('./pages/GestionChoferes'))
const ChoferPerfil = lazy(() => import('./pages/ChoferPerfil'))
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

// Envuelve una página con verificación de PERMISO (RBAC) + layout de Bulk.
//   perm  = clave de permiso requerida (p. ej. 'ordenes.ver'). Es el gate real.
//   roles = respaldo por rol (compat) para rutas sin `perm`.
function P({ perm, roles, children }) {
  const { t } = useLang()
  const { rol, puede } = useBulkAuth()
  const permitido = perm ? puede(perm) : (!roles || puedeVer(rol, roles))
  if (!permitido) return <BulkLayout><div className="p-6 text-slate-400">{t('No tienes acceso a esta sección.')}</div></BulkLayout>
  return <BulkLayout><Suspense fallback={<Cargando texto={t('Cargando…')} />}>{children}</Suspense></BulkLayout>
}

// Vigila la señal de cierre de sesión forzado: si el admin la emite y aplica a
// este usuario (por todos/rol/uid) después de que inició su sesión, cierra sesión.
function ForceLogoutWatcher() {
  const { usuario, rol, cerrarSesion } = useBulkAuth()
  const { datos: signals } = useColeccion('signals')
  const inicio = useRef(Date.now())
  // Cierre por inactividad (30 min) — EXCEPTO el chofer: si está en línea esperando
  // cargas con el teléfono quieto, no queremos sacarlo (saldría de la cola). El
  // cierre forzado por el admin (abajo) sí le aplica igual.
  useInactividad(cerrarSesion, { minutos: 30, activo: !!usuario && rol !== 'chofer' })
  useEffect(() => {
    const sig = signals.find((s) => s.id === 'logout')
    if (logoutAplicable(sig, rol, usuario?.id) > inicio.current) cerrarSesion()
  }, [signals, rol, usuario, cerrarSesion])
  return null
}

// Registra el token de push (FCM) al iniciar sesión, con la audiencia del usuario.
function PushSetup() {
  const { usuario, tenantId, rol } = useBulkAuth()
  useEffect(() => {
    if (usuario?.id) activarPush({ tenantId, uid: usuario.id, rol, carrierId: usuario.carrierId, clienteId: usuario.clienteId, nombre: usuario.nombre })
  }, [usuario?.id, tenantId, rol])
  return null
}

function Interno() {
  const { t } = useLang()
  const { usuario, cargando, rol } = useBulkAuth()
  if (cargando) return <div className="grid min-h-screen place-items-center bg-slate-950"><Cargando texto={t('Cargando Freight…')} /></div>
  if (!usuario) return <BulkLogin />
  // Roles operativos → su portal dedicado (móvil / cliente / transportista / supervisor).
  const Portal = PORTALES[rol]
  if (Portal) return <><PushSetup /><ForceLogoutWatcher /><Suspense fallback={<Cargando texto={t('Cargando…')} />}><Portal /></Suspense></>
  return (
    <>
    <PushSetup />
    <ForceLogoutWatcher />
    <Routes>
      <Route path="/bulk" element={<P perm="dashboard.ver"><BulkDashboard /></P>} />
      <Route path="/bulk/ordenes" element={<P perm="ordenes.ver"><Ordenes /></P>} />
      <Route path="/bulk/ordenes/:id" element={<P perm="ordenes.ver"><OrdenDetalle /></P>} />
      <Route path="/bulk/mapa" element={<P perm="mapa.ver"><MapaVivo /></P>} />
      <Route path="/bulk/mensajes" element={<P perm="mensajes.ver"><Mensajes /></P>} />
      <Route path="/bulk/geocercas" element={<P perm="geocercas.ver"><Geocercas /></P>} />
      {/* Motor de tarifas retirado: ahora vive en el perfil de cada cliente. */}
      <Route path="/bulk/tarifas" element={<Navigate to="/bulk/clientes" replace />} />
      <Route path="/bulk/facturacion" element={<P perm="facturacion.ver"><Facturacion /></P>} />
      <Route path="/bulk/incidencias" element={<P perm="incidencias.ver"><Incidencias /></P>} />
      <Route path="/bulk/documentos" element={<P perm="documentos.ver"><Documentos /></P>} />
      <Route path="/bulk/jobs" element={<P perm="jobs.ver"><Jobs /></P>} />
      <Route path="/bulk/clientes" element={<P perm="clientes.ver"><Clientes /></P>} />
      <Route path="/bulk/cliente/:id" element={<P perm="clientes.ver"><ClientePerfil /></P>} />
      <Route path="/bulk/transportistas" element={<P perm="transportistas.ver"><Transportistas /></P>} />
      <Route path="/bulk/transportistas/:id" element={<P perm="transportistas.ver"><TransportistaPerfil /></P>} />
      <Route path="/bulk/choferes" element={<P perm="choferes.ver"><GestionChoferes /></P>} />
      <Route path="/bulk/chofer/:nombre" element={<P perm="choferes.ver"><ChoferPerfil /></P>} />
      <Route path="/bulk/materiales" element={<P perm="materiales.ver"><Materiales /></P>} />
      <Route path="/bulk/equipos" element={<P perm="equipos.ver"><Equipos /></P>} />
      <Route path="/bulk/usuarios" element={<P perm="usuarios.ver"><BulkUsuarios /></P>} />
      <Route path="/bulk/roles" element={<P perm="roles.gestionar"><BulkRoles /></P>} />
      <Route path="/bulk/diagnostico" element={<P perm="diagnostico.ver"><BulkDiagnostico /></P>} />
      <Route path="/bulk/demo" element={<P perm="demo.ver"><ModoTest /></P>} />
      <Route path="/bulk/*" element={<Navigate to="/bulk" replace />} />
    </Routes>
    </>
  )
}

export default function BulkApp() {
  return (
    <BulkAuthProvider>
      <LlamadaProvider>
        <Interno />
      </LlamadaProvider>
    </BulkAuthProvider>
  )
}
