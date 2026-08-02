// Banner de conexión: avisa cuando el dispositivo está sin internet. Gracias a la
// persistencia offline de Firestore, la app sigue usable y las acciones se guardan
// y se sincronizan solas al reconectar; esto solo informa al usuario.
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useLang } from '../../i18n'

export default function IndicadorConexion() {
  const { t } = useLang()
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-slate-900">
      <WifiOff size={14} /> {t('Sin conexión — tus cambios se guardan y se sincronizan al reconectar.')}
    </div>
  )
}
