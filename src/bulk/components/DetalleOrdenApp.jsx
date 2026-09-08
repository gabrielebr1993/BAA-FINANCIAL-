// ============================================================================
// BULK · DETALLE DE ORDEN 2026 (Bloque 3) — esqueleto COMPARTIDO por los 5 roles.
// Capa a pantalla completa (sin tab bar) con:
//   [IconButton atrás · ID de orden centrado 12 gris · IconButton chat]
//   Título 22 = material · meta = cliente · toneladas
//   Card TIMELINE de dos puntos (origen verde lleno = hecho / destino anillo
//   dorado = pendiente), cada punto con nombre, estado, hora y toneladas.
//   Fila de 3 ATAJOS cuadrados (Card 18px, icono 20 + etiqueta 12) — por rol
//   cambian los atajos, NO el layout.
//   ListRow del TICKET registrado con check verde (si existe).
//   PrimaryButton FIJO abajo con la acción del rol (avanzar / asignar / aprobar).
// El contenido extra de cada rol va como `children` (entre atajos y ticket).
// ============================================================================
import { ArrowLeft, MessageSquare, CheckCircle2 } from 'lucide-react'
import { IconButton, PrimaryButton, Card, ListRow } from '../ui'
import { useLang } from '../../i18n'

const S = 1.75

// Un punto del timeline: verde lleno (hecho) o anillo dorado (pendiente).
function Punto({ hecho, ultimo = false }) {
  return (
    <span className="relative flex w-5 flex-col items-center self-stretch">
      {hecho ? (
        <span className="z-10 mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-pill bg-mp-green" />
      ) : (
        <span className="z-10 mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-pill border-2 border-mp-gold bg-white" />
      )}
      {!ultimo && <span className="w-[2px] flex-1 bg-mp-line" />}
    </span>
  )
}

// Una parada del timeline: nombre, estado (verde/dorado), hora y toneladas.
function Parada({ p, ultimo = false, t }) {
  if (!p) return null
  return (
    <div className="flex gap-3">
      <Punto hecho={!!p.hecho} ultimo={ultimo} />
      <div className={`min-w-0 flex-1 ${ultimo ? '' : 'pb-4'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-mp-ink">{p.nombre || '—'}</span>
          {p.hora && <span className="flex-shrink-0 text-[12px] text-mp-ink-2">{p.hora}</span>}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[12px] ${p.hecho ? 'text-mp-green' : 'text-mp-gold'}`}>{p.estado || (p.hecho ? t('Completado') : t('Pendiente'))}</span>
          {p.toneladas != null && <span className="flex-shrink-0 text-[12px] text-mp-ink-2">{p.toneladas} ton</span>}
        </div>
      </div>
    </div>
  )
}

export default function DetalleOrdenApp({
  numero,            // ID visible de la orden (header centrado)
  material,          // título 22
  cliente,           // meta: cliente…
  toneladas,         // …· toneladas solicitadas
  origen,            // { nombre, estado, hora, toneladas, hecho }
  destino,           // { nombre, estado, hora, toneladas, hecho }
  atajos = [],       // [{ icon, label, onClick, badge }] — se pintan máximo 3
  ticket = null,     // { numero, peso, hora } → ListRow con check verde
  accion = null,     // { label, icon, onClick, disabled } → PrimaryButton fijo
  onVolver,
  onChat,            // abre el chat de la orden (icono en el header)
  chatBadge = 0,
  children,          // contenido extra específico del rol
}) {
  const { t } = useLang()
  return (
    <div className="mp-app fixed inset-0 z-[60] mx-auto flex max-w-md flex-col md:max-w-[640px]">
      {/* Header: atrás · ID centrado · chat */}
      <div className="flex items-center gap-3 px-4 pb-1 pt-[max(env(safe-area-inset-top),12px)] min-[430px]:px-5">
        <IconButton icon={ArrowLeft} label={t('Volver')} onClick={onVolver} />
        <div className="min-w-0 flex-1 truncate text-center text-[12px] text-mp-ink-2">{numero}</div>
        {onChat ? <IconButton icon={MessageSquare} label={t('Chat')} badge={chatBadge} onClick={onChat} /> : <span className="w-10" />}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-32 pt-1 min-[430px]:px-5">
        {/* Título = material · meta = cliente + toneladas */}
        <div className="pb-1">
          <h1 className="m-0 truncate text-[22px] font-medium text-mp-ink">{material || t('Material')}</h1>
          <div className="truncate text-[13px] text-mp-ink-2">
            {[cliente, toneladas != null ? `${toneladas} ton` : null].filter(Boolean).join(' · ')}
          </div>
        </div>

        {/* Timeline origen → destino */}
        <Card className="p-4">
          <Parada p={origen} t={t} />
          <Parada p={destino} ultimo t={t} />
        </Card>

        {/* Fila de 3 atajos cuadrados (mismo layout en todos los roles) */}
        {atajos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {atajos.slice(0, 3).map((a, i) => {
              const Icon = a.icon
              return (
                <button key={i} type="button" onClick={a.onClick}
                  className="relative flex flex-col items-center gap-1.5 rounded-[18px] bg-white p-3 shadow-card transition active:scale-[0.98]">
                  {Icon && <Icon size={20} strokeWidth={S} className="text-mp-navy" />}
                  <span className="text-[12px] text-mp-ink-2">{a.label}</span>
                  {a.badge > 0 && <span className="absolute right-2 top-2 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-mp-gold px-1 text-[11px] font-semibold text-mp-navy">{a.badge > 99 ? '99+' : a.badge}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Contenido extra del rol (guía del chofer, diagnóstico, incidencias…) */}
        {children}

        {/* Ticket de báscula registrado */}
        {ticket && (
          <ListRow icon={CheckCircle2} iconClass="bg-mp-green/10 text-mp-green"
            titulo={`${t('Ticket registrado')}${ticket.numero ? ` · ${ticket.numero}` : ''}`}
            meta={[ticket.peso != null ? `${ticket.peso} ton` : null, ticket.hora || null].filter(Boolean).join(' · ')} />
        )}
      </div>

      {/* Acción del estado actual, FIJA abajo (sin tab bar en esta pantalla). */}
      {accion && (
        <div className="fixed inset-x-4 z-10 mx-auto max-w-md md:max-w-[640px]" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <PrimaryButton icon={accion.icon} onClick={accion.onClick} disabled={accion.disabled}>{accion.label}</PrimaryButton>
        </div>
      )}
    </div>
  )
}
