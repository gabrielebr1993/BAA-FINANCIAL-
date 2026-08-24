// ============================================================================
// BULK · DOCUMENTOS DEL CHOFER — componente COMPARTIDO (mismo UI para el
// administrador y para el propio chofer, parametrizado por rol):
//   · puedeSubir     → el chofer sube/reemplaza SUS documentos y captura la
//                      fecha de vencimiento del documento.
//   · puedeVerificar → el staff marca Verificado/Rechazado, ajusta vencimiento
//                      y puede borrar. El chofer NUNCA toca la verificación
//                      (además de la UI, lo refuerzan las reglas de Firestore:
//                      el campo `verificaciones` solo lo escribe el staff).
// Modelo (bulk_driverProfiles/{uid}):
//   documentos:      { [tipo]: { foto, vence, subidoEn } }        ← chofer/staff
//   verificaciones:  { [tipo]: { estado, por, en } }              ← SOLO staff
// Compat: licenciaFoto / socialFoto (legado) se leen como documentos.
// ============================================================================
import { useState } from 'react'
import { FileText, Camera, Download, Trash2, CheckCircle2, XCircle, Clock, AlertTriangle, CalendarDays } from 'lucide-react'
import { leerFotoReducida } from './foto'
import { Badge } from '../../components/ui'
import { useLang } from '../../i18n'

export const TIPOS_DOC = [
  { k: 'licencia', l: 'Licencia de conducir' },
  { k: 'medical', l: 'Medical Card' },
  { k: 'seguro', l: 'Seguro' },
  { k: 'social', l: 'Seguro social' },
]

// Documento efectivo (nuevo modelo o campos legado licenciaFoto/socialFoto).
export function docDe(perfil, k) {
  const d = (perfil?.documentos || {})[k]
  if (d && d.foto) return d
  if (k === 'licencia' && perfil?.licenciaFoto) return { foto: perfil.licenciaFoto, legado: true }
  if (k === 'social' && perfil?.socialFoto) return { foto: perfil.socialFoto, legado: true }
  return null
}
const hoyISO = () => new Date().toISOString().slice(0, 10)
export const docVencido = (d) => !!(d && d.vence && d.vence < hoyISO())

// Estado mostrado: la verificación del staff manda; sin ella, un documento
// subido está "pendiente de revisión".
export function estadoDoc(perfil, k) {
  const d = docDe(perfil, k)
  if (!d) return null
  if (docVencido(d)) return 'vencido'
  return (perfil?.verificaciones || {})[k]?.estado || 'pendiente'
}

const EST = {
  verificado: { l: 'Verificado', c: 'green', I: CheckCircle2 },
  rechazado: { l: 'Rechazado', c: 'red', I: XCircle },
  pendiente: { l: 'Pendiente de revisión', c: 'gold', I: Clock },
  vencido: { l: 'Vencido', c: 'red', I: AlertTriangle },
}

export default function DocumentosChofer({ perfil, puedeSubir = false, puedeVerificar = false, onMerge, onBorrar, nombre = '' }) {
  const { t } = useLang()
  const [zoom, setZoom] = useState(null)
  const [venceEdit, setVenceEdit] = useState({}) // borrador de fecha por tipo

  const subir = async (k, e) => {
    const foto = await leerFotoReducida(e.target.files?.[0]); if (e.target) e.target.value = ''
    if (!foto) return
    await onMerge({ documentos: { [k]: { foto, subidoEn: new Date().toISOString(), vence: venceEdit[k] || docDe(perfil, k)?.vence || null } } })
  }
  const fijarVence = async (k, v) => {
    setVenceEdit((s) => ({ ...s, [k]: v }))
    if (docDe(perfil, k)) await onMerge({ documentos: { [k]: { vence: v || null } } })
  }
  const verificar = async (k, estado) => {
    await onMerge({ verificaciones: { [k]: { estado, por: nombre || '', en: new Date().toISOString() } } })
  }
  const descargar = (d, base) => {
    try {
      const ext = (String(d.foto).match(/^data:image\/(\w+)/) || [])[1] || 'jpg'
      const a = document.createElement('a'); a.href = d.foto; a.download = `${base}.${ext}`; a.click()
    } catch { /* noop */ }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPOS_DOC.map(({ k, l }) => {
          const d = docDe(perfil, k)
          const est = estadoDoc(perfil, k)
          const info = est ? EST[est] : null
          const vence = venceEdit[k] ?? (d?.vence || '')
          return (
            <div key={k} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center gap-1.5">
                <FileText size={14} className="text-amber-500" />
                <span className="text-xs font-bold text-brand-navy dark:text-slate-100">{t(l)}</span>
                {info && <span className="ml-auto"><Badge color={info.c}>{t(info.l)}</Badge></span>}
              </div>

              {d ? (
                <>
                  <button type="button" onClick={() => setZoom(d.foto)} className="block w-full" title={t('Ver en grande')}>
                    <img src={d.foto} alt={l} className="h-28 w-full rounded-xl border border-slate-100 object-cover transition hover:brightness-95 dark:border-slate-800" />
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarDays size={11} />
                    <span>{t('Vence')}:</span>
                    {(puedeSubir || puedeVerificar) ? (
                      <input type="date" value={vence} onChange={(e) => fijarVence(k, e.target.value)}
                        className={`rounded-lg border px-1.5 py-0.5 text-[11px] outline-none dark:bg-slate-800 ${docVencido({ vence }) ? 'border-rose-300 text-rose-600 dark:text-rose-400' : 'border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-300'}`} />
                    ) : <span>{d.vence || '—'}</span>}
                    {d.subidoEn && <span className="ml-auto">{t('subido')} {String(d.subidoEn).slice(0, 10)}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => descargar(d, `${nombre || 'chofer'}_${k}`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><Download size={11} /> {t('Descargar')}</button>
                    {puedeSubir && (
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        <Camera size={11} /> {t('Reemplazar')}
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => subir(k, e)} className="hidden" />
                      </label>
                    )}
                    {puedeVerificar && (
                      <>
                        {est !== 'verificado' && <button type="button" onClick={() => verificar(k, 'verificado')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-600"><CheckCircle2 size={11} /> {t('Verificar')}</button>}
                        {est !== 'rechazado' && <button type="button" onClick={() => verificar(k, 'rechazado')} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"><XCircle size={11} /> {t('Rechazar')}</button>}
                        {onBorrar && <button type="button" onClick={() => window.confirm(`${t('¿Borrar')} ${t(l)}? ${t('El chofer podrá subirlo de nuevo.')}`) && onBorrar(k)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 dark:border-slate-700"><Trash2 size={11} /></button>}
                      </>
                    )}
                  </div>
                  {(perfil?.verificaciones || {})[k]?.en && (
                    <div className="mt-1 text-[10px] text-slate-400">{t('Revisado por')} {(perfil.verificaciones[k].por || '—')} · {String(perfil.verificaciones[k].en).slice(0, 10)}</div>
                  )}
                </>
              ) : puedeSubir ? (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 transition hover:border-amber-400 hover:text-amber-600 dark:border-slate-600">
                  <Camera size={20} /> {t('Subir foto')}
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => subir(k, e)} className="hidden" />
                </label>
              ) : (
                <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-300 dark:border-slate-700 dark:text-slate-600">{t('Sin subir')}</div>
              )}
            </div>
          )
        })}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="documento" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setZoom(null)} className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white hover:bg-white/25">{t('Cerrar')}</button>
        </div>
      )}
    </>
  )
}
