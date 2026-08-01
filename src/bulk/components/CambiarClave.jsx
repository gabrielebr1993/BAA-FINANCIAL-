// Cambio de contraseña self-service: el usuario pone su clave ACTUAL y la NUEVA.
// Reautentica y actualiza en Firebase Auth. No requiere backend.
import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { KeyRound, X } from 'lucide-react'
import { authBulk } from '../firebaseBulk'
import { Boton, Input, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

export default function CambiarClave({ onClose }) {
  const { t } = useLang()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [conf, setConf] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const guardar = async () => {
    setMsg(null)
    if (nueva.length < 6) { setMsg({ tipo: 'error', txt: t('La nueva contraseña debe tener al menos 6 caracteres.') }); return }
    if (nueva !== conf) { setMsg({ tipo: 'error', txt: t('Las contraseñas nuevas no coinciden.') }); return }
    const u = authBulk.currentUser
    if (!u?.email) { setMsg({ tipo: 'error', txt: t('Sesión no válida. Vuelve a entrar.') }); return }
    setOcupado(true)
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, actual))
      await updatePassword(u, nueva)
      setMsg({ tipo: 'ok', txt: t('Contraseña actualizada correctamente.') })
      setActual(''); setNueva(''); setConf('')
    } catch (e) {
      const code = e?.code || ''
      const map = {
        'auth/wrong-password': t('La contraseña actual es incorrecta.'),
        'auth/invalid-credential': t('La contraseña actual es incorrecta.'),
        'auth/too-many-requests': t('Demasiados intentos. Espera un momento e inténtalo de nuevo.'),
        'auth/weak-password': t('La nueva contraseña es muy débil (mínimo 6 caracteres).'),
      }
      setMsg({ tipo: 'error', txt: map[code] || t('No se pudo cambiar la contraseña.') })
    } finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={18} className="text-amber-500" />
          <h3 className="m-0 flex-1 text-base font-bold text-brand-navy dark:text-slate-100">{t('Cambiar contraseña')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        {msg && <Aviso tipo={msg.tipo === 'ok' ? 'ok' : 'error'} className="mb-3">{msg.txt}</Aviso>}
        <div className="space-y-2.5">
          <Input type="password" autoComplete="current-password" placeholder={t('Contraseña actual')} value={actual} onChange={(e) => setActual(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder={t('Nueva contraseña')} value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder={t('Repite la nueva contraseña')} value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variant="ghost" onClick={onClose} disabled={ocupado}>{t('Cancelar')}</Boton>
          <Boton variant="gold" onClick={guardar} disabled={ocupado || !actual || !nueva}><KeyRound size={15} /> {t('Guardar contraseña')}</Boton>
        </div>
      </div>
    </div>
  )
}
