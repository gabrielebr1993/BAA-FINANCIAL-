// Hook: suscribe una colección `bulk_<nombre>` del tenant actual en tiempo real.
import { useEffect, useState } from 'react'
import { suscribir } from './repo'
import { useBulkAuth } from '../BulkAuthContext'

export function useColeccion(nombre, filtros = [], opts = {}) {
  const { tenantId } = useBulkAuth()
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  // clave estable de filtros/opts para no re-suscribir en cada render
  const clave = JSON.stringify(filtros) + '|' + JSON.stringify(opts)
  useEffect(() => {
    if (!tenantId) { setDatos([]); setCargando(false); return }
    setCargando(true)
    const off = suscribir(nombre, tenantId, (d) => { setDatos(d); setCargando(false) }, filtros, opts)
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, tenantId, clave])
  return { datos, cargando }
}
