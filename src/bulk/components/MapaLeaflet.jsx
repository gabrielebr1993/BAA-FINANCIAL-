// Mapa REAL con tiles de OpenStreetMap (Leaflet) — sin API key. Dibuja la ruta, las
// geocercas y la última posición. Se maneja Leaflet de forma imperativa para no añadir
// react-leaflet. (Para Google/Apple Maps solo hay que cambiar la capa de tiles + su key.)
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapaLeaflet({ puntos = [], geocercas = [], alto = 320 }) {
  const cont = useRef(null)
  const map = useRef(null)
  const capas = useRef([])

  useEffect(() => {
    if (!cont.current) return
    if (!map.current) {
      map.current = L.map(cont.current, { zoomControl: true }).setView([39.5, -98.35], 4)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    }
    const m = map.current
    capas.current.forEach((c) => m.removeLayer(c)); capas.current = []
    const bounds = []
    for (const g of geocercas) {
      if (g.lat == null) continue
      const c = L.circle([g.lat, g.lng], { radius: Number(g.radio) || 200, color: '#c9a24b', fillColor: '#c9a24b', fillOpacity: 0.12, weight: 1.5, dashArray: '4 3' }).addTo(m)
      c.bindTooltip(g.nombre, { permanent: false })
      capas.current.push(c); bounds.push([g.lat, g.lng])
    }
    const ll = puntos.filter((p) => p && p.lat != null).map((p) => [p.lat, p.lng])
    if (ll.length > 1) { const pl = L.polyline(ll, { color: '#13233f', weight: 4 }).addTo(m); capas.current.push(pl) }
    ll.forEach((x) => bounds.push(x))
    const last = ll[ll.length - 1]
    if (last) { const mk = L.circleMarker(last, { radius: 8, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(m); mk.bindTooltip('Posición actual'); capas.current.push(mk) }
    if (bounds.length) { try { m.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }) } catch { /* noop */ } }
    setTimeout(() => m.invalidateSize(), 50)
  }, [puntos, geocercas])

  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null } }, [])

  return <div ref={cont} style={{ height: alto }} className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
}
