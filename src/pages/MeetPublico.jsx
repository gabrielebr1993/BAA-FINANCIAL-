// ============================================================================
// PÁGINA PÚBLICA /meet/{codigo} — invitado EXTERNO se une a una reunión SIN cuenta.
// 1) Bienvenida con marca MilePay y nombre de la reunión (se valida el código).
// 2) Escribe su nombre (obligatorio) → "Unirse a la reunión".
// 3) El backend valida el código y entrega un token SOLO de esa sala; el navegador
//    pide permisos de cámara/micrófono en la pantalla previa (Daily Prebuilt) y entra.
// Un link inválido o una reunión finalizada muestra un mensaje claro.
// ============================================================================
import { useState } from 'react'
import { Video, Phone, Truck, ArrowRight, AlertTriangle, Camera, Mic } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../bulk/firebaseBulk'
import { useLang } from '../i18n'

const NAVY = '#13233f'
const GOLD = '#c9a24b'
const CREMA = '#f8f3eb'

export default function MeetPublico() {
  const { t } = useLang()
  const codigo = (window.location.pathname.split('/')[2] || '').trim()
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState(null)
  const [sala, setSala] = useState(null) // { url, token, titulo, tipo }

  const unirse = async () => {
    if (!nombre.trim()) return
    setOcupado(true); setErr(null)
    try {
      const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
      const r = await fn({ op: 'invitado', codigo, nombre: nombre.trim() })
      setSala(r?.data || null)
    } catch (e) {
      const msg = e?.message || ''
      setErr(/no existe|inválido|not-found/i.test(msg) ? t('Esta reunión no existe o el link es inválido.')
        : /no está disponible|finaliz/i.test(msg) ? t('Esta reunión ya no está disponible.')
          : msg || t('No se pudo entrar a la reunión. Intenta de nuevo.'))
    } finally { setOcupado(false) }
  }

  // ── Dentro de la sala (pantalla completa) ──────────────────────────────────
  if (sala) {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: NAVY }}>
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: GOLD, color: NAVY }}><Truck size={19} /></span>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">{sala.titulo}</div>
            <div className="text-[11px]" style={{ color: GOLD }}>MilePay · {sala.tipo === 'voz' ? t('Llamada de voz') : t('Videollamada')}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <iframe
            title={sala.titulo}
            src={`${sala.url}?t=${sala.token}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; clipboard-write"
            className="h-full w-full"
            style={{ border: 0 }}
          />
        </div>
      </div>
    )
  }

  // ── Bienvenida del invitado ────────────────────────────────────────────────
  return (
    <div className="grid min-h-screen place-items-center p-4" style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #1e3a5f 100%)` }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Marca */}
        <div className="flex items-center gap-3 px-6 py-5" style={{ background: NAVY }}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: GOLD, color: NAVY }}><Truck size={24} /></span>
          <div>
            <div className="text-lg font-black text-white">MilePay</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GOLD }}>{t('Reuniones')}</div>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: CREMA, color: GOLD }}><Video size={18} /></span>
            <h1 className="m-0 text-lg font-black" style={{ color: NAVY }}>{t('Te invitaron a una reunión')}</h1>
          </div>
          <p className="mb-5 text-sm text-slate-500">{t('Escribe tu nombre para unirte. No necesitas una cuenta de MilePay.')}</p>

          {err && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {err}
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Tu nombre')}</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unirse()}
              placeholder={t('Ej. Juan Pérez')}
              autoFocus
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
          </label>

          <button
            onClick={unirse}
            disabled={!nombre.trim() || ocupado}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-black text-white transition disabled:opacity-50"
            style={{ background: ocupado ? '#5b6b82' : '#3f9d6b' }}
          >
            {ocupado ? t('Conectando…') : t('Unirse a la reunión')} {!ocupado && <ArrowRight size={18} />}
          </button>

          <div className="mt-4 flex items-start gap-2 rounded-xl p-3 text-xs text-slate-500" style={{ background: CREMA }}>
            <span className="mt-0.5 flex gap-1"><Camera size={13} style={{ color: GOLD }} /><Mic size={13} style={{ color: GOLD }} /></span>
            {t('Al unirte, el navegador te pedirá permiso para usar la cámara y el micrófono; podrás encenderlos o apagarlos en la pantalla previa antes de entrar. Si la reunión tiene sala de espera, el anfitrión te admitirá en un momento.')}
          </div>
        </div>
      </div>
    </div>
  )
}
