// Mapa REAL con tiles de OpenStreetMap (Leaflet) — sin API key. Dibuja la ruta, las
// geocercas y la última posición. Se maneja Leaflet de forma imperativa para no añadir
// react-leaflet. (Para Google/Apple Maps solo hay que cambiar la capa de tiles + su key.)
//
// ACTUALIZACIÓN SIN DESTELLO: las capas NO se borran y redibujan en cada tick de
// GPS. Los camiones existentes se MUEVEN (setLatLng), solo se agregan/quitan los
// que aparecen/desaparecen, y el encuadre (fitBounds) corre únicamente cuando
// cambia QUIÉN está en el mapa — no en cada posición nueva.
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

// Estilo del círculo por TIPO de zona: planta = dorado sólido, destino = azul con
// guiones, proyecto = verde grueso, patio = gris punteado (solo informativo).
const ESTILO_GEO = {
  planta: { color: '#c9a24b', fillOpacity: 0.15, weight: 2 },
  destino: { color: '#2563eb', fillOpacity: 0.14, weight: 2, dashArray: '10 6' },
  proyecto: { color: '#10b981', fillOpacity: 0.14, weight: 3 },
  patio: { color: '#64748b', fillOpacity: 0.08, weight: 2, dashArray: '3 5' },
}
const TIPO_LBL = { planta: 'Planta', destino: 'Entrega', proyecto: 'Proyecto', patio: 'Patio' }

