// ============================================================================
// BULK · Correo (CRM) — bandeja de los buzones del dominio DENTRO de MilePay.
// Solo super_admin/admin. Carpetas: Recibidos / Enviados / Borradores / Spam /
// Papelera. Leer, redactar, responder, marcar spam/papelera y guardar borradores.
// Todo pasa por la Cloud Function `bulkGmailOp` (Gmail API + delegación); las
// credenciales viven solo en el backend. El HTML de los correos se muestra en un
// iframe con sandbox (sin scripts) por seguridad.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox, Send, FileText, ShieldAlert, Trash2, RefreshCw, PenSquare, X, ArrowLeft,
  Reply, AlertTriangle, Paperclip, ChevronDown, Mail, CircleDot,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion } from '../data/useColeccion'
import { PageTitle, Card, Boton, Input, Badge, Cargando, Aviso, EstadoVacio, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

const CARPETAS = [
  { k: 'recibidos', l: 'Recibidos', icon: Inbox },
  { k: 'enviados', l: 'Enviados', icon: Send },
  { k: 'borradores', l: 'Borradores', icon: FileText },
  { k: 'spam', l: 'Spam', icon: ShieldAlert },
  { k: 'papelera', l: 'Papelera', icon: Trash2 },
]

// "Juan Pérez <juan@x.com>" → { nombre: 'Juan Pérez', email: 'juan@x.com' }
const parseDe = (s) => {
  const m = String(s || '').match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  return m ? { nombre: m[1].trim() || m[2], email: m[2] } : { nombre: String(s || ''), email: String(s || '') }
}
const fFecha = (s) => {
  const d = new Date(s); if (isNaN(d)) return ''
  const hoy = new Date()
  return d.toDateString() === hoy.toDateString()
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

export default function CorreoCRM() {
  const { t } = useLang()
  const { datos: mailboxes } = useColeccion('mailboxes')
  const buzones = useMemo(() => (mailboxes || []).filter((m) => m.tipo === 'buzon' && m.estado !== 'suspendida').sort((a, b) => (a.direccion || '').localeCompare(b.direccion || '')), [mailboxes])
  const [buzon, setBuzon] = useState('')
  const [carpeta, setCarpeta] = useState('recibidos')
  const [mensajes, setMensajes] = useState([])
  const [siguiente, setSiguiente] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [masCargando, setMasCargando] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [abierto, setAbierto] = useState(null)   // mensaje completo
  const [leyendo, setLeyendo] = useState(false)
  const [componer, setComponer] = useState(null) // { de, para, cc, asunto, cuerpo, threadId?, inReplyTo? }
  const [enviando, setEnviando] = useState(false)
  const pedidoRef = useRef(0)

  // Buzón por defecto: el primero disponible.
  useEffect(() => { if (!buzon && buzones.length) setBuzon(buzones[0].direccion) }, [buzones, buzon])

  const llamar = async (payload) => {
    const fn = httpsCallable(funcsBulk, 'bulkGmailOp')
    const r = await fn({ buzon, ...payload })
    return r?.data || {}
  }

  const cargar = async (reset = true) => {
    if (!buzon) return
    const mi = ++pedidoRef.current
    reset ? setCargando(true) : setMasCargando(true)
    setErr(null)
    try {
      const r = await llamar({ op: 'listar', carpeta, pageToken: reset ? null : siguiente })
      if (pedidoRef.current !== mi) return // llegó tarde; ya se pidió otra carpeta
      setMensajes(reset ? (r.mensajes || []) : [...mensajes, ...(r.mensajes || [])])
      setSiguiente(r.siguiente || null)
    } catch (e) {
      if (pedidoRef.current === mi) setErr(e?.message || t('No se pudo cargar el correo.'))
    } finally {
      if (pedidoRef.current === mi) { setCargando(false); setMasCargando(false) }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAbierto(null); cargar(true) }, [buzon, carpeta])

  const abrir = async (m) => {
    setLeyendo(true); setErr(null)
    try {
      const r = await llamar({ op: 'leer', id: m.id })
      setAbierto(r.mensaje)
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, noLeido: false } : x)))
    } catch (e) { setErr(e?.message || t('No se pudo abrir el mensaje.')) }
    finally { setLeyendo(false) }
  }

  const marcar = async (m, accion) => {
    try {
      await llamar({ op: 'marcar', id: m.id, accion })
      setMensajes((prev) => prev.filter((x) => x.id !== m.id || accion === 'noleido' || accion === 'leido'))
      if (accion === 'noleido' || accion === 'leido') setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, noLeido: accion === 'noleido' } : x)))
      if (abierto?.id === m.id && accion !== 'noleido' && accion !== 'leido') setAbierto(null)
    } catch (e) { setErr(e?.message || t('No se pudo aplicar la acción.')) }
  }

  // Alias que caen en el buzón elegido (para el selector "De" al redactar).
  const remitentes = useMemo(() => {
    const alias = (mailboxes || []).filter((m) => m.tipo === 'alias' && m.destino === buzon).map((m) => m.direccion)
    return [buzon, ...alias].filter(Boolean)
  }, [mailboxes, buzon])

  const responder = () => {
    if (!abierto) return
    const de = parseDe(abierto.de)
    setComponer({
      de: buzon, para: de.email, cc: '', threadId: abierto.threadId, inReplyTo: abierto.messageId,
      asunto: /^re:/i.test(abierto.asunto || '') ? abierto.asunto : `Re: ${abierto.asunto || ''}`,
      cuerpo: `\n\n----- ${t('El')} ${abierto.fecha}, ${abierto.de} ${t('escribió')}: -----\n${(abierto.texto || '').split('\n').map((l) => '> ' + l).join('\n')}`,
    })
  }

  const enviar = async (comoBorrador = false) => {
    if (!componer) return
    setEnviando(true); setErr(null)
    try {
      const r = await llamar({ op: comoBorrador ? 'borrador' : 'enviar', ...componer })
      setOk(r.mensaje || t('Listo.')); setTimeout(() => setOk(null), 4000)
      setComponer(null)
      if (carpeta === 'enviados' || (comoBorrador && carpeta === 'borradores')) cargar(true)
    } catch (e) { setErr(e?.message || t('No se pudo enviar.')) }
    finally { setEnviando(false) }
  }

  if (!buzones.length) {
    return (
      <div>
        <PageTitle>{t('Correo (CRM)')}</PageTitle>
        <EstadoVacio titulo={t('No hay buzones disponibles')} texto={t('Ve a “Correos del dominio”, pulsa Sincronizar (o crea un buzón) y vuelve aquí.')} mostrarBoton={false} />
      </div>
    )
  }

  const sinAbrir = !abierto

  return (
    <div>
      <PageTitle right={
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={buzon} onChange={(e) => setBuzon(e.target.value)} className="h-10 appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm font-semibold text-brand-navy outline-none focus:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" aria-label={t('Buzón')}>
              {buzones.map((b) => <option key={b.id} value={b.direccion}>{b.direccion}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <Boton variant="gold" onClick={() => setComponer({ de: buzon, para: '', cc: '', asunto: '', cuerpo: '' })} className="px-4 py-2"><PenSquare size={16} /> {t('Redactar')}</Boton>
        </div>
      }>{t('Correo (CRM)')}</PageTitle>
      <p className="-mt-3 mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{t('Bandeja de los buzones de tu dominio, dentro de MilePay. Lo que envíes sale con identidad de tu empresa.')}</p>

      {err && <Aviso tipo="error" className="mb-3">{err}</Aviso>}
      {ok && <Aviso tipo="ok" className="mb-3">{ok}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Carpetas */}
        <Card className="h-fit p-2 lg:col-span-1">
          {CARPETAS.map((c) => {
            const on = carpeta === c.k
            return (
              <button key={c.k} onClick={() => setCarpeta(c.k)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <c.icon size={16} /> {t(c.l)}
              </button>
            )
          })}
          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
            <button onClick={() => cargar(true)} disabled={cargando} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> {t('Actualizar')}
            </button>
          </div>
        </Card>

        {/* Lista + lector */}
        <div className="min-w-0 lg:col-span-3">
          {sinAbrir ? (
            <Card className="overflow-hidden">
              {cargando ? <Cargando texto={t('Cargando correo…')} /> : mensajes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><Mail size={26} /></div>
                  <p className="m-0 text-sm text-slate-400">{t('No hay mensajes en esta carpeta.')}</p>
                </div>
              ) : (
                <>
                  {mensajes.map((m) => {
                    const de = parseDe(carpeta === 'enviados' || carpeta === 'borradores' ? m.para : m.de)
                    return (
                      <button key={m.id} onClick={() => abrir(m)} className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${m.noLeido ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}`}>
                        {m.noLeido ? <CircleDot size={14} className="mt-1 flex-shrink-0 text-amber-500" /> : <span className="mt-1 h-3.5 w-3.5 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate text-sm ${m.noLeido ? 'font-black text-brand-navy dark:text-slate-100' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>{de.nombre || de.email || '—'}</span>
                            <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400">{fFecha(m.fecha)}</span>
                          </div>
                          <div className={`truncate text-sm ${m.noLeido ? 'font-bold text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>{m.asunto || t('(sin asunto)')}</div>
                          <div className="truncate text-xs text-slate-400">{m.resumen}</div>
                        </div>
                      </button>
                    )
                  })}
                  {siguiente && (
                    <div className="p-3 text-center">
                      <Boton variant="ghost" onClick={() => cargar(false)} disabled={masCargando} className="px-4 py-2 text-sm">{masCargando ? <Spinner /> : t('Cargar más')}</Boton>
                    </div>
                  )}
                </>
              )}
            </Card>
          ) : (
            <Card className="p-4 sm:p-5">
              {/* Lector */}
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <button onClick={() => setAbierto(null)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-800"><ArrowLeft size={17} /></button>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Boton variant="gold" onClick={responder} className="px-3 py-1.5 text-xs"><Reply size={14} /> {t('Responder')}</Boton>
                  {carpeta === 'spam'
                    ? <Boton variant="ghost" onClick={() => marcar(abierto, 'nospam')} className="px-3 py-1.5 text-xs"><ShieldAlert size={14} /> {t('No es spam')}</Boton>
                    : <Boton variant="ghost" onClick={() => marcar(abierto, 'spam')} className="px-3 py-1.5 text-xs"><ShieldAlert size={14} /> {t('Spam')}</Boton>}
                  {carpeta === 'papelera'
                    ? <Boton variant="ghost" onClick={() => marcar(abierto, 'restaurar')} className="px-3 py-1.5 text-xs">{t('Restaurar')}</Boton>
                    : <Boton variant="danger" onClick={() => marcar(abierto, 'papelera')} className="px-3 py-1.5 text-xs"><Trash2 size={14} /></Boton>}
                </div>
              </div>
              <h2 className="m-0 mb-2 text-lg font-black text-brand-navy dark:text-slate-100">{abierto.asunto || t('(sin asunto)')}</h2>
              <div className="mb-1 text-sm"><span className="font-semibold text-slate-700 dark:text-slate-200">{parseDe(abierto.de).nombre}</span> <span className="text-slate-400">&lt;{parseDe(abierto.de).email}&gt;</span></div>
              <div className="mb-3 text-xs text-slate-400">{t('Para')}: {abierto.para}{abierto.cc ? ` · CC: ${abierto.cc}` : ''} · {abierto.fecha}</div>
              {(abierto.adjuntos || []).length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {abierto.adjuntos.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Paperclip size={12} /> {a.nombre}</span>
                  ))}
                </div>
              )}
              {/* Cuerpo: HTML en iframe con sandbox (sin scripts) o texto plano. */}
              {abierto.html
                ? <iframe title="correo" sandbox="" srcDoc={abierto.html} className="h-[55vh] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700" />
                : <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">{abierto.texto || t('(mensaje vacío)')}</pre>}
            </Card>
          )}
          {leyendo && <div className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Spinner /> {t('Abriendo mensaje…')}</div>}
        </div>
      </div>

      {/* Redactar */}
      {componer && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-3 sm:p-6" onClick={() => !enviando && setComponer(null)}>
          <Card className="flex max-h-[92vh] w-full max-w-2xl flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><PenSquare size={17} /></span>
              <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{componer.inReplyTo ? t('Responder') : t('Nuevo correo')}</h3>
              <button onClick={() => setComponer(null)} disabled={enviando} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              <label className="flex items-center gap-2 text-sm">
                <span className="w-14 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('De')}</span>
                <select value={componer.de} onChange={(e) => setComponer((s) => ({ ...s, de: e.target.value }))} className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  {remitentes.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-14 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Para')}</span>
                <Input value={componer.para} onChange={(e) => setComponer((s) => ({ ...s, para: e.target.value }))} placeholder="cliente@correo.com" className="h-10 flex-1" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-14 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">CC</span>
                <Input value={componer.cc} onChange={(e) => setComponer((s) => ({ ...s, cc: e.target.value }))} placeholder={t('(opcional)')} className="h-10 flex-1" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-14 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Asunto')}</span>
                <Input value={componer.asunto} onChange={(e) => setComponer((s) => ({ ...s, asunto: e.target.value }))} className="h-10 flex-1" />
              </label>
              <textarea
                value={componer.cuerpo}
                onChange={(e) => setComponer((s) => ({ ...s, cuerpo: e.target.value }))}
                rows={10}
                placeholder={t('Escribe tu mensaje…')}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Boton variant="ghost" onClick={() => enviar(true)} disabled={enviando} className="px-3 py-2 text-sm"><FileText size={15} /> {t('Guardar borrador')}</Boton>
              <div className="ml-auto flex items-center gap-2">
                <Boton variant="ghost" onClick={() => setComponer(null)} disabled={enviando}>{t('Cancelar')}</Boton>
                <Boton variant="gold" onClick={() => enviar(false)} disabled={enviando || !componer.para.trim() || !componer.asunto.trim()}>{enviando ? <Spinner /> : <Send size={15} />} {t('Enviar')}</Boton>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
