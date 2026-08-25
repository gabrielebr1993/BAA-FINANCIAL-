// BULK · Selector de CONTACTOS para iniciar un chat PRIVADO (1-a-1) según la matriz
// de comunicación por roles. Reutilizable en TODOS los portales (chofer, transportista,
// cliente, staff): muestra solo las personas con las que `yo` PUEDE comunicarse
// (misma compañía + política de rol), agrupadas por rol, con su foto. Al elegir una,
// valida en el BACKEND (Cloud Function) y abre la conversación.
import { useMemo, useState } from 'react'
import { Search, X, MessageSquarePlus } from 'lucide-react'
import Avatar from './Avatar'
import { useContactos, abrirPrivado } from '../data/useComunicacion'
import { Card, Input } from '../../components/ui'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { useLang } from '../../i18n'

export default function ContactosModal({ yo, tenantId, onAbrir, onClose, filtrar = null }) {
  const { t } = useLang()
  const gruposBase = useContactos(yo, tenantId)
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(null) // uid en curso
  const [error, setError] = useState('')

  // Filtro de ALCANCE opcional del portal (p. ej. el supervisor solo ve los
  // transportistas/choferes de SUS trabajos) además de la matriz de roles.
  const grupos = useMemo(() => {
    if (typeof filtrar !== 'function') return gruposBase
    return gruposBase
      .map((g) => ({ ...g, personas: g.personas.filter((p) => filtrar(p)) }))
      .filter((g) => g.personas.length)
  }, [gruposBase, filtrar])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return grupos
    return grupos
      .map((g) => ({ ...g, personas: g.personas.filter((p) => (p.nombre || '').toLowerCase().includes(s) || String(p.codigo || '').includes(s)) }))
      .filter((g) => g.personas.length)
  }, [grupos, q])

  const total = grupos.reduce((n, g) => n + g.personas.length, 0)

  const elegir = async (p) => {
    if (cargando) return
    setError(''); setCargando(p.uid)
    try {
      const { key, participantes } = await abrirPrivado(p.uid)
      onAbrir?.({ key, participantes, contacto: p })
      onClose?.()
    } catch (e) {
      setError(e?.message || t('No se pudo abrir la conversación.'))
    } finally {
      setCargando(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-16" onClick={onClose}>
      <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <MessageSquarePlus size={18} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Nueva conversación')}</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar contacto por nombre o ID…')} className="w-full pl-8" />
        </div>
        {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10">{error}</div>}
        <div className="scroll-thin max-h-80 space-y-3 overflow-y-auto">
          {total === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">{t('No tienes contactos disponibles para chatear.')}</div>
          ) : filtrados.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">{t('Sin resultados.')}</div>
          ) : filtrados.map((g) => (
            <div key={g.rol}>
              <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t(BULK_ROLES_LABEL[g.rol]) || g.rol}</div>
              <div className="space-y-1">
                {g.personas.map((p) => (
                  <button key={p.uid} disabled={!!cargando} onClick={() => elegir(p)} className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800">
                    <Avatar foto={p.foto} nombre={p.nombre} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{p.nombre || t('Usuario')}</div>
                      <div className="truncate text-xs text-slate-400">{(t(BULK_ROLES_LABEL[p.rol]) || p.rol)}{p.codigo ? ` · ID #${p.codigo}` : ''}</div>
                    </div>
                    {cargando === p.uid && <span className="text-[11px] font-semibold text-brand-gold">{t('Abriendo…')}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
