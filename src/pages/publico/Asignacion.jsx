// SITIO PÚBLICO · /asignacion — Asignación automática, con demo interactivo:
// el visitante elige el tipo de camión y lanza órdenes que el tablero empareja
// en vivo con el chofer compatible (datos de ejemplo, solo front-end).
import { useRef, useState } from 'react'
import { Zap, Radio, UserCheck, Truck, PlusCircle, CheckCircle2, Clock } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK } from './comun'

const CHOFERES = [
  { id: 'A', nombre: 'M. Reyes', equipo: 'Dump Truck', dist: 4 },
  { id: 'B', nombre: 'L. Ortiz', equipo: 'Mixer', dist: 6 },
  { id: 'C', nombre: 'J. Sáenz', equipo: 'End Dump', dist: 3 },
]
const EQUIPOS = ['Dump Truck', 'Mixer', 'End Dump']
const MATERIAL = { 'Dump Truck': 'Grava · 19 ton', Mixer: 'Concreto · 8 m³', 'End Dump': 'Asfalto · 24 ton' }

function DemoTablero({ tx }) {
  const [equipo, setEquipo] = useState('Dump Truck')
  const [ordenes, setOrdenes] = useState([])
  const [ocupados, setOcupados] = useState({}) // choferId -> orden numero
  const seq = useRef(150)

  const simular = () => {
    if (ordenes.filter((o) => o.fase !== 'asignada').length >= 3) return
    seq.current += 1
    const id = `JRV-0${seq.current}`
    const cand = CHOFERES.find((c) => c.equipo === equipo && !ocupados[c.id])
    const nueva = { id, equipo, fase: 'espera', chofer: cand ? cand.nombre : null, choferId: cand ? cand.id : null }
    setOrdenes((s) => [...s.slice(-4), nueva])
    setTimeout(() => setOrdenes((s) => s.map((o) => (o.id === id ? { ...o, fase: 'matching' } : o))), 500)
    setTimeout(() => {
      setOrdenes((s) => s.map((o) => (o.id === id ? { ...o, fase: cand ? 'asignada' : 'sin' } : o)))
      if (cand) {
        setOcupados((s) => ({ ...s, [cand.id]: id }))
        setTimeout(() => setOcupados((s) => { const n = { ...s }; delete n[cand.id]; return n }), 5000)
      }
    }, 2100)
  }

  return (
    <div className="rounded-[20px] border p-4 sm:p-5" style={{ background: 'linear-gradient(160deg,#16294a,#101f38)', borderColor: 'rgba(201,162,75,.2)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
      <div className="mb-3.5 flex items-center justify-between border-b pb-3.5" style={{ borderColor: 'rgba(255,255,255,.07)' }}>
        <span className="f-mono text-[12px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.55)' }}>{tx('Pruébalo tú: tablero de despacho', 'Try it: dispatch board')}</span>
        <span className="f-mono flex items-center gap-1.5 text-[11.5px]" style={{ color: GOLD }}><span className="h-[7px] w-[7px] rounded-full" style={{ background: OK, animation: 'blinkPub 1.6s infinite' }} /> {tx('EN VIVO', 'LIVE')}</span>
      </div>
      {/* Controles del visitante */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {EQUIPOS.map((e) => (
          <button key={e} onClick={() => setEquipo(e)} className="f-mono rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition"
            style={equipo === e ? { background: GOLD, color: NAVY_DEEP, borderColor: GOLD } : { color: 'rgba(248,243,235,.6)', borderColor: 'rgba(248,243,235,.2)' }}>{e}</button>
        ))}
        <button onClick={simular} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold transition active:scale-95" style={{ background: GOLD, color: NAVY_DEEP }}>
          <PlusCircle size={15} /> {tx('Simular orden', 'Simulate order')}
        </button>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="f-mono mb-2.5 flex justify-between text-[10.5px] uppercase tracking-widest" style={{ color: 'rgba(248,243,235,.4)' }}>{tx('Órdenes', 'Orders')} <b style={{ color: GOLD }}>{ordenes.length}</b></div>
          <div className="flex min-h-[220px] flex-col gap-2">
            {ordenes.length === 0 && <div className="rounded-xl border border-dashed p-4 text-center text-[12px]" style={{ borderColor: 'rgba(248,243,235,.2)', color: 'rgba(248,243,235,.45)' }}>{tx('Toca "Simular orden" y mira el emparejamiento', 'Tap "Simulate order" and watch the match')}</div>}
            {ordenes.map((o) => (
              <div key={o.id} className="rounded-xl border p-2.5 transition-all" style={{
                background: 'rgba(255,255,255,.04)',
                borderColor: o.fase === 'matching' ? GOLD : o.fase === 'asignada' ? 'rgba(63,157,107,.6)' : 'rgba(255,255,255,.08)',
                boxShadow: o.fase === 'matching' ? `0 0 0 1px ${GOLD},0 0 22px -4px rgba(201,162,75,.5)` : 'none',
              }}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="f-mono text-[12px] font-semibold" style={{ color: CREAM }}>{o.id}</span>
                  <span className="f-mono rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase" style={o.fase === 'asignada' ? { background: 'rgba(63,157,107,.16)', color: '#67c295' } : o.fase === 'sin' ? { background: 'rgba(255,99,99,.15)', color: '#f2a1a1' } : { background: 'rgba(201,162,75,.14)', color: GOLD }}>
                    {o.fase === 'espera' ? tx('EN COLA', 'QUEUED') : o.fase === 'matching' ? tx('EMPAREJANDO', 'MATCHING') : o.fase === 'asignada' ? tx('ASIGNADA', 'ASSIGNED') : tx('SIN CHOFER', 'NO DRIVER')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'rgba(248,243,235,.72)' }}><Truck size={13} style={{ color: '#8a8578' }} /> {MATERIAL[o.equipo]}</div>
                {o.fase === 'asignada' && <div className="f-mono mt-1 flex items-center gap-1 text-[11px]" style={{ color: '#67c295' }}><CheckCircle2 size={12} /> {o.chofer}</div>}
                {o.fase === 'sin' && <div className="f-mono mt-1 text-[10.5px]" style={{ color: 'rgba(248,243,235,.45)' }}>{tx('Sin chofer libre con ese equipo: queda en cola', 'No free driver with that truck: stays queued')}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="f-mono mb-2.5 flex justify-between text-[10.5px] uppercase tracking-widest" style={{ color: 'rgba(248,243,235,.4)' }}>{tx('Choferes en línea', 'Drivers online')} <b style={{ color: GOLD }}>3</b></div>
          <div className="flex flex-col gap-2">
            {CHOFERES.map((c) => {
              const busy = ocupados[c.id]
              const match = !busy && c.equipo === equipo
              return (
                <div key={c.id} className="rounded-xl border p-2.5 transition-all" style={{ background: 'rgba(255,255,255,.04)', borderColor: match ? 'rgba(201,162,75,.55)' : 'rgba(255,255,255,.08)' }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="f-mono text-[12px] font-semibold" style={{ color: CREAM }}>{c.nombre}</span>
                    <span className="f-mono rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase" style={busy ? { background: 'rgba(201,162,75,.14)', color: GOLD } : { background: 'rgba(63,157,107,.16)', color: '#67c295' }}>{busy ? tx('EN VIAJE', 'ON TRIP') : tx('EN LÍNEA', 'ONLINE')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'rgba(248,243,235,.72)' }}><Truck size={13} style={{ color: '#8a8578' }} /> {c.equipo}</div>
                  <div className="f-mono mt-1 text-[11px]" style={{ color: 'rgba(248,243,235,.45)' }}>{busy ? `${tx('Orden', 'Order')} ${busy}` : `${tx('A', '')} ${c.dist} min ${tx('de la planta', 'from plant')}`}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2 border-t pt-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,.07)', color: 'rgba(248,243,235,.6)' }}>
        <Zap size={14} style={{ color: GOLD }} /> {tx('Cambia el tipo de camión y verás que la orden busca SOLO al chofer compatible.', 'Switch the truck type — the order matches ONLY the compatible driver.')}
      </div>
    </div>
  )
}

export default function AsignacionPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/asignacion"
      hero={{
        migas: tx('Asignación automática', 'Automatic assignment'),
        icono: Zap,
        titulo: <>{tx('Cada orden encuentra a su chofer, ', 'Every order finds its driver, ')}<em className="not-italic" style={{ color: GOLD }}>{tx('sola.', 'on its own.')}</em></>,
        sub: tx('El sistema recibe la orden y la empareja al instante por tipo de camión, disponibilidad y trabajo asignado. Sin llamadas, sin mensajes, sin planillas: el chofer correcto la recibe en su teléfono con un contador de 2 minutos.', 'The system takes the order and matches it instantly by truck type, availability and assigned job. No calls, no texts, no spreadsheets: the right driver gets it on their phone with a 2-minute timer.'),
        visual: <DemoTablero tx={tx} />,
      }}
      pasos={{
        titulo: tx('Del pedido al chofer en tres pasos', 'From request to driver in three steps'),
        items: [
          { icono: Radio, t: tx('La orden entra a la cola', 'The order joins the queue'), d: tx('Desde un trabajo (job) generas órdenes con material, tonelaje y tipo de camión. Cada una entra a la cola en tiempo real.', 'From a job you generate orders with material, tonnage and truck type. Each one joins the live queue.') },
          { icono: Zap, t: tx('El motor empareja', 'The engine matches'), d: tx('Filtra choferes en línea, libres, con el equipo correcto y afiliados al trabajo. Quien rechaza no se bloquea: pasa al final del ciclo.', 'It filters drivers who are online, free, with the right truck and assigned to the job. Rejecting never blocks a driver: they go to the back of the cycle.') },
          { icono: UserCheck, t: tx('El chofer acepta y arranca', 'The driver accepts and rolls'), d: tx('Le llega la oferta con pago estimado y 2:00 para responder. Si no contesta, la orden pasa sola al siguiente.', 'They get the offer with estimated pay and 2:00 to answer. No answer? The order moves to the next driver by itself.') },
        ],
      }}
      metricas={[
        { n: '< 1 min', pct: 92, t: tx('del pedido a la oferta', 'from request to offer'), d: tx('El emparejamiento corre en segundos, 24/7.', 'Matching runs in seconds, 24/7.') },
        { n: '0', pct: 100, t: tx('llamadas para despachar', 'calls to dispatch'), d: tx('El teléfono deja de ser tu tablero de despacho.', 'Your phone stops being your dispatch board.') },
        { n: '100%', pct: 100, t: tx('de órdenes con rastro', 'orders with a trail'), d: tx('Cada oferta, rechazo y aceptación queda registrada.', 'Every offer, rejection and acceptance is on record.') },
        { n: '24/7', pct: 100, t: tx('sin dispatcher de guardia', 'no dispatcher on call'), d: tx('La cola sigue girando aunque la oficina duerma.', 'The queue keeps cycling while the office sleeps.') },
      ]}
    />
  )
}
