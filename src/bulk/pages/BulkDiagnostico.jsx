// ============================================================================
// BULK · Diagnóstico de asignación (solo admin). Muestra los IDs reales de
// carriers, usuarios, presencias y órdenes para detectar desalineaciones de
// carrierId (p. ej. un chofer cuyo carrierId no coincide con el de su transportista,
// o carriers "Aguilar Hauling" DUPLICADOS). No modifica nada; solo lee.
// ============================================================================
import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, Tabla, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

const FINAL = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
const corto = (id) => (id ? `${String(id).slice(0, 10)}…` : '—')

export default function BulkDiagnostico() {
  const { t } = useLang()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const { datos: usuarios } = useColeccion('users')
  const { datos: presencias } = useColeccion('presence')
  const { datos: ordenes } = useColeccion('orders')

  const carrierPorId = useMemo(() => Object.fromEntries((carriers || []).map((c) => [c.id, c])), [carriers])
  const nombreCarrier = (id) => carrierPorId[id]?.nombre || null

  // Carriers con NOMBRE duplicado (posible causa: transportista y chofer apuntan a docs distintos).
  const duplicados = useMemo(() => {
    const porNombre = {}
    for (const c of carriers || []) { const n = (c.nombre || '').trim().toLowerCase(); (porNombre[n] = porNombre[n] || []).push(c) }
    return Object.values(porNombre).filter((arr) => arr.length > 1)
  }, [carriers])

  const usersRel = (usuarios || []).filter((u) => ['transportista', 'chofer'].includes(u.rol))
  const activas = (ordenes || []).filter((o) => !FINAL.includes(o.estado) && o.transportistaId)

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle>{t('Diagnóstico de asignación')}</PageTitle>
      <Aviso tipo="info" className="mb-4">{t('Herramienta de solo lectura para detectar por qué una orden no aparece en el portal de un transportista. Busca: (1) carriers con el mismo nombre pero id distinto, (2) usuarios cuyo carrierId no existe, (3) presencias/órdenes con un carrierId que no coincide con el transportista.')}</Aviso>

      {duplicados.length > 0 && (
        <Aviso tipo="error" className="mb-4">
          <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5" /><div>
            <b>{t('Hay transportistas DUPLICADOS (mismo nombre, id distinto).')}</b> {t('Esta es la causa más común: el transportista apunta a un id y el chofer a otro. Unifícalos.')}
            <div className="mt-1">{duplicados.map((arr, i) => <div key={i} className="font-mono text-xs">{arr.map((c) => `${c.nombre} = ${c.id}`).join('  ·  ')}</div>)}</div>
          </div></div>
        </Aviso>
      )}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Transportistas (carriers)')}</h3>
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'id', label: 'carrierId' }, { key: 'choferes', label: t('Choferes (roster)') }]}
          rows={(carriers || []).map((c) => ({ ...c, _key: c.id }))}
          renderCell={(c, k) => {
            if (k === 'id') return <span className="font-mono text-xs">{c.id}</span>
            if (k === 'choferes') return <span className="text-xs text-slate-500">{(c.choferes || []).map((d) => `${d.nombre}${d.uid ? '' : ' (sin uid)'}`).join(', ') || '—'}</span>
            return c.nombre
          }}
          minWidth="min-w-[560px]"
        />
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Usuarios (transportista / chofer) y su carrierId')}</h3>
        <Tabla
          columns={[{ key: 'nombre', label: t('Nombre') }, { key: 'rol', label: t('Rol') }, { key: 'carrierId', label: 'carrierId (claim/perfil)' }, { key: 'ok', label: t('Carrier existe') }]}
          rows={usersRel.map((u) => ({ ...u, _key: u.id }))}
          renderCell={(u, k) => {
            if (k === 'carrierId') return <span className="font-mono text-xs">{u.carrierId || '—'}</span>
            if (k === 'rol') return <Badge color={u.rol === 'transportista' ? 'gold' : 'navy'}>{u.rol}</Badge>
            if (k === 'ok') return u.carrierId
              ? (nombreCarrier(u.carrierId) ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={13} /> {nombreCarrier(u.carrierId)}</span> : <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle size={13} /> {t('NO existe')}</span>)
              : <span className="text-rose-600">{t('sin carrierId')}</span>
            return u.nombre
          }}
          minWidth="min-w-[620px]"
        />
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Presencias (choferes conectados)')}</h3>
        <Tabla
          columns={[{ key: 'nombre', label: t('Chofer') }, { key: 'enLinea', label: t('En línea') }, { key: 'carrierId', label: 'carrierId presencia' }, { key: 'carrier', label: t('Transporte') }]}
          rows={(presencias || []).map((p) => ({ ...p, _key: p.id }))}
          renderCell={(p, k) => {
            if (k === 'enLinea') return <Badge color={p.enLinea ? 'green' : 'slate'}>{p.enLinea ? t('Sí') : t('No')}</Badge>
            if (k === 'carrierId') return <span className="font-mono text-xs">{corto(p.carrierId)}</span>
            if (k === 'carrier') return nombreCarrier(p.carrierId) || <span className="text-rose-600">{t('NO coincide con ningún carrier')}</span>
            return p.nombre
          }}
          minWidth="min-w-[560px]"
        />
      </Card>

      <Card className="p-4">
        <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Órdenes activas y su transportistaId')}</h3>
        {activas.length === 0 ? <p className="text-sm text-slate-400">{t('No hay órdenes activas asignadas a un transporte.')}</p> : (
          <Tabla
            columns={[{ key: 'numero', label: t('Orden') }, { key: 'estado', label: t('Estado') }, { key: 'transportistaId', label: 'transportistaId' }, { key: 'carrier', label: t('Transporte') }, { key: 'chofer', label: t('Chofer') }]}
            rows={activas.map((o) => ({ ...o, _key: o.id }))}
            renderCell={(o, k) => {
              if (k === 'estado') return <Badge color="navy">{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
              if (k === 'transportistaId') return <span className="font-mono text-xs">{corto(o.transportistaId)}</span>
              if (k === 'carrier') return nombreCarrier(o.transportistaId) || <span className="text-rose-600">{t('NO coincide')}</span>
              if (k === 'chofer') return o.choferNombre || '—'
              return o.numero
            }}
            minWidth="min-w-[640px]"
          />
        )}
      </Card>
    </div>
  )
}
