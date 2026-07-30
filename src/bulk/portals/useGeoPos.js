// Hook: posición GPS en vivo del dispositivo mientras `activo` sea true.
// Se usa para habilitar el botón "Llegué" solo cuando el chofer entra en la geocerca.
import { useEffect, useState } from 'react'

export function useGeoPos(activo) {
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (!activo || typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [activo])
  return pos
}
