// Perfil de VERIFICACIÓN del chofer (contratista 1099) + estado de pago Stripe.
// Solo owner/súper-admin. Los datos personales/documentos se guardan en Firestore/
// Storage; los datos BANCARIOS los maneja Stripe (aquí solo se ve el estado).
import { useState } from 'react'
import { ShieldCheck, Upload, FileText, IdCard, CheckCircle2, Clock, XCircle, CreditCard, ExternalLink, RefreshCw, Info, User, ClipboardCheck } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { ESTADOS_VERIFICACION, guardarVerificacion, subirDocumento } from '../utils/verificacion'
import { stripeCrearCuenta, stripeOnboardingLink, stripeEstado } from '../utils/stripe'
import { Card, Boton, Input, Select, Badge, Aviso, Spinner } from './ui'

const VACIO = {
  nombreCompleto: '', direccion: '', telefono: '', email: '', fechaNacimiento: '',
  licenciaNumero: '', licenciaUrl: '', w9Url: '', w9Entregado: false,
  estado: 'pendiente', notas: '', revisadoPor: '',
}

// Estado Stripe → badge legible.
const STRIPE_BADGE = {
  sin_registrar: { txt: 'Sin registrar', color: 'slate', icon: CreditCard },
  pendiente: { txt: 'Pendiente (falta completar)', color: 'gold', icon: Clock },
  en_revision: { txt: 'En revisión de Stripe', color: 'gold', icon: Clock },
  verificado: { txt: '✓ Verificada en Stripe', color: 'green', icon: CheckCircle2 },
}

