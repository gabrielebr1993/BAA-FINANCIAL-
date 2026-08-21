// ============================================================================
// BULK · Llamadas 1-a-1 de voz/video (WebRTC) — proveedor global.
// - Expone `useLlamada().iniciar(paraUid, nombre, tipo)` para llamar desde cualquier
//   parte (p. ej. la tarjeta de perfil en el chat).
// - Escucha llamadas ENTRANTES para el usuario actual y muestra el timbre.
// - El audio/video va P2P (WebRTC); Firestore solo lleva la señalización.
// Aislamiento por reglas: solo los 2 participantes acceden a la llamada.
// ============================================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, PhoneIncoming } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { enviarMensaje } from '../data/chat'
import {
  nuevaConexion, callRef, candCol, crearLlamada, actualizarLlamada,
  agregarCandidato, escucharEntrantes, limpiarLlamada, onSnapshot,
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

  // Tono de repique (repetido) para saliente (ringback) y entrante (ringtone).
  const pararTono = () => { const tr = tonoRef.current; if (!tr) return; try { clearInterval(tr.intervalo); tr.ctx.close() } catch { /* noop */ } tonoRef.current = null }
  const iniciarTono = (esEntrante) => {
    pararTono()
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const beep = () => {
        try {
          const o = ctx.createOscillator(); const g = ctx.createGain()
          o.frequency.value = esEntrante ? 540 : 440
          o.connect(g); g.connect(ctx.destination)
          const now = ctx.currentTime
          g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.25, now + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
          o.start(now); o.stop(now + 0.55)
        } catch { /* noop */ }
      }
      beep()
      tonoRef.current = { ctx, intervalo: setInterval(beep, esEntrante ? 1600 : 3200) }
    } catch { /* noop */ }
  }
  useEffect(() => {
    if (fase === 'saliente') iniciarTono(false)
    else if (fase === 'entrante') iniciarTono(true)
    else pararTono()
  }, [fase])

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
    localRef.current = null; remoteRef.current = null
    if (id) limpiarLlamada(id)
    callIdRef.current = null
    setFase('idle'); setInfo(null); setEntrante(null); setMicOff(false); setCamOff(false)
  }, [])

  // Enlaza los streams a los elementos <video> cuando entran en escena.
  useEffect(() => {
    if (remoteVid.current && remoteRef.current) remoteVid.current.srcObject = remoteRef.current
    if (localVid.current && localRef.current) localVid.current.srcObject = localRef.current
  })

  const prepararPC = (callId, lado) => {
    const pc = nuevaConexion()
    pcRef.current = pc
    const remote = new MediaStream()
    remoteRef.current = remote
    pc.ontrack = (e) => { (e.streams[0]?.getTracks() || []).forEach((tr) => remote.addTrack(tr)); if (remoteVid.current) remoteVid.current.srcObject = remote }
    pc.onicecandidate = (e) => { if (e.candidate) agregarCandidato(callId, lado, e.candidate.toJSON()).catch(() => {}) }
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && faseRef.current !== 'idle') limpiar(false) }
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
    const call = entrante
    if (!call) return
    try {
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

  // ── Escuchar entrantes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!usuario?.id || !tenantId) return
    const off = escucharEntrantes(tenantId, usuario.id, (docs) => {
      if (faseRef.current !== 'idle') return
      const call = docs.find((c) => c.offer) // ya con oferta lista
      if (call) { setEntrante(call); setFase('entrante') }
    })
    return off
  }, [usuario?.id, tenantId])

  // Limpieza al desmontar / cerrar sesión.
  useEffect(() => () => { try { pcRef.current?.close() } catch { /* noop */ } pararTono() }, [])

  const esVideo = info?.tipo === 'video' || entrante?.tipo === 'video'

  return (
    <LlamadaContext.Provider value={{ iniciar, enLlamada: fase !== 'idle' }}>
      {children}

      {/* Timbre de llamada ENTRANTE */}
      {fase === 'entrante' && entrante && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-amber-500/20 text-amber-500"><PhoneIncoming size={34} /></div>
            <h3 className="mt-4 text-lg font-black text-brand-navy dark:text-slate-100">{entrante.de?.nombre || t('Alguien')}</h3>
            <p className="text-sm text-slate-500">{entrante.tipo === 'video' ? t('Videollamada entrante…') : t('Llamada entrante…')}</p>
            <div className="mt-6 flex items-center justify-center gap-6">
              <button onClick={rechazar} className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600"><PhoneOff size={24} /></button>
              <button onClick={aceptar} className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600">{entrante.tipo === 'video' ? <Video size={24} /> : <Phone size={24} />}</button>
            </div>
          </div>
        </div>
      )}

      {/* Llamada SALIENTE o ACTIVA */}
      {(fase === 'saliente' || fase === 'activa') && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950">
          <div className="relative flex-1">
            {/* Video remoto (o avatar si es solo audio) */}
            {esVideo
              ? <video ref={remoteVid} autoPlay playsInline className="h-full w-full bg-slate-900 object-cover" />
              : (
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-amber-500/20 text-amber-400"><Phone size={44} /></div>
                  <audio ref={remoteVid} autoPlay />
                </div>
              )}
            {/* Estado + nombre */}
            <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-6 text-center">
              <h3 className="text-xl font-black text-white">{info?.con || t('Llamada')}</h3>
              <p className="text-sm text-white/70">{fase === 'saliente' ? t('Llamando…') : t('En llamada')}</p>
            </div>
            {/* Video local (mini) */}
            {esVideo && <video ref={localVid} autoPlay playsInline muted className="absolute bottom-24 right-4 h-36 w-24 rounded-xl border-2 border-white/30 object-cover shadow-lg" />}
          </div>
          {/* Controles */}
          <div className="flex items-center justify-center gap-5 bg-slate-900/80 p-5">
            <button onClick={toggleMic} className={`grid h-13 w-13 place-items-center rounded-full p-3 ${micOff ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`}>{micOff ? <MicOff size={22} /> : <Mic size={22} />}</button>
            <button onClick={() => limpiar(false)} className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600"><PhoneOff size={26} /></button>
            {esVideo && <button onClick={toggleCam} className={`grid h-13 w-13 place-items-center rounded-full p-3 ${camOff ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`}>{camOff ? <VideoOff size={22} /> : <Video size={22} />}</button>}
          </div>
        </div>
      )}
    </LlamadaContext.Provider>
  )
}
