// BULK · Presentación CONSISTENTE del ID de usuario en toda la plataforma.
// Formato único: "ID: #10000001" (monoespaciado), con copia al portapapeles al hacer
// clic. Se usa en el mismo formato en Usuarios, tarjetas de perfil, perfiles, etc.
//
// - <UserId codigo="10000001" />        → cuando ya tienes el código a mano.
// - <UserIdDeUid uid={autor.id} />      → lo busca por uid respetando permisos (reglas).
//
// La VISIBILIDAD la imponen las reglas de Firestore: <UserIdDeUid> solo obtiene el
// código si el usuario actual puede leer ese doc (él mismo o un admin); si no, no
// renderiza nada. No inventa ni expone IDs a quien no debe verlos.
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useCodigoUsuario } from '../data/useCodigoUsuario'
import { useLang } from '../../i18n'

export function UserId({ codigo, className = '', mostrarEtiqueta = true }) {
  const { t } = useLang()
  const [copiado, setCopiado] = useState(false)
  if (!codigo) return null
  const copiar = async (e) => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(`#${codigo}`); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* noop */ }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      title={t('Copiar ID de usuario')}
      className={`group inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-slate-400 transition hover:text-brand-gold ${className}`}
    >
      {mostrarEtiqueta && <span className="font-sans">{t('ID')}:</span>}
      <span>#{codigo}</span>
      {copiado ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} className="opacity-0 transition group-hover:opacity-100" />}
    </button>
  )
}

export function UserIdDeUid({ uid, className = '', mostrarEtiqueta = true }) {
  const codigo = useCodigoUsuario(uid)
  if (!codigo) return null
  return <UserId codigo={codigo} className={className} mostrarEtiqueta={mostrarEtiqueta} />
}

export default UserId
