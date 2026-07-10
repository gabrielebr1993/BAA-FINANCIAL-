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
import { generarReporteAsistente } from '../utils/reporteAsistente'
import { PageTitle, Boton, Aviso } from '../components/ui'
import JarvisSphere from '../components/JarvisSphere'
import {
  preguntarAsistente, ejecutarAccionAsistente, hablar, detenerVoz, desbloquearAudio,
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
  const { activeCompanyId, empresaActiva, drivers, claims, facturaRango, selectedCity, setRango, setSelectedCity, reloadDrivers } = useData()
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
  const [animo, setAnimo] = useState('neutro') // ánimo de la última respuesta

  const finRef = useRef(null)
  const recRef = useRef(null)
  const continuoRef = useRef(false)
  const escucharRef = useRef(null)
  const silencioRef = useRef(null)
  const cancelRef = useRef(false)

  useEffect(() => () => { detenerVoz(); recRef.current?.detener(); if (silencioRef.current) clearTimeout(silencioRef.current) }, [])
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

  const ejecutarAcciones = useCallback(async (acciones) => {
    for (const ac of acciones || []) {
      if (ac.tipo === 'navegar') {
        const path = RUTA_SECCION[ac.seccion]; if (path) navigate(path)
      } else if (ac.tipo === 'generar_reporte') {
        try {
          const r = await generarReporteAsistente(ac.seccion, ac.formato, { facturaRango, claims, drivers, selectedCity })
          setMensajes((m) => [...m, { role: 'assistant', content: `📥 Descargando ${r.formato}: ${r.titulo} (${r.filas} filas).` }])
        } catch (e) {
          setError('No se pudo generar el reporte: ' + e.message)
        }
      } else if (ac.tipo === 'aplicar_filtro') {
        if (ac.desde || ac.hasta) setRango({ preset: 'personalizado', desde: ac.desde || '', hasta: ac.hasta || '' })
        else if (ac.preset) setRango({ preset: ac.preset, desde: '', hasta: '' })
        if (ac.ciudad) setSelectedCity(resolverCiudad(ac.ciudad))
      }
    }
  }, [navigate, setRango, setSelectedCity, resolverCiudad, facturaRango, claims, drivers, selectedCity])

  const enviar = useCallback(async (preguntaTxt) => {
    const q = (preguntaTxt ?? texto).trim()
    if (!q || cargando) return
    setError(''); setPropuesta(null); setTexto(''); setInterim('')
    const nuevos = [...mensajes, { role: 'user', content: q }]
    setMensajes(nuevos); setCargando(true); setEstado('thinking')
    try {
      const r = await preguntarAsistente({ companyId: activeCompanyId, messages: nuevos })
      if (!r.ok) { setError(r.error || 'No se pudo responder.'); setEstado('idle'); return }
      const mood = r.mood || 'neutro'
      setAnimo(mood)
      setMensajes((m) => [...m, { role: 'assistant', content: r.reply }])
      await ejecutarAcciones(r.acciones)
      if (r.propuesta) setPropuesta(r.propuesta)
      if (vozActiva && r.reply) {
        setEstado('speaking')
        hablar(r.reply, {
          idioma: detectarIdioma(r.reply), mood,
          onFuente: setFuenteVoz,
          onError: (m) => setError('Voz ElevenLabs no disponible: ' + m + '. Se usó la voz del navegador.'),
          onFin: () => { setEstado('idle'); if (continuoRef.current) setTimeout(() => escucharRef.current?.(), 350) },
        })
      } else { setEstado('idle'); if (continuoRef.current) setTimeout(() => escucharRef.current?.(), 350) }
    } catch (e) {
      setError('Error: ' + e.message); setEstado('idle')
    } finally { setCargando(false) }
  }, [texto, cargando, mensajes, activeCompanyId, vozActiva, ejecutarAcciones])

  // Inicia el reconocimiento de voz (una toma). Envía cuando detecta que
  // terminaste: por "final" del navegador, por pausa de ~1.6 s, o al cerrarse el
  // micro (algunos navegadores no marcan "final"). No envía si tú lo detienes.
  const iniciarEscucha = useCallback(() => {
    if (!reconocimientoDisponible()) { setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome.'); return }
    detenerVoz()
    setError(''); setInterim('')
    cancelRef.current = false
    let ultimo = ''
    let enviado = false
    const limpiarSilencio = () => { if (silencioRef.current) { clearTimeout(silencioRef.current); silencioRef.current = null } }
    const despachar = (t) => { if (enviado) return; const q = (t || '').trim(); if (!q) return; enviado = true; limpiarSilencio(); setEscuchando(false); enviar(q) }

    const rec = crearReconocedor({
      idioma: 'es-ES',
      onTexto: (t, final) => {
        ultimo = t; setInterim(t)
        limpiarSilencio()
        if (final) { despachar(t); return }
        // Pausa larga sin nuevas palabras → cierra el micro para forzar el envío.
        silencioRef.current = setTimeout(() => { try { recRef.current?.detener() } catch { /* noop */ } }, 1600)
      },
      onFin: () => {
        limpiarSilencio()
        setEscuchando(false)
        setEstado((e) => (e === 'listening' ? 'idle' : e))
        if (!cancelRef.current) despachar(ultimo) // envía lo capturado aunque no hubo "final"
      },
      onError: (err) => {
        limpiarSilencio(); setEscuchando(false); setEstado('idle')
        if (err === 'not-allowed') setError('Permite el micrófono en el navegador para hablar con JARVIS.')
      },
    })
    recRef.current = rec
    rec?.iniciar(); setEscuchando(true); setEstado('listening')
  }, [enviar])
  useEffect(() => { escucharRef.current = iniciarEscucha }, [iniciarEscucha])

  const activo = escuchando || cargando || estado === 'speaking'
  const detenerTodo = () => {
    continuoRef.current = false; setContinuo(false)
    cancelRef.current = true // no enviar lo capturado: es una cancelación explícita
    if (silencioRef.current) { clearTimeout(silencioRef.current); silencioRef.current = null }
    recRef.current?.detener(); detenerVoz()
    setEscuchando(false); setEstado('idle')
  }
  const alternar = () => { desbloquearAudio(); if (activo) detenerTodo(); else iniciarEscucha() }
  const toggleContinuo = () => { desbloquearAudio(); const v = !continuo; setContinuo(v); continuoRef.current = v; if (v && !activo) iniciarEscucha() }
  const toggleVoz = () => { desbloquearAudio(); if (vozActiva) detenerVoz(); setVozActiva((v) => !v) }

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

      {/* HERO claro: la esfera-cerebro (canvas transparente) sobre el fondo de la app */}
      <div className="flex flex-col items-center pt-2">
        <div className="text-center">
          <div className="text-xs font-bold tracking-[0.4em] text-brand-gold">J.A.R.V.I.S</div>
          <div className="mt-0.5 text-[10px] tracking-[0.3em] text-brand-gold/60">MILEPAY · NÚCLEO NEURONAL</div>
        </div>

        <button onClick={alternar} className="cursor-pointer" style={{ marginTop: -30, marginBottom: -30 }} aria-label="Hablar con JARVIS" title="Toca para hablar">
          <JarvisSphere estado={estado} size={700} animo={animo} />
        </button>

        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-2 text-xs font-bold tracking-[0.3em]" style={{ color: COLOR_ESTADO[estado] }}>{LABEL_ESTADO[estado]}</div>
          <div className="min-h-[56px] px-2 text-lg leading-relaxed text-slate-700 dark:text-slate-200">{subtitulo}</div>
        </div>

        {/* Propuesta de cambio (requiere confirmación) */}
        {propuesta && (
          <div className="mx-auto mt-3 max-w-xl rounded-2xl border border-brand-gold/50 bg-brand-gold/10 p-4 text-center">
            <div className="mb-2 text-sm font-semibold text-brand-navy dark:text-brand-gold">Confirmación requerida</div>
            <div className="mb-3 text-sm text-slate-700 dark:text-slate-200">{propuesta.resumen}</div>
            <div className="flex justify-center gap-2">
              <Boton variant="gold" onClick={confirmar} disabled={aplicando}>{aplicando ? <><Loader2 size={15} className="animate-spin" /> Aplicando…</> : <><Check size={15} strokeWidth={2} /> Confirmar</>}</Boton>
              <Boton variant="ghost" onClick={() => setPropuesta(null)} disabled={aplicando}><X size={15} strokeWidth={2} /> Cancelar</Boton>
            </div>
          </div>
        )}

        {error && <div className="mx-auto mt-3 w-full max-w-xl"><Aviso tipo="error">{error}</Aviso></div>}

        {/* Controles (estilo claro) */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button onClick={alternar} className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold tracking-wide text-white shadow-lg transition hover:brightness-105" style={{ background: '#c9a24b', boxShadow: '0 6px 18px rgba(201,162,75,0.4)' }}>
            {activo ? <>◼ Detener</> : <><Mic size={16} strokeWidth={2} /> Hablar con JARVIS</>}
          </button>
          <button onClick={toggleContinuo} title="Conversación continua: reactiva el micrófono tras responder" className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-xs font-semibold transition ${continuo ? 'border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'border-brand-gold/50 bg-white text-[#8a6d2f] hover:bg-brand-gold/5 dark:border-slate-600 dark:bg-slate-800 dark:text-brand-gold'}`}>
            <Repeat size={15} strokeWidth={2} /> Continuo
          </button>
          <button onClick={toggleVoz} title={vozActiva ? 'Silenciar voz' : 'Activar voz'} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {vozActiva ? <Volume2 size={15} strokeWidth={2} className="text-brand-gold" /> : <VolumeX size={15} strokeWidth={2} />}
          </button>
          <button onClick={() => setChatAbierto((c) => !c)} title="Abrir/cerrar chat de texto" className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-xs font-semibold transition ${chatAbierto ? 'border-brand-gold bg-brand-gold/10 text-[#8a6d2f] dark:text-brand-gold' : 'border-slate-300 bg-white text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <MessageSquare size={15} strokeWidth={2} /> Chat
          </button>
        </div>

        {/* Indicador de qué voz está activa */}
        <div className="mt-3 text-center text-[11px]">
          {vozIA === null ? <span className="text-slate-400">Comprobando voz…</span>
            : fuenteVoz === 'elevenlabs-alt' ? <span className="text-amber-600 dark:text-amber-400">● Voz alterna de ElevenLabs (tu voz elegida es de biblioteca: agrégala a “My Voices” con tu plan de pago)</span>
            : vozIA ? <span className="text-emerald-600 dark:text-emerald-400">● Voz IA (ElevenLabs) activa</span>
            : <span className="text-amber-600 dark:text-amber-400">Voz del navegador · ElevenLabs no disponible (revisa variables + Redeploy)</span>}
          {fuenteVoz === 'navegador' && vozIA && <span className="ml-2 text-amber-600 dark:text-amber-400">· sonó la voz del navegador (¿autoplay? toca 🔊 y reintenta)</span>}
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
              <Boton variant="gold" onClick={() => { desbloquearAudio(); enviar() }} disabled={cargando || !texto.trim()}><Send size={16} strokeWidth={1.9} /></Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
