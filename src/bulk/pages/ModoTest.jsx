import { useState } from 'react'
import { FlaskConical, Loader2, Trash2, Truck, Building2, PackageCheck, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { sembrarDemo, borrarDemo, hayDemo, datosVinculoDemo, prepararChoferDemo } from '../data/demo'
import { PageTitle, Card, Boton, Aviso } from '../../components/ui'

const PASS = 'testtest'
// Un portal por rol, cada uno con su propia cuenta fija (todas con la misma clave).
const PORTALES = [
  { rol: 'chofer', label: 'Chofer', email: 'chofer@test.com', icon: Truck, desc: 'App móvil: aceptar, cargar, entregar' },
  { rol: 'cliente', label: 'Cliente', email: 'cliente@test.com', icon: Building2, desc: 'Sus órdenes y facturas' },
  { rol: 'transportista', label: 'Transportista', email: 'transportista@test.com', icon: PackageCheck, desc: 'Sus órdenes y choferes' },
  { rol: 'supervisor_planta', label: 'Supervisor', email: 'supervisor@test.com', icon: ShieldCheck, desc: 'Liberar cargas en planta' },
]

export default function ModoTest() {
  const { tenantId, crearUsuario, iniciarSesion, repararPermisos } = useBulkAuth()
  const { datos: ordenes } = useColeccion('orders')

  const [fase, setFase] = useState('idle') // idle | sembrando | borrando
  const [entrando, setEntrando] = useState(null) // rol en proceso
  const [refrescando, setRefrescando] = useState(false)
  const [msg, setMsg] = useState(null)

  const ocupado = fase !== 'idle' || !!entrando
  const demoOrdenes = ordenes.filter((o) => o.demo).length

  // Auto-repara y refresca los permisos antes de leer/escribir.
  const asegurarToken = async () => { try { await repararPermisos() } catch { /* noop */ } }
  const esPermiso = (m) => /permission|denied|insufficient|no autorizado/i.test(m || '')

  // Repara permisos y recarga (sin tener que salir y volver a entrar).
  const refrescarSesion = async () => {
    setRefrescando(true)
    await asegurarToken()
    window.location.reload()
  }

  const activar = async () => {
    setMsg(null)
    await asegurarToken()
    try {
      const yaHay = await hayDemo(tenantId)
      if (yaHay > 0 && !window.confirm('Ya hay datos de prueba. ¿Cargar otro paquete encima?')) return
      setFase('sembrando')
      await sembrarDemo(tenantId)
      setMsg({ tipo: 'ok', txt: '¡Listo! Ya puedes recorrer el menú (Dashboard, Órdenes, Mapa en vivo, Facturación…) y verlo todo funcionando.' })
    } catch (e) {
      const m = e?.message || ''
      setMsg({ tipo: 'error', txt: esPermiso(m) ? 'Tu sesión trae permisos viejos. Toca “Actualizar sesión” (abajo) y vuelve a intentarlo.' : 'No se pudo cargar: ' + m })
    } finally { setFase('idle') }
  }

  const borrar = async () => {
    if (!window.confirm('Se borran solo los datos de prueba; tus datos reales no se tocan. ¿Continuar?')) return
    setFase('borrando'); setMsg(null)
    await asegurarToken()
    try {
      const n = await borrarDemo(tenantId)
      setMsg({ tipo: 'ok', txt: `Listo. Se borraron ${n} registros de prueba.` })
    } catch (e) {
      const m = e?.message || ''
      setMsg({ tipo: 'error', txt: esPermiso(m) ? 'Tu sesión trae permisos viejos. Toca “Actualizar sesión” (abajo) y vuelve a intentarlo.' : 'No se pudo borrar: ' + m })
    } finally { setFase('idle') }
  }

  // Un toque: prepara la cuenta del portal (si hace falta) y entra directo a esa vista.
  const entrarA = async (p) => {
    setEntrando(p.rol); setMsg(null)
    try {
      await asegurarToken()
      if (demoOrdenes === 0) await sembrarDemo(tenantId)
      const vinc = await datosVinculoDemo(tenantId, p.rol)
      try {
        const r = await crearUsuario({ nombre: `Prueba ${p.label}`, email: p.email, password: PASS, rol: p.rol, clienteId: vinc.clienteId, carrierId: vinc.carrierId })
        if (p.rol === 'chofer') await prepararChoferDemo(tenantId, r.uid, `Prueba ${p.label}`, vinc.carrierId)
      } catch { /* ya existe: seguimos a iniciar sesión */ }
      await iniciarSesion(p.email, PASS) // cambia de sesión → abre ese portal
    } catch (e) {
      const m = e?.message || ''
      const txt = /no autorizado|permission|denied/i.test(m)
        ? 'Tu sesión trae permisos viejos. Toca “Actualizar sesión” aquí abajo y vuelve a intentarlo.'
        : 'No se pudo abrir el portal: ' + m
      setMsg({ tipo: 'error', txt })
      setEntrando(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Modo test</PageTitle>

      <Card className="mb-4 p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={26} /></div>
        <h3 className="mx-auto mt-3 max-w-md text-lg font-bold text-brand-navy dark:text-slate-100">Ver el sistema funcionando</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Un solo toque llena todo con datos de ejemplo. Luego recorre el menú. No afecta tus datos reales.
        </p>
        <div className="mt-5">
          <Boton variant="gold" onClick={activar} disabled={ocupado} className="px-6 py-2.5 text-base">
            {fase === 'sembrando' ? <><Loader2 size={18} className="animate-spin" /> Cargando…</> : <><FlaskConical size={18} /> Activar modo test</>}
          </Boton>
        </div>
        {demoOrdenes > 0 && (
          <button onClick={borrar} disabled={ocupado} className="mx-auto mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 disabled:opacity-50">
            <Trash2 size={13} /> Borrar datos de prueba ({demoOrdenes} órdenes)
          </button>
        )}
        {msg && <Aviso tipo={msg.tipo} className="mt-4 text-left">{msg.txt}</Aviso>}
      </Card>

      {/* Portales por rol: un toque entra directo (opcional) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">Ver los portales por rol</h3>
          <button onClick={refrescarSesion} disabled={refrescando} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {refrescando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualizar sesión
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Un toque te abre esa vista. Para volver a tu cuenta, toca <b>Salir</b> y entra con tu correo de siempre. Si algún portal dice “sin permisos”, toca <b>Actualizar sesión</b>.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PORTALES.map((p) => (
            <button key={p.rol} onClick={() => entrarA(p)} disabled={ocupado}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-amber-400 hover:bg-amber-500/5 disabled:opacity-50 dark:border-slate-700">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-brand-navy dark:bg-slate-800 dark:text-amber-400">
                {entrando === p.rol ? <Loader2 size={18} className="animate-spin" /> : <p.icon size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{p.label}</div>
                <div className="truncate text-xs text-slate-400">{p.desc}</div>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
