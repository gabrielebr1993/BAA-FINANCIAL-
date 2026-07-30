import { useMemo, useState } from 'react'
import { MessageSquare, Search, Plus, Truck, User, X } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import ChatOrden from '../components/ChatOrden'
import { convChofer, convCarrier, esConvDirecta } from '../data/chat'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, EstadoVacio, Input, Boton } from '../../components/ui'
import { useLang } from '../../i18n'

// Órdenes con las que tiene sentido chatear: en cola asignada o en proceso.
const CHATEABLES = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]
const COLOR_EST = { notificando: 'gold', aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green' }

export default function Mensajes() {
  const { t } = useLang()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: mensajes } = useColeccion('messages')
  const [sel, setSel] = useState('')
  const [buscar, setBuscar] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [buscarNuevo, setBuscarNuevo] = useState('')
  // Conversaciones directas iniciadas en esta sesión (aún sin mensajes): {id, nombre, tipo}.
  const [directos, setDirectos] = useState([])

  // Choferes = plantilla de todos los transportes (carrier.choferes).
  const choferes = useMemo(
    () => carriers.flatMap((c) => (c.choferes || []).map((d) => ({ ...d, carrierNombre: c.nombre }))),
    [carriers],
  )

  // Conversaciones de ORDEN (activas/chateables).
  const ordenConvos = useMemo(
    () => ordenes
      .filter((o) => CHATEABLES.includes(o.estado))
      .map((o) => ({ key: o.id, chatId: o.id, tipo: 'orden', estado: o.estado, nombre: o.numero || '', sub: `${o.choferNombre || t('sin chofer')} · ${o.material || ''}`, ts: o.actualizadoEn || o.creadoEn || '' })),
    [ordenes, t],
  )

  // Conversaciones DIRECTAS: derivadas de los mensajes dm_* + las iniciadas ahora.
  const directoConvos = useMemo(() => {
    const ids = new Set(directos.map((d) => d.id))
    const lastTs = {}
    for (const m of mensajes) {
      if (esConvDirecta(m.orderId)) { ids.add(m.orderId); if (!lastTs[m.orderId] || m.ts > lastTs[m.orderId]) lastTs[m.orderId] = m.ts }
    }
    const resolver = (id) => {
      if (id.startsWith('dm_c_')) { const c = carriers.find((x) => x.id === id.slice(5)); return { tipo: 'carrier', nombre: c?.nombre || t('Transporte') } }
      if (id.startsWith('dm_d_')) { const d = choferes.find((x) => convChofer(x.nombre) === id); return { tipo: 'driver', nombre: d?.nombre || t('Chofer') } }
      return { tipo: 'carrier', nombre: t('Conversación') }
    }
    return [...ids].map((id) => {
      const r = resolver(id)
      return { key: id, chatId: id, tipo: r.tipo, nombre: r.nombre, sub: r.tipo === 'carrier' ? t('Transporte') : t('Chofer'), ts: lastTs[id] || '' }
    })
  }, [mensajes, directos, carriers, choferes, t])

  const todas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return [...directoConvos, ...ordenConvos]
      .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q))
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  }, [directoConvos, ordenConvos, buscar])

  const activa = todas.find((c) => c.key === sel) || todas[0] || null

  // Buscador de "nueva conversación": transportes + choferes.
  const resultadosNuevo = useMemo(() => {
    const q = buscarNuevo.trim().toLowerCase()
    const cs = carriers
      .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q))
      .map((c) => ({ id: convCarrier(c.id), nombre: c.nombre || '', tipo: 'carrier' }))
    const ds = choferes
      .filter((d) => !q || (d.nombre || '').toLowerCase().includes(q))
      .map((d) => ({ id: convChofer(d.nombre), nombre: d.nombre || '', tipo: 'driver', sub: d.carrierNombre }))
    return [...cs, ...ds].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  }, [carriers, choferes, buscarNuevo])

  const abrirDirecto = (item) => {
    setDirectos((s) => (s.some((d) => d.id === item.id) ? s : [...s, { id: item.id, nombre: item.nombre, tipo: item.tipo }]))
    setSel(item.id); setNuevo(false); setBuscarNuevo('')
  }

  if (cargando) return <Cargando />

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col">
      <div className="flex items-center gap-2">
        <PageTitle>{t('Mensajes')}</PageTitle>
        <Boton variant="gold" className="ml-auto px-3 py-1.5 text-sm" onClick={() => setNuevo(true)}><Plus size={15} /> {t('Nueva conversación')}</Boton>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        {/* Lista de conversaciones */}
        <Card className="flex min-h-0 flex-col p-3 lg:col-span-1">
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar conversación, transporte o chofer…')} className="w-full pl-8" />
          </div>
          <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto">
            {todas.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-slate-400">{t('Sin conversaciones. Toca “Nueva conversación”.')}</div>
            ) : todas.map((c) => (
              <button key={c.key} onClick={() => setSel(c.key)} className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition ${activa?.key === c.key ? 'border-amber-500 bg-amber-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  {c.tipo === 'orden' ? <MessageSquare size={16} /> : c.tipo === 'carrier' ? <Truck size={16} /> : <User size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-sm font-bold text-brand-navy dark:text-slate-100 ${c.tipo === 'orden' ? 'font-mono' : ''}`}>{c.nombre}</span>
                    {c.tipo === 'orden' && <Badge color={COLOR_EST[c.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[c.estado])}</Badge>}
                  </div>
                  <div className="truncate text-xs text-slate-400">{c.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Conversación activa */}
        <div className="min-h-0 lg:col-span-2">
          {activa ? (
            <Card className="flex h-full flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                {activa.tipo === 'orden' ? (
                  <>
                    <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{activa.nombre}</span>
                    <Badge color={COLOR_EST[activa.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[activa.estado])}</Badge>
                  </>
                ) : (
                  <>
                    {activa.tipo === 'carrier' ? <Truck size={16} className="text-amber-500" /> : <User size={16} className="text-amber-500" />}
                    <span className="font-bold text-brand-navy dark:text-slate-100">{activa.nombre}</span>
                    <Badge color="slate">{activa.tipo === 'carrier' ? t('Transporte') : t('Chofer')}</Badge>
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1"><ChatOrden orden={{ id: activa.chatId, numero: activa.nombre }} fill /></div>
            </Card>
          ) : (
            <EstadoVacio titulo={t('Sin conversaciones')} texto={t('Crea una conversación con un transporte o chofer, o chatea desde una orden activa.')} mostrarBoton={false} />
          )}
        </div>
      </div>

      {/* Panel: nueva conversación (buscar transporte o chofer) */}
      {nuevo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20" onClick={() => setNuevo(false)}>
          <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Nueva conversación')}</h3>
              <button onClick={() => setNuevo(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input autoFocus value={buscarNuevo} onChange={(e) => setBuscarNuevo(e.target.value)} placeholder={t('Buscar transporte o chofer…')} className="w-full pl-8" />
            </div>
            <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
              {resultadosNuevo.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">{t('Sin resultados.')}</div>
              ) : resultadosNuevo.map((r) => (
                <button key={r.id} onClick={() => abrirDirecto(r)} className="flex w-full items-center gap-2 rounded-xl border border-transparent p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                    {r.tipo === 'carrier' ? <Truck size={16} /> : <User size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</div>
                    <div className="truncate text-xs text-slate-400">{r.tipo === 'carrier' ? t('Transporte') : `${t('Chofer')}${r.sub ? ` · ${r.sub}` : ''}`}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
