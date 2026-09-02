// SITIO PÚBLICO · /app-chofer — App del chofer. Demo interactivo: un teléfono
// donde el visitante avanza el viaje (aceptar → llegar → cargar → entregar) y
// ve cambiar la pantalla y el pago como lo ve un chofer real (solo front-end).
import { useState } from 'react'
import { Smartphone, ScanLine, DollarSign, Zap, MapPin, CheckCircle2, Truck, RotateCcw } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK } from './comun'

const PASOS_VIAJE = 5 // aceptar → en planta → cargado → en obra → entregado

function DemoTelefono({ tx }) {
  const [paso, setPaso] = useState(0)
  const pagoBase = 118.75 // estimado a 25 tn
  const pagoReal = 117.56 // recalculado al peso OCR 24.75 tn
  const avanzar = () => setPaso((p) => Math.min(PASOS_VIAJE, p + 1))
  const etiquetas = [
    { btn: tx('ACEPTAR VIAJE', 'ACCEPT TRIP'), tit: tx('Nueva orden', 'New order'), det: tx('Grava · 25 tn est. · Planta Norte → Obra 41', 'Gravel · 25 t est. · Plant North → Site 41') },
    { btn: tx('LLEGUÉ A LA PLANTA', 'ARRIVED AT PLANT'), tit: tx('Ve a cargar', 'Go load'), det: tx('Planta Norte · 4 min · la geocerca marca tu llegada', 'Plant North · 4 min · the geofence stamps your arrival') },
    { btn: tx('ESCANEAR TICKET', 'SCAN TICKET'), tit: tx('Cargando', 'Loading'), det: tx('Apunta la cámara al ticket de báscula: el OCR lee el peso', 'Point the camera at the scale ticket: OCR reads the weight') },
    { btn: tx('LLEGUÉ A LA OBRA', 'ARRIVED AT SITE'), tit: tx('En ruta', 'En route'), det: tx('Ticket leído: 24.75 tn NETAS · tu pago se recalculó', 'Ticket read: 24.75 NET t · your pay was recalculated') },
    { btn: tx('ENTREGAR', 'DELIVER'), tit: tx('En destino', 'At site'), det: tx('El supervisor confirma con su código y quedas libre', 'The supervisor confirms with their code and you are free') },
    { btn: '', tit: tx('¡Viaje pagado!', 'Trip paid!'), det: tx('Cobra hoy mismo con Fast Pay a tu tarjeta de débito', 'Cash out today with Fast Pay to your debit card') },
  ]
  const e = etiquetas[paso]
  const pago = paso >= 3 ? pagoReal : pagoBase
  const pct = Math.round((paso / PASOS_VIAJE) * 100)
  return (
    <div className="mx-auto w-[280px] rounded-[34px] border p-[11px]" style={{ background: NAVY_DEEP, borderColor: 'rgba(201,162,75,.25)', boxShadow: '0 40px 70px -30px rgba(0,0,0,.6)' }}>
      <div className="flex h-[540px] flex-col overflow-hidden rounded-[26px]" style={{ background: CREAM }}>
        <div className="px-[18px] pb-4 pt-5 text-white" style={{ background: `linear-gradient(150deg,${NAVY},#1b3050)` }}>
          <div className="f-mono text-[11px]" style={{ color: 'rgba(248,243,235,.6)' }}>MilePay · {tx('Chofer', 'Driver')}</div>
          <div className="f-display mt-0.5 text-[18px] font-semibold">Carlos M.</div>
          <div className="mt-3 flex gap-1">
            {Array.from({ length: PASOS_VIAJE }).map((_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < paso ? GOLD : 'rgba(255,255,255,.18)' }} />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="rounded-2xl border bg-white p-3.5 text-center" style={{ borderColor: '#ece3d3' }}>
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: paso >= PASOS_VIAJE ? 'rgba(63,157,107,.12)' : 'rgba(201,162,75,.14)' }}>
              {paso >= PASOS_VIAJE ? <CheckCircle2 size={24} style={{ color: OK }} /> : paso === 2 ? <ScanLine size={24} style={{ color: '#a9863a' }} /> : <Truck size={24} style={{ color: '#a9863a' }} />}
            </div>
            <div className="f-display text-[17px] font-semibold" style={{ color: NAVY }}>{e.tit}</div>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: '#5b6b82' }}>{e.det}</p>
          </div>
          <div className="rounded-2xl p-3.5 text-white" style={{ background: 'linear-gradient(140deg,#2f8f5f,#256b48)' }}>
            <div className="f-mono text-[10.5px] opacity-80">{paso >= 3 ? tx('TU PAGO · peso real 24.75 tn', 'YOUR PAY · real weight 24.75 t') : tx('TU PAGO · estimado a 25 tn', 'YOUR PAY · estimated at 25 t')}</div>
            <div className="f-display mt-0.5 text-[26px] font-bold">${pago.toFixed(2)}</div>
            {paso >= 3 && <div className="f-mono mt-0.5 text-[10px] opacity-90">{tx('actualizado por el ticket OCR', 'updated from the OCR ticket')}</div>}
          </div>
          <div className="mt-auto">
            {paso < PASOS_VIAJE ? (
              <button onClick={avanzar} className="w-full rounded-2xl py-3.5 text-[14px] font-black transition active:scale-[0.98]" style={{ background: paso === 4 ? OK : GOLD, color: paso === 4 ? '#fff' : NAVY_DEEP }}>{e.btn}</button>
            ) : (
              <div className="flex flex-col gap-2">
                <button className="flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-black" style={{ background: GOLD, color: NAVY_DEEP }}><Zap size={15} /> {tx('Cobrar ahora · Fast Pay', 'Cash out now · Fast Pay')}</button>
                <button onClick={() => setPaso(0)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border py-2 text-[12px] font-bold" style={{ color: '#5b6b82', borderColor: '#ece3d3' }}><RotateCcw size={13} /> {tx('Repetir el viaje', 'Replay the trip')}</button>
              </div>
            )}
            <div className="f-mono mt-2 text-center text-[10px] uppercase tracking-wider" style={{ color: '#b7ae9d' }}>{pct}% · {tx('tócalo, avanza el viaje', 'tap it — advance the trip')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AppChoferPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/app-chofer"
      hero={{
        migas: tx('App del chofer', 'Driver app'),
        icono: Smartphone,
        titulo: <>{tx('Una pantalla, ', 'One screen, ')}<em className="not-italic" style={{ color: GOLD }}>{tx('una acción.', 'one action.')}</em></>,
        sub: tx('El chofer nunca duda qué sigue: la app le muestra UN paso a la vez — aceptar, llegar, escanear el ticket de báscula (OCR), entregar — y su pago se actualiza al peso real. Al final, cobra con Fast Pay a su tarjeta.', 'The driver never wonders what is next: the app shows ONE step at a time — accept, arrive, scan the scale ticket (OCR), deliver — and their pay updates to the real weight. At the end, they cash out with Fast Pay to their card.'),
        visual: <DemoTelefono tx={tx} />,
      }}
      pasos={{
        titulo: tx('Un viaje guiado de punta a punta', 'A guided trip end to end'),
        items: [
          { icono: Smartphone, t: tx('Recibe y acepta', 'Receive and accept'), d: tx('La oferta llega con material, ruta y pago estimado, y 2:00 para responder. Rechazar solo lo manda al final de la cola.', 'The offer arrives with material, route and estimated pay, and 2:00 to answer. Rejecting just sends them to the back of the cycle.') },
          { icono: ScanLine, t: tx('Escanea el ticket', 'Scan the ticket'), d: tx('Foto al ticket de báscula y el OCR lee bruto, tara y neto. Ese peso real manda: recalcula pago y cobro.', 'Snap the scale ticket and OCR reads gross, tare and net. That real weight rules: it recalculates pay and billing.') },
          { icono: DollarSign, t: tx('Entrega y cobra', 'Deliver and get paid'), d: tx('El supervisor libera con su código, el viaje queda pagable y el chofer puede cobrar al momento con Fast Pay.', 'The supervisor releases with their code, the trip becomes payable and the driver can cash out instantly with Fast Pay.') },
        ],
      }}
      metricas={[
        { n: '1', pct: 100, t: tx('acción visible a la vez', 'visible action at a time'), d: tx('Cero confusión manejando.', 'Zero confusion while driving.') },
        { n: 'OCR', pct: 95, t: tx('lee el ticket de báscula', 'reads the scale ticket'), d: tx('Sin teclear pesos ni perder papeles.', 'No typing weights, no lost paper.') },
        { n: '~30 min', pct: 90, t: tx('Fast Pay a su tarjeta', 'Fast Pay to their card'), d: tx('Cobra el viaje sin esperar la quincena.', 'Cash out without waiting for payday.') },
        { n: 'ES/EN', pct: 100, t: tx('bilingüe de fábrica', 'bilingual out of the box'), d: tx('Cada chofer elige su idioma.', 'Every driver picks their language.') },
      ]}
    />
  )
}
