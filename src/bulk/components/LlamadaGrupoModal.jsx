// BULK · Selector de personas para una LLAMADA GRUPAL (malla WebRTC). Usa el DIRECTORIO
// del tenant + la matriz de comunicación (useContactos), de modo que:
//   - Los invitados son SIEMPRE uids REALES de cuentas (no ids de empresa ni autores de
//     mensajes sueltos) → el timbre SÍ le llega a cada invitado (su listener escucha por
//     su propio uid). Esto arregla el "no suena / no llega".
//   - Solo aparecen contactos permitidos por la política (misma compañía + matriz).
// Selección múltiple; al confirmar devuelve [{ uid, nombre, rol }] para crear la sala.
import { useMemo, useState } from 'react'
import { Search, X, Users, Phone, Video, Check } from 'lucide-react'
import Avatar from './Avatar'
import { useContactos } from '../data/useComunicacion'
import { Card, Input } from '../../components/ui'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { useLang } from '../../i18n'

export default function LlamadaGrupoModal({ yo, tenantId, tipo = 'audio', titulo, preseleccion = [], onConfirmar, onClose }) {
  const { t } = useLang()
  const grupos = useContactos(yo, tenantId)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(() => new Set((preseleccion || []).filter(Boolean)))

  const toggle = (uid) => setSel((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n })

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return grupos
    return grupos
      .map((g) => ({ ...g, personas: g.personas.filter((p) => (p.nombre || '').toLowerCase().includes(s) || String(p.codigo || '').includes(s)) }))
      .filter((g) => g.personas.length)
  }, [grupos, q])

  const total = grupos.reduce((n, g) => n + g.personas.length, 0)
  const seleccionadas = useMemo(() => grupos.flatMap((g) => g.personas).filter((p) => sel.has(p.uid)), [grupos, sel])

  const confirmar = () => {
    if (!seleccionadas.length) return
    onConfirmar?.(seleccionadas.map((p) => ({ uid: p.uid, nombre: p.nombre, rol: p.rol })))
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-16" onClick={onClose}>
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Users size={18} className="text-amber-500" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{titulo || (tipo === 'video' ? t('Videollamada grupal') : t('Llamada grupal'))}</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar a quién llamar…')} className="w-full pl-8" />
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto">
          {total === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">{t('No tienes contactos disponibles para llamar.')}</div>
          ) : filtrados.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">{t('Sin resultados.')}</div>
          ) : filtrados.map((g) => (
            <div key={g.rol}>
              <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t(BULK_ROLES_LABEL[g.rol]) || g.rol}</div>
              <div className="space-y-1">
                {g.personas.map((p) => {
                  const on = sel.has(p.uid)
                  return (
                    <button key={p.uid} onClick={() => toggle(p.uid)} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${on ? 'border-amber-500 bg-amber-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                      <Avatar foto={p.foto} nombre={p.nombre} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{p.nombre || t('Usuario')}</div>
                        <div className="truncate text-xs text-slate-400">{(t(BULK_ROLES_LABEL[p.rol]) || p.rol)}{p.codigo ? ` · ID #${p.codigo}` : ''}</div>
                      </div>
                      <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border ${on ? 'border-amber-500 bg-amber-500 text-slate-900' : 'border-slate-300 dark:border-slate-600'}`}>{on && <Check size={14} />}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-400">{seleccionadas.length} {seleccionadas.length === 1 ? t('seleccionado') : t('seleccionados')}</span>
          <button type="button" onClick={confirmar} disabled={!seleccionadas.length}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40">
            {tipo === 'video' ? <Video size={16} /> : <Phone size={16} />}
            {t('Llamar')}{seleccionadas.length ? ` (${seleccionadas.length})` : ''}
          </button>
        </div>
      </Card>
    </div>
  )
}
