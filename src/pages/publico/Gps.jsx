// SITIO PÚBLICO · /gps — Seguimiento GPS / mapa en vivo. Demo interactivo: el
// visitante arrastra un slider de tiempo y el camión recorre la ruta, entrando
// y saliendo de geocercas con sus avisos (datos de ejemplo, solo front-end).
import { useMemo, useState } from 'react'
import { MapPin, Navigation, Route as RouteIcon, BellRing, Truck, Factory, Flag } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK } from './comun'

// Ruta de ejemplo (coordenadas del lienzo SVG 400×300).
const PUNTOS = [[60, 70], [120, 78], [170, 110], [210, 150], [235, 195], [290, 225], [340, 232]]
const largoTramo = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])

function posEn(pct) {
  const total = PUNTOS.slice(1).reduce((s, p, i) => s + largoTramo(PUNTOS[i], p), 0)
  let resto = (pct / 100) * total
  for (let i = 1; i < PUNTOS.length; i++) {
    const L = largoTramo(PUNTOS[i - 1], PUNTOS[i])
    if (resto <= L) { const f = L ? resto / L : 0; return [PUNTOS[i - 1][0] + (PUNTOS[i][0] - PUNTOS[i - 1][0]) * f, PUNTOS[i - 1][1] + (PUNTOS[i][1] - PUNTOS[i - 1][1]) * f] }
    resto -= L
  }
  return PUNTOS[PUNTOS.length - 1]
}

