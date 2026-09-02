// SITIO PÚBLICO · /sistema — El sistema completo. Demo interactivo: recorrido
// por pasos (orden → asignación → GPS → entrega → ticket → factura) que el
// visitante avanza con tabs, viendo cómo cada pieza alimenta a la siguiente.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ClipboardList, Zap, MapPin, PackageCheck, ScanLine, Receipt, ArrowRight, Layers } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK, STEEL, CREAM_LINE } from './comun'

function DemoRecorrido({ tx }) {
  const PASOS = [
    { i: ClipboardList, k: tx('Orden', 'Order'), t: tx('El cliente pide 500 tn de grava', 'The customer orders 500 t of gravel'), d: tx('Creas el trabajo con material, tarifas y destino (geocerca). El sistema genera las órdenes viaje por viaje.', 'You create the job with material, rates and destination (geofence). The system generates orders trip by trip.'), dato: 'JOB OBRA-41 · 500 tn · 20 viajes' },
    { i: Zap, k: tx('Asignación', 'Matching'), t: tx('El motor la ofrece al chofer correcto', 'The engine offers it to the right driver'), d: tx('Por tipo de camión, disponibilidad y trabajo. El chofer acepta desde su teléfono con pago estimado a la vista.', 'By truck type, availability and job. The driver accepts from their phone with estimated pay in sight.'), dato: 'JRV-0151 → C. Méndez · End Dump' },
    { i: MapPin, k: 'GPS', t: tx('Lo ves llegar, cargar y salir', 'You watch them arrive, load and leave'), d: tx('Las geocercas sellan cada hito con hora; el mapa muestra ruta y ETA para ti y para tu cliente.', 'Geofences stamp every milestone; the map shows route and ETA for you and your customer.'), dato: tx('En ruta · ETA 12 min', 'En route · ETA 12 min') },
    { i: ScanLine, k: 'Ticket', t: tx('El OCR lee la báscula', 'OCR reads the scale'), d: tx('Foto al ticket: bruto, tara y NETO real quedan en la orden y generan el BOL imprimible.', 'Snap the ticket: gross, tare and real NET land on the order and produce the printable BOL.'), dato: 'NET 24.75 tn · BOL #0151' },
    { i: PackageCheck, k: tx('Entrega', 'Delivery'), t: tx('El supervisor libera con su código', 'The supervisor releases with their code'), d: tx('Confirmación en sitio con código rotativo: nadie cierra un viaje que no se entregó.', 'On-site confirmation with a rotating code: nobody closes a trip that was not delivered.'), dato: tx('Entregada 7:38 AM · firmada', 'Delivered 7:38 AM · signed') },
    { i: Receipt, k: tx('Factura', 'Invoice'), t: tx('Cobras por el peso real', 'You bill the real weight'), d: tx('Factura al cliente, pago al transporte y al chofer — los tres del mismo número. El chofer puede cobrar con Fast Pay.', 'Customer invoice, carrier and driver pay — all three from the same number. The driver can cash out with Fast Pay.'), dato: '$532.13 · ' + tx('utilidad', 'profit') + ' $118.81' },
  ]
  const [i, setI] = useState(0)
  const p = PASOS[i]
  return (
    <div className="rounded-[20px] border p-4 sm:p-5" style={{ background: 'linear-gradient(160deg,#16294a,#101f38)', borderColor: 'rgba(201,162,75,.2)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
      <div className="f-mono mb-3 text-[12px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.55)' }}>{tx('Pruébalo tú: recorre un viaje completo', 'Try it: walk a full trip')}</div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PASOS.map((s, k) => (
          <button key={k} onClick={() => setI(k)} className="f-mono flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition"
            style={i === k ? { background: GOLD, color: NAVY_DEEP, borderColor: GOLD } : k < i ? { color: '#67c295', borderColor: 'rgba(63,157,107,.4)' } : { color: 'rgba(248,243,235,.6)', borderColor: 'rgba(248,243,235,.2)' }}>
            <s.i size={12} /> {s.k}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border p-5" style={{ background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.1)' }}>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}><p.i size={23} style={{ color: NAVY_DEEP }} /></span>
          <div>
            <div className="f-mono text-[10.5px] uppercase tracking-widest" style={{ color: GOLD }}>{tx('Paso', 'Step')} {i + 1} / {PASOS.length}</div>
            <div className="f-display text-[18px] font-semibold" style={{ color: CREAM }}>{p.t}</div>
          </div>
        </div>
        <p className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(248,243,235,.72)' }}>{p.d}</p>
        <div className="f-mono mt-3 inline-block rounded-lg px-3 py-1.5 text-[12px]" style={{ background: 'rgba(201,162,75,.12)', color: GOLD }}>{p.dato}</div>
      </div>
      <div className="mt-3.5 flex items-center justify-between">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}><div className="h-full rounded-full transition-all" style={{ width: `${((i + 1) / PASOS.length) * 100}%`, background: GOLD }} /></div>
        <button onClick={() => setI((i + 1) % PASOS.length)} className="ml-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold transition active:scale-95" style={{ background: GOLD, color: NAVY_DEEP }}>
          {i === PASOS.length - 1 ? tx('Otra vez', 'Again') : tx('Siguiente', 'Next')} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function GridFunciones({ tx }) {
  const F = [
    { path: '/asignacion', i: Zap, t: tx('Asignación automática', 'Automatic assignment'), d: tx('La orden encuentra sola a su chofer.', 'The order finds its own driver.') },
    { path: '/gps', i: MapPin, t: tx('GPS y geocercas', 'GPS & geofences'), d: tx('Cada camión en el mapa, con ETA.', 'Every truck on the map, with ETA.') },
    { path: '/app-chofer', i: Boxes, t: tx('App del chofer', 'Driver app'), d: tx('Una acción a la vez + Fast Pay.', 'One action at a time + Fast Pay.') },
    { path: '/facturacion', i: Receipt, t: tx('Facturación y tickets', 'Billing & tickets'), d: tx('BOL real y cobro por peso de báscula.', 'Real BOL and scale-weight billing.') },
    { path: '/roles', i: Layers, t: tx('Roles y multi-empresa', 'Roles & multi-company'), d: tx('Cada quien ve solo lo suyo.', 'Everyone sees only their part.') },
  ]
  return (
    <section className="wrap-pub py-20">
      <div className="f-mono mb-3 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Las piezas', 'The pieces')}</div>
      <h2 className="mb-10 max-w-[680px] text-[clamp(26px,3.2vw,38px)]" style={{ color: NAVY }}>{tx('Explora cada función a fondo', 'Explore each feature in depth')}</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {F.map((f) => (
          <Link key={f.path} to={f.path} className="group rounded-2xl border bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-lg" style={{ borderColor: CREAM_LINE }}>
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl" style={{ background: NAVY }}><f.i size={20} style={{ color: GOLD }} /></span>
            <h3 className="mb-1.5 text-[16.5px]" style={{ color: NAVY }}>{f.t}</h3>
            <p className="text-[13.5px] leading-relaxed" style={{ color: STEEL }}>{f.d}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: GOLD }}>{tx('Ver más', 'See more')} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function SistemaPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/sistema"
      hero={{
        migas: tx('El sistema completo', 'The full system'),
        icono: Boxes,
        titulo: <>{tx('Toda tu operación de granel, ', 'Your whole bulk operation, ')}<em className="not-italic" style={{ color: GOLD }}>{tx('conectada.', 'connected.')}</em></>,
        sub: tx('Del pedido del cliente a tu utilidad: pedido → asignación → GPS → entrega → ticket → factura, cada pieza alimenta a la siguiente sin recapturar nada. Un solo sistema, no cinco herramientas pegadas con cinta.', "From the customer's request to your profit: order → matching → GPS → delivery → ticket → invoice, each piece feeds the next with zero re-entry. One system, not five tools taped together."),
        visual: <DemoRecorrido tx={tx} />,
      }}
      pasos={{
        titulo: tx('Así se ve un día con MilePay', 'What a day with MilePay looks like'),
        items: [
          { icono: ClipboardList, t: tx('En la mañana', 'In the morning'), d: tx('Cargas los trabajos del día. Las órdenes salen solas a los choferes correctos mientras te tomas el café.', "Load the day's jobs. Orders go out to the right drivers by themselves while you drink your coffee.") },
          { icono: MapPin, t: tx('Durante el día', 'During the day'), d: tx('El mapa responde el "¿dónde va?" y las geocercas avisan cada carga y entrega. Los tickets entran por OCR.', 'The map answers "where is it?" and geofences report every load and delivery. Tickets come in via OCR.') },
          { icono: Receipt, t: tx('Al cerrar', 'At closing'), d: tx('Facturas por peso real, pagos cuadrados para transporte y choferes, y tu utilidad del día en el tablero.', "Invoices at real weight, squared payouts for carriers and drivers, and today's profit on your dashboard.") },
        ],
      }}
      metricas={[
        { n: '1', pct: 100, t: tx('sistema, no 5 herramientas', 'system, not 5 tools'), d: tx('Despacho, GPS, app, tickets y facturas.', 'Dispatch, GPS, app, tickets, invoices.') },
        { n: '0', pct: 100, t: tx('recapturas de datos', 'data re-entries'), d: tx('Cada dato se escribe UNA vez.', 'Every piece of data is entered ONCE.') },
        { n: '6', pct: 100, t: tx('roles conectados', 'connected roles'), d: tx('Oficina, planta, transporte, cliente y chofer.', 'Office, plant, carrier, customer and driver.') },
        { n: '24/7', pct: 100, t: tx('operando en la nube', 'running in the cloud'), d: tx('Desde el teléfono, la tablet o la PC.', 'From phone, tablet or PC.') },
      ]}
      extra={<GridFunciones tx={tx} />}
    />
  )
}
