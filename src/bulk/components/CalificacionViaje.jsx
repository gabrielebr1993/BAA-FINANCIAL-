// ============================================================================
// BULK · CALIFICACIÓN DEL VIAJE (1–5 estrellas) — la pone el CLIENTE al
// recibir su carga; el staff y el transportista la ven (mide qué chofer
// cuida al cliente). Un doc por orden: bulk_ratings/{orderId}.
//   { tenantId, orderId, numero, clienteId, carrierId, choferId, choferNombre,
//     estrellas 1..5, comentario?, ts }
// Las reglas solo dejan crearla al cliente DUEÑO de la orden y ya entregada.
// ============================================================================
import { useState } from 'react'
import { Star } from 'lucide-react'
import { crearConId } from '../data/repo'
import { useDoc } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { useLang } from '../../i18n'

const S = 1.75

// Fila de estrellas. `onSet` la vuelve interactiva; sin él, es solo lectura.
export function Estrellas({ valor = 0, onSet, size = 22, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onSet} onClick={() => onSet?.(n)}
          className={onSet ? 'transition active:scale-90' : 'cursor-default'} aria-label={`${n} ★`}>
          <Star size={size} strokeWidth={S}
            className={n <= valor ? 'text-mp-gold' : 'text-mp-ink-2/40'}
            fill={n <= valor ? 'var(--mp-gold)' : 'none'} />
        </button>
      ))}
    </span>
  )
}

// Tarjeta completa: el cliente califica (si aún no lo hizo y la orden se
// entregó); todos los demás roles solo ven la calificación existente.
// `soloPedir`: para la HOME del cliente — si ya está calificada, no pinta nada
// (la tarjeta de "gracias" solo se muestra justo después de enviar).
export default function CalificacionViaje({ orden, soloPedir = false, className = '' }) {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  const { dato: rating, cargando } = useDoc('ratings', orden?.id)
  const [estrellas, setEstrellas] = useState(0)
  const [comentario, setComentario] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [gracias, setGracias] = useState(false)

  const entregada = ['entregada', 'liberada', 'cerrada'].includes(orden?.estado)
  const puedeCalificar = rol === 'cliente' && entregada && !rating && !cargando

  const guardar = async () => {
    if (!estrellas) return
    setOcupado(true)
    try {
      await crearConId('ratings', orden.id, tenantId, {
        orderId: orden.id, numero: orden.numero || '',
        clienteId: orden.clienteId || usuario?.clienteId || null,
        carrierId: orden.transportistaId || null,
        choferId: orden.choferId || null, choferNombre: orden.choferNombre || '',
        estrellas, comentario: comentario.trim() || null,
        por: usuario?.id, ts: new Date().toISOString(),
      })
      setGracias(true)
    } catch { window.alert(t('No se pudo guardar la calificación. ¿Falta desplegar las reglas nuevas?')) }
    finally { setOcupado(false) }
  }

  // Ya calificada (o recién guardada): estrellas en solo lectura.
  if (rating && soloPedir && !gracias) return null
  if (rating || gracias) {
    const r = rating || { estrellas, comentario }
    return (
      <div className={`rounded-card bg-white p-4 shadow-card ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-mp-ink-2">{t('Calificación del viaje')}</span>
          <Estrellas valor={r.estrellas} size={16} />
        </div>
        {r.comentario && <div className="mt-1.5 text-[13px] text-mp-ink">“{r.comentario}”</div>}
        {gracias && <div className="mt-1.5 text-[12px] text-mp-green">{t('¡Gracias! Tu opinión ayuda a mejorar el servicio.')}</div>}
      </div>
    )
  }
  if (!puedeCalificar) return null

  // El cliente califica: estrellas grandes + comentario opcional.
  return (
    <div className={`rounded-card bg-white p-4 shadow-card ${className}`}>
      <div className="text-[14px] font-medium text-mp-ink">{t('¿Cómo estuvo la entrega?')}</div>
      <div className="mt-0.5 text-[12px] text-mp-ink-2">{orden.numero}{orden.choferNombre ? ` · ${orden.choferNombre}` : ''}</div>
      <div className="mt-3 flex justify-center"><Estrellas valor={estrellas} onSet={setEstrellas} size={32} /></div>
      {estrellas > 0 && (
        <>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2}
            placeholder={t('¿Algo que contarnos? (opcional)')}
            className="mt-3 w-full rounded-[14px] bg-mp-cream p-3 text-[13px] text-mp-ink outline-none placeholder:text-mp-ink-2" />
          <button type="button" onClick={guardar} disabled={ocupado}
            className="mt-2 flex h-[44px] w-full items-center justify-center rounded-pill border border-mp-navy text-[14px] font-medium text-mp-navy transition active:scale-[0.99] disabled:opacity-50">
            {t('Enviar calificación')}
          </button>
        </>
      )}
    </div>
  )
}
