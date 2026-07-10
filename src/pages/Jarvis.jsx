// Asistente JARVIS — rediseño: la esfera-cerebro es la protagonista y hay un
// MODO CONVERSACIÓN por voz (hablar → escuchar → pensar → responder hablando),
// con subtítulos grandes. El chat de texto queda como opción secundaria (💬).
// La LÓGICA del asistente (cerebro Anthropic, contexto real, tools, límites de
// seguridad) NO cambia: aquí solo cambia la interfaz y el modo de interacción.
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Mic, Volume2, VolumeX, Loader2, Check, X, MessageSquare, Repeat } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { TODAS } from '../utils/calc'
import { PageTitle, Boton, Aviso } from '../components/ui'
import JarvisSphere from '../components/JarvisSphere'
import {
  preguntarAsistente, ejecutarAccionAsistente, hablar, detenerVoz,
  crearReconocedor, reconocimientoDisponible, detectarIdioma, estadoVozIA,
} from '../utils/asistente'

const RUTA_SECCION = {
  dashboard: '/', pagos: '/pagos', choferes: '/choferes', rutas: '/rutas', claims: '/claims',
  financiero: '/financiero', performance: '/performance', alertas: '/alertas', reclamos: '/reclamos',
  configuracion: '/configuracion', stripe: '/stripe', backups: '/backups', historial: '/historial',
}
const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const LABEL_ESTADO = { idle: '◊ EN ESPERA', listening: '◊ ESCUCHANDO', thinking: '◊ SINAPSIS ACTIVA', speaking: '◊ RESPONDIENDO' }
const COLOR_ESTADO = { idle: '#8ea0bd', listening: '#4ade80', thinking: '#e3c988', speaking: '#c9a24b' }