export default function VerificacionChofer({ driver, activeCompanyId, onReload }) {
  const { perfil, esSuperAdmin } = useAuth()
  const puede = esSuperAdmin || perfil?.role === 'owner'
  const [v, setV] = useState({ ...VACIO, ...(driver?.verificacion || {}) })
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState('')
  const [msg, setMsg] = useState(null)
  const [stripeMsg, setStripeMsg] = useState(null)
  const [stripeBusy, setStripeBusy] = useState('')

  if (!puede) return null
  if (!driver?.id) {
    return (
      <Card className="p-5">
        <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><ShieldCheck size={18} strokeWidth={1.8} className="text-brand-gold" /> Verificación y pago</h3>
        <Aviso tipo="info">Este chofer aún no existe como registro guardado (aparece solo en una factura). Créalo/guárdalo en <b>Choferes</b> para poder verificarlo y habilitar pagos.</Aviso>
      </Card>
    )
  }

  const set = (campo, val) => setV((s) => ({ ...s, [campo]: val }))
  const estadoStripe = driver.stripeEstado || 'sin_registrar'
  const sb = STRIPE_BADGE[estadoStripe] || STRIPE_BADGE.sin_registrar
  const SBIcon = sb.icon

  const guardar = async () => {
    setGuardando(true); setMsg(null)
    try {
      await guardarVerificacion(driver.id, v, perfil?.nombre || perfil?.email || '')
      await onReload?.()
      setMsg({ tipo: 'ok', txt: 'Verificación guardada.' })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudo guardar: ' + e.message })
    } finally { setGuardando(false) }
  }

  const subir = async (tipo, file) => {
    if (!file) return
    setSubiendo(tipo); setMsg(null)
    try {
      const url = await subirDocumento(activeCompanyId, driver.id, tipo, file)
      const campo = tipo === 'licencia' ? 'licenciaUrl' : 'w9Url'
      const next = { ...v, [campo]: url }
      setV(next)
      await guardarVerificacion(driver.id, next, perfil?.nombre || perfil?.email || '')
      await onReload?.()
      setMsg({ tipo: 'ok', txt: 'Documento subido y guardado.' })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudo subir el documento: ' + e.message + ' (revisa que Storage esté habilitado y sus reglas publicadas).' })
    } finally { setSubiendo('') }
  }

  // ---- Stripe: invitar / abrir onboarding / actualizar estado ----
  const invitar = async () => {
    setStripeBusy('invitar'); setStripeMsg(null)
    try {
      const c = await stripeCrearCuenta({ companyId: activeCompanyId, driverId: driver.id, driverNombre: driver.nombre, email: v.email || driver.accesoEmail || '' })
      if (!c.ok) return setStripeMsg({ tipo: 'error', txt: c.error })
      const l = await stripeOnboardingLink({ companyId: activeCompanyId, driverId: driver.id })
      if (!l.ok) return setStripeMsg({ tipo: 'error', txt: l.error })
      await onReload?.()
      window.open(l.url, '_blank', 'noopener')
      setStripeMsg({ tipo: 'ok', txt: `Enlace de registro abierto${c.test ? ' (modo TEST)' : ''}. El chofer mete sus datos bancarios en Stripe; nosotros no los vemos. Copia el enlace si quieres enviárselo: ${l.url}` })
    } catch (e) {
      setStripeMsg({ tipo: 'error', txt: 'Error: ' + e.message })
    } finally { setStripeBusy('') }
  }
  const actualizarEstado = async () => {
    setStripeBusy('estado'); setStripeMsg(null)
    try {
      const r = await stripeEstado({ companyId: activeCompanyId, driverId: driver.id })
      if (!r.ok) return setStripeMsg({ tipo: 'error', txt: r.error })
      await onReload?.()
      setStripeMsg({ tipo: 'ok', txt: `Estado actualizado: ${r.estado}${r.test ? ' (TEST)' : ''}.` })
    } catch (e) {
      setStripeMsg({ tipo: 'error', txt: 'Error: ' + e.message })
    } finally { setStripeBusy('') }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Verificación y pago</h3>
        {ESTADOS_VERIFICACION.filter((e) => e.key === (v.estado || 'pendiente')).map((e) => (
          <Badge key={e.key} color={e.color}>Verificación: {e.label}</Badge>
        ))}
        <span className="inline-flex items-center gap-1"><SBIcon size={14} strokeWidth={1.9} className="text-slate-400" /><Badge color={sb.color}>Cuenta bancaria: {sb.txt}</Badge></span>
        {driver.stripeTest && <Badge color="slate">TEST</Badge>}
      </div>

      {msg && <div className="mb-4"><Aviso tipo={msg.tipo}>{msg.txt}</Aviso></div>}

      <div className="space-y-4">
        {/* 1 · Datos personales — orden par (6 celdas) para que no queden campos solitarios */}
        <Seccion icon={User} titulo="Datos personales">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="Nombre completo"><Input value={v.nombreCompleto} onChange={(e) => set('nombreCompleto', e.target.value)} placeholder={driver.nombre} /></Campo>
            <Campo label="Teléfono"><Input value={v.telefono} onChange={(e) => set('telefono', e.target.value)} /></Campo>
            <Campo label="Email"><Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Campo>
            <Campo label="Fecha de nacimiento (opcional)"><Input type="date" value={v.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} /></Campo>
            <Campo label="Dirección" className="sm:col-span-2"><Input value={v.direccion} onChange={(e) => set('direccion', e.target.value)} /></Campo>
          </div>
        </Seccion>

        {/* 2 · Documentos e identificación — cada documento en su propio sub-bloque */}
        <Seccion icon={IdCard} titulo="Documentos e identificación">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Licencia / ID */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><IdCard size={14} strokeWidth={1.9} className="text-brand-gold" /> Licencia / ID</div>
              <div className="space-y-3">
                <Campo label="Número de licencia / ID"><Input value={v.licenciaNumero} onChange={(e) => set('licenciaNumero', e.target.value)} /></Campo>
                <DocUpload label="Imagen de licencia / ID" icon={IdCard} url={v.licenciaUrl} subiendo={subiendo === 'licencia'} onFile={(f) => subir('licencia', f)} />
              </div>
            </div>
            {/* Formulario W-9 */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><FileText size={14} strokeWidth={1.9} className="text-brand-gold" /> Formulario W-9</div>
              <div className="space-y-3">
                <label className="flex h-10 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={!!v.w9Entregado} onChange={(e) => set('w9Entregado', e.target.checked)} /> Entregó W-9
                </label>
                <DocUpload label="Documento W-9" icon={FileText} url={v.w9Url} subiendo={subiendo === 'w9'} onFile={(f) => subir('w9', f)} />
              </div>
            </div>
          </div>
        </Seccion>

        {/* 3 · Estado de verificación */}
        <Seccion icon={ClipboardCheck} titulo="Estado de verificación">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Estatus de verificación">
              <Select value={v.estado || 'pendiente'} onChange={(e) => set('estado', e.target.value)}>
                {ESTADOS_VERIFICACION.map((e) => (<option key={e.key} value={e.key}>{e.label}</option>))}
              </Select>
            </Campo>
            <Campo label="Notas de revisión" className="sm:col-span-2"><Input value={v.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Ej. licencia vigente, W-9 correcto…" /></Campo>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Boton variant="gold" onClick={guardar} disabled={guardando}>{guardando ? <><Spinner /> Guardando…</> : 'Guardar verificación'}</Boton>
            {v.revisadoPor && <span className="text-xs text-slate-400">Última revisión por {v.revisadoPor}</span>}
          </div>
        </Seccion>

        {/* 4 · Datos bancarios y pago (Stripe) */}
        <Seccion icon={CreditCard} titulo="Datos bancarios y pago (Stripe)" right={estadoStripe === 'verificado' ? <Badge color="green">Listo para pago</Badge> : <Badge color="gold">Pendiente de registrar banco</Badge>}>
          <p className="mb-3 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info size={14} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            El chofer registra su cuenta bancaria <b>directamente en Stripe</b>. Nosotros <b>no vemos ni guardamos</b> el número de cuenta: solo el estado que Stripe reporta. Prueba primero en <b>modo TEST</b>.
          </p>
          {stripeMsg && <Aviso tipo={stripeMsg.tipo}>{stripeMsg.txt}</Aviso>}
          <div className="flex flex-wrap items-center gap-2">
            <Boton variant="primary" onClick={invitar} disabled={!!stripeBusy}>
              {stripeBusy === 'invitar' ? <><Spinner /> Generando…</> : <><ExternalLink size={15} strokeWidth={1.8} /> {driver.stripeAccountId ? 'Volver a abrir registro de banco' : 'Invitar a registrar pago'}</>}
            </Boton>
            {driver.stripeAccountId && (
              <Boton variant="ghost" onClick={actualizarEstado} disabled={!!stripeBusy}>
                {stripeBusy === 'estado' ? <><Spinner /> Consultando…</> : <><RefreshCw size={15} strokeWidth={1.8} /> Actualizar estado</>}
              </Boton>
            )}
            {driver.stripeAccountId && <span className="text-[11px] text-slate-400">Cuenta: {driver.stripeAccountId}</span>}
          </div>
          {estadoStripe !== 'verificado' && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Este chofer aún no puede recibir pago hasta que su estado sea <b>verificado</b>.</p>
          )}
        </Seccion>
      </div>
    </Card>
  )
}

// Bloque de sección: subheader con icono + separación visual (card interna).
function Seccion({ icon: Icon, titulo, right, children }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/60">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon size={15} strokeWidth={1.8} className="text-brand-gold" />
        <h4 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{titulo}</h4>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  )
}

function Campo({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}

function DocUpload({ label, icon: Icon, url, subiendo, onFile }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {subiendo ? <Spinner /> : <Upload size={15} strokeWidth={1.8} />} {subiendo ? 'Subiendo…' : 'Subir'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            <Icon size={15} strokeWidth={1.8} /> Ver documento
          </a>
        ) : (
          <span className="text-xs text-slate-400">Sin documento</span>
        )}
      </div>
    </div>
  )
}
