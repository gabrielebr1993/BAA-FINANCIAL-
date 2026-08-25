// Botón "Reunión" para los portales (supervisor / transportista / cliente).
// Crea una videollamada vía bulkMeetingOp (el backend valida el rol), copia el
// link público /meet/<codigo> y lo abre en una pestaña nueva. El alcance social
// es el del CHAT: cada quien comparte el link solo con quien puede hablar.
import { useState } from 'react'
import { Video } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { Boton, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

export default function BotonReunion({ className = 'px-3 py-1.5 text-sm' }) {
  const { t } = useLang()
  const [ocupado, setOcupado] = useState(false)

  const crear = async () => {
    setOcupado(true)
    try {
      const fn = httpsCallable(funcsBulk, 'bulkMeetingOp', { timeout: 30000 })
      const r = await fn({ op: 'crear', titulo: '', tipo: 'video', programadaPara: null })
      const codigo = r?.data?.codigo
      if (!codigo) throw new Error(t('El servidor no devolvió el código de la sala.'))
      const link = `${window.location.origin}/meet/${codigo}`
      try { await navigator.clipboard.writeText(link) } catch { /* sin permiso de portapapeles */ }
      window.open(link, '_blank', 'noopener')
      window.alert(t('Reunión creada y abierta. El link quedó copiado: pégalo en el chat para invitar (solo a quien puedes hablarle).'))
    } catch (e) {
      window.alert(t('No se pudo crear la reunión: ') + (e?.message || ''))
    } finally { setOcupado(false) }
  }

  return (
    <Boton variant="ghost" onClick={crear} disabled={ocupado} className={className}>
      {ocupado ? <Spinner /> : <Video size={15} />} {t('Reunión')}
    </Boton>
  )
}
