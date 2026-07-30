import { useState } from 'react'
import { useBulkAuth } from '../BulkAuthContext'
import { Boton, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

// Botón "Reparar mi acceso": re-aplica los custom claims del usuario (bulkCarrierId,
// bulkClienteId, bulkRole…) desde su perfil y recarga para tomar el token nuevo.
// Sirve cuando el token quedó viejo (se asignó/ cambió el vínculo tras el último login).
export default function RepararAcceso({ variant = 'gold', className = '' }) {
  const { t } = useLang()
  const { repararPermisos } = useBulkAuth()
  const [reparando, setReparando] = useState(false)
  const reparar = async () => {
    setReparando(true)
    try { await repararPermisos() } catch { /* noop */ }
    window.location.reload()
  }
  return (
    <Boton variant={variant} onClick={reparar} disabled={reparando} className={className || 'px-3 py-1 text-xs'}>
      {reparando ? <><Spinner /> {t('Reparando…')}</> : t('Reparar mi acceso')}
    </Boton>
  )
}
