// ============================================================================
// BULK · RECORRIDO de una orden — tarjeta plegable con la ruta GPS real.
// Pinta los puntos de bulk_trackpoints (polilínea + posición final) sobre el
// mapa Leaflet. Sirve igual para una orden EN CURSO (se actualiza en vivo) que
// para una CERRADA (revisión de "por dónde se fue" en una disputa).
// El mapa solo se monta al abrir la tarjeta (no cargar tiles de más).
// ============================================================================
import { useEffect, useState } from 'react'
import { Route, ChevronDown } from 'lucide-react'
import MapaLeaflet from './MapaLeaflet'
import { suscribirTrack } from '../data/tracking'
import { useBulkAuth } from '../BulkAuthContext'
import { useLang } from '../../i18n'

const S = 1.75
const hora = (ts) => { const ms = Date.parse(ts || ''); return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '' }

export default function RecorridoOrden({ orden, geocercas = [], className = '' }) {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const [abierto, setAbierto] = useState(false)
  const [track, setTrack] = useState(null) // null = aún no cargado
  useEffect(() => {
    if (!abierto || !orden?.id || !tenantId) return undefined
    return suscribirTrack(tenantId, orden.id, setTrack)
  }, [abierto, orden?.id, tenantId])

  return (
    <div className={`rounded-card bg-white shadow-card ${className}`}>
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] bg-mp-cream text-mp-navy"><Route size={18} strokeWidth={S} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-mp-ink">{t('Recorrido del viaje')}</span>
          <span className="block text-[12px] text-mp-ink-2">{t('La ruta real que siguió el camión (GPS)')}</span>
        </span>
        <ChevronDown size={18} strokeWidth={S} className={`flex-shrink-0 text-mp-ink-2 transition ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-3 pb-3">
          {track === null ? (
            <div className="py-6 text-center text-[13px] text-mp-ink-2">{t('Cargando…')}</div>
          ) : track.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-mp-ink-2">{t('Esta orden no tiene puntos GPS registrados.')}</div>
          ) : (
            <>
              <div className="overflow-hidden rounded-[16px]">
                <MapaLeaflet puntos={track} geocercas={geocercas} alto={280} />
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-[12px] text-mp-ink-2">
                <span>{hora(track[0]?.ts)} → {hora(track[track.length - 1]?.ts)}</span>
                <span>{track.length} {t('puntos')}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
