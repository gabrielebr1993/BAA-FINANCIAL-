// ============================================================================
// BULK · CONTACTOS entre choferes. Sección independiente (solo choferes) para:
//   Mis contactos · Solicitudes · Agregar chofer (por ID) · Crear grupo · Mi ID
// Reutiliza la infraestructura existente: chat privado (pv_), llamadas/videollamadas
// (LlamadaProvider), grupos (GruposModal) y estado en línea (bulk_presence). La capa
// de contactos/consentimiento la valida el backend (Cloud Function bulkContacto).
// UI pensada para usarse trabajando: botones grandes y accesibles.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import {
  Users, UserPlus, IdCard, Copy, Check, Search, X, MessageSquare, Phone, Video,
  Shield, Ban, Trash2, Flag, Bell, BellOff, ChevronLeft, Send,
} from 'lucide-react'
import Avatar from './Avatar'
import ChatOrden from './ChatOrden'
import { useVisualViewport } from './useVisualViewport'
import PerfilRapido from './PerfilRapido'
import GruposModal from './GruposModal'
import { useLlamada } from './LlamadaProvider'
import { useGrupos } from '../data/useGrupos'
import { useBulkAuth } from '../BulkAuthContext'
import { useCodigoUsuario } from '../data/useCodigoUsuario'
import { convPrivada } from '../data/chat'
import {
  useMisContactos, useMisContactosDoc, useSolicitudesContacto, usePresenciasContactos, estadoPresencia,
  buscarChoferPorId, solicitarContacto, responderSolicitud, eliminarContacto, bloquearContacto,
  desbloquearContacto, restringirSolicitudes, reportarContacto,
} from '../data/contactos'
import { Card, Boton, Input, Badge, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

export default function ContactosChofer() {
  const { t } = useLang()
  const { usuario } = useBulkAuth()
  const uid = usuario?.id
  const miCodigo = useCodigoUsuario(uid)
  const { iniciar } = useLlamada()

  const contactos = useMisContactos()
  const doc = useMisContactosDoc()
  const solicitudes = useSolicitudesContacto()
  const { grupos, invitaciones } = useGrupos()
  const presencias = usePresenciasContactos(useMemo(() => contactos.map((c) => c.uid), [contactos]))

  const [sub, setSub] = useState('contactos') // contactos | solicitudes | agregar | id
  const [chatCon, setChatCon] = useState(null) // contacto con chat abierto
  // Con teclado abierto, la capa del chat se ciñe al viewport visible (no salta).
  const vvChat = useVisualViewport(!!chatCon)
  // Chat abierto: congela el scroll del fondo y re-ancla arriba al abrir/cerrar el
  // teclado (mismo patrón que Mensajes) para que la cabecera navy no se salga.
  useEffect(() => {
    if (!chatCon) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.scrollTo(0, 0)
    return () => { document.body.style.overflow = prev }
  }, [chatCon])
  useEffect(() => { if (chatCon) window.scrollTo(0, 0) }, [vvChat, chatCon])
  const [verPerfil, setVerPerfil] = useState(null) // {id,nombre,rol} para ver perfil
  const [verGrupos, setVerGrupos] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [msg, setMsg] = useState(null)

  const aviso = (tipo, txt) => { setMsg({ tipo, txt }); setTimeout(() => setMsg(null), 3500) }

  // ── Acciones de contacto (chat / llamada / video) ──────────────────────────
  const ctxDe = (c) => ({ chatId: convPrivada(uid, c.uid), participantes: [uid, c.uid] })
  const llamar = (c, tipo) => iniciar(c.uid, c.nombre, tipo, ctxDe(c))

  // ── Copiar / compartir mi ID ───────────────────────────────────────────────
  const copiarId = async () => {
    if (!miCodigo) return
    try { await navigator.clipboard.writeText(String(miCodigo)); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* noop */ }
  }
  const compartirId = async () => {
    if (!miCodigo) return
    const texto = `${t('Agrégame en MilePay con mi ID de chofer')}: ${miCodigo}`
    try { if (navigator.share) await navigator.share({ text: texto }); else { await navigator.clipboard.writeText(texto); aviso('ok', t('Copiado para compartir.')) } } catch { /* cancelado */ }
  }

  const candidatosGrupo = useMemo(() => contactos.map((c) => ({ uid: c.uid, nombre: c.nombre, rol: 'chofer', foto: c.foto })), [contactos])

  const TABS = [
    { k: 'contactos', label: t('Mis contactos'), icon: Users, badge: contactos.length },
    { k: 'solicitudes', label: t('Solicitudes'), icon: Bell, badge: solicitudes.length },
    { k: 'agregar', label: t('Agregar'), icon: UserPlus },
    { k: 'id', label: t('Mi ID'), icon: IdCard },
  ]

  // Chat abierto: PANTALLA COMPLETA en capa fija propia (no comparte scroll con la
  // página del portal, así no salta con el teclado ni con mensajes nuevos).
  if (chatCon) {
    return (
      <div className="pt-safe pb-safe fixed inset-0 z-[60] flex flex-col bg-[#f2f3f7] p-2 dark:bg-slate-950"
        style={vvChat ? { top: vvChat.top, height: vvChat.height, bottom: 'auto', paddingBottom: 8, paddingTop: 8 } : undefined}>
        {/* Cabecera NAVY estándar de la app (volver + nombre + llamadas) via estiloApp. */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-card dark:bg-slate-900">
          <ChatOrden orden={{ id: convPrivada(uid, chatCon.uid), numero: chatCon.nombre }} participantes={[uid, chatCon.uid]} contacto={{ uid: chatCon.uid, nombre: chatCon.nombre, rol: 'chofer' }} fill
            estiloApp onVolver={() => setChatCon(null)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && <Aviso tipo={msg.tipo}>{msg.txt}</Aviso>}

      {/* Sub-pestañas grandes */}
      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map((x) => {
          const on = sub === x.k
          return (
            <button key={x.k} onClick={() => setSub(x.k)} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-xs font-bold transition ${on ? 'bg-brand-navy text-white shadow dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
              <span className="relative"><x.icon size={20} />{x.badge > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{x.badge}</span>}</span>
              <span className="text-center leading-tight">{x.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── MIS CONTACTOS ──────────────────────────────────────────────────── */}
      {sub === 'contactos' && (
        <div className="space-y-2">
          <button onClick={() => setVerGrupos(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-amber-600"><Users size={18} /> {t('Crear grupo de choferes')}</button>
          {contactos.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-400">{t('Aún no tienes contactos. Ve a “Agregar” e ingresa el ID de otro chofer.')}</Card>
          ) : contactos.map((c) => {
            const est = estadoPresencia(presencias[c.uid])
            return (
              <Card key={c.uid} className="p-3">
                <div className="flex items-center gap-3">
                  {/* Toca la foto o el nombre para ver el PERFIL del chofer. */}
                  <button onClick={() => setVerPerfil({ id: c.uid, nombre: c.nombre, rol: 'chofer' })} className="relative flex-shrink-0">
                    <Avatar foto={c.foto} nombre={c.nombre} size={48} />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${est.color === 'green' ? 'bg-emerald-500' : est.color === 'gold' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  </button>
                  <button onClick={() => setVerPerfil({ id: c.uid, nombre: c.nombre, rol: 'chofer' })} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-base font-bold text-brand-navy hover:underline dark:text-slate-100">{c.nombre}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">{c.codigo ? `ID #${c.codigo}` : ''} <Badge color={est.color}>{t(est.label)}</Badge></div>
                  </button>
                  <ContactoMenu c={c} onAviso={aviso} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button onClick={() => setChatCon(c)} className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-2 py-2.5 text-xs font-bold text-white transition hover:opacity-90 dark:bg-slate-700"><MessageSquare size={16} /> {t('Chat')}</button>
                  <button onClick={() => llamar(c, 'audio')} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-2 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600"><Phone size={16} /> {t('Llamar')}</button>
                  <button onClick={() => llamar(c, 'video')} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-2 py-2.5 text-xs font-bold text-slate-900 transition hover:bg-amber-600"><Video size={16} /> {t('Video')}</button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── SOLICITUDES ────────────────────────────────────────────────────── */}
      {sub === 'solicitudes' && (
        <div className="space-y-2">
          {solicitudes.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-400">{t('No tienes solicitudes pendientes.')}</Card>
          ) : solicitudes.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-3">
              <Avatar nombre={s.deNombre} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{s.deNombre}</div>
                {s.deCodigo && <div className="text-[11px] text-slate-400">ID #{s.deCodigo}</div>}
              </div>
              <Boton variant="gold" className="px-3 py-1.5 text-xs" onClick={async () => { try { await responderSolicitud(s.id, true); aviso('ok', t('Contacto agregado.')) } catch (e) { aviso('error', e?.message || t('Error')) } }}><Check size={14} /> {t('Aceptar')}</Boton>
              <Boton variant="ghost" className="px-3 py-1.5 text-xs" onClick={async () => { try { await responderSolicitud(s.id, false) } catch { /* noop */ } }}>{t('Rechazar')}</Boton>
            </Card>
          ))}
        </div>
      )}

      {/* ── AGREGAR CHOFER (por ID) ────────────────────────────────────────── */}
      {sub === 'agregar' && <AgregarChofer onAviso={aviso} />}

      {/* ── MI ID ──────────────────────────────────────────────────────────── */}
      {sub === 'id' && (
        <Card className="p-5 text-center">
          <IdCard size={32} className="mx-auto text-brand-gold" />
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('Mi ID de chofer')}</div>
          <div className="my-2 select-all font-mono text-3xl font-black tracking-widest text-brand-navy dark:text-slate-100">{miCodigo ? `#${miCodigo}` : '········'}</div>
          <p className="mx-auto mb-4 max-w-xs text-xs text-slate-400">{t('Comparte este ID con otro chofer para que pueda agregarte. No revela datos privados.')}</p>
          <div className="flex justify-center gap-2">
            <Boton variant="gold" onClick={copiarId} disabled={!miCodigo} className="px-4 py-2.5">{copiado ? <><Check size={16} /> {t('Copiado')}</> : <><Copy size={16} /> {t('Copiar ID')}</>}</Boton>
            <Boton variant="ghost" onClick={compartirId} disabled={!miCodigo} className="px-4 py-2.5"><Send size={16} /> {t('Compartir')}</Boton>
          </div>
          {/* Privacidad: no recibir solicitudes */}
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-100 p-3 text-left dark:border-slate-800">
            {doc.noSolicitudes ? <BellOff size={18} className="text-slate-400" /> : <Bell size={18} className="text-emerald-500" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{t('No recibir solicitudes')}</div>
              <div className="text-[11px] text-slate-400">{t('Si lo activas, nadie podrá enviarte solicitudes de contacto.')}</div>
            </div>
            <button onClick={async () => { try { await restringirSolicitudes(!doc.noSolicitudes) } catch { /* noop */ } }} className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full px-0.5 transition ${doc.noSolicitudes ? 'justify-end bg-slate-400' : 'justify-start bg-emerald-500'}`}>
              <span className="h-5 w-5 rounded-full bg-white shadow" />
            </button>
          </div>
        </Card>
      )}

      {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={candidatosGrupo} puedeCrear uid={uid} onClose={() => setVerGrupos(false)} />}
      {verPerfil && <PerfilRapido autor={verPerfil} ctxLlamada={{ chatId: convPrivada(uid, verPerfil.id), participantes: [uid, verPerfil.id] }} onClose={() => setVerPerfil(null)} />}
    </div>
  )
}

// Menú de un contacto (bloquear / eliminar / reportar).
function ContactoMenu({ c, onAviso }) {
  const { t } = useLang()
  const [abierto, setAbierto] = useState(false)
  const accion = async (fn, okMsg) => { setAbierto(false); try { await fn(); if (okMsg) onAviso('ok', okMsg) } catch (e) { onAviso('error', e?.message || t('Error')) } }
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setAbierto((v) => !v)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Shield size={18} /></button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <button onClick={() => { if (window.confirm(t('¿Eliminar este contacto?'))) accion(() => eliminarContacto(c.uid), t('Contacto eliminado.')) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Trash2 size={15} /> {t('Eliminar contacto')}</button>
            <button onClick={() => { if (window.confirm(t('¿Bloquear a este chofer? No podrá contactarte.'))) accion(() => bloquearContacto(c.uid), t('Chofer bloqueado.')) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Ban size={15} /> {t('Bloquear')}</button>
            <button onClick={() => { const m = window.prompt(t('Describe el motivo del reporte:')); if (m) accion(() => reportarContacto(c.uid, m), t('Reporte enviado.')) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Flag size={15} /> {t('Reportar')}</button>
          </div>
        </>
      )}
    </div>
  )
}

// Buscar un chofer por ID y enviarle una solicitud.
function AgregarChofer({ onAviso }) {
  const { t } = useLang()
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [res, setRes] = useState(null) // { encontrado, chofer } | { esYo }
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const buscar = async () => {
    const q = codigo.trim()
    if (!q) return
    setBuscando(true); setRes(null); setEnviado(false)
    try { setRes(await buscarChoferPorId(q)) } catch (e) { onAviso('error', e?.message || t('Error al buscar.')) } finally { setBuscando(false) }
  }
  const enviar = async () => {
    if (!res?.chofer?.uid) return
    setEnviando(true)
    try { const r = await solicitarContacto({ paraUid: res.chofer.uid }); setEnviado(true); onAviso('ok', r?.aceptadaMutua ? t('¡Ya son contactos!') : t('Solicitud enviada.')) }
    catch (e) { onAviso('error', e?.message || t('No se pudo enviar la solicitud.')) }
    finally { setEnviando(false) }
  }

  return (
    <Card className="p-4">
      <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Agregar chofer por ID')}</div>
      <p className="mb-3 mt-1 text-xs text-slate-400">{t('Pídele su ID de chofer y escríbelo aquí.')}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && buscar()} inputMode="numeric" placeholder={t('Introduce el ID del chofer')} className="w-full pl-9" />
        </div>
        <Boton variant="gold" onClick={buscar} disabled={buscando || !codigo.trim()} className="px-4">{buscando ? t('Buscando…') : t('Buscar')}</Boton>
      </div>

      {res && !res.encontrado && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/60">
          {res.esYo ? t('Ese es tu propio ID.') : t('No se encontró ningún chofer con ese ID.')}
        </div>
      )}
      {res?.encontrado && res.chofer && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-700">
          <Avatar nombre={res.chofer.nombre} size={56} className="mx-auto" />
          <div className="mt-2 text-base font-bold text-brand-navy dark:text-slate-100">{res.chofer.nombre}</div>
          <div className="text-xs text-slate-400">ID #{res.chofer.codigo}</div>
          <p className="my-3 text-sm text-slate-600 dark:text-slate-300">{t('¿Quieres agregar a')} <b>{res.chofer.nombre}</b> {t('a tus contactos?')}</p>
          {enviado ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10"><Check size={16} /> {t('Solicitud enviada')}</div>
          ) : (
            <div className="flex justify-center gap-2">
              <Boton variant="gold" onClick={enviar} disabled={enviando} className="px-4 py-2.5"><UserPlus size={16} /> {enviando ? t('Enviando…') : t('Enviar solicitud')}</Boton>
              <Boton variant="ghost" onClick={() => setRes(null)} className="px-4 py-2.5">{t('Cancelar')}</Boton>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
