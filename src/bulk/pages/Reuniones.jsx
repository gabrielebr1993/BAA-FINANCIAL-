// ============================================================================
// BULK · REUNIONES — videollamadas / llamadas de voz grupales con LINK de
// invitación para personas EXTERNAS (sin cuenta). MilePay orquesta las salas y
// los links; Daily.co maneja el audio/video (embebido). Estilo del sistema.
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video, Phone, Plus, Copy, Mail, X, Radio, Clock, CheckCircle2, Users,
  CalendarDays, Link2, StopCircle, Send,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion, useDoc } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { firmaTextoDe, cuerpoHtmlConFirma } from '../domain/correoFirma'
import { PageTitle, Card, Boton, Input, Badge, Cargando, Aviso, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

const linkDe = (codigo) => `${window.location.origin}/meet/${codigo}`
const fFecha = (s) => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export default function Reuniones() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { tenantId } = useBulkAuth()
  const { datos: reuniones, cargando } = useColeccion('meetings')
  const { dato: settings } = useDoc('settings', tenantId)
  const { datos: mailboxes } = useColeccion('mailboxes')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [crear, setCrear] = useState(null)     // { titulo, tipo, fecha }
  const [invitar, setInvitar] = useState(null) // reunión a invitar por correo

  const llamar = async (payload) => {
    const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
    const r = await fn(payload)
    return r?.data || {}
  }

  const crearReunion = async ({ titulo, tipo, fecha, entrar }) => {
    setOcupado(true); setMsg(null)
    try {
      const r = await llamar({ op: 'crear', titulo: titulo || '', tipo, programadaPara: fecha || null })
      setCrear(null)
      if (entrar) navigate(`/bulk/reuniones/${r.id}`)
      else { await copiar(linkDe(r.codigo)); setMsg({ tipo: 'ok', txt: t('Reunión creada. El link ya está copiado — compártelo con quien quieras.') }) }
    } catch (e) { setMsg({ tipo: 'error', txt: e?.message || t('No se pudo crear la reunión.') }) }
    finally { setOcupado(false) }
  }

  const finalizar = async (m) => {
    if (!window.confirm(t('¿Finalizar esta reunión para todos? El link dejará de funcionar.'))) return
    setOcupado(true)
    try { await llamar({ op: 'finalizar', id: m.id }); setMsg({ tipo: 'ok', txt: t('Reunión finalizada.') }) }
    catch (e) { setMsg({ tipo: 'error', txt: e?.message || t('No se pudo finalizar.') }) }
    finally { setOcupado(false) }
  }

  const copiar = async (texto) => { try { await navigator.clipboard.writeText(texto); return true } catch { return false } }
  const copiarLink = async (m) => { (await copiar(linkDe(m.codigo))) ? setMsg({ tipo: 'ok', txt: t('Link copiado.') }) : setMsg({ tipo: 'warn', txt: t('No se pudo copiar.') }) }

  const orden = useMemo(() => {
    const peso = { en_vivo: 0, programada: 1, finalizada: 2 }
    return (reuniones || []).slice().sort((a, b) => (peso[a.estado] ?? 3) - (peso[b.estado] ?? 3) || (b.creadaEn || '').localeCompare(a.creadaEn || ''))
  }, [reuniones])

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle right={
        <Boton variant="gold" onClick={() => setCrear({ titulo: '', tipo: 'video', fecha: '' })} className="px-4 py-2"><Plus size={16} /> {t('Nueva reunión')}</Boton>
      }>{t('Reuniones')}</PageTitle>
      <p className="-mt-3 mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        {t('Crea videollamadas o llamadas de voz y comparte el link.')} <b>{t('Cualquier persona con el link puede unirse, aunque no tenga cuenta en MilePay.')}</b>
      </p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Accesos rápidos */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => crearReunion({ titulo: '', tipo: 'video', entrar: true })} disabled={ocupado}
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-md disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-white" style={{ background: '#13233f' }}><Video size={22} /></span>
          <span>
            <span className="block text-sm font-black text-brand-navy dark:text-slate-100">{t('Iniciar videollamada')}</span>
            <span className="block text-xs text-slate-400">{t('Se crea al instante y entras directo a la sala.')}</span>
          </span>
        </button>
        <button onClick={() => crearReunion({ titulo: '', tipo: 'voz', entrar: true })} disabled={ocupado}
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-md disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-white" style={{ background: '#3f9d6b' }}><Phone size={22} /></span>
          <span>
            <span className="block text-sm font-black text-brand-navy dark:text-slate-100">{t('Iniciar llamada de voz')}</span>
            <span className="block text-xs text-slate-400">{t('Sin cámara; los participantes pueden activarla si quieren.')}</span>
          </span>
        </button>
      </div>

      {/* Lista de reuniones */}
      {orden.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl" style={{ background: '#f8f3eb' }}><Video size={30} style={{ color: '#c9a24b' }} /></div>
          <h3 className="m-0 mb-1 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Aún no hay reuniones')}</h3>
          <p className="mx-auto mb-4 max-w-md text-sm text-slate-500 dark:text-slate-400">{t('Crea la primera videollamada o llamada de voz y comparte el link de invitación.')}</p>
          <Boton variant="gold" onClick={() => setCrear({ titulo: '', tipo: 'video', fecha: '' })}><Plus size={16} /> {t('Nueva reunión')}</Boton>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {orden.map((m) => (
            <Card key={m.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4">
              <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl text-white ${m.tipo === 'voz' ? 'bg-emerald-500' : 'bg-brand-navy dark:bg-slate-700'}`}>
                {m.tipo === 'voz' ? <Phone size={19} /> : <Video size={19} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{m.titulo}</span>
                  {m.estado === 'en_vivo' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {t('En vivo')}</span>}
                  {m.estado === 'programada' && <Badge color="gold">{t('Programada')}</Badge>}
                  {m.estado === 'finalizada' && <Badge color="slate">{t('Finalizada')}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                  {m.estado === 'programada' && m.programadaPara && <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {fFecha(m.programadaPara)}</span>}
                  {m.estado !== 'programada' && m.inicio && <span className="inline-flex items-center gap-1"><Clock size={12} /> {fFecha(m.inicio)}{m.estado === 'finalizada' && m.duracionMin ? ` · ${m.duracionMin} min` : ''}</span>}
                  {(m.participantes || []).length > 0 && <span className="inline-flex items-center gap-1"><Users size={12} /> {(m.participantes || []).length} {t('invitados')}</span>}
                  <span className="inline-flex items-center gap-1 font-mono"><Link2 size={12} /> /meet/{m.codigo}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.estado !== 'finalizada' && (
                  <>
                    <Boton variant="gold" onClick={() => navigate(`/bulk/reuniones/${m.id}`)} className="px-3 py-1.5 text-xs">{m.tipo === 'voz' ? <Phone size={14} /> : <Video size={14} />} {t('Unirse')}</Boton>
                    <button onClick={() => copiarLink(m)} title={t('Copiar link')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><Copy size={15} /></button>
                    <button onClick={() => setInvitar(m)} title={t('Invitar por correo')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><Mail size={15} /></button>
                    <button onClick={() => finalizar(m)} disabled={ocupado} title={t('Finalizar para todos')} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><StopCircle size={15} /></button>
                  </>
                )}
                {m.estado === 'finalizada' && <CheckCircle2 size={16} className="text-slate-300" />}
              </div>
            </Card>
          ))}
        </div>
      )}

      {crear && <ModalCrear f={crear} setF={setCrear} onCrear={crearReunion} ocupado={ocupado} t={t} />}
      {invitar && <ModalInvitar m={invitar} settings={settings} mailboxes={mailboxes} onClose={() => setInvitar(null)} setMsg={setMsg} t={t} />}
    </div>
  )
}

function ModalCrear({ f, setF, onCrear, ocupado, t }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setF(null)}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Video size={17} /></span>
          <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Nueva reunión')}</h3>
          <button onClick={() => setF(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Título')}</span>
            <Input value={f.titulo} onChange={(e) => setF((s) => ({ ...s, titulo: e.target.value }))} placeholder={t('Ej. Coordinación con Vulcan Materials')} className="h-10 w-full" />
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Tipo')}</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800/60">
              {[['video', t('Videollamada'), Video], ['voz', t('Llamada de voz'), Phone]].map(([k, l, Ico]) => (
                <button key={k} onClick={() => setF((s) => ({ ...s, tipo: k }))} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${f.tipo === k ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'text-slate-500 dark:text-slate-300'}`}><Ico size={15} /> {l}</button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Programar para (opcional)')}</span>
            <Input type="datetime-local" value={f.fecha} onChange={(e) => setF((s) => ({ ...s, fecha: e.target.value }))} className="h-10 w-full" />
          </label>
          <p className="text-[11px] text-slate-400">{t('Al crearla se genera un link único; cualquier persona con el link puede unirse, aunque no tenga cuenta en MilePay.')}</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variant="ghost" onClick={() => setF(null)}>{t('Cancelar')}</Boton>
          {!f.fecha && <Boton variant="ghost" onClick={() => onCrear({ ...f, entrar: false })} disabled={ocupado}>{ocupado ? <Spinner /> : <Copy size={15} />} {t('Crear y copiar link')}</Boton>}
          <Boton variant="gold" onClick={() => onCrear({ ...f, entrar: !f.fecha })} disabled={ocupado}>{ocupado ? <Spinner /> : <Plus size={15} />} {f.fecha ? t('Programar') : t('Crear y entrar')}</Boton>
        </div>
      </Card>
    </div>
  )
}

// Invitar por correo: usa el módulo de correo del sistema (bulkGmailOp) con la
// dirección configurada; si no hay buzones, cae a mailto:.
function ModalInvitar({ m, settings, mailboxes, onClose, setMsg, t }) {
  const activos = (mailboxes || []).filter((x) => x.estado !== 'suspendida')
  const buzones = activos.filter((x) => x.tipo === 'buzon')
  const deDefault = settings?.correos?.notificaciones || settings?.correos?.facturacion || buzones[0]?.direccion || ''
  const firma = settings?.firmaCorreo || null
  const link = linkDe(m.codigo)
  const [para, setPara] = useState('')
  const [de, setDe] = useState(deDefault)
  const [ocupado, setOcupado] = useState(false)
  const asunto = `${t('Invitación a reunión')}: ${m.titulo} · MilePay`
  const cuerpo = `${t('Hola')},\n\n${t('Te invito a una')} ${m.tipo === 'voz' ? t('llamada de voz') : t('videollamada')}: "${m.titulo}".\n\n${t('Únete con este link (no necesitas cuenta)')}:\n${link}\n\n${m.programadaPara ? `${t('Programada para')}: ${fFecha(m.programadaPara)}\n\n` : ''}${t('Nos vemos ahí.')}`
  const buzonDe = (dir) => { const x = activos.find((a) => a.direccion === dir); return x?.tipo === 'alias' ? x.destino : dir }

  const enviar = async () => {
    setOcupado(true)
    try {
      const conFirma = firma && (firma.nombre || firma.empresa) && firma.activa !== false
      const fn = httpsCallable(funcsBulk, 'bulkGmailOp', { timeout: 45000 })
      await fn({
        op: 'enviar', buzon: buzonDe(de), de, para, asunto,
        cuerpo: conFirma ? `${cuerpo}\n\n${firmaTextoDe(firma, de)}` : cuerpo,
        ...(conFirma ? { cuerpoHtml: cuerpoHtmlConFirma(cuerpo, firma, de) } : {}),
      })
      setMsg({ tipo: 'ok', txt: t('Invitación enviada.') }); onClose()
    } catch (e) { setMsg({ tipo: 'error', txt: e?.message || t('No se pudo enviar la invitación.') }) }
    finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => !ocupado && onClose()}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Mail size={17} /></span>
          <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Invitar por correo')}</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {buzones.length === 0 ? (
          <>
            <Aviso tipo="warn">{t('No hay buzones configurados; se abrirá tu correo local con la invitación lista.')}</Aviso>
            <a href={`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`} className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-bold text-white dark:bg-amber-500 dark:text-slate-900"><Mail size={15} /> {t('Abrir mi correo')}</a>
          </>
        ) : (
          <>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm">
                <span className="w-12 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('De')}</span>
                <select value={de} onChange={(e) => setDe(e.target.value)} className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  {activos.map((x) => <option key={x.id} value={x.direccion}>{x.direccion}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-12 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Para')}</span>
                <Input value={para} onChange={(e) => setPara(e.target.value)} placeholder="invitado@correo.com" className="h-10 flex-1" />
              </label>
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                <div className="mb-1 font-bold text-brand-navy dark:text-slate-100">{asunto}</div>
                <pre className="m-0 whitespace-pre-wrap font-sans">{cuerpo}</pre>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={onClose} disabled={ocupado}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={enviar} disabled={ocupado || !para.trim()}>{ocupado ? <Spinner /> : <Send size={15} />} {t('Enviar invitación')}</Boton>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
