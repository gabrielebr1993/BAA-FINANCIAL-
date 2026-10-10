// ============================================================================
// LANDING PÚBLICA de MilePay Freight (/freight) — v2, estilo nuevo del sitio.
//
// Reconstruida con los componentes compartidos del sitio público (comun.jsx):
// aurora de color de fondo, tarjetas de vidrio, hero navy con brillos de la
// paleta nueva y un TABLERO DE DESPACHO en vivo (simulado, rotando órdenes)
// como visual del hero. Conserva la esencia de la landing anterior: mover
// material sin planillas, asignación, GPS, app del chofer, roles, facturación,
// y la sección #demo. Botones de entrar → /elegir. ES/EN con useLangPub.
// ============================================================================
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Truck, MapPin, Smartphone, ReceiptText, Users, Workflow, ArrowRight } from 'lucide-react'
import { useTemaColor } from '../hooks/useTemaColor'
import {
  NAVY, NAVY_DEEP, GOLD, CREAM, STEEL, CSS_PUB,
  useLangPub, NavPub, FooterPub, BandaCTA, Metricas, Pasos,
} from './publico/comun'

// Tablero de despacho "en vivo" (demo visual, órdenes rotando).
const ORDENES = [
  { id: 'ORD-2314', mat: 'Arena lavada', dest: 'Obra Norte', estado: 'En ruta', pct: 72 },
  { id: 'ORD-2315', mat: 'Grava 3/4"', dest: 'Planta Este', estado: 'Cargando', pct: 28 },
  { id: 'ORD-2316', mat: 'Base granular', dest: 'Vialidad km 12', estado: 'Asignada', pct: 10 },
  { id: 'ORD-2317', mat: 'Arena sílica', dest: 'Obra Centro', estado: 'Ticket listo', pct: 100 },
  { id: 'ORD-2318', mat: 'Piedra #57', dest: 'Patio Sur', estado: 'En ruta', pct: 55 },
]
function TableroDespacho({ tx }) {
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }
    if (reduce) return undefined
    const id = setInterval(() => setPaso((p) => p + 1), 2400)
    return () => clearInterval(id)
  }, [])
  const visibles = [0, 1, 2, 3].map((i) => ORDENES[(paso + i) % ORDENES.length])
  const colorEstado = (e) => (e === 'En ruta' ? '#4a9c8c' : e === 'Cargando' ? GOLD : e === 'Ticket listo' ? '#37d67a' : '#8fa3c0')
  return (
    <div className="rounded-[22px] border p-5" style={{ background: 'rgba(13,26,48,.94)', borderColor: 'rgba(201,162,75,.35)', backdropFilter: 'blur(12px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)' }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="f-mono text-[11.5px] uppercase tracking-[.14em]" style={{ color: 'rgba(248,243,235,.55)' }}>{tx('Despacho en vivo · demo', 'Live dispatch · demo')}</span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: '#37d67a' }}><span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: '#37d67a' }} /> {tx('EN VIVO', 'LIVE')}</span>
      </div>
      <div className="space-y-2.5">
        {visibles.map((o) => (
          <div key={o.id} className="rounded-xl border p-3.5" style={{ background: 'rgba(255,255,255,.05)', borderColor: 'rgba(255,255,255,.1)' }}>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="f-mono font-semibold" style={{ color: CREAM }}>{o.id}</span>
              <span style={{ color: 'rgba(248,243,235,.65)' }}>{o.mat} → {o.dest}</span>
              <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: `${colorEstado(o.estado)}22`, color: colorEstado(o.estado) }}>{o.estado}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${o.pct}%`, background: `linear-gradient(90deg,${GOLD},#4a9c8c)` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-[11.5px]" style={{ color: 'rgba(248,243,235,.45)' }}>{tx('Así se ve tu operación: cada orden, camión y ticket en tiempo real.', 'This is your operation: every order, truck and ticket in real time.')}</div>
    </div>
  )
}

