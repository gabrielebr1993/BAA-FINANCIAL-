// ============================================================================
// BULK · Llamadas 1-a-1 de voz/video (WebRTC) — proveedor global.
// - Expone `useLlamada().iniciar(paraUid, nombre, tipo)` para llamar desde cualquier
//   parte (p. ej. la tarjeta de perfil en el chat).
// - Escucha llamadas ENTRANTES para el usuario actual y muestra el timbre.
// - El audio/video va P2P (WebRTC); Firestore solo lleva la señalización.
// Aislamiento por reglas: solo los 2 participantes acceden a la llamada.
// ============================================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, PhoneIncoming, Minimize2, Maximize2, MonitorUp, SwitchCamera, PenTool, MessageSquare, Smile, Eraser, Send, X } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { enviarMensaje } from '../data/chat'
import {
  nuevaConexion, callRef, candCol, crearLlamada, actualizarLlamada,
  agregarCandidato, escucharEntrantes, limpiarLlamada, onSnapshot, obtenerLlamada,
} from '../data/llamadas'
import { useLang } from '../../i18n'

const LlamadaContext = createContext({ iniciar: () => {} })
export const useLlamada = () => useContext(LlamadaContext)

export default function LlamadaProvider({ children }) {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()

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
  useEffect(() => { faseRef.current = fase }, [fase])

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
  }
  const configurarDC = (dc) => {
    dcRef.current = dc
    dc.onmessage = (e) => manejarDC(e.data)
    dc.onclose = () => { if (dcRef.current === dc) dcRef.current = null }
  }
  const enviarChatCall = (txt) => {
    const v = (txt || '').trim(); if (!v) return
    setMensajesCall((s) => [...s, { mio: true, texto: v }]); enviarDC({ tipo: 'chat', texto: v })
    if (chatInputRef.current) chatInputRef.current.value = ''
  }
  const enviarReaccion = (emoji) => { setReaccion({ e: emoji, k: Date.now() }); setTimeout(() => setReaccion(null), 2500); enviarDC({ tipo: 'react', emoji }) }
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

  // Compartir pantalla: sustituye la pista de video de la cámara por la pantalla
  // (replaceTrack, sin renegociar). Al terminar, vuelve a la cámara.
  const volverCamara = async () => {
    const pc = pcRef.current
    const cam = localRef.current?.getVideoTracks?.()[0]
    const sender = pc?.getSenders?.().find((s) => s.track && s.track.kind === 'video')
    if (sender && cam) { try { await sender.replaceTrack(cam) } catch { /* noop */ } }
    try { pantallaRef.current?.getTracks?.().forEach((tr) => tr.stop()) } catch { /* noop */ }
    pantallaRef.current = null
    setCompartiendo(false)
    if (localVid.current) localVid.current.srcObject = localRef.current
  }
  // Cambiar entre cámara frontal y trasera (móvil). Sustituye la pista de video.
  const facingRef = useRef('user')
  const cambiarCamara = async () => {
    if (!esVideo || compartiendo) return
    const nuevo = facingRef.current === 'user' ? 'environment' : 'user'
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nuevo }, audio: false })
      const track = st.getVideoTracks()[0]
      const sender = pcRef.current?.getSenders?.().find((s) => s.track && s.track.kind === 'video')
      if (sender) await sender.replaceTrack(track)
      const old = localRef.current?.getVideoTracks?.()[0]
      if (old && localRef.current) { localRef.current.removeTrack(old); old.stop() }
      localRef.current?.addTrack(track)
      facingRef.current = nuevo
      if (localVid.current) localVid.current.srcObject = localRef.current
    } catch { /* sin segunda cámara o permiso */ }
  }
  const compartirPantalla = async () => {
    const pc = pcRef.current
    const sender = pc?.getSenders?.().find((s) => s.track && s.track.kind === 'video')
    if (!sender) { alert(t('Compartir pantalla está disponible en videollamadas.')); return }
    if (compartiendo) { volverCamara(); return }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      pantallaRef.current = screen
      const track = screen.getVideoTracks()[0]
      await sender.replaceTrack(track)
      track.onended = () => { volverCamara() } // el usuario detiene desde el navegador
      setCompartiendo(true)
      if (localVid.current) localVid.current.srcObject = screen
    } catch { /* el usuario canceló el diálogo */ }
  }

  // ── Escuchar entrantes ─────────────────────────────────────────────────────
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

  // Limpieza al desmontar / cerrar sesión.
  useEffect(() => () => { try { pcRef.current?.close() } catch { /* noop */ } pararTono() }, [])

  // Al colgar/entrar/salir, restablece minimizado.
  useEffect(() => { if (fase === 'idle') { setMin(false); setTick(0); setCompartiendo(false); setPos(null); setPizarra(false); setChatAbierto(false); setMensajesCall([]); setReaccion(null); setNoLeidoCall(0); dcRef.current = null } }, [fase])
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

  return (
    <LlamadaContext.Provider value={{ iniciar, enLlamada: fase !== 'idle' }}>
      {children}

      {/* Timbre de llamada ENTRANTE — moderno, con anillo pulsante */}
      {fase === 'entrante' && entrante && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 p-8 text-center shadow-2xl ring-1 ring-white/10">
            <div className="relative mx-auto h-24 w-24">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/30" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-3xl font-black text-slate-900 shadow-lg">{(entrante.de?.nombre || '?').charAt(0).toUpperCase()}</div>
            </div>
            <h3 className="mt-5 text-xl font-black text-white">{entrante.de?.nombre || t('Alguien')}</h3>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/60">{entrante.tipo === 'video' ? <Video size={14} /> : <PhoneIncoming size={14} />} {entrante.tipo === 'video' ? t('Videollamada entrante…') : t('Llamada entrante…')}</p>
            <div className="mt-8 flex items-center justify-center gap-10">
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={rechazar} className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition hover:scale-105 hover:bg-rose-600 active:scale-95"><PhoneOff size={26} /></button>
                <span className="text-[11px] text-white/60">{t('Rechazar')}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={aceptar} className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-emerald-600 active:scale-95">{entrante.tipo === 'video' ? <Video size={26} /> : <Phone size={26} />}</button>
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
            {esVideo ? medios(false) : (
              <>
                {medios(false)}
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <div className="relative h-40 w-40">
                    {fase === 'saliente' && <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />}
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
                    <div key={i} className={`flex ${m.mio ? 'justify-end' : 'justify-start'}`}>
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
                <h3 className="truncate text-2xl font-black text-white drop-shadow">{info?.con || t('Llamada')}</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/70">
                  <span className={`h-2 w-2 rounded-full ${fase === 'activa' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
                  {duracion()}{compartiendo ? ` · ${t('compartiendo pantalla')}` : ''}
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
            <Ctrl onClick={togglePizarra} label={t('Pizarra')} activo={pizarra}><PenTool size={22} /></Ctrl>
            <Ctrl onClick={() => setChatAbierto((v) => !v)} label={t('Chat')} activo={chatAbierto}>
              <span className="relative"><MessageSquare size={22} />{noLeidoCall > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{noLeidoCall}</span>}</span>
            </Ctrl>
            <Ctrl onClick={() => limpiar(false)} label={t('Finalizar')} danger size="h-16 w-16"><PhoneOff size={26} /></Ctrl>
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
            {esVideo ? medios(true) : (
              <div className="flex h-full w-full items-center justify-center">
                {medios(true)}
                <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-2xl font-black text-slate-900">{inicialCon}</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{info?.con || t('Llamada')}</div>
              <div className="flex items-center gap-1 text-[11px] text-white/60"><span className={`h-1.5 w-1.5 rounded-full ${fase === 'activa' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />{duracion()}</div>
            </div>
            <button onClick={toggleMic} title={micOff ? t('Activar micrófono') : t('Silenciar')} className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${micOff ? 'bg-white text-slate-900' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'}`}>{micOff ? <MicOff size={15} /> : <Mic size={15} />}</button>
            <button onClick={() => setMin(false)} title={t('Ampliar')} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 active:scale-90"><Maximize2 size={15} /></button>
            <button onClick={() => limpiar(false)} title={t('Finalizar llamada')} className="grid h-9 w-9 place-items-center rounded-full bg-rose-500 text-white transition hover:bg-rose-600 active:scale-90"><PhoneOff size={16} /></button>
          </div>
        </div>
      )}
    </LlamadaContext.Provider>
  )
}
