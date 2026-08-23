// ============================================================================
// BULK · Correo (CRM) — cliente de correo REAL dentro de MilePay (solo admin).
// Estilo Gmail/Outlook: dashboard con contadores por carpeta, 3 paneles (carpetas ·
// lista · lector), búsqueda, acciones al pasar el mouse y redactor flotante.
// Todo vía la Cloud Function `bulkGmailOp` (Gmail API + delegación). El HTML de los
// correos se muestra en un iframe con sandbox (sin scripts) por seguridad.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox, Send, FileText, ShieldAlert, Trash2, RefreshCw, PenSquare, X, ArrowLeft,
  Reply, Paperclip, ChevronDown, Mail, Search, MailOpen, Minus, PenLine,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion, useDoc } from '../data/useColeccion'
import { crearConId } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, KPI, Cargando, Aviso, EstadoVacio, Spinner } from '../../components/ui'
import { num } from '../../utils/format'
import { useLang } from '../../i18n'

const CARPETAS = [
  { k: 'recibidos', l: 'Recibidos', icon: Inbox },
  { k: 'enviados', l: 'Enviados', icon: Send },
  { k: 'borradores', l: 'Borradores', icon: FileText },
  { k: 'spam', l: 'Spam', icon: ShieldAlert },
  { k: 'papelera', l: 'Papelera', icon: Trash2 },
]
const PALETA = ['bg-brand-navy', 'bg-brand-steel', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-violet-500']
const colorDe = (s) => PALETA[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]
const inicialDe = (s) => (String(s || '?').trim()[0] || '?').toUpperCase()

// "Juan Pérez <juan@x.com>" → { nombre, email }
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
const fFechaLarga = (s) => { const d = new Date(s); return isNaN(d) ? String(s || '') : d.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

// ── Firma corporativa ────────────────────────────────────────────────────────
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// Versión HTML (identidad navy/dorado, estilos en línea = seguro para clientes de correo).
function firmaHtmlDe(f, de) {
  if (!f) return ''
  const linea2 = [f.cargo, f.empresa].filter(Boolean).join(' · ')
  const contacto = [
    f.telefono ? esc(f.telefono) : null,
    de ? `<a href="mailto:${esc(de)}" style="color:#c9a24b;text-decoration:none">${esc(de)}</a>` : null,
    f.web ? `<a href="https://${esc(String(f.web).replace(/^https?:\/\//, ''))}" style="color:#c9a24b;text-decoration:none">${esc(f.web)}</a>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')
  return `<br><br><table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse"><tr><td style="border-left:3px solid #c9a24b;padding:2px 0 2px 14px">` +
    `<div style="font-size:15px;font-weight:bold;color:#13233f">${esc(f.nombre || '')}</div>` +
    (linea2 ? `<div style="font-size:12px;color:#5b6b82;margin-top:2px">${esc(linea2)}</div>` : '') +
    (contacto ? `<div style="font-size:12px;color:#5b6b82;margin-top:5px">${contacto}</div>` : '') +
    (f.eslogan ? `<div style="font-size:11px;color:#94a3b8;margin-top:7px;font-style:italic">${esc(f.eslogan)}</div>` : '') +
    `</td></tr></table>`
}
// Versión texto plano (para la parte alternativa del correo).
function firmaTextoDe(f, de) {
  if (!f) return ''
  return ['--', f.nombre, [f.cargo, f.empresa].filter(Boolean).join(' · '), [f.telefono, de, f.web].filter(Boolean).join(' · '), f.eslogan]
    .filter(Boolean).join('\n')
}

export default function CorreoCRM() {
  const { t } = useLang()
  const { tenantId, usuario } = useBulkAuth()
  const { dato: settings } = useDoc('settings', tenantId)
  const firma = settings?.firmaCorreo || null
  const { datos: mailboxes } = useColeccion('mailboxes')
  const buzones = useMemo(() => (mailboxes || []).filter((m) => m.tipo === 'buzon' && m.estado !== 'suspendida').sort((a, b) => (a.direccion || '').localeCompare(b.direccion || '')), [mailboxes])
  const [buzon, setBuzon] = useState('')
  const [carpeta, setCarpeta] = useState('recibidos')
  const [busca, setBusca] = useState('')
  const [buscaActiva, setBuscaActiva] = useState('')
  const [mensajes, setMensajes] = useState([])
  const [siguiente, setSiguiente] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [masCargando, setMasCargando] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [componer, setComponer] = useState(null)
  const [minimizado, setMinimizado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [incluirFirma, setIncluirFirma] = useState(true)
  const [editFirma, setEditFirma] = useState(null) // borrador del editor de firma
  const pedidoRef = useRef(0)

  const abrirEditorFirma = () => setEditFirma({
    nombre: firma?.nombre ?? (usuario?.nombre || ''), cargo: firma?.cargo ?? '', empresa: firma?.empresa ?? 'MilePay',
    telefono: firma?.telefono ?? '', web: firma?.web ?? 'www.milepay.io', eslogan: firma?.eslogan ?? '', activa: firma ? firma.activa !== false : true,
  })
  const guardarFirma = async () => {
    try {
      await crearConId('settings', tenantId, tenantId, { firmaCorreo: { ...editFirma } })
      setEditFirma(null); setOk(t('Firma guardada.')); setTimeout(() => setOk(null), 3000)
    } catch { setErr(t('No se pudo guardar la firma.')) }
  }
  const firmaLista = !!(firma && (firma.nombre || firma.empresa))
  const conFirma = firmaLista && incluirFirma

  useEffect(() => { if (!buzon && buzones.length) setBuzon(buzones[0].direccion) }, [buzones, buzon])

  const llamar = async (payload) => {
    const fn = httpsCallable(funcsBulk, 'bulkGmailOp')
    const r = await fn({ buzon, ...payload })
    return r?.data || {}
  }

  const cargarResumen = async () => {
    if (!buzon) return
    try { const r = await llamar({ op: 'resumen' }); setResumen(r.resumen || null) } catch { /* noop */ }
  }

  const cargar = async (reset = true, q = buscaActiva) => {
    if (!buzon) return
    const mi = ++pedidoRef.current
    reset ? setCargando(true) : setMasCargando(true)
    setErr(null)
    try {
      const r = await llamar({ op: 'listar', carpeta, pageToken: reset ? null : siguiente, q: q || undefined })
      if (pedidoRef.current !== mi) return
      setMensajes(reset ? (r.mensajes || []) : [...mensajes, ...(r.mensajes || [])])
      setSiguiente(r.siguiente || null)
    } catch (e) {
      if (pedidoRef.current === mi) setErr(e?.message || t('No se pudo cargar el correo.'))
    } finally {
      if (pedidoRef.current === mi) { setCargando(false); setMasCargando(false) }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAbierto(null); setBusca(''); setBuscaActiva(''); cargar(true, ''); cargarResumen() }, [buzon, carpeta])

  const buscar = () => { setBuscaActiva(busca); setAbierto(null); cargar(true, busca) }

  const abrir = async (m) => {
    setLeyendo(true); setErr(null)
    try {
      const r = await llamar({ op: 'leer', id: m.id })
      setAbierto(r.mensaje)
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, noLeido: false } : x)))
      cargarResumen()
    } catch (e) { setErr(e?.message || t('No se pudo abrir el mensaje.')) }
    finally { setLeyendo(false) }
  }

  const marcar = async (m, accion) => {
    try {
      await llamar({ op: 'marcar', id: m.id, accion })
      if (accion === 'noleido' || accion === 'leido') {
        setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, noLeido: accion === 'noleido' } : x)))
      } else {
        setMensajes((prev) => prev.filter((x) => x.id !== m.id))
        if (abierto?.id === m.id) setAbierto(null)
      }
      cargarResumen()
    } catch (e) { setErr(e?.message || t('No se pudo aplicar la acción.')) }
  }

  const remitentes = useMemo(() => {
    const alias = (mailboxes || []).filter((m) => m.tipo === 'alias' && m.destino === buzon).map((m) => m.direccion)
    return [buzon, ...alias].filter(Boolean)
  }, [mailboxes, buzon])

  const responder = () => {
    if (!abierto) return
    const de = parseDe(abierto.de)
    setMinimizado(false)
    setIncluirFirma(firma ? firma.activa !== false : true)
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
      // Firma corporativa: se añade al ENVIAR (texto + HTML profesional).
      const cuerpoFinal = conFirma ? `${componer.cuerpo || ''}\n\n${firmaTextoDe(firma, componer.de)}` : componer.cuerpo
      const htmlFinal = conFirma
        ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap;line-height:1.5">${esc(componer.cuerpo || '')}</div>${firmaHtmlDe(firma, componer.de)}`
        : undefined
      const r = await llamar({ op: comoBorrador ? 'borrador' : 'enviar', ...componer, cuerpo: cuerpoFinal, ...(htmlFinal ? { cuerpoHtml: htmlFinal } : {}) })
      setOk(r.mensaje || t('Listo.')); setTimeout(() => setOk(null), 4000)
      setComponer(null)
      cargarResumen()
      if ((comoBorrador && carpeta === 'borradores') || (!comoBorrador && carpeta === 'enviados')) cargar(true)
    } catch (e) { setErr(e?.message || t('No se pudo enviar.')) }
    finally { setEnviando(false) }
  }

  if (!buzones.length) {
    return (
      <div>
        <PageTitle>{t('Correo')}</PageTitle>
        <EstadoVacio titulo={t('No hay buzones disponibles')} texto={t('Ve a “Correos del dominio”, pulsa Sincronizar (o crea un buzón) y vuelve aquí.')} mostrarBoton={false} />
      </div>
    )
  }

  const R = resumen || {}
  const kpiSub = (k) => R[k] ? `${num(R[k].total)} ${t('en total')}` : undefined

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
          <Boton variant="gold" onClick={() => { setMinimizado(false); setIncluirFirma(firma ? firma.activa !== false : true); setComponer({ de: buzon, para: '', cc: '', asunto: '', cuerpo: '' }) }} className="px-4 py-2"><PenSquare size={16} /> {t('Redactar')}</Boton>
        </div>
      }>{t('Correo')}</PageTitle>

      {err && <Aviso tipo="error" className="mb-3">{err}</Aviso>}
      {ok && <Aviso tipo="ok" className="mb-3">{ok}</Aviso>}

      {/* Dashboard: contadores por carpeta (clic = ir a la carpeta) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KPI label={t('No leídos')} value={num(R.recibidos?.noLeidos ?? 0)} icon={MailOpen} accent="gold" sub={kpiSub('recibidos')} onClick={() => setCarpeta('recibidos')} />
        <KPI label={t('Recibidos')} value={num(R.recibidos?.total ?? 0)} icon={Inbox} accent="navy" onClick={() => setCarpeta('recibidos')} />
        <KPI label={t('Enviados')} value={num(R.enviados?.total ?? 0)} icon={Send} accent="green" onClick={() => setCarpeta('enviados')} />
        <KPI label={t('Borradores')} value={num(R.borradores?.total ?? 0)} icon={FileText} accent="slate" onClick={() => setCarpeta('borradores')} />
        <KPI label={t('Spam')} value={num(R.spam?.total ?? 0)} icon={ShieldAlert} accent="red" onClick={() => setCarpeta('spam')} />
      </div>

      {/* Cliente de correo: carpetas · lista · lector */}
      <Card className="overflow-hidden">
        <div className="flex" style={{ height: 'calc(100vh - 320px)', minHeight: 520 }}>
          {/* Carpetas (escondidas en móvil; ahí se usa el select de la barra) */}
          <aside className="hidden w-52 flex-shrink-0 flex-col border-r border-slate-100 p-2 dark:border-slate-800 md:flex">
            {CARPETAS.map((c) => {
              const on = carpeta === c.k
              const noLeidos = c.k === 'recibidos' ? (R.recibidos?.noLeidos || 0) : 0
              return (
                <button key={c.k} onClick={() => setCarpeta(c.k)} className={`mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on ? 'bg-brand-navy text-white shadow-sm dark:bg-amber-500 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <c.icon size={16} /> {t(c.l)}
                  {noLeidos > 0 && <span className={`ml-auto grid h-5 min-w-[22px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? 'bg-white/25' : 'bg-rose-500 text-white'}`}>{noLeidos}</span>}
                  {c.k !== 'recibidos' && R[c.k]?.total > 0 && <span className="ml-auto text-[11px] font-medium opacity-60">{num(R[c.k].total)}</span>}
                </button>
              )
            })}
            <div className="mt-auto border-t border-slate-100 pt-1 dark:border-slate-800">
              <button onClick={() => { cargar(true); cargarResumen() }} disabled={cargando} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> {t('Actualizar')}
              </button>
            </div>
          </aside>

          {/* Lista */}
          <section className={`w-full flex-col border-r border-slate-100 dark:border-slate-800 lg:flex lg:w-[380px] lg:flex-shrink-0 xl:w-[420px] ${abierto ? 'hidden' : 'flex'}`}>
            {/* Barra: búsqueda + carpeta (móvil) */}
            <div className="flex items-center gap-2 border-b border-slate-100 p-2.5 dark:border-slate-800">
              <div className="relative flex-1">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
                  placeholder={t('Buscar en el correo…')}
                  className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-8 pr-8 text-sm text-slate-700 outline-none focus:border-brand-gold focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                {buscaActiva && <button onClick={() => { setBusca(''); setBuscaActiva(''); cargar(true, '') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
              </div>
              <select value={carpeta} onChange={(e) => setCarpeta(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 md:hidden" aria-label={t('Carpeta')}>
                {CARPETAS.map((c) => <option key={c.k} value={c.k}>{t(c.l)}</option>)}
              </select>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {cargando ? <Cargando texto={t('Cargando correo…')} /> : mensajes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><Mail size={26} /></div>
                  <p className="m-0 text-sm text-slate-400">{buscaActiva ? t('Sin resultados para tu búsqueda.') : t('No hay mensajes en esta carpeta.')}</p>
                </div>
              ) : (
                <>
                  {mensajes.map((m) => {
                    const quien = parseDe(carpeta === 'enviados' || carpeta === 'borradores' ? m.para : m.de)
                    const activo = abierto?.id === m.id
                    return (
                      <div key={m.id} role="button" tabIndex={0} onClick={() => abrir(m)} onKeyDown={(e) => (e.key === 'Enter') && abrir(m)}
                        className={`group relative flex w-full cursor-pointer items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition dark:border-slate-800 ${activo ? 'bg-amber-500/10' : m.noLeido ? 'bg-sky-50/50 hover:bg-slate-50 dark:bg-sky-500/5 dark:hover:bg-slate-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                        {m.noLeido && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-gold" />}
                        <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-black text-white ${colorDe(quien.email)}`}>{inicialDe(quien.nombre)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate text-[13px] ${m.noLeido ? 'font-black text-brand-navy dark:text-slate-100' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>{quien.nombre || quien.email || '—'}</span>
                            <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400 group-hover:hidden">{fFecha(m.fecha)}</span>
                            {/* Acciones rápidas al pasar el mouse */}
                            <span className="ml-auto hidden flex-shrink-0 items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                              {carpeta === 'recibidos' && <button onClick={() => marcar(m, m.noLeido ? 'leido' : 'noleido')} title={m.noLeido ? t('Marcar leído') : t('Marcar no leído')} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-brand-navy dark:hover:bg-slate-700"><MailOpen size={14} /></button>}
                              {carpeta !== 'spam' && carpeta !== 'papelera' && <button onClick={() => marcar(m, 'spam')} title="Spam" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-amber-600 dark:hover:bg-slate-700"><ShieldAlert size={14} /></button>}
                              <button onClick={() => marcar(m, carpeta === 'papelera' ? 'restaurar' : 'papelera')} title={carpeta === 'papelera' ? t('Restaurar') : t('Eliminar')} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-500 dark:hover:bg-slate-700"><Trash2 size={14} /></button>
                            </span>
                          </div>
                          <div className={`truncate text-[13px] ${m.noLeido ? 'font-bold text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>{m.asunto || t('(sin asunto)')}</div>
                          <div className="truncate text-xs text-slate-400">{m.resumen}</div>
                        </div>
                      </div>
                    )
                  })}
                  {siguiente && (
                    <div className="p-3 text-center">
                      <Boton variant="ghost" onClick={() => cargar(false)} disabled={masCargando} className="px-4 py-1.5 text-xs">{masCargando ? <Spinner /> : t('Cargar más')}</Boton>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Lector */}
          <section className={`min-w-0 flex-1 flex-col ${abierto ? 'flex' : 'hidden lg:flex'}`}>
            {!abierto ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                {leyendo ? <Cargando texto={t('Abriendo mensaje…')} /> : (
                  <>
                    <div className="grid h-20 w-20 place-items-center rounded-3xl bg-slate-100 text-slate-300 dark:bg-slate-800"><MailOpen size={38} /></div>
                    <p className="m-0 text-sm text-slate-400">{t('Selecciona un mensaje para leerlo aquí.')}</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Barra de acciones del mensaje */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <button onClick={() => setAbierto(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-800 lg:hidden"><ArrowLeft size={16} /></button>
                  <Boton variant="gold" onClick={responder} className="px-3 py-1.5 text-xs"><Reply size={14} /> {t('Responder')}</Boton>
                  <div className="ml-auto flex items-center gap-1">
                    {carpeta === 'spam'
                      ? <button onClick={() => marcar(abierto, 'nospam')} title={t('No es spam')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"><ShieldAlert size={16} /></button>
                      : <button onClick={() => marcar(abierto, 'spam')} title="Spam" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800"><ShieldAlert size={16} /></button>}
                    {carpeta === 'papelera'
                      ? <button onClick={() => marcar(abierto, 'restaurar')} title={t('Restaurar')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"><RefreshCw size={15} /></button>
                      : <button onClick={() => marcar(abierto, 'papelera')} title={t('Eliminar')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800"><Trash2 size={16} /></button>}
                  </div>
                </div>
                {/* Encabezado del mensaje */}
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <h2 className="m-0 mb-2 text-base font-black text-brand-navy dark:text-slate-100 sm:text-lg">{abierto.asunto || t('(sin asunto)')}</h2>
                  <div className="flex items-start gap-2.5">
                    <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-black text-white ${colorDe(parseDe(abierto.de).email)}`}>{inicialDe(parseDe(abierto.de).nombre)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm"><span className="font-bold text-slate-700 dark:text-slate-200">{parseDe(abierto.de).nombre}</span> <span className="text-slate-400">&lt;{parseDe(abierto.de).email}&gt;</span></div>
                      <div className="text-xs text-slate-400">{t('para')} {abierto.para}{abierto.cc ? ` · CC: ${abierto.cc}` : ''}</div>
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-400">{fFechaLarga(abierto.fecha)}</span>
                  </div>
                  {(abierto.adjuntos || []).length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {abierto.adjuntos.map((a, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Paperclip size={12} /> {a.nombre}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Cuerpo */}
                <div className="min-h-0 flex-1 bg-white dark:bg-slate-900">
                  {abierto.html
                    ? <iframe title="correo" sandbox="" srcDoc={abierto.html} className="h-full w-full bg-white" />
                    : <pre className="scroll-thin h-full overflow-y-auto whitespace-pre-wrap p-4 font-sans text-sm text-slate-700 dark:text-slate-200">{abierto.texto || t('(mensaje vacío)')}</pre>}
                </div>
              </>
            )}
          </section>
        </div>
      </Card>

      {/* Redactor flotante (estilo Gmail) */}
      {componer && (
        <div className={`fixed z-[70] ${minimizado ? 'bottom-0 right-4 w-72' : 'inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[560px]'}`}>
          <div className="flex h-full max-h-screen flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-auto sm:max-h-[82vh] sm:rounded-2xl sm:border sm:border-slate-200 sm:dark:border-slate-700">
            {/* Barra superior navy */}
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#13233f' }}>
              <span className="truncate text-sm font-bold text-white">{componer.inReplyTo ? t('Responder') : t('Nuevo correo')}{componer.asunto ? ` · ${componer.asunto}` : ''}</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setMinimizado((v) => !v)} className="hidden rounded p-1 text-white/70 hover:bg-white/10 hover:text-white sm:grid"><Minus size={15} /></button>
                <button onClick={() => !enviando && setComponer(null)} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={15} /></button>
              </div>
            </div>
            {!minimizado && (
              <>
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-2">
                  <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="w-12 flex-shrink-0 text-xs text-slate-400">{t('De')}</span>
                    <select value={componer.de} onChange={(e) => setComponer((s) => ({ ...s, de: e.target.value }))} className="h-8 flex-1 rounded-md bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200">
                      {remitentes.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="w-12 flex-shrink-0 text-xs text-slate-400">{t('Para')}</span>
                    <input value={componer.para} onChange={(e) => setComponer((s) => ({ ...s, para: e.target.value }))} placeholder="cliente@correo.com" className="h-8 flex-1 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200" />
                  </label>
                  <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="w-12 flex-shrink-0 text-xs text-slate-400">CC</span>
                    <input value={componer.cc} onChange={(e) => setComponer((s) => ({ ...s, cc: e.target.value }))} placeholder={t('(opcional)')} className="h-8 flex-1 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200" />
                  </label>
                  <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="w-12 flex-shrink-0 text-xs text-slate-400">{t('Asunto')}</span>
                    <input value={componer.asunto} onChange={(e) => setComponer((s) => ({ ...s, asunto: e.target.value }))} className="h-8 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-100" />
                  </label>
                  <textarea
                    value={componer.cuerpo}
                    onChange={(e) => setComponer((s) => ({ ...s, cuerpo: e.target.value }))}
                    rows={10}
                    placeholder={t('Escribe tu mensaje…')}
                    className="mt-2 w-full resize-y bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100"
                  />
                  {/* Vista previa de la FIRMA CORPORATIVA (se añade sola al enviar). */}
                  {conFirma && (
                    <div className="mb-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><PenLine size={11} /> {t('Firma corporativa (se añade al enviar)')}</div>
                      <div className="rounded-lg bg-white p-2 dark:bg-white" dangerouslySetInnerHTML={{ __html: firmaHtmlDe(firma, componer.de).replace(/^<br><br>/, '') }} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <Boton variant="gold" onClick={() => enviar(false)} disabled={enviando || !componer.para.trim() || !componer.asunto.trim()} className="px-5">{enviando ? <Spinner /> : <Send size={15} />} {t('Enviar')}</Boton>
                  <Boton variant="ghost" onClick={() => enviar(true)} disabled={enviando} className="px-3 py-2 text-sm"><FileText size={15} /> {t('Borrador')}</Boton>
                  {/* Firma: alternar inclusión + editar */}
                  {firmaLista ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                      <input type="checkbox" checked={incluirFirma} onChange={(e) => setIncluirFirma(e.target.checked)} className="accent-amber-500" /> {t('Firma')}
                    </label>
                  ) : (
                    <button onClick={abrirEditorFirma} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"><PenLine size={13} /> {t('Crear firma')}</button>
                  )}
                  {firmaLista && <button onClick={abrirEditorFirma} title={t('Editar firma')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-800"><PenLine size={15} /></button>}
                  <button onClick={() => setComponer(null)} disabled={enviando} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800" title={t('Descartar')}><Trash2 size={16} /></button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Editor de firma corporativa */}
      {editFirma && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setEditFirma(null)}>
          <Card className="flex max-h-[90vh] w-full max-w-lg flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><PenLine size={17} /></span>
              <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Firma corporativa')}</h3>
              <button onClick={() => setEditFirma(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[['nombre', t('Nombre')], ['cargo', t('Cargo')], ['empresa', t('Empresa')], ['telefono', t('Teléfono')], ['web', t('Sitio web')]].map(([k, l]) => (
                  <label key={k} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{l}</span>
                    <Input value={editFirma[k]} onChange={(e) => setEditFirma((s) => ({ ...s, [k]: e.target.value }))} className="h-10 w-full" />
                  </label>
                ))}
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Eslogan / nota (opcional)')}</span>
                  <Input value={editFirma.eslogan} onChange={(e) => setEditFirma((s) => ({ ...s, eslogan: e.target.value }))} placeholder={t('Ej. Transporte de materiales a granel')} className="h-10 w-full" />
                </label>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={editFirma.activa} onChange={(e) => setEditFirma((s) => ({ ...s, activa: e.target.checked }))} className="accent-amber-500" />
                {t('Incluir automáticamente en cada correo')}
              </label>
              {/* Vista previa en vivo */}
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('Vista previa')}</div>
                <div className="rounded-lg bg-white p-3 dark:bg-white" dangerouslySetInnerHTML={{ __html: firmaHtmlDe(editFirma, buzon).replace(/^<br><br>/, '') }} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Boton variant="ghost" onClick={() => setEditFirma(null)}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={guardarFirma} disabled={!editFirma.nombre.trim() && !editFirma.empresa.trim()}><PenLine size={15} /> {t('Guardar firma')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
