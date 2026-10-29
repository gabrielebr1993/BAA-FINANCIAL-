// Etiqueta pequeña con el Delivery ID de Gofo de un chofer, para mostrarla JUNTO AL
// NOMBRE en cualquier página. Lee el mapa nombre->idGofo del contexto (perfil +
// facturas). Si se le pasa `id` directo, lo usa tal cual. Si no hay ID, no pinta nada.
import { useData } from '../DataContext'

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()

export default function IdGofoBadge({ nombre, id, className = '' }) {
  const { idGofoPorNombre } = useData()
  const valor = String(id || idGofoPorNombre?.[norm(nombre)] || '').trim()
  if (!valor) return null
  return (
    <span
      className={`ml-1.5 inline-flex items-center rounded-full bg-brand-navy/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brand-navy dark:bg-brand-gold/15 dark:text-brand-gold ${className}`}
      title={`Delivery ID de Gofo: ${valor}`}
    >
      ID {valor}
    </span>
  )
}
