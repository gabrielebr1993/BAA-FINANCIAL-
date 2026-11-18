// ============================================================================
// FLOTA · MAPA EN VIVO — ubicación de las cargo vans sobre un mapa real
// (Leaflet + OpenStreetMap, sin API key). Lee las posiciones de TU servidor
// Traccar a través de la Cloud Function `flotaUbicaciones` (las claves del
// servidor viven en el backend, nunca aquí). Mientras no haya Traccar conectado
// muestra DATOS DE EJEMPLO para que la pantalla se vea igual durante el montaje.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import MapaLeaflet from '../bulk/components/MapaLeaflet'
import { Card, KPI, PageTitle, Aviso, Badge } from '../components/ui'
import { Truck, Gauge, Square, WifiOff, RefreshCw } from 'lucide-react'

const COLOR = { movimiento: '#1a7f4b', detenida: '#d64545', sin_senal: '#8795ab' }
const PILL = { movimiento: 'green', detenida: 'red', sin_senal: 'slate' }
const LBL = { movimiento: 'En movimiento', detenida: 'Detenida', sin_senal: 'Sin señal' }

// Estado derivado de velocidad + última actualización.
function estadoDe(v) {
  const minutos = (Date.now() - v.ultima) / 60000
  if (minutos > 60) return 'sin_senal'
  return (Number(v.velocidad) || 0) > 1 ? 'movimiento' : 'detenida'
}

// ── DEMO: 10 vans alrededor de Dallas/Frisco. Reemplazar por la API real. ────
function semillaFlota() {
  const base = [
    { n: 1, chofer: 'Carlos M.', donde: 'I-35 N · Dallas', lat: 32.86, lng: -96.90, vel: 45, rumbo: 20 },
    { n: 2, chofer: 'Nilo E.', donde: 'Main St · Frisco', lat: 33.15, lng: -96.82, vel: 32, rumbo: 110 },
    { n: 3, chofer: 'María G.', donde: 'Walmart DC 6080', lat: 33.09, lng: -96.67, vel: 0, rumbo: 0, min: 12 },
    { n: 4, chofer: 'Justin G.', donde: 'US-75 S', lat: 32.99, lng: -96.70, vel: 58, rumbo: 200 },
    { n: 5, chofer: 'Indira A.', donde: 'Almacén Frisco', lat: 33.12, lng: -96.80, vel: 0, rumbo: 0, min: 40 },
    { n: 6, chofer: 'José R.', donde: 'Preston Rd', lat: 32.95, lng: -96.80, vel: 28, rumbo: 300 },
    { n: 7, chofer: 'Alberth O.', donde: 'Dallas North Tollway', lat: 33.03, lng: -96.83, vel: 51, rumbo: 15 },
    { n: 8, chofer: 'Anyel T.', donde: 'Última señal', lat: 32.78, lng: -96.75, vel: 0, rumbo: 0, min: 140 },
    { n: 9, chofer: 'Janet R.', donde: 'George Bush Tpke', lat: 32.98, lng: -96.90, vel: 40, rumbo: 90 },
    { n: 10, chofer: 'Richard P.', donde: 'Lake Worth', lat: 32.80, lng: -97.02, vel: 0, rumbo: 0, min: 5 },
  ]
  return base.map((b) => ({ id: b.n, nombre: `Van ${b.n}`, chofer: b.chofer, donde: b.donde, lat: b.lat, lng: b.lng, velocidad: b.vel, rumbo: b.rumbo || 0, ultima: Date.now() - (b.min || 0) * 60000 }))
}

// Mueve un poco las vans en movimiento para que el demo se sienta "en vivo".
// (En la versión real esto lo trae la API; aquí solo simula el avance.)
function simular(vans) {
  return vans.map((v) => {
    if ((Number(v.velocidad) || 0) <= 1) return v
    const rad = (v.rumbo || 0) * Math.PI / 180
    const paso = 0.0009 * (v.velocidad / 45)
    return { ...v, lat: v.lat + Math.cos(rad) * paso, lng: v.lng + Math.sin(rad) * paso, ultima: Date.now() }
  })
}

// Pide las ubicaciones reales a la Cloud Function (que lee de tu Traccar).
// Devuelve { configurado, vans }. configurado=false → aún no hay Traccar
// conectado y la pantalla sigue con el demo.
async function obtenerUbicacionesReales() {
  const fn = httpsCallable(getFunctions(), 'flotaUbicaciones', { timeout: 25000 })
  const r = await fn({})
  const d = r?.data || {}
  return { configurado: d.configurado !== false, vans: Array.isArray(d.vans) ? d.vans : [] }
}

function haceCuanto(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `hace ${s} seg`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  return `hace ${Math.round(m / 60)} h`
}

