// ============================================================================
// BULK · Llamadas 1-a-1 de voz/video (WebRTC) — proveedor global.
// - Expone `useLlamada().iniciar(paraUid, nombre, tipo)` para llamar desde cualquier
//   parte (p. ej. la tarjeta de perfil en el chat).
// - Escucha llamadas ENTRANTES para el usuario actual y muestra el timbre.
// - El audio/video va P2P (WebRTC); Firestore solo lleva la señalización.
// Aislamiento por reglas: solo los 2 participantes acceden a la llamada.
// ============================================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, PhoneIncoming, Minimize2, Maximize2, MonitorUp, SwitchCamera, PenTool, MessageSquare, Eraser, Send, X, Hand, Captions, Settings, Disc, StopCircle, Users, UserPlus, MicOff as MicOffMini } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { enviarMensaje } from '../data/chat'
import {
  nuevaConexion, callRef, candCol, crearLlamada, actualizarLlamada,
  agregarCandidato, escucharEntrantes, limpiarLlamada, onSnapshot, obtenerLlamada,
} from '../data/llamadas'
import {
  crearSala, unirseSala, salirSala, invitarASala, escucharSala,
  enviarSenal, escucharSenales, escucharSalasEntrantes, salaRef,
} from '../data/salas'
import { updateDoc } from 'firebase/firestore'
import Avatar from './Avatar'
import { useAvatares } from '../data/useCodigoUsuario'
import LlamadaGrupoModal from './LlamadaGrupoModal'
import { useLang } from '../../i18n'

const LlamadaContext = createContext({ iniciar: () => {}, iniciarGrupo: () => {}, pedirLlamadaGrupo: () => {} })
export const useLlamada = () => useContext(LlamadaContext)

