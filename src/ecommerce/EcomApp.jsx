// ============================================================================
// ECOMMERCE · Módulo independiente de compras internacionales (EN CONSTRUCCIÓN).
//
// ACCESO PRIVADO: mientras está en construcción, SOLO el dueño (correo en
// ECOM_DUENOS, verificado contra el login real de Firebase) puede ver y usar
// el módulo. No basta ser admin/superAdmin de Package o Freight. La misma
// restricción vive en firestore.rules (colecciones ecom_*), así que ni la
// interfaz, ni la API, ni una URL directa abren el módulo a otra cuenta.
//
// Es un módulo SEPARADO (como src/bulk): no importa DataContext ni Carrier,
// no toca ninguna colección de Package/Freight, y sus colecciones llevan el
// prefijo ecom_. Todo lo que se ve hoy usa DATOS DE DEMOSTRACIÓN (demo:true);
// los interruptores de "catálogo público" y "ventas reales" existen pero
// nacen APAGADOS y las ventas reales están bloqueadas hasta que haya pasarela
// e integraciones aprobadas por el dueño.
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { esDuenoEcom, CONFIG_DEFAULT } from './datos'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, Cargando } from '../components/ui'
import { ShoppingCart, Store, Tags, PackageSearch, Wallet, LifeBuoy, Users, Plug, Settings, LayoutDashboard, LogOut, ArrowLeft, Lock } from 'lucide-react'
import EcomCatalogo, { EcomPrecios } from './EcomCatalogo'
import EcomTienda from './EcomTienda'
import { EcomPedidos, EcomCompras, EcomFinanzas, EcomTickets } from './EcomOperacion'
import { EcomEquipo, EcomIntegraciones } from './EcomEquipo'

// Auditoría del módulo: cada acción importante del dueño/equipo queda escrita.
export async function auditarEcom(accion, detalle) {
  try {
    await addDoc(collection(db, 'ecom_audit'), {
      accion, detalle: detalle || '', correo: auth.currentUser?.email || '', fecha: serverTimestamp(),
    })
  } catch { /* la auditoría nunca bloquea la operación */ }
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icono: LayoutDashboard },
  { id: 'catalogo', label: 'Catálogo', icono: Tags },
  { id: 'precios', label: 'Precios', icono: Wallet },
  { id: 'tienda', label: 'Tienda (vista previa)', icono: Store },
  { id: 'pedidos', label: 'Pedidos', icono: ShoppingCart },
  { id: 'compras', label: 'Compras a proveedor', icono: PackageSearch },
  { id: 'finanzas', label: 'Finanzas', icono: Wallet },
  { id: 'tickets', label: 'Soporte', icono: LifeBuoy },
  { id: 'equipo', label: 'Equipo y permisos', icono: Users },
  { id: 'integraciones', label: 'Integraciones', icono: Plug },
  { id: 'config', label: 'Configuración', icono: Settings },
]

export default function EcomApp() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [cargandoAuth, setCargandoAuth] = useState(true)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setCargandoAuth(false) }), [])

  if (cargandoAuth) return <div className="grid min-h-screen place-items-center bg-slate-950"><Cargando texto="Cargando Ecommerce…" /></div>
  if (!user) return <EcomLogin />
  if (!esDuenoEcom(user.email)) return <EcomPrivado onSalir={() => navigate('/elegir')} />
  return <EcomShell user={user} />
}

// ── Login propio del módulo (misma cuenta Firebase de la plataforma) ───────
function EcomLogin() {
  const navigate = useNavigate()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)
  const entrar = async (e) => {
    e.preventDefault()
    setError(''); setEntrando(true)
    try { await signInWithEmailAndPassword(auth, correo.trim(), clave) } catch { setError('Correo o contraseña incorrectos.') } finally { setEntrando(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-1 text-xl font-black text-brand-navy dark:text-slate-100">Ecommerce</div>
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-amber-600">En construcción · acceso privado</div>
        <form onSubmit={entrar} className="space-y-3">
          <Input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          <Input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton type="submit" variant="gold" disabled={entrando} className="w-full">{entrando ? <Spinner /> : 'Entrar'}</Boton>
        </form>
        <button onClick={() => navigate('/elegir')} className="mt-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ArrowLeft size={13} /> Volver al selector</button>
      </Card>
    </div>
  )
}

// ── Pantalla para cuentas que NO son el dueño ───────────────────────────────
function EcomPrivado({ onSalir }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-slate-500 dark:bg-slate-700"><Lock size={24} /></div>
        <div className="text-lg font-bold text-brand-navy dark:text-slate-100">Módulo en construcción</div>
        <p className="mt-2 text-sm text-slate-500">El módulo Ecommerce todavía no está disponible. Cuando se publique, podrás ver el catálogo y comprar desde aquí.</p>
        <Boton variant="ghost" className="mt-5" onClick={onSalir}><ArrowLeft size={15} /> Volver</Boton>
      </Card>
    </div>
  )
}

