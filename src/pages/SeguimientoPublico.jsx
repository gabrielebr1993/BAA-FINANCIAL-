// ============================================================================
// SEGUIMIENTO PÚBLICO ("Negocio y roles", Bloque 4) — página SIN LOGIN.
// El cliente comparte /seguimiento?t=<token> con el encargado de obra: muestra
// el camión en vivo (última posición GPS), el estado y el destino. El link
// CADUCA solo: cuando la orden se entrega, el API responde { caducado } y la
// página lo dice. No expone precios ni datos internos.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Truck, MapPin, CheckCircle2, Clock } from 'lucide-react'
import { ORDEN_ESTADO_LABEL } from '../bulk/domain/constants'
import { useLang, LangToggle } from '../i18n'
import { useTemaColor } from '../hooks/useTemaColor'

const S = 1.75
const truckIcon = L.divIcon({
  className: '', iconSize: [38, 38], iconAnchor: [19, 19],
  html: '<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;">'
    + '<div style="width:34px;height:34px;background:#2E9E6B;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">'
    + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>'
    + '</div></div>',
})

export default function SeguimientoPublico() {
  const { t } = useLang()
  useTemaColor('#F3EFE6')
  const [datos, setDatos] = useState(null)   // respuesta del API
  const [error, setError] = useState(null)
  const mapaRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  // Consulta el API cada 20 s (mismo pulso que el GPS del chofer).
  useEffect(() => {
    const tk = new URLSearchParams(window.location.search).get('t') || ''
    let vivo = true
    const pedir = async () => {
      try {
        const r = await fetch('/api/bulk-track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'seguimiento', t: tk }),
        })
        const j = await r.json()
        if (!vivo) return
        if (!j?.ok) setError(j?.error || t('Link inválido.'))
        else setDatos(j)
      } catch { if (vivo) setError(t('Sin conexión. Reintentando…')) }
    }
    pedir()
    const id = setInterval(pedir, 20000)
    return () => { vivo = false; clearInterval(id) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mapa: se crea una vez; el marcador se MUEVE con cada posición nueva.
  useEffect(() => {
    if (!datos || datos.caducado || !datos.pos || !mapaRef.current) return
    const p = [datos.pos.lat, datos.pos.lng]
    if (!mapRef.current) {
      const m = L.map(mapaRef.current, { zoomControl: false }).setView(p, 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m)
      markerRef.current = L.marker(p, { icon: truckIcon }).addTo(m)
      mapRef.current = m
    } else {
      markerRef.current?.setLatLng(p)
      mapRef.current.panTo(p)
    }
  }, [datos])
  useEffect(() => () => { try { mapRef.current?.remove() } catch { /* noop */ } }, [])

  const haceMin = datos?.pos?.ts ? Math.max(0, Math.round((Date.now() - Date.parse(datos.pos.ts)) / 60000)) : null

  return (
    <div className="mp-app flex min-h-dvh flex-col" style={{ background: 'var(--mp-cream)' }}>
      {/* Header público: marca + idioma */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),14px)] min-[430px]:px-5">
        <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-mp-navy text-mp-gold"><Truck size={18} strokeWidth={2} /></span>
        <span className="flex-1 text-[15px] font-semibold text-mp-ink">MilePay <span className="text-mp-gold">Freight</span></span>
        <LangToggle />
      </div>

      {error && !datos && (
        <div className="mx-4 mt-6 rounded-card bg-white p-6 text-center text-[14px] text-mp-ink-2 shadow-card">{error}</div>
      )}

      {datos?.caducado && (
        <div className="mx-4 mt-10 rounded-card bg-white p-8 text-center shadow-card">
          <CheckCircle2 size={40} strokeWidth={S} className="mx-auto text-mp-green" />
          <div className="mt-3 text-[18px] font-medium text-mp-ink">{t('Entrega completada')}</div>
          <div className="mt-1 text-[13px] text-mp-ink-2">{t('Este link de seguimiento ya caducó.')}</div>
        </div>
      )}

      {datos && !datos.caducado && (
        <>
          {/* Tarjeta del viaje */}
          <div className="mx-4 rounded-card bg-white p-4 shadow-card min-[430px]:mx-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-mp-ink-2">{datos.numero}</span>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-mp-navy/5 px-2.5 py-1 text-[12px] text-mp-ink">
                <span className="h-1.5 w-1.5 rounded-pill" style={{ background: 'var(--mp-green)' }} />
                {t(ORDEN_ESTADO_LABEL[datos.estado] || datos.estado)}
              </span>
            </div>
            <div className="mt-1 text-[20px] font-medium text-mp-ink">{t(datos.material || 'Material')}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-mp-ink-2">
              <MapPin size={14} strokeWidth={S} className="flex-shrink-0" />
              <span className="truncate">{datos.destino || t('Destino por confirmar')}</span>
            </div>
            {(datos.choferNombre || datos.unidad) && (
              <div className="mt-0.5 text-[12px] text-mp-ink-2">{[datos.choferNombre, datos.unidad].filter(Boolean).join(' · ')}</div>
            )}
            {haceMin != null && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-mp-cream px-2.5 py-1 text-[12px] text-mp-ink-2">
                <Clock size={13} strokeWidth={S} /> {t('Actualizado hace')} {haceMin} min
              </div>
            )}
          </div>

          {/* Mapa en vivo (o aviso si el camión aún no reporta posición) */}
          {datos.pos ? (
            <div ref={mapaRef} className="mx-4 mt-3 min-h-[320px] flex-1 overflow-hidden rounded-card shadow-card min-[430px]:mx-5" style={{ marginBottom: 'max(env(safe-area-inset-bottom), 16px)' }} />
          ) : (
            <div className="mx-4 mt-3 rounded-card bg-white p-8 text-center text-[13px] text-mp-ink-2 shadow-card">
              {t('El camión aún no reporta su posición. Esta página se actualiza sola.')}
            </div>
          )}
        </>
      )}

      {!datos && !error && (
        <div className="mt-16 text-center text-[13px] text-mp-ink-2">{t('Cargando seguimiento…')}</div>
      )}
    </div>
  )
}