// puntos: track de UNA orden (polilínea + posición). marcadores: varios choferes a
// la vez [{lat,lng,label,color}]. geocercas: círculos de planta/destino.
export default function MapaLeaflet({ puntos = [], geocercas = [], marcadores = [], alto = 320, onPick = null, onMarcador = null, editable = null, onEditable = null, centro = null }) {
  const cont = useRef(null)
  const map = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onMarcadorRef = useRef(onMarcador)
  onMarcadorRef.current = onMarcador
  const onEditableRef = useRef(onEditable)
  onEditableRef.current = onEditable
  const centroAplicado = useRef(null)

  // Registros de capas vivas (para actualizar en sitio, sin parpadeo).
  const geoCapas = useRef(new Map())      // clave geocerca → L.circle
  const editCapas = useRef([])            // círculo + pin de la geocerca en edición
  const marcaCapas = useRef(new Map())    // id marcador → { capa, esTruck, color }
  const trackLinea = useRef(null)         // polilínea de la ruta
  const trackPunto = useRef(null)         // punto "posición actual"
  const pulsoCapa = useRef(null)          // resalte del centro pedido
  const fitKey = useRef('')               // firma de QUIÉNES están (para encuadrar solo al cambiar)

  const asegurarMapa = () => {
    if (!map.current && cont.current) {
      map.current = L.map(cont.current, { zoomControl: true }).setView([39.5, -98.35], 4)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
      map.current.on('click', (e) => { if (onPickRef.current) onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }) })
    }
    return map.current
  }

  // ── Geocercas (cambian rara vez): se reconstruyen solo cuando cambian ellas ──
  useEffect(() => {
    const m = asegurarMapa()
    if (!m) return
    if (onPickRef.current && cont.current) cont.current.style.cursor = 'crosshair'
    for (const c of geoCapas.current.values()) m.removeLayer(c)
    geoCapas.current.clear()
    editCapas.current.forEach((c) => m.removeLayer(c)); editCapas.current = []
    for (const g of geocercas) {
      if (editable && g.id && g.id === editable.id) continue
      const xy = coord(g.lat, g.lng)
      if (!xy) continue
      const st = ESTILO_GEO[g.tipo] || { color: g.color || '#c9a24b', fillOpacity: 0.15, weight: 2 }
      const c = L.circle(xy, { radius: Number(g.radio) || 200, ...st, fillColor: st.color }).addTo(m)
      c.bindTooltip(`${g.nombre || ''}${TIPO_LBL[g.tipo] ? ` · ${TIPO_LBL[g.tipo]}` : ''}`, { permanent: false, direction: 'center', className: 'bulk-geo-lbl' })
      geoCapas.current.set(g.id || `${g.lat},${g.lng}`, c)
    }
    // Geocerca en EDICIÓN: círculo resaltado + centro arrastrable.
    if (editable) {
      const xy = coord(editable.lat, editable.lng)
      if (xy) {
        const col = editable.color || '#2563eb'
        const c = L.circle(xy, { radius: Number(editable.radio) || 200, color: col, fillColor: col, fillOpacity: 0.22, weight: 3, dashArray: '6 5' }).addTo(m)
        const mk = L.marker(xy, { draggable: true, title: editable.nombre || '' }).addTo(m)
        mk.on('dragend', () => { const ll = mk.getLatLng(); if (onEditableRef.current) onEditableRef.current({ lat: ll.lat, lng: ll.lng }) })
        mk.bindTooltip(editable.nombre || '', { permanent: false, direction: 'top' })
        editCapas.current = [c, mk]
      }
    }
    setTimeout(() => m.invalidateSize(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocercas, editable])

  // ── Ruta + camiones: ACTUALIZACIÓN EN SITIO en cada tick de GPS ─────────────
  useEffect(() => {
    const m = asegurarMapa()
    if (!m) return

    // Polilínea del recorrido: se mueve, no se recrea.
    const ll = puntos.map((p) => p && coord(p.lat, p.lng)).filter(Boolean)
    if (ll.length > 1) {
      if (trackLinea.current) trackLinea.current.setLatLngs(ll)
      else trackLinea.current = L.polyline(ll, { color: '#13233f', weight: 4 }).addTo(m)
    } else if (trackLinea.current) { m.removeLayer(trackLinea.current); trackLinea.current = null }
    const last = ll[ll.length - 1]
    if (last) {
      if (trackPunto.current) trackPunto.current.setLatLng(last)
      else { trackPunto.current = L.circleMarker(last, { radius: 8, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(m); trackPunto.current.bindTooltip('Posición actual') }
    } else if (trackPunto.current) { m.removeLayer(trackPunto.current); trackPunto.current = null }

    // Camiones: mover los existentes, agregar los nuevos, quitar los que ya no están.
    const vivos = new Set()
    for (const mk of marcadores) {
      if (mk == null) continue
      const xy = coord(mk.lat, mk.lng)
      if (!xy) continue
      const id = mk.id != null ? String(mk.id) : `${mk.label || ''}`
      vivos.add(id)
      const prev = marcaCapas.current.get(id)
      const esTruck = mk.icon === 'truck'
      if (prev && prev.esTruck === esTruck) {
        prev.capa.setLatLng(xy)
        if (esTruck && prev.color !== (mk.color || '#f59e0b')) {
          prev.capa.setIcon(L.divIcon({ html: truckHtml(mk.color || '#f59e0b'), className: 'bulk-truck-icon', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] }))
          prev.color = mk.color || '#f59e0b'
        } else if (!esTruck && prev.color !== (mk.color || '#f59e0b')) {
          prev.capa.setStyle({ fillColor: mk.color || '#f59e0b' })
          prev.color = mk.color || '#f59e0b'
        }
        prev.capa.setTooltipContent(mk.label || '')
        continue
      }
      if (prev) { m.removeLayer(prev.capa); marcaCapas.current.delete(id) }
      let capa
      if (esTruck) {
        capa = L.marker(xy, { icon: L.divIcon({ html: truckHtml(mk.color || '#f59e0b'), className: 'bulk-truck-icon', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] }) }).addTo(m)
      } else {
        capa = L.circleMarker(xy, { radius: 8, color: '#fff', weight: 2, fillColor: mk.color || '#f59e0b', fillOpacity: 1 }).addTo(m)
      }
      capa.bindTooltip(mk.label || '', { permanent: false, direction: 'top' })
      if (mk.id != null && onMarcadorRef.current) capa.on('click', () => onMarcadorRef.current(mk.id))
      else if (mk.popupHtml) capa.bindPopup(mk.popupHtml, { closeButton: true, minWidth: 200 })
      marcaCapas.current.set(id, { capa, esTruck, color: mk.color || '#f59e0b' })
    }
    for (const [id, reg] of marcaCapas.current) {
      if (!vivos.has(id)) { m.removeLayer(reg.capa); marcaCapas.current.delete(id) }
    }

    // Centro pedido (saltar a una geocerca desde un aviso) o encuadre inicial.
    const c = centro && coord(centro.lat, centro.lng)
    if (c) {
      const key = c.join(',')
      if (centroAplicado.current !== key) { try { m.setView(c, centro.zoom || 15) } catch { /* noop */ } centroAplicado.current = key }
      if (pulsoCapa.current) pulsoCapa.current.setLatLng(c)
      else pulsoCapa.current = L.circleMarker(c, { radius: 12, color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.25 }).addTo(m)
    } else {
      centroAplicado.current = null
      if (pulsoCapa.current) { m.removeLayer(pulsoCapa.current); pulsoCapa.current = null }
      // Encuadre SOLO cuando cambia el conjunto (quiénes están), no cada posición:
      // así el usuario puede hacer zoom/moverse sin que el mapa brinque a cada rato.
      const foco = [...vivos].sort().join('|') + (ll.length ? `·ruta${puntos.length > 1 ? 'si' : 'no'}` : '')
      const clave = foco || `geo:${geocercas.length}`
      if (fitKey.current !== clave) {
        fitKey.current = clave
        const boundsFoco = []
        ll.forEach((x) => boundsFoco.push(x))
        for (const reg of marcaCapas.current.values()) { const p = reg.capa.getLatLng(); boundsFoco.push([p.lat, p.lng]) }
        const boundsGeo = geocercas.map((g) => coord(g.lat, g.lng)).filter(Boolean)
        const fit = boundsFoco.length ? boundsFoco : boundsGeo
        if (fit.length) { try { m.fitBounds(fit, { padding: [40, 40], maxZoom: 16 }) } catch { /* noop */ } }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, marcadores, centro, geocercas])

  useEffect(() => () => {
    if (map.current) { map.current.remove(); map.current = null }
    geoCapas.current.clear(); marcaCapas.current.clear(); editCapas.current = []
    trackLinea.current = null; trackPunto.current = null; pulsoCapa.current = null; fitKey.current = ''
  }, [])

  return <div ref={cont} style={{ height: alto }} className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
}
