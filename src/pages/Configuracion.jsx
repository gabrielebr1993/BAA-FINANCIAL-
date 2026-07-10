import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Save, Info, Compass, CreditCard, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { setOnboardingCompleto } from '../utils/empresaSettings'
import { stripeConfig } from '../utils/stripe'
import { descargarBackup, restaurarBackup } from '../utils/backup'
import { pct } from '../utils/format'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../components/ui'
import { DatabaseBackup, Download, Upload } from 'lucide-react'
import MisCiudades from '../components/MisCiudades'
import ConfigReglas from '../components/ConfigReglas'

export default function Configuracion() {
  const { activeCompanyId, empresaActiva, ajustes, reloadAjustes } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const puedeStripe = esSuperAdmin || perfil?.role === 'owner'
  const navigate = useNavigate()
  const [marca, setMarca] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')
  const [stripeInfo, setStripeInfo] = useState(null) // { configurado, test } | { error }
  const [cargandoStripe, setCargandoStripe] = useState(false)
  const [backupBusy, setBackupBusy] = useState('')
  const [backupMsg, setBackupMsg] = useState(null)

  const descargar = async () => {
    setBackupBusy('descargar'); setBackupMsg(null)
    try {
      const r = await descargarBackup(activeCompanyId)
      setBackupMsg({ tipo: 'ok', txt: `Backup descargado: ${r.total} registros. Guárdalo en un lugar seguro.` })
    } catch (e) {
      setBackupMsg({ tipo: 'error', txt: 'No se pudo generar el backup: ' + e.message })
    } finally { setBackupBusy('') }
  }
  const restaurar = async (file) => {
    if (!file) return
    if (!window.confirm('Restaurar REPONE y actualiza los datos desde el archivo (no borra nada nuevo). ¿Continuar?')) return
    setBackupBusy('restaurar'); setBackupMsg(null)
    try {
      const data = JSON.parse(await file.text())
      if (data.companyId && data.companyId !== activeCompanyId && !window.confirm('Este backup es de OTRA empresa. Restaurar podría fallar por permisos. ¿Continuar?')) { setBackupBusy(''); return }
      const n = await restaurarBackup(data)
      setBackupMsg({ tipo: 'ok', txt: `Restaurados ${n} registros. Recarga la página (Ctrl+Shift+R) para ver los cambios.` })
    } catch (e) {
      setBackupMsg({ tipo: 'error', txt: 'No se pudo restaurar: ' + e.message })
    } finally { setBackupBusy('') }
  }

  const revisarStripe = async () => {
    setCargandoStripe(true)
    try {
      const r = await stripeConfig()
      setStripeInfo(r.ok ? r : { error: r.error })
    } catch (e) {
      setStripeInfo({ error: e.message })
    } finally { setCargandoStripe(false) }
  }
  useEffect(() => { if (puedeStripe) revisarStripe() }, [puedeStripe])

  useEffect(() => {
    ;(async () => {
      if (!activeCompanyId) return
      try {
        const s = await getDoc(doc(db, 'settings', activeCompanyId))
        if (s.exists()) { setMarca(s.data().marca || ''); setNotas(s.data().notas || '') }
      } catch { /* noop */ }
    })()
  }, [activeCompanyId])

  const guardar = async () => {
    if (!activeCompanyId) return
    setGuardando(true)
    setOk('')
    try {
      await setDoc(doc(db, 'settings', activeCompanyId), { companyId: activeCompanyId, marca, notas, actualizadoEn: serverTimestamp() }, { merge: true })
      setOk('Configuración guardada.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Configuración</PageTitle>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reglas de negocio */}
        <Card className="p-5">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Reglas de negocio</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Monto que marca un “doble” (detección)</span>
              <span className="font-semibold">monto = $0.50 <Badge color="gold">configurable</Badge></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Tarifa (rate) que le pagas al chofer</span>
              <span className="font-semibold text-xs text-slate-500 dark:text-slate-400">en Choferes</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Umbral de alerta de cambio de precio</span>
              <span className="font-semibold">{pct(UMBRAL_CAMBIO_PRECIO, 0)} <Badge color="slate">fijo</Badge></span>
            </li>
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Info size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            Aquí se ajustan la <b>multa por claim</b> (lo que le cobras) y el <b>monto que marca un “doble”</b> (detección). Lo que le <b>pagas</b> al chofer (la <b>tarifa/rate</b> por entrega) va por chofer en <b>Choferes</b>.
          </div>
        </Card>

        {/* Ciudades propias de la empresa */}
        <MisCiudades />

        {/* Reglas de cálculo configurables (empresa + ciudad) */}
        <ConfigReglas />

        {/* Pagos por Stripe (solo owner/súper-admin) */}
        {puedeStripe && (
          <Card className="p-5 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CreditCard size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Pagos por Stripe</h3>
              {stripeInfo && !stripeInfo.error && (
                stripeInfo.configurado
                  ? <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Configurado</span></Badge>
                  : <Badge color="red"><span className="inline-flex items-center gap-1"><XCircle size={13} strokeWidth={2} /> No configurado</span></Badge>
              )}
              {stripeInfo && !stripeInfo.error && stripeInfo.configurado && <Badge color={stripeInfo.test ? 'gold' : 'slate'}>{stripeInfo.test ? 'Modo TEST' : 'Producción'}</Badge>}
              <Boton variant="ghost" className="ml-auto px-2.5 py-1 text-xs" onClick={revisarStripe} disabled={cargandoStripe}>
                {cargandoStripe ? <><Spinner /> Revisando…</> : <><RefreshCw size={14} strokeWidth={1.8} /> Revisar</>}
              </Boton>
            </div>
            <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
              Los pagos a choferes se procesan con <b>Stripe Connect</b>. Los <b>datos bancarios los maneja Stripe</b> — MilePay nunca los ve ni los guarda; solo el estado (verificado / pendiente).
            </p>
            {stripeInfo?.error && <Aviso tipo="warn">No se pudo consultar el estado de Stripe: {stripeInfo.error}</Aviso>}
            {stripeInfo && !stripeInfo.error && !stripeInfo.configurado && (
              <Aviso tipo="warn">Falta <b>STRIPE_SECRET_KEY</b> en Vercel (usa una clave de <b>TEST</b> <code>sk_test_…</code> para probar) y activar <b>Connect</b> en tu panel de Stripe.</Aviso>
            )}
            <ul className="mt-1 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
              <li>1. Registra a cada chofer desde su <b>perfil → “Verificación y pago” → “Invitar a registrar pago”</b>.</li>
              <li>2. El chofer completa sus datos bancarios en Stripe y su estado pasa a <b>verificado</b>.</li>
              <li>3. En <b>Pagos</b> podrás pagarle (por ahora solo en modo <b>TEST</b>; los pagos reales están deshabilitados).</li>
            </ul>
          </Card>
        )}

        {/* Copias de seguridad (backup) */}
        {puedeStripe && (
          <Card className="p-5 lg:col-span-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <DatabaseBackup size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Copias de seguridad (backup)</h3>
              {ajustes?.ultimoBackupAuto && (
                <Badge color="green">Auto: {(() => { try { const d = ajustes.ultimoBackupAuto.toDate(); return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) } catch { return 'sí' } })()}</Badge>
              )}
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              La app guarda una copia <b>automática cada 24 h</b> en Firebase Storage. Además puedes <b>descargar</b> una copia completa (JSON) cuando quieras — <b>recomendado antes de cualquier borrado grande</b> — y <b>restaurarla</b> si necesitas recuperar datos.
            </p>
            {backupMsg && <Aviso tipo={backupMsg.tipo}>{backupMsg.txt}</Aviso>}
            <div className="flex flex-wrap items-center gap-2">
              <Boton variant="gold" onClick={descargar} disabled={!activeCompanyId || !!backupBusy}>
                {backupBusy === 'descargar' ? <><Spinner /> Generando…</> : <><Download size={16} strokeWidth={1.8} /> Descargar backup ahora</>}
              </Boton>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:text-slate-300 ${backupBusy ? 'pointer-events-none opacity-60' : ''}`}>
                {backupBusy === 'restaurar' ? <><Spinner /> Restaurando…</> : <><Upload size={16} strokeWidth={1.8} /> Restaurar desde archivo</>}
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurar(e.target.files?.[0])} />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">Restaurar solo <b>agrega o repone</b> documentos; nunca borra los datos actuales. Para máxima seguridad, activa también los <b>backups administrados de Firebase</b> (exportaciones programadas) desde la consola de Google Cloud.</p>
          </Card>
        )}

        {/* Primeros pasos / onboarding */}
        <Card className="p-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Compass size={18} strokeWidth={1.8} className="text-brand-gold" /> Primeros pasos</h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">¿Quieres volver a ver la guía de configuración inicial (agregar ciudades, cargar tu primera factura y revisar el dashboard)?</p>
          <Boton variant="ghost" disabled={!activeCompanyId} onClick={async () => { await setOnboardingCompleto(activeCompanyId, false); await reloadAjustes(); navigate('/') }}>
            <Compass size={16} strokeWidth={1.8} /> Ver guía de primeros pasos
          </Boton>
        </Card>

        {/* Marca de la empresa (editable) */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Datos de la empresa</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre de marca</div>
              <Input className="w-64" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder={empresaActiva?.nombre || 'MilePay'} />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Notas internas</div>
              <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <div className="mt-3">
            <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
              {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> Guardar configuración</>}
            </Boton>
          </div>
        </Card>
      </div>
    </div>
  )
}