// Baldosa de un participante REMOTO en la llamada grupal. Se define fuera del
// proveedor para que no se re-monte en cada render (evita parpadeo del video).
function TileRemoto({ stream, nombre, rol, hablando, mano, esVideo, t }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream })
  const inicial = ((nombre || '?').trim().charAt(0) || '?').toUpperCase()
  const tieneVideo = esVideo && stream && stream.getVideoTracks().some((tr) => tr.enabled)
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-800 ring-1 transition ${hablando ? 'ring-2 ring-emerald-400' : 'ring-white/10'}`}>
      {esVideo && <video ref={ref} autoPlay playsInline className={`h-full w-full object-cover ${tieneVideo ? '' : 'hidden'}`} />}
      {!esVideo && <audio ref={ref} autoPlay />}
      {!tieneVideo && (
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-2xl font-black text-slate-900">{inicial}</div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
        <span className="truncate text-xs font-semibold text-white">{nombre || t('Participante')}</span>
        {mano && <Hand size={13} className="ml-auto flex-shrink-0 text-amber-400" />}
      </div>
      {hablando && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow" />}
    </div>
  )
}

export default function LlamadaProvider({ children }) {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  const avatares = useAvatares()

  const [fase, setFase] = useState('idle') // idle | saliente | entrante | activa
  const [info, setInfo] = useState(null)    // { callId, con, tipo, saliente }
  const [entrante, setEntrante] = useState(null) // doc de llamada entrante
  const [micOff, setMicOff] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [min, setMin] = useState(false)   // llamada minimizada (seguir usando la web)
  const [tick, setTick] = useState(0)      // refresca el cronómetro cada segundo
  const [compartiendo, setCompartiendo] = useState(false)
  const pantallaRef = useRef(null)
  const [pos, setPos] = useState(null)     // posición del widget minimizado {x,y}; null = esquina
  const dragRef = useRef(null)
  // Colaboración en llamada (por canal de datos WebRTC): pizarra, chat, reacciones.
  const [pizarra, setPizarra] = useState(false)
  const [chatAbierto, setChatAbierto] = useState(false)
  const [mensajesCall, setMensajesCall] = useState([]) // {mio, texto}
  const [reaccion, setReaccion] = useState(null)        // emoji flotante temporal
  const [color, setColor] = useState('#f43f5e')
  const [noLeidoCall, setNoLeidoCall] = useState(0)
  const dcRef = useRef(null)
  const canvasRef = useRef(null)
  const dibujoRef = useRef(null)
  const chatInputRef = useRef(null)
  // Extras: grabar, levantar mano, subtítulos, quién habla, dispositivos.
  const [grabando, setGrabando] = useState(false)
  const [manoMia, setManoMia] = useState(false)
  const [manoOtro, setManoOtro] = useState(false)
  const [subsOn, setSubsOn] = useState(false)
  const [subMio, setSubMio] = useState('')
  const [subOtro, setSubOtro] = useState('')
  const [hablaOtro, setHablaOtro] = useState(false)
  const [ajustes, setAjustes] = useState(false)
  const [dispos, setDispos] = useState({ mics: [], cams: [], salidas: [] })
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recognitionRef = useRef(null)
  const analizaRef = useRef(null)

  const pcRef = useRef(null)
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const callIdRef = useRef(null)
  const unsubDoc = useRef(null)
  const unsubCand = useRef(null)
  const faseRef = useRef('idle')
  const localVid = useRef(null)
  const remoteVid = useRef(null)
  const ctxRef = useRef(null)     // { chatId, participantes } del chat desde donde se llamó
  const tipoRef = useRef('audio')
  const inicioRef = useRef(null)  // ms en que se contestó (para la duración)
  const logRef = useRef(() => {})
  const tonoRef = useRef(null)
  // ── LLAMADA GRUPAL (malla / mesh) ───────────────────────────────────────────
  // peersRef: Map(uid → { pc, stream, nombre, rol, dc, pendientesIce, hablando,
  //   mano, audioCtx, analyser, raf }). Una conexión P2P por cada otro participante.
  const [remotos, setRemotos] = useState([]) // [{uid, nombre, rol, hablando, mano}]
  const [agregarAbierto, setAgregarAbierto] = useState(false)
  // Selector de personas (directorio + matriz) para INICIAR una llamada grupal o
  // AÑADIR personas: garantiza invitar uids REALES (así el timbre sí les llega).
  const [pickGrupo, setPickGrupo] = useState(null) // { tipo, titulo, preseleccion:[uid], onConfirmar }
  const peersRef = useRef(new Map())
  const salaIdRef = useRef(null)
  const salaDataRef = useRef(null)
  const esGrupoRef = useRef(false)
  const unsubSala = useRef(null)
  const unsubSenales = useRef(null)
  const localGridRef = useRef(null)
  const compartiendoRef = useRef(false)
  const miNombre = () => usuario?.nombre || usuario?.email || ''
  useEffect(() => { faseRef.current = fase }, [fase])
  useEffect(() => { compartiendoRef.current = compartiendo }, [compartiendo])

  // Tono de repique CONTINUO. saliente = "ringback" (tono doble largo repetido);
  // entrante = melodía tri-tono más marcada. Se agenda por ciclos con Web Audio.
  const pararTono = () => { const tr = tonoRef.current; if (!tr) return; try { clearInterval(tr.intervalo); tr.ctx.close() } catch { /* noop */ } tonoRef.current = null }
  const iniciarTono = (esEntrante) => {
    pararTono()
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const nota = (freq, ini, dur, vol = 0.2) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.type = 'sine'; o.frequency.value = freq
        o.connect(g); g.connect(ctx.destination)
        g.gain.setValueAtTime(0.0001, ini)
        g.gain.exponentialRampToValueAtTime(vol, ini + 0.04)
        g.gain.setValueAtTime(vol, ini + Math.max(0.06, dur - 0.06))
        g.gain.exponentialRampToValueAtTime(0.0001, ini + dur)
        o.start(ini); o.stop(ini + dur + 0.02)
      }
      const ciclo = () => {
        const t0 = ctx.currentTime + 0.02
        if (esEntrante) {
          // "di-di-diií" — más urgente y melódico
          nota(659, t0, 0.16); nota(784, t0 + 0.2, 0.16); nota(659, t0 + 0.4, 0.16); nota(880, t0 + 0.6, 0.28)
        } else {
          // ringback clásico: dos tonos largos "riiing — riiing"
          nota(440, t0, 0.7, 0.16); nota(480, t0, 0.7, 0.12)
          nota(440, t0 + 0.9, 0.7, 0.16); nota(480, t0 + 0.9, 0.7, 0.12)
        }
      }
      ciclo()
      tonoRef.current = { ctx, intervalo: setInterval(ciclo, esEntrante ? 1300 : 3200) }
    } catch { /* noop */ }
  }
  useEffect(() => {
    if (fase === 'saliente') iniciarTono(false)
    else if (fase === 'entrante') iniciarTono(true)
    else pararTono()
  }, [fase])

  // ── Colaboración por CANAL DE DATOS (pizarra / chat / reacciones) ───────────
  const dibujarSegmento = (a, b, col) => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    ctx.strokeStyle = col || '#f43f5e'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(a.x * cv.width, a.y * cv.height); ctx.lineTo(b.x * cv.width, b.y * cv.height); ctx.stroke()
  }
  const limpiarLienzo = () => { const cv = canvasRef.current; if (cv) cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height) }
  const enviarDC = (obj) => { try { if (dcRef.current?.readyState === 'open') dcRef.current.send(JSON.stringify(obj)) } catch { /* noop */ } }
  const manejarDC = (raw) => {
    let m; try { m = JSON.parse(raw) } catch { return }
    if (m.tipo === 'draw') dibujarSegmento(m.a, m.b, m.color)
    else if (m.tipo === 'clear') limpiarLienzo()
    else if (m.tipo === 'pizarra') setPizarra(!!m.abrir)
    else if (m.tipo === 'chat') { setMensajesCall((s) => [...s, { mio: false, texto: m.texto }]); if (!chatAbierto) setNoLeidoCall((n) => n + 1) }
    else if (m.tipo === 'react') { setReaccion({ e: m.emoji, k: Date.now() }); setTimeout(() => setReaccion(null), 2500) }
    else if (m.tipo === 'mano') setManoOtro(!!m.arriba)
    else if (m.tipo === 'sub') setSubOtro(m.texto || '')
  }
  const configurarDC = (dc) => {
    dcRef.current = dc
    dc.onmessage = (e) => manejarDC(e.data)
    dc.onclose = () => { if (dcRef.current === dc) dcRef.current = null }
  }
  // Difunde por el/los canal(es) de datos: en grupo a todos los peers, en 1-a-1 al único.
  const difundir = (obj) => { if (esGrupoRef.current) enviarDCGrupo(obj); else enviarDC(obj) }
  const enviarChatCall = (txt) => {
    const v = (txt || '').trim(); if (!v) return
    setMensajesCall((s) => [...s, { mio: true, texto: v }]); difundir({ tipo: 'chat', texto: v })
    if (chatInputRef.current) chatInputRef.current.value = ''
  }
  const enviarReaccion = (emoji) => { setReaccion({ e: emoji, k: Date.now() }); setTimeout(() => setReaccion(null), 2500); difundir({ tipo: 'react', emoji }) }
  const togglePizarra = () => { const v = !pizarra; setPizarra(v); enviarDC({ tipo: 'pizarra', abrir: v }) }
  const limpiarPizarra = () => { limpiarLienzo(); enviarDC({ tipo: 'clear' }) }
  // Trazos en el lienzo (coordenadas normalizadas 0..1 para que coincidan en ambos).
  const puntoNorm = (e) => { const cv = canvasRef.current; const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } }
  const lienzoDown = (e) => { dibujoRef.current = puntoNorm(e) }
  const lienzoMove = (e) => {
    if (!dibujoRef.current) return
    const p = puntoNorm(e); const a = dibujoRef.current
    dibujarSegmento(a, p, color); enviarDC({ tipo: 'draw', a, b: p, color }); dibujoRef.current = p
  }
  const lienzoUp = () => { dibujoRef.current = null }

  // ── Grabar la llamada (local → descarga) ────────────────────────────────────
  const toggleGrabar = () => {
    if (grabando) { try { recorderRef.current?.stop() } catch { /* noop */ } return }
    try {
      const tracks = [
        ...(remoteRef.current?.getTracks() || []),
        ...(localRef.current?.getAudioTracks() || []),
      ]
      if (!tracks.length) return
      const mezcla = new MediaStream(tracks)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
      const rec = new MediaRecorder(mezcla, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `llamada-${info?.con || ''}.webm`; a.click()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        } catch { /* noop */ }
        setGrabando(false)
      }
      rec.start(); recorderRef.current = rec; setGrabando(true)
    } catch { alert(t('Este navegador no permite grabar la llamada.')) }
  }

  // ── Levantar la mano ────────────────────────────────────────────────────────
  const toggleMano = () => { const v = !manoMia; setManoMia(v); difundir({ tipo: 'mano', arriba: v }) }

  // ── Subtítulos en vivo (voz → texto) ────────────────────────────────────────
  const toggleSubs = () => {
    if (subsOn) { try { recognitionRef.current?.stop() } catch { /* noop */ } recognitionRef.current = null; setSubsOn(false); setSubMio(''); enviarDC({ tipo: 'sub', texto: '', fin: true }); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert(t('Tu navegador no soporta subtítulos en vivo (usa Chrome).')); return }
    try {
      const rec = new SR(); rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = true
      rec.onresult = (e) => {
        let txt = ''
        for (let i = e.resultIndex; i < e.results.length; i++) txt = e.results[i][0].transcript
        setSubMio(txt); enviarDC({ tipo: 'sub', texto: txt })
      }
      rec.onend = () => { if (recognitionRef.current) { try { rec.start() } catch { /* noop */ } } }
      rec.start(); recognitionRef.current = rec; setSubsOn(true)
    } catch { setSubsOn(false) }
  }

  // ── Indicador de "quién habla" (nivel de audio del remoto) ──────────────────
  useEffect(() => {
    if (fase !== 'activa' || !remoteRef.current) return
    let raf, ctx, analyser
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      ctx = new AC(); const src = ctx.createMediaStreamSource(remoteRef.current)
      analyser = ctx.createAnalyser(); analyser.fftSize = 512; src.connect(analyser)
      const datos = new Uint8Array(analyser.frequencyBinCount)
      let ultimo = 0
      const loop = () => {
        analyser.getByteFrequencyData(datos)
        const vol = datos.reduce((a, b) => a + b, 0) / datos.length
        const ahora = vol > 18
        const tNow = Date.now()
        if (tNow - ultimo > 180) { setHablaOtro(ahora); ultimo = tNow }
        raf = requestAnimationFrame(loop)
      }
      loop()
    } catch { /* noop */ }
    return () => { try { cancelAnimationFrame(raf); ctx?.close() } catch { /* noop */ } }
  }, [fase])

  // ── Elegir dispositivos (mic / cámara / altavoz) ────────────────────────────
  const cargarDispositivos = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDispos({
        mics: list.filter((d) => d.kind === 'audioinput'),
        cams: list.filter((d) => d.kind === 'videoinput'),
        salidas: list.filter((d) => d.kind === 'audiooutput'),
      })
    } catch { /* noop */ }
  }
  const usarMic = async (deviceId) => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
      const track = st.getAudioTracks()[0]
      await reemplazarEnTodos('audio', track)
      const old = localRef.current?.getAudioTracks?.()[0]; if (old && localRef.current) { localRef.current.removeTrack(old); old.stop() }
      localRef.current?.addTrack(track)
    } catch { /* noop */ }
  }
  const usarCam = async (deviceId) => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
      const track = st.getVideoTracks()[0]
      await reemplazarEnTodos('video', track)
      const old = localRef.current?.getVideoTracks?.()[0]; if (old && localRef.current) { localRef.current.removeTrack(old); old.stop() }
      localRef.current?.addTrack(track)
      if (localVid.current) localVid.current.srcObject = localRef.current
      if (localGridRef.current) localGridRef.current.srcObject = localRef.current
    } catch { /* noop */ }
  }
  const usarSalida = async (deviceId) => { try { await remoteVid.current?.setSinkId?.(deviceId) } catch { /* noop */ } }

  // Registra la llamada en el chat de origen (para dejar HISTORIAL: perdida o duración).
  // Solo lo hace quien LLAMÓ (tiene el contexto del chat); el mensaje lo ven ambos.
  logRef.current = (contestada, durMs) => {
    const ctx = ctxRef.current
    if (!ctx?.chatId || !usuario?.id) return
    const etq = tipoRef.current === 'video' ? t('Videollamada') : t('Llamada')
    let texto
    if (contestada) {
      const s = Math.max(0, Math.round(durMs / 1000)); const mm = Math.floor(s / 60); const ss = String(s % 60).padStart(2, '0')
      texto = `📞 ${etq} · ${mm}:${ss}`
    } else {
      texto = `📞 ${t('Llamada perdida')}`
    }
    enviarMensaje(tenantId, ctx.chatId, { id: usuario.id, nombre: usuario.nombre || usuario.email, rol }, { tipo: 'llamada', texto }, ctx.participantes || []).catch(() => {})
  }

  const limpiar = useCallback((remoto = false) => {
    const id = callIdRef.current
    if (id && !remoto) { actualizarLlamada(id, { estado: 'terminada' }).catch(() => {}) }
    // Deja constancia en el chat (perdida / con duración) antes de resetear.
    if (ctxRef.current?.chatId) { try { logRef.current(!!inicioRef.current, inicioRef.current ? Date.now() - inicioRef.current : 0) } catch { /* noop */ } }
    ctxRef.current = null; inicioRef.current = null
    try { unsubDoc.current && unsubDoc.current() } catch { /* noop */ }
    try { unsubCand.current && unsubCand.current() } catch { /* noop */ }
    unsubDoc.current = null; unsubCand.current = null
    try { pcRef.current && pcRef.current.close() } catch { /* noop */ }
    pcRef.current = null
    try { (localRef.current?.getTracks() || []).forEach((tr) => tr.stop()) } catch { /* noop */ }
    try { (pantallaRef.current?.getTracks() || []).forEach((tr) => tr.stop()) } catch { /* noop */ }
    localRef.current = null; remoteRef.current = null; pantallaRef.current = null
    if (id) limpiarLlamada(id)
    callIdRef.current = null
    setFase('idle'); setInfo(null); setEntrante(null); setMicOff(false); setCamOff(false)
  }, [])

  // Enlaza los streams a los <video> SOLO si cambiaron (si se re-asigna en cada
  // render, el video PARPADEA — el cronómetro provoca un render por segundo).
  useEffect(() => {
    if (remoteVid.current && remoteRef.current && remoteVid.current.srcObject !== remoteRef.current) remoteVid.current.srcObject = remoteRef.current
    const localStream = compartiendo ? pantallaRef.current : localRef.current
    if (localVid.current && localStream && localVid.current.srcObject !== localStream) localVid.current.srcObject = localStream
    if (localGridRef.current && localStream && localGridRef.current.srcObject !== localStream) localGridRef.current.srcObject = localStream
  })

  const prepararPC = (callId, lado) => {
    const pc = nuevaConexion()
    pcRef.current = pc
    const remote = new MediaStream()
    remoteRef.current = remote
    pc.ontrack = (e) => { (e.streams[0]?.getTracks() || []).forEach((tr) => remote.addTrack(tr)); if (remoteVid.current) remoteVid.current.srcObject = remote }
    pc.onicecandidate = (e) => { if (e.candidate) agregarCandidato(callId, lado, e.candidate.toJSON()).catch(() => {}) }
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && faseRef.current !== 'idle') limpiar(false) }
    // Canal de datos para colaboración (pizarra/chat/reacciones): el que LLAMA lo crea;
    // el que recibe lo escucha. Es aditivo: si falla, la llamada de voz/video sigue igual.
    if (lado === 'caller') { try { configurarDC(pc.createDataChannel('colab')) } catch { /* noop */ } }
    else { pc.ondatachannel = (e) => configurarDC(e.channel) }
    return pc
  }

  const conMedios = async (tipo) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('SIN_MEDIOS') // iOS PWA instalada suele bloquear cámara/micrófono
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: tipo === 'video' })
    localRef.current = stream
    if (localVid.current) localVid.current.srcObject = stream
    return stream
  }
  const avisoMedios = (e) => {
    const n = e && (e.name || e.message)
    if (n === 'SIN_MEDIOS') return alert(t('Tu dispositivo bloquea el micrófono/cámara en la app instalada. Abre MilePay en el navegador Safari/Chrome (no el ícono de la pantalla de inicio) para llamar.'))
    if (n === 'NotAllowedError') return alert(t('Diste “No permitir” al micrófono/cámara. Habilítalo en los ajustes del navegador para este sitio y vuelve a intentar.'))
    if (n === 'NotFoundError') return alert(t('No se encontró micrófono/cámara en este dispositivo.'))
    return alert(t('No se pudo iniciar la llamada. Revisa los permisos de micrófono/cámara.'))
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LLAMADA GRUPAL — malla WebRTC (una conexión P2P por cada otro participante)
  // ════════════════════════════════════════════════════════════════════════
  const refrescarRemotos = useCallback(() => {
    setRemotos(Array.from(peersRef.current.entries()).map(([uid, e]) => ({
      uid, nombre: e.nombre, rol: e.rol, hablando: !!e.hablando, mano: !!e.mano,
    })))
  }, [])

  // Pistas que estoy ENVIANDO ahora (audio del micro + video de cámara o pantalla).
  const pistasSalientes = () => {
    const out = []
    const a = localRef.current?.getAudioTracks?.()[0]; if (a) out.push(a)
    const v = (compartiendoRef.current ? pantallaRef.current : localRef.current)?.getVideoTracks?.()[0]; if (v) out.push(v)
    return out
  }

  const configurarAnalyser = (uid, stream) => {
    const e = peersRef.current.get(uid)
    if (!e || e.analyser || !stream.getAudioTracks().length) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = new AC(); const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an)
      const datos = new Uint8Array(an.frequencyBinCount); let ultimo = 0
      const loop = () => {
        an.getByteFrequencyData(datos)
        const vol = datos.reduce((x, y) => x + y, 0) / datos.length
        const hab = vol > 18; const tn = Date.now()
        if (tn - ultimo > 220) { if (e.hablando !== hab) { e.hablando = hab; refrescarRemotos() } ultimo = tn }
        e.raf = requestAnimationFrame(loop)
      }
      e.audioCtx = ctx; e.analyser = an; loop()
    } catch { /* noop */ }
  }

  const enviarDCGrupo = (obj) => {
    for (const e of peersRef.current.values()) { try { if (e.dc?.readyState === 'open') e.dc.send(JSON.stringify(obj)) } catch { /* noop */ } }
  }
  const manejarDCGrupo = (uid, raw) => {
    let m; try { m = JSON.parse(raw) } catch { return }
    const e = peersRef.current.get(uid)
    if (m.tipo === 'chat') { setMensajesCall((s) => [...s, { mio: false, autor: e?.nombre || '', texto: m.texto }]); if (!chatAbierto) setNoLeidoCall((n) => n + 1) }
    else if (m.tipo === 'react') { setReaccion({ e: m.emoji, k: Date.now(), quien: e?.nombre }); setTimeout(() => setReaccion(null), 2500) }
    else if (m.tipo === 'mano') { if (e) { e.mano = !!m.arriba; refrescarRemotos() } }
  }
  const configurarDCGrupo = (uid, dc) => {
    const e = peersRef.current.get(uid); if (e) e.dc = dc
    dc.onmessage = (ev) => manejarDCGrupo(uid, ev.data)
  }

  const flushIce = (e) => { (e.pendientesIce || []).forEach((c) => e.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})); e.pendientesIce = [] }

  const quitarPeer = (uid) => {
    const e = peersRef.current.get(uid); if (!e) return
    try { e.raf && cancelAnimationFrame(e.raf) } catch { /* noop */ }
    try { e.audioCtx && e.audioCtx.close() } catch { /* noop */ }
    try { e.pc && e.pc.close() } catch { /* noop */ }
    peersRef.current.delete(uid)
    refrescarRemotos()
  }

  const crearPeer = (uid, nombre, rol_, iniciador) => {
    if (peersRef.current.has(uid)) return peersRef.current.get(uid)
    const pc = nuevaConexion()
    const stream = new MediaStream()
    const e = { pc, stream, nombre: nombre || '', rol: rol_ || '', dc: null, pendientesIce: [], hablando: false, mano: false }
    peersRef.current.set(uid, e)
    pistasSalientes().forEach((tr) => { try { pc.addTrack(tr) } catch { /* noop */ } })
    pc.ontrack = (ev) => {
      const tracks = ev.streams[0]?.getTracks() || (ev.track ? [ev.track] : [])
      tracks.forEach((tr) => { if (!stream.getTracks().includes(tr)) stream.addTrack(tr) })
      refrescarRemotos(); configurarAnalyser(uid, stream)
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate && salaIdRef.current) enviarSenal(salaIdRef.current, { de: usuario.id, deNombre: miNombre(), deRol: rol, para: uid, kind: 'ice', data: ev.candidate.toJSON() }).catch(() => {})
    }
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) quitarPeer(uid) }
    if (iniciador) { try { configurarDCGrupo(uid, pc.createDataChannel('colab')) } catch { /* noop */ } negociarOferta(uid, pc) }
    else { pc.ondatachannel = (ev) => configurarDCGrupo(uid, ev.channel) }
    refrescarRemotos()
    return e
  }

  const negociarOferta = async (uid, pc) => {
    try {
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
      await enviarSenal(salaIdRef.current, { de: usuario.id, deNombre: miNombre(), deRol: rol, para: uid, kind: 'offer', data: { type: offer.type, sdp: offer.sdp } })
    } catch { /* noop */ }
  }

  const manejarSenal = async (s) => {
    const { de, kind, data, deNombre, deRol } = s
    if (!de || de === usuario.id) return
    let e = peersRef.current.get(de)
    if (kind === 'offer') {
      if (!e) e = crearPeer(de, deNombre, deRol, false)
      try {
        await e.pc.setRemoteDescription(new RTCSessionDescription(data))
        flushIce(e)
        const answer = await e.pc.createAnswer(); await e.pc.setLocalDescription(answer)
        await enviarSenal(salaIdRef.current, { de: usuario.id, deNombre: miNombre(), deRol: rol, para: de, kind: 'answer', data: { type: answer.type, sdp: answer.sdp } })
      } catch { /* noop */ }
    } else if (kind === 'answer') {
      if (e?.pc && !e.pc.currentRemoteDescription) { try { await e.pc.setRemoteDescription(new RTCSessionDescription(data)); flushIce(e) } catch { /* noop */ } }
    } else if (kind === 'ice') {
      if (!e) e = crearPeer(de, deNombre, deRol, false)
      if (e.pc.remoteDescription) e.pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {})
      else e.pendientesIce = [...(e.pendientesIce || []), data]
    }
  }

  const sincronizarPeers = (sala) => {
    const parts = sala?.participantes || {}
    const otros = Object.keys(parts).filter((u) => u !== usuario.id)
    for (const u of otros) {
      const ex = peersRef.current.get(u)
      if (!ex) crearPeer(u, parts[u]?.nombre, parts[u]?.rol, String(usuario.id) < String(u))
      else if (parts[u]?.nombre && ex.nombre !== parts[u].nombre) { ex.nombre = parts[u].nombre; ex.rol = parts[u].rol }
    }
    for (const u of Array.from(peersRef.current.keys())) { if (!otros.includes(u)) quitarPeer(u) }
    refrescarRemotos()
  }

  const engancharSala = (salaId) => {
    unsubSala.current = escucharSala(salaId, (sala) => {
      if (!sala || sala.estado === 'terminada') { limpiarGrupo(true); return }
      salaDataRef.current = sala
      sincronizarPeers(sala)
    })
    unsubSenales.current = escucharSenales(salaId, usuario.id, (s) => { manejarSenal(s) })
  }

  const limpiarGrupo = useCallback((remoto = false) => {
    const salaId = salaIdRef.current
    // Historial en el chat de origen (si vino de un chat).
    if (ctxRef.current?.chatId && inicioRef.current) { try { logRef.current(true, Date.now() - inicioRef.current) } catch { /* noop */ } }
    try { unsubSala.current && unsubSala.current() } catch { /* noop */ }
    try { unsubSenales.current && unsubSenales.current() } catch { /* noop */ }
    unsubSala.current = null; unsubSenales.current = null
    for (const uid of Array.from(peersRef.current.keys())) quitarPeer(uid)
    peersRef.current.clear()
    try { (localRef.current?.getTracks() || []).forEach((tr) => tr.stop()) } catch { /* noop */ }
    try { (pantallaRef.current?.getTracks() || []).forEach((tr) => tr.stop()) } catch { /* noop */ }
    localRef.current = null; pantallaRef.current = null
    if (salaId && !remoto) salirSala(salaId, usuario.id)
    salaIdRef.current = null; esGrupoRef.current = false; salaDataRef.current = null
    ctxRef.current = null; inicioRef.current = null
    setRemotos([]); setFase('idle'); setInfo(null); setEntrante(null); setMicOff(false); setCamOff(false); setAgregarAbierto(false)
  }, [usuario])

  const iniciarGrupo = useCallback(async (invitados, tipo = 'audio', ctx = null, nombreSala = '') => {
    if (faseRef.current !== 'idle') return
    const lista = (invitados || []).filter((p) => p && p.uid && p.uid !== usuario?.id)
    if (!lista.length) return
    esGrupoRef.current = true; ctxRef.current = ctx || null; tipoRef.current = tipo; inicioRef.current = null
    try {
      await conMedios(tipo)
      const salaId = await crearSala({ tenantId, de: { uid: usuario.id, nombre: miNombre(), rol }, tipo, nombre: nombreSala || t('Llamada grupal'), invitados: lista, ctx })
      salaIdRef.current = salaId
      setInfo({ grupo: true, con: nombreSala || t('Llamada grupal'), tipo, saliente: true })
      inicioRef.current = Date.now(); setFase('activa')
      engancharSala(salaId)
    } catch (e) { limpiarGrupo(); avisoMedios(e) }
  }, [usuario, tenantId, rol, limpiarGrupo, t])

  // Abre el selector de contactos para iniciar una llamada grupal. `preseleccion` =
  // uids ya conocidos del chat (se muestran marcados); el usuario puede añadir/quitar.
  const pedirLlamadaGrupo = useCallback((tipo = 'audio', ctx = null, nombre = '', preseleccion = []) => {
    if (faseRef.current !== 'idle') return
    setPickGrupo({
      tipo, titulo: nombre, preseleccion: (preseleccion || []).filter(Boolean),
      onConfirmar: (personas) => iniciarGrupo(personas, tipo, ctx, nombre),
    })
  }, [iniciarGrupo])

  const unirseAGrupo = async (sala) => {
    esGrupoRef.current = true; ctxRef.current = sala.ctx || null; tipoRef.current = sala.tipo; inicioRef.current = null
    try {
      await conMedios(sala.tipo)
      salaIdRef.current = sala.id
      setInfo({ grupo: true, con: sala.nombre || t('Llamada grupal'), tipo: sala.tipo, saliente: false })
      setEntrante(null); inicioRef.current = Date.now(); setFase('activa')
      await unirseSala(sala.id, { uid: usuario.id, nombre: miNombre(), rol })
      engancharSala(sala.id)
    } catch (e) { limpiarGrupo(); avisoMedios(e) }
  }

  const rechazarSala = async (sala) => {
    try { await updateDoc(salaRef(sala.id), { invitados: (sala.invitados || []).filter((u) => u !== usuario.id) }) } catch { /* noop */ }
    setEntrante(null); setFase('idle')
  }

  // Añadir más personas a la llamada grupal en curso.
  const agregarPersonas = async (personas) => {
    if (!salaIdRef.current) return
    try { await invitarASala(salaIdRef.current, personas) } catch { /* noop */ }
    setAgregarAbierto(false)
  }

  // Colgar unificado: grupo o 1-a-1.
  const colgar = () => { if (esGrupoRef.current) limpiarGrupo(false); else limpiar(false) }

  // ── Iniciar llamada saliente ───────────────────────────────────────────────
  const iniciar = useCallback(async (paraUid, nombre, tipo = 'audio', ctx = null) => {
    if (faseRef.current !== 'idle' || !paraUid || paraUid === usuario?.id) return
    ctxRef.current = ctx || null; tipoRef.current = tipo; inicioRef.current = null
    try {
      const stream = await conMedios(tipo)
      const callId = await crearLlamada({ tenantId, de: { uid: usuario.id, nombre: usuario.nombre || usuario.email || '', rol }, para: paraUid, tipo })
      console.log('[llamada] creada', callId, 'para', paraUid, 'tenant', tenantId)
      callIdRef.current = callId
      const pc = prepararPC(callId, 'caller')
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await actualizarLlamada(callId, { offer: { type: offer.type, sdp: offer.sdp } })
      setInfo({ callId, con: nombre, tipo, saliente: true }); setFase('saliente')
      unsubDoc.current = onSnapshot(callRef(callId), async (d) => {
        const data = d.data(); if (!data) return
        if (data.answer && pcRef.current && !pcRef.current.currentRemoteDescription) {
          try { await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer)); inicioRef.current = Date.now(); setFase('activa') } catch { /* noop */ }
        }
        if (data.estado === 'terminada' || data.estado === 'rechazada') limpiar(true)
      })
      unsubCand.current = onSnapshot(candCol(callId, 'callee'), (snap) => {
        snap.docChanges().forEach((ch) => { if (ch.type === 'added') pcRef.current?.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {}) })
      })
    } catch (e) {
      limpiar(false)
      avisoMedios(e)
    }
  }, [usuario, tenantId, rol, limpiar, t])

  // ── Aceptar llamada entrante ───────────────────────────────────────────────
  const aceptar = useCallback(async () => {
    let call = entrante
    if (!call) return
    try {
      // La oferta puede no haber llegado al momento del timbre: re-léela ahora.
      if (!call.offer) { const fresco = await obtenerLlamada(call.id); if (fresco?.offer) call = fresco }
      if (!call.offer) throw new Error('SIN_OFERTA')
      const stream = await conMedios(call.tipo)
      callIdRef.current = call.id
      const pc = prepararPC(call.id, 'callee')
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await actualizarLlamada(call.id, { answer: { type: answer.type, sdp: answer.sdp }, estado: 'aceptada' })
      setInfo({ callId: call.id, con: call.de?.nombre || t('Usuario'), tipo: call.tipo, saliente: false }); setEntrante(null); setFase('activa')
      unsubDoc.current = onSnapshot(callRef(call.id), (d) => { const data = d.data(); if (!data || data.estado === 'terminada') limpiar(true) })
      unsubCand.current = onSnapshot(candCol(call.id, 'caller'), (snap) => {
        snap.docChanges().forEach((ch) => { if (ch.type === 'added') pcRef.current?.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {}) })
      })
    } catch (e) {
      limpiar(false)
      avisoMedios(e)
    }
  }, [entrante, limpiar, t])

  const rechazar = useCallback(() => {
    if (entrante) actualizarLlamada(entrante.id, { estado: 'rechazada' }).catch(() => {})
    setEntrante(null); setFase('idle')
  }, [entrante])

  const toggleMic = () => { const s = localRef.current; if (!s) return; const on = micOff; s.getAudioTracks().forEach((tr) => (tr.enabled = on)); setMicOff(!on) }
  const toggleCam = () => { const s = localRef.current; if (!s) return; const on = camOff; s.getVideoTracks().forEach((tr) => (tr.enabled = on)); setCamOff(!on) }

  // Senders de video/audio: en grupo, uno por cada peer; en 1-a-1, el único pc.
  const sendersDe = (kind) => {
    if (esGrupoRef.current) return Array.from(peersRef.current.values()).map((e) => e.pc?.getSenders?.().find((s) => s.track && s.track.kind === kind)).filter(Boolean)
    const s = pcRef.current?.getSenders?.().find((x) => x.track && x.track.kind === kind); return s ? [s] : []
  }
  const reemplazarEnTodos = async (kind, track) => { for (const s of sendersDe(kind)) { try { await s.replaceTrack(track) } catch { /* noop */ } } }

  // Compartir pantalla: sustituye la pista de video de la cámara por la pantalla
  // (replaceTrack, sin renegociar). Al terminar, vuelve a la cámara.
  const volverCamara = async () => {
    const cam = localRef.current?.getVideoTracks?.()[0]
    if (cam) await reemplazarEnTodos('video', cam)
    try { pantallaRef.current?.getTracks?.().forEach((tr) => tr.stop()) } catch { /* noop */ }
    pantallaRef.current = null
    setCompartiendo(false)
    if (localVid.current) localVid.current.srcObject = localRef.current
    if (localGridRef.current) localGridRef.current.srcObject = localRef.current
  }
  // Cambiar entre cámara frontal y trasera (móvil). Sustituye la pista de video.
  const facingRef = useRef('user')
  const cambiarCamara = async () => {
    if (!esVideo || compartiendo) return
    const nuevo = facingRef.current === 'user' ? 'environment' : 'user'
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nuevo }, audio: false })
      const track = st.getVideoTracks()[0]
      await reemplazarEnTodos('video', track)
      const old = localRef.current?.getVideoTracks?.()[0]
      if (old && localRef.current) { localRef.current.removeTrack(old); old.stop() }
      localRef.current?.addTrack(track)
      facingRef.current = nuevo
      if (localVid.current) localVid.current.srcObject = localRef.current
      if (localGridRef.current) localGridRef.current.srcObject = localRef.current
    } catch { /* sin segunda cámara o permiso */ }
  }
  const compartirPantalla = async () => {
    if (!sendersDe('video').length) { alert(t('Compartir pantalla está disponible en videollamadas.')); return }
    if (compartiendo) { volverCamara(); return }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      pantallaRef.current = screen
      const track = screen.getVideoTracks()[0]
      await reemplazarEnTodos('video', track)
      track.onended = () => { volverCamara() } // el usuario detiene desde el navegador
      setCompartiendo(true)
      if (localVid.current) localVid.current.srcObject = screen
      if (localGridRef.current) localGridRef.current.srcObject = screen
    } catch { /* el usuario canceló el diálogo */ }
  }

  // ── Escuchar entrantes (1-a-1) ─────────────────────────────────────────────
  useEffect(() => {
    if (!usuario?.id || !tenantId) return
    console.log('[llamada] escuchando entrantes para uid', usuario.id, 'tenant', tenantId)
    const off = escucharEntrantes(tenantId, usuario.id, (docs) => {
      if (faseRef.current !== 'idle') return
      const call = docs[0]
      if (call) { console.log('[llamada] ENTRANTE detectada', call.id); setEntrante(call); setFase('entrante') }
    })
    return off
  }, [usuario?.id, tenantId])

  // ── Escuchar salas GRUPALES entrantes ──────────────────────────────────────
  useEffect(() => {
    if (!usuario?.id || !tenantId) return
    const off = escucharSalasEntrantes(usuario.id, (salas) => {
      if (faseRef.current !== 'idle') return
      const s = salas.find((x) => x.tenantId === tenantId && x.creadaPor !== usuario.id && (x.invitados || []).includes(usuario.id))
      if (s) { setEntrante({ grupo: true, id: s.id, tipo: s.tipo, nombre: s.nombre, de: { nombre: s.creadaPorNombre || t('Grupo') }, sala: s }); setFase('entrante') }
    })
    return off
  }, [usuario?.id, tenantId, t])

  // Aceptar/rechazar unificado (1-a-1 o grupo) desde el timbre.
  const onAceptar = () => { if (entrante?.grupo) unirseAGrupo(entrante.sala); else aceptar() }
  const onRechazar = () => { if (entrante?.grupo) rechazarSala(entrante.sala); else rechazar() }

  // Limpieza al desmontar / cerrar sesión.
  useEffect(() => () => { try { pcRef.current?.close() } catch { /* noop */ } pararTono() }, [])

  // Al colgar/entrar/salir, restablece minimizado.
  useEffect(() => {
    if (fase === 'idle') {
      setMin(false); setTick(0); setCompartiendo(false); setPos(null); setPizarra(false); setChatAbierto(false)
      setMensajesCall([]); setReaccion(null); setNoLeidoCall(0); dcRef.current = null
      setManoMia(false); setManoOtro(false); setSubMio(''); setSubOtro(''); setHablaOtro(false); setAjustes(false)
      try { recorderRef.current?.stop() } catch { /* noop */ } recorderRef.current = null; setGrabando(false)
      try { recognitionRef.current?.stop() } catch { /* noop */ } recognitionRef.current = null; setSubsOn(false)
    }
  }, [fase])
  useEffect(() => { if (chatAbierto) setNoLeidoCall(0) }, [chatAbierto])

  // Arrastrar el widget minimizado (pointer events; se mueve por toda la pantalla).
  const W = 256, H = 190
  const onArrastrarInicio = (e) => {
    const inicioX = pos ? pos.x : window.innerWidth - W - 16
    const inicioY = pos ? pos.y : window.innerHeight - H - 16
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: inicioX, oy: inicioY }
    const mover = (ev) => {
      if (!dragRef.current) return
      const nx = Math.min(window.innerWidth - W, Math.max(0, dragRef.current.ox + (ev.clientX - dragRef.current.sx)))
      const ny = Math.min(window.innerHeight - H, Math.max(0, dragRef.current.oy + (ev.clientY - dragRef.current.sy)))
      setPos({ x: nx, y: ny })
    }
    const fin = () => { dragRef.current = null; window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fin) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fin)
  }
  // Cronómetro de la llamada activa.
  useEffect(() => {
    if (fase !== 'activa') return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [fase])
  const duracion = () => {
    if (!inicioRef.current) return fase === 'saliente' ? t('Llamando…') : ''
    const s = Math.max(0, Math.floor((Date.now() - inicioRef.current) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const esVideo = info?.tipo === 'video' || entrante?.tipo === 'video'

  const inicialCon = ((info?.con || entrante?.de?.nombre || '?').trim().charAt(0) || '?').toUpperCase()

  // Elementos de MEDIOS (video remoto + self-view, o audio). El avatar/adornos van aparte.
  const medios = (mini) => esVideo ? (
    <>
      <video ref={remoteVid} autoPlay playsInline className="h-full w-full bg-slate-900 object-cover" />
      <div className={mini ? 'absolute bottom-1.5 right-1.5' : 'absolute bottom-5 right-5'}>
        <video ref={localVid} autoPlay playsInline muted className={mini ? 'h-14 w-10 rounded-lg border border-white/25 object-cover' : 'h-40 w-28 rounded-2xl border-2 border-white/20 object-cover shadow-2xl'} />
        {!mini && <span className="mt-1 block text-center text-[10px] font-medium text-white/60">{compartiendo ? t('Tu pantalla') : t('Tú')}</span>}
      </div>
    </>
  ) : (
    <audio ref={remoteVid} autoPlay />
  )

  // Botón de control redondo con etiqueta (estilo moderno tipo Zoom+).
  const Ctrl = ({ onClick, label, children, activo, danger, size = 'h-14 w-14' }) => (
    <button type="button" onClick={onClick} title={label} className="group flex flex-col items-center gap-1.5">
      <span className={`grid ${size} place-items-center rounded-full backdrop-blur transition active:scale-90 group-hover:scale-105 ${danger ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-600' : activo ? 'bg-white text-slate-900 shadow-lg' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'}`}>{children}</span>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </button>
  )

  // Personas que puedo AÑADIR a la llamada grupal en curso (del contexto del chat de origen).
  const candidatosAgregar = (ctxRef.current?.candidatos || []).filter((c) => c && c.uid && c.uid !== usuario?.id && !remotos.some((r) => r.uid === c.uid))
  const totalGrupo = remotos.length + 1

  return (
    <LlamadaContext.Provider value={{ iniciar, iniciarGrupo, pedirLlamadaGrupo, enLlamada: fase !== 'idle' }}>
      {children}

      {/* Selector de personas para llamada grupal / añadir (directorio + matriz → uids reales). */}
      {pickGrupo && (
        <LlamadaGrupoModal
          yo={{ uid: usuario?.id, rol, carrierId: usuario?.carrierId || null, clienteId: usuario?.clienteId || null }}
          tenantId={tenantId}
          tipo={pickGrupo.tipo}
          titulo={pickGrupo.titulo}
          preseleccion={pickGrupo.preseleccion}
          onConfirmar={(personas) => pickGrupo.onConfirmar?.(personas)}
          onClose={() => setPickGrupo(null)}
        />
      )}

      {/* Timbre de llamada ENTRANTE — moderno, con anillo pulsante */}
      {fase === 'entrante' && entrante && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 p-8 text-center shadow-2xl ring-1 ring-white/10">
            <div className="relative mx-auto h-24 w-24">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/30" />
              <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-3xl font-black text-slate-900 shadow-lg">
                {entrante.grupo ? <Users size={40} />
                  : avatares[entrante.de?.uid] ? <img src={avatares[entrante.de.uid]} alt="" className="h-full w-full object-cover" />
                  : (entrante.de?.nombre || '?').charAt(0).toUpperCase()}
              </div>
            </div>
            <h3 className="mt-5 text-xl font-black text-white">{entrante.grupo ? (entrante.nombre || t('Llamada grupal')) : (entrante.de?.nombre || t('Alguien'))}</h3>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/60">
              {entrante.grupo ? <Users size={14} /> : entrante.tipo === 'video' ? <Video size={14} /> : <PhoneIncoming size={14} />}
              {entrante.grupo ? `${t('Llamada grupal de')} ${entrante.de?.nombre || ''}` : entrante.tipo === 'video' ? t('Videollamada entrante…') : t('Llamada entrante…')}
            </p>
            <div className="mt-8 flex items-center justify-center gap-10">
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={onRechazar} className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition hover:scale-105 hover:bg-rose-600 active:scale-95"><PhoneOff size={26} /></button>
                <span className="text-[11px] text-white/60">{t('Rechazar')}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={onAceptar} className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-emerald-600 active:scale-95">{entrante.tipo === 'video' ? <Video size={26} /> : <Phone size={26} />}</button>
                <span className="text-[11px] text-white/60">{t('Aceptar')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Llamada SALIENTE o ACTIVA — PANTALLA COMPLETA (moderna) */}
      {(fase === 'saliente' || fase === 'activa') && !min && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-gradient-to-b from-slate-900 via-slate-950 to-black">
          <div className="relative flex-1 overflow-hidden">
            {info?.grupo ? (
              /* ── Cuadrícula de la llamada GRUPAL ── */
              <div
                className="grid h-full w-full gap-2 p-2 sm:gap-3 sm:p-3"
                style={{ gridTemplateColumns: `repeat(${totalGrupo <= 1 ? 1 : totalGrupo <= 4 ? 2 : totalGrupo <= 9 ? 3 : 4}, minmax(0, 1fr))` }}
              >
                {remotos.map((r) => (
                  <TileRemoto key={r.uid} stream={peersRef.current.get(r.uid)?.stream} nombre={r.nombre} rol={r.rol} hablando={r.hablando} mano={r.mano} esVideo={esVideo} t={t} />
                ))}
                {/* Mi propia baldosa */}
                <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
                  {esVideo ? (
                    <video ref={localGridRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-2xl font-black text-slate-900">{(miNombre().charAt(0) || t('Tú').charAt(0)).toUpperCase()}</div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
                    <span className="truncate text-xs font-semibold text-white">{t('Tú')}{compartiendo ? ` · ${t('pantalla')}` : ''}</span>
                    {micOff && <MicOffMini size={13} className="ml-auto flex-shrink-0 text-rose-400" />}
                    {manoMia && <Hand size={13} className="flex-shrink-0 text-amber-400" />}
                  </div>
                </div>
                {remotos.length === 0 && (
                  <div className="col-span-full flex items-center justify-center">
                    <p className="animate-pulse text-sm text-white/50">{t('Esperando a que se unan…')}</p>
                  </div>
                )}
              </div>
            ) : esVideo ? medios(false) : (
              <>
                {medios(false)}
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <div className="relative h-40 w-40">
                    {fase === 'saliente' && <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />}
                    {hablaOtro && <span className="absolute -inset-2 animate-pulse rounded-full ring-4 ring-emerald-400/70" />}
                    <div className="relative grid h-40 w-40 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-6xl font-black text-slate-900 shadow-2xl">{inicialCon}</div>
                  </div>
                </div>
              </>
            )}
            {/* PIZARRA compartida (lienzo transparente sobre el video) */}
            {pizarra && (
              <>
                <canvas
                  ref={canvasRef} width={1280} height={720}
                  onPointerDown={lienzoDown} onPointerMove={lienzoMove} onPointerUp={lienzoUp} onPointerLeave={lienzoUp}
                  className="absolute inset-0 h-full w-full touch-none bg-white/5"
                  style={{ cursor: 'crosshair' }}
                />
                {/* Herramientas de la pizarra */}
                <div className="absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/80 px-3 py-2 backdrop-blur">
                  {['#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#0f172a'].map((c) => (
                    <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ring-2 ${color === c ? 'ring-white' : 'ring-transparent'}`} style={{ background: c }} />
                  ))}
                  <button onClick={limpiarPizarra} title={t('Borrar todo')} className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><Eraser size={16} /></button>
                </div>
              </>
            )}

            {/* Reacción flotante */}
            {reaccion && <div key={reaccion.k} className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 animate-bounce text-7xl">{reaccion.e}</div>}

            {/* Grabando */}
            {grabando && <div className="absolute left-4 top-20 flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-bold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC</div>}
            {/* Mano levantada del otro */}
            {manoOtro && <div className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-slate-900"><Hand size={15} /> {info?.con || t('El otro')} {t('levantó la mano')}</div>}

            {/* Subtítulos en vivo */}
            {(subsOn || subOtro) && (subMio || subOtro) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
                {subOtro && <span className="max-w-2xl rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white"><b className="text-amber-300">{info?.con}: </b>{subOtro}</span>}
                {subMio && <span className="max-w-2xl rounded-lg bg-black/60 px-3 py-1.5 text-center text-sm text-white/90"><b className="text-emerald-300">{t('Tú')}: </b>{subMio}</span>}
              </div>
            )}

            {/* Panel de AJUSTES de dispositivos */}
            {ajustes && (
              <div className="absolute right-4 top-20 w-72 rounded-2xl bg-slate-900/95 p-4 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
                <div className="mb-2 flex items-center gap-2"><Settings size={15} className="text-amber-400" /><b>{t('Dispositivos')}</b><button onClick={() => setAjustes(false)} className="ml-auto text-white/60 hover:text-white"><X size={16} /></button></div>
                <label className="mt-2 block text-[11px] uppercase text-white/50">{t('Micrófono')}</label>
                <select onChange={(e) => usarMic(e.target.value)} className="mt-1 w-full rounded-lg bg-white/10 px-2 py-1.5 outline-none">{dispos.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('Micrófono')}</option>)}</select>
                {esVideo && <>
                  <label className="mt-3 block text-[11px] uppercase text-white/50">{t('Cámara')}</label>
                  <select onChange={(e) => usarCam(e.target.value)} className="mt-1 w-full rounded-lg bg-white/10 px-2 py-1.5 outline-none">{dispos.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('Cámara')}</option>)}</select>
                </>}
                {dispos.salidas.length > 0 && <>
                  <label className="mt-3 block text-[11px] uppercase text-white/50">{t('Altavoz')}</label>
                  <select onChange={(e) => usarSalida(e.target.value)} className="mt-1 w-full rounded-lg bg-white/10 px-2 py-1.5 outline-none">{dispos.salidas.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('Altavoz')}</option>)}</select>
                </>}
              </div>
            )}

            {/* AGREGAR personas a la llamada grupal */}
            {agregarAbierto && info?.grupo && (
              <div className="absolute left-1/2 top-20 w-72 -translate-x-1/2 rounded-2xl bg-slate-900/95 p-4 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
                <div className="mb-2 flex items-center gap-2"><UserPlus size={15} className="text-amber-400" /><b>{t('Agregar a la llamada')}</b><button onClick={() => setAgregarAbierto(false)} className="ml-auto text-white/60 hover:text-white"><X size={16} /></button></div>
                <div className="scroll-thin max-h-64 space-y-1 overflow-y-auto">
                  {candidatosAgregar.length === 0 && <p className="py-3 text-center text-xs text-white/40">{t('No hay más personas para agregar.')}</p>}
                  {candidatosAgregar.map((c) => (
                    <button key={c.uid} onClick={() => agregarPersonas([c])} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10">
                      <Avatar foto={avatares[c.uid]} nombre={c.nombre} size={32} />
                      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                      <UserPlus size={15} className="flex-shrink-0 text-amber-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CHAT lateral en llamada */}
            {chatAbierto && (
              <div className="absolute bottom-0 right-0 top-0 flex w-full max-w-xs flex-col bg-slate-900/95 backdrop-blur sm:w-80">
                <div className="flex items-center gap-2 border-b border-white/10 p-3">
                  <MessageSquare size={16} className="text-amber-400" /><span className="text-sm font-bold text-white">{t('Chat de la llamada')}</span>
                  <button onClick={() => setChatAbierto(false)} className="ml-auto text-white/60 hover:text-white"><X size={18} /></button>
                </div>
                <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
                  {mensajesCall.length === 0 && <p className="text-center text-xs text-white/40">{t('Escribe un mensaje durante la llamada.')}</p>}
                  {mensajesCall.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.mio ? 'items-end' : 'items-start'}`}>
                      {!m.mio && info?.grupo && m.autor && <span className="mb-0.5 px-1 text-[10px] font-semibold text-amber-300/80">{m.autor}</span>}
                      <span className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${m.mio ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white'}`}>{m.texto}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-white/10 p-2">
                  <input ref={chatInputRef} onKeyDown={(e) => e.key === 'Enter' && enviarChatCall(e.currentTarget.value)} placeholder={t('Mensaje…')} className="flex-1 rounded-full bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none" />
                  <button onClick={() => enviarChatCall(chatInputRef.current?.value)} className="grid h-9 w-9 place-items-center rounded-full bg-amber-500 text-slate-900"><Send size={16} /></button>
                </div>
              </div>
            )}

            {/* Barra superior: nombre, estado, minimizar */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/50 to-transparent p-5">
              <div className="min-w-0">
                <h3 className="truncate text-2xl font-black text-white drop-shadow">{info?.grupo ? <span className="flex items-center gap-2"><Users size={22} /> {info?.con || t('Llamada grupal')}</span> : (info?.con || t('Llamada'))}</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/70">
                  <span className={`h-2 w-2 rounded-full ${fase === 'activa' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
                  {duracion()}{info?.grupo ? ` · ${totalGrupo} ${totalGrupo === 1 ? t('participante') : t('participantes')}` : ''}{compartiendo ? ` · ${t('compartiendo pantalla')}` : ''}
                </p>
              </div>
              <button onClick={() => setMin(true)} title={t('Minimizar')} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20"><Minimize2 size={18} /></button>
            </div>
          </div>
          {/* Reacciones rápidas */}
          <div className="flex items-center justify-center gap-2 pb-1">
            {['👍', '❤️', '😂', '👏', '🎉', '😮'].map((e) => (
              <button key={e} onClick={() => enviarReaccion(e)} className="rounded-full bg-white/5 px-2 py-1 text-lg transition hover:scale-125 hover:bg-white/15">{e}</button>
            ))}
          </div>
          {/* Barra de controles moderna */}
          <div className="flex flex-wrap items-end justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-8 pt-4 sm:gap-5">
            <Ctrl onClick={toggleMic} label={micOff ? t('Activar') : t('Silenciar')} activo={micOff}>{micOff ? <MicOff size={22} /> : <Mic size={22} />}</Ctrl>
            {esVideo && <Ctrl onClick={toggleCam} label={t('Cámara')} activo={camOff}>{camOff ? <VideoOff size={22} /> : <Video size={22} />}</Ctrl>}
            {esVideo && !compartiendo && <Ctrl onClick={cambiarCamara} label={t('Girar')}><SwitchCamera size={22} /></Ctrl>}
            {esVideo && <Ctrl onClick={compartirPantalla} label={t('Pantalla')} activo={compartiendo}><MonitorUp size={22} /></Ctrl>}
            {info?.grupo && <Ctrl onClick={() => setPickGrupo({ tipo: tipoRef.current, titulo: t('Agregar a la llamada'), preseleccion: [usuario?.id, ...remotos.map((r) => r.uid)].filter(Boolean), onConfirmar: (personas) => agregarPersonas(personas) })} label={t('Agregar')}><UserPlus size={22} /></Ctrl>}
            {!info?.grupo && <Ctrl onClick={togglePizarra} label={t('Pizarra')} activo={pizarra}><PenTool size={22} /></Ctrl>}
            <Ctrl onClick={() => setChatAbierto((v) => !v)} label={t('Chat')} activo={chatAbierto}>
              <span className="relative"><MessageSquare size={22} />{noLeidoCall > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{noLeidoCall}</span>}</span>
            </Ctrl>
            <Ctrl onClick={toggleMano} label={t('Mano')} activo={manoMia}><Hand size={22} /></Ctrl>
            {!info?.grupo && <Ctrl onClick={toggleSubs} label={t('Subtítulos')} activo={subsOn}><Captions size={22} /></Ctrl>}
            {!info?.grupo && <Ctrl onClick={toggleGrabar} label={grabando ? t('Detener') : t('Grabar')} activo={grabando}>{grabando ? <StopCircle size={22} /> : <Disc size={22} />}</Ctrl>}
            <Ctrl onClick={() => { setAjustes((v) => !v); cargarDispositivos() }} label={t('Ajustes')} activo={ajustes}><Settings size={22} /></Ctrl>
            <Ctrl onClick={colgar} label={info?.grupo ? t('Salir') : t('Finalizar')} danger size="h-16 w-16"><PhoneOff size={26} /></Ctrl>
          </div>
        </div>
      )}

      {/* Llamada MINIMIZADA — widget flotante moderno y ARRASTRABLE */}
      {(fase === 'saliente' || fase === 'activa') && min && (
        <div
          className="fixed z-[80] w-64 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl ring-1 ring-white/10"
          style={pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 16 }}
        >
          <div onPointerDown={onArrastrarInicio} className="relative h-32 cursor-grab touch-none bg-slate-950 active:cursor-grabbing">
            {info?.grupo ? (
              <div className="flex h-full w-full items-center justify-center gap-2">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-900"><Users size={30} /></div>
              </div>
            ) : esVideo ? medios(true) : (
              <div className="flex h-full w-full items-center justify-center">
                {medios(true)}
                <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-2xl font-black text-slate-900">{inicialCon}</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{info?.con || t('Llamada')}</div>
              <div className="flex items-center gap-1 text-[11px] text-white/60"><span className={`h-1.5 w-1.5 rounded-full ${fase === 'activa' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />{duracion()}{info?.grupo ? ` · ${totalGrupo}` : ''}</div>
            </div>
            <button onClick={toggleMic} title={micOff ? t('Activar micrófono') : t('Silenciar')} className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${micOff ? 'bg-white text-slate-900' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'}`}>{micOff ? <MicOff size={15} /> : <Mic size={15} />}</button>
            <button onClick={() => setMin(false)} title={t('Ampliar')} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 active:scale-90"><Maximize2 size={15} /></button>
            <button onClick={colgar} title={info?.grupo ? t('Salir de la llamada') : t('Finalizar llamada')} className="grid h-9 w-9 place-items-center rounded-full bg-rose-500 text-white transition hover:bg-rose-600 active:scale-90"><PhoneOff size={16} /></button>
          </div>
        </div>
      )}
    </LlamadaContext.Provider>
  )
}
