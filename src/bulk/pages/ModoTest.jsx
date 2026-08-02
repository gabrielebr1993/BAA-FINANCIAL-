import { useState } from 'react'
import { FlaskConical, Loader2, Trash2, Truck, Building2, PackageCheck, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { sembrarDemo, borrarDemo, hayDemo, datosVinculoDemo, prepararChoferDemo } from '../data/demo'
import { sincronizarPagoCliente, sincronizarPagoAsignacion } from '../data/ordenPagos'
import { crear, eliminar } from '../data/repo'
import { PageTitle, Card, Boton, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

const PASS = 'testtest'
// Un portal por rol, cada uno con su propia cuenta fija (todas con la misma clave).
const PORTALES = [
  { rol: 'chofer', label: 'Chofer', email: 'chofer@test.com', icon: Truck, desc: 'App móvil: aceptar, cargar, entregar' },
  { rol: 'cliente', label: 'Cliente', email: 'cliente@test.com', icon: Building2, desc: 'Sus órdenes y facturas' },
  { rol: 'transportista', label: 'Transportista', email: 'transportista@test.com', icon: PackageCheck, desc: 'Sus órdenes y choferes' },
  { rol: 'supervisor_planta', label: 'Supervisor', email: 'supervisor@test.com', icon: ShieldCheck, desc: 'Liberar cargas en planta' },
]

export default function ModoTest() {
  const { t } = useLang()
  const { usuario, tenantId, rol, crearUsuario, iniciarSesion, repararPermisos } = useBulkAuth()
  const { datos: ordenes } = useColeccion('orders')

  const [fase, setFase] = useState('idle') // idle | sembrando | borrando
  const [entrando, setEntrando] = useState(null) // rol en proceso
  const [refrescando, setRefrescando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [prueba, setPrueba] = useState(null)
  const [migrando, setMigrando] = useState(null) // { hechas, total } | null

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

  // Prueba de escritura: crea (y borra) UN material para revelar el error exacto.
  const probar = async () => {
    setPrueba({ estado: 'probando' })
    try {
      await asegurarToken()
      const r = await crear('materials', tenantId, { nombre: '__diagnostico__', demo: true, activo: true })
      try { await eliminar('materials', r.id) } catch { /* noop */ }
      setPrueba({ estado: 'ok' })
    } catch (e) {
      setPrueba({ estado: 'error', code: e?.code || '(sin code)', msg: e?.message || String(e) })
    }
  }

  const activar = async () => {
    setMsg(null)
    await asegurarToken()
    try {
      const yaHay = await hayDemo(tenantId)
      if (yaHay > 0 && !window.confirm(t('Ya hay datos de prueba. ¿Cargar otro paquete encima?'))) return
      setFase('sembrando')
      await sembrarDemo(tenantId)
      setMsg({ tipo: 'ok', txt: t('¡Listo! Ya puedes recorrer el menú (Dashboard, Órdenes, Mapa en vivo, Facturación…) y verlo todo funcionando.') })
    } catch (e) {
      const m = e?.message || String(e)
      const hint = esPermiso(m) ? t('Parece un bloqueo de reglas/permisos de Firestore. ') : ''
      setMsg({ tipo: 'error', txt: `${hint}${t('Detalle técnico: ')}${m}` })
    } finally { setFase('idle') }
  }

  const borrar = async () => {
    if (!window.confirm(t('Se borran solo los datos de prueba; tus datos reales no se tocan. ¿Continuar?'))) return
    setFase('borrando'); setMsg(null)
    await asegurarToken()
    try {
      const n = await borrarDemo(tenantId)
      setMsg({ tipo: 'ok', txt: `${t('Listo. Se borraron ')}${n}${t(' registros de prueba.')}` })
    } catch (e) {
      const m = e?.message || ''
      setMsg({ tipo: 'error', txt: esPermiso(m) ? t('Tu sesión trae permisos viejos. Toca “Actualizar sesión” (abajo) y vuelve a intentarlo.') : t('No se pudo borrar: ') + m })
    } finally { setFase('idle') }
  }

  // Inc.2 Fase 3 · Backfill: crea los docs de pago por audiencia de las órdenes
  // existentes (las nuevas ya los tienen). Corre como admin, es seguro y repetible.
  const migrarPagos = async () => {
    if (!window.confirm(t('Se crearán los documentos de pago separados (cliente/transportista/chofer) de las órdenes existentes. Es seguro y se puede repetir. ¿Continuar?'))) return
    setMsg(null)
    await asegurarToken()
    const lista = ordenes || []
    setMigrando({ hechas: 0, total: lista.length })
    const CHUNK = 20
    let hechas = 0
    try {
      for (let i = 0; i < lista.length; i += CHUNK) {
        const trozo = lista.slice(i, i + CHUNK)
        await Promise.all(trozo.flatMap((o) => {
          const tareas = [sincronizarPagoCliente(tenantId, o)]
          if (o.transportistaId != null || o.choferId != null) tareas.push(sincronizarPagoAsignacion(tenantId, o))
          return tareas
        }))
        hechas += trozo.length
        setMigrando({ hechas, total: lista.length })
      }
      setMsg({ tipo: 'ok', txt: `${t('Migración completa: ')}${hechas} ${t('órdenes procesadas.')}` })
    } catch (e) {
      setMsg({ tipo: 'error', txt: (esPermiso(e?.message) ? t('Bloqueo de permisos. Toca “Actualizar sesión”. ') : '') + t('No se pudo migrar: ') + (e?.message || '') })
    } finally { setMigrando(null) }
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
        ? t('Tu sesión trae permisos viejos. Toca “Actualizar sesión” aquí abajo y vuelve a intentarlo.')
        : t('No se pudo abrir el portal: ') + m
      setMsg({ tipo: 'error', txt })
      setEntrando(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>{t('Modo test')}</PageTitle>

      {/* Diagnóstico de sesión — dinos qué muestra esto */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('Diagnóstico de sesión')}</span>
          <button onClick={refrescarSesion} disabled={refrescando} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {refrescando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('Actualizar')}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1.5 break-all font-mono text-xs sm:grid-cols-2">
          <div>{t('Correo:')} <b className="text-brand-navy dark:text-slate-100">{usuario?.email || '—'}</b></div>
          <div>UID: <b className="text-brand-navy dark:text-slate-100">{usuario?.id || '—'}</b></div>
          <div>{t('Rol:')} <b className={rol ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>{rol || t('SIN ROL ⚠')}</b></div>
          <div>Tenant: <b className={tenantId ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>{tenantId || t('SIN TENANT ⚠')}</b></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={probar} disabled={prueba?.estado === 'probando'} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-900">
            {prueba?.estado === 'probando' ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} {t('Probar escritura')}
          </button>
          {prueba?.estado === 'ok' && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('✓ Escritura OK — los permisos funcionan.')}</span>}
        </div>
        {prueba?.estado === 'error' && (
          <div className="mt-2 rounded-lg bg-rose-50 p-2 font-mono text-[11px] leading-relaxed text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <div className="break-all"><b>code:</b> {prueba.code}</div>
            <div className="break-all"><b>msg:</b> {prueba.msg}</div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">{t('Toca')} <b>{t('Probar escritura')}</b> {t('y mándame captura del resultado (verde = OK; rojo = me muestra el error exacto).')}</p>
      </Card>

      <Card className="mb-4 p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={26} /></div>
        <h3 className="mx-auto mt-3 max-w-md text-lg font-bold text-brand-navy dark:text-slate-100">{t('Ver el sistema funcionando')}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          {t('Un solo toque llena todo con datos de ejemplo. Luego recorre el menú. No afecta tus datos reales.')}
        </p>
        <div className="mt-5">
          <Boton variant="gold" onClick={activar} disabled={ocupado} className="px-6 py-2.5 text-base">
            {fase === 'sembrando' ? <><Loader2 size={18} className="animate-spin" /> {t('Cargando…')}</> : <><FlaskConical size={18} /> {t('Activar modo test')}</>}
          </Boton>
        </div>
        {demoOrdenes > 0 && (
          <button onClick={borrar} disabled={ocupado} className="mx-auto mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 disabled:opacity-50">
            <Trash2 size={13} /> {t('Borrar datos de prueba')} ({demoOrdenes} {t('órdenes')})
          </button>
        )}
        {msg && <Aviso tipo={msg.tipo} className="mt-4 text-left">{msg.txt}</Aviso>}
      </Card>

      {/* Mantenimiento: backfill de pagos por audiencia (Inc.2 Fase 3) */}
      <Card className="mb-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <RefreshCw size={16} className="text-brand-gold" />
          <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Mantenimiento · Migrar pagos por audiencia')}</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Crea los documentos de pago separados (cliente / transportista / chofer) de las órdenes existentes. Necesario una sola vez para separar los márgenes. Seguro y repetible.')}</p>
        <div className="mt-3">
          <Boton variant="gold" onClick={migrarPagos} disabled={!!migrando || ocupado}>
            {migrando ? <><Loader2 size={16} className="animate-spin" /> {migrando.hechas}/{migrando.total}</> : <><RefreshCw size={16} /> {t('Migrar pagos')} ({ordenes.length})</>}
          </Boton>
        </div>
      </Card>

      {/* Portales por rol: un toque entra directo (opcional) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Ver los portales por rol')}</h3>
          <button onClick={refrescarSesion} disabled={refrescando} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {refrescando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('Actualizar sesión')}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('Un toque te abre esa vista. Para volver a tu cuenta, toca')} <b>{t('Salir')}</b> {t('y entra con tu correo de siempre. Si algún portal dice “sin permisos”, toca')} <b>{t('Actualizar sesión')}</b>.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PORTALES.map((p) => (
            <button key={p.rol} onClick={() => entrarA(p)} disabled={ocupado}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-amber-400 hover:bg-amber-500/5 disabled:opacity-50 dark:border-slate-700">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-brand-navy dark:bg-slate-800 dark:text-amber-400">
                {entrando === p.rol ? <Loader2 size={18} className="animate-spin" /> : <p.icon size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{t(p.label)}</div>
                <div className="truncate text-xs text-slate-400">{t(p.desc)}</div>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
