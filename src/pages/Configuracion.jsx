import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Save, Info, Compass, MessageSquare } from 'lucide-react'
import { PLANTILLA_REGISTRO_DEFAULT, PLANTILLA_PAGO_DEFAULT } from '../utils/mensajes'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { UMBRAL_CAMBIO_PRECIO } from '../constants'
import { setOnboardingCompleto } from '../utils/empresaSettings'
import { descargarBackup, restaurarBackup } from '../utils/backup'
import { pct } from '../utils/format'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../components/ui'
import { DatabaseBackup, Download, Upload } from 'lucide-react'
import MisCiudades from '../components/MisCiudades'
import ConfigReglas from '../components/ConfigReglas'
import { useLang } from '../i18n'

export default function Configuracion() {
  const { activeCompanyId, empresaActiva, ajustes, reloadAjustes } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const { t } = useLang()
  const puedeAdmin = esSuperAdmin || perfil?.role === 'owner'
  const navigate = useNavigate()
  const [marca, setMarca] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')
  const [backupBusy, setBackupBusy] = useState('')
  const [backupMsg, setBackupMsg] = useState(null)
  // Mensajes a choferes (SMS/WhatsApp/Correo) por empresa.
  const [numeroEmpresa, setNumeroEmpresa] = useState('')
  const [msgRegistro, setMsgRegistro] = useState('')
  const [msgPago, setMsgPago] = useState('')
  const [guardandoMsg, setGuardandoMsg] = useState(false)
  const [okMsg, setOkMsg] = useState('')

  const guardarMensajes = async () => {
    if (!activeCompanyId) return
    setGuardandoMsg(true); setOkMsg('')
    try {
      await setDoc(doc(db, 'settings', activeCompanyId), {
        companyId: activeCompanyId,
        numeroEmpresa: numeroEmpresa.trim(),
        mensajeRegistro: msgRegistro,
        mensajePago: msgPago,
        actualizadoEn: serverTimestamp(),
      }, { merge: true })
      await reloadAjustes?.()
      setOkMsg(t('Mensajes guardados.'))
    } finally { setGuardandoMsg(false) }
  }

  const descargar = async () => {
    setBackupBusy('descargar'); setBackupMsg(null)
    try {
      const r = await descargarBackup(activeCompanyId)
      setBackupMsg({ tipo: 'ok', txt: `${t('Backup descargado:')} ${r.total} ${t('registros. Guárdalo en un lugar seguro.')}` })
    } catch (e) {
      setBackupMsg({ tipo: 'error', txt: t('No se pudo generar el backup: ') + e.message })
    } finally { setBackupBusy('') }
  }
  const restaurar = async (file) => {
    if (!file) return
    if (!window.confirm(t('Restaurar REPONE y actualiza los datos desde el archivo (no borra nada nuevo). ¿Continuar?'))) return
    setBackupBusy('restaurar'); setBackupMsg(null)
    try {
      const data = JSON.parse(await file.text())
      if (data.companyId && data.companyId !== activeCompanyId && !window.confirm(t('Este backup es de OTRA empresa. Restaurar podría fallar por permisos. ¿Continuar?'))) { setBackupBusy(''); return }
      const n = await restaurarBackup(data)
      setBackupMsg({ tipo: 'ok', txt: `${t('Restaurados')} ${n} ${t('registros. Recarga la página (Ctrl+Shift+R) para ver los cambios.')}` })
    } catch (e) {
      setBackupMsg({ tipo: 'error', txt: t('No se pudo restaurar: ') + e.message })
    } finally { setBackupBusy('') }
  }

  useEffect(() => {
    ;(async () => {
      if (!activeCompanyId) return
      try {
        const s = await getDoc(doc(db, 'settings', activeCompanyId))
        if (s.exists()) {
          const d = s.data()
          setMarca(d.marca || ''); setNotas(d.notas || '')
          setNumeroEmpresa(d.numeroEmpresa || '')
          setMsgRegistro(d.mensajeRegistro || PLANTILLA_REGISTRO_DEFAULT)
          setMsgPago(d.mensajePago || PLANTILLA_PAGO_DEFAULT)
        } else {
          setMsgRegistro(PLANTILLA_REGISTRO_DEFAULT); setMsgPago(PLANTILLA_PAGO_DEFAULT)
        }
      } catch { /* noop */ }
    })()
  }, [activeCompanyId])

  const guardar = async () => {
    if (!activeCompanyId) return
    setGuardando(true)
    setOk('')
    try {
      await setDoc(doc(db, 'settings', activeCompanyId), { companyId: activeCompanyId, marca, notas, actualizadoEn: serverTimestamp() }, { merge: true })
      setOk(t('Configuración guardada.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">{t('Empresa:')} <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>{t('Configuración')}</PageTitle>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reglas de negocio */}
        <Card className="p-5">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Reglas de negocio')}</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t('Monto que marca un “doble” (detección)')}</span>
              <span className="font-semibold">{t('monto = $0.50')} <Badge color="gold">{t('configurable')}</Badge></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t('Tarifa (rate) que le pagas al chofer')}</span>
              <span className="font-semibold text-xs text-slate-500 dark:text-slate-400">{t('en Choferes')}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">{t('Umbral de alerta de cambio de precio')}</span>
              <span className="font-semibold">{pct(UMBRAL_CAMBIO_PRECIO, 0)} <Badge color="slate">{t('fijo')}</Badge></span>
            </li>
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Info size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            {t('Aquí se ajustan la ')}<b>{t('multa por claim')}</b>{t(' (lo que le cobras) y el ')}<b>{t('monto que marca un “doble”')}</b>{t(' (detección). Lo que le ')}<b>{t('pagas')}</b>{t(' al chofer (la ')}<b>{t('tarifa/rate')}</b>{t(' por entrega) va por chofer en ')}<b>{t('Choferes')}</b>.
          </div>
        </Card>

        {/* Ciudades propias de la empresa */}
        <MisCiudades />

        {/* Reglas de cálculo configurables (empresa + ciudad) */}
        <ConfigReglas />

        {/* Copias de seguridad (backup) */}
        {puedeAdmin && (
          <Card className="p-5 lg:col-span-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <DatabaseBackup size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Copias de seguridad (backup)')}</h3>
              {ajustes?.ultimoBackupAuto && (
                <Badge color="green">{t('Auto:')} {(() => { try { const d = ajustes.ultimoBackupAuto.toDate(); return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) } catch { return t('sí') } })()}</Badge>
              )}
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {t('La app guarda una copia ')}<b>{t('automática cada 24 h')}</b>{t(' en Firebase Storage. Además puedes ')}<b>{t('descargar')}</b>{t(' una copia completa (JSON) cuando quieras — ')}<b>{t('recomendado antes de cualquier borrado grande')}</b>{t(' — y ')}<b>{t('restaurarla')}</b>{t(' si necesitas recuperar datos.')}
            </p>
            {backupMsg && <Aviso tipo={backupMsg.tipo}>{backupMsg.txt}</Aviso>}
            <div className="flex flex-wrap items-center gap-2">
              <Boton variant="gold" onClick={descargar} disabled={!activeCompanyId || !!backupBusy}>
                {backupBusy === 'descargar' ? <><Spinner /> {t('Generando…')}</> : <><Download size={16} strokeWidth={1.8} /> {t('Descargar backup ahora')}</>}
              </Boton>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:text-slate-300 ${backupBusy ? 'pointer-events-none opacity-60' : ''}`}>
                {backupBusy === 'restaurar' ? <><Spinner /> {t('Restaurando…')}</> : <><Upload size={16} strokeWidth={1.8} /> {t('Restaurar desde archivo')}</>}
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurar(e.target.files?.[0])} />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">{t('Restaurar solo ')}<b>{t('agrega o repone')}</b>{t(' documentos; nunca borra los datos actuales. Para máxima seguridad, activa también los ')}<b>{t('backups administrados de Firebase')}</b>{t(' (exportaciones programadas) desde la consola de Google Cloud.')}</p>
          </Card>
        )}

        {/* Primeros pasos / onboarding */}
        <Card className="p-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Compass size={18} strokeWidth={1.8} className="text-brand-gold" /> {t('Primeros pasos')}</h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('¿Quieres volver a ver la guía de configuración inicial (agregar ciudades, cargar tu primera factura y revisar el dashboard)?')}</p>
          <Boton variant="ghost" disabled={!activeCompanyId} onClick={async () => { await setOnboardingCompleto(activeCompanyId, false); await reloadAjustes(); navigate('/') }}>
            <Compass size={16} strokeWidth={1.8} /> {t('Ver guía de primeros pasos')}
          </Boton>
        </Card>

        {/* Marca de la empresa (editable) */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Datos de la empresa')}</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('Nombre de marca')}</div>
              <Input className="w-64" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder={empresaActiva?.nombre || 'MilePay'} />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('Notas internas')}</div>
              <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <div className="mt-3">
            <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
              {guardando ? <><Spinner /> {t('Guardando…')}</> : <><Save size={16} strokeWidth={1.8} /> {t('Guardar configuración')}</>}
            </Boton>
          </div>
        </Card>

        {/* Mensajes a choferes (SMS / WhatsApp / Correo) */}
        {puedeAdmin && (
          <Card className="p-5 lg:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <MessageSquare size={18} strokeWidth={1.8} className="text-brand-gold" />
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mensajes a choferes (SMS / WhatsApp / Correo)')}</h3>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {t('Configura el ')}<b>{t('número de tu empresa')}</b>{t(' y los ')}<b>{t('mensajes predeterminados')}</b>{t('. Cada empresa tiene los suyos. Los mensajes salen desde el teléfono donde tocas “Enviar”; el número aquí se usa para ')}<b>{t('firmar')}</b>{t(' el mensaje (que el chofer sepa quién le escribe y a dónde responder).')}
            </p>
            {okMsg && <Aviso tipo="ok">{okMsg}</Aviso>}
            <div className="mb-3 max-w-xs">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t('Número de la empresa')}</div>
              <Input value={numeroEmpresa} onChange={(e) => setNumeroEmpresa(e.target.value)} placeholder="+1 305 555 0123" inputMode="tel" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('Mensaje de ')}<b>{t('invitación a registrarse')}</b>
                  <Badge color="slate">{'{nombre}'}</Badge><Badge color="slate">{'{enlace}'}</Badge><Badge color="slate">{'{pin}'}</Badge><Badge color="slate">{'{empresa}'}</Badge><Badge color="slate">{'{numero}'}</Badge>
                </div>
                <textarea rows={7} value={msgRegistro} onChange={(e) => setMsgRegistro(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('Mensaje de ')}<b>{t('aviso de pago')}</b>
                  <Badge color="slate">{'{nombre}'}</Badge><Badge color="slate">{'{monto}'}</Badge><Badge color="slate">{'{semana}'}</Badge><Badge color="slate">{'{empresa}'}</Badge><Badge color="slate">{'{numero}'}</Badge>
                </div>
                <textarea rows={7} value={msgPago} onChange={(e) => setMsgPago(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Boton variant="gold" onClick={guardarMensajes} disabled={guardandoMsg || !activeCompanyId}>
                {guardandoMsg ? <><Spinner /> {t('Guardando…')}</> : <><Save size={16} strokeWidth={1.8} /> {t('Guardar mensajes')}</>}
              </Boton>
              <button onClick={() => { setMsgRegistro(PLANTILLA_REGISTRO_DEFAULT); setMsgPago(PLANTILLA_PAGO_DEFAULT) }} className="text-xs font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-slate-200">
                {t('Restaurar textos por defecto')}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
