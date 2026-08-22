// ============================================================================
// BULK · Notificaciones internas de MENSAJES (toast tipo SaaS).
// Llega un mensaje → aparece una tarjetita elegante arriba a la derecha, suena un
// tono corto y discreto, y desaparece sola a los ~4.5 s. No bloquea la pantalla.
//   · Cola con apilado (máx. 4 visibles) y AGRUPADO cuando llegan muchos de golpe.
//   · Avatar + nombre + vista previa + hora + punto de "nuevo".
//   · Diferencia el tipo (directo / grupo / cliente / interno / importante).
//   · Pausa al pasar el mouse; clic abre la conversación (no marca leído por sí solo).
//   · Sonido configurable (on/off + volumen), respetando el autoplay del navegador.
//   · Accesible: aria-live, foco por teclado y respeta prefers-reduced-motion.
// Reutiliza la mensajería en tiempo real ya existente (Firestore onSnapshot).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Users, AlertTriangle, Volume2, VolumeX, Settings2, Bell } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { useAvatares } from '../data/useCodigoUsuario'
import { where } from '../data/repo'
import { tsMillis } from '../data/chatKeys'
import { esRolStaff } from '../domain/comunicacion'
import { tonoMensaje, engancharDesbloqueoAudio } from '../integraciones/alertasLocales'
import {
  getPrefsNotif, setPrefsNotif, onPrefsNotif, getConversacionActiva, pedirAbrirConversacion,
} from '../data/notifsMensajes'
import { useLang } from '../../i18n'

const VISIBLE_MS = 4500
const MAX_VISIBLE = 4
const AGRUPAR_DESDE = 4 // si llegan >=4 de golpe, se muestran como uno solo "N nuevos".
const SALIDA_MS = 220
const IR_MENSAJES = '__mensajes__'