export default function Flota() {
  const [vans, setVans] = useState(semillaFlota())
  const [sel, setSel] = useState(null)
  const [modo, setModo] = useState('demo') // 'demo' = datos de ejemplo · 'vivo' = tu Traccar
  const modoRef = useRef(modo); modoRef.current = modo
  const ultimoIntento = useRef(0)

  // Pide al servidor real; si aún no hay Traccar conectado, sigue en DEMO y
  // reintenta la conexión cada 30 s (así se pone en vivo solo al conectarlo).
  // En vivo refresca cada 15 s (ahorra llamadas); el demo "avanza" cada 3 s.
  useEffect(() => {
    let vivo = true
    let timer
    const programar = (ms) => { if (vivo) timer = setTimeout(tick, ms) }
    const tick = async () => {
      const ahora = Date.now()
      const intentarApi = modoRef.current === 'vivo' || ahora - ultimoIntento.current > 30000
      if (intentarApi) {
        ultimoIntento.current = ahora
        try {
          const { configurado, vans: reales } = await obtenerUbicacionesReales()
          if (!vivo) return
          if (configurado) { setVans(reales); setModo('vivo'); return programar(15000) }
        } catch { if (!vivo) return /* servidor caído o sin montar → demo */ }
      }
      if (!vivo) return
      setModo('demo')
      setVans((p) => simular(p.length ? p : semillaFlota()))
      programar(3000)
    }
    tick()
    return () => { vivo = false; clearTimeout(timer) }
  }, [])

  const conEstado = useMemo(() => vans.map((v) => ({ ...v, estado: estadoDe(v) })), [vans])
  const tot = useMemo(() => ({
    movimiento: conEstado.filter((v) => v.estado === 'movimiento').length,
    detenida: conEstado.filter((v) => v.estado === 'detenida').length,
    sin_senal: conEstado.filter((v) => v.estado === 'sin_senal').length,
  }), [conEstado])

  const marcadores = conEstado.map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, label: `${v.nombre} · ${v.chofer}${v.velocidad > 1 ? ` · ${v.velocidad} mph` : ''}`, color: COLOR[v.estado], icon: 'truck' }))
  const centro = sel ? (() => { const v = conEstado.find((x) => x.id === sel); return v ? { lat: v.lat, lng: v.lng, zoom: 14 } : null })() : null

  return (
    <div>
      <PageTitle right={modo === 'vivo'
        ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span> EN VIVO</span>
        : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">DEMO</span>}>
        Flota · Mapa en vivo
      </PageTitle>

      {modo === 'demo' && (
        <Aviso tipo="warn" className="mb-4">
          <b>Datos de ejemplo.</b> Conecta tu servidor <b>Traccar</b> y verás la ubicación real de tus vans aquí. La pantalla ya está lista — se pone en vivo sola en cuanto el servidor esté conectado.
        </Aviso>
      )}
      {modo === 'vivo' && vans.length === 0 && (
        <Aviso tipo="info" className="mb-4">
          <b>Conectado a tu Traccar.</b> Todavía no hay vans reportando ubicación. Enciende un rastreador en una van y aparecerá aquí automáticamente.
        </Aviso>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="En movimiento" value={String(tot.movimiento)} icon={Gauge} accent="green" />
        <KPI label="Detenidas" value={String(tot.detenida)} icon={Square} accent="red" />
        <KPI label="Sin señal" value={String(tot.sin_senal)} icon={WifiOff} accent="slate" />
        <KPI label="Total vans" value={String(conEstado.length)} icon={Truck} accent="navy" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="!p-0 overflow-hidden">
          <MapaLeaflet marcadores={marcadores} centro={centro} alto={480} onMarcador={(id) => setSel(id)} />
        </Card>

        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-brand-navy dark:border-slate-800 dark:text-slate-100">
            <Truck size={16} className="text-brand-gold" /> Vans
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><RefreshCw size={12} /> actualiza cada {modo === 'vivo' ? '15' : '3'} s</span>
          </div>
          <div className="max-h-[430px] overflow-y-auto">
            {conEstado.map((v) => (
              <button key={v.id} onClick={() => setSel(v.id)} className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${sel === v.id ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold text-white" style={{ background: COLOR[v.estado] }}>{v.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-brand-navy dark:text-slate-100">{v.nombre} · {v.chofer}</span>
                  <span className="block truncate text-[11px] text-slate-400">{v.donde} · {haceCuanto(v.ultima)}</span>
                </span>
                <Badge color={PILL[v.estado]}>{v.estado === 'movimiento' ? `▶ ${v.velocidad} mph` : v.estado === 'detenida' ? '■ detenida' : 'sin señal'}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">Leyenda: <b className="text-emerald-600">● en movimiento</b> · <b className="text-rose-500">● detenida</b> · <b className="text-slate-400">● sin señal</b>. El mapa usa OpenStreetMap (sin costo). {LBL.movimiento}.</p>
    </div>
  )
}
