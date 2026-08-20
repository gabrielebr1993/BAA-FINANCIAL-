// ============================================================================
// BULK · Gestión de GRUPOS de chat (crear, invitaciones, integrantes). Toda acción
// pasa por la Cloud Function (permisos validados en backend). Este componente solo
// dispara las acciones y muestra el estado (que llega en tiempo real por props).
//   - Crear grupo (nombre + participantes). El chofer NO puede crear (puedeCrear=false).
//   - Invitaciones pendientes: aceptar / rechazar.
//   - Integrantes: foto, nombre y rol. El creador/admin invita y expulsa; cualquiera sale.
// ============================================================================
import { useMemo, useState } from 'react'
import { X, Plus, Users, UserPlus, LogOut, Trash2, Check, ChevronLeft, Shield } from 'lucide-react'
import { crearGrupo, invitarAGrupo, aceptarGrupo, rechazarGrupo, salirGrupo, expulsarDeGrupo, disolverGrupo } from '../data/grupos'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { Card, Boton, Input, Badge, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

function Avatar({ foto, nombre, size = 34 }) {
  const px = { width: size, height: size }
  if (foto) return <img src={foto} alt={nombre || ''} style={px} className="flex-shrink-0 rounded-lg object-cover" />
  return <div style={px} className="grid flex-shrink-0 place-items-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{(nombre || '?').charAt(0).toUpperCase()}</div>
}

export default function GruposModal({ grupos = [], invitaciones = [], candidatos = [], puedeCrear = false, uid, onClose }) {
  const { t } = useLang()
  const [vista, setVista] = useState('lista') // 'lista' | 'crear' | grupoId
  const [nombre, setNombre] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [buscar, setBuscar] = useState('')

  const grupo = useMemo(() => grupos.find((g) => g.id === vista) || null, [grupos, vista])
  const rolLabel = (r) => t(BULK_ROLES_LABEL[r] || r || 'Usuario')
  const correr = async (fn) => { setBusy(true); setErr(null); try { await fn() } catch (e) { setErr(e?.message || t('No se pudo completar la acción.')) } finally { setBusy(false) } }

  const candidatosFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return candidatos.filter((c) => c.uid && c.uid !== uid && (!q || (c.nombre || '').toLowerCase().includes(q)))
  }, [candidatos, buscar, uid])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const crear = () => correr(async () => {
    if (!nombre.trim() || sel.size === 0) { setErr(t('Ponle nombre al grupo y elige al menos un integrante.')); return }
    await crearGrupo(nombre.trim(), [...sel])
    setNombre(''); setSel(new Set()); setVista('lista')
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16" onClick={onClose}>
      <Card className="flex max-h-[80vh] w-full max-w-lg flex-col p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          {vista !== 'lista' && <button onClick={() => { setVista('lista'); setErr(null) }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>}
          <Users size={18} className="text-amber-500" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">
            {vista === 'crear' ? t('Nuevo grupo') : grupo ? grupo.nombre : t('Grupos')}
          </h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        {err && <Aviso tipo="error" className="mb-3">{err}</Aviso>}

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {/* ── LISTA: invitaciones + mis grupos ─────────────────────────────── */}
          {vista === 'lista' && (
            <>
              {invitaciones.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t('Invitaciones')}</div>
                  {invitaciones.map((g) => (
                    <div key={g.id} className="mb-1 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
                      <Users size={16} className="text-amber-500" />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{g.nombre}</div><div className="text-[11px] text-slate-500">{(g.miembros || []).length} {t('integrantes')}</div></div>
                      <Boton variant="gold" disabled={busy} onClick={() => correr(() => aceptarGrupo(g.id))} className="px-2.5 py-1 text-xs"><Check size={13} /> {t('Aceptar')}</Boton>
                      <Boton variant="ghost" disabled={busy} onClick={() => correr(() => rechazarGrupo(g.id))} className="px-2.5 py-1 text-xs">{t('Rechazar')}</Boton>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-1 flex items-center gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Mis grupos')}</div>
                {puedeCrear && <Boton variant="gold" onClick={() => { setVista('crear'); setErr(null) }} className="ml-auto px-2.5 py-1 text-xs"><Plus size={14} /> {t('Nuevo grupo')}</Boton>}
              </div>
              {grupos.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">{t('Aún no perteneces a ningún grupo.')}</p> : grupos.map((g) => (
                <button key={g.id} onClick={() => { setVista(g.id); setErr(null) }} className="mb-1 flex w-full items-center gap-2 rounded-xl border border-transparent p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><Users size={16} /></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{g.nombre}</div><div className="text-[11px] text-slate-500">{(g.miembros || []).length} {t('integrantes')}{g.creadorId === uid ? ` · ${t('creador')}` : ''}</div></div>
                </button>
              ))}
            </>
          )}

          {/* ── CREAR ────────────────────────────────────────────────────────── */}
          {vista === 'crear' && (
            <>
              <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('Nombre del grupo')} className="mb-2 w-full" />
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar personas…')} className="mb-2 w-full" />
              <div className="text-[11px] font-bold uppercase text-slate-400">{t('Integrantes')} ({sel.size})</div>
              {candidatosFiltrados.length === 0 ? <p className="py-4 text-center text-xs text-slate-400">{t('No hay personas que puedas agregar.')}</p> : candidatosFiltrados.map((c) => (
                <label key={c.uid} className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={sel.has(c.uid)} onChange={() => toggle(c.uid)} className="h-4 w-4 accent-amber-500" />
                  <Avatar foto={c.foto} nombre={c.nombre} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</div></div>
                  <Badge color="slate">{rolLabel(c.rol)}</Badge>
                </label>
              ))}
              <Boton variant="gold" disabled={busy || !nombre.trim() || sel.size === 0} onClick={crear} className="mt-3 w-full justify-center"><Plus size={15} /> {t('Crear grupo')}</Boton>
            </>
          )}

          {/* ── GESTIÓN DE UN GRUPO ──────────────────────────────────────────── */}
          {grupo && (
            <GestionGrupo grupo={grupo} uid={uid} candidatos={candidatos} rolLabel={rolLabel} correr={correr} busy={busy} onCerrar={() => setVista('lista')} />
          )}
        </div>
      </Card>
    </div>
  )
}

