// Mapa REAL con tiles de OpenStreetMap (Leaflet) — sin API key. Dibuja la ruta, las
// geocercas y la última posición. Se maneja Leaflet de forma imperativa para no añadir
// react-leaflet. (Para Google/Apple Maps solo hay que cambiar la capa de tiles + su key.)
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Ícono de CAMIÓN (SVG blanco sobre círculo de color según el estado del chofer/orden).
const truckHtml = (color) => `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;">`
  + `<div style="width:34px;height:34px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">`
  + `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`
  + `</div></div>`

// puntos: track de UNA orden (polilínea + posición). marcadores: varios choferes a
// la vez [{lat,lng,label,color}]. geocercas: círculos de planta/destino.
export default function MapaLeaflet({ puntos = [], geocercas = [], marcadores = [], alto = 320, onPick = null, onMarcador = null }) {
  const cont = useRef(null)
  const map = useRef(null)
  const capas = useRef([])
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onMarcadorRef = useRef(onMarcador)
  onMarcadorRef.current = onMarcador

  useEffect(() => {
    if (!cont.current) return
    if (!map.current) {
      map.current = L.map(cont.current, { zoomControl: true }).setView([39.5, -98.35], 4)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
      // Clic en el mapa → devuelve la coordenada (para elegir ubicación).
      map.current.on('click', (e) => { if (onPickRef.current) onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }) })
    }
    if (onPickRef.current && cont.current) cont.current.style.cursor = 'crosshair'
    const m = map.current
    capas.current.forEach((c) => m.removeLayer(c)); capas.current = []
    // boundsFoco = SOLO choferes/ruta (para acercar el mapa a donde están los choferes).
    // boundsGeo = geocercas (se dibujan siempre, pero solo encuadran si no hay choferes).
    const boundsFoco = []; const boundsGeo = []
    // Geocercas SIEMPRE visibles (relleno + etiqueta fija con el nombre).
    for (const g of geocercas) {
      if (g.lat == null) continue
      const c = L.circle([g.lat, g.lng], { radius: Number(g.radio) || 200, color: '#c9a24b', fillColor: '#c9a24b', fillOpacity: 0.15, weight: 2 }).addTo(m)
      c.bindTooltip(g.nombre || '', { permanent: false, direction: 'center', className: 'bulk-geo-lbl' })
      capas.current.push(c); boundsGeo.push([g.lat, g.lng])
    }
    const ll = puntos.filter((p) => p && p.lat != null).map((p) => [p.lat, p.lng])
    if (ll.length > 1) { const pl = L.polyline(ll, { color: '#13233f', weight: 4 }).addTo(m); capas.current.push(pl) }
    ll.forEach((x) => boundsFoco.push(x))
    const last = ll[ll.length - 1]
    if (last) { const mk = L.circleMarker(last, { radius: 8, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(m); mk.bindTooltip('Posición actual'); capas.current.push(mk) }
    // Choferes = CAMIONES. Clic → onMarcador(id) (abre panel en React) o popup.
    for (const mk of marcadores) {
      if (mk == null || mk.lat == null) continue
      let capa
      if (mk.icon === 'truck') {
        capa = L.marker([mk.lat, mk.lng], { icon: L.divIcon({ html: truckHtml(mk.color || '#f59e0b'), className: 'bulk-truck-icon', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] }) }).addTo(m)
      } else {
        capa = L.circleMarker([mk.lat, mk.lng], { radius: 8, color: '#fff', weight: 2, fillColor: mk.color || '#f59e0b', fillOpacity: 1 }).addTo(m)
      }
      capa.bindTooltip(mk.label || '', { permanent: false, direction: 'top' })
      if (mk.id != null && onMarcadorRef.current) capa.on('click', () => onMarcadorRef.current(mk.id))
      else if (mk.popupHtml) capa.bindPopup(mk.popupHtml, { closeButton: true, minWidth: 200 })
      capas.current.push(capa); boundsFoco.push([mk.lat, mk.lng])
    }
    // Encuadre: prioriza a los CHOFERES (más cerca). Solo si no hay, usa las geocercas.
    const fit = boundsFoco.length ? boundsFoco : boundsGeo
    if (fit.length) { try { m.fitBounds(fit, { padding: [40, 40], maxZoom: 16 }) } catch { /* noop */ } }
    setTimeout(() => m.invalidateSize(), 50)
  }, [puntos, geocercas, marcadores])

  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null } }, [])

  return <div ref={cont} style={{ height: alto }} className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
}