const PALETA = ['bg-brand-navy', 'bg-brand-steel', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-violet-500']
const colorDe = (s) => PALETA[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]
const inicialesDe = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// Mismo criterio de visibilidad que el badge "Mensajes" (noLeidosVisibles).
function esParaMi(m, uid, gruposActivos) {
  if (!m || m.autorId === uid) return false
  if ((m.leidoPor || []).includes(uid)) return false
  if (m.tipo === 'llamada') return false
  const k = m.orderId || ''
  const personal = k.startsWith('pv_') || k.startsWith('st_') || k.startsWith('grp_')
  if (personal && !((m.participantes || []).includes(uid))) return false
  if (k.startsWith('grp_') && gruposActivos && !gruposActivos.has(k)) return false
  return true
}

function vistaPrevia(m, t) {
  if (m.tipo === 'foto') return '📷 ' + t('Foto')
  if (m.tipo === 'ubicacion') return '📍 ' + t('Ubicación')
  if (m.tipo === 'archivo') return '📎 ' + (m.nombreArchivo || t('Archivo'))
  return m.texto || ''
}

// Tipo visual del mensaje según la conversación (y si es urgente).
function tipoMensaje(m, t) {
  if (m.urgente) return { label: t('Importante'), barra: 'bg-rose-500', punto: 'bg-rose-500', importante: true }
  const k = m.orderId || ''
  if (k.startsWith('pv_')) return { label: t('Directo'), barra: 'bg-brand-steel', punto: 'bg-brand-steel' }
  if (k.startsWith('grp_')) return { label: t('Grupo'), barra: 'bg-violet-500', punto: 'bg-violet-500' }
  if (k.startsWith('st_')) return { label: t('Interno'), barra: 'bg-slate-400', punto: 'bg-slate-400' }
  if (k.startsWith('co_') || m.autorRol === 'cliente') return { label: t('Cliente'), barra: 'bg-emerald-500', punto: 'bg-emerald-500' }
  return { label: t('Operación'), barra: 'bg-brand-navy', punto: 'bg-brand-navy' }
}

export default function AvisosMensajes() {
  const { t } = useLang()
  const { usuario, rol } = useBulkAuth()
  const navigate = useNavigate()
  const uid = usuario?.id
  const { datos: mensajes } = useColeccion('messages')
  const { datos: misGrupos } = useColeccion('groups', [where('miembros', 'array-contains', uid || '__none__')])
  const avatares = useAvatares()
  const gruposActivos = useMemo(() => new Set((misGrupos || []).map((g) => 'grp_' + g.id)), [misGrupos])

  const [avisos, setAvisos] = useState([]) // [{ id, autor, texto, hora, conv, foto, tipo, grupo?, n?, saliendo? }]
  const [prefs, setPrefs] = useState(getPrefsNotif())
  const [verCfg, setVerCfg] = useState(false)
  const desde = useRef(tsMillis(new Date().toISOString()))
  const avisados = useRef(new Set())
  const timers = useRef({})

  useEffect(() => { engancharDesbloqueoAudio() }, [])
  useEffect(() => onPrefsNotif(setPrefs), [])

  const programarCierre = (id, ms = VISIBLE_MS) => {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => cerrar(id), ms)
  }
  const cerrar = (id) => {
    clearTimeout(timers.current[id]); delete timers.current[id]
    // Animación de salida antes de quitarla.
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, saliendo: true } : a)))
    setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), SALIDA_MS)
  }
  const quitarYa = (id) => { clearTimeout(timers.current[id]); delete timers.current[id]; setAvisos((prev) => prev.filter((a) => a.id !== id)) }

  useEffect(() => {
    if (!uid) return
    const nuevos = []
    for (const m of mensajes || []) {
      if (!m.id || avisados.current.has(m.id)) continue
      if (tsMillis(m.ts) <= desde.current) { avisados.current.add(m.id); continue }
      if (!esParaMi(m, uid, gruposActivos)) continue
      avisados.current.add(m.id)
      // No molestar si ya estoy viendo esa conversación.
      if ((m.orderId || '') === getConversacionActiva()) continue
      nuevos.push({
        msgId: m.id, autor: m.autorNombre || t('Mensaje'), texto: vistaPrevia(m, t),
        hora: horaDe(m.ts, t), conv: m.orderId || '', foto: avatares?.[m.autorId] || null, tipo: tipoMensaje(m, t),
      })
    }
    if (!nuevos.length) return
    if (prefs.sonido) tonoMensaje(prefs.volumen)

    setAvisos((prev) => {
      let add
      if (nuevos.length >= AGRUPAR_DESDE) {
        // Muchos de golpe → una sola tarjeta agrupada.
        const id = 'g_' + nuevos[0].msgId
        add = [{ id, grupo: true, n: nuevos.length, autor: `${nuevos.length} ${t('nuevos mensajes')}`, texto: nuevos.slice(0, 3).map((x) => x.autor).join(', '), conv: IR_MENSAJES, tipo: { barra: 'bg-brand-navy', punto: 'bg-brand-navy' } }]
      } else {
        add = nuevos.map((n) => ({ id: n.msgId, ...n }))
      }
      const next = [...add, ...prev].slice(0, MAX_VISIBLE)
      // Quita timers de los que se cayeron del tope.
      const vivos = new Set(next.map((a) => a.id))
      Object.keys(timers.current).forEach((id) => { if (!vivos.has(id)) { clearTimeout(timers.current[id]); delete timers.current[id] } })
      add.forEach((a) => programarCierre(a.id))
      return next
    })
  }, [mensajes, gruposActivos, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  const abrir = (a) => {
    quitarYa(a.id)
    if (esRolStaff(rol)) navigate('/bulk/mensajes')
    pedirAbrirConversacion(a.conv || IR_MENSAJES)
  }

  const cambiarPref = (patch) => setPrefsNotif(patch)

  if (!avisos.length && !verCfg) return null
  return (
    <div
      className="pointer-events-none fixed left-3 right-3 z-[80] flex flex-col items-center gap-2 top-[max(0.75rem,env(safe-area-inset-top))] sm:left-auto sm:right-4 sm:items-end"
      role="region" aria-label={t('Notificaciones de mensajes')} aria-live="polite"
    >
      {/* Barra mínima con ajuste de sonido (aparece con los avisos). */}
      {(avisos.length > 0 || verCfg) && (
        <div className="pointer-events-auto flex items-center gap-1 self-end">
          <button
            onClick={() => setVerCfg((v) => !v)}
            title={t('Ajustes de notificación')} aria-label={t('Ajustes de notificación')}
            className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-brand-navy dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300"
          >
            <Settings2 size={14} />
          </button>
        </div>
      )}
      {verCfg && (
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-navy dark:text-slate-100"><Bell size={15} /> {t('Notificaciones')}
            <button onClick={() => setVerCfg(false)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>
          <label className="flex items-center justify-between gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">{prefs.sonido ? <Volume2 size={15} /> : <VolumeX size={15} />} {t('Sonido')}</span>
            <button
              onClick={() => cambiarPref({ sonido: !prefs.sonido })}
              role="switch" aria-checked={prefs.sonido} aria-label={t('Activar sonido')}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${prefs.sonido ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs.sonido ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
          <label className="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="w-16 flex-shrink-0">{t('Volumen')}</span>
            <input
              type="range" min="0" max="100" value={Math.round((prefs.volumen ?? 0.5) * 100)}
              disabled={!prefs.sonido}
              onChange={(e) => cambiarPref({ volumen: Number(e.target.value) / 100 })}
              onMouseUp={() => prefs.sonido && tonoMensaje(prefs.volumen)}
              className="h-1.5 flex-1 cursor-pointer accent-emerald-500 disabled:opacity-40"
              aria-label={t('Volumen de notificaciones')}
            />
          </label>
        </div>
      )}

      {avisos.map((a) => {
        const importante = a.tipo?.importante
        return (
          <div
            key={a.id}
            role={importante ? 'alert' : 'status'}
            tabIndex={0}
            onClick={() => abrir(a)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(a) } }}
            onMouseEnter={() => clearTimeout(timers.current[a.id])}
            onMouseLeave={() => programarCierre(a.id)}
            className={`pointer-events-auto flex w-full max-w-sm cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur transition-all duration-200 motion-reduce:transition-none hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold dark:border-slate-700 dark:bg-slate-800/95 ${a.saliendo ? 'translate-x-3 opacity-0' : 'motion-safe:animate-slide-up'}`}
          >
            {/* Barra de tipo a la izquierda */}
            <span className={`-my-3 -ml-3 mr-0 w-1 self-stretch ${a.tipo?.barra || 'bg-brand-navy'}`} aria-hidden="true" />
            {/* Avatar */}
            {a.grupo ? (
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-100"><Users size={18} /></span>
            ) : a.foto ? (
              <img src={a.foto} alt="" className="h-10 w-10 flex-shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700" />
            ) : (
              <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-black text-white ${colorDe(a.autor)}`}>{inicialesDe(a.autor)}</span>
            )}
            {/* Contenido */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {importante && <AlertTriangle size={13} className="flex-shrink-0 text-rose-500" />}
                <span className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{a.autor}</span>
                <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">{a.hora || t('Ahora')}</span>
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${a.tipo?.punto || 'bg-brand-navy'}`} title={t('Nuevo')} aria-label={t('Nuevo')} />
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{a.texto || t('Nuevo mensaje')}</div>
              {!a.grupo && a.tipo?.label && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${a.tipo.punto}`} /> {a.tipo.label}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); quitarYa(a.id) }} aria-label={t('Cerrar')} className="flex-shrink-0 text-slate-300 hover:text-slate-500 dark:hover:text-slate-200"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}

function horaDe(ts, t) {
  const ms = tsMillis(ts)
  if (!ms) return t('Ahora')
  const diff = Date.now() - ms
  if (diff < 60000) return t('Ahora')
  try { return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) } catch { return t('Ahora') }
}