function GestionGrupo({ grupo: g, uid, candidatos, rolLabel, correr, busy, onCerrar }) {
  const { t } = useLang()
  const [invitando, setInvitando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const esGestor = g.creadorId === uid
  const miembros = g.miembros || []
  const invitados = g.invitados || []
  const porInvitar = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return candidatos.filter((c) => c.uid && !miembros.includes(c.uid) && !invitados.includes(c.uid) && (!q || (c.nombre || '').toLowerCase().includes(q)))
  }, [candidatos, miembros, invitados, buscar])

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">{t('Integrantes')} ({miembros.length})</div>
      {miembros.map((m) => (
        <div key={m} className="flex items-center gap-2 rounded-lg p-1.5">
          <Avatar foto={g.fotos?.[m]} nombre={g.nombres?.[m]} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{g.nombres?.[m] || t('Usuario')}{m === uid ? ` (${t('tú')})` : ''}{m === g.creadorId ? ' · ' : ''}{m === g.creadorId && <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">{t('creador')}</span>}</div></div>
          <Badge color="slate">{rolLabel(g.roles?.[m])}</Badge>
          {esGestor && m !== g.creadorId && <button title={t('Quitar')} disabled={busy} onClick={() => correr(() => expulsarDeGrupo(g.id, m))} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>}
        </div>
      ))}
      {invitados.length > 0 && (
        <>
          <div className="mb-1 mt-2 text-[11px] font-bold uppercase text-slate-400">{t('Invitaciones pendientes')} ({invitados.length})</div>
          {invitados.map((m) => (
            <div key={m} className="flex items-center gap-2 rounded-lg p-1.5 opacity-70">
              <Avatar foto={g.fotos?.[m]} nombre={g.nombres?.[m]} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-500">{g.nombres?.[m] || t('Usuario')}</div></div>
              <Badge color="gold">{t('pendiente')}</Badge>
              {esGestor && <button title={t('Cancelar invitación')} disabled={busy} onClick={() => correr(() => expulsarDeGrupo(g.id, m))} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>}
            </div>
          ))}
        </>
      )}

      {esGestor && (
        <div className="mt-3">
          {!invitando ? (
            <Boton variant="ghost" onClick={() => setInvitando(true)} className="px-2.5 py-1 text-xs"><UserPlus size={14} /> {t('Invitar personas')}</Boton>
          ) : (
            <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar personas…')} className="mb-1 w-full py-1 text-sm" />
              <div className="scroll-thin max-h-40 overflow-y-auto">
                {porInvitar.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">{t('No hay más personas para invitar.')}</p> : porInvitar.map((c) => (
                  <div key={c.uid} className="flex items-center gap-2 rounded-lg p-1.5">
                    <Avatar foto={c.foto} nombre={c.nombre} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm text-brand-navy dark:text-slate-100">{c.nombre}</div></div>
                    <Badge color="slate">{rolLabel(c.rol)}</Badge>
                    <Boton variant="gold" disabled={busy} onClick={() => correr(() => invitarAGrupo(g.id, [c.uid]))} className="px-2 py-0.5 text-xs">{t('Invitar')}</Boton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {esGestor
          ? <Boton variant="ghost" disabled={busy} onClick={() => { if (window.confirm(t('¿Disolver el grupo para todos? No se puede deshacer.'))) correr(() => disolverGrupo(g.id).then(onCerrar)) }} className="px-2.5 py-1 text-xs text-rose-600"><Trash2 size={14} /> {t('Disolver grupo')}</Boton>
          : <Boton variant="ghost" disabled={busy} onClick={() => { if (window.confirm(t('¿Salir del grupo?'))) correr(() => salirGrupo(g.id).then(onCerrar)) }} className="px-2.5 py-1 text-xs text-rose-600"><LogOut size={14} /> {t('Salir del grupo')}</Boton>}
      </div>
    </div>
  )
}
