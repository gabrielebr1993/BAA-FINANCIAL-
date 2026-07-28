import { useMemo, useState } from 'react'
import { MessageSquare, Search } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import ChatOrden from '../components/ChatOrden'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, EstadoVacio, Input } from '../../components/ui'
import { useLang } from '../../i18n'

// Órdenes con las que tiene sentido chatear: en cola asignada o en proceso.
const CHATEABLES = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]
const COLOR_EST = { notificando: 'gold', aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green' }

export default function Mensajes() {
  const { t } = useLang()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const [sel, setSel] = useState('')
  const [buscar, setBuscar] = useState('')

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return ordenes
      .filter((o) => CHATEABLES.includes(o.estado))
      .filter((o) => !q || (o.numero || '').toLowerCase().includes(q) || (o.choferNombre || '').toLowerCase().includes(q))
      .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
  }, [ordenes, buscar])

  const orden = lista.find((o) => o.id === sel) || lista[0] || null

  if (cargando) return <Cargando />

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col">
      <PageTitle>{t('Mensajes')}</PageTitle>
      {lista.length === 0 ? (
        <EstadoVacio titulo={t('Sin conversaciones')} texto={t('Cuando tengas órdenes asignadas o en proceso, podrás chatear con el chofer aquí.')} mostrarBoton={false} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
          {/* Lista de conversaciones */}
          <Card className="flex min-h-0 flex-col p-3 lg:col-span-1">
            <div className="relative mb-2">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar orden o chofer…')} className="w-full pl-8" />
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto">
              {lista.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)} className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition ${orden?.id === o.id ? 'border-amber-500 bg-amber-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><MessageSquare size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                      <Badge color={COLOR_EST[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                    </div>
                    <div className="truncate text-xs text-slate-400">{o.choferNombre || t('sin chofer')} · {o.material}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Conversación */}
          <div className="min-h-0 lg:col-span-2">
            {orden && (
              <Card className="flex h-full flex-col p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
                  <Badge color={COLOR_EST[orden.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[orden.estado])}</Badge>
                  <span className="text-xs text-slate-400">{orden.choferNombre || t('sin chofer')}</span>
                </div>
                <div className="min-h-0 flex-1"><ChatOrden orden={orden} fill /></div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