export default function LandingFreight() {
  const navigate = useNavigate()
  const { lang, fijar, tx } = useLangPub()
  useTemaColor('#f8f3eb')
  useEffect(() => {
    const prev = document.title
    document.title = 'MilePay Freight — Despacho para transporte de materiales a granel'
    window.scrollTo(0, 0)
    return () => { document.title = prev }
  }, [])

  const FUNCIONES = [
    { icono: Workflow, path: '/asignacion', t: tx('Asignación automática', 'Automatic assignment'), d: tx('Un trabajo, varios transportistas, cero cuellos de botella: la orden encuentra sola a su camión.', 'One job, multiple carriers, zero bottlenecks: the order finds its truck on its own.') },
    { icono: MapPin, path: '/gps', t: tx('GPS y geocercas', 'GPS & geofences'), d: tx('Sabes dónde está cada camión sin preguntar; llegadas y salidas se registran solas.', 'You know where every truck is without asking; arrivals and departures log themselves.') },
    { icono: Smartphone, path: '/app-chofer', t: tx('App del chofer', 'Driver app'), d: tx('Cualquier chofer la entiende en un minuto: viaje, ticket, foto y listo.', 'Any driver gets it in a minute: trip, ticket, photo, done.') },
    { icono: ReceiptText, path: '/facturacion', t: tx('Facturación y tickets', 'Billing & tickets'), d: tx('Del ticket con foto a la factura del cliente sin volver a escribir nada.', 'From photo ticket to customer invoice without retyping anything.') },
    { icono: Users, path: '/roles', t: tx('Roles y portales', 'Roles & portals'), d: tx('Cliente, despachador, transportista y chofer: cada quien ve exactamente lo suyo.', 'Customer, dispatcher, carrier and driver: everyone sees exactly their part.') },
    { icono: Truck, path: '/sistema', t: tx('El sistema completo', 'The full system'), d: tx('De la orden a la factura en un solo lugar, sin planillas de por medio.', 'From order to invoice in one place, with no spreadsheets in between.') },
  ]

  return (
    <div className="pub min-h-screen">
      <style>{CSS_PUB}</style>
      <div className="aurora-pub" aria-hidden="true"><span className="ap1" /><span className="ap2" /><span className="ap3" /></div>
      <NavPub lang={lang} fijar={fijar} tx={tx} activo="" />

      {/* HERO */}
      <header className="relative overflow-hidden pb-16 pt-[116px]" style={{ color: NAVY }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 500px at 82% 8%,rgba(201,162,75,.2),transparent 60%),radial-gradient(700px 600px at 5% 90%,rgba(196,127,90,.14),transparent 55%)' }} />
        <div className="wrap-pub relative grid items-center gap-[clamp(40px,5vw,90px)] lg:grid-cols-[1.05fr_1fr]">
          <div className="rev min-w-0">
            <div className="f-mono mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] uppercase tracking-[.14em]" style={{ borderColor: 'rgba(201,162,75,.35)', color: GOLD }}>
              <Truck size={13} /> {tx('Módulo Freight · materiales a granel', 'Freight module · bulk materials')}
            </div>
            <h1 className="mb-5 text-[clamp(34px,4.6vw,56px)] font-bold">{tx('Un sistema hecho para mover material, no para llenar planillas.', 'A system built to move material, not to fill out spreadsheets.')}</h1>
            <p className="mb-8 max-w-[560px] text-[18px] leading-relaxed" style={{ color: STEEL }}>
              {tx('Despacho de volteos en vivo: la orden se asigna sola, el GPS cuenta la historia, el chofer manda su ticket con foto y la factura sale en un clic.', 'Live dump-truck dispatch: orders assign themselves, GPS tells the story, drivers send photo tickets and the invoice is one click away.')}
            </p>
            <div className="flex flex-wrap items-center gap-3.5">
              <a href="#demo" className="rounded-[11px] px-7 py-[15px] text-[15.5px] font-semibold" style={{ background: GOLD, color: NAVY_DEEP, boxShadow: '0 10px 30px -10px rgba(201,162,75,.5)' }}>{tx('Solicitar demo', 'Request demo')}</a>
              <button onClick={() => navigate('/elegir')} className="inline-flex items-center gap-2 rounded-[11px] border px-6 py-[15px] text-[15.5px] font-semibold" style={{ color: NAVY, borderColor: 'rgba(19,35,63,.25)', background: 'transparent', cursor: 'pointer' }}>{tx('Iniciar sesión', 'Log in')} <ArrowRight size={15} /></button>
            </div>
          </div>
          <div className="rev min-w-0" style={{ animationDelay: '.15s' }}><TableroDespacho tx={tx} /></div>
        </div>
      </header>

      {/* FUNCIONES */}
      <section className="wrap-pub py-20" id="producto">
        <div className="f-mono mb-3 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Lo que hace', 'What it does')}</div>
        <h2 className="mb-12 max-w-[680px] text-[clamp(26px,3.2vw,38px)]" style={{ color: NAVY }}>{tx('Todo el despacho, de la orden a la factura.', 'The whole dispatch, from order to invoice.')}</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FUNCIONES.map((f) => (
            <Link key={f.path} to={f.path} className="group rounded-2xl border p-7 transition-transform hover:-translate-y-1"
              style={{ borderColor: 'rgba(255,255,255,.9)', background: 'rgba(255,255,255,.78)', backdropFilter: 'blur(10px)', boxShadow: '0 14px 40px rgba(19,35,63,.08)' }}>
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}><f.icono size={22} style={{ color: NAVY_DEEP }} /></span>
              <h3 className="mb-2 text-[18px]" style={{ color: NAVY }}>{f.t}</h3>
              <p className="text-[14.5px] leading-relaxed" style={{ color: STEEL }}>{f.d}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: GOLD }}>{tx('Ver cómo funciona', 'See how it works')} <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <Pasos
        tx={tx}
        titulo={tx('Tres pasos y el material está en la obra.', 'Three steps and the material is on site.')}
        pasos={[
          { icono: Workflow, t: tx('Entra la orden', 'The order comes in'), d: tx('Tu cliente pide material desde su portal (o tu despachador la crea en segundos).', 'Your customer requests material from their portal (or your dispatcher creates it in seconds).') },
          { icono: Truck, t: tx('Se asigna y se mueve', 'It gets assigned and moves'), d: tx('El sistema la empareja con el camión correcto; el GPS y las geocercas registran todo el viaje.', 'The system pairs it with the right truck; GPS and geofences log the whole trip.') },
          { icono: ReceiptText, t: tx('Ticket y factura', 'Ticket and invoice'), d: tx('El chofer sube el ticket con foto y la factura del viaje queda lista para cobrar.', 'The driver uploads the photo ticket and the trip invoice is ready to bill.') },
        ]}
      />

      {/* LO QUE GANAS */}
      <Metricas
        tx={tx}
        items={[
          { n: '1', t: tx('despachador para toda la flota', 'dispatcher for the whole fleet'), d: tx('La asignación automática hace el trabajo pesado.', 'Automatic assignment does the heavy lifting.'), pct: 90 },
          { n: '0', t: tx('llamadas de "¿dónde vas?"', '"where are you?" calls'), d: tx('El GPS responde antes de que pregunten.', 'GPS answers before anyone asks.'), pct: 100 },
          { n: '100%', t: tx('viajes con ticket y foto', 'trips with ticket and photo'), d: tx('Prueba de entrega en cada viaje, sin excepciones.', 'Proof of delivery on every trip, no exceptions.'), pct: 100 },
          { n: '1 clic', t: tx('de la orden a la factura', 'from order to invoice'), d: tx('Sin volver a capturar nada en planillas.', 'Without retyping anything into spreadsheets.'), pct: 95 },
        ]}
      />

      {/* DEMO */}
      <section id="demo">
        <BandaCTA tx={tx} />
      </section>

      <FooterPub tx={tx} />
    </div>
  )
}
