// ============================================================================
// BULK · Correos del dominio (solo super_admin/admin). Panel para administrar las
// direcciones de `milepay.com` (buzones y alias) que viven en Google Workspace.
// MilePay es el PANEL; Google hospeda el correo. Todas las operaciones que tocan
// Google pasan por la Cloud Function `bulkMailboxOp` (credenciales solo en backend).
// La tabla se pinta desde el espejo en Firestore `bulk_mailboxes` (Google = fuente).
// ============================================================================
import { useMemo, useState } from 'react'
import { Mail, Plus, Trash2, Pause, Play, Pencil, RefreshCw, AtSign, Inbox, Building2, X, AlertTriangle } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion, useDoc } from '../data/useColeccion'
import { crearConId } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, EstadoVacio } from '../../components/ui'
import { useLang } from '../../i18n'

const DOMINIO = 'milepay.com'
const USOS = [
  { k: '', l: '— Sin uso específico —' },
  { k: 'facturacion', l: 'Facturación (invoice@)' },
  { k: 'reclamos', l: 'Reclamos (claim@)' },
  { k: 'administracion', l: 'Administración (admin@)' },
  { k: 'notificaciones', l: 'Notificaciones (no-reply@)' },
  { k: 'soporte', l: 'Soporte (support@)' },
]
const usoLabel = (k) => (USOS.find((u) => u.k === k)?.l || '—')
const fFecha = (ts) => { try { const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null); return d && !isNaN(d) ? d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' } catch { return '—' } }

export default function CorreosDominio() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: mailboxes, cargando } = useColeccion('mailboxes')
  const { dato: settings } = useDoc('settings', tenantId)
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [crear, setCrear] = useState(false)
  const [editar, setEditar] = useState(null)
  const [borrar, setBorrar] = useState(null)

  const buzones = useMemo(() => (mailboxes || []).filter((m) => m.tipo === 'buzon'), [mailboxes])
  const ordenados = useMemo(() => (mailboxes || []).slice().sort((a, b) => (a.direccion || '').localeCompare(b.direccion || '')), [mailboxes])

  // Toda operación contra Google pasa por el backend seguro.
  const op = async (operacion, payload = {}) => {
    setOcupado(true); setMsg(null)
    try {
      const fn = httpsCallable(funcsBulk, 'bulkMailboxOp')
      const r = await fn({ op: operacion, ...payload })
      setMsg({ tipo: 'ok', txt: r?.data?.mensaje || t('Operación realizada.') })
      return r?.data || { ok: true }
    } catch (e) {
      const code = e?.message || ''
      const amable = /not-?found|no configurado|SIN_|unavailable/i.test(code)
        ? t('El backend de correo aún no está configurado (falta conectar Google Workspace / la cuenta de servicio).')
        : (e?.message || t('No se pudo completar la operación.'))
      setMsg({ tipo: 'error', txt: amable })
      return { ok: false, error: amable }
    } finally { setOcupado(false) }
  }

  const guardarUso = async (funcion, direccion) => {
    const correos = { ...(settings?.correos || {}), [funcion]: direccion }
    try { await crearConId('settings', tenantId, tenantId, { correos }) } catch { setMsg({ tipo: 'error', txt: t('No se pudo guardar la configuración.') }) }
  }

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle right={
        <div className="flex items-center gap-2">
          <Boton variant="ghost" onClick={() => op('listar')} disabled={ocupado} className="px-3 py-2 text-xs"><RefreshCw size={15} /> {t('Sincronizar')}</Boton>
          <Boton variant="gold" onClick={() => setCrear(true)} className="px-4 py-2"><Plus size={16} /> {t('Crear dirección')}</Boton>
        </div>
      }>{t('Correos del dominio')}</PageTitle>
      <p className="-mt-3 mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        {t('Administra las direcciones de')} <b>@{DOMINIO}</b> {t('(buzones completos y alias). MilePay es el panel; Google Workspace hospeda el correo. Las credenciales viven solo en el backend.')}
      </p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Uso por función (Parte 3): qué dirección usa cada función del sistema. */}
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><AtSign size={16} className="text-amber-500" /> {t('Dirección por función')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[['facturacion', t('Facturación')], ['reclamos', t('Reclamos')], ['notificaciones', t('Notificaciones')]].map(([k, l]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{l}</span>
              <Select value={settings?.correos?.[k] || ''} onChange={(e) => guardarUso(k, e.target.value)} className="h-10 w-full">
                <option value="">{t('— Elegir dirección —')}</option>
                {ordenados.filter((m) => m.estado !== 'suspendida').map((m) => <option key={m.id} value={m.direccion}>{m.direccion}</option>)}
              </Select>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('El envío de facturas y las notificaciones usarán la dirección elegida aquí, con identidad MilePay.')}</p>
      </Card>

      {/* Tabla de direcciones */}
      {ordenados.length === 0 ? (
        <EstadoVacio titulo={t('Aún no hay direcciones')} texto={t('Crea el primer buzón o alias de tu dominio. Si ya tienes cuentas en Google Workspace, usa “Sincronizar” para traerlas.')} mostrarBoton={false} />
      ) : (
        <div className="space-y-2">
          {ordenados.map((m) => (
            <Card key={m.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4">
              <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl ${m.tipo === 'buzon' ? 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                {m.tipo === 'buzon' ? <Inbox size={18} /> : <AtSign size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-brand-navy dark:text-slate-100">{m.direccion}</span>
                  <Badge color={m.tipo === 'buzon' ? 'navy' : 'gold'}>{m.tipo === 'buzon' ? t('Buzón') : t('Alias')}</Badge>
                  {m.uso && <Badge color="blue">{usoLabel(m.uso)}</Badge>}
                  <Badge color={m.estado === 'suspendida' ? 'slate' : 'green'}>{m.estado === 'suspendida' ? t('Suspendida') : t('Activa')}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {m.tipo === 'alias' && m.destino ? <>{t('Reenvía a')} <b className="text-slate-500 dark:text-slate-300">{m.destino}</b> · </> : null}
                  {m.nombreVisible ? `${m.nombreVisible} · ` : ''}{t('Creada')} {fFecha(m.creadoEn)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setEditar(m)} disabled={ocupado} title={t('Editar')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><Pencil size={15} /></button>
                <button onClick={() => op(m.estado === 'suspendida' ? 'reactivar' : 'suspender', { id: m.id }).then(() => {})} disabled={ocupado} title={m.estado === 'suspendida' ? t('Reactivar') : t('Suspender')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-700">{m.estado === 'suspendida' ? <Play size={15} /> : <Pause size={15} />}</button>
                <button onClick={() => setBorrar(m)} disabled={ocupado} title={t('Eliminar')} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {crear && <ModalCrear dominio={DOMINIO} buzones={buzones} onClose={() => setCrear(false)} op={op} ocupado={ocupado} t={t} />}
      {editar && <ModalEditar m={editar} buzones={buzones} onClose={() => setEditar(null)} op={op} ocupado={ocupado} t={t} />}
      {borrar && <ModalBorrar m={borrar} settings={settings} onClose={() => setBorrar(null)} op={op} ocupado={ocupado} t={t} />}
    </div>
  )
}

function Campo({ label, children }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>{children}</label>
}
function Overlay({ children, onClose }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={onClose}><Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>{children}</Card></div>
}

function ModalCrear({ dominio, buzones, onClose, op, ocupado, t }) {
  const [tipo, setTipo] = useState('alias')
  const [local, setLocal] = useState('')
  const [nombreVisible, setNombreVisible] = useState('')
  const [destino, setDestino] = useState(buzones[0]?.direccion || '')
  const [uso, setUso] = useState('')
  const [pass, setPass] = useState('')
  const localOk = /^[a-z0-9._-]+$/i.test(local.trim())
  const direccion = `${local.trim().toLowerCase()}@${dominio}`
  const puede = localOk && (tipo === 'buzon' ? nombreVisible.trim() && pass.length >= 8 : !!destino)

  const enviar = async () => {
    const payload = tipo === 'buzon'
      ? { direccion, nombreVisible: nombreVisible.trim(), password: pass, uso }
      : { direccion, destino, uso }
    const r = await op(tipo === 'buzon' ? 'crear_buzon' : 'crear_alias', payload)
    if (r?.ok) onClose()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Mail size={18} /></span>
        <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Crear dirección')}</h3>
        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800/60">
        {[['alias', t('Alias (gratis)'), AtSign], ['buzon', t('Buzón (licencia)'), Inbox]].map(([k, l, Ico]) => (
          <button key={k} onClick={() => setTipo(k)} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${tipo === k ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'text-slate-500 dark:text-slate-300'}`}><Ico size={15} /> {l}</button>
        ))}
      </div>
      <div className="space-y-3">
        <Campo label={t('Dirección')}>
          <div className="flex items-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
            <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="invoice" className="h-10 min-w-0 flex-1 rounded-l-lg bg-transparent px-3 text-sm text-slate-800 outline-none dark:text-slate-100" />
            <span className="px-3 text-sm text-slate-400">@{dominio}</span>
          </div>
          {local && !localOk && <span className="text-[11px] text-rose-500">{t('Solo letras, números, punto, guion y guion bajo.')}</span>}
        </Campo>
        {tipo === 'buzon' ? (
          <>
            <Campo label={t('Nombre visible')}><Input value={nombreVisible} onChange={(e) => setNombreVisible(e.target.value)} placeholder={t('Ej. Facturación MilePay')} className="h-10 w-full" /></Campo>
            <Campo label={t('Contraseña temporal (mín. 8)')}><Input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" className="h-10 w-full" /></Campo>
          </>
        ) : (
          <Campo label={t('Reenvía al buzón')}>
            <Select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-10 w-full">
              {buzones.length === 0 ? <option value="">{t('(Primero crea un buzón)')}</option> : buzones.map((b) => <option key={b.id} value={b.direccion}>{b.direccion}</option>)}
            </Select>
          </Campo>
        )}
        <Campo label={t('Uso en el sistema')}>
          <Select value={uso} onChange={(e) => setUso(e.target.value)} className="h-10 w-full">{USOS.map((u) => <option key={u.k} value={u.k}>{u.l}</option>)}</Select>
        </Campo>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variant="ghost" onClick={onClose}>{t('Cancelar')}</Boton>
        <Boton variant="gold" onClick={enviar} disabled={!puede || ocupado}><Plus size={15} /> {t('Crear')}</Boton>
      </div>
    </Overlay>
  )
}

function ModalEditar({ m, buzones, onClose, op, ocupado, t }) {
  const [nombreVisible, setNombreVisible] = useState(m.nombreVisible || '')
  const [destino, setDestino] = useState(m.destino || '')
  const [uso, setUso] = useState(m.uso || '')
  const enviar = async () => {
    const r = await op('editar', { id: m.id, nombreVisible: nombreVisible.trim(), destino: m.tipo === 'alias' ? destino : undefined, uso })
    if (r?.ok) onClose()
  }
  return (
    <Overlay onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100"><Pencil size={16} /></span>
        <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Editar')} · {m.direccion}</h3>
        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>
      <div className="space-y-3">
        {m.tipo === 'buzon' && <Campo label={t('Nombre visible')}><Input value={nombreVisible} onChange={(e) => setNombreVisible(e.target.value)} className="h-10 w-full" /></Campo>}
        {m.tipo === 'alias' && (
          <Campo label={t('Reenvía al buzón')}>
            <Select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-10 w-full">
              {buzones.map((b) => <option key={b.id} value={b.direccion}>{b.direccion}</option>)}
            </Select>
          </Campo>
        )}
        <Campo label={t('Uso en el sistema')}>
          <Select value={uso} onChange={(e) => setUso(e.target.value)} className="h-10 w-full">{USOS.map((u) => <option key={u.k} value={u.k}>{u.l}</option>)}</Select>
        </Campo>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variant="ghost" onClick={onClose}>{t('Cancelar')}</Boton>
        <Boton variant="gold" onClick={enviar} disabled={ocupado}>{t('Guardar')}</Boton>
      </div>
    </Overlay>
  )
}

function ModalBorrar({ m, settings, onClose, op, ocupado, t }) {
  const enUso = Object.values(settings?.correos || {}).includes(m.direccion)
  const enviar = async () => { const r = await op('eliminar', { id: m.id }); if (r?.ok) onClose() }
  return (
    <Overlay onClose={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><Trash2 size={18} /></span>
        <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Eliminar dirección')}</h3>
      </div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('Vas a eliminar')} <b>{m.direccion}</b> {m.tipo === 'buzon' ? t('(buzón completo — se borra en Google Workspace).') : t('(alias).')} {t('Esta acción no se puede deshacer.')}</p>
      {enUso && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {t('Esta dirección está EN USO por el sistema (facturación/notificaciones). Reasigna esa función a otra dirección antes de eliminarla.')}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Boton variant="ghost" onClick={onClose}>{t('Cancelar')}</Boton>
        <Boton variant="danger" onClick={enviar} disabled={ocupado || enUso}><Trash2 size={15} /> {t('Sí, eliminar')}</Boton>
      </div>
    </Overlay>
  )
}