// ── Shell del módulo (solo dueño) ───────────────────────────────────────────
function EcomShell({ user }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [config, setConfig] = useState(null)
  const [guardandoCfg, setGuardandoCfg] = useState(false)
  const recargarConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'ecom_settings', 'config'))
      setConfig(snap.exists() ? { ...CONFIG_DEFAULT, ...snap.data() } : { ...CONFIG_DEFAULT })
    } catch { setConfig({ ...CONFIG_DEFAULT }) }
  }
  useEffect(() => { recargarConfig() }, [])
  const guardarConfig = async (nueva) => {
    setGuardandoCfg(true)
    try {
      await setDoc(doc(db, 'ecom_settings', 'config'), { ...nueva, actualizadoEn: serverTimestamp(), actualizadoPor: user.email }, { merge: true })
      setConfig(nueva)
      auditarEcom('config_guardada', 'Configuración del módulo actualizada')
    } finally { setGuardandoCfg(false) }
  }
  const ctx = { user, config: config || CONFIG_DEFAULT, guardarConfig, recargarConfig, guardandoCfg, auditar: auditarEcom }
  if (!config) return <div className="grid min-h-screen place-items-center bg-surface dark:bg-surface-dark"><Cargando texto="Cargando Ecommerce…" /></div>

  return (
    <div className="min-h-screen bg-surface dark:bg-surface-dark">
      {/* Barra superior del módulo */}
      <div className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5">
          <button onClick={() => navigate('/elegir')} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cambiar de módulo"><ArrowLeft size={16} /></button>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black text-brand-navy dark:text-slate-100">Ecommerce</span>
            <Badge color="gold">En construcción</Badge>
            <Badge color="slate">Privado · solo dueño</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">{user.email}</span>
            <button onClick={() => signOut(auth)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title="Cerrar sesión"><LogOut size={15} /></button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((tdef) => {
            const Icono = tdef.icono
            return (
              <button key={tdef.id} onClick={() => setTab(tdef.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${tab === tdef.id ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Icono size={14} /> {tdef.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {tab === 'resumen' && <EcomResumen ctx={ctx} irA={setTab} />}
        {tab === 'catalogo' && <EcomCatalogo ctx={ctx} />}
        {tab === 'precios' && <EcomPrecios ctx={ctx} />}
        {tab === 'tienda' && <EcomTienda ctx={ctx} />}
        {tab === 'pedidos' && <EcomPedidos ctx={ctx} />}
        {tab === 'compras' && <EcomCompras ctx={ctx} />}
        {tab === 'finanzas' && <EcomFinanzas ctx={ctx} />}
        {tab === 'tickets' && <EcomTickets ctx={ctx} />}
        {tab === 'equipo' && <EcomEquipo ctx={ctx} />}
        {tab === 'integraciones' && <EcomIntegraciones ctx={ctx} />}
        {tab === 'config' && <EcomConfig ctx={ctx} />}
      </div>
    </div>
  )
}

// ── Resumen ────────────────────────────────────────────────────────────────
function EcomResumen({ ctx, irA }) {
  const { config } = ctx
  const pasos = [
    { ok: true, texto: 'Módulo privado creado (solo tu cuenta; protegido también en Firestore)' },
    { ok: true, texto: 'Catálogo con proveedores, variantes, países y datos demo' },
    { ok: true, texto: 'Motor de precios: costos desglosados + margen + redondeo por país' },
    { ok: true, texto: 'Tienda (vista previa): buscador, carrito persistente y checkout DEMO' },
    { ok: true, texto: 'Pedidos ↔ compras a proveedor ↔ paquetes con la cadena logística de 9 pasos' },
    { ok: false, texto: 'Pasarela de pagos real (requiere contrato: Stripe/alternativa LATAM)' },
    { ok: false, texto: 'Integraciones de proveedores (ver pestaña Integraciones: qué permite cada uno)' },
    { ok: false, texto: 'Publicación del catálogo con enlace abierto (interruptor listo, apagado)' },
  ]
  return (
    <div>
      <PageTitle>Resumen del módulo</PageTitle>
      <Aviso tipo="warn" className="mb-4">
        <b>Todo lo que ves usa datos de DEMOSTRACIÓN.</b> No hay cobros, compras ni envíos reales: los interruptores de publicación y ventas viven en Configuración y nacen apagados. Nadie más que tú puede entrar a este módulo.
      </Aviso>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Catálogo público</div>
          <div className={`mt-1 text-xl font-black ${config.catalogoPublico ? 'text-emerald-600' : 'text-slate-500'}`}>{config.catalogoPublico ? 'PUBLICADO' : 'Apagado'}</div>
          <div className="mt-1 text-xs text-slate-500">Enlace abierto sin registro (control en Configuración)</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ventas reales</div>
          <div className={`mt-1 text-xl font-black ${config.ventasReales ? 'text-emerald-600' : 'text-slate-500'}`}>{config.ventasReales ? 'ACTIVAS' : 'Apagadas'}</div>
          <div className="mt-1 text-xs text-slate-500">Cobros/compras/envíos reales — separado del catálogo</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Países activos</div>
          <div className="mt-1 text-xl font-black text-brand-navy dark:text-slate-100">{(config.paises || []).filter((p) => p.activo).map((p) => p.codigo).join(' · ') || '—'}</div>
          <div className="mt-1 text-xs text-slate-500">Cobertura de entrega configurable</div>
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-3 font-bold text-brand-navy dark:text-slate-100">Estado de construcción</div>
        <ul className="space-y-2">
          {pasos.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 ${p.ok ? 'text-emerald-500' : 'text-slate-400'}`}>{p.ok ? '✓' : '○'}</span>
              <span className={p.ok ? '' : 'text-slate-500'}>{p.texto}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton variant="gold" onClick={() => irA('catalogo')}>Empezar por el catálogo</Boton>
          <Boton variant="ghost" onClick={() => irA('tienda')}>Ver la tienda como cliente</Boton>
          <Boton variant="ghost" onClick={() => irA('integraciones')}>Propuesta de integraciones</Boton>
        </div>
      </Card>
    </div>
  )
}

// ── Configuración ──────────────────────────────────────────────────────────
function EcomConfig({ ctx }) {
  const { config, guardarConfig, guardandoCfg, auditar } = ctx
  const [borrador, setBorrador] = useState(() => JSON.parse(JSON.stringify(config)))
  const [confirmaVentas, setConfirmaVentas] = useState(false)
  const set = (campo, valor) => setBorrador((b) => ({ ...b, [campo]: valor }))
  const setPais = (i, campo, valor) => setBorrador((b) => {
    const paises = b.paises.map((p, j) => (j === i ? { ...p, [campo]: valor } : p))
    return { ...b, paises }
  })
  const guardar = async () => {
    // Las ventas reales NUNCA se activan desde aquí sin su confirmación aparte.
    const limpio = { ...borrador, ventasReales: config.ventasReales }
    await guardarConfig(limpio)
  }
  const num = (v) => (v === '' ? '' : Number(v))
  return (
    <div>
      <PageTitle>Configuración</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 font-bold text-brand-navy dark:text-slate-100">Publicación (controles separados)</div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={!!borrador.catalogoPublico} onChange={(e) => set('catalogoPublico', e.target.checked)} className="mt-1" />
            <span><b>Catálogo público</b> — cualquiera con el enlace podrá VER productos sin registrarse. Para comprar siempre habrá que crear cuenta o iniciar sesión (el carrito se conserva). <i>Hoy la vista pública aún no está publicada: este interruptor queda listo para ese momento.</i></span>
          </label>
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
            <b>Ventas reales: {config.ventasReales ? 'ACTIVAS' : 'apagadas'}.</b> Activarlas requiere pasarela de pago contratada, integraciones de proveedor aprobadas y tu confirmación explícita aquí:
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={confirmaVentas} onChange={(e) => setConfirmaVentas(e.target.checked)} className="mt-1" />
              <span>Entiendo que esto habilitaría cobros y compras reales.</span>
            </label>
            <Boton variant="danger" className="mt-2" disabled={!confirmaVentas || config.ventasReales}
              onClick={async () => { await guardarConfig({ ...config, ventasReales: false }); auditar('ventas_reales_bloqueadas', 'Intento de activación: bloqueado — faltan pasarela e integraciones') }}>
              Activar ventas reales (bloqueado: faltan pasarela e integraciones)
            </Boton>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 font-bold text-brand-navy dark:text-slate-100">Precios y cotizaciones</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Margen por defecto (%)<Input type="number" step="1" value={Math.round((borrador.margenPorDefecto || 0) * 100)} onChange={(e) => set('margenPorDefecto', num(e.target.value) / 100)} /></label>
            <label>Margen mínimo (alerta %)<Input type="number" step="1" value={Math.round((borrador.margenMinimo || 0) * 100)} onChange={(e) => set('margenMinimo', num(e.target.value) / 100)} /></label>
            <label>Comisión de pago (%)<Input type="number" step="0.1" value={((borrador.comisionPagoPct || 0) * 100).toFixed(1)} onChange={(e) => set('comisionPagoPct', num(e.target.value) / 100)} /></label>
            <label>Manejo en origen (USD)<Input type="number" step="0.5" value={borrador.manejoOrigen} onChange={(e) => set('manejoOrigen', num(e.target.value))} /></label>
            <label>Redondeo
              <Select value={borrador.redondeo} onChange={(e) => set('redondeo', e.target.value)}>
                <option value="0.99">Terminar en .99</option>
                <option value="entero">Entero hacia arriba</option>
                <option value="centavos">Centavos exactos</option>
              </Select>
            </label>
            <label>Vigencia de cotización (días)<Input type="number" value={borrador.vigenciaCotizacionDias} onChange={(e) => set('vigenciaCotizacionDias', num(e.target.value))} /></label>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 font-bold text-brand-navy dark:text-slate-100">Países de destino</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="p-2">Activo</th><th className="p-2">País</th><th className="p-2">Moneda</th><th className="p-2">Tipo de cambio</th><th className="p-2">Aranceles+gestión (%)</th><th className="p-2">Entrega local (USD)</th><th className="p-2">Intl USD/kg</th>
              </tr></thead>
              <tbody>
                {(borrador.paises || []).map((p, i) => (
                  <tr key={p.codigo} className="border-t border-slate-100 dark:border-slate-700/60">
                    <td className="p-2"><input type="checkbox" checked={!!p.activo} onChange={(e) => setPais(i, 'activo', e.target.checked)} /></td>
                    <td className="p-2 font-semibold">{p.nombre} <span className="text-slate-400">({p.codigo})</span></td>
                    <td className="p-2">{p.moneda}</td>
                    <td className="p-2"><Input type="number" step="0.01" className="w-28" value={p.tc} onChange={(e) => setPais(i, 'tc', num(e.target.value))} /></td>
                    <td className="p-2"><Input type="number" step="1" className="w-24" value={Math.round((p.aranceles || 0) * 100)} onChange={(e) => setPais(i, 'aranceles', num(e.target.value) / 100)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" className="w-24" value={p.entregaLocal} onChange={(e) => setPais(i, 'entregaLocal', num(e.target.value))} /></td>
                    <td className="p-2"><Input type="number" step="0.5" className="w-24" value={p.intlKg} onChange={(e) => setPais(i, 'intlKg', num(e.target.value))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Antes de activar un país para operaciones REALES hay que verificar sus requisitos de importación y productos restringidos (ver Integraciones → Pendientes por país).</p>
        </Card>
      </div>
      <div className="mt-4">
        <Boton variant="gold" onClick={guardar} disabled={guardandoCfg}>{guardandoCfg ? <Spinner /> : 'Guardar configuración'}</Boton>
      </div>
    </div>
  )
}