function DemoMapa({ tx }) {
  const [t, setT] = useState(8)
  const [x, y] = useMemo(() => posEn(t), [t])
  const fase = t < 12 ? 'planta' : t < 20 ? 'salio' : t < 88 ? 'ruta' : t < 100 ? 'obra' : 'fin'
  const eventos = [
    { en: 0, icon: Factory, txt: tx('Entró a geocerca PLANTA NORTE', 'Entered PLANT NORTH geofence'), color: GOLD },
    { en: 14, icon: BellRing, txt: tx('Salió de planta · cargado 24.75 tn', 'Left plant · loaded 24.75 t'), color: '#67c295' },
    { en: 55, icon: Navigation, txt: tx('En ruta · 42 mph · ETA 12 min', 'En route · 42 mph · ETA 12 min'), color: '#7fb2ff' },
    { en: 90, icon: Flag, txt: tx('Entró a geocerca OBRA 41 · entregando', 'Entered SITE 41 geofence · delivering'), color: GOLD },
  ].filter((e) => t >= e.en)
  const ruta = PUNTOS.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  return (
    <div className="rounded-[20px] border p-4 sm:p-5" style={{ background: NAVY_DEEP, borderColor: 'rgba(201,162,75,.2)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="f-mono text-[12px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.55)' }}>{tx('Pruébalo tú: mueve el tiempo', 'Try it: drag the time slider')}</span>
        <span className="f-mono flex items-center gap-1.5 text-[11.5px]" style={{ color: GOLD }}><span className="h-[7px] w-[7px] rounded-full" style={{ background: OK, animation: 'blinkPub 1.6s infinite' }} /> GPS</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <svg viewBox="0 0 400 300" className="block w-full" style={{ background: '#101f38' }}>
          <defs><pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 0H0V38" fill="none" stroke="rgba(255,255,255,.05)" /></pattern></defs>
          <rect width="400" height="300" fill="url(#grid)" />
          <path d={ruta} fill="none" stroke="rgba(201,162,75,.28)" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
          <path d={ruta} fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${t} 100`} />
          {/* Geocercas: planta (origen) y obra (destino) */}
          <circle cx="60" cy="70" r="34" fill="rgba(201,162,75,.08)" stroke="rgba(201,162,75,.55)" strokeWidth="1.5" strokeDasharray="5 4" />
          <circle cx="340" cy="232" r="30" fill="rgba(63,157,107,.08)" stroke="rgba(63,157,107,.6)" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x="60" y="26" textAnchor="middle" fontSize="10" fontFamily="'JetBrains Mono',monospace" fill={GOLD}>PLANTA NORTE</text>
          <text x="340" y="288" textAnchor="middle" fontSize="10" fontFamily="'JetBrains Mono',monospace" fill="#67c295">OBRA 41</text>
          {/* Camión */}
          <g transform={`translate(${x - 11},${y - 11})`}>
            <rect width="22" height="22" rx="6" fill={GOLD} />
            <path d="M5 13h6V6H3v7h1m10 0h2v-2.4a2.6 2.6 0 0 0-.8-1.9L14 7h-3v6h1" fill="none" stroke={NAVY_DEEP} strokeWidth="1.4" transform="translate(2,2)" />
          </g>
        </svg>
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ background: 'rgba(13,26,48,.9)', borderColor: 'rgba(255,255,255,.1)' }}>
          <span className="h-2 w-2 rounded-full" style={{ background: OK, animation: 'blinkPub 1.6s infinite' }} />
          <span className="f-mono text-[11.5px]" style={{ color: CREAM }}>
            {fase === 'planta' ? tx('En planta · cargando', 'At plant · loading') : fase === 'salio' ? tx('Saliendo de planta', 'Leaving plant') : fase === 'ruta' ? tx('En ruta a OBRA 41', 'En route to SITE 41') : tx('En destino · entregando', 'At site · delivering')}
          </span>
        </div>
      </div>
      <input type="range" min="0" max="100" value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="tiempo"
        className="mt-4 w-full accent-[#c9a24b]" />
      <div className="f-mono mt-1 flex justify-between text-[10.5px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.4)' }}>
        <span>7:00 AM · {tx('carga', 'load')}</span><span>{tx('ruta', 'route')}</span><span>7:38 AM · {tx('entrega', 'delivery')}</span>
      </div>
      <div className="mt-3 flex min-h-[92px] flex-col gap-1.5">
        {eventos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: 'rgba(255,255,255,.04)', color: 'rgba(248,243,235,.75)' }}>
            <e.icon size={13} style={{ color: e.color }} /> {e.txt}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GpsPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/gps"
      hero={{
        migas: tx('Seguimiento GPS', 'GPS tracking'),
        icono: MapPin,
        titulo: <>{tx('Cada camión en el mapa, ', 'Every truck on the map, ')}<em className="not-italic" style={{ color: GOLD }}>{tx('en vivo.', 'live.')}</em></>,
        sub: tx('Mapa en tiempo real con geocercas en plantas y obras: sabes cuándo cada camión entró a cargar, salió, va en ruta (con ETA) y llegó a entregar — sin llamar a nadie. El cliente también puede ver sus viajes.', 'A real-time map with geofences on plants and job sites: you know when each truck entered to load, left, is en route (with ETA) and arrived to deliver — without calling anyone. Your customer can watch their trips too.'),
        visual: <DemoMapa tx={tx} />,
      }}
      pasos={{
        titulo: tx('Del GPS del teléfono a tu pantalla', "From the phone's GPS to your screen"),
        items: [
          { icono: Navigation, t: tx('El teléfono del chofer transmite', "The driver's phone transmits"), d: tx('Sin hardware extra: la app envía la posición durante el viaje, con la batería cuidada.', 'No extra hardware: the app streams position during the trip, easy on the battery.') },
          { icono: MapPin, t: tx('Las geocercas avisan solas', 'Geofences alert on their own'), d: tx('Dibujas un círculo en cada planta, patio y obra. Entradas y salidas generan avisos y sellos de hora automáticos.', 'Draw a circle on each plant, yard and site. Entries and exits create automatic alerts and timestamps.') },
          { icono: RouteIcon, t: tx('Tú ves todo junto', 'You see it all together'), d: tx('Mapa en vivo con cada camión, su orden, su ETA y su recorrido completo. Al entregar, el viaje pasa al historial.', 'A live map with every truck, its order, its ETA and its full route. On delivery the trip moves to history.') },
        ],
      }}
      metricas={[
        { n: '0', pct: 100, t: tx('llamadas de "¿dónde vas?"', '"where are you?" calls'), d: tx('La respuesta ya está en el mapa.', 'The answer is already on the map.') },
        { n: 'ETA', pct: 88, t: tx('en cada viaje activo', 'on every active trip'), d: tx('Para ti, tu supervisor y tu cliente.', 'For you, your supervisor and your customer.') },
        { n: '100%', pct: 100, t: tx('de entradas/salidas selladas', 'entries/exits stamped'), d: tx('Cada geocerca deja constancia con hora.', 'Every geofence leaves a timestamped record.') },
        { n: '$0', pct: 100, t: tx('en hardware GPS', 'in GPS hardware'), d: tx('El teléfono del chofer es el rastreador.', "The driver's phone is the tracker.") },
      ]}
    />
  )
}
