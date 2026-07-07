// Banner "Instala MilePay en tu teléfono" (solo móvil). Usa beforeinstallprompt
// en Android/Chrome; en iOS muestra instrucciones. Descartable (en memoria).
import { useState, useEffect } from 'react'
import { Share, X } from 'lucide-react'

export default function InstallBanner() {
  const [deferred, setDeferred] = useState(null)
  const [visible, setVisible] = useState(false)
  const [esIOS, setEsIOS] = useState(false)

  useEffect(() => {
    // ya instalada (standalone) → no mostrar
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
    if (standalone) return

    const ua = window.navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua)
    setEsIOS(ios)

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS no dispara beforeinstallprompt: mostramos instrucciones
    if (ios) setVisible(true)

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!visible) return null

  const instalar = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
    setVisible(false)
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800 md:hidden">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-gold font-extrabold text-brand-navy">M</div>
      <div className="flex-1 text-sm">
        <div className="font-bold text-brand-navy dark:text-slate-100">Instala MilePay en tu teléfono</div>
        {esIOS ? (
          <div className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">Toca Compartir <Share size={13} strokeWidth={1.8} /> y luego “Añadir a pantalla de inicio”.</div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400">Accede rápido y úsala como una app.</div>
        )}
      </div>
      {!esIOS && deferred && (
        <button onClick={instalar} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">Instalar</button>
      )}
      <button onClick={() => setVisible(false)} className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar"><X size={16} strokeWidth={2} /></button>
    </div>
  )
}
