// Mapa REAL con tiles de OpenStreetMap (Leaflet) — sin API key. Dibuja la ruta, las
// geocercas y la última posición. Se maneja Leaflet de forma imperativa para no añadir
// react-leaflet. (Para Google/Apple Maps solo hay que cambiar la capa de tiles + su key.)
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Coordenada válida SOLO si lat/lng son números finitos (evita el crash de Leaflet
// "Invalid LatLng object: (NaN, NaN)" con datos vacíos, strings o NaN). Devuelve
// [lat, lng] numérico o null.
const coord = (lat, lng) => {
  const a = Number(lat), b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null
}

// Ícono de CAMIÓN (SVG blanco sobre círculo de color según el estado del chofer/orden).
const truckHtml = (color) => `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;">`
  + `<div style="width:34px;height:34px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">`
  + `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`
  + `</div></div>`

// puntos: track de UNA orden (polilínea + posición). marcadores: varios choferes a
// la vez [{lat,lng,label,color}]. geocercas: círculos de planta/destino.
export default function MapaLeaflet({ puntos = [], geocercas = [], marcadores = [], alto = 320, onPick = null, onMarcador = null, editable = null, onEditable = null, centro = null }) {
  const cont = useRef(null)
  const map = useRef(null)
  const capas = useRef([])
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onMarcadorRef = useRef(onMarcador)
  onMarcadorRef.current = onMarcador
  const onEditableRef = useRef(onEditable)
  onEditableRef.current = onEditable
  const centroAplicado = useRef(null)

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
    // Geocercas SIEMPRE visibles (relleno + etiqueta fija con el nombre). La que se
    // está EDITando se omite aquí (se dibuja aparte, resaltada y con centro arrastrable).
    for (const g of geocercas) {
      if (editable && g.id && g.id === editable.id) continue
      const xy = coord(g.lat, g.lng)
      if (!xy) continue
      // Estilo por TIPO de zona: planta = dorado sólido, destino = azul,
      // proyecto = verde, patio = gris punteado (solo informativo).
      const ESTILO = {
        planta: { color: '#c9a24b', fillOpacity: 0.15, weight: 2 },
        destino: { color: '#2563eb', fillOpacity: 0.14, weight: 2, dashArray: '10 6' },
        proyecto: { color: '#10b981', fillOpacity: 0.14, weight: 3 },
        patio: { color: '#64748b', fillOpacity: 0.08, weight: 2, dashArray: '3 5' },
      }
      const st = ESTILO[g.tipo] || { color: g.color || '#c9a24b', fillOpacity: 0.15, weight: 2 }
      const c = L.circle(xy, { radius: Number(g.radio) || 200, ...st, fillColor: st.color }).addTo(m)
      const TIPO_LBL = { planta: 'Planta', destino: 'Entrega', proyecto: 'Proyecto', patio: 'Patio' }
      c.bindTooltip(`${g.nombre || ''}${TIPO_LBL[g.tipo] ? ` · ${TIPO_LBL[g.tipo]}` : ''}`, { permanent: false, direction: 'center', className: 'bulk-geo-lbl' })
      capas.current.push(c); boundsGeo.push(xy)
    }
    // Geocerca en EDICIÓN: círculo resaltado (área actual visible) + centro arrastrable.
    if (editable) {
      const xy = coord(editable.lat, editable.lng)
      if (xy) {
        const col = editable.color || '#2563eb'
        const c = L.circle(xy, { radius: Number(editable.radio) || 200, color: col, fillColor: col, fillOpacity: 0.22, weight: 3, dashArray: '6 5' }).addTo(m)
        capas.current.push(c); boundsGeo.push(xy)
        // Marcador central arrastrable → al soltar, informa la nueva ubicación.
        const mk = L.marker(xy, { draggable: true, title: editable.nombre || '' }).addTo(m)
        mk.on('dragend', () => { const ll = mk.getLatLng(); if (onEditableRef.current) onEditableRef.current({ lat: ll.lat, lng: ll.lng }) })
        mk.bindTooltip(editable.nombre || '', { permanent: false, direction: 'top' })
        capas.current.push(mk)
      }
    }
    const ll = puntos.map((p) => p && coord(p.lat, p.lng)).filter(Boolean)
    if (ll.length > 1) { const pl = L.polyline(ll, { color: '#13233f', weight: 4 }).addTo(m); capas.current.push(pl) }
    ll.forEach((x) => boundsFoco.push(x))
    const last = ll[ll.length - 1]
    if (last) { const mk = L.circleMarker(last, { radius: 8, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(m); mk.bindTooltip('Posición actual'); capas.current.push(mk) }
    // Choferes = CAMIONES. Clic → onMarcador(id) (abre panel en React) o popup.
    for (const mk of marcadores) {
      if (mk == null) continue
      const xy = coord(mk.lat, mk.lng)
      if (!xy) continue
      let capa
      if (mk.icon === 'truck') {
        capa = L.marker(xy, { icon: L.divIcon({ html: truckHtml(mk.color || '#f59e0b'), className: 'bulk-truck-icon', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] }) }).addTo(m)
      } else {
        capa = L.circleMarker(xy, { radius: 8, color: '#fff', weight: 2, fillColor: mk.color || '#f59e0b', fillOpacity: 1 }).addTo(m)
      }
      capa.bindTooltip(mk.label || '', { permanent: false, direction: 'top' })
      if (mk.id != null && onMarcadorRef.current) capa.on('click', () => onMarcadorRef.current(mk.id))
      else if (mk.popupHtml) capa.bindPopup(mk.popupHtml, { closeButton: true, minWidth: 200 })
      capas.current.push(capa); boundsFoco.push(xy)
    }
    // Si se pide CENTRAR en un punto (p. ej. al saltar desde un aviso de geocerca), se
    // centra ahí y se resalta; si no, encuadre normal (choferes o, si no hay, geocercas).
    const c = centro && coord(centro.lat, centro.lng)
    if (c) {
      // Centra SOLO cuando el objetivo cambia (no en cada redibujo) → el usuario puede
      // moverse libremente por el mapa sin que se vuelva a centrar.
      const key = c.join(',')
      if (centroAplicado.current !== key) { try { m.setView(c, centro.zoom || 15) } catch { /* noop */ } centroAplicado.current = key }
      const pulso = L.circleMarker(c, { radius: 12, color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.25 }).addTo(m)
      capas.current.push(pulso)
    } else {
      centroAplicado.current = null
      const fit = boundsFoco.length ? boundsFoco : boundsGeo
      if (fit.length) { try { m.fitBounds(fit, { padding: [40, 40], maxZoom: 16 }) } catch { /* noop */ } }
    }
    setTimeout(() => m.invalidateSize(), 50)
  }, [puntos, geocercas, marcadores, editable, centro])

  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null } }, [])

  return <div ref={cont} style={{ height: alto }} className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
}
