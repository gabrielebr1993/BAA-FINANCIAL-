import { useMemo, useState } from 'react'
import { Search, Plus, Truck, User, Building2, X, Users } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { convChofer, convCarrier, convClienteOrden, resumenPorConversacion, eliminarConversacion } from '../data/chat'
import { esConvGrupo, grupoIdDeConv, disolverGrupo } from '../data/grupos'
import { useGrupos } from '../data/useGrupos'
import { conversacionesAdmin } from '../domain/conversaciones'
import { useAvatares } from '../data/useCodigoUsuario'
import { useBulkAuth } from '../BulkAuthContext'
import { ORDEN_ESTADO as E } from '../domain/constants'
import PanelConversaciones from '../components/PanelConversaciones'
import GruposModal from '../components/GruposModal'
import { Card, Cargando, Input, Boton } from '../../components/ui'
import { useLang } from '../../i18n'

// Órdenes con las que tiene sentido chatear: en cola asignada o en proceso.
const CHATEABLES = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]

export default function Mensajes() {
  const { t } = useLang()
  const { usuario, tenantId } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: clientes } = useColeccion('clients')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: usuarios } = useColeccion('users')
  const { datos: mensajes } = useColeccion('messages')
  const avatares = useAvatares()
  const { items: gruposItems, grupos, invitaciones } = useGrupos()
  const [nuevo, setNuevo] = useState(false)
  const [buscarNuevo, setBuscarNuevo] = useState('')
  const [verGrupos, setVerGrupos] = useState(false)
  // Conversaciones iniciadas en esta sesión (aún sin mensajes): filas listas para el panel.
  const [directos, setDirectos] = useState([])
  const [abrir, setAbrir] = useState(null)

  // Candidatos a grupos: el admin/staff puede enumerar a todos los usuarios del tenant.
  const candidatos = useMemo(
    () => (usuarios || []).filter((u) => u.id !== usuario?.id).map((u) => ({ uid: u.id, nombre: u.nombre || u.email || 'Usuario', rol: u.rol, foto: null })),
    [usuarios, usuario],
  )

  // Choferes = plantilla de todos los transportes (carrier.choferes).
  const choferes = useMemo(
    () => carriers.flatMap((c) => (c.choferes || []).map((d) => ({ ...d, carrierNombre: c.nombre }))),
    [carriers],
  )

  // Categorización de TODAS las conversaciones con historial en 4 secciones.
  const cats = useMemo(
    () => conversacionesAdmin({ mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, uid: usuario?.id }),
    [mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, usuario],
  )

  // Mezcla las conversaciones recién iniciadas (sin mensajes) en su sección, sin duplicar.
  const secciones = useMemo(() => {
    const mezclar = (base, seccion) => {
      const keys = new Set(base.map((x) => x.key))
      const extra = directos.filter((d) => d.seccion === seccion && !keys.has(d.key))
      return [...extra, ...base]
    }
    return [
      { k: 'clientes', label: t('Clientes'), icon: 'cliente', items: mezclar(cats.clientes, 'clientes'), vacio: t('Sin conversaciones con clientes.') },
      { k: 'transportistas', label: t('Transportistas'), icon: 'transportista', items: mezclar(cats.transportistas, 'transportistas'), vacio: t('Sin conversaciones con transportistas.') },
      { k: 'conductores', label: t('Conductores'), icon: 'chofer', items: mezclar(cats.conductores, 'conductores'), vacio: t('Sin conversaciones con conductores.') },
      { k: 'operaciones', label: t('Operaciones'), icon: 'operacion', items: mezclar(cats.operaciones, 'operaciones'), vacio: t('Sin conversaciones de operaciones (viajes) aún.') },
      { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('Aún no perteneces a ningún grupo. Toca “Grupos” para crear uno.') },
    ]
  }, [cats, directos, gruposItems, t])

  // Buscador de "nueva conversación": transportes + choferes + clientes (por viaje).
  const resultadosNuevo = useMemo(() => {
    const q = buscarNuevo.trim().toLowerCase()
    const cs = carriers
      .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q))
      .map((c) => ({ id: convCarrier(c.id), nombre: c.nombre || '', tipo: 'carrier', seccion: 'transportistas' }))
    const ds = choferes
      .filter((d) => !q || (d.nombre || '').toLowerCase().includes(q))
      .map((d) => ({ id: convChofer(d.nombre), nombre: d.nombre || '', tipo: 'driver', sub: d.carrierNombre, seccion: 'conductores' }))
    const cli = ordenes
      .filter((o) => o.clienteId && CHATEABLES.includes(o.estado))
      .filter((o) => { const n = (o.clienteNombre || clientes.find((c) => c.id === o.clienteId)?.nombre || ''); return !q || n.toLowerCase().includes(q) || (o.numero || '').toLowerCase().includes(q) })
      .map((o) => {
        const n = o.clienteNombre || clientes.find((c) => c.id === o.clienteId)?.nombre || t('Cliente')
        return { id: convClienteOrden(o.id), nombre: n, tipo: 'cliente', sub: `${o.numero || ''} · ${o.material || ''}`, seccion: 'clientes', viaje: o.numero, material: o.material, participantes: [o.clienteId].filter(Boolean) }
      })
    return [...cli, ...cs, ...ds].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  }, [carriers, choferes, ordenes, clientes, buscarNuevo, t])

  const abrirDirecto = (item) => {
    const fila = {
      key: item.id, chatId: item.id, seccion: item.seccion,
      icon: item.tipo === 'carrier' ? 'transportista' : item.tipo === 'cliente' ? 'cliente' : 'chofer',
      titulo: item.nombre,
      rolLabel: item.tipo === 'carrier' ? t('Transportista') : item.tipo === 'cliente' ? t('Cliente') : t('Chofer'),
      rolColor: item.tipo === 'carrier' ? 'gold' : item.tipo === 'cliente' ? 'green' : 'navy',
      viaje: item.viaje || '', material: item.material || '', carrierNombre: item.sub && item.tipo === 'driver' ? item.sub : '',
      lastText: '', lastTs: '', noLeidos: 0, participantes: item.participantes ?? null,
    }
    setDirectos((s) => (s.some((d) => d.key === fila.key) ? s : [...s, fila]))
    setAbrir(item.id); setNuevo(false); setBuscarNuevo('')
    // Reinicia el disparador para permitir reabrir la misma conversación después.
    setTimeout(() => setAbrir(null), 0)
  }

  // Eliminar TODA una conversación de forma permanente ("sin respaldo"). Solo admin.
  // Si es un GRUPO, se disuelve (borra grupo + mensajes) vía la función de backend.
  const eliminarConv = async (item) => {
    if (!item?.chatId) return
    if (esConvGrupo(item.chatId)) {
      if (!window.confirm(t('¿Disolver este grupo? Se borrará para todos sus integrantes y no se puede deshacer.'))) return
      try { await disolverGrupo(grupoIdDeConv(item.chatId)) } catch { /* noop */ }
      return
    }
    if (!window.confirm(t('¿Estás seguro de que deseas eliminar esta conversación? Se borrará de forma permanente para todos y no se puede deshacer.'))) return
    setDirectos((s) => s.filter((d) => d.key !== item.key))
    try { await eliminarConversacion(tenantId, item.chatId) } catch { /* noop */ }
  }

  if (cargando) return <Cargando />

  return (
    <>
      <PanelConversaciones
        secciones={secciones}
        abrir={abrir}
        titulo={t('Mensajes')}
        onEliminarConversacion={eliminarConv}
        accion={<div className="flex items-center gap-2">
          <Boton variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setVerGrupos(true)}><Users size={15} /> {t('Grupos')}{invitaciones.length > 0 && <span className="ml-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{invitaciones.length}</span>}</Boton>
          <Boton variant="gold" className="px-3 py-1.5 text-sm" onClick={() => setNuevo(true)}><Plus size={15} /> {t('Nueva conversación')}</Boton>
        </div>}
      />

      {/* Panel: nueva conversación (buscar cliente/viaje, transporte o chofer) */}
      {nuevo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20" onClick={() => setNuevo(false)}>
          <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Nueva conversación')}</h3>
              <button onClick={() => setNuevo(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input autoFocus value={buscarNuevo} onChange={(e) => setBuscarNuevo(e.target.value)} placeholder={t('Buscar cliente/viaje, transporte o chofer…')} className="w-full pl-8" />
            </div>
            <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
              {resultadosNuevo.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">{t('Sin resultados.')}</div>
              ) : resultadosNuevo.map((r) => (
                <button key={r.id} onClick={() => abrirDirecto(r)} className="flex w-full items-center gap-2 rounded-xl border border-transparent p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                    {r.tipo === 'carrier' ? <Truck size={16} /> : r.tipo === 'cliente' ? <Building2 size={16} /> : <User size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</div>
                    <div className="truncate text-xs text-slate-400">{r.tipo === 'carrier' ? t('Transporte') : r.tipo === 'cliente' ? `${t('Cliente')} · ${r.sub}` : `${t('Chofer')}${r.sub ? ` · ${r.sub}` : ''}`}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {verGrupos && (
        <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={candidatos} puedeCrear uid={usuario?.id} onClose={() => setVerGrupos(false)} />
      )}
    </>
  )
}
