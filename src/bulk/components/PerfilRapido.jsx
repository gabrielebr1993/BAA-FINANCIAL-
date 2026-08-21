// Tarjeta RÁPIDA de un usuario, al hacer clic en su nombre dentro de un chat.
// - Staff (admin/dispatcher): además puede abrir la página de PERFIL completa
//   (hoy solo existe la del chofer, enrutada por nombre).
// - Cualquier rol: ve la tarjeta con foto (si es chofer y existe), nombre, rol y
//   teléfono (si existe). No inventa datos: solo muestra lo que hay en la base.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Phone, ExternalLink, Video } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { useLlamada } from './LlamadaProvider'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { Badge } from '../../components/ui'
import { useLang } from '../../i18n'

const clave = (s) => (s || '').trim().toLowerCase()
const STAFF = ['super_admin', 'admin', 'dispatcher']
const COLOR_ROL = { cliente: 'green', transportista: 'gold', chofer: 'navy', supervisor_planta: 'blue' }

export default function PerfilRapido({ autor, onClose, ctxLlamada = null }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { rol, usuario } = useBulkAuth()
  const { iniciar } = useLlamada()
  const { datos: carriers } = useColeccion('carriers')
  const esStaff = STAFF.includes(rol)
  const esChofer = autor?.rol === 'chofer'
  // Se puede llamar por la app si el autor tiene uid y no soy yo.
  const puedeLlamar = !!autor?.id && autor.id !== usuario?.id
  const llamar = (tipo) => { onClose(); iniciar(autor.id, autor.nombre, tipo, ctxLlamada) }

  // Datos del chofer desde el roster (única fuente con foto/teléfono real).
  const infoChofer = useMemo(() => {
    if (!esChofer) return null
    const k = clave(autor?.nombre)
    for (const c of carriers || []) {
      const d = (c.choferes || []).find((x) => clave(x.nombre) === k)
      if (d) return { ...d, carrierNombre: c.nombre }
    }
    return null
  }, [carriers, autor, esChofer])

  const foto = infoChofer?.foto || null
  const telefono = infoChofer?.telefono || null
  const inicial = (autor?.nombre || '?').charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {foto
            ? <img src={foto} alt={autor?.nombre} className="h-16 w-16 flex-shrink-0 rounded-2xl border border-slate-200 object-cover dark:border-slate-700" />
            : <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-2xl bg-brand-navy text-2xl font-black text-white">{inicial}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="m-0 truncate text-base font-black text-brand-navy dark:text-slate-100">{autor?.nombre || t('Usuario')}</h3>
              <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            {autor?.rol && <div className="mt-1"><Badge color={COLOR_ROL[autor.rol] || 'slate'}>{t(BULK_ROLES_LABEL[autor.rol]) || autor.rol}</Badge></div>}
            {infoChofer?.carrierNombre && <div className="mt-1 text-xs text-slate-400">{infoChofer.carrierNombre}</div>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {telefono && <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Phone size={14} className="text-amber-500" /> {telefono}</div>}

          {/* Llamada 1-a-1 dentro de la app (voz / video). */}
          {puedeLlamar && (
            <div className="flex gap-2">
              <button type="button" onClick={() => llamar('audio')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"><Phone size={15} /> {t('Llamar')}</button>
              <button type="button" onClick={() => llamar('video')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 dark:bg-slate-700"><Video size={15} /> {t('Video')}</button>
            </div>
          )}

          {esStaff && esChofer && (
            <button
              type="button"
              onClick={() => { onClose(); navigate('/bulk/chofer/' + encodeURIComponent(autor.nombre)) }}
              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 dark:bg-amber-500 dark:text-slate-900"
            >
              <ExternalLink size={14} /> {t('Ver perfil completo')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
