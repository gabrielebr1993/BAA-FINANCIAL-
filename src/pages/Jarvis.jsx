// Asistente JARVIS: chat + voz (habla y escucha) + acciones seguras.
// El cerebro vive en /api/asistente; aquí se pinta la conversación, se maneja la
// voz y se EJECUTAN en el navegador las acciones que devuelve (navegar, filtrar,
// exportar) y las propuestas de cambio (con confirmación explícita).
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Send, Mic, MicOff, Volume2, VolumeX, Loader2, Check, X } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { TODAS } from '../utils/calc'
import { Card, PageTitle, Boton, Aviso } from '../components/ui'
import JarvisSphere from '../components/JarvisSphere'
import {
  preguntarAsistente, ejecutarAccionAsistente, hablar, detenerVoz,
  crearReconocedor, reconocimientoDisponible, detectarIdioma,
} from '../utils/asistente'

const RUTA_SECCION = {
  dashboard: '/', pagos: '/pagos', choferes: '/choferes', rutas: '/rutas', claims: '/claims',
  financiero: '/financiero', performance: '/performance', alertas: '/alertas', reclamos: '/reclamos',
  configuracion: '/configuracion', stripe: '/stripe', backups: '/backups', historial: '/historial',
}

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function Jarvis() {
  const navigate = useNavigate()
  const { activeCompanyId, empresaActiva, drivers, facturaRango, setRango, setSelectedCity, reloadDrivers } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const puede = esSuperAdmin || perfil?.role === 'owner'

  const [mensajes, setMensajes] = useState([
    { role: 'assistant', content: '¡Hola! Soy JARVIS. Pregúntame por tus rutas, pagos, choferes, claims o fallidos. También puedo abrir secciones y aplicar filtros. ¿En qué te ayudo?' },
  ])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState('idle') // idle | listening | speaking | thinking
  const [vozActiva, setVozActiva] = useState(true)
  const [escuchando, setEscuchando] = useState(false)
  const [propuesta, setPropuesta] = useState(null)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState('')
  const finRef = useRef(null)
  const recRef = useRef(null)

  useEffect(() => () => detenerVoz(), [])
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, cargando, propuesta])

  // Resuelve el código de ciudad a partir de un nombre/código aproximado.
  const resolverCiudad = useCallback((ciudad) => {
    if (!ciudad || norm(ciudad) === 'todas') return TODAS
    const lista = facturaRango?.resumenCiudades || []
    const m = lista.find((c) => norm(c.ubicacion) === norm(ciudad) || norm(c.nombreCiudad) === norm(ciudad))
    return m ? m.ubicacion : ciudad
  }, [facturaRango])

  const ejecutarAcciones = useCallback((acciones) => {
    for (const ac of acciones || []) {
      if (ac.tipo === 'navegar' || ac.tipo === 'generar_reporte') {
        const path = RUTA_SECCION[ac.seccion]
        if (path) navigate(path)
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
    setError(''); setPropuesta(null); setTexto('')
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
        hablar(r.reply, { idioma: detectarIdioma(r.reply), onFin: () => setEstado('idle') })
      } else setEstado('idle')
    } catch (e) {
      setError('Error: ' + e.message); setEstado('idle')
    } finally { setCargando(false) }
  }, [texto, cargando, mensajes, activeCompanyId, vozActiva, ejecutarAcciones])

  // --- Micrófono ---
  const toggleMic = () => {
    if (escuchando) { recRef.current?.detener(); return }
    if (!reconocimientoDisponible()) { setError('Tu navegador no soporta reconocimiento de voz. Prueba en Chrome.'); return }
    detenerVoz()
    const rec = crearReconocedor({
      idioma: 'es-ES',
      onTexto: (t, final) => { setTexto(t); if (final) { setEscuchando(false); enviar(t) } },
      onFin: () => { setEscuchando(false); setEstado('idle') },
      onError: () => { setEscuchando(false); setEstado('idle') },
    })
    recRef.current = rec
    rec?.iniciar(); setEscuchando(true); setEstado('listening')
  }

  const toggleVoz = () => { if (vozActiva) detenerVoz(); setVozActiva((v) => !v) }

  // --- Confirmar propuesta de cambio ---
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
    return (
      <div>
        <PageTitle>JARVIS</PageTitle>
        <Aviso tipo="warn">Solo el <b>dueño</b> o el súper-admin pueden usar el asistente.</Aviso>
      </div>
    )
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>
        <span className="inline-flex items-center gap-2"><Sparkles size={22} strokeWidth={1.8} className="text-brand-gold" /> JARVIS</span>
      </PageTitle>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Esfera + controles de voz */}
        <Card className="flex flex-col items-center gap-3 p-5">
          <div className="rounded-2xl bg-brand-navy p-4">
            <JarvisSphere estado={estado} size={170} />
          </div>
          <div className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {estado === 'listening' ? 'Escuchando…' : estado === 'speaking' ? 'Hablando…' : estado === 'thinking' ? 'Pensando…' : 'Listo'}
          </div>
          <div className="flex gap-2">
            <button onClick={toggleMic} title="Dictar por voz" className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${escuchando ? 'border-sky-400 bg-sky-50 text-sky-600 dark:bg-sky-500/10' : 'border-slate-300 text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:text-slate-300'}`}>
              {escuchando ? <MicOff size={16} strokeWidth={1.9} /> : <Mic size={16} strokeWidth={1.9} />}
            </button>
            <button onClick={toggleVoz} title={vozActiva ? 'Silenciar voz' : 'Activar voz'} className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${vozActiva ? 'border-brand-gold bg-brand-gold/10 text-brand-navy dark:text-brand-gold' : 'border-slate-300 text-slate-500 dark:border-slate-600'}`}>
              {vozActiva ? <Volume2 size={16} strokeWidth={1.9} /> : <VolumeX size={16} strokeWidth={1.9} />}
            </button>
          </div>
        </Card>

        {/* Conversación */}
        <Card className="flex h-[62vh] flex-col p-0">
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start"><div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800"><Loader2 size={15} className="animate-spin" /> Pensando…</div></div>
            )}

            {propuesta && (
              <div className="rounded-2xl border border-brand-gold/50 bg-brand-gold/10 p-4">
                <div className="mb-2 text-sm font-semibold text-brand-navy dark:text-slate-100">Confirmación requerida</div>
                <div className="mb-3 text-sm text-slate-700 dark:text-slate-200">{propuesta.resumen}</div>
                <div className="flex gap-2">
                  <Boton variant="gold" onClick={confirmar} disabled={aplicando}>{aplicando ? <><Loader2 size={15} className="animate-spin" /> Aplicando…</> : <><Check size={15} strokeWidth={2} /> Confirmar</>}</Boton>
                  <Boton variant="ghost" onClick={() => setPropuesta(null)} disabled={aplicando}><X size={15} strokeWidth={2} /> Cancelar</Boton>
                </div>
              </div>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div ref={finRef} />
          </div>

          <div className="border-t border-slate-200 p-3 dark:border-slate-700/60">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                placeholder="Escribe o dicta tu pregunta…"
                className="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <Boton variant="gold" onClick={() => enviar()} disabled={cargando || !texto.trim()}><Send size={16} strokeWidth={1.9} /></Boton>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