export default function Jarvis() {
  const navigate = useNavigate()
  const { activeCompanyId, empresaActiva, drivers, facturaRango, setRango, setSelectedCity, reloadDrivers } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const puede = esSuperAdmin || perfil?.role === 'owner'

  const [mensajes, setMensajes] = useState([
    { role: 'assistant', content: 'Hola, soy JARVIS. Toca la esfera o pulsa “Hablar” y pregúntame por rutas, pagos, choferes, claims o fallidos. También abro secciones y aplico filtros.' },
  ])
  const [texto, setTexto] = useState('')
  const [interim, setInterim] = useState('') // lo que se va reconociendo por voz
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState('idle')
  const [vozActiva, setVozActiva] = useState(true)
  const [escuchando, setEscuchando] = useState(false)
  const [continuo, setContinuo] = useState(false)
  const [chatAbierto, setChatAbierto] = useState(false)
  const [propuesta, setPropuesta] = useState(null)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState('')
  const [vozIA, setVozIA] = useState(null)
  const [fuenteVoz, setFuenteVoz] = useState(null)

  const finRef = useRef(null)
  const recRef = useRef(null)
  const continuoRef = useRef(false)
  const escucharRef = useRef(null)

  useEffect(() => () => { detenerVoz(); recRef.current?.detener() }, [])
  useEffect(() => {
    estadoVozIA().then((r) => setVozIA(!!r.configurado)).catch(() => setVozIA(false))
    try { window.speechSynthesis?.getVoices() } catch { /* noop */ }
  }, [])
  useEffect(() => { if (chatAbierto) finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, cargando, chatAbierto])

  const resolverCiudad = useCallback((ciudad) => {
    if (!ciudad || norm(ciudad) === 'todas') return TODAS
    const lista = facturaRango?.resumenCiudades || []
    const m = lista.find((c) => norm(c.ubicacion) === norm(ciudad) || norm(c.nombreCiudad) === norm(ciudad))
    return m ? m.ubicacion : ciudad
  }, [facturaRango])

  const ejecutarAcciones = useCallback((acciones) => {
    for (const ac of acciones || []) {
      if (ac.tipo === 'navegar' || ac.tipo === 'generar_reporte') {
        const path = RUTA_SECCION[ac.seccion]; if (path) navigate(path)
      } else if (ac.tipo === 'aplicar_filtro') {
        if (ac.desde || ac.hasta) setRango({ preset: 'personalizado', desde: ac.desde || '', hasta: ac.hasta || '' })
        else if (ac.preset) setRango({ preset: ac.preset, desde: '', hasta: '' })
        if (ac.ciudad) setSelectedCity(resolverCiudad(ac.ciudad))
      }
    }
  }, [navigate, setRango, setSelectedCity, resolverCiudad])

  const enviar = useCallback(async (preguntaTxt) => {
    const q = (preguntaTxt ?? texto).trim()
    if (!q || cargando) return
    setError(''); setPropuesta(null); setTexto(''); setInterim('')
    const nuevos = [...mensajes, { role: 'user', content: q }]
    setMensajes(nuevos); setCargando(true); setEstado('thinking')
    try {
      const r = await preguntarAsistente({ companyId: activeCompanyId, messages: nuevos })
      if (!r.ok) { setError(r.error || 'No se pudo responder.'); setEstado('idle'); return }
      setMensajes((m) => [...m, { role: 'assistant', content: r.reply }])
      ejecutarAcciones(r.acciones)
      if (r.propuesta) setPropuesta(r.propuesta)
      if (vozActiva && r.reply) {
        setEstado('speaking')
        hablar(r.reply, {
          idioma: detectarIdioma(r.reply),
          onFuente: setFuenteVoz,
          onError: (m) => setError('Voz ElevenLabs no disponible: ' + m + '. Se usó la voz del navegador.'),
          onFin: () => { setEstado('idle'); if (continuoRef.current) setTimeout(() => escucharRef.current?.(), 350) },
        })
      } else { setEstado('idle'); if (continuoRef.current) setTimeout(() => escucharRef.current?.(), 350) }
    } catch (e) {
      setError('Error: ' + e.message); setEstado('idle')
    } finally { setCargando(false) }
  }, [texto, cargando, mensajes, activeCompanyId, vozActiva, ejecutarAcciones])

  // Inicia el reconocimiento de voz (una toma). Al terminar de hablar, envía.
  const iniciarEscucha = useCallback(() => {
    if (!reconocimientoDisponible()) { setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome.'); return }
    detenerVoz()
    setError(''); setInterim('')
    const rec = crearReconocedor({
      idioma: 'es-ES',
      onTexto: (t, final) => { setInterim(t); if (final) { setEscuchando(false); enviar(t) } },
      onFin: () => { setEscuchando(false); setEstado((e) => (e === 'listening' ? 'idle' : e)) },
      onError: (err) => { setEscuchando(false); setEstado('idle'); if (err === 'not-allowed') setError('Permite el micrófono en el navegador para hablar con JARVIS.') },
    })
    recRef.current = rec
    rec?.iniciar(); setEscuchando(true); setEstado('listening')
  }, [enviar])
  useEffect(() => { escucharRef.current = iniciarEscucha }, [iniciarEscucha])

  const activo = escuchando || cargando || estado === 'speaking'
  const detenerTodo = () => {
    continuoRef.current = false; setContinuo(false)
    recRef.current?.detener(); detenerVoz()
    setEscuchando(false); setEstado('idle')
  }
  const alternar = () => { if (activo) detenerTodo(); else iniciarEscucha() }
  const toggleContinuo = () => { const v = !continuo; setContinuo(v); continuoRef.current = v; if (v && !activo) iniciarEscucha() }
  const toggleVoz = () => { if (vozActiva) detenerVoz(); setVozActiva((v) => !v) }

  const confirmar = async () => {
    if (!propuesta) return
    setAplicando(true); setError('')
    try {
      const d = drivers.find((x) => norm(x.nombre) === norm(propuesta.driverNombre)) ||
                drivers.find((x) => norm(x.nombre).includes(norm(propuesta.driverNombre)))
      if (!d) { setError(`No encontré al chofer "${propuesta.driverNombre}".`); return }
      const body = { companyId: activeCompanyId, tipo: propuesta.tipo, driverId: d.id }
      if (propuesta.tipo === 'verificacion_estado') body.estado = propuesta.estado
      if (propuesta.tipo === 'tarifa_chofer') body.tarifa = propuesta.tarifa
      const r = await ejecutarAccionAsistente(body)
      if (!r.ok) { setError(r.error || 'No se pudo aplicar.'); return }
      await reloadDrivers?.()
      setMensajes((m) => [...m, { role: 'assistant', content: `✅ Hecho: ${propuesta.resumen}` }])
      setPropuesta(null)
    } catch (e) { setError('Error: ' + e.message) } finally { setAplicando(false) }
  }

  if (!puede) {
    return (<div><PageTitle>JARVIS</PageTitle><Aviso tipo="warn">Solo el <b>dueño</b> o el súper-admin pueden usar el asistente.</Aviso></div>)
  }

  const ultimaResp = [...mensajes].reverse().find((m) => m.role === 'assistant')?.content || ''
  const subtitulo = escuchando ? (interim || 'Escuchando…') : cargando ? 'Pensando…' : ultimaResp

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>JARVIS</PageTitle>

      {/* HERO: la esfera-cerebro como protagonista */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ background: 'radial-gradient(ellipse at center,#16294a 0%,#13233f 55%,#050a14 100%)' }}>
        <div className="mb-2 text-center">
          <div className="text-sm font-bold tracking-[0.4em] text-brand-gold">J.A.R.V.I.S</div>
          <div className="mt-0.5 text-[10px] tracking-[0.3em] text-brand-gold/70">MILEPAY · NÚCLEO NEURONAL</div>
        </div>

        <div className="flex justify-center py-2">
          <button onClick={alternar} className="cursor-pointer" aria-label="Hablar con JARVIS" title="Toca para hablar">
            <JarvisSphere estado={estado} size={320} />
          </button>
        </div>

        <div className="mx-auto mt-2 max-w-2xl text-center">
          <div className="mb-2 text-xs font-bold tracking-[0.3em]" style={{ color: COLOR_ESTADO[estado] }}>{LABEL_ESTADO[estado]}</div>
          <div className="min-h-[64px] px-2 text-lg leading-relaxed" style={{ color: '#f8f3eb' }}>{subtitulo}</div>
        </div>

        {/* Propuesta de cambio (requiere confirmación) */}
        {propuesta && (
          <div className="mx-auto mt-3 max-w-xl rounded-2xl border border-brand-gold/50 bg-brand-gold/10 p-4 text-center">
            <div className="mb-2 text-sm font-semibold text-brand-gold">Confirmación requerida</div>
            <div className="mb-3 text-sm text-cream" style={{ color: '#f8f3eb' }}>{propuesta.resumen}</div>
            <div className="flex justify-center gap-2">
              <Boton variant="gold" onClick={confirmar} disabled={aplicando}>{aplicando ? <><Loader2 size={15} className="animate-spin" /> Aplicando…</> : <><Check size={15} strokeWidth={2} /> Confirmar</>}</Boton>
              <button onClick={() => setPropuesta(null)} disabled={aplicando} className="inline-flex items-center gap-1 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"><X size={15} strokeWidth={2} /> Cancelar</button>
            </div>
          </div>
        )}

        {error && <div className="mx-auto mt-3 max-w-xl"><Aviso tipo="error">{error}</Aviso></div>}

        {/* Controles */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button onClick={alternar} className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-bold tracking-wide backdrop-blur transition" style={{ borderColor: '#c9a24b', background: activo ? '#c9a24b33' : '#c9a24b18', color: '#c9a24b' }}>
            {activo ? <>◼ DETENER</> : <><Mic size={16} strokeWidth={2} /> HABLAR CON JARVIS</>}
          </button>
          <button onClick={toggleContinuo} title="Conversación continua: reactiva el micrófono tras responder" className="inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-xs font-semibold transition" style={{ borderColor: continuo ? '#4ade80' : '#c9a24b55', background: continuo ? '#4ade8022' : 'transparent', color: continuo ? '#4ade80' : '#c9a24baa' }}>
            <Repeat size={15} strokeWidth={2} /> Continuo
          </button>
          <button onClick={toggleVoz} title={vozActiva ? 'Silenciar voz' : 'Activar voz'} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-xs font-semibold transition" style={{ borderColor: '#c9a24b55', color: vozActiva ? '#c9a24b' : '#8ea0bd' }}>
            {vozActiva ? <Volume2 size={15} strokeWidth={2} /> : <VolumeX size={15} strokeWidth={2} />}
          </button>
          <button onClick={() => setChatAbierto((c) => !c)} title="Abrir/cerrar chat de texto" className="inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-xs font-semibold transition" style={{ borderColor: '#c9a24b55', background: chatAbierto ? '#c9a24b18' : 'transparent', color: '#c9a24b' }}>
            <MessageSquare size={15} strokeWidth={2} /> Chat
          </button>
        </div>

        {/* Indicador de qué voz está activa */}
        <div className="mt-3 text-center text-[11px]">
          {vozIA === null ? <span className="text-slate-400">Comprobando voz…</span>
            : fuenteVoz === 'elevenlabs-alt' ? <span className="text-amber-400">● Voz alterna de ElevenLabs (tu voz elegida es de biblioteca: agrégala a “My Voices” con tu plan de pago)</span>
            : vozIA ? <span className="text-emerald-400">● Voz IA (ElevenLabs) activa</span>
            : <span className="text-amber-400">Voz del navegador · ElevenLabs no disponible (revisa variables + Redeploy)</span>}
          {fuenteVoz === 'navegador' && vozIA && <span className="ml-2 text-amber-400">· sonó la voz del navegador (¿autoplay? toca 🔊 y reintenta)</span>}
        </div>
      </div>

      {/* CHAT de texto (secundario) */}
      {chatAbierto && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-surface-dark-card">
          <div className="scroll-thin max-h-[46vh] space-y-3 overflow-y-auto p-4">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>{m.content}</div>
              </div>
            ))}
            {cargando && <div className="flex justify-start"><div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800"><Loader2 size={15} className="animate-spin" /> Pensando…</div></div>}
            <div ref={finRef} />
          </div>
          <div className="border-t border-slate-200 p-3 dark:border-slate-700/60">
            <div className="flex items-end gap-2">
              <textarea rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} placeholder="Escribe tu pregunta…" className="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              <Boton variant="gold" onClick={() => enviar()} disabled={cargando || !texto.trim()}><Send size={16} strokeWidth={1.9} /></Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
